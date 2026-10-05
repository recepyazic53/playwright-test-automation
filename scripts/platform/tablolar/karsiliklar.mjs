// SAYFA DEĞERLERİNİ EKRANDAN ALMA — ekran alanı bir tablo sütununa bağlıyken, ekran modelindeki seçeneğin sayfa değeri
// (seçenek value'su) senaryo değerinden farklıysa sütunun karşılıklarına "sayfa" olarak yazılır. Böylece seçenek listesi
// modelden kalksa da koşu doğru seçeneği seçer. Yalnız eksik olanlar eklenir; kullanıcının girdiği karşılık değişmez.
// Gizli sütun ve tabloda olmayan değer atlanır.
// SENARYO AYARI (ekranda karşılığı olmayan, akışı dallandıran seçim; senaryo-servisi.mjs ekranGirdileri senaryoAyari): tablodaki okunur
// değer seçeneğin metniyle eşleşiyorsa "sayfa" = seçeneğin KODU yazılır (koşu tablodaki değeri koda çevirir; ekran-basvurulari.mjs).
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { etkinAlanBaglari } from './ekran-baglari.mjs';
import { tabloKaydet, tablolariListele } from './tablo-deposu.mjs';
import { sutunBul } from './tablo-secimi.mjs';
import { olasiBaglar } from './secime-gore-bag.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

const kucuk = (/** @type {string} */ x) => x.trim().toLocaleLowerCase('tr');

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
  // Seçime göre değişen bağda her olası bağın sütunu tamamlanır (secime-gore-bag.mjs).
  for (const [alan, b] of Object.entries(baglar).flatMap(([a, bag]) => olasiBaglar(bag).map((x) => /** @type {const} */ ([a, x])))) {
    const g = girdiler.find((x) => x.id === alan);
    const t = tablolar.find((x) => x.id === b.tablo);
    const s = t ? sutunBul(t, b.sutun) : undefined;
    if (!g || !t || !s || s.gizli) continue;
    const tabloda = new Set(t.satirlar.map((r) => r.degerler[s.ad]).filter((v) => v !== null && v !== undefined && v !== ''));
    const sutunlar = degisen.get(t.id) ?? new Map();
    const k = sutunlar.get(s.ad) ?? { ...(s.karsiliklar || {}) };
    let sayi = 0;
    if (g.senaryoAyari) {
      // Senaryo ayarı: tablodaki okunur değer (seçenek metni, ör. "Kargo ile") → seçeneğin KODU (ör. "kargo"). Değer zaten kodsa gerekmez.
      for (const v of tabloda) {
        if (k[v]?.sayfa || g.secenekler.some((x) => x.deger === v)) continue;
        const x = g.secenekler.find((y) => [y.metin, y.deger, y.ekranMetni].some((m) => m && kucuk(m) === kucuk(v)));
        if (!x) continue;
        k[v] = { ...k[v], sayfa: x.deger };
        sayi++;
      }
    } else {
      for (const x of g.secenekler) {
        if (!x.ekranDegeri || x.ekranDegeri === x.deger || !tabloda.has(x.deger) || k[x.deger]?.sayfa) continue;
        k[x.deger] = { ...k[x.deger], sayfa: x.ekranDegeri };
        sayi++;
      }
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
