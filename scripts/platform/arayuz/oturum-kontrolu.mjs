// OTURUM KONTROL ADRESİ (saf; tarayıcı ve testler kullanır) — giriş tarifindeki "Oturum kontrol adresi": her testten önce
// kayıtlı oturumun hâlâ geçerli olup olmadığına bakılan sayfa. Giriş sayfasıyla aynıysa (ör. ikisi de "/") başarı göstergesi
// orada görünmez; kayıtlı oturum doğru denetlenemez ve her test "Oturum kontrolü" süresi kadar bekleyip yeniden giriş yapar.
// Doğrusu girişten SONRA açılan bir sayfadır (ör. /panel). Bu modül:
//   - ayniAdresMi: iki adres (taban adrese göre yol ya da tam adres) aynı sayfa mı (# ve sondaki / yok sayılır)
//   - oturumAdresiGirisleAyniMi: tarifin oturum kontrol adresi (boşsa giriş adresi) giriş sayfasıyla aynı mı
//   - oturumAdresiOnerisi: girişten sonra görülen sayfanın yolu öneri olur mu (giriş sayfası ve mevcut değer değilse)
//   - basariAdresindenYol: başarı göstergesi düz bir adres deseniyse (ör. "\/panel") o yol
//   - girisSonrasiSayfasiniHatirla / hatirlananGirisSonrasiSayfasi: bu oturumda "Girişi dene"/"Girişi kaydet"te görülen
//     giriş sonrası sayfa (yalnız sayfanın belleğinde; kaydedilmez)
// Hiçbir değer kendiliğinden tarife yazılmaz: öneriyi kullanıcı onaylar.

const TABAN = 'http://nobetci.invalid';

/** Adresi karşılaştırılabilir biçime getirir (köken + yol + sorgu; # ve sondaki / yok). @param {string} adres @param {string} [tabanUrl] */
function anahtar(adres, tabanUrl) {
  const a = String(adres ?? '').trim() || '/';
  let u;
  try { u = new URL(a, tabanUrl || TABAN); } catch { try { u = new URL(a, TABAN); } catch { return a; } }
  const yol = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
  return `${u.origin}${yol || '/'}${u.search}`;
}

/** @param {string} a @param {string} b @param {string} [tabanUrl] */
export function ayniAdresMi(a, b, tabanUrl) {
  return anahtar(a, tabanUrl) === anahtar(b, tabanUrl);
}

/** Yolun sorgu ve # kısmı atılmış hâli. @param {string | null | undefined} yol */
export function yalinYol(yol) {
  return String(yol ?? '').split(/[?#]/)[0].trim();
}

/**
 * @param {{ girisAdresi?: string; oturumKontrolAdresi?: string } | null | undefined} tarif @param {string} [tabanUrl]
 */
export function oturumAdresiGirisleAyniMi(tarif, tabanUrl) {
  if (!tarif) return false;
  const giris = String(tarif.girisAdresi ?? '').trim() || '/';
  const oturum = String(tarif.oturumKontrolAdresi ?? '').trim() || giris;
  return ayniAdresMi(giris, oturum, tabanUrl);
}

/**
 * Girişten sonra görülen sayfa oturum kontrol adresi olarak önerilir mi? Önerilecek yol (sorgusuz) ya da null.
 * @param {{ girisAdresi?: string; oturumKontrolAdresi?: string } | null | undefined} tarif
 * @param {string | null | undefined} girisSonrasiYol @param {string} [tabanUrl]
 */
export function oturumAdresiOnerisi(tarif, girisSonrasiYol, tabanUrl) {
  const yol = yalinYol(girisSonrasiYol);
  if (!yol || !tarif) return null;
  const giris = String(tarif.girisAdresi ?? '').trim() || '/';
  const oturum = String(tarif.oturumKontrolAdresi ?? '').trim() || giris;
  if (ayniAdresMi(yol, giris, tabanUrl) || ayniAdresMi(yol, oturum, tabanUrl)) return null;
  return yol;
}

/** Başarı göstergesi düz bir adres deseniyse (ör. "\/panel", "/panel$") o yol; değilse null. @param {{ tur?: string; deger?: string } | null | undefined} g */
export function basariAdresindenYol(g) {
  if (!g || g.tur !== 'url') return null;
  const d = String(g.deger ?? '').trim().replace(/^\^/, '').replace(/\$$/, '').replace(/\\([/.\-?])/g, '$1');
  return /^\/[\w\-./]*$/.test(d) && d !== '/' ? d : null;
}

/** @type {Map<string, string>} */
const hatirlanan = new Map();

/** @param {string} ortamId @param {string | null | undefined} yol */
export function girisSonrasiSayfasiniHatirla(ortamId, yol) {
  const y = yalinYol(yol);
  if (ortamId && y) hatirlanan.set(ortamId, y);
}

/** @param {string} ortamId @returns {string | null} */
export function hatirlananGirisSonrasiSayfasi(ortamId) {
  return hatirlanan.get(ortamId) ?? null;
}

/** Tarif ekranındaki uyarı metni (testler ve arayüz aynı metni kullanır). */
export const AYNI_ADRES_UYARISI = 'Bu adres giriş sayfasıyla aynı; kayıtlı oturum doğru denetlenemez, her testte giriş beklenir.';
