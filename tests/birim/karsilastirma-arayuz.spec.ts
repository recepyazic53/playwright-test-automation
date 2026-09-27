// UÇTAN UCA (yerel) — YAN YANA KOŞU KARŞILAŞTIRMASI arayüzü: geçici veritabanına iki sahte ekran koşusu ve servis / akış koşuları
// yazılır (gerçek Playwright koşusu, dış istek YOK), ayrı bir Nöbetçi (127.0.0.1) başlatılır. Denetlenenler: koşu geçmişinde iki
// satır seçip "Karşılaştır", paylaşılabilir rota, özet (A | B, fark), "yalnız değişenler" süzgeci, sıralama, açılan satırda
// adım farkı + iki tarafın ekran görüntüsü + yakalanan mesaj farkı, koşu ayrıntısından seçim diyaloğu (aynı kapsam süzgeci),
// HTML karşılaştırma raporu diyaloğu, servis karşılaştırması (HTTP kodu, kontrol farkı; gövde yok), maskeleme, telefonda
// A / B alt alta ve yatay taşma yok, erişilebilir adlar ve yinelenen kimlik yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { GIZLI_PAROLA, karsilastirmaVerisiKur, type KarsilastirmaFiksturu } from './karsilastirma-fikstur';
import { HIZLI_KDF } from './platform-ortak';

const GORUNTU_KLASORU = process.env.EKRAN_TURU_KLASORU;
const goruntu = async (page: Page, ad: string): Promise<void> => {
  if (GORUNTU_KLASORU) await page.screenshot({ path: join(GORUNTU_KLASORU, `karsilastirma-${ad}.png`), fullPage: true });
};
const PAROLA = `Gecici-Kars-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: KarsilastirmaFiksturu;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'karsilastirma-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = await karsilastirmaVerisiKur(vt, vtYolu);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  // Arayüz varsayılan projeyi açar; karşılaştırma projesi varsayılan olsun.
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
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
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

/** Adı olmayan etkileşimli öğe, yinelenen kimlik ve yatay taşma. */
async function denetle(page: Page): Promise<{ adsiz: string[]; yinelenenId: string[]; tasma: number; tasanlar: string[] }> {
  return page.evaluate(() => {
    const gorunur = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const ad = (el: Element): string => {
      const id = el.id;
      const etiket = id ? [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].map((l) => l.textContent || '').join(' ') : '';
      return `${el.getAttribute('aria-label') || ''} ${etiket} ${el.closest('label')?.textContent || ''} ${el.getAttribute('title') || ''} ${['INPUT', 'SELECT'].includes(el.tagName) ? '' : el.textContent || ''}`.trim();
    };
    const adsiz = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')]
      .filter((el) => gorunur(el) && !el.closest('[aria-hidden="true"]') && !ad(el)).map((el) => el.outerHTML.slice(0, 120));
    const sayim = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) sayim.set(el.id, (sayim.get(el.id) ?? 0) + 1);
    // Taşan en içteki öğeler (kendi kaydırma kabı olmayan).
    const tasanlar: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right <= window.innerWidth + 2 || !gorunur(el)) continue;
      let kap = el.parentElement; let kaydirilir = false;
      while (kap) { const s = getComputedStyle(kap); if (/(auto|scroll|hidden)/.test(s.overflowX) && kap.scrollWidth > kap.clientWidth) { kaydirilir = true; break; } kap = kap.parentElement; }
      if (kaydirilir || [...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 2)) continue;
      tasanlar.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(r.right)}px)`);
      if (tasanlar.length >= 6) break;
    }
    return { adsiz, yinelenenId: [...sayim].filter(([, n]) => n > 1).map(([id]) => id), tasma: document.documentElement.scrollWidth - window.innerWidth, tasanlar };
  });
}

test('koşu geçmişinde iki koşu seçilir → karşılaştırma: özet, süzgeç, sıralama, adım / görüntü / mesaj farkı, rapor', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar');
  const gecmis = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Koşu geçmişi' }) });
  const kutular = gecmis.getByRole('checkbox', { name: /Karşılaştırmak için seç/ });
  await expect(kutular).toHaveCount(3);
  const dugme = gecmis.getByRole('button', { name: /Karşılaştır/ });
  await expect(dugme).toBeDisabled();
  // En yeni (B) ve en eski (A); üçüncü kutu kilitlenir. Seçim sırası ne olursa olsun A = önceki koşu.
  await kutular.nth(0).check();
  await kutular.nth(2).check();
  await expect(kutular.nth(1)).toBeDisabled();
  await dugme.click();
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/karsilastir/${f.kosuA}/${f.kosuB}$`));
  await expect(page.getByRole('heading', { name: 'Koşu karşılaştırması' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Koşu A özeti' })).toContainText('tam · Genel');
  await expect(page.getByRole('region', { name: 'Koşu B özeti' })).toContainText('↓ 25 puan');

  // Varsayılan: yalnız değişenler (Liste hep geçen → gizli).
  const tablo = page.getByRole('table', { name: 'Senaryo karşılaştırması' });
  const satirlar = tablo.locator('tbody tr.kars-satiri');
  await expect(satirlar).toHaveCount(4);
  await expect(tablo).not.toContainText('Liste');
  await expect(satirlar.first()).toContainText('yeni kalan');
  await page.getByLabel('Yalnız değişenler').uncheck();
  await expect(satirlar).toHaveCount(5);
  // Değişim çipi: yalnız "düzelen".
  await page.locator('.kars-cipleri').getByRole('button', { name: /düzelen/ }).click();
  await expect(satirlar).toHaveCount(1);
  await expect(satirlar.first()).toContainText('Onay');
  await page.locator('.kars-cipleri').getByRole('button', { name: /düzelen/ }).click();
  // Sıralama (tablo-siralama.js, veri üzerinde).
  await tablo.getByRole('button', { name: 'Senaryo' }).click();
  await expect(tablo.locator('th[data-sirala-anahtar="senaryo"]')).toHaveAttribute('aria-sort', 'ascending');
  await expect(satirlar.first()).toContainText('Eski');

  // Satır açılınca: adım farkı, iki tarafın görüntüsü, yakalanan mesaj farkı; gizli değer yok.
  await page.getByRole('button', { name: 'Adım farkını aç: Kayıt' }).click();
  const detay = tablo.locator('tr.kars-detay-satiri:not([hidden])');
  await expect(detay.getByRole('table', { name: /Adım karşılaştırması/ })).toContainText('Çerez uyarısını kapat');
  await expect(detay).toContainText("yalnız B'de");
  await expect(detay).toContainText('Beklenmeyen yanıt');
  const gorsel = detay.locator('.kars-taraf.kars-b img');
  await expect(gorsel).toHaveCount(1);
  await expect.poll(() => gorsel.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('main')).not.toContainText(GIZLI_PAROLA);
  await expect(page.locator('main')).not.toContainText('4111111111111111');
  await goruntu(page, 'masaustu');

  // HTML karşılaştırma raporu (önizlemeli diyalog; görüntüler varsayılan kapalı).
  await page.getByRole('button', { name: 'Karşılaştırmayı indir (HTML)' }).click();
  const rapor = page.getByRole('dialog', { name: 'Karşılaştırmayı indir (HTML)' });
  await expect(rapor.getByRole('checkbox', { name: /Ekran görüntülerini ekle/ })).not.toBeChecked();
  await expect(rapor.getByRole('status')).toContainText('nobetci-karsilastirma-');
  await rapor.getByRole('button', { name: 'Vazgeç' }).click();

  // Ekranın rehberi ("?").
  await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
  const rehber = page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
  await expect(rehber).toContainText('İki koşuyu seçmek');
  await page.keyboard.press('Escape');
  await expect(rehber).toHaveCount(0);

  // Yer değiştir: A ↔ B.
  await page.getByRole('link', { name: 'Yer değiştir' }).click();
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/karsilastir/${f.kosuB}/${f.kosuA}$`));
  await expect(page.getByRole('heading', { name: 'Koşu karşılaştırması' })).toBeVisible();

  const d = await denetle(page);
  expect(d.adsiz, d.adsiz.join('\n')).toEqual([]);
  expect(d.yinelenenId).toEqual([]);
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});

test('koşu ayrıntısından "Başka bir koşuyla karşılaştır…": aynı kapsam süzgeci, seçim → rota', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, `#/sonuclar/kosu/${f.kosuB}`);
  await page.getByRole('button', { name: 'Başka bir koşuyla karşılaştır…' }).click();
  const diyalog = page.getByRole('dialog', { name: 'Başka bir koşuyla karşılaştır' });
  const secenekler = diyalog.getByRole('radio');
  await expect(secenekler).toHaveCount(1); // tekil koşu aynı kapsamda değil
  await diyalog.getByLabel('Yalnız aynı kapsam').uncheck();
  await expect(secenekler).toHaveCount(2);
  await diyalog.getByLabel('Yalnız aynı kapsam').check();
  const karsilastir = diyalog.getByRole('button', { name: 'Karşılaştır' });
  await expect(karsilastir).toBeDisabled();
  await secenekler.first().check();
  await karsilastir.click();
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/karsilastir/${f.kosuA}/${f.kosuB}$`));
  await expect(page.getByRole('heading', { name: 'Koşu karşılaştırması' })).toBeVisible();
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});

test('telefon genişliği: A / B alt alta, yatay taşma yok', async () => {
  const { page, hatalar, kapat } = await sayfaAc(390, 844);
  await git(page, `#/sonuclar/karsilastir/${f.kosuA}/${f.kosuB}`);
  const a = await page.getByRole('region', { name: 'Koşu A özeti' }).boundingBox();
  const b = await page.getByRole('region', { name: 'Koşu B özeti' }).boundingBox();
  expect(a && b && b.y >= a.y + a.height - 1).toBe(true);
  await page.getByRole('button', { name: 'Adım farkını aç: Kayıt' }).click();
  const detay = page.locator('tr.kars-detay-satiri:not([hidden])');
  await expect(detay.locator('.kars-taraf')).toHaveCount(2);
  const ta = await detay.locator('.kars-taraf.kars-a').boundingBox();
  const tb = await detay.locator('.kars-taraf.kars-b').boundingBox();
  expect(ta && tb && tb.y >= ta.y + ta.height - 1).toBe(true);
  await goruntu(page, 'telefon');
  const d = await denetle(page);
  expect(d.tasma, `yatay taşma: ${d.tasanlar.join(', ')}`).toBeLessThanOrEqual(2);
  expect(d.adsiz, d.adsiz.join('\n')).toEqual([]);
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});

test('servis karşılaştırması: geçmişte grup kilidi (servis ↔ akış), HTTP kodu ve kontrol farkı; gövde ve gizli değer yok', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/servisler/sonuclar');
  const gecmis = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Koşu geçmişi' }) });
  const kutular = gecmis.getByRole('checkbox', { name: /Karşılaştırmak için seç/ });
  await expect(kutular).toHaveCount(4);
  // Bir servis koşusu seçilince akış koşularının kutuları kilitlenir.
  const servisKutusu = gecmis.getByRole('checkbox', { name: /Kayıt Servisi/ }).first();
  await servisKutusu.check();
  await expect(gecmis.getByRole('checkbox', { name: /Kayıt akışı senaryosu|Akış/ }).first()).toBeDisabled();
  await servisKutusu.uncheck();

  await git(page, `#/servisler/sonuclar/karsilastir/${f.servisKosuA}/${f.servisKosuB}`);
  await expect(page.getByRole('heading', { name: 'Koşu karşılaştırması' })).toBeVisible();
  const tablo = page.getByRole('table', { name: 'Senaryo karşılaştırması' });
  await expect(tablo.locator('tbody tr.kars-satiri')).toHaveCount(2);
  await page.getByRole('button', { name: 'Adım farkını aç: Kayıt oluştur' }).click();
  const detay = tablo.locator('tr.kars-detay-satiri:not([hidden])');
  await expect(detay.getByRole('table', { name: /İstek karşılaştırması/ })).toContainText('HTTP 400');
  await expect(detay.getByRole('list', { name: /Kontrol sonuçları/ })).toContainText('Durum kodu');
  await page.getByRole('button', { name: 'Adım farkını aç: Kayıt sorgula' }).click();
  await expect(tablo).toContainText('gelen 500');
  await goruntu(page, 'servis');
  const main = page.locator('main');
  for (const sizinti of [GIZLI_PAROLA, 'govde-icerigi-gorunmemeli']) await expect(main).not.toContainText(sizinti);

  await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
  await expect(page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') })).toContainText('İki koşuyu seçmek');
  await page.keyboard.press('Escape');

  // Akış karşılaştırması tek satırdır ve açık gelir.
  await git(page, `#/servisler/sonuclar/karsilastir/${f.akisKosuA}/${f.akisKosuB}`);
  await expect(page.locator('tr.kars-detay-satiri:not([hidden])').getByRole('table', { name: /İstek karşılaştırması/ })).toContainText('HTTP 503');
  const d = await denetle(page);
  expect(d.adsiz, d.adsiz.join('\n')).toEqual([]);
  expect(d.yinelenenId).toEqual([]);
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});
