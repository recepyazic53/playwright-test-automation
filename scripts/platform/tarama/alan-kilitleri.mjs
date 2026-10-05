// ALAN KİLİDİ KARARI — hızlı test (hizli-test/yonetici.mjs) ve normal koşunun (tests/support/model-kosucu.ts) ORTAK kuralı. Kilidin
// nedeni sayfadan okunur (tarama/sayfa-envanteri.ts > alanKilidi, salt okuma); burada yalnız "bu neden alanı ÖNDEN atlatır mı" kararı
// verilir. Genel kural: alan / ekran / ürün adı yoktur.
// İLKE: önce DENE. Sınıf / ARIA / olay işleyicisi gibi sezgiler alanı önden atlatmaz: alan yazılır, değer tutmazsa ve sayfa önceki
// değeri geri yazdıysa yazma yolu (alan-cikisi.ts > alanaYaz → 'kilitli') "sayfa dolduruyor" notunu düşer. Önden atlatan kesin kanıtlar
// (disabled, readonly / aria-readonly, görünmez) koşucuda ayrıca denetlenir. Burada kalan tek önden atlama: model alanın SEÇİME GÖRE
// kilitlendiğini açıkça söylüyor (keşif kaydetti) ve sayfa şu an kilit gösteriyor.

/** Değeri betikle (tuş olayı olmadan) yazan doldurucular. */
export const BETIKLE_YAZAN_DOLDURUCULAR = new Set(['tarihJs', 'degerJs', 'radyoZorla', 'onayKutusuZorla', 'ozelSecim']);

/**
 * Okunan kilit nedeni alanı önden atlatır mı: yalnız seçime göre kilitlenen alanda (model açıkça söylüyor) ve sayfa şu an bir kilit
 * gösteriyorsa.
 * @param {string | null | undefined} kilit alanKilidi sonucu
 * @param {{ seciminGore?: boolean }} [s] seciminGore: model alanın seçime göre kilitlendiğini söylüyor
 * @returns {boolean}
 */
export function kilitEngeller(kilit, s = {}) {
  return Boolean(kilit) && s.seciminGore === true;
}
