// EKRAN AKIŞLARI (genel) — bir ekranın birden çok akışı (model.akislar; bkz. model-formu.mjs > akisModeli): listeleme,
// akış diyagramını modelden kurma (düzenleme / kopyalama / boş), kaydetme, varsayılan yapma, silme. Her değişiklik YENİ bir
// model sürümüdür (Model geçmişinde görünür); etkilenen senaryolar kaydetmeden önce gösterilir ve onay istenir.
//
//  - Diyagram, kayıttan sonraki diyagramla AYNI bloklarla kurulur (tarama/akis-tasarimi.mjs): modelin tüm akışlarındaki
//    alanlar/düğmeler/mesajlar "kayıtta yakalananlar" gibi sağ listeye gelir (YALNIZCA bu ekranın modeli — başka ekranın
//    alanı hiçbir zaman gelmez). Kaydedilen bloklar aynı çeviriyle (akistanKayitEnvanteri → kayitPaketiOlustur) adımlara
//    dönüşür; alanlar seçiciyle modeldeki mevcut tanımlarıyla (kimlik, seçenekler, koşul) eşleşir.
//  - Düzenlenemeyen modeller (ör. alt model adımı ya da seçicisi olmayan kimlik alanları içeren kodlu projeler): akış
//    görüntülenir, düzenlenmez (neden döner).
//  - Ortak akış (tur "ortakAkis"): tek akışı vardır; içeriği aynı diyagramla düzenlenir (içine ortak akış
//    eklenmez). Kaydedince onu kullanan ekranlar etki olarak gösterilir (ekranlar ortak akışın hep son sürümüyle koşar).
//    ortakAkisEkranlaraEkle: ortak akışı seçilen ekranların varsayılan akışının sonuna ekler (her ekran için yeni sürüm).
//  - Varsayılan akış model.adimlar'dır; varsayılan değişince akışı yazılı olmayan senaryolara eski varsayılan yazılır (akışları
//    değişmesin). Senaryosu olan ya da varsayılan akış silinemez.
// NOT: import.meta KULLANILMAZ. Tipler: akis-servisi.d.mts.

import { DepoHatasi, ekranModeliEkle, ekranModeliGetir, senaryoGetir, senaryoKaydet as depoSenaryoKaydet } from '../veritabani/depo.mjs';
import { ANA_AKIS_ID, akisListesi, akisModeli } from '../senaryolar/model-formu.mjs';
import { senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { akisPaleti, akistanKayitEnvanteri, bloklariAyikla } from '../tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, kimlikUret } from '../tarama/paket-olusturucu.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';
import { EkranDogrulamaHatasi, modeliDogrula } from './ekran-servisi.mjs';
import { paketTestVerisiOnizle, paketTestVerisiniYaz } from '../tablolar/paket-test-verisi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

const AD_EN_COK = 80;
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kopya = (/** @type {any} */ d) => JSON.parse(JSON.stringify(d));
const etiketi = (/** @type {Nesne} */ a) => (nesneMi(a.etiket) && (a.etiket.form || a.etiket.ekran)) || a.id;
/** Model alan tipi → sayfa envanteri türü. */
const TURLER = { secim: 'select', okluSecim: 'select', radyo: 'radio', onayKutusu: 'checkbox', tarih: 'date', sayi: 'number', dosya: 'file', telefon: 'tel' };

/** @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
function ekranModeli(vt, projeId, ekranId) {
  const ekran = vt.tek('SELECT id, anahtar, ad FROM ekranlar WHERE id = ? AND proje_id = ?', [ekranId, projeId]);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  const kayit = ekranModeliGetir(vt, ekranId);
  if (!kayit || !nesneMi(kayit.model) || kayit.model.tur === 'altModel' || !Array.isArray(kayit.model.adimlar)) throw new DepoHatasi('Bu ekranın modeli yok.');
  return { ekran: { id: String(ekran.id), anahtar: String(ekran.anahtar), ad: String(ekran.ad) }, model: /** @type {Nesne} */ (kayit.model), surum: kayit.surum };
}

/** Tüm akışların adımları (kimliğe göre tekil). @param {Nesne} model @returns {Nesne[]} */
function tumAdimlar(model) {
  const liste = [...model.adimlar, ...(Array.isArray(model.akislar) ? model.akislar.flatMap((/** @type {Nesne} */ a) => (Array.isArray(a.adimlar) ? a.adimlar : [])) : [])];
  const gorulen = new Set();
  return liste.filter((a) => nesneMi(a) && !gorulen.has(a.id) && (gorulen.add(a.id), true));
}

/** Seçicili (sayfadaki yeri bilinen) alan mı? @param {Nesne} alan */
const seciciliMi = (alan) => nesneMi(alan.konum) && typeof alan.konum.secici === 'string' && Boolean(alan.konum.secici);
/** Kimlik bloğu (bileşik kimlik alanı: profil / senaryoya özel kimlik → alt alanlar); diyagramda tek alan gibi taşınır. @param {Nesne} alan */
const kimlikBloguMu = (alan) => alan.tip === 'kimlikProfili' && alan.yapilandirma === 'senaryo';
/** Sabit / hesaplanan değerli alan (senaryodan bağımsız; ör. "bugün + 7" tarih, sabit ön seçim). @param {Nesne} alan */
const sabitAlanMi = (alan) => ['sabit', 'turetilmis'].includes(alan.yapilandirma) && alan.sabitDeger !== undefined && seciciliMi(alan);
/** Kimlik bloğunun diyagramdaki anahtarı (seçicisi olmadığı için). @param {Nesne} alan */
export const kimlikAnahtari = (alan) => `kimlik:${alan.id}`;
/** Alanın diyagramdaki (envanter) anahtarı. @param {Nesne} alan */
const envanterAnahtari = (alan) => (kimlikBloguMu(alan) ? kimlikAnahtari(alan) : String(alan.id));

/** Adımın düzenlenebilir alanları: senaryo alanı (seçicili), sabit değerli alan, kimlik bloğu ya da İşlemler (buton / çıktı). @param {Nesne} alan */
const temsilEdilir = (alan) => (alan.yapilandirma === 'senaryo' && seciciliMi(alan)) || sabitAlanMi(alan) || kimlikBloguMu(alan)
  || ['buton', 'cikti'].includes(alan.tip);

/** Akış diyagramda düzenlenebilir mi? (neden: düzenlenemezse Türkçe açıklama) @param {Nesne} model */
export function akisDuzenlenebilirMi(model) {
  const env = modeldenAkisEnvanteri(model);
  const adimlar = tumAdimlar(model);
  for (const [i, adim] of adimlar.entries()) {
    if (nesneMi(adim.altModel)) return { duzenlenebilir: false, neden: 'Modelde alt model adımı var (ör. ödeme kartı formu); bu ekranın akışı diyagramdan düzenlenemez, görüntülenir.' };
    const kayip = diyagramdaKaybolan(model, adimlar, i, env);
    if (kayip) return { duzenlenebilir: false, neden: `“${adim.baslik || adim.id}” adımında ${kayip} diyagramda gösterilemiyor (kaydedilince kaybolurdu); bu ekranın akışı görüntülenir, düzenlenmez.` };
    // Adım düzeyinde görünürlük: alanların koşuluna çevrilir; düğmeli adımda (düğme koşula bağlı basılır) çevrilemez.
    if (adimKosulu(adim, model) === false) return { duzenlenebilir: false, neden: `“${adim.baslik || adim.id}” adımının görünürlük koşulu diyagramda gösterilemiyor (düğmeli adım); bu ekranın akışı görüntülenir, düzenlenmez.` };
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (nesneMi(a) && !temsilEdilir(a)) {
          return { duzenlenebilir: false, neden: `“${etiketi(a)}” alanı diyagramda gösterilemiyor (sayfadaki yeri bilinmiyor ya da bileşik alan); bu ekranın akışı görüntülenir, düzenlenmez.` };
        }
      }
    }
  }
  return { duzenlenebilir: true, neden: null };
}

/**
 * Diyagramın karşılayamadığı (kaydedilince kaybolacak) adım özelliği; yoksa null.
 * @param {Nesne} model @param {Nesne[]} adimlar @param {number} i @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 */
function diyagramdaKaybolan(model, adimlar, i, env) {
  const adim = adimlar[i];
  if (typeof adim.pomMetodu === 'string') return 'kod yöntemi (pomMetodu)';
  const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
  for (const a of Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar.filter(nesneMi) : []) {
    if (a.tur === 'tikla' && typeof a.metin === 'string') return 'metinle süzülen düğme tıklaması';
    if (a.zamanAsimiSn !== undefined) return 'aksiyon başına bekleme süresi';
    if (a.tur === 'bekle' && (typeof a.secici === 'string' || a.durum !== undefined)) return 'öğeye bağlı bekleme';
  }
  const g = kosu.basariGostergesi;
  const secenekler = !nesneMi(g) ? [] : g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler.filter(nesneMi) : [g];
  if (secenekler.some((s) => s.tur === 'url')) return 'adres (url) başarı göstergesi';
  const sonAdim = i === adimlar.length - 1 || adimlar.slice(i + 1).every((x) => nesneMi(x.ortakAkis) || nesneMi(x.sqlKontrolu) || nesneMi(x.dosyaKontrolu));
  if (sonAdim && secenekler.some((s) => s.tur === 'eleman')) return 'öğe (eleman) başarı göstergesi';
  // Hata göstergesi (uyarısız da olsa) ve öğe "veya" göstergesi kaydederken adımın mevcut tanımından korunur (paket-olusturucu).
  // İsteğe bağlı adım: diyagramda yalnızca "her senaryoda basılmaz" düğmenin açtığı alanlar olarak (önceki adım o düğme).
  if (kapsamAyari(model, adim)) {
    const alanli = (Array.isArray(adim.bolumler) ? adim.bolumler : []).some((b) => nesneMi(b) && Array.isArray(b.alanlar) && b.alanlar.some((x) => nesneMi(x) && !['buton', 'cikti'].includes(x.tip)));
    const onceki = adimlar[i - 1];
    const dugmeli = Array.isArray(kosu.aksiyonlar) && kosu.aksiyonlar.some((x) => nesneMi(x) && x.tur === 'tikla');
    const oncekiAcici = onceki && kapsamAyari(model, onceki) === kapsamAyari(model, adim) && nesneMi(onceki.kosu) && Array.isArray(onceki.kosu.aksiyonlar) && onceki.kosu.aksiyonlar.some((x) => nesneMi(x) && x.tur === 'tikla');
    if (alanli && (dugmeli || !oncekiAcici)) return 'isteğe bağlı alanlı adım';
  }
  // Koşullar: diyagramda yalnızca akıştaki bir seçim alanının değerlerine bağlı koşul gösterilir.
  const adimK = adimKosulu(adim, model);
  if (nesneMi(adimK) && !kosulTemsilEdilir(env, adimK)) return 'görünürlük koşulu';
  for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
    for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
      if (!nesneMi(a) || !nesneMi(a.gorunurluk)) continue;
      const ifade = typeof a.gorunurluk.kosul === 'string' ? model.kosullar?.[a.gorunurluk.kosul]?.ifade : a.gorunurluk.ifade;
      const k = nesneMi(ifade) && typeof ifade.alan === 'string' && (Array.isArray(ifade.icinde) || typeof ifade.esit === 'string')
        ? { secim: ifade.alan, degerler: Array.isArray(ifade.icinde) ? ifade.icinde.map(String) : [String(ifade.esit)] } : null;
      if (!k || !kosulTemsilEdilir(env, k)) return `“${etiketi(a)}” alanının görünürlük koşulu`;
    }
  }
  return null;
}

/** Koşul diyagramda gösterilebilir mi (seçim alanı envanterde select/radio ve değerleri seçeneklerinden)? @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env @param {{ secim: string; degerler: string[] }} k */
function kosulTemsilEdilir(env, k) {
  const s = env.alanlar.find((x) => x.alan.anahtar === k.secim)?.alan;
  if (!s || !['select', 'radio'].includes(s.tur)) return false;
  const degerler = new Set([...(s.secenekler ?? []), ...(s.radyolar ?? [])].map((x) => x.deger));
  return k.degerler.length > 0 && k.degerler.every((d) => degerler.has(d));
}

/**
 * Adımın (isteğe bağlı adım ayarı olmayan) görünürlük koşulu → alanlara uygulanacak { secim, degerler }; koşul yoksa null,
 * diyagramda karşılanamıyorsa false (düğmeli adım ya da seçim alanına bağlı olmayan koşul).
 * @param {Nesne} adim @param {Nesne} model
 */
function adimKosulu(adim, model) {
  const g = adim.gorunurluk;
  if (!nesneMi(g)) return null;
  const aksiyonlu = nesneMi(adim.kosu) && Array.isArray(adim.kosu.aksiyonlar) && adim.kosu.aksiyonlar.some((/** @type {Nesne} */ a) => nesneMi(a) && a.tur === 'tikla');
  const ifade = typeof g.kosul === 'string' ? model.kosullar?.[g.kosul]?.ifade : g.ifade;
  if (nesneMi(ifade) && typeof ifade.senaryoAyari === 'string') return null; // isteğe bağlı adım (kapsam ayarı): ayrı işlenir
  if (aksiyonlu) return false;
  if (nesneMi(ifade) && typeof ifade.alan === 'string' && (Array.isArray(ifade.icinde) || typeof ifade.esit === 'string')) {
    return { secim: ifade.alan, degerler: Array.isArray(ifade.icinde) ? ifade.icinde.map(String) : [String(ifade.esit)] };
  }
  return false;
}

/**
 * Modelden "kayıtta yakalananlar" (tüm akışların alanları, düğmeleri, mesajları; değer yok) — diyagram düzenleyicisinin sağ
 * listesi ve blok çevirisi için sentetik akış envanteri.
 * @param {Nesne} model @returns {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri}
 */
export function modeldenAkisEnvanteri(model) {
  /** @type {Map<string, import('../tarama/paket-olusturucu.d.mts').HamAlan>} */
  const alanlar = new Map();
  /** @type {import('../tarama/paket-olusturucu.d.mts').KayitOgesi[]} */
  const dugmeler = [];
  /** @type {import('../tarama/paket-olusturucu.d.mts').KayitOgesi[]} */
  const mesajlar = [];
  const ekle = (/** @type {import('../tarama/paket-olusturucu.d.mts').KayitOgesi[]} */ liste, /** @type {import('../tarama/paket-olusturucu.d.mts').KayitOgesi} */ o) => {
    if (!liste.some((x) => x.secici === o.secici && x.metin === o.metin)) liste.push(o);
  };
  for (const adim of tumAdimlar(model)) {
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || alanlar.has(envanterAnahtari(a))) continue;
        if (kimlikBloguMu(a)) {
          // Kimlik bloğu: seçicisi yok (alt alanları var); diyagramda tek alan, anahtarı "kimlik:<id>".
          const anahtar = kimlikAnahtari(a);
          alanlar.set(anahtar, {
            anahtar, tur: 'kimlik', etiket: String(etiketi(a)), etiketKaynagi: null, kimlik: null, ad: null, secici: anahtar,
            kirilganlik: 'orta', adaySeciciler: [anahtar], zorunlu: a.mutlakaGorunmeli === true, devreDisi: false, saltOkunur: false, coklu: false,
            bolum: { anahtar: String(b.id), baslik: String(b.baslik || '') },
            not: `kimlik bloğu: ${(Array.isArray(a.altAlanlar) ? a.altAlanlar : []).filter(nesneMi).map((/** @type {Nesne} */ x) => etiketi(x)).join(', ')}`
          });
          continue;
        }
        if (!(a.yapilandirma === 'senaryo' && seciciliMi(a)) && !sabitAlanMi(a)) continue;
        const tur = /** @type {Record<string, string>} */ (TURLER)[a.tip] ?? 'text';
        // Düz liste + bağlı listeler (bagimlilik.secenekHaritasi; ör. kapsama göre alternatif), tekrarsız.
        const hamSecenekler = [...(Array.isArray(a.secenekler) ? a.secenekler : []),
          ...(nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [])];
        const secenekler = hamSecenekler.filter(nesneMi).map((/** @type {Nesne} */ s) => ({
          deger: String(s.senaryoDegeri ?? s.deger), metin: String(s.formMetni || s.metin || s.deger)
        })).filter((s, i, l) => l.findIndex((x) => x.deger === s.deger) === i);
        alanlar.set(a.id, {
          anahtar: a.id, tur, etiket: String(etiketi(a)), etiketKaynagi: null, kimlik: null, ad: null, secici: a.konum.secici,
          kirilganlik: a.konum.kirilganlik || 'orta', adaySeciciler: [a.konum.secici], zorunlu: a.mutlakaGorunmeli === true,
          devreDisi: false, saltOkunur: false, coklu: false,
          ...(tur === 'select' ? { secenekler } : {}),
          ...(tur === 'radio' ? { radyolar: secenekler.map((s) => ({ deger: s.deger, metin: s.metin, secici: null })) } : {}),
          bolum: { anahtar: String(b.id), baslik: String(b.baslik || '') },
          ...(sabitAlanMi(a) ? { not: `sabit değer: ${String(a.sabitDeger)}` } : {})
        });
      }
    }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    for (const x of Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : []) {
      if (nesneMi(x) && x.tur === 'tikla' && typeof x.secici === 'string') ekle(dugmeler, { secici: x.secici, metin: typeof x.aciklama === 'string' ? x.aciklama : null });
    }
    // Dosya adımının indirmeyi başlatan düğmesi de sağ listede (diyagramdaki dosya bloğu onu seçer).
    const t = nesneMi(adim.dosyaKontrolu) && nesneMi(adim.dosyaKontrolu.tetikleyici) ? adim.dosyaKontrolu.tetikleyici : null;
    if (t && typeof t.secici === 'string') ekle(dugmeler, { secici: t.secici, metin: typeof t.aciklama === 'string' ? t.aciklama : null });
    for (const g of metinGostergeleri(kosu.basariGostergesi)) ekle(mesajlar, { secici: typeof g.secici === 'string' ? g.secici : '', metin: g.deger });
    for (const g of desenGostergeleri(kosu.basariGostergesi)) ekle(mesajlar, { secici: typeof g.secici === 'string' ? g.secici : '', metin: g.deger });
    for (const u of uyariListesi(kosu)) ekle(mesajlar, { secici: typeof u.secici === 'string' ? u.secici : '', metin: u.metin });
  }
  return {
    kip: 'kayit', bicim: 'akis', profil: null, baslik: String(model.ad || ''),
    alanlar: [...alanlar.values()].map((alan) => ({ alan, secili: true })), dugmeler, mesajlar, olaylar: [], engellenenler: [], notlar: []
  };
}

/** Başarı göstergesinin metin göstergeleri ("veya" grubunda her seçenek). @param {unknown} g @returns {Array<{ deger: string; secici?: unknown }>} */
function metinGostergeleri(g) {
  const liste = nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  return liste.filter((x) => nesneMi(x) && x.tur === 'metin' && typeof x.deger === 'string');
}

/** Başarı göstergesinin kalıp (düzenli ifade) göstergeleri. @param {unknown} g @returns {Array<{ deger: string; secici?: unknown }>} */
function desenGostergeleri(g) {
  const liste = nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  return liste.filter((x) => nesneMi(x) && x.tur === 'desen' && typeof x.deger === 'string');
}

/** Adımın kabul edilen uyarıları (kosu.uyarilar). @param {Nesne} kosu @returns {Array<{ metin: string; secici?: unknown }>} */
function uyariListesi(kosu) {
  return Array.isArray(kosu.uyarilar) ? kosu.uyarilar.filter((u) => nesneMi(u) && typeof u.metin === 'string' && u.metin) : [];
}

/** Adımı isteğe bağlı yapan senaryo ayarı (senaryoAyari, esit: true). @param {Nesne} model @param {Nesne} adim */
function kapsamAyari(model, adim) {
  const g = adim.gorunurluk;
  if (!nesneMi(g)) return null;
  const ifade = typeof g.kosul === 'string' ? model.kosullar?.[g.kosul]?.ifade : g.ifade;
  return nesneMi(ifade) && typeof ifade.senaryoAyari === 'string' && ifade.esit === true ? ifade.senaryoAyari : null;
}

/**
 * Akışın adımlarından diyagram blokları (kayıt çevirisinin tersi): adım → alan grubu (+ zorunluluk, koşul), koşu aksiyonları
 * (bekleme, düğme — isteğe bağlı adımdaysa "her senaryoda basılmaz"), metin göstergesi → beklenen mesaj; sonunda Bitir.
 * @param {Nesne} model tam model @param {Nesne[]} adimlar akışın adımları @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 * @returns {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]}
 */
export function adimlardanBloklar(model, adimlar, env) {
  /** @type {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]} */
  const bloklar = [];
  const sirali = adimlar.filter(nesneMi).slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
  for (const adim of sirali) {
    const istegeBagli = Boolean(kapsamAyari(model, adim));
    // Ortak akış adımı: tek blok (içi ortak akışın kendi yerinde düzenlenir).
    if (nesneMi(adim.ortakAkis) && typeof adim.ortakAkis.dosya === 'string') {
      bloklar.push({ tur: 'ortak', dosya: adim.ortakAkis.dosya, ad: String(adim.baslik || adim.id), istegeBagli });
      continue;
    }
    // SQL sorgusu adımı: tek blok (tanım aynen).
    if (nesneMi(adim.sqlKontrolu)) {
      bloklar.push({ tur: 'sql', ad: String(adim.baslik || adim.id), sql: kopya(adim.sqlKontrolu) });
      continue;
    }
    // Dosya doğrulama adımı: tek blok (tetikleyici düğme sağ listedeki sırasıyla; tanım aynen).
    if (nesneMi(adim.dosyaKontrolu)) {
      const { tetikleyici, ...tanim } = kopya(adim.dosyaKontrolu);
      const d = nesneMi(tetikleyici) ? env.dugmeler.findIndex((o) => o.secici === tetikleyici.secici && o.metin === (typeof tetikleyici.aciklama === 'string' ? tetikleyici.aciklama : null)) : -1;
      bloklar.push({ tur: 'dosya', ad: String(adim.baslik || adim.id), dugme: d, dosya: tanim });
      continue;
    }
    // Yeniden giriş adımı: tek blok (profil: giriş profilinin adı; yoksa ortamın varsayılanı).
    if (nesneMi(adim.yenidenGiris)) {
      bloklar.push({ tur: 'giris', ad: String(adim.baslik || adim.id), profil: typeof adim.yenidenGiris.profil === 'string' && adim.yenidenGiris.profil ? adim.yenidenGiris.profil : null });
      continue;
    }
    // Adım düzeyindeki koşul (düğmesiz adım) alanlara taşınır: alanın kendi koşulu yoksa adımınki yazılır.
    const adimKosul = adimKosulu(adim, model);
    const alanlar = [];
    /** @type {string[]} */
    const zorunlu = [];
    /** @type {Record<string, { secim: string; degerler: string[] } | null>} */
    const kosullar = {};
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || ['buton', 'cikti'].includes(a.tip)) continue;
        const anahtar = envanterAnahtari(a);
        if (!env.alanlar.some((x) => x.alan.anahtar === anahtar)) continue;
        alanlar.push(anahtar);
        if (a.mutlakaGorunmeli === true) zorunlu.push(anahtar);
        const g = a.gorunurluk;
        const ifade = nesneMi(g) ? (typeof g.kosul === 'string' ? model.kosullar?.[g.kosul]?.ifade : g.ifade) : null;
        if (!g) kosullar[anahtar] = nesneMi(adimKosul) ? adimKosul : null;
        else if (nesneMi(ifade) && typeof ifade.alan === 'string' && (Array.isArray(ifade.icinde) || typeof ifade.esit === 'string')) {
          kosullar[anahtar] = { secim: ifade.alan, degerler: Array.isArray(ifade.icinde) ? ifade.icinde.map(String) : [ifade.esit] };
        }
        // Başka biçimdeki koşul (ör. çalışma anında görünürse): yazılmaz → modeldeki koşul korunur.
      }
    }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    const aksiyonlar = Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar.filter(nesneMi) : [];
    const tikla = aksiyonlar.some((x) => x.tur === 'tikla');
    if (alanlar.length || (!istegeBagli && tikla)) bloklar.push({ tur: 'alanlar', ad: String(adim.baslik || adim.id), alanlar, zorunlu, kosullar });
    // İsteğe bağlı düğme adımı: aksiyon önce (grubundan sonra); açtığı alanlar ayrı adımdaysa yukarıda grup olarak geldi.
    for (const x of aksiyonlar) {
      if (x.tur === 'bekle' && Number.isInteger(x.sureSn)) bloklar.push({ tur: 'bekle', saniye: x.sureSn });
      else if (x.tur === 'tikla') {
        const d = env.dugmeler.findIndex((o) => o.secici === x.secici && o.metin === (typeof x.aciklama === 'string' ? x.aciklama : null));
        // Adımın sonucu bekleme süresi (kosu.zamanAsimiSn) ilerleme düğmesinde taşınır.
        const sure = !istegeBagli && Number.isInteger(kosu.zamanAsimiSn) ? { zamanAsimiSn: kosu.zamanAsimiSn } : {};
        if (d >= 0) bloklar.push({ tur: 'aksiyon', dugme: d, istegeBagli, ...sure });
      }
    }
    // Beklenen mesaj(lar): "veya" grubunun her seçeneği ardışık bir mesaj bloğu olur.
    for (const g of metinGostergeleri(kosu.basariGostergesi)) {
      const m = env.mesajlar.findIndex((o) => o.metin === g.deger && o.secici === (typeof g.secici === 'string' ? g.secici : ''));
      bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: g.deger });
    }
    // Kalıp göstergesi (ör. toplam sıfırdan farklı: [1-9]): öğesi mesajın yeri, metni düzenli ifade.
    for (const g of desenGostergeleri(kosu.basariGostergesi)) {
      const m = env.mesajlar.findIndex((o) => o.metin === g.deger && o.secici === (typeof g.secici === 'string' ? g.secici : ''));
      bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: g.deger, desen: true });
    }
    // Kabul edilen uyarılar: başarı mesajlarının ardından "Uyarı" işaretli mesaj blokları.
    for (const u of uyariListesi(kosu)) {
      const m = env.mesajlar.findIndex((o) => o.metin === u.metin && o.secici === (typeof u.secici === 'string' ? u.secici : ''));
      bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: u.metin, uyari: true });
    }
  }
  bloklar.push({ tur: 'bitir' });
  return bloklar;
}

/** Ekranın akışları + her akışı kullanan senaryo sayısı. @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
export function akislariListele(vt, projeId, ekranId) {
  const { model } = ekranModeli(vt, projeId, ekranId);
  const liste = akisListesi(model);
  const varsayilan = liste[0]?.id ?? ANA_AKIS_ID;
  /** @type {Record<string, number>} */
  const sayilar = Object.fromEntries(liste.map((a) => [a.id, 0]));
  for (const s of vt.tumu('SELECT icerik_json FROM senaryolar WHERE ekran_id = ?', [ekranId])) {
    let id = null;
    try { id = senaryoAkisi(JSON.parse(String(s.icerik_json))); } catch { id = null; }
    const k = id && id in sayilar ? id : varsayilan;
    sayilar[k] = (sayilar[k] ?? 0) + 1;
  }
  const ortakAkis = model.tur === 'ortakAkis';
  return {
    akislar: liste.map((a) => ({ ...a, senaryoSayisi: sayilar[a.id] ?? 0 })), ...akisDuzenlenebilirMi(model), ortakAkis,
    ...(ortakAkis ? { kullananlar: ortakAkisKullananlari(vt, projeId, ekranId) } : {})
  };
}

/** Ortak akış ekranının model dosyası adı ("<anahtar>.model.json"; adımlardaki başvuru). @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
function ortakAkisDosyasi(vt, projeId, ekranId) {
  const { ekran, model } = ekranModeli(vt, projeId, ekranId);
  if (model.tur !== 'ortakAkis') throw new DepoHatasi('Bu ekran bir ortak akış değil.');
  return { ekran, dosya: `${ekran.anahtar}.model.json` };
}

/** Modelin (tüm akışları) bu ortak akışı kullanan akışlarının adları. @param {Nesne} model @param {string} dosya */
function ortakAkisiKullanan(model, dosya) {
  return akisListesi(model).filter((a) => {
    const m = akisModeli(model, a.id);
    return Boolean(m && Array.isArray(m.adimlar) && m.adimlar.some((/** @type {Nesne} */ x) => nesneMi(x) && nesneMi(x.ortakAkis) && x.ortakAkis.dosya === dosya));
  }).map((a) => a.ad);
}

/** Projenin ekranları (ortak akış ve alt modeller hariç), modelleri ve senaryo sayılarıyla. @param {Veritabani} vt @param {string} projeId */
function projeEkranlari(vt, projeId) {
  /** @type {Array<{ id: string; ad: string; model: Nesne; senaryoSayisi: number }>} */
  const liste = [];
  for (const e of vt.tumu("SELECT id, ad FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi' ORDER BY ad", [projeId])) {
    const k = ekranModeliGetir(vt, String(e.id));
    if (!k || !nesneMi(k.model) || ['ortakAkis', 'altModel'].includes(k.model.tur) || !Array.isArray(k.model.adimlar)) continue;
    const sayi = vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [String(e.id)]);
    liste.push({ id: String(e.id), ad: String(e.ad), model: /** @type {Nesne} */ (k.model), senaryoSayisi: Number(sayi?.n ?? 0) });
  }
  return liste;
}

/** Ortak akışı kullanan ekranlar (akış adları + senaryo sayısı). @param {Veritabani} vt @param {string} projeId @param {string} ortakEkranId */
function ortakAkisKullananlari(vt, projeId, ortakEkranId) {
  const { dosya } = ortakAkisDosyasi(vt, projeId, ortakEkranId);
  return projeEkranlari(vt, projeId).map((e) => ({ id: e.id, ad: e.ad, akislar: ortakAkisiKullanan(e.model, dosya), senaryoSayisi: e.senaryoSayisi }))
    .filter((e) => e.akislar.length);
}

/**
 * "Ekranlara ekle" listesi: projenin ekranları; her biri eklenebilir mi (zaten varsayılan akışında var / akışı diyagramdan
 * düzenlenemiyor ise hayır, nedeniyle). @param {Veritabani} vt @param {string} projeId @param {string} ortakEkranId
 */
export function ortakAkisAdaylari(vt, projeId, ortakEkranId) {
  const { ekran, dosya } = ortakAkisDosyasi(vt, projeId, ortakEkranId);
  const ekranlar = projeEkranlari(vt, projeId).map((e) => {
    const varsayilan = akisListesi(e.model)[0];
    const kullanan = ortakAkisiKullanan(e.model, dosya);
    const d = akisDuzenlenebilirMi(e.model);
    const neden = kullanan.includes(varsayilan.ad) ? `Varsayılan akışında (${varsayilan.ad}) zaten var.` : d.neden;
    return { id: e.id, ad: e.ad, varsayilanAkis: varsayilan.ad, senaryoSayisi: e.senaryoSayisi, kullananAkislar: kullanan, eklenebilir: !neden, neden };
  });
  return { ortakAkis: { id: ekran.id, ad: ekran.ad, dosya }, ekranlar };
}

/**
 * Ortak akışı seçilen ekranların VARSAYILAN akışının sonuna ekler (diyagramdaki "+ > Ortak akış" ile aynı çeviri; her ekran
 * için yeni model sürümü). istegeBagli: senaryoda “… dahil” işaretlenince koşar (mevcut senaryolar etkilenmez); değilse
 * varsayılan akıştaki tüm senaryolar koşar. onay: false → yalnızca etki (ekran, akış, senaryo sayısı); true → yazar.
 * Eklenemeyen ekran seçilirse hiçbiri yazılmaz (DepoHatasi).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortakEkranId
 * @param {{ ekranIdleri: unknown; istegeBagli?: boolean; onay?: boolean }} g
 */
export function ortakAkisEkranlaraEkle(vt, projeId, ortakEkranId, g) {
  const { ortakAkis, ekranlar } = ortakAkisAdaylari(vt, projeId, ortakEkranId);
  const idler = Array.isArray(g.ekranIdleri) ? [...new Set(g.ekranIdleri.filter((x) => typeof x === 'string'))] : [];
  if (!idler.length) throw new DepoHatasi('En az bir ekran seçin.');
  const secilen = idler.map((id) => {
    const e = ekranlar.find((x) => x.id === id);
    if (!e) throw new DepoHatasi('Seçilen ekranlardan biri bulunamadı.');
    if (!e.eklenebilir) throw new DepoHatasi(`“${e.ad}”: ${e.neden}`);
    return e;
  });
  const etki = secilen.map((e) => ({ id: e.id, ad: e.ad, akis: e.varsayilanAkis, senaryoSayisi: e.senaryoSayisi }));
  // Önce hepsi doğrulanır (onaysız kayıt: yalnızca doğrulama); biri hatalıysa hiçbiri yazılmaz.
  const hazirlik = secilen.map((e) => {
    const { model } = ekranModeli(vt, projeId, e.id);
    const akis = akisListesi(model)[0];
    const bloklar = adimlardanBloklar(model, /** @type {Nesne} */ (akisModeli(model, akis.id)).adimlar, modeldenAkisEnvanteri(model));
    bloklar.splice(bloklar.length - 1, 0, { tur: 'ortak', dosya: ortakAkis.dosya, ad: ortakAkis.ad, istegeBagli: g.istegeBagli === true });
    const girdi = { akisId: akis.id, ad: akis.ad, bloklar };
    try { akisKaydet(vt, projeId, e.id, { ...girdi, onay: false }); } catch (hataNesnesi) {
      const mesaj = hataNesnesi instanceof EkranDogrulamaHatasi && hataNesnesi.hatalar.length ? hataNesnesi.hatalar.map((/** @type {Nesne} */ x) => x.mesaj).join(' ') : /** @type {Error} */ (hataNesnesi).message;
      throw new DepoHatasi(`“${e.ad}” akışına eklenemedi: ${mesaj}`);
    }
    return { e, girdi };
  });
  if (g.onay !== true) return { etki: { ortakAkis: ortakAkis.ad, istegeBagli: g.istegeBagli === true, ekranlar: etki } };
  return vt.islem(() => ({
    eklenen: hazirlik.map(({ e, girdi }) => ({ id: e.id, ad: e.ad, surum: /** @type {{ surum: number }} */ (akisKaydet(vt, projeId, e.id, { ...girdi, onay: true })).surum }))
  }));
}

/**
 * Diyagram düzenleyicisinin verisi: bir akışın blokları (akisId), bir akışın kopyası (kopya) ya da boş diyagram.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ akisId?: string | null; kopya?: string | null }} s
 */
export function akisTasarimi(vt, projeId, ekranId, s) {
  const { ekran, model } = ekranModeli(vt, projeId, ekranId);
  const d = akisDuzenlenebilirMi(model);
  if (!d.duzenlenebilir) throw new DepoHatasi(/** @type {string} */ (d.neden));
  const ortakAkis = model.tur === 'ortakAkis';
  if (ortakAkis && !s.akisId) throw new DepoHatasi('Ortak akışın tek akışı vardır; yeni akış eklenmez, mevcut akış düzenlenir.');
  const env = modeldenAkisEnvanteri(model);
  const liste = akisListesi(model);
  const kaynakId = s.akisId || s.kopya || null;
  const kaynak = kaynakId ? liste.find((a) => a.id === kaynakId) : null;
  if (kaynakId && !kaynak) throw new DepoHatasi('Akış bulunamadı.');
  const bloklar = kaynak ? adimlardanBloklar(model, /** @type {Nesne} */ (akisModeli(model, kaynak.id)).adimlar, env) : [{ tur: /** @type {const} */ ('bitir') }];
  return {
    ekran, bloklar, palet: akisPaleti(env, bloklar), ortakAkislar: ortakAkis ? [] : ortakAkislariListele(vt, projeId), ortakAkis,
    ...(ortakAkis ? { kullananlar: ortakAkisKullananlari(vt, projeId, ekranId) } : {}),
    akis: s.akisId && kaynak ? { id: kaynak.id, ad: kaynak.ad, varsayilan: kaynak.varsayilan } : null,
    kopyaKaynagi: s.kopya && kaynak ? kaynak.ad : null,
    // Ekran girişsiz açılıyorsa diyagramın başı "Girişsiz" olur ve "Yeniden giriş" bloğu sunulmaz.
    girissiz: model.girisGerekmez === true
  };
}

/**
 * Projenin ortak akışları (akış tasarımında "+ > Ortak akış" listesi): dosya ("<anahtar>.model.json"), ad, adım başlıkları.
 * @param {Veritabani} vt @param {string} projeId
 */
export function ortakAkislariListele(vt, projeId) {
  /** @type {Array<{ dosya: string; ad: string; adimlar: string[]; yalnizTest: boolean }>} */
  const liste = [];
  for (const e of vt.tumu("SELECT id, anahtar, ad FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi' ORDER BY ad", [projeId])) {
    const k = ekranModeliGetir(vt, String(e.id));
    if (!k || !nesneMi(k.model) || k.model.tur !== 'ortakAkis') continue;
    liste.push({
      dosya: `${String(e.anahtar)}.model.json`, ad: String(e.ad),
      adimlar: (Array.isArray(k.model.adimlar) ? k.model.adimlar : []).filter(nesneMi).map((/** @type {Nesne} */ a) => String(a.baslik || a.id)),
      yalnizTest: k.model.yalnizTestOrtami === true
    });
  }
  return liste;
}

/** Bu akışı kullanan senaryolar (akışı yazılı olmayanlar varsayılan akıştadır). @param {Veritabani} vt @param {string} ekranId @param {string} akisId @param {string} varsayilan */
function akisSenaryolari(vt, ekranId, akisId, varsayilan) {
  return vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE ekran_id = ? ORDER BY baslik', [ekranId]).filter((s) => {
    let id = null;
    try { id = senaryoAkisi(JSON.parse(String(s.icerik_json))); } catch { id = null; }
    return (id ?? varsayilan) === akisId;
  }).map((s) => ({ id: String(s.id), baslik: String(s.baslik) }));
}

/** Akış kimliği: addan, tekil. @param {string} ad @param {Set<string>} kullanilan */
function akisKimligi(ad, kullanilan) {
  const temel = kimlikUret(ad, 'akis').replace(/[^A-Za-z0-9]/g, '') || 'akis';
  const t = /^[A-Za-z]/.test(temel) ? temel : `akis${temel}`;
  let id = t;
  for (let n = 2; kullanilan.has(id); n++) id = `${t}${n}`;
  return id;
}

/**
 * Akışı kaydeder (akisId yoksa yeni akış). onay: false → yalnızca doğrular ve etkiyi döner (kaydetmez); true → yeni model
 * sürümü. Blok hataları: EkranDogrulamaHatasi, hatalar: [{ blok, mesaj }] (400).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * kayitEnvanteri: akış kaydından ("yeni akış olarak ekle" / "şu akışı güncelle"): sağ liste ve koşul çıkarımı kaydın gerçek
 * okumalarından; yoksa modelden (sentetik envanter).
 * Akış kaydında (kayitEnvanteri) yakalanan seçenek listeleri paket yoluyla AYNI biçimde test verisine önerilir: onaysız çağrı
 * "testVerisi" önizlemesini de döner (paketTestVerisiOnizle; tablo "<Ekran> — <Alan>", tür "liste"); onaylı çağrıda yalnız
 * g.testVerisi seçimi (tablo başına yeni / birleştir / yeni ad / atla + bağlanacak alanlar) yazılır — seçim yoksa test verisine
 * hiçbir şey yazılmaz. Model sürümüyle aynı işlemde.
 * @param {{ akisId?: string | null; ad: unknown; bloklar: unknown; onay?: boolean; kayitEnvanteri?: import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri; testVerisi?: unknown }} g
 */
export function akisKaydet(vt, projeId, ekranId, g) {
  const { ekran, model: tam } = ekranModeli(vt, projeId, ekranId);
  const d = akisDuzenlenebilirMi(tam);
  if (!d.duzenlenebilir) throw new DepoHatasi(/** @type {string} */ (d.neden));
  const ad = typeof g.ad === 'string' ? g.ad.replace(/\s+/g, ' ').trim().slice(0, AD_EN_COK) : '';
  const liste = akisListesi(tam);
  const mevcutAkis = g.akisId ? liste.find((a) => a.id === g.akisId) : null;
  if (g.akisId && !mevcutAkis) throw new DepoHatasi('Akış bulunamadı.');
  const ortakAkis = tam.tur === 'ortakAkis';
  if (ortakAkis && !mevcutAkis) throw new DepoHatasi('Ortak akışın tek akışı vardır; yeni akış eklenmez, mevcut akış düzenlenir.');
  /** @type {Array<{ blok: number | null; mesaj: string }>} */
  const hatalar = [];
  if (!ad) hatalar.push({ blok: null, mesaj: 'Akışın adını yazın.' });
  else if (liste.some((a) => a.ad.toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR') && a.id !== mevcutAkis?.id)) hatalar.push({ blok: null, mesaj: `“${ad}” adında bir akış zaten var.` });
  const env = g.kayitEnvanteri ?? modeldenAkisEnvanteri(tam);
  const ayik = bloklariAyikla(g.bloklar);
  hatalar.push(...ayik.hatalar);
  if (ortakAkis) ayik.bloklar.forEach((b, i) => { if (b.tur === 'ortak') hatalar.push({ blok: i, mesaj: 'Ortak akışın içine ortak akış eklenemez.' }); });
  const cevrim = ayik.hatalar.length ? { envanter: null, hatalar: [] } : akistanKayitEnvanteri(env, ayik.bloklar, { satirSiniri: sqlSatirSiniriOku(vt) });
  hatalar.push(...cevrim.hatalar);
  if (hatalar.length || !cevrim.envanter) throw new EkranDogrulamaHatasi(`Diyagramda düzeltilmesi gereken ${hatalar.length} sorun var.`, hatalar);

  // Blokları adımlara çevir: alanlar seçiciyle TÜM akışlardaki mevcut tanımlarıyla eşleşir (kimlik, seçenekler, koşul korunur).
  const mevcutModel = { ...kopya(tam), adimlar: kopya(tumAdimlar(tam)) };
  delete mevcutModel.akislar;
  const { paket } = kayitPaketiOlustur({
    ekranAnahtari: ekran.anahtar, ekranAdi: ekran.ad, urlYolu: String(tam.ekranUrl || ''), girisGerekli: tam.girisGerekmez !== true,
    girissiz: tam.girisGerekmez === true, ikiAsamali: 'bilinmiyor', baglamTuru: null, mevcutModel
  }, cevrim.envanter);
  const parca = /** @type {Nesne} */ (paket.model);
  const akisAdimlari = /** @type {Nesne[]} */ (parca.adimlar);

  // Tam modele yaz: bu akışın adımları; yeni koşullar ve senaryo ayarları eklenir (diğer akışlarınkiler korunur).
  const yeni = kopya(tam);
  yeni.kosullar = { ...(nesneMi(tam.kosullar) ? tam.kosullar : {}), ...(nesneMi(parca.kosullar) ? parca.kosullar : {}) };
  const sd = nesneMi(yeni.senaryoDuzeyi) && Array.isArray(yeni.senaryoDuzeyi.alanlar) ? yeni.senaryoDuzeyi.alanlar : [];
  const sdIdleri = new Set(sd.map((/** @type {Nesne} */ a) => a.id));
  for (const a of nesneMi(parca.senaryoDuzeyi) && Array.isArray(parca.senaryoDuzeyi.alanlar) ? parca.senaryoDuzeyi.alanlar : []) {
    // Ortak akışta "Beklenen sonuç" alanı yazılmaz: uyarılı adımları kullanan ekranın beklenen sonucuna eklenir (model-formu).
    if (ortakAkis && nesneMi(a) && a.tip === 'birlesim') continue;
    if (!sdIdleri.has(a.id)) { sd.push(a); sdIdleri.add(a.id); continue; }
    // Beklenen sonuç alanı güncellenir (bu akıştaki uyarılı adımlar adım seçeneklerine eklenmiş olabilir).
    if (nesneMi(a) && a.tip === 'birlesim') sd[sd.findIndex((x) => nesneMi(x) && x.id === a.id)] = a;
  }
  yeni.senaryoDuzeyi = { ...(nesneMi(yeni.senaryoDuzeyi) ? yeni.senaryoDuzeyi : {}), alanlar: sd };
  const akislar = Array.isArray(yeni.akislar) && yeni.akislar.length ? yeni.akislar
    : [{ id: ANA_AKIS_ID, ad: 'Ana akış', varsayilan: true, adimlar: yeni.adimlar }];
  let akisId;
  if (mevcutAkis) {
    akisId = mevcutAkis.id;
    const i = akislar.findIndex((/** @type {Nesne} */ a) => a.id === akisId);
    akislar[i] = { ...akislar[i], ad, adimlar: akisAdimlari };
    if (akislar[i].varsayilan === true) yeni.adimlar = akisAdimlari;
  } else {
    akisId = akisKimligi(ad, new Set(akislar.map((/** @type {Nesne} */ a) => a.id)));
    akislar.push({ id: akisId, ad, adimlar: akisAdimlari });
  }
  yeni.akislar = akislar;
  // Ortak akış tek akışlıdır (örtük "Ana akış").
  if (ortakAkis) delete yeni.akislar;
  modeliDogrula(vt, projeId, yeni, `${ekran.anahtar}.model.json`);

  const varsayilan = liste[0]?.id ?? ANA_AKIS_ID;
  const etkilenen = mevcutAkis ? akisSenaryolari(vt, ekranId, akisId, varsayilan) : [];
  // Kayıttan yazılan akış: yakalanan seçenek listeleri (paketin testVerisi bölümü) tam modelle birlikte önizlenir / yazılır.
  const tvPaketi = g.kayitEnvanteri && nesneMi(paket.testVerisi) ? { meta: paket.meta, model: yeni, testVerisi: paket.testVerisi } : null;
  if (g.onay !== true) {
    const onizleme = tvPaketi ? paketTestVerisiOnizle(vt, projeId, tvPaketi, ekranId) : null;
    // Bağlantılar yeni model sürümüyle birlikte yazılır (bulgu beklemez): alanlar yazıldığında modelde olur.
    const testVerisi = onizleme ? { ...onizleme, baglantilar: onizleme.baglantilar.map((b) => ({ ...b, modeldeVar: true })) } : null;
    return { etki: { yeni: !mevcutAkis, senaryolar: etkilenen, ...(ortakAkis ? { ekranlar: ortakAkisKullananlari(vt, projeId, ekranId) } : {}) }, akisId, ...(testVerisi ? { testVerisi } : {}) };
  }
  return vt.islem(() => {
    const { surum } = ekranModeliEkle(vt, { ekranId, model: yeni, aciklama: `Akış ${mevcutAkis ? 'düzenlendi' : 'eklendi'}: ${ad}` });
    const tv = tvPaketi ? paketTestVerisiniYaz(vt, projeId, ekranId, tvPaketi, g.testVerisi) : null;
    return { akisId, surum, ...(tv ? { testVerisi: { tablolar: tv.tablolar, baglanan: tv.baglanan } } : {}) };
  });
}

/**
 * Varsayılan akışı değiştirir (yeni sürüm). Akışı yazılı olmayan senaryolara eski varsayılan yazılır (akışları değişmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} akisId @param {string} [yapan]
 */
export function akisVarsayilanYap(vt, projeId, ekranId, akisId, yapan) {
  const { ekran, model: tam } = ekranModeli(vt, projeId, ekranId);
  if (!Array.isArray(tam.akislar) || !tam.akislar.some((/** @type {Nesne} */ a) => a.id === akisId)) throw new DepoHatasi('Akış bulunamadı.');
  const eski = akisListesi(tam)[0].id;
  if (eski === akisId) return { surum: null, tasinan: 0 };
  const yeni = kopya(tam);
  yeni.akislar = yeni.akislar.map((/** @type {Nesne} */ a) => {
    const { varsayilan, ...geri } = a;
    return a.id === akisId ? { ...geri, varsayilan: true } : geri;
  });
  yeni.adimlar = yeni.akislar.find((/** @type {Nesne} */ a) => a.id === akisId).adimlar;
  modeliDogrula(vt, projeId, yeni, `${ekran.anahtar}.model.json`);
  return vt.islem(() => {
    let tasinan = 0;
    for (const s of vt.tumu('SELECT id, icerik_json FROM senaryolar WHERE ekran_id = ?', [ekranId])) {
      if (senaryoAkisi(JSON.parse(String(s.icerik_json)))) continue;
      const mevcut = senaryoGetir(vt, String(s.id));
      if (!mevcut) continue;
      depoSenaryoKaydet(vt, { ...mevcut, icerik: { ...mevcut.icerik, akis: eski }, yapan: yapan ?? 'Nöbetçi (varsayılan akış değişti)' });
      tasinan++;
    }
    const ad = yeni.akislar.find((/** @type {Nesne} */ a) => a.id === akisId).ad;
    const { surum } = ekranModeliEkle(vt, { ekranId, model: yeni, aciklama: `Varsayılan akış: ${ad}` });
    return { surum, tasinan };
  });
}

/** Akışı siler (yeni sürüm): varsayılan ve senaryosu olan akış silinemez. @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} akisId */
export function akisSil(vt, projeId, ekranId, akisId) {
  const { ekran, model: tam } = ekranModeli(vt, projeId, ekranId);
  const liste = akisListesi(tam);
  const akis = liste.find((a) => a.id === akisId);
  if (!akis || !Array.isArray(tam.akislar)) throw new DepoHatasi('Akış bulunamadı.');
  if (akis.varsayilan) throw new DepoHatasi('Varsayılan akış silinemez; önce başka bir akışı varsayılan yapın.');
  const senaryolar = akisSenaryolari(vt, ekranId, akisId, liste[0].id);
  if (senaryolar.length) throw new DepoHatasi(`Bu akışı kullanan ${senaryolar.length} senaryo var; önce senaryoları başka akışa taşıyın ya da silin.`);
  const yeni = kopya(tam);
  yeni.akislar = yeni.akislar.filter((/** @type {Nesne} */ a) => a.id !== akisId);
  // Tek akış kaldıysa örtük akışa dönülür.
  if (yeni.akislar.length === 1) delete yeni.akislar;
  modeliDogrula(vt, projeId, yeni, `${ekran.anahtar}.model.json`);
  const { surum } = ekranModeliEkle(vt, { ekranId, model: yeni, aciklama: `Akış silindi: ${akis.ad}` });
  return { surum };
}
