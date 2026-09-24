import { expect, type Page } from '@playwright/test';
import type {
  JetKaskoYkAracData,
  OzelKimlikData,
  Proposal2026Package1Data,
  TuzelKimlikData
} from '../test-data';

/**
 * KaskoTur ürün seçeneklerine kısa numara ile atıfta bulunmak için sabit eşleme.
 * jet-kasko-yk.json > senaryolar altında "urunAdi" alanına bu numaralardan biri
 * ("1", "2", ... metin olarak) veya doğrudan tam ürün adı yazılabilir — urunSecYk
 * her ikisini de kabul eder. Numaralar DOM'daki sıraya veya radyonun "value"
 * özelliğine değil, YALNIZCA bu sabit listeye bağlıdır; bu yüzden değer/sıra
 * senaryodan senaryoya değişse bile numaralar hep aynı ürünü işaret eder.
 */
export const JETKASKO_URUN_KODLARI: Record<string, string> = {
  '1': 'GENİŞLETİLMİŞ KASKO(İKAME+YOL YARD.)',
  '2': 'MAVİ KASKO(Dar)',
  '3': 'GÜLÜMSETEN KASKO(YOL YARD.)',
  '4': 'GENİŞLETİLMİŞ KASKO(YOL YARD.)',
  '5': 'GÜLÜMSETEN KASKO(İKAME+YOL YARD.)'
};

export class JetKaskoPage {
  constructor(private readonly page: Page) {}

  async ac(): Promise<void> {
    await this.page.goto('/jet-satis/jet-kasko/');
    await expect(this.page.locator('#IdentityNo')).toBeVisible();
  }

  async sigortaliBilgileriniGir(data: OzelKimlikData): Promise<void> {
    await this.page.locator('#InsuredType-O').check();
    await this.page.locator('#IdentityNo').fill(data.tcKimlikNo);

    await this.maskliTarihGir('#BirthDate', data.dogumTarihi);
  }

  async telefonVePlakaGir(
    data: Proposal2026Package1Data,
    cepTelefonu: string
  ): Promise<void> {
    await this.maskliTelefonGir('#PhoneNumber', cepTelefonu);

    await this.page.locator('#PlateCity').fill(data.plakaIlKodu);
    await this.page.locator('#PlateCity').press('Tab');
    await this.page.locator('#PlateNo').fill(data.plakaNo);
  }

  async aracSorgulaVeTescilGir(data: Proposal2026Package1Data): Promise<void> {
    await this.page.locator('#QueryVehicle').click();
    await this.page.locator('#VehicleRegisterNo').fill(data.tescilBelgeSeriNo);

    const [vehicleResponse] = await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/jet-satis/jet-kasko/ajx-vehicle') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      ),
      this.page.locator('#QueryVehicleRegister').click()
    ]);

    expect(vehicleResponse.ok()).toBeTruthy();

    await expect(
      this.page.locator(`#VehicleBrand option[value="${data.aracMarkasi.deger}"]`)
    ).toHaveCount(1, { timeout: 10_000 });
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, {
      timeout: 20_000
    });
  }

  async aracVeTarifeBilgileriniSec(data: Proposal2026Package1Data): Promise<void> {
    await this.page.locator('#VehicleBrand').selectOption(data.aracMarkasi.deger);
    await this.page.locator('#VehicleModel').selectOption(data.aracModeli.deger);
    await this.page.locator('#TariffClass').selectOption(data.sinif.deger);
    await this.page.locator('#UsageType').selectOption(data.kullanim.deger);
  }

  async primHesaplaVeMesajiDogrula(expectedMessage: string): Promise<void> {
    await this.page.locator('#Hesapla').click();
    await expect(this.page.getByText(expectedMessage, { exact: true })).toBeVisible({
      timeout: 30_000
    });
  }

  async uyariyiKapat(): Promise<void> {
    await this.page.getByRole('link', { name: 'Tamam' }).click();
  }

  // ---------------------------------------------------------------------
  // YK (Yeni Kayıt) akışı
  //
  // Plaka alanına "YK" yazılınca (isPlateYK()) ekran tescilsiz/yeni araç moduna
  // geçiyor: Tescil Belge Seri No sorgusu gizleniyor, araç bilgileri marka kodu
  // sorgusuyla elle giriliyor. Sigortalı Tipi (Özel/Tüzel) ve Sigorta Ettiren
  // (Kendisi/Farklı Kişi Özel/Farklı Kişi Tüzel) aynı alan id'lerini kullanıyor;
  // Sigortalı Tipi Tüzel seçilince Doğum Tarihi alanı gizleniyor.
  // ---------------------------------------------------------------------

  /** Sigortalı Tipi (Özel/Tüzel) seçilir ve kimlik + (Özel ise) doğum tarihi girilir. */
  async sigortaliTipiVeKimlikGirYk(
    sigortaliTipi: 'ozel' | 'tuzel',
    kimlikNo: string,
    dogumTarihi?: string
  ): Promise<void> {
    if (sigortaliTipi === 'ozel') {
      await this.page.locator('#InsuredType-O').check();
      await this.page.locator('#IdentityNo').fill(kimlikNo);

      await this.maskliTarihGir('#BirthDate', dogumTarihi ?? '');
    } else {
      await this.page.locator('#InsuredType-T').check();
      // Tüzel seçilince Doğum Tarihi alanı gizlenir; sadece Vergi Kimlik No girilir.
      await this.page.locator('#IdentityNo').fill(kimlikNo);
    }
  }

  /** Cep telefonu ve plaka (İl Kodu + "YK") girilir; "YK" plaka yeni araç modunu açar. */
  async telefonVePlakaGirYk(
    ilKodu: string,
    plakaNo: string,
    cepTelefonu: string
  ): Promise<void> {
    await this.maskliTelefonGir('#PhoneNumber', cepTelefonu);

    await this.page.locator('#PlateCity').fill(ilKodu);
    await this.page.locator('#PlateCity').press('Tab');
    await this.page.locator('#PlateNo').fill(plakaNo);
    await this.page.locator('#PlateNo').press('Tab');
  }

  /** Yeşil Sorgula (#QueryVehicle) tıklanır; sigortalı adı ve Araç Bilgileri açılır. */
  async sigortaliSorgulaYk(): Promise<void> {
    await this.page.locator('#QueryVehicle').click();
    await this.hataPopupVarsaDurdur('Sigortalı sorgulanır (#QueryVehicle)');
    await expect(this.page.locator('#ModelYear')).toBeVisible({ timeout: 20_000 });
    await expect(this.page.locator('.blockUI.blockOverlay')).toHaveCount(0, {
      timeout: 20_000
    });
  }

  /** "Sigorta Ettiren: Sigortalı" (kendisi) seçilir. */
  async ettirenAyniSecYk(): Promise<void> {
    await this.page.locator('#DifferentClient-H').check({ force: true });
    await expect(this.page.locator('#DifferentClient-H')).toBeChecked();
  }

  /** Farklı kişi (özel/T.C.) sigorta ettiren bilgileri girilir ve sorgulanır. */
  async farkliOzelEttirenGirYk(kimlik: OzelKimlikData): Promise<void> {
    await this.page.locator('#DifferentClient-E').check({ force: true });
    await this.page.locator('#ClientType-O').check({ force: true });

    await this.maskliTarihGir('#ClientBirthDate', kimlik.dogumTarihi);

    await this.ettirenMusteriSorgulaYk(kimlik.tcKimlikNo, kimlik.cepTelefonu);
  }

  /** Farklı kurum (tüzel/VKN) sigorta ettiren bilgileri girilir ve sorgulanır. */
  async farkliTuzelEttirenGirYk(kimlik: TuzelKimlikData): Promise<void> {
    await this.page.locator('#DifferentClient-E').check({ force: true });
    await this.page.locator('#ClientType-T').check({ force: true });
    await this.ettirenMusteriSorgulaYk(kimlik.vergiKimlikNo, kimlik.cepTelefonu);
  }

  private async ettirenMusteriSorgulaYk(kimlikNo: string, cepTelefonu: string): Promise<void> {
    await this.maskliTelefonGir('#ClientPhoneNumber', cepTelefonu);

    await this.page.locator('#ClientIdentityNo').fill(kimlikNo);
    await this.page.locator('#RefreshClientIdentity').click();
    await this.hataPopupVarsaDurdur('Sigorta ettiren sorgulanır (#RefreshClientIdentity)');
    await expect(this.page.locator('#client-identity-name')).not.toHaveText(/^\s*$/, {
      timeout: 20_000
    });
  }

  /**
   * Yeni (tescilsiz) araç bilgileri girilir: Model Yılı → blur, Marka Kodu sorgusu
   * (Marka/Model otomatik seçilir), Motor No, Şasi No, Tescil Tarihi, Araç Tipi ve
   * buna göre değişen Sınıf/Kullanım.
   */
  async yeniAracBilgileriniGirYk(data: JetKaskoYkAracData): Promise<void> {
    const modelYear = this.page.locator('#ModelYear');
    await modelYear.fill(data.modelYili);
    // Marka listesi AJAX'ının tetiklenmesi için alanın gerçekten blur olması gerekiyor.
    await modelYear.press('Tab');

    await this.page.locator('#VehicleModelCode').fill(data.markaKodu);
    await this.page.locator('#QueryVehicleModelCode').click();
    await this.hataPopupVarsaDurdur('Marka kodu sorgulanır (#QueryVehicleModelCode)');
    await expect
      .poll(() => this.page.locator('#VehicleModel').inputValue(), {
        timeout: 20_000,
        message: 'Marka kodu sorgusu sonrası Model alanı otomatik seçilmelidir.'
      })
      .toBe(data.markaKodu);

    await this.page.locator('#EngineNo').fill(data.motorNo);
    await this.page.locator('#ChassisNo').fill(data.sasiNo);

    await this.maskliTarihGir('#RegistrationDate', bugununTarihi());

    await this.page.locator('#VehicleType').selectOption(data.aracTipi.deger);
    await expect(
      this.page.locator(`#TariffClass option[value="${data.sinif.deger}"]`)
    ).toHaveCount(1, { timeout: 10_000 });

    await this.page.locator('#TariffClass').selectOption(data.sinif.deger);
    await this.page.locator('#UsageType').selectOption(data.kullanim.deger);
  }

  /**
   * "Yetkili İndirimi %" alanı bazı acentelerde kapalı (disabled) geliyor; bu durumda
   * zorunlu değildir ve atlanır. Açıksa ve bir değer verildiyse doldurulur.
   */
  async yetkiliIndirimGirYk(yuzde?: string): Promise<void> {
    if (!yuzde) return;

    const alan = this.page.locator('#AuthorizedDiscount');
    if (await alan.isEnabled()) {
      await alan.fill(yuzde);
    }
  }

  /**
   * Prim hesaplanır. Ürün seçenekleri (KaskoTur radio grubu) tek seferde değil,
   * teklifler tek tek/kademeli geldiği için zamana yayılı olarak DOM'a ekleniyor;
   * bu yüzden ilk radyo görünür olur olmaz devam etmek sadece 1 paketi görüp
   * ilerlemeye (eksik/yanlış ürün seçimine) yol açıyor. Önce en az bir seçeneğin
   * göründüğü ve hesaplama overlay'inin kalktığı doğrulanır, ardından TÜM
   * tekliflerin yüklenmesi için sabit 15 saniye beklenir.
   *
   * Hesapla bir iş kuralı hatası da döndürebilir (ürün radyoları hiç gelmez, bunun
   * yerine bir hata pop-up'ı açılır); bu durumda poll'un zaman aşımına düşüp
   * anlamsız bir "ürün görünmedi" hatası vermesini beklemek yerine, pop-up her
   * kontrolde de aranır ve görülürse senaryo o anda, mesajla birlikte durdurulur.
   */
  async primHesaplaYk(): Promise<void> {
    await this.page.locator('#Hesapla').click();
    await expect
      .poll(
        async () => {
          if (await this.hataPopupGoruluyorMu()) return true;
          const overlaySayisi = await this.page.locator('.blockUI.blockOverlay').count();
          const urunSayisi = await this.page.locator('input[name="KaskoTur"]:visible').count();
          return overlaySayisi === 0 && urunSayisi > 0;
        },
        {
          timeout: 30_000,
          message:
            'Prim hesaplama sonrası en az bir ürün seçeneği, blockUI overlay kalkmış halde görünür olmalıdır.'
        }
      )
      .toBeTruthy();

    await this.hataPopupVarsaDurdur('Prim hesaplanır (#Hesapla)');

    // Teklifler kademeli geldiği için ilk seçeneğin görünmesi tüm ürünlerin
    // yüklendiği anlamına gelmiyor; kalan tekliflerin de gelmesi için bekle.
    await this.page.waitForTimeout(15_000);

    // 15 saniyelik bekleme sırasında da bir iş kuralı hatası açılmış olabilir.
    await this.hataPopupVarsaDurdur('Prim hesaplanır (#Hesapla) - teklifler yüklenirken');
  }

  /**
   * Prim hesaplama sonrası görünen ürün seçeneklerinden (KaskoTur radio grubu) biri
   * seçilir. urun verilmezse varsayılan olarak "GENİŞLETİLMİŞ KASKO(YOL YARD.)"
   * seçilir. urun; JETKASKO_URUN_KODLARI'ndaki kısa bir kod ("1", "2", "3", "4",
   * "5") ya da ürünün tam adı olabilir — jet-kasko-yk.json > senaryolar altında
   * "urunAdi" alanına ikisinden biri yazılabilir.
   *
   * Ürün radyolarının "value" özelliği senaryoya/tarifeye göre değişebiliyor (aynı
   * ürün bir senaryoda value="4" iken başka bir senaryoda farklı bir value ile
   * render edilebiliyor); bu yüzden value yerine ürünün görünen adı (accessible
   * name) üzerinden seçim yapılıyor — bu her zaman sabit ve güvenilir.
   *
   * nippon.kasko.js içinde ürün radyolarına bağlı ayrı bir değişiklik (change)
   * dinleyicisi yok — tüm ürünlerin fiyatları zaten Hesapla sonrası Otherprim()
   * tarafından arka planda hesaplanıp dolduruluyor (primHesaplaYk'daki 15 saniyelik
   * bekleme bunun içindir). Radyo seçimi yalnızca DOM'da hangi seçeneğin işaretli
   * olduğunu değiştirir; Teklifi Kaydet (#Policelestir) tıklandığında sunucuya
   * gönderilecek ürün, o an $("input[name='KaskoTur']:checked").val() okunarak
   * belirleniyor. Bu yüzden burada ekstra overlay/"enabled" bekleme YAPILMIYOR —
   * böyle bir bekleme, hiç tetiklenmeyen bir yüklemeyi beklediği için işlemi
   * gereksiz yere kilitleyip hataya düşürüyordu.
   */
  async urunSecYk(urun: string = 'GENİŞLETİLMİŞ KASKO(YOL YARD.)'): Promise<void> {
    const urunAdi = JETKASKO_URUN_KODLARI[urun] ?? urun;
    const secenek = this.page.getByRole('radio', { name: urunAdi, exact: true });
    await secenek.scrollIntoViewIfNeeded();
    await secenek.click({ force: true });
    await expect(secenek).toBeChecked();
  }

  /**
   * Eski jQuery maskedinput eklentisiyle çalışan tarih alanlarına (BirthDate,
   * ClientBirthDate, RegistrationDate) güvenle değer girer.
   *
   * Bu alanlarda ara sıra ("her zaman değil ama bazen") karakterlerin kayıp/karışık
   * girildiği gözlemlendi (örn. "13.04.1998" yerine "30.41.9981") — maske eklentisi
   * her tuş vuruşunda imleci yeniden konumlandırıyor ve Control+A ile seçili metin
   * bazen tam temizlenmeden yeni karakterler eski değerin arasına karışabiliyor.
   * Kalıcı çözüm: Control+A'ya ek olarak Backspace ile alanı kesin şekilde
   * boşaltmak, ve yazdıktan sonra değeri doğrulayıp uyuşmuyorsa (2 deneme daha,
   * toplam 3 deneme) baştan temizleyip yeniden yazmak — tek seferlik bir yarış
   * durumunda test kırılmak yerine kendi kendine düzeliyor.
   */
  private async maskliTarihGir(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    const maksimumDeneme = 3;

    for (let deneme = 1; deneme <= maksimumDeneme; deneme++) {
      await alan.click();
      await alan.press('ControlOrMeta+A');
      await alan.press('Backspace');
      await alan.pressSequentially(tarih, { delay: 120 });
      await alan.press('Tab');

      if ((await alan.inputValue()) === tarih) return;
    }

    // Son deneme de başarısızsa açıklayıcı bir assertion hatasıyla test kırılsın.
    await expect(alan).toHaveValue(tarih);
  }

  /**
   * Eski jQuery maskedinput eklentisiyle çalışan telefon alanlarına (PhoneNumber,
   * ClientPhoneNumber) güvenle değer girer. maskliTarihGir ile aynı gerekçeyle
   * (ara sıra yaşanan karakter kayması) Control+A+Backspace ile temizleyip yazar,
   * doğrulayıp gerekirse tekrar dener.
   */
  private async maskliTelefonGir(selector: string, cepTelefonu: string): Promise<void> {
    const alan = this.page.locator(selector);
    const maksimumDeneme = 3;

    for (let deneme = 1; deneme <= maksimumDeneme; deneme++) {
      await alan.click();
      // Eski maske imleci focus sonrasında gecikmeli yerleştiriyor.
      await this.page.waitForTimeout(300);
      await alan.press('ControlOrMeta+A');
      await alan.press('Backspace');
      await alan.pressSequentially(cepTelefonu, { delay: 150 });
      await alan.press('Tab');

      const guncelDeger = await alan.inputValue().then((deger) => deger.replace(/\D/g, ''));
      if (guncelDeger === cepTelefonu) return;
    }

    await expect
      .poll(() => alan.inputValue().then((deger) => deger.replace(/\D/g, '')))
      .toBe(cepTelefonu);
  }

  /**
   * Ekranın MessageBox()/showDialog() ile açtığı genel hata pop-up'ı ("Tamam"
   * linkli uyarı kutusu) görünür mü diye bakar. YK akışının normal (hatasız) hiçbir
   * adımında bu pop-up açılmaz — uyariyiKapat() yalnızca eski (non-YK) senaryolarda,
   * BEKLENEN bir iş kuralı mesajını kapatmak için kullanılıyor. Bu yüzden YK akışı
   * sırasında bu pop-up görülürse, her zaman BEKLENMEYEN bir hatadır.
   */
  private async hataPopupGoruluyorMu(): Promise<boolean> {
    return this.page
      .getByRole('link', { name: 'Tamam', exact: true })
      .isVisible()
      .catch(() => false);
  }

  /**
   * Ekranda MessageBox()/showDialog() ile bir hata pop-up'ı görülürse, senaryoyu
   * bir sonraki adıma geçmeye ÇALIŞMADAN, o anda ve mesajın içeriğiyle birlikte
   * durdurur. Böylece Playwright'ın adım/test başarısızlığında otomatik aldığı
   * ekran görüntüsü tam olarak hatanın göründüğü ana ait olur; rapor incelendiğinde
   * senaryonun hangi adımda hangi hatada kaldığı doğrudan görülür — hata sessizce
   * atlanıp test birkaç adım sonra alakasız bir zaman aşımıyla kırılmaz.
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

/** Bugünün tarihini gg.aa.yyyy formatında döndürür (Tescil Tarihi için kullanılır). */
function bugununTarihi(): string {
  const tarih = new Date();
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(tarih);
}
