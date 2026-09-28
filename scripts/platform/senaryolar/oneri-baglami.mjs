// SENARYO TASARIM YARDIMCISI — sunucu tarafı bağlam (GET /platform/senaryo/oneri-baglami). Önerileri tarayıcıdaki saf fonksiyon
// üretir (senaryo-onerileri.mjs); burada yalnızca OKUMA var:
//  · formun bağlamı (model, alt modeller, tablo bağlantıları),
//  · aynı ekranın seçili ortamda tanımlı, aynı akıştaki senaryoları (veri, satır seçimleri, son sonucun durumu) — taban + kapsam,
//  · ekranın DİĞER akışlarındaki senaryolar (yalnız kapsam: "zaten denendi mi"),
//  · veri güdümlü senaryoların satır değerleri (tablo başvurularının çözülmüş, GİZLİ OLMAYAN sütun değerleri; her veri koşusu ayrı),
//  · geçmiş: son HATA_GUNU gündeki başarısız sonuçlar (senaryo + hatanın alındığı adım) ve son UYARI_GUNU günde koşularda görülen
//    iş kuralı uyarıları (hata göstergesi / diyalog; maskeli metin, beklenen mi, tetikleyen senaryolar),
//  · kullanıcının öneri kararları (ayarlar/oneri-kararlari.mjs).
// Hiçbir şey yazılmaz.
import { formBaglami, senaryoDetayi, senaryoSonSonucu } from './senaryo-servisi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { basvuruyuCoz, degerBasvurusu } from '../tablolar/tablo-secimi.mjs';
import { basvuruGruplari, veriKosulariniAc } from '../tablolar/veri-kosulari.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { yakalananMetniMaskele } from '../sonuclar/yakalanan-mesajlar.mjs';
import { oneriKararlariniOku } from '../ayarlar/oneri-kararlari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */

/** Başarısız sonuçların bakıldığı gün sayısı. */
export const HATA_GUNU = 14;
/** Görülen uyarıların bakıldığı gün sayısı. */
export const UYARI_GUNU = 90;
/** Senaryo başına en çok veri koşusu satırı (kapsam için). */
const EN_COK_DEGER_SATIRI = 50;
/** İş kuralı uyarısı sayılan yakalama kaynakları. */
const UYARI_KAYNAKLARI = ['hata-gostergesi', 'diyalog'];


/**
 * Veri güdümlü senaryonun satır değerleri: her veri koşusu (yoksa tek satır) için başvurulu alanların çözülmüş değerleri. Gizli
 * sütunlar ve çözülemeyen başvurular atlanır. Başvurusu olmayan senaryoda null.
 * @param {Nesne} veri @param {Nesne | null} veriKosulari @param {Record<string, Record<string, string>> | null} tabloSecimleri
 * @param {any[]} tablolar @param {string} ortamId
 */
function degerSatirlari(veri, veriKosulari, tabloSecimleri, tablolar, ortamId) {
  const basvurulu = Object.entries(veri).filter(([, v]) => degerBasvurusu(v));
  if (!basvurulu.length) return null;
  const gruplar = basvuruGruplari(veri, tablolar);
  const acik = veriKosulariniAc(/** @type {any} */ (veriKosulari), { tablolar, gruplar, ortamId, tabloSecimleri });
  const sabitler = acik.kosular.length ? acik.kosular.slice(0, EN_COK_DEGER_SATIRI).map((k) => k.satirlar) : [null];
  const satirlar = [];
  for (const sabit of sabitler) {
    /** @type {Nesne} */
    const satir = {};
    for (const [anahtar, v] of basvurulu) {
      const b = degerBasvurusu(v);
      if (!b) continue;
      const r = basvuruyuCoz(tablolar, b, tabloSecimleri ?? undefined, ortamId, sabit ? /** @type {any} */ ({ sabit }) : undefined);
      if ('deger' in r && !r.sutun.gizli) satir[anahtar] = r.deger;
    }
    if (Object.keys(satir).length) satirlar.push(satir);
  }
  return satirlar.length ? satirlar : null;
}

/**
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {string | null} [akisId]
 * @param {Date} [simdi]
 */
export function oneriBaglami(vt, projeId, ekranId, ortamId, akisId = null, simdi = new Date()) {
  const form = formBaglami(vt, projeId, ekranId, ortamId, akisId);
  if (!form.model) return { ...form, senaryolar: [], kapsamSenaryolari: [], gecmis: { hataGunu: HATA_GUNU, uyariGunu: UYARI_GUNU, hatalar: [], uyarilar: [] }, kararlar: [] };
  const akislar = form.akislar || [];
  const varsayilan = akislar[0] ? akislar[0].id : null;
  /** @type {any[] | null} */
  let tablolar = null;
  const tablolariAl = () => (tablolar ??= tablolariListele(vt, projeId));
  /** @type {Array<{ id: string; baslik: string; veri: Record<string, unknown>; tabloSecimleri: unknown; sonDurum: string | null; degerSatirlari?: Nesne[] }>} */
  const senaryolar = [];
  /** @type {Array<{ id: string; baslik: string; veri: Record<string, unknown>; degerSatirlari?: Nesne[] }>} */
  const kapsamSenaryolari = [];
  for (const r of vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY rowid', [projeId, ekranId])) {
    const d = senaryoDetayi(vt, String(r.id), ortamId);
    if (!d.ortamlar.includes(ortamId) || !d.veri) continue;
    const akis = d.akis && akislar.some((a) => a.id === d.akis) ? d.akis : varsayilan;
    const satirlar = degerSatirlari(d.veri, d.veriKosulari, /** @type {any} */ (d.tabloSecimleri), tablolariAl(), ortamId);
    const ek = satirlar ? { degerSatirlari: satirlar } : {};
    if (akis !== form.akisId) { kapsamSenaryolari.push({ id: d.id, baslik: d.baslik, veri: d.veri, ...ek }); continue; }
    const son = senaryoSonSonucu(vt, d.id, ortamId);
    senaryolar.push({ id: d.id, baslik: d.baslik, veri: d.veri, tabloSecimleri: d.tabloSecimleri, sonDurum: son ? son.durum : null, ...ek });
  }
  return { ...form, senaryolar, kapsamSenaryolari, gecmis: oneriGecmisi(vt, projeId, ekranId, ortamId, simdi), kararlar: oneriKararlariniOku(vt, projeId) };
}

/**
 * Ekranın koşu geçmişi (bu ortam ya da ortamı bilinmeyen koşular): başarısız sonuçlar (senaryo + hatanın alındığı ilk adım) ve görülen
 * iş kuralı uyarıları (kalıba göre gruplu; metin Ayarlar > Maskeleme ek adlarıyla yeniden maskelenir).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {Date} simdi
 */
export function oneriGecmisi(vt, projeId, ekranId, ortamId, simdi) {
  const once = (gun) => new Date(simdi.getTime() - gun * 86_400_000).toISOString();
  const hatalar = vt.tumu(
    `SELECT r.senaryo_id, (SELECT a.ad FROM adim_sonuclari a WHERE a.sonuc_id = r.id AND a.durum = 'basarisiz' ORDER BY a.sira LIMIT 1) AS adim, COUNT(*) AS sayi
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE k.proje_id = ? AND r.ekran_id = ? AND r.durum = 'basarisiz' AND (k.ortam_id = ? OR k.ortam_id IS NULL)
        AND COALESCE(r.bitis, k.bitis, k.baslangic) >= ?
      GROUP BY r.senaryo_id, adim`, [projeId, ekranId, ortamId, once(HATA_GUNU)]
  ).map((h) => ({ senaryoId: h.senaryo_id == null ? null : String(h.senaryo_id), adim: h.adim == null ? null : String(h.adim), sayi: Number(h.sayi) || 0 }));
  const satirlar = vt.tumu(
    `SELECT m.metin, m.kalip, m.adim, m.sayi, m.beklenen, r.senaryo_id
       FROM yakalanan_mesajlar m JOIN kosu_sonuclari r ON r.id = m.sonuc_id JOIN kosular k ON k.id = r.kosu_id
      WHERE k.proje_id = ? AND r.ekran_id = ? AND m.kaynak IN (${UYARI_KAYNAKLARI.map(() => '?').join(', ')}) AND (k.ortam_id = ? OR k.ortam_id IS NULL)
        AND COALESCE(r.bitis, k.bitis, k.baslangic) >= ?
      ORDER BY COALESCE(r.bitis, k.bitis, k.baslangic), m.sira`, [projeId, ekranId, ...UYARI_KAYNAKLARI, ortamId, once(UYARI_GUNU)]
  );
  const ekAdlar = satirlar.length ? ekGizliAdlar(vt) : [];
  /** @type {Map<string, { metin: string; adim: string | null; sayi: number; beklenen: boolean; senaryoIdleri: string[] }>} */
  const gruplar = new Map();
  for (const s of satirlar) {
    const kalip = String(s.kalip);
    const g = gruplar.get(kalip) ?? { metin: '', adim: null, sayi: 0, beklenen: false, senaryoIdleri: [] };
    gruplar.set(kalip, g);
    g.metin = yakalananMetniMaskele(String(s.metin), { ekAdlar });
    if (s.adim != null) g.adim = String(s.adim);
    g.sayi += Math.max(1, Number(s.sayi) || 1);
    if (Number(s.beklenen) === 1) g.beklenen = true;
    if (s.senaryo_id != null && !g.senaryoIdleri.includes(String(s.senaryo_id))) g.senaryoIdleri.push(String(s.senaryo_id));
  }
  const uyarilar = [...gruplar.values()].filter((g) => g.metin).sort((a, b) => b.sayi - a.sayi).slice(0, 50);
  return { hataGunu: HATA_GUNU, uyariGunu: UYARI_GUNU, hatalar, uyarilar };
}

