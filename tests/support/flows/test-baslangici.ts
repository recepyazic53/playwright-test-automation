import { test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { credentialsFromEnvironment, getEnvironment, type EnvironmentName } from '../environments';
import { KullaniciDegistirPage } from '../pages/kullanici-degistir.page';
import { LoginPage } from '../pages/login.page';
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

/** Bütün ürün senaryolarının ortak oturum ve kullanıcı başlangıcı. */
export async function testBaslangiciniHazirla({
  page,
  testInfo,
  environment,
  ortakData,
  acenteProfili = 'varsayilan'
}: TestBaslangicOptions): Promise<void> {
  const loginPage = new LoginPage(page, environment);
  const kullaniciDegistirPage = new KullaniciDegistirPage(page);

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
    // genelde zaten geçerlidir — bu durumda gerçek login formu HİÇ doldurulmaz (CANLI'da
    // authenticator kodu da tekrar sorulmaz). Oturum süresi dolmuşsa (uzun süren bir matris
    // koşusunun ortasında olabilir) gerçek login'e düşülür VE paylaşılan oturum dosyası
    // üzerine yazılır — böylece bir sonraki test tekrar 2FA'ya takılmaz, kalan koşu bu
    // yenilenmiş oturumu kullanmaya devam eder.
    const oturumGecerli = await loginPage.oturumGecerliMi(ortakData.login.basariGostergeMetni);
    if (!oturumGecerli) {
      await loginPage.login(
        credentialsFromEnvironment(environment),
        ortakData.login.basariGostergeMetni
      );

      const oturumDosyasi = getEnvironment(environment).login.storageState;
      mkdirSync(dirname(oturumDosyasi), { recursive: true });
      await page.context().storageState({ path: oturumDosyasi });
    }
    await attachStepScreenshot(page, testInfo, '01 - Sisteme giriş başarılı');
  });

  await test.step('Acente ve kullanıcı değiştirilir', async () => {
    await kullaniciDegistirPage.acenteVeKullaniciDegistir(acente);
    await attachStepScreenshot(
      page,
      testInfo,
      `02 - Acente ve kullanıcı değiştirildi (${acenteProfili})`
    );
  });
}
