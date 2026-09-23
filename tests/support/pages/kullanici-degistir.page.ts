import { expect, type Page } from '@playwright/test';
import type { AcenteProfili } from '../test-data';

// Tek bir acente profili (kullaniciDegistir map'inden çözülmüş hâli).
type KullaniciDegistirData = AcenteProfili;

export class KullaniciDegistirPage {
  constructor(private readonly page: Page) {}

  async acenteVeKullaniciDegistir(data: KullaniciDegistirData): Promise<void> {
    await this.page.goto('/kullanici-degistir', { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveURL(/kullanici-degistir$/);

    await this.page.waitForFunction(() => Reflect.get(window, 'CHANNEL_OLD') === '0');

    await this.page.locator('#select2-ChangeChannel-container').click();
    await this.page
      .locator('.select2-container--open .select2-search__field')
      .fill(data.acentePartaji);

    const partajOption = this.page
      .locator('#select2-ChangeChannel-results li')
      .filter({ hasText: data.acentePartajiSecenegi })
      .first();

    await expect(partajOption).toBeVisible();

    const [usersResponse] = await Promise.all([
      this.page.waitForResponse(response =>
        new URL(response.url()).pathname === `/home/list-user/${data.acentePartaji}`
      ),
      partajOption.click()
    ]);

    expect(usersResponse.ok(), 'Acente kullanıcı listesi isteği başarılı olmalı').toBeTruthy();
    await expect(this.page.locator('#ChangeChannel')).toHaveValue(data.acentePartaji);
    await expect(
      this.page.locator(`#ChangeUsername option[value="${data.acenteKullanicisi}"]`)
    ).toHaveCount(1);

    await this.page.locator('#select2-ChangeUsername-container').click();
    const userOption = this.page
      .locator('#select2-ChangeUsername-results li')
      .filter({ hasText: new RegExp(`^${data.acenteKullanicisi}$`) })
      .first();

    await expect(userOption).toBeVisible({ timeout: 15_000 });
    await userOption.click();
    await expect(this.page.locator('#ChangeUsername')).toHaveValue(data.acenteKullanicisi);

    await Promise.all([
      this.page.waitForURL(/kullanici-degistir-tamamlandi/),
      this.page.getByRole('button', { name: 'KULLANICI DEĞİŞTİR' }).click()
    ]);

    await this.page.goto('/');
    await expect(this.page.locator('body')).toContainText(data.acenteKullanicisi);
  }
}
