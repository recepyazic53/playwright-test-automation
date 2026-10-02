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
import { GENEL_SUTUNLAR, baslikNormal, benzerTablolar } from '../tablolar/tablo-benzerligi.mjs';
import { birlestirmePlani } from '../tablolar/paket-test-verisi.mjs';
import { ayniKavramMi, benzerAdMi, kisiAdKavrami, kokEslesirMi } from '../tablolar/doldur-onerisi.mjs';
import { degerBasvurusuYaz, grupAnahtari, satirSabitlemesi } from '../tablolar/tablo-secimi.mjs';
import { adTemizle, tabloTaslagiKur, tumSecenekler } from './test-verisi-tablosu.mjs';
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

/**
 * Plan tablosunun sütunlarını karşılayan MEVCUT tablolar ("Mevcut tabloya bağla" adayları). Yeni tablo önermeden önce TÜM tabloların
 * sütunları planın sütun adı ve bağlı alanların etiketiyle eşlenir (adEslesmesi; önce birebir, sonra benzer; her mevcut sütun bir kez).
 * Tablo ADI eşleşme sayılmaz (aynı adlı tablo "birleştir" akışındadır; burada atlanır).
 *  - Tek sütunlu planda sütun eşleşmeli; çok sütunlu planda (kişi / kart / zincir) en az iki sütun ve sütunların çoğu.
 *  - Gizli plan sütunu açık sütuna bağlanmaz; liste (seçim) tablosu gizli sütuna bağlanmaz.
 *  - kesin: tüm sütunlar birebir eşleşti (tek sütunlu liste tablosunda ayrıca planın değerlerinin en az yarısı mevcut sütunda var) →
 *    varsayılan seçili.
 *  - mevcutSatir: kayıt tablosunda senaryonun değerleri (tüm sütunlar eşlenmişse) birebir aynı olan satır (gizli değer çözülmüş
 *    listede karşılaştırılır; çözülmemişse eşleşmez) — senaryo o satıra sabitlenir; yoksa yeni satır eklenir.
 * Sıra: kesin önce, sonra karşılanan sütun oranı, birebir sayısı, satır sayısı.
 * @param {PlanTablosu} t
 * @param {ReadonlyArray<{ id: string; ad: string; baglam?: boolean; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: ReadonlyArray<{ id?: string; ad?: string; degerler: Record<string, unknown> }> }>} mevcutlar
 * @returns {SutunAdayi[]}
 */
export function mevcutSutunAdaylari(t, mevcutlar) {
  const adlari = (/** @type {string} */ sutun) => [...new Set([sutun, ...t.alanlar.filter((a) => a.sutun === sutun).map((a) => a.etiket)].filter(Boolean))];
  /** @type {Array<SutunAdayi & { _oran: number; _birebir: number }>} */
  const sonuc = [];
  for (const m of mevcutlar) {
    if (m.baglam || String(m.id).startsWith('baglam_') || kucuk(m.ad) === kucuk(t.ad) || !m.sutunlar.length) continue;
    const kullanilan = new Set();
    /** @type {SutunAdayi['eslesme']} */
    const eslesme = [];
    for (const tur of /** @type {const} */ (['birebir', 'benzer'])) {
      for (const s of t.sutunlar) {
        if (eslesme.some((e) => e.plan === s.ad)) continue;
        const c = m.sutunlar.find((x) => !kullanilan.has(x.ad) && !(s.gizli && !x.gizli) && !(t.tur === 'liste' && x.gizli)
          && adlari(s.ad).some((ad) => adEslesmesi(ad, x.ad) === tur));
        if (c) { kullanilan.add(c.ad); eslesme.push({ plan: s.ad, hedef: c.ad, tur }); }
      }
    }
    const n = t.sutunlar.length;
    const k = eslesme.length;
    if (!k || (n === 1 ? k !== 1 : k < 2 || k * 2 <= n)) continue;
    const hedef = new Map(eslesme.map((e) => [e.plan, e.hedef]));
    const yeniSutunlar = t.sutunlar.filter((s) => !hedef.has(s.ad)).map((s) => s.ad);
    let eklenecekSatir = 0;
    /** @type {{ id: string; ad: string } | null} */
    let mevcutSatir = null;
    let ortusme = 0;
    if (t.tur === 'liste') {
      const imza = (/** @type {(ad: string) => unknown} */ oku) => JSON.stringify(eslesme.map((e) => kucuk(oku(e.plan))));
      const var_ = new Set(m.satirlar.map((r) => imza((ad) => r.degerler[/** @type {string} */ (hedef.get(ad))])));
      eklenecekSatir = t.satirlar.filter((d) => !var_.has(imza((ad) => d[ad]))).length;
      ortusme = t.satirlar.length ? (t.satirlar.length - eklenecekSatir) / t.satirlar.length : 0;
    } else {
      const d = t.satirlar[0] ?? {};
      const dolu = eslesme.filter((e) => !bosMu(d[e.plan]));
      const r = !yeniSutunlar.length && dolu.length ? m.satirlar.find((x) => dolu.every((e) => !bosMu(x.degerler[e.hedef]) && ayniDeger(x.degerler[e.hedef], d[e.plan]))) : undefined;
      mevcutSatir = r?.id ? { id: String(r.id), ad: String(r.ad ?? '') } : null;
      eklenecekSatir = mevcutSatir ? 0 : t.satirlar.length;
    }
    const birebir = eslesme.filter((e) => e.tur === 'birebir').length;
    // Tek sütunlu listede ad tek başına az ayırt edici ("Durum"): değerlerin yarısı da ortak olmalı; çok sütunluda (zincir) tüm sütunların
    // birebir eşleşmesi yeter (gözlenen yeni kombinasyonlar o tabloya yeni satır olarak eklenir).
    const kesin = k === n && birebir === n && (t.tur !== 'liste' || n >= 2 || ortusme >= 0.5);
    sonuc.push({ id: m.id, ad: m.ad, eslesme, yeniSutunlar, kesin, satirSayisi: m.satirlar.length, eklenecekSatir, mevcutSatir, _oran: k / n, _birebir: birebir });
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
 *   iliskiler?: ReadonlyArray<{ ust: string; alt: string }>; gozlemler?: ReadonlyArray<{ anahtar: string; secimler?: Record<string, unknown>; secenekler?: ReadonlyArray<{ deger: unknown; metin?: unknown }> }> }} g
 * @returns {KayitPlani}
 */
export function planKur(g) {
  const kullanilanAdlar = new Set();
  // Önce zincirler (kendi tabloları); zincirdeki alanlar tek alan tablolarına girmez.
  const zincir = zincirTablolari(g, new Set());
  // Görünürlüğü belirleyen seçim (başka alanların kosul.secim'i) kullanıcı değiştirmediyse sayfadaki değeriyle senaryonun değeri olur:
  // senaryo dalı açıkça kaydedilir ve alan liste tablosuna o satırla bağlanır (değer üretilmez: sayfada seçili gelen seçenek).
  const kontroller = new Set(g.alanlar.map((a) => a.kosul?.secim).filter(Boolean).map(String));
  /** @type {Record<string, { deger: unknown; kaynak?: string }>} */
  const degerler = { ...g.degerler };
  for (const a of g.alanlar) {
    const k = String(a.anahtar);
    if (!kontroller.has(k) || !SECIM_TURLERI.includes(String(a.tur)) || degerler[k] !== undefined) continue;
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
  // Kullanıcının değer yazmadığı seçim alanları da analiz edilip kendi liste tablosuna alınır (tüm seçenekler; sayfada hazır gelenler dahil).
  let ek = 0;
  for (const a of g.alanlar) {
    if (ek >= EN_COK_LISTE_TABLOSU) break;
    if (kullanilanAlanlar.has(a.anahtar) || !SECIM_TURLERI.includes(String(a.tur)) || a.devreDisi || a.saltOkunur) continue;
    /** @type {Map<string, { metin: string; kod: string }>} */
    const secenekler = new Map(tumSecenekler(a).map((x) => [kucuk(x.metin), x]));
    const etiket = String(a.etiket ?? '');
    const ad = adTemizle(etiket);
    if (secenekler.size < 2 || secenekler.size > EN_COK_SECENEK || !ad || kullanilanAdlar.has(kucuk(ad)) || gizliAdMi(ad, g.ekGizliAdlar ?? [])) continue;
    tablolar.push({
      ad, tur: 'liste', sutunlar: [{ ad, gizli: false, karsiliklar: Object.fromEntries([...secenekler.values()].filter((s) => s.metin !== s.kod).map((s) => [s.metin, { sayfa: s.kod }])) }],
      satirlar: [...secenekler.values()].map((s) => ({ [ad]: s.metin })), secilen: null,
      alanlar: [{ oturumAnahtar: a.anahtar, sutun: ad, etiket, degerli: false }]
    });
    kullanilanAdlar.add(kucuk(ad));
    ek++;
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
  return {
    kaynak: 'hizli',
    tablolar: plan.tablolar.map((t) => {
      const m = mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
      const p = m ? birlestirmePlani(m, t) : null;
      const bagla = m ? [] : mevcutSutunAdaylari(t, mevcutlar).slice(0, EN_COK_BAGLA_ADAYI);
      return {
        ad: t.ad, tur: t.tur, aciklama: null, zincir: t.zincir ?? null,
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
    baglantilar: plan.tablolar.flatMap((t) => t.alanlar.filter((a) => anahtarlar[a.oturumAnahtar] && !(t.sutunlar.find((s) => s.ad === a.sutun)?.gizli && t.tur === 'liste')).map((a) => {
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
 * Seçimle yazar (TEK işlemde: bir tablo yazılamazsa hiçbiri yazılmaz). 'atla' tablo yazılmaz (alanlar senaryoda düz değerle kalır).
 * Birleştirmede / bağlamada mevcut satır / sütunlar değişmez: eksik sütunlar, olmayan satırlar ve eksik karşılıklar eklenir.
 *  - 'bagla' (hedefId): plan sütunları mevcut tablonun EŞLEŞEN sütunlarına yazılır (mevcutSutunAdaylari ile yeniden hesaplanır). Kayıt
 *    tablosunda değer o tabloda zaten varsa senaryo o satıra satır kimliğiyle sabitlenir; yoksa yeni satır eklenir (adı: seçilen değerlerden
 *    satır adlarıyla aynı türde olan — ör. il —, yoksa senaryo adı). Liste / zincir tablosunda olmayan satırlar (kombinasyonlar) eklenir.
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
    const sec = secim.tablolar?.[t.ad] ?? { islem: 'atla' };
    if (sec.islem === 'atla') continue;
    const mevcutlar = tablolariListele(vt, projeId, sec.islem === 'bagla' ? { cozulsun: true } : {});
    const kaynak = { tur: 'kayit', olusturan: 'Nöbetçi hızlı test', ekran: bilgi.ekranAdi.slice(0, 120), yazilma: new Date().toISOString() };
    const kayitSatiri = (/** @type {Set<string>} */ kullanilan, /** @type {Record<string, string | null>} */ d, /** @type {string} */ temel = plan.satirAdi) => {
      let ad = temel;
      for (let i = 2; kullanilan.has(kucuk(ad)); i++) ad = `${temel.slice(0, 55)} ${i}`;
      kullanilan.add(kucuk(ad));
      return { ad, ortamId: null, degerler: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) };
    };
    if (sec.islem === 'yeni' || sec.islem === 'yeniAd') {
      const ad = sec.islem === 'yeniAd' ? String(sec.yeniAd ?? '').trim() : t.ad;
      if (!ad) throw new Error(`"${t.ad}" tablosu için yeni ad yazın.`);
      if (mevcutlar.some((x) => kucuk(x.ad) === kucuk(ad))) throw new Error(`"${ad}" adında bir tablo zaten var: birleştir, yeni ad ya da atla seçin.`);
      const kullanilan = new Set();
      const kayitSatirlari = t.tur === 'liste' ? [] : t.satirlar.map((d) => kayitSatiri(kullanilan, d));
      const id = tabloKaydet(vt, {
        projeId, ad, tur: t.tur, kaynak,
        sutunlar: t.sutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) })),
        satirlar: t.tur === 'liste' ? t.satirlar.map((d) => ({ ad: listeSatirAdi(d), ortamId: null, degerler: d })) : kayitSatirlari
      });
      sonuc.push({
        planAdi: t.ad, ad, id, islem: sec.islem, eklenenSatir: t.satirlar.length, eklenenSutun: t.sutunlar.length, hedef: (s) => s, pin: t.secilen,
        satirId: kayitSatirlari.length ? satirKimligi(vt, projeId, id, kayitSatirlari[0].ad) : zincirSatiri(vt, projeId, id, t, (s) => s), tur: t.tur, plan: t
      });
      continue;
    }
    /** @type {{ eslesme: Map<string, string>; yeniSutunlar: PlanTablosu['sutunlar']; eklenecek: Array<Record<string, string | null>> }} */
    let p;
    /** @type {(typeof mevcutlar)[number] | undefined} */
    let mevcut;
    /** @type {string | null} */
    let hazirSatir = null;
    if (sec.islem === 'bagla') {
      const aday = mevcutSutunAdaylari(t, mevcutlar).find((x) => x.id === sec.hedefId);
      mevcut = mevcutlar.find((x) => x.id === sec.hedefId);
      if (!aday || !mevcut) throw new Error(`"${t.ad}" için seçilen mevcut tablo artık uygun değil: özeti yenileyip yeniden seçin.`);
      const eslesme = new Map(aday.eslesme.map((e) => [e.plan, e.hedef]));
      const imza = (/** @type {(ad: string) => unknown} */ oku) => JSON.stringify(t.sutunlar.map((s) => (eslesme.has(s.ad) ? kucuk(oku(s.ad)) : null)));
      const m = /** @type {NonNullable<typeof mevcut>} */ (mevcut);
      const var_ = new Set(m.satirlar.map((r) => imza((ad) => r.degerler[/** @type {string} */ (eslesme.get(ad))])));
      hazirSatir = aday.mevcutSatir?.id ?? null;
      p = {
        eslesme, yeniSutunlar: t.sutunlar.filter((s) => !eslesme.has(s.ad)),
        eklenecek: t.tur === 'liste' ? t.satirlar.filter((d) => !var_.has(imza((ad) => d[ad]))) : hazirSatir ? [] : [...t.satirlar]
      };
    } else {
      mevcut = sec.islem === 'birlestir' && sec.hedefId ? mevcutlar.find((x) => x.id === sec.hedefId) : mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
      if (!mevcut) throw new Error(`"${t.ad}" adında birleştirilecek tablo yok.`);
      p = birlestirmePlani(mevcut, t);
    }
    const m = /** @type {NonNullable<typeof mevcut>} */ (mevcut);
    const paketSutunu = (/** @type {string} */ mevcutAd) => t.sutunlar.find((x) => p.eslesme.get(x.ad) === mevcutAd);
    // Yeni sütun adı mevcut bir sütunla çakışırsa numaralanır.
    const adlar = new Set(m.sutunlar.map((x) => kucuk(x.ad)));
    /** @type {Map<string, string>} */
    const yeniAd = new Map();
    for (const x of p.yeniSutunlar) {
      let ad = x.ad;
      for (let i = 2; adlar.has(kucuk(ad)); i++) ad = `${x.ad.slice(0, 55)} ${i}`;
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
    // Bağlamada yeni kayıt satırının adı: seçilen değerlerden mevcut satır adlarıyla aynı türde olan (ör. satırlar il adlarıysa seçilen il).
    const baglamAdi = sec.islem === 'bagla' && t.tur !== 'liste'
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
      planAdi: t.ad, ad: m.ad, id, islem: sec.islem === 'bagla' ? 'bagla' : 'birlestir', eklenenSatir: p.eklenecek.length, eklenenSutun: p.yeniSutunlar.length, hedef,
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

// ---------------------------------------------------------------------------------------
// Senaryo önerileri
// ---------------------------------------------------------------------------------------

/**
 * İkili (pairwise) kapsam: her faktörün seviye sayısı (0 = şimdiki değer) → az sayıda satır (seviye indeksleri); her iki faktörün her
 * seviye çifti en az bir satırda bulunur (hepsi şimdiki olan çift kaydedilen senaryoda zaten var). Açgözlü, deterministik: önce iki
 * seviyesi de değişen kapsanmamış çift tohumlanır, diğer faktörlerde en çok yeni çift kapsayan seviye seçilir (eşitlikte değişen seviye).
 * Tek faktörde her alternatif seviye bir satır. En çok enCok satır.
 * @param {ReadonlyArray<number>} boyutlar @param {number} enCok @returns {number[][]}
 */
export function ikiliKapsam(boyutlar, enCok) {
  const n = boyutlar.length;
  /** @type {number[][]} */
  const satirlar = [];
  if (!n || enCok <= 0) return satirlar;
  if (n === 1) {
    for (let a = 1; a < boyutlar[0] && satirlar.length < enCok; a++) satirlar.push([a]);
    return satirlar;
  }
  const anahtar = (/** @type {number} */ i, /** @type {number} */ a, /** @type {number} */ j, /** @type {number} */ b) => `${i}:${a}|${j}:${b}`;
  /** @type {Map<string, [number, number, number, number]>} */
  const acik = new Map();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let a = 0; a < boyutlar[i]; a++) for (let b = 0; b < boyutlar[j]; b++) {
    if (a || b) acik.set(anahtar(i, a, j, b), [i, a, j, b]);
  }
  /** Seviye kullanımı (her alternatif erken denensin: tohum ve eşitlikte en az kullanılan seçilir). */
  const kullanim = boyutlar.map((b) => Array(b).fill(0));
  while (acik.size && satirlar.length < enCok) {
    const adaylar = [...acik.values()];
    const ikisi = adaylar.filter(([, a, , b]) => a && b);
    const tohum = (ikisi.length ? ikisi : adaylar).reduce((en, x) => (kullanim[x[0]][x[1]] + kullanim[x[2]][x[3]] < kullanim[en[0]][en[1]] + kullanim[en[2]][en[3]] ? x : en));
    const satir = Array(n).fill(-1);
    satir[tohum[0]] = tohum[1];
    satir[tohum[2]] = tohum[3];
    for (let f = 0; f < n; f++) {
      if (satir[f] >= 0) continue;
      let en = 0;
      let enPuan = -1;
      for (let v = 0; v < boyutlar[f]; v++) {
        let puan = 0;
        for (let h = 0; h < n; h++) {
          if (h === f || satir[h] < 0) continue;
          if (acik.has(h < f ? anahtar(h, satir[h], f, v) : anahtar(f, v, h, satir[h]))) puan++;
        }
        // Eşitlikte değişen ve daha az kullanılmış seviye.
        if (puan > enPuan || (puan === enPuan && v > 0 && (en === 0 || kullanim[f][v] < kullanim[f][en]))) { en = v; enPuan = puan; }
      }
      satir[f] = en;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) acik.delete(anahtar(i, satir[i], j, satir[j]));
    satir.forEach((v, f) => { kullanim[f][v]++; });
    if (satir.some((v) => v > 0)) satirlar.push(satir);
  }
  return satirlar;
}

/**
 * Senaryo önerileri (YZ YOK, kurallı; az ama gerekçeli): [0] kaydedilen (hızlı testte yapılan) senaryo; sonra:
 *  1) Koşullu dallar: görünürlüğü belirleyen her seçim (alanların kosul.secim'i; liste / radyo) için şimdiki daldan farklı her dal (aynı
 *     alanları açan değerler tek dal) bir öneri. Dalın açtığı seçim alanı tablonun ilk seçeneğiyle doldurulur; değeri olmayan metin
 *     alanı açılıyorsa öneri "veri gerekli" (veriGerekli: alan adları) — değer ÜRETİLMEZ, kaydedilmez; kullanıcı o dalla yeni hızlı test başlatır.
 *  2) İkili kapsam (pairwise): bağımsız seçim alanları (şimdiki dalda görünenler; dal belirleyiciler hariç) ve VARSA bağlı liste zincirleri
 *     (zincir tablosu: alternatifler yalnız gözlenen tam kombinasyon SATIRLARI — zincir bütün olarak değişir, geçersiz birleşim üretilmez;
 *     kökü farklı satırlar önce). Seviyeler: şimdiki + en çok üç başka değer (ilk, son, aradan).
 *  Aynı değişikliği yapan öneriler ayıklanır; toplam en çok enCok (dallar önce).
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
  const liste = [{ indeks: 0, baslik, gerekce: 'Hızlı testte yaptığınız ve kaydettiğiniz akış', varsayilanSecili: true, alt: null, veriGerekli: [] }];
  const alanlar = s.alanlar ?? [];
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
  const doluMu = (/** @type {Nesne} */ x) => Boolean(x.hazir) || !bosMu(s.degerler?.[x.anahtar]);
  const degisiklik = (/** @type {string} */ k, /** @type {string} */ m) => {
    const y = /** @type {NonNullable<ReturnType<typeof yer.get>>} */ (yer.get(k));
    return { planAdi: y.t.ad, sutun: y.sutun, deger: m, etiket: y.etiket, oturumAnahtar: k };
  };

  /** @type {Array<{ degisiklikler: Degisiklik[]; ozet: string[]; gerekce: string; veriGerekli: string[] }>} */
  const adaylar = [];
  // 1) Koşullu dallar.
  const kontroller = [...new Set(alanlar.filter((x) => x.kosul?.secim && Array.isArray(x.kosul.degerler)).map((x) => String(x.kosul.secim)))];
  for (const k of kontroller) {
    if (!yer.has(k)) continue;
    const bagimlilar = alanlar.filter((x) => x.kosul?.secim === k && Array.isArray(x.kosul.degerler));
    const acilan = (/** @type {string} */ kod) => bagimlilar.filter((x) => x.kosul.degerler.map(String).includes(kod));
    const dalAnahtari = (/** @type {string} */ kod) => acilan(kod).map((x) => x.anahtar).sort().join('|');
    const su = simdikiKod(k);
    const suDal = su === null ? '' : dalAnahtari(su);
    /** @type {Map<string, { m: string; kod: string }>} */
    const dallar = new Map();
    for (const m of tablodakiler(k)) { const kod = kodu(k, m); const d = dalAnahtari(kod); if (!dallar.has(d)) dallar.set(d, { m, kod }); }
    for (const [d, { m, kod }] of dallar) {
      if (d === suDal) continue;
      const ac = acilan(kod);
      const degisiklikler = [degisiklik(k, m)];
      /** @type {string[]} */
      const veriGerekli = [];
      for (const x of ac) {
        if (doluMu(x) || String(x.tur) === 'checkbox') continue;
        if (SECIM_TURLERI.includes(String(x.tur))) {
          const l = tablodakiler(x.anahtar);
          if (l.length) { degisiklikler.push(degisiklik(x.anahtar, l[0])); continue; }
        }
        veriGerekli.push(String(x.etiket ?? x.anahtar));
      }
      const acilanlar = ac.map((x) => String(x.etiket ?? x.anahtar));
      adaylar.push({
        degisiklikler, ozet: [`${etiketi(k)}: ${m}`], veriGerekli,
        gerekce: `“${etiketi(k)}” = “${m}” dalı (${acilanlar.length ? `${acilanlar.join(', ')} alanları` : 'bu dalda ek alan açılmaz'})${veriGerekli.length ? ` — veri gerekli: ${veriGerekli.join(', ')}; bu dal için yeni hızlı test başlatın` : ''}`
      });
    }
  }
  // 2) İkili kapsam faktörleri: zincir tabloları (varsa) ve bağımsız seçimler.
  /** @type {Array<{ ad: string; zincir: boolean; seviyeler: Degisiklik[][] }>} */
  const faktorler = [];
  for (const t of plan.tablolar) {
    if (!t.zincir || !t.secilen || !t.alanlar.length) continue;
    const secilen = t.secilen;
    const dolu = Object.keys(secilen);
    const ayni = (/** @type {Record<string, string | null>} */ r) => dolu.every((c) => r[c] === secilen[c]);
    const tam = t.satirlar.filter((r) => dolu.every((c) => !bosMu(r[c])) && !ayni(r));
    const kok = t.alanlar[0].sutun;
    const kokler = [...new Set(tam.map((r) => String(r[kok])))].filter((v) => v !== secilen[kok]);
    /** @type {Array<Record<string, string | null>>} */
    const secilenler = ornekDegerler(kokler.map((v) => ({ deger: v, metin: v })), 3).map((x) => {
      const l = tam.filter((r) => r[kok] === x.deger);
      return l[Math.floor(l.length / 2)];
    });
    for (const r of tam) if (secilenler.length < 3 && !secilenler.includes(r)) secilenler.push(r);
    if (!secilenler.length) continue;
    faktorler.push({
      ad: `${t.alanlar[0].etiket} zinciri`, zincir: true,
      seviyeler: [[], ...secilenler.map((r) => t.alanlar.filter((a) => !bosMu(r[a.sutun])).map((a) => ({ planAdi: t.ad, sutun: a.sutun, deger: String(r[a.sutun]), etiket: a.etiket, oturumAnahtar: a.oturumAnahtar })))]
    });
  }
  for (const [k, y] of yer) {
    if (kontroller.includes(k)) continue;
    const a = alan(k);
    if (a && !SECIM_TURLERI.includes(String(a.tur))) continue;
    if (!a && !y.t.secilen) continue;
    // Koşullu alan yalnız şimdiki dalda görünüyorsa değişir.
    if (a?.kosul?.secim) { const kk = simdikiKod(String(a.kosul.secim)); if (kk === null || !(a.kosul.degerler ?? []).map(String).includes(kk)) continue; }
    const su = simdiki(k);
    const digerleri = tablodakiler(k).filter((m) => m !== su && kodu(k, m) !== su);
    const sec = ornekDegerler(digerleri.map((m) => ({ deger: m, metin: m })), 3).map((x) => x.metin);
    if (sec.length) faktorler.push({ ad: etiketi(k), zincir: false, seviyeler: [[], ...sec.map((m) => [degisiklik(k, m)])] });
  }
  const kapsam = ikiliKapsam(faktorler.map((f) => f.seviyeler.length), Math.max(0, enCok * 2));
  for (const satir of kapsam) {
    const degisenler = satir.map((v, f) => ({ f: faktorler[f], d: faktorler[f].seviyeler[v] })).filter((x) => x.d.length);
    const parcalar = degisenler.map((x) => (x.f.zincir ? `Farklı ${x.f.ad}: ${x.d.map((d) => d.deger).join(' › ')}` : `“${x.d[0].etiket}” = “${x.d[0].deger}”`));
    adaylar.push({
      degisiklikler: degisenler.flatMap((x) => x.d),
      ozet: degisenler.map((x) => (x.f.zincir ? `${x.d[0].etiket}: ${x.d.map((d) => d.deger).join(' / ')}` : `${x.d[0].etiket}: ${x.d[0].deger}`)),
      veriGerekli: [],
      gerekce: `${parcalar.join('; ')}${faktorler.length > 1 ? ` — ${faktorler.map((f) => f.ad).join(' × ')} ikili kapsamı` : ''}; diğer değerler aynı`
    });
  }
  // Ayıklama (aynı değişiklik kümesi) ve sınır.
  const gorulen = new Set();
  for (const x of adaylar) {
    if (liste.length > enCok) break;
    const imza = x.degisiklikler.map((d) => `${d.planAdi}|${d.sutun}=${d.deger}`).sort().join('\u0001');
    if (!x.degisiklikler.length || gorulen.has(imza)) continue;
    gorulen.add(imza);
    liste.push({
      indeks: liste.length, baslik: `${baslik} — ${x.ozet.join(' · ')}`.slice(0, 200), gerekce: x.gerekce.slice(0, 600),
      varsayilanSecili: false, alt: { degisiklikler: x.degisiklikler }, veriGerekli: x.veriGerekli
    });
  }
  return liste;
}
