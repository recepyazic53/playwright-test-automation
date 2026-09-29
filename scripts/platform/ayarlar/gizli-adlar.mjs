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

// ---- Metinde adı gizli alanların değerleri (servis senaryosu gövdesi / başlıkları / yolu) ----
// Kural rapor maskelemesiyle aynıdır (sonuclar/servis-sonuclari.mjs > raporMetniniMaskele): <ns:Ad>değer</ns:Ad> ve "ad": "değer";
// başlık metninde "Ad: değer" satırları, yolda ?ad=değer. Yer tutucu (${…}) içeren değer sır değildir, dokunulmaz.

/**
 * @typedef {{ bicim?: 'govde' | 'basliklar' | 'yol' }} MetinBicimi
 * @typedef {{ re: RegExp; ad: (g: string[]) => string; deger: (g: string[]) => string; yaz: (g: string[], d: string) => string }} Desen
 */
/** @param {MetinBicimi} [s] @returns {Desen[]} */
function desenler(s = {}) {
  if (s.bicim === 'basliklar') return [{ re: /^([^\s:]{1,80})([ \t]*:[ \t]*)(.*?)[ \t]*$/gm, ad: (g) => g[1], deger: (g) => g[3], yaz: (g, d) => `${g[1]}${g[2]}${d}` }];
  if (s.bicim === 'yol') return [{ re: /([?&])([^=&#\s]{1,80})=([^&#\s]*)/g, ad: (g) => g[2], deger: (g) => g[3], yaz: (g, d) => `${g[1]}${g[2]}=${d}` }];
  return [
    { re: /<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(\s[^<>]*)?>([^<]+)<\/\1?\2>/g, ad: (g) => g[2], deger: (g) => g[4], yaz: (g, d) => `<${g[1] ?? ''}${g[2]}${g[3] ?? ''}>${d}</${g[1] ?? ''}${g[2]}>` },
    { re: /"([^"\\]{1,80})"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g, ad: (g) => g[1], deger: (g) => g[3], yaz: (g, d) => `"${g[1]}"${g[2]}"${d}"` }
  ];
}
/** Değer sır olarak maskelenir mi (boş / yer tutuculu değilse). @param {string} d @param {string} maske */
const sirMi = (d, maske) => Boolean(d.trim()) && d !== maske && !d.includes('${');

/**
 * Metinde adı gizli (çekirdek + ek adlar) alanların düz değerleri — ör. servis senaryosuna "Sabit değer" olarak yazılan parola.
 * @param {unknown} metin @param {ReadonlyArray<string>} [ekler] @param {MetinBicimi} [s] @returns {string[]}
 */
export function gizliAdliDegerler(metin, ekler = [], s = {}) {
  if (typeof metin !== 'string' || !metin) return [];
  /** @type {string[]} */
  const sonuc = [];
  for (const d of desenler(s)) {
    for (const m of metin.matchAll(d.re)) {
      const g = [...m].map((x) => x ?? '');
      const deger = d.deger(g);
      if (gizliAdMi(d.ad(g), ekler) && sirMi(deger, '') && !sonuc.includes(deger)) sonuc.push(deger);
    }
  }
  return sonuc;
}

/**
 * Metindeki adı gizli alanların değerini maskeler; asıl değerler (ad → sırayla değerler) döner — düzenleyicide maskeli gösterilen
 * metin kaydederken maskeyiGeriKoy ile geri yazılır (saklama biçimi değişmez).
 * @param {string} metin @param {ReadonlyArray<string>} ekler @param {string} maske @param {MetinBicimi} [s]
 * @returns {{ metin: string; asillar: Record<string, Array<string | null>> }}
 */
export function adaGoreMaskele(metin, ekler, maske, s = {}) {
  /** @type {Record<string, Array<string | null>>} */
  const asillar = {};
  let m = typeof metin === 'string' ? metin : '';
  for (const d of desenler(s)) {
    m = m.replace(d.re, (...a) => {
      const g = /** @type {string[]} */ (a.slice(0, -2).filter((x) => typeof x !== 'object').map((x) => x ?? ''));
      const ad = d.ad(g);
      const deger = d.deger(g);
      if (!gizliAdMi(ad, ekler)) return g[0];
      // Her gizli adlı yer sırayla kaydedilir (maskelenmeyen yer null): geri koyarken sıra kaymaz.
      const sir = sirMi(deger, maske);
      (asillar[ad] ??= []).push(sir ? deger : null);
      return sir ? d.yaz(g, maske) : g[0];
    });
  }
  return { metin: m, asillar };
}

/**
 * adaGoreMaskele'nin tersi: değeri hâlâ maske olan gizli adlı alana (aynı addaki sırasıyla) asıl değeri yazar; kullanıcının
 * değiştirdiği değer olduğu gibi kalır.
 * @param {string} metin @param {Record<string, Array<string | null>>} asillar @param {ReadonlyArray<string>} ekler @param {string} maske @param {MetinBicimi} [s]
 */
export function maskeyiGeriKoy(metin, asillar, ekler, maske, s = {}) {
  /** @type {Record<string, number>} */
  const sira = {};
  let m = metin;
  for (const d of desenler(s)) {
    m = m.replace(d.re, (...a) => {
      const g = /** @type {string[]} */ (a.slice(0, -2).filter((x) => typeof x !== 'object').map((x) => x ?? ''));
      const ad = d.ad(g);
      if (!gizliAdMi(ad, ekler)) return g[0];
      const i = sira[ad] ?? 0;
      sira[ad] = i + 1;
      const asil = asillar[ad]?.[i];
      return d.deger(g) === maske && typeof asil === 'string' ? d.yaz(g, asil) : g[0];
    });
  }
  return m;
}

/**
 * Servis senaryosu içeriğinin GÖRÜNÜMÜ (saklanan içerik değişmez): gövdede, başlıklarda ve yolda adı gizli alanların değeri maskeli.
 * Akış senaryosunda (tur 'akis') her adımın içeriği aynı kuralla. İçerik nesne değilse aynen döner.
 * @param {unknown} icerik @param {ReadonlyArray<string>} ekler @param {string} maske @returns {unknown}
 */
export function servisIceriginiMaskele(icerik, ekler, maske) {
  if (!icerik || typeof icerik !== 'object' || Array.isArray(icerik)) return icerik;
  const i = /** @type {Record<string, unknown>} */ ({ ...icerik });
  if (typeof i.govde === 'string') i.govde = adaGoreMaskele(i.govde, ekler, maske).metin;
  if (i.basliklar && typeof i.basliklar === 'object' && !Array.isArray(i.basliklar)) {
    i.basliklar = Object.fromEntries(Object.entries(i.basliklar).map(([a, d]) => [a,
      typeof d === 'string' && gizliAdMi(a, ekler) && sirMi(d, maske) ? maske : typeof d === 'string' ? adaGoreMaskele(d, ekler, maske).metin : d]));
  }
  const http = /** @type {Record<string, unknown> | null} */ (i.http && typeof i.http === 'object' ? i.http : null);
  if (http && typeof http.yol === 'string') i.http = { ...http, yol: adaGoreMaskele(http.yol, ekler, maske, { bicim: 'yol' }).metin };
  if (i.adimlar && typeof i.adimlar === 'object' && !Array.isArray(i.adimlar)) {
    i.adimlar = Object.fromEntries(Object.entries(i.adimlar).map(([k, a]) => [k, servisIceriginiMaskele(a, ekler, maske)]));
  }
  return i;
}

/** Ek ad biçimi: harf, rakam, "-", "_" (2–40). */
export const EK_GIZLI_AD = /^[\p{L}\p{N}_-]{2,40}$/u;
export const EN_COK_EK_GIZLI_AD = 50;
