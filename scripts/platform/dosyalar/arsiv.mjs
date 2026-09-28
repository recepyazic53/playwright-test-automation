// ARŞİV ARAÇLARI (bağımlılıksız) — macOS paketi Windows'ta üretilirken Unix izinleri ve sembolik bağlantılar Windows diskine
// hiç açılmadan korunur: kaynak ZIP (Playwright tarayıcıları) ve tar.gz (Node) bellekte okunur, girdiler modları ve bağlantı
// hedefleriyle doğrudan hedef tar.gz'ye yazılır. Tipler: arsiv.d.mts.
//   zipGirdileri(buf)   : ZIP merkez dizini (Zip64 dâhil) → girdiler (Unix modu, sembolik bağlantı, CRC denetimli açma)
//   tarGirdileri(buf)   : tar ya da tar.gz → girdiler (ustar, pax "x", GNU "L"/"K" uzun adlar)
//   TarYazici           : ustar + pax (uzun / ASCII dışı adlar) yazar, gzip ile akıtır (geri basınç gözetilir)
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { crc32, createGzip, gunzipSync, inflateRawSync } from 'node:zlib';

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

/**
 * @typedef {{ ad: string; tur: 'dosya' | 'klasor' | 'baglanti'; mod: number | null; boyut: number; veri: () => Buffer }} ZipGirdisi
 * mod: ZIP'e Unix'te (ya da macOS'ta) eklenmiş girdinin izin bitleri (yoksa null). baglanti: veri() hedef yoludur.
 */

/** @param {Buffer} b */
function eocdBul(b) {
  const alt = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= alt; i--) if (b.readUInt32LE(i) === 0x06054b50) return i;
  throw new Error('ZIP dosyası bozuk: merkez dizin sonu bulunamadı.');
}

/**
 * ZIP girdileri (merkez dizinden). Yalnız "stored" (0) ve "deflate" (8) desteklenir; açılan veri CRC-32 ile denetlenir.
 * @param {Buffer} b
 * @returns {ZipGirdisi[]}
 */
export function zipGirdileri(b) {
  const e = eocdBul(b);
  let adet = b.readUInt16LE(e + 10);
  let cdKonum = b.readUInt32LE(e + 16);
  if (adet === 0xffff || cdKonum === 0xffffffff) {
    const bulucu = e - 20;
    if (bulucu < 0 || b.readUInt32LE(bulucu) !== 0x07064b50) throw new Error('ZIP dosyası bozuk: Zip64 bulucu yok.');
    const z = Number(b.readBigUInt64LE(bulucu + 8));
    if (b.readUInt32LE(z) !== 0x06064b50) throw new Error('ZIP dosyası bozuk: Zip64 dizin sonu yok.');
    adet = Number(b.readBigUInt64LE(z + 32));
    cdKonum = Number(b.readBigUInt64LE(z + 48));
  }
  /** @type {ZipGirdisi[]} */
  const girdiler = [];
  let p = cdKonum;
  for (let n = 0; n < adet; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP dosyası bozuk: merkez dizin girdisi beklenirken başka veri.');
    const yapan = b.readUInt16LE(p + 4) >> 8;
    const yontem = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    let sikisik = b.readUInt32LE(p + 20);
    let acik = b.readUInt32LE(p + 24);
    const adUz = b.readUInt16LE(p + 28);
    const ekUz = b.readUInt16LE(p + 30);
    const aciklamaUz = b.readUInt16LE(p + 32);
    const disOznitelik = b.readUInt32LE(p + 38);
    let yerel = b.readUInt32LE(p + 42);
    const ad = b.subarray(p + 46, p + 46 + adUz).toString('utf8');
    // Zip64 ek alanı: yalnız 0xFFFFFFFF olan alanlar sırasıyla (açık, sıkışık, yerel konum) buradadır.
    let q = p + 46 + adUz;
    const ekSon = q + ekUz;
    while (q + 4 <= ekSon) {
      const kimlik = b.readUInt16LE(q);
      const uz = b.readUInt16LE(q + 2);
      if (kimlik === 0x0001) {
        let r = q + 4;
        if (acik === 0xffffffff) { acik = Number(b.readBigUInt64LE(r)); r += 8; }
        if (sikisik === 0xffffffff) { sikisik = Number(b.readBigUInt64LE(r)); r += 8; }
        if (yerel === 0xffffffff) { yerel = Number(b.readBigUInt64LE(r)); r += 8; }
      }
      q += 4 + uz;
    }
    p = ekSon + aciklamaUz;
    const unixMod = (yapan === 3 || yapan === 19) ? (disOznitelik >>> 16) : 0;
    const tur = (unixMod & S_IFMT) === S_IFLNK ? 'baglanti'
      : (ad.endsWith('/') || (unixMod & S_IFMT) === S_IFDIR || (disOznitelik & 0x10) !== 0) ? 'klasor' : 'dosya';
    const veri = () => {
      if (b.readUInt32LE(yerel) !== 0x04034b50) throw new Error(`ZIP dosyası bozuk: "${ad}" yerel başlığı yok.`);
      const bas = yerel + 30 + b.readUInt16LE(yerel + 26) + b.readUInt16LE(yerel + 28);
      const ham = b.subarray(bas, bas + sikisik);
      let cikti;
      if (yontem === 0) cikti = Buffer.from(ham);
      else if (yontem === 8) cikti = inflateRawSync(ham);
      else throw new Error(`ZIP sıkıştırma yöntemi desteklenmiyor (${yontem}): ${ad}`);
      if (cikti.length !== acik || crc32(cikti) !== crc) throw new Error(`ZIP girdisi bozuk (boyut/CRC uyuşmuyor): ${ad}`);
      return cikti;
    };
    girdiler.push({ ad: tur === 'klasor' ? ad.replace(/\/+$/, '') : ad, tur, mod: unixMod ? (unixMod & 0o7777) : null, boyut: acik, veri });
  }
  return girdiler;
}

/**
 * @typedef {{ ad: string; tur: 'dosya' | 'klasor' | 'baglanti' | 'diger'; mod: number; hedef: string; veri: Buffer }} TarGirdisi
 */

/** @param {Buffer} b @param {number} bas @param {number} uz */
const metin = (b, bas, uz) => { const s = b.subarray(bas, bas + uz); const z = s.indexOf(0); return (z >= 0 ? s.subarray(0, z) : s).toString('utf8'); };
/** @param {Buffer} b @param {number} bas @param {number} uz */
function sekizli(b, bas, uz) {
  if (b[bas] & 0x80) { // GNU ikili (base-256) boyut
    let n = 0;
    for (let i = 1; i < uz; i++) n = n * 256 + b[bas + i];
    return n;
  }
  const s = metin(b, bas, uz).trim();
  return s ? parseInt(s, 8) : 0;
}

/**
 * tar ya da tar.gz girdileri.
 * @param {Buffer} arsiv
 * @returns {TarGirdisi[]}
 */
export function tarGirdileri(arsiv) {
  const b = arsiv[0] === 0x1f && arsiv[1] === 0x8b ? gunzipSync(arsiv) : arsiv;
  /** @type {TarGirdisi[]} */
  const girdiler = [];
  /** @type {Record<string, string>} */
  let pax = {};
  let uzunAd = '';
  let uzunHedef = '';
  let p = 0;
  while (p + 512 <= b.length) {
    const h = b.subarray(p, p + 512);
    if (h.every((x) => x === 0)) break;
    const tip = String.fromCharCode(h[156] || 0x30);
    const boyut = pax.size !== undefined ? Number(pax.size) : sekizli(h, 124, 12);
    const veri = b.subarray(p + 512, p + 512 + boyut);
    p += 512 + Math.ceil(boyut / 512) * 512;
    if (tip === 'x') {
      pax = {};
      let r = 0;
      const s = veri;
      while (r < s.length) {
        const bosluk = s.indexOf(0x20, r);
        const uz = parseInt(s.subarray(r, bosluk).toString('ascii'), 10);
        if (!uz) break;
        const kayit = s.subarray(bosluk + 1, r + uz - 1).toString('utf8');
        const esit = kayit.indexOf('=');
        pax[kayit.slice(0, esit)] = kayit.slice(esit + 1);
        r += uz;
      }
      continue;
    }
    if (tip === 'g') continue;
    if (tip === 'L') { uzunAd = metin(veri, 0, veri.length); continue; }
    if (tip === 'K') { uzunHedef = metin(veri, 0, veri.length); continue; }
    const onEk = h.subarray(257, 262).toString('ascii') === 'ustar' ? metin(h, 345, 155) : '';
    let ad = pax.path ?? (uzunAd || (onEk ? `${onEk}/${metin(h, 0, 100)}` : metin(h, 0, 100)));
    const hedef = pax.linkpath ?? (uzunHedef || metin(h, 157, 100));
    ad = ad.replace(/^\.\//, '').replace(/\/+$/, '');
    const tur = tip === '0' || tip === '\0' || tip === '7' ? 'dosya' : tip === '5' ? 'klasor' : tip === '2' ? 'baglanti' : 'diger';
    girdiler.push({ ad, tur, mod: sekizli(h, 100, 8) & 0o7777, hedef, veri: Buffer.from(veri) });
    pax = {};
    uzunAd = '';
    uzunHedef = '';
  }
  return girdiler;
}

/** Mach-O (tek ya da evrensel) ikili mi, ya da "#!" betiği mi? (kaynakta Unix modu yoksa yürütülebilirlik tahmini) @param {Buffer} v */
export function yurutulebilirIcerikMi(v) {
  if (v.length >= 2 && v[0] === 0x23 && v[1] === 0x21) return true;
  if (v.length < 4) return false;
  const m = v.readUInt32BE(0);
  return [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf].includes(m);
}

/** @param {number} deger @param {number} uz basamak (sonuna NUL eklenir) */
const sekizliAlan = (deger, uz) => deger.toString(8).padStart(uz, '0');

/**
 * tar.gz yazıcı. Girdiler "/" ayraçlı göreli yollarla verilir; ASCII dışı ya da uzun adlar pax başlığıyla yazılır.
 * Her kayıt için mod açıkça verilir (klasör 0755, dosya 0644/0755, bağlantı 0777).
 */
export class TarYazici {
  /** @param {string} hedefYol @param {{ zaman?: number; seviye?: number }} [secenek] */
  constructor(hedefYol, secenek = {}) {
    this.zaman = Math.floor((secenek.zaman ?? Date.now()) / 1000);
    this.gz = createGzip({ level: secenek.seviye ?? 6 });
    this.cikti = createWriteStream(hedefYol);
    this.gz.pipe(this.cikti);
    this.bayt = 0;
    /** @type {Map<string, { tur: 'dosya' | 'klasor' | 'baglanti'; mod: number; boyut: number; hedef?: string }>} */
    this.kayitlar = new Map();
  }

  /** @param {Buffer} parca */
  async yaz(parca) {
    this.bayt += parca.length;
    if (!this.gz.write(parca)) await once(this.gz, 'drain');
  }

  /**
   * @param {string} ad @param {'0' | '2' | '5' | 'x'} tip @param {number} mod @param {number} boyut @param {string} [hedef]
   * @returns {Buffer}
   */
  baslik(ad, tip, mod, boyut, hedef = '') {
    const h = Buffer.alloc(512, 0);
    h.write(ad, 0, 100, 'utf8');
    h.write(`${sekizliAlan(mod, 7)}\0`, 100, 'ascii');
    h.write(`${sekizliAlan(0, 7)}\0`, 108, 'ascii');
    h.write(`${sekizliAlan(0, 7)}\0`, 116, 'ascii');
    h.write(`${sekizliAlan(boyut, 11)}\0`, 124, 'ascii');
    h.write(`${sekizliAlan(this.zaman, 11)}\0`, 136, 'ascii');
    h.write('        ', 148, 'ascii');
    h.write(tip, 156, 'ascii');
    h.write(hedef, 157, 100, 'utf8');
    h.write('ustar\0', 257, 'ascii');
    h.write('00', 263, 'ascii');
    let t = 0;
    for (const x of h) t += x;
    h.write(`${sekizliAlan(t, 6)}\0 `, 148, 'ascii');
    return h;
  }

  /** @param {string} ad @param {'0' | '2' | '5'} tip @param {number} mod @param {number} boyut @param {string} [hedef] */
  async basliklariYaz(ad, tip, mod, boyut, hedef = '') {
    const asciiKisa = (/** @type {string} */ s) => /^[\x20-\x7e]*$/.test(s) && Buffer.byteLength(s) < 100;
    let ustarAd = ad;
    if (!asciiKisa(ad) || !asciiKisa(hedef)) {
      /** @param {string} anahtar @param {string} deger */
      const kayit = (anahtar, deger) => {
        const govde = ` ${anahtar}=${deger}\n`;
        let uz = Buffer.byteLength(govde) + 1;
        while (Buffer.byteLength(`${uz}${govde}`) !== uz) uz = Buffer.byteLength(`${uz}${govde}`);
        return `${uz}${govde}`;
      };
      const pax = Buffer.from((asciiKisa(ad) ? '' : kayit('path', ad)) + (hedef && !asciiKisa(hedef) ? kayit('linkpath', hedef) : ''), 'utf8');
      await this.yaz(this.baslik(`PaxHeaders/${ad.replace(/[^\x20-\x7e]/g, '_')}`.slice(0, 99), 'x', 0o644, pax.length));
      await this.yaz(pax);
      await this.yaz(Buffer.alloc((512 - (pax.length % 512)) % 512));
      ustarAd = ad.replace(/[^\x20-\x7e]/g, '_').slice(-99);
    }
    await this.yaz(this.baslik(ustarAd, tip, mod, boyut, hedef.replace(/[^\x20-\x7e]/g, '_').slice(0, 99)));
  }

  /** @param {string} ad */
  denetle(ad) {
    if (!ad || ad.startsWith('/') || ad.split('/').some((p) => p === '..' || p === '')) throw new Error(`Geçersiz arşiv yolu: ${ad}`);
    if (this.kayitlar.has(ad)) throw new Error(`Arşivde yinelenen yol: ${ad}`);
  }

  /** Üst klasörleri (henüz yazılmadıysa) 0755 ile yazar. @param {string} ad */
  async ustler(ad) {
    const p = ad.split('/');
    for (let i = 1; i < p.length; i++) {
      const u = p.slice(0, i).join('/');
      if (!this.kayitlar.has(u)) await this.klasor(u);
    }
  }

  /** @param {string} ad @param {number} [mod] */
  async klasor(ad, mod = 0o755) {
    if (this.kayitlar.get(ad)?.tur === 'klasor') return;
    this.denetle(ad);
    await this.ustler(ad);
    this.kayitlar.set(ad, { tur: 'klasor', mod, boyut: 0 });
    await this.basliklariYaz(`${ad}/`, '5', mod, 0);
  }

  /** @param {string} ad @param {Buffer} veri @param {number} mod */
  async dosya(ad, veri, mod) {
    this.denetle(ad);
    await this.ustler(ad);
    this.kayitlar.set(ad, { tur: 'dosya', mod, boyut: veri.length });
    await this.basliklariYaz(ad, '0', mod, veri.length);
    await this.yaz(veri);
    const dolgu = (512 - (veri.length % 512)) % 512;
    if (dolgu) await this.yaz(Buffer.alloc(dolgu));
  }

  /** @param {string} ad @param {string} hedef */
  async baglanti(ad, hedef) {
    this.denetle(ad);
    if (!hedef || hedef.startsWith('/')) throw new Error(`Mutlak ya da boş bağlantı hedefi: ${ad} -> ${hedef}`);
    await this.ustler(ad);
    this.kayitlar.set(ad, { tur: 'baglanti', mod: 0o777, boyut: 0, hedef });
    await this.basliklariYaz(ad, '2', 0o777, 0, hedef);
  }

  async bitir() {
    await this.yaz(Buffer.alloc(1024));
    this.gz.end();
    await finished(this.cikti);
  }
}
