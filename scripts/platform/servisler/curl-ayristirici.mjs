// SERVİS TESTLERİ — cURL komutu ayrıştırıcısı ("Servis ekle > cURL yapıştır"). ORTAK: sunucu ve arayüz kullanır
// (/arayuz/curl-ayristirici.mjs olarak sunulur); yalnız aynı klasördeki rest-semasi.mjs'i içe aktarır, Node modülü içe aktarmaz.
// SAF modül: ağ isteği yok, dosya okumaz, hiçbir şey yazmaz. Yapıştırılan metin hata / uyarı metinlerine YAZILMAZ (yalnız seçenek
// adları ve satır numaraları geçer); gizli değerler ayrıca işaretlenir (arayüz maskeler, kayıt kullanıcının onayına bağlıdır).
// - Biçimler: bash / sh (tek tırnak, çift tırnak, $'…', "\" ile satır devamı), Windows cmd ("^" satır devamı ve kaçış, ^" tırnağı;
//   tarayıcının "Copy as cURL (cmd)" çıktısı dahil), PowerShell'den kopyalanan curl.exe ("`" satır devamı ve kaçış, '' / "").
// - Birden çok komut: her "curl" ile başlayan komut bir istektir (satır sonu, ";", "&&", "|" komutları ayırır).
// - Desteklenen seçenekler: -X/--request, -H/--header, -d/--data/--data-ascii/--data-raw/--data-binary/--data-urlencode, --json,
//   -u/--user, -b/--cookie, -G/--get, -I/--head, --url, -A/--user-agent, -e/--referer, --oauth2-bearer. -F/--form ve dosyadan
//   veri (@dosya) DESTEKLENMEZ (uyarı). Çıktıyı etkilemeyen seçenekler (--compressed, -k, -L, -s, -v, zaman aşımları…) yok sayılır
//   (uyarı); tanınmayan seçenekler ayrı listede döner.
// - Çıktı: metot, köken (taban adres adayı) + yol, sorgu parametreleri, başlıklar, içerik türü, gövde (JSON ise alanlarıyla; form
//   ise alan listesiyle; değilse ham). SOAP gövdesi (text/xml, SOAPAction, Envelope) işaretlenir: WSDL yolu daha uygundur.
// - curlRestTaslagi: isteği REST sihirbazının uç taslağına çevirir. Gizli değer (Authorization / Cookie / -u / API anahtarı başlığı,
//   gizli adlı sorgu parametresi ya da gövde alanı) uçta YAZILMAZ: onaylanan değer ayrı döner (kayıtta şifreli tablo sütununa gider),
//   onaylanmayanın yalnız yeri döner (sütun boş kalır).
import { adresAyir, GOVDELI_METOTLAR, REST_METOTLARI } from './rest-semasi.mjs';

/** Önizlemede gizli değerin yerine yazılan maske. */
export const MASKE = '•••';
/** Yapıştırılan metnin üst sınırı (karakter) ve en çok komut sayısı. */
export const EN_COK_KARAKTER = 1_000_000;
export const EN_COK_KOMUT = 100;

/** Değeri her zaman gizli sayılan başlıklar ve ad parçaları (kullanıcının maskeli ad listesi gizliMi ile eklenir). */
const GIZLI_BASLIK = /^(?:authorization|proxy-authorization|cookie)$|api[-_]?key|token|secret|cookie|auth/i;
const GIZLI_ALAN = /password|passwd|parola|şifre|sifre|secret|token|api[-_]?key|apikey|authorization/i;
/** Koşucunun kendisi yazdığı başlıklar (alınmaz). */
const ATLANAN_BASLIKLAR = new Set(['content-length', 'host', 'connection', 'accept-encoding', 'transfer-encoding']);
const BASLIK_ADI = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;
/** REST alan yolu parçası (rest-semasi.mjs PARCA ile aynı). */
const PARCA = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;
const CURL = /^(?:.*[\\/])?curl(?:\.exe)?$/i;

export class CurlHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) { super(mesaj); this.name = 'CurlHatasi'; }
}

/**
 * @typedef {'bash' | 'cmd' | 'powershell'} CurlBicimi
 * @typedef {{ ad: string; deger: string; gizli: boolean }} CurlDegeri
 * @typedef {{ yol: string; ad: string; deger: string; gizli: boolean }} CurlGovdeAlani  yol: REST alan yolu (JSON: "govde/a/b"; form: ad)
 * @typedef {{ sira: number; metot: string; koken: string; yol: string; semaEklendi: boolean; sorgu: CurlDegeri[]; basliklar: CurlDegeri[];
 *   icerikTuru: string; govdeTuru: 'yok' | 'json' | 'form' | 'ham'; govde: string; govdeMaskeli: string; govdeGizlisiz: string;
 *   govdeAlanlari: CurlGovdeAlani[]; soap: boolean; uyarilar: string[]; yoksayilanlar: string[]; taninmayanlar: string[];
 *   desteklenmeyenler: string[] }} CurlIstegi
 * @typedef {{ bicim: CurlBicimi; istekler: CurlIstegi[] }} CurlCozumu
 * @typedef {{ gizliMi?: (ad: string) => boolean }} CurlSecenekleri
 */

// --- Biçim ve belirteçler ----------------------------------------------------------------------------------------------------------

/**
 * Metnin biçimi: cmd (^ satır devamı ya da ^" tırnağı), PowerShell (` satır devamı ya da curl.exe ile başlayan satır), yoksa bash.
 * @param {string} metin @returns {CurlBicimi}
 */
export function curlBicimi(metin) {
  const s = String(metin ?? '');
  if (/\^\r?\n|\^"/.test(s)) return 'cmd';
  if (/`\r?\n/.test(s)) return 'powershell';
  if (/(^|\n)[ \t]*(?:&[ \t]*)?curl\.exe\b/i.test(s) && !/\\\r?\n/.test(s)) return 'powershell';
  return 'bash';
}

/** Metnin k. karakterinin satır numarası (1'den). @param {string} s @param {number} k */
const satirNo = (s, k) => s.slice(0, k).split('\n').length;

/**
 * bash / sh sözcükleri. null = komut ayracı (satır sonu, ";", "&", "|").
 * @param {string} s @returns {Array<string | null>}
 */
function bashBelirtecleri(s) {
  /** @type {Array<string | null>} */
  const out = [];
  let t = '';
  let dolu = false;
  const bitir = () => { if (dolu) out.push(t); t = ''; dolu = false; };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\n') { i += 2; continue; }
      if (n === '\r' && s[i + 2] === '\n') { i += 3; continue; }
      if (n !== undefined) { t += n; dolu = true; }
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) throw new CurlHatasi(`${satirNo(s, i)}. satırda açılan tek tırnak (') kapanmamış; komutun sonu eksik olabilir.`);
      t += s.slice(i + 1, j);
      dolu = true;
      i = j + 1;
      continue;
    }
    if (c === '$' && s[i + 1] === "'") {
      const bas = i;
      i += 2;
      let kapandi = false;
      while (i < s.length) {
        const d = s[i];
        if (d === "'") { kapandi = true; i++; break; }
        if (d === '\\' && i + 1 < s.length) {
          const n = s[i + 1];
          const tek = /** @type {Record<string, string>} */ ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', v: '\v', '?': '?' })[n];
          if (tek !== undefined) { t += tek; i += 2; continue; }
          const hex = n === 'x' ? /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 2)) : n === 'u' ? /^[0-9a-fA-F]{1,4}/.exec(s.slice(i + 2)) : n === 'U' ? /^[0-9a-fA-F]{1,8}/.exec(s.slice(i + 2)) : null;
          if (hex) { t += String.fromCodePoint(parseInt(hex[0], 16)); i += 2 + hex[0].length; continue; }
          t += d;
          i++;
          continue;
        }
        t += d;
        i++;
      }
      if (!kapandi) throw new CurlHatasi(`${satirNo(s, bas)}. satırda açılan $'…' tırnağı kapanmamış; komutun sonu eksik olabilir.`);
      dolu = true;
      continue;
    }
    if (c === '"') {
      const bas = i;
      i++;
      let kapandi = false;
      while (i < s.length) {
        const d = s[i];
        if (d === '"') { kapandi = true; i++; break; }
        if (d === '\\' && i + 1 < s.length) {
          const n = s[i + 1];
          if (n === '\n') { i += 2; continue; }
          if (n === '\r' && s[i + 2] === '\n') { i += 3; continue; }
          if (n === '"' || n === '\\' || n === '$' || n === '`') { t += n; i += 2; continue; }
        }
        t += d;
        i++;
      }
      if (!kapandi) throw new CurlHatasi(`${satirNo(s, bas)}. satırda açılan çift tırnak (") kapanmamış; komutun sonu eksik olabilir.`);
      dolu = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { bitir(); i++; continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '&') { bitir(); out.push(null); i++; continue; }
    if (c === '#' && !dolu) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    t += c;
    dolu = true;
    i++;
  }
  bitir();
  return out;
}

/** cmd'de ^ + iki satır sonu: değerin içindeki satır sonu (tarayıcı çıktısı); ayrıştırma sonunda geri çevrilir. */
const CMD_SATIR = '\u0002';

/**
 * Windows cmd sözcükleri: önce cmd düzeyi (^ kaçışı, ^ + satır sonu devam; çift tırnak içinde ^ düz yazılır), sonra her satır
 * programın komut satırı kurallarıyla (çift tırnak gruplar, \" düz tırnak, "" tırnak içinde düz tırnak).
 * @param {string} s @returns {Array<string | null>}
 */
function cmdBelirtecleri(s) {
  let a = '';
  let tirnak = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!tirnak && c === '^') {
      const m = /^\^(\r?\n)(\r?\n)?/.exec(s.slice(i, i + 5));
      if (m) { if (m[2]) a += CMD_SATIR; i += m[0].length - 1; continue; }
      if (i + 1 < s.length) { a += s[i + 1]; i++; }
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') { tirnak = false; a += '\n'; continue; }
    if (c === '"') { tirnak = !tirnak; a += c; continue; }
    if (!tirnak && (c === '&' || c === '|')) { a += '\n'; continue; }
    a += c;
  }
  /** @type {Array<string | null>} */
  const out = [];
  const satirlar = a.split('\n');
  for (const [no, satir] of satirlar.entries()) {
    let t = '';
    let dolu = false;
    let q = false;
    let i = 0;
    const bitir = () => { if (dolu) out.push(t.replaceAll(CMD_SATIR, '\n')); t = ''; dolu = false; };
    while (i < satir.length) {
      const c = satir[i];
      if (c === '\\') {
        let n = 0;
        while (satir[i] === '\\') { n++; i++; }
        if (satir[i] === '"') {
          t += '\\'.repeat(Math.floor(n / 2));
          if (n % 2) { t += '"'; i++; }
        } else t += '\\'.repeat(n);
        dolu = true;
        continue;
      }
      if (c === '"') {
        if (q && satir[i + 1] === '"') { t += '"'; i += 2; continue; }
        q = !q;
        dolu = true;
        i++;
        continue;
      }
      if (!q && (c === ' ' || c === '\t')) { bitir(); i++; continue; }
      t += c;
      dolu = true;
      i++;
    }
    if (q) throw new CurlHatasi(`${no + 1}. satırda açılan çift tırnak (") kapanmamış; komutun sonu eksik olabilir.`);
    bitir();
    out.push(null);
  }
  return out;
}

/**
 * PowerShell sözcükleri: ` kaçış ve satır devamı; '…' düz ('' → '); "…" (` kaçışı, "" → "). Satır sonu, ";" ve "|" ayraçtır.
 * @param {string} s @returns {Array<string | null>}
 */
function psBelirtecleri(s) {
  /** @type {Array<string | null>} */
  const out = [];
  let t = '';
  let dolu = false;
  const bitir = () => { if (dolu) out.push(t); t = ''; dolu = false; };
  const kacis = (/** @type {string} */ n) => (/** @type {Record<string, string>} */ ({ n: '\n', t: '\t', r: '\r', 0: '\0' }))[n] ?? n;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '`') {
      const n = s[i + 1];
      if (n === '\n') { i += 2; continue; }
      if (n === '\r' && s[i + 2] === '\n') { i += 3; continue; }
      if (n !== undefined) { t += n; dolu = true; }
      i += 2;
      continue;
    }
    if (c === "'") {
      const bas = i;
      i++;
      let kapandi = false;
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { t += "'"; i += 2; continue; }
          kapandi = true;
          i++;
          break;
        }
        t += s[i];
        i++;
      }
      if (!kapandi) throw new CurlHatasi(`${satirNo(s, bas)}. satırda açılan tek tırnak (') kapanmamış; komutun sonu eksik olabilir.`);
      dolu = true;
      continue;
    }
    if (c === '"') {
      const bas = i;
      i++;
      let kapandi = false;
      while (i < s.length) {
        const d = s[i];
        if (d === '`' && i + 1 < s.length) { t += kacis(s[i + 1]); i += 2; continue; }
        if (d === '"') {
          if (s[i + 1] === '"') { t += '"'; i += 2; continue; }
          kapandi = true;
          i++;
          break;
        }
        t += d;
        i++;
      }
      if (!kapandi) throw new CurlHatasi(`${satirNo(s, bas)}. satırda açılan çift tırnak (") kapanmamış; komutun sonu eksik olabilir.`);
      dolu = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { bitir(); i++; continue; }
    if (c === '\n' || c === ';' || c === '|') { bitir(); out.push(null); i++; continue; }
    if (c === '#' && !dolu) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    t += c;
    dolu = true;
    i++;
  }
  bitir();
  return out;
}

// --- Seçenekler -------------------------------------------------------------------------------------------------------------------

/** Değer alan seçenekler → işlem. */
const DEGERLI = new Map([
  ['-X', 'istek'], ['--request', 'istek'],
  ['-H', 'baslik'], ['--header', 'baslik'],
  ['-d', 'veri'], ['--data', 'veri'], ['--data-ascii', 'veri'], ['--data-binary', 'veri'], ['--data-raw', 'veriHam'], ['--data-urlencode', 'veriKodla'],
  ['--json', 'json'],
  ['-u', 'kullanici'], ['--user', 'kullanici'],
  ['-b', 'cerez'], ['--cookie', 'cerez'],
  ['-F', 'form'], ['--form', 'form'], ['--form-string', 'form'],
  ['--url', 'adres'],
  ['-A', 'ajan'], ['--user-agent', 'ajan'],
  ['-e', 'referans'], ['--referer', 'referans'],
  ['--oauth2-bearer', 'bearer'],
  ['-T', 'yukle'], ['--upload-file', 'yukle'],
  ...['-o', '--output', '-m', '--max-time', '--connect-timeout', '--retry', '--retry-delay', '--retry-max-time', '-w', '--write-out', '-x', '--proxy',
    '-U', '--proxy-user', '--cacert', '--capath', '-E', '--cert', '--key', '--pass', '--cert-type', '--key-type', '-r', '--range', '--limit-rate',
    '--resolve', '--connect-to', '--interface', '--max-redirs', '--ciphers', '-D', '--dump-header', '-c', '--cookie-jar', '-K', '--config',
    '--aws-sigv4', '-z', '--time-cond', '--trace', '--trace-ascii', '--stderr', '-Y', '--speed-limit', '-y', '--speed-time', '--dns-servers',
    '--noproxy', '--local-port', '--expect100-timeout', '--keepalive-time', '--proto', '--proto-redir', '--request-target', '--unix-socket',
    '--abstract-unix-socket', '--max-filesize', '--output-dir', '--proxy-header', '--preproxy', '--variable', '--etag-save', '--etag-compare',
    '--sasl-authzid', '--login-options', '--mail-from', '--mail-rcpt', '--hostpubmd5', '--pinnedpubkey', '--tls-max', '--curves'
  ].map((x) => /** @type {[string, string]} */ ([x, 'yoksay']))
]);
/** Değer almayan seçenekler → işlem. */
const BAYRAKLAR = new Map([
  ['-G', 'get'], ['--get', 'get'], ['-I', 'head'], ['--head', 'head'], ['--basic', 'basic'],
  ['--digest', 'kimlik'], ['--ntlm', 'kimlik'], ['--negotiate', 'kimlik'], ['--anyauth', 'kimlik'],
  ['-k', 'tls'], ['--insecure', 'tls'],
  ...['--compressed', '-L', '--location', '--location-trusted', '-s', '--silent', '-S', '--show-error', '-v', '--verbose', '-i', '--include',
    '-f', '--fail', '--fail-with-body', '--fail-early', '-g', '--globoff', '-N', '--no-buffer', '--http0.9', '--http1.0', '--http1.1', '--http2',
    '--http2-prior-knowledge', '--http3', '--http3-only', '-0', '-1', '-2', '-3', '-4', '-6', '--tlsv1', '--tlsv1.0', '--tlsv1.1', '--tlsv1.2',
    '--tlsv1.3', '--ssl', '--ssl-reqd', '--ssl-no-revoke', '--ssl-revoke-best-effort', '--no-progress-meter', '-#', '--progress-bar', '-q',
    '--disable', '--path-as-is', '--raw', '--tr-encoding', '--no-keepalive', '--no-sessionid', '--no-alpn', '--no-npn', '--create-dirs', '-O',
    '--remote-name', '--remote-name-all', '-J', '--remote-header-name', '-n', '--netrc', '--netrc-optional', '-j', '--junk-session-cookies',
    '--styled-output', '--suppress-connect-headers', '--proxy-insecure', '--post301', '--post302', '--post303', '-Z', '--parallel',
    '--ipv4', '--ipv6', '--retry-connrefused', '--retry-all-errors', '--tcp-nodelay', '--tcp-fastopen', '--false-start', '--cert-status',
    '--doh-insecure', '--no-clobber', '--remove-on-error', '--xattr', '-M', '--manual', '-V', '--version', '-h', '--help'
  ].map((x) => /** @type {[string, string]} */ ([x, 'yoksay']))
]);

/** Adres gibi görünen sözcük (şemalı ya da ana makine adı / IP ile başlayan). @param {string} s */
const adresGibi = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s)
  || /^(?:localhost|\[[0-9a-f:.]+\]|[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)(?::\d+)?(?:[/?#]|$)/iu.test(s);

/** UTF-8 metnin base64'ü (tarayıcıda ve Node'da). @param {string} s */
function base64(s) {
  let ikili = '';
  for (const b of new TextEncoder().encode(s)) ikili += String.fromCharCode(b);
  return btoa(ikili);
}

/** application/x-www-form-urlencoded çözümü ("+" boşluk). @param {string} s */
function formCoz(s) {
  return s.split('&').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    const coz = (/** @type {string} */ x) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } };
    return i < 0 ? { ad: coz(p), deger: '' } : { ad: coz(p.slice(0, i)), deger: coz(p.slice(i + 1)) };
  });
}

/**
 * Metin JSON mu (PowerShell 5.1'den kalan \" kaçışları da denenir). Değer ve kullanılan metin döner; değilse null.
 * @param {string} s @returns {{ deger: unknown; metin: string } | null}
 */
function jsonCoz(s) {
  const t = s.trim();
  if (!/^[[{]/.test(t)) return null;
  try { return { deger: JSON.parse(t), metin: s }; } catch { /* aşağıda */ }
  const kacissiz = t.replace(/\\"/g, '"');
  try { return { deger: JSON.parse(kacissiz), metin: kacissiz }; } catch { return null; }
}

/**
 * JSON gövdenin yaprak alanları (REST alan yolu: "govde/a/b"; dizilerde tüm elemanlar aynı yolda) ve gizlileri değiştirilmiş kopyaları.
 * @param {unknown} v @param {(ad: string) => boolean} gizliMi
 */
function jsonAlanlariVeKopyalar(v, gizliMi) {
  /** @type {CurlGovdeAlani[]} */
  const alanlar = [];
  const gorulen = new Set();
  let gizliVar = false;
  /** @param {unknown} x @param {string} yol @param {string} ad @param {boolean} gizli @param {'maske' | 'bos' | null} kip @returns {unknown} */
  const gez = (x, yol, ad, gizli, kip) => {
    if (Array.isArray(x)) return x.map((e) => gez(e, yol, ad, gizli, kip));
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.entries(x).map(([k, d]) => [k, gez(d, `${yol}/${k}`, k, gizli || gizliMi(k), kip)]));
    }
    if (!kip && !gorulen.has(yol) && yol !== 'govde') {
      gorulen.add(yol);
      alanlar.push({ yol, ad, deger: typeof x === 'string' ? x : JSON.stringify(x), gizli });
    }
    if (!gizli) return x;
    gizliVar = true;
    if (kip === 'maske') return MASKE;
    if (kip === 'bos') return typeof x === 'string' ? '' : null;
    return x;
  };
  gez(v, 'govde', '', false, null);
  const maskeli = gez(v, 'govde', '', false, 'maske');
  const bos = gez(v, 'govde', '', false, 'bos');
  return { alanlar, gizliVar, maskeli: JSON.stringify(maskeli, null, 2), bos: JSON.stringify(bos, null, 2) };
}

/** Ham (XML / metin) gövdede adı gizli öğelerin değeri: <parola>…</parola> → yerine. @param {string} s @param {(ad: string) => boolean} gizliMi @param {string} yerine */
const xmlGizlileri = (s, gizliMi, yerine) => s.replace(/<((?:[\w.-]+:)?([\w.-]+))(\s[^<>]*)?>([^<]*)<\/\1\s*>/g,
  (m, tam, ad, ek, deger) => (gizliMi(ad) && deger ? `<${tam}${ek ?? ''}>${yerine}</${tam}>` : m));

/**
 * Tek komutun sözcüklerinden istek.
 * @param {string[]} args "curl" hariç @param {number} sira 1'den @param {CurlSecenekleri} secenekler @returns {CurlIstegi}
 */
function komutCoz(args, sira, secenekler) {
  const ek = secenekler.gizliMi ?? (() => false);
  const baslikGizliMi = (/** @type {string} */ ad) => GIZLI_BASLIK.test(ad) || ek(ad);
  const alanGizliMi = (/** @type {string} */ ad) => GIZLI_ALAN.test(ad) || ek(ad);
  const yer = `${sira}. komut`;
  /** @type {string[]} */ const uyarilar = [];
  /** @type {Set<string>} */ const yoksayilanlar = new Set();
  /** @type {Set<string>} */ const taninmayanlar = new Set();
  /** @type {Set<string>} */ const desteklenmeyenler = new Set();
  /** @type {Array<{ ad: string; deger: string }>} */ const basliklar = [];
  /** @type {string[]} */ const veriler = [];
  /** @type {string[]} */ const cerezler = [];
  /** @type {string[]} */ const konumlu = [];
  let acikMetot = '';
  let adres = '';
  let kullanici = '';
  let get = false;
  let head = false;
  let json = false;
  let form = false;
  let yukle = false;
  let bearer = '';

  /** @param {string} islem @param {string} ad @param {string} v */
  const degerli = (islem, ad, v) => {
    switch (islem) {
      case 'istek': acikMetot = v.trim().toUpperCase(); break;
      case 'baslik': {
        if (v.startsWith('@')) { desteklenmeyenler.add(`${ad} @dosya (başlıklar dosyadan)`); break; }
        const i = v.indexOf(':');
        if (i < 0) {
          if (v.trim().endsWith(';') && BASLIK_ADI.test(v.trim().slice(0, -1))) basliklar.push({ ad: v.trim().slice(0, -1), deger: '' });
          else uyarilar.push(`Bir başlık "Ad: değer" biçiminde değil; alınmadı.`);
          break;
        }
        const b = v.slice(0, i).trim();
        const d = v.slice(i + 1).trim();
        if (!BASLIK_ADI.test(b) || /[\r\n]/.test(d)) { uyarilar.push('Geçersiz adlı ya da çok satırlı bir başlık alınmadı.'); break; }
        if (!d) break; // curl'de "Ad:" başlığı kaldırır
        basliklar.push({ ad: b, deger: d });
        break;
      }
      case 'veri':
        if (v.startsWith('@')) { desteklenmeyenler.add(`${ad} @dosya (veri dosyadan)`); break; }
        veriler.push(v);
        break;
      case 'veriHam': veriler.push(v); break;
      case 'veriKodla': {
        const i = v.indexOf('=');
        const at = v.indexOf('@');
        if (at >= 0 && (i < 0 || at < i)) { desteklenmeyenler.add(`${ad} @dosya (veri dosyadan)`); break; }
        veriler.push(i < 0 ? encodeURIComponent(v) : `${v.slice(0, i)}${i ? '=' : ''}${encodeURIComponent(v.slice(i + 1))}`);
        break;
      }
      case 'json':
        if (v.startsWith('@')) { desteklenmeyenler.add(`${ad} @dosya (veri dosyadan)`); break; }
        veriler.push(v);
        json = true;
        break;
      case 'kullanici': kullanici = v; break;
      case 'cerez':
        if (v.includes('=')) cerezler.push(v.trim().replace(/;\s*$/, ''));
        else desteklenmeyenler.add(`${ad} dosya (çerez dosyası)`);
        break;
      case 'form': form = true; desteklenmeyenler.add(`${ad} (multipart/form-data gövdesi)`); break;
      case 'adres': adres ||= v.trim(); if (adres !== v.trim()) uyarilar.push('Birden çok adres var; yalnız ilki alındı.'); break;
      case 'ajan': basliklar.push({ ad: 'User-Agent', deger: v }); break;
      case 'referans': basliklar.push({ ad: 'Referer', deger: v.replace(/;auto$/, '') }); break;
      case 'bearer': bearer = v.trim(); break;
      case 'yukle': yukle = true; desteklenmeyenler.add(`${ad} (dosya yükleme)`); break;
      default: yoksayilanlar.add(ad);
    }
  };
  /** @param {string} islem @param {string} ad */
  const bayrak = (islem, ad) => {
    if (islem === 'get') get = true;
    else if (islem === 'head') head = true;
    else if (islem === 'basic') { /* -u zaten Basic */ } else if (islem === 'kimlik') desteklenmeyenler.add(`${ad} (yalnız Basic kimlik doğrulaması alınır)`);
    else yoksayilanlar.add(ad);
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const sonraki = () => {
      if (i + 1 >= args.length) throw new CurlHatasi(`${yer}: ${a} seçeneğinin değeri eksik.`);
      return args[++i];
    };
    if (a === '--') { konumlu.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const esit = a.indexOf('=');
      const ad = DEGERLI.has(a) || BAYRAKLAR.has(a) || esit < 0 ? a : a.slice(0, esit);
      if (DEGERLI.has(ad)) { degerli(/** @type {string} */ (DEGERLI.get(ad)), ad, ad === a ? sonraki() : a.slice(esit + 1)); continue; }
      if (BAYRAKLAR.has(a)) { bayrak(/** @type {string} */ (BAYRAKLAR.get(a)), a); continue; }
      if (a.startsWith('--no-') && BAYRAKLAR.has(`--${a.slice(5)}`)) { yoksayilanlar.add(a); continue; }
      taninmayanlar.add(ad);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const ad = `-${a[k]}`;
        if (DEGERLI.has(ad)) {
          const kalan = a.slice(k + 1);
          degerli(/** @type {string} */ (DEGERLI.get(ad)), ad, kalan || sonraki());
          break;
        }
        if (BAYRAKLAR.has(ad)) { bayrak(/** @type {string} */ (BAYRAKLAR.get(ad)), ad); continue; }
        taninmayanlar.add(ad);
        break;
      }
      continue;
    }
    konumlu.push(a);
  }
  if (!adres) {
    const aday = konumlu.find(adresGibi);
    if (aday) adres = aday;
  }
  const fazla = konumlu.filter((x) => x !== adres).length;
  if (fazla) uyarilar.push(`${fazla} değer anlaşılamadı ve yok sayıldı (tanınmayan bir seçeneğin değeri ya da ikinci bir adres olabilir).`);
  if (!adres) throw new CurlHatasi(`${yer}: adres yok (https://… ya da --url ile yazın).`);

  // --- Adres ---
  let tamAdres = adres.replace(/#.*$/, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(tamAdres)) { tamAdres = `http://${tamAdres}`; uyarilar.push('Adreste şema yok; curl gibi http:// varsayıldı.'); }
  /** @type {URL} */
  let url;
  try { url = new URL(tamAdres); } catch { throw new CurlHatasi(`${yer}: adres anlaşılamadı.`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CurlHatasi(`${yer}: yalnız http:// ve https:// adresleri alınır.`);
  if (url.username || url.password) {
    if (!kullanici) kullanici = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    uyarilar.push('Adresteki kullanıcı adı / parola Authorization başlığına taşındı.');
    url.username = '';
    url.password = '';
  }
  /** @type {{ koken: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; semaEklendi: boolean }} */
  let parca;
  try { parca = adresAyir(url.href); } catch { throw new CurlHatasi(`${yer}: adres anlaşılamadı.`); }
  const yol = parca.yol.replace(/\s/g, (b) => encodeURIComponent(b));
  const sorgu = [...parca.sorgu];

  // --- Kimlik, çerez ---
  const baslikVar = (/** @type {string} */ ad) => basliklar.some((b) => b.ad.toLowerCase() === ad.toLowerCase());
  if (kullanici) {
    if (baslikVar('Authorization')) uyarilar.push('-u / --user yok sayıldı: Authorization başlığı zaten var.');
    else {
      if (!kullanici.includes(':')) uyarilar.push('-u / --user değerinde parola yok (curl parolayı sorardı); boş parolayla alındı.');
      basliklar.push({ ad: 'Authorization', deger: `Basic ${base64(kullanici.includes(':') ? kullanici : `${kullanici}:`)}` });
    }
  }
  if (bearer && !baslikVar('Authorization')) basliklar.push({ ad: 'Authorization', deger: `Bearer ${bearer}` });
  if (cerezler.length) {
    const i = basliklar.findIndex((b) => b.ad.toLowerCase() === 'cookie');
    if (i >= 0) basliklar[i].deger = `${basliklar[i].deger}; ${cerezler.join('; ')}`;
    else basliklar.push({ ad: 'Cookie', deger: cerezler.join('; ') });
  }

  // --- İçerik türü, atlanan başlıklar ---
  let icerikTuru = '';
  /** @type {string[]} */
  const atlanan = [];
  const kalanBasliklar = basliklar.filter((b) => {
    const k = b.ad.toLowerCase();
    if (k === 'content-type') { icerikTuru = b.deger; return false; }
    if (ATLANAN_BASLIKLAR.has(k)) { atlanan.push(b.ad); return false; }
    return true;
  });
  if (atlanan.length) uyarilar.push(`Koşucunun kendisi yazdığı başlıklar alınmadı: ${[...new Set(atlanan)].join(', ')}.`);

  // --- Metot ve gövde ---
  let govde = veriler.join('&');
  const metot = acikMetot || (head ? 'HEAD' : get ? 'GET' : veriler.length || form ? 'POST' : yukle ? 'PUT' : 'GET');
  if (get && veriler.length) {
    sorgu.push(...formCoz(govde));
    govde = '';
  }
  if (json) {
    icerikTuru ||= 'application/json';
    if (!kalanBasliklar.some((b) => b.ad.toLowerCase() === 'accept')) kalanBasliklar.push({ ad: 'Accept', deger: 'application/json' });
  }
  /** @type {CurlIstegi['govdeTuru']} */
  let govdeTuru = 'yok';
  /** @type {CurlGovdeAlani[]} */
  let govdeAlanlari = [];
  let govdeMaskeli = govde;
  let govdeGizlisiz = govde;
  if (govde) {
    const j = !icerikTuru || /json/i.test(icerikTuru) ? jsonCoz(govde) : null;
    if (j) {
      if (!icerikTuru) {
        icerikTuru = 'application/json';
        uyarilar.push('İçerik türü yazılmamış; gövde JSON olduğu için application/json alındı (curl form olarak gönderirdi).');
      }
      govdeTuru = 'json';
      govde = j.metin.trim();
      const x = jsonAlanlariVeKopyalar(j.deger, alanGizliMi);
      govdeAlanlari = x.alanlar;
      govdeMaskeli = x.gizliVar ? x.maskeli : govde;
      govdeGizlisiz = x.gizliVar ? x.bos : govde;
    } else if (/json/i.test(icerikTuru)) {
      uyarilar.push('İçerik türü JSON ama gövde geçerli JSON değil; gövde ham olarak alındı.');
      govdeTuru = 'ham';
    } else if (!icerikTuru || /x-www-form-urlencoded/i.test(icerikTuru)) {
      icerikTuru ||= 'application/x-www-form-urlencoded';
      govdeTuru = 'form';
      const alanlar = formCoz(govde);
      govdeAlanlari = alanlar.map((x) => ({ yol: x.ad, ad: x.ad, deger: x.deger, gizli: alanGizliMi(x.ad) }));
      if (govdeAlanlari.some((x) => x.gizli)) {
        const yaz = (/** @type {string} */ yerine) => govdeAlanlari.map((x) => `${encodeURIComponent(x.ad)}=${x.gizli ? yerine : encodeURIComponent(x.deger)}`).join('&');
        govdeMaskeli = yaz(MASKE);
        govdeGizlisiz = yaz('');
      }
    } else govdeTuru = 'ham';
    if (govdeTuru === 'ham') {
      govdeMaskeli = xmlGizlileri(govde, alanGizliMi, MASKE);
      govdeGizlisiz = xmlGizlileri(govde, alanGizliMi, '');
    }
  }
  const soap = /soap/i.test(icerikTuru) || kalanBasliklar.some((b) => b.ad.toLowerCase() === 'soapaction')
    || (/xml/i.test(icerikTuru) && /<(?:[\w.-]+:)?Envelope[\s>]/.test(govde)) || /<(?:[\w.-]+:)?Envelope[\s>][\s\S]*schemas\.xmlsoap\.org|soap-envelope/i.test(govde);
  if (soap) uyarilar.push('SOAP isteğine benziyor: WSDL adresi biliniyorsa "Adım adım > SOAP (WSDL)" yolu daha uygun (metotlar ve alanlar WSDL\'den gelir). Yine de ham gövdeyle REST isteği olarak devam edebilirsiniz.');
  if (yoksayilanlar.has('-k') || yoksayilanlar.has('--insecure')) uyarilar.push('-k / --insecure yok sayıldı: TLS doğrulamasını kapatmak gerekirse servisin 1. adımından kapatın.');

  return {
    sira, metot, koken: parca.koken, yol, semaEklendi: parca.semaEklendi,
    sorgu: sorgu.map((x) => ({ ...x, gizli: alanGizliMi(x.ad) })),
    basliklar: kalanBasliklar.map((b) => ({ ...b, gizli: baslikGizliMi(b.ad) })),
    icerikTuru, govdeTuru, govde, govdeMaskeli, govdeGizlisiz, govdeAlanlari, soap,
    uyarilar: [...new Set(uyarilar)], yoksayilanlar: [...yoksayilanlar], taninmayanlar: [...taninmayanlar], desteklenmeyenler: [...desteklenmeyenler]
  };
}

/**
 * Yapıştırılan metni (bir ya da daha çok curl komutu) çözer. Hata: CurlHatasi (metnin kendisini içermez).
 * @param {string} metin @param {CurlSecenekleri} [secenekler] @returns {CurlCozumu}
 */
export function curlAyristir(metin, secenekler = {}) {
  const s = String(metin ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!s.trim()) throw new CurlHatasi('Yapıştırılan metin boş.');
  if (s.length > EN_COK_KARAKTER) throw new CurlHatasi(`Metin çok uzun (en çok ${EN_COK_KARAKTER.toLocaleString('tr')} karakter).`);
  if (/(^|\n)\s*(?:\$\w+\s*=\s*)?(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i.test(s)) {
    throw new CurlHatasi('PowerShell Invoke-WebRequest / Invoke-RestMethod komutları desteklenmiyor; tarayıcıdan "Copy as cURL" ile alın ya da curl.exe kullanın.');
  }
  const bicim = curlBicimi(s);
  const belirtecler = bicim === 'cmd' ? cmdBelirtecleri(s) : bicim === 'powershell' ? psBelirtecleri(s) : bashBelirtecleri(s);
  /** @type {string[][]} */
  const komutlar = [];
  /** @type {string[]} */
  let grup = [];
  const grupBitir = () => {
    let g = grup;
    grup = [];
    // Kabuk istemi ("$ curl", "> curl") ve PowerShell çağrı işleci ("& curl.exe") atlanır.
    while (g.length && /^(?:\$|>|&|PS>?)$/.test(g[0])) g = g.slice(1);
    if (!g.length) return;
    if (CURL.test(g[0])) { komutlar.push(g.slice(1)); return; }
    // Satır devamı unutulmuş: seçenekle başlayan satır önceki komuta eklenir.
    if (g[0].startsWith('-') && komutlar.length) { komutlar[komutlar.length - 1].push(...g); return; }
    throw new CurlHatasi(komutlar.length ? `${komutlar.length}. komuttan sonra "curl" ile başlamayan bir satır var.` : 'Metin "curl" ile başlamıyor; tarayıcıdan ya da belgeden kopyalanan curl komutunu yapıştırın.');
  };
  for (const b of belirtecler) {
    if (b === null) grupBitir();
    else grup.push(b);
  }
  grupBitir();
  if (!komutlar.length) throw new CurlHatasi('Metinde curl komutu yok.');
  if (komutlar.length > EN_COK_KOMUT) throw new CurlHatasi(`En çok ${EN_COK_KOMUT} komut yapıştırılabilir.`);
  return { bicim, istekler: komutlar.map((k, i) => komutCoz(k, i + 1, secenekler)) };
}

// --- REST uç taslağı --------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ anahtar: string; tur: 'baslik' | 'sorgu' | 'govde'; ad: string; deger: string; alanYolu: string | null }} CurlGizlisi
 *   anahtar: onay seçimi için ("baslik:Authorization", "sorgu:token", "govde:govde/kullanici/parola"). alanYolu: REST alan yolu
 *   (tablo sütununa bağlanabilen sorgu / JSON gövde alanı); null: başlık ya da bağlanamayan (form / ham gövde) alan.
 */

/**
 * İsteğin gizli değerleri (onay listesi).
 * @param {CurlIstegi} istek @returns {CurlGizlisi[]}
 */
export function curlGizlileri(istek) {
  /** @type {CurlGizlisi[]} */
  const g = [];
  for (const b of istek.basliklar) if (b.gizli && b.deger) g.push({ anahtar: `baslik:${b.ad}`, tur: 'baslik', ad: b.ad, deger: b.deger, alanYolu: null });
  for (const q of istek.sorgu) if (q.gizli && q.deger) g.push({ anahtar: `sorgu:${q.ad}`, tur: 'sorgu', ad: q.ad, deger: q.deger, alanYolu: PARCA.test(q.ad) ? `sorgu/${q.ad}` : null });
  for (const a of istek.govdeAlanlari) {
    if (!a.gizli || !a.deger || a.deger === 'null') continue;
    const baglanabilir = istek.govdeTuru === 'json' && a.yol.split('/').slice(1).every((p) => PARCA.test(p));
    g.push({ anahtar: `govde:${a.yol}`, tur: 'govde', ad: a.ad, deger: a.deger, alanYolu: baglanabilir ? a.yol : null });
  }
  return [...new Map(g.map((x) => [x.anahtar, x])).values()];
}

/** Başlık değerindeki kimlik şeması ("Bearer …" → "Bearer"). @param {string} d */
const sema = (d) => /^(Bearer|Basic|Digest|Token)\s+\S/i.exec(d)?.[1] ?? '';

/**
 * İstek → REST sihirbazının uç taslağı. taban: seçilen taban adres (isteğin adresi bununla başlıyorsa yol kalanıdır).
 * Gizli değerler uçta yazılmaz: onayli(anahtar) doğruysa başlık değeri uçta kalır (kayıtta şifreli "<servis> başlıkları" sütununa
 * gider), sorgu / gövde değeri gizliDegerler'e (alan yolu → değer) gider; onaysızda başlıkta yalnız şema ("Bearer") kalır,
 * gizliDegerler'de alan yolu null olur (sütun boş açılır). Bağlanamayan (form / ham gövde) gizli değer her durumda silinir.
 * @param {CurlIstegi} istek @param {{ taban?: string; onayli?: (anahtar: string) => boolean }} [s]
 */
export function curlRestTaslagi(istek, s = {}) {
  const onayli = s.onayli ?? (() => false);
  /** @type {string[]} */
  const uyarilar = [];
  let metot = istek.metot;
  if (!REST_METOTLARI.includes(metot)) { uyarilar.push(`${metot} metodu REST servislerinde yok; GET alındı.`); metot = 'GET'; }
  const tam = `${istek.koken}${istek.yol}`;
  const taban = String(s.taban ?? istek.koken).trim().replace(/\/+$/, '');
  let yol = taban && tam.toLowerCase().startsWith(taban.toLowerCase()) && (tam.length === taban.length || tam[taban.length] === '/') ? tam.slice(taban.length) : istek.yol;
  if (yol === '/') yol = '';
  /** @type {Record<string, string | null>} */
  const gizliDegerler = {};
  /** @type {string[]} */
  const gizliAlanlar = [];
  const sorgu = istek.sorgu.map((q) => {
    if (!q.gizli || !q.deger) return { ad: q.ad, deger: q.deger };
    if (PARCA.test(q.ad)) {
      gizliAlanlar.push(`sorgu/${q.ad}`);
      gizliDegerler[`sorgu/${q.ad}`] = onayli(`sorgu:${q.ad}`) ? q.deger : null;
    }
    return { ad: q.ad, deger: '' };
  });
  const basliklar = istek.basliklar.map((b) => (!b.gizli || !b.deger || onayli(`baslik:${b.ad}`) ? { ad: b.ad, deger: b.deger } : { ad: b.ad, deger: sema(b.deger) }));
  let govdeOrnegi = '';
  if (istek.govdeTuru !== 'yok') {
    if (GOVDELI_METOTLAR.includes(metot)) {
      govdeOrnegi = istek.govdeGizlisiz;
      if (istek.govdeTuru === 'json') {
        for (const g of curlGizlileri(istek)) {
          if (g.tur !== 'govde' || !g.alanYolu) continue;
          gizliAlanlar.push(g.alanYolu);
          gizliDegerler[g.alanYolu] = onayli(g.anahtar) ? g.deger : null;
        }
      }
    } else uyarilar.push(`${metot} isteğinin gövdesi alınmadı (gövde yalnız POST / PUT / PATCH'te gönderilir).`);
  }
  if (istek.govdeTuru === 'form' || istek.govdeTuru === 'ham') {
    const silinen = curlGizlileri(istek).filter((g) => g.tur === 'govde').length;
    if (silinen && govdeOrnegi) uyarilar.push(`Gövdedeki ${silinen} gizli değer kaydedilmez (form / ham gövde alanı tabloya bağlanamaz); senaryoda doldurun.`);
  }
  const icerikTuru = !istek.icerikTuru ? 'application/json'
    : /json/i.test(istek.icerikTuru) && !/soap/i.test(istek.icerikTuru) ? 'application/json'
      : /x-www-form-urlencoded/i.test(istek.icerikTuru) ? 'application/x-www-form-urlencoded' : istek.icerikTuru.trim();
  return { metot, yol, sorgu, basliklar, icerikTuru, govdeOrnegi, gizliAlanlar: [...new Set(gizliAlanlar)], gizliDegerler, uyarilar };
}
