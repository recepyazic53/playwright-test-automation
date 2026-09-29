// İZİN PAKETLERİ — "Nöbetçi sizin adınıza neleri yapabilsin?" (ilk kurulum sihirbazı ve Ayarlar > İzinler). Paket, izinleri tek
// tek açmanın kısayoludur: seçilen paketin açacağı izinler riskleriyle tek listede gösterilir, kullanıcı tek onayla açar; paket
// ayrıca saklanmaz ve hiçbir izni KAPATMAZ (kapatma her zaman Ayarlar > İzinler'den, tek tek). Değişiklikler izin geçmişine yazılır
// (izinler.mjs > izinPaketiUygula). "Canlı ortamda çalıştırma" yalnız ayrı "Canlı ortamda da çalıştırabilsin" kutusuyla eklenir
// (varsayılan işaretsiz); bu kutu canlı ortamdaki her işlemden önce sorulan "CANLI ortam" onayını KALDIRMAZ.
// Veritabanına yazma, sistem değişikliği ve güvenlik gevşetme HİÇBİR pakete ve kutuya girmez; bunlar her zaman tek tek açılır.
// Bağımlılığı yoktur (tarayıcıda da çalışır; arayüze /arayuz/izin-paketleri.mjs olarak sunulur).

/** Hiçbir pakette, "Özel" seçimde ve canlı kutusunda yer almayan izinler (her zaman tek tek, Ayarlar > İzinler'den). */
export const PAKET_DISI_IZINLER = Object.freeze(['veritabani-yazma', 'sistem-degisikligi', 'guvenlik-gevsetme']);
/** Yalnız "Canlı ortamda da çalıştırabilsin" kutusuyla eklenen izin. */
export const CANLI_IZNI = 'canli-ortam';
/** "Özel…" seçiminde işaretlenebilen izinler. */
export const OZEL_SECILEBILIR = Object.freeze(['web-erisimi', 'servis-istekleri', 'giris-bilgisi', 'veritabani-okuma', 'dis-gonderim', 'arka-plan']);

/** @type {ReadonlyArray<{ ad: 'hicbiri' | 'test' | 'test-veritabani' | 'ozel'; etiket: string; ozet: string; izinler: readonly string[] | null }>} */
export const IZIN_PAKETLERI = Object.freeze([
  { ad: 'hicbiri', etiket: 'Hiçbiri', ozet: 'her işlemde sorulsun', izinler: Object.freeze([]) },
  { ad: 'test', etiket: 'Test ortamında ekran ve servis testi', ozet: '3 izin', izinler: Object.freeze(['web-erisimi', 'servis-istekleri', 'giris-bilgisi']) },
  { ad: 'test-veritabani', etiket: 'Test + veritabanı okuma', ozet: '4 izin', izinler: Object.freeze(['web-erisimi', 'servis-istekleri', 'giris-bilgisi', 'veritabani-okuma']) },
  { ad: 'ozel', etiket: 'Özel…', ozet: 'izinleri siz seçin', izinler: null }
]);

/**
 * Seçimin açacağı izinler (sıralı, tekrarsız). Geçersiz seçim (bilinmeyen paket, "Özel"de paket dışı ya da bilinmeyen izin) hata.
 * @param {{ paket: unknown; canli?: unknown; ozel?: unknown }} secim
 * @returns {string[]}
 */
export function paketIzinleri(secim) {
  const p = IZIN_PAKETLERI.find((x) => x.ad === secim?.paket);
  if (!p) throw new Error('Bilinmeyen izin paketi.');
  if (secim.canli !== undefined && typeof secim.canli !== 'boolean') throw new Error('"Canlı ortamda da çalıştırabilsin" true ya da false olmalıdır.');
  /** @type {string[]} */
  let izinler;
  if (p.izinler) izinler = [...p.izinler];
  else {
    const ozel = secim.ozel === undefined ? [] : secim.ozel;
    if (!Array.isArray(ozel)) throw new Error('"Özel" izin listesi bir dizi olmalıdır.');
    for (const a of ozel) {
      if (!OZEL_SECILEBILIR.includes(String(a))) {
        throw new Error(PAKET_DISI_IZINLER.includes(String(a)) || a === CANLI_IZNI
          ? `"${String(a)}" izni pakete girmez; Ayarlar > İzinler'den tek tek açılır${a === CANLI_IZNI ? ' (ya da "Canlı ortamda da çalıştırabilsin" kutusuyla)' : ''}.`
          : `Bilinmeyen izin: "${String(a)}".`);
      }
    }
    izinler = OZEL_SECILEBILIR.filter((a) => ozel.includes(a));
  }
  if (secim.canli === true) izinler.push(CANLI_IZNI);
  return izinler;
}
