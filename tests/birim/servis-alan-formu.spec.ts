// KORUMA TESTLERİ — servis senaryosu alan formu: WSDL şemasından operasyon alanları (wsdl-semasi.mjs), form ↔ gövde
// dönüşümü (servis-govdesi.mjs), erişim kontrolünde şemanın saklanması, alan varsayılanları ve arayüzde form ile senaryo
// oluşturma. Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu; şirket sitesine istek yoktur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baslangicDegerleri, govdeCoz, govdeUret, sabitDegerUyarisi, type AlanDegeri } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test('WSDL şeması: kalıtım, iç içe grup, zorunluluk, nillable, tip ve seçenek listesi; SOAPAction ve kök öğe', () => {
  const s = wsdlSemalari(WSDL);
  expect(Object.keys(s)).toEqual(['Teklif', 'Onayla']);
  expect(s.Teklif).toMatchObject({ ad: 'Teklif', eylem: 'Ornek/Teklif', kok: 'Teklif', ns: 'Ornek' });
  const girdi = s.Teklif.alanlar[0];
  expect(girdi.ad).toBe('Input');
  expect(girdi.cocuklar?.map((a) => a.ad)).toEqual(['Channel', 'Username', 'Password', 'CitizenshipNumber', 'BeginDate', 'EndDate', 'IsSkiing', 'CreditCard', 'ClientType']);
  const alan = (ad: string) => girdi.cocuklar?.find((a) => a.ad === ad);
  expect(alan('BeginDate')).toEqual({ ad: 'BeginDate', zorunlu: true, tip: 'tarihSaat' });
  expect(alan('IsSkiing')).toEqual({ ad: 'IsSkiing', zorunlu: true, nillable: true, tip: 'mantiksal' });
  expect(alan('ClientType')).toEqual({ ad: 'ClientType', zorunlu: true, tip: 'metin', secenekler: ['O', 'T'] });
  expect(alan('CreditCard')?.cocuklar).toEqual([{ ad: 'CardNumber', tip: 'metin' }, { ad: 'Installment', zorunlu: true, tip: 'tamsayi' }]);
  expect(s.Onayla.alanlar).toEqual([{ ad: 'TeklifNo', zorunlu: true, tip: 'tamsayi' }]);
  expect(wsdlSemalari('bozuk <xml')).toEqual({});
});

test('form ↔ gövde: üretilen gövde geri çözülür; boş / nil / gönderme / parametre / sabit (kaçışlı); grup yalnız doluysa yazılır', () => {
  const sema = wsdlSemalari(WSDL).Teklif;
  const bas = baslangicDegerleri(sema, { 'Input/CitizenshipNumber': { kaynak: 'parametre', deger: 'SIGORTALI_TC' } });
  expect(bas['Input/CitizenshipNumber']).toEqual({ kaynak: 'parametre', deger: 'SIGORTALI_TC' });
  expect(bas['Input/IsSkiing']).toEqual({ kaynak: 'nil' });
  expect(bas['Input/BeginDate']).toEqual({ kaynak: 'bos' });
  expect(bas['Input/Channel']).toEqual({ kaynak: 'gonderme' });
  const degerler: Record<string, AlanDegeri> = { ...bas, 'Input/Channel': { kaynak: 'parametre', deger: 'CHANNEL' }, 'Input/ClientType': { kaynak: 'sabit', deger: 'A&B <x>' } };
  const govde = govdeUret(sema, degerler);
  expect(govde).toContain('<Teklif xmlns="Ornek">');
  expect(govde).toContain('<Channel>${CHANNEL}</Channel>');
  expect(govde).toContain('<IsSkiing xsi:nil="true"/>');
  expect(govde).toContain('<ClientType>A&amp;B &lt;x&gt;</ClientType>');
  expect(govde).not.toContain('CreditCard');
  expect(govde).not.toContain('<Username');
  const c = govdeCoz(govde, sema);
  expect(c.uyumsuz).toEqual([]);
  expect(c.degerler).toEqual(degerler);
  // Kart altında bir alan yazılınca grup da yazılır.
  expect(govdeUret(sema, { ...degerler, 'Input/CreditCard/Installment': { kaynak: 'sabit', deger: '0' } })).toMatch(/<CreditCard>\s*<Installment>0<\/Installment>\s*<\/CreditCard>/);
});

test('gövde formda temsil edilemiyorsa neden bildirilir (şemada olmayan / tekrar eden öğe, farklı kök, bozuk XML)', () => {
  const sema = wsdlSemalari(WSDL).Teklif;
  const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${ic}</s:Body></s:Envelope>`;
  expect(govdeCoz(zarf('<Teklif xmlns="Ornek"><Input><Extra>1</Extra></Input></Teklif>'), sema).uyumsuz).toEqual(['"Input/Extra" şemada yok.']);
  expect(govdeCoz(zarf('<Teklif><Input><Channel>1</Channel><Channel>2</Channel></Input></Teklif>'), sema).uyumsuz[0]).toContain('birden çok');
  expect(govdeCoz(zarf('<Onayla/>'), sema).uyumsuz[0]).toContain('"Teklif"');
  expect(govdeCoz('<a><b></a>', sema).uyumsuz[0]).toContain('XML');
  // SoapUI tarzı (önekli zarf, xsi:nil, satır boşlukları) sorunsuz çözülür.
  const soapui = zarf('\n  <Teklif xmlns="Ornek">\n    <Input>\n      <IsSkiing xsi:nil="true"/>\n      <CitizenshipNumber>000</CitizenshipNumber>\n    </Input>\n  </Teklif>\n');
  const c = govdeCoz(soapui, sema);
  expect(c.uyumsuz).toEqual([]);
  expect(c.degerler['Input/IsSkiing']).toEqual({ kaynak: 'nil' });
  expect(c.degerler['Input/CitizenshipNumber']).toEqual({ kaynak: 'sabit', deger: '000' });
});

test('tipe göre sabit değer uyarısı (yer tutucu her zaman geçer)', () => {
  expect(sabitDegerUyarisi({ ad: 'A', tip: 'tamsayi' }, '12')).toBeNull();
  expect(sabitDegerUyarisi({ ad: 'A', tip: 'tamsayi' }, '1.5')).toContain('Tam sayı');
  expect(sabitDegerUyarisi({ ad: 'A', tip: 'tarihSaat' }, '2026-01-02T03:04:05')).toBeNull();
  expect(sabitDegerUyarisi({ ad: 'A', tip: 'mantiksal' }, 'evet')).toContain('true');
  expect(sabitDegerUyarisi({ ad: 'A', secenekler: ['O', 'T'] }, 'X')).toContain('O, T');
  expect(sabitDegerUyarisi({ ad: 'A', tip: 'tarih' }, '${BEGIN_DATE}')).toBeNull();
});

// ---- Sunucu + arayüz ------------------------------------------------------------------------------------------------------

test.describe('alan formu uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Alan-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let canli = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-alan-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Alan Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true })).ortam.id);
    canli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: soap.adres, canli: true })).ortam.id);
    await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo', servisParametreleri: [{ ad: 'SIGORTALI_TC', rol: 'sigortali' }] }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('erişim kontrolü operasyon şemalarını saklar; şema yenileme yalnız TEST; alan varsayılanı doğrulanır', async () => {
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(Object.keys(s.ayarlar.operasyonSemalari)).toEqual(['Teklif', 'Onayla']);
    const red = await api('/platform/servis/sema/yenile', { projeId, servisId, ortamId: canli });
    expect(red.basarili).toBe(false);
    expect(await basarili('/platform/servis/sema/yenile', { projeId, servisId, ortamId: testOrtami })).toMatchObject({ durumKodu: 200, operasyonSayisi: 2, alanliOperasyonlar: ['Teklif', 'Onayla'] });
    const bozuk = await api('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanVarsayilanlari: { Teklif: { 'Input/A': { kaynak: 'uydurma' } } } });
    expect(bozuk.basarili).toBe(false);
  });

  test('arayüz: yeni senaryo alan formundan oluşturulur (parametre, evet/hayır, liste); ★ varsayılan sonraki senaryoda dolu gelir; XML sekmesi', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    await expect(form).toBeVisible();
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(satir('CitizenshipNumber')).toBeVisible();
    await satir('CitizenshipNumber').getByLabel('CitizenshipNumber değer kaynağı').selectOption('parametre');
    await satir('CitizenshipNumber').getByLabel('CitizenshipNumber parametresi').selectOption('SIGORTALI_TC');
    await satir('IsSkiing').getByLabel('IsSkiing değer kaynağı').selectOption('sabit');
    await satir('IsSkiing').getByLabel('IsSkiing', { exact: true }).selectOption('true');
    await satir('ClientType').getByLabel('ClientType değer kaynağı').selectOption('sabit');
    await satir('ClientType').getByLabel('ClientType', { exact: true }).selectOption('O');
    await satir('BeginDate').getByLabel('BeginDate değer kaynağı').selectOption('sabit');
    await satir('BeginDate').getByLabel('BeginDate', { exact: true }).fill('2026-01-02T03:04:05');
    // ★: CitizenshipNumber için servis varsayılanı.
    await satir('CitizenshipNumber').getByRole('button', { name: 'CitizenshipNumber için servis varsayılanı' }).click();
    await expect(satir('CitizenshipNumber').getByRole('button', { name: 'CitizenshipNumber için servis varsayılanı' })).toHaveText('★');
    // XML sekmesine geçip dönünce değerler korunur.
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    await expect(page.getByLabel('İstek gövdesi (SOAP zarfı)')).toHaveValue(/<CitizenshipNumber>\$\{SIGORTALI_TC\}<\/CitizenshipNumber>/);
    await page.getByRole('tab', { name: 'Alanlar' }).click();
    await expect(satir('IsSkiing').getByLabel('IsSkiing', { exact: true })).toHaveValue('true');
    await page.getByLabel('Başlık').fill('Formdan senaryo');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);

    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'Formdan senaryo');
    expect(kayit.icerik.govde).toContain('<CitizenshipNumber>${SIGORTALI_TC}</CitizenshipNumber>');
    expect(kayit.icerik.govde).toContain('<IsSkiing>true</IsSkiing>');
    expect(kayit.icerik.govde).toContain('<ClientType>O</ClientType>');
    expect(kayit.icerik.govde).toContain('<BeginDate>2026-01-02T03:04:05</BeginDate>');
    expect(d.servis.ayarlar.alanVarsayilanlari).toEqual({ Teklif: { 'Input/CitizenshipNumber': { kaynak: 'parametre', deger: 'SIGORTALI_TC' } } });

    // Kayıtlı senaryo formda açılır; yeni senaryoda varsayılan dolu gelir.
    await page.reload();
    await expect(satir('ClientType').getByLabel('ClientType', { exact: true })).toHaveValue('O');
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await expect(satir('CitizenshipNumber').getByLabel('CitizenshipNumber parametresi')).toHaveValue('SIGORTALI_TC');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: tuş tuş yazarken odak kaybolmaz (sabit değer, alan arama); parametrenin yanında test verisi profili seçilir', async () => {
    test.setTimeout(60_000);
    const turler = await basarili(`/platform/test-verisi-turleri?projeId=${projeId}`);
    const turId = String(turler.turler.find((t: Nesne) => t.ad === 'Kişi').id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'k1', degerler: { tcKimlikNo: '11111111110' } });
    const k2 = String((await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'k2', degerler: { tcKimlikNo: '22222222220' } })).profil.id);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });

    // Sabit değer: harf harf yazılır, kutu odakta kalır, değer eksiksiz.
    await satir('Channel').getByLabel('Channel değer kaynağı').selectOption('sabit');
    const kanal = satir('Channel').getByLabel('Channel', { exact: true });
    await kanal.click();
    await kanal.pressSequentially('30447', { delay: 20 });
    await expect(kanal).toHaveValue('30447');
    await expect(kanal).toBeFocused();

    // Alan arama: harf harf yazılır, kutu odakta kalır, tablo süzülür.
    const ara = page.getByLabel('Alan ara');
    await ara.click();
    await ara.pressSequentially('Citiz', { delay: 20 });
    await expect(ara).toHaveValue('Citiz');
    await expect(ara).toBeFocused();
    await expect(form.locator('.alan-satiri')).toHaveCount(1);
    await ara.fill('');

    // Parametre + değer listesi: SIGORTALI_TC → profiller (hassas alan değeri gösterilmez, yalnız ad).
    await satir('CitizenshipNumber').getByLabel('CitizenshipNumber değer kaynağı').selectOption('parametre');
    await satir('CitizenshipNumber').getByLabel('CitizenshipNumber parametresi').selectOption('SIGORTALI_TC');
    const deger = satir('CitizenshipNumber').getByLabel('SIGORTALI_TC değeri');
    await expect(deger.locator('option')).toHaveText(['Servis varsayılanı (seçilmedi)', 'k1', 'k2']);
    await deger.selectOption({ label: 'k2' });
    await page.getByLabel('Başlık').fill('Profil seçili senaryo');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'Profil seçili senaryo');
    expect(kayit.icerik.veriProfilleri).toEqual({ [`${turId}:sigortali`]: k2 });
    expect(kayit.icerik.govde).toContain('<Channel>30447</Channel>');
    // Kayıtlı senaryo açılınca seçim görünür.
    await page.reload();
    await expect(satir('CitizenshipNumber').getByLabel('SIGORTALI_TC değeri')).toHaveValue(k2);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: kontroller VE listesi + "Şunlardan biri (VEYA)" grubu kaydedilir; Dene sonucu alt kontrolleri gösterir', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await page.getByLabel('Başlık').fill('VEYA senaryosu');
    // Varsayılan tek kontrol: SOAP zarfı (VE). İkinci kontrol VEYA grubu.
    await page.getByRole('button', { name: 'Kontrol ekle (VE)' }).click();
    await page.getByLabel('2. kontrol türü', { exact: true }).selectOption('veya');
    await page.getByLabel('2.1. kontrol değeri').fill('<Durum>HATA</Durum>');
    await page.getByLabel('2.2. kontrol değeri').fill('<Durum>OK</Durum>');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'VEYA senaryosu');
    expect(kayit.icerik.kontroller).toEqual([{ tur: 'soapYaniti' }, { tur: 'veya', alt: [{ tur: 'icerir', deger: '<Durum>HATA</Durum>' }, { tur: 'icerir', deger: '<Durum>OK</Durum>' }] }]);
    // Açılınca aynı yapı görünür.
    await page.reload();
    await expect(page.getByLabel('2. kontrol türü', { exact: true })).toHaveValue('veya');
    await expect(page.getByLabel('2.2. kontrol değeri')).toHaveValue('<Durum>OK</Durum>');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('canlı koşu işi: adımlar sırayla bildirilir, istek / yanıt tutulur; bekleyen istek Durdur ile kesilir', async () => {
    test.setTimeout(60_000);
    const kaydet = async (baslik: string, govde: string) => String((await basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik, icerik: { operasyon: 'Teklif', govde, kontroller: [{ tur: 'soapYaniti' }] } })).id);
    const hizli = await kaydet('Hızlı', '<a/>');
    const yavas = await kaydet('Yavaş', '<a>YAVAS</a>');
    const { is } = await basarili('/platform/servis/is/baslat', { projeId, servisId, ortamId: testOrtami, senaryoIdleri: [hizli, yavas] });
    const durum = async () => (await basarili(`/platform/servis/is?projeId=${projeId}&id=${is.id}`)).is as Nesne;
    // Yavaş senaryo cevap beklerken durdurulur.
    await expect.poll(async () => (await durum()).satirlar[1].olaylar.map((o: Nesne) => `${o.adim}:${o.durum}`), { timeout: 10_000 }).toContain('yanit:basladi');
    await basarili('/platform/servis/is/durdur', { projeId, id: is.id, senaryoId: yavas });
    await expect.poll(async () => (await durum()).bitti, { timeout: 10_000 }).toBe(true);
    const son = await durum();
    expect(son.satirlar[0]).toMatchObject({ baslik: 'Hızlı', durum: 'basarili' });
    expect(son.satirlar[0].olaylar.map((o: Nesne) => `${o.adim}:${o.durum}`)).toEqual([
      'hazirlik:basladi', 'hazirlik:tamam', 'gonderim:basladi', 'gonderim:tamam', 'yanit:basladi', 'yanit:tamam', 'kontroller:tamam']);
    expect(son.satirlar[0].istek).toContain('<a/>');
    expect(son.satirlar[0].yanit).toContain('<Durum>HATA</Durum>');
    expect(son.satirlar[1]).toMatchObject({ baslik: 'Yavaş', durum: 'durduruldu' });
    expect(son.satirlar[1].olaylar.at(-1)).toMatchObject({ adim: 'yanit', durum: 'hata', bilgi: { mesaj: 'Kullanıcı durdurdu.' } });
    // Sonuçlar raporlara da yazıldı; senaryonun son sonucu servis yanıtında.
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    expect(d.sonSonuclar[hizli]).toMatchObject({ durum: 'basarili' });
    expect(d.sonSonuclar[yavas]).toMatchObject({ durum: 'hata' });
  });

  test('arayüz: yeşil ▷ canlı paneli açar (adımlar, istek / yanıt); çoklu seçimle çalıştırma; Beklenen ve Son sonuç sütunları', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}`);
    const satir = (baslik: string) => page.locator('.servis-senaryo-tablosu tbody tr').filter({ has: page.getByRole('link', { name: baslik, exact: true }) });
    await expect(satir('VEYA senaryosu').locator('td.beklenen-hucresi')).toContainText('biri: "<Durum>HATA</Durum>" | "<Durum>OK</Durum>"');
    await expect(satir('Hızlı').locator('.son-sonuc')).toContainText('Başarılı');
    // ▷ → canlı panel: adımlar ve yanıt.
    await satir('Yavaş').getByRole('button', { name: 'Çalıştır: Yavaş' }).click();
    const panel = page.getByRole('region', { name: 'Servis koşu paneli' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.servis-adimlari li.suruyor')).toContainText('Cevap bekleniyor');
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 10_000 });
    await expect(panel.locator('.servis-adimlari')).toContainText('Cevap geldi (HTTP 200');
    await panel.getByText('Yanıt (HTTP 200)').click();
    await expect(panel.locator('pre').last()).toContainText('<Durum>HATA</Durum>');
    await panel.getByRole('button', { name: 'Paneli kapat' }).click();
    await expect(satir('Yavaş').locator('.son-sonuc')).toContainText('Başarılı');
    // Çoklu seçim.
    await satir('Hızlı').getByLabel('Seç: Hızlı').check();
    await satir('Formdan senaryo').getByLabel('Seç: Formdan senaryo').check();
    await page.getByRole('button', { name: 'Seçilenleri çalıştır (2)' }).click();
    await expect(panel.locator('.kosu-listesi li')).toHaveCount(2);
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 10_000 });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: senaryolar tablosunda "Koşuda" anahtarı (tek tek ve seçilenler için toplu)', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const dahiller = async () => ((await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[]).map((x) => x.kosuyaDahil);
    await page.goto(`/#/servisler/s/${servisId}`);
    const anahtar = page.getByRole('switch', { name: 'Koşuda: Formdan senaryo' });
    await expect(anahtar).toBeChecked();
    await anahtar.click();
    await expect.poll(async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar.find((x: Nesne) => x.baslik === 'Formdan senaryo').kosuyaDahil).toBe(false);
    await expect(page.locator('.servis-senaryo-tablosu tr.haric')).toContainText('hariç');
    // Toplu: görünenlerin hepsini seç → Koşuya ekle / Koşudan çıkar.
    await page.getByLabel('Görünen tüm senaryoları seç').check();
    const toplu = page.getByRole('toolbar', { name: 'Seçili senaryolar için işlemler' });
    await toplu.getByRole('button', { name: 'Koşuya ekle' }).click();
    await expect.poll(async () => (await dahiller()).every(Boolean)).toBe(true);
    await toplu.getByRole('button', { name: 'Koşudan çıkar' }).click();
    await expect.poll(async () => (await dahiller()).some(Boolean)).toBe(false);
    // Filtre: hepsi hariçken "Koşuda" süzgeci boş liste verir; arama süzer.
    await page.getByLabel('Koşuda', { exact: true }).selectOption('evet');
    await expect(page.getByText('Filtreyle eşleşen senaryo yok.')).toBeVisible();
    await page.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
    await page.getByLabel('Senaryo ara').fill('formdan');
    await expect(page.locator('.servis-senaryo-tablosu tbody tr')).toHaveCount(1);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: test verisi alanında servis → parametre seçilerek eşleme eklenir (rol addan tahmin edilir)', async () => {
    test.setTimeout(60_000);
    // Serviste eşlenmemiş bir parametre olsun.
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Ettiren', icerik: { operasyon: 'Teklif', govde: '<a>${SIGORTA_ETTIREN_TC}</a>', kontroller: [{ tur: 'soapYaniti' }] } });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    await page.getByRole('button', { name: 'Alanları düzenle' }).click();
    const editor = page.locator('.servis-parametre-editoru').first();
    await expect(editor.locator('.parametre-cipleri')).toContainText('SIGORTALI_TC');
    await editor.getByLabel('Servis', { exact: true }).selectOption({ label: 'Ornek' });
    await expect(editor.getByLabel('Parametre', { exact: true })).toBeEnabled();
    await editor.getByLabel('Parametre', { exact: true }).selectOption('SIGORTA_ETTIREN_TC');
    await expect(editor.getByLabel('Rol')).toHaveValue('ettiren');
    await editor.getByRole('button', { name: '+ Ekle' }).click();
    await expect(editor.locator('.parametre-cipleri')).toContainText('SIGORTA_ETTIREN_TC');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Test verisi türü kaydedildi.')).toBeVisible();
    const turler = await basarili(`/platform/test-verisi-turleri?projeId=${projeId}`);
    expect(turler.turler[0].alanlar[0].servisParametreleri).toEqual([{ ad: 'SIGORTALI_TC', rol: 'sigortali' }, { ad: 'SIGORTA_ETTIREN_TC', rol: 'ettiren' }]);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
