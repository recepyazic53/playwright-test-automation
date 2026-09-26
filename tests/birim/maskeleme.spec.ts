// KORUMA TESTLERİ — Ayarlar > Güvenlik > Maskeleme: çekirdek gizli ad listesi (değiştirilemez) + kullanıcının ek adları
// (kasada şifreli). Tek eşleşme kuralı: servis okumaları / başlıkları, eski tablo sütunları ve sayfa paketi taraması aynı
// listeyi kullanır. Arayüzde Güvenlik bölümünde kaydedilir.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { gizliAdMi } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { adGizliMi, ekGizliAdlar, ekGizliAdlariKaydet } from '../../scripts/platform/ayarlar/maskeleme.mjs';
import { okumaGizliMi } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('eşleşme kuralı: uzun parçalar ad içinde, kısa parçalar tam sözcük; büyük/küçük harf ve -, _ yok sayılır', () => {
  for (const ad of ['Password', 'musteri_parola', 'ŞifreTekrar', 'Authorization', 'X-Api-Key', 'accessKey', 'session_id', 'Cookie', 'PinKodu', 'pin', 'totpGizli', 'guvenlikKodu', 'CVV'])
    expect(gizliAdMi(ad), ad).toBe(true);
  for (const ad of ['Shipping', 'Username', 'Channel', 'TeklifNo', 'Opinion', 'Kanal', 'otopark'])
    expect(gizliAdMi(ad), ad).toBe(false);
  expect(gizliAdMi('MusteriAnahtari')).toBe(false);
  expect(gizliAdMi('Musteri_Anahtari', ['musteriAnahtari'])).toBe(true);
  expect(okumaGizliMi({ ad: 'MusteriAnahtari', yol: '//x' }, ['musterianahtari'])).toBe(true);
  expect(okumaGizliMi({ ad: 'Token', yol: '//x', gizli: false })).toBe(false);   // açık işaret önceliklidir
});

test('ek adlar kasada şifreli saklanır; doğrulanır; kasa kilitliyken boş liste', async () => {
  const klasor = geciciKlasor('maskeleme');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    expect(ekGizliAdlar(vt)).toEqual([]);   // kasa yok → boş
    await kasaOlustur(vt, 'Gecici-Maskeleme-1', { kdf: HIZLI_KDF });
    expect(() => ekGizliAdlariKaydet(vt, ['a'])).toThrow('Geçersiz ad');
    expect(() => ekGizliAdlariKaydet(vt, 'x')).toThrow('dizi');
    expect(ekGizliAdlariKaydet(vt, [' musteriAnahtari ', 'musteriAnahtari', 'kurumKodu'])).toEqual(['musteriAnahtari', 'kurumKodu']);
    expect(adGizliMi(vt, 'KURUM_KODU')).toBe(true);
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'maskeleme'")?.deger_json)).toMatch(/^kasa:v1:/);
  } finally { vt.kapat(); klasor.temizle(); }
});

test.describe('Güvenlik > Maskeleme arayüzü', () => {
  const PAROLA = `Gecici-MaskeUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'maskeleme-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Maskeleme Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('çekirdek liste görünür; ek adlar kaydedilir; geçersiz ad reddedilir', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/guvenlik');
    const form = page.getByRole('form', { name: 'Maskeleme' });
    await expect(form).toContainText('parola');
    const liste = form.getByLabel('Ek gizli adlar (her satıra bir ad)');
    await liste.fill('x');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByRole('alert')).toContainText('Geçersiz ad');
    await liste.fill('musteriAnahtari\nkurumKodu');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('2 ek ad kaydedildi.')).toBeVisible();
    expect((await nobetciApi(nobetci, '/platform/maskeleme') as { ekAdlar: string[] }).ekAdlar).toEqual(['musteriAnahtari', 'kurumKodu']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
