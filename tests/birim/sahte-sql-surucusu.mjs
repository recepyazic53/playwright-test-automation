// SAHTE VERİTABANI SÜRÜCÜSÜ (yalnız birim testleri; spec DEĞİL). PostgreSQL sürücüsünün ("pg") Client arayüzünü taklit eder ve
// sorguları BELLEK İÇİ bir SQLite (sql.js) veritabanında çalıştırır: hiçbir ağ bağlantısı açılmaz. İki yolla kullanılır:
//   - aynı süreçte: surucuYukleyiciAyarla(yukleyici)
//   - geçici Nöbetçi sunucusunda: TEST_SUNUCU_SAHTE_SQL_SURUCUSU=<bu dosyanın yolu> (test-sunucu.mjs yükler)
// SAHTE_SQL_GUNLUK verilirse her sorgu metni (SET … dahil) o dosyaya satır satır yazılır (testler "sayfa açılınca sorgu yok"u sayar).
// Davranış kalıpları: port 9 → bağlantı reddi (adres iletide geçer), kullanıcı "yanlis" → giriş reddi, SQL'de "/* bekle:N */" → N ms
// bekleme, "/* artan */" → sorgudan önce sayac tablosundaki değer 1 artar (değişim görünümü), "/* lob */" → *CONTENT sütunları
// oracledb Lob'u benzeri nesne (CLOB; servis_kayitlari tablosu). Veri SAHTEDİR (belgeleme amaçlı geçerli biçimli kimlik / IBAN örnekleri).
// NOT: import.meta KULLANILMAZ.
import { appendFileSync } from 'node:fs';
import initSqlJs from 'sql.js';

/** Geçerli biçimli SAHTE T.C. kimlik no ve IBAN (maskeleme testleri). */
export const SAHTE_TC = '10000000146';
export const SAHTE_IBAN = 'TR33 0006 1005 1978 6457 8413 26';

/** Sahte servis isteği (SOAP zarfı, Approve işlemi) ve yanıtı. */
export const SAHTE_SOAP_ISTEGI = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://ornek.test/onay">'
  + '<soapenv:Header/><soapenv:Body><ns:Approve><ns:BasvuruNo>B-2026-0042</ns:BasvuruNo><ns:Tutar>1250.50</ns:Tutar>'
  + '<ns:Aciklama>Sahte onay isteği</ns:Aciklama></ns:Approve></soapenv:Body></soapenv:Envelope>';
export const SAHTE_SOAP_YANITI = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ApproveResponse>'
  + '<Sonuc>ONAYLANDI</Sonuc><IslemNo>9001</IslemNo><Mesaj>İşlem başarıyla tamamlandı; sahte yanıt metni.</Mesaj></ApproveResponse></soapenv:Body></soapenv:Envelope>';
export const SAHTE_JSON_ISTEGI = JSON.stringify({ islem: 'Odeme', basvuruNo: 'B-2026-0043', tutar: 99.9, kalemler: [{ ad: 'Kalem 1', adet: 2 }, { ad: 'Kalem 2', adet: 1 }], not: 'Sahte JSON isteği' });
/** 100 KB'tan uzun istek (kesme testi). */
export const SAHTE_UZUN_ISTEK = `<Uzun>${'X'.repeat(150_000)}</Uzun>`;
/** İkili veri (NUL baytlı, 16 bayt). */
export const SAHTE_IKILI = new Uint8Array([0, 1, 2, 3, 255, 254, 0, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const SAHTE_SERVIS_KAYITLARI = [
  [1, '2026-10-01T09:15:00', 1, SAHTE_SOAP_ISTEGI, SAHTE_SOAP_YANITI, SAHTE_IKILI, 'kısa'],
  [2, '2026-10-01T10:30:00', 0, SAHTE_JSON_ISTEGI, '{"hata":"Yetersiz bakiye","kod":51}', null, 'kısa'],
  [3, '2026-10-01T11:45:00', 1, SAHTE_UZUN_ISTEK, '<Tamam/>', null, 'kısa']
];

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
    // Pasta testi: 11 kategori (her biri bir dilim); "Sayı + değişim": sayac her "/* artan */" sorgusunda 1 artar.
    db.run('CREATE TABLE kategoriler (ad TEXT, adet INTEGER); CREATE TABLE sayac (n INTEGER); INSERT INTO sayac VALUES (10);');
    for (let i = 1; i <= 11; i++) db.run('INSERT INTO kategoriler VALUES (?, ?)', [`Kategori ${i}`, i * 3]);
    // Büyük metin testi: servis istek / yanıt günlüğü (Oracle CLOB benzeri). "/* lob */" ile sorgulanınca *CONTENT sütunları Lob
    // benzeri nesne (getData) olarak döner; EKDOSYA ikili veridir (NUL baytlı). 3. satırın isteği 100 KB'tan uzundur.
    db.run(`CREATE TABLE servis_kayitlari (id INTEGER PRIMARY KEY, ISLEMZAMANI TEXT, ISSUCCESS INTEGER, INPUTCONTENT TEXT, OUTPUTCONTENT TEXT,
      EKDOSYA BLOB, EKBILGI TEXT)`);
    for (const r of SAHTE_SERVIS_KAYITLARI) db.run('INSERT INTO servis_kayitlari VALUES (?, ?, ?, ?, ?, ?, ?)', r);
    return db;
  });
  return vtSozu;
}

/** @param {string} metin */
function gunlugeYaz(metin) {
  const yol = process.env.SAHTE_SQL_GUNLUK;
  if (yol) appendFileSync(yol, `${metin.replace(/\s+/g, ' ').trim()}\n`);
}

/** oracledb Lob benzeri nesne (CLOB): JSON'a çevrilince "{}" olur, metni getData ile okunur. @param {string} metin */
export function sahteLob(metin) {
  return { type: 2017, length: metin.length, getData: async () => metin, destroy() { /* sahte */ } };
}

/** Aynı süreçte açılan istemcilerin zaman aşımı seçenekleri (testler sürücüye iletilen süreyi doğrular). @type {Array<Record<string, unknown>>} */
export const istemciZamanAsimlari = [];

export class Client {
  /** @param {Record<string, any>} ayar */
  constructor(ayar) {
    this.ayar = ayar;
    istemciZamanAsimlari.push({ connectionTimeoutMillis: ayar.connectionTimeoutMillis, query_timeout: ayar.query_timeout, statement_timeout: ayar.statement_timeout });
  }
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
    if (/\/\*\s*artan\s*\*\//.test(metin)) this.db.run('UPDATE sayac SET n = n + 1');
    // pg Date parametresini sürücü bağlar; bellek içi SQLite Date bilmez: ISO metne çevrilir. SAHTE_SQL_DEGER_GUNLUGU verilirse
    // bağlanan değerler (tür + değer) ayrı dosyaya yazılır (testler değerin SQL'e gömülmediğini, parametre olduğunu doğrular).
    const ham = typeof q === 'string' ? [] : q.values ?? [];
    const degerGunlugu = process.env.SAHTE_SQL_DEGER_GUNLUGU;
    if (degerGunlugu && ham.length) appendFileSync(degerGunlugu, `${JSON.stringify(ham.map((v) => ({ tur: v instanceof Date ? 'Date' : typeof v, deger: v instanceof Date ? v.toISOString() : v })))}\n`);
    const degerler = ham.map((v) => (v instanceof Date ? v.toISOString() : v));
    const sonuc = this.db.exec(metin.replace(/\$(\d+)/g, '?$1'), degerler);
    const son = sonuc[sonuc.length - 1] ?? { columns: [], values: [] };
    // "/* lob */": *CONTENT sütunlarının metni oracledb Lob'u gibi nesne olarak döner (getData ile okunur).
    const lob = /\/\*\s*lob\s*\*\//.test(metin);
    const lobSutunu = son.columns.map((/** @type {string} */ c) => lob && /content$/i.test(c));
    const rows = son.values.map((/** @type {unknown[]} */ r) => r.map((v, i) => (lobSutunu[i] && typeof v === 'string' ? sahteLob(v) : v)));
    return { fields: son.columns.map((/** @type {string} */ name) => ({ name })), rows };
  }
  async end() { /* sahte */ }
}

/** surucuYukleyiciAyarla için: yalnız "pg" taklit edilir. @param {string} paket */
export async function yukleyici(paket) {
  if (paket === 'pg') return { Client };
  throw new Error(`sahte sürücüde yok: ${paket}`);
}
