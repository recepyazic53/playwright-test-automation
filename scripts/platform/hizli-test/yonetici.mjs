// HIZLI TEST SİHİRBAZI — sunucu tarafı (genel; ürün / şirket adı yok). Arayüz: arayuz/hizli-test.js (#/hizli-test).
//
// TASARIM NOTU (v1.5):
//  - Altyapı: tarama iş yöneticisi (tarama/yonetici.mjs) kip 'hizliTest' ile GÖRÜNÜR tarayıcı açar (giriş tarifi / saklanan oturum,
//    yasaklı adres, izinli köken, izinler ve CANLI onayı AYNEN; uç denetimi guvenlik/uc-denetimi.mjs). Alt süreç (tarama/hizli-test-
//    motoru.ts) keşfeder (tarama envanteri + eylem keşfi; basmadan) ve bu dosyanın komutlarını uygular (doldur / bas / seç / doğrula).
//  - Oturum = durum makinesi (bellekte; sunucu yeniden başlarsa kaybolur). Durumlar: kesif → veri (veri durağı) → karar ("Şimdi ne
//    yapayım?") → [onay (Bana sor) | secim (sayfada seç)] → calisiyor (basış) → [hataSorusu] → veri / karar … → bitis (etiketler) →
//    kaydet (H3 doğrulama sorusu, farklar onayı) → kaydedildi. Hayır izninde: kesif → veri → hayirSecim (düğme + mesaj adaylardan) →
//    bitis → kaydet ("doğrulanmadı"). Akış tamamlanmadan bitmez: zorunlu boş alan varken ilerlenmez.
//  - Değer ÜRETİLMEZ: alan değerleri yalnız kullanıcının yazdığı ya da "Doldur" ile tablodan seçtiğidir (tablo başvurusu "${Tablo.Sütun}"
//    senaryoya aynen yazılır; tarayıcıya giden değer sunucuda tablodan çözülür, yalnız bellekte).
//  - Düğmeye yalnız kullanıcının izniyle basılır: evet → kullanıcının seçtiği / tek aday; sor → her basıştan önce onay; hayir → hiç.
//  - Kayıt: oturumun zinciri akış kaydı envanterine çevrilir (hizli-test/akis.mjs > kayitEnvanteriKur) ve "Akışı kaydet" ile AYNI
//    paket yolundan (kayitPaketiOlustur → sayfaEkle / modeliPaketleDegistir) ekran modeli olur; son adıma bitiş koşulu yazılır (Bitti →
//    kosu.basariGostergesi, Hata → kosu.uyarilar, Devam → kosu.bitisKosulu.devam). Senaryo senaryoKaydet ile (değerler, tablo seçimleri,
//    içerikte hizliTest: izin, bitiş, doğrulandı). Aynı ekran varsa yeni model sürümü; farklar önce onaya sunulur.
//
// Uçlar (oturum token'ı; kasa açık):
//   GET  /platform/hizli-test/secenekler?projeId=&ekranId=   ortamlar (canlı mı, giriş tarifi, tarifin bağlam türü), bağlam profilleri
//                                                              (yalnız tür / ad / kapsam; alanlar dönmez), düzenlenecek ekran, süren oturum
//   POST /platform/hizli-test/baslat { projeId, ortamId, hedef, ekranAdi | ekranId, cumle?, izin, girissiz?, canliOnay?,
//        baglamProfilleri?: [{ tur, profilId }] } → { id }. Bağlam: tarifin bağlam türünde EN FAZLA bir profil; taramayla aynı yol (profil
//        adıyla tarama/yonetici.mjs > baslat; motor giriş-motoru > baglamiDegistir). Tarayıcının yeniden açılması ve doğrulama koşusu aynı
//        gövdeyle açılır (aynı bağlam). Kayıtta senaryonun bağlam profili alanına (profilHavuzu) seçilen profil yazılır.
//   GET  /platform/hizli-test/durum?id=                       oturumun görünümü (soru, zincir, görülen metinler; değer maskesiz yalnız kullanıcının yazdığı)
//   POST /platform/hizli-test/veri { id, degerler, zincir? }   veri durağı: { anahtar: { deger, kaynak: 'elle' | 'tablo', tabloSecimi? } };
//        zincir: üst liste anahtarı → yalnız o seçim (ve sayfaya uygulanmamış üstleri) uygulanır, bağlı alt listeler gelince aynı durak
//        yeniden sorulur (eksik denetlenmez, düğmeye basılmaz). Bağlı listeler ek zorunluluk taşımaz: boş bırakılan bağlı liste sayfaya
//        yazılmaz; yalnız sayfanın kendisi zorunlu saydığı alanlar (required / aria-required) eksik denetlenir.
//        kosulSecimi: seçim alanı anahtarı → yalnız o seçim uygulanır (anında uygulama). metinUygula: metin alanı anahtarı → yalnız o değer
//        yazılıp alandan çıkılır (düğmeye basılmaz); sayfa yeniden okunur, fark (beliren / dolan / sayfanın doldurduğu) aynı durakta
//        özetlenir ve metin girilince beliren / dolan alan "tetik" olarak kaydedilir.
//        Dosya alanı: { deger: "nobetci-dosya://<kimlik>/<ad>", kaynak: 'dosya' } (şifreli depodaki dosya; tarayıcıya oturuma özel geçici kopya).
//   POST /platform/hizli-test/dosya-yukle?id=&alan=           ham dosya gövdesi + X-Dosya-Adi → { dosya: { id, ad, boyut, referans } } (şifreli depoya)
//   GET  /platform/hizli-test/dosyalar?id=                    projenin şifreli senaryo dosyaları ("Depodan seç"; içerik dönmez)
//   POST /platform/hizli-test/karar { id, karar: 'bas' | 'baska' | 'bitir' | 'duzelt', secici?, metin?, dugme?, mesajlar? }
//   POST /platform/hizli-test/onay { id, cevap }               Bana sor: "X'e basayım mı?"; keşif toplu sorusu (durum kesifOnay): cevap true +
//        secilenler (seçiciler; "Seçilenlere bas") / false ("Hiçbirine basma") / 'atla' (Kalanları atla). Keşif basışı akışa yazılmaz.
//   POST /platform/hizli-test/diyalog { id, cevap: 'kabul' | 'iptal' }   Bana sor: basışta açılan onay / soru penceresinin yanıtı
//   POST /platform/hizli-test/hata-cevabi { id, cevap: 'hata' | 'uyari' | 'onemsiz' }
//   POST /platform/hizli-test/bitis { id, etiketler, adres?, olumsuz?, ogeler? }   ogeler: seçili Bitti öğelerinin seçicileri (görünür olunca bitti)
//   POST /platform/hizli-test/bitis-sec { id, tur: 'metin' | 'oge', etiketler?, ogeler? } | { id, vazgec: true }   bitiş için tarayıcıda seç
//   POST /platform/hizli-test/bitis-ekle { id, metin, etiket? } | { id, pencere: true } | { id, oge, sil: true }   elle metin / açılan pencere / öğeyi çıkar
//   POST /platform/hizli-test/geri { id, hedef: 'karar' | 'bitis' }   bitiş / kaydet ekranından adım adım zincire ya da bitiş koşuluna dön
//   POST /platform/hizli-test/dogrula { id }                   H3: baştan sona doğrulama koşusu (yeni kayıt oluşabilir; adım adım ilerleme)
//   POST /platform/hizli-test/ozet { id, baslik?, kosuyaDahil?, tabloOlustur? }   kayıt özeti (hiçbir şey yazılmaz; seçimler oturumda saklanır,
//                                                              özet sekmesi #/hizli-test/ozet/<id> gövdesiz okur)
//   POST /platform/hizli-test/kaydet { id, baslik, kosuyaDahil?, onay?, uzerineYaz? }   düzenlemede aynı başlıklı senaryo varsa önce
//                                                              { senaryoVar } (onaysız); aynı ekran varsa farklar (onaysız), onayla yeni sürüm
//   POST /platform/hizli-test/uzat { id }                     "Süreyi uzat": boşta kalma sayacı sıfırlanır → { sure }
//   POST /platform/hizli-test/devam { id, kip: 'tarayici' | 'kaydet' }   tarayıcı kapandıktan sonra (durum 'askida'): 'tarayici' =
//        "Kaldığın yerden devam et" (tarayıcı yeniden açılır, zincir baştan tekrar yürütülür, kalınan adıma gelinir; durum 'yeniden');
//        'kaydet' = "Toplananları kaydet" (tarayıcısız: bitiş koşulu / kaydet; doğrulanmadı)
//   POST /platform/hizli-test/iptal { id }
// SÜRE VE TARAYICI: sınır TOPLAM süre değil BOŞTA KALMA süresidir (tarama/yonetici.mjs; Ayarlar > Koşu > Tarama ve akış kaydı). Her uç
// çağrısı (durum yoklaması hariç) ve tarayıcı işi sayacı sıfırlar; görünümde "sure" (kalan, uyarı). Süre dolunca / pencere kapanınca
// toplananlar KAYBOLMAZ (durum 'askida'). Bitiş koşulu tamamlanınca (ve doğrulama koşusu bitince) tarayıcı KAPATILIR: kaydet / özet
// tarayıcısız yapılır, bu aşamada süre sınırı işlemez; doğrulama koşusu kendi tarayıcısını açıp kapatır; geri dönüşte (/geri) tarayıcı
// yeniden açılıp zincir tekrar yürütülür (motor: dogrula komutu, plan.yenidenKur; girdi.hizliTest.kesifAtla).
// NOT: import.meta KULLANILMAZ. Tipler: yonetici.d.mts.
import { randomBytes } from 'node:crypto';
import {
  DepoHatasi, baglamProfilleriniListele, ekranlariListele, ekranModeliGetir, ortamlariListele, projeGetir, senaryoGetir, senaryolariListele
} from '../veritabani/depo.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { ucDenetle } from '../guvenlik/uc-denetimi.mjs';
import { TaramaHatasi, taramaYoneticisiAl } from '../tarama/yonetici.mjs';
import { canliAkisiVekille, canliKanalaIstek, canliTamSayfaAl } from '../canli-akis.mjs';
import { HedefHatasi, ekKokenleri, hedefCoz } from '../tarama/koruma.mjs';
import { ekranAnahtariOner, kayitPaketiOlustur } from '../tarama/paket-olusturucu.mjs';
import { kalipVar, katla } from '../tarama/eylem-kesfi.mjs';
import { yerTutucuSecenekMi } from '../tarama/yer-tutucu-secenek.mjs';
import { ZINCIR_SECENEK_BEKLEME_MS, bulguMetni, gercekSecenekler, olaganYuklenme, yuklenmeBeklemesi, zincirMetni } from '../tarama/zincir-kesfi.mjs';
import { EkranDogrulamaHatasi, analizYukle, modeliPaketleDegistir, paketOnizle, sayfaEkle } from '../ekranlar/ekran-servisi.mjs';
import { kayitSorunlari } from './kayit-sorunlari.mjs';
import { dallariBirlestir, gorulmeyenBagliSecenekleriKoru, ulasilamayanAdimlariKoru } from './dal-birlestirme.mjs';
import { tumSecenekler } from './test-verisi-tablosu.mjs';
import { farkOzeti, sayfaFarki, tetikHedefleri } from './sayfa-farki.mjs';
import { bulguOzeti, modelFarki } from '../ekranlar/model-farki.mjs';
import { modelBaglami, senaryoKaydet, senaryoOrtamVerisi } from '../senaryolar/senaryo-servisi.mjs';
import { senaryoHazirligi } from '../senaryolar/hazirlik-servisi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from '../tablolar/ekran-baglari.mjs';
import { karsiliklariEkrandanAl } from '../tablolar/karsiliklar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { KAYIT_ETIKETI, basvuruYaz, pinAnahtari, pinSecimi, planKur, planOnizle, planYaz, senaryoOnerileri, varsayilanSecim, veriBekleyenSatirlariYaz } from './kayit-plani.mjs';
import { VERI_BEKLIYOR_ETIKETI } from '../senaryolar/veri-bekliyor.mjs';
import { ekranBasvurulariniCoz } from '../tablolar/ekran-basvurulari.mjs';
import {
  DOSYA_BOYUT_SINIRI, dosyaSahipleriniBagla, hizliTestKaynagi, projeSenaryoDosyalari, referansCoz, referanslariCoz, senaryoDosyasiBilgisi, senaryoDosyasiEkle
} from '../dosyalar/senaryo-dosyalari.mjs';
import { kosuKlasoruOlustur, kosuKlasorunuSil } from '../dosyalar/gecici-dosyalar.mjs';
import { degerBasvurusu, grupAnahtari, satirSabitlemesi } from '../tablolar/tablo-secimi.mjs';
import {
  BITIS_BEKLEME_SN, IZINLER, IZIN_ADLARI, adayMesajlari, basmaKarari, beklemeMetniMi, bitisKosulu, bitisiUygula, bitisUyarilari, canliOnayMetni, cumleyiOku,
  eksikAlanlar, hizliSenaryoBasligi, kayitEnvanteriKur, ornekDegeri, sayfaUyarisi, secimDegerleriniUydur, senaryoAnahtarlari, senaryoVerisiKur, tekAday, varsayilanEtiketler
} from './akis.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */
/** Tarayıcıyı (yeniden) açabilmek için: veritabanı ve sunucu adresi. @typedef {{ vt: Veritabani; baglam: { sunucuAdresi: string } }} TarayiciBaglami */

/** Kullanılmayan oturum bu süre sonra silinir (son erişimden). */
export const OTURUM_SAKLAMA_MS = 2 * 60 * 60 * 1000;
/** Tarayıcısı kapanmış, toplananları duran oturum (askıda / kaydet) OTURUM_SAKLAMA_MS'nin bu katı kadar saklanır. */
const ASKIDA_SAKLAMA_KATI = 12;
const OTURUM_KIMLIGI = /^[a-f0-9]{24}$/;
/** Düzenlenebilir alan türleri (düğme türleri ve gizli alanlar veri durağına girmez). */
const DOLDURULMAZ = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export class HizliTestHatasi extends Error {
  /** @param {string} kod @param {string} mesaj @param {number} [durum] @param {Nesne} [ek] */
  constructor(kod, mesaj, durum = 400, ek = {}) {
    super(mesaj);
    this.name = 'HizliTestHatasi';
    this.kod = kod;
    this.durum = durum;
    this.ek = ek;
  }
}

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const simdi = () => new Date().toISOString();
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : null);
/** @param {unknown} d @param {string} ad */
function kimlikAl(d, ad) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${ad}" geçersiz.`);
  return d;
}
/** Alan doldurulabilir mi (veri durağına girer mi)? Salt okunur ama takvimden seçilen tarih alanı doldurulur. @param {Nesne} a */
const doldurulabilir = (a) => !DOLDURULMAZ.has(String(a.tur)) && !a.devreDisi && (!a.saltOkunur || a.takvimden === true);
/** Sayfada görünen adı bulunamayan alanın gösterim adı (teknik ad değil). @param {Nesne} a */
const adsizEtiket = (a) => {
  const tur = { select: 'Liste', textarea: 'Metin alanı', radio: 'Seçenek grubu', checkbox: 'Onay kutusu', date: 'Tarih alanı', number: 'Sayı alanı', tel: 'Telefon alanı', email: 'E-posta alanı' }[String(a.tur)] ?? 'Metin kutusu';
  return `Adı görünmeyen alan (${tur})`;
};
/** Parola türündeki alanın değeri görünümde maskelenir. @param {Nesne} a */
const gizliAlan = (a) => String(a.tur) === 'password';
/** Gönderim olmayan düğme (geri, sil, vazgeç, kapat, iptal…; yalnız "×" / "✕" simgesi): öneri olmaz. @param {unknown} m */
const olumsuzDugme = (m) => typeof m === 'string' && (kalipVar('olumsuz', m) || /^\s*[×✕✖✗]\s*$/u.test(m));

/**
 * @param {{ projeKoku: string; yonetici?: import('../tarama/yonetici.d.mts').TaramaYoneticisi }} s
 */
export function hizliTestYoneticisiOlustur(s) {
  const tarama = () => s.yonetici ?? taramaYoneticisiAl(s.projeKoku);
  /** @type {Map<string, Nesne>} */
  const oturumlar = new Map();

  /**
   * Oturumun geçici dosya klasörü (seçilen dosyaların koşu anı düz kopyaları; gecici-dosyalar.mjs) silinir: kayıt / iptal / süre dolumu.
   * @param {Nesne} o
   */
  const dosyaKlasorunuSil = (o) => {
    if (!o.dosyaKlasoru) return;
    try { kosuKlasorunuSil(o.dosyaKlasoru.klasor, o.dosyaKlasoru.kok); } catch { /* sunucu açılışında artık klasör temizliği siler */ }
    o.dosyaKlasoru = null;
    o.dosyaYollari = {};
  };
  const temizle = () => {
    const sinir = Date.now() - OTURUM_SAKLAMA_MS;
    // Tarayıcısı kapanmış ama toplananları duran oturum (askıda / kaydet) daha uzun saklanır (bellekte).
    const uzunSinir = Date.now() - OTURUM_SAKLAMA_MS * ASKIDA_SAKLAMA_KATI;
    for (const [id, o] of oturumlar) {
      if (Date.parse(o.sonErisim) < (['askida', 'kaydet'].includes(o.durum) ? uzunSinir : sinir)) { dosyaKlasorunuSil(o); oturumlar.delete(id); }
    }
  };
  /**
   * etkilesim: kullanıcı işlemi (her uç çağrısı; durum yoklaması HARİÇ) — tarayıcı açıksa boşta kalma sayacı sıfırlanır.
   * @param {string} id @param {boolean} [etkilesim]
   */
  const oturumGetir = (id, etkilesim = true) => {
    temizle();
    const o = typeof id === 'string' && OTURUM_KIMLIGI.test(id) ? oturumlar.get(id) : undefined;
    if (!o) throw new HizliTestHatasi('BULUNAMADI', 'Nöbetçi taraması bulunamadı (süresi dolmuş ya da sunucu yeniden başlamış olabilir).', 404);
    o.sonErisim = simdi();
    if (etkilesim && o.tarayici === 'acik') { try { tarama().hizliUzat(o.isId); } catch { /* iş bitti: olay ayrıca gelir */ } }
    return o;
  };
  /** @param {Nesne} o @param {string} m */
  const gunluk = (o, m) => {
    o.gunluk.push({ zaman: simdi(), metin: m.slice(0, 300) });
    if (o.gunluk.length > 60) o.gunluk.splice(0, o.gunluk.length - 60);
  };
  /**
   * Komutu tarayıcıya gönderir. Tarayıcı kapalıysa (süre doldu / kaydet aşaması) ya da iş bittiyse oturum işlemden önceki durumuna
   * (durumda'nın anlık kaydı) döner ve açık hata verilir: "Tarayıcıyı yeniden aç" (/devam) ile zincir tekrar yürütülür.
   * @param {Nesne} o @param {Nesne} komut
   */
  const gonder = (o, komut) => {
    const geriAl = () => {
      if (o.islemOncesi) { o.durum = o.islemOncesi.durum; o.calisiyor = o.islemOncesi.calisiyor; }
      o.okumaAmaci = null;
    };
    if (o.tarayici !== 'acik' && komut.tur !== 'bitir') {
      geriAl();
      throw new HizliTestHatasi('TARAYICI_KAPALI', 'Tarayıcı kapalı. “Tarayıcıyı yeniden aç” ile tarayıcı açılır ve zincir tekrar yürütülerek aynı adıma gelinir.', 409);
    }
    const no = ++o.komutNo;
    const onceki = o.bekleyen;
    o.bekleyen = { no, tur: komut.tur };
    try {
      tarama().komutGonder(o.isId, /** @type {any} */ ({ no, ...komut }));
    } catch (h) {
      o.bekleyen = onceki;
      if (komut.tur !== 'bitir') geriAl();
      throw h;
    }
    return no;
  };
  /** Oturum düzenlenebilir durumda mı (süren komut / bitmiş oturum yok)? @param {Nesne} o @param {string[]} durumlar */
  const durumda = (o, durumlar) => {
    if (o.durum === 'hata' || o.durum === 'iptal') throw new HizliTestHatasi('BITTI', o.hata?.mesaj ?? 'Nöbetçi taraması bitti.', 409);
    if (!durumlar.includes(o.durum)) throw new HizliTestHatasi('DURUM', 'Nöbetçi taraması şu anda bu işlemi beklemiyor; sayfayı yenileyin.', 409, { durum: o.durum });
    // Komut gönderilemezse (tarayıcı kapalı) dönülecek durum.
    o.islemOncesi = { durum: o.durum, calisiyor: o.calisiyor ?? null };
  };
  /**
   * Tarayıcı işini kapatır (kaydet aşaması / zincir kurulamadı): alt sürece "bitir" gider; oturum ve toplananlar sunucuda kalır, kayıt
   * tarayıcısız yapılır. @param {Nesne} o
   */
  const tarayiciyiKapat = (o) => {
    if (o.tarayici !== 'acik') return;
    o.tarayici = 'kapali';
    try { gonder(o, { tur: 'bitir' }); } catch { /* iş zaten bitti */ }
    o.bekleyen = null;
  };
  /**
   * Oturumu bir tarayıcı işine bağlar: olaylar yalnız GÜNCEL işten işlenir (eski işin geç gelen "isBitti"si yok sayılır); mesgulMu: süre
   * dolarken tarayıcı işi sürüyorsa (keşif, zincirin yeniden kurulması, süren komut; kullanıcı yanıtı beklenen pencere sorusu hariç)
   * etkinlik sayılır. @param {Nesne} o @param {string} isId
   */
  const isiDinle = (o, isId) => {
    tarama().hizliDinle(isId, (e) => { if (o.isId === isId) olayIsle(o, e); },
      () => o.isId === isId && (o.durum === 'kesif' || o.durum === 'yeniden' || (Boolean(o.bekleyen) && o.durum !== 'diyalog')));
  };

  // ---- Zincir yardımcıları ----
  /** @param {Nesne} o */
  const guncelAdim = (o) => o.adimlar[o.adimlar.length - 1];
  /** Alanın sayfa okumasındaki anahtarı: ikinci kez yazılan alan (kopya) kaynağının kutusudur. @param {Nesne} a */
  const sayfaAnahtari = (a) => String(a.kopyasi ?? a.anahtar);
  /** Alanı oturumun haritasına ve adıma ekler. @param {Nesne} o @param {Nesne} alan @param {Nesne} adim @param {boolean} yeni */
  const alanEkle = (o, alan, adim, yeni) => {
    if (o.alanlar.has(alan.anahtar)) return;
    // Bağlı liste (zincir keşfi ya da doldururken gözlenen): alanın seçenekleri üst listenin seçimine göre gelir.
    const ust = o.bagliUst?.get(alan.anahtar);
    if (ust && !alan.bagli) alan.bagli = { ust };
    o.alanlar.set(alan.anahtar, { alan, yeni });
    adim.alanlar.push(alan);
    ornektenDoldur(o, alan);
  };
  /**
   * Modeli güncellerken seçilen örnek senaryonun değeri (alan boşsa): kullanıcı her alanı yeniden girmez; değiştirebilir. Değeri olmayan
   * (ör. ekranda yeni çıkan) alan sorulur. @param {Nesne} o @param {Nesne} alan
   */
  const ornektenDoldur = (o, alan) => {
    if (!o.ornek || o.degerler[alan.anahtar] || alan.tur === 'file' || typeof alan.secici !== 'string') return;
    const d = ornekDegeri(o.ornek.model, /** @type {any} */ (alan), o.ornek.veri);
    if (d) o.degerler[alan.anahtar] = d;
  };
  // ---- Koşullu alanlar (seçim keşfi): bir seçimin belirli değerinde beliren alanlar ----
  /**
   * Koşullu alan şu an geçerli mi? Alanın koşulu: "<secim> alanı şu değerlerden biri olunca görünür". Seçimin değeri: kullanıcının yazdığı,
   * yoksa sayfanın ilk değeri (keşif). Seçimin kendisi de koşulluysa ve geçerli değilse alan geçerli değildir. Değer tablo başvurusuysa
   * (çözülmemiş) bilinmez: geçerli sayılır. @param {Nesne} o @param {Nesne} alan @param {Set<string>} [gorulen]
   * @returns {boolean}
   */
  const kosulAktif = (o, alan, gorulen = new Set(), sayfaIle = false) => {
    const kz = alan.kosul;
    if (!kz || gorulen.has(alan.anahtar)) return true;
    gorulen.add(alan.anahtar);
    const kontrol = o.alanlar.get(kz.secim)?.alan;
    if (kontrol && !kosulAktif(o, kontrol, gorulen, sayfaIle)) return false;
    const v = o.degerler[kz.secim];
    if (v && degerBasvurusu(v.deger)) {
      // sayfaIle: başvurunun değeri sayfaya uygulanmış hâlinden (son doldurma / keşif) okunur — koşulan yolun dalı bellidir.
      const s = sayfaIle ? sayfadakiDeger(o, kz.secim) : null;
      return s === null ? true : kz.degerler.includes(s);
    }
    const simdi = v ? v.deger : o.kesifIlk?.[kz.secim] ?? null;
    if (simdi === null || simdi === undefined) return true;
    return kz.degerler.includes(String(simdi));
  };
  /**
   * Görünürlüğü belirleyen seçim mi: oturumda bu alanın değerine göre görünen (koşullu) bir alan var ("Önce bunu seçin").
   * @param {Nesne} o @param {string} anahtar @returns {boolean}
   */
  // Etiketi seçime göre değişen alanı (etiketKosulu) belirleyen seçim de "kontrol"dür: alanın adı (ve girilecek verinin anlamı) bu seçime bağlı.
  // Alanın düzenlenebilirliğini (kilitKosulu: o değerde sayfa alanı kendisi doldurur) belirleyen seçim de "kontrol"dür.
  const kontrolMu = (o, anahtar) => [...o.alanlar.values()].some((x) => x.alan.kosul?.secim === anahtar || x.alan.etiketKosulu?.secim === anahtar
    || x.alan.kilitKosulu?.secim === anahtar);
  /** Seçimin sayfadaki (uygulanmış) değeri: son doldurmada uygulanan, yoksa sayfanın ilk değeri (keşif). @param {Nesne} o @param {string} anahtar */
  const sayfadakiDeger = (o, anahtar) => {
    const u = o.uygulanan?.[anahtar];
    if (u !== undefined && u !== null) return String(u);
    const ilk = o.kesifIlk?.[anahtar];
    return ilk === undefined || ilk === null ? null : String(ilk);
  };
  /**
   * Alanın seçimin belirli değerindeki etiketi: seçime göre etiketi değişen alanda (etiketKosulu: { secim, varsayilan, etiketler: değer →
   * etiket }) o değerin etiketi, bilinmiyorsa ilk görülen etiket; diğer alanlarda etiketi. @param {Nesne} a @param {string | null} deger
   * @returns {string | null}
   */
  const degerEtiketi = (a, deger) => {
    const ek = a.etiketKosulu;
    if (!ek) return a.etiket ?? null;
    return (deger !== null ? ek.etiketler?.[deger] : undefined) ?? ek.varsayilan ?? a.etiket ?? null;
  };
  /**
   * Alanın şu anki etiketi: etiketi seçime göre değişiyorsa seçimin şu anki değerindeki (kullanıcının yazdığı — tablo başvurusu değilse —,
   * yoksa sayfadaki değer). @param {Nesne} o @param {Nesne} a @returns {string | null}
   */
  const gecerliEtiket = (o, a) => {
    const ek = a.etiketKosulu;
    if (!ek) return a.etiket ?? null;
    const v = o.degerler[ek.secim];
    const simdi = v && v.deger !== null && v.deger !== undefined && v.deger !== '' && !degerBasvurusu(v.deger) ? String(v.deger) : sayfadakiDeger(o, ek.secim);
    return degerEtiketi(a, simdi);
  };
  /** Alanın seçimin belirli değerindeki en çok karakter sayısı (maxlength; seçime göre değişiyorsa o değerdeki). @param {Nesne} a @param {string | null} deger */
  const degerEnCok = (a, deger) => {
    const l = a.etiketKosulu?.enCoklar;
    if (l && deger !== null && l[deger] !== undefined) return l[deger];
    return Number.isInteger(a.enCok) ? a.enCok : null;
  };
  /**
   * Doldurmadan sonra etiketler sayfadan tazelenir: etiketi seçime göre değişen alanda seçimin sayfadaki değerinin etiketi kaydedilir;
   * "Önce bunu seçin" isteğinde (istek) etiketi değişen, henüz bağı bilinmeyen alan o seçime bağlanır (önceki değer → eski ad, seçilen →
   * yeni ad); başka durumda alanın etiketi sayfadakiyle güncellenir. @param {Nesne} o @param {Nesne} anlik
   * @param {{ anahtar: string; onceki: string | null; secilen: string } | null} istek
   */
  const etiketleriTazele = (o, anlik, istek) => {
    for (const yeni of Array.isArray(anlik?.alanlar) ? anlik.alanlar : []) {
      const kayit = nesneMi(yeni) ? o.alanlar.get(yeni.anahtar)?.alan : null;
      const etiket = typeof yeni?.etiket === 'string' ? yeni.etiket.trim() : '';
      if (!kayit) continue;
      const enCok = Number.isInteger(yeni.enCok) ? yeni.enCok : null;
      const ek = kayit.etiketKosulu;
      if (ek) {
        const v = sayfadakiDeger(o, ek.secim);
        if (v === null) continue;
        if (etiket) ek.etiketler[v] = etiket;
        if (ek.enCoklar || enCok !== degerEnCok(kayit, v)) (ek.enCoklar ??= {})[v] = enCok;
        continue;
      }
      const adDegisti = Boolean(etiket) && etiket !== kayit.etiket;
      const enCokDegisti = enCok !== (Number.isInteger(kayit.enCok) ? kayit.enCok : null);
      if (!adDegisti && !enCokDegisti) continue;
      if (istek && istek.onceki !== null && kayit.anahtar !== istek.anahtar && kayit.etiket) {
        kayit.etiketKosulu = {
          secim: istek.anahtar, varsayilan: kayit.etiket, etiketler: { [istek.onceki]: kayit.etiket, [istek.secilen]: etiket || kayit.etiket },
          ...(enCokDegisti ? { enCoklar: { [istek.onceki]: Number.isInteger(kayit.enCok) ? kayit.enCok : null, [istek.secilen]: enCok } } : {})
        };
        continue;
      }
      if (etiket) kayit.etiket = etiket;
      kayit.enCok = enCok;
    }
  };
  // ---- Seçime göre düzenlenemeyen alanlar (sayfa o seçimde alanı kendisi doldurur; keşif "kilitler", alanKilidi) ----
  // Önce dene (normal koşuyla ORTAK ilke: tarama/alan-kilitleri.mjs): seçime bağlı olmayan sezgisel kilit (aria, takvim sınıfı) alanı
  // önden atlatmaz; alan yazılır, sayfa yazılanı kabul etmeyip eski değeri geri yazarsa (kilitKanit) düzenlenemez sayılır. Salt okunur
  // (takvimden seçilen tarih alanı hariç) ve kapalı alan zaten sorulmaz (doldurulabilir).
  /** Seçimin şu anki değeri: kullanıcının yazdığı (tablo başvurusu değilse), yoksa sayfadaki. @param {Nesne} o @param {string} anahtar */
  const secimSimdi = (o, anahtar) => {
    const v = o.degerler[anahtar];
    return v && v.deger !== null && v.deger !== undefined && v.deger !== '' && !degerBasvurusu(v.deger) ? String(v.deger) : sayfadakiDeger(o, anahtar);
  };
  /**
   * Alan şu anki seçimde DÜZENLENEMEZ mi (sayfa dolduruyor): seçime göre kilitlenen alanda seçimin şu anki değerindeki durum (bilinmeyen
   * değerde düzenlenebilir), değilse yazarken toplanan kanıt (yazılan tutmadı, sayfa eski değeri geri yazdı). Böyle alan
   * sorulmaz, yazılmaz, senaryoya / tabloya girmez. @param {Nesne} o @param {Nesne} a @returns {boolean}
   */
  const duzenlenemez = (o, a) => {
    const kk = a.kilitKosulu;
    if (kk) {
      const v = secimSimdi(o, kk.secim);
      return v === null ? kk.varsayilan === true : kk.kilitli?.[v] === true;
    }
    return a.kilitKanit === true;
  };
  /**
   * Doldurmadan sonra düzenlenebilirlik sayfadan tazelenir (salt okuma; alanKilidi): seçime göre kilitlenen alanda seçimin sayfadaki
   * değerindeki durum kaydedilir; "Önce bunu seçin" isteğinde (istek) düzenlenebilirliği değişen alan o seçime bağlanır (önceki değer →
   * eski durum, seçilen → yeni). @param {Nesne} o @param {Nesne} anlik
   * @param {{ anahtar: string; onceki: string | null; secilen: string } | null} istek
   */
  const kilitleriTazele = (o, anlik, istek) => {
    for (const yeni of Array.isArray(anlik?.alanlar) ? anlik.alanlar : []) {
      const kayit = nesneMi(yeni) ? o.alanlar.get(yeni.anahtar)?.alan : null;
      if (!kayit || kayit.tur === 'radio') continue;
      const simdi = Boolean(yeni.kilit);
      const once = Boolean(kayit.kilit);
      const kk = kayit.kilitKosulu;
      if (kk) {
        const v = sayfadakiDeger(o, kk.secim);
        if (v !== null) kk.kilitli[v] = simdi;
      } else if (istek && istek.onceki !== null && kayit.anahtar !== istek.anahtar && once !== simdi && !(kayit.tur === 'select' && kayit.bagli)) {
        kayit.kilitKosulu = { secim: istek.anahtar, kilitli: { [istek.onceki]: once, [istek.secilen]: simdi }, varsayilan: once };
      }
      kayit.kilit = typeof yeni.kilit === 'string' ? yeni.kilit : null;
    }
  };
  /** Geçerli olmayan koşullu alanların ve şu anki seçimde düzenlenemeyen (sayfanın doldurduğu) alanların değerleri kaydedilmez / gönderilmez. @param {Nesne} o */
  const aktifDegerler = (o) => Object.fromEntries(Object.entries(o.degerler).filter(([k]) => { const a = o.alanlar.get(k)?.alan; return !a || (kosulAktif(o, a) && !duzenlenemez(o, a)); }));
  /** Doldurma sırası: kullanıcının sırası korunur; koşullu alan her zaman kendi seçiminden SONRA doldurulur. @param {Nesne[]} liste @returns {Nesne[]} */
  const bagimliSirala = (liste) => {
    const s = [...liste];
    for (let tur = 0; tur < s.length; tur++) {
      let degisti = false;
      for (let i = 0; i < s.length; i++) {
        // Koşullu alan kendi seçiminden, bağlı liste üst listesinden SONRA.
        // Etiketi seçime göre değişen alan da seçiminden SONRA (seçim alanın anlamını belirler).
        const ust = s[i].kosul?.secim ?? s[i].etiketKosulu?.secim ?? s[i].kilitKosulu?.secim ?? s[i].bagli?.ust;
        if (!ust) continue;
        const j = s.findIndex((x) => x.anahtar === ust);
        if (j > i) { const [x] = s.splice(i, 1); s.splice(j, 0, x); degisti = true; break; }
      }
      if (!degisti) break;
    }
    return s;
  };
  /**
   * Seçim keşfinin sonuçlarını ilk adıma işler: her değerde beliren alan koşullu alan olarak eklenir (kontrol alanının hemen sonrasına);
   * koşul "seçim şu değerlerden biri" biçiminde adımın koşullarına yazılır (modelde görünürlük koşulu olur).
   * sayfaAlanlari: bu okumadaki alanlar (ilk değerde düzenlenemediği için sorulmayan, başka değerde açılan alan buradan eklenir).
   * @param {Nesne} o @param {Nesne} adim @param {Nesne[]} kesifler @param {Nesne[]} [sayfaAlanlari]
   */
  const kosulluAlanlariEkle = (o, adim, kesifler, sayfaAlanlari = []) => {
    o.kesifIlk ??= {};
    for (const k of kesifler) if (typeof k.secim === 'string' && !(k.secim in o.kesifIlk)) o.kesifIlk[k.secim] = k.ilkDeger ?? null;
    adim.kosullar ??= {};
    for (const k of kesifler) {
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) {
        for (const g of Array.isArray(d.gorunenler) ? d.gorunenler : []) {
          if (!nesneMi(g) || typeof g.anahtar !== 'string' || !doldurulabilir(g)) continue;
          const var_ = o.alanlar.get(g.anahtar)?.alan;
          if (var_) {
            if (var_.kosul && var_.kosul.secim === k.secim && !var_.kosul.degerler.includes(String(d.deger))) var_.kosul.degerler.push(String(d.deger));
            // İç içe: üst seçimin değerinde görülmüş (koşulu üst seçime bağlı) alan aslında bu alt seçimin bu değerinde görünür.
            else if (var_.kosul && k.ust && var_.kosul.secim === String(k.ust.secim) && var_.anahtar !== k.secim) var_.kosul = { secim: String(k.secim), degerler: [String(d.deger)] };
            continue;
          }
          // Keşifte görülen değer (seçim denenirken sayfanın o anki durumu; değer okunmadan) sayfanın ŞİMDİKİ değeri değildir: alan şu an
          // görünmüyor. "Sayfada hazır" sayılmaz; alan gerçekten görününce (değerli okumada) hazır / değer tazelenir (hazirTazele).
          const alan = { ...g, hazir: false, mevcut: null, kosul: { secim: String(k.secim), degerler: [String(d.deger)] } };
          o.alanlar.set(alan.anahtar, { alan, yeni: false });
          ornektenDoldur(o, alan);
          // Kontrol alanının (ve onun önceki koşullu alanlarının) hemen sonrasına.
          let konum = adim.alanlar.findIndex((/** @type {Nesne} */ x) => x.anahtar === k.secim);
          if (konum >= 0) { while (konum + 1 < adim.alanlar.length && adim.alanlar[konum + 1].kosul?.secim === k.secim) konum++; adim.alanlar.splice(konum + 1, 0, alan); }
          else adim.alanlar.push(alan);
        }
      }
    }
    // Bir seçimin belirli değerinde KAYBOLAN alanlar (ör. varsayılan seçenekte görünen alanlar): alan seçimin denenen diğer değerlerinde görünür.
    for (const k of kesifler) {
      const denenen = (Array.isArray(k.degerler) ? k.degerler : []).map((/** @type {Nesne} */ d) => String(d.deger));
      const tumu = [...new Set([...(k.ilkDeger === null || k.ilkDeger === undefined ? [] : [String(k.ilkDeger)]), ...denenen])];
      /** @type {Map<string, Set<string>>} */
      const gizli = new Map();
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) for (const x of Array.isArray(d.kaybolanlar) ? d.kaybolanlar : []) {
        if (typeof x !== 'string' || x === k.secim) continue;
        (gizli.get(x) ?? gizli.set(x, new Set()).get(x))?.add(String(d.deger));
      }
      // İç içe seçim (kendisi bir üst seçimin değerinde beliren): aynı bölümdeki alan (koşulu seçimin koşuluyla aynı üst seçime bağlı)
      // bu seçime bağlanır; üst koşul seçimin kendi koşulundan gelir (koşul zinciri: üst = Evet VE bu seçim = Özel).
      const kontrolKosulu = o.alanlar.get(String(k.secim))?.alan?.kosul ?? null;
      for (const [anahtar, gizliDegerler] of gizli) {
        const alan = o.alanlar.get(anahtar)?.alan;
        const ayniBolum = Boolean(alan?.kosul && kontrolKosulu && alan.kosul.secim === kontrolKosulu.secim && alan.kosul.secim !== String(k.secim));
        if (!alan || (alan.kosul && !ayniBolum)) continue;
        const gorunur = tumu.filter((x) => !gizliDegerler.has(x));
        if (!gorunur.length || gorunur.length >= tumu.length) continue;
        alan.kosul = { secim: String(k.secim), degerler: gorunur };
      }
    }
    // Bir seçimin belirli değerinde ETİKETİ DEĞİŞEN alanlar (anahtar aynı, ad farklı; ör. aynı kutu bir değerde kimlik no, diğerinde vergi no):
    // alan seçimin grubunda o değerdeki adıyla sorulur; ilk değerdeki ad keşifte okunan etikettir.
    for (const k of kesifler) {
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) {
        for (const [anahtar, yeni] of Object.entries(nesneMi(d.etiketler) ? d.etiketler : {})) {
          const alan = o.alanlar.get(anahtar)?.alan;
          if (!alan || anahtar === k.secim || typeof yeni !== 'string' || !yeni.trim()) continue;
          if (alan.etiketKosulu && alan.etiketKosulu.secim !== String(k.secim)) continue;
          alan.etiketKosulu ??= { secim: String(k.secim), varsayilan: alan.etiket ?? null, etiketler: {} };
          const ilk = k.ilkDeger === null || k.ilkDeger === undefined ? null : String(k.ilkDeger);
          if (ilk !== null && alan.etiket && alan.etiketKosulu.etiketler[ilk] === undefined) alan.etiketKosulu.etiketler[ilk] = alan.etiket;
          alan.etiketKosulu.etiketler[String(d.deger)] = yeni.trim();
        }
        // En çok karakter sayısı (maxlength) da seçime göre değişebilir (ör. kimlik no 11, vergi no 10 hane): aynı yapıda (enCoklar).
        for (const [anahtar, kural] of Object.entries(nesneMi(d.kurallar) ? d.kurallar : {})) {
          const alan = o.alanlar.get(anahtar)?.alan;
          if (!alan || anahtar === k.secim || !nesneMi(kural)) continue;
          if (alan.etiketKosulu && alan.etiketKosulu.secim !== String(k.secim)) continue;
          alan.etiketKosulu ??= { secim: String(k.secim), varsayilan: alan.etiket ?? null, etiketler: {} };
          alan.etiketKosulu.enCoklar ??= {};
          const ilk = k.ilkDeger === null || k.ilkDeger === undefined ? null : String(k.ilkDeger);
          if (ilk !== null && alan.etiketKosulu.enCoklar[ilk] === undefined) alan.etiketKosulu.enCoklar[ilk] = alan.enCok ?? null;
          alan.etiketKosulu.enCoklar[String(d.deger)] = Number.isInteger(kural.enCok) ? kural.enCok : null;
        }
      }
    }
    // Bir seçimin belirli değerinde DÜZENLENEBİLİRLİĞİ değişen alanlar (kilitler; ör. bir değerde sayfa tarihleri kendisi doldurup kilitler):
    // alan AYNI YERDE kalır; o değerde düzenlenemez gösterilir, sorulmaz, yazılmaz. İlk değerdeki durum keşifte okunan kilittir.
    for (const k of kesifler) {
      const ilk = k.ilkDeger === null || k.ilkDeger === undefined ? null : String(k.ilkDeger);
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) {
        for (const [anahtar, kilitli] of Object.entries(nesneMi(d.kilitler) ? d.kilitler : {})) {
          if (anahtar === k.secim || typeof kilitli !== 'boolean') continue;
          let alan = o.alanlar.get(anahtar)?.alan;
          // İlk değerde düzenlenemediği için (kapalı / salt okunur) sorulmayan alan bu değerde açılıyor: sayfadaki yerinde eklenir.
          if (!alan && !kilitli) {
            const ham = sayfaAlanlari.find((x) => nesneMi(x) && x.anahtar === anahtar);
            if (ham && !DOLDURULMAZ.has(String(ham.tur))) {
              alanEkle(o, { ...ham }, adim, false);
              sayfaSirasinaYerlestir(adim, [anahtar], sayfaAlanlari);
              alan = o.alanlar.get(anahtar)?.alan;
            }
          }
          if (!alan || (alan.kilitKosulu && alan.kilitKosulu.secim !== String(k.secim))) continue;
          alan.kilitKosulu ??= { secim: String(k.secim), kilitli: {}, varsayilan: Boolean(alan.kilit) };
          if (ilk !== null && alan.kilitKosulu.kilitli[ilk] === undefined) alan.kilitKosulu.kilitli[ilk] = Boolean(alan.kilit);
          alan.kilitKosulu.kilitli[String(d.deger)] = kilitli;
        }
      }
    }
    for (const a of adim.alanlar) if (a.kosul) adim.kosullar[a.anahtar] = a.kosul;
  };
  /** Zorunlu boş alan var mı / gösterilecek alan var mı → veri durağı. @param {Nesne} o @param {string | null} [not] */
  const veriDuragi = (o, not = null) => {
    o.durum = 'veri';
    o.soruNotu = not;
    otomatikDevam(o);
  };
  /**
   * Örnek senaryo seçildiyse (Modeli güncelle / Testlerim > Düzenle) veri durağında beklenmez: değerler senaryodan geldiği için "Devam et"
   * kendiliğinden yapılır. Zorunlu alan boşsa (senaryoda değeri yok) ya da aynı durağa ikinci kez düşülürse (sayfa değerleri geri aldı)
   * durulur ve kullanıcıya sorulur. @param {Nesne} o
   */
  const otomatikDevam = (o) => {
    if (!o.ornek || !o.otomatikVt) return;
    setTimeout(() => {
      if (o.durum !== 'veri') return;
      // Aynı durak (adım, basış, not) bir kez kendiliğinden geçilir; yeniden düşülürse kullanıcıya bırakılır.
      const imza = `${o.adimlar.length}:${o.basisNo}:${o.soruNotu ?? ''}`;
      if (o.otomatikImza === imza) return;
      o.otomatikImza = imza;
      veri(o.otomatikVt, { id: o.id, degerler: {} }).then(() => {
        gunluk(o, 'Değerler örnek senaryodan; veri durağı kendiliğinden geçildi.');
      }, (h) => {
        const neden = h instanceof Error ? h.message : String(h);
        o.soruNotu = `Kendiliğinden devam edilemedi: ${neden} Eksik değeri girip “Devam et” deyin.`;
        gunluk(o, `Kendiliğinden devam edilemedi: ${neden}`);
      });
    }, 0);
  };
  // ---- Bağlı listeler (il → ilçe, marka → model…; zincir-kesfi.mjs) ----
  /** Alanın görünen adı. @param {Nesne} o @param {string} anahtar */
  const alanAdi = (o, anahtar) => { const a = o.alanlar.get(anahtar)?.alan; return (a ? gecerliEtiket(o, a) : null) ?? o.kesifAdlari?.get(anahtar) ?? anahtar; };
  /** Bağlı liste henüz seçeneksiz mi (üst seçilince dolacak)? @param {Nesne} a */
  // Devre dışı bağlı liste de, üstü sayfada boş (hazır değeri yok, hiç uygulanmadı) olan bağlı liste de bekliyor sayılır: sayfa üst
  // boşalınca altı kilitler ama eski (başka üst değerin) seçeneklerini silmeyebilir — o seçenekler geçerli değildir.
  const bagliBekliyor = (/** @type {Nesne} */ a, /** @type {Nesne} */ o) => {
    if (!a.bagli) return false;
    if (!gercekSecenekler(a.secenekler).length || a.devreDisi === true) return true;
    const ust = /** @type {Nesne | undefined} */ (o.alanlar.get(a.bagli.ust)?.alan);
    return Boolean(ust) && ust?.hazir !== true && o.uygulanan?.[a.bagli.ust] === undefined;
  };
  /**
   * Bağlı liste seçeneksiz ama seçenekleri gelecek mi (üstü seçili ya da sayfada hazır)? Böyle liste eksik denetimine girmez (henüz
   * seçilemez); üstü boşsa sayfa zorunlu saydığında eksik sayılır (önce üst seçilmeli). @param {Nesne} a @param {Nesne} o
   */
  const bagliGelecek = (a, o) => bagliBekliyor(a, o) && (Boolean(o.degerler[a.bagli.ust]) || o.alanlar.get(a.bagli.ust)?.alan?.hazir === true);
  /**
   * Bağlı listenin seçenekleri üstün şu anki değerine göre mi geldi? Üstün değeri girilmişse sayfaya uygulanan değerle aynı olmalı;
   * üst sayfada hazır geliyorsa (değer girilmemiş) seçeneklerin varlığı yeter. @param {Nesne} o @param {Nesne} a
   */
  const bagliGetirildi = (o, a) => {
    if (!a.bagli || bagliBekliyor(a, o)) return false;
    const u = o.degerler[a.bagli.ust];
    return !u || o.uygulanan[a.bagli.ust] === u.deger;
  };
  /** Üst → alt ilişkisini kaydeder (paketin bagliListeler'i, alanın bagli'si). @param {Nesne} o @param {string} ust @param {string} alt */
  const bagliEkle = (o, ust, alt) => {
    if (ust === alt || o.bagliUst.has(alt)) return;
    o.bagliUst.set(alt, ust);
    const a = o.alanlar.get(alt)?.alan;
    if (a && !a.bagli) a.bagli = { ust };
  };
  /**
   * Sonradan (doldurunca / basınca) beliren listelerde yerinde bulunan bağlı liste zinciri (motor: yerindeZincirKesfi): ilişkiler alanlara
   * "bagli" olarak, gözlemler tablolara / önerilere, notlar günlüğe. Alanlar henüz eklenmediyse bağ alanEkle'de uygulanır (bagliUst).
   * @param {Nesne} o @param {unknown} ham @param {Nesne[]} sayfaAlanlari bu okumadaki alanlar (adlar için)
   */
  const yerindeZinciriIsle = (o, ham, sayfaAlanlari) => {
    const z = nesneMi(ham) ? ham : null;
    if (!z) return;
    for (const a of sayfaAlanlari) if (nesneMi(a) && typeof a.anahtar === 'string' && !o.kesifAdlari?.has(a.anahtar)) o.kesifAdlari?.set(a.anahtar, a.etiket ?? a.anahtar);
    for (const i of Array.isArray(z.iliskiler) ? z.iliskiler : []) if (typeof i?.ust === 'string' && typeof i?.alt === 'string') bagliEkle(o, i.ust, i.alt);
    for (const g of Array.isArray(z.gozlemler) ? z.gozlemler : []) if (nesneMi(g) && typeof g.anahtar === 'string') o.gozlemler.push(g);
    for (const [k, l] of Object.entries(nesneMi(z.sureler) ? z.sureler : {})) if (Array.isArray(l)) (o.yuklenme[k] ??= []).push(...l.filter((x) => Number.isFinite(x)));
    for (const b of Array.isArray(z.bulgular) ? z.bulgular : []) o.bulgular.push(bulguMetni(b, (k) => alanAdi(o, k)));
    const iliskiler = (Array.isArray(z.iliskiler) ? z.iliskiler : []).filter((/** @type {Nesne} */ i) => typeof i?.ust === 'string' && typeof i?.alt === 'string');
    if (iliskiler.length) gunluk(o, `Yeni beliren listelerde bağlı liste zinciri: ${zincirMetni(iliskiler, (k) => alanAdi(o, k)).join('; ')} (yerinde denendi; hiçbir düğmeye basılmadı).`);
    for (const n of (Array.isArray(z.notlar) ? z.notlar : []).slice(0, 4)) gunluk(o, `Bağlı liste notu: ${String(n)}`);
  };
  /** Bağ ilişkisi bilinen listeler (üst ya da alt): motor bunları yeniden zincir keşfine sokmaz. @param {Nesne} o @returns {string[]} */
  const bilinenBagliListeler = (o) => [...new Set([...o.bagliUst.keys(), ...o.bagliUst.values()])];
  // ---- Tetik: metin alanına değer girilince beliren / dolan alan (sayfa-farki.mjs > tetikHedefleri) ----
  /**
   * Metin uygulamasının farkından tetik ilişkileri kaydedilir: hedef alan "kaynak girilince belirir / seçenekleri gelir" (veri durağında
   * gösterilir; kayıtta modele tetik olarak yazılır, normal koşu kaynağı doldurduktan sonra hedefin dolmasını / belirmesini bekler).
   * Bağlı liste zincirinin alt halkası (üstü de hedefse) tetik hedefi değildir. Döner: kaydedilen hedefler.
   * @param {Nesne} o @param {string} kaynak @param {import('./sayfa-farki.d.mts').SayfaFarki} f @returns {Array<{ hedef: string; olay: 'belirdi' | 'doldu' }>}
   */
  const tetikleriKaydet = (o, kaynak, f) => {
    const l = tetikHedefleri(f, kaynak, o.bagliUst).filter((t) => o.alanlar.has(t.hedef));
    for (const t of l) {
      const a = o.alanlar.get(t.hedef)?.alan;
      if (!a || (a.tetik && a.tetik.kaynak !== kaynak)) continue;
      a.tetik = { kaynak, olay: a.tetik?.olay === 'belirdi' ? 'belirdi' : t.olay };
    }
    return l;
  };
  /** Metin olarak yazılan (sayfaya tek başına uygulanabilen) alan mı: seçim / dosya değil. @param {Nesne} a */
  const metinAlaniMi = (a) => !['radio', 'checkbox', 'select', 'select-one', 'select-multiple', 'file'].includes(String(a.tur)) && !Array.isArray(a.secenekler) && doldurulabilir(a);
  /** Koşullu alanın görünürlük zincirindeki üst seçimleri (iç içe: alt seçim → üst seçim → …). @param {Nesne} o @param {string} anahtar @returns {string[]} */
  const kosulUstleri = (o, anahtar) => {
    const l = [];
    for (let u = o.alanlar.get(anahtar)?.alan?.kosul?.secim; u && !l.includes(u) && l.length < 10; u = o.alanlar.get(u)?.alan?.kosul?.secim) l.push(u);
    return l;
  };
  /** Bir alanın (doğrudan ya da dolaylı) üstleri. @param {Nesne} o @param {string} anahtar */
  const ustleri = (o, anahtar) => {
    const l = [];
    for (let u = o.bagliUst.get(anahtar); u && !l.includes(u) && l.length < 10; u = o.bagliUst.get(u)) l.push(u);
    return l;
  };
  /**
   * Doldurma / okumadan sonra: bilinen açılır listelerin seçenekleri sayfanın güncel okumasıyla tazelenir (bağlı liste üst seçilince dolar).
   * Seçenekleri değişen listeler döner. secimler: o anki seçim değerleri; degisen: bu doldurmada değeri değişen seçim alanları — tek
   * bir seçim değiştiyse ve seçenekleri değişen bir liste bağlı bilinmiyorsa, ona bağlı sayılır (genel gözlem; ad bilinmez).
   * @param {Nesne} o @param {Nesne} anlik @param {Record<string, string>} secimler @param {string[]} degisen @returns {string[]}
   */
  const secenekleriTazele = (o, anlik, secimler = {}, degisen = []) => {
    /** @type {string[]} */
    const degisenler = [];
    for (const yeni of anlik.alanlar) {
      if (yeni.tur !== 'select') continue;
      const kayit = o.alanlar.get(yeni.anahtar)?.alan;
      if (!kayit) continue;
      const imza = (/** @type {Nesne} */ a) => JSON.stringify(gercekSecenekler(a.secenekler).map((x) => x.deger));
      const once = imza(kayit);
      kayit.secenekler = yeni.secenekler;
      kayit.devreDisi = yeni.devreDisi;
      kayit.hazir = yeni.hazir;
      kayit.mevcut = yeni.mevcut;
      if (imza(kayit) === once) continue;
      degisenler.push(yeni.anahtar);
      if (!kayit.bagli && degisen.length === 1 && degisen[0] !== yeni.anahtar) bagliEkle(o, degisen[0], yeni.anahtar);
      // Belirsiz bağ: üstü seçilince seçenekleri geldi → bağ kesinleşir (modele bağımlılık olarak yazılır).
      if (o.belirsizBagli?.has(yeni.anahtar) && gercekSecenekler(yeni.secenekler).length) {
        o.belirsizBagli.delete(yeni.anahtar);
        gunluk(o, `“${alanAdi(o, yeni.anahtar)}” seçenekleri “${alanAdi(o, o.bagliUst.get(yeni.anahtar) ?? '')}” seçimine göre geldi: bağ kesinleşti.`);
      }
      // Tablolar için gözlem: bu listenin seçenekleri, üstlerinin o anki değerleriyle (çok düzeyli test verisi).
      const ustler = ustleri(o, yeni.anahtar);
      const l = gercekSecenekler(yeni.secenekler);
      if (l.length && ustler.every((u) => typeof secimler[u] === 'string')) {
        o.gozlemler.push({ anahtar: yeni.anahtar, secimler: Object.fromEntries(ustler.map((u) => [u, secimler[u]])), secenekler: l });
      }
      // Seçilmiş değer yeni listede yoksa (üst değişti) değer bırakılır: eski üstün alt seçeneği gönderilmez.
      const v = o.degerler[yeni.anahtar];
      if (v && typeof v.deger === 'string' && !degerBasvurusu(v.deger) && !l.some((x) => x.deger === v.deger || x.metin === v.deger)) {
        delete o.degerler[yeni.anahtar];
        gunluk(o, `“${alanAdi(o, yeni.anahtar)}” listesinin seçenekleri değişti; önceki değer artık listede yok, yeniden seçin.`);
      }
    }
    return degisenler;
  };
  /**
   * Sayfanın değerli okumasında (anlık: alanların o anki değeriyle) GÖRÜNEN bilinen alanların "sayfada hazır" bilgisi ve değeri tazelenir:
   * keşifte (seçim denenirken) görülen değer yerine sayfanın şimdiki değeri. Görünmeyen alana dokunulmaz. @param {Nesne} o @param {Nesne} anlik
   */
  const hazirTazele = (o, anlik) => {
    for (const yeni of Array.isArray(anlik?.alanlar) ? anlik.alanlar : []) {
      if (!nesneMi(yeni)) continue;
      // İkinci kez yazılan alan (kopya; aynı ekran kutusu) kaynağının okumasıyla tazelenir.
      const kayitlar = [o.alanlar.get(yeni.anahtar)?.alan, ...(o.kopyalar?.get(yeni.anahtar) ?? []).map((/** @type {string} */ k) => o.alanlar.get(k)?.alan)].filter(Boolean);
      for (const kayit of kayitlar) {
        kayit.hazir = yeni.hazir === true;
        kayit.mevcut = yeni.mevcut ?? null;
      }
    }
  };
  /**
   * Yeni beliren alanları adımda SAYFA SIRASINA yerleştirir (veri durağının listesi = ekran sırası): her yeni alan, sayfada kendinden önce
   * gelen ve adımda bulunan en yakın alanın hemen arkasına (onun koşullu alanlarından sonra) taşınır; kullanıcının taşıdığı diğer alanların
   * sırası değişmez. @param {Nesne} adim @param {string[]} yeniler @param {Nesne[]} sayfaAlanlari bu okumadaki alanlar (sayfa sırası)
   */
  const sayfaSirasinaYerlestir = (adim, yeniler, sayfaAlanlari) => {
    const sira = sayfaAlanlari.map((/** @type {Nesne} */ a) => a.anahtar);
    for (const k of yeniler) {
      const i = adim.alanlar.findIndex((/** @type {Nesne} */ a) => a.anahtar === k);
      const p = sira.indexOf(k);
      if (i < 0 || p < 0) continue;
      const [alan] = adim.alanlar.splice(i, 1);
      let konum = -1;
      for (let j = p - 1; j >= 0 && konum < 0; j--) konum = adim.alanlar.findIndex((/** @type {Nesne} */ a) => a.anahtar === sira[j]);
      if (konum < 0) {
        // Sayfada öncesinde bilinen alan yok: sayfada sonrasında gelen ilk bilinen alanın önüne.
        const sonra = sira.slice(p + 1).map((x) => adim.alanlar.findIndex((/** @type {Nesne} */ a) => a.anahtar === x)).find((x) => x >= 0);
        adim.alanlar.splice(sonra ?? adim.alanlar.length, 0, alan);
        continue;
      }
      const onceki = adim.alanlar[konum].anahtar;
      while (konum + 1 < adim.alanlar.length && adim.alanlar[konum + 1].kosul?.secim === onceki) konum++;
      adim.alanlar.splice(konum + 1, 0, alan);
    }
  };
  /** Veri durağından sonra: Hayır → düğme / mesaj seçimi; Evet + ilk adım + tek aday → basılır; diğerleri → "Şimdi ne yapayım?". @param {Nesne} o */
  const verilerTamam = (o) => {
    if (o.izin === 'hayir') { o.durum = 'hayirSecim'; return; }
    const adaylar = o.sonAnlik?.dugmeler ?? [];
    // Modeli güncellerken: bu adımın modeldeki düğmesi adaylardaysa (aynı seçici ya da yazı) kendiliğinden basılır ("Evet" izni; kayıt
    // oluşturabilecek düğmede sorulur). Bulunamazsa "Şimdi ne yapayım?" sorulur.
    if (o.izin === 'evet' && o.modelGuncelleme && o.ornek) {
      const a = modelDugmesi(o, adaylar);
      if (a && basmaKarari({ izin: o.izin, adaySayisi: 1, kullaniciSecti: true, sormadanBasma: Boolean(a.kayitOlusturabilir) }) === 'bas') {
        gunluk(o, `Modeldeki adım düğmesi “${a.metin ?? a.secici}”; basılıyor.`);
        basmayaBasla(o, { secici: a.secici, metin: a.metin, ...(a.cerceve?.length ? { cerceve: a.cerceve } : {}) });
        return;
      }
    }
    if (o.izin === 'evet' && o.basisNo === 0) {
      const a = tekAday(adaylar, o.cumle.dugmeler);
      if (a && basmaKarari({ izin: o.izin, adaySayisi: 1, sormadanBasma: Boolean(o.modelGuncelleme && a.kayitOlusturabilir) }) === 'bas') {
        gunluk(o, `Evet izni: tek aday “${a.metin ?? a.secici}”; basılıyor.`);
        basmayaBasla(o, { secici: a.secici, metin: a.metin, ...(a.cerceve?.length ? { cerceve: a.cerceve } : {}) });
        return;
      }
    }
    o.durum = 'karar';
  };
  /**
   * Bu adımın modeldeki (ekranın kendi adımları; genel senaryo adımları hariç) ilk tıklama aksiyonuna uyan aday: seçici aynı ya da yazı aynı.
   * @param {Nesne} o @param {Nesne[]} adaylar @returns {Nesne | null}
   */
  const modelDugmesi = (o, adaylar) => {
    const model = o.ornek?.model;
    const adimlar = (Array.isArray(model?.adimlar) ? model.adimlar : []).filter((/** @type {Nesne} */ a) => nesneMi(a) && !nesneMi(a.ortakAkis));
    const adim = adimlar[o.adimlar.length - 1];
    const aksiyon = (nesneMi(adim?.kosu) && Array.isArray(adim.kosu.aksiyonlar) ? adim.kosu.aksiyonlar : []).find((/** @type {Nesne} */ x) => nesneMi(x) && x.tur === 'tikla' && typeof x.secici === 'string');
    if (!aksiyon) return null;
    const yazi = (/** @type {unknown} */ m) => String(m ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
    const hedefYazi = yazi(aksiyon.metin ?? aksiyon.aciklama);
    return adaylar.find((/** @type {Nesne} */ x) => x.secici === aksiyon.secici) ?? (hedefYazi ? adaylar.find((/** @type {Nesne} */ x) => yazi(x.metin) === hedefYazi) : null) ?? null;
  };
  /** @param {Nesne} o @param {{ secici: string; metin: string | null }} d */
  const basmayaBasla = (o, d) => {
    // Basıştan önce ekranda olan metinler: bitiş adımında "Sayfayı yeniden tara" yalnız bunlardan SONRA beliren metinleri ekler.
    o.basOncesiMetinler = new Set((o.sonAnlik?.metinler ?? []).map((/** @type {Nesne} */ m) => m.metin));
    o.basiliyor = d;
    o.devamAlanlari = null;
    o.tekrarBekleyen = {};
    o.durum = 'calisiyor';
    o.calisiyor = `“${d.metin ?? d.secici}” düğmesine basıldı; sayfa izleniyor…`;
    o.farkOncesi = Array.isArray(o.sonAnlik?.alanlar) ? o.sonAnlik.alanlar : [];
    // Örnek senaryoyla (ekran modelden / senaryodan biliniyor) basıştan sonra yerinde keşif yapılmaz (keşifsiz).
    gonder(o, { tur: 'bas', secici: d.secici, metin: d.metin, ...(d.cerceve?.length ? { cerceve: d.cerceve } : {}), bilinenBagli: bilinenBagliListeler(o), ...(o.ornek ? { kesifsiz: true } : {}) });
  };
  /** Basıştan sonra (hata sorusu yanıtlandıysa): yeni alanlar → yeni adım + veri durağı; yoksa yeni (alansız) adım + karar. @param {Nesne} o */
  const basistanSonra = (o) => {
    const f = o.sonFark;
    const adim = { alanlar: [], bas: null, okumalar: [] };
    o.adimlar.push(adim);
    o.duzeltAdimi = null;
    for (const a of f.yeniAlanlar.filter(doldurulabilir)) alanEkle(o, a, adim, true);
    // Basıştan sonra beliren seçim alanlarının keşfi: içlerindeki koşullu alanlar bu adıma eklenir.
    if (Array.isArray(o.sonKesif) && o.sonKesif.length) { kosulluAlanlariEkle(o, adim, o.sonKesif, f.anlik?.alanlar ?? []); o.sonKesif = []; }
    adim.okumalar.push({ gorunen: f.anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar), secimler: {} });
    if (adim.alanlar.length) veriDuragi(o, `${adim.alanlar.length} yeni alan belirdi; değerlerini girin.`);
    else o.durum = 'karar';
  };

  // ---- Keşif basışları (akışın parçası değil; kaydedilen senaryoya girmez) ----
  /**
   * Keşif kuyruğu: onay verilmiş düğmeye ve Evet izninde sonucundan emin olunan (yalnız sayfa içinde bir şey açan) düğmeye sorulmadan
   * basılır. Kalanlar (Bana sor'da hepsi; Evet'te emin olunmayanlar: form gönderen ya da yalnız betikle çalışan) TEK toplu kartta sorulur
   * ("Keşif için şu düğmelere basılabilir": her biri için onay kutusu). Kuyruk bitince akış bugünkü gibi sürer (veri durağı / karar).
   * @param {Nesne} o
   */
  const kesifBasisiSurdur = (o) => {
    const kuyruk = Array.isArray(o.kesifDugmeKuyrugu) ? o.kesifDugmeKuyrugu : [];
    const i = kuyruk.findIndex((/** @type {Nesne} */ d) => d.onayli === true || (o.izin === 'evet' && d.emin === true));
    if (i >= 0) { const [d] = kuyruk.splice(i, 1); kesifBasmayaBasla(o, d); return; }
    const sorulacak = kuyruk.filter((/** @type {Nesne} */ d) => d.soruldu !== true);
    // Örnek senaryoyla (modeli güncelleme / testi düzenleme) keşif düğmeleri sorulmaz ve basılmaz: ekran senaryodan biliniyor; akış
    // kendiliğinden sürsün (veri durağı da kendiliğinden geçilir).
    if (sorulacak.length && o.ornek) gunluk(o, `Örnek senaryo var: keşif düğmelerine basılmadı (${sorulacak.map((d) => `“${d.metin ?? d.secici}”`).join(', ')}).`);
    else if (sorulacak.length) {
      o.kesifOnayListesi = sorulacak;
      o.durum = 'kesifOnay';
      o.calisiyor = null;
      return;
    }
    o.kesifDugmeKuyrugu = [];
    o.kesifOnayListesi = null;
    const adim = guncelAdim(o);
    if (adim?.alanlar.length) veriDuragi(o); else verilerTamam(o);
  };
  /** @param {Nesne} o @param {Nesne} d */
  const kesifBasmayaBasla = (o, d) => {
    o.kesifBasiliyor = d;
    o.kesifOnayListesi = null;
    o.durum = 'calisiyor';
    o.calisiyor = `Keşif: “${d.metin ?? d.secici}” düğmesine basıldı; sayfada ne açıldığına bakılıyor (yazma istekleri engellenir; kaydedilen senaryoya girmez)…`;
    gunluk(o, `Keşif: “${d.metin ?? d.secici}” düğmesine basılıyor (${d.emin ? `${d.neden}; sorulmadan` : 'onay verildi'}).`);
    gonder(o, { tur: 'kesifBas', secici: d.secici, metin: d.metin ?? null, ...(Array.isArray(d.cerceve) && d.cerceve.length ? { cerceve: d.cerceve } : {}) });
  };
  /**
   * Keşif basışının sonucu: değişiklik özeti günlüğe ve keşif notlarına ("“X”e basınca 3 yeni alan açıldı: …"); beliren seçimlerin keşfi
   * özetlenir. Basış akışa (adımlara) yazılmaz. Sayfa ilk durumuna döndürülemediyse açıkça söylenir. @param {Nesne} o @param {Nesne} e
   */
  const kesifBasisiniIsle = (o, e) => {
    const d = o.kesifBasiliyor ?? { secici: '?', metin: null };
    o.kesifBasiliyor = null;
    const ad = `“${d.metin ?? d.secici}”`;
    const f = nesneMi(e.fark) ? e.fark : null;
    const yeniAlanlar = (Array.isArray(f?.yeniAlanlar) ? f.yeniAlanlar : []).filter((/** @type {Nesne} */ a) => nesneMi(a) && doldurulabilir(a));
    const kaybolan = Array.isArray(f?.kaybolanAlanlar) ? f.kaybolanAlanlar.length : 0;
    const pencere = (Array.isArray(f?.pencereler) ? f.pencereler.length : 0) + (Array.isArray(f?.diyaloglar) ? f.diyaloglar.length : 0);
    const metinSayisi = Array.isArray(f?.yeniMetinler) ? f.yeniMetinler.length : 0;
    const kesifler = Array.isArray(e.kesifler) ? e.kesifler.filter((/** @type {Nesne} */ k) => nesneMi(k) && typeof k.secim === 'string') : [];
    const adlar = yeniAlanlar.map((/** @type {Nesne} */ a) => a.etiket ?? adsizEtiket(a));
    const parcalar = [
      yeniAlanlar.length ? `${yeniAlanlar.length} yeni alan açıldı (${adlar.slice(0, 8).join(', ')})` : '',
      kaybolan ? `${kaybolan} alan gizlendi` : '',
      kesifler.length ? `${kesifler.length} yeni seçim denendi` : '',
      pencere ? 'pencere açıldı' : '',
      metinSayisi ? `${metinSayisi} yeni metin göründü` : ''
    ].filter(Boolean);
    const ozetMetni = e.hata ? `Keşif: ${ad} düğmesine basılamadı: ${String(e.hata).slice(0, 200)}`
      : `Keşif: ${ad} düğmesine basınca ${parcalar.length ? parcalar.join('; ') : 'sayfada görünür bir değişiklik olmadı'}.`;
    (o.kesifBasislari ??= []).push({ dugme: d.metin ?? d.secici, yeniAlanlar: adlar, kesifler, geriDondu: e.geriDondu === true, hata: e.hata ?? null });
    (o.kesifNotlari ??= []).push(ozetMetni);
    gunluk(o, ozetMetni);
    if (nesneMi(e.anlik)) { o.sonAnlik = e.anlik; o.sonGoruntu = e.anlik.goruntu ?? o.sonGoruntu; }
    if (e.geriDondu !== true) {
      const n = `Sayfa ${ad} basışından önceki durumuna döndürülemedi; keşif ve akış sayfanın şimdiki durumundan sürüyor.`;
      o.kesifNotlari.push(n);
      gunluk(o, n);
    }
    kesifBasisiSurdur(o);
  };

  // ---- Alt sürecin olayları ----
  /** @param {Nesne} o @param {Nesne} e */
  function olayIsle(o, e) {
    o.sonErisim = simdi();
    if (e.olay === 'isBitti') {
      o.isBitti = true;
      o.tarayici = 'kapali';
      if (['kaydedildi', 'iptal', 'hata', 'askida'].includes(o.durum)) return;
      const h = nesneMi(e.hata) ? e.hata : null;
      const neden = { kod: String(h?.kod ?? 'SUREC'), mesaj: String(h?.mesaj ?? 'Nöbetçi taraması tarayıcısı kapandı.') };
      // Kaydet aşaması tarayıcı gerektirmez: oturum ve kayıt düğmesi çalışmaya devam eder.
      if (o.durum === 'kaydet') { o.bekleyen = null; return; }
      if (o.durum === 'dogrulama') {
        o.bekleyen = null;
        o.calisiyor = null;
        o.yenidenAcma = null;
        o.dogrulama = { durum: 'basarisiz', mesaj: `Doğrulama koşusu tamamlanamadı: ${neden.mesaj}`, gorulen: [] };
        dogrulamaAdimlariniKapat(o, false);
        o.durum = 'kaydet';
        return;
      }
      // Keşif bitmeden kapandı: toplanan bir şey yok.
      if (!o.adimlar.length) { o.durum = 'hata'; o.hata = neden; return; }
      // Toplananlar (zincir adımları, değerler, etiketler, düğme zinciri, bitiş) KAYBOLMAZ: oturum askıya alınır.
      askiyaAl(o, neden);
      return;
    }
    // Keşif sonucu yalnız giriş ve bağlam değiştirme başarıyla bittikten sonra gelir (motor bağlamı sayfayı açmadan önce uygular; hata
    // olursa iş bağlam hatasıyla biter): seçilen bağlam bu tarayıcıda uygulanmıştır.
    if (e.olay === 'kesif' && o.baglamProfili && !o.baglamUygulandi) {
      o.baglamUygulandi = true;
      gunluk(o, `Bağlam: ${o.baglamProfili.tur} = ${o.baglamProfili.ad} uygulandı.`);
    }
    if (e.olay === 'kesif' && o.yenidenAcma) {
      // Tarayıcı yeniden açıldı (keşif yapılmadı): zincir tekrar yürütülür ya da doğrulama koşusu başlar.
      const anlik = e.anlik;
      o.sonAnlik = anlik;
      o.sonGoruntu = anlik.goruntu ?? o.sonGoruntu;
      o.sayfaUyarisi = sayfaUyarisi(o.hedefYol, anlik.yol);
      if (o.yenidenAcma.amac === 'dogrula') { o.yenidenAcma = null; dogrulamaGonder(o); return; }
      const adimlar = yenidenKurPlani(o);
      if (!adimlar.length) { yenidenKurBitti(o); return; }
      o.calisiyor = 'Tarayıcı yeniden açıldı; zincir tekrar yürütülüyor…';
      gonder(o, { tur: 'dogrula', plan: { adimlar, bitis: { bitti: [], devam: [], hata: [], adres: null }, zamanAsimiSn: 1, yenidenKur: true } });
      o.bekleyen.tur = 'yenidenKur';
      return;
    }
    if (e.olay === 'kesif') {
      const anlik = e.anlik;
      o.kesifAnlik = { ...anlik, goruntu: null };
      for (const m of anlik.metinler ?? []) o.onceGorunenler.add(m.metin);
      o.sonAnlik = anlik;
      o.sonGoruntu = anlik.goruntu ?? null;
      o.baslik = anlik.baslik ?? '';
      o.calisiyor = null;
      // İstenen sayfa açılmadıysa (site başka sayfaya yönlendirdi) sessizce devam edilmez: kullanıcıya uyarı gösterilir.
      o.sayfaUyarisi = sayfaUyarisi(o.hedefYol, anlik.yol);
      if (o.sayfaUyarisi) gunluk(o, `Uyarı: istenen sayfa açılmadı; ${anlik.yol} açık.`);
      const adim = { alanlar: [], bas: null, okumalar: [{ gorunen: anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar), secimler: {} }] };
      o.adimlar = [adim];
      // Bağlı liste zinciri (zincir-motoru.ts): ilişkiler alanlara "bagli" olarak, gözlemler tablolara, bulgular kullanıcıya.
      const z = nesneMi(e.zincir) ? e.zincir : null;
      o.kesifAdlari = new Map(anlik.alanlar.map((/** @type {Nesne} */ a) => [a.anahtar, a.etiket ?? a.anahtar]));
      for (const i of Array.isArray(z?.iliskiler) ? z.iliskiler : []) if (typeof i.ust === 'string' && typeof i.alt === 'string') bagliEkle(o, i.ust, i.alt);
      // Keşifte kesinleşmeyen bağlar (denenen üst değerlerde seçenek gelmedi): veri durağında yine "↓ … seçeneklerini getir" gösterilir;
      // Devam'ı kilitlemez, seçenek gelirse kesinleşir; kesinleşmezse modele bağımlılık olarak yazılmaz.
      for (const i of Array.isArray(z?.belirsizler) ? z.belirsizler : []) {
        if (typeof i?.ust !== 'string' || typeof i?.alt !== 'string' || o.bagliUst.has(i.alt)) continue;
        bagliEkle(o, i.ust, i.alt);
        o.belirsizBagli.add(i.alt);
      }
      for (const g of Array.isArray(z?.gozlemler) ? z.gozlemler : []) if (nesneMi(g) && typeof g.anahtar === 'string') o.gozlemler.push(g);
      for (const [k, l] of Object.entries(nesneMi(z?.sureler) ? z.sureler : {})) if (Array.isArray(l)) (o.yuklenme[k] ??= []).push(...l.filter((x) => Number.isFinite(x)));
      for (const a of anlik.alanlar.filter(doldurulabilir)) alanEkle(o, a, adim, false);
      for (const b of Array.isArray(z?.bulgular) ? z.bulgular : []) o.bulgular.push(bulguMetni(b, (k) => alanAdi(o, k)));
      const tabanSayisi = adim.alanlar.length;
      kosulluAlanlariEkle(o, adim, Array.isArray(e.kesifler) ? e.kesifler : [], anlik.alanlar);
      // Seçimle beliren (koşullu) alan da bağlı liste olabilir (ör. marka seçilince beliren model listesi).
      for (const [alt, ust] of o.bagliUst) { const a = o.alanlar.get(alt)?.alan; if (a && !a.bagli) a.bagli = { ust }; }
      const kosullu = adim.alanlar.length - tabanSayisi;
      gunluk(o, `Keşif: ${tabanSayisi} alan${kosullu ? ` + seçimlere bağlı ${kosullu} alan` : ''}, ${anlik.dugmeler.length} düğme adayı; hiçbir düğmeye basılmadı.`);
      // Seçim keşfi gerçek sayfada seçimleri tek tek değiştirir (düğmeye basılmaz): kullanıcıya açıkça söylenir.
      const denenen = (Array.isArray(e.kesifler) ? e.kesifler : []).reduce((t, k) => t + (Array.isArray(k?.degerler) ? k.degerler.length : 0), 0);
      if (denenen) {
        o.kesifNotlari = [`Keşifte ${denenen} seçim değeri sayfada tek tek denendi (hiçbir düğmeye basılmadı); seçim değişince sayfanın kendi sorguları (ör. bağlı liste) gitmiş olabilir. Sayfa sonra ilk durumuna döndürüldü.`];
        gunluk(o, o.kesifNotlari[0]);
      }
      if (o.bagliUst.size) {
        const zincir = zincirMetni([...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), (k) => alanAdi(o, k));
        gunluk(o, `Bağlı listeler: ${zincir.join('; ')}${z ? ` (${z.acilis} kez açılıp ${z.secim} seçim denendi)` : ''}. Veri durağında üstten alta sırayla sorulur.`);
      }
      if (o.bulgular.length) gunluk(o, `Bağlı liste bulguları: ${o.bulgular.length} (aşağıda “Bulgular”).`);
      // Kesin olmayan durumlar (seçilemeyen değer, bütçe sınırı…): bulgu değil, not.
      for (const n of (Array.isArray(z?.notlar) ? z.notlar : []).slice(0, 8)) gunluk(o, `Bağlı liste notu: ${String(n)}`);
      // Keşifte basılabilecek düğmeler (sayfada bir şey gösterebilecek): basma iznine göre basılır / sorulur; Hayır'da hiç.
      // Kullanıcının cümlesinde adı geçen düğme akışta basılacağı için keşifte denenmez (adlar kullanıcının kendi cümlesinden).
      const cumledeki = new Set((o.cumle?.dugmeler ?? []).map((/** @type {string} */ x) => katla(String(x))));
      o.kesifDugmeKuyrugu = o.izin === 'hayir' ? [] : (Array.isArray(e.kesifDugmeleri) ? e.kesifDugmeleri : [])
        .filter((/** @type {Nesne} */ d) => nesneMi(d) && typeof d.secici === 'string' && !(d.metin && cumledeki.has(katla(String(d.metin)))))
        .map((/** @type {Nesne} */ d) => ({ ...d })).slice(0, 20);
      kesifBasisiSurdur(o);
      return;
    }
    // Süren komutun ilerlemesi (doldurma / doğrulama koşusu): komut bitmez, yalnız "şu an ne yapılıyor" ve doğrulamanın adım durumu güncellenir.
    if (e.olay === 'ilerleme') {
      if (!o.bekleyen || e.no !== o.bekleyen.no) return;
      const m = metin(e.mesaj, 300);
      if (o.bekleyen.tur === 'dogrula') {
        if (m) o.calisiyor = `Doğrulama koşusu — ${m}`;
        const adim = Number(e.adim);
        if (Array.isArray(o.dogrulamaAdimlari) && Number.isInteger(adim)) {
          // adim 0: sayfa açılıyor; 1..n: planın adımı; n+1: bitiş koşulu (listenin son satırı). Öncekiler tamam, bu sürüyor.
          o.dogrulamaAdimlari.forEach((/** @type {Nesne} */ x, /** @type {number} */ i) => { x.durum = i + 1 < adim ? 'tamam' : i + 1 === adim ? 'suruyor' : 'bekliyor'; });
          const suren = o.dogrulamaAdimlari[adim - 1];
          if (suren && m) suren.ayrinti = m;
        }
      } else if (o.bekleyen.tur === 'yenidenKur') {
        if (m) o.calisiyor = `Tarayıcı yeniden açıldı; zincir tekrar yürütülüyor — ${m}`;
      } else if (m) o.calisiyor = m;
      return;
    }
    // Bana sor: basış sırasında sayfa onay / soru penceresi açtı (komut sürer; yanıt /diyalog ucuyla gider).
    if (e.olay === 'diyalog') {
      if (!o.bekleyen || e.no !== o.bekleyen.no) return;
      const tur = ['alert', 'confirm', 'prompt', 'beforeunload'].includes(String(e.tur)) ? String(e.tur) : 'confirm';
      o.diyalogSorusu = { tur, mesaj: metin(e.mesaj, 300) ?? '', dugme: o.basiliyor ?? null };
      o.durum = 'diyalog';
      o.calisiyor = null;
      gunluk(o, `Sayfa ${tur === 'prompt' ? 'soru' : 'onay'} penceresi açtı: “${o.diyalogSorusu.mesaj}”; yanıtınız bekleniyor.`);
      return;
    }
    if (!o.bekleyen || e.no !== o.bekleyen.no) return;
    const bekleyen = o.bekleyen;
    o.bekleyen = null;
    o.calisiyor = null;
    o.diyalogSorusu = null;
    if (e.olay === 'hata') {
      o.sonHata = String(e.mesaj ?? '').slice(0, 500);
      gunluk(o, `Hata: ${o.sonHata}`);
      if (bekleyen.tur === 'yenidenKur') { yenidenKurulamadi(o, o.sonHata); return; }
      if (bekleyen.tur === 'doldur') { o.zincirIstegi = null; o.kosulIstegi = null; o.metinIstegi = null; o.farkOncesi = null; o.sonGonderilen = {}; veriDuragi(o); }
      // Doğrulama bitti (kaydet aşaması tarayıcı gerektirmez): tarayıcı kapatılır.
      else if (bekleyen.tur === 'dogrula') { o.dogrulama = { durum: 'basarisiz', mesaj: o.sonHata, gorulen: [] }; dogrulamaAdimlariniKapat(o, false); o.durum = 'kaydet'; tarayiciyiKapat(o); }
      else if (bekleyen.tur === 'secimAc' && o.bitisSecimi) { o.bitisSecimi = null; o.durum = 'bitis'; }
      else if (bekleyen.tur === 'kesifBas') { o.kesifBasiliyor = null; kesifBasisiSurdur(o); }
      else o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      return;
    }
    o.sonHata = null;
    if (e.olay === 'kesifBasildi') { kesifBasisiniIsle(o, e); return; }
    if (e.olay === 'dolduruldu') {
      o.sonAnlik = e.anlik;
      yerindeZinciriIsle(o, e.zincir, e.anlik.alanlar ?? []);
      // Yerinde zincir isteği ("↓ … seçeneklerini getir"): bu doldurmanın amacı (bir kez kullanılır).
      const zincirIstegi = o.zincirIstegi ?? null;
      o.zincirIstegi = null;
      for (const [k, ms] of Object.entries(nesneMi(e.beklemeler) ? e.beklemeler : {})) if (Number.isFinite(ms)) (o.yuklenme[k] ??= []).push(Number(ms));
      o.alanHatalari = Object.fromEntries((e.hatalar ?? []).map((/** @type {Nesne} */ h) => [h.anahtar, h.mesaj]));
      // Sayfaya uygulanan değerler: bağlı listenin gösterilen seçenekleri hangi üst değere göre geldi (yerinde düğmenin "geldi" durumu).
      // Üst sayfada yeniden seçilince altları sayfada boşalır: bu doldurmada gönderilmeyen altların uygulanan değeri düşer.
      const gonderilen = o.sonGonderilen ?? {};
      o.sonGonderilen = {};
      // Yeniden okuma farkı (uygulamadan önceki okumaya göre): beliren / kaybolan alanlar, dolan / değişen listeler, etkinleşen / kilitlenen
      // alanlar, sayfanın doldurduğu değerler (Nöbetçi'nin yazdıkları hariç).
      const sf = sayfaFarki(Array.isArray(o.farkOncesi) ? o.farkOncesi : [], e.anlik.alanlar ?? [], Object.keys(gonderilen).map((k) => { const a = o.alanlar.get(k)?.alan; return a ? sayfaAnahtari(a) : k; }));
      o.farkOncesi = null;
      const metinIstegi = zincirIstegi && o.metinIstegi?.anahtar === zincirIstegi ? o.metinIstegi : null;
      o.metinIstegi = null;
      for (const [k, v] of Object.entries(gonderilen)) {
        if (o.alanHatalari[k]) { delete o.uygulanan[k]; continue; }
        o.uygulanan[k] = v;
        for (const [alt] of o.bagliUst) if (!(alt in gonderilen) && ustleri(o, alt).includes(k)) delete o.uygulanan[alt];
      }
      const adim = guncelAdim(o);
      const gorunen = new Set(e.anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar));
      // Koşullu alanlar: doldurunca beliren yeni alanlar aynı adıma; kaybolanlar adımdan çıkar (değerleri senaryoya yazılmaz).
      /** @type {string[]} */
      const yeniler = [];
      for (const a of e.anlik.alanlar.filter(doldurulabilir)) {
        if (!o.alanlar.has(a.anahtar)) { alanEkle(o, a, adim, true); yeniler.push(a.anahtar); }
      }
      sayfaSirasinaYerlestir(adim, yeniler, e.anlik.alanlar);
      hazirTazele(o, e.anlik);
      const yeni = yeniler.length;
      // "Önce bunu seçin" isteği: seçim sayfaya uygulandı ve sayfa sakinleşti. Beliren alanlar bu seçimin değerinde, kaybolan (koşulsuz
      // bilinen) alanlar önceki değerinde görünür sayılır (gözlem); bilinen koşullu alanların değer listesi de gözleme göre düzeltilir.
      const kosulIstegi = zincirIstegi && o.kosulIstegi?.anahtar === zincirIstegi ? o.kosulIstegi : null;
      o.kosulIstegi = null;
      // Etiketler sayfadan tazelenir (seçim uygulandıysa aynı alanın adı değişmiş olabilir: "Kimlik no" → "Vergi no").
      const tazeIstek = kosulIstegi && !o.alanHatalari[zincirIstegi] ? {
        anahtar: zincirIstegi, onceki: kosulIstegi.onceki === null || kosulIstegi.onceki === undefined ? null : String(kosulIstegi.onceki),
        secilen: String(o.degerler[zincirIstegi]?.deger ?? '')
      } : null;
      etiketleriTazele(o, e.anlik, tazeIstek);
      // Düzenlenebilirlik de sayfadan tazelenir (salt okuma): seçim uygulanınca alan kilitlenmiş / açılmış olabilir.
      kilitleriTazele(o, e.anlik, tazeIstek);
      // Yazılan değeri tutmayan, sayfanın ESKİ değerini geri yazdığı alanlar: bu seçimde sayfa dolduruyor (düzenlenemez kanıtı; hata değil).
      for (const k of Array.isArray(e.kilitliler) ? e.kilitliler : []) {
        const a = typeof k === 'string' ? o.alanlar.get(k)?.alan : null;
        if (!a) continue;
        const v = a.kilitKosulu ? sayfadakiDeger(o, a.kilitKosulu.secim) : null;
        if (a.kilitKosulu && v !== null) a.kilitKosulu.kilitli[v] = true; else a.kilitKanit = true;
        delete o.uygulanan[k];
        gunluk(o, `“${alanAdi(o, k)}”: yazılan değer tutmadı, sayfa önceki değeri geri yazdı; bu alanı sayfa dolduruyor, değiştirilemez (yazılmadı).`);
      }
      if (kosulIstegi && !o.alanHatalari[zincirIstegi]) {
        const secilen = String(o.degerler[zincirIstegi]?.deger ?? '');
        adim.kosullar ??= {};
        const kosulYaz = (/** @type {Nesne} */ a, /** @type {string[]} */ degerler) => { a.kosul = { secim: zincirIstegi, degerler }; adim.kosullar[a.anahtar] = a.kosul; };
        for (const k of yeniler) { const a = o.alanlar.get(k)?.alan; if (a && !a.kosul && k !== zincirIstegi) kosulYaz(a, [secilen]); }
        for (const a of adim.alanlar) {
          if (a.anahtar === zincirIstegi) continue;
          if (!a.kosul && !gorunen.has(sayfaAnahtari(a)) && kosulIstegi.onceki !== null) kosulYaz(a, [kosulIstegi.onceki]);
          else if (a.kosul?.secim === zincirIstegi && gorunen.has(sayfaAnahtari(a)) && !a.kosul.degerler.includes(secilen)) kosulYaz(a, [...a.kosul.degerler, secilen]);
          else if (a.kosul?.secim === zincirIstegi && !gorunen.has(sayfaAnahtari(a)) && a.kosul.degerler.includes(secilen) && a.kosul.degerler.length > 1) kosulYaz(a, a.kosul.degerler.filter((/** @type {string} */ x) => x !== secilen));
        }
      }
      // Yerinde keşif (doldurunca beliren, keşifte bilinmeyen seçimler; iç içe dahil): koşullu / adı değişen alanlar ilk keşifle aynı kuralla.
      const yerindeKesifler = Array.isArray(e.kesifler) ? e.kesifler.filter((/** @type {Nesne} */ k) => nesneMi(k) && typeof k.secim === 'string') : [];
      if (yerindeKesifler.length) {
        kosulluAlanlariEkle(o, adim, yerindeKesifler, e.anlik.alanlar ?? []);
        const n = yerindeKesifler.reduce((t, k) => t + (Array.isArray(k.degerler) ? k.degerler.length : 0), 0);
        gunluk(o, `Yerinde keşif: ${yerindeKesifler.map((k) => `“${alanAdi(o, k.secim)}”`).join(', ')} seçimlerinin ${n} değeri sayfada denendi (hiçbir düğmeye basılmadı); seçimler ilk değerlerine döndü.`);
      }
      adim.alanlar = adim.alanlar.filter((/** @type {Nesne} */ a) => a.kosul || gorunen.has(sayfaAnahtari(a)));
      const secimler = Object.fromEntries(adim.alanlar.filter((/** @type {Nesne} */ a) => ['select', 'radio'].includes(String(a.tur)) && typeof o.degerler[a.anahtar]?.deger === 'string'
        && !degerBasvurusu(o.degerler[a.anahtar].deger) && (!zincirIstegi || o.uygulanan[a.anahtar] === o.degerler[a.anahtar].deger))
        .map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
      // (Yerinde zincir isteğinde yalnız sayfaya uygulanmış seçimler okunur; girilip henüz gönderilmeyenler sayfada yoktur.)
      // Koşullu alan: doldurmada YALNIZ BİR seçim alanı değiştiyse, beliren alan o seçimin bu değerinde görünür sayılır (gözlem; tek
      // değişiklik yoksa koşul yazılmaz — akış kaydının okuma kuralı dener).
      const onceki = adim.okumalar.length ? adim.okumalar[adim.okumalar.length - 1].secimler : {};
      const degisen = Object.keys(secimler).filter((k) => onceki[k] !== secimler[k]);
      // Bağlı listeler: üst seçilince alt listenin seçenekleri geldi mi? (Değeri henüz girilmemiş, sayfada hazır gelmeyen listeler sorulur.)
      // Üstü bu turda doldurulan, değeri boş bağlı listeler de (seçenekleri değişmemiş olsa bile: aynı seçenekler yeniden gelmiş olabilir) sorulur.
      const yuklenen = [...new Set([...secenekleriTazele(o, e.anlik, secimler, degisen), ...(o.sorulacakBagli ?? [])])]
        .filter((k) => !o.degerler[k] && adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === k && kosulAktif(o, a) && !a.hazir && !a.devreDisi && gercekSecenekler(a.secenekler).length));
      o.sorulacakBagli = [];
      if (yeniler.length && degisen.length === 1) {
        adim.kosullar ??= {};
        for (const k of yeniler) adim.kosullar[k] = { secim: degisen[0], degerler: [secimler[degisen[0]]] };
      }
      adim.okumalar.push({ gorunen: [...gorunen], secimler });
      if (Object.keys(o.alanHatalari).length) { veriDuragi(o, 'Bazı alanlar doldurulamadı.'); return; }
      for (const m of e.yeniMetinler ?? []) gorulenEkle(o, m.metin, m.tur);
      // Doldururken sayfa hata gösterdiyse (ör. alandan çıkınca gelen doğrulama uyarısı) sessizce ilerlenmez: kullanıcıya sorulur.
      const sayfaHatalari = (e.yeniMetinler ?? []).filter((/** @type {Nesne} */ m) => m.tur === 'hata').map((/** @type {Nesne} */ m) => m.metin);
      // Metin uygulaması (yazılıp alandan çıkıldı): aynı veri durağına dönülür; farkın özeti not olur ("“Kod” girilince “Marka” listesi
      // doldu; …"). Metin girilince beliren / dolan alan tetik olarak kaydedilir (zincirin alt halkası hariç).
      if (metinIstegi) {
        const kaynakAdi = alanAdi(o, metinIstegi.anahtar);
        const tetikler = tetikleriKaydet(o, metinIstegi.anahtar, sf);
        const ozet = farkOzeti(sf, { neden: `“${kaynakAdi}” girilince`, ad: (k) => alanAdi(o, k) }) || `“${kaynakAdi}” sayfaya uygulandı; sayfada başka bir değişiklik olmadı.`;
        const parcalar = [ozet, sayfaHatalari.length ? `Sayfa uyarı gösterdi: ${sayfaHatalari.slice(0, 3).join(' · ')}` : ''].filter(Boolean).join(' ');
        gunluk(o, parcalar);
        if (tetikler.length) gunluk(o, `Tetik: ${tetikler.map((t) => `“${alanAdi(o, t.hedef)}” ${t.olay === 'belirdi' ? 'belirir' : 'dolar'}`).join(', ')} — “${kaynakAdi}” girilince (normal koşu bunu bekler).`);
        veriDuragi(o, parcalar);
        return;
      }
      // Yerinde zincir isteği: her durumda aynı veri durağına dönülür (düğmeye basılmaz, eksik sorulmaz); sayfa uyarısı not olur.
      if (zincirIstegi && kosulIstegi) {
        const k = o.alanlar.get(zincirIstegi)?.alan;
        const secilen = String(o.degerler[zincirIstegi]?.deger ?? '');
        const metni = (k?.tur === 'radio' ? (k.radyolar ?? []) : (k?.secenekler ?? [])).find((/** @type {Nesne} */ x) => String(x.deger) === secilen)?.metin
          ?? (k?.tur === 'checkbox' ? (secilen === 'true' ? 'işaretli' : 'işaretsiz') : secilen);
        // Değişiklik özeti (önceki değere göre): açılan alanlar, gizlenen alanlar, etiketi değişen alanlar ("eski ad → yeni ad").
        const once = kosulIstegi.onceki === null || kosulIstegi.onceki === undefined ? null : String(kosulIstegi.onceki);
        const bagliAlanlar = adim.alanlar.filter((/** @type {Nesne} */ a) => a.kosul?.secim === zincirIstegi);
        const acilan = bagliAlanlar.filter((/** @type {Nesne} */ a) => kosulAktif(o, a) && (once === null || !a.kosul.degerler.includes(once)));
        const gizlenen = bagliAlanlar.filter((/** @type {Nesne} */ a) => !a.kosul.degerler.includes(secilen) && (once === null || a.kosul.degerler.includes(once)));
        const adlar = (/** @type {Nesne[]} */ l) => l.map((a) => degerEtiketi(a, secilen) ?? alanAdi(o, a.anahtar)).join(', ');
        const yeniAdlar = adim.alanlar.filter((/** @type {Nesne} */ a) => a.etiketKosulu?.secim === zincirIstegi && kosulAktif(o, a))
          .flatMap((/** @type {Nesne} */ a) => {
            const [x, y] = [degerEtiketi(a, once), degerEtiketi(a, secilen)];
            const [n1, n2] = [degerEnCok(a, once), degerEnCok(a, secilen)];
            const uzunluk = n1 !== n2 && n2 !== null ? ` (en çok ${n2} karakter)` : '';
            if (x && y && x !== y) return [`${x} → ${y}${uzunluk}`];
            return uzunluk ? [`${y ?? alanAdi(o, a.anahtar)}: en çok ${n2} karakter`] : [];
          });
        // Düzenlenebilirliği değişen alanlar: bu seçimde sayfanın doldurduğu (kilitlenen) ve yeniden düzenlenebilir olan alanlar.
        const kilitli = (/** @type {Nesne} */ a, /** @type {string | null} */ v) => v !== null && a.kilitKosulu?.kilitli?.[v] === true;
        const kilitBagli = adim.alanlar.filter((/** @type {Nesne} */ a) => a.kilitKosulu?.secim === zincirIstegi && kosulAktif(o, a));
        const kilitlenen = kilitBagli.filter((/** @type {Nesne} */ a) => kilitli(a, secilen) && !kilitli(a, once));
        const kilitAcilan = kilitBagli.filter((/** @type {Nesne} */ a) => !kilitli(a, secilen) && kilitli(a, once));
        const degisiklikler = [acilan.length ? `${adlar(acilan)} açıldı` : '', gizlenen.length ? `${adlar(gizlenen)} gizlendi` : '', ...yeniAdlar,
          kilitlenen.length ? `${adlar(kilitlenen)} sayfa tarafından dolduruluyor, değiştirilemez` : '',
          kilitAcilan.length ? `${adlar(kilitAcilan)} düzenlenebilir` : ''].filter(Boolean);
        const parcalar = [
          `“${k?.etiket ?? alanAdi(o, zincirIstegi)}” = “${metni}” sayfaya uygulandı: ${degisiklikler.length ? `${degisiklikler.join('; ')}.` : 'bu seçimde ek ya da farklı alan yok; aynı alanlar sorulur.'}`,
          sayfaHatalari.length ? `Sayfa uyarı gösterdi: ${sayfaHatalari.slice(0, 3).join(' · ')}` : ''
        ].filter(Boolean).join(' ');
        gunluk(o, parcalar);
        veriDuragi(o, parcalar);
        return;
      }
      if (zincirIstegi) {
        const ustAd = `“${alanAdi(o, zincirIstegi)}”`;
        const altlar = [...o.bagliUst].filter(([, u]) => u === zincirIstegi).map(([alt]) => alt)
          .filter((k) => adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === k && kosulAktif(o, a)));
        const gelen = altlar.filter((k) => gercekSecenekler(o.alanlar.get(k)?.alan.secenekler).length);
        const bos = altlar.filter((k) => !gelen.includes(k));
        const parcalar = [
          gelen.length ? `${ustAd} seçimine göre ${gelen.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri geldi; seçin.` : '',
          bos.length ? `${ustAd} seçimine göre ${bos.map((k) => `“${alanAdi(o, k)}”`).join(', ')} için seçenek gelmedi.` : '',
          yeni ? `${yeni} yeni alan belirdi.` : '',
          sayfaHatalari.length ? `Sayfa uyarı gösterdi: ${sayfaHatalari.slice(0, 3).join(' · ')}` : ''
        ].filter(Boolean).join(' ');
        gunluk(o, parcalar || `${ustAd} sayfaya uygulandı.`);
        veriDuragi(o, parcalar || null);
        return;
      }
      { const oz = farkOzeti(sf, { neden: 'Doldurunca', ad: (k) => alanAdi(o, k) }); if (oz) gunluk(o, oz); }
      if (sayfaHatalari.length) { o.hataSorusu = { metinler: sayfaHatalari, kaynak: 'doldur' }; o.durum = 'hataSorusu'; return; }
      if (yeni) { veriDuragi(o, `${yeni} yeni alan belirdi; değerlerini girin.`); return; }
      // Seçenekleri gelen boş liste bu adımda BİR KEZ sorulur: kullanıcı boş bırakıp yeniden "Devam et" derse (sayfa seçenekleri her
      // doldurmada yeniden yükleyebilir) aynı soru tekrarlanmaz — veri → düğme → veri akışında liste sonraki adımda doldurulabilir.
      const sorulmus = (o.sorulmusBagli ??= new Set());
      const adimNo = o.adimlar.indexOf(adim);
      // Anahtar üst listenin o anki değerini de içerir: üst değişince alt liste yeniden sorulur.
      const soruAnahtari = (/** @type {string} */ k) => `${adimNo}:${k}:${String(o.degerler[o.bagliUst.get(k) ?? '']?.deger ?? '')}`;
      const sorulacak = yuklenen.filter((k) => !sorulmus.has(soruAnahtari(k)));
      if (sorulacak.length) {
        for (const k of sorulacak) sorulmus.add(soruAnahtari(k));
        const ustAdlari = [...new Set(sorulacak.map((k) => o.bagliUst.get(k)).filter(Boolean).map((u) => `“${alanAdi(o, /** @type {string} */ (u))}”`))];
        veriDuragi(o, `${ustAdlari.length ? `${ustAdlari.join(', ')} seçimine göre ` : ''}${sorulacak.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri geldi; seçin (boş bırakıp “Devam et” derseniz yeniden sorulmaz).`);
        return;
      }
      // Boş bağlı listeler yalnız sayfa zorunlu sayıyorsa eksiktir (sayfa uyarırsa basıştan sonra görülür).
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !duzenlenemez(o, x) && !bagliGelecek(x, o)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) { veriDuragi(o, `${eksik.length} zorunlu alan boş.`); return; }
      verilerTamam(o);
      return;
    }
    if (e.olay === 'basildi') {
      const f = e.fark;
      o.sonKesif = Array.isArray(e.kesifler) ? e.kesifler : [];
      yerindeZinciriIsle(o, e.zincir, f?.anlik?.alanlar ?? []);
      o.basisNo++;
      const adim = guncelAdim(o);
      // Basıştan ÖNCE görünen metinler (sahte başarıyı önler: basıştan önce de görünen metin "Bitti" önerilmez).
      for (const m of o.sonAnlik?.metinler ?? []) o.onceGorunenler.add(m.metin);
      adim.bas = { ...o.basiliyor };
      // Basışta açılan tarayıcı penceresi: verilen yanıt (onay / soru penceresinin son yanıtı; yalnız bilgi penceresi açıldıysa "kabul")
      // modele aksiyonun "diyalog"u olarak yazılır; doğrulama ve normal koşu aynı yanıtı verir.
      const pencereler = Array.isArray(f.diyaloglar) ? f.diyaloglar : [];
      if (pencereler.length) {
        const soru = [...pencereler].reverse().find((/** @type {Nesne} */ x) => x.tur === 'confirm' || x.tur === 'prompt');
        adim.bas.diyalog = soru ? soru.yanit : 'kabul';
        for (const x of pencereler) gunluk(o, `Sayfa ${x.tur === 'alert' ? 'bilgi' : x.tur === 'prompt' ? 'soru' : 'onay'} penceresi açtı: “${x.mesaj}” → ${x.tur === 'alert' ? 'Tamam' : x.yanit === 'kabul' ? 'Tamam (onaylandı)' : 'İptal'}.`);
      }
      if (f.gonderim) o.gonderimVar = true;
      adim.fark = { ...f, anlik: undefined };
      o.basiliyor = null;
      o.sonFark = f;
      o.sonAnlik = f.anlik;
      o.sonGoruntu = f.anlik.goruntu ?? null;
      // Basıştan sonra yeni beliren sayfa içi pencereler (dialog / modal): bitiş adımında "Açılan pencere görününce bitti" önerisi.
      o.sonPencereler = (Array.isArray(f.pencereler) ? f.pencereler : []).filter((/** @type {Nesne} */ x) => nesneMi(x) && typeof x.secici === 'string' && x.secici)
        .map((/** @type {Nesne} */ x) => ({ secici: String(x.secici).slice(0, 500), metin: metin(x.metin, 120) }));
      for (const m of f.beklemeMetinleri ?? []) gorulenEkle(o, m, 'bekleme');
      // Yeni beliren alanların etiketleri (ör. "D.TARİHİ") sonuç metni değildir: bitiş çiplerine girmez.
      for (const m of f.yeniMetinler ?? []) if (!alanEtiketiMi(o, m.metin, f.anlik?.alanlar)) gorulenEkle(o, m.metin, m.tur, m.sonuc === true);
      gunluk(o, `“${adim.bas.metin ?? adim.bas.secici}” basıldı (${Math.round(f.sureMs / 100) / 10} sn): ${f.yeniMetinler.length} yeni metin, ${f.yeniAlanlar.length} yeni alan${f.adres ? `, adres ${f.adres.sonra}` : ''}${f.tiklamaNotu ? ` (${f.tiklamaNotu})` : ''}.`);
      // Yeniden okuma farkı (basıştan önceki okumaya göre): dolan / değişen listeler, sayfanın doldurduğu değerler…
      {
        const sf = sayfaFarki(Array.isArray(o.farkOncesi) ? o.farkOncesi : [], f.anlik?.alanlar ?? []);
        o.farkOncesi = null;
        const ad = (/** @type {string} */ k) => alanAdi(o, k) === k ? (f.anlik?.alanlar ?? []).find((/** @type {Nesne} */ x) => x.anahtar === k)?.etiket ?? k : alanAdi(o, k);
        const oz = farkOzeti(sf, { neden: `“${adim.bas.metin ?? adim.bas.secici}” basılınca`, ad });
        if (oz) gunluk(o, oz);
      }
      const hatalar = f.yeniMetinler.filter((/** @type {Nesne} */ m) => m.tur === 'hata').map((/** @type {Nesne} */ m) => m.metin);
      if (hatalar.length) { o.hataSorusu = { metinler: hatalar, kaynak: 'bas' }; o.durum = 'hataSorusu'; return; }
      basistanSonra(o);
      return;
    }
    if (e.olay === 'secildi' && o.bitisSecimi) {
      // Bitiş koşulu için sayfada seçildi: metin → görülen metinlere ("Bitti" etiketiyle; kullanıcı değiştirebilir); öğe → Bitti öğeleri.
      const tur = o.bitisSecimi;
      o.bitisSecimi = null;
      o.durum = 'bitis';
      const secici = String(e.oge?.secici ?? '').slice(0, 500);
      const yazi = metin(e.oge?.metin, 200);
      if (tur === 'oge') {
        if (!secici) { o.sonHata = 'Bu öğe için tek başına bulunan bir seçici üretilemedi; öğenin kendisine (ya da çevresine) tıklayın.'; return; }
        if (!bitisOgesiEkle(o, { secici, metin: yazi ? metin(yazi, 120) : null, kaynak: 'secim' })) { o.sonHata = 'En çok 10 bitiş öğesi eklenebilir.'; return; }
        gunluk(o, `Bitiş öğesi seçildi: “${yazi ?? secici}” görününce bitti.`);
        return;
      }
      if (!yazi) { o.sonHata = 'Seçilen öğenin yazısı yok; yazılı bir öğeye tıklayın ya da “Şu öğe görününce bitti”yi kullanın.'; return; }
      kullaniciMetniEkle(o, yazi, 'secim', 'bitti');
      gunluk(o, `Sayfada seçilen metin bitişe eklendi: “${yazi}”.`);
      return;
    }
    if (e.olay === 'secimIptal' && o.bitisSecimi) { o.bitisSecimi = null; o.durum = 'bitis'; return; }
    if (e.olay === 'secildi') {
      const d = { secici: String(e.oge.secici), metin: metin(e.oge.metin, 120) };
      gunluk(o, `Sayfada seçildi: “${d.metin ?? d.secici}”.`);
      o.secilenDugme = d;
      // Hayır izni: düğmeye basılmaz; seçilen düğme adaylara eklenir ve düğme / mesaj seçimine dönülür.
      if (o.izin === 'hayir') {
        const liste = o.sonAnlik?.dugmeler ?? [];
        if (!liste.some((/** @type {Nesne} */ x) => x.secici === d.secici)) liste.unshift({ secici: d.secici, metin: d.metin, kayitOlusturabilir: false, guven: 'tahmin', enOlasi: false });
        if (o.sonAnlik) o.sonAnlik.dugmeler = liste;
        o.hayirOneri = d.secici;
        o.durum = 'hayirSecim';
        return;
      }
      if (basmaKarari({ izin: o.izin, adaySayisi: 1, kullaniciSecti: true }) === 'sor') { o.onayBekleyen = d; o.durum = 'onay'; }
      else basmayaBasla(o, d);
      return;
    }
    if (e.olay === 'secimIptal') { o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar'; return; }
    // Sayfayı yeniden okuma (seçimden vazgeçince de gönderilir): adaylar tazelenir.
    if (e.olay === 'okundu') {
      o.sonAnlik = e.anlik; o.sonGoruntu = e.anlik.goruntu ?? o.sonGoruntu;
      secenekleriTazele(o, e.anlik);
      // Zincir tekrar yürütüldü (tarayıcı yeniden açıldı): kaldığı adıma dönülür.
      if (o.okumaAmaci === 'devam') { o.okumaAmaci = null; hedefeDon(o); return; }
      if (o.okumaAmaci === 'bitis') {
        // Bitiş koşulu adımı: ekranda o an görünen yeni metinler (mesajlar) görülenlere eklenir.
        const onceki = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
        // Yalnız son basıştan SONRA beliren, alan etiketi olmayan metinler (menü / başlık / altbilgi / alan etiketleri basıştan önce de vardı).
        const bilinen = new Set([...(o.basOncesiMetinler ?? []), ...(o.kesifAnlik?.metinler ?? []).map((/** @type {Nesne} */ m) => m.metin)]);
        for (const m of e.anlik.metinler) if (!bilinen.has(m.metin) && !alanEtiketiMi(o, m.metin, e.anlik.alanlar)) gorulenEkle(o, m.metin, m.tur, m.sonuc === true);
        const yeni = o.gorulenler.filter((/** @type {Nesne} */ x) => !onceki.has(x.metin));
        for (const x of yeni) if (x.tur === 'hata' && !(x.metin in o.etiketler)) o.etiketler[x.metin] = 'hata';
        gunluk(o, `Sayfa yeniden tarandı: ${yeni.length} yeni metin.`);
        o.okumaAmaci = null;
        o.durum = 'bitis';
        return;
      }
      // Sayfada henüz sorulmamış (sonradan beliren) doldurulabilir alan varsa veri durağı açılır: "Veriyi düzenle" gerekmez.
      const adim = o.adimlar.length ? guncelAdim(o) : null;
      const yeniler = adim ? e.anlik.alanlar.filter((/** @type {Nesne} */ a) => doldurulabilir(a) && !o.alanlar.has(a.anahtar)) : [];
      for (const a of yeniler) alanEkle(o, a, adim, true);
      if (adim) sayfaSirasinaYerlestir(adim, yeniler.map((/** @type {Nesne} */ a) => a.anahtar), e.anlik.alanlar);
      hazirTazele(o, e.anlik);
      kilitleriTazele(o, e.anlik, null);
      const duzelt = o.okumaAmaci === 'duzelt';
      const veriDevam = o.okumaAmaci === 'veriDevam';
      o.okumaAmaci = null;
      if (veriDevam && adim) { veriyeDevamAc(o, adim, e.anlik.alanlar, yeniler.length); return; }
      if (yeniler.length) veriDuragi(o,`${yeniler.length} yeni alan belirdi; değerlerini girin.`);
      else if (duzelt && adim?.alanlar.length) veriDuragi(o);
      else if (duzelt) gecmisVeriyiAc(o);
      else o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      return;
    }
    if (e.olay === 'dogrulandi' && bekleyen.tur === 'yenidenKur') {
      if (e.sonuc !== 'basarili') { yenidenKurulamadi(o, String(e.mesaj ?? '')); return; }
      yenidenKurBitti(o);
      return;
    }
    if (e.olay === 'dogrulandi') {
      o.dogrulama = { durum: e.sonuc, mesaj: String(e.mesaj ?? ''), gorulen: Array.isArray(e.gorulen) ? e.gorulen.slice(0, 20) : [] };
      dogrulamaAdimlariniKapat(o, e.sonuc === 'basarili');
      gunluk(o, `Doğrulama koşusu: ${e.sonuc === 'basarili' ? 'başarılı' : 'başarısız'} — ${o.dogrulama.mesaj}`);
      o.durum = 'kaydet';
      // Kaydet aşaması tarayıcı gerektirmez: tarayıcı kapatılır (oturum ve toplananlar sunucuda kalır).
      tarayiciyiKapat(o);
    }
  }

  // ---- Tarayıcının kapanması ve yeniden açılması (süre doldu / kaydet aşaması / geri dönüş) ----
  /** Tarayıcı kapanınca toplananlarla dönülecek adım (kaldığı yer). @param {Nesne} o */
  function devamHedefi(o) {
    const hayir = o.izin === 'hayir';
    if (o.yenidenAcma?.hedef) return o.yenidenAcma.hedef;
    if (o.durum === 'veri' || o.durum === 'zincir') return 'veri';
    if (o.durum === 'calisiyor' && o.bekleyen?.tur === 'doldur') return 'veri';
    if (o.durum === 'bitis' || o.durum === 'bitisSecim' || (o.durum === 'calisiyor' && o.okumaAmaci === 'bitis')) return 'bitis';
    if (o.durum === 'hataSorusu' || o.durum === 'onay') return o.durum;
    // Keşif basışı yarıda kaldı: keşfin kalanı atlanır; akış veri durağından (alan yoksa karardan) sürer.
    if (o.durum === 'kesifOnay' || (o.durum === 'calisiyor' && o.bekleyen?.tur === 'kesifBas')) { o.kesifDugmeKuyrugu = []; if (guncelAdim(o)?.alanlar.length) return 'veri'; }
    return hayir ? 'hayirSecim' : 'karar';
  }
  /**
   * Tarayıcı kapandı (boşta kalma / üst sınır / pencere kapatıldı): toplananlar (zincir adımları, değerler, etiketler, düğme zinciri,
   * bitiş) bellekte kalır; kullanıcıya "Kaldığın yerden devam et" ve "Toplananları kaydet" sunulur. @param {Nesne} o @param {{ kod: string; mesaj: string }} neden
   */
  function askiyaAl(o, neden) {
    const hedef = devamHedefi(o);
    o.askida = { kod: neden.kod, mesaj: neden.mesaj, hedef, zaman: simdi() };
    o.durum = 'askida';
    o.tarayici = 'kapali';
    o.bekleyen = null;
    o.calisiyor = null;
    o.yenidenAcma = null;
    o.diyalogSorusu = null;
    o.okumaAmaci = null;
    o.zincirIstegi = null;
    o.kosulIstegi = null;
    o.sonGonderilen = {};
    o.basiliyor = null;
    o.bitisSecimi = null;
    gunluk(o, `Tarayıcı kapandı: ${neden.mesaj} Toplananlar duruyor.`);
  }
  /**
   * Zinciri yeniden kurma planı: basılmış her adımın değerli (ve geçerli koşullu) alanları + basışı; son (basılmamış) adımın yalnız sayfaya
   * uygulanmış alanları. Hayır izninde basış yoktur (yalnız doldurulur). Değerler doğrulama koşusundaki gibi (tablo: çözülmüş; dosya:
   * oturumun geçici kopyası). @param {Nesne} o
   */
  function yenidenKurPlani(o) {
    const hayir = o.izin === 'hayir';
    return o.adimlar.map((/** @type {Nesne} */ a) => {
      const basildi = Boolean(a.bas) && !hayir;
      const alanlar = bagimliSirala(a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar] && kosulAktif(o, x) && !duzenlenemez(o, x)
        && (basildi || o.uygulanan[x.anahtar] === o.degerler[x.anahtar].deger)));
      return {
        alanlar: alanlar.map((/** @type {Nesne} */ x) => ({
          anahtar: x.anahtar, alan: x,
          deger: o.degerler[x.anahtar].kaynak === 'dosya' ? String(o.dosyaYollari?.[x.anahtar] ?? '') : o.cozulmus?.[x.anahtar] ?? o.degerler[x.anahtar].deger
        })),
        bas: basildi ? { secici: a.bas.secici, metin: a.bas.metin, ...(a.bas.diyalog ? { diyalog: a.bas.diyalog } : {}), ...(a.bas.cerceve?.length ? { cerceve: a.bas.cerceve } : {}) } : null
      };
    }).filter((/** @type {Nesne} */ a) => a.alanlar.length || a.bas);
  }
  /**
   * Tarayıcı yeniden açılıp zincir tekrar yürütülecekse ve zincirde basış varsa kullanıcıdan AÇIK onay istenir: daha önce basılan
   * düğmelere yeniden basılır (kayıt oluşturabilir). Hayır izninde plan basışsızdır (yalnız alanlar doldurulur): onay gerekmez.
   * Onay yoksa 409 ONAY_GEREKLI + basılacak düğmeler döner (arayüz sorar, onaylanınca { onay: true } ile yineler). @param {Nesne} o @param {Nesne} g
   */
  function yenidenBasisOnayi(o, g) {
    if (g.onay === true || o.izin === 'hayir') return;
    const dugmeler = yenidenKurPlani(o).filter((/** @type {Nesne} */ a) => a.bas).map((/** @type {Nesne} */ a) => String(a.bas.metin ?? a.bas.secici));
    if (!dugmeler.length) return;
    throw new HizliTestHatasi('ONAY_GEREKLI', `Zincir yeniden yürütülecek; şu düğmelere yeniden basılacak: ${dugmeler.map((d) => `“${d}”`).join(', ')} (kayıt oluşturabilir). Devam edilsin mi?`, 409, { onayGerekli: true, dugmeler });
  }
  /**
   * "Veri girmeye devam et": ekranın şu anki okumasında görünen, ÖNCEKİ adımlarda bulunan doldurulabilir alanlar bu adımın veri durağında
   * sayfadaki değerleriyle (önceki değer önyazılmaz) gösterilir. Değiştirilenler bu adıma alınır (veri(): değer aynıysa taşınır, farklıysa
   * "Taşı / İkinci kez yaz" sorulur); değiştirilmeyenlere dokunulmaz. Sayfa baştan açılmaz, düğmelere yeniden basılmaz.
   * @param {Nesne} o @param {Nesne} adim güncel (basışı olmayan) adım @param {Nesne[]} sayfaAlanlari bu okumanın alanları @param {number} yeniSayisi
   */
  function veriyeDevamAc(o, adim, sayfaAlanlari, yeniSayisi) {
    const buAdimda = new Set(adim.alanlar.map((/** @type {Nesne} */ a) => a.anahtar));
    o.devamAlanlari = sayfaAlanlari.filter((/** @type {Nesne} */ a) => doldurulabilir(a) && o.alanlar.has(a.anahtar) && !buAdimda.has(a.anahtar)
      && !duzenlenemez(o, o.alanlar.get(a.anahtar)?.alan)).map((/** @type {Nesne} */ a) => String(a.anahtar));
    if (!o.devamAlanlari.length && !adim.alanlar.length) {
      o.devamAlanlari = null;
      o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      o.sonHata = 'Ekranda doldurulacak alan yok.';
      gunluk(o, '“Veri girmeye devam et”: ekranda doldurulacak alan yok.');
      return;
    }
    gunluk(o, `“Veri girmeye devam et”: ekran okundu${yeniSayisi ? `, ${yeniSayisi} yeni alan` : ''}; önceki adımlardan ${o.devamAlanlari.length} alan sayfadaki değerleriyle gösteriliyor.`);
    veriDuragi(o, 'Ekranın şu anki hâli: alanlar sayfadaki değerleriyle gösterilir. Değiştirdikleriniz bu adımda ekrana yazılır; değiştirmediklerinize dokunulmaz.');
  }
  /** Alanın bulunduğu adım (yoksa null). @param {Nesne} o @param {string} anahtar */
  const alaninAdimi = (o, anahtar) => o.adimlar.find((/** @type {Nesne} */ a) => a.alanlar.some((/** @type {Nesne} */ x) => x.anahtar === anahtar)) ?? null;
  /**
   * "Veri girmeye devam et" durağında önceki adımın alanına değer girildi: aynı değerse (ya da önceden değeri yoksa) alan bu adıma TAŞINIR
   * (koşu onu bu adımda yazar); farklı değerse kullanıcının kararı: 'tasi' ya da 'ikinci' (aynı ekran kutusu için yeni alan "Etiket (2)";
   * senaryoda ayrı değer). Karar verilmemiş fark varsa hiçbir şey değişmez: 409 TEKRAR (arayüz sorar). Girilen değerin anahtarı kopyaya taşınır.
   * @param {Nesne} o @param {Nesne} adim @param {Record<string, unknown>} girilen @param {unknown} kararlar
   */
  function devamAlanlariniAl(o, adim, girilen, kararlar, anlik) {
    const k0 = nesneMi(kararlar) ? /** @type {Record<string, unknown>} */ (kararlar) : {};
    const karariVar = (/** @type {string} */ k) => k0[k] === 'tasi' || k0[k] === 'ikinci';
    const dolu = (/** @type {unknown} */ v) => nesneMi(v) && v.deger !== null && v.deger !== undefined && v.deger !== '';
    const etiketi = (/** @type {string} */ k) => { const a = o.alanlar.get(k)?.alan; return a ? gecerliEtiket(o, a) ?? adsizEtiket(a) : k; };
    const gizlimi = (/** @type {string} */ k) => { const a = o.alanlar.get(k)?.alan; return Boolean(a && gizliAlan(a)); };
    /** Bekleyen karar (anında uygulamada geçici taşınan alan): önceki adımın değeri ve adımı. @type {Record<string, { deger: unknown; kaynak: string; adim: number }>} */
    const bekleyen = (o.tekrarBekleyen ??= {});
    const islenecek = (o.devamAlanlari ?? []).filter((/** @type {string} */ k) => dolu(girilen[k]) && o.alanlar.has(k));
    /** @type {Array<{ anahtar: string; karar: string; gecici?: boolean }>} */
    const plan = [];
    const sorular = [];
    const soru = (/** @type {string} */ k, /** @type {unknown} */ eski, /** @type {number} */ adimNo, /** @type {unknown} */ yeni) =>
      sorular.push({ anahtar: k, etiket: etiketi(k), adim: adimNo, onceki: gizlimi(k) ? '••••••' : String(eski ?? ''), yeni: gizlimi(k) ? '••••••' : String(yeni) });
    for (const k of islenecek) {
      const onceki = o.degerler[k];
      const yeni = /** @type {Nesne} */ (girilen[k]);
      const ayni = !onceki || String(onceki.deger) === String(yeni.deger);
      if (ayni) { plan.push({ anahtar: k, karar: 'tasi' }); continue; }
      if (karariVar(k)) { plan.push({ anahtar: k, karar: String(k0[k]) }); continue; }
      // Değer girerken (anında uygulama) soru sorulmaz: alan geçici taşınır, önceki değer saklanır; karar "Devam et"te bir kez sorulur.
      if (anlik) { bekleyen[k] = { deger: onceki.deger, kaynak: onceki.kaynak, adim: o.adimlar.indexOf(alaninAdimi(o, k)) }; plan.push({ anahtar: k, karar: 'tasi', gecici: true }); continue; }
      soru(k, onceki.deger, o.adimlar.indexOf(alaninAdimi(o, k)) + 1, yeni.deger);
    }
    // "Devam et": geçici taşınan alanlardan değeri öncekinden hâlâ farklı olanlar için karar.
    if (!anlik) {
      for (const [k, b] of Object.entries(bekleyen)) {
        const simdi = dolu(girilen[k]) ? /** @type {Nesne} */ (girilen[k]).deger : o.degerler[k]?.deger;
        if (simdi === undefined || simdi === null || String(simdi) === String(b.deger)) { delete bekleyen[k]; continue; }
        if (!karariVar(k)) soru(k, b.deger, b.adim + 1, simdi);
      }
    }
    if (sorular.length) {
      throw new HizliTestHatasi('TEKRAR', `${sorular.map((x) => `“${x.etiket}”`).join(', ')} önceki adımda başka bir değerle yazılmıştı: bu adıma taşınsın mı, ikinci kez mi yazılsın?`, 409, { tekrarlar: sorular });
    }
    /** İkinci kez yazılan alan için kopya (aynı ekran kutusu, yeni anahtar) güncel adıma. @param {Nesne} alan @returns {Nesne} */
    const kopyaAc = (alan) => {
      const kaynak = String(alan.kopyasi ?? alan.anahtar);
      let n = 2;
      while (o.alanlar.has(`${kaynak}~${n}`)) n++;
      const kaynakEtiketi = o.alanlar.get(kaynak)?.alan?.etiket ?? alan.etiket ?? adsizEtiket(alan);
      const kopya = { ...structuredClone(alan), anahtar: `${kaynak}~${n}`, kopyasi: kaynak, etiket: `${kaynakEtiketi} (${n}. kez)` };
      delete kopya.kosul; delete kopya.etiketKosulu; delete kopya.kilitKosulu;
      alanEkle(o, kopya, adim, true);
      const liste = (o.kopyalar ??= new Map()).get(kaynak) ?? [];
      o.kopyalar.set(kaynak, [...liste, kopya.anahtar]);
      gunluk(o, `“${kopya.etiket}”: aynı ekran kutusu bu adımda ikinci kez yazılacak (senaryoda ayrı değer).`);
      return kopya;
    };
    for (const { anahtar: k, karar, gecici } of plan) {
      const alan = o.alanlar.get(k)?.alan;
      const eski = alaninAdimi(o, k);
      if (!alan || !eski) continue;
      if (karar === 'tasi') {
        eski.alanlar = eski.alanlar.filter((/** @type {Nesne} */ x) => x.anahtar !== k);
        adim.alanlar.push(alan);
        (o.yenidenYaz ??= new Set()).add(k);
        if (!gecici) delete bekleyen[k];
        gunluk(o, `“${alanAdi(o, k)}” ${o.adimlar.indexOf(eski) + 1}. adımdan bu adıma taşındı (koşuda burada yazılır).`);
      } else {
        const kopya = kopyaAc(alan);
        girilen[kopya.anahtar] = girilen[k];
        delete girilen[k];
      }
    }
    // Geçici taşınıp "İkinci kez yaz" denen alan: asıl alan eski değeriyle önceki adımına döner, yeni değer kopyaya geçer.
    if (!anlik) {
      for (const [k, b] of Object.entries(bekleyen)) {
        if (!karariVar(k)) continue;
        if (k0[k] === 'ikinci') {
          const alan = o.alanlar.get(k)?.alan;
          const eskiAdim = o.adimlar[b.adim];
          if (alan && eskiAdim && eskiAdim !== adim) {
            const yeni = dolu(girilen[k]) ? girilen[k] : o.degerler[k];
            adim.alanlar = adim.alanlar.filter((/** @type {Nesne} */ x) => x.anahtar !== k);
            eskiAdim.alanlar.push(alan);
            o.degerler[k] = { deger: b.deger, kaynak: b.kaynak };
            delete girilen[k];
            const kopya = kopyaAc(alan);
            girilen[kopya.anahtar] = yeni;
          }
        }
        delete bekleyen[k];
      }
    }
    // İşlenen (bu adıma alınan) alanlar listeden çıkar; diğerleri "Devam et"e kadar sayfadaki değerleriyle gösterilmeye devam eder.
    const alinan = new Set(plan.map((x) => x.anahtar));
    o.devamAlanlari = (o.devamAlanlari ?? []).filter((/** @type {string} */ k) => !alinan.has(k));
  }
  /**
   * "Veriyi düzenle", güncel adımda alan yokken (ör. basış yalnız metin gösterdi, yeni alan çıkmadı): son alanlı adımın verisi düzenlenir —
   * veri durağı o adımın alanlarıyla, girilen değerler önyazılı açılır. "Devam et"te değişen değer varsa zincir baştan yeniden yürütülür
   * (gecmisVeriyiUygula). Düzenlenecek veri yoksa sessizce dönülmez: açık ileti. @param {Nesne} o
   */
  function gecmisVeriyiAc(o) {
    let i = o.adimlar.length - 1;
    while (i >= 0 && !o.adimlar[i].alanlar.length) i--;
    if (i < 0) {
      o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      o.sonHata = 'Düzenlenecek veri yok: bu testte sayfada değer girilecek alan görülmedi. Sayfada yeni alan çıkarsa “Veriyi düzenle” onu sorar.';
      gunluk(o, o.sonHata);
      return;
    }
    o.duzeltAdimi = i;
    const not = `Son basıştan sonra sayfada yeni alan çıkmadı; ${i + 1}. adımın verilerini düzenliyorsunuz (girdiğiniz değerler önyazılı). Bir değeri değiştirip “Devam et” derseniz değer sayfaya zincir baştan yeniden yürütülerek uygulanır${o.izin === 'hayir' ? '' : ' (önceki düğmelere yeniden basılır; onayınız sorulur)'}. Değiştirmezseniz kaldığınız yere dönülür.`;
    gunluk(o, `“Veriyi düzenle”: ${i + 1}. adımın verileri açıldı (güncel adımda alan yok).`);
    veriDuragi(o, not);
  }
  /**
   * Geçmiş adımın düzenlenen verisi: değişmediyse kaldığı yere dönülür; değiştiyse (zorunlular dolu) yeniden basılacak düğmeler için onay
   * istenir (409 ONAY_GEREKLI; Hayır izninde basışsız plan), değerler kaydedilir ve zincir AYNI tarayıcıda baştan yeniden yürütülür
   * (doğrulama koşusunun "zinciri yeniden kur" yolu: sayfa yeniden açılır, adımlar doldurulup basılır), sonra kalınan adıma dönülür.
   * @param {Veritabani} vt @param {Nesne} o @param {Nesne} g @param {Nesne} adim @param {Record<string, Nesne | null>} yeni
   */
  function gecmisVeriyiUygula(vt, o, g, adim, yeni) {
    const geriDon = () => { o.duzeltAdimi = null; o.soruNotu = null; o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar'; };
    const degisen = Object.keys(yeni).filter((k) => (yeni[k]?.deger ?? null) !== (o.degerler[k]?.deger ?? null));
    if (!degisen.length) {
      geriDon();
      gunluk(o, 'Veri değişmedi; kaldığınız yere dönüldü.');
      return { tamam: true, degisen: 0 };
    }
    /** @type {Record<string, unknown>} */
    const deneme = Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger]));
    for (const [k, v] of Object.entries(yeni)) { if (v) deneme[k] = v.deger; else delete deneme[k]; }
    const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !duzenlenemez(o, x) && !bagliGelecek(x, o)), deneme);
    if (eksik.length) {
      throw new HizliTestHatasi('EKSIK', `Zorunlu alanlar boş: ${eksik.slice(0, 5).map((a) => gecerliEtiket(o, a) ?? a.anahtar).join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`, 400,
        { eksikler: eksik.map((a) => a.anahtar) });
    }
    // Değişen tablo başvuruları bu ortamda çözülür (zincir planı çözülmüş değeri kullanır; çözülemezse açık hata, hiçbir şey değişmez).
    const cozulecek = Object.fromEntries(degisen.filter((k) => yeni[k]?.kaynak === 'tablo').map((k) => [k, /** @type {Nesne} */ (yeni[k]).deger]));
    /** @type {Record<string, unknown>} */
    let cozulmus = {};
    if (Object.keys(cozulecek).length) {
      const r = ekranBasvurulariniCoz(cozulecek, {
        tablolar: tablolariListele(vt, o.projeId, { cozulsun: true }), ortamId: o.ortam.id, tabloSecimleri: o.tabloSecimleri,
        secenekDegerleri: Object.fromEntries(Object.keys(cozulecek).map((k) => { const a = o.alanlar.get(k)?.alan; return [k, (a?.tur === 'radio' ? (a?.radyolar ?? []) : (a?.secenekler ?? [])).map((/** @type {Nesne} */ x) => String(x.deger))]; }))
      });
      if (r.hatalar.length) throw new HizliTestHatasi('TABLO', r.hatalar[0].mesaj.replace(/"([^"]+)" alanının/, (_, k) => `“${o.alanlar.get(k)?.alan.etiket ?? k}” alanının`));
      cozulmus = r.veri;
    }
    // Yeniden basılacak düğmeler için açık onay (onay yoksa 409; değerler henüz değişmedi).
    const eski = o.degerler;
    o.degerler = { ...eski };
    for (const [k, v] of Object.entries(yeni)) { if (v) o.degerler[k] = v; else delete o.degerler[k]; }
    try { yenidenBasisOnayi(o, g); } catch (h) { o.degerler = eski; throw h; }
    o.cozulmus = { ...(o.cozulmus ?? {}), ...Object.fromEntries(Object.keys(cozulecek).map((k) => [k, String(cozulmus[k] ?? '')])) };
    for (const k of degisen) { if (o.degerler[k]) o.uygulanan[k] = o.degerler[k].deger; else delete o.uygulanan[k]; }
    o.alanHatalari = {};
    const plan = yenidenKurPlani(o);
    const adlar = degisen.map((k) => `“${alanAdi(o, k)}”`).join(', ');
    geriDon();
    gunluk(o, `${adlar} değiştirildi; zincir baştan yeniden yürütülüyor${plan.some((/** @type {Nesne} */ a) => a.bas) ? ' (önceki düğmelere yeniden basılır)' : ''}.`);
    o.yenidenAcma = { amac: 'kur', hedef: o.durum };
    o.durum = 'calisiyor';
    o.calisiyor = `${adlar} değişti; zincir yeniden yürütülüyor…`;
    gonder(o, { tur: 'dogrula', plan: { adimlar: plan, bitis: { bitti: [], devam: [], hata: [], adres: null }, zamanAsimiSn: 1, yenidenKur: true } });
    o.bekleyen.tur = 'yenidenKur';
    return { gonderildi: true, degisen: degisen.length };
  }
  /** Zincir tekrar yürütüldü: sayfa okunur (düğme adayları, alanlar), sonra kaldığı adıma dönülür. @param {Nesne} o */
  function yenidenKurBitti(o) {
    o.okumaAmaci = 'devam';
    o.calisiyor = 'Zincir tekrar yürütüldü; sayfa okunuyor…';
    gonder(o, { tur: 'oku' });
  }
  /** Zincir tekrar yürütülemedi: tarayıcı kapatılır, oturum yine askıda kalır (toplananlar kaybolmaz). @param {Nesne} o @param {string} mesaj */
  function yenidenKurulamadi(o, mesaj) {
    gunluk(o, `Zincir tekrar yürütülemedi: ${mesaj}`);
    const hedef = o.yenidenAcma?.hedef ?? 'karar';
    tarayiciyiKapat(o);
    o.yenidenAcma = { hedef, amac: 'kur' };
    askiyaAl(o, { kod: 'YENIDEN_KURULAMADI', mesaj: `Zincir tekrar yürütülemedi (${mesaj}).` });
  }
  /** Yeniden açılan tarayıcıda zincir kuruldu: kaldığı adıma dönülür. @param {Nesne} o */
  function hedefeDon(o) {
    const hedef = o.yenidenAcma?.hedef ?? (o.izin === 'hayir' ? 'hayirSecim' : 'karar');
    o.yenidenAcma = null;
    o.calisiyor = null;
    gunluk(o, 'Sayfa yeniden açıldı; zincir tekrar yürütüldü, kaldığınız adımdasınız.');
    if (hedef === 'veri') { veriDuragi(o, 'Tarayıcı yeniden açıldı; kaldığınız yerden devam edin.'); return; }
    o.durum = hedef;
  }
  /**
   * Tarayıcıyı yeniden açar (aynı ortam, adres, izin, giriş; izinler ve CANLI onayı yeniden denetlenir; keşif yapılmaz). amac 'kur': zincir
   * tekrar yürütülür ve hedef adıma dönülür ("Tarayıcı yeniden açılıyor, zincir tekrar yürütülüyor…"); amac 'dogrula': doğrulama koşusu
   * (kendi sayfasını açar), bitince tarayıcı kapanır. @param {Nesne} o @param {TarayiciBaglami | undefined} c @param {'kur' | 'dogrula'} amac
   * @param {string} hedef
   */
  function tarayiciyiAc(o, c, amac, hedef) {
    if (!c?.vt || !c.baglam) throw new HizliTestHatasi('TARAYICI', 'Tarayıcı bu bağlamda açılamıyor.', 500);
    // Önceki iş hâlâ kapanıyorsa beklemeden kapatılır (aynı anda tek tarayıcı işi).
    // (Eski işin "isBitti"si oturumu etkilemez: önce bağ kesilir.)
    const eskiId = o.isId;
    const eski = tarama().isler.get(eskiId);
    if (eski && eski.durum === 'suruyor') { o.isId = null; try { tarama().iptal(eskiId); } catch { /* bitti */ } o.isId = eskiId; }
    ucDenetle(c.vt, '/platform/tarama/baslat', o.denetimGovdesi);
    const { isId } = tarama().baslat(c.vt, { ...o.baslatGovdesi, kesifAtla: true }, c.baglam);
    o.isId = isId;
    isiDinle(o, isId);
    o.tarayici = 'acik';
    // Yeni tarayıcıda bağlam (aynı gövdeyle) yeniden uygulanır.
    o.baglamUygulandi = false;
    o.isBitti = false;
    o.bekleyen = null;
    o.askida = null;
    o.yenidenAcma = { amac, hedef };
    o.durum = amac === 'dogrula' ? 'dogrulama' : 'yeniden';
    o.calisiyor = amac === 'dogrula' ? 'Doğrulama koşusu: tarayıcı açılıyor…' : 'Tarayıcı yeniden açılıyor, zincir tekrar yürütülüyor…';
    gunluk(o, amac === 'dogrula' ? 'Doğrulama koşusu için tarayıcı açılıyor.' : 'Tarayıcı yeniden açılıyor; zincir baştan tekrar yürütülecek.');
  }

  /** Metin bir alanın etiketi mi (bilinen ya da o an sayfadaki alanlar)? @param {Nesne} o @param {unknown} m @param {Nesne[]} [sayfadakiler] */
  function alanEtiketiMi(o, m, sayfadakiler = []) {
    const k = katla(String(m ?? '').replace(/[\s*:：]+$/u, ''));
    if (!k) return false;
    const esit = (/** @type {unknown} */ e) => typeof e === 'string' && katla(e.replace(/[\s*:：]+$/u, '')) === k;
    return [...o.alanlar.values()].some((x) => esit(x.alan.etiket)) || sayfadakiler.some((a) => esit(a.etiket));
  }

  /**
   * Görülen metin (bitiş çipleri). sonuc: basıştan sonra beliren sonuç nitelikli metin (başarı kalıbı / kutusu, durum bölgesi, bildirim,
   * başlık, bilgi penceresi); onceGorundu: metin bir basıştan ÖNCE de sayfada görünüyordu (keşif ya da önceki okumalar) — "Bitti" önerilmez.
   * @param {Nesne} o @param {unknown} m @param {string} tur @param {boolean} [sonuc]
   */
  function gorulenEkle(o, m, tur, sonuc = false) {
    const t = metin(m, 200);
    if (!t) return;
    const onceGorundu = o.onceGorunenler?.has(t) === true;
    const var_ = o.gorulenler.find((/** @type {Nesne} */ g) => g.metin === t);
    if (var_) {
      var_.basis = o.basisNo;
      if (tur === 'hata' || tur === 'bekleme') var_.tur = tur;
      var_.sonuc = sonuc;
      var_.onceGorundu = var_.onceGorundu === true || onceGorundu;
      return;
    }
    if (o.gorulenler.length >= 60) return;
    o.gorulenler.push({ metin: t, tur: tur === 'bekleme' || beklemeMetniMi(t) ? 'bekleme' : tur, basis: o.basisNo, sonuc, onceGorundu });
  }

  /**
   * Kullanıcının bitiş için verdiği metin (sayfada seçti ya da elle yazdı): görülen metinlere eklenir (sınır yok; kaynak işaretli) ve
   * etiketlenir. Metin uydurulmaz: kullanıcının kararıdır; doğrulama koşusu gerçekten görünüp görünmediğini denetler.
   * @param {Nesne} o @param {string} yazi @param {'secim' | 'elle'} kaynak @param {string | null} etiket
   */
  function kullaniciMetniEkle(o, yazi, kaynak, etiket) {
    const var_ = o.gorulenler.find((/** @type {Nesne} */ g) => g.metin === yazi);
    if (var_) var_.kaynak ??= kaynak;
    else o.gorulenler.push({ metin: yazi, tur: beklemeMetniMi(yazi) ? 'bekleme' : 'normal', basis: o.basisNo, sonuc: false, onceGorundu: o.onceGorunenler?.has(yazi) === true, kaynak });
    o.etiketler[yazi] = ['bitti', 'devam', 'hata'].includes(String(etiket)) ? etiket : null;
  }

  /**
   * Bitti öğesi ekler (aynı seçici bir kez; seçili gelir). En çok 10 öğe: sınırdaysa false.
   * @param {Nesne} o @param {{ secici: string; metin: string | null; kaynak: string }} x @returns {boolean}
   */
  function bitisOgesiEkle(o, x) {
    o.bitisOgeleri ??= [];
    const var_ = o.bitisOgeleri.find((/** @type {Nesne} */ y) => y.secici === x.secici);
    if (var_) { var_.secili = true; return true; }
    if (o.bitisOgeleri.length >= 10) return false;
    o.bitisOgeleri.push({ secici: x.secici, metin: x.metin, kaynak: x.kaynak, secili: true });
    return true;
  }

  // ---- Görünüm ----
  /** @param {Nesne} o */
  function gorunum(o) {
    const d = tarama().isler.get(o.isId);
    const is = d ? tarama().durum(o.isId) : null;
    /** "Müşteri tipi: Kurumsal" biçiminde koşul metni (seçim alanının görünen etiketi + değerlerin görünen metni). */
    const kosulMetni = (/** @type {Nesne} */ o2, /** @type {{ secim: string; degerler: string[] }} */ kz) => {
      const kontrol = o2.alanlar.get(kz.secim)?.alan;
      const liste = kontrol ? (kontrol.tur === 'radio' ? (kontrol.radyolar ?? []) : (kontrol.secenekler ?? [])) : [];
      const ad = (/** @type {string} */ d) => (kontrol?.tur === 'checkbox' ? (d === 'true' ? 'işaretli' : 'işaretsiz') : (liste.find((/** @type {Nesne} */ x) => String(x.deger) === d)?.metin ?? d));
      return `${kontrol?.etiket ?? kz.secim}: ${kz.degerler.map(ad).join(' / ')}`;
    };
    const alanGorunumu = (/** @type {Nesne} */ a) => {
      const v = o.degerler[a.anahtar];
      return {
        // Etiket yalnız sayfada GÖRÜNEN addır; teknik ad (name / id) etiket olmaz (yalnız ipucu olarak teknikAd).
        // Etiketi seçime göre değişen alan şu anki seçimin adıyla; etiketKosulu: arayüz seçim değişince adı anında değiştirir ve diğer
        // değerlerdeki adı yanında yazar ("Vergi no (Özel'de: Kimlik no)").
        anahtar: a.anahtar, etiket: gecerliEtiket(o, a) ?? adsizEtiket(a), etiketBulundu: Boolean(a.etiket), teknikAd: a.ad ?? a.kimlik ?? null, tur: a.tur, zorunlu: a.zorunlu === true,
        etiketKosulu: a.etiketKosulu ? {
          secim: a.etiketKosulu.secim, varsayilan: a.etiketKosulu.varsayilan ?? a.etiket ?? null, etiketler: { ...a.etiketKosulu.etiketler },
          ...(a.etiketKosulu.enCoklar ? { enCoklar: { ...a.etiketKosulu.enCoklar } } : {})
        } : null,
        // En çok karakter (maxlength): veri durağında ipucu ("en çok 10 karakter") ve uzunluk denetimi; seçime göre değişiyorsa enCoklar.
        enCok: Number.isInteger(a.enCok) ? a.enCok : null,
        // Seçime göre düzenlenemeyen alan (sayfa o seçimde kendisi dolduruyor): arayüz seçim değişince alanı AYNI YERDE kilitler / açar.
        // duzenlenemez: şu anki seçimde (sunucunun bildiği değerle) düzenlenemez mi — kilitli alan sorulmaz, sayfadaki değeriyle gösterilir.
        kilitKosulu: a.kilitKosulu ? { secim: a.kilitKosulu.secim, kilitli: { ...a.kilitKosulu.kilitli }, varsayilan: a.kilitKosulu.varsayilan === true } : null,
        duzenlenemez: duzenlenemez(o, a),
        // Sayfada hazır: yalnız değeri OKUNAN ve koşulu şu an geçerli alan (keşifte görülen / şu an gizli koşullu alan "hazır" değildir;
        // değeri okunamayan alan "dolu" diye gösterilmez). Parolalı alanın değeri gösterilmez.
        hazir: a.hazir === true && (gizliAlan(a) || (a.mevcut !== null && a.mevcut !== undefined && a.mevcut !== '')) && kosulAktif(o, a),
        mevcut: gizliAlan(a) ? null : a.mevcut ?? null,
        // Açılır listede yer tutucu ("SEÇİNİZ", ilk seçenek ""/"0"/"-1") seçilebilir bir değer değildir: veri durağında listelenmez.
        secenekler: a.tur === 'radio' ? (a.radyolar ?? []).map((/** @type {Nesne} */ r) => ({ deger: r.deger, metin: r.metin ?? r.deger }))
          // Bekleyen bağlı listenin (kilitli ya da üstü sayfada boş) eski seçenekleri gösterilmez: üstü seçilince yenileri gelir.
          : a.bagli && bagliBekliyor(a, o) ? []
          : Array.isArray(a.secenekler) ? a.secenekler.filter((/** @type {Nesne} */ x, /** @type {number} */ i) => !yerTutucuSecenekMi(x.metin, x.deger, i === 0)) : null,
        yeni: o.alanlar.get(a.anahtar)?.yeni === true, hata: o.alanHatalari?.[a.anahtar] ?? null,
        // Seçim keşfi: alan bir seçimin belirli değerinde görünüyorsa koşul (görünen metinle) ve seçim alanlarının ilk değeri.
        kosul: a.kosul ? { secim: a.kosul.secim, degerler: a.kosul.degerler, metin: kosulMetni(o, a.kosul), ilk: o.kesifIlk?.[a.kosul.secim] ?? null } : null, ilk: o.kesifIlk?.[a.anahtar] ?? null,
        // Görünürlüğü belirleyen seçim ("Önce bunu seçin"): kontrol ve sayfadaki (uygulanmış) değeri — değişince yerinde "↓ Bu seçime göre
        // alanları getir" gösterilir.
        ...(['radio', 'select', 'checkbox'].includes(String(a.tur)) && kontrolMu(o, a.anahtar) ? { kontrol: true, sayfadaki: sayfadakiDeger(o, a.anahtar) } : {}),
        // Bağlı liste: seçenekleri üst listenin seçimine göre gelir; bekliyor: henüz seçenek yok (üst seçilip "Devam et" denince gelir).
        // getirildi: gösterilen seçenekler üstün şu anki değerine göre sayfadan geldi (yerinde "↓ … seçeneklerini getir" gerekmez);
        // bos: üstün şu anki değeri sayfaya uygulandı ama liste seçeneksiz kaldı.
        bagli: a.bagli ? {
          ust: a.bagli.ust, ustEtiket: alanAdi(o, a.bagli.ust), bekliyor: bagliBekliyor(a, o), getirildi: bagliGetirildi(o, a),
          // belirsiz: bağ keşifte kesinleşmedi (denenen değerlerde seçenek gelmedi); "Devam et"i kilitlemez.
          belirsiz: o.belirsizBagli?.has(a.anahtar) === true,
          bos: bagliBekliyor(a, o) && Boolean(o.degerler[a.bagli.ust]) && o.uygulanan[a.bagli.ust] === o.degerler[a.bagli.ust]?.deger
        } : null,
        // Tetik: bir metin alanına değer girilince bu alan beliriyor ya da seçenekleri geliyor (metin uygulamasının farkı).
        tetik: a.tetik ? { kaynak: a.tetik.kaynak, kaynakEtiket: alanAdi(o, a.tetik.kaynak), olay: a.tetik.olay } : null,
        deger: v ? (gizliAlan(a) && v.kaynak === 'elle' ? '••••••' : v.deger) : null, kaynak: v?.kaynak ?? null, gizli: gizliAlan(a),
        // Dosya alanı: kabul edilen uzantılar (sayfanın accept'i; "Dosya seç" süzgeci).
        ...(a.tur === 'file' ? { kabul: typeof a.kabul === 'string' && a.kabul ? a.kabul : null } : {})
      };
    };
    const adimlar = o.adimlar.map((/** @type {Nesne} */ a, i) => ({
      no: i + 1, alanlar: a.alanlar.map(alanGorunumu), bas: a.bas ?? null,
      fark: a.fark ? {
        sureMs: a.fark.sureMs, zamanAsimi: a.fark.zamanAsimi, beklemeMetinleri: a.fark.beklemeMetinleri, yeniMetinler: a.fark.yeniMetinler,
        yeniAlanlar: a.fark.yeniAlanlar.map((/** @type {Nesne} */ x) => x.etiket ?? x.anahtar), yeniDugmeler: a.fark.yeniDugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici),
        adres: a.fark.adres, tiklamaNotu: a.fark.tiklamaNotu ?? null, diyaloglar: Array.isArray(a.fark.diyaloglar) ? a.fark.diyaloglar : []
      } : null
    }));
    const adim = o.adimlar.length ? guncelAdim(o) : null;
    // Yazısız düğmeler (simge / görsel: ok, takvim simgesi…) listeyi doldurur; yazılı düğme varsa yalnız onlar gösterilir.
    const yazili = (o.sonAnlik?.dugmeler ?? []).filter((/** @type {Nesne} */ x) => x.metin);
    const adaylar = (yazili.length ? yazili : (o.sonAnlik?.dugmeler ?? [])).map((/** @type {Nesne} */ x) => ({
      secici: x.secici, metin: x.metin, kayitOlusturabilir: x.kayitOlusturabilir, enOlasi: x.enOlasi, guven: x.guven, baglanti: x.baglanti === true,
      ...(x.pencerede === true ? { pencerede: true } : {}), ...(x.arkada === true ? { arkada: true } : {}), ...(x.alanIkonu === true ? { alanIkonu: true } : {})
    }));
    /** @type {Nesne | null} */
    let soru = null;
    // "Veriyi düzenle" geçmiş adımda: o adımın alanları (girilen değerler önyazılı); gecmis: yerinde seçim uygulama düğmeleri gösterilmez.
    const gecmisNo = o.durum === 'veri' && Number.isInteger(o.duzeltAdimi) && o.adimlar[o.duzeltAdimi] ? Number(o.duzeltAdimi) : null;
    if (o.durum === 'veri' && gecmisNo !== null) soru = { tur: 'veri', adim: gecmisNo + 1, alanlar: o.adimlar[gecmisNo].alanlar.map(alanGorunumu), not: o.soruNotu ?? null, getiriliyor: null, gecmis: true };
    else if (o.durum === 'veri' && adim) {
      // "Veri girmeye devam et": önceki adımların ekranda görünen alanları sayfadaki değerleriyle (önceki değer yalnız bilgi).
      const devamlar = (o.devamAlanlari ?? []).map((/** @type {string} */ k) => o.alanlar.get(k)?.alan).filter(Boolean).map((/** @type {Nesne} */ a) => {
        const g0 = alanGorunumu(a);
        const v = o.degerler[a.anahtar];
        return { ...g0, deger: null, kaynak: null, onceki: { adim: o.adimlar.indexOf(alaninAdimi(o, a.anahtar)) + 1, deger: v ? (gizliAlan(a) ? '••••••' : v.deger) : null } };
      });
      soru = { tur: 'veri', adim: o.adimlar.length, alanlar: [...adim.alanlar.map(alanGorunumu), ...devamlar], not: o.soruNotu ?? null, getiriliyor: null,
        // "Doldurmadan burada bitir": en az bir basıştan sonra açılan (henüz basışı olmayan) adımın veri durağında.
        doldurmadanBitir: o.basisNo > 0 && !adim.bas };
    }
    // Yerinde zincir isteği sürerken aynı veri durağı gösterilir (kart yerinde kalır; düğme "getiriliyor" durumunda).
    else if (o.durum === 'zincir' && adim) soru = { tur: 'veri', adim: o.adimlar.length, alanlar: adim.alanlar.map(alanGorunumu), not: null, getiriliyor: o.zincirIstegi ?? null };
    else if (o.durum === 'karar') {
      // Öneri: son basışta beliren düğme (zincirin devamı), yoksa cümlenin adını verdiği / tek aday, yoksa en olası aday. Geri / sil / vazgeç /
      // kapat kalıplı düğmeler ve az önce basılan düğme önerilmez (listede yine seçilebilir).
      const sonBasilan = [...o.adimlar].reverse().find((/** @type {Nesne} */ a) => a.bas)?.bas?.secici ?? null;
      const onerilir = (/** @type {Nesne | null | undefined} */ x) => Boolean(x) && !olumsuzDugme(x?.metin) && x?.secici !== sonBasilan;
      const yeniDugme = (o.sonFark?.yeniDugmeler ?? []).map((/** @type {Nesne} */ d) => adaylar.find((/** @type {Nesne} */ x) => x.secici === d.secici)).find(onerilir);
      const cumleden = tekAday(adaylar, o.cumle.dugmeler);
      soru = {
        tur: 'karar', adaylar, bitirilebilir: o.basisNo > 0,
        oneri: yeniDugme?.secici ?? (onerilir(cumleden) ? cumleden?.secici : null) ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi && onerilir(x))?.secici
          ?? adaylar.find(onerilir)?.secici ?? null
      };
    }
    else if (o.durum === 'onay') soru = { tur: 'onay', dugme: o.onayBekleyen };
    // Keşif toplu sorusu: "Keşif için şu düğmelere basılabilir" (her düğme: ad + davranışından neden; emin olunup olunmadığı).
    else if (o.durum === 'kesifOnay' && Array.isArray(o.kesifOnayListesi)) {
      soru = { tur: 'kesifOnay', dugmeler: o.kesifOnayListesi.map((/** @type {Nesne} */ d) => ({ secici: d.secici, metin: d.metin ?? null, emin: d.emin === true, neden: d.neden ?? null })) };
    }
    else if (o.durum === 'diyalog') soru = { tur: 'diyalog', diyalogTuru: o.diyalogSorusu?.tur ?? 'confirm', mesaj: o.diyalogSorusu?.mesaj ?? '', dugme: o.diyalogSorusu?.dugme ?? null };
    else if (o.durum === 'hataSorusu') soru = { tur: 'hata', metinler: o.hataSorusu?.metinler ?? [] };
    else if (o.durum === 'secim') soru = { tur: 'secim' };
    else if (o.durum === 'bitisSecim') soru = { tur: 'bitisSecim', secimTuru: o.bitisSecimi ?? 'metin' };
    else if (o.durum === 'hayirSecim') {
      soru = { tur: 'hayirSecim', adaylar, mesajlar: adayMesajlari(o.sonAnlik?.eylem ?? null, o.cumle.mesajlar), oneri: (adaylar.some((/** @type {Nesne} */ x) => x.secici === o.hayirOneri) ? o.hayirOneri : null) ?? tekAday(adaylar, o.cumle.dugmeler)?.secici ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi)?.secici ?? null };
    } else if (o.durum === 'bitis') {
      // gonderimVar: herhangi bir basışta yazma isteği / sayfa değişimi oldu mu (yoksa "Bitti" için uyarı; arayüz etiket değişince yeniden hesaplar).
      soru = {
        tur: 'bitis', gorulenler: o.gorulenler, etiketler: o.etiketler, adres: o.adresBitti, onerilenAdres: o.sonFark?.adres?.sonra ?? null, olumsuz: o.olumsuz,
        // Bitti öğeleri (görünür olunca bitti) ve son basışta yeni beliren pencere önerisi ("Açılan pencere görününce bitti"; eklenmemişse).
        ogeler: (o.bitisOgeleri ?? []).map((/** @type {Nesne} */ x) => ({ secici: x.secici, metin: x.metin, kaynak: x.kaynak, secili: x.secili !== false })),
        pencereOnerisi: (o.sonPencereler ?? []).find((/** @type {Nesne} */ p) => !(o.bitisOgeleri ?? []).some((/** @type {Nesne} */ x) => x.secici === p.secici)) ?? null,
        gonderimVar: o.izin === 'hayir' || o.gonderimVar === true, uyarilar: bitisUyarilari({ izin: o.izin, gonderimVar: o.gonderimVar === true, gorulenler: o.gorulenler, etiketler: o.etiketler })
      };
    } else if (o.durum === 'kaydet') {
      soru = {
        tur: 'kaydet', ozet: ozet(o), dogrulama: o.dogrulama, dogrulanabilir: o.izin !== 'hayir', baslik: o.senaryoBasligi, farklar: o.farklar ?? null,
        uyarilar: o.olumsuz ? [] : bitisUyarilari({ izin: o.izin, gonderimVar: o.gonderimVar === true, gorulenler: o.gorulenler, etiketler: o.etiketler }),
        // Projede aynı adlı test verisi tablosu varsa (düzenleme kipi ya da başka ekranın tablosu) birleştirme kararı özet sekmesinde istenir:
        // önceden haber verilir.
        tabloKarariGerekebilir: true
      };
    }
    else if (o.durum === 'kaydedildi') soru = { tur: 'kaydedildi', ...o.kayit };
    else if (o.durum === 'askida') {
      // Tarayıcı kapandı (süre doldu / pencere kapatıldı): toplananlar duruyor — "Kaldığın yerden devam et" ya da "Toplananları kaydet".
      soru = {
        tur: 'askida', mesaj: o.askida?.mesaj ?? 'Tarayıcı kapandı.', kod: o.askida?.kod ?? null, hedef: o.askida?.hedef ?? null,
        // Kaydedilebilir: bitiş koşulu verilmiş, Hayır izni (düğme / mesaj seçilir) ya da en az bir basış var (bitiş koşulu sorulur).
        kaydedilebilir: Boolean(o.bitis) || o.izin === 'hayir' || o.basisNo > 0, bitisVar: Boolean(o.bitis),
        toplanan: { adim: o.adimlar.length, deger: Object.keys(o.degerler).length, basis: o.basisNo, etiket: Object.keys(o.etiketler ?? {}).length }
      };
    }
    // Keşif basışıyla açılan alanlar (ilk adımın veri durağında bilgi olarak): akışta o düğmeye basılırsa sorulur.
    if (soru && soru.tur === 'veri' && soru.adim === 1) {
      soru.kesifAlanlari = (o.kesifBasislari ?? []).filter((/** @type {Nesne} */ x) => Array.isArray(x.yeniAlanlar) && x.yeniAlanlar.length)
        .map((/** @type {Nesne} */ x) => ({ dugme: String(x.dugme), alanlar: x.yeniAlanlar.slice(0, 30) }));
    }
    // Sayfanın doldurduğu (salt okunur, hesaplanan) alanlar: sorulmaz; veri durağında ve bitişte bilgi olarak, sayfadaki değerleriyle
    // ("neden sorulmadı?" — sayfa kendisi dolduruyor). Takvimden seçilen salt okunur tarih alanı sorulur (burada değil).
    if (soru && (soru.tur === 'veri' || soru.tur === 'bitis')) {
      soru.saltOkunurlar = (Array.isArray(o.sonAnlik?.alanlar) ? o.sonAnlik.alanlar : [])
        // (Seçime göre kilitlenen alan bu bölümde değil: veri durağında aynı yerinde, kilitli gösterilir.)
        .filter((/** @type {Nesne} */ a) => nesneMi(a) && a.saltOkunur === true && a.takvimden !== true && a.devreDisi !== true && !o.alanlar.get(a.anahtar)?.alan?.kilitKosulu
          && !['radio', 'checkbox', 'file', 'select', 'select-one', 'select-multiple'].includes(String(a.tur)))
        .slice(0, 30).map((/** @type {Nesne} */ a) => ({ anahtar: a.anahtar, etiket: a.etiket ?? adsizEtiket(a), deger: gizliAlan(a) ? null : a.mevcut ?? null }));
    }
    // Tarayıcı süresi (açıkken): kalan süre ve "Süreyi uzat" uyarısı.
    let sure = null;
    if (o.tarayici === 'acik') { try { sure = tarama().hizliSure(o.isId); } catch { sure = null; } }
    return {
      tarayici: o.tarayici ?? 'acik', sure,
      // "Tarayıcıda şu an": sürekli akış var mı (iş tarayıcısı açık) ve tarayıcı görünür mü ("Tarayıcıyı göster" yalnız bunda).
      canliAkis: Boolean(o.tarayici !== 'kapali' && d && d.durum === 'suruyor' && d.canliDuyuruYolu), gorunur: Boolean(d && d.gorunur),
      uyari: o.sayfaUyarisi ?? null, id: o.id, durum: o.durum, izin: o.izin, izinAdi: IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (o.izin)], projeId: o.projeId, ortam: o.ortam, hedef: o.hedefYol,
      // Seçilen bağlam (yalnız tür ve profil adı; değerleri gösterilmez).
      baglam: o.baglamProfili ? { tur: o.baglamProfili.tur, ad: o.baglamProfili.ad, uygulandi: o.baglamUygulandi === true } : null,
      ekran: o.ekran, cumle: o.cumle, duzenleme: Boolean(o.ekran.id), modelGuncelleme: Boolean(o.modelGuncelleme && o.ekran.id), durak: durakNo(o), calisiyor: o.calisiyor, sonHata: o.sonHata, hata: o.hata,
      kesif: o.kesifAnlik ? {
        alanSayisi: o.kesifAnlik.alanlar.length, dugmeAdaylari: o.kesifAnlik.dugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici).slice(0, 8),
        mesajAdaylari: adayMesajlari(o.kesifAnlik.eylem, o.cumle.mesajlar).slice(0, 8), notlar: [...(o.kesifAnlik.eylem?.notlar ?? []), ...(o.kesifNotlari ?? [])]
      } : null,
      adimlar, soru, goruntu: o.sonGoruntu, gunluk: o.gunluk.slice(-20), dogrulamaAdimlari: o.dogrulamaAdimlari ?? null,
      bulgular: o.bulgular, zincir: o.bagliUst.size ? zincirMetni([...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), (k) => alanAdi(o, k)) : [],
      is: is ? { durum: is.durum, adimlar: is.adimlar, hata: is.hata, kodIstegi: is.kodIstegi } : null
    };
  }
  /** Şeritteki durak (1 Başlat … 6 Kaydet). @param {Nesne} o */
  function durakNo(o) {
    // Askıda / tarayıcı yeniden açılıyor: kalınan adımın durağı.
    if (o.durum === 'askida' || o.durum === 'yeniden') return durakNo({ durum: (o.durum === 'askida' ? o.askida?.hedef : o.yenidenAcma?.hedef) ?? 'karar' });
    if (o.durum === 'kesif' || o.durum === 'kesifOnay' || (o.durum === 'calisiyor' && o.kesifBasiliyor)) return 2;
    if (o.durum === 'veri' || o.durum === 'zincir') return 3;
    if (['karar', 'onay', 'diyalog', 'hataSorusu', 'secim', 'calisiyor', 'hayirSecim'].includes(o.durum)) return 4;
    if (o.durum === 'bitis' || o.durum === 'bitisSecim') return 5;
    return ['kaydet', 'dogrulama', 'kaydedildi'].includes(o.durum) ? 6 : 1;
  }
  /** Kaydedilecekler (özet). @param {Nesne} o */
  function ozet(o) {
    return {
      adimlar: o.adimlar.map((/** @type {Nesne} */ a) => ({ alanSayisi: a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar]).length, bas: a.bas?.metin ?? a.bas?.secici ?? null })),
      bitis: o.bitis ? { bitti: o.bitis.bitti, hata: o.bitis.hata, devam: o.bitis.devam, adres: o.bitis.adres, ogeler: o.bitis.ogeler ?? [] } : null,
      olumsuz: o.bitis?.olumsuz ?? null, izin: IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (o.izin)], ekranAdi: o.ekran.ad
    };
  }

  // ---- Uçların işleri ----
  /** @param {Veritabani} vt @param {string} projeId @param {string | null} ekranId */
  function secenekler(vt, projeId, ekranId) {
    temizle();
    const ortamlar = ortamlariListele(vt, projeId).map((x) => {
      const t = etkinGirisTarifi(vt, projeId, x.id).tarif;
      return { id: x.id, ad: x.ad, varsayilan: x.varsayilan, canli: riskliOrtamMi(x), tarif: Boolean(t), baglamTuru: t?.baglamDegistirme?.baglamTuru ?? null };
    });
    // Bağlam profilleri: yalnız kimlik / tür / ad / kapsam (değerleri — gizli olabilir — arayüze gitmez).
    const baglamProfilleri = baglamProfilleriniListele(vt, projeId, undefined, { yalnizAd: true }).map((p) => ({ id: p.id, tur: p.tur, ad: p.ad, ortamId: p.ortamId }));
    /** @type {Nesne | null} */
    let ekran = null;
    if (ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      ekran = {
        id: e.id, ad: e.ad, urlYolu: m && nesneMi(m.model) && typeof m.model.ekranUrl === 'string' ? m.model.ekranUrl : null,
        // Modeli güncellerken "Hangi senaryonun verileriyle gezilsin?" (yalnız başlık; değerler arayüze gitmez).
        senaryolar: senaryolariListele(vt, { projeId, ekranId: e.id }).map((s) => ({ id: s.id, baslik: s.baslik }))
      };
    }
    const suren = [...oturumlar.values()].find((x) => x.projeId === projeId && !['kaydedildi', 'iptal', 'hata'].includes(x.durum));
    return {
      ortamlar, baglamProfilleri, ekran, surenOturum: suren ? { id: suren.id, ekranAdi: suren.ekran.ad } : null,
      // CANLI ortamda bir kez sorulan onayın metni (izne göre; tek kaynak: akis.mjs).
      canliOnayMetinleri: Object.fromEntries(IZINLER.map((i) => [i, canliOnayMetni(i)]))
    };
  }

  /** @param {Veritabani} vt @param {Nesne} g @param {{ sunucuAdresi: string }} baglam */
  function baslat(vt, g, baglam) {
    temizle();
    const projeId = kimlikAl(g.projeId, 'projeId');
    const proje = projeGetir(vt, projeId);
    if (!proje) throw new DepoHatasi('Proje bulunamadı.');
    const ortamId = kimlikAl(g.ortamId, 'ortamId');
    const ortam = ortamlariListele(vt, projeId).find((x) => x.id === ortamId);
    if (!ortam) throw new DepoHatasi('Ortam bulunamadı.');
    const izin = String(g.izin);
    if (!IZINLER.includes(izin)) throw new HizliTestHatasi('IZIN', 'Nöbetçi’nin düğmelere basıp basamayacağını seçin (Evet / Bana sor / Hayır).');
    const hedefHam = metin(g.hedef, 2000);
    if (!hedefHam) throw new HizliTestHatasi('HEDEF', 'Sayfa adresini yazın (ör. /basvuru).');
    // Tam adres yazıldıysa taban ve yol ayrılır; kayıtsız başka site sorulmadan (onaysız) hiçbir istek atılmaz.
    // Diğer adres hataları taramanın kendi denetiminde (aynı mesajla) verilir.
    let hedef = hedefHam;
    /** @type {string | null} */
    let hedefKoken = null;
    try {
      const c = hedefCoz(ortam.tabanUrl, hedefHam, ekKokenleri(ortam));
      hedefKoken = c.koken ?? null;
      if (/^[a-z][a-z0-9+.-]*:/i.test(hedefHam) || hedefKoken) hedef = c.yol;
    } catch (e) {
      if (e instanceof HedefHatasi && e.bilinmeyenKoken) throw new HizliTestHatasi('TABAN_KAYITLI_DEGIL', e.message, 409, { koken: e.bilinmeyenKoken });
      if (!(e instanceof HedefHatasi)) throw e;
    }
    /** @type {{ id: string | null; ad: string; anahtar: string }} */
    let ekran;
    if (g.ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === kimlikAl(g.ekranId, 'ekranId'));
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      if (m && nesneMi(m.model) && (m.model.tur === 'altModel' || m.model.tur === 'ortakAkis')) throw new HizliTestHatasi('EKRAN_TURU', 'Alt model ve genel senaryo Nöbetçi taramasıyla düzenlenmez.');
      ekran = { id: e.id, ad: e.ad, anahtar: e.anahtar };
    } else {
      const ad = metin(g.ekranAdi, 120);
      if (!ad) throw new HizliTestHatasi('EKRAN_ADI', 'Testin (ekranın) adını yazın.');
      const anahtar = ekranAnahtariOner(ad);
      const ayni = ekranlariListele(vt, projeId).find((x) => x.anahtar === anahtar);
      ekran = ayni ? { id: ekranModeliGetir(vt, ayni.id) ? ayni.id : null, ad: ayni.ad, anahtar } : { id: null, ad, anahtar };
    }
    const ornek = ekran.id && typeof g.ornekSenaryoId === 'string' && g.ornekSenaryoId ? ornekSenaryo(vt, projeId, String(ekran.id), g.ornekSenaryoId, ortamId) : null;
    // Bağlam profili (teste göre seçilir): tarayıcı açılmadan doğrulanır; taramaya profil ADIYLA verilir (aynı çözüm ve denetim yolu).
    const baglamSecimi = baglamSeciminiDogrula(vt, projeId, ortam, g);
    // İzinler ve CANLI onayı: taramayla AYNI denetim (tarayıcı açılmadan). CANLI'da kilit yok; onay bir kez istenir.
    const govde = {
      kip: 'hizliTest', projeId, ortamId, hedef: hedefKoken ? `${hedefKoken}${hedef}` : hedef, izin, onay: true, girissiz: g.girissiz === true,
      baglamProfilleri: baglamSecimi ? [baglamSecimi.ad] : [], ...(g.canliOnay === true ? { canliOnay: true } : {})
    };
    if (riskliOrtamMi(ortam) && g.canliOnay !== true) {
      throw new HizliTestHatasi('CANLI_ONAY_GEREKLI', canliOnayMetni(izin), 409, { ortamAdi: ortam.ad });
    }
    ucDenetle(vt, '/platform/tarama/baslat', govde);
    const baslatGovdesi = { ...govde, ...(ekran.id ? { ekranId: ekran.id } : { ekranAdi: ekran.ad }) };
    const { isId } = tarama().baslat(vt, baslatGovdesi, baglam);
    const id = randomBytes(12).toString('hex');
    /** @type {Nesne} */
    const o = {
      // Tarayıcının yeniden açılması (süre doldu / kaydet aşamasından geri dönüş / doğrulama): aynı gövde ve denetim. tarayici: 'acik' | 'kapali'.
      denetimGovdesi: govde, baslatGovdesi, tarayici: 'acik', askida: null, yenidenAcma: null,
      id, isId, projeId, projeAdi: proje.ad, ortam: { id: ortam.id, ad: ortam.ad, canli: riskliOrtamMi(ortam) }, hedefYol: hedef, ekran, izin,
      girissiz: g.girissiz === true, cumle: cumleyiOku(g.cumle), cumleMetni: metin(g.cumle, 1000),
      // Seçilen bağlam profili ({ tur, id, ad } | null; değerleri oturumda tutulmaz) ve tarayıcıda uygulandı mı (her açılışta yeniden uygulanır).
      baglamProfili: baglamSecimi, baglamUygulandi: false,
      durum: 'kesif', baslangic: simdi(), sonErisim: simdi(), komutNo: 0, bekleyen: null, calisiyor: 'Sayfa açılıyor ve keşfediliyor… (hiçbir düğmeye basılmaz)',
      // Modeli güncelleme (mevcut ekran): örnek senaryo (model + çözülmüş veri; yalnız bellekte) ve kayıt oluşturabilecek düğmeye sormadan basılmaz.
      ornek, modelGuncelleme: Boolean(ekran.id && g.modelGuncelleme === true), otomatikVt: ornek ? vt : null,
      adimlar: [], alanlar: new Map(), degerler: {}, tabloSecimleri: ornek ? { ...ornek.tabloSecimleri } : {}, alanHatalari: {}, gorulenler: [], etiketler: {}, adresBitti: null, olumsuz: null,
      // Bağlı listeler: alt → üst; tablolar için seçenek gözlemleri; zincir keşfinin bulguları (kullanıcıya gösterilen cümleler).
      bagliUst: new Map(), gozlemler: [], bulgular: [],
      // Keşifte kesinleşmeyen bağların alt listeleri (belirsiz bağ; seçenek gelince silinir).
      belirsizBagli: new Set(),
      // "Önce bunu seçin" isteği: sayfaya uygulanan görünürlük seçimi ve sayfadaki önceki değeri (bir kez kullanılır).
      kosulIstegi: null,
      // Sayfaya uygulanan değerler (anahtar → değer), son doldurmada gönderilenler; yerinde zincir isteği (üst anahtarı).
      uygulanan: {}, sonGonderilen: {}, zincirIstegi: null,
      // Bağlı listelerin dolma süreleri (ms; keşif ve doldurma ölçümleri): anahtar → ölçümler. Modele "olağan yüklenme süresi" olur.
      yuklenme: {},
      basisNo: 0, onceGorunenler: new Set(), gonderimVar: false, diyalogSorusu: null, sonAnlik: null, kesifAnlik: null, sonFark: null, sonGoruntu: null, gunluk: [], dogrulama: null, bitis: null, hata: null, sonHata: null,
      senaryoBasligi: hizliSenaryoBasligi(String(ekran.ad)), baslik: ''
    };
    oturumlar.set(id, o);
    isiDinle(o, isId);
    gunluk(o, `Başlatıldı: ${ortam.ad} ortamı, izin “${IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (izin)]}”${o.cumle.dugmeler.length || o.cumle.mesajlar.length ? `; cümleden: ${[...o.cumle.dugmeler.map((x) => `düğme “${x}”`), ...o.cumle.mesajlar.map((x) => `mesaj “${x}”`)].join(', ')}` : ''}.`);
    if (baglamSecimi) gunluk(o, `Bağlam: ${baglamSecimi.tur} = ${baglamSecimi.ad} seçildi; girişten sonra uygulanacak.`);
    if (ornek) gunluk(o, `Veriler “${ornek.baslik}” senaryosundan doldurulur${ornek.ortamAdi ? ` (${ornek.ortamAdi} verisi)` : ''}; değeri olmayan alanlar sorulur.`);
    return { id };
  }

  /**
   * Örnek senaryo: ekranın senaryosu; verisi seçilen ortamınki, o ortamda yoksa ilk verili ortamınki. Kasa açık olmalı (veri şifreli).
   * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} senaryoId @param {string} ortamId
   */
  function ornekSenaryo(vt, projeId, ekranId, senaryoId, ortamId) {
    const s = senaryoGetir(vt, kimlikAl(senaryoId, 'ornekSenaryoId'));
    if (!s || s.projeId !== projeId || s.ekranId !== ekranId) throw new DepoHatasi('Örnek senaryo bu ekranın senaryosu değil.');
    const m = ekranModeliGetir(vt, ekranId);
    if (!m || !nesneMi(m.model)) throw new DepoHatasi('Ekranın modeli bulunamadı.');
    const icerik = /** @type {Nesne} */ (s.icerik ?? {});
    const ortamlar = nesneMi(icerik.ortamlar) ? Object.keys(icerik.ortamlar) : [];
    const veriOrtami = ortamlar.includes(ortamId) ? ortamId : ortamlar[0];
    const veri = veriOrtami ? senaryoOrtamVerisi(vt, icerik, veriOrtami) ?? {} : {};
    const ortamAdi = veriOrtami && veriOrtami !== ortamId ? ortamlariListele(vt, projeId).find((x) => x.id === veriOrtami)?.ad ?? null : null;
    return { id: s.id, baslik: s.baslik, model: m.model, veri, tabloSecimleri: nesneMi(icerik.tabloSecimleri) ? /** @type {Nesne} */ (icerik.tabloSecimleri) : {}, ortamAdi };
  }

  /**
   * Başlat gövdesindeki bağlam seçimi (baglamProfilleri: [{ tur, profilId }]) → { tur, id, ad } | null. Boş profilId "Bağlam yok"tur.
   * Tarifle uyumsuzluk (tarif yok, bağlam adımı yok, başka tür, girişsiz) tarayıcı açılmadan açık hatayla reddedilir. Profilin tarifin
   * kullandığı alanlarının dolu olduğu taramanın kendi denetimindedir (tarama/yonetici.mjs; aynı ileti).
   * @param {Veritabani} vt @param {string} projeId @param {{ id: string; ad: string }} ortam @param {Nesne} g
   * @returns {{ tur: string; id: string; ad: string } | null}
   */
  function baglamSeciminiDogrula(vt, projeId, ortam, g) {
    if (g.baglamProfilleri === undefined || g.baglamProfilleri === null) return null;
    if (!Array.isArray(g.baglamProfilleri) || g.baglamProfilleri.length > 12) throw new HizliTestHatasi('BAGLAM', 'Bağlam seçimi geçersiz (her bağlam türü için en fazla bir profil).');
    /** @type {Array<{ tur: string; profilId: string }>} */
    const secilen = [];
    for (const x of g.baglamProfilleri) {
      if (!nesneMi(x) || typeof x.tur !== 'string' || !x.tur.trim()) throw new HizliTestHatasi('BAGLAM', 'Bağlam seçimi geçersiz: her seçimde tür ve profil olmalı.');
      if (x.profilId === undefined || x.profilId === null || x.profilId === '') continue;
      const tur = x.tur.trim();
      if (secilen.some((s2) => s2.tur === tur)) throw new HizliTestHatasi('BAGLAM', `“${tur}” bağlamı için birden çok profil seçildi; en fazla bir profil seçin.`);
      secilen.push({ tur, profilId: kimlikAl(x.profilId, 'profilId') });
    }
    if (!secilen.length) return null;
    const ilk = secilen[0];
    if (g.girissiz === true) throw new HizliTestHatasi('BAGLAM', 'Giriş yapmadan açılan sayfada bağlam profili uygulanamaz; “Bağlam yok”u seçin ya da girişli açın.');
    const tarif = etkinGirisTarifi(vt, projeId, ortam.id).tarif;
    const tarifTuru = tarif?.baglamDegistirme?.baglamTuru ?? null;
    if (!tarif) throw new HizliTestHatasi('BAGLAM', `“${ortam.ad}” ortamında giriş tarifi yok; “${ilk.tur}” bağlam profili uygulanamaz. “Bağlam yok”u seçin ya da giriş tarifi tanımlayın (Ayarlar > Giriş profilleri > Giriş tarifi).`);
    if (!tarifTuru) throw new HizliTestHatasi('BAGLAM', `“${ortam.ad}” ortamının giriş tarifinde bağlam değiştirme adımı yok; “${ilk.tur}” bağlam profili uygulanamaz. “Bağlam yok”u seçin ya da tarife bağlam adımlarını ekleyin (Ayarlar > Giriş profilleri > Giriş tarifi).`);
    const yanlis = secilen.find((s2) => s2.tur !== tarifTuru);
    if (yanlis) throw new HizliTestHatasi('BAGLAM', `“${ortam.ad}” ortamının giriş tarifi yalnız “${tarifTuru}” bağlamını değiştiriyor; “${yanlis.tur}” bağlam profili uygulanamaz. Bu tür için “Bağlam yok”u seçin.`);
    const p = baglamProfilleriniListele(vt, projeId, ilk.tur, { yalnizAd: true }).find((x) => x.id === ilk.profilId);
    if (!p || (p.ortamId !== null && p.ortamId !== ortam.id)) throw new HizliTestHatasi('BAGLAM', `Seçilen “${ilk.tur}” bağlam profili “${ortam.ad}” ortamında tanımlı değil (silinmiş ya da başka ortama ait olabilir); yeniden seçin.`);
    return { tur: p.tur, id: p.id, ad: p.ad };
  }

  /**
   * Dosya alanının değeri: Nöbetçi'nin şifreli senaryo dosyası deposundaki dosyanın başvurusu ("nobetci-dosya://<kimlik>/<ad>"; kullanıcı
   * bilgisayarından yükledi ya da depodan seçti — değer üretilmez). Tarayıcıya giden: dosyanın oturuma özel geçici klasördeki düz kopyası
   * (yalnız oturum boyunca; kayıt / iptal / süre dolunca silinir). Senaryoya başvuru yazılır; normal koşu aynı başvuruyu kendi geçici
   * klasörüne çözer (veri-oku.mjs) ve setInputFiles ile yükler.
   * @param {Veritabani} vt @param {Nesne} o @param {Nesne} a alan @param {string} referans @param {{ medyaKlasoru?: string; dosyaKoku?: string }} c
   */
  async function dosyaYolunuCoz(vt, o, a, referans, c) {
    const r = referansCoz(referans);
    if (!r) throw new HizliTestHatasi('DOSYA', `“${a.etiket ?? a.anahtar}”: dosya seçin (bilgisayarınızdan ya da Nöbetçi'nin dosya deposundan).`);
    if (!senaryoDosyasiBilgisi(vt, r.id)) throw new HizliTestHatasi('DOSYA', `“${a.etiket ?? a.anahtar}”: seçilen dosya depoda yok (silinmiş olabilir); yeniden seçin.`);
    if (!c.medyaKlasoru || !c.dosyaKoku) throw new HizliTestHatasi('DOSYA', 'Dosya bu sunucuda hazırlanamadı (geçici klasör yok).', 500);
    if (!o.dosyaKlasoru) o.dosyaKlasoru = { kok: c.dosyaKoku, klasor: kosuKlasoruOlustur(c.dosyaKoku, `hizli-${o.id}`) };
    const cozum = await referanslariCoz(vt, referans, { medyaKlasoru: c.medyaKlasoru, hedefKlasor: o.dosyaKlasoru.klasor });
    if (cozum.eksikler.length) throw new HizliTestHatasi('DOSYA', `“${a.etiket ?? a.anahtar}”: “${cozum.eksikler[0]}” şifreli depoda bulunamadı; yeniden seçin.`);
    return String(cozum.deger);
  }

  /**
   * Veri durağı: kullanıcının girdiği değerler (elle, tablodan ya da dosya). Tablo başvuruları tarayıcıya gitmeden önce çözülür (yalnız bellekte).
   * @param {Veritabani} vt @param {Nesne} g @param {{ medyaKlasoru?: string; dosyaKoku?: string }} [c]
   */
  async function veri(vt, g, c = {}) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['veri']);
    const girilen = nesneMi(g.degerler) ? g.degerler : {};
    // "Veriyi düzenle" (güncel adımda alan yok): geçmiş adımın verisi düzenleniyor.
    const gecmis = Number.isInteger(o.duzeltAdimi) && o.adimlar[o.duzeltAdimi] ? Number(o.duzeltAdimi) : null;
    if (gecmis !== null && ((typeof g.kosulSecimi === 'string' && g.kosulSecimi) || (typeof g.zincir === 'string' && g.zincir))) {
      throw new HizliTestHatasi('GECMIS', 'Geçmiş adımın verisi düzenlenirken bir seçim sayfaya tek başına uygulanamaz: değeri seçip “Devam et” deyin (zincir yeniden yürütülür).');
    }
    const adim = gecmis !== null ? o.adimlar[gecmis] : guncelAdim(o);
    // "Veri girmeye devam et": önceki adımların değiştirilen alanları bu adıma alınır (taşı / ikinci kez; karar gerekirse 409 TEKRAR).
    if (gecmis === null && ((Array.isArray(o.devamAlanlari) && o.devamAlanlari.length) || Object.keys(o.tekrarBekleyen ?? {}).length)) {
      const anlik = Boolean((typeof g.kosulSecimi === 'string' && g.kosulSecimi) || (typeof g.metinUygula === 'string' && g.metinUygula) || (typeof g.zincir === 'string' && g.zincir));
      devamAlanlariniAl(o, adim, girilen, g.tekrarKararlari, anlik);
    }
    // Doldurma sırası: kullanıcının verdiği sıra (yukarı / aşağı taşıma); verilmeyenler sonda, sayfa sırasıyla kalır (kararlı sıralama).
    if (Array.isArray(g.sira)) {
      const sira = new Map(g.sira.filter((/** @type {unknown} */ k) => typeof k === 'string').map((/** @type {string} */ k, /** @type {number} */ i) => [k, i]));
      adim.alanlar.sort((/** @type {Nesne} */ x, /** @type {Nesne} */ y) => (sira.get(x.anahtar) ?? 1e6) - (sira.get(y.anahtar) ?? 1e6));
    }
    /** @type {Record<string, Nesne>} */
    const yeni = {};
    for (const a of adim.alanlar) {
      const v = girilen[a.anahtar];
      if (v === undefined) continue;
      if (!nesneMi(v) || v.deger === null || v.deger === '') { yeni[a.anahtar] = null; continue; }
      const kaynak = v.kaynak === 'tablo' ? 'tablo' : v.kaynak === 'dosya' || a.tur === 'file' ? 'dosya' : 'elle';
      const deger = typeof v.deger === 'boolean' ? v.deger : String(v.deger).slice(0, 2000);
      if (kaynak === 'tablo' && !degerBasvurusu(deger)) throw new HizliTestHatasi('DEGER', `“${a.etiket ?? a.anahtar}”: tablodan gelen değer bir tablo başvurusu olmalı.`);
      if (kaynak === 'dosya') {
        if (a.tur !== 'file') throw new HizliTestHatasi('DEGER', `“${a.etiket ?? a.anahtar}” bir dosya alanı değil.`);
        // Dosya yolu (oturuma özel geçici kopya) değer değişmediyse yeniden çözülmez.
        if (!(o.degerler[a.anahtar]?.deger === deger && o.dosyaYollari?.[a.anahtar])) {
          const yol = await dosyaYolunuCoz(vt, o, a, String(deger), c);
          o.dosyaYollari = { ...(o.dosyaYollari ?? {}), [a.anahtar]: yol };
        }
      }
      // Parolalı alanda "••••••" (maske) gelirse mevcut değer korunur.
      if (gizliAlan(a) && deger === '••••••' && o.degerler[a.anahtar]) { yeni[a.anahtar] = o.degerler[a.anahtar]; continue; }
      yeni[a.anahtar] = { deger, kaynak };
      if (kaynak === 'tablo' && nesneMi(v.tabloSecimi) && typeof v.tabloSecimi.anahtar === 'string' && nesneMi(v.tabloSecimi.kosul)) {
        o.tabloSecimleri[v.tabloSecimi.anahtar] = Object.fromEntries(Object.entries(v.tabloSecimi.kosul).filter(([, x]) => typeof x === 'string').map(([k, x]) => [String(k).slice(0, 100), String(x).slice(0, 200)]));
      }
    }
    if (gecmis !== null) return gecmisVeriyiUygula(vt, o, g, adim, yeni);
    // Bağlı liste: üst listenin değeri değiştiyse alt listelerin (ve onların altlarının) eski değerleri gönderilmez — alt seçenekler
    // yeni üst seçilince gelir ve yeniden sorulur.
    const ustDegisti =Object.keys(yeni).filter((k) => (yeni[k]?.deger ?? null) !== (o.degerler[k]?.deger ?? null));
    for (const [k, v] of Object.entries(yeni)) { if (v) o.degerler[k] = v; else delete o.degerler[k]; }
    for (const a of adim.alanlar) {
      if (a.bagli && ustleri(o, a.anahtar).some((u) => ustDegisti.includes(u)) && o.degerler[a.anahtar] && !ustDegisti.includes(a.anahtar)) delete o.degerler[a.anahtar];
    }
    // Bu turda üstü doldurulan / seçenekleri henüz gelmemiş, değeri boş bağlı listeler: doldurmadan sonra (yeni seçeneklerle) sorulur.
    o.sorulacakBagli = adim.alanlar.filter((/** @type {Nesne} */ a) => a.bagli && !o.degerler[a.anahtar]
      && (bagliBekliyor(a, o) || ustleri(o, a.anahtar).some((u) => ustDegisti.includes(u)))).map((/** @type {Nesne} */ a) => a.anahtar);
    // Yerinde zincir isteği: üst liste bu adımda olmalı, bağlı altı bulunmalı ve değeri girilmiş olmalı.
    /** @type {{ anahtar: string; altlar: string[]; kosul?: boolean; metin?: boolean } | null} */
    let zincir = null;
    o.metinIstegi = null;
    // "Önce bunu seçin": görünürlüğü belirleyen seçim (radyo / liste / onay kutusu) yalnız kendisi sayfaya uygulanır; sayfa sakinleşince o
    // seçimin alanları aynı veri durağında sorulur (yerinde zincir isteğiyle aynı yol: düğmeye basılmaz, eksik denetlenmez).
    if (typeof g.kosulSecimi === 'string' && g.kosulSecimi) {
      const k = adim.alanlar.find((/** @type {Nesne} */ a) => a.anahtar === g.kosulSecimi);
      // (Keşifte kontrol olarak bilinmeyen seçim de uygulanabilir: sayfanın tepkisi gözlenir — beliren / kaybolan / adı değişen alanlar.)
      if (!k || !['radio', 'select', 'checkbox'].includes(String(k.tur))) throw new HizliTestHatasi('KOSUL', 'Yalnız bir seçim (radyo, açılır liste, onay kutusu) sayfaya tek başına uygulanabilir.');
      if (!o.degerler[k.anahtar] || degerBasvurusu(o.degerler[k.anahtar].deger)) throw new HizliTestHatasi('KOSUL', `Önce “${alanAdi(o, k.anahtar)}” için bir seçenek seçin.`);
      zincir = { anahtar: k.anahtar, altlar: [], kosul: true };
      o.kosulIstegi = { anahtar: k.anahtar, onceki: sayfadakiDeger(o, k.anahtar) };
    } else if (typeof g.metinUygula === 'string' && g.metinUygula) {
      // Metin alanı yazılıp alandan çıkılınca yalnız o değer sayfaya uygulanır (düğmeye basılmaz, eksik denetlenmez); sayfa sakinleşince
      // yeniden okunur ve fark (beliren alan, dolan liste, sayfanın doldurduğu değer) aynı veri durağında gösterilir.
      const k = adim.alanlar.find((/** @type {Nesne} */ a) => a.anahtar === g.metinUygula);
      if (!k || !metinAlaniMi(k)) throw new HizliTestHatasi('METIN', 'Yalnız bir metin alanı sayfaya tek başına uygulanabilir.');
      if (!o.degerler[k.anahtar]) throw new HizliTestHatasi('METIN', `Önce “${alanAdi(o, k.anahtar)}” için bir değer yazın.`);
      if (duzenlenemez(o, k)) throw new HizliTestHatasi('METIN', `“${alanAdi(o, k.anahtar)}” bu seçimde sayfa tarafından dolduruluyor; değeri yazılmaz.`);
      zincir = { anahtar: k.anahtar, altlar: [], metin: true };
      o.metinIstegi = { anahtar: k.anahtar };
    } else if (typeof g.zincir === 'string' && g.zincir) {
      const ust = adim.alanlar.find((/** @type {Nesne} */ a) => a.anahtar === g.zincir);
      const altlar = [...o.bagliUst].filter(([alt, u]) => u === g.zincir && adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === alt)).map(([alt]) => alt);
      if (!ust || !altlar.length) throw new HizliTestHatasi('ZINCIR', 'Bu alanın bağlı alanı yok.');
      if (!o.degerler[ust.anahtar]) throw new HizliTestHatasi('ZINCIR', `Önce “${alanAdi(o, ust.anahtar)}” seçin.`);
      zincir = { anahtar: ust.anahtar, altlar };
    }
    // Bağlı listeler ek zorunluluk taşımaz: yalnız sayfanın zorunlu saydığı (required / aria-required) boş alan eksiktir. Seçenekleri
    // henüz gelmemiş, üstü seçili bağlı liste eksik sayılmaz (üst doldurulunca seçenekleri gelir). Yerinde zincir isteğinde eksik denetlenmez.
    if (!zincir) {
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !duzenlenemez(o, x) && !bagliGelecek(x, o)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) {
        throw new HizliTestHatasi('EKSIK', `Zorunlu alanlar boş: ${eksik.slice(0, 5).map((a) => gecerliEtiket(o, a) ?? a.anahtar).join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`, 400,
          { eksikler: eksik.map((a) => a.anahtar) });
      }
    }
    // Tarayıcıya gidecek değerler: tablo başvuruları bu ortamda çözülür (değer üretilmez; çözülemezse açık hata). Yerinde zincir isteğinde
    // yalnız o üst liste ve sayfaya henüz uygulanmamış üstleri gider (diğer girilen değerler oturumda saklanır, "Devam et"te gider).
    // İç içe seçimde üst seçimler (koşul zinciri) de: alt seçim sayfada ancak üst değer uygulanınca görünür.
    const zincirKumesi = zincir ? new Set([zincir.anahtar, ...ustleri(o, zincir.anahtar), ...kosulUstleri(o, zincir.anahtar).flatMap((u) => [u, ...ustleri(o, u)])]) : null;
    // Şu anki seçimde düzenlenemeyen (sayfanın doldurduğu) alana hiç dokunulmaz: değeri girilmiş olsa bile yazılmaz.
    const gidecek = bagimliSirala(adim.alanlar.filter((/** @type {Nesne} */ a) => o.degerler[a.anahtar] && kosulAktif(o, a) && !duzenlenemez(o, a)
      && (!zincirKumesi || (zincirKumesi.has(a.anahtar) && (a.anahtar === zincir?.anahtar || o.uygulanan[a.anahtar] !== o.degerler[a.anahtar].deger)))));
    const cozulecek = Object.fromEntries(gidecek.filter((/** @type {Nesne} */ a) => o.degerler[a.anahtar].kaynak === 'tablo').map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
    /** @type {Record<string, unknown>} */
    let cozulmus = {};
    if (Object.keys(cozulecek).length) {
      const r = ekranBasvurulariniCoz(cozulecek, {
        tablolar: tablolariListele(vt, o.projeId, { cozulsun: true }), ortamId: o.ortam.id, tabloSecimleri: o.tabloSecimleri,
        secenekDegerleri: Object.fromEntries(gidecek.map((/** @type {Nesne} */ a) => [a.anahtar, (a.tur === 'radio' ? (a.radyolar ?? []) : (a.secenekler ?? [])).map((/** @type {Nesne} */ x) => String(x.deger))]))
      });
      if (r.hatalar.length) throw new HizliTestHatasi('TABLO', r.hatalar[0].mesaj.replace(/"([^"]+)" alanının/, (_, k) => `“${o.alanlar.get(k)?.alan.etiket ?? k}” alanının`));
      cozulmus = r.veri;
    }
    // Doğrulama koşusu aynı çözülmüş değerleri kullanır (yalnız bellekte).
    o.cozulmus = { ...(o.cozulmus ?? {}), ...Object.fromEntries(Object.keys(cozulecek).map((k) => [k, String(cozulmus[k] ?? '')])) };
    const doldurulan = (/** @type {Nesne} */ a) => ({
      anahtar: a.anahtar, alan: a,
      deger: o.degerler[a.anahtar].kaynak === 'tablo' ? /** @type {string} */ (String(o.cozulmus?.[a.anahtar] ?? cozulmus[a.anahtar] ?? ''))
        : o.degerler[a.anahtar].kaynak === 'dosya' ? String(o.dosyaYollari?.[a.anahtar] ?? '') : o.degerler[a.anahtar].deger
    });
    // Yalnız yeni / değişen alanlar yazılır: sayfaya aynı değerle uygulanmış alan yeniden yazılmaz (seçimi yeniden yapmak bağlı alt listeleri
    // sıfırlayabilir). Onlar yalnız denetlenir: sayfa boşaltmışsa (yeniden çizim) motor bir kez yeniden yazar.
    // Taşınan alan (önceki adımdan; sayfa bir düğmeyle silmiş olabilir) değeri aynı olsa da yeniden yazılır.
    const degismis = (/** @type {Nesne} */ a) => zincir !== null || Boolean(o.alanHatalari?.[a.anahtar]) || o.uygulanan[a.anahtar] !== o.degerler[a.anahtar].deger
      || o.yenidenYaz?.has(a.anahtar) === true;
    const yazilacak = gidecek.filter(degismis);
    if (!zincir) o.yenidenYaz = null;
    const alanlar = yazilacak.map(doldurulan);
    const kontrol = gidecek.filter((/** @type {Nesne} */ a) => !degismis(a)).map(doldurulan);
    o.alanHatalari = {};
    o.sonGonderilen = Object.fromEntries(yazilacak.map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
    if (zincir) {
      o.zincirIstegi = zincir.anahtar;
      o.durum = 'zincir';
      o.calisiyor = zincir.kosul ? `“${alanAdi(o, zincir.anahtar)}” seçimi sayfaya uygulanıyor; bu seçimin alanları getiriliyor…`
        : zincir.metin ? `“${alanAdi(o, zincir.anahtar)}” sayfaya uygulanıyor; sayfa yeniden okunuyor (hiçbir düğmeye basılmaz)…`
          : `${zincir.altlar.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri getiriliyor…`;
    } else {
      o.zincirIstegi = null;
      o.durum = 'calisiyor';
      o.calisiyor = 'Alanlar dolduruluyor…';
    }
    // Yerinde zincir isteği: motor alt listelerin seçenekleri gelene kadar bekler (geç dolan liste); sınır öğrenilen dolma süresine göre.
    const bekle = zincir?.altlar.length ? zincir.altlar : null;
    const bekleMs = bekle ? Math.max(ZINCIR_SECENEK_BEKLEME_MS, ...bekle.map((k) => yuklenmeBeklemesi(olaganYuklenme(o.yuklenme[k]), ZINCIR_SECENEK_BEKLEME_MS).sinirMs)) : null;
    // Yerinde keşif: doldurunca beliren seçimlerden zaten keşfedilenler yeniden denenmez.
    // Sayfa farkı (değer uygulamasından sonra yeniden okuma): uygulamadan önceki okuma saklanır.
    o.farkOncesi = Array.isArray(o.sonAnlik?.alanlar) ? o.sonAnlik.alanlar : [];
    // Örnek senaryoyla doldurmadan sonra yerinde keşif (bağlı liste zinciri, yeni seçimlerin denenmesi) yapılmaz: listeler tek tek
    // değiştirilip geri alınınca sayfa bağlı alanları (ör. il değişince adres kodu, tapu) sıfırlayabilir ve iş uzar.
    gonder(o, { tur: 'doldur', alanlar, ...(kontrol.length ? { kontrol } : {}), ...(bekle ? { bekle, bekleMs } : {}), kesfedilen: Object.keys(o.kesifIlk ?? {}), bilinenBagli: bilinenBagliListeler(o), ...(o.ornek ? { kesifsiz: true } : {}) });
    return { gonderildi: true };
  }

  /** "Şimdi ne yapayım?" ve Hayır izninin seçimi. @param {Nesne} g */
  function karar(g) {
    const o = oturumGetir(String(g.id ?? ''));
    const k = String(g.karar ?? '');
    if (o.izin === 'hayir') {
      // Sayfada seç (aday listesinde olmayan düğme): tıklama sayfaya iletilmez, seçilen düğme adaylara eklenir (basılmaz).
      if (k === 'vazgec') { durumda(o, ['secim']); o.durum = 'calisiyor'; o.calisiyor = 'Seçim kapatılıyor…'; gonder(o, { tur: 'oku' }); return { tamam: true }; }
      durumda(o, ['hayirSecim']);
      if (k === 'baska') { o.durum = 'secim'; gonder(o, { tur: 'secimAc' }); return { tamam: true }; }
      if (k === 'duzelt') { veriDuragi(o); return { tamam: true }; }
      if (k !== 'bitir') throw new HizliTestHatasi('KARAR', 'Hayır izninde düğmeye basılmaz: düğmeyi ve mesajı seçip “Burada bitir” deyin.');
      const adaylar = o.sonAnlik?.dugmeler ?? [];
      const dugme = adaylar.find((/** @type {Nesne} */ x) => x.secici === g.dugme);
      if (!dugme) throw new HizliTestHatasi('DUGME', 'Formu gönderen düğmeyi adaylardan seçin.');
      const mesajlar = (Array.isArray(g.mesajlar) ? g.mesajlar : []).map((x) => metin(x, 200)).filter(Boolean);
      const adayMetinleri = adayMesajlari(o.sonAnlik?.eylem ?? null, o.cumle.mesajlar);
      // Mesajlar adaylardan seçilir (uydurulmaz): adaylar + cümledeki tırnaklı mesajlar.
      const secilen = adayMetinleri.filter((x) => mesajlar.includes(x.metin));
      if (!secilen.length) throw new HizliTestHatasi('MESAJ', 'Başarıyı gösteren mesajı adaylardan seçin.');
      guncelAdim(o).bas = { secici: dugme.secici, metin: dugme.metin };
      for (const x of adayMetinleri) o.gorulenler.push({ metin: x.metin, tur: x.tur === 'basari' ? 'basari' : x.tur, basis: secilen.includes(x) ? 1 : 0 });
      o.basisNo = 1;
      o.etiketler = Object.fromEntries(adayMetinleri.map((x) => [x.metin, secilen.includes(x) ? 'bitti' : x.tur === 'hata' ? 'hata' : x.tur === 'bekleme' ? 'devam' : null]));
      o.durum = 'bitis';
      return { tamam: true };
    }
    // Sayfada seçmekten vazgeç: şerit kapanır, sayfa yeniden okunur (motor seçimi iptal edip okur).
    if (k === 'vazgec') {
      durumda(o, ['secim']);
      o.durum = 'calisiyor';
      o.calisiyor = 'Seçim kapatılıyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    // "Doldurmadan burada bitir" (veri durağı, en az bir basıştan sonra): bu duraktaki alanlara hiçbir şey yazılmaz, hiçbir düğmeye
    // basılmaz; durağın (sayfaya henüz uygulanmamış) soruları zincirden çıkarılır (senaryoya / tablolara girmez) ve "Burada bitir" ile
    // aynı yoldan bitiş koşulu adımına geçilir (son basıştan sonra açılan pencere / öğeler bitiş adayıdır).
    if (k === 'doldurmadanBitir') {
      durumda(o, ['veri']);
      const adim = guncelAdim(o);
      if (o.basisNo === 0 || Number.isInteger(o.duzeltAdimi) || !adim || adim.bas) throw new HizliTestHatasi('KARAR', 'Doldurmadan bitirmek için önce bir düğmeye basılmış olmalı.');
      const atilacak = new Set(adim.alanlar.filter((/** @type {Nesne} */ a) => o.uygulanan?.[a.anahtar] === undefined).map((/** @type {Nesne} */ a) => String(a.anahtar)));
      adim.alanlar = adim.alanlar.filter((/** @type {Nesne} */ a) => !atilacak.has(String(a.anahtar)));
      for (const x of atilacak) { o.alanlar.delete(x); delete o.degerler[x]; o.bagliUst.delete(x); }
      for (const [alt, ust] of [...o.bagliUst]) if (atilacak.has(ust)) o.bagliUst.delete(alt);
      o.gozlemler = o.gozlemler.filter((/** @type {Nesne} */ x) => !atilacak.has(String(x.anahtar)));
      o.sorulacakBagli = [];
      o.soruNotu = null;
      gunluk(o, `Doldurmadan bitirildi: bu duraktaki ${atilacak.size} alan doldurulmadı ve teste alınmadı.`);
      return bitiseGec(o);
    }
    durumda(o, ['karar']);
    if (k === 'bitir') {
      if (o.basisNo === 0) throw new HizliTestHatasi('KARAR', 'Önce bir düğmeye basın: test en az bir basış içermeli.');
      return bitiseGec(o);
    }
    return kararDevam(o, k, g);
  }

  /** "Burada bitir": görülen metinlerin varsayılan etiketleriyle bitiş koşulu adımına geçer. @param {Nesne} o */
  function bitiseGec(o) {
    o.etiketler = varsayilanEtiketler(o.gorulenler, o.basisNo);
    for (const m of o.cumle.mesajlar) for (const g2 of o.gorulenler) if (katla(g2.metin).includes(katla(m))) o.etiketler[g2.metin] = 'bitti';
    for (const [m, c] of Object.entries(o.hataCevaplari ?? {})) if (c === 'hata' && m in o.etiketler) o.etiketler[m] = 'hata';
    // Geri dönülüp zincire devam edildiyse daha önce verilen etiketler korunur (görülen metinlerde).
    for (const [m, e] of Object.entries(o.saklananEtiketler ?? {})) if (m in o.etiketler) o.etiketler[m] = e;
    o.adresBitti = null;
    o.durum = 'bitis';
    return { tamam: true };
  }

  /** "Şimdi ne yapayım?" kararının bitir dışındaki seçimleri. @param {Nesne} o @param {string} k @param {Nesne} g */
  function kararDevam(o, k, g) {
    if (k === 'veriDevam') {
      // Ekranın şu anki hâli okunur; önceki adımlarda yazılan alanlar sayfadaki değerleriyle sorulur (veriyeDevamAc).
      o.okumaAmaci = 'veriDevam';
      o.duzeltAdimi = null;
      o.durum = 'calisiyor';
      o.calisiyor = 'Ekran okunuyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    if (k === 'duzelt') {
      // Önce sayfa yeniden okunur: sonradan beliren alanlar da veri durağında görünür.
      o.okumaAmaci = 'duzelt';
      o.duzeltAdimi = null;
      o.durum = 'calisiyor';
      o.calisiyor = 'Sayfa okunuyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    if (k === 'baska') {
      o.durum = 'secim';
      gonder(o, { tur: 'secimAc' });
      return { tamam: true };
    }
    if (k === 'bas') {
      const aday = (o.sonAnlik?.dugmeler ?? []).find((/** @type {Nesne} */ x) => x.secici === g.secici);
      if (!aday) throw new HizliTestHatasi('DUGME', 'Basılacak düğmeyi adaylardan seçin (listede yoksa “Başka bir düğmeye bas…”).');
      const d = { secici: aday.secici, metin: aday.metin, ...(aday.cerceve?.length ? { cerceve: aday.cerceve } : {}) };
      if (basmaKarari({ izin: o.izin, adaySayisi: 1, kullaniciSecti: true, sormadanBasma: Boolean(o.modelGuncelleme && aday.kayitOlusturabilir) }) === 'sor') { o.onayBekleyen = { ...d, kayitOlusturabilir: aday.kayitOlusturabilir }; o.durum = 'onay'; }
      else basmayaBasla(o, d);
      return { tamam: true };
    }
    throw new HizliTestHatasi('KARAR', 'Bilinmeyen seçim.');
  }

  /**
   * Bana sor: basış sırasında açılan onay / soru penceresine yanıt (kabul: Tamam, iptal: İptal). Basış komutu sürer; yanıt alt sürece ayrı
   * komutla gider (bekleyen basış değişmez). @param {Nesne} g
   */
  function diyalogCevabi(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['diyalog']);
    const yanit = g.cevap === 'kabul' ? 'kabul' : g.cevap === 'iptal' ? 'iptal' : null;
    if (!yanit) throw new HizliTestHatasi('DIYALOG', 'Pencereye yanıt seçin (Tamam / İptal).');
    const soru = o.diyalogSorusu;
    o.diyalogSorusu = null;
    o.durum = 'calisiyor';
    o.calisiyor = `Pencereye “${yanit === 'kabul' ? 'Tamam' : 'İptal'}” denildi; sayfa izleniyor…`;
    tarama().komutGonder(o.isId, /** @type {any} */ ({ no: ++o.komutNo, tur: 'diyalogYaniti', yanit }));
    gunluk(o, `Pencere (“${soru?.mesaj ?? ''}”): ${yanit === 'kabul' ? 'Tamam' : 'İptal'} seçildi.`);
    return { tamam: true };
  }

  /** Bana sor: "X'e basayım mı?" @param {Nesne} g */
  function onay(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['onay', 'kesifOnay']);
    // Keşif toplu sorusu: "Seçilenlere bas" (cevap true + secilenler: seçicileri; secilenler yoksa listenin hepsi) / "Hiçbirine basma"
    // (false) / "Kalanları atla" ("atla": listedekiler ve kuyrukta kalanlar). Basılmayanlar kuyruktan düşer.
    if (o.durum === 'kesifOnay') {
      const liste = Array.isArray(o.kesifOnayListesi) ? o.kesifOnayListesi : [];
      o.kesifOnayListesi = null;
      const secilenler = Array.isArray(g.secilenler) ? g.secilenler.map(String) : null;
      const secilen = g.cevap === true ? liste.filter((/** @type {Nesne} */ d) => !secilenler || secilenler.includes(String(d.secici))) : [];
      for (const d of liste) { d.soruldu = true; if (secilen.includes(d)) d.onayli = true; }
      const basilmayan = liste.filter((/** @type {Nesne} */ d) => !secilen.includes(d));
      const kalan = (o.kesifDugmeKuyrugu ?? []).filter((/** @type {Nesne} */ d) => !d.onayli && !liste.includes(d));
      o.kesifDugmeKuyrugu = (o.kesifDugmeKuyrugu ?? []).filter((/** @type {Nesne} */ d) => d.onayli === true || (g.cevap !== 'atla' && !liste.includes(d)));
      if (g.cevap === 'atla') gunluk(o, `Keşif: kalan ${basilmayan.length + kalan.length} düğmeye basılmadı (kalanları atla).`);
      else if (basilmayan.length) gunluk(o, `Keşif: ${basilmayan.map((d) => `“${d.metin ?? d.secici}”`).join(', ')} düğmesine basılmadı.`);
      kesifBasisiSurdur(o);
      return { basildi: secilen.length > 0 };
    }
    const d = o.onayBekleyen;
    o.onayBekleyen = null;
    if (g.cevap !== true) { gunluk(o, `“${d.metin ?? d.secici}” basılmadı (onay verilmedi).`); o.durum = 'karar'; return { basildi: false }; }
    basmayaBasla(o, { secici: d.secici, metin: d.metin, ...(d.cerceve?.length ? { cerceve: d.cerceve } : {}) });
    return { basildi: true };
  }

  /**
   * Bitiş koşulu adımında sayfayı yeniden tarar: o an ekranda görünen (ör. sonradan çıkan hata / başarı) mesajlar görülen
   * metinlere eklenir; verilmiş etiketler korunur. @param {Nesne} g
   */
  function yenidenTara(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['bitis']);
    const gecerli = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
    for (const [m, e] of Object.entries(nesneMi(g.etiketler) ? g.etiketler : {})) {
      if (gecerli.has(m)) o.etiketler[m] = ['bitti', 'devam', 'hata'].includes(String(e)) ? String(e) : null;
    }
    o.okumaAmaci = 'bitis';
    o.durum = 'calisiyor';
    o.calisiyor = 'Sayfa yeniden taranıyor…';
    gonder(o, { tur: 'oku' });
    return { tamam: true };
  }

  /** Arayüzün o anki etiketleri (görülen metinlere) ve öğe seçimleri oturuma alınır (yeniden çizimde kaybolmasın). @param {Nesne} o @param {Nesne} g */
  function bitisSecimleriniAl(o, g) {
    const gecerli = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
    for (const [m, e] of Object.entries(nesneMi(g.etiketler) ? g.etiketler : {})) {
      if (gecerli.has(m)) o.etiketler[m] = ['bitti', 'devam', 'hata'].includes(String(e)) ? String(e) : null;
    }
    if (Array.isArray(g.ogeler)) {
      const secili = new Set(g.ogeler.map((/** @type {unknown} */ x) => String(nesneMi(x) ? x.secici : x)));
      for (const x of o.bitisOgeleri ?? []) x.secili = secili.has(x.secici);
    }
  }

  /**
   * Bitiş koşulu adımında "Sayfada seç…" (tur 'metin': tıklanan öğenin yazısı Bitti metni olur) ya da "Şu öğe görününce bitti…" (tur 'oge':
   * tıklanan öğenin seçicisi; görünür olunca bitti). Hızlı test tarayıcısında seçme şeridi açılır; tıklama sayfaya İLETİLMEZ.
   * vazgec: true → şerit kapanır, sayfa yeniden okunur, bitiş adımına dönülür. @param {Nesne} g
   */
  function bitisSec(g) {
    const o = oturumGetir(String(g.id ?? ''));
    if (g.vazgec === true) {
      durumda(o, ['bitisSecim']);
      o.bitisSecimi = null;
      o.okumaAmaci = 'bitis';
      o.durum = 'calisiyor';
      o.calisiyor = 'Seçim kapatılıyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    durumda(o, ['bitis']);
    const tur = g.tur === 'oge' ? 'oge' : g.tur === 'metin' ? 'metin' : null;
    if (!tur) throw new HizliTestHatasi('BITIS', 'Seçim türü “metin” ya da “oge” olmalı.');
    bitisSecimleriniAl(o, g);
    o.bitisSecimi = tur;
    o.durum = 'bitisSecim';
    gonder(o, { tur: 'secimAc', amac: 'bitis' });
    return { tamam: true };
  }

  /**
   * Bitiş koşuluna kullanıcı girdisi ekler: { metin, etiket? } → elle yazılan metin (varsayılan Bitti); { pencere: true } → son basışta
   * yeni beliren pencerenin (öneri) seçicisi Bitti öğesi olur ("Açılan pencere görününce bitti"); { oge: seçici, sil: true } → öğe
   * listeden çıkar. Arayüzün etiketleri (etiketler, ogeler) önce alınır. @param {Nesne} g
   */
  function bitisEkle(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['bitis']);
    bitisSecimleriniAl(o, g);
    if (g.pencere === true) {
      const p = (o.sonPencereler ?? []).find((/** @type {Nesne} */ x) => !(o.bitisOgeleri ?? []).some((/** @type {Nesne} */ y) => y.secici === x.secici))
        ?? (o.sonPencereler ?? [])[0];
      if (!p) throw new HizliTestHatasi('BITIS', 'Son basıştan sonra yeni açılan bir pencere görülmedi; “Şu öğe görününce bitti…” ile tarayıcıda seçin.');
      if (!bitisOgesiEkle(o, { secici: p.secici, metin: p.metin, kaynak: 'pencere' })) throw new HizliTestHatasi('BITIS', 'En çok 10 bitiş öğesi eklenebilir.');
      gunluk(o, `Bitiş: “${p.metin ?? p.secici}” penceresi görününce bitti.`);
      return { tamam: true };
    }
    if (typeof g.oge === 'string' && g.sil === true) {
      o.bitisOgeleri = (o.bitisOgeleri ?? []).filter((/** @type {Nesne} */ x) => x.secici !== g.oge);
      return { tamam: true };
    }
    const yazi = metin(g.metin, 200);
    if (!yazi) throw new HizliTestHatasi('BITIS', 'Eklenecek metni yazın.');
    const etiket = ['bitti', 'devam', 'hata'].includes(String(g.etiket)) ? String(g.etiket) : 'bitti';
    kullaniciMetniEkle(o, yazi, 'elle', etiket);
    gunluk(o, `Bitiş koşuluna elle metin eklendi: “${yazi}” (${etiket === 'bitti' ? 'Bitti' : etiket === 'devam' ? 'Devam' : 'Hata'}).`);
    return { tamam: true };
  }

  /** "Bu bir hata mı, beklenen uyarı mı?" @param {Nesne} g */
  function hataCevabi(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['hataSorusu']);
    const c = String(g.cevap ?? '');
    const metinler = o.hataSorusu?.metinler ?? [];
    const dolduranKaynak = o.hataSorusu?.kaynak === 'doldur';
    o.hataCevaplari ??= {};
    for (const m of metinler) o.hataCevaplari[m] = c;
    o.hataSorusu = null;
    if (c === 'hata') {
      // Verileri düzeltip yeniden denenir: aynı adımın veri durağı (basış zincire yazılmaz).
      const adim = guncelAdim(o);
      adim.bas = null;
      adim.fark = null;
      veriDuragi(o, dolduranKaynak ? 'Sayfa hata gösterdi: değerleri düzeltip yeniden doldurun.' : 'Hata göründü: değerleri düzeltin, sonra düğmeye yeniden basın.');
      return { tamam: true };
    }
    if (c === 'uyari') {
      // Olumsuz senaryo: beklenen sonuç bu uyarı. Zincir burada biter.
      o.olumsuz = { mesaj: metinler[0] ?? '' };
      o.etiketler = varsayilanEtiketler(o.gorulenler, o.basisNo);
      for (const m of metinler) o.etiketler[m] = 'hata';
      o.durum = 'bitis';
      return { tamam: true };
    }
    // Doldururken çıkan uyarı önemsiz: veri durağının devamı (henüz basış yok).
    if (dolduranKaynak) {
      const adim = guncelAdim(o);
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !duzenlenemez(o, x) && !bagliGelecek(x, o)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) veriDuragi(o, `${eksik.length} zorunlu alan boş.`); else verilerTamam(o);
      return { tamam: true };
    }
    basistanSonra(o);
    return { tamam: true };
  }

  /**
   * Geri dönüş: "Bitiş koşulu" ↔ "Kaydet" ↔ "Adım adım" arasında. hedef 'karar': zincire devam (bitiş seçimleri saklanır, yeniden
   * "Burada bitir" denince korunur; Hayır izninde düğme / mesaj seçimine dönülür); hedef 'bitis': kaydet ekranından bitiş koşulunu
   * düzenle (etiketler, adres, olumsuz senaryo korunur). Doğrulama sonucu geçersiz olur (bitiş / zincir değişebilir). Tarayıcı kapalıysa
   * (kaydet aşaması, süre doldu) yeniden açılır ve zincir baştan yürütülerek aynı noktaya gelinir. @param {Nesne} g @param {TarayiciBaglami} [c]
   */
  function geri(g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    const hedef = String(g.hedef ?? '');
    if (hedef === 'bitis') {
      durumda(o, ['kaydet']);
      const acilacak = o.tarayici !== 'acik';
      if (acilacak) { yenidenBasisOnayi(o, g); tarayiciyiAc(o, c, 'kur', 'bitis'); }
      o.dogrulama = null;
      o.dogrulamaAdimlari = null;
      o.farklar = null;
      if (!acilacak) o.durum = 'bitis';
      gunluk(o, 'Bitiş koşulu yeniden düzenleniyor.');
      return { tamam: true };
    }
    if (hedef !== 'karar') throw new HizliTestHatasi('GERI', 'Bilinmeyen geri dönüş.');
    durumda(o, ['bitis', 'kaydet']);
    // Tarayıcı kapalıysa önce açılır (hata olursa oturum değişmez); zincir aşağıdaki geri alma uygulandıktan SONRA yürütülür (keşif olayında).
    const acilacak = o.tarayici !== 'acik';
    if (acilacak) { yenidenBasisOnayi(o, g); tarayiciyiAc(o, c, 'kur', o.izin === 'hayir' ? 'hayirSecim' : 'karar'); }
    // Verilmiş etiketler saklanır: zincir sürüp yeniden "Burada bitir" denince aynı metinlere aynı etiket verilir.
    o.saklananEtiketler = { ...(o.saklananEtiketler ?? {}), ...o.etiketler };
    o.bitis = null;
    o.dogrulama = null;
    o.dogrulamaAdimlari = null;
    o.farklar = null;
    if (o.izin === 'hayir') {
      // Hayır izninde "bitir" düğme ve mesajı zincire yazmıştı: geri alınır, seçim yeniden yapılır.
      guncelAdim(o).bas = null;
      o.basisNo = 0;
      o.gorulenler = [];
      o.etiketler = {};
      if (!acilacak) o.durum = 'hayirSecim';
    } else if (!acilacak) o.durum = 'karar';
    gunluk(o, 'Adım adım zincire dönüldü: kaldığı yerden devam edilebilir.');
    return { tamam: true };
  }

  /** Bitiş koşulu (etiketler). @param {Nesne} g */
  function bitis(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['bitis']);
    const gecerli = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
    /** @type {Record<string, string | null>} */
    const etiketler = {};
    for (const [m, e] of Object.entries(nesneMi(g.etiketler) ? g.etiketler : {})) {
      if (!gecerli.has(m)) continue; // Etiket yalnız görülen metne verilir (uydurulmaz).
      etiketler[m] = ['bitti', 'devam', 'hata'].includes(String(e)) ? String(e) : null;
    }
    const olumsuz = nesneMi(g.olumsuz) && metin(g.olumsuz.mesaj, 200) ? { mesaj: /** @type {string} */ (metin(g.olumsuz.mesaj, 200)) } : null;
    if (olumsuz && !gecerli.has(olumsuz.mesaj)) throw new HizliTestHatasi('BITIS', 'Olumsuz senaryonun beklenen mesajı görülen metinlerden seçilmeli.');
    // Bitti öğeleri: g.ogeler (seçili seçiciler) verildiyse o seçim, verilmediyse eklenmiş öğelerin seçili olanları. Yalnız eklenmiş öğeler.
    const tumOgeler = o.bitisOgeleri ?? [];
    const seciliOgeler = Array.isArray(g.ogeler) ? new Set(g.ogeler.map((/** @type {unknown} */ x) => String(nesneMi(x) ? x.secici : x)))
      : new Set(tumOgeler.filter((/** @type {Nesne} */ x) => x.secili !== false).map((/** @type {Nesne} */ x) => x.secici));
    const ogeler = olumsuz ? [] : tumOgeler.filter((/** @type {Nesne} */ x) => seciliOgeler.has(x.secici));
    const b = bitisKosulu({ etiketler, adres: g.adres, olumsuz, ogeler });
    // Geçersizse oturum değişmez (arayüz kullanıcının seçimlerini korur).
    if (b.hatalar.length) throw new HizliTestHatasi('BITIS', b.hatalar.join(' '));
    for (const x of tumOgeler) x.secili = seciliOgeler.has(x.secici);
    o.etiketler = etiketler;
    o.adresBitti = b.adres;
    o.olumsuz = olumsuz;
    o.bitis = b;
    o.dogrulama = o.izin === 'hayir' ? { durum: 'yapilmadi', mesaj: 'Hayır izninde düğmeye basılmadı; test “doğrulanmadı” olarak kaydedilir ve ilk koşuda doğrulanır.', gorulen: [] } : null;
    o.farklar = null;
    o.durum = 'kaydet';
    // Ekran testi bitti: kaydet / özet aşaması tarayıcı gerektirmez — tarayıcı kapatılır (oturum ve toplananlar sunucuda kalır; doğrulama
    // koşusu kendi tarayıcısını açar, geri dönüşte tarayıcı yeniden açılıp zincir tekrar yürütülür). Bu aşamada süre sınırı işlemez.
    tarayiciyiKapat(o);
    return { tamam: true };
  }

  /**
   * H3: baştan sona doğrulama koşusu. Plan yalnız DEĞERLİ alanı ya da basışı olan adımlardır (kaydet özetindeki zincirle aynı sayım:
   * "2. adımda …" iletisi kullanıcının gördüğü zincirin 2. satırıdır). Adımların durumu ilerleme olaylarıyla güncellenir. Kaydet aşamasında
   * tarayıcı kapalıdır: koşu kendi tarayıcısını açar, bitince kapatır.
   * @param {Nesne} g @param {TarayiciBaglami} [c]
   */
  function dogrula(g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    if (o.izin === 'hayir') throw new HizliTestHatasi('IZIN', 'Hayır izninde doğrulama koşusu yapılmaz (düğmeye basılmaz).');
    if (o.tarayici !== 'acik') {
      tarayiciyiAc(o, c, 'dogrula', 'kaydet');
      o.dogrulama = null;
      o.dogrulamaAdimlari = dogrulamaPlani(o).satirlar;
      return { basladi: true };
    }
    dogrulamaGonder(o);
    return { basladi: true };
  }

  /** Doğrulama koşusunun planı ve arayüzdeki adım satırları. @param {Nesne} o */
  function dogrulamaPlani(o) {
    const adimlar = o.adimlar.map((/** @type {Nesne} */ a) => ({
      alanlar: bagimliSirala(a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar] && kosulAktif(o, x) && !duzenlenemez(o, x))).map((/** @type {Nesne} */ x) => ({
        anahtar: x.anahtar, alan: x,
        deger: o.degerler[x.anahtar].kaynak === 'dosya' ? String(o.dosyaYollari?.[x.anahtar] ?? '') : o.cozulmus?.[x.anahtar] ?? o.degerler[x.anahtar].deger
      })),
      bas: a.bas ? { secici: a.bas.secici, metin: a.bas.metin, ...(a.bas.diyalog ? { diyalog: a.bas.diyalog } : {}), ...(a.bas.cerceve?.length ? { cerceve: a.bas.cerceve } : {}) } : null
    })).filter((/** @type {Nesne} */ a) => a.alanlar.length || a.bas);
    const bitis = o.bitis.olumsuz
      // Olumsuz senaryo: beklenen hata mesajı "bitti" sayılır.
      ? { bitti: [o.bitis.olumsuz.mesaj], devam: o.bitis.devam, hata: o.bitis.hata.filter((/** @type {string} */ h) => !katla(o.bitis.olumsuz.mesaj).includes(katla(h))), adres: null }
      : { bitti: o.bitis.bitti, devam: o.bitis.devam, hata: o.bitis.hata, adres: o.bitis.adres, ogeler: o.bitis.ogeler ?? [] };
    const satirlar = [
      ...adimlar.map((/** @type {Nesne} */ a, /** @type {number} */ i) => ({
        metin: `${i + 1}. ${[a.alanlar.length ? `${a.alanlar.length} alan doldur` : null, a.bas ? `“${a.bas.metin ?? a.bas.secici}” bas` : null].filter(Boolean).join(', sonra ')}`,
        durum: 'bekliyor', ayrinti: null
      })),
      { metin: o.bitis.olumsuz ? `Beklenen uyarı: “${o.bitis.olumsuz.mesaj}”` : 'Bitiş koşulu', durum: 'bekliyor', ayrinti: null }
    ];
    return { plan: { adimlar, bitis, zamanAsimiSn: BITIS_BEKLEME_SN }, satirlar };
  }

  /** Doğrulama koşusunu açık tarayıcıya gönderir. @param {Nesne} o */
  function dogrulamaGonder(o) {
    const { plan, satirlar } = dogrulamaPlani(o);
    o.dogrulamaAdimlari = satirlar;
    o.dogrulama = null;
    o.durum = 'dogrulama';
    o.calisiyor = 'Doğrulama koşusu: sayfa yeniden açılıyor, zincir baştan uygulanıyor…';
    gonder(o, { tur: 'dogrula', plan });
  }

  /** Doğrulama bitti: başarılıysa tüm adımlar tamam; değilse süren adım hata (sonrakiler bekliyor kalır). @param {Nesne} o @param {boolean} basarili */
  function dogrulamaAdimlariniKapat(o, basarili) {
    if (!Array.isArray(o.dogrulamaAdimlari)) return;
    if (basarili) { for (const x of o.dogrulamaAdimlari) x.durum = 'tamam'; return; }
    const suren = o.dogrulamaAdimlari.find((/** @type {Nesne} */ x) => x.durum === 'suruyor') ?? o.dogrulamaAdimlari.find((/** @type {Nesne} */ x) => x.durum === 'bekliyor');
    if (suren) suren.durum = 'hata';
  }

  /**
   * Paket (ekran modeli) + senaryo verisi. @param {Veritabani} vt @param {Nesne} o
   */
  function paketKur(vt, o) {
    const tarif = o.girissiz ? null : etkinGirisTarifi(vt, o.projeId, o.ortam.id).tarif;
    const mevcut = o.ekran.id ? ekranModeliGetir(vt, o.ekran.id) : undefined;
    const meta = {
      ekranAnahtari: o.ekran.anahtar, ekranAdi: o.ekran.ad, urlYolu: o.hedefYol.startsWith('/') ? o.hedefYol : `/${o.hedefYol}`, proje: o.projeAdi,
      girisGerekli: Boolean(tarif), girissiz: !tarif, ikiAsamali: tarif ? tarif.ikinciAdim.tur : 'yok', baglamTuru: tarif?.baglamDegistirme?.baglamTuru ?? null,
      mevcutModel: mevcut && nesneMi(mevcut.model) ? mevcut.model : null
    };
    const degerler = Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger]));
    // Koşullu alanları belirleyen seçim (radyo / liste / onay kutusu) için değer verilmediyse sayfanın İLK değeri (keşifte okunan; değer
    // üretilmez) senaryoya yazılır: hızlı test koşulları bu değerle değerlendirdi, normal koşu da aynı değerle değerlendirir.
    const kontroller = new Set(o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).flatMap((/** @type {Nesne} */ a) => [a.kosul?.secim, a.etiketKosulu?.secim, a.kilitKosulu?.secim]).filter(Boolean));
    for (const k of kontroller) {
      // Kullanıcının koştuğu dalda görünmeyen (iç içe; üst seçimi başka değerde) seçim senaryoya hiç yazılmaz.
      const ka = o.alanlar.get(k)?.alan;
      if (ka && !kosulAktif(o, ka, new Set(), true)) continue;
      const ilk = o.kesifIlk?.[k];
      if (degerler[k] === undefined && ilk !== null && ilk !== undefined && ilk !== '') degerler[k] = ilk;
    }
    const envanter = kayitEnvanteriKur({ adimlar: o.adimlar.map((/** @type {Nesne} */ x) => ({ ...x, alanlar: bagimliSirala(x.alanlar) })), degerler, yol: o.hedefYol.startsWith('/') ? o.hedefYol : `/${o.hedefYol}`, baslik: o.baslik, profil: baglamProfiliAdi(o, tarif) }, o.bitis);
    // Bağlı listeler: modelde bagimlilik + çok düzeyli test verisi tablosu (kökün seçenekleri + zincirin gözlemleri) + bulgular.
    const tumAlanlar = new Map(o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).map((/** @type {Nesne} */ a) => [a.anahtar, a]));
    // Kesinleşmeyen (belirsiz) bağ modele bağımlılık olarak yazılmaz: koşu, seçeneği hiç gelmeyebilecek listeyi beklemesin.
    const bagliListeler = [...o.bagliUst].filter(([alt, ust]) => tumAlanlar.has(alt) && tumAlanlar.has(ust) && !o.belirsizBagli?.has(alt))
      .map(([alt, ust]) => ({ ust, alt, ...(olaganYuklenme(o.yuklenme[alt]) ? { yuklenmeMs: olaganYuklenme(o.yuklenme[alt]) } : {}) }));
    if (bagliListeler.length) {
      const kokler = [...new Set(bagliListeler.map((b) => b.ust))].filter((u) => !o.bagliUst.has(u));
      /** @type {any} */ (envanter).bagliListeler = bagliListeler;
      /** @type {any} */ (envanter).secenekGozlemleri = [
        ...kokler.map((k) => ({ anahtar: k, secimler: {}, secenekler: gercekSecenekler(tumAlanlar.get(k)?.secenekler) })),
        ...o.gozlemler.filter((/** @type {Nesne} */ g) => tumAlanlar.has(g.anahtar))
      ];
    }
    if (o.bulgular.length) /** @type {any} */ (envanter).zincirBulgulari = [...o.bulgular];
    // Tetikler (metin alanı girilince beliren / dolan alan): modelde hedef alanın "tetik"i; normal koşu kaynağı doldurunca hedefi bekler.
    const tetikler = tetikListesi(o).filter((t) => tumAlanlar.has(t.kaynak) && tumAlanlar.has(t.hedef));
    if (tetikler.length) /** @type {any} */ (envanter).tetikler = tetikler;
    const { paket } = kayitPaketiOlustur(/** @type {any} */ (meta), /** @type {any} */ (envanter));
    const model = bitisiUygula(/** @type {Nesne} */ (paket).model, o.bitis);
    // Modeli güncelleme: taramanın ulaşmadığı sondaki adımlar eski hâliyle kalır ("silindi" sayılmaz; karşılaştırılmadı notu).
    const ulasilamayan = o.modelGuncelleme && meta.mevcutModel ? ulasilamayanAdimlariKoru(model, meta.mevcutModel) : { adimlar: [] };
    if (ulasilamayan.adimlar.length) {
      const not = `Nöbetçi taraması şu adımlara geçmedi; bu adımlar karşılaştırılmadı (modeldeki hâlleri korunur): ${ulasilamayan.adimlar.join(', ')}.`;
      const p = /** @type {Nesne} */ (paket);
      p.bilinmeyenler = [...(Array.isArray(p.bilinmeyenler) ? p.bilinmeyenler : []), not];
      if (!o.ulasilamayanNotu) { o.ulasilamayanNotu = true; gunluk(o, not); }
    }
    // Modeli güncelleme: bağlı listenin bu turda gezilmeyen üst değerlerinin seçenekleri eski hâliyle kalır ("kaldırılan seçenek" sayılmaz).
    if (o.modelGuncelleme && meta.mevcutModel) gorulmeyenBagliSecenekleriKoru(model, meta.mevcutModel);
    // Hızlı testle güncelleme: ekranın bu turda görünmeyen dalının alanları korunur, yeni alanlar "ekranda görünürse" olur (dal-birlestirme.mjs).
    const dal = meta.mevcutModel ? dallariBirlestir(model, meta.mevcutModel) : { korunan: [], kosullanan: [] };
    if ((dal.korunan.length || dal.kosullanan.length) && !o.dalNotuYazildi) {
      o.dalNotuYazildi = true;
      gunluk(o, `Dal birleştirme: ${dal.korunan.length ? `bu turda görünmeyen ${dal.korunan.length} alan korundu (${dal.korunan.slice(0, 8).join(', ')}; ekranda görünürse yazılır)` : ''}${dal.korunan.length && dal.kosullanan.length ? '; ' : ''}${dal.kosullanan.length ? `${dal.kosullanan.length} yeni alan ekranda görünürse yazılır (${dal.kosullanan.slice(0, 8).join(', ')})` : ''}.`);
    }
    /** @type {Nesne} */ (paket).meta.olusturan = 'Nöbetçi taraması';
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(model, alanlar);
    // Olumsuz senaryo: hatanın göründüğü adım (son basışın adımı).
    const adimIdleri = (Array.isArray(model.adimlar) ? model.adimlar : []).map((/** @type {Nesne} */ a) => String(a.id));
    const olumsuz = o.bitis.olumsuz ? { mesaj: o.bitis.olumsuz.mesaj, adimId: adimIdleri[adimIdleri.length - 1] } : null;
    const veri = senaryoVerisiKur(model, anahtarlar, degerler, { olumsuz, alanTurleri: Object.fromEntries(alanlar.map((/** @type {Nesne} */ a) => [a.anahtar, String(a.tur)])) });
    // Bağlam: normal koşunun modeliyle aynı yer — senaryonun bağlam profili alanı (senaryoDuzeyi, eslesme.profilHavuzu = tarifin bağlam
    // türü; model-kosusu.mjs > baglamProfili). Yeni modelde alanın varsayılanı da bu profildir (akış kaydıyla aynı); senaryoya ayrıca
    // açıkça yazılır (mevcut modelin varsayılanı başka profil olabilir).
    const profil = baglamProfiliAdi(o, tarif);
    if (profil && tarif?.baglamDegistirme) {
      const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [];
      const pa = sd.find((/** @type {Nesne} */ a) => nesneMi(a) && nesneMi(a.eslesme) && a.eslesme.profilHavuzu === tarif.baglamDegistirme.baglamTuru && typeof a.eslesme.senaryo === 'string');
      if (pa) veri[pa.eslesme.senaryo] = profil;
    }
    return { paket, model, veri, mevcut: mevcut && nesneMi(mevcut.model) ? mevcut.model : null };
  }

  /** Kayda yazılacak bağlam profili adı: seçilen profil, yalnız tarif hâlâ o türün bağlamını değiştiriyorsa. @param {Nesne} o @param {Nesne | null} tarif */
  function baglamProfiliAdi(o, tarif) {
    const b = o.baglamProfili;
    return b && !o.girissiz && tarif?.baglamDegistirme?.baglamTuru === b.tur ? String(b.ad) : null;
  }

  /**
   * Kayıt planı: analiz + elle yazılan değerler → tablo planı (kayit-plani.mjs). Hassas sütunlar Ayarlar > Güvenlik > Maskeleme
   * adlarıyla da (kullanıcının ekleri) gizli olur. @param {Veritabani} vt @param {Nesne} o @param {string} baslik
   */
  function planKurOturum(vt, o, baslik) {
    // Bağlı liste zincirleri tek tabloda (satır = gözlenen geçerli kombinasyon): ilişkiler ve keşif / doldurma gözlemleri.
    return planKur({
      baslik, alanlar: planAlanlari(o), degerler: aktifDegerler(o), ekGizliAdlar: ekGizliAdlar(vt),
      iliskiler: [...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), gozlemler: o.gozlemler, tetikler: tetikListesi(o)
    });
  }

  /** Oturumdaki tetik ilişkileri (kaynak metin alanı → hedef alan). @param {Nesne} o @returns {Array<{ kaynak: string; hedef: string; olay: 'belirdi' | 'doldu' }>} */
  function tetikListesi(o) {
    return o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).filter((/** @type {Nesne} */ a) => a.tetik && typeof a.tetik.kaynak === 'string')
      .map((/** @type {Nesne} */ a) => ({ kaynak: String(a.tetik.kaynak), hedef: String(a.anahtar), olay: a.tetik.olay === 'belirdi' ? 'belirdi' : 'doldu' }));
  }

  /**
   * Plan / öneri için alanlar: bağlı listelerin seçeneklerine keşifte ve doldururken gözlenen (başka üst değerlerdeki) seçenekler de eklenir;
   * böylece liste tablosu geçerli bir başka yolun değerlerini de taşır ve öneri o satırı seçebilir. Alanın kendisi değişmez (kopya).
   * @param {Nesne} o
   */
  function planAlanlari(o) {
    return o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).map((/** @type {Nesne} */ a00) => {
      // Kullanıcının koştuğu dalda görünmeyen (üst seçimi başka değerde) alan işaretlenir: tablosu yazılır ama senaryoya değeri yazılmaz.
      const a01 = kosulAktif(o, a00, new Set(), true) ? a00 : { ...a00, dalDisi: true };
      // Kaydedilen dalda düzenlenemeyen (sayfanın doldurduğu) alan işaretlenir: değeri senaryoya / tabloya girmez, sayfadaki hazır değeri
      // "dolu" sayılmaz (başka dalda düzenlenebilirse orada veri gerekir).
      const a0 = duzenlenemez(o, a00) ? { ...a01, kilitli: true } : a01;
      // Etiketi seçime göre değişen alan senaryonun seçimindeki adıyla (sütun adı ve öneri başlığı o dalın anlamını taşır).
      const a = a0.etiketKosulu ? { ...a0, etiket: gecerliEtiket(o, a0) ?? a0.etiket } : a0;
      if (!o.bagliUst.has(a.anahtar) || a.tur !== 'select') return a;
      const ek = new Map((Array.isArray(a.secenekler) ? a.secenekler : []).map((/** @type {Nesne} */ x) => [String(x.deger), x]));
      for (const g of o.gozlemler) if (g.anahtar === a.anahtar) for (const x of g.secenekler ?? []) if (!ek.has(String(x.deger))) ek.set(String(x.deger), { deger: String(x.deger), metin: String(x.metin ?? x.deger) });
      return { ...a, secenekler: [...ek.values()] };
    });
  }

  /** Senaryo önerileri (kayit-plani.mjs > senaryoOnerileri): bağlı liste yolları, seçim alanları, Ayarlar'daki öneri sayısı. @param {Veritabani} vt @param {Nesne} o @param {Nesne} plan @param {string} baslik */
  function onerileriKur(vt, o, plan, baslik) {
    let enCok;
    try { enCok = Number(kosuAyarlariniOku(vt).hizliOneriSayisi); } catch { enCok = undefined; }
    const degerler = Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, /** @type {Nesne} */ (v).deger]));
    return senaryoOnerileri(plan, baslik, {
      enCok, alanlar: planAlanlari(o), iliskiler: [...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), gozlemler: o.gozlemler, degerler
    });
  }

  /**
   * ÖZET: "Testimi kaydet"ten sonra kullanıcıya gösterilen ekran (yapay zekâ paketinin önizlemesiyle aynı sistem). Hiçbir şey yazılmaz:
   * hangi tablolar yazılacak / aynı adlı ya da benzer tablo varsa birleştirme seçenekleri, hangi alan hangi sütuna bağlanacak,
   * senaryo önerileri, (mevcut ekransa) model farkları.
   * @param {Veritabani} vt @param {Nesne} g
   */
  function kayitOzeti(vt, g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    const baslik = metin(g.baslik, 200) ?? o.senaryoBasligi;
    // Özet kendi sekmesinde (#/hizli-test/ozet/<id>) açılır: kaydet sekmesindeki seçimler oturumda (bellekte) saklanır, özet sekmesi
    // onları gövdesiz istekle okur. Veritabanına hiçbir şey yazılmaz.
    o.senaryoBasligi = baslik;
    o.kayitTercihi = {
      kosuyaDahil: typeof g.kosuyaDahil === 'boolean' ? g.kosuyaDahil : o.kayitTercihi?.kosuyaDahil ?? true,
      tabloOlustur: typeof g.tabloOlustur === 'boolean' ? g.tabloOlustur : o.kayitTercihi?.tabloOlustur ?? true
    };
    const { paket, mevcut } = paketKur(vt, o);
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, alanlar);
    const plan = planKurOturum(vt, o, baslik);
    const onizleme = planOnizle(vt, o.projeId, plan, o.ekran.id ?? null, anahtarlar);
    /** @type {Nesne | null} */
    let farklar = null;
    if (mevcut && o.ekran.id) {
      const bulgular = modelFarki(mevcut, /** @type {Nesne} */ (paket).model);
      farklar = { ozet: bulguOzeti(bulgular), maddeler: bulgular.slice(0, 30).map((/** @type {Nesne} */ b) => String(b.baslik ?? b.tur)) };
    }
    return {
      ozet: {
        baslik, ekran: { ad: o.ekran.ad, mevcut: Boolean(mevcut && o.ekran.id) }, ortam: { id: o.ortam.id, ad: o.ortam.ad },
        dogrulandi: o.dogrulama?.durum === 'basarili', onizleme, secim: varsayilanSecim(onizleme), senaryolar: onerileriKur(vt, o, plan, baslik), farklar,
        tercih: o.kayitTercihi, senaryoVar: ayniAdliSenaryo(vt, o, baslik) !== null,
        // Ön denetim: kaydetteki paket doğrulamasının aynısı (hiçbir şey yazılmaz); sorun varsa arayüz "Onayla"yı kapatır.
        sorunlar: kayitOnDenetimi(vt, o, paket, mevcut)
      }
    };
  }

  /**
   * Kayıt ÖN DENETİMİ: kaydetin çağıracağı paket doğrulaması (mevcut modelli ekranda "modeli değiştir", yoksa "ekran ekle") yazmadan
   * çalıştırılır; hatalar anlaşılır kayıt sorunlarına çevrilir (kayit-sorunlari.mjs). Sorun yoksa [].
   * @param {Veritabani} vt @param {Nesne} o @param {unknown} paket @param {unknown} mevcut
   */
  function kayitOnDenetimi(vt, o, paket, mevcut) {
    try {
      const d = mevcut && o.ekran.id ? paketOnizle(vt, o.projeId, paket, { ekranId: o.ekran.id, mod: 'degistir' }) : paketOnizle(vt, o.projeId, paket, { mod: 'yeni' });
      return d.gecerli ? [] : kayitSorunlari(d.hatalar, paket);
    } catch (h) {
      return kayitSorunlari([{ yer: '', mesaj: h instanceof Error ? h.message : String(h) }], paket);
    }
  }

  /** Paket doğrulama hatası → sorun listeli hızlı test hatası (arayüz maddeleri ve "Düzelt" yönlendirmesini gösterir). @param {Nesne[]} sorunlar */
  const kayitSorunuHatasi = (sorunlar) => new HizliTestHatasi('PAKET', `Test kaydedilemedi: ${sorunlar.length} sorun var.`, 400, { hatalar: sorunlar });

  /** Düzenleme kipinde ekranın aynı başlıklı senaryosu (kimliği) ya da null. @param {Veritabani} vt @param {Nesne} o @param {string} baslik */
  function ayniAdliSenaryo(vt, o, baslik) {
    if (!o.ekran.id) return null;
    const r = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, o.ekran.id, baslik])[0];
    return r ? String(r.id) : null;
  }

  /**
   * Seçimle test verisini yazar (kayit-plani.mjs planYaz), senaryo alanlarını tablo başvurusuna çevirir ("${Tablo.Sütun}"), senaryoyu kendi
   * satırına sabitler (tabloSecimleri). 'atla' denen tablonun alanları düz değerle kalır. Hata olursa oturum değerleri eski haline döner.
   * @param {Veritabani} vt @param {Nesne} o @param {string} baslik @param {Nesne} secim
   */
  function planiUygula(vt, o, baslik, secim) {
    const plan = planKurOturum(vt, o, baslik);
    if (!plan.tablolar.length) return null;
    const yedekDegerler = structuredClone(o.degerler);
    const yedekSecimler = structuredClone(o.tabloSecimleri);
    try {
      const yazilan = planYaz(vt, o.projeId, plan, secim, { ekranAdi: o.ekran.ad });
      for (const y of yazilan) {
        // Senaryo kendi satırına sabitlenir: kayıt tablosunda satır kimliğiyle (gizli sütun değerinden bağımsız), listede değerle.
        const pin = pinSecimi(y);
        // Aynı tablodan "Doldur" ile başka bir satır zaten seçilmişse (o alanlar o satırdan gelir) yazılan satır ayrı bir grupla
        // (${Tablo[senaryo].Sütun}) kullanılır: iki satır birbirini ezmez.
        const onceki = o.tabloSecimleri[pinAnahtari(y.id)];
        const etiket = pin && y.tur !== 'liste' && onceki && JSON.stringify(onceki) !== JSON.stringify(pin) ? KAYIT_ETIKETI : '';
        if (pin) o.tabloSecimleri[grupAnahtari(y.id, etiket)] = pin;
        for (const a of y.plan.alanlar) if (a.degerli) o.degerler[a.oturumAnahtar] = { deger: basvuruYaz(y.ad, y.hedef(a.sutun), etiket), kaynak: 'tablo' };
      }
      return { plan, yazilan };
    } catch (h) {
      o.degerler = yedekDegerler;
      o.tabloSecimleri = yedekSecimler;
      throw new HizliTestHatasi('TABLO', h instanceof Error ? h.message : String(h));
    }
  }

  /**
   * Ekranın test verisi bölümü: seçilen bağlantılarda alan → yazılan tablonun sütunu (Ekran > Test verisi). Seçim alanına gizli sütun
   * bağlanmaz (ekran-baglari kuralı). @returns {number} bağlanan alan sayısı
   * @param {Veritabani} vt @param {Nesne} o @param {string} ekranId @param {Nesne} paket @param {NonNullable<ReturnType<typeof planiUygula>>} sonuc @param {string[] | null} secilenAlanlar
   */
  function alanlariTabloyaBagla(vt, o, ekranId, paket, sonuc, secilenAlanlar) {
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(paket.model, alanlar);
    /** @type {Record<string, { tablo: string; sutun: string }>} */
    const yeni = {};
    for (const y of sonuc.yazilan) {
      for (const a of y.plan.alanlar) {
        const senaryoAnahtari = anahtarlar[a.oturumAnahtar];
        if (!senaryoAnahtari || (secilenAlanlar && !secilenAlanlar.includes(senaryoAnahtari))) continue;
        const gizli = y.plan.sutunlar.find((x) => x.ad === a.sutun)?.gizli === true;
        const tur = String(alanlar.find((x) => x.anahtar === a.oturumAnahtar)?.tur ?? '');
        if (gizli && ['select', 'radio'].includes(tur)) continue;
        yeni[senaryoAnahtari] = { tablo: y.id, sutun: y.hedef(a.sutun) };
      }
    }
    if (!Object.keys(yeni).length) return 0;
    ekranAlanBaglariniKaydet(vt, o.projeId, ekranId, { ...ekranAlanBaglari(vt, ekranId), ...yeni });
    // Seçim alanlarının sayfa değeri karşılıkları (tablo değeri ↔ sayfadaki seçenek) eksikse eklenir.
    try { karsiliklariEkrandanAl(vt, o.projeId, ekranId); } catch { /* karşılık eklenemedi: bağ yine geçerli */ }
    return Object.keys(yeni).length;
  }

  /** Kaydet: aynı ekran varsa önce farklar (onaysız); sonra ekran modeli + senaryo. @param {Veritabani} vt @param {Nesne} g @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; medyaKlasoru: string }} c */
  async function kaydet(vt, g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    const baslik = metin(g.baslik, 200) ?? o.senaryoBasligi;
    // Düzenleme kipi: ekranda aynı başlıklı senaryo varsa üzerine yazmadan önce sorulur (hiçbir şey yazılmadan döner); arayüz "Üzerine
    // yaz" (uzerineYaz: true) / "Yeni adla kaydet" (başka başlık) / "Vazgeç" seçtirir.
    if (g.uzerineYaz !== true && ayniAdliSenaryo(vt, o, baslik)) return { senaryoVar: true, baslik };
    o.senaryoBasligi = baslik;
    let { paket, veri, mevcut } = paketKur(vt, o);
    if (mevcut && o.ekran.id && g.onay !== true) {
      const bulgular = modelFarki(mevcut, /** @type {Nesne} */ (paket).model);
      const onizleme = paketOnizle(vt, o.projeId, paket, { ekranId: o.ekran.id, mod: 'degistir' });
      if (!onizleme.gecerli) throw kayitSorunuHatasi(kayitSorunlari(onizleme.hatalar, paket));
      o.farklar = {
        ozet: bulguOzeti(bulgular), maddeler: bulgular.slice(0, 30).map((/** @type {Nesne} */ b) => String(b.baslik ?? b.tur)),
        senaryolar: /** @type {Nesne} */ (onizleme.etki ?? {}).senaryolar?.map?.((/** @type {Nesne} */ s2) => s2.baslik) ?? []
      };
      return { onayGerekli: true, farklar: o.farklar };
    }
    // Ön denetim: paket geçersizse test verisi tabloları da yazılmadan durulur (sorunlar maddeli döner).
    const onSorunlar = kayitOnDenetimi(vt, o, paket, mevcut);
    if (onSorunlar.length) throw kayitSorunuHatasi(onSorunlar);
    // Test verisi: özetteki seçimle (yoksa varsayılan: aynı adlı tablo varsa birleştir, yoksa yeni) yazılır; senaryo alanları tabloya bağlanır.
    let tablo = null;
    /** @type {Nesne | null} */
    let uygulanan = null;
    if (g.tabloOlustur !== false) {
      let secim = nesneMi(g.secim) ? /** @type {Nesne} */ (g.secim) : null;
      if (!secim) {
        const alanlar0 = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
        secim = varsayilanSecim(planOnizle(vt, o.projeId, planKurOturum(vt, o, baslik), o.ekran.id ?? null, senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, alanlar0)));
      }
      uygulanan = planiUygula(vt, o, baslik, secim);
      if (uygulanan) ({ paket, veri, mevcut } = paketKur(vt, o));
    }
    let ekranId = o.ekran.id;
    try {
      if (mevcut && ekranId) {
        await modeliPaketleDegistir(vt, o.projeId, ekranId, paket, { onay: true, senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
      } else {
        const r = await sayfaEkle(vt, o.projeId, paket, { senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
        ekranId = r.ekranId;
      }
    } catch (h) {
      // "Paket geçersiz (n sorun)." yerine maddeler (anlaşılır dil + Düzelt hedefi + teknik ayrıntı).
      if (h instanceof EkranDogrulamaHatasi && Array.isArray(h.hatalar) && h.hatalar.length) throw kayitSorunuHatasi(kayitSorunlari(h.hatalar, paket));
      throw h;
    }
    const ayni = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, ekranId, baslik])[0];
    if (uygulanan) {
      const secilen = Array.isArray(/** @type {Nesne} */ (g.secim)?.baglantilar) ? /** @type {string[]} */ (/** @type {Nesne} */ (g.secim).baglantilar).map(String) : null;
      let baglanan = 0;
      try { baglanan = alanlariTabloyaBagla(vt, o, ekranId, paket, uygulanan, secilen); } catch (h) { gunluk(o, `Alanlar tabloya bağlanamadı: ${h instanceof Error ? h.message : String(h)}`); }
      tablo = {
        baglanan,
        tablolar: uygulanan.yazilan.map((/** @type {Nesne} */ y) => ({
          tablo: y.ad, tabloId: y.id, sutunSayisi: y.plan.sutunlar.length, yeni: y.islem === 'yeni' || y.islem === 'yeniAd', islem: y.islem, eklenenSatir: y.eklenenSatir, eklenenSutun: y.eklenenSutun,
          secenekSayisi: y.tur === 'liste' ? y.plan.satirlar.length : 0
        })),
        atlanan: uygulanan.plan.tablolar.filter((/** @type {Nesne} */ t) => !t.yalnizOneri).map((/** @type {Nesne} */ t) => t.ad).filter((/** @type {string} */ ad) => !uygulanan?.yazilan.some((/** @type {Nesne} */ y) => y.planAdi === ad))
      };
    }
    const hizli = {
      izin: o.izin, dogrulandi: o.dogrulama?.durum === 'basarili',
      bitis: { bitti: o.bitis.bitti, hata: o.bitis.hata, devam: o.bitis.devam, adres: o.bitis.adres, ...(o.bitis.ogeler?.length ? { ogeler: o.bitis.ogeler } : {}) }, olusturma: simdi()
    };
    // Düz seçim değerleri (tabloya yazılmamış seçimler, sayfanın iç koduyla) kaydedilen modelin senaryo değerine çevrilir: alan tabloya
    // bağlıysa tablodaki görünen ad (iç kod sütunun karşılığında), değilse modelin seçenek değeri.
    try { secimDegerleriniUydur(modelBaglami(vt, ekranId)?.model, veri); } catch { /* model okunamadı: değerler olduğu gibi */ }
    const s2 = senaryoKaydet(vt, {
      ...(ayni ? { id: String(ayni.id) } : {}), projeId: o.projeId, ekranId, baslik, veri, ortamIdleri: [o.ortam.id], kosuyaDahil: g.kosuyaDahil !== false,
      tabloSecimleri: Object.keys(o.tabloSecimleri).length ? o.tabloSecimleri : undefined, hizliTest: hizli
    }, { kosuyorMu: c.kosuyorMu });
    // Seçilen dosyalar (şifreli depo) senaryoya bağlanır: sahipsiz dosya temizliği silmez.
    dosyaSahipleriniBagla(vt, 'senaryo', String(s2.id), veri);
    // Senaryo önerilerinden seçilenler: her değişiklik ilgili liste tablosunun satırını seçer (bağlı listeler birlikte). Senaryoda değeri olmayan
    // alan (sayfada hazır gelen radyo / liste) tablo başvurusuyla senaryoya eklenir; satır seçimi o değere sabitlenir.
    /** @type {Array<{ id: string; baslik: string; veriBekliyor?: string[] }>} */
    const ek = [];
    const istenen = Array.isArray(g.senaryoIndeksleri) ? g.senaryoIndeksleri.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
    if (uygulanan && istenen.length) {
      const oneriler = onerileriKur(vt, o, uygulanan.plan, baslik);
      const anahtarlar = senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar));
      for (const i of istenen) {
        const oneri = oneriler.find((x) => x.indeks === i);
        if (!oneri?.alt) continue;
        // Veri gerektiren dal (değeri olmayan alan açar): değer ÜRETİLMEZ. Senaryo "veri bekliyor" olarak kaydedilir: alanlar test verisinde
        // kendi boş satırına (${Tablo[dal].Sütun}) bağlanır, senaryo koşuya dahil edilmez; kullanıcı hücreleri doldurup koşuya alır.
        const eksikler = (oneri.eksikAlanlar ?? []).map((x) => ({ ...x, alan: planAlanlari(o).find((/** @type {Nesne} */ a) => a.anahtar === x.anahtar) }))
          .filter((x) => x.alan && anahtarlar[x.anahtar]);
        if (oneri.veriGerekli?.length && !eksikler.length) { gunluk(o, `“${oneri.baslik}” önerisi kaydedilmedi: veri gerekli (${oneri.veriGerekli.join(', ')}) ama alanlar ekran modelinde yok.`); continue; }
        const pinler = structuredClone(o.tabloSecimleri);
        const veri2 = structuredClone(veri);
        let tamam = true;
        // Aynı tablodaki değişiklikler (zincir: satırın tüm halkaları) tek satır seçiminde birleşir.
        /** @type {Set<string>} */
        const yeniPin = new Set();
        for (const d of oneri.alt.degisiklikler) {
          const y = uygulanan.yazilan.find((/** @type {Nesne} */ k) => k.planAdi === d.planAdi);
          if (!y) {
            // Yalnız öneri için tutulan seçim (radyo / onay kutusu / değer yazılmayan seçim; tabloya yazılmaz): değer senaryoya düz yazılır
            // (seçeneğin sayfa değeri).
            const pt = uygulanan.plan.tablolar.find((/** @type {Nesne} */ t) => t.ad === d.planAdi);
            const an = anahtarlar[d.oturumAnahtar];
            if (!pt?.yalnizOneri || !an) { tamam = false; break; }
            const alan = planAlanlari(o).find((/** @type {Nesne} */ a) => a.anahtar === d.oturumAnahtar);
            veri2[an] = pt.sutunlar.find((/** @type {Nesne} */ s) => s.ad === d.sutun)?.karsiliklar?.[d.deger]?.sayfa
              ?? (alan ? tumSecenekler(alan).find((x) => x.metin === d.deger)?.kod : undefined) ?? d.deger;
            continue;
          }
          const pa = pinAnahtari(y.id);
          if (!yeniPin.has(pa)) { pinler[pa] = {}; yeniPin.add(pa); }
          pinler[pa][y.hedef(d.sutun)] = d.deger.slice(0, 200);
          const anahtar = anahtarlar[d.oturumAnahtar];
          if (anahtar && veri2[anahtar] === undefined) veri2[anahtar] = basvuruYaz(y.ad, y.hedef(d.sutun));
        }
        if (!tamam) { gunluk(o, `“${oneri.baslik}” önerisi kaydedilmedi: tablosu yazılmadı (atlandı).`); continue; }
        // Önerinin dalında düzenlenemeyen (sayfanın doldurduğu) alanların değeri senaryoya yazılmaz.
        for (const k of Array.isArray(oneri.alt.kaldirilanlar) ? oneri.alt.kaldirilanlar : []) { const an = anahtarlar[k]; if (an) delete veri2[an]; }
        /** @type {ReturnType<typeof veriBekleyenSatirlariYaz>} */
        let bekleyen = [];
        if (eksikler.length) {
          bekleyen = veriBekleyenSatirlariYaz(vt, o.projeId, { satirAdi: oneri.baslik, ekranAdi: o.ekran.ad, ekGizliAdlar: ekGizliAdlar(vt), alanlar: eksikler });
          for (const b of bekleyen) {
            pinler[grupAnahtari(b.tabloId, VERI_BEKLIYOR_ETIKETI)] = satirSabitlemesi(b.satirId);
            veri2[anahtarlar[b.anahtar]] = basvuruYaz(b.tabloAdi, b.sutun, VERI_BEKLIYOR_ETIKETI);
          }
        }
        const varMi = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, ekranId, oneri.baslik])[0];
        const e = senaryoKaydet(vt, {
          ...(varMi ? { id: String(varMi.id) } : {}), projeId: o.projeId, ekranId, baslik: oneri.baslik, veri: veri2, ortamIdleri: [o.ortam.id],
          kosuyaDahil: bekleyen.length ? false : g.kosuyaDahil !== false, tabloSecimleri: pinler,
          ...(bekleyen.length ? { veriBekliyor: bekleyen.map((b) => ({ etiket: b.etiket, tabloId: b.tabloId, sutun: b.sutun, satirId: b.satirId })) } : {})
        }, { kosuyorMu: c.kosuyorMu });
        if (bekleyen.length) gunluk(o, `“${oneri.baslik}” veri bekliyor olarak koşu dışı kaydedildi (${[...new Set(bekleyen.map((b) => b.etiket))].join(', ')}; değerleri test verisinde doldurun).`);
        ek.push({ id: e.id, baslik: oneri.baslik, ...(bekleyen.length ? { veriBekliyor: [...new Set(bekleyen.map((b) => b.etiket))] } : {}) });
      }
    }
    let hazirlik = null;
    try { hazirlik = senaryoHazirligi(vt, o.projeId, s2.id, o.ortam.id); } catch { hazirlik = null; }
    const senaryo = senaryoGetir(vt, s2.id);
    o.kayit = { ekranId, senaryoId: s2.id, senaryoBasligi: senaryo?.baslik ?? baslik, dogrulandi: hizli.dogrulandi, hazirlik, uyarilar: s2.uyarilar, tablo, ekSenaryolar: ek };
    o.ekran = { ...o.ekran, id: ekranId };
    o.durum = 'kaydedildi';
    o.calisiyor = null;
    dosyaKlasorunuSil(o);
    gunluk(o, `Kaydedildi: ekran “${o.ekran.ad}”, senaryo “${baslik}”${hizli.dogrulandi ? '' : ' (doğrulanmadı)'}.`);
    // Tarayıcı kapatılır (iş biter).
    try { gonder(o, { tur: 'bitir' }); } catch { /* iş zaten bitti */ }
    o.bekleyen = null;
    return { kaydedildi: true, ...o.kayit };
  }

  /**
   * Modeli güncelleme (mevcut ekran, "Modeli güncelle › Nöbetçi taraması"): gezilen ekran mevcut modelle karşılaştırılır ve farklar
   * ekranın bulgularına (tekrar analiz: tek tek kabul / red) yazılır; model ve senaryolar DEĞİŞMEZ. Oturum biter (tarayıcı kapanır).
   * @param {Veritabani} vt @param {Nesne} g @param {{ medyaKlasoru: string }} c
   */
  async function farklar(vt, g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    if (!o.modelGuncelleme || !o.ekran.id) throw new HizliTestHatasi('DURUM', 'Farklar yalnız mevcut ekranın modeli güncellenirken gösterilir.');
    const { paket, mevcut } = paketKur(vt, o);
    if (!mevcut) throw new HizliTestHatasi('DURUM', 'Ekranın modeli bulunamadı.');
    /** @type {Awaited<ReturnType<typeof analizYukle>>} */
    let r;
    try {
      r = await analizYukle(vt, o.projeId, String(o.ekran.id), paket, { medyaKlasoru: c.medyaKlasoru });
    } catch (h) {
      if (h instanceof EkranDogrulamaHatasi && Array.isArray(h.hatalar) && h.hatalar.length) throw kayitSorunuHatasi(kayitSorunlari(h.hatalar, paket));
      throw h;
    }
    o.kayit = { ekranId: o.ekran.id, farklar: true, bulguSayisi: r.bulguSayisi, gizlenenSayisi: r.gizlenenSayisi,
      karsilastirilmayan: Array.isArray(/** @type {Nesne} */ (paket).bilinmeyenler) ? /** @type {Nesne} */ (paket).bilinmeyenler.filter((/** @type {unknown} */ x) => String(x).startsWith('Nöbetçi taraması şu adımlara geçmedi')) : [] };
    o.durum = 'kaydedildi';
    o.calisiyor = null;
    dosyaKlasorunuSil(o);
    gunluk(o, r.bulguSayisi ? `Karşılaştırıldı: ${r.bulguSayisi} değişiklik kararınızı bekliyor.` : 'Karşılaştırıldı: mevcut modelle fark yok.');
    try { gonder(o, { tur: 'bitir' }); } catch { /* iş zaten bitti */ }
    o.bekleyen = null;
    return { kaydedildi: true, ...o.kayit };
  }

  /** Oturumun veri durağındaki dosya alanı. @param {Nesne} o @param {unknown} anahtar */
  const dosyaAlani = (o, anahtar) => {
    const a = typeof anahtar === 'string' ? o.alanlar.get(anahtar)?.alan : undefined;
    if (!a || a.tur !== 'file') throw new HizliTestHatasi('DOSYA', 'Bu alan bir dosya alanı değil.');
    return a;
  };

  /**
   * "Dosya seç" (kullanıcının bilgisayarından): dosya bellekte şifrelenip Nöbetçi'nin şifreli senaryo dosyası deposuna yazılır (düz metin
   * diske yazılmaz; uzantı alanın "accept"inden). Başvuru döner; değer veri durağında "Devam et" ile gider.
   * @param {Veritabani} vt @param {{ id: string; alan: unknown; ad: string; icerik: Buffer }} g @param {string} medyaKlasoru
   */
  async function dosyaYukle(vt, g, medyaKlasoru) {
    const o = oturumGetir(g.id);
    durumda(o, ['veri']);
    const a = dosyaAlani(o, g.alan);
    const d = await senaryoDosyasiEkle(vt, { klasor: medyaKlasoru, icerik: g.icerik, ad: g.ad, kabul: typeof a.kabul === 'string' && a.kabul ? a.kabul : undefined, sahipTuru: null, kaynak: hizliTestKaynagi(o.projeId) });
    gunluk(o, `“${a.etiket ?? a.anahtar}” için dosya şifreli depoya yüklendi (${d.ad}).`);
    return { dosya: d };
  }

  /** "Depodan seç": projenin şifreli senaryo dosyaları (ad, boyut, başvuru; içerik dönmez). @param {Veritabani} vt @param {string} id */
  function dosyalar(vt, id) {
    const o = oturumGetir(id);
    return { dosyalar: projeSenaryoDosyalari(vt, o.projeId) };
  }

  /**
   * "Süreyi uzat": boşta kalma sayacı sıfırlanır (her kullanıcı işlemi de sıfırlar; mutlak üst sınır değişmez). @param {Nesne} g
   */
  function uzat(g) {
    const o = oturumGetir(String(g.id ?? ''), false);
    if (o.tarayici !== 'acik') throw new HizliTestHatasi('TARAYICI_KAPALI', 'Tarayıcı kapalı; süre uzatılamaz. “Kaldığın yerden devam et” ile yeniden açın.', 409);
    let sure;
    try { sure = tarama().hizliUzat(o.isId); } catch { throw new HizliTestHatasi('TARAYICI_KAPALI', 'Tarayıcı kapandı; süre uzatılamaz. “Kaldığın yerden devam et” ile yeniden açın.', 409); }
    gunluk(o, 'Süre uzatıldı.');
    return { sure };
  }

  /**
   * Tarayıcı kapandıktan sonra (süre doldu, pencere kapatıldı, zincir kurulamadı) ya da tarayıcı gerektiren bir adımda kapalıyken:
   *  - kip 'tarayici' ("Kaldığın yerden devam et" / "Tarayıcıyı yeniden aç"): tarayıcı yeniden açılır, zincir baştan tekrar yürütülür ve
   *    kalınan adıma gelinir (düğmelere yeniden basılır: yeni kayıt oluşabilir).
   *  - kip 'kaydet' ("Toplananları kaydet"): tarayıcı açılmadan bitiş koşuluna / kaydete geçilir; doğrulama yapılmadıysa test
   *    "doğrulanmadı" olarak kaydedilir.
   * @param {Nesne} g @param {TarayiciBaglami} [c]
   */
  function devam(g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    const kip = g.kip === 'kaydet' ? 'kaydet' : 'tarayici';
    if (kip === 'tarayici') {
      if (o.durum === 'askida') {
        durumda(o, ['askida']);
        yenidenBasisOnayi(o, g);
        tarayiciyiAc(o, c, 'kur', o.askida?.hedef ?? devamHedefi(o));
        return { tamam: true };
      }
      // Tarayıcı kapalıyken tarayıcı gerektiren adımda (ör. bitiş koşulunda "Sayfayı yeniden tara"): aynı adıma yeniden açılır.
      durumda(o, ['bitis', 'hayirSecim', 'karar', 'veri', 'hataSorusu', 'onay']);
      if (o.tarayici === 'acik') return { tamam: true };
      yenidenBasisOnayi(o, g);
      tarayiciyiAc(o, c, 'kur', devamHedefi(o));
      return { tamam: true };
    }
    durumda(o, ['askida']);
    const askida = o.askida;
    o.askida = null;
    if (o.bitis) {
      o.farklar = null;
      if (o.izin !== 'hayir' && o.dogrulama?.durum !== 'basarili') o.dogrulama = { durum: 'yapilmadi', mesaj: 'Tarayıcı kapandı; doğrulama koşusu yapılmadı. Test “doğrulanmadı” olarak kaydedilir (kaydet ekranından doğrulayabilirsiniz).', gorulen: [] };
      o.durum = 'kaydet';
    } else if (o.izin === 'hayir') {
      o.durum = 'hayirSecim';
    } else {
      // Bitiş koşulu adımı ("Burada bitir" ile aynı kural): en az bir basış gerekir.
      o.durum = 'karar';
      try { karar({ id: o.id, karar: 'bitir' }); } catch (h) { o.durum = 'askida'; o.askida = askida; throw h; }
    }
    gunluk(o, 'Toplananlar kaydediliyor (tarayıcı kapalı).');
    return { tamam: true, durum: o.durum };
  }

  /** @param {Nesne} g */
  function iptal(g) {
    const o = oturumGetir(String(g.id ?? ''));
    if (['kaydedildi', 'iptal'].includes(o.durum)) return { iptal: true };
    dosyaKlasorunuSil(o);
    o.durum = 'iptal';
    o.hata = { kod: 'IPTAL', mesaj: 'Nöbetçi taraması iptal edildi; hiçbir şey kaydedilmedi.' };
    try { tarama().iptal(o.isId); } catch { /* iş zaten bitti */ }
    return { iptal: true };
  }

  // ---- "Tarayıcıda şu an": sürekli kare akışı ve "Tarayıcıyı göster" ----
  /** Oturumun o anki tarayıcı işi (tarayıcı yeniden açılınca değişir). @param {Nesne} o @returns {Nesne | null} */
  const tarayiciIsi = (o) => { try { return o.isId ? (tarama().isler.get(o.isId) ?? null) : null; } catch { return null; } };
  /**
   * Canlı akış kaynağı (sunucu vekili için; platform/canli-akis.mjs). Duyuru yolu her bağlantıda yeniden okunur (tarayıcı yeniden
   * açılırsa yeni işin yayınına geçilir). Oturum bitince (kaydedildi / iptal / hata) akış biter. Durum yoklaması gibi etkileşim sayılmaz.
   * @param {string} id
   */
  function canliKaynak(id) {
    const o = oturumGetir(id, false);
    return {
      duyuruYolu: () => (o.tarayici === 'acik' ? (tarayiciIsi(o)?.canliDuyuruYolu ?? null) : null),
      suruyorMu: () => oturumlar.get(o.id) === o && !['kaydedildi', 'iptal', 'hata'].includes(o.durum)
    };
  }
  /** "Tarayıcıyı göster": görünür tarayıcıyı öne getirir (page.bringToFront); başsız / kapalıysa açık ileti. @param {Nesne} g */
  async function tarayiciyiGoster(g) {
    const o = oturumGetir(String(g.id ?? ''), false);
    const t = o.tarayici === 'acik' ? tarayiciIsi(o) : null;
    if (!t || t.durum !== 'suruyor') return { gosterildi: false, mesaj: 'Nöbetçi taraması tarayıcısı şu anda kapalı.' };
    if (!t.gorunur) return { gosterildi: false, mesaj: 'Nöbetçi taraması tarayıcısı görünmez çalışıyor; pencere gösterilemez.' };
    const y = await canliKanalaIstek(t.canliDuyuruYolu, '/one-getir');
    return y && y.durum === 200 ? { gosterildi: true, mesaj: 'Tarayıcı penceresi öne getirildi.' } : { gosterildi: false, mesaj: 'Tarayıcı penceresi henüz hazır değil; birazdan yeniden deneyin.' };
  }

  /**
   * "Sayfanın tamamı": tarayıcıdaki sayfanın tam sayfa jpeg görüntüsü (test sürecinde bellekte üretilir). Etkileşim sayılmaz.
   * @param {string} id @returns {Promise<{ durum: number; jpeg: Buffer | null; mesaj: string }>}
   */
  async function tamSayfa(id) {
    const o = oturumGetir(id, false);
    const t = o.tarayici === 'acik' ? tarayiciIsi(o) : null;
    if (!t || t.durum !== 'suruyor') return { durum: 409, jpeg: null, mesaj: 'Nöbetçi taraması tarayıcısı şu anda kapalı.' };
    return canliTamSayfaAl(t.canliDuyuruYolu);
  }

  return {
    oturumlar,
    canliKaynak,
    tarayiciyiGoster,
    tamSayfa,
    secenekler,
    baslat,
    // Durum yoklaması kullanıcı işlemi sayılmaz (boşta kalma sayacını sıfırlamaz).
    durum: (/** @type {string} */ id) => gorunum(oturumGetir(id, false)),
    veri,
    dosyaYukle,
    dosyalar,
    karar,
    onay,
    diyalogCevabi,
    hataCevabi,
    yenidenTara,
    bitisSec,
    bitisEkle,
    geri,
    bitis,
    dogrula,
    ozet: kayitOzeti,
    kaydet,
    farklar,
    uzat,
    devam,
    iptal
  };
}

/** @type {ReturnType<typeof hizliTestYoneticisiOlustur> | null} */
let varsayilan = null;

/**
 * /platform/hizli-test/* isteklerini işler (sunucu-platform.mjs'den). Eşleşmezse false. Depo / kasa / izin hataları çağırana fırlatılır.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {{ token: string; disTokenGecerli: boolean; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void;
 *   jsonGovde: (sinir?: number) => Promise<Record<string, unknown> | null>; acikVeritabani: () => Promise<Veritabani>; projeKoku: string;
 *   medyaKlasoru: () => string; kosuyorMu?: (dosya: string, ad: string) => boolean;
 *   ikiliGovdeOku?: (req: import('node:http').IncomingMessage, sinir: number) => Promise<Buffer>; dosyaKoku?: () => string }} b
 *   dosyaKoku: seçilen dosyaların oturuma özel geçici kopyalarının kökü (gecici-dosyalar.mjs > geciciDosyaKoku)
 */
export async function hizliTestIsteginiIsle(req, res, b) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/hizli-test/')) return false;
  varsayilan ??= hizliTestYoneticisiOlustur({ projeKoku: b.projeKoku });
  const y = varsayilan;
  const gonder = (/** @type {number} */ durum, /** @type {Nesne} */ govde) => {
    res.setHeader('Cache-Control', 'no-store');
    b.jsonGonder(res, durum, govde);
  };
  try {
    if (req.method === 'GET') {
      if (!b.disTokenGecerli) { gonder(401, { basarili: false, mesaj: 'Geçersiz token.' }); return true; }
      const q = url.searchParams;
      if (yol === '/platform/hizli-test/secenekler') {
        const db = await b.acikVeritabani();
        const ekranId = q.get('ekranId');
        gonder(200, { basarili: true, ...y.secenekler(db, kimlikAl(q.get('projeId'), 'projeId'), ekranId ? kimlikAl(ekranId, 'ekranId') : null) });
        return true;
      }
      if (yol === '/platform/hizli-test/durum') { gonder(200, { basarili: true, oturum: y.durum(String(q.get('id') ?? '')) }); return true; }
      if (yol === '/platform/hizli-test/dosyalar') { gonder(200, { basarili: true, ...y.dosyalar(await b.acikVeritabani(), String(q.get('id') ?? '')) }); return true; }
      // "Tarayıcıda şu an" sürekli kare akışı (SSE; token başlıkta). Kareler bellekten iletilir, diske yazılmaz.
      if (yol === '/platform/hizli-test/canli-akis') {
        const k = y.canliKaynak(String(q.get('id') ?? ''));
        canliAkisiVekille(req, res, { ...k, en: Number(q.get('en')) || null, boy: Number(q.get('boy')) || null });
        return true;
      }
      // "Sayfanın tamamı": tarayıcıdaki sayfanın tam sayfa anlık görüntüsü (jpeg; bellekte, diske yazılmaz; sayfa kaydırılmaz).
      if (yol === '/platform/hizli-test/canli-tam-sayfa') {
        const t = await y.tamSayfa(String(q.get('id') ?? ''));
        if (!t.jpeg) { gonder(t.durum, { basarili: false, mesaj: t.mesaj }); return true; }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': String(t.jpeg.length), 'Cache-Control': 'no-store' });
        res.end(t.jpeg);
        return true;
      }
      gonder(404, { basarili: false, mesaj: 'Bilinmeyen Nöbetçi taraması uç noktası.' });
      return true;
    }
    if (req.method !== 'POST') { gonder(405, { basarili: false, mesaj: 'Yöntem desteklenmiyor.' }); return true; }
    // "Dosya seç": ham dosya gövdesi (X-Dosya-Adi başlığı; ?id=<oturum>&alan=<alan anahtarı>). Yalnız bellekte; şifreli depoya yazılır.
    if (yol === '/platform/hizli-test/dosya-yukle') {
      if (!b.disTokenGecerli) { res.setHeader('Connection', 'close'); gonder(401, { basarili: false, mesaj: 'Geçersiz token.' }); return true; }
      if (!b.ikiliGovdeOku) { gonder(500, { basarili: false, mesaj: 'Dosya yükleme bu sunucuda kullanılamıyor.' }); return true; }
      let icerik;
      try {
        icerik = await b.ikiliGovdeOku(req, DOSYA_BOYUT_SINIRI);
      } catch (h) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (h).cokBuyuk);
        res.setHeader('Connection', 'close');
        gonder(cokBuyuk ? 413 : 400, { basarili: false, mesaj: cokBuyuk ? `Dosya en fazla ${DOSYA_BOYUT_SINIRI / 1024 / 1024} MB olabilir.` : 'Dosya okunamadı.' });
        return true;
      }
      try {
        let ad = '';
        try { ad = decodeURIComponent(String(req.headers['x-dosya-adi'] ?? '')); } catch { ad = ''; }
        const db = await b.acikVeritabani();
        gonder(200, { basarili: true, ...(await y.dosyaYukle(db, { id: String(url.searchParams.get('id') ?? ''), alan: url.searchParams.get('alan'), ad, icerik }, b.medyaKlasoru())) });
      } finally {
        icerik.fill(0);
      }
      return true;
    }
    const govde = await b.jsonGovde();
    if (!govde) return true;
    if (govde.token !== b.token && !b.disTokenGecerli) { gonder(401, { basarili: false, mesaj: 'Geçersiz token.' }); return true; }
    const db = await b.acikVeritabani();
    /** Tarayıcıyı (yeniden) açan uçlar için: veritabanı ve sunucu adresi. */
    const tarayiciBaglami = { vt: db, baglam: { sunucuAdresi: `http://127.0.0.1:${req.socket.localPort}` } };
    /** @type {Record<string, () => Nesne | Promise<Nesne>>} */
    const islemler = {
      '/platform/hizli-test/baslat': () => {
        const sonuc = y.baslat(db, govde, { sunucuAdresi: `http://127.0.0.1:${req.socket.localPort}` });
        console.log(`[platform] Nöbetçi taraması başlatıldı (${sonuc.id}).`);
        return sonuc;
      },
      '/platform/hizli-test/veri': () => y.veri(db, govde, { medyaKlasoru: b.medyaKlasoru(), dosyaKoku: b.dosyaKoku?.() }),
      '/platform/hizli-test/karar': () => y.karar(govde),
      '/platform/hizli-test/onay': () => y.onay(govde),
      '/platform/hizli-test/diyalog': () => y.diyalogCevabi(govde),
      '/platform/hizli-test/hata-cevabi': () => y.hataCevabi(govde),
      '/platform/hizli-test/yeniden-tara': () => y.yenidenTara(govde),
      '/platform/hizli-test/bitis-sec': () => y.bitisSec(govde),
      '/platform/hizli-test/bitis-ekle': () => y.bitisEkle(govde),
      '/platform/hizli-test/bitis': () => y.bitis(govde),
      '/platform/hizli-test/geri': () => y.geri(govde, tarayiciBaglami),
      '/platform/hizli-test/dogrula': () => y.dogrula(govde, tarayiciBaglami),
      '/platform/hizli-test/uzat': () => y.uzat(govde),
      '/platform/hizli-test/devam': () => y.devam(govde, tarayiciBaglami),
      '/platform/hizli-test/ozet': () => y.ozet(db, govde),
      '/platform/hizli-test/kaydet': () => y.kaydet(db, govde, { kosuyorMu: b.kosuyorMu, medyaKlasoru: b.medyaKlasoru() }),
      '/platform/hizli-test/farklar': () => y.farklar(db, govde, { medyaKlasoru: b.medyaKlasoru() }),
      '/platform/hizli-test/iptal': () => y.iptal(govde),
      '/platform/hizli-test/tarayiciyi-goster': () => y.tarayiciyiGoster(govde)
    };
    const islem = islemler[yol];
    if (!islem) { gonder(404, { basarili: false, mesaj: 'Bilinmeyen Nöbetçi taraması uç noktası.' }); return true; }
    gonder(200, { basarili: true, ...(await islem()) });
    return true;
  } catch (hata) {
    if (hata instanceof HizliTestHatasi || hata instanceof TaramaHatasi) {
      if (!res.headersSent) gonder(hata.durum, { basarili: false, kod: hata.kod, mesaj: hata.message, ...hata.ek });
      return true;
    }
    throw hata;
  }
}

/** Testler / kapanış: bellekteki oturumlar. */
export function hizliTestOturumlariniTemizle() {
  varsayilan?.oturumlar.clear();
}
