// GÖSTERİM MASKESİ: sonuç ve servis sonucu uçlarının arayüze döndürdüğü hata metinleri SUNUCUDA, HTML rapordaki kurallarla
// maskelenir (html-rapor.mjs > raporMaskeleyici): bilinen gizli değerler (giriş profillerinin kullanıcı adı / parola / TOTP /
// gizli ek alanları, test verisi tablolarının gizli sütunları), adı gizli alanlar (Ayarlar > Güvenlik > Maskeleme ek adlarıyla),
// uzun rakam dizileri, e-posta, adreslerdeki sorgu dizesi. SAKLANAN veri değişmez; yalnız gösterim maskelenir.
// Maskeleyici istek başına bir kez kurulur (gosterimMaskesi) ve o isteğin tüm metinlerinde kullanılır.
// Kapsanan uçlar (sunucu-platform.mjs): /platform/sonuclar/kosu, /sonuc, /kaliplar, /platform/senaryo/son-sonuc,
// /platform/servis-sonuclari (+ /kosu, /senaryo), canlı panel koşu sonucu (platformKosuSonucu) ve çıktı hata özeti.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { adMaskeleyici, bilinenGizliDegerler, raporMaskeleyici } from './html-rapor.mjs';
import { beklenenGorulenCikar } from './siniflandirma.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * metin: hata / kontrol / mesaj metinleri (tam kurallar); ad: başlık ve adım adları, istek / yanıt gövdeleri (yalnız bilinen gizli değerler).
 * @typedef {{ metin: (m: unknown) => string; ad: (m: unknown) => string }} GosterimMaskesi
 */

/** @param {Veritabani} vt @param {string | null | undefined} projeId @returns {GosterimMaskesi} */
export function gosterimMaskesi(vt, projeId) {
  let gizliDegerler = /** @type {string[]} */ ([]);
  try { gizliDegerler = projeId ? bilinenGizliDegerler(vt, projeId) : []; } catch { gizliDegerler = []; }
  let ekAdlar = /** @type {string[]} */ ([]);
  try { ekAdlar = [...ekGizliAdlar(vt)]; } catch { ekAdlar = []; }
  return { metin: raporMaskeleyici({ adres: true, gizliDegerler, ekAdlar }, null), ad: adMaskeleyici(gizliDegerler) };
}

/** @param {(m: unknown) => string} f @param {unknown} d */
const secimli = (f, d) => (d === null || d === undefined || d === '' ? d : f(d));

/**
 * Veri koşusu bilgisi (hangi tablo satırıyla koştu): satır / koşu adı ve açık sütun değerlerinde bilinen gizli değerler maskelenir
 * (gizli sütunların değeri zaten hiç saklanmaz). @param {any} v @param {GosterimMaskesi} m
 */
const veriKosusunuMaskele = (v, m) => (v && typeof v === 'object' ? {
  ...v, ad: secimli(m.ad, v.ad),
  satirlar: Array.isArray(v.satirlar) ? v.satirlar.map((/** @type {Record<string, any>} */ s) => ({
    ...s, satirAdi: m.ad(s.satirAdi),
    degerler: Object.fromEntries(Object.entries(s.degerler ?? {}).map(([a, d]) => [a, secimli(m.ad, d)]))
  })) : []
} : v);

/**
 * sonucDetayi çıktısı (test ayrıntısı, sağ panel, "Başarısız testler" kartı).
 * @template {Record<string, any>} T @param {T} s @param {GosterimMaskesi} m @returns {T}
 */
export function sonucDetayiniMaskele(s, m) {
  if (!s) return s;
  const hata = secimli(m.metin, s.hataMesaji);
  return {
    ...s,
    senaryoBaslik: m.ad(s.senaryoBaslik), hataMesaji: hata, hataKalibi: secimli(m.metin, s.hataKalibi),
    beklenenGorulen: typeof hata === 'string' && hata ? beklenenGorulenCikar(hata) : null,
    beklenenSonuc: secimli(m.ad, s.beklenenSonuc),
    adimlar: Array.isArray(s.adimlar) ? s.adimlar.map((a) => ({ ...a, ad: m.ad(a.ad), hataMesaji: secimli(m.metin, a.hataMesaji) })) : s.adimlar,
    atlananAlanlar: Array.isArray(s.atlananAlanlar) ? s.atlananAlanlar.map((a) => ({ ...a, ...(a.neden ? { neden: m.metin(a.neden) } : {}) })) : s.atlananAlanlar,
    yakalananMesajlar: Array.isArray(s.yakalananMesajlar)
      ? s.yakalananMesajlar.map((y) => ({ ...y, metin: m.metin(y.metin), kalip: m.metin(y.kalip), adim: secimli(m.ad, y.adim) })) : s.yakalananMesajlar,
    ...(s.veriKosusu !== undefined ? { veriKosusu: veriKosusunuMaskele(s.veriKosusu, m) } : {})
  };
}

/** kosuDetayi çıktısı (koşu ayrıntısı; hata kalıbı sütunu). @template {Record<string, any>} T @param {T} d @param {GosterimMaskesi} m @returns {T} */
export function kosuDetayiniMaskele(d, m) {
  if (!d) return d;
  return { ...d, sonuclar: d.sonuclar.map((/** @type {Record<string, any>} */ x) => ({ ...x, senaryoBaslik: m.ad(x.senaryoBaslik), hataKalibi: secimli(m.metin, x.hataKalibi),
    ...(x.veriKosusu !== undefined ? { veriKosusu: veriKosusunuMaskele(x.veriKosusu, m) } : {}) })) };
}

/** hataKaliplari çıktısı (Sonuçlar > Hata kalıpları, iki görünüm). @template {Record<string, any>} T @param {T} v @param {GosterimMaskesi} m @returns {T} */
export function hataKaliplariniMaskele(v, m) {
  const adim = (/** @type {Record<string, any>} */ x) => ({ ...x, senaryoBaslik: m.ad(x.senaryoBaslik), adim: secimli(m.ad, x.adim) });
  return {
    ...v,
    kaliplar: v.kaliplar.map((/** @type {Record<string, any>} */ k) => ({ ...k, kalip: m.metin(k.kalip), sonuclar: (k.sonuclar ?? []).map(adim) })),
    ...(v.yakalanan ? {
      yakalanan: {
        ...v.yakalanan,
        kaliplar: v.yakalanan.kaliplar.map((/** @type {Record<string, any>} */ k) => ({
          ...k, kalip: m.metin(k.kalip), ornekMetin: m.metin(k.ornekMetin), sonuclar: (k.sonuclar ?? []).map(adim)
        }))
      }
    } : {})
  };
}

/** Kontrol ağacı (ad, açıklama). @param {unknown} liste @param {GosterimMaskesi} m @returns {unknown} */
function kontrolleriMaskele(liste, m) {
  if (!Array.isArray(liste)) return liste;
  return liste.map((k) => (k && typeof k === 'object' ? {
    ...k, ...(typeof k.ad === 'string' ? { ad: m.ad(k.ad) } : {}), ...(typeof k.aciklama === 'string' ? { aciklama: m.metin(k.aciklama) } : {}),
    ...(Array.isArray(k.alt) ? { alt: kontrolleriMaskele(k.alt, m) } : {})
  } : k));
}

/**
 * Servis sonuçları uçları (servis-sonuclari.mjs > SERVIS_SONUC_UCLARI) — yol'a göre.
 * @param {string} yol @param {Record<string, any>} v @param {GosterimMaskesi} m @returns {Record<string, any>}
 */
export function servisSonucunuMaskele(yol, v, m) {
  if (yol === '/platform/servis-sonuclari') {
    const ornek = (/** @type {Record<string, any>} */ x) => ({ ...x, baslik: m.ad(x.baslik) });
    return {
      ...v,
      kaliplar: (v.kaliplar ?? []).map((/** @type {Record<string, any>} */ k) => ({ ...k, kalip: m.metin(k.kalip), ornekler: (k.ornekler ?? []).map(ornek) })),
      ...(v.yakalananMesajlar ? {
        yakalananMesajlar: {
          ...v.yakalananMesajlar,
          kaliplar: (v.yakalananMesajlar.kaliplar ?? []).map((/** @type {Record<string, any>} */ k) => ({
            ...k, kalip: m.metin(k.kalip), ornekMetin: m.metin(k.ornekMetin), ornekler: (k.ornekler ?? []).map(ornek)
          }))
        }
      } : {})
    };
  }
  if (yol === '/platform/servis-sonuclari/kosu') {
    return {
      ...v,
      kosu: v.kosu ? { ...v.kosu, ...(typeof v.kosu.ozet === 'string' ? { ozet: m.metin(v.kosu.ozet) } : {}) } : v.kosu,
      senaryolar: (v.senaryolar ?? []).map((/** @type {Record<string, any>} */ x) => ({ ...x, baslik: m.ad(x.baslik), hata: secimli(m.metin, x.hata) })),
      adimlar: (v.adimlar ?? []).map((/** @type {Record<string, any>} */ a) => ({ ...a, hata: secimli(m.metin, a.hata) }))
    };
  }
  if (yol === '/platform/servis-sonuclari/senaryo' && v.sonuc) {
    const s = v.sonuc;
    return {
      ...v,
      sonuc: {
        ...s, baslik: m.ad(s.baslik), hata: secimli(m.metin, s.hata), ozet: secimli(m.metin, s.ozet), adres: secimli(m.metin, s.adres),
        kontroller: kontrolleriMaskele(s.kontroller, m),
        // Gövdeler: adı gizli alanlar kayıtta ve okurken zaten maskeli; burada bilinen gizli değerler de (gövde yapısı bozulmaz).
        istek: secimli(m.ad, s.istek), yanit: secimli(m.ad, s.yanit),
        istekBasliklari: s.istekBasliklari && typeof s.istekBasliklari === 'object'
          ? Object.fromEntries(Object.entries(s.istekBasliklari).map(([a, d]) => [a, m.ad(d)])) : s.istekBasliklari,
        okunanlar: s.okunanlar && typeof s.okunanlar === 'object'
          ? Object.fromEntries(Object.entries(s.okunanlar).map(([a, d]) => [a, m.ad(d)])) : s.okunanlar
      }
    };
  }
  return v;
}
