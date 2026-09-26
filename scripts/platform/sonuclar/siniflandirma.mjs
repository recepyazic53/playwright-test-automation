// SONUÇ SINIFLANDIRMA (genel, saf fonksiyonlar — yan etki yok): hata kategorisi, hata kalıbı,
// Playwright/Allure durumu → platform durumu ('basarili' | 'basarisiz' | 'atlanan' | 'durduruldu'),
// adım gürültüsü filtresi, beklenen/görülen ayrıştırma, koşu etiketi.
// Kullananlar: Playwright raporlayıcısı (scripts/platform/raporlayici.mjs), eski Allure sonuçlarının
// içe aktarımı (aktarim/allure-sonuclari.mjs), sonuç deposu ve eski görünüm üreticisi.
// (Eskiden scripts/rapor/veri-siniflandirma.mjs idi; Allure kaldırıldığında buraya taşındı.)

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
//   1) Kullanıcının kuralları (Ayarlar > Koşu > Hata sınıflandırma; ör. uygulamanın iş kuralı pop-up metni) — tüm
//      mesajda, büyük/küçük harf duyarsız "içerir"; ilk eşleşen kuralın kategorisi.
//   2) Zaman aşımı — ilk satırda "timeout ... exceeded" (test/aksiyon zaman aşımı).
//      (Çağrı günlüğündeki "Timeout 45000ms exceeded while waiting on the predicate"
//      gibi satırlar ilk satırda olmadığından doğrulama olarak kalır.)
//   3) Doğrulama — ilk satır "expect(...)... failed" ya da mesajda satır başında
//      "expect(received)..." / "Expected:" / "Received:" var.
//   4) Seçici — element(s) not found / strict mode violation / "waiting for locator".
//   5) Diğer.
/** @param {string | null | undefined} mesaj @param {ReadonlyArray<{ icerir: string; kategori: string }>} [kurallar] */
export function kategoriBul(mesaj, kurallar = []) {
  if (!mesaj) return KATEGORI.diger;
  const ilkSatir = mesaj.split('\n')[0].trim();
  const kucukMesaj = mesaj.toLocaleLowerCase('tr');
  const kural = kurallar.find((k) => k.icerir && kucukMesaj.includes(k.icerir.toLocaleLowerCase('tr')));
  if (kural) return kural.kategori;
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
// "123456789 numaralı kayıt onaylanamadı" -> "# numaralı kayıt onaylanamadı"
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
// Bir (eski) Allure sonucunu platform durumuna çevirir: 'basarili' | 'basarisiz' | 'atlanan' |
// 'durduruldu'. Playwright sonuçları için aynı kural: playwrightDurumuEsle.
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
export function allureDurumuEsle(icerik) {
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

/**
 * Playwright TestResult durumunu platform durumuna çevirir (allureDurumuEsle ile AYNI anlam):
 *  - passed → basarili (test.fail() ile beklenen başarısızlık da başarılıdır), skipped → atlanan,
 *  - interrupted → durduruldu (Ctrl+C / Durdur / SIGTERM),
 *  - failed / timedOut → basarisiz; ANCAK hata mesajı yoksa ya da "Test was interrupted" ise
 *    durduruldu (Playwright kesilen testlere hata eklemez).
 * @param {string} durum Playwright result.status
 * @param {string | null | undefined} hataMesaji
 * @param {string} [beklenenDurum] test.expectedStatus
 * @returns {'basarili' | 'basarisiz' | 'atlanan' | 'durduruldu'}
 */
export function playwrightDurumuEsle(durum, hataMesaji, beklenenDurum = 'passed') {
  if (durum === 'passed') return 'basarili';
  if (durum === 'skipped') return 'atlanan';
  if (durum === 'interrupted') return 'durduruldu';
  if (durum === 'failed' || durum === 'timedOut') {
    if (beklenenDurum === 'failed' && durum === 'failed') return 'basarili';
    const mesaj = hataMesaji ?? '';
    if (!mesaj.trim() || KESINTI_DESENI.test(mesaj)) return 'durduruldu';
    return 'basarisiz';
  }
  return 'durduruldu';
}

/** ANSI renk kodlarını temizler. @param {string} metin */
export function ansiTemizle(metin) {
  // eslint-disable-next-line no-control-regex
  return String(metin).replace(/\x1b\[[0-9;]*m/g, '');
}

// Adım (test.step) gürültüsü: Playwright/raporlayıcı otomatik enstrümantasyonu (fixture kurulumu,
// sayfa aksiyonları) kullanıcı adımı sayılmaz. (Eskiden rapor/veri-adimlar.mjs'teydi.)
const ADIM_GURULTU_ADLARI = new Set([
  'Before Hooks', 'After Hooks', 'Launch browser', 'Create context', 'Create page', 'Close context',
  'Navigate', 'Click', 'Screenshot'
]);

/** @param {string} ad */
export function adimGurultuMu(ad) {
  if (ADIM_GURULTU_ADLARI.has(ad)) return true;
  return /^(Fixture |Fill |Attach |Expect |Get by|Locator|Wait for|Type "|Press "|Check$|Uncheck$|Select option|Evaluate$)/.test(ad);
}

/**
 * Playwright doğrulama mesajından beklenen/görülen değerleri çıkarır ("Expected: ..." /
 * "Received: ..." satırları; string/value/pattern varyantları dahil). Yoksa null.
 * @param {string | null | undefined} mesaj
 * @returns {{ beklenen: string; gorulen: string } | null}
 */
export function beklenenGorulenCikar(mesaj) {
  if (!mesaj) return null;
  const temiz = ansiTemizle(mesaj);
  const beklenen = /^\s*Expected(?: string| value| pattern| substring)?:\s*(.*)$/m.exec(temiz);
  const gorulen = /^\s*Received(?: string| value)?:\s*(.*)$/m.exec(temiz);
  if (!beklenen && !gorulen) return null;
  return { beklenen: beklenen ? beklenen[1].trim() : '', gorulen: gorulen ? gorulen[1].trim() : '' };
}

/** Durum → kısa Türkçe etiket (arayüz ve dışa aktarma için). */
export const DURUM_ETIKETLERI = Object.freeze({
  basarili: 'Başarılı', basarisiz: 'Başarısız', atlanan: 'Atlanan', durduruldu: 'Durduruldu'
});
