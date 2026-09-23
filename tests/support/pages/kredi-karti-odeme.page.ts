import { expect, type Page } from '@playwright/test';
import type { KrediKartiOdemeData } from '../test-data';

export class KrediKartiOdemePage {
  constructor(private readonly page: Page) {}

  async teklifKaydetVeKrediKartiFormunuAc(): Promise<void> {
    const teklifKaydet = this.page
      .getByRole('button', { name: 'Teklif Kaydet', exact: true })
      .or(this.page.locator('#TeklifKaydetButon'));
    await expect(teklifKaydet).toBeVisible();
    await teklifKaydet.click();
    await this.hataPopupVarsaDurdur('Teklif Kaydet tıklanır');

    await this.krediKartiFormunuAc();
  }

  /**
   * Teklifi Kaydet (#Policelestir) tıklanır. Sunucu bir iş kuralı hatası döndürürse
   * (örn. "Hata.Detay.{SCF.1} Kasko teminat fiyatı 0 olamaz !!!") kart formu/seçeneği
   * yerine "Tamam" linkli bir hata pop-up'ı açılıyor; bu durum ayrı bir kontrol olarak
   * eklenmezse test kart formunu/linkini bulamayıp anlamsız bir zaman aşımıyla
   * kırılıyor ve rapordaki ekran görüntüsü de hatanın gerçek anını göstermiyordu. Bu
   * yüzden kart formu/seçeneği ile hata pop-up'ı TEK bir poll içinde birlikte
   * bekleniyor; pop-up görülürse senaryo o anda, mesajla birlikte durduruluyor.
   */
  async policelestirVeKrediKartiFormunuAc(): Promise<void> {
    const policelestir = this.page.locator('#Policelestir');
    await expect(policelestir).toBeVisible();
    await policelestir.click();

    const kartFormu = this.page.locator('#isim');
    const krediKartiSecenegi = this.page.getByRole('link', {
      name: 'KREDİ KARTI İLE POLİÇELEŞTİR',
      exact: true
    });
    await expect
      .poll(
        async () =>
          (await kartFormu.isVisible()) ||
          (await krediKartiSecenegi.isVisible()) ||
          (await this.hataPopupGoruluyorMu()),
        { timeout: 15_000 }
      )
      .toBeTruthy();

    await this.hataPopupVarsaDurdur('Teklifi Kaydet tıklanır (#Policelestir)');

    // JetSağlık kart formunu doğrudan açar; DASK/Fire ara seçim ekranını kullanır.
    if (await kartFormu.isVisible()) {
      return;
    }

    await this.krediKartiFormunuAc();
  }

  private async krediKartiFormunuAc(): Promise<void> {

    const krediKartiIlePolicelestir = this.page.getByRole('link', {
      name: 'KREDİ KARTI İLE POLİÇELEŞTİR',
      exact: true
    });
    await expect(krediKartiIlePolicelestir).toBeVisible();

    // Fancybox açılış animasyonu bitmeden yapılan tıklamayı eski jQuery sürümü
    // zaman zaman yutuyor. Sabit süre yerine pencerenin kararlı hale gelmesini bekle.
    await this.page.waitForFunction(() => {
      const fancybox = document.querySelector<HTMLElement>('#fancybox-wrap');
      if (!fancybox || !(fancybox.offsetWidth || fancybox.offsetHeight)) {
        return false;
      }

      const jquery = (window as typeof window & {
        jQuery?: (element: Element) => { is: (selector: string) => boolean };
      }).jQuery;
      return !jquery || !jquery(fancybox).is(':animated');
    });

    await krediKartiIlePolicelestir.click();
    await this.hataPopupVarsaDurdur('Kredi kartı formu açılır');
    await expect(this.page.locator('#isim')).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Teklifi Kaydet (#Policelestir) tıklanır ve kart formuna hiç geçilmeden, AÇILAN hata
   * pop-up'ının mesajının senaryoda beklenen iş kuralı mesajını İÇERDİĞİ doğrulanır.
   * Pop-up hiç görünmezse ya da mesaj eşleşmezse test başarısız olur (bkz.
   * beklenenHataAdimi === 'policelestirme', prim-hesaplama.spec.ts).
   */
  async policelestirVeBeklenenHatayiDogrula(beklenenMesaj: string): Promise<void> {
    const policelestir = this.page.locator('#Policelestir');
    await expect(policelestir).toBeVisible();
    await policelestir.click();

    await expect
      .poll(() => this.hataPopupGoruluyorMu(), {
        timeout: 15_000,
        message: 'Beklenen iş kuralı hatası pop-up\'ı görünmelidir.'
      })
      .toBeTruthy();

    const mesaj = await this.page
      .locator('#fancybox-wrap, .fancybox-content, .ui-dialog')
      .first()
      .innerText();
    expect(mesaj).toContain(beklenenMesaj);
  }

  async kartBilgileriniGir(data: KrediKartiOdemeData): Promise<void> {
    await this.page.locator('#isim').fill(data.isim);
    await this.page.locator('#soyisim').fill(data.soyisim);
    const kartNo = this.page.locator('#kartno');
    await kartNo.fill('');
    await kartNo.pressSequentially(data.kartNo, { delay: 25 });
    await expect
      .poll(() =>
        kartNo.evaluate((element) =>
          (element as HTMLInputElement).value.replace(/\D/g, '')
        )
      )
      .toBe(data.kartNo);
    await this.page.locator('#cvv').fill(data.guvenlikKodu);
    await this.page.locator('#ay').selectOption(data.sonKullanmaAyi.deger);
    await this.page.locator('#yil').selectOption(data.sonKullanmaYili.deger);

    await expect(this.page.locator('#ay')).toHaveValue(data.sonKullanmaAyi.deger);
    await expect(this.page.locator('#yil')).toHaveValue(data.sonKullanmaYili.deger);

    // Taksit alanı her üründe gösterilmiyor (örn. bazı ekranlarda tek çekim dışında
    // seçenek sunulmuyor ve alan hiç render edilmiyor). Bu yüzden alan varsa doldur,
    // yoksa geç: yoksa doğrudan seçim yapmak "element not found/visible" hatasına düşer.
    const taksit = this.page.locator('#taksit');
    if (await taksit.isVisible()) {
      await taksit.selectOption(data.taksit.deger);
      await expect(taksit).toHaveValue(data.taksit.deger);
    }
  }

  async odemeyiTamamlaVeBeklenenHatayiDogrula(
    beklenenHataMesaji: string | readonly string[],
    odemeEndpoint?: string
  ): Promise<void> {
    const kabulEdilenMesajlar = Array.isArray(beklenenHataMesaji)
      ? beklenenHataMesaji
      : [beklenenHataMesaji];
    const beklentiAciklamasi = kabulEdilenMesajlar.join(' veya ');
    let dialogMesaji = '';
    let servisCevabi = '';
    const dialogHandler = async (dialog: import('@playwright/test').Dialog) => {
      dialogMesaji = dialog.message();
      await dialog.dismiss();
    };
    this.page.on('dialog', dialogHandler);

    try {
      const odemeCevabi = odemeEndpoint
        ? this.page.waitForResponse(
            (response) => new URL(response.url()).pathname.endsWith(odemeEndpoint),
            { timeout: 45_000 }
          )
        : undefined;

      await this.page.getByRole('link', { name: 'Ödemeyi tamamla', exact: true }).click();

      if (odemeCevabi) {
        const response = await odemeCevabi;
        servisCevabi = await response.text();
      }

      await expect
        .poll(
          async () => {
            const sayfaMetni = await this.page.locator('body').innerText();
            const sonuc = [dialogMesaji, servisCevabi, sayfaMetni].join('\n');
            return kabulEdilenMesajlar.some((mesaj) => sonuc.includes(mesaj));
          },
          {
            message: `Kabul edilen ödeme sonuçlarından biri görünmelidir: ${beklentiAciklamasi}`,
            timeout: 45_000
          }
        )
        .toBeTruthy();
    } finally {
      this.page.off('dialog', dialogHandler);
    }
  }

  /**
   * Ekranın genel hata pop-up'ı ("Tamam" linkli uyarı kutusu, örn. "Hata.Detay.{SCF.1}
   * Kasko teminat fiyatı 0 olamaz !!!") görünür mü diye bakar. Teklifi Kaydet/Teklif
   * Kaydet sonrası normal akışta bu pop-up hiç açılmaz; açılması her zaman beklenmeyen
   * bir hatadır.
   */
  private async hataPopupGoruluyorMu(): Promise<boolean> {
    return this.page
      .getByRole('link', { name: 'Tamam', exact: true })
      .isVisible()
      .catch(() => false);
  }

  /**
   * Ekranda bu hata pop-up'ı görülürse, senaryoyu bir sonraki adıma geçmeye
   * ÇALIŞMADAN, o anda ve mesajın içeriğiyle birlikte durdurur. Böylece Playwright'ın
   * otomatik aldığı hata ekran görüntüsü tam olarak pop-up'ın göründüğü ana ait olur
   * ve rapor incelendiğinde senaryonun hangi adımda hangi hatada kaldığı doğrudan
   * görülür — hata sessizce atlanıp test birkaç adım sonra alakasız bir zaman
   * aşımıyla kırılmaz.
   */
  private async hataPopupVarsaDurdur(adimAciklamasi: string): Promise<void> {
    if (!(await this.hataPopupGoruluyorMu())) return;

    const mesaj = await this.page
      .locator('#fancybox-wrap, .fancybox-content, .ui-dialog')
      .first()
      .innerText()
      .catch(() => '(hata mesajı metni okunamadı, ekran görüntüsüne bakınız)');

    throw new Error(
      `"${adimAciklamasi}" adımından sonra beklenmeyen bir hata pop-up'ı görüntülendi, ` +
        `senaryo burada durduruldu:\n${mesaj}`
    );
  }
}
