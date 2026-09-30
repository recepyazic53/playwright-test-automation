// HIZLI TEST KAYIT PLANI: "Testi kaydet"ten önce kullanıcıya gösterilen ÖZET ve onayla yazılan test verisi. Yapay zekâ paketinin
// önizlemesiyle (testVerisiSecimi) aynı sistem: hangi tablolar yazılacak, aynı adlı / benzer tablo varsa birleştir / yeni adla yaz /
// atla, hangi alanlar hangi tablo sütununa bağlanacak, hangi senaryolar eklenecek. Kullanıcı onaylamadan hiçbir şey yazılmaz.
//   planKur        analiz + kullanıcının yazdığı değerlerden tablo planı: kişi / kart alanları gruplu, diğer her seçim alanı kendi liste tablosu
//                  (TÜM seçenekler), kullanıcının yazdığı değerler tek satır (senaryo satırı).
//   planOnizle     önizleme (paketTestVerisiOnizle ile aynı biçim): mevcut aynı adlı / benzer tablo, eklenecek satır / sütun, bağlantılar.
//   planYaz        seçimle yazar: yeni / birleştir / yeni ad / atla; senaryonun kendi satırına sabitlenmesi (pin), alan → sütun başvuruları.
//   senaryoOnerileri  kaydedilen senaryo + seçim alanlarının diğer seçenekleriyle alternatif senaryolar.
// Değer ÜRETİLMEZ: yalnız kullanıcının yazdıkları ve sayfadan okunan seçenekler. Gizli sütun değerleri önizlemede görünmez.
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { baslikNormal, benzerTablolar } from '../tablolar/tablo-benzerligi.mjs';
import { birlestirmePlani } from '../tablolar/paket-test-verisi.mjs';
import { degerBasvurusuYaz, grupAnahtari } from '../tablolar/tablo-secimi.mjs';
import { adTemizle, tabloTaslagiKur } from './test-verisi-tablosu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
const EN_COK_SECENEK = 60;
const EN_COK_LISTE_TABLOSU = 12;
const EN_COK_ALTERNATIF = 8;

/**
 * @param {{ baslik: string; alanlar: Nesne[]; degerler: Record<string, { deger: unknown; kaynak?: string }> }} g
 * @returns {{ satirAdi: string; tablolar: Array<{ ad: string; tur: 'kayit' | 'liste'; sutunlar: Array<{ ad: string; gizli: boolean; karsiliklar: Record<string, { sayfa: string }> }>;
 *   satirlar: Array<Record<string, string | null>>; secilen: Record<string, string> | null; alanlar: Array<{ oturumAnahtar: string; sutun: string; etiket: string; degerli: boolean }> }> }}
 */
export function planKur(g) {
  const t = tabloTaslagiKur({ baslik: g.baslik, alanlar: g.alanlar, degerler: g.degerler });
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
    const liste = a.tur === 'radio' ? (Array.isArray(a.radyolar) ? a.radyolar : []) : (Array.isArray(a.secenekler) ? a.secenekler : []);
    /** @type {Map<string, { metin: string; kod: string }>} */
    const secenekler = new Map();
    for (const s of liste) {
      const kod = String(s.deger ?? '');
      const metin = typeof s.metin === 'string' && s.metin.trim() ? s.metin.trim() : kod;
      if (kod !== '' && metin && !secenekler.has(kucuk(metin))) secenekler.set(kucuk(metin), { metin, kod });
    }
    const etiket = String(a.etiket ?? '');
    const ad = adTemizle(etiket);
    if (secenekler.size < 2 || secenekler.size > EN_COK_SECENEK || !ad || kullanilanAdlar.has(kucuk(ad)) || gizliAdMi(ad)) continue;
    const gizli = gizliAdMi(ad);
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
 * @returns {Array<{ planAdi: string; ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number; hedef: (sutun: string) => string;
 *   pin: Record<string, string> | null; tur: 'kayit' | 'liste'; plan: ReturnType<typeof planKur>['tablolar'][number] }>}
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
      const id = tabloKaydet(vt, {
        projeId, ad, tur: t.tur, kaynak,
        sutunlar: t.sutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) })),
        satirlar: t.tur === 'liste' ? t.satirlar.map((d) => ({ ad: String(Object.values(d)[0] ?? ''), ortamId: null, degerler: d })) : t.satirlar.map((d) => kayitSatiri(kullanilan, d))
      });
      sonuc.push({ planAdi: t.ad, ad, id, islem: sec.islem, eklenenSatir: t.satirlar.length, eklenenSutun: t.sutunlar.length, hedef: (s) => s, pin: t.secilen, tur: t.tur, plan: t });
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
    sonuc.push({
      planAdi: t.ad, ad: mevcut.ad, id, islem: 'birlestir', eklenenSatir: p.eklenecek.length, eklenenSutun: p.yeniSutunlar.length, hedef,
      pin: t.secilen ? Object.fromEntries(Object.entries(t.secilen).map(([k, v]) => [hedef(k), v])) : null, tur: t.tur, plan: t
    });
  }
  return sonuc;
}

/** Senaryonun tablodan aldığı değere alan başvurusu. @param {string} tabloAdi @param {string} sutun */
export const basvuruYaz = (tabloAdi, sutun) => degerBasvurusuYaz(tabloAdi, sutun);
/** Satır seçimi (pin) anahtarı. @param {string} tabloId */
export const pinAnahtari = (tabloId) => grupAnahtari(tabloId, '');

/**
 * Senaryo önerileri: [0] kaydedilen (hızlı testte yapılan) senaryo; sonra kullanıcının seçtiği liste alanlarının DİĞER seçenekleriyle
 * alternatifler (aynı değerler, o alan başka seçenekle). Alternatifler varsayılan olarak seçili değildir.
 * @param {ReturnType<typeof planKur>} plan @param {string} baslik
 * @returns {Array<{ indeks: number; baslik: string; gerekce: string; varsayilanSecili: boolean; alt: { planAdi: string; sutun: string; deger: string; etiket: string } | null }>}
 */
export function senaryoOnerileri(plan, baslik) {
  /** @type {ReturnType<typeof senaryoOnerileri>} */
  const liste = [{ indeks: 0, baslik, gerekce: 'Hızlı testte yaptığınız ve kaydettiğiniz akış', varsayilanSecili: true, alt: null }];
  for (const t of plan.tablolar) {
    if (t.tur !== 'liste' || !t.secilen || t.satirlar.length < 2) continue;
    const sutun = t.sutunlar[0].ad;
    const secilen = t.secilen[sutun];
    const etiket = t.alanlar[0]?.etiket ?? t.ad;
    for (const d of t.satirlar) {
      const v = String(d[sutun] ?? '');
      if (!v || v === secilen || liste.length > EN_COK_ALTERNATIF) continue;
      liste.push({ indeks: liste.length, baslik: `${baslik} — ${etiket}: ${v}`.slice(0, 200), gerekce: `“${etiket}” alanında “${v}” seçeneğini dener; diğer değerler aynı`, varsayilanSecili: false, alt: { planAdi: t.ad, sutun, deger: v, etiket } });
    }
  }
  return liste;
}
