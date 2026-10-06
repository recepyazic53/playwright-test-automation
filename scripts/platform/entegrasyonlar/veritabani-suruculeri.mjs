// VERİTABANI SÜRÜCÜLERİ — "Veritabanı bağlantısı" entegrasyonunun sürücü katmanı. Ücretsiz, açık kaynak npm paketleri
// kullanılır ve YALNIZ gerektiğinde (ilk sorguda) yüklenir; paket kurulu değilse anlaşılır bir hata verilir:
//   Microsoft SQL Server → mssql · Oracle → oracledb (THIN mod; Instant Client gerekmez) · PostgreSQL → pg · MySQL/MariaDB → mysql2
// Oracle THICK mod (isteğe bağlı): Ayarlar > Koşu > Gelişmiş > "Oracle Instant Client klasörü" doluysa oracledb ilk bağlantıdan önce
// bu klasördeki Instant Client ile başlatılır (Thin modun desteklemediği eski 10G parola biçimi vb.). Koşu sürecinde klasör ortam
// değişkeniyle (NOBETCI_ORACLE_ISTEMCI_KLASORU), sunucuda oracleIstemciKaynagiAyarla ile verilir. Kip süreçte bir kez seçilir.
// Sorgu parametreleri SQL içinde ":ad" biçiminde yazılır ve sürücünün kendi bağlama biçimine çevrilir (değerler SQL'e
// metin olarak EKLENMEZ). "Yalnız okuma" açıkken (varsayılan) yalnız SELECT / WITH ile başlayan TEK ifade çalışır; destekleyen
// sürücülerde oturum da salt okunur açılır. Hata mesajlarına parola yazılmaz (maskelenir).
// Hücreler sql/buyuk-metin.mjs ile metne çevrilir (CLOB / NCLOB metin olarak; hücre başına 100 KB, aşan kesilir; BLOB / ikili veri
// "(ikili veri, N bayt)"): özet panosu SQL kartı ve SQL adımı aynı kuralı görür.
// Testler gerçek veritabanına bağlanmaz: surucuYukleyiciAyarla ile sahte sürücü verilir.
// NOT: import.meta KULLANILMAZ.
import { EntegrasyonHatasi, gizlileriMaskele, hostDenetle } from './istek.mjs';
import { satirlariDuzenle } from '../sql/buyuk-metin.mjs';

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
  // modul: yüklenecek giriş noktası (mysql2'nin varsayılanı geri çağrılı arayüzdür; promise sürümü "mysql2/promise").
  mysql: { etiket: 'MySQL / MariaDB', paket: 'mysql2', modul: 'mysql2/promise', port: 3306, deneme: 'SELECT 1' }
});

/** @type {(paket: string) => Promise<any>} */
let yukleyici = (paket) => import(paket);

/** Testler için: sürücü paketlerini yükleyen fonksiyonu değiştirir (null: gerçek import). @param {((paket: string) => Promise<any>) | null} fn */
export function surucuYukleyiciAyarla(fn) {
  yukleyici = fn ?? ((paket) => import(paket));
}

/** Sunucuda Instant Client klasörünü veren fonksiyon (kasa açıkken ayarlardan). @type {() => string} */
let oracleIstemciKaynagi = () => '';

/** Sunucu için: Oracle Instant Client klasörünü veren fonksiyon (null: yok). @param {(() => string) | null} fn */
export function oracleIstemciKaynagiAyarla(fn) {
  oracleIstemciKaynagi = fn ?? (() => '');
}

/** Etkin Instant Client klasörü: koşu sürecinde ortam değişkeni, sunucuda ayar ('' = Thin mod). */
export function oracleIstemciKlasoru() {
  const env = String(process.env.NOBETCI_ORACLE_ISTEMCI_KLASORU ?? '').trim();
  if (env) return env;
  try { return String(oracleIstemciKaynagi() ?? '').trim(); } catch { return ''; }
}

/** Bu süreçte Thick modun başlatıldığı klasör (null: başlatılmadı). @type {string | null} */
let thickKlasoru = null;

/**
 * Klasör doluysa oracledb'yi (süreçte bir kez) Thick modda başlatır; boşsa Thin kalır. Klasör sonradan değişirse ya da süreçte
 * önce Thin bağlantı yapıldıysa sürücü kip değiştiremez: yeniden başlatma iletisi verilir.
 * @param {any} mod
 */
function oracleKipiHazirla(mod) {
  const klasor = oracleIstemciKlasoru();
  if (!klasor) return;
  if (thickKlasoru === klasor) return;
  if (thickKlasoru !== null) throw new EntegrasyonHatasi('Oracle Instant Client klasörü değişti: yeni klasörün kullanılması için Nöbetçi\'yi yeniden başlatın.');
  if (typeof mod.initOracleClient !== 'function') throw new EntegrasyonHatasi('Oracle sürücüsü Thick modu desteklemiyor (oracledb sürümünü güncelleyin).');
  try {
    mod.initOracleClient({ libDir: klasor });
    thickKlasoru = klasor;
  } catch (hata) {
    const ilk = String(/** @type {{ message?: string }} */ (hata ?? {}).message ?? '').split('\n')[0].slice(0, 200);
    throw new EntegrasyonHatasi(`Oracle Instant Client yüklenemedi (${klasor}): ${ilk} — Klasörde oci.dll olmalı (Instant Client Basic, 64 bit); Microsoft Visual C++ Redistributable (x64) kurulu olmalı. Bu süreçte daha önce Thin modla bağlanıldıysa Nöbetçi'yi yeniden başlatın.`);
  }
}

/** @param {SurucuAdi} surucu */
async function surucuYukle(surucu) {
  const t = SURUCULER[surucu];
  if (!t) throw new EntegrasyonHatasi('Bilinmeyen veritabanı sürücüsü.');
  try {
    const m = await yukleyici(/** @type {{ modul?: string }} */ (t).modul ?? t.paket);
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
 * Sorgu "yalnız okuma" kuralını geçmiyor mu (veri / şema değiştiren ya da birden çok ifadeli sorgu)? @param {string} sql
 */
export function yazmaSorgusuMu(sql) {
  try { yalnizOkumaDenetle(sql); return false; } catch { return true; }
}

/**
 * Sorgunun gerektirdiği izinler (Ayarlar > İzinler): her sorgu "veritabani-okuma"; "Yalnız okuma" kapalı bağlantıda yazma
 * sorgusu ayrıca "veritabani-yazma". (Yalnız okuma açık bağlantıda yazma sorgusu zaten reddedilir.)
 * @param {{ yalnizOkuma?: boolean }} ayar @param {string} sql @returns {string[]}
 */
export function sorguIzinleri(ayar, sql) {
  return ayar.yalnizOkuma === false && yazmaSorgusuMu(sql) ? ['veritabani-okuma', 'veritabani-yazma'] : ['veritabani-okuma'];
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

/**
 * Satır sınırına göre kesip hücreleri metne çevirir (Lob okumaları bağlantı kapanmadan beklenir).
 * @param {unknown[][]} ham @param {number} sinir @param {ReadonlyArray<boolean | undefined>} [ikili] sütun türü ikili mi (bilinmiyorsa undefined)
 */
async function sonucSatirlari(ham, sinir, ikili) {
  return { satirlar: await satirlariDuzenle(ham.slice(0, sinir), ikili), kesildi: ham.length > sinir };
}

/** PostgreSQL tür kimlikleri: bytea ikili; text / varchar / bpchar / name / xml / json / jsonb metin. */
const PG_IKILI = new Set([17]);
const PG_METIN = new Set([25, 1043, 1042, 19, 142, 114, 3802]);

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
    c.on?.('error', () => { /* bağlantı düştü: sorgu hatası olarak döner; süreç çökmez */ });
    await c.connect();
    try {
      if (salt) await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      const r = await c.query({ text: metin, values: degerler, rowMode: 'array' });
      const alanlar = /** @type {Array<{ name: string; dataTypeID?: number }>} */ (r.fields ?? []);
      const ikili = alanlar.map((f) => (PG_IKILI.has(Number(f.dataTypeID)) ? true : PG_METIN.has(Number(f.dataTypeID)) ? false : undefined));
      return { sutunlar: alanlar.map((f) => f.name), ...(await sonucSatirlari(r.rows ?? [], sinir, ikili)) };
    } finally { await c.end().catch(() => {}); }
  }

  if (surucu === 'mysql') {
    const c = await mod.createConnection({
      host: a.sunucu, port, database: a.veritabani || undefined, user: a.kullanici || undefined, password: a.parola || undefined,
      ssl: tls ? { rejectUnauthorized: dogrula } : undefined, connectTimeout: s.zamanAsimiMs
    });
    c.on?.('error', () => { /* bağlantı düştü: sorgu hatası olarak döner; süreç çökmez */ });
    try {
      if (salt) await c.query('SET SESSION TRANSACTION READ ONLY');
      const [rows, fields] = await c.query({ sql: metin, values: degerler, timeout: s.zamanAsimiMs, rowsAsArray: true });
      // characterSet 63 = binary (BLOB / VARBINARY); diğer karakter kümeleri metin (TEXT / LONGTEXT Buffer gelirse metne çevrilir).
      const alanlar = /** @type {Array<{ name: string; characterSet?: number }>} */ (fields ?? []);
      const ikili = alanlar.map((f) => (f.characterSet === undefined ? undefined : f.characterSet === 63));
      const ham = (Array.isArray(rows) ? rows : []).map((/** @type {unknown} */ x) => (Array.isArray(x) ? x : []));
      return { sutunlar: alanlar.map((f) => f.name), ...(await sonucSatirlari(ham, sinir, ikili)) };
    } finally { await c.end().catch(() => {}); }
  }

  if (surucu === 'mssql') {
    const havuz = new mod.ConnectionPool({
      server: a.sunucu, port, database: a.veritabani || undefined, user: a.kullanici || undefined, password: a.parola || undefined,
      options: { encrypt: tls, trustServerCertificate: !dogrula }, connectionTimeout: s.zamanAsimiMs, requestTimeout: s.zamanAsimiMs,
      pool: { max: 1, min: 0 }
    });
    havuz.on?.('error', () => { /* bağlantı düştü: sorgu hatası olarak döner; süreç çökmez */ });
    await havuz.connect();
    try {
      const istek = havuz.request();
      for (const [ad, deger] of Object.entries(adlar)) istek.input(ad, deger);
      const r = await istek.query(metin);
      const kume = r.recordset ?? [];
      const tanimlar = kume.columns ? /** @type {any[]} */ (Object.values(kume.columns)).sort((x, y) => Number(x.index) - Number(y.index)) : null;
      const kolonlar = tanimlar ? tanimlar.map((x) => String(x.name)) : kume.length ? Object.keys(kume[0]) : [];
      // varbinary / binary / image ikili; nvarchar(max) / ntext / varchar metin (zaten metin gelir; dokunulmaz).
      const ikili = tanimlar ? tanimlar.map((x) => {
        const t = String(x.type?.declaration ?? x.type?.name ?? '').toLowerCase();
        return /binary|image/.test(t) ? true : /char|text|xml/.test(t) ? false : undefined;
      }) : [];
      const ham = kume.map((/** @type {Record<string, unknown>} */ x) => kolonlar.map((k) => x[k]));
      return { sutunlar: kolonlar, ...(await sonucSatirlari(ham, sinir, ikili)) };
    } finally { await havuz.close().catch(() => {}); }
  }

  // oracle (oracledb THIN mod; Instant Client klasörü verildiyse THICK)
  oracleKipiHazirla(mod);
  const protokol = tls ? 'tcps' : 'tcp';
  const c = await mod.getConnection({
    user: a.kullanici || undefined, password: a.parola || undefined,
    connectString: `${protokol}://${a.sunucu}:${port}/${a.veritabani || ''}${tls && !dogrula ? '?ssl_server_dn_match=false' : ''}`,
    connectTimeout: Math.max(1, Math.round(s.zamanAsimiMs / 1000))
  });
  try {
    c.callTimeout = s.zamanAsimiMs;
    if (salt) await c.execute('SET TRANSACTION READ ONLY');
    // CLOB / NCLOB metin olarak, BLOB bayt olarak alınır (Lob nesnesi gelmez; yine de gelirse buyuk-metin.mjs okur).
    const lobTurleri = new Set([mod.DB_TYPE_CLOB, mod.DB_TYPE_NCLOB].filter(Boolean));
    const ikiliTurler = new Set([mod.DB_TYPE_BLOB, mod.DB_TYPE_RAW, mod.DB_TYPE_LONG_RAW].filter(Boolean));
    const r = await c.execute(metin, adlar, {
      outFormat: mod.OUT_FORMAT_ARRAY, maxRows: sinir + 1,
      fetchTypeHandler: (/** @type {{ dbType?: unknown }} */ m) => (lobTurleri.has(m.dbType) ? { type: mod.STRING }
        : mod.DB_TYPE_BLOB && m.dbType === mod.DB_TYPE_BLOB ? { type: mod.BUFFER } : undefined)
    });
    const meta = /** @type {Array<{ name: string; dbType?: unknown }>} */ (r.metaData ?? []);
    const ikili = meta.map((m) => (ikiliTurler.has(m.dbType) ? true : lobTurleri.has(m.dbType) ? false : undefined));
    return { sutunlar: meta.map((m) => m.name), ...(await sonucSatirlari(r.rows ?? [], sinir, ikili)) };
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
    // Thin modun desteklemediği eski parola biçimi (NJS-116): Thick mod ayarı önerilir.
    const ipucu = ayar.surucu === 'oracle' && /NJS-116/.test(ham)
      ? ' — Bu kullanıcının parolası eski (10G) biçimde; Thin mod desteklemiyor. Oracle Instant Client\'ı indirip Ayarlar > Koşu > Gelişmiş > "Oracle Instant Client klasörü"ne klasörünü yazın ve Nöbetçi\'yi yeniden başlatın.'
      : '';
    throw new EntegrasyonHatasi(`Veritabanı hatası (${SURUCULER[ayar.surucu].etiket}, ${ayar.sunucu}): ${gizlileriMaskele(ham, [ayar.parola])}${ipucu}`);
  }
}
