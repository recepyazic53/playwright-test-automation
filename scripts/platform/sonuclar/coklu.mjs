// ÇOKLU / KARMA RAPOR HESABI (saf; yan etki yok): birden çok ekranın ya da servisin (ya da ikisinin birlikte) dönem raporunda
// öğe sonuçlarının birleştirilmesi. Öğe başına hesap A1'in tek öğe hesabıdır (donem-raporu.mjs); burada yalnız toplama yapılır:
//   - sayılar ve kovalar TOPLANIR, oran toplamdan yeniden hesaplanır (oranların ortalaması alınmaz) — Sonuçlar ekranıyla aynı
//     formül (hesaplama.mjs > basariYuzdesi): başarılı ÷ (başarılı + başarısız + atlanan + hata), durdurulan paydaya girmez;
//   - önceki eşit dönem de aynı biçimde toplanır; önceki dönemde hiç sonuç yoksa önceki oran null (fark gösterilmez);
//   - sağlık sıralaması: öğe başına rozet (oncelik.mjs > durumRozeti; kritik akış işareti henüz yok), sonra başarı, P1, kötüleşen;
//   - hata sınıfı dağılımı: öğe başına bu dönemdeki başarısız sonuçların (sorun adedi n) sınıfa göre toplamı;
//   - bağlantılı sorunlar (sorun-modeli.mjs > baglantiliSorunlar) tek aksiyonda birleşir: puanı yüksek olan kalır.
import { basariYuzdesi } from './hesaplama.mjs';
import { SINIFLAR, durumRozeti } from './oncelik.mjs';

/** @typedef {{ basarili: number; basarisiz: number; atlanan: number; hata: number; durduruldu: number }} TamSayilar */
/** @typedef {Partial<TamSayilar>} KismiSayilar */

/** @returns {TamSayilar} */
const bos = () => ({ basarili: 0, basarisiz: 0, atlanan: 0, hata: 0, durduruldu: 0 });

/**
 * Sayıların toplamı (eksik alan 0).
 * @param {ReadonlyArray<KismiSayilar>} liste @returns {TamSayilar}
 */
export function sayilariBirlestir(liste) {
  const t = bos();
  for (const s of liste) {
    t.basarili += s.basarili ?? 0;
    t.basarisiz += s.basarisiz ?? 0;
    t.atlanan += s.atlanan ?? 0;
    t.hata += s.hata ?? 0;
    t.durduruldu += s.durduruldu ?? 0;
  }
  return t;
}

/** Sonuç adedi (durdurulan hariç: başarı oranının paydası). @param {KismiSayilar} s */
export const sonucAdedi = (s) => (s.basarili ?? 0) + (s.basarisiz ?? 0) + (s.atlanan ?? 0) + (s.hata ?? 0);

/**
 * Kova serilerinin toplamı: her öğenin kova başına sayıları (aynı dönem, aynı kovalar) indekse göre toplanır.
 * @param {ReadonlyArray<ReadonlyArray<KismiSayilar>>} listeler @param {number} uzunluk kova sayısı
 * @returns {Array<TamSayilar & { adet: number; kalan: number; oran: number | null }>}
 */
export function kovalariBirlestir(listeler, uzunluk) {
  return Array.from({ length: uzunluk }, (_, i) => {
    const s = sayilariBirlestir(listeler.map((l) => l[i] ?? {}));
    return { ...s, adet: sonucAdedi(s), kalan: s.basarisiz + s.hata, oran: basariYuzdesi(s) };
  });
}

/**
 * Bu dönem ve önceki eşit dönem toplamları + başarı oranları ve fark (puan).
 * @param {ReadonlyArray<KismiSayilar>} simdi öğe başına bu dönem @param {ReadonlyArray<KismiSayilar>} onceki öğe başına önceki dönem
 */
export function birlesikOzet(simdi, onceki) {
  const s = sayilariBirlestir(simdi);
  const o = sayilariBirlestir(onceki);
  const basari = basariYuzdesi(s);
  const oncekiVar = sonucAdedi(o) > 0;
  const oncekiBasari = oncekiVar ? basariYuzdesi(o) : null;
  return {
    sayilar: s, oncekiSayilar: o, basari, oncekiBasari, oncekiVar, adet: sonucAdedi(s), oncekiAdet: oncekiVar ? sonucAdedi(o) : null,
    fark: basari !== null && oncekiBasari !== null ? basari - oncekiBasari : null
  };
}

/** Rozetin önem sırası (küçük = daha kötü). */
export const ROZET_SIRASI = Object.freeze({ kritik: 0, dikkat: 1, saglikli: 2 });

/**
 * Sağlık sıralaması: en çok ilgi isteyen öğe başta. Sıra anahtarları: dönemde sonucu olan öğeler önce (sonucu olmayan sona) →
 * rozet (Kritik → Dikkat → Sağlıklı) → başarı (düşük önce) → P1 aksiyon (çok önce) → kötüleşen sorun → açık sorun → ad.
 * kritikKaldi: öğe kritik işaretli (Ayarlar > Raporlar) ve son koşusunda başarısız oldu → öğenin rozeti Kritik (A4; yoksa önceki davranış).
 * @template {{ ad: string; basari: number | null; p1: number; kotulesen: number; acikSorun: number; kritikKaldi?: boolean }} T
 * @param {ReadonlyArray<T>} ogeler @param {{ yesil: number; sari: number }} esikler
 * @returns {Array<T & { rozet: { durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string }; sira: number }>}
 */
export function saglikSiralamasi(ogeler, esikler) {
  return ogeler.map((o) => ({ ...o, rozet: durumRozeti({ basari: o.basari, p1: o.p1, esikler, kritikKaldi: o.kritikKaldi === true }) }))
    .sort((a, b) => Number(a.basari === null) - Number(b.basari === null)
      || ROZET_SIRASI[a.rozet.durum] - ROZET_SIRASI[b.rozet.durum]
      || (a.basari ?? 0) - (b.basari ?? 0)
      || b.p1 - a.p1 || b.kotulesen - a.kotulesen || b.acikSorun - a.acikSorun
      || a.ad.localeCompare(b.ad, 'tr'))
    .map((o, i) => ({ ...o, sira: i + 1 }));
}

/** Kötüleşen sorun durumları. */
export const KOTULESEN_DURUMLAR = Object.freeze(['yeni', 'artan', 'tekrar']);

/**
 * Öğenin açık / kötüleşen sorunları ve P1 sayısı.
 * @param {ReadonlyArray<{ durum: string; bant: string }>} sorunlar öğenin sorunları
 */
export function sorunSayimi(sorunlar) {
  const acik = sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  return {
    acikSorun: acik.length, kotulesen: acik.filter((s) => KOTULESEN_DURUMLAR.includes(s.durum)).length, p1: acik.filter((s) => s.bant === 'P1').length
  };
}

/**
 * Hata sınıfı dağılımı: öğe başına bu dönemdeki başarısız sonuçların (sorunun n'i) sınıfa göre toplamı.
 * @param {ReadonlyArray<{ ogeId: string; sinif: string; n: number }>} sorunlar
 * @param {ReadonlyArray<{ id: string; ad: string; tur: 'ekran' | 'servis' }>} ogeler
 */
export function sinifDagilimi(sorunlar, ogeler) {
  return ogeler.map((o) => {
    /** @type {Record<string, number>} */
    const sayilar = Object.fromEntries(Object.keys(SINIFLAR).map((k) => [k, 0]));
    for (const s of sorunlar) if (s.ogeId === o.id && s.n > 0) sayilar[s.sinif in sayilar ? s.sinif : 'uygulama'] += s.n;
    return { id: o.id, ad: o.ad, tur: o.tur, sayilar, toplam: Object.values(sayilar).reduce((a, b) => a + b, 0) };
  });
}

/**
 * Bağlantılı sorun çiftlerini tek aksiyonda birleştirir: iki sorun da açıksa puanı düşük olan aksiyon listesinden çıkar (haric),
 * yüksek olana "bağlantılı" notu eklenir. Bir sorun birden çok çiftteyse ilk (en yüksek örtüşmeli) çift esas alınır.
 * @template {{ imza: string; puan: number; durum: string; baslik: string; nerede: string }} T
 * @param {ReadonlyArray<{ ekran: T; servis: T; jaccard: number }>} ciftler
 * @returns {{ haric: Set<string>; notlar: Map<string, string> }} notlar: kalan sorunun imzası → birleşen sorunun kısa adı
 */
export function aksiyonlariBirlestir(ciftler) {
  const acik = (/** @type {T} */ s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi';
  /** @type {Set<string>} */
  const haric = new Set();
  /** @type {Map<string, string>} */
  const notlar = new Map();
  for (const c of ciftler) {
    if (!acik(c.ekran) || !acik(c.servis)) continue;
    if (haric.has(c.ekran.imza) || haric.has(c.servis.imza) || notlar.has(c.ekran.imza) || notlar.has(c.servis.imza)) continue;
    const [kalan, giden] = c.servis.puan > c.ekran.puan ? [c.servis, c.ekran] : [c.ekran, c.servis];
    haric.add(giden.imza);
    notlar.set(kalan.imza, `${giden.baslik} — ${giden.nerede}`);
  }
  return { haric, notlar };
}
