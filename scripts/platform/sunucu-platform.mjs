// Test sunucusunun (scripts/test-sunucu.mjs) /platform/* uç noktaları: platform veritabanı
// durumu, kasa (oluştur/aç/kilitle/parola değiştir) ve yedek (dışa aktar, otomatik yedek,
// içe aktarma: ÖNİZLEME → SEÇİM → UYGULAMA — bkz. ice-aktarma.mjs).
//
// İçe aktarma uç noktaları:
//   POST /platform/yedek/ice-aktar              ham .tayedek gövdesi + X-Kasa-Parola → { isId } (202)
//                                               (gövde belleğe alınmaz: geçici dosyaya akıtılır, en fazla 20 GB)
//   GET  /platform/yedek/ice-aktar/<id>         ilerleme; hazır olunca önizleme (yeni/degisen/yalnizBurada)
//   POST /platform/yedek/ice-aktar/<id>/uygula  { token, tumu: true } veya { token, secimler: { tablo: [id] } }
//   POST /platform/yedek/ice-aktar/<id>/iptal   { token }
// Ayarlar (proje/ortam/profil CRUD) uç noktaları — hepsi kasa AÇIK olmayı gerektirir
// (kilitliyse 423 KASA_KILITLI, kasa yoksa 409 KASA_YOK):
//   GET  /platform/projeler | ortamlar | giris-profilleri | baglam-profilleri |
//        test-verisi-turleri | test-verisi-profilleri   (?projeId=...)
//   GET  /platform/gecmis?varlikTuru=&varlikId=           (yapan + makine adları eşlemesi)
//   GET  /platform/yedek/otomatik-liste
//   GET  /platform/yedek/tahmin                    dışa aktarma seçenekleri için tahmini medya boyutları
// Dışa aktarma (arka plan işi; büyük yedek belleğe alınmaz, geçici dosyaya akışla yazılır):
//   POST /platform/yedek/disa-aktar              { token, parola, ekranGoruntuleriDahil?, videolarDahil?, izDosyalariDahil? } → { isId } (202)
//   GET  /platform/yedek/disa-aktar/<id>         ilerleme (aşama, yüzde, medya baytı)
//   GET  /platform/yedek/disa-aktar/<id>/indir?token=   hazır yedeği indirir (indirme bitince geçici dosya silinir)
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
// Koşu sonuçları (şema v5; Playwright raporlayıcısı: scripts/platform/raporlayici.mjs):
//   GET  /platform/sonuclar/ozet?projeId=&urun=       ürün listesi, kartlar, trend, koşu geçmişi
//   GET  /platform/sonuclar/kosu?id=                  koşu detayı (senaryo bazında sonuçlar)
//   GET  /platform/sonuclar/sonuc?id=                 test detayı (hata, adımlar, medya listesi)
//   GET  /platform/sonuclar/kaliplar?projeId=&urun=&baslangic=&bitis=   hata kalıpları
//   GET  /platform/medya/<id>[?indir=1]               şifreli medyayı ÇÖZEREK akıtır (Range destekli;
//        kasa açık + oturum token'ı gerekir; düz metin diske YAZILMAZ). indir=1 → Content-Disposition.
//   POST /platform/sonuc/durum|medya-anahtari|kosu|kaydet|bitir — YALNIZCA raporlayıcı için: oturum
//        token'ı ya da raporlayıcı token'ı (scripts/.test-sunucu-token) kabul edilir; kasa GEREKMEZ
//        (sonuç metinleri düz, medya dosyaları raporlayıcı sürecinde şifrelenmiş olarak gelir).
// Senaryolar (genel; kimlik = senaryo UUID'si; kasa açık olmalı — bkz. senaryolar/senaryo-servisi.mjs):
//   GET  /platform/senaryolar?projeId=&ortamId=        liste (son sonuç, bağlam profili, beklenen sonuç) + ekranlar
//   GET  /platform/senaryo?id=&ortamId=                 ayrıntı (verinin hassas alanları çözülmüş — düzenleme formu)
//   GET  /platform/senaryo/form?projeId=&ekranId=&ortamId=   model + alt modeller + profil seçenekleri (maskeli)
//   GET  /platform/senaryo/gecmis?id=                   değişiklik geçmişi (değişen alan ADLARI; değer yok)
//   POST /platform/senaryo/kaydet | kosuya-dahil | sil | kopyala
//   POST /platform/senaryolar/calistir { projeId, ortamId, senaryoId, kosuId, kosuTuru?, kosuKimligi?, kosuKapsami? }
//        → sunucu UUID'yi güncel test dosyası + başlığına çözer ve mevcut koşu altyapısıyla çalıştırır
//          (koşucu test-sunucu.mjs tarafından platformKosucusunuAyarla ile verilir); koşu bitince yanıt döner.
//   POST /platform/senaryo/dene { projeId, ekranId, ortamId, veri, kosuId, id? } → taslak, geçici ek veriyle denenir.
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

import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  KasaHatasi, MEDYA_ANAHTARI_META, MIN_PAROLA_UZUNLUGU, ParolaDenemeSiniri, acikAnahtar, kasaAc, kasaAcikMi, kasaDurumu, kasaKilitle,
  kasaOlustur, medyaAnahtariniAc, medyaAnahtariniHazirla, parolaDegistir, parolayiDogrula, zarfMi
} from './kasa.mjs';
import {
  hataKaliplari, kosuDetayi, kosuKaydet, kosudakiSonucuBul, kosuyuBitir, medyaGetir, sonucDetayi, sonucKaydet, sonucOzeti
} from './veritabani/sonuc-deposu.mjs';
import { MedyaHatasi, medyaBoyutu, medyaCoz, medyaDosyaAdiGecerliMi, medyaDosyasiniSil, medyaKlasoru, medyaSaklamaTemizligi } from './medya.mjs';
import { allureSonuclariniAktar } from './aktarim/allure-sonuclari.mjs';
import {
  YEDEK_UZANTISI, YedekHatasi, medyaSeciminiCoz, otomatikYedekAl, varsayilanYedekKlasoru, yedekBoyutTahmini, yedekDosyasiYaz
} from './yedek.mjs';
import { IceAktarmaYoneticisi, MASKE } from './ice-aktarma.mjs';
import { AktarimHatasi, aktarilmisProjeyiBul, aktarimiOnizle, aktarimiUygula, ortamKimligiBul } from './aktarim/motor.mjs';
import { AKTARIM_ADAPTORLERI, adaptorBul } from '../../projeler/index.mjs';
import {
  SenaryoCakismaHatasi, SenaryoDogrulamaHatasi, formBaglami, kosuyaDahilAyarla, senaryoDetayi, senaryoGecmisi, senaryoKaydet,
  senaryoKopyala, senaryoListesi, senaryolariSil
} from './senaryolar/senaryo-servisi.mjs';
import { senaryoCalistir, senaryoDene } from './senaryolar/calistirma.mjs';

export const JSON_GOVDE_SINIRI = 64 * 1024;
/** Raporlayıcının sonuç gövdesi (hata mesajları + adımlar) için daha geniş sınır. */
export const SONUC_GOVDE_SINIRI = 4 * 1024 * 1024;
/** İçe aktarılacak yedeğin üst sınırı (videolu yedekler büyük olabilir; gövde diske akıtılır). */
export const YEDEK_YUKLEME_SINIRI = 20 * 1024 * 1024 * 1024;
const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** PLATFORM_VERITABANI veya <proje kökü>/veri/platform.db */
const veritabaniYolu = () => veritabaniYoluCoz(PROJE_KOKU);
/** Şifreli medya klasörü: veritabanının yanındaki medya/ (varsayılan veri/medya/). */
const medyaKlasoruYolu = () => medyaKlasoru(veritabaniYolu());

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

/** @type {import('./senaryolar/calistirma.d.mts').Kosucu | null} */
let kosucu = null;
/**
 * Test sunucusu, senaryo çalıştırma altyapısını (Playwright süreci, dosya sırası, canlı görüntü,
 * durdurma) buradan platform uçlarına verir. Verilmezse /platform/senaryolar/calistir ve
 * /platform/senaryo/dene "çalıştırıcı etkin değil" hatası döner.
 * @param {import('./senaryolar/calistirma.d.mts').Kosucu | null} yeni
 */
export function platformKosucusunuAyarla(yeni) {
  kosucu = yeni;
}
/** @param {string} dosya @param {string} ad */
const kosuyorMu = (dosya, ad) => Boolean(kosucu?.kosuyorMu?.(dosya, ad));

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
// Koşu sonuçları ve şifreli medya
// ---------------------------------------------------------------------------------------
const MEDYA_AYAR_ANAHTARI = 'medya';
export const VIDEO_SAKLAMA_VARSAYILAN_GUN = 30;

/**
 * Video saklama süresi (gün): Ayarlar > Güvenlik'te kaydedilen değer (kasa açıkken okunur),
 * yoksa .env VIDEO_SAKLAMA_GUN, yoksa 30.
 * @param {import('./veritabani/baglanti.mjs').Veritabani | null} db
 */
export function videoSaklamaGunu(db) {
  if (db && kasaAcikMi(db)) {
    try {
      const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, MEDYA_AYAR_ANAHTARI));
      const gun = Number(ayar?.videoSaklamaGun);
      if (Number.isInteger(gun) && gun >= 1 && gun <= 3650) return gun;
    } catch { /* varsayılana düşülür */ }
  }
  const ortam = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(ortam) && ortam > 0 ? ortam : VIDEO_SAKLAMA_VARSAYILAN_GUN;
}

/**
 * Sonuçlar veritabanına mı yazılıyor? (Veritabanı + kasa var ve bir adaptörün projesi aktarılmış.)
 * Test sunucusu buna göre: kasa kilitliyse koşu başlatmaz, sonucu JSON dosyası yerine veritabanından okur.
 */
export async function platformSonucKaydiEtkinMi() {
  const db = await platformVeritabani();
  if (!db || !kasaDurumu(db).olusturuldu) return false;
  return AKTARIM_ADAPTORLERI.some((a) => Boolean(aktarilmisProjeyiBul(db, a.ad)));
}

/** Kasa açık mı (sunucunun veritabanında)? */
export async function platformKasaAcikMi() {
  const db = await platformVeritabani();
  return Boolean(db && kasaAcikMi(db));
}

/**
 * Canlı panel için: koşudaki senaryonun sonucu (durum, hata, son ekran görüntüsü + video medya kimliği).
 * @param {string} kosuId @param {string} senaryoAnahtari
 */
export async function platformKosuSonucu(kosuId, senaryoAnahtari) {
  const db = await platformVeritabani();
  if (!db) return null;
  const bulunan = kosudakiSonucuBul(db, kosuId, { senaryoAnahtari });
  if (!bulunan) return null;
  const d = bulunan.detay;
  return {
    durum: d.hamDurum ?? d.durum, platformDurumu: d.durum, sureMs: d.sureMs, hataMesaji: d.hataMesaji,
    basarisizAdim: bulunan.basarisizAdim, ekranGoruntusuId: bulunan.sonEkranGoruntusuId, videoId: bulunan.videoId, sonucId: d.id
  };
}

/**
 * Süreç kapandı ama koşu hâlâ "çalışıyor" görünüyorsa (ör. zorla kapatıldı, raporlayıcı onEnd'e
 * ulaşamadı) koşuyu verilen durumla kapatır.
 * @param {string} kosuId @param {'tamamlandi' | 'durduruldu' | 'zaman_asimi' | 'hata'} durum
 */
export async function platformKosusunuKapat(kosuId, durum) {
  const db = await platformVeritabani();
  if (!db) return;
  const k = db.tek('SELECT durum FROM kosular WHERE id = ?', [kosuId]);
  if (k && k.durum === 'calisiyor') kosuyuBitir(db, kosuId, { durum });
}

/** Günlük (ve açılışta) medya saklama temizliği: eski videolar + sahipsiz şifreli dosyalar. */
export function platformMedyaTemizligiZamanla() {
  const calistir = async () => {
    try {
      const db = await platformVeritabani();
      if (!db) return;
      const gun = videoSaklamaGunu(db);
      const sonuc = medyaSaklamaTemizligi(db, medyaKlasoruYolu(), { videoGun: gun });
      if (sonuc.silinenVideo || sonuc.silinenSahipsiz) {
        console.log(`[platform] Medya temizliği: ${gun} günden eski ${sonuc.silinenVideo} video, ${sonuc.silinenSahipsiz} sahipsiz şifreli dosya silindi.`);
      }
    } catch (hata) {
      console.error(`[platform] Medya temizliği yapılamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
    }
  };
  setTimeout(calistir, 5_000).unref();
  setInterval(calistir, 24 * 60 * 60 * 1000).unref();
}

/**
 * Adaptörün eski koşu sonucu klasörlerini (varsa) içe aktarır; kasa AÇIK olmalı. Tekrarlanabilir.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} db
 * @param {import('../../projeler/index.d.mts').AktarimAdaptoru} adaptor
 * @param {string} projeId
 * @param {string} [projeKoku]
 */
export async function eskiSonuclariAktar(db, adaptor, projeId, projeKoku = PROJE_KOKU) {
  const kaynaklar = adaptor.sonucKaynaklari ? adaptor.sonucKaynaklari(projeKoku) : [];
  const toplam = { kosu: 0, sonuc: 0, medya: 0, zatenVar: 0, eksikEk: 0 };
  if (!kaynaklar.length) return toplam;
  const anahtar = medyaAnahtariniHazirla(db);
  try {
    for (const k of kaynaklar) {
      const s = await allureSonuclariniAktar(db, {
        projeId, ortamAnahtari: k.ortam, ortamId: ortamKimligiBul(db, projeId, k.ortam) ?? null, klasor: k.klasor,
        medyaAnahtari: anahtar, medyaKlasoru: medyaKlasoruYolu()
      });
      for (const a of /** @type {Array<keyof typeof toplam>} */ (Object.keys(toplam))) toplam[a] += s[a];
    }
  } finally {
    anahtar.fill(0);
  }
  return toplam;
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
  medyaKlasoru: medyaKlasoruYolu,
  denemeSiniri
});
setInterval(() => { iceAktarma.temizle(); disaAktarmaTemizle(); }, 5 * 60 * 1000).unref();

/** Yüklenen yedeklerin geçici klasörü (veritabanının yanında; dosyalar zaten şifreli). */
const yuklemeKlasoru = () => join(dirname(veritabaniYolu()), '.gecici-yukleme');
/** Bir günden eski (çöken bir yüklemeden kalan) geçici yükleme dosyalarını siler. */
function eskiYuklemeleriTemizle() {
  const klasor = yuklemeKlasoru();
  if (!existsSync(klasor)) return;
  for (const ad of readdirSync(klasor)) {
    if (!/^yukleme-[a-f0-9]{16}\.tayedek$/.test(ad)) continue;
    try {
      if (Date.now() - statSync(join(klasor, ad)).mtimeMs > 24 * 60 * 60 * 1000) unlinkSync(join(klasor, ad));
    } catch { /* yok sayılır */ }
  }
}

// ---------------------------------------------------------------------------------------
// Dışa aktarma işleri (arka planda geçici dosyaya yazılır, sonra indirilir)
// ---------------------------------------------------------------------------------------
const DISA_AKTARMA_SAKLAMA_MS = 60 * 60 * 1000;
/**
 * @typedef {{
 *   id: string; durum: 'hazirlaniyor' | 'hazir' | 'hata'; asama: string; yuzde: number;
 *   bayt: { islenen: number; toplam: number } | null; mesaj: string | null; dosya: string; dosyaAdi: string;
 *   boyut: number | null; medya: import('./yedek.mjs').YedekMedyaOzeti | null; sonKullanma: number;
 * }} DisaAktarmaIsi
 */
/** @type {Map<string, DisaAktarmaIsi>} */
const disaAktarmaIsleri = new Map();

/** Süresi dolan (indirilmemiş) dışa aktarma dosyalarını siler. @param {boolean} [hepsi] */
function disaAktarmaTemizle(hepsi = false) {
  for (const [id, is] of disaAktarmaIsleri) {
    if (is.durum === 'hazirlaniyor' && !hepsi) continue;
    if (!hepsi && is.sonKullanma > Date.now()) continue;
    try { unlinkSync(is.dosya); } catch { /* zaten yok */ }
    disaAktarmaIsleri.delete(id);
  }
}

/** @param {DisaAktarmaIsi} is */
const disaAktarmaGorunumu = (is) => ({
  id: is.id, durum: is.durum, asama: is.asama, yuzde: is.yuzde, bayt: is.bayt, mesaj: is.mesaj,
  dosyaAdi: is.dosyaAdi, boyut: is.boyut, medya: is.medya
});

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
  if (hata instanceof SenaryoDogrulamaHatasi) {
    return { durum: 400, govde: { basarili: false, kod: 'DOGRULAMA', mesaj: hata.message, hatalar: hata.hatalar, uyarilar: hata.uyarilar } };
  }
  if (hata instanceof SenaryoCakismaHatasi) return { durum: 409, govde: { basarili: false, kod: 'CAKISMA', mesaj: hata.message } };
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

/**
 * İstek gövdesini (belleğe almadan) dosyaya akıtır. Sınır aşılırsa dosya silinir.
 * @param {import('node:http').IncomingMessage} req @param {string} yol @param {number} sinir
 * @returns {Promise<number>} yazılan bayt
 */
function govdeyiDosyayaYaz(req, yol, sinir) {
  return new Promise((coz, reddet) => {
    const uzunluk = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(uzunluk) && uzunluk > sinir) {
      req.resume();
      reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
      return;
    }
    mkdirSync(dirname(yol), { recursive: true });
    const cikis = createWriteStream(yol, { flags: 'wx', mode: 0o600 });
    let toplam = 0;
    let bitti = false;
    /** @param {Error} hata */
    const basarisiz = (hata) => {
      if (bitti) return;
      bitti = true;
      req.unpipe(cikis);
      cikis.destroy();
      try { unlinkSync(yol); } catch { /* zaten yok */ }
      req.resume();
      reddet(hata);
    };
    req.on('data', (/** @type {Buffer} */ parca) => {
      toplam += parca.length;
      if (toplam > sinir) basarisiz(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
    });
    req.on('error', basarisiz);
    req.on('aborted', () => basarisiz(new Error('Yükleme yarıda kesildi.')));
    cikis.on('error', basarisiz);
    cikis.on('finish', () => { if (!bitti) { bitti = true; coz(toplam); } });
    req.pipe(cikis);
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
/** Sonuçlar ekranında ürün seçimi: ekran kimliği ya da ekransız ürün için "ad:<ürün adı>". @param {unknown} d */
function urunSecimi(d) {
  if (d === undefined || d === null || d === '') return null;
  if (typeof d === 'string' && d.startsWith('ad:') && d.length <= 203) return d;
  return kimlikAl(d, 'urun');
}
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

/** Projenin aktarım adaptörü (proje ayarlarından; yoksa null — genel davranış). @param {Veritabani} db @param {string} projeId */
function projeAdaptoru(db, projeId) {
  const proje = projeGetir(db, projeId);
  const aktarim = /** @type {Record<string, unknown> | undefined} */ (proje?.ayarlar?.aktarim);
  return typeof aktarim?.adaptor === 'string' ? adaptorBul(aktarim.adaptor) ?? null : null;
}
/** Ortam seçimi: verilen kimlik (projede olmalı) ya da projenin varsayılan ortamı. @param {Veritabani} db @param {string} projeId @param {unknown} d */
function ortamSec(db, projeId, d) {
  const ortamlar = ortamlariListele(db, projeId);
  if (d !== undefined && d !== null && d !== '') {
    const id = kimlikAl(d, 'ortamId');
    if (!ortamlar.some((o) => o.id === id)) throw new DepoHatasi('Ortam bulunamadı.');
    return id;
  }
  const o = ortamlar.find((x) => x.varsayilan) ?? ortamlar[0];
  if (!o) throw new DepoHatasi('Projede ortam yok.');
  return o.id;
}

/** @type {Map<string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>>} */
const GET_UCLARI = new Map([
  ['/platform/senaryolar', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    const ortamId = ortamSec(db, projeId, q.get('ortamId'));
    return { ortamId, ...senaryoListesi(db, projeId, ortamId, projeAdaptoru(db, projeId)) };
  }],
  ['/platform/senaryo', (db, q) => {
    const id = kimlikAl(q.get('id'));
    const ortamId = q.get('ortamId') ? kimlikAl(q.get('ortamId'), 'ortamId') : null;
    return { senaryo: senaryoDetayi(db, id, ortamId) };
  }],
  ['/platform/senaryo/form', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    return formBaglami(db, projeId, kimlikAl(q.get('ekranId'), 'ekranId'), ortamSec(db, projeId, q.get('ortamId')), projeAdaptoru(db, projeId));
  }],
  ['/platform/senaryo/gecmis', (db, q) => ({
    kayitlar: senaryoGecmisi(db, kimlikAl(q.get('id'))),
    makineler: Object.fromEntries(makineleriListele(db).map((m) => [m.id, m.ad]))
  })],
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
  ['/platform/guvenlik', (db) => ({
    otomatikKilitDakika, enAz: OTOMATIK_KILIT_EN_AZ_DK, enCok: OTOMATIK_KILIT_EN_COK_DK, varsayilan: OTOMATIK_KILIT_VARSAYILAN_DK,
    videoSaklamaGun: videoSaklamaGunu(db), videoSaklamaVarsayilan: VIDEO_SAKLAMA_VARSAYILAN_GUN
  })],
  ['/platform/sonuclar/ozet', (db, q) => sonucOzeti(db, kimlikAl(q.get('projeId'), 'projeId'), { urun: urunSecimi(q.get('urun')) })],
  ['/platform/sonuclar/kosu', (db, q) => {
    const d = kosuDetayi(db, kimlikAl(q.get('id')));
    if (!d) throw new DepoHatasi('Koşu bulunamadı.');
    return d;
  }],
  ['/platform/sonuclar/sonuc', (db, q) => {
    const d = sonucDetayi(db, kimlikAl(q.get('id')));
    if (!d) throw new DepoHatasi('Sonuç bulunamadı.');
    return { sonuc: d };
  }],
  ['/platform/sonuclar/kaliplar', (db, q) => hataKaliplari(db, kimlikAl(q.get('projeId'), 'projeId'), {
    urun: urunSecimi(q.get('urun')), baslangic: q.get('baslangic') || null, bitis: q.get('bitis') || null
  })],
  ['/platform/yedek/tahmin', (db) => yedekBoyutTahmini(db)],
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
  ['/platform/senaryo/kaydet', (db, g) => {
    const projeId = kimlikAl(g.projeId, 'projeId');
    const sonuc = senaryoKaydet(db, {
      id: secimliKimlik(g.id) ?? null, projeId, ekranId: secimliKimlik(g.ekranId) ?? null, baslik: g.baslik,
      ...(g.veri !== undefined ? { veri: g.veri } : {}), ortamIdleri: g.ortamIdleri, kosuyaDahil: g.kosuyaDahil, mutlakaGorunmeli: g.mutlakaGorunmeli
    }, { adaptor: projeAdaptoru(db, projeId), kosuyorMu });
    return { id: sonuc.id, uyarilar: sonuc.uyarilar };
  }],
  ['/platform/senaryo/kosuya-dahil', (db, g) => kosuyaDahilAyarla(db, kimlikAl(g.projeId, 'projeId'), g.idler, g.dahil === true)],
  ['/platform/senaryo/sil', (db, g) => senaryolariSil(db, kimlikAl(g.projeId, 'projeId'), g.idler, { kosuyorMu })],
  ['/platform/senaryo/kopyala', (db, g) => senaryoKopyala(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.id))],
  ['/platform/guvenlik/kaydet', (db, g) => {
    /** @type {Record<string, unknown>} */
    const yanit = {};
    if (g.otomatikKilitDakika !== undefined) {
      const dk = Number(g.otomatikKilitDakika);
      if (!Number.isInteger(dk) || dk < OTOMATIK_KILIT_EN_AZ_DK || dk > OTOMATIK_KILIT_EN_COK_DK) {
        throw new DepoHatasi(`Otomatik kilit süresi ${OTOMATIK_KILIT_EN_AZ_DK}–${OTOMATIK_KILIT_EN_COK_DK} dakika arasında bir tam sayı olmalıdır.`);
      }
      const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, GUVENLIK_AYAR_ANAHTARI));
      ayarYaz(db, GUVENLIK_AYAR_ANAHTARI, { ...(mevcut ?? {}), otomatikKilitDakika: dk });
      otomatikKilitDakika = dk;
      yanit.otomatikKilitDakika = dk;
    }
    if (g.videoSaklamaGun !== undefined) {
      const gun = Number(g.videoSaklamaGun);
      if (!Number.isInteger(gun) || gun < 1 || gun > 3650) throw new DepoHatasi('Video saklama süresi 1–3650 gün arasında bir tam sayı olmalıdır.');
      const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, MEDYA_AYAR_ANAHTARI));
      ayarYaz(db, MEDYA_AYAR_ANAHTARI, { ...(mevcut ?? {}), videoSaklamaGun: gun });
      yanit.videoSaklamaGun = gun;
    }
    return yanit;
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
 * @param {{ token: string; raporlayiciTokeni?: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 *   raporlayiciTokeni: YALNIZCA /platform/sonuc/* (raporlayıcı yazma) uçlarında oturum token'ına ek olarak kabul edilir.
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

    // --- GET /platform/yedek/disa-aktar/<id>[/indir] — dışa aktarma ilerlemesi / indirme ------
    const disaEslesme = /^\/platform\/yedek\/disa-aktar\/([a-f0-9]{16})(\/indir)?$/.exec(yol);
    if (req.method === 'GET' && disaEslesme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      disaAktarmaTemizle();
      const is = disaAktarmaIsleri.get(disaEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, kod: 'BULUNAMADI', mesaj: 'Dışa aktarma bulunamadı (süresi dolmuş veya indirilmiş olabilir).' }); return true; }
      if (!disaEslesme[2]) {
        res.setHeader('Cache-Control', 'no-store');
        jsonGonder(res, 200, { basarili: is.durum !== 'hata', is: disaAktarmaGorunumu(is) });
        return true;
      }
      if (is.durum !== 'hazir' || !existsSync(is.dosya)) { jsonGonder(res, 409, { basarili: false, mesaj: 'Yedek henüz hazır değil.' }); return true; }
      const boyut = statSync(is.dosya).size;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': boyut,
        'Content-Disposition': `attachment; filename="${is.dosyaAdi}"`,
        'Cache-Control': 'no-store'
      });
      const akis = createReadStream(is.dosya);
      akis.pipe(res);
      res.on('finish', () => {
        // Tamamı gönderildi: geçici dosya silinir (yarıda kalırsa süre dolana kadar tekrar indirilebilir).
        try { unlinkSync(is.dosya); } catch { /* zaten yok */ }
        disaAktarmaIsleri.delete(is.id);
        console.log(`[platform] Yedek indirildi (${boyut} bayt).`);
      });
      res.on('close', () => akis.destroy());
      return true;
    }

    // --- GET /platform/aktarim/durum (kasa kilitliyken de çalışır; gizli bilgi yok) -----------
    if (req.method === 'GET' && yol === '/platform/aktarim/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      jsonGonder(res, 200, { basarili: true, aktarimSuruyor, ...(await aktarimDurumu(await platformVeritabani())) });
      return true;
    }

    // --- GET /platform/medya/<id> — şifreli medyayı çözerek akıtır (kasa açık olmalı) ---------
    const medyaEslesme = /^\/platform\/medya\/([A-Za-z0-9_-]{1,100})$/.exec(yol);
    if (req.method === 'GET' && medyaEslesme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      await medyaSun(req, res, medyaEslesme[1], url.searchParams.get('indir') === '1', jsonGonder);
      return true;
    }

    // --- POST /platform/sonuc/* — Playwright raporlayıcısının yazma uçları -------------------
    const sonucEslesme = /^\/platform\/sonuc\/(durum|medya-anahtari|kosu|kaydet|bitir)$/.exec(yol);
    if (req.method === 'POST' && sonucEslesme) {
      await raporlayiciIsteginiIsle(req, res, sonucEslesme[1], baglam);
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
      eskiYuklemeleriTemizle();
      const dosya = join(yuklemeKlasoru(), `yukleme-${randomBytes(8).toString('hex')}.tayedek`);
      let boyut = 0;
      try {
        boyut = await govdeyiDosyayaYaz(req, dosya, YEDEK_YUKLEME_SINIRI);
      } catch (hata) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
        res.setHeader('Connection', 'close');
        jsonGonder(res, cokBuyuk ? 413 : 400, {
          basarili: false,
          mesaj: cokBuyuk ? `Yedek dosyası en fazla ${YEDEK_YUKLEME_SINIRI / 1024 / 1024 / 1024} GB olabilir.` : 'Dosya okunamadı.'
        });
        return true;
      }
      if (!boyut) {
        try { unlinkSync(dosya); } catch { /* zaten yok */ }
        jsonGonder(res, 400, { basarili: false, mesaj: 'Boş dosya gönderildi.' });
        return true;
      }
      const isId = iceAktarma.baslat(dosya, parola, { geciciDosya: true });
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
          const uygulanan = aktarimiUygula(db, paket);
          // Eski (Allure dönemi) koşu sonuçları + png/webm ekleri: tek seferlik, tekrarlanabilir
          // (var olan sonuç atlanır). Kaynak klasörlere dokunulmaz; medya şifrelenerek kopyalanır.
          let sonucAktarimi = null;
          try {
            sonucAktarimi = await eskiSonuclariAktar(db, adaptor, uygulanan.projeId);
          } catch (hata) {
            uygulanan.uyarilar.push(`Eski koşu sonuçları aktarılamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
          }
          return { ...uygulanan, sonucAktarimi };
        });
        const s = sonuc.sayimlar;
        const toplam = (/** @type {'yeni' | 'guncellenecek' | 'ayni'} */ k) => Object.values(s).reduce((t, x) => t + x[k], 0);
        console.log(`[platform] Proje dosyaları aktarıldı (${adaptor.ad}): yeni ${toplam('yeni')}, güncellenen ${toplam('guncellenecek')}, aynı (atlanan) ${toplam('ayni')}, kaldırılan ${sonuc.kaldirilanlar.length}.`);
        if (sonuc.sonucAktarimi) {
          const sa = sonuc.sonucAktarimi;
          console.log(`[platform] Eski koşu sonuçları: ${sa.kosu} koşu, ${sa.sonuc} sonuç, ${sa.medya} şifreli medya aktarıldı (zaten var: ${sa.zatenVar}).`);
        }
        jsonGonder(res, 200, {
          basarili: true,
          sonuc: {
            projeId: sonuc.projeId, sayimlar: sonuc.sayimlar, uyarilar: sonuc.uyarilar,
            atlanan: { ayni: sonuc.atlananlar.ayni.length, silinmis: sonuc.atlananlar.silinmis, ortamYok: sonuc.atlananlar.ortamYok },
            kaldirilanlar: sonuc.kaldirilanlar, kaynaktaYok: sonuc.kaynaktaYok, sonucAktarimi: sonuc.sonucAktarimi
          }
        });
        return true;
      }
      case '/platform/senaryolar/calistir': {
        // Koşu bitene kadar yanıt bekletilir (satır "çalışıyor" görünür); durdurma /durdur, canlı görüntü /canli ile.
        const db = await acikVeritabani();
        const sonuc = await senaryoCalistir(db, govde, kosucu);
        jsonGonder(res, sonuc.httpDurum, sonuc.govde);
        return true;
      }
      case '/platform/senaryo/dene': {
        const db = await acikVeritabani();
        const sonuc = await senaryoDene(db, govde, kosucu, projeAdaptoru(db, kimlikAl(govde.projeId, 'projeId')));
        jsonGonder(res, sonuc.httpDurum, sonuc.govde);
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
        const secim = medyaSeciminiCoz({
          ekranGoruntuleriDahil: /** @type {boolean | undefined} */ (govde.ekranGoruntuleriDahil),
          videolarDahil: /** @type {boolean | undefined} */ (govde.videolarDahil),
          izDosyalariDahil: /** @type {boolean | undefined} */ (govde.izDosyalariDahil)
        });
        disaAktarmaTemizle();
        // Önceki bir sunucu oturumundan kalan (indirilmemiş) geçici yedekler.
        const disaKlasor = join(varsayilanYedekKlasoru(db), '.disa-aktarma');
        if (existsSync(disaKlasor)) {
          const bilinen = new Set([...disaAktarmaIsleri.values()].map((i) => i.dosya));
          for (const ad of readdirSync(disaKlasor)) {
            const tam = join(disaKlasor, ad);
            try {
              if (!bilinen.has(tam) && Date.now() - statSync(tam).mtimeMs > DISA_AKTARMA_SAKLAMA_MS) unlinkSync(tam);
            } catch { /* yok sayılır */ }
          }
        }
        if ([...disaAktarmaIsleri.values()].some((i) => i.durum === 'hazirlaniyor')) {
          throw new YedekHatasi('MESGUL', 'Başka bir dışa aktarma sürüyor; bitmesini bekleyin.');
        }
        const anahtar = await denemeSiniri.dene(async () => {
          const a = await parolayiDogrula(db, metin(govde.parola));
          if (!a) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
          return a;
        });
        anahtar.fill(0);
        const makineAdi = hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'makine';
        const id = randomBytes(8).toString('hex');
        /** @type {DisaAktarmaIsi} */
        const is = {
          id, durum: 'hazirlaniyor', asama: 'başlıyor', yuzde: 0, bayt: null, mesaj: null,
          dosya: join(varsayilanYedekKlasoru(db), '.disa-aktarma', `${id}${YEDEK_UZANTISI}`),
          dosyaAdi: `platform-yedek-${makineAdi}-${dosyaZamani(new Date())}${YEDEK_UZANTISI}`,
          boyut: null, medya: null, sonKullanma: Date.now() + DISA_AKTARMA_SAKLAMA_MS
        };
        disaAktarmaIsleri.set(id, is);
        yedekDosyasiYaz(db, is.dosya, {
          ...secim, medyaKlasoru: medyaKlasoruYolu(),
          ilerleme: (asama, yuzde, bayt) => { is.asama = asama; is.yuzde = yuzde; if (bayt) is.bayt = bayt; }
        }).then((sonuc) => {
          is.durum = 'hazir';
          is.asama = 'hazır';
          is.yuzde = 100;
          is.boyut = sonuc.boyut;
          is.medya = sonuc.manifest.medya ?? null;
          is.sonKullanma = Date.now() + DISA_AKTARMA_SAKLAMA_MS;
          console.log(`[platform] Yedek hazırlandı (${sonuc.boyut} bayt, ${is.medya?.dosyaSayisi ?? 0} medya dosyası).`);
        }).catch((/** @type {unknown} */ hata) => {
          is.durum = 'hata';
          is.mesaj = hata instanceof YedekHatasi || hata instanceof KasaHatasi
            ? hata.message : `Yedek alınamadı: ${/** @type {Error} */ (hata)?.message ?? String(hata)}`;
          console.error(`[platform] Dışa aktarma başarısız: ${is.mesaj}`);
        });
        jsonGonder(res, 202, { basarili: true, isId: id, secim });
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

// ---------------------------------------------------------------------------------------
// Medya sunma ve raporlayıcı uçları
// ---------------------------------------------------------------------------------------

const MEDYA_UZANTILARI = Object.freeze({
  'image/png': 'png', 'image/jpeg': 'jpg', 'video/webm': 'webm', 'video/mp4': 'mp4', 'application/zip': 'zip',
  'text/markdown': 'md', 'text/plain': 'txt', 'application/json': 'json'
});
const MEDYA_TUR_ETIKETLERI = Object.freeze({ ekran_goruntusu: 'ekran-goruntusu', video: 'video', iz: 'iz', diger: 'ek' });
const TR_ASCII = Object.freeze({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' });

/**
 * İndirme adı: "<senaryo> - <yyyy-aa-gg_ss-dd> - <tür>.<uzantı>" (yerel saat; dosya sistemi güvenli).
 * @param {NonNullable<ReturnType<typeof medyaGetir>>} m
 */
export function medyaIndirmeAdi(m) {
  const t = new Date(m.sonucZamani ?? m.olusturulma);
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const tarih = Number.isNaN(t.getTime()) ? 'tarihsiz'
    : `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}_${iki(t.getHours())}-${iki(t.getMinutes())}`;
  const uzanti = /** @type {Record<string, string>} */ (MEDYA_UZANTILARI)[m.icerikTuru.toLowerCase()]
    ?? (m.tur === 'iz' ? 'zip' : 'bin');
  const temel = `${m.senaryoBaslik ?? 'medya'} - ${tarih} - ${/** @type {Record<string, string>} */ (MEDYA_TUR_ETIKETLERI)[m.tur] ?? 'ek'}`
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150);
  return `${temel}.${uzanti}`;
}

/** @param {string} ad */
function asciiAd(ad) {
  return ad.replace(/[çÇğĞıİöÖşŞüÜ]/g, (k) => /** @type {Record<string, string>} */ (TR_ASCII)[k] ?? '_').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

/** "bytes=a-b" → { baslangic, bitis } | undefined (başlık yok) | null (karşılanamaz). @param {string | undefined} baslik @param {number} boyut */
function aralikCoz(baslik, boyut) {
  if (!baslik) return undefined;
  const e = /^bytes=(\d*)-(\d*)$/.exec(baslik.trim());
  if (!e || (e[1] === '' && e[2] === '')) return null;
  let baslangic;
  let bitis;
  if (e[1] === '') {
    const son = Number(e[2]);
    if (son === 0) return null;
    baslangic = Math.max(0, boyut - son);
    bitis = boyut - 1;
  } else {
    baslangic = Number(e[1]);
    bitis = e[2] === '' ? boyut - 1 : Math.min(Number(e[2]), boyut - 1);
  }
  if (!Number.isFinite(baslangic) || !Number.isFinite(bitis) || baslangic > bitis || baslangic >= boyut) return null;
  return { baslangic, bitis };
}

/**
 * GET /platform/medya/<id>: kasa açık olmalı (değilse 423). Dosya çözülerek parça parça akıtılır;
 * Range (206) desteklenir. Düz metin diske yazılmaz, önbelleğe alınmaz.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {string} id @param {boolean} indir
 * @param {(res: import('node:http').ServerResponse, durum: number, govde: unknown) => void} jsonGonder
 */
async function medyaSun(req, res, id, indir, jsonGonder) {
  const db = await acikVeritabani();
  const m = medyaGetir(db, id);
  if (!m) { jsonGonder(res, 404, { basarili: false, mesaj: 'Medya bulunamadı.' }); return; }
  if (m.silinme) { jsonGonder(res, 410, { basarili: false, mesaj: 'Bu video saklama süresi dolduğu için silindi.' }); return; }
  const klasor = medyaKlasoruYolu();
  const yol = medyaDosyaAdiGecerliMi(m.dosya) ? join(klasor, m.dosya) : null;
  if (!yol || !existsSync(yol)) {
    jsonGonder(res, 404, {
      basarili: false,
      kod: m.yedekDisi ? 'YEDEGE_DAHIL_DEGIL' : 'DOSYA_YOK',
      mesaj: m.yedekDisi
        ? 'Bu medya yedeğe dahil edilmemişti (dışa aktarırken bu medya türü seçilmemiş).'
        : 'Medya dosyası bu bilgisayarda yok (başka bir makinede kaydedilmiş olabilir).'
    });
    return;
  }
  let boyut;
  try {
    ({ duzBoyut: boyut } = await medyaBoyutu(yol));
  } catch {
    jsonGonder(res, 500, { basarili: false, mesaj: 'Medya dosyası okunamadı (bozuk).' });
    return;
  }
  const aralik = aralikCoz(typeof req.headers.range === 'string' ? req.headers.range : undefined, boyut);
  if (aralik === null) {
    res.writeHead(416, { 'Content-Range': `bytes */${boyut}`, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ basarili: false, mesaj: 'İstenen bayt aralığı karşılanamıyor.' }));
    return;
  }
  const ad = medyaIndirmeAdi(m);
  /** @type {Record<string, string | number>} */
  const basliklar = {
    'Content-Type': m.icerikTuru || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'Content-Disposition': `${indir ? 'attachment' : 'inline'}; filename="${asciiAd(ad)}"; filename*=UTF-8''${encodeURIComponent(ad)}`,
    'Content-Length': aralik ? aralik.bitis - aralik.baslangic + 1 : boyut,
    ...(aralik ? { 'Content-Range': `bytes ${aralik.baslangic}-${aralik.bitis}/${boyut}` } : {})
  };
  const anahtar = medyaAnahtariniHazirla(db);
  let kapandi = false;
  res.on('close', () => { kapandi = true; });
  try {
    res.writeHead(aralik ? 206 : 200, basliklar);
    if (req.method === 'HEAD' || boyut === 0) { res.end(); return; }
    for await (const parca of medyaCoz(anahtar, yol, aralik ?? {})) {
      if (kapandi) break;
      if (!res.write(parca)) await new Promise((coz) => { res.once('drain', coz); res.once('close', coz); });
    }
    res.end();
  } catch (hata) {
    console.error(`[platform] Medya akıtılamadı: ${hata instanceof MedyaHatasi ? hata.message : /** @type {Error} */ (hata)?.message}`);
    res.destroy();
  } finally {
    anahtar.fill(0);
  }
}

/**
 * Raporlayıcı uçları. Oturum token'ı ya da raporlayıcı token'ı gerekir; kasa GEREKMEZ.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} islem
 * @param {{ token: string; raporlayiciTokeni?: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 */
async function raporlayiciIsteginiIsle(req, res, islem, baglam) {
  const { jsonGonder } = baglam;
  let govde;
  try {
    const metin = (await ikiliGovdeOku(req, SONUC_GOVDE_SINIRI)).toString('utf8');
    govde = /** @type {Record<string, unknown>} */ (metin ? JSON.parse(metin) : {});
    if (typeof govde !== 'object' || govde === null || Array.isArray(govde)) throw new Error('nesne değil');
  } catch {
    jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
    return;
  }
  const baslikToken = req.headers['x-test-sunucu-token'];
  const token = typeof govde.token === 'string' ? govde.token : typeof baslikToken === 'string' ? baslikToken : '';
  const gecerli = [baglam.token, baglam.raporlayiciTokeni].some((t) => typeof t === 'string' && t.length > 0 && t === token);
  if (!gecerli) { jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' }); return; }
  const db = await platformVeritabani();
  if (!db) {
    jsonGonder(res, 200, islem === 'durum' ? { basarili: true, etkin: false, veritabaniYolu: veritabaniYolu() } : { basarili: false, mesaj: 'Platform veritabanı yok.' });
    return;
  }
  switch (islem) {
    case 'durum': {
      const projeId = typeof govde.projeId === 'string' && govde.projeId ? govde.projeId : null;
      const proje = projeId
        ? (db.tek('SELECT id FROM projeler WHERE id = ?', [projeId]) ? { id: projeId } : undefined)
        : typeof govde.adaptor === 'string' ? aktarilmisProjeyiBul(db, govde.adaptor) : undefined;
      const etkin = Boolean(proje) && kasaDurumu(db).olusturuldu;
      jsonGonder(res, 200, {
        basarili: true, etkin, veritabaniYolu: veritabaniYolu(), medyaKlasoru: medyaKlasoruYolu(),
        projeId: proje?.id ?? null,
        ortamId: proje && typeof govde.ortam === 'string' ? ortamKimligiBul(db, proje.id, govde.ortam) ?? null : null,
        medyaZarfi: db.metaOku(MEDYA_ANAHTARI_META) ?? null
      });
      return;
    }
    case 'medya-anahtari': {
      const mevcut = db.metaOku(MEDYA_ANAHTARI_META);
      if (mevcut) { jsonGonder(res, 200, { basarili: true, zarf: mevcut }); return; }
      if (!zarfMi(govde.zarf)) { jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz medya anahtarı zarfı.' }); return; }
      if (kasaAcikMi(db)) {
        try {
          medyaAnahtariniAc(govde.zarf, acikAnahtar(db)).fill(0);
        } catch {
          jsonGonder(res, 400, { basarili: false, mesaj: 'Medya anahtarı bu kasanın anahtarıyla açılmıyor.' });
          return;
        }
      }
      const zarf = govde.zarf;
      db.islem(() => db.metaYaz(MEDYA_ANAHTARI_META, zarf));
      jsonGonder(res, 200, { basarili: true, zarf });
      return;
    }
    case 'kosu':
      kosuKaydet(db, /** @type {Parameters<typeof kosuKaydet>[1]} */ (govde.kosu));
      jsonGonder(res, 200, { basarili: true });
      return;
    case 'kaydet': {
      const { id, silinecekMedyaDosyalari } = sonucKaydet(db, /** @type {Parameters<typeof sonucKaydet>[1]} */ (govde.sonuc));
      for (const d of silinecekMedyaDosyalari) medyaDosyasiniSil(medyaKlasoruYolu(), d);
      jsonGonder(res, 200, { basarili: true, id });
      return;
    }
    case 'bitir':
      kosuyuBitir(db, kimlikAl(govde.kosuId, 'kosuId'), { durum: metinAl(govde.durum), bitis: typeof govde.bitis === 'string' ? govde.bitis : undefined });
      jsonGonder(res, 200, { basarili: true });
      return;
    default:
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen uç nokta.' });
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
