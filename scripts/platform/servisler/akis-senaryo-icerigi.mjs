// AKIŞ SENARYOSU İÇERİĞİ (saf; ORTAK: sunucu ve arayüz — /arayuz/akis-senaryo-icerigi.mjs olarak sunulur, yalnız bu dosyadaki
// yardımcıları kullanır, HİÇBİR modül içe aktarmaz).
//
// Servis akışının OPERASYON adımı (tur 'operasyon'): { id, ad, tur: 'operasyon', servisId, operasyon, okumalar, baglar?, hataOlursaDevam? }
//   baglar: { "<alan yolu>": "${akis:Ad}" } — operasyonun o alanı önceki adımda okunan değerle dolar (ör. GetInvoice "Input/OrderNo" ←
//   ${akis:OrderNo}). Alan yolu SOAP'ta şema yolu ("Input/OrderNo"), REST'te JSON gövdesindeki yol ("order/no"). Akış yalnız SIRAYI
//   ve TAŞINAN değerleri tanımlar; alan DEĞERLERİ senaryodadır.
// AKIŞ SENARYOSU (servis senaryosu içeriği, tur 'akis'): { tur: 'akis', akisId, adimlar: { "<adımId>": AdimIcerigi }, aciklama? }
//   AdimIcerigi = tek istekli senaryonun içeriği (operasyon, govde, kontroller, basliklar?, http?, tabloSecimleri? …): o operasyon
//   adımının alan değerleri (gövde) ve beklenen sonucu (kontroller). Akıştan gelen alanlar gövdede ${akis:Ad} olarak durur (koşuda
//   bağlar yeniden uygulanır). Adımın içeriği yoksa koşu operasyonun varsayılan gövdesini kullanır.
// NOT: import.meta KULLANILMAZ.

export const AKIS_SENARYOSU = 'akis';
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const ADIM_KIMLIGI = /^[A-Za-z0-9_-]{1,40}$/;
const AKIS_ADI = /^[A-Za-z_][A-Za-z0-9_-]{0,59}$/;
/** Bağ değeri: tek bir ${akis:Ad}. */
const BAG_DEGERI = /^\$\{\s*akis:([A-Za-z_][A-Za-z0-9_-]{0,59})\s*\}$/;
export const EN_COK_BAG = 50;

/** Hata sınıfı verilmezse Error. @param {string} m @param {new (m: string) => Error} [Hata] */
const hata = (m, Hata = Error) => new Hata(m);

/** İçerik bir akış senaryosu mu? @param {unknown} icerik */
export const akisSenaryosuMu = (icerik) => Boolean(icerik && typeof icerik === 'object' && /** @type {any} */ (icerik).tur === AKIS_SENARYOSU);

/** Bağ değerindeki akış değeri adı (geçersizse null). @param {unknown} v */
export function bagAdi(v) {
  const m = typeof v === 'string' ? BAG_DEGERI.exec(v.trim()) : null;
  return m ? m[1] : null;
}

/**
 * Operasyon adımının bağları: { yol: "${akis:Ad}" } (en çok 50; yol "/" ile ayrılmış adlar).
 * @param {unknown} v @param {string} yer @param {new (m: string) => Error} [Hata] @returns {Record<string, string>}
 */
export function baglariDogrula(v, yer, Hata) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw hata(`${yer}: "baglar" bir nesne olmalıdır.`, Hata);
  const g = Object.entries(/** @type {Record<string, unknown>} */ (v));
  if (g.length > EN_COK_BAG) throw hata(`${yer}: en çok ${EN_COK_BAG} bağ olabilir.`, Hata);
  /** @type {Record<string, string>} */
  const sonuc = {};
  for (const [yol, deger] of g) {
    const y = yol.trim();
    if (!y || y.length > 400 || /[\s<>{}$]/.test(y) || y.split('/').some((p) => !p)) throw hata(`${yer}: bağın alan yolu geçersiz ("${yol}").`, Hata);
    const ad = bagAdi(deger);
    if (!ad) throw hata(`${yer}: "${y}" alanının bağı \${akis:Ad} biçiminde olmalıdır.`, Hata);
    sonuc[y] = `\${akis:${ad}}`;
  }
  return sonuc;
}

/**
 * Akış senaryosu içeriğinin yapısal doğrulaması. Her adımın içeriği tek istekli senaryo içeriği gibi doğrulanır (adimDogrula).
 * @param {unknown} ham @param {(icerik: unknown) => any} adimDogrula @param {new (m: string) => Error} [Hata]
 * @returns {{ tur: 'akis'; akisId: string; adimlar: Record<string, any>; aciklama?: string }}
 */
export function akisSenaryoIceriginiDogrula(ham, adimDogrula, Hata) {
  const i = /** @type {Record<string, unknown>} */ (ham && typeof ham === 'object' ? ham : {});
  if (typeof i.akisId !== 'string' || !KIMLIK.test(i.akisId)) throw hata('Akış senaryosunun akışını seçin ("akisId").', Hata);
  const adimlar = i.adimlar === undefined ? {} : i.adimlar;
  if (!adimlar || typeof adimlar !== 'object' || Array.isArray(adimlar)) throw hata('"adimlar" bir nesne olmalıdır (adım kimliği → içerik).', Hata);
  const g = Object.entries(/** @type {Record<string, unknown>} */ (adimlar));
  if (g.length > 30) throw hata('Akış senaryosunda en çok 30 adım olabilir.', Hata);
  /** @type {Record<string, any>} */
  const temiz = {};
  for (const [id, a] of g) {
    if (!ADIM_KIMLIGI.test(id)) throw hata(`Adım kimliği geçersiz ("${id}").`, Hata);
    try { temiz[id] = adimDogrula(a); } catch (e) { throw hata(`"${id}" adımı: ${/** @type {Error} */ (e).message}`, Hata); }
  }
  return {
    tur: AKIS_SENARYOSU, akisId: i.akisId, adimlar: temiz,
    ...(typeof i.aciklama === 'string' && i.aciklama.trim() ? { aciklama: i.aciklama.trim().slice(0, 2000) } : {})
  };
}

/**
 * Akışın operasyon adımları ve her birinin AKIŞTAN gelen (kilitli) alanları: bağın değeri hangi önceki adımda okunuyor.
 * @param {{ adimlar: any[] }} icerik akış içeriği
 * @returns {Array<{ id: string; no: number; ad: string; servisId: string; operasyon: string; kilitli: Array<{ yol: string; ad: string; ureten: number | null }> }>}
 */
export function operasyonAdimlari(icerik) {
  /** @type {Map<string, number>} */
  const ureten = new Map();
  const sonuc = [];
  for (const [n, a] of (icerik.adimlar ?? []).entries()) {
    if (a.tur === 'operasyon') {
      sonuc.push({
        id: String(a.id), no: n + 1, ad: String(a.ad ?? ''), servisId: String(a.servisId), operasyon: String(a.operasyon),
        kilitli: Object.entries(a.baglar ?? {}).map(([yol, v]) => { const ad = bagAdi(v) ?? ''; return { yol, ad, ureten: ureten.has(ad) ? /** @type {number} */ (ureten.get(ad)) : null }; })
      });
    }
    const okunan = a.tur === 'sql' ? (a.sql?.okumalar ?? []) : (a.okumalar ?? []);
    for (const o of okunan) if (o && typeof o.ad === 'string' && AKIS_ADI.test(o.ad) && !ureten.has(o.ad)) ureten.set(o.ad, n + 1);
  }
  return sonuc;
}

/**
 * Akıştan gelen (kilitli) alanın başvurusu gövdede yerinde mi: SOAP'ta şema varsa alanın değeri tam ${akis:Ad}; REST'te JSON
 * gövdesindeki yolun değeri; şema yoksa (ya da REST gövdesi JSON değilse) başvurunun metinde geçmesi yeter.
 * @param {string} govde @param {{ yol: string; ad: string }} k
 * @param {{ rest: boolean; sema?: any; govdeCoz?: (g: string, s: any) => { degerler: Record<string, any> } }} s
 */
export function kilitliBasvuruYerinde(govde, k, s) {
  const metin = String(govde ?? '');
  if (!s.rest && s.sema && s.govdeCoz) {
    const v = s.govdeCoz(metin, s.sema).degerler[k.yol];
    return Boolean(v && v.kaynak === 'akis' && v.deger === k.ad);
  }
  if (s.rest) {
    /** @type {any} */
    let o;
    try { o = JSON.parse(metin); } catch { return metin.includes(`\${akis:${k.ad}}`); }
    for (const p of k.yol.split('/')) {
      if (o === null || typeof o !== 'object') return false;
      o = o[p];
    }
    return bagAdi(o) === k.ad;
  }
  return metin.includes(`\${akis:${k.ad}}`);
}

/** JSON gövdesinde "a/b/0/c" yoluna değer yazar (ara nesneler oluşturulur). @param {string} govde @param {string} yol @param {string} deger */
function jsonaYaz(govde, yol, deger) {
  let kok;
  try { kok = govde.trim() ? JSON.parse(govde) : {}; } catch { throw new Error(`gövde JSON değil; "${yol}" alanına bağ uygulanamadı`); }
  if (!kok || typeof kok !== 'object') throw new Error(`gövde bir JSON nesnesi değil; "${yol}" alanına bağ uygulanamadı`);
  const parcalar = yol.split('/');
  let o = kok;
  for (const p of parcalar.slice(0, -1)) {
    if (o[p] === undefined || o[p] === null || typeof o[p] !== 'object') o[p] = /^\d+$/.test(p) ? [] : {};
    o = o[p];
  }
  o[/** @type {string} */ (parcalar[parcalar.length - 1])] = deger;
  return JSON.stringify(kok, null, 2);
}

/**
 * Bağları adım içeriğine uygular: SOAP'ta şema varsa gövde çözülüp ilgili alanlar ${akis:Ad} yapılır ve gövde yeniden üretilir
 * (govdeCoz / govdeUret verilir; alan zaten o değerdeyse gövdeye dokunulmaz); REST'te JSON gövdeye yazılır.
 * @param {any} icerik @param {Record<string, string>} baglar
 * @param {{ rest: boolean; sema?: any; soapSurumu?: '1.1' | '1.2'; govdeCoz?: (g: string, s: any) => { degerler: Record<string, any>; uyumsuz: string[] };
 *   govdeUret?: (s: any, d: Record<string, any>, o?: any) => string }} s
 */
export function baglariUygula(icerik, baglar, s) {
  const liste = Object.entries(baglar ?? {});
  if (!liste.length) return icerik;
  if (s.rest) {
    let govde = String(icerik.govde ?? '');
    for (const [yol, v] of liste) govde = jsonaYaz(govde, yol, v);
    return { ...icerik, govde };
  }
  if (!s.sema || !s.govdeCoz || !s.govdeUret) {
    // Şema yok: gövdede bağın değeri zaten yazılı olmalı.
    const eksik = liste.filter(([, v]) => !String(icerik.govde ?? '').includes(v));
    if (eksik.length) throw new Error(`operasyonun alan listesi yok; ${eksik.map(([y]) => y).join(', ')} alanına bağ uygulanamadı (gövdede ${eksik[0][1]} yazın)`);
    return icerik;
  }
  const c = s.govdeCoz(String(icerik.govde ?? ''), s.sema);
  let degisti = false;
  for (const [yol, v] of liste) {
    const ad = bagAdi(v);
    const mevcut = c.degerler[yol];
    if (!(yol in c.degerler)) throw new Error(`"${yol}" alanı operasyonun şemasında yok`);
    if (!(mevcut && mevcut.kaynak === 'akis' && mevcut.deger === ad)) { c.degerler[yol] = { kaynak: 'akis', deger: ad }; degisti = true; }
  }
  if (!degisti) return icerik;
  if (c.uyumsuz.length && String(icerik.govde ?? '').trim()) throw new Error(`gövde alan formunda temsil edilemiyor (${c.uyumsuz[0]}); bağ uygulanamadı`);
  return { ...icerik, govde: s.govdeUret(s.sema, c.degerler, { soapSurumu: s.soapSurumu }) };
}
