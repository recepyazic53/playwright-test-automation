// HIZLI TEST KAYIT PLANI: "Testi kaydet"ten önce kullanıcıya gösterilen ÖZET ve onayla yazılan test verisi. Yapay zekâ paketinin
// önizlemesiyle (testVerisiSecimi) aynı sistem: hangi tablolar yazılacak, aynı adlı / benzer tablo varsa birleştir / yeni adla yaz /
// atla, hangi alanlar hangi tablo sütununa bağlanacak, hangi senaryolar eklenecek. Kullanıcı onaylamadan hiçbir şey yazılmaz.
//   planKur        analiz + kullanıcının yazdığı değerlerden tablo planı: kişi / kart alanları gruplu, diğer her seçim alanı kendi liste tablosu
//                  (TÜM seçenekler), kullanıcının yazdığı değerler tek satır (senaryo satırı).
//   planOnizle     önizleme (paketTestVerisiOnizle ile aynı biçim): mevcut aynı adlı / benzer tablo, eklenecek satır / sütun, bağlantılar.
//   planYaz        seçimle yazar: yeni / birleştir / yeni ad / atla; senaryonun kendi satırına sabitlenmesi (pin), alan → sütun başvuruları.
//   senaryoOnerileri  kaydedilen senaryo + az sayıda farklı alternatif (bağlı listeler geçerli birleşimle birlikte, diğer seçimler ilk/son/aradan).
// Değer ÜRETİLMEZ: yalnız kullanıcının yazdıkları ve sayfadan okunan seçenekler. Gizli sütun değerleri önizlemede görünmez.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { baslikNormal, benzerTablolar } from '../tablolar/tablo-benzerligi.mjs';
import { birlestirmePlani } from '../tablolar/paket-test-verisi.mjs';
import { degerBasvurusuYaz, grupAnahtari, satirSabitlemesi } from '../tablolar/tablo-secimi.mjs';
import { adTemizle, tabloTaslagiKur, tumSecenekler } from './test-verisi-tablosu.mjs';
import { ornekDegerler } from '../tarama/zincir-kesfi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
const EN_COK_SECENEK = 60;
const EN_COK_LISTE_TABLOSU = 12;
/** Hızlı test kaydında önerilen alternatif senaryo sayısı (Ayarlar > Koşu > Tarama ve akış kaydı > hizliOneriSayisi). */
export const VARSAYILAN_ONERI_SAYISI = 5;

/**
 * @param {{ baslik: string; alanlar: Nesne[]; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string> }} g
 * @returns {{ satirAdi: string; tablolar: Array<{ ad: string; tur: 'kayit' | 'liste'; sutunlar: Array<{ ad: string; gizli: boolean; karsiliklar: Record<string, { sayfa: string }> }>;
 *   satirlar: Array<Record<string, string | null>>; secilen: Record<string, string> | null; alanlar: Array<{ oturumAnahtar: string; sutun: string; etiket: string; degerli: boolean }> }> }}
 */
export function planKur(g) {
  const t = tabloTaslagiKur({ baslik: g.baslik, alanlar: g.alanlar, degerler: g.degerler, ekGizliAdlar: g.ekGizliAdlar });
  const satirAdi = adTemizle(g.baslik || 'Hızlı test') || 'Hızlı test';
  /** @type {ReturnType<typeof planKur>['tablolar']} */
  const tablolar = [];
  const etiketi = (/** @type {string} */ anahtar) => String(g.alanlar.find((a) => a.anahtar === anahtar)?.etiket ?? anahtar);
  const kullanilanAdlar = new Set();
  const kullanilanAlanlar = new Set();
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
  // Kullanıcının değer yazmadığı seçim alanları da analiz edilip kendi liste tablosuna alınır (tüm seçenekler; sayfada hazır gelenler dahil).
  let ek = 0;
  for (const a of g.alanlar) {
    if (ek >= EN_COK_LISTE_TABLOSU) break;
    if (kullanilanAlanlar.has(a.anahtar) || !['select', 'select-one', 'radio'].includes(String(a.tur)) || a.devreDisi || a.saltOkunur) continue;
    /** @type {Map<string, { metin: string; kod: string }>} */
    const secenekler = new Map(tumSecenekler(a).map((x) => [kucuk(x.metin), x]));
    const etiket = String(a.etiket ?? '');
    const ad = adTemizle(etiket);
    if (secenekler.size < 2 || secenekler.size > EN_COK_SECENEK || !ad || kullanilanAdlar.has(kucuk(ad)) || gizliAdMi(ad, g.ekGizliAdlar ?? [])) continue;
    const gizli = false;
    tablolar.push({
      ad, tur: 'liste', sutunlar: [{ ad, gizli, karsiliklar: Object.fromEntries([...secenekler.values()].filter((s) => s.metin !== s.kod).map((s) => [s.metin, { sayfa: s.kod }])) }],
      satirlar: [...secenekler.values()].map((s) => ({ [ad]: s.metin })), secilen: null,
      alanlar: [{ oturumAnahtar: a.anahtar, sutun: ad, etiket, degerli: false }]
    });
    kullanilanAdlar.add(kucuk(ad));
    ek++;
  }
  return { satirAdi, tablolar };
}

/**
 * Önizleme (paketTestVerisiOnizle ile aynı biçim; arayüzde testVerisiSecimi bunu gösterir).
 * @param {Veritabani} vt @param {string} projeId @param {ReturnType<typeof planKur>} plan @param {string | null} ekranId mevcut ekran (varsa)
 * @param {Record<string, string>} anahtarlar oturum alan anahtarı → modeldeki senaryo anahtarı (modelde olmayan alan bağlanamaz)
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
      return {
        ad: t.ad, tur: t.tur, aciklama: null, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, karsilikSayisi: Object.keys(s.karsiliklar).length })),
        satirSayisi: t.satirlar.length, tekrarSayisi: 0,
        ornek: t.satirlar.slice(0, 5).map((d) => t.sutunlar.map((s) => (s.gizli ? null : d[s.ad] ?? null))),
        bagliAlanlar: t.alanlar.filter((a) => anahtarlar[a.oturumAnahtar]).map((a) => a.etiket),
        benzer: m ? [] : benzerTablolar(t.sutunlar, mevcutlar, { ad: t.ad, satirlar: t.satirlar }).slice(0, 3).map((b) => {
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

/** Seçim yoksa varsayılan: aynı adlı tablo varsa birleştir, yoksa yeni; tüm bağlantılar. @param {ReturnType<typeof planOnizle>} onizleme */
export function varsayilanSecim(onizleme) {
  return {
    tablolar: Object.fromEntries(onizleme.tablolar.map((t) => [t.ad, { islem: t.mevcut ? 'birlestir' : 'yeni' }])),
    baglantilar: onizleme.baglantilar.map((b) => b.alanId)
  };
}

/**
 * Seçimle yazar (çağıranın işleminde). 'atla' tablo yazılmaz (alanlar senaryoda düz değerle kalır). Birleştirmede mevcut satır / sütunlar
 * değişmez: eksik sütunlar, olmayan satırlar ve eksik karşılıklar eklenir. Senaryonun kullandığı satır (secilen) pin olarak döner.
 * @param {Veritabani} vt @param {string} projeId @param {ReturnType<typeof planKur>} plan
 * @param {{ tablolar?: Record<string, { islem: string; yeniAd?: string; hedefId?: string }> }} secim @param {{ ekranAdi: string }} bilgi
 * satirId: kayıt tablosunda senaryonun satırı (yeni / eklenen ya da birebir aynı mevcut satır) — senaryo buna satır kimliğiyle sabitlenir.
 * @returns {Array<{ planAdi: string; ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number; hedef: (sutun: string) => string;
 *   pin: Record<string, string> | null; satirId: string | null; tur: 'kayit' | 'liste'; plan: ReturnType<typeof planKur>['tablolar'][number] }>}
 */
export function planYaz(vt, projeId, plan, secim, bilgi) {
  /** @type {ReturnType<typeof planYaz>} */
  const sonuc = [];
  for (const t of plan.tablolar) {
    const sec = secim.tablolar?.[t.ad] ?? { islem: 'atla' };
    if (sec.islem === 'atla') continue;
    const mevcutlar = tablolariListele(vt, projeId);
    const mevcut = sec.islem === 'birlestir' && sec.hedefId ? mevcutlar.find((x) => x.id === sec.hedefId) : mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
    const kaynak = { tur: 'kayit', olusturan: 'Nöbetçi hızlı test', ekran: bilgi.ekranAdi.slice(0, 120), yazilma: new Date().toISOString() };
    const kayitSatiri = (/** @type {Set<string>} */ kullanilan, /** @type {Record<string, string | null>} */ d) => {
      let ad = plan.satirAdi;
      for (let i = 2; kullanilan.has(kucuk(ad)); i++) ad = `${plan.satirAdi.slice(0, 55)} ${i}`;
      kullanilan.add(kucuk(ad));
      return { ad, ortamId: null, degerler: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) };
    };
    if (sec.islem === 'yeni' || sec.islem === 'yeniAd') {
      const ad = sec.islem === 'yeniAd' ? String(sec.yeniAd ?? '').trim() : t.ad;
      if (!ad) throw new Error(`"${t.ad}" tablosu için yeni ad yazın.`);
      if (sec.islem === 'yeni' && mevcut) throw new Error(`"${t.ad}" adında bir tablo zaten var: birleştir, yeni ad ya da atla seçin.`);
      const kullanilan = new Set();
      const kayitSatirlari = t.tur === 'liste' ? [] : t.satirlar.map((d) => kayitSatiri(kullanilan, d));
      const id = tabloKaydet(vt, {
        projeId, ad, tur: t.tur, kaynak,
        sutunlar: t.sutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) })),
        satirlar: t.tur === 'liste' ? t.satirlar.map((d) => ({ ad: String(Object.values(d)[0] ?? ''), ortamId: null, degerler: d })) : kayitSatirlari
      });
      sonuc.push({
        planAdi: t.ad, ad, id, islem: sec.islem, eklenenSatir: t.satirlar.length, eklenenSutun: t.sutunlar.length, hedef: (s) => s, pin: t.secilen,
        satirId: kayitSatirlari.length ? satirKimligi(vt, projeId, id, kayitSatirlari[0].ad) : null, tur: t.tur, plan: t
      });
      continue;
    }
    if (!mevcut) throw new Error(`"${t.ad}" adında birleştirilecek tablo yok.`);
    const p = birlestirmePlani(mevcut, t);
    const paketSutunu = (/** @type {string} */ mevcutAd) => t.sutunlar.find((x) => p.eslesme.get(x.ad) === mevcutAd);
    const sutunlar = [
      ...mevcut.sutunlar.map((m) => {
        const ps = paketSutunu(m.ad);
        const eksik = ps && !m.gizli ? Object.fromEntries(Object.entries(ps.karsiliklar).filter(([d]) => !m.karsiliklar?.[d])) : {};
        return { ad: m.ad, eskiAd: m.ad, gizli: m.gizli, ...(Object.keys(eksik).length ? { karsiliklar: { ...(m.karsiliklar ?? {}), ...eksik } } : {}) };
      }),
      ...p.yeniSutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) }))
    ];
    const hedef = (/** @type {string} */ ad) => p.eslesme.get(ad) ?? ad;
    const kullanilan = new Set(mevcut.satirlar.map((r) => kucuk(r.ad)));
    const yeniSatirlar = p.eklenecek.map((d) => {
      const esli = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null).map(([k, v]) => [hedef(k), v]));
      return t.tur === 'liste' ? { ad: String(Object.values(d)[0] ?? ''), ortamId: null, degerler: esli } : { ...kayitSatiri(kullanilan, d), degerler: esli };
    });
    const id = tabloKaydet(vt, { projeId, id: mevcut.id, ad: mevcut.ad, sutunlar, satirlar: yeniSatirlar });
    // Senaryonun satırı (kayıt tablosu): birleştirmede EKLENEN yeni satır; aynısı zaten varsa (gizli değeri olmayan, açık değerleri
    // birebir aynı satır) o mevcut satır. Senaryo bu satıra satır kimliğiyle sabitlenir (gizli / açık değerden bağımsız).
    let satirId = null;
    if (t.tur !== 'liste' && t.satirlar.length) {
      const ilk = t.satirlar[0];
      const i = p.eklenecek.indexOf(ilk);
      if (i >= 0) satirId = satirKimligi(vt, projeId, id, String(yeniSatirlar[i].ad));
      else {
        const esli = Object.entries(ilk).filter(([, v]) => v !== null).map(([k, v]) => [hedef(k), String(v)]);
        satirId = mevcut.satirlar.find((r) => esli.every(([k, v]) => String(r.degerler[k] ?? '') === v))?.id ?? null;
      }
    }
    sonuc.push({
      planAdi: t.ad, ad: mevcut.ad, id, islem: 'birlestir', eklenenSatir: p.eklenecek.length, eklenenSutun: p.yeniSutunlar.length, hedef,
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
 * satırda da kurulur), liste tablosunda seçilen değerle. Yoksa null.
 * @param {{ satirId?: string | null; pin: Record<string, string> | null; tur: 'kayit' | 'liste' }} y @returns {Record<string, string> | null}
 */
export function pinSecimi(y) {
  if (y.tur !== 'liste' && y.satirId) return satirSabitlemesi(y.satirId);
  return y.pin && Object.keys(y.pin).length ? Object.fromEntries(Object.entries(y.pin).map(([k, v]) => [k, String(v).slice(0, 200)])) : null;
}

/**
 * Senaryo önerileri (YZ YOK, kurallı): [0] kaydedilen (hızlı testte yapılan) senaryo; sonra az sayıda, birbirinden FARKLI alternatif.
 *  - Bağlı listeler (il → ilçe → mahalle…) hep BİRLİKTE değişir: keşfin / doldurmanın gözlediği geçerli bir yol (kökten yaprağa) alınır;
 *    yalnız üst değişip altların eski kalması (gerçekte olmayan birleşim) önerilmez. Kullanıcının doldurduğu her bağlı listeyi kapsamayan
 *    yol önerilmez. Kökte farklı değerler (ilk, son, aradan) öne alınır.
 *  - Diğer seçim alanları (liste / radyo): şimdiki değer dışındaki seçeneklerden ilk, son ve aradan. Bir değer, değeri girilmemiş bir
 *    metin alanını açıyorsa (görünürlük koşulu) önerilmez: o senaryo eksik veriyle koşardı.
 *  - Birleştirme: k. öneri her değişkenin k. adayını alır (her aday en az bir kez denenir; az senaryoyla çok kapsama). Öneri sayısı enCok.
 * Değer ÜRETİLMEZ: adaylar yalnız sayfadan okunan seçenekler ve gözlenen bağlı liste yollarıdır. s verilmezse (eski çağrı) yalnız değeri
 * seçilmiş liste tabloları değişken sayılır.
 * @param {ReturnType<typeof planKur>} plan @param {string} baslik
 * @param {{ enCok?: number; alanlar?: Nesne[]; iliskiler?: ReadonlyArray<{ ust: string; alt: string }>;
 *   gozlemler?: ReadonlyArray<{ anahtar: string; secimler: Record<string, string>; secenekler: ReadonlyArray<{ deger: string; metin?: string | null }> }>;
 *   degerler?: Record<string, unknown> }} [s]
 * @returns {Array<{ indeks: number; baslik: string; gerekce: string; varsayilanSecili: boolean;
 *   alt: { degisiklikler: Array<{ planAdi: string; sutun: string; deger: string; etiket: string; oturumAnahtar: string }> } | null }>}
 */
export function senaryoOnerileri(plan, baslik, s = {}) {
  const enCok = Number.isInteger(s.enCok) && Number(s.enCok) > 0 ? Number(s.enCok) : VARSAYILAN_ONERI_SAYISI;
  /** @type {ReturnType<typeof senaryoOnerileri>} */
  const liste = [{ indeks: 0, baslik, gerekce: 'Hızlı testte yaptığınız ve kaydettiğiniz akış', varsayilanSecili: true, alt: null }];
  const alanlar = s.alanlar ?? [];
  const alan = (/** @type {string} */ k) => alanlar.find((a) => a.anahtar === k);
  /** Oturum alanı → liste tablosu + sütun (değişiklik o tablonun satırı seçilerek yapılır). */
  /** @type {Map<string, { t: ReturnType<typeof planKur>['tablolar'][number]; sutun: string; etiket: string }>} */
  const yer = new Map();
  for (const t of plan.tablolar) {
    if (t.tur !== 'liste') continue;
    for (const a of t.alanlar) if (!t.sutunlar.find((c) => c.ad === a.sutun)?.gizli) yer.set(a.oturumAnahtar, { t, sutun: a.sutun, etiket: a.etiket });
  }
  const tablodakiler = (/** @type {string} */ k) => { const y = yer.get(k); return y ? y.t.satirlar.map((r) => String(r[y.sutun] ?? '')).filter(Boolean) : []; };
  const simdiki = (/** @type {string} */ k) => { const y = yer.get(k); return y?.t.secilen?.[y.sutun] ?? null; };
  // Kod → görünen metin (tablolar metinle tutulur; gözlemler seçenek değeriyle).
  /** @type {Map<string, Map<string, string>>} */
  const metinler = new Map();
  const metinEkle = (/** @type {string} */ k, /** @type {string} */ kod, /** @type {string} */ m) => { if (!metinler.has(k)) metinler.set(k, new Map()); metinler.get(k)?.set(kod, m); };
  for (const a of alanlar) for (const x of tumSecenekler(a)) metinEkle(a.anahtar, x.kod, x.metin);
  for (const g of s.gozlemler ?? []) for (const x of g.secenekler ?? []) metinEkle(g.anahtar, String(x.deger), String(x.metin ?? x.deger));
  const metni = (/** @type {string} */ k, /** @type {string} */ kod) => metinler.get(k)?.get(kod) ?? kod;
  const etiketi = (/** @type {string} */ k) => yer.get(k)?.etiket ?? String(alan(k)?.etiket ?? k);

  /** @type {Array<{ ad: string; adaylar: Array<Array<{ k: string; metin: string }>> }>} */
  const degiskenler = [];
  // 1) Bağlı liste zinciri: gözlenen yollar (kökten yaprağa; yaprakta listenin aradan bir seçeneği).
  const ustu = new Map((s.iliskiler ?? []).map((i) => [i.alt, i.ust]));
  const zincir = new Set([...ustu.keys(), ...ustu.values()]);
  if (zincir.size) {
    /** @type {Array<Record<string, string>>} */
    const yollar = [];
    for (const g of s.gozlemler ?? []) {
      if (!zincir.has(g.anahtar)) continue;
      const l = (g.secenekler ?? []).filter((x) => String(x.deger) !== '');
      if (!l.length) continue;
      yollar.push({ ...g.secimler, [g.anahtar]: String(l[Math.floor(l.length / 2)].deger) });
    }
    const altKume = (/** @type {Record<string, string>} */ a, /** @type {Record<string, string>} */ b) => Object.keys(a).length < Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
    const enUzun = [...new Map(yollar.filter((a) => !yollar.some((b) => altKume(a, b))).map((a) => [JSON.stringify(Object.entries(a).sort()), a])).values()];
    // Kullanıcının doldurduğu (tabloda seçili satırı olan) her bağlı liste yolda olmalı; yoldaki değerler tabloda bulunmalı.
    const gereken = [...zincir].filter((k) => simdiki(k) !== null);
    const kokler = [...zincir].filter((k) => !ustu.has(k));
    // Yol, kendi zincirinde kullanıcının doldurduğu her listeyi kapsamalı (yoksa o listede eski yolun değeri kalırdı).
    const ayniZincir = (/** @type {string} */ k, /** @type {string} */ kok) => { for (let u = k; u; u = ustu.get(u)) if (u === kok) return true; return false; };
    const gecerli = enUzun.filter((a) => {
      const kok = kokler.find((x) => x in a);
      return Boolean(kok) && gereken.filter((k) => ayniZincir(k, /** @type {string} */ (kok))).every((k) => k in a)
        && Object.entries(a).every(([k, v]) => !yer.has(k) || tablodakiler(k).includes(metni(k, v)));
    });
    // Her zincir (kökü ayrı: il → ilçe…, marka → model…) ayrı bir değişkendir. Kökü farklı yollar önce (keşif kökte ilk, son ve aradan
    // değerleri dener; gözlem sırası bu sıradır), sonra kalanlar.
    for (const kok of kokler) {
      const yolu = gecerli.filter((a) => kok in a && metni(kok, a[kok]) !== simdiki(kok));
      const tekKok = [...new Map(yolu.map((a) => [a[kok], a])).values()];
      const adaylar = [...tekKok, ...yolu.filter((a) => !tekKok.includes(a))]
        .map((a) => Object.entries(a).filter(([k]) => yer.has(k)).map(([k, v]) => ({ k, metin: metni(k, v) })));
      if (adaylar.length) degiskenler.push({ ad: `zincir:${kok}`, adaylar });
    }
  }
  // 2) Diğer seçim alanları (zincir dışı): şimdiki değer dışındaki seçeneklerden ilk, son, aradan.
  for (const [k, y] of yer) {
    if (zincir.has(k)) continue;
    const a = alan(k);
    if (a && (a.kosul || !['select', 'select-one', 'radio'].includes(String(a.tur)))) continue;
    if (!a && !y.t.secilen) continue;
    const su = simdiki(k) ?? (a?.mevcut ? String(a.mevcut) : null);
    const kodu = (/** @type {string} */ m) => y.t.sutunlar.find((c) => c.ad === y.sutun)?.karsiliklar[m]?.sayfa ?? (a ? tumSecenekler(a).find((x) => x.metin === m)?.kod : undefined) ?? m;
    // Değeri girilmemiş metin alanını açan seçenek önerilmez (senaryo eksik veriyle koşardı).
    const eksikAcar = (/** @type {string} */ m) => alanlar.some((x) => x.kosul?.secim === k && Array.isArray(x.kosul.degerler) && x.kosul.degerler.includes(kodu(m))
      && !['select', 'select-one', 'radio', 'checkbox'].includes(String(x.tur)) && !x.hazir && !(s.degerler && s.degerler[x.anahtar]));
    const secenekler = tablodakiler(k).filter((m) => m !== su && kodu(m) !== su && !eksikAcar(m)).map((m) => ({ deger: m, metin: m }));
    const adaylar = ornekDegerler(secenekler, 3).map((x) => [{ k, metin: x.metin }]);
    if (adaylar.length) degiskenler.push({ ad: k, adaylar });
  }
  // 3) Birleştirme: k. öneri her değişkenin k. adayını alır.
  for (let i = 0; liste.length <= enCok; i++) {
    const secim = degiskenler.filter((d) => i < d.adaylar.length).map((d) => d.adaylar[i]);
    if (!secim.length) break;
    const degisiklikler = secim.flat().map((x) => {
      const y = /** @type {NonNullable<ReturnType<typeof yer.get>>} */ (yer.get(x.k));
      return { planAdi: y.t.ad, sutun: y.sutun, deger: x.metin, etiket: y.etiket, oturumAnahtar: x.k };
    });
    const ozet = secim.map((p) => (p.length > 1 ? `${etiketi(p[0].k)}: ${p.map((x) => x.metin).join(' / ')}` : `${etiketi(p[0].k)}: ${p[0].metin}`));
    liste.push({
      indeks: liste.length, baslik: `${baslik} — ${ozet.join(' · ')}`.slice(0, 200),
      gerekce: `Farklı: ${degisiklikler.map((d) => `“${d.etiket}” = “${d.deger}”`).join(', ')}; diğer değerler aynı${secim.some((p) => p.length > 1) ? ' (bağlı listeler gözlenen geçerli bir birleşimle birlikte değişir)' : ''}`.slice(0, 600),
      varsayilanSecili: false, alt: { degisiklikler }
    });
  }
  return liste;
}
