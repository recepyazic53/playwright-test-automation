import { defineConfig } from '@playwright/test';

// KORUMA (birim) TESTLERİ: dış siteye BAĞLANMAZ (tarayıcı açan testler yalnızca 127.0.0.1'deki sahte uygulamalara gider).
// Platform (veritabanı, kasa, yedek, ekranlar, senaryolar, servisler, sonuçlar), ekran modeli ve doğrulayıcı tutarlılığını
// kontrol eder; gerçek veri yerine SAHTE değerli örnekler kullanılır (tests/birim/fixtures/). Çalıştırma: npm test
// Ana playwright.config.ts (model koşusu; yalnızca Nöbetçi başlatır) bu klasörü içermez.
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
