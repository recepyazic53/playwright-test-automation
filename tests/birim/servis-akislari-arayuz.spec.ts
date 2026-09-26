// KORUMA TESTLERİ — servis akışları arayüzü (servis sayfası > Akışlar): yeni akış (Giriş → Token oku, Teklif başlıkta
// Bearer ${akis:Token}), kayıt, Dene (onay → adım adım sonuç; token maskeli), oturum akışının servise atanması ve senaryo
// düzenleyicide HTTP başlıkları. Yalnız yerel Nöbetçi + sahte SOAP sunucusu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Teklif xmlns="Ornek"><Input>${ic}</Input></Teklif></s:Body></s:Envelope>`;

test.describe('servis akışları arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-AkisUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'akis-arayuz-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Akış Arayüz Projesi' })).proje.id);
    const ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    const senaryo = (baslik: string, govde: string, basliklar?: Nesne) => basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik, icerik: { operasyon: 'Teklif', govde: zarf(govde), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }], ...(basliklar ? { basliklar } : {}) }
    });
    await senaryo('Giriş', '<Giris/>');
    await senaryo('Teklif', `<CitizenshipNumber>${SAHTE_TC}</CitizenshipNumber>`, { Authorization: 'Bearer ${akis:Token}' });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('yeni akış: adımlar + yanıttan oku → kaydet → Dene (onay) → adım adım sonuç; token maskeli, başlıkta gönderildi', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/akislar`);
    await expect(page.getByText('Henüz akış yok.')).toBeVisible();
    await page.getByRole('link', { name: 'Yeni akış' }).click();
    await page.getByLabel('Başlık').fill('Giriş → Teklif');
    await page.getByLabel('1. adım senaryosu').selectOption({ label: 'Giriş' });
    await page.getByRole('button', { name: 'Değer oku' }).click();
    await page.getByLabel('1. adım 1. okuma adı').fill('Token');
    await expect(page.getByLabel('1. adım 1. okuma gizli')).toBeChecked();   // adı "token" içeriyor
    await page.getByLabel('1. adım 1. okuma yolu').fill('//Sonuc/Token');
    await page.getByRole('button', { name: 'Adım ekle' }).click();
    await page.getByLabel('2. adım servisi').selectOption({ label: 'Ornek' });
    await page.getByLabel('2. adım senaryosu').selectOption({ label: 'Teklif' });
    await expect(page.getByRole('region', { name: '2. adım' })).toContainText('${akis:Token}');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/akislar\/[A-Za-z0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Akışı düzenle' })).toBeVisible();
    // Dene: önce onay.
    const once = soap.istekler.length;
    await page.getByRole('button', { name: 'Dene (TEST)' }).click();
    const onay = page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' });
    await expect(onay).toContainText('1. Ornek › Giriş');
    await onay.getByRole('button', { name: 'Dene' }).click();
    const sonuc = page.locator('.akis-sonucu');
    await expect(sonuc).toContainText('2 adım başarılı');
    await expect(sonuc.locator('li')).toHaveCount(2);
    await expect(sonuc).toContainText('Token = ***');
    const teklif = soap.istekler.slice(once)[1];
    expect(teklif.basliklar.authorization).toMatch(/^Bearer tok-\d+$/);
    expect(await page.content()).not.toMatch(/tok-\d/);
    // Liste: akış görünür, son koşu başarılı.
    await page.goto(`/#/servisler/s/${servisId}/akislar`);
    await expect(page.getByRole('table', { name: 'Servis akışları' })).toContainText('Giriş → Teklif');
    // Düzenleyicideki Dene (kaydedilmemiş hâl) koşusu akışa bağlanır: Son koşu dolu.
    await expect(page.getByRole('row', { name: /Giriş → Teklif/ })).toContainText('Başarılı');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('alan formunda "Akıştan (önceki adım)" kaynağı: alan ${akis:PolicyNo} olur; XML ↔ form korunur', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    await expect(form).toBeVisible();
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    await satir('Channel').getByLabel('Channel değer kaynağı').selectOption('akis');
    await satir('Channel').getByLabel('Channel akış değeri adı').fill('PolicyNo');
    await page.getByRole('tab', { name: 'Gövde (XML)' }).click();
    await expect(page.getByLabel('İstek gövdesi (SOAP zarfı)')).toHaveValue(/<Channel>\$\{akis:PolicyNo\}<\/Channel>/);
    await page.getByRole('tab', { name: 'Alanlar' }).click();
    await expect(satir('Channel').getByLabel('Channel değer kaynağı')).toHaveValue('akis');
    await expect(satir('Channel').getByLabel('Channel akış değeri adı')).toHaveValue('PolicyNo');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('oturum akışı servise atanır; senaryo düzenleyicide HTTP başlıkları görünür ve kaydedilir', async () => {
    test.setTimeout(60_000);
    const { servis, senaryolar } = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const giris = senaryolar.find((x: Nesne) => x.baslik === 'Giriş');
    const teklif = senaryolar.find((x: Nesne) => x.baslik === 'Teklif');
    const oturumId = String((await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Giriş oturumu', tur: 'oturum', icerik: {
      adimlar: [{ ad: 'Giriş', servisId, senaryoId: giris.id, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], omurSaniye: 600 } })).id);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/akislar`);
    await page.getByLabel('Oturum akışı').selectOption({ label: 'Giriş oturumu' });
    await expect(page.getByText('✓ Kaydedildi')).toBeVisible();
    expect((await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis.ayarlar.oturumAkisi).toBe(oturumId);
    expect(servis.ad).toBe('Ornek');
    // Oturum akışı atanmışken silinemez.
    const red = await api('/platform/servis-akisi/sil', { projeId, id: oturumId });
    expect(String(red.mesaj)).toContain('oturum akışı');
    // Senaryo düzenleyici: başlıklar.
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${teklif.id}`);
    const basliklar = page.getByLabel('HTTP header');
    await expect(basliklar).toHaveValue('Authorization: Bearer ${akis:Token}');
    await basliklar.fill('Authorization: Bearer ${akis:Token}\nX-Kanal: web');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar.find((x: Nesne) => x.id === teklif.id).icerik.basliklar)
      .toEqual({ Authorization: 'Bearer ${akis:Token}', 'X-Kanal': 'web' });
    // Tek senaryo Dene: token oturumdan gelir.
    const d = await basarili('/platform/servis/senaryo/dene', { projeId, servisId, ortamId: (await basarili(`/platform/ortamlar?projeId=${projeId}`)).ortamlar[0].id, senaryoId: teklif.id });
    expect(d.sonuc.durum).toBe('basarili');
    expect(d.sonuc.oturum).toMatchObject({ akis: 'Giriş oturumu' });
    expect(JSON.stringify(d)).not.toMatch(/tok-\d/);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
