// UÇTAN UCA (yerel) — Senaryolar > ekran > "Senaryo önerileri" (senaryo tasarım yardımcısı): gruplu liste (tür, başlık önerisi,
// özet, beklenen sonuç, "mevcut"), "Önizle" (formda doldurulmuş; kaydetmez), seçilenleri "Senaryo olarak ekle" (doğrulayıcıdan
// geçer; "Koşuda" KAPALI; beklenen sonucu belirsiz olan eklenmez), kombinasyon alanları; masaüstü ve 390px'te taşma yok.
// Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { MESAJLAR } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { EKRAN_ADI, siparisPaketi, tabanVerisi } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Oneri-${randomBytes(6).toString('hex')}`;
const EKRAN_KLASORU = process.env.SENARYO_ONERILERI_EKRAN_KLASORU;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
const senaryolar = async () => ((await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).filter((s) => s.ekranId === ekranId);
/** Bugünden 5 gün sonrası (gg.aa.yyyy). */
const tarih = () => { const t = new Date(); t.setDate(t.getDate() + 5); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`; };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'senaryo-onerileri-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Öneri Projesi' })).proje.id);
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  ekranId = String(liste.ekranlar.find((e) => e.ad === EKRAN_ADI)?.id);
  await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Kitap siparişi', veri: tabanVerisi(tarih()), ortamIdleri: [ortamId], kosuyaDahil: true });
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function onerileriAc(page: Page): Promise<void> {
  await page.goto(`/#/senaryolar/u/${ekranId}`);
  await page.getByRole('link', { name: 'Senaryo önerileri' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();
}
const grup = (page: Page, ad: string) => page.getByRole('region', { name: new RegExp(`^${ad}`) });
const oneri = (page: Page, baslik: string) => page.locator('li.oneri').filter({ has: page.getByText(baslik, { exact: true }) });

test('liste gruplu; önizleme formu doldurur ama kaydetmez; seçilenler "Koşuda" kapalı eklenir, belirsiz olan eklenmez; tekrar üretince "mevcut"', async () => {
  test.setTimeout(90_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await onerileriAc(page);
  await expect(page.getByRole('note').filter({ hasText: 'Öneriler yalnızca öneridir.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Seçilen öneriler' })).toContainText('"Koşuda" KAPALI gelir');
  await expect(page.getByText('Taban: “Kitap siparişi”')).toBeVisible();

  // Gruplar ve içerik: başlık önerisi, özet, beklenen sonuç rozetleri, mevcut.
  await expect(grup(page, 'Zorunlu alanlar').locator('li.oneri')).toHaveCount(5);
  await expect(oneri(page, 'Zorunlu alan boş: Adet')).toContainText('İş kuralı hatası beklenir (Ürün seçimi)');
  await expect(oneri(page, 'Zorunlu alan boş: Teslimat tarihi')).toContainText('Beklenen sonucu siz seçin');
  await expect(oneri(page, 'Sınır: Adet = 0 (alt sınır − 1)')).toContainText('geçersiz');
  await expect(grup(page, 'Sınır değerleri')).toContainText('Sınır kuralı tanımlı olmayan alanlar: Sipariş notu, Hediye notu.');
  await expect(oneri(page, 'Koşul: Kategori = Giyim')).toContainText('bu dalda zorunlu: Beden');
  await expect(oneri(page, 'Koşul: Kategori = Kitap').locator('.rozet', { hasText: 'mevcut' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Koşul: Kategori = Kitap: seç' })).toBeDisabled();
  await expect(page.getByText('5550001122')).toHaveCount(0);

  // Önizle: formda doldurulmuş; bilerek boş uyarısı; Koşuda kapalı; kaydedilmez.
  await page.getByRole('button', { name: 'Zorunlu alan boş: Adet: önizle' }).click();
  await expect(page.getByRole('heading', { name: 'Yeni senaryo', level: 2 })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Öneri önizlemesi — kaydedilmedi.' })).toBeVisible();
  await expect(page.getByPlaceholder('ör. bağlam / kapsam / beklenen sonuç…')).toHaveValue('Zorunlu alan boş: Adet');
  await expect(page.locator('[data-alan="urunAdi"] input[type="text"]')).toHaveValue('Roman');
  await expect(page.locator('[data-alan="adet"] input[type="number"]')).toHaveValue('');
  await expect(page.locator('[data-alan="adet"] input[type="number"]')).toBeDisabled();
  await expect(page.locator('[data-alan="adet"]').getByRole('checkbox', { name: 'Bilerek boş bırak' })).toBeChecked();
  await expect(page.locator('[data-alan="adet"]')).toContainText(MESAJLAR.bilerekBos('Adet'));
  await expect(page.getByRole('switch', { name: 'Koşuda' })).not.toBeChecked();
  expect(await senaryolar()).toHaveLength(1);
  await page.getByRole('button', { name: 'Önerilere dön' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();

  // Seç ve ekle: üçü eklenir (Koşuda kapalı); beklenen sonucu belirsiz olan atlanır ve nedeni yazar.
  for (const b of ['Zorunlu alan boş: Adet', 'Sınır: Adet = 10 (üst sınır)', 'Koşul: Kategori = Elektronik', 'Zorunlu alan boş: Teslimat tarihi']) {
    await page.getByRole('checkbox', { name: `${b}: seç` }).check();
  }
  await expect(page.getByRole('region', { name: 'Seçilen öneriler' })).toContainText('4 öneri seçili');
  await page.getByRole('button', { name: 'Senaryo olarak ekle' }).click();
  const durum = page.locator('.not-kutusu[role="status"]');
  await expect(durum).toContainText('3 senaryo eklendi; "Koşuda" kapalı');
  await expect(durum.getByRole('list', { name: 'Eklenmeyen öneriler' })).toContainText('Zorunlu alan boş: Teslimat tarihi: beklenen sonucu siz seçin');
  const liste = await senaryolar();
  expect(liste.map((s) => s.baslik).sort()).toEqual(['Kitap siparişi', 'Koşul: Kategori = Elektronik', 'Sınır: Adet = 10 (üst sınır)', 'Zorunlu alan boş: Adet']);
  for (const s of liste.filter((x) => x.baslik !== 'Kitap siparişi')) expect(s.kosuyaDahil, s.baslik).toBe(false);
  const adet = (await basarili(`/platform/senaryo?id=${liste.find((s) => s.baslik === 'Zorunlu alan boş: Adet')?.id}&ortamId=${ortamId}`)).senaryo;
  expect(adet.veri).toMatchObject({ bilerekBos: ['adet'], beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'urun', mesaj: 'Lütfen adet giriniz.' } });

  // Tekrar üretildi: eklenenler "mevcut", seçilemez.
  for (const b of ['Zorunlu alan boş: Adet', 'Sınır: Adet = 10 (üst sınır)', 'Koşul: Kategori = Elektronik']) {
    await expect(oneri(page, b).locator('.rozet', { hasText: 'mevcut' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `${b}: seç` })).toBeDisabled();
  }
  await expect(page.getByRole('checkbox', { name: 'Zorunlu alan boş: Teslimat tarihi: seç' })).toBeChecked();

  // Kombinasyon: yalnız işaretlenen alanlar; en çok 3 alan.
  const kombinasyon = page.getByRole('group', { name: 'Kombinasyon alanları' });
  await kombinasyon.getByRole('checkbox', { name: /Kategori/ }).check();
  await kombinasyon.getByRole('checkbox', { name: /Renk/ }).check();
  await expect(page.locator('.kombinasyon-ozeti')).toHaveText('5 kombinasyon: 2 mevcut, 3 eksik.');
  await expect(oneri(page, 'Kombinasyon: Kategori = Giyim, Renk = Mavi')).toBeVisible();
  await expect(oneri(page, 'Kombinasyon: Kategori = Elektronik, Renk = Siyah').locator('.rozet', { hasText: 'mevcut' })).toBeVisible();
  await kombinasyon.getByRole('checkbox', { name: /Beden/ }).check();
  await expect(page.locator('.kombinasyon-ozeti')).toContainText('geçersiz');
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('masaüstü ve 390px: sayfa yatay kaymaz, öneri satırları taşmaz', async () => {
  test.setTimeout(60_000);
  for (const [genislik, yukseklik] of [[1400, 900], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    await onerileriAc(page);
    await expect(page.locator('li.oneri').first()).toBeVisible();
    const olcum = await page.evaluate(() => {
      const tasan = [...document.querySelectorAll('li.oneri, .oneri-eylem-cubugu, .kombinasyon-karti, .oneri-grubu, .sayfa-basligi')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1)
        .map((e) => `${e.className} sag=${Math.round(e.getBoundingClientRect().right)} sw=${e.scrollWidth} cw=${e.clientWidth}`);
      return { sayfa: document.documentElement.scrollWidth - innerWidth, tasan };
    });
    expect(olcum.sayfa, `${genislik}px sayfa taşması`).toBeLessThanOrEqual(2);
    expect(olcum.tasan, `${genislik}px taşan öğe`).toEqual([]);
    if (EKRAN_KLASORU) await page.screenshot({ path: join(EKRAN_KLASORU, `senaryo-onerileri-${genislik}.png`), fullPage: true });
    await baglam.close();
  }
});
