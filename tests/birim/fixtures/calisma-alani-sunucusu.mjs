// BİRİM TESTİ YARDIMCISI (spec değildir) — sunucu-platform.mjs'nin /platform/* uçlarını GEÇİCİ bir veri köküyle
// (NOBETCI_VERI_KOKU) sunan küçük bir HTTP sunucusu. Test koşusu BAŞLATMAZ: koşucu sahtedir; POST /test/mesgul
// { deger } ile "koşu sürüyor" durumu açılıp kapatılır (çalışma alanı değiştirme/proje silme reddi denetlenir).
// Yalnızca 127.0.0.1'e bağlanır; başladığında stdout'a tek satır JSON yazar: { port, token }.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  platformCalismaAlanlariniHazirla, platformIsteginiIsle, platformKosucusunuAyarla
} from '../../../scripts/platform/sunucu-platform.mjs';

const TOKEN = randomBytes(16).toString('hex');
let mesgul = false;

platformKosucusunuAyarla({
  calistir: async () => ({ httpDurum: 409, govde: { basarili: false, mesaj: 'Birim testinde koşu yok.' } }),
  dene: async () => ({ httpDurum: 409, govde: { basarili: false, mesaj: 'Birim testinde koşu yok.' } }),
  mesgulMu: () => mesgul
});
platformCalismaAlanlariniHazirla();

/** @param {import('node:http').ServerResponse} res @param {number} durum @param {unknown} govde */
function jsonGonder(res, durum, govde) {
  res.writeHead(durum, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(govde));
}

const sunucu = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/test/mesgul') {
      let metin = '';
      for await (const p of req) metin += p;
      mesgul = Boolean(JSON.parse(metin || '{}').deger);
      jsonGonder(res, 200, { basarili: true, mesgul });
      return;
    }
    if (await platformIsteginiIsle(req, res, { token: TOKEN, jsonGonder })) return;
    jsonGonder(res, 404, { basarili: false });
  } catch (hata) {
    if (!res.headersSent) jsonGonder(res, 500, { basarili: false, mesaj: String(/** @type {Error} */ (hata)?.message ?? hata) });
  }
});
sunucu.listen(0, '127.0.0.1', () => {
  const adres = sunucu.address();
  process.stdout.write(`${JSON.stringify({ port: typeof adres === 'object' && adres ? adres.port : 0, token: TOKEN })}\n`);
});
process.on('SIGTERM', () => { sunucu.close(); process.exit(0); });
