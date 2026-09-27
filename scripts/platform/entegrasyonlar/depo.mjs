// ENTEGRASYON BAĞLANTILARI DEPOSU — kullanıcının oluşturduğu bağlantılar (Ayarlar > Entegrasyonlar). Tümü kasada ŞİFRELİ
// (ayarlar tablosu, anahtar "entegrasyonlar"; şema göçü gerekmez) ve her bağlantı bir projeye aittir (projeId). Gizli alanlar
// (token, parola, webhook adresi) API görünümünde yalnız { dolu, maske } olarak döner; kaydederken boş gönderilen gizli alan
// mevcut değeri korur. Silinmiş projelerin bağlantıları ilk yazmada temizlenir.
// Bağlantı: { id, projeId, tur, ad, etkin, alanlar, olaylar, ortamIdleri ([]: tüm ortamlar), durum, olusturulma, guncellenme }
// durum: { sonuc: 'bagli' | 'hata', zaman, mesaj } | null (null: denenmedi). Mesajlar gizli değer içermez.
// NOT: import.meta KULLANILMAZ.
import { randomUUID } from 'node:crypto';
import { ayarGetir, ayarYaz, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { EntegrasyonHatasi, MASKE, gizlileriMaskele } from './istek.mjs';
import { gizliDegerler, turBul } from './katalog.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ sonuc: 'bagli' | 'hata'; zaman: string; mesaj: string }} BaglantiDurumu */
/**
 * @typedef {{ id: string; projeId: string; tur: string; ad: string; etkin: boolean; alanlar: Record<string, unknown>; olaylar: string[];
 *   ortamIdleri: string[]; durum: BaglantiDurumu | null; olusturulma: string; guncellenme: string }} Baglanti
 */

export const ENTEGRASYON_AYAR_ANAHTARI = 'entegrasyonlar';
export const EN_COK_BAGLANTI = 200;
const KIMLIK = /^[A-Za-z0-9_-]{1,200}$/;

/** @param {Veritabani} vt @returns {Baglanti[]} */
export function tumBaglantilar(vt) {
  const k = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, ENTEGRASYON_AYAR_ANAHTARI));
  const liste = k && Array.isArray(k.baglantilar) ? k.baglantilar : [];
  return /** @type {Baglanti[]} */ (liste.filter((b) => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.projeId === 'string'));
}

/** @param {Veritabani} vt @param {Baglanti[]} liste */
function yaz(vt, liste) {
  /** @type {Map<string, boolean>} */
  const projeVar = new Map();
  const kalan = liste.filter((b) => {
    if (!projeVar.has(b.projeId)) projeVar.set(b.projeId, !!projeGetir(vt, b.projeId));
    return projeVar.get(b.projeId);
  });
  ayarYaz(vt, ENTEGRASYON_AYAR_ANAHTARI, { baglantilar: kalan });
}

/** @param {unknown} v @param {string} ad */
function kimlik(v, ad) {
  if (typeof v !== 'string' || !KIMLIK.test(v)) throw new EntegrasyonHatasi(`"${ad}" geçersiz.`);
  return v;
}

/**
 * Bağlantıyı (ham; gizliler çözülmüş) bulur. projeId verilirse o projeye ait olmalıdır.
 * @param {Veritabani} vt @param {string} id @param {string} [projeId] @returns {Baglanti}
 */
export function baglantiGetir(vt, id, projeId) {
  const b = tumBaglantilar(vt).find((x) => x.id === id && (projeId === undefined || x.projeId === projeId));
  if (!b) throw new EntegrasyonHatasi('Bağlantı bulunamadı.');
  return b;
}

/** API görünümü: gizli alanlar { dolu, maske }. @param {Baglanti} b */
export function baglantiGorunumu(b) {
  const t = turBul(b.tur);
  /** @type {Record<string, unknown>} */
  const alanlar = {};
  for (const a of t?.alanlar ?? []) {
    const v = b.alanlar[a.ad];
    alanlar[a.ad] = a.gizli ? { dolu: typeof v === 'string' && v.length > 0, maske: MASKE } : v ?? null;
  }
  return {
    id: b.id, projeId: b.projeId, tur: b.tur, turAdi: t?.ad ?? b.tur, ad: b.ad, etkin: b.etkin, alanlar, olaylar: b.olaylar, ortamIdleri: b.ortamIdleri,
    durum: b.durum, olusturulma: b.olusturulma, guncellenme: b.guncellenme
  };
}

/** @param {Veritabani} vt @param {string} projeId */
export function baglantilariListele(vt, projeId) {
  kimlik(projeId, 'projeId');
  return tumBaglantilar(vt).filter((b) => b.projeId === projeId).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map(baglantiGorunumu);
}

/**
 * Formdan gelen alanları türün tanımına göre doğrular; gizli alan boşsa mevcut değer korunur.
 * @param {string} tur @param {unknown} girdi @param {Record<string, unknown>} [mevcut] @returns {Record<string, unknown>}
 */
export function alanlariHazirla(tur, girdi, mevcut = {}) {
  const t = turBul(tur);
  if (!t) throw new EntegrasyonHatasi('Bilinmeyen entegrasyon türü.');
  const g = girdi && typeof girdi === 'object' && !Array.isArray(girdi) ? /** @type {Record<string, unknown>} */ (girdi) : {};
  /** @type {Record<string, unknown>} */
  const sonuc = {};
  for (const a of t.alanlar) {
    let v = g[a.ad];
    if (a.gizli) {
      if (typeof v === 'string' && v.length > 4000) throw new EntegrasyonHatasi(`"${a.etiket}" çok uzun.`);
      if (typeof v === 'string' && v.length > 0) sonuc[a.ad] = v;
      else if (typeof mevcut[a.ad] === 'string' && /** @type {string} */ (mevcut[a.ad]).length > 0) sonuc[a.ad] = mevcut[a.ad];
      else if (a.zorunlu) throw new EntegrasyonHatasi(`"${a.etiket}" zorunludur.`);
      else sonuc[a.ad] = '';
      if (a.tur === 'adres' && sonuc[a.ad]) adresDogrula(a.etiket, String(sonuc[a.ad]));
      continue;
    }
    if (v === undefined || v === null || v === '') v = a.varsayilan;
    if (a.tur === 'onay') { sonuc[a.ad] = v === true; continue; }
    if (a.tur === 'sayi') {
      if (v === undefined || v === null || v === '') {
        if (a.zorunlu) throw new EntegrasyonHatasi(`"${a.etiket}" zorunludur.`);
        sonuc[a.ad] = null;
        continue;
      }
      const n = Number(v);
      if (!Number.isInteger(n) || (a.enAz !== undefined && n < a.enAz) || (a.enCok !== undefined && n > a.enCok)) {
        throw new EntegrasyonHatasi(`"${a.etiket}" ${a.enAz ?? ''}–${a.enCok ?? ''} arasında bir tam sayı olmalıdır.`);
      }
      sonuc[a.ad] = n;
      continue;
    }
    const m = typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v);
    if (!m) {
      if (a.zorunlu) throw new EntegrasyonHatasi(`"${a.etiket}" zorunludur.`);
      sonuc[a.ad] = '';
      continue;
    }
    if (a.tur === 'secim') {
      if (!a.secenekler?.some(([d]) => d === m)) throw new EntegrasyonHatasi(`"${a.etiket}" için geçersiz seçim.`);
    } else if (a.tur === 'adres') {
      adresDogrula(a.etiket, m);
    } else if (m.length > (a.tur === 'cok-satir' ? 10_000 : 500) || (a.tur !== 'cok-satir' && /[\u0000-\u001f]/.test(m))) {
      throw new EntegrasyonHatasi(`"${a.etiket}" geçersiz ya da çok uzun.`);
    }
    sonuc[a.ad] = m;
  }
  return sonuc;
}

/** @param {string} etiket @param {string} adres */
function adresDogrula(etiket, adres) {
  let u;
  try { u = new URL(adres); } catch { throw new EntegrasyonHatasi(`"${etiket}" geçerli bir adres değil (https://… biçiminde yazın).`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new EntegrasyonHatasi(`"${etiket}" yalnız http:// ya da https:// olabilir.`);
  if (adres.length > 2000) throw new EntegrasyonHatasi(`"${etiket}" çok uzun.`);
}

/**
 * Deneme sonucunu (istemciden gelen) güvenli biçime çevirir; geçersizse null.
 * @param {unknown} d @param {string[]} gizliler @returns {BaglantiDurumu | null}
 */
function durumCevir(d, gizliler) {
  if (!d || typeof d !== 'object') return null;
  const x = /** @type {Record<string, unknown>} */ (d);
  if (x.sonuc !== 'bagli' && x.sonuc !== 'hata') return null;
  const zaman = typeof x.zaman === 'string' && !Number.isNaN(Date.parse(x.zaman)) ? new Date(x.zaman).toISOString() : new Date().toISOString();
  return { sonuc: x.sonuc, zaman, mesaj: gizlileriMaskele(String(x.mesaj ?? '').slice(0, 500), gizliler) };
}

/**
 * Yeni bağlantı ya da düzenleme. girdi: { id?, tur, ad, alanlar, olaylar?, ortamIdleri?, etkin?, sonDeneme? }.
 * Alanlar değişirse (ve yeni bir deneme sonucu verilmediyse) durum "denenmedi"ye döner.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} girdi
 */
export function baglantiKaydet(vt, projeId, girdi) {
  kimlik(projeId, 'projeId');
  if (!projeGetir(vt, projeId)) throw new EntegrasyonHatasi('Proje bulunamadı.');
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new EntegrasyonHatasi('Bağlantı bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const liste = tumBaglantilar(vt);
  const mevcut = g.id === undefined || g.id === null || g.id === '' ? null : liste.find((b) => b.id === kimlik(g.id, 'id') && b.projeId === projeId);
  if (g.id && !mevcut) throw new EntegrasyonHatasi('Bağlantı bulunamadı.');
  const tur = mevcut ? mevcut.tur : String(g.tur ?? '');
  const t = turBul(tur);
  if (!t) throw new EntegrasyonHatasi('Bilinmeyen entegrasyon türü.');
  if (mevcut && g.tur !== undefined && g.tur !== mevcut.tur) throw new EntegrasyonHatasi('Bağlantının türü değiştirilemez; yeni bir bağlantı oluşturun.');
  const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
  if (!ad || ad.length > 120 || /[\u0000-\u001f]/.test(ad)) throw new EntegrasyonHatasi('Bağlantı adı 1–120 karakter olmalıdır.');
  if (liste.some((b) => b.projeId === projeId && b.id !== mevcut?.id && b.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) {
    throw new EntegrasyonHatasi(`Bu projede "${ad}" adında bir bağlantı zaten var.`);
  }
  const alanlar = alanlariHazirla(tur, g.alanlar, mevcut?.alanlar);
  const olaylar = Array.isArray(g.olaylar) ? [...new Set(g.olaylar.filter((o) => typeof o === 'string'))] : mevcut?.olaylar ?? t.olaylar.map((o) => o.ad);
  for (const o of olaylar) if (!t.olaylar.some((x) => x.ad === o)) throw new EntegrasyonHatasi('Geçersiz olay.');
  const projeOrtamlari = new Set(ortamlariListele(vt, projeId).map((o) => o.id));
  const ortamIdleri = Array.isArray(g.ortamIdleri)
    ? [...new Set(g.ortamIdleri.filter((o) => typeof o === 'string' && projeOrtamlari.has(o)))]
    : mevcut?.ortamIdleri ?? [];
  const etkin = g.etkin === undefined ? mevcut?.etkin ?? true : g.etkin === true;
  const simdi = new Date().toISOString();
  const alanlarDegisti = !mevcut || JSON.stringify(mevcut.alanlar) !== JSON.stringify(alanlar);
  const yeniDeneme = durumCevir(g.sonDeneme, gizliDegerler(t, alanlar));
  /** @type {Baglanti} */
  const b = {
    id: mevcut?.id ?? randomUUID(), projeId, tur, ad, etkin, alanlar, olaylar, ortamIdleri,
    durum: yeniDeneme ?? (alanlarDegisti ? null : mevcut?.durum ?? null),
    olusturulma: mevcut?.olusturulma ?? simdi, guncellenme: simdi
  };
  if (!mevcut && liste.length >= EN_COK_BAGLANTI) throw new EntegrasyonHatasi(`En fazla ${EN_COK_BAGLANTI} bağlantı oluşturulabilir.`);
  yaz(vt, mevcut ? liste.map((x) => (x.id === b.id ? b : x)) : [...liste, b]);
  return baglantiGorunumu(b);
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id @param {boolean} etkin */
export function baglantiEtkinlestir(vt, projeId, id, etkin) {
  const liste = tumBaglantilar(vt);
  const b = liste.find((x) => x.id === id && x.projeId === projeId);
  if (!b) throw new EntegrasyonHatasi('Bağlantı bulunamadı.');
  const yeni = { ...b, etkin: etkin === true, guncellenme: new Date().toISOString() };
  yaz(vt, liste.map((x) => (x.id === id ? yeni : x)));
  return baglantiGorunumu(yeni);
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id */
export function baglantiSil(vt, projeId, id) {
  const liste = tumBaglantilar(vt);
  if (!liste.some((x) => x.id === id && x.projeId === projeId)) throw new EntegrasyonHatasi('Bağlantı bulunamadı.');
  yaz(vt, liste.filter((x) => x.id !== id));
  return true;
}

/**
 * Son deneme / gönderim sonucunu yazar (mesaj bağlantının gizli değerleriyle maskelenir).
 * @param {Veritabani} vt @param {string} id @param {{ basarili: boolean; mesaj: string }} s @returns {BaglantiDurumu | null}
 */
export function durumYaz(vt, id, s) {
  const liste = tumBaglantilar(vt);
  const b = liste.find((x) => x.id === id);
  if (!b) return null;
  const t = turBul(b.tur);
  /** @type {BaglantiDurumu} */
  const durum = { sonuc: s.basarili ? 'bagli' : 'hata', zaman: new Date().toISOString(), mesaj: gizlileriMaskele(String(s.mesaj ?? '').slice(0, 500), t ? gizliDegerler(t, b.alanlar) : []) };
  yaz(vt, liste.map((x) => (x.id === id ? { ...x, durum } : x)));
  return durum;
}
