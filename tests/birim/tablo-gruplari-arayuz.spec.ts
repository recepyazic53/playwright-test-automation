// UÇTAN UCA (yerel) — Ayarlar > Test verisi > Tablolar listesinin GRUPLARI (yalnız görünüm; veri değişmez): "Kişi ve kayıt
// verileri" ve "Ekran listeleri" (ölçüt önce tablo türü; yoksa kaynaklı tablolar + tek sütunlu "<Ekran> — <Alan>" adları; ekran başına alt grup), grup sayıları,
// tüm gruplarda arama, açık / kapalı durumunun tarayıcıda hatırlanması, telefonda taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici DB.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Tablo-${randomBytes(6).toString('hex')}`;
const EKRAN_KLASORU = process.env.TABLO_GRUPLARI_EKRAN_KLASORU;
const UZUN_AD = 'Kurumsal müşteri bilgileri ve iletişim tercihleri (tümü)';
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
  tabloKaydet(vt, { projeId, ad: 'Liste A', sutunlar: [{ ad: 'Değer' }], kaynak: { tur: 'paket', ekran: 'Fatura' } });
  // Tablo türü sezgiden önce gelir: paketten gelen kişi / kayıt tablosu (adı ve kaynağı ekran listesine benzese de) kayıt grubunda;
  // çok sütunlu ama türü "liste" olan tablo ekran listesidir.
  tabloKaydet(vt, { projeId, ad: 'Başvuru — Müşteri kayıtları', sutunlar: [{ ad: 'Ad' }], kaynak: { tur: 'paket', ekran: 'Başvuru', tabloTuru: 'kayit' } });
  tabloKaydet(vt, { projeId, ad: 'Adres kodları', sutunlar: [{ ad: 'İl' }, { ad: 'Kod' }], kaynak: { tur: 'kayit', ekran: 'Adres', tabloTuru: 'liste' } });
  // Eski veri (tür ve kaynak yok): çok sütunlu "<Ekran> — <…>" bağımlı listesi bir ekranın alan bağlarında kullanılıyorsa ya da
  // "<Ekran>" kısmı bir ekranın adıysa ekran listesidir; ikisi de değilse kayıt verisi kalır.
  const bagimli = tabloKaydet(vt, { projeId, ad: 'Rezervasyon (akış) — Kapsam, Alternatif, Ülke', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }, { ad: 'Ülke' }],
    satirlar: Array.from({ length: 1192 }, (_, i) => ({ degerler: { Kapsam: `K${i % 9}`, Alternatif: `A${i % 5}`, Ülke: `Ü${i % 40}` } })) });
  ekranKaydet(vt, { projeId, anahtar: 'odeme', ad: 'Ödeme', ayarlar: { alanBaglari: { kapsam: { tablo: bagimli, sutun: 'Kapsam' } } } });
  ekranKaydet(vt, { projeId, anahtar: 'siparis-ekrani', ad: 'Sipariş ekranı' });
  tabloKaydet(vt, { projeId, ad: 'Sipariş ekranı (akış) — Tür, Alt tür', sutunlar: [{ ad: 'Tür' }, { ad: 'Alt tür' }] });
  tabloKaydet(vt, { projeId, ad: 'Rapor — Dönem, Tür', sutunlar: [{ ad: 'Dönem' }, { ad: 'Tür' }] });
  // Uzun adlar (liste paneli taşmamalı; ad "…" ile kısalır, tam ad ipucunda).
  tabloKaydet(vt, { projeId, ad: UZUN_AD, sutunlar: [{ ad: 'Ad' }, { ad: 'Kanal' }] });
  for (let i = 0; i < 40; i++) tabloKaydet(vt, { projeId, ad: `Abonelik yenileme ve güncelleme ekranı — Uzun alan adı ${i + 1}`.slice(0, 60), sutunlar: [{ ad: 'Değer' }] });
  projeKaydet(vt, { ad: 'Yeni boş proje' });
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
  await expect(kayit).toContainText('4');
  await expect(ekran).toContainText('46');
  await expect(liste.getByRole('group', { name: 'Rezervasyon (akış)' })).toContainText('Rezervasyon (akış) — Kapsam, Alternatif, Ülke');
  await expect(liste.getByRole('group', { name: 'Sipariş ekranı (akış)' })).toContainText('Tür, Alt tür');
  await expect(liste.getByRole('group', { name: 'Kişi ve kayıt verileri' })).toContainText('Rapor — Dönem, Tür');
  await expect(liste.getByRole('group', { name: 'Kişi ve kayıt verileri' })).toContainText('Başvuru — Müşteri kayıtları');
  await expect(liste.getByRole('group', { name: 'Adres' })).toContainText('Adres kodları');
  await expect(liste.getByRole('group', { name: 'Kişi ve kayıt verileri' })).toContainText('Test kişileri');
  const basvuru = liste.getByRole('button', { name: /^Başvuru\s*2$/ });
  await expect(basvuru).toBeVisible();
  await expect(liste.getByRole('group', { name: 'Fatura' })).toContainText('Liste A');
  // Kapat → yeniden yükleyince kapalı kalır (seçili tablonun grubu ise hep açık gelir).
  const fatura = liste.getByRole('button', { name: /^Fatura\s*1$/ });
  await fatura.click();
  await expect(fatura).toHaveAttribute('aria-expanded', 'false');
  await expect(liste.getByRole('group', { name: 'Fatura' })).toBeHidden();
  await page.reload();
  await expect(liste.getByRole('button', { name: /^Fatura\s*1$/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(liste.getByRole('button', { name: /^Başvuru\s*2$/ })).toHaveAttribute('aria-expanded', 'true');
  // Arama tüm gruplarda çalışır; eşleşen grup açılır.
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('liste a');
  await expect(liste.getByRole('group', { name: 'Fatura' })).toBeVisible(); // kapalı grup aramada açılır
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('kanal');
  await expect(liste.getByRole('group', { name: 'Başvuru' })).toBeVisible();
  await expect(liste.locator('.tablo-ogesi:visible')).toHaveCount(1);
  await expect(liste.locator('.tablo-ogesi')).toContainText('Başvuru — Kanal');
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('yok-boyle-tablo');
  await expect(liste).toContainText('Aramayla eşleşen tablo yok.');
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('');
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('uzun adlar ve büyük tablo: liste paneli taşmaz (ad "…" + tam ad ipucu), sayfa yatay kaymaz; 1400 / 1024 / 390', async () => {
  test.setTimeout(90_000);
  for (const [genislik, yukseklik] of [[1400, 900], [1024, 800], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    await page.goto('/#/ayarlar/test-verisi');
    const liste = page.getByRole('navigation', { name: 'Tablolar' });
    const uzun = liste.locator('.tablo-ogesi').filter({ hasText: UZUN_AD });
    await expect(uzun.locator('.tablo-adi')).toHaveAttribute('title', UZUN_AD);
    await liste.locator('.tablo-ogesi').filter({ hasText: 'Rezervasyon (akış) — Kapsam' }).click();
    await expect(page.getByRole('region', { name: 'Tablo düzenleyici' }).getByLabel('1. satır Kapsam', { exact: true })).toHaveValue('K0');
    const olcum = await page.evaluate(() => {
      const panel = document.querySelector('.tablo-listesi') as HTMLElement;
      const p = panel.getBoundingClientRect();
      const tasan = [...panel.querySelectorAll('.tablo-ogesi, .tablo-adi, .tablo-grubu-baslik, .adet')].filter((e) => e.getBoundingClientRect().right > p.right + 1).length;
      const kisalan = [...panel.querySelectorAll('.tablo-adi-metni')].some((e) => e.scrollWidth > e.clientWidth);
      const duz = document.querySelector('.tablo-duzenleyici') as HTMLElement;
      return { sayfa: document.documentElement.scrollWidth - innerWidth, tasan, kisalan, duzSag: Math.round(duz.getBoundingClientRect().right - innerWidth) };
    });
    expect(olcum, `${genislik}px`).toMatchObject({ tasan: 0, kisalan: true });
    expect(olcum.sayfa, `${genislik}px sayfa taşması`).toBeLessThanOrEqual(2);
    expect(olcum.duzSag, `${genislik}px düzenleyici sağdan kesilmez`).toBeLessThanOrEqual(0);
    if (EKRAN_KLASORU) {
      for (const renk of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: renk });
        await page.screenshot({ path: join(EKRAN_KLASORU, `test-verisi-${genislik}-${renk === 'dark' ? 'koyu' : 'acik'}.png`) });
      }
    }
    await baglam.close();
  }
});

test('hiç tablo yokken: boş grup başlığı yok, tek boş durum mesajı', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  await page.locator('.proje-secici').click();
  await page.locator('.proje-menusu').getByRole('menuitemradio', { name: 'Yeni boş proje' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText('Yeni boş proje');
  await page.evaluate(() => { location.hash = '#/ayarlar/test-verisi'; });
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  await expect(liste.getByRole('button', { name: 'Tablo ekle' })).toBeVisible();
  await expect(liste.locator('.tablo-grubu')).toHaveCount(0);
  await expect(liste.getByRole('searchbox')).toBeHidden();
  await expect(page.getByText('Henüz tablo yok.')).toHaveCount(1);
  await expect(page.getByText('Tablo yok.', { exact: true })).toHaveCount(0);
  await baglam.close();
});
