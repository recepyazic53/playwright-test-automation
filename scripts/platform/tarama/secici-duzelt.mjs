// METİN SEÇİCİSİ DÜZELTME — kayıt paneli / öğe seçme eskiden düğme ve bağlantılar için `tag:text-is("Görünen metin")` yazıyordu.
// Playwright'ın :text-is() seçicisi yalnız metni DOĞRUDAN taşıyan EN KÜÇÜK öğeyle eşleşir; metin iç içe öğelerdeyse
// (`<button><em><span>KAYDET</span></em></button>`) `button:text-is("KAYDET")` HİÇBİR ŞEYLE eşleşmez (eşleşen `span`'dır) ve tıklama
// yapılamaz. Ayrıca `<input type="button" value="…">` metni öğe metni değil değerdir; :text-is onu hiç bulamaz.
// Düzeltilmiş biçim:
//   tag:text-is("X")            → tag:is(:text-is("X"), :has(:text-is("X")))   (metin doğrudan ya da iç içe; tam eşleşme kalır)
//   input:text-is("X")          → input[value="X"]
// Fonksiyon idempotenttir; başka seçicilere dokunmaz. Eski kayıtlı tarifler / modeller çalışırken bu işlemden geçer (dosyaya yeniden yazılmaz).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).

const TIRNAKLI = '"(?:[^"\\\\]|\\\\.)*"';
const DESEN = new RegExp(`(^|[\\s>+~,(])([A-Za-z][\\w-]*):text-is\\((${TIRNAKLI})\\)`, 'g');

/** @param {string} secici */
export function metinSeciciDuzelt(secici) {
  if (typeof secici !== 'string' || !secici.includes(':text-is(')) return secici;
  return secici.replace(DESEN, (_tam, once, etiket, metin) => (etiket.toLowerCase() === 'input'
    ? `${once}input[value=${metin}]`
    : `${once}${etiket}:is(:text-is(${metin}), :has(:text-is(${metin})))`));
}

/**
 * Nesne ağacındaki (tarif, ekran modeli, plan) TÜM metin değerlerinde :text-is düzeltmesi yapar; yeni ağaç döndürür (girdiye dokunmaz).
 * @template T @param {T} veri @returns {T}
 */
export function seciciAgaciniDuzelt(veri) {
  if (typeof veri === 'string') return /** @type {any} */ (metinSeciciDuzelt(veri));
  if (Array.isArray(veri)) return /** @type {any} */ (veri.map((x) => seciciAgaciniDuzelt(x)));
  if (veri && typeof veri === 'object') {
    /** @type {Record<string, unknown>} */
    const sonuc = {};
    for (const [k, v] of Object.entries(veri)) sonuc[k] = seciciAgaciniDuzelt(v);
    return /** @type {any} */ (sonuc);
  }
  return veri;
}
