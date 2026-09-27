// VERİTABANLARI (mantıksal) — Ayarlar > Entegrasyonlar > Veritabanları. SQL adımı bir bağlantıya değil, projenin mantıksal
// veritabanına bağlanır ({ veritabaniId }); koşuda ortamın eşlemesi (eslemeler[ortamId] → "Veritabanı bağlantısı" türünde
// entegrasyon bağlantısı) kullanılır. Böylece aynı senaryo TEST'te TEST bağlantısına, CANLI'da CANLI bağlantısına gider.
// Kayıt: { id, projeId, ad, aciklama, eslemeler: { [ortamId]: baglantiId }, olusturulma, guncellenme }. Eşleme yoksa o ortamda
// "kullanılmaz": SQL adımı sorgu ATMADAN anlaşılır hatayla kalır. Kayıtlar kasada ŞİFRELİ (ayarlar tablosu, anahtar
// "sqlVeritabanlari"; şema göçü gerekmez). Silinmiş projelerin kayıtları ilk yazmada temizlenir.
// Eşleme kuralları: bağlantı projede ve türü "veritabani" olmalı; bağlantının ortam kısıtı (ortamIdleri) tanımlıysa o ortamı
// içermeli. Farklı sürücü türleri eşlenebilir (uyarı döner: SQL söz dizimi ortamlar arasında uyuşmayabilir).
// NOT: import.meta KULLANILMAZ.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, ortamGetir, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { tumBaglantilar } from '../entegrasyonlar/depo.mjs';
import { SURUCULER } from '../entegrasyonlar/veritabani-suruculeri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../entegrasyonlar/depo.mjs').Baglanti} Baglanti */
/**
 * @typedef {{ id: string; projeId: string; ad: string; aciklama: string; eslemeler: Record<string, string>; olusturulma: string;
 *   guncellenme: string }} MantiksalVeritabani
 */

export const VERITABANI_AYAR_ANAHTARI = 'sqlVeritabanlari';
export const EN_COK_VERITABANI = 200;
const KIMLIK = /^[A-Za-z0-9_-]{1,200}$/;
const TUR = 'veritabani';

/** @param {unknown} v @param {string} ad */
function kimlik(v, ad) {
  if (typeof v !== 'string' || !KIMLIK.test(v)) throw new DepoHatasi(`"${ad}" geçersiz.`);
  return v;
}

/** @param {Veritabani} vt @returns {MantiksalVeritabani[]} */
export function tumVeritabanlari(vt) {
  const k = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, VERITABANI_AYAR_ANAHTARI));
  const liste = k && Array.isArray(k.kayitlar) ? k.kayitlar : [];
  return /** @type {MantiksalVeritabani[]} */ (liste.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.projeId === 'string')
    .map((x) => ({ ...x, eslemeler: x.eslemeler && typeof x.eslemeler === 'object' && !Array.isArray(x.eslemeler) ? x.eslemeler : {} })));
}

/** @param {Veritabani} vt @param {MantiksalVeritabani[]} liste */
function yaz(vt, liste) {
  /** @type {Map<string, boolean>} */
  const projeVar = new Map();
  const kalan = liste.filter((b) => {
    if (!projeVar.has(b.projeId)) projeVar.set(b.projeId, !!projeGetir(vt, b.projeId));
    return projeVar.get(b.projeId);
  });
  ayarYaz(vt, VERITABANI_AYAR_ANAHTARI, { kayitlar: kalan });
}

/** Projenin mantıksal veritabanları (ada göre). @param {Veritabani} vt @param {string} projeId */
export function veritabanlariListele(vt, projeId) {
  kimlik(projeId, 'projeId');
  return tumVeritabanlari(vt).filter((x) => x.projeId === projeId).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id @returns {MantiksalVeritabani | undefined} */
export function veritabaniGetir(vt, projeId, id) {
  return tumVeritabanlari(vt).find((x) => x.id === id && x.projeId === projeId);
}

/** Sürücü etiketi. @param {Baglanti} b */
const surucuEtiketi = (b) => SURUCULER[/** @type {keyof typeof SURUCULER} */ (String(b.alanlar.surucu))]?.etiket ?? String(b.alanlar.surucu ?? '');

/**
 * Tek eşlemenin denetimi: hata metni ya da null.
 * @param {Baglanti | undefined} b @param {{ id: string; ad: string }} ortam
 */
function eslemeHatasi(b, ortam) {
  if (!b) return `${ortam.ad} ortamına seçilen bağlantı bulunamadı.`;
  if (b.tur !== TUR) return `"${b.ad}" bir veritabanı bağlantısı değil.`;
  if (Array.isArray(b.ortamIdleri) && b.ortamIdleri.length && !b.ortamIdleri.includes(ortam.id)) {
    return `"${b.ad}" bağlantısı ${ortam.ad} ortamında kullanılamaz (bağlantının "Ortamlar" seçiminde yok).`;
  }
  return null;
}

/**
 * Eşlemelerin uyarıları (kaydı engellemez): farklı sürücü türleri, kapalı bağlantı.
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, string>} eslemeler @returns {string[]}
 */
export function eslemeUyarilari(vt, projeId, eslemeler) {
  const baglantilar = tumBaglantilar(vt).filter((b) => b.projeId === projeId);
  const secili = Object.values(eslemeler).map((id) => baglantilar.find((b) => b.id === id)).filter((b) => b !== undefined);
  /** @type {string[]} */
  const uyarilar = [];
  const suruculer = [...new Set(secili.map(surucuEtiketi))];
  if (suruculer.length > 1) uyarilar.push(`Ortamlarda farklı sürücüler var (${suruculer.join(', ')}): SQL söz dizimi ortamlar arasında uyuşmayabilir.`);
  for (const b of secili) if (!b.etkin) uyarilar.push(`"${b.ad}" bağlantısı kapalı; o ortamda SQL adımı çalışmaz.`);
  return [...new Set(uyarilar)];
}

/**
 * Yeni veritabanı ya da düzenleme. girdi: { id?, ad, aciklama?, eslemeler: { [ortamId]: baglantiId | '' } }.
 * Boş eşleme: o ortamda kullanılmaz. Dönüş: { veritabani, uyarilar }.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} girdi
 * @returns {{ veritabani: MantiksalVeritabani; uyarilar: string[] }}
 */
export function veritabaniKaydet(vt, projeId, girdi) {
  kimlik(projeId, 'projeId');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Veritabanı bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const liste = tumVeritabanlari(vt);
  const mevcut = g.id === undefined || g.id === null || g.id === '' ? null : liste.find((x) => x.id === kimlik(g.id, 'id') && x.projeId === projeId);
  if (g.id && !mevcut) throw new DepoHatasi('Veritabanı bulunamadı.');
  const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
  if (!ad || ad.length > 120 || /[\u0000-\u001f]/.test(ad)) throw new DepoHatasi('Veritabanı adı 1–120 karakter olmalıdır.');
  if (liste.some((x) => x.projeId === projeId && x.id !== mevcut?.id && x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) {
    throw new DepoHatasi(`Bu projede "${ad}" adında bir veritabanı zaten var.`);
  }
  const aciklama = typeof g.aciklama === 'string' ? g.aciklama.trim() : '';
  if (aciklama.length > 500 || /[\u0000-\u0009\u000b-\u001f]/.test(aciklama)) throw new DepoHatasi('Açıklama en çok 500 karakter olabilir.');
  const hamEsleme = g.eslemeler === undefined ? mevcut?.eslemeler ?? {} : g.eslemeler;
  if (!hamEsleme || typeof hamEsleme !== 'object' || Array.isArray(hamEsleme)) throw new DepoHatasi('"eslemeler" bir nesne olmalıdır.');
  const ortamlar = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o]));
  const baglantilar = tumBaglantilar(vt).filter((b) => b.projeId === projeId);
  /** @type {Record<string, string>} */
  const eslemeler = {};
  for (const [ortamId, baglantiId] of Object.entries(/** @type {Record<string, unknown>} */ (hamEsleme))) {
    if (baglantiId === '' || baglantiId === null || baglantiId === undefined) continue;
    const ortam = ortamlar.get(ortamId);
    if (!ortam) throw new DepoHatasi('Eşlemedeki ortam bu projede yok.');
    const hata = eslemeHatasi(baglantilar.find((b) => b.id === kimlik(baglantiId, 'baglantiId')), ortam);
    if (hata) throw new DepoHatasi(hata);
    eslemeler[ortamId] = /** @type {string} */ (baglantiId);
  }
  if (!mevcut && liste.length >= EN_COK_VERITABANI) throw new DepoHatasi(`En fazla ${EN_COK_VERITABANI} veritabanı tanımlanabilir.`);
  const simdi = new Date().toISOString();
  /** @type {MantiksalVeritabani} */
  const kayit = { id: mevcut?.id ?? randomUUID(), projeId, ad, aciklama, eslemeler, olusturulma: mevcut?.olusturulma ?? simdi, guncellenme: simdi };
  yaz(vt, mevcut ? liste.map((x) => (x.id === kayit.id ? kayit : x)) : [...liste, kayit]);
  return { veritabani: kayit, uyarilar: eslemeUyarilari(vt, projeId, eslemeler) };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id */
export function veritabaniSil(vt, projeId, id) {
  const liste = tumVeritabanlari(vt);
  if (!liste.some((x) => x.id === id && x.projeId === projeId)) throw new DepoHatasi('Veritabanı bulunamadı.');
  yaz(vt, liste.filter((x) => x.id !== id));
  return true;
}

/**
 * Bağlantının eşli olduğu veritabanları (bağlantı silme uyarısı, "Veritabanına çevir…" önerisi).
 * @param {Veritabani} vt @param {string} projeId @param {string} baglantiId
 * @returns {Array<{ id: string; ad: string; ortamIdleri: string[] }>}
 */
export function baglantininVeritabanlari(vt, projeId, baglantiId) {
  return veritabanlariListele(vt, projeId)
    .map((v) => ({ id: v.id, ad: v.ad, ortamIdleri: Object.entries(v.eslemeler).filter(([, b]) => b === baglantiId).map(([o]) => o) }))
    .filter((x) => x.ortamIdleri.length > 0);
}

/**
 * Silinen bağlantının eşlemelerini kaldırır (o ortamlar "kullanılmaz" olur; adım "bağlantı tanımlı değil" hatasıyla kalır).
 * @param {Veritabani} vt @param {string} projeId @param {string} baglantiId @returns {number} değişen veritabanı sayısı
 */
export function baglantiEslemeleriniKaldir(vt, projeId, baglantiId) {
  let n = 0;
  const liste = tumVeritabanlari(vt).map((v) => {
    if (v.projeId !== projeId || !Object.values(v.eslemeler).includes(baglantiId)) return v;
    n++;
    return { ...v, eslemeler: Object.fromEntries(Object.entries(v.eslemeler).filter(([, b]) => b !== baglantiId)), guncellenme: new Date().toISOString() };
  });
  if (n) yaz(vt, liste);
  return n;
}

/**
 * Koşu anında çözüm: veritabanı → ortamın eşlemesi → bağlantı kimliği. Eşleme yoksa anlaşılır hata (sorgu atılmaz).
 * @param {Veritabani} vt @param {string} projeId @param {string} veritabaniId @param {string | undefined} ortamId
 * @returns {{ veritabani: MantiksalVeritabani; baglantiId: string }}
 */
export function eslemedenBaglanti(vt, projeId, veritabaniId, ortamId) {
  const v = veritabaniGetir(vt, projeId, veritabaniId);
  if (!v) throw new DepoHatasi('SQL adımının veritabanı bulunamadı (Ayarlar > Entegrasyonlar > Veritabanları).');
  if (!ortamId) throw new DepoHatasi(`"${v.ad}" için ortam bilinmiyor; SQL adımı ortam seçilerek koşar.`);
  const baglantiId = v.eslemeler[ortamId];
  if (!baglantiId) {
    const ortam = ortamGetir(vt, ortamId);
    throw new DepoHatasi(`"${v.ad}" için ${ortam?.ad ?? 'bu'} ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).`);
  }
  return { veritabani: v, baglantiId };
}

/** Arayüz görünümü (eşlemeler + bağlantı adları; gizli alan yok). @param {Veritabani} vt @param {string} projeId */
export function veritabaniGorunumleri(vt, projeId) {
  const baglantilar = tumBaglantilar(vt).filter((b) => b.projeId === projeId);
  const ortamlar = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o]));
  return veritabanlariListele(vt, projeId).map((v) => ({
    id: v.id, ad: v.ad, aciklama: v.aciklama, eslemeler: v.eslemeler,
    uyarilar: [
      ...eslemeUyarilari(vt, projeId, v.eslemeler),
      ...Object.entries(v.eslemeler).map(([o, b]) => {
        const ortam = ortamlar.get(o);
        return ortam ? eslemeHatasi(baglantilar.find((x) => x.id === b), ortam) : null;
      }).filter((x) => x !== null)
    ]
  }));
}
