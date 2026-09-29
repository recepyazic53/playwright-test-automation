// UÇTAN UCA (yerel) — Sonuçlar > Genel > Özet sekmesi (sonuc-ozeti.js + GET /platform/sonuclar/farkindalik). Geçici veritabanına
// PDF rapor A4 fikstürü (iki dönemlik sahte ekran / servis / akış koşuları, kritik işaretleri) ve türü seçilmemiş altı ortam yazılır
// (biri adında bilinen gizli değer taşır); gerçek koşu ya da dış istek YOK (planlı koşu kuralı sunucu başlamadan kapatılır), ayrı bir
// Nöbetçi (127.0.0.1) başlatılır. Denetlenenler: "Genel" Özet'i açar ve sekme sırası; özet kutuları ve tıklayınca sekme; kartlar,
// "Tümü (N)" ile açılma, maddeye tıklayınca ilgili ekran; maskeli ad; boş projede "Sorun yok"; ekran / ürün sayfasında ve Ekranlar
// sekmesinde kart yok (eski #/sonuclar adresi Ekranlar'ı açar); 390 px'te yatay taşma yok; Özet rehberi bölümleri ekrandaki sırayla
// anlatır. İsteğe bağlı: OZET_EKRAN_GORUNTUSU=<dosya.png> verilirse 1440 px tam sayfa görüntüsü alınır.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kuralEtkinlestir } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { GIZLI_PAROLA, KUPON_GIZLISI, a4VeriKur, cokluVeriKur, genelVeriKur, raporVerisiKur, type A4Fikstur } from './pdf-rapor-fikstur';

const PAROLA = `Gecici-Ozet-${randomBytes(6).toString('hex')}`;
/** Fikstür 15.09–28.09.2026 dönemindedir: Sonuçlar'ın tarih aralığı (oturumda) bu günlere ayarlanır. */
const ARALIK = { baslangic: new Date(2026, 8, 15).toISOString(), bitis: new Date(2026, 8, 28, 23, 59).toISOString() };
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: A4Fikstur;
let bosProjeId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'sonuc-ozeti-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = a4VeriKur(vt, genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt))), { surumler: false });
  kuralEtkinlestir(vt, f.projeId, f.kuralId, false);
  // Türü seçilmemiş altı ortam (Kapsam ve güvenlik kartı 5'ten çok madde); biri adında bilinen gizli değer (giriş parolası) taşır.
  for (let i = 1; i <= 5; i++) ortamKaydet(vt, { projeId: f.projeId, ad: `ESKI-${i}`, tabanUrl: `https://eski-${i}.ornek.invalid/`, ayarlar: {} });
  ortamKaydet(vt, { projeId: f.projeId, ad: `ESKI ${GIZLI_PAROLA}`, tabanUrl: 'https://eski-gizli.ornek.invalid/', ayarlar: {} });
  bosProjeId = projeKaydet(vt, { ad: 'Boş proje' });
  vt.kapat();
  // Yakın tarihli yedek (yedek yaşı maddesi çıkmasın).
  mkdirSync(join(klasor, 'yedekler'), { recursive: true });
  writeFileSync(join(klasor, 'yedekler', 'otomatik-20260929-000000-000.tayedek'), 'sahte');
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
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, reducedMotion: 'reduce' });
  // Korumalı (sandbox) çerçevelerde sessionStorage yoktur: yalnız ana sayfada yazılır.
  await baglam.addInitScript((a) => { try { sessionStorage.setItem('platform.sonucAraligi', JSON.stringify(a)); } catch { /* korumalı çerçeve */ } }, ARALIK);
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
  return { page, hatalar, kapat: () => baglam.close() };
}

async function git(page: Page, adres: string): Promise<void> {
  await page.goto(`/${adres}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main .iskelet, main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
}

const kart = (page: Page, ad: string) => page.locator('section.farkindalik-karti').filter({ has: page.getByRole('heading', { name: ad, exact: true }) });

test('"Genel" Özet\'i açar: sekme sırası, özet kutuları (tıklayınca sekme), üç kart; Rapor al (PDF) genel kapsamla açılır', async () => {
  test.setTimeout(90_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar');
  // Eski adres Ekranlar görünümüdür (kart yok); sol paneldeki "Genel" Özet'e gider.
  await expect(page.getByRole('tab', { name: 'Ekranlar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.farkindalik-karti')).toHaveCount(0);
  await page.locator('.alt-nav').getByRole('link', { name: /^Genel/ }).click();
  await expect(page).toHaveURL(/#\/sonuclar\/ozet$/);
  await expect(page.locator('.farkindalik-karti [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Özet' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('.sonuc-sekmeleri [role="tab"]').allTextContents()).toEqual(['Özet', 'Ekranlar', 'Servisler', 'Uçtan uca akışlar', 'Raporlar']);
  await expect(page.locator('.sayfa-basligi .meta')).toContainText('15.09.2026 – 28.09.2026 · önceki 01.09.2026 – 14.09.2026');
  // Özet kutuları: dönem başarı oranları ve sayılar (genel raporla aynı hesap).
  const kutular = page.locator('.ozet-kutulari a.ozet-kutusu');
  await expect(kutular).toHaveCount(3);
  await expect(kutular.nth(0)).toContainText('Ekranlar');
  await expect(kutular.nth(0)).toContainText('%72');
  await expect(kutular.nth(0)).toContainText('120 test · 20 başarısız');
  await expect(kutular.nth(1)).toContainText('%94');
  await expect(kutular.nth(1)).toContainText('87 çağrı · 5 başarısız');
  await expect(kutular.nth(2)).toContainText('%100');
  await expect(kutular.nth(2)).toContainText('▲ 100 puan');
  await expect(kutular.nth(0)).toHaveAttribute('href', '#/sonuclar/ekranlar');
  // Kartlar: ekrandaki sıra Dikkat, Bakım, Kapsam ve güvenlik.
  expect(await page.locator('section.farkindalik-karti h3').allTextContents()).toEqual(['Dikkat', 'Bakım', 'Kapsam ve güvenlik']);
  await expect(kart(page, 'Dikkat')).toContainText('Kayıt akışı');
  await expect(kart(page, 'Dikkat')).toContainText('kritik · son koşusunda başarısız oldu');
  await expect(kart(page, 'Dikkat')).toContainText('Kayıt Servisi › POST /kayit');
  // Rapor al (PDF): genel kapsam seçili gelir.
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).click();
  const diyalog = page.getByRole('dialog');
  await expect(diyalog.getByRole('radio', { name: /^Genel/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(diyalog).toHaveCount(0);
  // Kutuya tıklayınca ilgili sekme.
  await kutular.nth(1).click();
  await expect(page).toHaveURL(/#\/sonuclar\/servisler$/);
  await expect(page.getByRole('tab', { name: 'Servisler' })).toHaveAttribute('aria-selected', 'true');
  // Ekranlar sekmesinin yeni adresi eski görünümü açar.
  await page.getByRole('tab', { name: 'Ekranlar' }).click();
  await expect(page).toHaveURL(/#\/sonuclar\/ekranlar$/);
  await expect(page.getByRole('heading', { name: 'Koşu geçmişi' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.farkindalik-karti')).toHaveCount(0);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('kart: en çok 5 madde, "Tümü (N)" hepsini açar, maddeye tıklayınca ilgili ekran; gizli değer geçen ad maskeli', async () => {
  test.setTimeout(90_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  const kapsam = kart(page, 'Kapsam ve güvenlik');
  const maddeler = kapsam.locator('.farkindalik-listesi a');
  await expect(maddeler).toHaveCount(5);
  const tumu = kapsam.getByRole('button', { name: /^Tümü \(\d+\)$/ });
  const n = Number((await tumu.textContent())?.match(/\((\d+)\)/)?.[1]);
  expect(n).toBeGreaterThanOrEqual(7);
  await expect(tumu).toHaveAttribute('aria-expanded', 'false');
  await tumu.click();
  await expect(maddeler).toHaveCount(n);
  await expect(kapsam.getByRole('button', { name: 'Daha az göster' })).toHaveAttribute('aria-expanded', 'true');
  await expect(kapsam).toContainText('ESKI •••');
  await expect(kapsam).toContainText('Arşiv Servisi');
  expect(await page.locator('main').innerText()).not.toContain(GIZLI_PAROLA);
  expect(await page.locator('main').innerText()).not.toContain(KUPON_GIZLISI);
  await kapsam.getByRole('button', { name: 'Daha az göster' }).click();
  await expect(maddeler).toHaveCount(5);
  // Maddeye tıklayınca ilgili ekran: türü seçilmemiş ortam → Ayarlar > Proje ve ortamlar.
  await kapsam.getByRole('link', { name: /ESKI-1/ }).click();
  await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
  await git(page, '#/sonuclar/ozet');
  // Dikkat maddesi → servisin sonuç görünümü.
  await kart(page, 'Dikkat').getByRole('link', { name: /Kayıt Servisi › POST \/kayit/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/s/${f.servisId}$`));
  expect(hatalar).toEqual([]);
  await kapat();
});

test('ekran / ürün sayfasında Özet kartları ve kutuları yok; 390 px\'te Özet yatay taşmaz', async () => {
  test.setTimeout(90_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, `#/sonuclar/u/${encodeURIComponent(f.ekranId)}`);
  await expect(page.getByRole('heading', { level: 2, name: /Başvuru/ })).toBeVisible();
  await expect(page.locator('.farkindalik-karti, .ozet-kutulari, .sonuc-sekmeleri')).toHaveCount(0);
  await git(page, `#/sonuclar/s/${encodeURIComponent(f.servisId)}`);
  await expect(page.locator('.farkindalik-karti, .ozet-kutulari')).toHaveCount(0);
  await kapat();
  const dar = await sayfaAc(390, 900);
  await git(dar.page, '#/sonuclar/ozet');
  await expect(dar.page.locator('section.farkindalik-karti')).toHaveCount(3);
  // Uzun liste açıkken de taşmasın (Kapsam ve güvenlik kartında 5'ten çok madde var).
  await kart(dar.page, 'Kapsam ve güvenlik').getByRole('button', { name: /^Tümü/ }).click();
  const tasma = await dar.page.evaluate(() => {
    const sorunlar: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth) sorunlar.push(`sayfa ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    for (const el of Array.from(document.querySelectorAll('.ozet-kutusu, .farkindalik-karti, .farkindalik-maddesi, .sonuc-araligi, .sayfa-basligi'))) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1) sorunlar.push(`${el.className}: ${Math.round(r.left)}–${Math.round(r.right)}`);
    }
    return sorunlar;
  });
  expect(tasma).toEqual([]);
  expect([...hatalar, ...dar.hatalar]).toEqual([]);
  await dar.kapat();
});

test('Özet rehberi bölümleri ekrandaki sırayla anlatır ve vurgular; Sonuçlar rehberi sekme sırasında Özet\'i anlatır', async () => {
  test.setTimeout(90_000);
  const { page, kapat } = await sayfaAc(1440, 1000);
  await git(page, '#/sonuclar/ozet');
  const bolumler: Array<[string, string]> = [
    ['Ekran / servis seçimi', '.alt-nav'], ['Sağlık noktası', '.yan-panel .yan-not'], ['Başlık ve "Rapor al (PDF)"', '.sonuc-icerik > .sayfa-basligi'],
    ['Rapor sekmeleri', '.sonuc-sekmeleri'], ['Tarih aralığı', '.sonuc-araligi'], ['Özet kutuları', '.ozet-kutulari'],
    ['Dikkat', '.farkindalik-karti.dikkat'], ['Bakım', '.farkindalik-karti.bakim'], ['Kapsam ve güvenlik', '.farkindalik-karti.kapsam']
  ];
  // Ekrandaki sıra: her bölüm bir öncekinden sonra gelir (sol panel içeriğin önünde).
  const sira = await page.evaluate((l) => l.map((s) => document.querySelector(s)).every((el, i, d) => !!el && (i === 0 || !!(d[i - 1]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))),
    bolumler.map(([, s]) => s));
  expect(sira).toBe(true);
  await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
  const rehber = page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
  await expect(rehber).toBeVisible();
  await expect(rehber.getByRole('heading', { name: 'Özet sekmesi', exact: true })).toBeVisible();
  for (const [i, [baslik, secici]] of bolumler.entries()) {
    await rehber.getByRole('button', { name: `Adım ${i + 2}: ${baslik}`, exact: true }).click();
    await expect(rehber.getByRole('heading', { name: baslik, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((s) => {
      const v = document.querySelector('.rehber-vurgu') as HTMLElement | null;
      const t = document.querySelector(s);
      if (!v || v.hidden || !t) return false;
      const a = v.getBoundingClientRect(); const b = t.getBoundingClientRect();
      return Math.abs(a.left + 6 - b.left) < 3 && Math.abs(a.top + 6 - b.top) < 3 && Math.abs(a.width - 12 - b.width) < 3;
    }, secici), `${baslik}: vurgu bölümün üzerinde`).toBe(true);
  }
  await page.keyboard.press('Escape');
  // Ekranlar sekmesinin rehberi: sekme sırası Özet ile başlar.
  await git(page, '#/sonuclar/ekranlar');
  await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
  await rehber.getByRole('button', { name: 'Adım 4: Rapor sekmeleri', exact: true }).click();
  await expect(rehber).toContainText('Özet (varsayılan');
  await page.keyboard.press('Escape');
  await kapat();
});

test('boş proje: üç kart da "Sorun yok", özet kutularında "Bu dönemde koşu yok"; isteğe bağlı 1440 px görüntü', async () => {
  test.setTimeout(90_000);
  // İsteğe bağlı görsel: dolu projenin Özet'i (1440 px, tam sayfa).
  if (process.env.OZET_EKRAN_GORUNTUSU) {
    const g = await sayfaAc(1440, 1000);
    await git(g.page, '#/sonuclar/ozet');
    mkdirSync(dirname(process.env.OZET_EKRAN_GORUNTUSU), { recursive: true });
    await g.page.screenshot({ path: process.env.OZET_EKRAN_GORUNTUSU, fullPage: true });
    await g.kapat();
  }
  const s = await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: bosProjeId });
  expect(s.basarili, s.mesaj).not.toBe(false);
  try {
    const { page, hatalar, kapat } = await sayfaAc();
    await git(page, '#/sonuclar/ozet');
    for (const ad of ['Dikkat', 'Bakım', 'Kapsam ve güvenlik']) {
      await expect(kart(page, ad).locator('.farkindalik-temiz')).toHaveText('Sorun yok.');
      await expect(kart(page, ad).locator('.farkindalik-listesi')).toHaveCount(0);
    }
    await expect(page.locator('.ozet-kutulari a.ozet-kutusu')).toHaveCount(3);
    await expect(page.locator('.ozet-kutulari')).toContainText('Bu dönemde koşu yok');
    expect(hatalar).toEqual([]);
    await kapat();
  } finally {
    await nobetciApi(nobetci, '/platform/proje/varsayilan', { id: f.projeId });
  }
});
