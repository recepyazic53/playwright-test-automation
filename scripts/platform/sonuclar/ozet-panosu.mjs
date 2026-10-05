// ÖZET PANOSU — DEPO (sunucu). Sonuçlar > Genel > Özet panosunun düzeni PROJE BAŞINA tek kayıttır ve kasada şifreli durur
// (ayarlar tablosu, anahtar "ozetPanosu": { [projeId]: { surum, kartlar, guncellenme } }); yedeğe ayarlar tablosuyla birlikte girer.
// SQL kartı sonuçları ("ozetPanosuSonuclari") yedeğe GİRMEZ (yedek.mjs > YEDEK_DISI_AYARLAR); yedekten yüklenen panoda boş gelir.
// Kayıt yoksa varsayılan düzen (bugünkü Özet) kullanılır. Biçim ve doğrulama: pano-duzeni.mjs (saf, arayüzle ORTAK).
// Eski (sıralı) biçimdeki kayıt okunurken ızgara konumlarına çevrilir ve "goc: true" döner; arayüz göçü bir kez kaydeder (GET yazmaz).
// SQL kartlarının son sonucu ayrı anahtarda önbellektir ("ozetPanosuSonuclari": { [projeId]: { [kartId]: sonuç } }); yalnız
// MASKELİ sonuç yazılır (pano-sql.mjs). Sonuç, kartın hedefi ve sorgusunun imzasıyla saklanır: kart değişince eski sonuç gösterilmez.
// Kart panodan kaldırılınca önbellekteki sonucu da silinir. Silinmiş projelerin kayıtları ilk yazmada temizlenir.
// NOT: import.meta KULLANILMAZ.
import { createHash } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, projeGetir } from '../veritabani/depo.mjs';
import { PanoHatasi, duzenTemizle, eskiBicimMi, varsayilanDuzen, varsayilanMi } from './pano-duzeni.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./pano-duzeni.mjs').PanoDuzeni} PanoDuzeni */
/** @typedef {{ zaman: string; sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean; gizliSutunlar: string[]; satirSiniri: number }} SqlSonucu */

export const PANO_AYAR_ANAHTARI = 'ozetPanosu';
export const PANO_SONUC_ANAHTARI = 'ozetPanosuSonuclari';
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;

/** @param {unknown} v @param {string} ad */
function kimlik(v, ad) {
  if (typeof v !== 'string' || !KIMLIK.test(v)) throw new DepoHatasi(`"${ad}" geçersiz.`);
  return v;
}

/** @param {Veritabani} vt @param {string} anahtar @returns {Record<string, any>} */
function kayit(vt, anahtar) {
  const a = ayarGetir(vt, anahtar);
  return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, any>} */ (a) : {};
}

/** Silinmiş projelerin kayıtlarını atar. @param {Veritabani} vt @param {Record<string, any>} k */
function projeleriAyikla(vt, k) {
  return Object.fromEntries(Object.entries(k).filter(([p]) => KIMLIK.test(p) && Boolean(projeGetir(vt, p))));
}

/** Kartın sonuç imzası (hedef + sorgu): değişince önbellekteki sonuç geçersizdir. @param {{ ayar?: Record<string, any> }} kart */
export function sqlImzasi(kart) {
  const a = kart.ayar ?? {};
  return createHash('sha256').update(JSON.stringify([a.hedef ?? null, a.sorgu ?? ''])).digest('hex').slice(0, 24);
}

/**
 * Projenin panosu: düzen (kayıt yoksa varsayılan), varsayılanla aynı mı, eski biçimden çevrildi mi (goc) ve SQL kartlarının
 * önbellekteki son sonuçları. Kayıt bozuksa varsayılan düzen döner (kullanıcı yeniden düzenleyebilir).
 * @param {Veritabani} vt @param {string} projeId
 * @returns {{ duzen: PanoDuzeni; varsayilan: boolean; kayitli: boolean; goc: boolean; sqlSonuclari: Record<string, SqlSonucu> }}
 */
export function panoGetir(vt, projeId) {
  kimlik(projeId, 'projeId');
  const ham = kayit(vt, PANO_AYAR_ANAHTARI)[projeId];
  /** @type {PanoDuzeni} */
  let duzen = varsayilanDuzen();
  let kayitli = false;
  let goc = false;
  if (ham) {
    try { duzen = duzenTemizle(ham); kayitli = true; goc = eskiBicimMi(ham); } catch { duzen = varsayilanDuzen(); }
  }
  const onbellek = kayit(vt, PANO_SONUC_ANAHTARI)[projeId] ?? {};
  /** @type {Record<string, SqlSonucu>} */
  const sqlSonuclari = {};
  for (const k of duzen.kartlar) {
    if (k.tur !== 'sql') continue;
    const s = onbellek[k.id];
    if (s && typeof s === 'object' && s.imza === sqlImzasi(k) && s.sonuc && typeof s.sonuc.zaman === 'string') sqlSonuclari[k.id] = s.sonuc;
  }
  return { duzen, varsayilan: varsayilanMi(duzen), kayitli, goc, sqlSonuclari };
}

/**
 * Düzeni doğrulayıp kaydeder; panodan kalkan ya da sorgusu / hedefi değişen SQL kartlarının önbelleği silinir.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} ham @returns {PanoDuzeni}
 */
export function panoKaydet(vt, projeId, ham) {
  kimlik(projeId, 'projeId');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  /** @type {PanoDuzeni} */
  let duzen;
  try { duzen = duzenTemizle(ham); } catch (e) {
    if (e instanceof PanoHatasi) throw new DepoHatasi(e.message);
    throw e;
  }
  const tum = projeleriAyikla(vt, kayit(vt, PANO_AYAR_ANAHTARI));
  tum[projeId] = { ...duzen, guncellenme: new Date().toISOString() };
  ayarYaz(vt, PANO_AYAR_ANAHTARI, tum);
  const sonuclar = projeleriAyikla(vt, kayit(vt, PANO_SONUC_ANAHTARI));
  const eski = sonuclar[projeId] ?? {};
  const imzalar = new Map(duzen.kartlar.filter((k) => k.tur === 'sql').map((k) => [k.id, sqlImzasi(k)]));
  const kalan = Object.fromEntries(Object.entries(eski).filter(([id, s]) => s && imzalar.get(id) === s.imza));
  if (Object.keys(kalan).length !== Object.keys(eski).length) {
    if (Object.keys(kalan).length) sonuclar[projeId] = kalan; else delete sonuclar[projeId];
    ayarYaz(vt, PANO_SONUC_ANAHTARI, sonuclar);
  }
  return duzen;
}

/**
 * SQL kartı sonuç önbelleğini bütünüyle siler (yedekten pano düzeni alınınca; kartlar boş gelir, "Yenile" ile dolar).
 * @param {Veritabani} vt
 */
export function panoSonuclariniTemizle(vt) {
  vt.calistir('DELETE FROM ayarlar WHERE anahtar = ?', [PANO_SONUC_ANAHTARI]);
}

/**
 * SQL kartının son (maskeli) sonucunu önbelleğe yazar (pano-sql.mjs). @param {Veritabani} vt @param {string} projeId
 * @param {string} kartId @param {SqlSonucu} sonuc
 */
export function sqlSonucuYaz(vt, projeId, kartId, sonuc) {
  const kart = panoGetir(vt, projeId).duzen.kartlar.find((k) => k.id === kartId && k.tur === 'sql');
  if (!kart) throw new DepoHatasi('SQL kartı bulunamadı.');
  const sonuclar = projeleriAyikla(vt, kayit(vt, PANO_SONUC_ANAHTARI));
  sonuclar[projeId] = { ...(sonuclar[projeId] ?? {}), [kartId]: { imza: sqlImzasi(kart), sonuc } };
  ayarYaz(vt, PANO_SONUC_ANAHTARI, sonuclar);
}
