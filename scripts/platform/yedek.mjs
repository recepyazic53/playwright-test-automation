// PLATFORM YEDEĞİ — tüm platform verisini (isteğe bağlı olarak şifreli medya dosyalarıyla
// birlikte) TEK bir şifreli dosyaya (.tayedek) yazar ve geri yükler. Yedekler YALNIZCA yerel
// diske yazılır (bulut yok).
//
// BİÇİM 2 (güncel; yazılan biçim):
//   0   8  sihirli "TAYEDEK\0"
//   8   1  biçim sürümü (2)
//   9   1  kasa scrypt log2(N)
//  10   1  kasa scrypt r
//  11   1  kasa scrypt p
//  12  16  kasa tuzu            → kasaAnahtari = scrypt(parola, kasaTuzu)
//  28  16  dosya tuzu (ayrı)    → dosyaAnahtari = HKDF-SHA256(kasaAnahtari, dosyaTuzu, "platform-yedek-v2")
//  44   8  IV öneki (parça IV'si = önek + parça sırası (4, big-endian))
//  52   4  ayrılmış (0)
//  56   …  1 MiB'lık düz metin PARÇALARI, her biri AES-256-GCM: [şifreli parça][16 bayt etiket].
//          AAD = başlık (56) + parça sırası (4) + "son parça mı" (1) → parçalar yer değiştiremez,
//          dosya kesilemez/uzatılamaz. Parçalı yapı sayesinde yedek (GB'larca video olabilir)
//          belleğe alınmadan AKIŞLA yazılır ve okunur.
//   Düz metin akışı KAYITLARDAN oluşur: [tür (1)][uzunluk (8, big-endian)][içerik]
//     tür 1 İÇERİK (ilk kayıt): gzip(JSON) — { manifest, kasa: { kdf, dogrulayici, medyaAnahtari? }, tablolar }
//     tür 2 MEDYA: [kimlik uzunluğu (2)][medya kimliği (utf8)][şifreli medya dosyası (medya.mjs biçimi, OLDUĞU GİBİ)]
//     tür 0 SON (uzunluk 0) — ardından veri gelemez.
// BİÇİM 1 (eski; yalnızca OKUNUR): 56 bayt başlık (sürüm 1, IV 12) + 16 bayt etiket +
//   AES-256-GCM(gzip(JSON)), anahtar HKDF bilgisi "platform-yedek-v1". Medya dosyası taşımaz.
// Manifest de şifrelidir (sayım bilgisi bile parolasız okunamaz).
//
// MEDYA DOSYALARI VE ANAHTARLARI: medya dosyaları zaten diskte şifrelidir (medya.mjs; dosya
// anahtarı = HKDF(medya ana anahtarı, dosya tuzu)). Yedeğe şifreli halleriyle, OLDUĞU GİBİ girer
// (yedek şifresinin İÇİNDE ikinci kat şifre — yedekte düz medya baytı yoktur). Medya ana anahtarı
// yedeğe, kaynak kasanın anahtarıyla sarılı zarf olarak (kasa.medyaAnahtari) girer; yedek zaten
// aynı kasa anahtarından türetilen anahtarla şifreli olduğundan bu ek bir açık oluşturmaz. İçe
// aktaran taraf zarfı yedek parolasından türetilen anahtarla açar ve:
//   - hedefin medya ana anahtarı kaynakla AYNIYSA (aynı kurulum; ya da boş veritabanının yedeğin
//     kasasını + medya anahtarını benimsemesi) şifreli dosyayı doğrudan yerleştirir;
//   - FARKLIYSA (başka kasa parolası / başka kurulum) dosyayı akışla kaynak anahtarla çözüp hedef
//     anahtarla yeniden şifreler (düz metin yalnızca bellekte, parça parça; diske yazılmaz).
// Dışa aktarmada seçilmeyen / bu makinede dosyası olmayan medya satırları yedek_disi = 1 ile
// yazılır; içe aktaran makine "Bu medya yedeğe dahil edilmemişti" gösterir (dosya yerelde
// zaten varsa bayrak kaldırılır). Biçim 1 yedeklerinin tüm medya satırları böyle işaretlenir.
//
// Neden dosya anahtarı kasa anahtarından türetiliyor: sunucu parolayı DEĞİL yalnızca türetilmiş
// kasa anahtarını bellekte tutar; otomatik yedek bu sayede parola sormadan alınabilir. Geri
// yüklerken parola + başlıktaki kasa tuzu ile aynı anahtar yeniden türetilir. Parola sonradan
// değişse bile eski yedek, eski parolayla açılır.
//
// Şifreli sütunlar (SIFRELI_ALANLAR) ve hassas test verisi alanları yedekte de kasa zarfı
// olarak (çift şifreli) kalır.
//
// İçe aktarma: dashboard/API akışı ÖNİZLEME → SEÇİM → UYGULAMA'dır (bkz. ice-aktarma.mjs).
// Bu dosyadaki yedekIceAktar yalnızca TAM YÜKLEME (tüm veriyi yedektekiyle değiştirme) yapar;
// ice-aktarma.mjs boş veritabanına "tümü seçili" uygulamada aynı yolu (tamYukleYaz) kullanır.
// Otomatik (günlük) yedekler medya dosyası TAŞIMAZ (medya aynı diskte zaten şifreli durur).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirerek yükler).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomikIkiliYaz } from './veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, TABLOLAR, mevcutSemaSurumu } from './veritabani/gocler.mjs';
import { gecmisYapaniniNormallestir, sayimlar, yerelMakine } from './veritabani/depo.mjs';
import {
  KasaHatasi, MEDYA_ANAHTARI_META, acikAnahtar, anahtarDogrulayiciyaUyarMi, anahtarTuret, kasaDurumu, kasaKdfOku,
  kasayiAnahtarlaAc, medyaAnahtariniAc, medyaAnahtariniHazirla, zarfCoz, zarfMi
} from './kasa.mjs';
import { MEDYA_SIHIRLI, medyaCoz, medyaDosyaAdiGecerliMi, medyaKlasoru, medyaSifrele } from './medya.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {(asama: string, yuzde: number, bayt?: { islenen: number; toplam: number }) => void} IlerlemeFn */
/**
 * @typedef {{ ekranGoruntuleriDahil?: boolean; videolarDahil?: boolean; izDosyalariDahil?: boolean }} MedyaSecimi
 */

export const YEDEK_UZANTISI = '.tayedek';
export const BICIM_SURUMU = 2;
export const ESKI_BICIM_SURUMU = 1;
export const OTOMATIK_SAKLAMA_SAYISI = 30;
export const YEDEK_PARCA_BOYUTU = 1024 * 1024;
const SIHIRLI = Buffer.from('TAYEDEK\0', 'latin1');
const BASLIK_AAD_BOYUTU = 56;
const V1_BASLIK_BOYUTU = 72;
const ETIKET = 16;
const HKDF_BILGI = Object.freeze({ 1: Buffer.from('platform-yedek-v1', 'utf8'), 2: Buffer.from('platform-yedek-v2', 'utf8') });
const OTOMATIK_DESEN = /^otomatik-\d{8}-\d{6}-\d{3}\.tayedek$/;
const KAYIT = Object.freeze({ SON: 0, ICERIK: 1, MEDYA: 2 });
const KAYIT_BASLIGI = 9;

/** Dışa aktarma medya seçeneklerinin varsayılanları (kullanıcı kararı). */
export const VARSAYILAN_MEDYA_SECIMI = Object.freeze({ ekranGoruntuleriDahil: true, videolarDahil: false, izDosyalariDahil: false });
/**
 * Medya türü → onu yedeğe alan seçenek. "diger" (hata bağlamı .md, küçük metin ekleri)
 * ekran görüntüleriyle birlikte gider; izler (trace .zip, büyük olabilir) ayrı seçenektir.
 * @type {Readonly<Record<string, keyof typeof VARSAYILAN_MEDYA_SECIMI>>}
 */
export const MEDYA_TURU_SECENEGI = Object.freeze({
  ekran_goruntusu: 'ekranGoruntuleriDahil', diger: 'ekranGoruntuleriDahil', video: 'videolarDahil', iz: 'izDosyalariDahil'
});
const MB = 1024 * 1024;
const mbMetni = (/** @type {number} */ b) => (b / MB).toFixed(1);

export class YedekHatasi extends Error {
  /**
   * @param {'BICIM' | 'SURUM' | 'ONAY_GEREKLI' | 'KASA_UYUSMAZ' | 'VERI' | 'DEGISTI' | 'MESGUL' | 'BULUNAMADI'} kod
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

/** @param {Buffer} kasaAnahtari @param {Buffer} dosyaTuzu @param {1 | 2} surum */
function dosyaAnahtari(kasaAnahtari, dosyaTuzu, surum) {
  return Buffer.from(hkdfSync('sha256', kasaAnahtari, dosyaTuzu, HKDF_BILGI[surum], 32));
}

/** @param {number} n */
function log2Tam(n) {
  const l = Math.log2(n);
  if (!Number.isInteger(l) || l < 1 || l > 30) throw new YedekHatasi('BICIM', 'Geçersiz scrypt parametresi.');
  return l;
}

/** @param {Veritabani} vt @param {string} tablo */
export function tabloSutunlari(vt, tablo) {
  return vt.tumu(`PRAGMA table_info(${tablo})`).map((s) => String(s.name));
}

/** Eksik seçenekler varsayılanla tamamlanır; boolean olmayan değer reddedilir. @param {MedyaSecimi} [secim] */
export function medyaSeciminiCoz(secim = {}) {
  /** @type {Record<keyof typeof VARSAYILAN_MEDYA_SECIMI, boolean>} */
  const sonuc = { ...VARSAYILAN_MEDYA_SECIMI };
  for (const ad of /** @type {Array<keyof typeof VARSAYILAN_MEDYA_SECIMI>} */ (Object.keys(VARSAYILAN_MEDYA_SECIMI))) {
    const deger = secim[ad];
    if (deger === undefined || deger === null) continue;
    if (typeof deger !== 'boolean') throw new YedekHatasi('VERI', `"${ad}" true ya da false olmalıdır.`);
    sonuc[ad] = deger;
  }
  return sonuc;
}

/**
 * Dosyası HER ZAMAN yedeğe giren medya türleri: senaryo dosyaları (ör. çoklu sorgu Excel'i) koşu sonucu değil proje
 * verisidir — yedekten kurulan makinede senaryolar bunlarsız koşamaz (dosya yine şifreli, olduğu gibi girer).
 */
export const HER_ZAMAN_YEDEKLENEN_TURLER = Object.freeze(['senaryo-dosyasi']);

/** Dosyası yedeğe alınabilecek medya türü seçildi mi? @param {Record<string, boolean>} secim @param {unknown} tur */
function turSecili(secim, tur) {
  if (HER_ZAMAN_YEDEKLENEN_TURLER.includes(String(tur))) return true;
  const secenek = MEDYA_TURU_SECENEGI[String(tur)];
  return Boolean(secenek && secim[secenek]);
}

// ---------------------------------------------------------------------------------------
// Parçalı AES-256-GCM (biçim 2)
// ---------------------------------------------------------------------------------------

/** @param {Buffer} baslik @param {number} sira */
function parcaIv(baslik, sira) {
  const iv = Buffer.alloc(12);
  baslik.copy(iv, 0, 44, 52);
  iv.writeUInt32BE(sira, 8);
  return iv;
}

/** @param {Buffer} baslik @param {number} sira @param {boolean} son */
function parcaAad(baslik, sira, son) {
  const aad = Buffer.alloc(BASLIK_AAD_BOYUTU + 5);
  baslik.copy(aad, 0, 0, BASLIK_AAD_BOYUTU);
  aad.writeUInt32BE(sira, BASLIK_AAD_BOYUTU);
  aad[BASLIK_AAD_BOYUTU + 4] = son ? 1 : 0;
  return aad;
}

/** Düz metni 1 MiB'lık parçalara bölüp şifreler (senkron çekirdek; yazma çağırandadır). */
class ParcaSifreleyici {
  /** @param {Buffer} anahtar @param {Buffer} baslik */
  constructor(anahtar, baslik) {
    this.anahtar = anahtar;
    this.baslik = baslik;
    /** @type {Buffer[]} */
    this.bekleyen = [];
    this.bekleyenBoyut = 0;
    this.sira = 0;
    this.bitti = false;
  }

  /** @param {Buffer} parca @param {boolean} son */
  sifrele(parca, son) {
    const sifreleyici = createCipheriv('aes-256-gcm', this.anahtar, parcaIv(this.baslik, this.sira));
    sifreleyici.setAAD(parcaAad(this.baslik, this.sira, son));
    const sonuc = Buffer.concat([sifreleyici.update(parca), sifreleyici.final(), sifreleyici.getAuthTag()]);
    this.sira++;
    return sonuc;
  }

  /** Düz metin ekler; tamamlanan şifreli parçaları döner. @param {Buffer} veri @returns {Buffer[]} */
  ekle(veri) {
    if (this.bitti) throw new Error('Şifreleyici kapandı.');
    if (!veri.length) return [];
    this.bekleyen.push(veri);
    this.bekleyenBoyut += veri.length;
    /** @type {Buffer[]} */
    const cikti = [];
    // Son parça her zaman AYRI (işaretli) yazılır: yalnızca PARÇA'dan FAZLASI birikince boşaltılır.
    while (this.bekleyenBoyut > YEDEK_PARCA_BOYUTU) {
      const birlesik = this.bekleyen.length === 1 ? this.bekleyen[0] : Buffer.concat(this.bekleyen);
      cikti.push(this.sifrele(birlesik.subarray(0, YEDEK_PARCA_BOYUTU), false));
      const kalan = birlesik.subarray(YEDEK_PARCA_BOYUTU);
      this.bekleyen = [kalan];
      this.bekleyenBoyut = kalan.length;
    }
    return cikti;
  }

  /** Son (işaretli) parçayı döner. */
  bitir() {
    this.bitti = true;
    return this.sifrele(Buffer.concat(this.bekleyen), true);
  }
}

/** @param {number} tur @param {number} uzunluk */
function kayitBasligi(tur, uzunluk) {
  const b = Buffer.alloc(KAYIT_BASLIGI);
  b[0] = tur;
  b.writeBigUInt64BE(BigInt(uzunluk), 1);
  return b;
}

/**
 * @param {{ alg?: string; N: number; r: number; p: number; tuz: string }} kdf @param {Buffer} dosyaTuzu
 */
function v2BaslikOlustur(kdf, dosyaTuzu) {
  const kasaTuzu = Buffer.from(kdf.tuz, 'base64url');
  if (kasaTuzu.length !== 16) throw new YedekHatasi('BICIM', 'Kasa tuzu beklenen uzunlukta değil.');
  const baslik = Buffer.alloc(BASLIK_AAD_BOYUTU);
  SIHIRLI.copy(baslik, 0);
  baslik.writeUInt8(BICIM_SURUMU, 8);
  baslik.writeUInt8(log2Tam(kdf.N), 9);
  baslik.writeUInt8(kdf.r, 10);
  baslik.writeUInt8(kdf.p, 11);
  kasaTuzu.copy(baslik, 12);
  dosyaTuzu.copy(baslik, 28);
  randomBytes(8).copy(baslik, 44);
  return baslik;
}

// ---------------------------------------------------------------------------------------
// Dışa aktarma
// ---------------------------------------------------------------------------------------

/**
 * Yedek içeriğini (JSON) ve yedeğe girecek medya dosyalarının listesini hazırlar. Kasa AÇIK olmalı.
 * @param {Veritabani} vt
 * @param {Record<string, boolean>} secim
 * @param {string | null} klasor medya klasörü (null: medya dosyası eklenmez)
 * @param {IlerlemeFn} ilerleme
 */
function icerikHazirla(vt, secim, klasor, ilerleme) {
  const kasaAnahtari = acikAnahtar(vt);
  const kdf = kasaKdfOku(vt);
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!kdf || !dogrulayici) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
  ilerleme('veri okunuyor', 2);
  /** @type {Record<string, Record<string, unknown>[]>} */
  const tablolar = {};
  const mevcutTablolar = new Set(vt.tumu("SELECT name FROM sqlite_master WHERE type = 'table'").map((s) => String(s.name)));
  TABLOLAR.forEach((t, i) => {
    // Eski şemada (göç uygulanmamış bellek içi veritabanı) henüz olmayan tablo boş yazılır.
    tablolar[t.ad] = mevcutTablolar.has(t.ad) ? vt.tumu(`SELECT * FROM ${t.ad} ORDER BY rowid`) : [];
    ilerleme('veri okunuyor', 2 + Math.round((8 * (i + 1)) / TABLOLAR.length));
  });
  /** @type {Array<{ id: string; yol: string; boyut: number; tur: string }>} */
  const medyaListesi = [];
  /** @type {Record<string, { sayi: number; bayt: number }>} */
  const turler = {};
  const bayrakVar = tabloSutunlari(vt, 'medya').includes('yedek_disi');
  tablolar.medya = (tablolar.medya ?? []).map((satir) => {
    const secildi = satir.silinme == null && turSecili(secim, satir.tur);
    let dahil = false;
    if (secildi && klasor && medyaDosyaAdiGecerliMi(satir.dosya)) {
      const yol = join(klasor, String(satir.dosya));
      try {
        const bilgi = statSync(yol);
        if (bilgi.isFile()) {
          medyaListesi.push({ id: String(satir.id), yol, boyut: bilgi.size, tur: String(satir.tur) });
          const t = (turler[String(satir.tur)] ??= { sayi: 0, bayt: 0 });
          t.sayi++;
          t.bayt += bilgi.size;
          dahil = true;
        }
      } catch { /* dosya bu makinede yok: satır olduğu gibi (bayrağıyla) gider */ }
    }
    if (!bayrakVar || satir.silinme != null) return satir;
    // Seçilmeyen tür → yedek_disi = 1. Seçilip dosyası bu makinede de olmayan satır bayrağını korur.
    return { ...satir, yedek_disi: dahil ? 0 : secildi ? satir.yedek_disi : 1 };
  });
  const medyaZarfi = vt.metaOku(MEDYA_ANAHTARI_META);
  const icerik = {
    manifest: {
      bicimSurumu: BICIM_SURUMU,
      semaSurumu: mevcutSemaSurumu(vt),
      olusturulma: new Date().toISOString(),
      makine: yerelMakine(vt),
      sayimlar: sayimlar(vt),
      medya: {
        secim: { ...secim },
        dosyaSayisi: medyaListesi.length,
        bayt: medyaListesi.reduce((a, m) => a + m.boyut, 0),
        turler
      }
    },
    kasa: { kdf, dogrulayici, ...(medyaZarfi ? { medyaAnahtari: medyaZarfi } : {}) },
    tablolar
  };
  if (medyaListesi.length && !medyaZarfi) throw new KasaHatasi('KASA_YOK', 'Medya anahtarı bulunamadı; medya dosyaları yedeğe alınamıyor.');
  return { icerik, medyaListesi, kasaAnahtari, kdf };
}

/**
 * Tüm veriyi (medya DOSYASI olmadan) şifreli yedek içeriğine (Buffer) çevirir. Kasa AÇIK olmalı.
 * Otomatik yedek ve testler kullanır; medya satırları yedek_disi = 1 ile yazılır.
 * @param {Veritabani} vt
 * @param {{ ilerleme?: IlerlemeFn }} [secenekler]
 */
export function yedekOlustur(vt, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  const secim = { ekranGoruntuleriDahil: false, videolarDahil: false, izDosyalariDahil: false };
  const { icerik, kasaAnahtari, kdf } = icerikHazirla(vt, secim, null, ilerleme);
  ilerleme('sıkıştırılıyor', 55);
  const sikistirilmis = gzipSync(Buffer.from(JSON.stringify(icerik), 'utf8'), { level: 9 });
  ilerleme('şifreleniyor', 80);
  const baslik = v2BaslikOlustur(kdf, randomBytes(16));
  const anahtar = dosyaAnahtari(kasaAnahtari, baslik.subarray(28, 44), 2);
  try {
    const s = new ParcaSifreleyici(anahtar, baslik);
    const parcalar = [baslik, ...s.ekle(kayitBasligi(KAYIT.ICERIK, sikistirilmis.length)), ...s.ekle(sikistirilmis),
      ...s.ekle(kayitBasligi(KAYIT.SON, 0)), s.bitir()];
    ilerleme('tamamlandı', 100);
    return { veri: Buffer.concat(parcalar), manifest: icerik.manifest };
  } finally {
    anahtar.fill(0);
  }
}

/**
 * Yedeği (seçilen medya dosyalarıyla) AKIŞLA dosyaya yazar: bellekte yalnızca JSON içerik ve
 * 1 MiB'lık parçalar durur. Yazma geçici dosyaya yapılır, fsync + rename ile tamamlanır.
 * Kasa AÇIK olmalı. Medya dosyası şifreli değilse (sihirli bayt yoksa) yedek İPTAL edilir.
 * @param {Veritabani} vt
 * @param {string} hedef
 * @param {MedyaSecimi & { medyaKlasoru?: string | null; ilerleme?: IlerlemeFn }} [secenekler]
 */
export async function yedekDosyasiYaz(vt, hedef, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  const secim = medyaSeciminiCoz(secenekler);
  const klasor = secenekler.medyaKlasoru !== undefined ? secenekler.medyaKlasoru : (vt.yol ? medyaKlasoru(vt.yol) : null);
  const { icerik, medyaListesi, kasaAnahtari, kdf } = icerikHazirla(vt, secim, klasor, ilerleme);
  ilerleme('sıkıştırılıyor', 11);
  const sikistirilmis = gzipSync(Buffer.from(JSON.stringify(icerik), 'utf8'), { level: 9 });
  const baslik = v2BaslikOlustur(kdf, randomBytes(16));
  const anahtar = dosyaAnahtari(kasaAnahtari, baslik.subarray(28, 44), 2);
  const toplamMedya = icerik.manifest.medya.bayt;
  mkdirSync(dirname(hedef), { recursive: true });
  const gecici = `${hedef}.${process.pid}.${randomBytes(4).toString('hex')}.gecici`;
  const fh = await open(gecici, 'wx', 0o600);
  let boyut = 0;
  try {
    const s = new ParcaSifreleyici(anahtar, baslik);
    /** @param {Buffer[]} parcalar */
    const yaz = async (parcalar) => {
      for (const p of parcalar) {
        let yazilan = 0;
        while (yazilan < p.length) yazilan += (await fh.write(p, yazilan, p.length - yazilan)).bytesWritten;
        boyut += p.length;
      }
    };
    await yaz([baslik, ...s.ekle(kayitBasligi(KAYIT.ICERIK, sikistirilmis.length)), ...s.ekle(sikistirilmis)]);
    let islenen = 0;
    const medyaIlerleme = () => ilerleme(
      `medya ekleniyor (${mbMetni(islenen)} / ${mbMetni(toplamMedya)} MB)`,
      toplamMedya ? 12 + Math.floor((86 * islenen) / toplamMedya) : 98,
      { islenen, toplam: toplamMedya }
    );
    if (medyaListesi.length) medyaIlerleme();
    for (const m of medyaListesi) {
      const kimlik = Buffer.from(m.id, 'utf8');
      if (kimlik.length > 0xffff) throw new YedekHatasi('VERI', 'Medya kimliği çok uzun.');
      const onEk = Buffer.alloc(2);
      onEk.writeUInt16BE(kimlik.length, 0);
      await yaz([...s.ekle(kayitBasligi(KAYIT.MEDYA, 2 + kimlik.length + m.boyut)), ...s.ekle(onEk), ...s.ekle(kimlik)]);
      let okunan = 0;
      let sonBildirim = 0;
      for await (const ham of createReadStream(m.yol, { highWaterMark: YEDEK_PARCA_BOYUTU })) {
        const parca = /** @type {Buffer} */ (ham);
        // Güvence: yedeğe yalnızca ŞİFRELİ medya dosyası girer (düz metin asla).
        if (okunan === 0 && (parca.length < MEDYA_SIHIRLI.length || !parca.subarray(0, MEDYA_SIHIRLI.length).equals(MEDYA_SIHIRLI))) {
          throw new YedekHatasi('VERI', 'Medya klasöründe şifreli olmayan bir dosya bulundu; yedek iptal edildi.');
        }
        okunan += parca.length;
        if (okunan > m.boyut) break;
        await yaz(s.ekle(parca));
        islenen += parca.length;
        if (islenen - sonBildirim >= 4 * MB) { sonBildirim = islenen; medyaIlerleme(); }
      }
      if (okunan !== m.boyut) throw new YedekHatasi('DEGISTI', 'Bir medya dosyası yedek alınırken değişti veya silindi; yedeği yeniden alın.');
      medyaIlerleme();
    }
    await yaz([...s.ekle(kayitBasligi(KAYIT.SON, 0)), s.bitir()]);
    await fh.sync();
    await fh.close();
  } catch (hata) {
    await fh.close().catch(() => {});
    await unlink(gecici).catch(() => {});
    throw hata;
  } finally {
    anahtar.fill(0);
  }
  await rename(gecici, hedef);
  ilerleme('tamamlandı', 100, { islenen: toplamMedya, toplam: toplamMedya });
  return { dosya: hedef, boyut, manifest: icerik.manifest };
}

/**
 * Dışa aktarma ekranı için tahmini boyutlar (veritabanındaki medya satırlarından; saklama
 * süresi dolmuş ve bu makinede dosyası olmayan satırlar sayılmaz).
 * @param {Veritabani} vt
 */
export function yedekBoyutTahmini(vt) {
  const bayrak = tabloSutunlari(vt, 'medya').includes('yedek_disi') ? 'AND yedek_disi = 0' : '';
  /** @type {Record<keyof typeof VARSAYILAN_MEDYA_SECIMI, { sayi: number; bayt: number }>} */
  const secenekler = {
    ekranGoruntuleriDahil: { sayi: 0, bayt: 0 }, videolarDahil: { sayi: 0, bayt: 0 }, izDosyalariDahil: { sayi: 0, bayt: 0 }
  };
  for (const s of vt.tumu(`SELECT tur, COUNT(*) AS sayi, COALESCE(SUM(boyut), 0) AS bayt FROM medya WHERE silinme IS NULL ${bayrak} GROUP BY tur`)) {
    const secenek = MEDYA_TURU_SECENEGI[String(s.tur)];
    if (!secenek) continue;
    secenekler[secenek].sayi += Number(s.sayi);
    secenekler[secenek].bayt += Number(s.bayt);
  }
  return { secenekler, varsayilan: { ...VARSAYILAN_MEDYA_SECIMI } };
}

// ---------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------

/**
 * Buffer ya da dosya yolu için rastgele erişimli okuyucu.
 * @param {Buffer | string} kaynak
 * @returns {Promise<{ boyut: number; oku: (konum: number, uzunluk: number) => Promise<Buffer>; kapat: () => Promise<void> }>}
 */
async function kaynakAc(kaynak) {
  if (Buffer.isBuffer(kaynak)) {
    return {
      boyut: kaynak.length,
      oku: async (konum, uzunluk) => kaynak.subarray(konum, konum + uzunluk),
      kapat: async () => {}
    };
  }
  if (typeof kaynak !== 'string') throw new YedekHatasi('BICIM', 'Dosya bir platform yedeği (.tayedek) değil veya bozuk.');
  let fh;
  try {
    fh = await open(kaynak, 'r');
  } catch {
    throw new YedekHatasi('BULUNAMADI', 'Yedek dosyası okunamadı.');
  }
  const { size } = await fh.stat();
  const acik = fh;
  return {
    boyut: size,
    oku: async (konum, uzunluk) => {
      const b = Buffer.alloc(uzunluk);
      let okunan = 0;
      while (okunan < uzunluk) {
        const { bytesRead } = await acik.read(b, okunan, uzunluk - okunan, konum + okunan);
        if (!bytesRead) throw new YedekHatasi('BICIM', 'Yedek dosyası eksik (kesilmiş olabilir).');
        okunan += bytesRead;
      }
      return b;
    },
    kapat: async () => { await acik.close().catch(() => {}); }
  };
}

/** Biçim 2 düz metin akış okuyucusu (parçaları sırayla çözer ve doğrular). */
class AkisOkuyucu {
  /**
   * @param {{ boyut: number; oku: (konum: number, uzunluk: number) => Promise<Buffer> }} kaynak
   * @param {Buffer} anahtar @param {Buffer} baslik
   */
  constructor(kaynak, anahtar, baslik) {
    this.kaynak = kaynak;
    this.anahtar = anahtar;
    this.baslik = baslik;
    const govde = kaynak.boyut - BASLIK_AAD_BOYUTU;
    const tam = YEDEK_PARCA_BOYUTU + ETIKET;
    this.parcaSayisi = Math.ceil(govde / tam);
    const son = govde - (this.parcaSayisi - 1) * tam;
    if (govde < ETIKET || son < ETIKET) throw new YedekHatasi('BICIM', 'Yedek dosyası eksik veya bozuk.');
    this.sira = 0;
    this.tampon = Buffer.alloc(0);
    /** Şimdiye kadar okunan dosya baytı (ilerleme için). */
    this.okunanDosya = BASLIK_AAD_BOYUTU;
  }

  /** Sıradaki parçayı çözer; parça kalmadıysa false. */
  async doldur() {
    if (this.sira >= this.parcaSayisi) return false;
    const tam = YEDEK_PARCA_BOYUTU + ETIKET;
    const son = this.sira === this.parcaSayisi - 1;
    const konum = BASLIK_AAD_BOYUTU + this.sira * tam;
    const uzunluk = son ? this.kaynak.boyut - konum : tam;
    const sifreli = await this.kaynak.oku(konum, uzunluk);
    const cozucu = createDecipheriv('aes-256-gcm', this.anahtar, parcaIv(this.baslik, this.sira));
    cozucu.setAAD(parcaAad(this.baslik, this.sira, son));
    cozucu.setAuthTag(sifreli.subarray(uzunluk - ETIKET));
    try {
      this.tampon = Buffer.concat([cozucu.update(sifreli.subarray(0, uzunluk - ETIKET)), cozucu.final()]);
    } catch {
      if (this.sira === 0) {
        throw new KasaHatasi('PAROLA_YANLIS', 'Yedek parolası yanlış veya dosya bozuk. Bu yedeği oluşturduğunuz kasa parolasını girin.');
      }
      throw new YedekHatasi('BICIM', 'Yedek dosyası bozuk (bir bölümü doğrulanamadı).');
    }
    this.sira++;
    this.okunanDosya = konum + uzunluk;
    return true;
  }

  /** Tam n baytı parça parça verir. @param {number} n @returns {AsyncGenerator<Buffer>} */
  async* akit(n) {
    let kalan = n;
    while (kalan > 0) {
      if (!this.tampon.length && !(await this.doldur())) throw new YedekHatasi('BICIM', 'Yedek dosyası eksik (beklenmedik son).');
      const b = this.tampon.subarray(0, Math.min(kalan, this.tampon.length));
      this.tampon = this.tampon.subarray(b.length);
      kalan -= b.length;
      yield b;
    }
  }

  /** @param {number} n */
  async oku(n) {
    /** @type {Buffer[]} */
    const parcalar = [];
    for await (const p of this.akit(n)) parcalar.push(p);
    return parcalar.length === 1 ? parcalar[0] : Buffer.concat(parcalar);
  }

  /** Akışta veri kaldı mı? (Tüm parçalar çözülüp doğrulanır.) */
  async veriKaldiMi() {
    if (this.tampon.length) return true;
    while (await this.doldur()) if (this.tampon.length) return true;
    return false;
  }
}

/** @param {Buffer} b */
function kayitBasligiOku(b) {
  const uzunluk = b.readBigUInt64BE(1);
  if (uzunluk > BigInt(Number.MAX_SAFE_INTEGER)) throw new YedekHatasi('BICIM', 'Yedek kaydı geçersiz.');
  return { tur: b[0], uzunluk: Number(uzunluk) };
}

/** @param {Buffer} sikistirilmis @param {1 | 2} surum */
function icerikAc(sikistirilmis, surum) {
  /** @type {unknown} */
  let icerik;
  try {
    icerik = JSON.parse(gunzipSync(sikistirilmis).toString('utf8'));
  } catch {
    throw new YedekHatasi('BICIM', 'Yedek içeriği okunamadı (bozuk dosya).');
  }
  return icerikDogrula(icerik, surum);
}

/**
 * @typedef {{
 *   manifest: YedekManifesti;
 *   kasa: { kdf: { alg: 'scrypt'; N: number; r: number; p: number; tuz: string }; dogrulayici: string; medyaAnahtari?: string };
 *   tablolar: Record<string, Record<string, unknown>[]>;
 * }} DogrulanmisIcerik
 * @typedef {{
 *   bicimSurumu: number; semaSurumu: number; olusturulma: string; makine: { id: string; ad: string };
 *   sayimlar: Record<string, number>;
 *   medya?: { secim: Record<string, boolean>; dosyaSayisi: number; bayt: number; turler: Record<string, { sayi: number; bayt: number }> };
 * }} YedekManifesti
 */

/**
 * Yedek dosyasını parolayla açar ve doğrular. VERİTABANINA HİÇBİR ŞEY YAZMAZ.
 * - kaynak: Buffer ya da dosya yolu (biçim 2 dosyadan AKIŞLA okunur; biçim 1 belleğe alınır).
 * - hazirlikKlasoru verilirse yedekteki (şifreli) medya dosyaları bu klasöre OLDUĞU GİBİ
 *   çıkarılır (düz metin yazılmaz); verilmezse okunur/doğrulanır ama atılır. Hata durumunda
 *   klasörü temizlemek çağıranın işidir.
 * - Dönen kasaAnahtari ve medyaAnahtari'ni çağıran sıfırlamalıdır.
 * @param {Buffer | string} kaynak
 * @param {string} parola
 * @param {{ ilerleme?: IlerlemeFn; hazirlikKlasoru?: string | null }} [secenekler]
 */
export async function yedekAc(kaynak, parola, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  ilerleme('dosya kontrol ediliyor', 2);
  const k = await kaynakAc(kaynak);
  /** @type {Buffer | null} */
  let kasaAnahtari = null;
  /** @type {Buffer | null} */
  let medyaAnahtari = null;
  try {
    if (k.boyut < BASLIK_AAD_BOYUTU + ETIKET) throw new YedekHatasi('BICIM', 'Dosya bir platform yedeği (.tayedek) değil veya bozuk.');
    const baslik = Buffer.from(await k.oku(0, BASLIK_AAD_BOYUTU));
    if (!baslik.subarray(0, 8).equals(SIHIRLI)) throw new YedekHatasi('BICIM', 'Dosya bir platform yedeği (.tayedek) değil veya bozuk.');
    const surum = baslik.readUInt8(8);
    if (surum !== BICIM_SURUMU && surum !== ESKI_BICIM_SURUMU) {
      throw new YedekHatasi('SURUM', `Yedek biçim sürümü (${surum}) desteklenmiyor; uygulamayı güncelleyin.`);
    }
    const log2N = baslik.readUInt8(9);
    const kdf = { N: 2 ** log2N, r: baslik.readUInt8(10), p: baslik.readUInt8(11) };
    if (log2N < 10 || log2N > 22 || kdf.r < 1 || kdf.r > 32 || kdf.p < 1 || kdf.p > 16) {
      throw new YedekHatasi('BICIM', 'Yedek başlığındaki anahtar parametreleri geçersiz.');
    }
    const kasaTuzu = baslik.subarray(12, 28);
    const dosyaTuzu = baslik.subarray(28, 44);
    if (typeof parola !== 'string' || !parola) throw new KasaHatasi('PAROLA_YANLIS', 'Yedek parolası yanlış veya dosya bozuk.');
    ilerleme('parola doğrulanıyor', 5);
    kasaAnahtari = await anahtarTuret(parola, kdf, Buffer.from(kasaTuzu));
    const anahtar = dosyaAnahtari(kasaAnahtari, Buffer.from(dosyaTuzu), surum === 1 ? 1 : 2);
    /** @type {DogrulanmisIcerik} */
    let dogrulanmis;
    /** @type {Map<string, { yol: string | null; boyut: number }>} */
    const medyaDosyalari = new Map();
    try {
      if (surum === ESKI_BICIM_SURUMU) {
        if (k.boyut < V1_BASLIK_BOYUTU + 1) throw new YedekHatasi('BICIM', 'Dosya bir platform yedeği (.tayedek) değil veya bozuk.');
        const dosya = await k.oku(0, k.boyut);
        let sikistirilmis;
        try {
          const cozucu = createDecipheriv('aes-256-gcm', anahtar, dosya.subarray(44, 56));
          cozucu.setAAD(dosya.subarray(0, BASLIK_AAD_BOYUTU));
          cozucu.setAuthTag(dosya.subarray(56, 72));
          sikistirilmis = Buffer.concat([cozucu.update(dosya.subarray(V1_BASLIK_BOYUTU)), cozucu.final()]);
        } catch {
          throw new KasaHatasi('PAROLA_YANLIS', 'Yedek parolası yanlış veya dosya bozuk. Bu yedeği oluşturduğunuz kasa parolasını girin.');
        }
        ilerleme('açılıyor', 35);
        dogrulanmis = icerikAc(sikistirilmis, 1);
        // Biçim 1 hiçbir medya dosyası taşımaz: satırlar "yedeğe dahil edilmedi" olarak işaretlenir.
        if (dogrulanmis.tablolar.medya) {
          dogrulanmis.tablolar.medya = dogrulanmis.tablolar.medya.map((m) => (m.silinme == null ? { ...m, yedek_disi: 1 } : m));
        }
      } else {
        const okuyucu = new AkisOkuyucu(k, anahtar, baslik);
        const ilk = kayitBasligiOku(await okuyucu.oku(KAYIT_BASLIGI));
        if (ilk.tur !== KAYIT.ICERIK || ilk.uzunluk > k.boyut) throw new YedekHatasi('BICIM', 'Yedek içeriği okunamadı (bozuk dosya).');
        ilerleme('açılıyor', 10);
        dogrulanmis = icerikAc(await okuyucu.oku(ilk.uzunluk), 2);
        const medyaSatirlari = new Map((dogrulanmis.tablolar.medya ?? []).map((m) => [String(m.id), m]));
        const toplamMedya = Number(dogrulanmis.manifest.medya?.bayt ?? 0);
        let islenen = 0;
        let sonBildirim = 0;
        const medyaIlerleme = () => ilerleme(
          `medya dosyaları açılıyor (${mbMetni(islenen)} / ${mbMetni(toplamMedya)} MB)`,
          10 + Math.min(35, Math.floor((35 * okuyucu.okunanDosya) / k.boyut)),
          { islenen, toplam: toplamMedya }
        );
        if (secenekler.hazirlikKlasoru) mkdirSync(secenekler.hazirlikKlasoru, { recursive: true, mode: 0o700 });
        for (;;) {
          const kb = kayitBasligiOku(await okuyucu.oku(KAYIT_BASLIGI));
          if (kb.tur === KAYIT.SON) {
            if (kb.uzunluk !== 0 || await okuyucu.veriKaldiMi()) throw new YedekHatasi('BICIM', 'Yedek dosyası bozuk (son kayıttan sonra veri var).');
            break;
          }
          if (kb.tur !== KAYIT.MEDYA) throw new YedekHatasi('BICIM', 'Yedekte bilinmeyen kayıt türü.');
          const idUzunlugu = (await okuyucu.oku(2)).readUInt16BE(0);
          const id = (await okuyucu.oku(idUzunlugu)).toString('utf8');
          const veriUzunlugu = kb.uzunluk - 2 - idUzunlugu;
          if (veriUzunlugu < MEDYA_SIHIRLI.length || !medyaSatirlari.has(id) || medyaDosyalari.has(id)) {
            throw new YedekHatasi('VERI', 'Yedekteki bir medya dosyası hiçbir medya kaydıyla eşleşmiyor.');
          }
          const yol = secenekler.hazirlikKlasoru ? join(secenekler.hazirlikKlasoru, `${medyaDosyalari.size}.medya`) : null;
          const fh = yol ? await open(yol, 'wx', 0o600) : null;
          try {
            let bas = Buffer.alloc(0);
            for await (const parca of okuyucu.akit(veriUzunlugu)) {
              if (bas.length < MEDYA_SIHIRLI.length) {
                bas = Buffer.concat([bas, parca.subarray(0, MEDYA_SIHIRLI.length - bas.length)]);
                if (bas.length === MEDYA_SIHIRLI.length && !bas.equals(MEDYA_SIHIRLI)) {
                  throw new YedekHatasi('VERI', 'Yedekteki bir medya dosyası şifreli medya biçiminde değil.');
                }
              }
              if (fh) {
                let yazilan = 0;
                while (yazilan < parca.length) yazilan += (await fh.write(parca, yazilan, parca.length - yazilan)).bytesWritten;
              }
              islenen += parca.length;
              if (islenen - sonBildirim >= 4 * MB) { sonBildirim = islenen; medyaIlerleme(); }
            }
            if (fh) await fh.sync();
          } finally {
            await fh?.close();
          }
          medyaDosyalari.set(id, { yol, boyut: veriUzunlugu });
          medyaIlerleme();
        }
        if (medyaDosyalari.size && !dogrulanmis.kasa.medyaAnahtari) throw new YedekHatasi('VERI', 'Yedekte medya dosyaları var ama medya anahtarı yok.');
      }
    } finally {
      anahtar.fill(0);
    }
    ilerleme('içerik doğrulanıyor', 45);
    if (!anahtarDogrulayiciyaUyarMi(kasaAnahtari, dogrulanmis.kasa.dogrulayici)
      || dogrulanmis.kasa.kdf.tuz !== Buffer.from(kasaTuzu).toString('base64url')) {
      throw new YedekHatasi('KASA_UYUSMAZ', 'Yedekteki kasa bilgisi başlıkla uyuşmuyor (bozuk dosya).');
    }
    if (dogrulanmis.kasa.medyaAnahtari) {
      try {
        medyaAnahtari = medyaAnahtariniAc(dogrulanmis.kasa.medyaAnahtari, kasaAnahtari);
      } catch {
        throw new YedekHatasi('KASA_UYUSMAZ', 'Yedekteki medya anahtarı açılamadı (bozuk dosya).');
      }
    }
    const sonuc = { ...dogrulanmis, bicimSurumu: surum, kasaAnahtari, medyaAnahtari, medyaDosyalari };
    kasaAnahtari = null;
    medyaAnahtari = null;
    return sonuc;
  } finally {
    kasaAnahtari?.fill(0);
    medyaAnahtari?.fill(0);
    await k.kapat();
  }
}

/**
 * @param {unknown} icerik @param {1 | 2} surum
 * @returns {DogrulanmisIcerik}
 */
function icerikDogrula(icerik, surum) {
  const nesne = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
  if (!nesne(icerik)) throw new YedekHatasi('VERI', 'Yedek içeriği geçersiz.');
  const i = /** @type {{ manifest?: { bicimSurumu?: unknown; semaSurumu?: unknown }; kasa?: { kdf?: unknown; dogrulayici?: unknown; medyaAnahtari?: unknown }; tablolar?: Record<string, unknown> }} */ (icerik);
  if (!nesne(i.manifest) || i.manifest.bicimSurumu !== surum) throw new YedekHatasi('VERI', 'Yedek manifesti geçersiz.');
  if (typeof i.manifest.semaSurumu !== 'number' || i.manifest.semaSurumu > GUNCEL_SEMA_SURUMU) {
    throw new YedekHatasi('SURUM', `Yedek daha yeni bir şema sürümüyle (${i.manifest.semaSurumu}) oluşturulmuş; önce uygulamayı güncelleyin.`);
  }
  if (!nesne(i.kasa) || !nesne(i.kasa.kdf) || typeof i.kasa.dogrulayici !== 'string') throw new YedekHatasi('VERI', 'Yedekteki kasa bilgisi eksik.');
  if (i.kasa.medyaAnahtari !== undefined && !zarfMi(i.kasa.medyaAnahtari)) throw new YedekHatasi('VERI', 'Yedekteki medya anahtarı geçersiz.');
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
        // Şifreli JSON sütunu (ör. ayarlar.deger_json) bütünüyle zarf olabilir.
        if (tablo.json.includes(sutun) && typeof deger === 'string' && !zarfMi(deger)) {
          try { JSON.parse(deger); } catch { throw new YedekHatasi('VERI', `"${ad}.${sutun}" geçerli JSON değil.`); }
        }
      }
    }
  }
  return /** @type {DogrulanmisIcerik} */ (/** @type {unknown} */ (i));
}

// ---------------------------------------------------------------------------------------
// Medya dosyalarını yerel depoya yerleştirme (tam yükleme ve seçmeli içe aktarma)
// ---------------------------------------------------------------------------------------

/** Medya klasörü içinde yeni bir hazırlık (staging) klasörü yolu. @param {string} klasor */
export function hazirlikKlasoruYolu(klasor) {
  return join(klasor, `.hazirlik-${randomBytes(8).toString('hex')}`);
}

/** @param {string | null | undefined} yol */
export function hazirlikKlasorunuSil(yol) {
  if (!yol) return;
  try { rmSync(yol, { recursive: true, force: true }); } catch { /* bir sonraki saklama temizliğinde silinir */ }
}

/** @param {Buffer} a @param {Buffer} b */
function anahtarlarAyni(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Yedekten gelen medya satırları için dosyaları yerel medya deposuna yazar. Veritabanı
 * satırları ÖNCEDEN yazılmış olmalı (tam yükleme / seçmeli uygulama); kasa AÇIK olmalı.
 * - Satırı veritabanında olmayan medya (ör. sonucu içe aktarılmayan) atlanır.
 * - Kimlik üzerinden tekilleştirme: satırın dosyası yerelde zaten varsa dokunulmaz (ve
 *   yedek_disi bayrağı kaldırılır).
 * - Kaynak ve hedef medya ana anahtarı aynıysa şifreli dosya taşınır; farklıysa akışla
 *   çözülüp yerel anahtarla yeniden şifrelenir.
 * @param {Veritabani} vt
 * @param {{
 *   klasor: string; kaynakAnahtar: Buffer | null; dosyalar: Map<string, { yol: string | null; boyut: number }>;
 *   idler: readonly string[]; ilerleme?: IlerlemeFn;
 * }} girdi
 */
export async function medyalariYerlestir(vt, girdi) {
  const ilerleme = girdi.ilerleme ?? (() => {});
  const sonuc = { eklenen: 0, bayt: 0, zatenVardi: 0, atlanan: 0, dahilDegil: 0, yenidenSifrelenen: 0 };
  if (!girdi.idler.length) return sonuc;
  const bayrakVar = tabloSutunlari(vt, 'medya').includes('yedek_disi');
  const hedefAnahtar = girdi.dosyalar.size ? medyaAnahtariniHazirla(vt) : null;
  const ayni = Boolean(hedefAnahtar && girdi.kaynakAnahtar && anahtarlarAyni(hedefAnahtar, girdi.kaynakAnahtar));
  const toplam = [...girdi.dosyalar.values()].reduce((a, d) => a + d.boyut, 0);
  /** @type {Array<[string, unknown[]]>} */
  const guncellemeler = [];
  try {
    for (const id of girdi.idler) {
      const satir = vt.tek(`SELECT dosya, silinme${bayrakVar ? ', yedek_disi' : ''} FROM medya WHERE id = ?`, [id]);
      if (!satir) { sonuc.atlanan++; continue; }
      const dosyaAdi = String(satir.dosya);
      const yerelVar = medyaDosyaAdiGecerliMi(dosyaAdi) && existsSync(join(girdi.klasor, dosyaAdi));
      if (yerelVar) {
        sonuc.zatenVardi++;
        if (bayrakVar && Number(satir.yedek_disi) === 1) guncellemeler.push(['UPDATE medya SET yedek_disi = 0 WHERE id = ?', [id]]);
        continue;
      }
      const kaynak = girdi.dosyalar.get(id);
      if (!kaynak || !kaynak.yol || satir.silinme != null) {
        if (satir.silinme == null) sonuc.dahilDegil++;
        continue;
      }
      if (!hedefAnahtar) continue;
      let yeniAd;
      if (ayni) {
        yeniAd = medyaDosyaAdiGecerliMi(dosyaAdi) ? dosyaAdi : `${randomBytes(16).toString('hex')}.medya`;
        mkdirSync(girdi.klasor, { recursive: true });
        await rename(kaynak.yol, join(girdi.klasor, yeniAd));
      } else {
        if (!girdi.kaynakAnahtar) throw new YedekHatasi('VERI', 'Yedekteki medya anahtarı yok.');
        ({ dosya: yeniAd } = await medyaSifrele(hedefAnahtar, girdi.klasor, medyaCoz(girdi.kaynakAnahtar, kaynak.yol)));
        sonuc.yenidenSifrelenen++;
      }
      guncellemeler.push([`UPDATE medya SET dosya = ?${bayrakVar ? ', yedek_disi = 0' : ''} WHERE id = ?`, [yeniAd, id]]);
      sonuc.eklenen++;
      sonuc.bayt += kaynak.boyut;
      ilerleme(`medya yazılıyor (${mbMetni(sonuc.bayt)} / ${mbMetni(toplam)} MB)`,
        toplam ? Math.floor((100 * sonuc.bayt) / toplam) : 100, { islenen: sonuc.bayt, toplam });
    }
  } finally {
    // Yazılan dosyaların satırları, sonraki bir dosyada hata olsa da güncellenir.
    if (guncellemeler.length) vt.islem(() => { for (const [sql, p] of guncellemeler) vt.calistir(sql, p); });
    hedefAnahtar?.fill(0);
  }
  return sonuc;
}

/** Veri yoksa (makine kaydı hariç) ve kasa oluşturulmamışsa boştur. @param {Veritabani} vt */
export function veritabaniBosMu(vt) {
  const s = sayimlar(vt);
  const veriVar = Object.entries(s).some(([tablo, sayi]) => tablo !== 'makineler' && sayi > 0);
  return !veriVar && !kasaDurumu(vt).olusturuldu;
}

/** @param {Veritabani} vt @param {string} tablo @param {Record<string, unknown>} satir @param {string[]} sutunlar */
export function satirEkle(vt, tablo, satir, sutunlar) {
  const kullan = sutunlar.filter((s) => s in satir);
  vt.calistir(
    `INSERT INTO ${tablo} (${kullan.join(', ')}) VALUES (${kullan.map(() => '?').join(', ')})`,
    kullan.map((s) => satir[s])
  );
}

/**
 * Yedek satırlarının sütunları bu şemada var mı? (Yoksa VERI hatası.)
 * @param {Veritabani} vt @param {Record<string, Record<string, unknown>[]>} tablolar
 * @returns {Map<string, string[]>} tablo → sütunlar
 */
export function sutunlariDogrula(vt, tablolar) {
  const sutunlar = new Map(TABLOLAR.map((t) => [t.ad, tabloSutunlari(vt, t.ad)]));
  for (const [ad, satirlar] of Object.entries(tablolar)) {
    const bilinen = new Set(sutunlar.get(ad));
    for (const satir of satirlar) {
      const fazla = Object.keys(satir).find((s) => !bilinen.has(s));
      if (fazla) throw new YedekHatasi('VERI', `Yedekteki "${ad}.${fazla}" sütunu bu şemada yok.`);
    }
  }
  return sutunlar;
}

/**
 * TAM YÜKLEME yazma adımı (tek transaction): tüm tabloları boşaltır, yedeğin satırlarını ve
 * kasa bilgisini yazar, ardından kasayı verilen anahtarla açar (açılışta şifreli sütunlarda
 * kalan düz metin — ör. v1 yedeği — şifrelenir).
 * Yedek medya anahtarı taşıyorsa ve yerelde kullanılabilir bir medya anahtarı yoksa yedeğinki
 * benimsenir (bkz. medyaAnahtariniBenimse).
 * @param {Veritabani} vt
 * @param {Record<string, Record<string, unknown>[]>} tablolar
 * @param {{ kdf: object; dogrulayici: string; medyaAnahtari?: string }} kasa
 * @param {Buffer} kasaAnahtari
 * @param {IlerlemeFn} [ilerleme]
 */
export function tamYukleYaz(vt, tablolar, kasa, kasaAnahtari, ilerleme = () => {}) {
  const sutunlar = sutunlariDogrula(vt, tablolar);
  const toplam = Object.values(tablolar).reduce((a, s) => a + s.length, 0) || 1;
  let yazilan = 0;
  /** @type {Buffer | null} */
  let eskiAnahtar = null;
  try { eskiAnahtar = acikAnahtar(vt); } catch { eskiAnahtar = null; }
  vt.islem(() => {
    medyaAnahtariniBenimse(vt, kasa.medyaAnahtari, [eskiAnahtar, kasaAnahtari]);
    for (const t of [...TABLOLAR].reverse()) vt.calistir(`DELETE FROM ${t.ad}`);
    for (const t of TABLOLAR) {
      const tSutun = /** @type {string[]} */ (sutunlar.get(t.ad));
      for (const satir of tablolar[t.ad] ?? []) {
        satirEkle(vt, t.ad, satir, tSutun);
        if (++yazilan % 500 === 0) ilerleme('yazılıyor', 60 + Math.round((35 * yazilan) / toplam));
      }
    }
    vt.metaYaz('kasa_surum', '1');
    vt.metaYaz('kasa_kdf', JSON.stringify(kasa.kdf));
    vt.metaYaz('kasa_dogrulayici', kasa.dogrulayici);
  });
  // Yerel makine kaydı kasa YENİ anahtarla açıldıktan sonra yazılır (makine adı şifreli bir
  // sütundur; eski anahtarla şifrelenmesin).
  kasayiAnahtarlaAc(vt, kasaAnahtari);
  yerelMakine(vt);
}

/**
 * Yedeğin medya anahtarı zarfını (yedeğin kasa anahtarıyla sarılı) yerel meta'ya yazar — YALNIZCA
 * yerelde medya anahtarı yoksa ya da yereldeki zarf verilen anahtarların hiçbiriyle açılamıyorsa
 * (o zarfla şifrelenmiş yerel dosyalar zaten okunamaz). Yerelde kullanılabilir bir medya anahtarı
 * varsa korunur (kasa anahtarı değişirse kasayiAnahtarlaAc yeniden sarar) ve yedekteki medya
 * dosyaları içe aktarılırken yerel anahtarla yeniden şifrelenir. İşlem (transaction) içinde çağrılır.
 * @param {Veritabani} vt @param {string | undefined} yedekZarfi @param {Array<Buffer | null>} anahtarlar
 */
export function medyaAnahtariniBenimse(vt, yedekZarfi, anahtarlar) {
  if (!yedekZarfi) return;
  const yerel = vt.metaOku(MEDYA_ANAHTARI_META);
  if (yerel) {
    for (const a of anahtarlar) {
      if (!a) continue;
      try { zarfCoz(a, yerel); return; } catch { /* sıradaki anahtar */ }
    }
  }
  vt.metaYaz(MEDYA_ANAHTARI_META, yedekZarfi);
}

/**
 * TAM YÜKLEME: tüm veriyi (kasa dahil) yedektekiyle değiştirir. Parola yanlışsa / dosya
 * bozuksa HİÇBİR ŞEY yazılmaz; yazma tek transaction'dır. Veritabanı boş değilse onay: true
 * gerekir; kasa açıksa önce otomatik bir güvenlik yedeği alınır.
 * (Seçmeli birleştirme için ice-aktarma.mjs > önizleme/uygulama akışı kullanılır.)
 * Yedekteki medya dosyaları medya klasörüne (varsayılan: veritabanının yanındaki medya/) yazılır.
 * @param {Veritabani} vt
 * @param {Buffer | string} dosya Buffer ya da dosya yolu
 * @param {string} parola
 * @param {{ mod: 'tamYukle'; onay?: boolean; ilerleme?: IlerlemeFn; guvenlikYedegiKlasoru?: string; medyaKlasoru?: string | null }} secenekler
 */
export async function yedekIceAktar(vt, dosya, parola, secenekler) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  if (secenekler.mod !== 'tamYukle') {
    throw new YedekHatasi('VERI', 'Bu fonksiyon yalnızca "tamYukle" yapar; seçmeli içe aktarma için önizleme akışını kullanın.');
  }
  // Ön koşullar parola sorulmadan (pahalı scrypt'ten önce) kontrol edilir.
  const bos = veritabaniBosMu(vt);
  if (!bos && !secenekler.onay) {
    throw new YedekHatasi('ONAY_GEREKLI',
      'Veritabanı boş değil: tam yükleme mevcut TÜM veriyi (kasa dahil) yedektekiyle değiştirir. Emin iseniz onaylayarak tekrar deneyin.');
  }
  const yerelKasa = kasaDurumu(vt);
  const klasor = secenekler.medyaKlasoru !== undefined ? secenekler.medyaKlasoru : (vt.yol ? medyaKlasoru(vt.yol) : null);
  const hazirlik = klasor ? hazirlikKlasoruYolu(klasor) : null;
  /** @type {Awaited<ReturnType<typeof yedekAc>> | null} */
  let yedek = null;
  try {
    yedek = await yedekAc(dosya, parola, { ilerleme, hazirlikKlasoru: hazirlik });
    sutunlariDogrula(vt, yedek.tablolar);
    let guvenlikYedegi = null;
    if (!bos && yerelKasa.acik) {
      ilerleme('güvenlik yedeği alınıyor', 50);
      guvenlikYedegi = otomatikYedekAl(vt, { klasor: secenekler.guvenlikYedegiKlasoru }).dosya;
    }
    ilerleme('yazılıyor', 60);
    // Şema < 3 yedeği: geçmişteki "yapan" düz metin makine adı taşıyabilir (bkz. göç 3).
    const tablolar = yedek.manifest.semaSurumu < 3 && yedek.tablolar.degisiklik_gecmisi
      ? { ...yedek.tablolar, degisiklik_gecmisi: yedek.tablolar.degisiklik_gecmisi.map(gecmisYapaniniNormallestir) }
      : yedek.tablolar;
    tamYukleYaz(vt, tablolar, yedek.kasa, yedek.kasaAnahtari, ilerleme);
    const medya = klasor
      ? await medyalariYerlestir(vt, {
        klasor, kaynakAnahtar: yedek.medyaAnahtari, dosyalar: yedek.medyaDosyalari,
        idler: (tablolar.medya ?? []).map((m) => String(m.id)),
        ilerleme: (a, y, b) => ilerleme(a, 96 + Math.floor(y * 0.03), b)
      })
      : null;
    ilerleme('tamamlandı', 100);
    return { mod: /** @type {'tamYukle'} */ ('tamYukle'), manifest: yedek.manifest, sayimlar: sayimlar(vt), guvenlikYedegi, medya };
  } finally {
    yedek?.kasaAnahtari.fill(0);
    yedek?.medyaAnahtari?.fill(0);
    hazirlikKlasorunuSil(hazirlik);
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
