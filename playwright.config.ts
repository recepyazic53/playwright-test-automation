import { existsSync } from 'node:fs';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import 'dotenv/config';
import { environments, getEnvironmentName } from './tests/support/environments';
import { kosuListesiHaricDesenleri } from './tests/support/kosu-listesi';
import { platformHazirOlmali } from './tests/support/platform-veri';
import { ekranGoruntusuAyari, izAyari, videoAyari, yenidenDenemeAyari } from './tests/support/kosu-ayarlari';

// VERİ YALNIZCA PLATFORM VERİTABANINDA (Nöbetçi: veri/platform.db). Veritabanı yoksa ya da proje
// aktarılmamışsa burada açık bir hata verilir: "Veritabanı hazır değil — Nöbetçi'yi açıp projeyi
// aktarın/yedek yükleyin".
platformHazirOlmali();

const environmentName = getEnvironmentName();
// Taban adres veritabanından okunur; terminal koşusunda kasa parolası global-setup'ta sorulduğu
// için yapılandırma ilk değerlendirildiğinde (ana süreç) undefined olabilir — worker'lar
// yapılandırmayı anahtarla yeniden yükler (bkz. tests/support/environments.ts).
const environment = environments[environmentName];
// globalSetup uygulamaya bir kez giriş yapıp bu dosyaya çerezleri yazar (bkz.
// tests/support/global-setup.ts). Dosya henüz yoksa (örn. giriş profili tanımlı değilse
// globalSetup sessizce atlanır) storageState hiç verilmez — testler testBaslangiciniHazirla()
// içindeki gerçek login'e düşer.
const oturumDosyasi = environment.login.storageState;

// SONUÇLAR: platform raporlayıcısı (scripts/platform/raporlayici.mjs) koşuları, test sonuçlarını
// ve adımları platform veritabanına, ekran görüntüsü/video/izleri ŞİFRELİ medya deposuna yazar.
// Sonuçlar Nöbetçi'nin "Sonuçlar" sekmesinde görünür. Playwright'ın HTML raporu ÜRETİLMEZ: HTML
// rapor ekleri (ekran görüntüsü, video, iz) playwright-report/ altına DÜZ METİN kopyalardı.
// Raporlayıcı .mjs dosyası DOĞRUDAN verilmez; TypeScript giriş noktası üzerinden yüklenir (neden:
// tests/support/platform-raporlayici.ts).
const platformRaporlayicisi: ReporterDescription = ['./tests/support/platform-raporlayici.ts', { adaptor: 'galaksi', ortam: environmentName }];

export default defineConfig({
  testDir: './tests',

  // TEST çalıştırmalarında canlıya özel kontroller keşfedilmez. tests/birim/ (tarayıcısız
  // koruma testleri) yalnızca playwright.birim.config.ts ile (npm run test:birim) koşar.
  testIgnore: ['birim/**'],

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

  // Yeniden deneme: Ayarlar > Koşu (Nöbetçi ortam değişkeniyle verir); yoksa CI'da 2, diğerlerinde 0.
  retries: yenidenDenemeAyari(),

  workers: process.env.CI ? 1 : undefined,

  // Tüm testlerden ÖNCE bir kez giriş yapıp oturumu playwright/.auth/ altına
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

    // globalSetup'ın kaydettiği paylaşılan oturum (bkz. yukarı) — dosya henüz
    // yoksa (ilk koşu, ya da giriş profili tanımlı değil) hiç verilmez, testler kendi login'ini yapar.
    storageState: existsSync(oturumDosyasi) ? oturumDosyasi : undefined,

    // Video / ekran görüntüsü / iz: kullanıcının kararı (Ayarlar > Koşu > Kayıt; bkz. tests/support/kosu-ayarlari.ts).
    // Terminal / CI koşusunda: video ve iz yalnız kalan testlerde, ekran görüntüsü yalnız hatada.
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
