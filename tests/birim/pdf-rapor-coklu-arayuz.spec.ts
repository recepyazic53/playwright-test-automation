// UÇTAN UCA (yerel) — PDF RAPORU A2 arayüzü: birden çok ekran / birden çok servis / ekran + servis. Geçici veritabanına iki
// dönemlik sahte ekran ve servis koşuları yazılır (gerçek koşu, dış istek YOK), ayrı bir Nöbetçi (127.0.0.1) başlatılır.
// Denetlenenler: POST /platform/rapor/pdf (çoklu kapsam; girdi doğrulama), diyalogda çoklu seçim (onay kutusu listeleri, "Tüm …",
// en az seçim uyarısı, kısayoldan gelen öğe işaretli), önizleme, PDF indir + Raporlar'a kaydet; Sonuçlar > Raporlar'da yeni türler
// (kapsam · seçim · öğe adları), Aynı seçimlerle yeniden oluştur, Sil; 390 px'te çoklu diyalog yatay taşmaz.
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
import { SIZINTILAR, cokluGirdi, cokluVeriKur, raporVerisiKur, type CokluFikstur } from './pdf-rapor-fikstur';

const PAROLA = `Gecici-Pdf-${randomBytes(6).toString('hex')}`;
/** Fikstür 15.09–28.09.2026 dönemindedir; sunucunun saati farklı olabileceğinden özel aralık verilir. */
const DONEM = { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' };
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: CokluFikstur;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-coklu-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = cokluVeriKur(vt, raporVerisiKur(vt));
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

test('uç: çoklu kapsamlarda application/pdf ve güvenli dosya adı; eksik seçim reddedilir; önizleme maskeli', async () => {
  test.setTimeout(180_000);
  for (const [kapsam, ad] of [['coklu-ekran', 'secilen-2-ekran'], ['coklu-servis', 'secilen-2-servis'], ['karisik', 'secilen-2-ekran-secilen-2-servis']] as const) {
    const y = await pdfIstegi(cokluGirdi(f, kapsam, { donem: DONEM }));
    expect(y.status, kapsam).toBe(200);
    expect(y.headers.get('content-type')).toBe('application/pdf');
    expect(y.headers.get('content-disposition')).toMatch(new RegExp(`^attachment; filename="nobetci-rapor-${kapsam}-${ad}-\\d{4}-\\d{2}-\\d{2}\\.pdf"$`));
    const pdf = Buffer.from(await y.arrayBuffer());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdfSayfaSayisi(pdf)).toBeGreaterThan(1);
  }
  const eksik = await pdfIstegi(cokluGirdi(f, 'coklu-ekran', { ekranIdleri: [f.ekranId] }));
  expect(eksik.status).toBe(400);
  expect(((await eksik.json()) as { mesaj: string }).mesaj).toContain('En az iki ekran');
  const o = await nobetciApi(nobetci, '/platform/rapor/onizle', cokluGirdi(f, 'karisik', { donem: DONEM }));
  expect(o.basarili).toBe(true);
  expect(String(o.html)).toContain('Birleşik Rapor — Ekranlar ve Servisler');
  for (const s of SIZINTILAR) expect(String(o.html), s).not.toContain(s);
});

test('diyalog: çoklu seçim listeleri, "Tüm …", en az seçim uyarısı, önizleme ve PDF indir (Raporlar\'a kaydedilir)', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await expect(d.getByLabel('Ekran', { exact: true })).toBeVisible();
  const ekranlar = d.getByRole('group', { name: 'Ekranlar' });
  const servisler = d.getByRole('group', { name: 'Servisler' });
  await expect(ekranlar).toBeHidden();
  // Birden çok ekran: tek seçim listesi gizlenir, ekran onay kutuları görünür (servisler gizli).
  await d.getByRole('radio', { name: 'Birden çok ekran' }).check();
  await expect(d.getByLabel('Ekran', { exact: true })).toBeHidden();
  await expect(ekranlar).toBeVisible();
  await expect(servisler).toBeHidden();
  await expect(ekranlar.getByRole('checkbox')).toHaveCount(3); // Tüm ekranlar + Başvuru + Talep
  await expect(ekranlar).toContainText('0 / 2 seçili');
  await d.getByLabel('Dönem', { exact: true }).selectOption('ozel');
  await d.getByLabel('Başlangıç', { exact: true }).fill('2026-09-15');
  await d.getByLabel('Bitiş', { exact: true }).fill('2026-09-28');
  await ekranlar.getByRole('checkbox', { name: 'Başvuru' }).check();
  await d.getByRole('button', { name: 'Önizle' }).click();
  await expect(d.locator('.pdf-rapor-bilgi')).toHaveText('En az iki ekran seçin ya da "Tüm ekranlar"ı işaretleyin.');
  await ekranlar.getByRole('checkbox', { name: 'Talep' }).check();
  await expect(ekranlar).toContainText('2 / 2 seçili');
  await d.getByRole('button', { name: 'Önizle' }).click();
  await expect(d.getByRole('status')).toContainText('Önizleme hazır', { timeout: 60_000 });
  await expect(page.frameLocator('iframe.pdf-rapor-onizleme').getByRole('heading', { name: /Ekranlar Raporu — Seçilen 2 ekran/ })).toBeVisible();
  // Ekran + servis: iki liste; "Tüm servisler" tek tek kutuları pasifleştirir.
  await d.getByRole('radio', { name: 'Ekran + servis' }).check();
  await expect(ekranlar).toBeVisible();
  await expect(servisler).toBeVisible();
  await expect(ekranlar.getByRole('checkbox', { name: 'Talep' })).toBeChecked(); // seçim korunur
  await servisler.getByRole('checkbox', { name: 'Tüm servisler' }).check();
  await expect(servisler.getByRole('checkbox', { name: 'Kayıt Servisi' })).toBeDisabled();
  await expect(servisler).toContainText('Tümü (2)');
  const [indirme] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), d.getByRole('button', { name: 'PDF indir ve kaydet' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-karisik-secilen-2-ekran-tum-servisler-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(readFileSync(await indirme.path()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(d).toBeHidden();
  await expect(page.locator('#bildirimler')).toContainText("Raporlar'a kaydedildi");
  expect(hatalar).toEqual([]);
  await kapat();
});

test('kısayol: ekran sayfasından açılan diyalogda çoklu listede o ekran işaretli gelir', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, `#/sonuclar/u/${f.ekran2Id}`);
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await expect(d.getByLabel('Ekran', { exact: true })).toHaveValue(f.ekran2Id);
  await d.getByRole('radio', { name: 'Birden çok ekran' }).check();
  const ekranlar = d.getByRole('group', { name: 'Ekranlar' });
  await expect(ekranlar.getByRole('checkbox', { name: 'Talep' })).toBeChecked();
  await expect(ekranlar.getByRole('checkbox', { name: 'Başvuru' })).not.toBeChecked();
  await d.getByRole('button', { name: 'Kapat' }).click();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('Sonuçlar > Raporlar: yeni tür satırı, İndir, Aynı seçimlerle yeniden oluştur, Sil', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  const satirlar = page.locator('table.pdf-raporlar-tablosu tbody tr');
  await expect(satirlar).toHaveCount(1);
  await expect(satirlar.first()).toContainText('Ekran + servis · Seçilen 2 ekran + tüm servisler');
  await expect(satirlar.first()).toContainText('Başvuru, Talep, Bildirim Servisi, Kayıt Servisi');
  await expect(satirlar.first()).toContainText('15.09.2026 – 28.09.2026 (14 gün)');
  await expect(satirlar.first()).toContainText(/Sağlıklı|Dikkat|Kritik/);
  const [indirme] = await Promise.all([page.waitForEvent('download'), satirlar.first().getByRole('button', { name: 'İndir' }).click()]);
  expect(indirme.suggestedFilename()).toMatch(/^nobetci-rapor-karisik-/);
  await satirlar.first().getByRole('button', { name: 'Aynı seçimlerle yeniden oluştur' }).click();
  await expect(satirlar).toHaveCount(2, { timeout: 60_000 });
  for (const i of [0, 1]) await expect(satirlar.nth(i)).toContainText('Ekran + servis · Seçilen 2 ekran + tüm servisler');
  // Sunucudaki kayıt da aynı seçimi taşır (liste ucu).
  const liste = await fetch(`${nobetci.adres}/platform/raporlar?projeId=${f.projeId}`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } });
  const r = (await liste.json()) as { raporlar: Array<{ kapsam: string; meta: { secim: Record<string, unknown> } }> };
  expect(r.raporlar.map((x) => x.kapsam)).toEqual(['karisik', 'karisik']);
  expect(r.raporlar[0].meta.secim).toEqual(r.raporlar[1].meta.secim);
  expect(r.raporlar[0].meta.secim).toMatchObject({ ekranIdleri: [f.ekranId, f.ekran2Id], tumServisler: true });
  await satirlar.first().getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog', { name: 'Rapor silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await expect(satirlar).toHaveCount(1);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('390 px: çoklu seçimli diyalog yatay taşmaz', async () => {
  const { page, hatalar, kapat } = await sayfaAc(390, 844);
  await git(page, '#/sonuclar/raporlar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await d.getByRole('radio', { name: 'Ekran + servis' }).check();
  await expect(d.getByRole('group', { name: 'Servisler' })).toBeVisible();
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
