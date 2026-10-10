// UÇTAN UCA (yerel) — PDF RAPORU A4 arayüzü: raporlar için yeni veriler. Geçici veritabanına genel rapor fikstürü yazılır (gerçek
// koşu, dış istek YOK; planlı koşu kuralı sunucu başlamadan devre dışı), ayrı bir Nöbetçi (127.0.0.1) başlatılır. Denetlenenler:
// Ayarlar > Raporlar (ekip ekle / yeniden adlandır / sil, kritik anahtarı, ekip seçimi, süre eşiği, servis metot eşikleri — her
// değişiklik kasaya yazılır ve rapora yansır), ortam formundaki "Uygulama sürümü", koşu diyaloğundaki isteğe bağlı sürüm alanı (ön
// değer ortamın sürümü; hiçbir koşu başlatılmaz), PDF diyaloğunda Ayarlar > Raporlar bağlantısı, 390 px'te yatay taşma olmaması.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kuralEtkinlestir } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { cokluVeriKur, genelGirdi, genelVeriKur, raporVerisiKur, type GenelFikstur } from './pdf-rapor-fikstur';

const PAROLA = `Gecici-Pdf-A4-${randomBytes(6).toString('hex')}`;
const DONEM = { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' };
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let f: GenelFikstur;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-a4-arayuz-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt)));
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

type Veri = {
  ekipler: Array<{ id: string; ad: string }>;
  ekranlar: Array<{ id: string; kritik: boolean; ekipId: string | null; sureEsigiMs: number | null }>;
  servisler: Array<{ id: string; metotEsikleri: Record<string, number>; sureEsigiMs: number | null }>;
  akislar: Array<{ id: string; kritik: boolean }>;
};
const veri = async (): Promise<Veri> => (await nobetciApi(nobetci, `/platform/rapor-verileri?projeId=${f.projeId}`)) as unknown as Veri;

test('Ayarlar > Raporlar: ekip ve ekran listesi yok; servis kritik / süre eşiği / metot eşikleri ve akış kritik kaydedilir ve rapora yansır', async () => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/ayarlar/raporlar');
  await expect(page.getByRole('heading', { name: 'Raporlar', level: 2 })).toBeVisible();
  await expect(page.locator('nav a[href="#/ayarlar/raporlar"]').first()).toBeVisible();
  // Ekipler ve "Ekranlar ve genel senaryolar" bölümleri kaldırıldı; satırlarda ekip seçimi yok.
  await expect(page.getByRole('form', { name: 'Ekip ekle' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ekipler' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ekranlar ve genel senaryolar' })).toHaveCount(0);
  await expect(page.locator(`li.rapor-ogesi[data-oge="ekran:${f.ekranId}"]`)).toHaveCount(0);
  await expect(page.locator('select.ekip-secimi')).toHaveCount(0);

  // Kayıt Servisi: süre eşiği (geçersiz değer kaydedilmez) ve metot eşiği; Kayıt akışı: kritik.
  const servis = page.locator(`li.rapor-ogesi[data-oge="servis:${f.servisId}"]`);
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').fill('900');
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').blur();
  await expect(servis.getByRole('status').first()).toHaveText('Kaydedildi');
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').fill('0');
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').blur();
  await expect(servis.getByLabel('Kayıt Servisi: süre eşiği (ms)')).toHaveAttribute('aria-invalid', 'true');
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').fill('900');
  await servis.getByLabel('Kayıt Servisi: süre eşiği (ms)').blur();
  await servis.locator('summary', { hasText: 'Metot eşikleri (0 / 2)' }).click();
  await servis.getByLabel('Kayıt Servisi › POST /kayit: süre eşiği (ms)').fill('400');
  await servis.getByLabel('Kayıt Servisi › POST /kayit: süre eşiği (ms)').blur();
  await expect(servis.getByRole('status').first()).toHaveText('Kaydedildi');
  const akis = page.locator(`li.rapor-ogesi[data-oge="akis:${f.akisId}"]`);
  await expect(akis.getByLabel('Kayıt akışı: süre eşiği (ms)')).toHaveCount(0);
  await akis.getByRole('switch', { name: 'Kayıt akışı: kritik' }).check();
  await expect(akis.getByRole('status')).toHaveText('Kaydedildi');

  const v = await veri();
  expect(v.servisler.find((s) => s.id === f.servisId)?.metotEsikleri).toEqual({ 'POST /kayit': 400 });
  expect(v.akislar.find((a) => a.id === f.akisId)?.kritik).toBe(true);

  // Rapora yansır: kritik kartı.
  const o = await nobetciApi(nobetci, '/platform/rapor/onizle', genelGirdi(f, { donem: DONEM, aksiyonSayisi: 20 }));
  expect(o.basarili).toBe(true);
  expect(String(o.html)).toContain('>Kritik akış</div>');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('ortam formu: "Uygulama sürümü" kaydedilir, listede görünür; boşaltınca kalkar', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/ayarlar/proje');
  await page.getByRole('button', { name: 'TEST: düzenle' }).click();
  const form = page.locator('form.form-paneli', { hasText: 'Ortamı düzenle: TEST' });
  await form.getByLabel('Uygulama sürümü (isteğe bağlı)').fill(' 3.1.0 ');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(form).toBeHidden();
  const ortamlar = async () => ((await nobetciApi(nobetci, `/platform/ortamlar?projeId=${f.projeId}`)) as unknown as { ortamlar: Array<{ id: string; uygulamaSurumu?: string }> }).ortamlar;
  expect((await ortamlar()).find((o) => o.id === f.ortamId)?.uygulamaSurumu).toBe('3.1.0');
  await page.getByRole('button', { name: 'TEST: düzenle' }).click();
  await expect(page.locator('form.form-paneli', { hasText: 'Ortamı düzenle: TEST' }).getByLabel('Uygulama sürümü (isteğe bağlı)')).toHaveValue('3.1.0');
  await page.locator('form.form-paneli', { hasText: 'Ortamı düzenle: TEST' }).getByRole('button', { name: 'Vazgeç' }).click();
  // Başka ayarı değiştirmeyen istemci (alan gönderilmez) sürümü korur; boş gönderilirse kalkar.
  const tek = (await ortamlar()).find((o) => o.id === f.ortamId);
  expect(tek?.uygulamaSurumu).toBe('3.1.0');
  const temel = { id: f.ortamId, projeId: f.projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid/uygulama/', varsayilan: true, riskli: false };
  expect((await nobetciApi(nobetci, '/platform/ortam/kaydet', temel)).basarili).not.toBe(false);
  expect((await ortamlar()).find((o) => o.id === f.ortamId)?.uygulamaSurumu).toBe('3.1.0');
  expect((await nobetciApi(nobetci, '/platform/ortam/kaydet', { ...temel, uygulamaSurumu: '' })).basarili).not.toBe(false);
  expect((await ortamlar()).find((o) => o.id === f.ortamId)?.uygulamaSurumu).toBeUndefined();
  expect(hatalar).toEqual([]);
  await kapat();
});

test('koşu diyaloğu: isteğe bağlı "Uygulama sürümü" ön değeri ortamın sürümü, ortam değişince güncellenir, girilen değer sonuca geçer (koşu başlatılmaz)', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/ayarlar/raporlar');
  await page.evaluate(() => {
    (window as unknown as { __sonuc: Promise<unknown> }).__sonuc = import('/arayuz/kosu-paneli.js' as string).then((m) => m.kosuOnayi({
      baslik: 'Sürüm denemesi', tur: 'tam', kapsam: 'Genel', esZamanli: false, surumAlani: true,
      ortamlar: [{ id: 'a', ad: 'Birinci', riskli: false, uygulamaSurumu: '3.1' }, { id: 'b', ad: 'İkinci', riskli: false }],
      ortam: { id: 'a', ad: 'Birinci' }, hesapla: () => ({ senaryolar: [{ id: 's1', baslik: 'Senaryo' }] })
    }));
  });
  const d = page.getByRole('dialog', { name: 'Sürüm denemesi' });
  const surum = d.getByLabel('Uygulama sürümü (isteğe bağlı)');
  await expect(surum).toHaveValue('3.1');
  await d.getByLabel('Ortam', { exact: true }).selectOption('b');
  await expect(surum).toHaveValue('');
  await surum.fill('3.2-rc');
  await d.getByLabel('Ortam', { exact: true }).selectOption('a');
  await expect(surum).toHaveValue('3.2-rc');
  await d.getByRole('button', { name: '1 senaryoyu başlat' }).click();
  const sonuc = await page.evaluate(() => (window as unknown as { __sonuc: Promise<{ ortam: { id: string }; uygulamaSurumu?: string }> }).__sonuc);
  expect(sonuc).toMatchObject({ ortam: { id: 'a' }, uygulamaSurumu: '3.2-rc' });
  // Alan istenmeyen diyalogda (surumAlani yok) sonuçta sürüm yoktur.
  await page.evaluate(() => {
    (window as unknown as { __sonuc: Promise<unknown> }).__sonuc = import('/arayuz/kosu-paneli.js' as string).then((m) => m.kosuOnayi({
      baslik: 'Sürümsüz', tur: 'tekil', esZamanli: true, ortamlar: [{ id: 'a', ad: 'Birinci', riskli: false, uygulamaSurumu: '3.1' }],
      ortam: { id: 'a', ad: 'Birinci' }, hesapla: () => ({ senaryolar: [{ id: 's1', baslik: 'Senaryo' }] })
    }));
  });
  const d2 = page.getByRole('dialog', { name: 'Sürümsüz' });
  await expect(d2.getByLabel('Uygulama sürümü (isteğe bağlı)')).toHaveCount(0);
  await d2.getByRole('button', { name: '1 senaryoyu başlat' }).click();
  expect(await page.evaluate(() => (window as unknown as { __sonuc: Promise<Record<string, unknown>> }).__sonuc)).not.toHaveProperty('uygulamaSurumu');
  expect(hatalar).toEqual([]);
  await kapat();
});

test('PDF diyaloğu: Ayarlar > Raporlar bağlantısı; 390 px\'te Raporlar ayarları yatay taşmaz', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  await git(page, '#/sonuclar/raporlar');
  await page.getByRole('button', { name: 'Rapor al (PDF)' }).first().click();
  const d = page.getByRole('dialog', { name: 'Rapor al (PDF)' });
  await expect(d.locator('.pdf-rapor-veri-notu')).toContainText('Uygulama sürümü: ortam ayarı ya da koşu başlatılırken');
  await d.getByRole('link', { name: 'Ayarlar > Raporlar' }).click();
  await expect(page).toHaveURL(/#\/ayarlar\/raporlar$/);
  await expect(page.getByRole('heading', { name: 'Raporlar', level: 2 })).toBeVisible();
  await kapat();

  const dar = await sayfaAc(390, 844);
  await git(dar.page, '#/ayarlar/raporlar');
  await dar.page.locator(`li.rapor-ogesi[data-oge="servis:${f.servisId}"] summary`).click();
  const t = await dar.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(t).toBeLessThanOrEqual(0);
  for (const kutu of await dar.page.locator('li.rapor-ogesi').all()) {
    const b = await kutu.boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= 390).toBe(true);
  }
  expect([...hatalar, ...dar.hatalar]).toEqual([]);
  await dar.kapat();
});

test('Ayarlar > Raporlar: üstte Eşikler kartı; uzun listede yalnız kritik / eşikli satırlar, "Tümünü göster (N)" hepsini açar', async () => {
  const { page, hatalar, kapat } = await sayfaAc();
  // Uzun servis ve akış listesi (yalnız tarayıcıdaki yanıt değiştirilir; sunucuya yazılmaz): 12 servis (1 kritik, 1 eşikli,
  // 1 metot eşikli) ve 10 akış (1 kritik).
  const servisler = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, ad: `Servis ${i}`, tur: 'rest', kritik: i === 0, sureEsigiMs: i === 1 ? 500 : null,
    metotlar: ['GET /a'], metotEsikleri: i === 2 ? { 'GET /a': 300 } : {} }));
  const akislar = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, ad: `Akış ${i}`, tur: 'servis', kritik: i === 3 }));
  await page.route(/\/platform\/rapor-verileri\?/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ basarili: true, servisler, akislar, ekranlar: [], ekipler: [] }) }));
  await git(page, '#/ayarlar/raporlar');
  // Eşikler kartı en üstte (Sonuçlar özeti, HTML rapor görüntü sınırı, sağlık noktası).
  const esikler = page.locator('.esikler-karti');
  await expect(page.locator('main .kart').first()).toHaveClass(/esikler-karti/);
  await expect(esikler.getByLabel('HTML rapora gömülen görüntü sınırı (MB)')).toBeVisible();
  await expect(esikler.getByRole('form', { name: 'Sağlık noktası' })).toBeVisible();
  await expect(esikler.getByText('Uzun süredir kırmızı', { exact: false }).first()).toBeVisible();

  const servisListesi = page.getByRole('list', { name: 'Servisler' });
  await expect(servisListesi.locator('li.rapor-ogesi')).toHaveCount(12);
  await expect(servisListesi.locator('li.rapor-ogesi:visible')).toHaveCount(3);
  for (const id of ['s0', 's1', 's2']) await expect(servisListesi.locator(`li[data-oge="servis:${id}"]`)).toBeVisible();
  await expect(servisListesi.locator('li[data-oge="servis:s5"]')).toBeHidden();
  const tumu = page.getByRole('button', { name: 'Tümünü göster (12)' });
  await expect(tumu).toHaveAttribute('aria-expanded', 'false');
  await tumu.click();
  await expect(servisListesi.locator('li.rapor-ogesi:visible')).toHaveCount(12);
  await page.getByRole('button', { name: 'Yalnız işaretlileri göster' }).first().click();
  await expect(servisListesi.locator('li.rapor-ogesi:visible')).toHaveCount(3);

  const akisListesi = page.getByRole('list', { name: 'Servis akışları ve uçtan uca akışlar' });
  await expect(akisListesi.locator('li.rapor-ogesi:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tümünü göster (10)' }).click();
  await expect(akisListesi.locator('li.rapor-ogesi:visible')).toHaveCount(10);
  expect(hatalar).toEqual([]);
  await kapat();
});
