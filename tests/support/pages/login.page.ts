import { expect, type Page } from '@playwright/test';
import type { Credentials, EnvironmentName } from '../environments';
import { getEnvironment } from '../environments';

export class LoginPage {
  constructor(
    private readonly page: Page,
    private readonly environment: EnvironmentName
  ) {}

  /**
   * globalSetup'ın kaydettiği paylaşılan oturum (storageState) hâlâ geçerli mi diye
   * bakar — login formunu HİÇ doldurmadan. "/" adresine gidilir; başarı göstergesi
   * (örn. "Oturumu Kapat") kısa bir sürede görünürse oturum geçerlidir, görünmezse
   * (login formuna düşülmüştür — oturum süresi dolmuş ya da hiç oluşturulmamıştır)
   * false döner ve çağıran taraf gerçek login'e düşer.
   */
  async oturumGecerliMi(successText: string): Promise<boolean> {
    await this.page.goto('/');
    return this.page
      .getByText(successText, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
  }

  async login(credentials: Credentials, successText: string): Promise<void> {
    const definition = getEnvironment(this.environment);

    await this.page.goto('/');
    await this.page.locator('input[type="text"]').first().fill(credentials.username);
    await this.page.locator('input[type="password"]').first().fill(credentials.password);
    await this.submit();

    if (definition.login.authenticatorRequired) {
      if (!credentials.authenticatorCode) {
        throw new Error('CANLI_AUTH_CODE .env dosyasında tanımlı olmalı.');
      }

      await this.page.locator('#Gauthcode').fill(credentials.authenticatorCode);
      await this.submit();
    }

    await expect(this.page.getByText(successText, { exact: true })).toBeVisible();
  }

  private async submit(): Promise<void> {
    await this.page
      .locator('button, input[type="submit"], input[type="image"]')
      .first()
      .click();
  }
}
