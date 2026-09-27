// KOŞU KARŞILAŞTIRMA HESABI (saf; veritabanı / ağ yok): iki koşunun (A = önceki / referans, B = karşılaştırılan) senaryolarını,
// bir senaryonun adımlarını, servis isteğinin kontrollerini ve koşuda yakalanan mesajları eşler; değişim sınıfını çıkarır.
// Ekran ve servis karşılaştırması (sonuclar/karsilastirma.mjs) ile HTML karşılaştırma raporu (html-rapor.mjs) bunu kullanır.
//   Değişim sınıfları (A durumu → B durumu; "kalan" = basarisiz | hata):
//     yeni-kalan  A'da kalmamış, B'de kalan          duzelen   A'da kalan, B'de başarılı
//     hep-kalan   ikisinde de kalan                  hep-gecen ikisinde de başarılı
//     yalniz-a    yalnız A koşusunda var             yalniz-b  yalnız B koşusunda var
//     degisti     başka bir durum değişimi (ör. başarılı → atlanan)      ayni   aynı durum (atlanan / durduruldu)
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).

/** Varsayılan sıralama (önce dikkat isteyenler). */
export const DEGISIM_SINIFLARI = Object.freeze(['yeni-kalan', 'yalniz-b', 'degisti', 'duzelen', 'yalniz-a', 'hep-kalan', 'ayni', 'hep-gecen']);
export const DEGISIM_ETIKETLERI = Object.freeze({
  'yeni-kalan': 'yeni kalan', duzelen: 'düzelen', 'hep-kalan': 'hep kalan', 'hep-gecen': 'hep geçen',
  'yalniz-a': "yalnız A'da", 'yalniz-b': "yalnız B'de", degisti: 'durum değişti', ayni: 'aynı'
});
/** "Yalnız değişenler" süzgecinde gizlenenler. */
const DEGISMEYEN = new Set(['hep-gecen', 'hep-kalan', 'ayni']);
const KALAN = new Set(['basarisiz', 'hata']);
/** Adım / senaryo eşleştirmesinde en çok bu kadar öğe hizalanır (fazlası sırayla eklenir). */
const HIZALAMA_SINIRI = 1500;

/** @param {string | null | undefined} d */
export const kalanMi = (d) => KALAN.has(String(d ?? ''));

/**
 * @param {string | null | undefined} a A tarafının durumu (yoksa null) @param {string | null | undefined} b
 * @returns {string | null}
 */
export function degisimSinifi(a, b) {
  if (!a && !b) return null;
  if (!b) return 'yalniz-a';
  if (!a) return 'yalniz-b';
  const ka = kalanMi(a);
  const kb = kalanMi(b);
  if (ka && kb) return 'hep-kalan';
  if (kb) return 'yeni-kalan';
  if (ka && b === 'basarili') return 'duzelen';
  if (a === 'basarili' && b === 'basarili') return 'hep-gecen';
  return a === b ? 'ayni' : 'degisti';
}

/** @param {string | null} sinif */
export const degistiMi = (sinif) => Boolean(sinif) && !DEGISMEYEN.has(String(sinif));

/**
 * Aynı anahtar bir koşuda birden çok kez geçerse (ör. aynı senaryo iki kez koştu) sırayla "#2", "#3" eklenir.
 * @template {{ anahtar: string }} T @param {T[]} liste @returns {Map<string, T>}
 */
function anahtarla(liste) {
  /** @type {Map<string, T>} */
  const m = new Map();
  /** @type {Map<string, number>} */
  const sayac = new Map();
  for (const x of liste) {
    const n = (sayac.get(x.anahtar) ?? 0) + 1;
    sayac.set(x.anahtar, n);
    m.set(n > 1 ? `${x.anahtar}#${n}` : x.anahtar, x);
  }
  return m;
}

/**
 * @typedef {{ anahtar: string; baslik: string; grup: string; durum: string; sureMs: number | null } & Record<string, unknown>} SenaryoTarafi
 * @typedef {{ basarili: number; kalan: number; atlanan: number; durduruldu: number }} KarsilastirmaSayilari
 */

/**
 * Senaryo eşleme: her anahtar için A ve B tarafı, değişim sınıfı, süre farkı (B − A). Sıra: DEGISIM_SINIFLARI, sonra grup, başlık.
 * @param {SenaryoTarafi[]} a @param {SenaryoTarafi[]} b
 */
export function senaryolariKarsilastir(a, b) {
  const ma = anahtarla(a);
  const mb = anahtarla(b);
  const anahtarlar = [...new Set([...ma.keys(), ...mb.keys()])];
  const sira = new Map(DEGISIM_SINIFLARI.map((s, i) => [s, i]));
  const satirlar = anahtarlar.map((anahtar) => {
    const x = ma.get(anahtar) ?? null;
    const y = mb.get(anahtar) ?? null;
    const ref = /** @type {SenaryoTarafi} */ (y ?? x);
    const degisim = /** @type {string} */ (degisimSinifi(x?.durum ?? null, y?.durum ?? null));
    return {
      anahtar, baslik: ref.baslik, grup: ref.grup, a: x, b: y, degisim, degisti: degistiMi(degisim),
      sureFarkiMs: x && y && typeof x.sureMs === 'number' && typeof y.sureMs === 'number' ? y.sureMs - x.sureMs : null
    };
  });
  satirlar.sort((p, r) => (sira.get(p.degisim) ?? 99) - (sira.get(r.degisim) ?? 99)
    || String(p.grup).localeCompare(String(r.grup), 'tr') || String(p.baslik).localeCompare(String(r.baslik), 'tr'));
  /** @type {Record<string, number>} */
  const sayim = Object.fromEntries(DEGISIM_SINIFLARI.map((s) => [s, 0]));
  for (const s of satirlar) sayim[s.degisim] = (sayim[s.degisim] ?? 0) + 1;
  return { senaryolar: satirlar, sayim, degisen: satirlar.filter((s) => s.degisti).length };
}

/**
 * Özet farkı (B − A). Oran puan olarak; süre ms.
 * @param {{ sayilar: KarsilastirmaSayilari; oran: number | null; sureMs: number | null }} a @param {typeof a} b
 */
export function ozetFarki(a, b) {
  /** @param {keyof KarsilastirmaSayilari} k */
  const f = (k) => (b.sayilar[k] ?? 0) - (a.sayilar[k] ?? 0);
  return {
    basarili: f('basarili'), kalan: f('kalan'), atlanan: f('atlanan'), durduruldu: f('durduruldu'),
    oran: a.oran === null || b.oran === null ? null : b.oran - a.oran,
    sureMs: typeof a.sureMs === 'number' && typeof b.sureMs === 'number' ? b.sureMs - a.sureMs : null
  };
}

/**
 * İki diziyi anahtara göre sırayı koruyarak hizalar (en uzun ortak alt dizi). Eşleşmeyenler kendi yerinde tek taraflı kalır.
 * @template T @param {T[]} a @param {T[]} b @param {(x: T) => string} anahtar
 * @returns {Array<{ a: T | null; b: T | null }>}
 */
export function hizala(a, b, anahtar) {
  /** @type {Array<{ a: T | null; b: T | null }>} */
  const cikti = [];
  const n = Math.min(a.length, HIZALAMA_SINIRI);
  const m = Math.min(b.length, HIZALAMA_SINIRI);
  const ka = a.slice(0, n).map(anahtar);
  const kb = b.slice(0, m).map(anahtar);
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = ka[i] === kb[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { cikti.push({ a: a[i], b: b[j] }); i++; j++; }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { cikti.push({ a: a[i], b: null }); i++; }
    else { cikti.push({ a: null, b: b[j] }); j++; }
  }
  for (; i < a.length; i++) cikti.push({ a: a[i], b: null });
  for (; j < b.length; j++) cikti.push({ a: null, b: b[j] });
  return cikti;
}

/**
 * Adımları ada göre hizalar; her satırda değişim sınıfı ve süre farkı.
 * @template {{ ad: string; durum: string; sureMs?: number | null }} T @param {T[]} a @param {T[]} b
 */
export function adimlariKarsilastir(a, b) {
  return hizala(a, b, (x) => String(x.ad).trim().toLocaleLowerCase('tr')).map(({ a: x, b: y }) => {
    const degisim = /** @type {string} */ (degisimSinifi(x?.durum ?? null, y?.durum ?? null));
    return {
      ad: String((y ?? x)?.ad ?? ''), a: x, b: y, degisim, degisti: degistiMi(degisim),
      sureFarkiMs: x && y && typeof x.sureMs === 'number' && typeof y.sureMs === 'number' ? y.sureMs - x.sureMs : null
    };
  });
}

/**
 * Kontrol listesini düzleştirir (VEYA grubunun altındakiler "VEYA › ad" yoluyla).
 * @param {unknown} liste @param {string} [on]
 * @returns {Array<{ yol: string; ad: string; gecti: boolean; aciklama: string }>}
 */
export function kontrolleriDuzlestir(liste, on = '') {
  /** @type {Array<{ yol: string; ad: string; gecti: boolean; aciklama: string }>} */
  const cikti = [];
  for (const k of Array.isArray(liste) ? liste : []) {
    if (!k || typeof k !== 'object') continue;
    const ad = k.tur === 'veya' ? 'Şunlardan biri (VEYA)' : String(k.ad ?? '');
    const yol = on ? `${on} › ${ad}` : ad;
    cikti.push({ yol, ad, gecti: k.gecti === true, aciklama: typeof k.aciklama === 'string' ? k.aciklama : '' });
    if (Array.isArray(k.alt) && k.alt.length) cikti.push(...kontrolleriDuzlestir(k.alt, yol));
  }
  return cikti;
}

/**
 * Kontrol sonuçları farkı (ada / yola göre hizalı).
 * @param {unknown} a @param {unknown} b
 */
export function kontrolleriKarsilastir(a, b) {
  const durum = (/** @type {{ gecti: boolean } | null} */ k) => (k ? (k.gecti ? 'basarili' : 'basarisiz') : null);
  return hizala(kontrolleriDuzlestir(a), kontrolleriDuzlestir(b), (k) => k.yol).map(({ a: x, b: y }) => {
    const degisim = /** @type {string} */ (degisimSinifi(durum(x), durum(y)));
    return { ad: (y ?? x)?.yol ?? '', a: x, b: y, degisim, degisti: degistiMi(degisim) };
  });
}

/**
 * Koşuda yakalanan mesajların farkı (kaynak + kalıp). Sıra: yalnız B (yeni), yalnız A (kaybolan), ikisinde.
 * @param {Array<{ kaynak: string; kalip: string; metin: string; sayi?: number; beklenen?: boolean }>} a @param {typeof a} b
 */
export function yakalananlariKarsilastir(a, b) {
  /** @param {typeof a} liste */
  const grupla = (liste) => {
    /** @type {Map<string, { kaynak: string; kalip: string; metin: string; sayi: number; beklenen: boolean }>} */
    const m = new Map();
    for (const x of liste ?? []) {
      const k = `${x.kaynak}\u0000${x.kalip}`;
      const g = m.get(k) ?? { kaynak: x.kaynak, kalip: x.kalip, metin: x.metin, sayi: 0, beklenen: true };
      g.sayi += Math.max(1, Number(x.sayi) || 1);
      g.beklenen = g.beklenen && Boolean(x.beklenen);
      m.set(k, g);
    }
    return m;
  };
  const ga = grupla(a);
  const gb = grupla(b);
  const sira = { 'yalniz-b': 0, 'yalniz-a': 1, ikisinde: 2 };
  return [...new Set([...ga.keys(), ...gb.keys()])].map((k) => {
    const x = ga.get(k) ?? null;
    const y = gb.get(k) ?? null;
    const ref = /** @type {NonNullable<typeof x>} */ (y ?? x);
    return {
      kaynak: ref.kaynak, kalip: ref.kalip, metinA: x?.metin ?? null, metinB: y?.metin ?? null, sayiA: x?.sayi ?? 0, sayiB: y?.sayi ?? 0,
      beklenen: ref.beklenen, durum: /** @type {'yalniz-a' | 'yalniz-b' | 'ikisinde'} */ (x && y ? 'ikisinde' : x ? 'yalniz-a' : 'yalniz-b')
    };
  }).sort((p, r) => sira[p.durum] - sira[r.durum] || Number(p.beklenen) - Number(r.beklenen) || p.kalip.localeCompare(r.kalip, 'tr'));
}
