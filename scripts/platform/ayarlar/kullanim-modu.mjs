// KULLANIM MODU (Basit / Gelişmiş): çalışma alanının (kasa) ayarı — kullanıcı kararı. Kasada şifreli (ayarlar, anahtar
// "kullanim-modu"); ayarlar tablosunda durduğu için yedeğe girer ve yedek yüklenince yedekteki mod geçerli olur.
//   - Kayıt yoksa (mevcut kurulumlar, v1.5 öncesi yedekler) GELİŞMİŞ: bugünkü kullanıcıların alıştığı ekranlar değişmez.
//   - Yeni çalışma alanında kurulum sihirbazı sorar (Basit — ilk kez kullanıyorum / Gelişmiş — tüm özellikler).
//   - gelismisAciklamasiGoruldu: Basit'ten Gelişmiş'e ilk geçişte gösterilen açıklamalı onay bir kez onaylandı mı (sonraki
//     geçişler sorusuz). Gelişmiş'ten Basit'e geçiş her zaman sorusuzdur.
// Hiçbir veri silinmez ya da gizlenmez: mod yalnız arayüzün hangi sayfaları ve menüleri göstereceğini belirler.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {'basit' | 'gelismis'} KullanimModu */
/** @typedef {{ mod: KullanimModu; kayitli: boolean; gelismisAciklamasiGoruldu: boolean }} KullanimModuAyari */

export const KULLANIM_MODU_AYAR_ANAHTARI = 'kullanim-modu';
export const KULLANIM_MODLARI = /** @type {const} */ (['basit', 'gelismis']);
/** Kayıt yokken geçerli mod (mevcut kurulumlar bugünkü arayüzle açılır). */
export const VARSAYILAN_KULLANIM_MODU = /** @type {const} */ ('gelismis');

/** @param {unknown} m @returns {m is KullanimModu} */
const gecerliMod = (m) => m === 'basit' || m === 'gelismis';

/** @param {Veritabani} vt @returns {Record<string, unknown> | null} */
function kayit(vt) {
  const a = ayarGetir(vt, KULLANIM_MODU_AYAR_ANAHTARI);
  return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, unknown>} */ (a) : null;
}

/** Kayıtlı mod (kayıt yoksa ya da bozuksa Gelişmiş). Kasa açık olmalıdır. @param {Veritabani} vt @returns {KullanimModuAyari} */
export function kullanimModunuOku(vt) {
  const k = kayit(vt);
  const kayitli = Boolean(k && gecerliMod(k.mod));
  return {
    mod: k && gecerliMod(k.mod) ? k.mod : VARSAYILAN_KULLANIM_MODU,
    kayitli,
    gelismisAciklamasiGoruldu: Boolean(k && k.gelismisAciklamasiGoruldu === true)
  };
}

/**
 * Modu ve / veya "açıklama görüldü" işaretini kaydeder. girdi: { mod?: 'basit' | 'gelismis'; gelismisAciklamasiGoruldu?: true }.
 * @param {Veritabani} vt @param {unknown} girdi @returns {KullanimModuAyari}
 */
export function kullanimModunuKaydet(vt, girdi) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Kullanım modu bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  if (g.mod !== undefined && !gecerliMod(g.mod)) throw new DepoHatasi('Kullanım modu "basit" ya da "gelismis" olmalıdır.');
  if (g.gelismisAciklamasiGoruldu !== undefined && typeof g.gelismisAciklamasiGoruldu !== 'boolean') {
    throw new DepoHatasi('"gelismisAciklamasiGoruldu" true ya da false olmalıdır.');
  }
  if (g.mod === undefined && g.gelismisAciklamasiGoruldu === undefined) throw new DepoHatasi('Kaydedilecek bir değer yok.');
  const onceki = kullanimModunuOku(vt);
  ayarYaz(vt, KULLANIM_MODU_AYAR_ANAHTARI, {
    mod: g.mod === undefined ? onceki.mod : g.mod,
    // İşaret yalnız açılır (bir kez gösterilen açıklama); false gönderilirse yeniden gösterilir.
    gelismisAciklamasiGoruldu: g.gelismisAciklamasiGoruldu === undefined ? onceki.gelismisAciklamasiGoruldu : g.gelismisAciklamasiGoruldu
  });
  return kullanimModunuOku(vt);
}
