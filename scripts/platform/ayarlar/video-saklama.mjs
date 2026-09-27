// VİDEO SAKLAMA SÜRESİ (Ayarlar > Güvenlik > Video saklama) — sunucu (günlük temizlik) ve doğrudan yazan raporlayıcı (sunucu yokken,
// terminal / CI koşusu) AYNI kuralı kullanır: kasadaki kayıtlı değer (kasa açıkken) > VIDEO_SAKLAMA_GUN ortam değişkeni > 30 gün.
import { kasaAcikMi } from '../kasa.mjs';
import { ayarGetir } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const MEDYA_AYAR_ANAHTARI = 'medya';
export const VIDEO_SAKLAMA_VARSAYILAN_GUN = 30;

/**
 * Kasadaki kayıtlı video saklama süresi (gün); kasa kapalı / kayıt yok / geçersizse null. Okuma eski üst sınırla (3650) kalır:
 * önceden kaydedilmiş uzun süre geçersiz sayılıp varsayılana (daha kısa) düşülürse videolar erken silinirdi.
 * @param {Veritabani | null | undefined} vt @returns {number | null}
 */
export function kayitliVideoSaklamaGunu(vt) {
  if (!vt || !kasaAcikMi(vt)) return null;
  try {
    const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, MEDYA_AYAR_ANAHTARI));
    const gun = Number(ayar?.videoSaklamaGun);
    return Number.isInteger(gun) && gun >= 1 && gun <= 3650 ? gun : null;
  } catch {
    return null;
  }
}

/** Video saklama süresi (gün): kasadaki kayıtlı değer > VIDEO_SAKLAMA_GUN > 30. @param {Veritabani | null | undefined} [vt] */
export function videoSaklamaGunu(vt) {
  const kayitli = kayitliVideoSaklamaGunu(vt);
  if (kayitli !== null) return kayitli;
  const ortam = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(ortam) && ortam > 0 ? ortam : VIDEO_SAKLAMA_VARSAYILAN_GUN;
}
