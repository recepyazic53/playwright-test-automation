// VERİTABANI SÜRÜCÜLERİ — "Veritabanı bağlantısı" entegrasyonunun sürücü katmanı. Ücretsiz, açık kaynak npm paketleri
// kullanılır ve YALNIZ gerektiğinde (ilk sorguda) yüklenir; paket kurulu değilse anlaşılır bir hata verilir:
//   Microsoft SQL Server → mssql · Oracle → oracledb (THIN mod; Instant Client gerekmez) · PostgreSQL → pg · MySQL/MariaDB → mysql2
// Sorgu parametreleri SQL içinde ":ad" biçiminde yazılır ve sürücünün kendi bağlama biçimine çevrilir (değerler SQL'e
// metin olarak EKLENMEZ). "Yalnız okuma" açıkken (varsayılan) yalnız SELECT / WITH ile başlayan TEK ifade çalışır; destekleyen
// sürücülerde oturum da salt okunur açılır. Hata mesajlarına parola yazılmaz (maskelenir).
// Testler gerçek veritabanına bağlanmaz: surucuYukleyiciAyarla ile sahte sürücü verilir.
// NOT: import.meta KULLANILMAZ.
import { EntegrasyonHatasi, gizlileriMaskele, hostDenetle } from './istek.mjs';

/**
 * @typedef {'mssql' | 'oracle' | 'postgres' | 'mysql'} SurucuAdi
 * @typedef {{ surucu: SurucuAdi; sunucu: string; port?: number | null; veritabani?: string; kullanici?: string; parola?: string;
 *   tls?: 'kapali' | 'acik' | 'acik-dogrulamasiz'; zamanAsimiSn?: number; yalnizOkuma?: boolean }} VeritabaniAyari
 * @typedef {{ sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean }} SorguSonucu
 */

/** Sürücüler: arayüz etiketi, npm paketi, varsayılan port, bağlantı denemesi sorgusu. */
export const SURUCULER = Object.freeze({
  mssql: { etiket: 'Microsoft SQL Server', paket: 'mssql', port: 1433, deneme: 'SELECT 1' },
  oracle: { etiket: 'Oracle', paket: 'oracledb', port: 1521, deneme: 'SELECT 1 FROM DUAL' },
  postgres: { etiket: 'PostgreSQL', paket: 'pg', port: 5432, deneme: 'SELECT 1' },
  mysql: { etiket: 'MySQL / MariaDB', paket: 'mysql2', port: 3306, deneme: 'SELECT 1' }
});

/** @type {(paket: string) => Promise<any>} */
let yukleyici = (paket) => import(paket);

/** Testler için: sürücü paketlerini yükleyen fonksiyonu değiştirir (null: gerçek import). @param {((paket: string) => Promise<any>) | null} fn */
export function surucuYukleyiciAyarla(fn) {
  yukleyici = fn ?? ((paket) => import(paket));
}

/** @param {SurucuAdi} surucu */
async function surucuYukle(surucu) {
  const t = SURUCULER[surucu];
  if (!t) throw new EntegrasyonHatasi('Bilinmeyen veritabanı sürücüsü.');
  try {
    const m = await yukleyici(t.paket);
    return m && m.default ? m.default : m;
  } catch {
    throw new EntegrasyonHatasi(`${t.etiket} sürücüsü kurulu değil. Proje klasöründe "npm install ${t.paket}" çalıştırıp Nöbetçi'yi yeniden başlatın.`);
  }
}

// ---------------------------------------------------------------------------------------
// SQL metni: dizgi / yorum farkında tarama
// ---------------------------------------------------------------------------------------

/**
 * SQL'i parçalara ayırır: kod ('k'), dizgi / tırnaklı ad ('d'), yorum ('y').
 * @param {string} sql @returns {Array<{ t: 'k' | 'd' | 'y'; m: string }>}
 */
function sqlParcala(sql) {
  /** @type {Array<{ t: 'k' | 'd' | 'y'; m: string }>} */
  const parcalar = [];
  let i = 0;
  let kod = '';
  const kodBitir = () => { if (kod) { parcalar.push({ t: 'k', m: kod }); kod = ''; } };
  while (i < sql.length) {
    const c = sql[i];
    const s = sql[i + 1];
    if (c === '-' && s === '-') {
      const son = sql.indexOf('\n', i);
      kodBitir();
      parcalar.push({ t: 'y', m: sql.slice(i, son < 0 ? sql.length : son) });
      i = son < 0 ? sql.length : son;
    } else if (c === '/' && s === '*') {
      const son = sql.indexOf('*/', i + 2);
      kodBitir();
      parcalar.push({ t: 'y', m: sql.slice(i, son < 0 ? sql.length : son + 2) });
      i = son < 0 ? sql.length : son + 2;
    } else if (c === "'" || c === '"' || c === '`' || c === '[') {
      const kapanis = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === kapanis) {
          if (sql[j + 1] === kapanis && c !== '[') { j += 2; continue; }
          break;
        }
        j++;
      }
      kodBitir();
      parcalar.push({ t: 'd', m: sql.slice(i, Math.min(sql.length, j + 1)) });
      i = j + 1;
    } else {
      kod += c;
      i++;
    }
  }
  kodBitir();
  return parcalar;
}

// Tek ifade SELECT/WITH ile başlamak zorunda olduğundan yalnız bir sorgunun İÇİNE gömülebilen değiştiriciler aranır
// (veri değiştiren CTE, SELECT … INTO, yordam çağrısı).
const DEGISTIREN = /\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|grant|revoke|exec|execute|call|into)\b/i;

/**
 * "Yalnız okuma" kuralı: tek ifade, SELECT ya da WITH ile başlar, veri / şema değiştiren anahtar sözcük içermez
 * (dizgi ve yorumların içi sayılmaz). Uymuyorsa EntegrasyonHatasi.
 * @param {string} sql
 */
export function yalnizOkumaDenetle(sql) {
  const kod = sqlParcala(String(sql ?? '')).filter((p) => p.t === 'k').map((p) => p.m).join(' ');
  const govde = kod.trim().replace(/;\s*$/, '');
  if (!govde) throw new EntegrasyonHatasi('SQL boş.');
  if (govde.includes(';')) throw new EntegrasyonHatasi('Yalnız okuma açıkken tek bir ifade çalıştırılabilir (";" ile ayrılmış birden çok ifade olamaz).');
  if (!/^\(?\s*(select|with)\b/i.test(govde)) throw new EntegrasyonHatasi('Yalnız okuma açıkken yalnız SELECT ya da WITH ile başlayan sorgular çalıştırılabilir.');
  const yasak = govde.match(DEGISTIREN);
  if (yasak) throw new EntegrasyonHatasi(`Yalnız okuma açıkken sorguda "${yasak[1].toUpperCase()}" kullanılamaz.`);
  if (/\bfor\s+update\b/i.test(govde)) throw new EntegrasyonHatasi('Yalnız okuma açıkken "FOR UPDATE" kullanılamaz.');
}

/**
 * ":ad" parametrelerini sürücü biçimine çevirir. pg: $1…, mysql: ?, mssql: @ad, oracle: :ad (değişmez).
 * Dizgi / yorum içindekiler ve "::" (tür dönüşümü) dokunulmaz.
 * @param {SurucuAdi} surucu @param {string} sql @param {Record<string, unknown>} parametreler
 * @returns {{ sql: string; degerler: unknown[]; adlar: Record<string, unknown> }}
 */
export function parametreleriDonustur(surucu, sql, parametreler) {
  /** @type {unknown[]} */
  const degerler = [];
  /** @type {Record<string, unknown>} */
  const adlar = {};
  /** @type {Map<string, number>} */
  const sira = new Map();
  const cikti = sqlParcala(String(sql ?? '')).map((p) => {
    if (p.t !== 'k') return p.m;
    return p.m.replace(/(^|[^:\w]):([A-Za-z_][A-Za-z0-9_]*)/g, (_, once, ad) => {
      if (!Object.prototype.hasOwnProperty.call(parametreler, ad)) throw new EntegrasyonHatasi(`SQL'deki ":${ad}" parametresine değer verilmedi.`);
      const deger = parametreler[ad];
      adlar[ad] = deger;
      if (surucu === 'postgres') {
        if (!sira.has(ad)) { degerler.push(deger); sira.set(ad, degerler.length); }
        return `${once}$${sira.get(ad)}`;
      }
      if (surucu === 'mysql') { degerler.push(deger); return `${once}?`; }
      if (surucu === 'mssql') return `${once}@${ad}`;
      return `${once}:${ad}`;
    });
  }).join('');
  return { sql: cikti, degerler, adlar };
}

/** Hücre değerini JSON'a uygun hâle getirir. @param {unknown} v @returns {unknown} */
function hucre(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return `<ikili veri: ${v.length} bayt>`;
  if (typeof v === 'object') { try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); } }
  return v;
}

// ---------------------------------------------------------------------------------------
// Sürücü uyarlamaları
// ---------------------------------------------------------------------------------------

/**
 * @param {VeritabaniAyari} a @param {string} sql @param {Record<string, unknown>} parametreler
 * @param {{ zamanAsimiMs: number; satirSiniri: number }} s @returns {Promise<SorguSonucu>}
 */
async function surucuyleSorgula(a, sql, parametreler, s) {
  const surucu = a.surucu;
  const mod = await surucuYukle(surucu);
  const port = Number(a.port) || SURUCULER[surucu].port;
  const tls = a.tls === 'acik' || a.tls === 'acik-dogrulamasiz';
  const dogrula = a.tls !== 'acik-dogrulamasiz';
  const { sql: metin, degerler, adlar } = parametreleriDonustur(surucu, sql, parametreler);
  const salt = a.yalnizOkuma !== false;
  const sinir = s.satirSiniri;

  if (surucu === 'postgres') {
    const c = new mod.Client({
      host: a.sunucu, port, database: a.veritabani || undefined, user: a.kullanici || undefined, password: a.parola || undefined,
      ssl: tls ? { rejectUnauthorized: dogrula } : false, connectionTimeoutMillis: s.zamanAsimiMs, query_timeout: s.zamanAsimiMs, statement_timeout: s.zamanAsimiMs
    });
    await c.connect();
    try {
      if (salt) await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      const r = await c.query({ text: metin, values: degerler, rowMode: 'array' });
      const satirlar = (r.rows ?? []).map((/** @type {unknown[]} */ x) => x.map(hucre));
      return { sutunlar: (r.fields ?? []).map((/** @type {{ name: string }} */ f) => f.name), satirlar: satirlar.slice(0, sinir), kesildi: satirlar.length > sinir };
    } finally { await c.end().catch(() => {}); }
  }

  if (surucu === 'mysql') {
    const c = await mod.createConnection({
      host: a.sunucu, port, database: a.veritabani || undefined, user: a.kullanici || undefined, password: a.parola || undefined,
      ssl: tls ? { rejectUnauthorized: dogrula } : undefined, connectTimeout: s.zamanAsimiMs
    });
    try {
      if (salt) await c.query('SET SESSION TRANSACTION READ ONLY');
      const [rows, fields] = await c.query({ sql: metin, values: degerler, timeout: s.zamanAsimiMs, rowsAsArray: true });
      const satirlar = (Array.isArray(rows) ? rows : []).map((/** @type {unknown[]} */ x) => (Array.isArray(x) ? x.map(hucre) : []));
      return { sutunlar: (fields ?? []).map((/** @type {{ name: string }} */ f) => f.name), satirlar: satirlar.slice(0, sinir), kesildi: satirlar.length > sinir };
    } finally { await c.end().catch(() => {}); }
  }

  if (surucu === 'mssql') {
    const havuz = new mod.ConnectionPool({
      server: a.sunucu, port, database: a.veritabani || undefined, user: a.kullanici || undefined, password: a.parola || undefined,
      options: { encrypt: tls, trustServerCertificate: !dogrula }, connectionTimeout: s.zamanAsimiMs, requestTimeout: s.zamanAsimiMs,
      pool: { max: 1, min: 0 }
    });
    await havuz.connect();
    try {
      const istek = havuz.request();
      for (const [ad, deger] of Object.entries(adlar)) istek.input(ad, deger);
      const r = await istek.query(metin);
      const kume = r.recordset ?? [];
      const kolonlar = kume.columns ? Object.values(kume.columns).sort((x, y) => Number(/** @type {any} */ (x).index) - Number(/** @type {any} */ (y).index)).map((x) => String(/** @type {any} */ (x).name))
        : kume.length ? Object.keys(kume[0]) : [];
      const satirlar = kume.map((/** @type {Record<string, unknown>} */ x) => kolonlar.map((k) => hucre(x[k])));
      return { sutunlar: kolonlar, satirlar: satirlar.slice(0, sinir), kesildi: satirlar.length > sinir };
    } finally { await havuz.close().catch(() => {}); }
  }

  // oracle (oracledb THIN mod)
  const protokol = tls ? 'tcps' : 'tcp';
  const c = await mod.getConnection({
    user: a.kullanici || undefined, password: a.parola || undefined,
    connectString: `${protokol}://${a.sunucu}:${port}/${a.veritabani || ''}${tls && !dogrula ? '?ssl_server_dn_match=false' : ''}`,
    connectTimeout: Math.max(1, Math.round(s.zamanAsimiMs / 1000))
  });
  try {
    c.callTimeout = s.zamanAsimiMs;
    if (salt) await c.execute('SET TRANSACTION READ ONLY');
    const r = await c.execute(metin, adlar, { outFormat: mod.OUT_FORMAT_ARRAY, maxRows: sinir + 1 });
    const satirlar = (r.rows ?? []).map((/** @type {unknown[]} */ x) => x.map(hucre));
    return { sutunlar: (r.metaData ?? []).map((/** @type {{ name: string }} */ m) => m.name), satirlar: satirlar.slice(0, sinir), kesildi: satirlar.length > sinir };
  } finally {
    if (salt) await c.rollback().catch(() => {});
    await c.close().catch(() => {});
  }
}

/**
 * Veritabanında sorgu çalıştırır (bağlantı ayarı çözülmüş, parola dahil). Yalnız okuma açıkken kural denetlenir;
 * host yasak kalıba uyuyorsa bağlanılmaz. Hata mesajlarında parola / kullanıcı maskelenir.
 * @param {VeritabaniAyari} ayar @param {string} sql @param {Record<string, unknown> | null | undefined} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number; yasakDesenleri?: ReadonlyArray<{ kalip: string; desen: RegExp }> }} [secenekler]
 * @returns {Promise<SorguSonucu>}
 */
export async function veritabaniSorgusu(ayar, sql, parametreler, secenekler = {}) {
  if (!SURUCULER[ayar.surucu]) throw new EntegrasyonHatasi('Bilinmeyen veritabanı sürücüsü.');
  if (!ayar.sunucu) throw new EntegrasyonHatasi('Sunucu adı boş.');
  hostDenetle(ayar.sunucu, secenekler.yasakDesenleri ?? []);
  if (typeof sql !== 'string' || !sql.trim()) throw new EntegrasyonHatasi('SQL boş.');
  if (sql.length > 100_000) throw new EntegrasyonHatasi('SQL çok uzun (en çok 100.000 karakter).');
  if (ayar.yalnizOkuma !== false) yalnizOkumaDenetle(sql);
  const p = parametreler && typeof parametreler === 'object' && !Array.isArray(parametreler) ? parametreler : {};
  const zamanAsimiMs = Math.max(1000, Math.min(600_000, Number(secenekler.zamanAsimiMs) || (Number(ayar.zamanAsimiSn) || 30) * 1000));
  const satirSiniri = Math.max(1, Math.min(100_000, Math.floor(Number(secenekler.satirSiniri) || 1000)));
  try {
    return await surucuyleSorgula(ayar, sql, p, { zamanAsimiMs, satirSiniri });
  } catch (hata) {
    if (hata instanceof EntegrasyonHatasi) throw hata;
    const h = /** @type {{ message?: string; code?: string | number }} */ (hata ?? {});
    const ham = `${h.code ? `${h.code}: ` : ''}${String(h.message ?? 'bilinmeyen hata')}`.replace(/\s+/g, ' ').slice(0, 300);
    throw new EntegrasyonHatasi(`Veritabanı hatası (${SURUCULER[ayar.surucu].etiket}, ${ayar.sunucu}): ${gizlileriMaskele(ham, [ayar.parola])}`);
  }
}
