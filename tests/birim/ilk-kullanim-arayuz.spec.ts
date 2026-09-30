// KORUMA TESTLERİ — Yeni kullanıcının ilk deneyimi:
//   - "Başlarken" kontrol listesi (ayarlar/baslarken.mjs): yedi adımın durumu projenin verisinden hesaplanır (✓ / sıradaki),
//     "girişe gerek yok" / "gizle" / "incelendi" işaretleri kasada (şifreli) proje başına saklanır.
//   - Arayüz (baslarken.js): Sonuçlar > Genel > Özet'te liste; adımlar tek tıkla ilgili ekranı açar; "Gizle" sunucuda saklanır
//     (yeniden yüklemede de gizli), Ayarlar > Arayüz geri getirir; tamamlanınca kaybolur. 1440 / 390 px taşma yok.
//   - İlk kurulum sihirbazı: son adımda "Sıradaki: giriş tarifini kaydet"; bitince genel tanıtım kendiliğinden açılır, kapatılabilir.
// Güvenlik: geçici veritabanı + ayrı Nöbetçi (127.0.0.1); DNS kapalı tarayıcı; dış istek yok. İLK_KULLANIM_EKRAN_KLASORU verilirse
// ekran görüntüleri (sahte veri) oraya yazılır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { baslarkenDurumu, baslarkenIsaretle } from '../../scripts/platform/ayarlar/baslarken.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ornekBasvuruModeli, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const EKRAN_KLASORU = process.env.ILK_KULLANIM_EKRAN_KLASORU;
const durumlar = (d: { adimlar: Array<{ anahtar: string; durum: string }> }) => Object.fromEntries(d.adimlar.map((a) => [a.anahtar, a.durum]));

test('saf: Başlarken adımları veriden hesaplanır; sıradaki ilk eksik adım; işaretler proje başına, kasada şifreli', async () => {
  const klasor = geciciKlasor('baslarken-saf');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, `Gecici-Baslarken-${randomBytes(4).toString('hex')}`, { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
    const digerId = projeKaydet(vt, { ad: 'Diğer Proje' });
    let d = baslarkenDurumu(vt, projeId);
    expect(d.adimlar.map((a) => a.anahtar)).toEqual(['ortam', 'giris', 'ekran', 'senaryo', 'dene', 'kosu', 'sonuc']);
    expect(durumlar(d)).toEqual({ ortam: 'siradaki', giris: 'bekliyor', ekran: 'bekliyor', senaryo: 'bekliyor', dene: 'bekliyor', kosu: 'bekliyor', sonuc: 'bekliyor' });
    expect(d).toMatchObject({ gizli: false, tamam: false, tamamlanan: 0, toplam: 7 });

    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    d = baslarkenDurumu(vt, projeId);
    expect(durumlar(d)).toMatchObject({ ortam: 'tamam', giris: 'siradaki', ekran: 'bekliyor' });
    const giris = d.adimlar.find((a) => a.anahtar === 'giris')!;
    expect(giris).toMatchObject({ adres: `#/ayarlar/giris/tarif/${ortamId}`, atlanabilir: true, atlandi: false });
    // "Girişe gerek yok": adım tamam sayılır (geri alınabilir); başka projeyi etkilemez.
    expect(baslarkenIsaretle(vt, projeId, { girisGerekmez: true }).girisGerekmez).toBe(true);
    expect(durumlar(baslarkenDurumu(vt, projeId))).toMatchObject({ giris: 'tamam', ekran: 'siradaki' });
    expect(baslarkenDurumu(vt, digerId).adimlar[0].durum).toBe('siradaki');
    baslarkenIsaretle(vt, projeId, { girisGerekmez: false });
    girisTarifiKaydet(vt, projeId, ortamId, ornekGirisTarifi());
    d = baslarkenDurumu(vt, projeId);
    expect(durumlar(d)).toMatchObject({ giris: 'tamam', ekran: 'siradaki' });
    expect(d.adimlar.find((a) => a.anahtar === 'giris')!.atlanabilir).toBeUndefined();

    // Ortak akış ilk ekran sayılmaz; modelli ekran sayılır.
    const ortakId = ekranKaydet(vt, { projeId, anahtar: 'ortak-onay', ad: 'Onay (ortak)' });
    ekranModeliEkle(vt, { ekranId: ortakId, model: { semaSurumu: 2, tur: 'ortakAkis', id: 'ortak-onay', ad: 'Onay', adimlar: [] } });
    expect(durumlar(baslarkenDurumu(vt, projeId)).ekran).toBe('siradaki');
    const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
    ekranModeliEkle(vt, { ekranId, model: ornekBasvuruModeli() });
    d = baslarkenDurumu(vt, projeId);
    expect(durumlar(d)).toMatchObject({ ekran: 'tamam', senaryo: 'siradaki' });
    expect(d.adimlar.find((a) => a.anahtar === 'senaryo')!.adres).toBe(`#/senaryolar/yeni/${ekranId}`);

    const senaryoId = senaryoKaydet(vt, { projeId, ekranId, baslik: 'Örnek senaryo', icerik: {} });
    d = baslarkenDurumu(vt, projeId);
    expect(durumlar(d)).toMatchObject({ senaryo: 'tamam', dene: 'siradaki' });
    expect(d.adimlar.find((a) => a.anahtar === 'dene')!.adres).toBe(`#/senaryolar/duzenle/${senaryoId}`);
    // Dene: sunucu işareti (POST /platform/senaryo/dene) ya da herhangi bir koşu.
    baslarkenIsaretle(vt, projeId, { denendi: true });
    expect(durumlar(baslarkenDurumu(vt, projeId))).toMatchObject({ dene: 'tamam', kosu: 'siradaki' });
    const kosuId = randomUUID();
    kosuKaydet(vt, { id: kosuId, projeId, ortamId, tur: 'tam', kapsam: 'Genel' });
    d = baslarkenDurumu(vt, projeId);
    expect(durumlar(d)).toMatchObject({ kosu: 'tamam', sonuc: 'siradaki' });
    expect(d.adimlar.find((a) => a.anahtar === 'sonuc')!.adres).toBe(`#/sonuclar/kosu/${kosuId}`);
    baslarkenIsaretle(vt, projeId, { incelendi: true });
    expect(baslarkenDurumu(vt, projeId)).toMatchObject({ tamam: true, tamamlanan: 7 });

    // Gizle / doğrulama / şifreli saklama.
    expect(baslarkenIsaretle(vt, digerId, { gizli: true }).gizli).toBe(true);
    expect(baslarkenDurumu(vt, digerId).gizli).toBe(true);
    expect(baslarkenDurumu(vt, projeId).gizli).toBe(false);
    expect(() => baslarkenIsaretle(vt, projeId, { gizli: 'evet' })).toThrow('true ya da false');
    expect(() => baslarkenIsaretle(vt, randomUUID(), { gizli: true })).toThrow('Proje bulunamadı');
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'baslarken'")?.deger_json)).toMatch(/^kasa:v1:/);
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

test.describe('Başlarken listesi (arayüz)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Baslarken-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'baslarken-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0', TEST_SUNUCU_KOSU_KAPALI: '1' });
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfa(genislik = 1440): Promise<{ page: Page; istekler: string[]; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 }, reducedMotion: 'reduce' });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, istekler, hatalar };
  }
  const kart = (page: Page) => page.locator('section.baslarken-karti');
  const adim = (page: Page, anahtar: string) => kart(page).locator(`li.baslarken-adimi[data-adim="${anahtar}"]`);
  const disariIstekYok = (istekler: string[]) => expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);

  /** Taşma: sayfa yatay taşmaz; kartın görünür öğeleri kartın içinde kalır; etkileşimli öğeler birbirine binmez. */
  async function tasmaYok(page: Page, secici: string): Promise<void> {
    const sorunlar = await page.evaluate((s) => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('sayfa yatay taşıyor');
      for (const k of document.querySelectorAll(s)) {
        const kr = k.getBoundingClientRect();
        for (const c of k.querySelectorAll('*')) {
          const r = c.getBoundingClientRect();
          if (!r.width || !r.height || c.closest('details:not([open]) > :not(summary)')) continue;
          if (r.left < kr.left - 1 || r.right > kr.right + 1) out.push(`taşan: ${c.tagName.toLowerCase()}.${[...c.classList].join('.')} "${(c.textContent || '').trim().slice(0, 30)}"`);
        }
        const etk = [...k.querySelectorAll('a[href], button')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => [e, e.getBoundingClientRect()] as const);
        for (let i = 0; i < etk.length; i++) for (let j = i + 1; j < etk.length; j++) {
          const [a, ra] = etk[i]; const [b, rb] = etk[j];
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (x > 2 && y > 2 && !a.contains(b) && !b.contains(a)) out.push(`binen: ${(a.textContent || '').trim()} ∩ ${(b.textContent || '').trim()}`);
        }
      }
      return out.slice(0, 10);
    }, secici);
    expect(sorunlar).toEqual([]);
  }

  test('Özet: durumlar veriden (ortam ✓, giriş sıradaki); adım tek tıkla ilgili ekranı açar; "Girişe gerek yok" geri alınır', async () => {
    const { page, istekler, hatalar } = await sayfa();
    await page.goto('/#/sonuclar/ozet');
    await expect(kart(page)).toBeVisible();
    await expect(kart(page).getByRole('heading', { name: 'Başlarken' })).toBeVisible();
    await expect(kart(page).locator('li.baslarken-adimi')).toHaveCount(7);
    await expect(kart(page).locator('li.baslarken-adimi b')).toHaveText([/^Ortam ekle/, /^Giriş tarifi/, /^İlk ekranı ekle/, /^İlk senaryo/, /^Dene/, /^Koşuyu başlat/, /^Sonuçları incele/]);
    await expect(adim(page, 'ortam')).toHaveAttribute('data-durum', 'tamam');
    await expect(adim(page, 'giris')).toHaveAttribute('data-durum', 'siradaki');
    await expect(adim(page, 'giris')).toHaveAttribute('aria-current', 'step');
    await expect(adim(page, 'ekran')).toHaveAttribute('data-durum', 'bekliyor');
    await expect(kart(page).locator('.baslarken-sayac')).toHaveText('1 / 7');
    await expect(kart(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    // Sıradaki adımın düğmesi birincil ve giriş tarifi formuna götürür.
    const girisDugmesi = adim(page, 'giris').getByRole('link', { name: 'Girişi kaydet — Giriş tarifi' });
    await expect(girisDugmesi).toHaveClass(/birincil/);
    await expect(girisDugmesi).toHaveAttribute('href', `#/ayarlar/giris/tarif/${ortamId}`);
    await expect(adim(page, 'ekran').getByRole('link', { name: 'Ekran ekle — İlk ekranı ekle' })).toHaveAttribute('href', '#/ekranlar/yeni');
    if (EKRAN_KLASORU) { mkdirSync(EKRAN_KLASORU, { recursive: true }); await page.screenshot({ path: join(EKRAN_KLASORU, 'baslarken-ozet-1440.png'), fullPage: true }); }
    // "Girişe gerek yok": giriş ✓ (atlandı), sıradaki ilk ekran; sunucuda saklanır; "Geri al" döndürür.
    await adim(page, 'giris').getByRole('button', { name: 'Girişe gerek yok' }).click();
    await expect(adim(page, 'giris')).toHaveAttribute('data-durum', 'tamam');
    await expect(adim(page, 'ekran')).toHaveAttribute('data-durum', 'siradaki');
    expect(durumlar((await nobetciApi(nobetci, `/platform/baslarken?projeId=${projeId}`)).baslarken as { adimlar: Array<{ anahtar: string; durum: string }> }))
      .toMatchObject({ giris: 'tamam', ekran: 'siradaki' });
    await adim(page, 'giris').getByRole('button', { name: 'Geri al' }).click();
    await expect(adim(page, 'giris')).toHaveAttribute('data-durum', 'siradaki');
    // Tek tıkla ilgili ekran: İlk ekranı ekle → Ekran ekle sayfası.
    await adim(page, 'ekran').getByRole('link', { name: 'Ekran ekle — İlk ekranı ekle' }).click();
    await expect(page).toHaveURL(/#\/ekranlar\/yeni$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Ekran ekle' })).toBeVisible();
    // Ekran ekle: önde tara / kaydet, "İleri düzey" kapalı.
    await expect(page.locator('details.ileri-duzey')).not.toHaveAttribute('open', '');
    await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3')).toHaveText(['Ekranı tara', 'Akışı kaydet']);
    if (EKRAN_KLASORU) {
      await page.screenshot({ path: join(EKRAN_KLASORU, 'ekran-ekle-kapali.png'), fullPage: true });
      await page.locator('details.ileri-duzey > summary').click();
      await page.screenshot({ path: join(EKRAN_KLASORU, 'ekran-ekle-ileri-duzey-acik.png'), fullPage: true });
      await page.goto('/#/ekranlar');
      await expect(page.locator('.kesif-seridi')).toBeVisible();
      await page.screenshot({ path: join(EKRAN_KLASORU, 'ekranlar-bos.png'), fullPage: true });
    }
    // Genel > Ekranlar (ilk açılış görünümü) da tam koşu yokken listeyi gösterir.
    await page.goto('/#/sonuclar');
    await expect(kart(page)).toBeVisible();
    expect(hatalar).toEqual([]);
    disariIstekYok(istekler);
    await page.context().close();
  });

  test('1440 ve 390 px: liste taşmaz, düğmeler binmez', async () => {
    for (const genislik of [1440, 390]) {
      const { page, hatalar } = await sayfa(genislik);
      await page.goto('/#/sonuclar/ozet');
      await expect(kart(page).locator('li.baslarken-adimi')).toHaveCount(7);
      await page.waitForTimeout(150);
      await tasmaYok(page, 'section.baslarken-karti');
      if (EKRAN_KLASORU) await page.screenshot({ path: join(EKRAN_KLASORU, `baslarken-ozet-${genislik}.png`), fullPage: genislik === 390 });
      expect(hatalar).toEqual([]);
      await page.context().close();
    }
  });

  test('Gizle: sunucuda saklanır (yeniden yüklemede gizli, tarayıcı deposu değil); Ayarlar > Arayüz geri getirir', async () => {
    const { page, istekler, hatalar } = await sayfa();
    await page.goto('/#/sonuclar/ozet');
    await expect(kart(page)).toBeVisible();
    await kart(page).getByRole('button', { name: 'Gizle' }).click();
    await expect(kart(page)).toHaveCount(0);
    await expect(page.getByText('Başlarken listesi gizlendi.')).toBeVisible();
    expect(((await nobetciApi(nobetci, `/platform/baslarken?projeId=${projeId}`)).baslarken as { gizli: boolean }).gizli).toBe(true);
    // Yeni tarayıcı bağlamında (boş yerel depo) da gizli: karar sunucuda.
    const yeni = await sayfa();
    await yeni.page.goto('/#/sonuclar/ozet');
    await expect(yeni.page.locator('.ozet-kutulari a.ozet-kutusu')).toHaveCount(3);
    await expect(kart(yeni.page)).toHaveCount(0);
    await yeni.page.context().close();
    // Ayarlar > Arayüz > "Başlarken listesini yeniden göster".
    await page.goto('/#/ayarlar/arayuz');
    await page.getByRole('button', { name: 'Başlarken listesini yeniden göster' }).click();
    await expect(page.getByText('Başlarken listesi Sonuçlar > Genel > Özet\'te yeniden görünecek.')).toBeVisible();
    await page.goto('/#/sonuclar/ozet');
    await expect(kart(page)).toBeVisible();
    expect(hatalar).toEqual([]);
    disariIstekYok(istekler);
    await page.context().close();
  });
});

test('tamamlanınca kaybolur: tarif + ekran + senaryo + tam koşu verisiyle 6 / 7, sıradaki "Sonuçları incele"; koşuyu açınca liste gider; tam koşulu projede Genel > Ekranlar göstermez', async () => {
  test.setTimeout(120_000);
  const klasor = mkdtempSync(join(tmpdir(), 'baslarken-tamam-'));
  const vtYolu = join(klasor, 'platform.db');
  const parola = `Gecici-Baslarken-${randomBytes(6).toString('hex')}`;
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
  girisTarifiKaydet(vt, projeId, ortamId, ornekGirisTarifi());
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
  ekranModeliEkle(vt, { ekranId, model: ornekBasvuruModeli() });
  senaryoKaydet(vt, { projeId, ekranId, baslik: 'Örnek senaryo', icerik: {} });
  kosuKaydet(vt, { id: randomUUID(), projeId, ortamId, tur: 'tam', kapsam: 'Genel' });
  vt.kapat();
  const nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0', TEST_SUNUCU_KOSU_KAPALI: '1' });
  const tarayici = await korumaliTarayici();
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola })).basarili).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const kart = page.locator('section.baslarken-karti');
    await page.goto('/#/sonuclar/ozet');
    await expect(kart.locator('li[data-adim="sonuc"]')).toHaveAttribute('data-durum', 'siradaki');
    await expect(kart.locator('li[data-durum="tamam"]')).toHaveCount(6);
    await expect(kart.locator('.baslarken-sayac')).toHaveText('6 / 7');
    // Tam koşusu olan projede Genel > Ekranlar listeyi göstermez (yalnız Özet'te kalır).
    await page.goto('/#/sonuclar');
    await expect(page.locator('.sonuc-sekmeleri')).toBeVisible();
    await expect(page.locator('.sonuc-icerik > .sayfa-basligi')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(kart).toHaveCount(0);
    await page.goto('/#/sonuclar/ozet');
    await kart.locator('li[data-adim="sonuc"]').getByRole('link', { name: 'Son koşuyu aç — Sonuçları incele' }).click();
    await expect(page).toHaveURL(/#\/sonuclar\/kosu\//);
    await expect.poll(async () => ((await nobetciApi(nobetci, `/platform/baslarken?projeId=${projeId}`)).baslarken as { tamam: boolean }).tamam).toBe(true);
    await page.goto('/#/sonuclar/ozet');
    await expect(page.locator('.ozet-kutulari a.ozet-kutusu')).toHaveCount(3);
    await expect(kart).toHaveCount(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});

test('ilk kurulum: son adımda "Sıradaki: giriş tarifini kaydet"; bitince genel tanıtım kendiliğinden açılır, kapatılır ve görüldü sayılır; ana sayfa Özet + Başlarken', async () => {
  test.setTimeout(180_000);
  const bosKlasor = mkdtempSync(join(tmpdir(), 'ilk-kullanim-kurulum-'));
  const bos = await nobetciBaslat(bosKlasor, join(bosKlasor, 'platform.db'), {});
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: bos.adres, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    // Otomatik sürülen tarayıcıda rehberler yalnız açıkça istenince açılır (rehber.js > otomatikIzinli).
    await baglam.addInitScript(() => localStorage.setItem('nobetci-rehber-otomatik', '1'));
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const parola = `Gecici-Kurulum-${randomBytes(6).toString('hex')}`;
    await page.goto('/');
    await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
    // Giriş profilinin ayrıntısı sorulmaz; yalnız isteğe bağlı "giriş istiyor mu?" sorusu (kendi adımı).
    await expect(page.locator('.adimlar li')).toHaveText([/^Kasa parolası/, 'Proje', 'Ortamlar', 'İzinler', 'Kullanım', 'Giriş', 'Tamam']);
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(parola);
    await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(parola);
    await page.getByText('Parolayı unutursam').click();
    await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
    await page.getByLabel('Proje adı').fill('Örnek Proje');
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByLabel('Adres (link)').first().fill('http://127.0.0.1:9/');
    await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
    await page.getByRole('button', { name: 'Atla' }).click();
    // Kullanım: Gelişmiş (bu test bugünkü arayüzün genel tanıtımını denetler).
    await page.getByRole('radio', { name: /^Gelişmiş — tüm özellikler/ }).check();
    await page.getByRole('button', { name: 'Devam' }).click();
    // Giriş sorusu: varsayılan "sonra karar vereceğim" → bugünkü davranış.
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
    // Sıradaki: giriş tarifini kaydet (zorunlu adım değil) — varsayılan ortamın tarif formuna götürür.
    const siradaki = page.locator('.siradaki-adim');
    await expect(siradaki).toContainText('Sıradaki: giriş tarifini kaydet.');
    await expect(siradaki.getByRole('link', { name: 'Girişi kaydet' })).toHaveAttribute('href', /^#\/ayarlar\/giris\/tarif\/[0-9a-f-]{36}$/);
    // Tanıtım sihirbaz ekranında açılmaz; ana düzene geçince açılır.
    await page.waitForTimeout(900);
    const rehber = page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
    await expect(rehber).toHaveCount(0);
    if (EKRAN_KLASORU) { mkdirSync(EKRAN_KLASORU, { recursive: true }); await page.screenshot({ path: join(EKRAN_KLASORU, 'kurulum-proje-hazir.png'), fullPage: true }); }
    await page.getByRole('button', { name: 'Ana sayfaya geç' }).click();
    await expect(page).toHaveURL(/#\/sonuclar\/ozet$/);
    await expect(rehber.getByRole('heading', { name: "Nöbetçi'ye hoş geldiniz" })).toBeVisible({ timeout: 10_000 });
    await expect(rehber.locator('.rehber-sayac')).toHaveText('1 / 5');
    if (EKRAN_KLASORU) await page.screenshot({ path: join(EKRAN_KLASORU, 'kurulum-genel-tanitim.png') });
    // Kullanıcı kapatabilir; kapatılan tanıtım görüldü sayılır ve yeniden yüklemede açılmaz.
    await rehber.getByRole('button', { name: 'Rehberi kapat' }).click();
    await expect(rehber).toHaveCount(0);
    await expect.poll(async () => ((await nobetciApi(bos, '/platform/rehber')) as { rehber: { gorulenler: string[] } }).rehber.gorulenler).toContain('genel');
    // Ana sayfa: Başlarken listesi (ortam ✓, sıradaki giriş).
    const kart = page.locator('section.baslarken-karti');
    await expect(kart).toBeVisible();
    await expect(kart.locator('li[data-adim="ortam"]')).toHaveAttribute('data-durum', 'tamam');
    await expect(kart.locator('li[data-adim="giris"]')).toHaveAttribute('data-durum', 'siradaki');
    if (EKRAN_KLASORU) await page.screenshot({ path: join(EKRAN_KLASORU, 'kurulum-ana-sayfa-baslarken.png'), fullPage: true });
    // Ayarlar'daki "Genel tanıtımı şimdi aç" aynen durur.
    await page.goto('/#/ayarlar/arayuz');
    await expect(page.getByRole('button', { name: 'Genel tanıtımı şimdi aç' })).toBeVisible();
    await page.waitForTimeout(900);
    await expect(rehber.getByRole('heading', { name: "Nöbetçi'ye hoş geldiniz" })).toHaveCount(0);
    expect(hatalar).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(bos.adres) && !u.startsWith('data:'))).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
    bos.surec.kill('SIGTERM');
    rmSync(bosKlasor, { recursive: true, force: true });
  }
});
