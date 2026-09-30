// HIZLI TEST → TEST VERİSİ TABLOLARI (saf kurallar). Kullanıcının veri durağında ELLE yazdığı değerler kaydederken test verisi
// tablolarına dönüşür; tek büyük tablo DEĞİL, anlamlı gruplar halinde:
//   · kişi alanları (kimlik no, doğum tarihi, telefon, ad, soyad…)  → "Kişi bilgileri" (sütun adı: kişi alanı türü, ör. "Doğum tarihi"),
//   · kart alanları (kart no, güvenlik kodu, kart üzerindeki isim…)  → "Kart bilgileri" (sütun adı: ekrandaki alan başlığı),
//   · diğer her alan                                                → KENDİ tablosu; tablo ve sütun adı ekrandaki alan başlığı (ör. "GİDİLECEK ÜLKE").
// Tablolar ekranlar arasında ortaktır: aynı adlı tablo varsa sütunlar birleşir, satır (senaryo adıyla) eklenir / güncellenir.
// Değer ÜRETİLMEZ: yalnız kullanıcının yazdığı değerler taşınır; parola / dosya alanları ve boş değerler girmez; seçim alanında
// tabloya seçeneğin görünen metni yazılır. Gizli adlı sütunlar (kart no, güvenlik kodu…) gizli olur.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { degerBasvurusuYaz } from '../tablolar/tablo-secimi.mjs';
import { kisiKategorisi } from '../tablolar/kisi-baglama.mjs';
import { baslikNormal } from '../tablolar/tablo-benzerligi.mjs';

const EN_COK_AD = 60;
export const KISI_TABLOSU = 'Kişi bilgileri';
export const KART_TABLOSU = 'Kart bilgileri';
/** Kart alanı desenleri (normal ad üzerinde). */
const KART_DESENI = /(kart|cvv|cvc|guvenlikkodu|sonkullanma|gecerlilik)/;

/** Tablo / sütun adında kullanılamayan karakterler: . [ ] { } $ < > & | (tablo-deposu.mjs). @param {unknown} m @param {number} [en] */
export function adTemizle(m, en = EN_COK_AD) {
  return String(m ?? '').replace(/[.[\]{}$<>&|]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s:*：]+$/u, '').replace(/^[\s*]+/, '').trim().slice(0, en).trim();
}

/** @param {Record<string, any>} a @returns {string} alanın ekrandaki başlığı (yoksa teknik adı) */
const alanBasligi = (a) => String(a.etiket ?? a.ad ?? a.kimlik ?? a.anahtar ?? '');

/**
 * Alanın tablosu ve sütunu.
 * @param {Record<string, any>} a @returns {{ tablo: string; sutun: string }}
 */
export function alanGrubu(a) {
  const baslik = alanBasligi(a);
  const n = baslikNormal(baslik);
  const temiz = adTemizle(baslik);
  if (KART_DESENI.test(n)) return { tablo: KART_TABLOSU, sutun: temiz || 'Alan' };
  const tip = a.tur === 'date' ? 'tarih' : a.tur === 'tel' ? 'telefon' : 'metin';
  const kisi = kisiKategorisi({ etiket: baslik, anahtar: a.ad ?? undefined, id: a.kimlik ?? undefined, tip });
  if (kisi) return { tablo: KISI_TABLOSU, sutun: kisi.ad };
  return { tablo: temiz || 'Alan', sutun: temiz || 'Alan' };
}

/**
 * Seçim / radyo alanında değerin görünen metni (yoksa değerin kendisi) ve sayfadaki seçenek değeri (kod). Tabloya okunur metin yazılır;
 * metin koddan farklıysa sütuna "metin → kod" sayfa karşılığı eklenir (koşu ve koşullar seçeneği koddan tanır).
 * @param {Record<string, any>} a @param {string} deger @returns {{ metin: string; kod: string }}
 */
function okunurDeger(a, deger) {
  const liste = a.tur === 'radio' ? (Array.isArray(a.radyolar) ? a.radyolar : []) : (Array.isArray(a.secenekler) ? a.secenekler : []);
  const s = liste.find((x) => String(x.deger) === deger);
  return { metin: s && typeof s.metin === 'string' && s.metin.trim() ? s.metin.trim() : deger, kod: deger };
}

/**
 * @param {{ baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }> }} g
 * @returns {{ satirAdi: string; tablolar: Array<{ tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
 *   karsiliklar: Record<string, Record<string, string>>;
 *   baglar: Record<string, { tablo: string; sutun: string; basvuru: string }> }> } | null} taşınacak değer yoksa null
 */
export function tabloTaslagiKur(g) {
  /** @type {Map<string, { tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>; karsiliklar: Record<string, Record<string, string>>; baglar: Record<string, { tablo: string; sutun: string; basvuru: string }> }>} */
  const tablolar = new Map();
  for (const a of g.alanlar) {
    const v = g.degerler[a.anahtar];
    if (!v || v.kaynak === 'tablo' || typeof v.deger !== 'string' || !v.deger.trim()) continue;
    if (['password', 'file'].includes(String(a.tur))) continue;
    const { tablo, sutun } = alanGrubu(a);
    const anahtar = tablo.toLocaleLowerCase('tr');
    let t = tablolar.get(anahtar);
    if (!t) { t = { tabloAdi: tablo, sutunlar: [], satir: {}, karsiliklar: {}, baglar: {} }; tablolar.set(anahtar, t); }
    let ad = sutun;
    for (let i = 2; t.sutunlar.some((x) => x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')); i++) ad = `${adTemizle(sutun, EN_COK_AD - 4)} ${i}`;
    // Kart numarası ve güvenlik kodu gizli sütun olur (değer şifreli saklanır, ekranda maskelenir).
    const kartGizli = tablo === KART_TABLOSU && /(numara|kartno|cvv|cvc|guvenlik)/.test(baslikNormal(ad));
    t.sutunlar.push({ ad, gizli: a.gizli === true || kartGizli || gizliAdMi(ad) });
    const ok = okunurDeger(a, v.deger);
    t.satir[ad] = ok.metin;
    if (ok.metin !== ok.kod && !t.sutunlar[t.sutunlar.length - 1].gizli) (t.karsiliklar[ad] ??= {})[ok.metin] = ok.kod;
    t.baglar[a.anahtar] = { tablo: t.tabloAdi, sutun: ad, basvuru: degerBasvurusuYaz(t.tabloAdi, ad) };
  }
  if (!tablolar.size) return null;
  return { satirAdi: adTemizle(g.baslik || 'Hızlı test') || 'Hızlı test', tablolar: [...tablolar.values()] };
}
