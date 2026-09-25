// SAYFA PAKETİ (sürüm 1) DOĞRULAYICISI — genel. Kullanıcı bir sayfanın bağlantısını Claude Code'a verir;
// Claude sayfayı YALNIZCA OKUYARAK inceler ve bu biçimde bir JSON dosyası üretir; kullanıcı dosyayı
// Nöbetçi > Ekranlar > "Sayfa ekle" (yeni ekran) ya da "Paket yükle" (tekrar analiz) ile yükler.
// Biçim: docs/sayfa-paketi.md (+ docs/sayfa-paketi.schema.json).
//
// Doğrulama: üst düzey biçim, meta, ekran modeli (ortak model doğrulayıcısı), senaryo önerileri (tek
// senaryo doğrulayıcısı — sorunlar UYARI olur, öneri seçilmeden gelir), gereken ayarlar, bilinmeyenler,
// kanıtlar (PNG ekran görüntüleri) ve GİZLİ DEĞER TARAMASI: parola/anahtar/token adlı alanlarda değer,
// kart numarası (Luhn), T.C. kimlik no (resmi algoritma), IBAN, JWT, özel anahtar, adreste kullanıcı:parola
// bulunan paket REDDEDİLİR (açık hata mesajıyla). Paketler gizli ya da kişisel veri taşımaz; kişi/kart gibi
// veriler için test verisi profil ADI kullanılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: sayfa-paketi.d.mts.

import { ekranModeliniDogrula, dogrulamaMaddeleri } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { senaryoyuDogrula, tcKimlikNoGecerliMi } from '../../dogrulama/senaryo-dogrulayici.mjs';

export const SAYFA_PAKETI_TURU = 'sayfa-paketi';
export const SAYFA_PAKETI_SURUMU = 1;
/** Paket JSON'unun (kanıtlar dahil) üst sınırı. */
export const PAKET_BOYUT_SINIRI = 16 * 1024 * 1024;
export const KANIT_EN_COK = 12;
export const KANIT_BOYUT_SINIRI = 4 * 1024 * 1024;
export const IKI_ASAMALI_TURLER = Object.freeze(['yok', 'totp', 'sms', 'bilinmiyor']);
export const EKRAN_ANAHTARI_DESENI = /^[a-z0-9][a-z0-9-]{0,63}$/;

const UST_ANAHTARLAR = new Set(['$schema', 'tur', 'surum', 'meta', 'model', 'senaryoOnerileri', 'gerekenAyarlar', 'bilinmeyenler', 'kanitlar']);
const META_ANAHTARLARI = new Set(['proje', 'ekran', 'olusturan', 'olusturulma', 'baglamProfilleri', 'not']);
const EKRAN_ANAHTARLARI = new Set(['anahtar', 'ad', 'urlYolu']);
const ONERI_ANAHTARLARI = new Set(['baslik', 'veri', 'adimKapsami', 'beklenenSonuc', 'gerekce']);
const AYAR_ANAHTARLARI = new Set(['girisGerekli', 'ikiAsamaliDogrulama', 'captchaGoruldu', 'testVerisiTurleri', 'baglamTurleri', 'not']);
const KANIT_ANAHTARLARI = new Set(['ad', 'aciklama', 'icerikTuru', 'veri']);

const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metinMi = (d) => typeof d === 'string' && d.trim().length > 0;
const metinDizisiMi = (d) => Array.isArray(d) && d.every((x) => typeof x === 'string');

// ---- Gizli değer taraması -----------------------------------------------------------------

const GIZLI_AD_PARCALARI = new Set(['parola', 'sifre', 'şifre', 'password', 'passwd', 'pwd', 'secret', 'gizli', 'token', 'otp', 'totp', 'cvv', 'cvc', 'pin']);
/** camelCase / snake_case / kebab-case adı küçük harfli parçalara ayırır. */
function adParcalari(ad) {
  return String(ad).replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, '$1 $2').toLocaleLowerCase('tr-TR').split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
}
/** Anahtar adı gizli bilgi taşıdığını söylüyor mu? (ör. parola, apiKey, totpGizli, guvenlikKodu) */
export function gizliAdMi(ad) {
  const p = adParcalari(ad);
  if (p.some((x) => GIZLI_AD_PARCALARI.has(x))) return true;
  const k = new Set(p);
  return (k.has('api') && k.has('key')) || (k.has('guvenlik') && k.has('kodu')) || (k.has('access') && k.has('key')) || (k.has('private') && k.has('key'));
}

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

const GIZLI_HATA_SONU = 'Sayfa paketleri gizli ya da kişisel veri içeremez: kişi, kart ve giriş bilgileri için yalnızca test verisi/giriş profili ADI kullanın (değerler Ayarlar\'da, şifreli kasada durur).';

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

// ---- Ana doğrulama --------------------------------------------------------------------------

/**
 * Sayfa paketini doğrular. Paket geçerliyse hatalar boştur; uyarılar yüklemeyi engellemez.
 * senaryoSorunlari[i]: i. önerinin tek doğrulayıcıdaki hataları (öneri yine gösterilir, varsayılan seçilmez).
 * @param {unknown} ham
 * @param {{ altModelKaynagi?: (dosyaAdi: string) => unknown }} [secenekler]
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
  if (ham.tur !== SAYFA_PAKETI_TURU) hata('tur', `"tur" "${SAYFA_PAKETI_TURU}" olmalı — bu dosya bir sayfa paketi değil.`);
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
    if (!metinMi(meta.olusturan)) hata('meta.olusturan', 'paketi kimin/neyin ürettiği yazılmalı (ör. "Claude Code").');
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

  // Senaryo önerileri
  if (!Array.isArray(ham.senaryoOnerileri)) {
    hata('senaryoOnerileri', 'dizi olmalı (öneri yoksa []).');
  } else {
    const basliklar = new Set();
    const modelGecerli = !hatalar.some((h) => h.yer === 'model');
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
          const d = senaryoyuDogrula({ ...o.veri, baslik: typeof o.veri.baslik === 'string' ? o.veri.baslik : o.baslik }, { model, altModeller, kaynak: 'kayit' });
          senaryoSorunlari[i] = d.hatalar;
          if (d.hatalar.length) uyari(yer, `"${o.baslik}" önerisi modele göre ${d.hatalar.length} sorun içeriyor (varsayılan olarak seçilmez): ${d.hatalar.slice(0, 3).map((x) => `${x.alan || '—'}: ${x.mesaj}`).join(' · ')}`);
        } catch (e) {
          senaryoSorunlari[i] = [{ alan: '', mesaj: e instanceof Error ? e.message : String(e) }];
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
    if (!metinDizisiMi(g.testVerisiTurleri)) hata('gerekenAyarlar.testVerisiTurleri', 'gereken test verisi türlerinin ADLARI (metin dizisi) olmalı.');
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
