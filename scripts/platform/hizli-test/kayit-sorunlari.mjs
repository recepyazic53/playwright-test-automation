// HIZLI TEST — KAYIT SORUNLARI: ekran paketi doğrulamasının hatalarını ({ yer, mesaj } — sayfa-paketi.mjs / ekran-servisi.mjs) kullanıcının
// anlayacağı maddelere çevirir: konum (adım / alan / tablo / bitiş koşulu) modelden ADIYLA yazılır, teknik ileti "ayrinti"de kalır ve her
// madde için mümkünse "Düzelt" hedefi verilir (hızlı testin geri dönüş uçları: 'bitis' | 'karar'; özet sekmesinde 'tablo' kartı).
// Motor geneldir: ürüne / ekrana özgü hiçbir kural yoktur; yalnız model yollarının biçimi okunur.
import { anlasilirDogrulamaIletisi } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';

/** @typedef {Record<string, any>} Nesne */
/** @typedef {'bitis' | 'karar' | 'tablo'} DuzeltHedefi */
/** @typedef {{ mesaj: string; ayrinti: string | null; duzelt: DuzeltHedefi | null }} KayitSorunu */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metinMi = (/** @type {unknown} */ d) => typeof d === 'string' && d.trim() !== '';

/** Alanın gösterilen adı (etiket metni ya da { form, ekran }; yoksa kimlik). @param {Nesne} a */
function alanAdi(a) {
  const e = nesneMi(a.etiket) ? a.etiket.form || a.etiket.ekran : a.etiket;
  return metinMi(e) ? String(e) : String(a.id ?? '');
}

/** Modeldeki bütün alanlar (adımlar, akışlar, senaryo düzeyi; iç içe alt alanlar dahil). @param {unknown} model @returns {Nesne[]} */
function modelAlanlari(model) {
  /** @type {Nesne[]} */
  const sonuc = [];
  const alanlar = (/** @type {unknown} */ l) => {
    for (const a of Array.isArray(l) ? l : []) {
      if (!nesneMi(a)) continue;
      sonuc.push(a);
      alanlar(a.altAlanlar);
      alanlar(a.ekranAlanlari);
    }
  };
  const adimlar = (/** @type {unknown} */ l) => {
    for (const ad of Array.isArray(l) ? l : []) if (nesneMi(ad)) for (const b of Array.isArray(ad.bolumler) ? ad.bolumler : []) if (nesneMi(b)) alanlar(b.alanlar);
  };
  if (!nesneMi(model)) return sonuc;
  adimlar(model.adimlar);
  for (const ak of Array.isArray(model.akislar) ? model.akislar : []) if (nesneMi(ak)) adimlar(ak.adimlar);
  if (nesneMi(model.senaryoDuzeyi)) alanlar(model.senaryoDuzeyi.alanlar);
  return sonuc;
}

/**
 * Teknik yolun ("model.adimlar[0].bolumler[0].alanlar[2](x).varsayilan.deger", "testVerisi.tablolar[1].satirlar[0]") kullanıcı dilindeki
 * konumu: yol paketin içinde izlenir, adım başlığı / alan etiketi / tablo adı yazılır. @param {string} yer @param {unknown} paket @returns {string[]}
 */
function yolKonumu(yer, paket) {
  /** @type {string[]} */
  const konum = [];
  /** @type {unknown} */
  let d = paket;
  for (const m of yer.matchAll(/([^.[\]()]+)(?:\[(\d+)\])?(?:\(([^)]*)\))?/g)) {
    const [, anahtar, sira] = m;
    d = nesneMi(d) ? /** @type {Nesne} */ (d)[anahtar] : undefined;
    if (sira !== undefined) d = Array.isArray(d) ? d[Number(sira)] : undefined;
    const o = nesneMi(d) ? /** @type {Nesne} */ (d) : null;
    if (anahtar === 'adimlar' && o) konum.push(`“${metinMi(o.baslik) ? o.baslik : String(o.id ?? Number(sira) + 1)}” adımı`);
    else if ((anahtar === 'alanlar' || anahtar === 'altAlanlar' || anahtar === 'ekranAlanlari') && o) konum.push(`“${alanAdi(o)}” alanı`);
    else if (anahtar === 'tablolar' && o) konum.push(`“${String(o.ad ?? Number(sira) + 1)}” tablosu`);
    else if (anahtar === 'basariGostergesi' || anahtar === 'bitisKosulu') { if (!konum.includes('bitiş koşulu')) konum.push('bitiş koşulu'); }
    else if (anahtar === 'hataGostergesi' || anahtar === 'uyarilar') { if (!konum.includes('hata mesajları')) konum.push('hata mesajları'); }
    else if (anahtar === 'aksiyonlar') konum.push('basılan düğmeler');
  }
  return konum;
}

/** Teknik iletiden "Düzelt" hedefi. @param {string} yer @param {string} teknik @returns {DuzeltHedefi | null} */
function duzeltHedefi(yer, teknik) {
  if (/^testVerisi\b/.test(yer)) return 'tablo';
  if (/^(meta\b|korunanAkislar|ekranId|tur|surum)/.test(yer)) return null;
  if (/aksiyonlar|ilerleme/.test(teknik)) return 'karar';
  if (/basariGostergesi|bitisKosulu|hataGostergesi|uyarilar|zamanAsimiSn|kosu\b/.test(teknik)) return 'bitis';
  if (/adimlar|bolumler|alanlar|kosullar|senaryoDuzeyi/.test(teknik)) return 'karar';
  return null;
}

/**
 * Paket doğrulama hatalarını kayıt sorunlarına çevirir. Girdi { yer, mesaj, ayrinti? } (ayrinti varsa — ekran-servisi modeliDogrula —
 * teknik ileti odur). @param {ReadonlyArray<{ yer?: unknown; mesaj?: unknown; ayrinti?: unknown }>} hatalar @param {unknown} paket
 * @returns {KayitSorunu[]}
 */
export function kayitSorunlari(hatalar, paket) {
  const model = nesneMi(paket) ? /** @type {Nesne} */ (paket).model : undefined;
  const alanlar = modelAlanlari(model);
  /** @type {KayitSorunu[]} */
  const sonuc = [];
  for (const x of hatalar) {
    const yer = typeof x.yer === 'string' ? x.yer : '';
    const ham = metinMi(x.ayrinti) ? String(x.ayrinti) : String(x.mesaj ?? '');
    let mesaj;
    let teknik;
    if (yer === 'model') {
      // Ortak doğrulayıcının maddesi ("adimlar[0](form).bolumler[0].alanlar[1](ad): …"): anlaşılır dile çevrilir, alan kimliği etiketle değişir.
      teknik = ham;
      mesaj = anlasilirDogrulamaIletisi(ham, model);
      for (const [, id] of ham.matchAll(/alanlar\[\d+\]\(([^)]*)\)/g)) {
        const a = alanlar.find((y) => y.id === id);
        if (a) mesaj = mesaj.split(`“${id}” alanı`).join(`“${alanAdi(a)}” alanı`);
      }
    } else {
      teknik = yer ? `${yer}: ${ham}` : ham;
      const konum = yolKonumu(yer, paket);
      const govde = String(x.mesaj ?? ham);
      mesaj = konum.length ? `${konum.join(' › ')}: ${govde}` : /^meta\.ekran/.test(yer) ? `Ekran: ${govde}` : govde;
    }
    sonuc.push({ mesaj, ayrinti: teknik && teknik !== mesaj ? teknik : null, duzelt: duzeltHedefi(yer, teknik) });
  }
  return sonuc;
}
