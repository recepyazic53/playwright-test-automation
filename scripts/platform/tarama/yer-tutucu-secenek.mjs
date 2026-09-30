// YER TUTUCU SEÇENEK (saf; genel — ürün / site adı yok). Açılır listenin "SEÇİNİZ", "Seçiniz", "-- Lütfen seçin --", "Ülke seçiniz",
// "Please select", "--" gibi seçeneği ya da listenin İLK seçeneği değeri "" / "0" / "-1" ve metninde rakam yoksa: gerçek bir değer
// değil, "henüz seçilmedi" demektir. Bu seçenekte kalan liste doldurulması gereken alandır; test verisi tablosuna / modelin seçenek
// listesine yazılmaz. Sayfa içindeki eşi: sayfa-envanteri.ts > yerTutucuMu (sayfa betiği içe aktaramadığı için aynı kural).
// NOT: import.meta KULLANILMAZ. Tipler: yer-tutucu-secenek.d.mts.

/**
 * @param {unknown} metin seçeneğin görünen metni @param {unknown} deger seçeneğin değeri (value) @param {boolean} ilk listenin ilk seçeneği mi
 * @returns {boolean}
 */
export function yerTutucuSecenekMi(metin, deger, ilk) {
  const n = String(metin ?? '').toLocaleLowerCase('tr').replace(/[\s\-–—.…*:_()[\]<>«»"'!]+/g, ' ').trim();
  if (!n) return true;
  if (/^(?:(?:\p{L}+ ){0,3})?(?:lütfen )?(?:bir )?(?:seç|seçiniz|seçin|seçim yapınız|seçim yapın|seçiniz lütfen)$/u.test(n)) return true;
  if (/^(?:please )?(?:select|choose)(?: (?:one|an? \p{L}+|\p{L}+))?$/u.test(n)) return true;
  return ilk && ['', '0', '-1'].includes(String(deger ?? '').trim()) && !/\d/.test(n);
}
