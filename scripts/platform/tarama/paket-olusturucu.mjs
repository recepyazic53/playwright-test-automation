// OTOMATİK TARAMA → EKRAN PAKETİ (genel, saf fonksiyonlar). Tarama işinin (tarama.spec.ts) sayfadan topladığı
// YAPISAL envanteri (alanlar, etiketler, seçenekler, bölümler, bağlam profiline göre görünürlük, seçim keşfi)
// docs/sayfa-paketi.md biçiminde bir ekran paketine (sürüm 1, model şema sürümü 1) çevirir.
//
//  - Alan DEĞERLERİ pakete hiçbir zaman yazılmaz (envanter de değer taşımaz); sayfadan gelen metinlerde gizli
//    veri kalıbı (kart no, T.C. kimlik no, IBAN, JWT…) varsa metin atılır ve bilinmeyenlere yazılır.
//  - Yeni ekran: tek adımlı taslak model (bölümler = fieldset/legend ve başlıklar). Mevcut ekran (tekrar analiz):
//    mevcut model TABAN alınır; taranan alanlar seçiciyle eşleştirilip etiket/zorunluluk/seçenek/görünürlük
//    güncellenir, yeni alanlar en yakın eşleşen alanın bölümüne eklenir, taramada görülmeyen alanlar
//    KALDIRILMAZ (başka adımda/koşulda olabilir) — bilinmeyenlere yazılır. Böylece fark (bulgular) anlamlı kalır.
//  - Seçim keşfi (≤ 8 seçenekli açılır listeler): bir seçenekte beliren/kaybolan alanlar adlandırılmış koşul +
//    gorunurluk olur.
//  - Test verisi: seçim alanlarının seçenekleri paketin "testVerisi" bölümüne tablo olarak yazılır (bağımlı listelerde —
//    keşifte / kayıtta üst seçime göre seçenekleri değişen alanlar — satır = geçerli kombinasyon) ve alanlar sütunlara
//    bağlanır (paket-tablolari.mjs > secenekTablolariUret). Tablo adı "<Ekran adı> — <Alan>", türü "liste" (Ekran listeleri).
//    Yalnız seçenek etiketi / değeri; kullanıcının yazdığı metin yok.
// Hiçbir proje/ürün adı içermez. NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
// Tipler: paket-olusturucu.d.mts.

import { KANIT_BOYUT_SINIRI, KANIT_EN_COK, SAYFA_PAKETI_SURUMU, SAYFA_PAKETI_TURU, gizliKalipBul, kanitVerisiniCoz } from '../ekranlar/sayfa-paketi.mjs';
import { alanEtiketi, modelAlanlari, secenekTablolariUret } from '../tablolar/paket-tablolari.mjs';
import { VEYA_EN_COK } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';

export const TARAMA_OLUSTURANI = 'Nöbetçi otomatik tarama';
/** Her pakette bulunan bilinmeyen: tarama düğme/başarı göstergesi çıkarmaz. */
export const AKSIYON_BILINMEYENI = 'Adım/aksiyon tanımları (düğmeler, başarı göstergeleri) otomatik çıkarılamadı — yapay zekâ aracınızla (ekran paketi) ya da akış kaydıyla tamamlayın.';
/** Keşfedilen açılır listelerin en fazla seçenek sayısı. */
export const KESIF_SECENEK_SINIRI = 8;
/** Mevcut modelde taramayla eşleştirilebilen alan tipleri. */
const TARANABILIR_TIPLER = new Set(['secim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya']);

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @template T @param {T} d @returns {T} */
const kopya = (d) => JSON.parse(JSON.stringify(d));
/** Çerçeve (iframe) seçicileri varsa { cerceve } (modelde konum.cerceve / aksiyon / gösterge). @param {unknown} c */
const cerceveEki = (c) => (Array.isArray(c) && c.length ? { cerceve: c.map(String) } : {});
/** İki çerçeve zinciri aynı mı (yoksa ana sayfa). @param {unknown} a @param {unknown} b */
const cerceveAyni = (a, b) => JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
/** Gizli <select>'e bağlı özel açılır liste için önerilen doldurucu. */
const OZEL_SECIM_DOLDURUCUSU = 'ozelSecim';

const TR_ASCII = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' });
/** @param {string} m */
const asciiye = (m) => String(m).replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_ASCII[c] ?? c).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * Metinden model kimliği (camelCase, harf/rakam, harfle başlar; ör. "Ad Soyad" → "adSoyad", "user_name" → "userName").
 * @param {string} metin @param {string} [yedek]
 */
export function kimlikUret(metin, yedek = 'alan') {
  const parcalar = asciiye(metin).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parcalar.length) return yedek;
  let id = parcalar.map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  if (!/^[a-zA-Z]/.test(id)) id = `${yedek}${id.charAt(0).toUpperCase()}${id.slice(1)}`;
  return id.slice(0, 60);
}

/** Ekran anahtarı önerisi (küçük harf, rakam, "-"; ör. "Ödeme Formu" → "odeme-formu"). @param {string} metin */
export function ekranAnahtariOner(metin) {
  const a = asciiye(metin).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
  return a || 'ekran';
}

/** Kümede olmayan kimlik (çakışırsa 2, 3… eklenir). @param {string} temel @param {Set<string>} kullanilan */
function benzersiz(temel, kullanilan) {
  let aday = temel;
  for (let i = 2; kullanilan.has(aday); i++) aday = `${temel}${i}`;
  kullanilan.add(aday);
  return aday;
}

/**
 * Sayfadan gelen metni temizler: boşlukları sadeleştirir, kısaltır; gizli veri kalıbı içeriyorsa null döner
 * (sayac.gizlenen artar).
 * @param {unknown} m @param {{ gizlenen: number }} sayac @param {number} [uzunluk]
 */
function temizMetin(m, sayac, uzunluk = 200) {
  if (typeof m !== 'string') return null;
  const t = m.replace(/\s+/g, ' ').trim().slice(0, uzunluk);
  if (!t) return null;
  if (gizliKalipBul(t)) { sayac.gizlenen++; return null; }
  return t;
}

/** @typedef {import('./paket-olusturucu.d.mts').SecenekGozlemi} SecenekGozlemi */
const SECENEKLI_TIPLER = new Set(['secim', 'radyo', 'okluSecim']);

/**
 * Seçenek gözlemlerinden paketin testVerisi bölümü (yoksa null). Yalnız modelde senaryoda ayarlanan seçim alanları (ya da
 * tıklanınca açılan listesi gözlenen metin alanları); gizli / hassas alanlar ve gizli veri kalıbına benzeyen seçenekler alınmaz.
 * @param {Record<string, any>} model @param {Map<string, string>} anahtardanId ham alan anahtarı → modeldeki alan kimliği
 * @param {SecenekGozlemi[]} gozlemler @param {string[]} bilinmeyenler @param {{ gizlenen: number }} sayac
 */
function testVerisiOlustur(model, anahtardanId, gozlemler, bilinmeyenler, sayac) {
  const alanlar = modelAlanlari(model);
  const temiz = gozlemler.map((g) => ({
    anahtar: g.anahtar, secimler: g.secimler,
    secenekler: g.secenekler.filter((x) => x && x.deger !== '' && !gizliKalipBul(String(x.deger)))
      .map((x) => ({ deger: String(x.deger).slice(0, 200), metin: temizMetin(x.metin, sayac) ?? String(x.deger).slice(0, 200) }))
  })).filter((g) => g.secenekler.length);
  const gozlenen = new Set(temiz.map((g) => g.anahtar));
  /** @type {import('../tablolar/paket-tablolari.d.mts').UretimAlani[]} */
  const uretim = [];
  for (const [anahtar, id] of anahtardanId) {
    const a = alanlar.get(id);
    if (!a || a.yapilandirma !== 'senaryo' || a.hassas === true || (nesneMi(a.eslesme) && a.eslesme.profilHavuzu !== undefined)) continue;
    if (!SECENEKLI_TIPLER.has(a.tip) && !(a.tip === 'metin' && gozlenen.has(anahtar))) continue;
    const secenekler = (Array.isArray(a.secenekler) ? a.secenekler : []).filter(nesneMi).map((x) => ({ deger: String(x.deger), metin: String(x.metin ?? x.deger) }));
    if (secenekler.length < 2 && !gozlenen.has(anahtar)) continue;
    uretim.push({ anahtar, id, etiket: alanEtiketi(a), secenekler });
  }
  if (!uretim.length) return null;
  // Tablo adı "<Ekran adı> — <Alan>" (model adı = ekranın adı: tarama / kayıt metası).
  const { testVerisi, notlar } = secenekTablolariUret({ alanlar: uretim, gozlemler: temiz, ekranAdi: typeof model.ad === 'string' ? model.ad : null });
  bilinmeyenler.push(...notlar);
  return testVerisi;
}

/**
 * Tarama envanterinden seçenek gözlemleri: her profilde ilk ekran (keşfedilen seçimler ilk değerlerinde) ve her keşif
 * değeri (o seçim değiştirilmişken: beliren alanlar, seçenekleri değişen / değişmeyen görünür seçim alanları).
 * @param {import('./paket-olusturucu.d.mts').ProfilEnvanteri[]} profiller @returns {SecenekGozlemi[]}
 */
function taramaGozlemleri(profiller) {
  /** @type {SecenekGozlemi[]} */
  const sonuc = [];
  /** @param {import('./paket-olusturucu.d.mts').HamAlan} a */
  const secenekleri = (a) => a.secenekler ?? (a.radyolar ?? []).map((x) => ({ deger: x.deger, metin: x.metin ?? x.deger }));
  const haric = (/** @type {Record<string, string>} */ o, /** @type {string} */ k) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
  for (const p of profiller) {
    const secimli = p.alanlar.filter((a) => a.secenekler || a.radyolar);
    /** @type {Record<string, string>} */
    const temel = Object.fromEntries(p.kesifler.filter((k) => typeof k.ilkDeger === 'string' && k.ilkDeger !== '').map((k) => [k.secim, /** @type {string} */ (k.ilkDeger)]));
    for (const a of secimli) sonuc.push({ anahtar: a.anahtar, secimler: haric(temel, a.anahtar), secenekler: secenekleri(a) });
    for (const k of p.kesifler) {
      for (const d of k.degerler) {
        if (d.gezinme || d.hata) continue;
        const secimler = { ...temel, [k.secim]: d.deger };
        const kaybolan = new Set(d.kaybolanlar);
        for (const a of secimli) {
          if (a.anahtar === k.secim || kaybolan.has(a.anahtar)) continue;
          sonuc.push({ anahtar: a.anahtar, secimler: haric(secimler, a.anahtar), secenekler: d.secenekler?.[a.anahtar] ?? secenekleri(a) });
        }
        for (const a of d.gorunenler) if (a.secenekler || a.radyolar) sonuc.push({ anahtar: a.anahtar, secimler: haric(secimler, a.anahtar), secenekler: secenekleri(a) });
      }
    }
  }
  return sonuc;
}

/** Seçicileri karşılaştırmak için sadeleştirme (tırnak ve boşluk farkları yok sayılır). @param {string} s */
const seciciNormal = (s) => String(s).replace(/\s+/g, '').replace(/'/g, '"');

/**
 * Ham alan tipi → model tipi. @param {import('./paket-olusturucu.d.mts').HamAlan} a
 * @returns {{ tip: string; not: string | null }}
 */
export function modelTipi(a) {
  switch (a.tur) {
    case 'select': return { tip: 'secim', not: a.coklu ? 'Çoklu seçim listesi (model tek değer bekler; gözden geçirin).' : null };
    case 'number': case 'range': return { tip: 'sayi', not: null };
    case 'date': return { tip: 'tarih', not: null };
    case 'tel': return { tip: 'telefon', not: null };
    case 'checkbox': return { tip: 'onayKutusu', not: null };
    case 'radio': return { tip: 'radyo', not: null };
    case 'file': return { tip: 'dosya', not: null };
    case 'datetime-local': case 'month': case 'week': case 'time':
      return { tip: 'metin', not: `Sayfada "${a.tur}" türünde tarih/saat alanı; model metin olarak doldurur (biçimi gözden geçirin).` };
    default: return { tip: 'metin', not: null };
  }
}

/** accept → modelin tek uzantılı "kabul" alanı (birden çok ya da MIME türüyse null). @param {string | null | undefined} accept */
function kabulUzantisi(accept) {
  if (!accept) return null;
  const parcalar = accept.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return parcalar.length === 1 && /^\.[a-z0-9]{1,10}$/.test(parcalar[0]) ? parcalar[0] : null;
}

/**
 * Alanın temel model kimliği: id → (onay kutusu grubunda ad + değer) → name → etiket → tür.
 * @param {import('./paket-olusturucu.d.mts').HamAlan} a
 */
function temelKimlik(a) {
  if (a.kimlik) return kimlikUret(a.kimlik);
  const grupDegeri = a.grup && a.anahtar.includes('=') ? a.anahtar.slice(a.anahtar.indexOf('=') + 1) : '';
  return kimlikUret(grupDegeri ? `${a.ad} ${grupDegeri}` : a.ad || a.etiket || a.tur, a.tur === 'radio' ? 'secenek' : 'alan');
}

/**
 * Bir profilin keşif verisinden alan görünürlük koşulları: alan anahtarı → { secim, degerler } (alan yalnızca
 * seçim bu değerlerden biri olunca görünür). Birden çok seçime bağlı görünen alanlar notlara yazılır.
 * @param {import('./paket-olusturucu.d.mts').ProfilEnvanteri} p @param {Map<string, import('./paket-olusturucu.d.mts').HamAlan>} hamlar
 * @param {string[]} notlar
 */
function kosullariHesapla(p, hamlar, notlar) {
  /** @type {Map<string, { secim: string; degerler: string[] }>} */
  const sonuc = new Map();
  const temel = new Set(p.alanlar.map((a) => a.anahtar));
  for (const k of p.kesifler) {
    const secim = hamlar.get(k.secim);
    if (!secim || !Array.isArray(secim.secenekler)) continue;
    const tumDegerler = secim.secenekler.map((s) => s.deger).filter((d) => d !== '');
    const denenen = k.degerler.filter((d) => !d.gezinme && !d.hata);
    /** @type {Map<string, Set<string>>} */
    const gorunen = new Map();
    /** @type {Map<string, Set<string>>} */
    const kaybolan = new Map();
    for (const d of denenen) {
      for (const a of d.gorunenler) if (!temel.has(a.anahtar)) (gorunen.get(a.anahtar) ?? gorunen.set(a.anahtar, new Set()).get(a.anahtar))?.add(d.deger);
      for (const anahtar of d.kaybolanlar) if (anahtar !== k.secim) (kaybolan.get(anahtar) ?? kaybolan.set(anahtar, new Set()).get(anahtar))?.add(d.deger);
    }
    const ilk = k.ilkDeger ?? null;
    /** @param {string} anahtar @param {string[]} degerler */
    const yaz = (anahtar, degerler) => {
      const temizDegerler = [...new Set(degerler.filter((d) => d !== ''))];
      if (!temizDegerler.length || temizDegerler.length >= tumDegerler.length) return;
      const onceki = sonuc.get(anahtar);
      if (onceki && onceki.secim !== k.secim) {
        const ad = hamlar.get(anahtar)?.etiket || anahtar;
        notlar.push(`"${ad}" alanının görünürlüğü birden çok seçime bağlı görünüyor; yalnızca ilk seçime ("${hamlar.get(onceki.secim)?.etiket || onceki.secim}") göre koşul yazıldı.`);
        return;
      }
      sonuc.set(anahtar, { secim: k.secim, degerler: temizDegerler });
    };
    for (const [anahtar, degerler] of gorunen) yaz(anahtar, [...degerler]);
    for (const [anahtar, degerler] of kaybolan) {
      const gizli = degerler;
      const gorunurOlduklari = tumDegerler.filter((d) => !gizli.has(d) && (d === ilk || denenen.some((x) => x.deger === d)));
      yaz(anahtar, gorunurOlduklari);
    }
  }
  return sonuc;
}

/**
 * Ham alan → model alanı dönüştürücüsü (otomatik tarama ve akış kaydı ortak). Etiketsiz ve çoklu seçimli alanları
 * bilinmeyenler için toplar; gizli veri kalıbına benzeyen metinleri atar (sayac.gizlenen artar).
 * @param {{ gizlenen: number }} sayac
 */
function alanDonusturucu(sayac) {
  /** @type {string[]} */
  const etiketsizler = [];
  /** @type {string[]} */
  const cokluDegerliler = [];
  /** @param {import('./paket-olusturucu.d.mts').HamAlan} a @param {string} id @returns {Record<string, unknown>} */
  const taslakAlan = (a, id) => {
    const { tip, not } = modelTipi(a);
    const etiket = temizMetin(a.etiket, sayac, 120);
    if (!etiket) etiketsizler.push(id);
    const dokunulmaz = a.devreDisi || a.saltOkunur;
    /** @type {string[]} */
    const alanNotlari = [];
    if (not) alanNotlari.push(not);
    if (a.devreDisi) alanNotlari.push('Taramada devre dışıydı.');
    if (a.saltOkunur) alanNotlari.push('Taramada salt okunurdu.');
    if (a.grup) alanNotlari.push(`"${a.grup}" onay kutusu grubunun parçası.`);
    /** @type {Record<string, unknown>} */
    const alan = { id, tip, etiket: { ekran: etiket } };
    if (tip === 'secim') {
      const secenekler = (a.secenekler ?? []).filter((s) => s.deger !== '').map((s) => ({ deger: String(s.deger).slice(0, 200), metin: temizMetin(s.metin, sayac) ?? String(s.deger).slice(0, 200) }))
        .filter((s) => !gizliKalipBul(s.deger));
      if (a.secenekler && a.secenekler.some((s) => s.deger === '')) alanNotlari.push('Boş değerli ilk seçenek (ör. "Seçiniz") modele yazılmadı.');
      alan.secenekler = secenekler.length ? secenekler : null;
      alan.seceneklerDurumu = secenekler.length ? 'tam' : 'bilinmiyor';
      alan.seceneklerKaynagi = 'otomatik tarama (sayfadaki seçenekler)';
      if (a.coklu) cokluDegerliler.push(etiket || id);
    }
    if (tip === 'radyo') {
      const secenekler = (a.radyolar ?? []).filter((r) => r.deger !== '').map((r) => {
        /** @type {Record<string, unknown>} */
        const s = { deger: String(r.deger).slice(0, 200), metin: temizMetin(r.metin, sayac) ?? String(r.deger).slice(0, 200) };
        if (r.secici) s.secici = r.secici;
        return s;
      }).filter((s) => !gizliKalipBul(String(s.deger)));
      alan.secenekler = secenekler.length ? secenekler : null;
      alan.seceneklerDurumu = secenekler.length ? 'tam' : 'bilinmiyor';
      alan.seceneklerKaynagi = 'otomatik tarama (radyo düğmeleri)';
    }
    alan.zorunlu = a.zorunlu;
    if (dokunulmaz) {
      alan.yapilandirma = 'dokunulmuyor';
    } else {
      alan.yapilandirma = 'senaryo';
      alan.eslesme = { senaryo: id };
    }
    alan.konum = { secici: a.secici, kirilganlik: a.kirilganlik, ...cerceveEki(a.cerceve) };
    // Gizli <select> + görünen aramalı kutu: koşucu kutuya tıklayıp aramayla seçer, olmazsa gizli listeye yazar (ozelSecim).
    if (a.ozelBilesen && tip === 'secim') {
      alan.doldurucu = OZEL_SECIM_DOLDURUCUSU;
      alanNotlari.push('Özel açılır liste (gerçek liste gizli, görünen aramalı kutu): doldurucu "ozelSecim".');
    }
    if (a.cerceve?.length) alanNotlari.push(`Çerçeve (iframe) içinde: ${a.cerceve.join(' › ')}.`);
    if (tip === 'tarih') alan.bicim = 'YYYY-AA-GG';
    if (tip === 'dosya') {
      const kabul = kabulUzantisi(a.kabul);
      if (kabul) alan.kabul = kabul;
      else if (a.kabul) alanNotlari.push(`Kabul edilen dosyalar: ${String(a.kabul).slice(0, 120)}.`);
    }
    if (a.tur === 'password') alan.hassas = true;
    if (alanNotlari.length) alan.notlar = alanNotlari;
    return alan;
  };
  return { taslakAlan, etiketsizler, cokluDegerliler };
}

/**
 * Tarama envanterinden ekran paketi. Paket sayfaPaketiniDogrula'dan geçmelidir (sunucu ayrıca doğrular).
 * @param {import('./paket-olusturucu.d.mts').PaketMetasi} meta
 * @param {import('./paket-olusturucu.d.mts').TaramaEnvanteri} envanter
 * @returns {import('./paket-olusturucu.d.mts').PaketSonucu}
 */
export function taramaPaketiOlustur(meta, envanter) {
  const sayac = { gizlenen: 0 };
  /** @type {string[]} */
  const bilinmeyenler = [AKSIYON_BILINMEYENI];
  /** @type {string[]} */
  const notlar = [];
  const profiller = envanter.profiller;
  const profilAdlari = profiller.map((p) => p.profil).filter((p) => typeof p === 'string' && p !== '');

  // 1) Tüm profillerin alanları (temel + keşifte belirenler) — anahtara göre birleşik; profil başına görülme.
  /** @type {Map<string, import('./paket-olusturucu.d.mts').HamAlan>} */
  const hamlar = new Map();
  /** @type {Map<string, Set<string | null>>} */
  const gorulme = new Map();
  /** @type {Map<string, { baslik: string; anahtarlar: string[] }>} */
  const bolumler = new Map();
  /** @param {import('./paket-olusturucu.d.mts').HamAlan} a @param {string | null} profil */
  const ekle = (a, profil) => {
    if (!hamlar.has(a.anahtar)) {
      hamlar.set(a.anahtar, a);
      const b = bolumler.get(a.bolum.anahtar) ?? bolumler.set(a.bolum.anahtar, { baslik: a.bolum.baslik, anahtarlar: [] }).get(a.bolum.anahtar);
      b?.anahtarlar.push(a.anahtar);
    }
    (gorulme.get(a.anahtar) ?? gorulme.set(a.anahtar, new Set()).get(a.anahtar))?.add(profil);
  };
  for (const p of profiller) {
    for (const a of p.alanlar) ekle(a, p.profil);
    for (const k of p.kesifler) for (const d of k.degerler) for (const a of d.gorunenler) ekle(a, p.profil);
  }

  // 2) Görünürlük koşulları (ilk keşif verisi olan profilden; profiller arasında farklıysa not).
  /** @type {Map<string, { secim: string; degerler: string[] }>} */
  const kosullar = new Map();
  for (const p of profiller) {
    for (const [anahtar, k] of kosullariHesapla(p, hamlar, notlar)) {
      const onceki = kosullar.get(anahtar);
      if (!onceki) kosullar.set(anahtar, k);
      else if (onceki.secim !== k.secim || onceki.degerler.join('\u0000') !== k.degerler.join('\u0000')) {
        notlar.push(`"${hamlar.get(anahtar)?.etiket || anahtar}" alanının görünürlük koşulu bağlam profillerine göre farklı; ilk profildeki koşul yazıldı.`);
      }
    }
  }

  // 3) Taslak alanlar (kimlikler üretilir; mevcut modelle birleştirmede yeniden adlandırılabilir).
  const kullanilan = new Set();
  /** @type {Map<string, string>} ham anahtar → alan kimliği */
  const kimlikler = new Map();
  for (const [anahtar, a] of hamlar) kimlikler.set(anahtar, benzersiz(temelKimlik(a), kullanilan));
  const { taslakAlan, etiketsizler, cokluDegerliler } = alanDonusturucu(sayac);

  // 4) Adlandırılmış koşullar.
  /** @type {Record<string, Record<string, unknown>>} */
  const kosulTanimlari = {};
  /** @type {Map<string, string>} ham anahtar → koşul adı */
  const kosulAdlari = new Map();
  /** @param {Set<string>} mevcutAdlar @param {string} alanId @param {string} anahtar */
  const kosulYaz = (mevcutAdlar, alanId, anahtar) => {
    const k = kosullar.get(anahtar);
    if (!k) return null;
    const secimId = kimlikler.get(k.secim);
    if (!secimId) return null;
    const ad = benzersiz(`${alanId}Gorunur`, mevcutAdlar);
    const secimHam = hamlar.get(k.secim);
    const metinler = k.degerler.map((d) => secimHam?.secenekler?.find((s) => s.deger === d)?.metin || d);
    kosulTanimlari[ad] = {
      aciklama: `${temizMetin(secimHam?.etiket, sayac) || secimId} = ${metinler.map((m) => temizMetin(m, sayac) ?? '?').join(' / ')} seçilince görünür (otomatik tarama keşfi).`,
      ifade: k.degerler.length === 1 ? { alan: secimId, esit: k.degerler[0] } : { alan: secimId, icinde: k.degerler }
    };
    kosulAdlari.set(anahtar, ad);
    return ad;
  };

  // 5) Bağlam profiline göre görünürlük (gözlem).
  /** @param {string} anahtar @returns {Record<string, boolean>} */
  const profilHaritasi = (anahtar) => {
    /** @type {Record<string, boolean>} */
    const h = {};
    const g = gorulme.get(anahtar) ?? new Set();
    for (const p of profilAdlari) h[/** @type {string} */ (p)] = g.has(p);
    return h;
  };

  const urlYolu = meta.urlYolu;
  /** @type {Record<string, unknown>} */
  let model;
  /** @type {string[]} */
  const eslesmeyenler = [];
  let yeniAlanSayisi = 0;
  let eslesenSayisi = 0;

  if (meta.mevcutModel && nesneMi(meta.mevcutModel) && Array.isArray(meta.mevcutModel.adimlar)) {
    // ---- Tekrar analiz: mevcut modeli taban al.
    model = kopya(meta.mevcutModel);
    if (meta.girissiz) model.girisGerekmez = true;
    else delete model.girisGerekmez;
    const adimlar = /** @type {Array<Record<string, any>>} */ (model.adimlar);
    if (!nesneMi(model.kosullar)) model.kosullar = {};
    const kosulAdKumesi = new Set(Object.keys(/** @type {object} */ (model.kosullar)));
    const tumIdler = new Set();
    /** @param {unknown} liste */
    const idTopla = (liste) => {
      for (const a of Array.isArray(liste) ? liste : []) {
        if (!nesneMi(a)) continue;
        if (typeof a.id === 'string') tumIdler.add(a.id);
        idTopla(a.altAlanlar);
        idTopla(a.ekranAlanlari);
      }
    };
    for (const ad of adimlar) for (const b of Array.isArray(ad.bolumler) ? ad.bolumler : []) idTopla(b.alanlar);
    if (nesneMi(model.senaryoDuzeyi)) idTopla(model.senaryoDuzeyi.alanlar);
    // Eşleştirme: mevcut alanın seçicisi taranan alanın aday seçicilerinden biri.
    /** @type {Map<string, { alan: Record<string, any>; bolum: Record<string, any> }>} ham anahtar → mevcut */
    const eslesen = new Map();
    for (const adim of adimlar) {
      for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
        for (const alan of Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
          if (!nesneMi(alan) || !TARANABILIR_TIPLER.has(alan.tip) || !nesneMi(alan.konum) || typeof alan.konum.secici !== 'string') continue;
          const hedef = seciciNormal(alan.konum.secici);
          const bulunan = [...hamlar.values()].find((h) => !eslesen.has(h.anahtar) && cerceveAyni(h.cerceve, alan.konum.cerceve) && [h.secici, ...h.adaySeciciler].some((s) => seciciNormal(s) === hedef));
          if (bulunan) eslesen.set(bulunan.anahtar, { alan, bolum });
          else eslesmeyenler.push(String((nesneMi(alan.etiket) && (alan.etiket.ekran || alan.etiket.form)) || alan.id));
        }
      }
    }
    /** @type {Map<string, string>} modeldeki alan kimliği → ham anahtar (eşleşen ya da yeni eklenen) */
    const modeldekiler = new Map();
    // Eşleşen alanları güncelle.
    for (const [anahtar, { alan }] of eslesen) {
      eslesenSayisi++;
      modeldekiler.set(String(alan.id), anahtar);
      const t = taslakAlan(/** @type {import('./paket-olusturucu.d.mts').HamAlan} */ (hamlar.get(anahtar)), alan.id);
      kimlikler.set(anahtar, alan.id);
      const yeniEtiket = /** @type {{ ekran: string | null }} */ (t.etiket).ekran;
      if (yeniEtiket) alan.etiket = { ...(nesneMi(alan.etiket) ? alan.etiket : {}), ekran: yeniEtiket };
      alan.zorunlu = t.zorunlu;
      if ((alan.tip === 'secim' || alan.tip === 'radyo') && alan.seceneklerDurumu !== 'dinamik' && Array.isArray(t.secenekler)) {
        const eski = Array.isArray(alan.secenekler) ? alan.secenekler.filter(nesneMi) : [];
        alan.secenekler = /** @type {Array<Record<string, unknown>>} */ (t.secenekler).map((s) => {
          const e = eski.find((x) => String(x.deger) === String(s.deger));
          return e ? { ...e, ...(e.metin === null || e.metin === undefined ? {} : { metin: s.metin }) } : s;
        });
      }
    }
    // Koşullar (mevcut alanda görünürlük yoksa) ve yeni alanlar.
    const ilkBolum = adimlar.flatMap((a) => (Array.isArray(a.bolumler) ? a.bolumler : []))[0];
    /** @type {Record<string, any> | null} */
    let sonEslesenBolum = null;
    /** @type {Record<string, any> | null} */
    let sonEslesenAlan = null;
    const sirali = [...bolumler.values()].flatMap((b) => b.anahtarlar);
    for (const anahtar of sirali) {
      const e = eslesen.get(anahtar);
      if (e) {
        sonEslesenBolum = e.bolum;
        sonEslesenAlan = e.alan;
        continue;
      }
      if (!ilkBolum) break;
      const ham = /** @type {import('./paket-olusturucu.d.mts').HamAlan} */ (hamlar.get(anahtar));
      const id = benzersiz(temelKimlik(ham), tumIdler);
      kimlikler.set(anahtar, id);
      modeldekiler.set(id, anahtar);
      const yeni = taslakAlan(ham, id);
      const bolum = sonEslesenBolum ?? ilkBolum;
      const liste = /** @type {Array<Record<string, unknown>>} */ (bolum.alanlar);
      const i = sonEslesenAlan && sonEslesenBolum === bolum ? liste.indexOf(sonEslesenAlan) : -1;
      liste.splice(i >= 0 ? i + 1 : liste.length, 0, yeni);
      sonEslesenAlan = yeni;
      sonEslesenBolum = bolum;
      yeniAlanSayisi++;
    }
    // Görünürlük koşulları (yalnızca görünürlüğü tanımsız alanlara).
    for (const adim of adimlar) {
      for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
        for (const alan of Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
          if (!nesneMi(alan) || alan.gorunurluk) continue;
          const anahtar = modeldekiler.get(String(alan.id));
          if (!anahtar || !kosullar.has(anahtar)) continue;
          const ad = kosulYaz(kosulAdKumesi, String(alan.id), anahtar);
          if (ad) alan.gorunurluk = { kosul: ad };
        }
      }
    }
    Object.assign(/** @type {object} */ (model.kosullar), kosulTanimlari);
    // Bağlam profiline göre görünürlük: mevcut gözlemle birleşir.
    if (profilAdlari.length) {
      const bg = nesneMi(model.baglamGorunurlugu) ? /** @type {Record<string, any>} */ (model.baglamGorunurlugu) : { profiller: [], alanlar: {} };
      bg.profiller = [...new Set([...(Array.isArray(bg.profiller) ? bg.profiller : []), ...profilAdlari])];
      if (!nesneMi(bg.alanlar)) bg.alanlar = {};
      for (const [id, anahtar] of modeldekiler) {
        bg.alanlar[id] = { ...(nesneMi(bg.alanlar[id]) ? bg.alanlar[id] : {}), ...profilHaritasi(anahtar) };
      }
      bg.kaynak = 'otomatik tarama';
      model.baglamGorunurlugu = bg;
    }
    if (eslesmeyenler.length) {
      bilinmeyenler.push(`Mevcut modeldeki ${eslesmeyenler.length} alan taramada görülmedi (başka adımda, koşula bağlı ya da seçicisi değişmiş olabilir; modelden kaldırılmadı): ${eslesmeyenler.slice(0, 15).join(', ')}${eslesmeyenler.length > 15 ? '…' : ''}.`);
    }
  } else {
    // ---- Yeni ekran: tek adımlı taslak model.
    const kosulAdKumesi = new Set();
    const bolumIdleri = new Set();
    /** @type {Array<Record<string, unknown>>} */
    const bolumListesi = [];
    /** @type {Record<string, Record<string, boolean>>} */
    const bgAlanlar = {};
    for (const [, b] of bolumler) {
      const baslik = temizMetin(b.baslik, sayac, 120) || 'Genel';
      const alanlar = b.anahtarlar.map((anahtar) => {
        const a = /** @type {import('./paket-olusturucu.d.mts').HamAlan} */ (hamlar.get(anahtar));
        const id = /** @type {string} */ (kimlikler.get(anahtar));
        const alan = taslakAlan(a, id);
        const ad = kosullar.has(anahtar) ? kosulYaz(kosulAdKumesi, id, anahtar) : null;
        if (ad) alan.gorunurluk = { kosul: ad };
        if (profilAdlari.length) bgAlanlar[id] = profilHaritasi(anahtar);
        return alan;
      });
      if (!alanlar.length) continue;
      bolumListesi.push({ id: benzersiz(kimlikUret(baslik, 'bolum'), bolumIdleri), baslik, alanlar });
    }
    yeniAlanSayisi = hamlar.size;
    const sayfaBasligi = temizMetin(profiller.find((p) => p.baslik)?.baslik, sayac, 120);
    model = {
      semaSurumu: 1, tur: 'ekran', id: meta.ekranAnahtari, ad: meta.ekranAdi, ...(meta.girissiz ? { girisGerekmez: true } : {}),
      aciklama: `"${meta.ekranAdi}" ekranının otomatik taramayla çıkarılan TASLAK modeli (${hamlar.size} alan). Adım/aksiyon tanımları ve iş kuralları yapay zekâ aracınızla ya da akış kaydıyla tamamlanmalı.`,
      ekranUrl: urlYolu,
      specDosyasi: `tests/scenarios/${meta.ekranAnahtari}/${meta.ekranAnahtari}.spec.ts`,
      pageObject: 'yok (model koşucusu)',
      veriKaynaklari: { senaryo: `Nöbetçi > Senaryolar (${meta.ekranAnahtari})` },
      kosullar: kosulTanimlari,
      adimlar: bolumListesi.length ? [{ id: 'form', sira: 1, baslik: sayfaBasligi ? `${sayfaBasligi} formu doldurulur` : `${meta.ekranAdi} formu doldurulur`, bolumler: bolumListesi }] : [],
      senaryoDuzeyi: { alanlar: [] },
      urunDuzeyi: {},
      isKurallari: [],
      bilinmeyenler: [AKSIYON_BILINMEYENI]
    };
    if (profilAdlari.length) model.baglamGorunurlugu = { profiller: profilAdlari, alanlar: bgAlanlar, kaynak: 'otomatik tarama' };
  }

  // 6) Bilinmeyenler.
  for (const p of profiller) {
    const ad = p.profil ? `"${p.profil}" profili` : 'Tarama';
    for (const n of p.notlar) bilinmeyenler.push(`${ad}: ${n}`);
    for (const k of p.kesifler) {
      const secimAdi = hamlar.get(k.secim)?.etiket || k.secim;
      if (k.atlandi) bilinmeyenler.push(`${ad}: "${secimAdi}" keşfedilemedi (${k.atlandi}).`);
      for (const d of k.degerler) {
        if (d.gezinme) bilinmeyenler.push(`${ad}: "${secimAdi}" = "${temizMetin(d.metin, sayac) ?? d.deger}" seçilince sayfa başka bir adrese gitti (${d.gezinme}); bu seçenek için alan keşfi yapılmadı, hedef sayfaya dönüldü.`);
        if (d.hata) bilinmeyenler.push(`${ad}: "${secimAdi}" = "${temizMetin(d.metin, sayac) ?? d.deger}" denenemedi (${d.hata}).`);
      }
      if (!k.atlandi && !k.geriAlindi) bilinmeyenler.push(`${ad}: "${secimAdi}" keşiften sonra ilk değerine geri alınamadı; sonraki gözlemler etkilenmiş olabilir.`);
    }
  }
  for (const h of envanter.hataliProfiller ?? []) bilinmeyenler.push(`"${h.profil ?? '—'}" bağlam profili taranamadı: ${h.mesaj}`);
  const yazma = envanter.engellenenler.filter((e) => e.neden === 'yazma');
  if (yazma.length) {
    const ornekler = [...new Set(yazma.map((e) => `${e.yontem} ${e.adres}`))].slice(0, 5);
    bilinmeyenler.push(`Tarama sırasında ${yazma.length} yazma isteği engellendi (${ornekler.join(', ')}); sayfa alan değişikliklerinde sunucuya veri gönderiyor olabilir (ör. otomatik kaydetme).`);
  }
  const yasakli = envanter.engellenenler.filter((e) => e.neden === 'yasakli');
  if (yasakli.length) bilinmeyenler.push(`Yasaklı adres kalıbına uyan ${yasakli.length} istek engellendi (${[...new Set(yasakli.map((e) => e.adres))].slice(0, 3).join(', ')}).`);
  if (!envanter.kesifYapildi) bilinmeyenler.push('Seçim keşfi kapalıydı: açılır listelere bağlı olarak beliren alanlar ve görünürlük koşulları çıkarılmadı.');
  // Keşif sınırı: taramanın kullandığı (Ayarlar > Koşu > Açılır liste keşif sınırı); eski envanterde yok → varsayılan.
  const kesifSiniri = Number.isInteger(envanter.kesifSecenekSiniri) ? Number(envanter.kesifSecenekSiniri) : KESIF_SECENEK_SINIRI;
  const buyukListeler = [...hamlar.values()].filter((a) => a.tur === 'select' && !a.coklu && (a.secenekler?.length ?? 0) > kesifSiniri);
  if (envanter.kesifYapildi && buyukListeler.length) {
    bilinmeyenler.push(`Keşif sınırından (${kesifSiniri} seçenek) uzun ${buyukListeler.length} liste keşfedilmedi (${buyukListeler.slice(0, 5).map((a) => temizMetin(a.etiket, sayac) ?? a.anahtar).join(', ')}); bu listelere bağlı alanlar olabilir.`);
  }
  if (etiketsizler.length) bilinmeyenler.push(`Etiketi bulunamayan ${etiketsizler.length} alan: ${etiketsizler.slice(0, 10).join(', ')} (etiketi ekrandan kontrol edin).`);
  if (cokluDegerliler.length) bilinmeyenler.push(`Çoklu seçim listeleri: ${cokluDegerliler.join(', ')} — model tek değer bekler.`);
  if (sayac.gizlenen) bilinmeyenler.push(`${sayac.gizlenen} metin gizli/kişisel veri kalıbına (kart, kimlik no, IBAN…) benzediği için pakete yazılmadı.`);
  bilinmeyenler.push(...notlar);

  // 7) Kanıtlar (profil başına görünür alan ekran görüntüsü; en fazla 12, her biri ≤ 4 MB).
  /** @type {Array<{ ad: string; aciklama: string; icerikTuru: 'image/png'; veri: string }>} */
  const kanitlar = [];
  for (const p of profiller) {
    if (!p.ekranGoruntusu || kanitlar.length >= KANIT_EN_COK) continue;
    const tampon = kanitVerisiniCoz(p.ekranGoruntusu);
    if (!tampon || tampon.length > KANIT_BOYUT_SINIRI) { bilinmeyenler.push(`${p.profil ?? 'Tarama'} ekran görüntüsü 4 MB sınırını aştığı için eklenmedi.`); continue; }
    kanitlar.push({
      ad: `${p.profil ? `${p.profil} — ` : ''}${meta.ekranAdi}`.slice(0, 120), icerikTuru: 'image/png', veri: p.ekranGoruntusu,
      aciklama: `Otomatik tarama${p.profil ? `, "${p.profil}" bağlam profili` : ''}, ${p.yol}`.slice(0, 500)
    });
  }

  const olusturulma = meta.olusturulma ?? new Date().toISOString();
  const yazmaSayisi = yazma.length;
  varsayilanAkisiEsitle(model);
  // 8) Test verisi: seçim alanlarının seçenekleri (keşifte değişen bağımlı listeler dahil) → tablolar + alan bağlantıları.
  const testVerisi = testVerisiOlustur(model, kimlikler, taramaGozlemleri(profiller), bilinmeyenler, sayac);
  const paket = {
    tur: SAYFA_PAKETI_TURU,
    surum: SAYFA_PAKETI_SURUMU,
    meta: {
      ...(meta.proje ? { proje: meta.proje } : {}),
      ekran: { anahtar: meta.ekranAnahtari, ad: meta.ekranAdi, urlYolu },
      olusturan: TARAMA_OLUSTURANI,
      olusturulma,
      baglamProfilleri: profilAdlari,
      not: `Sayfa Nöbetçi tarafından otomatik tarandı: yalnızca okundu, hiçbir form gönderilmedi, düğme/bağlantıya tıklanmadı; tarama sırasında yazma istekleri engellendi (${yazmaSayisi}).`
    },
    model,
    senaryoOnerileri: [],
    gerekenAyarlar: {
      girisGerekli: meta.girisGerekli, ikiAsamaliDogrulama: meta.ikiAsamali, captchaGoruldu: false, testVerisiTurleri: [],
      ...(meta.baglamTuru && profilAdlari.length ? { baglamTurleri: [meta.baglamTuru] } : {})
    },
    bilinmeyenler: [...new Set(bilinmeyenler)],
    ...(kanitlar.length ? { kanitlar } : {}),
    ...(testVerisi ? { testVerisi } : {})
  };
  return {
    paket,
    ozet: {
      alanSayisi: hamlar.size, kosulSayisi: Object.keys(kosulTanimlari).length, yeniAlanSayisi, eslesenSayisi,
      eslesmeyenSayisi: eslesmeyenler.length, engellenenYazma: yazmaSayisi, kanitSayisi: kanitlar.length
    }
  };
}

// ---------------------------------------------------------------------------------------
// AKIŞ KAYDI → EKRAN PAKETİ ("Akışı kaydet")
// ---------------------------------------------------------------------------------------

export const KAYIT_OLUSTURANI = 'Nöbetçi akış kaydı';

/** Çoklu akış: tarama / kayıt varsayılan akışı (model.adimlar) günceller; akislar içindeki kopyası eşitlenir. @param {Record<string, any>} model */
function varsayilanAkisiEsitle(model) {
  if (nesneMi(model) && Array.isArray(model.akislar)) model.akislar = model.akislar.map((/** @type {unknown} */ a) => (nesneMi(a) && a.varsayilan === true ? { ...a, adimlar: model.adimlar } : a));
}

/**
 * Seçime göre görünürlük: hedef alan okumaların bazılarında görünüp bazılarında görünmüyorsa ve bu okumalar arasında değeri
 * AYRIŞAN tek bir seçim alanı varsa { secim, degerler } (hedef, seçimin bu değerlerinde görünür). Seçimin görünmediği / boş
 * olduğu okumalar o aday için yok sayılır. Birden çok aday: 'coklu'; aday yoksa null.
 * @param {Array<{ gorunen: string[]; secimler: Record<string, string> }>} okumalar @param {string} hedef
 * @param {string[]} adaylar seçim alanlarının anahtarları @param {(anahtar: string) => Set<string>} gecerliDegerler
 * @returns {{ secim: string; degerler: string[] } | 'coklu' | null}
 */
export function secimKosuluCikar(okumalar, hedef, adaylar, gecerliDegerler) {
  const gorulen = okumalar.filter((o) => o.gorunen.includes(hedef));
  const gorulmeyen = okumalar.filter((o) => !o.gorunen.includes(hedef));
  if (!gorulen.length || !gorulmeyen.length) return null;
  const bulunan = adaylar.filter((c) => c !== hedef).flatMap((c) => {
    const gecerli = gecerliDegerler(c);
    const degerler = (/** @type {typeof okumalar} */ liste) => liste.map((o) => o.secimler[c]).filter((x) => typeof x === 'string' && gecerli.has(x));
    const v = degerler(gorulen);
    const n = degerler(gorulmeyen);
    if (!v.length || !n.length) return [];
    const vk = new Set(v);
    return n.some((x) => vk.has(x)) ? [] : [{ secim: c, degerler: [...vk] }];
  });
  return bulunan.length === 1 ? bulunan[0] : bulunan.length > 1 ? 'coklu' : null;
}

/**
 * Başarı göstergesinin SABİT kısmı: rakam içeren ilk kelimeden öncesi (kayıt/başvuru numarası, tarih, tutar her koşuda değişir),
 * sondaki noktalama atılır. 3 karakterden kısa kalırsa null (gösterge "öğe görünür" olur).
 * @param {string | null} m
 */
export function sabitGostergeMetni(m) {
  if (!m) return null;
  // Rakam içeren ilk kelimeden itibaren (ör. "No: SP-1003", "12.05.2026") değişken kabul edilir.
  const i = m.search(/[^\s:;,()]*\d/);
  const s = (i >= 0 ? m.slice(0, i) : m).replace(/[\s:;,.#№(\-–—]+$/u, '').trim();
  return s.length >= 3 ? s : null;
}

/**
 * Korunan parçanın ('ek': akış diyagramında düzenlenemeyen) özelliklerini kurulan adıma AYNEN yazar: adım özellikleri
 * (görünürlük, kod yöntemi), bölüm özellikleri (aynı kimlikli bölüme) ve gösterilemeyen alanlar (aynı kimlikli bölüme — yoksa
 * aynı başlıklıya, o da yoksa yeni bölüme — önceki alanın ardına; önceki alan yoksa bölümün başına).
 * @param {Record<string, any>} adim @param {Extract<import('./paket-olusturucu.d.mts').KorunanParca, { tur: 'ek' }>} k @param {Set<string>} bolumIdleri
 */
function korunanlariYaz(adim, k, bolumIdleri) {
  if (k.adimEk) Object.assign(adim, kopya(k.adimEk));
  /** @type {Array<{ id: string; baslik: string; alanlar: Array<Record<string, unknown>> }>} */
  const bolumler = adim.bolumler;
  for (const ka of k.alanlar ?? []) {
    let b = bolumler.find((x) => x.id === ka.bolum.id) ?? bolumler.find((x) => x.baslik === ka.bolum.baslik && x.baslik !== 'İşlemler');
    if (!b) {
      const id = bolumIdleri.has(ka.bolum.id) ? benzersiz(kimlikUret(ka.bolum.baslik || 'bolum', 'bolum'), bolumIdleri) : ka.bolum.id;
      bolumIdleri.add(id);
      b = { id, baslik: ka.bolum.baslik || 'Genel', alanlar: [] };
      // İşlemler bölümünden önce.
      const islem = bolumler.findIndex((x) => x.baslik === 'İşlemler');
      if (islem >= 0) bolumler.splice(islem, 0, b); else bolumler.push(b);
    }
    const yer = ka.onceki === null ? 0 : b.alanlar.findIndex((x) => x.id === ka.onceki) + 1;
    b.alanlar.splice(yer > 0 || ka.onceki === null ? yer : b.alanlar.length, 0, kopya(ka.alan));
  }
  for (const [id, ozellik] of Object.entries(k.bolumEk ?? {})) {
    const b = bolumler.find((x) => x.id === id);
    if (b) Object.assign(b, kopya(ozellik));
  }
}

/**
 * Akış kaydından ekran paketi (model şema sürümü 2: adım koşu tanımlarıyla). Adımlar kullanıcının kaydettiği sırayla ve
 * adlarıyla gelir; her adımın alanları kullanıcının seçtikleridir. Adımın koşu tanımı:
 *   aksiyonlar       ilerleme düğmesine tıkla (kaydedildiyse),
 *   basariGostergesi sonraki adımın ilk alanı (yoksa ilerleme düğmesi) görünür; son adımda kullanıcının seçtiği
 *                    başarı göstergesi (metin ya da öğe).
 * Mevcut ekran: aynı seçicili alanların KİMLİĞİ ve eklenmiş bilgileri (seçenekler, görünürlük, eşleşme, notlar) korunur
 * — senaryo verileri bozulmaz; kayıtta olmayan alanlar yeni modelde yer almaz (Bulgular'da "kaldırıldı" görünür, kullanıcı
 * reddedebilir). Artık var olmayan alan/adımlara başvuran koşullar ve iş kuralları çıkarılır (bilinmeyenlere yazılır).
 * Alan DEĞERİ ve ekran görüntüsü YOKTUR.
 * @param {import('./paket-olusturucu.d.mts').PaketMetasi} meta
 * @param {import('./paket-olusturucu.d.mts').KayitEnvanteri} envanter
 * @returns {import('./paket-olusturucu.d.mts').PaketSonucu}
 */
export function kayitPaketiOlustur(meta, envanter) {
  const sayac = { gizlenen: 0 };
  const { taslakAlan, etiketsizler, cokluDegerliler } = alanDonusturucu(sayac);
  /** @type {string[]} */
  const bilinmeyenler = [];
  const mevcut = meta.mevcutModel && nesneMi(meta.mevcutModel) && Array.isArray(meta.mevcutModel.adimlar) ? kopya(meta.mevcutModel) : null;

  // Mevcut modelin alanları (seçiciyle eşleştirme için). Çoklu akışta DİĞER akışların adımları da (kimliğe göre tekil):
  // ortak alanlar yeniden kullanılır, kimlikleri çakışmaz, onların koşulları / iş kuralları silinmez.
  /** @param {Array<Record<string, any>>} adimlar */
  const adimAlanlari = (adimlar) => adimlar.filter(nesneMi).flatMap((adim) => (Array.isArray(adim.bolumler) ? adim.bolumler : [])
    .flatMap((/** @type {Record<string, any>} */ b) => (Array.isArray(b.alanlar) ? b.alanlar : []).filter((/** @type {unknown} */ a) => nesneMi(a) && typeof a.id === 'string')));
  /** @type {Array<Record<string, any>>} */
  const anaAlanlar = mevcut ? adimAlanlari(/** @type {Array<Record<string, any>>} */ (mevcut.adimlar)) : [];
  const anaAdimIdleri = new Set(mevcut ? /** @type {Array<Record<string, any>>} */ (mevcut.adimlar).filter(nesneMi).map((a) => String(a.id)) : []);
  /** @type {Array<Record<string, any>>} */
  const digerAdimlar = mevcut && Array.isArray(mevcut.akislar)
    ? mevcut.akislar.filter(nesneMi).flatMap((/** @type {Record<string, any>} */ a) => (Array.isArray(a.adimlar) ? a.adimlar : []))
      .filter((/** @type {unknown} */ a) => nesneMi(a) && !anaAdimIdleri.has(String(/** @type {Record<string, any>} */ (a).id)))
    : [];
  const anaAlanIdleri = new Set(anaAlanlar.map((a) => String(a.id)));
  const digerAlanlar = adimAlanlari(digerAdimlar).filter((a, i, l) => !anaAlanIdleri.has(String(a.id)) && l.findIndex((x) => x.id === a.id) === i);
  /** @type {Array<Record<string, any>>} */
  const mevcutAlanlar = [...anaAlanlar, ...digerAlanlar];
  // Mevcut kimlikler ayrılır: yeni alan/düğme kimlikleri eşleşmeyen eski bir alanın kimliğini almaz.
  const kullanilanIdler = new Set([
    ...mevcutAlanlar.map((a) => String(a.id)),
    ...(mevcut && nesneMi(mevcut.senaryoDuzeyi) && Array.isArray(mevcut.senaryoDuzeyi.alanlar)
      ? mevcut.senaryoDuzeyi.alanlar.filter(nesneMi).map((/** @type {Record<string, any>} */ a) => String(a.id)) : [])
  ]);
  // Giriş tarifi bağlam değiştiriyorsa senaryonun bağlam profili seçilebilmeli (model koşucusu profili bu alandan alır);
  // varsayılanı kaydın yapıldığı profildir. Mevcut modelde profil havuzlu bir alan varsa o korunur.
  const profilAlaniVar = mevcut && nesneMi(mevcut.senaryoDuzeyi) && Array.isArray(mevcut.senaryoDuzeyi.alanlar)
    && mevcut.senaryoDuzeyi.alanlar.some((/** @type {unknown} */ a) => nesneMi(a) && nesneMi(a.eslesme) && typeof a.eslesme.profilHavuzu === 'string');
  /** @type {Record<string, unknown> | null} */
  const baglamAlani = meta.baglamTuru && !profilAlaniVar ? {
    id: benzersiz('baglamProfili', kullanilanIdler), tip: 'secim', etiket: { ekran: null, form: meta.baglamTuru }, zorunlu: false, yapilandirma: 'senaryo',
    eslesme: { senaryo: 'baglamProfili', profilHavuzu: meta.baglamTuru },
    ...(envanter.profil ? { varsayilan: { deger: envanter.profil } } : {})
  } : null;
  const eslesenMevcut = new Set();
  /** İşlemler öğesi (düğme / sonuç): mevcut modelde aynı tip + seçicili öğe varsa kimliği korunur. @param {string} tip @param {string} secici @param {string} temel */
  const islemKimligi = (tip, secici, temel) => {
    const e = mevcutAlanlar.find((a) => !eslesenMevcut.has(a) && a.tip === tip && nesneMi(a.konum) && a.konum.secici === secici);
    if (e) { eslesenMevcut.add(e); return String(e.id); }
    return benzersiz(temel, kullanilanIdler);
  };
  let yeniAlanSayisi = 0;
  let eslesenSayisi = 0;
  /** Ham alan anahtarı → modeldeki alan nesnesi (seçime göre görünürlük koşulları için). @type {Map<string, Record<string, any>>} */
  const hamdanModel = new Map();
  /** @param {import('./paket-olusturucu.d.mts').HamAlan} h @returns {Record<string, unknown>} */
  const modelAlani = (h) => {
    const alan = modelAlaniKur(h);
    // Akışta "zorunlu": senaryoda değer şart ve koşuda ekranda görünmezse test başarısız (koşullu alanda koşul sağlanınca).
    if (h.zorunlu) alan.mutlakaGorunmeli = true;
    else delete alan.mutlakaGorunmeli;
    // Akışta "Doldurduktan sonra" tuşu (doldurucuParametreleri.tus): null kaldırır, verilmezse mevcut tanımınki korunur.
    if (h.tus !== undefined && !(h.tur === 'kimlik' && h.anahtar.startsWith('kimlik:'))) {
      const p = nesneMi(alan.doldurucuParametreleri) ? { ...alan.doldurucuParametreleri } : {};
      if (h.tus) p.tus = h.tus; else delete p.tus;
      if (Object.keys(p).length) alan.doldurucuParametreleri = p; else delete alan.doldurucuParametreleri;
    }
    hamdanModel.set(h.anahtar, alan);
    return alan;
  };
  /** @param {import('./paket-olusturucu.d.mts').HamAlan} h @returns {Record<string, unknown>} */
  const modelAlaniKur = (h) => {
    // Kimlik bloğu (diyagramda "kimlik:<id>"): mevcut modeldeki tanımı olduğu gibi (alt alanlar, profil havuzu…).
    if (h.tur === 'kimlik' && h.anahtar.startsWith('kimlik:')) {
      const e = mevcutAlanlar.find((a) => !eslesenMevcut.has(a) && a.tip === 'kimlikProfili' && `kimlik:${a.id}` === h.anahtar);
      if (e) { eslesenMevcut.add(e); eslesenSayisi++; kullanilanIdler.add(String(e.id)); return { ...e }; }
    }
    const adaylar = new Set([h.secici, ...h.adaySeciciler].map(seciciNormal));
    const e = mevcutAlanlar.find((a) => !eslesenMevcut.has(a) && (TARANABILIR_TIPLER.has(a.tip) || a.tip === 'okluSecim') && nesneMi(a.konum) && typeof a.konum.secici === 'string'
      && cerceveAyni(a.konum.cerceve, h.cerceve) && adaylar.has(seciciNormal(a.konum.secici)));
    if (e) {
      eslesenMevcut.add(e);
      eslesenSayisi++;
      kullanilanIdler.add(String(e.id));
      const t = taslakAlan(h, String(e.id));
      const yeniEtiket = /** @type {{ ekran: string | null }} */ (t.etiket).ekran;
      // Ekrandaki etiket yalnızca mevcut tanımda ekran etiketi varsa güncellenir (yalnızca form etiketi olan alan değişmez).
      const etiketGuncelle = yeniEtiket && (!nesneMi(e.etiket) || typeof e.etiket.ekran === 'string');
      /** @type {Record<string, unknown>} */
      const sonuc = { ...e, ...(etiketGuncelle ? { etiket: { ...(nesneMi(e.etiket) ? e.etiket : {}), ekran: yeniEtiket } } : {}) };
      // Senaryoda zorunluluk mevcut tanımdan (modelden gelen akışta sayfa "required" bilgisi yok); senaryo alanında yoksa sayfanınki.
      if (typeof e.zorunlu !== 'boolean' && e.yapilandirma === 'senaryo') sonuc.zorunlu = t.zorunlu;
      // Özel açılır liste: mevcut tanımda doldurucu yoksa önerilen doldurucu eklenir (kullanıcının seçtiği doldurucu korunur).
      if (h.ozelBilesen && e.tip === 'secim' && e.doldurucu === undefined) sonuc.doldurucu = OZEL_SECIM_DOLDURUCUSU;
      return sonuc;
    }
    yeniAlanSayisi++;
    return taslakAlan(h, benzersiz(temelKimlik(h), kullanilanIdler));
  };

  // Adımlar. Hiçbir şey kaydedilmemiş adım (alan, ilerleme/alan açan düğme, son adımda gösterge yok) atlanır.
  const kayitlar = envanter.adimlar.filter((k, i, tum) => {
    const dolu = Boolean(k.ortakAkis) || Boolean(k.sqlKontrolu) || Boolean(k.dosyaKontrolu) || Boolean(k.yenidenGiris) || k.alanlar.length > 0 || Boolean(k.ilerleme) || Boolean(k.acicilar?.length) || (i === tum.length - 1 && Boolean(envanter.basariGostergesi))
      || Boolean(k.korunanAdim) || Boolean(k.korunanlar?.some(Boolean)) || Boolean(k.aksiyonlarAynen);
    if (!dolu) bilinmeyenler.push(`"${temizMetin(k.ad, sayac, 120) || `${i + 1}. adım`}" adımında alan, ilerleme düğmesi ya da gösterge kaydedilmediği için modele eklenmedi.`);
    return dolu;
  });

  // Alt adımlar. Model koşucusu bir adımda önce alanları doldurur, sonra düğmelere basar; bu yüzden alan AÇAN düğmesi olan
  // adım parçalara bölünür: [ilk alanlar] → [düğme] → [açılan alanlar] … → [ilerleme]. "Her senaryoda basılmaz" işaretli
  // düğmenin parçaları senaryo ayarına ("“<düğme>” dahil") bağlı isteğe bağlı adımlardır (senaryo formunda onay kutusu).
  // Korunan parçalar (akış diyagramında düzenlenemeyen; akis-servisi.mjs): korunanAdim adımın tamamı aynen, korunan ('ek')
  // parçanın gösterilemeyen özellikleri aynen geri yazılır (kimliğiyle), aksiyonlarAynen koşu aksiyonlarının yerine geçer.
  // korunanKosul: parçanın korunan görünürlüğü (sonraki adımın göstergesi seçilirken atlanabilir adım sayılır).
  /** @typedef {{ ad: string; alanlar: import('./paket-olusturucu.d.mts').HamAlan[]; tikla: import('./paket-olusturucu.d.mts').KayitOgesi | null; kosul: string | null; gosterge?: import('./paket-olusturucu.d.mts').KayitGostergesi | null; uyarilar?: import('./paket-olusturucu.d.mts').KayitGostergesi[]; zamanAsimiSn?: number; ekranGoruntusu?: boolean; once?: number; sonra?: number; ortakAkis?: string; sqlKontrolu?: import('../sql/sql-adimi.mjs').SqlTanimi; dosyaKontrolu?: import('../dosyalar/dosya-icerigi.mjs').DosyaTanimi; yenidenGiris?: { profil?: string }; korunanAdim?: Record<string, any>; korunan?: Extract<import('./paket-olusturucu.d.mts').KorunanParca, { tur: 'ek' }>; aksiyonlarAynen?: Array<Record<string, unknown>>; korunanKosul?: string | null }} AltAdim */
  /** Korunan parçanın görünürlüğü (karşılaştırma anahtarı) ya da null. @param {unknown} p */
  const korunanKosulu = (p) => {
    const g = nesneMi(p) && nesneMi(p.adimEk) ? p.adimEk.gorunurluk : undefined;
    return nesneMi(g) ? JSON.stringify(g) : null;
  };
  /** 'ek' türündeki korunan parça (değilse undefined). @param {unknown} p */
  const ekParca = (p) => (nesneMi(p) && p.tur === 'ek' ? /** @type {Extract<import('./paket-olusturucu.d.mts').KorunanParca, { tur: 'ek' }>} */ (p) : undefined);
  const kosulAdlari = new Set(mevcut && nesneMi(mevcut.kosullar) ? Object.keys(mevcut.kosullar) : []);
  /** @type {Record<string, Record<string, unknown>>} */
  const yeniKosullar = {};
  /** @type {Array<Record<string, unknown>>} */
  const ayarAlanlari = [];
  /** @type {AltAdim[]} */
  const altAdimlar = [];
  /**
   * "“<ad>” dahil" senaryo ayarı ve koşulu (isteğe bağlı düğme / ortak akış). Mevcut modelde aynı etiketli ayar ve koşulu
   * varsa yeniden kullanılır (akış kopyası / yeniden kayıt: senaryoların ayar değeri korunur, formda iki kez görünmez).
   * @param {string} etiket @param {string} temel kimlik öneki @returns {string} koşul adı
   */
  const dahilKosulu = (etiket, temel) => {
    const form = `“${etiket}” dahil`;
    const sdMevcut = mevcut && nesneMi(mevcut.senaryoDuzeyi) && Array.isArray(mevcut.senaryoDuzeyi.alanlar) ? mevcut.senaryoDuzeyi.alanlar : [];
    const eskiAyar = sdMevcut.find((/** @type {Record<string, any>} */ x) => nesneMi(x) && x.tip === 'onayKutusu' && nesneMi(x.etiket) && x.etiket.form === form);
    const eskiKosul = eskiAyar && mevcut && nesneMi(mevcut.kosullar)
      ? Object.keys(mevcut.kosullar).find((k) => nesneMi(mevcut.kosullar[k]?.ifade) && mevcut.kosullar[k].ifade.senaryoAyari === eskiAyar.id && mevcut.kosullar[k].ifade.esit === true)
      : undefined;
    if (eskiAyar && eskiKosul) {
      yeniKosullar[eskiKosul] = mevcut.kosullar[eskiKosul];
      return eskiKosul;
    }
    const ayar = benzersiz(`${kimlikUret(etiket, temel)}Dahil`, kullanilanIdler);
    const kosul = benzersiz(`${ayar}Kosulu`, kosulAdlari);
    yeniKosullar[kosul] = { aciklama: `“${etiket}” senaryoda seçildiyse (akış kaydı).`, ifade: { senaryoAyari: ayar, esit: true } };
    ayarAlanlari.push({ id: ayar, tip: 'onayKutusu', etiket: { ekran: null, form }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: ayar } });
    return kosul;
  };
  for (const [i, k] of kayitlar.entries()) {
    const ad = temizMetin(k.ad, sayac, 120) || `${i + 1}. adım`;
    if (k.ortakAkis) {
      // Ortak akış adımı: alanı yok; koşuda ortak akışın adımlarıyla açılır.
      altAdimlar.push({ ad, alanlar: [], tikla: null, kosul: k.ortakAkis.istegeBagli ? dahilKosulu(ad, 'ortakAkis') : null, ortakAkis: k.ortakAkis.dosya });
      continue;
    }
    if (k.sqlKontrolu) {
      // SQL sorgusu adımı: alanı / düğmesi yok; koşuda veritabanı sorgusu beklenenle karşılaştırılır.
      altAdimlar.push({ ad, alanlar: [], tikla: null, kosul: null, sqlKontrolu: k.sqlKontrolu });
      continue;
    }
    if (k.dosyaKontrolu) {
      // İndirilen dosyayı doğrulama adımı: alanı yok; koşuda tetikleyici düğmeye basılır, indirilen dosya doğrulanır.
      altAdimlar.push({ ad, alanlar: [], tikla: null, kosul: null, dosyaKontrolu: k.dosyaKontrolu });
      continue;
    }
    if (k.yenidenGiris) {
      // Yeniden giriş adımı: alanı / düğmesi yok; koşuda oturum kapatılıp ortamın tarifiyle yeniden girilir.
      altAdimlar.push({ ad, alanlar: [], tikla: null, kosul: null, yenidenGiris: typeof k.yenidenGiris.profil === 'string' && k.yenidenGiris.profil ? { profil: k.yenidenGiris.profil } : {} });
      continue;
    }
    if (k.korunanAdim) {
      // Akış diyagramında düzenlenemeyen adım: modeldeki tanımı aynen (yalnız sırası değişir).
      altAdimlar.push({ ad, alanlar: [], tikla: null, kosul: null, korunanAdim: k.korunanAdim, korunanKosul: nesneMi(k.korunanAdim.gorunurluk) ? JSON.stringify(k.korunanAdim.gorunurluk) : null });
      continue;
    }
    const parca = (/** @type {number} */ j) => k.alanlar.filter((_, x) => (k.parcalar?.[x] ?? 0) === j);
    /** Parçanın korunan özellikleri (varsa). @param {unknown} p */
    const korunanEk = (p) => { const e = ekParca(p); return e ? { korunan: e, korunanKosul: korunanKosulu(e) } : {}; };
    /** @type {AltAdim[]} */
    const parcalar = [{ ad, alanlar: parca(0), tikla: null, kosul: null, ...korunanEk(k.korunanlar?.[0]) }];
    for (const [j, a] of (k.acicilar ?? []).entries()) {
      const dugme = temizMetin(a.metin, sayac, 80) || 'alan açan düğme';
      /** @type {string | null} */
      let kosul = null;
      if (a.secimli) {
        kosul = dahilKosulu(dugme, 'ekAdim');
      }
      parcalar.push({ ad: `${ad}: ${dugme}`, alanlar: [], tikla: a, kosul, once: a.onceBekle, sonra: a.sonraBekle, ...korunanEk(a.korunan) });
      parcalar.push({ ad: `${ad}: ${dugme} sonrası`, alanlar: parca(j + 1), tikla: null, kosul, ...korunanEk(k.korunanlar?.[j + 1]) });
    }
    if (k.ilerleme) {
      const son = parcalar[parcalar.length - 1];
      // İlerleme, isteğe bağlı olmayan son parçaya eklenir; isteğe bağlıysa (atlanabilir) ayrı bir adım olur.
      const sure = k.zamanAsimiSn ? { zamanAsimiSn: k.zamanAsimiSn } : {};
      if (!son.tikla && !son.kosul && (son.alanlar.length || parcalar.length === 1)) Object.assign(son, { tikla: k.ilerleme, gosterge: k.gosterge ?? null, once: k.onceBekle, sonra: k.sonraBekle, ...sure });
      else parcalar.push({ ad: `${ad}: ${temizMetin(k.ilerleme.metin, sayac, 80) || 'ilerle'}`, alanlar: [], tikla: k.ilerleme, kosul: null, gosterge: k.gosterge ?? null, once: k.onceBekle, sonra: k.sonraBekle, ...sure });
    } else if (k.onceBekle) {
      // Düğmesiz adımda bekleme: alanlar doldurulduktan (son parçanın düğmesi varsa ona basıldıktan) sonra.
      const son = [...parcalar].reverse().find((p) => p.alanlar.length || p.tikla) ?? parcalar[0];
      if (son.tikla) son.sonra = (son.sonra ?? 0) + k.onceBekle;
      else son.once = (son.once ?? 0) + k.onceBekle;
    }
    // Düğmesiz adımın beklenen mesajı (akışta alan grubundan sonra; alandan çıkınca beklenir) adımın son parçasına bağlanır.
    const alanSonrasiMesaj = !k.ilerleme && Boolean(k.gosterge || k.uyarilar?.length);
    if (!k.ilerleme && i < kayitlar.length - 1 && !alanSonrasiMesaj) {
      bilinmeyenler.push(`"${ad}" adımının ilerleme düğmesi kaydedilmedi; model koşucusu bu adımdan sonrakine geçemez (modelde "kosu.aksiyonlar" ekleyin ya da akışı yeniden kaydedin).`);
    }
    // Korunan aksiyonlar: ilerleme parçasına (düğmesizse alanı / düğmesi olan son parçaya) — oradaki düğme ve beklemelerin yerine.
    if (k.aksiyonlarAynen) {
      const hedef = (k.ilerleme ? parcalar.find((p) => p.tikla === k.ilerleme) : undefined)
        ?? [...parcalar].reverse().find((p) => p.alanlar.length || p.tikla || p.korunan) ?? parcalar[0];
      hedef.aksiyonlarAynen = k.aksiyonlarAynen;
    }
    // Boş parçalar (alan da düğme de yok) atılır; adımın hiç parçası kalmazsa (yalnızca gösterge) ilk parça kalır.
    const dolu = parcalar.filter((p) => p.alanlar.length || p.tikla || p.once || p.korunan || p.aksiyonlarAynen);
    const eklenen = dolu.length ? dolu : [parcalar[0]];
    // Kabul edilen uyarılar: ilerleme düğmesinin parçasına (düğme yoksa son parçaya).
    if (k.uyarilar?.length) (eklenen.find((p) => k.ilerleme && p.tikla === k.ilerleme) ?? eklenen[eklenen.length - 1]).uyarilar = k.uyarilar;
    if (!k.ilerleme && k.gosterge) eklenen[eklenen.length - 1].gosterge = k.gosterge;
    // "Ekran görüntüsü al" (akış tasarımı): adımın sonu — ilerleme düğmesinin parçası (düğme yoksa son parça).
    if (k.ekranGoruntusu) (eklenen.find((p) => k.ilerleme && p.tikla === k.ilerleme) ?? eklenen[eklenen.length - 1]).ekranGoruntusu = true;
    altAdimlar.push(...eklenen);
  }

  // Başarı göstergesinde aranan metin: kullanıcının belirlediği (null: yalnızca öğe görünür); belirlemediyse öneri
  // (metnin sabit kısmı — ilk rakamdan öncesi).
  const g = envanter.basariGostergesi;
  /** @param {import('./paket-olusturucu.d.mts').KayitGostergesi} x */
  const sonMetni = (x) => x.aranan === null ? null
    : typeof x.aranan === 'string' ? temizMetin(x.aranan, sayac, 200) : sabitGostergeMetni(temizMetin(x.metin, sayac, 200));
  const gostergeMetni = g ? sonMetni(g) : null;
  /** Gösterge + "veya" seçenekleri → tek gösterge ya da { tur: 'veya', secenekler }. @param {import('./paket-olusturucu.d.mts').KayitGostergesi} x @param {(y: import('./paket-olusturucu.d.mts').KayitGostergesi) => Record<string, unknown> | null} tek */
  const basariTanimi = (x, tek) => {
    const liste = [x, ...(x.veya ?? [])].map(tek).filter((y) => y !== null);
    return liste.length > 1 ? { tur: 'veya', secenekler: liste } : liste[0] ?? null;
  };

  /** Bölüm kimlikleri modelin tamamında tekildir. */
  const bolumIdleri = new Set();
  const adimIdleri = new Set();
  /** Adım kimliği: mevcut modelde aynı başlıklı adımın kimliği (senaryoların beklenen hata adımı bozulmasın), yoksa yeni. @param {string} baslik */
  const adimKimligi = (baslik) => {
    const eski = mevcut ? /** @type {Array<Record<string, any>>} */ (mevcut.adimlar).find((a) => nesneMi(a) && a.baslik === baslik && typeof a.id === 'string' && !adimIdleri.has(a.id)) : undefined;
    if (eski) { adimIdleri.add(eski.id); return String(eski.id); }
    return benzersiz(kimlikUret(baslik, 'adim'), adimIdleri);
  };
  /**
   * Adımın sayfadaki ilk öğesinin seçicisi (önceki adımın başarı göstergesi): ilk alan; kimlik bloğunda (diyagram anahtarı
   * "kimlik:<id>" seçici değildir) ilk alt alanın seçicisi; alan yoksa düğme.
   * @param {AltAdim} x @returns {string | null}
   */
  const ilkSecici = (x) => {
    for (const h of x.alanlar) {
      // Özel açılır listenin gerçek <select>'i gizlidir (görünür beklenemez): sonraki alan aranır.
      if (h.ozelBilesen) continue;
      if (!(h.tur === 'kimlik' && h.anahtar.startsWith('kimlik:'))) return { secici: h.secici, ...cerceveEki(h.cerceve) };
      const e = mevcutAlanlar.find((a) => a.tip === 'kimlikProfili' && `kimlik:${a.id}` === h.anahtar);
      const alt = e && Array.isArray(e.altAlanlar) ? e.altAlanlar.find((/** @type {any} */ y) => nesneMi(y) && nesneMi(y.konum) && typeof y.konum.secici === 'string' && y.konum.secici) : undefined;
      if (alt) return { secici: String(alt.konum.secici), ...cerceveEki(alt.konum.cerceve) };
    }
    if (x.tikla) return { secici: x.tikla.secici, ...cerceveEki(x.tikla.cerceve) };
    if (x.korunanAdim) {
      // Korunan adım: ilk seçicili alanı (özel açılır liste hariç), yoksa ilk tıklanan düğmesi; alt model adımında yok.
      for (const b of Array.isArray(x.korunanAdim.bolumler) ? x.korunanAdim.bolumler : []) {
        for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
          if (nesneMi(a) && a.doldurucu !== OZEL_SECIM_DOLDURUCUSU && nesneMi(a.konum) && typeof a.konum.secici === 'string' && a.konum.secici) return { secici: a.konum.secici, ...cerceveEki(a.konum.cerceve) };
        }
      }
      const t = (nesneMi(x.korunanAdim.kosu) && Array.isArray(x.korunanAdim.kosu.aksiyonlar) ? x.korunanAdim.kosu.aksiyonlar : [])
        .find((/** @type {unknown} */ y) => nesneMi(y) && y.tur === 'tikla' && typeof y.secici === 'string' && y.secici);
      return t ? { secici: String(t.secici), ...cerceveEki(t.cerceve) } : null;
    }
    const t = x.dosyaKontrolu?.tetikleyici?.secici;
    return t ? { secici: t } : null;
  };
  // Korunan parçaların adım kimlikleri önceden ayrılır (başka adım aynı başlıkla o kimliği almasın).
  for (const p of altAdimlar) {
    const id = p.korunan?.id ?? (p.korunanAdim ? String(p.korunanAdim.id) : null);
    if (id) adimIdleri.add(id);
  }
  /** Bu parçadan sonraki adım (göstergesi için) atlanabilir mi: aynı koşula bağlı değilse. @param {AltAdim} x @param {AltAdim} p */
  const ayniKosulda = (x, p) => (x.kosul === null || x.kosul === p.kosul) && ((x.korunanKosul ?? null) === null || x.korunanKosul === p.korunanKosul);
  /** @type {Array<Record<string, any>>} */
  const adimlar = altAdimlar.map((p, i) => {
    if (p.korunanAdim) return { ...kopya(p.korunanAdim), sira: i + 1 };
    if (p.ortakAkis) {
      return { id: adimKimligi(p.ad), sira: i + 1, baslik: p.ad, ...(p.kosul ? { gorunurluk: { kosul: p.kosul } } : {}), ortakAkis: { dosya: p.ortakAkis } };
    }
    if (p.sqlKontrolu) return { id: adimKimligi(p.ad), sira: i + 1, baslik: p.ad, sqlKontrolu: p.sqlKontrolu };
    if (p.dosyaKontrolu) return { id: adimKimligi(p.ad), sira: i + 1, baslik: p.ad, dosyaKontrolu: p.dosyaKontrolu };
    if (p.yenidenGiris) return { id: adimKimligi(p.ad), sira: i + 1, baslik: p.ad, yenidenGiris: p.yenidenGiris };
    /** @type {Map<string, { baslik: string; alanlar: Array<Record<string, unknown>> }>} */
    const bolumler = new Map();
    // Diyagramdaki sıra = doldurma sırası: bölüm değişince yeni bölüm parçası açılır (ardışık olmayan aynı bölümün alanları
    // birleştirilmez; birleştirilseydi sıra bölüme göre değişirdi).
    let sonBolum = null;
    let parca = 0;
    for (const h of p.alanlar) {
      if (h.bolum.anahtar !== sonBolum) { sonBolum = h.bolum.anahtar; parca++; }
      const k = `${parca}\u0001${h.bolum.anahtar}`;
      const b = bolumler.get(k) ?? bolumler.set(k, { baslik: temizMetin(h.bolum.baslik, sayac, 120) || 'Genel', alanlar: [] }).get(k);
      b?.alanlar.push(modelAlani(h));
    }
    // Son EKRAN adımı (ardından yalnız SQL adımları gelebilir): başarı göstergesi onda.
    const sonAdimMi = i === altAdimlar.length - 1 || altAdimlar.slice(i + 1).every((x) => x.sqlKontrolu || x.dosyaKontrolu);
    // "İşlemler" bölümü: adımın düğmesi (buton/aksiyon) ve son adımda sonucu gösteren öğe (cikti) — model koşucusu bunları
    // doldurmaz (koşu tanımı ayrıca aşağıda); modelde adımın ne yaptığı görünür, alansız adım geçerli olur.
    /** @type {Array<Record<string, unknown>>} */
    const islemler = [];
    if (p.tikla) {
      const m = temizMetin(p.tikla.metin, sayac, 120);
      islemler.push({ id: islemKimligi('buton', p.tikla.secici, kimlikUret(m ?? '', 'dugme')), tip: 'buton', yapilandirma: 'aksiyon', etiket: { ekran: m }, konum: { secici: p.tikla.secici, kirilganlik: 'orta', ...cerceveEki(p.tikla.cerceve) } });
    }
    if (sonAdimMi && g && g.secici) {
      const eskiCikti = mevcutAlanlar.find((a) => a.tip === 'cikti' && nesneMi(a.konum) && a.konum.secici === g.secici);
      const ciktiEtiketi = eskiCikti && nesneMi(eskiCikti.etiket) ? eskiCikti.etiket : { ekran: g.desen ? 'Sonuç' : gostergeMetni };
      islemler.push({ id: islemKimligi('cikti', g.secici, 'sonucMesaji'), tip: 'cikti', yapilandirma: 'cikti', etiket: ciktiEtiketi, konum: { secici: g.secici, kirilganlik: 'orta', ...cerceveEki(g.cerceve) } });
    }
    if (islemler.length) bolumler.set('\u0000islemler', { baslik: 'İşlemler', alanlar: islemler });
    /** @type {Record<string, unknown>} */
    const kosu = {};
    // Aksiyonlar: [süreli bekleme] → düğmeye tıkla → [süreli bekleme] (alanlar doldurulduktan sonra, sırayla).
    /** @type {Array<Record<string, unknown>>} */
    const aksiyonlar = [];
    if (p.once) aksiyonlar.push({ tur: 'bekle', sureSn: p.once });
    if (p.tikla) {
      const aciklama = temizMetin(p.tikla.metin, sayac, 120);
      aksiyonlar.push({ tur: 'tikla', secici: p.tikla.secici, ...(aciklama ? { aciklama } : {}), ...cerceveEki(p.tikla.cerceve) });
    }
    if (p.sonra) aksiyonlar.push({ tur: 'bekle', sureSn: p.sonra });
    if (aksiyonlar.length) kosu.aksiyonlar = aksiyonlar;
    if (p.tikla) {
      // Başarı: sonraki (atlanmayacak) adımın ilk alanı ya da düğmesi görünür.
      // Dosya adımının düğmesi sonraki ekran öğesidir (indirme aynı sayfada başlar); SQL adımı sayfaya dokunmaz, atlanır.
      // Aradaki korunan koşullu adımlar (ör. seçime bağlı dallar) da olası sonraki adımdır: ilk öğelerinden herhangi biri
      // görünürse başarılı (öğe "veya"; aynı koşulun yalnız ilk adımı).
      /** @type {AltAdim[]} */
      const olasi = [];
      for (const x of altAdimlar.slice(i + 1)) {
        if (x.sqlKontrolu) continue;
        if (ayniKosulda(x, p)) { olasi.push(x); break; }
        if (x.korunanKosul && (x.kosul === null || x.kosul === p.kosul) && !olasi.some((y) => y.korunanKosul === x.korunanKosul)) olasi.push(x);
      }
      const hedefler = olasi.map(ilkSecici).filter((h) => h !== null)
        .filter((h, j, l) => l.findIndex((y) => y?.secici === h?.secici) === j).slice(0, VEYA_EN_COK);
      const oge = (/** @type {{ secici: string; cerceve?: unknown }} */ h) => ({ tur: 'eleman', deger: h.secici, ...cerceveEki(h.cerceve) });
      if (hedefler.length > 1) kosu.basariGostergesi = { tur: 'veya', secenekler: hedefler.map((h) => oge(/** @type {{ secici: string }} */ (h))) };
      else if (hedefler.length) kosu.basariGostergesi = oge(/** @type {{ secici: string }} */ (hedefler[0]));
    }
    // Akış tasarımında düğmeden (ya da düğmesiz adımda alanlardan) sonra beklenen mesaj verildiyse: o metin görünür. Düğmesiz
    // adımda koşucu alanları doldurup (alanın "Doldurduktan sonra" tuşuna basıp) mesajı bekler.
    const ara = p.gosterge ? basariTanimi(p.gosterge, (x) => {
      if (x.desen) return x.aranan ? { tur: 'desen', deger: x.aranan, ...(x.secici ? { secici: x.secici, ...cerceveEki(x.cerceve) } : {}) } : null;
      const m = temizMetin(x.aranan ?? x.metin, sayac, 200);
      return m ? { tur: 'metin', deger: m, ...(x.secici ? { secici: x.secici, ...cerceveEki(x.cerceve) } : {}) } : null;
    }) : null;
    if (ara) kosu.basariGostergesi = ara;
    const uyarilar = (p.uyarilar ?? []).map((x) => {
      const m = temizMetin(x.aranan ?? x.metin, sayac, 200);
      return m ? { metin: m, ...(x.secici ? { secici: x.secici, ...cerceveEki(x.cerceve) } : {}) } : null;
    }).filter((x) => x !== null);
    if (uyarilar.length) {
      kosu.uyarilar = uyarilar;
      // Uyarının göründüğü öğe (ilk seçicili uyarı): beklenen / beklenmeyen uyarı metni buradan da okunur.
      const secicili = uyarilar.find((u) => u.secici);
      if (secicili) kosu.hataGostergesi = { secici: secicili.secici, ...cerceveEki(/** @type {any} */ (secicili).cerceve) };
    }
    if (p.zamanAsimiSn) kosu.zamanAsimiSn = p.zamanAsimiSn;
    if (p.ekranGoruntusu) kosu.ekranGoruntusu = true;
    const id = p.korunan?.id ?? adimKimligi(p.ad);
    // Mevcut modeldeki aynı adımın diyagramda gösterilmeyen koşu ayarları korunur: hata penceresi (uyarısız) ve öğe
    // "veya" göstergesi (diyagramın yazdığı öğeyi içeriyorsa; ör. "kart seçeneği YA DA doğrudan kart formu açılır").
    const eskiAdim = mevcut ? /** @type {Array<Record<string, any>>} */ (mevcut.adimlar).find((a) => nesneMi(a) && a.id === id) : undefined;
    const eskiKosu = eskiAdim && nesneMi(eskiAdim.kosu) ? eskiAdim.kosu : undefined;
    // Bölüm kimliği: aynı adımın aynı başlıklı bölümününki (model geçmişinde gereksiz fark çıkmasın), yoksa yeni.
    const bolumKimligi = (/** @type {string} */ baslik) => {
      const eski = eskiAdim && Array.isArray(eskiAdim.bolumler)
        ? eskiAdim.bolumler.find((/** @type {any} */ b) => nesneMi(b) && b.baslik === baslik && typeof b.id === 'string' && !bolumIdleri.has(b.id)) : undefined;
      if (eski) { bolumIdleri.add(eski.id); return String(eski.id); }
      return benzersiz(kimlikUret(baslik, 'bolum'), bolumIdleri);
    };
    if (eskiKosu) {
      const eskiH = eskiKosu.hataGostergesi;
      const uyaridan = nesneMi(eskiH) && Array.isArray(eskiKosu.uyarilar) && eskiKosu.uyarilar.some((/** @type {any} */ u) => nesneMi(u) && u.secici === eskiH.secici);
      if (!kosu.hataGostergesi && nesneMi(eskiH) && !uyaridan) kosu.hataGostergesi = kopya(eskiH);
      const yeniG = /** @type {Record<string, any> | undefined} */ (kosu.basariGostergesi);
      const eskiG = eskiKosu.basariGostergesi;
      const ogeVeya = nesneMi(eskiG) && eskiG.tur === 'veya' && Array.isArray(eskiG.secenekler) && eskiG.secenekler.every((/** @type {any} */ s) => nesneMi(s) && s.tur === 'eleman');
      if (ogeVeya && yeniG?.tur === 'eleman' && eskiG.secenekler.some((/** @type {any} */ s) => s.deger === yeniG.deger)) kosu.basariGostergesi = kopya(eskiG);
    }
    if (sonAdimMi && g) {
      const son = basariTanimi(g, (x) => {
        if (x.desen) return x.aranan ? { tur: 'desen', deger: x.aranan, ...(x.secici ? { secici: x.secici, ...cerceveEki(x.cerceve) } : {}) } : null;
        const m = sonMetni(x);
        return m ? { tur: 'metin', deger: m, ...(x.secici ? { secici: x.secici, ...cerceveEki(x.cerceve) } : {}) } : x.secici ? { tur: 'eleman', deger: x.secici, ...cerceveEki(x.cerceve) } : null;
      });
      if (son) kosu.basariGostergesi = son;
    }
    // Korunan aksiyonlar (diyagramda düzenlenemeyen): düğme aksiyonunun yerine aynen; süreli beklemeler önüne / ardına.
    if (p.aksiyonlarAynen) {
      kosu.aksiyonlar = [...(p.once ? [{ tur: 'bekle', sureSn: p.once }] : []), ...kopya(p.aksiyonlarAynen), ...(p.sonra ? [{ tur: 'bekle', sureSn: p.sonra }] : [])];
      if (!kosu.aksiyonlar.length) delete kosu.aksiyonlar;
    }
    const k = p.korunan;
    if (k?.kosuEk) Object.assign(kosu, kopya(k.kosuEk));
    /** @type {Record<string, any>} */
    const adim = {
      id, sira: i + 1, baslik: p.ad,
      ...(p.kosul ? { gorunurluk: { kosul: p.kosul } } : {}),
      bolumler: [...bolumler.values()].map((b) => ({ id: bolumKimligi(b.baslik), baslik: b.baslik, alanlar: b.alanlar })),
      ...(Object.keys(kosu).length ? { kosu } : {})
    };
    if (k) korunanlariYaz(adim, k, bolumIdleri);
    return adim;
  });
  // Seçime göre görünen alanlar (akış kaydının ekran okumaları): alan adımın bazı okumalarında görünüp
  // bazılarında görünmüyorsa ve bu okumalar arasında değeri AYRIŞAN tek bir seçim alanı (select/radyo) varsa, alan o seçimin
  // görüldüğü değerlerde görünür — adlandırılmış koşul (otomatik taramanın seçim keşfiyle aynı biçim). Birden çok aday varsa
  // koşul yazılmaz, bilinmeyenlere not düşülür.
  const tumHamlar = new Map(kayitlar.flatMap((x) => x.alanlar).map((h) => [h.anahtar, h]));
  /** @param {string} anahtar */
  const secenekDegerleri = (anahtar) => {
    const h = tumHamlar.get(anahtar);
    return new Set([...(h?.secenekler ?? []).map((s) => s.deger), ...(h?.radyolar ?? []).map((r) => r.deger)].filter((x) => x !== ''));
  };
  /** Seçim alanı c'nin değerlerine görünürlük koşulu yazar. @param {Record<string, any>} alan @param {string} c @param {string[]} degerler @param {string} kaynak */
  const kosulYaz = (alan, c, degerler, kaynak) => {
    const secim = tumHamlar.get(c);
    const secimAlani = hamdanModel.get(c);
    if (!secim || !secimAlani) return false;
    const metinler = degerler.map((dg) => temizMetin([...(secim.secenekler ?? []), ...(secim.radyolar ?? [])].find((s) => s.deger === dg)?.metin, sayac, 80) ?? dg);
    // Aynı ifadeli koşul (mevcut modelde ya da bu kayıtta) varsa o kullanılır (her kayıtta yeni koşul adı birikmesin).
    const ayniMi = (/** @type {unknown} */ k) => {
      const i = nesneMi(k) && nesneMi(k.ifade) ? k.ifade : null;
      const l = i ? (Array.isArray(i.icinde) ? i.icinde : [i.esit]) : null;
      return Boolean(i && l && i.alan === String(secimAlani.id) && l.length === degerler.length && degerler.every((x) => l.includes(x)));
    };
    const ayni = Object.keys(yeniKosullar).find((ad) => ayniMi(yeniKosullar[ad]))
      ?? (mevcut && nesneMi(mevcut.kosullar) ? Object.keys(mevcut.kosullar).find((ad) => ayniMi(mevcut.kosullar[ad])) : undefined);
    if (ayni) {
      if (!(ayni in yeniKosullar) && mevcut) yeniKosullar[ayni] = mevcut.kosullar[ayni];
      alan.gorunurluk = { kosul: ayni };
      return true;
    }
    const ad = benzersiz(`${String(alan.id)}Gorunur`, kosulAdlari);
    yeniKosullar[ad] = {
      aciklama: `${temizMetin(secim.etiket, sayac, 120) || String(secimAlani.id)} = ${metinler.join(' / ')} seçilince görünür (${kaynak}).`,
      ifade: degerler.length === 1 ? { alan: String(secimAlani.id), esit: degerler[0] } : { alan: String(secimAlani.id), icinde: degerler }
    };
    alan.gorunurluk = { kosul: ad };
    return true;
  };
  const secimAdaylari = [...hamdanModel.keys()].filter((c) => ['select', 'radio'].includes(tumHamlar.get(c)?.tur ?? ''));
  for (const k of kayitlar) {
    const okumalar = k.okumalar ?? [];
    for (const h of k.alanlar) {
      const alan = hamdanModel.get(h.anahtar);
      if (!alan) continue;
      const etiket = temizMetin(h.etiket, sayac, 120) || String(alan.id);
      // Akış tasarımında elle belirlenen koşul (null: koşulsuz — mevcut koşul da kaldırılır) otomatik çıkarımın yerine geçer.
      if (k.kosullar && Object.prototype.hasOwnProperty.call(k.kosullar, h.anahtar)) {
        const elle = k.kosullar[h.anahtar];
        // Modeldeki koşulla aynıysa korunur (her kayıtta yeni koşul adı birikmesin).
        if (elle && nesneMi(alan.gorunurluk) && typeof alan.gorunurluk.kosul === 'string' && mevcut && nesneMi(mevcut.kosullar)) {
          const ifade = mevcut.kosullar[alan.gorunurluk.kosul]?.ifade;
          const eski = nesneMi(ifade) ? (Array.isArray(ifade.icinde) ? ifade.icinde : [ifade.esit]) : null;
          if (eski && ifade.alan === hamdanModel.get(elle.secim)?.id && eski.length === elle.degerler.length && elle.degerler.every((x) => eski.includes(x))) continue;
        }
        delete alan.gorunurluk;
        if (elle && !kosulYaz(alan, elle.secim, elle.degerler, 'akış tasarımı')) bilinmeyenler.push(`"${etiket}" alanının koşulundaki seçim alanı akışta yok; koşul yazılmadı.`);
        continue;
      }
      if (alan.gorunurluk || okumalar.length < 2) continue;
      const bulunan = secimKosuluCikar(okumalar, h.anahtar, secimAdaylari, secenekDegerleri);
      if (bulunan === 'coklu') bilinmeyenler.push(`"${etiket}" alanının görünürlüğü birden çok seçime bağlı görünüyor; koşul yazılmadı (gözden geçirin).`);
      else if (bulunan) kosulYaz(alan, bulunan.secim, bulunan.degerler, 'akış kaydı');
    }
  }

  if (!envanter.basariGostergesi) bilinmeyenler.push('Başarı göstergesi seçilmedi: son adımın sonucu doğrulanmaz (modelde son adıma "kosu.basariGostergesi" ekleyin).');
  bilinmeyenler.push('Hata göstergesi (iş kuralı uyarılarının çıktığı öğe) kayıtta seçilmez; iş kuralı hatası beklenen senaryolarda sayfanın metni aranır.');

  const urlYolu = kayitlar[0]?.yol || meta.urlYolu;
  const alanSayisi = kayitlar.reduce((t, k) => t + k.alanlar.length, 0);
  /** @type {Record<string, any>} */
  let model;
  if (mevcut) {
    model = { ...mevcut, semaSurumu: 2, ekranUrl: urlYolu, adimlar };
    if (meta.girissiz) model.girisGerekmez = true;
    else delete model.girisGerekmez;
    const ekAlanlar = [...(baglamAlani ? [baglamAlani] : []), ...ayarAlanlari];
    if (ekAlanlar.length) {
      const sd = nesneMi(model.senaryoDuzeyi) ? model.senaryoDuzeyi : { alanlar: [] };
      model.senaryoDuzeyi = { ...sd, alanlar: [...(Array.isArray(sd.alanlar) ? sd.alanlar : []), ...ekAlanlar] };
    }
    // Artık var olmayan alan/adımlara başvuran koşullar, görünürlükler ve iş kuralları çıkarılır.
    const alanIdleri = new Set(adimlar.flatMap((a) => /** @type {Array<{ alanlar: Array<Record<string, unknown>> }>} */ (a.bolumler ?? []).flatMap((b) => b.alanlar.map((x) => String(x.id)))));
    for (const a of digerAlanlar) alanIdleri.add(String(a.id));
    for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) {
      if (nesneMi(a) && typeof a.id === 'string') alanIdleri.add(a.id);
    }
    const yeniAdimIdleri = new Set([...adimlar.map((a) => String(a.id)), ...digerAdimlar.map((a) => String(a.id))]);
    const kosullar = nesneMi(model.kosullar) ? model.kosullar : {};
    const cikanKosullar = Object.keys(kosullar).filter((ad) => {
      const alanlar = JSON.stringify(kosullar[ad]?.ifade ?? {}).match(/"alan":"([^"]+)"/g) ?? [];
      return alanlar.some((m) => !alanIdleri.has(m.slice(8, -1)));
    });
    for (const ad of cikanKosullar) delete kosullar[ad];
    model.kosullar = { ...kosullar, ...yeniKosullar };
    for (const adim of adimlar) {
      if (nesneMi(adim.gorunurluk) && typeof adim.gorunurluk.kosul === 'string' && !(adim.gorunurluk.kosul in model.kosullar)) delete adim.gorunurluk;
      for (const b of /** @type {Array<{ alanlar: Array<Record<string, any>> }>} */ (adim.bolumler ?? [])) {
        for (const a of b.alanlar) if (nesneMi(a.gorunurluk) && typeof a.gorunurluk.kosul === 'string' && !(a.gorunurluk.kosul in model.kosullar)) delete a.gorunurluk;
      }
    }
    if (cikanKosullar.length) bilinmeyenler.push(`Kayıtta olmayan alanlara bağlı ${cikanKosullar.length} görünürlük koşulu modelden çıkarıldı: ${cikanKosullar.slice(0, 10).join(', ')}.`);
    if (Array.isArray(model.isKurallari)) {
      const once = model.isKurallari.length;
      model.isKurallari = model.isKurallari.filter((/** @type {Record<string, any>} */ k) => !nesneMi(k) || typeof k.adim !== 'string' || yeniAdimIdleri.has(k.adim));
      if (model.isKurallari.length !== once) bilinmeyenler.push(`Kayıttaki adımlarla eşleşmeyen ${once - model.isKurallari.length} iş kuralı modelden çıkarıldı (adımı yeniden atanarak eklenebilir).`);
    }
    if (nesneMi(model.baglamGorunurlugu) && nesneMi(model.baglamGorunurlugu.alanlar)) {
      for (const id of Object.keys(model.baglamGorunurlugu.alanlar)) if (!alanIdleri.has(id)) delete model.baglamGorunurlugu.alanlar[id];
    }
    const kaybolan = anaAlanlar.filter((a) => !eslesenMevcut.has(a)).map((a) => String((nesneMi(a.etiket) && (a.etiket.ekran || a.etiket.form)) || a.id));
    if (kaybolan.length) {
      bilinmeyenler.push(`Mevcut modeldeki ${kaybolan.length} alan kayıtta seçilmedi ve yeni modelde yok (Bulgular'da "kaldırıldı" görünür; istemiyorsanız reddedin): ${kaybolan.slice(0, 15).join(', ')}${kaybolan.length > 15 ? '…' : ''}.`);
    }
    model.bilinmeyenler = [...new Set([...(Array.isArray(model.bilinmeyenler) ? model.bilinmeyenler : []).filter((b) => b !== AKSIYON_BILINMEYENI), ...bilinmeyenler])];
  } else {
    model = {
      semaSurumu: 2, tur: 'ekran', id: meta.ekranAnahtari, ad: meta.ekranAdi,
      aciklama: `"${meta.ekranAdi}" ekranının akış kaydıyla çıkarılan modeli (${adimlar.length} adım, ${alanSayisi} alan).`,
      ekranUrl: urlYolu,
      specDosyasi: `tests/scenarios/${meta.ekranAnahtari}/${meta.ekranAnahtari}.spec.ts`,
      pageObject: 'yok (model koşucusu)',
      veriKaynaklari: { senaryo: `Nöbetçi > Senaryolar (${meta.ekranAnahtari})` },
      ...(meta.girissiz ? { girisGerekmez: true } : {}),
      kosullar: yeniKosullar,
      adimlar,
      senaryoDuzeyi: { alanlar: [...(baglamAlani ? [baglamAlani] : []), ...ayarAlanlari] },
      urunDuzeyi: {},
      isKurallari: [],
      bilinmeyenler: [...bilinmeyenler]
    };
  }

  beklenenSonucuEsitle(model);
  for (const n of envanter.notlar) bilinmeyenler.push(n);
  const yasakli = envanter.engellenenler.filter((e) => e.neden === 'yasakli');
  if (yasakli.length) bilinmeyenler.push(`Yasaklı adres kalıbına uyan ${yasakli.length} istek engellendi (${[...new Set(yasakli.map((e) => e.adres))].slice(0, 3).join(', ')}).`);
  if (etiketsizler.length) bilinmeyenler.push(`Etiketi bulunamayan ${etiketsizler.length} alan: ${etiketsizler.slice(0, 10).join(', ')} (etiketi ekrandan kontrol edin).`);
  if (cokluDegerliler.length) bilinmeyenler.push(`Çoklu seçim listeleri: ${cokluDegerliler.join(', ')} — model tek değer bekler.`);
  // Test verisi: kayıtta gözlenen seçim listeleri (okumalar + tıklanınca açılan listeler) → tablolar + alan bağlantıları.
  const testVerisi = testVerisiOlustur(model, new Map([...hamdanModel].map(([k, a]) => [k, String(a.id)])), envanter.secenekGozlemleri ?? [], bilinmeyenler, sayac);
  if (sayac.gizlenen) bilinmeyenler.push(`${sayac.gizlenen} metin gizli/kişisel veri kalıbına (kart, kimlik no, IBAN…) benzediği için pakete yazılmadı.`);

  varsayilanAkisiEsitle(model);
  const paket = {
    tur: SAYFA_PAKETI_TURU,
    surum: SAYFA_PAKETI_SURUMU,
    meta: {
      ...(meta.proje ? { proje: meta.proje } : {}),
      ekran: { anahtar: meta.ekranAnahtari, ad: meta.ekranAdi, urlYolu },
      olusturan: KAYIT_OLUSTURANI,
      olusturulma: meta.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: envanter.profil ? [envanter.profil] : [],
      not: `Akış Nöbetçi'de kullanıcı tarafından kaydedildi (${adimlar.length} adım, ${alanSayisi} alan). Alan değerleri ve ekran görüntüleri kaydedilmedi.`
    },
    model,
    senaryoOnerileri: [],
    gerekenAyarlar: {
      girisGerekli: meta.girisGerekli, ikiAsamaliDogrulama: meta.ikiAsamali, captchaGoruldu: false, testVerisiTurleri: [],
      ...(meta.baglamTuru && envanter.profil ? { baglamTurleri: [meta.baglamTuru] } : {})
    },
    bilinmeyenler: [...new Set(bilinmeyenler)],
    ...(testVerisi ? { testVerisi } : {})
  };
  return {
    paket,
    ozet: {
      alanSayisi, kosulSayisi: nesneMi(model.kosullar) ? Object.keys(model.kosullar).length : 0, yeniAlanSayisi, eslesenSayisi,
      eslesmeyenSayisi: mevcutAlanlar.length - eslesenMevcut.size, engellenenYazma: 0, kanitSayisi: 0, adimSayisi: adimlar.length
    }
  };
}

/**
 * Kabul edilen uyarıları olan adımlar varsa senaryo düzeyinde "Beklenen sonuç" (birleşim) alanı: başarılı ya da iş kuralı
 * uyarısı (adım: uyarısı olan adımlar). Alan varsa uyarılı adımlar adım seçeneklerine eklenir (başka akışların adımları kalır).
 * @param {Record<string, any>} model
 */
export function beklenenSonucuEsitle(model) {
  const uyarili = (Array.isArray(model.adimlar) ? model.adimlar : [])
    .filter((a) => nesneMi(a) && nesneMi(a.kosu) && Array.isArray(a.kosu.uyarilar) && a.kosu.uyarilar.length);
  if (!uyarili.length) return;
  const sd = nesneMi(model.senaryoDuzeyi) ? model.senaryoDuzeyi : { alanlar: [] };
  const alanlar = Array.isArray(sd.alanlar) ? [...sd.alanlar] : [];
  const secenekler = uyarili.map((a) => ({ deger: String(a.id), metin: String(a.baslik || a.id) }));
  const mevcutIndeks = alanlar.findIndex((a) => nesneMi(a) && a.tip === 'birlesim' && a.yapilandirma === 'senaryo');
  if (mevcutIndeks < 0) {
    const idler = new Set(alanlar.filter(nesneMi).map((a) => a.id));
    alanlar.push({
      id: idler.has('beklenenSonuc') ? 'beklenenSonucAkis' : 'beklenenSonuc', tip: 'birlesim', etiket: { ekran: null, form: 'Beklenen sonuç' },
      zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
      varyantlar: [
        { tip: 'basarili', anlam: 'Akıştaki başarı mesajı görünür.' },
        { tip: 'isKuraliHatasi', anlam: 'Akışta kabul edilen uyarılardan biri görünür.', alanlar: {
          adim: { etiket: 'Uyarının beklendiği adım', secenekler },
          mesaj: { etiket: 'Beklenen uyarı', tip: 'metin', zorunlu: true }
        } }
      ]
    });
  } else {
    const alan = { ...alanlar[mevcutIndeks] };
    alan.varyantlar = (Array.isArray(alan.varyantlar) ? alan.varyantlar : []).map((/** @type {any} */ v) => {
      if (!nesneMi(v) || !nesneMi(v.alanlar)) return v;
      const adimAdi = Object.keys(v.alanlar).find((ad) => Array.isArray(v.alanlar[ad]?.secenekler));
      if (!adimAdi) return v;
      const eski = v.alanlar[adimAdi].secenekler;
      const ekler = secenekler.filter((s) => !eski.some((/** @type {any} */ x) => nesneMi(x) && String(x.deger) === s.deger));
      return ekler.length ? { ...v, alanlar: { ...v.alanlar, [adimAdi]: { ...v.alanlar[adimAdi], secenekler: [...eski, ...ekler] } } } : v;
    });
    alanlar[mevcutIndeks] = alan;
  }
  model.senaryoDuzeyi = { ...sd, alanlar };
}
