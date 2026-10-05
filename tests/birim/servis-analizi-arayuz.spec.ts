// KORUMA TESTLERİ — servis analizi arayüzü (A aşaması): sihirbazın Alanlar adımında adlı örnek istekler, alan tablosunda öneriler
// (Uygula / Tümünü uygula), önseçili tablo eşleşmesi, Özet adımında yeni tablo ve kayıt; kayıtlı serviste "Servisi analiz et"
// (kayıtlı örnekler, yalnız yeni öneriler, Yoksay hatırlanır); analiz boyunca servise HİÇ istek gitmez; 1440 / 390 px'te taşma yok.
// Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu (WSDL yalnız "Denetle" ile, onayla istenir). Veriler sentetik.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_PAROLA, SOAPUI, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;
/** Ekran görüntüleri yalnız istenirse (ör. rapor için) bu klasöre yazılır. */
const GORUNTU = process.env.ANALIZ_GORUNTU_KLASORU ?? '';

const zarf = (ic: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></soap:Body></soap:Envelope>`;
// Kanal / kullanıcı değerleri nötr "Bayi" tablosunun satırlarında (aynı satırda birlikte).
const BIREYSEL = zarf('<Channel>51234</Channel><Username>51234001</Username><Password>ornek-parola-1</Password><IdentityNumber>10000000146</IdentityNumber><ClientType>O</ClientType><Ekstra>E1</Ekstra><CreditCard><Installment>3</Installment></CreditCard>');
const KURUMSAL = zarf('<Channel>51234</Channel><Username>51234001</Username><Password>ornek-parola-2</Password><ClientType>T</ClientType><Ekstra>E2</Ekstra><IsGiftWrap xsi:nil="true"/>');
const UCUNCU = zarf('<Channel>67890</Channel><Username>67890001</Username><Password>ornek-parola-3</Password><ClientType>O</ClientType><Ekstra>E3</Ekstra><IsGiftWrap xsi:nil="true"/>');

/** Ekran görüntüsü (GORUNTU verilmişse): uzun pencerede, bölüm görünür; sabit üst çubuk araya girmesin diye tam sayfa alınmaz. */
async function goruntu(page: Page, ad: string, bolum: ReturnType<Page['locator']>) {
  const eski = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 1700 });
  await bolum.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.screenshot({ path: join(GORUNTU, ad) });
  if (eski) await page.setViewportSize(eski);
}

/** Sayfada yatay taşma yok (belge genişliği pencereyi aşmaz). */
async function tasmaYok(page: Page) {
  const r = await page.evaluate(() => ({ belge: document.documentElement.scrollWidth, pencere: window.innerWidth }));
  expect(r.belge, `belge ${r.belge} px, pencere ${r.pencere} px`).toBeLessThanOrEqual(r.pencere);
}

test.describe('servis analizi arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Analiz-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let girisId = '';
  let tipId = '';
  let bayiId = '';
  let servisId = '';
  let denetimSonrasi = 0;
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const servis = async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-analizi-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Analiz Projesi' })).proje.id);
    await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, riskli: false });
    girisId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Servis girişi', sutunlar: [{ ad: 'Channel' }, { ad: 'Username' }, { ad: 'Password', gizli: true }],
      satirlar: [{ degerler: { Channel: '77', Username: 'tablo-kullanici', Password: 'tablo-parola' } }] })).tablo.id;
    // "ClientType" ↔ "Client type" (birebir, tablo adı; tek başına "Tip" genel ek sayılır) + değerler O / T "Kod" sütununda: güçlü eşleşme → sihirbazda önseçili.
    tipId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Client type', sutunlar: [{ ad: 'Kod' }, { ad: 'Açıklama' }],
      satirlar: [{ ad: 'o', degerler: { Kod: 'O', 'Açıklama': 'Birinci' } }, { ad: 't', degerler: { Kod: 'T', 'Açıklama': 'İkinci' } }] })).tablo.id;
    // "Bayi": Username ↔ Kullanıcı (eş anlam + değer), Channel ↔ Bayi kodu (yalnız değer, desen aynı; aynı satırda birlikte).
    bayiId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Bayi', sutunlar: [{ ad: 'Bayi kodu' }, { ad: 'Kullanıcı' }],
      satirlar: [{ ad: 'b1', degerler: { 'Bayi kodu': '51234', 'Kullanıcı': '51234001' } }, { ad: 'b2', degerler: { 'Bayi kodu': '67890', 'Kullanıcı': '67890001' } }] })).tablo.id;
    tarayici = await chromium.launch();
    if (GORUNTU) mkdirSync(GORUNTU, { recursive: true });
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sihirbaz: 3 adlı örnek → güç sınıfları, satırda tablo öneri rozeti, Tablo önerileri (mevcut / yeni), güçlü önerileri uygula, yeni tablo kaydı', async () => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/servisler/yeni');
    const ileri = page.getByRole('button', { name: 'İleri' });
    await page.getByLabel('Servis adı').fill('Analiz Servisi');
    await page.getByLabel('TEST taban adresi', { exact: true }).selectOption('__yeni');
    await page.getByLabel('TEST yeni taban adresi').fill(`${soap.adres}/Servis`);
    await ileri.click();
    await page.getByLabel('Yol (zorunlu)', { exact: true }).fill('/ornek.asmx');
    await page.getByRole('button', { name: 'Denetle' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'İstek at' }).click();
    await expect(page.locator('.metot-listesi')).toContainText('Siparis');
    denetimSonrasi = soap.istekler.length;
    await ileri.click();

    // Boş durum: hiçbir mevcut tablo eşleşmiyor → bölüm açıkça söyler (yeni tablo önerildi).
    await page.getByRole('button', { name: 'Onayla metodu' }).click();
    const onayla = page.getByRole('region', { name: 'Onayla örnek istekleri' });
    await onayla.getByRole('button', { name: 'Gövde XML ekle' }).click();
    await onayla.getByLabel('Onayla örnek adı').fill('Tek');
    await onayla.getByLabel('Onayla örnek gövdesi').fill('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Onayla xmlns="Ornek"><SiparisNo>4242</SiparisNo></Onayla></soap:Body></soap:Envelope>');
    await onayla.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(onayla.getByRole('region', { name: 'Onayla tablo önerileri' })).toContainText('Mevcut tablolarla eşleşen alan bulunamadı; 1 alan için yeni tablo önerildi.');

    // Siparis: üç adlı örnek.
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    const bolum = page.getByRole('region', { name: 'Siparis örnek istekleri' });
    await expect(bolum).toContainText('Örnek istekler (gövde XML)');
    // Bireysel ve Kurumsal başarılı (işaretli), Ucuncu bilinmiyor.
    for (const [ad, govde, sonuc] of [['Bireysel', BIREYSEL, 'basarili'], ['Kurumsal', KURUMSAL, 'basarili'], ['Ucuncu', UCUNCU, 'bilinmiyor']]) {
      await bolum.getByRole('button', { name: 'Gövde XML ekle' }).click();
      await bolum.getByLabel('Siparis örnek adı').fill(ad);
      await bolum.getByLabel('Siparis örnek gövdesi').fill(govde);
      await bolum.getByLabel('Siparis örnek sonucu').selectOption(sonuc);
      await bolum.getByRole('button', { name: 'Ekle', exact: true }).click();
    }
    await expect(bolum.locator('.ornek-listesi li')).toHaveCount(3);
    await expect(bolum.locator('.ornek-listesi')).not.toContainText('ornek-parola-1');
    await expect(bolum.locator('.ornek-listesi')).toContainText('••••••');
    await expect(bolum).toContainText('3 örnek analiz edildi');
    await expect(bolum.getByLabel('Kurumsal isteği başarılı oldu mu?')).toHaveValue('basarili');
    await expect(bolum).toContainText('Kesin karar için C aşaması');
    // Zorunluluk kanıtı başarılı istekten: IsGiftWrap başarılı Bireysel'de yok → güçlü "boş gönder" + WSDL çelişki notu; satır özeti.
    const hediye = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^IsGiftWrap/ }) });
    await expect(hediye.locator('.analiz-ozeti')).toContainText('başarılı 2 istekte boş / yok · WSDL: zorunlu');
    await expect(hediye.locator('.analiz-onerisi[data-tur="bosGonder"]')).toHaveAttribute('data-guc', 'guclu');
    await expect(hediye.locator('.analiz-onerisi[data-tur="bosGonder"]')).toContainText('servis bu alan olmadan kabul ediyor');
    // Her örnekte dolu → yalnız zayıf "zorunlu olabilir".
    const ekstra = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^Ekstra/ }) });
    await expect(bolum.locator('.analiz-onerisi[data-tur="alanEkle"]')).toContainText('Input/Ekstra');
    await expect(page.getByLabel('Siparis Input/ClientType zorunlu')).toBeChecked();

    // Satırda: önerilen tablo sütunu seçim kutusunun yanında rozetle (önseçili ya da öneri).
    const satir = (ad: string) => page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(page.getByLabel('Siparis Input/ClientType tablo sütunu ya da kural')).toHaveValue(`${tipId}\u0001Kod`);
    await expect(satir('ClientType').locator('.bag-onerisi')).toContainText('Önseçili: Client type › Kod');
    await expect(satir('Username').locator('.bag-onerisi')).toContainText('Öneri: Bayi › Kullanıcı');
    // Tablo önerileri (a): mevcut tablolara bağ — güç ve kanıtıyla; aynı satır güveni; yalnız değerden gelen Channel güçlendi.
    const tablo = bolum.getByRole('region', { name: 'Siparis tablo önerileri' });
    const bag = (ad: string) => tablo.locator('.tablo-onerileri-a .analiz-onerisi').filter({ hasText: `${ad} → ` });
    await expect(bag('Username')).toContainText('Bayi › Kullanıcı');
    await expect(bag('Username')).toContainText('güçlü');
    await expect(bag('Username')).toContainText('Ad: Username ↔ Kullanıcı (eş anlam)');
    await expect(bag('Channel')).toContainText('Bayi › Bayi kodu');
    await expect(bag('Channel')).toContainText('desen aynı');
    await expect(bag('Channel')).toContainText('Channel + Username aynı Bayi satırında');
    await expect(bag('Channel')).toHaveAttribute('data-guc', 'guclu');
    // (b) Yeni tablolar: kavram gruplarına göre; açılır önizleme (gizli değer maskeli), ad düzenlenir.
    const yeniler = tablo.locator('.yeni-tablo-karti');
    await expect(yeniler.locator('summary')).toContainText(['Kişi bilgileri', 'Kart bilgileri', 'Ekstra (liste)']);
    const kisi = yeniler.filter({ hasText: 'Kişi bilgileri' });
    await kisi.locator('summary').click();
    await expect(kisi.getByRole('table')).toContainText('IdentityNumber');
    await expect(kisi.getByRole('table')).toContainText('••••••');
    await expect(kisi.getByRole('table')).not.toContainText('10000000146');
    const ek = yeniler.filter({ hasText: 'Ekstra (liste)' });
    await ek.locator('summary').click();
    await ek.getByLabel('Ekstra yeni tablo adı düzenle').fill('Ek bilgiler');
    await ek.getByLabel('Ekstra yeni tablo adı düzenle').blur();
    // Zayıf öneri tek tek: kimlik numarası gizli (1 gözlem) → Uygula.
    await expect(satir('IdentityNumber').locator('.analiz-onerisi[data-tur="gizli"]')).toHaveAttribute('data-guc', 'zayif');
    await satir('IdentityNumber').getByRole('button', { name: 'Uygula: Input/IdentityNumber — Gizli' }).click();
    await expect(satir('IdentityNumber').locator('.analiz-onerisi[data-tur="gizli"]')).toHaveCount(0);
    // Çelişki notu ayrı; uygulanmaz.
    await expect(satir('IsGiftWrap').locator('.analiz-onerisi.celiski')).toContainText('WSDL\'de zorunlu');
    await expect(satir('IsGiftWrap').locator('.analiz-onerisi.celiski').getByRole('button', { name: /^Uygula/ })).toHaveCount(0);
    if (GORUNTU) await goruntu(page, 'sihirbaz-alanlar-1440.png', bolum);
    await tasmaYok(page);
    // Satır rozetinden Uygula; sonra güçlü önerilerin hepsi (zayıflar ve çelişkiler kalır).
    await satir('Username').getByRole('button', { name: 'Öneriyi uygula: Input/Username → Bayi › Kullanıcı' }).click();
    await expect(page.getByLabel('Siparis Input/Username tablo sütunu ya da kural')).toHaveValue(`${bayiId}\u0001Kullanıcı`);
    const guclu = bolum.getByRole('button', { name: 'Siparis güçlü önerileri uygula' });
    await expect(guclu).toHaveText(/^Güçlü önerileri uygula \([1-9]\d*\)$/);
    await guclu.click();
    await expect(guclu).toHaveText('Güçlü önerileri uygula (0)');
    await expect(page.locator('.analiz-onerisi[data-guc="zayif"]').first()).toBeVisible();
    await expect(page.locator('.alan-satiri .alan-adi').filter({ hasText: /^Ekstra/ })).toContainText('WSDL\'de yok');
    await expect(ekstra.locator('.analiz-onerisi[data-tur="zorunlu"]')).toHaveAttribute('data-guc', 'zayif');
    await expect(ekstra.locator('.analiz-onerisi[data-tur="zorunlu"]')).toContainText('Zorunlu olabilir');
    await expect(page.getByLabel('Siparis Input/Channel tablo sütunu ya da kural')).toHaveValue(`${bayiId}\u0001Bayi kodu`);
    // Yeni tablolar zayıftır: tek tek önerilir.
    await tablo.locator('.yeni-tablo-karti').filter({ hasText: 'Ek bilgiler' }).getByRole('button', { name: 'Uygula: Ek bilgiler yeni tablo' }).click();
    await expect(tablo.locator('.yeni-tablo-karti').filter({ hasText: 'Kişi bilgileri' })).toHaveAttribute('open', '');
    await tablo.locator('.yeni-tablo-karti').filter({ hasText: 'Kişi bilgileri' }).getByRole('button', { name: 'Uygula: Kişi bilgileri yeni tablo' }).click();
    await expect(page.getByLabel('Siparis Input/Ekstra tablo sütunu ya da kural')).toHaveValue('yeni:Ekstra\u0001Ekstra');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ileri.click();

    // Özet: yeni tablolar ve örnek sayısı; kayıt.
    const ozet = page.locator('.ozet-listesi');
    await expect(ozet).toContainText('Siparis: 3');
    await expect(ozet.locator('.yeni-tablolar')).toContainText('Ek bilgiler');
    await expect(ozet.locator('.yeni-tablolar')).toContainText('Kişi bilgileri');
    await expect(ozet).toContainText('Gizli sütun boş açılır');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[0-9a-f-]{36}$/);
    expect(hatalar).toEqual([]);
    await baglam.close();

    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    servisId = servisler.find((x: Nesne) => x.anahtar === 'analiz-servisi').id;
    // Liste yalnız küçük ayarları taşır; örnek istekler, analiz kararları vb. tekil uçtan (GET /platform/servis).
    const a = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis.ayarlar;
    expect(a.ornekIstekler.Siparis.map((x: Nesne) => [x.ad, x.kaynak, x.durum ?? 'bilinmiyor'])).toEqual([['Bireysel', 'elle', 'basarili'], ['Kurumsal', 'elle', 'basarili'], ['Ucuncu', 'elle', 'bilinmiyor']]);
    expect(a.ornekIstekler.Siparis[0].govde).toContain('<Password>••••••</Password>');
    expect(a.alanBaglari.Siparis['Input/ClientType']).toEqual({ tablo: tipId, sutun: 'Kod' });
    expect(a.alanBaglari.Siparis['Input/Username']).toEqual({ tablo: bayiId, sutun: 'Kullanıcı' });
    expect(a.alanBaglari.Siparis['Input/Channel']).toEqual({ tablo: bayiId, sutun: 'Bayi kodu' });
    expect(a.alanKurallari.Siparis['Input/IdentityNumber']).toEqual({ gizli: true });
    expect(a.ekAlanlar.Siparis).toEqual([{ yol: 'Input/Ekstra', tip: 'metin' }]);
    // Güçlü uygulananlar: başarılı istekte yok → Installment isteğe bağlı, IsGiftWrap boş (nil) gönder; "zorunlu olabilir" (zayıf) uygulanmadı.
    expect(a.alanZorunluluklari.Siparis).toContain('Input/ClientType');
    for (const y of ['Input/Ekstra', 'Input/Channel', 'Input/CreditCard/Installment', 'Input/IsGiftWrap']) expect(a.alanZorunluluklari.Siparis).not.toContain(y);
    expect(a.alanVarsayilanlari.Siparis['Input/IsGiftWrap']).toEqual({ kaynak: 'nil' });
    expect(Object.values(a.analizKararlari.Siparis)).toContain('uygulandi');
    expect(a.ornekFarklari.Siparis.map((f: Nesne) => f.yol)).toEqual(['Input/IdentityNumber', 'Input/CreditCard/Installment']);
    const { tablolar } = await basarili(`/platform/tablolar?projeId=${projeId}`);
    const yeni = tablolar.find((t: Nesne) => t.ad === 'Ek bilgiler');
    expect(yeni.satirlar.map((r: Nesne) => [r.ad, r.degerler.Ekstra])).toEqual([['E1', 'E1'], ['E2', 'E2'], ['E3', 'E3']]);
    expect(a.alanBaglari.Siparis['Input/Ekstra']).toEqual({ tablo: yeni.id, sutun: 'Ekstra' });
    const kisiTablosu = tablolar.find((t: Nesne) => t.ad === 'Kişi bilgileri');
    expect(kisiTablosu.sutunlar.map((c: Nesne) => [c.ad, c.gizli])).toEqual([['IdentityNumber', true]]);
    expect(kisiTablosu.satirlar.every((r: Nesne) => r.doluGizli.length === 0)).toBe(true);
    expect(tablolar.some((t: Nesne) => t.ad === 'Kart bilgileri')).toBe(false);
    expect(soap.istekler.length).toBe(denetimSonrasi);
  });

  test('kayıtlı servis: "Servisi analiz et" — kayıtlı örnekler, yalnız yeni öneriler, Yoksay hatırlanır, tablo önerisi boş durumu, istek yok', async () => {
    test.setTimeout(120_000);
    const once = soap.istekler.length;
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}`);
    await page.getByRole('link', { name: 'Servisi analiz et' }).click();
    await expect(page.getByRole('heading', { name: 'Servisi analiz et' })).toBeVisible();
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    const bolum = page.getByRole('region', { name: 'Siparis örnek istekleri' });
    await expect(bolum.locator('.ornek-listesi li')).toHaveCount(3);
    await expect(bolum.locator('.ornek-listesi')).not.toContainText('ornek-parola');
    await expect(bolum).toContainText('3 örnek analiz edildi');
    // Uygulananlar yeniden sorulmaz: güçlü öneri kalmadı; tüm alanlar bağlı → boş durum (kalan yeni tablo önerisiyle).
    await expect(bolum.getByRole('button', { name: 'Siparis güçlü önerileri uygula' })).toHaveText('Güçlü önerileri uygula (0)');
    await expect(bolum.getByRole('region', { name: 'Siparis tablo önerileri' })).toContainText('Mevcut tablolarla eşleşen alan bulunamadı; 1 alan için yeni tablo önerildi.');
    // Yeni başarılı örnek ClientType olmadan: yalnız yeni öneri (güçlü "isteğe bağlı" + WSDL çelişki notu).
    await bolum.getByRole('button', { name: 'Gövde XML ekle' }).click();
    await bolum.getByLabel('Siparis örnek adı').fill('Kısa');
    await bolum.getByLabel('Siparis örnek gövdesi').fill(zarf('<Channel>51234</Channel><Username>51234001</Username><Password>ornek-parola-4</Password><Ekstra>E4</Ekstra>'));
    await bolum.getByLabel('Siparis örnek sonucu').selectOption('basarili');
    await bolum.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(bolum).toContainText('4 örnek analiz edildi');
    const ekSatiri = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^ClientType/ }) });
    await expect(ekSatiri.locator('.analiz-onerisi[data-tur="zorunlu"]')).toContainText('Başarılı \'Kısa\' isteğinde yok → servis bu alan olmadan kabul ediyor');
    await expect(ekSatiri.locator('.analiz-onerisi.celiski')).toContainText('WSDL\'de zorunlu');
    await expect(bolum.getByRole('button', { name: 'Siparis güçlü önerileri uygula' })).toHaveText('Güçlü önerileri uygula (1)');
    await expect(page.locator('.analiz-onerisi[data-tur="gizli"]')).toHaveCount(0);
    await expect(page.locator('.bag-onerisi')).toHaveCount(0);
    if (GORUNTU) await goruntu(page, 'servis-analiz-1440.png', bolum);
    await tasmaYok(page);
    await ekSatiri.getByRole('button', { name: 'Yoksay: Input/ClientType — İsteğe bağlı' }).click();
    await expect(page.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi');
    const a = (await servis()).ayarlar;
    expect(a.ornekIstekler.Siparis.map((x: Nesne) => x.ad)).toEqual(['Bireysel', 'Kurumsal', 'Ucuncu', 'Kısa']);
    expect(Object.entries(a.analizKararlari.Siparis).filter(([, v]) => v === 'yoksayildi').map(([k]) => k)).toEqual(expect.arrayContaining([expect.stringContaining('zorunlu|Input/ClientType|false')]));
    // Mevcut ZORUNLU kutusu öneri uygulanmadan değişmez.
    expect(a.alanZorunluluklari.Siparis).toContain('Input/ClientType');
    expect(a.ornekIstekler.Siparis[3]).toMatchObject({ ad: 'Kısa', durum: 'basarili' });
    expect(a.ornekIstekler.Siparis[0].govde).toContain('<Password>••••••</Password>');
    await page.reload();
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    await expect(page.getByRole('region', { name: 'Siparis örnek istekleri' })).toContainText('4 örnek analiz edildi');
    await expect(page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^ClientType/ }) }).locator('.analiz-onerisi[data-tur="zorunlu"]')).toHaveCount(0);
    await expect(page.getByLabel('Kayıtlı senaryoların gövdeleri (0)')).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    if (GORUNTU) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/#/servisler/s/${servisId}`);
      await expect(page.getByRole('link', { name: 'Servisi analiz et' })).toBeVisible();
      await page.screenshot({ path: join(GORUNTU, 'servis-sayfasi-1440.png') });
    }
    expect(hatalar).toEqual([]);
    expect(soap.istekler.length).toBe(once);
    await baglam.close();
  });

  test('Parametreler: her alanın değer kaynağı (tablo / kural / akış / evet-hayır / bağlı değil + öneri bağlantısı), tip rozeti ve kaynağı, "Yalnız bağlı olmayanlar"', async () => {
    test.setTimeout(90_000);
    const once = soap.istekler.length;
    const a = (await servis()).ayarlar;
    // Channel bağı kaldırılır (analizde Bayi önerisi var), kart numarası akıştan, taksit örneklerden onaylanmış tip.
    const baglar = { ...a.alanBaglari.Siparis };
    delete baglar['Input/Channel'];
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'analiz-servisi', ad: 'Analiz Servisi', yol: a.yol,
      alanBaglari: { ...a.alanBaglari, Siparis: baglar },
      alanVarsayilanlari: { ...a.alanVarsayilanlari, Siparis: { ...a.alanVarsayilanlari.Siparis, 'Input/CreditCard/CardNumber': { kaynak: 'akis', deger: 'Kart' } } },
      alanKurallari: { ...a.alanKurallari, Siparis: { ...a.alanKurallari.Siparis, 'Input/CreditCard/Installment': { tip: 'tamsayi' } } } });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/parametreler`);
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    await expect(page.locator('.kaynak-aciklamasi')).toContainText('Bağlı değil (senaryoda yazılır)');
    const satir = (ad: string) => page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(satir('ClientType').locator('.kaynak-ozeti')).toHaveAttribute('data-kaynak', 'tablo');
    await expect(satir('IsGiftWrap').locator('.kaynak-ozeti')).toHaveText('Evet/hayır — değer senaryoda seçilir (tablo gerekmez)');
    await expect(satir('BeginDate').locator('.kaynak-ozeti')).toHaveText('Kural: BEGIN_DATE');
    await expect(satir('CardNumber').locator('.kaynak-ozeti')).toHaveText('Akıştan: ${akis:Kart}');
    await expect(satir('Channel').locator('.kaynak-ozeti')).toContainText('Bağlı değil — senaryoda yazılır');
    await expect(satir('Channel').locator('.kaynak-ozeti a.oneri-var')).toHaveAttribute('href', `#/servisler/s/${servisId}/analiz`);
    // Tip rozeti ve kaynağı.
    await expect(satir('Channel').locator('.alan-tipi')).toHaveText('metin');
    await expect(satir('Channel').locator('.alan-tipi')).toHaveAttribute('title', 'Tip: metin (kaynak: WSDL)');
    await expect(satir('IsGiftWrap').locator('.alan-tipi')).toHaveText('evet/hayır');
    await expect(satir('Installment').locator('.alan-tipi')).toHaveText('tamsayı');
    await expect(satir('Installment').locator('.alan-tipi')).toHaveAttribute('title', 'Tip: tamsayı (kaynak: örneklerden (onaylanmış analiz))');
    // Süzgeç: yalnız bağlı olmayanlar.
    await page.getByText('Yalnız bağlı olmayanlar').click();
    await expect(satir('Channel')).toHaveCount(1);
    await expect(satir('IsGiftWrap')).toHaveCount(0);
    await expect(satir('ClientType')).toHaveCount(0);
    await expect(satir('BeginDate')).toHaveCount(0);
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    expect(soap.istekler.length).toBe(once);
    await baglam.close();
  });

  test('kopuk bağ: alan başına TEK kart — eski bağ + önerilen sütuna bağla / bağı kaldır / Yoksay; güç eşleşme kanıtından', async () => {
    test.setTimeout(60_000);
    const once = soap.istekler.length;
    const a = (await servis()).ayarlar;
    // Username'in bağlı olduğu sütun artık yok (kopuk); ad + değer Bayi › Kullanıcı ile eşleşiyor.
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'analiz-servisi', ad: 'Analiz Servisi', yol: a.yol,
      alanBaglari: { ...a.alanBaglari, Siparis: { ...a.alanBaglari.Siparis, 'Input/Username': { tablo: bayiId, sutun: 'Eski' } } } });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/analiz`);
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    const tablolar = page.getByRole('region', { name: 'Siparis tablo önerileri' });
    const kart = tablolar.locator('.analiz-onerisi').filter({ hasText: 'Username' });
    await expect(kart).toHaveCount(1);
    await expect(kart).toHaveAttribute('data-tur', 'kopukBag');
    await expect(kart).toHaveAttribute('data-guc', 'guclu');
    await expect(kart).toContainText('eski bağ silinmiş (Bayi › Eski) → Bayi › Kullanıcı');
    await expect(kart.getByRole('button')).toHaveText(['Önerilen sütuna bağla', 'Bağı kaldır', 'Yoksay']);
    await kart.getByRole('button', { name: 'Önerilen sütuna bağla' }).click();
    await expect(page.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi');
    await expect(tablolar.locator('.analiz-onerisi').filter({ hasText: 'Username' })).toHaveCount(0);
    expect((await servis()).ayarlar.alanBaglari.Siparis['Input/Username']).toEqual({ tablo: bayiId, sutun: 'Kullanıcı' });
    expect(hatalar).toEqual([]);
    expect(soap.istekler.length).toBe(once);
    await baglam.close();
  });

  test('satır bütünlüğü: tabloya örnek başına tek satır (önizleme, Satırları ekle, aynı satır yeniden önerilmez); eski biçimli bekleyen veri de yazılır', async () => {
    test.setTimeout(90_000);
    const once = soap.istekler.length;
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/analiz`);
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    const bolum = page.getByRole('region', { name: 'Siparis örnek istekleri' });
    await bolum.getByRole('button', { name: 'Gövde XML ekle' }).click();
    await bolum.getByLabel('Siparis örnek adı').fill('Yeni bayi');
    await bolum.getByLabel('Siparis örnek gövdesi').fill(zarf('<Channel>70000</Channel><Username>70000001</Username><Password>ornek-parola-5</Password><ClientType>O</ClientType><Ekstra>E5</Ekstra>'));
    await bolum.getByLabel('Siparis örnek sonucu').selectOption('basarili');
    await bolum.getByRole('button', { name: 'Ekle', exact: true }).click();
    // Tablo başına tek kart; satır önizlemesi (Bayi kodu ve Kullanıcı aynı satırda).
    const kart = bolum.locator('.satir-onerisi').filter({ hasText: 'Bayi tablosuna' });
    await expect(kart).toHaveCount(1);
    await expect(kart).toContainText('Bayi tablosuna 1 satır eklensin mi');
    const onizleme = kart.getByRole('table', { name: 'Bayi satır önizlemesi' });
    await expect(onizleme.locator('tbody tr')).toHaveCount(1);
    await expect(onizleme.locator('tbody tr').first()).toContainText('Yeni bayi');
    await expect(onizleme.locator('tbody tr').first()).toContainText('70000');
    await expect(onizleme.locator('tbody tr').first()).toContainText('70000001');
    await expect(bolum.locator('.analiz-onerisi[data-tur="tabloyaDeger"]')).toHaveCount(0);
    await expect(bolum).not.toContainText('ornek-parola-5');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await kart.getByRole('button', { name: 'Satırları ekle' }).click();
    const bayi = async () => ((await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.id === bayiId) as Nesne;
    // Kayıt sonrası sayfa yenilenir; satır tabloya TEK satır olarak (iki sütun birlikte) yazılır.
    await expect.poll(async () => (await bayi()).satirlar.filter((r: Nesne) => r.ad === 'Yeni bayi').map((r: Nesne) => r.degerler))
      .toEqual([expect.objectContaining({ 'Bayi kodu': '70000', 'Kullanıcı': '70000001' })]);
    await expect(page.getByText('Önerilen satırlar tablolara eklendi.')).toBeVisible();
    // Yeniden açınca aynı satır önerilmez.
    await page.reload();
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    await expect(page.getByRole('region', { name: 'Siparis örnek istekleri' })).toContainText('örnek analiz edildi');
    await expect(page.locator('.satir-onerisi').filter({ hasText: 'Bayi tablosuna' })).toHaveCount(0);
    // Eski biçimle bekleyen veri (sütun + değerler) kayıtta yine yazılır; sütunda olan değer eklenmez.
    const a = (await servis()).ayarlar;
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'analiz-servisi', ad: 'Analiz Servisi', yol: a.yol,
      tabloDegerleri: [{ tablo: bayiId, sutun: 'Bayi kodu', degerler: ['80000', '70000'] }] });
    expect((await bayi()).satirlar.filter((r: Nesne) => ['80000', '70000'].includes(r.degerler['Bayi kodu'])).map((r: Nesne) => r.ad).sort()).toEqual(['80000', 'Yeni bayi']);
    expect(hatalar).toEqual([]);
    expect(soap.istekler.length).toBe(once);
    await baglam.close();
  });

  test('içe aktarma: SoapUI ve Postman istekleri servisin örnek isteklerine gelir (bilinen değer yazılır, gizli değer yer tutucu kalır)', async () => {
    test.setTimeout(60_000);
    // SoapUI: yeni servis erişim kontrolüyle (WSDL yalnız sahte sunucudan).
    const ortamId = (await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST2', tabanUrl: soap.adres, riskli: false })).ortam.id;
    const erisim = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    const aktar = await basarili('/platform/servis/soapui/aktar', { projeId, xml: SOAPUI, takim: 'Takim', durum: 'OrnekDurum', servis: 'ornek-service', erisimKimligi: erisim.erisimKimligi });
    const soapui = (await basarili(`/platform/servis?projeId=${projeId}&id=${aktar.servisId}`)).servis.ayarlar.ornekIstekler.Siparis;
    expect(soapui.map((x: Nesne) => [x.ad, x.kaynak])).toEqual([['Geçersiz kimlik', 'soapui'], ['Geçerli kimlik', 'soapui'], ['Başka kanal', 'soapui']]);
    expect(soapui[1].govde).toContain('<IdentityNumber>55555555555</IdentityNumber>');
    expect(soapui[0].govde).toContain('<Password>${PASSWORD}</Password>');
    expect(JSON.stringify(soapui)).not.toContain(SAHTE_PAROLA);

    // Postman: isteğin gövdesi ucun örneği; düz yazılmış sır değişkene çevrilmiş halde (yer tutucu) kalır.
    const koleksiyon = JSON.stringify({
      info: { name: 'Koleksiyon', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'taban', value: 'http://127.0.0.1:9/api' }, { key: 'ad', value: 'Deneme' }],
      item: [{ name: 'Kayitlar', item: [{ name: 'Kayit ekle', request: { method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
        url: '{{taban}}/kayit', body: { mode: 'raw', raw: '{"ad":"{{ad}}","adet":2,"password":"duz-deger-7"}', options: { raw: { language: 'json' } } } } }] }]
    });
    const { onizleme } = await basarili('/platform/servis/postman/onizle', { projeId, koleksiyon });
    const p = await basarili('/platform/servis/postman/aktar', { projeId, koleksiyon, klasorler: [onizleme.klasorler[0].anahtar] });
    const postman = (await basarili(`/platform/servis?projeId=${projeId}&id=${p.servisler[0].servisId}`)).servis.ayarlar.ornekIstekler;
    const [uc] = Object.keys(postman);
    expect(postman[uc].map((x: Nesne) => [x.ad, x.kaynak])).toEqual([['Kayit ekle', 'postman']]);
    expect(postman[uc][0].govde).toContain('"ad":"Deneme"');
    expect(JSON.stringify(postman)).not.toContain('duz-deger-7');
  });
});
