// SERVİS TESTLERİ — Postman koleksiyonundan (Collection v2.0 / v2.1 JSON) REST servis ve senaryo taslakları çıkarır.
// Ağ isteği YOKTUR; dosyalar yalnızca okunur. Hiçbir şey yazılmaz (kayıt, kullanıcı onayıyla servis-islemleri.mjs postmanAktar).
// - Kök düzeydeki her KLASÖR ayrı bir servis olur; klasördeki (alt klasörler dahil) istekler o servisin senaryo şablonlarıdır.
//   Klasörsüz kök istekler koleksiyon adıyla tek serviste toplanır.
// - Değişkenler ({{ad}}) koleksiyon değişkenlerinden, isteğe bağlı ortam dosyası (environment JSON) ezer. Şablonlarda {{ad}}
//   olarak KALIR; kayıtta (kullanıcının seçimine göre) tablo sütunu ${Tablo.ad} ya da akış değeri ${akis:ad} olur.
// - Adresin başındaki değişken (ör. {{baseUrl}}) ana makinedir: çözülürse kökeni önizlemede görünür (ortam taban adresi
//   yapılabilir), yolu servis yoluna katılır; değişken tabloya girmez.
// - Gizli sayılan değişkenler: Postman "secret" tipi ya da adı gizli ad listesinde (çekirdek + kullanıcının ek adları) veya
//   token / password / parola / secret / key / authorization içeren. İstekte düz yazılmış gizli değerler (Authorization başlığı,
//   bearer / apikey yetkisi, gizli adlı sorgu parametresi ya da JSON alanı) değişkene çevrilir; değerleri şablonda kalmaz.
// - Desteklenmeyenler (betikler, form-data, dosya gövdesi, basic / oauth yetkisi, dinamik değişkenler) uyarı olarak döner.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';

export const HTTP_METOTLARI = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
/** Gizli sayılan ad parçaları (çekirdek gizli adlara ek). */
const GIZLI_AD_PARCASI = /token|password|parola|secret|key|authorization/i;
/** {{ad}} — Postman değişken başvurusu. */
const DEGISKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
/** Koşucunun yazdığı başlıklar (şablona alınmaz). */
const ATLANAN_BASLIKLAR = new Set(['content-length', 'host', 'connection', 'accept-encoding', 'user-agent', 'postman-token', 'cache-control']);
/** Karşılığı olan dinamik değişkenler → Nöbetçi tarih ifadesi. */
const DINAMIK_TARIHLER = Object.freeze(/** @type {Record<string, string>} */ ({
  $isoTimestamp: "${tarih:bugun|yyyy-MM-dd'T'HH:mm:ss}"
}));

/**
 * @typedef {import('./servis-deposu.mjs').ServisKontrolu} ServisKontrolu
 * @typedef {{ ad: string; deger: string | undefined; kaynak: 'koleksiyon' | 'ortam' | 'istek' | 'tanimsiz'; gizli: boolean; betikle: boolean; kullanim: number }} PostmanDegiskeni
 * @typedef {{ baslik: string; operasyon: string; metot: string; yol: string; basliklar: Record<string, string>; govde: string; icerikTuru?: string;
 *   kontroller: ServisKontrolu[]; uyarilar: string[]; koken: string; kaynak: Record<string, string> }} PostmanIstegi
 * @typedef {{ anahtar: string; ad: string; istekler: PostmanIstegi[] }} PostmanKlasoru
 * @typedef {{ koleksiyon: string; surum: '2.0' | '2.1'; klasorler: PostmanKlasoru[]; degiskenler: PostmanDegiskeni[]; tabanDegiskenleri: string[];
 *   uyarilar: string[] }} PostmanCozumu
 */

/** @param {string} metin @param {string} ne */
function jsonOku(metin, ne) {
  try { return JSON.parse(metin.replace(/^\uFEFF/, '')); } catch { throw new Error(`${ne} JSON olarak okunamadı.`); }
}

/** @param {unknown} v @returns {Record<string, any>} */
const nesne = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {});
/** @param {unknown} v */
const metin = (v) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/** "Kullanıcı İşlemleri" → "kullanici-islemleri". @param {string} ad */
export function postmanAnahtari(ad) {
  return ad.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'servis';
}

/**
 * Değişken gizli mi: Postman "secret" tipi, gizli ad listesi (çekirdek + ekler) ya da ad parçası.
 * @param {string} ad @param {string} [tur] @param {ReadonlyArray<string>} [ekler]
 */
export function postmanGizliMi(ad, tur, ekler = []) {
  return tur === 'secret' || gizliAdMi(ad, ekler) || GIZLI_AD_PARCASI.test(ad);
}

/** Postman "key/value" dizisi (disabled atlanır). @param {unknown} liste @returns {Array<{ key: string; value: string; type?: string }>} */
function anahtarDegerleri(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(nesne).filter((x) => x.disabled !== true && x.enabled !== false && metin(x.key))
    .map((x) => ({ key: metin(x.key), value: metin(x.value), ...(typeof x.type === 'string' ? { type: x.type } : {}) }));
}

/** v2.1 yetki alanı dizisi ([{ key, value }]) ya da v2.0 nesnesi ({ token }). @param {unknown} v @param {string} ad */
function yetkiDegeri(v, ad) {
  if (Array.isArray(v)) return metin(nesne(v.map(nesne).find((x) => x.key === ad)).value);
  return metin(nesne(v)[ad]);
}

/**
 * Postman adresi → ham metin (v2.1 nesne: raw ya da parçalardan; v2.0: metin). Yol değişkenleri (:id) değeriyle ya da {{id}}
 * olarak; sorgu parametreleri dizi varsa ondan (kapalılar atlanır).
 * @param {unknown} url @returns {{ ham: string; yolDegiskenleri: Array<{ key: string; value: string }>; sorgu: Array<{ key: string; value: string }> | null }}
 */
function adresMetni(url) {
  if (typeof url === 'string') return { ham: url, yolDegiskenleri: [], sorgu: null };
  const u = nesne(url);
  const sorgu = Array.isArray(u.query) ? anahtarDegerleri(u.query) : null;
  let ham = metin(u.raw);
  if (!ham) {
    const ana = Array.isArray(u.host) ? u.host.map(metin).join('.') : metin(u.host);
    const yol = Array.isArray(u.path) ? u.path.map((p) => (typeof p === 'string' ? p : metin(nesne(p).value))).join('/') : metin(u.path);
    ham = `${u.protocol ? `${metin(u.protocol)}://` : ''}${ana}${u.port ? `:${metin(u.port)}` : ''}${yol ? `/${yol.replace(/^\/+/, '')}` : ''}`;
  }
  return { ham, yolDegiskenleri: anahtarDegerleri(u.variable), sorgu };
}

/**
 * Postman koleksiyonunu (ve isteğe bağlı ortam dosyasını) çözer.
 * @param {string} koleksiyonMetni @param {{ ortamMetni?: string; ekGizliAdlar?: ReadonlyArray<string> }} [secenekler]
 * @returns {PostmanCozumu}
 */
export function postmanCozumle(koleksiyonMetni, secenekler = {}) {
  const k = nesne(jsonOku(koleksiyonMetni, 'Koleksiyon dosyası'));
  if (Array.isArray(k.requests) && !Array.isArray(k.item)) throw new Error('Postman v1 koleksiyonu desteklenmiyor; Postman\'den "Collection v2.1" olarak dışa aktarın.');
  const info = nesne(k.info);
  if (!Array.isArray(k.item) || !metin(info.name)) throw new Error('Bu bir Postman koleksiyonu değil (info.name ve item bulunamadı).');
  const sema = metin(info.schema);
  if (sema && !/collection\/v2\.[01]\.\d/.test(sema)) throw new Error(`Desteklenmeyen koleksiyon şeması: ${sema} (v2.0 ya da v2.1 olmalı).`);
  const surum = /v2\.0\./.test(sema) ? '2.0' : '2.1';
  const ekler = secenekler.ekGizliAdlar ?? [];
  const koleksiyon = metin(info.name).trim();
  /** @type {string[]} */
  const uyarilar = [];

  // --- Değişkenler: koleksiyon, sonra ortam (ezer) ---
  /** @type {Map<string, PostmanDegiskeni>} */
  const degiskenler = new Map();
  for (const v of anahtarDegerleri(k.variable)) {
    degiskenler.set(v.key, { ad: v.key, deger: v.value, kaynak: 'koleksiyon', gizli: postmanGizliMi(v.key, v.type, ekler), betikle: false, kullanim: 0 });
  }
  if (secenekler.ortamMetni) {
    const o = nesne(jsonOku(secenekler.ortamMetni, 'Ortam dosyası'));
    if (!Array.isArray(o.values)) throw new Error('Bu bir Postman ortam dosyası değil (values bulunamadı).');
    for (const v of anahtarDegerleri(o.values)) {
      const onceki = degiskenler.get(v.key);
      degiskenler.set(v.key, { ad: v.key, deger: v.value, kaynak: 'ortam', gizli: postmanGizliMi(v.key, v.type, ekler) || Boolean(onceki?.gizli), betikle: false, kullanim: 0 });
    }
  }
  const deger = (/** @type {string} */ ad) => degiskenler.get(ad)?.deger;
  /**
   * Düz yazılmış gizli değer → değişken. Aynı değerli değişken varsa o kullanılır; yoksa ad (çakışırsa _2, _3…).
   * @param {string} ad @param {string} d
   */
  const sentetik = (ad, d) => {
    for (const v of degiskenler.values()) if (v.deger === d && d) { v.gizli = true; return v.ad; }
    const temel = ad.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'gizli';
    let yeni = temel;
    for (let n = 2; degiskenler.has(yeni); n++) yeni = `${temel}_${n}`;
    degiskenler.set(yeni, { ad: yeni, deger: d, kaynak: 'istek', gizli: true, betikle: false, kullanim: 0 });
    return yeni;
  };
  /** Adresin başında ana makine olarak kullanılan değişkenler. @type {Set<string>} */
  const tabanDegiskenleri = new Set();
  /** Desteklenmeyen dinamik değişkenler. @type {Set<string>} */
  const dinamikler = new Set();

  /** Dinamik değişkenleri çevirir ({{$isoTimestamp}} → tarih ifadesi); diğerleri olduğu gibi kalır (uyarı). @param {string} s */
  const dinamikCevir = (s) => s.replace(DEGISKEN, (m, ad) => {
    if (!ad.startsWith('$')) return m;
    if (DINAMIK_TARIHLER[ad]) return DINAMIK_TARIHLER[ad];
    dinamikler.add(ad);
    return m;
  });

  /**
   * Adres → köken (çözülebildiyse) + yol (sorgu dahil; {{…}} şablonda kalır).
   * @param {string} ham @param {string[]} u uyarılar
   */
  const adresAyir = (ham, u) => {
    let s = ham.trim().replace(/#.*$/, '');
    const bas = /^\{\{\s*([^{}]+?)\s*\}\}/.exec(s);
    if (bas && !bas[1].startsWith('$')) {
      tabanDegiskenleri.add(bas[1]);
      const v = deger(bas[1]);
      if (v && !v.includes('{{')) s = v.replace(/\/+$/, '') + s.slice(bas[0].length);
      else {
        u.push(`Adresin başındaki {{${bas[1]}}} çözülemedi; ana makine ortamın taban adresinden gelir.`);
        const yol = s.slice(bas[0].length);
        return { koken: '', yol: yol.startsWith('/') || yol.startsWith('?') ? yol : `/${yol}` };
      }
    }
    const m = /^(https?:\/\/)?([^/?]*)(.*)$/i.exec(s) ?? ['', '', '', s];
    const ana = (m[2] ?? '').replace(DEGISKEN, (x, ad) => deger(ad) ?? x);
    let koken = '';
    if (ana && !ana.includes('{{')) {
      try { koken = new URL(`${m[1] || 'http://'}${ana}`).origin; } catch { u.push(`Adresin ana makinesi okunamadı: ${ana}`); }
    } else if (ana) u.push(`Ana makinedeki değişken çözülemedi (${ana}); ana makine ortamın taban adresinden gelir.`);
    const yol = m[3] ?? '';
    return { koken, yol: !yol ? '' : yol.startsWith('/') || yol.startsWith('?') ? yol : `/${yol}` };
  };

  /**
   * Betikten kontroller (durum kodu, metin içerir) ve betikle atanan değişkenler.
   * @param {unknown} olaylar @param {string[]} u @param {boolean} istekMi yalnız isteğin kendi betiğinden kontrol üretilir
   */
  const betikler = (olaylar, u, istekMi) => {
    /** @type {ServisKontrolu[]} */
    const kontroller = [];
    if (!Array.isArray(olaylar)) return kontroller;
    for (const o of olaylar.map(nesne)) {
      const b = nesne(o.script);
      const kod = Array.isArray(b.exec) ? b.exec.map(metin).join('\n') : metin(b.exec);
      if (!kod.trim()) continue;
      for (const a of kod.matchAll(/pm\.(?:environment|collectionVariables|globals|variables)\.set\(\s*["'`]([^"'`]+)["'`]/g)) {
        const v = degiskenler.get(a[1]);
        if (v) v.betikle = true;
        else degiskenler.set(a[1], { ad: a[1], deger: undefined, kaynak: 'tanimsiz', gizli: postmanGizliMi(a[1], undefined, ekler), betikle: true, kullanim: 0 });
      }
      if (o.listen === 'test' && istekMi) {
        let anlasilan = 0;
        for (const d of kod.matchAll(/pm\.response\.to\.have\.status\(\s*(\d{3})\s*\)|pm\.expect\(\s*pm\.response\.code\s*\)\.to\.(?:eql|equal|be\.equal|eq)\(\s*(\d{3})\s*\)/g)) {
          kontroller.push({ tur: 'durumKodu', deger: d[1] ?? d[2] });
          anlasilan++;
        }
        for (const d of kod.matchAll(/pm\.expect\(\s*pm\.response\.text\(\)\s*\)\.to\.include\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
          kontroller.push({ tur: 'icerir', deger: d[1] });
          anlasilan++;
        }
        u.push(anlasilan ? `Test betiğinden ${anlasilan} kontrol alındı; betiğin geri kalanı aktarılmadı.` : 'Test betiği aktarılmadı (Nöbetçi kontrollerine elle çevirin).');
      } else if (o.listen === 'prerequest') u.push(`${istekMi ? 'İstek öncesi' : 'Klasör / koleksiyon'} betiği aktarılmadı.`);
      else if (!istekMi && o.listen === 'test') u.push('Klasör / koleksiyon test betiği aktarılmadı.');
    }
    return kontroller;
  };
  const kokUyarilari = /** @type {string[]} */ ([]);
  betikler(k.event, kokUyarilari, false);
  if (kokUyarilari.length) uyarilar.push(...new Set(kokUyarilari.map((x) => `Koleksiyon: ${x}`)));

  /**
   * Yetki → başlık ya da sorgu. Desteklenmeyen tür uyarı.
   * @param {Record<string, any>} yetki @param {Record<string, string>} basliklar @param {Array<{ key: string; value: string }>} sorgu @param {string[]} u
   */
  const yetkiUygula = (yetki, basliklar, sorgu, u) => {
    const tur = metin(yetki.type);
    if (!tur || tur === 'noauth') return;
    if (tur === 'bearer') {
      const t = yetkiDegeri(yetki.bearer, 'token');
      if (t) basliklar.Authorization = `Bearer ${t.includes('{{') ? t : `{{${sentetik('token', t)}}}`}`;
      return;
    }
    if (tur === 'apikey') {
      const ad = yetkiDegeri(yetki.apikey, 'key') || 'X-Api-Key';
      const v = yetkiDegeri(yetki.apikey, 'value');
      const d = v.includes('{{') || !v ? v : `{{${sentetik(ad, v)}}}`;
      if (yetkiDegeri(yetki.apikey, 'in') === 'query') sorgu.push({ key: ad, value: d });
      else basliklar[ad] = d;
      return;
    }
    u.push(`"${tur}" yetkisi desteklenmiyor — aktarılmadı (başlığı elle ekleyin ya da oturum akışı kullanın).`);
  };

  /**
   * @param {Record<string, any>} oge @param {string[]} klasorYolu @param {Record<string, any> | null} yetki (miras)
   * @returns {Omit<PostmanIstegi, 'operasyon'>}
   */
  const istekCevir = (oge, klasorYolu, yetki) => {
    /** @type {string[]} */
    const u = [];
    const r = typeof oge.request === 'string' ? { method: 'GET', url: oge.request } : nesne(oge.request);
    let metot = metin(r.method).toUpperCase() || 'GET';
    if (!HTTP_METOTLARI.includes(metot)) { u.push(`"${metot}" metodu desteklenmiyor; GET yazıldı.`); metot = 'GET'; }
    const a = adresMetni(r.url);
    const { koken, yol: hamYol } = adresAyir(a.ham, u);
    let [yol, ...sorguParcasi] = hamYol.split('?');
    // Yol değişkenleri (/:id): değer varsa o, yoksa {{id}}.
    yol = yol.replace(/\/:([A-Za-z_][\w-]*)/g, (_m, ad) => {
      const v = a.yolDegiskenleri.find((x) => x.key === ad)?.value;
      return `/${v || `{{${ad}}}`}`;
    });
    /** @type {Array<{ key: string; value: string }>} */
    const sorgu = a.sorgu ?? (sorguParcasi.length ? sorguParcasi.join('?').split('&').filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return i < 0 ? { key: p, value: '' } : { key: p.slice(0, i), value: p.slice(i + 1) };
    }) : []);
    /** @type {Record<string, string>} */
    const basliklar = {};
    let icerikTuru = '';
    const hamBasliklar = typeof r.header === 'string'
      ? r.header.split(/\r?\n/).map((s) => { const i = s.indexOf(':'); return i > 0 ? { key: s.slice(0, i).trim(), value: s.slice(i + 1).trim() } : null; }).filter((x) => x !== null)
      : anahtarDegerleri(r.header);
    for (const b of /** @type {Array<{ key: string; value: string }>} */ (hamBasliklar)) {
      const ad = b.key.trim();
      if (ad.toLowerCase() === 'content-type') { icerikTuru = b.value.trim(); continue; }
      if (ATLANAN_BASLIKLAR.has(ad.toLowerCase())) continue;
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(ad) || /[\r\n]/.test(b.value)) { u.push(`"${ad}" başlığı geçersiz — aktarılmadı.`); continue; }
      let v = b.value;
      if (v && !v.includes('{{') && postmanGizliMi(ad, undefined, ekler)) {
        const sema = /^(Bearer|Basic|Digest|Token)\s+(.+)$/i.exec(v);
        v = sema ? `${sema[1]} {{${sentetik(sema[1].toLowerCase() === 'bearer' ? 'token' : ad, sema[2])}}}` : `{{${sentetik(ad, v)}}}`;
      }
      basliklar[ad] = v;
    }
    const y = r.auth ? nesne(r.auth) : yetki;
    if (y && !Object.keys(basliklar).some((x) => x.toLowerCase() === 'authorization')) yetkiUygula(y, basliklar, sorgu, u);
    // Sorgu: gizli adlı düz değer değişkene çevrilir.
    const sorguMetni = sorgu.map(({ key, value }) => {
      const v = value && !value.includes('{{') && postmanGizliMi(key, undefined, ekler) ? `{{${sentetik(key, value)}}}` : value;
      return `${key}${v || value === '' ? `=${v}` : ''}`;
    }).join('&');
    // Gövde
    let govde = '';
    const g = nesne(r.body);
    if (g.disabled !== true) {
      switch (metin(g.mode)) {
        case 'raw': {
          govde = metin(g.raw);
          const dil = metin(nesne(nesne(g.options).raw).language);
          if (!icerikTuru && govde) icerikTuru = dil === 'xml' ? 'application/xml' : dil === 'text' ? 'text/plain' : dil === 'html' ? 'text/html' : dil === 'javascript' ? 'application/javascript' : 'application/json';
          // JSON gövdede düz yazılmış gizli alanlar ("password": "…") değişkene çevrilir.
          if (/json/i.test(icerikTuru)) {
            govde = govde.replace(/"([^"\\]{1,80})"(\s*:\s*)"((?:[^"\\{}]|\\.){1,4000})"/g, (m, ad, ara, d) => {
              if (!postmanGizliMi(ad, undefined, ekler)) return m;
              let duz = d;
              try { duz = JSON.parse(`"${d}"`); } catch { /* kaçış okunamadı: olduğu gibi */ }
              return `"${ad}"${ara}"{{${sentetik(ad, duz)}}}"`;
            });
          }
          break;
        }
        case 'urlencoded': {
          govde = anahtarDegerleri(g.urlencoded).map(({ key, value }) => {
            const v = value && !value.includes('{{') && postmanGizliMi(key, undefined, ekler) ? `{{${sentetik(key, value)}}}` : value;
            const kod = (/** @type {string} */ s) => s.split(/(\{\{[^{}]+\}\})/).map((p) => (p.startsWith('{{') ? p : encodeURIComponent(p))).join('');
            return `${kod(key)}=${kod(v)}`;
          }).join('&');
          icerikTuru ||= 'application/x-www-form-urlencoded';
          break;
        }
        case 'graphql': {
          const q = nesne(g.graphql);
          let degisken = {};
          try { degisken = metin(q.variables) ? JSON.parse(metin(q.variables)) : {}; } catch { u.push('GraphQL değişkenleri JSON değil — boş gönderilir.'); }
          govde = JSON.stringify({ query: metin(q.query), variables: degisken }, null, 2);
          icerikTuru ||= 'application/json';
          break;
        }
        case 'formdata': u.push('form-data gövdesi desteklenmiyor — gövde aktarılmadı.'); break;
        case 'file': u.push('Dosya gövdesi desteklenmiyor — gövde aktarılmadı.'); break;
        default: break;
      }
    }
    const kontroller = betikler(oge.event, u, true);
    const tamYol = dinamikCevir(`${yol}${sorguMetni ? `?${sorguMetni}` : ''}`);
    const ad = metin(oge.name).trim() || `${metot} ${yol || '/'}`;
    return {
      baslik: [...klasorYolu.slice(1), ad].join(' / '), metot, yol: tamYol,
      basliklar: Object.fromEntries(Object.entries(basliklar).map(([x, v]) => [x, dinamikCevir(v)])), govde: dinamikCevir(govde),
      ...(icerikTuru && !/[\r\n]/.test(icerikTuru) ? { icerikTuru } : {}),
      kontroller: kontroller.length ? kontroller : [{ tur: 'durumKodu', deger: '200-299' }], uyarilar: [...new Set(u)], koken,
      kaynak: { arac: 'Postman', koleksiyon, ...(klasorYolu.length ? { klasor: klasorYolu.join(' / ') } : {}), istek: metin(oge.name) }
    };
  };

  /** @type {Map<string, PostmanKlasoru>} */
  const klasorler = new Map();
  const anahtarlar = new Set();
  /** @param {string} ad */
  const yeniKlasor = (ad) => {
    const temel = postmanAnahtari(ad);
    let anahtar = temel;
    for (let n = 2; anahtarlar.has(anahtar); n++) anahtar = `${temel.slice(0, 76)}-${n}`;
    anahtarlar.add(anahtar);
    /** @type {PostmanKlasoru} */
    const kl = { anahtar, ad: ad.slice(0, 120), istekler: [] };
    klasorler.set(anahtar, kl);
    return kl;
  };
  /** @type {PostmanKlasoru | null} */
  let kokKlasor = null;
  /**
   * @param {unknown[]} ogeler @param {string[]} yolAdlari @param {Record<string, any> | null} yetki @param {PostmanKlasoru | null} hedef
   */
  const gez = (ogeler, yolAdlari, yetki, hedef) => {
    for (const oge of ogeler.map(nesne)) {
      if (Array.isArray(oge.item)) {
        const ad = metin(oge.name).trim() || 'Klasör';
        const kl = hedef ?? yeniKlasor(ad);
        /** @type {string[]} */
        const ku = [];
        betikler(oge.event, ku, false);
        for (const x of new Set(ku)) uyarilar.push(`${[...yolAdlari, ad].join(' / ')}: ${x}`);
        gez(oge.item, [...yolAdlari, ad], oge.auth ? nesne(oge.auth) : yetki, kl);
      } else if (oge.request !== undefined) {
        const kl = hedef ?? (kokKlasor ??= yeniKlasor(koleksiyon));
        kl.istekler.push({ ...istekCevir(oge, yolAdlari, yetki), operasyon: '' });
      }
    }
  };
  gez(k.item, [], k.auth ? nesne(k.auth) : null, null);

  // Operasyon adı: "METOT /yol/{id}" (sorgu ve değişken adları okunur biçimde); aynı metot + yol aynı operasyondur.
  for (const kl of klasorler.values()) {
    for (const i of kl.istekler) i.operasyon = `${i.metot} ${(i.yol.split('?')[0] || '/').replace(DEGISKEN, '{$1}')}`.slice(0, 200);
  }
  // Kullanım sayısı (adresin başındaki taban değişkeni hariç).
  const tumMetin = [...klasorler.values()].flatMap((kl) => kl.istekler.flatMap((i) => [i.yol, i.govde, ...Object.values(i.basliklar)]));
  for (const m of tumMetin.join('\n').matchAll(DEGISKEN)) {
    const ad = m[1];
    if (ad.startsWith('$')) continue;
    const v = degiskenler.get(ad) ?? { ad, deger: undefined, kaynak: /** @type {const} */ ('tanimsiz'), gizli: postmanGizliMi(ad, undefined, ekler), betikle: false, kullanim: 0 };
    v.kullanim++;
    degiskenler.set(ad, v);
  }
  if (dinamikler.size) uyarilar.push(`Desteklenmeyen dinamik değişkenler olduğu gibi gönderilir: ${[...dinamikler].map((x) => `{{${x}}}`).join(', ')}.`);
  return {
    koleksiyon, surum, klasorler: [...klasorler.values()].filter((kl) => kl.istekler.length),
    degiskenler: [...degiskenler.values()].filter((v) => v.kullanim > 0 || tabanDegiskenleri.has(v.ad)).sort((x, y) => x.ad.localeCompare(y.ad, 'tr')),
    tabanDegiskenleri: [...tabanDegiskenleri].sort(), uyarilar
  };
}

/** Şablondaki değişken adları ({{ad}}; dinamikler hariç). @param {string} s */
export const sablonDegiskenleri = (s) => [...new Set([...s.matchAll(DEGISKEN)].map((m) => m[1]).filter((x) => !x.startsWith('$')))];

/**
 * Şablondaki {{ad}} başvurularını çevirir (cevir undefined dönerse olduğu gibi kalır).
 * @param {string} s @param {(ad: string) => string | undefined} cevir
 */
export const sablonCevir = (s, cevir) => s.replace(DEGISKEN, (m, ad) => (ad.startsWith('$') ? m : cevir(ad) ?? m));

/**
 * Servis yolu: isteklerin dizinlerinin (son parça hariç) ortak, değişkensiz başı. Yoksa "/".
 * @param {string[]} yollar sorgulu yollar
 */
export function ortakYol(yollar) {
  const dizinler = yollar.map((y) => y.split('?')[0].split('/').filter(Boolean).slice(0, -1));
  if (!dizinler.length) return '/';
  /** @type {string[]} */
  const ortak = [];
  for (let i = 0; ; i++) {
    const p = dizinler[0][i];
    if (p === undefined || p.includes('{{') || p.includes('${') || /[\s?#]/.test(p) || dizinler.some((d) => d[i] !== p)) break;
    ortak.push(p);
  }
  return `/${ortak.join('/')}`;
}

/**
 * Önizleme özeti: gizli değişkenlerin DEĞERİ dönmez (yalnız tanımlı olup olmadığı).
 * @param {PostmanCozumu} c
 */
export function postmanOzeti(c) {
  return {
    koleksiyon: c.koleksiyon, surum: c.surum, uyarilar: c.uyarilar, tabanDegiskenleri: c.tabanDegiskenleri,
    degiskenler: c.degiskenler.filter((v) => !c.tabanDegiskenleri.includes(v.ad) || v.kullanim > 0).map((v) => ({
      ad: v.ad, kaynak: v.kaynak, gizli: v.gizli, betikle: v.betikle, kullanim: v.kullanim, tanimli: Boolean(v.deger), ...(v.gizli ? {} : { deger: v.deger ?? '' })
    })),
    klasorler: c.klasorler.map((kl) => ({
      anahtar: kl.anahtar, ad: kl.ad, kokenler: [...new Set(kl.istekler.map((i) => i.koken).filter(Boolean))],
      istekler: kl.istekler.map((i) => ({ baslik: i.baslik, metot: i.metot, operasyon: i.operasyon, kontrolSayisi: i.kontroller.length, uyarilar: i.uyarilar }))
    }))
  };
}
