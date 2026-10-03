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
const BIREYSEL = zarf('<Channel>77</Channel><Username>u1</Username><Password>ornek-parola-1</Password><IdentityNumber>10000000146</IdentityNumber><ClientType>O</ClientType><Ekstra>E1</Ekstra><CreditCard><Installment>3</Installment></CreditCard>');
const KURUMSAL = zarf('<Channel>77</Channel><Username>u2</Username><Password>ornek-parola-2</Password><ClientType>T</ClientType><Ekstra>E2</Ekstra><IsGiftWrap xsi:nil="true"/>');

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
    // "ClientType" ↔ "Tip" (eş anlam, tablo adı) + değerler O / T "Kod" sütununda: güçlü eşleşme → sihirbazda önseçili.
    tipId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Tip', sutunlar: [{ ad: 'Kod' }, { ad: 'Açıklama' }],
      satirlar: [{ ad: 'o', degerler: { Kod: 'O', 'Açıklama': 'Birinci' } }, { ad: 't', degerler: { Kod: 'T', 'Açıklama': 'İkinci' } }] })).tablo.id;
    tarayici = await chromium.launch();
    if (GORUNTU) mkdirSync(GORUNTU, { recursive: true });
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sihirbaz: 2 adlı örnek → öneriler tabloda, önseçili tablo eşleşmesi, Uygula / Tümünü uygula, yeni tablo özet adımında ve kayıtta', async () => {
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

    // Alanlar: metodun tablosunun üstünde "Örnek istekler"; iki adlı örnek.
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    const bolum = page.getByRole('region', { name: 'Siparis örnek istekleri' });
    await expect(bolum).toContainText('Örnek istekler (gövde XML)');
    for (const [ad, govde] of [['Bireysel', BIREYSEL], ['Kurumsal', KURUMSAL]]) {
      await bolum.getByRole('button', { name: 'Gövde XML ekle' }).click();
      await bolum.getByLabel('Siparis örnek adı').fill(ad);
      await bolum.getByLabel('Siparis örnek gövdesi').fill(govde);
      await bolum.getByRole('button', { name: 'Ekle', exact: true }).click();
    }
    await expect(bolum.locator('.ornek-listesi li')).toHaveCount(2);
    // Gizli adlı alanın değeri önizlemede maskeli.
    await expect(bolum.locator('.ornek-listesi')).not.toContainText('ornek-parola-1');
    await expect(bolum.locator('.ornek-listesi')).toContainText('••••••');
    await expect(bolum).toContainText('2 örnek analiz edildi');

    // Tablo eşleşmesi önseçili: ClientType → Tip.Kod (kanıtıyla).
    await expect(page.getByLabel('Siparis Input/ClientType tablo sütunu ya da kural')).toHaveValue(`${tipId}\u0001Kod`);
    const tipSatiri = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^ClientType/ }) });
    await expect(tipSatiri.locator('.analiz-onerisi[data-tur="tabloBagi"]')).toContainText('önseçili');
    await expect(tipSatiri.locator('.analiz-onerisi[data-tur="tabloBagi"]')).toContainText('O, T 2/2 Tip.Kod\'da var');
    // Satır başına öneri: kimlik numarası gizli (11 hane) → Uygula.
    const kimlikSatiri = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^IdentityNumber/ }) });
    await expect(kimlikSatiri.locator('.analiz-ozeti')).toContainText('1/2 örnekte dolu');
    await kimlikSatiri.getByRole('button', { name: 'Uygula: Input/IdentityNumber — Gizli' }).click();
    await expect(kimlikSatiri.locator('.analiz-onerisi[data-tur="gizli"]')).toHaveCount(0);
    // WSDL ile çelişki ayrı uyarı (IsGiftWrap WSDL'de zorunlu, örneklerde boş / yok).
    await expect(page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^IsGiftWrap/ }) }).locator('.analiz-onerisi.celiski')).toContainText('WSDL\'de zorunlu');
    // WSDL'de olmayan öğe bölümde: "alan olarak eklensin mi?"; Tümünü uygula hepsini uygular.
    await expect(bolum.locator('.analiz-onerisi[data-tur="alanEkle"]')).toContainText('Input/Ekstra');
    await expect(bolum.locator('.ornek-farklari')).toContainText('Örnekler arası fark');
    if (GORUNTU) await goruntu(page, 'sihirbaz-alanlar-1440.png', bolum);
    await tasmaYok(page);
    await bolum.getByRole('button', { name: 'Siparis tüm önerileri uygula' }).click();
    await expect(bolum.getByRole('button', { name: 'Siparis tüm önerileri uygula' })).toHaveText('Tümünü uygula (0)');
    await expect(page.locator('.alan-satiri .alan-adi').filter({ hasText: /^Ekstra/ })).toContainText('WSDL\'de yok');
    await expect(page.getByLabel('Siparis Input/Ekstra tablo sütunu ya da kural')).toHaveValue('yeni:Siparis\u0001Ekstra');
    await expect(page.getByLabel('Siparis Input/Channel zorunlu')).toBeChecked();
    // 390 px: taşma yok.
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ileri.click();

    // Özet: yeni tablolar ve örnek sayısı; kayıt.
    const ozet = page.locator('.ozet-listesi');
    await expect(ozet).toContainText('Örnek istekler');
    await expect(ozet).toContainText('Siparis: 2');
    await expect(ozet.locator('.yeni-tablolar')).toContainText('Siparis');
    await expect(ozet.getByLabel('Siparis tablosu ne yapılsın')).toHaveValue('yeni');
    await expect(ozet).toContainText('Gizli sütun boş açılır');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[0-9a-f-]{36}$/);
    expect(hatalar).toEqual([]);
    await baglam.close();

    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    const s = servisler.find((x: Nesne) => x.anahtar === 'analiz-servisi');
    servisId = s.id;
    const a = s.ayarlar;
    // Örnekler saklandı (görünümde gizli değer maskeli; saklanan değer maskesiz — kayıt sonrası analizde kullanılır).
    expect(a.ornekIstekler.Siparis.map((x: Nesne) => [x.ad, x.kaynak])).toEqual([['Bireysel', 'elle'], ['Kurumsal', 'elle']]);
    expect(a.ornekIstekler.Siparis[0].govde).toContain('<Password>••••••</Password>');
    expect(a.alanBaglari.Siparis['Input/ClientType']).toEqual({ tablo: tipId, sutun: 'Kod' });
    expect(a.alanBaglari.Siparis['Input/Channel']).toEqual({ tablo: girisId, sutun: 'Channel' });
    expect(a.alanKurallari.Siparis['Input/IdentityNumber']).toEqual({ gizli: true });
    expect(a.ekAlanlar.Siparis).toEqual([{ yol: 'Input/Ekstra', tip: 'metin' }]);
    expect(a.alanZorunluluklari.Siparis).toEqual(expect.arrayContaining(['Input/Channel', 'Input/Ekstra', 'Input/ClientType']));
    expect(a.alanVarsayilanlari.Siparis['Input/IsGiftWrap']).toEqual({ kaynak: 'nil' });
    expect(Object.values(a.analizKararlari.Siparis)).toContain('uygulandi');
    expect(a.ornekFarklari.Siparis.map((f: Nesne) => f.yol)).toEqual(['Input/IdentityNumber', 'Input/CreditCard/Installment']);
    // Yeni tablo yazıldı: satır = örnek adı; gizli sütun (kimlik numarası) boş; Ekstra bu tabloya bağlı.
    const { tablolar } = await basarili(`/platform/tablolar?projeId=${projeId}`);
    const yeni = tablolar.find((t: Nesne) => t.ad === 'Siparis');
    expect(yeni.sutunlar.map((c: Nesne) => [c.ad, c.gizli])).toEqual(expect.arrayContaining([['Ekstra', false], ['IdentityNumber', true]]));
    expect(yeni.satirlar.map((r: Nesne) => [r.ad, r.degerler.Ekstra])).toEqual([['Bireysel', 'E1'], ['Kurumsal', 'E2']]);
    expect(yeni.satirlar.every((r: Nesne) => r.doluGizli.length === 0)).toBe(true);
    expect(a.alanBaglari.Siparis['Input/Ekstra']).toEqual({ tablo: yeni.id, sutun: 'Ekstra' });
    // Analiz boyunca servise istek gitmedi (yalnız Denetle'deki WSDL isteği).
    expect(soap.istekler.length).toBe(denetimSonrasi);
  });

  test('kayıtlı servis: "Servisi analiz et" — kayıtlı örnekler gelir, yalnız yeni öneriler sorulur, Yoksay hatırlanır, istek yok', async () => {
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
    await expect(bolum.locator('.ornek-listesi li')).toHaveCount(2);
    await expect(bolum.locator('.ornek-listesi')).toContainText('Bireysel');
    await expect(bolum.locator('.ornek-listesi')).not.toContainText('ornek-parola');
    // Önceden uygulanan / yoksayılan öneriler yeniden sorulmaz (yalnız ek kanıt kutuları ve örnekler).
    await expect(bolum).toContainText('2 örnek analiz edildi');
    await expect(bolum.getByRole('button', { name: 'Siparis tüm önerileri uygula' })).toHaveText('Tümünü uygula (0)');
    // Yeni örnek: yalnız yeni öneriler (Username artık 2/3 → isteğe bağlı).
    await bolum.getByRole('button', { name: 'Gövde XML ekle' }).click();
    await bolum.getByLabel('Siparis örnek adı').fill('Kısa');
    await bolum.getByLabel('Siparis örnek gövdesi').fill(zarf('<Channel>77</Channel><Password>ornek-parola-3</Password><ClientType>O</ClientType><Ekstra>E3</Ekstra>'));
    await bolum.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(bolum).toContainText('3 örnek analiz edildi');
    const kullaniciSatiri = page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^Username/ }) });
    await expect(kullaniciSatiri.locator('.analiz-onerisi[data-tur="zorunlu"]')).toContainText('2/3 örnekte dolu');
    await expect(page.locator('.analiz-onerisi[data-tur="gizli"]')).toHaveCount(0);
    await expect(page.locator('.analiz-onerisi[data-tur="tabloBagi"]')).toHaveCount(0);
    if (GORUNTU) await goruntu(page, 'servis-analiz-1440.png', bolum);
    await tasmaYok(page);
    await kullaniciSatiri.getByRole('button', { name: 'Yoksay: Input/Username — İsteğe bağlı' }).click();
    await expect(page.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi');
    const a = (await servis()).ayarlar;
    expect(a.ornekIstekler.Siparis.map((x: Nesne) => x.ad)).toEqual(['Bireysel', 'Kurumsal', 'Kısa']);
    expect(Object.entries(a.analizKararlari.Siparis).filter(([, v]) => v === 'yoksayildi').map(([k]) => k)).toEqual(expect.arrayContaining([expect.stringContaining('zorunlu|Input/Username|false')]));
    expect(a.alanZorunluluklari.Siparis).toContain('Input/Username');
    // Kayıtta maskeli değer saklanan değerle geri yazıldı (görünüm yine maskeli).
    expect(a.ornekIstekler.Siparis[0].govde).toContain('<Password>••••••</Password>');
    // Yeniden açınca: Yoksay hatırlanır.
    await page.reload();
    await page.getByRole('button', { name: 'Siparis metodu' }).click();
    await expect(page.getByRole('region', { name: 'Siparis örnek istekleri' })).toContainText('3 örnek analiz edildi');
    await expect(page.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^Username/ }) }).locator('.analiz-onerisi')).toHaveCount(0);
    // Ek kanıt kutusu: kayıtlı senaryo yok → kapalı.
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
