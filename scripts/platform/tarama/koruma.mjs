// OTOMATİK TARAMA KORUMASI (genel, saf fonksiyonlar) — tarama işinin güvenlik kararları:
//   hedefCoz              hedef yol/adres → ortamın kökeninde bir yol (başka köken, kullanıcı:parola@, javascript: … reddedilir)
//   taramaAdresleri       tarama başlamadan yasaklı adres denetimine giren TAM adresler (ortam, hedef, giriş tarifi,
//                         bağlam adımlarının "git" adresleri — yer tutucular her profilin değerleriyle doldurulur)
//   yasakliAdresBul       bu adreslerden yasaklı kalıba uyan ilki (tarama tarayıcı açılmadan REDDEDİLİR)
//   istekKarari           tarayıcıdaki her isteğin kararı: yasaklı host → her zaman iptal; izinli köken listesi
//                         verilmişse (testler) dışındaki köken → iptal; TARAMA aşamasında GET/HEAD dışı her istek
//                         (form gönderimi, XHR POST, sendBeacon…) → iptal. Giriş ve bağlam değiştirme aşamaları
//                         tarif güdümlüdür (izinli). KAYIT aşamasında ("Akışı kaydet") akışı kullanıcı yürütür:
//                         yazma istekleri izinlidir (kullanıcı bunu başlatırken onaylar); yasaklı host ve izinli köken
//                         engeli bu aşamada da geçerlidir.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: koruma.d.mts.

import { adresYasakliMi } from '../senaryolar/model-kosusu.mjs';
import { yerTutuculariDoldur } from '../giris/tarif.mjs';

/** Tarama aşamasında izin verilen HTTP yöntemleri (yalnızca okuma). */
export const OKUMA_YONTEMLERI = Object.freeze(['GET', 'HEAD']);

export class HedefHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'HedefHatasi';
  }
}

/**
 * Hedefi ortamın taban adresine göre çözer. Kabul: "/" ile başlayan yol, göreli yol (taban adrese göre) ya da
 * ortamla AYNI kökende tam http(s) adresi.
 * @param {string} tabanUrl @param {unknown} hedef
 * @returns {{ adres: string; yol: string }} adres: tam adres; yol: pathname + search (paketin urlYolu)
 */
export function hedefCoz(tabanUrl, hedef) {
  let taban;
  try { taban = new URL(tabanUrl); } catch { throw new HedefHatasi('Ortamın adresi geçerli bir http(s) adresi değil (Ayarlar > Ortamlar).'); }
  if (taban.protocol !== 'http:' && taban.protocol !== 'https:') throw new HedefHatasi('Ortamın adresi http(s) olmalı (Ayarlar > Ortamlar).');
  if (typeof hedef !== 'string' || !hedef.trim()) throw new HedefHatasi('Taranacak sayfanın yolunu yazın (ör. /satis/odeme/).');
  const metin = hedef.trim();
  if (metin.length > 2000) throw new HedefHatasi('Hedef adres çok uzun.');
  let u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(metin)) {
    try { u = new URL(metin); } catch { throw new HedefHatasi('Hedef adres geçersiz.'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HedefHatasi('Hedef yalnızca http(s) adresi ya da yol olabilir.');
    if (u.origin !== taban.origin) {
      throw new HedefHatasi(`Tam adres yalnızca ortamın adresiyle aynı kökende olabilir (${taban.origin}); başka bir siteye tarama yapılmaz. Yol yazın (ör. /satis/odeme/).`);
    }
  } else {
    try { u = new URL(metin, taban); } catch { throw new HedefHatasi('Hedef yol geçersiz.'); }
    if (u.origin !== taban.origin) throw new HedefHatasi(`Hedef ortamın kökeninde (${taban.origin}) olmalı.`);
  }
  if (u.username || u.password) throw new HedefHatasi('Adreste kullanıcı adı/parola yazılamaz.');
  const yol = `${u.pathname}${u.search}`;
  if (!yol.startsWith('/') || yol.startsWith('//')) throw new HedefHatasi('Hedef yol "/" ile başlamalı.');
  return { adres: `${u.origin}${yol}`, yol };
}

/**
 * Yasaklı adres denetimine giren TAM adresler.
 * @param {string} tabanUrl @param {string} hedefAdres
 * @param {import('../giris/tarif.d.mts').GirisTarifi | null} tarif
 * @param {Array<Record<string, unknown> | null>} profilDegerleri
 */
export function taramaAdresleri(tabanUrl, hedefAdres, tarif, profilDegerleri) {
  const adresler = [tabanUrl, hedefAdres];
  if (tarif) {
    adresler.push(tarif.girisAdresi, tarif.oturumKontrolAdresi);
    for (const a of tarif.baglamDegistirme?.adimlar ?? []) {
      if (a.islem !== 'git') continue;
      adresler.push(a.adres);
      for (const d of profilDegerleri) {
        if (!d) continue;
        try { adresler.push(yerTutuculariDoldur(a.adres, d)); } catch { /* eksik alan: bağlam adımı zaten hata verir */ }
      }
    }
  }
  return [...new Set(adresler.filter((a) => typeof a === 'string' && /^https?:\/\//i.test(a)))];
}

/**
 * Yasaklı kalıba uyan ilk adres (yoksa null).
 * @param {string[]} adresler @param {Array<{ kalip: string; desen: RegExp }>} desenler
 * @returns {{ adres: string; host: string; kalip: string } | null}
 */
export function yasakliAdresBul(adresler, desenler) {
  for (const adres of adresler) {
    const kalip = adresYasakliMi(adres, desenler);
    if (kalip) {
      let host = '?';
      try { host = new URL(adres).hostname; } catch { /* yok */ }
      return { adres, host, kalip };
    }
  }
  return null;
}

/** Yasaklı adres nedeniyle reddedilen taramanın mesajı (host yazılır; yol/sorgu yazılmaz). @param {{ host: string; kalip: string }} b */
export function yasakliTaramaMesaji(b) {
  return `Tarama reddedildi: ${b.host} adresi yasaklı adres kalıbına ("${b.kalip}") uyuyor (Ayarlar > Güvenlik > Yasak adresler ya da NOBETCI_YASAK_ADRESLER). Tarayıcı açılmadı; siteye hiçbir istek gönderilmedi.`;
}

/** Günlük/kayıt için adresin kökeni + yolu (sorgu ve parça yazılmaz — değer taşıyabilir). @param {string} adres */
export function adresOzeti(adres) {
  try {
    const u = new URL(adres);
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return String(adres).split(/[?#]/)[0].slice(0, 300);
  }
}

/**
 * Tarayıcıdaki bir isteğin kararı.
 * @param {{ yontem: string; adres: string; asama: 'hazirlik' | 'giris' | 'baglam' | 'tarama' | 'kayit';
 *   yasakDesenleri: Array<{ kalip: string; desen: RegExp }>; izinliKokenler?: string[] | null }} i
 * @returns {{ izin: true } | { izin: false; neden: 'yazma' | 'yasakli' | 'izinsiz-koken'; kalip?: string }}
 */
export function istekKarari(i) {
  const adres = String(i.adres);
  if (/^(data|blob|about):/i.test(adres)) return { izin: true };
  const kalip = adresYasakliMi(adres, i.yasakDesenleri);
  if (kalip) return { izin: false, neden: 'yasakli', kalip };
  if (i.izinliKokenler && i.izinliKokenler.length) {
    let koken = '';
    try { koken = new URL(adres).origin; } catch { koken = ''; }
    if (!i.izinliKokenler.includes(koken)) return { izin: false, neden: 'izinsiz-koken' };
  }
  if (i.asama === 'tarama' && !OKUMA_YONTEMLERI.includes(String(i.yontem).toUpperCase())) return { izin: false, neden: 'yazma' };
  return { izin: true };
}
