// KASA — şifreli alanların (veritabani/gocler.mjs > SIFRELI_ALANLAR: giriş parolası, TOTP,
// kullanıcı adı, ortam adı/adresi, bağlam alanları, ayarlar, makine adı; ayrıca test verisinde
// "hassas" işaretli alanlar) ve yedek dosyasının şifrelenmesi.
//
// Tasarım:
// - Tek bir "kasa parolası". Anahtar türetme: scrypt (N=2^17, r=8, p=1, 32 bayt anahtar),
//   rastgele 16 baytlık tuz. Tuz ve parametreler meta tablosunda (kasa_kdf) durur.
// - Her hassas değer ayrı ayrı AES-256-GCM ile şifrelenir (her değere rastgele 12 bayt IV,
//   16 bayt doğrulama etiketi). Saklanan biçim sürümlü bir "zarf" metnidir:
//       kasa:v1:<iv base64url>:<etiket base64url>:<şifreli metin base64url>
// - Parola doğrulayıcı: sabit bir metnin zarfı (kasa_dogrulayici). Parola doğruysa zarf
//   açılır; yanlışsa GCM etiketi tutmaz. Parolanın kendisi veya özeti SAKLANMAZ.
// - Türetilen anahtar YALNIZCA bu sürecin belleğinde tutulur (kasaAc); kasaKilitle ile
//   sıfırlanıp atılır. Parola unutulursa veri KURTARILAMAZ (bilinçli tasarım).
// - Arayüz kilidi (zamanlanmış koşular, bkz. zamanlama/anahtar-emaneti.mjs): anahtar bellekte olsa da ARAYÜZ kilitli
//   olabilir ("arka plan kipi"). Bu kipte kasaAcikMi true (koşucu/raporlayıcı iç işleri çalışır), arayuzAcikMi false:
//   HTTP veri uçları ve kasaDurumu().acik kasayı KİLİTLİ görür. Kullanıcı parolayla açınca (kasaAc) kilit kalkar.
// - Gizli değerler (parola, anahtar, düz metin) hiçbir yerde loglanmaz; hata mesajları da
//   gizli değer içermez.

import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { SIFRELI_ALANLAR, TABLOLAR } from './veritabani/gocler.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ alg: 'scrypt'; N: number; r: number; p: number; tuz: string }} KdfParametreleri */

export const MIN_PAROLA_UZUNLUGU = 8;
export const ZARF_ON_EKI = 'kasa:v1:';
/** Metin içinde geçen zarfları bulmak için (base64url karakterleri tırnak/ters bölü içermez;
 * bu yüzden iç içe JSON metinlerinde de zarf birebir aynı görünür). */
export const ZARF_DESENI = /kasa:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*/g;
export const VARSAYILAN_KDF = Object.freeze({ N: 2 ** 17, r: 8, p: 1 });
const DOGRULAYICI_METNI = 'platform-kasa-dogrulayici-v1';
const ANAHTAR_UZUNLUGU = 32;

/**
 * Sır niteliğindeki (hiç gösterilmeyen) sütunlar: SIFRELI_ALANLAR'da 'gizli' işaretliler
 * (türetilmiş görünüm; tek kaynak gocler.mjs). Test verisi profillerinde hassas alanlar türün
 * alanlar_json tanımındaki "hassas": true işaretinden okunur (depo.mjs).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const HASSAS_SUTUNLAR = Object.freeze(Object.fromEntries(
  Object.entries(SIFRELI_ALANLAR)
    .map(([tablo, sutunlar]) => [tablo, Object.freeze(Object.keys(sutunlar).filter((s) => sutunlar[s] === 'gizli'))])
    .filter(([, sutunlar]) => sutunlar.length > 0)
));

export class KasaHatasi extends Error {
  /**
   * @param {'PAROLA_KISA' | 'PAROLA_YANLIS' | 'KASA_KILITLI' | 'KASA_YOK' | 'KASA_VAR' | 'ZARF_BOZUK' | 'COK_DENEME'} kod
   * @param {string} mesaj
   * @param {{ bekleSaniye?: number }} [ek]
   */
  constructor(kod, mesaj, ek = {}) {
    super(mesaj);
    this.name = 'KasaHatasi';
    this.kod = kod;
    /** Yalnızca COK_DENEME: yeniden denemeden önce beklenecek süre (saniye). */
    this.bekleSaniye = ek.bekleSaniye ?? null;
  }
}

/**
 * Kaba kuvvet koruması (süreç başına, bellekte): art arda her YANLIŞ kasa/yedek parolasından
 * sonra bir sonraki deneme 1 sn, 2 sn, 4 sn ... (en fazla 30 sn) boyunca reddedilir. Doğru
 * parola sayacı sıfırlar. Bekleme süresi dolmadan gelen deneme parolası HİÇ denenmeden
 * COK_DENEME hatasıyla reddedilir (scrypt çalışmaz, sayaç artmaz).
 */
export class ParolaDenemeSiniri {
  /** @param {{ tabanMs?: number; ustSinirMs?: number; simdi?: () => number }} [secenekler] */
  constructor(secenekler = {}) {
    this.tabanMs = secenekler.tabanMs ?? 1000;
    this.ustSinirMs = secenekler.ustSinirMs ?? 30_000;
    this.simdi = secenekler.simdi ?? (() => Date.now());
    this.ardisikHata = 0;
    this.serbestZaman = 0;
  }

  /** Kalan bekleme (ms); 0 = deneme yapılabilir. */
  kalanMs() {
    return Math.max(0, this.serbestZaman - this.simdi());
  }

  /** Deneme öncesi çağrılır; bekleme sürüyorsa COK_DENEME fırlatır. */
  kontrolEt() {
    const kalan = this.kalanMs();
    if (kalan > 0) {
      const saniye = Math.ceil(kalan / 1000);
      throw new KasaHatasi('COK_DENEME',
        `Art arda yanlış parola girildi. Güvenlik için ${saniye} saniye bekleyip tekrar deneyin.`, { bekleSaniye: saniye });
    }
  }

  basarisiz() {
    this.ardisikHata++;
    const bekleme = Math.min(this.ustSinirMs, this.tabanMs * 2 ** (this.ardisikHata - 1));
    this.serbestZaman = this.simdi() + bekleme;
    return bekleme;
  }

  basarili() {
    this.ardisikHata = 0;
    this.serbestZaman = 0;
  }

  /**
   * Parola denemesini sarar: önce bekleme kontrolü; PAROLA_YANLIS → sayaç artar; başarı → sıfırlanır.
   * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
   */
  async dene(fn) {
    this.kontrolEt();
    try {
      const sonuc = await fn();
      this.basarili();
      return sonuc;
    } catch (hata) {
      if (hata instanceof KasaHatasi && hata.kod === 'PAROLA_YANLIS') this.basarisiz();
      throw hata;
    }
  }
}

/** @type {WeakMap<Veritabani, Buffer>} */
const acikAnahtarlar = new WeakMap();
/** Anahtarı bellekte olan ama ARAYÜZÜ kilitli veritabanları (arka plan kipi). @type {WeakSet<Veritabani>} */
const arayuzKilitliler = new WeakSet();

/** @param {unknown} parola */
export function parolaKontrolEt(parola) {
  if (typeof parola !== 'string' || [...parola].length < MIN_PAROLA_UZUNLUGU) {
    throw new KasaHatasi(
      'PAROLA_KISA',
      `Kasa parolası en az ${MIN_PAROLA_UZUNLUGU} karakter olmalıdır.`
    );
  }
}

/**
 * @param {string} parola
 * @param {{ N: number; r: number; p: number }} kdf
 * @param {Buffer} tuz
 * @returns {Promise<Buffer>}
 */
export function anahtarTuret(parola, kdf, tuz) {
  return new Promise((coz, reddet) => {
    scrypt(
      parola.normalize('NFC'),
      tuz,
      ANAHTAR_UZUNLUGU,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r + 16 * 1024 * 1024 },
      (hata, anahtar) => (hata ? reddet(hata) : coz(anahtar))
    );
  });
}

/** @param {Buffer} b */
const b64 = (b) => b.toString('base64url');

/** @param {Buffer} anahtar @param {string} duzMetin */
export function zarfSifrele(anahtar, duzMetin) {
  const iv = randomBytes(12);
  const sifreleyici = createCipheriv('aes-256-gcm', anahtar, iv);
  const sifreli = Buffer.concat([sifreleyici.update(String(duzMetin), 'utf8'), sifreleyici.final()]);
  return `${ZARF_ON_EKI}${b64(iv)}:${b64(sifreleyici.getAuthTag())}:${b64(sifreli)}`;
}

/** @param {Buffer} anahtar @param {string} zarf */
export function zarfCoz(anahtar, zarf) {
  if (!zarfMi(zarf)) throw new KasaHatasi('ZARF_BOZUK', 'Şifreli değer biçimi tanınmadı.');
  const [ivMetni, etiketMetni, sifreliMetin] = zarf.slice(ZARF_ON_EKI.length).split(':');
  const iv = Buffer.from(ivMetni, 'base64url');
  const etiket = Buffer.from(etiketMetni, 'base64url');
  if (iv.length !== 12 || etiket.length !== 16) throw new KasaHatasi('ZARF_BOZUK', 'Şifreli değer biçimi bozuk.');
  const cozucu = createDecipheriv('aes-256-gcm', anahtar, iv);
  cozucu.setAuthTag(etiket);
  try {
    return Buffer.concat([cozucu.update(Buffer.from(sifreliMetin, 'base64url')), cozucu.final()]).toString('utf8');
  } catch {
    throw new KasaHatasi('PAROLA_YANLIS', 'Şifreli değer açılamadı (parola yanlış veya veri bozuk).');
  }
}

/** @param {unknown} deger @returns {deger is string} */
export function zarfMi(deger) {
  return typeof deger === 'string' && /^kasa:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*$/.test(deger);
}

/**
 * Metin içindeki TÜM zarfları dönüştürür (iç içe JSON dahil). Değişiklik yoksa aynı metin döner.
 * @param {string} metin
 * @param {(zarf: string) => string} donustur
 */
export function metindekiZarflariDonustur(metin, donustur) {
  if (!metin.includes(ZARF_ON_EKI)) return metin;
  return metin.replace(ZARF_DESENI, (zarf) => donustur(zarf));
}

/** @param {Veritabani} vt @returns {KdfParametreleri | undefined} */
export function kasaKdfOku(vt) {
  const metin = vt.metaOku('kasa_kdf');
  if (!metin) return undefined;
  const kdf = JSON.parse(metin);
  return { alg: 'scrypt', N: Number(kdf.N), r: Number(kdf.r), p: Number(kdf.p), tuz: String(kdf.tuz) };
}

/** @param {Veritabani} vt */
export function kasaDurumu(vt) {
  const kdf = kasaKdfOku(vt);
  return {
    olusturuldu: Boolean(kdf && vt.metaOku('kasa_dogrulayici')),
    // Arayüzün gördüğü durum: arka plan kipinde (anahtar yalnız zamanlayıcının işi için bellekte) kasa KİLİTLİ görünür.
    acik: arayuzAcikMi(vt),
    minParolaUzunlugu: MIN_PAROLA_UZUNLUGU,
    kdf: kdf ? { alg: kdf.alg, N: kdf.N, r: kdf.r, p: kdf.p } : null
  };
}

/**
 * Anahtar bellekte mi? (İç işler: koşucu, raporlayıcı, zamanlayıcı.) Arka plan kipinde de true döner; HTTP veri uçları
 * bunun yerine arayuzAcikMi'ye bakmalıdır.
 * @param {Veritabani} vt
 */
export function kasaAcikMi(vt) {
  return acikAnahtarlar.has(vt);
}

/** Kasa kullanıcı için (arayüzde) açık mı? Arka plan kipinde false. @param {Veritabani} vt */
export function arayuzAcikMi(vt) {
  return acikAnahtarlar.has(vt) && !arayuzKilitliler.has(vt);
}

/** Arka plan kipi: anahtar bellekte, arayüz kilitli. @param {Veritabani} vt */
export function arkaPlanKipindeMi(vt) {
  return acikAnahtarlar.has(vt) && arayuzKilitliler.has(vt);
}

/** Anahtar bellekte kalır, arayüz kilitlenir (anahtar yoksa hiçbir şey yapmaz). @param {Veritabani} vt */
export function arayuzuKilitle(vt) {
  if (acikAnahtarlar.has(vt)) arayuzKilitliler.add(vt);
  return kasaDurumu(vt);
}

/**
 * İç kullanım (zamanlama/anahtar-emaneti.mjs): kasa kilitliyken anahtarın KOPYASINI arka plan kipinde yerleştirir (arayüz
 * kilitli kalır; şifreli alan tamamlama gibi yazmalar yapılmaz). Anahtar doğrulayıcıya uymazsa PAROLA_YANLIS. Anahtar
 * zaten bellekteyse hiçbir şey yapmaz ve false döner.
 * @param {Veritabani} vt @param {Buffer} anahtar
 */
export function kasayiArkaPlandaAc(vt, anahtar) {
  if (acikAnahtarlar.has(vt)) return false;
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!dogrulayici || !anahtarDogrulayiciyaUyarMi(anahtar, dogrulayici)) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa anahtarı bu kasaya uymuyor.');
  acikAnahtarlar.set(vt, Buffer.from(anahtar));
  arayuzKilitliler.add(vt);
  return true;
}

/**
 * Yeni kasa oluşturur ve açık bırakır.
 * @param {Veritabani} vt
 * @param {string} parola
 * @param {{ kdf?: { N: number; r: number; p: number } }} [secenekler] (kdf: yalnızca testlerde düşürülür)
 */
export async function kasaOlustur(vt, parola, secenekler = {}) {
  parolaKontrolEt(parola);
  if (kasaDurumu(vt).olusturuldu) throw new KasaHatasi('KASA_VAR', 'Kasa zaten oluşturulmuş.');
  const kdf = { ...VARSAYILAN_KDF, ...(secenekler.kdf ?? {}) };
  const tuz = randomBytes(16);
  const anahtar = await anahtarTuret(parola, kdf, tuz);
  vt.islem(() => {
    vt.metaYaz('kasa_surum', '1');
    vt.metaYaz('kasa_kdf', JSON.stringify({ alg: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, tuz: b64(tuz) }));
    vt.metaYaz('kasa_dogrulayici', zarfSifrele(anahtar, DOGRULAYICI_METNI));
  });
  anahtariYerlestir(vt, anahtar);
  arayuzKilitliler.delete(vt);
  sifreliAlanlariTamamla(vt);
  medyaAnahtariniHazirlaSessiz(vt);
  return kasaDurumu(vt);
}

/**
 * Parolayı doğrular ve türetilen anahtarı döner (kasayı AÇMAZ).
 * @param {Veritabani} vt
 * @param {string} parola
 */
export async function parolayiDogrula(vt, parola) {
  const kdf = kasaKdfOku(vt);
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!kdf || !dogrulayici) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
  if (typeof parola !== 'string' || !parola) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
  const anahtar = await anahtarTuret(parola, kdf, Buffer.from(kdf.tuz, 'base64url'));
  return anahtarDogrulayiciyaUyarMi(anahtar, dogrulayici) ? anahtar : null;
}

/** @param {Buffer} anahtar @param {string} dogrulayici */
export function anahtarDogrulayiciyaUyarMi(anahtar, dogrulayici) {
  try {
    const acik = Buffer.from(zarfCoz(anahtar, dogrulayici), 'utf8');
    const beklenen = Buffer.from(DOGRULAYICI_METNI, 'utf8');
    return acik.length === beklenen.length && timingSafeEqual(acik, beklenen);
  } catch {
    return false;
  }
}

/** @param {Veritabani} vt @param {Buffer} anahtar */
function anahtariYerlestir(vt, anahtar) {
  const eski = acikAnahtarlar.get(vt);
  if (eski && eski !== anahtar) eski.fill(0);
  acikAnahtarlar.set(vt, anahtar);
}

/** @param {Veritabani} vt @param {string} parola */
export async function kasaAc(vt, parola) {
  const anahtar = await parolayiDogrula(vt, parola);
  if (!anahtar) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
  anahtariYerlestir(vt, anahtar);
  arayuzKilitliler.delete(vt);
  sifreliAlanlariTamamla(vt);
  medyaAnahtariniHazirlaSessiz(vt);
  return kasaDurumu(vt);
}

/** @param {Veritabani} vt */
export function kasaKilitle(vt) {
  const anahtar = acikAnahtarlar.get(vt);
  if (anahtar) anahtar.fill(0);
  acikAnahtarlar.delete(vt);
  arayuzKilitliler.delete(vt);
  return kasaDurumu(vt);
}

/**
 * İç kullanım (yedek.mjs): açık kasanın anahtarı. Kasa kilitliyse hata verir.
 * @param {Veritabani} vt
 */
export function acikAnahtar(vt) {
  const anahtar = acikAnahtarlar.get(vt);
  if (!anahtar) {
    if (!kasaDurumu(vt).olusturuldu) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
    throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
  }
  return anahtar;
}

/**
 * İç kullanım (yedek.mjs > tam yükleme): kasa meta bilgisini değiştirdikten sonra anahtarı
 * belleğe yerleştirir. Anahtarın meta'daki doğrulayıcıya uyduğu kontrol edilir.
 * @param {Veritabani} vt
 * @param {Buffer} anahtar
 */
export function kasayiAnahtarlaAc(vt, anahtar) {
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!dogrulayici || !anahtarDogrulayiciyaUyarMi(anahtar, dogrulayici)) {
    throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
  }
  // Kasa anahtarı değişiyorsa (yedekten tam yükleme / kasa benimseme) medya ana anahtarı yeni
  // anahtarla yeniden sarılır — eski anahtar bellekten silinmeden ÖNCE.
  medyaAnahtariniYenidenSar(vt, acikAnahtarlar.get(vt) ?? null, anahtar);
  anahtariYerlestir(vt, Buffer.from(anahtar));
  arayuzKilitliler.delete(vt);
  sifreliAlanlariTamamla(vt);
  medyaAnahtariniHazirlaSessiz(vt);
}

/** @param {Veritabani} vt @param {string} duzMetin */
export function sifrele(vt, duzMetin) {
  return zarfSifrele(acikAnahtar(vt), duzMetin);
}

/** @param {Veritabani} vt @param {string} zarf */
export function coz(vt, zarf) {
  return zarfCoz(acikAnahtar(vt), zarf);
}

/**
 * Tüm tablolardaki tüm metin sütunlarında zarfları dönüştürür (aynı işlem içinde çağrılmalı).
 * @param {Veritabani} vt
 * @param {(zarf: string) => string} donustur
 * @returns {number} dönüştürülen zarf sayısı
 */
export function tumZarflariDonustur(vt, donustur) {
  let sayac = 0;
  const say = (/** @type {string} */ z) => {
    sayac++;
    return donustur(z);
  };
  for (const tablo of TABLOLAR) {
    const satirlar = vt.tumu(`SELECT * FROM ${tablo.ad}`);
    for (const satir of satirlar) {
      /** @type {Record<string, string>} */
      const degisenler = {};
      for (const [sutun, deger] of Object.entries(satir)) {
        if (typeof deger !== 'string' || !deger.includes(ZARF_ON_EKI)) continue;
        const yeni = metindekiZarflariDonustur(deger, say);
        if (yeni !== deger) degisenler[sutun] = yeni;
      }
      const sutunlar = Object.keys(degisenler);
      if (!sutunlar.length) continue;
      vt.calistir(
        `UPDATE ${tablo.ad} SET ${sutunlar.map((s) => `${s} = ?`).join(', ')} WHERE ${tablo.birincilAnahtar} = ?`,
        [...sutunlar.map((s) => degisenler[s]), satir[tablo.birincilAnahtar]]
      );
    }
  }
  return sayac;
}

/**
 * Kasa parolasını değiştirir: yeni tuz + yeni anahtar; TÜM hassas değerler (geçmiş kayıtları
 * dahil) tek bir transaction içinde yeniden şifrelenir. Hata olursa hiçbir şey değişmez.
 * @param {Veritabani} vt
 * @param {string} eskiParola
 * @param {string} yeniParola
 * @param {{ kdf?: { N: number; r: number; p: number } }} [secenekler]
 */
export async function parolaDegistir(vt, eskiParola, yeniParola, secenekler = {}) {
  parolaKontrolEt(yeniParola);
  const eskiAnahtar = await parolayiDogrula(vt, eskiParola);
  if (!eskiAnahtar) throw new KasaHatasi('PAROLA_YANLIS', 'Mevcut kasa parolası yanlış.');
  const eskiKdf = /** @type {KdfParametreleri} */ (kasaKdfOku(vt));
  const kdf = { N: eskiKdf.N, r: eskiKdf.r, p: eskiKdf.p, ...(secenekler.kdf ?? {}) };
  const tuz = randomBytes(16);
  const yeniAnahtar = await anahtarTuret(yeniParola, kdf, tuz);
  const sayi = vt.islem(() => {
    const donusen = tumZarflariDonustur(vt, (zarf) => zarfSifrele(yeniAnahtar, zarfCoz(eskiAnahtar, zarf)));
    // Medya ana anahtarı meta tablosundadır (tumZarflariDonustur yalnızca veri tablolarını gezer).
    const medyaZarfi = vt.metaOku(MEDYA_ANAHTARI_META);
    if (medyaZarfi) vt.metaYaz(MEDYA_ANAHTARI_META, zarfSifrele(yeniAnahtar, zarfCoz(eskiAnahtar, medyaZarfi)));
    vt.metaYaz('kasa_kdf', JSON.stringify({ alg: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, tuz: b64(tuz) }));
    vt.metaYaz('kasa_dogrulayici', zarfSifrele(yeniAnahtar, DOGRULAYICI_METNI));
    return donusen;
  });
  eskiAnahtar.fill(0);
  anahtariYerlestir(vt, yeniAnahtar);
  return { ...kasaDurumu(vt), yenidenSifrelenen: sayi };
}

// ---------------------------------------------------------------------------------------
// Şifreli sütunlar (SIFRELI_ALANLAR): düz metin kalıntılarının şifrelenmesi
// ---------------------------------------------------------------------------------------

/** degisiklik_gecmisi.varlik_turu → tablo adı (gecmisTuru veya doğrudan tablo adı). */
const GECMIS_TURU_TABLOSU = new Map(TABLOLAR.flatMap((t) => (t.gecmisTuru ? [[t.gecmisTuru, t.ad], [t.ad, t.ad]] : [[t.ad, t.ad]])));

/** @param {string} varlikTuru @returns {string | undefined} */
export function gecmisTuruTablosu(varlikTuru) {
  return GECMIS_TURU_TABLOSU.get(varlikTuru);
}

/**
 * Satırdaki SIFRELI_ALANLAR sütunlarında düz metin kalmışsa verilen anahtarla şifreler.
 * Zarf, null ve '' olduğu gibi kalır. Değişiklik yoksa AYNI nesne döner.
 * @param {string} tablo @param {Record<string, unknown>} satir @param {Buffer} anahtar
 * @returns {Record<string, unknown>}
 */
export function satirSifreliAlanlariniTamamla(tablo, satir, anahtar) {
  /** @type {Record<string, unknown> | null} */
  let yeni = null;
  for (const sutun of Object.keys(SIFRELI_ALANLAR[tablo] ?? {})) {
    const deger = satir[sutun];
    if (deger === null || deger === undefined || deger === '' || zarfMi(deger)) continue;
    yeni ??= { ...satir };
    yeni[sutun] = zarfSifrele(anahtar, String(deger));
  }
  return yeni ?? satir;
}

/**
 * Bir geçmiş kaydının onceki_json/sonraki_json anlık görüntüsündeki şifreli sütunları tamamlar.
 * @param {string} varlikTuru @param {unknown} anlikMetni @param {Buffer} anahtar
 * @returns {unknown} değişiklik yoksa aynı değer
 */
export function gecmisAnligiSifrele(varlikTuru, anlikMetni, anahtar) {
  const tablo = gecmisTuruTablosu(varlikTuru);
  if (!tablo || !SIFRELI_ALANLAR[tablo] || typeof anlikMetni !== 'string') return anlikMetni;
  let anlik;
  try {
    anlik = JSON.parse(anlikMetni);
  } catch {
    return anlikMetni;
  }
  if (typeof anlik !== 'object' || anlik === null || Array.isArray(anlik)) return anlikMetni;
  const yeni = satirSifreliAlanlariniTamamla(tablo, anlik, anahtar);
  return yeni === anlik ? anlikMetni : JSON.stringify(yeni);
}

/**
 * Kasa açıldığında (oluştur/aç/içe aktarma) çağrılır: SIFRELI_ALANLAR sütunlarında ve bunların
 * değişiklik geçmişi anlık görüntülerinde kalan DÜZ METİN değerleri tek işlemde şifreler
 * (v1'den gelen veri, eski yedekten yüklenen veri). Yeni yazmalar zaten kasa gerektirdiği
 * için normalde bir şey bulmaz. Tamamlanınca meta.sifreli_alan_gocu = 'tamam'.
 * Değişiklik yoksa diske yazmaz.
 * @param {Veritabani} vt
 * @returns {number} şifrelenen değer sayısı
 */
export function sifreliAlanlariTamamla(vt) {
  const anahtar = acikAnahtar(vt);
  /** @type {Array<{ tablo: string; anahtarSutun: string; id: unknown; degerler: Record<string, unknown> }>} */
  const guncellemeler = [];
  let sayi = 0;
  for (const [tablo, alanlar] of Object.entries(SIFRELI_ALANLAR)) {
    const bilgi = TABLOLAR.find((t) => t.ad === tablo);
    if (!bilgi) continue;
    // Eski şema sürümündeki (henüz göç uygulanmamış) veritabanında tablo/sütun olmayabilir.
    const mevcutSutunlar = new Set(vt.tumu(`PRAGMA table_info(${tablo})`).map((s) => String(s.name)));
    const sutunlar = Object.keys(alanlar).filter((s) => mevcutSutunlar.has(s));
    if (!sutunlar.length) continue;
    for (const satir of vt.tumu(`SELECT ${bilgi.birincilAnahtar}, ${sutunlar.join(', ')} FROM ${tablo}`)) {
      const yeni = satirSifreliAlanlariniTamamla(tablo, satir, anahtar);
      if (yeni === satir) continue;
      /** @type {Record<string, unknown>} */
      const degerler = {};
      for (const s of sutunlar) if (yeni[s] !== satir[s]) { degerler[s] = yeni[s]; sayi++; }
      guncellemeler.push({ tablo, anahtarSutun: bilgi.birincilAnahtar, id: satir[bilgi.birincilAnahtar], degerler });
    }
  }
  for (const satir of vt.tumu('SELECT id, varlik_turu, onceki_json, sonraki_json FROM degisiklik_gecmisi')) {
    const tur = String(satir.varlik_turu);
    const onceki = gecmisAnligiSifrele(tur, satir.onceki_json, anahtar);
    const sonraki = gecmisAnligiSifrele(tur, satir.sonraki_json, anahtar);
    if (onceki === satir.onceki_json && sonraki === satir.sonraki_json) continue;
    sayi++;
    guncellemeler.push({ tablo: 'degisiklik_gecmisi', anahtarSutun: 'id', id: satir.id, degerler: { onceki_json: onceki, sonraki_json: sonraki } });
  }
  if (!guncellemeler.length && vt.metaOku('sifreli_alan_gocu') === 'tamam') return 0;
  vt.islem(() => {
    for (const g of guncellemeler) {
      const sutunlar = Object.keys(g.degerler);
      vt.calistir(
        `UPDATE ${g.tablo} SET ${sutunlar.map((s) => `${s} = ?`).join(', ')} WHERE ${g.anahtarSutun} = ?`,
        [...sutunlar.map((s) => g.degerler[s]), g.id]
      );
    }
    vt.metaYaz('sifreli_alan_gocu', 'tamam');
  });
  return sayi;
}

// ---------------------------------------------------------------------------------------
// Medya ana anahtarı (şifreli ekran görüntüsü/video/iz deposu — bkz. medya.mjs)
// ---------------------------------------------------------------------------------------
// Medya dosyaları, kasa anahtarıyla DOĞRUDAN değil, rastgele üretilen bir "medya ana anahtarı"ndan
// dosya başına HKDF ile türetilen anahtarlarla şifrelenir. Ana anahtar meta tablosunda kasa zarfı
// olarak (kasa anahtarıyla sarılı) durur. Böylece kasa parolası değişince onlarca GB video yeniden
// şifrelenmez; yalnızca bu zarf yeniden sarılır (parolaDegistir, kasayiAnahtarlaAc).

export const MEDYA_ANAHTARI_META = 'medya_anahtari';

/**
 * Sarılı medya ana anahtarını verilen kasa anahtarıyla açar.
 * @param {string} zarf @param {Buffer} kasaAnahtari @returns {Buffer}
 */
export function medyaAnahtariniAc(zarf, kasaAnahtari) {
  const anahtar = Buffer.from(zarfCoz(kasaAnahtari, zarf), 'base64url');
  if (anahtar.length !== ANAHTAR_UZUNLUGU) throw new KasaHatasi('ZARF_BOZUK', 'Medya anahtarı biçimi bozuk.');
  return anahtar;
}

/** Yeni rastgele medya ana anahtarı ve onun kasa zarfı. @param {Buffer} kasaAnahtari */
export function yeniMedyaAnahtari(kasaAnahtari) {
  const anahtar = randomBytes(ANAHTAR_UZUNLUGU);
  return { anahtar, zarf: zarfSifrele(kasaAnahtari, anahtar.toString('base64url')) };
}

/**
 * Kasa AÇIK olmalı: medya ana anahtarını döner; yoksa üretip meta'ya (sarılı) yazar.
 * @param {Veritabani} vt @returns {Buffer}
 */
export function medyaAnahtariniHazirla(vt) {
  const kasaAnahtari = acikAnahtar(vt);
  const zarf = vt.metaOku(MEDYA_ANAHTARI_META);
  if (zarf) return medyaAnahtariniAc(zarf, kasaAnahtari);
  const yeni = yeniMedyaAnahtari(kasaAnahtari);
  vt.islem(() => vt.metaYaz(MEDYA_ANAHTARI_META, yeni.zarf));
  return yeni.anahtar;
}

/** Kasa açılışlarında: hata kasanın açılmasını engellemez (medya yalnızca uyarıyla etkilenir). @param {Veritabani} vt */
function medyaAnahtariniHazirlaSessiz(vt) {
  try {
    medyaAnahtariniHazirla(vt).fill(0);
  } catch {
    console.error('[kasa] Medya anahtarı bu kasa anahtarıyla açılamadı; şifreli medya dosyaları okunamayabilir.');
  }
}

/**
 * Kasa anahtarı değişirken medya zarfını yeni anahtarla yeniden sarar. Zarf zaten yeni anahtarla
 * açılıyorsa (ör. aynı kasanın yedeği) dokunulmaz; eski anahtar yoksa/uymuyorsa zarf korunur.
 * @param {Veritabani} vt @param {Buffer | null} eskiAnahtar @param {Buffer} yeniAnahtar
 */
function medyaAnahtariniYenidenSar(vt, eskiAnahtar, yeniAnahtar) {
  const zarf = vt.metaOku(MEDYA_ANAHTARI_META);
  if (!zarf) return;
  try {
    zarfCoz(yeniAnahtar, zarf);
    return;
  } catch { /* yeni anahtarla açılmıyor: eskisiyle dene */ }
  if (!eskiAnahtar) return;
  try {
    const duz = zarfCoz(eskiAnahtar, zarf);
    vt.islem(() => vt.metaYaz(MEDYA_ANAHTARI_META, zarfSifrele(yeniAnahtar, duz)));
  } catch {
    console.error('[kasa] Medya anahtarı yeniden sarılamadı; mevcut şifreli medya dosyaları okunamayabilir.');
  }
}

/**
 * Nesne ağacında adı "adlar" içinde olan anahtarların DOLU metin değerlerini dönüştürür (ör. hassas alanları şifrelemek için).
 * @param {unknown} deger @param {ReadonlySet<string>} adlar @param {(metin: string) => string} donustur
 * @returns {unknown}
 */
export function adliAlanlariDonustur(deger, adlar, donustur) {
  if (Array.isArray(deger)) return deger.map((d) => adliAlanlariDonustur(d, adlar, donustur));
  if (typeof deger === 'object' && deger !== null) {
    /** @type {Record<string, unknown>} */
    const yeni = {};
    for (const [k, v] of Object.entries(deger)) {
      yeni[k] = adlar.has(k) && typeof v === 'string' && v !== '' ? donustur(v) : adliAlanlariDonustur(v, adlar, donustur);
    }
    return yeni;
  }
  return deger;
}

/**
 * Nesne ağacındaki tüm kasa zarflarını (metin değerleri) çözer. Kasa açık olmalıdır.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {unknown} deger @returns {unknown}
 */
export function zarflariCoz(vt, deger) {
  if (Array.isArray(deger)) return deger.map((d) => zarflariCoz(vt, d));
  if (typeof deger === 'object' && deger !== null) {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, zarflariCoz(vt, v)]));
  }
  return zarfMi(deger) ? coz(vt, deger) : deger;
}
