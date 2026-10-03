// CANLI AKIŞ VEKİLİ (sunucu) — koşan tarayıcının kare akışını panele iletir.
//
// Test süreci (tests/support/canli-yayin.ts) yalnız 127.0.0.1'de, rastgele anahtarlı bir SSE ucu açar ve bağlantı duyurusunu
// ({ port, anahtar }) koşuya özel bir dosyaya yazar. Sunucu panelin isteğini (kendi oturum token'ıyla korunur; çağıran denetler)
// bu uca bağlar ve baytları olduğu gibi iletir:
//  - Duyuru henüz yoksa (tarayıcı açılmadı / test arası) "bekleniyor" durumu gider, kısa aralıkla yeniden bakılır.
//  - Test süreci akışı kapatırsa (test bitti, yeni test başladı) yeni duyuruya yeniden bağlanılır; koşu bitince "bitti" gider.
//  - Panel bağlantıyı kapatınca test sürecine giden bağlantı da kapanır → izleyici kalmazsa screencast durur.
// Kareler diske yazılmaz; sunucu yalnız iletir (bellekte tutmaz).
import { readFileSync } from 'node:fs';
import { request } from 'node:http';

/** Test sürecine verilen duyuru dosyası yolu (ortam değişkeni). */
export const CANLI_DUYURU_DEGISKENI = 'NOBETCI_YAYIN_DUYURU';
/** Koşu görünür (headed) mi — playwright.config.ts ve fixtures.ts okur; YALNIZ kullanıcı koşu başına seçerse "1". */
export const GORUNUR_KOSU_DEGISKENI = 'NOBETCI_GORUNUR';
/** Görünmez koşuda "Tarayıcıyı göster" iletisi (tek metin; arayüz ve sunucu). */
export const GORUNMEZ_KOSU_METNI = 'Bu koşu görünmez başladı; pencerede izlemek için koşuyu ‘Tarayıcı penceresinde izle’ ile yeniden başlatın. Görünmez başlayan tarayıcı sonradan görünür yapılamaz.';

const YENIDEN_DENEME_MS = 250;
const CANLI_TUTMA_MS = 15_000;
/** Koşu kaydı görülmeden en çok bu kadar beklenir (koşu sırada / süreç açılıyor). */
const BEKLEME_MS = 20_000;

/** @param {string | null | undefined} yol @returns {{ port: number; anahtar: string } | null} */
export function duyuruOku(yol) {
  if (!yol) return null;
  try {
    const d = JSON.parse(readFileSync(yol, 'utf-8'));
    if (!d || typeof d !== 'object' || !Number.isInteger(d.port) || typeof d.anahtar !== 'string' || !/^[0-9a-f]{16,128}$/.test(d.anahtar)) return null;
    return { port: d.port, anahtar: d.anahtar };
  } catch {
    return null;
  }
}

/**
 * Panelin SSE isteğini test sürecinin yayınına bağlar (vekil). Token denetimi ÇAĞIRANDADIR.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {{ duyuruYolu: () => string | null; suruyorMu: () => boolean; en?: number | null }} s
 */
export function canliAkisiVekille(req, res, s) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1000\n\n');
  let kapandi = false;
  /** @type {import('node:http').ClientRequest | null} */
  let ust = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let zamanlayici = null;
  let sonDurum = '';
  let goruldu = false;
  const baslangic = Date.now();
  const durum = (/** @type {Record<string, unknown>} */ veri) => {
    const metin = JSON.stringify(veri);
    if (metin === sonDurum) return;
    sonDurum = metin;
    res.write(`event: durum\ndata: ${metin}\n\n`);
  };
  const tut = setInterval(() => { if (!kapandi) res.write(': tut\n\n'); }, CANLI_TUTMA_MS);
  const bitir = () => {
    if (kapandi) return;
    kapandi = true;
    clearInterval(tut);
    if (zamanlayici) clearTimeout(zamanlayici);
    ust?.destroy();
    ust = null;
  };
  req.on('close', bitir);
  res.on('close', bitir);
  const sonra = () => { if (!kapandi) zamanlayici = setTimeout(bagla, YENIDEN_DENEME_MS); };
  const en = Number.isFinite(s.en) && Number(s.en) >= 320 ? Math.min(1600, Math.round(Number(s.en))) : null;
  function bagla() {
    zamanlayici = null;
    if (kapandi) return;
    // Koşu henüz kaydolmamış olabilir (panel koşuyu başlatır başlatmaz bağlanır): ilk BEKLEME_MS boyunca beklenir; koşu görüldükten sonra bitince hemen "bitti".
    if (s.suruyorMu()) goruldu = true;
    else if (goruldu || Date.now() - baslangic > BEKLEME_MS) { durum({ durum: 'bitti' }); bitir(); res.end(); return; }
    else { durum({ durum: 'bekleniyor' }); sonra(); return; }
    const d = duyuruOku(s.duyuruYolu());
    if (!d) { durum({ durum: 'bekleniyor' }); sonra(); return; }
    const istek = request({ host: '127.0.0.1', port: d.port, path: `/akis${en ? `?en=${en}` : ''}`, method: 'GET', headers: { 'x-canli-anahtar': d.anahtar } }, (yanit) => {
      if (yanit.statusCode !== 200) { yanit.resume(); ust = null; sonra(); return; }
      sonDurum = '';
      yanit.on('data', (/** @type {Buffer} */ parca) => { if (!kapandi) res.write(parca); });
      const bitti = () => {
        if (ust !== istek) return;
        ust = null;
        // Yarım kalmış bir olay sonraki olaya karışmasın.
        if (!kapandi) res.write('\n\n');
        sonra();
      };
      yanit.on('end', bitti);
      yanit.on('error', bitti);
      yanit.on('close', bitti);
    });
    istek.on('error', () => { if (ust === istek) { ust = null; sonra(); } });
    ust = istek;
    istek.end();
  }
  bagla();
}

/**
 * Test sürecinin yayın ucuna tek istek (ör. "Tarayıcıyı göster" → POST /one-getir). Yayın yoksa null.
 * @param {string | null | undefined} duyuruYolu @param {string} yol
 * @returns {Promise<{ durum: number; govde: Record<string, unknown> } | null>}
 */
export function canliKanalaIstek(duyuruYolu, yol) {
  const d = duyuruOku(duyuruYolu);
  if (!d) return Promise.resolve(null);
  return new Promise((coz) => {
    const istek = request({ host: '127.0.0.1', port: d.port, path: yol, method: 'POST', headers: { 'x-canli-anahtar': d.anahtar, 'content-length': '0' }, timeout: 10_000 }, (yanit) => {
      /** @type {Buffer[]} */
      const parcalar = [];
      yanit.on('data', (p) => parcalar.push(p));
      yanit.on('end', () => {
        let govde = {};
        try { govde = JSON.parse(Buffer.concat(parcalar).toString('utf-8')); } catch { govde = {}; }
        coz({ durum: yanit.statusCode ?? 0, govde });
      });
    });
    istek.on('timeout', () => istek.destroy());
    istek.on('error', () => coz(null));
    istek.end();
  });
}
