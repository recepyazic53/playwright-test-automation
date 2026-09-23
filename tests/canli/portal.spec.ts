import { expect, test } from '../support/fixtures';
import { environments } from '../support/environments';

test.use({ baseURL: environments.canli.baseURL });

test('ana sayfa erişilebilir olmalı', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
