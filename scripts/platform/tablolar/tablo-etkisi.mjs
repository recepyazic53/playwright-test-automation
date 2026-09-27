// TABLO DEĞİŞİKLİĞİNİN SENARYOLARA ETKİSİ (kullanıcı onayıyla). Test verisi tablosunda bir hücrenin değeri değişince (ör. 2. satırda
// "a" → "b") o değeri DÜZ METİN olarak kullanan senaryolar sessizce eski değerde kalmasın: tablo kaydedilirken eski ve yeni tablo
// karşılaştırılır, etkilenen senaryolar gösterilir, kullanıcının seçtikleri AYNI İŞLEMDE yeni değere güncellenir (senaryolar düz
// değer olarak kalır; okunaklı). Sessiz değişiklik yoktur.
//   · Değişiklik: satır kimliğiyle eşleşen satırda aynı sütunun (sütun yeniden adlandırılsa da) eski dolu değeri farklıysa; silinen
//     satırın ve boşaltılan hücrenin değeri "silindi" sayılır (yeni: null).
//   · Etkilenen: (1) ekran alanı o sütuna bağlıysa (ekran-baglari.mjs) ekranın senaryolarında alanın düz değeri eski değere eşitse,
//     ortam başına; (2) servis alanı bağlıysa (ayarlar.alanBaglari[metot][yol]) senaryo gövdesindeki düz (sabit) değeri eşitse; (3)
//     senaryonun satır seçiminde (tabloSecimleri) koşul eski değerse. Aynı tablo + etiketteki DİĞER bağlı alanların düz değerleri
//     değişen satırla uyuşmalıdır (bağımlı listeler: uyuşmayan satır o senaryoyu ilgilendirmez). Eski değer yeni tabloda senaryoyla
//     uyuşan bir satırda hâlâ varsa senaryo etkilenmez (ör. başka satırlar da aynı kanalı kullanıyor).
//   · Karşılıklar (sütun karşılıkları: tablodaki değer → sayfa / servis değeri): eski değerin karşılığı yeni değere taşınır (yeni
//     değerin kendi karşılığı varsa korunur; eski değer tabloda kalmadıysa eski anahtar silinir). Otomatiktir; bilgi olarak döner.
//   · Gizli sütun / hassas alan: değerler yanıtta asla yazılmaz ("•••"). Bağlam tabloları (baglam_…) ve yeni tablo analiz edilmez.
//   · Yazım: ekran senaryosu senaryo-servisi.mjs senaryoOrtamVerileriniYaz ile (tek doğrulayıcı, ortam başına veri, kasa zarfı,
//     değişiklik geçmişi); servis senaryosu servisSenaryosuKaydet ile, gövdede YALNIZ ilgili öğenin metni değişir (govde-degeri.mjs;
//     bulunamaz / birden çok eşleşirse senaryo atlanır ve bildirilir). Koşan senaryo atlanır. Tablo + senaryolar TEK işlemde: biri
//     hata verirse hiçbiri yazılmaz.
// Uç: tablo-uclari.mjs POST /platform/tablo/kaydet { …, etki: 'denetle' | 'uygula', guncellenecekler?: [anahtar] }.
import { DepoHatasi, ekranlariListele, ortamlariListele } from '../veritabani/depo.mjs';
import { acikAnahtar, zarflariCoz } from '../kasa.mjs';
import { modelBaglami, senaryoAkisi, senaryoKaynagi, senaryoOrtamVerileriniYaz, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import { formSemasiOlustur, tumFormAlanlari } from '../senaryolar/model-formu.mjs';
import { senaryoyuDogrula } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { BAGLAM_ONEKI, tabloKaydet, tablolariListele } from './tablo-deposu.mjs';
import { ekranAlanBaglari } from './ekran-baglari.mjs';
import { modelAlanBilgisi } from './ekran-basvurulari.mjs';
import { degerBasvurusu, sutunBul } from './tablo-secimi.mjs';
import { servisleriListele, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet } from '../servisler/servis-deposu.mjs';
import { govdeCoz, semaBirlestir } from '../servisler/servis-govdesi.mjs';
import { restDegeriniDegistir, restDegerleri, soapDegeriniDegistir, soapYapraklari } from '../servisler/govde-degeri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./tablo-deposu.mjs').Tablo} Tablo */
/** @typedef {Record<string, unknown>} Nesne */
/**
 * @typedef {{ satirId: string; satirAdi: string; sutun: string; eski: string; yeni: string | null; gizli: boolean }} Degisiklik
 * @typedef {{ ortamId: string | null; degerler: Record<string, string | null> }} SatirDegerleri
 * @typedef {'guncellenebilir' | 'silindi-uyari' | 'kosuyor' | 'belirsiz' | 'atlanacak'} EtkiDurumu
 * @typedef {{ anahtar: string; tur: 'ekran' | 'servis'; kaynakId: string; kaynakAdi: string; senaryoId: string; baslik: string;
 *   nitelik: 'alan' | 'secim'; alan: string; eski: string; yeni: string | null; gizli: boolean; durum: EtkiDurumu; neden?: string; ortamlar?: string[] }} Etkilenen
 * @typedef {{ tur: 'ekran'; senaryoId: string; alan: string; ortamDegerleri: Record<string, string | number> }
 *   | { tur: 'ekran-secim' | 'servis-secim'; senaryoId: string; grup: string; secim: Record<string, string> }
 *   | { tur: 'servis'; senaryoId: string; yol: string; eski: string; yeni: string; rest: boolean; sablon: string; kok: string }} Islem
 */

export const MASKE = '•••';
export const NEDENLER = Object.freeze({
  belirsiz: 'değişen satırlarda farklı yeni değerler var; hangisi olduğu belirsiz',
  kismenSilindi: 'bazı ortamlarda değer silindi; o ortamlar değişmez',
  silindi: 'değer tablodan silindi; senaryo koşuda hata verebilir',
  kosuyor: 'senaryo şu an koşuyor',
  sayiDegil: 'alan sayı; yeni değer sayı değil',
  dogrulama: 'doğrulama'
});

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const dolu = (/** @type {unknown} */ v) => v !== null && v !== undefined && v !== '';
/** Senaryodaki düz değer (başvuru değil): boş olmayan metin ya da sayı → metin; değilse null. @param {unknown} v */
const duzDeger = (v) => (typeof v === 'string' && v.trim() !== '' && !degerBasvurusu(v) && !/^\s*\$\{/.test(v) ? v
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/**
 * Eski sütun adı → yeni sütun adı (girdideki eskiAd; verilmezse aynı ad). Eski tabloda olmayan sütunlar (yeni sütun) yok sayılır.
 * @param {Tablo} eski @param {unknown} sutunlar
 */
export function sutunTasimasi(eski, sutunlar) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const x of Array.isArray(sutunlar) ? sutunlar : []) {
    const o = /** @type {Nesne} */ (nesneMi(x) ? x : {});
    const ad = String(o.ad ?? '').trim();
    const kaynak = typeof o.eskiAd === 'string' && o.eskiAd ? o.eskiAd : ad;
    if (ad && eski.sutunlar.some((s) => s.ad === kaynak)) m.set(kaynak, ad);
  }
  return m;
}

/** Eski satırlar, sütunları YENİ adlarıyla (karşılaştırma yeni adlarla yapılır). @param {Tablo} eski @param {Map<string, string>} tasima @returns {Map<string, SatirDegerleri>} */
export function eskiSatirlar(eski, tasima) {
  return new Map(eski.satirlar.map((r) => [r.id, {
    ortamId: r.ortamId, degerler: Object.fromEntries(eski.sutunlar.filter((s) => tasima.has(s.ad)).map((s) => [/** @type {string} */ (tasima.get(s.ad)), r.degerler[s.ad] ?? null]))
  }]));
}

/**
 * Değeri değişen / silinen hücreler (satır kimliğiyle eşleştirilir; sütun yeniden adlandırılsa da aynı sütun). Yeni eklenen değer
 * değişiklik sayılmaz. @param {Tablo} eski @param {Tablo} yeni @param {Map<string, string>} tasima @returns {Degisiklik[]}
 */
export function hucreDegisiklikleri(eski, yeni, tasima) {
  const yeniSatirlar = new Map(yeni.satirlar.map((r) => [r.id, r]));
  const yeniSutunlar = new Map(yeni.sutunlar.map((s) => [s.ad, s]));
  /** @type {Degisiklik[]} */
  const sonuc = [];
  for (const r of eski.satirlar) {
    const n = yeniSatirlar.get(r.id);
    for (const s of eski.sutunlar) {
      const hedef = tasima.get(s.ad);
      const ys = hedef ? yeniSutunlar.get(hedef) : undefined;
      if (!hedef || !ys) continue;
      const o = r.degerler[s.ad];
      if (!dolu(o)) continue;
      const v = n ? n.degerler[hedef] : null;
      if (n && String(v ?? '') === String(o)) continue;
      sonuc.push({ satirId: r.id, satirAdi: r.ad, sutun: hedef, eski: String(o), yeni: dolu(v) ? String(v) : null, gizli: s.gizli || ys.gizli });
    }
  }
  return sonuc;
}

/**
 * Değişen değerlerin karşılıklarını yeni değere taşır (yeni değerin kendi karşılığı korunur; eski değer sütunda kalmadıysa eski
 * anahtar silinir). Gizli sütunun karşılığı olmaz. @param {Tablo} yeni @param {Degisiklik[]} degisiklikler
 * @returns {{ sutunlar: Map<string, Record<string, { sayfa?: string; servis?: string }>>; bilgi: Array<{ sutun: string; eski: string; yeni: string }> }}
 */
export function karsiliklariTasi(yeni, degisiklikler) {
  /** @type {Map<string, Record<string, { sayfa?: string; servis?: string }>>} */
  const sutunlar = new Map();
  /** @type {Array<{ sutun: string; eski: string; yeni: string }>} */
  const bilgi = [];
  for (const s of yeni.sutunlar) {
    if (s.gizli || !s.karsiliklar || !Object.keys(s.karsiliklar).length) continue;
    const k = { ...s.karsiliklar };
    const kalan = new Set(yeni.satirlar.map((r) => r.degerler[s.ad]).filter(dolu).map(String));
    let degisti = false;
    for (const d of degisiklikler) {
      if (d.sutun !== s.ad || d.yeni === null || !k[d.eski] || d.eski === d.yeni) continue;
      if (!k[d.yeni]) { k[d.yeni] = { ...k[d.eski] }; degisti = true; bilgi.push({ sutun: s.ad, eski: d.eski, yeni: d.yeni }); }
      if (!kalan.has(d.eski)) { delete k[d.eski]; degisti = true; }
    }
    if (degisti) sutunlar.set(s.ad, k);
  }
  return { sutunlar, bilgi };
}

/**
 * Senaryodaki bir alan değerinin (sütun = değer) değişiklikten etkisi. Diğer bağlı alanların düz değerleri (aynı grup) değişen
 * satırla uyuşmalı; ortamId verilirse satırın ortamı boş ya da aynı olmalı. Eski değer yeni tabloda uyuşan bir satırda hâlâ
 * varsa etkilenmez (null).
 * @param {{ sutun: string; deger: string; digerleri: Array<{ sutun: string; deger: string }>; ortamId: string | null;
 *   degisiklikler: Degisiklik[]; eskiSatirlar: Map<string, SatirDegerleri>; yeni: Tablo }} c
 * @returns {null | { durum: 'guncellenebilir'; yeni: string } | { durum: 'silindi' } | { durum: 'belirsiz'; yeniler: string[] }}
 */
export function degerEtkisi(c) {
  const gorunur = (/** @type {SatirDegerleri} */ r) => !r.ortamId || !c.ortamId || r.ortamId === c.ortamId;
  const uyar = (/** @type {Record<string, string | null>} */ d) => c.digerleri.every((x) => String(d[x.sutun] ?? '') === x.deger);
  const adaylar = c.degisiklikler.filter((d) => d.sutun === c.sutun && d.eski === c.deger).map((d) => ({ d, r: c.eskiSatirlar.get(d.satirId) }))
    .filter((x) => x.r && gorunur(x.r) && uyar(x.r.degerler));
  if (!adaylar.length) return null;
  if (c.yeni.satirlar.some((r) => gorunur(r) && String(r.degerler[c.sutun] ?? '') === c.deger && uyar(r.degerler))) return null;
  const yeniler = [...new Set(adaylar.map((x) => x.d.yeni).filter((v) => v !== null))].map(String);
  if (yeniler.length > 1) return { durum: 'belirsiz', yeniler };
  if (!yeniler.length) return { durum: 'silindi' };
  return { durum: 'guncellenebilir', yeni: yeniler[0] };
}

/**
 * Satır seçiminin (koşullar: Sütun = değer; sütun adları gerçek adlarla) değişiklikten etkisi: koşulların hepsini tutan değişen
 * satır varsa ve yeni tabloda koşulları tutan satır kalmadıysa koşullar yeni değerlere güncellenir.
 * @param {{ kosullar: Record<string, string>; degisiklikler: Degisiklik[]; eskiSatirlar: Map<string, SatirDegerleri>; yeni: Tablo }} c
 * @returns {null | { durum: 'guncellenebilir' | 'silindi' | 'belirsiz'; yeniKosullar: Record<string, string>; degisenler: Array<{ sutun: string; eski: string; yeni: string | null }> }}
 */
export function secimEtkisi(c) {
  const kosullar = Object.entries(c.kosullar);
  if (!kosullar.length) return null;
  const tutar = (/** @type {Record<string, string | null>} */ d) => kosullar.every(([s, v]) => String(d[s] ?? '') === v);
  const satirlar = new Set(c.degisiklikler.filter((d) => c.kosullar[d.sutun] === d.eski).map((d) => d.satirId));
  const adaylar = [...satirlar].filter((id) => { const r = c.eskiSatirlar.get(id); return r && tutar(r.degerler); });
  if (!adaylar.length || c.yeni.satirlar.some((r) => tutar(r.degerler))) return null;
  /** @type {'guncellenebilir' | 'silindi' | 'belirsiz'} */
  let durum = 'guncellenebilir';
  const yeniKosullar = { ...c.kosullar };
  /** @type {Array<{ sutun: string; eski: string; yeni: string | null }>} */
  const degisenler = [];
  for (const [s, v] of kosullar) {
    const ds = c.degisiklikler.filter((d) => d.sutun === s && d.eski === v && adaylar.includes(d.satirId));
    if (!ds.length) continue;
    const yeniler = [...new Set(ds.map((d) => d.yeni))];
    if (yeniler.includes(null)) { if (durum === 'guncellenebilir') durum = 'silindi'; degisenler.push({ sutun: s, eski: v, yeni: null }); continue; }
    if (yeniler.length > 1) { durum = 'belirsiz'; degisenler.push({ sutun: s, eski: v, yeni: null }); continue; }
    yeniKosullar[s] = String(yeniler[0]);
    degisenler.push({ sutun: s, eski: v, yeni: String(yeniler[0]) });
  }
  return { durum, yeniKosullar, degisenler };
}

/**
 * Tablo değişikliğinin senaryolara etkisi: etkilenen satırlar ve (güncellenebilenler için) yazım işlemleri. Tablonun YENİ hâli
 * veritabanında olmalıdır (tabloKaydetEtkiyle aynı işlemde çağırır; model listeleri yeni tablodan gelir).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ eski: Tablo; yeni: Tablo; tasima: Map<string, string>; degisiklikler: Degisiklik[] }} c
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean }} [secenekler]
 * @returns {{ satirlar: Etkilenen[]; islemler: Map<string, Islem> }}
 */
export function etkiPlani(vt, projeId, c, secenekler = {}) {
  /** @type {Etkilenen[]} */
  const satirlar = [];
  /** @type {Map<string, Islem>} */
  const islemler = new Map();
  if (!c.degisiklikler.length) return { satirlar, islemler };
  const { yeni, degisiklikler } = c;
  const eskiler = eskiSatirlar(c.eski, c.tasima);
  const gizliSutunlar = new Set(yeni.sutunlar.filter((s) => s.gizli).map((s) => s.ad));
  const eskiGizli = new Set(degisiklikler.filter((d) => d.gizli).map((d) => d.sutun));
  const gizliMi = (/** @type {string} */ s) => gizliSutunlar.has(s) || eskiGizli.has(s);
  /** Bağdaki sütun adı → yeni tablodaki ad (sütun bu kayıtta yeniden adlandırıldıysa da). @param {string} ad */
  const sutunAdi = (ad) => sutunBul(yeni, ad)?.ad ?? (() => { const e = sutunBul(c.eski, ad); return e ? c.tasima.get(e.ad) : undefined; })();
  const ortamAdlari = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  const tabloMeta = tablolariListele(vt, projeId).map((t) => ({ id: t.id, ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) }));
  const grupOnEki = `${yeni.id}|`;
  /** Satır seçimi grubunun koşulları (gerçek sütun adlarıyla) → etki. @param {Record<string, string>} secim */
  const secimiDegerlendir = (secim) => {
    /** @type {Record<string, string>} */
    const kosullar = {};
    for (const [k, v] of Object.entries(secim)) { const a = sutunAdi(k); if (a && typeof v === 'string') kosullar[a] = v; }
    const e = secimEtkisi({ kosullar, degisiklikler, eskiSatirlar: eskiler, yeni });
    if (!e) return null;
    const gizli = e.degisenler.some((x) => gizliMi(x.sutun));
    const yaz = (/** @type {'eski' | 'yeni'} */ ne) => e.degisenler.map((x) => `${x.sutun} = ${gizli ? MASKE : x[ne] ?? '—'}`).join(', ');
    // Yazılan seçim gerçek sütun adlarıyla (sütun bu kayıtta yeniden adlandırıldıysa da geçerli kalır).
    return { e, gizli, eskiMetin: yaz('eski'), yeniMetin: e.durum === 'guncellenebilir' ? yaz('yeni') : null, secim: { ...e.yeniKosullar } };
  };
  const secimSatiri = (/** @type {Omit<Etkilenen, 'nitelik' | 'alan' | 'eski' | 'yeni' | 'gizli' | 'durum' | 'anahtar'>} */ ortak, /** @type {string} */ grup,
    /** @type {NonNullable<ReturnType<typeof secimiDegerlendir>>} */ s, /** @type {boolean} */ kosuyor, /** @type {'ekran-secim' | 'servis-secim'} */ tur) => {
    const etiket = grup.slice(grupOnEki.length);
    const anahtar = `${ortak.tur}|${ortak.senaryoId}|secim|${grup}`;
    /** @type {EtkiDurumu} */
    const durum = s.e.durum === 'belirsiz' ? 'belirsiz' : s.e.durum === 'silindi' ? 'silindi-uyari' : kosuyor ? 'kosuyor' : 'guncellenebilir';
    satirlar.push({ ...ortak, anahtar, nitelik: 'secim', alan: `Satır seçimi: ${yeni.ad}${etiket ? ` [${etiket}]` : ''}`, eski: s.eskiMetin, yeni: s.yeniMetin, gizli: s.gizli, durum,
      ...(durum === 'belirsiz' ? { neden: NEDENLER.belirsiz } : durum === 'silindi-uyari' ? { neden: NEDENLER.silindi } : durum === 'kosuyor' ? { neden: NEDENLER.kosuyor } : {}) });
    if (durum === 'guncellenebilir') islemler.set(anahtar, { tur, senaryoId: ortak.senaryoId, grup, secim: s.secim });
  };

  // --- Ekran senaryoları -------------------------------------------------------------------------------------------------
  for (const ekran of ekranlariListele(vt, projeId)) {
    const baglar = Object.entries(ekranAlanBaglari(vt, ekran.id)).filter(([, b]) => b && b.tablo === yeni.id);
    const senaryolar = vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY baslik', [projeId, ekran.id]);
    /** @type {Map<string, { mb: NonNullable<ReturnType<typeof modelBaglami>>; bilgi: ReturnType<typeof modelAlanBilgisi>; alanlar: Map<string, any> } | null>} */
    const modeller = new Map();
    for (const s of senaryolar) {
      const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
      if (!modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) continue;
      const secimler = /** @type {Record<string, Record<string, string>>} */ (nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {});
      const ilgiliSecimler = Object.keys(secimler).filter((g) => g.startsWith(grupOnEki));
      if (!baglar.length && !ilgiliSecimler.length) continue;
      const kaynak = senaryoKaynagi(icerik);
      const kosuyor = Boolean(kaynak && secenekler.kosuyorMu?.(kaynak.dosya, kaynak.ad));
      const ortak = { tur: /** @type {const} */ ('ekran'), kaynakId: ekran.id, kaynakAdi: ekran.ad, senaryoId: String(s.id), baslik: String(s.baslik) };
      for (const g of ilgiliSecimler) {
        const r = secimiDegerlendir(secimler[g]);
        if (r) secimSatiri(ortak, g, r, kosuyor, 'ekran-secim');
      }
      if (!baglar.length) continue;
      const akis = senaryoAkisi(icerik) ?? '';
      if (!modeller.has(akis)) {
        const mb = modelBaglami(vt, ekran.id, akis || null);
        let alanlar = new Map();
        try { alanlar = mb ? new Map(tumFormAlanlari(formSemasiOlustur(mb.model, mb.altModeller)).filter((a) => a.anahtar).map((a) => [String(a.anahtar), a])) : alanlar; } catch { /* bozuk model */ }
        modeller.set(akis, mb ? { mb, bilgi: modelAlanBilgisi(mb.model), alanlar } : null);
      }
      const m = modeller.get(akis);
      if (!m) continue;
      const ortamlar = /** @type {Record<string, Nesne>} */ (icerik.ortamlar);
      const ortamIdleri = Object.keys(ortamlar).filter((o) => nesneMi(ortamlar[o]) && nesneMi(ortamlar[o].veri));
      /** @type {Record<string, Nesne>} */
      const veriler = Object.fromEntries(ortamIdleri.map((o) => [o, /** @type {Nesne} */ (zarflariCoz(vt, ortamlar[o].veri))]));
      const alanlar = baglar.map(([alanId, b]) => ({ anahtar: m.bilgi.alanAnahtarlari[alanId], sutun: sutunAdi(b.sutun), etiket: b.etiket || '' }))
        .filter((x) => x.anahtar && x.sutun);
      for (const a of alanlar) {
        const sutun = /** @type {string} */ (a.sutun);
        const fa = m.alanlar.get(a.anahtar);
        const gizli = gizliMi(sutun) || fa?.hassas === true;
        /** @type {Record<string, { v: unknown; e: NonNullable<ReturnType<typeof degerEtkisi>> }>} */
        const sonuclar = {};
        for (const o of ortamIdleri) {
          const v = veriler[o][a.anahtar];
          const deger = duzDeger(v);
          if (deger === null) continue;
          const digerleri = alanlar.filter((x) => x !== a && x.etiket === a.etiket).map((x) => ({ sutun: /** @type {string} */ (x.sutun), deger: duzDeger(veriler[o][x.anahtar]) }))
            .filter((x) => x.deger !== null).map((x) => ({ sutun: x.sutun, deger: /** @type {string} */ (x.deger) }));
          const e = degerEtkisi({ sutun, deger, digerleri, ortamId: o, degisiklikler, eskiSatirlar: eskiler, yeni });
          if (e) sonuclar[o] = { v, e };
        }
        const liste = Object.entries(sonuclar);
        if (!liste.length) continue;
        const anahtar = `ekran|${ortak.senaryoId}|alan|${a.anahtar}`;
        const goster = (/** @type {Array<[string, string]>} */ ciftler) => {
          if (gizli) return MASKE;
          const farkli = new Set(ciftler.map(([, x]) => x));
          return farkli.size <= 1 ? String(ciftler[0]?.[1] ?? '') : ciftler.map(([o, x]) => `${ortamAdlari.get(o) ?? o}: ${x}`).join(' · ');
        };
        const guncel = liste.filter(([, x]) => x.e.durum === 'guncellenebilir');
        /** @type {Etkilenen} */
        const satir = {
          ...ortak, anahtar, nitelik: 'alan', alan: String(fa?.etiket ?? a.anahtar), gizli, durum: 'guncellenebilir',
          eski: goster(liste.map(([o, x]) => [o, String(x.v)])),
          yeni: guncel.length ? goster(guncel.map(([o, x]) => [o, /** @type {{ yeni: string }} */ (x.e).yeni])) : null,
          ortamlar: liste.map(([o]) => ortamAdlari.get(o) ?? o)
        };
        satirlar.push(satir);
        if (liste.some(([, x]) => x.e.durum === 'belirsiz')) { satir.durum = 'belirsiz'; satir.neden = NEDENLER.belirsiz; satir.yeni = null; continue; }
        if (!guncel.length) { satir.durum = 'silindi-uyari'; satir.neden = NEDENLER.silindi; continue; }
        if (kosuyor) { satir.durum = 'kosuyor'; satir.neden = NEDENLER.kosuyor; continue; }
        /** @type {Record<string, string | number>} */
        const ortamDegerleri = {};
        let hata = '';
        for (const [o, x] of guncel) {
          const yeniDeger = /** @type {{ yeni: string }} */ (x.e).yeni;
          if (typeof x.v === 'number') {
            if (!/^-?\d+(\.\d+)?$/.test(yeniDeger)) { hata = NEDENLER.sayiDegil; break; }
            ortamDegerleri[o] = Number(yeniDeger);
          } else ortamDegerleri[o] = yeniDeger;
          const d = senaryoyuDogrula({ ...veriler[o], [a.anahtar]: ortamDegerleri[o] }, { model: m.mb.model, altModeller: m.mb.altModeller, kaynak: 'kayit', tablolar: tabloMeta });
          const h = d.hatalar.find((y) => y.alan === a.anahtar || y.alan.startsWith(`${a.anahtar}.`));
          if (h) { hata = `${NEDENLER.dogrulama}: ${gizli ? 'yeni değer bu alanda geçersiz' : h.mesaj}`; break; }
        }
        if (hata) { satir.durum = 'atlanacak'; satir.neden = hata; continue; }
        if (guncel.length < liste.length) satir.neden = NEDENLER.kismenSilindi;
        islemler.set(anahtar, { tur: 'ekran', senaryoId: ortak.senaryoId, alan: a.anahtar, ortamDegerleri });
      }
    }
  }

  // --- Servis senaryoları ------------------------------------------------------------------------------------------------
  for (const servis of servisleriListele(vt, projeId)) {
    const tumBaglar = servis.ayarlar.alanBaglari ?? {};
    const rest = servis.tur === 'rest';
    for (const x of servisSenaryolariniListele(vt, servis.id)) {
      const icerik = /** @type {any} */ (x.icerik);
      if (icerik.tur === 'akis') continue;
      const op = String(icerik.operasyon ?? '');
      const baglar = Object.entries(tumBaglar[op] ?? {}).filter(([, b]) => b && b.tablo === yeni.id && b.sutun && !b.bicim && !b.kural);
      const secimler = /** @type {Record<string, Record<string, string>>} */ (nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {});
      const ilgiliSecimler = Object.keys(secimler).filter((g) => g.startsWith(grupOnEki));
      if (!baglar.length && !ilgiliSecimler.length) continue;
      const kosuyor = Boolean(secenekler.servisKosuyorMu?.(x.id));
      const ortak = { tur: /** @type {const} */ ('servis'), kaynakId: servis.id, kaynakAdi: servis.ad, senaryoId: x.id, baslik: x.baslik };
      for (const g of ilgiliSecimler) {
        const r = secimiDegerlendir(secimler[g]);
        if (r) secimSatiri(ortak, g, r, kosuyor, 'servis-secim');
      }
      if (!baglar.length) continue;
      const hamSema = servis.ayarlar.operasyonSemalari?.[op];
      const sema = hamSema ? semaBirlestir(hamSema, servis.ayarlar.ekAlanlar?.[op] ?? []) : null;
      const sablon = rest ? String((servis.ayarlar.operasyonlar ?? []).find((o) => o.ad === op)?.yol ?? '') : '';
      const govde = String(icerik.govde ?? '');
      const govdeIcerigi = { govde, yol: String(icerik.http?.yol ?? '') };
      /** @type {Record<string, import('../servisler/servis-govdesi.mjs').AlanDegeri> | null} */
      let cozulen = null;
      if (!rest && sema) { try { cozulen = govdeCoz(govde, sema).degerler; } catch { cozulen = {}; } }
      /** Alanın gövdedeki düz değeri (tek ve belirgin değilse null). @param {string} yol */
      const alanDegeri = (yol) => {
        if (cozulen) { const v = cozulen[yol]; return v && v.kaynak === 'sabit' ? duzDeger(v.deger) : null; }
        const degerler = rest ? restDegerleri(govdeIcerigi, yol, sablon) : soapYapraklari(govde, yol).filter((y) => !y.ozel).map((y) => y.metin);
        const farkli = [...new Set(degerler)];
        return farkli.length === 1 ? duzDeger(farkli[0]) : null;
      };
      const alanlar = baglar.map(([yol, b]) => ({ yol, sutun: sutunAdi(String(b.sutun)), etiket: b.etiket || '', deger: alanDegeri(yol) }))
        .filter((a) => a.sutun);
      for (const a of alanlar) {
        if (a.deger === null) continue;
        const sutun = /** @type {string} */ (a.sutun);
        const digerleri = alanlar.filter((y) => y !== a && y.etiket === a.etiket && y.deger !== null).map((y) => ({ sutun: /** @type {string} */ (y.sutun), deger: /** @type {string} */ (y.deger) }));
        const e = degerEtkisi({ sutun, deger: a.deger, digerleri, ortamId: null, degisiklikler, eskiSatirlar: eskiler, yeni });
        if (!e) continue;
        const gizli = gizliMi(sutun);
        const anahtar = `servis|${x.id}|alan|${a.yol}`;
        /** @type {Etkilenen} */
        const satir = { ...ortak, anahtar, nitelik: 'alan', alan: a.yol, gizli, eski: gizli ? MASKE : a.deger, yeni: e.durum === 'guncellenebilir' ? (gizli ? MASKE : e.yeni) : null, durum: 'guncellenebilir' };
        satirlar.push(satir);
        if (e.durum === 'belirsiz') { satir.durum = 'belirsiz'; satir.neden = NEDENLER.belirsiz; continue; }
        if (e.durum === 'silindi') { satir.durum = 'silindi-uyari'; satir.neden = NEDENLER.silindi; continue; }
        if (kosuyor) { satir.durum = 'kosuyor'; satir.neden = NEDENLER.kosuyor; continue; }
        const islem = /** @type {Islem} */ ({ tur: 'servis', senaryoId: x.id, yol: a.yol, eski: a.deger, yeni: e.yeni, rest, sablon, kok: sema?.kok ?? hamSema?.kok ?? '' });
        const d = servisIsleminiUygula(govdeIcerigi, /** @type {Extract<Islem, { tur: 'servis' }>} */ (islem));
        if ('neden' in d) { satir.durum = 'atlanacak'; satir.neden = d.neden; continue; }
        islemler.set(anahtar, islem);
      }
    }
  }
  return { satirlar, islemler };
}

/** Servis işlemi (tek alan) içeriğe uygulanır. @param {{ govde: string; yol: string }} icerik @param {Extract<Islem, { tur: 'servis' }>} i @returns {{ sonuc: { govde: string; yol: string } } | { neden: string }} */
function servisIsleminiUygula(icerik, i) {
  if (i.rest) {
    const r = restDegeriniDegistir(icerik, i.yol, i.eski, i.yeni, i.sablon);
    return 'neden' in r ? r : { sonuc: { govde: r.sonuc.govde, yol: String(r.sonuc.yol ?? '') } };
  }
  const r = soapDegeriniDegistir(icerik.govde, i.yol, i.eski, i.yeni, i.kok);
  return 'neden' in r ? r : { sonuc: { ...icerik, govde: r.sonuc } };
}

/**
 * Seçilen işlemleri yazar (çağıran işlemin içinde). Senaryo başına toplanır; servis gövdesinde işlemler sırayla uygulanır, biri
 * uygulanamazsa o senaryo atlanır. Doğrulayıcı hatası ya da yazım hatası fırlatılır (tüm işlem geri alınır).
 * @param {Veritabani} vt @param {string} projeId @param {{ satirlar: Etkilenen[]; islemler: Map<string, Islem> }} plan @param {Set<string>} secilen
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean; yapan?: string }} secenekler
 */
function etkiyiUygula(vt, projeId, plan, secilen, secenekler) {
  /** @type {Map<string, Array<[string, Islem]>>} */
  const senaryolar = new Map();
  for (const [anahtar, i] of plan.islemler) {
    if (!secilen.has(anahtar)) continue;
    const k = `${i.tur.startsWith('servis') ? 'servis' : 'ekran'}|${i.senaryoId}`;
    if (!senaryolar.has(k)) senaryolar.set(k, []);
    /** @type {Array<[string, Islem]>} */ (senaryolar.get(k)).push([anahtar, i]);
  }
  const baslik = (/** @type {string} */ anahtar) => plan.satirlar.find((x) => x.anahtar === anahtar);
  /** @type {Array<{ baslik: string; alan: string; neden: string }>} */
  const atlananlar = [];
  let guncellenenSenaryo = 0;
  let guncellenenAlan = 0;
  for (const [k, liste] of senaryolar) {
    const [tur, senaryoId] = k.split('|');
    if (tur === 'ekran') {
      const s = vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ? AND proje_id = ?', [senaryoId, projeId]);
      if (!s) continue;
      const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
      const kaynak = senaryoKaynagi(icerik);
      if (kaynak && secenekler.kosuyorMu?.(kaynak.dosya, kaynak.ad)) {
        for (const [a] of liste) atlananlar.push({ baslik: baslik(a)?.baslik ?? '', alan: baslik(a)?.alan ?? '', neden: NEDENLER.kosuyor });
        continue;
      }
      const ortamlar = /** @type {Record<string, Nesne>} */ (nesneMi(icerik.ortamlar) ? icerik.ortamlar : {});
      /** @type {Record<string, Nesne>} */
      const ortamVerileri = {};
      /** @type {string[]} */
      const alanlar = [];
      let secimler = /** @type {Record<string, Record<string, string>> | undefined} */ (undefined);
      for (const [, i] of liste) {
        if (i.tur === 'ekran') {
          alanlar.push(i.alan);
          for (const [o, v] of Object.entries(i.ortamDegerleri)) {
            if (!nesneMi(ortamlar[o])) continue;
            ortamVerileri[o] ??= /** @type {Nesne} */ (zarflariCoz(vt, ortamlar[o].veri ?? {}));
            ortamVerileri[o][i.alan] = v;
          }
        } else if (i.tur === 'ekran-secim') {
          secimler ??= JSON.parse(JSON.stringify(nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {}));
          /** @type {Record<string, Record<string, string>>} */ (secimler)[i.grup] = i.secim;
        }
      }
      senaryoOrtamVerileriniYaz(vt, { projeId, id: senaryoId, ortamVerileri, ...(secimler ? { tabloSecimleri: secimler } : {}), denetlenecekAlanlar: alanlar, yapan: secenekler.yapan },
        { kosuyorMu: secenekler.kosuyorMu });
    } else {
      const x = servisSenaryosuGetir(vt, senaryoId);
      if (!x || x.projeId !== projeId) continue;
      if (secenekler.servisKosuyorMu?.(x.id)) {
        for (const [a] of liste) atlananlar.push({ baslik: x.baslik, alan: baslik(a)?.alan ?? '', neden: NEDENLER.kosuyor });
        continue;
      }
      const ic = /** @type {any} */ (x.icerik);
      let govdeIcerigi = { govde: String(ic.govde ?? ''), yol: String(ic.http?.yol ?? '') };
      let secimler = /** @type {Record<string, Record<string, string>> | undefined} */ (undefined);
      let neden = '';
      let hataliAnahtar = '';
      for (const [anahtar, i] of liste) {
        if (i.tur === 'servis') {
          const r = servisIsleminiUygula(govdeIcerigi, i);
          if ('neden' in r) { neden = r.neden; hataliAnahtar = anahtar; break; }
          govdeIcerigi = r.sonuc;
        } else if (i.tur === 'servis-secim') {
          secimler ??= JSON.parse(JSON.stringify(nesneMi(ic.tabloSecimleri) ? ic.tabloSecimleri : {}));
          /** @type {Record<string, Record<string, string>>} */ (secimler)[i.grup] = i.secim;
        }
      }
      if (neden) { atlananlar.push({ baslik: x.baslik, alan: baslik(hataliAnahtar)?.alan ?? '', neden }); continue; }
      const yeniIcerik = { ...ic, govde: govdeIcerigi.govde, ...(ic.http ? { http: { ...ic.http, yol: govdeIcerigi.yol } } : {}), ...(secimler ? { tabloSecimleri: secimler } : {}) };
      servisSenaryosuKaydet(vt, { id: x.id, projeId, servisId: x.servisId, baslik: x.baslik, kapsam: x.kapsam, icerik: yeniIcerik, yapan: secenekler.yapan });
    }
    guncellenenSenaryo++;
    guncellenenAlan += liste.length;
  }
  // Seçilip artık güncellenemeyenler ve güncellenemeyen (koşan / belirsiz / uygulanamayan) etkilenenler de bildirilir.
  for (const x of plan.satirlar) {
    if (plan.islemler.has(x.anahtar)) continue;
    if (x.durum === 'kosuyor' || x.durum === 'belirsiz' || x.durum === 'atlanacak' || (secilen.has(x.anahtar) && x.durum !== 'silindi-uyari')) {
      atlananlar.push({ baslik: x.baslik, alan: x.alan, neden: x.neden ?? '' });
    }
  }
  return { guncellenenSenaryo, guncellenenAlan, atlananlar, uyari: plan.satirlar.filter((x) => x.durum === 'silindi-uyari').length };
}

const GERI_AL = Symbol('geri-al');

/**
 * Tabloyu kaydeder; etki: 'denetle' → etkilenen senaryo varsa HİÇBİR ŞEY yazılmaz, { onayGerekli, etki } döner (yoksa kaydeder);
 * 'uygula' → tablo + guncellenecekler'deki (etkilenen anahtarları) senaryolar tek işlemde yazılır ([] = yalnız tablo). etki
 * verilmezse yalnız tablo (eski davranış). Her durumda karşılıklar değişen değere taşınır.
 * @param {Veritabani} vt
 * @param {Parameters<typeof tabloKaydet>[1] & { etki?: unknown; guncellenecekler?: unknown }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean; yapan?: string }} [secenekler]
 */
export function tabloKaydetEtkiyle(vt, girdi, secenekler = {}) {
  const mod = girdi.etki === 'denetle' || girdi.etki === 'uygula' ? girdi.etki : null;
  const { etki: _e, guncellenecekler: _g, ...kayit } = girdi;
  if (!kayit.id || kayit.id.startsWith(BAGLAM_ONEKI)) return { id: tabloKaydet(vt, kayit), etki: bosEtki() };
  acikAnahtar(vt);
  const [eski] = tablolariListele(vt, kayit.projeId, { cozulsun: true, tabloId: kayit.id });
  if (!eski) throw new DepoHatasi('Tablo bulunamadı.');
  const tasima = sutunTasimasi(eski, kayit.sutunlar);
  const secilen = new Set(Array.isArray(girdi.guncellenecekler) ? girdi.guncellenecekler.filter((x) => typeof x === 'string') : []);
  /** @type {any} */
  let sonuc = null;
  try {
    vt.islem(() => {
      const id = tabloKaydet(vt, kayit);
      let [yeni] = tablolariListele(vt, kayit.projeId, { cozulsun: true, tabloId: id });
      const degisiklikler = hucreDegisiklikleri(eski, yeni, tasima);
      const k = karsiliklariTasi(yeni, degisiklikler);
      if (k.sutunlar.size) {
        tabloKaydet(vt, { projeId: kayit.projeId, id, ad: yeni.ad,
          sutunlar: yeni.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli, ...(k.sutunlar.has(s.ad) ? { karsiliklar: k.sutunlar.get(s.ad) } : {}) })) });
        [yeni] = tablolariListele(vt, kayit.projeId, { cozulsun: true, tabloId: id });
      }
      const plan = mod ? etkiPlani(vt, kayit.projeId, { eski, yeni, tasima, degisiklikler }, secenekler) : { satirlar: [], islemler: new Map() };
      const etki = {
        degisiklikler: degisiklikler.map((d) => ({ satir: d.satirAdi, sutun: d.sutun, gizli: d.gizli, eski: d.gizli ? MASKE : d.eski, yeni: d.yeni === null ? null : d.gizli ? MASKE : d.yeni })),
        etkilenenler: plan.satirlar, karsiliklar: k.bilgi
      };
      if (mod === 'denetle' && plan.satirlar.length) { sonuc = { id, onayGerekli: true, etki }; throw GERI_AL; }
      const guncelleme = mod === 'uygula' ? etkiyiUygula(vt, kayit.projeId, plan, secilen, secenekler) : null;
      sonuc = { id, etki, ...(guncelleme ? { guncelleme } : {}) };
    });
  } catch (e) {
    if (e !== GERI_AL) throw e;
  }
  return /** @type {{ id: string; onayGerekli?: true; etki: ReturnType<typeof bosEtki>; guncelleme?: ReturnType<typeof etkiyiUygula> }} */ (sonuc);
}

/** @returns {{ degisiklikler: Array<{ satir: string; sutun: string; gizli: boolean; eski: string; yeni: string | null }>; etkilenenler: Etkilenen[]; karsiliklar: Array<{ sutun: string; eski: string; yeni: string }> }} */
function bosEtki() { return { degisiklikler: [], etkilenenler: [], karsiliklar: [] }; }

