// GENEL RAPOR HESABI (saf; yan etki yok): projenin tamamını kapsayan dönem raporunun (A3) yalnız genel rapora özgü bölümleri.
// Ekran / servis toplamı, sorunlar, aksiyonlar, bağlantılı sorunlar ve sağlık sıralaması çoklu raporun hesabıdır (coklu.mjs,
// donem-raporu.mjs > cokluBolumler); burada kopyalanmaz. Buradakiler:
//   - planlı koşu güvenilirliği: tamamlanan tetikleme ÷ takvime göre beklenen tetikleme (sonucun başarısından bağımsız);
//     tetikleme geçmişi kural başına son GECMIS_SINIRI kayıtla sınırlıdır: pencere geçmişin en eski kaydından öncesini kapsıyorsa
//     hesap o kayıttan başlatılır ve "kısıtlı" işaretlenir (kalıcı tetikleme kaydı sonraki aşamada);
//   - kararsız testler listesi (ekran + servis senaryoları; kararlılık sorun-modeli.mjs'dendir);
//   - test verisi sağlığı özeti (Test verisi ekranındaki "Veri sağlığı" denetimleri + test verisi sınıflı başarısız sonuçlar);
//   - metot kapsamı (servis sözleşmesindeki operasyonlardan senaryosu olanlar) ve ortamlara göre oranlar.
// Değer içermez: yalnız ad, sayı ve oran.
import { basariYuzdesi } from './hesaplama.mjs';
import { gununZamanlari } from '../zamanlama/takvim.mjs';

/** Tamamlanmış sayılan tetikleme durumları ("başarısız" = koşu tamamlandı ama en az bir test başarısız oldu). */
export const TAMAMLANAN_TETIKLEMELER = Object.freeze(['tamamlandi', 'basarisiz']);

/**
 * Takvime göre [bas, bit) aralığındaki çalışma zamanları (yerel gün gün; aralık uzunluğu en çok ~400 gün).
 * @param {import('../zamanlama/takvim.d.mts').Zaman} zaman @param {number} bas @param {number} bit
 * @returns {number[]}
 */
export function beklenenZamanlar(zaman, bas, bit) {
  /** @type {number[]} */
  const liste = [];
  if (!(bit > bas)) return liste;
  const b = new Date(bas);
  for (let gun = new Date(b.getFullYear(), b.getMonth(), b.getDate()), i = 0; gun.getTime() < bit && i < 400; gun = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate() + 1), i++) {
    for (const t of gununZamanlari(zaman, gun)) if (t.getTime() >= bas && t.getTime() < bit) liste.push(t.getTime());
  }
  return liste;
}

/**
 * @typedef {{ zaman: string; durum: string }} TetiklemeKaydi
 * @typedef {{ beklenen: number | null; kayit: number; tamamlandi: number; basarisizSonuclu: number; atlandi: number; yarida: number; hata: number;
 *   kacan: number | null; guvenilirlik: number | null; kisitli: boolean; bas: number; bit: number }} PencereSonucu
 */

/**
 * Bir kuralın bir penceredeki güvenilirliği.
 * @param {{ zaman: import('../zamanlama/takvim.d.mts').Zaman; etkin: boolean; olusturulma: string }} kural
 * @param {ReadonlyArray<TetiklemeKaydi>} gecmis en yeniden eskiye (kurallar.mjs) ya da sırasız
 * @param {{ bas: number; bit: number; simdi: number; gecmisSiniri: number }} p
 * @returns {PencereSonucu}
 */
export function pencereGuvenilirligi(kural, gecmis, p) {
  const zamanlar = gecmis.map((t) => Date.parse(t.zaman)).filter((t) => !Number.isNaN(t));
  const enEski = zamanlar.length ? Math.min(...zamanlar) : null;
  const olusturulma = Date.parse(kural.olusturulma);
  let bas = Math.max(p.bas, Number.isNaN(olusturulma) ? p.bas : olusturulma);
  const bit = Math.min(p.bit, p.simdi);
  // Geçmiş sınıra ulaştıysa en eski kayıttan öncesi bilinmez: pencere o kayda daraltılır.
  let kisitli = false;
  if (enEski !== null && gecmis.length >= p.gecmisSiniri && enEski > bas) { bas = enEski; kisitli = true; }
  const icinde = gecmis.filter((t) => { const z = Date.parse(t.zaman); return z >= bas && z < bit; });
  const say = (/** @type {string} */ d) => icinde.filter((t) => t.durum === d).length;
  const tamamlandi = icinde.filter((t) => TAMAMLANAN_TETIKLEMELER.includes(t.durum)).length;
  const beklenen = kural.etkin ? beklenenZamanlar(kural.zaman, bas, bit).length : null;
  return {
    beklenen, kayit: icinde.length, tamamlandi, basarisizSonuclu: say('basarisiz'), atlandi: say('atlandi'), yarida: say('yarida'), hata: say('hata'),
    kacan: beklenen === null ? null : Math.max(0, beklenen - icinde.filter((t) => t.durum !== 'calisiyor').length),
    guvenilirlik: beklenen ? Math.min(100, (tamamlandi / beklenen) * 100) : null, kisitli, bas, bit
  };
}

/**
 * Toplam güvenilirlik (etkin kuralların tamamlanan ÷ beklenen toplamı).
 * @param {ReadonlyArray<{ beklenen: number | null; tamamlandi: number }>} l
 */
export function toplamGuvenilirlik(l) {
  const olculen = l.filter((x) => x.beklenen !== null);
  const beklenen = olculen.reduce((a, x) => a + Number(x.beklenen), 0);
  const tamamlandi = olculen.reduce((a, x) => a + x.tamamlandi, 0);
  return { beklenen, tamamlandi, guvenilirlik: beklenen ? Math.min(100, (tamamlandi / beklenen) * 100) : null };
}

/**
 * Kararsız / izlenen senaryolar: kararsızlık oranına göre (yüksek önce), en çok `enCok`.
 * @template {{ ad: string; oran: number; durum: string; kosu: number }} T
 * @param {ReadonlyArray<T>} l @param {number} enCok
 * @returns {T[]}
 */
export function kararsizListesi(l, enCok) {
  const sira = (/** @type {string} */ d) => (d === 'kararsiz' ? 0 : 1);
  return l.filter((x) => x.durum === 'kararsiz' || x.durum === 'izlenir')
    .sort((a, b) => sira(a.durum) - sira(b.durum) || b.oran - a.oran || b.kosu - a.kosu || a.ad.localeCompare(b.ad, 'tr')).slice(0, enCok);
}

/**
 * Servis sözleşmesindeki operasyonlardan senaryosu olanlar. Operasyon, senaryo içeriğindeki "operasyon" adıyla ya da REST'te
 * "YÖNTEM yol" (sorgu dizesi olmadan) metot adıyla eşleşir. Operasyon listesi olmayan servis ölçülmez (null).
 * @param {ReadonlyArray<{ ad: string; metot?: string; yol?: string }> | undefined} operasyonlar
 * @param {ReadonlyArray<{ operasyon?: unknown; metot: string }>} senaryolar senaryo içeriğinin operasyonu + servisMetodu
 * @returns {{ toplam: number; senaryolu: number; eksik: string[] } | null}
 */
export function metotKapsami(operasyonlar, senaryolar) {
  if (!Array.isArray(operasyonlar) || !operasyonlar.length) return null;
  const adlar = new Set(senaryolar.flatMap((s) => [typeof s.operasyon === 'string' ? s.operasyon : '', s.metot]).filter(Boolean));
  /** @type {string[]} */
  const eksik = [];
  let senaryolu = 0;
  for (const o of operasyonlar) {
    const rest = o.metot ? `${o.metot} ${String(o.yol ?? '').split('?')[0] || '/'}` : '';
    if (adlar.has(o.ad) || (rest && adlar.has(rest))) senaryolu++;
    else eksik.push(rest || o.ad);
  }
  return { toplam: operasyonlar.length, senaryolu, eksik };
}

/**
 * Ortamlara göre oranlar: öğe başına ortam sayılarının toplamı (ekran = tam koşu testleri, servis = çağrılar).
 * @param {ReadonlyArray<{ id: string; ad: string; riskli: boolean }>} ortamlar
 * @param {ReadonlyArray<Record<string, Record<string, number>>>} ekran öğe başına ortamId → sayılar
 * @param {ReadonlyArray<Record<string, Record<string, number>>>} servis öğe başına ortamId → sayılar
 */
export function ortamOranlari(ortamlar, ekran, servis) {
  /** @param {ReadonlyArray<Record<string, Record<string, number>>>} l @param {string} id */
  const topla = (l, id) => {
    const t = { basarili: 0, basarisiz: 0, atlanan: 0, hata: 0 };
    for (const x of l) {
      const s = x[id];
      if (!s) continue;
      t.basarili += s.basarili ?? 0; t.basarisiz += s.basarisiz ?? 0; t.atlanan += s.atlanan ?? 0; t.hata += s.hata ?? 0;
    }
    return t;
  };
  return ortamlar.map((o) => {
    const e = topla(ekran, o.id);
    const s = topla(servis, o.id);
    const test = e.basarili + e.basarisiz + e.atlanan + e.hata;
    const cagri = s.basarili + s.basarisiz + s.atlanan + s.hata;
    return { id: o.id, ad: o.ad, riskli: o.riskli, test, ekranBasari: test ? basariYuzdesi(e) : null, cagri, servisBasari: cagri ? basariYuzdesi(s) : null };
  });
}
