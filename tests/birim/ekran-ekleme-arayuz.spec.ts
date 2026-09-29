// ENTEGRASYON (yerel) — Nöbetçi arayüzü: Ekranlar > "Ekran ekle" (yan yana üç eşit kutu: Ekranı tara / Akışı kaydet /
// Yapay zekâ ile oluştur), istek metni gösterimi (tam metin yok; tek "İstek metnini kopyala" + kapalı "Metni göster"),
// "Paket biçimini indir" ve Ekranlar > Ortak akışlar kartları (ekran kartıyla aynı düzen; adım listesi yok).
// Tek kaynak: arayüzün kopyaladığı metin === paketIstekCumlesi(); biçim dosyası === paketBicimiBelgesi().
// Geçici veritabanı + AYRI Nöbetçi örneği (TEST_SUNUCU_KOSU_KAPALI=1); tüm istekler 127.0.0.1'dedir.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { BICIM_ADRESI, BICIM_DOSYASI_ADI, paketIstekCumlesi } from '../../scripts/platform/ekranlar/paket-istekleri.mjs';
import { paketBicimiBelgesi } from '../../scripts/platform/ekranlar/paket-bicimi.mjs';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { ornekBasvuruModeli, ornekGirisTarifi } from './model-fikstur';
import { ONAY_AKIS_ANAHTARI, onayAkisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

const KOK = join(__dirname, '..', '..');
/** EKRAN_EKLEME_EKRAN_KLASORU verilirse kart ızgarası görüntüleri (1920/1400/1024/390, koyu/açık) oraya yazılır. */
const EKRAN_KLASORU = process.env.EKRAN_EKLEME_EKRAN_KLASORU;
const UZUN_ORTAK_AKISLAR: ReadonlyArray<readonly [string, string, number]> = [
  ['odeme-siparis-kaydet-kredi-karti', 'Ödeme (sipariş kaydet + kredi kartı)', 3],
  ['adres-iletisim-dogrulama', 'Adres ve iletişim bilgilerinin doğrulanması (ortak adımlar, çok bölümlü)', 2]
];
/** Ekranlar > Ortak akışlar'daki kart sayısı: Onay (ortak) + uzun adlı ortak akışlar (giriş tarifleri burada listelenmez). */
const ORTAK_AKIS_SAYISI = 1 + UZUN_ORTAK_AKISLAR.length;
const UZUN_EKRAN_ADI = 'Kurumsal müşteri başvurusu ve sipariş hazırlama ekranı (çok adımlı)';
let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let projeId = '';

const api = (yol: string, govde?: Record<string, unknown>) => nobetciApi(nobetci, yol, govde);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('ekran-ekleme-arayuz');
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  const ortamlar = ['TEST', 'CANLI'].map((ad, i) => ortamKaydet(vt, { projeId, ad, tabanUrl: 'http://127.0.0.1:9/', varsayilan: i === 0, ayarlar: { riskli: i === 1 } }));
  // Ortak akış + onu varsayılan akışının sonunda kullanan bir ekran (kartta "1 ekranda kullanılıyor").
  const ortak = onayAkisPaketi().model;
  const ortakId = ekranKaydet(vt, { projeId, anahtar: ONAY_AKIS_ANAHTARI, ad: String(ortak.ad) });
  ekranModeliEkle(vt, { ekranId: ortakId, model: ortak });
  const model = ornekBasvuruModeli() as Record<string, unknown> & { adimlar: Array<Record<string, unknown>> };
  model.adimlar = [...model.adimlar, { id: 'onay', sira: model.adimlar.length + 1, baslik: 'Onay', ortakAkis: { dosya: `${ONAY_AKIS_ANAHTARI}.model.json` } }];
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
  ekranModeliEkle(vt, { ekranId, model });
  const digerId = ekranKaydet(vt, { projeId, anahtar: 'musteri-kaydi', ad: 'Müşteri Kaydı' });
  ekranModeliEkle(vt, { ekranId: digerId, model: { ...ornekBasvuruModeli(), id: 'musteri-kaydi', ad: 'Müşteri Kaydı', ekranUrl: '/musteri/' } });
  // Gerçekçi uzun adlar (kart taşması denetimi): uzun başlıklı, iki rozetli (ortak akış + model v3) ortak akışlar ve uzun yollu ekran.
  for (const [anahtar, ad, surum] of UZUN_ORTAK_AKISLAR) {
    const id = ekranKaydet(vt, { projeId, anahtar, ad });
    for (let i = 0; i < surum; i++) ekranModeliEkle(vt, { ekranId: id, model: { ...onayAkisPaketi().model, id: anahtar, ad } });
  }
  // Alt model: sayfasında "Modeli güncelle" menüsünde yalnız Paket yükle.
  const altId = ekranKaydet(vt, { projeId, anahtar: 'adres-alt', ad: 'Adres Alt Modeli' });
  ekranModeliEkle(vt, { ekranId: altId, model: { semaSurumu: 2, tur: 'altModel', id: 'adres-alt', ad: 'Adres', bolumler: [] } });
  const uzunId = ekranKaydet(vt, { projeId, anahtar: 'kurumsal-basvuru-siparis-hazirlama', ad: UZUN_EKRAN_ADI });
  ekranModeliEkle(vt, { ekranId: uzunId, model: { ...ornekBasvuruModeli(), id: 'kurumsal-basvuru-siparis-hazirlama', ad: UZUN_EKRAN_ADI, ekranUrl: '/uzun-yol/ornek-kurumsal-musteri-basvurusu/siparis-hazirlama-ve-onay/' } });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu, { TEST_SUNUCU_KOSU_KAPALI: '1' });
  expect((await api('/platform/kasa/ac', { parola })).basarili).toBe(true);
  for (const ortamId of ortamlar) expect((await api('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
});

async function arayuz(genislik = 1360): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, colorScheme: 'dark', viewport: { width: genislik, height: 1000 } });
  await baglam.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: nobetci.adres });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}

function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

/** Yatay taşma yok (sayfa genişliği pencereyi aşmaz). */
async function tasmaYok(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

async function kutular(l: Locator): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const n = await l.count();
  const sonuc = [];
  for (let i = 0; i < n; i++) sonuc.push((await l.nth(i).boundingBox())!);
  return sonuc;
}

test('Ekran ekle: önde Ekranı tara / Akışı kaydet (yan yana eşit, tek eylem); paket yükleme ve yapay zekâ kapalı "İleri düzey"de; istek metni tek kaynaktan; 390px taşma yok', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  // Ekranlar sayfasının düğmesi "Ekran ekle" (sayfanın adıyla aynı); eski "Sayfa ekle" adı hiçbir yerde kalmaz.
  await page.goto('/#/ekranlar');
  await expect(page.locator('.sayfa-basligi .eylemler').getByRole('link', { name: 'Ekran ekle' })).toBeVisible();
  await expect(page.getByText('Sayfa ekle')).toHaveCount(0);
  await page.goto('/#/ekranlar/yeni');
  // Sıra: "Ne oluşturulsun?" → ana yollar (Ekranı tara, Akışı kaydet) → kapalı "İleri düzey" (paket yükle + yapay zekâ).
  const ana = page.locator('section.ekleme-secenekleri .ekleme-kutusu');
  const ileri = page.locator('details.ileri-duzey');
  await expect(page.getByRole('heading', { name: 'Nasıl eklensin?' })).toBeVisible();
  await expect(ana.locator('h3')).toHaveText(['Ekranı tara', 'Akışı kaydet']);
  await expect(ileri).toHaveCount(1);
  await expect(ileri).not.toHaveAttribute('open', '');
  await expect(ileri.locator(':scope > summary')).toContainText('İleri düzey: paket yükle ya da yapay zekâ ile oluştur');
  await expect(page.locator('label.yukleme-alani')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Yapay zekâ ile oluştur' })).toBeHidden();
  await expect(page.getByText('Paketiniz yoksa')).toHaveCount(0);
  const secimY = (await page.locator('.olusturma-secimi').boundingBox())!.y;
  const anaY = (await ana.first().boundingBox())!.y;
  const ileriY = (await ileri.locator(':scope > summary').boundingBox())!.y;
  expect(secimY).toBeLessThan(anaY);
  expect(anaY).toBeLessThan(ileriY);
  await expect(ana.nth(0)).toContainText('Nöbetçi sayfayı yalnızca okuyarak tarar; düğmelere basmaz, form göndermez.');
  await expect(ana.nth(1)).toContainText('Siz ekranda işlemi yaparsınız, Nöbetçi adımları ve alanları kaydeder (çok adımlı formlar için).');
  for (const i of [0, 1]) await expect(ana.nth(i).getByRole('button')).toHaveCount(1);
  for (const i of [0, 1]) await expect(ana.nth(i).locator('.ekleme-notu')).toBeVisible();
  // Eşit boyutlu, yan yana (aynı üst kenar).
  const b = await kutular(ana);
  expect(Math.max(...b.map((x) => x.height)) - Math.min(...b.map((x) => x.height))).toBeLessThanOrEqual(1);
  expect(Math.max(...b.map((x) => x.width)) - Math.min(...b.map((x) => x.width))).toBeLessThanOrEqual(1);
  expect(new Set(b.map((x) => Math.round(x.y))).size).toBe(1);
  // İleri düzey açılınca: kısa "Paket nedir?", yükleme alanı ("Dosya seç") ve yapay zekâ kutusu (yükleme düğmesi YOK, tek eylem kopyalama).
  await ileri.locator(':scope > summary').click();
  await expect(ileri).toHaveAttribute('open', '');
  await expect(ileri.locator('.paket-nedir')).toContainText('Paket nedir?');
  await expect(ileri.locator('label.yukleme-alani')).toContainText('Dosya seç');
  const yz = ileri.locator('.ekleme-kutusu');
  await expect(yz.locator('h3')).toHaveText(['Yapay zekâ ile oluştur']);
  await expect(yz.locator('.ekleme-adimlari li')).toHaveText(['İstek metnini kopyalayın', 'Yapay zekâ aracınıza sayfanın bağlantısıyla verin', 'Ürettiği paketi yukarıdaki "Dosya seç" ile yükleyin']);
  await expect(yz.getByRole('button', { name: /yükle/i })).toHaveCount(0);
  await expect(yz.getByRole('button')).toHaveText(['İstek metnini kopyala']);
  await expect(yz.locator('.ekleme-notu')).toBeVisible();
  // Uzun istek metni ekranda görünmez; "Metni göster" varsayılan kapalı.
  const metin = paketIstekCumlesi();
  await expect(page.getByText('Sayfayı benimle birlikte, adım adım incele', { exact: false })).toBeHidden();
  await expect(page.locator('details.istek-metni-acilir')).not.toHaveAttribute('open', '');
  await yz.getByRole('button', { name: 'İstek metnini kopyala' }).click();
  await expect(page.getByText('İstek metni kopyalandı.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(metin);
  await yz.getByText('Metni göster').click();
  await expect(yz.locator('pre.istek-metni')).toHaveText(metin);
  const kutu = page.locator('.ekleme-kutusu');
  // "Paket biçimini indir": yerel uç, tek dosya, içerik sunucunun birleştirdiği belgeyle aynı.
  const indir = yz.getByRole('link', { name: 'Paket biçimini indir' });
  await expect(indir).toHaveAttribute('href', BICIM_ADRESI);
  await expect(indir).toHaveAttribute('download', BICIM_DOSYASI_ADI);
  const yanit = await page.request.get(BICIM_ADRESI);
  expect(yanit.status()).toBe(200);
  expect(yanit.headers()['content-disposition']).toContain(BICIM_DOSYASI_ADI);
  expect(await yanit.text()).toBe(paketBicimiBelgesi(KOK));
  // Mevcut akış değişmedi: "Ekranı tara" tarama diyaloğunu açar (klavyeyle).
  await kutu.nth(0).getByRole('button', { name: 'Ekranı tara' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  // 390px: alt alta, taşma yok.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  const d = await kutular(ana);
  expect(d).toHaveLength(2);
  expect(new Set(d.map((x) => Math.round(x.x))).size).toBe(1);
  expect(d[1].y).toBeGreaterThan(d[0].y + d[0].height - 1);
  await tasmaYok(page);
  agKontrol(istekler);
  await page.close();
});

test('Ekranlar: istek metni tam gösterilmez (kopyala düğmesi); ortak akış kartları ekran kartı düzeninde, adım listesi yok, eşit yükseklik', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  // Şerit tara / kaydet yolunu anlatır; yapay zekâ istek metni kapalı "İleri düzey" içinde.
  const serit = page.locator('.kesif-seridi');
  await expect(serit.locator('.kesif-adimlari li b')).toHaveText(['Ekranı tarayın ya da akışı kaydedin', 'Düğmeyi ve sonucu kontrol edin', 'Senaryo yazın']);
  await expect(serit.getByRole('link', { name: 'Ekranı tara' })).toHaveAttribute('href', '#/ekranlar/yeni/tara');
  await expect(serit.locator('button', { hasText: 'İstek metnini kopyala' })).toHaveCount(1);
  await expect(serit.locator('button', { hasText: 'İstek metnini kopyala' })).toBeHidden();
  await expect(serit.locator('code')).toHaveCount(0);
  await expect(serit.locator('pre.istek-metni')).toBeHidden();
  await serit.locator('details.kesif-ileri > summary').click();
  await serit.getByRole('button', { name: 'İstek metnini kopyala' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(paketIstekCumlesi(''));

  const bolum = page.locator('.ortak-akis-bolumu');
  const kartlar = bolum.locator('article.ekran-karti.ortak-akis-karti');
  await expect(kartlar).toHaveCount(ORTAK_AKIS_SAYISI);
  await expect(bolum.locator('.giris-ozet-adimlari, ol, ul')).toHaveCount(0);
  for (let i = 0; i < ORTAK_AKIS_SAYISI; i++) {
    await expect(kartlar.nth(i).locator('.ekran-karti-ust .ekran-karti-rozetler .rozet').first()).toBeVisible();
    await expect(kartlar.nth(i).locator('.ekran-karti-alt .dugme').first()).toBeVisible();
  }
  // Giriş (her iki ortamda tarif tanımlı) Ekranlar'da listelenmez: ne kart ne sol menü kalemi; sayaçlar yalnız ortak akışları sayar.
  await expect(bolum).not.toContainText('Giriş (');
  await expect(bolum.locator('.bolum-basligi .rozet')).toHaveText(String(ORTAK_AKIS_SAYISI));
  await expect(bolum.locator('.bolum-basligi')).not.toContainText('giriş tarifiyle');
  const yanGrup = page.locator('.yan-panel .nav-grup[data-grup="ortak-akislar"]');
  await expect(yanGrup).not.toContainText('Giriş (');
  await expect(yanGrup.locator('.nav-grup-baslik .adet')).toHaveText(String(ORTAK_AKIS_SAYISI));
  await expect(page.locator('.yan-panel')).not.toContainText('Giriş (');
  const ortak = kartlar.filter({ hasText: 'Onay (ortak)' });
  await expect(ortak.locator('.ekran-karti-rozetler')).toContainText('ortak akış');
  await expect(ortak.locator('.ortak-akis-ozeti')).toHaveText(/^\d+ adım · \d+ alan$/);
  await expect(ortak.locator('.ortak-akis-kullanimi')).toHaveText('1 ekranda kullanılıyor');
  await expect(ortak.getByRole('link', { name: 'Onay (ortak): düzenle' })).toHaveAttribute('href', /\/akis$/);
  await expect(kartlar.filter({ hasText: UZUN_ORTAK_AKISLAR[0][1] }).locator('.ekran-karti-rozetler')).toHaveText(/ortak akışs*model v3/);
  // Aynı satırdaki kartlar eşit yükseklikte, içerik yukarıdan hizalı; eylemler altta aynı hizada.
  const b = await kutular(kartlar);
  const altlar = await kutular(bolum.locator('.ekran-karti-alt'));
  for (const y of new Set(b.map((x) => Math.round(x.y)))) {
    const satir = b.map((x, i) => ({ x, alt: altlar[i] })).filter((k) => Math.round(k.x.y) === y);
    expect(Math.max(...satir.map((k) => k.x.height)) - Math.min(...satir.map((k) => k.x.height))).toBeLessThanOrEqual(1);
    expect(Math.max(...satir.map((k) => k.alt.y)) - Math.min(...satir.map((k) => k.alt.y))).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  await tasmaYok(page);
  agKontrol(istekler);
  await page.close();
});

/**
 * Kart ızgarası geometrisi: kartlar birbiriyle kesişmez; her kartın (görünür) tüm alt öğeleri kart sınırları içinde kalır.
 * Kartın bütününü kaplayan bağlantı katmanı (h3 a::after) sözde öğedir, ölçüme girmez.
 */
async function kartGeometrisi(page: Page, secici: string): Promise<{ kesisen: string[]; tasan: string[]; sayi: number }> {
  return page.evaluate((s) => {
    const kartlar = [...document.querySelectorAll(s)] as HTMLElement[];
    const ad = (e: Element) => (e.querySelector('h3')?.textContent || e.getAttribute('aria-label') || '?').trim().slice(0, 40);
    const kutu = kartlar.map((k) => k.getBoundingClientRect());
    const kesisen: string[] = [];
    for (let i = 0; i < kutu.length; i++) for (let j = i + 1; j < kutu.length; j++) {
      const a = kutu[i], b = kutu[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) kesisen.push(`${ad(kartlar[i])} × ${ad(kartlar[j])}`);
    }
    const tasan: string[] = [];
    kartlar.forEach((k, i) => {
      const d = kutu[i];
      for (const c of k.querySelectorAll('*')) {
        const r = c.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(c).visibility === 'hidden') continue;
        if (r.left < d.left - 0.5 || r.right > d.right + 0.5 || r.top < d.top - 0.5 || r.bottom > d.bottom + 0.5) {
          tasan.push(`${ad(k)}: ${c.tagName.toLowerCase()}.${[...c.classList].join('.')} (${Math.round(r.left)}–${Math.round(r.right)} / kart ${Math.round(d.left)}–${Math.round(d.right)})`);
        }
      }
    });
    return { kesisen, tasan, sayi: kartlar.length };
  }, secici);
}

test('kart ızgaraları (ekran + ortak akış): uzun başlık ve iki rozetle kartlar kesişmez, içerik kart içinde kalır (1920/1400/1024/390)', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await expect(page.locator('.ortak-akis-bolumu article.ortak-akis-karti')).toHaveCount(ORTAK_AKIS_SAYISI);
  const uzun = page.locator('.ortak-akis-karti').filter({ hasText: UZUN_ORTAK_AKISLAR[1][1] });
  await expect.soft(uzun.locator('h3 a')).toHaveAttribute('title', UZUN_ORTAK_AKISLAR[1][1]);
  // Üç tema (Ayarlar > Arayüz) yazı ve boşlukları değiştirir: her birinde ölçülür.
  for (const stil of ['komuta', 'kurumsal', 'canli']) {
  await page.evaluate((x) => { localStorage.setItem('platform.stil', x); }, stil);
  await page.reload();
  await expect(page.locator('.ortak-akis-izgarasi > article')).toHaveCount(ORTAK_AKIS_SAYISI);
  for (const genislik of [1920, 1400, 1024, 390]) {
    await page.setViewportSize({ width: genislik, height: 1000 });
    await page.waitForTimeout(250);
    for (const secici of ['.ekran-izgarasi:not(.ortak-akis-izgarasi) > article.ekran-karti', '.ortak-akis-izgarasi > article.ortak-akis-karti']) {
      const g = await kartGeometrisi(page, secici);
      expect(g.sayi, `${genislik}px ${secici}`).toBeGreaterThan(0);
      expect.soft(g.kesisen, `${stil} ${genislik}px kesişen kartlar`).toEqual([]);
      expect.soft(g.tasan, `${stil} ${genislik}px kart dışına taşan öğeler`).toEqual([]);
    }
    await tasmaYok(page);
    if (EKRAN_KLASORU && stil === 'komuta') {
      mkdirSync(EKRAN_KLASORU, { recursive: true });
      for (const renk of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: renk });
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(EKRAN_KLASORU, `ajan-a-kartlar-${genislik}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.emulateMedia({ colorScheme: 'dark' });
    }
  }
  }
  await page.evaluate(() => { localStorage.removeItem('platform.stil'); });
  agKontrol(istekler);
  await page.close();
});

test('Tekrar analiz diyaloğu: istek metni kopyala düğmesiyle (tam metin kapalı) + biçim dosyası bağlantısı', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await page.locator('article.ekran-karti:not(.ortak-akis-karti)').filter({ hasText: 'Örnek Başvuru' }).getByRole('link', { name: 'Örnek Başvuru' }).click();
  // Model eylemleri tek menüde: her seçenekte bir satırlık açıklama; klavyeyle gezilir.
  const menuDugmesi = page.getByRole('button', { name: /^Modeli güncelle/ });
  await menuDugmesi.click();
  await expect(menuDugmesi).toHaveAttribute('aria-expanded', 'true');
  const secenekler = page.getByRole('menuitem');
  await expect(secenekler).toHaveText([/^Paket yükle/, /^Ekranı tara/, /^Akışı kaydet/, /^Tekrar analiz et/, /^Yapay zekâ ile yorumla/]);
  await expect(page.getByRole('menuitem', { name: 'Ekranı tara' })).toHaveAccessibleDescription(/Sayfa değiştiyse/);
  await expect(page.getByRole('menuitem', { name: 'Paket yükle' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Ekranı tara' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Yapay zekâ ile yorumla' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuDugmesi).toBeFocused();
  await expect(secenekler.first()).toBeHidden();
  await menuDugmesi.click();
  await page.getByRole('menuitem', { name: 'Tekrar analiz et' }).click();
  const d = page.locator('dialog[open]');
  await d.getByRole('button', { name: 'İstek dosyasını oluştur' }).click();
  await expect(d.getByRole('button', { name: 'İstek metnini kopyala' })).toBeVisible();
  await expect(d.locator('pre.istek-metni')).toBeHidden();
  await expect(d.locator('textarea')).toHaveCount(0);
  await expect(d.getByRole('link', { name: 'Paket biçimini indir' })).toHaveAttribute('href', BICIM_ADRESI);
  await d.getByRole('button', { name: 'İstek metnini kopyala' }).click();
  const kopya = await page.evaluate(() => navigator.clipboard.readText());
  expect(kopya).toContain(`ekteki ${BICIM_DOSYASI_ADI} dosyasındaki biçimde`);
  expect(kopya).not.toContain('docs/sayfa-paketi.md');
  await expect(d.getByRole('button', { name: 'Paketi yükle' })).toBeVisible();
  agKontrol(istekler);
  await page.close();
});

test('ortak akış sayfası: "Modeli güncelle" menüsü Paket yükle / Akışı kaydet / Tekrar analiz et / Yapay zekâ ile yorumla (Ekranı tara yok); alt modelde yalnız Paket yükle', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Array<{ id: string; anahtar: string }>;
  const ortak = ekranlar.find((e) => e.anahtar === ONAY_AKIS_ANAHTARI)!;
  const alt = ekranlar.find((e) => e.anahtar === 'adres-alt')!;
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(alt.id)}`);
  await page.getByRole('button', { name: /^Modeli güncelle/ }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/^Paket yükle/]);
  await page.keyboard.press('Escape');
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortak.id)}`);
  const menuDugmesi = page.getByRole('button', { name: /^Modeli güncelle/ });
  await menuDugmesi.click();
  await expect(page.getByRole('menuitem')).toHaveText([/^Paket yükle/, /^Akışı kaydet/, /^Tekrar analiz et/, /^Yapay zekâ ile yorumla/]);
  await expect(page.getByRole('menuitem', { name: 'Ekranı tara' })).toHaveCount(0);
  // "Akışı kaydet": başlangıç ekranı sorulur (ortak akışı kullanan ekran önde); başlangıç sayfası o ekranın adresi olur.
  await page.getByRole('menuitem', { name: 'Akışı kaydet' }).click();
  const kayit = page.locator('dialog[open]');
  await expect(kayit.getByRole('heading', { name: 'Akışı kaydet: Onay (ortak) (ortak akış)' })).toBeVisible();
  const baslangic = kayit.getByLabel('Başlangıç ekranı');
  await expect(baslangic.locator('optgroup').first()).toHaveAttribute('label', 'Bu ortak akışı kullanan ekranlar');
  await expect(baslangic.locator('option:checked')).toHaveText('Örnek Başvuru — /basvuru/');
  await expect(kayit.getByText('Ortak akış bu ekranda “Başvuru onaylanır” adımından sonra başlar.')).toBeVisible();
  await expect(kayit.getByLabel('Başlangıç sayfası')).toHaveValue('/basvuru/');
  await baslangic.selectOption({ label: 'Müşteri Kaydı — /musteri/' });
  await expect(kayit.getByLabel('Başlangıç sayfası')).toHaveValue('/musteri/');
  await expect(kayit.getByText(/Bu ekran ortak akışı henüz kullanmıyor/)).toBeVisible();
  await kayit.getByRole('button', { name: 'Vazgeç' }).click();
  await menuDugmesi.click();
  await page.getByRole('menuitem', { name: 'Paket yükle' }).click();
  await expect(page).toHaveURL(new RegExp(`/ekranlar/e/${ortak.id}/yukle$`));
  await expect(page.locator('#paket-dosyasi')).toHaveCount(1);
  // "Paket ne yapsın?" seçimi başlıklı ve yükleme alanından ayrı (bitişik değil).
  const mod = page.getByRole('group', { name: 'Paket ne yapsın?' });
  await expect(mod.getByRole('radio', { name: /Tekrar analiz/ })).toBeChecked();
  const modKutu = await mod.boundingBox();
  const alanKutu = await page.locator('.yukleme-alani').boundingBox();
  expect((alanKutu?.y ?? 0) - ((modKutu?.y ?? 0) + (modKutu?.height ?? 0))).toBeGreaterThanOrEqual(12);
  // Ortak akışın yeni sürümü (adım başlığı değişti) tekrar analizle bulgu olur.
  const paket = onayAkisPaketi();
  (paket.model.adimlar as Array<Record<string, unknown>>)[0].baslik = 'Onay formu açılır (yeni)';
  await page.locator('#paket-dosyasi').setInputFiles({ name: 'ortak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket)) });
  await page.getByRole('button', { name: 'Bulguları hesapla' }).click();
  await expect(page).toHaveURL(/\/bulgular$/);
  agKontrol(istekler);
  await page.close();
});

test('ortak akış: "Tekrar analiz et" başlangıç ekranını sorar; istek metni başlangıç ekranının adresini, başladığı adımı ve ortakAkis paket kuralını içerir', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  const ortak = ((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Array<{ id: string; anahtar: string }>).find((e) => e.anahtar === ONAY_AKIS_ANAHTARI)!;
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortak.id)}`);
  await page.getByRole('button', { name: /^Modeli güncelle/ }).click();
  await page.getByRole('menuitem', { name: 'Tekrar analiz et' }).click();
  const d = page.locator('dialog[open]');
  const baslangic = d.getByLabel('Başlangıç ekranı');
  await expect(baslangic.locator('option:checked')).toHaveText('Örnek Başvuru — /basvuru/');
  await d.getByRole('button', { name: 'İstek dosyasını oluştur' }).click();
  await d.getByRole('button', { name: 'İstek metnini kopyala' }).click();
  const kopya = await page.evaluate(() => navigator.clipboard.readText());
  expect(kopya).toContain('"Onay (ortak)" bir ORTAK AKIŞTIR');
  expect(kopya).toContain('"Örnek Başvuru" ekranının adresini (/basvuru/) aç; ortak akış bu ekranda “Başvuru onaylanır” adımından sonra başlar.');
  expect(kopya).toContain('model.tur değeri "ortakAkis" olmalı');
  expect(kopya).toContain('meta.ekran.urlYolu verilmeyebilir');
  await page.keyboard.press('Escape');
  // Başka bir başlangıç ekranı seçilebilir (ortak akışı kullanmayan ekran: "gerekli adımlar yapıldıktan sonra").
  const y = await api('/platform/ekran/claude-dosyasi', {
    projeId, ekranId: ortak.id, tur: 'tekrar-analiz', baglamProfilleri: [],
    baslangicEkranId: ((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Array<{ id: string; anahtar: string }>).find((e) => e.anahtar === 'musteri-kaydi')!.id
  });
  expect(y.basarili, String(y.mesaj)).toBe(true);
  expect(String(y.cumle)).toContain('"Müşteri Kaydı" ekranının adresini (/musteri/) aç; ortak akış bu ekranda ekranın gerekli adımları (ör. hesaplama) yapıldıktan sonra başlar.');
  const dosya = JSON.parse(readFileSync(isAbsolute(String(y.yol)) ? String(y.yol) : join(KOK, String(y.yol)), 'utf8')) as { ortakAkis: Record<string, unknown> };
  expect(dosya.ortakAkis).toMatchObject({ baslangicEkrani: { ad: 'Müşteri Kaydı', urlYolu: '/musteri/', kullanir: false, oncekiAdim: null } });
  // "Yapay zekâ ile yorumla": başlangıç ekranı (varsayılan: kullanan ekran) istek metnine eklenir.
  const yorum = await api('/platform/ekran/claude-dosyasi', { projeId, ekranId: ortak.id, tur: 'yorumla' });
  expect(String(yorum.cumle)).toContain('"Örnek Başvuru" ekranının adresini (/basvuru/) aç');
  agKontrol(istekler);
  await page.close();
});

test('Paket yükle (tekrar analiz): "Bulguları hesapla" Bulgular\'a geçer; "kaydedilmemiş değişiklik" sorusu çıkmaz', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  const ekran = ((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Array<{ id: string; anahtar: string }>).find((e) => e.anahtar === 'musteri-kaydi')!;
  const model = { ...ornekBasvuruModeli(), id: 'musteri-kaydi', ad: 'Müşteri Kaydı', ekranUrl: '/musteri/' } as unknown as Record<string, unknown> & { adimlar: Array<Record<string, unknown>> };
  model.adimlar = model.adimlar.map((a, i) => (i === 0 ? { ...a, baslik: `${String(a.baslik)} (yeni başlık)` } : a));
  const paket = {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'musteri-kaydi', ad: 'Müşteri Kaydı', urlYolu: '/musteri/' }, olusturan: 'test', olusturulma: new Date().toISOString(), baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: true, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: [],
    testVerisi: { tablolar: [{ ad: 'Müşteri Kaydı — Deneme listesi', tur: 'liste', sutunlar: [{ ad: 'Deneme' }], satirlar: [['A'], ['B']] }], baglantilar: [] }
  };
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran.id)}/yukle`);
  await page.locator('#paket-dosyasi').setInputFiles({ name: 'paket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket)) });
  // Test verisi bölümündeki seçim ana içerikte gerçek bir değişikliktir (çıkış korumasını kirletir); hesaplama başarılı
  // olunca temizlenmeli.
  const yaz = page.getByRole('checkbox', { name: 'Müşteri Kaydı — Deneme listesi tablosunu yaz' });
  await yaz.uncheck();
  await yaz.check();
  await page.getByRole('button', { name: 'Bulguları hesapla' }).click();
  await expect(page).toHaveURL(/\/bulgular$/);
  await expect(page.getByRole('dialog', { name: 'Değişiklikleriniz kaydedilmeyecek' })).toHaveCount(0);
  agKontrol(istekler);
  await page.close();
});

/** Öğe ve TÜM alt öğelerinde yatay taşma (scrollWidth > clientWidth) ya da kutunun dışına çıkan alt öğe listesi. */
async function yatayTasmalar(kok: Locator): Promise<string[]> {
  return kok.evaluate((d) => {
    const sinir = d.getBoundingClientRect();
    const sonuc: string[] = [];
    for (const e of [d, ...d.querySelectorAll('*')] as HTMLElement[]) {
      if (!(e instanceof HTMLElement) || !e.clientWidth) continue;
      const ad = `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`;
      if (e.scrollWidth > e.clientWidth + 1) sonuc.push(`${ad}: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
      const r = e.getBoundingClientRect();
      if (r.width && (r.left < sinir.left - 0.5 || r.right > sinir.right + 0.5)) sonuc.push(`${ad}: diyalog dışında (${Math.round(r.left)}–${Math.round(r.right)})`);
    }
    return sonuc;
  });
}

test('istek metni diyalogları (tekrar analiz, yapay zekâ ile yorumla): "Metni göster" çok satırlı, hiçbir genişlikte yatay taşma yok (1400/1024/390)', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await arayuz();
  for (const [dugme, olustur] of [['Tekrar analiz et', true], ['Yapay zekâ ile yorumla', false]] as const) {
    for (const genislik of [1400, 1024, 390]) {
      await page.setViewportSize({ width: genislik, height: 900 });
      await page.goto('/#/ekranlar');
      await page.locator('article.ekran-karti:not(.ortak-akis-karti)').filter({ hasText: 'Örnek Başvuru' }).getByRole('link', { name: 'Örnek Başvuru' }).click();
      await page.getByRole('button', { name: /^Modeli güncelle/ }).click();
      await page.getByRole('menuitem', { name: dugme }).click();
      const d = page.locator('dialog[open]');
      if (olustur) await d.getByRole('button', { name: 'İstek dosyasını oluştur' }).click();
      await expect(d.getByRole('button', { name: 'İstek metnini kopyala' })).toBeVisible();
      await d.getByText('Metni göster').click();
      const pre = d.locator('pre.istek-metni');
      await expect(pre).toBeVisible();
      // Çok satırlı (sarılır), en çok ~12 satır yüksekliğinde; yatay kaydırma yok.
      const olcu = await pre.evaluate((e) => ({ yukseklik: e.clientHeight, satir: parseFloat(getComputedStyle(e).lineHeight), sw: e.scrollWidth, cw: e.clientWidth, beyaz: getComputedStyle(e).whiteSpace }));
      expect(olcu.beyaz).toBe('pre-wrap');
      expect(olcu.sw).toBeLessThanOrEqual(olcu.cw + 1);
      expect(olcu.yukseklik).toBeGreaterThan(olcu.satir * 2);
      expect(olcu.yukseklik).toBeLessThanOrEqual(olcu.satir * 12 + 20);
      expect(await yatayTasmalar(d), `${dugme} ${genislik}px`).toEqual([]);
      if (EKRAN_KLASORU) {
        mkdirSync(EKRAN_KLASORU, { recursive: true });
        for (const renk of ['dark', 'light'] as const) {
          await page.emulateMedia({ colorScheme: renk });
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(EKRAN_KLASORU, `ajan-a-istek-metni-${olustur ? 'tekrar-analiz' : 'yorumla'}-${genislik}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), animations: 'disabled' });
        }
        await page.emulateMedia({ colorScheme: 'dark' });
      }
      await page.keyboard.press('Escape');
    }
  }
  agKontrol(istekler);
  await page.close();
});

test('arayüz ve belge metinleri yapay zekâ aracından bağımsız: kullanıcıya görünen "Claude" ifadesi yok (iç adlar hariç)', () => {
  const ESKI = /Claude Code'a verin|Claude Code gibi|Claude ile yorumla|Claude Code sohbet|Claude Code'a yapıştırın|Claude'da ekran tara/;
  const arayuzKlasoru = join(KOK, 'scripts', 'platform', 'arayuz');
  const dosyalar = [...readdirSync(arayuzKlasoru).filter((d) => /\.(m?js)$/.test(d)).map((d) => join(arayuzKlasoru, d)), join(KOK, 'docs', 'sayfa-paketi.md'),
    join(KOK, 'scripts', 'platform', 'ekranlar', 'paket-istekleri.mjs')];
  for (const y of dosyalar) {
    // İç adlar (claudeDosyasiOlustur, /platform/ekran/claude-dosyasi, claude-diyalogu, CLAUDE_ISTEK_CUMLESI) çıkarılır.
    const metin = readFileSync(y, 'utf8').replace(/claude[A-Za-z-]*|CLAUDE_[A-Z_]+/g, '');
    expect(metin.match(ESKI), y).toBeNull();
    expect(metin.split(/\r?\n/).filter((s) => /Claude/.test(s)), y).toEqual([]);
  }
  // İstek metni depo dosyasına değil, istekle verilen biçim dosyasına atıf yapar.
  expect(paketIstekCumlesi()).not.toContain('docs/');
  expect(paketIstekCumlesi()).toContain(BICIM_DOSYASI_ADI);
});
