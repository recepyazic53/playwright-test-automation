// KORUMA TESTLERİ — Günlük iş nesneleri Ayarlar'dan üst menüye (S3): Sonuçlar · Senaryolar · Ekranlar · Test verisi · Planlı koşular ·
// Ayarlar. Test verisi (#/veri) test verisi tablolarını, Planlı koşular (#/planli-kosular) planlı koşuları gösterir; Ayarlar'da yalnız
// ayarlar kalır. Eski adresler (#/ayarlar/test-verisi, #/ayarlar/baglam, #/ayarlar/zamanlanmis-kosular) yeni yerlere yönlenir;
// uygulama içindeki bağlantılar yeni adresleri kullanır. Güvenlik: yalnız 127.0.0.1'deki geçici Nöbetçi; dışarıya istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const ARAYUZ = resolve(__dirname, '..', '..', 'scripts', 'platform', 'arayuz');

test('uygulama içindeki bağlantılar yeni adresleri kullanır (eski adres yalnız yönlendirme tablosunda)', () => {
  for (const ad of readdirSync(ARAYUZ).filter((d) => /\.m?js$/.test(d))) {
    const metin = readFileSync(join(ARAYUZ, ad), 'utf8');
    expect(metin.match(/['"`]#\/ayarlar\/(test-verisi|baglam|zamanlanmis-kosular)['"`]/g) ?? [], ad).toEqual([]);
    expect(metin.includes('Ayarlar > Test verisi'), `${ad}: eski yol metni`).toBe(false);
    expect(metin.includes('Ayarlar > Koşu > Zamanlanmış'), `${ad}: eski yol metni`).toBe(false);
  }
});

test.describe('Üst menü: Test verisi ve Planlı koşular', () => {
  const PAROLA = `Gecici-UstMenu-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ust-menu-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(vt, { ad: 'Menü Projesi' });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('menü sırası ve adları; Test verisi ve Planlı koşular sayfaları; Ayarlar\'da yalnız ayarlar + "taşındı" bağlantıları; Oluştur menüsü', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar');
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(menu.getByRole('link')).toHaveText(['Sonuçlar', 'Senaryolar', 'Ekranlar', 'Test verisi', 'Planlı koşular', 'Raporlar', 'Ayarlar']);

    await menu.getByRole('link', { name: 'Test verisi' }).click();
    await expect(page).toHaveURL(/#\/veri$/);
    await expect(menu.getByRole('link', { name: 'Test verisi' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: 'Test verisi' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Tablolar' })).toBeVisible();
    await expect(page).toHaveTitle(/^Test verisi/);

    await menu.getByRole('link', { name: 'Planlı koşular' }).click();
    await expect(page).toHaveURL(/#\/planli-kosular$/);
    await expect(menu.getByRole('link', { name: 'Planlı koşular' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: 'Planlı koşular' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Planlı koşu kuralları' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Planlı koşu davranışı' })).toBeVisible();

    // Ayarlar: bölüm listesinde Test verisi yok; "Üst menüye taşındı" bağlantıları yeni yerlere gider.
    await menu.getByRole('link', { name: 'Ayarlar' }).click();
    const bolumler = page.getByRole('navigation', { name: 'Ayarlar bölümleri' });
    await expect(bolumler.getByRole('link')).toHaveText(['Proje ve ortamlar', 'Giriş profilleri', 'Koşu', 'Kurtarma kuralları', 'Hata pencereleri', 'Yedekleme', 'Güvenlik', 'İzinler', 'Entegrasyonlar', 'Raporlar', 'Arayüz']);
    const tasinan = page.getByRole('navigation', { name: 'Üst menüye taşınan sayfalar' });
    await tasinan.getByRole('link', { name: 'Test verisi' }).click();
    await expect(page).toHaveURL(/#\/veri$/);
    await page.goto('/#/ayarlar/kosu');
    await expect(page.locator('.zamanlanmis-kosular')).toHaveCount(0);
    await page.locator('.tasindi-notu').getByRole('link', { name: 'Planlı koşular' }).click();
    await expect(page).toHaveURL(/#\/planli-kosular$/);

    // Oluştur menüsü: Test verisi ve Planlı koşu yeni adreslerde.
    await page.getByRole('button', { name: /Oluştur/ }).first().click();
    await page.getByRole('menuitem', { name: /Test verisi/ }).click();
    await expect(page).toHaveURL(/#\/veri$/);
    await page.getByRole('button', { name: /Oluştur/ }).first().click();
    await page.getByRole('menuitem', { name: /Planlı koşu/ }).click();
    await expect(page).toHaveURL(/#\/planli-kosular$/);

    // Rehber anahtarları: yeni sayfalar ve eski adresler yeni sayfanın rehberini açar.
    const anahtarlar = await page.evaluate(async () => {
      const { rehberAnahtari } = await import('/arayuz/rehber.js' as string);
      return ['#/veri', '#/planli-kosular', '#/ayarlar/test-verisi', '#/ayarlar/zamanlanmis-kosular', '#/ayarlar/kosu'].map((a) => rehberAnahtari(a));
    });
    expect(anahtarlar).toEqual(['veri', 'planli-kosular', 'veri', 'planli-kosular', 'ayarlar-kosu']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('eski adresler yeni yerlere yönlenir (geçmişe eski adres eklenmez)', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    for (const [eski, yeni] of [['#/ayarlar/test-verisi', '#/veri'], ['#/ayarlar/baglam', '#/veri'], ['#/ayarlar/zamanlanmis-kosular', '#/planli-kosular'], ['#/ayarlar/planli-kosular', '#/planli-kosular']]) {
      await page.goto(`/${eski}`);
      await expect(page, eski).toHaveURL(new RegExp(`${yeni.replace(/[/#]/g, '\\$&')}$`));
      await expect(page.getByRole('heading', { level: 2, name: yeni === '#/veri' ? 'Test verisi' : 'Planlı koşular' })).toBeVisible();
    }
    // Uygulama içinden eski adrese gidilince de (ör. eski bir bağlantı) yönlenir.
    await page.goto('/#/sonuclar');
    await page.evaluate(() => { location.hash = '#/ayarlar/test-verisi'; });
    await expect(page).toHaveURL(/#\/veri$/);
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Test verisi' })).toHaveAttribute('aria-current', 'page');
    await baglam.close();
  });

  test('390 px ve ara genişliklerde üst menü taşmaz; etkin öğe görünür', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 844 } });
    const page = await baglam.newPage();
    await page.goto('/#/planli-kosular');
    await expect(page.getByRole('region', { name: 'Planlı koşu kuralları' })).toBeVisible();
    for (const genislik of [390, 768, 1024, 1100, 1200, 1300, 1360, 1440]) {
      await page.setViewportSize({ width: genislik, height: 844 });
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${genislik}px`).toBeLessThanOrEqual(genislik);
      const etkin = await page.locator('.ust-nav [aria-current="page"]').boundingBox();
      expect(etkin && etkin.x >= 0 && etkin.x + etkin.width <= genislik + 1, `${genislik}px: etkin menü öğesi görünür`).toBe(true);
    }
    await baglam.close();
  });
});
