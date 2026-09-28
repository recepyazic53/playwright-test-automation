// SÜRE YÜZDELİKLERİ (saf): p50 / p95 / p99 (EN YAKIN SIRA yöntemi: pX = sıralı[ceil(X/100 × n) − 1]) ve "yavaşlayan metot" kuralı.
// Kullanan: sonuclar/donem-raporu.mjs (servis süreleri, senaryo süreleri).

/** p99 yalnız bu kadar ölçümden sonra gösterilir (küçük örnekte anlamsız). */
export const P99_EN_AZ = 20;
/** Yavaşlama: p95 ≥ önceki p95 × KATSAYI ve ölçüm ≥ EN_AZ. */
export const YAVASLAMA_KATSAYISI = 1.2;
export const YAVASLAMA_EN_AZ = 20;

/** @param {ReadonlyArray<unknown>} degerler @returns {number[]} */
const sirala = (degerler) => degerler.filter((x) => typeof x === 'number' && Number.isFinite(x)).map(Number).sort((a, b) => a - b);

/** @param {number[]} sirali @param {number} x */
function sirasi(sirali, x) {
  if (!sirali.length) return null;
  const i = Math.min(sirali.length - 1, Math.max(0, Math.ceil((x / 100) * sirali.length) - 1));
  return sirali[i];
}

/** Tek yüzdelik (boş dizide null). @param {ReadonlyArray<unknown>} degerler @param {number} x 0–100 */
export function yuzdelik(degerler, x) {
  return sirasi(sirala(degerler), x);
}

/**
 * p50 / p95 / p99 (n < P99_EN_AZ ise p99 null), ortalama ve ölçüm sayısı.
 * @param {ReadonlyArray<unknown>} degerler
 * @returns {{ n: number; p50: number | null; p95: number | null; p99: number | null; ortalama: number | null }}
 */
export function yuzdelikler(degerler) {
  const s = sirala(degerler);
  return {
    n: s.length, p50: sirasi(s, 50), p95: sirasi(s, 95), p99: s.length >= P99_EN_AZ ? sirasi(s, 99) : null,
    ortalama: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
  };
}

/**
 * Yavaşladı mı: p95 ≥ 1,2 × önceki p95 ve bu dönemdeki ölçüm ≥ 20.
 * @param {number | null | undefined} p95 @param {number | null | undefined} oncekiP95 @param {number} n
 */
export function yavasladiMi(p95, oncekiP95, n) {
  if (p95 == null || oncekiP95 == null || oncekiP95 <= 0) return false;
  return n >= YAVASLAMA_EN_AZ && p95 >= YAVASLAMA_KATSAYISI * oncekiP95;
}
