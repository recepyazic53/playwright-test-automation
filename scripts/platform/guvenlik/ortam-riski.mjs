// ORTAM TÜRÜ (TEST / CANLI) — TEK TANIM, KULLANICI SEÇİMİ (sunucu ve arayüz aynı modülü kullanır; arayüze /arayuz/ortam-riski.mjs olarak sunulur).
// Ortam formundaki soru: "Ortam türü" → Test / Canlı (zorunlu). Saklama GERİYE UYUMLU: ortam.ayarlar.riskli (true = Canlı,
// false = Test, yok = seçilmemiş). Kural YALNIZ seçime bakar:
//   riskli === true  → Canlı
//   riskli === false → Test
//   belirtilmemiş    → Canlı (güvenli taraf; eski kayıt — arayüz "Ortam türünü seçin" uyarısı gösterir)
// Geriye uyum: eski "Bu ortam canlı" işareti (ayarlar.canli === true) seçim yoksa Canlı sayılır (kaydedilince riskli yazılır).
// "Varsayılan ortam" (yalnız başlangıç ortamı) ve ortamın ADI türü belirlemez; ad canlıyı çağrıştırıyorsa ve Test seçilirse
// kaydederken yalnızca onay istenir (adCanliyiCagristiriyorMu).
// Canlı ortamda KESİN YASAK YOKTUR: kullanıcının başlattığı her istek "CANLI ortam" onayıyla gider (guvenlik/uc-denetimi.mjs).
// Arayüz görünümlerinde (ör. /platform/ortamlar) ortam { riskli: true | false | null, canli: <etkin tür> } olarak gelir; bu
// fonksiyonlar iki biçimi de okur. Saf modül: hiçbir şey içe aktarmaz (tarayıcıda da çalışır).
// Not: fonksiyon adlarındaki "riskli" = Canlı ortam (tarihsel ad; saklama alanıyla aynı).

/** Kullanıcıya gösterilen tanım (Ayarlar, İzinler "?" açıklaması ve rehber bu metni kullanır). */
export const RISKLI_ORTAM_TANIMI = 'Canlı ortam: ortam formunda "Ortam türü" olarak Canlı seçtiğiniz ortam. Türü henüz seçilmemiş (eski) ortamlar Canlı sayılır. '
  + 'Canlı ortama istek atan her işlemde "Bu işlem CANLI ortamda yapılacak, emin misiniz?" diye sorulur. Varsayılan ortam olması ya da adı türü değiştirmez.';

const CANLI_AD_DESENI = /canl|prod|uretim|üretim/i;

/**
 * @typedef {{ riskli?: unknown; canli?: unknown; ad?: unknown; ayarlar?: { riskli?: unknown; canli?: unknown } | null } | null | undefined} RiskOrtami
 */

/** @param {RiskOrtami} ortam @returns {Record<string, unknown>} */
const ayarlari = (ortam) => (ortam && typeof ortam.ayarlar === 'object' && ortam.ayarlar !== null ? /** @type {Record<string, unknown>} */ (ortam.ayarlar) : {});

/**
 * Kullanıcının seçimi: true (Canlı) | false (Test) | null (seçilmemiş). Eski canli işareti Canlı sayılır.
 * @param {RiskOrtami} ortam @returns {boolean | null}
 */
export function riskliSecimi(ortam) {
  if (!ortam) return null;
  const a = ayarlari(ortam);
  if (typeof a.riskli === 'boolean') return a.riskli;
  if ('ayarlar' in ortam) return a.canli === true ? true : null;
  // Arayüz görünümü: riskli (seçim) alanı; yoksa canli (etkin risk ya da eski işaret) — ikisi de yoksa belirtilmemiş.
  if (typeof ortam.riskli === 'boolean') return ortam.riskli;
  if (ortam.riskli === null) return null;
  return typeof ortam.canli === 'boolean' ? ortam.canli : null;
}

/** Ortam Canlı mı (Ortam türü: Canlı)? Belirtilmemiş → Canlı. @param {RiskOrtami} ortam */
export function riskliOrtamMi(ortam) {
  if (!ortam) return false;
  return riskliSecimi(ortam) !== false;
}

/** Ortam türü henüz seçilmemiş mi? @param {RiskOrtami} ortam */
export function riskBelirtilmemisMi(ortam) {
  return Boolean(ortam) && riskliSecimi(ortam) === null;
}

/** Ad canlı / üretim çağrıştırıyor mu? (Yalnız Test seçilirken onay; türü belirlemez.) @param {unknown} ad */
export function adCanliyiCagristiriyorMu(ad) {
  return CANLI_AD_DESENI.test(String(ad ?? ''));
}

/** @deprecated Eski ad: riskliOrtamMi ile aynı. @param {RiskOrtami} ortam */
export const canliIsaretliMi = (ortam) => riskliOrtamMi(ortam);
