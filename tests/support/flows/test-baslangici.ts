import { test, type Page, type TestInfo } from '@playwright/test';
import { getEnvironment, girisKimligi, girisTarifi, type EnvironmentName } from '../environments';
import { baglamiDegistir, girisYap, oturumGecerliMi, oturumuKaydetmeyeHazirla } from '../giris-motoru';
import { attachStepScreenshot } from '../screenshots';
import type { OrtakTestData } from '../test-data';

type TestBaslangicOptions = {
  page: Page;
  testInfo: TestInfo;
  environment: EnvironmentName;
  ortakData: OrtakTestData;
  // ortak.json > kullaniciDegistir altındaki profil anahtarı (örn. "VarsayılanAcente").
  // Verilmezse "varsayilan" profili kullanılır; böylece bu parametreyi geçmeyen
  // mevcut tüm ürün testleri (JetKasko, JetDASK, JetKonut, ...) etkilenmez.
  acenteProfili?: string;
};

/**
 * Bütün ürün senaryolarının ortak oturum ve kullanıcı başlangıcı. Giriş ve bağlam (acente) değiştirme
 * ortamın GİRİŞ TARİFİYLE genel giriş motoru tarafından yapılır (bkz. giris-motoru.ts; Galaksi'nin
 * tarifi projeler/galaksi/giris-tarifi.mjs — eski LoginPage / KullaniciDegistirPage'in karşılığı).
 */
export async function testBaslangiciniHazirla({
  page,
  testInfo,
  environment,
  ortakData,
  acenteProfili = 'varsayilan'
}: TestBaslangicOptions): Promise<void> {
  const tarif = girisTarifi(environment);

  // Seçilen profil ortak.json'da tanımlı değilse (örn. yeni bir acente eklenip
  // veri dosyası güncellenmediyse) anlaşılır bir hata ile erken durur.
  const acente = ortakData.kullaniciDegistir[acenteProfili];
  if (!acente) {
    throw new Error(
      `"${acenteProfili}" acente profili ortak.json > kullaniciDegistir altında tanımlı değil.`
    );
  }

  await test.step('Sisteme giriş yapılır', async () => {
    // globalSetup'ın kaydettiği paylaşılan oturum (bkz. playwright.config.ts > use.storageState)
    // genelde zaten geçerlidir — bu durumda giriş formu HİÇ doldurulmaz (CANLI'da authenticator
    // kodu da tekrar sorulmaz). Oturum süresi dolmuşsa (uzun süren bir matris koşusunun ortasında
    // olabilir) gerçek girişe düşülür VE paylaşılan oturum dosyası üzerine yazılır — böylece bir
    // sonraki test tekrar 2FA'ya takılmaz, kalan koşu bu yenilenmiş oturumu kullanmaya devam eder.
    if (!(await oturumGecerliMi(page, tarif))) {
      await girisYap(page, tarif, girisKimligi(environment));
      const oturumDosyasi = getEnvironment(environment).login.storageState;
      oturumuKaydetmeyeHazirla(oturumDosyasi);
      await page.context().storageState({ path: oturumDosyasi });
    }
    await attachStepScreenshot(page, testInfo, '01 - Sisteme giriş başarılı');
  });

  await test.step('Acente ve kullanıcı değiştirilir', async () => {
    await baglamiDegistir(page, tarif, acente);
    await attachStepScreenshot(
      page,
      testInfo,
      `02 - Acente ve kullanıcı değiştirildi (${acenteProfili})`
    );
  });
}
