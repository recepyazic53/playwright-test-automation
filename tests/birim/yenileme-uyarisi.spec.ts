// ARAYÜZ — Nöbetçi yeniden başlatılınca (oturum token'ı değişir, istekler 401 alır) açık sekme "sayfayı yenileyin" bandı
// gösterir; bant bir kez eklenir; "Sayfayı yenile" sayfayı yeniden yükler. Geçici Nöbetçi örneği; dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Yenile-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let klasor = '';

test.beforeAll(async () => {
  test.setTimeout(90_000);
  klasor = mkdtempSync(join(tmpdir(), 'yenileme-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
  expect((await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Yenileme Projesi' })).basarili).toBe(true);
});

test.afterAll(() => {
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('sunucu 401 dönünce (yeniden başlatıldı) yenileme bandı çıkar; "Sayfayı yenile" sayfayı yeniden yükler', async () => {
  test.setTimeout(60_000);
  const tarayici = await chromium.launch();
  const page = await (await tarayici.newContext({ baseURL: nobetci.adres })).newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto('/#/sonuclar');
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible();
  const bant = page.locator('.yenileme-bandi');
  await expect(bant).toHaveCount(0);

  // Yeniden başlatma: token artık geçmez.
  await page.route('**/platform/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ basarili: false, mesaj: 'Geçersiz token.' }) }));
  await page.goto('/#/senaryolar');
  await expect(bant).toBeVisible();
  await expect(bant).toContainText('Nöbetçi yeniden başlatıldı');
  await page.goto('/#/ekranlar');
  await expect(bant).toHaveCount(1);

  await page.unroute('**/platform/**');
  await bant.getByRole('button', { name: 'Sayfayı yenile' }).click();
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible();
  await expect(bant).toHaveCount(0);
  expect(hatalar).toEqual([]);
  await tarayici.close();
});
