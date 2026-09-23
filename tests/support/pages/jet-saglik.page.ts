import { expect, type Page, type Response } from '@playwright/test';
import { bugununTarihi } from '../dates';
import type {
  JetSaglikTestData,
  OzelKimlikData,
  OrtakAdresData,
  PasaportKimlikData,
  TuzelKimlikData,
  YabanciKimlikData
} from '../test-data';

export type SaglikSigortaliTipi = 'yabanciKimlik' | 'pasaport';
export type SaglikSigortaEttirenTipi = 'kendisi' | 'ozel' | 'tuzel' | 'pasaport';
export type SaglikSigortali = YabanciKimlikData | PasaportKimlikData;
export type SaglikSigortaEttiren = OzelKimlikData | TuzelKimlikData | PasaportKimlikData;

type UrunData = JetSaglikTestData['jetSaglik'];
type ApiResult = { Status: boolean; Data: unknown };

export class JetSaglikPage {
  constructor(private readonly page: Page) {}

  async ac(sigortaliTelefonu: string): Promise<void> {
    await this.page.goto('/jet-satis/jet-saglik/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('#InsuredType-O')).toBeVisible();
    // Sayfa acente kaydındaki varsayılan telefonu getiriyor; senaryo telefonu
    // sorgudan önce zorunlu alanı karşılamak için ekran açılır açılmaz yazılır.
    await this.telefonGir('#MobilePhoneCountry', '#MobilePhone', sigortaliTelefonu);
  }

  async sigortaliBilgileriniGir(
    tip: SaglikSigortaliTipi,
    kimlik: SaglikSigortali
  ): Promise<void> {
    if (tip === 'yabanciKimlik') {
      const yabanci = kimlik as YabanciKimlikData;
      await this.radioSec('#InsuredType-O');
      await this.tarihGir('#BirthDate', yabanci.dogumTarihi);
      await this.page.locator('#IdentityNo').fill(yabanci.yabanciKimlikNo);
      await expect(this.page.locator('#IdentityNo')).toHaveValue(yabanci.yabanciKimlikNo);
      const response = await this.sorgula('/ajx-kimlikno', '#QueryIdentity');
      await this.apiSonucunuDogrula(response, 'Sigortalı yabancı kimlik sorgusu');
      await this.kimlikSorguArayuzunuBekle('#IdentityNo', '#IdentityDetail');
      await this.telefonuGerekirseDuzelt(
        '#MobilePhoneCountry',
        '#MobilePhone',
        yabanci.cepTelefonu
      );
      await this.telefonDegeriniDogrula('#MobilePhone', yabanci.cepTelefonu, 'Sigortalı');
    } else {
      const pasaport = kimlik as PasaportKimlikData;
      await this.radioSec('#InsuredType-P');
      await this.page.locator('#Nationality').selectOption({ label: pasaport.uyruk });
      await this.page.locator('#PassportNumber').fill(pasaport.pasaportNo);
      const response = await this.sorgula('/ajx-passport', '#QueryPassportNumber');
      expect(response.ok(), 'Sigortalı pasaport sorgusu HTTP isteği başarılı olmalı').toBeTruthy();
      await this.pasaportDetaylariniGir(pasaport);
      await this.telefonuGerekirseDuzelt(
        '#MobilePhoneCountry',
        '#MobilePhone',
        pasaport.cepTelefonu
      );
      await this.telefonDegeriniDogrula('#MobilePhone', pasaport.cepTelefonu, 'Sigortalı');
    }

    await expect(this.page.locator('#PolicyDetail')).toBeVisible();
    await expect(this.page.locator('#Hesapla')).toBeVisible();
  }

  async sigortaEttirenBilgileriniGir(
    tip: SaglikSigortaEttirenTipi,
    kimlik?: SaglikSigortaEttiren
  ): Promise<void> {
    if (tip === 'kendisi') {
      await this.radioSec('#DifferentClient-H');
      return;
    }

    if (!kimlik) {
      throw new Error(`Sigorta ettiren datası bulunamadı: ${tip}`);
    }

    await this.radioSec('#DifferentClient-E');
    const selector = { ozel: '#ClientType-O', tuzel: '#ClientType-T', pasaport: '#ClientType-P' }[tip];
    await this.radioSec(selector);

    if (tip === 'ozel') {
      const ozel = kimlik as OzelKimlikData;
      await this.readonlyTarihAyarla('#BirthDateCL', ozel.dogumTarihi);
      await this.page.keyboard.press('Escape');
      // Uygulama kimlik sorgusunu göndermeden önce telefonu zorunlu tutuyor.
      await this.telefonGir('#ClientMobilePhoneCountry', '#ClientMobilePhone', ozel.cepTelefonu);
      await this.page.locator('#ClientIdentityNo').fill(ozel.tcKimlikNo);
      await expect(this.page.locator('#ClientIdentityNo')).toHaveValue(ozel.tcKimlikNo);
      const response = await this.sorgula('/ajx-kimlikno', '#QueryClientIdentity');
      await this.apiSonucunuDogrula(response, 'Sigorta ettiren özel sorgusu');
      await this.kimlikSorguArayuzunuBekle('#ClientIdentityNo', '#ClientIdentityDetail');
      // Kimlik sorgusu bazı müşterilerde kayıtlı eski telefonu alana yeniden yazabiliyor.
      // Yalnızca değer gerçekten değiştiyse test datasındaki telefon geri yüklenir.
      await this.telefonuGerekirseDuzelt(
        '#ClientMobilePhoneCountry',
        '#ClientMobilePhone',
        ozel.cepTelefonu
      );
      await this.telefonDegeriniDogrula(
        '#ClientMobilePhone',
        ozel.cepTelefonu,
        'Sigorta ettiren'
      );
    } else if (tip === 'tuzel') {
      const tuzel = kimlik as TuzelKimlikData;
      await this.telefonGir('#ClientMobilePhoneCountry', '#ClientMobilePhone', tuzel.cepTelefonu);
      await this.page.locator('#ClientIdentityNo').fill(tuzel.vergiKimlikNo);
      const response = await this.sorgula('/ajx-kimlikno', '#QueryClientIdentity');
      await this.apiSonucunuDogrula(response, 'Sigorta ettiren tüzel sorgusu');
      await this.kimlikSorguArayuzunuBekle('#ClientIdentityNo', '#ClientIdentityDetail');
      await this.telefonuGerekirseDuzelt(
        '#ClientMobilePhoneCountry',
        '#ClientMobilePhone',
        tuzel.cepTelefonu
      );
      await this.telefonDegeriniDogrula(
        '#ClientMobilePhone',
        tuzel.cepTelefonu,
        'Sigorta ettiren'
      );
    } else {
      const pasaport = kimlik as PasaportKimlikData;
      await this.page.locator('#ClientNationality').selectOption({ label: pasaport.uyruk });
      await this.page.locator('#ClientPassportNumber').fill(pasaport.pasaportNo);
      const response = await this.sorgula('/ajx-passport', '#QueryClientPassportNumber');
      expect(response.ok(), 'Sigorta ettiren pasaport sorgusu HTTP isteği başarılı olmalı').toBeTruthy();
      await this.pasaportDetaylariniGir(pasaport, 'Client');
      // Pasaport görünümünde cep telefonu satırı gizli olsa da hesaplama servisi
      // ClientMobilePhone model alanını zorunlu tutuyor.
      await this.telefonGir(
        '#ClientMobilePhoneCountry',
        '#ClientMobilePhone',
        pasaport.cepTelefonu
      );
    }
  }

  async policeBilgileriniGir(data: UrunData, sigortaliAdresi?: OrtakAdresData): Promise<void> {
    if (sigortaliAdresi) {
      await this.sigortaliAdresiniGir(sigortaliAdresi);
    } else {
      await this.eksikAdresSecimleriniTamamla();
    }
    await this.readonlyTarihAyarla('#BeginDate', bugununTarihi());
    await this.page.locator('#slPolicyPeriod').selectOption(data.policeSuresi.deger);
    await this.page.locator('#slHaveDisease').selectOption(data.hastalik.deger);
    await this.page.locator('#KVKKOnay').selectOption(data.kvkkOnayi.deger);
    await this.gizliSelectSec('#Yenileme', data.yenileme.deger);
    await this.page.locator('#DiscountRate').fill(data.indirimOrani);

    await expect(this.page.locator('#slPolicyPeriod')).toHaveValue(data.policeSuresi.deger);
    await expect(this.page.locator('#slHaveDisease')).toHaveValue(data.hastalik.deger);
    await expect(this.page.locator('#KVKKOnay')).toHaveValue(data.kvkkOnayi.deger);
    await expect(this.page.locator('#Yenileme')).toHaveValue(data.yenileme.deger);
    await this.page.keyboard.press('Escape');
  }

  async primHesapla(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) =>
        new URL(candidate.url()).pathname.endsWith('/jet-satis/jet-saglik/hesapla')
      ),
      this.page.locator('#Hesapla').click()
    ]);
    await this.apiSonucunuDogrula(response, 'Prim hesaplama');
    await expect(this.page.locator('#premium-total')).not.toHaveText(/^(0|0,00)\s*TL$/i);
    await expect(this.page.locator('#Policelestir')).toBeVisible();
  }

  private async sorgula(endpoint: string, buttonSelector: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (candidate) => new URL(candidate.url()).pathname.endsWith(endpoint),
        { timeout: 30_000 }
      ),
      this.page
        .locator(buttonSelector)
        .evaluate((element) => (element as HTMLElement).click())
    ]);
    return response;
  }

  private async apiSonucunuDogrula(response: Response, islem: string): Promise<void> {
    expect(response.ok(), `${islem} HTTP isteği başarılı olmalı`).toBeTruthy();
    const result = (await response.json()) as ApiResult;
    if (!result.Status) {
      throw new Error(`${islem} başarısız: ${String(result.Data)}`);
    }
  }

  private async kimlikSorguArayuzunuBekle(
    kimlikSelector: string,
    detaySelector?: string
  ): Promise<void> {
    const kimlik = this.page.locator(kimlikSelector);
    await expect.poll(() => kimlik.getAttribute('readonly')).toBeNull();
    if (detaySelector) {
      await expect(this.page.locator(detaySelector)).toBeVisible();
    }
  }

  private async radioSec(selector: string): Promise<void> {
    const radio = this.page.locator(selector);
    if (!(await radio.isChecked())) {
      await radio.evaluate((element) => (element as HTMLInputElement).click());
    }
    await expect(radio).toBeChecked();
  }

  private async pasaportDetaylariniGir(
    pasaport: PasaportKimlikData,
    onEk: '' | 'Client' = ''
  ): Promise<void> {
    const selector = (alan: string) => `#${onEk}${alan}`;

    await expect(this.page.locator(selector('Firstname'))).toBeVisible();
    await this.page.locator(selector('Firstname')).fill(pasaport.ad);
    await this.page.locator(selector('Lastname')).fill(pasaport.soyad);
    await this.page.locator(selector('FatherName')).fill(pasaport.babaAdi);
    await this.readonlyTarihAyarla(selector('Birthday'), pasaport.dogumTarihi);
    await this.page.locator(selector('Birthplace')).fill(pasaport.dogumYeri);
    await this.radioSec(selector(pasaport.cinsiyet === 'erkek' ? 'Gender-E' : 'Gender-K'));

    await expect(this.page.locator(selector('Firstname'))).toHaveValue(pasaport.ad);
    await expect(this.page.locator(selector('Lastname'))).toHaveValue(pasaport.soyad);
    await expect(this.page.locator(selector('FatherName'))).toHaveValue(pasaport.babaAdi);
    await expect(this.page.locator(selector('Birthday'))).toHaveValue(pasaport.dogumTarihi);
    await expect(this.page.locator(selector('Birthplace'))).toHaveValue(pasaport.dogumYeri);
  }

  private async telefonGir(kodSelector: string, telefonSelector: string, telefon: string): Promise<void> {
    if (!/^5\d{9}$/.test(telefon)) {
      throw new Error(`Telefon numarası 5 ile başlayan 10 rakam olmalıdır: ${telefon}`);
    }

    const kodAlani = this.page.locator(kodSelector);
    await expect(kodAlani).toHaveCount(1);
    await kodAlani.evaluate((element) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '90');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const alan = this.page.locator(telefonSelector);
    await expect(alan).toHaveCount(1);
    const bicimlendirilmisTelefon = `(${telefon.slice(0, 3)}) ${telefon.slice(3, 6)} ${telefon.slice(6, 8)} ${telefon.slice(8)}`;

    // Maskeli alanda karakter karakter yazmak imleci kaydırıp rakamların sırasını
    // bozabiliyor. Değer tek işlemde atanır; böylece tıklama/imleç konumu etkisizdir.
    await alan.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }, bicimlendirilmisTelefon);

    await this.telefonDegeriniDogrula(telefonSelector, telefon, 'Girilen');
  }

  private async telefonuGerekirseDuzelt(
    kodSelector: string,
    telefonSelector: string,
    beklenenTelefon: string
  ): Promise<void> {
    // Ajax cevabından sonraki jQuery ekran güncellemesinin tamamlanmasını bekler.
    await this.page.waitForTimeout(500);
    const alan = this.page.locator(telefonSelector);
    const mevcutTelefon = await alan.evaluate((element) =>
      (element as HTMLInputElement).value.replace(/\D/g, '')
    );
    if (mevcutTelefon !== beklenenTelefon) {
      await this.telefonGir(kodSelector, telefonSelector, beklenenTelefon);
    }
  }

  private async telefonDegeriniDogrula(
    selector: string,
    beklenenTelefon: string,
    alanAdi: string
  ): Promise<void> {
    const alan = this.page.locator(selector);
    await expect
      .poll(
        () =>
          alan.evaluate((element) =>
            (element as HTMLInputElement).value.replace(/\D/g, '')
          ),
        { message: `${alanAdi} telefonu kimlik sorgusundan sonra değişmemelidir.` }
      )
      .toBe(beklenenTelefon);
  }

  private async tarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.fill(tarih);
    await alan.press('Tab');
    await this.takvimiKapat();
    await expect(alan).toHaveValue(tarih);
  }

  private async takvimiKapat(): Promise<void> {
    const takvim = this.page.locator('#ui-datepicker-div');
    if (await takvim.isVisible()) {
      await takvim.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.display = 'none';
        htmlElement.style.opacity = '0';
        htmlElement.classList.add('ui-helper-hidden-accessible');
      });
    }
    await expect(takvim).toBeHidden();
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

  private async eksikAdresSecimleriniTamamla(): Promise<void> {
    const belde = this.page.locator('#BE');
    if ((await belde.inputValue()) === '-1') {
      const ilkGecerliDeger = await belde
        .locator('option')
        .evaluateAll((options) =>
          options
            .map((option) => (option as HTMLOptionElement).value)
            .find((value) => value !== '' && value !== '-1')
        );

      if (!ilkGecerliDeger) {
        throw new Error('JetSağlık adres sorgusunda seçilebilir Belde/Köy değeri bulunamadı.');
      }
      await belde.selectOption(ilkGecerliDeger);
    }
    await expect(belde).not.toHaveValue('-1');
    // MAHALLE ve CADDE alanları zorunlu; dolayısıyla Belde/Köy seçildikten sonra bu alanlar boşsa test datasındaki değerler yazılır.
    const mahalle = this.page.locator('#MH');
    if ((await mahalle.inputValue()).trim() === '') {
      await mahalle.fill('Test Mahallesi');
    }
    await expect(mahalle).not.toHaveValue('');

    const cadde = this.page.locator('#CD');
    if ((await cadde.inputValue()).trim() === '') {
      await cadde.fill('Test Caddesi');
    }
    await expect(cadde).not.toHaveValue('');
  }
  
  private async sigortaliAdresiniGir(adres: OrtakAdresData): Promise<void> {
    await this.page.locator('#IL').selectOption(adres.il.deger);
    await expect(this.page.locator(`#IC option[value="${adres.ilce.deger}"]`)).toHaveCount(1, {
      timeout: 15_000
    });
    await this.page.locator('#IC').selectOption(adres.ilce.deger);
    await expect(this.page.locator(`#BE option[value="${adres.belde.deger}"]`)).toHaveCount(1, {
      timeout: 15_000
    });
    await this.page.locator('#BE').selectOption(adres.belde.deger);

    await this.page.locator('#CD').fill(adres.cadde);
    await this.page.locator('#SK').fill(adres.sokak);
    await this.page.locator('#STAPSelector').selectOption(adres.adresTipi.deger);
    await this.page.locator('#STAP').fill(adres.adresParcasi);
    await this.page.locator('#MH').fill(adres.mahalle);
    await this.page.locator('#BN').fill(adres.binaNo);
    await this.page.locator('#BK').fill(adres.blokKodu);
    await this.page.locator('#SM').fill(adres.siteAdi);
    await this.page.locator('#DR').fill(adres.daireNo);
    await this.page.locator('#KT').fill(adres.kat);

    await expect(this.page.locator('#IL')).toHaveValue(adres.il.deger);
    await expect(this.page.locator('#IC')).toHaveValue(adres.ilce.deger);
    await expect(this.page.locator('#BE')).toHaveValue(adres.belde.deger);
    await expect(this.page.locator('#CD')).toHaveValue(adres.cadde);
    await expect(this.page.locator('#SK')).toHaveValue(adres.sokak);
    await expect(this.page.locator('#MH')).toHaveValue(adres.mahalle);
    await expect(this.page.locator('#BN')).toHaveValue(adres.binaNo);
    await expect(this.page.locator('#BK')).toHaveValue(adres.blokKodu);
    await expect(this.page.locator('#DR')).toHaveValue(adres.daireNo);
  }

  private async gizliSelectSec(selector: string, value: string): Promise<void> {
    const select = this.page.locator(selector);
    await select.evaluate((element, selectedValue) => {
      const htmlSelect = element as HTMLSelectElement;
      htmlSelect.value = selectedValue;
      htmlSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect(select).toHaveValue(value);
  }
}
