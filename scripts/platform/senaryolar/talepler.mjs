// TALEP NO (saf modül; sunucu ve arayüz ORTAK — /arayuz/talepler.mjs): ekran senaryosu, servis senaryosu ve uçtan uca akış
// içeriğinde "talepler" dizisi (icerik.talepler: string[]). Talep numarası serbest metindir (biçim zorunlu değil); baştaki ve sondaki
// boşluklar kırpılır, aynı talep (büyük / küçük harf duyarsız) bir senaryoda bir kez yer alır. Nöbetçi hiçbir dış sisteme bağlanmaz:
// talep no yalnız metin olarak saklanır (gizli bilgi sayılmaz; ekran senaryosunda düz, servis / akış içeriğinde içerikle birlikte şifreli).
// Yazım farkını önleme: talepAnahtari harf ve rakam dışındakileri atıp küçük harfe çevirir ("TALEP-101" ile "talep 101" aynı anahtar);
// arayüz yazarken projedeki benzer talebi önerir (benzerTalep).

/** Bir talep numarasının en uzun hâli (karakter). */
export const TALEP_EN_UZUN = 60;
/** Bir senaryodaki en çok talep sayısı. */
export const TALEP_EN_COK = 20;

/** Karşılaştırma için küçük harf (Türkçe kurallı). @param {string} t */
export const talepKucuk = (t) => t.toLocaleLowerCase('tr');

/** Benzerlik anahtarı: yalnız harf ve rakam, küçük harf ("TALEP-101" = "talep 101"). @param {string} t */
export const talepAnahtari = (t) => talepKucuk(t).replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Tek talebi temizler: metin değilse ya da boşsa null; denetim karakteri içeriyorsa ya da çok uzunsa hata metni.
 * @param {unknown} d @returns {{ talep: string | null; hata: string | null }}
 */
export function talepTemizle(d) {
  if (typeof d !== 'string') return { talep: null, hata: d === undefined || d === null ? null : 'Talep no metin olmalıdır.' };
  const t = d.trim();
  if (!t) return { talep: null, hata: null };
  if ([...t].some((c) => { const k = c.charCodeAt(0); return k < 32 || k === 127 || k === 0x2028 || k === 0x2029; })) return { talep: null, hata: 'Talep no satır sonu ya da denetim karakteri içeremez.' };
  if (t.length > TALEP_EN_UZUN) return { talep: null, hata: `Talep no en çok ${TALEP_EN_UZUN} karakter olabilir.` };
  return { talep: t, hata: null };
}

/**
 * Talep listesini doğrular: null / [] → boş liste; her öğe kırpılır, boşlar atılır, aynı talep (harf duyarsız) bir kez kalır.
 * @param {unknown} d @returns {{ talepler: string[]; hata: string | null }}
 */
export function talepleriAyikla(d) {
  if (d === undefined || d === null) return { talepler: [], hata: null };
  if (!Array.isArray(d)) return { talepler: [], hata: '"talepler" bir liste olmalıdır.' };
  /** @type {string[]} */
  const talepler = [];
  const gorulen = new Set();
  for (const x of d) {
    const { talep, hata } = talepTemizle(x);
    if (hata) return { talepler: [], hata };
    if (!talep || gorulen.has(talepKucuk(talep))) continue;
    gorulen.add(talepKucuk(talep));
    talepler.push(talep);
  }
  if (talepler.length > TALEP_EN_COK) return { talepler: [], hata: `Bir senaryoda en çok ${TALEP_EN_COK} talep olabilir.` };
  return { talepler, hata: null };
}

/**
 * Kayıtlı içerikteki talepler (bozuk / eski kayıtta boş liste; kayıttaki gibi, yeniden doğrulanmadan kırpılır).
 * @param {unknown} icerik @returns {string[]}
 */
export function icerikTalepleri(icerik) {
  const l = icerik && typeof icerik === 'object' && !Array.isArray(icerik) ? /** @type {Record<string, unknown>} */ (icerik).talepler : null;
  return Array.isArray(l) ? l.filter((x) => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

/** Talep listesinde bu talep var mı (harf duyarsız, tam eşleşme). @param {readonly string[]} talepler @param {string} talep */
export function talepEslesir(talepler, talep) {
  const k = talepKucuk(String(talep ?? '').trim());
  return Boolean(k) && talepler.some((t) => talepKucuk(t) === k);
}

/**
 * Yazılan talep için projedeki karşılık: aynısı (harf duyarsız) varsa { tur: 'ayni', talep: kayıtlı yazım }; yalnız benzerlik anahtarı
 * aynıysa { tur: 'benzer', talep }; yoksa null.
 * @param {string} yazilan @param {readonly string[]} mevcutlar
 * @returns {{ tur: 'ayni' | 'benzer'; talep: string } | null}
 */
export function benzerTalep(yazilan, mevcutlar) {
  const t = String(yazilan ?? '').trim();
  if (!t) return null;
  const ayni = mevcutlar.find((m) => talepKucuk(m) === talepKucuk(t));
  if (ayni) return { tur: 'ayni', talep: ayni };
  const a = talepAnahtari(t);
  const benzer = a ? mevcutlar.find((m) => talepAnahtari(m) === a) : undefined;
  return benzer ? { tur: 'benzer', talep: benzer } : null;
}

/** Talepleri doğal sırayla dizer ("T-2" < "T-10"). @param {string} a @param {string} b */
export const talepSirala = (a, b) => a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
