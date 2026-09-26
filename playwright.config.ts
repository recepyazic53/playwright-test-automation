import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { MODEL_SPEC_DOSYASI } from './scripts/platform/senaryolar/model-kosusu.mjs';
import { genelOturumDosyasi, genelVeri } from './tests/support/genel-veri';
import { ekranGoruntusuAyari, izAyari, videoAyari, yenidenDenemeAyari } from './tests/support/kosu-ayarlari';

// MODEL KOŞUSU — Nöbetçi'deki senaryolar (test kodu yok; her senaryo ekran modeliyle genel model koşucusunda koşar).
// Nöbetçi koşuyu proje ve ortam KİMLİKLERİYLE başlatır (NOBETCI_PROJE_ID / NOBETCI_ORTAM_ID; scripts/test-sunucu.mjs).
// Veri, giriş bilgisi ve giriş tarifi platform veritabanından okunur (tests/support/genel-veri.ts); kasa anahtarı
// sunucudan gelir. Bu yüzden koşular YALNIZCA Nöbetçi'den başlatılır.
//
// Paylaşılan giriş (globalSetup) YOKTUR — model koşucusu girişi ortamın giriş tarifiyle kendisi yapar ve oturumu
// kaydeder (sonraki koşular storageState ile başlar). Sonuç, ekran görüntüsü, video ve iz platform raporlayıcısıyla
// şifreli yazılır; Playwright HTML raporu üretilmez (ekleri düz metin kopyalardı).
const veri = genelVeri();
const oturumDosyasi = genelOturumDosyasi();

export default defineConfig({
  testDir: './tests',
  testMatch: [`**/${MODEL_SPEC_DOSYASI}`],

  // Tek senaryo koşusu: Nöbetçi senaryonun etiketini "--grep" argümanı yerine bu ortam değişkeniyle verir.
  grep: process.env.TEST_SUNUCU_GREP_DESENI ? new RegExp(process.env.TEST_SUNUCU_GREP_DESENI) : undefined,

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: yenidenDenemeAyari(),

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
    // Kayıt kuralları: Ayarlar > Koşu (bkz. tests/support/kosu-ayarlari.ts).
    video: videoAyari(),
    screenshot: ekranGoruntusuAyari(),
    trace: izAyari()
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
