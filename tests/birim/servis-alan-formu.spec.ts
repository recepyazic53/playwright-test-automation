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
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test('WSDL şeması: kalıtım, iç içe grup, zorunluluk, nillable, tip ve seçenek listesi; SOAPAction ve kök öğe', () => {
  const s = wsdlSemalari(WSDL);
  expect(Object.keys(s)).toEqual(['Siparis', 'Onayla']);
  expect(s.Siparis).toMatchObject({ ad: 'Siparis', eylem: 'Ornek/Siparis', kok: 'Siparis', ns: 'Ornek' });
  const girdi = s.Siparis.alanlar[0];
  expect(girdi.ad).toBe('Input');
  expect(girdi.cocuklar?.map((a) => a.ad)).toEqual(['Channel', 'Username', 'Password', 'IdentityNumber', 'BeginDate', 'EndDate', 'IsGiftWrap', 'CreditCard', 'ClientType']);
  const alan = (ad: string) => girdi.cocuklar?.find((a) => a.ad === ad);
  expect(alan('BeginDate')).toEqual({ ad: 'BeginDate', zorunlu: true, tip: 'tarihSaat' });
  expect(alan('IsGiftWrap')).toEqual({ ad: 'IsGiftWrap', zorunlu: true, nillable: true, tip: 'mantiksal' });
  expect(alan('ClientType')).toEqual({ ad: 'ClientType', zorunlu: true, tip: 'metin', secenekler: ['O', 'T'] });
  expect(alan('CreditCard')?.cocuklar).toEqual([{ ad: 'CardNumber', tip: 'metin' }, { ad: 'Installment', zorunlu: true, tip: 'tamsayi' }]);
  expect(s.Onayla.alanlar).toEqual([{ ad: 'SiparisNo', zorunlu: true, tip: 'tamsayi' }]);
  expect(wsdlSemalari('bozuk <xml')).toEqual({});
});

test('form ↔ gövde: üretilen gövde geri çözülür; boş / nil / gönderme / parametre / sabit (kaçışlı); grup yalnız doluysa yazılır', () => {
  const sema = wsdlSemalari(WSDL).Siparis;
  const bas = baslangicDegerleri(sema, { 'Input/IdentityNumber': { kaynak: 'parametre', deger: 'MUSTERI_TC' } });
  expect(bas['Input/IdentityNumber']).toEqual({ kaynak: 'parametre', deger: 'MUSTERI_TC' });
  expect(bas['Input/IsGiftWrap']).toEqual({ kaynak: 'nil' });
  expect(bas['Input/BeginDate']).toEqual({ kaynak: 'bos' });
  expect(bas['Input/Channel']).toEqual({ kaynak: 'gonderme' });
  const degerler: Record<string, AlanDegeri> = { ...bas, 'Input/Channel': { kaynak: 'parametre', deger: 'CHANNEL' }, 'Input/ClientType': { kaynak: 'sabit', deger: 'A&B <x>' } };
  const govde = govdeUret(sema, degerler);
  expect(govde).toContain('<Siparis xmlns="Ornek">');
  expect(govde).toContain('<Channel>${CHANNEL}</Channel>');
  expect(govde).toContain('<IsGiftWrap xsi:nil="true"/>');
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
  const sema = wsdlSemalari(WSDL).Siparis;
  const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${ic}</s:Body></s:Envelope>`;
  expect(govdeCoz(zarf('<Siparis xmlns="Ornek"><Input><Extra>1</Extra></Input></Siparis>'), sema).uyumsuz).toEqual(['"Input/Extra" şemada yok.']);
  expect(govdeCoz(zarf('<Siparis><Input><Channel>1</Channel><Channel>2</Channel></Input></Siparis>'), sema).uyumsuz[0]).toContain('birden çok');
  expect(govdeCoz(zarf('<Onayla/>'), sema).uyumsuz[0]).toContain('"Siparis"');
  expect(govdeCoz('<a><b></a>', sema).uyumsuz[0]).toContain('XML');
  // SoapUI tarzı (önekli zarf, xsi:nil, satır boşlukları) sorunsuz çözülür.
  const soapui = zarf('\n  <Siparis xmlns="Ornek">\n    <Input>\n      <IsGiftWrap xsi:nil="true"/>\n      <IdentityNumber>000</IdentityNumber>\n    </Input>\n  </Siparis>\n');
  const c = govdeCoz(soapui, sema);
  expect(c.uyumsuz).toEqual([]);
  expect(c.degerler['Input/IsGiftWrap']).toEqual({ kaynak: 'nil' });
  expect(c.degerler['Input/IdentityNumber']).toEqual({ kaynak: 'sabit', deger: '000' });
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
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Alan Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    canli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: soap.adres, canli: true })).ortam.id);
    await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo', servisParametreleri: [{ ad: 'MUSTERI_TC', rol: 'musteri' }] }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('erişim kontrolü operasyon şemalarını saklar; şema yenileme CANLI ortamda yalnız açık onayla; alan varsayılanı doğrulanır', async () => {
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(Object.keys(s.ayarlar.operasyonSemalari)).toEqual(['Siparis', 'Onayla']);
    const red = await api('/platform/servis/sema/yenile', { projeId, servisId, ortamId: canli });
    expect(red).toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
    expect(await basarili('/platform/servis/sema/yenile', { projeId, servisId, ortamId: canli, canliOnay: true })).toMatchObject({ durumKodu: 200, operasyonSayisi: 2 });
    expect(await basarili('/platform/servis/sema/yenile', { projeId, servisId, ortamId: testOrtami })).toMatchObject({ durumKodu: 200, operasyonSayisi: 2, alanliOperasyonlar: ['Siparis', 'Onayla'] });
    const bozuk = await api('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanVarsayilanlari: { Siparis: { 'Input/A': { kaynak: 'uydurma' } } } });
    expect(bozuk.basarili).toBe(false);
  });

  test('arayüz: yeni senaryo alan formundan oluşturulur (tablodan, evet/hayır, liste); ★ varsayılan sonraki senaryoda dolu gelir; XML sekmesi', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    await expect(form).toBeVisible();
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(satir('IdentityNumber')).toBeVisible();
    // Bağlı olmayan alan da "Tablodan" seçilebilir: sütun seçilir (test verisi türü "Kişi" bir tablodur).
    await satir('IdentityNumber').getByLabel('IdentityNumber değer kaynağı').selectOption('tablo');
    await satir('IdentityNumber').getByLabel('IdentityNumber tablo sütunu').selectOption('Kişi.tcKimlikNo');
    await satir('IsGiftWrap').getByLabel('IsGiftWrap değer kaynağı').selectOption('sabit');
    await satir('IsGiftWrap').getByLabel('IsGiftWrap', { exact: true }).selectOption('true');
    await satir('ClientType').getByLabel('ClientType değer kaynağı').selectOption('sabit');
    await satir('ClientType').getByLabel('ClientType', { exact: true }).selectOption('O');
    await satir('BeginDate').getByLabel('BeginDate değer kaynağı').selectOption('sabit');
    await satir('BeginDate').getByLabel('BeginDate', { exact: true }).fill('2026-01-02T03:04:05');
    // ★: IdentityNumber için servis varsayılanı.
    await satir('IdentityNumber').getByRole('button', { name: 'IdentityNumber için servis varsayılanı' }).click();
    await expect(satir('IdentityNumber').getByRole('button', { name: 'IdentityNumber için servis varsayılanı' })).toHaveText('★');
    // XML sekmesine geçip dönünce değerler korunur.
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    await expect(page.getByLabel('İstek gövdesi (SOAP zarfı)')).toHaveValue(/<IdentityNumber>\$\{Kişi\.tcKimlikNo\}<\/IdentityNumber>/);
    await page.getByRole('tab', { name: 'Alanlar' }).click();
    await expect(satir('IsGiftWrap').getByLabel('IsGiftWrap', { exact: true })).toHaveValue('true');
    await page.getByLabel('Başlık').fill('Formdan senaryo');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);

    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'Formdan senaryo');
    expect(kayit.icerik.govde).toContain('<IdentityNumber>${Kişi.tcKimlikNo}</IdentityNumber>');
    expect(kayit.icerik.govde).toContain('<IsGiftWrap>true</IsGiftWrap>');
    expect(kayit.icerik.govde).toContain('<ClientType>O</ClientType>');
    expect(kayit.icerik.govde).toContain('<BeginDate>2026-01-02T03:04:05</BeginDate>');
    expect(d.servis.ayarlar.alanVarsayilanlari).toEqual({ Siparis: { 'Input/IdentityNumber': { kaynak: 'tablo', deger: 'Kişi.tcKimlikNo' } } });

    // Kayıtlı senaryo formda açılır; yeni senaryoda varsayılan dolu gelir.
    await page.reload();
    await expect(satir('ClientType').getByLabel('ClientType', { exact: true })).toHaveValue('O');
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await expect(satir('IdentityNumber').getByLabel('IdentityNumber değer kaynağı')).toHaveValue('tablo');
    await expect(satir('IdentityNumber')).toContainText('Kişi → tcKimlikNo');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: tuş tuş yazarken odak kaybolmaz (sabit değer, alan arama); tablodan seçilen değer senaryoya yazılır', async () => {
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
    await kanal.pressSequentially('11111', { delay: 20 });
    await expect(kanal).toHaveValue('11111');
    await expect(kanal).toBeFocused();

    // Alan arama: harf harf yazılır, kutu odakta kalır, tablo süzülür.
    const ara = page.getByLabel('Alan ara');
    await ara.click();
    await ara.pressSequentially('Identi', { delay: 20 });
    await expect(ara).toHaveValue('Identi');
    await expect(ara).toBeFocused();
    await expect(form.locator('.alan-satiri')).toHaveCount(1);
    await ara.fill('');

    // Tablodan: "Kişi" tablosunun satırlarındaki kimlik numaraları listelenir; seçilen değer senaryoya yazılır.
    await satir('IdentityNumber').getByLabel('IdentityNumber değer kaynağı').selectOption('tablo');
    const deger = satir('IdentityNumber').getByLabel('IdentityNumber', { exact: true });
    await expect(deger.locator('option')).toHaveText(['— seçilmedi (2 seçenek) —', '11111111110', '22222222220']);
    await deger.selectOption('22222222220');
    await page.getByLabel('Başlık').fill('Profil seçili senaryo');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'Profil seçili senaryo');
    expect(kayit.icerik.tabloSecimleri).toEqual({ [`${turId}|`]: { tcKimlikNo: '22222222220' } });
    expect(k2).toBeTruthy();
    expect(kayit.icerik.govde).toContain('<Channel>11111</Channel>');
    // Kayıtlı senaryo açılınca seçim görünür.
    await page.reload();
    await expect(satir('IdentityNumber').getByLabel('IdentityNumber', { exact: true })).toHaveValue('22222222220');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: kontroller satır başında VE / VEYA ile bağlanır; VEYA ile bağlı satırlar grup olarak kaydedilir ve öyle açılır', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await page.getByLabel('Başlık').fill('VEYA senaryosu');
    // Varsayılan tek kontrol: SOAP zarfı. 2. VE, 3. VEYA → SOAP zarfı ve (HATA ya da OK). Tür listesinde VEYA seçeneği yok.
    await expect(page.getByLabel('1. kontrol türü', { exact: true }).locator('option[value="veya"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Kontrol ekle' }).click();
    await page.getByRole('button', { name: 'Kontrol ekle' }).click();
    await page.getByLabel('2. kontrol değeri').fill('<Durum>HATA</Durum>');
    await page.getByLabel('3. kontrol değeri').fill('<Durum>OK</Durum>');
    await expect(page.getByLabel('2. bağlaç')).toHaveValue('VE');
    await page.getByLabel('3. bağlaç').selectOption('VEYA');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'VEYA senaryosu');
    expect(kayit.icerik.kontroller).toEqual([{ tur: 'soapYaniti' }, { tur: 'veya', alt: [{ tur: 'icerir', deger: '<Durum>HATA</Durum>' }, { tur: 'icerir', deger: '<Durum>OK</Durum>' }] }]);
    // Açılınca aynı yapı görünür.
    await page.reload();
    await expect(page.getByLabel('3. bağlaç')).toHaveValue('VEYA');
    await expect(page.getByLabel('2. bağlaç')).toHaveValue('VE');
    await expect(page.getByLabel('3. kontrol değeri')).toHaveValue('<Durum>OK</Durum>');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('canlı koşu işi: adımlar sırayla bildirilir, istek / yanıt tutulur; bekleyen istek Durdur ile kesilir', async () => {
    test.setTimeout(60_000);
    const kaydet = async (baslik: string, govde: string) => String((await basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik, icerik: { operasyon: 'Siparis', govde, kontroller: [{ tur: 'soapYaniti' }] } })).id);
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
    // Son sonuç ortam başına: nokta + ortam adı + simge ve tarih; tam metin aria-label'da.
    await expect(satir('Hızlı').locator('.son-sonuc')).toHaveAttribute('aria-label', /^TEST: Başarılı · /);
    await expect(satir('Hızlı').locator('.son-sonuc')).toContainText('TEST');
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
    await expect(satir('Yavaş').locator('.son-sonuc')).toHaveAttribute('aria-label', /^TEST: Başarılı · /);
    // Çoklu seçim.
    await satir('Hızlı').getByLabel('Seç: Hızlı').check();
    await satir('Formdan senaryo').getByLabel('Seç: Formdan senaryo').check();
    await page.getByRole('button', { name: 'Seçilenleri çalıştır (2)' }).click();
    // Ortam diyalogda sorulur (başlıkta ortam segmenti yok).
    const diyalog = page.getByRole('dialog', { name: 'Seçilenleri çalıştır?' });
    await expect(diyalog.getByLabel('Ortam')).toHaveValue(testOrtami);
    await diyalog.getByRole('button', { name: '2 senaryoyu başlat' }).click();
    await expect(panel.locator('.kosu-listesi li')).toHaveCount(2);
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 10_000 });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: düzenleyicideki "Dene" (TEST ortamı) onaydan sonra aynı canlı paneli açar; taslak kaydedilmez', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const sayi = async () => ((await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[]).length;
    const once = await sayi();
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await page.getByLabel('Başlık').fill('Kaydedilmemiş deneme');
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    const onay = page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' });
    await onay.getByRole('button', { name: 'Dene' }).click();
    const panel = page.getByRole('region', { name: 'Servis koşu paneli' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.kosu-listesi li')).toHaveCount(1);
    await expect(panel).toContainText('Kaydedilmemiş deneme');
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 10_000 });
    await expect(panel.locator('.servis-adimlari')).toContainText('Cevap geldi (HTTP 200');
    expect(await sayi()).toBe(once);
    // CANLI ortamda taslak (Dene): onaysız 409; arayüzde CANLI seçilince yalnız tek tip CANLI onayı — Vazgeç'te istek yok, Evet'te canliOnay ile başlar.
    const red = await api('/platform/servis/is/baslat', { projeId, servisId, ortamId: canli, taslak: { baslik: 'x', icerik: { operasyon: 'Siparis', govde: '<a/>', kontroller: [] } } });
    expect(red).toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
    const baslatmalar: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/platform/servis/is/baslat')) baslatmalar.push(r.postData() || ''); });
    const soapOnce = soap.istekler.length;
    await page.getByLabel('Deneme ortamı').selectOption({ label: 'CANLI (Canlı)' });
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    const canliPencere = page.getByRole('dialog', { name: 'CANLI ortam' });
    await expect(canliPencere).toContainText('Bu işlem CANLI (CANLI) ortamında yapılacak');
    await expect(page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' })).toHaveCount(0);
    await canliPencere.getByRole('button', { name: 'Vazgeç' }).click();
    expect(baslatmalar).toEqual([]);
    expect(soap.istekler.length).toBe(soapOnce);
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    await page.getByRole('dialog', { name: 'CANLI ortam' }).getByRole('button', { name: 'Evet, devam et' }).click();
    await expect.poll(() => baslatmalar.length).toBe(1);
    expect(JSON.parse(baslatmalar[0])).toMatchObject({ ortamId: canli, canliOnay: true });
    await expect(panel.locator('.kosu-listesi li')).toHaveCount(1);
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 10_000 });
    expect(soap.istekler.length).toBeGreaterThan(soapOnce);
    expect(await sayi()).toBe(once);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: veri girilip kaydetmeden sayfa değiştirilince "Değişiklikleriniz kaydedilmeyecek" sorulur; arama sayılmaz', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    // Listede arama: veri değildir, uyarı sorulmaz.
    await page.goto(`/#/servisler/s/${servisId}`);
    await page.getByLabel('Senaryo ara').fill('xyz');
    await page.getByRole('link', { name: 'Ayarlar' }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
    // Yeni senaryo formunda başlık girildi → menüden çıkış onay ister.
    await page.evaluate((id) => { location.hash = `#/servisler/s/${id}/senaryo/yeni`; }, servisId);
    await page.getByLabel('Başlık').fill('Yarım kalan');
    await page.getByRole('link', { name: 'Ayarlar' }).click();
    const onay = page.getByRole('dialog', { name: 'Değişiklikleriniz kaydedilmeyecek' });
    await expect(onay).toBeVisible();
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page).toHaveURL(/\/senaryo\/yeni$/);
    await expect(page.getByLabel('Başlık')).toHaveValue('Yarım kalan');
    // Kaydetmeden çık → sayfa değişir.
    await page.getByRole('link', { name: 'Ayarlar' }).click();
    await onay.getByRole('button', { name: 'Kaydetmeden çık' }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
    // Kaydedince uyarı sorulmaz.
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    await page.getByLabel('Başlık').fill('Kaydedilen');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: 'Ayarlar' }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
    await expect(onay).toHaveCount(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: senaryo tablosunda İstek sütunu (metot + adres) ve Metot filtresi; ⋯ menüsünden Kopyala', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Onay senaryosu', icerik: { operasyon: 'Onayla', govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] } });
    await page.goto(`/#/servisler/s/${servisId}`);
    const satir = (baslik: string) => page.locator('.servis-senaryo-tablosu tbody tr').filter({ has: page.getByRole('link', { name: baslik, exact: true }) });
    const istek = satir('Hızlı').locator('td.istek-hucresi');
    await expect(istek).toContainText('Siparis');
    await expect(istek.locator('.istek-adresi')).toHaveText(`${soap.adres.replace(/\/+$/, '')}/Servis/ornek.asmx`);
    // Metot filtresi.
    await page.getByLabel('Metot', { exact: true }).selectOption('Onayla');
    await expect(page.locator('.servis-senaryo-tablosu tbody tr')).toHaveCount(1);
    await expect(satir('Onay senaryosu')).toBeVisible();
    await page.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
    // Adresle arama.
    const aramaTemizle = page.locator('.filtre-temizle');
    await page.getByLabel('Senaryo ara').fill('ornek.asmx');
    await expect(aramaTemizle).toBeVisible();
    await expect(satir('Hızlı')).toBeVisible();
    await page.getByLabel('Senaryo ara').fill('');
    await expect(aramaTemizle).toBeHidden();
    // ⋯ menüsü aramanın geç gelen yeniden çiziminden sonra açık kalır: arama 120 ms gecikmeyle tabloyu yeniden çizer; menü o
    // arada açılırsa (sıralama kesin olsun diye yazma ve tıklama aynı görevde) çizim menüyü silmemeli, aynı satırda açık tutmalı.
    const menuDugmesi = satir('Onay senaryosu').getByRole('button', { name: 'Diğer işlemler: Onay senaryosu' });
    await menuDugmesi.evaluate((dugme) => {
      const arama = document.querySelector<HTMLInputElement>('input[aria-label="Senaryo ara"]');
      if (!arama) throw new Error('arama kutusu yok');
      arama.value = 'Onay';
      arama.dispatchEvent(new Event('input', { bubbles: true }));
      (dugme as HTMLButtonElement).click();
    });
    await expect(aramaTemizle).toBeVisible();
    await expect(page.locator('.servis-senaryo-tablosu tbody tr')).toHaveCount(1);
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(satir('Onay senaryosu').getByRole('button', { name: 'Diğer işlemler: Onay senaryosu' })).toHaveAttribute('aria-expanded', 'true');
    // Menü öğesi çalışır: Kopyala.
    await page.getByRole('menuitem', { name: 'Kopyala' }).click();
    await expect(satir('Onay senaryosu (kopya)')).toBeVisible();
    await expect(page.getByRole('menu')).toBeHidden();
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kopya = d.senaryolar.find((x: Nesne) => x.baslik === 'Onay senaryosu (kopya)');
    expect(kopya).toMatchObject({ kosuyaDahil: false, icerik: { operasyon: 'Onayla', govde: '<a/>' } });
    for (const x of d.senaryolar.filter((y: Nesne) => String(y.baslik).startsWith('Onay senaryosu'))) await basarili('/platform/servis/senaryo/sil', { projeId, id: x.id });
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
    const anahtar = page.getByRole('switch', { name: 'Koşuda (TEST): Formdan senaryo' });
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

});
