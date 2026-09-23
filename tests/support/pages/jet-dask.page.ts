import { expect, type Page, type Response } from '@playwright/test';
import { bugununTarihi } from '../dates';
import type {
  JetDaskTestData,
  OzelKimlikData,
  PasaportKimlikData,
  TuzelKimlikData
} from '../test-data';

export type DaskKimlikTipi = 'ozel' | 'tuzel' | 'pasaport';
export type DaskKimlik = OzelKimlikData | TuzelKimlikData | PasaportKimlikData;
export type DaskSigortaEttirenSifati = 'malSahibi' | 'kiraci';

type DaskData = JetDaskTestData['jetDask'];
type ApiResult = { Status: boolean; Data: unknown };

export class JetDaskPage {
  constructor(private readonly page: Page) {}

  async ac(): Promise<void> {
    await this.page.goto('/jet-satis/jet-dask/', { waitUntil: 'domcontentloaded' });
    await this.page.locator('#Renewal-H').click();
    await expect(this.page.locator('#IdentityNo')).toBeVisible();
  }

  async sigortaliBilgileriniGir(tip: DaskKimlikTipi, kimlik: DaskKimlik): Promise<void> {
    const tipSelector = {
      ozel: '#InsuredType-O',
      tuzel: '#InsuredType-T',
      pasaport: '#InsuredType-P'
    }[tip];
    await this.page.locator(tipSelector).click({ force: true });

    // Kimlik sorgu servisi telefonu istek sırasında zorunlu tutuyor.
    await this.page.locator('#MobilePhoneCountry').fill('90');
    await this.page.locator('#TL').fill(kimlik.cepTelefonu);

    if (tip === 'ozel') {
      const ozel = kimlik as OzelKimlikData;
      await this.tarihGir('#BirthDate', ozel.dogumTarihi);
      await this.page.locator('#IdentityNo').fill(ozel.tcKimlikNo);
    } else if (tip === 'tuzel') {
      await this.page.locator('#IdentityNo').fill(
        (kimlik as TuzelKimlikData).vergiKimlikNo
      );
    } else {
      const pasaport = kimlik as PasaportKimlikData;
      await this.tarihGir('#BirthDate', pasaport.dogumTarihi);
      await this.page.locator('#Nationality').selectOption({ label: pasaport.uyruk });
      await this.page.locator('#IdentityNo').fill(pasaport.pasaportNo);
      await this.takvimiKapat();
    }

    const endpoint = tip === 'pasaport' ? '/ajx-passport' : '/ajx-kimlikno';
    const sorgula = tip === 'pasaport' ? '#QueryPassportNumber' : '#RefreshIdentity';
    let response: Response;
    try {
      [response] = await Promise.all([
        this.page.waitForResponse(
          (candidate) => new URL(candidate.url()).pathname.endsWith(endpoint),
          { timeout: 20_000 }
        ),
        this.page.locator(sorgula).click()
      ]);
    } catch (error) {
      if (tip === 'pasaport') {
        throw new Error(
          'Pasaport sorgusu 20 saniye içinde başlatılmadı. TEST ortamındaki JetDASK pasaport sorgulama davranışı kontrol edilmelidir.',
          { cause: error }
        );
      }
      throw error;
    }
    await this.apiSonucunuDogrula(response, 'Sigortalı sorgusu');

    await expect(this.page.locator('#IdentityDetail')).toBeVisible();
    await expect(this.page.locator('#identity-name')).not.toContainText('Aranıyor');

    // Kimlik sorgusu bazı müşterilerde iletişim alanlarını yeniden oluşturuyor.
    // Bu nedenle telefon, sorgu tamamlandıktan sonra girilip doğrulanır.
    await this.page.locator('#MobilePhoneCountry').fill('90');
    const telefon = this.page.locator('#TL');
    await telefon.fill(kimlik.cepTelefonu);
    await expect
      .poll(() =>
        telefon.evaluate((element) =>
          (element as HTMLInputElement).value.replace(/\D/g, '')
        )
      )
      .toBe(kimlik.cepTelefonu);
  }

  async adresVePoliceBilgileriniGir(
    data: DaskData,
    sigortaEttirenSifati: DaskSigortaEttirenSifati
  ): Promise<void> {
    await this.page
      .locator('#InsurerType')
      .selectOption(data.sigortaEttirenSifatlari[sigortaEttirenSifati].deger);

    await this.page.locator('#AK').fill(data.adresKodu);
    const [adresResponse] = await Promise.all([
      this.page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith('/ajx-uavt') &&
        (response.request().postData() ?? '').includes('DataSource=Address')
      ),
      this.page.locator('#RefreshUAVT').click()
    ]);
    await this.apiSonucunuDogrula(adresResponse, 'Adres sorgusu');
    await expect(this.page.locator('#DR')).toHaveValue(data.adresKodu, {
      timeout: 20_000
    });

    await this.page.locator('#AD').fill(data.tapu.ada);
    await this.page.locator('#SY').fill(data.tapu.sayfaNo);
    await this.page.locator('#PF').fill(data.tapu.pafta);
    await this.page.locator('#BB').fill(data.tapu.bagimsizBolum);
    await this.page.locator('#PR').fill(data.tapu.parsel);
    await this.readonlyTarihAyarla('#BeginDate', bugununTarihi());
    await this.page.locator('#GrossAreaM2').fill(data.brutYuzolcum);
    await this.page.locator('#UsageType').selectOption(data.kullanimSekli.deger);
    await this.page.locator('#BuildType').selectOption(data.insaTarzi.deger);
    await this.page.locator('#BuildYear').selectOption(data.insaYili.deger);
    await this.page.locator('#TotalFloor').selectOption(data.toplamKat.deger);
    await this.page.locator('#AnteriorDamage').selectOption(data.oncekiHasar.deger);
    await this.bulunduguKatSec(data.bulunduguKat);
    await this.page.locator('#LP-Y').click({ force: true });
    await expect(this.page.locator('#LP-Y')).toBeChecked();
  }

  async primHesapla(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) =>
        new URL(candidate.url()).pathname.endsWith('/jet-satis/jet-dask/hesapla')
      ),
      this.page.locator('#Hesapla').click()
    ]);
    await this.apiSonucunuDogrula(response, 'Prim hesaplama');

    await expect(this.page.locator('#premium-total')).toContainText(/[1-9]/);
    await expect(this.page.locator('#dask-amount')).toContainText(/[1-9]/);
    await expect(this.page.locator('#Policelestir')).toBeVisible();
  }

  private async bulunduguKatSec(data: DaskData['bulunduguKat']): Promise<void> {
    const select = this.page.locator('#KT');
    const option = select.locator(`option[value="${data.deger}"]`);

    if ((await option.count()) === 0) {
      if (!data.testOrtamSecenekWorkaround) {
        throw new Error(`Bulunduğu Kat seçeneği bulunamadı: ${data.metin}`);
      }

      // TEST ortamındaki eksik sabit liste düzeltilene kadar canlıdaki value=3
      // seçeneğini ekle. JSON bayrağı kapatıldığında bu geçici yol kullanılmaz.
      await select.evaluate(
        (element, kat) => {
          const htmlSelect = element as HTMLSelectElement;
          htmlSelect.add(new Option(kat.metin, kat.deger));
        },
        { deger: data.deger, metin: data.metin }
      );
    }

    await select.selectOption(data.deger);
    await expect(select).toHaveValue(data.deger);
  }

  private async apiSonucunuDogrula(response: Response, islem: string): Promise<void> {
    expect(response.ok(), `${islem} HTTP isteği başarılı olmalı`).toBeTruthy();
    const result = (await response.json()) as ApiResult;
    if (!result.Status) {
      throw new Error(`${islem} başarısız: ${String(result.Data)}`);
    }
  }

  private async readonlyTarihAyarla(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, tarih);
    await expect(alan).toHaveValue(tarih);
  }

  private async tarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.fill(tarih);
    await alan.press('Tab');
    await this.page.keyboard.press('Escape');
    await this.takvimiKapat();
    await expect(alan).toHaveValue(tarih);
  }

  private async takvimiKapat(): Promise<void> {
    const takvim = this.page.locator('#ui-datepicker-div');
    if ((await takvim.count()) === 0) return;

    await takvim.evaluate((element) => {
      const html = element as HTMLElement;
      html.style.display = 'none';
      html.style.opacity = '0';
      html.classList.add('ui-helper-hidden-accessible');
    });
    await expect(takvim).toBeHidden();
  }
}
