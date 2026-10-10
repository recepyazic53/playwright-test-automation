// SEÇENEK DEĞİŞİKLİĞİNİ TABLOYA YANSITMA — "Modeli güncelle" karşılaştırmasında bir seçim alanına yeni seçenek geldiğinde ya da bir
// seçenek kalktığında, alanın bağlı olduğu test verisi tablosu da (kullanıcı onaylarsa) güncellenir: yeni seçenek tabloya satır olarak
// eklenir, kalkan seçeneğin satırları silinir. Hücre görünen metindir; sayfa değeri metinden farklıysa sütunun karşılığına ({ metin: { sayfa: değer } }) yazılır
// (paket-tablolari.mjs ile aynı biçim).
//   tabloOnerisi(baglar, tablolar, bulgu)       bulgu için öneri: { tabloId, tabloAd, sutun, islem, uygulanabilir, nedenKodu?, neden? } | null
//   secenekleriTabloyaYaz(vt, projeId, oneriler) önerileri uygular: { eklenen, silinen, sonuclar } (sonuclar: bulgu başına ne oldu)
// Uygulanamaz durumlar (nedenKodu + kısa neden; kullanıcı tabloyu elle günceller): secimeGore (bağ seçime göre değişiyor),
// tabloYok, baglamTablosu, sutunYok, sutunGizli, cokSutun (eklemede tablo birden çok sütunlu: satırın diğer hücreleri bilinmez).
// Kullanıcıya gösterilen tam cümle arayuz/secenek-tablo-notu.mjs'tedir.
// NOT: import.meta KULLANILMAZ.
import { BAGLAM_ONEKI, tabloKaydet } from './tablo-deposu.mjs';
import { secimeGoreVar } from './secime-gore-bag.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ id: string; ad: string; sutunlar: Array<{ ad: string; gizli?: boolean; karsiliklar?: Record<string, unknown> }>; satirlar: Array<{ id: string; degerler: Record<string, unknown> }> }} Tablo */
/** @typedef {{ bulguId: string; tabloId: string; tabloAd: string; sutun: string; islem: 'ekle' | 'cikar'; deger: string; metin: string; uygulanabilir: boolean; nedenKodu?: NedenKodu; neden?: string }} TabloOnerisi */
/** @typedef {'secimeGore' | 'tabloYok' | 'baglamTablosu' | 'sutunYok' | 'sutunGizli' | 'cokSutun'} NedenKodu */
/** @typedef {{ durum: 'eklendi' | 'zatenVardi' | 'silindi' | 'zatenYoktu'; satir?: number }} TabloSonucu */

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/**
 * Bulgunun (yeniSecenek / kaldirilanSecenek) tablo önerisi; alan bir tabloya bağlı değilse null.
 * @param {Record<string, any>} baglar alan kimliği → bağ (ekranın + ortak akışların) @param {Tablo[]} tablolar
 * @param {{ id: string; tur: string; alanId?: string; secenek?: { deger: string; metin: string } }} bulgu
 * @returns {TabloOnerisi | null}
 */
export function tabloOnerisi(baglar, tablolar, bulgu) {
  if ((bulgu.tur !== 'yeniSecenek' && bulgu.tur !== 'kaldirilanSecenek') || !bulgu.alanId || !bulgu.secenek) return null;
  const bag = baglar[bulgu.alanId];
  if (!bag || typeof bag !== 'object') return null;
  const islem = bulgu.tur === 'yeniSecenek' ? 'ekle' : 'cikar';
  const t = tablolar.find((x) => x.id === bag.tablo);
  const temel = {
    bulguId: String(bulgu.id), tabloId: String(bag.tablo), tabloAd: t ? t.ad : String(bag.tablo), sutun: String(bag.sutun), islem,
    deger: String(bulgu.secenek.deger ?? ''), metin: String(bulgu.secenek.metin || bulgu.secenek.deger || '')
  };
  /** @param {NedenKodu} nedenKodu @param {string} neden @returns {TabloOnerisi} */
  const olmaz = (nedenKodu, neden) => ({ ...temel, uygulanabilir: false, nedenKodu, neden });
  if (secimeGoreVar(bag)) return olmaz('secimeGore', 'alanın tablosu başka bir alandaki seçime göre değişiyor');
  if (!t) return olmaz('tabloYok', 'bağlı tablo bulunamadı');
  if (String(t.id).startsWith(BAGLAM_ONEKI)) return olmaz('baglamTablosu', 'bağlı tablo bir bağlam profili tablosu');
  const sutun = t.sutunlar.find((s) => s.ad === temel.sutun);
  if (!sutun) return olmaz('sutunYok', `tabloda "${temel.sutun}" sütunu yok`);
  if (sutun.gizli) return olmaz('sutunGizli', `"${temel.sutun}" sütunu gizli`);
  if (islem === 'ekle' && t.sutunlar.length > 1) return olmaz('cokSutun', 'tabloda birden çok sütun var (yeni satırın diğer sütunları bilinmiyor)');
  return { ...temel, uygulanabilir: true };
}

/** Satırın bu seçeneği taşıyıp taşımadığı (hücre metni ya da sayfa değeri, büyük / küçük harf yok sayılır). */
const satirSecenekMi = (/** @type {Tablo['satirlar'][number]} */ r, /** @type {TabloOnerisi} */ o) => {
  const v = kucuk(r.degerler[o.sutun]);
  return Boolean(v) && (v === kucuk(o.metin) || v === kucuk(o.deger));
};

/**
 * Uygulanabilir önerileri tablolara yazar (tablo başına tek kayıt). Eklenecek seçenek tabloda zaten varsa eklenmez.
 * @param {Veritabani} vt @param {string} projeId @param {Tablo[]} tablolar @param {TabloOnerisi[]} oneriler
 * sonuclar: bulgu başına ne olduğu (eklendi / zaten vardı / silindi + satır sayısı / zaten yoktu); arayüz "eklendi" demeden önce buna bakar.
 * @returns {{ eklenen: number; silinen: number; sonuclar: Record<string, TabloSonucu> }}
 */
export function secenekleriTabloyaYaz(vt, projeId, tablolar, oneriler) {
  let eklenen = 0;
  let silinen = 0;
  /** @type {Record<string, TabloSonucu>} */
  const sonuclar = {};
  /** @type {Map<string, TabloOnerisi[]>} */
  const tabloBasina = new Map();
  for (const o of oneriler) if (o.uygulanabilir) tabloBasina.set(o.tabloId, [...(tabloBasina.get(o.tabloId) ?? []), o]);
  for (const [tabloId, liste] of tabloBasina) {
    const t = tablolar.find((x) => x.id === tabloId);
    if (!t) continue;
    /** @type {Array<{ ortamId: null; degerler: Record<string, string> }>} */
    const yeniSatirlar = [];
    /** @type {string[]} */
    const silinenler = [];
    /** @type {Map<string, Record<string, { sayfa: string }>>} */
    const karsiliklar = new Map();
    for (const o of liste) {
      if (o.islem === 'cikar') {
        let n = 0;
        for (const r of t.satirlar) if (satirSecenekMi(r, o)) { if (!silinenler.includes(r.id)) silinenler.push(r.id); n++; }
        sonuclar[o.bulguId] = n ? { durum: 'silindi', satir: n } : { durum: 'zatenYoktu' };
        continue;
      }
      if (t.satirlar.some((r) => satirSecenekMi(r, o))) { sonuclar[o.bulguId] = { durum: 'zatenVardi' }; continue; }
      sonuclar[o.bulguId] = { durum: 'eklendi' };
      if (yeniSatirlar.some((r) => kucuk(r.degerler[o.sutun]) === kucuk(o.metin))) continue;
      yeniSatirlar.push({ ortamId: null, degerler: { [o.sutun]: o.metin } });
      // Sayfa değeri görünen metinden farklıysa sütunun karşılığına (metin → değer).
      if (o.deger && o.deger !== o.metin) karsiliklar.set(o.sutun, { ...(karsiliklar.get(o.sutun) ?? {}), [o.metin]: { sayfa: o.deger } });
    }
    if (!yeniSatirlar.length && !silinenler.length) continue;
    tabloKaydet(vt, {
      projeId, id: t.id, ad: t.ad,
      sutunlar: t.sutunlar.map((s) => ({
        ad: s.ad, eskiAd: s.ad, gizli: s.gizli === true,
        ...(karsiliklar.has(s.ad) ? { karsiliklar: { ...(s.karsiliklar ?? {}), ...karsiliklar.get(s.ad) } } : {})
      })),
      satirlar: yeniSatirlar, silinenSatirlar: silinenler
    });
    eklenen += yeniSatirlar.length;
    silinen += silinenler.length;
  }
  return { eklenen, silinen, sonuclar };
}
