// UÇTAN UCA (yerel) — Sonuçlar > Genel > Özet panosu arayüzü (ozet-panosu.js). Geçici veritabanı + ayrı Nöbetçi (127.0.0.1); SQL
// kartlarının bağlantısı bellek içi SAHTE veritabanıdır (TEST_SUNUCU_SAHTE_SQL_SURUCUSU = sahte-sql-surucusu.mjs; hiçbir adrese
// bağlanılmaz). Denetlenenler: varsayılan pano bugünkü Özet; düzenleme kipi (kaldır, Kart ekle'den geri ekle, klavyeyle taşı /
// boyutlandır, sıra düğmeleri, Vazgeç, Bitti → proje başına kayıt, Varsayılana dön); serbest ızgara (boş yere sürükle, gölge, aşağı
// itme, sağ kartı uzatınca soldakiler değişmez, 390 px tek sütun); eski sıralı düzenden göç; SQL kartı (yalnız okuma uyarısı, yalnız
// "Yenile"de çalışır — sayfa açılınca sorgu YOK (sürücü günlüğü + ağ sayacı), "Son veri" saati, yükleniyor durumu, eşik rengi, tablo
// maskelemesi, CANLI ortamda ilk Yenile'de onay); Nöbetçi verisi ve metin kartı; hızlı arama ve rehber; 1440 / 390 px yatay taşma yok;
// erişilebilir adlar. İsteğe bağlı: PANO_EKRAN_GORUNTUSU=<klasör> verilirse 1440 px görüntüler (düzenleme kipi, SQL kartı) alınır.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ayarYaz, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { duzenTemizle } from '../../scripts/platform/sonuclar/pano-duzeni.mjs';
import { PANO_AYAR_ANAHTARI } from '../../scripts/platform/sonuclar/ozet-panosu.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { veritabaniKaydet } from '../../scripts/platform/sql/veritabanlari.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC } from './sahte-sql-surucusu.mjs';

const PAROLA = `Gecici-Pano-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let gunluk = '';
let projeId = '';
let bTest = '';
let bCanli = '';
/** Mantıksal veritabanı (TEST → test-db, CANLI → canli-db) ve ortam kimlikleri (pano ortamı testi). */
let vtUyg = '';
let oTest = '';
let oCanli = '';
let projeGoc = '';
/** Göç testi: eski (sıralı) biçimde kasaya yazılmış düzen (sıra, genişlik, yükseklik, eşit yükseklik). */
const ESKI_DUZEN = { surum: 1, esitYukseklik: true, kartlar: [
  { id: 'ozetKutulari', tur: 'ozetKutulari', boyut: 'tam' }, { id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' },
  { id: 'bakim', tur: 'bakim', boyut: 'kucuk', yukseklik: 5 }, { id: 'kapsam', tur: 'kapsam', boyut: 'kucuk' },
  { id: 'k-genis', tur: 'metin', boyut: 'genis', ayar: { baslik: 'Geniş not', not: 'Eski düzenden.', baglantilar: [] } },
  { id: 'k-not', tur: 'metin', boyut: 'kucuk', yukseklik: 3, ayar: { baslik: 'Kısa not', not: 'Eski düzenden.', baglantilar: [] } }
] };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ozet-panosu-arayuz-'));
  gunluk = join(klasor, 'sql-gunlugu.txt');
  writeFileSync(gunluk, '');
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Pano projesi' });
  const TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
  const CANLI = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', ayarlar: { canli: true } });
  const pg = (ad: string, ortamIdleri: string[]) => baglantiKaydet(vt, projeId, {
    tur: 'veritabani', ad, ortamIdleri, alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', port: 5433, veritabani: 'uyg', kullanici: 'okur', parola: 'pano-arayuz-gizli' }
  }).id;
  bTest = pg('test-db', [TEST]);
  bCanli = pg('canli-db', [CANLI]);
  oTest = TEST;
  oCanli = CANLI;
  vtUyg = veritabaniKaydet(vt, projeId, { ad: 'Uygulama DB', eslemeler: { [TEST]: bTest, [CANLI]: bCanli } }).veritabani.id;
  projeGoc = projeKaydet(vt, { ad: 'Göç projesi' });
  ayarYaz(vt, PANO_AYAR_ANAHTARI, { [projeGoc]: ESKI_DUZEN });
  vt.kapat();
  mkdirSync(join(klasor, 'yedekler'), { recursive: true });
  writeFileSync(join(klasor, 'yedekler', 'otomatik-20261001-000000-000.tayedek'), 'sahte');
  nobetci = await nobetciBaslat(klasor, vtYolu, { TEST_SUNUCU_SAHTE_SQL_SURUCUSU: join(__dirname, 'sahte-sql-surucusu.mjs'), SAHTE_SQL_GUNLUK: gunluk });
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  const v = await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: projeId });
  expect(v.basarili, v.mesaj).not.toBe(false);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Sahte sürücünün gördüğü sorgular (SET … dahil). */
const sorgular = (): string[] => readFileSync(gunluk, 'utf8').split('\n').filter(Boolean);

async function sayfaAc(genislik = 1440, yukseklik = 1000): Promise<{ page: Page; hatalar: string[]; yenilemeler: () => number; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, reducedMotion: 'reduce' });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  let yenileme = 0;
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::|409|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
  page.on('request', (r) => { if (r.url().includes('/platform/pano/sql/yenile')) yenileme++; });
  return { page, hatalar, yenilemeler: () => yenileme, kapat: () => baglam.close() };
}

async function git(page: Page, adres: string): Promise<void> {
  await page.goto(`/${adres}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main .iskelet, main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
}

/** Kartın modeldeki ızgara konumu [x, y, w, h] (data-x … data-h). */
const konum = (page: Page, id: string) => page.locator(`.pano-ogesi[data-kart-id="${id}"]`).evaluate((e) => ['x', 'y', 'w', 'h'].map((a) => Number((e as HTMLElement).dataset[a])));

const kartBasliklari = (page: Page) => page.locator('.ozet-panosu .pano-ogesi').evaluateAll((l) => l.filter((e) => getComputedStyle(e).display !== 'none')
  .map((e) => e.getAttribute('data-kart-id')));

/** Yatay taşma yok (sayfa ve pano öğeleri; kendi kaydırma kutusundakiler hariç). */
async function tasmaYok(page: Page): Promise<void> {
  const sorunlar = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth) out.push(`sayfa ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    const kaydirmaIcinde = (e: Element) => {
      for (let p = e.parentElement; p; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('main *, dialog[open] *'))) {
      if (kaydirmaIcinde(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)}: ${Math.round(r.left)}–${Math.round(r.right)}`);
    }
    return out.slice(0, 8);
  });
  expect(sorunlar).toEqual([]);
}

/** Erişilebilir adlar: aria-label görünen metinle başlar; görünür her alanın adı var (erisilebilir-adlar.spec.ts ile aynı kural). */
async function adlarUyumlu(page: Page): Promise<void> {
  const sorunlar = await page.evaluate(() => {
    const out: string[] = [];
    const duz = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
    const gorunur = (e: Element) => { const r = e.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 && !e.closest('[hidden], [aria-hidden="true"]'); };
    const metin = (e: Element): string => {
      let m = '';
      for (const c of e.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) m += c.textContent ?? '';
        else if (c instanceof Element && c.getAttribute('aria-hidden') !== 'true' && !c.classList.contains('gorunmez') && getComputedStyle(c).display !== 'none') m += ` ${metin(c)} `;
      }
      return m;
    };
    const kok = document.querySelector('dialog[open]') ?? document.querySelector('main') ?? document.body;
    for (const e of kok.querySelectorAll('button[aria-label], a[aria-label]')) {
      if (!gorunur(e)) continue;
      const m = duz(metin(e));
      if (!m || !/\p{L}{2}/u.test(m)) continue;
      if (!duz(e.getAttribute('aria-label') ?? '').startsWith(m)) out.push(`ad uyumsuz: "${m}" ≠ "${e.getAttribute('aria-label')}"`);
    }
    for (const e of kok.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
      if (!gorunur(e)) continue;
      const g = e as HTMLInputElement;
      if (!(g.getAttribute('aria-label')?.trim() || g.getAttribute('aria-labelledby') || (g.labels && g.labels.length) || g.getAttribute('title'))) out.push(`etiketsiz: ${e.tagName} ${g.className}`);
    }
    return out;
  });
  expect(sorunlar).toEqual([]);
}

test('varsayılan pano bugünkü Özet; düzenle: kaldır, geri ekle, klavyeyle taşı / boyutlandır, sıra düğmeleri, Vazgeç, Bitti, Varsayılana dön', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  // Varsayılan: Başlarken, özet kutuları, üç kart (bugünkü sıra); düzenleme araçları yok.
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  expect(await page.locator('section.farkindalik-karti h3').allTextContents()).toEqual(['Dikkat', 'Bakım', 'Kapsam ve güvenlik']);
  await expect(page.locator('.ozet-kutulari a.ozet-kutusu')).toHaveCount(3);
  await expect(page.locator('.pano-arac-cubugu')).toHaveCount(0);
  // "Aynı satırdaki kartlar aynı yükseklikte" seçeneği yok; genişlik / yükseklik açılır listeleri yok.
  await expect(page.getByText('Aynı satırdaki kartlar aynı yükseklikte')).toHaveCount(0);
  const duzenle = page.getByRole('button', { name: 'Panoyu düzenle' });
  await duzenle.click();
  const cubuk = page.getByRole('region', { name: 'Pano düzenleme' });
  await expect(cubuk).toBeVisible();
  await expect(duzenle).toBeHidden();
  await expect(page.locator('.pano-arac-cubugu')).toHaveCount(5);
  await expect(page.locator('.ozet-panosu select')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // Kaldır → Kart ekle'den geri ekle (panonun altına; eski yeri boş kalır).
  await page.getByRole('button', { name: 'Kaldır: Bakım' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam']);
  await cubuk.getByRole('button', { name: 'Kart ekle' }).click();
  const pencere = page.getByRole('dialog', { name: 'Kart ekle' });
  await expect(pencere.getByRole('radio', { name: 'Yerleşik kartlar' })).toBeChecked();
  await expect(pencere.locator('.pano-yerlesik-listesi li strong')).toHaveText(['Bakım', 'Koşu trendi']);
  await pencere.getByRole('button', { name: 'Ekle: Bakım' }).click();
  await expect(pencere).toBeHidden();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam', 'bakim']);
  await expect.poll(() => konum(page, 'bakim')).toEqual([0, 18, 4, 7]);
  // Klavye: tutamak odaktayken → dört kez, ↑ yedi kez: Bakım eski yerine döner (düzen yeniden varsayılan).
  await expect(page.getByRole('button', { exact: true, name: 'Taşı: Bakım' })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { exact: true, name: 'Taşı: Bakım' })).toBeFocused();
  await expect.poll(() => konum(page, 'bakim')).toEqual([4, 11, 4, 7]);
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  await expect(cubuk.getByRole('button', { name: 'Varsayılana dön' })).toBeDisabled();
  // Shift + oklar: boyut (genişlik, yükseklik); en küçük boyuttan küçülmez.
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => konum(page, 'bakim')).toEqual([4, 11, 4, 8]);
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => konum(page, 'bakim')).toEqual([4, 11, 4, 3]);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => konum(page, 'bakim')).toEqual([4, 11, 4, 7]);
  // Sıra düğmeleri (okuma sırası): Bakım bir öne → Dikkat ile yer değiştirir.
  await page.getByRole('button', { name: 'Yukarı taşı: Bakım' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'bakim', 'dikkat', 'kapsam']);
  await expect.poll(() => konum(page, 'bakim')).toEqual([0, 11, 4, 7]);
  await expect(page.getByRole('button', { name: 'Yukarı taşı: Başlarken' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Aşağı taşı: Kapsam ve güvenlik' })).toBeDisabled();
  await adlarUyumlu(page);
  // Vazgeç: kayıtlı (varsayılan) düzene döner; hiçbir şey kaydedilmez.
  await cubuk.getByRole('button', { name: 'Vazgeç' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  expect((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).kayitli).toBe(false);
  // Bitti: kaydedilir; sayfa yenilenince düzen korunur.
  await duzenle.click();
  await page.getByRole('button', { name: 'Kaldır: Bakım' }).click();
  await page.getByRole('button', { exact: true, name: 'Taşı: Dikkat' }).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Aşağı taşı: Başlarken' }).click();
  await cubuk.getByRole('button', { name: 'Bitti' }).click();
  await expect(cubuk).toBeHidden();
  await expect(page.locator('.bildirim').filter({ hasText: 'Pano kaydedildi.' })).toBeVisible();
  await git(page, '#/sonuclar/ozet');
  expect(await kartBasliklari(page)).toEqual(['ozetKutulari', 'baslarken', 'dikkat', 'kapsam']);
  await expect.poll(() => konum(page, 'dikkat')).toEqual([0, 11, 5, 7]);
  // Varsayılana dön → Bitti.
  await duzenle.click();
  await cubuk.getByRole('button', { name: 'Varsayılana dön' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  await expect(cubuk.getByRole('button', { name: 'Varsayılana dön' })).toBeDisabled();
  await cubuk.getByRole('button', { name: 'Bitti' }).click();
  await git(page, '#/sonuclar/ozet');
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  expect((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).varsayilan).toBe(true);
  expect(sorgular()).toEqual([]);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('SQL kartı: yalnız okuma uyarısı; yalnız Yenile\'de çalışır (sayfa açılınca sorgu yok); Son veri; yükleniyor; eşik rengi; maskeli tablo', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, yenilemeler, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet/kart-ekle');
  // Adres düzenleme kipini ve Kart ekle penceresini açar.
  const pencere = page.getByRole('dialog', { name: 'Kart ekle' });
  await expect(pencere).toBeVisible();
  await pencere.getByRole('radio', { name: 'SQL sorgusu' }).check();
  await pencere.getByLabel('Kart başlığı').fill('Hatalı kayıtlar');
  await pencere.getByLabel('Veritabanı bağlantısı').selectOption(`b:${bTest}`);
  await pencere.getByRole('textbox', { name: /^Sorgu/ }).fill('INSERT INTO kayitlar (id) VALUES (99)');
  await pencere.getByRole('button', { name: 'Eşik ekle' }).click();
  await pencere.getByLabel('Eşik değeri').fill('0');
  await pencere.getByRole('button', { name: 'Panoya ekle' }).click();
  await expect(pencere.getByRole('alert')).toContainText('Pano yalnız okuma sorgusu çalıştırır');
  await pencere.locator('textarea.pano-sorgu').fill("SELECT COUNT(*) AS hata_sayisi FROM kayitlar WHERE durum = 'hata'");
  await pencere.getByRole('button', { name: 'Panoya ekle' }).click();
  await expect(pencere).toBeHidden();
  // İkinci kart: tablo (yavaş sorgu: yükleniyor durumu görünür).
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Kart ekle' }).click();
  await pencere.getByRole('radio', { name: 'SQL sorgusu' }).check();
  await pencere.getByLabel('Kart başlığı').fill('Son kayıtlar');
  await pencere.getByLabel('Veritabanı bağlantısı').selectOption(`b:${bTest}`);
  await pencere.locator('textarea.pano-sorgu').fill('/* bekle:1200 */ SELECT id, durum, tc_kimlik_no, aciklama FROM kayitlar ORDER BY id');
  await pencere.getByLabel('Görünüm').selectOption('tablo');
  // Kartın zaman aşımı (varsayılan 15 sn; yavaş sorgu için artırılır).
  const zamanAsimi = pencere.getByRole('spinbutton', { name: 'Zaman aşımı (sn)' });
  await expect(zamanAsimi).toHaveValue('15');
  await zamanAsimi.fill('30');
  await pencere.getByRole('button', { name: 'Panoya ekle' }).click();
  await expect(pencere).toBeHidden();
  // Düzenlerken Yenile görünmez.
  await expect(page.getByRole('button', { name: /^Yenile/ })).toHaveCount(0);
  if (process.env.PANO_EKRAN_GORUNTUSU) {
    mkdirSync(process.env.PANO_EKRAN_GORUNTUSU, { recursive: true });
    await page.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-duzenleme-kipi-1440.png'), fullPage: true });
  }
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(page.getByRole('region', { name: 'Pano düzenleme' })).toBeHidden();
  const sayiKarti = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Hatalı kayıtlar' }) });
  const tabloKarti = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Son kayıtlar' }) });
  await expect(sayiKarti.locator('.pano-son-veri')).toHaveText('Henüz yenilenmedi');
  await expect(sayiKarti.locator('.pano-bos-sonuc')).toHaveText('Henüz veri yok — Yenile\'ye basın.');
  await expect(sayiKarti).toContainText('test-db');
  expect(sorgular()).toEqual([]);
  expect(yenilemeler()).toBe(0);
  // Yenile → Son veri (gg.aa.yyyy ss:dd), eşik rengi (> 0 kırmızı).
  await sayiKarti.getByRole('button', { name: 'Yenile: Hatalı kayıtlar' }).click();
  await expect(sayiKarti.locator('.pano-son-veri')).toHaveText(/^Son veri: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  await expect(sayiKarti.locator('.pano-sayi-deger')).toHaveText('4');
  await expect(sayiKarti.locator('.pano-sayi')).toHaveClass(/esik-kirmizi/);
  expect(sorgular()).toEqual(['SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY', "SELECT COUNT(*) AS hata_sayisi FROM kayitlar WHERE durum = 'hata'"]);
  // Yükleniyor durumu (yavaş sorgu), ardından maskeli tablo.
  await tabloKarti.getByRole('button', { name: 'Yenile: Son kayıtlar' }).click();
  await expect(tabloKarti.getByRole('status')).toContainText('Sorgu çalışıyor… (en çok 30 sn)');
  await expect(tabloKarti.getByRole('button', { name: /^Yenile/ })).toBeDisabled();
  await expect(tabloKarti.locator('table tbody tr')).toHaveCount(12, { timeout: 15_000 });
  await expect(tabloKarti.getByRole('status')).toContainText('Güncellendi (12 satır).');
  await expect(tabloKarti.locator('thead th').nth(2)).toContainText('tc_kimlik_no');
  await expect(tabloKarti.locator('tbody tr').first().locator('td').nth(2)).toHaveText('•••');
  expect(await page.locator('main').innerText()).not.toContain(SAHTE_TC);
  const sonVeri = await sayiKarti.locator('.pano-son-veri').textContent();
  if (process.env.PANO_EKRAN_GORUNTUSU) await page.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-sql-karti-1440.png'), fullPage: true });
  await tasmaYok(page);
  await adlarUyumlu(page);
  // Sayfa yeniden açılınca sorgu çalışmaz; son sonuç ve saati önbellekten gelir.
  const once = sorgular().length;
  await git(page, '#/sonuclar/ozet');
  await expect(sayiKarti.locator('.pano-son-veri')).toHaveText(String(sonVeri));
  await expect(sayiKarti.locator('.pano-sayi-deger')).toHaveText('4');
  await page.waitForTimeout(500);
  expect(sorgular()).toHaveLength(once);
  expect(yenilemeler()).toBe(2);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('CANLI ortama ait bağlantı: ilk Yenile onay ister (Vazgeç → sorgu yok), onaydan sonra bu oturumda yeniden sorulmaz', async () => {
  test.setTimeout(90_000);
  const p = await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`) as Record<string, any>;
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [...p.duzen.kartlar,
    { id: 'k-canli', tur: 'sql', boyut: 'orta', ayar: { baslik: 'Canlı sayım', hedef: { baglantiId: bCanli }, sorgu: 'SELECT COUNT(*) AS n FROM kayitlar', gorunum: 'sayi' } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  // Doğrudan istek (onaysız): 409, sorgu yok.
  const once = sorgular().length;
  const r = await nobetciApi(nobetci, '/platform/pano/sql/yenile', { projeId, kartId: 'k-canli' });
  expect(r).toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
  expect(sorgular()).toHaveLength(once);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Canlı sayım' }) });
  await expect(kart).toContainText('CANLI ortam');
  await kart.getByRole('button', { name: 'Yenile: Canlı sayım' }).click();
  const onay = page.getByRole('dialog', { name: 'CANLI ortam' });
  await expect(onay).toBeVisible();
  await onay.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(kart.getByRole('alert')).toContainText('CANLI');
  expect(sorgular()).toHaveLength(once);
  await kart.getByRole('button', { name: 'Yenile: Canlı sayım' }).click();
  await onay.getByRole('button', { name: 'Evet, devam et' }).click();
  await expect(kart.locator('.pano-sayi-deger')).toHaveText('12');
  expect(sorgular()).toHaveLength(once + 2);
  // İkinci Yenile: onay sorulmaz.
  await kart.getByRole('button', { name: 'Yenile: Canlı sayım' }).click();
  await expect(kart.getByRole('status')).toContainText('Güncellendi');
  await expect(onay).toBeHidden();
  expect(sorgular()).toHaveLength(once + 4);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('Nöbetçi verisi ve metin kartı; hızlı arama ("Panoyu düzenle", "Kart ekle") ve Özet rehberi', async () => {
  test.setTimeout(90_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  // Hızlı arama: "Panoyu düzenle" düzenleme kipini açar.
  const ara = async (metin: string, ad: string) => {
    await page.getByRole('button', { name: /^Hızlı arama/ }).click();
    const arama = page.getByRole('dialog', { name: 'Hızlı arama' });
    await arama.getByRole('combobox').fill(metin);
    const secenek = arama.getByRole('listbox', { name: 'Sonuçlar' }).getByRole('option').first();
    await expect(secenek).toContainText(ad);
    await page.keyboard.press('Enter');
  };
  await ara('panoyu düzenle', 'Panoyu düzenle');
  await expect(page.getByRole('region', { name: 'Pano düzenleme' })).toBeVisible();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Vazgeç' }).click();
  await ara('kart ekle', 'Kart ekle');
  const pencere = page.getByRole('dialog', { name: 'Kart ekle' });
  await expect(pencere).toBeVisible();
  // Nöbetçi verisi: talep no'su olmayan senaryolar (boş projede "yok").
  await pencere.getByRole('radio', { name: 'Nöbetçi verisi' }).check();
  await pencere.getByLabel('Şablon').selectOption('talepsiz');
  await pencere.getByRole('button', { name: 'Panoya ekle' }).click();
  await expect(pencere).toBeHidden();
  // Metin kartı: not + iç sayfa bağlantısı.
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Kart ekle' }).click();
  await pencere.getByRole('radio', { name: 'Metin ve bağlantılar' }).check();
  await pencere.getByLabel('Kart başlığı').fill('Ekip notu');
  await pencere.getByLabel('Not').fill('Sürüm öncesi planlı koşuları denetleyin.');
  await pencere.getByRole('button', { name: 'Bağlantı ekle' }).click();
  await pencere.getByLabel('Bağlantının sayfası').selectOption('#/planli-kosular');
  await pencere.getByLabel('Bağlantı metni').fill('Planlı koşular');
  await adlarUyumlu(page);
  await tasmaYok(page);
  await pencere.getByRole('button', { name: 'Panoya ekle' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(page.locator('.pano-veri-karti')).toContainText('Talep no\'su olmayan senaryo yok.');
  const metin = page.locator('.pano-metin-karti');
  await expect(metin).toContainText('Sürüm öncesi planlı koşuları denetleyin.');
  await metin.getByRole('link', { name: 'Planlı koşular' }).click();
  await expect(page).toHaveURL(/#\/planli-kosular$/);
  // Özet rehberi (koşusu olan projede açılır; bu boş projede ilk koşu rehberi açılır): "Panoyu düzenle" ve "SQL kartı" adımları,
  // hedefi sayfadaki düğme.
  await git(page, '#/sonuclar/ozet');
  const adimlar = await page.evaluate(async () => {
    const { REHBERLER } = await import('/arayuz/rehber-icerikleri.js' as string);
    return (REHBERLER['sonuclar-ozet'].adimlar as Array<{ baslik: string; hedef?: string; metin: string | string[] }>)
      .map((a) => ({ baslik: a.baslik, hedef: a.hedef ?? null, var: a.hedef ? Boolean(document.querySelector(a.hedef)) : null, metin: [a.metin].flat().join(' ') }));
  });
  const pano = adimlar.find((a) => a.baslik === 'Panoyu düzenle');
  expect(pano).toMatchObject({ hedef: '.pano-duzenle-dugmesi', var: true });
  expect(pano?.metin).toContain('Varsayılana dön');
  expect(adimlar.find((a) => a.baslik === 'SQL kartı')?.metin).toContain('yalnız "Yenile"ye basınca çalışır');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('yeni görünümler: yüzde (çubuk / ibre), pasta "Diğer", sayı + değişim (▲), liste, durum kutucukları; biçim; görünüm değişince aynı sonuç yeniden çizilir', async () => {
  test.setTimeout(120_000);
  const sql = (id: string, baslik: string, sorgu: string, gorunum: string, ek: Record<string, unknown> = {}, boyut = 'kucuk') =>
    ({ id, tur: 'sql', boyut, ayar: { baslik, hedef: { baglantiId: bTest }, sorgu, gorunum, ...ek } });
  const kartlar = [
    sql('g-oran', 'Başarı oranı', 'SELECT 0.834 AS oran', 'yuzde', { bicim: { hedef: 95 }, esikler: [{ islec: '<', deger: 90, renk: 'sari' }] }),
    sql('g-ibre', 'Doluluk', 'SELECT 0.834 AS oran', 'yuzde', { bicim: { gosterge: 'ibre', hedef: 100 } }),
    sql('g-degisim', 'Kuyruk', '/* artan */ SELECT n AS deger FROM sayac', 'degisim', { bicim: { sonEk: ' adet' } }),
    sql('g-pasta', 'Kategoriler', 'SELECT ad, adet FROM kategoriler', 'pasta', {}, 'orta'),
    sql('g-kutu', 'Durumlar', 'SELECT durum, COUNT(*) AS adet FROM kayitlar GROUP BY durum ORDER BY durum', 'kutucuk',
      { esikler: [{ islec: '>', deger: 3, renk: 'kirmizi' }, { islec: '>=', deger: 1, renk: 'yesil' }] }, 'orta'),
    sql('g-liste', 'Açıklamalar', 'SELECT aciklama FROM kayitlar ORDER BY id', 'liste'),
    sql('g-tutar', 'Toplam tutar', 'SELECT SUM(tutar) AS toplam FROM kayitlar', 'sayi', { bicim: { onEk: '₺', ondalik: 2 } }),
    sql('g-tarih', 'Günler', 'SELECT id, gun FROM kayitlar ORDER BY id LIMIT 3', 'tablo', { bicim: { tarih: 'gun' } }),
    sql('g-cubuk', 'Günlük sayım', 'SELECT gun, adet FROM gunluk_sayim', 'cubuk', { bicim: { sonEk: ' adet' } })
  ];
  const k = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar } });
  expect(k.basarili, k.mesaj).not.toBe(false);
  const once = sorgular().length;
  const { page, hatalar, yenilemeler, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  expect(sorgular()).toHaveLength(once);
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad, exact: true }) });
  for (const ad of ['Başarı oranı', 'Doluluk', 'Kuyruk', 'Kategoriler', 'Durumlar', 'Açıklamalar', 'Toplam tutar', 'Günler', 'Günlük sayım']) {
    await kart(ad).getByRole('button', { name: `Yenile: ${ad}` }).click();
    await expect(kart(ad).locator('.pano-son-veri')).toHaveText(/^Son veri:/);
  }
  // Yüzde: %83,4; hedefe göre çubuk; eşik yüzde değerine (83,4 < 90 → sarı).
  await expect(kart('Başarı oranı').locator('.pano-sayi-deger')).toHaveText('%83,4');
  await expect(kart('Başarı oranı').locator('.pano-yuzde')).toHaveClass(/esik-sari/);
  await expect(kart('Başarı oranı').getByRole('img')).toHaveAttribute('aria-label', /hedef %95/);
  await expect(kart('Başarı oranı')).toContainText('hedefe ulaşma %88');
  await expect(kart('Doluluk').locator('svg.pano-ibre')).toBeVisible();
  // Sayı + değişim: ilk yenilemede "önceki yok", ikincide ▲ (11 → 12: +1, %9,1).
  await expect(kart('Kuyruk').locator('.pano-degisim')).toHaveText('önceki yok');
  await kart('Kuyruk').getByRole('button', { name: 'Yenile: Kuyruk' }).click();
  await expect(kart('Kuyruk').locator('.pano-sayi-deger')).toHaveText('12 adet');
  await expect(kart('Kuyruk').locator('.pano-degisim')).toHaveClass(/artis/);
  await expect(kart('Kuyruk').locator('.pano-degisim')).toContainText('▲ Arttı: 1 adet (%9,1)');
  // Pasta: 11 kategori → 11 dilim ("Diğer" yok); 8. dilimden sonra üretilen renkler; yüzdeler açıklamada.
  const aciklama = kart('Kategoriler').locator('.pano-pasta-aciklama li');
  await expect(aciklama).toHaveCount(11);
  await expect(kart('Kategoriler').locator('.pano-pasta-aciklama')).not.toContainText('Diğer');
  const renkler = await kart('Kategoriler').locator('.pano-pasta-aciklama .pano-renk').evaluateAll((l) => l.map((e) => getComputedStyle(e).backgroundColor));
  expect(new Set(renkler).size).toBe(11);
  await expect(aciklama.first()).toContainText('Kategori 11');
  await expect(aciklama.first()).toContainText('%16,7');
  await expect(kart('Kategoriler').locator('svg.pano-pasta circle.dilim')).toHaveCount(11);
  // Durum kutucukları: renk eşiklere göre (hata 4 > 3 kırmızı, bekliyor 2 ≥ 1 yeşil).
  const kutu = (ad: string) => kart('Durumlar').locator('.pano-kutucuk').filter({ hasText: ad });
  await expect(kutu('hata')).toHaveClass(/esik-kirmizi/);
  await expect(kutu('bekliyor')).toHaveClass(/esik-yesil/);
  await expect(kutu('onaylandi')).toHaveClass(/esik-kirmizi/);
  await expect(kart('Açıklamalar').locator('.pano-liste li')).toHaveCount(12);
  await expect(kart('Toplam tutar').locator('.pano-sayi-deger')).toHaveText('₺819,00');
  await expect(kart('Günler').locator('tbody tr').first().locator('td').nth(1)).toHaveText('11.09.2026');
  await expect(kart('Günlük sayım').locator('figcaption')).toContainText('Per: 9 adet');
  expect(yenilemeler()).toBe(10);
  if (process.env.PANO_EKRAN_GORUNTUSU) {
    mkdirSync(process.env.PANO_EKRAN_GORUNTUSU, { recursive: true });
    await page.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-gorunumler-1440.png'), fullPage: true });
  }
  await tasmaYok(page);
  await adlarUyumlu(page);
  // Görünüm değişince aynı (önbellekteki) sonuç yeni görünümle çizilir; sorgu çalışmaz.
  const sorguSayisi = sorgular().length;
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await page.getByRole('button', { name: 'Düzenle: Başarı oranı' }).click();
  const pencere = page.getByRole('dialog', { name: /^Kartı düzenle/ });
  await pencere.getByLabel('Görünüm').selectOption('sayi');
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(kart('Başarı oranı').locator('.pano-sayi-deger')).toHaveText('0,83');
  await expect(kart('Başarı oranı').locator('.pano-son-veri')).toHaveText(/^Son veri:/);
  expect(sorgular()).toHaveLength(sorguSayisi);
  // 390 px: önbellekten çizilir, taşma yok, sorgu yok.
  const dar = await sayfaAc(390, 900);
  await git(dar.page, '#/sonuclar/ozet');
  await expect(dar.page.locator('.pano-pasta-aciklama li')).toHaveCount(11);
  await tasmaYok(dar.page);
  expect(sorgular()).toHaveLength(sorguSayisi);
  expect([...hatalar, ...dar.hatalar]).toEqual([]);
  await dar.kapat();
  await kapat();
});

test('servis izleme tasarımı: zengin kutucuk (simge, nokta, fark, mini trend); kutucuğa tıklayınca aynı adlı parametreli kartlar birlikte geçer; çizgide dün serisi; pay çubuğu ve etiket', async () => {
  test.setTimeout(120_000);
  const DURUMLAR = ['onaylandi', 'bekliyor', 'hata'];
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 'z-serit', tur: 'sql', x: 0, y: 0, w: 12, h: 5, ayar: { baslik: 'Durum şeridi', hedef: { baglantiId: bTest }, gorunum: 'kutucuk', simge: 'kalkan',
      sorgu: "SELECT durum, COUNT(*) AS adet, 2 AS dun, '1,3,2,' || COUNT(*) AS seri FROM kayitlar GROUP BY durum ORDER BY durum",
      sutunlar: ['durum', 'adet'], ikinci: { tur: 'karsilastir', sutun: 'dun' }, seriSutunu: 'seri', esikler: [{ islec: '>=', deger: 4, renk: 'kirmizi' }],
      tiklama: { kartId: 'z-trend', parametre: 'durum' } } },
    { id: 'z-trend', tur: 'sql', x: 0, y: 5, w: 6, h: 6, ayar: { baslik: 'Trend', hedef: { baglantiId: bTest }, gorunum: 'cizgi',
      sorgu: 'SELECT gun, adet, adet - 1 AS dun FROM gunluk_sayim WHERE :durum IS NOT NULL', ikinci: { tur: 'karsilastir', sutun: 'dun' },
      parametreler: [{ ad: 'durum', etiket: 'Durum', secenekler: DURUMLAR }] } },
    { id: 'z-dagilim', tur: 'sql', x: 6, y: 5, w: 6, h: 6, ayar: { baslik: 'Dağılım', hedef: { baglantiId: bTest }, gorunum: 'tablo',
      sorgu: "SELECT 'Sorgula' AS metot, durum, ROUND(100.0 * COUNT(*) / 12) AS pay FROM kayitlar WHERE durum = :durum GROUP BY durum",
      parametreler: [{ ad: 'durum', etiket: 'Durum', secenekler: DURUMLAR }],
      sutunBicimleri: [{ sutun: 'metot', tur: 'etiket' }, { sutun: 'pay', tur: 'cubuk' }] } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad }) });
  await page.getByRole('region', { name: 'Pano denetimleri' }).getByRole('button', { name: 'Tümünü yenile' }).click();
  for (const ad of ['Durum şeridi', 'Trend', 'Dağılım']) await expect(kart(ad).locator('.pano-son-veri')).toHaveText(/^Son veri:/);
  // Zengin kutucuk: simge, sağlık noktası (eşik), fark (6 - 2 = ▲ +4 kırmızı; artış kötü), mini trend.
  const hataKutusu = kart('Durum şeridi').locator('.pano-kutucuk').filter({ hasText: 'hata' });
  await expect(hataKutusu.locator('.pano-kutucuk-simge')).toBeVisible();
  await expect(kart('Durum şeridi').locator('.pano-kutucuk').filter({ hasText: 'onaylandi' }).locator('.pano-kutucuk-nokta')).toHaveClass(/esik-kirmizi/);
  await expect(kart('Durum şeridi').locator('.pano-kutucuk').filter({ hasText: 'onaylandi' }).locator('.pano-kutucuk-fark')).toContainText('▲ +4');
  await expect(kart('Durum şeridi').locator('.pano-kutucuk').filter({ hasText: 'bekliyor' }).locator('.pano-kutucuk-fark')).toContainText('=');
  await expect(hataKutusu.locator('svg.pano-kutucuk-trend polyline')).toHaveCount(1);
  // Çizgi: dolgulu alan + kesikli dün serisi + açıklama.
  await expect(kart('Trend').locator('svg.pano-grafik .alan')).toHaveCount(1);
  await expect(kart('Trend').locator('svg.pano-grafik .cizgi-ikinci')).toHaveCount(1);
  await expect(kart('Trend').locator('.pano-grafik-aciklama')).toContainText('dun');
  // Tablo: etiket rozeti ve pay çubuğu.
  await expect(kart('Dağılım').locator('.pano-rozet.renk-etiket')).toHaveText('Sorgula');
  await expect(kart('Dağılım').locator('.pano-pay-metin')).toHaveText('%50');
  // Kutucuğa tıklama: hedef kart ve aynı adlı parametreli kart birlikte "hata"ya geçer ve yenilenir.
  await kart('Durum şeridi').getByRole('button', { name: /hata/ }).click();
  await expect(kart('Trend').getByRole('combobox', { name: 'Durum: Trend' })).toHaveValue('hata');
  await expect(kart('Dağılım').getByRole('combobox', { name: 'Durum: Dağılım' })).toHaveValue('hata');
  await expect(kart('Dağılım').locator('tbody td').nth(1)).toHaveText('hata');
  await expect(kart('Dağılım').locator('.pano-pay-metin')).toHaveText('%33');
  // Başlıktaki seçim de bağlı kartı değiştirir.
  await kart('Dağılım').getByRole('combobox', { name: 'Durum: Dağılım' }).selectOption('bekliyor');
  await expect(kart('Trend').getByRole('combobox', { name: 'Durum: Trend' })).toHaveValue('bekliyor');
  await expect(kart('Dağılım').locator('tbody td').nth(1)).toHaveText('bekliyor');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('tablo satır eylemleri: "İncele" satırın tüm sütunlarını açar; satıra tıklayınca detay kartın parametresi seçilir (seçili satır işaretli)', async () => {
  test.setTimeout(90_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 't-ozet', tur: 'sql', x: 0, y: 0, w: 12, h: 6, ayar: { baslik: 'Durum tablosu', hedef: { baglantiId: bTest }, gorunum: 'tablo', satirIncele: true,
      sorgu: 'SELECT durum, COUNT(*) AS adet, MAX(tc_kimlik_no) AS tc FROM kayitlar GROUP BY durum ORDER BY durum', tiklama: { kartId: 't-detay', parametre: 'durum', sutun: 'durum' } } },
    { id: 't-detay', tur: 'sql', x: 0, y: 6, w: 12, h: 8, ayar: { baslik: 'Durum ayrıntısı', hedef: { baglantiId: bTest }, gorunum: 'tablo',
      sorgu: 'SELECT id, durum FROM kayitlar WHERE durum = :durum ORDER BY id', parametreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['onaylandi', 'bekliyor', 'hata'] }] } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad }) });
  await kart('Durum tablosu').getByRole('button', { name: 'Yenile: Durum tablosu' }).click();
  await expect(kart('Durum tablosu').locator('tbody tr')).toHaveCount(3);
  await expect(kart('Durum tablosu').locator('thead th.pano-th-islem')).toHaveText('İşlem');
  // İncele: satırın tüm sütunları (maskeli sütun maskeli); Kapat → odak düğmeye döner.
  await kart('Durum tablosu').getByRole('button', { name: 'İncele: 2. satır' }).click();
  const pencere = page.getByRole('dialog', { name: 'Durum tablosu · 2. satır' });
  await expect(pencere).toBeVisible();
  await expect(pencere.locator('dt')).toHaveText(['durum', 'adet', 'tc']);
  await expect(pencere.locator('dd').first()).toHaveText('hata');
  await expect(pencere.locator('dd').nth(2)).not.toContainText(SAHTE_TC);
  await pencere.getByRole('button', { name: 'Kapat' }).click();
  await expect(kart('Durum tablosu').getByRole('button', { name: 'İncele: 2. satır' })).toBeFocused();
  // Satıra tıklama: detay kartın parametresi seçilir, kart yenilenir, seçili satır işaretlenir.
  await kart('Durum tablosu').locator('tbody tr').nth(1).locator('td').first().click();
  await expect(kart('Durum ayrıntısı').getByRole('combobox', { name: 'Durum: Durum ayrıntısı' })).toHaveValue('hata');
  await expect.poll(() => kart('Durum ayrıntısı').locator('tbody tr td:nth-child(2)').allTextContents()).toEqual(['hata', 'hata', 'hata', 'hata']);
  await expect(kart('Durum tablosu').locator('tbody tr').nth(1)).toHaveClass(/secili/);
  // Klavye: satıra odaklanıp Enter.
  await kart('Durum tablosu').locator('tbody tr').nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(kart('Durum ayrıntısı').getByRole('combobox', { name: 'Durum: Durum ayrıntısı' })).toHaveValue('bekliyor');
  // Form: tıklama sütunu ve İncele ayarı gelir.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await page.getByRole('button', { name: 'Düzenle: Durum tablosu' }).click();
  const form = page.getByRole('dialog', { name: /^Kartı düzenle/ });
  await expect(form.getByLabel('Tıklayınca', { exact: true })).toHaveValue('t-detay|durum');
  await expect(form.getByLabel('Seçilecek değerin sütunu (tablo)')).toHaveValue('durum');
  await expect(form.getByLabel('Satırlarda "İncele" düğmesi (satırın tüm sütunları)')).toBeChecked();
  await form.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Vazgeç' }).click();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('üst şerit: başlık / açıklama, ortam seçimi (mantıksal veritabanı; CANLI\'ya geçişte tek onay), tüm kartların dönemi, Tümünü yenile, otomatik yenileme', async () => {
  test.setTimeout(120_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { baslik: 'Canlı servis durumu', aciklama: 'Anlık sağlık', kartlar: [
    { id: 'u-vt', tur: 'sql', x: 0, y: 0, w: 6, h: 4, ayar: { baslik: 'Mantıksal', hedef: { veritabaniId: vtUyg, ortamId: oTest }, gorunum: 'sayi',
      sorgu: 'SELECT COUNT(*) AS adet FROM kayitlar WHERE gun >= :baslangic' } },
    { id: 'u-dogrudan', tur: 'sql', x: 6, y: 0, w: 6, h: 4, ayar: { baslik: 'Doğrudan', hedef: { baglantiId: bTest }, gorunum: 'sayi', sorgu: 'SELECT COUNT(*) AS adet FROM kayitlar' } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const serit = page.getByRole('region', { name: 'Pano denetimleri' });
  await expect(serit.getByRole('heading', { name: 'Canlı servis durumu' })).toBeVisible();
  await expect(serit).toContainText('Anlık sağlık');
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad }) });
  // Tümünü yenile: iki kart birlikte (CANLI yok: onay sorulmaz).
  await serit.getByRole('button', { name: 'Tümünü yenile' }).click();
  for (const ad of ['Mantıksal', 'Doğrudan']) await expect(kart(ad).locator('.pano-son-veri')).toHaveText(/^Son veri:/);
  await expect(serit).toContainText('Son güncelleme:');
  // Ortam: CANLI seçilince tek CANLI onayı; mantıksal kart CANLI eşlemesiyle sorgulanır, doğrudan bağlantılı kart değişmez.
  const ortam = serit.getByRole('combobox', { name: 'Pano ortamı' });
  await expect(ortam.locator('option')).toHaveText(['Ortam: kartların kendi seçimi', 'Ortam: TEST', 'Ortam: CANLI (CANLI ortam)']);
  await ortam.selectOption({ label: 'Ortam: CANLI (CANLI ortam)' });
  const onay = page.locator('dialog.canli-onay-penceresi');
  await expect(onay).toBeVisible();
  await onay.getByRole('button', { name: 'Evet, devam et' }).click();
  await expect(kart('Mantıksal').locator('.pano-hedef')).toContainText('CANLI');
  await expect.poll(async () => ((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).sqlSonuclari as Record<string, { ortamId?: string }>)['u-vt']?.ortamId).toBe(oCanli);
  await expect(page.locator('dialog.canli-onay-penceresi')).toHaveCount(0);
  // Aynı oturumda yeniden Tümünü yenile: onay sorulmaz.
  await serit.getByRole('button', { name: 'Tümünü yenile' }).click();
  await expect(serit.getByRole('button', { name: 'Tümünü yenile' })).toBeEnabled();
  await expect(page.locator('dialog.canli-onay-penceresi')).toHaveCount(0);
  // Tüm kartların dönemi: döneme bağlı karta yazılır.
  await serit.locator('.pano-serit-donem .tarih-tetik').click();
  await serit.locator('.pano-serit-donem').getByRole('button', { name: 'Son 7 gün' }).click();
  await expect.poll(async () => ((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).duzen as { kartlar: Array<{ id: string; donem?: unknown }> }).kartlar.find((x) => x.id === 'u-vt')?.donem).toEqual({ hizli: '7g' });
  // Otomatik yenileme: seçim kaydedilir; ortam "kartların kendi seçimi"ne dönünce kaydedilir.
  await serit.getByRole('combobox', { name: 'Otomatik yenileme' }).selectOption('5');
  await expect.poll(async () => ((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).duzen as { otomatikYenileDk?: number }).otomatikYenileDk).toBe(5);
  await ortam.selectOption('');
  await expect.poll(async () => ((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).duzen as { ortamId?: string }).ortamId).toBeUndefined();
  // Düzenleme kipinde başlık ve açıklama değişir.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await serit.getByRole('textbox', { name: 'Pano başlığı' }).fill('Servis izleme');
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(serit.getByRole('heading', { name: 'Servis izleme' })).toBeVisible();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('sayı kartı: simge, alt metin, toplam ("6 / 12" + çubuk), karşılaştırma rozeti (▲ %100), eşik renginde kart tonu; formdan ayarlanır', async () => {
  test.setTimeout(90_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 's-toplam', tur: 'sql', x: 0, y: 0, w: 4, h: 4, ayar: { baslik: 'Onaylanan', hedef: { baglantiId: bTest }, gorunum: 'sayi', simge: 'onay', altMetin: 'Tüm kayıtlar',
      sorgu: "SELECT COUNT(CASE WHEN durum = 'onaylandi' THEN 1 END) AS onaylanan, COUNT(*) AS toplam FROM kayitlar", ikinci: { tur: 'toplam', sutun: 'toplam' } } },
    { id: 's-fark', tur: 'sql', x: 4, y: 0, w: 4, h: 4, ayar: { baslik: 'Hatalı', hedef: { baglantiId: bTest }, gorunum: 'sayi', simge: 'uyari', kartTonu: true,
      sorgu: "SELECT COUNT(CASE WHEN durum = 'hata' THEN 1 END) AS bugun, 2 AS dun FROM kayitlar", ikinci: { tur: 'karsilastir', sutun: 'dun' },
      esikler: [{ islec: '>', deger: 3, renk: 'kirmizi' }] } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad }) });
  for (const ad of ['Onaylanan', 'Hatalı']) await kart(ad).getByRole('button', { name: `Yenile: ${ad}` }).click();
  await expect(kart('Onaylanan').locator('.pano-sayi-deger')).toHaveText('6 / 12');
  await expect(kart('Onaylanan').locator('.pano-sayi-alt')).toHaveText('Tüm kayıtlar');
  await expect(kart('Onaylanan').locator('.pano-sayi-simge')).toBeVisible();
  await expect(kart('Onaylanan').locator('.pano-baslik-simgesi.secili')).toBeVisible();
  const dolu = await kart('Onaylanan').locator('.pano-sayi-cubuk-dolu').evaluate((e) => e.getBoundingClientRect().width / (e.parentElement as HTMLElement).getBoundingClientRect().width);
  expect(dolu).toBeCloseTo(0.5, 1);
  await expect(kart('Onaylanan')).not.toHaveClass(/pano-kart-ton-/);
  await expect(kart('Hatalı').locator('.pano-sayi-karsilastirma .pano-rozet')).toHaveClass(/renk-kirmizi/);
  await expect(kart('Hatalı').locator('.pano-sayi-karsilastirma')).toContainText('▲%100');
  await expect(kart('Hatalı').locator('.pano-sayi-karsilastirma')).toContainText('dun: 2');
  await expect(kart('Hatalı')).toHaveClass(/pano-kart-ton-kirmizi/);
  await expect(kart('Hatalı').locator('.pano-sayi-simge')).toHaveClass(/esik-kirmizi/);
  // Form: alanlar dolu gelir; "Artış iyi" seçilince rozet yeşil olur.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await page.getByRole('button', { name: 'Düzenle: Hatalı' }).click();
  const pencere = page.getByRole('dialog', { name: /^Kartı düzenle/ });
  await expect(pencere.getByLabel('Simge')).toHaveValue('uyari');
  await expect(pencere.getByRole('combobox', { name: 'İkinci sütunun türü' })).toHaveValue('karsilastir');
  await expect(pencere.getByRole('combobox', { name: 'İkinci sütun', exact: true })).toHaveValue('dun');
  await pencere.getByLabel('Artış iyi').check();
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(kart('Hatalı').locator('.pano-sayi-karsilastirma .pano-rozet')).toHaveClass(/renk-yesil/);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('sütun biçimleri: değere göre rozet, eşik rengi, değişim oku, sayaç rozeti, alt satır (alt sütun ayrıca görünmez); formdan düzenlenir', async () => {
  test.setTimeout(90_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 'b-tablo', tur: 'sql', x: 0, y: 0, w: 12, h: 10, ayar: { baslik: 'Biçimli tablo', hedef: { baglantiId: bTest }, gorunum: 'tablo',
      sorgu: 'SELECT id, durum, aciklama, tutar, id - 6 AS fark, id % 3 AS sorun FROM kayitlar WHERE id <= 6 ORDER BY id',
      sutunBicimleri: [
        { sutun: 'durum', tur: 'rozet', kurallar: [{ deger: 'HATA', renk: 'kirmizi' }, { deger: 'onaylandi', renk: 'yesil' }] },
        { sutun: 'tutar', tur: 'renk', esikler: [{ islec: '>', deger: 40, renk: 'kirmizi' }] },
        { sutun: 'fark', tur: 'degisim' },
        { sutun: 'sorun', tur: 'sayac' },
        { sutun: 'id', tur: 'altSatir', altSutun: 'aciklama' }] } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Biçimli tablo' }) });
  await kart.getByRole('button', { name: 'Yenile: Biçimli tablo' }).click();
  await expect(kart.locator('tbody tr')).toHaveCount(6);
  // "aciklama" id'nin altında: ayrı sütun olarak görünmez.
  expect(await kart.locator('thead th').evaluateAll((l) => l.map((e) => e.getAttribute('data-sutun')))).toEqual(['id', 'durum', 'tutar', 'fark', 'sorun']);
  const hucre = (satir: number, sutun: number) => kart.locator('tbody tr').nth(satir).locator('td').nth(sutun);
  await expect(hucre(1, 0).locator('.pano-hucre-ana')).toHaveText('2');
  await expect(hucre(1, 0).locator('.pano-hucre-alt')).toHaveText('Kayıt 2');
  // Rozet: büyük / küçük harf yok sayılır; kuralı olmayan değer düz metin.
  await expect(hucre(1, 1).locator('.pano-rozet')).toHaveClass(/renk-kirmizi/);
  await expect(hucre(1, 1)).toHaveText('hata');
  await expect(hucre(2, 1).locator('.pano-rozet')).toHaveClass(/renk-yesil/);
  await expect(hucre(0, 1).locator('.pano-rozet')).toHaveCount(0);
  // Eşik rengi: tutar > 40 kırmızı (id 4 → 42).
  await expect(hucre(3, 2)).toHaveClass(/renk-kirmizi/);
  await expect(hucre(2, 2)).not.toHaveClass(/renk-/);
  // Değişim: id - 6 → negatif ▼ yeşil, sıfır =; sayaç: 0 soluk, 0 dışı kırmızı rozet.
  await expect(hucre(0, 3).locator('.pano-rozet')).toHaveClass(/renk-yesil/);
  await expect(hucre(0, 3)).toContainText('▼');
  await expect(hucre(5, 3)).toContainText('=');
  await expect(hucre(0, 4).locator('.pano-rozet')).toHaveClass(/renk-kirmizi/);
  await expect(hucre(2, 4)).toHaveClass(/soluk/);
  // Form: kurallar metin olarak gelir; değiştirilip kaydedilince tablo yeni kurala göre çizilir; hatalı satır uyarı verir.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await page.getByRole('button', { name: 'Düzenle: Biçimli tablo' }).click();
  const pencere = page.getByRole('dialog', { name: /^Kartı düzenle/ });
  const kurallar = pencere.getByRole('textbox', { name: 'Kurallar (her satırda bir kural)' });
  await expect(kurallar.first()).toHaveValue('HATA = kırmızı\nonaylandi = yeşil');
  await kurallar.first().fill('hata = kırmızı\nbekliyor = sarı\nbozuk satır');
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await expect(pencere).toContainText('durum: 3. satır');
  await kurallar.first().fill('hata = kırmızı\nbekliyor = sarı');
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(hucre(0, 1).locator('.pano-rozet')).toHaveClass(/renk-sari/);
  await expect(hucre(2, 1).locator('.pano-rozet')).toHaveCount(0);
  await expect(hucre(2, 1)).toHaveText('onaylandi');
  await expect(hucre(1, 1).locator('.pano-rozet')).toHaveClass(/renk-kirmizi/);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('kart parametresi: başlıktaki seçim değeri parametre olarak bağlar ve kartı yeniler; özet kutucuğuna tıklayınca detay kartın parametresi seçilir; kalıcı', async () => {
  test.setTimeout(90_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 'p-ozet', tur: 'sql', x: 0, y: 0, w: 12, h: 4, ayar: { baslik: 'Durum özeti', hedef: { baglantiId: bTest }, gorunum: 'kutucuk',
      sorgu: 'SELECT durum, COUNT(*) AS adet FROM kayitlar GROUP BY durum ORDER BY durum', tiklama: { kartId: 'p-detay', parametre: 'durum' } } },
    { id: 'p-detay', tur: 'sql', x: 0, y: 4, w: 12, h: 8, ayar: { baslik: 'Durum ayrıntısı', hedef: { baglantiId: bTest }, gorunum: 'tablo',
      sorgu: 'SELECT id, durum FROM kayitlar WHERE durum = :durum ORDER BY id',
      parametreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['onaylandi', 'bekliyor', 'hata'] }] } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  // Sorguda geçmeyen parametre kaydedilmez.
  const yanlis = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 'p-yanlis', tur: 'sql', x: 0, y: 0, w: 6, h: 4, ayar: { baslik: 'Yanlış', hedef: { baglantiId: bTest }, gorunum: 'tablo', sorgu: 'SELECT 1',
      parametreler: [{ ad: 'servis', etiket: 'Servis', secenekler: ['A'] }] } }] } });
  expect(yanlis.basarili).toBe(false);
  expect(String(yanlis.mesaj)).toContain('Sorguda :servis geçmiyor');
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = (ad: string) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: ad }) });
  const ozet = kart('Durum özeti');
  const detay = kart('Durum ayrıntısı');
  const secim = detay.getByRole('combobox', { name: 'Durum: Durum ayrıntısı' });
  await expect(secim).toHaveValue('onaylandi');
  const durumlar = () => detay.locator('tbody tr td:nth-child(2)').allTextContents();
  // Başlıktaki seçim: kaydedilir ve kart yenilenir (değer sürücü parametresi; SQL metninde değer yok).
  const once = sorgular().length;
  await secim.selectOption('bekliyor');
  await expect.poll(durumlar).toEqual(['bekliyor', 'bekliyor']);
  await expect(detay.locator('.pano-son-veri')).toContainText('bekliyor');
  const yeniSorgular = sorgular().slice(once).filter((q) => q.includes('FROM kayitlar WHERE'));
  expect(yeniSorgular.at(-1)).toContain('durum = $1');
  expect(yeniSorgular.join(' ')).not.toContain("'bekliyor'");
  // Özet kutucuğu: tıklayınca detay kartın parametresi seçilir ve yenilenir; seçili kutucuk işaretli.
  await ozet.getByRole('button', { name: 'Yenile: Durum özeti' }).click();
  const hataKutusu = ozet.getByRole('button', { name: /hata/ });
  await expect(hataKutusu).toHaveAttribute('aria-pressed', 'false');
  await hataKutusu.click();
  await expect(detay.getByRole('combobox', { name: 'Durum: Durum ayrıntısı' })).toHaveValue('hata');
  await expect.poll(durumlar).toEqual(['hata', 'hata', 'hata', 'hata']);
  await expect(ozet.getByRole('button', { name: /hata/ })).toHaveAttribute('aria-pressed', 'true');
  // Kalıcı: yeniden açınca seçim ve son sonuç yerinde (sorgu çalışmaz).
  const sonra = sorgular().length;
  await page.reload();
  await expect(kart('Durum ayrıntısı').getByRole('combobox', { name: 'Durum: Durum ayrıntısı' })).toHaveValue('hata');
  await expect.poll(durumlar).toEqual(['hata', 'hata', 'hata', 'hata']);
  expect(sorgular().length).toBe(sonra);
  const pano = await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`);
  expect(((pano.duzen as { kartlar: Array<{ id: string; parametreDegerleri?: unknown }> }).kartlar.find((x) => x.id === 'p-detay'))?.parametreDegerleri).toEqual({ durum: 'hata' });
  // Kart formu: parametre satırı ve "Kutucuğa tıklayınca" hedefi; formdan yeni seçenek eklenince başlıkta görünür.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await page.getByRole('button', { name: 'Düzenle: Durum özeti' }).click();
  const pencere = page.getByRole('dialog', { name: /^Kartı düzenle/ });
  await expect(pencere.getByLabel('Tıklayınca', { exact: true })).toHaveValue('p-detay|durum');
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('button', { name: 'Düzenle: Durum ayrıntısı' }).click();
  await expect(pencere.getByRole('textbox', { name: 'Parametre adı (sorguda)' })).toHaveValue(':durum');
  await pencere.getByRole('textbox', { name: 'Parametre seçenekleri (her satırda bir değer)' }).fill('onaylandi\nbekliyor\nhata\niptal');
  await pencere.getByRole('button', { name: 'Uygula' }).click();
  await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Bitti' }).click();
  await expect(kart('Durum ayrıntısı').getByRole('combobox', { name: 'Durum: Durum ayrıntısı' }).locator('option')).toHaveText(['onaylandi', 'bekliyor', 'hata', 'iptal']);
  await expect(kart('Durum ayrıntısı').getByRole('combobox', { name: 'Durum: Durum ayrıntısı' })).toHaveValue('hata');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('tablo kartın yüksekliğini doldurur: uzun kartta 22rem sınırı yok, kısa kartta tablo kendi içinde kaydırılır', async () => {
  test.setTimeout(90_000);
  const sorgu = 'SELECT id, durum, tc_kimlik_no, tutar, gun FROM kayitlar ORDER BY id';
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [
    { id: 't-uzun', tur: 'sql', x: 0, y: 0, w: 6, h: 20, ayar: { baslik: 'Uzun tablo', hedef: { baglantiId: bTest }, sorgu, gorunum: 'tablo' } },
    { id: 't-kisa', tur: 'sql', x: 6, y: 0, w: 6, h: 6, ayar: { baslik: 'Kısa tablo', hedef: { baglantiId: bTest }, sorgu, gorunum: 'tablo' } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const olc = async (baslik: string) => {
    const kart = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: baslik }) });
    await kart.getByRole('button', { name: `Yenile: ${baslik}` }).click();
    await expect(kart.locator('tbody tr')).toHaveCount(12);
    return kart.locator('.pano-tablo').evaluate((e) => {
      const govde = e.closest('.pano-sql-govde') as HTMLElement;
      const t = e.getBoundingClientRect();
      const g = govde.getBoundingClientRect();
      return { yukseklik: t.height, altBosluk: g.bottom - t.bottom, kayar: e.scrollHeight > e.clientHeight + 1 };
    });
  };
  const uzun = await olc('Uzun tablo');
  // 12 satır ~22rem'i (352 px) aşar: tablo kartla uzar, kaydırma gerekmez, altta boş tablo alanı kalmaz.
  expect(uzun.yukseklik).toBeGreaterThan(400);
  expect(uzun.kayar).toBe(false);
  expect(uzun.altBosluk).toBeLessThan(24);
  const kisa = await olc('Kısa tablo');
  expect(kisa.kayar).toBe(true);
  expect(kisa.altBosluk).toBeLessThan(24);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('tablo: başlığı sürükle / menüyle taşı, gizle / göster, genişlik, sıralama (sayı, tarih, metin); kalıcı; sorgu yeniden çalışmaz', async () => {
  test.setTimeout(120_000);
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { kartlar: [{ id: 't-tablo', tur: 'sql', boyut: 'tam',
    ayar: { baslik: 'Kayıt tablosu', hedef: { baglantiId: bTest }, sorgu: 'SELECT id, durum, tc_kimlik_no, tutar, gun FROM kayitlar ORDER BY id', gorunum: 'tablo' } }] } });
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  const { page, hatalar, yenilemeler, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kart = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Kayıt tablosu' }) });
  await kart.getByRole('button', { name: 'Yenile: Kayıt tablosu' }).click();
  await expect(kart.locator('tbody tr')).toHaveCount(12);
  const sonVeri = await kart.locator('.pano-son-veri').textContent();
  const sorguSayisi = sorgular().length;
  const basliklar = () => kart.locator('thead th').evaluateAll((l) => l.map((e) => e.getAttribute('data-sutun')));
  const th = (ad: string) => kart.locator(`thead th[data-sutun="${ad}"]`);
  const ilkSutun = (i: number) => kart.locator('tbody tr').evaluateAll((l, j) => l.map((r) => r.querySelectorAll('td')[j]?.textContent ?? ''), i);
  expect(await basliklar()).toEqual(['id', 'durum', 'tc_kimlik_no', 'tutar', 'gun']);
  // Sayı sütununun başlığı da değerler gibi sağa yaslı (genişlik değişince değerler başlığın altında kalır).
  await expect(th('id')).toHaveClass(/\bsayi\b/);
  await expect(th('durum')).not.toHaveClass(/\bsayi\b/);
  expect(await th('id').locator('.pano-th').evaluate((e) => getComputedStyle(e).justifyContent)).toBe('flex-end');
  // Sürükle-bırak: "gun" başlığını "id"nin üstüne.
  await th('gun').dragTo(th('id'));
  await expect.poll(basliklar).toEqual(['gun', 'id', 'durum', 'tc_kimlik_no', 'tutar']);
  // Klavye: sütun menüsü → "Sola taşı" (Enter); odak menü düğmesine döner.
  await kart.getByRole('button', { name: 'Sütun menüsü: durum' }).focus();
  await page.keyboard.press('Enter');
  const menu = kart.getByRole('menu', { name: 'Sütun menüsü: durum' });
  await expect(menu.getByRole('menuitem', { name: 'Sola taşı' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(basliklar).toEqual(['gun', 'durum', 'id', 'tc_kimlik_no', 'tutar']);
  await expect(kart.getByRole('button', { name: 'Sütun menüsü: durum' })).toBeFocused();
  // Gizle: menüden; "Sütunlar" ile geri aç. Maskeli sütun gizlenip açılınca maskeli kalır.
  await kart.getByRole('button', { name: 'Sütun menüsü: tutar' }).click();
  await kart.getByRole('menu', { name: 'Sütun menüsü: tutar' }).getByRole('menuitem', { name: 'Gizle' }).click();
  await expect.poll(basliklar).toEqual(['gun', 'durum', 'id', 'tc_kimlik_no']);
  await expect(kart.getByRole('button', { name: 'Sütunlar (1 gizli)' })).toBeVisible();
  await kart.getByRole('button', { name: 'Sütun menüsü: tc_kimlik_no' }).click();
  await kart.getByRole('menu').getByRole('menuitem', { name: 'Gizle' }).click();
  await kart.getByRole('button', { name: 'Sütunlar (2 gizli)' }).click();
  const sutunMenusu = kart.getByRole('menu', { name: 'Görünen sütunlar' });
  await expect(sutunMenusu.getByRole('menuitemcheckbox', { name: 'tc_kimlik_no' })).toHaveAttribute('aria-checked', 'false');
  await sutunMenusu.getByRole('menuitemcheckbox', { name: 'tc_kimlik_no' }).click();
  await expect.poll(basliklar).toEqual(['gun', 'durum', 'id', 'tc_kimlik_no']);
  expect(new Set(await ilkSutun(3))).toEqual(new Set(['•••']));
  // Genişlik: kenar tutamağını fareyle sürükle (+80 px), klavyeyle (→ +16), çift tıkla sığdır.
  const tutamak = kart.getByRole('separator', { name: 'Sütun genişliği: durum' });
  const kutu = (await tutamak.boundingBox())!;
  const ilk = (await th('durum').boundingBox())!.width;
  await page.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2);
  await page.mouse.down();
  await page.mouse.move(kutu.x + kutu.width / 2 + 40, kutu.y + kutu.height / 2, { steps: 4 });
  await page.mouse.move(kutu.x + kutu.width / 2 + 80, kutu.y + kutu.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await kart.locator('col[data-sutun="durum"]').getAttribute('width'))).toBe(Math.round(ilk + 80));
  // İlk elle genişlikte diğer sütunlar o anki genişliklerinde sabitlenir: tablo genişliklerin toplamı kadar (kartı doldurmaz;
  // sütunlar yan yana, biri daralınca sağdakiler sola kayar).
  const tabloEl = kart.locator('table.pano-tablo-tablosu');
  await expect(tabloEl).toHaveClass(/\bsabit-genislik\b/);
  const toplam = await kart.locator('col').evaluateAll((l) => l.reduce((t, c) => t + Number(c.getAttribute('width') || 0), 0));
  expect(await kart.locator('col:not([width])').count()).toBe(0);
  expect(Math.abs((await tabloEl.boundingBox())!.width - toplam)).toBeLessThanOrEqual(2);
  const sonrakiOnce = (await th('id').boundingBox())!.x;
  await kart.getByRole('separator', { name: 'Sütun genişliği: durum' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await th('id').boundingBox())!.x).toBeLessThan(sonrakiOnce - 4);
  await kart.getByRole('separator', { name: 'Sütun genişliği: durum' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await kart.locator('col[data-sutun="durum"]').getAttribute('width'))).toBe(Math.round(ilk + 80));
  await kart.getByRole('separator', { name: 'Sütun genişliği: id' }).focus();
  await page.keyboard.press('ArrowRight');
  const idGenislik = Number(await kart.locator('col[data-sutun="id"]').getAttribute('width'));
  expect(idGenislik).toBeGreaterThan(40);
  await expect(kart.getByRole('separator', { name: 'Sütun genişliği: id' })).toBeFocused();
  await kart.getByRole('separator', { name: 'Sütun genişliği: id' }).dblclick();
  await expect(kart.locator('col[data-sutun="id"]')).not.toHaveAttribute('width', /\d/);
  // Sıralama (yalnız ekranda): sayı, metin (tr-TR), tarih; artan → azalan → kapalı; aria-sort.
  const sirala = (ad: string) => th(ad).locator('[data-rol="sirala"]');
  await sirala('id').click();
  await expect(th('id')).toHaveAttribute('aria-sort', 'ascending');
  expect((await ilkSutun(2)).slice(0, 3)).toEqual(['1', '2', '3']);
  await sirala('id').click();
  await expect(th('id')).toHaveAttribute('aria-sort', 'descending');
  expect((await ilkSutun(2)).slice(0, 3)).toEqual(['12', '11', '10']);
  await sirala('id').click();
  await expect(th('id')).not.toHaveAttribute('aria-sort', /./);
  await sirala('durum').click();
  expect(await ilkSutun(1)).toEqual(['bekliyor', 'bekliyor', 'hata', 'hata', 'hata', 'hata', 'onaylandi', 'onaylandi', 'onaylandi', 'onaylandi', 'onaylandi', 'onaylandi']);
  await sirala('gun').click();
  await sirala('gun').click();
  await expect(th('gun')).toHaveAttribute('aria-sort', 'descending');
  expect((await ilkSutun(0))[0]).toBe('2026-09-22');
  await expect(sirala('gun')).toBeFocused();
  await adlarUyumlu(page);
  await tasmaYok(page);
  if (process.env.PANO_EKRAN_GORUNTUSU) {
    mkdirSync(process.env.PANO_EKRAN_GORUNTUSU, { recursive: true });
    await kart.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-tablo-karti-1440.png') });
  }
  // Hiçbiri sorguyu yeniden çalıştırmadı; "Son veri" aynı.
  expect(sorgular()).toHaveLength(sorguSayisi);
  expect(yenilemeler()).toBe(1);
  await expect(kart.locator('.pano-son-veri')).toHaveText(String(sonVeri));
  // Kalıcı: sayfa yeniden yüklenince aynı sıra, gizli sütun, genişlik; sıralama kaydedilmez.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main .iskelet, main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(basliklar).toEqual(['gun', 'durum', 'id', 'tc_kimlik_no']);
  await expect(kart.locator('col[data-sutun="durum"]')).toHaveAttribute('width', String(Math.round(ilk + 80)));
  await expect(th('gun')).not.toHaveAttribute('aria-sort', /./);
  await expect(kart.locator('.pano-son-veri')).toHaveText(String(sonVeri));
  const p = await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`) as Record<string, any>;
  expect(p.duzen.kartlar[0].ayar).toMatchObject({ sutunlar: ['gun', 'durum', 'id', 'tc_kimlik_no'], sutunGenislikleri: { durum: Math.round(ilk + 80) } });
  expect(Object.keys(p.sqlSonuclari)).toEqual(['t-tablo']);
  expect(sorgular()).toHaveLength(sorguSayisi);
  // 390 px: yatay kaydırma ipucu, sayfa taşmaz.
  const dar = await sayfaAc(390, 900);
  await git(dar.page, '#/sonuclar/ozet');
  const darKart = dar.page.locator('section.pano-sql-karti');
  await expect(darKart.locator('.kaydirma-bilgisi')).toBeVisible();
  await expect(darKart.locator('.kaydirma-bilgisi')).toContainText('yana kaydırın');
  await tasmaYok(dar.page);
  await adlarUyumlu(dar.page);
  expect([...hatalar, ...dar.hatalar]).toEqual([]);
  await dar.kapat();
  await kapat();
});

test('serbest ızgara: boş yere sürükle (üstü boş kalır, kaydedilir), gölge, çakışmada aşağı itme, sağ kartı uzatınca soldakiler değişmez, klavye, grafik ölçeklenir, 390 px tek sütun', async () => {
  test.setTimeout(150_000);
  const SATIR = 48; const BOSLUK = 14;
  const satirPx = (n: number) => n * SATIR + (n - 1) * BOSLUK;
  const metin = (id: string, baslik: string, x: number, y: number, w: number, h: number) => ({ id, tur: 'metin', x, y, w, h, ayar: { baslik, not: `${baslik} notu.`, baglantilar: [] } });
  // Kullanıcının panosu: üç küçük kart, altında geniş "RAWLOG" ve iki grafik kartı (önbellekte sonucu olsun diye bir kez yenilenir).
  const kaydet = await nobetciApi(nobetci, '/platform/pano/kaydet', { projeId, duzen: { surum: 2, kartlar: [
    { id: 'ozetKutulari', tur: 'ozetKutulari', x: 0, y: 0, w: 12, h: 4 },
    { id: 'dikkat', tur: 'dikkat', x: 0, y: 4, w: 4, h: 7 }, { id: 'bakim', tur: 'bakim', x: 4, y: 4, w: 4, h: 7 }, { id: 'kapsam', tur: 'kapsam', x: 8, y: 4, w: 4, h: 7 },
    metin('k-raw', 'RAWLOG', 0, 11, 12, 3),
    { id: 'b-grafik', tur: 'sql', x: 0, y: 14, w: 6, h: 8, ayar: { baslik: 'Günlük grafik', hedef: { baglantiId: bTest }, sorgu: 'SELECT gun, adet FROM gunluk_sayim', gorunum: 'cubuk' } },
    { id: 'b-alcak', tur: 'sql', x: 0, y: 22, w: 12, h: 5, ayar: { baslik: 'Alçak grafik', hedef: { baglantiId: bTest }, sorgu: 'SELECT gun, adet FROM gunluk_sayim', gorunum: 'cubuk' } }
  ] } }) as Record<string, any>;
  expect(kaydet.basarili, kaydet.mesaj).not.toBe(false);
  for (const kartId of ['b-grafik', 'b-alcak']) expect((await nobetciApi(nobetci, '/platform/pano/sql/yenile', { projeId, kartId })).basarili).not.toBe(false);
  const { page, hatalar, kapat } = await sayfaAc(1440, 2400);
  await git(page, '#/sonuclar/ozet');
  const sar = (id: string) => page.locator(`.pano-ogesi[data-kart-id="${id}"]`);
  const kutu = async (id: string) => (await sar(id).boundingBox())!;
  const cakismaYok = async () => {
    const kutular = await page.locator('.ozet-panosu > .pano-ogesi:visible').evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    for (let i = 0; i < kutular.length; i++) for (let j = i + 1; j < kutular.length; j++) {
      const [a, b] = [kutular[i], kutular[j]];
      expect(a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1, `kart ${i} ve ${j} üst üste`).toBe(false);
    }
  };
  // Kartın yüksekliği içerikten bağımsız: h satır; Kapsam'ın içeriği uzun olsa da üç kart aynı boyda (7 satır).
  for (const id of ['dikkat', 'bakim', 'kapsam']) await expect.poll(async () => (await kutu(id)).height).toBeCloseTo(satirPx(7), 0);
  await expect.poll(async () => (await kutu('b-grafik')).height).toBeCloseTo(satirPx(8), 0);
  // Grafik kartı doldurur ve gerilmez: viewBox ekrandaki boyut; eksen yazısının en / boy oranı yüksek ve alçak kartta aynı.
  expect((await sar('b-grafik').locator('svg.pano-grafik').boundingBox())!.height).toBeGreaterThan(300);
  const yazi = async (id: string) => { const k = (await sar(id).locator('text.eksen-yazi', { hasText: 'Pzt' }).boundingBox())!; return { oran: k.width / k.height, h: k.height }; };
  await expect.poll(async () => Math.abs((await yazi('b-grafik')).oran - (await yazi('b-alcak')).oran)).toBeLessThan(0.05);
  expect(Math.abs((await yazi('b-grafik')).h - (await yazi('b-alcak')).h)).toBeLessThan(1);
  expect(await sar('b-grafik').locator('svg.pano-grafik').evaluate((e) => { const r = e.getBoundingClientRect(); return e.getAttribute('viewBox') === `0 0 ${Math.round(r.width)} ${Math.round(r.height)}`; })).toBe(true);
  await cakismaYok();

  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  const cubuk = page.getByRole('region', { name: 'Pano düzenleme' });
  const pano = (await page.locator('.ozet-panosu').boundingBox())!;
  const sutun = (pano.width + BOSLUK) / 12;
  const satir = SATIR + BOSLUK;
  /** Kartı tutamağından tutup ızgaradaki (x, y) hücresine sürükler; bırakmadan önce gölgenin hücresi döner. */
  const surukle = async (id: string, x: number, y: number) => {
    const t = (await sar(id).getByRole('button', { exact: true, name: /^Taşı: / }).boundingBox())!;
    const k = await kutu(id);
    const p = (await page.locator('.ozet-panosu').boundingBox())!;
    const ofX = t.x + t.width / 2 - k.x; const ofY = t.y + t.height / 2 - k.y;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2 + 10, t.y + t.height / 2 + 10, { steps: 2 });
    await page.mouse.move(p.x + x * sutun + ofX, p.y + y * satir + ofY, { steps: 8 });
    const golge = page.locator('.pano-golge');
    await expect(golge).toBeVisible();
    const gk = (await golge.boundingBox())!;
    await page.mouse.up();
    await expect(golge).toBeHidden();
    return [Math.round((gk.x - p.x) / sutun), Math.round((gk.y - p.y) / satir)];
  };

  // 1) Kullanıcının isteği: Kapsam köşe tutamağıyla aşağı uzar (sağ sütun), soldaki kartların boyu DEĞİŞMEZ.
  const dikkat0 = await kutu('dikkat'); const bakim0 = await kutu('bakim');
  const kose = page.getByRole('button', { name: 'Boyutlandır: Kapsam ve güvenlik' });
  const kk = (await kose.boundingBox())!;
  await page.mouse.move(kk.x + kk.width / 2, kk.y + kk.height / 2);
  await page.mouse.down();
  await page.mouse.move(kk.x + kk.width / 2, kk.y + kk.height / 2 + 3 * satir, { steps: 4 });
  await expect(page.locator('.pano-golge')).toBeVisible();
  await page.mouse.move(kk.x + kk.width / 2, kk.y + kk.height / 2 + 7 * satir + 5, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => konum(page, 'kapsam')).toEqual([8, 4, 4, 14]);
  await expect(kose).toBeFocused();
  expect((await kutu('dikkat')).height).toBeCloseTo(dikkat0.height, 0);
  expect((await kutu('bakim')).height).toBeCloseTo(bakim0.height, 0);
  expect((await kutu('dikkat')).y).toBeCloseTo(dikkat0.y, 0);
  // Uzayan Kapsam RAWLOG'a değdi: RAWLOG (ve altındakiler) aşağı itildi, boyları aynı.
  await expect.poll(() => konum(page, 'k-raw')).toEqual([0, 18, 12, 3]);
  await cakismaYok();

  // 2) RAWLOG'u köşeden daralt (8 sütun) ve sol iki sütunun altına sürükle: üstünde boşluk kalmaz ama yukarı kendiliğinden çıkmaz.
  const rk = page.getByRole('button', { name: 'Boyutlandır: RAWLOG' });
  await rk.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect.poll(() => konum(page, 'k-raw')).toEqual([0, 18, 8, 3]);
  expect(await surukle('k-raw', 0, 11)).toEqual([0, 11]);
  await expect.poll(() => konum(page, 'k-raw')).toEqual([0, 11, 8, 3]);
  await expect.poll(() => konum(page, 'kapsam')).toEqual([8, 4, 4, 14]);
  await expect(page.getByRole('button', { exact: true, name: 'Taşı: RAWLOG' })).toBeFocused();

  // 3) Boş bir yere sürükle: Dikkat sağda, Kapsam'ın altında boş hücreye (x 8, y 20) → eski yeri ve üstü boş kalır; kimse yukarı çıkmaz.
  const once = Object.fromEntries(await Promise.all(['bakim', 'kapsam', 'b-grafik', 'b-alcak'].map(async (id) => [id, await konum(page, id)])));
  expect(await surukle('dikkat', 8, 20)).toEqual([8, 20]);
  await expect.poll(() => konum(page, 'dikkat')).toEqual([8, 20, 4, 7]);
  for (const id of Object.keys(once)) expect(await konum(page, id), id).toEqual(once[id]);
  // Dikkat'in üstünde (y 18–19) ve eski yerinde (x 0–3, y 4–10) kart yok.
  const bosMu = async (x: number, y: number, w: number, h: number) => page.evaluate(([x0, y0, w0, h0]) => [...document.querySelectorAll<HTMLElement>('.ozet-panosu > .pano-ogesi')]
    .every((e) => { const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((a) => Number(e.dataset[a])); return x + w <= x0 || x0 + w0 <= x || y + h <= y0 || y0 + h0 <= y; }), [x, y, w, h]);
  expect(await bosMu(0, 4, 4, 7)).toBe(true);
  expect(await bosMu(8, 18, 4, 2)).toBe(true);

  // 4) Çakışmada aşağı itme: Bakım, grafik kartının üstüne bırakılır → grafik ve altındaki kart aşağı iner, üst üste binme yok.
  expect(await konum(page, 'b-grafik')).toEqual([0, 21, 6, 8]);
  expect(await surukle('bakim', 0, 18)).toEqual([0, 18]);
  await expect.poll(() => konum(page, 'bakim')).toEqual([0, 18, 4, 7]);
  await expect.poll(() => konum(page, 'b-grafik')).toEqual([0, 25, 6, 8]);
  await expect.poll(() => konum(page, 'b-alcak')).toEqual([0, 33, 12, 5]);
  await cakismaYok();

  // 5) Klavye: tutamakta oklar konum, Shift + oklar boyut; köşe tutamağında oklar boyut.
  await page.getByRole('button', { exact: true, name: 'Taşı: Dikkat' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => konum(page, 'dikkat')).toEqual([7, 19, 4, 7]);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => konum(page, 'dikkat')).toEqual([7, 19, 5, 8]);
  const dk = page.getByRole('button', { name: 'Boyutlandır: Dikkat' });
  await dk.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => konum(page, 'dikkat')).toEqual([7, 19, 4, 7]);
  await expect(dk).toBeFocused();
  await cakismaYok();
  await adlarUyumlu(page);
  await tasmaYok(page);
  if (process.env.PANO_EKRAN_GORUNTUSU) {
    mkdirSync(process.env.PANO_EKRAN_GORUNTUSU, { recursive: true });
    await page.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-izgara-duzenleme-1440.png'), fullPage: true });
  }
  await cubuk.getByRole('button', { name: 'Bitti' }).click();
  await expect(cubuk).toBeHidden();
  // Kalıcı: yeniden yükleyince aynı konumlar; düzende yalnız ızgara konumları (eski boyut / yükseklik / eşit yükseklik alanları yok).
  const beklenen = Object.fromEntries(await Promise.all(['ozetKutulari', 'dikkat', 'bakim', 'kapsam', 'k-raw', 'b-grafik', 'b-alcak'].map(async (id) => [id, await konum(page, id)])));
  await page.reload();
  await page.waitForLoadState('networkidle');
  for (const [id, k] of Object.entries(beklenen)) await expect.poll(() => konum(page, id), id).toEqual(k);
  const p = await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`) as Record<string, any>;
  expect(p.duzen.surum).toBe(2);
  expect('esitYukseklik' in p.duzen).toBe(false);
  expect(Object.fromEntries(p.duzen.kartlar.map((x: Record<string, any>) => [x.id, [x.x, x.y, x.w, x.h]]))).toEqual(beklenen);
  expect(p.duzen.kartlar.some((x: Record<string, unknown>) => 'boyut' in x || 'yukseklik' in x)).toBe(false);
  // Görünümde Dikkat'in üstü boş: üstündeki hücre bölgesinde hiçbir kartın kutusu yok.
  await cakismaYok();
  if (process.env.PANO_EKRAN_GORUNTUSU) await page.screenshot({ path: join(process.env.PANO_EKRAN_GORUNTUSU, 'pano-izgara-1440.png'), fullPage: true });
  expect(hatalar).toEqual([]);

  // 390 px: kartlar ızgaradaki sırasına göre (y, sonra x) tek sütunda; hepsi aynı genişlikte; yatay taşma yok.
  const dar = await sayfaAc(390, 900);
  await git(dar.page, '#/sonuclar/ozet');
  const sira = [...p.duzen.kartlar].sort((a: Record<string, number>, b: Record<string, number>) => a.y - b.y || a.x - b.x).map((x: Record<string, string>) => x.id);
  expect(await kartBasliklari(dar.page)).toEqual(sira);
  const darKutular = await dar.page.locator('.ozet-panosu > .pano-ogesi:visible').evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), r.top, r.bottom]; }));
  expect(new Set(darKutular.map((k) => `${k[0]}:${k[1]}`)).size).toBe(1);
  for (let i = 1; i < darKutular.length; i++) expect(darKutular[i][2]).toBeGreaterThanOrEqual(darKutular[i - 1][3]);
  // Dar ekranda kart içerikten kısa olmaz (Kapsam kaydırmasız, tam görünür).
  expect(await dar.page.locator('.pano-ogesi[data-kart-id="kapsam"] section.farkindalik-karti').evaluate((e) => e.scrollHeight <= e.clientHeight + 2)).toBe(true);
  await tasmaYok(dar.page);
  // Dar ekranda düzenleme: sıra (↑ ↓) ile; tutamağın ↑ okları da sırayı değiştirir.
  await dar.page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  expect(sira.slice(0, 2)).toEqual(['ozetKutulari', 'kapsam']);
  await dar.page.getByRole('button', { exact: true, name: 'Taşı: Kapsam ve güvenlik' }).focus();
  await dar.page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await kartBasliklari(dar.page)).slice(0, 2)).toEqual(['kapsam', 'ozetKutulari']);
  await expect(dar.page.getByRole('button', { exact: true, name: 'Taşı: Kapsam ve güvenlik' })).toBeFocused();
  await tasmaYok(dar.page);
  await adlarUyumlu(dar.page);
  await dar.page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Vazgeç' }).click();
  expect(dar.hatalar).toEqual([]);
  await dar.kapat();
  // Varsayılana dön: ızgara varsayılana döner.
  await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
  await cubuk.getByRole('button', { name: 'Varsayılana dön' }).click();
  await cubuk.getByRole('button', { name: 'Bitti' }).click();
  const v = await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`) as Record<string, any>;
  expect(v.varsayilan).toBe(true);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('göç: eski sıralı düzen ilk açılışta ızgaraya çevrilip bir kez kaydedilir; hiçbir kart kaybolmaz', async () => {
  test.setTimeout(90_000);
  const v = await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: projeGoc });
  expect(v.basarili, v.mesaj).not.toBe(false);
  try {
    const once = await nobetciApi(nobetci, `/platform/pano?projeId=${projeGoc}`) as Record<string, any>;
    expect(once).toMatchObject({ kayitli: true, goc: true });
    expect(once.duzen.kartlar.map((k: Record<string, string>) => k.id).sort()).toEqual(ESKI_DUZEN.kartlar.map((k) => k.id).sort());
    const { page, hatalar, kapat } = await sayfaAc();
    await git(page, '#/sonuclar/ozet');
    // Göç kaydedildi: artık eski biçim değil; konumlar saf modülün çevirisiyle aynı; ekranda bütün kartlar okuma sırasıyla.
    await expect.poll(async () => (await nobetciApi(nobetci, `/platform/pano?projeId=${projeGoc}`) as Record<string, any>).goc).toBe(false);
    const sonra = await nobetciApi(nobetci, `/platform/pano?projeId=${projeGoc}`) as Record<string, any>;
    expect(sonra.kayitli).toBe(true);
    const cevrilen = duzenTemizle(ESKI_DUZEN);
    expect(sonra.duzen.kartlar.map((k: Record<string, unknown>) => [k.id, k.x, k.y, k.w, k.h])).toEqual(cevrilen.kartlar.map((k) => [k.id, k.x, k.y, k.w, k.h]));
    expect(await kartBasliklari(page)).toEqual(cevrilen.kartlar.map((k) => k.id));
    // Sıra ve genişlikler korunur: üç küçük kart yan yana (1/3), geniş not 2/3.
    expect(await Promise.all(['dikkat', 'bakim', 'kapsam', 'k-genis', 'k-not'].map((id) => konum(page, id)))).toEqual([[0, 5, 4, 8], [4, 5, 4, 8], [8, 5, 4, 8], [0, 13, 8, 5], [8, 13, 4, 5]]);
    // İkinci açılışta yeniden kaydedilmez (göç bir kez).
    const kayitlar: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/platform/pano/kaydet')) kayitlar.push(r.url()); });
    await git(page, '#/sonuclar/ozet');
    expect(kayitlar).toEqual([]);
    expect(hatalar).toEqual([]);
    await kapat();
  } finally {
    await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: projeId });
  }
});

test('390 px: düzenleme kipi, Kart ekle penceresi ve SQL kartı yatay taşmaz; 1440 px düzenleme kipinde de taşma yok', async () => {
  test.setTimeout(90_000);
  for (const [g, y] of [[390, 900], [1440, 1000]] as const) {
    const { page, hatalar, kapat } = await sayfaAc(g, y);
    await git(page, '#/sonuclar/ozet/duzenle');
    await expect(page.getByRole('region', { name: 'Pano düzenleme' })).toBeVisible();
    await tasmaYok(page);
    await adlarUyumlu(page);
    await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Kart ekle' }).click();
    const pencere = page.getByRole('dialog', { name: 'Kart ekle' });
    await pencere.getByRole('radio', { name: 'SQL sorgusu' }).check();
    await expect(pencere.getByLabel('Kart başlığı')).toBeVisible();
    // Zaman aşımı alanı: 1–120 sn, varsayılan 15; yardım metni; pencereden taşmaz.
    const zamanAsimi = pencere.getByRole('spinbutton', { name: 'Zaman aşımı (sn)' });
    await zamanAsimi.scrollIntoViewIfNeeded();
    await expect(zamanAsimi).toHaveValue('15');
    await expect(zamanAsimi).toHaveAttribute('min', '1');
    await expect(zamanAsimi).toHaveAttribute('max', '120');
    await expect(pencere).toContainText('Sorgu bu süre içinde bitmezse kart hata gösterir; yavaş sorgularda artırın.');
    const [kutu, alanKutusu] = await Promise.all([pencere.boundingBox(), zamanAsimi.boundingBox()]);
    expect(alanKutusu && kutu && alanKutusu.x >= kutu.x && alanKutusu.x + alanKutusu.width <= kutu.x + kutu.width).toBe(true);
    await tasmaYok(page);
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await page.getByRole('region', { name: 'Pano düzenleme' }).getByRole('button', { name: 'Vazgeç' }).click();
    if (g === 390) {
      // Dar ekranda her kart tam satır.
      const genislikler = await page.locator('.ozet-panosu > .pano-ogesi:visible').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().width)));
      expect(new Set(genislikler).size).toBe(1);
    }
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    await kapat();
  }
});
