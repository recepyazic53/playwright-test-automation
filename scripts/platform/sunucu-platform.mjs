// Test sunucusunun (scripts/test-sunucu.mjs) /platform/* uç noktaları: platform veritabanı
// durumu, kasa (oluştur/aç/kilitle/parola değiştir) ve yedek (dışa aktar, otomatik yedek,
// içe aktarma: ÖNİZLEME → SEÇİM → UYGULAMA — bkz. ice-aktarma.mjs).
//
// İçe aktarma uç noktaları:
//   POST /platform/yedek/ice-aktar              ham .tayedek gövdesi + X-Kasa-Parola → { isId } (202)
//   GET  /platform/yedek/ice-aktar/<id>         ilerleme; hazır olunca önizleme (yeni/degisen/yalnizBurada)
//   POST /platform/yedek/ice-aktar/<id>/uygula  { token, tumu: true } veya { token, secimler: { tablo: [id] } }
//   POST /platform/yedek/ice-aktar/<id>/iptal   { token }
// Ayarlar (proje/ortam/profil CRUD) uç noktaları — hepsi kasa AÇIK olmayı gerektirir
// (kilitliyse 423 KASA_KILITLI, kasa yoksa 409 KASA_YOK):
//   GET  /platform/projeler | ortamlar | giris-profilleri | baglam-profilleri |
//        test-verisi-turleri | test-verisi-profilleri   (?projeId=...)
//   GET  /platform/gecmis?varlikTuru=&varlikId=           (yapan + makine adları eşlemesi)
//   GET  /platform/yedek/otomatik-liste
//   POST /platform/<varlik>/kaydet | /sil                 (varlik: proje, ortam, giris-profili,
//        baglam-profili, test-verisi-turu, test-verisi-profili)
//   POST /platform/giris-profili/goster, /platform/test-verisi-profili/goster
//        — AÇIK göster: tek bir gizli değeri düz metin döner (yalnızca kullanıcı isteyince).
// Mevcut proje dosyalarını aktarma (genel motor: aktarim/motor.mjs; projeye özgü adaptörler:
// projeler/index.mjs):
//   GET  /platform/aktarim/durum     eski dosyalar var mı, veritabanı boş mu, daha önce aktarıldı mı
//   POST /platform/aktarim/onizle    { adaptor } → varlık başına sayılar (GİZLİ DEĞER YOK)
//   POST /platform/aktarim/uygula    { adaptor, parola? } → kasa yoksa parola ile BU AKIŞTA oluşturulur;
//                                    kasa kilitliyse 423. Tekrar çalıştırmak çift kayıt üretmez
//                                    (kaynak anahtarıyla birleştirir; atlananlar raporlanır).
// Otomatik kilit: kasa, kimliği doğrulanmış API etkinliği olmadan ayarlanan süre (Ayarlar >
// Güvenlik, 5–120 dk, varsayılan 15) geçince kilitlenir. GET /platform/durum etkinlik SAYILMAZ.
//   GET /platform/guvenlik, POST /platform/guvenlik/kaydet { otomatikKilitDakika }
// Gizli değerler (giriş parolası, TOTP anahtarı, hassas test verisi alanları) listelerde ve
// kaydet yanıtlarında ASLA dönmez: { dolu: true|false, maske: '••••••' } döner. Kaydederken
// alan gönderilmezse (veya boşsa) mevcut değer korunur.
//
// Kasa kilitliyken şifreli sütunlar (ortam adresleri, ayarlar...) okunamaz; /platform/durum
// yalnızca gizli olmayan durum bilgisini döner ve kasa kilitliyken de çalışır.
// Kaba kuvvet koruması: art arda yanlış kasa/yedek parolasında artan bekleme (1,2,4...30 sn).
//
// Güvenlik: test-sunucu.mjs'deki yerel istek (loopback + Host) ve origin kontrolleri bu
// fonksiyon çağrılmadan ÖNCE yapılır. Burada ayrıca her istek aynı token'ı taşımak zorundadır
// (JSON gövdesinde "token", ya da X-Test-Sunucu-Token başlığı / ?token= sorgu parametresi).
// Parolalar yalnızca istek GÖVDESİNDE (JSON) veya ice-aktar için X-Kasa-Parola başlığında
// (encodeURIComponent ile) gelir; URL'de parola kabul edilmez. Parola/anahtar ASLA loglanmaz,
// yanıtlarda dönmez.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniYolu as veritabaniYoluCoz } from './veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU } from './veritabani/gocler.mjs';
import {
  DepoHatasi, ayarGetir, ayarYaz, baglamProfiliKaydet, baglamProfiliSil, baglamProfilleriniListele, degisiklikGecmisiListele,
  girisProfiliGetir, girisProfiliKaydet, girisProfiliSil, girisProfilleriniListele, makineleriListele, ortamGetir,
  ortamKaydet, ortamSil, ortamlariListele, platformDurumOzeti, projeGetir, projeKaydet, projeleriListele,
  testVerisiProfiliGetir, testVerisiProfiliKaydet, testVerisiProfiliSil, testVerisiProfilleriniListele,
  testVerisiTuruKaydet, testVerisiTuruSil, testVerisiTurleriniListele, veritabaniniHazirla, yerelMakine
} from './veritabani/depo.mjs';
import {
  KasaHatasi, MIN_PAROLA_UZUNLUGU, ParolaDenemeSiniri, acikAnahtar, kasaAc, kasaAcikMi, kasaDurumu, kasaKilitle, kasaOlustur,
  parolaDegistir, parolayiDogrula
} from './kasa.mjs';
import { YEDEK_UZANTISI, YedekHatasi, otomatikYedekAl, varsayilanYedekKlasoru, yedekOlustur } from './yedek.mjs';
import { IceAktarmaYoneticisi, MASKE } from './ice-aktarma.mjs';
import { AktarimHatasi, aktarilmisProjeyiBul, aktarimiOnizle, aktarimiUygula } from './aktarim/motor.mjs';
import { AKTARIM_ADAPTORLERI, adaptorBul } from '../../projeler/index.mjs';

export const JSON_GOVDE_SINIRI = 64 * 1024;
export const YEDEK_YUKLEME_SINIRI = 500 * 1024 * 1024;
const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** PLATFORM_VERITABANI veya <proje kökü>/veri/platform.db */
const veritabaniYolu = () => veritabaniYoluCoz(PROJE_KOKU);

/** @type {import('./veritabani/baglanti.mjs').Veritabani | null} */
let vt = null;
/** @type {Promise<import('./veritabani/baglanti.mjs').Veritabani> | null} */
let vtSozu = null;

/**
 * Platform veritabanını (tek örnek) döner. Dosya yoksa ve olustur=false ise null döner
 * (durum sorgusu boş bir veritabanı dosyası YARATMAZ).
 * @param {{ olustur?: boolean }} [secenekler]
 */
async function platformVeritabani(secenekler = {}) {
  if (vt) return vt;
  if (!secenekler.olustur && !existsSync(veritabaniYolu())) return null;
  vtSozu ??= veritabaniniHazirla(veritabaniYolu()).then((acilan) => (vt = acilan)).finally(() => { vtSozu = null; });
  return vtSozu;
}

// ---------------------------------------------------------------------------------------
// Otomatik kilit (hareketsizlik)
// ---------------------------------------------------------------------------------------
export const OTOMATIK_KILIT_VARSAYILAN_DK = 15;
export const OTOMATIK_KILIT_EN_AZ_DK = 5;
export const OTOMATIK_KILIT_EN_COK_DK = 120;
const GUVENLIK_AYAR_ANAHTARI = 'guvenlik';
/** Dakikanın milisaniye karşılığı — YALNIZCA doğrulama/test için PLATFORM_OTOMATIK_KILIT_DAKIKA_MS ile kısaltılabilir. */
const DAKIKA_MS = Number(process.env.PLATFORM_OTOMATIK_KILIT_DAKIKA_MS) > 0 ? Number(process.env.PLATFORM_OTOMATIK_KILIT_DAKIKA_MS) : 60_000;
let otomatikKilitDakika = OTOMATIK_KILIT_VARSAYILAN_DK;
let sonEtkinlik = Date.now();
/** Son otomatik kilitlenme zamanı (arayüz kilit ekranında açıklama gösterir). */
let otomatikKilitZamani = /** @type {string | null} */ (null);

/** Kimliği doğrulanmış API etkinliği: hareketsizlik sayacını sıfırlar (test-sunucu da çağırır). */
export function platformEtkinligiBildir() {
  sonEtkinlik = Date.now();
}

/** Kasa açıldığında kayıtlı süreyi yükler. @param {import('./veritabani/baglanti.mjs').Veritabani} db */
function guvenlikAyariniYukle(db) {
  try {
    const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, GUVENLIK_AYAR_ANAHTARI));
    const dk = Number(ayar?.otomatikKilitDakika);
    otomatikKilitDakika = Number.isInteger(dk) && dk >= OTOMATIK_KILIT_EN_AZ_DK && dk <= OTOMATIK_KILIT_EN_COK_DK ? dk : OTOMATIK_KILIT_VARSAYILAN_DK;
  } catch {
    otomatikKilitDakika = OTOMATIK_KILIT_VARSAYILAN_DK;
  }
  sonEtkinlik = Date.now();
  otomatikKilitZamani = null;
}

setInterval(() => {
  if (!vt || !kasaAcikMi(vt)) return;
  if (Date.now() - sonEtkinlik < otomatikKilitDakika * DAKIKA_MS) return;
  kasaKilitle(vt);
  otomatikKilitZamani = new Date().toISOString();
  console.log(`[platform] Kasa ${otomatikKilitDakika} dakika işlem yapılmadığı için otomatik kilitlendi.`);
}, Math.min(5_000, DAKIKA_MS)).unref();

/**
 * Dashboard'ın başlattığı test süreçlerine verilecek ortam değişkenleri: kasa AÇIKSA türetilmiş
 * anahtar (base64url) — yalnızca alt sürecin belleğinde durur, hiçbir dosyaya yazılmaz. Kasa
 * kilitliyse boş döner (testler dosyalardan okur; bkz. tests/support/platform-veri.ts).
 * @returns {Record<string, string>}
 */
export function platformTestOrtami() {
  if (!vt || !kasaAcikMi(vt)) return {};
  try {
    return { PLATFORM_KASA_ANAHTARI: acikAnahtar(vt).toString('base64url') };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------------------
// Proje dosyalarını aktarma
// ---------------------------------------------------------------------------------------
let aktarimSuruyor = false;

/** @param {unknown} ad */
function adaptorAl(ad) {
  const adaptor = typeof ad === 'string' && ad ? adaptorBul(ad) : AKTARIM_ADAPTORLERI[0];
  if (!adaptor) throw new AktarimHatasi('Bilinmeyen aktarım adaptörü.');
  return adaptor;
}

/** @template T @param {() => Promise<T>} fn */
async function aktarimKilidi(fn) {
  if (aktarimSuruyor) throw new YedekHatasi('MESGUL', 'Başka bir aktarım sürüyor; bitmesini bekleyin.');
  aktarimSuruyor = true;
  try { return await fn(); } finally { aktarimSuruyor = false; }
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani | null} db */
async function aktarimDurumu(db) {
  const projeSayisi = db ? Number(db.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0) : 0;
  return {
    veritabaniBos: projeSayisi === 0,
    kasaVar: db ? kasaDurumu(db).olusturuldu : false,
    adaptorler: AKTARIM_ADAPTORLERI.map((a) => {
      const algi = a.algila(PROJE_KOKU);
      const proje = db ? aktarilmisProjeyiBul(db, a.ad) : undefined;
      const aktarim = /** @type {Record<string, unknown> | undefined} */ (proje?.ayarlar?.aktarim);
      return {
        ad: a.ad, etiket: a.etiket, projeAdi: a.projeAdi, dosyalarVar: algi.var, ortamlar: algi.ortamlar,
        aktarildi: Boolean(proje), projeId: proje?.id ?? null, sonAktarim: typeof aktarim?.sonAktarim === 'string' ? aktarim.sonAktarim : null
      };
    })
  };
}

/** Test sürecinin dosya listelemesi için ortam: dotenv'i yüklenmiş bu sürecin değişkenleri. */
const paketOlustur = (/** @type {import('../../projeler/index.d.mts').AktarimAdaptoru} */ adaptor) => adaptor.paketOlustur(PROJE_KOKU, { ortamDegiskenleri: process.env });

let esitlemeZamanlayici = /** @type {NodeJS.Timeout | null} */ (null);
/**
 * Eski dashboard düzenleyicileri (senaryo kaydet/güncelle, koşu listesi) hâlâ
 * DOSYALARA yazar. Proje daha önce aktarıldıysa ve kasa açıksa, değişiklikten kısa süre sonra
 * dosyalar veritabanına yeniden aktarılır (birleştirme: yalnızca kaynağı değişen kayıtlar).
 * Kasa kilitliyse yapılmaz; testler o durumda dosyalardan okur (davranış değişmez).
 * @param {string} neden
 */
export function projeDosyalariniEsitle(neden) {
  if (esitlemeZamanlayici) clearTimeout(esitlemeZamanlayici);
  esitlemeZamanlayici = setTimeout(async () => {
    esitlemeZamanlayici = null;
    const db = vt;
    if (!db) return;
    for (const adaptor of AKTARIM_ADAPTORLERI) {
      if (!aktarilmisProjeyiBul(db, adaptor.ad)) continue;
      if (!kasaAcikMi(db)) {
        console.log(`[platform] ${neden}: proje dosyaları değişti ama kasa kilitli; veritabanı güncellenmedi (testler dosyaları kullanır).`);
        continue;
      }
      try {
        await aktarimKilidi(async () => {
          const sonuc = aktarimiUygula(db, await paketOlustur(adaptor));
          const degisen = Object.values(sonuc.sayimlar).reduce((t, x) => t + x.yeni + x.guncellenecek + x.kaldirilacak, 0);
          console.log(`[platform] ${neden}: proje dosyaları veritabanına yeniden aktarıldı (${degisen} kayıt değişti).`);
        });
      } catch (hata) {
        console.error(`[platform] ${neden}: otomatik yeniden aktarım yapılamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
      }
    }
  }, 1500);
  esitlemeZamanlayici.unref();
}

/** Süreç başına tek sayaç: kasa açma, parola değiştirme, dışa aktarma ve yedek parolası. */
const denemeSiniri = new ParolaDenemeSiniri();
const iceAktarma = new IceAktarmaYoneticisi({
  veritabani: (olustur) => platformVeritabani({ olustur }),
  denemeSiniri
});
setInterval(() => iceAktarma.temizle(), 5 * 60 * 1000).unref();

/** Hata → HTTP durum kodu + güvenli (gizli bilgi içermeyen) mesaj. @param {unknown} hata */
function hataYaniti(hata) {
  if (hata instanceof KasaHatasi) {
    const kodlar = { PAROLA_KISA: 400, PAROLA_YANLIS: 403, KASA_KILITLI: 423, KASA_YOK: 409, KASA_VAR: 409, ZARF_BOZUK: 400, COK_DENEME: 429 };
    return {
      durum: kodlar[hata.kod] ?? 400,
      govde: { basarili: false, kod: hata.kod, mesaj: hata.message, ...(hata.bekleSaniye ? { bekleSaniye: hata.bekleSaniye } : {}) }
    };
  }
  if (hata instanceof YedekHatasi) {
    const kodlar = { ONAY_GEREKLI: 409, DEGISTI: 409, MESGUL: 409, BULUNAMADI: 404 };
    return { durum: kodlar[hata.kod] ?? 400, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
  }
  if (hata instanceof DepoHatasi) return { durum: 400, govde: { basarili: false, kod: 'VERI', mesaj: hata.message } };
  if (hata instanceof AktarimHatasi) return { durum: 400, govde: { basarili: false, kod: 'AKTARIM', mesaj: hata.message } };
  return null;
}

/** @param {import('node:http').IncomingMessage} req @param {number} sinir */
function ikiliGovdeOku(req, sinir) {
  return new Promise((coz, reddet) => {
    const uzunluk = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(uzunluk) && uzunluk > sinir) {
      reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
      return;
    }
    /** @type {Buffer[]} */
    const parcalar = [];
    let toplam = 0;
    let bitti = false;
    req.on('data', (/** @type {Buffer} */ parca) => {
      if (bitti) return;
      toplam += parca.length;
      if (toplam > sinir) {
        bitti = true;
        reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
        req.resume();
        return;
      }
      parcalar.push(parca);
    });
    req.on('end', () => { if (!bitti) { bitti = true; coz(Buffer.concat(parcalar)); } });
    req.on('error', (h) => { if (!bitti) { bitti = true; reddet(h); } });
  });
}

/** @param {Date} t */
function dosyaZamani(t) {
  return t.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

// ---------------------------------------------------------------------------------------
// Ayarlar CRUD (kasa açık olmalı). Gizli değerler maskelenir.
// ---------------------------------------------------------------------------------------

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */

/** Kasa açık veritabanı; değilse KasaHatasi (KASA_YOK / KASA_KILITLI). */
async function acikVeritabani() {
  const db = await platformVeritabani();
  if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
  acikAnahtar(db);
  return db;
}

/** @param {boolean} dolu */
const maskeli = (dolu) => ({ dolu, maske: dolu ? MASKE : '' });
/** @param {unknown} d */
const metinAl = (d) => (typeof d === 'string' ? d : '');
/** @param {unknown} d */
const secimliMetin = (d) => (typeof d === 'string' && d !== '' ? d : undefined);
/** @param {unknown} d @param {string} alan */
function kimlikAl(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d */
const secimliKimlik = (d) => (d === undefined || d === null || d === '' ? undefined : kimlikAl(d));
/** Profil ortam kapsamı: alan gönderilmezse undefined (mevcut korunur), '' / null = tüm ortamlar. @param {unknown} d */
const ortamSecimi = (d) => (d === undefined ? undefined : d === null || d === '' ? null : kimlikAl(d, 'ortamId'));

/** @param {import('./veritabani/depo.mjs').GirisProfili} p */
function girisProfiliGorunumu(p) {
  const sms = /** @type {Record<string, unknown>} */ (p.smsAyari ?? {});
  return {
    id: p.id, projeId: p.projeId, ortamId: p.ortamId, ad: p.ad, kullaniciAdi: p.kullaniciAdi, ikiAsamaliTur: p.ikiAsamaliTur,
    parola: maskeli(p.parolaVar), totpGizli: maskeli(p.totpGizliVar),
    // SMS: "sabit" = sabit test kodu (şifreli sütunda, gizli değil), "elle" = koşu sırasında elle girilir.
    sms: { yontem: sms.yontem === 'elle' ? 'elle' : sms.yontem === 'sabit' ? 'sabit' : null, kod: typeof sms.kod === 'string' ? sms.kod : '' },
    guncellenme: p.guncellenme
  };
}

/** @param {import('./veritabani/depo.mjs').TestVerisiProfili} p */
function testVerisiProfiliGorunumu(p) {
  /** @type {Record<string, unknown>} */
  const degerler = {};
  for (const [ad, deger] of Object.entries(p.degerler)) {
    degerler[ad] = p.hassasAlanlar.includes(ad) ? maskeli(p.doluHassasAlanlar.includes(ad)) : deger;
  }
  for (const ad of p.doluHassasAlanlar) if (!(ad in degerler)) degerler[ad] = maskeli(true);
  return { id: p.id, projeId: p.projeId, turId: p.turId, ortamId: p.ortamId, ad: p.ad, degerler, hassasAlanlar: p.hassasAlanlar, guncellenme: p.guncellenme };
}

/** @type {Map<string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>>} */
const GET_UCLARI = new Map([
  ['/platform/projeler', (db) => ({ projeler: projeleriListele(db).map((p) => ({ id: p.id, ad: p.ad, aciklama: p.aciklama })) })],
  // Ortam ayarları (aktarımda eski dosya iskeleti vb.) arayüze gönderilmez.
  ['/platform/ortamlar', (db, q) => ({ ortamlar: ortamlariListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(({ ayarlar: _a, ...o }) => o) })],
  ['/platform/giris-profilleri', (db, q) => ({
    profiller: girisProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(girisProfiliGorunumu)
  })],
  ['/platform/baglam-profilleri', (db, q) => {
    const profiller = baglamProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId'));
    return { profiller, turler: [...new Set(profiller.map((p) => p.tur))].sort((a, b) => a.localeCompare(b, 'tr')) };
  }],
  ['/platform/test-verisi-turleri', (db, q) => ({ turler: testVerisiTurleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')) })],
  ['/platform/test-verisi-profilleri', (db, q) => ({
    profiller: testVerisiProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(testVerisiProfiliGorunumu)
  })],
  ['/platform/gecmis', (db, q) => {
    const kayitlar = degisiklikGecmisiListele(db, metinAl(q.get('varlikTuru')), metinAl(q.get('varlikId')))
      .map((k) => ({ id: k.id, zaman: k.zaman, islem: k.islem, yapan: k.yapan, makineId: k.makineId, aciklama: k.aciklama }));
    // Makine adları şifrelidir; kasa açıkken arayüz "kullanici@<makineId>" değerini ada çevirir.
    return { kayitlar, makineler: Object.fromEntries(makineleriListele(db).map((m) => [m.id, m.ad])) };
  }],
  ['/platform/guvenlik', () => ({
    otomatikKilitDakika, enAz: OTOMATIK_KILIT_EN_AZ_DK, enCok: OTOMATIK_KILIT_EN_COK_DK, varsayilan: OTOMATIK_KILIT_VARSAYILAN_DK
  })],
  ['/platform/yedek/otomatik-liste', (db) => {
    const klasor = varsayilanYedekKlasoru(db);
    const dosyalar = existsSync(klasor)
      ? readdirSync(klasor).filter((ad) => ad.endsWith(YEDEK_UZANTISI)).map((ad) => {
        const s = statSync(join(klasor, ad));
        return { ad, boyut: s.size, zaman: s.mtime.toISOString(), otomatik: ad.startsWith('otomatik-') };
      }).sort((a, b) => b.zaman.localeCompare(a.zaman))
      : [];
    return { klasor, dosyalar };
  }]
]);

/** @type {Map<string, (db: Veritabani, g: Record<string, unknown>) => Record<string, unknown>>} */
const POST_UCLARI = new Map([
  ['/platform/guvenlik/kaydet', (db, g) => {
    const dk = Number(g.otomatikKilitDakika);
    if (!Number.isInteger(dk) || dk < OTOMATIK_KILIT_EN_AZ_DK || dk > OTOMATIK_KILIT_EN_COK_DK) {
      throw new DepoHatasi(`Otomatik kilit süresi ${OTOMATIK_KILIT_EN_AZ_DK}–${OTOMATIK_KILIT_EN_COK_DK} dakika arasında bir tam sayı olmalıdır.`);
    }
    const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, GUVENLIK_AYAR_ANAHTARI));
    ayarYaz(db, GUVENLIK_AYAR_ANAHTARI, { ...(mevcut ?? {}), otomatikKilitDakika: dk });
    otomatikKilitDakika = dk;
    return { otomatikKilitDakika: dk };
  }],
  ['/platform/proje/kaydet', (db, g) => {
    const aciklama = metinAl(g.aciklama).trim();
    const id = projeKaydet(db, { id: secimliKimlik(g.id), ad: metinAl(g.ad), aciklama: aciklama || null });
    return { proje: projeGetir(db, id) };
  }],
  ['/platform/ortam/kaydet', (db, g) => {
    const id = ortamKaydet(db, {
      id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), ad: metinAl(g.ad), tabanUrl: metinAl(g.tabanUrl).trim(),
      varsayilan: g.varsayilan === true
    });
    const { ayarlar: _a, ...ortam } = /** @type {import('./veritabani/depo.mjs').Ortam} */ (ortamGetir(db, id));
    return { ortam };
  }],
  ['/platform/ortam/sil', (db, g) => ({ silindi: ortamSil(db, kimlikAl(g.id)) })],
  ['/platform/giris-profili/kaydet', (db, g) => {
    const id = secimliKimlik(g.id);
    const mevcut = id ? girisProfiliGetir(db, id) : undefined;
    const tur = g.ikiAsamaliTur === 'totp' || g.ikiAsamaliTur === 'sms' ? g.ikiAsamaliTur : 'yok';
    const ortamId = secimliKimlik(g.ortamId) ?? null;
    if (ortamId && !ortamGetir(db, ortamId)) throw new DepoHatasi('Seçilen ortam bulunamadı.');
    /** @type {Record<string, unknown>} */
    let smsAyari = {};
    if (tur === 'sms') {
      const sms = /** @type {Record<string, unknown>} */ (typeof g.sms === 'object' && g.sms !== null ? g.sms : {});
      if (sms.yontem === 'elle') smsAyari = { yontem: 'elle' };
      else {
        const kod = metinAl(sms.kod).trim();
        if (!kod) throw new DepoHatasi('Sabit SMS test kodu boş olamaz (ya da "koşu sırasında elle girilir" seçin).');
        smsAyari = { yontem: 'sabit', kod };
      }
    }
    const kayitId = girisProfiliKaydet(db, {
      id, projeId: kimlikAl(g.projeId, 'projeId'), ortamId, ad: metinAl(g.ad), kullaniciAdi: metinAl(g.kullaniciAdi),
      // Boş/gönderilmemiş = mevcut değeri koru; parolaSil: true = kaldır.
      parola: g.parolaSil === true ? null : secimliMetin(g.parola),
      ikiAsamaliTur: tur,
      totpGizli: tur === 'totp' ? secimliMetin(g.totpGizli) ?? (mevcut?.totpGizliVar ? undefined : null) : null,
      smsAyari
    });
    return { profil: girisProfiliGorunumu(/** @type {import('./veritabani/depo.mjs').GirisProfili} */ (girisProfiliGetir(db, kayitId))) };
  }],
  ['/platform/giris-profili/sil', (db, g) => ({ silindi: girisProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/giris-profili/goster', (db, g) => {
    const p = girisProfiliGetir(db, kimlikAl(g.id), { coz: true });
    if (!p) throw new DepoHatasi('Giriş profili bulunamadı.');
    if (g.alan === 'parola') return { deger: p.parola ?? '' };
    if (g.alan === 'totpGizli') return { deger: p.totpGizli ?? '' };
    throw new DepoHatasi('"alan" yalnızca parola veya totpGizli olabilir.');
  }],
  ['/platform/baglam-profili/kaydet', (db, g) => {
    const alanlar = typeof g.alanlar === 'object' && g.alanlar !== null && !Array.isArray(g.alanlar) ? g.alanlar : {};
    const id = baglamProfiliKaydet(db, {
      id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), tur: metinAl(g.tur), ad: metinAl(g.ad),
      alanlar: /** @type {Record<string, unknown>} */ (alanlar), ortamId: ortamSecimi(g.ortamId)
    });
    return { id };
  }],
  ['/platform/baglam-profili/sil', (db, g) => ({ silindi: baglamProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-turu/kaydet', (db, g) => {
    if (!Array.isArray(g.alanlar)) throw new DepoHatasi('"alanlar" bir dizi olmalıdır.');
    const id = testVerisiTuruKaydet(db, { id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), ad: metinAl(g.ad), alanlar: g.alanlar });
    return { id };
  }],
  ['/platform/test-verisi-turu/sil', (db, g) => ({ silindi: testVerisiTuruSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-profili/kaydet', (db, g) => {
    const degerler = typeof g.degerler === 'object' && g.degerler !== null && !Array.isArray(g.degerler) ? g.degerler : {};
    const id = testVerisiProfiliKaydet(db, {
      id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), turId: kimlikAl(g.turId, 'turId'), ad: metinAl(g.ad),
      degerler: /** @type {Record<string, string | number | boolean | null>} */ (degerler), ortamId: ortamSecimi(g.ortamId)
    });
    return { profil: testVerisiProfiliGorunumu(/** @type {import('./veritabani/depo.mjs').TestVerisiProfili} */ (testVerisiProfiliGetir(db, id))) };
  }],
  ['/platform/test-verisi-profili/sil', (db, g) => ({ silindi: testVerisiProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-profili/goster', (db, g) => {
    const p = testVerisiProfiliGetir(db, kimlikAl(g.id), { coz: true });
    if (!p) throw new DepoHatasi('Test verisi profili bulunamadı.');
    const alan = metinAl(g.alan);
    if (!p.hassasAlanlar.includes(alan)) throw new DepoHatasi('Bu alan hassas bir alan değil.');
    const deger = p.degerler[alan];
    return { deger: deger === null || deger === undefined ? '' : String(deger) };
  }]
]);

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ token: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 * @returns {Promise<boolean>} istek bir /platform uç noktasıyla eşleştiyse true
 */
export async function platformIsteginiIsle(req, res, baglam) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/')) return false;
  const { jsonGonder } = baglam;
  const baslikToken = req.headers['x-test-sunucu-token'];
  const disTokenGecerli = (typeof baslikToken === 'string' && baslikToken === baglam.token) || url.searchParams.get('token') === baglam.token;

  /** @returns {Promise<Record<string, unknown> | null>} */
  const jsonGovde = async () => {
    let metin;
    try {
      metin = (await ikiliGovdeOku(req, JSON_GOVDE_SINIRI)).toString('utf8');
    } catch (hata) {
      const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
      if (cokBuyuk) res.setHeader('Connection', 'close');
      jsonGonder(res, cokBuyuk ? 413 : 400, {
        basarili: false,
        mesaj: cokBuyuk ? `İstek gövdesi en fazla ${JSON_GOVDE_SINIRI / 1024} KB olabilir.` : 'İstek gövdesi okunamadı.'
      });
      return null;
    }
    try {
      const govde = metin ? JSON.parse(metin) : {};
      if (typeof govde !== 'object' || govde === null || Array.isArray(govde)) throw new Error('nesne değil');
      return govde;
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi (JSON nesnesi bekleniyor).' });
      return null;
    }
  };
  const tokenYok = () => jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
  // Kimliği doğrulanmış her istek (durum sorgusu hariç) otomatik kilit sayacını sıfırlar.
  if (disTokenGecerli && yol !== '/platform/durum') platformEtkinligiBildir();

  try {
    // --- GET /platform/durum (kasa kilitliyken de çalışır; YALNIZCA gizli olmayan bilgi) -----
    if (req.method === 'GET' && yol === '/platform/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await platformVeritabani();
      const ozet = db ? platformDurumOzeti(db) : null;
      jsonGonder(res, 200, {
        basarili: true,
        veritabaniVar: Boolean(db),
        veritabaniYolu: veritabaniYolu(),
        semaSurumu: ozet?.semaSurumu ?? 0,
        desteklenenSemaSurumu: GUNCEL_SEMA_SURUMU,
        makineId: ozet?.makineId ?? null,
        kasa: ozet?.kasa ?? { olusturuldu: false, acik: false, minParolaUzunlugu: MIN_PAROLA_UZUNLUGU, kdf: null },
        sifreliAlanGocu: ozet?.sifreliAlanGocu ?? 'tamam',
        sayimlar: ozet?.sayimlar ?? {},
        parolaBeklemeSaniye: Math.ceil(denemeSiniri.kalanMs() / 1000),
        aktifIceAktarma: iceAktarma.aktifIs(),
        otomatikKilit: { dakika: otomatikKilitDakika, sonKilitlenme: otomatikKilitZamani }
      });
      return true;
    }

    // --- GET /platform/yedek/ice-aktar/<id> — ilerleme + (hazırsa) önizleme ------------------
    const isEslesme = /^\/platform\/yedek\/ice-aktar\/([a-f0-9]{16})(?:\/(uygula|iptal))?$/.exec(yol);
    if (req.method === 'GET' && isEslesme && !isEslesme[2]) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const is = iceAktarma.durum(isEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, kod: 'BULUNAMADI', mesaj: 'İçe aktarma bulunamadı (süresi dolmuş veya iptal edilmiş olabilir).' }); return true; }
      jsonGonder(res, 200, { basarili: is.durum !== 'hata', is });
      return true;
    }

    // --- GET /platform/aktarim/durum (kasa kilitliyken de çalışır; gizli bilgi yok) -----------
    if (req.method === 'GET' && yol === '/platform/aktarim/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      jsonGonder(res, 200, { basarili: true, aktarimSuruyor, ...(await aktarimDurumu(await platformVeritabani())) });
      return true;
    }

    // --- GET ayarlar uçları (kasa açık olmalı) -----------------------------------------------
    const getIslemi = req.method === 'GET' ? GET_UCLARI.get(yol) : undefined;
    if (getIslemi) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await acikVeritabani();
      res.setHeader('Cache-Control', 'no-store');
      jsonGonder(res, 200, { basarili: true, ...getIslemi(db, url.searchParams) });
      return true;
    }

    // --- POST /platform/yedek/ice-aktar (ham dosya gövdesi) → önizleme hazırlığı --------------
    if (req.method === 'POST' && yol === '/platform/yedek/ice-aktar') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const hamParola = req.headers['x-kasa-parola'];
      let parola = '';
      try {
        parola = typeof hamParola === 'string' ? decodeURIComponent(hamParola) : '';
      } catch {
        parola = '';
      }
      if (!parola) {
        res.setHeader('Connection', 'close');
        jsonGonder(res, 400, { basarili: false, mesaj: 'Yedeğin kasa parolası X-Kasa-Parola başlığında (encodeURIComponent ile) gönderilmelidir.' });
        return true;
      }
      // Bekleme süresi / meşgul kontrolü dosya okunmadan önce yapılır.
      try {
        denemeSiniri.kontrolEt();
        if (iceAktarma.aktifIs()) throw new YedekHatasi('MESGUL', 'Başka bir içe aktarma sürüyor; bitmesini bekleyin.');
        const mevcutDb = await platformVeritabani();
        if (mevcutDb && kasaDurumu(mevcutDb).olusturuldu && !kasaAcikMi(mevcutDb)) {
          throw new KasaHatasi('KASA_KILITLI', 'İçe aktarma için önce bu makinedeki kasayı açın.');
        }
      } catch (hata) {
        res.setHeader('Connection', 'close');
        throw hata;
      }
      let dosya;
      try {
        dosya = await ikiliGovdeOku(req, YEDEK_YUKLEME_SINIRI);
      } catch (hata) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
        if (cokBuyuk) res.setHeader('Connection', 'close');
        jsonGonder(res, cokBuyuk ? 413 : 400, {
          basarili: false,
          mesaj: cokBuyuk ? `Yedek dosyası en fazla ${YEDEK_YUKLEME_SINIRI / 1024 / 1024} MB olabilir.` : 'Dosya okunamadı.'
        });
        return true;
      }
      if (!dosya.length) { jsonGonder(res, 400, { basarili: false, mesaj: 'Boş dosya gönderildi.' }); return true; }
      const isId = iceAktarma.baslat(dosya, parola);
      parola = '';
      jsonGonder(res, 202, { basarili: true, isId });
      return true;
    }

    if (req.method !== 'POST') {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
      return true;
    }

    const govde = await jsonGovde();
    if (!govde) return true;
    if (govde.token !== baglam.token && !disTokenGecerli) { tokenYok(); return true; }
    platformEtkinligiBildir();
    const metin = (/** @type {unknown} */ d) => (typeof d === 'string' ? d : '');

    if (isEslesme && isEslesme[2] === 'uygula') {
      const secim = govde.tumu === true
        ? { tumu: true }
        : { secimler: /** @type {Record<string, string[]>} */ (govde.secimler) };
      const sonuc = await iceAktarma.uygula(isEslesme[1], secim);
      console.log(`[platform] Yedek içe aktarıldı (${sonuc.tamYukleme ? 'tam yükleme' : 'seçmeli'}), üzerine yazılan sürüm geçmişe: ${sonuc.gecmiseYazilan}.`);
      jsonGonder(res, 200, { basarili: true, sonuc });
      return true;
    }
    if (isEslesme && isEslesme[2] === 'iptal') {
      const iptal = iceAktarma.iptal(isEslesme[1]);
      jsonGonder(res, iptal ? 200 : 409, iptal
        ? { basarili: true, mesaj: 'İçe aktarma iptal edildi; hazırlık alanı silindi.' }
        : { basarili: false, mesaj: 'İçe aktarma bulunamadı veya artık iptal edilemez.' });
      return true;
    }

    const postIslemi = POST_UCLARI.get(yol);
    if (postIslemi) {
      const db = await acikVeritabani();
      res.setHeader('Cache-Control', 'no-store');
      jsonGonder(res, 200, { basarili: true, ...postIslemi(db, govde) });
      return true;
    }

    switch (yol) {
      case '/platform/aktarim/onizle': {
        const adaptor = adaptorAl(govde.adaptor);
        if (!adaptor.algila(PROJE_KOKU).var) throw new AktarimHatasi('Bu projenin aktarılacak dosyaları bulunamadı.');
        const onizleme = await aktarimKilidi(async () => {
          const db = await platformVeritabani();
          if (db && kasaDurumu(db).olusturuldu && !kasaAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Önizleme için önce kasayı açın.');
          return aktarimiOnizle(db, await paketOlustur(adaptor));
        });
        res.setHeader('Cache-Control', 'no-store');
        jsonGonder(res, 200, { basarili: true, onizleme });
        return true;
      }
      case '/platform/aktarim/uygula': {
        const adaptor = adaptorAl(govde.adaptor);
        if (!adaptor.algila(PROJE_KOKU).var) throw new AktarimHatasi('Bu projenin aktarılacak dosyaları bulunamadı.');
        const sonuc = await aktarimKilidi(async () => {
          let db = await platformVeritabani();
          if (!db || !kasaDurumu(db).olusturuldu) {
            // Kasa yoksa AYNI akışta verilen parolayla oluşturulur (tekrar alanı istemci tarafında da denetlenir).
            const parola = metin(govde.parola);
            if (govde.parolaTekrar !== undefined && metin(govde.parolaTekrar) !== parola) {
              throw new KasaHatasi('PAROLA_KISA', 'Kasa parolaları aynı değil.');
            }
            db = /** @type {import('./veritabani/baglanti.mjs').Veritabani} */ (await platformVeritabani({ olustur: true }));
            await kasaOlustur(db, parola);
            guvenlikAyariniYukle(db);
            console.log('[platform] Kasa oluşturuldu (proje dosyası aktarımı).');
          } else if (!kasaAcikMi(db)) {
            throw new KasaHatasi('KASA_KILITLI', 'Aktarım için önce kasayı açın.');
          }
          const paket = await paketOlustur(adaptor);
          return aktarimiUygula(db, paket);
        });
        const s = sonuc.sayimlar;
        const toplam = (/** @type {'yeni' | 'guncellenecek' | 'ayni'} */ k) => Object.values(s).reduce((t, x) => t + x[k], 0);
        console.log(`[platform] Proje dosyaları aktarıldı (${adaptor.ad}): yeni ${toplam('yeni')}, güncellenen ${toplam('guncellenecek')}, aynı (atlanan) ${toplam('ayni')}, kaldırılan ${sonuc.kaldirilanlar.length}.`);
        jsonGonder(res, 200, {
          basarili: true,
          sonuc: {
            projeId: sonuc.projeId, sayimlar: sonuc.sayimlar, uyarilar: sonuc.uyarilar,
            atlanan: { ayni: sonuc.atlananlar.ayni.length, silinmis: sonuc.atlananlar.silinmis, ortamYok: sonuc.atlananlar.ortamYok },
            kaldirilanlar: sonuc.kaldirilanlar, kaynaktaYok: sonuc.kaynaktaYok
          }
        });
        return true;
      }
      case '/platform/kasa/olustur': {
        const db = /** @type {import('./veritabani/baglanti.mjs').Veritabani} */ (await platformVeritabani({ olustur: true }));
        const kasa = await kasaOlustur(db, metin(govde.parola));
        guvenlikAyariniYukle(db);
        console.log('[platform] Kasa oluşturuldu.');
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/ac': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => kasaAc(db, metin(govde.parola)));
        yerelMakine(db);
        guvenlikAyariniYukle(db);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/kilitle': {
        const db = await platformVeritabani();
        jsonGonder(res, 200, { basarili: true, kasa: db ? kasaKilitle(db) : { olusturuldu: false, acik: false } });
        return true;
      }
      case '/platform/kasa/parola-degistir': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => parolaDegistir(db, metin(govde.eskiParola), metin(govde.yeniParola)));
        console.log(`[platform] Kasa parolası değiştirildi (${kasa.yenidenSifrelenen} değer yeniden şifrelendi).`);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/yedek/disa-aktar': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        if (!kasaAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
        const anahtar = await denemeSiniri.dene(async () => {
          const a = await parolayiDogrula(db, metin(govde.parola));
          if (!a) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
          return a;
        });
        anahtar.fill(0);
        const { veri, manifest } = yedekOlustur(db);
        const makineAdi = hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'makine';
        const dosyaAdi = `platform-yedek-${makineAdi}-${dosyaZamani(new Date())}${YEDEK_UZANTISI}`;
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': veri.length,
          'Content-Disposition': `attachment; filename="${dosyaAdi}"`,
          'Cache-Control': 'no-store',
          'X-Yedek-Sayimlari': encodeURIComponent(JSON.stringify(manifest.sayimlar))
        });
        res.end(veri);
        console.log(`[platform] Yedek dışa aktarıldı (${veri.length} bayt).`);
        return true;
      }
      case '/platform/yedek/otomatik': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const sonuc = otomatikYedekAl(db);
        console.log(`[platform] Otomatik yedek alındı: ${sonuc.dosya}`);
        jsonGonder(res, 200, { basarili: true, dosya: sonuc.dosya, boyut: sonuc.boyut, silinenler: sonuc.silinenler });
        return true;
      }
      default:
        jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
        return true;
    }
  } catch (hata) {
    const yanit = hataYaniti(hata);
    if (!yanit) throw hata;
    if (!res.headersSent) jsonGonder(res, yanit.durum, yanit.govde);
    return true;
  }
}

/** Sunucu açıkken ve kasa açıkken günde bir yerel otomatik yedek alır. */
export function platformOtomatikYedekZamanla() {
  const zamanlayici = setInterval(() => {
    if (!vt || !kasaAcikMi(vt)) return;
    try {
      const sonuc = otomatikYedekAl(vt);
      console.log(`[platform] Günlük otomatik yedek alındı: ${sonuc.dosya}`);
    } catch (hata) {
      console.error(`[platform] Günlük otomatik yedek alınamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
    }
  }, 24 * 60 * 60 * 1000);
  zamanlayici.unref();
}
