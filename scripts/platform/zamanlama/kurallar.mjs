// ZAMANLANMIŞ KOŞU KURALLARI (Planlı koşular) — kullanıcının kararı; kasada ŞİFRELİ ayar olarak saklanır:
//   ayarlar["zamanlanmis-kosular"]      = { kurallar: Kural[] }
//   ayarlar["zamanlanmis-kosu-gecmisi"] = { [kuralId]: Tetikleme[] }   (kural başına son 20 tetikleme; en yeni başta)
// Canlı / riskli işaretli ortamda kural, kullanıcı "Canlı ortamda planlı koşuya izin veriyorum" onayını vermeden kaydedilmez.
// Kural kaydedilince / etkinleştirilince "tuketilen" o ana çekilir: kayıttan önceki bir zaman tetiklenmez.
// NOT: import.meta KULLANILMAZ. Tipler: kurallar.d.mts.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, ekranlariListele, ortamGetir } from '../veritabani/depo.mjs';
import { servisAkisiGetir } from '../servisler/servis-deposu.mjs';
import { tumBaglantilar } from '../entegrasyonlar/depo.mjs';
import { turBul } from '../entegrasyonlar/katalog.mjs';
import { sonrakiZaman, zamanDogrula, zamanMetni } from './takvim.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./kurallar.d.mts').Kural} Kural */
/** @typedef {import('./kurallar.d.mts').Tetikleme} Tetikleme */

export const KURAL_AYAR_ANAHTARI = 'zamanlanmis-kosular';
export const GECMIS_AYAR_ANAHTARI = 'zamanlanmis-kosu-gecmisi';
export const GECMIS_SINIRI = 20;
export const EN_COK_KURAL = 50;
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Canlı / riskli ortam mı? TEK TANIM: guvenlik/ortam-riski.mjs (arayüzdeki koşu onayı, "npm run kos", servis ortam türü ve
 * sunucu denetimi aynı fonksiyonu kullanır).
 * @param {{ ad: string; varsayilan: boolean; ayarlar?: Record<string, unknown> }} o
 */
export const ortamRiskliMi = (o) => riskliOrtamMi(o);

/** @param {Veritabani} vt @returns {Kural[]} */
export function tumKurallar(vt) {
  const a = /** @type {{ kurallar?: unknown } | undefined} */ (ayarGetir(vt, KURAL_AYAR_ANAHTARI));
  return Array.isArray(a?.kurallar) ? /** @type {Kural[]} */ (a.kurallar) : [];
}

/** @param {Veritabani} vt @param {Kural[]} kurallar */
const kurallariYaz = (vt, kurallar) => ayarYaz(vt, KURAL_AYAR_ANAHTARI, { kurallar });

/** @param {Veritabani} vt @returns {Record<string, Tetikleme[]>} */
export function tumGecmis(vt) {
  const a = ayarGetir(vt, GECMIS_AYAR_ANAHTARI);
  return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, Tetikleme[]>} */ (a) : {};
}

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** @param {unknown} d @returns {string[]} */
const kimlikListesi = (d) => (Array.isArray(d) ? [...new Set(d.filter((x) => typeof x === 'string' && KIMLIK.test(x)))] : []);

/**
 * Kuralı doğrular ve kaydeder (yeni ya da düzenleme). girdi: { id?, ad, ortamId, kapsam: { senaryolar: 'tum' | 'ekranlar' | 'yok',
 * ekranIdleri?, servisAkisIdleri?, uctanUcaAkisIdleri? }, zaman, etkin?, bildirimBaglantiId?, canliOnay? }
 * uctanUcaAkisIdleri: uçtan uca akışlar (servis, ekran ve SQL adımları; akislar/uctan-uca.mjs). Riskli ortamda canlı onayı kural
 * kaydında alınır (diğer kapsamlarla aynı); koşuda izinler aynı biçimde denetlenir.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} girdi @param {{ simdi?: Date }} [s]
 * @returns {Kural}
 */
export function kuralKaydet(vt, projeId, girdi, s = {}) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Kural bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const simdi = (s.simdi ?? new Date()).toISOString();
  const kurallar = tumKurallar(vt);
  const mevcut = g.id === undefined || g.id === null || g.id === '' ? null : kurallar.find((k) => k.id === g.id && k.projeId === projeId);
  if (g.id && !mevcut) throw new DepoHatasi('Planlı koşu bulunamadı.');
  if (!mevcut && kurallar.filter((k) => k.projeId === projeId).length >= EN_COK_KURAL) throw new DepoHatasi(`Bir projede en çok ${EN_COK_KURAL} planlı koşu olabilir.`);

  const ad = typeof g.ad === 'string' ? g.ad.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
  if (!ad || ad.length > 80) throw new DepoHatasi('Ad 1–80 karakter olmalıdır.');
  if (kurallar.some((k) => k.projeId === projeId && k.id !== mevcut?.id && k.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) {
    throw new DepoHatasi(`"${ad}" adında bir planlı koşu zaten var.`);
  }

  const ortam = ortamGetir(vt, kimlik(g.ortamId, 'ortamId'));
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const riskli = ortamRiskliMi(ortam);
  if (riskli && g.canliOnay !== true) {
    throw new DepoHatasi(`"${ortam.ad}" bir Canlı ortam (ya da türü seçilmemiş). Kaydetmek için "Canlı ortamda planlı koşuya izin veriyorum" kutusunu işaretleyin.`);
  }

  const k = /** @type {Record<string, unknown>} */ (g.kapsam && typeof g.kapsam === 'object' ? g.kapsam : {});
  const senaryolar = k.senaryolar === 'ekranlar' || k.senaryolar === 'yok' ? k.senaryolar : k.senaryolar === 'tum' || k.senaryolar === undefined ? 'tum' : null;
  if (!senaryolar) throw new DepoHatasi('Kapsam "tum", "ekranlar" ya da "yok" olmalıdır.');
  const ekranlar = new Map(ekranlariListele(vt, projeId).map((e) => [e.id, e]));
  const ekranIdleri = senaryolar === 'ekranlar' ? kimlikListesi(k.ekranIdleri) : [];
  if (senaryolar === 'ekranlar' && !ekranIdleri.length) throw new DepoHatasi('En az bir ekran seçin.');
  for (const id of ekranIdleri) if (!ekranlar.has(id)) throw new DepoHatasi('Seçilen ekranlardan biri bulunamadı.');
  const servisAkisIdleri = kimlikListesi(k.servisAkisIdleri);
  for (const id of servisAkisIdleri) {
    const a = servisAkisiGetir(vt, id);
    if (!a || a.projeId !== projeId || a.tur === 'oturum') throw new DepoHatasi('Seçilen servis akışlarından biri bulunamadı.');
  }
  const uctanUcaAkisIdleri = kimlikListesi(k.uctanUcaAkisIdleri);
  for (const id of uctanUcaAkisIdleri) {
    const a = servisAkisiGetir(vt, id);
    if (!a || a.projeId !== projeId || a.tur !== 'akis' || a.icerik.uctanUca !== true) throw new DepoHatasi('Seçilen uçtan uca akışlardan biri bulunamadı.');
  }
  if (senaryolar === 'yok' && !servisAkisIdleri.length && !uctanUcaAkisIdleri.length) {
    throw new DepoHatasi('Koşulacak bir şey seçin: senaryolar, en az bir servis akışı ya da en az bir uçtan uca akış.');
  }

  const zaman = zamanDogrula(g.zaman);

  let bildirimBaglantiId = null;
  if (typeof g.bildirimBaglantiId === 'string' && g.bildirimBaglantiId) {
    const b = tumBaglantilar(vt).find((x) => x.id === g.bildirimBaglantiId && x.projeId === projeId);
    if (!b || !turBul(b.tur)?.olayGonder) throw new DepoHatasi('Bildirim bağlantısı bulunamadı (Ayarlar > Entegrasyonlar\'da bir webhook bağlantısı olmalı).');
    bildirimBaglantiId = b.id;
  }

  const etkin = g.etkin === undefined ? (mevcut ? mevcut.etkin : true) : g.etkin === true;
  /** @type {Kural} */
  const kural = {
    id: mevcut?.id ?? randomUUID(), projeId, ad, ortamId: ortam.id,
    kapsam: { senaryolar, ekranIdleri, servisAkisIdleri, uctanUcaAkisIdleri }, zaman, etkin, bildirimBaglantiId, canliOnay: riskli && g.canliOnay === true,
    tuketilen: simdi, olusturulma: mevcut?.olusturulma ?? simdi, guncellenme: simdi
  };
  kurallariYaz(vt, mevcut ? kurallar.map((x) => (x.id === kural.id ? kural : x)) : [...kurallar, kural]);
  return kural;
}

/**
 * Kuralı etkinleştirir / pasifleştirir. Etkinleştirmede "tuketilen" o ana çekilir (pasifken geçen zamanlar koşulmaz).
 * @param {Veritabani} vt @param {string} projeId @param {string} id @param {boolean} etkin @param {{ simdi?: Date }} [s]
 */
export function kuralEtkinlestir(vt, projeId, id, etkin, s = {}) {
  const kurallar = tumKurallar(vt);
  const k = kurallar.find((x) => x.id === id && x.projeId === projeId);
  if (!k) throw new DepoHatasi('Planlı koşu bulunamadı.');
  const simdi = (s.simdi ?? new Date()).toISOString();
  const yeni = { ...k, etkin, guncellenme: simdi, ...(etkin && !k.etkin ? { tuketilen: simdi } : {}) };
  kurallariYaz(vt, kurallar.map((x) => (x.id === id ? yeni : x)));
  return yeni;
}

/** Kuralı ve geçmişini siler. @param {Veritabani} vt @param {string} projeId @param {string} id */
export function kuralSil(vt, projeId, id) {
  const kurallar = tumKurallar(vt);
  if (!kurallar.some((x) => x.id === id && x.projeId === projeId)) throw new DepoHatasi('Planlı koşu bulunamadı.');
  kurallariYaz(vt, kurallar.filter((x) => x.id !== id));
  const gecmis = tumGecmis(vt);
  if (gecmis[id]) { delete gecmis[id]; ayarYaz(vt, GECMIS_AYAR_ANAHTARI, gecmis); }
  return true;
}

/** Tetiklenen zamanı "tüketildi" olarak işaretler (aynı zaman ikinci kez tetiklenmez). @param {Veritabani} vt @param {string} id @param {string} zaman */
export function tuketilenYaz(vt, id, zaman) {
  const kurallar = tumKurallar(vt);
  if (!kurallar.some((x) => x.id === id)) return;
  kurallariYaz(vt, kurallar.map((x) => (x.id === id ? { ...x, tuketilen: zaman } : x)));
}

/**
 * Tetikleme ekler ya da (aynı id varsa) günceller; kural başına son GECMIS_SINIRI kayıt tutulur.
 * @param {Veritabani} vt @param {string} kuralId @param {Tetikleme} t
 */
export function tetiklemeYaz(vt, kuralId, t) {
  const gecmis = tumGecmis(vt);
  const liste = (gecmis[kuralId] ?? []).filter((x) => x.id !== t.id);
  const eski = (gecmis[kuralId] ?? []).findIndex((x) => x.id === t.id);
  if (eski >= 0) liste.splice(eski, 0, t); else liste.unshift(t);
  gecmis[kuralId] = liste.slice(0, GECMIS_SINIRI);
  ayarYaz(vt, GECMIS_AYAR_ANAHTARI, gecmis);
}

/**
 * Arayüz görünümü: projenin kuralları + okunur zaman, sonraki çalışma, son tetikleme ve geçmiş.
 * @param {Veritabani} vt @param {string} projeId @param {{ simdi?: Date }} [s]
 */
export function kurallariListele(vt, projeId, s = {}) {
  const simdi = s.simdi ?? new Date();
  const gecmis = tumGecmis(vt);
  const baglantilar = new Map(tumBaglantilar(vt).map((b) => [b.id, b]));
  return tumKurallar(vt).filter((k) => k.projeId === projeId).map((k) => {
    const ortam = ortamGetir(vt, k.ortamId);
    const liste = gecmis[k.id] ?? [];
    const sonraki = k.etkin ? sonrakiZaman(k.zaman, simdi) : null;
    return {
      ...k, kapsam: { ...k.kapsam, uctanUcaAkisIdleri: k.kapsam.uctanUcaAkisIdleri ?? [] },
      zamanMetni: zamanMetni(k.zaman), ortamAdi: ortam?.ad ?? null, riskli: ortam ? ortamRiskliMi(ortam) : false,
      bildirimAdi: k.bildirimBaglantiId ? baglantilar.get(k.bildirimBaglantiId)?.ad ?? null : null,
      sonrakiCalisma: sonraki ? sonraki.toISOString() : null, sonTetikleme: liste[0] ?? null, gecmis: liste
    };
  });
}
