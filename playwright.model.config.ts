import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { MODEL_SPEC_DOSYASI } from './scripts/platform/senaryolar/model-kosusu.mjs';
import { genelOturumDosyasi, genelVeri } from './tests/support/genel-veri';

// GENEL MODEL KOŞUSU — elle oluşturulan (aktarımla gelmemiş) proje/ortamların test kodu OLMAYAN senaryoları.
// Nöbetçi, aktarımla bir çalıştırıcı anahtarına ("test"/"canli") eşlenmemiş bir ortamdaki model senaryosunu bu
// yapılandırmayla başlatır (scripts/test-sunucu.mjs; bkz. senaryo-servisi.mjs > calistirmaHedefiCoz > genel).
// Proje ve ortam KİMLİKLERİ NOBETCI_PROJE_ID / NOBETCI_ORTAM_ID ile gelir; veri, giriş bilgisi ve giriş tarifi
// platform veritabanından adaptörsüz okunur (tests/support/genel-veri.ts). YALNIZCA Nöbetçi'den başlatılır
// (terminal koşusu yok: kasa anahtarı sunucudan gelir).
//
// playwright.config.ts'ten farkları: yalnızca model spec'i koşar; aktarılmış projeye özel globalSetup (paylaşılan giriş)
// YOKTUR — model koşucusu girişi ortamın giriş tarifiyle kendisi yapar ve oturumu kaydeder (sonraki koşular
// storageState ile başlar). Sonuç, ekran görüntüsü, video ve iz aynı platform raporlayıcısıyla şifreli yazılır.
const veri = genelVeri();
const oturumDosyasi = genelOturumDosyasi();

export default defineConfig({
  testDir: './tests',
  testMatch: [`**/${MODEL_SPEC_DOSYASI}`],

  // Tek senaryo koşusu: model testinin etiketi (bkz. playwright.config.ts > grep açıklaması).
  grep: process.env.TEST_SUNUCU_GREP_DESENI ? new RegExp(process.env.TEST_SUNUCU_GREP_DESENI) : undefined,

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,

  // Koşuya özel geçici senaryo dosyası klasörünü siler (şifreli dosyalar koşu anında buraya çözülür).
  globalTeardown: './tests/support/global-teardown.ts',

  reporter: [
    ['list'],
    // Raporlayıcı TypeScript giriş noktasından yüklenir (neden: tests/support/platform-raporlayici.ts).
    ['./tests/support/platform-raporlayici.ts', { projeId: veri.projeId, ortamId: veri.ortamId }]
  ],

  use: {
    baseURL: veri.model?.tabanUrl,
    storageState: existsSync(oturumDosyasi) ? oturumDosyasi : undefined,
    // Nöbetçi koşularında (TEST_SUNUCU_GORUNUR) her koşuda video; playwright.config.ts ile aynı.
    video: process.env.TEST_SUNUCU_GORUNUR ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
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
