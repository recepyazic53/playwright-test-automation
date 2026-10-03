// UÇTAN UCA (yerel) — KOŞU PANELİNDE CANLI AKIŞ: gerçek Nöbetçi sunucusu, gerçek model koşusu (ayrı "playwright test" süreci) ve
// 127.0.0.1'deki örnek başvuru fikstürü. Fikstürün her sayfasına animasyonlu bir kutu eklenir ve form sayfası 25 sn "yükleniyor" kalır
// (koşu izlenecek kadar sürsün). Sınananlar: panelde kareler sürekli gelir ve güncellenir (kare hızı / gecikme ölçülür), "Canlı"
// göstergesi ve son kare zamanı, "Büyüt", görünmez koşuda "Tarayıcıyı göster" iletisi, panel küçülünce akış bağlantısının kesilmesi,
// akış kurulamazsa aralıklı görüntüye düşme (not ile), "Tarayıcı penceresinde izle" seçiminin koşu isteğine geçmesi, 1440 / 390 px
// taşma yok. Gerçek siteye istek yok; tarayıcı yalnız 127.0.0.1'e çözümler. Ekran görüntüleri CANLI_EKRAN_KLASORU'na (yoksa test çıktısına).
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturUygulamasi } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
const PAROLA = `Gecici-Canli-${randomBytes(6).toString('hex')}`;
const BASLIK = 'Merkez / indirim alanı atlanır';
const GORUNMEZ_ILETI = 'Bu koşu görünmez başladı; pencerede izlemek için koşuyu ‘Tarayıcı penceresinde izle’ ile yeniden başlatın.';
/** Fikstür sayfalarına eklenen animasyon (yalnız görüntü; metin yok). */
const ANIMASYON = '<div aria-hidden="true" style="position:fixed;right:16px;bottom:16px;width:48px;height:48px;background:linear-gradient(45deg,#e33,#33e);animation:canliFiksturDon .8s linear infinite"></div><style>@keyframes canliFiksturDon{to{transform:rotate(360deg)}}</style>';

let nobetci: Nobetci;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ekranId = '';
let tarayici: Browser;
let page: Page;
/** Form sayfası yavaş yanıtlansın mı (koşu izlenecek kadar sürsün). */
let yavas = true;
/** Nöbetçi arayüzü dışına giden istekler (olmamalı). */
const disIstekler: string[] = [];
/** Panelin açtığı canlı akış adresleri (kosuId buradan okunur). */
const akisIstekleri: string[] = [];
const EKRAN = process.env.CANLI_EKRAN_KLASORU;

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}
async function goruntu(ad: string, hedef?: { screenshot: (o: { path: string }) => Promise<unknown> }): Promise<void> {
  const yol = join(EKRAN ?? test.info().outputPath(), `${ad}.png`);
  await (hedef ?? page).screenshot({ path: yol });
}
const tasma = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Elemanın sağ / sol kenarı pencere içinde mi. */
const pencereIcinde = (sec: string): Promise<boolean> => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return Boolean(r && r.left >= -1 && r.right <= window.innerWidth + 1);
}, sec);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (EKRAN) mkdirSync(EKRAN, { recursive: true });
  klasor = mkdtempSync(join(tmpdir(), 'canli-akis-arayuz-'));
  const uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  const isle: FiksturUygulamasi = (i) => {
    let y = uygulama.isle(i);
    // Yavaş betik: form sayfası açılır ve animasyon çizilir, ama sayfa 25 sn "yükleniyor" kalır (bekleyen gezinmede Chrome eski
    // sayfayı dondurur; bu yüzden gecikme yanıtta değil, sayfanın sonundaki betikte).
    if (i.yol === '/yavas.js') return { tur: 'text/javascript', govde: '', gecikmeMs: 25_000 };
    const yavasBetik = yavas && i.yontem === 'GET' && i.yol.startsWith('/basvuru') ? '<script src="/yavas.js"></script>' : '';
    if ((y.tur ?? '').startsWith('text/html')) y = { ...y, govde: y.govde.replace('</body>', `${ANIMASYON}${yavasBetik}</body>`) };
    return y;
  };
  fikstur = await yerelSunucu(isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu);
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Canlı Akış Projesi' })).proje as Nesne).id);
  const ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', {
    projeId, ortamId, ad: 'TEST kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [2], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as unknown as { ekranlar: Array<{ id: string; ad: string }>; senaryolar: Array<{ id: string; baslik: string }> };
  ekranId = liste.ekranlar.find((e) => e.ad === 'Örnek Başvuru')?.id ?? '';
  const senaryo = liste.senaryolar.find((s) => s.baslik === BASLIK);
  expect(senaryo).toBeTruthy();
  await basarili('/platform/senaryo/kosuya-dahil', { projeId, idler: [senaryo?.id], dahil: true });
  tarayici = await korumaliTarayici();
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  page = await baglam.newPage();
  // Nöbetçi arayüzü dışına istek gitmez (fikstüre koşu sürecinin tarayıcısı gider, bu sayfa değil).
  baglam.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(nobetci.adres) && !u.startsWith('data:')) disIstekler.push(u);
    if (u.includes('/canli-akis?')) akisIstekleri.push(u);
  });
});

test.afterAll(async () => {
  expect(disIstekler).toEqual([]);
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Senaryolar listesinden koşuyu başlatır; onay penceresindeki "Tarayıcı penceresinde izle" seçimi istenen değere getirilir. */
async function kosuyuBaslat(gorunur = false): Promise<void> {
  await page.goto(`/#/senaryolar/u/${encodeURIComponent(ekranId)}`);
  // "Koşuyu başlat" her zaman onay penceresi açar (tek senaryo ▷ tek Test ortamında sormadan, Ayarlar varsayılanıyla başlar).
  await page.getByRole('button', { name: 'Koşuyu başlat', exact: true }).click();
  const onay = page.locator('dialog[open]');
  await expect(onay).toBeVisible();
  const secim = onay.getByRole('checkbox', { name: /^Tarayıcı penceresinde izle \(görünür\)/ });
  await expect(secim).not.toBeChecked(); // Ayarlar > Koşu varsayılanı: kapalı
  if (gorunur) await secim.check();
  await onay.locator('.diyalog-alt button.birincil').click();
}
const panel = () => page.getByRole('region', { name: 'Canlı koşu paneli' });
async function paneliKapat(): Promise<void> {
  const k = page.getByRole('button', { name: 'Paneli kapat' });
  if (await k.count()) await k.click();
}
async function kosuBitsin(): Promise<void> {
  await expect(panel().locator('.kosu-listesi li').first()).toContainText(/Başarılı|Başarısız|Çalıştırılamadı/, { timeout: 150_000 });
}

test('koşu paneli: sürekli kare akışı (kare hızı / gecikme), Canlı göstergesi, son kare zamanı, Büyüt, Tarayıcıyı göster iletisi, 1440 / 390 px', async ({}, testInfo) => {
  test.setTimeout(240_000);
  yavas = true;
  await kosuyuBaslat(false);
  const kutu = panel().locator('.canli-akis');
  await expect(kutu).toHaveAttribute('data-durum', 'akis', { timeout: 60_000 });
  await expect(kutu.locator('.canli-akis-gostergesi')).toHaveText('Canlı');
  await expect(kutu.locator('img.canli-akis-karesi')).toBeVisible();
  // Ölçüm: 3 sn'de gelen kare sayısı ve ortalama gecikme (kare yakalanma anı → panelde gösterilme).
  const sayi = async () => Number(await kutu.getAttribute('data-kare-sayisi'));
  const once = await sayi();
  const ilkSrc = await kutu.locator('img.canli-akis-karesi').getAttribute('src');
  await page.waitForTimeout(3_000);
  const sonra = await sayi();
  const hiz = (sonra - once) / 3;
  const gecikme = Number(await kutu.getAttribute('data-ort-gecikme-ms'));
  testInfo.annotations.push({ type: 'ölçüm', description: `panel: ${hiz.toFixed(1)} kare/sn, ort. gecikme ${gecikme} ms` });
  console.log(`[panel canlı akış ölçümü] ${hiz.toFixed(1)} kare/sn, ort. gecikme ${gecikme} ms`);
  expect(hiz).toBeGreaterThanOrEqual(5);
  expect(gecikme).toBeLessThan(500);
  expect(await kutu.locator('img.canli-akis-karesi').getAttribute('src')).not.toBe(ilkSrc); // görüntü güncellendi
  expect(ilkSrc).toMatch(/^data:image\/jpeg;base64,/);
  await expect(kutu.locator('.canli-akis-zamani')).toHaveText(/^Son kare \d{2}:\d{2}:\d{2}$/);
  expect(await tasma()).toBeLessThanOrEqual(0);
  await goruntu('01-kosu-paneli-canli-akis-1440', panel());

  // Görünmez koşu: "Tarayıcıyı göster" açık ileti verir (koşan başsız tarayıcı görünür yapılamaz).
  await kutu.getByRole('button', { name: 'Tarayıcıyı göster' }).click();
  await expect(kutu.locator('.canli-akis-notu')).toContainText(GORUNMEZ_ILETI);

  // Büyüt: büyük pencerede aynı akış; Esc ile kapanır, görüntü kutuya döner.
  await kutu.getByRole('button', { name: 'Canlı görüntüyü büyüt' }).click();
  const buyuk = page.locator('dialog.canli-akis-buyuk[open]');
  await expect(buyuk).toBeVisible();
  await expect(buyuk.locator('img.canli-akis-karesi')).toBeVisible();
  const buyukOnce = await sayi();
  await expect.poll(sayi, { timeout: 10_000 }).toBeGreaterThan(buyukOnce + 3);
  await goruntu('02-canli-akis-buyut-1440');
  await page.keyboard.press('Escape');
  await expect(buyuk).toHaveCount(0);
  await expect(kutu.locator('img.canli-akis-karesi')).toBeVisible();

  // 390 px: panel ve kutu pencereye sığar, yatay kaydırma yok; çubuk sarılır.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  expect(await tasma()).toBeLessThanOrEqual(0);
  expect(await pencereIcinde('.kosu-paneli .canli-akis')).toBe(true);
  expect(await pencereIcinde('.kosu-paneli .canli-akis-buyut')).toBe(true);
  await goruntu('03-kosu-paneli-canli-akis-390', panel());
  await kutu.getByRole('button', { name: 'Canlı görüntüyü büyüt' }).click();
  await expect(buyuk).toBeVisible();
  expect(await pencereIcinde('dialog.canli-akis-buyuk')).toBe(true);
  await goruntu('04-canli-akis-buyut-390');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Panel küçülünce akış bağlantısı kesilir (izleyici kalmaz → test sürecindeki screencast durur); açılınca yeniden bağlanır.
  // Kanıt (uçtan uca): screencast yayındayken koşu sürecinin aralıklı PNG yedeği YAZILMAZ (aynı kare kalır); izleyici gidince
  // screencast durur ve yedek yeniden yazılmaya başlar (animasyonlu sayfa → kare değişir).
  const kosuId = new URL(akisIstekleri[akisIstekleri.length - 1], nobetci.adres).searchParams.get('kosuId') ?? '';
  const yedekKare = async (): Promise<string> => {
    const r = await fetch(`${nobetci.adres}/canli?kosuId=${encodeURIComponent(kosuId)}`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } });
    return r.status === 200 ? createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') : `durum-${r.status}`;
  };
  await expect.poll(async () => { const x = await yedekKare(); await page.waitForTimeout(1_500); return x === (await yedekKare()); }, { timeout: 15_000 }).toBe(true);
  await panel().getByRole('button', { name: 'Paneli küçült' }).click();
  await expect(page.locator('.canli-akis')).toHaveCount(0);
  await expect.poll(async () => { const x = await yedekKare(); await page.waitForTimeout(1_200); return x !== (await yedekKare()); }, { timeout: 15_000 }).toBe(true);
  const yeniBaglanti = page.waitForRequest((r) => r.url().includes('/canli-akis?'));
  await page.locator('.kosu-hapi').click();
  await yeniBaglanti;
  await kosuBitsin();
  await expect(panel().locator('.canli-akis')).toHaveCount(0); // koşu bitince kutu kalkar, sonuç görünür
});

/** Büyük penceredeki karenin GÖRÜNEN içeriği (object-fit: contain) görüntü alanının, pencerenin ve tarayıcı penceresinin içinde mi. */
const buyukSigiyor = (): Promise<{ icinde: boolean; kaydirma: boolean; kaplama: number; ayrinti: string }> => page.evaluate(() => {
  const d = document.querySelector('dialog.canli-akis-buyuk[open]') as HTMLDialogElement;
  const img = d.querySelector('img.canli-akis-karesi') as HTMLImageElement;
  const alan = d.querySelector('.canli-akis-alani') as HTMLElement;
  const r = img.getBoundingClientRect();
  const o = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const [w, hh] = [img.naturalWidth * o, img.naturalHeight * o];
  const icerik = { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hh) / 2, right: r.left + (r.width + w) / 2, bottom: r.top + (r.height + hh) / 2 };
  const a = alan.getBoundingClientRect();
  const p = d.getBoundingClientRect();
  const ic = (x: { left: number; top: number; right: number; bottom: number }, y: { left: number; top: number; right: number; bottom: number }) =>
    x.left >= y.left - 1 && x.top >= y.top - 1 && x.right <= y.right + 1 && x.bottom <= y.bottom + 1;
  const pencere = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  return {
    icinde: img.naturalWidth > 0 && ic(icerik, a) && ic(a, p) && ic(p, pencere),
    kaydirma: d.scrollHeight > d.clientHeight + 1 || alan.scrollHeight > alan.clientHeight + 1,
    kaplama: (p.width * p.height) / (window.innerWidth * window.innerHeight),
    ayrinti: JSON.stringify({ icerik, a, p, pencere, n: [img.naturalWidth, img.naturalHeight] })
  };
});

test('Büyüt: ekranı kaplar, kare tamamen sığar (1440×900 / 390×844), yüksek çözünürlük istenir; "Sayfanın tamamı" anlık görüntüsü ve "Canlıya dön"; diske yazılmaz', async () => {
  test.setTimeout(240_000);
  yavas = true;
  await paneliKapat();
  await page.setViewportSize({ width: 1440, height: 900 });
  await kosuyuBaslat(false);
  const kutu = panel().locator('.canli-akis');
  await expect(kutu).toHaveAttribute('data-durum', 'akis', { timeout: 60_000 });
  const kucukIstek = akisIstekleri[akisIstekleri.length - 1];
  const kucukEn = Number(new URL(kucukIstek, nobetci.adres).searchParams.get('en'));
  expect(new URL(kucukIstek, nobetci.adres).searchParams.has('boy')).toBe(false);
  const baslangic = Date.now();

  // Büyüt: ekranın tamamı; daha yüksek çözünürlük (en + boy) istenir.
  const buyukIstek = page.waitForRequest((r) => r.url().includes('/canli-akis?') && r.url().includes('boy='));
  await kutu.getByRole('button', { name: 'Canlı görüntüyü büyüt' }).click();
  const buyuk = page.locator('dialog.canli-akis-buyuk[open]');
  await expect(buyuk).toBeVisible();
  const q = new URL((await buyukIstek).url()).searchParams;
  expect(Number(q.get('en'))).toBeGreaterThan(kucukEn);
  expect(Number(q.get('boy'))).toBeGreaterThan(400);
  const kareSayisi = async () => Number(await kutu.getAttribute('data-kare-sayisi'));
  const once = await kareSayisi();
  await expect.poll(kareSayisi, { timeout: 15_000 }).toBeGreaterThan(once + 3);
  await expect.poll(async () => (await buyukSigiyor()).icinde, { timeout: 10_000 }).toBe(true);
  let s = await buyukSigiyor();
  expect(s.kaydirma, s.ayrinti).toBe(false);
  expect(s.kaplama).toBeGreaterThan(0.95);
  await goruntu('06-buyut-tam-ekran-1440');

  // "Sayfanın tamamı": anlık görüntü (jpeg) gelir; "Anlık görüntü · saat" notu ve "Canlıya dön".
  const tamIstek = page.waitForResponse((r) => r.url().includes('/canli-tam-sayfa?'));
  await buyuk.getByRole('button', { name: 'Sayfanın tamamı' }).click();
  const tamYanit = await tamIstek;
  expect(tamYanit.status()).toBe(200);
  expect(tamYanit.headers()['content-type']).toMatch(/^image\/jpeg/);
  expect(tamYanit.request().url()).not.toContain('token');
  await expect(buyuk.locator('.canli-akis-tam-notu')).toHaveText(/^Anlık görüntü · \d{2}:\d{2}:\d{2}$/);
  const tamImg = buyuk.locator('img.canli-akis-tam-karesi');
  await expect(tamImg).toBeVisible();
  expect(await tamImg.getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);
  await expect(buyuk.locator('.canli-akis-alani')).toBeHidden();
  // Görüntü pencereye sığar (yatay taşma yok; çok uzunsa yalnız dikey kaydırma).
  const tam = await page.evaluate(() => {
    const a = document.querySelector('.canli-akis-tam-alani') as HTMLElement;
    const i = a.querySelector('img') as HTMLImageElement;
    const r = i.getBoundingClientRect();
    return { yatay: a.scrollWidth > a.clientWidth + 1, icinde: r.left >= -1 && r.right <= window.innerWidth + 1, n: i.naturalWidth };
  });
  expect(tam).toMatchObject({ yatay: false, icinde: true });
  expect(tam.n).toBeGreaterThan(0);
  await goruntu('07-sayfanin-tamami-1440');
  await buyuk.getByRole('button', { name: 'Canlıya dön' }).click();
  await expect(buyuk.locator('.canli-akis-tam-alani')).toBeHidden();
  await expect(buyuk.locator('img.canli-akis-karesi')).toBeVisible();
  await expect(buyuk.getByRole('button', { name: 'Sayfanın tamamı' })).toBeVisible();
  await expect(buyuk.locator('.canli-akis-tam-notu')).toHaveText('');

  // 390×844 (dikey, dar): pencere boyutu değişince kare yeniden sığar; yeni ölçü istenir.
  const yeniIstek = page.waitForRequest((r) => r.url().includes('/canli-akis?') && r.url().includes('boy='));
  await page.setViewportSize({ width: 390, height: 844 });
  await yeniIstek;
  await expect.poll(async () => (await buyukSigiyor()).icinde, { timeout: 10_000 }).toBe(true);
  s = await buyukSigiyor();
  expect(s.kaydirma, s.ayrinti).toBe(false);
  expect(s.kaplama).toBeGreaterThan(0.9);
  expect(await tasma()).toBeLessThanOrEqual(0);
  await goruntu('08-buyut-tam-ekran-390');
  await buyuk.getByRole('button', { name: 'Sayfanın tamamı' }).click();
  await expect(buyuk.locator('.canli-akis-tam-notu')).toHaveText(/^Anlık görüntü · /);
  await goruntu('09-sayfanin-tamami-390');
  await buyuk.getByRole('button', { name: 'Canlıya dön' }).click();

  // Kapanınca kutunun (küçük) ölçüsüne dönülür.
  const kucukDonus = page.waitForRequest((r) => r.url().includes('/canli-akis?') && !r.url().includes('boy='));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await expect(buyuk).toHaveCount(0);
  await kucukDonus;
  // Anlık görüntü diske yazılmadı (Nöbetçi veri klasöründe yeni görüntü dosyası yok).
  const yeniGoruntuler = (k: string): string[] => readdirSync(k, { withFileTypes: true }).flatMap((e) => {
    const y = join(k, e.name);
    if (e.isDirectory()) return yeniGoruntuler(y);
    return /\.(png|jpe?g)$/i.test(e.name) && statSync(y).mtimeMs >= baslangic ? [y] : [];
  });
  expect(yeniGoruntuler(klasor)).toEqual([]);
  await kosuBitsin();
});

test('akış kurulamazsa aralıklı görüntüye düşülür ve not gösterilir', async () => {
  test.setTimeout(240_000);
  yavas = true;
  // Sunucunun akışı "yedek" bildirir (Chromium dışı tarayıcıdaki gibi): kutu /canli aralıklı görüntüsüne geçer.
  await page.route('**/canli-akis?**', (r) => r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: durum\ndata: {"durum":"yedek","neden":"CDP yok (test)"}\n\n' }));
  try {
    await paneliKapat();
    await kosuyuBaslat(false);
    const kutu = panel().locator('.canli-akis');
    await expect(kutu).toHaveAttribute('data-durum', 'yedek', { timeout: 30_000 });
    await expect(kutu.locator('.canli-akis-gostergesi')).toHaveText('Aralıklı');
    await expect(kutu.locator('.canli-akis-notu')).toContainText('Sürekli akış kullanılamıyor; aralıklı görüntü gösteriliyor');
    await expect(kutu.locator('img.canli-akis-karesi')).toBeVisible({ timeout: 60_000 });
    expect(await kutu.locator('img.canli-akis-karesi').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    await goruntu('05-kosu-paneli-aralikli-yedek', panel());
    await kosuBitsin();
  } finally {
    await page.unroute('**/canli-akis?**');
  }
});

test('"Tarayıcı penceresinde izle" seçilirse koşu isteği gorunur: true taşır (pencere açılmadan doğrulanır)', async () => {
  // Koşu isteği yakalanır ve sahte yanıtla kapatılır: gerçek (görünür) tarayıcı açılmaz.
  let govde: Nesne | null = null;
  await page.route('**/platform/senaryolar/calistir', async (r) => {
    govde = r.request().postDataJSON() as Nesne;
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ basarili: true, durum: 'passed', sureMs: 1 }) });
  });
  try {
    await paneliKapat();
    await kosuyuBaslat(true);
    await expect.poll(() => govde, { timeout: 10_000 }).not.toBeNull();
    expect(govde).toMatchObject({ gorunur: true });
    await kosuBitsin();
    // Seçilmezse alan hiç gitmez (başsız).
    govde = null;
    await paneliKapat();
    await kosuyuBaslat(false);
    await expect.poll(() => govde, { timeout: 10_000 }).not.toBeNull();
    expect(govde).not.toHaveProperty('gorunur');
  } finally {
    await page.unroute('**/platform/senaryolar/calistir');
  }
});
