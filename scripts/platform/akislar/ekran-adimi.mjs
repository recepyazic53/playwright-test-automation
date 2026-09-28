// EKRAN ADIMI (uçtan uca akış) — SAF modül: sunucu (servis-deposu.mjs yapısal doğrulama, servis-akislari.mjs değer izi) ve
// arayüz (/arayuz/ekran-adimi.mjs: akış tasarımı) ORTAK kullanır; node: modülü içe aktarmaz.
//
// Uçtan uca akış, servis akışının içeriğinde "uctanUca: true" işaretli hâlidir; adımları sırayla servis (operasyon / kayıtlı
// senaryo), ekran ve SQL adımı olabilir. Ekran adımı:
//   { id, ad, tur: 'ekran', senaryoId, ezmeler: { <senaryo alan anahtarı>: 'metin ${akis:Ad} …' }, okumalar: [{ ad, kaynak: 'ekran',
//     yol: <CSS seçici>, gizli? }], hataOlursaDevam? }
//   - senaryoId: bir ekran senaryosu (senaryonun ekran modeli ve akışıyla koşar; model koşucusu).
//   - ezmeler: senaryonun alan değerleri bu koşu için ezilir; değerde ${akis:Ad} önceki adımların okuduğu değerle dolar.
//   - okumalar: senaryo bitince ekrandan okunan değerler (seçicinin ilk görünür öğesi: girdi / seçim ise değeri, değilse metni);
//     sonraki adımlara ${akis:Ad} ile taşınır. Gizli okuma raporda maskelenir.
// NOT: import.meta KULLANILMAZ.

/** Akış değeri adı (servis akışı okumalarıyla aynı kural). */
export const EKRAN_OKUMA_ADI = /^[A-Za-z_][A-Za-z0-9_-]{0,59}$/;
/** Senaryo alan anahtarı (ezilen alan). */
export const EZME_ANAHTARI = /^[A-Za-z_][A-Za-z0-9_.-]{0,119}$/;
export const EN_COK_EZME = 50;
export const EN_COK_EKRAN_OKUMASI = 20;
const EN_UZUN_EZME = 2000;
const EN_UZUN_SECICI = 300;
const AKIS_KALIBI = /\$\{\s*akis:([A-Za-z_][A-Za-z0-9_-]{0,59})\s*\}/g;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * @typedef {{ ad: string; kaynak: 'ekran'; yol: string; gizli?: boolean }} EkranOkumasi
 * @typedef {{ id: string; ad: string; tur: 'ekran'; senaryoId: string; ezmeler: Record<string, string>; okumalar: EkranOkumasi[];
 *   hataOlursaDevam?: boolean }} EkranAdimi
 */

/** Adım bir ekran adımı mı? @param {unknown} a */
export function ekranAdimiMi(a) {
  return nesneMi(a) && a.tur === 'ekran';
}

/**
 * Ekran adımının yapısal doğrulaması (senaryonun varlığı / alan anahtarları sunucuda ayrıca denetlenir).
 * @param {unknown} ham @param {string} yer "3. adım" @param {string} id adımın (tekil) kimliği
 * @returns {{ tanim: EkranAdimi | null; hatalar: string[] }}
 */
export function ekranAdimiDogrula(ham, yer, id) {
  /** @type {string[]} */
  const hatalar = [];
  const a = nesneMi(ham) ? ham : {};
  const senaryoId = typeof a.senaryoId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(a.senaryoId) ? a.senaryoId : '';
  if (!senaryoId) hatalar.push(`${yer}: ekran senaryosu seçilmedi.`);
  /** @type {Record<string, string>} */
  const ezmeler = {};
  if (a.ezmeler !== undefined && a.ezmeler !== null) {
    if (!nesneMi(a.ezmeler)) hatalar.push(`${yer}: "ezmeler" bir nesne olmalıdır.`);
    else {
      const girdiler = Object.entries(a.ezmeler);
      if (girdiler.length > EN_COK_EZME) hatalar.push(`${yer}: en çok ${EN_COK_EZME} alan ezilebilir.`);
      for (const [anahtar, deger] of girdiler.slice(0, EN_COK_EZME)) {
        if (!EZME_ANAHTARI.test(anahtar)) { hatalar.push(`${yer}: "${anahtar.slice(0, 60)}" geçerli bir alan anahtarı değil.`); continue; }
        if (typeof deger !== 'string' && typeof deger !== 'number' && typeof deger !== 'boolean') { hatalar.push(`${yer}: "${anahtar}" alanının değeri metin olmalıdır.`); continue; }
        const metin = String(deger);
        if (metin.length > EN_UZUN_EZME) { hatalar.push(`${yer}: "${anahtar}" alanının değeri en çok ${EN_UZUN_EZME} karakter olabilir.`); continue; }
        if (/[\r\n]/.test(metin)) { hatalar.push(`${yer}: "${anahtar}" alanının değeri tek satır olmalıdır.`); continue; }
        ezmeler[anahtar] = metin;
      }
    }
  }
  const hamOkumalar = a.okumalar === undefined || a.okumalar === null ? [] : a.okumalar;
  /** @type {EkranOkumasi[]} */
  const okumalar = [];
  if (!Array.isArray(hamOkumalar) || hamOkumalar.length > EN_COK_EKRAN_OKUMASI) hatalar.push(`${yer}: "okumalar" en çok ${EN_COK_EKRAN_OKUMASI} öğelik bir dizi olmalıdır.`);
  else {
    const adlar = new Set();
    hamOkumalar.forEach((y, k) => {
      const o = nesneMi(y) ? y : {};
      const ad = typeof o.ad === 'string' ? o.ad.trim() : '';
      if (!EKRAN_OKUMA_ADI.test(ad)) { hatalar.push(`${yer}, ${k + 1}. okuma: ad geçersiz (harf ya da "_" ile başlar; harf, rakam, "_", "-").`); return; }
      if (adlar.has(ad)) { hatalar.push(`${yer}: "${ad}" iki kez okunuyor.`); return; }
      adlar.add(ad);
      if (o.kaynak !== undefined && o.kaynak !== 'ekran') { hatalar.push(`${yer}, "${ad}" okuması: ekran adımında değer yalnız ekrandan okunur.`); return; }
      const secici = typeof o.yol === 'string' ? o.yol.trim() : '';
      if (!secici || secici.length > EN_UZUN_SECICI || /[\r\n]/.test(secici)) { hatalar.push(`${yer}, "${ad}" okuması: seçici boş olamaz (tek satır, en çok ${EN_UZUN_SECICI} karakter).`); return; }
      okumalar.push({ ad, kaynak: 'ekran', yol: secici, ...(typeof o.gizli === 'boolean' ? { gizli: o.gizli } : {}) });
    });
  }
  if (hatalar.length) return { tanim: null, hatalar };
  return {
    tanim: {
      id, ad: typeof a.ad === 'string' && a.ad.trim() ? a.ad.trim().slice(0, 100) : yer, tur: 'ekran', senaryoId, ezmeler, okumalar,
      ...(a.hataOlursaDevam === true ? { hataOlursaDevam: true } : {})
    },
    hatalar
  };
}

/** Metindeki ${akis:Ad} adları (sırayla, tekil). @param {string} metin @returns {string[]} */
export function akisAdlari(metin) {
  return [...new Set([...String(metin ?? '').matchAll(AKIS_KALIBI)].map((m) => m[1]))];
}

/** Ekran adımının kullandığı akış değerleri (ezmelerdeki ${akis:Ad}). @param {unknown} a @returns {string[]} */
export function ekranAdimiAkisDegerleri(a) {
  const ezmeler = nesneMi(a) && nesneMi(a.ezmeler) ? a.ezmeler : {};
  return [...new Set(Object.values(ezmeler).flatMap((d) => akisAdlari(String(d))))];
}

/**
 * Ezmelerdeki ${akis:Ad} yer tutucularını akış değerleriyle doldurur. Değeri olmayan ad "eksik"e yazılır (alan doldurulmaz).
 * @param {Record<string, string>} ezmeler @param {Record<string, string>} degerler
 * @returns {{ degerler: Record<string, string>; eksik: string[] }}
 */
export function ezmeleriCoz(ezmeler, degerler) {
  /** @type {Set<string>} */
  const eksik = new Set();
  /** @type {Record<string, string>} */
  const sonuc = {};
  for (const [anahtar, metin] of Object.entries(ezmeler ?? {})) {
    sonuc[anahtar] = String(metin).replace(AKIS_KALIBI, (_, ad) => {
      const d = degerler[ad];
      if (typeof d !== 'string') { eksik.add(ad); return ''; }
      return d;
    });
  }
  return { degerler: sonuc, eksik: [...eksik] };
}
