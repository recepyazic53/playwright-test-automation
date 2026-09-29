// KORUMA TESTLERİ — Saklama sadeleştirmesi (S2): dört saklama kuralı (koşu sonuçlarını sakla, medyayı incelt, rapor saklama,
// video saklama) Ayarlar > Yedekleme'de TEK "Saklama" kartında ve tek zaman çizelgesinde. Ayar anahtarları ve davranış aynı:
// ilk üçü koşu ayarlarında, video saklama güvenlik ayarında (medya) kalır; kayıtlı değerler korunur, tek Kaydet ikisini yazar.
// Güvenlik sayfasında yalnız bağlantı kalır. Güvenlik: yalnız 127.0.0.1'deki geçici Nöbetçi; dışarıya istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

test.describe('Ayarlar > Yedekleme > Saklama', () => {
  const PAROLA = `Gecici-Saklama-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'saklama-karti-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(vt, { ad: 'Saklama Projesi' });
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

  test('dört kural tek kartta, kayıtlı değerler korunur, çizelge sıralı; tek Kaydet iki ayarı da yazar; Güvenlik\'te bağlantı; 390 px taşmasız', async () => {
    test.setTimeout(90_000);
    // Önceden kayıtlı (varsayılan dışı) değerler: eski yerlerindeki anahtarlarla.
    expect((await nobetciApi(nobetci, '/platform/kosu-ayarlari/kaydet', { ayarlar: { sonucSaklamaGun: 200, medyaInceltme: 'hatali', medyaInceltmeGun: 45, medyaInceltmeKoru: false, raporSaklamaGun: '180', otomatikYedekSayisi: 12 } })).basarili).toBe(true);
    expect(await nobetciApi(nobetci, '/platform/guvenlik/kaydet', { videoSaklamaGun: 12 })).toMatchObject({ basarili: true, videoSaklamaGun: 12 });

    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/yedekleme');
    const kart = page.getByRole('form', { name: 'Saklama ayarları' });
    await expect(kart.getByRole('heading', { name: 'Saklama' })).toBeVisible();
    // Dört kural (medya inceltme 3 alan) + otomatik yedek aynı kartta, kayıtlı değerleriyle.
    await expect(kart.getByLabel('Koşu sonuçlarını sakla (gün)')).toHaveValue('200');
    await expect(kart.getByLabel('Eski sonuçlarda medyayı incelt')).toHaveValue('hatali');
    await expect(kart.getByLabel('Medyayı incelt: şu günden eski (gün)')).toHaveValue('45');
    await expect(kart.getByLabel(/kalan adımın görüntüsünü ve test sonu görüntüsünü koru/)).not.toBeChecked();
    await expect(kart.getByLabel('Rapor saklama süresi')).toHaveValue('180');
    await expect(kart.getByLabel(/Video saklama süresi \(gün\)/)).toHaveValue('12');
    await expect(kart.getByLabel('Saklanacak otomatik yedek (adet)')).toHaveValue('12');
    // Başka bir kartta saklama alanı kalmadı.
    await expect(page.getByLabel(/Video saklama süresi/)).toHaveCount(1);
    await expect(page.getByLabel('Koşu sonuçlarını sakla (gün)')).toHaveCount(1);

    // Zaman çizelgesi: gün sırasıyla; video saklama güvenlik amaçlı (kalkan).
    const cizelge = kart.getByRole('list', { name: 'Saklama zaman çizelgesi' });
    await expect(cizelge.locator('li .gun')).toHaveText(['12 gün', '45 gün', '180 gün', '200 gün']);
    await expect(cizelge.locator('li').nth(0)).toContainText('tüm videolar silinir');
    await expect(cizelge.locator('li.guvenlik-kurali')).toHaveCount(1);
    await expect(cizelge.locator('li').nth(1)).toContainText('kalan testlerin ekran görüntüleri ve videoları');
    await expect(cizelge.locator('li').nth(2)).toContainText('PDF raporlar');
    await expect(cizelge.locator('li').nth(3)).toContainText('koşu sonucunun tamamı');
    await expect(kart.locator('.saklama-ozeti')).toContainText('200 gün sonra o koşunun sonucu kalmaz');

    // Canlı güncelleme: sonuç süresiz → "süresiz" satırı, özet en uzun kurala (180 gün) göre.
    await kart.getByLabel('Koşu sonuçlarını sakla (gün)').fill('0');
    await expect(cizelge.locator('li .gun')).toHaveText(['12 gün', '45 gün', '180 gün', 'süresiz']);
    await expect(kart.locator('.saklama-ozeti')).toContainText('180 gün sonra elinizde kalan: durum, süre, hata metni, adımlar ve iz, başarılı testlerin ekran görüntüleri');

    // Geçersiz video süresi kaydedilmez (hiçbir ayar yazılmaz).
    await kart.getByLabel(/Video saklama süresi \(gün\)/).fill('400');
    await kart.getByRole('button', { name: 'Kaydet' }).click();
    await expect(kart.getByText('1 ile 365 arasında bir tam sayı girin.')).toBeVisible();
    expect(((await nobetciApi(nobetci, '/platform/kosu-ayarlari')).ayarlar as Record<string, unknown>).sonucSaklamaGun).toBe(200);
    // Tek Kaydet: koşu ayarları (sonuç saklama) ve güvenlik ayarı (video saklama) aynı anahtarlarla yazılır.
    await kart.getByLabel(/Video saklama süresi \(gün\)/).fill('20');
    await kart.getByRole('button', { name: 'Kaydet' }).click();
    await expect(kart.getByText('Saklama ayarları kaydedildi')).toBeVisible();
    expect((await nobetciApi(nobetci, '/platform/kosu-ayarlari')).ayarlar).toMatchObject({ sonucSaklamaGun: 0, medyaInceltme: 'hatali', medyaInceltmeGun: 45, medyaInceltmeKoru: false, raporSaklamaGun: '180', otomatikYedekSayisi: 12 });
    expect(await nobetciApi(nobetci, '/platform/guvenlik')).toMatchObject({ videoSaklamaGun: 20 });

    // Güvenlik: video saklama alanı yok, mevcut değer + Yedekleme'ye bağlantı.
    await page.goto('/#/ayarlar/guvenlik');
    const vs = page.getByRole('group', { name: 'Video saklama süresi' });
    await expect(vs).toContainText('Şu an: 20 gün');
    await expect(vs.locator('input')).toHaveCount(0);
    await vs.getByRole('link', { name: /Saklama'ya git/ }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/yedekleme$/);
    await expect(page.getByRole('form', { name: 'Saklama ayarları' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
