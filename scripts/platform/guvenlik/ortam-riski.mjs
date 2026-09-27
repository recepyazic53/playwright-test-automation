// RİSKLİ ORTAM — TEK TANIM (sunucu ve arayüz aynı modülü kullanır; arayüze /arayuz/ortam-riski.mjs olarak sunulur).
// Bir ortam "riskli"dir (gerçek işlem oluşturabilir) eğer:
//   - CANLI olarak işaretliyse (sunucuda ortam.ayarlar.canli === true; arayüz görünümünde ortam.canli === true), YA DA
//   - varsayılan test ortamı değilse, YA DA
//   - adı canlı / üretim çağrıştırıyorsa (canl, prod, uretim, üretim).
// Riskli ortamda koşu / Dene / tarama: Ayarlar > İzinler > "Canlı / riskli ortamda çalıştırma" izni + her seferinde açık onay
// (istekte canliOnay: true). Servis tarafında ortam türü (test | canli) de bu tanımdan gelir (servis-islemleri.mjs > ortamTuru).
// Saf modül: hiçbir şey içe aktarmaz (tarayıcıda da çalışır).

const RISKLI_AD_DESENI = /canl|prod|uretim|üretim/i;

/**
 * @param {{ canli?: unknown; varsayilan?: unknown; ad?: unknown; ayarlar?: { canli?: unknown } | null } | null | undefined} ortam
 * @returns {boolean}
 */
export function riskliOrtamMi(ortam) {
  if (!ortam) return false;
  const canli = ortam.canli === true || (typeof ortam.ayarlar === 'object' && ortam.ayarlar !== null && ortam.ayarlar.canli === true);
  return canli || !ortam.varsayilan || RISKLI_AD_DESENI.test(String(ortam.ad ?? ''));
}

/** Ortam CANLI olarak işaretli mi (yalnız işaret; ad / varsayılan sezgisi yok)? @param {Parameters<typeof riskliOrtamMi>[0]} ortam */
export function canliIsaretliMi(ortam) {
  if (!ortam) return false;
  return ortam.canli === true || (typeof ortam.ayarlar === 'object' && ortam.ayarlar !== null && ortam.ayarlar.canli === true);
}
