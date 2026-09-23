import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { JetSeyahatTestData, OzelKimlikData, TuzelKimlikData } from '../test-data';

// JetSeyahat (seyahat sigortası) ekranının Page Object'i.
// Kapsam/alternatif seçimi, COVID ve kayak teminatı (acenteye göre görünür/gizli),
// tekli/çoklu sorgu ile sigortalı/ettiren bilgilerinin girilmesi ve prim hesaplama
// adımlarını içerir. Bazı acentelerde (örn. 30856) COVID teminatı, kayak teminatı,
// Plan Kodu ve Seyahat İptal Bedeli alanları hiç gösterilmez; bu yüzden bu alanlara
// dokunan her metot önce alanın görünür olup olmadığını kontrol eder.
type SeyahatData = JetSeyahatTestData['jetSeyahat'];
type SeyahatSenaryosu = SeyahatData['senaryolar'][number];

export class JetSeyahatPage {
  constructor(private readonly page: Page) {}

  /** JetSeyahat ekranını açar ve ülke listesinin (AJAX ile) yüklenmesini bekler. */
  async ac(data: SeyahatData): Promise<void> {
    await this.page.goto('/jet-satis/jet-seyahat/', { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator(`#product-${data.urunKodu}-link`)).toBeVisible();
    // Eski JetSeyahat ekranı ürün ve ülke listelerini sayfa açıldıktan sonra AJAX ile yeniliyor.
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.locator('#cmbCountries option')).not.toHaveCount(1);
  }

  /** Kapsam, alternatif, tarih, COVID/kayak teminatı, iptal bedeli, plan ve ülke bilgilerini girer. */
  async policeBilgileriniGir(
    data: SeyahatData,
    senaryo: SeyahatSenaryosu
  ): Promise<void> {
    // Kapsam (örn. DÜNYA/AVRUPA) ve alternatif (örn. VİZE SCHENGEN) ok tuşlarıyla döngüsel seçilir.
    await this.okluSecimYap('kapsam', senaryo.kapsam);
    await this.okluSecimYap('alternatif', senaryo.alternatif);
    await this.tarihGerekirseAyarla('#from', gunEkle(0));
    await this.tarihGerekirseAyarla('#to', gunEkle(data.seyahatSuresiGun));

    // COVID teminatı, kayak teminatı, Plan Kodu ve Seyahat İptal Bedeli alanları her acentede
    // gösterilmiyor (örn. 30856 acentesinde bu alanların hiçbiri yok). Acenteye özel sabit bir
    // kontrol yerine, her alan için önce görünürlük kontrol edilir; görünmüyorsa işlem atlanır.
    const covid = this.page.locator('#covid-teminati');
    if (await covid.isVisible()) {
      await this.selectGerekirseSec('#covid-teminati', senaryo.covidTeminati);
    }

    const kayakTeminati = this.page.getByRole('checkbox');
    if (senaryo.kayakTeminati !== undefined && (await kayakTeminati.isVisible())) {
      await kayakTeminati.setChecked(senaryo.kayakTeminati, { force: true });
    }

    const iptalBedeli = this.page.locator('#cmbIpt');
    if (await iptalBedeli.isVisible()) {
      await this.selectGerekirseSec('#cmbIpt', data.seyahatIptalBedeli.deger);
    }

    const plan = this.page.locator('#Plan_Select');
    if (await plan.isVisible()) {
      if ((await plan.inputValue()) !== data.plan.deger) {
        await plan.selectOption(data.plan.deger);
      }
    }
    await this.selectGerekirseSec('#cmbCountries', data.ulke.deger);

    await expect(this.page.locator('#cmbCountries')).toHaveValue(data.ulke.deger);
  }

  /**
   * Tekli sorguda sigortalı sayısını; çoklu sorguda Excel dosyasını yükleyip sonuçlanmasını
   * bekler. Çoklu sorguda, senaryonun kendi Excel'i varsa (dashboard > "Senaryo Oluştur" ile
   * yüklenmiş, bkz. senaryo.cokluSorguDosyasi/cokluSorguKisiSayisi) o kullanılır; yoksa ürün
   * genelindeki sabit dosyaya (data.cokluSorguDosyasi/cokluSorguKisiSayisi) düşer.
   */
  async sorguTipiniHazirla(data: SeyahatData, senaryo: SeyahatSenaryosu): Promise<void> {
    const sorguSecimi = senaryo.sorguTipi === 'tekli' ? '1' : '2';
    await this.selectGerekirseSec('#selectAllClientPolicy', sorguSecimi);

    if (senaryo.sorguTipi === 'coklu') {
      const dosyaGoreliYolu = senaryo.cokluSorguDosyasi ?? data.cokluSorguDosyasi;
      const kisiSayisi = senaryo.cokluSorguKisiSayisi ?? data.cokluSorguKisiSayisi;
      // Çoklu sorguda Excel yüklenince sigortalı satırları otomatik oluşur; her satırın
      // kimlik sorgusunun (ad-soyad dolana kadar) tamamlanması beklenir.
      const dosya = this.page.locator('#fileinsuredlist');
      await expect(dosya).toBeVisible();
      await dosya.setInputFiles(resolve(process.cwd(), dosyaGoreliYolu));
      const dosyaAdi = dosyaGoreliYolu.split(/[\\/]/).pop() ?? dosyaGoreliYolu;
      await expect(dosya).toHaveValue(new RegExp(`${regexIcinKac(dosyaAdi)}$`));
      const satirlar = this.page.locator('#InsurerList tr.syh-tc-tr');
      await expect(satirlar).toHaveCount(kisiSayisi, { timeout: 30_000 });
      await expect.poll(async () => {
        const adlar = await satirlar.locator('td[id$="-fullname"]').allInnerTexts();
        return adlar.filter((ad) => ad.trim().length > 0).length;
      }, {
        timeout: 30_000,
        message: 'Exceldeki tüm sigortalıların kimlik sorguları tamamlanmalıdır.'
      }).toBe(kisiSayisi);
      return;
    }

    const sigortaliSayisi = this.page.locator('#sigortali_sayisi');
    if ((await sigortaliSayisi.inputValue()) !== data.sigortaliSayisi) {
      await sigortaliSayisi.fill(data.sigortaliSayisi);
      await sigortaliSayisi.press('Tab');
    }
    await expect(sigortaliSayisi).toHaveValue(data.sigortaliSayisi);
  }

  /** Sigortalı ve sigorta ettiren aynı kişi: doğum tarihi → telefon → TC kimlik no sırasıyla girilir. */
  async sigortaliVeEttirenAyniGir(kimlik: OzelKimlikData): Promise<void> {
    await this.ettirenAyniSec();
    // Sıralama önemli: önce doğum tarihi, sonra telefon, en son TC kimlik no girilmeli.
    // Telefon sadece bir kez yazılır; TC sorgusu tamamlandıktan sonra tekrar yazılmaz.
    await this.tarihAyarla('#insurers-1-birthday', kimlik.dogumTarihi);
    await this.telefonGir('#insurers-1-tel', kimlik.cepTelefonu);

    const tc = this.page.locator('#insurer-1-textbox');
    await tc.fill('');
    await tc.pressSequentially(kimlik.tcKimlikNo);
    await tc.press('Tab');

    await expect(this.page.locator('#insurer-1-fullname')).not.toHaveText('', {
      timeout: 20_000
    });

    const telefon = this.page.locator('#insurers-1-tel');
    await expect(tc).toHaveValue(kimlik.tcKimlikNo);
    await expect
      .poll(() => telefon.inputValue().then((value) => value.replace(/\D/g, '')), {
        timeout: 20_000,
        message: 'TC sorgusu sonrası telefon alanı girilen değeri korumalı.'
      })
      .toBe(kimlik.cepTelefonu);
  }

  /** "Sigorta Ettiren Kendisi" seçeneğini işaretler. */
  async ettirenAyniSec(): Promise<void> {
    await this.page.locator('#DifferentClient-H').check({ force: true });
    await expect(this.page.locator('#DifferentClient-H')).toBeChecked();
  }

  /** Farklı kişi (özel/T.C.) sigorta ettiren bilgilerini girer ve sorgular. */
  async farkliOzelEttirenGir(kimlik: OzelKimlikData): Promise<void> {
    await this.page.locator('#DifferentClient-E').check({ force: true });
    await this.page.locator('#ClientType-O').check({ force: true });
    await this.tarihAyarla('#BirthDate', kimlik.dogumTarihi);
    await this.musteriSorgula(kimlik.tcKimlikNo, kimlik.cepTelefonu);
  }

  /** Farklı kurum (tüzel/VKN) sigorta ettiren bilgilerini girer ve sorgular. */
  async farkliTuzelEttirenGir(kimlik: TuzelKimlikData): Promise<void> {
    await this.page.locator('#DifferentClient-E').check({ force: true });
    await this.page.locator('#ClientType-T').check({ force: true });
    await expect(this.page.locator('#trClientBirthDate')).toBeHidden();
    await this.musteriSorgula(kimlik.vergiKimlikNo, kimlik.cepTelefonu);
  }

  /** Prim hesaplar ve tutarın sıfırdan büyük (pozitif teklif) olduğunu doğrular. */
  async primHesapla(): Promise<void> {
    await this.page.locator('#Refresh').click();
    await expect
      .poll(async () => {
        const metin = await this.page.locator('#premium-total-eur').innerText();
        return Number.parseFloat(metin.replace(',', '.'));
      }, {
        timeout: 45_000,
        message: 'JetSeyahat primi sıfırdan büyük olmalıdır.'
      })
      .toBeGreaterThan(0);
  }

  /** Prim hesaplar ve beklenen iş kuralı/hata mesajının diyalogda göründüğünü doğrular. */
  async primHesaplaVeHataDogrula(beklenenMesaj: string): Promise<void> {
    await this.page.locator('#Refresh').click();
    const hata = this.page.locator('#dialog-content');
    await expect(hata).toBeVisible({ timeout: 30_000 });
    await expect(hata).toHaveText(beklenenMesaj);
  }

  // Tarih alanları salt-okunur datepicker ile çalışıyor; doğrudan klavye girişi kabul etmiyor.
  // Bu yüzden değer JS ile atanıp input/change event'leri tetiklenir, ardından açılan
  // datepicker kutusu gizlenir.
  private async tarihAyarla(selector: string, tarih: string): Promise<void> {
    const alan = this.page.locator(selector);
    await alan.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, tarih);
    await expect(alan).toHaveValue(tarih);
    await this.page.locator('#ui-datepicker-div').evaluate((element) => {
      (element as HTMLElement).style.display = 'none';
    }).catch(() => undefined);
  }

  /** Alan zaten istenen tarihte değilse ayarlar (gereksiz datepicker etkileşiminden kaçınır). */
  private async tarihGerekirseAyarla(selector: string, tarih: string): Promise<void> {
    if ((await this.page.locator(selector).inputValue()) !== tarih) {
      await this.tarihAyarla(selector, tarih);
    }
  }

  /** Select alanı zaten istenen değerde değilse seçim yapar. */
  private async selectGerekirseSec(selector: string, value: string): Promise<void> {
    const select = this.page.locator(selector);
    if ((await select.inputValue()) !== value) await select.selectOption(value);
  }

  /** Farklı kişi/kurum ettiren için telefon+kimlik/VKN girip ad-soyad/unvan sorgusunu bekler. */
  private async musteriSorgula(kimlikNo: string, cepTelefonu: string): Promise<void> {
    const telefon = this.page.locator('#ClientPhoneNumber');
    const kimlik = this.page.locator('#ClientIdentityNo');
    await this.telefonGir('#ClientPhoneNumber', cepTelefonu);
    await kimlik.fill(kimlikNo);
    await this.page.locator('#RefreshClientIdentity').click();
    await expect(this.page.locator('#client-identity-name')).not.toHaveText(/^\s*$/, {
      timeout: 20_000
    });

    if ((await telefon.inputValue()).replace(/\D/g, '') !== cepTelefonu) {
      await this.telefonGir('#ClientPhoneNumber', cepTelefonu);
    }
    await expect.poll(() => telefon.inputValue().then((value) => value.replace(/\D/g, '')))
      .toBe(cepTelefonu);
  }

  /** Telefon alanını temizleyip verilen numarayı karakter karakter girer. */
  private async telefonGir(selector: string, cepTelefonu: string): Promise<void> {
    const telefon = this.page.locator(selector);
    await telefon.click();
    await telefon.press('Control+A');
    await telefon.press('Backspace');
    await telefon.pressSequentially(cepTelefonu, { delay: 20 });
    await expect.poll(() => telefon.inputValue().then((value) => value.replace(/\D/g, '')))
      .toBe(cepTelefonu);
  }

  // Kapsam/alternatif alanları serbest metin değil; ok (Increase/Decrease) tuşlarıyla
  // döngüsel olarak değiştiriliyor. Hedef değere ulaşana kadar doğru yöne tıklanır;
  // değer değişmezse (yanlış yön tahmini) ters yöne denenir. İkili seçenek setlerinde
  // (örn. 2 kapsam değeri) bu kendi kendini düzeltir.
  private async okluSecimYap(alan: 'kapsam' | 'alternatif', hedef: string): Promise<void> {
    const metin = this.page.locator(`#${alan}-text`);
    const tablo = this.page.locator(`#syh-${alan}-tb`);

    for (let deneme = 0; deneme < 6; deneme += 1) {
      if ((await metin.innerText()).trim() === hedef) return;

      const onceki = (await metin.innerText()).trim();
      const ulkeListesi = this.page.waitForResponse(
        (response) => response.url().includes('/jet-satis/jet-seyahat/ulke-listesi/') && response.ok()
      );
      const yon = hedef === 'SEYAHAT PAKET' ? 'Decrease' : 'Increase';
      await Promise.all([ulkeListesi, tablo.locator(`img[onclick*="${yon}"]`).click()]);
      if ((await metin.innerText()).trim() === onceki) {
        const tersYon = yon === 'Increase' ? 'Decrease' : 'Increase';
        await Promise.all([
          this.page.waitForResponse(
            (response) => response.url().includes('/jet-satis/jet-seyahat/ulke-listesi/') && response.ok()
          ),
          tablo.locator(`img[onclick*="${tersYon}"]`).click()
        ]);
      }
    }

    await expect(metin).toHaveText(hedef);
  }
}

/** Bir metni, RegExp içinde LİTERAL olarak kullanılabilmesi için özel karakterlerini kaçırır. */
function regexIcinKac(metin: string): string {
  return metin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bugünden itibaren `gun` gün sonrasının tarihini gg.aa.yyyy formatında döndürür. */
function gunEkle(gun: number): string {
  const tarih = new Date();
  tarih.setDate(tarih.getDate() + gun);
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(tarih);
}
