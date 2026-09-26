// MASKELEME AYARI (Ayarlar > Güvenlik > Maskeleme): kullanıcının çekirdek gizli ad listesine eklediği adlar. Kasada şifreli
// (ayarlar, anahtar "maskeleme"). Bkz. gizli-adlar.mjs (eşleşme kuralı ve çekirdek liste).
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';
import { CEKIRDEK_GIZLI_ADLAR, EK_GIZLI_AD, EN_COK_EK_GIZLI_AD, gizliAdMi } from './gizli-adlar.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const MASKELEME_AYAR_ANAHTARI = 'maskeleme';

/** Kullanıcının ek gizli adları (kasa kilitli / okunamazsa boş). @param {Veritabani} vt @returns {string[]} */
export function ekGizliAdlar(vt) {
  try {
    const a = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, MASKELEME_AYAR_ANAHTARI));
    return Array.isArray(a?.ekAdlar) ? a.ekAdlar.filter((x) => typeof x === 'string' && EK_GIZLI_AD.test(x)) : [];
  } catch {
    return [];
  }
}

/** @param {Veritabani} vt @param {unknown} liste @returns {string[]} */
export function ekGizliAdlariKaydet(vt, liste) {
  if (!Array.isArray(liste)) throw new DepoHatasi('"ekAdlar" bir dizi olmalıdır.');
  const temiz = [...new Set(liste.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))];
  const kotu = temiz.find((x) => !EK_GIZLI_AD.test(x));
  if (kotu) throw new DepoHatasi(`Geçersiz ad: "${kotu}" (harf, rakam, "-", "_"; 2–40 karakter).`);
  if (temiz.length > EN_COK_EK_GIZLI_AD) throw new DepoHatasi(`En çok ${EN_COK_EK_GIZLI_AD} ek ad olabilir.`);
  ayarYaz(vt, MASKELEME_AYAR_ANAHTARI, { ekAdlar: temiz });
  return temiz;
}

/** Çekirdek + ek adlarla gizli mi. @param {Veritabani} vt @param {string} ad */
export const adGizliMi = (vt, ad) => gizliAdMi(ad, ekGizliAdlar(vt));

export { CEKIRDEK_GIZLI_ADLAR };
