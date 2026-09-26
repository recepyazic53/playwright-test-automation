// GİZLİ ADLAR — değeri maskelenecek alan / başlık / okuma adları (ORTAK: sunucu ve arayüz; /arayuz/gizli-adlar.mjs olarak
// sunulur, Node modülü içe aktarmaz). Çekirdek liste güvenlik tabanıdır, çıkarılamaz; kullanıcı Ayarlar > Güvenlik >
// Maskeleme'den EK adlar ekler (ör. şirketine özgü "musteriAnahtari").
// Eşleşme: ad büyük/küçük harf ve "-", "_", boşluk yok sayılarak aranır; uzun parçalar (≥ 4 harf) adın içinde geçerse,
// kısa parçalar (pin, otp, pwd, cvv, cvc) adın bir sözcüğüne tam eşitse gizli sayılır (ör. "pin" → "PinKodu" gizli,
// "Shipping" değil).

/** Çekirdek (her zaman gizli) ad parçaları. */
export const CEKIRDEK_GIZLI_ADLAR = Object.freeze([
  'parola', 'password', 'passwd', 'şifre', 'sifre', 'secret', 'gizli', 'token', 'totp', 'session', 'cookie', 'auth', 'apikey', 'accesskey', 'privatekey',
  'güvenlik', 'guvenlik', 'pwd', 'otp', 'pin', 'cvv', 'cvc'
]);

const duz = (/** @type {string} */ s) => s.toLocaleLowerCase('tr').replace(/[\s_-]+/g, '');
/** "PinKodu" / "pin_kodu" / "x-api-key" → sözcükler. @param {string} ad */
const sozcukler = (ad) => ad.replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2').toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Ad gizli mi (çekirdek + kullanıcının ek adları).
 * @param {string} ad @param {ReadonlyArray<string>} [ekler]
 */
export function gizliAdMi(ad, ekler = []) {
  if (typeof ad !== 'string' || !ad) return false;
  const d = duz(ad);
  const s = sozcukler(ad);
  return [...CEKIRDEK_GIZLI_ADLAR, ...ekler].some((p) => {
    const k = duz(String(p));
    if (!k) return false;
    return k.length >= 4 ? d.includes(k) : s.includes(k);
  });
}

/** Ek ad biçimi: harf, rakam, "-", "_" (2–40). */
export const EK_GIZLI_AD = /^[\p{L}\p{N}_-]{2,40}$/u;
export const EN_COK_EK_GIZLI_AD = 50;
