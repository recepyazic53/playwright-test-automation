// SERVİS SÖZLEŞMESİ — yanıt doğrulayıcı. SAF ve BAĞIMLILIKSIZ modül: sunucu ve arayüz ortak kullanır (/arayuz/sozlesme-dogrulayici.mjs).
// Genel motordur: ürün / alan adı içermez; sözleşmenin kendisi kullanıcının servis ayarındadır (kasa).
// - Şema: JSON Schema'nın gereken alt kümesi — type (tek ya da dizi; "null" dahil), required, properties, items, enum, nullable
//   (OpenAPI 3.0), format (date / date-time / email; isteğe bağlı denetim), anyOf / oneOf (en az biri uymalı), allOf (birleştirilir).
//   Bilinmeyen anahtarlar yok sayılır; additionalProperties denetlenmez (fazla alan uyumsuzluk değildir). $ref önceden çözülmüş olmalı.
// - jsonDogrula: JSON değer; yollar "response.items[0].price".
// - xmlDogrula: SOAP / XML yanıt (Envelope > Body > ilk öğe); yollar "/SiparisResponse/Kalemler/Kalem[2]/Fiyat". Yaprak öğe metindir;
//   sayı / tam sayı / evet-hayır sözcük biçiminden denetlenir; xsi:nil="true" null sayılır; tekrarlanan öğe dizidir (tek öğe de dizi olabilir).
// - Uyumsuzluk mesajları DEĞER İÇERMEZ (yalnız beklenen / gelen tür): raporda gizli değer görünmez.
// - taslakCikar: bir ya da birkaç örnek yanıttan şema taslağı (tür, zorunlu = tüm örneklerde var, null görüldüyse null izinli, diziler).
// - semaAlanlari + alan…Ayarla: taslağı alan alan düzenlemek için düz liste ve değiştiriciler (şemanın kopyası üzerinde çalışır).

export const SEMA_TIPLERI = Object.freeze(['string', 'integer', 'number', 'boolean', 'object', 'array']);
export const BICIMLER = Object.freeze(['date', 'date-time', 'email']);
/** Tür adları (mesajlarda ve arayüzde). */
export const TIP_ETIKETLERI = Object.freeze({ string: 'metin', integer: 'tam sayı', number: 'sayı', boolean: 'evet/hayır', object: 'nesne', array: 'dizi', null: 'null', '': 'herhangi' });
const BICIM_ETIKETLERI = Object.freeze({ date: 'tarih (yyyy-MM-dd)', 'date-time': 'tarih-saat (ISO 8601)', email: 'e-posta' });
const EN_DERIN = 40;
const EN_COK_DUGUM = 5000;
const EN_COK_ENUM = 500;

export class SozlesmeHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) { super(mesaj); this.name = 'SozlesmeHatasi'; }
}

/**
 * @typedef {{ type?: string | string[]; properties?: Record<string, Sema>; required?: string[]; items?: Sema; enum?: unknown[]; nullable?: boolean;
 *   format?: string; anyOf?: Sema[] }} Sema
 * @typedef {{ yol: string; mesaj: string }} Uyumsuzluk
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const nesneMi = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------------------
// Şema temizleme (alt küme; allOf birleştirilir)
// ---------------------------------------------------------------------------------------

/**
 * Şemayı desteklenen alt kümeye indirger ve denetler. Hatalı yapı SozlesmeHatasi.
 * @param {unknown} ham @returns {Sema}
 */
export function semaTemizle(ham) {
  let sayac = 0;
  /** @param {unknown} s @param {string} yer @param {number} derinlik @returns {Sema} */
  const temizle = (s, yer, derinlik) => {
    if (++sayac > EN_COK_DUGUM) throw new SozlesmeHatasi(`Şema çok büyük (en çok ${EN_COK_DUGUM} düğüm).`);
    if (derinlik > EN_DERIN) throw new SozlesmeHatasi(`Şema çok derin (${yer}).`);
    if (s === true || s === undefined) return {};
    if (!nesneMi(s)) throw new SozlesmeHatasi(`${yer}: şema bir nesne olmalı.`);
    if (typeof s.$ref === 'string') throw new SozlesmeHatasi(`${yer}: çözülmemiş $ref (${s.$ref}).`);
    const k = Array.isArray(s.allOf) ? allOfBirlestir(s, yer) : s;
    /** @type {Sema} */
    const o = {};
    const tipler = (Array.isArray(k.type) ? k.type : k.type === undefined ? [] : [k.type]).filter((t) => typeof t === 'string');
    const bilinen = [...new Set(tipler.filter((t) => SEMA_TIPLERI.includes(t) || t === 'null'))];
    if (bilinen.length) o.type = bilinen.length === 1 ? bilinen[0] : bilinen;
    if (k.nullable === true) o.nullable = true;
    if (Array.isArray(k.enum) && k.enum.length) o.enum = k.enum.filter((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x)).slice(0, EN_COK_ENUM);
    if (typeof k.format === 'string' && BICIMLER.includes(k.format)) o.format = k.format;
    if (nesneMi(k.properties)) {
      o.properties = {};
      for (const [ad, alt] of Object.entries(k.properties)) o.properties[ad] = temizle(alt, `${yer}.${ad}`, derinlik + 1);
    }
    if (Array.isArray(k.required)) {
      const r = [...new Set(k.required.filter((x) => typeof x === 'string'))];
      if (r.length) o.required = r;
    }
    if (k.items !== undefined && !Array.isArray(k.items)) o.items = temizle(k.items, `${yer}[]`, derinlik + 1);
    else if (Array.isArray(k.items) && k.items.length) o.items = temizle(k.items[0], `${yer}[]`, derinlik + 1);
    const secenekler = Array.isArray(k.anyOf) ? k.anyOf : Array.isArray(k.oneOf) ? k.oneOf : null;
    if (secenekler && secenekler.length) o.anyOf = secenekler.map((x, n) => temizle(x, `${yer}|${n + 1}`, derinlik + 1));
    return o;
  };
  /** @param {Record<string, any>} s @param {string} yer */
  const allOfBirlestir = (s, yer) => {
    const { allOf, ...kalan } = s;
    /** @type {Record<string, any>} */
    const b = { ...kalan, properties: { ...(nesneMi(kalan.properties) ? kalan.properties : {}) }, required: [...(Array.isArray(kalan.required) ? kalan.required : [])] };
    for (const parca of /** @type {unknown[]} */ (allOf)) {
      if (!nesneMi(parca)) continue;
      if (typeof parca.$ref === 'string') throw new SozlesmeHatasi(`${yer}: çözülmemiş $ref (${parca.$ref}).`);
      const p = Array.isArray(parca.allOf) ? allOfBirlestir(parca, yer) : parca;
      if (b.type === undefined && p.type !== undefined) b.type = p.type;
      if (nesneMi(p.properties)) Object.assign(b.properties, p.properties);
      if (Array.isArray(p.required)) b.required.push(...p.required);
      for (const a of ['items', 'enum', 'format', 'nullable']) if (b[a] === undefined && p[a] !== undefined) b[a] = p[a];
    }
    if (!Object.keys(b.properties).length) delete b.properties;
    else b.type ??= 'object';
    if (!b.required.length) delete b.required;
    return b;
  };
  return temizle(ham, 'kök', 0);
}

/** Şemanın (null dışındaki) türleri. @param {Sema | undefined} s @returns {string[]} */
export const semaTipleri = (s) => (s?.type === undefined ? [] : (Array.isArray(s.type) ? s.type : [s.type]).filter((t) => t !== 'null'));
/** Şema null'a izin veriyor mu (type "null", nullable ya da enum'da null). @param {Sema | undefined} s */
export const nullIzinliMi = (s) => Boolean(s && (s.nullable === true || (Array.isArray(s.type) ? s.type.includes('null') : s.type === 'null') || (Array.isArray(s.enum) && s.enum.includes(null))));

// ---------------------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------------------

const TAM_SAYI = /^[+-]?\d+$/;
const SAYI = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MANTIKSAL = /^(?:true|false|1|0)$/;
const TARIH = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TARIH_SAAT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?([Zz]|[+-]([01]\d|2[0-3]):?[0-5]\d)?$/;
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Değerin türünün adı (mesaj için; DEĞER yazılmaz). @param {unknown} v @param {boolean} xml */
function gelenTur(v, xml) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'dizi';
  if (typeof v === 'object') return 'nesne';
  if (typeof v === 'boolean') return 'evet/hayır';
  if (typeof v === 'number') return Number.isInteger(v) ? 'tam sayı' : 'sayı';
  if (typeof v === 'string') {
    if (!v.trim()) return 'boş metin';
    if (xml) return TAM_SAYI.test(v.trim()) ? 'tam sayı' : SAYI.test(v.trim()) ? 'sayı' : 'metin';
    return 'metin';
  }
  return typeof v;
}

/** @param {string} tip @param {unknown} v @param {boolean} xml */
function tipUyar(tip, v, xml) {
  if (xml) {
    const m = typeof v === 'string' ? v.trim() : null;
    switch (tip) {
      case 'string': return typeof v === 'string';
      case 'integer': return m !== null && TAM_SAYI.test(m);
      case 'number': return m !== null && SAYI.test(m);
      case 'boolean': return m !== null && MANTIKSAL.test(m);
      case 'object': return nesneMi(v) || (typeof v === 'string' && !v.trim());
      case 'array': return Array.isArray(v);
      default: return true;
    }
  }
  switch (tip) {
    case 'string': return typeof v === 'string';
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'object': return nesneMi(v);
    case 'array': return Array.isArray(v);
    default: return true;
  }
}

/** @param {string} bicim @param {string} v */
function bicimUyar(bicim, v) {
  if (bicim === 'date') return TARIH.test(v);
  if (bicim === 'date-time') return TARIH_SAAT.test(v);
  if (bicim === 'email') return EPOSTA.test(v);
  return true;
}

/** @param {unknown} a @param {unknown} b @param {boolean} xml */
const enumEsit = (a, b, xml) => (xml && typeof a === 'string' && b !== null ? a.trim() === String(b) : a === b);

/**
 * Ortak yürüyücü. yol biçimi: json ("a.b[0]") ya da xml ("/a/b[1]").
 * @param {Sema} sema @param {unknown} deger @param {string} kokYolu
 * @param {{ xml: boolean; bicimDenetle: boolean; enCok: number }} s
 * @returns {{ uyumsuzluklar: Uyumsuzluk[]; toplam: number }}
 */
function yuru(sema, deger, kokYolu, s) {
  /** @type {Uyumsuzluk[]} */
  const liste = [];
  let toplam = 0;
  const ekle = (/** @type {string} */ yol, /** @type {string} */ mesaj) => { toplam++; if (liste.length < s.enCok) liste.push({ yol, mesaj }); };
  const cocukYolu = (/** @type {string} */ yol, /** @type {string} */ ad) => (s.xml ? `${yol}/${ad}` : /^[\p{L}_$][\p{L}\p{N}_$-]*$/u.test(ad) ? `${yol}.${ad}` : `${yol}[${JSON.stringify(ad)}]`);
  const ogeYolu = (/** @type {string} */ yol, /** @type {number} */ i) => (s.xml ? `${yol}[${i + 1}]` : `${yol}[${i}]`);

  /** Yalnız sayar (anyOf seçeneği denemesi). @param {Sema} sm @param {unknown} v */
  const uyarMi = (sm, v) => yuru(sm, v, '', { ...s, enCok: 0 }).toplam === 0;

  /** @param {Sema} sm @param {unknown} v @param {string} yol @param {number} derinlik */
  const denetle = (sm, v, yol, derinlik) => {
    if (derinlik > EN_DERIN) return;
    const tipler = semaTipleri(sm);
    if (v === null) {
      if (!nullIzinliMi(sm) && (tipler.length || sm.enum || sm.properties || sm.items)) ekle(yol, 'null izinli değil');
      return;
    }
    if (sm.anyOf?.length && !sm.anyOf.some((x) => uyarMi(x, v))) { ekle(yol, 'izinli seçeneklerin hiçbiriyle uyuşmuyor'); return; }
    // XML: tekrarlanabilen öğe tek geldiyse dizi sayılır.
    let d = v;
    if (s.xml && tipler.includes('array') && !Array.isArray(d)) d = [d];
    if (tipler.length && !tipler.some((t) => tipUyar(t, d, s.xml))) {
      ekle(yol, `${tipler.map((t) => /** @type {Record<string, string>} */ (TIP_ETIKETLERI)[t] ?? t).join(' ya da ')} bekleniyordu, ${gelenTur(d, s.xml)} geldi`);
      return;
    }
    if (Array.isArray(sm.enum) && sm.enum.length && !sm.enum.some((e) => enumEsit(d, e, s.xml))) {
      const izinli = sm.enum.slice(0, 10).map((e) => (e === null ? 'null' : String(e))).join(', ');
      ekle(yol, `izinli değerlerden biri değil (izinli: ${izinli}${sm.enum.length > 10 ? ', …' : ''})`);
    }
    if (s.bicimDenetle && sm.format && typeof d === 'string' && d.trim() && !bicimUyar(sm.format, d.trim())) {
      ekle(yol, `${/** @type {Record<string, string>} */ (BICIM_ETIKETLERI)[sm.format] ?? sm.format} biçiminde değil`);
    }
    if (Array.isArray(d)) {
      if (sm.items) d.forEach((x, i) => denetle(/** @type {Sema} */ (sm.items), x, ogeYolu(yol, i), derinlik + 1));
      return;
    }
    const nesne = nesneMi(d) ? d : s.xml && typeof d === 'string' && !d.trim() ? {} : null;
    if (nesne && (sm.properties || sm.required)) {
      for (const ad of sm.required ?? []) if (!Object.hasOwn(nesne, ad)) ekle(cocukYolu(yol, ad), 'zorunlu alan yok');
      for (const [ad, alt] of Object.entries(sm.properties ?? {})) {
        if (Object.hasOwn(nesne, ad)) denetle(alt, nesne[ad], cocukYolu(yol, ad), derinlik + 1);
      }
    }
  };
  denetle(sema, deger, kokYolu, 0);
  return { uyumsuzluklar: liste, toplam };
}

/**
 * JSON değerini şemaya göre doğrular.
 * @param {Sema} sema @param {unknown} deger @param {{ kok?: string; bicimDenetle?: boolean; enCok?: number }} [s]
 */
export function jsonDogrula(sema, deger, s = {}) {
  return yuru(sema, deger, s.kok ?? 'response', { xml: false, bicimDenetle: s.bicimDenetle !== false, enCok: s.enCok ?? 200 });
}

/**
 * JSON metnini doğrular (okunamazsa tek uyumsuzluk).
 * @param {Sema} sema @param {string} metin @param {{ kok?: string; bicimDenetle?: boolean; enCok?: number }} [s]
 */
export function jsonMetniDogrula(sema, metin, s = {}) {
  let v;
  try { v = JSON.parse(metin); } catch { return { uyumsuzluklar: [{ yol: s.kok ?? 'response', mesaj: 'yanıt geçerli JSON değil' }], toplam: 1 }; }
  return jsonDogrula(sema, v, s);
}

// ---------------------------------------------------------------------------------------
// XML (özellikli küçük ayrıştırıcı; ad alanı önekleri atılır)
// ---------------------------------------------------------------------------------------

/** @typedef {{ ad: string; oz: Record<string, string>; cocuklar: XmlDugumu[]; metin: string }} XmlDugumu */

/** @param {string} s */
const varlikCoz = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, v) => {
  if (v[0] === '#') { const n = v[1] === 'x' ? parseInt(v.slice(2), 16) : Number(v.slice(1)); return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[v];
});
/** @param {string} ad */
const yerel = (ad) => ad.slice(ad.indexOf(':') + 1);

/**
 * XML metni → ağaç (öğe adları ve özellik adları yerel ad). Okunamazsa null.
 * @param {string} xml @returns {XmlDugumu | null}
 */
export function xmlAgaciOku(xml) {
  /** @type {XmlDugumu} */
  const kok = { ad: '#kok', oz: {}, cocuklar: [], metin: '' };
  const yigin = [kok];
  const temiz = String(xml).replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '');
  const belirtec = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (const m of temiz.matchAll(belirtec)) {
    const ust = yigin[yigin.length - 1];
    if (m[7] !== undefined) return null;
    if (m[1] !== undefined) ust.metin += m[1];
    else if (m[2] !== undefined) {
      if (yigin.length <= 1 || ust.ad !== yerel(m[2])) return null;
      yigin.pop();
    } else if (m[3] !== undefined) {
      /** @type {Record<string, string>} */
      const oz = {};
      for (const o of (m[4] ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) if (!/^xmlns(:|$)/.test(o[1])) oz[yerel(o[1])] = varlikCoz(o[2] ?? o[3] ?? '');
      /** @type {XmlDugumu} */
      const d = { ad: yerel(m[3]), oz, cocuklar: [], metin: '' };
      ust.cocuklar.push(d);
      if (!m[5]) yigin.push(d);
    } else if (m[6] !== undefined) ust.metin += varlikCoz(m[6]);
  }
  return yigin.length === 1 && kok.cocuklar.length === 1 ? kok.cocuklar[0] : null;
}

/**
 * Öğe → değer: alt öğesi yoksa metin (xsi:nil="true" ise null); varsa nesne (aynı adlı alt öğeler dizi).
 * @param {XmlDugumu} d @returns {unknown}
 */
export function xmlDegeri(d) {
  if (!d.cocuklar.length) return d.oz.nil === 'true' || d.oz.nil === '1' ? null : d.metin;
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const c of d.cocuklar) {
    const v = xmlDegeri(c);
    // Öğe değeri hiçbir zaman dizi değildir: dizi yalnız aynı adlı öğe tekrarlanınca oluşur.
    if (!Object.hasOwn(o, c.ad)) o[c.ad] = v;
    else if (Array.isArray(o[c.ad])) /** @type {unknown[]} */ (o[c.ad]).push(v);
    else o[c.ad] = [o[c.ad], v];
  }
  return o;
}

/**
 * SOAP zarfıysa gövdenin ilk öğesi (Fault ise fault: true); değilse kök öğe.
 * @param {XmlDugumu} kok @returns {{ dugum?: XmlDugumu; fault?: boolean; bos?: boolean }}
 */
export function soapGovdeOgesi(kok) {
  if (kok.ad !== 'Envelope') return { dugum: kok };
  const govde = kok.cocuklar.find((c) => c.ad === 'Body');
  const ilk = govde?.cocuklar[0];
  if (!ilk) return { bos: true };
  if (ilk.ad === 'Fault') return { fault: true, dugum: ilk };
  return { dugum: ilk };
}

/**
 * SOAP / XML yanıtını doğrular. xmlKok: beklenen gövde öğesi (ör. SiparisResponse; verilirse denetlenir).
 * @param {Sema} sema @param {string} xml @param {{ xmlKok?: string; bicimDenetle?: boolean; enCok?: number }} [s]
 */
export function xmlDogrula(sema, xml, s = {}) {
  const kok = xmlAgaciOku(xml);
  if (!kok) return { uyumsuzluklar: [{ yol: '/', mesaj: 'yanıt okunabilir bir XML değil' }], toplam: 1 };
  const g = soapGovdeOgesi(kok);
  if (g.bos) return { uyumsuzluklar: [{ yol: '/Envelope/Body', mesaj: 'yanıt gövdesi boş' }], toplam: 1 };
  if (g.fault) return { uyumsuzluklar: [{ yol: '/Envelope/Body/Fault', mesaj: 'yanıt bir SOAP hatası (Fault); sözleşme doğrulanamadı' }], toplam: 1 };
  const d = /** @type {XmlDugumu} */ (g.dugum);
  if (s.xmlKok && d.ad !== s.xmlKok) return { uyumsuzluklar: [{ yol: `/${d.ad}`, mesaj: `kök öğe ${s.xmlKok} bekleniyordu, ${d.ad} geldi` }], toplam: 1 };
  return yuru(sema, xmlDegeri(d), `/${d.ad}`, { xml: true, bicimDenetle: s.bicimDenetle !== false, enCok: s.enCok ?? 200 });
}

// ---------------------------------------------------------------------------------------
// Taslak çıkarımı (örnek yanıtlardan)
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ tipler: Set<string>; metinler: string[]; ozellikler: Map<string, Gozlem>; gorulme: Map<string, number>; nesneSayisi: number;
 *   oge: Gozlem | null; coklu: boolean }} Gozlem
 *   coklu (XML): öğe en az bir kez tekrarlandı (dizi); tekrarların her biri aynı gözleme işlenir.
 */
/** @returns {Gozlem} */
const yeniGozlem = () => ({ tipler: new Set(), metinler: [], ozellikler: new Map(), gorulme: new Map(), nesneSayisi: 0, oge: null, coklu: false });

/** @param {Gozlem} g @param {unknown} v @param {boolean} xml @param {number} derinlik */
function gozle(g, v, xml, derinlik) {
  if (derinlik > EN_DERIN) return;
  if (v === null || v === undefined) { g.tipler.add('null'); return; }
  if (Array.isArray(v)) {
    // XML'de dizi = aynı öğenin tekrarı: her tekrar aynı alanın bir gözlemidir.
    if (xml) { g.coklu = true; for (const x of v) gozle(g, x, xml, derinlik); return; }
    g.tipler.add('array');
    for (const x of v) gozle((g.oge ??= yeniGozlem()), x, xml, derinlik + 1);
    return;
  }
  if (typeof v === 'object') {
    g.tipler.add('object'); g.nesneSayisi++;
    for (const [k, x] of Object.entries(v)) {
      g.gorulme.set(k, (g.gorulme.get(k) ?? 0) + 1);
      if (!g.ozellikler.has(k)) g.ozellikler.set(k, yeniGozlem());
      gozle(/** @type {Gozlem} */ (g.ozellikler.get(k)), x, xml, derinlik + 1);
    }
    return;
  }
  if (typeof v === 'boolean') { g.tipler.add('boolean'); return; }
  if (typeof v === 'number') { g.tipler.add(Number.isInteger(v) ? 'integer' : 'number'); return; }
  const m = String(v);
  if (xml) {
    const t = m.trim();
    g.tipler.add(t === '' ? 'string' : TAM_SAYI.test(t) && !/^[+-]?0\d/.test(t) ? 'integer' : SAYI.test(t) && !/^[+-]?0\d/.test(t) ? 'number' : /^(true|false)$/.test(t) ? 'boolean' : 'string');
  } else g.tipler.add('string');
  if (g.metinler.length < 200) g.metinler.push(m.trim());
}

/** @param {Gozlem} g @param {string[]} uyarilar @param {string} yol @param {boolean} xml @returns {Sema} */
function gozlemdenSema(g, uyarilar, yol, xml) {
  if (xml && g.coklu) return { type: 'array', items: gozlemdenSema({ ...g, coklu: false }, uyarilar, `${yol}[]`, xml) };
  const tipler = [...g.tipler].filter((t) => t !== 'null');
  let turler = tipler.includes('integer') && tipler.includes('number') ? tipler.filter((t) => t !== 'integer') : tipler;
  // XML: aynı öğede sayı ve metin görüldüyse metin (ör. "12" ve "A12").
  if (turler.includes('string') && turler.length > 1 && turler.every((t) => ['string', 'integer', 'number', 'boolean'].includes(t))) turler = ['string'];
  /** @type {Sema} */
  const s = {};
  const nullVar = g.tipler.has('null');
  if (!turler.length) uyarilar.push(`${yol}: yalnız null görüldü; türü bilinmiyor (herhangi kabul edilir).`);
  if (turler.length) s.type = nullVar ? [...turler, 'null'] : turler.length === 1 ? turler[0] : turler;
  else if (nullVar) s.nullable = true;
  if (turler.length === 1 && turler[0] === 'string' && g.metinler.length && g.metinler.every(Boolean)) {
    if (g.metinler.every((x) => TARIH.test(x))) s.format = 'date';
    else if (g.metinler.every((x) => TARIH_SAAT.test(x))) s.format = 'date-time';
  }
  if (turler.includes('object')) {
    s.properties = {};
    const zorunlu = [];
    for (const [k, alt] of g.ozellikler) {
      s.properties[k] = gozlemdenSema(alt, uyarilar, xml ? `${yol}/${k}` : `${yol}.${k}`, xml);
      if ((g.gorulme.get(k) ?? 0) === g.nesneSayisi) zorunlu.push(k);
    }
    if (zorunlu.length) s.required = zorunlu;
  }
  if (turler.includes('array')) {
    if (g.oge) s.items = gozlemdenSema(g.oge, uyarilar, `${yol}[]`, xml);
    else uyarilar.push(`${yol}: dizi hep boş; öğe türü bilinmiyor.`);
  }
  return s;
}

/**
 * Örnek yanıtlardan şema taslağı. xml: örnekler xmlDegeri çıktısı (yaprak metinler sözcük biçiminden türlenir).
 * Zorunlu = tüm örneklerde var; null görüldüyse null izinli; dizilerin öğeleri birleştirilir.
 * @param {unknown[]} ornekler @param {{ xml?: boolean; kok?: string }} [s] kok: uyarılardaki kök yolu (JSON "response", XML "/KokOge")
 * @returns {{ sema: Sema; uyarilar: string[] }}
 */
export function taslakCikar(ornekler, s = {}) {
  if (!ornekler.length) throw new SozlesmeHatasi('Taslak için en az bir örnek yanıt gerekli.');
  const g = yeniGozlem();
  for (const o of ornekler) gozle(g, o, Boolean(s.xml), 0);
  /** @type {string[]} */
  const uyarilar = [];
  if (ornekler.length === 1) uyarilar.push('Tek örnekten zorunluluk kesin değildir: örnekte görülen her alan zorunlu işaretlendi. Alan alan gözden geçirin ya da birkaç başarılı yanıt seçin.');
  const sema = gozlemdenSema(g, uyarilar, s.kok ?? (s.xml ? '' : 'response'), Boolean(s.xml));
  return { sema, uyarilar };
}

// ---------------------------------------------------------------------------------------
// Alan alan düzenleme (arayüz) ve özet / fark
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ parcalar: string[]; yol: string; derinlik: number; tip: string; zorunlu: boolean; nullIzinli: boolean; format?: string; enum?: unknown[] }} SemaAlani
 *   parcalar: kökten yol ("[]" dizinin öğesi); tip: tek tür, "a|b" (birden çok) ya da "" (herhangi).
 */

/** @param {string[]} p */
export const alanYolu = (p) => p.reduce((y, x) => (x === '[]' ? `${y}[]` : y ? `${y}.${x}` : x), '');

/**
 * Şemanın düz alan listesi (kök dahil; kök parcalar []).
 * @param {Sema} sema @returns {SemaAlani[]}
 */
export function semaAlanlari(sema) {
  /** @type {SemaAlani[]} */
  const satirlar = [];
  /** @param {Sema} s @param {string[]} p @param {boolean} zorunlu */
  const gez = (s, p, zorunlu) => {
    if (p.length > EN_DERIN) return;
    const t = semaTipleri(s);
    satirlar.push({ parcalar: p, yol: alanYolu(p), derinlik: p.filter((x) => x !== '[]').length, tip: t.join('|'), zorunlu, nullIzinli: nullIzinliMi(s),
      ...(s.format ? { format: s.format } : {}), ...(s.enum ? { enum: s.enum } : {}) });
    for (const [ad, alt] of Object.entries(s.properties ?? {})) gez(alt, [...p, ad], (s.required ?? []).includes(ad));
    if (s.items) gez(s.items, [...p, '[]'], true);
  };
  gez(sema, [], true);
  return satirlar;
}

/** @param {Sema} sema @param {string[]} p @returns {{ dugum: Sema; ust: Sema | null; ad: string } | null} */
function dugumBul(sema, p) {
  let d = sema;
  /** @type {Sema | null} */
  let ust = null;
  let ad = '';
  for (const x of p) {
    ust = d; ad = x;
    const sonraki = x === '[]' ? d.items : d.properties?.[x];
    if (!sonraki) return null;
    d = sonraki;
  }
  return { dugum: d, ust, ad };
}

/**
 * Alanın türünü değiştirir (null izni korunur). tip: SEMA_TIPLERI'nden biri, "a|b" ya da "" (herhangi).
 * @param {Sema} sema @param {string[]} p @param {string} tip
 */
export function alanTipiAyarla(sema, p, tip) {
  const b = dugumBul(sema, p);
  if (!b) return;
  const n = nullIzinliMi(b.dugum);
  const t = tip.split('|').filter((x) => SEMA_TIPLERI.includes(x));
  delete b.dugum.nullable;
  if (!t.length) { delete b.dugum.type; if (n) b.dugum.nullable = true; }
  else b.dugum.type = n ? [...t, 'null'] : t.length === 1 ? t[0] : t;
  if (t.includes('object')) b.dugum.properties ??= {};
  if (t.includes('array')) b.dugum.items ??= {};
  if (!t.includes('string')) delete b.dugum.format;
}

/** @param {Sema} sema @param {string[]} p @param {boolean} acik */
export function alanNullAyarla(sema, p, acik) {
  const b = dugumBul(sema, p);
  if (!b) return;
  const t = semaTipleri(b.dugum);
  delete b.dugum.nullable;
  if (!t.length) { if (acik) b.dugum.nullable = true; return; }
  b.dugum.type = acik ? [...t, 'null'] : t.length === 1 ? t[0] : t;
  if (b.dugum.enum && !acik) b.dugum.enum = b.dugum.enum.filter((x) => x !== null);
}

/** Nesne alanının zorunluluğu (dizi öğesi ve kök için etkisiz). @param {Sema} sema @param {string[]} p @param {boolean} zorunlu */
export function alanZorunluAyarla(sema, p, zorunlu) {
  const b = dugumBul(sema, p);
  if (!b || !b.ust || b.ad === '[]') return;
  const r = new Set(b.ust.required ?? []);
  if (zorunlu) r.add(b.ad); else r.delete(b.ad);
  if (r.size) b.ust.required = [...r]; else delete b.ust.required;
}

/** Alanı (ve altındakileri) kaldırır; kök ve dizi öğesi kaldırılamaz. @param {Sema} sema @param {string[]} p */
export function alanKaldir(sema, p) {
  const b = dugumBul(sema, p);
  if (!b || !b.ust || b.ad === '[]') return;
  if (b.ust.properties) delete b.ust.properties[b.ad];
  if (b.ust.required) { b.ust.required = b.ust.required.filter((x) => x !== b.ad); if (!b.ust.required.length) delete b.ust.required; }
}

/** Alan sayısı (kök hariç) ve zorunlu alan sayısı. @param {Sema} sema */
export function sozlesmeOzeti(sema) {
  const a = semaAlanlari(sema).slice(1);
  return { alanSayisi: a.length, zorunluSayisi: a.filter((x) => x.zorunlu && !x.parcalar.at(-1)?.startsWith('[')).length };
}

/**
 * İki sözleşme arasındaki fark (onay penceresi için): eklenen / kaldırılan / değişen (tür, zorunlu, null izni) alan yolları.
 * @param {Sema | null | undefined} eski @param {Sema} yeni
 */
export function sozlesmeFarki(eski, yeni) {
  const e = new Map((eski ? semaAlanlari(eski) : []).map((x) => [x.yol, x]));
  const y = new Map(semaAlanlari(yeni).map((x) => [x.yol, x]));
  const eklenen = [...y.keys()].filter((k) => !e.has(k));
  const kaldirilan = [...e.keys()].filter((k) => !y.has(k));
  const degisen = [...y.entries()].filter(([k, x]) => {
    const o = e.get(k);
    return o && (o.tip !== x.tip || o.zorunlu !== x.zorunlu || o.nullIzinli !== x.nullIzinli || (o.format ?? '') !== (x.format ?? ''));
  }).map(([k]) => k);
  return { eklenen, kaldirilan, degisen };
}
