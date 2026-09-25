// PLATFORM VERİTABANI BAĞLANTISI — tek bir YEREL SQLite dosyası (çalışma alanının veritabanı: kayıt defterindeki
// son açılan / NOBETCI_CALISMA_ALANI; kayıt defteri yoksa veri/platform.db — bkz. ../calisma-alanlari.mjs;
// PLATFORM_VERITABANI ortam değişkeni her şeyi ezer). Bulut YOKTUR; dosya Git'e girmez.
//
// Motor: sql.js (SQLite'ın WebAssembly derlemesi). Neden: yerel (native) derleme gerektirmez;
// macOS arm64 ve Windows x64'te düz "npm install" ile, derleme araçları ve ağdan ikili indirme
// olmadan çalışır (bkz. rapordaki gerekçe). Bedeli: veritabanı BELLEKTE tutulur ve her yazma
// işleminden (islem) sonra dosyanın TAMAMI atomik olarak (geçici dosya + rename) diske yazılır.
// Platform verisi (senaryo, profil, koşu özeti) birkaç MB mertebesinde olduğundan bu kabul
// edilebilir.
//
// ÖNEMLİ sql.js davranışı: Database#export() bağlantıyı kapatıp yeniden açar ve PRAGMA'lar
// (foreign_keys, secure_delete) SIFIRLANIR. Bu yüzden her kalıcı yazmadan sonra pragmalar
// yeniden uygulanır (pragmalariUygula).
//
// Tek sahip kuralı: dosyayı aynı anda yalnızca BİR süreç (normalde test sunucusu) yazmalıdır.
// Yüklemeden sonra dosya başka bir süreç tarafından değiştirilirse (mtime/boyut farkı) yazma
// reddedilir; böylece iki süreç birbirinin verisini sessizce ezemez.

// NOT: Bu modül (ve depo/kasa/yedek) import.meta KULLANMAZ — Playwright birim testleri bu
// dosyaları CommonJS'e çevirerek yükler ve import.meta orada çalışmaz. Proje kökü gereken
// yerde (varsayılan veritabanı yolu) çağıran taraf kökü parametre olarak verir.
import initSqlJsHam from 'sql.js';
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { VERITABANI_DOSYASI, calismaAlaniniCoz, veriKoku } from '../calisma-alanlari.mjs';

/** @type {(yapilandirma?: object) => Promise<{ Database: new (veri?: Uint8Array) => SqlJsVeritabani }>} */
const initSqlJs = /** @type {never} */ (initSqlJsHam);

/**
 * @typedef {{
 *   run(sql: string, parametreler?: unknown[]): void;
 *   exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
 *   prepare(sql: string): SqlJsIfade;
 *   export(): Uint8Array;
 *   close(): void;
 *   getRowsModified(): number;
 * }} SqlJsVeritabani
 * @typedef {{
 *   bind(parametreler?: unknown[]): boolean;
 *   step(): boolean;
 *   getAsObject(): Record<string, unknown>;
 *   free(): boolean;
 * }} SqlJsIfade
 */

/** Proje köküne göre varsayılan veritabanı yolu (veri/platform.db). */
export const VARSAYILAN_VERITABANI_GORELI_YOLU = join('veri', 'platform.db');

/**
 * Veritabanı yolu: PLATFORM_VERITABANI varsa o; yoksa çalışma alanı kayıt defterine göre (NOBETCI_CALISMA_ALANI ya da
 * son açılan çalışma alanı); kayıt defteri yoksa <veri kökü>/platform.db (veri kökü: NOBETCI_VERI_KOKU ya da
 * <projeKoku>/veri). Kayıt defterini DEĞİŞTİRMEZ.
 * @param {string} [projeKoku] verilmezse çalışma klasörü (npm betikleri proje kökünde çalışır)
 */
export function veritabaniYolu(projeKoku = process.cwd()) {
  const ortam = process.env.PLATFORM_VERITABANI;
  if (ortam && ortam.trim()) return resolve(ortam.trim());
  const kok = veriKoku(projeKoku);
  const secim = calismaAlaniniCoz(kok);
  return secim ? secim.yollar.veritabani : resolve(kok, VERITABANI_DOSYASI);
}

/** Değişiklik sayacı (meta): her kalıcı değişiklikte artar; "son dışa aktarımdan beri değişti mi?" için. */
export const DEGISIKLIK_SAYACI_META = 'degisiklik_sayaci';

/** @type {Promise<{ Database: new (veri?: Uint8Array) => SqlJsVeritabani }> | undefined} */
let sqlModulu;
function sqlModulunuYukle() {
  sqlModulu ??= initSqlJs();
  return sqlModulu;
}

/** sql.js'e verilecek parametreleri normalleştirir (undefined → null, boolean → 0/1). */
function parametreleriHazirla(parametreler) {
  return parametreler.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function bekle(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Atomik dosya yazma: geçici dosyaya yaz + fsync + rename (Windows'ta kısa yeniden deneme). */
export function atomikIkiliYaz(hedef, veri) {
  mkdirSync(dirname(hedef), { recursive: true });
  const gecici = `${hedef}.${process.pid}.${Date.now()}.gecici`;
  const fd = openSync(gecici, 'w', 0o600);
  try {
    let yazilan = 0;
    while (yazilan < veri.length) yazilan += writeSync(fd, veri, yazilan, veri.length - yazilan);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  for (let deneme = 0; ; deneme++) {
    try {
      renameSync(gecici, hedef);
      return;
    } catch (hata) {
      // Windows'ta virüs tarayıcısı/indeksleyici hedefi kısa süre kilitleyebilir.
      if (deneme >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(/** @type {NodeJS.ErrnoException} */ (hata).code ?? '')) {
        try { unlinkSync(gecici); } catch { /* yok sayılır */ }
        throw hata;
      }
      bekle(50 * (deneme + 1));
    }
  }
}

export class Veritabani {
  /**
   * @param {SqlJsVeritabani} db
   * @param {string | null} yol  null = yalnızca bellek (kalıcı değil)
   */
  constructor(db, yol) {
    this.db = db;
    this.yol = yol;
    this.islemDerinligi = 0;
    /** @type {{ mtimeMs: number; size: number } | null} */
    this.diskIzi = null;
    this.kapali = false;
    this.sayacAtla = false;
    this.pragmalariUygula();
  }

  pragmalariUygula() {
    // secure_delete: silinen/güncellenen içerik (ör. eski şifreli değerler) boş sayfalarda
    // okunabilir halde kalmasın diye sıfırlanır.
    this.db.run('PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
  }

  diskIziniGuncelle() {
    if (!this.yol || !existsSync(this.yol)) {
      this.diskIzi = null;
      return;
    }
    const s = statSync(this.yol);
    this.diskIzi = { mtimeMs: s.mtimeMs, size: s.size };
  }

  kontrolEt() {
    if (this.kapali) throw new Error('Veritabanı bağlantısı kapatılmış.');
  }

  /**
   * Satır döndürmeyen SQL çalıştırır. Transaction dışında çağrılırsa otomatik olarak tek
   * komutluk bir işlem içinde çalışır ve diske yazılır.
   * @param {string} sql
   * @param {unknown[]} [parametreler]
   */
  calistir(sql, parametreler = []) {
    this.kontrolEt();
    if (this.islemDerinligi === 0) {
      this.islem(() => this.calistir(sql, parametreler));
      return;
    }
    this.db.run(sql, parametreleriHazirla(parametreler));
  }

  /**
   * @param {string} sql
   * @param {unknown[]} [parametreler]
   * @returns {Record<string, unknown>[]}
   */
  tumu(sql, parametreler = []) {
    this.kontrolEt();
    const ifade = this.db.prepare(sql);
    try {
      ifade.bind(parametreleriHazirla(parametreler));
      const satirlar = [];
      while (ifade.step()) satirlar.push(ifade.getAsObject());
      return satirlar;
    } finally {
      ifade.free();
    }
  }

  /**
   * @param {string} sql
   * @param {unknown[]} [parametreler]
   * @returns {Record<string, unknown> | undefined}
   */
  tek(sql, parametreler = []) {
    return this.tumu(sql, parametreler)[0];
  }

  /**
   * Fonksiyonu tek bir transaction içinde çalıştırır; hata olursa HİÇBİR şey yazılmaz
   * (ROLLBACK). İç içe çağrılar dıştaki işleme katılır. En dıştaki işlem bitince dosya
   * diske atomik olarak yazılır.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  islem(fn) {
    this.kontrolEt();
    if (this.islemDerinligi > 0) {
      this.islemDerinligi++;
      try {
        return fn();
      } finally {
        this.islemDerinligi--;
      }
    }
    this.db.run('BEGIN IMMEDIATE');
    this.islemDerinligi = 1;
    let sonuc;
    try {
      const oncekiDegisiklik = this.toplamDegisiklik();
      sonuc = fn();
      // Satır değiştiren her işlem değişiklik sayacını artırır (sayacAtla: yalnızca işaret yazan işlemler).
      if (!this.sayacAtla && this.toplamDegisiklik() !== oncekiDegisiklik) this.degisiklikSayaciniArtir();
      this.islemDerinligi = 0;
      this.db.run('COMMIT');
    } catch (hata) {
      this.islemDerinligi = 0;
      try { this.db.run('ROLLBACK'); } catch { /* işlem zaten kapanmış olabilir */ }
      throw hata;
    }
    this.kaydet();
    return sonuc;
  }

  /** Bağlantının açılışından beri değişen satır sayısı (sqlite total_changes). */
  toplamDegisiklik() {
    try {
      return Number(this.tek('SELECT total_changes() AS n')?.n ?? 0);
    } catch {
      return 0;
    }
  }

  /** meta.degisiklik_sayaci += 1 (meta tablosu henüz yoksa — ilk göç öncesi — atlanır). */
  degisiklikSayaciniArtir() {
    try {
      this.db.run(
        `INSERT INTO meta (anahtar, deger) VALUES ('${DEGISIKLIK_SAYACI_META}', '1')
         ON CONFLICT(anahtar) DO UPDATE SET deger = CAST(CAST(deger AS INTEGER) + 1 AS TEXT)`
      );
    } catch { /* meta tablosu yok */ }
  }

  /** Değişiklik sayacını artırmadan (ör. "son dışa aktarma" işaretini yazarken) işlem yapar. @template T @param {() => T} fn @returns {T} */
  sayacsizIslem(fn) {
    const onceki = this.sayacAtla;
    this.sayacAtla = true;
    try {
      return this.islem(fn);
    } finally {
      this.sayacAtla = onceki;
    }
  }

  /** Belleği diske yazar (atomik). Başka süreç dosyayı değiştirdiyse reddeder. */
  kaydet() {
    if (!this.yol) return;
    if (this.diskIzi && existsSync(this.yol)) {
      const s = statSync(this.yol);
      if (s.mtimeMs !== this.diskIzi.mtimeMs || s.size !== this.diskIzi.size) {
        throw new Error(
          `Veritabanı dosyası (${this.yol}) başka bir süreç tarafından değiştirilmiş; veri ezilmesin diye yazma ` +
            'durduruldu. Diğer süreci (ör. ikinci bir test sunucusu) kapatıp sunucuyu yeniden başlatın.'
        );
      }
    }
    const veri = this.db.export();
    this.pragmalariUygula();
    atomikIkiliYaz(this.yol, Buffer.from(veri.buffer, veri.byteOffset, veri.byteLength));
    this.diskIziniGuncelle();
  }

  /** @param {string} anahtar @returns {string | undefined} */
  metaOku(anahtar) {
    const satir = this.tek('SELECT deger FROM meta WHERE anahtar = ?', [anahtar]);
    return satir ? String(satir.deger) : undefined;
  }

  /** @param {string} anahtar @param {string} deger */
  metaYaz(anahtar, deger) {
    this.calistir(
      'INSERT INTO meta (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger',
      [anahtar, deger]
    );
  }

  kapat() {
    if (this.kapali) return;
    this.db.close();
    this.kapali = true;
  }
}

/**
 * Veritabanını açar (dosya yoksa ve olustur=true ise boş oluşturur). Göçleri UYGULAMAZ —
 * bunun için gocler.mjs > veritabaniniHazirla kullanılır.
 * saltOkunur: dosya belleğe yüklenir ama bağlantı dosyaya HİÇ yazmaz (yol = null). Test
 * süreçleri (tests/support/platform-veri.ts) sunucunun sahip olduğu dosyayı böyle okur.
 * @param {string | null} yol null = yalnızca bellek
 * @param {{ olustur?: boolean; saltOkunur?: boolean }} [secenekler]
 */
export async function veritabaniAc(yol, secenekler = {}) {
  const SQL = await sqlModulunuYukle();
  if (secenekler.saltOkunur) {
    if (!yol || !existsSync(yol)) throw new Error(`Veritabanı dosyası bulunamadı: ${yol}`);
    return new Veritabani(new SQL.Database(new Uint8Array(readFileSync(yol))), null);
  }
  if (yol && existsSync(yol)) {
    const vt = new Veritabani(new SQL.Database(new Uint8Array(readFileSync(yol))), yol);
    vt.diskIziniGuncelle();
    return vt;
  }
  if (yol && secenekler.olustur === false) {
    throw new Error(`Veritabanı dosyası bulunamadı: ${yol}`);
  }
  return new Veritabani(new SQL.Database(), yol);
}
