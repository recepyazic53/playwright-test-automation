#!/usr/bin/env node
// TEST SÜREÇLERİ İÇİN VERİ OKUYUCU (genel) — tests/support/platform-veri.ts bunu ayrı bir süreçte
// (execFileSync) çalıştırır; çünkü spec dosyaları veriyi modül yüklenirken EŞZAMANLI ister, sql.js
// ise yalnızca eşzamansız başlatılabilir. Veritabanı SALT OKUNUR açılır (veritabanına hiç yazılmaz);
// sonuç yalnızca stdout borusundan (bellekte) üst sürece döner, hiçbir dosyaya yazılmaz.
//
// Kullanım: node veri-oku.mjs <kip> --adaptor <ad> [--ortam <ortam>]
//   durum   → veritabanı/aktarım durumu + koşudan hariç senaryo anahtarları ve (devre dışı/silinmiş ekranların)
//             spec dosyaları (kasa GEREKMEZ)
//   veri    → durum + adaptörün yenidenKur çıktısı (test verisi, ekran modelleri, taban adres, giriş) +
//             etkin giriş tarifi (girisTarifi: { tarif, kaynak, hatalar } | null)
//             (PLATFORM_KASA_ANAHTARI [base64url] ya da PLATFORM_KASA_PAROLASI gerekir)
//   model   → durum + bu ortamdaki MODEL senaryoları (test kodu olmayan; bkz. senaryolar/model-kosusu.mjs):
//             senaryo verisi (hassas alanlar çözülmüş), ekran modeli + alt modeller, "mutlaka görünmeli"
//             alanları ve bağlam profilleri (tür → ad → alanlar). Kasa anahtarı gerekir (veri kipiyle aynı).
//   anahtar → PLATFORM_KASA_PAROLASI'ndan anahtarı türetip doğrular, base64url olarak döner
//   genel   → ADAPTÖRSÜZ (elle oluşturulan proje/ortam; Nöbetçi'nin genel model koşusu, playwright.model.config.ts):
//             node veri-oku.mjs genel --proje <id> --ortam-id <id> — "model" kipinin çıktısı ortam KİMLİĞİYLE +
//             ortamın giriş bilgisi (giris; ortama özel profil, yoksa tüm ortamlar için olan) ve KAYITLI giriş
//             tarifi (girisTarifi; adaptör varsayılanı yok). Kasa anahtarı gerekir.
// "veri"/"model" kipleri ayrıca Ayarlar > Güvenlik'teki yasak adresleri (yasakAdresler) döner ve şifreli senaryo
// dosyalarını (dosyalar/senaryo-dosyalari.mjs) koşunun geçici klasörüne (NOBETCI_DOSYA_KLASORU; yalnızca kullanıcı
// okuyabilir, koşu bitince silinir) çözer — BU, okuyucunun diske yazdığı TEK şeydir.
// Çıktı her zaman tek satır JSON'dur; hata durumunda { hata, kod } (çıkış kodu 0). Gizli değerler
// yalnızca "veri"/"anahtar" kiplerinin stdout'unda bulunur; loglara ASLA yazılmaz.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniAc, veritabaniYolu } from '../veritabani/baglanti.mjs';
import { gocleriUygula } from '../veritabani/gocler.mjs';
import { KasaHatasi, kasaDurumu, kasayiAnahtarlaAc, parolayiDogrula } from '../kasa.mjs';
import { aktarilmisProjeyiBul, ortamKimligiBul, zarflariCoz } from './motor.mjs';
import {
  baglamProfilleriniListele, ekranlariListele, girisProfiliGetir, kaynakEslemeleriniListele, ortamGetir, projeGetir,
  testVerisiProfiliGetir, testVerisiProfilleriniListele, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import { modelBaglami, senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { GENEL_ORTAM_ETIKETI } from '../senaryolar/calistirma.mjs';
import { modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { adaptorBul } from '../../../projeler/index.mjs';
import { medyaKlasoru } from '../medya.mjs';
import { referanslariBul, referanslariCoz } from '../dosyalar/senaryo-dosyalari.mjs';
import { DOSYA_KLASORU_DEGISKENI, kosuKlasoruDogrula } from '../dosyalar/gecici-dosyalar.mjs';
import { ayarlardakiYasakAdresler } from '../guvenlik/yasak-adresler.mjs';
import { ekranHaricKapsami } from '../ekranlar/ekran-yonetimi.mjs';

const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {unknown} veri */
function yaz(veri) {
  process.stdout.write(`${JSON.stringify(veri)}\n`);
}

/** @param {string} ad */
function arguman(ad) {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** @param {import('../veritabani/baglanti.mjs').Veritabani} vt @returns {Promise<Buffer | null>} */
async function kasaAnahtari(vt) {
  if (process.env.PLATFORM_KASA_ANAHTARI) return Buffer.from(process.env.PLATFORM_KASA_ANAHTARI, 'base64url');
  if (process.env.PLATFORM_KASA_PAROLASI) return parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI);
  return null;
}

async function calistir() {
  const kip = process.argv[2];
  if (kip === 'genel') return genelKip();
  const adaptor = adaptorBul(arguman('adaptor') ?? '');
  if (!adaptor) return { hata: 'Bilinmeyen adaptör.', kod: 'ADAPTOR' };
  const yol = veritabaniYolu(PROJE_KOKU);
  if (!existsSync(yol)) return { durum: 'veritabani-yok' };
  const vt = await veritabaniAc(yol, { saltOkunur: true });
  try {
    gocleriUygula(vt); // yalnızca bellekte (salt okunur bağlantı diske yazmaz)
    const kasaVar = kasaDurumu(vt).olusturuldu;

    if (kip === 'anahtar') {
      if (!kasaVar) return { hata: 'Kasa henüz oluşturulmamış.', kod: 'KASA_YOK' };
      const anahtar = await parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI ?? '');
      if (!anahtar) return { hata: 'Kasa parolası yanlış.', kod: 'PAROLA_YANLIS' };
      return { anahtar: anahtar.toString('base64url') };
    }

    const proje = aktarilmisProjeyiBul(vt, adaptor.ad);
    if (!proje || !kasaVar) return { durum: 'aktarilmamis', kasaVar };
    const aktarim = /** @type {Record<string, unknown>} */ (proje.ayarlar.aktarim ?? {});
    // Koşu listesi: senaryo düzeyinde "Koşuda" kapalı olanlar + devre dışı / silinmiş ekranların testleri (ekran düzeyi;
    // bkz. ekranlar/ekran-yonetimi.mjs). Dosya düzeyi hariç tutma, kodla sonradan eklenen testleri de kapsar.
    const ekranKapsami = ekranHaricKapsami(vt, proje.id);
    const temel = {
      durum: 'aktarildi',
      kasaVar,
      projeId: proje.id,
      sonAktarim: aktarim.sonAktarim ?? null,
      haricTutulanlar: [...new Set([...adaptor.kosudanHaricAnahtarlar(vt, proje.id), ...ekranKapsami.anahtarlar])],
      haricTutulanDosyalar: ekranKapsami.dosyalar
    };
    if (kip === 'durum') return temel;
    if (kip !== 'veri' && kip !== 'model') return { hata: 'Bilinmeyen kip.', kod: 'KIP' };

    const ortam = arguman('ortam');
    if (!ortam) return { hata: '--ortam gerekli.', kod: 'KIP' };
    const anahtar = await kasaAnahtari(vt);
    if (!anahtar) {
      return process.env.PLATFORM_KASA_PAROLASI
        ? { hata: 'PLATFORM_KASA_PAROLASI yanlış.', kod: 'PAROLA_YANLIS' }
        : { ...temel, anahtarYok: true };
    }
    kasayiAnahtarlaAc(vt, anahtar);
    anahtar.fill(0);
    // Yasak adresler (Ayarlar > Güvenlik): koşu koruması ortam değişkeniyle birleştirir.
    const yasakAdresler = ayarlardakiYasakAdresler(vt);
    const dosyaHedefi = dosyaKlasoru(yol);
    if (kip === 'model') {
      const model = modelSenaryolari(vt, proje.id, ortam);
      if (model && dosyaHedefi) {
        for (const s of model.senaryolar) s.veri = /** @type {Record<string, unknown>} */ ((await referanslariCoz(vt, s.veri, { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: dosyaHedefi })).deger);
      }
      return { ...temel, yasakAdresler, model };
    }
    const veri = adaptor.yenidenKur(vt, proje.id, ortam);
    // Şifreli senaryo dosyaları (ürün/ekran ayarları ve senaryo verisindeki "nobetci-dosya://" referansları) bu
    // koşunun geçici klasörüne çözülür; referans, dosyanın mutlak yoluyla değiştirilir (veri şekli değişmez).
    if (veri && dosyaHedefi) {
      veri.dosyalar = /** @type {typeof veri.dosyalar} */ ((await referanslariCoz(vt, veri.dosyalar, { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: dosyaHedefi })).deger);
      // "Dene" (taslak senaryo, ek veri dosyası): taslaktaki referanslar da çözülür; test-data.ts eşlemeyi uygular.
      const ekDosya = process.env.TEST_SUNUCU_EK_SENARYO_DOSYASI;
      if (ekDosya && existsSync(ekDosya)) {
        const refler = referanslariBul(JSON.parse(readFileSync(ekDosya, 'utf8')));
        if (refler.length) {
          const eslesme = Object.fromEntries(refler.map((r) => [r.referans, r.referans]));
          veri.ekDosyaYollari = /** @type {Record<string, string>} */ ((await referanslariCoz(vt, eslesme, { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: dosyaHedefi })).deger);
        }
      }
    }
    // Giriş tarifi (genel): kaydedilmiş tarif ya da adaptörün varsayılanı; geçersizse hatalarıyla birlikte
    // (giriş motoru açık bir hata verir).
    const ortamId = veri ? ortamKimligiBul(vt, proje.id, ortam) : undefined;
    if (veri && ortamId) {
      const t = etkinGirisTarifi(vt, proje.id, ortamId, adaptor);
      veri.girisTarifi = t.tarif ? { tarif: t.tarif, kaynak: t.kaynak, hatalar: t.hatalar } : null;
    }
    return { ...temel, yasakAdresler, veri };
  } finally {
    vt.kapat();
  }
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
 * GENEL KİP (adaptörsüz): proje + ortam kimlikleriyle model senaryoları, giriş bilgisi ve kayıtlı giriş tarifi.
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
    const model = ortamModelSenaryolari(vt, projeId, ortamId, GENEL_ORTAM_ETIKETI);
    const dosyaHedefi = dosyaKlasoru(yol);
    if (model && dosyaHedefi) {
      for (const s of model.senaryolar) s.veri = /** @type {Record<string, unknown>} */ ((await referanslariCoz(vt, s.veri, { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: dosyaHedefi })).deger);
    }
    const t = etkinGirisTarifi(vt, projeId, ortamId, null);
    return {
      durum: 'hazir', projeId, ortamId, yasakAdresler: ayarlardakiYasakAdresler(vt), model,
      giris: ortamGirisBilgisi(vt, projeId, ortamId),
      girisTarifi: t.tarif ? { tarif: t.tarif, kaynak: t.kaynak, hatalar: t.hatalar } : null
    };
  } finally {
    vt.kapat();
  }
}

/**
 * Ortamın giriş bilgisi (kasa açık olmalı; şifreler yalnızca bu sürecin çıktısında). Seçim, aktarım adaptörünün
 * eşlemesi olmayan projeler için: önce ortama özel giriş profili, yoksa tüm ortamlar için olanı (aktarım
 * adaptörlerinin yenidenKur'undaki yedek kuralla aynı). Profil yoksa null.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId
 */
function ortamGirisBilgisi(vt, projeId, ortamId) {
  const satir = vt.tek('SELECT id FROM giris_profilleri WHERE proje_id = ? AND (ortam_id = ? OR ortam_id IS NULL) ORDER BY (ortam_id IS NULL), rowid LIMIT 1', [projeId, ortamId]);
  const giris = satir ? girisProfiliGetir(vt, String(satir.id), { coz: true }) : undefined;
  if (!giris) return null;
  const sms = /** @type {Record<string, unknown>} */ (giris.smsAyari ?? {});
  return {
    profilKimligi: giris.id,
    kullaniciAdi: giris.kullaniciAdi,
    parola: giris.parola,
    totpGizli: giris.ikiAsamaliTur === 'totp' ? giris.totpGizli : null,
    sabitKod: giris.ikiAsamaliTur === 'sms' && sms.yontem === 'sabit' && typeof sms.kod === 'string' ? sms.kod : null,
    smsKipi: giris.ikiAsamaliTur === 'sms' ? (sms.yontem === 'elle' ? 'elle' : 'sabit') : null
  };
}

/**
 * Ortamdaki model senaryoları (kasa açık olmalı). Ortam eşlenmemişse null.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamAnahtari
 */
function modelSenaryolari(vt, projeId, ortamAnahtari) {
  const ortamId = ortamKimligiBul(vt, projeId, ortamAnahtari);
  return ortamId ? ortamModelSenaryolari(vt, projeId, ortamId, ortamAnahtari) : null;
}

/**
 * Ortamdaki (kimliğiyle) model senaryoları + bağlam profilleri (kasa açık olmalı). Ortam yoksa null.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId
 * @param {string} ortamEtiketi çıktıdaki "ortam" alanı (aktarımda çalıştırıcı anahtarı; genel kipte GENEL_ORTAM_ETIKETI)
 */
function ortamModelSenaryolari(vt, projeId, ortamId, ortamEtiketi) {
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam) return null;
  const eslemeliler = new Set(kaynakEslemeleriniListele(vt, projeId, 'senaryo').map((e) => e.varlikId));
  const kodDosyasiVar = (/** @type {string} */ dosya) => existsSync(join(PROJE_KOKU, 'tests', dosya));
  const ekranlar = new Map(ekranlariListele(vt, projeId).map((e) => [e.id, e]));
  /** @type {Map<string, ReturnType<typeof modelBaglami>>} */
  const modeller = new Map();
  const senaryolar = [];
  for (const s of vt.tumu('SELECT id, ekran_id, baslik, icerik_json, kosuya_dahil FROM senaryolar WHERE proje_id = ? ORDER BY rowid', [projeId])) {
    const icerik = JSON.parse(String(s.icerik_json));
    if (!modelSenaryosuMu(icerik, { kodEslemesiVar: eslemeliler.has(String(s.id)), kodDosyasiVar })) continue;
    const buOrtam = icerik.ortamlar && typeof icerik.ortamlar === 'object' ? icerik.ortamlar[ortamId] : undefined;
    if (!buOrtam || typeof buOrtam !== 'object' || s.ekran_id == null) continue;
    const ekranId = String(s.ekran_id);
    // Çoklu akış: senaryonun akışının modeli (ekran + akış başına önbellek).
    const akis = senaryoAkisi(icerik);
    const modelAnahtari = `${ekranId}\u0000${akis ?? ''}`;
    if (!modeller.has(modelAnahtari)) modeller.set(modelAnahtari, modelBaglami(vt, ekranId, akis));
    const mb = modeller.get(modelAnahtari);
    const ekran = ekranlar.get(ekranId);
    const kurallar = icerik.alanKurallari && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli.filter((x) => typeof x === 'string') : [];
    senaryolar.push({
      id: String(s.id), baslik: String(s.baslik), kosuyaDahil: s.kosuya_dahil === 1,
      // Devre dışı ekranın senaryosu koşuya girmez (model spec'i süzer; Nöbetçi'nin tam listesi yine görür).
      ekranEtkin: ekran ? ekran.durum === 'etkin' : false,
      ekran: ekran ? { id: ekran.id, anahtar: ekran.anahtar, ad: ekran.ad } : { id: ekranId, anahtar: '', ad: '' },
      model: mb ? mb.model : null, modelSurumu: mb ? mb.surum : null, altModeller: mb ? mb.altModeller : {},
      veri: 'veri' in buOrtam ? zarflariCoz(vt, buOrtam.veri) : {}, mutlakaGorunmeli: kurallar
    });
  }
  // Model senaryosu "Dene": taslak, geçici dosyadan (veritabanında yok) tek deneme senaryosu olarak eklenir.
  const deneme = modelDenemeSenaryosu(ortamId);
  if (deneme) {
    const mb = modelBaglami(vt, deneme.ekranId, deneme.akisId);
    const ekran = ekranlar.get(deneme.ekranId);
    if (mb) {
      modeller.set(`${deneme.ekranId}\u0000deneme`, mb);
      senaryolar.push({
        id: deneme.id, baslik: deneme.baslik, kosuyaDahil: true, ekranEtkin: true,
        ekran: ekran ? { id: ekran.id, anahtar: ekran.anahtar, ad: ekran.ad } : { id: deneme.ekranId, anahtar: '', ad: '' },
        model: mb.model, modelSurumu: mb.surum, altModeller: mb.altModeller, veri: deneme.veri, mutlakaGorunmeli: deneme.mutlakaGorunmeli, deneme: true
      });
    }
  }
  /** @type {Record<string, Record<string, unknown>>} tür → ad → alanlar (ortama özgü profil tüm-ortam profilini ezer) */
  const baglamProfilleri = {};
  for (const p of baglamProfilleriniListele(vt, projeId).filter((x) => x.ortamId === null || x.ortamId === ortamId)
    .sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
    (baglamProfilleri[p.tur] ??= {})[p.ad] = p.alanlar ?? {};
  }
  // Kimlik alanlarının hazır profilleri: senaryoların modellerindeki kimlik alanlarının profil havuzları → test verisi
  // profilleri (değerler çözülmüş; yalnızca koşu belleğinde). Havuz: projenin aktarım tanımı ya da aynı adlı test verisi türü.
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
  // Canlı ortam (Ayarlar > ortam "canlı" ya da aktarımın "canli" anahtarı): "yalnızca test ortamı" ortak akış adımları atlanır.
  const ayarlar = ortam.ayarlar && typeof ortam.ayarlar === 'object' ? /** @type {Record<string, unknown>} */ (ortam.ayarlar) : {};
  const canli = ayarlar.canli === true || ortamEtiketi === 'canli';
  return { ortam: ortamEtiketi, ortamId, tabanUrl: ortam.tabanUrl, canli, senaryolar, baglamProfilleri, kimlikProfilleri: kimlikProfilleriniCoz(vt, projeId, ortamId, havuzlar) };
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
      mutlakaGorunmeli: Array.isArray(d.mutlakaGorunmeli) ? d.mutlakaGorunmeli.filter((/** @type {unknown} */ x) => typeof x === 'string') : []
    };
  } catch {
    return null;
  }
}

/**
 * Profil havuzları → { havuz: { profil adı: değerler } } (ortama özgü profil tüm-ortam profilini ezer; değerler çözülmüş).
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamId @param {Set<string>} havuzlar
 */
function kimlikProfilleriniCoz(vt, projeId, ortamId, havuzlar) {
  /** @type {Record<string, Record<string, Record<string, unknown>>>} */
  const sonuc = {};
  if (!havuzlar.size) return sonuc;
  const proje = projeGetir(vt, projeId);
  const aktarim = /** @type {Record<string, unknown> | undefined} */ (proje?.ayarlar?.aktarim);
  const adaptor = typeof aktarim?.adaptor === 'string' ? adaptorBul(aktarim.adaptor) : undefined;
  const tanimlar = /** @type {Record<string, { tur: string; ad: string }>} */ (adaptor?.profilHavuzlari?.() ?? {});
  const turler = testVerisiTurleriniListele(vt, projeId);
  for (const havuz of havuzlar) {
    const ad = tanimlar[havuz] ? (tanimlar[havuz].tur === 'testVerisi' ? tanimlar[havuz].ad : null) : havuz;
    const tur = ad ? turler.find((t) => t.ad === ad) : undefined;
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
