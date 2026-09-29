// KOŞU AYARLARI — HAZIR PROFİLLER (Ayarlar > Koşu: "Kanıt düzeyi" ve "Ortam hızı"). Profil ayrı bir değer olarak SAKLANMAZ:
// seçilen profil ilgili ayarları topluca doldurur, kullanıcı Kaydet'e basınca ayarlar (kosu-ayarlari.mjs) her zamanki gibi yazılır.
// Gösterilen profil kayıtlı değerlerden türetilir: değerler bir profile birebir uyuyorsa o profil, uymuyorsa "Özel". Böylece
// eski kurulumlar göç gerektirmez; elle değiştirilen tek bir ayar profili "Özel" yapar.
// Bağımlılığı yoktur (tarayıcıda da çalışır; arayüze /arayuz/kosu-profilleri.mjs olarak sunulur).
// "Dengeli" ve "Normal" bugünkü varsayılanlardır (tests/birim/kosu-profilleri.spec.ts tanımlardaki varsayılanlarla karşılaştırır).

/** Kanıt düzeyinin belirlediği kayıt ayarları (Ayarlar > Koşu > Kayıt). */
export const KANIT_ALANLARI = Object.freeze(['video', 'videoBoyutu', 'ekranGoruntusu', 'adimGoruntusu', 'iz', 'indirilenDosya']);

/**
 * @type {ReadonlyArray<{ ad: 'hafif' | 'dengeli' | 'tam'; etiket: string; ozet: string; aciklama: string; degerler: Readonly<Record<string, string>> }>}
 */
export const KANIT_PROFILLERI = Object.freeze([
  {
    ad: 'hafif', etiket: 'Hafif', ozet: 'yalnız kalanlarda',
    aciklama: 'Video kapalı; ekran görüntüsü, iz ve adım görüntüsü yalnız kalan testlerde (kalan adımda). Doğrulanan dosya saklanmaz.',
    degerler: Object.freeze({ video: 'kapali', videoBoyutu: 'kucuk', ekranGoruntusu: 'yalnizHata', adimGoruntusu: 'yalnizKalan', iz: 'yalnizHata', indirilenDosya: 'kapali' })
  },
  {
    ad: 'dengeli', etiket: 'Dengeli', ozet: 'bugünkü varsayılan',
    aciklama: 'Video her testte (küçük), iz ve test sonu görüntüsü yalnız kalan testlerde, adım görüntüleri her adımda. Doğrulanan dosya saklanmaz.',
    degerler: Object.freeze({ video: 'her', videoBoyutu: 'kucuk', ekranGoruntusu: 'yalnizHata', adimGoruntusu: 'her', iz: 'yalnizHata', indirilenDosya: 'kapali' })
  },
  {
    ad: 'tam', etiket: 'Tam kanıt', ozet: 'her testte her şey',
    aciklama: 'Video (ekranla aynı boyutta), iz, test sonu ve adım görüntüleri her testte; doğrulanan dosya her zaman rapora eklenir. Kayıtlar büyür.',
    degerler: Object.freeze({ video: 'her', videoBoyutu: 'ekran', ekranGoruntusu: 'her', adimGoruntusu: 'her', iz: 'her', indirilenDosya: 'her' })
  }
]);

/**
 * Ortam hızının çarpanla belirlediği zaman aşımı ve bekleme ayarları (süre ayarlarının 15'i). "Arası bekleme" ayarları
 * (servis istekleri arası, ekran senaryoları arası) koşu hızına aittir ve ortam bazında ezilir; bu hesaba girmez.
 */
export const HIZ_ALANLARI = Object.freeze([
  'kosuSureLimitiDk', 'alanBeklemeSn', 'zorlaIsaretlemeSn', 'servisZamanAsimiSn', 'taramaZamanAsimiDk', 'kayitZamanAsimiDk', 'taramaSayfaAcilmaSn',
  'taramaOturumKontrolSn', 'taramaGirisAlanBeklemeSn', 'gorunmeyenAlanBeklemeSn', 'alanSonrasiKosulSn', 'arkaPlanIstekSn', 'adimGostergeSn',
  'oturumKontrolSn', 'girisAlanBeklemeSn'
]);

/** @type {ReadonlyArray<{ ad: 'hizli' | 'normal' | 'yavas'; etiket: string; ozet: string; carpan: number }>} */
export const HIZ_PROFILLERI = Object.freeze([
  { ad: 'hizli', etiket: 'Hızlı', ozet: '×0,7', carpan: 0.7 },
  { ad: 'normal', etiket: 'Normal', ozet: '×1', carpan: 1 },
  { ad: 'yavas', etiket: 'Yavaş', ozet: '×2', carpan: 2 }
]);

/** @typedef {{ anahtar: string; varsayilan: unknown; enAz?: number; enCok?: number }} ProfilTanimi */

/** @param {ReadonlyArray<ProfilTanimi>} tanimlar @param {string} anahtar */
const tanimBul = (tanimlar, anahtar) => tanimlar.find((t) => t.anahtar === anahtar);

/**
 * Kanıt profilinin ayar değerleri. @param {string} ad @returns {Record<string, string> | null} bilinmeyen profilde null
 */
export function kanitDegerleri(ad) {
  const p = KANIT_PROFILLERI.find((x) => x.ad === ad);
  return p ? { ...p.degerler } : null;
}

/**
 * Hız profilinin ayar değerleri: her süre ayarının VARSAYILANI × çarpan (tam sayıya yuvarlanır, ayarın sınırları içinde kalır).
 * @param {ReadonlyArray<ProfilTanimi>} tanimlar ayar tanımları (KOSU_AYAR_TANIMLARI) @param {string} ad
 * @returns {Record<string, number> | null} bilinmeyen profilde null
 */
export function hizDegerleri(tanimlar, ad) {
  const p = HIZ_PROFILLERI.find((x) => x.ad === ad);
  if (!p) return null;
  /** @type {Record<string, number>} */
  const sonuc = {};
  for (const a of HIZ_ALANLARI) {
    const t = tanimBul(tanimlar, a);
    if (!t || typeof t.varsayilan !== 'number') continue;
    const ham = Math.round(t.varsayilan * p.carpan);
    sonuc[a] = Math.min(t.enCok ?? ham, Math.max(t.enAz ?? ham, ham));
  }
  return sonuc;
}

/** Değerler (sayı / metin karşılaştırması) bir profilin değerlerine birebir uyuyor mu. @param {Record<string, unknown>} ayarlar @param {Record<string, unknown>} degerler */
const uyar = (ayarlar, degerler) => Object.entries(degerler).every(([a, v]) => String(ayarlar[a]) === String(v));

/**
 * Kayıtlı ayarların kanıt profili (gösterim için; saklanmaz). @param {Record<string, unknown>} ayarlar
 * @returns {'hafif' | 'dengeli' | 'tam' | 'ozel'}
 */
export function kanitProfili(ayarlar) {
  return KANIT_PROFILLERI.find((p) => uyar(ayarlar, p.degerler))?.ad ?? 'ozel';
}

/**
 * Kayıtlı ayarların hız profili (gösterim için; saklanmaz). @param {Record<string, unknown>} ayarlar @param {ReadonlyArray<ProfilTanimi>} tanimlar
 * @returns {'hizli' | 'normal' | 'yavas' | 'ozel'}
 */
export function hizProfili(ayarlar, tanimlar) {
  return HIZ_PROFILLERI.find((p) => uyar(ayarlar, /** @type {Record<string, number>} */ (hizDegerleri(tanimlar, p.ad))))?.ad ?? 'ozel';
}
