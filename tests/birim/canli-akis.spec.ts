// KORUMA TESTLERİ — CANLI AKIŞ (tests/support/canli-yayin.ts + scripts/platform/canli-akis.mjs): koşan tarayıcıdan CDP screencast
// kareleri yalnız bellekten, 127.0.0.1'deki anahtarlı uçtan ve sunucu vekilinden SSE ile gelir. Sınananlar: animasyonlu sahte sayfada
// birden çok kare (kare hızı ve gecikme ölçülür), izleyici gidince screencast'in durması, yeni sekmeye geçiş, Chromium dışı (CDP yok)
// yedek durumu, "Tarayıcıyı göster" (görünür koşuda bringToFront; görünmezde 409), anahtarsız istek reddi, diske kare yazılmaması,
// görünür koşu bayrağı (gövde → NOBETCI_GORUNUR → headless: false). Yalnız 127.0.0.1; dışarıya istek yok.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { canliYayinKur } from '../support/canli-yayin';
import { kosuGorunurMu } from '../support/kosu-ayarlari';
import { canliAkisiVekille, canliKanalaIstek, canliTamSayfaAl, duyuruOku } from '../../scripts/platform/canli-akis.mjs';
import { gorunurOrtami } from '../../scripts/platform/senaryolar/calistirma.mjs';

/** Animasyonlu sahte sayfa: dönen kutu (CSS) + her karede değişen sayaç (rAF). */
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Canlı akış fikstürü</title>
<style>body{margin:0;font:16px system-ui;background:#fff}#kutu{width:120px;height:120px;margin:40px;background:linear-gradient(45deg,#e33,#33e);animation:don 1s linear infinite}
@keyframes don{to{transform:rotate(360deg)}}</style></head><body><div id="kutu"></div><p id="sayac">0</p>
<script>let n=0;(function d(){document.getElementById('sayac').textContent=String(++n);requestAnimationFrame(d);})();</script></body></html>`;

type Olay = { ad: string; veri: Record<string, unknown>; alinma: number };

let sunucu: Server;
let adres = '';
let tarayici: Browser;
let klasor = '';

test.beforeAll(async () => {
  klasor = mkdtempSync(join(tmpdir(), 'canli-akis-'));
  sunucu = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url?.startsWith('/ikinci') ? SAYFA.replace('Canlı akış fikstürü', 'İkinci sekme') : SAYFA);
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  tarayici = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
});
test.afterAll(async () => {
  await tarayici?.close();
  sunucu?.closeAllConnections();
  await new Promise<void>((coz) => sunucu?.close(() => coz()));
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** SSE akışını okur; olaylar dizisine ekler. Dönen kes() bağlantıyı kapatır. */
function akisiOku(url: string, basliklar: Record<string, string> = {}): { olaylar: Olay[]; kes: () => void; bitti: Promise<void> } {
  const olaylar: Olay[] = [];
  const ac = new AbortController();
  const bitti = (async () => {
    const r = await fetch(url, { headers: basliklar, signal: ac.signal });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const okuyucu = r.body!.getReader();
    const cozucu = new TextDecoder();
    let tampon = '';
    for (;;) {
      const { value, done } = await okuyucu.read();
      if (done) return;
      tampon += cozucu.decode(value, { stream: true });
      let i: number;
      while ((i = tampon.indexOf('\n\n')) >= 0) {
        const parca = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        let ad = 'message';
        const veri: string[] = [];
        for (const s of parca.split('\n')) {
          if (s.startsWith('event:')) ad = s.slice(6).trim();
          else if (s.startsWith('data:')) veri.push(s.slice(5).trim());
        }
        if (veri.length) olaylar.push({ ad, veri: JSON.parse(veri.join('\n')) as Record<string, unknown>, alinma: Date.now() });
      }
    }
  })().catch((h: unknown) => { if (!(h instanceof Error && h.name === 'AbortError')) throw h; });
  return { olaylar, kes: () => ac.abort(), bitti };
}

/** Sunucu vekili (Nöbetçi'deki /canli-akis ile aynı fonksiyon). */
async function vekilKur(duyuruYolu: string): Promise<{ adres: string; kapat: () => Promise<void> }> {
  const s = createServer((req, res) => canliAkisiVekille(req, res, { duyuruYolu: () => duyuruYolu, suruyorMu: () => true, en: 800 }));
  await new Promise<void>((coz) => s.listen(0, '127.0.0.1', coz));
  return {
    adres: `http://127.0.0.1:${(s.address() as AddressInfo).port}/akis`,
    kapat: async () => { s.closeAllConnections(); await new Promise<void>((coz) => s.close(() => coz())); }
  };
}

test('animasyonlu sayfa: vekil üzerinden sürekli kareler (≥ 8 kare/sn, gecikme < 0,5 sn); izleyici gidince screencast durur; diske kare yazılmaz', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const baglam = await tarayici.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await baglam.newPage();
  await page.goto(adres);
  const duyuruYolu = join(klasor, 'duyuru-1.json');
  const yayin = await canliYayinKur(baglam, page, { duyuruYolu });
  const vekil = await vekilKur(duyuruYolu);
  try {
    // Duyuru: yalnız port + anahtar + pid (0600); izleyici yokken screencast kapalı.
    const d = JSON.parse(readFileSync(duyuruYolu, 'utf-8')) as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(['anahtar', 'pid', 'port']);
    expect(duyuruOku(duyuruYolu)).toEqual({ port: d.port, anahtar: d.anahtar });
    expect(yayin.durum()).toMatchObject({ izleyici: 0, yayinda: false, yedek: null });

    const a = akisiOku(vekil.adres);
    await expect.poll(() => a.olaylar.filter((o) => o.ad === 'kare').length, { timeout: 15_000 }).toBeGreaterThan(2);
    expect(yayin.durum()).toMatchObject({ izleyici: 1, yayinda: true });
    // Ölçüm: 3 sn boyunca gelen kareler.
    const bas = Date.now();
    const onceki = a.olaylar.length;
    await page.waitForTimeout(3_000);
    const kareler = a.olaylar.slice(onceki).filter((o) => o.ad === 'kare');
    const sure = (Date.now() - bas) / 1000;
    const hiz = kareler.length / sure;
    const gecikmeler = kareler.map((o) => o.alinma - Number(o.veri.t));
    const ortGecikme = gecikmeler.reduce((x, y) => x + y, 0) / Math.max(1, gecikmeler.length);
    const enCokGecikme = Math.max(...gecikmeler);
    testInfo.annotations.push({ type: 'ölçüm', description: `${kareler.length} kare / ${sure.toFixed(1)} sn = ${hiz.toFixed(1)} kare/sn; gecikme ort. ${Math.round(ortGecikme)} ms, en çok ${Math.round(enCokGecikme)} ms` });
    console.log(`[canlı akış ölçümü] ${hiz.toFixed(1)} kare/sn, ort. gecikme ${Math.round(ortGecikme)} ms, en çok ${Math.round(enCokGecikme)} ms`);
    expect(hiz).toBeGreaterThanOrEqual(8);
    expect(hiz).toBeLessThanOrEqual(17); // ~15 kare/sn sınırı
    expect(ortGecikme).toBeLessThan(500);
    // Kareler gerçekten değişir (JPEG, farklı içerik) ve kutuya uygun genişlikte (vekil en=800 istedi).
    const v = kareler.map((o) => String(o.veri.v));
    expect(new Set(v).size).toBeGreaterThan(kareler.length / 2);
    expect(Buffer.from(v[0], 'base64').subarray(0, 2).toString('hex')).toBe('ffd8');
    // İzleyici gidince screencast durur.
    a.kes();
    await a.bitti;
    await expect.poll(() => yayin.durum(), { timeout: 5_000 }).toMatchObject({ izleyici: 0, yayinda: false });
    const kareSayisi = yayin.durum().kare;
    await page.waitForTimeout(600);
    expect(yayin.durum().kare).toBe(kareSayisi);
    // Diske yalnız duyuru yazıldı (kare dosyası yok).
    expect(readdirSync(klasor).filter((x) => x.startsWith('duyuru-1'))).toEqual(['duyuru-1.json']);
    expect(readdirSync(klasor).some((x) => /\.(png|jpe?g)$/i.test(x))).toBe(false);
  } finally {
    await vekil.kapat();
    await yayin.kapat();
    await baglam.close();
  }
  // Yayın kapanınca kendi duyurusu silinir.
  expect(readdirSync(klasor).includes('duyuru-1.json')).toBe(false);
});

/** JPEG genişlik / yükseklik (SOF işaretinden). */
function jpegOlcusu(b: Buffer): { en: number; boy: number } {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const isaret = b[i + 1];
    const uzunluk = b.readUInt16BE(i + 2);
    if (isaret >= 0xc0 && isaret <= 0xc3) return { boy: b.readUInt16BE(i + 5), en: b.readUInt16BE(i + 7) };
    i += 2 + uzunluk;
  }
  throw new Error('JPEG ölçüsü bulunamadı');
}

test('çözünürlük: büyük pencere en/boy ile daha büyük kare ister (en çok tarayıcı görüntü alanı); "Sayfanın tamamı" tam yükseklikte tek jpeg, sayfayı kaydırmaz / değiştirmez, diske yazılmaz', async () => {
  test.setTimeout(90_000);
  const baglam = await tarayici.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await baglam.newPage();
  // Uzun sayfa (3000 px) + yan etki sayaçları (yeniden boyutlanma, kaydırma) + bir alanın değeri.
  await page.goto(adres);
  await page.evaluate(() => {
    const uzun = document.createElement('div');
    uzun.style.cssText = 'height:3000px;background:linear-gradient(#fff,#36c)';
    document.body.append(uzun);
    // Kaydırılmış sayfada da kare gelsin: sabit konumlu dönen kutu.
    const sabit = document.createElement('div');
    sabit.style.cssText = 'position:fixed;right:10px;bottom:10px;width:40px;height:40px;background:#e33;animation:don 1s linear infinite';
    document.body.append(sabit);
    const girdi = document.createElement('input');
    girdi.id = 'girdi';
    girdi.value = 'ilk';
    document.body.prepend(girdi);
    const w = window as unknown as { sayac: { boyut: number; kaydirma: number } };
    w.sayac = { boyut: 0, kaydirma: 0 };
    window.addEventListener('resize', () => { w.sayac.boyut += 1; });
    window.scrollTo(0, 400);
    window.addEventListener('scroll', () => { w.sayac.kaydirma += 1; });
  });
  const durum = () => page.evaluate(() => ({
    y: window.scrollY, en: window.innerWidth, boy: window.innerHeight, girdi: (document.getElementById('girdi') as HTMLInputElement).value,
    sayac: (window as unknown as { sayac: { boyut: number; kaydirma: number } }).sayac, yukseklik: document.documentElement.scrollHeight
  }));
  const once = await durum();
  expect(once.y).toBe(400);
  const duyuruYolu = join(klasor, 'duyuru-tam.json');
  const yayin = await canliYayinKur(baglam, page, { duyuruYolu });
  // Vekil: istemcinin en / boy isteği olduğu gibi geçer (Nöbetçi'deki uçlarla aynı).
  const s = createServer((req, res) => {
    const q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
    canliAkisiVekille(req, res, { duyuruYolu: () => duyuruYolu, suruyorMu: () => true, en: Number(q.get('en')) || null, boy: Number(q.get('boy')) || null });
  });
  await new Promise<void>((coz) => s.listen(0, '127.0.0.1', coz));
  const vekil = `http://127.0.0.1:${(s.address() as AddressInfo).port}/akis`;
  const olculer = (a: ReturnType<typeof akisiOku>) => a.olaylar.filter((o) => o.ad === 'kare').map((o) => jpegOlcusu(Buffer.from(String(o.veri.v), 'base64')));
  try {
    // Küçük kutu: en=400 → kare genişliği ≤ 400.
    const kucuk = akisiOku(`${vekil}?en=400`);
    await expect.poll(() => olculer(kucuk).length, { timeout: 15_000 }).toBeGreaterThan(3);
    const k1 = olculer(kucuk).pop() as { en: number; boy: number };
    expect(k1.en).toBeLessThanOrEqual(400);
    kucuk.kes();
    await kucuk.bitti;
    // Büyük pencere: en=2400&boy=1600 → daha büyük kare; ama tarayıcı görüntü alanından (1000×600) büyük değil.
    const buyuk = akisiOku(`${vekil}?en=2400&boy=1600`);
    await expect.poll(() => olculer(buyuk).filter((x) => x.en > k1.en).length, { timeout: 15_000 }).toBeGreaterThan(2);
    const k2 = olculer(buyuk).pop() as { en: number; boy: number };
    expect(k2.en).toBeGreaterThan(k1.en);
    expect(k2.en).toBeLessThanOrEqual(1000);
    expect(k2.boy).toBeLessThanOrEqual(600);
    buyuk.kes();
    await buyuk.bitti;

    // "Sayfanın tamamı": anahtarsız istek reddedilir; vekil fonksiyonu tam yükseklikte tek jpeg getirir.
    expect((await fetch(`http://127.0.0.1:${yayin.duyuru.port}/tam-sayfa`)).status).toBe(401);
    const t = await canliTamSayfaAl(duyuruYolu);
    expect(t.durum).toBe(200);
    const jpeg = t.jpeg as Buffer;
    expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
    const o = jpegOlcusu(jpeg);
    expect(o.en).toBe(1000);
    expect(o.boy).toBeGreaterThanOrEqual(once.yukseklik - 1);
    // Yan etki: kaydırma konumu, görüntü alanı, sayfa yüksekliği ve alan değeri aynı kalır. Bilinen geçici etki: Chromium'un tam sayfa
    // yakalaması (captureBeyondViewport) görüntü alanını yakalama süresince büyütüp geri alır → sayfa en çok BİR "resize" ve BİR "scroll"
    // olayı alır (konum geri yüklenir). Ölçülüp sınırlanır.
    const sonra = await durum();
    expect({ ...sonra, sayac: null }).toEqual({ ...once, sayac: null });
    expect(sonra.sayac.boyut).toBeLessThanOrEqual(1);
    expect(sonra.sayac.kaydirma).toBeLessThanOrEqual(1);
    // Diske yazılmadı (yalnız duyuru).
    expect(readdirSync(klasor).some((x) => /\.(png|jpe?g)$/i.test(x))).toBe(false);
    // Duyuru yoksa istek atılmaz.
    expect(await canliTamSayfaAl(join(klasor, 'yok.json'))).toMatchObject({ durum: 409, jpeg: null });
  } finally {
    s.closeAllConnections();
    await new Promise<void>((coz) => s.close(() => coz()));
    await yayin.kapat();
    await baglam.close();
  }
});

test('sekme değişince yayın yeni sayfaya geçer; sayfa kapanınca kalan sayfaya döner; anahtarsız istek 401', async () => {
  test.setTimeout(60_000);
  const baglam = await tarayici.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await baglam.newPage();
  await page.goto(adres);
  const yayin = await canliYayinKur(baglam, page, {});
  try {
    const kok = `http://127.0.0.1:${yayin.duyuru.port}`;
    expect((await fetch(`${kok}/akis`)).status).toBe(401);
    expect((await fetch(`${kok}/akis`, { headers: { 'x-canli-anahtar': 'yanlis' } })).status).toBe(401);
    const a = akisiOku(`${kok}/akis`, { 'x-canli-anahtar': yayin.duyuru.anahtar });
    await expect.poll(() => a.olaylar.filter((o) => o.ad === 'kare').length, { timeout: 15_000 }).toBeGreaterThan(2);
    const [ikinci] = await Promise.all([baglam.waitForEvent('page'), page.evaluate((u) => { window.open(u); }, `${adres}/ikinci`)]);
    await ikinci.waitForLoadState();
    await expect.poll(() => a.olaylar.some((o) => o.ad === 'durum' && o.veri.durum === 'sayfa' && o.veri.sayfa === 2), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => a.olaylar.filter((o) => o.ad === 'kare' && o.veri.s === 2).length, { timeout: 10_000 }).toBeGreaterThan(2);
    expect(yayin.durum()).toMatchObject({ sayfaNo: 2, yayinda: true, izleyici: 1 });
    await ikinci.close();
    await expect.poll(() => a.olaylar.filter((o) => o.ad === 'kare' && o.veri.s === 3).length, { timeout: 10_000 }).toBeGreaterThan(1);
    a.kes();
    await a.bitti;
  } finally {
    await yayin.kapat();
    await baglam.close();
  }
});

test('CDP yoksa (Chromium dışı tarayıcı) izleyiciye "yedek" durumu gider; screencast başlamaz', async () => {
  const baglam = await tarayici.newContext();
  const page = await baglam.newPage();
  await page.goto(adres);
  // newCDPSession'ı Chromium dışı tarayıcıdaki gibi hata veren bağlam.
  const cdpsiz = new Proxy(baglam, {
    get(hedef, ad) {
      if (ad === 'newCDPSession') return async () => { throw new Error('CDP session is only available in Chromium'); };
      const d = Reflect.get(hedef, ad) as unknown;
      return typeof d === 'function' ? (d as (...a: unknown[]) => unknown).bind(hedef) : d;
    }
  }) as BrowserContext;
  const yayin = await canliYayinKur(cdpsiz, page, {});
  try {
    const a = akisiOku(`http://127.0.0.1:${yayin.duyuru.port}/akis`, { 'x-canli-anahtar': yayin.duyuru.anahtar });
    await expect.poll(() => a.olaylar.find((o) => o.ad === 'durum' && o.veri.durum === 'yedek')?.veri.neden, { timeout: 10_000 }).toMatch(/sürekli akış yok/);
    expect(a.olaylar.filter((o) => o.ad === 'kare')).toEqual([]);
    expect(yayin.durum()).toMatchObject({ yayinda: false });
    a.kes();
    await a.bitti;
  } finally {
    await yayin.kapat();
    await baglam.close();
  }
});

test('"Tarayıcıyı göster": görünür koşuda page.bringToFront çağrılır; görünmez koşuda 409 (gorunur: false)', async () => {
  for (const gorunur of [true, false]) {
    const baglam = await tarayici.newContext();
    const page = await baglam.newPage();
    await page.goto(adres);
    let cagri = 0;
    const asil = page.bringToFront.bind(page);
    page.bringToFront = async () => { cagri += 1; await asil(); };
    const duyuruYolu = join(klasor, `goster-${gorunur}.json`);
    const yayin = await canliYayinKur(baglam, page, { duyuruYolu, gorunur });
    try {
      const y = await canliKanalaIstek(duyuruYolu, '/one-getir');
      if (gorunur) {
        expect(y).toEqual({ durum: 200, govde: { tamam: true, gorunur: true } });
        expect(cagri).toBe(1);
      } else {
        expect(y).toEqual({ durum: 409, govde: { tamam: false, gorunur: false } });
        expect(cagri).toBe(0);
      }
    } finally {
      await yayin.kapat();
      await baglam.close();
    }
  }
  // Duyuru yoksa istek atılmaz.
  expect(await canliKanalaIstek(join(klasor, 'yok.json'), '/one-getir')).toBeNull();
});

test('görünür koşu bayrağı: yalnız gövdede gorunur === true → NOBETCI_GORUNUR=1 → playwright.config headless: false', () => {
  expect(gorunurOrtami({ gorunur: true })).toEqual({ NOBETCI_GORUNUR: '1' });
  expect(gorunurOrtami({ gorunur: 'true' })).toEqual({});
  expect(gorunurOrtami({})).toEqual({});
  const onceki = process.env.NOBETCI_GORUNUR;
  try {
    delete process.env.NOBETCI_GORUNUR;
    expect(kosuGorunurMu()).toBe(false);
    process.env.NOBETCI_GORUNUR = '1';
    expect(kosuGorunurMu()).toBe(true);
  } finally {
    if (onceki === undefined) delete process.env.NOBETCI_GORUNUR; else process.env.NOBETCI_GORUNUR = onceki;
  }
  const yapilandirma = readFileSync(join(__dirname, '..', '..', 'playwright.config.ts'), 'utf-8');
  expect(yapilandirma).toMatch(/headless: !kosuGorunurMu\(\)/);
});
