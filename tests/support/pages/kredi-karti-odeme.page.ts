import { expect, type Page } from '@playwright/test';
import {
  beklenenGorulenMetni,
  beklenenMesajiBekle,
  UYARI_CIKMADI_METNI
} from '../beklenen-sonuc';
import type { SenaryoKrediKartiData } from '../test-data';

// Ödeme sonrası sonucun (poliçe onayı / "onaylanamadı" mesajı) en fazla ne kadar bekleneceği.
// Çoklu sorguda sigortalı sayısı arttıkça onay süresi uzuyor (10 kişilik çoklu sorguda 45 sn
// yetmedi, 6. kişide süre doldu); bu yüzden 90 sn.
const ODEME_SONUCU_BEKLEME_MS = 90_000;

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
   * pop-up'ının mesajının senaryoda beklenen iş kuralı mesajını İÇERDİĞİ (toleranslı —
   * bkz. beklenen-sonuc.ts > mesajIceriyorMu) doğrulanır. Pop-up yerine kart formu/
   * seçeneği açılırsa (akış devam ettiyse) ya da mesaj eşleşmezse test, beklenen ve
   * görülen metinle birlikte başarısız olur (bkz. prim-hesaplama.spec.ts).
   */
  async policelestirVeBeklenenHatayiDogrula(beklenenMesaj: string): Promise<void> {
    const policelestir = this.page.locator('#Policelestir');
    await expect(policelestir).toBeVisible();
    await policelestir.click();

    // Pop-up ile "akış devam etti" işaretleri (kart formu / kredi kartı seçeneği) aynı
    // poll'da beklenir — pop-up hiç çıkmazsa 15 sn boşuna beklenmez ve hata metni
    // akışın devam ettiğini söyleyebilir.
    const kartFormu = this.page.locator('#isim');
    const krediKartiSecenegi = this.page.getByRole('link', {
      name: 'KREDİ KARTI İLE POLİÇELEŞTİR',
      exact: true
    });
    await expect
      .poll(
        async () =>
          (await this.hataPopupGoruluyorMu()) ||
          (await kartFormu.isVisible()) ||
          (await krediKartiSecenegi.isVisible()),
        { timeout: 15_000 }
      )
      .toBeTruthy()
      .catch(() => undefined);

    if (!(await this.hataPopupGoruluyorMu())) {
      const akisDurumu = (await kartFormu.isVisible()) || (await krediKartiSecenegi.isVisible())
        ? ' (ödeme seçeneği/kart formu açıldı)'
        : '';
      throw new Error(
        beklenenGorulenMetni('Poliçeleştirme', beklenenMesaj, `${UYARI_CIKMADI_METNI}${akisDurumu}`)
      );
    }

    const { eslesen, sonGorulen } = await beklenenMesajiBekle(
      () => this.hataPopupMetniniOku(),
      [beklenenMesaj],
      { zamanAsimiMs: 5_000 }
    );
    if (!eslesen) {
      throw new Error(beklenenGorulenMetni('Poliçeleştirme', beklenenMesaj, sonGorulen));
    }
  }

  // Ortak kart (KrediKartiOdemeData) da senaryoya özel kart (SenaryoKrediKartiData) da
  // kabul edilir — beklenenHataMesaji burada kullanılmaz.
  async kartBilgileriniGir(data: SenaryoKrediKartiData): Promise<void> {
    await this.page.locator('#isim').fill(data.isim);
    await this.page.locator('#soyisim').fill(data.soyisim);
    const kartNo = this.page.locator('#kartno');
    await kartNo.fill('');
    await kartNo.pressSequentially(data.kartNo, { delay: 25 });
    // Karşılaştırma boolean üzerinden yapılır: .toBe(data.kartNo) başarısız olursa
    // Playwright hata mesajına TAM kart numarasını yazıyor ve bu metin rapora/test sunucusu
    // loguna düşüyordu. Mesajda yalnızca son 4 hane gösterilir.
    await expect
      .poll(
        async () =>
          (await kartNo.evaluate((element) =>
            (element as HTMLInputElement).value.replace(/\D/g, '')
          )) === data.kartNo,
        { message: `Kart numarası alana eksiksiz yazılamadı (kart: **** ${data.kartNo.slice(-4)})` }
      )
      .toBe(true);
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
            { timeout: ODEME_SONUCU_BEKLEME_MS }
          )
        : undefined;

      await this.page.getByRole('link', { name: 'Ödemeyi tamamla', exact: true }).click();

      if (odemeCevabi) {
        const response = await odemeCevabi;
        servisCevabi = await response.text();
      }

      // Dialog (alert), servis cevabı ve sayfa metni birlikte, toleranslı eşleşmeyle
      // (bkz. beklenen-sonuc.ts > mesajIceriyorMu) aranır. Görülen son hata pop-up'ı da
      // saklanır ki beklenen mesaj hiç görünmezse hata metni "Görülen"i söyleyebilsin.
      let sonPopupMetni = '';
      const { eslesen } = await beklenenMesajiBekle(
        async () => {
          const popupMetni = await this.hataPopupMetniniOku();
          if (popupMetni) sonPopupMetni = popupMetni;
          const sayfaMetni = await this.page.locator('body').innerText().catch(() => '');
          return [dialogMesaji, servisCevabi, sayfaMetni].join('\n');
        },
        kabulEdilenMesajlar,
        { zamanAsimiMs: ODEME_SONUCU_BEKLEME_MS }
      );

      if (!eslesen) {
        const servisOzeti = servisCevabi.replace(/\s+/g, ' ').trim().slice(0, 300);
        const gorulen =
          dialogMesaji ||
          sonPopupMetni ||
          (servisOzeti ? `servis cevabı: ${servisOzeti}` : UYARI_CIKMADI_METNI);
        throw new Error(beklenenGorulenMetni('Ödeme', kabulEdilenMesajlar, gorulen));
      }
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
   * Hata pop-up'ı görünüyorsa metnini döner (sondaki "Tamam" bağlantı metni ayıklanır);
   * görünmüyorsa ya da okunamıyorsa boş metin döner.
   */
  private async hataPopupMetniniOku(): Promise<string> {
    if (!(await this.hataPopupGoruluyorMu())) return '';
    const metin = await this.page
      .locator('#fancybox-wrap, .fancybox-content, .ui-dialog')
      .first()
      .innerText()
      .catch(() => '');
    return metin.replace(/\s*\bTamam\s*$/u, '').trim();
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

    const mesaj =
      (await this.hataPopupMetniniOku()) || '(hata mesajı metni okunamadı, ekran görüntüsüne bakınız)';

    throw new Error(
      `"${adimAciklamasi}" adımından sonra beklenmeyen bir hata pop-up'ı görüntülendi, ` +
        `senaryo burada durduruldu:\n${mesaj}`
    );
  }
}
