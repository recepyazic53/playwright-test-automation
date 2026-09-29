// SERVİS SENARYOSUNUN GİZLİ SABİT DEĞERLERİ — adı maskeleme listesinde olan (parola, token… + Ayarlar > Güvenlik > Maskeleme eki)
// alanlara "Sabit değer" olarak yazılan değerler senaryo içeriğinden AYRILIR ve kasada ayrı bir gizli değer (zarf) olarak saklanır;
// içerikte yerlerinde maske (GIZLI_SABIT_MASKESI) durur. cURL içe aktarmadaki gizli değer gibi: değer arayüze hiç gönderilmez, yalnız
// koşu / Dene sırasında sunucuda yerine konur.
//   · Saklama: servis-deposu.mjs > servisSenaryosuKaydet → gizliSabitleriAyir (içerik.gizliSabitler = zarf).
//   · Okuma:   senaryoCevir → gizliSabitleriBirlestir (koşucular değişmeden tam değerle çalışır).
//   · Arayüz:  uçlar içeriği servisIceriginiMaskele ile maskeli verir; arayüzden maskeli gelen yer kayıtlı değerle doldurulur
//              (gizliSabitleriGeriKoy; düzenleme, kopya, Dene taslağı).
// GERİYE UYUM: gizliSabitler'i olmayan eski (düz) kayıt olduğu gibi okunur; ilk kaydedilişte gizliye çevrilir.
import { coz, sifrele, zarfMi } from '../kasa.mjs';
import { adaGoreMaskele, gizliAdMi, maskeyiGeriKoy } from '../ayarlar/gizli-adlar.mjs';
import { DepoHatasi } from '../veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { basvuru } from '../tablolar/tablo-secimi.mjs';

/** Arayüzdeki metin maskesiyle aynı (servisler.js METIN_MASKESI). */
export const GIZLI_SABIT_MASKESI = '••••••';
const M = GIZLI_SABIT_MASKESI;

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, Array<string | null>>} Asillar */
/**
 * Kasada saklanan kayıt: alan adına göre sırayla asıl değerler; ekler = saklarken geçerli ek gizli adlar (sonradan ek ad kaldırılsa da
 * değer yerine konabilsin).
 * @typedef {{ govde?: Asillar; basliklar?: Record<string, string>; baslikIcleri?: Record<string, Asillar>; yol?: Asillar; ekler?: string[] }} GizliKayit
 */

/** @param {unknown} x @returns {x is Record<string, any>} */
const nesneMi = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
/** @param {Asillar} a */
const doluMu = (a) => Object.values(a).some((l) => l.some((x) => typeof x === 'string'));
/** Değer sır mı (boş, maske ya da ${…} yer tutuculu değilse). @param {unknown} d */
const sirMi = (d) => typeof d === 'string' && Boolean(d.trim()) && d !== M && !d.includes('${');

/**
 * İçeriğin gizli sabitlerini ayırır: yerlerinde maske kalır, asıl değerler kasada zarf olarak içerik.gizliSabitler'e yazılır.
 * Akış senaryosunda (adimlar) her adımın içeriği ayrı ayrılır. Gizli değer yoksa içerik aynen döner.
 * @template T @param {Veritabani} vt @param {T} icerik @param {ReadonlyArray<string>} ekler @returns {T}
 */
export function gizliSabitleriAyir(vt, icerik, ekler) {
  if (!nesneMi(icerik)) return icerik;
  const i = /** @type {Record<string, any>} */ ({ ...icerik });
  delete i.gizliSabitler;
  /** @type {GizliKayit} */
  const kayit = {};
  if (typeof i.govde === 'string') {
    const r = adaGoreMaskele(i.govde, ekler, M);
    if (doluMu(r.asillar)) { i.govde = r.metin; kayit.govde = r.asillar; }
  }
  if (nesneMi(i.basliklar)) {
    /** @type {Record<string, unknown>} */
    const yeni = {};
    for (const [ad, d] of Object.entries(i.basliklar)) {
      if (typeof d === 'string' && gizliAdMi(ad, ekler) && sirMi(d)) { (kayit.basliklar ??= {})[ad] = d; yeni[ad] = M; continue; }
      if (typeof d === 'string') {
        const r = adaGoreMaskele(d, ekler, M);
        if (doluMu(r.asillar)) { (kayit.baslikIcleri ??= {})[ad] = r.asillar; yeni[ad] = r.metin; continue; }
      }
      yeni[ad] = d;
    }
    i.basliklar = yeni;
  }
  if (nesneMi(i.http) && typeof i.http.yol === 'string') {
    const r = adaGoreMaskele(i.http.yol, ekler, M, { bicim: 'yol' });
    if (doluMu(r.asillar)) { i.http = { ...i.http, yol: r.metin }; kayit.yol = r.asillar; }
  }
  if (nesneMi(i.adimlar)) i.adimlar = Object.fromEntries(Object.entries(i.adimlar).map(([k, a]) => [k, gizliSabitleriAyir(vt, a, ekler)]));
  if (kayit.govde || kayit.basliklar || kayit.baslikIcleri || kayit.yol) {
    kayit.ekler = [...ekler];
    i.gizliSabitler = sifrele(vt, JSON.stringify(kayit));
  }
  return /** @type {T} */ (i);
}

/**
 * Kasadaki gizli sabitleri içerikteki maskeli yerlerine koyar (koşu ve depo okuması için tam içerik). Kaydı olmayan (eski / gizli
 * değersiz) içerik aynen döner. @template T @param {Veritabani} vt @param {T} icerik @returns {T}
 */
export function gizliSabitleriBirlestir(vt, icerik) {
  if (!nesneMi(icerik)) return icerik;
  const i = /** @type {Record<string, any>} */ ({ ...icerik });
  const z = i.gizliSabitler;
  delete i.gizliSabitler;
  if (nesneMi(i.adimlar)) i.adimlar = Object.fromEntries(Object.entries(i.adimlar).map(([k, a]) => [k, gizliSabitleriBirlestir(vt, a)]));
  if (!zarfMi(z)) return /** @type {T} */ (i);
  /** @type {GizliKayit} */
  const k = JSON.parse(String(coz(vt, z)));
  const ekler = Array.isArray(k.ekler) ? k.ekler.map(String) : [];
  if (k.govde && typeof i.govde === 'string') i.govde = maskeyiGeriKoy(i.govde, k.govde, ekler, M);
  if (nesneMi(i.basliklar)) {
    i.basliklar = Object.fromEntries(Object.entries(i.basliklar).map(([ad, d]) => {
      if (d === M && k.basliklar && typeof k.basliklar[ad] === 'string') return [ad, k.basliklar[ad]];
      if (typeof d === 'string' && k.baslikIcleri && k.baslikIcleri[ad]) return [ad, maskeyiGeriKoy(d, k.baslikIcleri[ad], ekler, M)];
      return [ad, d];
    }));
  }
  if (k.yol && nesneMi(i.http) && typeof i.http.yol === 'string') i.http = { ...i.http, yol: maskeyiGeriKoy(i.http.yol, k.yol, ekler, M, { bicim: 'yol' }) };
  return /** @type {T} */ (i);
}

/**
 * Arayüzden gelen içerikte hâlâ maske duran gizli yerleri önceki (tam) içerikteki asıl değerle doldurur; kullanıcının değiştirdiği
 * değer olduğu gibi kalır. Önceki yoksa (yeni senaryo) içerik aynen döner. Akış senaryosunda adımlar anahtarıyla eşlenir.
 * @template T @param {T} yeni @param {unknown} onceki tam (birleştirilmiş) içerik @param {ReadonlyArray<string>} ekler @returns {T}
 */
export function gizliSabitleriGeriKoy(yeni, onceki, ekler) {
  if (!nesneMi(yeni) || !nesneMi(onceki)) return yeni;
  const i = /** @type {Record<string, any>} */ ({ ...yeni });
  const o = /** @type {Record<string, any>} */ (onceki);
  if (typeof i.govde === 'string' && typeof o.govde === 'string' && i.govde.includes(M)) i.govde = maskeyiGeriKoy(i.govde, adaGoreMaskele(o.govde, ekler, M).asillar, ekler, M);
  if (nesneMi(i.basliklar) && nesneMi(o.basliklar)) {
    const ob = /** @type {Record<string, unknown>} */ (o.basliklar);
    i.basliklar = Object.fromEntries(Object.entries(i.basliklar).map(([ad, d]) => {
      const eski = ob[ad];
      if (d === M && sirMi(eski)) return [ad, eski];
      if (typeof d === 'string' && d.includes(M) && typeof eski === 'string') return [ad, maskeyiGeriKoy(d, adaGoreMaskele(eski, ekler, M).asillar, ekler, M)];
      return [ad, d];
    }));
  }
  if (nesneMi(i.http) && typeof i.http.yol === 'string' && i.http.yol.includes(M) && nesneMi(o.http) && typeof o.http.yol === 'string') {
    i.http = { ...i.http, yol: maskeyiGeriKoy(i.http.yol, adaGoreMaskele(o.http.yol, ekler, M, { bicim: 'yol' }).asillar, ekler, M, { bicim: 'yol' }) };
  }
  if (nesneMi(i.adimlar) && nesneMi(o.adimlar)) {
    const oa = /** @type {Record<string, unknown>} */ (o.adimlar);
    i.adimlar = Object.fromEntries(Object.entries(i.adimlar).map(([k, a]) => [k, gizliSabitleriGeriKoy(a, oa[k], ekler)]));
  }
  return /** @type {T} */ (i);
}

/**
 * Kayıtlı senaryoda adı verilen gizli alanın (ilk dolu) sabit değeri — "Tabloya gizli sütun olarak taşı" için. Yoksa null.
 * @param {unknown} icerik tam içerik @param {string} alanAdi @param {ReadonlyArray<string>} ekler @returns {string | null}
 */
export function gizliSabitDegeri(icerik, alanAdi, ekler) {
  if (!nesneMi(icerik)) return null;
  const i = /** @type {Record<string, any>} */ (icerik);
  const aday = [];
  if (typeof i.govde === 'string') aday.push(...(adaGoreMaskele(i.govde, ekler, M).asillar[alanAdi] ?? []));
  if (nesneMi(i.basliklar) && typeof i.basliklar[alanAdi] === 'string') aday.push(i.basliklar[alanAdi]);
  if (nesneMi(i.http) && typeof i.http.yol === 'string') aday.push(...(adaGoreMaskele(i.http.yol, ekler, M, { bicim: 'yol' }).asillar[alanAdi] ?? []));
  const d = aday.find((x) => sirMi(x));
  return typeof d === 'string' ? d : null;
}

/** Tablo / sütun adında kullanılamayan karakterler (tablo-deposu.mjs TABLO_ADI) boşluğa çevrilir; en çok 60. @param {string} s */
const temizAd = (s) => s.replace(/[.[\]{}$<>&|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * "Tabloya gizli sütun olarak taşı": gizli sabit değeri "<servis> gizli değerleri" test verisi tablosunun GİZLİ sütununa yazar (yoksa
 * tablo / sütun oluşturulur; aynı adlı sütunda başka değer varsa "_2", "_3"… eklenir, aynı değer varsa o sütun kullanılır). Değer
 * tablo satırında kasada şifreli durur, listelerde hiç görünmez (cURL içe aktarmadaki gizli değerle aynı yer). Senaryo DEĞİŞMEZ:
 * arayüz alanı bu sütuna bağlar, kullanıcı senaryoyu kaydeder. Değer: yeni yazılan (deger) ya da kayıtlı senaryodaki.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servis: { ad: string; anahtar: string }; icerik?: unknown; alanAdi: string; deger?: string; ekler: ReadonlyArray<string> }} g
 * @returns {{ tablo: string; sutun: string; basvuru: string; yeniSutun: boolean }}
 */
export function gizliSabitiTabloyaTasi(vt, projeId, g) {
  const alanAdi = typeof g.alanAdi === 'string' ? g.alanAdi.trim() : '';
  if (!alanAdi || !gizliAdMi(alanAdi, g.ekler)) throw new DepoHatasi('Yalnız adı gizli sayılan (parola, token…) bir alan taşınabilir.');
  const deger = sirMi(g.deger) ? String(g.deger) : gizliSabitDegeri(g.icerik, alanAdi, g.ekler);
  if (!deger) throw new DepoHatasi('Taşınacak değer yok: önce alana değeri yazın.');
  const tabloAdi = temizAd(`${g.servis.ad || g.servis.anahtar} gizli değerleri`) || 'Gizli değerler';
  const mevcut = tablolariListele(vt, projeId, { cozulsun: true }).find((t) => t.ad.toLocaleLowerCase('tr') === tabloAdi.toLocaleLowerCase('tr'));
  const satir = mevcut?.satirlar.find((r) => r.ortamId === null);
  const temel = temizAd(alanAdi) || 'deger';
  let sutun = temel;
  let yeniSutun = true;
  for (let n = 2; mevcut && mevcut.sutunlar.some((c) => c.ad.toLocaleLowerCase('tr') === sutun.toLocaleLowerCase('tr')); n++) {
    const c = mevcut.sutunlar.find((x) => x.ad.toLocaleLowerCase('tr') === sutun.toLocaleLowerCase('tr'));
    if (c && c.gizli && satir && satir.degerler[c.ad] === deger) { sutun = c.ad; yeniSutun = false; break; }
    sutun = `${temel.slice(0, 56)}_${n}`;
  }
  const sutunlar = [...(mevcut ? mevcut.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })) : []), ...(yeniSutun ? [{ ad: sutun, gizli: true }] : [])];
  const ad = mevcut?.ad ?? tabloAdi;
  tabloKaydet(vt, {
    projeId, ...(mevcut ? { id: mevcut.id } : {}), ad, sutunlar,
    satirlar: [{ ...(satir ? { id: satir.id } : {}), ortamId: null, degerler: { ...(satir ? satir.degerler : {}), [sutun]: deger } }]
  });
  return { tablo: ad, sutun, basvuru: basvuru(ad, sutun), yeniSutun };
}