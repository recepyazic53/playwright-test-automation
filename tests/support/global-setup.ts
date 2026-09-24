import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  credentialsFromEnvironment,
  getEnvironment,
  getEnvironmentName,
  hasCredentials
} from './environments';
import { LoginPage } from './pages/login.page';
import { loadOrtakData } from './test-data';

// Bütün senaryolar başlamadan ÖNCE, tek seferlik Galaksi login'i yapıp oturum çerezlerini
// diske yazar (environments.ts > login.storageState). Böylece:
//   - CANLI ortamda her testte authenticator (2FA) kodu tekrar tekrar sorulmaz — kod
//     yalnızca burada, bir kere kullanılır.
//   - TEST ortamında da her testin başındaki login adımı tekrarlanmaz, koşular hızlanır.
// "Acente ve kullanıcı değiştir" adımı BURADA YAPILMAZ — o adım her testte, senaryonun
// ihtiyaç duyduğu profille (varsayilan / JetSeyahatÖzelTanımlıAcente / ...) ayrı ayrı
// çalışmaya devam eder (bkz. flows/test-baslangici.ts). Sadece Galaksi'ye giriş paylaşılır.
//
// .env'de kullanıcı bilgileri henüz tanımlı değilse (örn. sadece TEST ortamı için çalışan
// bir makinede CANLI kimlik bilgisi yoksa) sessizce atlanır — spec dosyalarındaki
// test.skip(!hasCredentials(...)) zaten o durumu ele alıyor; storageState dosyası
// oluşmazsa testBaslangiciniHazirla() her testte olduğu gibi gerçek login'e düşer.
export default async function globalSetup(): Promise<void> {
  // KOŞU KİMLİĞİ: tek bir "playwright test" çağrısının (bir koşunun) tüm worker'ları bu
  // değişkeni miras alır (globalSetup ana süreçte, worker'lar başlamadan önce çalışır).
  // fixtures.ts bunu her sonuca "kosuKimligi" Allure etiketi olarak yazar;
  // urun-hata-raporu.mjs de sonuçları bu etikete göre koşulara gruplar (eskiden yalnızca
  // "10 dakikalık boşluk" tahminiyle gruplanıyordu). Dışarıdan verilmişse (ör. CI)
  // dokunulmaz. Bu satır, aşağıdaki erken "return"lerden ÖNCE olmalı.
  if (!process.env.KOSU_KIMLIGI) {
    process.env.KOSU_KIMLIGI = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  const environment = getEnvironmentName();

  if (!hasCredentials(environment)) {
    console.log(
      `[global-setup] ${environment.toUpperCase()} için kullanıcı bilgisi tanımlı değil, ` +
        'paylaşılan oturum oluşturulmadı (testler kendi login\'ini yapacak).'
    );
    return;
  }

  const definition = getEnvironment(environment);
  const authFile = definition.login.storageState;
  mkdirSync(dirname(authFile), { recursive: true });

  const ortakData = loadOrtakData(environment);
  // globalSetup kendi tarayıcısını elle açtığı için --headed bayrağını GÖRMEZ — normalde
  // her zaman headless çalışır. Bu login adımını gözle takip etmek isterseniz
  // (ör. "PWDEBUG=1 npx cross-env TEST_ENV=test playwright test ...") headed + yavaş açılır.
  // NOT: Dashboard'daki ▷ Çalıştır ile tetiklenen koşular ARTIK headless çalışır (masaüstünde
  // pencere açılıp dağılmasın diye) — canlı izleme dashboard'daki panel üzerinden, periyodik
  // ekran görüntüsü akışıyla sağlanıyor (bkz. fixtures.ts > canliIzlemeYayini).
  const debugModu = Boolean(process.env.PWDEBUG);
  const browser = await chromium.launch({ headless: !debugModu, slowMo: debugModu ? 400 : 0 });

  try {
    // NOT (istek: "login olmuşsak bir daha login olmamalıyız"): Dashboard'dan tetiklenen
    // HER senaryo, test-sunucu.mjs > gercektenCalistir içinde AYRI bir "playwright test
    // <dosya>" süreci olarak spawn ediliyor — bu yüzden globalSetup, tek bir koşuda değil,
    // HER senaryoda yeniden çalışıyordu. Önceki hâlde burada KOŞULSUZ her seferinde gerçek
    // login yapılıyordu; art arda çok sayıda senaryo (özellikle "Seçilenleri çalıştır" ile
    // eş zamanlı tetiklenenler ya da Durdur ile kesilip yeniden başlatılanlar) TEST ortamına
    // kısa sürede onlarca gerçek login isteği gönderiyordu — bu da geçici kilitlenme/yavaşlama
    // ile sonuçlanabiliyordu. Çözüm: test-baslangici.ts > testBaslangiciniHazirla'daki AYNI
    // "oturumGecerliMi" kontrolü burada da yapılır — diskteki paylaşılan oturum dosyası (başka
    // bir senaryonun sürecinde az önce yazılmış olabilir) hâlâ geçerliyse gerçek login HİÇ
    // yapılmaz, dosyaya dokunulmaz.
    if (existsSync(authFile)) {
      const dogrulamaContext = await browser.newContext({
        baseURL: definition.baseURL,
        storageState: authFile
      });
      const dogrulamaPage = await dogrulamaContext.newPage();
      const oturumGecerli = await new LoginPage(dogrulamaPage, environment).oturumGecerliMi(
        ortakData.login.basariGostergeMetni
      );
      await dogrulamaContext.close();

      if (oturumGecerli) {
        console.log(
          `[global-setup] ${environment.toUpperCase()} için paylaşılan oturum hâlâ geçerli, yeniden login yapılmadı.`
        );
        return;
      }
    }

    const context = await browser.newContext({ baseURL: definition.baseURL });
    const page = await context.newPage();
    const loginPage = new LoginPage(page, environment);
    await loginPage.login(
      credentialsFromEnvironment(environment),
      ortakData.login.basariGostergeMetni
    );
    await context.storageState({ path: authFile });
    console.log(`[global-setup] ${environment.toUpperCase()} oturumu kaydedildi: ${authFile}`);
    await context.close();
  } finally {
    await browser.close();
  }
}
