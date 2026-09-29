// REHBER AYARLARI (Ayarlar > Arayüz > Rehberler): ekran rehberlerinin ilk girişte otomatik açılıp açılmayacağı (kullanıcı
// kararı) ve hangi rehberlerin görüldüğü. Kasada şifreli (ayarlar, anahtar "rehber"). Rehberler her zaman ekrandaki "?"
// düğmesiyle ve sayfadaki "Bu sayfanın rehberi" bağlantısıyla açılabilir. Otomatik açılma yeni kurulumda KAPALIDIR (genel
// tanıtım bundan bağımsız, kurulum sihirbazından sonra bir kez açılır). NOBETCI_REHBER_OTOMATIK=0 ortam değişkeni otomatik açılmayı bu süreç için kapatır (ör.
// otomatik testler); kullanıcının kaydettiği tercihi değiştirmez.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ otomatik: boolean; gorulenler: string[]; ortamKapali: boolean }} RehberAyarlari */

export const REHBER_AYAR_ANAHTARI = 'rehber';
/** Rehber anahtarı: küçük harf, rakam, "-" (ör. "senaryolar", "ayarlar-kosu"). */
export const REHBER_ANAHTARI = /^[a-z0-9-]{1,60}$/;
const EN_COK_GORULEN = 200;

/** @param {Veritabani} vt @returns {Record<string, unknown>} */
function kayit(vt) {
  try {
    const a = ayarGetir(vt, REHBER_AYAR_ANAHTARI);
    return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, unknown>} */ (a) : {};
  } catch {
    return {};
  }
}

/** Kayıtlı tercih + görülenler (kasa kilitli / okunamazsa varsayılanlar). @param {Veritabani} vt @returns {RehberAyarlari} */
export function rehberAyarlariniOku(vt) {
  const k = kayit(vt);
  const ortamKapali = process.env.NOBETCI_REHBER_OTOMATIK === '0';
  const gorulenler = Array.isArray(k.gorulenler) ? k.gorulenler.filter((x) => typeof x === 'string' && REHBER_ANAHTARI.test(x)) : [];
  // Varsayılan KAPALI (yeni kurulum): yalnız kayıtlı otomatik: true açar. Her kayıt otomatiki açıkça yazdığından mevcut
  // kullanıcının seçimi (açık ya da kapalı) olduğu gibi korunur.
  return { otomatik: !ortamKapali && k.otomatik === true, gorulenler, ortamKapali };
}

/**
 * Tercihi / görülen rehberi kaydeder. g: { otomatik?: boolean; gorulen?: string; sifirla?: true } (sifirla: tüm rehberler
 * yeniden "görülmemiş" olur).
 * @param {Veritabani} vt @param {unknown} girdi @returns {RehberAyarlari}
 */
export function rehberAyarlariniKaydet(vt, girdi) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Rehber ayarı bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const k = kayit(vt);
  const otomatik = g.otomatik === undefined ? k.otomatik === true : g.otomatik === true;
  if (g.otomatik !== undefined && typeof g.otomatik !== 'boolean') throw new DepoHatasi('"otomatik" true ya da false olmalıdır.');
  let gorulenler = Array.isArray(k.gorulenler) ? k.gorulenler.filter((x) => typeof x === 'string' && REHBER_ANAHTARI.test(x)) : [];
  if (g.sifirla === true) gorulenler = [];
  if (g.gorulen !== undefined) {
    if (typeof g.gorulen !== 'string' || !REHBER_ANAHTARI.test(g.gorulen)) throw new DepoHatasi('Geçersiz rehber anahtarı.');
    if (!gorulenler.includes(g.gorulen)) gorulenler = [...gorulenler, g.gorulen].slice(-EN_COK_GORULEN);
  }
  ayarYaz(vt, REHBER_AYAR_ANAHTARI, { otomatik, gorulenler });
  return rehberAyarlariniOku(vt);
}
