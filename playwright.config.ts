import { existsSync } from 'node:fs';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import 'dotenv/config';
import { environments, getEnvironmentName } from './tests/support/environments';
import { kosuListesiHaricDesenleri } from './tests/support/kosu-listesi';
import { platformHazirOlmali } from './tests/support/platform-veri';

// VERİ YALNIZCA PLATFORM VERİTABANINDA (Nöbetçi: veri/platform.db). Veritabanı yoksa ya da proje
// aktarılmamışsa burada açık bir hata verilir: "Veritabanı hazır değil — Nöbetçi'yi açıp projeyi
// aktarın/yedek yükleyin".
platformHazirOlmali();

const environmentName = getEnvironmentName();
// Taban adres veritabanından okunur; terminal koşusunda kasa parolası global-setup'ta sorulduğu
// için yapılandırma ilk değerlendirildiğinde (ana süreç) undefined olabilir — worker'lar
// yapılandırmayı anahtarla yeniden yükler (bkz. tests/support/environments.ts).
const environment = environments[environmentName];
// globalSetup Galaksi'ye bir kez login olup bu dosyaya çerezleri yazar (bkz.
// tests/support/global-setup.ts). Dosya henüz yoksa (örn. giriş profili tanımlı değilse
// globalSetup sessizce atlanır) storageState hiç verilmez — testler testBaslangiciniHazirla()
// içindeki gerçek login'e düşer.
const oturumDosyasi = environment.login.storageState;

// SONUÇLAR: platform raporlayıcısı (scripts/platform/raporlayici.mjs) koşuları, test sonuçlarını
// ve adımları platform veritabanına, ekran görüntüsü/video/izleri ŞİFRELİ medya deposuna yazar.
// Sonuçlar Nöbetçi'nin "Sonuçlar" sekmesinde görünür. Playwright'ın HTML raporu ÜRETİLMEZ: HTML
// rapor ekleri (ekran görüntüsü, video, iz) playwright-report/ altına DÜZ METİN kopyalardı.
const platformRaporlayicisi: ReporterDescription = ['./scripts/platform/raporlayici.mjs', { adaptor: 'galaksi', ortam: environmentName }];

export default defineConfig({
  testDir: './tests',

  // TEST çalıştırmalarında canlıya özel kontroller keşfedilmez. tests/birim/ (tarayıcısız
  // koruma testleri) yalnızca playwright.birim.config.ts ile (npm run test:birim) koşar.
  testIgnore: environmentName === 'test' ? ['canli/**', 'birim/**'] : ['birim/**'],

  // test-sunucu.mjs bir senaryoyu başlığına göre çalıştırırken "--grep" CLI argümanı
  // YERİNE bu ortam değişkenini kullanır (komut satırı argümanı yerine CreateProcess'in
  // ayrı "environment block" mekanizmasıyla aktarılır — daha sağlam ve test edilmiş bir
  // yol). Asıl "Error: No tests found" kök nedeni ayrıydı ve test-sunucu.mjs'teki
  // "desen" oluşturma NOTUNDA açıklanıyor (özetle: Playwright'ın grep'i başlığın
  // KENDİSİNE değil daha uzun bir "titlePath" dizisine bakıyor, bu yüzden başa "^"
  // eklenemiyor). "npm run test" / CI koşularında bu değişken hiç set edilmediğinden
  // normal davranış değişmez.
  grep: process.env.TEST_SUNUCU_GREP_DESENI ? new RegExp(process.env.TEST_SUNUCU_GREP_DESENI) : undefined,

  // KOŞU LİSTESİ (veritabanı: senaryoların "Koşuda" alanı): koşudan hariç tutulan senaryolar
  // "npm run test" / CI koşularında hiç keşfedilmez. Desen dosya + başlık ikilisini
  // eşleştirir (aynı başlık başka ürün dosyalarında da olabilir) — bkz.
  // tests/support/kosu-listesi.ts > anahtardanGrepDeseni. İKİ İSTİSNA:
  //  - Nöbetçi'nin tek senaryo koşusu (TEST_SUNUCU_GREP_DESENI set): hariç tutulan bir
  //    senaryo da ▷ ile bilinçli olarak tek başına çalıştırılabilmeli.
  //  - Nöbetçi'nin kendi listelemesi (TEST_SUNUCU_TUM_LISTE=1, test-sunucu.mjs >
  //    senaryolariListele): "Senaryolar" tablosu ve whitelist hariç tutulanlar dahil TÜM
  //    senaryoları görmeli.
  grepInvert:
    process.env.TEST_SUNUCU_GREP_DESENI || process.env.TEST_SUNUCU_TUM_LISTE === '1'
      ? undefined
      : kosuListesiHaricDesenleri(),

  // Testler aynı acente hesabında kullanıcı değiştirdiği için paralel koşular
  // sunucu tarafındaki oturumları birbirine karıştırabiliyor.
  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : undefined,

  // Tüm testlerden ÖNCE bir kez Galaksi login'i yapıp oturumu playwright/.auth/ altına
  // kaydeder (CANLI'da authenticator kodu bu yüzden yalnızca burada, bir kere sorulur).
  globalSetup: './tests/support/global-setup.ts',
  // Koşuya özel geçici senaryo dosyası klasörünü siler (şifreli dosyalar koşu anında buraya çözülür).
  globalTeardown: './tests/support/global-teardown.ts',

  reporter: [
    // Terminal ve Nöbetçi koşuları: "list" + platform raporlayıcısı. "--reporter" CLI'dan VERİLMEZ;
    // verilirse platform raporlayıcısı devre dışı kalırdı.
    ['list'],
    platformRaporlayicisi
  ],

  use: {
    baseURL: environment.baseURL,

    // globalSetup'ın kaydettiği paylaşılan Galaksi oturumu (bkz. yukarı) — dosya henüz
    // yoksa (ilk koşu, ya da giriş profili tanımlı değil) hiç verilmez, testler kendi login'ini yapar.
    storageState: existsSync(oturumDosyasi) ? oturumDosyasi : undefined,

    // Başarılı koşularda gereksiz artifact üretme; hata incelemesinde videoyu koru.
    // TEST_SUNUCU_GORUNUR (Nöbetçi'den başlatılan koşularda test-sunucu.mjs
    // tarafından set edilir) aktifken İSTİSNA: başarılı olsun olmasın her koşuda video
    // kaydedilir — kullanıcı Nöbetçi'nin koşu panelinde videoyu izleyebilsin
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
