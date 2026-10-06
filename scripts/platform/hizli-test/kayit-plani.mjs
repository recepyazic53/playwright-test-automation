// HIZLI TEST KAYIT PLANI: "Testi kaydet"ten önce kullanıcıya gösterilen ÖZET ve onayla yazılan test verisi. Yapay zekâ paketinin
// önizlemesiyle (testVerisiSecimi) aynı sistem: hangi tablolar yazılacak, aynı adlı / benzer tablo varsa birleştir / yeni adla yaz /
// atla, mevcut bir tablonun SÜTUNU alanı karşılıyorsa "mevcut tabloya bağla", hangi alanlar hangi tablo sütununa bağlanacak, hangi
// senaryolar eklenecek. Kullanıcı onaylamadan hiçbir şey yazılmaz.
//   planKur        analiz + kullanıcının yazdığı değerlerden tablo planı: kişi / kart alanları gruplu, bağlı liste ZİNCİRİ (il → ilçe → …)
//                  tek tablo (sütun = halka, satır = gözlenen geçerli kombinasyon), diğer her seçim alanı kendi liste tablosu (TÜM
//                  seçenekler), kullanıcının yazdığı değerler tek satır (senaryo satırı).
//   planOnizle     önizleme (paketTestVerisiOnizle ile aynı biçim): mevcut aynı adlı / benzer tablo, sütunu alanla eşleşen mevcut tablolar
//                  (bagla), eklenecek satır / sütun, bağlantılar.
//   planYaz        seçimle yazar (tek işlemde): yeni / birleştir / bağla / yeni ad / atla; senaryonun kendi satırına sabitlenmesi (pin),
//                  alan → sütun başvuruları.
//   senaryoOnerileri  kaydedilen senaryo + az sayıda, gerekçeli alternatif: koşullu dallar, zincir satırları, bağımsız seçimlerin ikili
//                  (pairwise) kapsamı.
// Değer ÜRETİLMEZ: yalnız kullanıcının yazdıkları, sayfadan okunan seçenekler ve gözlenen zincir kombinasyonları. Gizli sütun değerleri
// önizlemede görünmez.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { GENEL_SUTUNLAR, baslikNormal, benzerTablolar, uzaklik } from '../tablolar/tablo-benzerligi.mjs';
import { birlestirmePlani } from '../tablolar/paket-test-verisi.mjs';
import { ayniKavramMi, benzerAdMi, kisiAdKavrami, kokEslesirMi } from '../tablolar/doldur-onerisi.mjs';
import { degerBasvurusuYaz, grupAnahtari, satirSabitlemesi } from '../tablolar/tablo-secimi.mjs';
import { adTemizle, alanGrubu, cokParcaliIsaretle, hassasAlanMi, tabloTaslagiKur, tumSecenekler } from './test-verisi-tablosu.mjs';
import { gercekSecenekler, ornekDegerler } from '../tarama/zincir-kesfi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {import('./kayit-plani.d.mts').PlanTablosu} PlanTablosu */
/** @typedef {import('./kayit-plani.d.mts').KayitPlani} KayitPlani */
/** @typedef {import('./kayit-plani.d.mts').SutunAdayi} SutunAdayi */
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
const EN_COK_SECENEK = 60;
const EN_COK_LISTE_TABLOSU = 12;
/** Zincir tablosunun en çok satırı (gözlenen kombinasyonlar; tüm kombinasyonlar taranmaz). */
export const ZINCIR_EN_COK_SATIR = 200;
/** Önizlemede gösterilen en çok "mevcut tabloya bağla" adayı. */
const EN_COK_BAGLA_ADAYI = 5;
/** Hızlı test kaydında önerilen alternatif senaryo sayısı (Ayarlar > Koşu > Tarama ve akış kaydı > hizliOneriSayisi). */
export const VARSAYILAN_ONERI_SAYISI = 5;
const SECIM_TURLERI = ['select', 'select-one', 'radio'];

// ---------------------------------------------------------------------------------------
// Alan adı ↔ mevcut sütun adı eşlemesi (saf)
// ---------------------------------------------------------------------------------------

/** Sözcükler (normal; boşluk / noktalama / camelCase sınırından). @param {unknown} s @returns {string[]} */
const sozcukler = (s) => String(s ?? '').replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).map(baslikNormal).filter(Boolean);

/**
 * Alan adı (ya da planın sütun adı) ile mevcut bir sütunun adı eşleşiyor mu:
 *  - 'birebir': büyük / küçük harf, Türkçe karakter, boşluk ve noktalama farkı yok sayılınca aynı ("Adres Kodu" = "Adres kodu").
 *  - 'benzer' : Doldur'un benzer ad kuralları — eş anlam sözlüğünde aynı kavram ("D.TARİHİ" ↔ "Doğum tarihi"), kısaltma / baş
 *               ("TEL" ↔ "Telefon"; kısa olan en az 4 harf), sözcük kökü ("Yolcu adı" ↔ "Ad"). Kısaltma kuralı tamlamanın BAŞINI
 *               değiştirmez: kısa ad uzun adın ilk sözcük(ler)iyse ve uzunda başka sözcük varsa eşleşmez ("Adres" ↔ "Adres kodu" değil).
 *               Kök kuralı genel sütun adlarına ("Kod", "Açıklama" …) uygulanmaz (kişi adı / soyadı kalıbı hariç).
 *  - null     : ilgisiz ("Adres no" ↔ "Adres kodu").
 * @param {unknown} alanAdi @param {unknown} sutunAdi @returns {'birebir' | 'benzer' | null}
 */
export function adEslesmesi(alanAdi, sutunAdi) {
  const a = baslikNormal(alanAdi);
  const b = baslikNormal(sutunAdi);
  if (!a || !b) return null;
  if (a === b) return 'birebir';
  if (ayniKavramMi(a, b)) return 'benzer';
  const wa = sozcukler(alanAdi);
  const wb = sozcukler(sutunAdi);
  const [kw, uw] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const tamlamaBasi = uw.length > kw.length && kw.every((w, i) => w === uw[i]);
  if (!tamlamaBasi && benzerAdMi(a, b)) return 'benzer';
  if (kokEslesirMi(String(alanAdi ?? ''), String(sutunAdi ?? '')) && (kisiAdKavrami(String(alanAdi ?? '')) || !GENEL_SUTUNLAR.includes(b))) return 'benzer';
  return null;
}

/** Hücre karşılaştırması (boşluk ve büyük / küçük harf farkı yok sayılır). @param {unknown} x @param {unknown} y */
const ayniDeger = (x, y) => kucuk(x) === kucuk(y);
const bosMu = (/** @type {unknown} */ v) => v === undefined || v === null || v === '';

/** @typedef {ReadonlyArray<{ id?: string; ad?: string; degerler: Record<string, unknown> }>} MevcutSatirlar */

/**
 * Plan sütunlarının bir mevcut tablonun sütunlarıyla ad eşlemesi (adEslesmesi; önce birebir, sonra benzer; her mevcut sütun bir kez).
 * Liste (seçim) tablosu gizli sütuna eşlenmez (gizli değer açık sütuna da eşlenebilir: karar kullanıcının).
 * @param {PlanTablosu} t @param {{ sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }} m @returns {SutunAdayi['eslesme']}
 */
export function sutunEslemesi(t, m) {
  const adlari = (/** @type {string} */ sutun) => [...new Set([sutun, ...t.alanlar.filter((a) => a.sutun === sutun).map((a) => a.etiket)].filter(Boolean))];
  const kullanilan = new Set();
  /** @type {SutunAdayi['eslesme']} */
  const eslesme = [];
  for (const tur of /** @type {const} */ (['birebir', 'benzer'])) {
    // Adaylar adı en yakın olandan başlayarak eşlenir (sütun sırasıyla değil): "Telefon (kod)" → "Telefon kodu", "Telefon (numara)" →
    // "Telefon numarası"; ilk benzer sütunu ("Telefon") kapıp sonrakini kaydırmaz.
    /** @type {Array<{ plan: string; hedef: string; puan: number; sira: number }>} */
    const adaylar = [];
    t.sutunlar.forEach((s, sira) => {
      if (eslesme.some((e) => e.plan === s.ad)) return;
      for (const x of m.sutunlar) {
        if (kullanilan.has(x.ad) || (t.tur === 'liste' && x.gizli)) continue;
        const uyan = adlari(s.ad).filter((ad) => adEslesmesi(ad, x.ad) === tur);
        if (uyan.length) adaylar.push({ plan: s.ad, hedef: x.ad, puan: Math.min(...uyan.map((ad) => uzaklik(baslikNormal(ad), baslikNormal(x.ad)))), sira });
      }
    });
    adaylar.sort((a, b) => a.puan - b.puan || a.sira - b.sira);
    for (const a of adaylar) {
      if (kullanilan.has(a.hedef) || eslesme.some((e) => e.plan === a.plan)) continue;
      kullanilan.add(a.hedef);
      eslesme.push({ plan: a.plan, hedef: a.hedef, tur });
    }
  }
  const sira = new Map(t.sutunlar.map((s, i) => [s.ad, i]));
  return eslesme.sort((a, b) => (sira.get(a.plan) ?? 0) - (sira.get(b.plan) ?? 0));
}

/**
 * Plan tablosu verilen eşlemeyle (plan sütunu → mevcut sütun) mevcut tabloya bağlanırsa: yeni sütunlar (eşlenmeyen plan sütunları),
 * eklenecek satırlar ve (kayıt tablosunda) değerleri birebir aynı mevcut satır. Liste / zincir tablosunda eşlenen sütunlardaki değerleri
 * aynı satır zaten varsa eklenmez; kayıt tablosunda tüm sütunlar eşlenmiş ve dolu değerler bir satırla aynıysa o satır kullanılır
 * (gizli değer çözülmüş listede karşılaştırılır; çözülmemişse eşleşmez), yoksa yeni satır.
 * @param {PlanTablosu} t @param {{ satirlar: MevcutSatirlar }} m @param {ReadonlyArray<{ plan: string; hedef: string }>} eslesme
 */
function baglamaSonucu(t, m, eslesme) {
  const hedef = new Map(eslesme.map((e) => [e.plan, e.hedef]));
  const yeniSutunlar = t.sutunlar.filter((s) => !hedef.has(s.ad));
  /** @type {Array<Record<string, string | null>>} */
  let eklenecek;
  /** @type {{ id: string; ad: string } | null} */
  let mevcutSatir = null;
  let ortusme = 0;
  if (t.tur === 'liste') {
    const imza = (/** @type {(ad: string) => unknown} */ oku) => JSON.stringify(eslesme.map((e) => kucuk(oku(e.plan))));
    const var_ = new Set(eslesme.length ? m.satirlar.map((r) => imza((ad) => r.degerler[/** @type {string} */ (hedef.get(ad))])) : []);
    eklenecek = t.satirlar.filter((d) => !var_.has(imza((ad) => d[ad])));
    ortusme = t.satirlar.length ? (t.satirlar.length - eklenecek.length) / t.satirlar.length : 0;
  } else {
    const d = t.satirlar[0] ?? {};
    const dolu = eslesme.filter((e) => !bosMu(d[e.plan]));
    const r = !yeniSutunlar.length && dolu.length ? m.satirlar.find((x) => dolu.every((e) => !bosMu(x.degerler[e.hedef]) && ayniDeger(x.degerler[e.hedef], d[e.plan]))) : undefined;
    mevcutSatir = r?.id ? { id: String(r.id), ad: String(r.ad ?? '') } : null;
    eklenecek = mevcutSatir ? [] : [...t.satirlar];
  }
  return { yeniSutunlar, eklenecek, mevcutSatir, ortusme };
}

/**
 * Plan tablosunun sütunlarını karşılayan MEVCUT tablolar ("Mevcut tabloya bağla" adayları). Yeni tablo önermeden önce TÜM tabloların
 * sütunları planın sütun adı ve bağlı alanların etiketiyle eşlenir (sutunEslemesi). Tablo ADI eşleşme sayılmaz (aynı adlı tablo
 * "birleştir" akışındadır; burada atlanır).
 *  - Tek sütunlu planda sütun eşleşmeli; çok sütunlu planda (kişi / kart / zincir) en az iki sütun ve sütunların çoğu.
 *  - kesin: tüm sütunlar birebir eşleşti (tek sütunlu liste tablosunda ayrıca planın değerlerinin en az yarısı mevcut sütunda var) →
 *    varsayılan seçili.
 *  - mevcutSatir: kayıt tablosunda senaryonun değerleri (tüm sütunlar eşlenmişse) birebir aynı olan satır — senaryo o satıra sabitlenir;
 *    yoksa yeni satır eklenir (baglamaSonucu).
 * Sıra: kesin önce, sonra karşılanan sütun oranı, birebir sayısı, satır sayısı.
 * @param {PlanTablosu} t
 * @param {ReadonlyArray<{ id: string; ad: string; baglam?: boolean; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: MevcutSatirlar }>} mevcutlar
 * @returns {SutunAdayi[]}
 */
export function mevcutSutunAdaylari(t, mevcutlar) {
  /** @type {Array<SutunAdayi & { _oran: number; _birebir: number }>} */
  const sonuc = [];
  for (const m of mevcutlar) {
    if (m.baglam || String(m.id).startsWith('baglam_') || kucuk(m.ad) === kucuk(t.ad) || !m.sutunlar.length) continue;
    const eslesme = sutunEslemesi(t, m);
    const n = t.sutunlar.length;
    const k = eslesme.length;
    if (!k || (n === 1 ? k !== 1 : k < 2 || k * 2 <= n)) continue;
    const b = baglamaSonucu(t, m, eslesme);
    const birebir = eslesme.filter((e) => e.tur === 'birebir').length;
    // Tek sütunlu listede ad tek başına az ayırt edici ("Durum"): değerlerin yarısı da ortak olmalı; çok sütunluda (zincir) tüm sütunların
    // birebir eşleşmesi yeter (gözlenen yeni kombinasyonlar o tabloya yeni satır olarak eklenir).
    const kesin = k === n && birebir === n && (t.tur !== 'liste' || n >= 2 || b.ortusme >= 0.5);
    sonuc.push({
      id: m.id, ad: m.ad, eslesme, yeniSutunlar: b.yeniSutunlar.map((s) => s.ad), kesin, satirSayisi: m.satirlar.length, eklenecekSatir: b.eklenecek.length,
      mevcutSatir: b.mevcutSatir, _oran: k / n, _birebir: birebir
    });
  }
  return sonuc.sort((a, b) => Number(b.kesin) - Number(a.kesin) || b._oran - a._oran || b._birebir - a._birebir || b.satirSayisi - a.satirSayisi)
    .map(({ _oran, _birebir, ...x }) => x);
}

// ---------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------

/** Elle yazılmış (tablodan gelmeyen) dolu değer. @param {Record<string, { deger: unknown; kaynak?: string }>} degerler @param {string} k */
const elleDeger = (degerler, k) => {
  const v = degerler[k];
  return v && v.kaynak !== 'tablo' && typeof v.deger === 'string' && v.deger.trim() ? v.deger : null;
};

/**
 * Bağlı liste zincirleri (il → ilçe → mahalle …): her kök için TEK tablo; sütunlar zincirin halkaları (sayfa sırasıyla, üst önce),
 * satırlar keşifte ve hızlı test akışında GÖZLENEN geçerli kombinasyonlar (bir alt listenin seçenekleri yalnız üst değerleri aynı olan
 * gözlemden alınır; tüm kombinasyonlar taranmaz, en çok ZINCIR_EN_COK_SATIR). Yalnız tam (her halkası dolu) satırlar alınır; kullanıcının
 * seçtiği yol tam değilse de satır olarak eklenir (senaryonun satırı). Hücre görünen metindir; sayfa değeri farklıysa karşılık yazılır (aynı
 * metin farklı değerlere karşılık geliyorsa sütun değerle yazılır). Gizli adlı halkası olan zincir tabloya alınmaz.
 * @param {{ alanlar: Nesne[]; degerler: Record<string, { deger: unknown; kaynak?: string }>; iliskiler?: ReadonlyArray<{ ust: string; alt: string }>;
 *   gozlemler?: ReadonlyArray<{ anahtar: string; secimler?: Record<string, unknown>; secenekler?: ReadonlyArray<{ deger: unknown; metin?: unknown }> }>; ekGizliAdlar?: ReadonlyArray<string> }} g
 * @param {Set<string>} kullanilanAdlar tablo adları (küçük harf; yeni adlar eklenir)
 * @returns {{ tablolar: PlanTablosu[]; alanlar: Set<string> }}
 */
function zincirTablolari(g, kullanilanAdlar) {
  const alan = new Map(g.alanlar.map((a) => [String(a.anahtar), a]));
  const sira = new Map(g.alanlar.map((a, i) => [String(a.anahtar), i]));
  const listeMi = (/** @type {Nesne | undefined} */ a) => Boolean(a) && ['select', 'select-one'].includes(String(a?.tur)) && !a?.coklu;
  /** @type {Map<string, string>} */
  const ustu = new Map();
  for (const i of g.iliskiler ?? []) if (i.ust !== i.alt && listeMi(alan.get(i.ust)) && listeMi(alan.get(i.alt)) && !ustu.has(i.alt)) ustu.set(i.alt, i.ust);
  // Döngü koruması: üst zinciri kendine dönen bağ atılır.
  for (const a of [...ustu.keys()]) {
    const gorulen = new Set([a]);
    for (let u = ustu.get(a); u; u = ustu.get(u)) { if (gorulen.has(u)) { ustu.delete(a); break; } gorulen.add(u); }
  }
  const siraIle = (/** @type {string} */ x, /** @type {string} */ y) => (sira.get(x) ?? 0) - (sira.get(y) ?? 0);
  const atalari = (/** @type {string} */ k) => { const l = []; for (let u = ustu.get(k); u; u = ustu.get(u)) l.push(u); return l; };
  const kokler = [...new Set(ustu.values())].filter((k) => !ustu.has(k)).sort(siraIle);
  /** @type {PlanTablosu[]} */
  const tablolar = [];
  /** @type {Set<string>} */
  const kullanilanAlanlar = new Set();
  for (const kok of kokler) {
    /** @type {string[]} */
    const grup = [];
    const gez = (/** @type {string} */ k) => { grup.push(k); for (const c of [...ustu].filter(([, u]) => u === k).map(([x]) => x).sort(siraIle)) gez(c); };
    gez(kok);
    const etiket = (/** @type {string} */ k) => String(alan.get(k)?.etiket ?? k);
    if (grup.length < 2 || grup.some((k) => gizliAdMi(etiket(k), g.ekGizliAdlar ?? []))) continue;
    // Kod → görünen metin (alanın seçenekleri + gözlemler).
    /** @type {Map<string, Map<string, string>>} */
    const metinler = new Map(grup.map((k) => [k, new Map()]));
    for (const k of grup) for (const x of tumSecenekler(/** @type {Nesne} */ (alan.get(k)))) metinler.get(k)?.set(x.kod, x.metin);
    const gozlemler = (g.gozlemler ?? []).filter((x) => grup.includes(x.anahtar));
    for (const x of gozlemler) for (const s of gercekSecenekler(/** @type {any} */ (x.secenekler))) if (!metinler.get(x.anahtar)?.has(s.deger)) metinler.get(x.anahtar)?.set(s.deger, s.metin.trim() || s.deger);
    /** @type {Array<Record<string, string>>} */
    const satirlar = [];
    /** @param {Record<string, string>} satir @param {number} i */
    const genislet = (satir, i) => {
      if (satirlar.length >= ZINCIR_EN_COK_SATIR) return;
      if (i === grup.length) { satirlar.push(satir); return; }
      const k = grup[i];
      /** @type {string[]} */
      let kodlar;
      if (i === 0) kodlar = tumSecenekler(/** @type {Nesne} */ (alan.get(k))).map((x) => x.kod);
      else {
        const u = /** @type {string} */ (ustu.get(k));
        const atalar = atalari(k);
        const m = new Set();
        for (const x of gozlemler) {
          if (x.anahtar !== k) continue;
          const s = x.secimler ?? {};
          if (String(s[u] ?? '') !== satir[u] || !atalar.every((a) => s[a] === undefined || String(s[a]) === satir[a])) continue;
          for (const y of gercekSecenekler(/** @type {any} */ (x.secenekler))) m.add(y.deger);
        }
        kodlar = [...m];
      }
      for (const kod of kodlar) genislet({ ...satir, [k]: kod }, i + 1);
    };
    genislet({}, 0);
    const kullanici = Object.fromEntries(grup.map((k) => [k, elleDeger(g.degerler, k)]).filter(([, v]) => v !== null));
    if (Object.keys(kullanici).length && !satirlar.some((r) => grup.every((k) => (r[k] ?? null) === (kullanici[k] ?? null)))) satirlar.unshift(/** @type {Record<string, string>} */ (kullanici));
    if (!satirlar.length) continue;
    // Sütunlar: ad = alan başlığı (tablo içinde tekil); hücre HER ZAMAN görünen metin (süslü listeler metinle seçilir). Sayfa değeri
    // karşılığı yalnız tek koda karşılık gelen metne yazılır; aynı metin farklı kodlara karşılık geliyorsa ("MERKEZ" iki ilçede) karşılık
    // yazılmaz — koşu o satırın süzülmüş listesinde seçeneği metniyle seçer.
    const adlar = new Set();
    const sutunlar = grup.map((k) => {
      let ad = adTemizle(etiket(k)) || k.slice(0, 60);
      for (let i = 2; adlar.has(kucuk(ad)); i++) ad = `${(adTemizle(etiket(k)) || 'Alan').slice(0, 55)} ${i}`;
      adlar.add(kucuk(ad));
      /** @type {Map<string, Set<string>>} */
      const kodlari = new Map();
      for (const r of satirlar) { const kod = r[k]; if (kod !== undefined) { const mt = metinler.get(k)?.get(kod) ?? kod; (kodlari.get(mt) ?? kodlari.set(mt, new Set()).get(mt))?.add(kod); } }
      /** @type {Record<string, { sayfa: string }>} */
      const karsiliklar = {};
      for (const [mt, v] of kodlari) { const kod = [...v][0]; if (v.size === 1 && kod !== mt) karsiliklar[mt] = { sayfa: kod }; }
      return { k, ad, karsiliklar };
    });
    const hucre = (/** @type {Record<string, string>} */ r, /** @type {(typeof sutunlar)[number]} */ s) => {
      const kod = r[s.k];
      return kod === undefined ? null : metinler.get(s.k)?.get(kod) ?? kod;
    };
    // Ad: halkalar kısa ise "İl - İlçe - Mahalle"; uzun zincirde kökten yaprağa okunur kısa ad ("İl → Daire/Kapı No zinciri").
    const tamAd = adTemizle(grup.map(etiket).join(' - '), 200);
    const temel = (tamAd.length <= 40 ? tamAd : adTemizle(`${etiket(grup[0])} → ${etiket(grup[grup.length - 1])} zinciri`)) || 'Zincir';
    let ad = temel;
    for (let i = 2; kullanilanAdlar.has(kucuk(ad)); i++) ad = `${temel.slice(0, 55).trim()} ${i}`;
    kullanilanAdlar.add(kucuk(ad));
    const secilen = Object.keys(kullanici).length
      ? Object.fromEntries(sutunlar.filter((s) => kullanici[s.k] !== undefined).map((s) => [s.ad, /** @type {string} */ (hucre(/** @type {Record<string, string>} */ (kullanici), s))]))
      : null;
    tablolar.push({
      ad, tur: 'liste', zincir: grup.map(etiket),
      sutunlar: sutunlar.map((s) => ({ ad: s.ad, gizli: false, karsiliklar: s.karsiliklar })),
      satirlar: satirlar.map((r) => Object.fromEntries(sutunlar.map((s) => [s.ad, hucre(r, s)]))),
      secilen,
      alanlar: sutunlar.map((s) => ({ oturumAnahtar: s.k, sutun: s.ad, etiket: etiket(s.k), degerli: kullanici[s.k] !== undefined }))
    });
    for (const k of grup) kullanilanAlanlar.add(k);
  }
  return { tablolar, alanlar: kullanilanAlanlar };
}

/**
 * @param {{ baslik: string; alanlar: Nesne[]; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string>;
 *   iliskiler?: ReadonlyArray<{ ust: string; alt: string }>; gozlemler?: ReadonlyArray<{ anahtar: string; secimler?: Record<string, unknown>; secenekler?: ReadonlyArray<{ deger: unknown; metin?: unknown }> }>;
 *   tetikler?: ReadonlyArray<{ kaynak: string; hedef: string; olay: 'belirdi' | 'doldu' }> }} g0
 * @returns {KayitPlani}
 */
export function planKur(g0) {
  // Çok parçalı alanlar (aynı satırda "Ad" + "Ad (2)" kutuları) tek kayıt: aynı tabloya, ayrı sütunlar olarak girer (cokParcaliIsaretle).
  const g1 = { ...g0, alanlar: cokParcaliIsaretle(g0.alanlar, g0.degerler) };
  const kullanilanAdlar = new Set();
  // Önce zincirler (kendi tabloları); zincirdeki alanlar tek alan tablolarına girmez.
  const zincir = zincirTablolari(g1, new Set());
  // Tetik (metin alanı girilince liste doluyor / alan beliriyor): hedef zincirde değilse ve iki alanın da kullanıcının yazdığı değeri varsa
  // hedef, kaynağın kayıt tablosuna aynı satırda girer (birlikte geçerli değerler ilişkili kalır). Diğer durumlarda hedefin tablosuna tetik
  // notu düşer.
  const tetikler = (g0.tetikler ?? []).filter((t) => t && t.kaynak !== t.hedef);
  const birlikte = new Map(tetikler.filter((t) => !zincir.alanlar.has(t.hedef) && elleDeger(g1.degerler, t.hedef) !== null && elleDeger(g1.degerler, t.kaynak) !== null)
    .map((t) => [t.hedef, t.kaynak]));
  const g = birlikte.size ? {
    ...g1, alanlar: g1.alanlar.map((a) => {
      const k = birlikte.get(String(a.anahtar));
      const kaynak = k ? g1.alanlar.find((x) => x.anahtar === k) : null;
      return kaynak ? { ...a, tabloGrubu: alanGrubu(kaynak).tablo } : a;
    })
  } : g1;
  // Görünürlüğü belirleyen seçim (başka alanların kosul.secim'i) kullanıcı değiştirmediyse sayfadaki değeriyle senaryonun değeri olur:
  // senaryo dalı açıkça kaydedilir ve alan liste tablosuna o satırla bağlanır (değer üretilmez: sayfada seçili gelen seçenek).
  // (Alanın ETİKETİNİ belirleyen seçim de — etiketKosulu — böyledir: senaryonun dalı alanın anlamını belirler. Alanın düzenlenebilirliğini
  // belirleyen seçim — kilitKosulu — da: o dalda sayfa alanı kendisi doldurur.)
  const kontroller = new Set(g.alanlar.flatMap((a) => [a.kosul?.secim, a.etiketKosulu?.secim, a.kilitKosulu?.secim]).filter(Boolean).map(String));
  /** @type {Record<string, { deger: unknown; kaynak?: string }>} */
  const degerler = { ...g.degerler };
  for (const a of g.alanlar) {
    const k = String(a.anahtar);
    // Kullanıcının koştuğu dalda görünmeyen (dalDisi) seçim senaryoya yazılmaz; seçenekleri aşağıda kendi liste tablosuna alınır.
    if (!kontroller.has(k) || a.dalDisi || !SECIM_TURLERI.includes(String(a.tur)) || degerler[k] !== undefined) continue;
    const l = tumSecenekler(a);
    const sayfa = [a.sayfadaki, a.mevcut].map((v) => (v === undefined || v === null ? '' : String(v))).find(Boolean);
    const s = sayfa ? l.find((x) => x.kod === sayfa) ?? l.find((x) => x.metin === sayfa) : undefined;
    if (s) degerler[k] = { deger: s.kod, kaynak: 'sayfa' };
  }
  const t = tabloTaslagiKur({ baslik: g.baslik, alanlar: g.alanlar.filter((a) => !zincir.alanlar.has(String(a.anahtar))), degerler, ekGizliAdlar: g.ekGizliAdlar });
  const satirAdi = adTemizle(g.baslik || 'Hızlı test') || 'Hızlı test';
  /** @type {PlanTablosu[]} */
  const tablolar = [];
  const etiketi = (/** @type {string} */ anahtar) => String(g.alanlar.find((a) => a.anahtar === anahtar)?.etiket ?? anahtar);
  const kullanilanAlanlar = new Set(zincir.alanlar);
  for (const x of t?.tablolar ?? []) {
    const gizli = new Map(x.sutunlar.map((s) => [s.ad, s.gizli]));
    /** @type {Record<string, string>} */
    const secilen = Object.fromEntries(Object.entries(x.satir).filter(([ad]) => gizli.get(ad) !== true).slice(0, 6));
    tablolar.push({
      ad: x.tabloAdi, tur: x.liste ? 'liste' : 'kayit',
      sutunlar: x.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, karsiliklar: Object.fromEntries(Object.entries(x.karsiliklar[s.ad] ?? {}).map(([metin, kod]) => [metin, { sayfa: kod }])) })),
      satirlar: x.liste ? x.liste.secenekler.map((s) => ({ [/** @type {{ sutun: string }} */ (x.liste).sutun]: s.metin })) : [x.satir],
      secilen: Object.keys(secilen).length ? secilen : null,
      alanlar: Object.entries(x.baglar).map(([k, b]) => ({ oturumAnahtar: k, sutun: b.sutun, etiket: etiketi(k), degerli: true }))
    });
    kullanilanAdlar.add(kucuk(x.tabloAdi));
    for (const k of Object.keys(x.baglar)) kullanilanAlanlar.add(k);
  }
  // Zincir tabloları (adları diğer tablolarla çakışmaz).
  for (const z of zincir.tablolar) {
    let ad = z.ad;
    for (let i = 2; kullanilanAdlar.has(kucuk(ad)); i++) ad = `${z.ad.slice(0, 55).trim()} ${i}`;
    kullanilanAdlar.add(kucuk(ad));
    tablolar.push({ ...z, ad });
  }
  // Tabloya alınmayan seçim alanları (değer yazılmayan seçimler, radyo / onay kutusu) yalnız SENARYO ÖNERİLERİ için liste olarak tutulur
  // (yalnizOneri): kullanıcıya tablo olarak önerilmez, hiçbir zaman yazılmaz; değeri senaryoda seçilir.
  let ek = 0;
  for (const a of g.alanlar) {
    if (ek >= EN_COK_LISTE_TABLOSU) break;
    // Çok parçalı alanın parçası kendi liste tablosunu açmaz (parçalar birlikte tek kayıttır).
    if (kullanilanAlanlar.has(a.anahtar) || !SECIM_TURLERI.includes(String(a.tur)) || a.devreDisi || a.saltOkunur || a.parca) continue;
    /** @type {Map<string, { metin: string; kod: string }>} */
    const secenekler = new Map(tumSecenekler(a).map((x) => [kucuk(x.metin), x]));
    const etiket = String(a.etiket ?? '');
    const ad = adTemizle(etiket);
    if (secenekler.size < 2 || secenekler.size > EN_COK_SECENEK || !ad || kullanilanAdlar.has(kucuk(ad)) || gizliAdMi(ad, g.ekGizliAdlar ?? [])) continue;
    tablolar.push({
      ad, tur: 'liste', sutunlar: [{ ad, gizli: false, karsiliklar: Object.fromEntries([...secenekler.values()].filter((s) => s.metin !== s.kod).map((s) => [s.metin, { sayfa: s.kod }])) }],
      satirlar: [...secenekler.values()].map((s) => ({ [ad]: s.metin })), secilen: null,
      alanlar: [{ oturumAnahtar: a.anahtar, sutun: ad, etiket, degerli: false }], yalnizOneri: true
    });
    kullanilanAdlar.add(kucuk(ad));
    ek++;
  }
  // Tetik notları: hedef alanı taşıyan tabloya ("“Marka” seçenekleri “Kod” girilince gelir.").
  for (const t of tetikler) {
    const x = tablolar.find((y) => y.alanlar.some((a) => a.oturumAnahtar === t.hedef));
    if (!x) continue;
    const not = `“${etiketi(t.hedef)}” ${t.olay === 'belirdi' ? 'alanı' : 'seçenekleri'} “${etiketi(t.kaynak)}” girilince ${t.olay === 'belirdi' ? 'belirir' : 'gelir'}.`;
    x.tetik = [...new Set([...(x.tetik ?? []), not])];
  }
  // Satır adı bağlamı: kullanıcının seçtiği değerler (seçim alanları, sayfa sırasıyla) — mevcut tabloya yeni satır eklenirken satırların
  // adları bu değerlerin türündense (ör. il adları) seçilen değer satır adı olur.
  const baglam = g.alanlar.filter((a) => SECIM_TURLERI.includes(String(a.tur))).flatMap((a) => {
    const v = elleDeger(g.degerler, a.anahtar);
    if (v === null) return [];
    const l = tumSecenekler(a);
    const s = l.find((x) => x.kod === v);
    const ust = String(a.anahtar);
    const gozlenen = (g.gozlemler ?? []).filter((x) => x.anahtar === ust).flatMap((x) => gercekSecenekler(/** @type {any} */ (x.secenekler)).map((y) => y.metin));
    return [{ secilen: s?.metin ?? v, secenekler: [...new Set([...l.map((x) => x.metin), ...gozlenen])] }];
  });
  return { satirAdi, tablolar, baglam };
}

/**
 * Önizleme (paketTestVerisiOnizle ile aynı biçim; arayüzde testVerisiSecimi bunu gösterir).
 * @param {Veritabani} vt @param {string} projeId @param {KayitPlani} plan @param {string | null} ekranId mevcut ekran (varsa)
 * @param {Record<string, string>} anahtarlar oturum alan anahtarı → modeldeki senaryo anahtarı (modelde olmayan alan bağlanamaz)
 * @returns {import('./kayit-plani.d.mts').PlanOnizlemesi}
 */
export function planOnizle(vt, projeId, plan, ekranId, anahtarlar) {
  const mevcutlar = tablolariListele(vt, projeId);
  const mevcutBaglar = ekranId ? ekranAlanBaglari(vt, ekranId) : {};
  const tabloAdi = (/** @type {string} */ id) => mevcutlar.find((x) => x.id === id)?.ad ?? null;
  const hedefler = mevcutlar.filter((x) => !x.baglam && !String(x.id).startsWith('baglam_') && x.sutunlar.length);
  return {
    kaynak: 'hizli',
    // Elle seçim için projenin tabloları (yalnız ad / sütun adı / gizlilik ve satır sayısı; değer yok): "Mevcut tabloya bağla" ve
    // "Mevcut tabloya yeni sütun olarak ekle".
    mevcutTablolar: hedefler.map((x) => ({
      id: x.id, ad: x.ad, tur: x.kaynak?.tabloTuru === 'liste' ? 'liste' : 'kayit', sutunlar: x.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli === true })), satirSayisi: x.satirlar.length
    })),
    // Yalnız senaryo önerileri için tutulan listeler (yalnizOneri) kullanıcıya tablo olarak gösterilmez.
    tablolar: plan.tablolar.filter((t) => !t.yalnizOneri).map((t) => {
      const m = mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
      const p = m ? birlestirmePlani(m, t) : null;
      const bagla = m ? [] : mevcutSutunAdaylari(t, mevcutlar).slice(0, EN_COK_BAGLA_ADAYI);
      /** @type {Record<string, Record<string, string>>} */
      const eslemeOnerileri = {};
      for (const x of hedefler) {
        const e = sutunEslemesi(t, x);
        if (e.length) eslemeOnerileri[x.id] = Object.fromEntries(e.map((y) => [y.plan, y.hedef]));
      }
      return {
        ad: t.ad, tur: t.tur, aciklama: t.tetik?.length ? t.tetik.join(' ') : null, zincir: t.zincir ?? null, eslemeOnerileri,
        sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, karsilikSayisi: Object.keys(s.karsiliklar).length })),
        satirSayisi: t.satirlar.length, tekrarSayisi: 0,
        ornek: t.satirlar.slice(0, 5).map((d) => t.sutunlar.map((s) => (s.gizli ? null : d[s.ad] ?? null))),
        bagliAlanlar: t.alanlar.filter((a) => anahtarlar[a.oturumAnahtar]).map((a) => a.etiket),
        bagla,
        benzer: m || bagla.length ? [] : benzerTablolar(t.sutunlar, mevcutlar, { ad: t.ad, satirlar: t.satirlar }).slice(0, 3).map((b) => {
          const x = mevcutlar.find((y) => y.id === b.id);
          return { id: b.id, ad: b.ad, puan: b.puan, eklenecekSatir: x ? birlestirmePlani(x, t).eklenecek.length : t.satirlar.length };
        }),
        mevcut: m && p ? { id: m.id, ad: m.ad, sutunSayisi: m.sutunlar.length, satirSayisi: m.satirlar.length, yeniSutunlar: p.yeniSutunlar.map((s) => s.ad), eklenecekSatir: p.eklenecek.length } : null
      };
    }),
    baglantilar: plan.tablolar.filter((t) => !t.yalnizOneri).flatMap((t) => t.alanlar.filter((a) => anahtarlar[a.oturumAnahtar] && !(t.sutunlar.find((s) => s.ad === a.sutun)?.gizli && t.tur === 'liste')).map((a) => {
      const alanId = anahtarlar[a.oturumAnahtar];
      const eski = /** @type {{ tablo: string; sutun: string } | undefined} */ (mevcutBaglar[alanId]);
      return {
        alanId, alanEtiketi: a.etiket, tablo: t.ad, sutun: a.sutun, modeldeVar: true,
        mevcut: eski ? { tablo: tabloAdi(eski.tablo) ?? '(silinmiş tablo)', sutun: eski.sutun } : null
      };
    }))
  };
}

/** Yazılan satırın kimliği (satır adı tabloda tekildir: kayitSatiri). @param {Veritabani} vt @param {string} projeId @param {string} tabloId @param {string} ad */
function satirKimligi(vt, projeId, tabloId, ad) {
  const r = tablolariListele(vt, projeId).find((x) => x.id === tabloId)?.satirlar.find((s) => kucuk(s.ad) === kucuk(ad));
  return r?.id ? String(r.id) : null;
}

/**
 * Zincir tablosunda senaryonun satırı (kullanıcının seçtiği yol): yazılan tabloda seçilen halkaların hepsi aynı olan satırın kimliği; zincir
 * değilse ya da seçim yoksa null. Senaryo bu satıra satır kimliğiyle sabitlenir (metin / kod karışmaz).
 * @param {Veritabani} vt @param {string} projeId @param {string} tabloId @param {PlanTablosu} t @param {(sutun: string) => string} hedef
 */
function zincirSatiri(vt, projeId, tabloId, t, hedef) {
  if (!t.zincir || !t.secilen) return null;
  const secilen = Object.entries(t.secilen).map(([k, v]) => [hedef(k), v]);
  const r = tablolariListele(vt, projeId).find((x) => x.id === tabloId)?.satirlar.find((x) => secilen.every(([k, v]) => ayniDeger(x.degerler[k], v)));
  return r?.id ? String(r.id) : null;
}

/**
 * Seçim yoksa varsayılan: aynı adlı tablo varsa birleştir; sütunu birebir eşleşen mevcut tablo varsa ona bağla; yoksa yeni; tüm bağlantılar.
 * @param {import('./kayit-plani.d.mts').PlanOnizlemesi} onizleme
 */
export function varsayilanSecim(onizleme) {
  return {
    tablolar: Object.fromEntries(onizleme.tablolar.map((t) => [t.ad, t.mevcut ? { islem: 'birlestir' } : t.bagla?.[0]?.kesin ? { islem: 'bagla', hedefId: t.bagla[0].id } : { islem: 'yeni' }])),
    baglantilar: onizleme.baglantilar.map((b) => b.alanId)
  };
}

/** Liste satırının adı: tek sütunda değer, çok sütunda (zincir) değerler " › " ile. @param {Record<string, string | null>} d */
const listeSatirAdi = (d) => Object.values(d).filter((v) => !bosMu(v)).map(String).join(' › ').slice(0, 60).trim() || 'Satır';

/**
 * Elle sütun eşlemesi ("Mevcut tabloya bağla" — kullanıcı her plan sütunu için hedef sütunu seçti). Değer '' (ya da yok): o plan sütunu
 * tabloya YENİ sütun olarak eklenir. Kurallar: hedef sütun tabloda olmalı, iki plan sütunu aynı sütuna gidemez, liste (seçim)
 * tablosu gizli sütuna yazılamaz.
 * @param {PlanTablosu} t @param {{ ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }} m @param {Record<string, unknown>} secilen
 * @returns {Array<{ plan: string; hedef: string }>}
 */
function elleEslesme(t, m, secilen) {
  /** @type {Array<{ plan: string; hedef: string }>} */
  const sonuc = [];
  const kullanilan = new Set();
  for (const s of t.sutunlar) {
    const h = typeof secilen[s.ad] === 'string' ? String(secilen[s.ad]).trim() : '';
    if (!h) continue;
    const c = m.sutunlar.find((x) => x.ad === h) ?? m.sutunlar.find((x) => kucuk(x.ad) === kucuk(h));
    if (!c) throw new Error(`"${m.ad}" tablosunda "${h}" sütunu yok: özeti yenileyip yeniden seçin.`);
    if (kullanilan.has(c.ad)) throw new Error(`"${m.ad}" tablosunun "${c.ad}" sütunu iki alana seçildi: her sütuna bir alan bağlanır.`);
    if (t.tur === 'liste' && c.gizli) throw new Error(`Seçim listesi "${m.ad}" tablosunun gizli "${c.ad}" sütununa bağlanamaz.`);
    kullanilan.add(c.ad);
    sonuc.push({ plan: s.ad, hedef: c.ad });
  }
  return sonuc;
}

/**
 * Kullanıcının düzenlediği sütun adları (plan sütunu → ad). Boş ad, tekrar eden ad ve (verilmişse) mevcut sütunla çakışan ad kabul edilmez.
 * @param {PlanTablosu} t @param {unknown} adlar @param {{ tablo?: string; mevcut?: ReadonlyArray<{ ad: string }> }} [s]
 * @returns {Map<string, string>} plan sütunu → yazılacak ad
 */
function sutunAdlariDogrula(t, adlar, s = {}) {
  const verilen = adlar && typeof adlar === 'object' ? /** @type {Record<string, unknown>} */ (adlar) : {};
  /** @type {Map<string, string>} */
  const sonuc = new Map();
  const gorulen = new Set();
  const mevcut = new Set((s.mevcut ?? []).map((x) => kucuk(x.ad)));
  for (const x of t.sutunlar) {
    const ham = verilen[x.ad];
    const ad = typeof ham === 'string' ? adTemizle(ham) : x.ad;
    if (!ad) throw new Error(`"${t.ad}" için "${x.ad}" sütununun adını yazın.`);
    if (gorulen.has(kucuk(ad))) throw new Error(`"${t.ad}" için "${ad}" sütun adı iki kez yazıldı.`);
    if (mevcut.has(kucuk(ad))) throw new Error(`"${s.tablo}" tablosunda "${ad}" sütunu zaten var: o sütuna bağlayın (Mevcut tabloya bağla) ya da başka ad yazın.`);
    gorulen.add(kucuk(ad));
    sonuc.set(x.ad, ad);
  }
  return sonuc;
}

/**
 * Plan tablosunun sütunları yeniden adlandırılmış kopyası (satırlar, karşılıklar, senaryo seçimi ve alan bağları da). @param {PlanTablosu} t
 * @param {(ad: string) => string} ad
 * @returns {PlanTablosu}
 */
const adlandirilmis = (t, ad) => ({
  ...t,
  sutunlar: t.sutunlar.map((s) => ({ ...s, ad: ad(s.ad) })),
  satirlar: t.satirlar.map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [ad(k), v]))),
  secilen: t.secilen ? Object.fromEntries(Object.entries(t.secilen).map(([k, v]) => [ad(k), v])) : null,
  alanlar: t.alanlar.map((a) => ({ ...a, sutun: ad(a.sutun) }))
});

/**
 * Seçimle yazar (TEK işlemde: bir tablo yazılamazsa hiçbiri yazılmaz). 'atla' tablo yazılmaz (alanlar senaryoda düz değerle kalır).
 * Mevcut tabloya yazarken mevcut satır / sütunlar değişmez: eksik sütunlar, olmayan satırlar ve eksik karşılıklar eklenir.
 *  - 'yeni' / 'yeniAd' (yeniAd): yeni tablo; sutunAdlari verilmişse sütunlar o adlarla (kullanıcı düzenledi).
 *  - 'birlestir' (hedefId yoksa aynı adlı tablo): birlestirmePlani.
 *  - 'bagla' (hedefId): plan sütunları mevcut tablonun sütunlarına yazılır. eslesme verilmişse (elle: plan sütunu → mevcut sütun; '' =
 *    yeni sütun) o eşleme, yoksa otomatik aday (mevcutSutunAdaylari). Kayıt tablosunda değer o tabloda zaten varsa senaryo o satıra satır
 *    kimliğiyle sabitlenir; yoksa yeni satır eklenir (adı: seçilen değerlerden satır adlarıyla aynı türde olan — ör. il —, yoksa senaryo
 *    adı). Liste / zincir tablosunda olmayan satırlar (kombinasyonlar) eklenir.
 *  - 'sutunEkle' (hedefId, sutunAdlari): plan sütunları mevcut tabloya YENİ sütun olarak eklenir (ad tabloda varsa hata: bağla önerilir);
 *    mevcut satırların yeni hücreleri boş kalır; kaydın değerleri yeni satıra (adı 'bagla' ile aynı kural) yazılır.
 * @param {Veritabani} vt @param {string} projeId @param {KayitPlani} plan
 * @param {import('./kayit-plani.d.mts').PlanSecimi} secim @param {{ ekranAdi: string }} bilgi
 * @returns {import('./kayit-plani.d.mts').YazilanTablo[]}
 */
export function planYaz(vt, projeId, plan, secim, bilgi) {
  return vt.islem(() => planYazIslem(vt, projeId, plan, secim, bilgi));
}

/** @param {Veritabani} vt @param {string} projeId @param {KayitPlani} plan @param {import('./kayit-plani.d.mts').PlanSecimi} secim @param {{ ekranAdi: string }} bilgi */
function planYazIslem(vt, projeId, plan, secim, bilgi) {
  /** @type {import('./kayit-plani.d.mts').YazilanTablo[]} */
  const sonuc = [];
  for (const t of plan.tablolar) {
    const sec = t.yalnizOneri ? { islem: 'atla' } : secim.tablolar?.[t.ad] ?? { islem: 'atla' };
    if (sec.islem === 'atla') continue;
    if (!['yeni', 'yeniAd', 'birlestir', 'bagla', 'sutunEkle'].includes(sec.islem)) throw new Error(`"${t.ad}" için bilinmeyen seçim: ${sec.islem}.`);
    const mevcutlar = tablolariListele(vt, projeId, sec.islem === 'bagla' ? { cozulsun: true } : {});
    const kaynak = { tur: 'kayit', olusturan: 'Nöbetçi hızlı test', ekran: bilgi.ekranAdi.slice(0, 120), yazilma: new Date().toISOString() };
    const kayitSatiri = (/** @type {Set<string>} */ kullanilan, /** @type {Record<string, string | null>} */ d, /** @type {string} */ temel = plan.satirAdi) => {
      let ad = temel;
      for (let i = 2; kullanilan.has(kucuk(ad)); i++) ad = `${temel.slice(0, 55)} ${i}`;
      kullanilan.add(kucuk(ad));
      return { ad, ortamId: null, degerler: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) };
    };
    if (sec.islem === 'yeni' || sec.islem === 'yeniAd') {
      const ad = sec.islem === 'yeniAd' ? adTemizle(sec.yeniAd ?? '') : t.ad;
      if (!ad) throw new Error(`"${t.ad}" tablosu için yeni ad yazın.`);
      if (mevcutlar.some((x) => kucuk(x.ad) === kucuk(ad))) throw new Error(`"${ad}" adında bir tablo zaten var: birleştir, yeni ad ya da atla seçin.`);
      const adlar = sutunAdlariDogrula(t, sec.sutunAdlari);
      const sutunAdi = (/** @type {string} */ s) => adlar.get(s) ?? s;
      const t2 = adlandirilmis(t, sutunAdi);
      const kullanilan = new Set();
      const kayitSatirlari = t2.tur === 'liste' ? [] : t2.satirlar.map((d) => kayitSatiri(kullanilan, d));
      const id = tabloKaydet(vt, {
        projeId, ad, tur: t2.tur, kaynak,
        sutunlar: t2.sutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) })),
        satirlar: t2.tur === 'liste' ? t2.satirlar.map((d) => ({ ad: listeSatirAdi(d), ortamId: null, degerler: d })) : kayitSatirlari
      });
      sonuc.push({
        planAdi: t.ad, ad, id, islem: sec.islem, eklenenSatir: t.satirlar.length, eklenenSutun: t.sutunlar.length, hedef: sutunAdi, pin: t2.secilen,
        satirId: kayitSatirlari.length ? satirKimligi(vt, projeId, id, kayitSatirlari[0].ad) : zincirSatiri(vt, projeId, id, t, sutunAdi), tur: t.tur, plan: t
      });
      continue;
    }
    /** @type {{ eslesme: Map<string, string>; yeniSutunlar: PlanTablosu['sutunlar']; eklenecek: Array<Record<string, string | null>>; adlar?: Map<string, string> }} */
    let p;
    /** @type {(typeof mevcutlar)[number] | undefined} */
    let mevcut;
    /** @type {string | null} */
    let hazirSatir = null;
    if (sec.islem === 'bagla') {
      mevcut = mevcutlar.find((x) => x.id === sec.hedefId);
      /** @type {ReadonlyArray<{ plan: string; hedef: string }>} */
      let eslesme;
      if (sec.eslesme && typeof sec.eslesme === 'object') {
        if (!mevcut) throw new Error(`"${t.ad}" için seçilen mevcut tablo bulunamadı: özeti yenileyip yeniden seçin.`);
        eslesme = elleEslesme(t, mevcut, sec.eslesme);
      } else {
        const aday = mevcutSutunAdaylari(t, mevcutlar).find((x) => x.id === sec.hedefId);
        if (!aday || !mevcut) throw new Error(`"${t.ad}" için seçilen mevcut tablo artık uygun değil: özeti yenileyip yeniden seçin.`);
        eslesme = aday.eslesme;
      }
      const b = baglamaSonucu(t, mevcut, eslesme);
      hazirSatir = b.mevcutSatir?.id ?? null;
      p = { eslesme: new Map(eslesme.map((e) => [e.plan, e.hedef])), yeniSutunlar: b.yeniSutunlar, eklenecek: b.eklenecek };
    } else if (sec.islem === 'sutunEkle') {
      mevcut = mevcutlar.find((x) => x.id === sec.hedefId);
      if (!mevcut) throw new Error(`"${t.ad}" için seçilen mevcut tablo bulunamadı: özeti yenileyip yeniden seçin.`);
      const adlar = sutunAdlariDogrula(t, sec.sutunAdlari, { tablo: mevcut.ad, mevcut: mevcut.sutunlar });
      p = { eslesme: new Map(), yeniSutunlar: t.sutunlar, eklenecek: [...t.satirlar], adlar };
    } else {
      mevcut = sec.hedefId ? mevcutlar.find((x) => x.id === sec.hedefId) : mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
      if (!mevcut) throw new Error(`"${t.ad}" adında birleştirilecek tablo yok.`);
      p = birlestirmePlani(mevcut, t);
    }
    const m = /** @type {NonNullable<typeof mevcut>} */ (mevcut);
    const paketSutunu = (/** @type {string} */ mevcutAd) => t.sutunlar.find((x) => p.eslesme.get(x.ad) === mevcutAd);
    // Yeni sütun adı mevcut bir sütunla çakışırsa numaralanır (sutunEkle'de çakışma önceden hata).
    const adlar = new Set(m.sutunlar.map((x) => kucuk(x.ad)));
    /** @type {Map<string, string>} */
    const yeniAd = new Map();
    for (const x of p.yeniSutunlar) {
      const temel = p.adlar?.get(x.ad) ?? x.ad;
      let ad = temel;
      for (let i = 2; adlar.has(kucuk(ad)); i++) ad = `${temel.slice(0, 55)} ${i}`;
      adlar.add(kucuk(ad));
      yeniAd.set(x.ad, ad);
    }
    const sutunlar = [
      ...m.sutunlar.map((c) => {
        const ps = paketSutunu(c.ad);
        const eksik = ps && !c.gizli ? Object.fromEntries(Object.entries(ps.karsiliklar).filter(([d]) => !c.karsiliklar?.[d])) : {};
        return { ad: c.ad, eskiAd: c.ad, gizli: c.gizli, ...(Object.keys(eksik).length ? { karsiliklar: { ...(c.karsiliklar ?? {}), ...eksik } } : {}) };
      }),
      ...p.yeniSutunlar.map((x) => ({ ad: /** @type {string} */ (yeniAd.get(x.ad)), gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) }))
    ];
    const hedef = (/** @type {string} */ ad) => p.eslesme.get(ad) ?? yeniAd.get(ad) ?? ad;
    const kullanilan = new Set(m.satirlar.map((r) => kucuk(r.ad)));
    // Mevcut tabloya yeni kayıt satırının adı: seçilen değerlerden mevcut satır adlarıyla aynı türde olan (ör. satırlar il adlarıysa seçilen il).
    const baglamAdi = (sec.islem === 'bagla' || sec.islem === 'sutunEkle') && t.tur !== 'liste'
      ? (plan.baglam ?? []).find((b) => b.secenekler.some((x) => kullanilan.has(kucuk(x))))?.secilen ?? plan.satirAdi : plan.satirAdi;
    const yeniSatirlar = p.eklenecek.map((d) => {
      const esli = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null).map(([k, v]) => [hedef(k), v]));
      return t.tur === 'liste' ? { ad: listeSatirAdi(d), ortamId: null, degerler: esli } : { ...kayitSatiri(kullanilan, d, adTemizle(baglamAdi) || plan.satirAdi), degerler: esli };
    });
    const id = tabloKaydet(vt, { projeId, id: m.id, ad: m.ad, sutunlar, satirlar: yeniSatirlar });
    // Senaryonun satırı (kayıt tablosu): EKLENEN yeni satır; aynısı zaten varsa (bağlamada eşleşen satır; birleştirmede gizli değeri
    // olmayan, açık değerleri birebir aynı satır) o mevcut satır. Senaryo bu satıra satır kimliğiyle sabitlenir.
    let satirId = hazirSatir;
    if (!satirId && t.tur !== 'liste' && t.satirlar.length) {
      const ilk = t.satirlar[0];
      const i = p.eklenecek.indexOf(ilk);
      if (i >= 0) satirId = satirKimligi(vt, projeId, id, String(yeniSatirlar[i].ad));
      else {
        const esli = Object.entries(ilk).filter(([, v]) => v !== null).map(([k, v]) => [hedef(k), String(v)]);
        satirId = m.satirlar.find((r) => esli.every(([k, v]) => String(r.degerler[k] ?? '') === v))?.id ?? null;
      }
    }
    if (!satirId) satirId = zincirSatiri(vt, projeId, id, t, hedef);
    sonuc.push({
      planAdi: t.ad, ad: m.ad, id, islem: sec.islem === 'bagla' || sec.islem === 'sutunEkle' ? sec.islem : 'birlestir', eklenenSatir: p.eklenecek.length, eklenenSutun: p.yeniSutunlar.length, hedef,
      pin: t.secilen ? Object.fromEntries(Object.entries(t.secilen).map(([k, v]) => [hedef(k), v])) : null, satirId: satirId ? String(satirId) : null, tur: t.tur, plan: t
    });
  }
  return sonuc;
}

/** Senaryonun tablodan aldığı değere alan başvurusu. @param {string} tabloAdi @param {string} sutun @param {string} [etiket] */
export const basvuruYaz = (tabloAdi, sutun, etiket = '') => degerBasvurusuYaz(tabloAdi, sutun, etiket);
/** Aynı tablodan "Doldur" ile başka satır seçilmişken hızlı test kaydının kendi satırının grup etiketi (${Tablo[senaryo].Sütun}). */
export const KAYIT_ETIKETI = 'senaryo';
/** Satır seçimi (pin) anahtarı. @param {string} tabloId */
export const pinAnahtari = (tabloId) => grupAnahtari(tabloId, '');
/**
 * Yazılan tablonun senaryo satır seçimi: kayıt tablosunda satır KİMLİĞİYLE (gizli / açık değerden bağımsız; yalnız gizli sütunu dolu
 * satırda da kurulur) ve zincir tablosunda (kullanıcının yolu), tek alanlı liste tablosunda seçilen değerle. Yoksa null.
 * @param {{ satirId?: string | null; pin: Record<string, string> | null; tur: 'kayit' | 'liste'; plan?: { zincir?: string[] } }} y @returns {Record<string, string> | null}
 */
export function pinSecimi(y) {
  if ((y.tur !== 'liste' || y.plan?.zincir) && y.satirId) return satirSabitlemesi(y.satirId);
  return y.pin && Object.keys(y.pin).length ? Object.fromEntries(Object.entries(y.pin).map(([k, v]) => [k, String(v).slice(0, 200)])) : null;
}

/**
 * "Veri bekliyor" önerisinin (dalın değeri olmayan alanları) test verisi satırları — değer YAZILMAZ: her alan, o dalda sorulduğu adla
 * kaydedilseydi gideceği tabloya (alanGrubu: kişi / kart alanları gruplu, diğerleri kendi tablosu) sütun olarak eklenir (yoksa; gizli
 * sütun kuralı hassasAlanMi) ve öneri için o tabloya BOŞ hücreli bir satır eklenir (tablo yoksa kayıt tablosu olarak açılır). Senaryo bu
 * satıra kendi grubuyla (${Tablo[dal].Sütun}) bağlanır; kullanıcı hücreleri Test verisi'nde doldurur. Tek işlemde.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ satirAdi: string; ekranAdi: string; ekGizliAdlar?: ReadonlyArray<string>; alanlar: ReadonlyArray<{ anahtar: string; etiket: string; alan: Nesne }> }} g
 * @returns {Array<{ anahtar: string; etiket: string; tabloId: string; tabloAdi: string; sutun: string; satirId: string }>}
 */
export function veriBekleyenSatirlariYaz(vt, projeId, g) {
  return vt.islem(() => {
    /** @type {Map<string, { tablo: string; sutunlar: Array<{ ad: string; gizli: boolean }>; uyeler: Array<{ anahtar: string; etiket: string; sutun: string }> }>} */
    const gruplar = new Map();
    for (const x of g.alanlar) {
      const a = { ...x.alan, etiket: x.etiket };
      const yer = alanGrubu(a);
      const k = kucuk(yer.tablo);
      const grup = gruplar.get(k) ?? gruplar.set(k, { tablo: yer.tablo, sutunlar: [], uyeler: [] }).get(k);
      if (!grup) continue;
      if (!grup.sutunlar.some((s) => kucuk(s.ad) === kucuk(yer.sutun))) grup.sutunlar.push({ ad: yer.sutun, gizli: hassasAlanMi(a, yer, g.ekGizliAdlar ?? []) });
      grup.uyeler.push({ anahtar: x.anahtar, etiket: x.etiket, sutun: yer.sutun });
    }
    const sonuc = [];
    const kaynak = { tur: 'kayit', olusturan: 'Nöbetçi hızlı test', ekran: g.ekranAdi.slice(0, 120), yazilma: new Date().toISOString() };
    for (const grup of gruplar.values()) {
      const mevcut = tablolariListele(vt, projeId).find((t) => kucuk(t.ad) === kucuk(grup.tablo) && !t.baglam);
      const kullanilan = new Set((mevcut?.satirlar ?? []).map((r) => kucuk(r.ad)));
      const temel = adTemizle(g.satirAdi, 100) || 'Veri bekliyor';
      let satirAdi = temel;
      for (let i = 2; kullanilan.has(kucuk(satirAdi)); i++) satirAdi = `${temel.slice(0, 95)} ${i}`;
      /** Plan sütunu → tablodaki adı (aynı adlı sütun varsa o). */
      const hedef = new Map(grup.sutunlar.map((s) => [s.ad, mevcut?.sutunlar.find((c) => kucuk(c.ad) === kucuk(s.ad))?.ad ?? s.ad]));
      const sutunlar = mevcut
        ? [...mevcut.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: Boolean(c.gizli) })),
          ...grup.sutunlar.filter((s) => !mevcut.sutunlar.some((c) => kucuk(c.ad) === kucuk(s.ad))).map((s) => ({ ad: s.ad, gizli: s.gizli }))]
        : grup.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli }));
      const tabloId = tabloKaydet(vt, {
        projeId, ...(mevcut ? { id: mevcut.id } : { tur: 'kayit', kaynak }), ad: mevcut ? mevcut.ad : grup.tablo, sutunlar,
        satirlar: [{ ad: satirAdi, ortamId: null, degerler: {} }]
      });
      const satirId = satirKimligi(vt, projeId, tabloId, satirAdi);
      if (!satirId) throw new Error(`"${grup.tablo}" tablosuna satır eklenemedi.`);
      for (const u of grup.uyeler) {
        sonuc.push({ anahtar: u.anahtar, etiket: u.etiket, tabloId, tabloAdi: mevcut ? mevcut.ad : grup.tablo, sutun: /** @type {string} */ (hedef.get(u.sutun)), satirId });
      }
    }
    return sonuc;
  });
}

// ---------------------------------------------------------------------------------------
// Senaryo önerileri
// ---------------------------------------------------------------------------------------

/**
 * İkili (pairwise) kapsam — az ama anlamlı: her faktörün seviye sayısı (0 = şimdiki değer) → az sayıda satır (seviye indeksleri). Kapsanan:
 * farklı iki faktörün ALTERNATİF seviyelerinin her çifti ve her alternatif seviye en az bir kez (şimdiki değerle eşleşen çiftler kaydedilen
 * senaryo ve diğer satırlarla zaten görülür; onları ayrıca kapsamak öneri sayısını şişirir ve bir alternatifi "tek başına" önerir).
 * Açgözlü, deterministik: kapsanmamış bir alternatif çifti (yoksa tek alternatif) tohumlanır; diğer faktörlerde en çok yeni çift kapsayan
 * seviye seçilir (eşitlikte değişen ve daha az kullanılmış seviye). Tek faktörde her alternatif bir satır. En çok enCok satır.
 * @param {ReadonlyArray<number>} boyutlar @param {number} enCok @returns {number[][]}
 */
export function ikiliKapsam(boyutlar, enCok) {
  const n = boyutlar.length;
  /** @type {number[][]} */
  const satirlar = [];
  if (!n || enCok <= 0) return satirlar;
  const anahtar = (/** @type {number} */ i, /** @type {number} */ a, /** @type {number} */ j, /** @type {number} */ b) => `${i}:${a}|${j}:${b}`;
  /** @type {Map<string, [number, number, number, number]>} */
  const acik = new Map();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let a = 1; a < boyutlar[i]; a++) for (let b = 1; b < boyutlar[j]; b++) {
    acik.set(anahtar(i, a, j, b), [i, a, j, b]);
  }
  /** Henüz hiçbir satırda denenmemiş alternatif seviyeler (yalnız çifti olmayan — tek alternatifli etken — için ayrıca gerekir). */
  const ciftli = boyutlar.filter((b) => b > 1).length > 1;
  const tekler = new Set(ciftli ? [] : boyutlar.flatMap((b, i) => Array.from({ length: Math.max(0, b - 1) }, (_, a) => `${i}:${a + 1}`)));
  // Küçük uzay (olası satır sayısı sınırlı): tüm satırlar aday; her turda en çok yeni çift (+ yeni tek) kapsayan satır seçilir. Eşitliği
  // bozan aday sırası birkaç kez değiştirilir (düz, ters, kaydırılmış) ve EN AZ satırlı sonuç alınır (deterministik).
  const toplam = boyutlar.reduce((c, b) => c * b, 1);
  if (toplam <= 20_000) {
    /** @type {number[][]} */
    const tum = [];
    for (let i = 0; i < toplam; i++) {
      const r = [];
      let x = i;
      for (let f = n - 1; f >= 0; f--) { r[f] = x % boyutlar[f]; x = Math.floor(x / boyutlar[f]); }
      if (r.some((v) => v > 0)) tum.push(r);
    }
    const dene = (/** @type {number[][]} */ sira) => {
      const ac = new Set(acik.keys());
      const tk = new Set(tekler);
      /** @type {number[][]} */
      const sonuc = [];
      while (ac.size || tk.size) {
        let en = null;
        let enPuan = 0;
        for (const r of sira) {
          let p = 0;
          for (let i = 0; i < n; i++) {
            if (r[i] > 0 && tk.has(`${i}:${r[i]}`)) p++;
            for (let j = i + 1; j < n; j++) if (r[i] > 0 && r[j] > 0 && ac.has(anahtar(i, r[i], j, r[j]))) p += 2;
          }
          if (p > enPuan) { en = r; enPuan = p; }
        }
        if (!en) break;
        for (let i = 0; i < n; i++) { tk.delete(`${i}:${en[i]}`); for (let j = i + 1; j < n; j++) ac.delete(anahtar(i, en[i], j, en[j])); }
        sonuc.push(en);
      }
      return sonuc;
    };
    const siralar = [tum, [...tum].reverse(), ...[1, 2, 3, 5, 7].map((k) => { const d = Math.floor((tum.length * k) / 8); return [...tum.slice(d), ...tum.slice(0, d)]; })];
    let enIyi = /** @type {number[][] | null} */ (null);
    for (const s of siralar) { const r = dene(s); if (!enIyi || r.length < enIyi.length) enIyi = r; }
    return (enIyi ?? []).slice(0, enCok);
  }
  /** Seviye kullanımı (her alternatif erken denensin: tohum ve eşitlikte en az kullanılan seçilir). */
  const kullanim = boyutlar.map((b) => Array(b).fill(0));
  while ((acik.size || tekler.size) && satirlar.length < enCok) {
    const satir = Array(n).fill(-1);
    if (acik.size) {
      const tohum = [...acik.values()].reduce((en, x) => (kullanim[x[0]][x[1]] + kullanim[x[2]][x[3]] < kullanim[en[0]][en[1]] + kullanim[en[2]][en[3]] ? x : en));
      satir[tohum[0]] = tohum[1];
      satir[tohum[2]] = tohum[3];
    } else {
      const [i, a] = String([...tekler][0]).split(':').map(Number);
      satir[i] = a;
    }
    for (let f = 0; f < n; f++) {
      if (satir[f] >= 0) continue;
      let en = 0;
      let enPuan = 0;
      for (let v = 1; v < boyutlar[f]; v++) {
        let puan = tekler.has(`${f}:${v}`) ? 1 : 0;
        for (let h = 0; h < n; h++) {
          if (h === f || satir[h] < 1) continue;
          if (acik.has(h < f ? anahtar(h, satir[h], f, v) : anahtar(f, v, h, satir[h]))) puan += 2;
        }
        if (puan > enPuan || (puan === enPuan && puan > 0 && kullanim[f][v] < kullanim[f][en])) { en = v; enPuan = puan; }
      }
      satir[f] = en;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) acik.delete(anahtar(i, satir[i], j, satir[j]));
    satir.forEach((v, f) => { kullanim[f][v]++; tekler.delete(`${f}:${v}`); });
    if (satir.some((v) => v > 0)) satirlar.push(satir);
  }
  return satirlar;
}

/**
 * Senaryo önerileri (YZ YOK, kurallı; az ama gerekçeli): [0] kaydedilen (hızlı testte yapılan) senaryo; sonra:
 *  1) Görünürlük dalları: alan kümesini değiştiren seçimler (alanların kosul.secim'i; iç içe olanlar dahil) dal ağacıdır; kök seçimlerin
 *     dal yollarının TÜM birleşimleri (kartezyen; aynı alanları açan değerler tek dal; dal iç içe seçim açıyorsa onun dallarıyla çarpılır).
 *     Dalın açtığı seçim alanı tablonun ilk seçeneğiyle doldurulur; değeri olmayan metin alanı açılıyorsa "veri gerekli" (değer ÜRETİLMEZ).
 *     Sınırı aşarsa kök seçimler üzerinden ikili kapsam (ikiliKapsam).
 *  2) Görünürlüğü değiştirmeyen seçimler: temel yolda her değeriyle birer kez (her değer; ilk, son, aradan en çok üç). Toplam sınırı aşarsa
 *     gerektiği kadarı dal önerilerine katılır.
 *  3) Bağlı liste zinciri: kökü (en üst halkası) farklı her gözlenen tam satır (aynı kökten ikinci satır yok); tek başına öneri olmaz, en
 *     zengin önerilere katılır (görünürlüğü değiştirmeyen seçimler de ilk alternatifleriyle). Başka değişken yoksa tek başına.
 *  Başlık seçimin tüm kontrol değerlerini ve adresi söyler; gerekçe ne kapsandığını ("görünürlük dalları: tüm birleşimler", "“X”: her
 *  değer", "adres: farklı il"). Aynı değişikliği yapan öneriler ayıklanır; toplam en çok enCok (Ayarlar).
 * Değer ÜRETİLMEZ: adaylar yalnız sayfadan okunan seçenekler ve gözlenen zincir satırlarıdır. s.alanlar verilmezse yalnız değeri seçilmiş
 * liste tabloları değişken sayılır.
 * @param {KayitPlani} plan @param {string} baslik
 * @param {{ enCok?: number; alanlar?: Nesne[]; iliskiler?: ReadonlyArray<{ ust: string; alt: string }>;
 *   gozlemler?: ReadonlyArray<{ anahtar: string; secimler: Record<string, string>; secenekler: ReadonlyArray<{ deger: string; metin?: string | null }> }>;
 *   degerler?: Record<string, unknown> }} [s]
 * @returns {import('./kayit-plani.d.mts').SenaryoOnerisi[]}
 */
export function senaryoOnerileri(plan, baslik, s = {}) {
  const enCok = Number.isInteger(s.enCok) && Number(s.enCok) > 0 ? Number(s.enCok) : VARSAYILAN_ONERI_SAYISI;
  /** @type {import('./kayit-plani.d.mts').SenaryoOnerisi[]} */
  const liste = [{ indeks: 0, baslik, gerekce: 'Hızlı testte yaptığınız ve kaydettiğiniz akış', varsayilanSecili: true, alt: null, veriGerekli: [], eksikAlanlar: [] }];
  const alanlar = s.alanlar ?? [];
  /** Aynı alan + ad bir kez. @param {Array<{ anahtar: string; etiket: string }>} l */
  const tekEksik = (l) => [...new Map(l.map((x) => [`${x.anahtar}\u0001${x.etiket}`, x])).values()];
  const alan = (/** @type {string} */ k) => alanlar.find((a) => a.anahtar === k);
  /** @typedef {{ planAdi: string; sutun: string; deger: string; etiket: string; oturumAnahtar: string }} Degisiklik */
  /** Oturum alanı → tek alanlı liste tablosu + sütun (değişiklik o tablonun satırı seçilerek yapılır). */
  /** @type {Map<string, { t: PlanTablosu; sutun: string; etiket: string }>} */
  const yer = new Map();
  for (const t of plan.tablolar) {
    if (t.tur !== 'liste' || t.zincir) continue;
    for (const a of t.alanlar) if (!t.sutunlar.find((c) => c.ad === a.sutun)?.gizli) yer.set(a.oturumAnahtar, { t, sutun: a.sutun, etiket: a.etiket });
  }
  const tablodakiler = (/** @type {string} */ k) => { const y = yer.get(k); return y ? y.t.satirlar.map((r) => String(r[y.sutun] ?? '')).filter(Boolean) : []; };
  const etiketi = (/** @type {string} */ k) => yer.get(k)?.etiket ?? String(alan(k)?.etiket ?? k);
  const kodu = (/** @type {string} */ k, /** @type {string} */ m) => {
    const y = yer.get(k);
    const a = alan(k);
    return y?.t.sutunlar.find((c) => c.ad === y.sutun)?.karsiliklar[m]?.sayfa ?? (a ? tumSecenekler(a).find((x) => x.metin === m)?.kod : undefined) ?? m;
  };
  /** Şimdiki değerin görünen metni (tablodaki seçili satır; yoksa sayfada hazır gelen). */
  const simdiki = (/** @type {string} */ k) => { const y = yer.get(k); return y?.t.secilen?.[y.sutun] ?? (alan(k)?.mevcut ? String(alan(k)?.mevcut) : null); };
  /** Şimdiki değerin sayfa değeri (kodu); yoksa null. */
  const simdikiKod = (/** @type {string} */ k) => {
    const m = simdiki(k);
    if (m !== null) return kodu(k, m);
    const v = s.degerler?.[k];
    return v === undefined || v === null || v === '' ? null : String(v);
  };
  // (Kaydedilen dalda sayfanın doldurduğu — düzenlenemeyen — alanın sayfadaki değeri o dalındır: başka dalda "dolu" sayılmaz.)
  const doluMu = (/** @type {Nesne} */ x) => !x.kilitli && (Boolean(x.hazir) || !bosMu(s.degerler?.[x.anahtar]));
  const degisiklik = (/** @type {string} */ k, /** @type {string} */ m) => {
    const y = /** @type {NonNullable<ReturnType<typeof yer.get>>} */ (yer.get(k));
    return { planAdi: y.t.ad, sutun: y.sutun, deger: m, etiket: y.etiket, oturumAnahtar: k };
  };

  /** @typedef {{ k: string; m: string; kod: string }} DalAdimi */
  /** @typedef {{ anahtar: string; etiket: string }} Eksik */
  /** @typedef {{ adimlar: DalAdimi[]; d: Degisiklik[]; veriGerekli: string[]; eksik: Eksik[]; kaldir: string[] }} DalYolu */
  // 1) Görünürlük dalları: alan kümesini değiştiren seçimler (kontroller; iç içe olanlar dahil) dal ağacı olur, tüm yolların kartezyeni.
  // Alanın ETİKETİNİ değiştiren seçim (etiketKosulu: aynı alan bir değerde kimlik no, diğerinde vergi no sorar) de dal açar: alan kümesi
  // aynı olsa da girilecek verinin anlamı değişir. Alanın DÜZENLENEBİLİRLİĞİNİ değiştiren seçim (kilitKosulu: bir değerde sayfa alanı
  // kendisi doldurur) de dal açar: o dalda alan yazılmaz, diğerinde veri ister.
  const kontroller = [...new Set(alanlar.flatMap((x) => [x.kosul?.secim && Array.isArray(x.kosul.degerler) ? String(x.kosul.secim) : '',
    x.etiketKosulu?.secim ? String(x.etiketKosulu.secim) : '', x.kilitKosulu?.secim ? String(x.kilitKosulu.secim) : '']).filter(Boolean))].filter((k) => yer.has(k));
  const bagimlilari = (/** @type {string} */ k) => alanlar.filter((x) => x.kosul?.secim === k && Array.isArray(x.kosul.degerler));
  const acilanlar = (/** @type {string} */ k, /** @type {string} */ kod) => bagimlilari(k).filter((x) => x.kosul.degerler.map(String).includes(kod));
  /** Alanın seçimin kod değerindeki etiketi (etiketKosulu; bilinmiyorsa ilk görülen). @param {Nesne} x @param {string} kod */
  const kodEtiketi = (x, kod) => String(x.etiketKosulu?.etiketler?.[kod] ?? x.etiketKosulu?.varsayilan ?? x.etiket ?? x.anahtar);
  /** Seçimin kod değerinde etiketi senaryodakinden FARKLI olan alanlar (o değerde görünenler). @param {string} k @param {string} kod */
  const adiDegisenler = (k, kod) => alanlar.filter((x) => x.etiketKosulu?.secim === k && (x.kosul?.secim !== k || x.kosul.degerler.map(String).includes(kod))
    && kodEtiketi(x, kod) !== String(x.etiket ?? x.anahtar));
  /** Seçimin kod değerinde görünen ve düzenlenebilirliği bu seçime bağlı alanlar; kilitli: o değerde düzenlenemez mi. @param {string} k @param {string} kod @param {boolean} kilitli */
  const kilitDegisenler = (k, kod, kilitli) => alanlar.filter((x) => x.kilitKosulu?.secim === k && (x.kosul?.secim !== k || x.kosul.degerler.map(String).includes(kod))
    && (x.kilitKosulu.kilitli?.[kod] === true) === kilitli && (kilitli || x.kilitKosulu.kilitli?.[kod] === false));
  /**
   * Bir seçimin dal yolları: aynı alanları açan değerler tek dal (tablodaki ilk değer); dal iç içe seçim açıyorsa onun yollarıyla çarpılır.
   * @param {string} k @param {Set<string>} gorulen @returns {DalYolu[]}
   */
  const dalYollari = (k, gorulen = new Set()) => {
    if (gorulen.has(k)) return [];
    const yeni = new Set([...gorulen, k]);
    /** @type {Map<string, { m: string; kod: string }>} */
    const dallar = new Map();
    for (const m of tablodakiler(k)) {
      const kod = kodu(k, m);
      // (Aynı alanları açıp farklı adlar soran değerler ayrı dallardır.)
      const adlar = adiDegisenler(k, kod).map((x) => `${x.anahtar}=${kodEtiketi(x, kod)}`).sort().join('|');
      // (Farklı alanları kilitleyen değerler de ayrı dallardır.)
      const kilitler = kilitDegisenler(k, kod, true).map((x) => x.anahtar).sort().join('|');
      const anahtar = `${acilanlar(k, kod).map((x) => x.anahtar).sort().join('|')}#${adlar}#${kilitler}`;
      // Şimdiki değer kendi dalının temsilcisidir (kaydedilen yol tanınsın).
      if (!dallar.has(anahtar) || kod === simdikiKod(k)) dallar.set(anahtar, { m, kod });
    }
    /** @type {DalYolu[]} */
    const yollar = [];
    for (const { m, kod } of dallar.values()) {
      const ac = acilanlar(k, kod);
      const ic = ac.filter((x) => kontroller.includes(String(x.anahtar)));
      /** @type {Degisiklik[]} */
      const d = [degisiklik(k, m)];
      /** @type {string[]} */
      const veriGerekli = [];
      /** @type {Eksik[]} */
      const eksik = [];
      for (const x of ac) {
        if (ic.includes(x) || doluMu(x) || String(x.tur) === 'checkbox') continue;
        if (SECIM_TURLERI.includes(String(x.tur))) {
          const l = tablodakiler(x.anahtar);
          if (l.length) { d.push(degisiklik(x.anahtar, l[0])); continue; }
        }
        veriGerekli.push(String(x.etiket ?? x.anahtar));
        eksik.push({ anahtar: String(x.anahtar), etiket: String(x.etiket ?? x.anahtar) });
      }
      // Etiketi bu değerde değişen alan: senaryodaki değeri başka anlamın verisidir (kimlik no ≠ vergi no); değer ÜRETİLMEZ, veri gerekli.
      // Dal başlığı o değerde sorulan adları söyler ("Kişi tipi: Tüzel (Vergi no, İş telefonu)").
      const yeniAdlar = adiDegisenler(k, kod);
      for (const x of yeniAdlar) {
        if (ac.includes(x) || String(x.tur) === 'checkbox' || SECIM_TURLERI.includes(String(x.tur))) continue;
        veriGerekli.push(kodEtiketi(x, kod));
        eksik.push({ anahtar: String(x.anahtar), etiket: kodEtiketi(x, kod) });
      }
      // Bu değerde düzenlenemeyen (sayfanın doldurduğu) alan: senaryodaki değeri yazılmaz (kaldir), veri istenmez. Bu değerde düzenlenebilir
      // olup değeri olmayan (kaydedilen dalda sayfa dolduruyordu) alan: değer ÜRETİLMEZ, veri gerekli.
      const kilitlenen = kilitDegisenler(k, kod, true);
      const kaldir = kilitlenen.filter((x) => !bosMu(s.degerler?.[x.anahtar])).map((x) => String(x.anahtar));
      for (const x of kilitDegisenler(k, kod, false)) {
        if (ac.includes(x) || ic.includes(x) || doluMu(x) || String(x.tur) === 'checkbox' || eksik.some((y) => y.anahtar === String(x.anahtar))) continue;
        if (SECIM_TURLERI.includes(String(x.tur))) {
          const l = tablodakiler(x.anahtar);
          if (l.length) { d.push(degisiklik(x.anahtar, l[0])); continue; }
        }
        veriGerekli.push(kodEtiketi(x, kod));
        eksik.push({ anahtar: String(x.anahtar), etiket: kodEtiketi(x, kod) });
      }
      const ekler = [yeniAdlar.length ? yeniAdlar.map((x) => kodEtiketi(x, kod)).join(', ') : '',
        kilitlenen.length ? `${kilitlenen.map((x) => kodEtiketi(x, kod)).join(', ')} sayfa dolduruyor` : ''].filter(Boolean);
      const baslikMetni = ekler.length ? `${m} (${ekler.join('; ')})` : m;
      /** @type {DalYolu[]} */
      let alt = [{ adimlar: [{ k, m: baslikMetni, kod }], d, veriGerekli, eksik, kaldir }];
      for (const n of ic) {
        const nl = dalYollari(String(n.anahtar), yeni);
        if (!nl.length) continue;
        alt = alt.flatMap((y) => nl.map((z) => ({ adimlar: [...y.adimlar, ...z.adimlar], d: [...y.d, ...z.d], veriGerekli: [...y.veriGerekli, ...z.veriGerekli], eksik: [...y.eksik, ...z.eksik], kaldir: [...y.kaldir, ...z.kaldir] })));
      }
      yollar.push(...alt);
    }
    return yollar;
  };
  const kokler = kontroller.filter((k) => { const a = alan(k); return !a?.kosul?.secim || !kontroller.includes(String(a.kosul.secim)); });
  const kokYollari = kokler.map((k) => dalYollari(k)).filter((l) => l.length);
  /** Kaydedilen yol mu (her adım şimdiki değerinde)? @param {DalYolu} y */
  const kaydedilenMi = (y) => y.adimlar.every((a) => a.kod === simdikiKod(a.k));
  /** @param {DalYolu[]} l @returns {DalYolu} */
  const birlestir = (l) => ({
    adimlar: l.flatMap((y) => y.adimlar), d: l.flatMap((y) => y.d), veriGerekli: [...new Set(l.flatMap((y) => y.veriGerekli))], eksik: tekEksik(l.flatMap((y) => y.eksik)),
    kaldir: [...new Set(l.flatMap((y) => y.kaldir))]
  });
  /** @type {DalYolu[]} */
  let tumYollar = kokYollari.reduce((/** @type {DalYolu[][]} */ c, l) => c.flatMap((x) => l.map((y) => [...x, y])), [[]]).map(birlestir);
  if (!kokYollari.length) tumYollar = [];
  let dalKapsami = 'tüm birleşimler';
  let yollar = tumYollar.filter((y) => !kaydedilenMi(y));
  // 2) Görünürlüğü değiştirmeyen seçimler: temel yolda her değeriyle birer kez (each-choice).
  /** @type {Array<{ k: string; ad: string; m: string; d: Degisiklik[] }>} */
  const herDeger = [];
  for (const [k, y] of yer) {
    if (kontroller.includes(k)) continue;
    const a = alan(k);
    if (a && !SECIM_TURLERI.includes(String(a.tur))) continue;
    if (!a && !y.t.secilen) continue;
    // Koşullu alan yalnız şimdiki dalda görünüyorsa.
    if (a?.kosul?.secim) { const kk = simdikiKod(String(a.kosul.secim)); if (kk === null || !(a.kosul.degerler ?? []).map(String).includes(kk)) continue; }
    const su = simdiki(k);
    const digerleri = tablodakiler(k).filter((m) => m !== su && kodu(k, m) !== su);
    for (const x of ornekDegerler(digerleri.map((m) => ({ deger: m, metin: m })), 3)) herDeger.push({ k, ad: etiketi(k), m: x.metin, d: [degisiklik(k, x.metin)] });
  }
  // Bütçe: dal yolları + her değer önerileri sınırı aşarsa önce her değer dallara katılır; yine aşarsa dallara ikili kapsam uygulanır.
  let katilan = false;
  if (yollar.length + herDeger.length > enCok && yollar.length) katilan = true;
  if (yollar.length > enCok && kokYollari.length > 1) {
    const satirlar = ikiliKapsam(kokYollari.map((l) => l.length), enCok * 3);
    yollar = satirlar.map((r) => birlestir(r.map((v, i) => kokYollari[i][v]))).filter((y) => !kaydedilenMi(y));
    dalKapsami = 'ikili kapsam';
  }
  yollar = yollar.slice(0, enCok);
  /** @typedef {{ degisiklikler: Degisiklik[]; parcalar: string[]; gerekce: string[]; veriGerekli: string[]; eksik: Eksik[]; zenginlik: number; kaldir?: string[] }} Aday */
  /** @param {DalYolu} y @returns {Aday} */
  const dalAdayi = (y) => ({
    // Şimdiki değerindeki seçim değişiklik sayılmaz; kaydedilen dalda görünmeyen (dalDisi) seçimin değeri ise senaryoda yoktur: açıkça yazılır.
    degisiklikler: y.d.filter((x) => !(kontroller.includes(x.oturumAnahtar) && !alan(x.oturumAnahtar)?.dalDisi && kodu(x.oturumAnahtar, x.deger) === simdikiKod(x.oturumAnahtar))),
    parcalar: y.adimlar.map((a) => `${etiketi(a.k)}: ${a.m}`), gerekce: [`görünürlük dalları: ${dalKapsami}`], veriGerekli: y.veriGerekli, eksik: tekEksik(y.eksik), zenginlik: y.d.length, kaldir: y.kaldir
  });
  /** @type {Aday[]} */
  const adaylar = yollar.map(dalAdayi);
  // Temel yolun başlık parçaları (kontrollerin şimdiki değerleri).
  const temelParcalar = kokler.flatMap((k) => { const m = simdiki(k); return m ? [`${etiketi(k)}: ${m}`] : []; });
  /** Ayrı öneri olarak kalan her değer seçimleri. */
  let kalanHerDeger = herDeger;
  if (katilan) {
    // Sınır aşılıyor: gerektiği kadar her değer seçimi, o seçimi henüz değiştirmeyen dal önerilerine sırayla katılır (ayrı öneri olmaz).
    kalanHerDeger = [];
    let j = 0;
    herDeger.forEach((x, i) => {
      if (adaylar.length + (herDeger.length - i) + kalanHerDeger.length <= enCok) { kalanHerDeger.push(x); return; }
      const uygun = adaylar.filter((a) => !a.degisiklikler.some((d) => d.oturumAnahtar === x.k));
      if (!uygun.length) { kalanHerDeger.push(x); return; }
      const a = uygun[j++ % uygun.length];
      a.degisiklikler.push(...x.d);
      a.parcalar.push(`${x.ad}: ${x.m}`);
      a.gerekce.push(`“${x.ad}”: her değer`);
      a.zenginlik++;
    });
  }
  for (const x of kalanHerDeger) adaylar.push({ degisiklikler: [...x.d], parcalar: [...temelParcalar, `${x.ad}: ${x.m}`], gerekce: [`“${x.ad}”: her değer`], veriGerekli: [], eksik: [], zenginlik: 1 });
  // 3) Bağlı liste zinciri: kökü (en üst halkası) farklı her gözlenen satır (aynı kökten ikinci satır yok); zincir satırı tek başına öneri
  //    olmaz, zengin bir öneriye katılır (en çok değişiklik yapan önce; her öneriye en çok bir adres).
  /** @type {Array<{ d: Degisiklik[]; kokEtiket: string; metin: string }>} */
  const adresler = [];
  for (const t of plan.tablolar) {
    if (!t.zincir || !t.secilen || !t.alanlar.length) continue;
    const secilen = t.secilen;
    const dolu = Object.keys(secilen);
    const tam = t.satirlar.filter((r) => dolu.every((c) => !bosMu(r[c])) && !dolu.every((c) => r[c] === secilen[c]));
    const kok = t.alanlar[0].sutun;
    const kokler2 = [...new Set(tam.map((r) => String(r[kok])))].filter((v) => v !== secilen[kok]);
    for (const v of kokler2) {
      const l = tam.filter((r) => r[kok] === v);
      const r = l[Math.floor(l.length / 2)];
      const d = t.alanlar.filter((a) => !bosMu(r[a.sutun])).map((a) => ({ planAdi: t.ad, sutun: a.sutun, deger: String(r[a.sutun]), etiket: a.etiket, oturumAnahtar: a.oturumAnahtar }));
      adresler.push({ d, kokEtiket: t.alanlar[0].etiket, metin: `${t.alanlar[0].etiket}: ${d.map((x) => x.deger).join(' / ')}` });
    }
  }
  const hedefler = [...adaylar].sort((x, y) => y.zenginlik - x.zenginlik);
  adresler.slice(0, hedefler.length).forEach((z, i) => {
    const a = hedefler[i];
    // Zengin profil: görünürlüğü değiştirmeyen seçimler de (henüz değişmediyse) ilk alternatifleriyle.
    for (const x of herDeger) {
      if (a.degisiklikler.some((d) => d.oturumAnahtar === x.k)) continue;
      a.degisiklikler.push(...x.d);
      a.parcalar.push(`${x.ad}: ${x.m}`);
      a.gerekce.push(`“${x.ad}”: her değer`);
    }
    a.degisiklikler.push(...z.d);
    a.parcalar.push(z.metin);
    a.gerekce.push(`adres: farklı ${z.kokEtiket.toLocaleLowerCase('tr')}`);
  });
  // Başka değişken yoksa adres tek başına (tek seçenek bu).
  if (!adaylar.length) for (const z of adresler.slice(0, enCok)) adaylar.push({ degisiklikler: [...z.d], parcalar: [...temelParcalar, z.metin], gerekce: [`adres: farklı ${z.kokEtiket.toLocaleLowerCase('tr')}`], veriGerekli: [], eksik: [], zenginlik: 1 });
  // Ayıklama (aynı değişiklik kümesi) ve sınır.
  const gorulen = new Set();
  for (const x of adaylar) {
    if (liste.length > enCok) break;
    const imza = `${x.degisiklikler.map((d) => `${d.planAdi}|${d.sutun}=${d.deger}`).sort().join('\u0001')}#${[...(x.kaldir ?? [])].sort().join('|')}`;
    if (!x.degisiklikler.length || gorulen.has(imza)) continue;
    gorulen.add(imza);
    const gerekce = [...new Set(x.gerekce), ...(x.veriGerekli.length ? [`veri gerekli: ${x.veriGerekli.join(', ')}; seçilirse “veri bekliyor” olarak koşu dışı kaydedilir, değerleri test verisinde doldurursunuz`] : []), 'diğer değerler aynı'];
    liste.push({
      indeks: liste.length, baslik: `${baslik} — ${x.parcalar.join(' · ')}`.slice(0, 300), gerekce: gerekce.join('; ').slice(0, 600),
      varsayilanSecili: false, alt: { degisiklikler: x.degisiklikler, ...(x.kaldir?.length ? { kaldirilanlar: x.kaldir } : {}) }, veriGerekli: x.veriGerekli, eksikAlanlar: x.eksik
    });
  }
  return liste;
}
