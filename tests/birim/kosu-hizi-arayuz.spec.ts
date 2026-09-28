// KORUMA TESTLERİ — koşu hızı (eşzamanlılık / bekleme) arayüzü: Ayarlar > Koşu'da "Servis senaryoları" ve "Ekran senaryoları"
// grupları görünür ve kaydedilir; giriş tarifli ortam varken ekran eşzamanlılığı > 1 uyarı verir (engellemez); ortam formundaki
// "Koşu hızı" genel ayarı ortam bazında ezer (boş = genel); servis koşu panelinde etkin değerler ve kaynağı görünür. Yalnız
// 127.0.0.1'deki sahte SOAP servisi.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { etkinKosuHizi, kosuHiziDogrula, kosuHiziOzeti } from '../../scripts/platform/ayarlar/kosu-hizi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SAHTE_TC, sahteSoapSunucusu } from './servis-fikstur';
import { ornekGirisTarifi } from './model-fikstur';

type Nesne = Record<string, any>;

test('kosu-hizi: doğrulama (boş = genel), etkin değer ortam > genel > varsayılan, özet metni kaynağıyla', () => {
  expect(kosuHiziDogrula(undefined)).toEqual({});
  expect(kosuHiziDogrula({ servisEszamanli: '3', servisIstekBeklemeMs: '', ekranEszamanli: null, ekranBeklemeMs: 500 })).toEqual({ servisEszamanli: 3, ekranBeklemeMs: 500 });
  expect(() => kosuHiziDogrula({ ekranEszamanli: 6 })).toThrow('1–5');
  expect(() => kosuHiziDogrula({ servisIstekBeklemeMs: -1 })).toThrow('0–60000');
  const e = etkinKosuHizi({ servisEszamanli: 4, ekranBeklemeMs: 100 }, { ad: 'TEST', kosuHizi: { servisEszamanli: 1, servisIstekBeklemeMs: 500 } });
  expect(e.degerler).toEqual({ servisEszamanli: 1, servisIstekBeklemeMs: 500, ekranEszamanli: 1, ekranBeklemeMs: 100 });
  expect(e.kaynaklar).toEqual({ servisEszamanli: 'ortam', servisIstekBeklemeMs: 'ortam', ekranEszamanli: 'genel', ekranBeklemeMs: 'genel' });
  expect(kosuHiziOzeti(e, 'servis')).toBe('TEST ortamı: senaryolar sırayla (1 senaryo aynı anda), 500 ms istekler arası bekleme (ortam ayarı)');
  expect(kosuHiziOzeti(etkinKosuHizi({ ekranEszamanli: 2 }, { ad: 'TEST' }), 'ekran')).toBe('TEST ortamı: en çok 2 senaryo aynı anda, bekleme yok (genel ayar)');
  // Ortam ayarı sunucu kaydında (ayarlar.kosuHizi) da okunur.
  expect(etkinKosuHizi({}, { ayarlar: { kosuHizi: { ekranEszamanli: 3 } } }).degerler.ekranEszamanli).toBe(3);
});

test.describe('koşu hızı arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Hiz-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: Awaited<ReturnType<typeof sahteSoapSunucusu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let girisli = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-hizi-ui-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Hız Projesi' })).proje.id);
    girisli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    // Giriş tarifi (yalnız varlığı sınanır; giriş yapılmaz).
    await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: girisli, tarif: ornekGirisTarifi() });
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: girisli, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Hızlı', icerik: { operasyon: 'Siparis',
      govde: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input><IdentityNumber>${SAHTE_TC}</IdentityNumber></Input></Siparis></s:Body></s:Envelope>`,
      kontroller: [{ tur: 'soapYaniti' }] } });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Ayarlar > Koşu: Servis / Ekran senaryoları grupları kaydedilir; giriş tarifli ortam varken ekran N > 1 uyarısı', async () => {
    const ortamlar = (await basarili(`/platform/ortamlar?projeId=${projeId}`)).ortamlar as Nesne[];
    expect(ortamlar.find((o) => o.id === girisli)).toMatchObject({ girisTarifiVar: true, kosuHizi: {} });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/kosu');
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    const servisGrubu = form.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^Servis senaryoları$/ }) });
    const ekranGrubu = form.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^Ekran senaryoları$/ }) });
    await expect(servisGrubu.getByLabel('Aynı anda en çok servis senaryosu (senaryo)')).toHaveValue('1');
    await expect(servisGrubu.getByLabel('İstekler arası bekleme (ms)')).toHaveValue('0');
    await expect(ekranGrubu.getByLabel('Aynı anda en çok ekran senaryosu (senaryo)')).toHaveValue('1');
    await expect(ekranGrubu.getByLabel('Senaryolar arası bekleme (ms)')).toHaveValue('0');
    const uyari = form.locator('.eszamanli-giris-uyarisi');
    await expect(uyari).toBeHidden();
    await ekranGrubu.getByLabel('Aynı anda en çok ekran senaryosu (senaryo)').fill('2');
    await expect(uyari).toBeVisible();
    await expect(uyari).toContainText('Aynı kullanıcıyla eşzamanlı girişler birbirinin oturumunu düşürebilir; kendi uygulamanızda 1 önerilir.');
    await expect(uyari).toContainText('TEST');
    await servisGrubu.getByLabel('Aynı anda en çok servis senaryosu (senaryo)').fill('11');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('1 ile 10 arasında bir tam sayı girin.')).toBeVisible();
    await servisGrubu.getByLabel('Aynı anda en çok servis senaryosu (senaryo)').fill('3');
    await servisGrubu.getByLabel('İstekler arası bekleme (ms)').fill('250');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    expect((await basarili('/platform/kosu-ayarlari')).ayarlar).toMatchObject({ servisEszamanli: 3, servisIstekBeklemeMs: 250, ekranEszamanli: 2, ekranBeklemeMs: 0 });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('ortam formu "Koşu hızı": boş = genel (yer tutucuda), girilen değer ortamda saklanır; giriş tarifli ortamda N > 1 uyarısı', async () => {
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { servisEszamanli: 3, servisIstekBeklemeMs: 250, ekranEszamanli: 2 } });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    await page.getByRole('button', { name: /TEST: düzenle/ }).click();
    const hiz = page.locator('fieldset.kosu-hizi-alanlari');
    await expect(hiz.locator('legend')).toHaveText('Koşu hızı');
    const servisN = hiz.getByLabel('Aynı anda en çok servis senaryosu (senaryo)');
    await expect(servisN).toHaveValue('');
    await expect(servisN).toHaveAttribute('placeholder', 'Genel: 3');
    const ekranN = hiz.getByLabel('Aynı anda en çok ekran senaryosu (senaryo)');
    const uyari = hiz.locator('.eszamanli-giris-uyarisi');
    await expect(uyari).toBeVisible();   // boş = genel 2
    await ekranN.fill('1');
    await expect(uyari).toBeHidden();
    await ekranN.fill('3');
    await expect(uyari).toBeVisible();
    await ekranN.fill('1');
    await servisN.fill('1');
    await hiz.getByLabel('İstekler arası bekleme (ms)').fill('500');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Ortam kaydedildi.')).toBeVisible();
    const o = ((await basarili(`/platform/ortamlar?projeId=${projeId}`)).ortamlar as Nesne[]).find((x) => x.id === girisli);
    expect(o?.kosuHizi).toEqual({ servisEszamanli: 1, servisIstekBeklemeMs: 500, ekranEszamanli: 1 });
    // Ortam formundaki "Koşu hızı" giriş tarifini ve ortam türünü bozmaz.
    expect(o).toMatchObject({ girisTarifiVar: true, riskli: false });
    // Geçersiz değer sunucuda reddedilir.
    const red = await api('/platform/ortam/kaydet', { id: girisli, projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false, kosuHizi: { ekranEszamanli: 9 } });
    expect(String(red.mesaj)).toContain('1–5');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('servis koşu paneli: etkin koşu hızı ve kaynağı (ortam ayarı), istekler arası bekleme bilgisi', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}`);
    const satir = page.locator('.servis-senaryo-tablosu tbody tr').filter({ has: page.getByRole('link', { name: 'Hızlı', exact: true }) });
    await satir.getByRole('button', { name: 'Çalıştır: Hızlı' }).click();
    const panel = page.getByRole('region', { name: 'Servis koşu paneli' });
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 15_000 });
    await expect(panel).toContainText('istekler arası bekleme: 500 ms');
    await expect(panel.locator('.kosu-hizi-ozeti')).toHaveText('TEST ortamı: senaryolar sırayla (1 senaryo aynı anda), 500 ms istekler arası bekleme (ortam ayarı)');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
