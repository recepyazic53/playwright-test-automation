import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetSatisPage,
  jetSatisUrunleri,
  type JetSatisUrunu
} from '../../support/pages/jet-satis.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);

test.skip(
  !hasCredentials(environment),
  `${environment.toUpperCase()} giriş profilini Nöbetçi > Ayarlar > Giriş profilleri'nde tanımlayın.`
);

for (const [urun, tanim] of Object.entries(jetSatisUrunleri)) {
  test(`${tanim.ad} ekranı açılmalı`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    await testBaslangiciniHazirla({
      page,
      testInfo,
      environment,
      ortakData
    });

    await test.step(`${tanim.ad} ekranı açılır`, async () => {
      const jetSatis = new JetSatisPage(page);
      await jetSatis.urunEkraniniAc(urun as JetSatisUrunu);
      await attachStepScreenshot(page, testInfo, `03 - ${tanim.ad} ekranı`);
    });
  });
}
