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
  ayarYaz(vt, MASKELEME_AYAR_ANAHTARI, { ...maskelemeAyari(vt), ekAdlar: temiz });
  return temiz;
}

/** Kayıtlı maskeleme ayarı (kasa kilitli / okunamazsa boş). @param {Veritabani} vt @returns {Record<string, unknown>} */
function maskelemeAyari(vt) {
  try {
    const a = ayarGetir(vt, MASKELEME_AYAR_ANAHTARI);
    return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, unknown>} */ (a) : {};
  } catch {
    return {};
  }
}

/**
 * "Kişisel verileri maskele" (Ayarlar > Güvenlik > Maskeleme; kullanıcı kararı, varsayılan açık): T.C. kimlik / vergi no, doğum tarihi,
 * kart ve telefon numarası gibi kişisel veriler (modelde / test verisinde "hassas" alanlar, kalıpla bulunan uzun sayılar, kişisel adlı
 * sütunlar) ekranda ve raporlarda gizlensin mi. Kapalıyken yalnız GERÇEK sırlar (parola, TOTP, token, anahtar, CVV — çekirdek ve ek
 * gizli adlar) maskelenir. Saklama değişmez: hassas değerler kasada yine şifrelidir.
 * @param {Veritabani} vt @returns {boolean}
 */
export function kisiselVeriMaskelenir(vt) {
  return maskelemeAyari(vt).kisiselVeri !== false;
}

/** @param {Veritabani} vt @param {unknown} acik @returns {boolean} */
export function kisiselVeriMaskesiKaydet(vt, acik) {
  if (typeof acik !== 'boolean') throw new DepoHatasi('"kisiselVeri" true ya da false olmalıdır.');
  ayarYaz(vt, MASKELEME_AYAR_ANAHTARI, { ...maskelemeAyari(vt), ekAdlar: ekGizliAdlar(vt), kisiselVeri: acik });
  return acik;
}

/** Çekirdek + ek adlarla gizli mi. @param {Veritabani} vt @param {string} ad */
export const adGizliMi = (vt, ad) => gizliAdMi(ad, ekGizliAdlar(vt));

export { CEKIRDEK_GIZLI_ADLAR };
