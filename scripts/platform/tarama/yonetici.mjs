// OTOMATİK TARAMA İŞ YÖNETİCİSİ (sunucu tarafı, genel) — "Ekranı otomatik tara" ve "Akışı kaydet" (kip: 'kayit').
//
// AKIŞ KAYDI: aynı iş altyapısı; alt süreç GÖRÜNÜR tarayıcı açar, kullanıcı akışı kendisi yürütür, sayfadaki Nöbetçi paneli
// alanları/düğmeleri/mesajları TOPLAR (kayit-motoru.ts). Başlatma kuralları: açık onay (bastığı düğmeler siteye gerçek istek
// gönderir), CANLI ortamda ayrıca canlı ortam onayı (canliOnay; guvenlik/uc-denetimi.mjs), en fazla bir bağlam profili, süre sınırı varsayılan
// 30 dk (NOBETCI_KAYIT_ZAMAN_ASIMI_SN). Kayıt bitince iş "tasarım" bekler: taslak diyagram (akis-tasarimi.mjs > akisTaslagi)
// Nöbetçi'de düzenlenir; kaydedilen diyagram kayıt envanterine çevrilip kayitPaketiOlustur ile aynı ekran paketi akışına girer.
// Tasarım bekleyen iş, son erişimden itibaren TASARIM_SAKLAMA_KATI kat daha uzun saklanır (bellekte; sunucu yeniden
// başlarsa kayıt kaybolur).
//
// Uçlar (oturum token'ı; kasa açık olmalı — başlatma ve seçenekler):
//   GET  /platform/tarama/secenekler?projeId=&ekranId=   başlatma diyaloğu: ortamlar (tarif/giriş profili durumu),
//        bağlam profillerinin ADLARI (değer yok), ekranın varsayılan yolu, son seçim, çalışan iş
//   POST /platform/tarama/baslat { projeId, ekranId?, ekranAdi?, ekranAnahtari?, ortamId, baglamProfilleri: [ad],
//        hedef, kesif, onay: true, kip?: 'kayit', girissiz?: true } → { isId } (202). girissiz: sayfa GİRİŞ YAPILMADAN
//        açılır (ortamın giriş tarifi ve bağlam profilleri kullanılmaz; model "girisGerekmez" olur). Aynı anda tek tarama (409 MESGUL). Yasaklı adres → 400
//        YASAKLI_ADRES, tarayıcı açılmadan. olusturulacak?: 'ortakAkis' ("Ne oluşturulsun?"; yalnız YENİ kayıt / tarama): paket
//        ucu sonucu ortak akış paketine çevirir (sayfa-paketi.mjs > ortakAkisPaketineCevir; ekran adresi yazılmaz).
//        ORTAK AKIŞ (model tur "ortakAkis"): taranmaz (ALT_MODEL); kaydedilir (kip 'kayit' + baslangicEkranId): kayıt başlangıç
//        ekranının adresinde (model.ekranUrl) başlar, kullanıcı o ekranda gerekli adımları yapıp ortak akışın kısmını yürütür;
//        diyagramda başlangıç ekranına ait bloklar silinir ve kayıt ortak akışın TEK akışına yazılır (akisaYaz; ekran paketi
//        yok, tur/yalnizTestOrtami/senaryoDuzeyi/kosullar akis-servisi.mjs > akisKaydet ile korunur, ekran adresi yazılmaz).
//   GET  /platform/tarama/durum?id=      adımlar, profil durumları, engellenen istekler, bekleyen SMS kodu isteği, hata
//   GET  /platform/tarama/paket?id=      tamamlanan işin ekran paketi (önizleme/kabul akışına girer)
//   GET  /platform/tarama/akis?id=       akış kaydının diyagramı: bloklar + sağ liste (alan/düğme/mesaj; değer yok)
//   POST /platform/tarama/akis { id, bloklar, taslak? }  taslak: yalnızca saklar; değilse doğrular → ekran paketi
//        (hatalar: 400 AKIS_GECERSIZ + hatalar: [{ blok, mesaj }])
//   POST /platform/tarama/akis { id, bloklar, hedef: { tur: 'akis', akisId?, ad }, onay? }  mevcut ekranda kaydı bir AKIŞA
//        yazar (yeni akış ya da seçilen akışı güncelle; ekranlar/akis-servisi.mjs > akisKaydet, kaydın gerçek okumalarıyla):
//        onay yoksa etki (etkilenen senaryolar), varsa yeni model sürümü. GET …/akis mevcut ekranın akışlarını da döner.
//   GET  /platform/tarama/aktif          çalışan işin kimliği (yoksa null)
// GİRİŞ KAYDI ("Girişi kaydet"; kip: 'girisKaydi'): aynı kayıt altyapısı; ekran yok, giriş YAPILMADAN ortamın giriş sayfası
// (hedef ya da kayıtlı tarifin giriş adresi) görünür tarayıcıda açılır, kullanıcı girişi kendisi yapar; panel alanları ve
// düğmeleri toplar (DEĞER yok). Sonuç: taslak adımlar (giris/giris-kaydi.mjs). CANLI işaretli ortamda reddedilir.
//   GET  /platform/tarama/giris?id=      taslak adımlar + ek alan adı önerileri
//   POST /platform/tarama/giris { id, isaretler, secimler? }  kullanıcının işaretlerinden tarif ÖNİZLEMESİ (kaydetmez; mevcut tarifin
//        göstergeleri/bağlam adımları korunur; secimler: kod kaynağı / başarı yazısı) + doğrulama hataları + profile eklenecek ek alanlar
//   POST /platform/tarama/iptal { id }   süreç grubunu kapatır
//   POST /platform/tarama/kod { id, kod } SMS "elle" doğrulama kodunu işe iletir (kod loglanmaz)
// Alt süreç uçları (işe özel tek kullanımlık token, başlık: protokol.mjs > TARAMA_TOKEN_BASLIGI):
//   GET  /platform/tarama/is/<id>/girdi  (BİR KEZ; sonra sunucu belleğinden silinir) · POST …/olay · POST …/sonuc
//   POST …/oturum  başarılı girişin oturumu (YALNIZ "Koşunun saklanan oturumunu kullan" kipinde; koşunun şifreli dosyasına yazılır)
// GİRİŞ KİPİ (Ayarlar > Koşu > Tarama ve akış kaydı > Tarama ve akış kaydında giriş): "bastan" (varsayılan; boş tarayıcı, her
// seferinde giriş) ya da "saklananOturum": koşunun ortam + giriş profili için saklanan şifreli oturumu girdiye konur (ortamın
// kökenlerine sınırlı); girişsiz işte hiç kullanılmaz. Dosya kuralları koşuyla ortak: giris/oturum-dosyasi.mjs.
//
// Gizli değerler (parola, TOTP anahtarı, sabit kod, bağlam profili değerleri) yalnızca sunucu belleğinde ve alt
// sürecin belleğinde bulunur; diske/loga yazılmaz, ortam değişkeniyle verilmez. Sonuçtaki ekran görüntüleri iş
// bitene kadar YALNIZCA bellekte durur (kabul edilirse mevcut akış şifreli saklar). İşler ~1 saat sonra bellekten
// silinir. Süre sınırı (varsayılan 5 dk; NOBETCI_TARAMA_ZAMAN_ASIMI_SN) ya da iptalde süreç grubu kapatılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: yonetici.d.mts.

import { execFile, spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DepoHatasi, baglamProfilleriniListele, ekranAyarlariniGetir, ekranKaydet, ekranModeliGetir, ekranlariListele, girisProfiliGetir,
  girisProfilleriniListele, ortamVarsayilanGirisProfiliId, ortamlariListele, projeGetir
} from '../veritabani/depo.mjs';
import { acikAnahtar } from '../kasa.mjs';
import {
  oturumAnahtariTuret, oturumDosyaYolu, oturumDosyasiniOku, oturumDosyasinaYaz, oturumDurumuMu, oturumuKokenlereSinirla
} from '../giris/oturum-dosyasi.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { kosuAyarlariniOku, sqlSatirSiniriOku, varsayilanKosuAyarlari } from '../ayarlar/kosu-ayarlari.mjs';
import { baglamAlanlari, girisKokenleri, girisTarifiniDogrula } from '../giris/tarif.mjs';
import { KOD_DESENI, KOD_YOLU_DEGISKENI, kodIstegiOku, kodIsteginiTemizle, koduYanitla } from '../giris/elle-kod.mjs';
import { etkinYasakAdresler, etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { ucDenetle } from '../guvenlik/uc-denetimi.mjs';
import { riskliOrtamMi, riskliSecimi } from '../guvenlik/ortam-riski.mjs';
import { EKRAN_ANAHTARI_DESENI, ortakAkisPaketineCevir, sayfaPaketiniDogrula } from '../ekranlar/sayfa-paketi.mjs';
import { HedefHatasi, hedefCoz, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji } from './koruma.mjs';
import { ekranAnahtariOner, kayitPaketiOlustur, taramaPaketiOlustur } from './paket-olusturucu.mjs';
import { akisEnvanteriMi, akisPaleti, akisTaslagi, akistanKayitEnvanteri, bloklariAyikla } from './akis-tasarimi.mjs';
import { akisDuzenlenebilirMi, akisKaydet as ekranAkisiKaydet, akislariListele } from '../ekranlar/akis-servisi.mjs';
import { ortakAkisBaslangicEkranlari } from '../ekranlar/ekran-servisi.mjs';
import { ekAlanAdiOner, girisKaydiTaslagi, kayittanTarif } from '../giris/giris-kaydi.mjs';
import {
  KAYIT_BASSIZ_DEGISKENI, KAYIT_ZAMAN_ASIMI_DEGISKENI, OLAY_GOVDE_SINIRI, OTURUM_GOVDE_SINIRI, SONUC_GOVDE_SINIRI, TARAMA_GIRIS_KIPLERI, TARAMA_ADRES_DEGISKENI, TARAMA_CIKTI_DEGISKENI,
  TARAMA_DNS_KAPALI_DEGISKENI, TARAMA_GORUNUR_DEGISKENI, TARAMA_IZINLI_KOKENLER_DEGISKENI, TARAMA_TEST_SURESI_DEGISKENI, TARAMA_TOKEN_BASLIGI,
  TARAMA_TOKEN_DEGISKENI, TARAMA_ZAMAN_ASIMI_DEGISKENI, VARSAYILAN_KAYIT_ZAMAN_ASIMI_SN, VARSAYILAN_ZAMAN_ASIMI_SN
} from './protokol.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

/** Bitmiş işlerin bellekte kalma süresi. */
export const IS_SAKLAMA_MS = 60 * 60 * 1000;
/** Diyagramı kurulmayı bekleyen akış kaydı daha uzun saklanır (son erişimden itibaren). */
export const TASARIM_SAKLAMA_KATI = 12;
const SURE_SONRA_ZORLA_MS = 5000;
const ADIM_ETIKETLERI = Object.freeze({ hazirlik: 'Güvenlik kontrolü', giris: 'Giriş', profiller: 'Bağlam profilleri ve tarama', kayit: 'Akış kaydı (tarayıcıda)', paket: 'Ekran paketi' });
const IS_KIMLIGI = /^[a-f0-9]{24}$/;

export class TaramaHatasi extends Error {
  /** @param {string} kod @param {string} mesaj @param {number} [durum] @param {Nesne} [ek] */
  constructor(kod, mesaj, durum = 400, ek = {}) {
    super(mesaj);
    this.name = 'TaramaHatasi';
    this.kod = kod;
    this.durum = durum;
    this.ek = ek;
  }
}

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const simdi = () => new Date().toISOString();
/** @param {unknown} d @param {string} alan */
function kimlikAl(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {string} a @param {string} b */
function tokenEsit(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Ortamın giriş profili (şifresi çözülmüş): koşunun varsayılan profiliyle AYNI kural (depo.mjs > ortamVarsayilanGirisProfiliId;
 * önce ortama özgü, yoksa tüm ortamlar için olan) — saklanan oturum ortam + bu profille anahtarlanır.
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId
 */
function girisProfiliSec(vt, projeId, ortamId) {
  const id = ortamVarsayilanGirisProfiliId(vt, projeId, ortamId);
  return id ? girisProfiliGetir(vt, id, { coz: true }) : undefined;
}

/**
 * "Koşunun saklanan oturumunu kullan" (Ayarlar > Koşu > Tarama ve akış kaydı): koşunun bu ortam + giriş profili için saklanan
 * şifreli oturumu (ortamın kökenlerine sınırlanmış) ve güncelleme hedefi (dosya + türetilmiş anahtar; yalnız sunucu belleğinde).
 * Kasa anahtarı / veritabanı yolu yoksa oturum okunmaz ve yazılmaz (baştan giriş). Ortak kurallar: giris/oturum-dosyasi.mjs.
 * @param {Veritabani} vt @param {string} ortamId @param {string} profilId @param {string} tabanUrl @param {{ girisAdresi?: string }} tarif
 */
function saklananOturumHazirla(vt, ortamId, profilId, tabanUrl, tarif) {
  let anahtar = null;
  try { anahtar = oturumAnahtariTuret(acikAnahtar(vt)); } catch { anahtar = null; }
  const dosya = vt.yol ? oturumDosyaYolu(vt.yol, ortamId, profilId) : null;
  const durum = dosya && anahtar ? oturumDosyasiniOku(dosya, anahtar) : undefined;
  const girdi = { durum: durum ? oturumuKokenlereSinirla(durum, girisKokenleri(tabanUrl, tarif)) : null };
  if (dosya && anahtar) return { girdi, yazim: { dosya, anahtar } };
  anahtar?.fill(0);
  return { girdi, yazim: null };
}

/**
 * Ortamdaki bağlam profilleri: tür → ad → alanlar (ortama özgü profil tüm-ortam profilini ezer).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @returns {Record<string, Record<string, Record<string, unknown>>>}
 */
function ortamBaglamProfilleri(vt, projeId, ortamId) {
  /** @type {Record<string, Record<string, Record<string, unknown>>>} */
  const sonuc = {};
  for (const p of baglamProfilleriniListele(vt, projeId).filter((x) => x.ortamId === null || x.ortamId === ortamId)
    .sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
    (sonuc[p.tur] ??= {})[p.ad] = p.alanlar ?? {};
  }
  return sonuc;
}

/** Ekranın modelindeki alt model başvuruları → (dosya → model) anlık görüntüsü (sonuç doğrulaması için). @param {Veritabani} vt @param {string} projeId @param {Nesne} model */
function altModelAnlikGoruntusu(vt, projeId, model) {
  /** @type {Record<string, unknown>} */
  const sonuc = {};
  const dosyalar = new Set();
  const gez = (/** @type {unknown} */ d) => {
    if (Array.isArray(d)) { d.forEach(gez); return; }
    if (!nesneMi(d)) return;
    const n = /** @type {Nesne} */ (d);
    if (nesneMi(n.altModel) && typeof n.altModel.dosya === 'string') dosyalar.add(n.altModel.dosya);
    for (const v of Object.values(n)) gez(v);
  };
  gez(model.adimlar);
  for (const dosya of dosyalar) {
    const anahtar = String(dosya).replace(/\.model\.json$/, '');
    const e = ekranlariListele(vt, projeId).find((x) => x.anahtar === anahtar);
    const m = e ? ekranModeliGetir(vt, e.id) : undefined;
    if (m && nesneMi(m.model)) sonuc[String(dosya)] = m.model;
  }
  return sonuc;
}

/**
 * Tarama / akış kaydı tarayıcısının kullanıcı kararları (kasa okunamazsa varsayılanlar — önceki sabitler).
 * @param {Veritabani | undefined} vt
 */
function taramaTarayiciGirdisi(vt) {
  let a;
  try { a = vt ? kosuAyarlariniOku(vt) : varsayilanKosuAyarlari(); } catch { a = varsayilanKosuAyarlari(); }
  return {
    genislik: a.taramaEkranGenisligi, yukseklik: a.taramaEkranYuksekligi, dil: a.taramaDili,
    saatDilimi: a.saatDilimi === 'bilgisayar' ? null : a.saatDilimi, sayfaAcilmaMs: a.taramaSayfaAcilmaSn * 1000, kesifSecenekSiniri: a.kesifSecenekSiniri,
    // Giriş beklemeleri: koşudaki Gelişmiş > Giriş ayarlarından AYRI (Ayarlar > Koşu > Tarama ve akış kaydı).
    oturumKontrolMs: a.taramaOturumKontrolSn * 1000, girisAlanBeklemeMs: a.taramaGirisAlanBeklemeSn * 1000
  };
}

/** Tarama ve akış kaydında giriş kipi (Ayarlar > Koşu; kasa okunamazsa / bilinmeyen değerde varsayılan "bastan"). @param {Veritabani | undefined} vt */
function taramaGirisKipi(vt) {
  let k;
  try { k = vt ? kosuAyarlariniOku(vt).taramaGirisKipi : undefined; } catch { k = undefined; }
  return /** @type {readonly string[]} */ (TARAMA_GIRIS_KIPLERI).includes(String(k)) ? String(k) : 'bastan';
}

/**
 * @param {{ projeKoku: string; playwrightCli?: string; zamanAsimiMs?: number; saklamaMs?: number;
 *   ortamDegiskenleri?: NodeJS.ProcessEnv; hataAyiklama?: boolean }} secenekler
 */
export function taramaYoneticisiOlustur(secenekler) {
  const ortam = secenekler.ortamDegiskenleri ?? process.env;
  const cli = secenekler.playwrightCli ?? join(secenekler.projeKoku, 'node_modules', '@playwright', 'test', 'cli.js');
  const yapilandirma = join(secenekler.projeKoku, 'scripts', 'platform', 'tarama', 'tarama.config.ts');
  // Süre: açık seçenek / ortam değişkeni (testler) > kullanıcının kararı (Ayarlar > Koşu > Tarama ve akış kaydı) > varsayılan.
  const kullaniciAyari = (/** @type {Veritabani | undefined} */ vt, /** @type {'taramaZamanAsimiDk' | 'kayitZamanAsimiDk'} */ ad) => {
    if (!vt) return null;
    try { return kosuAyarlariniOku(vt)[ad] * 60_000; } catch { return null; }
  };
  const zamanAsimiMs = (/** @type {Veritabani | undefined} */ vt) => secenekler.zamanAsimiMs
    ?? (Number(ortam[TARAMA_ZAMAN_ASIMI_DEGISKENI]) > 0 ? Number(ortam[TARAMA_ZAMAN_ASIMI_DEGISKENI]) * 1000 : kullaniciAyari(vt, 'taramaZamanAsimiDk') ?? VARSAYILAN_ZAMAN_ASIMI_SN * 1000);
  const kayitZamanAsimiMs = (/** @type {Veritabani | undefined} */ vt) => (Number(ortam[KAYIT_ZAMAN_ASIMI_DEGISKENI]) > 0 ? Number(ortam[KAYIT_ZAMAN_ASIMI_DEGISKENI]) * 1000
    : kullaniciAyari(vt, 'kayitZamanAsimiDk') ?? VARSAYILAN_KAYIT_ZAMAN_ASIMI_SN * 1000);
  const saklamaMs = secenekler.saklamaMs ?? IS_SAKLAMA_MS;
  const hataAyiklama = secenekler.hataAyiklama ?? ortam.NOBETCI_TARAMA_HATA_AYIKLA === '1';
  /** @type {Map<string, Nesne>} */
  const isler = new Map();

  const temizle = () => {
    const sinir = Date.now() - saklamaMs;
    const tasarimSiniri = Date.now() - saklamaMs * TASARIM_SAKLAMA_KATI;
    for (const [id, is] of isler) {
      if (!is.bitis) continue;
      const son = Date.parse(is.sonErisim ?? is.bitis);
      if (son < (is.akis || is.girisTaslagi ? tasarimSiniri : sinir)) isler.delete(id);
    }
  };
  const calisan = () => [...isler.values()].find((is) => is.durum === 'suruyor') ?? null;

  /** @param {Nesne} is */
  function sureciKapat(is) {
    const s = is.surec;
    if (!s || s.exitCode !== null || s.signalCode !== null) return;
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(s.pid), '/T', '/F'], () => {});
      return;
    }
    const sinyal = (/** @type {NodeJS.Signals} */ ad) => {
      try { process.kill(-s.pid, ad); } catch { try { s.kill(ad); } catch { /* kapanmış */ } }
    };
    sinyal('SIGTERM');
    const z = setTimeout(() => { if (s.exitCode === null && s.signalCode === null) sinyal('SIGKILL'); }, SURE_SONRA_ZORLA_MS);
    z.unref();
  }

  /** @param {Nesne} is @param {string} durum @param {{ kod: string; mesaj: string } | null} [hata] */
  function bitir(is, durum, hata = null) {
    if (is.durum !== 'suruyor') return;
    is.durum = durum;
    is.hata = hata;
    is.bitis = simdi();
    is.girdi = null;
    // Oturum dosyası anahtarı bellekten silinir (iş bittikten sonra gelen oturum yazılmaz).
    if (is.oturumYazimi) { is.oturumYazimi.anahtar.fill(0); is.oturumYazimi = null; }
    clearTimeout(is.zamanlayici);
    for (const [ad, a] of Object.entries(is.adimlar)) if (a.durum === 'suruyor') is.adimlar[ad] = { ...a, durum: durum === 'tamam' ? 'tamam' : durum === 'iptal' ? 'atlandi' : 'hata' };
    for (const p of is.profiller) if (p.durum === 'suruyor') p.durum = durum === 'iptal' ? 'bekliyor' : 'hata';
    kodIsteginiTemizle(is.kodYolu);
  }

  /** İşin arayüze giden görünümü (gizli değer yok). @param {Nesne} is */
  function gorunum(is) {
    return {
      id: is.id, kip: is.kip, durum: is.durum, mod: is.mod, olusturulacak: is.olusturulacak ?? 'ekran', baglamProfili: is.baglamProfili ?? null, projeId: is.projeId, ekran: is.ekran, ortam: is.ortam, hedefYol: is.hedefYol, kesif: is.kesif,
      adimlar: Object.entries(is.adimlar).map(([anahtar, a]) => ({ anahtar, etiket: /** @type {Record<string, string>} */ (ADIM_ETIKETLERI)[anahtar] ?? anahtar, durum: a.durum, mesaj: a.mesaj ?? null })),
      profiller: is.profiller.map((/** @type {Nesne} */ p) => ({ ad: p.ad, durum: p.durum, adim: p.adim ?? null, alanSayisi: p.alanSayisi ?? null, mesaj: p.mesaj ?? null })),
      engellenenSayisi: is.engellenenSayisi, engellenenler: is.engellenenler.slice(-50), olaylar: is.olaylar.slice(-30),
      hata: is.hata, kodIstegi: is.durum === 'suruyor' ? kodIstegiOku(is.kodYolu) : null,
      baslangic: is.baslangic, bitis: is.bitis ?? null, paketHazir: Boolean(is.paket), ozet: is.ozet ?? null, uyarilar: is.uyarilar ?? [],
      // Giriş: kip (bastan / saklananOturum), gerçekleşen yöntem (saklananOturum / bastanGiris), oturum dosyası güncellendi mi.
      giris: is.giris ? { ...is.giris } : null,
      // Akış kaydı: diyagramı kurulacak (topla → tasarla).
      tasarim: Boolean(is.akis),
      // Giriş kaydı: taslak işaretlenip tarif önizlenecek.
      girisTaslagi: Boolean(is.girisTaslagi),
      // Ortak akışın kaydı: başlangıç ekranı (kayıt bu ekranın adresinde başladı).
      ortakAkis: is.ortakAkis ?? null,
      // Giriş denemesi: sonuç (başarılı / hata, sayfanın yolu, ekran görüntüsü, adım günlüğü).
      deneme: is.deneme ?? null
    };
  }

  /** @param {string} id */
  function isGetir(id) {
    temizle();
    const is = typeof id === 'string' && IS_KIMLIGI.test(id) ? isler.get(id) : undefined;
    if (!is) throw new TaramaHatasi('BULUNAMADI', 'Tarama bulunamadı (süresi dolmuş ya da sunucu yeniden başlamış olabilir).', 404);
    return is;
  }

  /**
   * Başlatma diyaloğunun verisi. @param {Veritabani} vt @param {string} projeId @param {string | null} ekranId
   */
  function taramaSecenekleri(vt, projeId, ekranId) {
    temizle();
    const ortamlar = ortamlariListele(vt, projeId).map((o) => {
      const t = etkinGirisTarifi(vt, projeId, o.id);
      // Taramanın kullanacağı profil (koşunun varsayılanıyla aynı kural).
      const varsayilanId = ortamVarsayilanGirisProfiliId(vt, projeId, o.id);
      const g = varsayilanId ? girisProfilleriniListele(vt, projeId).find((x) => x.id === varsayilanId) : undefined;
      return {
        id: o.id, ad: o.ad, tabanUrl: o.tabanUrl, varsayilan: o.varsayilan, riskli: riskliSecimi(o), canli: riskliOrtamMi(o),
        tarif: t.tarif ? { kaynak: t.kaynak, baglamTuru: t.tarif.baglamDegistirme?.baglamTuru ?? null, ikinciAdim: t.tarif.ikinciAdim.tur, smsElle: t.tarif.ikinciAdim.tur === 'sms' } : null,
        tarifHatalari: t.hatalar, girisProfili: g ? { ad: g.ad, ikiAsamaliTur: g.ikiAsamaliTur } : null
      };
    });
    const profiller = baglamProfilleriniListele(vt, projeId, undefined, { yalnizAd: true }).map((p) => ({ tur: p.tur, ad: p.ad, ortamId: p.ortamId }));
    /** @type {Nesne | null} */
    let ekran = null;
    /** @type {Nesne} */
    let son = {};
    if (ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
      const t = nesneMi(ayarlar.tarama) ? ayarlar.tarama : {};
      const analiz = nesneMi(ayarlar.analiz) ? ayarlar.analiz : {};
      ekran = {
        id: e.id, ad: e.ad, anahtar: e.anahtar, modelVar: Boolean(m), urlYolu: m && nesneMi(m.model) && typeof m.model.ekranUrl === 'string' ? m.model.ekranUrl : null,
        // Ortak akış: kayıt bir BAŞLANGIÇ EKRANININ adresinde başlar (adaylar; ortak akışı kullananlar önde).
        ortakAkis: m && nesneMi(m.model) && m.model.tur === 'ortakAkis' ? { baslangicEkranlari: ortakAkisBaslangicEkranlari(vt, projeId, e.id) } : null
      };
      son = {
        // Ortak akışın son seçilen başlangıç ekranı (yalnız ortak akışta).
        ...(ekran.ortakAkis ? { baslangicEkranId: typeof t.baslangicEkranId === 'string' ? t.baslangicEkranId : null } : {}),
        ortamId: typeof t.ortamId === 'string' ? t.ortamId : null, hedef: typeof t.hedef === 'string' ? t.hedef : null,
        kesif: typeof t.kesif === 'boolean' ? t.kesif : true,
        baglamProfilleri: Array.isArray(analiz.sonBaglamProfilleri) ? analiz.sonBaglamProfilleri.filter((x) => typeof x === 'string') : []
      };
    }
    const c = calisan();
    return { ortamlar, baglamProfilleri: profiller, ekran, son, calisanIs: c ? { id: c.id, ekran: c.ekran } : null };
  }

  /**
   * Taramayı başlatır. @param {Veritabani} vt @param {Nesne} g gövde
   * @param {{ sunucuAdresi: string }} s
   */
  function baslat(vt, g, s) {
    temizle();
    const c = calisan();
    if (c) throw new TaramaHatasi('MESGUL', `Başka bir ${c.kip === 'kayit' ? 'akış kaydı' : c.kip === 'girisKaydi' ? 'giriş kaydı' : c.kip === 'girisDenemesi' ? 'giriş denemesi' : 'tarama'} sürüyor (${c.ekran.ad}); bitmesini bekleyin ya da iptal edin.`, 409, { isId: c.id });
    // "Girişi kaydet": akış kaydıyla aynı altyapı; ekran yok, giriş YAPILMADAN giriş sayfası açılır, kullanıcı girişi kendisi yapar.
    const girisKaydi = g.kip === 'girisKaydi';
    // "Girişi dene": yalnız ortamın giriş tarifiyle giriş (kayıtlı oturum kullanılmaz); ekran yok, tarif şart.
    const girisDenemesi = g.kip === 'girisDenemesi';
    const kayit = g.kip === 'kayit' || girisKaydi;
    if (g.onay !== true) {
      throw new TaramaHatasi('ONAY_GEREKLI', girisDenemesi ? 'Giriş denemesi siteye gerçek giriş isteği gönderir: başlatmadan önce uyarıyı onaylayın.' : kayit
        ? `${girisKaydi ? 'Giriş' : 'Akış'} kaydında bastığınız düğmeler siteye gerçek istek gönderir: başlatmadan önce uyarıyı onaylayın.`
        : 'Tarama seçilen ortama bağlanır: başlatmadan önce uyarıyı onaylayın.');
    }
    const projeId = kimlikAl(g.projeId, 'projeId');
    const proje = projeGetir(vt, projeId);
    if (!proje) throw new DepoHatasi('Proje bulunamadı.');
    const ortamId = kimlikAl(g.ortamId, 'ortamId');
    const ortamKaydi = ortamlariListele(vt, projeId).find((o) => o.id === ortamId);
    if (!ortamKaydi) throw new DepoHatasi('Ortam bulunamadı.');
    // CANLI ortam: tarama, akış / giriş kaydı ve giriş denemesi yapılabilir; istek yalnız kullanıcı onaylayınca (canliOnay: true)
    // gider — HTTP ucunda tarayıcı açılmadan denetlenir (guvenlik/uc-denetimi.mjs).

    // Ekran: mevcut (tekrar analiz ya da modelsiz ekrana ilk model) ya da yeni (ad + anahtar). Giriş kaydında ekran yoktur.
    const ekranlar = ekranlariListele(vt, projeId);
    /** @type {{ id: string | null; ad: string; anahtar: string }} */
    let ekran;
    /** @type {Nesne | null} */
    let mevcutModel = null;
    /** Ortak akışın kaydı: başlangıç ekranı (kayıt bu ekranın adresinde başlar). @type {{ id: string; ad: string; urlYolu: string } | null} */
    let ortakBaslangic = null;
    if (girisKaydi || girisDenemesi) {
      ekran = { id: null, ad: `Giriş (${ortamKaydi.ad})`, anahtar: '' };
    } else if (g.ekranId !== undefined && g.ekranId !== null && g.ekranId !== '') {
      const e = ekranlar.find((x) => x.id === kimlikAl(g.ekranId, 'ekranId'));
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      ekran = { id: e.id, ad: e.ad, anahtar: e.anahtar };
      const m = ekranModeliGetir(vt, e.id);
      if (m && nesneMi(m.model)) {
        if (m.model.tur === 'altModel') throw new TaramaHatasi('ALT_MODEL', 'Alt modeller taranamaz; alt modeli kullanan ekranı tarayın.');
        if (m.model.tur === 'ortakAkis') {
          // Ortak akış taranmaz; KAYDEDİLEBİLİR: kayıt seçilen başlangıç ekranının adresinde başlar (ortak akışın kendi adresi yok).
          if (g.kip !== 'kayit') throw new TaramaHatasi('ALT_MODEL', 'Ortak akışlar taranamaz; ortak akışı kullanan ekranı tarayın ya da ortak akışın sayfasında "Akışı kaydet"i kullanın.');
          const d = akisDuzenlenebilirMi(/** @type {Nesne} */ (m.model));
          if (!d.duzenlenebilir) throw new TaramaHatasi('AKIS_DUZENLENEMEZ', `Ortak akışın kaydı akışına yazılamaz: ${d.neden} Ekran paketi yükleyin.`);
          const b = ortakAkisBaslangicEkranlari(vt, projeId, e.id).find((x) => x.id === g.baslangicEkranId);
          if (!b) throw new TaramaHatasi('BASLANGIC_EKRANI', 'Ortak akışın kaydı için başlangıç ekranını seçin (adresi olan bir ekran; kayıt o ekranın adresinde başlar).');
          ortakBaslangic = { id: b.id, ad: b.ad, urlYolu: b.urlYolu };
        }
        mevcutModel = /** @type {Nesne} */ (m.model);
      }
    } else {
      const ad = typeof g.ekranAdi === 'string' ? g.ekranAdi.trim() : '';
      if (!ad || ad.length > 120) throw new TaramaHatasi('EKRAN_ADI', 'Yeni ekranın adını yazın (en fazla 120 karakter).');
      const anahtar = typeof g.ekranAnahtari === 'string' && g.ekranAnahtari.trim() ? g.ekranAnahtari.trim() : ekranAnahtariOner(ad);
      if (!EKRAN_ANAHTARI_DESENI.test(anahtar)) throw new TaramaHatasi('EKRAN_ANAHTARI', 'Ekran anahtarı küçük harf, rakam ve "-" içermeli (ör. odeme-formu).');
      const ayni = ekranlar.find((x) => x.anahtar === anahtar);
      if (ayni && ekranModeliGetir(vt, ayni.id)) {
        throw new TaramaHatasi('EKRAN_VAR', `"${ayni.ad}" ekranı bu anahtarla (${anahtar}) zaten var; ekranın sayfasındaki "Ekranı tara" ile tekrar analiz yapın.`);
      }
      ekran = ayni ? { id: ayni.id, ad: ayni.ad, anahtar } : { id: null, ad, anahtar };
    }
    // "Ne oluşturulsun?" (Ekranlar > Ekran ekle): ortak akış yalnız YENİ oluştururken seçilir; sonuç paketi ortak akış paketine
    // çevrilir (paket ucu; ekran adresi yazılmaz) ve "Ortak akışlar" altına kaydedilir. Varsayılan ekran (bugünkü davranış).
    const olusturulacak = g.olusturulacak === 'ortakAkis' ? 'ortakAkis' : 'ekran';
    if (olusturulacak === 'ortakAkis' && (girisKaydi || girisDenemesi || mevcutModel || (g.ekranId !== undefined && g.ekranId !== null && g.ekranId !== ''))) {
      throw new TaramaHatasi('OLUSTURMA', 'Ortak akış yalnız yeni oluştururken seçilir (Ekranlar > Ekran ekle).');
    }

    // Hedef (ortamın kökeninde bir yol). Giriş kaydında: verilen yol, yoksa kayıtlı tarifin giriş adresi, yoksa "/".
    const mevcutGirisAdresi = girisKaydi || girisDenemesi ? (etkinGirisTarifi(vt, projeId, ortamId).tarif?.girisAdresi ?? '/') : null;
    let hedef;
    try {
      hedef = hedefCoz(ortamKaydi.tabanUrl, typeof g.hedef === 'string' && g.hedef.trim() ? g.hedef : girisKaydi || girisDenemesi ? mevcutGirisAdresi : ortakBaslangic ? ortakBaslangic.urlYolu : mevcutModel?.ekranUrl);
    } catch (e) {
      if (e instanceof HedefHatasi) throw new TaramaHatasi('HEDEF', e.message);
      throw e;
    }

    // Giriş tarifi, giriş profili, bağlam profilleri ("Giriş yapmadan aç": hiçbiri kullanılmaz; giriş kaydında da).
    const girissiz = g.girissiz === true || girisKaydi;
    const tarifSonucu = girissiz ? { tarif: null, hatalar: [] } : etkinGirisTarifi(vt, projeId, ortamId);
    if (tarifSonucu.hatalar.length) throw new TaramaHatasi('TARIF_GECERSIZ', `Bu ortamın giriş tarifi geçersiz: ${tarifSonucu.hatalar.join(' ')} (Ayarlar > Giriş profilleri > Giriş tarifi).`);
    const tarif = tarifSonucu.tarif;
    if (girisDenemesi && !tarif) throw new TaramaHatasi('TARIF_YOK', `"${ortamKaydi.ad}" ortamında giriş tarifi yok; önce girişi kaydedin ya da tarif tanımlayın.`);
    /** @type {import('./protokol.d.mts').TaramaKimligi | null} */
    let kimlik = null;
    /** @type {string | null} */
    let girisProfiliId = null;
    if (tarif) {
      const gp = girisProfiliSec(vt, projeId, ortamId);
      if (!gp || !gp.kullaniciAdi || !gp.parola) {
        throw new TaramaHatasi('GIRIS_PROFILI', `"${ortamKaydi.ad}" ortamı için kullanıcı adı ve parolası tanımlı bir giriş profili yok (Ayarlar > Giriş profilleri).`);
      }
      girisProfiliId = gp.id;
      const sms = nesneMi(gp.smsAyari) ? gp.smsAyari : {};
      kimlik = {
        kullaniciAdi: gp.kullaniciAdi, parola: gp.parola,
        totpGizli: gp.ikiAsamaliTur === 'totp' ? gp.totpGizli : null,
        sabitKod: gp.ikiAsamaliTur === 'sms' && sms.yontem === 'sabit' && typeof sms.kod === 'string' ? sms.kod : null,
        smsKipi: gp.ikiAsamaliTur === 'sms' ? (sms.yontem === 'elle' ? 'elle' : 'sabit') : null,
        ekAlanlar: Object.fromEntries(gp.ekAlanlar.filter((e) => e.deger !== null).map((e) => [e.ad, /** @type {string} */ (e.deger)])),
        gizliEkAlanlar: gp.ekAlanlar.filter((e) => e.gizli).map((e) => e.ad)
      };
    }
    const istenen = Array.isArray(g.baglamProfilleri) ? [...new Set(g.baglamProfilleri.filter((x) => typeof x === 'string' && x.trim()))] : [];
    if (girissiz && istenen.length) throw new TaramaHatasi('PROFIL', 'Giriş yapmadan açılan sayfada bağlam profili uygulanamaz; profil seçmeyin.');
    if (istenen.length > 12) throw new TaramaHatasi('PROFIL', 'En fazla 12 bağlam profili seçilebilir.');
    if (girisDenemesi && istenen.length) throw new TaramaHatasi('PROFIL', 'Giriş denemesi bağlam profili olmadan yapılır.');
    if (kayit && istenen.length > 1) throw new TaramaHatasi('PROFIL', 'Akış kaydı en fazla bir bağlam profiliyle yapılır.');
    /** @type {Array<{ ad: string | null; degerler: Record<string, unknown> | null }>} */
    let profiller = [{ ad: null, degerler: null }];
    if (istenen.length) {
      const tur = tarif?.baglamDegistirme?.baglamTuru;
      if (!tarif || !tur) {
        throw new TaramaHatasi('PROFIL', `"${ortamKaydi.ad}" ortamının giriş tarifinde bağlam değiştirme adımı yok; bağlam profilleri uygulanamaz. Profil seçmeden tarayın ya da tarifi tamamlayın (Ayarlar > Giriş profilleri > Giriş tarifi).`);
      }
      const havuz = ortamBaglamProfilleri(vt, projeId, ortamId)[tur] ?? {};
      const gerekli = baglamAlanlari(tarif);
      profiller = istenen.map((ad) => {
        const degerler = havuz[ad];
        if (!degerler) throw new TaramaHatasi('PROFIL', `"${ad}" adlı ${tur} bağlam profili bu ortamda yok (Ayarlar > Test verisi > Kişi ve kayıt verileri).`);
        const eksik = gerekli.filter((a) => degerler[a] === undefined || degerler[a] === null || degerler[a] === '');
        if (eksik.length) throw new TaramaHatasi('PROFIL', `"${ad}" bağlam profilinde tarifin kullandığı alan(lar) boş: ${eksik.join(', ')}.`);
        return { ad, degerler };
      });
    }

    // Yasaklı adres: tarayıcı AÇILMADAN reddedilir.
    const desenler = etkinYasakDesenleri(vt, ortam);
    const yasak = yasakliAdresBul(taramaAdresleri(ortamKaydi.tabanUrl, hedef.adres, tarif, profiller.map((p) => p.degerler)), desenler);
    if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));
    if (!existsSync(cli)) throw new TaramaHatasi('KURULUM', `"${cli}" bulunamadı (npm install çalıştırılmamış olabilir).`, 500);

    // Seçimi hatırla (ekran varsa): bağlam profilleri tekrar analiz diyaloğuyla ortak, ortam/yol/keşif taramaya özel.
    const kesif = kayit || girisDenemesi ? false : g.kesif !== false;
    if (ekran.id) {
      const e = /** @type {NonNullable<ReturnType<typeof ekranlariListele>[number]>} */ (ekranlar.find((x) => x.id === ekran.id));
      const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
      const analiz = nesneMi(ayarlar.analiz) ? ayarlar.analiz : {};
      ekranKaydet(vt, {
        id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama,
        ayarlar: {
          ...ayarlar, analiz: { ...analiz, sonBaglamProfilleri: istenen },
          tarama: {
            ...(nesneMi(ayarlar.tarama) ? ayarlar.tarama : {}), ortamId, hedef: typeof g.hedef === 'string' ? g.hedef.trim() : hedef.yol, ...(kayit ? {} : { kesif }),
            ...(ortakBaslangic ? { baslangicEkranId: ortakBaslangic.id } : {})
          }
        }
      });
    }

    const id = randomBytes(12).toString('hex');
    const token = randomBytes(32).toString('hex');
    const kodYolu = join(tmpdir(), `nobetci-tarama-kod-${randomBytes(8).toString('hex')}`);
    const ciktiKlasoru = join(tmpdir(), `nobetci-tarama-${id}`);
    const izinliKokenler = String(ortam[TARAMA_IZINLI_KOKENLER_DEGISKENI] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const sure = kayit ? kayitZamanAsimiMs(vt) : zamanAsimiMs(vt);
    // Giriş kipi (Ayarlar > Koşu > Tarama ve akış kaydı): "Koşunun saklanan oturumunu kullan" YALNIZ giriş yapılan işte (tarif var,
    // "Giriş yapmadan aç" değil) uygulanır; girişsiz iş saklanan oturumu hiç okumaz ve güncellemez.
    const girisKipi = tarif && !girisDenemesi ? taramaGirisKipi(vt) : null;
    const saklanan = tarif && girisProfiliId && girisKipi === 'saklananOturum'
      ? saklananOturumHazirla(vt, ortamId, girisProfiliId, ortamKaydi.tabanUrl, tarif) : null;
    /** @type {Nesne} */
    const is = {
      id, token, kip: girisDenemesi ? 'girisDenemesi' : girisKaydi ? 'girisKaydi' : kayit ? 'kayit' : 'tarama', projeId, ekran, mod: mevcutModel ? 'analiz' : 'yeni', olusturulacak, ortam: { id: ortamKaydi.id, ad: ortamKaydi.ad }, hedefYol: hedef.yol, kesif,
      durum: 'suruyor', hata: null, baslangic: simdi(), bitis: null,
      adimlar: girisDenemesi
        ? { hazirlik: { durum: 'bekliyor' }, giris: { durum: 'bekliyor' } }
        : girisKaydi
        ? { hazirlik: { durum: 'bekliyor' }, kayit: { durum: 'bekliyor' } }
        : kayit
        ? { hazirlik: { durum: 'bekliyor' }, giris: { durum: tarif ? 'bekliyor' : 'atlandi' }, kayit: { durum: 'bekliyor' }, paket: { durum: 'bekliyor' } }
        : { hazirlik: { durum: 'bekliyor' }, giris: { durum: tarif ? 'bekliyor' : 'atlandi' }, profiller: { durum: 'bekliyor' }, paket: { durum: 'bekliyor' } },
      profiller: kayit || girisDenemesi ? [] : profiller.map((p) => ({ ad: p.ad ?? 'Varsayılan bağlam', durum: 'bekliyor' })),
      baglamProfili: kayit ? profiller[0].ad : null,
      // Ortak akışın kaydı: başlangıç ekranı; sonuç ortak akışın (tek) akışına yazılır (akisaYaz), ekran paketi üretilmez.
      ortakAkis: ortakBaslangic ? { baslangicEkrani: ortakBaslangic } : null,
      engellenenler: [], engellenenSayisi: 0, olaylar: [],
      girdi: {
        kip: girisDenemesi ? 'girisDenemesi' : kayit ? 'kayit' : 'tarama', ...(girisKaydi ? { girisKaydi: true } : {}), tabanUrl: ortamKaydi.tabanUrl, hedefAdres: hedef.adres, hedefYol: hedef.yol, tarif, kimlik, profiller, kesif,
        yasakKaliplari: etkinYasakAdresler(vt, ortam), izinliKokenler: izinliKokenler.length ? izinliKokenler : null, zamanAsimiMs: sure,
        // Tarayıcı kararları (Ayarlar > Koşu > Tarama ve akış kaydı; saat dilimi Gelişmiş > Tarayıcı).
        tarayici: taramaTarayiciGirdisi(vt),
        ...(saklanan ? { oturum: saklanan.girdi } : {})
      },
      // Giriş bilgisi (iş durumunda / raporda): kip, gerçekleşen yöntem, oturum dosyası güncellendi mi.
      giris: tarif ? { kip: girisKipi, yontem: null, oturumSaklandi: saklanan ? Boolean(saklanan.girdi.durum) : null, oturumGuncellendi: false } : null,
      // Oturum dosyasına yazım hedefi (dosya + türetilmiş anahtar; YALNIZ sunucu belleğinde, iş bitince silinir).
      oturumYazimi: saklanan?.yazim ?? null,
      meta: {
        ekranAnahtari: ekran.anahtar, ekranAdi: ekran.ad, urlYolu: hedef.yol, proje: proje.ad, girisGerekli: Boolean(tarif), girissiz,
        ikiAsamali: tarif ? tarif.ikinciAdim.tur : 'yok', baglamTuru: tarif?.baglamDegistirme?.baglamTuru ?? null, mevcutModel
      },
      altModeller: mevcutModel ? altModelAnlikGoruntusu(vt, projeId, mevcutModel) : {},
      // Diyagramdaki SQL bloklarının beklenen satır sayısı sınırı (Ayarlar > Koşu > Gelişmiş; akisKaydet kasaya erişmeden doğrular).
      sqlSatirSiniri: sqlSatirSiniriOku(vt),
      paket: null, ozet: null, uyarilar: [], kodYolu, ciktiKlasoru, surec: null, zamanlayici: null, cikti: ''
    };
    isler.set(id, is);

    /** @type {NodeJS.ProcessEnv} */
    const env = {};
    for (const [k, v] of Object.entries(ortam)) {
      if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI|NOBETCI_TARAMA_|TEST_ENV$|FORCE_COLOR)/.test(k)) continue;
      env[k] = v;
    }
    // Giriş motorunun varsayılanları (tests/support/giris-motoru.ts) tarama sürecinde TARAMA ayarlarını kullanır; sunucunun
    // ortamından gelen koşu değerleri geçmez.
    const girisBeklemeleri = /** @type {{ oturumKontrolMs: number; girisAlanBeklemeMs: number }} */ (is.girdi.tarayici);
    Object.assign(env, {
      NOBETCI_OTURUM_KONTROL_MS: String(girisBeklemeleri.oturumKontrolMs),
      NOBETCI_GIRIS_ALAN_BEKLEME_MS: String(girisBeklemeleri.girisAlanBeklemeMs),
      [TARAMA_ADRES_DEGISKENI]: `${s.sunucuAdresi}/platform/tarama/is/${id}`,
      [TARAMA_TOKEN_DEGISKENI]: token,
      [KOD_YOLU_DEGISKENI]: kodYolu,
      [TARAMA_CIKTI_DEGISKENI]: ciktiKlasoru,
      [TARAMA_TEST_SURESI_DEGISKENI]: String(sure + 60_000),
      ...(izinliKokenler.length ? { [TARAMA_DNS_KAPALI_DEGISKENI]: '1' } : {}),
      // Akış kaydı görünür tarayıcıda (testlerde NOBETCI_KAYIT_BASSIZ=1 ile başsız).
      // Giriş denemesi yalnız kullanıcı "Tarayıcıyı göster"i seçtiyse görünür.
      ...((kayit || (girisDenemesi && g.gorunur === true)) && ortam[KAYIT_BASSIZ_DEGISKENI] !== '1' ? { [TARAMA_GORUNUR_DEGISKENI]: '1' } : {})
    });
    const surec = spawn(process.execPath, [cli, 'test', '--config', yapilandirma], {
      cwd: secenekler.projeKoku, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: false
    });
    is.surec = surec;
    const ciktiEkle = (/** @type {Buffer} */ p) => {
      is.cikti = (is.cikti + p.toString('utf8')).slice(-8000);
      if (hataAyiklama) process.stderr.write(p);
    };
    surec.stdout?.on('data', ciktiEkle);
    surec.stderr?.on('data', ciktiEkle);
    surec.on('error', (h) => bitir(is, 'hata', { kod: 'SUREC', mesaj: `Tarama süreci başlatılamadı: ${h.message}` }));
    surec.on('close', (kod) => {
      is.surec = null;
      kodIsteginiTemizle(kodYolu);
      try { rmSync(ciktiKlasoru, { recursive: true, force: true }); } catch { /* yok */ }
      bitir(is, 'hata', { kod: 'SUREC', mesaj: `Tarama süreci sonuç bildirmeden kapandı (çıkış kodu ${kod ?? '—'}).` });
      is.cikti = '';
    });
    is.zamanlayici = setTimeout(() => {
      bitir(is, 'hata', {
        kod: 'ZAMAN_ASIMI',
        mesaj: kayit ? `${girisKaydi ? 'Giriş' : 'Akış'} kaydı ${Math.round(sure / 60000)} dk süre sınırını aştı ve durduruldu; kaydı yeniden başlatın.` : girisDenemesi ? `Giriş denemesi ${Math.round(sure / 1000)} sn süre sınırını aştı ve durduruldu.` : `Tarama ${Math.round(sure / 1000)} sn süre sınırını aştı ve durduruldu (sayfa çok yavaş olabilir).`
      });
      sureciKapat(is);
    }, sure);
    is.zamanlayici.unref?.();
    return { isId: id };
  }

  /** @param {string} id */
  function iptal(id) {
    const is = isGetir(id);
    const ad = is.kip === 'kayit' ? 'Akış kaydı' : is.kip === 'girisKaydi' ? 'Giriş kaydı' : is.kip === 'girisDenemesi' ? 'Giriş denemesi' : 'Tarama';
    if (is.durum !== 'suruyor') throw new TaramaHatasi('BITTI', `${ad} zaten bitti.`, 409);
    bitir(is, 'iptal', { kod: 'IPTAL', mesaj: `${ad} kullanıcı tarafından iptal edildi.` });
    sureciKapat(is);
    return { iptal: true };
  }

  /** @param {string} id @param {unknown} kod */
  function kodGonder(id, kod) {
    const is = isGetir(id);
    if (is.durum !== 'suruyor') throw new TaramaHatasi('BITTI', 'Tarama artık çalışmıyor.', 409);
    if (typeof kod !== 'string' || !KOD_DESENI.test(kod.trim())) throw new TaramaHatasi('KOD', 'Kod yalnızca harf ve rakamdan oluşmalı (3–12 karakter).');
    if (!koduYanitla(is.kodYolu, kod.trim())) throw new TaramaHatasi('KOD_ISTEGI_YOK', 'Tarama şu anda doğrulama kodu beklemiyor (süre dolmuş olabilir).', 409);
    return { iletildi: true };
  }

  /** Alt süreç: tek kullanımlık girdi. @param {string} id @param {string} token */
  function girdiVer(id, token) {
    const is = isGetir(id);
    if (!tokenEsit(token, is.token)) throw new TaramaHatasi('TOKEN', 'Geçersiz tarama tokeni.', 401);
    if (is.durum !== 'suruyor' || !is.girdi) throw new TaramaHatasi('GIRDI_YOK', 'Tarama girdisi zaten alındı ya da iş bitti.', 410);
    const girdi = is.girdi;
    is.girdi = null;
    return girdi;
  }

  /** @param {string} id @param {string} token */
  function tokenliIs(id, token) {
    const is = isGetir(id);
    if (!tokenEsit(token, is.token)) throw new TaramaHatasi('TOKEN', 'Geçersiz tarama tokeni.', 401);
    return is;
  }

  /** Alt süreç: ilerleme olayı. @param {string} id @param {string} token @param {Nesne} o */
  function olayAl(id, token, o) {
    const is = tokenliIs(id, token);
    if (is.durum !== 'suruyor') return { yoksayildi: true };
    const metin = (/** @type {unknown} */ d, n = 300) => (typeof d === 'string' ? d.slice(0, n) : null);
    const DURUMLAR = ['bekliyor', 'suruyor', 'tamam', 'hata', 'atlandi'];
    if (o.tur === 'adim' && typeof o.adim === 'string' && o.adim in is.adimlar && DURUMLAR.includes(o.durum)) {
      // Giriş adımı: saklanan oturum dosyası güncellendiyse (sunucu yazdı) mesaja eklenir.
      const ek = o.adim === 'giris' && o.durum === 'tamam' && is.giris?.oturumGuncellendi ? ' Oturum saklandı (koşu da kullanır).' : '';
      is.adimlar[o.adim] = { durum: o.durum, mesaj: metin(o.mesaj) === null && !ek ? null : `${metin(o.mesaj) ?? ''}${ek}`.trim() };
    } else if (o.tur === 'profil' && Number.isInteger(o.sira) && is.profiller[o.sira] && DURUMLAR.includes(o.durum)) {
      const p = is.profiller[o.sira];
      p.durum = o.durum;
      if (o.adim !== undefined) p.adim = ['baglam', 'tarama', 'kesif'].includes(o.adim) ? o.adim : null;
      if (Number.isInteger(o.alanSayisi)) p.alanSayisi = o.alanSayisi;
      if (o.mesaj !== undefined) p.mesaj = metin(o.mesaj);
    } else if (o.tur === 'engellendi') {
      is.engellenenSayisi++;
      if (is.engellenenler.length < 500) is.engellenenler.push({ yontem: metin(o.yontem, 10), adres: metin(o.adres), asama: metin(o.asama, 20), neden: metin(o.neden, 20), zaman: simdi() });
    } else if (o.tur === 'bilgi' && typeof o.mesaj === 'string') {
      is.olaylar.push({ zaman: simdi(), mesaj: o.mesaj.slice(0, 300) });
      if (is.olaylar.length > 100) is.olaylar.splice(0, is.olaylar.length - 100);
    } else if (o.tur === 'giris' && is.giris && ['saklananOturum', 'bastanGiris'].includes(o.yontem)) {
      // Saklanan oturum ancak bu kipte ve oturum verildiyse kullanılabilir (alt süreç başka bir şey bildiremez).
      is.giris.yontem = o.yontem === 'saklananOturum' && !(is.giris.kip === 'saklananOturum' && is.giris.oturumSaklandi) ? 'bastanGiris' : o.yontem;
      console.log(`[platform] ${is.kip === 'kayit' ? 'Akış kaydı' : 'Tarama'} (${is.id}): ${is.giris.yontem === 'saklananOturum' ? 'saklanan oturum kullanıldı' : 'baştan giriş yapıldı'}.`);
    }
    return { alindi: true };
  }

  /**
   * Alt süreç: başarılı girişin oturumu ("Koşunun saklanan oturumunu kullan"). Koşunun şifreli oturum dosyasına ATOMİK yazılır
   * (son yazan kazanır, dosya bozulmaz). Kip kapalıysa, "Giriş yapmadan aç" ise ya da kasa anahtarı yoksa yazılmaz.
   * @param {string} id @param {string} token @param {unknown} durum
   */
  function oturumAl(id, token, durum) {
    const is = tokenliIs(id, token);
    if (is.durum !== 'suruyor' || !is.oturumYazimi) return { kaydedildi: false };
    if (!oturumDurumuMu(durum)) throw new TaramaHatasi('OTURUM', 'Oturum biçimi geçersiz.');
    const kaydedildi = oturumDosyasinaYaz(is.oturumYazimi.dosya, is.oturumYazimi.anahtar, durum);
    if (kaydedildi && is.giris) is.giris.oturumGuncellendi = true;
    return { kaydedildi };
  }

  /** Alt süreç: sonuç (envanter → ekran paketi). @param {string} id @param {string} token @param {Nesne} s */
  function sonucAl(id, token, s) {
    const is = tokenliIs(id, token);
    if (is.durum !== 'suruyor') return { yoksayildi: true };
    if (s.basarili !== true) {
      const h = nesneMi(s.hata) ? s.hata : {};
      // Kullanıcı kaydı panelden iptal etti ya da pencereyi kapattı.
      bitir(is, h.kod === 'IPTAL' ? 'iptal' : 'hata', { kod: typeof h.kod === 'string' ? h.kod.slice(0, 40) : 'BEKLENMEYEN', mesaj: typeof h.mesaj === 'string' ? h.mesaj.slice(0, 1000) : 'Tarama başarısız oldu.' });
      return { alindi: true };
    }
    if (is.kip === 'girisKaydi') return girisKaydiSonucunuIsle(is, s.envanter);
    if (is.kip === 'girisDenemesi') return girisDenemesiSonucunuIsle(is, s.envanter);
    is.adimlar.paket = { durum: 'suruyor' };
    if (is.kip === 'kayit') return kayitSonucunuIsle(is, s.envanter);
    try {
      const envanter = s.envanter;
      if (!nesneMi(envanter) || !Array.isArray(envanter.profiller) || !Array.isArray(envanter.engellenenler)) throw new Error('envanter biçimi geçersiz');
      if (!Array.isArray(envanter.hataliProfiller)) envanter.hataliProfiller = [];
      const alanVar = envanter.profiller.some((/** @type {Nesne} */ p) => Array.isArray(p.alanlar) && p.alanlar.length
        || (Array.isArray(p.kesifler) && p.kesifler.some((/** @type {Nesne} */ k) => k.degerler.some((/** @type {Nesne} */ d) => d.gorunenler.length))));
      if (!alanVar) {
        bitir(is, 'hata', { kod: 'ALAN_YOK', mesaj: `Hedef sayfada (${is.hedefYol}) görünür form alanı bulunamadı. Yolu kontrol edin; alanlar bir düğmeyle açılıyorsa tarama onları göremez (düğmelere tıklanmaz).` });
        return { alindi: true };
      }
      const { paket, ozet } = taramaPaketiOlustur(is.meta, /** @type {any} */ (envanter));
      const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => is.altModeller[dosya] });
      if (!d.gecerli) {
        bitir(is, 'hata', { kod: 'PAKET', mesaj: `Tarama sonucu geçerli bir ekran paketine çevrilemedi: ${d.hatalar.slice(0, 5).map((h) => `${h.yer}: ${h.mesaj}`).join(' · ')}` });
        return { alindi: true };
      }
      is.paket = paket;
      is.ozet = ozet;
      is.uyarilar = d.uyarilar;
      is.adimlar.paket = { durum: 'tamam' };
      bitir(is, 'tamam');
    } catch (e) {
      bitir(is, 'hata', { kod: 'PAKET', mesaj: `Tarama sonucu işlenemedi: ${e instanceof Error ? e.message : String(e)}` });
    }
    return { alindi: true };
  }

  /** Akış kaydı sonucu: topla biçimi → taslak diyagram (paket diyagram kaydedilince); eski adım biçimi → ekran paketi. @param {Nesne} is @param {unknown} envanter */
  function kayitSonucunuIsle(is, envanter) {
    if (akisEnvanteriMi(envanter)) {
      if (!envanter.alanlar.some((a) => a.secili) && !envanter.dugmeler.length) {
        bitir(is, 'hata', { kod: 'ALAN_YOK', mesaj: 'Kayıtta listeye alınmış alan ya da basılmış düğme yok; akışı yürütüp yeniden kaydedin.' });
        return { alindi: true };
      }
      is.akis = { envanter, bloklar: akisTaslagi(envanter) };
      is.adimlar.paket = { durum: 'bekliyor', mesaj: 'Akış diyagramını kurup kaydedin.' };
      bitir(is, 'tamam');
      return { alindi: true };
    }
    if (is.ortakAkis) {
      bitir(is, 'hata', { kod: 'PAKET', mesaj: 'Ortak akışın kaydı okunamadı; kaydı yeniden başlatın.' });
      return { alindi: true };
    }
    try {
      if (!nesneMi(envanter) || envanter.kip !== 'kayit' || !Array.isArray(envanter.adimlar) || !Array.isArray(envanter.engellenenler) || !Array.isArray(envanter.notlar)) {
        throw new Error('kayıt envanteri biçimi geçersiz');
      }
      if (!envanter.adimlar.length) {
        bitir(is, 'hata', { kod: 'ALAN_YOK', mesaj: 'Kayıtta hiç adım yok; akışı yeniden kaydedin.' });
        return { alindi: true };
      }
      const { paket, ozet } = kayitPaketiOlustur(is.meta, /** @type {any} */ (envanter));
      const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => is.altModeller[dosya] });
      if (!d.gecerli) {
        bitir(is, 'hata', { kod: 'PAKET', mesaj: `Kayıt geçerli bir ekran paketine çevrilemedi: ${d.hatalar.slice(0, 5).map((h) => `${h.yer}: ${h.mesaj}`).join(' · ')}` });
        return { alindi: true };
      }
      is.paket = paket;
      is.ozet = ozet;
      is.uyarilar = d.uyarilar;
      is.adimlar.paket = { durum: 'tamam' };
      bitir(is, 'tamam');
    } catch (e) {
      bitir(is, 'hata', { kod: 'PAKET', mesaj: `Kayıt sonucu işlenemedi: ${e instanceof Error ? e.message : String(e)}` });
    }
    return { alindi: true };
  }

  /**
   * Giriş kaydı sonucu: akış envanterinden (değer yok) taslak adımlar; envanterin kendisi saklanmaz. @param {Nesne} is @param {unknown} envanter
   */
  function girisKaydiSonucunuIsle(is, envanter) {
    if (!akisEnvanteriMi(envanter)) {
      bitir(is, 'hata', { kod: 'PAKET', mesaj: 'Giriş kaydının sonucu okunamadı; kaydı yeniden başlatın.' });
      return { alindi: true };
    }
    const taslak = girisKaydiTaslagi(envanter);
    if (!taslak.adimlar.length) {
      bitir(is, 'hata', { kod: 'ALAN_YOK', mesaj: 'Kayıtta dokunulan alan ya da basılan düğme yok; girişi yapıp “Bitir”e basın.' });
      return { alindi: true };
    }
    is.girisTaslagi = taslak;
    bitir(is, 'tamam');
    return { alindi: true };
  }

  /**
   * "Girişi dene" sonucu: başarılı mı, değilse açık hata; ekran görüntüsü yalnız bellekte (iş silinince gider). İş her durumda
   * "tamam" biter (girişin başarısızlığı işin değil, denemenin sonucudur). @param {Nesne} is @param {unknown} e
   */
  function girisDenemesiSonucunuIsle(is, e) {
    if (!nesneMi(e) || e.kip !== 'girisDenemesi' || typeof e.basarili !== 'boolean') {
      bitir(is, 'hata', { kod: 'BEKLENMEYEN', mesaj: 'Giriş denemesinin sonucu okunamadı.' });
      return { alindi: true };
    }
    const metin = (/** @type {unknown} */ d, /** @type {number} */ n) => (typeof d === 'string' ? d.slice(0, n) : '');
    const h = nesneMi(e.hata) ? { kod: metin(e.hata.kod, 40) || 'BEKLENMEYEN', mesaj: metin(e.hata.mesaj, 1000) } : null;
    is.deneme = {
      basarili: e.basarili === true && !h, yol: metin(e.yol, 300), hata: h,
      goruntu: typeof e.goruntu === 'string' && e.goruntu.length < 8_000_000 ? e.goruntu : null,
      gunluk: Array.isArray(e.gunluk) ? e.gunluk.filter((x) => typeof x === 'string').slice(0, 50).map((x) => x.slice(0, 300)) : []
    };
    console.log(`[platform] Giriş denemesi (${is.id}, ${is.ortam.ad}): ${is.deneme.basarili ? 'başarılı' : `başarısız (${h?.kod ?? '—'})`}.`);
    bitir(is, 'tamam');
    return { alindi: true };
  }

  /** Giriş kaydının taslağı (işaretlemek için). @param {string} id */
  function girisTaslagiGetir(id) {
    const is = isGetir(id);
    if (!is.girisTaslagi) throw new TaramaHatasi('TASLAK_YOK', 'Bu işte giriş kaydı taslağı yok (kayıt bitmedi ya da başarısız oldu).', 409);
    is.sonErisim = simdi();
    return {
      taslak: is.girisTaslagi, ortam: is.ortam, projeId: is.projeId, hedefYol: is.hedefYol,
      oneriler: is.girisTaslagi.adimlar.map((/** @type {Nesne} */ a) => (a.tur === 'alan' ? ekAlanAdiOner(a.etiket) : null))
    };
  }

  /**
   * Kullanıcının işaretlerinden tarif ÖNİZLEMESİ (kaydetmez): mevcut tarifin göstergeleri/bağlam adımları korunur.
   * @param {Veritabani} vt @param {string} id @param {unknown} isaretler @param {unknown} [secimler] kod kaynağı / başarı metni
   */
  function girisTarifiOnizle(vt, id, isaretler, secimler) {
    const is = isGetir(id);
    if (!is.girisTaslagi) throw new TaramaHatasi('TASLAK_YOK', 'Bu işte giriş kaydı taslağı yok.', 409);
    is.sonErisim = simdi();
    const mevcut = etkinGirisTarifi(vt, is.projeId, is.ortam.id).tarif;
    const sonuc = kayittanTarif(is.girisTaslagi, isaretler, mevcut, is.hedefYol, secimler);
    const d = girisTarifiniDogrula(sonuc.tarif);
    return { ...sonuc, dogrulamaHatalari: d.hatalar, ortam: is.ortam };
  }

  /** Tasarım bekleyen akış kaydı. @param {string} id */
  function akisIsi(id) {
    const is = isGetir(id);
    if (!is.akis) throw new TaramaHatasi('AKIS_YOK', 'Bu işte kurulacak bir akış diyagramı yok.', 409);
    is.sonErisim = simdi();
    return is;
  }

  /** Diyagram + sağ liste. @param {string} id */
  function akisGetir(id) {
    const is = akisIsi(id);
    return {
      bloklar: is.akis.bloklar, palet: akisPaleti(is.akis.envanter, is.akis.bloklar), ekran: is.ekran, mod: is.mod, olusturulacak: is.olusturulacak ?? 'ekran', paketHazir: Boolean(is.paket),
      projeId: is.projeId, akisaYazildi: is.akisaYazildi ?? null,
      // Kayıt "Giriş yapmadan aç" ile yapıldıysa diyagramın başı "Girişsiz" olur.
      girissiz: is.meta.girissiz === true,
      // Ortak akışın kaydı: diyagram ortak akışın tek akışına yazılır (başlangıç ekranına ait bloklar silinir).
      ortakAkis: is.ortakAkis ?? null
    };
  }

  /**
   * Mevcut ekranda kaydı bir AKIŞA yazar (yeni akış ya da seçilen akışı güncelle): kaydın gerçek okumalarıyla (koşul
   * çıkarımı) ekran akış servisine verilir. onay yoksa etki (+ yakalanan seçenek listelerinin test verisi önizlemesi) döner;
   * onaylı çağrıda g.testVerisi seçimi (paket önizlemesindekiyle aynı biçim) yazılır. @param {Veritabani} vt @param {string} id @param {Nesne} g
   */
  function akisaYaz(vt, id, g) {
    const is = akisIsi(id);
    if (is.mod !== 'analiz' || !is.ekran.id) throw new TaramaHatasi('AKIS_YOK', 'Yeni ekranın kaydı akışa yazılamaz; önce ekran oluşturulur (Kaydet ve önizle).', 409);
    const h = nesneMi(g.hedef) ? g.hedef : {};
    const { bloklar, hatalar } = bloklariAyikla(g.bloklar);
    if (hatalar.length) throw new TaramaHatasi('AKIS_GECERSIZ', `Diyagramda düzeltilmesi gereken ${hatalar.length} sorun var.`, 400, { hatalar });
    is.akis.bloklar = bloklar;
    // Ortak akışın tek akışı vardır: kayıt her zaman o akışı günceller (adı korunur; hedefte verilen kimlik/ad yok sayılır).
    const tek = is.ortakAkis ? akislariListele(vt, is.projeId, is.ekran.id).akislar[0] : null;
    const sonuc = ekranAkisiKaydet(vt, is.projeId, is.ekran.id, {
      akisId: tek ? tek.id : typeof h.akisId === 'string' && h.akisId ? h.akisId : null, ad: tek ? tek.ad : h.ad, bloklar, onay: g.onay === true, kayitEnvanteri: is.akis.envanter,
      // Yakalanan seçenek listeleri: yalnız kullanıcının önizlemede seçtikleri yazılır (seçim yoksa test verisine yazılmaz).
      testVerisi: g.testVerisi
    });
    if ('surum' in sonuc) is.akisaYazildi = { akisId: sonuc.akisId, surum: sonuc.surum };
    return sonuc;
  }

  /**
   * Diyagramı saklar (taslak) ya da doğrulayıp ekran paketine çevirir. Paket yeniden üretilebilir (diyagrama dönüp
   * düzenleme). @param {string} id @param {Nesne} g
   */
  function akisKaydet(id, g) {
    const is = akisIsi(id);
    const { bloklar, hatalar: bicim } = bloklariAyikla(g.bloklar);
    if (g.taslak === true) {
      if (!bicim.length) is.akis.bloklar = bloklar;
      return { kaydedildi: !bicim.length, palet: akisPaleti(is.akis.envanter, is.akis.bloklar) };
    }
    // Ortak akış ekran paketiyle (ekran adresli model) önizlenmez: kayıt ortak akışın tek akışına yazılır.
    if (is.ortakAkis) throw new TaramaHatasi('ORTAK_AKIS', 'Ortak akışın kaydı ekran paketine çevrilmez; “Ortak akışı güncelle” ile ortak akışın akışına yazılır.', 409);
    const { envanter, hatalar } = bicim.length ? { envanter: null, hatalar: bicim } : akistanKayitEnvanteri(is.akis.envanter, bloklar, { satirSiniri: is.sqlSatirSiniri });
    if (!envanter) throw new TaramaHatasi('AKIS_GECERSIZ', `Diyagramda düzeltilmesi gereken ${hatalar.length} sorun var.`, 400, { hatalar });
    is.akis.bloklar = bloklar;
    const { paket, ozet } = kayitPaketiOlustur(is.meta, envanter);
    const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => is.altModeller[dosya] });
    if (!d.gecerli) {
      throw new TaramaHatasi('AKIS_GECERSIZ', 'Diyagram geçerli bir ekran paketine çevrilemedi.', 400, {
        hatalar: d.hatalar.slice(0, 5).map((h) => ({ blok: null, mesaj: `${h.yer}: ${h.mesaj}` }))
      });
    }
    is.paket = paket;
    is.ozet = ozet;
    is.uyarilar = d.uyarilar;
    is.adimlar.paket = { durum: 'tamam' };
    return { ozet };
  }

  return {
    isler,
    secenekler: taramaSecenekleri,
    akis: akisGetir,
    akisKaydet,
    akisaYaz,
    girisTaslagi: girisTaslagiGetir,
    girisTarifiOnizle,
    baslat,
    durum: (/** @type {string} */ id) => gorunum(isGetir(id)),
    paket: (/** @type {string} */ id) => {
      const is = isGetir(id);
      if (!is.paket) throw new TaramaHatasi('PAKET_YOK', 'Bu taramanın paketi yok (tarama bitmedi ya da başarısız oldu).', 409);
      // "Ne oluşturulsun? ○ Ortak akış": paket ortak akış paketine çevrilmiş verilir (önizleme / kabul "Ortak akışlar" altına yazar).
      const ortak = is.olusturulacak === 'ortakAkis';
      return { paket: ortak ? ortakAkisPaketineCevir(is.paket) : is.paket, mod: is.mod, olusturulacak: ortak ? 'ortakAkis' : 'ekran', ekran: is.ekran, ozet: is.ozet };
    },
    aktif: () => { temizle(); const c = calisan(); return c ? { id: c.id, ekran: c.ekran, projeId: c.projeId } : null; },
    iptal,
    kodGonder,
    girdiVer,
    olayAl,
    oturumAl,
    sonucAl,
    /** Tüm çalışan süreçleri kapatır (sunucu kapanırken / testler). */
    kapat() {
      for (const is of isler.values()) {
        if (is.durum === 'suruyor') bitir(is, 'iptal', { kod: 'IPTAL', mesaj: 'Sunucu kapanıyor.' });
        sureciKapat(is);
      }
    }
  };
}

/** @type {ReturnType<typeof taramaYoneticisiOlustur> | null} */
let varsayilanYonetici = null;

/**
 * /platform/tarama/* isteklerini işler (sunucu-platform.mjs'den çağrılır). Eşleşmezse false.
 * Depo/kasa hataları (DepoHatasi, KasaHatasi) çağırana fırlatılır (ortak hata eşlemesi).
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {import('./yonetici.d.mts').TaramaIstekBaglami} b
 */
export async function taramaIsteginiIsle(req, res, b) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/tarama/')) return false;
  varsayilanYonetici ??= taramaYoneticisiOlustur({ projeKoku: b.projeKoku });
  const y = b.yonetici ?? varsayilanYonetici;
  const gonder = (/** @type {number} */ durum, /** @type {Nesne} */ govde) => {
    res.setHeader('Cache-Control', 'no-store');
    b.jsonGonder(res, durum, govde);
  };
  const tokenYok = () => gonder(401, { basarili: false, mesaj: 'Geçersiz token.' });
  try {
    // Alt süreç uçları (işe özel token).
    const isEslesme = /^\/platform\/tarama\/is\/([a-f0-9]{24})\/(girdi|olay|sonuc|oturum)$/.exec(yol);
    if (isEslesme) {
      const baslik = req.headers[TARAMA_TOKEN_BASLIGI];
      const token = typeof baslik === 'string' ? baslik : '';
      if (isEslesme[2] === 'girdi' && req.method === 'GET') { gonder(200, y.girdiVer(isEslesme[1], token)); return true; }
      if (req.method !== 'POST') { gonder(405, { basarili: false, mesaj: 'Yöntem desteklenmiyor.' }); return true; }
      y.durum(isEslesme[1]); // iş var mı (gövdeyi okumadan önce)
      const govde = await b.jsonGovde(isEslesme[2] === 'sonuc' ? SONUC_GOVDE_SINIRI : isEslesme[2] === 'oturum' ? OTURUM_GOVDE_SINIRI : OLAY_GOVDE_SINIRI);
      if (!govde) return true;
      const islem = { olay: y.olayAl, oturum: y.oturumAl, sonuc: y.sonucAl }[/** @type {'olay' | 'oturum' | 'sonuc'} */ (isEslesme[2])];
      gonder(200, { basarili: true, ...islem(isEslesme[1], token, govde) });
      return true;
    }

    if (req.method === 'GET') {
      if (!b.disTokenGecerli) { tokenYok(); return true; }
      const q = url.searchParams;
      if (yol === '/platform/tarama/secenekler') {
        const db = await b.acikVeritabani();
        const ekranId = q.get('ekranId');
        gonder(200, { basarili: true, ...y.secenekler(db, kimlikAl(q.get('projeId'), 'projeId'), ekranId ? kimlikAl(ekranId, 'ekranId') : null) });
        return true;
      }
      if (yol === '/platform/tarama/durum') { gonder(200, { basarili: true, is: y.durum(String(q.get('id') ?? '')) }); return true; }
      if (yol === '/platform/tarama/paket') { gonder(200, { basarili: true, ...y.paket(String(q.get('id') ?? '')) }); return true; }
      if (yol === '/platform/tarama/aktif') { gonder(200, { basarili: true, is: y.aktif() }); return true; }
      if (yol === '/platform/tarama/giris') { gonder(200, { basarili: true, ...y.girisTaslagi(String(q.get('id') ?? '')) }); return true; }
      if (yol === '/platform/tarama/akis') {
        const v = y.akis(String(q.get('id') ?? ''));
        // Mevcut ekran: kayıt yeni akış olarak eklenebilir ya da bir akışı güncelleyebilir (akış listesi).
        // Ortak akışın kaydı: tek akış (hedef seçimi yok; kayıt o akışı günceller).
        const ek = v.mod === 'analiz' && v.ekran.id && !v.ortakAkis ? akislariListele(await b.acikVeritabani(), v.projeId, v.ekran.id) : null;
        gonder(200, { basarili: true, ...v, ekranAkislari: ek });
        return true;
      }
      gonder(404, { basarili: false, mesaj: 'Bilinmeyen tarama uç noktası.' });
      return true;
    }
    if (req.method !== 'POST') { gonder(405, { basarili: false, mesaj: 'Yöntem desteklenmiyor.' }); return true; }
    const govde = await b.jsonGovde();
    if (!govde) return true;
    if (govde.token !== b.token && !b.disTokenGecerli) { tokenYok(); return true; }
    if (yol === '/platform/tarama/baslat') {
      const db = await b.acikVeritabani();
      // İzinler (web erişimi; giriş tarifi varsa giriş bilgisi; CANLI ortamda canlı ortam izni + açık onay): tarayıcı AÇILMADAN
      // denetlenir (tek merkez: guvenlik/uc-denetimi.mjs). Kapalıysa IzinHatasi → sunucu 403 IZIN_KAPALI döner.
      ucDenetle(db, yol, govde);
      const port = req.socket.localPort;
      const sonuc = y.baslat(db, govde, { sunucuAdresi: `http://127.0.0.1:${port}` });
      console.log(`[platform] ${govde.kip === 'kayit' ? 'Akış kaydı' : govde.kip === 'girisKaydi' ? 'Giriş kaydı' : govde.kip === 'girisDenemesi' ? 'Giriş denemesi' : 'Ekran taraması'} başlatıldı (${sonuc.isId}).`);
      gonder(202, { basarili: true, ...sonuc });
      return true;
    }
    if (yol === '/platform/tarama/akis') {
      if (nesneMi(govde.hedef) && govde.hedef.tur === 'akis') { gonder(200, { basarili: true, ...y.akisaYaz(await b.acikVeritabani(), String(govde.id ?? ''), govde) }); return true; }
      gonder(200, { basarili: true, ...y.akisKaydet(String(govde.id ?? ''), govde) });
      return true;
    }
    if (yol === '/platform/tarama/giris') {
      gonder(200, { basarili: true, ...y.girisTarifiOnizle(await b.acikVeritabani(), String(govde.id ?? ''), govde.isaretler, govde.secimler) });
      return true;
    }
    if (yol === '/platform/tarama/iptal') { gonder(200, { basarili: true, ...y.iptal(String(govde.id ?? '')) }); return true; }
    if (yol === '/platform/tarama/kod') { gonder(200, { basarili: true, ...y.kodGonder(String(govde.id ?? ''), govde.kod) }); return true; }
    gonder(404, { basarili: false, mesaj: 'Bilinmeyen tarama uç noktası.' });
    return true;
  } catch (hata) {
    if (hata instanceof TaramaHatasi) {
      if (!res.headersSent) gonder(hata.durum, { basarili: false, kod: hata.kod, mesaj: hata.message, ...hata.ek });
      return true;
    }
    throw hata;
  }
}

/** Şu an süren bir ekran taraması var mı? (Çalışma alanı değiştirilirken denetlenir.) */
export function taramaSuruyorMu() {
  return Boolean(varsayilanYonetici?.aktif());
}

/** Sunucu kapanırken çalışan taramaları kapatır. */
export function taramalariKapat() {
  varsayilanYonetici?.kapat();
}
