import { expect, type Page } from '@playwright/test';
import { bugununTarihi } from '../dates';
import type {
  JetKonutTestData,
  OzelKimlikData,
  TuzelKimlikData
} from '../test-data';

export type KonutKimlikTipi = 'ozel' | 'tuzel';
export type KonutKimlik = OzelKimlikData | TuzelKimlikData;
export type KonutSigortaliDurumu = 'malSahibi' | 'kiraci';

type KonutData = JetKonutTestData['jetKonut'];

export class JetKonutPage {
  constructor(private readonly page: Page) {}

  async ac(): Promise<void> {
    await this.page.goto('/jet-satis/jet-konut/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('#IdentityNumber')).toBeVisible();
  }

  async sigortaliBilgileriniGir(tip: KonutKimlikTipi, kimlik: KonutKimlik): Promise<void> {
    await this.radioSec(tip === 'ozel' ? '#CustomerType-O' : '#CustomerType-T');
    await this.telefonGir('#TelefonKodu', '#Telefonu', kimlik.cepTelefonu);

    if (tip === 'ozel') {
      const ozel = kimlik as OzelKimlikData;
      await this.tarihGir('#BirthDate', ozel.dogumTarihi);
      await this.page.locator('#IdentityNumber').fill(ozel.tcKimlikNo);
    } else {
      await this.page.locator('#IdentityNumber').fill(
        (kimlik as TuzelKimlikData).vergiKimlikNo
      );
    }

    await this.hataTakibiniBaslat();
    await this.page.locator("a[href=\"javascript:CheckIdentity('INSURED')\"]").click();
    await this.kimlikSorguSonucunuDogrula('#IdentityDetail', 'Sigortalı');
  }

  async sigortaEttirenAyniSec(): Promise<void> {
    await this.radioSec('#DifferentClient-H');
  }

  async farkliSigortaEttirenGir(tip: KonutKimlikTipi, kimlik: KonutKimlik): Promise<void> {
    await this.radioSec('#DifferentClient-E');
    await this.radioSec(tip === 'ozel' ? '#ClientType-O' : '#ClientType-T');
    await this.telefonGir('#ClientTelefonKodu', '#ClientTelefonu', kimlik.cepTelefonu);

    if (tip === 'ozel') {
      const ozel = kimlik as OzelKimlikData;
      await this.tarihGir('#ClientBirthDate', ozel.dogumTarihi);
      await this.page.locator('#ClientIdentityNumber').fill(ozel.tcKimlikNo);
    } else {
      await this.page.locator('#ClientIdentityNumber').fill(
        (kimlik as TuzelKimlikData).vergiKimlikNo
      );
    }

    await this.hataTakibiniBaslat();
    await this.page.locator("a[href=\"javascript:CheckIdentity('CLIENT')\"]").click();
    await this.kimlikSorguSonucunuDogrula('#ClientIdentityDetail', 'Sigorta Ettiren');
  }

  async rizikoVePoliceBilgileriniGir(
    data: KonutData,
    sigortaliDurumu: KonutSigortaliDurumu
  ): Promise<void> {
    await this.page.locator('#AK').fill(data.adresKodu);
    await this.page.locator('#RefreshUAVT').click();
    await expect(this.page.locator('#DR')).not.toHaveValue('-1', { timeout: 20_000 });
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, {
      timeout: 20_000
    });

    await this.readonlyTarihAyarla('#BeginDate', bugununTarihi());
    await this.radioSec(sigortaliDurumu === 'malSahibi' ? '#IsOwner-E' : '#IsOwner-H');
    await this.gizliSelectSec('#BuildingType', data.binaTipi.deger);
    if (sigortaliDurumu === 'malSahibi') {
      await this.page.locator('#GrossAreaM2').fill(data.brutYuzolcum);
      await this.radioSec(
        data.daskaBagli === 'evet' ? '#IsDASKDepended-E' : '#IsDASKDepended-H'
      );
    }
    await this.radioSec(data.dainiMurtehin === 'var' ? '#IsHaveLossPayee-E' : '#IsHaveLossPayee-H');
    await this.gizliSelectSec('#AlternativePlus', data.alternatifPlus.deger);
    await this.gizliSelectSec('#Alternative', data.alternatif.deger);
    await this.gizliSelectSec('#ConstructionType', data.yapiTarzi.deger);
    await this.gizliSelectSec('#TotalFloor', data.toplamKat.deger);
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, {
      timeout: 20_000
    });
    await this.gizliSelectSec('#RiskFloor', data.rizikonunBulunduguKat.deger);
    await this.gizliSelectSec('#RoofType', data.catiTipi.deger);
    await this.radioSec(
      data.altmisGundenFazlaBos === 'evet'
        ? '#BlankMoreThan60Days-E'
        : '#BlankMoreThan60Days-H'
    );
    await this.page.locator('#BuildYear').fill(data.binaInsaYili);
    await expect(this.page.locator('#RiskFloor')).toHaveValue(
      data.rizikonunBulunduguKat.deger
    );
  }

  async teklifAl(): Promise<void> {
    await this.page.locator('#TeklifHesaplaButon').click();
    const teklifKaydet = this.page.locator('#TeklifKaydetButon');
    const hataBasligi = this.page.getByText('JetKonut Hızlı Teklif Ekranı', { exact: true });
    let hataMesaji = '';

    await expect
      .poll(
        async () => {
          if (await teklifKaydet.isVisible()) return 'basarili';
          if (await hataBasligi.isVisible()) {
            hataMesaji = (await hataBasligi.locator('xpath=../..').innerText()).trim();
            return 'hata';
          }
          return 'bekleniyor';
        },
        { timeout: 45_000, message: 'Teklif sonucu veya hata penceresi görünmelidir.' }
      )
      .not.toBe('bekleniyor');

    if (hataMesaji) throw new Error(`Teklif alınamadı: ${hataMesaji}`);
    await expect(teklifKaydet).toBeVisible();
  }

  async teminatlariGir(
    data: KonutData,
    sigortaliDurumu: KonutSigortaliDurumu
  ): Promise<void> {
    await this.page.locator('#btnStandart').click();
    const sonrakiAdim = this.page.locator('#TeklifHesaplaButon');
    await expect(sonrakiAdim).toBeVisible();
    await expect(sonrakiAdim).toContainText('Sonraki Adım');
    await sonrakiAdim.click();

    await expect(this.page.locator('#C1008')).toBeVisible();
    if (sigortaliDurumu === 'malSahibi') {
      await this.page.locator('#C1000').fill(data.teminatlar.binaYangin);
    }
    await this.page.locator('#C1008').fill(data.teminatlar.esyaYangin);
    await this.page.locator('#C1089').fill(data.teminatlar.dahiliDekorasyonYangin);
    await this.page.locator('#C1036').fill(data.teminatlar.camKirilmasi);
    await this.checkboxAyarla('#C1016', data.teminatlar.esyaDeprem);
    await this.checkboxAyarla('#C1087', data.teminatlar.dahiliDekorasyonDeprem);
    await this.checkboxAyarla('#C1090', data.teminatlar.hirsizlik);
    await this.checkboxAyarla('#C1092', data.teminatlar.binaSabitKiymetHirsizlik);
    await this.gizliSelectSec('#PersonalAccidentLimit', data.teminatlar.ferdiKazaTekLimit.deger);
    await this.gizliSelectSec('#LegalProtection', data.teminatlar.hukuksalKoruma.deger);
    await this.gizliSelectSec('#InflationRate', data.teminatlar.enflasyonOrani.deger);
  }

  private async checkboxAyarla(selector: string, secili: boolean): Promise<void> {
    const checkbox = this.page.locator(selector);
    if ((await checkbox.isChecked()) !== secili) {
      await checkbox.locator('xpath=..').locator('a').click({ force: true });
      if ((await checkbox.isChecked()) !== secili) {
        await checkbox.evaluate((element) => (element as HTMLInputElement).click());
      }
    }
    await expect(checkbox).toBeChecked({ checked: secili });
  }

  private async kimlikSorguSonucunuDogrula(selector: string, baslik: string): Promise<void> {
    const sonuc = await this.page
      .waitForFunction(
        ({ selector, baslik }) => {
          const monitor = (window as typeof window & {
            __jetKonutErrorMonitor?: { errors: string[] };
          }).__jetKonutErrorMonitor;
          const hata = monitor?.errors.at(0);
          if (hata) return { durum: 'hata', mesaj: hata };

          const detay = document.querySelector<HTMLElement>(selector);
          if (!detay || !(detay.offsetWidth || detay.offsetHeight || detay.getClientRects().length)) {
            return false;
          }
          const metin = detay.innerText.replace(baslik, '').trim();
          return metin ? { durum: 'basarili', mesaj: metin } : false;
        },
        { selector, baslik },
        { timeout: 20_000 }
      )
      .then((handle) => handle.jsonValue() as Promise<{ durum: string; mesaj: string }>);

    if (sonuc.durum === 'hata') {
      throw new Error(`${baslik} sorgusu başarısız: ${sonuc.mesaj}`);
    }
  }

  private async hataTakibiniBaslat(): Promise<void> {
    await this.page.evaluate(() => {
      type ErrorMonitor = { errors: string[]; observer: MutationObserver };
      const appWindow = window as typeof window & { __jetKonutErrorMonitor?: ErrorMonitor };
      appWindow.__jetKonutErrorMonitor?.observer.disconnect();

      const errors: string[] = [];
      const hataDeseni = /müşteri bulunamadı|bulunamadı|hata oluştu|başarısız|geçersiz|zorunlu|işlem yapılamadı|teklif oluşturulamadı|teminat bedeli/i;
      const selectorler = '[role="alert"],.alert-danger,.validation-summary-errors,.field-validation-error,.toast-error,.ui-dialog,.bootbox,.sweet-alert,.swal2-popup,.modal,#fancybox-wrap';
      const gorunur = (element: Element) => {
        const html = element as HTMLElement;
        const style = getComputedStyle(html);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
          Boolean(html.offsetWidth || html.offsetHeight || html.getClientRects().length);
      };
      const hataTopla = () => {
        const adaylar = new Set<Element>(document.querySelectorAll(selectorler));
        document.querySelectorAll('body *').forEach((element) => {
          const metin = (element as HTMLElement).innerText?.trim() ?? '';
          if (metin.length <= 500 && hataDeseni.test(metin) &&
              !Array.from(element.children).some((child) => hataDeseni.test((child as HTMLElement).innerText?.trim() ?? ''))) {
            adaylar.add(element);
          }
        });
        for (const aday of adaylar) {
          const metin = (aday as HTMLElement).innerText?.trim() ?? '';
          if (metin && gorunur(aday) && !errors.includes(metin)) errors.push(metin);
        }
      };
      const observer = new MutationObserver(hataTopla);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      appWindow.__jetKonutErrorMonitor = { errors, observer };
      hataTopla();
    });
  }

  private async radioSec(selector: string): Promise<void> {
    const radio = this.page.locator(selector);
    if (!(await radio.isChecked())) {
      await radio.locator('xpath=..').locator('a').click({ force: true });
      if (!(await radio.isChecked())) {
        await radio.evaluate((element) => (element as HTMLInputElement).click());
      }
    }
    await expect(radio).toBeChecked();
  }

  private async telefonGir(kodSelector: string, numaraSelector: string, telefon: string): Promise<void> {
    await this.page.locator(kodSelector).fill(telefon.slice(0, 3));
    await this.page.locator(numaraSelector).fill(telefon.slice(3));
  }

  private async tarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.click();
    await alan.press('Control+A');
    await alan.pressSequentially(tarih, { delay: 50 });
    await alan.press('Tab');
    await this.page.keyboard.press('Escape');
    await expect(alan).toHaveValue(tarih);
  }

  private async gizliSelectSec(selector: string, value: string): Promise<void> {
    const select = this.page.locator(selector);
    if ((await select.inputValue()) === value) return;
    const optionIndex = await select.evaluate(
      (element, selectedValue) =>
        Array.from((element as HTMLSelectElement).options).findIndex(
          (option) => option.value === selectedValue
        ),
      value
    );
    if (optionIndex < 0) throw new Error(`${selector} içinde ${value} seçeneği bulunamadı.`);

    const jqTransformOption = select
      .locator('xpath=..')
      .locator(`ul li a[index="${optionIndex}"]`);
    if (await jqTransformOption.count()) {
      await select.locator('xpath=..').locator('a.jqTransformSelectOpen').click();
      await expect(jqTransformOption).toBeVisible();
      await jqTransformOption.click();
    } else {
      await select.evaluate((element, selectedValue) => {
        const html = element as HTMLSelectElement;
        html.value = selectedValue;
        html.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    }
    await expect(select).toHaveValue(value);
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
}
