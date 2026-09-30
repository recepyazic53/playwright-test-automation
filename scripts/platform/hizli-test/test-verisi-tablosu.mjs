// HIZLI TEST → TEST VERİSİ TABLOSU (saf kurallar). Kullanıcının veri durağında ELLE yazdığı değerler kaydederken bir test verisi
// tablosuna dönüşür: sütun adı = ekrandaki alan başlığı, tek satır = yazılan değerler; senaryonun alanları "${Tablo.Sütun}"
// başvurusuyla bu tabloya bağlanır (ekranın test verisi bölümünde görünür, tablodan değiştirilebilir). Değer ÜRETİLMEZ: yalnız
// kullanıcının yazdığı değerler taşınır; parola alanları ve boş değerler tabloya girmez. Gizli adlı sütunlar (kart no, CVV…) gizli olur.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { degerBasvurusuYaz } from '../tablolar/tablo-secimi.mjs';

const EN_COK_AD = 60;
/** Tablo / sütun adında kullanılamayan karakterler: . [ ] { } $ < > & | (tablo-deposu.mjs). @param {unknown} m @param {number} [en] */
export function adTemizle(m, en = EN_COK_AD) {
  return String(m ?? '').replace(/[.[\]{}$<>&|]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s:*：]+$/u, '').replace(/^[\s*]+/, '').trim().slice(0, en).trim();
}

/**
 * @param {{ ekranAdi: string; baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }> }} g
 * @returns {{ tabloAdi: string; satirAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
 *   baglar: Record<string, { tablo: string; sutun: string; basvuru: string }> } | null} taşınacak değer yoksa null
 */
export function tabloTaslagiKur(g) {
  const tabloAdi = adTemizle(`${g.ekranAdi} · ${g.baslik || 'Hızlı test'}`) || 'Hızlı test verisi';
  /** @type {Array<{ ad: string; gizli: boolean }>} */
  const sutunlar = [];
  /** @type {Record<string, string>} */
  const satir = {};
  /** @type {Record<string, { tablo: string; sutun: string; basvuru: string }>} */
  const baglar = {};
  const kullanilan = new Set();
  for (const a of g.alanlar) {
    const v = g.degerler[a.anahtar];
    if (!v || v.kaynak === 'tablo' || typeof v.deger !== 'string' || !v.deger.trim()) continue;
    if (['password', 'file'].includes(String(a.tur))) continue;
    let ad = adTemizle(a.etiket ?? a.ad ?? a.anahtar) || `Alan ${sutunlar.length + 1}`;
    for (let i = 2; kullanilan.has(ad.toLocaleLowerCase('tr')); i++) ad = `${adTemizle(a.etiket ?? a.ad ?? a.anahtar, EN_COK_AD - 4)} ${i}`;
    kullanilan.add(ad.toLocaleLowerCase('tr'));
    sutunlar.push({ ad, gizli: a.gizli === true || gizliAdMi(ad) });
    satir[ad] = v.deger;
    baglar[a.anahtar] = { tablo: tabloAdi, sutun: ad, basvuru: degerBasvurusuYaz(tabloAdi, ad) };
  }
  if (!sutunlar.length) return null;
  return { tabloAdi, satirAdi: adTemizle(g.baslik || 'Hızlı test') || 'Hızlı test', sutunlar, satir, baglar };
}
