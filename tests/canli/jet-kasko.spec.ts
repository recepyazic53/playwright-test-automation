import { existsSync } from 'node:fs';
import { expect, test } from '../support/fixtures';
import { environments } from '../support/environments';

const authFile = environments.canli.login.storageState;

test.use({ baseURL: environments.canli.baseURL, storageState: authFile });
test.skip(!existsSync(authFile), 'Canlı ortam oturum dosyası henüz oluşturulmadı.');

test('tanımsız IP için erişim hatası göstermeli', async ({ page }) => {
  await page.goto('/yetki-hatasi/jet-kasko');
  await expect(page.getByText('Dikkat!')).toBeVisible();
  await expect(page.getByText('SFS sistemine erişim için IP adresinizin sistemimizde tanımlı olması gereklidir.')).toBeVisible();
  await expect(page.getByRole('link', { name: '[ Bu Adresi Tanımla ]' })).toBeVisible();
});
