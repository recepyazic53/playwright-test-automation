// EKRAN ALANI → TABLO SÜTUNU BAĞLANTILARI. Ekranın ayarlarında (şifreli) alanBaglari = { <alanKimliği>: { tablo, sutun, etiket? } }.
// Bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tablodaki alanlar senaryo formunda birbirini süzer
// (bkz. tablo-secimi.mjs tabloDegerListeleri; senaryo-servisi.mjs ekranListeleri).
import { DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranlariListele } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, { tablo: string; sutun: string; etiket?: string }>} EkranBaglari */

const nesneMi = (/** @type {unknown} */ d) => d !== null && typeof d === 'object' && !Array.isArray(d);

/** Ekranın alan bağlantıları (kasa açık olmalı). @param {Veritabani} vt @param {string} ekranId @returns {EkranBaglari} */
export function ekranAlanBaglari(vt, ekranId) {
  const a = ekranAyarlariniGetir(vt, ekranId) ?? {};
  return nesneMi(a.alanBaglari) ? /** @type {EkranBaglari} */ (a.alanBaglari) : {};
}

/**
 * Projedeki ekranların adları ve her tablonun hangi ekranların alan bağlarında kullanıldığı (Tablolar ekranının liste gruplaması
 * için; yalnız gösterim). Kasa açık olmalı. @param {Veritabani} vt @param {string} projeId
 * @returns {{ ekranAdlari: string[]; ekranKullanimi: Record<string, string[]> }}
 */
export function tabloEkranKullanimi(vt, projeId) {
  /** @type {Record<string, string[]>} */
  const ekranKullanimi = {};
  const ekranlar = ekranlariListele(vt, projeId);
  for (const e of ekranlar) {
    for (const b of Object.values(ekranAlanBaglari(vt, e.id))) {
      const liste = (ekranKullanimi[b.tablo] ??= []);
      if (!liste.includes(e.ad)) liste.push(e.ad);
    }
  }
  return { ekranAdlari: ekranlar.map((e) => e.ad), ekranKullanimi };
}

/**
 * Bağlantıları doğrular ve ekranın ayarlarına yazar (diğer ayarlar korunur).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} baglar @returns {EkranBaglari}
 */
export function ekranAlanBaglariniKaydet(vt, projeId, ekranId, baglar) {
  if (!nesneMi(baglar)) throw new DepoHatasi('"baglar" bir nesne olmalıdır.');
  const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
  if (!e) throw new DepoHatasi('Ekran bulunamadı.');
  /** @type {EkranBaglari} */
  const temiz = {};
  for (const [alan, b] of Object.entries(/** @type {Record<string, any>} */ (baglar))) {
    if (!alan || alan.length > 200 || /[\u0000-\u001f]/.test(alan)) throw new DepoHatasi(`Geçersiz alan: "${alan}".`);
    if (!b) continue;
    if (!nesneMi(b) || typeof b.tablo !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(b.tablo) || typeof b.sutun !== 'string' || !b.sutun.trim() || b.sutun.length > 60) {
      throw new DepoHatasi(`"${alan}" için geçersiz tablo bağlantısı.`);
    }
    const etiket = typeof b.etiket === 'string' ? b.etiket.trim() : '';
    if (etiket && !/^[\p{L}\p{N} _-]{1,40}$/u.test(etiket)) throw new DepoHatasi(`"${alan}" etiketi geçersiz (harf, rakam, boşluk, "_", "-").`);
    temiz[alan] = { tablo: b.tablo, sutun: b.sutun.trim(), ...(etiket ? { etiket } : {}) };
  }
  const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
  ekranKaydet(vt, { id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, ayarlar: { ...ayarlar, alanBaglari: temiz } });
  return temiz;
}
