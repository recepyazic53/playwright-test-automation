// EKİP PAYLAŞIMI — güncel değilken yayınlama: üçlü karşılaştırma (git mantığı).
// Taban: bu makinenin en son aldığı sürüm; onlar: ortak klasördeki son sürüm; ben: bu makinedeki kayıtlar.
//
//   ucluFark(vt, taban, onlar, anahtar)
//     Kayıt kayıt (önizleme tablolarında; zaman damgaları hariç, çözülmüş içerikle) karşılaştırır ve yalnız ONLARIN tabandan sonra yaptığını
//     listeler:
//       yeni     — onlarda eklenmiş (tabanda ve bende yok)                    → dahil et / etme
//       degisti  — onlar değiştirmiş, ben değiştirmemişim                      → dahil et / etme
//       cakisma  — ikimiz de değiştirmişiz (ya da ben silmişim, onlar değiştirmiş) → onunki / benimki
//       silindi  — onlar silmiş, bende tabandaki gibi duruyor                  → bilgi (sizde kalır; yayınlarsanız yeniden yayına girer)
//     Yalnız benim yaptıklarım listelenmez (olduğu gibi kalır).
//   Seçilenler içe aktarma uygulamasıyla (iceAktarmaUygula, seçimli) yazılır; ardından sürüm "alındı" sayılır ve yeni sürüm yayınlanır
//   (sunucu: /platform/ortak/birlestir/*).
// NOT: import.meta KULLANILMAZ.
import { ONIZLEME_TABLOLARI, kayitBasligi, kayitFarkAlanlari, kayitGorunumu } from './ice-aktarma.mjs';
import { TABLOLAR } from './veritabani/gocler.mjs';

/** @typedef {Record<string, unknown>} Satir */
/** @typedef {{ tablo: string; etiket: string; id: string; baslik: string; tur: 'yeni' | 'degisti' | 'cakisma' | 'silindi'; alanlar: string[]; benSildim?: true }} UcluFarkOgesi */

const BIRINCIL = new Map(TABLOLAR.map((t) => [t.ad, t.birincilAnahtar]));

/**
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt
 * @param {Record<string, Satir[]>} taban son alınan sürümün satırları (hedef anahtarla şifreli; sürüm alınmadıysa {})
 * @param {Record<string, Satir[]>} onlar klasördeki son sürümün satırları (hedef anahtarla şifreli)
 * @param {Buffer} anahtar bu makinenin kasa anahtarı
 * @returns {UcluFarkOgesi[]}
 */
export function ucluFark(vt, taban, onlar, anahtar) {
  /** @type {UcluFarkOgesi[]} */
  const sonuc = [];
  for (const [tablo, etiket] of Object.entries(ONIZLEME_TABLOLARI)) {
    const pk = String(BIRINCIL.get(tablo));
    const harita = (/** @type {Satir[]} */ satirlar) => new Map(satirlar.map((s) => [String(s[pk]), s]));
    const T = harita(taban[tablo] ?? []);
    const O = harita(onlar[tablo] ?? []);
    const B = harita(vt.tumu(`SELECT * FROM ${tablo}`));
    /** @type {Map<string, ReturnType<typeof kayitGorunumu>>} */
    const onbellek = new Map();
    const gor = (/** @type {string} */ kaynak, /** @type {Satir} */ s, /** @type {string} */ id) => {
      const k = `${kaynak}:${id}`;
      if (!onbellek.has(k)) onbellek.set(k, kayitGorunumu(vt, tablo, s, anahtar));
      return /** @type {ReturnType<typeof kayitGorunumu>} */ (onbellek.get(k));
    };
    const imza = (/** @type {string} */ kaynak, /** @type {Satir | undefined} */ s, /** @type {string} */ id) => (s ? gor(kaynak, s, id).imza : null);
    for (const id of new Set([...T.keys(), ...O.keys(), ...B.keys()])) {
      const t = imza('t', T.get(id), id);
      const o = imza('o', O.get(id), id);
      const b = imza('b', B.get(id), id);
      if (o === b) continue;
      const os = O.get(id);
      const bs = B.get(id);
      const baslik = () => kayitBasligi(tablo, gor(os ? 'o' : bs ? 'b' : 't', /** @type {Satir} */ (os ?? bs ?? T.get(id)), id).gorunum, id);
      const alanlar = () => (os && bs ? kayitFarkAlanlari(gor('b', bs, id), gor('o', os, id)) : []);
      if (o === null) {
        // Onlarda yok: tabandaki gibi duruyorsa onlar silmiş (bilgi); değilse benim eklediğim / değiştirdiğim kalır.
        if (t !== null && b === t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'silindi', alanlar: [] });
        continue;
      }
      if (b === null) {
        if (t === null) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'yeni', alanlar: [] });
        else if (o !== t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'cakisma', alanlar: [], benSildim: true });
        // Ben silmişim, onlar değiştirmemiş: silme kalır.
        continue;
      }
      if (o === t) continue; // yalnız ben değiştirmişim
      if (b === t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'degisti', alanlar: alanlar() });
      else sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'cakisma', alanlar: alanlar() });
    }
  }
  return sonuc;
}

/**
 * Kullanıcının kararlarından içe aktarma seçimi: dahil edilen yeni / değişenler ve "onunki" seçilen çakışmalar.
 * Her çakışma için karar zorunludur; listede olmayan kayıt seçilemez.
 * @param {UcluFarkOgesi[]} farklar @param {unknown} kararlar { "<tablo>:<id>": 'dahil' | 'haric' | 'onunki' | 'benimki' }
 * @returns {{ secimler: Record<string, string[]>; dahil: number; haric: number }}
 */
export function birlestirmeSecimi(farklar, kararlar) {
  const k = kararlar && typeof kararlar === 'object' ? /** @type {Record<string, unknown>} */ (kararlar) : {};
  /** @type {Record<string, string[]>} */
  const secimler = {};
  let dahil = 0;
  let haric = 0;
  for (const f of farklar) {
    if (f.tur === 'silindi') continue;
    const karar = k[`${f.tablo}:${f.id}`];
    let al;
    if (f.tur === 'cakisma') {
      if (karar !== 'onunki' && karar !== 'benimki') throw new Error(`Çakışan kayıt için karar verin: ${f.etiket} › ${f.baslik}`);
      al = karar === 'onunki';
    } else {
      al = karar !== 'haric';
    }
    if (al) { (secimler[f.tablo] ??= []).push(f.id); dahil++; } else haric++;
  }
  return { secimler, dahil, haric };
}
