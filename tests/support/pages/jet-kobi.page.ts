import { expect, type Page } from '@playwright/test';
import { bugununTarihi } from '../dates';
import type { JetKobiTestData, OzelKimlikData, TuzelKimlikData } from '../test-data';

export type KobiKimlikTipi = 'ozel' | 'tuzel';
export type KobiKimlik = OzelKimlikData | TuzelKimlikData;
export type KobiSigortaliDurumu = 'malSahibi' | 'kiraci';

type KobiData = JetKobiTestData['jetKobi'];

export class JetKobiPage {
  constructor(private readonly page: Page) {}

  async ac(): Promise<void> {
    await this.page.goto('/jet-satis/jet-kobi/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('#IdentityNumber')).toBeVisible();
  }

  async sigortaliBilgileriniGir(tip: KobiKimlikTipi, kimlik: KobiKimlik): Promise<void> {
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

  async farkliSigortaEttirenGir(tip: KobiKimlikTipi, kimlik: KobiKimlik): Promise<void> {
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
    data: KobiData,
    sigortaliDurumu: KobiSigortaliDurumu
  ): Promise<void> {
    await this.page.locator('#AK').fill(data.adresKodu);
    await this.page.locator('#RefreshUAVT').click();
    await expect(this.page.locator('#DR')).not.toHaveValue('-1', { timeout: 20_000 });
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, { timeout: 20_000 });

    await this.readonlyTarihAyarla('#BeginDate', bugununTarihi());
    await this.radioSec(sigortaliDurumu === 'malSahibi' ? '#IsOwner-E' : '#IsOwner-H');
    if (sigortaliDurumu === 'malSahibi') {
      await this.gizliSelectSec('#BuildingType', data.binaTipi.deger);
      await this.page.locator('#GrossAreaM2').fill(data.brutYuzolcum);
      await this.radioSec(
        data.daskaBagli === 'evet' ? '#IsDASKDepended-E' : '#IsDASKDepended-H'
      );
    }
    await this.radioSec(
      data.dainiMurtehin === 'var' ? '#IsHaveLossPayee-E' : '#IsHaveLossPayee-H'
    );
    const isciSayisi = this.page.locator('#numberOfWorkers');
    await isciSayisi.click();
    await isciSayisi.press('Control+A');
    await isciSayisi.pressSequentially(data.isciSayisi);
    await isciSayisi.press('Tab');
    await expect
      .poll(() => this.page.locator('#YearLaborWage').inputValue(), {
        message: 'İşçi sayısından sonra yıllık brüt işçilik ücreti otomatik dolmalıdır.'
      })
      .not.toBe('');
    await this.gizliSelectSec('#EmployerLiability', data.isverenMaliMesuliyeti.deger);
    await this.gizliSelectSec(
      '#ThirdPartyFinancialLiability',
      data.ucuncuSahisMaliMesuliyeti.deger
    );
    await this.gizliSelectSec('#ConstructionType', data.yapiTarzi.deger);
    await this.gizliSelectSec('#IstigalTipi', data.istigalTipi.deger);
    await expect
      .poll(
        () => this.page.locator(`#IstigalCinsi option[value="${data.istigalCinsi.deger}"]`).count(),
        { timeout: 15_000, message: 'Seçilen iştigal tipinin cinsleri yüklenmelidir.' }
      )
      .toBeGreaterThan(0);
    await this.gizliSelectSec('#IstigalCinsi', data.istigalCinsi.deger);
    await this.gizliSelectSec('#TotalFloor', data.toplamKat.deger);
    await this.gizliSelectSec('#RiskFloor', data.rizikonunBulunduguKat.deger);
    await this.gizliSelectSec('#RoofType', data.catiTipi.deger);
    await this.page.locator('#BuildYear').fill(data.binaInsaYili);
    await this.gizliSelectSec('#PersonalAccident', data.ferdiKazaTeminati.deger);

    await expect(this.page.locator('#numberOfWorkers')).toHaveValue(data.isciSayisi);
    await expect(this.page.locator('#IstigalCinsi')).toHaveValue(data.istigalCinsi.deger);
  }

  async ilkTeklifAdiminaGec(): Promise<void> {
    await this.page.locator('#btnStandart').click();
    await expect(this.page.locator('#TeklifHesaplaButon')).toBeVisible({ timeout: 30_000 });
  }

  async teminatEkraniniAc(): Promise<void> {
    await this.ilkTeklifAdiminaGec();
    await this.page.locator('#TeklifHesaplaButon').click();
    await expect(this.page).toHaveURL(/\/jet-satis\/jet-kobi\/teminatlar/, { timeout: 30_000 });
    await expect(this.page.locator('#C1225')).toBeVisible();
  }

  async teminatlariGir(data: KobiData, sigortaliDurumu: KobiSigortaliDurumu): Promise<void> {
    await this.page.locator('#C1000').fill(data.teminatlar.binaYangin);
    await this.page.locator('#C1225').fill(data.teminatlar.sigortaliyaAitEmtea);
    await this.page.locator('#C1230').fill(data.teminatlar.ucuncuSahsaAitEmtea);
    await this.page.locator('#C1116').fill(data.teminatlar.demirbas);
    await this.page.locator('#C1117').fill(data.teminatlar.makine);
    await this.page.locator('#C1118').fill(data.teminatlar.kasa);
    await this.page.locator('#C1089').fill(data.teminatlar.dahiliDekorasyon);
    await this.page.locator('#C3180').fill(data.teminatlar.urunSorumluluk);
    await this.page.locator('#C1119').fill(data.teminatlar.isDurmasi);
    await this.page.locator('#C1147').fill(data.teminatlar.dekorasyonHirsizlik);
    await this.page.locator('#C1036').fill(data.teminatlar.camKirilmasi);
    await this.page.locator('#FireAndTheftPrecautionsinRisk')
      .fill(data.teminatlar.yanginVeGuvenlikOnlemleri);

    await this.sayisalDegeriDogrula('#C1225', data.teminatlar.sigortaliyaAitEmtea);
    await this.sayisalDegeriDogrula('#C1036', data.teminatlar.camKirilmasi);
  }

  async teklifAl(): Promise<void> {
    await this.page.locator('#TeklifHesaplaButon').click();
    const teklifKaydet = this.page.locator('#TeklifKaydetButon');
    const hataBasligi = this.page.getByText('JetKobi Hızlı Teklif Ekranı', { exact: true });
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
        { timeout: 45_000, message: 'JetKobi teklif sonucu veya hata penceresi görünmelidir.' }
      )
      .not.toBe('bekleniyor');

    if (hataMesaji) throw new Error(`Teklif alınamadı: ${hataMesaji}`);
    await expect(teklifKaydet).toBeVisible();
  }

  private async kimlikSorguSonucunuDogrula(selector: string, baslik: string): Promise<void> {
    const sonuc = await this.page
      .waitForFunction(
        ({ selector, baslik }) => {
          const monitor = (window as typeof window & {
            __jetKobiErrorMonitor?: { errors: string[] };
          }).__jetKobiErrorMonitor;
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

    if (sonuc.durum === 'hata') throw new Error(`${baslik} sorgusu başarısız: ${sonuc.mesaj}`);
  }

  private async hataTakibiniBaslat(): Promise<void> {
    await this.page.evaluate(() => {
      type ErrorMonitor = { errors: string[]; observer: MutationObserver };
      const appWindow = window as typeof window & { __jetKobiErrorMonitor?: ErrorMonitor };
      appWindow.__jetKobiErrorMonitor?.observer.disconnect();
      const errors: string[] = [];
      const hataDeseni = /müşteri bulunamadı|bulunamadı|hata oluştu|başarısız|geçersiz|zorunlu|işlem yapılamadı/i;
      const gorunur = (element: Element) => {
        const html = element as HTMLElement;
        const style = getComputedStyle(html);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
          Boolean(html.offsetWidth || html.offsetHeight || html.getClientRects().length);
      };
      const hataTopla = () => {
        document.querySelectorAll('[role="alert"],.alert-danger,.ui-dialog,.modal,#fancybox-wrap')
          .forEach((element) => {
            const metin = (element as HTMLElement).innerText?.trim() ?? '';
            if (metin && hataDeseni.test(metin) && gorunur(element) && !errors.includes(metin)) {
              errors.push(metin);
            }
          });
      };
      const observer = new MutationObserver(hataTopla);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      appWindow.__jetKobiErrorMonitor = { errors, observer };
      hataTopla();
    });
  }

  private async radioSec(selector: string): Promise<void> {
    const radio = this.page.locator(selector);
    if (!(await radio.isChecked())) {
      await radio.locator('xpath=..').locator('a').click({ force: true });
      if (!(await radio.isChecked())) await radio.evaluate((element) => (element as HTMLInputElement).click());
    }
    await expect(radio).toBeChecked();
  }

  private async telefonGir(kodSelector: string, numaraSelector: string, telefon: string): Promise<void> {
    await this.page.locator(kodSelector).fill(telefon.slice(0, 3));
    await this.page.locator(numaraSelector).fill(telefon.slice(3));
    await expect(this.page.locator(kodSelector)).toHaveValue(telefon.slice(0, 3));
    await expect(this.page.locator(numaraSelector)).toHaveValue(telefon.slice(3));
  }

  private async tarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, tarih);
    await this.takvimiKapat();
    await expect(alan).toHaveValue(tarih);
  }

  private async takvimiKapat(): Promise<void> {
    const takvim = this.page.locator('#ui-datepicker-div');
    if (await takvim.isVisible()) {
      await takvim.evaluate((element) => {
        (element as HTMLElement).style.display = 'none';
      });
    }
    await expect(takvim).toBeHidden();
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

    const jqTransformOption = select.locator('xpath=..').locator(`ul li a[index="${optionIndex}"]`);
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

  private async sayisalDegeriDogrula(selector: string, beklenen: string): Promise<void> {
    await expect
      .poll(() =>
        this.page.locator(selector).evaluate((element) =>
          (element as HTMLInputElement).value.replace(/\D/g, '')
        )
      )
      .toBe(beklenen.replace(/\D/g, ''));
  }
}
