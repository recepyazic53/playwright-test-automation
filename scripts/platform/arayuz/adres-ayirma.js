// ADRES AYIRMA (Hızlı test ve Ekran ekle > Ekranı tara / Akışı kaydet formları): kullanıcı ortamdan başka bir sitenin tam adresini
// yazarsa sunucu 409 "TABAN_KAYITLI_DEGIL" (+ koken) döner ve HİÇBİR istek atmaz. Bu yardımcı kullanıcıya sorar: "Bu site adresi kayıtlı
// değil. Taban adres olarak kaydedeyim mi?" — onaylanırsa mevcut taban adres yönetimiyle (servis-tabanlari/taban) kaydeder ve AYNI
// isteği yeniden gönderir (sunucu tam adresten tabanı ve yolu ayırır). Onaylanmazsa hiçbir şey kaydedilmez, istek gitmez.
// Giriş tarifi formları bu dosyayı kullanmaz (ayrı iş).
import { api } from './ortak.js';

/** Kayıtsız site sorusunun metni (sunucu mesajıyla aynı cümle). */
export const TABAN_SORUSU = 'Bu site adresi kayıtlı değil. Taban adres olarak kaydedeyim mi? (kaydedilirse yolu ayırırım)';

/** Sitenin kökeninden (https://ornek.site:8443) taban adres adı: ana makine (+ port). @param {string} koken */
export function tabanAdiOner(koken) {
  try { return new URL(koken).host.slice(0, 60); } catch { return String(koken).slice(0, 60); }
}

/**
 * Kökeni bu ortam için taban adres olarak kaydeder (öbür ortamların adresi boş kalır). Ad çakışırsa " (2)", " (3)" eklenir.
 * @param {string} projeId @param {string} ortamId @param {string} koken
 */
export async function tabanAdresiKaydet(projeId, ortamId, koken) {
  const ad = tabanAdiOner(koken);
  for (let n = 1; n <= 5; n++) {
    const aday = n === 1 ? ad : `${ad.slice(0, 54)} (${n})`;
    try {
      await api('/platform/servis-tabanlari/taban', { govde: { projeId, islem: 'ekle', ad: aday, adresler: { [ortamId]: koken }, onay: true } });
      return aday;
    } catch (e) {
      if (!(e && /zaten var/.test(String(e.message))) || n === 5) throw e;
    }
  }
  return ad;
}

/**
 * İsteği gönderir; sunucu "site kayıtlı değil" derse sorar, onaylanırsa kaydedip isteği bir kez yeniden dener.
 * @template T
 * @param {() => Promise<T>} istek @param {{ projeId: string; ortamId: string; onayIste: (s: object) => Promise<boolean> }} baglam
 * @returns {Promise<T>}
 */
export async function adresliIstek(istek, baglam) {
  try {
    return await istek();
  } catch (e) {
    const koken = e && e.kod === 'TABAN_KAYITLI_DEGIL' && e.govde && typeof e.govde.koken === 'string' ? e.govde.koken : null;
    if (!koken) throw e;
    const tamam = await baglam.onayIste({ baslik: 'Bu site adresi kayıtlı değil', ikonAd: 'uyari', dugme: 'Evet, kaydet', tehlikeli: false, metin: TABAN_SORUSU, liste: [koken] });
    if (!tamam) throw new Error('Site adresi kaydedilmedi; hiçbir istek gönderilmedi. Ortamın adresine göre bir yol yazabilir ya da adresi kaydetmeyi onaylayabilirsiniz.');
    await tabanAdresiKaydet(baglam.projeId, baglam.ortamId, koken);
    return istek();
  }
}
