// SERVİS SONUÇLARI (yalnız okuma): "Servis sonuçları" ekranının verisi (arayuz/servis-sonuclari.js). Ekran sonuçlarından
// ayrıdır; kaynak servis_kosulari (her senaryo çalıştırması bir satır) ve servis_akis_kosulari (akışın her koşusu).
// - Servis koşusu: servis_kosulari'nda bir "toplu koşu" kimliği yoktur; aynı servisin aynı ortamdaki, art arda (bir önceki
//   satırın bitişinden en çok ARDISIKLIK_MS sonra) başlayan ve aynı senaryoyu ikinci kez içermeyen satırları bir koşu sayılır.
//   Akış adımlarının satırları servis koşularına karışmaz (akış koşusunun adımıdır).
// - Akış koşusu: servis_akis_kosulari satırı; adımlar (durum, süre, adımın servis koşusu kimliği) sonuc_json'dadır.
// - Hata kalıbı: başarısız / hata veren senaryonun ilk hata satırı, sayılar "#" olur (sonuclar/siniflandirma.mjs > kalipCikar).
// - Maskeleme: istek / yanıt kayıt anında maskelenir (servis-islemleri.mjs); rapor OKUNURKEN de adı gizli sayılan başlık,
//   XML öğesi ve JSON alanlarının değerleri maskelenir (Ayarlar > Güvenlik > Maskeleme ek adlarıyla; eski kayıtlar da korunur).
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
import { servisAkislariniListele, servisAkisKosusuGetir, servisKosusuGetir, servisleriListele } from '../servisler/servis-deposu.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { riskliOrtamMi, riskliSecimi } from '../guvenlik/ortam-riski.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { kalipCikar } from './siniflandirma.mjs';
import { yakalananMetniMaskele } from './yakalanan-mesajlar.mjs';
import { araliktaMi, sorgudanAralik } from './aralik.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ basarili: number; basarisiz: number; hata: number; atlanan: number; durduruldu: number }} Sayilar
 * @typedef {Sayilar & { id: string; tur: 'servis' | 'akis'; kaynakId: string | null; baslik: string; ortamId: string | null; ortam: string;
 *   calistirma: 'kosu' | 'dene'; baslangic: string; bitis: string; sureMs: number; toplam: number; satirlar: string[] }} KosuOzeti
 */

/** Aynı servis koşusu sayılmak için bir önceki senaryonun bitişinden sonra en çok bu kadar beklenir. */
const ARDISIKLIK_MS = 60_000;
const EN_COK_SATIR = 5000;
const EN_COK_AKIS_KOSUSU = 1000;
const EN_COK_KALIP_SATIRI = 400;
const MASKE = '***';

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d */
const secimli = (d) => (d === undefined || d === null || d === '' ? undefined : kimlik(d));
const bosSayilar = () => ({ basarili: 0, basarisiz: 0, hata: 0, atlanan: 0, durduruldu: 0 });
/** @param {string} iso @param {number} ms */
const sonra = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();

/**
 * Metinde adı gizli sayılan XML öğelerinin, JSON alanlarının ve "Ad: değer" satırlarının değerini maskeler.
 * @param {unknown} metin @param {ReadonlyArray<string>} ekler
 */
export function raporMetniniMaskele(metin, ekler) {
  if (typeof metin !== 'string' || !metin) return metin;
  return metin
    // <ns:Password>değer</ns:Password> (yalnız düz metin içerik; iç içe öğeler kendi adlarıyla değerlendirilir)
    .replace(/<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(\s[^<>]*)?>([^<]+)<\/\1?\2>/g,
      (tam, on = '', ad, oz = '', deger) => (gizliAdMi(ad, ekler) && deger.trim() && deger !== MASKE ? `<${on}${ad}${oz}>${MASKE}</${on}${ad}>` : tam))
    // "token": "değer"
    .replace(/"([^"\\]{1,80})"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g, (tam, ad, ara, deger) => (gizliAdMi(ad, ekler) && deger && deger !== MASKE ? `"${ad}"${ara}"${MASKE}"` : tam));
}

/** Başlık adı gizliyse değeri maskelenir (şema kalır: "Bearer ***"). @param {unknown} b @param {ReadonlyArray<string>} ekler */
function basliklariMaskele(b, ekler) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
  return Object.fromEntries(Object.entries(b).map(([a, d]) => {
    if (!gizliAdMi(a, ekler)) return [a, raporMetniniMaskele(d, ekler)];
    const sema = typeof d === 'string' ? /^(Bearer|Basic|Digest|Token)\s+/i.exec(d) : null;
    return [a, sema ? `${sema[1]} ${MASKE}` : MASKE];
  }));
}

/** Satırın hata metni: istek hatası, yoksa kalan kontroller. @param {Record<string, any>} sonuc */
function hataMetni(sonuc) {
  if (sonuc.hata) return String(sonuc.hata);
  const kalan = Array.isArray(sonuc.kontroller) ? sonuc.kontroller.filter((k) => k && !k.gecti) : [];
  // Sözleşme uyumsuzlukları yol bazında (alt satırlar) eklenir.
  const altlar = (/** @type {any} */ k) => (k.tur === 'sozlesme' && Array.isArray(k.alt) ? k.alt.map((/** @type {any} */ a) => `\n  ${a.ad}: ${a.aciklama ?? ''}`).join('') : '');
  if (kalan.length) return kalan.map((k) => `${k.ad}${k.aciklama ? ` — ${k.aciklama}` : ''}${altlar(k)}`).join('\n');
  return sonuc.durumKodu ? `HTTP ${sonuc.durumKodu}` : '';
}

/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId?: string; ortamId?: string; denemeler?: boolean }} f
 */
function servisSatirlari(vt, projeId, f) {
  const kosullar = ['proje_id = ?'];
  /** @type {string[]} */
  const degerler = [projeId];
  if (f.servisId) { kosullar.push('servis_id = ?'); degerler.push(f.servisId); }
  if (f.ortamId) { kosullar.push('ortam_id = ?'); degerler.push(f.ortamId); }
  if (!f.denemeler) kosullar.push("tur = 'kosu'");
  return vt.tumu(`SELECT id, servis_id, senaryo_id, ortam_id, tur, durum, baslangic, sure_ms, baslik FROM servis_kosulari
    WHERE ${kosullar.join(' AND ')} ORDER BY baslangic DESC LIMIT ${EN_COK_SATIR}`, degerler).reverse().map((s) => ({
    id: String(s.id), servisId: String(s.servis_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id),
    ortamId: s.ortam_id == null ? null : String(s.ortam_id), tur: String(s.tur), durum: String(s.durum),
    baslangic: String(s.baslangic), sureMs: Number(s.sure_ms) || 0, baslik: String(s.baslik)
  }));
}

/**
 * Akış koşuları (adımlarıyla). @param {Veritabani} vt @param {string} projeId
 * @param {{ akisId?: string; ortamId?: string; denemeler?: boolean }} f
 */
function akisKosulari(vt, projeId, f) {
  const kosullar = ['proje_id = ?'];
  /** @type {string[]} */
  const degerler = [projeId];
  if (f.akisId) { kosullar.push('akis_id = ?'); degerler.push(f.akisId); }
  if (f.ortamId) { kosullar.push('ortam_id = ?'); degerler.push(f.ortamId); }
  if (!f.denemeler) kosullar.push("tur = 'kosu'");
  return vt.tumu(`SELECT id FROM servis_akis_kosulari WHERE ${kosullar.join(' AND ')} ORDER BY baslangic DESC LIMIT ${EN_COK_AKIS_KOSUSU}`, degerler)
    .map((s) => servisAkisKosusuGetir(vt, String(s.id))).filter((k) => k !== undefined).reverse();
}

/** Tüm akış koşularının adım satırları (servis koşularına karışmasın). @param {Veritabani} vt @param {string} projeId */
export function akisAdimSatirlari(vt, projeId) {
  const idler = new Set();
  for (const k of akisKosulari(vt, projeId, { denemeler: true })) {
    for (const a of Array.isArray(k.sonuc.adimlar) ? k.sonuc.adimlar : []) if (a && a.kosuId) idler.add(String(a.kosuId));
  }
  return idler;
}

/**
 * Servis satırlarını koşulara böler (eskiden yeniye).
 * @param {ReturnType<typeof servisSatirlari>} satirlar @param {Map<string, string>} servisAdlari @param {Map<string, string>} ortamAdlari
 * @returns {KosuOzeti[]}
 */
function servisKosulariniGrupla(satirlar, servisAdlari, ortamAdlari) {
  /** @type {KosuOzeti[]} */
  const kosular = [];
  /** @type {Map<string, { k: KosuOzeti; senaryolar: Set<string>; bitisMs: number }>} */
  const acik = new Map();
  for (const s of satirlar) {
    const anahtar = `${s.servisId}|${s.ortamId ?? ''}|${s.tur}`;
    const basMs = new Date(s.baslangic).getTime();
    const bitisMs = basMs + s.sureMs;
    let g = acik.get(anahtar);
    // Veri koşuları (tablodan çoklu satır) aynı senaryonun farklı başlıklı ("Senaryo [satır]") çalıştırmalarıdır: aynı koşuda kalırlar.
    const senaryoAnahtari = s.senaryoId ? `${s.senaryoId}\u0000${s.baslik}` : `baslik:${s.baslik}`;
    if (!g || basMs - g.bitisMs > ARDISIKLIK_MS || g.senaryolar.has(senaryoAnahtari)) {
      g = {
        k: {
          id: `s-${s.id}`, tur: 'servis', kaynakId: s.servisId, baslik: servisAdlari.get(s.servisId) ?? 'Silinmiş servis',
          ortamId: s.ortamId, ortam: s.ortamId ? ortamAdlari.get(s.ortamId) ?? '—' : '—', calistirma: s.tur === 'dene' ? 'dene' : 'kosu',
          baslangic: s.baslangic, bitis: s.baslangic, sureMs: 0, toplam: 0, satirlar: [], ...bosSayilar()
        },
        senaryolar: new Set(), bitisMs
      };
      acik.set(anahtar, g);
      kosular.push(g.k);
    }
    g.senaryolar.add(senaryoAnahtari);
    g.bitisMs = Math.max(g.bitisMs, bitisMs);
    const k = g.k;
    k.satirlar.push(s.id);
    k.toplam++;
    if (s.durum === 'basarili') k.basarili++; else if (s.durum === 'hata') k.hata++; else k.basarisiz++;
    k.bitis = new Date(g.bitisMs).toISOString();
    k.sureMs = g.bitisMs - new Date(k.baslangic).getTime();
  }
  return kosular;
}

/**
 * @param {NonNullable<ReturnType<typeof servisAkisKosusuGetir>>} a @param {Map<string, string>} akisAdlari @param {Map<string, string>} ortamAdlari
 * @returns {KosuOzeti}
 */
function akisKosusuOzeti(a, akisAdlari, ortamAdlari) {
  const sayilar = bosSayilar();
  const adimlar = Array.isArray(a.sonuc.adimlar) ? a.sonuc.adimlar : [];
  for (const x of adimlar) {
    const d = String(x?.durum);
    if (d === 'basarili') sayilar.basarili++;
    else if (d === 'hata') sayilar.hata++;
    else if (d === 'atlandi') sayilar.atlanan++;
    else if (d === 'durduruldu') sayilar.durduruldu++;
    else sayilar.basarisiz++;
  }
  return {
    id: `a-${a.id}`, tur: 'akis', kaynakId: a.akisId, baslik: (a.akisId && akisAdlari.get(a.akisId)) || a.baslik || 'Akış',
    ortamId: a.ortamId, ortam: a.ortamId ? ortamAdlari.get(a.ortamId) ?? String(a.sonuc.ortam ?? '—') : String(a.sonuc.ortam ?? '—'),
    calistirma: a.tur === 'dene' ? 'dene' : 'kosu', baslangic: a.baslangic, bitis: sonra(a.baslangic, a.sureMs), sureMs: a.sureMs,
    toplam: adimlar.length, satirlar: adimlar.map((x) => (x && x.kosuId ? String(x.kosuId) : '')).filter(Boolean), ...sayilar
  };
}

/**
 * Süzgece uyan koşular (eskiden yeniye) ve yan listeler.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId?: string; akisId?: string; ortamId?: string; denemeler?: boolean }} f
 */
function kosulariTopla(vt, projeId, f) {
  const servisler = servisleriListele(vt, projeId);
  const akislar = servisAkislariniListele(vt, projeId);
  const ortamlar = ortamlariListele(vt, projeId);
  const servisAdlari = new Map(servisler.map((s) => [s.id, s.ad]));
  const akisAdlari = new Map(akislar.map((a) => [a.id, a.baslik]));
  const ortamAdlari = new Map(ortamlar.map((o) => [o.id, o.ad]));
  /** @type {KosuOzeti[]} */
  let kosular = [];
  if (!f.akisId) {
    const adimlar = akisAdimSatirlari(vt, projeId);
    kosular.push(...servisKosulariniGrupla(servisSatirlari(vt, projeId, f).filter((s) => !adimlar.has(s.id)), servisAdlari, ortamAdlari));
  }
  if (!f.servisId) kosular.push(...akisKosulari(vt, projeId, f).map((a) => akisKosusuOzeti(a, akisAdlari, ortamAdlari)));
  kosular = kosular.sort((a, b) => a.baslangic.localeCompare(b.baslangic));
  return { kosular, servisler, akislar, ortamlar };
}

/** Koşu sonucu metinden kısa özet (kartlar / trend). @param {KosuOzeti} k */
const disSayilar = (k) => ({ basarili: k.basarili, basarisiz: k.basarisiz, hata: k.hata, atlanan: k.atlanan, durduruldu: k.durduruldu });

/**
 * Hata kalıpları: süzgece uyan koşuların başarısız / hata veren senaryoları (en yeniler; en çok EN_COK_KALIP_SATIRI satır).
 * @param {Veritabani} vt @param {KosuOzeti[]} kosular (eskiden yeniye)
 */
function hataKaliplari(vt, kosular) {
  /** @type {Map<string, { kalip: string; sayi: number; senaryolar: Set<string>; kaynaklar: Set<string>; ilk: string; son: string;
   *   ornekler: Array<{ id: string; baslik: string; kaynak: string; zaman: string; kosuId: string; durum: string }> }>} */
  const harita = new Map();
  let okunan = 0;
  outer: for (const k of [...kosular].reverse()) {
    if (!k.basarisiz && !k.hata) continue;
    for (const satirId of k.satirlar) {
      if (okunan >= EN_COK_KALIP_SATIRI) break outer;
      const r = servisKosusuGetir(vt, satirId);
      if (!r || r.durum === 'basarili') continue;
      okunan++;
      const kalip = kalipCikar(hataMetni(r.sonuc));
      let g = harita.get(kalip);
      if (!g) { g = { kalip, sayi: 0, senaryolar: new Set(), kaynaklar: new Set(), ilk: r.baslangic, son: r.baslangic, ornekler: [] }; harita.set(kalip, g); }
      g.sayi++;
      g.senaryolar.add(r.senaryoId ?? `baslik:${r.baslik}`);
      g.kaynaklar.add(k.baslik);
      if (r.baslangic < g.ilk) g.ilk = r.baslangic;
      if (r.baslangic > g.son) g.son = r.baslangic;
      if (g.ornekler.length < 50) g.ornekler.push({ id: r.id, baslik: r.baslik, kaynak: k.baslik, zaman: r.baslangic, kosuId: k.id, durum: r.durum });
    }
  }
  return {
    incelenen: okunan,
    kaliplar: [...harita.values()].sort((a, b) => b.senaryolar.size - a.senaryolar.size || b.sayi - a.sayi || b.son.localeCompare(a.son))
      .map((g) => ({ kalip: g.kalip, sayi: g.sayi, senaryoSayisi: g.senaryolar.size, kaynaklar: [...g.kaynaklar], ilk: g.ilk, son: g.son, ornekler: g.ornekler }))
  };
}

/**
 * Koşuda yakalanan mesajlar (servis): ekran koşularındaki "Koşuda yakalanan mesajlar" ile aynı yapı (sonuclar/yakalanan-mesajlar.mjs),
 * ama kayıt tablosu yok — servis koşusunun (şifreli) sonucundan okunur. Senaryo GEÇSE de alınır:
 *   servis-hatasi — isteğin kendisi başarısız (bağlantı, zaman aşımı; sonuc.hata),
 *   servis-yaniti — yanıtta SOAP Fault ya da HTTP >= 400 (metin: kayıtta maskelenmiş yanıt özeti; yoksa "HTTP <kod>").
 * beklenen: senaryonun geçen bir kontrolü bu hatayı bekliyordu (soapHatasi ya da >= 400 durum kodu). Gruplama kaynak + kalıp;
 * önce beklenmeyen. En yeni EN_COK_KALIP_SATIRI satır okunur.
 * @param {Veritabani} vt @param {KosuOzeti[]} kosular (eskiden yeniye)
 */
function yakalananServisMesajlari(vt, kosular) {
  const ekler = ekGizliAdlar(vt);
  /** @type {Map<string, { kaynak: string; kalip: string; ornekMetin: string; sayi: number; beklenenSayisi: number; senaryolar: Set<string>;
   *   ilk: string; son: string; ornekler: Array<{ id: string; baslik: string; kaynak: string; zaman: string; kosuId: string; durum: string; beklenen: boolean }> }>} */
  const harita = new Map();
  /** @type {Record<string, number>} */
  const kaynaklar = { 'servis-hatasi': 0, 'servis-yaniti': 0 };
  let okunan = 0;
  outer: for (const k of [...kosular].reverse()) {
    for (const satirId of k.satirlar) {
      if (okunan >= EN_COK_KALIP_SATIRI) break outer;
      const r = servisKosusuGetir(vt, satirId);
      if (!r) continue;
      okunan++;
      const s = /** @type {Record<string, any>} */ (r.sonuc ?? {});
      const kontroller = Array.isArray(s.kontroller) ? s.kontroller : [];
      const kod = Number(s.durumKodu) || 0;
      const fault = kontroller.some((x) => x && typeof x.aciklama === 'string' && x.aciklama.startsWith('SOAP hatası:'));
      /** @type {string | null} */
      let kaynak = null;
      let ham = '';
      if (s.hata) { kaynak = 'servis-hatasi'; ham = String(s.hata); }
      else if (fault || kod >= 400) { kaynak = 'servis-yaniti'; ham = String(s.ozet ?? '').trim() || `HTTP ${kod}`; }
      if (!kaynak) continue;
      const metin = yakalananMetniMaskele(raporMetniniMaskele(ham, ekler), { ekAdlar: ekler });
      if (!metin) continue;
      const beklenen = kontroller.some((x) => x && x.gecti && (x.tur === 'soapHatasi' || (x.tur === 'durumKodu' && kod >= 400)));
      const kalip = kalipCikar(metin);
      const anahtar = `${kaynak}\u0000${kalip}`;
      let g = harita.get(anahtar);
      if (!g) { g = { kaynak, kalip, ornekMetin: metin, sayi: 0, beklenenSayisi: 0, senaryolar: new Set(), ilk: r.baslangic, son: r.baslangic, ornekler: [] }; harita.set(anahtar, g); }
      g.sayi++;
      kaynaklar[kaynak]++;
      if (beklenen) g.beklenenSayisi++;
      g.senaryolar.add(r.senaryoId ?? `baslik:${r.baslik}`);
      if (r.baslangic < g.ilk) g.ilk = r.baslangic;
      if (r.baslangic > g.son) g.son = r.baslangic;
      if (g.ornekler.length < 50) g.ornekler.push({ id: r.id, baslik: r.baslik, kaynak: k.baslik, zaman: r.baslangic, kosuId: k.id, durum: r.durum, beklenen });
    }
  }
  const kaliplar = [...harita.values()].map((g) => ({
    kaynak: g.kaynak, kalip: g.kalip, ornekMetin: g.ornekMetin, sayi: g.sayi, beklenen: g.beklenenSayisi === g.sayi, beklenenSayisi: g.beklenenSayisi,
    beklenmeyenSayisi: g.sayi - g.beklenenSayisi, senaryoSayisi: g.senaryolar.size, ilk: g.ilk, son: g.son, ornekler: g.ornekler
  })).sort((a, b) => Number(a.beklenen) - Number(b.beklenen) || b.sayi - a.sayi || b.son.localeCompare(a.son));
  return { incelenen: okunan, toplam: kaliplar.reduce((t, x) => t + x.sayi, 0), beklenmeyen: kaliplar.reduce((t, x) => t + x.beklenmeyenSayisi, 0), kaynaklar, kaliplar };
}

/**
 * GET /platform/servis-sonuclari?projeId=&servisId=&akisId=&ortamId=&denemeler=1&baslangic=&bitis=(|&gun=)
 * Kartlar, trend, koşu geçmişi ve kalıplar aralıktaki koşulardan (başlangıç zamanı); sol listedeki son durum aralıktan bağımsızdır.
 * @param {Veritabani} vt @param {URLSearchParams} q
 */
export function servisSonucOzeti(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const servisId = secimli(q.get('servisId'));
  const akisId = secimli(q.get('akisId'));
  const ortamId = secimli(q.get('ortamId'));
  const denemeler = q.get('denemeler') === '1';
  if (servisId && akisId) throw new DepoHatasi('Servis ya da akış seçin (ikisi birden değil).');
  const tumu = kosulariTopla(vt, projeId, { denemeler, ...(ortamId ? { ortamId } : {}) });
  const { servisler, akislar, ortamlar } = tumu;
  if (servisId && !servisler.some((s) => s.id === servisId)) throw new DepoHatasi('Servis bulunamadı.');
  if (akisId && !akislar.some((a) => a.id === akisId)) throw new DepoHatasi('Akış bulunamadı.');
  const aralik = sorgudanAralik(q);
  const kosular = tumu.kosular.filter((k) => araliktaMi(k.baslangic, aralik)
    && (servisId ? k.tur === 'servis' && k.kaynakId === servisId : akisId ? k.tur === 'akis' && k.kaynakId === akisId : true));
  // Sol liste: her servisin / akışın (ortam süzgecine göre) son koşusunun durumu.
  /** @type {Map<string, KosuOzeti>} */
  const sonlar = new Map();
  for (const k of tumu.kosular) if (k.kaynakId) sonlar.set(`${k.tur}:${k.kaynakId}`, k);
  const sonDurum = (/** @type {KosuOzeti | undefined} */ k) => (k ? { ...disSayilar(k), toplam: k.toplam, baslangic: k.baslangic } : null);
  const kaliplar = hataKaliplari(vt, kosular);
  return {
    servisler: servisler.map((s) => ({ id: s.id, ad: s.ad, durum: s.durum, son: sonDurum(sonlar.get(`servis:${s.id}`)) })),
    akislar: akislar.map((a) => ({ id: a.id, baslik: a.baslik, tur: a.tur, son: sonDurum(sonlar.get(`akis:${a.id}`)) })),
    ortamlar: ortamlar.map((o) => ({ id: o.id, ad: o.ad, riskli: riskliSecimi(o), canli: riskliOrtamMi(o) })),
    kosular: kosular.reverse().map(({ satirlar, ...k }) => k),
    kaliplar: kaliplar.kaliplar, kalipIncelenen: kaliplar.incelenen, aralik,
    // Koşuda yakalanan mesajlar (geçen senaryolar dahil; önce beklenmeyen) — ekran sonuçlarındaki ikinci küme ile aynı yapı.
    yakalananMesajlar: yakalananServisMesajlari(vt, kosular),
    // Aralıktan bağımsız koşu var mı (boş durum metni: "hiç koşu yok" / "bu aralıkta yok").
    kosuVar: tumu.kosular.some((k) => (servisId ? k.tur === 'servis' && k.kaynakId === servisId : akisId ? k.tur === 'akis' && k.kaynakId === akisId : true))
  };
}

/**
 * GET /platform/servis-sonuclari/kosu?projeId=&id=  (id: "s-<ilk satır>" servis koşusu | "a-<akış koşusu>")
 * @param {Veritabani} vt @param {URLSearchParams} q
 */
export function servisSonucKosusu(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const id = String(q.get('id') ?? '');
  const eslesme = /^([sa])-([A-Za-z0-9_-]{1,100})$/.exec(id);
  if (!eslesme) throw new DepoHatasi('"id" geçersiz.');
  const [, tur, kaynak] = eslesme;
  if (tur === 'a') {
    const a = servisAkisKosusuGetir(vt, kaynak);
    if (!a || a.projeId !== projeId) throw new DepoHatasi('Akış koşusu bulunamadı.');
    const akislar = servisAkislariniListele(vt, projeId);
    const ortamlar = ortamlariListele(vt, projeId);
    const kosu = akisKosusuOzeti(a, new Map(akislar.map((x) => [x.id, x.baslik])), new Map(ortamlar.map((o) => [o.id, o.ad])));
    const { satirlar, ...ozet } = kosu;
    const ekler = ekGizliAdlar(vt);
    const adimlar = (Array.isArray(a.sonuc.adimlar) ? a.sonuc.adimlar : []).map((/** @type {Record<string, any>} */ x) => ({
      no: Number(x.no) || 0, ad: String(x.ad ?? ''), servis: String(x.servis ?? ''), senaryo: String(x.senaryo ?? ''), durum: String(x.durum ?? ''),
      sureMs: Number(x.sureMs) || 0, satirId: x.kosuId ? String(x.kosuId) : null, hata: x.neden ? String(x.neden) : '', ...(x.not ? { not: String(x.not) } : {}),
      okunanlar: x.okunanlar && typeof x.okunanlar === 'object'
        ? Object.fromEntries(Object.entries(x.okunanlar).map(([ad, d]) => [ad, gizliAdMi(ad, ekler) ? MASKE : String(d)])) : undefined
    }));
    return { kosu: { ...ozet, ozet: String(a.sonuc.ozet ?? ''), durduruldu: Boolean(a.sonuc.durduruldu) }, senaryolar: [], adimlar };
  }
  const ilk = servisKosusuGetir(vt, kaynak);
  if (!ilk || ilk.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı.');
  const servisler = servisleriListele(vt, projeId);
  const ortamlar = ortamlariListele(vt, projeId);
  const adimlar = akisAdimSatirlari(vt, projeId);
  const gruplar = servisKosulariniGrupla(
    servisSatirlari(vt, projeId, { servisId: ilk.servisId, denemeler: ilk.tur === 'dene', ...(ilk.ortamId ? { ortamId: ilk.ortamId } : {}) })
      .filter((s) => !adimlar.has(s.id) && (s.ortamId ?? '') === (ilk.ortamId ?? '') && s.tur === ilk.tur),
    new Map(servisler.map((s) => [s.id, s.ad])), new Map(ortamlar.map((o) => [o.id, o.ad])));
  const kosu = gruplar.find((g) => g.id === id) ?? gruplar.find((g) => g.satirlar.includes(kaynak));
  if (!kosu) throw new DepoHatasi('Koşu bulunamadı.');
  const { satirlar, ...ozet } = kosu;
  const senaryolar = satirlar.map((sid) => servisKosusuGetir(vt, sid)).filter((r) => r !== undefined).map((r) => ({
    satirId: r.id, senaryoId: r.senaryoId, baslik: r.baslik, durum: r.durum, sureMs: r.sureMs, baslangic: r.baslangic,
    durumKodu: typeof r.sonuc.durumKodu === 'number' ? r.sonuc.durumKodu : null, hata: r.durum === 'basarili' ? '' : hataMetni(r.sonuc),
    durduruldu: Boolean(r.sonuc.durduruldu),
    // Veri koşusu (tablodan çoklu satır): anahtar / ad; tekrar koşusunun kaynağı.
    veriAnahtari: r.sonuc.veriKosusu && typeof r.sonuc.veriKosusu.anahtar === 'string' ? r.sonuc.veriKosusu.anahtar : null,
    veriKosusu: r.sonuc.veriKosusu && typeof r.sonuc.veriKosusu.ad === 'string' ? r.sonuc.veriKosusu.ad : null,
    tekrarKaynagi: typeof r.sonuc.tekrarKaynagi === 'string' ? r.sonuc.tekrarKaynagi : null
  }));
  // "Tekrar: <önceki koşu>" (başarısızları tekrar çalıştırmayla başlatıldıysa).
  const tekrarKaynagi = senaryolar.map((x) => x.tekrarKaynagi).find(Boolean) ?? null;
  return { kosu: { ...ozet, id: kosu.id, tekrarKaynagi }, senaryolar, adimlar: [] };
}

/**
 * GET /platform/servis-sonuclari/senaryo?projeId=&id=<servis koşusu satırı>: istek / yanıt (maskeli), kontroller.
 * @param {Veritabani} vt @param {URLSearchParams} q
 */
export function servisSonucSenaryosu(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const r = servisKosusuGetir(vt, kimlik(q.get('id')));
  if (!r || r.projeId !== projeId) throw new DepoHatasi('Senaryo sonucu bulunamadı.');
  const ekler = ekGizliAdlar(vt);
  const servis = servisleriListele(vt, projeId).find((s) => s.id === r.servisId);
  const ortam = r.ortamId ? ortamlariListele(vt, projeId).find((o) => o.id === r.ortamId) : undefined;
  const s = r.sonuc;
  return {
    sonuc: {
      id: r.id, servisId: r.servisId, servis: servis?.ad ?? 'Silinmiş servis', senaryoId: r.senaryoId, baslik: r.baslik, durum: r.durum,
      calistirma: r.tur, ortamId: r.ortamId, ortam: ortam?.ad ?? (typeof s.ortam === 'string' ? s.ortam : '—'), baslangic: r.baslangic, sureMs: r.sureMs,
      durumKodu: typeof s.durumKodu === 'number' ? s.durumKodu : null, adres: typeof s.adres === 'string' ? raporMetniniMaskele(s.adres, ekler) : null,
      hata: typeof s.hata === 'string' ? raporMetniniMaskele(s.hata, ekler) : null, durduruldu: Boolean(s.durduruldu),
      ozet: typeof s.ozet === 'string' ? raporMetniniMaskele(s.ozet, ekler) : '',
      kontroller: Array.isArray(s.kontroller) ? s.kontroller : [],
      istek: raporMetniniMaskele(s.istek, ekler) ?? null, istekBasliklari: basliklariMaskele(s.istekBasliklari, ekler) ?? null,
      yanit: raporMetniniMaskele(s.yanit, ekler) ?? null,
      okunanlar: s.okunanlar && typeof s.okunanlar === 'object'
        ? Object.fromEntries(Object.entries(s.okunanlar).map(([ad, d]) => [ad, gizliAdMi(ad, ekler) ? MASKE : String(d)])) : null,
      akis: s.akis && typeof s.akis === 'object' ? { akisId: s.akis.akisId ?? null, akisBaslik: String(s.akis.akisBaslik ?? ''), adimNo: Number(s.akis.adimNo) || null, adimAd: String(s.akis.adimAd ?? '') } : null,
      oturum: s.oturum && typeof s.oturum === 'object' ? { akis: String(s.oturum.akis ?? ''), durum: String(s.oturum.durum ?? '') } : null,
      yetkiTekrari: s.yetkiTekrari && typeof s.yetkiTekrari === 'object' ? { not: String(s.yetkiTekrari.not ?? '') } : null,
      // Çalışan kurtarma kuralının notu (kurtarılan çağrı başarılı sayılır; not görünür kalır).
      kurtarma: s.kurtarma && typeof s.kurtarma === 'object' ? { kural: String(s.kurtarma.kural ?? ''), durum: String(s.kurtarma.durum ?? ''), not: raporMetniniMaskele(String(s.kurtarma.not ?? ''), ekler) ?? '' } : null,
      // Doğrulanan dosyaların özeti (içerik dönmez; saklandıysa /platform/servis-sonuclari/dosya ile alınır).
      dosyalar: Array.isArray(s.dosyalar) ? s.dosyalar.map((/** @type {any} */ d, /** @type {number} */ sira) => ({
        sira, ad: String(d.ad ?? 'dosya'), bicim: String(d.bicim ?? ''), boyut: Number(d.boyut) || 0, gecti: d.gecti === true, saklandi: typeof d.icerikBase64 === 'string'
      })) : []
    }
  };
}

/** Biçim → içerik türü (tarayıcıda indirilen dosyanın türü). @type {Record<string, string>} */
const DOSYA_ICERIK_TURLERI = {
  csv: 'text/csv', metin: 'text/plain', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/**
 * GET /platform/servis-sonuclari/dosya?projeId=&id=<servis koşusu satırı>&sira=<n>: saklanan doğrulanan dosya (Ayarlar > Koşu > Kayıt >
 * "Doğrulanan dosya" izin verdiyse). Şifreli koşu kaydından çözülür ve yanıtta döner; sunucu diske YAZMAZ (tarayıcı indirir).
 * Dosya ham hâliyle döner (gizli içerik maskelenmez; arayüz indirmeden önce onay ister).
 * @param {Veritabani} vt @param {URLSearchParams} q
 */
export function servisSonucDosyasi(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const r = servisKosusuGetir(vt, kimlik(q.get('id')));
  if (!r || r.projeId !== projeId) throw new DepoHatasi('Senaryo sonucu bulunamadı.');
  const sira = Number(q.get('sira'));
  const d = Array.isArray(r.sonuc.dosyalar) && Number.isInteger(sira) ? r.sonuc.dosyalar[sira] : undefined;
  if (!d || typeof d.icerikBase64 !== 'string') throw new DepoHatasi('Bu sonuçta dosyanın kendisi saklanmadı (yalnız özet). Ayarlar > Koşu > Kayıt > "Doğrulanan dosya".');
  return { dosya: { ad: String(d.ad ?? 'dosya'), icerikTuru: DOSYA_ICERIK_TURLERI[String(d.bicim)] ?? 'application/octet-stream', icerikBase64: d.icerikBase64 } };
}

/** sunucu-platform.mjs GET_UCLARI'na eklenir (yalnız okuma; kasa açık olmalı — sunucu denetler). */
/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SERVIS_SONUC_UCLARI = [
  ['/platform/servis-sonuclari', servisSonucOzeti],
  ['/platform/servis-sonuclari/kosu', servisSonucKosusu],
  ['/platform/servis-sonuclari/senaryo', servisSonucSenaryosu],
  ['/platform/servis-sonuclari/dosya', servisSonucDosyasi]
];
