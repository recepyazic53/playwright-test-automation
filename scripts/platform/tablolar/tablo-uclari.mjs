// TEST VERİSİ TABLOLARI — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç, gövde ve kasa
// kilidi sunucuda denetlenir. Gizli sütun değerleri hiçbir yanıtta dönmez.
import { basename } from 'node:path';
import { DepoHatasi } from '../veritabani/depo.mjs';
import { tabloSil, tablolariListele } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, tabloEkranKullanimi } from './ekran-baglari.mjs';
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { karsiliklariEkrandanAl } from './karsiliklar.mjs';
import { tabloKaydetEtkiyle } from './tablo-etkisi.mjs';
import { servisSenaryosuKosuyorMu } from '../servisler/servis-isleri.mjs';
import { kaynaklariSil, sonBirlestirmeyiGeriAl, tablolariBirlestir, veriSagligi } from './tablo-birlestirme.mjs';
import { benzerTablolar } from './tablo-benzerligi.mjs';
import { otomatikYedekAl } from '../yedek.mjs';

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
  // baglam=1: bağlam profilleri de tablo olarak (Tablolar ekranı); diğer ekranlar yalnız test verisi tablolarını görür. Tablolar
  // ekranı için ayrıca ekran adları ve tabloların hangi ekranların alan bağlarında kullanıldığı (liste gruplaması; yalnız gösterim).
  ['/platform/tablolar', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const baglamDahil = q.get('baglam') === '1';
    return { tablolar: tablolariListele(db, projeId, { baglamDahil }), ...(baglamDahil ? tabloEkranKullanimi(db, projeId) : {}) };
  }],
  // Test verisi ekranının üstündeki "Veri sağlığı" (benzer / kullanılmayan tablolar, boş sütunlar, kırık başvurular; değer dönmez).
  ['/platform/tablolar/veri-sagligi', (db, q) => veriSagligi(db, kimlik(q.get('projeId'), 'projeId'))],
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
  // TABLO BİRLEŞTİRME (tablo-birlestirme.mjs). kip 'onizle' (varsayılan): denenir + kuru doğrulama, hiçbir şey yazılmaz. kip 'uygula':
  // önizlemenin imzası (beklenenImza) gerekir; önce otomatik yedek alınır, fark / engel varsa hiçbir şey yazılmaz.
  ['/platform/tablo/birlestir', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const uygula = g.kip === 'uygula';
    const yedek = uygula ? otomatikYedekAl(db) : null;
    return tablolariBirlestir(db, projeId, {
      kalanId: kimlik(g.kalanId, 'kalanId'), kaynakIdler: g.kaynakIdler, yeniAd: typeof g.yeniAd === 'string' ? g.yeniAd : undefined,
      sutunEslemeleri: g.sutunEslemeleri, satirSecimleri: g.satirSecimleri, karsilikSecimleri: g.karsilikSecimleri,
      kip: uygula ? 'uygula' : 'onizle', beklenenImza: g.beklenenImza, yedek: yedek ? basename(yedek.dosya) : null
    }, { kosuyorMu });
  }],
  // Son birleştirmeyi geri al (kayıtlı ters işlem) / kaynak tabloları sil (ayrı onay). onay yoksa yalnız ne yapılacağı döner.
  ['/platform/tablo/birlestirme/geri-al', (db, g) => sonBirlestirmeyiGeriAl(db, kimlik(g.projeId, 'projeId'), { onay: g.onay === true })],
  ['/platform/tablo/birlestirme/kaynaklari-sil', (db, g) => kaynaklariSil(db, kimlik(g.projeId, 'projeId'), { onay: g.onay === true })],
  // Önleme: yeni tablo oluşturulmadan önce aynı / çoğu aynı başlıklı tablolar ("Benzer tablo var: X — onu kullan / yine de yeni oluştur").
  ['/platform/tablo/benzer', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const sutunlar = Array.isArray(g.sutunlar) ? g.sutunlar.filter((x) => typeof x === 'string').slice(0, 60) : [];
    const ad = typeof g.ad === 'string' ? g.ad.trim().toLocaleLowerCase('tr') : '';
    const tablolar = tablolariListele(db, projeId);
    // adVar: yazılacak ad zaten bir tablonun adı (o tabloya yazılacak; uyarı gerekmez).
    return { benzerler: benzerTablolar(sutunlar, tablolar, { ad, haricId: typeof g.haricId === 'string' ? g.haricId : '' }), adVar: Boolean(ad) && tablolar.some((t) => t.ad.toLocaleLowerCase('tr') === ad) };
  }],
  ['/platform/tablo/sil', (db, g) => ({ silindi: tabloSil(db, kimlik(g.projeId, 'projeId'), kimlik(g.id)) })]
];
