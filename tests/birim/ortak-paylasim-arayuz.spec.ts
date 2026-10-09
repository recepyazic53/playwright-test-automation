// KORUMA TESTLERİ — Ayarlar > Yedekleme > Ekip paylaşımı: klasör seçimi, Yayınla, yeni sürüm uyarısı (Yayınla kilitlenir),
// Güncelle (kasa parolası → içe aktarma önizlemesi → uygula) ve ardından güncel durum. Yalnız 127.0.0.1'deki geçici Nöbetçi.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

test.describe('Ayarlar > Yedekleme > Ekip paylaşımı', () => {
  const PAROLA = `Gecici-Ortak-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ortak-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    const proje = projeKaydet(vt, { ad: 'Ortak Proje' });
    const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'form', ad: 'Form' });
    senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 1 } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'Ayşe' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('klasör seç → yayınla → başkası yeni sürüm koyunca uyarı + Yayınla kilitli → Güncelle → güncel', async () => {
    test.setTimeout(90_000);
    const paylasim = join(klasor, 'paylasim');
    mkdirSync(paylasim);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1100 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/yedekleme');
    const kart = page.getByRole('group', { name: 'Ekip paylaşımı' });
    await expect(kart).toBeVisible();
    await expect(kart.getByRole('button', { name: 'Yayınla' })).toHaveCount(0);

    // Yayınlardaki ad: dosyayı açarken girilen kullanıcı adı (Ayarlar > Ekip); kartta ayrıca yazılmaz.
    await expect(kart).toContainText('Yayınlarda adınız: Ayşe');
    expect((await nobetciApi(nobetci, '/platform/ortak/durum') as unknown as { kullaniciAdi?: string }).kullaniciAdi).toBe('Ayşe');
    await kart.getByLabel('Ortak klasör (tam yol)').fill(paylasim);
    await kart.getByRole('button', { name: 'Kaydet' }).click();
    await expect(kart.getByText('Klasörde henüz yayınlanmış sürüm yok.')).toBeVisible();

    await kart.getByLabel('Sürüm notu').fill('ilk sürüm');
    await kart.getByRole('button', { name: 'Yayınla' }).click();
    await expect(kart.getByText('Güncelsiniz (v1).')).toBeVisible();
    await expect(kart.getByText(/v1 · .* · ilk sürüm/)).toBeVisible();

    // Başka bir ekip üyesi v2 yayınladı (dosya + sürüm listesi).
    const liste = JSON.parse(readFileSync(join(paylasim, 'ortak.json'), 'utf8')) as { surumler: Array<Record<string, unknown>> };
    const v1 = liste.surumler[0];
    const v2Dosya = String(v1.dosya).replace('ortak-0001', 'ortak-0002');
    copyFileSync(join(paylasim, String(v1.dosya)), join(paylasim, v2Dosya));
    liste.surumler.push({ ...v1, surum: 2, dosya: v2Dosya, yapan: 'baska-uye', not: 'ikinci' });
    writeFileSync(join(paylasim, 'ortak.json'), JSON.stringify(liste), 'utf8');

    await page.reload();
    await expect(kart.getByText(/Yeni sürüm var: v2/)).toBeVisible();
    await expect(kart.getByRole('button', { name: 'Yayınla' })).toBeDisabled();

    await kart.getByRole('button', { name: 'Güncelle' }).click();
    await page.getByRole('textbox', { name: /Ekibin ortak kasa parolası/ }).fill(PAROLA);
    await page.getByRole('button', { name: 'Önizle' }).click();
    // Ekip güncellemesi sürümün tamamını alır: işaret kaldırılamaz, seçim düğmeleri yok.
    await expect(page.getByRole('button', { name: 'Güncellemeyi uygula' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ekip güncellemesinde sürümün tamamı alınır')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hiçbirini seçme' })).toHaveCount(0);
    for (const k of await page.locator('input[type="checkbox"].uc-durumlu').all()) await expect(k).toBeDisabled();
    await page.getByRole('button', { name: 'Güncellemeyi uygula' }).click();
    await page.getByRole('button', { name: 'Devam' }).click();

    await expect(kart.getByText('Güncelsiniz (v2).')).toBeVisible();
    await expect(kart.getByRole('button', { name: 'Yayınla' })).toBeEnabled();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
