import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync } from 'node:fs';
import {
  environments,
  getEnvironment,
  getEnvironmentName,
  girisKimligi,
  girisTarifi,
  hasCredentials
} from './environments';
import { oturumuHazirla, oturumuKaydetmeyeHazirla } from './giris-motoru';
import { kasaAnahtariniHazirla } from './platform-kasa';
import { YASAK_ADRES_DEGISKENI, adresYasakliMi, yasakDesenleri, yasakliAdresMesaji } from '../../scripts/platform/senaryolar/model-kosusu.mjs';

/**
 * Yasaklı adres koruması (NOBETCI_YASAK_ADRESLER verilmişse; verilmemişse hiçbir şey yapmaz): ortamın adresi ya da
 * tarifteki tam bir adres yasaklı kalıba uyuyorsa koşu tarayıcı AÇILMADAN durdurulur.
 */
function yasakliAdresleriDenetle(adresler: Array<string | undefined>): void {
  const desenler = yasakDesenleri(process.env[YASAK_ADRES_DEGISKENI]);
  if (!desenler.length) return;
  for (const adres of adresler) {
    const kalip = adresYasakliMi(adres, desenler);
    if (adres && kalip) throw new Error(yasakliAdresMesaji(adres, kalip));
  }
}

// Bütün senaryolar başlamadan ÖNCE, tek seferlik giriş yapıp oturum çerezlerini diske yazar
// (environments.ts > login.storageState — ortam + giriş profili başına). Giriş, ortamın GİRİŞ TARİFİYLE
// genel giriş motoru tarafından yapılır (bkz. giris-motoru.ts; Galaksi'nin tarifi
// projeler/galaksi/giris-tarifi.mjs). Böylece:
//   - CANLI ortamda her testte authenticator (2FA) kodu tekrar tekrar sorulmaz — kod
//     yalnızca burada, bir kere kullanılır.
//   - TEST ortamında da her testin başındaki login adımı tekrarlanmaz, koşular hızlanır.
// "Acente ve kullanıcı değiştir" adımı BURADA YAPILMAZ — o adım her testte, senaryonun
// ihtiyaç duyduğu profille (varsayilan / JetSeyahatÖzelTanımlıAcente / ...) ayrı ayrı
// çalışmaya devam eder (bkz. flows/test-baslangici.ts). Sadece Galaksi'ye giriş paylaşılır.
//
// Platformdaki giriş profilinde kullanıcı bilgileri tanımlı değilse (örn. CANLI giriş profili
// yoksa) sessizce atlanır — spec dosyalarındaki
// test.skip(!hasCredentials(...)) zaten o durumu ele alıyor; storageState dosyası
// oluşmazsa testBaslangiciniHazirla() her testte olduğu gibi gerçek login'e düşer.
export default async function globalSetup(): Promise<void> {
  // KOŞU KİMLİĞİ: tek bir "playwright test" çağrısının (bir koşunun) tüm worker'ları bu
  // değişkeni miras alır (globalSetup ana süreçte, worker'lar başlamadan önce çalışır).
  // fixtures.ts bunu her sonuca "kosuKimligi" annotation'ı olarak yazar; platform raporlayıcısı
  // (scripts/platform/raporlayici.mjs) sonuçları bu kimlikle tek koşu olarak veritabanına yazar.
  // Dışarıdan verilmişse (ör. CI ya da platform sunucusu)
  // dokunulmaz. Bu satır, aşağıdaki erken "return"lerden ÖNCE olmalı.
  if (!process.env.KOSU_KIMLIGI) {
    process.env.KOSU_KIMLIGI = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  // PLATFORM KASASI: test verisi/giriş bilgisi YALNIZCA şifreli platform veritabanından okunur
  // (veritabanı hazır değilse açık hata). Anahtar Nöbetçi'den gelmediyse parola burada
  // (gizli girişle ya da CI'da PLATFORM_KASA_PAROLASI ile) istenir ve yalnızca bu koşunun
  // worker'larına verilir — bkz. platform-kasa.ts. Spec'ler bu adımdan SONRA yüklenir.
  await kasaAnahtariniHazirla();

  const environment = getEnvironmentName();
  yasakliAdresleriDenetle([environments[environment].baseURL]);

  if (!hasCredentials(environment)) {
    console.log(
      `[global-setup] ${environment.toUpperCase()} için giriş bilgisi (kullanıcı/parola/2FA kaynağı) ya da giriş tarifi eksik, ` +
        'paylaşılan oturum oluşturulmadı (testler kendi login\'ini yapacak).'
    );
    return;
  }

  const definition = getEnvironment(environment);
  const authFile = definition.login.storageState;
  const tarif = girisTarifi(environment);
  yasakliAdresleriDenetle([tarif.girisAdresi, tarif.oturumKontrolAdresi].filter((a) => /^https?:\/\//i.test(a)));
  // Geçiş: oturum dosyası artık ortam + giriş profili başına. Eski ortam başına dosya (…-acente.json) varsa
  // bir kez başlangıç olarak kopyalanır — geçerliyse yeniden giriş yapılmaz (geçersizse normal giriş).
  const eskiOturumDosyasi = `playwright/.auth/${environment}-acente.json`;
  if (!existsSync(authFile) && existsSync(eskiOturumDosyasi)) {
    oturumuKaydetmeyeHazirla(authFile);
    copyFileSync(eskiOturumDosyasi, authFile);
  }
  // globalSetup kendi tarayıcısını elle açtığı için --headed bayrağını GÖRMEZ — normalde
  // her zaman headless çalışır. Bu login adımını gözle takip etmek isterseniz
  // (ör. "PWDEBUG=1 npx cross-env TEST_ENV=test playwright test ...") headed + yavaş açılır.
  // NOT: Dashboard'daki ▷ Çalıştır ile tetiklenen koşular ARTIK headless çalışır (masaüstünde
  // pencere açılıp dağılmasın diye) — canlı izleme dashboard'daki panel üzerinden, periyodik
  // ekran görüntüsü akışıyla sağlanıyor (bkz. fixtures.ts > canliIzlemeYayini).
  const debugModu = Boolean(process.env.PWDEBUG);
  const browser = await chromium.launch({ headless: !debugModu, slowMo: debugModu ? 400 : 0 });

  try {
    // NOT (istek: "login olmuşsak bir daha login olmamalıyız"): Dashboard'dan tetiklenen HER senaryo
    // AYRI bir "playwright test <dosya>" sürecidir; globalSetup her senaryoda yeniden çalışır. Diskteki
    // paylaşılan oturum dosyası (başka bir senaryonun sürecinde az önce yazılmış olabilir) hâlâ geçerliyse
    // gerçek giriş HİÇ yapılmaz, dosyaya dokunulmaz (oturumuHazirla → 'gecerli'); art arda çok sayıda
    // senaryo test ortamına kısa sürede onlarca gerçek giriş isteği göndermez.
    const sonuc = await oturumuHazirla(browser, {
      baseURL: definition.baseURL as string,
      tarif,
      kimlik: girisKimligi(environment),
      oturumDosyasi: authFile,
      secenekler: { log: (m) => console.log(`[global-setup] ${m}`) }
    });
    console.log(sonuc === 'gecerli'
      ? `[global-setup] ${environment.toUpperCase()} için paylaşılan oturum hâlâ geçerli, yeniden giriş yapılmadı.`
      : `[global-setup] ${environment.toUpperCase()} oturumu kaydedildi: ${authFile}`);
  } finally {
    await browser.close();
  }
}
