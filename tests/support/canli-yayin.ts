// CANLI YAYIN (koşan tarayıcının anlık görüntüsü) — test sürecinde (koşu: fixtures.ts; hızlı test: hizli-test-motoru.ts) çalışır.
//
// Sayfadan Chrome DevTools Protocol "screencast" ile sürekli kare akışı alınır ve YALNIZ 127.0.0.1'de dinleyen, rastgele anahtarlı
// küçük bir http ucundan (SSE: text/event-stream) verilir. Nöbetçi sunucusu bu uca vekillik eder (platform/canli-akis.mjs) ve panele
// kendi oturum token'ıyla korunan /canli-akis ucundan iletir. Kurallar:
//  - Kareler YALNIZ BELLEKTE durur; diske yazılmaz. Diske yalnız bağlantı duyurusu (port + anahtar; 0600, atomik) yazılır.
//  - İzleyen yoksa screencast DURUR (CPU / bant maliyeti yok); ilk izleyici bağlanınca başlar.
//  - Sayfa / sekme değişince (yeni sayfa, açılan pencere, sayfa kapanması) yayın açık kalan en yeni sayfaya geçer.
//  - CDP yoksa (Chromium dışı tarayıcı) ya da screencast başlamazsa izleyiciye "yedek" durumu gider; arayüz aralıklı görüntüye düşer.
//  - Hız: en çok ~15 kare/sn (66 ms); her screencastFrame hemen onaylanır (screencastFrameAck), fazlası birleştirilir (son kare gider).
//  - "Tarayıcıyı göster": görünür (headed) koşuda sayfayı öne getirir (page.bringToFront); görünmez koşuda 409 döner.
//  - Çözünürlük: izleyici ?en= (genişlik) ve ?boy= (yükseklik) ister (320–2560; büyük pencere daha yüksek ister). Sayfanın görüntü
//    alanından büyüğü istenmez (fazlası yalnız bant harcar).
//  - "Sayfanın tamamı" (GET /tam-sayfa): koşan sayfanın tüm kaydırılabilir yüksekliğinin TEK jpeg görüntüsü (page.screenshot fullPage);
//    bellekte üretilir, diske yazılmaz; kaydırma konumu, görüntü alanı ve sayfa durumu değişmez. Bilinen geçici etki: Chromium
//    yakalama süresince görüntü alanını bir an büyütüp geri alır (sayfa bir "resize" / "scroll" olayı alabilir).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';

/** Kare aralığı alt sınırı (ms): ~15 kare/sn. */
export const CANLI_KARE_ARALIGI_MS = 66;
/** Screencast varsayılan en büyük genişliği / yüksekliği (px); izleyici ?en= / ?boy= ile 320–2560 arası ister. */
const VARSAYILAN_EN = 1280;
const EN_KUCUK = 320;
const EN_BUYUK = 2560;
/** Screencast jpeg kalitesi (büyük pencerede de aynı: kare hızı makul kalsın). */
const KALITE = 60;
/** "Sayfanın tamamı" jpeg kalitesi. */
const TAM_SAYFA_KALITE = 70;
const ANAHTAR_BASLIGI = 'x-canli-anahtar';

export type CanliDuyuru = { port: number; anahtar: string; pid: number };
export type CanliYayin = {
  /** Yayın durumu (testler ve fixture: izleyici sayısı, screencast açık mı, yedek mi, gönderilen kare). */
  durum(): { izleyici: number; yayinda: boolean; yedek: string | null; kare: number; sayfaNo: number };
  /** Bağlantı duyurusu (testler). */
  duyuru: CanliDuyuru;
  kapat(): Promise<void>;
};

const esit = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Bağlamın sayfaları için canlı yayın kurar. duyuruYolu verilirse bağlantı duyurusu oraya yazılır (Nöbetçi okur).
 * gorunur: koşu görünür (headed) mü — "Tarayıcıyı göster" yalnız bunda sayfayı öne getirir.
 */
export async function canliYayinKur(
  baglam: BrowserContext, ilkSayfa: Page, secenek: { duyuruYolu?: string | null; gorunur?: boolean } = {}
): Promise<CanliYayin> {
  const anahtar = randomBytes(24).toString('hex');
  const istemciler = new Set<ServerResponse>();
  let sayfa: Page = ilkSayfa;
  let sayfaNo = 1;
  let cdp: CDPSession | null = null;
  let baslatiliyor: Promise<void> | null = null;
  let yedek: string | null = null;
  let kapali = false;
  let en = VARSAYILAN_EN;
  let boy = VARSAYILAN_EN;
  let tamSayfaSuruyor = false;
  let sira = 0;
  let sonKare: string | null = null;
  let sonGonderim = 0;
  let bekleyen: string | null = null;
  let bekleyenZamanlayici: ReturnType<typeof setTimeout> | null = null;

  const yaz = (olay: string, veri: unknown): void => {
    const metin = `event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`;
    for (const r of istemciler) r.write(metin);
  };
  const kareGonder = (metin: string): void => {
    sonGonderim = Date.now();
    sonKare = metin;
    for (const r of istemciler) r.write(metin);
  };
  const kareAl = (veri: string, zamanMs: number, g: number, y: number): void => {
    sira += 1;
    const metin = `event: kare\ndata: ${JSON.stringify({ n: sira, t: zamanMs, g, y, s: sayfaNo, v: veri })}\n\n`;
    const gecen = Date.now() - sonGonderim;
    if (gecen >= CANLI_KARE_ARALIGI_MS && !bekleyenZamanlayici) { kareGonder(metin); return; }
    // Çok sık gelen kareler birleştirilir: aralık dolunca yalnız en sonuncusu gider.
    bekleyen = metin;
    bekleyenZamanlayici ??= setTimeout(() => {
      bekleyenZamanlayici = null;
      if (bekleyen) { const m = bekleyen; bekleyen = null; kareGonder(m); }
    }, Math.max(0, CANLI_KARE_ARALIGI_MS - gecen));
  };

  async function durdur(): Promise<void> {
    const c = cdp;
    cdp = null;
    if (bekleyenZamanlayici) { clearTimeout(bekleyenZamanlayici); bekleyenZamanlayici = null; bekleyen = null; }
    if (!c) return;
    await c.send('Page.stopScreencast').catch(() => undefined);
    await c.detach().catch(() => undefined);
  }

  async function baslat(): Promise<void> {
    if (kapali || cdp || yedek || !istemciler.size) return;
    if (baslatiliyor) return baslatiliyor;
    baslatiliyor = (async () => {
      const hedef = sayfa;
      if (hedef.isClosed()) return;
      let c: CDPSession;
      try {
        c = await baglam.newCDPSession(hedef);
      } catch (hata) {
        // Chromium dışı tarayıcı (CDP yok): kalıcı yedek.
        yedek = `Bu tarayıcıda sürekli akış yok (${String(hata instanceof Error ? hata.message : hata).split('\n')[0].slice(0, 120)}).`;
        yaz('durum', { durum: 'yedek', neden: yedek });
        return;
      }
      c.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number; deviceWidth: number; deviceHeight: number } }) => {
        void c.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
        if (cdp !== c) return;
        kareAl(f.data, f.metadata.timestamp ? Math.round(f.metadata.timestamp * 1000) : Date.now(), Math.round(f.metadata.deviceWidth), Math.round(f.metadata.deviceHeight));
      });
      try {
        // Sayfanın görüntü alanından büyüğü istenmez (en çok tarayıcı görüntü alanı kadar).
        const g = hedef.viewportSize();
        const maxWidth = g ? Math.min(en, Math.max(EN_KUCUK, g.width)) : en;
        const maxHeight = g ? Math.min(boy, Math.max(EN_KUCUK, g.height)) : boy;
        await c.send('Page.startScreencast', { format: 'jpeg', quality: KALITE, maxWidth, maxHeight, everyNthFrame: 1 });
      } catch (hata) {
        await c.detach().catch(() => undefined);
        if (hedef.isClosed() || kapali) return;
        yedek = `Sürekli akış başlatılamadı (${String(hata instanceof Error ? hata.message : hata).split('\n')[0].slice(0, 120)}).`;
        yaz('durum', { durum: 'yedek', neden: yedek });
        return;
      }
      if (kapali || !istemciler.size || hedef !== sayfa) { await c.send('Page.stopScreencast').catch(() => undefined); await c.detach().catch(() => undefined); return; }
      cdp = c;
      yaz('durum', { durum: 'akis', sayfa: sayfaNo });
    })().finally(() => { baslatiliyor = null; });
    return baslatiliyor;
  }

  /** Yayını verilen sayfaya taşır (yeni sekme / pencere ya da kapanan sayfanın yerine kalan en yeni sayfa). */
  async function sayfayaGec(p: Page): Promise<void> {
    if (kapali || p === sayfa || p.isClosed()) return;
    sayfa = p;
    sayfaNo += 1;
    p.on('close', () => { void sayfaKapandi(p); });
    await durdur();
    if (baslatiliyor) await baslatiliyor.catch(() => undefined);
    await durdur();
    yaz('durum', { durum: 'sayfa', sayfa: sayfaNo });
    await baslat();
  }
  async function sayfaKapandi(p: Page): Promise<void> {
    if (kapali || p !== sayfa) return;
    const kalan = baglam.pages().filter((x) => !x.isClosed());
    const yeni = kalan[kalan.length - 1];
    if (yeni) await sayfayaGec(yeni);
    else { await durdur(); yaz('durum', { durum: 'sayfaYok' }); }
  }
  ilkSayfa.on('close', () => { void sayfaKapandi(ilkSayfa); });
  const yeniSayfa = (p: Page): void => { void sayfayaGec(p); };
  baglam.on('page', yeniSayfa);

  const yanit = (res: ServerResponse, durum: number, govde: unknown): void => {
    res.writeHead(durum, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(govde));
  };
  const sunucu: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const anahtarBasligi = req.headers[ANAHTAR_BASLIGI];
    if (typeof anahtarBasligi !== 'string' || !esit(anahtarBasligi, anahtar)) { req.resume(); yanit(res, 401, { tamam: false }); return; }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/akis') {
      const olcu = (ad: string): number | null => {
        const x = Number(url.searchParams.get(ad));
        return Number.isFinite(x) && x >= EN_KUCUK ? Math.min(EN_BUYUK, Math.round(x)) : null;
      };
      const yeniEn = olcu('en') ?? en;
      // Yükseklik istenmezse genişlikle aynı (eski izleyiciler).
      const yeniBoy = olcu('boy') ?? (olcu('en') !== null ? yeniEn : boy);
      if (yeniEn !== en || yeniBoy !== boy) { en = yeniEn; boy = yeniBoy; if (cdp) void durdur().then(() => baslat()); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: durum\ndata: ${JSON.stringify(yedek ? { durum: 'yedek', neden: yedek } : { durum: 'baglandi', sayfa: sayfaNo })}\n\n`);
      // Duran sayfada yeni kare gelmeyebilir: bağlanan izleyici son kareyi hemen görür (bellekten).
      if (sonKare && !yedek) res.write(sonKare);
      istemciler.add(res);
      const birak = (): void => {
        if (!istemciler.delete(res)) return;
        if (!istemciler.size) void durdur();
      };
      req.on('close', birak);
      res.on('close', birak);
      void baslat();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/tam-sayfa') {
      req.resume();
      // Tek seferde bir görüntü (art arda basışlar sayfayı yormasın). Kaydırma / durum değişmez (Playwright tam sayfa görüntüsü).
      if (tamSayfaSuruyor) { yanit(res, 429, { tamam: false, mesaj: 'Görüntü alınıyor; birazdan yeniden deneyin.' }); return; }
      if (kapali || sayfa.isClosed()) { yanit(res, 409, { tamam: false, mesaj: 'Sayfa açık değil.' }); return; }
      tamSayfaSuruyor = true;
      void sayfa.screenshot({ fullPage: true, type: 'jpeg', quality: TAM_SAYFA_KALITE, animations: 'allow', caret: 'initial', timeout: 20_000 })
        .then((b) => {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': String(b.length), 'Cache-Control': 'no-store' });
          res.end(b);
        }, (h: unknown) => yanit(res, 500, { tamam: false, mesaj: String(h instanceof Error ? h.message : h).split('\n')[0].slice(0, 200) }))
        .finally(() => { tamSayfaSuruyor = false; });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/one-getir') {
      req.resume();
      if (!secenek.gorunur) { yanit(res, 409, { tamam: false, gorunur: false }); return; }
      void sayfa.bringToFront().then(() => yanit(res, 200, { tamam: true, gorunur: true }), (h: unknown) => yanit(res, 500, { tamam: false, gorunur: true, mesaj: String(h instanceof Error ? h.message : h).slice(0, 200) }));
      return;
    }
    req.resume();
    yanit(res, 404, { tamam: false });
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const duyuru: CanliDuyuru = { port: (sunucu.address() as AddressInfo).port, anahtar, pid: process.pid };
  const duyuruYolu = secenek.duyuruYolu || null;
  if (duyuruYolu) {
    try {
      const gecici = `${duyuruYolu}.${process.pid}.tmp`;
      writeFileSync(gecici, JSON.stringify(duyuru), { encoding: 'utf-8', mode: 0o600 });
      renameSync(gecici, duyuruYolu);
    } catch { /* duyuru yazılamazsa arayüz aralıklı görüntüye düşer */ }
  }

  return {
    duyuru,
    durum: () => ({ izleyici: istemciler.size, yayinda: Boolean(cdp), yedek, kare: sira, sayfaNo }),
    async kapat() {
      if (kapali) return;
      kapali = true;
      baglam.off('page', yeniSayfa);
      // Test bitti; koşu sürüyorsa (sonraki test / veri koşusu) vekil yeni yayına bağlanır.
      yaz('durum', { durum: 'ara' });
      for (const r of istemciler) r.end();
      istemciler.clear();
      await durdur();
      if (duyuruYolu) {
        // Yalnız kendi duyurusu silinir (aynı yola sonraki test yazmış olabilir).
        try {
          const d = JSON.parse(readFileSync(duyuruYolu, 'utf-8')) as Partial<CanliDuyuru>;
          if (d.anahtar === anahtar) rmSync(duyuruYolu, { force: true });
        } catch { /* yok */ }
      }
      sunucu.closeAllConnections();
      await new Promise<void>((coz) => sunucu.close(() => coz()));
    }
  };
}
