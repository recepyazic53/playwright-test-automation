// UÇTAN UCA (yerel) — Sonuçlar > Genel > Özet panosu arayüzü (ozet-panosu.js). Geçici veritabanı + ayrı Nöbetçi (127.0.0.1); SQL
// kartlarının bağlantısı bellek içi SAHTE veritabanıdır (TEST_SUNUCU_SAHTE_SQL_SURUCUSU = sahte-sql-surucusu.mjs; hiçbir adrese
// bağlanılmaz). Denetlenenler: varsayılan pano bugünkü Özet; düzenleme kipi (kaldır, Kart ekle'den geri ekle, klavyeyle ve
// sürükle-bırakla taşı, boyutlandır, Vazgeç, Bitti → proje başına kayıt, Varsayılana dön); SQL kartı (yalnız okuma uyarısı, yalnız
// "Yenile"de çalışır — sayfa açılınca sorgu YOK (sürücü günlüğü + ağ sayacı), "Son veri" saati, yükleniyor durumu, eşik rengi, tablo
// maskelemesi, CANLI ortamda ilk Yenile'de onay); Nöbetçi verisi ve metin kartı; hızlı arama ve rehber; 1440 / 390 px yatay taşma yok;
// erişilebilir adlar. İsteğe bağlı: PANO_EKRAN_GORUNTUSU=<klasör> verilirse 1440 px görüntüler (düzenleme kipi, SQL kartı) alınır.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
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

test('varsayılan pano bugünkü Özet; düzenle: kaldır, geri ekle, taşı (klavye + sürükle), boyutlandır, Vazgeç, Bitti, Varsayılana dön', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  // Varsayılan: Başlarken, özet kutuları, üç kart (bugünkü sıra); düzenleme araçları yok.
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  expect(await page.locator('section.farkindalik-karti h3').allTextContents()).toEqual(['Dikkat', 'Bakım', 'Kapsam ve güvenlik']);
  await expect(page.locator('.ozet-kutulari a.ozet-kutusu')).toHaveCount(3);
  await expect(page.locator('.pano-arac-cubugu')).toHaveCount(0);
  const duzenle = page.getByRole('button', { name: 'Panoyu düzenle' });
  await duzenle.click();
  const cubuk = page.getByRole('region', { name: 'Pano düzenleme' });
  await expect(cubuk).toBeVisible();
  await expect(duzenle).toBeHidden();
  await expect(page.locator('.pano-arac-cubugu')).toHaveCount(5);
  // Kaldır → Kart ekle'den geri ekle (sona).
  await page.getByRole('button', { name: 'Kaldır: Bakım' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam']);
  await cubuk.getByRole('button', { name: 'Kart ekle' }).click();
  const pencere = page.getByRole('dialog', { name: 'Kart ekle' });
  await expect(pencere.getByRole('radio', { name: 'Yerleşik kartlar' })).toBeChecked();
  await expect(pencere.locator('.pano-yerlesik-listesi li strong')).toHaveText(['Bakım', 'Koşu trendi']);
  await pencere.getByRole('button', { name: 'Ekle: Bakım' }).click();
  await expect(pencere).toBeHidden();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam', 'bakim']);
  // Klavye: tutamak odaktayken ↑.
  await expect(page.getByRole('button', { exact: true, name: 'Taşı: Bakım' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  await expect(page.getByRole('button', { exact: true, name: 'Taşı: Bakım' })).toBeFocused();
  await page.getByRole('button', { name: 'Yukarı taşı: Bakım' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'bakim', 'dikkat', 'kapsam']);
  await expect(page.getByRole('button', { name: 'Yukarı taşı: Başlarken' })).toBeDisabled();
  // Sürükle-bırak: Kapsam'ı tutamaktan Özet kutularının üstüne.
  await page.getByRole('button', { exact: true, name: 'Taşı: Kapsam ve güvenlik' }).dragTo(page.locator('.pano-ogesi[data-kart-id="ozetKutulari"]'));
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'kapsam', 'ozetKutulari', 'bakim', 'dikkat']);
  // Boyut.
  await page.getByRole('combobox', { name: 'Boyut: Dikkat' }).selectOption('genis');
  await expect(page.locator('.pano-ogesi[data-kart-id="dikkat"]')).toHaveClass(/boyut-genis/);
  const genislik = await page.locator('.pano-ogesi[data-kart-id="dikkat"]').evaluate((e) => e.getBoundingClientRect().width);
  const tam = await page.locator('.ozet-panosu').evaluate((e) => e.getBoundingClientRect().width);
  expect(genislik / tam).toBeGreaterThan(0.6);
  expect(genislik / tam).toBeLessThan(0.7);
  await adlarUyumlu(page);
  // Vazgeç: kayıtlı (varsayılan) düzene döner; hiçbir şey kaydedilmez.
  await cubuk.getByRole('button', { name: 'Vazgeç' }).click();
  expect(await kartBasliklari(page)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
  expect((await nobetciApi(nobetci, `/platform/pano?projeId=${projeId}`)).kayitli).toBe(false);
  // Bitti: kaydedilir; sayfa yenilenince düzen korunur.
  await duzenle.click();
  await page.getByRole('button', { name: 'Kaldır: Bakım' }).click();
  await page.getByRole('combobox', { name: 'Boyut: Dikkat' }).selectOption('orta');
  await page.getByRole('button', { name: 'Aşağı taşı: Başlarken' }).click();
  await cubuk.getByRole('button', { name: 'Bitti' }).click();
  await expect(cubuk).toBeHidden();
  await expect(page.locator('.bildirim').filter({ hasText: 'Pano kaydedildi.' })).toBeVisible();
  await git(page, '#/sonuclar/ozet');
  expect(await kartBasliklari(page)).toEqual(['ozetKutulari', 'baslarken', 'dikkat', 'kapsam']);
  await expect(page.locator('.pano-ogesi[data-kart-id="dikkat"]')).toHaveClass(/boyut-orta/);
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
  await expect(tabloKarti.getByRole('status')).toContainText('Sorgu çalışıyor…');
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
