// SAHTE VERİTABANI SÜRÜCÜSÜ (yalnız birim testleri; spec DEĞİL). PostgreSQL sürücüsünün ("pg") Client arayüzünü taklit eder ve
// sorguları BELLEK İÇİ bir SQLite (sql.js) veritabanında çalıştırır: hiçbir ağ bağlantısı açılmaz. İki yolla kullanılır:
//   - aynı süreçte: surucuYukleyiciAyarla(yukleyici)
//   - geçici Nöbetçi sunucusunda: TEST_SUNUCU_SAHTE_SQL_SURUCUSU=<bu dosyanın yolu> (test-sunucu.mjs yükler)
// SAHTE_SQL_GUNLUK verilirse her sorgu metni (SET … dahil) o dosyaya satır satır yazılır (testler "sayfa açılınca sorgu yok"u sayar).
// Davranış kalıpları: port 9 → bağlantı reddi (adres iletide geçer), kullanıcı "yanlis" → giriş reddi, SQL'de "/* bekle:N */" → N ms
// bekleme. Veri SAHTEDİR (belgeleme amaçlı geçerli biçimli kimlik / IBAN örnekleri).
// NOT: import.meta KULLANILMAZ.
import { appendFileSync } from 'node:fs';
import initSqlJs from 'sql.js';

/** Geçerli biçimli SAHTE T.C. kimlik no ve IBAN (maskeleme testleri). */
export const SAHTE_TC = '10000000146';
export const SAHTE_IBAN = 'TR33 0006 1005 1978 6457 8413 26';

/** @type {Promise<any> | null} */
let vtSozu = null;
function veritabani() {
  vtSozu ??= initSqlJs().then((SQL) => {
    const db = new SQL.Database();
    db.run(`CREATE TABLE kayitlar (id INTEGER PRIMARY KEY, durum TEXT, tc_kimlik_no TEXT, iban TEXT, aciklama TEXT, tutar REAL, gun TEXT);
      CREATE TABLE gunluk_sayim (gun TEXT, adet INTEGER);`);
    const durumlar = ['onaylandi', 'bekliyor', 'hata', 'onaylandi', 'onaylandi', 'hata'];
    for (let i = 1; i <= 12; i++) {
      db.run('INSERT INTO kayitlar VALUES (?, ?, ?, ?, ?, ?, ?)', [i, durumlar[i % durumlar.length], SAHTE_TC, SAHTE_IBAN,
        i === 1 ? `Kayıt ${SAHTE_TC} kimlik ve ${SAHTE_IBAN} hesap` : `Kayıt ${i}`, i * 10.5, `2026-09-${String(10 + i).padStart(2, '0')}`]);
    }
    for (const [gun, adet] of [['Pzt', 4], ['Sal', 7], ['Çar', 3], ['Per', 9], ['Cum', 5]]) db.run('INSERT INTO gunluk_sayim VALUES (?, ?)', [gun, adet]);
    return db;
  });
  return vtSozu;
}

/** @param {string} metin */
function gunlugeYaz(metin) {
  const yol = process.env.SAHTE_SQL_GUNLUK;
  if (yol) appendFileSync(yol, `${metin.replace(/\s+/g, ' ').trim()}\n`);
}

export class Client {
  /** @param {Record<string, any>} ayar */
  constructor(ayar) { this.ayar = ayar; }
  on() { return this; }
  async connect() {
    if (Number(this.ayar.port) === 9) throw Object.assign(new Error(`connect ECONNREFUSED ${this.ayar.host}:${this.ayar.port}`), { code: 'ECONNREFUSED' });
    if (this.ayar.user === 'yanlis') throw Object.assign(new Error(`password authentication failed for user "${this.ayar.user}"`), { code: '28P01' });
    this.db = await veritabani();
  }
  /** @param {string | { text: string; values?: unknown[] }} q */
  async query(q) {
    const metin = typeof q === 'string' ? q : q.text;
    gunlugeYaz(metin);
    if (/^\s*SET\s/i.test(metin)) return { rows: [], fields: [] };
    const bekle = /\/\*\s*bekle:(\d+)\s*\*\//.exec(metin);
    if (bekle) await new Promise((coz) => setTimeout(coz, Number(bekle[1])));
    const degerler = typeof q === 'string' ? [] : q.values ?? [];
    const sonuc = this.db.exec(metin.replace(/\$(\d+)/g, '?$1'), degerler);
    const son = sonuc[sonuc.length - 1] ?? { columns: [], values: [] };
    return { fields: son.columns.map((/** @type {string} */ name) => ({ name })), rows: son.values };
  }
  async end() { /* sahte */ }
}

/** surucuYukleyiciAyarla için: yalnız "pg" taklit edilir. @param {string} paket */
export async function yukleyici(paket) {
  if (paket === 'pg') return { Client };
  throw new Error(`sahte sürücüde yok: ${paket}`);
}
