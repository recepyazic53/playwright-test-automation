// UÇTAN UCA (yerel) — Ayarlar > Test verisi > Tablolar listesinin GRUPLARI (yalnız görünüm; veri değişmez): "Kişi ve kayıt
// verileri" ve "Ekran listeleri" (ölçüt önce tablo türü; yoksa kaynaklı tablolar + tek sütunlu "<Ekran> — <Alan>" adları; ekran başına alt grup), grup sayıları,
// tüm gruplarda arama, açık / kapalı durumunun tarayıcıda hatırlanması, telefonda taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici DB.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Tablo-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'tablo-gruplari-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Tablo Projesi' });
  tabloKaydet(vt, { projeId, ad: 'Test kişileri', sutunlar: [{ ad: 'Ad' }, { ad: 'Soyad' }], satirlar: [{ degerler: { Ad: 'Deneme', Soyad: 'Kişi' } }] });
  tabloKaydet(vt, { projeId, ad: 'Başvuru — İl', sutunlar: [{ ad: 'Değer' }], satirlar: [{ degerler: { Değer: 'Ankara' } }] });
  tabloKaydet(vt, { projeId, ad: 'Başvuru — Kanal', sutunlar: [{ ad: 'Değer' }] });
  tabloKaydet(vt, { projeId, ad: 'Liste A', sutunlar: [{ ad: 'Değer' }], kaynak: { tur: 'paket', ekran: 'Poliçe' } });
  // Tablo türü sezgiden önce gelir: paketten gelen kişi / kayıt tablosu (adı ve kaynağı ekran listesine benzese de) kayıt grubunda;
  // çok sütunlu ama türü "liste" olan tablo ekran listesidir.
  tabloKaydet(vt, { projeId, ad: 'Başvuru — Müşteri kayıtları', sutunlar: [{ ad: 'Ad' }], kaynak: { tur: 'paket', ekran: 'Başvuru', tabloTuru: 'kayit' } });
  tabloKaydet(vt, { projeId, ad: 'Adres kodları', sutunlar: [{ ad: 'İl' }, { ad: 'Kod' }], kaynak: { tur: 'kayit', ekran: 'Adres', tabloTuru: 'liste' } });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('gruplar, sayılar, arama ve hatırlanan açık / kapalı durumu; telefonda taşma yok', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto('/#/ayarlar/test-verisi');
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  const kayit = liste.getByRole('button', { name: /Kişi ve kayıt verileri/ });
  const ekran = liste.getByRole('button', { name: /^Ekran listeleri/ });
  await expect(kayit).toContainText('2');
  await expect(ekran).toContainText('4');
  await expect(liste.getByRole('group', { name: 'Kişi ve kayıt verileri' })).toContainText('Başvuru — Müşteri kayıtları');
  await expect(liste.getByRole('group', { name: 'Adres' })).toContainText('Adres kodları');
  await expect(liste.getByRole('group', { name: 'Kişi ve kayıt verileri' })).toContainText('Test kişileri');
  const basvuru = liste.getByRole('button', { name: /^Başvuru\s*2$/ });
  await expect(basvuru).toBeVisible();
  await expect(liste.getByRole('group', { name: 'Poliçe' })).toContainText('Liste A');
  // Kapat → yeniden yükleyince kapalı kalır (seçili tablonun grubu ise hep açık gelir).
  const police = liste.getByRole('button', { name: /^Poliçe\s*1$/ });
  await police.click();
  await expect(police).toHaveAttribute('aria-expanded', 'false');
  await expect(liste.getByRole('group', { name: 'Poliçe' })).toBeHidden();
  await page.reload();
  await expect(liste.getByRole('button', { name: /^Poliçe\s*1$/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(liste.getByRole('button', { name: /^Başvuru\s*2$/ })).toHaveAttribute('aria-expanded', 'true');
  // Arama tüm gruplarda çalışır; eşleşen grup açılır.
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('liste a');
  await expect(liste.getByRole('group', { name: 'Poliçe' })).toBeVisible(); // kapalı grup aramada açılır
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('kanal');
  await expect(liste.getByRole('group', { name: 'Başvuru' })).toBeVisible();
  await expect(liste.locator('.tablo-ogesi:visible')).toHaveCount(1);
  await expect(liste.locator('.tablo-ogesi')).toContainText('Başvuru — Kanal');
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('yok-boyle-tablo');
  await expect(liste).toContainText('Aramayla eşleşen tablo yok.');
  // Telefon: yatay taşma yok.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Tablolar' })).toBeVisible();
  const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tasma).toBeLessThanOrEqual(2);
  expect(hatalar).toEqual([]);
  await baglam.close();
});
