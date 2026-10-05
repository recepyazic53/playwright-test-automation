// EKRAN ALANI → TABLO SÜTUNU BAĞLANTILARI. Ekranın ayarlarında (şifreli) alanBaglari = { <alanKimliği>: { tablo, sutun, etiket? } }.
// Bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tablodaki alanlar senaryo formunda birbirini süzer
// (bkz. tablo-secimi.mjs tabloDegerListeleri; senaryo-servisi.mjs ekranListeleri).
// ORTAK AKIŞ: bağ ortak akışın kendi ayarlarında bir kez kurulur ve onu kullanan tüm ekranlara VARSAYILAN olarak geçer; ekran
// aynı alan için kendi bağını yazarsa o geçerlidir (ezme), silerse ortak akışınkine döner (etkinAlanBaglari).
// SEÇİME GÖRE: bağ isteğe bağlı secimeGore taşır (kontrol alanının değerine göre başka tablo; secime-gore-bag.mjs). Okuyanlar ya
// değere göre çözer ya da her olası bağı sayar.
import { DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranModeliGetir, ekranlariListele } from '../veritabani/depo.mjs';
import { bagTablolari } from './secime-gore-bag.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, import('./secime-gore-bag.mjs').AlanBagi>} EkranBaglari */

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
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string; ortakAkis: { id: string; ad: string } }>} */
  const sonuc = {};
  for (const o of kullanilanOrtakAkislar(vt, ekranId)) {
    for (const [alan, b] of Object.entries(ekranAlanBaglari(vt, o.id))) if (!(alan in sonuc)) sonuc[alan] = { ...b, ortakAkis: o };
  }
  return sonuc;
}

/**
 * Ekranın (tüm akışlarında) kullandığı ORTAK AKIŞLAR, akıştaki sırayla: { id, ad }. Ortak akış / alt model ekranında ve modeli
 * olmayan ekranda boş. Test verisi sekmesi alanın hangi genel senaryodan geldiğini bununla bulur (tablo-uclari.mjs).
 * @param {Veritabani} vt @param {string} ekranId @returns {Array<{ id: string; ad: string }>}
 */
export function kullanilanOrtakAkislar(vt, ekranId) {
  const kayit = ekranModeliGetir(vt, ekranId);
  const model = kayit && nesneMi(kayit.model) ? /** @type {Record<string, any>} */ (kayit.model) : null;
  if (!model || ['ortakAkis', 'altModel'].includes(String(model.tur))) return [];
  const dosyalar = ortakAkisDosyalari(model);
  if (!dosyalar.length) return [];
  const e = vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [ekranId]);
  if (!e) return [];
  const ekranlar = ekranlariListele(vt, String(e.proje_id));
  /** @type {Array<{ id: string; ad: string }>} */
  const sonuc = [];
  for (const dosya of dosyalar) {
    const anahtar = dosya.replace(/\.model\.json$/, '');
    const o = ekranlar.find((x) => x.anahtar === anahtar);
    if (!o) continue;
    const om = ekranModeliGetir(vt, o.id);
    if (!om || !nesneMi(om.model) || /** @type {Record<string, any>} */ (om.model).tur !== 'ortakAkis') continue;
    sonuc.push({ id: o.id, ad: o.ad });
  }
  return sonuc;
}

/**
 * Alanı tabloya bağlamak gerekmez mi: seçenekleri modelde tanımlı seçim ya da senaryo ayarı (ekranda alan değil; senaryoda seçilir).
 * Bağlanmazsa modeldeki seçenekler kullanılır; bağlamak yine mümkündür. "Bağlı değil" sayaçları bunları eksik saymaz.
 * @param {{ tip?: unknown; secenekler?: unknown; senaryoAyari?: unknown }} g
 */
export const baglamakGerekmez = (g) => Boolean(g.senaryoAyari) || (g.tip === 'secim' && Array.isArray(g.secenekler) && g.secenekler.length > 0);

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
  for (const [alan, b] of Object.entries(ortak)) { const { ortakAkis: _o, ...bag } = b; sonuc[alan] = bag; }
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
    // Seçime göre değişen bağda her olası tablo sayılır (secime-gore-bag.mjs).
    for (const tabloId of Object.values(etkinAlanBaglari(vt, e.id)).flatMap(bagTablolari)) {
      const liste = (ekranKullanimi[tabloId] ??= []);
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
  const alanGecersiz = (/** @type {string} */ x) => !x || x.length > 200 || /[\u0000-\u001f]/.test(x);
  /** Tek bağ (varsayılan ya da bir seçeneğin bağı). @param {unknown} b @param {string} yer */
  const tek = (b, yer) => {
    const x = /** @type {Record<string, any>} */ (b);
    if (!nesneMi(b) || typeof x.tablo !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(x.tablo) || typeof x.sutun !== 'string' || !x.sutun.trim() || x.sutun.length > 60) {
      throw new DepoHatasi(`${yer} için geçersiz tablo bağlantısı.`);
    }
    const etiket = typeof x.etiket === 'string' ? x.etiket.trim() : '';
    if (etiket && !/^[\p{L}\p{N} _-]{1,40}$/u.test(etiket)) throw new DepoHatasi(`${yer} etiketi geçersiz (harf, rakam, boşluk, "_", "-").`);
    return { tablo: x.tablo, sutun: x.sutun.trim(), ...(etiket ? { etiket } : {}) };
  };
  for (const [alan, b] of Object.entries(/** @type {Record<string, any>} */ (baglar))) {
    if (alanGecersiz(alan)) throw new DepoHatasi(`Geçersiz alan: "${alan}".`);
    if (!b) continue;
    /** @type {import('./secime-gore-bag.mjs').AlanBagi} */
    const bag = tek(b, `"${alan}"`);
    // Seçime göre değişen bağ (secime-gore-bag.mjs): kontrol alanı + seçenek değeri başına bağ; üstteki bağ varsayılandır.
    if (b.secimeGore !== undefined && b.secimeGore !== null) {
      const sg = b.secimeGore;
      if (!nesneMi(sg) || typeof sg.alan !== 'string' || alanGecersiz(sg.alan) || !nesneMi(sg.degerler)) throw new DepoHatasi(`"${alan}" için seçime göre bağ geçersiz ({ alan, degerler } olmalı).`);
      if (sg.alan === alan) throw new DepoHatasi(`"${alan}" kendi seçimine göre bağlanamaz; başka bir kontrol alanı seçin.`);
      const girdiler = Object.entries(/** @type {Record<string, unknown>} */ (sg.degerler));
      if (girdiler.length > 50) throw new DepoHatasi(`"${alan}" için en çok 50 seçenek bağı olabilir.`);
      /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
      const degerler = {};
      for (const [d, v] of girdiler) {
        if (alanGecersiz(d)) throw new DepoHatasi(`"${alan}" için geçersiz seçenek değeri.`);
        degerler[d] = tek(v, `"${alan}" (${sg.alan} = ${d})`);
      }
      if (Object.keys(degerler).length) bag.secimeGore = { alan: sg.alan, degerler };
    }
    temiz[alan] = bag;
  }
  const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
  ekranKaydet(vt, { id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, ayarlar: { ...ayarlar, alanBaglari: temiz } });
  return temiz;
}
