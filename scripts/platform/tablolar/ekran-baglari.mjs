// EKRAN ALANI → TABLO SÜTUNU BAĞLANTILARI. Ekranın ayarlarında (şifreli) alanBaglari = { <alanKimliği>: { tablo, sutun, etiket? } }.
// Bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tablodaki alanlar senaryo formunda birbirini süzer
// (bkz. tablo-secimi.mjs tabloDegerListeleri; senaryo-servisi.mjs ekranListeleri).
// ORTAK AKIŞ: bağ ortak akışın kendi ayarlarında bir kez kurulur ve onu kullanan tüm ekranlara VARSAYILAN olarak geçer; ekran
// aynı alan için kendi bağını yazarsa o geçerlidir (ezme), silerse ortak akışınkine döner (etkinAlanBaglari).
import { DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranModeliGetir, ekranlariListele } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, { tablo: string; sutun: string; etiket?: string }>} EkranBaglari */

const nesneMi = (/** @type {unknown} */ d) => d !== null && typeof d === 'object' && !Array.isArray(d);

/**
 * Ekranın KENDİ alan bağlantıları (ayarlarına yazılan; kasa açık olmalı). Okuyan yerler (senaryo formu, koşu, etki…) çoğunlukla
 * etkinAlanBaglari'nı kullanır; bu yalnız ekranın kendi bağlarını yazan / gösteren yerler içindir.
 * @param {Veritabani} vt @param {string} ekranId @returns {EkranBaglari}
 */
export function ekranAlanBaglari(vt, ekranId) {
  const a = ekranAyarlariniGetir(vt, ekranId) ?? {};
  return nesneMi(a.alanBaglari) ? /** @type {EkranBaglari} */ (a.alanBaglari) : {};
}

/** Modelin (tüm akışları) başvurduğu ortak akış dosyaları, sırayla ("<anahtar>.model.json"). @param {unknown} model @returns {string[]} */
function ortakAkisDosyalari(model) {
  if (!nesneMi(model)) return [];
  const m = /** @type {Record<string, any>} */ (model);
  const listeler = [m.adimlar, ...(Array.isArray(m.akislar) ? m.akislar.map((/** @type {unknown} */ a) => (nesneMi(a) ? /** @type {Record<string, any>} */ (a).adimlar : null)) : [])];
  /** @type {string[]} */
  const dosyalar = [];
  for (const adimlar of listeler) {
    for (const x of Array.isArray(adimlar) ? adimlar : []) {
      if (nesneMi(x) && nesneMi(x.ortakAkis) && typeof x.ortakAkis.dosya === 'string' && !dosyalar.includes(x.ortakAkis.dosya)) dosyalar.push(x.ortakAkis.dosya);
    }
  }
  return dosyalar;
}

/**
 * Ekranın kullandığı ORTAK AKIŞLARIN bağları (ekrana varsayılan olarak geçer): alan kimliği → bağ + hangi ortak akıştan geldiği.
 * Ortak akışın alan kimlikleri ekrana açılınca değişmez (model-formu.mjs > ortakAkislariAc), bu yüzden anahtarlar aynıdır. Aynı
 * alan iki ortak akışta bağlıysa ekran akışındaki ilk ortak akışınki geçerlidir. Ortak akış / alt model ekranında boş.
 * @param {Veritabani} vt @param {string} ekranId
 * @returns {Record<string, { tablo: string; sutun: string; etiket?: string; ortakAkis: { id: string; ad: string } }>}
 */
export function ortakAkisBaglari(vt, ekranId) {
  const kayit = ekranModeliGetir(vt, ekranId);
  const model = kayit && nesneMi(kayit.model) ? /** @type {Record<string, any>} */ (kayit.model) : null;
  if (!model || ['ortakAkis', 'altModel'].includes(String(model.tur))) return {};
  const dosyalar = ortakAkisDosyalari(model);
  if (!dosyalar.length) return {};
  const e = vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [ekranId]);
  if (!e) return {};
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string; ortakAkis: { id: string; ad: string } }>} */
  const sonuc = {};
  for (const dosya of dosyalar) {
    const anahtar = dosya.replace(/\.model\.json$/, '');
    const o = ekranlariListele(vt, String(e.proje_id)).find((x) => x.anahtar === anahtar);
    if (!o) continue;
    const om = ekranModeliGetir(vt, o.id);
    if (!om || !nesneMi(om.model) || /** @type {Record<string, any>} */ (om.model).tur !== 'ortakAkis') continue;
    for (const [alan, b] of Object.entries(ekranAlanBaglari(vt, o.id))) if (!(alan in sonuc)) sonuc[alan] = { ...b, ortakAkis: { id: o.id, ad: o.ad } };
  }
  return sonuc;
}

/**
 * Ekranın ETKİN alan bağları: alanın ekrana özel bağı varsa o (ezme), yoksa alanın geldiği ortak akışın bağı. Senaryo formu
 * (Tablodan seçenekleri, gizli sütun bağları), koşu (${Tablo.Sütun} çözümü), tablo etkisi / kullanımı, birleştirme denetimi ve
 * istek dosyası bu çözümü kullanır. @param {Veritabani} vt @param {string} ekranId @returns {EkranBaglari}
 */
export function etkinAlanBaglari(vt, ekranId) {
  const kendi = ekranAlanBaglari(vt, ekranId);
  const ortak = ortakAkisBaglari(vt, ekranId);
  if (!Object.keys(ortak).length) return kendi;
  /** @type {EkranBaglari} */
  const sonuc = {};
  for (const [alan, b] of Object.entries(ortak)) sonuc[alan] = { tablo: b.tablo, sutun: b.sutun, ...(b.etiket ? { etiket: b.etiket } : {}) };
  return { ...sonuc, ...kendi };
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
    for (const b of Object.values(etkinAlanBaglari(vt, e.id))) {
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
