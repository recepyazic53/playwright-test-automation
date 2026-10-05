// ALAN KİLİDİ KARARI — hızlı test (hizli-test/yonetici.mjs) ve normal koşunun (tests/support/model-kosucu.ts) ORTAK kuralı. Kilidin
// nedeni sayfadan okunur (tarama/sayfa-envanteri.ts > alanKilidi, salt okuma); burada yalnız "bu neden alanı DÜZENLENEMEZ kılar mı"
// kararı verilir. Genel kural: alan / ekran / ürün adı yoktur.
//   · Sert kilitler (seçime bağlı olmadan da düzenlenemez): aria-devre-disi, takvim-kilidi, tus-deger.
//   · 'tus-deger' (tuş basımı ve elle değer değişikliği sayfanın betiğiyle engelli) yalnız TUŞLA yazmayı etkiler: değeri betikle
//     (tuşsuz) veren doldurucu (tarihJs, degerJs, takvimden seçim, "zorla" doldurucular) için kilit değildir.
//   · Seçime göre kilitlenen alanda (seciminGore) her neden kilittir — betikle yazılan alanda 'tus-deger' yine hariç.

/** Seçime bağlı olmadan da düzenlenemez sayılan kilitler. */
export const SERT_KILITLER = new Set(['aria-devre-disi', 'takvim-kilidi', 'tus-deger']);

/** Değeri betikle (tuş olayı olmadan) yazan doldurucular. */
export const BETIKLE_YAZAN_DOLDURUCULAR = new Set(['tarihJs', 'degerJs', 'radyoZorla', 'onayKutusuZorla', 'ozelSecim']);

/**
 * Okunan kilit nedeni alanı düzenlenemez kılıyor mu?
 * @param {string | null | undefined} kilit alanKilidi sonucu
 * @param {{ betikle?: boolean; seciminGore?: boolean }} [s] betikle: değer tuşsuz yazılır; seciminGore: alan seçime göre kilitlenir
 * @returns {boolean}
 */
export function kilitEngeller(kilit, s = {}) {
  if (!kilit) return false;
  if (kilit === 'tus-deger' && s.betikle === true) return false;
  return s.seciminGore === true || SERT_KILITLER.has(kilit);
}
