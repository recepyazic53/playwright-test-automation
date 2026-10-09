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
//     ve BENİM tabandan sonra yaptıklarımı (yanlışlıkla yapılanı yayına sokmamak için; varsayılan dahil):
//       benimDegisti — ben değiştirmişim, onlar değiştirmemiş   → dahil etme = son sürümdeki hâline döner (bende de)
//       benimSildi   — ben silmişim, onlar değiştirmemiş         → dahil etme = son sürümden geri gelir
//       benimYeni    — ben eklemişim (onlarda yok)               → dahil etme = bende silinir (onaylı; değişiklik geçmişine yazılır)
//   Güncelken (taban = son sürüm) yalnız benimkiler çıkar: normal "Yayınla" da aynı gözden geçirmeyi kullanır.
//   Seçilenler içe aktarma uygulamasıyla (iceAktarmaUygula, seçimli) yazılır; ardından sürüm "alındı" sayılır ve yeni sürüm yayınlanır
//   (sunucu: /platform/ortak/birlestir/*).
// NOT: import.meta KULLANILMAZ.
import { ONIZLEME_TABLOLARI, kayitBasligi, kayitFarkAlanlari, kayitGorunumu } from './ice-aktarma.mjs';
import { TABLOLAR } from './veritabani/gocler.mjs';
import { gecmisYaz } from './veritabani/depo.mjs';
import { YEDEK_DISI_AYARLAR } from './yedek.mjs';

/** @typedef {Record<string, unknown>} Satir */
/** @typedef {'yeni' | 'degisti' | 'cakisma' | 'silindi' | 'benimDegisti' | 'benimSildi' | 'benimYeni'} UcluFarkTuru */
/** @typedef {{ tablo: string; etiket: string; id: string; baslik: string; tur: UcluFarkTuru; alanlar: string[]; benSildim?: true }} UcluFarkOgesi */

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
    // Bu makinenin satırları; yedeğe hiç girmeyen (kişiye / makineye özel) ayarlar karşılaştırılmaz.
    const B = harita(vt.tumu(`SELECT * FROM ${tablo}`).filter((s) => tablo !== 'ayarlar' || !YEDEK_DISI_AYARLAR.includes(String(s.anahtar))));
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
        // Onlarda yok: tabandaki gibi duruyorsa onlar silmiş (bilgi); tabanda da yoksa benim eklediğim. (Onların sildiğini benim
        // değiştirmem: benimki kalır, listelenmez.)
        if (t !== null && b === t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'silindi', alanlar: [] });
        else if (t === null) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'benimYeni', alanlar: [] });
        continue;
      }
      if (b === null) {
        if (t === null) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'yeni', alanlar: [] });
        else if (o !== t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'cakisma', alanlar: [], benSildim: true });
        else sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'benimSildi', alanlar: [] });
        continue;
      }
      if (o === t) { sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'benimDegisti', alanlar: alanlar() }); continue; }
      if (b === t) sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'degisti', alanlar: alanlar() });
      else sonuc.push({ tablo, etiket, id, baslik: baslik(), tur: 'cakisma', alanlar: alanlar() });
    }
  }
  return sonuc;
}

/**
 * Kullanıcının kararlarından içe aktarma seçimi: dahil edilen yeni / değişenler ve "onunki" seçilen çakışmalar; dahil edilmeyen benim
 * değişikliğim / silmem için son sürümdeki satır (geri alma), dahil edilmeyen benim eklediğim için silinecekler.
 * Her çakışma için karar zorunludur; listede olmayan kayıt seçilemez.
 * @param {UcluFarkOgesi[]} farklar @param {unknown} kararlar { "<tablo>:<id>": 'dahil' | 'haric' | 'onunki' | 'benimki' }
 * @returns {{ secimler: Record<string, string[]>; silinecekler: Array<{ tablo: string; id: string }>; dahil: number; haric: number; geriAlinan: number }}
 */
export function birlestirmeSecimi(farklar, kararlar) {
  const k = kararlar && typeof kararlar === 'object' ? /** @type {Record<string, unknown>} */ (kararlar) : {};
  /** @type {Record<string, string[]>} */
  const secimler = {};
  /** @type {Array<{ tablo: string; id: string }>} */
  const silinecekler = [];
  let dahil = 0;
  let haric = 0;
  let geriAlinan = 0;
  for (const f of farklar) {
    if (f.tur === 'silindi') continue;
    const karar = k[`${f.tablo}:${f.id}`];
    if (f.tur === 'benimDegisti' || f.tur === 'benimSildi' || f.tur === 'benimYeni') {
      if (karar !== 'haric') continue;
      geriAlinan++;
      if (f.tur === 'benimYeni') silinecekler.push({ tablo: f.tablo, id: f.id });
      else (secimler[f.tablo] ??= []).push(f.id);
      continue;
    }
    let al;
    if (f.tur === 'cakisma') {
      if (karar !== 'onunki' && karar !== 'benimki') throw new Error(`Çakışan kayıt için karar verin: ${f.etiket} › ${f.baslik}`);
      al = karar === 'onunki';
    } else {
      al = karar !== 'haric';
    }
    if (al) { (secimler[f.tablo] ??= []).push(f.id); dahil++; } else haric++;
  }
  return { secimler, silinecekler, dahil, haric, geriAlinan };
}

/**
 * Dahil edilmeyen, benim eklediğim kayıtları siler (bağlı alt kayıtlar şemadaki gibi birlikte gider); her silme değişiklik geçmişine yazılır.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {Array<{ tablo: string; id: string }>} silinecekler @param {string} [yapan]
 * @returns {number} silinen
 */
export function eklediklerimiSil(vt, silinecekler, yapan) {
  return vt.islem(() => {
    let n = 0;
    for (const { tablo, id } of silinecekler) {
      if (!(tablo in ONIZLEME_TABLOLARI)) continue;
      const pk = String(BIRINCIL.get(tablo));
      const onceki = vt.tek(`SELECT * FROM ${tablo} WHERE ${pk} = ?`, [id]);
      if (!onceki) continue;
      vt.calistir(`DELETE FROM ${tablo} WHERE ${pk} = ?`, [id]);
      gecmisYaz(vt, { varlikTuru: tablo, varlikId: id, islem: 'sil', yapan, onceki, aciklama: 'Ekip yayınına dahil edilmedi (geri alındı).' });
      n++;
    }
    return n;
  });
}
