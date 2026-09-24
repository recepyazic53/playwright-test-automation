// Hata sınıflandırma ve durum eşleme (saf fonksiyonlar): kategori, hata kalıbı,
// Allure durumu -> dashboard durumu, koşu etiketi.
//
// Kategori tanımları playwright.config.ts'teki allure-playwright "categories"
// listesiyle aynı mantığı kullanır; ikisini birlikte güncelleyin.

// Kategori ADLARI ve SIRASI (istemci tarafında renk eşlemesi bu sıraya göre yapılır —
// bkz. KATEGORI_RENKLERI). Sınıflandırma MANTIĞI ise aşağıdaki kategoriBul()'dadır;
// bu dizinin sırası artık "hangisi önce denenir" anlamına GELMEZ.
export const KATEGORI = {
  popup: 'İş Kuralı / Ekran Hatası (Pop-up)',
  zamanAsimi: 'Zaman Aşımı (Timeout)',
  secici: 'Seçici / Elemana Ulaşılamadı',
  dogrulama: 'Doğrulama (Assertion) Hatası',
  diger: 'Diğer / Sınıflandırılamadı'
};
export const KATEGORILER = [KATEGORI.popup, KATEGORI.zamanAsimi, KATEGORI.secici, KATEGORI.dogrulama].map((ad) => ({ ad }));

const POPUP_DESENI = /beklenmeyen bir hata pop.?up/i;
// "locator.click: Timeout 30000ms exceeded." / "Test timeout of 180000ms exceeded." /
// "TimeoutError: page.waitForFunction: Timeout 20000ms exceeded."
const ZAMAN_ASIMI_DESENI = /\btimeout\b.*\bexceeded\b/i;
// Playwright 1.5x doğrulama mesajının İLK satırı: "Error: expect(locator).toHaveText(expected) failed",
// "expect.poll(...)..." vb. (başındaki "Error: " öneki Playwright'ın serializeError'ından gelir).
const DOGRULAMA_ILK_SATIR_DESENI = /^(?:\w*Error:\s*)?expect(?:\.\w+)?\(.*\).*\bfailed\b/;
// Özel mesajlı expect (expect(x, 'Açıklama').toBeTruthy()) ilk satırda açıklamayı taşır;
// asıl matcher satırı ("expect(received).toBeTruthy()") ve "Expected:/Received:" satırları
// mesajın devamında, SATIR BAŞINDA yer alır.
const DOGRULAMA_GOVDE_DESENI = /^\s*(?:expect(?:\.\w+)?\((?:received|locator|page)\)|Expected(?: string| value| pattern)?:|Received(?: string| value)?:)/m;
// Playwright 1.5x çağrı günlüğü artık "waiting for locator(...)" yerine çoğunlukla
// "waiting for getByRole(...)" yazar — ikisi de kapsanır.
const SECICI_DESENI = /(element\(s\) not found|strict mode violation|resolved to \d+ elements|waiting for (?:locator|getBy\w+|frameLocator)\()/i;

// Hata kategorisini bulur. ÖNEMLİ: Playwright'ın locator doğrulama mesajları
// (toHaveText/toHaveValue/toBeVisible...) HER ZAMAN çağrı günlüğünde
// "waiting for locator(...)" ya da "element(s) not found" satırı içerir; tüm mesaj
// üzerinde sırayla desen aransaydı (eski davranış) bunlar hep "Seçici" sayılır,
// "Doğrulama" neredeyse hiç eşleşmezdi. Bu yüzden karar öncelikle mesajın İLK
// satırına göre, şu sırayla verilir:
//   1) Beklenmeyen hata pop-up'ı (iş kuralı) — tüm mesajda aranır, özel/uzun metin.
//   2) Zaman aşımı — ilk satırda "timeout ... exceeded" (test/aksiyon zaman aşımı).
//      (Çağrı günlüğündeki "Timeout 45000ms exceeded while waiting on the predicate"
//      gibi satırlar ilk satırda olmadığından doğrulama olarak kalır.)
//   3) Doğrulama — ilk satır "expect(...)... failed" ya da mesajda satır başında
//      "expect(received)..." / "Expected:" / "Received:" var.
//   4) Seçici — element(s) not found / strict mode violation / "waiting for locator".
//   5) Diğer.
// playwright.config.ts'teki allure "categories" regex'leri aynı sırayı/mantığı taklit
// eder (Allure bir sonucu eşleşen TÜM kategorilere koyduğundan orada karşılıklı
// dışlayan regex'ler kullanıldı); ikisini birlikte güncelleyin.
export function kategoriBul(mesaj) {
  if (!mesaj) return KATEGORI.diger;
  const ilkSatir = mesaj.split('\n')[0].trim();
  if (POPUP_DESENI.test(mesaj)) return KATEGORI.popup;
  if (ZAMAN_ASIMI_DESENI.test(ilkSatir)) return KATEGORI.zamanAsimi;
  if (DOGRULAMA_ILK_SATIR_DESENI.test(ilkSatir) || DOGRULAMA_GOVDE_DESENI.test(mesaj)) return KATEGORI.dogrulama;
  if (SECICI_DESENI.test(mesaj)) return KATEGORI.secici;
  return KATEGORI.diger;
}

// Hata mesajındaki hedef locator'ı bulur. Playwright 1.5x doğrulama mesajlarında ayrı
// bir "Locator: getByRole('button', { name: 'Prim Hesapla' })" satırı bulunur; yoksa
// (ör. "locator.click: Timeout ... exceeded" gibi aksiyon hatalarında) çağrı
// günlüğündeki ilk "waiting for <locator>" satırı kullanılır.
function locatorBul(mesajTam) {
  const locatorSatiri = mesajTam.match(/^\s*Locator:\s*(.+)$/m);
  if (locatorSatiri) return locatorSatiri[1].trim();
  const beklemeSatiri = mesajTam.match(/^\s*-\s*waiting for ((?:locator|getBy\w+|frameLocator)\(.+)$/m);
  return beklemeSatiri ? beklemeSatiri[1].trim() : null;
}

// Hata mesajının SABİT KALIBINI çıkarır: değişken (sayısal) kısımlar "#" olur.
// "250166487 numaralı teklif onaylanamadı" -> "# numaralı teklif onaylanamadı"
// Mesajda bir locator varsa kalıba eklenir; böylece farklı ekranlardaki
// "expect(locator).toBeVisible() failed" hataları tek satıra yığılmaz:
// "Error: expect(locator).toBeVisible() failed · getByRole('button', { name: 'Prim Hesapla' })"
export function kalipCikar(mesajTam) {
  if (!mesajTam) return 'Mesaj yok / boş hata';
  let ilkSatir = mesajTam.split('\n')[0].trim();
  if (!ilkSatir) return 'Mesaj yok / boş hata';

  const locator = locatorBul(mesajTam);
  // İlk satır locator'ı zaten içeriyorsa (ör. strict mode violation) tekrar eklenmez.
  const hamKalip = locator && !ilkSatir.includes(locator) ? `${ilkSatir} · ${locator}` : ilkSatir;

  let kalip = hamKalip
    // UUID benzeri değerleri önce sil (sayı deseni bunları yarım bırakabilir)
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '#')
    // Her sayısal diziyi (teklif no, id, tarih, tutar vb.) tek karaktere indir
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

  // Locator eklendiği için sınır 180'den 240'a çıkarıldı.
  if (kalip.length > 240) kalip = kalip.slice(0, 237) + '...';
  return kalip;
}

// --- Durum eşleme (TEK KAYNAK) ---
// Bir Allure sonucunu dashboard durumuna çevirir: 'basarili' | 'basarisiz' | 'atlanan' |
// 'durduruldu'. kosuOzetiCikar, kosuSenaryolariCikar ve tumKayitlar hep bunu kullanır
// (eskiden 'unknown' bir yerde yok sayılıp diğerlerinde başarısız sayılıyordu).
// "Durduruldu" = kullanıcı durdurdu / koşu yarıda kesildi — BAŞARISIZ SAYILMAZ:
//   - status 'unknown' ya da hiç yok (Allure sonucu tamamlanmamış),
//   - failed/broken ama mesaj "Test was interrupted" (Playwright interrupted),
//   - failed/broken ve HİÇ hata mesajı yok: Playwright, Ctrl+C/SIGTERM ile kesilen
//     (status 'interrupted') testlere hata eklemez; allure-playwright bunu 'failed'
//     olarak yazar. Kendi başına başarısız olan her test (zaman aşımı dahil — o
//     'broken' + "Test timeout of ...ms exceeded." mesajıyla gelir) bir hata taşır.
// NOT: "navigation ... is interrupted by another navigation" gibi GERÇEK hatalar
// kasıtlı olarak eşleşmez (desen yalnızca "Test was interrupted").
const KESINTI_DESENI = /\bTest (?:run )?was interrupted\b/i;
export function durumEsle(icerik) {
  const status = icerik.status;
  if (status === 'passed') return 'basarili';
  if (status === 'skipped') return 'atlanan';
  if (status === 'failed' || status === 'broken') {
    const mesaj = icerik.statusDetails?.message ?? '';
    if (!mesaj.trim() || KESINTI_DESENI.test(mesaj)) return 'durduruldu';
    return 'basarisiz';
  }
  return 'durduruldu'; // 'unknown', undefined veya tanınmayan bir değer
}

export function kosuEtiketi(zamanDamgasiMs) {
  return new Date(zamanDamgasiMs).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Başarı ORANI paydası: "Durduruldu" (kullanıcı durdurdu) testler bilinçli olarak
// dahil edilmez — oranı düşürüp başarısızlık gibi görünmesinler.
export function kacHesapla(icerikTuru) {
  return icerikTuru.basarili + icerikTuru.basarisiz + icerikTuru.atlanan;
}
