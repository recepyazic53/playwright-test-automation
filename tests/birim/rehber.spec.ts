// KORUMA TESTLERİ — Ekran rehberleri: tercih ve "görüldü" listesi kasada (Ayarlar > Arayüz), ilk girişte önce genel tanıtım
// sonra ekranın rehberi kendiliğinden açılır (otomatik sürülen tarayıcıda yalnızca açıkça istenince), "?" her zaman yeniden
// açar, klavyeyle gezilir, bitince / kapatılınca görüldü sayılır. İçerikte ürün / şirket adı yoktur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { rehberAyarlariniKaydet, rehberAyarlariniOku } from '../../scripts/platform/ayarlar/rehber-ayarlari.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { YASAK_SOZCUK_DESENI } from './yasak-sozcukler';

const KOK = join(__dirname, '..', '..');

test('rehber ayarları: varsayılan otomatik, görülenler tekil, sıfırlama, doğrulama, kasada şifreli, ortam değişkeniyle kapatma', async () => {
  const klasor = geciciKlasor('rehber-ayar');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  const onceki = process.env.NOBETCI_REHBER_OTOMATIK;
  try {
    await kasaOlustur(vt, 'Gecici-Rehber-1', { kdf: HIZLI_KDF });
    delete process.env.NOBETCI_REHBER_OTOMATIK;
    expect(rehberAyarlariniOku(vt)).toEqual({ otomatik: true, gorulenler: [], ortamKapali: false });
    rehberAyarlariniKaydet(vt, { gorulen: 'senaryolar' });
    expect(rehberAyarlariniKaydet(vt, { gorulen: 'senaryolar' }).gorulenler).toEqual(['senaryolar']);
    expect(rehberAyarlariniKaydet(vt, { otomatik: false })).toMatchObject({ otomatik: false, gorulenler: ['senaryolar'] });
    expect(() => rehberAyarlariniKaydet(vt, { gorulen: '../x' })).toThrow('Geçersiz rehber');
    expect(() => rehberAyarlariniKaydet(vt, { otomatik: 'evet' })).toThrow('true ya da false');
    expect(rehberAyarlariniKaydet(vt, { sifirla: true, otomatik: true })).toMatchObject({ otomatik: true, gorulenler: [] });
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'rehber'")?.deger_json)).toMatch(/^kasa:v1:/);
    process.env.NOBETCI_REHBER_OTOMATIK = '0';
    expect(rehberAyarlariniOku(vt)).toMatchObject({ otomatik: false, ortamKapali: true });
  } finally {
    if (onceki === undefined) delete process.env.NOBETCI_REHBER_OTOMATIK; else process.env.NOBETCI_REHBER_OTOMATIK = onceki;
    vt.kapat();
    klasor.temizle();
  }
});

test('rehber içerikleri: ürün/şirket adı içermez; her rehberin adımı ve başlığı var', () => {
  const metin = readFileSync(join(KOK, 'scripts', 'platform', 'arayuz', 'rehber-icerikleri.js'), 'utf8');
  expect(metin).not.toMatch(YASAK_SOZCUK_DESENI);
  const anahtarlar = [...metin.matchAll(/^ {2}(?:'([a-z0-9-]+)'|([a-z0-9]+)): \{/gm)].map((m) => m[1] || m[2]);
  expect(anahtarlar).toEqual(expect.arrayContaining(['genel', 'sonuclar', 'senaryolar', 'senaryo-formu', 'servisler', 'servis-akislari', 'ekranlar', 'ekran',
    'akis-tasarimi', 'ayarlar-proje', 'ayarlar-giris', 'ayarlar-test-verisi', 'ayarlar-kosu', 'ayarlar-arayuz']));
});

test.describe('Rehber arayüzü', () => {
  const PAROLA = `Gecici-RehberUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'rehber-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Rehber Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const rehberKarti = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });

  test('otomatik sürülen tarayıcıda kendiliğinden açılmaz; "?" açar, klavyeyle gezilir, Esc kapatır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/senaryolar');
    await expect(page.getByRole('heading', { name: /Senaryolar/ }).first()).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(rehberKarti(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
    const kart = rehberKarti(page);
    await expect(kart).toBeVisible();
    await expect(kart.getByRole('heading', { name: 'Senaryolar ekranı' })).toBeVisible();
    await expect(kart.getByRole('button', { name: 'İleri' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(kart.locator('.rehber-sayac')).toHaveText(/^2 \//);
    await page.keyboard.press('ArrowLeft');
    await expect(kart.locator('.rehber-sayac')).toHaveText(/^1 \//);
    await page.keyboard.press('Escape');
    await expect(kart).toHaveCount(0);
    // Kapatılan rehber "görüldü" sayılır.
    await expect.poll(async () => ((await nobetciApi(nobetci, '/platform/rehber')) as { rehber: { gorulenler: string[] } }).rehber.gorulenler).toContain('senaryolar');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('ilk girişte önce genel tanıtım, sonra ekranın rehberi; Ayarlar > Arayüz tercihi ve sıfırlama', async () => {
    await nobetciApi(nobetci, '/platform/rehber/kaydet', { sifirla: true, otomatik: true });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    await baglam.addInitScript(() => localStorage.setItem('nobetci-rehber-otomatik', '1'));
    const page = await baglam.newPage();
    await page.goto('/#/ekranlar');
    const kart = rehberKarti(page);
    await expect(kart.getByRole('heading', { name: "Nöbetçi'ye hoş geldiniz" })).toBeVisible({ timeout: 10_000 });
    // Genel tanıtımın sonuna kadar ilerle: "Bitti".
    for (let i = 0; i < 10 && await kart.getByRole('button', { name: 'İleri' }).count(); i++) await kart.getByRole('button', { name: 'İleri' }).click();
    await kart.getByRole('button', { name: 'Bitti' }).click();
    await expect(kart).toHaveCount(0);
    // Başka ekrana geçince o ekranın rehberi kendiliğinden açılır.
    await page.goto('/#/senaryolar');
    await expect(kart.getByRole('heading', { name: 'Senaryolar ekranı' })).toBeVisible({ timeout: 10_000 });
    await kart.getByRole('button', { name: 'Rehberi kapat' }).click();
    // Tercih kapatılınca kendiliğinden açılmaz.
    await page.goto('/#/ayarlar/arayuz');
    await expect(kart).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    const anahtar = page.getByRole('switch', { name: /Rehberleri ilk girişte kendiliğinden göster/ });
    await expect(anahtar).toBeChecked();
    await anahtar.uncheck();
    await expect(page.getByText('Rehberler artık kendiliğinden açılmayacak')).toBeVisible();
    await page.goto('/#/sonuclar');
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(kart).toHaveCount(0);
    // "Tüm rehberleri yeniden göster" görülenleri sıfırlar.
    await page.goto('/#/ayarlar/arayuz');
    await page.getByRole('button', { name: 'Tüm rehberleri yeniden göster' }).click();
    await expect(page.getByText('Tüm rehberler yeniden "görülmemiş" sayıldı')).toBeVisible();
    expect(((await nobetciApi(nobetci, '/platform/rehber')) as { rehber: { gorulenler: string[]; otomatik: boolean } }).rehber).toMatchObject({ gorulenler: [], otomatik: false });
    await baglam.close();
  });
});
