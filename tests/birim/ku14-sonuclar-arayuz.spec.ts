// UÇTAN UCA (yerel) — v1.4 Sonuçlar kullanılabilirlik düzeltmeleri. Geçici veritabanına yalnız EKRAN kapsamlı iki sahte tam koşu
// yazılır (gerçek Playwright koşusu ya da dış istek YOK), ayrı bir Nöbetçi (127.0.0.1) başlatılır. Denetlenenler:
//  1. Koşu trendi: Genel kapsamlı koşu yokken "Genel kapsamlı koşu yok — ekran koşuları: 2" + "Göster" ekran koşularını çizer.
//  2. Koşu geçmişi: tüm satır tıklanır ve klavyeyle (Enter) açılır; saat BAŞLANGIÇ saatidir ve karşılaştırmadakiyle aynıdır.
//  3. Özet: %83 başarı sarı (uyarı eşiği ≥ %75) — kırmızı değil; "Tümü" seçiliyken dönem metni "son 30 gün (…)" der.
//  7. Kapsam matrisi: "Talep no" alanının yeri doğru anlatılır (başlığın altında).
//  8. Koşu onayı: 0 senaryoda "Başlat" kapalı ve nedeni yazılı ("0 senaryoyu başlat" yok).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Ku14-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
/** Koşular (en eski önce): başlangıç ve bitiş (bitiş başlangıçtan 7 dk sonra; dakika farklı olsun). */
const KOSULAR: Array<{ id: string; baslangic: Date; bitis: Date }> = [];

const iki = (n: number) => String(n).padStart(2, '0');
/** Arayüzdeki kısa tarih ("24.09.2026 17:12"; yerel saat — tarayıcı ve test aynı makinede). */
const kisaTarih = (d: Date) => `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ku14-sonuclar-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://ornek.invalid/', varsayilan: true, ayarlar: { riskli: false } });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'basvuru', ad: 'Başvuru' });
  const senaryolar = ['Kayıt', 'Onay', 'Liste', 'Arama', 'Filtre', 'Detay'].map((ad) => ({ ad, id: senaryoKaydet(vt, { projeId, ekranId, baslik: ad, icerik: {} }) }));
  // İki EKRAN kapsamlı tam koşu (kapsam: ekran adı): 5 başarılı + 1 başarısız → %83. Göreli zaman: "Tümü"nün son 30 günü içinde.
  const simdi = Date.now();
  for (const [i, saatOnce] of [26, 3].entries()) {
    const baslangic = new Date(simdi - saatOnce * 3_600_000);
    baslangic.setSeconds(10, 0);
    const bitis = new Date(baslangic.getTime() + 7 * 60_000);
    const id = `ku14k${i + 1}`;
    kosuKaydet(vt, { id, projeId, ortamId, tur: 'tam', kapsam: 'Başvuru', baslangic: baslangic.toISOString() });
    senaryolar.forEach((s, j) => sonucKaydet(vt, {
      kosuId: id, projeId, senaryoId: s.id, senaryoBaslik: s.ad, durum: j === 2 ? 'basarisiz' : 'basarili', testKimligi: `${s.ad}-${id}`,
      bitis: new Date(baslangic.getTime() + (j + 1) * 20_000).toISOString(), sureMs: 1000, ...(j === 2 ? { hataMesaji: 'Beklenen metin görünmedi.' } : {})
    }));
    kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: bitis.toISOString() });
    KOSULAR.push({ id, baslangic, bitis });
  }
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
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

async function sayfaAc(): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
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

test('1. Koşu trendi: Genel kapsamlı koşu yokken ekran koşuları sayılır; "Göster" onları çizer', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ekranlar');
  const trend = page.getByRole('region', { name: 'Koşu trendi' });
  await expect(trend).toContainText('Genel kapsamlı koşu yok — ekran koşuları: 2');
  await expect(trend).not.toContainText('Henüz tam koşu yok');
  await trend.getByRole('button', { name: 'Göster' }).click();
  const yeni = page.getByRole('region', { name: 'Koşu trendi' });
  await expect(yeni).toContainText('Ekran kapsamlı tam koşular');
  await expect(yeni.locator('svg.trend-grafigi .cubuk-grubu')).toHaveCount(2);
  expect(hatalar).toEqual([]);
  await kapat();
});

test('2. Koşu geçmişi: tüm satır tıklanır, klavyeyle açılır; saat başlangıçtır ve karşılaştırmadakiyle aynı', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ekranlar');
  const gecmis = page.getByRole('region', { name: 'Koşu geçmişi' });
  const satirlar = gecmis.locator('tbody tr');
  await expect(satirlar).toHaveCount(2);
  const [eski, yeni] = KOSULAR;
  // En yeni önce; saat başlangıç saati (bitiş değil).
  await expect(satirlar.nth(0)).toContainText(kisaTarih(yeni.baslangic));
  await expect(satirlar.nth(0)).not.toContainText(kisaTarih(yeni.bitis));
  await expect(satirlar.nth(1)).toContainText(kisaTarih(eski.baslangic));
  // Satırın bağlantı olmayan bir hücresine tıklamak koşuyu açar.
  await satirlar.nth(0).locator('td.oran').click();
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/kosu/${yeni.id}$`));
  // Klavye: satıra odaklanıp Enter.
  await git(page, '#/sonuclar/ekranlar');
  const ikinci = page.getByRole('region', { name: 'Koşu geçmişi' }).locator('tbody tr').nth(1);
  await ikinci.focus();
  await expect(ikinci).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/sonuclar/kosu/${eski.id}$`));
  // Karşılaştırma kutusuna tıklamak satırı açmaz; karşılaştırmada aynı (başlangıç) saatleri görünür.
  await git(page, '#/sonuclar/ekranlar');
  const g2 = page.getByRole('region', { name: 'Koşu geçmişi' });
  const kutular = g2.getByRole('checkbox', { name: /Karşılaştırmak için seç/ });
  await kutular.nth(0).check();
  await kutular.nth(1).check();
  await expect(page).toHaveURL(/#\/sonuclar\/ekranlar$/);
  await g2.getByRole('button', { name: /Karşılaştır/ }).click();
  await expect(page.getByRole('heading', { name: 'Koşu karşılaştırması' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Koşu A özeti' })).toContainText(kisaTarih(eski.baslangic));
  await expect(page.getByRole('region', { name: 'Koşu B özeti' })).toContainText(kisaTarih(yeni.baslangic));
  expect(hatalar).toEqual([]);
  await kapat();
});

test('3. Özet: %83 sarı (uyarı eşiği ≥ %75), kırmızı değil; "Tümü"de dönem metni çelişkisiz', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  await expect(page.locator('.farkindalik-karti [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
  const ekranKutusu = page.locator('.ozet-kutulari a.ozet-kutusu').filter({ hasText: 'Ekranlar' });
  await expect(ekranKutusu).toContainText('%83');
  await expect(ekranKutusu).toHaveClass(/\buyari\b/);
  await expect(ekranKutusu).not.toHaveClass(/\bbasarisiz\b/);
  // Soldaki sağlık noktası açıklamasıyla aynı eşik: sol listedeki "Başvuru" noktası da sarı.
  await expect(page.locator('.alt-nav a').filter({ hasText: 'Başvuru' }).locator('.saglik')).toHaveClass(/\buyari\b/);
  const meta = page.locator('.sayfa-basligi .meta');
  await expect(meta).toContainText('son 30 gün (');
  await expect(meta).not.toContainText('Tümü seçiliyken');
  await expect(page.locator('.ozet-donem-notu')).toBeVisible();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('7. Kapsam matrisi: "Talep no" alanının yeri başlığın altı olarak anlatılır', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar/kapsam');
  await expect(page.locator('main')).toContainText('başlığın altındaki "Talep no" alanına girilir');
  await expect(page.locator('main')).not.toContainText('başlığın yanında');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('8. Koşu onayı: 0 senaryoda "Başlat" kapalı ve nedeni yazılı; senaryo varken "N senaryoyu başlat"', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/ozet');
  await page.evaluate(() => {
    void import('/arayuz/kosu-paneli.js' as string).then((m) => {
      (window as unknown as { __onay: Promise<unknown> }).__onay = m.kosuOnayi({
        baslik: 'Koşu', tur: 'tam',
        ortamlar: [{ id: 'o1', ad: 'TEST', varsayilan: true, ayarlar: { riskli: false } }, { id: 'o2', ad: 'YEDEK', ayarlar: { riskli: false } }],
        hesapla: (o: { id: string }) => (o.id === 'o1' ? { senaryolar: [], haricSayisi: 2 } : { senaryolar: [{ baslik: 'Örnek senaryo' }] })
      });
    });
  });
  const d = page.getByRole('dialog', { name: 'Koşu' });
  await expect(d).toBeVisible();
  await expect(d.getByRole('button', { name: /0 senaryoyu başlat/ })).toHaveCount(0);
  const baslat = d.getByRole('button', { name: 'Başlat', exact: true });
  await expect(baslat).toBeDisabled();
  const neden = d.locator('.kosu-bos-nedeni');
  await expect(neden).toContainText('Başlatılamaz');
  await expect(neden).toContainText('2 senaryo toplu koşuya dahil değil');
  await expect(baslat).toHaveAttribute('aria-describedby', (await neden.getAttribute('id')) ?? '');
  // Başka ortam seçilince senaryo gelir: düğme açılır, neden kaybolur.
  await d.getByLabel('Ortam').selectOption('o2');
  await expect(d.getByRole('button', { name: '1 senaryoyu başlat' })).toBeEnabled();
  await expect(d.locator('.kosu-bos-nedeni')).toHaveCount(0);
  await d.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(d).toBeHidden();
  expect(hatalar).toEqual([]);
  await kapat();
});
