// SUNUCU BAĞLANTI DOSYASI (genel) — veritabanı dosyasının TEK sahibi kuralı için (bkz.
// veritabani/baglanti.mjs): Nöbetçi sunucusu çalışırken terminalden başlatılan bir Playwright koşusu
// sonuçlarını veritabanına doğrudan DEĞİL, sunucuya göndermelidir. Sunucu açılışta veritabanının
// yanına (varsayılan veri/) küçük bir dosya yazar: { adres, token, veritabaniYolu, pid }. Token
// YALNIZCA raporlayıcı yazma uçlarında (/platform/sonuc/*) geçerlidir, her sunucu başlangıcında
// yeniden üretilir ve sunucu kapanınca dosya silinir. Dosya veri/ altındadır (Git'e girmez), yalnızca
// sahibi okuyabilir (0600).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirebilir).
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const SUNUCU_BAGLANTI_DOSYASI = '.sunucu-baglantisi.json';

/** @param {string} veritabaniYolu */
export function sunucuBaglantiYolu(veritabaniYolu) {
  return join(dirname(resolve(veritabaniYolu)), SUNUCU_BAGLANTI_DOSYASI);
}

/**
 * @param {string} veritabaniYolu
 * @param {{ adres: string; token: string }} baglanti
 */
export function sunucuBaglantisiniYaz(veritabaniYolu, baglanti) {
  const icerik = { adres: baglanti.adres, token: baglanti.token, veritabaniYolu: resolve(veritabaniYolu), pid: process.pid };
  writeFileSync(sunucuBaglantiYolu(veritabaniYolu), JSON.stringify(icerik), { encoding: 'utf8', mode: 0o600 });
}

/** Bu sürecin yazdığı bağlantı dosyasını siler (başka bir sürecinkine dokunmaz). @param {string} veritabaniYolu */
export function sunucuBaglantisiniSil(veritabaniYolu) {
  try {
    const yol = sunucuBaglantiYolu(veritabaniYolu);
    const mevcut = JSON.parse(readFileSync(yol, 'utf8'));
    if (mevcut?.pid === process.pid) unlinkSync(yol);
  } catch { /* dosya yok ya da okunamadı */ }
}

/**
 * Bağlantı dosyasını okur; yalnızca yerel (127.0.0.1) adresli ve bu veritabanına ait kayıt döner.
 * @param {string} veritabaniYolu
 * @returns {{ adres: string; token: string } | null}
 */
export function sunucuBaglantisiniOku(veritabaniYolu) {
  try {
    const d = JSON.parse(readFileSync(sunucuBaglantiYolu(veritabaniYolu), 'utf8'));
    if (typeof d?.adres !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(d.adres)) return null;
    if (typeof d.token !== 'string' || !d.token) return null;
    if (typeof d.veritabaniYolu !== 'string' || resolve(d.veritabaniYolu) !== resolve(veritabaniYolu)) return null;
    return { adres: d.adres, token: d.token };
  } catch {
    return null;
  }
}
