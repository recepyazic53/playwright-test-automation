// GALAKSİ AKTARIM ADAPTÖRÜ — PROJEYE ÖZGÜ. Platform motoru (scripts/platform/aktarim/motor.mjs)
// genel kalır; Galaksi'nin eski dosya düzenini (tests/data/<ortam>/*.json, tests/data/kosu-listesi.json,
// tests/ekran-modelleri/*.json, .env) bilen tek yer burasıdır. İki yönlü çalışır:
//   1) paketOlustur: eski dosyalar → motorun anladığı nötr paket (ortam, giriş/bağlam/test verisi
//      profilleri, ekranlar + ayarları, senaryolar).
//   2) yenidenKur: veritabanı → testlerin bugün kullandığı AYNI şekiller (ortak.json, ürün dosyaları,
//      taban adres, giriş bilgisi). tests/support/platform-veri.ts bunu scripts/platform/aktarim/
//      veri-oku.mjs üzerinden (ayrı süreçte) çağırır; testlerin davranışı değişmez.
//
// Eşleme özeti:
//   .env TEST_/CANLI_BASE_URL          → ortamlar "TEST" / "CANLI" (şifreli ad + adres)
//   .env kullanıcı/parola/2FA          → giriş profili (ortam başına; CANLI'da CANLI_AUTH_SECRET → TOTP)
//   ortak.json kullaniciDegistir       → bağlam profilleri, tür "Acente" (alanlar şifreli)
//   ortak.json kimlikBilgileri.*       → test verisi türleri "Özel kişi", "Tüzel kişi", "Pasaport",
//                                        "Yabancı kimlik"; adresBilgileri → "Adres"; odeme.krediKarti →
//                                        "Kredi kartı" (profil adı "ortak")
//   ortak.json diğer alanları (login…) → ortam ayarları (aktarim.ortakIskeleti; şifreli)
//   tests/data/<ortam>/<ürün>.json     → ekran ayarları (ortamlar.<ortamId>.dosyalar.<dosya>; şifreli)
//                                        — senaryo dizileri hariç (onlar senaryo satırı olur)
//   tests/ekran-modelleri/*.model.json → ekran modeli (sürüm 1)
//   playwright --list (TEST + CANLI)   → senaryolar (kararlı UUID, kaynak {dosya, ad}, kosuya_dahil)
// Aynı profil iki ortamda AYNIYSA tek satır (tüm ortamlar), farklıysa ortam başına ayrı satır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir); proje kökü parametredir.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kaynakEslemeleriniListele, girisProfiliGetir, ortamGetir, ekranAyarlariniGetir } from '../../scripts/platform/veritabani/depo.mjs';
import { coz, zarfMi } from '../../scripts/platform/kasa.mjs';
import { AktarimHatasi, icerikOzeti, kanonik, zarflariCoz } from '../../scripts/platform/aktarim/motor.mjs';
import { playwrightTestleriniListele } from '../../scripts/platform/aktarim/playwright-liste.mjs';

/** @typedef {import('../../scripts/platform/veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../../scripts/platform/aktarim/motor.d.mts').AktarimPaketi} AktarimPaketi */
/** @typedef {Record<string, unknown>} Nesne */

export const ADAPTOR_ADI = 'galaksi';
export const PROJE_ADI = 'Galaksi';
const VERI_KLASORU = join('tests', 'data');
const MODEL_KLASORU = join('tests', 'ekran-modelleri');
const SENARYO_KLASORU = join('tests', 'scenarios');
const KOSU_LISTESI = join('tests', 'data', 'kosu-listesi.json');
const ISARET = '__platform__';

/** Ortamlar ve .env değişkenleri (mevcut tests/support/environments.ts ile birebir). */
export const ORTAMLAR = Object.freeze([
  { anahtar: 'test', ad: 'TEST', url: 'TEST_BASE_URL', parola: 'TEST_PASSWORD', varsayilan: true },
  { anahtar: 'canli', ad: 'CANLI', url: 'CANLI_BASE_URL', parola: 'CANLI_PASSWORD', totp: 'CANLI_AUTH_SECRET', sabitKod: 'CANLI_AUTH_CODE', varsayilan: false }
]);
/** Parmak izine giren .env değişkenleri (değer değil, şifreli özetleri saklanır). */
export const ORTAM_DEGISKENLERI = Object.freeze([
  'TEST_BASE_URL', 'CANLI_BASE_URL', 'LOGIN_USERNAME', 'TEST_USERNAME', 'TEST_PASSWORD', 'CANLI_PASSWORD', 'CANLI_AUTH_SECRET', 'CANLI_AUTH_CODE'
]);

/** ortak.json bölümleri → test verisi türleri. tekil: bölüm tek bir kayıttır (sözlük değil). */
const VERI_BOLUMLERI = Object.freeze([
  { yol: ['kimlikBilgileri', 'ozel'], tur: 'Özel kişi' },
  { yol: ['kimlikBilgileri', 'tuzel'], tur: 'Tüzel kişi' },
  { yol: ['kimlikBilgileri', 'pasaport'], tur: 'Pasaport' },
  { yol: ['kimlikBilgileri', 'yabanciKimlik'], tur: 'Yabancı kimlik' },
  { yol: ['adresBilgileri'], tur: 'Adres' },
  { yol: ['odeme', 'krediKarti'], tur: 'Kredi kartı', tekil: 'ortak' }
]);
const BAGLAM_BOLUMU = Object.freeze({ yol: ['kullaniciDegistir'], tur: 'Acente' });

/**
 * HASSASLIK (kullanıcı kararı): test verisi profillerindeki TÜM alanlar hassastır — kimlik
 * numaraları, telefon, doğum tarihi, adres (il/ilçe/cadde...), kart sahibi adı, kart bilgileri,
 * taksit vb. Değerler kasada şifreli durur, arayüzde maskeli gösterilir; yalnızca profilin ADI
 * (ör. "tc1", "adres1") açık kalır. Aynı alan adları senaryo içeriğinde geçerse onlar da şifrelenir
 * (motor: türlerdeki hassas alan adları). Kullanıcı bir alanı Ayarlar'dan tek tek "hassas değil"
 * yapabilir; aktarım bir sonraki çalıştırmada bu tercihi ezmez (tür kaynağı değişmedikçe).
 */
const ALAN_ETIKETLERI = Object.freeze({
  tcKimlikNo: 'T.C. kimlik no', vergiKimlikNo: 'Vergi kimlik no', pasaportNo: 'Pasaport no', yabanciKimlikNo: 'Yabancı kimlik no',
  dogumTarihi: 'Doğum tarihi', cepTelefonu: 'Cep telefonu', ad: 'Ad', soyad: 'Soyad', babaAdi: 'Baba adı', dogumYeri: 'Doğum yeri',
  uyruk: 'Uyruk', cinsiyet: 'Cinsiyet', kartNo: 'Kart no', guvenlikKodu: 'Güvenlik kodu', isim: 'Kart sahibi adı',
  soyisim: 'Kart sahibi soyadı', sonKullanmaAyi: 'Son kullanma ayı', sonKullanmaYili: 'Son kullanma yılı', taksit: 'Taksit',
  beklenenHataMesaji: 'Beklenen hata mesajı', il: 'İl', ilce: 'İlçe', belde: 'Belde', cadde: 'Cadde', sokak: 'Sokak',
  adresTipi: 'Adres tipi', adresParcasi: 'Adres parçası', mahalle: 'Mahalle', binaNo: 'Bina no', blokKodu: 'Blok kodu',
  siteAdi: 'Site adı', daireNo: 'Daire no', kat: 'Kat'
});

/** Veri dosyası → ekran (varsayılan: aynı ad). */
const DOSYA_EKRANI = Object.freeze({ 'jet-kasko-yk': 'jet-kasko' });
const EKRAN_ADLARI = Object.freeze({
  'jet-kasko': 'JetKasko', 'jet-seyahat': 'JetSeyahat', 'jet-dask': 'JetDASK', 'jet-kobi': 'JetKOBİ', 'jet-konut': 'JetKonut',
  'jet-saglik': 'JetSağlık', 'jet-ilk-ates-konut': 'İlk Ateş Konut', 'jet-satis': 'Jet Satış', trafik: 'Trafik', portal: 'Portal',
  'odeme-kredi-karti': 'Ödeme (kredi kartı)'
});
/** Veri güdümlü senaryolar: spec dosyası → veri dosyası + dizi yolu (öğe başlığı = test başlığı). */
const SENARYO_VERI_KAYNAKLARI = Object.freeze([
  { spec: 'scenarios/jet-seyahat/prim-hesaplama.spec.ts', dosya: 'jet-seyahat', yol: ['jetSeyahat', 'senaryolar'] },
  { spec: 'scenarios/jet-kasko/yeni-kayit.spec.ts', dosya: 'jet-kasko-yk', yol: ['jetKaskoYk', 'senaryolar'] }
]);

// ---------------------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------------------

/** @param {unknown} d @returns {d is Nesne} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @template T @param {T} d @returns {T} */
const kopya = (d) => JSON.parse(JSON.stringify(d));
/** @param {unknown} d @param {readonly string[]} yol @returns {unknown} */
const yolOku = (d, yol) => yol.reduce((/** @type {unknown} */ n, k) => (nesneMi(n) ? n[k] : undefined), d);
/** @param {Nesne} d @param {readonly string[]} yol @param {unknown} deger */
function yolYaz(d, yol, deger) {
  let n = d;
  for (const k of yol.slice(0, -1)) {
    if (!nesneMi(n[k])) return false;
    n = /** @type {Nesne} */ (n[k]);
  }
  if (!(yol[yol.length - 1] in n)) return false;
  n[yol[yol.length - 1]] = deger;
  return true;
}
const esit = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(kanonik(a)) === JSON.stringify(kanonik(b));
/** @param {string} dosya spec yolu (testDir'e göre) */
function ekranAnahtariBul(dosya) {
  const s = /^scenarios\/([^/]+)\//.exec(dosya);
  if (s) return s[1];
  const c = /^canli\/([^/]+)\.spec\.ts$/.exec(dosya);
  return c ? c[1] : null;
}

/** @param {string} projeKoku @param {string} ortam */
function veriDosyalari(projeKoku, ortam) {
  const klasor = join(projeKoku, VERI_KLASORU, ortam);
  if (!existsSync(klasor)) return [];
  return readdirSync(klasor).filter((ad) => ad.endsWith('.json')).map((ad) => ad.slice(0, -5)).sort();
}

/** @param {string} projeKoku @param {string} ortam @param {string} ad @returns {Nesne} */
function jsonOku(projeKoku, ortam, ad) {
  return JSON.parse(readFileSync(join(projeKoku, VERI_KLASORU, ortam, `${ad}.json`), 'utf-8'));
}

// ---------------------------------------------------------------------------------------
// Algılama ve parmak izleri
// ---------------------------------------------------------------------------------------

/**
 * Eski proje dosyaları var mı? (ortak.json en az bir ortamda)
 * @param {string} projeKoku
 */
export function algila(projeKoku) {
  const ortamlar = ORTAMLAR.filter((o) => existsSync(join(projeKoku, VERI_KLASORU, o.anahtar, 'ortak.json'))).map((o) => o.anahtar);
  return { var: ortamlar.length > 0, ortamlar };
}

/** Koşu listesi dosyasının (yalnızca test başlıkları içerir) açık özeti. @param {string} projeKoku */
export function kosuListesiOzeti(projeKoku) {
  const yol = join(projeKoku, KOSU_LISTESI);
  return existsSync(yol) ? icerikOzeti(readFileSync(yol)) : 'yok';
}

/**
 * Eski dosyaların parmak izleri (aktarımdan sonra dosyalar değişti mi?). "dosyalar" tüm veri
 * dosyalarını kapsar; ortam değişkenlerinin yalnızca TANIMLI olanlarının özeti alınır.
 * @param {string} projeKoku @param {NodeJS.ProcessEnv} ortamDegiskenleri
 */
export function parmakIzleri(projeKoku, ortamDegiskenleri) {
  const parcalar = [];
  for (const o of ORTAMLAR) {
    for (const ad of veriDosyalari(projeKoku, o.anahtar)) {
      parcalar.push(`${o.anahtar}/${ad}\u0000`, readFileSync(join(projeKoku, VERI_KLASORU, o.anahtar, `${ad}.json`), 'utf-8'), '\u0000');
    }
  }
  const kl = join(projeKoku, KOSU_LISTESI);
  parcalar.push('kosu-listesi\u0000', existsSync(kl) ? readFileSync(kl, 'utf-8') : '');
  /** @type {Record<string, string>} */
  const degiskenler = {};
  for (const ad of ORTAM_DEGISKENLERI) {
    const deger = ortamDegiskenleri[ad];
    if (deger) degiskenler[ad] = icerikOzeti(`${ad}=${deger}`);
  }
  return { dosyalar: icerikOzeti(parcalar.join('')), ortamDegiskenleri: degiskenler };
}

// ---------------------------------------------------------------------------------------
// 1) Dosyalar → paket
// ---------------------------------------------------------------------------------------

/**
 * Bir değerin test verisi alan tipi. {deger, metin} → 'secim'; diğer nesne/dizi → 'json'.
 * @param {unknown} v
 */
function alanTipi(v) {
  if (nesneMi(v) && Object.keys(v).length === 2 && 'deger' in v && 'metin' in v) return 'secim';
  if (typeof v === 'object' && v !== null) return 'json';
  if (typeof v === 'number') return 'sayi';
  if (typeof v === 'boolean') return 'mantiksal';
  return 'metin';
}

/**
 * Tür başına alan tanımları (tüm ortamlardaki tüm profillerin alan birleşimi, ilk görülme sırası).
 * Bir alan herhangi bir profilde nesne ise tipi 'secim'/'json' olur ve TÜM değerleri JSON metnine çevrilir.
 * @param {Nesne[]} kayitlar
 */
function alanTanimlari(kayitlar) {
  /** @type {Map<string, Set<string>>} */
  const tipler = new Map();
  for (const k of kayitlar) {
    for (const [ad, v] of Object.entries(k)) {
      if (!tipler.has(ad)) tipler.set(ad, new Set());
      if (v !== null && v !== undefined) /** @type {Set<string>} */ (tipler.get(ad)).add(alanTipi(v));
    }
  }
  return [...tipler].map(([ad, kume]) => {
    // Tek tip → o tip; nesne içeren karışık tip → 'json' (tüm değerler JSON metni olur); diğer karışık → 'metin'.
    const tip = kume.size === 1 ? [...kume][0] : kume.has('secim') || kume.has('json') ? 'json' : kume.size === 0 ? 'metin' : 'metin';
    return { ad, etiket: /** @type {Record<string, string>} */ (ALAN_ETIKETLERI)[ad] ?? ad, tip, hassas: true };
  });
}

/**
 * @param {Nesne} kayit @param {Array<{ ad: string; tip: string }>} alanlar
 * @returns {Record<string, string | number | boolean | null>}
 */
function profilDegerleri(kayit, alanlar) {
  const tipi = new Map(alanlar.map((a) => [a.ad, a.tip]));
  /** @type {Record<string, string | number | boolean | null>} */
  const sonuc = {};
  for (const [ad, v] of Object.entries(kayit)) {
    const tip = tipi.get(ad);
    if (tip === 'secim' || tip === 'json') sonuc[ad] = JSON.stringify(v);
    else if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) sonuc[ad] = /** @type {string | number | boolean | null} */ (v);
    else sonuc[ad] = JSON.stringify(v);
  }
  return sonuc;
}

/**
 * Ortamlar arası profil kapsamı: aynı ad her iki ortamda AYNI değerle varsa tek satır (null),
 * aksi halde ortam başına satır. Sonuç, anahtar sırası korunarak döner.
 * @param {Record<string, Record<string, unknown> | undefined>} ortamaGore ortamAnahtari → { ad: kayit }
 */
function kapsamlariBelirle(ortamaGore) {
  const ortamlar = Object.keys(ortamaGore);
  /** @type {string[]} */
  const adlar = [];
  for (const o of ortamlar) for (const ad of Object.keys(ortamaGore[o] ?? {})) if (!adlar.includes(ad)) adlar.push(ad);
  /** @type {Array<{ ad: string; ortam: string | null; kayit: Nesne }>} */
  const satirlar = [];
  for (const ad of adlar) {
    const degerler = ortamlar.map((o) => ortamaGore[o]?.[ad]);
    const hepsiVarVeAyni = ortamlar.length > 1 && degerler.every((d) => d !== undefined && esit(d, degerler[0]));
    if (hepsiVarVeAyni) { satirlar.push({ ad, ortam: null, kayit: /** @type {Nesne} */ (degerler[0]) }); continue; }
    ortamlar.forEach((o, i) => { if (degerler[i] !== undefined) satirlar.push({ ad, ortam: o, kayit: /** @type {Nesne} */ (degerler[i]) }); });
  }
  return satirlar;
}

/** Profil sözlüğü için iskelet işareti (sıra korunur). @param {Nesne} sozluk */
const sozlukIsareti = (sozluk) => ({ [ISARET]: 'profiller', sira: Object.keys(sozluk) });

/**
 * Eski dosyalardan motor paketi üretir. Test listesi (TEST + CANLI) Playwright'tan DOSYA
 * kaynağıyla alınır (PLATFORM_VERI_KAYNAGI=dosya).
 * @param {string} projeKoku
 * @param {{ ortamDegiskenleri?: NodeJS.ProcessEnv; testListesi?: (ortam: string) => Promise<Array<{ dosya: string; ad: string }>> }} [secenekler]
 * @returns {Promise<AktarimPaketi>}
 */
export async function paketOlustur(projeKoku, secenekler = {}) {
  const env = secenekler.ortamDegiskenleri ?? process.env;
  const listele = secenekler.testListesi ?? ((ortam) => playwrightTestleriniListele(projeKoku, {
    TEST_ENV: ortam, TEST_SUNUCU_TUM_LISTE: '1', PLATFORM_VERI_KAYNAGI: 'dosya'
  }));
  /** @type {string[]} */
  const uyarilar = [];
  /** @type {AktarimPaketi} */
  const paket = {
    surum: 1, adaptor: ADAPTOR_ADI, proje: { ad: PROJE_ADI, aciklama: 'Mevcut proje dosyalarından aktarıldı.' },
    ortamlar: [], girisProfilleri: [], baglamProfilleri: [], testVerisiTurleri: [], testVerisiProfilleri: [], ekranlar: [],
    senaryolar: [], uyarilar
  };

  const varOlanOrtamlar = ORTAMLAR.filter((o) => existsSync(join(projeKoku, VERI_KLASORU, o.anahtar, 'ortak.json')));
  if (!varOlanOrtamlar.length) throw new AktarimHatasi('Aktarılacak proje dosyası bulunamadı (tests/data/<ortam>/ortak.json).');
  /** @type {Record<string, Nesne>} */
  const ortaklar = Object.fromEntries(varOlanOrtamlar.map((o) => [o.anahtar, jsonOku(projeKoku, o.anahtar, 'ortak')]));

  // --- Ortamlar ve giriş profilleri (.env) ---------------------------------------------
  const kullanici = env.LOGIN_USERNAME ?? env.TEST_USERNAME;
  for (const o of varOlanOrtamlar) {
    const tabanUrl = env[o.url];
    if (!tabanUrl) { uyarilar.push(`${o.url} tanımlı değil: ${o.ad} ortamı ve bu ortamın verisi aktarılamadı.`); continue; }
    // ortak.json'un profil bölümleri çıkarılmış iskeleti (login vb. + bölümlerin yeri ve sırası).
    const iskelet = kopya(ortaklar[o.anahtar]);
    for (const b of [...VERI_BOLUMLERI, BAGLAM_BOLUMU]) {
      const bolum = yolOku(iskelet, b.yol);
      if (bolum === undefined) continue;
      yolYaz(iskelet, b.yol, 'tekil' in b ? { [ISARET]: 'profil', ad: b.tekil } : sozlukIsareti(/** @type {Nesne} */ (bolum)));
    }
    paket.ortamlar.push({ anahtar: o.anahtar, ad: o.ad, tabanUrl, varsayilan: o.varsayilan, ayarlar: { aktarim: { ortakIskeleti: iskelet } } });
    if (!kullanici) { uyarilar.push(`${o.ad}: LOGIN_USERNAME/TEST_USERNAME tanımlı değil, giriş profili aktarılmadı.`); continue; }
    const totp = 'totp' in o && o.totp ? env[o.totp] : undefined;
    const sabitKod = 'sabitKod' in o && o.sabitKod ? env[o.sabitKod] : undefined;
    if (!env[o.parola]) uyarilar.push(`${o.ad}: ${o.parola} tanımlı değil, giriş profili parolasız aktarıldı.`);
    paket.girisProfilleri.push({
      anahtar: o.anahtar, ortam: o.anahtar, ad: `${o.ad} kullanıcısı`, kullaniciAdi: kullanici, parola: env[o.parola] || null,
      ikiAsamaliTur: totp ? 'totp' : sabitKod ? 'sms' : 'yok', totpGizli: totp || null,
      smsAyari: !totp && sabitKod ? { yontem: 'sabit', kod: sabitKod, not: `${o.sabitKod} (sabit 2FA kodu)` } : {}
    });
  }
  const ortamAnahtarlari = paket.ortamlar.map((o) => o.anahtar);

  // --- Bağlam profilleri (Acente) -------------------------------------------------------
  const baglamlar = kapsamlariBelirle(Object.fromEntries(ortamAnahtarlari.map((o) => [o, /** @type {Nesne | undefined} */ (yolOku(ortaklar[o], BAGLAM_BOLUMU.yol))])));
  for (const s of baglamlar) {
    paket.baglamProfilleri.push({ anahtar: `${s.ad}${s.ortam ? `@${s.ortam}` : ''}`, ortam: s.ortam, tur: BAGLAM_BOLUMU.tur, ad: s.ad, alanlar: s.kayit });
  }

  // --- Test verisi türleri + profilleri ---------------------------------------------------
  for (const b of VERI_BOLUMLERI) {
    const yolMetni = b.yol.join('.');
    /** @type {Record<string, Nesne | undefined>} */
    const ortamaGore = {};
    for (const o of ortamAnahtarlari) {
      const bolum = yolOku(ortaklar[o], b.yol);
      if (bolum === undefined) continue;
      ortamaGore[o] = b.tekil ? { [b.tekil]: bolum } : /** @type {Nesne} */ (bolum);
    }
    const satirlar = kapsamlariBelirle(ortamaGore);
    if (!satirlar.length) continue;
    const alanlar = alanTanimlari(satirlar.map((s) => s.kayit));
    paket.testVerisiTurleri.push({ anahtar: yolMetni, ad: b.tur, alanlar });
    for (const s of satirlar) {
      paket.testVerisiProfilleri.push({
        anahtar: `${yolMetni}:${s.ad}${s.ortam ? `@${s.ortam}` : ''}`, tur: yolMetni, ortam: s.ortam, ad: s.ad,
        degerler: profilDegerleri(s.kayit, alanlar)
      });
    }
  }

  // --- Ekranlar (ürün klasörleri, veri dosyaları, ekran modelleri) -----------------------
  /** @type {Map<string, { ad: string; ayarlar: { ortamlar: Record<string, { dosyalar: Record<string, unknown> }> }; model?: Nesne; aciklama?: string }>} */
  const ekranlar = new Map();
  const ekranAl = (/** @type {string} */ anahtar) => {
    let e = ekranlar.get(anahtar);
    if (!e) {
      e = { ad: /** @type {Record<string, string>} */ (EKRAN_ADLARI)[anahtar] ?? anahtar, ayarlar: { ortamlar: {} } };
      ekranlar.set(anahtar, e);
    }
    return e;
  };
  const senaryoKlasoru = join(projeKoku, SENARYO_KLASORU);
  if (existsSync(senaryoKlasoru)) {
    for (const g of readdirSync(senaryoKlasoru, { withFileTypes: true })) if (g.isDirectory()) ekranAl(g.name);
  }
  for (const o of ortamAnahtarlari) {
    for (const dosya of veriDosyalari(projeKoku, o)) {
      if (dosya === 'ortak') continue;
      const icerik = jsonOku(projeKoku, o, dosya);
      for (const k of SENARYO_VERI_KAYNAKLARI) {
        if (k.dosya === dosya && Array.isArray(yolOku(icerik, k.yol))) yolYaz(icerik, k.yol, { [ISARET]: 'senaryolar', spec: k.spec });
      }
      const e = ekranAl(/** @type {Record<string, string>} */ (DOSYA_EKRANI)[dosya] ?? dosya);
      e.ayarlar.ortamlar[o] ??= { dosyalar: {} };
      e.ayarlar.ortamlar[o].dosyalar[dosya] = icerik;
    }
  }
  const modelKlasoru = join(projeKoku, MODEL_KLASORU);
  if (existsSync(modelKlasoru)) {
    for (const ad of readdirSync(modelKlasoru).filter((d) => d.endsWith('.model.json')).sort()) {
      const model = JSON.parse(readFileSync(join(modelKlasoru, ad), 'utf-8'));
      const e = ekranAl(ad.slice(0, -'.model.json'.length));
      e.model = model;
      if (typeof model.aciklama === 'string') e.aciklama = model.aciklama.slice(0, 500);
      if (typeof model.ad === 'string' && !(ad.slice(0, -'.model.json'.length) in EKRAN_ADLARI)) e.ad = model.ad;
    }
  }

  // --- Senaryolar ---------------------------------------------------------------------
  const kosuListesiYolu = join(projeKoku, KOSU_LISTESI);
  /** @type {Set<string>} */
  const haric = new Set();
  if (existsSync(kosuListesiYolu)) {
    const kl = JSON.parse(readFileSync(kosuListesiYolu, 'utf-8'));
    for (const a of Array.isArray(kl.haricTutulanlar) ? kl.haricTutulanlar : []) if (typeof a === 'string') haric.add(a.replace(/\\/g, '/'));
  }
  /** @type {Map<string, { dosya: string; ad: string; ortamlar: Record<string, Nesne>; veri?: { dosya: string; yol: string } }>} */
  const senaryolar = new Map();
  const senaryoAl = (/** @type {string} */ dosya, /** @type {string} */ ad) => {
    const anahtar = `${dosya}::${ad}`;
    let s = senaryolar.get(anahtar);
    if (!s) { s = { dosya, ad, ortamlar: {} }; senaryolar.set(anahtar, s); }
    return s;
  };
  for (const o of ortamAnahtarlari) {
    let liste = [];
    try {
      liste = await listele(o);
    } catch (hata) {
      uyarilar.push(`${o.toUpperCase()} test listesi alınamadı (${/** @type {Error} */ (hata).message}); bu ortamın senaryoları yalnızca veri dosyalarından aktarıldı.`);
    }
    for (const t of liste) senaryoAl(t.dosya, t.ad).ortamlar[o] ??= {};
    for (const k of SENARYO_VERI_KAYNAKLARI) {
      const dizi = existsSync(join(projeKoku, VERI_KLASORU, o, `${k.dosya}.json`)) ? yolOku(jsonOku(projeKoku, o, k.dosya), k.yol) : undefined;
      if (!Array.isArray(dizi)) continue;
      /** @type {Set<string>} */
      const gorulen = new Set();
      dizi.forEach((oge, sira) => {
        let ad = nesneMi(oge) && typeof oge.baslik === 'string' ? oge.baslik : `#${sira + 1}`;
        if (gorulen.has(ad)) { uyarilar.push(`${k.dosya} (${o}): "${ad}" başlığı tekrar ediyor; sıra numarasıyla ayrıldı.`); ad = `${ad} #${sira + 1}`; }
        gorulen.add(ad);
        const s = senaryoAl(k.spec, ad);
        s.veri = { dosya: k.dosya, yol: k.yol.join('.') };
        s.ortamlar[o] = { sira, veri: oge };
      });
    }
  }
  const eslesenHaric = new Set();
  for (const [anahtar, s] of senaryolar) {
    const ekran = ekranAnahtariBul(s.dosya);
    if (ekran) ekranAl(ekran);
    if (haric.has(anahtar)) eslesenHaric.add(anahtar);
    paket.senaryolar.push({
      anahtar, ekran, baslik: s.ad, kosuyaDahil: !haric.has(anahtar),
      icerik: { kaynak: { dosya: s.dosya, ad: s.ad }, ...(s.veri ? { veri: s.veri } : {}), ortamlar: s.ortamlar }
    });
  }
  const eslesmeyen = [...haric].filter((a) => !eslesenHaric.has(a)).length;
  if (eslesmeyen) uyarilar.push(`kosu-listesi.json'daki ${eslesmeyen} hariç tutma anahtarı hiçbir teste eşleşmedi (etkisizdi; aktarılmadı).`);

  for (const [anahtar, e] of ekranlar) {
    paket.ekranlar.push({ anahtar, ekranAnahtari: anahtar, ad: e.ad, aciklama: e.aciklama ?? null, ayarlar: e.ayarlar, ...(e.model ? { model: e.model } : {}) });
  }

  const izler = parmakIzleri(projeKoku, env);
  paket.projeAyarlari = { kosuListesiOzeti: kosuListesiOzeti(projeKoku) };
  paket.gizliOzetler = { dosyalar: izler.dosyalar, ortamDegiskenleri: izler.ortamDegiskenleri };
  return paket;
}

// ---------------------------------------------------------------------------------------
// 2) Veritabanı → testlerin bugünkü şekilleri
// ---------------------------------------------------------------------------------------

/**
 * Kasa gerektirmez: koşudan hariç tutulan senaryoların eski anahtarları ("<dosya>::<ad>").
 * @param {Veritabani} vt @param {string} projeId
 */
export function kosudanHaricAnahtarlar(vt, projeId) {
  const haric = new Set(vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND kosuya_dahil = 0', [projeId]).map((s) => String(s.id)));
  return kaynakEslemeleriniListele(vt, projeId, 'senaryo').filter((e) => haric.has(e.varlikId)).map((e) => e.kaynakAnahtari);
}

/**
 * @param {Veritabani} vt @param {string} tablo @param {string} projeId @param {string} ortamId @param {string} [ekKosul] @param {unknown[]} [ekParam]
 * @returns {Map<string, Record<string, unknown>>} ad → satır (ortama özgü satır tüm-ortam satırını ezer)
 */
function kapsamliSatirlar(vt, tablo, projeId, ortamId, ekKosul = '', ekParam = []) {
  /** @type {Map<string, Record<string, unknown>>} */
  const sonuc = new Map();
  const satirlar = vt.tumu(
    `SELECT * FROM ${tablo} WHERE proje_id = ? AND (ortam_id IS NULL OR ortam_id = ?) ${ekKosul} ORDER BY (ortam_id IS NOT NULL), rowid`,
    [projeId, ortamId, ...ekParam]
  );
  for (const s of satirlar) sonuc.set(String(s.ad), s);
  return sonuc;
}

/**
 * Sözlüğü iskeletteki sıraya göre kurar; iskelette olmayan (sonradan eklenen) adlar sona eklenir.
 * @param {Map<string, unknown>} degerler @param {unknown} isaret
 */
function siraliSozluk(degerler, isaret) {
  const sira = nesneMi(isaret) && Array.isArray(isaret.sira) ? /** @type {string[]} */ (isaret.sira) : [];
  /** @type {Nesne} */
  const sonuc = {};
  for (const ad of sira) if (degerler.has(ad)) sonuc[ad] = degerler.get(ad);
  for (const [ad, d] of degerler) if (!(ad in sonuc)) sonuc[ad] = d;
  return sonuc;
}

/**
 * Veritabanından, verilen ortam için eski dosyalarla AYNI şekilde veri kurar. Kasa açık olmalıdır.
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamAnahtari
 */
export function yenidenKur(vt, projeId, ortamAnahtari) {
  const eslemeler = kaynakEslemeleriniListele(vt, projeId);
  const esleme = (/** @type {string} */ tur, /** @type {string} */ anahtar) => eslemeler.find((e) => e.varlikTuru === tur && e.kaynakAnahtari === anahtar)?.varlikId;
  const ortamId = esleme('ortam', ortamAnahtari);
  const ortam = ortamId ? ortamGetir(vt, ortamId) : undefined;
  if (!ortamId || !ortam) return null;

  // Giriş bilgisi
  const girisId = esleme('giris_profili', ortamAnahtari)
    ?? String(vt.tek('SELECT id FROM giris_profilleri WHERE proje_id = ? AND (ortam_id = ? OR ortam_id IS NULL) ORDER BY (ortam_id IS NULL), rowid LIMIT 1', [projeId, ortamId])?.id ?? '');
  const giris = girisId ? girisProfiliGetir(vt, girisId, { coz: true }) : undefined;

  // ortak.json
  const ortakAyar = /** @type {Nesne} */ (ortam.ayarlar.aktarim ?? {});
  const ortak = kopya(/** @type {Nesne} */ (ortakAyar.ortakIskeleti ?? {}));
  const baglamlar = kapsamliSatirlar(vt, 'baglam_profilleri', projeId, ortamId, 'AND tur = ?', [BAGLAM_BOLUMU.tur]);
  if (nesneMi(yolOku(ortak, BAGLAM_BOLUMU.yol))) {
    const degerler = new Map([...baglamlar].map(([ad, s]) => [ad, JSON.parse(String(zarfMi(s.alanlar_json) ? coz(vt, s.alanlar_json) : s.alanlar_json))]));
    yolYaz(ortak, BAGLAM_BOLUMU.yol, siraliSozluk(degerler, yolOku(ortak, BAGLAM_BOLUMU.yol)));
  }
  for (const b of VERI_BOLUMLERI) {
    const isaret = yolOku(ortak, b.yol);
    if (!nesneMi(isaret) || !(ISARET in isaret)) continue;
    const turId = esleme('test_verisi_turu', b.yol.join('.'));
    const turSatiri = turId ? vt.tek('SELECT alanlar_json FROM test_verisi_turleri WHERE id = ?', [turId]) : undefined;
    const tipler = new Map((turSatiri ? /** @type {Array<{ ad: string; tip: string }>} */ (JSON.parse(String(turSatiri.alanlar_json))) : []).map((a) => [a.ad, a.tip]));
    const profiller = turId ? kapsamliSatirlar(vt, 'test_verisi_profilleri', projeId, ortamId, 'AND tur_id = ?', [turId]) : new Map();
    /** @type {Map<string, Nesne>} */
    const degerler = new Map();
    for (const [ad, s] of profiller) {
      const ham = /** @type {Nesne} */ (JSON.parse(String(s.degerler_json)));
      /** @type {Nesne} */
      const kayit = {};
      for (const [alan, v] of Object.entries(ham)) {
        const acik = zarfMi(v) ? coz(vt, v) : v;
        const tip = tipler.get(alan);
        // Şifreli değer her zaman metin olarak döner; türün tipine göre asıl şekline çevrilir.
        if ((tip === 'secim' || tip === 'json') && typeof acik === 'string') kayit[alan] = JSON.parse(acik);
        else if (tip === 'sayi' && typeof acik === 'string' && acik !== '' && Number.isFinite(Number(acik))) kayit[alan] = Number(acik);
        else if (tip === 'mantiksal' && (acik === 'true' || acik === 'false')) kayit[alan] = acik === 'true';
        else kayit[alan] = acik;
      }
      degerler.set(ad, kayit);
    }
    if (b.tekil) {
      const kayit = degerler.get(String(isaret.ad));
      if (kayit) yolYaz(ortak, b.yol, kayit);
    } else {
      yolYaz(ortak, b.yol, siraliSozluk(degerler, isaret));
    }
  }

  // Ürün veri dosyaları (ekran ayarları) + veri güdümlü senaryolar
  /** @type {Record<string, Nesne>} */
  const dosyalar = {};
  for (const e of vt.tumu('SELECT id FROM ekranlar WHERE proje_id = ? ORDER BY rowid', [projeId])) {
    const ayarlar = ekranAyarlariniGetir(vt, String(e.id)) ?? {};
    const ortamlar = /** @type {Nesne} */ (ayarlar.ortamlar ?? {});
    const buOrtam = /** @type {Nesne | undefined} */ (ortamlar[ortamId]);
    for (const [ad, icerik] of Object.entries(/** @type {Nesne} */ (buOrtam?.dosyalar ?? {}))) dosyalar[ad] = kopya(/** @type {Nesne} */ (icerik));
  }
  /** @type {Record<string, string>} */
  const senaryoKimlikleri = {};
  /** @type {Map<string, Array<{ sira: number; veri: unknown }>>} */
  const veriDizileri = new Map();
  const senaryoEslemesi = new Map(eslemeler.filter((e) => e.varlikTuru === 'senaryo').map((e) => [e.varlikId, e.kaynakAnahtari]));
  for (const s of vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE proje_id = ? ORDER BY rowid', [projeId])) {
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    const buOrtam = nesneMi(icerik.ortamlar) ? icerik.ortamlar[ortamId] : undefined;
    if (!nesneMi(buOrtam)) continue;
    const kaynak = nesneMi(icerik.kaynak) ? icerik.kaynak : undefined;
    const eskiAnahtar = senaryoEslemesi.get(String(s.id)) ?? (kaynak ? `${kaynak.dosya}::${kaynak.ad}` : undefined);
    if (eskiAnahtar) senaryoKimlikleri[eskiAnahtar] = String(s.id);
    const veri = nesneMi(icerik.veri) ? icerik.veri : undefined;
    if (veri && 'veri' in buOrtam) {
      const anahtar = `${veri.dosya}\u0000${veri.yol}`;
      if (!veriDizileri.has(anahtar)) veriDizileri.set(anahtar, []);
      /** @type {Array<{ sira: number; veri: unknown }>} */ (veriDizileri.get(anahtar)).push({ sira: Number(buOrtam.sira ?? 0), veri: zarflariCoz(vt, buOrtam.veri) });
    }
  }
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    for (const k of SENARYO_VERI_KAYNAKLARI) {
      if (k.dosya !== ad) continue;
      const isaret = yolOku(icerik, k.yol);
      if (!nesneMi(isaret) || isaret[ISARET] !== 'senaryolar') continue;
      const dizi = (veriDizileri.get(`${ad}\u0000${k.yol.join('.')}`) ?? []).sort((a, b) => a.sira - b.sira).map((x) => x.veri);
      yolYaz(icerik, k.yol, dizi);
    }
  }

  const sms = /** @type {Nesne} */ (giris?.smsAyari ?? {});
  return {
    ortam: ortamAnahtari,
    tabanUrl: ortam.tabanUrl,
    giris: giris ? {
      kullaniciAdi: giris.kullaniciAdi,
      parola: giris.parola,
      totpGizli: giris.ikiAsamaliTur === 'totp' ? giris.totpGizli : null,
      sabitKod: giris.ikiAsamaliTur === 'sms' && sms.yontem === 'sabit' && typeof sms.kod === 'string' ? sms.kod : null
    } : null,
    ortak,
    dosyalar,
    senaryoKimlikleri
  };
}

/**
 * Eski (Allure dönemi) koşu sonucu klasörleri: allure-results-<ortam>/ — varsa tek seferlik içe
 * aktarılır (scripts/platform/aktarim/allure-sonuclari.mjs). Klasörler SİLİNMEZ/değiştirilmez.
 * @param {string} projeKoku
 */
export function sonucKaynaklari(projeKoku) {
  return ORTAMLAR.map((o) => ({ ortam: o.anahtar, klasor: join(projeKoku, `allure-results-${o.anahtar}`) }))
    .filter((k) => existsSync(k.klasor));
}

/** @type {import('../index.d.mts').AktarimAdaptoru} */
export const galaksiAdaptoru = Object.freeze({
  ad: ADAPTOR_ADI,
  projeAdi: PROJE_ADI,
  etiket: 'Galaksi — mevcut proje dosyaları (tests/data, kosu-listesi, ekran modelleri, .env)',
  algila,
  paketOlustur,
  parmakIzleri,
  kosuListesiOzeti,
  kosudanHaricAnahtarlar,
  yenidenKur,
  sonucKaynaklari
});
