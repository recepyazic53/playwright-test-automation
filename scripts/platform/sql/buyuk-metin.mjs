// BÜYÜK METİN SÜTUNLARI (genel, saf; ORTAK: sunucu sürücü katmanı ve arayüz — /arayuz/buyuk-metin.mjs olarak da sunulur, HİÇBİR
// modül içe aktarmaz). İki iş:
//  1) Sorgu hücresinin metne çevrilmesi (sürücü katmanı: veritabani-suruculeri.mjs; özet panosu SQL kartı ve SQL adımı aynı yoldan geçer):
//     - Oracle CLOB / NCLOB: sürücüde metin olarak alınır (fetchTypeHandler); yine de Lob nesnesi (getData) gelirse okunur.
//     - PostgreSQL text, MySQL TEXT / LONGTEXT, SQL Server nvarchar(max) / ntext: metin gelir, dokunulmaz; Buffer / Uint8Array gelirse
//       sütun metin türündeyse (ya da türü bilinmiyor ve bayt dizisi geçerli UTF-8 ve NUL içermiyorsa) metne çevrilir.
//     - Hücre başına üst sınır HUCRE_METIN_SINIRI (100 KB, UTF-8 bayt): aşılırsa kesilir, sonuna KESILDI_EKI eklenir.
//     - BLOB / ikili veri metin değildir: "(ikili veri, N bayt)".
//     - Diğer nesneler (ör. PostgreSQL json) JSON metnine çevrilir. Sayı, mantıksal değer olduğu gibi kalır.
//  2) Arayüz yardımcıları: tek satır önizleme, XML / JSON girintili biçim, gövde gibi mi, SOAP kök / işlem adı, metot önerisi,
//     satırdan durum (ISSUCCESS benzeri) ve zaman önerisi.
// NOT: import.meta KULLANILMAZ.

/** Hücre başına en çok bayt (UTF-8). */
export const HUCRE_METIN_SINIRI = 100 * 1024;
export const KESILDI_EKI = '…(kesildi)';
/** Tablo hücresinde bu uzunluktan uzun metin tek satır kısaltılır ("Görüntüle" ile tamamı). */
export const ONIZLEME_SINIRI = 120;

/** @param {number} n */
export const ikiliVeriMetni = (n) => `(ikili veri, ${n} bayt)`;

const kodlayici = new TextEncoder();

/**
 * Metni bayt sınırına göre keser (UTF-8; çok baytlı karakter bölünmez), kesildiyse sonuna KESILDI_EKI.
 * @param {string} s @param {number} [sinir]
 */
export function metinSinirla(s, sinir = HUCRE_METIN_SINIRI) {
  if (s.length * 3 <= sinir) return s;
  const b = kodlayici.encode(s);
  if (b.length <= sinir) return s;
  const kesik = new TextDecoder('utf-8').decode(b.subarray(0, sinir)).replace(/�+$/, '');
  return `${kesik}${KESILDI_EKI}`;
}

/** Bayt dizisi mi (Buffer, Uint8Array, ArrayBuffer)? @param {unknown} v @returns {Uint8Array | null} */
function baytlar(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return null;
}

/** Bayt dizisi metin değil mi (NUL içeriyor ya da geçerli UTF-8 değil)? @param {Uint8Array} b */
export function ikiliMi(b) {
  if (b.includes(0)) return true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return false; } catch { return true; }
}

/**
 * Bayt dizisi → hücre metni. ikili: sütun türü ikili (true) / metin (false) / bilinmiyor (undefined: içeriğe bakılır).
 * @param {Uint8Array} b @param {boolean | undefined} ikili
 */
function baytMetni(b, ikili) {
  if (ikili === true || (ikili === undefined && ikiliMi(b))) return ikiliVeriMetni(b.length);
  return metinSinirla(new TextDecoder('utf-8').decode(b));
}

/**
 * Tek hücreyi JSON'a uygun değere çevirir. Lob (getData) nesnesi okunur (Promise döner); diğerleri eşzamanlı.
 * @param {unknown} v @param {{ ikili?: boolean }} [s] @returns {unknown}
 */
export function hucreyiDuzenle(v, s = {}) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return metinSinirla(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const b = baytlar(v);
  if (b) return baytMetni(b, s.ikili);
  if (typeof v === 'object' && typeof (/** @type {any} */ (v).getData) === 'function') {
    const lob = /** @type {{ getData: () => Promise<unknown>; destroy?: () => void }} */ (v);
    return Promise.resolve().then(() => lob.getData()).then((d) => {
      try { lob.destroy?.(); } catch { /* okundu; kapatma hatası önemsiz */ }
      if (d === null || d === undefined) return null;
      if (typeof d === 'string') return metinSinirla(d);
      const ham = baytlar(d);
      // Lob'un baytları BLOB'dur (CLOB metin döner): ikili sayılır.
      return ham ? baytMetni(ham, s.ikili ?? true) : metinSinirla(String(d));
    });
  }
  if (typeof v === 'object') {
    try { const j = JSON.stringify(v); return j === undefined ? null : metinSinirla(j); } catch { return metinSinirla(String(v)); }
  }
  return metinSinirla(String(v));
}

/**
 * Satırların hücrelerini düzenler (Lob okumaları beklenir). ikiliSutunlar[i]: i. sütunun türü ikili mi (bilinmiyorsa undefined).
 * @param {unknown[][]} satirlar @param {ReadonlyArray<boolean | undefined>} [ikiliSutunlar] @returns {Promise<unknown[][]>}
 */
export async function satirlariDuzenle(satirlar, ikiliSutunlar = []) {
  /** @type {unknown[][]} */
  const cikti = [];
  for (const r of satirlar) {
    const yeni = (Array.isArray(r) ? r : []).map((v, i) => hucreyiDuzenle(v, { ikili: ikiliSutunlar[i] }));
    cikti.push(yeni.some((x) => x instanceof Promise) ? await Promise.all(yeni) : yeni);
  }
  return cikti;
}

// ---------------------------------------------------------------------------------------
// Arayüz yardımcıları (saf)
// ---------------------------------------------------------------------------------------

/** Tablo hücresinde kısaltılacak uzun metin mi? @param {unknown} v */
export const uzunMetinMi = (v) => typeof v === 'string' && v.length > ONIZLEME_SINIRI;

/** Tek satır önizleme: boşluklar teke iner, n karakterden uzunsa "…" ile biter. @param {string} s @param {number} [n] */
export function metinKisalt(s, n = ONIZLEME_SINIRI) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, Math.max(1, n - 1)).trimEnd()}…` : t;
}

/** XML parçaları: CDATA, yorum, işlem yönergesi, DOCTYPE, etiket, metin. */
const XML_PARCA = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?[A-Za-z_][^<>]*>|[^<]+/g;

/**
 * XML'i parçalara ayırır ve etiket dengesini denetler; iyi biçimli değilse null.
 * @param {string} s @returns {Array<{ t: 'ac' | 'kapa' | 'tek' | 'metin' | 'diger'; m: string; ad?: string }> | null}
 */
function xmlParcala(s) {
  const metin = s.trim();
  if (!metin.startsWith('<') || !metin.endsWith('>')) return null;
  /** @type {Array<{ t: 'ac' | 'kapa' | 'tek' | 'metin' | 'diger'; m: string; ad?: string }>} */
  const parcalar = [];
  /** @type {string[]} */
  const yigin = [];
  let uzunluk = 0;
  let kok = 0;
  for (const e of metin.matchAll(XML_PARCA)) {
    const m = e[0];
    uzunluk += m.length;
    if (m.startsWith('<![CDATA[') || m.startsWith('<!--') || m.startsWith('<?') || m.startsWith('<!')) { parcalar.push({ t: 'diger', m }); continue; }
    if (m.startsWith('</')) {
      const ad = m.slice(2, -1).trim();
      if (yigin.pop() !== ad) return null;
      parcalar.push({ t: 'kapa', m, ad });
      continue;
    }
    if (m.startsWith('<')) {
      const ad = (/^<([^\s/>]+)/.exec(m) ?? [])[1] ?? '';
      if (!ad) return null;
      if (!yigin.length) kok++;
      if (m.endsWith('/>')) parcalar.push({ t: 'tek', m, ad });
      else { yigin.push(ad); parcalar.push({ t: 'ac', m, ad }); }
      continue;
    }
    if (!yigin.length && m.trim()) return null;
    parcalar.push({ t: 'metin', m });
  }
  if (uzunluk !== metin.length || yigin.length || kok !== 1) return null;
  return parcalar;
}

/** İyi biçimli XML'i girintiler (2 boşluk); değilse null. @param {string} s */
function xmlGirintile(s) {
  const p = xmlParcala(s);
  if (!p) return null;
  /** @type {string[]} */
  const satirlar = [];
  let d = 0;
  const pay = () => '  '.repeat(d);
  for (let i = 0; i < p.length; i++) {
    const x = p[i];
    if (x.t === 'metin') { if (x.m.trim()) satirlar.push(pay() + x.m.trim()); continue; }
    if (x.t === 'ac') {
      // <a>metin</a> tek satırda.
      const a = p[i + 1]; const b = p[i + 2];
      if (a && a.t === 'kapa') { satirlar.push(pay() + x.m + a.m); i += 1; continue; }
      if (a && b && a.t === 'metin' && b.t === 'kapa') { satirlar.push(pay() + x.m + a.m.trim() + b.m); i += 2; continue; }
      satirlar.push(pay() + x.m);
      d++;
      continue;
    }
    if (x.t === 'kapa') { d = Math.max(0, d - 1); satirlar.push(pay() + x.m); continue; }
    satirlar.push(pay() + x.m.trim());
  }
  return satirlar.join('\n');
}

/** JSON nesnesi / dizisi mi (ayrıştırılmış değer; değilse undefined)? @param {string} s */
function jsonCoz(s) {
  const t = s.trim();
  if (!(t.startsWith('{') && t.endsWith('}')) && !(t.startsWith('[') && t.endsWith(']'))) return undefined;
  try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : undefined; } catch { return undefined; }
}

/**
 * Metni görüntüleme için biçimler: JSON → 2 boşluk girintili, XML → girintili; biçimlenemezse ham metin.
 * @param {string} s @returns {{ metin: string; tur: 'json' | 'xml' | 'duz'; bicimlendi: boolean }}
 */
export function metniBicimle(s) {
  const ham = String(s ?? '');
  const j = jsonCoz(ham);
  if (j !== undefined) return { metin: JSON.stringify(j, null, 2), tur: 'json', bicimlendi: true };
  const x = ham.trim().startsWith('<') ? xmlGirintile(ham) : null;
  if (x !== null) return { metin: x, tur: 'xml', bicimlendi: true };
  return { metin: ham, tur: 'duz', bicimlendi: false };
}

/** Metin bir istek / yanıt gövdesi gibi mi (iyi biçimli XML ya da JSON nesnesi / dizisi)? @param {unknown} s */
export function govdeGibiMi(s) {
  if (typeof s !== 'string' || s.length < 2) return false;
  return jsonCoz(s) !== undefined || xmlParcala(s) !== null;
}

/** Öneksiz yerel ad. @param {string} ad */
const yerel = (ad) => ad.slice(ad.indexOf(':') + 1);

/**
 * Gövdenin kök / işlem adı: SOAP zarfında Body'nin ilk öğesi, zarfsız XML'de kök öğe (öneksiz), JSON'da tek anahtarlı nesnenin anahtarı.
 * @param {string} s @returns {string}
 */
export function govdeKokAdi(s) {
  const p = xmlParcala(String(s ?? ''));
  if (p) {
    const ogeler = p.filter((x) => x.t === 'ac' || x.t === 'tek');
    if (!ogeler.length) return '';
    if (yerel(ogeler[0].ad ?? '') !== 'Envelope') return yerel(ogeler[0].ad ?? '');
    const i = p.findIndex((x) => x.t === 'ac' && yerel(x.ad ?? '') === 'Body');
    const islem = i >= 0 ? p.slice(i + 1).find((x) => x.t === 'ac' || x.t === 'tek' || x.t === 'kapa') : null;
    return islem && islem.t !== 'kapa' ? yerel(islem.ad ?? '') : '';
  }
  const j = jsonCoz(String(s ?? ''));
  if (j && !Array.isArray(j)) { const k = Object.keys(j); return k.length === 1 ? k[0] : ''; }
  return '';
}

/** Karşılaştırma için ad: küçük harf, ayraçsız; sondaki Request / Response / Input / Output ekleri atılır. @param {string} ad */
const adNormal = (ad) => String(ad).toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '').replace(/(request|response|req|resp|input|output)$/, '');

/**
 * Gövdenin kök adına göre metot önerisi (ör. <Approve> ya da <ApproveRequest> → "Approve"). Bulunamazsa null.
 * @param {string} kok @param {ReadonlyArray<string>} metotlar @returns {string | null}
 */
export function metotOner(kok, metotlar) {
  if (!kok) return null;
  const tam = metotlar.find((m) => m.toLocaleLowerCase('en') === kok.toLocaleLowerCase('en'));
  if (tam) return tam;
  const k = adNormal(kok);
  if (!k) return null;
  return metotlar.find((m) => adNormal(m) === k) ?? null;
}

/** Durum sütunu adı (ISSUCCESS, IS_SUCCESS, SUCCESS, BASARILI …). */
const DURUM_SUTUNU = /^(is)?(success|successful|succeeded|basarili|basari|basarilimi)$/;
const OLUMLU = /^(1|true|t|y|yes|e|evet|ok|success|successful|basarili)$/i;
const OLUMSUZ = /^(0|false|f|n|no|h|hayir|hayır|fail|failed|failure|error|hata|basarisiz)$/i;

/**
 * Satırda ISSUCCESS benzeri sütun varsa önerilen durum (kullanıcı onaylar). Yoksa null.
 * @param {ReadonlyArray<string>} sutunlar @param {ReadonlyArray<unknown>} satir
 * @returns {{ durum: 'basarili' | 'hata'; sutun: string; deger: string } | null}
 */
export function durumOner(sutunlar, satir) {
  for (const [i, ad] of sutunlar.entries()) {
    if (!DURUM_SUTUNU.test(String(ad).toLocaleLowerCase('en').replace(/[^a-z]/g, ''))) continue;
    const v = satir[i];
    if (v === null || v === undefined) continue;
    const m = String(v).trim();
    if (OLUMLU.test(m)) return { durum: 'basarili', sutun: String(ad), deger: m };
    if (OLUMSUZ.test(m)) return { durum: 'hata', sutun: String(ad), deger: m };
  }
  return null;
}

/** @param {number} n */
const iki = (n) => String(n).padStart(2, '0');

/**
 * Satırın zamanı (adı tarih / zaman / date / time / created içeren ve tarihe çevrilebilen ilk sütun): "gg.aa.yyyy ss:dd". Yoksa null.
 * @param {ReadonlyArray<string>} sutunlar @param {ReadonlyArray<unknown>} satir
 */
export function satirZamani(sutunlar, satir) {
  for (const [i, ad] of sutunlar.entries()) {
    if (!/(tarih|zaman|date|time|created|olusturma|kayit)/i.test(String(ad))) continue;
    const v = satir[i];
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) continue;
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) continue;
    return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
  }
  return null;
}
