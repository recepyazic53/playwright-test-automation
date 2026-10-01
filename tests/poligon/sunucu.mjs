// HIZLI TEST POLİGONU — tek node http sunucusu (bağımlılık yok), yalnız 127.0.0.1'de dinler. Hızlı testi zorlayan, birbirinden
// farklı alanlardan (e-ticaret, rezervasyon, havale, iş başvurusu, anket…) ve farklı tasarımlı ekranlar. Tüm adlar, metinler ve
// değerler UYDURMADIR; hiçbir dış adrese istek atılmaz (sayfalar dış kaynak yüklemez).
//
// Çalıştırma: node tests/poligon/sunucu.mjs [port]   → "Poligon hazır: http://127.0.0.1:<port>"
// Sayaçlar:  GET  /__poligon/sayaclar   (ekran → { gonderim, gonderimler, olaylar })
//            POST /__poligon/sifirla
// Ekranlar:  GET  /  (liste)  — her ekranın kendi kökü (ekranlar/*.mjs > kok)
import { createServer } from 'node:http';
import sepet from './ekranlar/sepet.mjs';
import otel from './ekranlar/otel.mjs';
import ucak from './ekranlar/ucak.mjs';
import havale from './ekranlar/havale.mjs';
import basvuru from './ekranlar/basvuru.mjs';
import anket from './ekranlar/anket.mjs';
import destek from './ekranlar/destek.mjs';
import restoran from './ekranlar/restoran.mjs';
import etkinlik from './ekranlar/etkinlik.mjs';
import ayarlar from './ekranlar/ayarlar.mjs';
import arama from './ekranlar/arama.mjs';
import not from './ekranlar/not.mjs';
import abonelik from './ekranlar/abonelik.mjs';
import uyelik from './ekranlar/uyelik.mjs';
import rapor from './ekranlar/rapor.mjs';
import gider from './ekranlar/gider.mjs';

export const EKRANLAR = [sepet, otel, ucak, havale, basvuru, anket, destek, restoran, etkinlik, ayarlar, arama, not, abonelik, uyelik, rapor, gider];

const bosSayac = () => ({ gonderim: 0, gonderimler: [], olaylar: {}, doldurma: [] });

/** Poligon uygulaması (sunucudan bağımsız; testler doğrudan da çağırabilir). */
export function poligonUygulamasi() {
  /** @type {Record<string, { gonderim: number; gonderimler: object[]; olaylar: Record<string, number> }>} */
  const sayaclar = Object.fromEntries(EKRANLAR.map((e) => [e.kok, bosSayac()]));
  const sifirla = () => { for (const e of EKRANLAR) sayaclar[e.kok] = bosSayac(); };
  /** @param {{ yontem: string; yol: string; sorgu: URLSearchParams; govde: string; basliklar: Record<string, unknown> }} i */
  const isle = (i) => {
    if (i.yol === '/__poligon/sayaclar') return { durum: 200, tur: 'application/json; charset=utf-8', govde: JSON.stringify(sayaclar) };
    if (i.yol === '/__poligon/sifirla' && i.yontem === 'POST') { sifirla(); return { durum: 200, tur: 'application/json', govde: '{"tamam":true}' }; }
    // Doldurma izleyicisi (ortak.mjs > izleyici): alan adı + zaman; 1x1 boş görüntü döner.
    if (i.yol === '/__poligon/doldurma') {
      const s = sayaclar[String(i.sorgu.get('ekran'))];
      if (s && s.doldurma.length < 5000) s.doldurma.push({ alan: String(i.sorgu.get('alan') ?? ''), zaman: Number(i.sorgu.get('t')) || Date.now() });
      return { durum: 204, tur: 'image/gif', govde: '' };
    }
    if (i.yol === '/' || i.yol === '/index.html') {
      const satirlar = EKRANLAR.map((e) => `<li><a href="${e.kok}/">${e.ad}</a> <small>${e.alan} — ${e.teknikler.join(', ')}</small></li>`).join('');
      return { durum: 200, tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Poligon</title></head><body style="font:15px system-ui;margin:24px"><h1>Hızlı test poligonu</h1><ul>${satirlar}</ul></body></html>` };
    }
    if (i.yol === '/favicon.ico') return { durum: 204, tur: 'image/x-icon', govde: '' };
    const ekran = EKRANLAR.find((e) => i.yol === e.kok || i.yol.startsWith(`${e.kok}/`));
    const y = ekran ? ekran.isle(i, sayaclar[ekran.kok]) : null;
    return y ?? { durum: 404, tur: 'text/plain; charset=utf-8', govde: 'Bulunamadı' };
  };
  return { isle, sayaclar: () => sayaclar, sifirla };
}

/** 127.0.0.1'de poligon sunucusu başlatır. @param {number} [port] */
export async function poligonBaslat(port = 0) {
  const uygulama = poligonUygulamasi();
  const sunucu = createServer((req, res) => {
    const parcalar = [];
    req.on('data', (p) => parcalar.push(p));
    req.on('end', async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let y;
      try {
        y = uygulama.isle({ yontem: req.method ?? 'GET', yol: url.pathname, sorgu: url.searchParams, govde: Buffer.concat(parcalar).toString('latin1'), basliklar: req.headers });
      } catch (e) {
        y = { durum: 500, tur: 'text/plain; charset=utf-8', govde: `Poligon hatası: ${String(e)}` };
      }
      if (y.gecikmeMs) await new Promise((c) => setTimeout(c, y.gecikmeMs));
      res.writeHead(y.durum ?? 200, { 'content-type': y.tur ?? 'text/plain', 'cache-control': 'no-store', ...(y.basliklar ?? {}) });
      res.end(y.govde);
    });
  });
  await new Promise((c) => sunucu.listen(port, '127.0.0.1', () => c(undefined)));
  const adres = sunucu.address();
  return {
    adres: `http://127.0.0.1:${typeof adres === 'object' && adres ? adres.port : port}`,
    sayaclar: uygulama.sayaclar,
    sifirla: uygulama.sifirla,
    kapat: () => new Promise((c) => { sunucu.closeAllConnections(); sunucu.close(() => c(undefined)); })
  };
}

// Doğrudan çalıştırıldıysa (node tests/poligon/sunucu.mjs [port]). Üst düzey await ve import.meta yok (Playwright'ın yükleyicisi).
if (process.argv[1] && /[\\/]poligon[\\/]sunucu\.mjs$/.test(process.argv[1])) {
  void poligonBaslat(Number(process.argv[2] ?? 0)).then((p) => console.log(`Poligon hazır: ${p.adres}`));
}
