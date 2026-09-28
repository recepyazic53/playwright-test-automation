// ÖNCELİK VE DURUM ROZETİ (saf): sorunun öncelik puanı (0–100), P1 / P2 / P3 bandı, aksiyon önerisi, sahip önerisi ve raporun
// durum rozeti (Sağlıklı / Dikkat / Kritik). Formüller PDF rapor tasarımıyla aynıdır:
//   Puan = 100 × Sınıf katsayısı × (0,30·Etki + 0,25·Sıklık + 0,20·Eğilim + 0,15·Kritiklik + 0,10·Süreklilik)
//     Etki = min(1, etkilenen senaryo / 3) · Sıklık = min(1, hata oranı / %50) · Eğilim = duruma göre ağırlık
//     Kritiklik = kritik işaretli öğe 1, diğer 0 (işaret Ayarlar > Raporlar'da; işaret yoksa 0 — önceki davranış) · Süreklilik = min(1, açık gün / 14)
//   Bantlar: P1 ≥ 60 · P2 35–59 · P3 < 35.
//   Rozet: Sağlıklı = dönem başarısı ≥ yeşil eşik ve P1 yok · Kritik = başarı < sarı eşik ya da kapsamdaki kritik akış son koşusunda
//   kaldı ya da ≥ 3 P1 · diğer Dikkat. Eşikler: Ayarlar > Arayüz > Sağlık noktası (proje başına; ayarlar/saglik-esikleri.mjs).
// Sahip önerisi: öğenin Ayarlar > Raporlar'daki ekibi (ekip eşlemesi; donem-raporu.mjs uygular), eşleme yoksa sınıfın varsayılan ekibi.

/** Sınıflar (kök neden tahmini): katsayı, varsayılan sahip, simge (renk tek başına anlam taşımaz). */
export const SINIFLAR = Object.freeze({
  uygulama: Object.freeze({ ad: 'Uygulama', katsayi: 1.0, sahip: 'Uygulama ekibi', simge: '■' }),
  veri: Object.freeze({ ad: 'Test verisi', katsayi: 0.8, sahip: 'Test verisi sorumlusu', simge: '◆' }),
  bakim: Object.freeze({ ad: 'Test bakımı', katsayi: 0.7, sahip: 'Test ekibi (model / senaryo)', simge: '▲' }),
  ortam: Object.freeze({ ad: 'Ortam', katsayi: 0.6, sahip: 'Ortam / altyapı ekibi', simge: '●' }),
  kararsiz: Object.freeze({ ad: 'Kararsız', katsayi: 0.5, sahip: 'Test ekibi (kararlılık)', simge: '≈' })
});

/** Sorun durumuna göre eğilim ağırlığı. */
export const EGILIM_AGIRLIKLARI = Object.freeze({ yeni: 1.0, tekrar: 0.9, artan: 0.8, suregelen: 0.5, kararsiz: 0.4, azalan: 0.2, cozulen: 0, dogrulanamadi: 0 });
export const BILESEN_AGIRLIKLARI = Object.freeze({ etki: 0.30, siklik: 0.25, egilim: 0.20, kritiklik: 0.15, sureklilik: 0.10 });
export const BANT_ESIKLERI = Object.freeze({ p1: 60, p2: 35 });
/** Etki: bu kadar senaryo = 1; Sıklık: bu oran = 1; Süreklilik: bu kadar gün = 1. */
export const ETKI_SENARYO = 3;
export const SIKLIK_ORANI = 0.5;
export const SUREKLILIK_GUN = 14;
/** Sabit puanlı ek aksiyonlar (ör. her koşuda atlanan senaryo): P3. */
export const EK_AKSIYON_PUANI = 30;
/** Kullanıcı tanımlı süre eşiğini aşan öğe / metot (p95 > eşik): sabit puanlı ek aksiyon, P2 (bu dönem). */
export const ESIK_AKSIYON_PUANI = 40;

/** @param {number} x */
const sinirla = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * @param {{ sinif: string; durum: string; senaryo: number; oran: number; kritiklik?: number; acikGun?: number }} s
 * @returns {number} 0–100 (tam sayı)
 */
export function oncelikPuani(s) {
  const sinif = /** @type {Record<string, { katsayi: number }>} */ (SINIFLAR)[s.sinif] ?? SINIFLAR.uygulama;
  const egilim = /** @type {Record<string, number>} */ (EGILIM_AGIRLIKLARI)[s.durum] ?? 0;
  const a = BILESEN_AGIRLIKLARI;
  const ham = a.etki * sinirla(s.senaryo / ETKI_SENARYO) + a.siklik * sinirla(s.oran / SIKLIK_ORANI) + a.egilim * egilim
    + a.kritiklik * sinirla(s.kritiklik ?? 0) + a.sureklilik * sinirla((s.acikGun ?? 1) / SUREKLILIK_GUN);
  return Math.round(100 * sinif.katsayi * ham);
}

/** @param {number} puan @returns {'P1' | 'P2' | 'P3'} */
export const bant = (puan) => (puan >= BANT_ESIKLERI.p1 ? 'P1' : puan >= BANT_ESIKLERI.p2 ? 'P2' : 'P3');

/** @param {string} sinif */
export const sahipOnerisi = (sinif) => (/** @type {Record<string, { sahip: string }>} */ (SINIFLAR)[sinif] ?? SINIFLAR.uygulama).sahip;

/**
 * Sınıfa ve kaynağa göre önerilen aksiyon (şablon; kullanıcı verisi içermez).
 * @param {{ sinif: string; tur: 'ekran' | 'servis' }} s
 */
export function aksiyonOnerisi(s) {
  const ekran = s.tur === 'ekran';
  switch (s.sinif) {
    case 'veri': return ekran ? 'Test verisini gözden geçirin: senaryonun kullandığı tablo satırlarını ve değer listelerini güncelleyin.'
      : 'Test verisini gözden geçirin: isteğin kullandığı parametre değerlerini ve tablo satırlarını güncelleyin.';
    case 'bakim': return ekran ? 'Ekran modelini yeniden tarayın ya da senaryodaki adımı / seçiciyi güncelleyin.'
      : 'Senaryodaki kontrolü ya da isteği servisin güncel sözleşmesine göre güncelleyin.';
    case 'ortam': return 'Ortam / altyapı ekibine iletin: zaman aşımı ve bağlantı hatalarını ortam kayıtlarıyla karşılaştırın.';
    case 'kararsiz': return ekran ? 'Kararlılık: adıma bekleme ekleyin ya da senaryoyu yalıtın; aynı koşullarda bazen geçiyor.'
      : 'Kararlılık: isteği tekrar denemesiyle inceleyin; aynı koşullarda bazen geçiyor.';
    default: return ekran ? 'Uygulama ekibine bildirin: beklenen / görülen ve hata kalıbı raporda.'
      : 'Uygulama ekibine bildirin: metot, hata türü ve kalıp raporda.';
  }
}

/**
 * Aksiyon listesi: çözülen / doğrulanamayan sorunlar hariç, puana göre azalan; ilk "adet" kadarı.
 * @template {{ durum: string; puan: number }} T @param {ReadonlyArray<T>} sorunlar @param {number} [adet] @returns {T[]}
 */
export function aksiyonListesi(sorunlar, adet = 8) {
  return sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi').slice().sort((a, b) => b.puan - a.puan).slice(0, Math.max(0, adet));
}

/**
 * Durum rozeti.
 * @param {{ basari: number | null; p1: number; esikler: { yesil: number; sari: number }; kritikKaldi?: boolean }} g
 * @returns {{ durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string }}
 */
export function durumRozeti(g) {
  const yz = (/** @type {number} */ n) => `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
  if (g.basari === null) return { durum: 'dikkat', gerekce: 'Bu dönemde tam koşu yok; başarı oranı hesaplanamadı.' };
  if (g.basari < g.esikler.sari) return { durum: 'kritik', gerekce: `Dönem başarısı ${yz(g.basari)} — sarı eşik %${g.esikler.sari}'in altında.` };
  if (g.kritikKaldi) return { durum: 'kritik', gerekce: 'Kapsamdaki kritik akış son koşusunda kaldı.' };
  if (g.p1 >= 3) return { durum: 'kritik', gerekce: `${g.p1} P1 aksiyon var.` };
  if (g.basari >= g.esikler.yesil && g.p1 === 0) return { durum: 'saglikli', gerekce: `Dönem başarısı ${yz(g.basari)} (yeşil eşik %${g.esikler.yesil}); P1 aksiyon yok.` };
  const nedenler = [];
  if (g.basari < g.esikler.yesil) nedenler.push(`dönem başarısı ${yz(g.basari)} — yeşil eşik %${g.esikler.yesil}'in altında`);
  if (g.p1) nedenler.push(`${g.p1} P1 aksiyon`);
  const m = nedenler.join('; ');
  return { durum: 'dikkat', gerekce: `${m.charAt(0).toLocaleUpperCase('tr')}${m.slice(1)}.` };
}
