// EKRAN PAKETİ (sürüm 1) DOĞRULAYICISI — genel. Kullanıcı bir sayfanın bağlantısını yapay zekâ aracına verir;
// araç sayfayı YALNIZCA OKUYARAK inceler ve bu biçimde bir JSON dosyası üretir; kullanıcı dosyayı
// Nöbetçi > Ekranlar > "Ekran ekle" (yeni ekran) ya da "Paket yükle" (tekrar analiz) ile yükler.
// Biçim: docs/sayfa-paketi.md (+ docs/sayfa-paketi.schema.json).
//
// Doğrulama: üst düzey biçim, meta, ekran modeli (ortak model doğrulayıcısı), senaryo önerileri (tek
// senaryo doğrulayıcısı — sorunlar UYARI olur, öneri seçilmeden gelir), gereken ayarlar, bilinmeyenler,
// kanıtlar (PNG ekran görüntüleri) ve GİZLİ DEĞER TARAMASI: parola/anahtar/token adlı alanlarda değer,
// kart numarası (Luhn), T.C. kimlik no (resmi algoritma), IBAN, JWT, özel anahtar, adreste kullanıcı:parola
// bulunan paket REDDEDİLİR (açık hata mesajıyla). Paketler gizli ya da kişisel veri taşımaz: kişi / kayıt verisi test verisi
// TABLOLARINDA satırdır ve senaryo önerisi değeri ${Tablo.Sütun} / ${Tablo[etiket].Sütun} başvurusuyla alır (koşuda seçilen
// satırdan). İsteğe bağlı "testVerisi" bölümü (tablolar: ekran listeleri "<Ekran> — <Alan>" ve kişi / kayıt tabloları + alan →
// sütun bağlantıları) paket-tablolari.mjs ile doğrulanır; gizli sütuna değer yazılmaz. gerekenAyarlar.testVerisiTurleri (adı
// geriye uyum için korunur) GEREKEN TABLO ADLARIDIR.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: sayfa-paketi.d.mts.

import { ekranModeliniDogrula, dogrulamaMaddeleri } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { senaryoyuDogrula, tcKimlikNoGecerliMi } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { paketListeleri, paketTablolari, testVerisiniDogrula } from '../tablolar/paket-tablolari.mjs';
import { degerBasvurusu } from '../tablolar/tablo-secimi.mjs';
import { modeleListeleriUygula } from '../senaryolar/deger-listesi-modeli.mjs';
import { goreliIfadeAyristir, gunSirasi, istanbulGunu, sabitTarihAyristir } from '../senaryolar/goreli-tarih.mjs';

export const SAYFA_PAKETI_TURU = 'sayfa-paketi';
export const SAYFA_PAKETI_SURUMU = 1;
/** Paket JSON'unun (kanıtlar dahil) üst sınırı. */
export const PAKET_BOYUT_SINIRI = 16 * 1024 * 1024;
export const KANIT_EN_COK = 12;
export const KANIT_BOYUT_SINIRI = 4 * 1024 * 1024;
export const IKI_ASAMALI_TURLER = Object.freeze(['yok', 'totp', 'sms', 'bilinmiyor']);
export const EKRAN_ANAHTARI_DESENI = /^[a-z0-9][a-z0-9-]{0,63}$/;

const UST_ANAHTARLAR = new Set(['$schema', 'tur', 'surum', 'meta', 'model', 'senaryoOnerileri', 'gerekenAyarlar', 'bilinmeyenler', 'kanitlar', 'testVerisi']);
const META_ANAHTARLARI = new Set(['proje', 'ekran', 'olusturan', 'olusturulma', 'baglamProfilleri', 'not']);
const EKRAN_ANAHTARLARI = new Set(['anahtar', 'ad', 'urlYolu']);
const ONERI_ANAHTARLARI = new Set(['baslik', 'veri', 'adimKapsami', 'beklenenSonuc', 'gerekce']);
const AYAR_ANAHTARLARI = new Set(['girisGerekli', 'ikiAsamaliDogrulama', 'captchaGoruldu', 'testVerisiTurleri', 'baglamTurleri', 'not']);
const KANIT_ANAHTARLARI = new Set(['ad', 'aciklama', 'icerikTuru', 'veri']);

const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metinMi = (d) => typeof d === 'string' && d.trim().length > 0;
const metinDizisiMi = (d) => Array.isArray(d) && d.every((x) => typeof x === 'string');

/** Oluşturma yollarında (Ekran ekle: paket yükle / Ekranı tara / Akışı kaydet) "Ne oluşturulsun?" seçimi. */
export const OLUSTURMA_TURLERI = Object.freeze(['ekran', 'ortakAkis']);

/**
 * Ekran paketini ORTAK AKIŞ paketine çevirir ("Ne oluşturulsun? ○ Ortak akış"): model.tur "ortakAkis", semaSurumu 2; ekran
 * adresi / spec / page object ve modelin diğer akışları çıkarılır (ortak akışın tek akışı vardır; eklendiği ekranın sayfasında
 * koşar), meta.ekran.urlYolu yazılmaz, senaryo önerileri ve "Beklenen sonuç" (birleşim) alanı atılır (ortak akışın senaryosu
 * yoktur; uyarılı adımlar onu kullanan ekranın beklenen sonucuna eklenir). Zaten ortak akış (ya da alt model) olan paket ve
 * paket olmayan girdi olduğu gibi döner; alt model / ortak akış adımı içeren model doğrulamada anlaşılır hatayla reddedilir.
 * @param {unknown} ham @returns {unknown}
 */
export function ortakAkisPaketineCevir(ham) {
  if (!nesneMi(ham) || !nesneMi(ham.model) || ['ortakAkis', 'altModel'].includes(ham.model.tur)) return ham;
  const p = JSON.parse(JSON.stringify(ham));
  const m = p.model;
  m.tur = 'ortakAkis';
  m.semaSurumu = 2;
  for (const k of ['ekranUrl', 'specDosyasi', 'pageObject', 'akislar']) delete m[k];
  if (!metinMi(m.aciklama)) m.aciklama = `${metinMi(m.ad) ? m.ad : 'Ortak akış'} (ortak akış)`;
  if (nesneMi(m.senaryoDuzeyi) && Array.isArray(m.senaryoDuzeyi.alanlar)) {
    m.senaryoDuzeyi.alanlar = m.senaryoDuzeyi.alanlar.filter((a) => !(nesneMi(a) && a.tip === 'birlesim'));
  }
  if (nesneMi(p.meta) && nesneMi(p.meta.ekran)) delete p.meta.ekran.urlYolu;
  p.senaryoOnerileri = [];
  return p;
}

// ---- Gizli değer taraması -----------------------------------------------------------------

// Anahtar adı gizli bilgi taşıdığını söylüyor mu (ör. parola, apiKey, totpGizli, guvenlikKodu): ortak çekirdek liste
// (ayarlar/gizli-adlar.mjs; paket doğrulaması kullanıcı ayarından bağımsızdır).
export { gizliAdMi };

function luhnGecerliMi(rakamlar) {
  let toplam = 0;
  for (let i = 0; i < rakamlar.length; i++) {
    let r = Number(rakamlar[rakamlar.length - 1 - i]);
    if (i % 2 === 1) { r *= 2; if (r > 9) r -= 9; }
    toplam += r;
  }
  return toplam % 10 === 0;
}

/** Metnin içindeki gizli/kişisel veri kalıpları (bulunan ilk türün adı ya da null). */
export function gizliKalipBul(metin) {
  const m = String(metin);
  for (const aday of m.match(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g) || []) {
    const r = aday.replace(/\D/g, '');
    if (r.length >= 13 && r.length <= 19 && !/^(\d)\1+$/.test(r) && luhnGecerliMi(r)) return 'kart numarası';
  }
  for (const aday of m.match(/(?<!\d)[1-9]\d{10}(?!\d)/g) || []) if (tcKimlikNoGecerliMi(aday)) return 'T.C. kimlik numarası';
  if (/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/i.test(m)) return 'IBAN';
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/.test(m)) return 'erişim anahtarı (JWT)';
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(m)) return 'özel anahtar';
  if (/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/.test(m)) return 'yetkilendirme başlığı (Bearer)';
  if (/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i.test(m)) return 'adreste kullanıcı adı:parola';
  return null;
}

const GIZLI_HATA_SONU = 'Ekran paketleri gizli ya da kişisel veri içeremez: kişi, kart ve giriş bilgileri için değer yerine ${Tablo.Sütun} tablo başvurusu ya da giriş profili ADI kullanın (değerler Ayarlar\'da, şifreli kasada durur).';

/**
 * Değerin içindeki (iç içe) gizli görünen değerler. atla(yol) true dönen yollar taranmaz (kanıt verisi).
 * @returns {Array<{ yer: string; mesaj: string }>}
 */
export function gizliDegerleriBul(deger, yol = '', atla = () => false) {
  const bulunanlar = [];
  const gez = (d, y, anahtar) => {
    if (atla(y)) return;
    if (Array.isArray(d)) { d.forEach((x, i) => gez(x, `${y}[${i}]`, anahtar)); return; }
    if (nesneMi(d)) { for (const [k, v] of Object.entries(d)) gez(v, y ? `${y}.${k}` : k, k); return; }
    if (typeof d !== 'string' && typeof d !== 'number') return;
    // ${Tablo.Sütun} başvurusu değer değildir (değer tabloda, gizli sütunda şifreli): gizli adlı alanda da kabul edilir.
    if (degerBasvurusu(d)) return;
    const metin = String(d);
    if (anahtar && gizliAdMi(anahtar) && metin.trim() !== '') {
      bulunanlar.push({ yer: y, mesaj: `"${anahtar}" adlı alanda değer var (gizli bilgi olabilir). ${GIZLI_HATA_SONU}` });
      return;
    }
    const tur = gizliKalipBul(metin);
    if (tur) bulunanlar.push({ yer: y, mesaj: `${tur} biçiminde bir değer içeriyor. ${GIZLI_HATA_SONU}` });
  };
  gez(deger, yol, null);
  return bulunanlar;
}

/** Modelde gizli (parola/hassas) alanların varsayılan değerleri. */
function modelGizliVarsayilanlari(model) {
  const bulunanlar = [];
  const gez = (liste, yer) => {
    (Array.isArray(liste) ? liste : []).forEach((a, i) => {
      if (!nesneMi(a)) return;
      const aYer = `${yer}[${i}](${a.id})`;
      const gizli = a.hassas === true || (nesneMi(a.form) && a.form.kontrol === 'password');
      const v = nesneMi(a.varsayilan) ? a.varsayilan.deger : undefined;
      if (gizli && v !== undefined && v !== null && String(v).trim() !== '') {
        bulunanlar.push({ yer: `${aYer}.varsayilan.deger`, mesaj: `gizli/hassas alanın varsayılan değeri dolu. ${GIZLI_HATA_SONU}` });
      }
      gez(a.altAlanlar, `${aYer}.altAlanlar`);
      gez(a.ekranAlanlari, `${aYer}.ekranAlanlari`);
    });
  };
  (Array.isArray(model.adimlar) ? model.adimlar : []).forEach((adim, ai) => {
    (nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []).forEach((b, bi) => {
      if (nesneMi(b)) gez(b.alanlar, `model.adimlar[${ai}].bolumler[${bi}].alanlar`);
    });
  });
  if (nesneMi(model.senaryoDuzeyi)) gez(model.senaryoDuzeyi.alanlar, 'model.senaryoDuzeyi.alanlar');
  return bulunanlar;
}

// ---- Kanıtlar -------------------------------------------------------------------------------

const PNG_IMZASI = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Kanıtın base64 verisini çözer (geçersizse null). */
export function kanitVerisiniCoz(veri) {
  if (typeof veri !== 'string') return null;
  const temiz = veri.replace(/^data:image\/png;base64,/, '').replace(/\s+/g, '');
  if (!temiz || !/^[A-Za-z0-9+/]+={0,2}$/.test(temiz) || temiz.length % 4 !== 0) return null;
  return Buffer.from(temiz, 'base64');
}

const pngMi = (b) => b.length > 8 && PNG_IMZASI.every((x, i) => b[i] === x);

/**
 * Modelin tek senaryo anahtarlı TARİH alanları (adımlar > bölümler > alanlar ve senaryo düzeyi).
 * @param {Record<string, any>} model @returns {Array<{ anahtar: string; etiket: string; bicim: string | null }>}
 */
function modelTarihAlanlari(model) {
  /** @type {Array<{ anahtar: string; etiket: string; bicim: string | null }>} */
  const sonuc = [];
  const alanlar = [
    ...(Array.isArray(model.adimlar) ? model.adimlar : []).flatMap((a) => (nesneMi(a) && Array.isArray(a.bolumler) ? a.bolumler : [])
      .flatMap((b) => (nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []))),
    ...(nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [])
  ];
  for (const a of alanlar) {
    if (!nesneMi(a) || a.tip !== 'tarih' || a.yapilandirma !== 'senaryo' || !nesneMi(a.eslesme)) continue;
    const s = a.eslesme.senaryo;
    const anahtar = typeof s === 'string' ? s : Array.isArray(s) && s.length === 1 && typeof s[0] === 'string' ? s[0] : null;
    if (!anahtar) continue;
    const e = nesneMi(a.etiket) ? a.etiket.form || a.etiket.ekran : a.etiket;
    sonuc.push({ anahtar, etiket: typeof e === 'string' && e ? e : anahtar, bicim: typeof a.bicim === 'string' ? a.bicim : null });
  }
  return sonuc;
}

// ---- Ana doğrulama --------------------------------------------------------------------------

/**
 * Ekran paketini doğrular. Paket geçerliyse hatalar boştur; uyarılar yüklemeyi engellemez.
 * senaryoSorunlari[i]: i. önerinin tek doğrulayıcıdaki hataları (öneri yine gösterilir, varsayılan seçilmez).
 * @param {unknown} ham
 * tablolar: projenin tabloları (ad + sütunlar; değer yok) — senaryo önerilerindeki ${Tablo.Sütun} başvuruları paketin ve projenin
 * tablolarına göre denetlenir (verilmezse tablo varlığı denetlenmez).
 * simdi: geçmiş sabit tarih uyarısının "bugün"ü (testlerde sabitlenir; verilmezse şimdi).
 * @param {{ altModelKaynagi?: (dosyaAdi: string) => unknown; tablolar?: Array<{ ad: string; sutunlar: Array<{ ad: string; gizli?: boolean }> }>; simdi?: Date }} [secenekler]
 */
export function sayfaPaketiniDogrula(ham, secenekler = {}) {
  /** @type {Array<{ yer: string; mesaj: string }>} */
  const hatalar = [];
  /** @type {Array<{ yer: string; mesaj: string }>} */
  const uyarilar = [];
  /** @type {Array<Array<{ alan: string; mesaj: string }>>} */
  const senaryoSorunlari = [];
  const hata = (yer, mesaj) => hatalar.push({ yer, mesaj });
  const uyari = (yer, mesaj) => uyarilar.push({ yer, mesaj });
  const sonuc = () => ({ gecerli: hatalar.length === 0, hatalar, uyarilar, senaryoSorunlari, altModeller: altModeller });
  let altModeller = {};

  if (!nesneMi(ham)) {
    hata('', 'Paket bir JSON nesnesi olmalı.');
    return sonuc();
  }
  if (ham.tur !== SAYFA_PAKETI_TURU) hata('tur', `"tur" "${SAYFA_PAKETI_TURU}" olmalı — bu dosya bir ekran paketi değil.`);
  if (ham.surum !== SAYFA_PAKETI_SURUMU) hata('surum', `Desteklenen paket sürümü ${SAYFA_PAKETI_SURUMU} (bulunan: ${String(ham.surum)}).`);
  for (const k of Object.keys(ham)) if (!UST_ANAHTARLAR.has(k)) hata(k, `bilinmeyen anahtar "${k}"`);
  if (hatalar.length) return sonuc();

  // Gizli değer taraması önce: bulunan her şey hatadır (kanıt verisi taranmaz).
  for (const g of gizliDegerleriBul(ham, '', (y) => /^kanitlar\[\d+\]\.veri$/.test(y))) hata(g.yer, g.mesaj);

  // Meta
  const meta = ham.meta;
  if (!nesneMi(meta)) {
    hata('meta', '"meta" nesnesi zorunlu.');
  } else {
    for (const k of Object.keys(meta)) if (!META_ANAHTARLARI.has(k)) hata(`meta.${k}`, `bilinmeyen anahtar "${k}"`);
    const e = meta.ekran;
    if (!nesneMi(e)) {
      hata('meta.ekran', '{ anahtar, ad, urlYolu } zorunlu.');
    } else {
      for (const k of Object.keys(e)) if (!EKRAN_ANAHTARLARI.has(k)) hata(`meta.ekran.${k}`, `bilinmeyen anahtar "${k}"`);
      if (typeof e.anahtar !== 'string' || !EKRAN_ANAHTARI_DESENI.test(e.anahtar)) hata('meta.ekran.anahtar', 'küçük harf, rakam ve "-" içeren kısa bir anahtar olmalı (ör. "odeme-formu").');
      if (!metinMi(e.ad) || e.ad.length > 120) hata('meta.ekran.ad', 'boş olmayan, en fazla 120 karakterlik bir ad olmalı.');
      // Ortak akışın kendi sayfası yoktur (eklendiği ekranın sayfasında koşar): yol verilmeyebilir.
      const yolsuzOlabilir = nesneMi(ham.model) && ham.model.tur === 'ortakAkis' && e.urlYolu === undefined;
      if (!yolsuzOlabilir && (typeof e.urlYolu !== 'string' || !e.urlYolu.startsWith('/') || e.urlYolu.startsWith('//'))) {
        hata('meta.ekran.urlYolu', '"/" ile başlayan bir YOL olmalı (ör. "/satis/odeme/"); tam adres yazılmaz — ortam adresi Ayarlar > Ortamlar\'dan gelir.');
      }
    }
    if (meta.proje !== undefined && typeof meta.proje !== 'string') hata('meta.proje', 'metin olmalı.');
    if (!metinMi(meta.olusturan)) hata('meta.olusturan', 'paketi kimin/neyin ürettiği yazılmalı (ör. yapay zekâ aracının adı).');
    if (typeof meta.olusturulma !== 'string' || Number.isNaN(Date.parse(meta.olusturulma))) hata('meta.olusturulma', 'ISO-8601 tarih olmalı (ör. "2026-09-25T10:30:00Z").');
    if (!metinDizisiMi(meta.baglamProfilleri)) hata('meta.baglamProfilleri', 'incelemede kullanılan bağlam profillerinin ADLARI (metin dizisi; yoksa []) olmalı.');
    if (meta.not !== undefined && typeof meta.not !== 'string') hata('meta.not', 'metin olmalı.');
  }

  // Model (ortak doğrulayıcı)
  const model = ham.model;
  if (!nesneMi(model)) {
    hata('model', '"model" (ekran modeli) zorunlu.');
  } else {
    try {
      const d = ekranModeliniDogrula('model', model, (dosya) => {
        const alt = secenekler.altModelKaynagi ? secenekler.altModelKaynagi(dosya) : undefined;
        if (alt === undefined) throw new Error(`"${dosya}" bu projede yok (alt model önce eklenmeli)`);
        return alt;
      });
      altModeller = d.altModeller;
    } catch (e) {
      for (const madde of dogrulamaMaddeleri(e)) hata('model', madde);
    }
    if (nesneMi(meta) && nesneMi(meta.ekran) && typeof meta.ekran.anahtar === 'string' && model.id !== meta.ekran.anahtar) {
      hata('model.id', `model kimliği ("${String(model.id)}") ekran anahtarıyla ("${meta.ekran.anahtar}") aynı olmalı.`);
    }
    if (typeof model.ekranUrl === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(model.ekranUrl)) {
      hata('model.ekranUrl', 'tam adres değil YOL olmalı (ör. "/satis/odeme/"); ortam adresi Ayarlar\'dan gelir.');
    }
    for (const g of modelGizliVarsayilanlari(model)) hata(g.yer, g.mesaj);
    const bg = nesneMi(model.baglamGorunurlugu) ? model.baglamGorunurlugu : null;
    if (bg && Array.isArray(bg.profiller) && nesneMi(meta) && metinDizisiMi(meta.baglamProfilleri)) {
      for (const p of bg.profiller) if (!meta.baglamProfilleri.includes(p)) uyari('model.baglamGorunurlugu', `"${p}" profili meta.baglamProfilleri listesinde yok.`);
    }
  }

  // Test verisi (isteğe bağlı): tablolar + alan bağlantıları (paket-tablolari.mjs).
  let testVerisiGecerli = false;
  if (ham.testVerisi !== undefined) {
    const t = testVerisiniDogrula(ham.testVerisi, nesneMi(model) ? model : null);
    for (const x of t.hatalar) hata(x.yer, x.mesaj);
    for (const x of t.uyarilar) uyari(x.yer, x.mesaj);
    testVerisiGecerli = !t.hatalar.length;
  }

  // Senaryo önerileri
  if (!Array.isArray(ham.senaryoOnerileri)) {
    hata('senaryoOnerileri', 'dizi olmalı (öneri yoksa []).');
  } else {
    const basliklar = new Set();
    const modelGecerli = !hatalar.some((h) => h.yer === 'model');
    // ${Tablo.Sütun} başvurularının denetlendiği tablolar: paketin tabloları + (verildiyse) projenin tabloları. Proje bilinmiyorsa
    // (secenekler.tablolar yok) yalnız alan tipi denetlenir.
    const tabloOzeti = (/** @type {{ ad: string; sutunlar: Array<{ ad: string; gizli?: boolean }> }} */ t) => ({ ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli === true })) });
    const basvuruTablolari = Array.isArray(secenekler.tablolar)
      ? [...(testVerisiGecerli ? paketTablolari(ham.testVerisi, nesneMi(model) ? model : null).tablolar.map(tabloOzeti) : []), ...secenekler.tablolar.map(tabloOzeti)]
      : undefined;
    ham.senaryoOnerileri.forEach((o, i) => {
      const yer = `senaryoOnerileri[${i}]`;
      senaryoSorunlari[i] = [];
      if (!nesneMi(o)) { hata(yer, 'nesne olmalı.'); return; }
      for (const k of Object.keys(o)) if (!ONERI_ANAHTARLARI.has(k)) hata(`${yer}.${k}`, `bilinmeyen anahtar "${k}"`);
      if (!metinMi(o.baslik) || o.baslik.length > 300) hata(`${yer}.baslik`, 'boş olmayan, en fazla 300 karakterlik başlık olmalı.');
      else if (basliklar.has(o.baslik.trim())) hata(`${yer}.baslik`, `"${o.baslik}" başlığı pakette birden fazla kez var.`);
      else basliklar.add(o.baslik.trim());
      if (!nesneMi(o.veri)) hata(`${yer}.veri`, 'modelin senaryo biçiminde nesne olmalı.');
      if (o.adimKapsami !== undefined && !metinDizisiMi(o.adimKapsami)) hata(`${yer}.adimKapsami`, 'dahil edilen isteğe bağlı adımların kimlikleri (metin dizisi) olmalı.');
      if (!nesneMi(o.beklenenSonuc) || !['basari', 'hata'].includes(o.beklenenSonuc.tur) || typeof o.beklenenSonuc.aciklama !== 'string') {
        hata(`${yer}.beklenenSonuc`, '{ tur: "basari" | "hata", aciklama: metin } olmalı.');
      }
      if (!metinMi(o.gerekce)) hata(`${yer}.gerekce`, 'önerinin gerekçesi yazılmalı.');
      if (modelGecerli && nesneMi(model) && nesneMi(o.veri)) {
        const adimlar = new Set((model.adimlar || []).map((a) => a && a.id));
        for (const a of Array.isArray(o.adimKapsami) ? o.adimKapsami : []) if (!adimlar.has(a)) uyari(`${yer}.adimKapsami`, `adım "${a}" modelde yok.`);
        try {
          // Tabloya bağlı alanda senaryo değeri tablodaki değerdir: paketin tabloları modele uygulanarak doğrulanır.
          const listeler = testVerisiGecerli ? paketListeleri(ham.testVerisi, model) : [];
          const oneriModeli = listeler.length ? modeleListeleriUygula(model, listeler) : model;
          // Kişi / kayıt verisi ${Tablo.Sütun} ile verilebilir: tablo ve sütun varlığı basvuruTablolari ile denetlenir.
          const d = senaryoyuDogrula({ ...o.veri, baslik: typeof o.veri.baslik === 'string' ? o.veri.baslik : o.baslik },
            { model: oneriModeli, altModeller, kaynak: 'kayit', ...(basvuruTablolari ? { tablolar: basvuruTablolari } : {}) });
          senaryoSorunlari[i] = d.hatalar;
          if (d.hatalar.length) uyari(yer, `"${o.baslik}" önerisi modele göre ${d.hatalar.length} sorun içeriyor (varsayılan olarak seçilmez): ${d.hatalar.slice(0, 3).map((x) => `${x.alan || '—'}: ${x.mesaj}`).join(' · ')}`);
        } catch (e) {
          senaryoSorunlari[i] = [{ alan: '', mesaj: e instanceof Error ? e.message : String(e) }];
        }
        // Tarih alanında geçmişte kalmış SABİT tarih: öneri eklendiği gün kırılır — "bugün" / "bugün+N" önerilir (uyarı; engellemez).
        for (const t of modelTarihAlanlari(model)) {
          const d = o.veri[t.anahtar];
          if (typeof d !== 'string' || goreliIfadeAyristir(d)) continue;
          const gun = sabitTarihAyristir(d, t.bicim);
          if (gun && gunSirasi(gun) < gunSirasi(istanbulGunu(secenekler.simdi ?? new Date()))) {
            uyari(`${yer}.veri.${t.anahtar}`, `"${o.baslik}" önerisinde "${t.etiket}" geçmiş bir sabit tarih (${d}); öneri eklenince koşu kırılır. Tarih alanında "bugün" ya da "bugün+N" (ör. bugün+7) kullanın.`);
          }
        }
      }
    });
  }

  // Gereken ayarlar
  const g = ham.gerekenAyarlar;
  if (!nesneMi(g)) {
    hata('gerekenAyarlar', '{ girisGerekli, ikiAsamaliDogrulama, captchaGoruldu, testVerisiTurleri } zorunlu.');
  } else {
    for (const k of Object.keys(g)) if (!AYAR_ANAHTARLARI.has(k)) hata(`gerekenAyarlar.${k}`, `bilinmeyen anahtar "${k}"`);
    if (typeof g.girisGerekli !== 'boolean') hata('gerekenAyarlar.girisGerekli', 'true/false olmalı.');
    if (!IKI_ASAMALI_TURLER.includes(g.ikiAsamaliDogrulama)) hata('gerekenAyarlar.ikiAsamaliDogrulama', `${IKI_ASAMALI_TURLER.join(' | ')} olmalı.`);
    if (typeof g.captchaGoruldu !== 'boolean') hata('gerekenAyarlar.captchaGoruldu', 'true/false olmalı.');
    if (!metinDizisiMi(g.testVerisiTurleri)) hata('gerekenAyarlar.testVerisiTurleri', 'senaryoların gerektirdiği test verisi TABLOLARININ adları (metin dizisi; yoksa []) olmalı.');
    if (g.baglamTurleri !== undefined && !metinDizisiMi(g.baglamTurleri)) hata('gerekenAyarlar.baglamTurleri', 'metin dizisi olmalı.');
    if (g.not !== undefined && typeof g.not !== 'string') hata('gerekenAyarlar.not', 'metin olmalı.');
  }

  // Bilinmeyenler (açık liste; boş olabilir)
  if (!metinDizisiMi(ham.bilinmeyenler)) hata('bilinmeyenler', 'incelemede netleşmeyen noktaların listesi (metin dizisi; yoksa []) olmalı.');

  // Kanıtlar
  if (ham.kanitlar !== undefined) {
    if (!Array.isArray(ham.kanitlar)) {
      hata('kanitlar', 'dizi olmalı.');
    } else {
      if (ham.kanitlar.length > KANIT_EN_COK) hata('kanitlar', `en fazla ${KANIT_EN_COK} ekran görüntüsü eklenebilir.`);
      ham.kanitlar.forEach((k, i) => {
        const yer = `kanitlar[${i}]`;
        if (!nesneMi(k)) { hata(yer, 'nesne olmalı.'); return; }
        for (const a of Object.keys(k)) if (!KANIT_ANAHTARLARI.has(a)) hata(`${yer}.${a}`, `bilinmeyen anahtar "${a}"`);
        if (!metinMi(k.ad) || k.ad.length > 120) hata(`${yer}.ad`, 'kısa bir ad olmalı.');
        if (k.aciklama !== undefined && typeof k.aciklama !== 'string') hata(`${yer}.aciklama`, 'metin olmalı.');
        if (k.icerikTuru !== 'image/png') hata(`${yer}.icerikTuru`, 'yalnızca "image/png" desteklenir.');
        const tampon = kanitVerisiniCoz(k.veri);
        if (!tampon) hata(`${yer}.veri`, 'base64 kodlu PNG olmalı.');
        else if (!pngMi(tampon)) hata(`${yer}.veri`, 'PNG dosyası değil.');
        else if (tampon.length > KANIT_BOYUT_SINIRI) hata(`${yer}.veri`, `en fazla ${KANIT_BOYUT_SINIRI / 1024 / 1024} MB olabilir.`);
      });
    }
  }
  return sonuc();
}
