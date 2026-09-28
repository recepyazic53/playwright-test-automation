// EKRAN SENARYOLARINDA DÜZ DEĞER → TABLO BAŞVURUSU (kullanıcı onayıyla). Ekranın alanı bir test verisi tablosunun sütununa
// bağlıysa (ekran-baglari.mjs) ve senaryoda o alanın değeri düz metin / sayı / evet-hayır ise, değer tablonun bir satırında
// bulunuyorsa ${Tablo.Sütun} (etiketli bağda ${Tablo[etiket].Sütun}) başvurusuna çevrilir. Gerekirse o satırı seçecek satır
// seçimi (icerik.tabloSecimleri; çözümleyicinin okuduğu biçim) de yazılır. KURAL: koşuda ekrana giden değer ÖNCEKİYLE AYNI
// kalmalıdır — plan, senaryonun her ortamında koşu çözümleyicisini (ekran-basvurulari.mjs ekranBasvurulariniCoz) çalıştırıp
// çözülen değeri eski değerle karşılaştırır; ortama özel satırlar yüzünden bir ortamda farklılaşıyorsa alan atlanır ("ortama
// göre değişir"), senaryonun var olan tablo başvurularının değeri de değişmemelidir.
//   · onay yoksa yalnız plan döner (hiçbir şey yazılmaz); onayla yalnız kullanıcının seçtiği senaryo + alanlar yazılır (plan
//     yeniden hesaplanır). Yazım senaryo-servisi.mjs senaryoOrtamVerileriniYaz ile: tek doğrulayıcı, kasa zarfı, değişiklik
//     geçmişi (önceki içerik geçmişte kalır; arayüzde tek tıkla geri alma yoktur).
//   · Gizli sütun / hassas alan: planda değer gösterilmez (•••); seçim alanı ve dosya alanı gizli sütundan değer almaz; satır
//     seçimine gizli sütun yazılmaz (satır diğer sütunlarla seçilir).
// Servis tarafındaki karşılığı: servisler/soapui-aktarimi.mjs eskiParametreleriDonustur.
import { DepoHatasi, ekranlariListele, ortamlariListele } from '../veritabani/depo.mjs';
import { acikAnahtar, zarflariCoz } from '../kasa.mjs';
import { modelBaglami, senaryoAkisi, senaryoKaynagi, senaryoOrtamVerileriniYaz, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu, secenekBul } from '../senaryolar/model-kosusu.mjs';
import { modelAlanlari } from './paket-tablolari.mjs';
import { formSemasiOlustur, tumFormAlanlari } from '../senaryolar/model-formu.mjs';
import { senaryoyuDogrula } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { tablolariListele } from './tablo-deposu.mjs';
import { etkinAlanBaglari } from './ekran-baglari.mjs';
import { ekranBasvurulariniCoz, ekrandakiDeger, modelAlanBilgisi } from './ekran-basvurulari.mjs';
import { degerBasvurusu, degerBasvurusuYaz, grupAnahtari, sutunBul } from './tablo-secimi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./tablo-deposu.mjs').Tablo} Tablo */
/** @typedef {Record<string, unknown>} Nesne */
/** @typedef {Record<string, Record<string, string>>} Secimler */
/**
 * @typedef {{ anahtar: string; ekranId: string; ekranAdi: string; senaryoId: string; senaryo: string; alan: string; alanEtiketi: string;
 *   tip: string; eskiDeger: string; yeniDeger: string | null; gizli: boolean; durum: 'cevrilecek' | 'atlandi' | 'secilmedi'; neden?: string;
 *   satirSecimi?: string; ortamlar: string[] }} PlanSatiri
 */

/** Tablodan değer alabilen (form şeması) alan tipleri — doğrulayıcıdaki TABLODAN_ALABILIR ile uyumlu. */
const TABLODAN_ALABILIR = ['secim', 'okluSecim', 'radyo', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'dosya'];
/** Aday satır seçimi denemesi (grup başına). */
const EN_COK_ADAY = 40;

export const NEDENLER = Object.freeze({
  tablodaYok: 'tabloda yok',
  ortamaGore: 'çevrilemez: ortama göre değişir',
  ayniSatir: 'çevrilemez: diğer alanlarla aynı satırda bulunamadı',
  mevcutBozulur: 'çevrilemez: senaryodaki diğer tablo değerlerini değiştirirdi',
  tipUygunDegil: 'bu alan tipi tablodan değer alamaz',
  tabloYok: 'bağlı tablo bulunamadı',
  sutunYok: 'bağlı sütun bulunamadı',
  gizliSecim: 'seçim / dosya alanı gizli sütundan değer alamaz',
  karisik: 'bazı ortamlarda değer zaten tablodan ya da düz değil',
  kosuyor: 'senaryo şu an koşuyor',
  dogrulama: 'doğrulama'
});

/** @param {unknown} d @returns {d is Nesne} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** Düz (çevrilebilir) değer: boş olmayan metin (başvuru değil), sayı ya da evet/hayır. @param {unknown} v */
const duzMu = (v) => (typeof v === 'string' && v.trim() !== '' && !degerBasvurusu(v)) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean';
/**
 * Çözülen değer EKRANA eski değerle aynı gider mi: evet/hayır tam; seçim alanında iki değer de modelin seçeneğine (koşucunun
 * secenekBul kuralıyla: senaryo değeri / değer / metin) çevrilip sayfa değerleri karşılaştırılır; diğerleri metin olarak.
 * @param {unknown} yeni @param {unknown} eski @param {Array<Record<string, unknown>>} [secenekler]
 */
const esit = (yeni, eski, secenekler) => {
  if (typeof eski === 'boolean' || typeof yeni === 'boolean') return yeni === eski;
  if (yeni === undefined || yeni === null) return false;
  const sayfada = (/** @type {unknown} */ v) => (secenekler && secenekler.length ? secenekBul(/** @type {any} */ (secenekler), v).deger : String(v));
  return String(yeni) === String(eski) || sayfada(yeni) === sayfada(eski);
};
/** @param {unknown} v */
const goster = (v) => (typeof v === 'boolean' ? (v ? 'işaretli' : 'işaretsiz') : String(v));

/**
 * Onaysız: plan ({ onizleme }). Onaylı: yalnız secimler'deki (senaryoId + alan anahtarı) çevrilebilir alanlar yazılır.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ekranId?: string | null; onay?: boolean; secimler?: unknown; yapan?: string }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 */
export function ekranTabloDonusumu(vt, projeId, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const ekranlar = ekranlariListele(vt, projeId).filter((e) => e.durum !== 'silindi' && (!girdi.ekranId || e.id === girdi.ekranId));
  if (girdi.ekranId && !ekranlar.length) throw new DepoHatasi('Ekran bulunamadı.');
  /** @type {Set<string> | null} */
  let secili = null;
  if (girdi.onay) {
    secili = new Set((Array.isArray(girdi.secimler) ? girdi.secimler : []).filter(nesneMi)
      .filter((x) => typeof x.senaryoId === 'string' && typeof x.alan === 'string').map((x) => `${x.senaryoId}|${x.alan}`));
    if (!secili.size) throw new DepoHatasi('En az bir alan seçin.');
  }
  const ortamAdlari = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  // Değerler çözülmüş tablolar (gizli sütunlar dahil; yalnız bellekte karşılaştırma için — yanıta hiçbir tablo değeri gizli
  // sütundan yazılmaz).
  const tablolar = tablolariListele(vt, projeId, { cozulsun: true });
  const tabloMeta = tablolar.map((t) => ({ id: t.id, ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) }));
  /** @type {PlanSatiri[]} */
  const satirlar = [];
  /** @type {Array<{ senaryoId: string; ortamVerileri: Record<string, Nesne>; tabloSecimleri?: Secimler | null; alanlar: string[] }>} */
  const yazimlar = [];
  for (const ekran of ekranlar) {
    const baglar = etkinAlanBaglari(vt, ekran.id);
    if (!Object.keys(baglar).length) continue;
    /** @type {Map<string, { mb: NonNullable<ReturnType<typeof modelBaglami>>; bilgi: ReturnType<typeof modelAlanBilgisi>; alanlar: Map<string, any> } | null>} */
    const modeller = new Map();
    for (const s of vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY baslik', [projeId, ekran.id])) {
      const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
      if (!modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) continue;
      const akis = senaryoAkisi(icerik);
      if (!modeller.has(akis ?? '')) {
        const mb = modelBaglami(vt, ekran.id, akis);
        let alanlar = new Map();
        try { alanlar = mb ? new Map(tumFormAlanlari(formSemasiOlustur(mb.model, mb.altModeller)).filter((a) => a.anahtar).map((a) => [String(a.anahtar), a])) : alanlar; } catch { /* bozuk model: alan yok */ }
        modeller.set(akis ?? '', mb ? { mb, bilgi: modelAlanBilgisi(mb.model), alanlar } : null);
      }
      const m = modeller.get(akis ?? '');
      if (!m) continue;
      const kaynak = senaryoKaynagi(icerik);
      const sonuc = senaryoPlani({
        vt, ekran, senaryo: { id: String(s.id), baslik: String(s.baslik), icerik }, baglar, tablolar, tabloMeta, ortamAdlari, secili,
        kosuyor: Boolean(kaynak && secenekler.kosuyorMu?.(kaynak.dosya, kaynak.ad)), ...m
      });
      satirlar.push(...sonuc.satirlar);
      if (sonuc.yazim) yazimlar.push(sonuc.yazim);
    }
  }
  const sayi = (/** @type {PlanSatiri['durum']} */ d) => satirlar.filter((x) => x.durum === d).length;
  /** @type {Record<string, number>} */
  const nedenler = {};
  for (const x of satirlar) if (x.durum === 'atlandi' && x.neden) { const k = x.neden.split(':')[0] === 'doğrulama' ? NEDENLER.dogrulama : x.neden; nedenler[k] = (nedenler[k] ?? 0) + 1; }
  const plan = {
    satirlar,
    ozet: {
      senaryo: new Set(satirlar.map((x) => x.senaryoId)).size, alan: satirlar.length, cevrilecek: sayi('cevrilecek'), atlanan: sayi('atlandi'),
      secilmeyen: sayi('secilmedi'), yazilacakSenaryo: yazimlar.length, nedenler
    },
    geriAlma: 'Her senaryonun önceki içeriği değişiklik geçmişinde saklanır (Senaryolar > senaryo > Geçmiş); arayüzde tek tıkla geri alma yoktur.'
  };
  if (!girdi.onay) return { onizleme: plan };
  if (!yazimlar.length) throw new DepoHatasi('Seçilen alanlardan çevrilebilecek değer yok.');
  vt.islem(() => {
    for (const y of yazimlar) {
      senaryoOrtamVerileriniYaz(vt, {
        projeId, id: y.senaryoId, ortamVerileri: y.ortamVerileri, ...(y.tabloSecimleri !== undefined ? { tabloSecimleri: y.tabloSecimleri } : {}),
        denetlenecekAlanlar: y.alanlar, yapan: girdi.yapan
      }, secenekler);
    }
  });
  return { uygulandi: true, guncellenenSenaryo: yazimlar.length, cevrilenAlan: yazimlar.reduce((t, y) => t + y.alanlar.length, 0), ...plan };
}

/**
 * Tek senaryonun planı (ve onaylıysa yazımı).
 * @param {{ vt: Veritabani; ekran: { id: string; ad: string }; senaryo: { id: string; baslik: string; icerik: Nesne };
 *   baglar: Record<string, { tablo: string; sutun: string; etiket?: string }>; tablolar: Tablo[]; tabloMeta: Array<{ id: string; ad: string; sutunlar: Array<{ ad: string; gizli: boolean }> }>;
 *   ortamAdlari: Map<string, string>; secili: Set<string> | null; kosuyor: boolean;
 *   mb: NonNullable<ReturnType<typeof modelBaglami>>; bilgi: ReturnType<typeof modelAlanBilgisi>; alanlar: Map<string, any> }} c
 */
function senaryoPlani(c) {
  const { senaryo, tablolar, bilgi } = c;
  const icerik = senaryo.icerik;
  const ortamlar = /** @type {Record<string, Nesne>} */ (icerik.ortamlar);
  const ortamIdleri = Object.keys(ortamlar).filter((o) => nesneMi(ortamlar[o]) && nesneMi(ortamlar[o].veri));
  /** @type {Record<string, Nesne>} */
  const veriler = Object.fromEntries(ortamIdleri.map((o) => [o, /** @type {Nesne} */ (zarflariCoz(c.vt, ortamlar[o].veri))]));
  const mevcutSecimler = /** @type {Secimler} */ (nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {});
  /** @type {PlanSatiri[]} */
  const satirlar = [];
  /**
   * @typedef {{ satir: PlanSatiri; anahtar: string; tip: string; t: Tablo; sutun: import('./tablo-secimi.mjs').Sutun; etiket: string; grup: string;
   *   ref: string; eskiler: Record<string, unknown>; gizliGibi: boolean }} Aday
   */
  /** @type {Aday[]} */
  const adaylar = [];
  // Alanların model seçenekleri (senaryo anahtarı → seçenekler; bağımlı listelerin tüm seçenekleri dahil).
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const secenekHavuzu = new Map();
  for (const [id, a] of modelAlanlari(c.mb.model)) {
    const anahtar = bilgi.alanAnahtarlari[id];
    if (!anahtar) continue;
    const bag = nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [];
    const havuz = [...(Array.isArray(a.secenekler) ? a.secenekler : []), ...bag].filter(nesneMi);
    if (havuz.length) secenekHavuzu.set(anahtar, havuz);
  }
  const secenekleri = (/** @type {string} */ anahtar) => secenekHavuzu.get(anahtar);
  const ekrandaki = (/** @type {string} */ anahtar, /** @type {string} */ tip, /** @type {import('./tablo-secimi.mjs').Sutun} */ sutun, /** @type {string} */ deger) =>
    ekrandakiDeger({ sutun, deger }, { tip, secenekler: bilgi.secenekDegerleri[anahtar], kabul: bilgi.kabuller[anahtar] });
  for (const [alanId, bag] of Object.entries(c.baglar)) {
    const anahtar = bilgi.alanAnahtarlari[alanId];
    const fa = anahtar ? c.alanlar.get(anahtar) : undefined;
    if (!anahtar || !fa) continue;
    /** @type {Record<string, unknown>} */
    const eskiler = {};
    for (const o of ortamIdleri) {
      const v = veriler[o][anahtar];
      if (v !== undefined && v !== null && v !== '') eskiler[o] = v;
    }
    const degerler = Object.values(eskiler);
    if (!degerler.some(duzMu)) continue;
    const t = tablolar.find((x) => x.id === bag.tablo);
    const sutun = t ? sutunBul(t, bag.sutun) : undefined;
    const tip = String(bilgi.alanTipleri[anahtar] ?? fa.tip);
    const gizli = Boolean(sutun?.gizli) || fa.hassas === true;
    const farkli = new Set(degerler.map((v) => JSON.stringify(v))).size > 1;
    /** @type {PlanSatiri} */
    const satir = {
      anahtar: `${senaryo.id}|${anahtar}`, ekranId: c.ekran.id, ekranAdi: c.ekran.ad, senaryoId: senaryo.id, senaryo: senaryo.baslik, alan: anahtar,
      alanEtiketi: String(fa.etiket ?? anahtar), tip, gizli,
      eskiDeger: gizli ? '•••' : farkli ? Object.entries(eskiler).map(([o, v]) => `${c.ortamAdlari.get(o) ?? o}: ${goster(v)}`).join(' · ') : goster(degerler[0]),
      yeniDeger: t && sutun ? degerBasvurusuYaz(t.ad, sutun.ad, bag.etiket || '') : null, durum: 'atlandi',
      ortamlar: Object.keys(eskiler).map((o) => c.ortamAdlari.get(o) ?? o)
    };
    satirlar.push(satir);
    const atla = (/** @type {string} */ neden) => { satir.neden = neden; };
    if (!degerler.every(duzMu)) { atla(NEDENLER.karisik); continue; }
    if (c.kosuyor) { atla(NEDENLER.kosuyor); continue; }
    if (!TABLODAN_ALABILIR.includes(fa.tip) || !TABLODAN_ALABILIR.includes(tip)) { atla(NEDENLER.tipUygunDegil); continue; }
    if (!t) { atla(NEDENLER.tabloYok); continue; }
    if (!sutun) { atla(NEDENLER.sutunYok); continue; }
    if (sutun.gizli && ['secim', 'okluSecim', 'radyo', 'dosya'].includes(tip)) { atla(NEDENLER.gizliSecim); continue; }
    // Değer tabloda (ekrana gidecek biçimiyle: sayfa karşılığı / evet-hayır) bu ortamda görünen bir satırda var mı?
    const bulunan = Object.entries(eskiler).map(([o, v]) => t.satirlar.some((r) => (!r.ortamId || r.ortamId === o) && r.degerler[sutun.ad] !== null
      && r.degerler[sutun.ad] !== undefined && r.degerler[sutun.ad] !== '' && ((e) => 'deger' in e && esit(e.deger, v, secenekleri(anahtar)))(ekrandaki(anahtar, tip, sutun, String(r.degerler[sutun.ad])))));
    if (!bulunan.some(Boolean)) { atla(NEDENLER.tablodaYok); continue; }
    if (!bulunan.every(Boolean)) { atla(NEDENLER.ortamaGore); continue; }
    adaylar.push({ satir, anahtar, tip, t, sutun, etiket: bag.etiket || '', grup: grupAnahtari(t.id, bag.etiket || ''), ref: /** @type {string} */ (satir.yeniDeger), eskiler,
      // Gizli sütun ya da hassas alan: değeri satır seçimine yazılmaz (satır diğer açık sütunlarla seçilir).
      gizliGibi: Boolean(sutun.gizli) || fa.hassas === true });
  }
  // Seçilen (onaylıysa) adaylar; seçilmeyenler düz kalır.
  const secilenler = adaylar.filter((a) => !c.secili || c.secili.has(a.satir.anahtar));
  for (const a of adaylar) if (!secilenler.includes(a)) { a.satir.durum = 'secilmedi'; }
  const ortak = { tablolar, baglar: c.baglar, ...bilgi };
  /** Senaryonun bu ortamdaki çözümü (verilen veri + seçimlerle). @param {Nesne} veri @param {string} o @param {Secimler} secimler */
  const coz = (veri, o, secimler) => ekranBasvurulariniCoz(veri, { ...ortak, ortamId: o, tabloSecimleri: secimler });
  /** Önceki çözüm (var olan başvurular değişmemeli). */
  const onceki = Object.fromEntries(ortamIdleri.map((o) => [o, coz(veriler[o], o, mevcutSecimler)]));
  /** @type {Secimler} */
  const sonSecimler = JSON.parse(JSON.stringify(mevcutSecimler));
  /** @type {Aday[]} */
  const cevrilenler = [];
  for (const grup of [...new Set(secilenler.map((a) => a.grup))]) {
    let kalan = secilenler.filter((a) => a.grup === grup);
    const t = kalan[0].t;
    const taban = mevcutSecimler[grup] ?? {};
    for (let tur = 0; tur < 8 && kalan.length; tur++) {
      /** Verilen grup seçimiyle kalan adayların her ortamdaki sonucu. @param {Record<string, string>} secim */
      const dene = (secim) => {
        const secimler = { ...sonSecimler };
        if (Object.keys(secim).length) secimler[grup] = secim; else delete secimler[grup];
        /** @type {Map<Aday, { iyi: string[]; kotu: string[]; hata: string | null }>} */
        const sonuc = new Map(kalan.map((a) => [a, { iyi: /** @type {string[]} */ ([]), kotu: /** @type {string[]} */ ([]), hata: /** @type {string | null} */ (null) }]));
        let bozulur = false;
        for (const o of ortamIdleri) {
          const yeni = { ...veriler[o] };
          for (const a of [...cevrilenler, ...kalan]) if (a.eskiler[o] !== undefined) yeni[a.anahtar] = a.ref;
          const r = coz(yeni, o, secimler);
          for (const a of kalan) {
            if (a.eskiler[o] === undefined) continue;
            const s = /** @type {{ iyi: string[]; kotu: string[]; hata: string | null }} */ (sonuc.get(a));
            const h = r.hatalar.find((x) => x.alan === a.anahtar);
            if (!h && esit(r.veri[a.anahtar], a.eskiler[o], secenekleri(a.anahtar))) s.iyi.push(o); else { s.kotu.push(o); if (h) s.hata = h.mesaj; }
          }
          // Senaryonun var olan başvuruları (ve daha önce çevrilenler) aynı kalmalı.
          for (const [k, v] of Object.entries(veriler[o])) {
            if (!degerBasvurusu(v)) continue;
            if (JSON.stringify(r.veri[k]) !== JSON.stringify(onceki[o].veri[k])) bozulur = true;
          }
          for (const a of cevrilenler) if (a.eskiler[o] !== undefined && !esit(r.veri[a.anahtar], a.eskiler[o], secenekleri(a.anahtar))) bozulur = true;
        }
        return { sonuc, bozulur, tamam: [...sonuc.values()].filter((x) => !x.kotu.length).length };
      };
      // Adaylar: var olan seçim; sonra kalan alanların HEPSİNİ tutan satırların açık sütun değerleri (gizli alan varsa satırın tüm
      // açık sütunları, satırı tek başına seçebilsin). Var olan seçimle çelişen aday denenmez.
      // Önce (sıkı) gruptaki DÜZ kalan bağlı alanların değerleriyle de uyan satırlar — onların sütunları da seçime yazılır (düz değer
      // sayfa karşılığıysa çözümleyici satırı bulamazdı); sonra (gevşek) yalnız kalan alanlara uyan satırlar.
      const digerDuzler = Object.entries(c.baglar).filter(([, b]) => grupAnahtari(b.tablo, b.etiket || '') === grup).map(([alanId, b]) => {
        const anahtar = bilgi.alanAnahtarlari[alanId];
        return { anahtar, sutun: sutunBul(t, b.sutun), hassas: c.alanlar.get(anahtar)?.hassas === true };
      }).filter((x) => x.anahtar && x.sutun && !kalan.some((a) => a.anahtar === x.anahtar) && !cevrilenler.some((a) => a.anahtar === x.anahtar));
      const tutar = (/** @type {{ anahtar: string; sutun: import('./tablo-secimi.mjs').Sutun }} */ a, /** @type {Nesne} */ satirDegerleri, /** @type {unknown} */ eski) =>
        ((e) => 'deger' in e && esit(e.deger, eski, secenekleri(a.anahtar)))(ekrandakiDeger({ sutun: a.sutun, deger: String(satirDegerleri[a.sutun.ad] ?? '') },
          { tip: bilgi.alanTipleri[a.anahtar], secenekler: bilgi.secenekDegerleri[a.anahtar], kabul: bilgi.kabuller[a.anahtar] }));
      /** @type {Array<Record<string, string>>} */
      const secimAdaylari = [taban];
      const imzalar = new Set([JSON.stringify(taban)]);
      for (const siki of [true, false]) {
        for (const o of ortamIdleri) {
          for (const r of t.satirlar) {
            if (secimAdaylari.length >= EN_COK_ADAY) break;
            if (r.ortamId && r.ortamId !== o) continue;
            if (!kalan.every((a) => a.eskiler[o] === undefined || tutar(a, r.degerler, a.eskiler[o]))) continue;
            const duzler = siki ? digerDuzler.filter((x) => typeof veriler[o][x.anahtar] === 'string' && duzMu(veriler[o][x.anahtar])) : [];
            if (!duzler.every((x) => tutar(/** @type {any} */ (x), r.degerler, veriler[o][x.anahtar]))) continue;
            /** @type {Record<string, string>} */
            const secim = { ...taban };
            let celiski = false;
            const ekle = (/** @type {string} */ sutun, /** @type {unknown} */ d) => {
              if (d === null || d === undefined || d === '') return;
              if (secim[sutun] !== undefined && secim[sutun] !== String(d)) celiski = true; else secim[sutun] = String(d);
            };
            for (const a of kalan) if (!a.gizliGibi) ekle(a.sutun.ad, r.degerler[a.sutun.ad]);
            for (const x of duzler) if (!x.hassas && !x.sutun?.gizli) ekle(String(x.sutun?.ad), r.degerler[String(x.sutun?.ad)]);
            const korunan = new Set([...kalan.filter((a) => a.gizliGibi).map((a) => a.sutun.ad), ...digerDuzler.filter((x) => x.hassas).map((x) => String(x.sutun?.ad))]);
            if (kalan.some((a) => a.gizliGibi)) {
              for (const s of t.sutunlar) if (!s.gizli && !korunan.has(s.ad) && taban[s.ad] === undefined && secim[s.ad] === undefined) ekle(s.ad, r.degerler[s.ad]);
            }
            const imza = JSON.stringify(secim);
            if (celiski || imzalar.has(imza)) continue;
            imzalar.add(imza);
            secimAdaylari.push(secim);
          }
        }
      }
      /** @type {{ secim: Record<string, string>; d: ReturnType<typeof dene> } | null} */
      let enIyi = null;
      for (const secim of secimAdaylari) {
        const d = dene(secim);
        if (d.bozulur) continue;
        if (!enIyi || d.tamam > enIyi.d.tamam) enIyi = { secim, d };
        if (d.tamam === kalan.length) break;
      }
      if (enIyi && enIyi.d.tamam === kalan.length) {
        if (Object.keys(enIyi.secim).length) sonSecimler[grup] = enIyi.secim; else delete sonSecimler[grup];
        cevrilenler.push(...kalan);
        break;
      }
      // Tutmayanlar düz kalır (neden yazılır); kalanlarla yeniden denenir.
      const kotuler = enIyi ? kalan.filter((a) => /** @type {{ kotu: string[] }} */ (enIyi?.d.sonuc.get(a)).kotu.length) : kalan;
      for (const a of kotuler) {
        const s = enIyi?.d.sonuc.get(a);
        a.satir.neden = !enIyi ? NEDENLER.mevcutBozulur : s && s.iyi.length && s.kotu.length ? NEDENLER.ortamaGore : NEDENLER.ayniSatir;
      }
      kalan = kalan.filter((a) => !kotuler.includes(a));
    }
  }
  // Son denetim: tüm çevirilerle her ortamda eski değerler aynen çıkmalı, doğrulayıcı çevrilen alanlarda hata vermemeli.
  /** @type {Record<string, Nesne>} */
  const yeniVeriler = {};
  for (const o of ortamIdleri) {
    const yeni = { ...veriler[o] };
    let degisti = false;
    for (const a of cevrilenler) if (a.eskiler[o] !== undefined) { yeni[a.anahtar] = a.ref; degisti = true; }
    if (degisti) yeniVeriler[o] = yeni;
  }
  let gecerli = cevrilenler.length > 0;
  for (const [o, yeni] of Object.entries(yeniVeriler)) {
    const r = coz(yeni, o, sonSecimler);
    if (cevrilenler.some((a) => a.eskiler[o] !== undefined && !esit(r.veri[a.anahtar], a.eskiler[o], secenekleri(a.anahtar)))) gecerli = false;
    const d = senaryoyuDogrula(yeni, { model: c.mb.model, altModeller: c.mb.altModeller, kaynak: 'kayit', tablolar: c.tabloMeta });
    for (const a of cevrilenler) {
      const h = d.hatalar.find((x) => x.alan === a.anahtar || x.alan.startsWith(`${a.anahtar}.`));
      if (h) { a.satir.neden = `${NEDENLER.dogrulama}: ${h.mesaj}`; gecerli = false; }
    }
  }
  if (!gecerli) {
    for (const a of cevrilenler) if (!a.satir.neden) a.satir.neden = NEDENLER.ayniSatir;
    return { satirlar };
  }
  const grupAdi = (/** @type {string} */ g) => {
    const [tabloId, etiket] = g.split('|');
    const t = tablolar.find((x) => x.id === tabloId);
    return `${t ? t.ad : tabloId}${etiket ? ` [${etiket}]` : ''}`;
  };
  const secimDegisti = JSON.stringify(sonSecimler) !== JSON.stringify(mevcutSecimler);
  for (const a of cevrilenler) {
    a.satir.durum = 'cevrilecek';
    delete a.satir.neden;
    const s = sonSecimler[a.grup];
    if (s && JSON.stringify(s) !== JSON.stringify(mevcutSecimler[a.grup] ?? null)) a.satir.satirSecimi = `${grupAdi(a.grup)}: ${Object.entries(s).map(([k, v]) => `${k} = ${v}`).join(', ')}`;
  }
  return {
    satirlar,
    yazim: {
      senaryoId: senaryo.id, ortamVerileri: yeniVeriler, alanlar: cevrilenler.map((a) => a.anahtar),
      ...(secimDegisti ? { tabloSecimleri: Object.keys(sonSecimler).length ? sonSecimler : null } : {})
    }
  };
}
