// UÇTAN UCA (yerel) — PDF RAPORU A3 arayüzü: genel rapor. Geçici veritabanına iki dönemlik sahte ekran / servis / akış koşuları
// ve zamanlanmış kural geçmişi yazılır (gerçek koşu, dış istek YOK; zamanlanmış kurallar sunucu başlamadan devre dışı bırakılır),
// ayrı bir Nöbetçi (127.0.0.1) başlatılır. Denetlenenler: POST /platform/rapor/pdf (kapsam genel; seçim gerekmez), önizleme
// maskeli; diyalogda "Genel" etkin, seçildiğinde öğe seçimi gizlenir ve açıklama görünür; önizleme ve PDF indir + Raporlar'a kaydet;
// Sonuçlar > Raporlar'da tür adı "Genel" ve o günkü öğe sayıları, Aynı seçimlerle yeniden oluştur (seçim saklanmaz), Sil;
// 390 px'te diyalog yatay taşmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kuralEtkinlestir } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { pdfSayfaSayisi } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { KUPON_GIZLISI, SIZINTILAR, cokluVeriKur, genelGirdi, genelVeriKur, raporVerisiKur, type GenelFikstur } from './pdf-rapor-fikstur';

const PAROLA = `Gecici-Pdf-${randomBytes(6).toString('hex')}`;
/** Fikstür 15.09–28.09.2026 dönemindedir; sunucunun saati farklı olabileceğinden özel aralık verilir. */
const DONEM = { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' };
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: GenelFikstur;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-genel-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt)));
  // Zamanlayıcı hiçbir koşuyu başlatmasın (kural geçmişi rapor için yeterli).
  kuralEtkinlestir(vt, f.projeId, f.kuralId, false);
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

const pdfIstegi = (govde: Record<string, unknown>): Promise<Response> => fetch(`${nobetci.adres}/platform/rapor/pdf`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: nobetci.token })
});

test('uç: genel kapsamda application/pdf ve güvenli dosya adı (seçim gerekmez); önizleme maskeli', async () => {
  test.setTimeout(180_000);
  const y = await pdfIstegi(genelGirdi(f, { donem: DONEM }));
  expect(y.status).toBe(200);
  expect(y.headers.get('content-type')).toBe('application/pdf');
  expect(y.headers.get('content-disposition')).toMatch(/^attachment; filename="nobetci-rapor-genel-tum-proje-\d{4}-\d{2}-\d{2}\.pdf"$/);
  const pdf = Buffer.from(await y.arrayBuffer());
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdfSayfaSayisi(pdf)).toBeGreaterThan(1);
  const o = await nobetciApi(nobetci, '/platform/rapor/onizle', genelGirdi(f, { donem: DONEM }));
  expect(o.basarili).toBe(true);
  expect(String(o.html)).toContain('Genel Rapor — Tüm Proje');
  expect(String(o.html)).toContain('Zamanlanmış koşular');
  for (const s of [...SIZINTILAR, KUPON_GIZLISI]) expect(String(o.html), s).not.toContain(s);
});

test('diyalog: "Genel" etkin; seçildiğinde öğe seçimi gizlenir, açıklama görünür; önizleme ve PDF indir (Raporlar\'a kaydedilir)', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  const genel = d.getByRole('radio', { name: 'Genel' });
  await expect(genel).toBeEnabled();
  await expect(d).not.toContainText('(yakında)');
  const not = d.locator('.pdf-rapor-genel-notu');
  await expect(not).toBeHidden();
  // Önce çoklu kapsam (listeler görünür), sonra Genel: listeler ve tek seçim gizlenir.
  await d.getByRole('radio', { name: 'Ekran + servis' }).check();
  await expect(d.getByRole('group', { name: 'Ekranlar' })).toBeVisible();
  await genel.check();
  await expect(d.getByRole('group', { name: 'Ekranlar' })).toBeHidden();
  await expect(d.getByRole('group', { name: 'Servisler' })).toBeHidden();
  await expect(d.getByLabel('Ekran', { exact: true })).toBeHidden();
  await expect(not).toBeVisible();
  await expect(not).toContainText('Öğe seçilmez');
  await d.getByLabel('Dönem', { exact: true }).selectOption('ozel');
  await d.getByLabel('Başlangıç', { exact: true }).fill('2026-09-15');
  await d.getByLabel('Bitiş', { exact: true }).fill('2026-09-28');
  await d.getByRole('button', { name: 'Önizle' }).click();
  await expect(d.getByRole('status')).toContainText('Önizleme hazır', { timeout: 60_000 });
  const cerceve = page.frameLocator('iframe.pdf-rapor-onizleme');
  await expect(cerceve.getByRole('heading', { name: /Genel Rapor — Tüm Proje/ })).toBeVisible();
  await expect(cerceve.getByRole('heading', { name: /Servis akışları ve uçtan uca akışlar/ })).toBeVisible();
  const [indirme] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), d.getByRole('button', { name: 'PDF indir' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-genel-tum-proje-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(readFileSync(await indirme.path()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(d.getByRole('status')).toContainText("Raporlar'a kaydedildi");
  // Tek ekrana dönülünce seçim listesi geri gelir, açıklama gizlenir.
  await d.getByRole('radio', { name: 'Tek ekran' }).check();
  await expect(d.getByLabel('Ekran', { exact: true })).toBeVisible();
  await expect(not).toBeHidden();
  await d.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(d).toBeHidden();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('Sonuçlar > Raporlar: "Genel" satırı ve öğe sayıları, İndir, Aynı seçimlerle yeniden oluştur, Sil', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  const satirlar = page.locator('table.pdf-raporlar-tablosu tbody tr');
  await expect(satirlar).toHaveCount(1);
  await expect(satirlar.first()).toContainText('Genel · Tüm proje');
  await expect(satirlar.first()).toContainText('4 ekran · 3 servis');
  await expect(satirlar.first()).toContainText('15.09.2026 – 28.09.2026 (14 gün)');
  await expect(satirlar.first()).toContainText(/Sağlıklı|Dikkat|Kritik/);
  const [indirme] = await Promise.all([page.waitForEvent('download'), satirlar.first().getByRole('button', { name: 'İndir' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-genel-/);
  // (Rapordan sonra eklenen öğenin yeniden oluşturmada kapsanması pdf-rapor-genel-veri.spec.ts'de denetlenir.)
  await satirlar.first().getByRole('button', { name: 'Aynı seçimlerle yeniden oluştur' }).click();
  await expect(satirlar).toHaveCount(2, { timeout: 60_000 });
  for (const i of [0, 1]) await expect(satirlar.nth(i)).toContainText('Genel · Tüm proje');
  const liste = await fetch(`${nobetci.adres}/platform/raporlar?projeId=${f.projeId}`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } });
  const r = (await liste.json()) as { raporlar: Array<{ kapsam: string; meta: { secim: Record<string, unknown> } }> };
  expect(r.raporlar.map((x) => x.kapsam)).toEqual(['genel', 'genel']);
  for (const x of r.raporlar) expect(x.meta.secim).toMatchObject({ id: '', ad: 'Tüm proje', genel: true, ekranSayisi: 4, servisSayisi: 3 });
  expect(r.raporlar[0].meta.secim).not.toHaveProperty('ekranIdleri');
  await satirlar.first().getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog', { name: 'Rapor silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await expect(satirlar).toHaveCount(1);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('390 px: genel seçili diyalog yatay taşmaz', async () => {
  const { page, hatalar, kapat } = await sayfaAc(390, 844);
  await git(page, '#/sonuclar/raporlar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await d.getByRole('radio', { name: 'Genel' }).check();
  await expect(d.locator('.pdf-rapor-genel-notu')).toBeVisible();
  const t = await page.evaluate(() => {
    const g = document.querySelector('dialog[open] .diyalog-govde');
    return { sayfa: document.documentElement.scrollWidth - window.innerWidth, diyalog: g ? g.scrollWidth - g.clientWidth : 0 };
  });
  expect(t.sayfa).toBeLessThanOrEqual(0);
  expect(t.diyalog).toBeLessThanOrEqual(0);
  const kutu = await d.boundingBox();
  expect(kutu && kutu.x >= 0 && kutu.x + kutu.width <= 390).toBe(true);
  await d.getByRole('button', { name: 'Kapat' }).click();
  expect(hatalar).toEqual([]);
  await kapat();
});
