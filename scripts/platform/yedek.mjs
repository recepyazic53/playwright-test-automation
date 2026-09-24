// PLATFORM YEDEĞİ — tüm platform verisini TEK bir şifreli dosyaya (.tayedek) yazar ve geri
// yükler. Yedekler YALNIZCA yerel diske yazılır (bulut yok).
//
// Dosya biçimi (ikili, sürüm 1):
//   0   8  sihirli "TAYEDEK\0"
//   8   1  biçim sürümü (1)
//   9   1  kasa scrypt log2(N)
//  10   1  kasa scrypt r
//  11   1  kasa scrypt p
//  12  16  kasa tuzu            → kasaAnahtari = scrypt(parola, kasaTuzu)
//  28  16  dosya tuzu (ayrı)    → dosyaAnahtari = HKDF-SHA256(kasaAnahtari, dosyaTuzu, "platform-yedek-v1")
//  44  12  IV
//  56  16  GCM doğrulama etiketi
//  72   …  AES-256-GCM(gzip(JSON)) — başlığın ilk 56 baytı AAD olarak doğrulanır (başlık
//          değiştirilirse dosya açılmaz).
// İçerik JSON'u: { manifest: { bicimSurumu, semaSurumu, olusturulma, makine, sayimlar },
//                  kasa: { kdf, dogrulayici }, tablolar: { <tablo>: satırlar[] } }
// Manifest de şifrelidir (sayım bilgisi bile parolasız okunamaz).
//
// Neden dosya anahtarı kasa anahtarından türetiliyor: sunucu parolayı DEĞİL yalnızca türetilmiş
// kasa anahtarını bellekte tutar; otomatik yedek bu sayede parola sormadan alınabilir. Geri
// yüklerken parola + başlıktaki kasa tuzu ile aynı anahtar yeniden türetilir. Parola sonradan
// değişse bile eski yedek, eski parolayla açılır.
//
// Hassas alanlar yedekte de kasa zarfı olarak (çift şifreli) kalır.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomikIkiliYaz } from './veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, TABLOLAR, mevcutSemaSurumu } from './veritabani/gocler.mjs';
import { gecmisYaz, sayimlar, yerelMakine } from './veritabani/depo.mjs';
import {
  KasaHatasi, acikAnahtar, anahtarDogrulayiciyaUyarMi, anahtarTuret, kasaDurumu, kasaKdfOku, kasayiAnahtarlaAc,
  metindekiZarflariDonustur, zarfCoz, zarfSifrele
} from './kasa.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {(asama: string, yuzde: number) => void} IlerlemeFn */

export const YEDEK_UZANTISI = '.tayedek';
export const BICIM_SURUMU = 1;
export const OTOMATIK_SAKLAMA_SAYISI = 30;
const SIHIRLI = Buffer.from('TAYEDEK\0', 'latin1');
const BASLIK_AAD_BOYUTU = 56;
const BASLIK_BOYUTU = 72;
const HKDF_BILGI = Buffer.from('platform-yedek-v1', 'utf8');
const OTOMATIK_DESEN = /^otomatik-\d{8}-\d{6}-\d{3}\.tayedek$/;

export class YedekHatasi extends Error {
  /**
   * @param {'BICIM' | 'SURUM' | 'ONAY_GEREKLI' | 'KASA_UYUSMAZ' | 'VERI'} kod
   * @param {string} mesaj
   */
  constructor(kod, mesaj) {
    super(mesaj);
    this.name = 'YedekHatasi';
    this.kod = kod;
  }
}

/** @param {Veritabani} vt */
export function varsayilanYedekKlasoru(vt) {
  const ortam = process.env.PLATFORM_YEDEK_KLASORU;
  if (ortam && ortam.trim()) return ortam.trim();
  return join(vt.yol ? dirname(vt.yol) : process.cwd(), 'yedekler');
}

/** @param {Buffer} kasaAnahtari @param {Buffer} dosyaTuzu */
function dosyaAnahtari(kasaAnahtari, dosyaTuzu) {
  return Buffer.from(hkdfSync('sha256', kasaAnahtari, dosyaTuzu, HKDF_BILGI, 32));
}

/** @param {number} n */
function log2Tam(n) {
  const l = Math.log2(n);
  if (!Number.isInteger(l) || l < 1 || l > 30) throw new YedekHatasi('BICIM', 'Geçersiz scrypt parametresi.');
  return l;
}

/** @param {Veritabani} vt @param {string} tablo */
function tabloSutunlari(vt, tablo) {
  return vt.tumu(`PRAGMA table_info(${tablo})`).map((s) => String(s.name));
}

/**
 * Tüm veriyi şifreli yedek dosyası içeriğine (Buffer) çevirir. Kasa AÇIK olmalıdır.
 * @param {Veritabani} vt
 * @param {{ ilerleme?: IlerlemeFn }} [secenekler]
 */
export function yedekOlustur(vt, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  const kasaAnahtari = acikAnahtar(vt);
  const kdf = kasaKdfOku(vt);
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!kdf || !dogrulayici) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
  ilerleme('veri okunuyor', 5);
  /** @type {Record<string, Record<string, unknown>[]>} */
  const tablolar = {};
  TABLOLAR.forEach((t, i) => {
    tablolar[t.ad] = vt.tumu(`SELECT * FROM ${t.ad} ORDER BY rowid`);
    ilerleme('veri okunuyor', 5 + Math.round((45 * (i + 1)) / TABLOLAR.length));
  });
  const icerik = {
    manifest: {
      bicimSurumu: BICIM_SURUMU,
      semaSurumu: mevcutSemaSurumu(vt),
      olusturulma: new Date().toISOString(),
      makine: yerelMakine(vt),
      sayimlar: sayimlar(vt)
    },
    kasa: { kdf, dogrulayici },
    tablolar
  };
  ilerleme('sıkıştırılıyor', 55);
  const sikistirilmis = gzipSync(Buffer.from(JSON.stringify(icerik), 'utf8'), { level: 9 });
  ilerleme('şifreleniyor', 80);
  const kasaTuzu = Buffer.from(kdf.tuz, 'base64url');
  if (kasaTuzu.length !== 16) throw new YedekHatasi('BICIM', 'Kasa tuzu beklenen uzunlukta değil.');
  const dosyaTuzu = randomBytes(16);
  const iv = randomBytes(12);
  const baslik = Buffer.alloc(BASLIK_AAD_BOYUTU);
  SIHIRLI.copy(baslik, 0);
  baslik.writeUInt8(BICIM_SURUMU, 8);
  baslik.writeUInt8(log2Tam(kdf.N), 9);
  baslik.writeUInt8(kdf.r, 10);
  baslik.writeUInt8(kdf.p, 11);
  kasaTuzu.copy(baslik, 12);
  dosyaTuzu.copy(baslik, 28);
  iv.copy(baslik, 44);
  const anahtar = dosyaAnahtari(kasaAnahtari, dosyaTuzu);
  const sifreleyici = createCipheriv('aes-256-gcm', anahtar, iv);
  sifreleyici.setAAD(baslik);
  const sifreli = Buffer.concat([sifreleyici.update(sikistirilmis), sifreleyici.final()]);
  const sonuc = Buffer.concat([baslik, sifreleyici.getAuthTag(), sifreli]);
  anahtar.fill(0);
  ilerleme('tamamlandı', 100);
  return { veri: sonuc, manifest: icerik.manifest };
}

/**
 * Yedek dosyasını parolayla açar ve doğrular. HİÇBİR ŞEY YAZMAZ.
 * @param {Buffer} dosya
 * @param {string} parola
 * @param {{ ilerleme?: IlerlemeFn }} [secenekler]
 */
export async function yedekAc(dosya, parola, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  ilerleme('dosya kontrol ediliyor', 2);
  if (!Buffer.isBuffer(dosya) || dosya.length < BASLIK_BOYUTU + 1 || !dosya.subarray(0, 8).equals(SIHIRLI)) {
    throw new YedekHatasi('BICIM', 'Dosya bir platform yedeği (.tayedek) değil veya bozuk.');
  }
  const surum = dosya.readUInt8(8);
  if (surum !== BICIM_SURUMU) {
    throw new YedekHatasi('SURUM', `Yedek biçim sürümü (${surum}) desteklenmiyor; uygulamayı güncelleyin.`);
  }
  const log2N = dosya.readUInt8(9);
  const kdf = { N: 2 ** log2N, r: dosya.readUInt8(10), p: dosya.readUInt8(11) };
  if (log2N < 10 || log2N > 22 || kdf.r < 1 || kdf.r > 32 || kdf.p < 1 || kdf.p > 16) {
    throw new YedekHatasi('BICIM', 'Yedek başlığındaki anahtar parametreleri geçersiz.');
  }
  const baslik = dosya.subarray(0, BASLIK_AAD_BOYUTU);
  const kasaTuzu = dosya.subarray(12, 28);
  const dosyaTuzu = dosya.subarray(28, 44);
  const iv = dosya.subarray(44, 56);
  const etiket = dosya.subarray(56, 72);
  if (typeof parola !== 'string' || !parola) throw new KasaHatasi('PAROLA_YANLIS', 'Yedek parolası yanlış veya dosya bozuk.');
  ilerleme('parola doğrulanıyor', 10);
  const kasaAnahtari = await anahtarTuret(parola, kdf, Buffer.from(kasaTuzu));
  const anahtar = dosyaAnahtari(kasaAnahtari, Buffer.from(dosyaTuzu));
  let sikistirilmis;
  try {
    const cozucu = createDecipheriv('aes-256-gcm', anahtar, iv);
    cozucu.setAAD(baslik);
    cozucu.setAuthTag(etiket);
    sikistirilmis = Buffer.concat([cozucu.update(dosya.subarray(BASLIK_BOYUTU)), cozucu.final()]);
  } catch {
    kasaAnahtari.fill(0);
    throw new KasaHatasi('PAROLA_YANLIS', 'Yedek parolası yanlış veya dosya bozuk. Bu yedeği oluşturduğunuz kasa parolasını girin.');
  } finally {
    anahtar.fill(0);
  }
  ilerleme('açılıyor', 35);
  /** @type {unknown} */
  let icerik;
  try {
    icerik = JSON.parse(gunzipSync(sikistirilmis).toString('utf8'));
  } catch {
    kasaAnahtari.fill(0);
    throw new YedekHatasi('BICIM', 'Yedek içeriği okunamadı (bozuk dosya).');
  }
  ilerleme('içerik doğrulanıyor', 45);
  const dogrulanmis = icerikDogrula(icerik);
  if (!anahtarDogrulayiciyaUyarMi(kasaAnahtari, dogrulanmis.kasa.dogrulayici)
    || dogrulanmis.kasa.kdf.tuz !== Buffer.from(kasaTuzu).toString('base64url')) {
    kasaAnahtari.fill(0);
    throw new YedekHatasi('KASA_UYUSMAZ', 'Yedekteki kasa bilgisi başlıkla uyuşmuyor (bozuk dosya).');
  }
  return { ...dogrulanmis, kasaAnahtari };
}

/**
 * @param {unknown} icerik
 * @returns {{ manifest: { bicimSurumu: number; semaSurumu: number; olusturulma: string; makine: { id: string; ad: string }; sayimlar: Record<string, number> }; kasa: { kdf: { alg: 'scrypt'; N: number; r: number; p: number; tuz: string }; dogrulayici: string }; tablolar: Record<string, Record<string, unknown>[]> }}
 */
function icerikDogrula(icerik) {
  const nesne = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
  if (!nesne(icerik)) throw new YedekHatasi('VERI', 'Yedek içeriği geçersiz.');
  const i = /** @type {{ manifest?: { bicimSurumu?: unknown; semaSurumu?: unknown }; kasa?: { kdf?: unknown; dogrulayici?: unknown }; tablolar?: Record<string, unknown> }} */ (icerik);
  if (!nesne(i.manifest) || i.manifest.bicimSurumu !== BICIM_SURUMU) throw new YedekHatasi('VERI', 'Yedek manifesti geçersiz.');
  if (typeof i.manifest.semaSurumu !== 'number' || i.manifest.semaSurumu > GUNCEL_SEMA_SURUMU) {
    throw new YedekHatasi('SURUM', `Yedek daha yeni bir şema sürümüyle (${i.manifest.semaSurumu}) oluşturulmuş; önce uygulamayı güncelleyin.`);
  }
  if (!nesne(i.kasa) || !nesne(i.kasa.kdf) || typeof i.kasa.dogrulayici !== 'string') throw new YedekHatasi('VERI', 'Yedekteki kasa bilgisi eksik.');
  if (!nesne(i.tablolar)) throw new YedekHatasi('VERI', 'Yedekte tablo verisi yok.');
  const bilinen = new Map(TABLOLAR.map((t) => [t.ad, t]));
  for (const [ad, satirlar] of Object.entries(i.tablolar)) {
    const tablo = bilinen.get(ad);
    if (!tablo) throw new YedekHatasi('VERI', `Yedekte bilinmeyen tablo: "${ad}".`);
    if (!Array.isArray(satirlar)) throw new YedekHatasi('VERI', `"${ad}" tablosu geçersiz.`);
    for (const satir of satirlar) {
      if (!nesne(satir) || typeof /** @type {Record<string, unknown>} */ (satir)[tablo.birincilAnahtar] !== 'string') throw new YedekHatasi('VERI', `"${ad}" tablosunda geçersiz satır.`);
      for (const [sutun, deger] of Object.entries(/** @type {Record<string, unknown>} */ (satir))) {
        if (deger !== null && !['string', 'number'].includes(typeof deger)) throw new YedekHatasi('VERI', `"${ad}.${sutun}" değeri geçersiz.`);
        if (tablo.json.includes(sutun) && typeof deger === 'string') {
          try { JSON.parse(deger); } catch { throw new YedekHatasi('VERI', `"${ad}.${sutun}" geçerli JSON değil.`); }
        }
      }
    }
  }
  return /** @type {ReturnType<typeof icerikDogrula>} */ (/** @type {unknown} */ (i));
}

/** @param {Veritabani} vt */
function veritabaniBosMu(vt) {
  const s = sayimlar(vt);
  const veriVar = Object.entries(s).some(([tablo, sayi]) => tablo !== 'makineler' && sayi > 0);
  return !veriVar && !kasaDurumu(vt).olusturuldu;
}

/** @param {Veritabani} vt @param {string} tablo @param {Record<string, unknown>} satir @param {string[]} sutunlar */
function satirEkle(vt, tablo, satir, sutunlar) {
  const kullan = sutunlar.filter((s) => s in satir);
  vt.calistir(
    `INSERT INTO ${tablo} (${kullan.join(', ')}) VALUES (${kullan.map(() => '?').join(', ')})`,
    kullan.map((s) => satir[s])
  );
}

/**
 * Karşılaştırma biçimi: zaman damgaları hariç, zarflar düz metne açılmış, JSON'lar kanonik.
 * @param {Record<string, unknown>} satir @param {readonly string[]} jsonSutunlar @param {Buffer} anahtar
 */
function kanonik(satir, jsonSutunlar, anahtar) {
  /** @param {unknown} d @returns {unknown} */
  const sirala = (d) => {
    if (Array.isArray(d)) return d.map(sirala);
    if (typeof d === 'object' && d !== null) {
      return Object.fromEntries(Object.keys(d).sort().map((k) => [k, sirala(/** @type {Record<string, unknown>} */ (d)[k])]));
    }
    return d;
  };
  /** @type {Record<string, unknown>} */
  const sonuc = {};
  for (const sutun of Object.keys(satir).sort()) {
    if (sutun === 'olusturulma' || sutun === 'guncellenme') continue;
    let deger = satir[sutun];
    if (typeof deger === 'string') {
      deger = metindekiZarflariDonustur(deger, (z) => `«${zarfCoz(anahtar, z)}»`);
      if (jsonSutunlar.includes(sutun)) deger = sirala(JSON.parse(/** @type {string} */ (deger)));
    }
    sonuc[sutun] = deger;
  }
  return JSON.stringify(sonuc);
}

/**
 * Yedeği içe aktarır. Parola yanlışsa / dosya bozuksa HİÇBİR ŞEY yazılmaz; yazma aşaması tek
 * transaction'dır (hata = geri alınır).
 * - tamYukle: tüm veriyi (kasa dahil) yedektekiyle değiştirir. Veritabanı boş değilse
 *   onay: true gerekir; kasa açıksa önce otomatik bir güvenlik yedeği alınır.
 * - birlestir: kimlik (id) üzerinden birleştirir. Aynı id + farklı içerik → güncellenme'si yeni
 *   olan kazanır; kaybeden sürüm (senaryo/profil) degisiklik_gecmisi'ne yazılır ve çakışma
 *   listesinde raporlanır. Kasa zaten varsa AÇIK olmalıdır; yedeğin hassas değerleri yerel
 *   kasa anahtarıyla yeniden şifrelenir.
 * @param {Veritabani} vt
 * @param {Buffer} dosya
 * @param {string} parola
 * @param {{ mod: 'tamYukle' | 'birlestir'; onay?: boolean; ilerleme?: IlerlemeFn; yapan?: string; guvenlikYedegiKlasoru?: string }} secenekler
 */
export async function yedekIceAktar(vt, dosya, parola, secenekler) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  if (secenekler.mod !== 'tamYukle' && secenekler.mod !== 'birlestir') {
    throw new YedekHatasi('VERI', 'İçe aktarma modu "tamYukle" veya "birlestir" olmalıdır.');
  }
  // Ön koşullar parola sorulmadan (pahalı scrypt'ten önce) kontrol edilir.
  const bos = veritabaniBosMu(vt);
  if (secenekler.mod === 'tamYukle' && !bos && !secenekler.onay) {
    throw new YedekHatasi('ONAY_GEREKLI',
      'Veritabanı boş değil: tam yükleme mevcut TÜM veriyi (kasa dahil) yedektekiyle değiştirir. Emin iseniz onaylayarak tekrar deneyin.');
  }
  const yerelKasa = kasaDurumu(vt);
  if (secenekler.mod === 'birlestir' && yerelKasa.olusturuldu && !yerelKasa.acik) {
    throw new KasaHatasi('KASA_KILITLI', 'Birleştirme için önce bu makinedeki kasayı açın.');
  }

  const yedek = await yedekAc(dosya, parola, { ilerleme });
  try {
    /** @type {Map<string, string[]>} */
    const sutunlar = new Map(TABLOLAR.map((t) => [t.ad, tabloSutunlari(vt, t.ad)]));
    for (const [ad, satirlar] of Object.entries(yedek.tablolar)) {
      const bilinen = new Set(sutunlar.get(ad));
      for (const satir of satirlar) {
        const fazla = Object.keys(satir).find((s) => !bilinen.has(s));
        if (fazla) throw new YedekHatasi('VERI', `Yedekteki "${ad}.${fazla}" sütunu bu şemada yok.`);
      }
    }

    if (secenekler.mod === 'tamYukle') {
      let guvenlikYedegi = null;
      if (!bos && yerelKasa.acik) {
        ilerleme('güvenlik yedeği alınıyor', 50);
        guvenlikYedegi = otomatikYedekAl(vt, { klasor: secenekler.guvenlikYedegiKlasoru }).dosya;
      }
      ilerleme('yazılıyor', 60);
      const toplam = Object.values(yedek.tablolar).reduce((a, s) => a + s.length, 0) || 1;
      let yazilan = 0;
      vt.islem(() => {
        for (const t of [...TABLOLAR].reverse()) vt.calistir(`DELETE FROM ${t.ad}`);
        for (const t of TABLOLAR) {
          const tSutun = /** @type {string[]} */ (sutunlar.get(t.ad));
          for (const satir of yedek.tablolar[t.ad] ?? []) {
            satirEkle(vt, t.ad, satir, tSutun);
            if (++yazilan % 500 === 0) ilerleme('yazılıyor', 60 + Math.round((35 * yazilan) / toplam));
          }
        }
        vt.metaYaz('kasa_surum', '1');
        vt.metaYaz('kasa_kdf', JSON.stringify(yedek.kasa.kdf));
        vt.metaYaz('kasa_dogrulayici', yedek.kasa.dogrulayici);
        yerelMakine(vt);
      });
      kasayiAnahtarlaAc(vt, yedek.kasaAnahtari);
      ilerleme('tamamlandı', 100);
      return { mod: 'tamYukle', manifest: yedek.manifest, sayimlar: sayimlar(vt), guvenlikYedegi, cakismalar: [] };
    }

    // --- birlestir ---
    const kasaVardi = yerelKasa.olusturuldu;
    const hedefAnahtar = kasaVardi ? acikAnahtar(vt) : yedek.kasaAnahtari;
    const ayniAnahtar = hedefAnahtar.length === yedek.kasaAnahtari.length && timingSafeEqual(hedefAnahtar, yedek.kasaAnahtari);
    /** @param {Record<string, unknown>} satir */
    const yenidenSifrele = (satir) => {
      if (ayniAnahtar) return satir;
      /** @type {Record<string, unknown>} */
      const yeni = {};
      for (const [k, d] of Object.entries(satir)) {
        yeni[k] = typeof d === 'string'
          ? metindekiZarflariDonustur(d, (z) => zarfSifrele(hedefAnahtar, zarfCoz(yedek.kasaAnahtari, z)))
          : d;
      }
      return yeni;
    };
    /** @type {Record<string, { eklenen: number; guncellenen: number; ayni: number; atlanan: number }>} */
    const ozet = {};
    /** @type {Array<{ tablo: string; id: string; baslik: string | null; kazanan: 'yerel' | 'yedek'; yerelGuncellenme: string | null; yedekGuncellenme: string | null; aciklama: string }>} */
    const cakismalar = [];
    ilerleme('birleştiriliyor', 55);
    vt.islem(() => {
      if (!kasaVardi) {
        vt.metaYaz('kasa_surum', '1');
        vt.metaYaz('kasa_kdf', JSON.stringify(yedek.kasa.kdf));
        vt.metaYaz('kasa_dogrulayici', yedek.kasa.dogrulayici);
      }
      TABLOLAR.forEach((t, sira) => {
        const o = (ozet[t.ad] = { eklenen: 0, guncellenen: 0, ayni: 0, atlanan: 0 });
        const tSutun = /** @type {string[]} */ (sutunlar.get(t.ad));
        for (const hamSatir of yedek.tablolar[t.ad] ?? []) {
          const gelen = yenidenSifrele(hamSatir);
          const id = String(gelen[t.birincilAnahtar]);
          const yerel = vt.tek(`SELECT * FROM ${t.ad} WHERE ${t.birincilAnahtar} = ?`, [id]);
          const baslik = t.baslikAlani && gelen[t.baslikAlani] != null ? String(gelen[t.baslikAlani]) : null;
          if (!yerel) {
            if (t.ad === 'ekran_modelleri') {
              const cakisan = vt.tek('SELECT id FROM ekran_modelleri WHERE ekran_id = ? AND surum = ?', [gelen.ekran_id, gelen.surum]);
              if (cakisan) {
                o.atlanan++;
                cakismalar.push({ tablo: t.ad, id, baslik, kazanan: 'yerel', yerelGuncellenme: null, yedekGuncellenme: null,
                  aciklama: 'Aynı ekran için aynı model sürüm numarası iki makinede farklı kayıtla oluşturulmuş; yerel sürüm korundu.' });
                continue;
              }
            }
            satirEkle(vt, t.ad, gelen, tSutun);
            o.eklenen++;
            continue;
          }
          if (kanonik(yerel, t.json, hedefAnahtar) === kanonik(gelen, t.json, hedefAnahtar)) {
            o.ayni++;
            continue;
          }
          const yerelZaman = t.guncellenme ? String(yerel.guncellenme ?? '') : null;
          const yedekZaman = t.guncellenme ? String(gelen.guncellenme ?? '') : null;
          const yedekKazanir = Boolean(t.guncellenme && yedekZaman && yerelZaman !== null && yedekZaman > yerelZaman);
          const kazanan = yedekKazanir ? 'yedek' : 'yerel';
          if (yedekKazanir) {
            const guncel = tSutun.filter((s) => s in gelen && s !== t.birincilAnahtar);
            vt.calistir(
              `UPDATE ${t.ad} SET ${guncel.map((s) => `${s} = ?`).join(', ')} WHERE ${t.birincilAnahtar} = ?`,
              [...guncel.map((s) => gelen[s]), id]
            );
            o.guncellenen++;
          } else {
            o.atlanan++;
          }
          const aciklama = t.guncellenme
            ? `Birleştirmede iki farklı sürüm bulundu; daha yeni olan (${kazanan}) korundu, diğeri geçmişe kaydedildi.`
            : 'Birleştirmede aynı kimlikli farklı kayıt bulundu; yerel kayıt korundu.';
          if (t.gecmisTuru) {
            gecmisYaz(vt, {
              varlikTuru: t.gecmisTuru, varlikId: id, islem: 'birlestirme_cakismasi',
              yapan: secenekler.yapan ?? `birlestirme:${yedek.manifest.makine?.ad ?? 'bilinmeyen'}`,
              onceki: yedekKazanir ? yerel : gelen, sonraki: yedekKazanir ? gelen : yerel, aciklama
            });
          }
          cakismalar.push({ tablo: t.ad, id, baslik, kazanan, yerelGuncellenme: yerelZaman, yedekGuncellenme: yedekZaman, aciklama });
        }
        ilerleme('birleştiriliyor', 55 + Math.round((40 * (sira + 1)) / TABLOLAR.length));
      });
      yerelMakine(vt);
    });
    if (!kasaVardi) kasayiAnahtarlaAc(vt, yedek.kasaAnahtari);
    ilerleme('tamamlandı', 100);
    return { mod: 'birlestir', manifest: yedek.manifest, sayimlar: sayimlar(vt), ozet, cakismalar, guvenlikYedegi: null };
  } finally {
    yedek.kasaAnahtari.fill(0);
  }
}

/** @param {Date} t */
function zamanEtiketi(t) {
  const p = (/** @type {number} */ n, u = 2) => String(n).padStart(u, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}-${p(t.getMilliseconds(), 3)}`;
}

/**
 * Yerel otomatik yedek: zaman damgalı dosyayı klasöre yazar, en yeni `saklanacak` adet
 * otomatik yedeği tutar (elle alınan yedeklere dokunmaz). Kasa AÇIK olmalıdır.
 * @param {Veritabani} vt
 * @param {{ klasor?: string; saklanacak?: number; simdi?: Date }} [secenekler]
 */
export function otomatikYedekAl(vt, secenekler = {}) {
  const klasor = secenekler.klasor || varsayilanYedekKlasoru(vt);
  const saklanacak = Math.max(1, secenekler.saklanacak ?? OTOMATIK_SAKLAMA_SAYISI);
  const { veri, manifest } = yedekOlustur(vt);
  mkdirSync(klasor, { recursive: true });
  let t = secenekler.simdi ?? new Date();
  let dosya = join(klasor, `otomatik-${zamanEtiketi(t)}${YEDEK_UZANTISI}`);
  while (existsSync(dosya)) {
    t = new Date(t.getTime() + 1);
    dosya = join(klasor, `otomatik-${zamanEtiketi(t)}${YEDEK_UZANTISI}`);
  }
  atomikIkiliYaz(dosya, veri);
  const otomatikler = readdirSync(klasor).filter((ad) => OTOMATIK_DESEN.test(ad)).sort();
  const silinenler = [];
  for (const ad of otomatikler.slice(0, Math.max(0, otomatikler.length - saklanacak))) {
    try {
      unlinkSync(join(klasor, ad));
      silinenler.push(ad);
    } catch {
      // silinemeyen eski yedek bir sonraki seferde tekrar denenir
    }
  }
  return { dosya, boyut: veri.length, manifest, silinenler };
}
