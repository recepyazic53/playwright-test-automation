import { expect, test } from '../../support/fixtures';
import {
  credentialsFromEnvironment,
  getEnvironmentName,
  hasCredentials
} from '../../support/environments';
import { LoginPage } from '../../support/pages/login.page';
import { loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const testData = loadOrtakData(environment);

test.skip(
  !hasCredentials(environment),
  `${environment.toUpperCase()} kullanıcı bilgilerini yerel .env dosyasına ekleyin.`
);

test('başarılı giriş yapılmalı', async ({ page }) => {
  const loginPage = new LoginPage(page, environment);

  await loginPage.login(
    credentialsFromEnvironment(environment),
    testData.login.basariGostergeMetni
  );

  await expect(page).toHaveURL(
    new RegExp(`${testData.login.basariliGirisSonrasiUrl}$`)
  );
});
