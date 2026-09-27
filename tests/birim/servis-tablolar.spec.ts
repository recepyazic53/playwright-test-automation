// KORUMA TESTLERİ — servis alanları test verisi tablolarına bağlanır: metot tablosunda "Tablo sütunu" (+ etiket), senaryoda
// "Tablodan" kaynağı; aynı tablodaki alanlar seçtikçe birbirini süzer (Kanal → Kullanıcı), gizli sütun (parola) seçilen satırdan
// gelir. Gövdede ${Tablo.Sütun} / ${Tablo[etiket].Sütun}; koşu seçimlerle (ve ortamla) uyan ilk satırı kullanır, gizli değer
// kayıtta maskelenir. Değeri olmayan alan yeni senaryoda gönderilmez. Yalnız yerel sahte SOAP sunucusu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { govdeCoz, govdeUret, type AlanDegeri } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { kullanilanParametreler, tarihDegeriBicimle, yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { basvuru, basvuruCoz, secilenSatir, sutunSecenekleri, uyanSatirlar } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

const GIRIS = {
  id: 't1', ad: 'Servis girişi', sutunlar: [{ ad: 'Kanal', gizli: false }, { ad: 'Kullanıcı', gizli: false }, { ad: 'Parola', gizli: true }],
  satirlar: [
    { ortamId: null, degerler: { Kanal: '100', Kullanıcı: '100001', Parola: null } },
    { ortamId: null, degerler: { Kanal: '100', Kullanıcı: '100002', Parola: null } },
    { ortamId: 'o2', degerler: { Kanal: '200', Kullanıcı: '200001', Parola: null } }
  ]
};

test('tablo seçimi: başvuru çözümü, süzülen seçenekler (sıra fark etmez), ortam, ilk uyan satır', () => {
  expect(basvuruCoz('Servis girişi.Kanal')).toEqual({ tablo: 'Servis girişi', etiket: '', sutun: 'Kanal', bicim: '' });
  expect(basvuruCoz('Kişi[kefil].TC / VKN')).toEqual({ tablo: 'Kişi', etiket: 'kefil', sutun: 'TC / VKN', bicim: '' });
  expect(basvuruCoz('MUSTERI_TC')).toBeNull();
  expect(basvuru('Kişi', 'TC', 'başvuran')).toBe('Kişi[başvuran].TC');
  expect(sutunSecenekleri(GIRIS, {}, 'Kullanıcı')).toEqual(['100001', '100002', '200001']);
  expect(sutunSecenekleri(GIRIS, { Kanal: '100' }, 'Kullanıcı')).toEqual(['100001', '100002']);
  // Önce kullanıcı seçilirse kanal daralır; kendi seçimi kendi seçeneklerini daraltmaz.
  expect(sutunSecenekleri(GIRIS, { Kullanıcı: '200001' }, 'Kanal')).toEqual(['200']);
  expect(sutunSecenekleri(GIRIS, { Kanal: '100' }, 'Kanal')).toEqual(['100', '200']);
  expect(sutunSecenekleri(GIRIS, {}, 'Parola')).toEqual([]);
  expect(uyanSatirlar(GIRIS, {}, { ortamId: 'o1' }).length).toBe(2);
  expect(secilenSatir(GIRIS, { Kanal: '100' })?.degerler.Kullanıcı).toBe('100001');
  expect(secilenSatir(GIRIS, { Kanal: '200' }, 'o1')).toBeUndefined();
});

test('gövde: tablo başvurusu (Türkçe ad, etiket) yer tutucu olarak bulunur; form ↔ gövde "tablo" kaynağı', () => {
  const govde = '<a>${Servis girişi.Kanal}</a><b>${Kişi[kefil].TC}</b><c>${MUSTERI_TC}</c><d>${tarih:bugun}</d>';
  expect(kullanilanParametreler(govde)).toEqual(['Servis girişi.Kanal', 'Kişi[kefil].TC', 'MUSTERI_TC']);
  const sema = wsdlSemalari(WSDL).Teklif;
  const degerler: Record<string, AlanDegeri> = { 'Input/Channel': { kaynak: 'tablo', deger: 'Servis girişi.Kanal' }, 'Input/CitizenshipNumber': { kaynak: 'tablo', deger: 'Kişi[başvuran].TC' }, 'Input/Username': { kaynak: 'parametre', deger: 'USERNAME' } };
  const g = govdeUret(sema, degerler);
  expect(g).toContain('<Channel>${Servis girişi.Kanal}</Channel>');
  const c = govdeCoz(g, sema);
  expect(c.degerler['Input/Channel']).toEqual({ kaynak: 'tablo', deger: 'Servis girişi.Kanal' });
  expect(c.degerler['Input/CitizenshipNumber']).toEqual({ kaynak: 'tablo', deger: 'Kişi[başvuran].TC' });
  expect(c.degerler['Input/Username']).toEqual({ kaynak: 'parametre', deger: 'USERNAME' });
});

test('tarih biçimi: ${Tablo.Sütun|biçim} tablodaki tarihi (1983-05-10 / 10.05.1983, saatli) istenen biçimde yazar; okunamayan değer açık hata', () => {
  expect(basvuruCoz("Kişi.Doğum tarihi|yyyy-MM-dd'T'HH:mm:ss")).toEqual({ tablo: 'Kişi', etiket: '', sutun: 'Doğum tarihi', bicim: "yyyy-MM-dd'T'HH:mm:ss" });
  expect(basvuru('Kişi', 'Doğum tarihi', 'kefil', 'dd.MM.yyyy')).toBe('Kişi[kefil].Doğum tarihi|dd.MM.yyyy');
  expect(tarihDegeriBicimle('1983-05-10', "yyyy-MM-dd'T'HH:mm:ss", 'x')).toBe('1983-05-10T00:00:00');
  expect(tarihDegeriBicimle('10.05.1983', 'yyyy-MM-dd', 'x')).toBe('1983-05-10');
  expect(tarihDegeriBicimle('1983-05-10T14:30', 'dd/MM/yyyy HH:mm', 'x')).toBe('10/05/1983 14:30');
  expect(() => tarihDegeriBicimle('31.02.1983', 'yyyy-MM-dd', 'Kişi.Doğum tarihi')).toThrow('"Kişi.Doğum tarihi" değeri tarih olarak okunamadı');
  expect(() => tarihDegeriBicimle('abc', 'yyyy', 'x')).toThrow('okunamadı');
  const govde = "<B>${Kişi.Doğum tarihi|yyyy-MM-dd'T'HH:mm:ss}</B><C>${Kişi.Doğum tarihi}</C>";
  expect(kullanilanParametreler(govde)).toEqual(['Kişi.Doğum tarihi']);
  expect(yerTutuculariDoldur(govde, { degerler: { 'Kişi.Doğum tarihi': '10.05.1983' } })).toBe('<B>1983-05-10T00:00:00</B><C>10.05.1983</C>');
  // Form ↔ gövde: biçim başvuruyla birlikte korunur.
  const sema = wsdlSemalari(WSDL).Teklif;
  const g = govdeUret(sema, { 'Input/CitizenshipNumber': { kaynak: 'tablo', deger: 'Kişi.TC|dd.MM.yyyy' } });
  expect(govdeCoz(g, sema).degerler['Input/CitizenshipNumber']).toEqual({ kaynak: 'tablo', deger: 'Kişi.TC|dd.MM.yyyy' });
});

test.describe('servis alanları tablolardan', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-STablo-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let servisId = '';
  let girisId = '';
  let kisiId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Teklif xmlns="Ornek"><Input>${ic}</Input></Teklif></s:Body></s:Envelope>`;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-tablo-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Servis Tablo Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    girisId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Servis girişi', sutunlar: [{ ad: 'Kanal' }, { ad: 'Kullanıcı' }, { ad: 'Parola', gizli: true }], satirlar: [
      { degerler: { Kanal: '100', Kullanıcı: '100001', Parola: 'gizli-a1' } },
      { degerler: { Kanal: '100', Kullanıcı: '100002', Parola: 'gizli-a2' } },
      { degerler: { Kanal: '200', Kullanıcı: '200001', Parola: 'gizli-b1' } }] })).tablo.id;
    kisiId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişi', sutunlar: [{ ad: 'TC' }, { ad: 'Telefon' }], satirlar: [
      { degerler: { TC: SAHTE_TC, Telefon: '5550000001' } }, { degerler: { TC: '00000000000', Telefon: '5550000002' } }] })).tablo.id;
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('koşu değerleri seçilen satırdan alır; gizli değer kayıtta maskeli; uyan satır yoksa açık hata; bağlantı doğrulanır', async () => {
    const govde = zarf('<Channel>${Servis girişi.Kanal}</Channel><Username>${Servis girişi.Kullanıcı}</Username><Password>${Servis girişi.Parola}</Password><CitizenshipNumber>${Kişi[başvuran].TC}</CitizenshipNumber>');
    const dene = async (tabloSecimleri?: Nesne) => (await basarili('/platform/servis/senaryo/dene', {
      projeId, servisId, ortamId: testOrtami, baslik: 'T', icerik: { operasyon: 'Teklif', govde, kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }], tabloSecimleri }
    })).sonuc as Nesne;
    // Seçim yok → her grupta ilk satır.
    let r = await dene();
    expect(r.durum).toBe('basarili');
    expect(soap.istekler.at(-1)?.govde).toContain('<Channel>100</Channel><Username>100001</Username><Password>gizli-a1</Password>');
    expect(r.istek).not.toContain('gizli-a1');
    expect(r.tabloSatirlari).toEqual([
      { tablo: 'Servis girişi', etiket: '', satir: { Kanal: '100', Kullanıcı: '100001' } },
      { tablo: 'Kişi', etiket: 'başvuran', satir: { TC: SAHTE_TC, Telefon: '5550000001' } }]);
    // Kanal + kullanıcı seçimi → o satırın parolası.
    r = await dene({ [`${girisId}|`]: { Kanal: '100', Kullanıcı: '100002' }, [`${kisiId}|başvuran`]: { TC: '00000000000' } });
    expect(soap.istekler.at(-1)?.govde).toContain('<Username>100002</Username><Password>gizli-a2</Password>');
    expect(r.durum).toBe('basarisiz');
    // Uyuşmayan seçim → istek atılmaz, neden yazılır.
    const once = soap.istekler.length;
    r = await dene({ [`${girisId}|`]: { Kanal: '200', Kullanıcı: '100001' } });
    expect(r.durum).toBe('hata');
    expect(r.hata).toContain('"Servis girişi" tablosunda seçimlerle uyan satır yok');
    expect(soap.istekler.length).toBe(once);
    // Bağlantı: tablo + sütun + etiket saklanır; geçersiz etiket reddedilir.
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanBaglari: { Teklif: {
      'Input/Channel': { tablo: girisId, sutun: 'Kanal' }, 'Input/Username': { tablo: girisId, sutun: 'Kullanıcı' }, 'Input/Password': { tablo: girisId, sutun: 'Parola' },
      'Input/CitizenshipNumber': { tablo: kisiId, sutun: 'TC', etiket: 'başvuran' } } } });
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(s.ayarlar.alanBaglari.Teklif['Input/CitizenshipNumber']).toEqual({ tablo: kisiId, sutun: 'TC', etiket: 'başvuran' });
    const red = await api('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanBaglari: { Teklif: { 'Input/Channel': { tablo: girisId, sutun: 'Kanal', etiket: 'a<b' } } } });
    expect(red.mesaj).toContain('etiketi geçersiz');
  });

  test('tarih biçimli bağlantı: bağlantıya biçim kaydedilir (geçersiz biçim reddedilir); gövdeye tarih istenen biçimde gider', async () => {
    const onceki = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis.ayarlar.alanBaglari;
    const dogumId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Doğum', sutunlar: [{ ad: 'Tarih' }], satirlar: [{ degerler: { Tarih: '10.05.1983' } }] })).tablo.id;
    const kaydet = (bicim: string) => api('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx',
      alanBaglari: { Teklif: { 'Input/BirthDate': { tablo: dogumId, sutun: 'Tarih', bicim } } } });
    expect((await kaydet('abc')).mesaj).toContain('tarih biçimi geçersiz');
    expect((await kaydet("yyyy-MM-dd'T'HH:mm:ss")).basarili).toBe(true);
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(s.ayarlar.alanBaglari.Teklif['Input/BirthDate']).toEqual({ tablo: dogumId, sutun: 'Tarih', bicim: "yyyy-MM-dd'T'HH:mm:ss" });
    await basarili('/platform/servis/senaryo/dene', {
      projeId, servisId, ortamId: testOrtami, baslik: 'T', icerik: { operasyon: 'Teklif', govde: zarf("<BirthDate>${Doğum.Tarih|yyyy-MM-dd'T'HH:mm:ss}</BirthDate>"), kontroller: [] }
    });
    expect(soap.istekler.at(-1)?.govde).toContain('<BirthDate>1983-05-10T00:00:00</BirthDate>');
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', alanBaglari: onceki });
  });

  test('servis değeri karşılığı: gövdeye tablodaki değer yerine servis değeri yazılır; tanımsız değer olduğu gibi', async () => {
    const tablo = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === kisiId);
    await basarili('/platform/tablo/kaydet', { projeId, id: kisiId, ad: tablo.ad, sutunlar: [{ ad: 'TC', eskiAd: 'TC' }, { ad: 'Telefon', eskiAd: 'Telefon', karsiliklar: { '5550000001': { servis: '+905550000001', sayfa: 'yok-sayilir' } } }] });
    const govde = zarf('<Phone>${Kişi.Telefon}</Phone>');
    const dene = async (tabloSecimleri?: Nesne) => basarili('/platform/servis/senaryo/dene', {
      projeId, servisId, ortamId: testOrtami, baslik: 'T', icerik: { operasyon: 'Teklif', govde, kontroller: [], tabloSecimleri }
    });
    await dene();
    expect(soap.istekler.at(-1)?.govde).toContain('<Phone>+905550000001</Phone>');
    await dene({ [`${kisiId}|`]: { TC: '00000000000' } });
    expect(soap.istekler.at(-1)?.govde).toContain('<Phone>5550000002</Phone>');
  });

  test('arayüz: Parametreler\'de tablo sütunu bağlanır; senaryoda bağlı alanlar "Tablodan", Kanal seçince Kullanıcı süzülür, parola satırdan', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    // Parametreler: bağlantıyı kaldır / yeniden bağla (anında kaydedilir).
    await page.goto(`/#/servisler/s/${servisId}/parametreler`);
    await page.getByRole('button', { name: 'Teklif metodu' }).click();
    const bagSec = page.getByLabel('Teklif Input/Channel tablo sütunu');
    await expect(bagSec).toHaveValue(`${girisId}\u0001Kanal`);
    await expect(page.locator('.metot-cercevesi .alan-satiri').filter({ hasText: /^Channel/ })).toContainText('100');
    await page.getByLabel('Teklif Input/EndDate tablo sütunu').selectOption(`${kisiId}\u0001Telefon`);
    await expect(page.getByText('✓ Kaydedildi')).toBeVisible();
    let s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(s.ayarlar.alanBaglari.Teklif['Input/EndDate']).toEqual({ tablo: kisiId, sutun: 'Telefon' });
    await page.getByLabel('Teklif Input/EndDate tablo sütunu').selectOption('');
    await expect(page.getByText('✓ Kaydedildi')).toBeVisible();
    // Yeni senaryo: bağlı alanlar Tablodan, bağlı olmayanlar gönderilmez.
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await expect(satir('Channel').getByLabel('Channel değer kaynağı')).toHaveValue('tablo');
    await expect(satir('IsSkiing').getByLabel('IsSkiing değer kaynağı')).toHaveValue('gonderme');
    await expect(satir('Password')).toContainText('•••• seçilen satırdan gelir');
    await expect(satir('Username').getByLabel('Username', { exact: true }).locator('option')).toHaveCount(4);
    await satir('Channel').getByLabel('Channel', { exact: true }).selectOption('100');
    await expect(satir('Username').getByLabel('Username', { exact: true }).locator('option')).toHaveText(['— seçilmedi (2 seçenek) —', '100001', '100002']);
    await satir('Username').getByLabel('Username', { exact: true }).selectOption('100002');
    await expect(satir('Channel')).toContainText('✓ tek satır');
    await page.getByLabel('Başlık').fill('Tablodan senaryo');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`));
    const kayit = s.senaryolar.find((x: Nesne) => x.baslik === 'Tablodan senaryo');
    expect(kayit.icerik.tabloSecimleri).toEqual({ [`${girisId}|`]: { Kanal: '100', Kullanıcı: '100002' } });
    expect(kayit.icerik.govde).toContain('<Channel>${Servis girişi.Kanal}</Channel>');
    expect(kayit.icerik.govde).toContain('<CitizenshipNumber>${Kişi[başvuran].TC}</CitizenshipNumber>');
    expect(kayit.icerik.govde).not.toContain('IsSkiing');
    // Açılınca seçim geri gelir.
    await page.reload();
    await expect(satir('Username').getByLabel('Username', { exact: true })).toHaveValue('100002');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
