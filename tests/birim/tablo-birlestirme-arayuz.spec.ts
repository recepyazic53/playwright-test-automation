// UÇTAN UCA (yerel) — Ayarlar > Test verisi > Veri sağlığı ve tablo birleştirme arayüzü: özet (benzer / kullanılmayan / boş sütun),
// birleştirme penceresi (kalacak tablo kullanım sayılarıyla, satır çakışması maskeli, kuru doğrulama), onaylı birleştirme, geri alma;
// yeni tablo kaydında "Benzer tablo var" önlemesi; masaüstü ve 390px'te yatay taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici DB.
// Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { servisKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Saglik-${randomBytes(6).toString('hex')}`;
const GIZLI = 'gizli-sifre-77';
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
const tablo: Record<string, string> = {};
let projeId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'tablo-saglik-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  projeId = projeKaydet(vt, { ad: 'Mağaza' });
  tablo.A = tabloKaydet(vt, { projeId, ad: 'Kargo firmaları', sutunlar: [{ ad: 'Firma' }, { ad: 'Takip kodu' }, { ad: 'Anahtar', gizli: true }], satirlar: [
    { ad: 'k1', degerler: { Firma: 'Hızlı Kargo', 'Takip kodu': 'HK', Anahtar: GIZLI } },
    { ad: 'k2', degerler: { Firma: 'Yavaş Kargo', 'Takip kodu': 'YK' } }
  ] });
  tablo.B = tabloKaydet(vt, { projeId, ad: 'Kargo şirketleri (eski)', sutunlar: [{ ad: 'FİRMA' }, { ad: 'takip_kodu' }, { ad: 'Anahtar', gizli: true }], satirlar: [
    { ad: 'k1', degerler: { FİRMA: 'Hızlı Kargo', takip_kodu: 'HK-2', Anahtar: 'gizli-sifre-88' } },
    { ad: 'k3', degerler: { FİRMA: 'Deniz Kargo', takip_kodu: 'DK' } }
  ] });
  tablo.C = tabloKaydet(vt, { projeId, ad: 'Ödeme türleri', sutunlar: [{ ad: 'Tür' }, { ad: 'Açıklama' }] });
  servisKaydet(vt, { projeId, anahtar: 'kargo', ad: 'Kargo servisi', tur: 'rest', ayarlar: { yol: '/api', alanBaglari: { Gonder: { firma: { tablo: tablo.A, sutun: 'Firma' } } } } });
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

const tasma = (page: Page) => page.evaluate(() => {
  const d = document.querySelector('dialog[open]') as HTMLElement | null;
  return { sayfa: document.documentElement.scrollWidth - innerWidth, diyalog: d ? d.scrollWidth - d.clientWidth : 0 };
});

test('veri sağlığı özeti, birleştirme penceresi, onaylı birleştirme ve geri alma; 390px taşma yok', async () => {
  test.setTimeout(90_000);
  for (const [genislik, yukseklik] of [[1280, 900], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    const kart = page.getByRole('region', { name: 'Veri sağlığı' });
    await expect(kart.getByText('Birleştirilebilecek tablolar')).toBeVisible();
    await expect(kart).toContainText('“Kargo firmaları” + “Kargo şirketleri (eski)”');
    await kart.getByText('Hiç kullanılmayan tablolar').click();
    await expect(kart.getByRole('button', { name: 'Ödeme türleri' })).toBeVisible();
    await kart.getByRole('button', { name: 'Birleştir…' }).click();
    const d = page.getByRole('dialog', { name: 'Tabloları birleştir' });
    await expect(d).toContainText('1 servis bağı');
    await expect(d.getByText('en çok kullanılan (önerilen)')).toBeVisible();
    await expect(d).toContainText('farklı (gizli •••)');
    await expect(d).toContainText('Takip kodu: HK → HK-2');
    await expect(d).toContainText('aynı değerleri üretiyorlar');
    expect(await d.innerText()).not.toContain(GIZLI);
    const o = await tasma(page);
    expect(o.sayfa, `${genislik}px sayfa`).toBeLessThanOrEqual(2);
    expect(o.diyalog, `${genislik}px diyalog`).toBeLessThanOrEqual(2);
    if (genislik === 390) { await d.getByRole('button', { name: 'Kapat' }).click(); await baglam.close(); continue; }
    await d.getByRole('combobox', { name: 'k1 satırı için seçim' }).selectOption('kalan');
    await expect(d).toContainText('2 satır kalır, 1 satır eklenir');
    await expect(d.getByRole('button', { name: 'Birleştir', exact: true })).toBeEnabled();
    await d.getByRole('button', { name: 'Birleştir', exact: true }).click();
    await page.getByRole('dialog', { name: 'Tablolar birleştirilsin mi?' }).getByRole('button', { name: 'Birleştir' }).click();
    await expect(page.getByText('Tablolar birleştirildi')).toBeVisible();
    await expect(kart).toContainText('Son birleştirme');
    await expect(kart).toContainText('“Kargo şirketleri (eski)” → “Kargo firmaları”');
    const r = await nobetciApi(nobetci, `/platform/tablolar?projeId=${projeId}`);
    const a = (r.tablolar as Array<{ id: string; satirlar: Array<{ ad: string }> }>).find((t) => t.id === tablo.A);
    expect(a?.satirlar.map((x) => x.ad)).toEqual(['k1', 'k2', 'k3']);
    // Geri al (onaylı).
    await kart.getByRole('button', { name: 'Son birleştirmeyi geri al…' }).click();
    await page.getByRole('dialog', { name: 'Son birleştirme geri alınsın mı?' }).getByRole('button', { name: 'Geri al' }).click();
    await expect(page.getByText('Birleştirme geri alındı.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Veri sağlığı' })).not.toContainText('Son birleştirme');
    expect(hatalar).toEqual([]);
    await baglam.close();
  }
});

test('yeni tablo kaydı: "Benzer tablo var" — onu kullan satırları o tabloya taşır (kaydetmeden)', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  await liste.getByRole('button', { name: 'Tablo ekle' }).click();
  const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
  await duz.getByRole('textbox', { name: 'Tablo adı' }).fill('Ödeme yöntemleri');
  await duz.getByText('Excel\'den yapıştır').click();
  await duz.getByRole('textbox', { name: 'Yapıştırılacak satırlar' }).fill('TÜR\taçıklama\nKapıda\tNakit');
  await duz.getByRole('button', { name: 'Yapıştırılanları ekle' }).click();
  await duz.getByRole('button', { name: 'Kaydet' }).click();
  const soru = page.getByRole('dialog', { name: 'Benzer tablo var' });
  await expect(soru).toContainText('“Ödeme türleri”');
  await soru.getByRole('button', { name: /Onu kullan: “Ödeme türleri”/ }).click();
  await expect(duz.getByRole('textbox', { name: 'Tablo adı' })).toHaveValue('Ödeme türleri');
  await expect(duz.getByLabel('1. satır Tür', { exact: true })).toHaveValue('Kapıda');
  await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
  await baglam.close();
});

test('veri sağlığı: öneriler puana göre; eşik altı (genel sütun adları) varsayılan gizli, "Düşük benzerlikleri de göster"; eşik Ayarlar > Test verisi', async () => {
  test.setTimeout(60_000);
  for (const [ad, deger] of [['Durum kodları', 'Açık'], ['Hata kodları', 'Zaman aşımı']] as const) {
    const y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { projeId, ad, sutunlar: [{ ad: 'Kod' }, { ad: 'Açıklama' }], satirlar: [{ degerler: { Kod: '1', Açıklama: deger } }] });
    expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
  }
  const s = await nobetciApi(nobetci, `/platform/tablolar/veri-sagligi?projeId=${projeId}`) as { benzerlikEsigi: number; benzer: Array<{ adlar: string[]; puan: number }> };
  expect(s.benzerlikEsigi).toBe(50);
  expect(s.benzer.map((b) => b.puan)).toEqual([...s.benzer.map((b) => b.puan)].sort((a, b) => b - a));
  const dusuk = s.benzer.find((b) => b.adlar.includes('Durum kodları'));
  expect(dusuk?.puan).toBeLessThan(50);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const kart = page.getByRole('region', { name: 'Veri sağlığı' });
  await expect(kart).toContainText('“Kargo firmaları” + “Kargo şirketleri (eski)”');
  await expect(kart).not.toContainText('“Durum kodları”');
  await kart.getByRole('button', { name: 'Düşük benzerlikleri de göster (1)' }).click();
  await expect(kart).toContainText('“Durum kodları” + “Hata kodları”');
  // Eşik Ayarlar > Test verisi'nde (sayfanın altındaki form).
  const form = page.getByRole('form', { name: 'Test verisi ayarları' });
  await form.getByLabel(/Birleştirme önerisi eşiği/).fill('10');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Test verisi ayarları kaydedildi.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Veri sağlığı' })).toContainText('“Durum kodları” + “Hata kodları”');
  await expect(page.getByRole('button', { name: /Düşük benzerlikleri de göster/ })).toHaveCount(0);
  await nobetciApi(nobetci, '/platform/kosu-ayarlari/kaydet', { ayarlar: { benzerlikEsigi: 50 } });
  await baglam.close();
});
