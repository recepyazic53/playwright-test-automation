// SAYFA DEĞERLERİNİ EKRANDAN ALMA — ekran alanı bir tablo sütununa bağlıyken, ekran modelindeki seçeneğin sayfa değeri
// (seçenek value'su) senaryo değerinden farklıysa sütunun karşılıklarına "sayfa" olarak yazılır. Böylece seçenek listesi
// modelden kalksa da koşu doğru seçeneği seçer. Yalnız eksik olanlar eklenir; kullanıcının girdiği karşılık değişmez.
// Gizli sütun ve tabloda olmayan değer atlanır.
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { etkinAlanBaglari } from './ekran-baglari.mjs';
import { tabloKaydet, tablolariListele } from './tablo-deposu.mjs';
import { sutunBul } from './tablo-secimi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/**
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @returns {{ eklenen: number; tablolar: string[] }}
 */
export function karsiliklariEkrandanAl(vt, projeId, ekranId) {
  const baglar = etkinAlanBaglari(vt, ekranId);
  if (!Object.keys(baglar).length) return { eklenen: 0, tablolar: [] };
  const { girdiler } = ekranGirdileri(vt, projeId, ekranId);
  const tablolar = tablolariListele(vt, projeId);
  /** @type {Map<string, Map<string, Record<string, { sayfa?: string; servis?: string }>>>} tablo → sütun → yeni karşılıklar */
  const degisen = new Map();
  let eklenen = 0;
  for (const [alan, b] of Object.entries(baglar)) {
    const g = girdiler.find((x) => x.id === alan);
    const t = tablolar.find((x) => x.id === b.tablo);
    const s = t ? sutunBul(t, b.sutun) : undefined;
    if (!g || !t || !s || s.gizli) continue;
    const tabloda = new Set(t.satirlar.map((r) => r.degerler[s.ad]).filter((v) => v !== null && v !== undefined && v !== ''));
    const sutunlar = degisen.get(t.id) ?? new Map();
    const k = sutunlar.get(s.ad) ?? { ...(s.karsiliklar || {}) };
    let sayi = 0;
    for (const x of g.secenekler) {
      if (!x.ekranDegeri || x.ekranDegeri === x.deger || !tabloda.has(x.deger) || k[x.deger]?.sayfa) continue;
      k[x.deger] = { ...k[x.deger], sayfa: x.ekranDegeri };
      sayi++;
    }
    if (!sayi) continue;
    eklenen += sayi;
    sutunlar.set(s.ad, k);
    degisen.set(t.id, sutunlar);
  }
  for (const [id, sutunlar] of degisen) {
    const t = /** @type {import('./tablo-deposu.mjs').Tablo} */ (tablolar.find((x) => x.id === id));
    tabloKaydet(vt, {
      projeId, id, ad: t.ad,
      sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli, ...(sutunlar.has(s.ad) ? { karsiliklar: sutunlar.get(s.ad) } : {}) }))
    });
  }
  return { eklenen, tablolar: [...degisen.keys()].map((id) => tablolar.find((x) => x.id === id)?.ad ?? id) };
}
