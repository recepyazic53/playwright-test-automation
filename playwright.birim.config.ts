import { defineConfig } from '@playwright/test';

// KORUMA (birim) TESTLERİ: tarayıcı AÇMAZ, şirket ortamına BAĞLANMAZ.
// Ekran modeli (tests/ekran-modelleri/), senaryo verisi, sunucu alan listesi ve dashboard
// formu arasındaki tutarlılığı saniyeler içinde kontrol eder. Çalıştırma: npm run test:birim
// Ana playwright.config.ts'den bilerek AYRIDIR: globalSetup (Galaksi login), globalTeardown,
// Allure raporlayıcısı ve koşu listesi filtresi burada yoktur. Ana yapılandırma da tests/birim/
// klasörünü testIgnore ile dışarıda bırakır (dashboard'daki senaryo listesi değişmesin diye).
export default defineConfig({
  testDir: './tests/birim',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // Testler "page"/"browser" fixture'ı kullanmaz; yine de yanlışlıkla kullanılırsa sessizce
  // tarayıcı açılmasın diye proje tanımlanmaz ve ağ adresi verilmez.
  use: {}
});
