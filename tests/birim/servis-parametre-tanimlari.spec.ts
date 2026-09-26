// KORUMA TESTLERİ — servis değer listeleri (Ayarlar > Test verisi > Servis parametreleri): bir alanın alabileceği değerler
// (liste / evet-hayır / test verisinden / serbest), ad tekilliği, servisin metot tablosunda alana bağlama (alanListeleri;
// adı aynı liste kendiliğinden, "yok" / parametre ad eşleşmesini kapatır), "+ Yeni" ile WSDL önerisinden liste, anında kayıt
// ve senaryo düzenleyicide listeden seçim. Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu; şirket sitesine istek yoktur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adlaBul, alanListesi, listedeMi, tanimDegerleri, wsdlOnerisi, type ParametreTanimi } from '../../scripts/platform/servisler/parametre-tanimlari.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test('liste çözümü: açık bağlantı; "" = yok; yoksa adı aynı liste (parametre bağlıysa ad eşleşmesi yok); değerler ve WSDL önerisi', () => {
  const listeler: ParametreTanimi[] = [
    { id: 'a', ad: 'IsTestMode', tur: 'mantiksal', degerler: [{ deger: 'true', aciklama: 'Test' }] },
    { id: 'c', ad: 'Acente kanalları', tur: 'test_verisi', kaynak: { turId: 't1', alan: 'kanal' } }
  ];
  expect(adlaBul(listeler, 'ISTESTMODE')?.id).toBe('a');
  expect(alanListesi(listeler, undefined, 'Input/IsTestMode', 'IsTestMode')?.id).toBe('a');
  expect(alanListesi(listeler, { 'Input/IsTestMode': '' }, 'Input/IsTestMode', 'IsTestMode')).toBeNull();
  expect(alanListesi(listeler, { 'Input/Channel': 'c' }, 'Input/Channel', 'Channel')?.id).toBe('c');
  expect(alanListesi(listeler, {}, 'Input/IsTestMode', 'IsTestMode', true)).toBeNull();
  expect(alanListesi(listeler, { 'Input/X': 'silinmis' }, 'Input/X', 'IsTestMode')).toBeNull();
  expect(tanimDegerleri(listeler[0])).toEqual([{ deger: 'true', aciklama: 'Test' }, { deger: 'false', aciklama: 'Hayır' }]);
  const profiller = [
    { turId: 't1', ad: 'Acente A', degerler: { kanal: '100', kullanici: { dolu: true, maske: '••' } } },
    { turId: 't1', ad: 'Acente B', degerler: { kanal: 100 } },
    { turId: 't1', ad: 'Acente C', degerler: { kanal: '200' } },
    { turId: 't2', ad: 'Başka', degerler: { kanal: '999' } }
  ];
  expect(tanimDegerleri(listeler[1], profiller)).toEqual([{ deger: '100', aciklama: 'Acente A, Acente B' }, { deger: '200', aciklama: 'Acente C' }]);
  expect(wsdlOnerisi({ secenekler: ['O', 'T'] })).toEqual({ tur: 'liste', degerler: [{ deger: 'O' }, { deger: 'T' }] });
  expect(wsdlOnerisi({ tip: 'mantiksal' })).toEqual({ tur: 'mantiksal', degerler: [] });
  expect(wsdlOnerisi({ tip: 'metin' })).toBeNull();
  expect(listedeMi([{ deger: '1' }], '2')).toBe(false);
  expect(listedeMi([], 'her şey')).toBe(true);
});

test.describe('servis değer listeleri uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Tanim-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let s1 = '';
  let girisTuru = '';
  const listeId: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const hatali = async (yol: string, govde: Nesne, mesaj: RegExp) => { const y = await api(yol, govde); expect(y.basarili).toBe(false); expect(String(y.mesaj)).toMatch(mesaj); };
  const listeler = async () => ((await basarili(`/platform/servis-parametre-tanimlari?projeId=${projeId}`)).tanimlar as Nesne[]);
  const ayar = async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${s1}`)).servis.ayarlar;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-tanim-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Tanım Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    s1 = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Servis girişi', alanlar: [{ ad: 'kanal', hassas: false }, { ad: 'kullanici', hassas: true }] });
    girisTuru = String(((await basarili(`/platform/test-verisi-turleri?projeId=${projeId}`)).turler as Nesne[]).find((t) => t.ad === 'Servis girişi')?.id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: girisTuru, ad: 'Acente A', degerler: { kanal: '100', kullanici: 'gizli-a' } });
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: girisTuru, ad: 'Acente B', degerler: { kanal: '200', kullanici: 'gizli-b' } });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('kayıt kuralları: ad tekil; hassas alan kaynak olamaz; liste boş / tekrarlı olamaz; bağlantı doğrulanır', async () => {
    listeId.IsSkiing = String((await basarili('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'IsSkiing', tur: 'mantiksal', varsayilan: 'false', aciklama: 'Kayak teminatı', degerler: [{ deger: 'true', aciklama: 'Kayak var' }] })).id);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'isskiing', tur: 'mantiksal' }, /zaten var/);
    listeId.Channel = String((await basarili('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'Channel', tur: 'liste', degerler: [{ deger: '9' }] })).id);
    listeId.Kanal = String((await basarili('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'Acente kanalları', tur: 'test_verisi', kaynak: { turId: girisTuru, alan: 'kanal' }, varsayilan: '200' })).id);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'Username', tur: 'test_verisi', kaynak: { turId: girisTuru, alan: 'kullanici' } }, /hassas/);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'PrintType', tur: 'liste', degerler: [] }, /en az bir değer/);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'PrintType', tur: 'liste', degerler: [{ deger: '1' }, { deger: '1' }] }, /iki kez/);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'A<b>', tur: 'serbest' }, /geçersiz/);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: '  ', tur: 'serbest' }, /boş olamaz/);
    await hatali('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'X', tur: 'liste', degerler: [{ deger: '1' }], varsayilan: '9', elleYazilabilir: false }, /listede yok/);
    expect((await listeler()).map((t) => t.ad)).toEqual(['Acente kanalları', 'Channel', 'IsSkiing']);
    const bozuk = await api('/platform/servis/kaydet', { projeId, id: s1, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanListeleri: { Teklif: { 'Input/Channel': 'bozuk id!' } } });
    expect(bozuk.basarili).toBe(false);
    expect(JSON.stringify(await listeler())).not.toContain('gizli-a');
  });

  test('arayüz: Test verisi > Servis parametreleri sekmesinde değer listesi eklenir (servis seçimi yok)', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    await page.getByRole('tab', { name: 'Servis parametreleri' }).click();
    const tablo = page.locator('.tanim-tablosu');
    await expect(tablo.locator('tr[data-tanim]')).toHaveCount(3);
    await expect(tablo.locator('tr').filter({ hasText: 'Acente kanalları' })).toContainText('100 — Acente A');
    await page.getByRole('button', { name: '+ Parametre ekle' }).click();
    const d = page.getByRole('dialog');
    await expect(d.getByText('Kullanılacağı servisler')).toHaveCount(0);
    await d.getByLabel('Parametre adı').fill('Installment');
    await d.getByLabel('Açıklama', { exact: true }).fill('Taksit sayısı');
    await d.getByLabel('1. değer', { exact: true }).fill('1');
    await d.getByLabel('1. değerin açıklaması').fill('Peşin');
    await d.getByRole('button', { name: '+ Değer ekle' }).click();
    await d.getByLabel('2. değer', { exact: true }).fill('3');
    await d.getByLabel('Varsayılan değer').selectOption('1');
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
    await expect(tablo.locator('tr').filter({ hasText: 'Installment' })).toContainText('1 — Peşin');
    const t = (await listeler()).find((x) => x.ad === 'Installment');
    expect(t).toMatchObject({ tur: 'liste', varsayilan: '1', aciklama: 'Taksit sayısı', degerler: [{ deger: '1', aciklama: 'Peşin' }, { deger: '3' }] });
    listeId.Installment = String(t?.id);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: metot tablosunda tek "Değer kaynağı" sütunu; ad eşleşmesi, başka listeye bağlama, "yok", "+ Yeni" (WSDL önerisi); anında kayıt', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${s1}/parametreler`);
    await expect(page.getByRole('heading', { name: 'Parametreler ve alabileceği değerler' })).toHaveCount(0);
    const teklif = page.getByRole('button', { name: 'Teklif metodu' });
    await expect(teklif).toContainText('alanın değer kaynağı yok');
    await teklif.click();
    const kaynak = (ad: string) => page.getByLabel(`Teklif Input/${ad} değer kaynağı`);
    const satir = (ad: string) => page.locator('.metot-cercevesi .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    // Adı aynı liste kendiliğinden bağlı.
    await expect(kaynak('IsSkiing')).toHaveValue(`liste:${listeId.IsSkiing}`);
    await expect(satir('IsSkiing')).toContainText('true — Kayak var');
    await expect(kaynak('Channel')).toHaveValue(`liste:${listeId.Channel}`);
    // Başka listeye bağla (ad tutmak zorunda değil).
    await kaynak('Channel').selectOption(`liste:${listeId.Kanal}`);
    await expect(satir('Channel')).toContainText('200 — Acente B');
    // "Yok": ad eşleşmesini kapatır.
    await page.getByLabel('Teklif Input/CreditCard/Installment değer kaynağı').selectOption('');
    // "+ Yeni": WSDL önerisiyle dolu pencere; kaydedince alana bağlanır.
    await expect(satir('ClientType').locator('.oneri-degerleri')).toContainText('O');
    await satir('ClientType').getByRole('button', { name: 'Yeni değer listesi: ClientType' }).click();
    const d = page.getByRole('dialog');
    await expect(d.getByLabel('Parametre adı')).toHaveValue('ClientType');
    await expect(d.getByLabel('1. değer', { exact: true })).toHaveValue('O');
    await expect(d.getByLabel('2. değer', { exact: true })).toHaveValue('T');
    await d.getByLabel('1. değerin açıklaması').fill('Özel');
    await d.getByLabel('2. değerin açıklaması').fill('Tüzel');
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
    await expect(satir('ClientType')).toContainText('O — Özel');
    listeId.ClientType = String((await listeler()).find((x) => x.ad === 'ClientType')?.id);
    await expect(kaynak('ClientType')).toHaveValue(`liste:${listeId.ClientType}`);
    // Süzgeç: yalnız değer kaynağı olmayanlar.
    await page.getByLabel('Teklif yalnız değer kaynağı olmayanlar').check();
    await expect(satir('IsSkiing')).toHaveCount(0);
    await expect(satir('Installment')).toHaveCount(1);
    await page.getByLabel('Teklif yalnız değer kaynağı olmayanlar').uncheck();
    // "Alanları kaydet" yok: bağlantılar ve zorunluluk anında yazılır.
    await expect(page.getByRole('button', { name: 'Alanları kaydet' })).toHaveCount(0);
    await page.getByLabel('Teklif Input/CitizenshipNumber zorunlu').check();
    await expect.poll(async () => (await ayar()).alanListeleri?.Teklif).toEqual({
      'Input/Channel': listeId.Kanal, 'Input/CreditCard/Installment': '', 'Input/ClientType': listeId.ClientType
    });
    await expect.poll(async () => (await ayar()).alanZorunluluklari?.Teklif).toContain('Input/CitizenshipNumber');
    await expect(page.locator('.kayit-durumu')).toContainText('Kaydedildi');
    await page.reload();
    await page.getByRole('button', { name: 'Teklif metodu' }).click();
    await expect(kaynak('Channel')).toHaveValue(`liste:${listeId.Kanal}`);
    await expect(page.getByLabel('Teklif Input/CreditCard/Installment değer kaynağı')).toHaveValue('');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: senaryo düzenleyicide bağlı alanın değeri listeden seçilir; listenin varsayılanıyla açılır; liste dışı değer uyarılır', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${s1}/senaryo/yeni`);
    const satirB = (ad: string) => page.locator('.alan-formu .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    // IsSkiing: adı aynı liste (varsayılan false) → yeni senaryoda dolu.
    await expect(satirB('IsSkiing').getByLabel('IsSkiing değer kaynağı')).toHaveValue('sabit');
    await expect(satirB('IsSkiing').getByLabel('IsSkiing', { exact: true })).toHaveValue('false');
    // Channel: "Acente kanalları" listesine bağlı (varsayılan 200).
    const kanal = satirB('Channel').getByLabel('Channel', { exact: true });
    await expect(kanal).toHaveValue('200');
    await expect(kanal.locator('option')).toHaveText(['—', '100 — Acente A', '200 — Acente B', 'Elle yaz…']);
    await kanal.selectOption('__elle');
    await satirB('Channel').getByLabel('Channel', { exact: true }).fill('555');
    await expect(satirB('Channel')).toContainText('Listede yok');
    // ClientType: "+ Yeni" ile oluşturulan liste.
    await satirB('ClientType').getByLabel('ClientType değer kaynağı').selectOption('sabit');
    await expect(satirB('ClientType').getByLabel('ClientType', { exact: true }).locator('option')).toHaveText(['—', 'O — Özel', 'T — Tüzel', 'Elle yaz…']);
    // Installment: "yok" bağlandı → liste yok, düz giriş.
    await satirB('Installment').getByLabel('Installment değer kaynağı').selectOption('sabit');
    await expect(satirB('Installment').locator('input[aria-label="Installment"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    const govde = await page.getByLabel('İstek gövdesi (SOAP zarfı)').inputValue();
    expect(govde).toContain('<IsSkiing>false</IsSkiing>');
    expect(govde).toContain('<Channel>555</Channel>');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: gövdede (XML) yazılan, bağlı listede olmayan değer "Listeye ekle" ile listeye eklenir (alan satırından; toplu düğme de var)', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${s1}/senaryo/yeni`);
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    // ClientType "liste" türü (O / T) → X eklenebilir; Channel "test verisinden" → eklenmez (profil eklenir); Installment bağlı değil.
    await page.getByLabel('İstek gövdesi (SOAP zarfı)').fill('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Teklif xmlns="Ornek"><Input>'
      + '<Channel>777</Channel><CreditCard><Installment>7</Installment></CreditCard><ClientType>X</ClientType></Input></Teklif></s:Body></s:Envelope>');
    await page.getByRole('tab', { name: 'Alanlar' }).click();
    const kutu = page.locator('.liste-disi');
    await expect(kutu).toContainText('1 değer bağlı değer listelerinde yok');
    await expect(kutu).toContainText('ClientType = X → ClientType');
    await expect(kutu.getByRole('button', { name: 'Hepsini listelere ekle' })).toBeVisible();
    const satirB = (ad: string) => page.locator('.alan-formu .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(satirB('ClientType').getByRole('button', { name: 'ClientType değerini listeye ekle' })).toBeVisible();
    await expect(satirB('Channel').getByRole('button', { name: 'Channel değerini listeye ekle' })).toBeHidden();
    await satirB('ClientType').getByRole('button', { name: 'ClientType değerini listeye ekle' }).click();
    await expect.poll(async () => (await listeler()).find((x) => x.ad === 'ClientType')?.degerler.map((d: Nesne) => d.deger)).toEqual(['O', 'T', 'X']);
    await expect(kutu).toHaveCount(0);
    await expect(satirB('ClientType').getByLabel('ClientType', { exact: true })).toHaveValue('X');
    await expect(satirB('ClientType')).not.toContainText('Listede yok');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
