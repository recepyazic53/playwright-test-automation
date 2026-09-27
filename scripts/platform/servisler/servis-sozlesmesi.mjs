// SERVİS SÖZLEŞMESİ — operasyon (SOAP) / uç (REST) başına yanıt sözleşmesi: kaynaklar, saklama, koşuda doğrulama.
// - Kaynaklar (hiçbiri AĞ İSTEĞİ ATMAZ): WSDL / XSD (servisin kayıtlı WSDL yanıt şeması ya da yüklenen yerel dosyalar), OpenAPI /
//   Swagger (yerel JSON / YAML; yalnız başarılı yanıt şemaları; yalnız belge içi $ref çözülür, dış $ref indirilmez), JSON Schema
//   (yerel dosya), "Başarılı yanıttan taslak" (seçilen kayıtlı başarılı yanıtlardan tür çıkarımı; kullanıcı alan alan düzenleyip onaylar).
// - Önizleme hiçbir şey yazmaz; kayıt servis ayarlarında (ayarlar.sozlesmeler[operasyon]; kasada şifreli). Var olan sözleşmeyi
//   değiştirmek / silmek kullanıcı onayıyla (onay yoksa fark döner); her değişiklik geçmişe yazılır (ayarlar.sozlesmeGecmisi + servis geçmişi).
// - Koşu: senaryoda "Yanıt sözleşmeye uymalı" (icerik.sozlesmeDogrula; varsayılan kapalı) açıksa yanıt doğrulanır; uyumsuzluk senaryoyu
//   kaldırır. Mesajlar değer içermez; yine de gizli değerler maskelenir.
import { DepoHatasi } from '../veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisKosulariniListele, servisKosusuGetir, servisSenaryolariniListele } from './servis-deposu.mjs';
import { wsdlSemalari } from './wsdl-semasi.mjs';
import { yamlOku } from './yaml-okuyucu.mjs';
import {
  SozlesmeHatasi, jsonMetniDogrula, semaTemizle, soapGovdeOgesi, sozlesmeFarki, sozlesmeOzeti, taslakCikar, xmlAgaciOku, xmlDegeri, xmlDogrula
} from './sozlesme-dogrulayici.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./sozlesme-dogrulayici.mjs').Sema} Sema */
/** @typedef {import('./servis-govdesi.mjs').Alan} Alan */

export const SOZLESME_KAYNAKLARI = /** @type {const} */ (['wsdl', 'openapi', 'jsonSchema', 'taslak']);
export const KAYNAK_ETIKETLERI = Object.freeze({ wsdl: 'WSDL / XSD', openapi: 'OpenAPI / Swagger', jsonSchema: 'JSON Schema', taslak: 'Başarılı yanıttan taslak' });
const EN_COK_SEMA = 500_000;
const EN_COK_GECMIS = 20;
const EN_COK_ORNEK = 10;
const EN_COK_GOSTERILEN = 50;

/**
 * @typedef {{ kaynak: (typeof SOZLESME_KAYNAKLARI)[number]; bicim: 'json' | 'xml'; sema: Sema; xmlKok?: string; kaynakBilgisi?: string; guncellenme: string }} Sozlesme
 * @typedef {{ zaman: string; islem: 'olustur' | 'degistir' | 'sil'; kaynak?: string; kaynakBilgisi?: string; alanSayisi?: number;
 *   fark?: { eklenen: number; kaldirilan: number; degisen: number }; yapan?: string }} SozlesmeGecmisi
 */

/** @param {unknown} e */
const hataMesaji = (e) => (e instanceof Error ? e.message : String(e));
/** Doğrulayıcı / YAML hatası → DepoHatasi (uç standardı). @template T @param {() => T} f @returns {T} */
function depoHatasiyla(f) {
  try { return f(); } catch (e) {
    if (e instanceof DepoHatasi) throw e;
    if (e instanceof SozlesmeHatasi || (e instanceof Error && e.name === 'YamlHatasi') || e instanceof SyntaxError) throw new DepoHatasi(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------
// Belge okuma ve $ref çözümü
// ---------------------------------------------------------------------------------------

/** JSON ya da YAML metni. @param {string} metin */
export function belgeOku(metin) {
  const s = String(metin ?? '').trim();
  if (!s) throw new SozlesmeHatasi('Dosya boş.');
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch (e) { throw new SozlesmeHatasi(`JSON okunamadı: ${hataMesaji(e)}`); }
  }
  return yamlOku(s);
}

/** JSON işaretçisi (#/a/b~1c). @param {unknown} belge @param {string} ref */
function isaretci(belge, ref) {
  const parcalar = ref.slice(1).split('/').filter((x, n) => n > 0 || x !== '').map((x) => decodeURIComponent(x).replace(/~1/g, '/').replace(/~0/g, '~'));
  /** @type {any} */
  let d = belge;
  for (const p of parcalar) {
    if (d === null || typeof d !== 'object' || !Object.hasOwn(d, p)) return undefined;
    d = d[p];
  }
  return d;
}

const DEGER_ANAHTARLARI = new Set(['enum', 'example', 'examples', 'default', 'const', 'x-example']);

/**
 * Yalnız belge içi $ref ("#/…") çözülür; dış başvuru (dosya / adres) açık hatayla reddedilir — İNDİRME YAPILMAZ. Döngüsel başvuru
 * "herhangi" ({}) olur (uyarılara yazılır).
 * @param {unknown} belge @param {unknown} dugum @param {string[]} [uyarilar] @returns {any}
 */
export function refCoz(belge, dugum, uyarilar = []) {
  let sayac = 0;
  /** @param {unknown} d @param {string[]} yigin @returns {any} */
  const coz = (d, yigin) => {
    if (++sayac > 50_000) throw new SozlesmeHatasi('Şema çok büyük ya da çok iç içe ($ref).');
    if (Array.isArray(d)) return d.map((x) => coz(x, yigin));
    if (!d || typeof d !== 'object') return d;
    const o = /** @type {Record<string, unknown>} */ (d);
    if (typeof o.$ref === 'string') {
      const ref = o.$ref;
      if (!ref.startsWith('#')) throw new SozlesmeHatasi(`Dış $ref desteklenmez (indirme yapılmaz): ${ref}. Başvurulan şemayı aynı dosyaya alın.`);
      if (yigin.includes(ref)) { if (!uyarilar.includes(`Döngüsel başvuru: ${ref} (bu noktada tür denetlenmez).`)) uyarilar.push(`Döngüsel başvuru: ${ref} (bu noktada tür denetlenmez).`); return {}; }
      const hedef = isaretci(belge, ref);
      if (hedef === undefined) throw new SozlesmeHatasi(`$ref bulunamadı: ${ref}`);
      const { $ref: _r, ...kalan } = o;
      const cozulen = coz(hedef, [...yigin, ref]);
      return cozulen && typeof cozulen === 'object' && !Array.isArray(cozulen) ? { ...cozulen, ...coz(kalan, yigin) } : cozulen;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, DEGER_ANAHTARLARI.has(k) ? v : coz(v, yigin)]));
  };
  return coz(dugum, []);
}

// ---------------------------------------------------------------------------------------
// Kaynaklar
// ---------------------------------------------------------------------------------------

/**
 * OpenAPI 3 / Swagger 2 belgesinin operasyonları ve başarılı (2xx; yoksa default) yanıtlarının JSON şemaları.
 * @param {string} metin
 * @returns {{ baslik: string; operasyonlar: Array<{ anahtar: string; metot: string; yol: string; operationId?: string; ozet?: string; durumKodu?: string; sema?: Sema; uyarilar: string[]; hata?: string }> }}
 */
export function openapiOperasyonlari(metin) {
  const belge = belgeOku(metin);
  if (!belge || typeof belge !== 'object' || Array.isArray(belge) || (!('openapi' in belge) && !('swagger' in belge)) || !belge.paths || typeof belge.paths !== 'object') {
    throw new SozlesmeHatasi('Dosya bir OpenAPI / Swagger belgesi değil ("openapi" ya da "swagger" ve "paths" yok).');
  }
  const surum2 = 'swagger' in belge;
  const operasyonlar = [];
  for (const [yol, oge] of Object.entries(/** @type {Record<string, any>} */ (belge.paths))) {
    if (!oge || typeof oge !== 'object') continue;
    for (const metot of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = oge[metot];
      if (!op || typeof op !== 'object') continue;
      const yanitlar = op.responses && typeof op.responses === 'object' ? op.responses : {};
      const kodlar = Object.keys(yanitlar);
      const secilen = kodlar.filter((k) => /^2(\d\d|XX)$/i.test(k)).sort()[0] ?? (kodlar.includes('default') ? 'default' : undefined);
      /** @type {string[]} */
      const uyarilar = [];
      /** @type {{ sema?: Sema; hata?: string }} */
      let sonuc = {};
      if (!secilen) sonuc = { hata: 'başarılı (2xx) yanıt tanımı yok' };
      else {
        try {
          const y = refCoz(belge, yanitlar[secilen], uyarilar);
          const ham = surum2 ? y?.schema : jsonIcerigi(y?.content);
          sonuc = ham === undefined ? { hata: `${secilen} yanıtının JSON şeması yok` } : { sema: semaTemizle(ham) };
        } catch (e) { sonuc = { hata: hataMesaji(e) }; }
      }
      operasyonlar.push({
        anahtar: `${metot.toUpperCase()} ${yol}`, metot: metot.toUpperCase(), yol,
        ...(typeof op.operationId === 'string' ? { operationId: op.operationId } : {}), ...(typeof op.summary === 'string' ? { ozet: op.summary.slice(0, 200) } : {}),
        ...(secilen ? { durumKodu: secilen } : {}), ...sonuc, uyarilar
      });
    }
  }
  if (!operasyonlar.length) throw new SozlesmeHatasi('Belgede operasyon yok.');
  return { baslik: String(/** @type {any} */ (belge).info?.title ?? '').slice(0, 200), operasyonlar };
}

/** OpenAPI 3 content: application/json (ya da +json, joker tür), yoksa ilk içerik türü. @param {unknown} content */
function jsonIcerigi(content) {
  if (!content || typeof content !== 'object') return undefined;
  const c = /** @type {Record<string, any>} */ (content);
  const tur = Object.keys(c).find((k) => /^application\/json/i.test(k)) ?? Object.keys(c).find((k) => /\+json/i.test(k)) ?? Object.keys(c).find((k) => k === '*/*') ?? Object.keys(c)[0];
  return tur ? c[tur]?.schema : undefined;
}

/**
 * Nöbetçi REST ucuna en uygun OpenAPI operasyonu: operationId = uç adı; yoksa aynı metot ve yolun sonu eşleşen.
 * @param {Array<{ anahtar: string; metot: string; yol: string; operationId?: string }>} ops @param {{ ad: string; metot?: string; yol?: string }} uc
 */
export function openapiOnerisi(ops, uc) {
  const parcalar = (/** @type {string} */ y) => y.split('?')[0].replace(/\$\{[^}]*\}/g, '{}').replace(/\{[^}]*\}/g, '{}').toLowerCase().split('/').filter(Boolean);
  const byId = ops.find((o) => o.operationId && o.operationId === uc.ad);
  if (byId) return byId.anahtar;
  const hedef = parcalar(uc.yol ?? '');
  if (!hedef.length) return null;
  // Yolların sonları parça parça eşleşmeli ("{}" herhangi bir parçaya uyar); taban yolu farkı (ör. /api) sorun değildir.
  const uyar = (/** @type {string[]} */ a) => {
    const n = Math.min(a.length, hedef.length);
    for (let i = 1; i <= n; i++) {
      const x = a[a.length - i];
      const y = hedef[hedef.length - i];
      if (x !== y && x !== '{}' && y !== '{}') return false;
    }
    return n > 0;
  };
  const yolla = ops.filter((o) => !uc.metot || o.metot === uc.metot.toUpperCase()).find((o) => uyar(parcalar(o.yol)));
  return yolla?.anahtar ?? null;
}

/** JSON Schema dosyası (JSON / YAML; belge içi $ref: #/definitions, #/$defs). @param {string} metin */
export function jsonSemaOku(metin) {
  const belge = belgeOku(metin);
  if (!belge || typeof belge !== 'object' || Array.isArray(belge)) throw new SozlesmeHatasi('JSON Schema bir nesne olmalı.');
  /** @type {string[]} */
  const uyarilar = [];
  return { sema: semaTemizle(refCoz(belge, belge, uyarilar)), uyarilar };
}

const ALAN_TIPLERI = /** @type {Record<string, Sema>} */ ({
  metin: { type: 'string' }, tamsayi: { type: 'integer' }, ondalik: { type: 'number' }, mantiksal: { type: 'boolean' },
  tarih: { type: 'string', format: 'date' }, tarihSaat: { type: 'string', format: 'date-time' }
});

/**
 * WSDL alan ağacı (wsdl-semasi.mjs) → JSON Schema: alt öğeli → nesne; minOccurs ≠ 0 → zorunlu; nillable → null izinli;
 * maxOccurs > 1 → dizi; enumeration → enum.
 * @param {Alan[]} alanlar @returns {Sema}
 */
export function alanlardanSema(alanlar) {
  /** @param {Alan} a @returns {Sema} */
  const alan = (a) => {
    /** @type {Sema} */
    let s = a.cocuklar?.length ? alanlardanSema(a.cocuklar) : { ...(ALAN_TIPLERI[a.tip ?? 'metin'] ?? { type: 'string' }), ...(a.secenekler?.length ? { enum: [...a.secenekler] } : {}) };
    if (a.nillable) s = { ...s, type: [String(s.type ?? 'object'), 'null'] };
    return a.coklu ? { type: 'array', items: s } : s;
  };
  const required = alanlar.filter((a) => a.zorunlu).map((a) => a.ad);
  return { type: 'object', properties: Object.fromEntries(alanlar.map((a) => [a.ad, alan(a)])), ...(required.length ? { required } : {}) };
}

/**
 * Yüklenen WSDL / XSD metinleri: WSDL'in (definitions içeren) kökünün içine diğerleri eklenir (erişim kontrolündeki birleştirme gibi).
 * @param {string[]} metinler @param {string} operasyon
 */
export function wsdlDosyalarindanYanit(metinler, operasyon) {
  const ana = metinler.find((m) => /<(?:[\w.-]+:)?definitions\b/.test(m));
  if (!ana) throw new SozlesmeHatasi('Yüklenen dosyalarda WSDL (definitions) yok.');
  const ekler = metinler.filter((m) => m !== ana).map((m) => m.replace(/^\s*<\?xml[^>]*\?>/, ''));
  const birlesik = ekler.length ? ana.replace(/<\/((?:[\w.-]+:)?definitions)>\s*$/, `${ekler.join('\n')}</$1>`) : ana;
  const y = wsdlSemalari(birlesik)[operasyon]?.yanit;
  if (!y) throw new SozlesmeHatasi(`WSDL'de "${operasyon}" operasyonunun yanıt şeması bulunamadı (şema ayrı XSD dosyasındaysa onu da yükleyin).`);
  return y;
}

// ---------------------------------------------------------------------------------------
// Önizleme (yazmaz), kayıt, silme
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @param {unknown} servisId */
function servisAl(vt, projeId, servisId) {
  const s = typeof servisId === 'string' ? servisGetir(vt, servisId) : undefined;
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  return s;
}

/** @param {import('./servis-deposu.mjs').Servis} s @param {unknown} operasyon */
function operasyonAl(s, operasyon) {
  const op = (s.ayarlar.operasyonlar ?? []).find((o) => o.ad === operasyon);
  if (!op) throw new DepoHatasi(`"${String(operasyon)}" ${s.tur === 'rest' ? 'ucu' : 'operasyonu'} bu serviste yok.`);
  return op;
}

/** Operasyonun sözleşme için seçilebilecek başarılı yanıtları (senaryosu o operasyona ait, yanıtı kırpılmamış). @param {Veritabani} vt @param {import('./servis-deposu.mjs').Servis} s @param {string} operasyon */
function ornekAdaylari(vt, s, operasyon) {
  const senaryolar = new Map(servisSenaryolariniListele(vt, s.id).filter((x) => x.icerik.operasyon === operasyon).map((x) => [x.id, x.baslik]));
  return servisKosulariniListele(vt, { servisId: s.id, sinir: 500 })
    .filter((k) => k.durum === 'basarili' && k.senaryoId && senaryolar.has(k.senaryoId)).slice(0, 30)
    .map((k) => ({ kosuId: k.id, baslik: k.baslik, baslangic: k.baslangic, tur: k.tur, ortamId: k.ortamId }));
}

/**
 * Sözleşme sekmesinin verisi: operasyonun sözleşmesi, geçmişi, kayıtlı WSDL yanıt şeması var mı, taslak için başarılı yanıtlar.
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; operasyon: string }} g
 */
export function sozlesmeBilgisi(vt, projeId, g) {
  const s = servisAl(vt, projeId, g.servisId);
  operasyonAl(s, g.operasyon);
  const sozlesme = s.ayarlar.sozlesmeler?.[g.operasyon] ?? null;
  return {
    sozlesme, ...(sozlesme ? { ozet: sozlesmeOzeti(sozlesme.sema) } : {}), gecmis: s.ayarlar.sozlesmeGecmisi?.[g.operasyon] ?? [],
    wsdlYanitiVar: Boolean(s.ayarlar.operasyonSemalari?.[g.operasyon]?.yanit), ornekler: ornekAdaylari(vt, s, g.operasyon),
    senaryoSayisi: servisSenaryolariniListele(vt, s.id).filter((x) => x.icerik.operasyon === g.operasyon && /** @type {any} */ (x.icerik).sozlesmeDogrula === true).length
  };
}

/**
 * Sözleşme kaynağından ÖNİZLEME (taslak) üretir; hiçbir şey yazılmaz, ağ isteği yok.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; operasyon: string; kaynak: string; metin?: string; metinler?: string[]; dosyaAdi?: string; openapiAnahtari?: string; kosuIdleri?: string[] }} g
 *   wsdl: metinler verilmezse servisin kayıtlı WSDL yanıt şeması; openapi: anahtar verilmezse operasyon listesi (+ öneri) döner.
 */
export function sozlesmeOnizle(vt, projeId, g) {
  const s = servisAl(vt, projeId, g.servisId);
  const op = operasyonAl(s, g.operasyon);
  const bicim = s.tur === 'rest' ? 'json' : 'xml';
  const dosya = typeof g.dosyaAdi === 'string' ? g.dosyaAdi.replace(/[\r\n]/g, ' ').slice(0, 120) : '';
  return depoHatasiyla(() => {
    if (g.kaynak === 'wsdl') {
      if (s.tur === 'rest') throw new DepoHatasi('REST servisinde WSDL yok; OpenAPI ya da JSON Schema yükleyin.');
      const metinler = (g.metinler ?? []).filter((x) => typeof x === 'string' && x.trim());
      const y = metinler.length ? wsdlDosyalarindanYanit(metinler, g.operasyon) : s.ayarlar.operasyonSemalari?.[g.operasyon]?.yanit;
      if (!y) throw new DepoHatasi('Kayıtlı WSDL\'de bu operasyonun yanıt şeması yok: İşlemler > "WSDL\'den yeniden al" ile alın ya da WSDL / XSD dosyasını yükleyin.');
      return taslakYaniti({ kaynak: 'wsdl', bicim, sema: semaTemizle(alanlardanSema(y.alanlar)), xmlKok: y.kok, kaynakBilgisi: metinler.length ? `Yüklenen dosya${dosya ? `: ${dosya}` : ''}` : 'Kayıtlı WSDL', uyarilar: [] });
    }
    if (g.kaynak === 'openapi') {
      if (typeof g.metin !== 'string' || !g.metin.trim()) throw new DepoHatasi('OpenAPI / Swagger dosyası boş.');
      const o = openapiOperasyonlari(g.metin);
      if (!g.openapiAnahtari) {
        return { operasyonlar: o.operasyonlar.map(({ sema: _s, ...x }) => ({ ...x, semaVar: Boolean(_s) })), oneri: openapiOnerisi(o.operasyonlar, op), baslik: o.baslik };
      }
      const secilen = o.operasyonlar.find((x) => x.anahtar === g.openapiAnahtari);
      if (!secilen) throw new DepoHatasi('Seçilen OpenAPI operasyonu belgede yok.');
      if (!secilen.sema) throw new DepoHatasi(`${secilen.anahtar}: ${secilen.hata ?? 'şema yok'}`);
      return taslakYaniti({ kaynak: 'openapi', bicim, sema: secilen.sema, kaynakBilgisi: `${dosya || o.baslik || 'OpenAPI'} · ${secilen.anahtar} (${secilen.durumKodu})`, uyarilar: secilen.uyarilar });
    }
    if (g.kaynak === 'jsonSchema') {
      if (typeof g.metin !== 'string' || !g.metin.trim()) throw new DepoHatasi('JSON Schema boş.');
      const j = jsonSemaOku(g.metin);
      return taslakYaniti({ kaynak: 'jsonSchema', bicim, sema: j.sema, kaynakBilgisi: dosya || 'JSON Schema', uyarilar: j.uyarilar });
    }
    if (g.kaynak === 'taslak') {
      const idler = [...new Set((g.kosuIdleri ?? []).filter((x) => typeof x === 'string'))];
      if (!idler.length) throw new DepoHatasi('En az bir başarılı yanıt seçin.');
      if (idler.length > EN_COK_ORNEK) throw new DepoHatasi(`En çok ${EN_COK_ORNEK} yanıt seçilebilir.`);
      /** @type {unknown[]} */
      const ornekler = [];
      /** @type {Set<string>} */
      const kokler = new Set();
      for (const id of idler) {
        const k = servisKosusuGetir(vt, id);
        if (!k || k.servisId !== s.id) throw new DepoHatasi('Seçilen koşu kaydı bu serviste bulunamadı.');
        if (k.durum !== 'basarili' || k.sonuc.operasyon !== g.operasyon) throw new DepoHatasi(`"${k.baslik}": yalnız bu ${s.tur === 'rest' ? 'ucun' : 'operasyonun'} başarılı yanıtları seçilebilir.`);
        const y = typeof k.sonuc.yanit === 'string' ? k.sonuc.yanit : '';
        if (!y || y.endsWith('…(kırpıldı)')) throw new DepoHatasi(`"${k.baslik}": yanıt kaydı yok ya da kırpılmış.`);
        if (bicim === 'json') {
          try { ornekler.push(JSON.parse(y)); } catch { throw new DepoHatasi(`"${k.baslik}": yanıt JSON olarak okunamadı (maskelenmiş bir değer bozmuş olabilir).`); }
        } else {
          const kok = xmlAgaciOku(y);
          const gv = kok ? soapGovdeOgesi(kok) : null;
          if (!gv?.dugum || gv.fault) throw new DepoHatasi(`"${k.baslik}": yanıt SOAP gövdesi okunamadı${gv?.fault ? ' (Fault)' : ''}.`);
          kokler.add(gv.dugum.ad);
          ornekler.push(xmlDegeri(gv.dugum));
        }
      }
      if (kokler.size > 1) throw new DepoHatasi(`Seçilen yanıtların kök öğeleri farklı: ${[...kokler].join(', ')}.`);
      const xmlKok = [...kokler][0];
      const t = taslakCikar(ornekler, { xml: bicim === 'xml', kok: bicim === 'xml' ? `/${xmlKok}` : 'response' });
      const maskeli = ornekler.some((o) => JSON.stringify(o).includes('***'));
      return taslakYaniti({ kaynak: 'taslak', bicim, sema: semaTemizle(t.sema), ...(xmlKok ? { xmlKok } : {}), kaynakBilgisi: `${idler.length} başarılı yanıt`,
        uyarilar: [...t.uyarilar, ...(maskeli ? ['Maskelenmiş (***) değerler metin olarak görüldü; bu alanların türünü kontrol edin.'] : [])] });
    }
    throw new DepoHatasi('Geçersiz sözleşme kaynağı.');
  });
}

/** @param {{ kaynak: string; bicim: 'json' | 'xml'; sema: Sema; xmlKok?: string; kaynakBilgisi?: string; uyarilar: string[] }} t */
const taslakYaniti = (t) => ({ taslak: { ...t, ozet: sozlesmeOzeti(t.sema) } });

/**
 * Sözleşmeyi kaydeder. Var olan sözleşme değişiyorsa onay: true gerekir (yoksa { onayGerekli, fark } döner, yazılmaz).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; operasyon: string; sozlesme: unknown; onay?: boolean; yapan?: string }} g
 */
export function sozlesmeKaydet(vt, projeId, g) {
  const s = servisAl(vt, projeId, g.servisId);
  operasyonAl(s, g.operasyon);
  const h = /** @type {Record<string, any>} */ (g.sozlesme && typeof g.sozlesme === 'object' ? g.sozlesme : {});
  if (!SOZLESME_KAYNAKLARI.includes(h.kaynak)) throw new DepoHatasi('Geçersiz sözleşme kaynağı.');
  const sema = depoHatasiyla(() => semaTemizle(h.sema));
  if (JSON.stringify(sema).length > EN_COK_SEMA) throw new DepoHatasi('Sözleşme çok büyük.');
  const bicim = s.tur === 'rest' ? 'json' : 'xml';
  const xmlKok = bicim === 'xml' && typeof h.xmlKok === 'string' && /^[\p{L}_][\p{L}\p{N}_.-]{0,199}$/u.test(h.xmlKok) ? h.xmlKok : undefined;
  const kaynakBilgisi = typeof h.kaynakBilgisi === 'string' ? h.kaynakBilgisi.replace(/[\r\n]/g, ' ').slice(0, 200) : undefined;
  const onceki = s.ayarlar.sozlesmeler?.[g.operasyon];
  const f = sozlesmeFarki(onceki?.sema, sema);
  const fark = { eklenen: f.eklenen.length, kaldirilan: f.kaldirilan.length, degisen: f.degisen.length };
  if (onceki && g.onay !== true) return { onayGerekli: true, fark: { ...f, sayilar: fark } };
  /** @type {Sozlesme} */
  const yeni = { kaynak: h.kaynak, bicim, sema, ...(xmlKok ? { xmlKok } : {}), ...(kaynakBilgisi ? { kaynakBilgisi } : {}), guncellenme: new Date().toISOString() };
  const gecmis = gecmisEkle(s.ayarlar.sozlesmeGecmisi?.[g.operasyon], {
    zaman: yeni.guncellenme, islem: onceki ? 'degistir' : 'olustur', kaynak: yeni.kaynak, ...(kaynakBilgisi ? { kaynakBilgisi } : {}),
    alanSayisi: sozlesmeOzeti(sema).alanSayisi, ...(onceki ? { fark } : {}), ...(g.yapan ? { yapan: g.yapan } : {})
  });
  servisKaydet(vt, { id: s.id, projeId, anahtar: s.anahtar, ad: s.ad, yapan: g.yapan, ayarlar: {
    ...s.ayarlar, sozlesmeler: { ...(s.ayarlar.sozlesmeler ?? {}), [g.operasyon]: yeni }, sozlesmeGecmisi: { ...(s.ayarlar.sozlesmeGecmisi ?? {}), [g.operasyon]: gecmis }
  } });
  return { kaydedildi: true, sozlesme: yeni, ...(onceki ? { fark } : {}) };
}

/**
 * Sözleşmeyi siler (onay: true gerekir). Açık "Yanıt sözleşmeye uymalı" senaryoları sonraki koşuda "tanımlı değil" ile kalır.
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; operasyon: string; onay?: boolean; yapan?: string }} g
 */
export function sozlesmeSil(vt, projeId, g) {
  const s = servisAl(vt, projeId, g.servisId);
  const onceki = s.ayarlar.sozlesmeler?.[g.operasyon];
  if (!onceki) return { silindi: false };
  const kullanan = servisSenaryolariniListele(vt, s.id).filter((x) => x.icerik.operasyon === g.operasyon && /** @type {any} */ (x.icerik).sozlesmeDogrula === true).length;
  if (g.onay !== true) return { onayGerekli: true, senaryoSayisi: kullanan };
  const { [g.operasyon]: _sil, ...kalan } = s.ayarlar.sozlesmeler ?? {};
  const gecmis = gecmisEkle(s.ayarlar.sozlesmeGecmisi?.[g.operasyon], { zaman: new Date().toISOString(), islem: 'sil', kaynak: onceki.kaynak, ...(g.yapan ? { yapan: g.yapan } : {}) });
  servisKaydet(vt, { id: s.id, projeId, anahtar: s.anahtar, ad: s.ad, yapan: g.yapan, ayarlar: {
    ...s.ayarlar, sozlesmeler: kalan, sozlesmeGecmisi: { ...(s.ayarlar.sozlesmeGecmisi ?? {}), [g.operasyon]: gecmis }
  } });
  return { silindi: true };
}

/** En yeni önce, en çok 20. @param {SozlesmeGecmisi[] | undefined} liste @param {SozlesmeGecmisi} kayit */
const gecmisEkle = (liste, kayit) => [kayit, ...(liste ?? [])].slice(0, EN_COK_GECMIS);

// ---------------------------------------------------------------------------------------
// Koşuda doğrulama
// ---------------------------------------------------------------------------------------

/**
 * Yanıtı operasyonun sözleşmesine göre doğrular → kontrol sonucu (senaryonun kontrol listesine eklenir) ve rapor özeti.
 * Mesajlar değer içermez; yine de maskele (gizli değerleri maskeleyen işlev) yollar ve açıklamalara uygulanır.
 * @param {import('./servis-deposu.mjs').Servis} servis @param {string} operasyon @param {{ govde: string }} yanit @param {(m: string) => string} maskele
 * @returns {{ kontrol: import('./soap-istemcisi.mjs').KontrolSonucu; ozet: { durum: 'gecti' | 'kaldi' | 'yok'; toplam: number; uyumsuzluklar: Array<{ yol: string; mesaj: string }> } }}
 */
export function yanitSozlesmesiniDenetle(servis, operasyon, yanit, maskele) {
  const sz = servis.ayarlar.sozlesmeler?.[operasyon];
  if (!sz) {
    return {
      kontrol: { tur: 'sozlesme', ad: 'Sözleşme: tanımlı değil', gecti: false, aciklama: `Servisin Sözleşme sekmesinden "${operasyon}" için sözleşme tanımlayın.` },
      ozet: { durum: 'yok', toplam: 0, uyumsuzluklar: [] }
    };
  }
  const r = sz.bicim === 'xml' ? xmlDogrula(sz.sema, yanit.govde, { xmlKok: sz.xmlKok }) : jsonMetniDogrula(sz.sema, yanit.govde);
  const uyumsuzluklar = r.uyumsuzluklar.map((u) => ({ yol: maskele(u.yol), mesaj: maskele(u.mesaj) }));
  if (!r.toplam) {
    return { kontrol: { tur: 'sozlesme', ad: 'Sözleşme: Geçti', gecti: true, aciklama: `${sozlesmeOzeti(sz.sema).alanSayisi} alan tanımlı · ${KAYNAK_ETIKETLERI[sz.kaynak] ?? sz.kaynak}` }, ozet: { durum: 'gecti', toplam: 0, uyumsuzluklar: [] } };
  }
  const gosterilen = uyumsuzluklar.slice(0, EN_COK_GOSTERILEN);
  return {
    kontrol: {
      tur: 'sozlesme', ad: `Sözleşme: Kaldı — ${r.toplam} uyumsuzluk`, gecti: false,
      aciklama: r.toplam > gosterilen.length ? `ilk ${gosterilen.length} uyumsuzluk listelendi` : '',
      alt: gosterilen.map((u) => ({ tur: 'sozlesmeYolu', ad: u.yol, gecti: false, aciklama: u.mesaj }))
    },
    ozet: { durum: 'kaldi', toplam: r.toplam, uyumsuzluklar }
  };
}
