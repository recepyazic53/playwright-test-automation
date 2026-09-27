// SAĞLIK NOKTASI EŞİKLERİ (Ayarlar > Arayüz > Sağlık noktası; PROJE BAŞINA) — Sonuçlar ekranında ekranın yanındaki noktanın rengi son
// koşunun başarı oranına göre: oran ≥ yeşil eşiği → yeşil, ≥ sarı eşiği → sarı, altı → kırmızı. Varsayılan 90 / 75 (önceki sabitler).
// Kasada (ayarlar tablosu, anahtar "saglikEsikleri", { projeId: { yesil, sari } }) şifreli saklanır.
import { DepoHatasi, ayarGetir, ayarYaz, projeGetir } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const SAGLIK_AYAR_ANAHTARI = 'saglikEsikleri';
export const VARSAYILAN_SAGLIK_ESIKLERI = Object.freeze({ yesil: 90, sari: 75 });

/** Geçerli eşikler mi? (tam sayı; 1 ≤ sarı < yeşil ≤ 100) @param {unknown} e @returns {e is { yesil: number; sari: number }} */
function gecerliMi(e) {
  if (!e || typeof e !== 'object') return false;
  const { yesil, sari } = /** @type {Record<string, unknown>} */ (e);
  return Number.isInteger(yesil) && Number.isInteger(sari) && Number(sari) >= 1 && Number(sari) < Number(yesil) && Number(yesil) <= 100;
}

/** Projenin eşikleri (kayıt yoksa / geçersizse varsayılan). @param {Veritabani} vt @param {string} projeId @returns {{ yesil: number; sari: number }} */
export function saglikEsikleriniOku(vt, projeId) {
  let kayit;
  try { kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, SAGLIK_AYAR_ANAHTARI)); } catch { kayit = undefined; }
  const e = kayit?.[projeId];
  return gecerliMi(e) ? { yesil: e.yesil, sari: e.sari } : { ...VARSAYILAN_SAGLIK_ESIKLERI };
}

/**
 * Projenin eşiklerini doğrulayıp kaydeder. @param {Veritabani} vt @param {string} projeId @param {unknown} girdi
 * @returns {{ yesil: number; sari: number }}
 */
export function saglikEsikleriniKaydet(vt, projeId, girdi) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const g = girdi && typeof girdi === 'object' ? /** @type {Record<string, unknown>} */ (girdi) : {};
  const e = { yesil: Number(g.yesil), sari: Number(g.sari) };
  if (!gecerliMi(e)) throw new DepoHatasi('Eşikler 1–100 arasında tam sayı olmalı ve sarı eşiği yeşil eşiğinden küçük olmalıdır.');
  let kayit;
  try { kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, SAGLIK_AYAR_ANAHTARI)); } catch { kayit = undefined; }
  ayarYaz(vt, SAGLIK_AYAR_ANAHTARI, { ...(kayit ?? {}), [projeId]: e });
  return e;
}

/**
 * Oranın (0–100) sağlık sınıfı: 'basari' (yeşil) | 'uyari' (sarı) | 'hata' (kırmızı). Arayüz (sonuclar.js) aynı kuralı uygular.
 * @param {number} oran @param {{ yesil: number; sari: number }} [esikler]
 */
export function saglikSinifi(oran, esikler = VARSAYILAN_SAGLIK_ESIKLERI) {
  return oran >= esikler.yesil ? 'basari' : oran >= esikler.sari ? 'uyari' : 'hata';
}
