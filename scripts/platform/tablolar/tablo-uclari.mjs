// TEST VERİSİ TABLOLARI — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç, gövde ve kasa
// kilidi sunucuda denetlenir. Gizli sütun değerleri hiçbir yanıtta dönmez.
import { DepoHatasi } from '../veritabani/depo.mjs';
import { tabloSil, tablolariListele } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from './ekran-baglari.mjs';
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { karsiliklariEkrandanAl } from './karsiliklar.mjs';
import { tabloKaydetEtkiyle } from './tablo-etkisi.mjs';
import { servisSenaryosuKosuyorMu } from '../servisler/servis-isleri.mjs';

/** O an koşan ekran senaryosu denetimi (sunucu-platform.mjs koşucuyu verince ayarlar; tablo değişikliğinde koşan senaryo atlanır). */
let kosuyorMu = (/** @type {string} */ _dosya, /** @type {string} */ _ad) => false;
/** @param {(dosya: string, ad: string) => boolean} fn */
export function tabloKosuDenetimiAyarla(fn) { kosuyorMu = fn; }
/** Tablo değerini değiştiren diğer yollar (aktarımlar) için koşu denetimleri. */
export const tabloKosuDenetimi = () => ({ kosuyorMu, servisKosuyorMu: servisSenaryosuKosuyorMu });

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const TABLO_GET_UCLARI = [
  // baglam=1: bağlam profilleri de tablo olarak (Tablolar ekranı); diğer ekranlar yalnız test verisi tablolarını görür.
  ['/platform/tablolar', (db, q) => ({ tablolar: tablolariListele(db, kimlik(q.get('projeId'), 'projeId'), { baglamDahil: q.get('baglam') === '1' }) })],
  // Ekranın "Test verisi" sekmesi: input'lar, tablo bağlantıları ve tablolar.
  ['/platform/ekran/alan-baglari', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const ekranId = kimlik(q.get('ekranId'), 'ekranId');
    const { girdiler } = ekranGirdileri(db, projeId, ekranId, { tumTipler: true });
    return { baglar: ekranAlanBaglari(db, ekranId), girdiler: girdiler.map((g) => ({ id: g.id, etiket: g.etiket, tip: g.tip })), tablolar: tablolariListele(db, projeId) };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown>]>} */
export const TABLO_POST_UCLARI = [
  // etki: 'denetle' → değişen değeri düz kullanan senaryo varsa hiçbir şey yazılmaz, { onayGerekli, etki } döner; 'uygula' → tablo +
  // guncellenecekler'deki senaryolar tek işlemde ([] = yalnız tablo). Verilmezse yalnız tablo. Bkz. tablo-etkisi.mjs.
  ['/platform/tablo/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = tabloKaydetEtkiyle(db, {
      projeId, id: g.id ? kimlik(g.id) : undefined, ad: typeof g.ad === 'string' ? g.ad : '', sutunlar: g.sutunlar, satirlar: g.satirlar, silinenSatirlar: g.silinenSatirlar,
      etki: g.etki, guncellenecekler: g.guncellenecekler
    }, { kosuyorMu, servisKosuyorMu: servisSenaryosuKosuyorMu });
    if (s.onayGerekli) return { onayGerekli: true, etki: s.etki };
    const [tablo] = tablolariListele(db, projeId, { tabloId: s.id, baglamDahil: true });
    return { tablo, etki: s.etki, ...(s.guncelleme ? { guncelleme: s.guncelleme } : {}) };
  }],
  // Bağlantı kaydedilince bağlı sütunlara ekran modelindeki eksik sayfa değerleri eklenir (karsiliklar.mjs).
  ['/platform/ekran/alan-baglari/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const ekranId = kimlik(g.ekranId, 'ekranId');
    const baglar = ekranAlanBaglariniKaydet(db, projeId, ekranId, g.baglar);
    return { baglar, karsiliklar: karsiliklariEkrandanAl(db, projeId, ekranId) };
  }],
  ['/platform/ekran/karsiliklari-al', (db, g) => karsiliklariEkrandanAl(db, kimlik(g.projeId, 'projeId'), kimlik(g.ekranId, 'ekranId'))],
  ['/platform/tablo/sil', (db, g) => ({ silindi: tabloSil(db, kimlik(g.projeId, 'projeId'), kimlik(g.id)) })]
];
