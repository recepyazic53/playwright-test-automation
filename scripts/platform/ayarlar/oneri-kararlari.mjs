// SENARYO ÖNERİSİ KARARLARI (Senaryolar > ekran > "Senaryo önerileri"): kullanıcının öneriyi kabul ("Senaryo olarak ekle") ya da
// reddetme olayları — kural tabanlı öğrenme için (senaryo-onerileri.mjs > kararAgirliklari: sık reddedilen tür / alanın puanı düşer,
// kabul edilen yükselir; reddedilen öneri o ekranda yeniden gösterilmez, "sonra" denen bir hafta gizlenir). Kasada şifreli (ayarlar,
// anahtar "oneri-kararlari"), proje kapsamlı. GİZLİ DEĞER YOK: yalnız öneri kimliği / türü / nedeni, alan KİMLİKLERİ, karar, zaman.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../senaryolar/senaryo-onerileri.d.mts').OneriKarari} OneriKarari */

export const ONERI_KARARLARI_ANAHTARI = 'oneri-kararlari';
/** Proje başına saklanan en çok olay (eskiler düşer). */
export const PROJE_BASINA_EN_COK_KARAR = 300;
/** Tüm projelerde en çok olay. */
export const EN_COK_KARAR = 2000;
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const ONERI_TURLERI = ['zorunlu', 'sinir', 'kosullu', 'kombinasyon', 'uyari'];
const NEDENLER = ['risk', 'kapsam', 'pairwise', 'sinir', 'zorunlu'];
const RED_NEDENLERI = ['gereksiz', 'yanlis', 'sonra'];

/** @param {unknown} d */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** @param {Veritabani} vt @returns {Array<OneriKarari & { projeId: string }>} */
function tumu(vt) {
  try {
    const a = ayarGetir(vt, ONERI_KARARLARI_ANAHTARI);
    return nesneMi(a) && Array.isArray(/** @type {Record<string, unknown>} */ (a).olaylar)
      ? /** @type {Array<OneriKarari & { projeId: string }>} */ (/** @type {Record<string, unknown[]>} */ (a).olaylar.filter(nesneMi))
      : [];
  } catch {
    return [];
  }
}

/** Projenin kararları (eskiden yeniye; kasa kilitli / okunamazsa boş). @param {Veritabani} vt @param {string} projeId @returns {OneriKarari[]} */
export function oneriKararlariniOku(vt, projeId) {
  return tumu(vt).filter((k) => k.projeId === projeId).map(({ projeId: _p, ...k }) => k);
}

/**
 * Kararı doğrular ve ekler. g: { ekranId, kimlik, tur, neden?, alanlar?, karar: 'kabul' | 'red', redNedeni? }.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} girdi @param {Date} [simdi]
 * @returns {OneriKarari}
 */
export function oneriKarariKaydet(vt, projeId, girdi, simdi = new Date()) {
  if (!nesneMi(girdi)) throw new DepoHatasi('Öneri kararı bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  if (typeof g.ekranId !== 'string' || !KIMLIK.test(g.ekranId)) throw new DepoHatasi('"ekranId" geçersiz.');
  if (typeof g.kimlik !== 'string' || !g.kimlik.trim() || g.kimlik.length > 400) throw new DepoHatasi('"kimlik" geçersiz.');
  if (typeof g.tur !== 'string' || !ONERI_TURLERI.includes(g.tur)) throw new DepoHatasi('"tur" geçersiz.');
  if (g.karar !== 'kabul' && g.karar !== 'red') throw new DepoHatasi('"karar" kabul ya da red olmalıdır.');
  if (g.neden !== undefined && g.neden !== null && (typeof g.neden !== 'string' || !NEDENLER.includes(g.neden))) throw new DepoHatasi('"neden" geçersiz.');
  const redNedeni = g.redNedeni === undefined || g.redNedeni === null || g.redNedeni === '' ? null : g.redNedeni;
  if (redNedeni !== null && (typeof redNedeni !== 'string' || !RED_NEDENLERI.includes(redNedeni))) throw new DepoHatasi('"redNedeni" gereksiz, yanlis ya da sonra olmalıdır.');
  if (g.karar === 'kabul' && redNedeni) throw new DepoHatasi('Kabulde red nedeni olmaz.');
  const alanlar = Array.isArray(g.alanlar) ? [...new Set(g.alanlar.filter((a) => typeof a === 'string' && a.length <= 200))].slice(0, 50) : [];
  /** @type {OneriKarari} */
  const karar = {
    zaman: simdi.toISOString(), ekranId: g.ekranId, kimlik: g.kimlik.trim(), tur: g.tur, neden: typeof g.neden === 'string' ? g.neden : null,
    alanlar, karar: g.karar, redNedeni: /** @type {OneriKarari['redNedeni']} */ (redNedeni)
  };
  const liste = [...tumu(vt), { projeId, ...karar }];
  const projeninki = liste.filter((k) => k.projeId === projeId);
  const atilacak = new Set(projeninki.slice(0, Math.max(0, projeninki.length - PROJE_BASINA_EN_COK_KARAR)));
  ayarYaz(vt, ONERI_KARARLARI_ANAHTARI, { olaylar: liste.filter((k) => !atilacak.has(k)).slice(-EN_COK_KARAR) });
  return karar;
}

/** Projenin (ekran verilirse yalnız o ekranın) kararlarını siler; silinen sayı. @param {Veritabani} vt @param {string} projeId @param {string | null} [ekranId] */
export function oneriKararlariniSifirla(vt, projeId, ekranId = null) {
  const liste = tumu(vt);
  const kalan = liste.filter((k) => k.projeId !== projeId || (ekranId !== null && k.ekranId !== ekranId));
  if (kalan.length !== liste.length) ayarYaz(vt, ONERI_KARARLARI_ANAHTARI, { olaylar: kalan });
  return liste.length - kalan.length;
}
