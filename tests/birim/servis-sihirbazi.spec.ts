// KORUMA TESTLERİ — "Servis ekle" sihirbazı ve ortam taban adresleri: taban + yol birleştirme (tabanın yolu korunur),
// "bu ortamda yok", yeni taban adresin ortama kaydı, metot seçimi, CANLI'da çağrılmayacak metotlar, alan varsayılanı önerileri,
// giriş bilgisi profili. Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu; şirket sitesine istek yoktur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adresBirlestir, ortamdaTanimli, servisAdresi } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test('taban + yol: tabanın kendi yolu korunur; boş taban = ortamda yok; tanımsız ortam asıl adrese düşer', () => {
  expect(adresBirlestir('https://x.com/api/', '/a.asmx')).toBe('https://x.com/api/a.asmx');
  expect(adresBirlestir('https://x.com', 'a.asmx')).toBe('https://x.com/a.asmx');
  const ortam = { id: 'o1', ad: 'CANLI', tabanUrl: 'https://asil.com/' };
  expect(servisAdresi({ yol: '/s.asmx' }, ortam)).toBe('https://asil.com/s.asmx');
  expect(servisAdresi({ yol: '/s.asmx', tabanlar: { o1: 'https://x.com/api' } }, ortam)).toBe('https://x.com/api/s.asmx');
  expect(() => servisAdresi({ yol: '/s.asmx', tabanlar: { o1: '' } }, ortam)).toThrow(/"CANLI" ortamında tanımlı değil/);
  expect(servisAdresi({ yol: '/s.asmx', tabanlar: { baska: 'https://y.com' } }, ortam)).toBe('https://asil.com/s.asmx');
  expect(ortamdaTanimli({ tabanlar: { o1: '' } }, 'o1')).toBe(false);
  expect(ortamdaTanimli({}, 'o1')).toBe(true);
});

test.describe('sihirbaz uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Sihirbaz-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let canli = '';
  let girisId = '';
  let kisiId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-sihirbaz-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sihirbaz Projesi' })).proje.id);
    // TEST ortamının asıl adresi servisin makinesi DEĞİL: servis yeni taban adresle eklenecek.
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true })).ortam.id);
    canli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid/', canli: true })).ortam.id);
    // Test verisi tabloları: sütun adı alan adıyla aynıysa sihirbaz kendiliğinden bağlar (Channel / Username / Password).
    girisId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Servis girişi', sutunlar: [{ ad: 'Channel' }, { ad: 'Username' }, { ad: 'Password', gizli: true }],
      satirlar: [{ degerler: { Channel: '77', Username: 'sihirbaz-kullanici', Password: 'sihirbaz-parola-1' } }] })).tablo.id;
    kisiId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişi', sutunlar: [{ ad: 'tcKimlikNo' }], satirlar: [{ degerler: { tcKimlikNo: '10000000146' } }] })).tablo.id;
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('arayüz: adresler → denetle + metotlar → alanlar tablo sütunlarına (öneriler) → özet → kaydet', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/servisler/yeni');
    const ileri = page.getByRole('button', { name: 'İleri' });

    // 1 · Adresler
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('Adresler');
    await expect(ileri).toBeDisabled();
    await page.getByLabel('Servis adı').fill('Ornek Sihirbaz');
    await expect(page.getByLabel('Anahtar')).toHaveValue('ornek-sihirbaz');
    await page.getByLabel('TEST taban adresi', { exact: true }).selectOption('__yeni');
    await page.getByLabel('TEST yeni taban adresi').fill(`${soap.adres}/Servis`);
    await page.getByLabel('CANLI taban adresi', { exact: true }).selectOption('');
    await expect(ileri).toBeEnabled();
    await ileri.click();

    // 2 · Metotlar: yol + denetle (onay penceresi) → metot listesi; "Onayla" CANLI'da çağrılmasın işaretli gelir.
    await expect(ileri).toBeDisabled();
    await page.getByLabel('Yol', { exact: true }).fill('/ornek.asmx');
    await expect(page.locator('.adres-onizleme')).toContainText(`${soap.adres}/Servis/ornek.asmx`);
    await expect(page.locator('.adres-onizleme')).toContainText('bu ortamda yok');
    const once = soap.istekler.length;
    await page.getByRole('button', { name: 'Denetle' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'İstek at' }).click();
    await expect(page.locator('.metot-listesi')).toContainText('Teklif');
    expect(soap.istekler.slice(once).map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /Servis/ornek.asmx?wsdl']);
    await expect(page.getByLabel('Onayla CANLI\'da çağrılmasın')).toBeChecked();
    await expect(page.getByLabel('Teklif CANLI\'da çağrılmasın')).not.toBeChecked();
    await ileri.click();

    // 3 · Alanlar: her metot bir kutucuk; tıklanan metodun alanları çerçevede açılır.
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('Alanlar');
    await expect(page.getByRole('button', { name: 'Onayla metodu' })).toBeVisible();
    await page.getByRole('button', { name: 'Teklif metodu' }).click();
    await expect(page.getByRole('button', { name: 'Teklif metodu' })).toHaveAttribute('aria-pressed', 'true');
    // Adı aynı sütunlar önerilir; kimlik numarası elle bağlanır (etiketle).
    await expect(page.getByLabel('Teklif Input/Channel tablo sütunu')).toHaveValue(`${girisId}\u0001Channel`);
    await expect(page.getByLabel('Teklif Input/Password tablo sütunu')).toHaveValue(`${girisId}\u0001Password`);
    await expect(page.getByLabel('Teklif Input/BeginDate tablo sütunu')).toHaveValue('');
    await page.getByLabel('Teklif Input/CitizenshipNumber tablo sütunu').selectOption(`${kisiId}\u0001tcKimlikNo`);
    await page.getByLabel('Teklif Input/CitizenshipNumber etiketi').fill('başvuran');
    await page.getByLabel('Teklif Input/CitizenshipNumber etiketi').blur();
    // Zorunluluk: WSDL'e göre gelir (BeginDate minOccurs=1 → işaretli, CitizenshipNumber minOccurs=0 → boş); iş kuralına göre düzeltilir.
    await expect(page.getByLabel('Teklif Input/BeginDate zorunlu')).toBeChecked();
    await expect(page.getByLabel('Teklif Input/CitizenshipNumber zorunlu')).not.toBeChecked();
    await page.getByLabel('Teklif Input/CitizenshipNumber zorunlu').check();
    await page.getByLabel('Teklif Input/IsSkiing zorunlu').uncheck();
    await ileri.click();

    // 4 · Özet → Kaydet (giriş bilgisi adımı yok: Servis girişi bir tablodur).
    await expect(page.locator('.ozet-listesi')).toContainText('Onayla (CANLI\'da çağrılmaz)');
    // Tarih-saat alanında biçim yazılmaz: koşuda kullanıcının varsayılan tarih biçimi (Ayarlar > Koşu) kullanılır.
    await expect(page.locator('.ozet-listesi')).toContainText('BEGIN_DATE = bugun · END_DATE = bugun+1y');
    await expect(page.locator('.ozet-listesi')).toContainText('4 alan');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[0-9a-f-]{36}$/);
    expect(hatalar).toEqual([]);

    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    const s = servisler.find((x: Nesne) => x.anahtar === 'ornek-sihirbaz');
    expect(s.ayarlar).toMatchObject({
      yol: '/ornek.asmx', tabanlar: { [testOrtami]: `${soap.adres}/Servis`, [canli]: '' },
      yalnizTestOperasyonlari: ['Onayla'], tarihKurallari: { BEGIN_DATE: 'bugun', END_DATE: 'bugun+1y' }
    });
    expect(s.ayarlar.operasyonlar.map((o: Nesne) => o.ad)).toEqual(['Teklif', 'Onayla']);
    expect([...s.ayarlar.alanZorunluluklari.Teklif].sort()).toEqual(['Input/BeginDate', 'Input/ClientType', 'Input/CitizenshipNumber', 'Input/CreditCard/Installment', 'Input/EndDate'].sort());
    expect(s.ayarlar.alanZorunluluklari.Onayla).toEqual(['TeklifNo']);
    expect(s.ayarlar.alanVarsayilanlari.Teklif).toEqual({
      'Input/BeginDate': { kaynak: 'parametre', deger: 'BEGIN_DATE' }, 'Input/EndDate': { kaynak: 'parametre', deger: 'END_DATE' }
    });
    expect(s.ayarlar.alanBaglari.Teklif).toEqual({
      'Input/Channel': { tablo: girisId, sutun: 'Channel' }, 'Input/Username': { tablo: girisId, sutun: 'Username' }, 'Input/Password': { tablo: girisId, sutun: 'Password' },
      'Input/CitizenshipNumber': { tablo: kisiId, sutun: 'tcKimlikNo', etiket: 'başvuran' }
    });
    // Yeni taban adres ortamın listesine kaydedildi; giriş profili kasada.
    const { ortamlar } = await basarili(`/platform/ortamlar?projeId=${projeId}`);
    expect(ortamlar.find((o: Nesne) => o.id === testOrtami).tabanAdresleri).toEqual(['http://127.0.0.1:9/', `${soap.adres}/Servis`]);
    expect(s.ayarlar.kimlikProfili).toBeUndefined();
    expect(s.ayarlar.veriProfilleri ?? {}).toEqual({});

    // Yeni senaryo: varsayılanlar dolu gelir.
    await page.goto(`/#/servisler/s/${s.id}/senaryo/yeni`);
    const satir = page.locator('.alan-formu .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^CitizenshipNumber/ }) });
    await expect(satir.getByLabel('CitizenshipNumber değer kaynağı')).toHaveValue('tablo');
    await expect(satir).toContainText('Kişi (başvuran) → tcKimlikNo');
    // Zorunlu alanlar servisin listesinden: CitizenshipNumber vurgulu, IsSkiing değil; "Yalnız zorunlular" süzer; gönderilmeyen zorunlu alan uyarır.
    await expect(satir).toHaveClass(/zorunlu/);
    const kayak = page.locator('.alan-formu .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^IsSkiing/ }) });
    await expect(kayak).not.toHaveClass(/zorunlu/);
    await page.getByText('Yalnız zorunlular').click();
    await expect(kayak).toHaveCount(0);
    await expect(page.locator('.alan-formu .alan-satiri')).toHaveCount(5);
    await satir.getByLabel('CitizenshipNumber değer kaynağı').selectOption('gonderme');
    await expect(satir.locator('.alan-uyarisi')).toContainText('Zorunlu alan dolu gönderilmiyor');
    await baglam.close();
  });

  test('Parametreler sekmesi: senaryo yokken de metot alanları görünür; zorunluluk düzeltilir; WSDL\'de olmayan alan eklenir ve düzenleyicide kullanılır', async () => {
    test.setTimeout(60_000);
    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    const s = servisler.find((x: Nesne) => x.anahtar === 'ornek-sihirbaz');
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${s.id}/parametreler`);
    await expect(page.getByRole('heading', { name: 'Metot alanları' })).toBeVisible();
    await page.getByRole('button', { name: 'Teklif metodu' }).click();
    // Metot tablosu: sihirbazda bağlanan sütun görünür.
    await expect(page.getByLabel('Teklif Input/Channel tablo sütunu')).toHaveValue(`${girisId}\u0001Channel`);
    await page.getByLabel('Teklif Input/IsSkiing zorunlu').check();
    // Alan ekleme formu gizli; "+ Alan ekle" açar, eklenince kapanır.
    await expect(page.getByLabel('Teklif yeni alan yolu')).toBeHidden();
    await page.getByRole('button', { name: '+ Alan ekle' }).click();
    await page.getByLabel('Teklif yeni alan yolu').fill('Input/EkAlan');
    await page.getByLabel('Teklif yeni alan zorunlu').check();
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(page.locator('.alan-satiri').filter({ hasText: 'EkAlan' })).toContainText('WSDL\'de yok');
    await expect(page.getByLabel('Teklif yeni alan yolu')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Teklif metodu' })).toContainText('1 elle eklenen');
    // Kutucuk kapatılıp açılınca girilenler korunur.
    await page.getByRole('button', { name: 'Teklif alanlarını kapat' }).click();
    await expect(page.getByLabel('Teklif Input/IsSkiing zorunlu')).toBeHidden();
    await page.getByRole('button', { name: 'Teklif metodu' }).click();
    await expect(page.getByLabel('Teklif Input/IsSkiing zorunlu')).toBeChecked();
    await expect.poll(async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${s.id}`)).servis.ayarlar.ekAlanlar).toEqual({ Teklif: [{ yol: 'Input/EkAlan', tip: 'metin' }], Onayla: [] });
    const ayar = (await basarili(`/platform/servis?projeId=${projeId}&id=${s.id}`)).servis.ayarlar;
    expect(ayar.alanZorunluluklari.Teklif).toEqual(expect.arrayContaining(['Input/EkAlan', 'Input/IsSkiing']));
    expect(ayar.alanBaglari.Teklif['Input/Channel']).toEqual({ tablo: girisId, sutun: 'Channel' });

    // Düzenleyici: elle eklenen alan formda; gövdeye yazılır.
    await page.goto(`/#/servisler/s/${s.id}/senaryo/yeni`);
    const ek = page.locator('.alan-formu .alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: /^EkAlan/ }) });
    await expect(ek).toHaveClass(/zorunlu/);
    await ek.getByLabel('EkAlan değer kaynağı').selectOption('sabit');
    await ek.getByLabel('EkAlan', { exact: true }).fill('ek-deger');
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    await expect(page.getByLabel('İstek gövdesi (SOAP zarfı)')).toHaveValue(/<EkAlan>ek-deger<\/EkAlan>/);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('CANLI\'da tanımlı olmayan servisin senaryoları koşulmaz (neden bildirilir); ikinci servis kayıtlı tabanı listede görür', async () => {
    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    const s = servisler[0];
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId: s.id, baslik: 'İkisi', kapsam: 'ikisi', icerik: { operasyon: 'Teklif', govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] } });
    const once = soap.istekler.length;
    const kos = await basarili('/platform/servis/kos', { projeId, servisId: s.id, ortamId: canli });
    expect(kos.kosu).toMatchObject({ ortamTuru: 'canli', sonuclar: [], atlamaNedeni: 'Servis "CANLI" ortamında tanımlı değil (taban adres boş).' });
    expect(soap.istekler.length).toBe(once);
    const red = await api('/platform/servis/senaryo/dene', { projeId, servisId: s.id, ortamId: canli, baslik: 'x', icerik: { operasyon: 'Teklif', govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] } });
    expect(red.basarili).toBe(false);
  });
});
