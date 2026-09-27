// EKRAN MEZAR TAŞI (silinmiş ekran; ekranlar.silinme_json) okuyucusu — ekran-servisi.mjs ile ekran-yonetimi.mjs arasında
// döngüsel içe aktarma olmasın diye ayrı modül. NOT: import.meta KULLANILMAZ. Tip: ekran-yonetimi.d.mts > MezarTasi.

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Mezar taşı bilgisi (yoksa null). @param {unknown} ham */
export function mezarTasiOku(ham) {
  if (typeof ham !== 'string' || !ham) return null;
  try {
    const d = JSON.parse(ham);
    if (!nesneMi(d)) return null;
    return /** @type {import('./ekran-yonetimi.d.mts').MezarTasi} */ ({
      zaman: typeof d.zaman === 'string' ? d.zaman : '', sonuclarSilindi: d.sonuclarSilindi === true, onceki: nesneMi(d.onceki) ? d.onceki : {}
    });
  } catch {
    return null;
  }
}

