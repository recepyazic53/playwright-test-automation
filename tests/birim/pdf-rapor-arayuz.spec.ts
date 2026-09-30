// UÇTAN UCA (yerel) — DÖNEM RAPORU (PDF) uçları ve arayüzü: geçici veritabanına iki dönemlik sahte ekran / servis koşuları yazılır
// (gerçek Playwright koşusu, dış istek YOK), ayrı bir Nöbetçi (127.0.0.1) başlatılır. Denetlenenler: POST /platform/rapor/pdf
// (application/pdf, %PDF, sayfa > 0, dosya adı, girdi doğrulama, token), POST /platform/rapor/onizle; Sonuçlar'da "Rapor al (PDF)"
// düğmesi → diyalog (kapsam: tek öğe, çoklu kapsamlar ve "Genel" etkin; seçim listesi; dönem + özel aralık; ortam; bölümler),
// önizleme (korumalı iframe), PDF indir (Raporlar'a kaydet); ekran / servis sayfalarından kısayol (kapsam ve seçim dolu);
// Sonuçlar > Raporlar (boş durum, İndir, Aynı seçimlerle yeniden oluştur, Sil); 390 px'te yatay taşma yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { pdfSayfaSayisi } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { SIZINTILAR, raporGirdisi, raporVerisiKur, type RaporFiksturu } from './pdf-rapor-fikstur';

const GORUNTU_KLASORU = process.env.EKRAN_TURU_KLASORU;
const goruntu = async (page: Page, ad: string): Promise<void> => {
  if (GORUNTU_KLASORU) await page.screenshot({ path: join(GORUNTU_KLASORU, `pdf-rapor-${ad}.png`), fullPage: true });
};
const PAROLA = `Gecici-Pdf-${randomBytes(6).toString('hex')}`;
/** Fikstür 15.09–28.09.2026 dönemindedir; sunucunun saati farklı olabileceğinden uçlarda özel aralık verilir. */
const DONEM = { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' };
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: RaporFiksturu;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = raporVerisiKur(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  const v = await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: f.projeId });
  expect(v.basarili, v.mesaj).not.toBe(false);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfaAc(genislik = 1440, yukseklik = 960): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, acceptDownloads: true });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
  return { page, hatalar, kapat: () => baglam.close() };
}

async function git(page: Page, adres: string): Promise<void> {
  await page.goto(`/${adres}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main .iskelet')).toHaveCount(0, { timeout: 15_000 });
}

/** Sayfanın yatay taşması (px) ve dialog içindeki taşma. */
async function tasma(page: Page): Promise<{ sayfa: number; diyalog: number }> {
  return page.evaluate(() => {
    const d = document.querySelector('dialog[open] .diyalog-govde');
    return { sayfa: document.documentElement.scrollWidth - window.innerWidth, diyalog: d ? d.scrollWidth - d.clientWidth : 0 };
  });
}

const pdfIstegi = (govde: Record<string, unknown>): Promise<Response> => fetch(`${nobetci.adres}/platform/rapor/pdf`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: nobetci.token })
});

test('uç: POST /platform/rapor/pdf → application/pdf, %PDF, sayfa > 0, güvenli dosya adı; girdi ve token denetlenir', async () => {
  test.setTimeout(120_000);
  const y = await pdfIstegi(raporGirdisi(f, 'ekran', { donem: DONEM }));
  expect(y.status).toBe(200);
  expect(y.headers.get('content-type')).toBe('application/pdf');
  expect(y.headers.get('content-disposition')).toMatch(/^attachment; filename="nobetci-rapor-ekran-basvuru-\d{4}-\d{2}-\d{2}\.pdf"$/);
  expect(y.headers.get('cache-control')).toBe('no-store');
  expect(y.headers.get('x-rapor-id')).toBe('');
  const pdf = Buffer.from(await y.arrayBuffer());
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdfSayfaSayisi(pdf)).toBeGreaterThan(0);
  expect(Number(y.headers.get('x-rapor-sayfa'))).toBe(pdfSayfaSayisi(pdf));
  // Geçersiz kapsam: JSON hata (PDF yok).
  const hatali = await pdfIstegi({ ...raporGirdisi(f, 'ekran'), kapsam: 'hepsi' });
  expect(hatali.status).toBe(400);
  expect(((await hatali.json()) as { mesaj: string }).mesaj).toContain('Kapsam yalnız');
  // Token yok: 401.
  const tokensiz = await fetch(`${nobetci.adres}/platform/rapor/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raporGirdisi(f, 'ekran')) });
  expect(tokensiz.status).toBe(401);
  // Önizleme: HTML (maskeli) + tek kullanımlık önizleme kimliği.
  const o = await nobetciApi(nobetci, '/platform/rapor/onizle', raporGirdisi(f, 'servis', { donem: DONEM }));
  expect(o.basarili).toBe(true);
  expect(String(o.html)).toContain('Servis Raporu — Kayıt Servisi');
  for (const s of SIZINTILAR) expect(String(o.html), s).not.toContain(s);
  const onizleme = await fetch(`${nobetci.adres}/platform/sonuclar/html-rapor/onizleme/${String(o.onizlemeId)}?token=${nobetci.token}`);
  expect(onizleme.status).toBe(200);
  expect(onizleme.headers.get('content-security-policy')).toContain("default-src 'none'");
});

test('Sonuçlar > Raporlar: boş durum ve "Rapor al" düğmesi', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Raporlar' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Henüz kaydedilmiş rapor yok.')).toBeVisible();
  await expect(page.locator('.bos-durum').getByRole('button', { name: 'Rapor al (PDF)' })).toBeVisible();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('Sonuçlar: "Rapor al (PDF)" → diyalog seçimleri, önizleme, PDF indir (Raporlar\'a kaydedilir)', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await expect(d).toBeVisible();
  // Kapsam: tek öğe, çoklu kapsamlar (A2) ve "Genel" (A3) etkin; "yakında" kalmadı.
  await expect(d.getByRole('radio', { name: 'Tek ekran' })).toBeChecked();
  for (const ad of ['Tek servis', 'Birden çok ekran', 'Birden çok servis', 'Ekran + servis']) {
    await expect(d.getByRole('radio', { name: new RegExp(`^${ad.replace('+', '\\+')}`) })).toBeEnabled();
  }
  await expect(d.getByRole('radio', { name: 'Genel' })).toBeEnabled();
  await expect(d).not.toContainText('(yakında)');
  const secim = d.getByLabel('Ekran', { exact: true });
  await expect(secim.locator('option:checked')).toHaveText('Başvuru');
  await d.getByRole('radio', { name: 'Tek servis' }).check();
  await expect(d.getByLabel('Servis', { exact: true }).locator('option:checked')).toHaveText('Kayıt Servisi');
  // Dönem: varsayılan son 14 gün; özel aralık tarih alanlarını açar.
  const donem = d.getByLabel('Dönem', { exact: true });
  await expect(donem).toHaveValue('son14');
  await expect(d.getByLabel('Başlangıç', { exact: true })).toBeHidden();
  await donem.selectOption('ozel');
  await d.getByLabel('Başlangıç', { exact: true }).fill('2026-09-15');
  await d.getByLabel('Bitiş', { exact: true }).fill('2026-09-28');
  // Ortam: tümü ya da seçili; varsayılanlar: karşılaştırma açık, ekran görüntüleri kapalı, hata ayrıntısı açık, adres kapalı, kaydet açık.
  await expect(d.getByLabel('Ortam', { exact: true }).locator('option')).toHaveText(['Tüm ortamlar', 'TEST']);
  await expect(d.getByLabel(/Önceki eşit dönemle karşılaştır/)).toBeChecked();
  await expect(d.getByLabel(/Ekran görüntüleri/)).not.toBeChecked();
  await expect(d.getByLabel(/Hata ayrıntısı/)).toBeChecked();
  await expect(d.getByLabel(/Ortam adresi/)).not.toBeChecked();
  await expect(d.getByLabel(/Raporlar'a kaydet/)).toBeChecked();
  // Önizleme: korumalı iframe'de rapor HTML'i.
  await d.getByRole('button', { name: 'Önizle' }).click();
  await expect(d.getByRole('status')).toContainText('Önizleme hazır', { timeout: 60_000 });
  const cerceve = d.locator('iframe.pdf-rapor-onizleme');
  await expect(cerceve).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('iframe.pdf-rapor-onizleme').getByRole('heading', { name: /Servis Raporu — Kayıt Servisi/ })).toBeVisible();
  await goruntu(page, 'diyalog');
  // "Raporlar'a kaydet" durumu düğme metninde: kapalıyken "PDF indir", açıkken "PDF indir ve kaydet".
  await expect(d.getByRole('button', { name: 'PDF indir ve kaydet' })).toBeVisible();
  await d.getByLabel(/Raporlar'a kaydet/).uncheck();
  await expect(d.getByRole('button', { name: 'PDF indir', exact: true })).toBeVisible();
  await d.getByLabel(/Raporlar'a kaydet/).check();
  // PDF indir ve kaydet: dosya adı sunucudan; Raporlar'a kaydedilir; pencere kapanır ve bildirim görünür.
  const [indirme] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), d.getByRole('button', { name: 'PDF indir ve kaydet' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-servis-kayit-servisi-\d{4}-\d{2}-\d{2}\.pdf$/);
  const yol = await indirme.path();
  expect(readFileSync(yol).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(d).toBeHidden();
  await expect(page.locator('#bildirimler')).toContainText("Raporlar'a kaydedildi");
  expect(hatalar).toEqual([]);
  await kapat();
});

test('kısayollar: Sonuçlar ekran sayfası, servis sonuçları, Ekranlar > ekran ve Servisler > servis — kapsam ve seçim dolu gelir', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  const dene = async (adres: string, kapsam: 'Tek ekran' | 'Tek servis', etiket: 'Ekran' | 'Servis', deger: string) => {
    await git(page, adres);
    await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
    const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
    await expect(d.getByRole('radio', { name: kapsam })).toBeChecked();
    await expect(d.getByLabel(etiket, { exact: true })).toHaveValue(deger);
    await d.getByRole('button', { name: 'Kapat' }).click();
    await expect(d).toBeHidden();
  };
  await dene(`#/sonuclar/u/${f.ekranId}`, 'Tek ekran', 'Ekran', f.ekranId);
  await dene(`#/sonuclar/s/${f.servisId}`, 'Tek servis', 'Servis', f.servisId);
  await dene(`#/ekranlar/e/${f.ekranId}`, 'Tek ekran', 'Ekran', f.ekranId);
  await dene(`#/servisler/s/${f.servisId}`, 'Tek servis', 'Servis', f.servisId);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('Sonuçlar > Raporlar: satır (meta), İndir, Aynı seçimlerle yeniden oluştur, Sil (onaylı)', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  const satirlar = page.locator('table.pdf-raporlar-tablosu tbody tr');
  await expect(satirlar).toHaveCount(1);
  await expect(satirlar.first()).toContainText('Tek servis · Kayıt Servisi');
  await expect(satirlar.first()).toContainText('15.09.2026 – 28.09.2026 (14 gün)');
  await expect(satirlar.first()).toContainText('Tüm ortamlar');
  await expect(satirlar.first()).toContainText(/Sağlıklı|Dikkat|Kritik/);
  await goruntu(page, 'raporlar');
  const [indirme] = await Promise.all([page.waitForEvent('download'), satirlar.first().getByRole('button', { name: 'İndir' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-servis-kayit-servisi-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(readFileSync(await indirme.path()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await satirlar.first().getByRole('button', { name: 'Aynı seçimlerle yeniden oluştur' }).click();
  await expect(satirlar).toHaveCount(2, { timeout: 60_000 });
  await satirlar.first().getByRole('button', { name: 'Sil' }).click();
  const onay = page.getByRole('dialog', { name: 'Rapor silinsin mi?' });
  await onay.getByRole('button', { name: 'Sil' }).click();
  await expect(satirlar).toHaveCount(1);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('390 px: diyalog ve Raporlar sayfası yatay taşmaz', async () => {
  const { page, hatalar, kapat } = await sayfaAc(390, 844);
  await git(page, '#/sonuclar/raporlar');
  expect((await tasma(page)).sayfa).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await expect(d.getByLabel('Ekran', { exact: true }).locator('option:checked')).toHaveText('Başvuru');
  await d.getByLabel('Dönem', { exact: true }).selectOption('ozel');
  const t = await tasma(page);
  expect(t.sayfa).toBeLessThanOrEqual(0);
  expect(t.diyalog).toBeLessThanOrEqual(0);
  await goruntu(page, 'diyalog-390');
  const kutu = await d.boundingBox();
  expect(kutu && kutu.x >= 0 && kutu.x + kutu.width <= 390).toBe(true);
  await d.getByRole('button', { name: 'Kapat' }).click();
  expect(hatalar).toEqual([]);
  await kapat();
});
