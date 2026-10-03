// SERVİS ANALİZİ (A aşaması) — adlandırılmış örnek isteklerden (SOAP: gövde XML, REST: JSON) metodun alanları hakkında ÖNERİLER
// (ORTAK saf modül: sunucu testleri ve arayüz; /arayuz/servis-analizi.mjs olarak sunulur). Ağ isteği YOKTUR; hiçbir değer ÜRETİLMEZ
// (yalnız örneklerde yazan değerler kullanılır). Öneriler kullanıcı "Uygula" deyince uygulanır (oneriyiUygula); "Yoksay" hatırlanır.
//   1) Alan listesi  : örnekteki öğeler (ad alanı önekleri yok sayılır; yol "Input/Alan" biçiminde, şemanın yollarıyla) WSDL alanlarıyla
//                      eşlenir; WSDL'de olmayan öğe "alan olarak eklensin mi?" (alanEkle) önerisi olur. Alan listesi olmayan metotta
//                      alanların tamamı örneklerden gelir (kok / ns de örnekten).
//   2) Zorunluluk    : örnek başına durum (basarili / hata / bilinmiyor; koşudan gelen kanıtta koşunun sonucu). Başarılı istekte boş /
//                      yok → güçlü "isteğe bağlı" (hep boşsa varsayılan "boş gönder"; WSDL zorunluysa ayrıca çelişki notu). Her örnekte
//                      dolu → yalnız zayıf "zorunlu olabilir" (WSDL zorunluysa öneri yok). Hata veren istek bir başarılı istekten YALNIZ
//                      bu alanın boş / yok olmasıyla ayrılıyorsa → güçlü ipucu "zorunlu olabilir: bu alan eksikken hata verdi" (kesin
//                      değil); birden çok alanla ayrılıyorsa yalnız not. Hata veren istekte boş alan tek başına kanıt değildir (hesaba
//                      katılmaz). Başarısı bilinmeyen örnekte boş → zayıf "isteğe bağlı olabilir" (WSDL zorunluysa yalnız not).
//                      Hata veren örneklerin değerleri tablolara ve "tabloya değer ekle" önerisine girmez. Alan listesi ve tip tüm örneklerden.
//   3) Tip / biçim   : WSDL'deki alanda WSDL tipi geçerlidir (string → metin; rakamlardan oluşsa da tamsayı önerilmez). WSDL'de
//                      olmayan alanda değerlerden (≥ 3 dolu gözlem): tarih (gg.aa.yyyy / yyyy-aa-gg / ISO), tamsayı, ondalık (ayraç),
//                      evet/hayır (true/false, E/H, 1/0), e-posta. Uzunluk / desen ve izin verilen değer KISITI önerilmez. Gizli adlı,
//                      11 haneli sayı ya da kimlik benzeri ad → gizli.
//   4) Tablo eşleşmesi: ad (aynı ad, eş anlam / kısaltma — doldur-onerisi.mjs > ayniKavramMi / benzerAdMi —, küçük TR↔EN sözlüğü;
//                      tablo adı da sayılır) + değer örtüşmesi (sütunun karşılıkları: metin ↔ kod). Ad + ≥ 1 değer → güçlü; ad yokken
//                      değer sütunda ve biçim aynı → zayıf ("desen aynı"). Aynı tabloya önerilen alanların değerleri aynı satırda
//                      birlikte bulunuyorsa güçlü. Silinmiş tabloya / sütuna bağ → "kopuk bağ" (en iyi eşleşmeye bağla / bağı kaldır).
//   5) Yeni tablo    : eşleşmeyen alanlar için hızlı testin kayıt planı kuralları: kavram grupları (kişi / adres / iletişim / kart /
//                      giriş bilgileri) ayrı kayıt tablosu, kalanlar metodun tablosu; küçük değer listeleri (evet/hayır hariç) ayrı
//                      liste tablosu (her farklı değer bir satır); kayıt tablosunda her örnek bir satır, örnek satırlarında olmayan
//                      farklı değerler ayrı satır. Bağlı tabloda olmayan örnek değerleri "tabloya eklensin mi" önerisi;
//                      gizli adlı sütun gizli (değeri yazılmaz). Satırlar örneklerden (satır adı = örnek adı). Aynı adlı tablo varsa
//                      ayniAdli dolu (arayüz: Birleştir / Yeni ad / Atla).
//   Güç: her öneri "guclu" ya da "zayif" (çelişki "not"); "Güçlü önerileri uygula" yalnız güçlüleri kapsar.
//   6) Fark          : adlandırılmış örnekler karşılaştırılır — yalnız bazılarında dolu alanlar (B aşaması senaryo önerileri için).
// Ek kanıt (kayıtlı senaryo gövdeleri, son koşu istekleri) sayımlara katılır; adlı değildir (satır / fark üretmez). Yer tutuculu
// (${…}, {{…}}) ve maskeli (•••) değerler "dolu" sayılır ama değer çıkarımına girmez.
import { alanSatirlari, semaBirlestir, xmlAyristir } from './servis-govdesi.mjs';
import { ayniKavramMi, benzerAdMi } from '../tablolar/doldur-onerisi.mjs';
import { baslikNormal } from '../tablolar/tablo-benzerligi.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';

/** @typedef {import('./servis-analizi.d.mts').OrnekGozlemi} OrnekGozlemi */
/** @typedef {import('./servis-analizi.d.mts').OrnekDurumu} OrnekDurumu */
/** @typedef {import('./servis-analizi.d.mts').CozulenOrnek} CozulenOrnek */
/** @typedef {import('./servis-analizi.d.mts').AnalizGirdisi} AnalizGirdisi */
/** @typedef {import('./servis-analizi.d.mts').AnalizSonucu} AnalizSonucu */
/** @typedef {import('./servis-analizi.d.mts').AlanAnalizi} AlanAnalizi */
/** @typedef {import('./servis-analizi.d.mts').AnalizOnerisi} AnalizOnerisi */
/** @typedef {import('./servis-analizi.d.mts').TabloEslesmesi} TabloEslesmesi */
/** @typedef {import('./servis-analizi.d.mts').YeniTabloPlani} YeniTabloPlani */
/** @typedef {import('./servis-analizi.d.mts').AnalizTablosu} AnalizTablosu */
/** @typedef {import('./servis-analizi.d.mts').AnalizDurumu} AnalizDurumu */
/** @typedef {import('./servis-govdesi.mjs').AlanTipi} AlanTipi */

/** Bir metotta en çok örnek sayısı (sunucu doğrulaması da bunu kullanır). */
export const EN_COK_ORNEK = 50;
/** İzin verilen değerler önerisinin üst sınırı (farklı değer). */
export const EN_COK_KUME = 8;
export const TIP_ADLARI = Object.freeze({ metin: 'metin', tamsayi: 'tamsayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' });
/** Biçimlerin kullanıcıya görünen adı (saklanan biçim → gösterim). */
export const BICIM_ADLARI = Object.freeze({
  'dd.MM.yyyy': 'gg.aa.yyyy', 'yyyy-MM-dd': 'yyyy-aa-gg', "yyyy-MM-dd'T'HH:mm:ss": 'ISO (yyyy-aa-ggTss:dd:ss)', 'dd/MM/yyyy': 'gg/aa/yyyy',
  'true/false': 'true / false', 'E/H': 'E / H', '1/0': '1 / 0', 'Y/N': 'Y / N', 'e-posta': 'e-posta', 'ayrac:.': 'ondalık ayracı nokta', 'ayrac:,': 'ondalık ayracı virgül'
});
/** Ad eşleşmesi türlerinin adı. */
const AD_TURU = Object.freeze({ birebir: 'aynı ad', esAnlam: 'eş anlam', benzer: 'kısaltma / benzer' });

/**
 * Genel TR ↔ EN kavram sözlüğü (normal ad: küçük harf, Türkçe karakter Latin, yalnız harf / rakam). Ürüne / sektöre özgü ad yok.
 * doldur-onerisi.mjs > ayniKavramMi'nin (doğum tarihi, telefon, kimlik, vergi, e-posta, ad soyad) tamamlayıcısıdır.
 */
const SOZLUK = /** @type {ReadonlyArray<readonly [string, ReadonlyArray<string>]>} */ ([
  ['ulke', ['ulke', 'ulkekodu', 'country', 'countrycode', 'uyruk']],
  ['sehir', ['sehir', 'il', 'city', 'province']],
  ['ilce', ['ilce', 'district', 'county', 'town']],
  ['adres', ['adres', 'address']],
  ['postaKodu', ['postakodu', 'zip', 'zipcode', 'postalcode', 'postcode']],
  ['ad', ['ad', 'adi', 'isim', 'name', 'firstname', 'givenname']],
  ['soyad', ['soyad', 'soyadi', 'surname', 'lastname', 'familyname']],
  ['tarih', ['tarih', 'date']],
  ['baslangic', ['baslangic', 'baslangictarihi', 'begin', 'begindate', 'start', 'startdate']],
  ['bitis', ['bitis', 'bitistarihi', 'end', 'enddate', 'finish', 'finishdate']],
  ['tutar', ['tutar', 'miktar', 'amount']],
  ['paraBirimi', ['parabirimi', 'doviz', 'dovizkodu', 'currency', 'currencycode']],
  ['dil', ['dil', 'language', 'lang']],
  ['cinsiyet', ['cinsiyet', 'gender', 'sex']],
  ['kanal', ['kanal', 'channel']],
  ['kullanici', ['kullanici', 'kullaniciadi', 'user', 'username', 'userid', 'login']],
  ['kod', ['kod', 'code']],
  ['aciklama', ['aciklama', 'description', 'desc']],
  ['durum', ['durum', 'status', 'state']],
  ['tur', ['tur', 'tip', 'type', 'kind']],
  ['numara', ['numara', 'no', 'number', 'num']],
  ['adet', ['adet', 'quantity', 'qty', 'count']],
  ['fiyat', ['fiyat', 'price']],
  ['taksit', ['taksit', 'installment']],
  ['kart', ['kart', 'card']],
  ['musteri', ['musteri', 'customer', 'client']],
  ['urun', ['urun', 'product', 'item']],
  ['sirket', ['sirket', 'firma', 'company']],
  ['eposta', ['eposta', 'email', 'mail']],
  ['telefon', ['telefon', 'phone', 'mobile', 'gsm']],
  ['dogumTarihi', ['dogumtarihi', 'birthdate', 'dateofbirth', 'dob']]
]);
/** @type {Map<string, string>} normal ad → kavram */
const SOZLUK_HARITASI = new Map(SOZLUK.flatMap(([k, l]) => l.map((x) => [x, k])));

const YER_TUTUCU = /\$\{[^}]*\}|\{\{[^}]*\}\}/;
const MASKELI = /•|\*{3}/;
/** Değer çıkarımına girebilir mi (yer tutucusuz, maskesiz, boş değil). @param {unknown} v */
const somutMu = (v) => typeof v === 'string' && v !== '' && !YER_TUTUCU.test(v) && !MASKELI.test(v);
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** Yolun son parçası (alan adı). @param {string} yol */
export const alanAdi = (yol) => String(yol).split('/').pop() ?? '';
/** Sözcükler (camelCase / noktalama sınırından; normal). @param {string} s */
const sozcukler = (s) => String(s ?? '').replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).map(baslikNormal).filter(Boolean);
/** Gösterimde değer listesi (en çok n tane). @param {string[]} l @param {number} [n] */
const liste = (l, n = 4) => `${l.slice(0, n).join(', ')}${l.length > n ? ` (+${l.length - n})` : ''}`;
/** Bulunma eki ("Kod'da", "Ülke'de", "Tip'te", "kodu'nda"): son ünlü, son ünsüz; ünlüyle biten sözde kaynaştırma "n". @param {string} s */
export function bulunmaEki(s) {
  const k = kucuk(s);
  const unlu = [...k].reverse().find((c) => 'aeıioöuü'.includes(c)) ?? 'e';
  const a = 'aıou'.includes(unlu) ? 'a' : 'e';
  if (/[aeıioöuü]$/.test(k)) return `'nd${a}`;
  return `'${/[çfhkpsşt]$/.test(k) ? 't' : 'd'}${a}`;
}
/** Değerin biçim imzası (rakam / büyük harf dizisi ve uzunluk; başka biçimde null). @param {string} v */
const imza = (v) => (/^\d+$/.test(v) ? `9:${v.length}` : /^[A-Z]+$/.test(v) ? `A:${v.length}` : null);
/** Değerler tek bir imzada mı (hepsi aynı uzunlukta rakam / büyük harf dizisi): imza ya da null. @param {ReadonlyArray<string>} l */
const ortakImza = (l) => { const s = new Set(l.map(imza)); return l.length && s.size === 1 && !s.has(null) ? /** @type {string} */ ([...s][0]) : null; };

/** Değerden tip önerisinin kanıt eşiği: en az 3 dolu gözlem. */
export const EN_AZ_GOZLEM = 3;
/** Hızlı testin kayıt planıyla aynı kavram grupları (test-verisi-tablosu.mjs: "Kişi bilgileri", "Kart bilgileri"; normal ad üzerinde). */
const KAVRAM_GRUPLARI = /** @type {ReadonlyArray<readonly [string, RegExp]>} */ ([
  ['Kart bilgileri', /(kart|card|cvv|cvc|guvenlikkodu|sonkullanma|gecerlilik|expir|installment|taksit)/],
  ['İletişim bilgileri', /(telefon|^tel|gsm|^cep|phone|mobile|eposta|email|^mail|fax|faks)/],
  ['Adres bilgileri', /(adres|address|^il$|ilce|sehir|city|district|province|posta|zip|ulke|country|mahalle|sokak|street|bina|daire)/],
  ['Kişi bilgileri', /(^ad$|^adi$|isim|soyad|surname|lastname|firstname|^name$|fullname|dogum|birth|cinsiyet|gender|kimlik|identity|^tc|uyruk|meslek|occupation)/],
  ['Giriş bilgileri', /(kullanici|username|^user|parola|password|sifre|kanal|channel|token|apikey|oturum|session)/]
]);
/** Alanın kavram grubu (yoksa null → metodun tablosu). @param {string} ad */
export const kavramGrubu = (ad) => KAVRAM_GRUPLARI.find(([, d]) => d.test(baslikNormal(ad)))?.[0] ?? null;

// ---------------------------------------------------------------------------------------
// Örnek çözümleme
// ---------------------------------------------------------------------------------------

/**
 * Örnek gövdeyi alan yollarına çözer. SOAP: Envelope / Body içindeki işlem öğesinin altı (öneksiz yerel adlar); zarfsız gövdede
 * kök işlem öğesi sayılır — kök, şemanın üst alanlarından biriyse (ör. yalnız <Input>) alan sayılır. REST: JSON nesnesi, yollar
 * "govde/…" (restSemasi ile aynı). Dizi: ilk eleman (coklu). Tekrar eden öğe: ilk değer.
 * @param {string} govde @param {{ tur?: 'soap' | 'rest'; kok?: string; ustAlanlar?: ReadonlyArray<string> }} [s]
 * @returns {CozulenOrnek}
 */
export function ornekCoz(govde, s = {}) {
  /** @type {Map<string, OrnekGozlemi>} */
  const alanlar = new Map();
  /** @type {Set<string>} */
  const gruplar = new Set();
  const metin = String(govde ?? '').trim();
  if (!metin) return { kok: '', ns: '', alanlar, gruplar, hata: 'Gövde boş.' };
  if (s.tur === 'rest') {
    let v;
    try { v = JSON.parse(metin); } catch (e) { return { kok: '', ns: '', alanlar, gruplar, hata: `JSON çözülemedi: ${/** @type {Error} */ (e).message}` }; }
    const kok = Array.isArray(v) ? v[0] : v;
    if (!kok || typeof kok !== 'object' || Array.isArray(kok)) return { kok: '', ns: '', alanlar, gruplar, hata: 'JSON gövdesi bir nesne olmalı.' };
    /** @param {Record<string, unknown>} o @param {string} on */
    const gez = (o, on) => {
      for (const [k, ham] of Object.entries(o)) {
        const yol = `${on}/${k}`;
        const coklu = Array.isArray(ham);
        const d = coklu ? /** @type {unknown[]} */ (ham)[0] : ham;
        if (d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length) { gruplar.add(yol); gez(/** @type {Record<string, unknown>} */ (d), yol); continue; }
        if (alanlar.has(yol)) continue;
        if (d === null) alanlar.set(yol, { durum: 'nil', deger: '', coklu });
        else if (d === undefined || d === '' || (typeof d === 'object')) alanlar.set(yol, { durum: 'bos', deger: '', coklu });
        else alanlar.set(yol, { durum: 'dolu', deger: String(d), coklu });
      }
    };
    gruplar.add('govde');
    gez(/** @type {Record<string, unknown>} */ (kok), 'govde');
    return { kok: '', ns: '', alanlar, gruplar, hata: null };
  }
  let kok;
  try { kok = xmlAyristir(metin); } catch (e) { return { kok: '', ns: '', alanlar, gruplar, hata: /** @type {Error} */ (e).message }; }
  let islem = kok;
  if (kok.yerel === 'Envelope') {
    const body = kok.cocuklar.find((c) => c.yerel === 'Body');
    if (!body || !body.cocuklar[0]) return { kok: '', ns: '', alanlar, gruplar, hata: 'SOAP zarfında Body ya da işlem öğesi yok.' };
    islem = body.cocuklar[0];
  }
  const onek = islem.ad.includes(':') ? islem.ad.slice(0, islem.ad.indexOf(':')) : '';
  const ns = (onek ? islem.oz[`xmlns:${onek}`] : islem.oz.xmlns) ?? '';
  /** @param {import('./servis-govdesi.mjs').XmlOgesi[]} ogeler @param {string} on */
  const gez = (ogeler, on) => {
    /** @type {Map<string, number>} */
    const sayac = new Map();
    for (const c of ogeler) sayac.set(c.yerel, (sayac.get(c.yerel) ?? 0) + 1);
    for (const c of ogeler) {
      const yol = on ? `${on}/${c.yerel}` : c.yerel;
      if (c.cocuklar.length) { if (!gruplar.has(yol)) { gruplar.add(yol); gez(c.cocuklar, yol); } continue; }
      if (alanlar.has(yol)) continue;
      const coklu = (sayac.get(c.yerel) ?? 0) > 1;
      const nil = Object.entries(c.oz).some(([o, d]) => o.slice(o.indexOf(':') + 1) === 'nil' && d === 'true');
      const d = c.metin.trim();
      alanlar.set(yol, nil ? { durum: 'nil', deger: '', coklu } : d === '' ? { durum: 'bos', deger: '', coklu } : { durum: 'dolu', deger: d, coklu });
    }
  };
  // Zarfsız ve kök işlem öğesi değil (şemanın üst alanı, ör. yalnız <Input>…</Input>): kök de bir alan / gruptur.
  if (kok.yerel !== 'Envelope' && s.kok && islem.yerel !== s.kok && (s.ustAlanlar ?? []).includes(islem.yerel)) {
    gez([islem], '');
    return { kok: s.kok, ns: '', alanlar, gruplar, hata: null };
  }
  gez(islem.cocuklar, '');
  return { kok: islem.yerel, ns, alanlar, gruplar, hata: null };
}

// ---------------------------------------------------------------------------------------
// Tip / biçim
// ---------------------------------------------------------------------------------------

/**
 * Değerlerden tip ve biçim (hepsi aynı kalıba uymalı). Uymazsa null (metin).
 * @param {string[]} degerler somut değerler @returns {{ tip: AlanTipi; bicim?: string } | null}
 */
export function tipCikar(degerler) {
  const l = degerler.filter(somutMu);
  if (!l.length) return null;
  const hepsi = (/** @type {RegExp} */ r) => l.every((x) => r.test(x));
  if (hepsi(/^\d{2}\.\d{2}\.\d{4}$/)) return { tip: 'tarih', bicim: 'dd.MM.yyyy' };
  if (hepsi(/^\d{2}\/\d{2}\/\d{4}$/)) return { tip: 'tarih', bicim: 'dd/MM/yyyy' };
  if (hepsi(/^\d{4}-\d{2}-\d{2}$/)) return { tip: 'tarih', bicim: 'yyyy-MM-dd' };
  if (hepsi(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)) return { tip: 'tarihSaat', bicim: "yyyy-MM-dd'T'HH:mm:ss" };
  const kume = new Set(l.map((x) => x.toLocaleLowerCase('tr')));
  const altKume = (/** @type {string[]} */ izin) => [...kume].every((x) => izin.includes(x));
  if (altKume(['true', 'false'])) return { tip: 'mantiksal', bicim: 'true/false' };
  // Tek harfli evet / hayır yalnız iki değer de görülünce (tek "E" bir kod da olabilir).
  if (altKume(['e', 'h']) && kume.size === 2) return { tip: 'mantiksal', bicim: 'E/H' };
  if (altKume(['y', 'n']) && kume.size === 2) return { tip: 'mantiksal', bicim: 'Y/N' };
  if (altKume(['1', '0']) && kume.size === 2) return { tip: 'mantiksal', bicim: '1/0' };
  // Baştaki sıfırlı (00123) ya da 10+ haneli sayı (kimlik / numara) koddur: tamsayı değil.
  if (hepsi(/^-?\d{1,9}$/) && !l.some((x) => /^-?0\d/.test(x))) return { tip: 'tamsayi' };
  if (hepsi(/^-?\d+([.,]\d+)?$/) && l.some((x) => /[.,]/.test(x))) {
    const virgul = l.some((x) => x.includes(','));
    const nokta = l.some((x) => x.includes('.'));
    if (!(virgul && nokta)) return { tip: 'ondalik', bicim: virgul ? 'ayrac:,' : 'ayrac:.' };
  }
  if (hepsi(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return { tip: 'metin', bicim: 'e-posta' };
  return null;
}

/** Kimlik benzeri ad (doldur-onerisi.mjs eş anlam sözlüğü). @param {string} ad */
const kimlikAdiMi = (ad) => ayniKavramMi(baslikNormal(ad), 'kimlikno');

// ---------------------------------------------------------------------------------------
// Tablo eşleştirme
// ---------------------------------------------------------------------------------------

/** Sözlük kavramı: adın tamamı, yoksa son sözcüğü. @param {string} ad */
function sozlukKavrami(ad) {
  const n = baslikNormal(ad);
  if (SOZLUK_HARITASI.has(n)) return SOZLUK_HARITASI.get(n) ?? null;
  const w = sozcukler(ad);
  return w.length > 1 ? SOZLUK_HARITASI.get(w[w.length - 1]) ?? null : null;
}

/**
 * Alan adı ile bir sütun / tablo adı arasındaki ad eşleşmesi: 'birebir' (esnek başlık aynı), 'esAnlam' (TR↔EN sözlüğü ya da
 * doldur-onerisi.mjs eş anlam kavramı), 'benzer' (kısaltma / baş). Yoksa null.
 * @param {string} alan @param {string} hedef @returns {'birebir' | 'esAnlam' | 'benzer' | null}
 */
export function adEslesmesi(alan, hedef) {
  const a = baslikNormal(alan);
  const b = baslikNormal(hedef);
  if (!a || !b) return null;
  if (a === b) return 'birebir';
  const ka = sozlukKavrami(alan);
  if (ka && ka === sozlukKavrami(hedef)) return 'esAnlam';
  if (ayniKavramMi(a, b)) return 'esAnlam';
  if (benzerAdMi(a, b)) return 'benzer';
  return null;
}

/**
 * Değerlerin sütunda bulunması: doğrudan (büyük / küçük harf yok sayılır) ya da sütunun karşılığıyla (hücre "Türkiye", karşılığı
 * "TR"). @param {string[]} degerler farklı somut değerler @param {AnalizTablosu} t @param {AnalizTablosu['sutunlar'][number]} c
 */
export function degerOrtusmesi(degerler, t, c) {
  const hucreler = new Map(t.satirlar.map((r) => r.degerler[c.ad]).filter(somutMu).map((x) => [kucuk(x), String(x)]));
  /** @type {Map<string, string>} kod → hücre metni */
  const kodlar = new Map();
  for (const [mt, k] of Object.entries(c.karsiliklar ?? {})) {
    for (const kod of [k?.servis, k?.sayfa]) if (typeof kod === 'string' && kod && hucreler.has(kucuk(mt))) kodlar.set(kucuk(kod), String(hucreler.get(kucuk(mt))));
  }
  /** @type {string[]} */
  const dogrudan = [];
  /** @type {Array<[string, string]>} */
  const karsilik = [];
  /** @type {string[]} */
  const eksik = [];
  for (const v of degerler) {
    if (hucreler.has(kucuk(v))) dogrudan.push(v);
    else if (kodlar.has(kucuk(v))) karsilik.push([v, /** @type {string} */ (kodlar.get(kucuk(v)))]);
    else eksik.push(v);
  }
  return { dogrudan, karsilik, eksik, bulunan: dogrudan.length + karsilik.length, toplam: degerler.length };
}

/** Örtüşme kanıtı: "TR, DE 2/2 Ülke.Kod'da var · TR ↔ Türkiye (karşılık)". @param {ReturnType<typeof degerOrtusmesi>} o @param {string} t @param {string} c @param {boolean} gizli */
function ortusmeKaniti(o, t, c, gizli) {
  if (!o.toplam) return '';
  const bulunan = [...o.dogrudan, ...o.karsilik.map(([v]) => v)];
  const parca = [`${gizli || !bulunan.length ? '' : `${liste(bulunan)} `}${o.bulunan}/${o.toplam} ${t}.${c}${bulunmaEki(c)} var`];
  if (o.karsilik.length && !gizli) parca.push(o.karsilik.slice(0, 3).map(([v, m]) => `${v} ↔ ${m} (karşılık)`).join(', '));
  if (o.eksik.length && !gizli) parca.push(`${liste(o.eksik, 3)} sütunda yok`);
  return parca.join(' · ');
}

/**
 * Alanın en iyi tablo sütunu adayı (ad + değer kanıtıyla). Gizli alan yalnız gizli sütuna, açık alan açık sütuna (ad eşleşmesi
 * olmadan gizli sütuna değil) önerilir. Kabul: ad (aynı / eş anlam / benzer) ya da tablo adı eşleşmesi ve değerlerden en az biri
 * sütunda (değer yoksa ad yeter); ad eşleşmesi yokken ≥ 2 farklı değerin hepsi aynı sütunda.
 * @param {string} ad alan adı @param {string[]} degerler farklı somut değerler @param {ReadonlyArray<AnalizTablosu>} tablolar @param {boolean} gizli
 * @returns {TabloEslesmesi | null}
 */
export function tabloEslesmesi(ad, degerler, tablolar, gizli = false) {
  /** @type {(TabloEslesmesi & { puan: number }) | null} */
  let en = null;
  const PUAN = { birebir: 3, esAnlam: 2, benzer: 1 };
  for (const t of tablolar) {
    if (t.baglam || String(t.id).startsWith('baglam_')) continue;
    const tabloAd = adEslesmesi(ad, t.ad);
    for (const c of t.sutunlar) {
      if (gizli && !c.gizli) continue;
      const adTur = adEslesmesi(ad, c.ad);
      if (c.gizli && !adTur) continue;
      const o = degerOrtusmesi(gizli || c.gizli ? [] : degerler, t, c);
      const oran = o.toplam ? o.bulunan / o.toplam : null;
      const adPuani = adTur ? PUAN[adTur] : 0;
      const tabloPuani = !adTur && tabloAd ? PUAN[tabloAd] : 0;
      // Yalnız değerden (ad eşleşmesi yok): değerlerden en az biri sütunda ve biçim aynı (ör. hep 5 hane) — zayıf öneri.
      const fi = ortakImza(degerler);
      const sutunImzasi = ortakImza(t.satirlar.map((r) => r.degerler[c.ad]).filter(somutMu).map(String));
      const desenAyni = Boolean(fi) && fi === sutunImzasi;
      // Ad eşleşmesi değerlerle çelişiyorsa (değer var, hiçbiri sütunda yok) aday sayılmaz.
      const kabul = (adPuani > 0 && (oran === null || oran > 0)) || (tabloPuani > 0 && oran !== null && oran > 0)
        || (!adPuani && !tabloPuani && o.bulunan >= 1 && (desenAyni || (o.toplam >= 2 && oran === 1)));
      if (!kabul) continue;
      const puan = adPuani * 10 + tabloPuani * 8 + (oran ?? 0.4) * 20 + (desenAyni ? 2 : 0) + (c.gizli === gizli ? 1 : 0);
      if (en && en.puan >= puan) continue;
      // Güçlü: ad (ya da tablo adı) eşleşmesi + en az bir değer sütunda; ya da aynı ad ve değer yok. Yalnız değerden: zayıf.
      const guclu = ((adPuani > 0 || tabloPuani > 0) && o.bulunan >= 1) || (adTur === 'birebir' && oran === null);
      const kanit = [
        adTur ? `Ad: ${ad} ↔ ${c.ad} (${AD_TURU[adTur]})` : tabloAd ? `Ad: ${ad} ↔ ${t.ad} tablosu (${AD_TURU[tabloAd]})` : 'Yalnız değerden (ad eşleşmiyor)',
        ortusmeKaniti(o, t.ad, c.ad, gizli || c.gizli),
        desenAyni && !adPuani && !tabloPuani ? 'desen aynı' : ''
      ].filter(Boolean).join(' · ');
      en = { tabloId: t.id, tablo: t.ad, sutun: c.ad, adTuru: adTur ?? (tabloAd ? 'tablo' : null), bulunan: o.bulunan, toplam: o.toplam,
        karsiliklar: o.karsilik, guc: guclu ? 'guclu' : 'zayif', kanit, puan };
    }
  }
  if (!en) return null;
  const { puan, ...x } = en;
  return x;
}

// ---------------------------------------------------------------------------------------
// Analiz
// ---------------------------------------------------------------------------------------

/** Öneri anahtarı (karar hatırlama): tür + yol + değer. @param {string} tur @param {string} yol @param {unknown} deger */
export const oneriAnahtari = (tur, yol, deger) => `${tur}|${yol}|${JSON.stringify(deger ?? null)}`;

/** Tablo adı temizliği (tablo-deposu ad kuralına uygun, ≤ 60). @param {string} s */
const tabloAdiYap = (s) => String(s).replace(/[^\p{L}\p{N} ._()-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * Örnek isteklerden metot analizi. Sonuç YALNIZ önerilerdir; hiçbir ayarı değiştirmez.
 * @param {AnalizGirdisi} g @returns {AnalizSonucu}
 */
export function servisAnalizi(g) {
  const tur = g.tur === 'rest' ? 'rest' : 'soap';
  const ekGizli = g.ekGizliAdlar ?? [];
  const m = g.mevcut ?? {};
  const kararlar = m.kararlar ?? {};
  const zorunlu = new Set(m.zorunlu ?? []);
  const baglar = m.baglar ?? {};
  const kurallar = m.kurallar ?? {};
  const varsayilanlar = m.varsayilanlar ?? {};
  const onsecili = new Set(m.onsecili ?? []);
  const tablolar = g.tablolar ?? [];
  const sema = g.sema ? semaBirlestir(g.sema, (g.ekler ?? []).map((e) => ({ yol: e.yol, tip: /** @type {AlanTipi} */ (e.tip ?? 'metin') }))) : null;
  const satirlar = sema ? alanSatirlari(sema.alanlar) : [];
  const yapraklar = new Map(satirlar.filter((x) => !x.grup).map((x) => [x.yol, x.alan]));
  const semaGruplari = new Set(satirlar.filter((x) => x.grup).map((x) => x.yol));
  /** @param {unknown} d @returns {OrnekDurumu} */
  const durumu = (d) => (d === 'basarili' || d === 'hata' ? d : 'bilinmiyor');
  const kaynaklar = [
    ...(g.ornekler ?? []).map((o, i) => ({ ad: String(o.ad ?? '').trim() || `Örnek ${i + 1}`, govde: o.govde, adli: true, durum: durumu(o.durum) })),
    ...(g.ekKanitlar ?? []).map((k, i) => ({ ad: String(k.ad ?? '').trim() || `Kanıt ${i + 1}`, govde: k.govde, adli: false, durum: durumu(k.durum) }))
  ];
  /** @type {Array<{ ad: string; adli: boolean; durum: OrnekDurumu; c: CozulenOrnek }>} */
  const cozulen = [];
  /** @type {Array<{ ad: string; mesaj: string }>} */
  const hatalar = [];
  for (const k of kaynaklar) {
    const c = ornekCoz(k.govde, { tur, ...(sema ? { kok: sema.kok, ustAlanlar: sema.alanlar.map((a) => a.ad) } : {}) });
    if (c.hata) hatalar.push({ ad: k.ad, mesaj: c.hata }); else cozulen.push({ ad: k.ad, adli: k.adli, durum: k.durum, c });
  }
  // SOAP: işlem öğesi metodun kökü değilse uyarı (başka metodun örneği yapıştırılmış olabilir).
  if (tur === 'soap' && sema?.kok) for (const x of cozulen) if (x.c.kok && x.c.kok !== sema.kok) hatalar.push({ ad: x.ad, mesaj: `İşlem öğesi "${x.c.kok}", metodun kökü "${sema.kok}" değil.` });
  const n = cozulen.length;
  const adlilar = cozulen.filter((x) => x.adli);
  /** @type {string[]} */
  const yollar = [...yapraklar.keys()];
  for (const x of cozulen) for (const y of x.c.alanlar.keys()) if (!yapraklar.has(y) && !semaGruplari.has(y) && !yollar.includes(y)) yollar.push(y);
  const doluMu = (/** @type {CozulenOrnek} */ c, /** @type {string} */ y) => c.alanlar.get(y)?.durum === 'dolu';
  const basarililar = cozulen.filter((x) => x.durum === 'basarili');
  // Veri (tablolar, "tabloya değer ekle"): hata veren örneklerin değerleri girmez.
  const veriOrnekleri = cozulen.filter((x) => x.durum !== 'hata');
  /**
   * Hata veren her örnek için: dolu / boş durumu farklı alanlar, en az farkla ayrıldığı başarılı örneğe göre. Tek fark (yalnız bir alan,
   * hata örneğinde boş / yok) → o alan için güçlü ipucu; çok fark → yalnız not.
   * @type {Array<{ ad: string; basarili: string; fark: string[] }>}
   */
  const hataFarklari = cozulen.filter((x) => x.durum === 'hata').flatMap((h) => {
    const adaylar = basarililar.map((s) => ({ s, fark: yollar.filter((y) => doluMu(s.c, y) !== doluMu(h.c, y)) })).sort((a, b) => a.fark.length - b.fark.length);
    return adaylar.length ? [{ ad: h.ad, basarili: adaylar[0].s.ad, fark: adaylar[0].fark }] : [];
  });
  /** @type {string[]} */
  const notlar = hataFarklari.filter((x) => x.fark.length > 1).map((x) => `Hata veren '${x.ad}' isteği başarılı '${x.basarili}' isteğinden ${x.fark.length} alanla ayrılıyor (${liste(x.fark.map(alanAdi), 5)}); zorunluluk kanıtı sayılmaz.`);

  /** @type {AlanAnalizi[]} */
  const alanlar = [];
  /** @type {AnalizOnerisi[]} */
  const tum = [];
  /** @param {Omit<AnalizOnerisi, 'anahtar'>} o */
  const ekle = (o) => { tum.push({ ...o, anahtar: oneriAnahtari(o.tur, o.yol, o.deger) }); };
  /** @type {Map<string, { ad: string; gizli: boolean; kume: string[] | null; tarih: boolean }>} yeni tabloya aday alanlar */
  const tabloAdaylari = new Map();
  /** Tablo bağı önerileri (aynı satır güveni için sonradan güçlendirilir). @type {Array<{ yol: string; aday: TabloEslesmesi; kanit: string; degistir: boolean }>} */
  const bagOnerileri = [];

  for (const yol of yollar) {
    const alan = yapraklar.get(yol) ?? null;
    const ad = alanAdi(yol);
    const gozlem = cozulen.map((x) => ({ ad: x.ad, adli: x.adli, durum: x.durum, v: x.c.alanlar.get(yol) }));
    const dolu = gozlem.filter((x) => x.v?.durum === 'dolu').length;
    const nil = gozlem.filter((x) => x.v?.durum === 'nil').length;
    const bos = gozlem.filter((x) => x.v?.durum === 'bos').length + nil;
    const yok = n - dolu - bos;
    const tumDegerler = gozlem.filter((x) => x.v?.durum === 'dolu' && somutMu(x.v.deger)).map((x) => /** @type {OrnekGozlemi} */ (x.v).deger);
    const degerler = [...new Set(tumDegerler)];
    // Veri için (yeni tablo / tabloya değer ekle): hata veren örnekler hariç.
    const veriDegerleri = [...new Set(gozlem.filter((x) => x.durum !== 'hata' && x.v?.durum === 'dolu' && somutMu(x.v.deger)).map((x) => /** @type {OrnekGozlemi} */ (x.v).deger))];
    const wsdlde = Boolean(alan && !alan.ek);
    const wsdlZorunlu = wsdlde ? Boolean(alan?.zorunlu) : null;
    // Tip: WSDL'deki alanda WSDL tipi geçerlidir (string → metin; rakamlardan oluşsa da tamsayı önerilmez). WSDL'de olmayan alanda
    // değerlerden çıkarılır; en az 3 dolu gözlem gerekir.
    const yeterli = tumDegerler.length >= EN_AZ_GOZLEM;
    const hamTip = tipCikar(tumDegerler);
    const tipOnerisi = hamTip;
    const evetHayir = hamTip?.tip === 'mantiksal';
    const gizliNeden = gizliAdMi(ad, ekGizli) ? 'adı gizli ad kuralına uyuyor'
      : degerler.length && degerler.every((x) => /^\d{11}$/.test(x)) ? '11 haneli sayı (kimlik benzeri)'
        : kimlikAdiMi(ad) ? 'adı kimlik numarası benzeri' : '';
    const gizli = Boolean(gizliNeden) || Boolean(kurallar[yol]?.gizli);
    const goster = (/** @type {string[]} */ l, k = 4) => (gizli ? `${l.length} değer (gizli)` : liste(l, k));
    // Mevcut bağın değer kanıtı / en iyi aday; silinmiş tabloya / sütuna bağ (kopuk).
    const bag = baglar[yol];
    const bagTablosu = bag?.tablo ? tablolar.find((t) => t.id === bag.tablo) : undefined;
    const bagSutunu = bagTablosu?.sutunlar.find((c) => c.ad === bag?.sutun);
    const kopuk = Boolean(bag?.tablo) && !String(bag?.tablo).startsWith('yeni:') && (!bagTablosu || !bagSutunu);
    const bagOrtusmesi = bagTablosu && bagSutunu && !gizli && !bagSutunu.gizli ? degerOrtusmesi(degerler, bagTablosu, bagSutunu) : null;
    const aday = degerler.length || n ? tabloEslesmesi(ad, gizli ? [] : degerler, tablolar, gizli) : null;
    // Başarı durumuna göre boş / yok gözlemler (hata verenler zorunluluk hesabına katılmaz).
    const dolmayan = gozlem.filter((x) => x.v?.durum !== 'dolu');
    const basariliBos = dolmayan.filter((x) => x.durum === 'basarili');
    const bilinmeyenBos = dolmayan.filter((x) => x.durum === 'bilinmiyor');
    const hesaptakiler = gozlem.filter((x) => x.durum !== 'hata');
    const bosMetniOf = (/** @type {typeof gozlem} */ l) => (l.every((x) => !x.v) ? 'yok' : l.every((x) => x.v) ? 'boş' : 'boş / yok');
    const ozet = n ? [
      `${dolu}/${n} örnekte dolu${bos ? `, ${bos} boş` : ''}${yok && dolu + bos ? `, ${yok} örnekte yok` : ''}`,
      basariliBos.length ? `başarılı ${basariliBos.length} istekte ${bosMetniOf(basariliBos)}` : '',
      wsdlde ? `WSDL: ${wsdlZorunlu ? 'zorunlu' : 'isteğe bağlı'}` : alan?.ek ? 'elle eklenen alan' : 'WSDL\'de yok',
      kopuk ? 'bağ kopuk (tablo ya da sütun silinmiş)' : bagOrtusmesi && bagOrtusmesi.toplam ? `bağ: ${ortusmeKaniti(bagOrtusmesi, bagTablosu?.ad ?? '', bagSutunu?.ad ?? '', false)}` : ''
    ].filter(Boolean).join(' · ') : '';
    alanlar.push({ yol, ad, wsdlde, ekli: Boolean(alan?.ek), wsdlZorunlu, dolu, bos, yok, toplam: n, degerler: gizli ? [] : degerler, gizli, ozet, tablo: aday });
    if (!n || !(dolu + bos)) continue;

    // 1) Alan listesi
    if (!alan) {
      ekle({ tur: 'alanEkle', yol, deger: { tip: (yeterli && tipOnerisi?.tip) || 'metin' }, guc: dolu + bos >= EN_AZ_GOZLEM ? 'guclu' : 'zayif',
        baslik: sema && sema.alanlar.length ? 'WSDL\'de yok — alan olarak eklensin mi?' : 'Alan listesi yok — alan olarak eklensin mi?',
        kanit: `${dolu + bos}/${n} örnekte var${yeterli && tipOnerisi ? ` · ${TIP_ADLARI[tipOnerisi.tip]}` : ''}` });
    }
    // 2) Zorunluluk — başarılı istekte boş / yok kesin kanıttır; her örnekte dolu olması yalnız zayıf ipucu (bkz. dosya başı).
    const ilkBasarili = basariliBos[0];
    const tekFark = hataFarklari.find((x) => x.fark.length === 1 && x.fark[0] === yol && !doluMu(/** @type {CozulenOrnek} */ (cozulen.find((c) => c.ad === x.ad)?.c), yol));
    if (ilkBasarili) {
      const kanit = `Başarılı '${ilkBasarili.ad}' isteğinde ${bosMetniOf([ilkBasarili])}${basariliBos.length > 1 ? ` (+${basariliBos.length - 1} başarılı istek)` : ''} → servis bu alan olmadan kabul ediyor`;
      const hepBos = hesaptakiler.every((x) => x.v?.durum !== 'dolu') && hesaptakiler.some((x) => x.v);
      const nilMi = hesaptakiler.filter((x) => x.v).every((x) => x.v?.durum === 'nil');
      if (hepBos) ekle({ tur: 'bosGonder', yol, deger: nilMi ? 'nil' : 'bos', guc: 'guclu', baslik: `Zorunlu değil — varsayılan "${nilMi ? 'nil gönder' : 'boş gönder'}"`, kanit });
      else ekle({ tur: 'zorunlu', yol, deger: false, guc: 'guclu', baslik: 'İsteğe bağlı', kanit });
      if (wsdlZorunlu) ekle({ tur: 'celiski', yol, deger: 'wsdlZorunlu', guc: 'not', baslik: 'WSDL ile çelişki', kanit: `WSDL'de zorunlu (minOccurs=1) ama başarılı ${basariliBos.length} istekte ${bosMetniOf(basariliBos)}` });
    } else if (tekFark) {
      ekle({ tur: 'zorunlu', yol, deger: true, guc: 'guclu', baslik: 'Zorunlu olabilir: bu alan eksikken hata verdi',
        kanit: `Hata veren '${tekFark.ad}' isteği başarılı '${tekFark.basarili}' isteğinden yalnız bu alanın boş / yok olmasıyla ayrılıyor (kesin değil)` });
    } else if (hesaptakiler.length) {
      const doluH = hesaptakiler.filter((x) => x.v?.durum === 'dolu').length;
      if (doluH === hesaptakiler.length) {
        if (!wsdlZorunlu) ekle({ tur: 'zorunlu', yol, deger: true, guc: 'zayif', baslik: 'Zorunlu olabilir', kanit: `${doluH}/${hesaptakiler.length} örnekte dolu; zorunlu olabilir (kesinleşmesi için WSDL ya da canlı doğrulama)` });
      } else if (bilinmeyenBos.length) {
        const bosH = hesaptakiler.filter((x) => x.v && x.v.durum !== 'dolu');
        if (wsdlZorunlu) ekle({ tur: 'celiski', yol, deger: 'wsdlZorunluBilinmiyor', guc: 'not', baslik: 'WSDL ile çelişki olabilir', kanit: `WSDL'de zorunlu; başarısı bilinmeyen ${bilinmeyenBos.length} örnekte ${bosMetniOf(bilinmeyenBos)}` });
        else if (doluH === 0 && bosH.length) {
          const nilMi = bosH.every((x) => x.v?.durum === 'nil');
          ekle({ tur: 'bosGonder', yol, deger: nilMi ? 'nil' : 'bos', guc: 'zayif', baslik: `İsteğe bağlı olabilir — varsayılan "${nilMi ? 'nil gönder' : 'boş gönder'}"`, kanit: `${bosH.length}/${hesaptakiler.length} örnekte boş (başarısı bilinmiyor)` });
        } else ekle({ tur: 'zorunlu', yol, deger: false, guc: 'zayif', baslik: 'İsteğe bağlı olabilir', kanit: `${doluH}/${hesaptakiler.length} örnekte dolu; ${bilinmeyenBos.length} örnekte ${bosMetniOf(bilinmeyenBos)} (başarısı bilinmiyor)` });
      }
    }
    // 3) Tip / biçim: yalnız WSDL'de olmayan alanda (elle eklenen ya da örnekten gelen) ve ≥ 3 gözlemle.
    if (yeterli && !wsdlde && tipOnerisi && (tipOnerisi.tip !== 'metin' || tipOnerisi.bicim)) {
      ekle({ tur: 'tip', yol, deger: tipOnerisi, guc: 'guclu', baslik: `Tip: ${TIP_ADLARI[tipOnerisi.tip]}${tipOnerisi.bicim ? ` (${BICIM_ADLARI[/** @type {keyof typeof BICIM_ADLARI} */ (tipOnerisi.bicim)] ?? tipOnerisi.bicim})` : ''}`,
        kanit: `${goster(degerler, 3)} → ${TIP_ADLARI[tipOnerisi.tip]} (${tumDegerler.length} gözlem)` });
    }
    // Değer listesi (kısıt DEĞİL; yalnız yeni tabloda ayrı liste tablosu olur): 2–EN_COK_KUME farklı değer, tekrar var; WSDL listesi /
    // evet-hayır / tarih / gizli alanda olmaz.
    const sayim = new Map();
    for (const x of gozlem) if (x.durum !== 'hata' && x.v?.durum === 'dolu' && somutMu(x.v.deger)) sayim.set(x.v.deger, (sayim.get(x.v.deger) ?? 0) + 1);
    const kume = !gizli && !alan?.secenekler && !evetHayir && hamTip?.tip !== 'tarih' && hamTip?.tip !== 'tarihSaat' && veriDegerleri.length >= 2 && veriDegerleri.length <= EN_COK_KUME
      && [...sayim.values()].reduce((a, b) => a + b, 0) > veriDegerleri.length ? [...veriDegerleri].sort((a, b) => a.localeCompare(b, 'tr')) : null;
    if (gizliNeden) ekle({ tur: 'gizli', yol, deger: true, guc: gizliNeden.startsWith('11') && tumDegerler.length < EN_AZ_GOZLEM ? 'zayif' : 'guclu', baslik: 'Gizli', kanit: gizliNeden });
    // 4) Kopuk bağ: bağlı tablo / sütun yok → en iyi eşleşmeye bağlansın mı / bağ kaldırılsın mı (ikisi de ayrı öneri).
    if (kopuk && bag) {
      const neyok = !bagTablosu ? 'bağlı tablo silinmiş' : `"${bagTablosu.ad}" tablosunda "${bag.sutun}" sütunu yok`;
      if (aday) ekle({ tur: 'kopukBag', yol, deger: { tablo: aday.tabloId, sutun: aday.sutun }, guc: 'zayif', baslik: `Kopuk bağ: ${aday.tablo} › ${aday.sutun} sütununa bağlansın mı?`, kanit: `${neyok} · ${aday.kanit}` });
      ekle({ tur: 'kopukBag', yol, deger: null, guc: 'zayif', baslik: 'Kopuk bağ: bağ kaldırılsın mı?', kanit: `${neyok}${aday ? '' : ' · eşleşen sütun bulunamadı'}` });
    }
    // Bağlı (mevcut) tabloda olmayan örnek değerleri: "tabloya şu değerler eklensin mi?" (uygulanırsa yeni satırlar).
    const veriEksik = bagOrtusmesi ? bagOrtusmesi.eksik.filter((v) => veriDegerleri.includes(v)) : [];
    if (!kopuk && bagTablosu && bagSutunu && bagOrtusmesi && bagOrtusmesi.bulunan > 0 && veriEksik.length) {
      const eksik = [...veriEksik].sort((a, b) => a.localeCompare(b, 'tr'));
      ekle({ tur: 'tabloyaDeger', yol, deger: { tablo: bagTablosu.id, sutun: bagSutunu.ad, degerler: eksik }, guc: 'zayif',
        baslik: `${bagTablosu.ad} › ${bagSutunu.ad} tablosuna şu değerler eklensin mi: ${liste(eksik, 6)}`,
        kanit: `Örneklerde var, tabloda yok (${eksik.length}/${bagOrtusmesi.toplam} değer); uygulanırsa her değer yeni satır olur` });
    }
    // 5) Tablo eşleşmesi: bağ yoksa en iyi aday; bağ varken yalnız bağlı sütunda hiçbir değer yoksa ve aday değer kanıtlıysa.
    if (!kopuk && aday && !(bag?.kural) && !varsayilanlar[yol]) {
      const ayni = bag && bag.tablo === aday.tabloId && bag.sutun === aday.sutun;
      const degistir = Boolean(bag && !ayni && bagOrtusmesi && bagOrtusmesi.toplam > 0 && bagOrtusmesi.bulunan === 0 && aday.bulunan > 0);
      const anahtar = oneriAnahtari('tabloBagi', yol, { tablo: aday.tabloId, sutun: aday.sutun });
      if (!bag || degistir || (ayni && onsecili.has(anahtar))) {
        bagOnerileri.push({ yol, aday, degistir,
          kanit: `${aday.kanit}${degistir ? ` · şu anki bağ: ${ortusmeKaniti(/** @type {ReturnType<typeof degerOrtusmesi>} */ (bagOrtusmesi), bagTablosu?.ad ?? '', bagSutunu?.ad ?? '', false)}` : ''}` });
      }
    }
    // 6) Yeni tabloya aday: değeri olan, bağı / adayı / kural varsayılanı olmayan alan.
    if (!aday && !bag && !varsayilanlar[yol] && (veriDegerleri.length || gizli)) tabloAdaylari.set(yol, { ad, gizli, kume, tarih: Boolean(hamTip && (hamTip.tip === 'tarih' || hamTip.tip === 'tarihSaat')) });
  }

  // --- Tablo bağları: aynı tabloya önerilen alanların değerleri aynı satırda birlikte bulunuyorsa güven artar --------------------
  /** @type {Map<string, typeof bagOnerileri>} */
  const tabloyaGore = new Map();
  for (const b of bagOnerileri) tabloyaGore.set(b.aday.tabloId, [...(tabloyaGore.get(b.aday.tabloId) ?? []), b]);
  for (const [tabloId, liste_] of tabloyaGore) {
    const t = tablolar.find((x) => x.id === tabloId);
    if (!t) continue;
    // Ortaklar: bu tabloya önerilen alanlar + zaten bu tabloya bağlı alanlar.
    const ortaklar = [...liste_.map((b) => ({ yol: b.yol, sutun: b.aday.sutun })),
      ...Object.entries(baglar).filter(([y, b]) => b?.tablo === tabloId && b.sutun && !liste_.some((x) => x.yol === y)).map(([y, b]) => ({ yol: y, sutun: /** @type {string} */ (b.sutun) }))];
    if (ortaklar.length < 2) continue;
    let birlikte = 0;
    for (const x of cozulen) {
      const dolular = ortaklar.filter((b) => doluMu(x.c, b.yol));
      if (dolular.length < 2 || !dolular.some((b) => liste_.some((y) => y.yol === b.yol))) continue;
      const uyar = t.satirlar.some((r) => dolular.every((b) => kucuk(r.degerler[b.sutun]) === kucuk(x.c.alanlar.get(b.yol)?.deger)));
      if (uyar) birlikte++;
    }
    if (!birlikte) continue;
    for (const b of liste_) {
      b.aday = { ...b.aday, guc: 'guclu' };
      b.kanit = `${b.kanit} · ${ortaklar.map((y) => alanAdi(y.yol)).join(' + ')} aynı ${t.ad} satırında (${birlikte} örnek)`;
    }
  }
  for (const b of bagOnerileri) {
    ekle({ tur: 'tabloBagi', yol: b.yol, deger: { tablo: b.aday.tabloId, sutun: b.aday.sutun }, guc: b.aday.guc, baslik: `Tablo: ${b.aday.tablo} › ${b.aday.sutun}`, kanit: b.kanit });
  }

  // --- Yeni tablo planları ----------------------------------------------------------------------
  /** @type {YeniTabloPlani[]} */
  const yeniTablolar = [];
  const kullanilan = new Set();
  const adVer = (/** @type {string} */ temel) => {
    let a = tabloAdiYap(temel) || 'Örnek değerler';
    for (let i = 2; kullanilan.has(kucuk(a)); i++) a = `${tabloAdiYap(temel).slice(0, 55)} ${i}`;
    kullanilan.add(kucuk(a));
    return a;
  };
  const ayniAdli = (/** @type {string} */ a) => { const t = tablolar.find((x) => kucuk(x.ad) === kucuk(a) && !x.baglam); return t ? { id: t.id, ad: t.ad } : null; };
  // Liste tabloları (izin verilen değerler): alan başına ayrı tablo, satırlar = farklı değerler.
  for (const [yol, x] of tabloAdaylari) {
    if (!x.kume) continue;
    const ad = adVer(x.ad);
    yeniTablolar.push({ id: `yeni:${ad}`, ad, tur: 'liste', sutunlar: [{ ad: x.ad, gizli: false }], satirlar: x.kume.map((v) => ({ ad: v, degerler: { [x.ad]: v } })),
      alanlar: [{ yol, sutun: x.ad }], ayniAdli: ayniAdli(ad) });
  }
  // Kayıt tabloları: alanlar kavram gruplarına göre (kişi / adres / iletişim / kart / giriş — hızlı testin kayıt planındaki gibi);
  // gruba girmeyenler bulundukları gruba (üst öğe) göre metodun tablosunda. Satır = adlı örnek; gizli sütunun değeri yazılmaz.
  /** @type {Map<string, string[]>} */
  const gruplar = new Map();
  for (const [yol, x] of tabloAdaylari) {
    if (x.kume) continue;
    const kavram = kavramGrubu(x.ad);
    const ust = yol.includes('/') ? yol.slice(0, yol.lastIndexOf('/')) : '';
    const parcalar = ust.split('/').filter(Boolean);
    const anahtar = kavram ?? (parcalar.length > 1 ? `${g.metot} ${parcalar[parcalar.length - 1]}` : g.metot);
    gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), yol]);
  }
  // Tek gruba düşüyorsa metot adı kalır.
  const tekGrup = gruplar.size === 1;
  for (const [grupAdi, uyeler] of gruplar) {
    const sutunAdlari = new Set();
    const sutunlar = uyeler.map((yol) => {
      const temel = tabloAdiYap(alanAdi(yol)) || 'Alan';
      let a = temel;
      for (let i = 2; sutunAdlari.has(kucuk(a)); i++) a = `${temel.slice(0, 55)} ${i}`;
      sutunAdlari.add(kucuk(a));
      return { yol, ad: a, gizli: /** @type {{ gizli: boolean }} */ (tabloAdaylari.get(yol)).gizli };
    });
    // Satır: alanlardan en az biri dolu olan adlı örnek (gizli sütunun değeri yazılmaz; satır yine açılır).
    const satirlar = adlilar.filter((x) => x.durum !== 'hata' && sutunlar.some((s) => doluMu(x.c, s.yol))).map((x) => ({
      ad: x.ad,
      degerler: Object.fromEntries(sutunlar.map((s) => {
        const v = x.c.alanlar.get(s.yol);
        return [s.ad, !s.gizli && v?.durum === 'dolu' && somutMu(v.deger) ? v.deger : null];
      }))
    }));
    // Örnek satırlarında görünmeyen farklı değerler (ek kanıttan) ayrı satır olarak eksik kalmasın.
    for (const s of sutunlar.filter((c) => !c.gizli)) {
      const gorulen = new Set(satirlar.map((x) => kucuk(x.degerler[s.ad])));
      for (const x of veriOrnekleri.filter((y) => !y.adli)) {
        const v = x.c.alanlar.get(s.yol);
        if (v?.durum !== 'dolu' || !somutMu(v.deger) || gorulen.has(kucuk(v.deger))) continue;
        gorulen.add(kucuk(v.deger));
        satirlar.push({ ad: v.deger.slice(0, 60), degerler: Object.fromEntries(sutunlar.map((c) => [c.ad, c.ad === s.ad ? v.deger : null])) });
      }
    }
    if (!satirlar.length) continue;
    const ad = adVer(tekGrup ? g.metot : grupAdi);
    yeniTablolar.push({ id: `yeni:${ad}`, ad, tur: 'kayit', sutunlar: sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })), satirlar,
      alanlar: sutunlar.map((s) => ({ yol: s.yol, sutun: s.ad })), ayniAdli: ayniAdli(ad) });
  }
  for (const t of yeniTablolar) {
    ekle({ tur: 'yeniTablo', yol: '', deger: t, guc: 'zayif', baslik: `Yeni tablo: ${t.ad}${t.tur === 'liste' ? ' (liste)' : ''}`,
      kanit: `${t.sutunlar.length} sütun (${liste(t.sutunlar.map((s) => `${s.ad}${s.gizli ? ' — gizli, değeri yazılmaz' : ''}`), 5)}) · ${t.satirlar.length} satır${t.tur === 'kayit' ? ` (${liste(t.satirlar.map((r) => r.ad), 4)})` : ''}${t.ayniAdli ? ` · "${t.ayniAdli.ad}" adlı tablo var` : ''}` });
  }

  // --- 6) Örnekler arası fark (adlı örnekler) ----------------------------------------------------
  /** @type {AnalizSonucu['farklar']} */
  const farklar = [];
  if (adlilar.length >= 2) {
    for (const yol of yollar) {
      const doluAdlar = adlilar.filter((x) => x.c.alanlar.get(yol)?.durum === 'dolu').map((x) => x.ad);
      const bosAdlar = adlilar.filter((x) => x.c.alanlar.get(yol)?.durum !== 'dolu').map((x) => x.ad);
      if (!doluAdlar.length || !bosAdlar.length) continue;
      farklar.push({ yol, dolu: doluAdlar, bos: bosAdlar, metin: `${alanAdi(yol)}: ${doluAdlar.join(', ')} örneğinde dolu, ${bosAdlar.join(', ')} örneğinde boş / yok → ${doluAdlar.join(', ')} senaryosunda istenir` });
    }
  }

  // --- Uygulanabilir öneriler: mevcut ayarla aynı olan ve karar verilmiş (uygulanan / yoksayılan) öneri sorulmaz ------------
  const ekler = new Map((g.ekler ?? []).map((e) => [e.yol, e]));
  const oneriler = tum.filter((o) => {
    if (kararlar[o.anahtar]) return false;
    const k = kurallar[o.yol] ?? {};
    switch (o.tur) {
      case 'zorunlu': return o.deger ? !zorunlu.has(o.yol) : zorunlu.has(o.yol);
      case 'bosGonder': return zorunlu.has(o.yol) || varsayilanlar[o.yol]?.kaynak !== o.deger;
      case 'tip': {
        const d = /** @type {{ tip: string; bicim?: string }} */ (o.deger);
        return !(k.tip === d.tip && (k.bicim ?? '') === (d.bicim ?? '')) && !(ekler.get(o.yol)?.tip === d.tip && !d.bicim);
      }
      case 'gizli': return !k.gizli;
      default: return true;
    }
  });
  const ilk = cozulen[0]?.c;
  return {
    toplam: n, adliSayisi: adlilar.length, hatalar, kok: (sema?.kok || ilk?.kok) ?? '', ns: (sema?.ns || ilk?.ns) ?? '',
    alanlar, oneriler, tumOneriler: tum, farklar, yeniTablolar, notlar
  };
}

/**
 * "Güçlü önerileri uygula"nın kapsadığı öneriler: güç sınıfı güçlü olanlar (çelişki notları ve zayıflar hariç; zayıflar tek tek uygulanır).
 * @param {ReadonlyArray<AnalizOnerisi>} l
 */
export const gucluOneriler = (l) => l.filter((o) => o.guc === 'guclu' && o.tur !== 'celiski');

/**
 * Öneriyi durum üzerinde uygular (DEĞİŞTİRİR) ve kararı "uygulandi" olarak yazar. Değer üretilmez: öneri örneklerden gelir.
 *  alanEkle → ekler · zorunlu → zorunlu kümesi · bosGonder → zorunluluk kalkar + varsayılan boş / nil · tip / gizli → alan kuralı
 *  (ek alanda tip de) · tabloyaDeger → bağlı tabloya eklenecek değerler (kayıtta yeni satır) · tabloBagi → alan bağı · yeniTablo → plan yeniTablolar'a, alanları planın sütunlarına
 *  ("yeni:<ad>" kimliğiyle; kayıtta gerçek tabloya çevrilir) · celiski → yalnız karar.
 * @param {AnalizDurumu} d @param {AnalizOnerisi} o
 */
export function oneriyiUygula(d, o) {
  const kural = () => (d.kurallar[o.yol] ??= {});
  switch (o.tur) {
    case 'alanEkle': if (!d.ekler.some((e) => e.yol === o.yol)) d.ekler.push({ yol: o.yol, tip: /** @type {{ tip: AlanTipi }} */ (o.deger).tip }); break;
    case 'zorunlu': if (o.deger) d.zorunlu.add(o.yol); else d.zorunlu.delete(o.yol); break;
    case 'kopukBag': if (o.deger) d.baglar[o.yol] = { .../** @type {{ tablo: string; sutun: string }} */ (o.deger) }; else delete d.baglar[o.yol]; break;
    case 'bosGonder': d.zorunlu.delete(o.yol); d.varsayilanlar[o.yol] = { kaynak: /** @type {'bos' | 'nil'} */ (o.deger) }; break;
    case 'tip': {
      const t = /** @type {{ tip: AlanTipi; bicim?: string }} */ (o.deger);
      Object.assign(kural(), { tip: t.tip }, t.bicim ? { bicim: t.bicim } : {});
      if (!t.bicim) delete kural().bicim;
      const e = d.ekler.find((x) => x.yol === o.yol);
      if (e) e.tip = t.tip;
      break;
    }
    case 'gizli': kural().gizli = true; break;
    case 'tabloyaDeger': d.tabloDegerleri.push(JSON.parse(JSON.stringify(o.deger))); break;
    case 'tabloBagi': d.baglar[o.yol] = { .../** @type {{ tablo: string; sutun: string }} */ (o.deger) }; break;
    case 'yeniTablo': {
      const t = /** @type {YeniTabloPlani} */ (o.deger);
      if (!d.yeniTablolar.some((x) => x.id === t.id)) d.yeniTablolar.push(JSON.parse(JSON.stringify(t)));
      for (const a of t.alanlar) if (!d.baglar[a.yol]) d.baglar[a.yol] = { tablo: t.id, sutun: a.sutun };
      break;
    }
    default: break;
  }
  d.kararlar[o.anahtar] = 'uygulandi';
}

/** "Yoksay": karar hatırlanır, öneri yeniden sorulmaz. @param {AnalizDurumu} d @param {AnalizOnerisi} o */
export function oneriyiYoksay(d, o) {
  if (o.tur === 'tabloBagi') {
    const b = d.baglar[o.yol];
    const v = /** @type {{ tablo: string; sutun: string }} */ (o.deger);
    if (b && b.tablo === v.tablo && b.sutun === v.sutun) delete d.baglar[o.yol];
  }
  d.kararlar[o.anahtar] = 'yoksayildi';
}

/**
 * Örnekler arası farkın B aşaması için saklanan biçimi (alan yolu, dolu / boş örnek adları).
 * @param {AnalizSonucu} a @returns {Array<{ yol: string; dolu: string[]; bos: string[] }>}
 */
export const farkKaydi = (a) => a.farklar.map((f) => ({ yol: f.yol, dolu: f.dolu, bos: f.bos }));
