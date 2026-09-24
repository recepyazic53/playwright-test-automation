import { expect, type Page } from '@playwright/test';
import type {
  JetIlkAtesKonutTestData,
  OzelKimlikData,
  TuzelKimlikData
} from '../test-data';
import { bugununTarihi } from '../dates';

export type FireKimlikTipi = 'ozel' | 'tuzel';
export type FireKimlik = OzelKimlikData | TuzelKimlikData;
export type SigortaliDurumu = 'malSahibi' | 'kiraci';

type UrunData = JetIlkAtesKonutTestData['jetIlkAtesKonut'];

export class JetIlkAtesKonutPage {
  constructor(private readonly page: Page) {}

  async ac(): Promise<void> {
    await this.page.goto('/jet-satis/jet-fire/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('heading', { name: 'Sigortalı Bilgileri' })).toBeVisible();
  }

  async sigortaliBilgileriniGir(tip: FireKimlikTipi, kimlik: FireKimlik): Promise<void> {
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

  async farkliSigortaEttirenGir(tip: FireKimlikTipi, kimlik: FireKimlik): Promise<void> {
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

  async adresVePoliceBilgileriniGir(
    data: UrunData,
    sigortaliDurumu: SigortaliDurumu
  ): Promise<void> {
    await this.page.locator('#AK').fill(data.adresKodu);
    await this.page.locator('#RefreshUAVT').click();
    await expect(this.page.locator('#IL')).not.toHaveValue('-1', { timeout: 20_000 });
    await expect(this.page.locator('#DR')).not.toHaveValue('-1', { timeout: 20_000 });
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, {
      timeout: 20_000
    });

    await this.readonlyTarihAyarla('#BeginDate', bugununTarihi());
    await this.radioSec(sigortaliDurumu === 'malSahibi' ? '#IsOwner-E' : '#IsOwner-H');
    await this.gizliSelectSec('#Alternative', data.alternatif.deger);
    await expect(this.page.locator('#EsyaYangin')).toHaveValue(data.esyaYanginBedeli);
    await expect(this.page.locator('#EkTeminatlar')).toHaveValue(data.ekTeminatBedeli);
    await this.gizliSelectSec('#ConstructionType', data.yapiTarzi.deger);
    await this.page.locator('#BuildYear').fill(data.binaInsaYili);
  }

  async teklifAl(): Promise<void> {
    await this.hataTakibiniBaslat();
    await this.page.locator('#btnStandart').click();
    const sonuc = await this.page
      .waitForFunction(() => {
        const monitor = (window as typeof window & {
          __jetFireErrorMonitor?: { errors: string[] };
        }).__jetFireErrorMonitor;
        const hata = monitor?.errors.at(0);

        if (hata) {
          return { durum: 'hata', mesaj: hata };
        }

        const gorunenMetin = document.body.innerText;
        const prim = gorunenMetin.match(/Prim\s+[\d.,]+\s*₺/i)?.[0];
        return prim ? { durum: 'basarili', mesaj: prim } : false;
      }, undefined, { timeout: 45_000 })
      .then((handle) => handle.jsonValue() as Promise<{ durum: string; mesaj: string }>);

    if (sonuc.durum === 'hata') {
      throw new Error(`Teklif alınamadı: ${sonuc.mesaj}`);
    }

    expect(sonuc.mesaj, 'Ekranda görünür bir prim/teklif tutarı bulunmalıdır.').toMatch(
      /Prim\s+[\d.,]+\s*₺/i
    );
  }

  private async kimlikSorguSonucunuDogrula(
    detaySelector: string,
    baslik: string
  ): Promise<void> {
    const sonuc = await this.page
      .waitForFunction(
        ({ selector, label }) => {
          const monitor = (window as typeof window & {
            __jetFireErrorMonitor?: { errors: string[] };
          }).__jetFireErrorMonitor;
          const hata = monitor?.errors.at(0);

          if (hata) {
            return { durum: 'hata', mesaj: hata };
          }

          const detay = document.querySelector<HTMLElement>(selector);
          if (!detay || !(detay.offsetWidth || detay.offsetHeight || detay.getClientRects().length)) {
            return false;
          }

          const icerik = detay.innerText.replace(label, '').trim();
          return icerik
            ? { durum: 'basarili', mesaj: icerik }
            : false;
        },
        { selector: detaySelector, label: baslik },
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
      const appWindow = window as typeof window & {
        __jetFireErrorMonitor?: ErrorMonitor;
      };

      appWindow.__jetFireErrorMonitor?.observer.disconnect();

      const errors: string[] = [];
      const hataDeseni =
        /müşteri bulunamadı|bulunamadı|hata oluştu|başarısız|geçersiz|zorunlu|işlem yapılamadı|teklif oluşturulamadı/i;
      const hataSelectorleri = [
        '[role="alert"]',
        '.alert-danger',
        '.validation-summary-errors',
        '.field-validation-error',
        '.toast-error',
        '.ui-dialog',
        '.bootbox',
        '.sweet-alert',
        '.swal2-popup',
        '.modal'
      ].join(',');

      const gorunur = (element: Element): element is HTMLElement => {
        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          Boolean(htmlElement.offsetWidth || htmlElement.offsetHeight || htmlElement.getClientRects().length)
        );
      };

      const hataTopla = () => {
        const adaylar = new Set<Element>(document.querySelectorAll(hataSelectorleri));
        document.querySelectorAll('body *').forEach((element) => {
          const metin = (element as HTMLElement).innerText?.trim() ?? '';
          if (
            metin.length <= 500 &&
            hataDeseni.test(metin) &&
            !Array.from(element.children).some((child) =>
              hataDeseni.test((child as HTMLElement).innerText?.trim() ?? '')
            )
          ) {
            adaylar.add(element);
          }
        });

        for (const aday of adaylar) {
          const metin = (aday as HTMLElement).innerText?.trim() ?? '';
          if (metin && gorunur(aday) && !errors.includes(metin)) {
            errors.push(metin);
          }
        }
      };

      const observer = new MutationObserver(hataTopla);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      appWindow.__jetFireErrorMonitor = { errors, observer };
      hataTopla();
    });
  }

  private async radioSec(selector: string): Promise<void> {
    const radio = this.page.locator(selector);
    if (!(await radio.isChecked())) {
      // Eski jQuery UI takvimi zaman zaman görünür radio bağlantısının üstünde kalıyor.
      // Gerçek kullanıcı kontrolü bu bağlantı olduğu için tıklamayı doğrudan ona gönderiyoruz.
      await radio.locator('xpath=..').locator('a').click({ force: true });
      if (!(await radio.isChecked())) {
        await radio.evaluate((element) => (element as HTMLInputElement).click());
      }
    }
    await expect(radio).toBeChecked();
  }

  private async telefonGir(
    kodSelector: string,
    numaraSelector: string,
    telefon: string
  ): Promise<void> {
    await this.page.locator(kodSelector).fill(telefon.slice(0, 3));
    await this.page.locator(numaraSelector).fill(telefon.slice(3));
  }

  private async tarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.click();
    await alan.press('ControlOrMeta+A');
    await alan.pressSequentially(tarih, { delay: 50 });
    await alan.press('Tab');
    await this.page.keyboard.press('Escape');
    await expect(alan).toHaveValue(tarih);
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
