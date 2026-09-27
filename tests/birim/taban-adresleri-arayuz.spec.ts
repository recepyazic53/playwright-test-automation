// KORUMA TESTLERİ — Ayarlar > Proje ve ortamlar > Servis taban adresleri arayüzü (scripts/platform/arayuz/taban-adresler.js).
// Varsayılan "adrese göre" görünüm: aynı adres kombinasyonu tek satır, farklı olan ayrı satır; "bu ortamda yok" grubu bölmez;
// grup hücresi değişince etki önizlemesi tüm servisleri gösterir ve onayla hepsine yazılır ("yok" korunur); "Gruptan ayır";
// "Servis bazında" görünüm önceki tablo (seçim hatırlanır); bul-değiştir. Masaüstü + 390px yatay taşma yok.
// Yalnız yerel Nöbetçi (127.0.0.1, geçici veri); adresler *.ornek.invalid — hiçbir servise istek atılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Satir = { servisId: string; ad: string; grup: string | null; tabanlar: Record<string, { deger: string; kaynak: string }> };

/** Sayfa yatay taşmıyor mu (kendi kaydırma kutusundaki öğeler sayılmaz). */
async function tasmaYok(page: Page): Promise<void> {
  const o = await page.evaluate(() => {
    const gorunen = document.documentElement.clientWidth;
    const ana = document.querySelector('main');
    const kaydirmaIcinde = (e: Element) => {
      for (let p = e.parentElement; p && p !== ana; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const tasanlar = [...(ana?.querySelectorAll('*') ?? [])].filter((e) => !kaydirmaIcinde(e) && e.getBoundingClientRect().right > gorunen + 0.5)
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).replace(/\s+/g, '.')}`);
    return { tasanlar, gorunen, belge: document.documentElement.scrollWidth };
  });
  expect(o.tasanlar, `görünen ${o.gorunen}px; taşan: ${o.tasanlar.join(', ')}`).toEqual([]);
  expect(o.belge).toBeLessThanOrEqual(o.gorunen);
}

test.describe('servis taban adresleri arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Taban-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let T = '';
  let C = '';
  const id: Record<string, string> = {};

  const tablo = async (): Promise<Map<string, Satir>> => {
    const y = await nobetciApi(nobetci, `/platform/servis-tabanlari?projeId=${projeId}`);
    return new Map((y.satirlar as Satir[]).map((s) => [s.ad, s]));
  };
  const sayfaAc = async (genislik = 1400): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    await expect(page.getByRole('heading', { name: /Servis taban adresleri/ })).toBeVisible();
    return { page, hatalar, kapat: () => baglam.close() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'taban-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Taban Arayüz Projesi' });
    T = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    C = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { canli: true } });
    const ortak = { [T]: 'https://api-test.ornek.invalid', [C]: 'https://api.ornek.invalid' };
    const sv = (anahtar: string, ad: string, ayarlar: Record<string, unknown>) => { id[ad] = servisKaydet(vt, { projeId, anahtar, ad, ayarlar: { yol: `/${anahtar}.asmx`, ...ayarlar } }); };
    sv('a1', 'Sipariş', { tabanlar: ortak, tabanGrubu: 'Çekirdek' });
    sv('a2', 'Fatura', { tabanlar: ortak, tabanGrubu: 'Çekirdek' });
    sv('a3', 'Hasar', { tabanlar: ortak });
    sv('a4', 'Kampanya', { tabanlar: { [T]: 'https://api-test.ornek.invalid', [C]: '' } });
    sv('o1', 'Rapor', {});
    sv('o2', 'Belge', {});
    sv('b1', 'Diğer', { tabanlar: { [T]: 'https://diger-test.ornek.invalid', [C]: 'https://api.ornek.invalid' } });
    servisSenaryosuKaydet(vt, { projeId, servisId: id['Sipariş'], baslik: 'S1', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('adrese göre (varsayılan): aynı kombinasyon tek satır, farklı olan ayrı; "yok" grubu bölmez; 390px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc();
    const t = page.getByRole('table', { name: 'Servis taban adresleri (adrese göre)' });
    await expect(t).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Adrese göre (varsayılan)' })).toHaveAttribute('aria-checked', 'true');
    await expect(t.locator('tbody > tr')).toHaveCount(3);
    // Çekirdek: aynı adresli 3 servis + CANLI'da "yok" olan Kampanya (grubu bölmez).
    await expect(page.getByRole('button', { name: 'Çekirdek — Kullanan: 4 servis' })).toBeVisible();
    await expect(page.getByLabel('Çekirdek · CANLI: taban adres')).toHaveValue('https://api.ornek.invalid');
    await expect(page.getByLabel('Çekirdek · TEST: taban adres')).toHaveValue('https://api-test.ornek.invalid');
    await expect(t.locator('tbody > tr').first()).toContainText('1 serviste yok');
    await expect(page.getByRole('button', { name: 'Ortamın adresi — Kullanan: 2 servis' })).toBeVisible();
    // CANLI aynı, TEST farklı: ayrı satır.
    await expect(t.locator('tbody > tr').filter({ hasText: 'diger-test.ornek.invalid' })).toContainText('Kullanan: 1 servis');
    // Üye listesi: ad, tür, yol, senaryo sayısı; "yok" notu.
    await page.getByRole('button', { name: 'Çekirdek — Kullanan: 4 servis' }).click();
    const uyeler = page.getByRole('list', { name: 'Çekirdek: servisler' });
    await expect(uyeler.getByRole('listitem')).toHaveCount(4);
    await expect(uyeler.getByRole('listitem').filter({ hasText: 'Sipariş' })).toContainText('/a1.asmx · 1 senaryo');
    await expect(uyeler.getByRole('listitem').filter({ hasText: 'Kampanya' })).toContainText('CANLI ortamında yok');
    await page.screenshot({ path: testInfo.outputPath('taban-gruplu-masaustu.png'), fullPage: true });
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(t).toBeVisible();
    await tasmaYok(page);
    await page.screenshot({ path: testInfo.outputPath('taban-gruplu-390.png'), fullPage: true });
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('grup hücresi: etki tüm servisleri gösterir, onayla hepsine yazılır; "yok" korunur', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    await page.getByLabel('Çekirdek · CANLI: taban adres').fill('https://api2.ornek.invalid');
    await page.getByLabel('Çekirdek · CANLI: taban adres').press('Tab');
    await page.getByLabel('Çekirdek · TEST: taban adres').fill('https://api2-test.ornek.invalid');
    await page.getByLabel('Çekirdek · TEST: taban adres').press('Tab');
    await expect(page.getByText('4 serviste kaydedilmemiş değişiklik var.')).toBeVisible();
    await page.getByRole('button', { name: 'Etkiyi göster' }).click();
    const etki = page.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki).toContainText('Bu değişiklik 4 servisin 1 senaryosunu');
    for (const ad of ['Sipariş', 'Fatura', 'Hasar', 'Kampanya']) await expect(etki.locator('.onay-listesi > li').filter({ hasText: ad })).toHaveCount(1);
    await expect(etki.locator('.onay-listesi > li').filter({ hasText: 'Kampanya' })).not.toContainText('CANLI:');
    await etki.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(page.getByRole('button', { name: 'Çekirdek — Kullanan: 4 servis' })).toBeVisible();
    const s = await tablo();
    for (const ad of ['Sipariş', 'Fatura', 'Hasar']) {
      expect(s.get(ad)?.tabanlar[C]).toEqual({ deger: 'https://api2.ornek.invalid', kaynak: 'servis' });
      expect(s.get(ad)?.tabanlar[T]).toEqual({ deger: 'https://api2-test.ornek.invalid', kaynak: 'servis' });
    }
    expect(s.get('Kampanya')?.tabanlar[C]).toEqual({ deger: '', kaynak: 'yok' });
    expect(s.get('Kampanya')?.tabanlar[T]).toEqual({ deger: 'https://api2-test.ornek.invalid', kaynak: 'servis' });
    // Farklı TEST adresli servis ayrı satırdaydı: değişmedi.
    expect(s.get('Diğer')?.tabanlar[C]).toEqual({ deger: 'https://api.ornek.invalid', kaynak: 'servis' });
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('gruptan ayır: servis kendi özel adresine geçer, ayrı satır olur; kaydedilince ayrı kalır', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    await page.getByRole('button', { name: 'Ortamın adresi — Kullanan: 2 servis' }).click();
    await page.getByRole('button', { name: 'Belge: gruptan ayır' }).click();
    await expect(page.getByRole('button', { name: 'Ortamın adresi — Kullanan: 1 servis' })).toBeVisible();
    const t = page.getByRole('table', { name: 'Servis taban adresleri (adrese göre)' });
    const ayrik = t.locator('tbody > tr.taban-ayrik');
    await expect(ayrik).toHaveCount(1);
    await expect(ayrik).toContainText('ayrıldı');
    await expect(ayrik.locator('select').first()).toHaveValue('servis');
    await page.getByRole('button', { name: 'Etkiyi göster' }).click();
    const etki = page.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki).toContainText('Bu değişiklik 1 servisin');
    await expect(etki).toContainText('Belge');
    await expect(etki).toContainText('https://test.ornek.invalid (ortamın adresi) → https://test.ornek.invalid');
    await etki.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(page.getByRole('button', { name: 'Ortamın adresi — Kullanan: 1 servis' })).toBeVisible();
    const s = await tablo();
    expect(s.get('Belge')?.tabanlar[T]).toEqual({ deger: 'https://test.ornek.invalid', kaynak: 'servis' });
    expect(s.get('Belge')?.tabanlar[C]).toEqual({ deger: 'https://canli.ornek.invalid', kaynak: 'servis' });
    expect(s.get('Rapor')?.tabanlar[T]?.kaynak).toBe('ortam');
    // Yeniden yüklendikten sonra da ayrı satır (özel adres ≠ ortamın adresi).
    await expect(t.locator('tbody > tr')).toHaveCount(4);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('servis bazında görünüm önceki tablo (seçim hatırlanır); bul-değiştir iki görünümde; 390px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc();
    // Adrese göre görünümde bul-değiştir: satırdaki "yok" hücresi değişmez.
    await page.getByText('Toplu düzenle (seçili satırlar; seçim yoksa tümü)').click();
    await page.getByLabel('Bul', { exact: true }).fill('api2-test');
    await page.getByLabel('Yerine', { exact: true }).fill('api3-test');
    await page.getByRole('button', { name: 'Değiştir' }).click();
    await expect(page.getByLabel('Çekirdek · TEST: taban adres')).toHaveValue('https://api3-test.ornek.invalid');
    await expect(page.getByText('4 serviste kaydedilmemiş değişiklik var.')).toBeVisible();
    // Servis bazında: satır = servis; taslak korunur.
    await page.getByRole('radio', { name: 'Servis bazında' }).click();
    const t = page.getByRole('table', { name: 'Servis taban adresleri', exact: true });
    await expect(t.locator('tbody > tr')).toHaveCount(7);
    await expect(page.getByLabel('Kampanya · TEST: taban adres')).toHaveValue('https://api3-test.ornek.invalid');
    await expect(page.getByLabel('Kampanya · CANLI: adres türü')).toHaveValue('yok');
    await expect(page.getByLabel('Sipariş: taban adres adı')).toHaveValue('Çekirdek');
    // Servis bazında bul-değiştir.
    await page.getByLabel('Bul', { exact: true }).fill('diger-test');
    await page.getByLabel('Yerine', { exact: true }).fill('diger2-test');
    await page.getByRole('button', { name: 'Değiştir' }).click();
    await expect(page.getByLabel('Diğer · TEST: taban adres')).toHaveValue('https://diger2-test.ornek.invalid');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.screenshot({ path: testInfo.outputPath('taban-servis-bazinda-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'Değişiklikleri geri al' }).click();
    // Seçim hatırlanır (yalnız görünüm).
    await page.reload();
    await expect(page.getByRole('table', { name: 'Servis taban adresleri', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Servis bazında' })).toHaveAttribute('aria-checked', 'true');
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
