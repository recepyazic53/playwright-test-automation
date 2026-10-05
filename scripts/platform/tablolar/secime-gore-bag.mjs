// SEÇİME GÖRE DEĞİŞEN ALAN BAĞI (saf; sunucu ve arayüz ORTAK: /arayuz/secime-gore-bag.mjs). Ekran alanı bağı (ekran-baglari.mjs)
// isteğe bağlı olarak bir kontrol alanının (radyo / seçim) değerine göre başka bir tablo sütununa gider:
//   { tablo, sutun, etiket?, secimeGore?: { alan: '<kontrol alanı kimliği>', degerler: { '<seçenek değeri>': { tablo, sutun, etiket? } } } }
// Üstteki tablo / sütun VARSAYILANDIR: kontrolün değeri bilinmiyorsa ya da listede yoksa o kullanılır. Bağı okuyan her yer ya
// değere göre çözer (secimeGoreCoz / baglariCoz) ya da tüm olası bağları sayar (olasiBaglar).
// Ayrıca alan etiketini metne çeviren ORTAK yardımcı (etiketMetni): model etiketi nesne olabilir ({ ekran, form, not }).

/** @typedef {{ tablo: string; sutun: string; etiket?: string }} TekBag */
/** @typedef {TekBag & { secimeGore?: { alan: string; degerler: Record<string, TekBag> } }} AlanBagi */

const nesneMi = (/** @type {unknown} */ d) => d !== null && typeof d === 'object' && !Array.isArray(d);

/** Bağın tek (koşulsuz) hâli: { tablo, sutun, etiket? }. @param {any} b @returns {TekBag} */
export const tekBag = (b) => ({ tablo: String(b.tablo), sutun: String(b.sutun), ...(b.etiket ? { etiket: String(b.etiket) } : {}) });

/** Bağ seçime göre değişiyor mu. @param {unknown} b */
export function secimeGoreVar(b) {
  const x = /** @type {any} */ (b);
  return nesneMi(x) && nesneMi(x.secimeGore) && typeof x.secimeGore.alan === 'string' && nesneMi(x.secimeGore.degerler) && Object.keys(x.secimeGore.degerler).length > 0;
}

/**
 * Kontrolün değerine göre geçerli bağ (varsayılan: üstteki tablo / sütun). Değer bilinmiyorsa (undefined / null / '') ya da listede
 * yoksa varsayılan. @param {any} b @param {unknown} deger @returns {TekBag}
 */
export function secimeGoreCoz(b, deger) {
  if (!secimeGoreVar(b) || deger === undefined || deger === null || deger === '') return tekBag(b);
  const v = b.secimeGore.degerler[String(deger)];
  return nesneMi(v) ? tekBag(v) : tekBag(b);
}

/**
 * Bağın tüm olası hâlleri: önce varsayılan (deger: null), sonra her seçenek değeri. Okuyan yerler (kullanım sayımı, uyum denetimi,
 * karşılıklar, birleştirme) bununla her olası bağı ayrı ele alır. @param {any} b
 * @returns {Array<TekBag & { deger: string | null }>}
 */
export function olasiBaglar(b) {
  if (!nesneMi(b)) return [];
  /** @type {Array<TekBag & { deger: string | null }>} */
  const sonuc = [{ ...tekBag(b), deger: null }];
  if (secimeGoreVar(b)) for (const [d, v] of Object.entries(b.secimeGore.degerler)) if (nesneMi(v)) sonuc.push({ ...tekBag(v), deger: d });
  return sonuc;
}

/** Bağın kullandığı tablo kimlikleri (tekrarsız). @param {any} b @returns {string[]} */
export const bagTablolari = (b) => [...new Set(olasiBaglar(b).map((x) => x.tablo))];

/**
 * Bağın her olası hâlini dönüştürür (ör. birleştirmede tablo kimliği / sütun adı); dönüştürücü null dönerse o hâl değişmez.
 * @param {any} b @param {(x: TekBag) => TekBag | null} donustur @returns {{ bag: AlanBagi; degisti: boolean }}
 */
export function bagiDonustur(b, donustur) {
  let degisti = false;
  const tek = (/** @type {any} */ x) => { const y = donustur(tekBag(x)); if (!y) return tekBag(x); degisti = true; return tekBag(y); };
  /** @type {AlanBagi} */
  const bag = { ...b, ...tek(b) };
  if (!b.etiket) delete bag.etiket;
  if (secimeGoreVar(b)) bag.secimeGore = { alan: b.secimeGore.alan, degerler: Object.fromEntries(Object.entries(b.secimeGore.degerler).map(([d, v]) => [d, tek(v)])) };
  return { bag, degisti };
}

/**
 * Bağları senaryonun değerleriyle tek bağlara çözer: seçime göre değişen bağ kontrol alanının değerine göre (degerOku: kontrol alanı
 * kimliği → değer; bilinmiyorsa undefined → varsayılan). @param {Record<string, any>} baglar @param {(alanId: string) => unknown} degerOku
 * @returns {Record<string, TekBag>}
 */
export function baglariCoz(baglar, degerOku) {
  /** @type {Record<string, TekBag>} */
  const sonuc = {};
  for (const [alan, b] of Object.entries(baglar ?? {})) {
    if (!nesneMi(b)) continue;
    sonuc[alan] = secimeGoreVar(b) ? secimeGoreCoz(b, gecerliDeger(degerOku(b.secimeGore.alan))) : tekBag(b);
  }
  return sonuc;
}

/** Kontrol değeri çözüme uygun mu: düz metin (tablo başvurusu ${…} değil); değilse undefined (varsayılan). @param {unknown} v */
const gecerliDeger = (v) => (typeof v === 'string' && v.trim() && !/^\$\{.*\}$/.test(v.trim()) ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined);

/**
 * Özet satırı: "Tip: A → Kişi › TC kimlik no · B → Kurum › Vergi kimlik no". Varsayılan, seçeneklerden en az biri listede yoksa
 * (secenekler verilmişse) ya da hiçbir seçeneğin bağına eşit değilse "diğer → …" olarak eklenir.
 * @param {any} b @param {{ tabloAdi: (id: string) => string; kontrolEtiketi: string; degerMetni?: (deger: string) => string; secenekler?: string[] }} s
 */
export function bagOzeti(b, s) {
  const yaz = (/** @type {TekBag} */ x) => `${s.tabloAdi(x.tablo)}${x.etiket ? ` [${x.etiket}]` : ''} › ${x.sutun}`;
  if (!secimeGoreVar(b)) return yaz(tekBag(b));
  const parcalar = Object.entries(b.secimeGore.degerler).map(([d, v]) => `${s.degerMetni ? s.degerMetni(d) : d} → ${yaz(tekBag(v))}`);
  const v = tekBag(b);
  const ayni = (/** @type {TekBag} */ x) => x.tablo === v.tablo && x.sutun === v.sutun && (x.etiket || '') === (v.etiket || '');
  const eksik = s.secenekler ? s.secenekler.some((d) => !(d in b.secimeGore.degerler)) : !Object.values(b.secimeGore.degerler).some((x) => ayni(tekBag(x)));
  if (eksik) parcalar.push(`diğer → ${yaz(v)}`);
  return `${s.kontrolEtiketi}: ${parcalar.join(' · ')}`;
}

/**
 * Alan etiketini metne çevirir (ORTAK): etiket metin olabilir ya da { ekran, form, not } nesnesi. Sıra: ekran → form → not → alan
 * kimliği (etiketsiz açılır listede ekran etiketi null, not açıklama taşır). "[object Object]" asla dönmez.
 * @param {unknown} etiket @param {unknown} [yedek] etiket yoksa (alan kimliği) @returns {string}
 */
export function etiketMetni(etiket, yedek = '') {
  const metin = (/** @type {unknown} */ x) => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' ? String(x) : '');
  if (nesneMi(etiket)) {
    const e = /** @type {Record<string, unknown>} */ (etiket);
    return metin(e.ekran) || metin(e.form) || metin(e.not) || metin(yedek);
  }
  return metin(etiket) || metin(yedek);
}
