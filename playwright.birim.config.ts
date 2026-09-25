import { defineConfig } from '@playwright/test';

// KORUMA (birim) TESTLERİ: şirket ortamına BAĞLANMAZ (giris-*.spec.ts yalnızca yerel fikstürlerle tarayıcı açar).
// Platform (veritabanı, kasa, yedek, aktarım, senaryolar, sonuçlar), ekran modeli ve tek doğrulayıcı
// tutarlılığını saniyeler içinde kontrol eder; gerçek proje verisi yerine SAHTE değerli örnekler
// kullanılır (tests/birim/fixtures/). Çalıştırma: npm run test:birim
// Ana playwright.config.ts'den bilerek AYRIDIR: globalSetup (Galaksi login), globalTeardown,
// Allure raporlayıcısı ve koşu listesi filtresi burada yoktur. Ana yapılandırma da tests/birim/
// klasörünü testIgnore ile dışarıda bırakır (Nöbetçi'deki senaryo listesi değişmesin diye).
export default defineConfig({
  testDir: './tests/birim',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Ana koşuların test-results/ klasörüne (dashboard videoları, trace'ler) dokunulmasın diye birim
  // testleri kendi alt klasörüne yazar — Playwright koşu başında YALNIZCA bu klasörü temizler.
  outputDir: 'test-results/birim',
  reporter: [['list']],
  // Testler "page"/"browser" fixture'ı kullanmaz; yine de yanlışlıkla kullanılırsa sessizce
  // tarayıcı açılmasın diye proje tanımlanmaz ve ağ adresi verilmez. İSTİSNA: giriş motoru
  // entegrasyon testleri (giris-*.spec.ts) tarayıcıyı KENDİLERİ açar — yalnızca yerel fikstürlere
  // (route ile yakalanan sahte kökenler / 127.0.0.1), DNS kapalı; şirket sitesine istek gitmediği doğrulanır.
  use: {}
});
