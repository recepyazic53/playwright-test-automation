// HATA SINIFLANDIRMA KURALLARI (Ayarlar > Koşu > Hata sınıflandırma): kullanıcının kendi kuralları — hata mesajında şu metin
// geçerse şu kategori (ör. uygulamanın iş kuralı pop-up metni → "İş Kuralı / Ekran Hatası"). Genel Playwright kurallarından
// (zaman aşımı, seçici, doğrulama) ÖNCE denenir. Kasada şifreli (ayarlar, anahtar "siniflandirma").
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';
import { KATEGORI } from '../sonuclar/siniflandirma.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ icerir: string; kategori: string }} SiniflandirmaKurali */

export const SINIFLANDIRMA_AYAR_ANAHTARI = 'siniflandirma';
export const EN_COK_KURAL = 30;
/** Seçilebilen kategoriler (arayüz renkleri bu adlara göre). */
export const KATEGORI_SECENEKLERI = Object.freeze(Object.values(KATEGORI));

/** @param {unknown} v @returns {SiniflandirmaKurali[]} */
function dogrula(v) {
  if (!Array.isArray(v)) throw new DepoHatasi('"kurallar" bir dizi olmalıdır.');
  const temiz = v.map((x, i) => {
    const o = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
    const icerir = typeof o.icerir === 'string' ? o.icerir.trim() : '';
    if (icerir.length < 3 || icerir.length > 200) throw new DepoHatasi(`${i + 1}. kural: aranan metin 3–200 karakter olmalıdır.`);
    if (typeof o.kategori !== 'string' || !KATEGORI_SECENEKLERI.includes(o.kategori)) throw new DepoHatasi(`${i + 1}. kural: kategori geçersiz.`);
    return { icerir, kategori: o.kategori };
  });
  if (temiz.length > EN_COK_KURAL) throw new DepoHatasi(`En çok ${EN_COK_KURAL} kural olabilir.`);
  return temiz;
}

/** Kullanıcının kuralları (kasa kilitli / okunamazsa boş). @param {Veritabani} vt @returns {SiniflandirmaKurali[]} */
export function siniflandirmaKurallari(vt) {
  try {
    const a = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, SINIFLANDIRMA_AYAR_ANAHTARI));
    return a?.kurallar ? dogrula(a.kurallar) : [];
  } catch {
    return [];
  }
}

/** @param {Veritabani} vt @param {unknown} kurallar */
export function siniflandirmaKurallariniKaydet(vt, kurallar) {
  const temiz = dogrula(kurallar);
  ayarYaz(vt, SINIFLANDIRMA_AYAR_ANAHTARI, { kurallar: temiz });
  return temiz;
}
