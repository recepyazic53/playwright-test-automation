import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { getEnvironment, getEnvironmentName } from './tests/support/environments';

const environmentName = getEnvironmentName();
const environment = getEnvironment(environmentName);
// globalSetup Galaksi'ye bir kez login olup bu dosyaya çerezleri yazar (bkz.
// tests/support/global-setup.ts). Dosya henüz yoksa (örn. .env'de kullanıcı bilgisi
// tanımlı değilse globalSetup sessizce atlanır) storageState hiç verilmez — testler
// testBaslangiciniHazirla() içindeki gerçek login'e düşer, davranış eskisi gibi kalır.
const oturumDosyasi = environment.login.storageState;

export default defineConfig({
  testDir: './tests',

  // TEST çalıştırmalarında canlıya özel kontroller keşfedilmez.
  testIgnore: environmentName === 'test' ? ['canli/**'] : [],

  // test-sunucu.mjs bir senaryoyu başlığına göre çalıştırırken "--grep" CLI argümanı
  // YERİNE bu ortam değişkenini kullanır (komut satırı argümanı yerine CreateProcess'in
  // ayrı "environment block" mekanizmasıyla aktarılır — daha sağlam ve test edilmiş bir
  // yol). Asıl "Error: No tests found" kök nedeni ayrıydı ve test-sunucu.mjs'teki
  // "desen" oluşturma NOTUNDA açıklanıyor (özetle: Playwright'ın grep'i başlığın
  // KENDİSİNE değil daha uzun bir "titlePath" dizisine bakıyor, bu yüzden başa "^"
  // eklenemiyor). "npm run test" / CI koşularında bu değişken hiç set edilmediğinden
  // normal davranış değişmez.
  grep: process.env.TEST_SUNUCU_GREP_DESENI ? new RegExp(process.env.TEST_SUNUCU_GREP_DESENI) : undefined,

  // Testler aynı acente hesabında kullanıcı değiştirdiği için paralel koşular
  // sunucu tarafındaki oturumları birbirine karıştırabiliyor.
  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : undefined,

  // Tüm testlerden ÖNCE bir kez Galaksi login'i yapıp oturumu playwright/.auth/ altına
  // kaydeder (CANLI'da authenticator kodu bu yüzden yalnızca burada, bir kere sorulur).
  globalSetup: './tests/support/global-setup.ts',

  // Tüm testler bittikten sonra allure-results/environment.properties dosyasını yazar
  // (Allure raporundaki "Environment" widget'ını doldurmak için).
  globalTeardown: './tests/support/allure-environment.ts',

  reporter: [
    [
      'html',
      {
        open: 'never',
        outputFolder: 'playwright-report'
      }
    ],
    ['list'],
    // Kurumsal/paylaşılabilir rapor için ham sonuçları ortama özel klasöre yazar
    // (allure-results-test / allure-results-canli) — TEST ve CANLI verileri
    // birbirine karışmasın diye. HTML rapor haline getirmek için:
    // npm run allure:report:test veya npm run allure:report:canli (Java 8+ gerektirir).
    [
      'allure-playwright',
      {
        detail: true,
        resultsDir: `allure-results-${environmentName}`,
        suiteTitle: false,
        // Hataları anlaşılır Türkçe kategorilere ayırır (Categories widget'ı için).
        categories: [
          {
            name: 'İş Kuralı / Ekran Hatası (Beklenmeyen Pop-up)',
            matchedStatuses: ['failed', 'broken'],
            messageRegex: '.*beklenmeyen bir hata pop.?up.*'
          },
          {
            name: 'Zaman Aşımı (Timeout)',
            matchedStatuses: ['failed', 'broken'],
            messageRegex: '.*[Tt]imeout.*exceeded.*'
          },
          {
            name: 'Seçici / Elemana Ulaşılamadı',
            matchedStatuses: ['failed', 'broken'],
            messageRegex: '.*(element\\(s\\) not found|strict mode violation|waiting for locator).*'
          },
          {
            name: 'Doğrulama (Assertion) Hatası',
            matchedStatuses: ['failed', 'broken'],
            messageRegex: '.*(toBeVisible|toBeChecked|toHaveValue|toHaveText|Expected).*'
          }
        ]
      }
    ]
  ],

  use: {
    baseURL: environment.baseURL,

    // globalSetup'ın kaydettiği paylaşılan Galaksi oturumu (bkz. yukarı) — dosya henüz
    // yoksa (ilk koşu, ya da .env'de kullanıcı bilgisi tanımlı değil) hiç verilmez,
    // testler eskisi gibi kendi login'ini yapar.
    storageState: existsSync(oturumDosyasi) ? oturumDosyasi : undefined,

    // Başarılı koşularda gereksiz artifact üretme; hata incelemesinde videoyu koru.
    // TEST_SUNUCU_GORUNUR (dashboard'daki ▷ ile tetiklenen tekil koşularda test-sunucu.mjs
    // tarafından set edilir) aktifken İSTİSNA: başarılı olsun olmasın her koşuda video
    // kaydedilir — kullanıcı dashboard'daki sonuç popup'ında/panelinde videoyu izleyebilsin
    // diye. Normal toplu koşularda (npm run test, CI) davranış eskisi gibi kalır.
    video: process.env.TEST_SUNUCU_GORUNUR ? 'on' : 'retain-on-failure',

    // Sadece hata durumunda otomatik screenshot
    screenshot: 'only-on-failure',

    // Hata durumunda trace tut
    trace: 'retain-on-failure'
  },

  projects: [
    {
      name: 'Chromium',

      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
