// "VERİ BEKLİYOR" SENARYOLARI (saf kurallar; sunucu ve koşu ortak). Hızlı test kaydında seçilen "veri gerekli" öneri (dalın değeri olmayan
// alanları) değer UYDURULMADAN kaydedilir: senaryo o alanları kendi test verisi satırından (${Tablo[dal].Sütun}) okur, satırın hücreleri boş
// kalır ve senaryo koşuya dahil edilmez. İçerikte işaret: veriBekliyor = [{ etiket, tabloId, sutun, satirId }].
//   veriBekliyorAyikla   kaydedilecek listeyi denetler (geçersiz öğe atılır; boşsa null).
//   bekleyenAlanlar      tabloların GÜNCEL hâline göre hâlâ boş olanlar (hücre doldurulunca listeden düşer; tablo / satır silindiyse yine
//                        bekliyor sayılır). Gizli sütunda değer okunmaz: doluGizli (değeri kayıtlı gizli sütunlar) ya da çözülmüş değer.
//   veriBekliyorMesaji   koşunun açık hatası: "Şu alanların değeri yok: X, Y — test verisinde doldurun."
// Hiçbir değer üretilmez; değer GÖSTERİLMEZ (yalnız alan, tablo, sütun ve satır adı).

/** Bekleyen hücrelerin senaryodaki grup etiketi: ${Tablo[dal].Sütun} (senaryonun ana satırıyla karışmaz). */
export const VERI_BEKLIYOR_ETIKETI = 'dal';
const EN_COK = 40;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metin = (/** @type {unknown} */ x, /** @type {number} */ n) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : null);

/**
 * Kaydedilecek veri bekliyor listesi: her öğe { etiket, tabloId, sutun, satirId } (hepsi dolu metin). Geçersiz öğe atılır; boşsa null.
 * @param {unknown} l @returns {Array<{ etiket: string; tabloId: string; sutun: string; satirId: string }> | null}
 */
export function veriBekliyorAyikla(l) {
  if (!Array.isArray(l)) return null;
  const sonuc = [];
  for (const x of l.slice(0, EN_COK)) {
    if (!nesneMi(x)) continue;
    const etiket = metin(x.etiket, 120);
    const tabloId = metin(x.tabloId, 100);
    const sutun = metin(x.sutun, 60);
    const satirId = metin(x.satirId, 100);
    if (etiket && tabloId && sutun && satirId) sonuc.push({ etiket, tabloId, sutun, satirId });
  }
  return sonuc.length ? sonuc : null;
}

/**
 * Hâlâ değeri olmayan alanlar (tabloların güncel hâli): tablo / satır / sütun yoksa ya da hücre boşsa bekliyor.
 * @param {unknown} liste içerikteki veriBekliyor
 * @param {ReadonlyArray<{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: ReadonlyArray<{ id?: string; ad?: string; degerler: Record<string, unknown>; doluGizli?: ReadonlyArray<string> }> }>} tablolar
 * @returns {Array<{ etiket: string; tabloId: string; tablo: string | null; sutun: string; satirId: string; satirAdi: string | null }>}
 */
export function bekleyenAlanlar(liste, tablolar) {
  const l = veriBekliyorAyikla(liste) ?? [];
  return l.flatMap((x) => {
    const t = tablolar.find((y) => y.id === x.tabloId);
    const r = t?.satirlar.find((y) => String(y.id) === x.satirId);
    const s = t?.sutunlar.find((y) => y.ad === x.sutun);
    const v = r?.degerler[x.sutun];
    const dolu = Boolean(r && s && ((v !== undefined && v !== null && String(v).trim() !== '') || (s.gizli && r.doluGizli?.includes(x.sutun))));
    return dolu ? [] : [{ ...x, tablo: t?.ad ?? null, satirAdi: r?.ad ?? null }];
  });
}

/** Koşunun açık hatası. @param {ReadonlyArray<{ etiket: string }>} bekleyen */
export const veriBekliyorMesaji = (bekleyen) => `Şu alanların değeri yok: ${[...new Set(bekleyen.map((x) => x.etiket))].join(', ')} — test verisinde doldurun.`;
