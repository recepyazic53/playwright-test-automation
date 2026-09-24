import { expect, type Page } from '@playwright/test';
import type { Credentials, EnvironmentName } from '../environments';
import { getEnvironment } from '../environments';

// TEST portalı girişi zaman zaman yavaş yanıtlıyor (giriş butonundan sonra 15 sn'yi aşan
// yüklemeler görüldü). Varsayılan 5 sn'lik bekleme bu durumda başarılı girişi de hata
// sayıyordu, bu yüzden giriş sonrası ve oturum kontrolü için daha uzun süre beklenir.
const GIRIS_BEKLEME_SURESI_MS = 45_000;
const OTURUM_KONTROL_SURESI_MS = 15_000;

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
      .waitFor({ state: 'visible', timeout: OTURUM_KONTROL_SURESI_MS })
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
        throw new Error('CANLI giriş profilinde iki aşamalı doğrulama (TOTP anahtarı ya da sabit kod) tanımlı olmalı (Nöbetçi > Ayarlar > Giriş profilleri).');
      }

      await this.page.locator('#Gauthcode').fill(credentials.authenticatorCode);
      await this.submit();
    }

    await expect(this.page.getByText(successText, { exact: true })).toBeVisible({ timeout: GIRIS_BEKLEME_SURESI_MS });
  }

  private async submit(): Promise<void> {
    await this.page
      .locator('button, input[type="submit"], input[type="image"]')
      .first()
      .click();
  }
}
