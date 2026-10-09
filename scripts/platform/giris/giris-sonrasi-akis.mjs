// GİRİŞ SONRASI AKIŞ (genel) — giriş tarifinde "Her girişte çalışacak akış": ortamdaki her girişten sonra (ekran açılmadan önce) koşan,
// kullanıcının mevcut akışlarından (genel senaryo) seçtiği akış. Değerleri (akışın istediği alanlar) tarifte durur.
//
//   girisSonrasiAkislari(vt, projeId)       seçilebilecek genel senaryolar ve istedikleri alanlar (arayüz formu)
//   girisSonrasiAdimlari(model)             akış modelini giriş motorunun adımlarına çevirir: senaryo alanı → doldur / seç
//                                           ("{alan}" yer tutucusu; değer tariften), adım aksiyonu → tıkla / git / bekle, başarı
//                                           göstergesi → görünmesini bekle. Ekrana dönüş atlanır (koşu ekranı kendisi açar).
//   girisSonrasiCoz(vt, projeId, tarif)     etkin tarife koşucu için çözülmüş akışı ekler: tarif.girisSonrasi = { dosya, ad, adimlar,
//                                           degerler } (ya da { hata }). Akış her girişte modelden yeniden okunur: akış değişirse giriş de değişir.
// Senaryonun akışında aynı genel senaryo varsa koşucu tariftekini çalıştırmaz (senaryodaki koşar; model-kosucu.ts).
// Motor genel kalır: siteye / ürüne özgü sabit yoktur. NOT: import.meta KULLANILMAZ.
import { ekranlariListele, ekranModeliGetir } from '../veritabani/depo.mjs';

/** @typedef {Record<string, any>} Nesne */
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const METIN_TIPLERI = new Set(['metin', 'sayi', 'telefon', 'tarih', 'eposta', 'para', 'tckn', 'vkn', 'iban', 'parola']);
const SECIM_TIPLERI = new Set(['secim']);
/** Genel senaryo dosya adı (ortakAkis.dosya biçimi). @param {string} anahtar */
export const akisDosyasi = (anahtar) => `${anahtar}.model.json`;

/** @param {Nesne} a */
const etiketi = (a) => String((nesneMi(a.etiket) ? a.etiket.form || a.etiket.ekran : a.etiket) || a.id);
/** Akışın senaryo alanları (adım sırasıyla). @param {Nesne} model @returns {Array<{ anahtar: string; etiket: string; tip: string; secenekler?: Array<{ deger: string; metin: string }> }>} */
function akisAlanlari(model) {
  /** @type {Array<{ anahtar: string; etiket: string; tip: string; secenekler?: Array<{ deger: string; metin: string }> }>} */
  const sonuc = [];
  for (const adim of Array.isArray(model.adimlar) ? model.adimlar : []) {
    for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || a.yapilandirma !== 'senaryo' || !nesneMi(a.eslesme) || typeof a.eslesme.senaryo !== 'string') continue;
        if (sonuc.some((x) => x.anahtar === a.eslesme.senaryo)) continue;
        const secenekler = Array.isArray(a.secenekler) && a.seceneklerDurumu !== 'dinamik'
          ? a.secenekler.filter(nesneMi).map((s) => ({ deger: String(s.deger ?? s.metin ?? ''), metin: String(s.metin ?? s.deger ?? '') })) : [];
        sonuc.push({ anahtar: a.eslesme.senaryo, etiket: etiketi(a), tip: String(a.tip ?? 'metin'), ...(secenekler.length ? { secenekler } : {}) });
      }
    }
  }
  return sonuc;
}

/**
 * Seçilebilecek akışlar: projenin genel senaryoları (ortakAkis türü modeller) ve istedikleri alanlar.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId
 */
export function girisSonrasiAkislari(vt, projeId) {
  /** @type {Array<{ dosya: string; ad: string; alanlar: ReturnType<typeof akisAlanlari> }>} */
  const sonuc = [];
  for (const e of ekranlariListele(vt, projeId)) {
    const m = ekranModeliGetir(vt, e.id);
    if (!m || !nesneMi(m.model) || m.model.tur !== 'ortakAkis') continue;
    sonuc.push({ dosya: akisDosyasi(e.anahtar), ad: e.ad, alanlar: akisAlanlari(m.model) });
  }
  return sonuc;
}

/**
 * Akış modelini giriş motorunun adımlarına çevirir. Çevrilemeyen bir şey varsa (iç içe genel senaryo, desteklenmeyen alan / aksiyon) hata.
 * @param {Nesne} model @returns {{ adimlar: Nesne[]; hatalar: string[] }}
 */
export function girisSonrasiAdimlari(model) {
  /** @type {Nesne[]} */
  const adimlar = [];
  /** @type {string[]} */
  const hatalar = [];
  const hedef = (/** @type {unknown} */ secici, /** @type {unknown} */ metin) => ({ secici: String(secici), ...(typeof metin === 'string' && metin ? { metin } : {}) });
  for (const adim of Array.isArray(model.adimlar) ? model.adimlar : []) {
    if (!nesneMi(adim)) continue;
    const ad = String(adim.baslik || adim.id);
    if (nesneMi(adim.ortakAkis)) { hatalar.push(`"${ad}": iç içe genel senaryo giriş sonrası akışta desteklenmez.`); continue; }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    const sure = Number.isInteger(kosu.zamanAsimiSn) && kosu.zamanAsimiSn > 0 ? Math.min(kosu.zamanAsimiSn, 600) : 30;
    // 1) Alanlar (senaryo alanı): değer tariften ("{senaryo anahtarı}").
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || a.yapilandirma !== 'senaryo' || !nesneMi(a.eslesme) || typeof a.eslesme.senaryo !== 'string') continue;
        const secici = nesneMi(a.konum) ? a.konum.secici : null;
        if (typeof secici !== 'string' || !secici) { hatalar.push(`"${etiketi(a)}": alanın seçicisi yok.`); continue; }
        const deger = `{${a.eslesme.senaryo}}`;
        const aciklama = etiketi(a);
        if (SECIM_TIPLERI.has(a.tip)) adimlar.push({ islem: 'sec', hedef: hedef(secici), deger, zamanAsimiSn: sure, aciklama });
        else if (a.tip === 'radyo') adimlar.push({ islem: 'tikla', hedef: hedef(`${secici}[value="${deger}"]`), zamanAsimiSn: sure, aciklama });
        else if (METIN_TIPLERI.has(a.tip) || !a.tip) adimlar.push({ islem: 'doldur', hedef: hedef(secici), deger, zamanAsimiSn: sure, aciklama });
        else hatalar.push(`"${aciklama}": ${String(a.tip)} türündeki alan giriş sonrası akışta desteklenmez.`);
      }
    }
    // 2) Adımın aksiyonları (düğme / bağlantı / bekleme).
    for (const x of Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : []) {
      if (!nesneMi(x)) continue;
      const aciklama = typeof x.aciklama === 'string' ? x.aciklama : undefined;
      if (x.tur === 'tikla' && typeof x.secici === 'string') adimlar.push({ islem: 'tikla', hedef: hedef(x.secici, x.metin), zamanAsimiSn: sure, ...(aciklama ? { aciklama } : {}) });
      else if (x.tur === 'git' && typeof x.adres === 'string') adimlar.push({ islem: 'git', adres: x.adres, ...(aciklama ? { aciklama } : {}) });
      else if (x.tur === 'bekle' && typeof x.secici === 'string' && x.durum !== 'gizli' && x.durum !== 'yok') adimlar.push({ islem: 'gorunurBekle', hedef: hedef(x.secici), zamanAsimiSn: sure, ...(aciklama ? { aciklama } : {}) });
      else if (x.tur === 'bekle' && Number.isFinite(Number(x.saniye))) adimlar.push({ islem: 'bekle', saniye: Math.max(1, Math.min(300, Math.round(Number(x.saniye)))) });
      // "Pencere kapanır" gibi kaybolmayı bekleme ve ekrana dönüş: sonraki adımın göstergesi beklenir / koşu ekranı kendisi açar.
      else if (x.tur === 'bekle' || x.tur === 'ekranaDon') continue;
      else hatalar.push(`"${ad}": "${String(x.tur)}" aksiyonu giriş sonrası akışta desteklenmez.`);
    }
    // 3) Adımın başarı göstergesi: görünmesi beklenir.
    const g = nesneMi(kosu.basariGostergesi) ? kosu.basariGostergesi : null;
    if (g && g.tur === 'eleman' && typeof g.deger === 'string') adimlar.push({ islem: 'gorunurBekle', hedef: hedef(g.deger), zamanAsimiSn: sure, aciklama: `${ad}: tamamlandı` });
    else if (g && g.tur === 'metin' && typeof g.deger === 'string') adimlar.push({ islem: 'metinBekle', hedef: hedef('body'), metin: g.deger, zamanAsimiSn: sure, aciklama: `${ad}: tamamlandı` });
  }
  if (!adimlar.length && !hatalar.length) hatalar.push('Akışta çalıştırılacak adım yok.');
  return { adimlar, hatalar };
}

/**
 * Etkin tarife (kopya) koşucu için çözülmüş giriş sonrası akışı ekler. Akış bulunamazsa / çevrilemezse { hata } (koşucu girişten sonra
 * açık hatayla durur). @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {Nesne | null} tarif
 */
export function girisSonrasiCoz(vt, projeId, tarif) {
  if (!tarif || !nesneMi(tarif.girisSonrasiAkis)) return tarif;
  const { dosya, degerler } = tarif.girisSonrasiAkis;
  const anahtar = String(dosya).replace(/\.model\.json$/, '');
  const e = ekranlariListele(vt, projeId).find((x) => x.anahtar === anahtar);
  const m = e ? ekranModeliGetir(vt, e.id) : undefined;
  if (!e || !m || !nesneMi(m.model)) return { ...tarif, girisSonrasi: { dosya, ad: anahtar, adimlar: [], degerler: {}, hata: `"${anahtar}" akışı projede yok (Ayarlar > Giriş tarifi > Her girişte çalışacak akış).` } };
  const { adimlar, hatalar } = girisSonrasiAdimlari(/** @type {Nesne} */ (m.model));
  return {
    ...tarif,
    girisSonrasi: { dosya, ad: e.ad, adimlar, degerler: nesneMi(degerler) ? degerler : {}, ...(hatalar.length ? { hata: `"${e.ad}" akışı girişten sonra çalıştırılamıyor: ${hatalar.join(' ')}` } : {}) }
  };
}
