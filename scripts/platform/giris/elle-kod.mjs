// ELLE DOĞRULAMA KODU (SMS) — Nöbetçi koşuları için dosya tabanlı istek/yanıt (genel).
// Koşu alt süreci (giriş motoru) koda ihtiyaç duyunca "<yol>.istek.json" yazar ve "<yol>.yanit"
// dosyasını bekler; Nöbetçi sunucusu (test-sunucu.mjs) isteği canlı koşu paneline gösterir, kullanıcının
// girdiği kodu "<yol>.yanit" olarak (yalnızca sahibi okuyabilir, 0600) yazar. Motor kodu okuyunca
// iki dosyayı da hemen siler. <yol> her koşuya özel, rastgele adlı geçici bir yoldur
// (TEST_SUNUCU_KOD_YOLU); kod hiçbir yere loglanmaz. Aynı desen canlı ekran görüntüsünde de kullanılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export const KOD_YOLU_DEGISKENI = 'TEST_SUNUCU_KOD_YOLU';
/** Kabul edilen kod biçimi (harf/rakam, 3–12). */
export const KOD_DESENI = /^[A-Za-z0-9]{3,12}$/;

/** @param {string} yol */
const istekYolu = (yol) => `${yol}.istek.json`;
/** @param {string} yol */
const yanitYolu = (yol) => `${yol}.yanit`;

/** @param {string} yol */
function sessizSil(yol) {
  try { if (existsSync(yol)) unlinkSync(yol); } catch { /* yok sayılır */ }
}

/**
 * Motor tarafı: istek dosyasını yazar (mesajda gizli değer yoktur).
 * @param {string} yol @param {{ mesaj: string; sureMs: number }} istek
 */
export function kodIstegiYaz(yol, istek) {
  sessizSil(yanitYolu(yol));
  const gecici = `${istekYolu(yol)}.tmp`;
  writeFileSync(gecici, JSON.stringify({ mesaj: istek.mesaj, olusturma: Date.now(), sonTarih: Date.now() + istek.sureMs }), { mode: 0o600 });
  renameSync(gecici, istekYolu(yol));
}

/**
 * Sunucu tarafı: bekleyen istek (yoksa ya da süresi dolmuşsa null).
 * @param {string} yol @returns {{ mesaj: string; kalanSn: number } | null}
 */
export function kodIstegiOku(yol) {
  try {
    if (!existsSync(istekYolu(yol))) return null;
    const d = JSON.parse(readFileSync(istekYolu(yol), 'utf8'));
    const kalan = Number(d.sonTarih) - Date.now();
    if (!(kalan > 0) || existsSync(yanitYolu(yol))) return null;
    return { mesaj: typeof d.mesaj === 'string' ? d.mesaj.slice(0, 300) : 'Doğrulama kodu bekleniyor.', kalanSn: Math.ceil(kalan / 1000) };
  } catch {
    return null;
  }
}

/**
 * Sunucu tarafı: kullanıcının girdiği kodu yanıt dosyasına yazar. Bekleyen istek yoksa false.
 * @param {string} yol @param {string} kod
 */
export function koduYanitla(yol, kod) {
  if (!KOD_DESENI.test(kod)) throw new Error('Kod yalnızca harf ve rakamdan oluşmalı (3–12 karakter).');
  if (!kodIstegiOku(yol)) return false;
  const gecici = `${yanitYolu(yol)}.tmp`;
  writeFileSync(gecici, kod, { mode: 0o600 });
  renameSync(gecici, yanitYolu(yol));
  return true;
}

/**
 * Motor tarafı: yanıtı bekler (süre dolarsa null). Okuyunca istek ve yanıt dosyalarını siler.
 * @param {string} yol @param {number} sureMs @param {{ aralikMs?: number; iptal?: () => boolean }} [secenekler]
 * @returns {Promise<string | null>}
 */
export async function kodYanitiniBekle(yol, sureMs, secenekler = {}) {
  const son = Date.now() + sureMs;
  const aralik = secenekler.aralikMs ?? 400;
  try {
    while (Date.now() < son) {
      if (secenekler.iptal?.()) return null;
      if (existsSync(yanitYolu(yol))) {
        const kod = readFileSync(yanitYolu(yol), 'utf8').trim();
        return KOD_DESENI.test(kod) ? kod : null;
      }
      await new Promise((coz) => setTimeout(coz, aralik));
    }
    return null;
  } finally {
    kodIsteginiTemizle(yol);
  }
}

/** Her iki dosyayı da siler (koşu bitince sunucu da çağırır). @param {string} yol */
export function kodIsteginiTemizle(yol) {
  sessizSil(istekYolu(yol));
  sessizSil(`${istekYolu(yol)}.tmp`);
  sessizSil(yanitYolu(yol));
  sessizSil(`${yanitYolu(yol)}.tmp`);
}
