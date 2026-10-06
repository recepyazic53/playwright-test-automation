// HIZLI TEST → TEST VERİSİ TABLOLARI (saf kurallar). Kullanıcının veri durağında ELLE yazdığı değerler kaydederken test verisi
// tablolarına dönüşür; tek büyük tablo DEĞİL, anlamlı gruplar halinde:
//   · kişi alanları (kimlik no, doğum tarihi, telefon, ad, soyad…)  → "Kişi bilgileri" (sütun adı: kişi alanı türü, ör. "Doğum tarihi"),
//   · kart alanları (kart no, güvenlik kodu, kart üzerindeki isim…)  → "Kart bilgileri" (sütun adı: ekrandaki alan başlığı),
//   · diğer alanlar                                                 → ekrandaki BÖLÜMÜNÜN tablosu (bölüm başlığı; sütun: alan başlığı),
//                                                                     bölüm yoksa KENDİ tablosu (ör. "GİDİLECEK ÜLKE"),
//   · radyo / onay kutusu                                           → tabloya girmez (değeri senaryoda seçilir).
// Tablolar ekranlar arasında ortaktır: aynı adlı tablo varsa sütunlar birleşir, satır (senaryo adıyla) eklenir / güncellenir.
// Değer ÜRETİLMEZ: yalnız kullanıcının yazdığı değerler taşınır; parola / dosya alanları ve boş değerler girmez; seçim alanında
// tabloya seçeneğin görünen metni yazılır. Gizli adlı sütunlar (kart no, güvenlik kodu…) gizli olur.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { degerBasvurusuYaz } from '../tablolar/tablo-secimi.mjs';
import { kisiKategorisi } from '../tablolar/kisi-baglama.mjs';
import { baslikNormal } from '../tablolar/tablo-benzerligi.mjs';
import { yerTutucuSecenekMi } from '../tarama/yer-tutucu-secenek.mjs';

const EN_COK_AD = 60;
export const KISI_TABLOSU = 'Kişi bilgileri';
export const KART_TABLOSU = 'Kart bilgileri';
/** Kart alanı desenleri (normal ad üzerinde). */
const KART_DESENI = /(kart|cvv|cvc|guvenlikkodu|sonkullanma|gecerlilik)/;
/** Tabloya önerilmeyen (kişi / kart dışında) girdi türleri: sayı, tarih, saat, aralık. */
const SERBEST_TURLER = new Set(['number', 'date', 'datetime-local', 'time', 'month', 'week', 'range']);
/** Metin kutusuna elle yazılan serbest değer (tutar / sayı / yıl / tarih): sayfada türü "text" olsa da tabloya önerilmez. Uzun (10+ hane)
 * düz rakam dizisi kod / numara sayılır (adres kodu, poliçe no), bu kurala girmez. */
const SERBEST_DEGER = /^(?:[+-]?(?:\d{1,9}|\d{1,3}(?:[.,\s]\d{3})+)(?:[.,]\d+)?\s*(?:%|tl|₺|eur|usd)?|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/iu;
/** Serbest değer yazılabilen metin kutusu türleri (seçim / radyo / telefon değil). */
const METIN_TURLERI = new Set(['text', 'search', 'textarea', '']);
/** Kod / numara / anahtar adlı alan (adres kodu, poliçe no, IBAN): değeri rakam olsa da serbest değer sayılmaz (normal ad üzerinde). */
const KOD_ADI = /(kod|code|numara|number|iban|anahtar|key|^no|no$|nr$|id$)/;

/**
 * Metin kutusuna elle yazılmış serbest değer mi (tutar / sayı / yıl / tarih; kişi, kart, hassas, çok parçalı, tetikle bağlı ve kod adlı alan değil).
 * @param {Record<string, any>} a @param {string} deger @param {{ tablo: string; sutun: string }} yer @param {ReadonlyArray<string>} ekler
 */
function serbestDegerMi(a, deger, yer, ekler) {
  if (!METIN_TURLERI.has(String(a.tur ?? '')) || a.tabloGrubu || a.parca || yer.tablo === KISI_TABLOSU || yer.tablo === KART_TABLOSU) return false;
  if (!SERBEST_DEGER.test(deger.trim()) || hassasAlanMi(a, yer, ekler)) return false;
  return ![a.etiket, a.ad, a.kimlik].some((x) => typeof x === 'string' && KOD_ADI.test(baslikNormal(x)));
}

/** Tablo / sütun adında kullanılamayan karakterler: . [ ] { } $ < > & | (tablo-deposu.mjs). @param {unknown} m @param {number} [en] */
export function adTemizle(m, en = EN_COK_AD) {
  return String(m ?? '').replace(/[.[\]{}$<>&|]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s:*：]+$/u, '').replace(/^[\s*]+/, '').trim().slice(0, en).trim();
}

/** @param {Record<string, any>} a @returns {string} alanın ekrandaki başlığı (yoksa teknik adı) */
const alanBasligi = (a) => String(a.etiket ?? a.ad ?? a.kimlik ?? a.anahtar ?? '');

/**
 * Alanın tablosu ve sütunu.
 * @param {Record<string, any>} a @returns {{ tablo: string; sutun: string }}
 */
export function alanGrubu(a) {
  // Çok parçalı alanın parçası: tablo, temel adın (parçasız etiket) tablosu; sütun "<temel sütun> (<parça adı>)".
  if (a.parca && typeof a.parca === 'object') {
    const g = alanGrubu({ ...a, etiket: a.parca.temel, parca: undefined });
    return { tablo: g.tablo, sutun: adTemizle(`${adTemizle(g.sutun, EN_COK_AD - 20)} (${a.parca.ad})`) || g.sutun };
  }
  const baslik = alanBasligi(a);
  const n = baslikNormal(baslik);
  const temiz = adTemizle(baslik);
  // Tetikle ilişkili alan (metin girilince seçenekleri gelen liste): kaynağının tablosunda, kendi sütunuyla (kayit-plani.mjs > planKur).
  if (typeof a.tabloGrubu === 'string' && a.tabloGrubu) return { tablo: a.tabloGrubu, sutun: temiz || 'Alan' };
  if (KART_DESENI.test(n)) return { tablo: KART_TABLOSU, sutun: temiz || 'Alan' };
  const tip = a.tur === 'date' ? 'tarih' : a.tur === 'tel' ? 'telefon' : 'metin';
  const kisi = kisiKategorisi({ etiket: baslik, anahtar: a.ad ?? undefined, id: a.kimlik ?? undefined, tip });
  if (kisi) return { tablo: KISI_TABLOSU, sutun: kisi.ad };
  // Diğer alanlar ekrandaki bölümüne göre tek tabloda (ör. "Ana Teminat Bilgileri": bedel alanları sütun); bölüm yoksa kendi tablosu.
  const b = a.bolum && typeof a.bolum === 'object' && typeof a.bolum.baslik === 'string' && a.bolum.anahtar !== 'genel' && !String(a.bolum.anahtar ?? '').startsWith('h1:')
    ? adTemizle(a.bolum.baslik) : '';
  if (b) return { tablo: b, sutun: temiz || 'Alan' };
  return { tablo: temiz || 'Alan', sutun: temiz || 'Alan' };
}

// ---------------------------------------------------------------------------------------
// Çok parçalı alan (tablo planı için): aynı satırda yan yana duran, aynı adı paylaşan kutular (alan kodu + numara gibi). Sayfa okuyucusu
// (sayfa-envanteri) satırın adını yalnız ilk kutuya verir; aynı satırdaki sonraki metin kutularına sıra eki ekler ("Ad (2)", "Ad (3)").
// Bu ek yalnız bu durumda üretildiği için kural: etiketi "<temel> (n)" olan alanlar, kendinden önce gelen "<temel>" etiketli alanla
// (n = 2, 3 … sırayla, aynı bölümde) TEK alanın parçalarıdır. Kayıt planında aynı tabloya, tek satırda, ayrı sütunlar olarak girerler.
// Koşu (alanların ayrı ayrı doldurulması) değişmez.
// ---------------------------------------------------------------------------------------

const PARCA_EKI = /^(.*\S)\s*\((\d{1,2})\)$/u;
/** Parçaya girmeyen türler (seçenek / dosya / parola). */
const PARCA_DISI = new Set(['radio', 'checkbox', 'file', 'password', 'button', 'submit']);
/** Teknik ad (id / name) ipuçları → parça adı (sıra önemli: "alan kodu" "kod"dan önce). */
const PARCA_IPUCLARI = /** @type {const} */ ([
  [/\b(alan ?kod\w*|area ?code|prefix|onek\w*)\b/, 'alan kodu'],
  [/\b(city|sehir\w*|il|ilkod\w*)\b/, 'il kodu'],
  [/\b(kod\w*|code)\b/, 'kod'],
  [/\b(no|nr|num|numara\w*|number)\b/, 'numara'],
  [/\b(seri\w*|series)\b/, 'seri'],
  [/\b(harf\w*|letters?)\b/, 'harf']
]);

/** Teknik adın sözcükleri (camelCase / alt çizgi / tire ayrılır; Türkçe karakter sadeleşir). @param {unknown} s */
const teknikSozcukler = (s) => String(s ?? '').replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, '$1 $2').toLocaleLowerCase('tr')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Parça adları: önce teknik ad ipucu (id / name: "...City" → il kodu, "...No" → numara, "...Kodu" → kod), yoksa değer biçimi ve en çok
 * karakter (rakamlı parçalarda kısa olan baştaki "kod", en uzun sondaki "numara"; yalnız harf "harf"); bulunamayan ya da tekrar eden
 * adlarda tüm parçalar "n. kısım".
 * @param {Array<Record<string, any>>} parcalar @param {Record<string, { deger: unknown }>} degerler @returns {string[]}
 */
function parcaAdlari(parcalar, degerler) {
  const ipucu = (/** @type {Record<string, any>} */ a) => {
    for (const ham of [a.kimlik, a.ad]) {
      const s = teknikSozcukler(ham);
      if (!s) continue;
      // Ortak ön ek (iki parçanın aynı başlayan adı) ipucu değildir: son iki sözcüğe, sondan başa bakılır ("alan kodu" iki sözcüklü).
      const w = s.split(' ');
      if (PARCA_IPUCLARI[0][0].test(w.slice(-2).join(' '))) return PARCA_IPUCLARI[0][1];
      for (let i = w.length - 1; i >= Math.max(0, w.length - 2); i--) for (const [desen, ad] of PARCA_IPUCLARI) if (desen.test(w[i])) return ad;
    }
    return null;
  };
  let adlar = parcalar.map(ipucu);
  if (adlar.some((x) => !x)) {
    const deger = (/** @type {Record<string, any>} */ a) => { const v = degerler[a.anahtar]?.deger; return typeof v === 'string' ? v.trim() : ''; };
    const uzunluk = (/** @type {Record<string, any>} */ a) => (Number.isInteger(a.enCok) && a.enCok > 0 ? a.enCok : deger(a).length);
    const rakam = parcalar.map((a) => /^\d+$/.test(deger(a)));
    const harf = parcalar.map((a) => /^\p{L}+$/u.test(deger(a)));
    const n = parcalar.length;
    adlar = adlar.map((x, i) => {
      if (x) return x;
      if (harf[i]) return 'harf';
      if (!rakam[i]) return null;
      const u = uzunluk(parcalar[i]);
      if (i === n - 1 && parcalar.every((a, j) => j === i || uzunluk(a) <= u)) return 'numara';
      if (i === 0 && u > 0 && u <= 4 && uzunluk(parcalar[n - 1]) > u) return 'kod';
      return null;
    });
  }
  if (adlar.some((x) => !x) || new Set(adlar).size !== adlar.length) return parcalar.map((_, i) => `${i + 1}. kısım`);
  return /** @type {string[]} */ (adlar);
}

/**
 * Çok parçalı alanları işaretler (kopya): her parçaya parca = { temel, ad, sira, sayi } eklenir; diğer alanlar olduğu gibi döner.
 * @param {ReadonlyArray<Record<string, any>>} alanlar sayfa sırasıyla @param {Record<string, { deger: unknown }>} [degerler]
 * @returns {Array<Record<string, any>>}
 */
export function cokParcaliIsaretle(alanlar, degerler = {}) {
  const sonuc = [...alanlar];
  /** Alanın bölümü (sayfa okuyucusunda { anahtar, baslik } ya da metin; yoksa ''). @param {Record<string, any>} a */
  const bolumAnahtari = (a) => (a.bolum && typeof a.bolum === 'object' ? String(a.bolum.anahtar ?? a.bolum.baslik ?? '') : String(a.bolum ?? ''));
  const kucukAd = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
  for (let i = 0; i < alanlar.length; i++) {
    const a = alanlar[i];
    const temel = typeof a.etiket === 'string' ? a.etiket.trim() : '';
    if (!temel || PARCA_EKI.test(temel) || PARCA_DISI.has(String(a.tur)) || a.parca) continue;
    /** @type {number[]} */
    const grup = [i];
    for (let j = i + 1; j < alanlar.length && grup.length < 6; j++) {
      const m = PARCA_EKI.exec(String(alanlar[j].etiket ?? '').trim());
      if (!m || kucukAd(m[1]) !== kucukAd(temel)) continue;
      if (Number(m[2]) !== grup.length + 1 || PARCA_DISI.has(String(alanlar[j].tur))) break;
      if (bolumAnahtari(a) !== bolumAnahtari(alanlar[j])) break;
      grup.push(j);
    }
    if (grup.length < 2) continue;
    const parcalar = grup.map((k) => alanlar[k]);
    const adlar = parcaAdlari(parcalar, degerler);
    grup.forEach((k, n) => { sonuc[k] = { ...alanlar[k], parca: { temel, ad: adlar[n], sira: n + 1, sayi: grup.length } }; });
  }
  return sonuc;
}

/** Değeri her zaman GİZLİ sütunda (şifreli, ekranda maskeli) tutulan alanlar: kart numarası, CVV / CVC / güvenlik kodu, kart sahibi,
 * T.C. / vergi / kimlik / pasaport no, parola, IBAN (normal ad üzerinde). */
const HASSAS_DESEN = /(kartno|kartnumara|cardnumber|cardno|creditcard|cvv|cvc|cv2|guvenlikkod|securitycode|kartsahib|cardholder|holdername|iban|parola|sifre|password|passwd|vergino|vergikimlik|vergnumara|^vkn|tckimlik|kimlikno|kimliknumara|tckn|^tcno|^tc$|pasaport|passport)/;
/** Kart tablosunda kart sahibinin adı / soyadı sütunu. */
const KART_SAHIBI_DESENI = /^(ad|adi|isim|soyad|soyadi|soyisim|name|firstname|lastname|surname)$|(sahib|holder|isim|soyad|adsoyad)/;

/**
 * Alanın değeri gizli sütunda mı tutulur? Hassas alan kuralı (yukarıdaki desen; alanın ekrandaki adı, name / id ve sütun adı üzerinde),
 * kişi tablosunda kimlik / vergi / pasaport no, kart tablosunda kart sahibinin adı / soyadı ve Ayarlar > Güvenlik > Maskeleme adları
 * (çekirdek + kullanıcının ekleri: gizliAdMi) — rapor maskelemesiyle aynı liste.
 * @param {Record<string, any>} a alan @param {{ tablo: string; sutun: string }} yer @param {ReadonlyArray<string>} [ekler] kullanıcının ek gizli adları
 */
export function hassasAlanMi(a, yer, ekler = []) {
  const adlar = [a.etiket, a.ad, a.kimlik, yer.sutun].filter((x) => typeof x === 'string' && x);
  if (a.gizli === true || a.tur === 'password') return true;
  if (adlar.some((x) => HASSAS_DESEN.test(baslikNormal(x)) || gizliAdMi(String(x), ekler))) return true;
  if (yer.tablo === KART_TABLOSU && adlar.some((x) => KART_SAHIBI_DESENI.test(baslikNormal(x)))) return true;
  if (yer.tablo === KISI_TABLOSU) {
    const k = kisiKategorisi({ etiket: String(a.etiket ?? ''), anahtar: a.ad ?? undefined, id: a.kimlik ?? undefined });
    if (k && ['kimlikNo', 'vergiNo', 'pasaportNo'].includes(k.kategori)) return true;
  }
  return false;
}

/** Seçim / radyo alanının tüm seçenekleri (yer tutucu "SEÇİNİZ" / boş değerli seçenek hariç): görünen metin + sayfadaki seçenek değeri. @param {Record<string, any>} a */
export function tumSecenekler(a) {
  const liste = a.tur === 'radio' ? (Array.isArray(a.radyolar) ? a.radyolar : []) : (Array.isArray(a.secenekler) ? a.secenekler : []);
  /** @type {Map<string, { metin: string; kod: string }>} */
  const m = new Map();
  for (const [i, s] of liste.entries()) {
    const kod = String(s.deger ?? '');
    const metin = typeof s.metin === 'string' && s.metin.trim() ? s.metin.trim() : kod;
    if (kod === '' || !metin || (a.tur !== 'radio' && yerTutucuSecenekMi(metin, kod, i === 0))) continue;
    if (!m.has(metin.toLocaleLowerCase('tr'))) m.set(metin.toLocaleLowerCase('tr'), { metin, kod });
  }
  return [...m.values()];
}

/**
 * Seçim / radyo alanında değerin görünen metni (yoksa değerin kendisi) ve sayfadaki seçenek değeri (kod). Tabloya okunur metin yazılır;
 * metin koddan farklıysa sütuna "metin → kod" sayfa karşılığı eklenir (koşu ve koşullar seçeneği koddan tanır).
 * @param {Record<string, any>} a @param {string} deger @returns {{ metin: string; kod: string }}
 */
function okunurDeger(a, deger) {
  const liste = a.tur === 'radio' ? (Array.isArray(a.radyolar) ? a.radyolar : []) : (Array.isArray(a.secenekler) ? a.secenekler : []);
  const s = liste.find((x) => String(x.deger) === deger);
  return { metin: s && typeof s.metin === 'string' && s.metin.trim() ? s.metin.trim() : deger, kod: deger };
}

/**
 * @param {{ baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string> }} g
 * @returns {{ satirAdi: string; tablolar: Array<{ tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
 *   liste: { sutun: string; secenekler: Array<{ metin: string; kod: string }> } | null;
 *   karsiliklar: Record<string, Record<string, string>>;
 *   baglar: Record<string, { tablo: string; sutun: string; basvuru: string }> }> } | null} taşınacak değer yoksa null
 */
export function tabloTaslagiKur(g) {
  /** @type {Map<string, { tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>; liste: { sutun: string; secenekler: Array<{ metin: string; kod: string }> } | null; karsiliklar: Record<string, Record<string, string>>; baglar: Record<string, { tablo: string; sutun: string; basvuru: string }> }>} */
  const tablolar = new Map();
  for (const a of g.alanlar) {
    const v = g.degerler[a.anahtar];
    if (!v || v.kaynak === 'tablo' || typeof v.deger !== 'string' || !v.deger.trim()) continue;
    // Radyo / onay kutusu tabloya önerilmez: değeri senaryoda seçilir (seçenekler ekran modelinde).
    if (['password', 'file', 'radio', 'checkbox'].includes(String(a.tur))) continue;
    const { tablo, sutun } = alanGrubu(a);
    // Sayı / tarih / saat alanı (kişi ya da kart bilgisi değilse; ör. "Adet", "Teslimat tarihi") kendi tek sütunlu tablosunu açmaz:
    // değeri senaryoda düz değer olarak kalır (tabloya taşımak veri tekrarını azaltmaz, yalnız tablo kalabalığı yapar).
    if (SERBEST_TURLER.has(String(a.tur)) && tablo !== KISI_TABLOSU && tablo !== KART_TABLOSU) continue;
    // Metin kutusuna yazılmış tutar / sayı / tarih de aynı (ör. teminat bedeli, işçi sayısı, inşa yılı); tetikle bağlı alan hariç.
    if (serbestDegerMi(a, v.deger, { tablo, sutun }, g.ekGizliAdlar ?? [])) continue;
    const anahtar = tablo.toLocaleLowerCase('tr');
    let t = tablolar.get(anahtar);
    if (!t) { t = { tabloAdi: tablo, sutunlar: [], satir: {}, liste: null, karsiliklar: {}, baglar: {} }; tablolar.set(anahtar, t); }
    let ad = sutun;
    for (let i = 2; t.sutunlar.some((x) => x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')); i++) ad = `${adTemizle(sutun, EN_COK_AD - 4)} ${i}`;
    // Hassas alan (kart no, CVV, kart sahibi, kimlik / vergi no, parola, IBAN, maskeleme adları) gizli sütun olur: değer şifreli saklanır,
    // ekranda maskelenir.
    const ilkAlan = !t.sutunlar.length;
    t.sutunlar.push({ ad, gizli: hassasAlanMi(a, { tablo, sutun: ad }, g.ekGizliAdlar ?? []) });
    // Tek başına duran seçim / radyo alanı: tabloya yalnız seçilen değil TÜM seçenekler yazılır (liste tablosu); grupta başka alan varsa değil.
    const secim = ['select', 'select-one', 'radio'].includes(String(a.tur));
    t.liste = secim && ilkAlan && tablo !== KISI_TABLOSU && tablo !== KART_TABLOSU ? { sutun: ad, secenekler: tumSecenekler(a) } : null;
    const ok = okunurDeger(a, v.deger);
    t.satir[ad] = ok.metin;
    if (ok.metin !== ok.kod && !t.sutunlar[t.sutunlar.length - 1].gizli) (t.karsiliklar[ad] ??= {})[ok.metin] = ok.kod;
    if (t.liste) for (const x of t.liste.secenekler) if (x.metin !== x.kod && !t.sutunlar[t.sutunlar.length - 1].gizli) (t.karsiliklar[ad] ??= {})[x.metin] = x.kod;
    t.baglar[a.anahtar] = { tablo: t.tabloAdi, sutun: ad, basvuru: degerBasvurusuYaz(t.tabloAdi, ad) };
  }
  if (!tablolar.size) return null;
  return { satirAdi: adTemizle(g.baslik || 'Hızlı test') || 'Hızlı test', tablolar: [...tablolar.values()] };
}
