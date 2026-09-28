#!/usr/bin/env node
// TEST SÜREÇLERİ İÇİN VERİ OKUYUCU — tests/support/genel-veri.ts bunu ayrı bir süreçte (execFileSync) çalıştırır; çünkü
// spec dosyaları veriyi modül yüklenirken EŞZAMANLI ister, sql.js ise yalnızca eşzamansız başlatılabilir. Veritabanı
// SALT OKUNUR açılır (veritabanına hiç yazılmaz); sonuç yalnızca stdout borusundan (bellekte) üst sürece döner.
//
// Kullanım: node veri-oku.mjs genel --proje <id> --ortam-id <id>
//   Ortamdaki model senaryoları (senaryo verisi hassas alanlar çözülmüş, ekran modeli + alt modeller, "mutlaka görünmeli"
//   alanları), bağlam profilleri (tür → ad → alanlar), kimlik profilleri, ortamın giriş bilgisi (ortama özel profil,
//   yoksa tüm ortamlar için olan), kayıtlı giriş tarifi ve Ayarlar > Güvenlik'teki yasak adresler. Kasa anahtarı gerekir
//   (PLATFORM_KASA_ANAHTARI [base64url] ya da PLATFORM_KASA_PAROLASI).
// Şifreli senaryo dosyaları (dosyalar/senaryo-dosyalari.mjs) koşunun geçici klasörüne (NOBETCI_DOSYA_KLASORU; yalnızca
// kullanıcı okuyabilir, koşu bitince silinir) çözülür — BU, okuyucunun diske yazdığı TEK şeydir.
// Çıktı her zaman tek satır JSON'dur; hata durumunda { hata, kod } (çıkış kodu 0). Gizli değerler yalnızca stdout'ta
// bulunur; loglara ASLA yazılmaz.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniAc, veritabaniYolu } from './veritabani/baglanti.mjs';
import { gocleriUygula } from './veritabani/gocler.mjs';
import { KasaHatasi, kasaDurumu, kasayiAnahtarlaAc, parolayiDogrula, zarflariCoz } from './kasa.mjs';
import {
  baglamProfilleriniListele, ekranlariListele, girisProfiliGetir, ortamGetir, ortamVarsayilanGirisProfiliId,
  testVerisiProfiliGetir, testVerisiProfilleriniListele, testVerisiTurleriniListele
} from './veritabani/depo.mjs';
import { modelBaglami, ortamdaKosuyaDahil, senaryoAkisi } from './senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu } from './senaryolar/model-kosusu.mjs';
import { senaryoGirisi, senaryoGirisiniAyikla } from './senaryolar/senaryo-girisi.mjs';
import { senaryoAdimGoruntusuAyikla } from './ayarlar/kayit-kurallari.mjs';
import { etkinGirisTarifi } from './giris/tarif-deposu.mjs';
import { medyaKlasoru } from './medya.mjs';
import { referansCoz, referanslariCoz } from './dosyalar/senaryo-dosyalari.mjs';
import { DOSYA_KLASORU_DEGISKENI, kosuKlasoruDogrula } from './dosyalar/gecici-dosyalar.mjs';
import { ayarlardakiYasakAdresler } from './guvenlik/yasak-adresler.mjs';
import { izinleriOku } from './guvenlik/izinler.mjs';
import { riskliOrtamMi } from './guvenlik/ortam-riski.mjs';
import { izinMesaji } from './guvenlik/izin-tanimlari.mjs';
import { kosuSqlVerisi, modeldekiSqlHedefleri } from './sql/sorgu-bagdastirici.mjs';
import { tablolariListele } from './tablolar/tablo-deposu.mjs';
import { etkinAlanBaglari } from './tablolar/ekran-baglari.mjs';
import { ekranBasvurulariniCoz, metinBasvurulariniCoz, modelAlanBilgisi, tabloBasvurusuVarMi } from './tablolar/ekran-basvurulari.mjs';
import { tanimMetinleri } from './dosyalar/dosya-icerigi.mjs';
import { satirSecimiOlustur } from './tablolar/tablo-secimi.mjs';
import {
  TEKRAR_PLANI_DEGISKENI, VARSAYILAN_VERI_KOSUSU_SINIRI, VERI_KIPI_DEGISKENI, basvuruGruplari, satirOzeti, tekrarPlaniniAyristir, veriKosulariniAc
} from './tablolar/veri-kosulari.mjs';
import { kayitliKosuOrtamDegiskenleri, kosuAyarlariniOku } from './ayarlar/kosu-ayarlari.mjs';
import { YUKLEME_KLASORU_DEGISKENI, yuklemeDosyasiYolu } from './senaryolar/model-kosusu.mjs';

const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Tablodan gelen dosya adı (${Tablo.Sütun} → dosya alanı): koşucunun kuralıyla (tests/support/model-kosucu.ts yuklenecekDosya)
 * izinli klasördeki bir dosyanın adı olmalı ve dosya var olmalı; şifreli senaryo dosyası referansı (nobetci-dosya://) aynen
 * geçer. Sorun varsa kullanıcıya dönük metin (koşu tarayıcı açılmadan durur), yoksa null. @param {string} ad
 */
function tablodanDosyaDenetle(ad) {
  if (referansCoz(ad)) return null;
  const klasor = resolve(process.env[YUKLEME_KLASORU_DEGISKENI] || join(PROJE_KOKU, 'veri', 'yuklenecek-dosyalar'));
  const r = yuklemeDosyasiYolu(ad, klasor, join);
  if ('hata' in r) return r.hata;
  return existsSync(r.yol) ? null : `"${ad}" dosyası izinli klasörde yok (${YUKLEME_KLASORU_DEGISKENI} ya da veri/yuklenecek-dosyalar/)`;
}

/** Modelin indirilen dosya adımlarındaki beklenti metinleri (tablo başvurularının çözümü için). @param {any} model @returns {string[]} */
function dosyaBeklentiMetinleri(model) {
  const adimlar = model && Array.isArray(model.adimlar) ? model.adimlar : [];
  return adimlar.flatMap((/** @type {any} */ a) => (a && a.dosyaKontrolu ? tanimMetinleri(a.dosyaKontrolu) : []));
}

/** @param {unknown} veri */
function yaz(veri) {
  process.stdout.write(`${JSON.stringify(veri)}\n`);
}

/** @param {string} ad */
function arguman(ad) {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @returns {Promise<Buffer | null>} */
async function kasaAnahtari(vt) {
  if (process.env.PLATFORM_KASA_ANAHTARI) return Buffer.from(process.env.PLATFORM_KASA_ANAHTARI, 'base64url');
  if (process.env.PLATFORM_KASA_PAROLASI) return parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI);
  return null;
}

async function calistir() {
  if (process.argv[2] !== 'genel') return { hata: 'Bilinmeyen kip.', kod: 'KIP' };
  return genelKip();
}

/**
 * Bu koşunun geçici dosya klasörü (NOBETCI_DOSYA_KLASORU): yalnızca bu veritabanına özgü geçici kökün DOĞRUDAN
 * altındaki, bu kullanıcıya ait 0700 bir klasör kabul edilir (başka bir yere düz metin yazılmaz). Yoksa null — dosya referansları
 * çözülmez (ör. "--list"; testler dosyayı yalnızca koşarken kullanır).
 * @param {string} vtYolu
 */
function dosyaKlasoru(vtYolu) {
  const klasor = process.env[DOSYA_KLASORU_DEGISKENI];
  if (!klasor || !existsSync(klasor)) return null;
  return kosuKlasoruDogrula(klasor, vtYolu) ? klasor : null;
}

/**
 * GENEL KİP: proje + ortam kimlikleriyle model senaryoları, giriş bilgisi ve kayıtlı giriş tarifi.
 * Proje/ortam bulunamazsa ya da kasa anahtarı yoksa { hata, kod }.
 */
async function genelKip() {
  const projeId = arguman('proje');
  const ortamId = arguman('ortam-id');
  const kimlikDeseni = /^[A-Za-z0-9_-]{1,100}$/;
  if (!projeId || !ortamId || !kimlikDeseni.test(projeId) || !kimlikDeseni.test(ortamId)) return { hata: '--proje ve --ortam-id gerekli.', kod: 'KIP' };
  const yol = veritabaniYolu(PROJE_KOKU);
  if (!existsSync(yol)) return { durum: 'veritabani-yok' };
  const vt = await veritabaniAc(yol, { saltOkunur: true });
  try {
    gocleriUygula(vt); // yalnızca bellekte
    if (!kasaDurumu(vt).olusturuldu) return { hata: 'Kasa henüz oluşturulmamış.', kod: 'KASA_YOK' };
    if (!vt.tek('SELECT id FROM projeler WHERE id = ?', [projeId])) return { hata: 'Proje bulunamadı.', kod: 'PROJE_YOK' };
    const anahtar = await kasaAnahtari(vt);
    if (!anahtar) {
      return process.env.PLATFORM_KASA_PAROLASI
        ? { hata: 'PLATFORM_KASA_PAROLASI yanlış.', kod: 'PAROLA_YANLIS' }
        : { hata: 'Kasa anahtarı yok (PLATFORM_KASA_ANAHTARI ya da PLATFORM_KASA_PAROLASI gerekir).', kod: 'ANAHTAR_YOK' };
    }
    kasayiAnahtarlaAc(vt, anahtar);
    anahtar.fill(0);
    const ortam = ortamGetir(vt, ortamId);
    if (!ortam || ortam.projeId !== projeId) return { hata: 'Ortam bu projede bulunamadı.', kod: 'ORTAM_YOK' };
    // İzinler (Ayarlar > İzinler): koşucu kasayı açmaz, durum bu çıktıyla gider. Kapalı izne ait gizli değerler HİÇ verilmez:
    // giriş bilgisi kapalıysa parola / TOTP / sabit kod / gizli ek alanlar, veritabanı okuma kapalıysa bağlantı ayarları (parola).
    const izinler = izinleriOku(vt);
    const model = ortamModelSenaryolari(vt, projeId, ortamId);
    if (model) {
      model.izinler = izinler;
      if (!izinler['veritabani-okuma'] && model.sqlBaglantilari) {
        model.sqlBaglantilari = Object.fromEntries(Object.keys(model.sqlBaglantilari).map((id) => [id, { hata: izinMesaji('veritabani-okuma') }]));
      }
    }
    const dosyaHedefi = dosyaKlasoru(yol);
    if (model && dosyaHedefi) {
      for (const s of model.senaryolar) s.veri = /** @type {Record<string, unknown>} */ ((await referanslariCoz(vt, s.veri, { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: dosyaHedefi })).deger);
    }
    const t = etkinGirisTarifi(vt, projeId, ortamId);
    const girisIzni = izinler['giris-bilgisi'] === true;
    const giris = ortamGirisBilgisi(vt, projeId, ortamId);
    const girisProfilleri = adliGirisProfilleri(vt, projeId, ortamId, kullanilanGirisProfilleri(model));
    return {
      durum: 'hazir', projeId, ortamId, yasakAdresler: ayarlardakiYasakAdresler(vt), model, izinler,
      // Kullanıcının kaydettiği koşu ayarları (ortam değişkeni adıyla): Nöbetçi dışından (terminal / CI) başlatılan koşularda
      // ortam değişkeni yoksa bunlar kullanılır (tests/support/kosu-ayarlari.ts).
      kosuAyarlari: kayitliKosuOrtamDegiskenleri(vt),
      giris: giris && !girisIzni ? gizlisiz(giris) : giris,
      // Senaryoların ("Giriş" seçimi) ve akışların ("Yeniden giriş" adımı) ADIYLA seçtiği giriş profilleri — yalnızca
      // kullanılanlar (şifreler yalnızca bu sürecin çıktısında; giriş bilgisi izni kapalıysa hiç verilmez).
      girisProfilleri: girisIzni ? girisProfilleri : Object.fromEntries(Object.entries(girisProfilleri).map(([ad, g]) => [ad, gizlisiz(g)])),
      girisTarifi: t.tarif ? { tarif: t.tarif, kaynak: t.kaynak, hatalar: t.hatalar } : null
    };
  } finally {
    vt.kapat();
  }
}

/**
 * Senaryoların giriş seçimindeki ve modellerin "yeniden giriş" adımlarındaki giriş profili adları.
 * @param {{ senaryolar: Array<{ giris?: { profil: string | null } | null; model: Record<string, unknown> | null }> } | null} model
 */
function kullanilanGirisProfilleri(model) {
  /** @type {Set<string>} */
  const adlar = new Set();
  for (const s of model?.senaryolar ?? []) {
    if (s.giris && typeof s.giris.profil === 'string') adlar.add(s.giris.profil);
    const adimlar = s.model && Array.isArray(s.model.adimlar) ? s.model.adimlar : [];
    for (const a of adimlar) {
      const p = a && typeof a === 'object' && a.yenidenGiris && typeof a.yenidenGiris === 'object' ? a.yenidenGiris.profil : null;
      if (typeof p === 'string' && p) adlar.add(p);
    }
  }
  return adlar;
}

/**
 * Ortamda ADIYLA seçilebilen giriş profilleri (ortama özgü profil aynı adlı tüm-ortam profilini ezer); yalnızca istenen adlar.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId @param {Set<string>} adlar
 */
function adliGirisProfilleri(vt, projeId, ortamId, adlar) {
  /** @type {Record<string, ReturnType<typeof girisBilgisi>>} */
  const sonuc = {};
  if (!adlar.size) return sonuc;
  const satirlar = vt.tumu('SELECT id, ortam_id FROM giris_profilleri WHERE proje_id = ? AND (ortam_id = ? OR ortam_id IS NULL) ORDER BY (ortam_id IS NOT NULL), rowid', [projeId, ortamId]);
  for (const s of satirlar) {
    const p = girisProfiliGetir(vt, String(s.id), { coz: true });
    if (p && adlar.has(p.ad)) sonuc[p.ad] = girisBilgisi(p);
  }
  return sonuc;
}

/**
 * Ortamın giriş bilgisi (kasa açık olmalı; şifreler yalnızca bu sürecin çıktısında): önce ortama özel giriş profili,
 * yoksa tüm ortamlar için olanı. Profil yoksa null.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId
 */
function ortamGirisBilgisi(vt, projeId, ortamId) {
  // Tarama / akış kaydıyla aynı varsayılan profil (saklanan oturum ortam + bu profille anahtarlanır).
  const id = ortamVarsayilanGirisProfiliId(vt, projeId, ortamId);
  const giris = id ? girisProfiliGetir(vt, id, { coz: true }) : undefined;
  return giris ? girisBilgisi(giris) : null;
}

/**
 * Giriş bilgisi izni kapalıyken: gizli değerler çıkarılır (kullanıcı adı ve açık ek alanlar kalır; profil kimliği oturum dosyası adı için).
 * @param {ReturnType<typeof girisBilgisi>} g
 */
function gizlisiz(g) {
  const gizli = new Set(g.gizliEkAlanlar);
  return { ...g, parola: null, totpGizli: null, sabitKod: null, ekAlanlar: Object.fromEntries(Object.entries(g.ekAlanlar).filter(([ad]) => !gizli.has(ad))) };
}

/** @param {import('./veritabani/depo.d.mts').GirisProfili} giris */
function girisBilgisi(giris) {
  const sms = /** @type {Record<string, unknown>} */ (giris.smsAyari ?? {});
  return {
    profilKimligi: giris.id,
    kullaniciAdi: giris.kullaniciAdi,
    parola: giris.parola,
    totpGizli: giris.ikiAsamaliTur === 'totp' ? giris.totpGizli : null,
    sabitKod: giris.ikiAsamaliTur === 'sms' && sms.yontem === 'sabit' && typeof sms.kod === 'string' ? sms.kod : null,
    smsKipi: giris.ikiAsamaliTur === 'sms' ? (sms.yontem === 'elle' ? 'elle' : 'sabit') : null,
    // Giriş adımlarının "{ad}" yer tutucuları (gizli olanların adları hata metinlerinde maskelensin diye ayrıca verilir).
    ekAlanlar: Object.fromEntries(giris.ekAlanlar.filter((e) => e.deger !== null).map((e) => [e.ad, e.deger])),
    gizliEkAlanlar: giris.ekAlanlar.filter((e) => e.gizli).map((e) => e.ad)
  };
}

/**
 * Ortamdaki model senaryoları (kasa açık olmalı). Ortam yoksa null.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId
 */
function ortamModelSenaryolari(vt, projeId, ortamId) {
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam) return null;
  const ekranlar = new Map(ekranlariListele(vt, projeId).map((e) => [e.id, e]));
  /** @type {Map<string, ReturnType<typeof modelBaglami>>} */
  const modeller = new Map();
  // Ekran senaryosundaki ${Tablo.Sütun} başvuruları (tablolar/ekran-basvurulari.mjs): tablolar (değerler çözülmüş; yalnızca koşu
  // belleğinde) yalnız başvuru varsa bir kez okunur. Gizli sütun değerleri koşucuya "tabloGizliDegerleri" ile gider (maskelenir);
  // çözülemeyen başvuru "veriHatalari" olur (koşucu tarayıcıyı açmadan açık hatayla durur).
  /** @type {import('./tablolar/tablo-deposu.mjs').Tablo[] | null} */
  let tablolar = null;
  /** @type {Map<string, ReturnType<typeof etkinAlanBaglari>>} */
  const baglarOnbellegi = new Map();
  // Birden çok satır uyduğunda seçim (Ayarlar > Koşu > Gelişmiş > Tablodan satır seçimi); senaryo başına ayrı seçim (grubun değerleri aynı satırdan).
  const kosuAyarlari = (() => { try { return kosuAyarlariniOku(vt); } catch { return null; } })();
  const satirSecimKipi = kosuAyarlari?.tabloSatirSecimi ?? 'ilk';
  // VERİ KOŞULARI (tablolar/veri-kosulari.mjs): senaryonun çoklu satır ayarı (icerik.veriKosulari), koşu anı ezmesi
  // (NOBETCI_VERI_KIPI: 'tek' | 'tumu') ve başarısızları tekrar çalıştırma planı (NOBETCI_TEKRAR_PLANI: senaryo → satırlar + model sürümü).
  const veriKipi = process.env[VERI_KIPI_DEGISKENI] === 'tek' || process.env[VERI_KIPI_DEGISKENI] === 'tumu' ? process.env[VERI_KIPI_DEGISKENI] : null;
  const tekrarPlani = tekrarPlaniniAyristir(process.env[TEKRAR_PLANI_DEGISKENI]);
  const veriKosusuSiniri = kosuAyarlari?.enCokVeriKosusu ?? VARSAYILAN_VERI_KOSUSU_SINIRI;
  /**
   * @param {Record<string, unknown>} veri @param {string} ekranId @param {ReturnType<typeof modelBaglami>} mb @param {unknown} tabloSecimleri
   * @param {{ sabit?: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }} [sabit] veri koşusunun satırları
   */
  const basvurulariCoz = (veri, ekranId, mb, tabloSecimleri, sabit = {}) => {
    // İndirilen dosya adımlarının beklentilerindeki ${Tablo.Sütun} başvuruları (metnin içinde) da aynı seçimlerle (veri koşusunda
    // aynı sabit satırlarla) çözülür.
    const dosyaMetinleri = mb ? dosyaBeklentiMetinleri(mb.model) : [];
    const dosyadaBasvuru = dosyaMetinleri.some((m) => /\$\{\s*(?!akis:)[^{}]*\.[^{}]*\}/.test(m));
    if (!tabloBasvurusuVarMi(veri) && !dosyadaBasvuru) return { veri, tabloGizliDegerleri: [], veriHatalari: [], dosyaBasvurulari: {}, satirlar: [] };
    tablolar ??= tablolariListele(vt, projeId, { cozulsun: true });
    if (!baglarOnbellegi.has(ekranId)) baglarOnbellegi.set(ekranId, etkinAlanBaglari(vt, ekranId));
    const satirSecimi = { ...satirSecimiOlustur(satirSecimKipi), ...sabit, kullanilan: new Map() };
    const s = {
      tablolar, baglar: baglarOnbellegi.get(ekranId), ...(mb ? modelAlanBilgisi(mb.model) : {}), ortamId, dosyaDenetle: tablodanDosyaDenetle,
      satirSecimi,
      ...(tabloSecimleri && typeof tabloSecimleri === 'object' ? { tabloSecimleri: /** @type {Record<string, Record<string, string>>} */ (tabloSecimleri) } : {})
    };
    const r = ekranBasvurulariniCoz(veri, s);
    const d = dosyadaBasvuru ? metinBasvurulariniCoz(dosyaMetinleri, veri, s) : { degerler: {}, gizliDegerler: [], hatalar: [] };
    // Raporda "hangi satırla koştu" (açık sütunlar; gizli sütunun yalnız adı) ve tekrar koşusunda aynı satır için.
    const t = /** @type {import('./tablolar/tablo-deposu.mjs').Tablo[]} */ (tablolar);
    const satirlar = [...satirSecimi.kullanilan.entries()].map(([g, satir]) => {
      const tablo = t.find((x) => x.id === g.split('|')[0]);
      return tablo ? satirOzeti(g, tablo, /** @type {any} */ (satir)) : null;
    }).filter((x) => x !== null);
    return {
      veri: r.veri, tabloGizliDegerleri: [...r.gizliDegerler, ...d.gizliDegerler], veriHatalari: [...r.hatalar, ...d.hatalar],
      dosyaBasvurulari: d.degerler, satirlar
    };
  };
  const senaryolar = [];
  for (const s of vt.tumu('SELECT id, ekran_id, baslik, icerik_json, kosuya_dahil FROM senaryolar WHERE proje_id = ? ORDER BY rowid', [projeId])) {
    const icerik = JSON.parse(String(s.icerik_json));
    if (!modelSenaryosuMu(icerik)) continue;
    const buOrtam = icerik.ortamlar && typeof icerik.ortamlar === 'object' ? icerik.ortamlar[ortamId] : undefined;
    if (!buOrtam || typeof buOrtam !== 'object' || s.ekran_id == null) continue;
    const ekranId = String(s.ekran_id);
    const plan = tekrarPlani[String(s.id)];
    // Çoklu akış: senaryonun akışının modeli (ekran + akış başına önbellek). Tekrar koşusu o koşudaki model sürümüyle.
    const akis = senaryoAkisi(icerik);
    const surum = plan?.modelSurumu ?? null;
    const modelAnahtari = `${ekranId}\u0000${akis ?? ''}\u0000${surum ?? ''}`;
    if (!modeller.has(modelAnahtari)) modeller.set(modelAnahtari, modelBaglami(vt, ekranId, akis, surum ? { surum } : {}));
    const mb = modeller.get(modelAnahtari);
    const ekran = ekranlar.get(ekranId);
    const kurallar = icerik.alanKurallari && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli.filter((x) => typeof x === 'string') : [];
    const hamVeri = 'veri' in buOrtam ? /** @type {Record<string, unknown>} */ (zarflariCoz(vt, buOrtam.veri)) : {};
    const ortak = {
      // Koşuda ORTAM BAŞINA (senaryo-servisi.mjs > ortamdaKosuyaDahil).
      id: String(s.id), baslik: String(s.baslik), kosuyaDahil: ortamdaKosuyaDahil(icerik, s.kosuya_dahil === 1, ortamId),
      // Devre dışı ekranın senaryosu koşuya girmez (model spec'i süzer; Nöbetçi'nin tam listesi yine görür).
      ekranEtkin: ekran ? ekran.durum === 'etkin' : false,
      ekran: ekran ? { id: ekran.id, anahtar: ekran.anahtar, ad: ekran.ad } : { id: ekranId, anahtar: '', ad: '' },
      model: mb ? mb.model : null, modelSurumu: mb ? mb.surum : null, altModeller: mb ? mb.altModeller : {},
      mutlakaGorunmeli: kurallar,
      // Senaryonun giriş seçimi (senaryo-girisi.mjs; null = ortamın girişiyle, bugünkü davranış).
      giris: senaryoGirisi(icerik),
      // Senaryonun adım ekran görüntüsü seçimi (null = Ayarlar > Koşu > Kayıt'a uyar; bugünkü davranış).
      adimGoruntusu: senaryoAdimGoruntusuAyikla(icerik.adimGoruntusu).secim
    };
    /** @param {ReturnType<typeof basvurulariCoz>} cozum @param {{ anahtar: string | null; ad: string | null }} vk @param {Array<{ alan: string; mesaj: string }>} [ekHatalar] */
    const ekle = (cozum, vk, ekHatalar = []) => {
      const hatalar = [...ekHatalar, ...cozum.veriHatalari];
      senaryolar.push({
        ...ortak, veri: cozum.veri,
        ...(cozum.tabloGizliDegerleri.length ? { tabloGizliDegerleri: cozum.tabloGizliDegerleri } : {}),
        ...(hatalar.length ? { veriHatalari: hatalar } : {}),
        ...(Object.keys(cozum.dosyaBasvurulari).length ? { dosyaBasvurulari: cozum.dosyaBasvurulari } : {}),
        veriKosusu: { anahtar: vk.anahtar, ad: vk.ad, satirlar: cozum.satirlar }
      });
    };
    if (plan && tabloBasvurusuVarMi(hamVeri) && plan.kosular.length) {
      // Tekrar: o koşudaki satırlarla (yalnız kalan veri koşuları; tek satırlı koşuda o koşunun satırı).
      for (const k of plan.kosular) {
        ekle(basvurulariCoz(hamVeri, ekranId, mb, icerik.tabloSecimleri, { sabit: k.satirlar, ...(k.veriler ? { veriler: k.veriler } : {}) }), { anahtar: k.anahtar, ad: k.ad });
      }
      continue;
    }
    const acilim = tabloBasvurusuVarMi(hamVeri)
      ? (() => {
        tablolar ??= tablolariListele(vt, projeId, { cozulsun: true });
        return veriKosulariniAc(icerik.veriKosulari, {
          tablolar, gruplar: basvuruGruplari(hamVeri, tablolar), ortamId, kip: veriKipi,
          tabloSecimleri: icerik.tabloSecimleri && typeof icerik.tabloSecimleri === 'object' ? icerik.tabloSecimleri : null
        });
      })()
      : { kosular: [], hatalar: [], cokluGruplar: [] };
    if (acilim.hatalar.length || acilim.kosular.length > veriKosusuSiniri) {
      // Açılamayan / üst sınırı aşan çoklu koşu: tek test, tarayıcı açılmadan açık hatayla kalır.
      const mesaj = acilim.hatalar.length ? acilim.hatalar.join(' ')
        : `Bu senaryodan ${acilim.kosular.length} veri koşusu çıkıyor; tek senaryoda en çok ${veriKosusuSiniri} olabilir (Ayarlar > Koşu). Senaryonun satır seçimini daraltın.`;
      ekle(basvurulariCoz(hamVeri, ekranId, mb, icerik.tabloSecimleri), { anahtar: null, ad: null }, [{ alan: 'veriKosulari', mesaj }]);
      continue;
    }
    if (!acilim.kosular.length) {
      ekle(basvurulariCoz(hamVeri, ekranId, mb, icerik.tabloSecimleri), { anahtar: null, ad: null });
      continue;
    }
    for (const k of acilim.kosular) ekle(basvurulariCoz(hamVeri, ekranId, mb, icerik.tabloSecimleri, { sabit: k.satirlar }), { anahtar: k.anahtar, ad: k.ad });
  }
  // Model senaryosu "Dene": taslak, geçici dosyadan (veritabanında yok) tek deneme senaryosu olarak eklenir.
  const deneme = modelDenemeSenaryosu(ortamId);
  if (deneme) {
    const mb = modelBaglami(vt, deneme.ekranId, deneme.akisId);
    const ekran = ekranlar.get(deneme.ekranId);
    if (mb) {
      modeller.set(`${deneme.ekranId}\u0000deneme`, mb);
      const cozum = basvurulariCoz(deneme.veri, deneme.ekranId, mb, deneme.tabloSecimleri);
      senaryolar.push({
        id: deneme.id, baslik: deneme.baslik, kosuyaDahil: true, ekranEtkin: true,
        ekran: ekran ? { id: ekran.id, anahtar: ekran.anahtar, ad: ekran.ad } : { id: deneme.ekranId, anahtar: '', ad: '' },
        model: mb.model, modelSurumu: mb.surum, altModeller: mb.altModeller, veri: cozum.veri, mutlakaGorunmeli: deneme.mutlakaGorunmeli, deneme: true,
        ...(cozum.tabloGizliDegerleri.length ? { tabloGizliDegerleri: cozum.tabloGizliDegerleri } : {}),
        ...(cozum.veriHatalari.length ? { veriHatalari: cozum.veriHatalari } : {}),
        ...(Object.keys(cozum.dosyaBasvurulari).length ? { dosyaBasvurulari: cozum.dosyaBasvurulari } : {}),
        giris: deneme.giris, adimGoruntusu: deneme.adimGoruntusu
      });
    }
  }
  /** @type {Record<string, Record<string, unknown>>} tür → ad → alanlar (ortama özgü profil tüm-ortam profilini ezer) */
  const baglamProfilleri = {};
  for (const p of baglamProfilleriniListele(vt, projeId).filter((x) => x.ortamId === null || x.ortamId === ortamId)
    .sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
    (baglamProfilleri[p.tur] ??= {})[p.ad] = p.alanlar ?? {};
  }
  // Kimlik alanlarının hazır profilleri: senaryoların modellerindeki kimlik alanlarının profil havuzları (aynı adlı test verisi
  // türü) → test verisi profilleri (değerler çözülmüş; yalnızca koşu belleğinde).
  /** @type {Set<string>} */
  const havuzlar = new Set();
  for (const mb of modeller.values()) {
    if (!mb) continue;
    const alanlar = [
      ...mb.model.adimlar.flatMap((/** @type {any} */ a) => (Array.isArray(a.bolumler) ? a.bolumler : []).flatMap((/** @type {any} */ b) => (Array.isArray(b.alanlar) ? b.alanlar : []))),
      ...(mb.model.senaryoDuzeyi && Array.isArray(mb.model.senaryoDuzeyi.alanlar) ? mb.model.senaryoDuzeyi.alanlar : [])
    ];
    for (const a of alanlar) {
      if (!a || a.tip !== 'kimlikProfili' || !a.eslesme) continue;
      const h = a.eslesme.profilHavuzu;
      for (const x of typeof h === 'string' ? [h] : h && typeof h === 'object' ? Object.values(h) : []) if (typeof x === 'string') havuzlar.add(x);
    }
  }
  // Riskli ortam (Ayarlar > ortam "Bu ortam riskli mi?"; belirtilmemiş = riskli): "yalnızca test ortamı" ortak akış adımları atlanır.
  const canli = riskliOrtamMi(ortam);
  // SQL adımlarının veritabanı bağlantıları (Ayarlar > Entegrasyonlar): yalnız modellerde kullanılanlar; parola çözülmüş, giriş
  // bilgisi gibi yalnız bu borudan koşu belleğine gider (loglara / rapora yazılmaz). Kullanılamayan bağlantı { hata }.
  // Mantıksal veritabanları (Ayarlar > Entegrasyonlar > Veritabanları) bu ortamın eşlemesiyle bağlantıya çözülür; eşleme yoksa
  // { hata } (adım sorgu atmadan kalır). sqlBaglantiAdlari: raporda kullanılan bağlantının adı.
  /** @type {Set<string>} */
  const baglantiIdleri = new Set();
  /** @type {Set<string>} */
  const veritabaniIdleri = new Set();
  for (const mb of modeller.values()) {
    if (!mb) continue;
    const h = modeldekiSqlHedefleri([mb.model, mb.altModeller]);
    for (const id of h.baglantiIdleri) baglantiIdleri.add(id);
    for (const id of h.veritabaniIdleri) veritabaniIdleri.add(id);
  }
  const sql = baglantiIdleri.size || veritabaniIdleri.size ? kosuSqlVerisi(vt, projeId, ortamId, { baglantiIdleri, veritabaniIdleri }) : { sqlBaglantilari: {} };
  return { ortam: 'genel', ortamId, tabanUrl: ortam.tabanUrl, canli, senaryolar, baglamProfilleri, kimlikProfilleri: kimlikProfilleriniCoz(vt, projeId, ortamId, havuzlar), ...sql };
}

/**
 * "Dene" deneme senaryosu (TEST_SUNUCU_MODEL_DENEME_DOSYASI; test sunucusu yazar, koşudan sonra siler). Bu ortam için değilse
 * ya da biçimi bozuksa null. @param {string} ortamId
 */
function modelDenemeSenaryosu(ortamId) {
  const yol = process.env.TEST_SUNUCU_MODEL_DENEME_DOSYASI;
  if (!yol || !existsSync(yol)) return null;
  try {
    const d = JSON.parse(readFileSync(yol, 'utf8'));
    if (!d || typeof d !== 'object' || d.ortamId !== ortamId || typeof d.id !== 'string' || !/^deneme-[a-f0-9]{1,32}$/.test(d.id)) return null;
    if (typeof d.ekranId !== 'string' || typeof d.baslik !== 'string' || !d.veri || typeof d.veri !== 'object') return null;
    return {
      id: d.id, ekranId: d.ekranId, akisId: typeof d.akisId === 'string' ? d.akisId : null, baslik: d.baslik, veri: d.veri,
      mutlakaGorunmeli: Array.isArray(d.mutlakaGorunmeli) ? d.mutlakaGorunmeli.filter((/** @type {unknown} */ x) => typeof x === 'string') : [],
      giris: senaryoGirisiniAyikla(d.giris).giris,
      adimGoruntusu: senaryoAdimGoruntusuAyikla(d.adimGoruntusu).secim,
      // Formdaki satır seçimleri (sunucu ekran-basvurulari.mjs > tabloSecimleriniAyikla ile denetledi).
      tabloSecimleri: d.tabloSecimleri && typeof d.tabloSecimleri === 'object' && !Array.isArray(d.tabloSecimleri) ? d.tabloSecimleri : null
    };
  } catch {
    return null;
  }
}

/**
 * Profil havuzları (test verisi türü adları) → { havuz: { profil adı: değerler } } (ortama özgü profil tüm-ortam profilini
 * ezer; değerler çözülmüş). Aynı adlı türü olmayan havuz atlanır.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId @param {Set<string>} havuzlar
 */
function kimlikProfilleriniCoz(vt, projeId, ortamId, havuzlar) {
  /** @type {Record<string, Record<string, Record<string, unknown>>>} */
  const sonuc = {};
  if (!havuzlar.size) return sonuc;
  const turler = testVerisiTurleriniListele(vt, projeId);
  for (const havuz of havuzlar) {
    const tur = turler.find((t) => t.ad === havuz);
    if (!tur) continue;
    /** @type {Record<string, Record<string, unknown>>} */
    const profiller = {};
    for (const p of testVerisiProfilleriniListele(vt, projeId, tur.id).filter((x) => x.ortamId === null || x.ortamId === ortamId)
      .sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
      const cozulmus = testVerisiProfiliGetir(vt, p.id, { coz: true });
      if (cozulmus) profiller[p.ad] = cozulmus.degerler;
    }
    sonuc[havuz] = profiller;
  }
  return sonuc;
}

calistir().then(yaz, (hata) => {
  const kod = hata instanceof KasaHatasi ? hata.kod : 'HATA';
  // Hata mesajları gizli değer içermez (kasa/depo mesajları bilinçli olarak genel).
  yaz({ hata: String(hata?.message ?? hata).split('\n')[0].slice(0, 300), kod });
});
