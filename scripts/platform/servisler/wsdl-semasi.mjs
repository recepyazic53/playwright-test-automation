// SERVİS TESTLERİ — WSDL'deki şemadan (xs:schema) her operasyonun istek alanları (senaryo düzenleyicideki alan formu için).
// Belge / literal "wrapped" SOAP servisleri (ör. .asmx) hedeflenir: binding operasyonu → portType girdisi → mesaj parçası
// (element) → o öğenin karmaşık tipi. Desteklenen: element / complexType / sequence / all / choice / complexContent extension,
// simpleType enumeration (seçenek listesi), minOccurs / maxOccurs / nillable. Özellikler (attribute) ve any yok sayılır.
// Operasyonun YANIT öğesi de (portType çıktısı) aynı biçimde "yanit" olarak döner (servis sözleşmesi: servis-sozlesmesi.mjs).
// Anlaşılmayan yapı hata vermez: o operasyon alansız ya da eksik alanla döner (arayüz XML görünümüne düşer).
// İçe aktarılan belgeler (wsdl:import, xsd:import / include — ör. Java JAX-WS "?wsdl=1", "?xsd=1") erisimiDenetle tarafından
// alınıp ana belgenin içine eklenir; burada tüm definitions ve schema bölümleri birlikte okunur.
import { xmlAyristir } from './servis-govdesi.mjs';

/** @typedef {import('./servis-govdesi.mjs').Alan} Alan */
/** @typedef {import('./servis-govdesi.mjs').OperasyonSemasi} OperasyonSemasi */
/** @typedef {import('./servis-govdesi.mjs').XmlOgesi} XmlOgesi */

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
const EN_DERIN = 10;
/** XSD yerleşik tipleri → alan tipi. */
const YERLESIK = /** @type {Record<string, import('./servis-govdesi.mjs').AlanTipi>} */ ({
  int: 'tamsayi', integer: 'tamsayi', long: 'tamsayi', short: 'tamsayi', byte: 'tamsayi', unsignedInt: 'tamsayi', unsignedLong: 'tamsayi',
  unsignedShort: 'tamsayi', unsignedByte: 'tamsayi', nonNegativeInteger: 'tamsayi', positiveInteger: 'tamsayi',
  decimal: 'ondalik', double: 'ondalik', float: 'ondalik', boolean: 'mantiksal', date: 'tarih', dateTime: 'tarihSaat'
});

/** @param {string} ad */
const yerel = (ad) => ad.slice(ad.indexOf(':') + 1);
/** @param {XmlOgesi} o @param {string} ad */
const cocuklar = (o, ad) => o.cocuklar.filter((c) => c.yerel === ad);

/**
 * @param {string} wsdl WSDL metni
 * @returns {Record<string, OperasyonSemasi>} operasyon adı → şema
 */
export function wsdlSemalari(wsdl) {
  let kok;
  try { kok = xmlAyristir(wsdl); } catch { return {}; }
  /** @type {XmlOgesi[]} */
  const semalar = [];
  /** @param {XmlOgesi} o */
  const semaTopla = (o) => { if (o.yerel === 'schema') semalar.push(o); else o.cocuklar.forEach(semaTopla); };
  semaTopla(kok);
  // Öneklerin ad alanları (XSD yerleşik tip tespiti için): tüm öğelerdeki xmlns bildirimleri birleştirilir.
  /** @type {Record<string, string>} */
  const onekler = {};
  /** @param {XmlOgesi} o */
  const onekTopla = (o) => { for (const [a, d] of Object.entries(o.oz)) if (a.startsWith('xmlns:')) onekler[a.slice(6)] ??= d; o.cocuklar.forEach(onekTopla); };
  onekTopla(kok);
  /** @type {Map<string, { oge: XmlOgesi; ns: string }>} */
  const ogeler = new Map();
  /** @type {Map<string, XmlOgesi>} */
  const karmasik = new Map();
  /** @type {Map<string, XmlOgesi>} */
  const basit = new Map();
  for (const s of semalar) {
    const ns = s.oz.targetNamespace ?? '';
    for (const c of s.cocuklar) {
      if (!c.oz.name) continue;
      if (c.yerel === 'element') ogeler.set(c.oz.name, { oge: c, ns });
      else if (c.yerel === 'complexType') karmasik.set(c.oz.name, c);
      else if (c.yerel === 'simpleType') basit.set(c.oz.name, c);
    }
  }

  /** @param {string} tipAdi @returns {{ tip: import('./servis-govdesi.mjs').AlanTipi; secenekler?: string[] } | null} */
  const basitTip = (tipAdi) => {
    const onek = tipAdi.includes(':') ? tipAdi.slice(0, tipAdi.indexOf(':')) : '';
    const ad = yerel(tipAdi);
    if (onekler[onek] === XSD_NS || (!onek && YERLESIK[ad])) return { tip: YERLESIK[ad] ?? 'metin' };
    const st = basit.get(ad);
    if (st) {
      const kisit = cocuklar(st, 'restriction')[0];
      const secenekler = kisit ? cocuklar(kisit, 'enumeration').map((e) => e.oz.value ?? '') : [];
      const taban = kisit?.oz.base ? basitTip(kisit.oz.base) : null;
      return { tip: taban?.tip ?? 'metin', ...(secenekler.length ? { secenekler } : {}) };
    }
    return null;
  };

  /**
   * Karmaşık tipin alanları (extension tabanı önce).
   * @param {XmlOgesi} ct @param {string[]} yigin döngü koruması @returns {Alan[]}
   */
  const tipAlanlari = (ct, yigin) => {
    if (yigin.length > EN_DERIN) return [];
    /** @type {Alan[]} */
    const alanlar = [];
    /** @param {XmlOgesi} o */
    const gez = (o) => {
      for (const c of o.cocuklar) {
        if (c.yerel === 'element') { const a = ogeAlani(c, yigin); if (a) alanlar.push(a); }
        else if (c.yerel === 'sequence' || c.yerel === 'all' || c.yerel === 'choice') gez(c);
        else if (c.yerel === 'complexContent') {
          for (const u of c.cocuklar) {
            if ((u.yerel === 'extension' || u.yerel === 'restriction') && u.oz.base) {
              const taban = karmasik.get(yerel(u.oz.base));
              if (u.yerel === 'extension' && taban && !yigin.includes(yerel(u.oz.base))) alanlar.push(...tipAlanlari(taban, [...yigin, yerel(u.oz.base)]));
              gez(u);
            }
          }
        }
      }
    };
    gez(ct);
    return alanlar;
  };

  /** @param {XmlOgesi} el @param {string[]} yigin @returns {Alan | null} */
  const ogeAlani = (el, yigin) => {
    if (el.oz.ref) {
      const r = ogeler.get(yerel(el.oz.ref));
      if (!r) return null;
      const a = ogeAlani(r.oge, yigin);
      return a ? { ...a, ...ozellikler(el) } : null;
    }
    const ad = el.oz.name;
    if (!ad) return null;
    /** @type {Alan} */
    const alan = { ad, ...ozellikler(el) };
    const icKarmasik = cocuklar(el, 'complexType')[0];
    const icBasit = cocuklar(el, 'simpleType')[0];
    if (icKarmasik) {
      const c = tipAlanlari(icKarmasik, [...yigin, `#${ad}`]);
      if (c.length) alan.cocuklar = c;
      return alan;
    }
    if (icBasit) {
      const kisit = cocuklar(icBasit, 'restriction')[0];
      const secenekler = kisit ? cocuklar(kisit, 'enumeration').map((e) => e.oz.value ?? '') : [];
      return { ...alan, tip: (kisit?.oz.base && basitTip(kisit.oz.base)?.tip) || 'metin', ...(secenekler.length ? { secenekler } : {}) };
    }
    const tipAdi = el.oz.type;
    if (!tipAdi) return { ...alan, tip: 'metin' };
    const b = basitTip(tipAdi);
    if (b) return { ...alan, ...b };
    const ct = karmasik.get(yerel(tipAdi));
    if (!ct || yigin.includes(yerel(tipAdi))) return { ...alan, tip: 'metin' };
    const c = tipAlanlari(ct, [...yigin, yerel(tipAdi)]);
    if (c.length) alan.cocuklar = c;
    else alan.tip = 'metin';
    return alan;
  };

  /** @param {XmlOgesi} el */
  function ozellikler(el) {
    return {
      ...(el.oz.minOccurs === '0' ? {} : { zorunlu: true }),
      ...(el.oz.nillable === 'true' ? { nillable: true } : {}),
      ...(el.oz.maxOccurs && el.oz.maxOccurs !== '1' && el.oz.maxOccurs !== '0' ? { coklu: true } : {})
    };
  }

  // Operasyonlar: binding (SOAPAction) + portType (girdi mesajı) + mesaj (parça öğesi). İçe aktarılan WSDL'ler iç içe
  // definitions olarak eklenmiş olabilir: hepsi okunur.
  /** @type {XmlOgesi[]} */
  const tanimlar = [];
  /** @param {XmlOgesi} o */
  const tanimTopla = (o) => { if (o.yerel === 'definitions') tanimlar.push(o); o.cocuklar.forEach(tanimTopla); };
  tanimTopla(kok);
  if (!tanimlar.length) tanimlar.push(kok);
  const hepsi = (/** @type {string} */ ad) => tanimlar.flatMap((t) => cocuklar(t, ad));
  /** @type {Map<string, string>} */
  const mesajOgesi = new Map();
  for (const m of hepsi('message')) {
    const p = cocuklar(m, 'part')[0];
    if (m.oz.name && p?.oz.element) mesajOgesi.set(m.oz.name, yerel(p.oz.element));
  }
  /** @type {Map<string, string>} */
  const girdiler = new Map();
  /** @type {Map<string, string>} */
  const ciktilar = new Map();
  for (const pt of hepsi('portType')) {
    for (const op of cocuklar(pt, 'operation')) {
      const girdi = cocuklar(op, 'input')[0];
      if (op.oz.name && girdi?.oz.message && !girdiler.has(op.oz.name)) girdiler.set(op.oz.name, yerel(girdi.oz.message));
      const cikti = cocuklar(op, 'output')[0];
      if (op.oz.name && cikti?.oz.message && !ciktilar.has(op.oz.name)) ciktilar.set(op.oz.name, yerel(cikti.oz.message));
    }
  }
  /** @type {Record<string, OperasyonSemasi>} */
  const sonuc = {};
  for (const b of hepsi('binding')) {
    // Yalnız SOAP binding'leri (HTTP GET/POST binding'leri atlanır).
    if (!b.cocuklar.some((c) => c.yerel === 'binding' && /soap/i.test(c.ad))) continue;
    for (const op of cocuklar(b, 'operation')) {
      const ad = op.oz.name;
      if (!ad || sonuc[ad]) continue;
      const eylem = op.cocuklar.find((c) => c.yerel === 'operation')?.oz.soapAction;
      const ogeAdi = mesajOgesi.get(girdiler.get(ad) ?? '') ?? ad;
      const o = ogeler.get(ogeAdi);
      if (!o) continue;
      const alan = ogeAlani(o.oge, []);
      // Yanıt şeması (servis sözleşmesi, servis-sozlesmesi.mjs): portType çıktısı → mesaj parçası öğesi (yoksa "<ad>Response").
      const yanitAdi = mesajOgesi.get(ciktilar.get(ad) ?? '') ?? `${ad}Response`;
      const y = ogeler.get(yanitAdi);
      const yanitAlani = y ? ogeAlani(y.oge, []) : null;
      sonuc[ad] = { ad, ...(eylem ? { eylem } : {}), kok: ogeAdi, ns: o.ns, alanlar: alan?.cocuklar ?? [],
        ...(y ? { yanit: { kok: yanitAdi, ns: y.ns, alanlar: yanitAlani?.cocuklar ?? [] } } : {}) };
    }
  }
  return sonuc;
}
