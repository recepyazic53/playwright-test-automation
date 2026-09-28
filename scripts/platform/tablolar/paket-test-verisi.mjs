// SAYFA PAKETİNDEN TEST VERİSİ — paketin "testVerisi" bölümü (paket-tablolari.mjs) Test verisi tablolarına ve ekranın alan
// bağlantılarına YALNIZCA kullanıcının önizlemede onayladığı seçimle yazılır:
//   paketTestVerisiOnizle   hangi tablolar (sütun / satır sayısı, örnek satırlar — gizli sütun değeri yok), aynı adlı mevcut
//                           tablo (birleştirilirse eklenecek satır / sütun), hangi alanlar hangi sütuna bağlanacak (mevcut
//                           bağlantı değişiyorsa o da).
//   paketTestVerisiniYaz    seçim: { tablolar: { <paket tablo adı>: { islem: 'yeni' | 'birlestir' | 'yeniAd' | 'atla', yeniAd? } },
//                           baglantilar: [alanId] }. 'birlestir' + hedefId: adı farklı ama başlıkları aynı (esnek) mevcut tabloya
//                           birleştirir (önleme: önizlemede "benzer" tablolar önerilir; kullanıcı "onu kullan" derse).
//                           Seçimi olmayan tablo YAZILMAZ (atla); aynı adlı tablo varken 'yeni'
//                           reddedilir. Birleştirme mevcut sütun / satırları değiştirmez: eksik sütunlar ve tabloda olmayan
//                           satırlar eklenir, karşılıklar tamamlanır; mevcut tablonun KAYNAĞI da değişmez (varsa korunur,
//                           yoksa yok kalır). Kaynak (paket / tarama / kayıt, ekran, tarih, tablo türü) yalnız yeni tabloya yazılır.
//                           ertele(alanId): true dönen alanların bağlantısı yazılmaz, "ertelenen" olarak döner (tekrar analizde
//                           bulgu kararına kadar bekler; ekran-servisi.mjs > analizUygula yazar).
// Çağıran veritabanı işleminin içinde çalışır (ekran + model ile birlikte ya hep ya hiç). Kasa AÇIK olmalıdır.

import { DepoHatasi, ekranModeliGetir } from '../veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from './ekran-baglari.mjs';
import { alanEtiketi, modelAlanlari, paketTablolari } from './paket-tablolari.mjs';
import { KAYIT_OLUSTURANI, TARAMA_OLUSTURANI } from '../tarama/paket-olusturucu.mjs';
import { baslikNormal, benzerTablolar } from './tablo-benzerligi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {'yeni' | 'birlestir' | 'yeniAd' | 'atla'} TabloIslemi */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
const ISLEMLER = new Set(['yeni', 'birlestir', 'yeniAd', 'atla']);

/** Paketin kaynağı: otomatik tarama / akış kaydı / (Claude Code'un ya da elle üretilen) paket. @param {Nesne} meta */
export function paketKaynakTuru(meta) {
  const o = String(meta?.olusturan ?? '');
  return o === TARAMA_OLUSTURANI ? 'tarama' : o === KAYIT_OLUSTURANI ? 'kayit' : 'paket';
}

/**
 * Mevcut tablo ile paketin tablosu: sütun eşleşmesi (ad, büyük/küçük harf yok sayılır) ve eklenecek satırlar.
 * @param {import('./tablo-deposu.mjs').Tablo} mevcut @param {import('./paket-tablolari.mjs').PaketTablosu} t
 */
function birlestirmePlani(mevcut, t) {
  /** @type {Map<string, string>} paket sütunu → mevcut sütun adı */
  const eslesme = new Map();
  for (const s of t.sutunlar) {
    const m = mevcut.sutunlar.find((x) => kucuk(x.ad) === kucuk(s.ad)) ?? mevcut.sutunlar.find((x) => baslikNormal(x.ad) === baslikNormal(s.ad));
    if (m) eslesme.set(s.ad, m.ad);
  }
  const yeniSutunlar = t.sutunlar.filter((s) => !eslesme.has(s.ad));
  const imza = (/** @type {(ad: string) => string | null} */ oku) => JSON.stringify(t.sutunlar.map((s) => oku(s.ad) ?? null));
  const var_ = new Set(mevcut.satirlar.map((r) => imza((ad) => { const m = eslesme.get(ad); return m ? r.degerler[m] ?? null : null; })));
  const eklenecek = t.satirlar.filter((d) => !var_.has(imza((ad) => d[ad] ?? null)));
  return { eslesme, yeniSutunlar, eklenecek };
}

/**
 * Önizleme: paketin testVerisi bölümü projeye göre (paket geçerli varsayılır). Bölüm yoksa null.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} paket @param {string | null} ekranId mevcut ekran (analiz / değiştir / modelsiz ekran)
 */
export function paketTestVerisiOnizle(vt, projeId, paket, ekranId) {
  const p = /** @type {Nesne} */ (nesneMi(paket) ? paket : {});
  if (!nesneMi(p.testVerisi)) return null;
  const { tablolar, baglantilar } = paketTablolari(p.testVerisi, p.model);
  if (!tablolar.length) return null;
  const mevcutlar = tablolariListele(vt, projeId);
  const alanlar = modelAlanlari(p.model);
  const kayit = ekranId ? ekranModeliGetir(vt, ekranId) : null;
  const ekranAlanlari = kayit ? modelAlanlari(kayit.model) : null;
  const mevcutBaglar = ekranId ? ekranAlanBaglari(vt, ekranId) : {};
  const tabloAdi = (/** @type {string} */ id) => mevcutlar.find((x) => x.id === id)?.ad ?? null;
  return {
    kaynak: paketKaynakTuru(p.meta),
    tablolar: tablolar.map((t) => {
      const m = mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
      const plan = m ? birlestirmePlani(m, t) : null;
      return {
        ad: t.ad, tur: t.tur, aciklama: t.aciklama, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, karsilikSayisi: Object.keys(s.karsiliklar).length })),
        satirSayisi: t.satirlar.length, tekrarSayisi: t.tekrarSayisi,
        ornek: t.satirlar.slice(0, 5).map((d) => t.sutunlar.map((s) => (s.gizli ? null : d[s.ad] ?? null))),
        bagliAlanlar: baglantilar.filter((b) => kucuk(b.tablo) === kucuk(t.ad)).map((b) => { const a = alanlar.get(b.alanId); return a ? alanEtiketi(a) : b.alanId; }),
        // Önleme: aynı adlı tablo yoksa başlıkları aynı (esnek) mevcut tablolar — "onu kullan / yine de yeni oluştur"
        // (tek sütunluda ayırt edici başlık + örtüşen satırlar gerekir; tablo-benzerligi.mjs).
        benzer: m ? [] : benzerTablolar(t.sutunlar, mevcutlar, { ad: t.ad, satirlar: t.satirlar }).slice(0, 3).map((b) => {
          const x = /** @type {import('./tablo-deposu.mjs').Tablo} */ (mevcutlar.find((y) => y.id === b.id));
          return { id: b.id, ad: b.ad, puan: b.puan, eklenecekSatir: birlestirmePlani(x, t).eklenecek.length };
        }),
        mevcut: m && plan ? {
          id: m.id, ad: m.ad, sutunSayisi: m.sutunlar.length, satirSayisi: m.satirlar.length,
          yeniSutunlar: plan.yeniSutunlar.map((s) => s.ad), eklenecekSatir: plan.eklenecek.length
        } : null
      };
    }),
    baglantilar: baglantilar.map((b) => {
      const a = alanlar.get(b.alanId);
      const eski = mevcutBaglar[b.alanId];
      return {
        alanId: b.alanId, alanEtiketi: a ? alanEtiketi(a) : b.alanId, tablo: tablolar.find((t) => kucuk(t.ad) === kucuk(b.tablo))?.ad ?? b.tablo, sutun: b.sutun,
        // Mevcut ekranda (tekrar analiz) alan henüz modelde değilse bağlantı bulguyla birlikte bekler; bulgu kabul edilince yazılır.
        modeldeVar: ekranAlanlari ? ekranAlanlari.has(b.alanId) : true,
        mevcut: eski ? { tablo: tabloAdi(eski.tablo) ?? '(silinmiş tablo)', sutun: eski.sutun } : null
      };
    })
  };
}

/**
 * Seçim girdisi → { tablolar: Map<paket tablo adı (küçük), { islem, yeniAd }>, baglantilar: Set<alanId> }.
 * @param {unknown} secim
 */
function secimiOku(secim) {
  const s = /** @type {Nesne} */ (nesneMi(secim) ? secim : {});
  /** @type {Map<string, { islem: TabloIslemi; yeniAd: string; hedefId: string }>} */
  const tablolar = new Map();
  for (const [ad, x] of Object.entries(nesneMi(s.tablolar) ? s.tablolar : {})) {
    const o = /** @type {Nesne} */ (nesneMi(x) ? x : {});
    if (!ISLEMLER.has(o.islem)) throw new DepoHatasi(`"${ad}" tablosu için geçersiz işlem (yeni / birlestir / yeniAd / atla).`);
    tablolar.set(kucuk(ad), { islem: o.islem, yeniAd: typeof o.yeniAd === 'string' ? o.yeniAd.trim() : '', hedefId: typeof o.hedefId === 'string' ? o.hedefId : '' });
  }
  const baglantilar = new Set(Array.isArray(s.baglantilar) ? s.baglantilar.filter((x) => typeof x === 'string') : []);
  return { tablolar, baglantilar };
}

/**
 * Onaylanan seçimle tabloları ve bağlantıları yazar (çağıranın işleminde). Seçim yoksa hiçbir şey yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} paket @param {unknown} secim
 * @param {{ ertele?: (alanId: string) => boolean }} [secenekler]
 * @returns {{ tablolar: Array<{ ad: string; id: string; islem: TabloIslemi; eklenenSatir: number; eklenenSutun: number }>; baglanan: number;
 *   ertelenen: Record<string, { tablo: string; sutun: string; etiket?: string }> }}
 */
export function paketTestVerisiniYaz(vt, projeId, ekranId, paket, secim, secenekler = {}) {
  const p = /** @type {Nesne} */ (nesneMi(paket) ? paket : {});
  /** @type {ReturnType<typeof paketTestVerisiniYaz>} */
  const sonuc = { tablolar: [], baglanan: 0, ertelenen: {} };
  if (!nesneMi(p.testVerisi) || secim === undefined || secim === null) return sonuc;
  const s = secimiOku(secim);
  const { tablolar, baglantilar } = paketTablolari(p.testVerisi, p.model);
  const meta = /** @type {Nesne} */ (nesneMi(p.meta) ? p.meta : {});
  const kaynakTuru = paketKaynakTuru(meta);
  /** Yeni tablonun kaynağı; tablo türü paketten, yoksa tarama / kayıt tablosu ekran listesidir. @param {import('./paket-tablolari.mjs').PaketTablosu} t */
  const kaynak = (t) => ({
    tur: kaynakTuru, olusturan: String(meta.olusturan ?? '').slice(0, 120), olusturulma: String(meta.olusturulma ?? '').slice(0, 40),
    ...(nesneMi(meta.ekran) && typeof meta.ekran.ad === 'string' ? { ekran: meta.ekran.ad.slice(0, 120) } : {}),
    ...(t.tur ? { tabloTuru: t.tur } : kaynakTuru !== 'paket' ? { tabloTuru: 'liste' } : {}),
    yazilma: new Date().toISOString()
  });
  /** @type {Map<string, { id: string; sutun: (ad: string) => string }>} paket tablo adı (küçük) → yazılan tablo */
  const yazilan = new Map();
  for (const t of tablolar) {
    const sec = s.tablolar.get(kucuk(t.ad)) ?? { islem: /** @type {TabloIslemi} */ ('atla'), yeniAd: '', hedefId: '' };
    if (sec.islem === 'atla') continue;
    const mevcutlar = tablolariListele(vt, projeId);
    const mevcut = sec.islem === 'birlestir' && sec.hedefId ? mevcutlar.find((x) => x.id === sec.hedefId) : mevcutlar.find((x) => kucuk(x.ad) === kucuk(t.ad));
    if (sec.islem === 'yeni' || sec.islem === 'yeniAd') {
      const ad = sec.islem === 'yeniAd' ? sec.yeniAd : t.ad;
      if (!ad) throw new DepoHatasi(`"${t.ad}" tablosu için yeni ad yazın.`);
      if (sec.islem === 'yeni' && mevcut) throw new DepoHatasi(`"${t.ad}" adında bir tablo zaten var: birleştir, yeni ad ya da atla seçin.`);
      const id = tabloKaydet(vt, {
        projeId, ad, kaynak: kaynak(t),
        sutunlar: t.sutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) })),
        satirlar: t.satirlar.map((degerler) => ({ degerler: Object.fromEntries(Object.entries(degerler).filter(([, v]) => v !== null)) }))
      });
      yazilan.set(kucuk(t.ad), { id, sutun: (a) => a });
      sonuc.tablolar.push({ ad, id, islem: sec.islem, eklenenSatir: t.satirlar.length, eklenenSutun: t.sutunlar.length });
      continue;
    }
    // Birleştir: mevcut sütun ve satırlar korunur; eksik sütunlar, olmayan satırlar ve eksik karşılıklar eklenir.
    if (!mevcut) throw new DepoHatasi(`"${t.ad}" adında birleştirilecek tablo yok.`);
    const plan = birlestirmePlani(mevcut, t);
    const paketSutunu = (/** @type {string} */ mevcutAd) => t.sutunlar.find((x) => plan.eslesme.get(x.ad) === mevcutAd);
    const sutunlar = [
      ...mevcut.sutunlar.map((m) => {
        const ps = paketSutunu(m.ad);
        const eksik = ps && !m.gizli ? Object.fromEntries(Object.entries(ps.karsiliklar).filter(([d]) => !m.karsiliklar?.[d])) : {};
        return { ad: m.ad, eskiAd: m.ad, gizli: m.gizli, ...(Object.keys(eksik).length ? { karsiliklar: { ...(m.karsiliklar ?? {}), ...eksik } } : {}) };
      }),
      ...plan.yeniSutunlar.map((x) => ({ ad: x.ad, gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar }) }))
    ];
    const hedef = (/** @type {string} */ ad) => plan.eslesme.get(ad) ?? ad;
    // Kaynak verilmez: mevcut tablonun kaynağı (varsa da yoksa da) olduğu gibi kalır.
    const id = tabloKaydet(vt, {
      projeId, id: mevcut.id, ad: mevcut.ad, sutunlar,
      satirlar: plan.eklenecek.map((d) => ({ degerler: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null).map(([k, v]) => [hedef(k), v])) }))
    });
    yazilan.set(kucuk(t.ad), { id, sutun: hedef });
    sonuc.tablolar.push({ ad: mevcut.ad, id, islem: 'birlestir', eklenenSatir: plan.eklenecek.length, eklenenSutun: plan.yeniSutunlar.length });
  }
  // Bağlantılar: yalnız onaylanan alanlar ve yazılan (atlanmayan) tablolar.
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
  const yeni = {};
  for (const b of baglantilar) {
    const w = yazilan.get(kucuk(b.tablo));
    if (!w || !s.baglantilar.has(b.alanId)) continue;
    const t = tablolar.find((x) => kucuk(x.ad) === kucuk(b.tablo));
    const su = t?.sutunlar.find((x) => kucuk(x.ad) === kucuk(b.sutun));
    if (!su || su.gizli) continue;
    const bag = { tablo: w.id, sutun: w.sutun(su.ad), ...(b.etiket ? { etiket: b.etiket } : {}) };
    if (secenekler.ertele?.(b.alanId)) sonuc.ertelenen[b.alanId] = bag;
    else yeni[b.alanId] = bag;
  }
  if (Object.keys(yeni).length) {
    ekranAlanBaglariniKaydet(vt, projeId, ekranId, { ...ekranAlanBaglari(vt, ekranId), ...yeni });
    sonuc.baglanan = Object.keys(yeni).length;
  }
  return sonuc;
}
