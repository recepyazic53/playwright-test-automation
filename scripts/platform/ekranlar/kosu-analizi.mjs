// KOŞUDAN EKRAN ANALİZİ (Modeli güncelle) — senaryo normal koşar; koşucu ekranın her adımında sayfayı okur (model-kosucu.ts >
// EKRAN_ANALIZI; "ekran-analizi" eki). Burada okunanlar mevcut modelle karşılaştırılır ve "gözlenen model" kurulur; Değişiklikler sayfası
// (tekrar analiz: analizYukle) bu modelle mevcut model arasındaki farkları bulgu olarak gösterir.
//
//   gozlenenModel(model, gozlemler)  → { model, notlar }
//     - Okunan alan modelde yoksa (seçici + çerçeve; okumanın aday seçicileri de denenir) ilk görüldüğü adıma "yeni alan" olarak eklenir.
//     - Modelde olup koşunun geçtiği adımlarda hiç görülmeyen alan çıkarılır ("kaldırılan alan"). Görünürlük koşullu alan / bölüm / adım ve
//       koşunun geçmediği adımlar karşılaştırılmaz (gezilmeyen yer silindi sayılmaz).
//     - Görülen seçim / radyo alanının seçenekleri sayfadakilerle güncellenir ("yeni / kaldırılan seçenek"); bağlı liste (bagimlilik) ve
//       seçenekleri dinamik alanlar hariç.
//     - Düğmeler: gelen düğme (sayfada var, modelde yok; bağlantılar hariç) ve görülmeyen düğme (modelde var, geçilen adımlarda yok) not olur.
//   kosuAnaliziPaketi(ekran, model, gozlemler) → analizYukle'ye verilecek ekran paketi.
// Motor genel kalır: siteye / ürüne özgü sabit yoktur. NOT: import.meta KULLANILMAZ.
import { join } from 'node:path';
import { SAYFA_PAKETI_SURUMU, SAYFA_PAKETI_TURU } from './sayfa-paketi.mjs';
import { analizYukle } from './ekran-servisi.mjs';
import { ekranModeliGetir, ekranlariListele, senaryoGetir } from '../veritabani/depo.mjs';
import { medyaGetir, sonucDetayi } from '../veritabani/sonuc-deposu.mjs';
import { medyaAnahtariniHazirla } from '../kasa.mjs';
import { medyaDosyaAdiGecerliMi, medyaTamamenCoz } from '../medya.mjs';

/** @typedef {Record<string, any>} Nesne */
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kopya = (/** @type {unknown} */ d) => JSON.parse(JSON.stringify(d));
const cerceveAnahtari = (/** @type {unknown} */ c) => JSON.stringify(Array.isArray(c) ? c : []);
const yazi = (/** @type {unknown} */ m) => String(m ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
const etiketi = (/** @type {Nesne} */ a) => String((nesneMi(a.etiket) ? a.etiket.form || a.etiket.ekran : a.etiket) || a.id || '');
const TIPLER = /** @type {Record<string, string>} */ ({
  text: 'metin', search: 'metin', email: 'metin', textarea: 'metin', password: 'metin', url: 'metin', tel: 'telefon', number: 'sayi',
  date: 'tarih', 'datetime-local': 'tarih', select: 'secim', 'select-one': 'secim', 'select-multiple': 'okluSecim', radio: 'radyo',
  checkbox: 'onayKutusu', file: 'dosya'
});
/** Sayfa okumasının tanıdığı (kaybolduğu anlaşılabilen) model alan tipleri. */
const OKUNAN_TIPLER = new Set(['metin', 'sayi', 'tarih', 'telefon', 'secim', 'onayKutusu', 'radyo']);
/** Yer tutucu seçenek ("Seçiniz…", boş değer). @param {Nesne} s */
const yerTutucuMu = (s) => String(s?.deger ?? '') === '' || String(s?.metin ?? '').trim() === '' || /^(seçiniz|seciniz|seçin|lütfen seçiniz|-+)\W*$/i.test(String(s?.metin ?? '').trim());

/** Modelin (ekranın kendi adımları) alanları konumlarıyla. @param {Nesne} model */
function modelAlanlari(model) {
  /** @type {Array<{ adim: Nesne; bolum: Nesne; alan: Nesne }>} */
  const sonuc = [];
  for (const adim of Array.isArray(model.adimlar) ? model.adimlar : []) {
    if (!nesneMi(adim) || nesneMi(adim.ortakAkis)) continue;
    for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const alan of nesneMi(bolum) && Array.isArray(bolum.alanlar) ? bolum.alanlar : []) if (nesneMi(alan)) sonuc.push({ adim, bolum, alan });
    }
  }
  return sonuc;
}

/** Okunan alan bu model alanı mı (seçici + çerçeve; okumanın aday seçicileri de). @param {Nesne} alan @param {Nesne} ham */
function eslesir(alan, ham) {
  const secici = nesneMi(alan.konum) ? alan.konum.secici : null;
  if (typeof secici !== 'string' || !secici) return false;
  if (cerceveAnahtari(alan.konum.cerceve) !== cerceveAnahtari(ham.cerceve)) return false;
  return [ham.secici, ...(Array.isArray(ham.adaySeciciler) ? ham.adaySeciciler : [])].includes(secici);
}

/** Yeni alanın kimliği: etiketten (ASCII, camelCase), modelde olmayan. @param {string} metin @param {Set<string>} kullanilan */
function yeniKimlik(metin, kullanilan) {
  const tr = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' });
  const sozcukler = String(metin).replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => tr[c] ?? c).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let taban = sozcukler.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('').slice(0, 40) || 'alan';
  if (!/^[a-z]/.test(taban)) taban = `alan${taban}`;
  let id = taban;
  for (let i = 2; kullanilan.has(id); i++) id = `${taban}${i}`;
  kullanilan.add(id);
  return id;
}

/** Okunan alandan model alanı (yeni alan). @param {Nesne} ham @param {Set<string>} kullanilan @returns {Nesne | null} */
function hamdanAlan(ham, kullanilan) {
  const tip = TIPLER[String(ham.tur)] ?? null;
  if (!tip || typeof ham.secici !== 'string') return null;
  const etiket = String(ham.etiket ?? '').trim() || String(ham.ad ?? ham.anahtar ?? '');
  const id = yeniKimlik(etiket || 'alan', kullanilan);
  const secenekler = (tip === 'radyo' ? (Array.isArray(ham.radyolar) ? ham.radyolar : []) : (Array.isArray(ham.secenekler) ? ham.secenekler : []))
    .filter((s) => nesneMi(s) && !yerTutucuMu(s)).map((s) => ({ deger: String(s.deger), metin: String(s.metin ?? s.deger) }));
  if ((tip === 'secim' || tip === 'okluSecim' || tip === 'radyo') && !secenekler.length) return null;
  return {
    id, tip, etiket: { ekran: etiket || id }, yapilandirma: 'senaryo', eslesme: { senaryo: id },
    ...(ham.zorunlu === true ? { zorunlu: true } : {}),
    konum: { secici: ham.secici, kirilganlik: String(ham.kirilganlik ?? 'orta'), ...(Array.isArray(ham.cerceve) && ham.cerceve.length ? { cerceve: ham.cerceve } : {}) },
    ...(secenekler.length ? { secenekler, seceneklerDurumu: 'tam' } : {})
  };
}

/** Görünürlüğü koşullu mu (alan, bölüm ya da adım). @param {Nesne} adim @param {Nesne} bolum @param {Nesne} alan */
const kosullu = (adim, bolum, alan) => [adim, bolum, alan].some((x) => nesneMi(x.gorunurluk) || typeof x.gorunurluk === 'string' || nesneMi(x.kosul));

/**
 * @param {Nesne} model mevcut ekran modeli @param {Array<{ adimId: string; baslik: string; alanlar: Nesne[]; dugmeler: Array<{ metin: string | null; secici: string; cerceve?: string[]; baglanti?: boolean }> }>} gozlemler
 * @returns {{ model: Nesne; notlar: string[] }}
 */
export function gozlenenModel(model, gozlemler) {
  const yeni = kopya(model);
  /** @type {string[]} */
  const notlar = [];
  const alanlar = modelAlanlari(yeni);
  const kullanilan = new Set(alanlar.map((x) => String(x.alan.id)));
  const gecilen = new Set(gozlemler.map((g) => g.adimId));
  /** @type {Set<Nesne>} */
  const gorulen = new Set();
  /** @type {Set<string>} */
  const eklenen = new Set();
  for (const g of gozlemler) {
    const adim = (Array.isArray(yeni.adimlar) ? yeni.adimlar : []).find((/** @type {Nesne} */ a) => nesneMi(a) && a.id === g.adimId);
    for (const ham of Array.isArray(g.alanlar) ? g.alanlar : []) {
      if (!nesneMi(ham)) continue;
      const m = alanlar.find((x) => eslesir(x.alan, ham));
      if (m) {
        gorulen.add(m.alan);
        seceneklerGuncelle(m.alan, ham);
        continue;
      }
      const anahtar = `${String(ham.secici)}|${cerceveAnahtari(ham.cerceve)}`;
      if (eklenen.has(anahtar) || !adim || ham.devreDisi === true) continue;
      const alan = hamdanAlan(ham, kullanilan);
      if (!alan) continue;
      eklenen.add(anahtar);
      if (!Array.isArray(adim.bolumler) || !adim.bolumler.length) adim.bolumler = [{ id: `${adim.id}Alanlari`, baslik: String(adim.baslik || adim.id), alanlar: [] }];
      adim.bolumler[adim.bolumler.length - 1].alanlar.push(alan);
      alanlar.push({ adim, bolum: adim.bolumler[adim.bolumler.length - 1], alan });
      gorulen.add(alan);
    }
  }
  // Kaybolan alanlar: koşunun geçtiği adımın koşulsuz giriş alanı (sayfa okumasının tanıdığı türde, düz seçicili, yardımcısız) hiç
  // görülmediyse. Çıktı / aksiyon alanları, şablonlu ya da Playwright seçicili alanlar karşılaştırılmaz (okuma onları tanımaz).
  for (const { adim, bolum, alan } of [...alanlar]) {
    if (!gecilen.has(adim.id) || gorulen.has(alan) || !OKUNAN_TIPLER.has(alan.tip) || ['cikti', 'aksiyon'].includes(alan.yapilandirma)) continue;
    const secici = nesneMi(alan.konum) ? alan.konum.secici : null;
    if (typeof secici !== 'string' || !/^[#.[a-z]/i.test(secici) || secici.includes('${') || /getBy|internal:|role=/.test(secici) || alan.konum.yardimci) continue;
    if (kosullu(adim, bolum, alan)) continue;
    const kalan = bolum.alanlar.filter((/** @type {Nesne} */ x) => x !== alan);
    const onceki = bolum.alanlar;
    bolum.alanlar = kalan;
    // Modelin başka yerinden (ürün düzeyi, bağlı liste, görünürlük koşulu…) adıyla kullanılan alan silinmez: model geçersiz kalırdı.
    if (JSON.stringify(yeni).includes(JSON.stringify(String(alan.id)))) {
      bolum.alanlar = onceki;
      notlar.push(`Görülmeyen alan: “${etiketi(alan)}”: koşuda ekranda bulunamadı; modelin başka yerinde kullanıldığı için kaldırılmadı.`);
    }
  }
  // Düğmeler (not): gelen / görülmeyen.
  const modelDugmeleri = [];
  for (const adim of Array.isArray(yeni.adimlar) ? yeni.adimlar : []) {
    if (!nesneMi(adim) || nesneMi(adim.ortakAkis)) continue;
    for (const x of nesneMi(adim.kosu) && Array.isArray(adim.kosu.aksiyonlar) ? adim.kosu.aksiyonlar : []) {
      if (nesneMi(x) && x.tur === 'tikla' && typeof x.secici === 'string') modelDugmeleri.push({ adimId: adim.id, secici: x.secici, metin: String(x.metin ?? x.aciklama ?? '') });
    }
  }
  // Düğme alanları (koşulsuz, düz seçicili) da modeldeki düğmelerdir.
  for (const { adim, bolum, alan } of alanlar) {
    const secici = nesneMi(alan.konum) ? alan.konum.secici : null;
    if (alan.tip !== 'buton' || typeof secici !== 'string' || secici.includes('${') || kosullu(adim, bolum, alan)) continue;
    if (!modelDugmeleri.some((m) => m.adimId === adim.id && m.secici === secici)) modelDugmeleri.push({ adimId: adim.id, secici, metin: etiketi(alan) });
  }
  const sayfaDugmeleri = gozlemler.flatMap((g) => (Array.isArray(g.dugmeler) ? g.dugmeler : []).map((d) => ({ ...d, adim: g.baslik })));
  const ayniDugme = (/** @type {{ secici: string; metin: string | null }} */ a, /** @type {{ secici: string; metin: string | null }} */ b) => a.secici === b.secici || (yazi(a.metin) !== '' && yazi(a.metin) === yazi(b.metin));
  const gelen = new Map();
  // Her okumada görülen düğmeler sayfanın sabit üst / yan çubuğudur (ör. menü); not edilmez.
  const herYerde = (/** @type {{ metin: string | null }} */ d) => gozlemler.length > 1 && gozlemler.every((g) => (g.dugmeler ?? []).some((x) => yazi(x.metin) === yazi(d.metin)));
  for (const d of sayfaDugmeleri) {
    if (d.baglanti || !d.metin || herYerde(d) || modelDugmeleri.some((m) => ayniDugme(m, d))) continue;
    if (alanlar.some((x) => ['buton', 'baglanti'].includes(x.alan.tip) && (x.alan.konum?.secici === d.secici || yazi(etiketi(x.alan)) === yazi(d.metin)))) continue;
    if (!gelen.has(yazi(d.metin))) gelen.set(yazi(d.metin), d);
  }
  for (const d of gelen.values()) notlar.push(`Yeni düğme: “${d.metin}” (${d.adim}). Modele düğme eklenmez; akışa eklemek için akışı düzenleyin.`);
  for (const m of modelDugmeleri) {
    if (!gecilen.has(m.adimId) || sayfaDugmeleri.some((d) => ayniDugme(m, d))) continue;
    notlar.push(`Görülmeyen düğme: “${m.metin || m.secici}”: modelde var, koşuda ekranda bulunamadı.`);
  }
  const gecilmeyen = (Array.isArray(yeni.adimlar) ? yeni.adimlar : []).filter((/** @type {Nesne} */ a) => nesneMi(a) && !nesneMi(a.ortakAkis) && !gecilen.has(a.id));
  if (gecilmeyen.length) notlar.push(`Koşunun geçmediği adımlar karşılaştırılmadı (modeldeki hâlleri korunur): ${gecilmeyen.map((/** @type {Nesne} */ a) => String(a.baslik || a.id)).join(', ')}.`);
  akislariEsitle(model, yeni);
  return { model: yeni, notlar };
}

/**
 * Akışlar (model.akislar) adımların tam kopyalarını taşır: varsayılan akış modelin adımlarıyla aynı olmalı; diğer akışlardaki aynı
 * adım (eski modeldekiyle birebir aynıysa) güncellenen hâliyle değiştirilir. @param {Nesne} eski @param {Nesne} yeni
 */
function akislariEsitle(eski, yeni) {
  if (!Array.isArray(yeni.akislar) || !Array.isArray(yeni.adimlar)) return;
  const eskiAdim = new Map((Array.isArray(eski.adimlar) ? eski.adimlar : []).filter(nesneMi).map((a) => [a.id, JSON.stringify(a)]));
  const yeniAdim = new Map(yeni.adimlar.filter(nesneMi).map((/** @type {Nesne} */ a) => [a.id, a]));
  for (const akis of yeni.akislar) {
    if (!nesneMi(akis) || !Array.isArray(akis.adimlar)) continue;
    if (akis.varsayilan === true) { akis.adimlar = kopya(yeni.adimlar); continue; }
    akis.adimlar = akis.adimlar.map((/** @type {unknown} */ a) => (nesneMi(a) && yeniAdim.has(a.id) && eskiAdim.get(a.id) === JSON.stringify(a) ? kopya(yeniAdim.get(a.id)) : a));
  }
}

/** Seçim / radyo alanının seçenekleri sayfadakilerle (bağlı liste ve dinamik seçenekli alan hariç). @param {Nesne} alan @param {Nesne} ham */
function seceneklerGuncelle(alan, ham) {
  if (!['secim', 'okluSecim', 'radyo'].includes(alan.tip) || alan.bagimlilik || alan.seceneklerDurumu === 'dinamik' || !Array.isArray(alan.secenekler)) return;
  const kaynak = alan.tip === 'radyo' ? ham.radyolar : ham.secenekler;
  const gorulen = (Array.isArray(kaynak) ? kaynak : []).filter((s) => nesneMi(s) && !yerTutucuMu(s));
  if (!gorulen.length) return;
  const eski = alan.secenekler.filter(nesneMi);
  // Ekran değerleri eşlemeli (soyut) seçenekler sayfadaki değerlerle karşılaştırılamaz.
  if (eski.some((e) => nesneMi(e.ekranDegerleri))) return;
  alan.secenekler = gorulen.map((s) => eski.find((e) => String(e.deger) === String(s.deger) || yazi(e.metin) === yazi(s.metin)) ?? { deger: String(s.deger), metin: String(s.metin ?? s.deger) });
}

/**
 * Değişiklikler (analizYukle) için ekran paketi: gözlenen model + notlar.
 * @param {{ anahtar: string; ad: string }} ekran @param {Nesne} model @param {Parameters<typeof gozlenenModel>[1]} gozlemler @param {string} senaryoBasligi
 */
export function kosuAnaliziPaketi(ekran, model, gozlemler, senaryoBasligi) {
  const g = gozlenenModel(model, gozlemler);
  return {
    tur: SAYFA_PAKETI_TURU, surum: SAYFA_PAKETI_SURUMU,
    meta: {
      ekran: { anahtar: ekran.anahtar, ad: ekran.ad, ...(typeof model.ekranUrl === 'string' ? { urlYolu: model.ekranUrl } : {}) },
      olusturan: 'Nöbetçi taraması (senaryo koşusu)', olusturulma: new Date().toISOString(), baglamProfilleri: [],
      not: `“${senaryoBasligi}” senaryosu koşturulurken ekran okundu.`
    },
    model: g.model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
    bilinmeyenler: g.notlar
  };
}

/** Koşucunun koşu sonucuna yazdığı ek adı (tests/support/model-kosucu.ts ile aynı). */
export const EKRAN_ANALIZI_EKI = 'ekran-analizi';

/**
 * Koşu bitince (Modeli güncelle): sonucun "ekran-analizi" ekini okur, gözlenen modeli kurar ve ekranın Değişiklikler'ine yükler.
 * Ek yoksa (koşu ekrana hiç gelemediyse) null döner.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {{ sonucId: string; senaryoId: string }} k @param {{ medyaKlasoru: string }} s
 * @returns {Promise<{ ekranId: string; bulguSayisi: number; gizlenenSayisi: number; notlar: string[] } | null>}
 */
export async function kosuAnaliziniYukle(vt, k, s) {
  const senaryo = senaryoGetir(vt, k.senaryoId);
  if (!senaryo?.ekranId) return null;
  const ekran = ekranlariListele(vt, senaryo.projeId).find((e) => e.id === senaryo.ekranId);
  const mevcut = ekranModeliGetir(vt, senaryo.ekranId);
  const detay = sonucDetayi(vt, k.sonucId);
  const ek = detay?.medya.find((m) => m.ad === EKRAN_ANALIZI_EKI && !m.silinme);
  if (!ekran || !mevcut || !nesneMi(mevcut.model) || !ek) return null;
  const m = medyaGetir(vt, ek.id);
  if (!m || !medyaDosyaAdiGecerliMi(m.dosya)) return null;
  const veri = JSON.parse((await medyaTamamenCoz(medyaAnahtariniHazirla(vt), join(s.medyaKlasoru, m.dosya))).toString('utf8'));
  const gozlemler = Array.isArray(veri?.gozlemler) ? veri.gozlemler : [];
  if (!gozlemler.length) return null;
  const paket = kosuAnaliziPaketi(ekran, /** @type {Nesne} */ (mevcut.model), gozlemler, senaryo.baslik);
  const y = await analizYukle(vt, senaryo.projeId, senaryo.ekranId, paket, { medyaKlasoru: s.medyaKlasoru });
  return { ekranId: senaryo.ekranId, bulguSayisi: y.bulguSayisi, gizlenenSayisi: y.gizlenenSayisi, notlar: paket.bilinmeyenler };
}
