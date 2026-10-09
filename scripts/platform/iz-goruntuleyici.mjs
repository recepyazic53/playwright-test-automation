// İZ GÖRÜNTÜLEYİCİ — Playwright'ın kendi iz (trace) görüntüleyicisini Nöbetçi içinde sunar: sonuç ayrıntısındaki "İzi görüntüle"
// yeni sekmede /iz-goruntuleyici/index.html?trace=<medya adresi> açar. Dosyalar kurulu playwright-core paketinin içinden
// (lib/vite/traceViewer; npx playwright show-trace'in kullandığı ekran) olduğu gibi okunur; internete istek atılmaz. İz, mevcut
// şifreli medya ucundan (/platform/medya/<id>, Range destekli; kasa açık olmalı) okunur — düz metin diske yazılmaz.
// Görüntüleyicinin service worker'ı yalnız /iz-goruntuleyici/ altını kapsar. Sayfa anlarının (DOM) kendi CSP'si service worker'dan
// gelir (kaydedilen sayfanın betikleri çalışmaz).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Görüntüleyicinin adres öneki. */
export const IZ_GORUNTULEYICI_ONEKI = '/iz-goruntuleyici/';

/** Sunulan dosya türleri (uzantı → içerik türü); listede olmayan uzantı sunulmaz. */
const TURLER = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
});

/** Yol: tek düzey dosya adı ya da assets/<ad>; "..", gizli dosya ve alt klasör yok. */
const GECERLI_YOL = /^(?:assets\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/**
 * Görüntüleyici sayfalarının güvenlik başlıkları: yalnız kendi kökeni (dış istek yok), çerçevelenmez (başka site), adres (iz
 * adresindeki oturum token'ı) başka siteye gönderilmez. Satır içi betik yalnız sayfanın kendi betiğiyse (özeti CSP'de) çalışır;
 * stil satır içi olabilir.
 */
export const IZ_GORUNTULEYICI_BASLIKLARI = Object.freeze({
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
    "connect-src 'self'; frame-src 'self'; worker-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'self'; object-src 'none'"
});

/** Kurulu playwright-core'daki görüntüleyici klasörü (yoksa null). */
function klasorBul() {
  try {
    const k = join(dirname(createRequire(import.meta.url).resolve('playwright-core/package.json')), 'lib', 'vite', 'traceViewer');
    return existsSync(join(k, 'index.html')) ? k : null;
  } catch {
    return null;
  }
}
/** @type {string | null | undefined} */
let klasor;

/**
 * /iz-goruntuleyici/* isteğini karşılar (yalnız GET / HEAD). Kendi önekinde değilse false döner (sonraki işleyici dener).
 * Dosyalar sır içermez; iz verisi bu uçtan değil, token'lı medya ucundan gelir.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @returns {boolean}
 */
export function izGoruntuleyiciIsteginiIsle(req, res) {
  const yol = String(req.url ?? '').split('?')[0];
  if (!yol.startsWith(IZ_GORUNTULEYICI_ONEKI)) return false;
  const yaz = (/** @type {number} */ durum, /** @type {string} */ metin) => {
    res.writeHead(durum, { 'Content-Type': 'text/plain; charset=utf-8', ...IZ_GORUNTULEYICI_BASLIKLARI });
    res.end(metin);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') { yaz(405, 'Yalnız GET.'); return true; }
  const ad = yol.slice(IZ_GORUNTULEYICI_ONEKI.length) || 'index.html';
  const uzanti = /\.[a-z0-9]+$/i.exec(ad)?.[0]?.toLowerCase() ?? '';
  const tur = Object.prototype.hasOwnProperty.call(TURLER, uzanti) ? TURLER[/** @type {keyof typeof TURLER} */ (uzanti)] : null;
  if (!GECERLI_YOL.test(ad) || ad.includes('..') || !tur) { yaz(404, 'Bulunamadı.'); return true; }
  if (klasor === undefined) klasor = klasorBul();
  if (!klasor) { yaz(404, 'İz görüntüleyici bu kurulumda yok (playwright-core bulunamadı).'); return true; }
  const dosya = join(klasor, ...ad.split('/'));
  if (!existsSync(dosya)) { yaz(404, 'Bulunamadı.'); return true; }
  const icerik = readFileSync(dosya);
  res.writeHead(200, { 'Content-Type': tur, ...IZ_GORUNTULEYICI_BASLIKLARI, ...(uzanti === '.html' ? { 'Content-Security-Policy': htmlCsp(icerik.toString('utf8')) } : {}) });
  res.end(req.method === 'HEAD' ? undefined : icerik);
  return true;
}

/**
 * HTML sayfasının CSP'si: sayfanın kendi satır içi betikleri (görüntüleyici sürümüne göre değişir) özetleriyle izinli, başka satır
 * içi betik çalışmaz. @param {string} html
 */
function htmlCsp(html) {
  const ozetler = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  return IZ_GORUNTULEYICI_BASLIKLARI['Content-Security-Policy'].replace("script-src 'self'", ["script-src 'self'", ...ozetler].join(' '));
}
