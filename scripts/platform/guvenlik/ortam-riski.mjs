// RİSKLİ ORTAM — TEK TANIM, KULLANICI SEÇİMİ (sunucu ve arayüz aynı modülü kullanır; arayüze /arayuz/ortam-riski.mjs olarak sunulur).
// Ortam formundaki soru: "Bu ortam riskli mi? (gerçek işlem oluşturabilir)" → Evet / Hayır. Saklama: ortam.ayarlar.riskli
// (true | false | yok). Kural YALNIZ seçime bakar:
//   riskli === true  → riskli
//   riskli === false → riskli değil
//   belirtilmemiş    → riskli (güvenli taraf; arayüz "Riskli mi? belirtin" uyarısı gösterir)
// Geriye uyum: eski "Bu ortam canlı" işareti (ayarlar.canli === true) seçim yoksa "Evet" sayılır (kaydedilince riskli yazılır).
// "Varsayılan ortam" (yalnız başlangıç ortamı) ve ortamın ADI riski belirlemez; ad canlıyı çağrıştırıyorsa ve "Hayır" seçilirse
// kaydederken yalnızca onay istenir (adCanliyiCagristiriyorMu).
// Arayüz görünümlerinde (ör. /platform/ortamlar) ortam { riskli: true | false | null, canli: <etkin risk> } olarak gelir; bu
// fonksiyonlar iki biçimi de okur. Saf modül: hiçbir şey içe aktarmaz (tarayıcıda da çalışır).

/** Kullanıcıya gösterilen tanım (Ayarlar, İzinler "?" açıklaması ve rehber bu metni kullanır). */
export const RISKLI_ORTAM_TANIMI = 'Riskli ortam: ortam formunda "Bu ortam riskli mi? (gerçek işlem oluşturabilir)" sorusuna "Evet" dediğiniz ortam. '
  + 'Soru henüz yanıtlanmamışsa ortam riskli sayılır. Varsayılan ortam olması ya da adı riski değiştirmez.';

const CANLI_AD_DESENI = /canl|prod|uretim|üretim/i;

/**
 * @typedef {{ riskli?: unknown; canli?: unknown; ad?: unknown; ayarlar?: { riskli?: unknown; canli?: unknown } | null } | null | undefined} RiskOrtami
 */

/** @param {RiskOrtami} ortam @returns {Record<string, unknown>} */
const ayarlari = (ortam) => (ortam && typeof ortam.ayarlar === 'object' && ortam.ayarlar !== null ? /** @type {Record<string, unknown>} */ (ortam.ayarlar) : {});

/**
 * Kullanıcının seçimi: true (Evet) | false (Hayır) | null (belirtilmemiş). Eski canli işareti "Evet" sayılır.
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

/** Ortam riskli mi (gerçek işlem oluşturabilir)? Belirtilmemiş → riskli. @param {RiskOrtami} ortam */
export function riskliOrtamMi(ortam) {
  if (!ortam) return false;
  return riskliSecimi(ortam) !== false;
}

/** Riskli olup olmadığı henüz belirtilmemiş mi? @param {RiskOrtami} ortam */
export function riskBelirtilmemisMi(ortam) {
  return Boolean(ortam) && riskliSecimi(ortam) === null;
}

/** Ad canlı / üretim çağrıştırıyor mu? (Yalnız "Hayır" seçilirken uyarı; riski belirlemez.) @param {unknown} ad */
export function adCanliyiCagristiriyorMu(ad) {
  return CANLI_AD_DESENI.test(String(ad ?? ''));
}

/** @deprecated Eski ad: riskliOrtamMi ile aynı. @param {RiskOrtami} ortam */
export const canliIsaretliMi = (ortam) => riskliOrtamMi(ortam);
