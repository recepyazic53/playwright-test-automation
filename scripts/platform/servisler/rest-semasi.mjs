// SERVİS TESTLERİ — REST uçları (ORTAK: sunucu ve arayüz kullanır; /arayuz/rest-semasi.mjs olarak sunulur). Node modülü İÇE AKTARMAZ.
// - adresAyir: yapıştırılan tam adres → köken (şema + host + port; taban adres olur), yol, sorgu. Şemasız adres ("x.com/api")
//   https:// varsayılarak okunur (semaEklendi: true — arayüz kullanıcıya gösterir).
// - Uç (istek) tanımı: { ad, metot, yol ("/kullanicilar/{id}"; {ad} yol yer tutucusu), sorgu [{ ad, deger }], icerikTuru,
//   basliklar [{ ad, deger }], govdeOrnegi (isteğe bağlı örnek gövde, JSON), yalnizTest, gizliAlanlar [alan yolu] }.
// - restSemasi: uçtan alan şeması (servis-govdesi.mjs OperasyonSemasi biçiminde; alan formu ve tablo bağlama aynı bileşenle çalışır):
//   gruplar "yol" (yer tutucular), "sorgu" (parametreler), "govde" (örnek JSON; iç içe nesneler alt alan, dizilerde ilk eleman).
// - baslangicSablonu: senaryo şablonu — bağlı alan ${Tablo.Sütun}, gizli alanın örnek değeri YAZILMAZ, diğerleri örnek değer.

export const REST_METOTLARI = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
/** Gövdesi olan metotlar (gövde örneği alanı bunlarda görünür). */
export const GOVDELI_METOTLAR = Object.freeze(['POST', 'PUT', 'PATCH']);
export const ICERIK_TURLERI = Object.freeze([
  ['application/json', 'JSON'], ['application/x-www-form-urlencoded', 'Form (urlencoded)'], ['application/xml', 'XML'], ['text/plain', 'Metin']
]);
/** Alan yolu parçası (servis-islemleri ALAN_YOLU ile aynı). */
const PARCA = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;
const YER_TUTUCU = /\{([\p{L}_][\p{L}\p{N}_.-]*)\}/gu;
const HAM = '__NOBETCI_HAM__';

/**
 * Tam adres → köken + yol + sorgu. Şema yoksa https:// varsayılır.
 * @param {string} metin @returns {{ koken: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; semaEklendi: boolean }}
 */
export function adresAyir(metin) {
  let s = String(metin ?? '').trim();
  if (!s) throw new Error('Adres boş.');
  const semaEklendi = !/^[a-z][a-z0-9+.-]*:\/\//i.test(s);
  if (semaEklendi) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try { u = new URL(s); } catch { throw new Error(`Adres anlaşılamadı: ${metin}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Adres http:// ya da https:// olmalı.');
  if (!u.hostname) throw new Error('Adreste sunucu adı yok.');
  const yol = decodeURI(u.pathname).replace(/%7B/gi, '{').replace(/%7D/gi, '}');
  return { koken: u.origin, yol: yol === '/' ? '' : yol, sorgu: [...u.searchParams].map(([ad, deger]) => ({ ad, deger })), semaEklendi };
}

/** Yoldan önerilen uç adı: son anlamlı parça ("/api/v10/authenticate" → "authenticate"). @param {string} yol */
export function ucAdiOner(yol) {
  const p = String(yol ?? '').split('?')[0].split('/').filter((x) => x && !/^\{.*\}$/.test(x) && !/^v\d+$/i.test(x));
  return p.length ? p[p.length - 1] : '';
}

/** Yoldaki yer tutucular ("/k/{id}" → ["id"]). @param {string} yol */
export const yolYerTutuculari = (yol) => [...new Set([...String(yol ?? '').matchAll(YER_TUTUCU)].map((m) => m[1]))];

/** Gövde örneği → değer (boşsa undefined). Geçersiz JSON açık hatayla. @param {string} metin */
export function govdeOrnegiCoz(metin) {
  const s = String(metin ?? '').trim();
  if (!s) return undefined;
  try { return JSON.parse(s); } catch (e) { throw new Error(`Gövde örneği geçerli JSON değil: ${/** @type {Error} */ (e).message}`); }
}

/** @param {unknown} v @returns {import('./servis-govdesi.mjs').AlanTipi} */
const tipi = (v) => (typeof v === 'boolean' ? 'mantiksal' : typeof v === 'number' ? (Number.isInteger(v) ? 'tamsayi' : 'ondalik') : 'metin');

/**
 * JSON değerinden alan ağacı (geçersiz adlı anahtarlar atlanır). Dizi: ilk eleman (coklu).
 * @param {unknown} v @returns {import('./servis-govdesi.mjs').Alan[]}
 */
export function jsonAlanlari(v) {
  const kaynak = Array.isArray(v) ? v[0] : v;
  if (!kaynak || typeof kaynak !== 'object' || Array.isArray(kaynak)) return [];
  return Object.entries(kaynak).filter(([k]) => PARCA.test(k)).map(([k, d]) => {
    const coklu = Array.isArray(d);
    const ic = coklu ? d[0] : d;
    if (ic && typeof ic === 'object') return { ad: k, cocuklar: jsonAlanlari(ic), ...(coklu ? { coklu: true } : {}) };
    return { ad: k, tip: tipi(ic), ...(coklu ? { coklu: true } : {}) };
  });
}

/**
 * Uçtan alan şeması (yol / sorgu / govde grupları; boş grup yazılmaz).
 * @param {{ ad: string; yol?: string; sorgu?: Array<{ ad: string }>; govdeOrnegi?: string; icerikTuru?: string }} uc
 * @returns {import('./servis-govdesi.mjs').OperasyonSemasi}
 */
export function restSemasi(uc) {
  /** @type {import('./servis-govdesi.mjs').Alan[]} */
  const alanlar = [];
  const yol = yolYerTutuculari(uc.yol ?? '');
  if (yol.length) alanlar.push({ ad: 'yol', cocuklar: yol.map((ad) => ({ ad, tip: 'metin', zorunlu: true })) });
  const sorgu = [...new Set((uc.sorgu ?? []).map((x) => x.ad).filter((x) => PARCA.test(x)))];
  if (sorgu.length) alanlar.push({ ad: 'sorgu', cocuklar: sorgu.map((ad) => ({ ad, tip: 'metin' })) });
  let ornek;
  try { ornek = /json/i.test(uc.icerikTuru ?? 'json') ? govdeOrnegiCoz(uc.govdeOrnegi ?? '') : undefined; } catch { ornek = undefined; }
  const govde = jsonAlanlari(ornek);
  if (govde.length) alanlar.push({ ad: 'govde', cocuklar: govde });
  return { ad: uc.ad, kok: '', ns: '', alanlar };
}

/**
 * Başlangıç senaryosu şablonu. ref(yol): alanın tablo başvurusu ("Tablo.Sütun") ya da undefined; gizli: örnek değeri yazılmayacak
 * alan yolları. Bağlı olmayan yol yer tutucusu ${ad} parametresi olur (koşuda değeri istenir).
 * @param {{ yol?: string; sorgu?: Array<{ ad: string; deger: string }>; govdeOrnegi?: string; icerikTuru?: string }} uc
 * @param {{ ref: (yol: string) => string | undefined; gizli?: ReadonlySet<string> }} s
 */
export function baslangicSablonu(uc, s) {
  const gizli = s.gizli ?? new Set();
  const yol = String(uc.yol ?? '').replace(YER_TUTUCU, (_m, ad) => `\${${s.ref(`yol/${ad}`) ?? ad}}`);
  const sorgu = (uc.sorgu ?? []).filter((x) => x.ad).map((x) => {
    const r = PARCA.test(x.ad) ? s.ref(`sorgu/${x.ad}`) : undefined;
    const d = r ? `\${${r}}` : gizli.has(`sorgu/${x.ad}`) ? '' : x.deger;
    return `${encodeURIComponent(x.ad)}=${r ? d : encodeURIComponent(d)}`;
  }).join('&');
  let govde = '';
  const ham = String(uc.govdeOrnegi ?? '').trim();
  if (ham && /json/i.test(uc.icerikTuru ?? 'json')) {
    const ornek = govdeOrnegiCoz(ham);
    /** @param {unknown} v @param {string} yolu @returns {unknown} */
    const donustur = (v, yolu) => {
      if (Array.isArray(v)) return v.length ? [donustur(v[0], yolu)] : [];
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, d]) => [k, PARCA.test(k) ? donustur(d, `${yolu}/${k}`) : d]));
      }
      const r = s.ref(yolu);
      if (r) return typeof v === 'string' ? `\${${r}}` : `${HAM}\${${r}}${HAM}`;
      if (gizli.has(yolu)) return typeof v === 'string' ? '' : null;
      return v;
    };
    govde = JSON.stringify(donustur(ornek, 'govde'), null, 2).replace(new RegExp(`"${HAM}(.*?)${HAM}"`, 'g'), '$1');
  } else govde = ham;
  return { yol: `${yol}${sorgu ? `?${sorgu}` : ''}`, govde };
}
