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
import { baglamProfilleriniListele, ekranlariListele, kaynakEslemeleriniListele, ortamGetir } from '../veritabani/depo.mjs';
import { modelBaglami } from '../senaryolar/senaryo-servisi.mjs';
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

async function calistir() {
  const kip = process.argv[2];
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
    let anahtar;
    if (process.env.PLATFORM_KASA_ANAHTARI) anahtar = Buffer.from(process.env.PLATFORM_KASA_ANAHTARI, 'base64url');
    else if (process.env.PLATFORM_KASA_PAROLASI) anahtar = await parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI);
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
 * Ortamdaki model senaryoları (kasa açık olmalı). Ortam eşlenmemişse null.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ortamAnahtari
 */
function modelSenaryolari(vt, projeId, ortamAnahtari) {
  const ortamId = ortamKimligiBul(vt, projeId, ortamAnahtari);
  const ortam = ortamId ? ortamGetir(vt, ortamId) : undefined;
  if (!ortamId || !ortam) return null;
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
    if (!modeller.has(ekranId)) modeller.set(ekranId, modelBaglami(vt, ekranId));
    const mb = modeller.get(ekranId);
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
  /** @type {Record<string, Record<string, unknown>>} tür → ad → alanlar (ortama özgü profil tüm-ortam profilini ezer) */
  const baglamProfilleri = {};
  for (const p of baglamProfilleriniListele(vt, projeId).filter((x) => x.ortamId === null || x.ortamId === ortamId)
    .sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
    (baglamProfilleri[p.tur] ??= {})[p.ad] = p.alanlar ?? {};
  }
  return { ortam: ortamAnahtari, ortamId, tabanUrl: ortam.tabanUrl, senaryolar, baglamProfilleri };
}

calistir().then(yaz, (hata) => {
  const kod = hata instanceof KasaHatasi ? hata.kod : 'HATA';
  // Hata mesajları gizli değer içermez (kasa/depo mesajları bilinçli olarak genel).
  yaz({ hata: String(hata?.message ?? hata).split('\n')[0].slice(0, 300), kod });
});
