// TEST VERİSİ TABLOLARI — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç, gövde ve kasa
// kilidi sunucuda denetlenir. Gizli sütun değerleri hiçbir yanıtta dönmez.
import { basename } from 'node:path';
import { acikAnahtar } from '../kasa.mjs';
import { onbellekte } from '../veritabani/nesil-onbellegi.mjs';
import { DepoHatasi, ekranModeliGetir } from '../veritabani/depo.mjs';
import { tabloGrubuDogrula, tabloSil, tablolaraGrupAta, tablolariListele, tabloTuruGecerliMi } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, kullanilanOrtakAkislar, ortakAkisBaglari, tabloEkranKullanimi } from './ekran-baglari.mjs';
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { karsiliklariEkrandanAl } from './karsiliklar.mjs';
import { tabloKaydetEtkiyle } from './tablo-etkisi.mjs';
import { servisSenaryosuKosuyorMu } from '../servisler/servis-isleri.mjs';
import { birlestirmeGecmisi, birlestirmeyiGeriAl, kaynaklariSil, tablolariBirlestir, veriSagligi } from './tablo-birlestirme.mjs';
import { benzerTablolar } from './tablo-benzerligi.mjs';
import { kisiAlanlariniBagla } from './kisi-baglama.mjs';
import { otomatikEslestir, otomatikEslestirmeyiGeriAl } from './otomatik-eslestirme.mjs';
import { otomatikYedekAl } from '../yedek.mjs';
import { kismiMaske } from './tablo-secimi.mjs';
import { kosulBasvurulari, kosulHaritasi } from '../arayuz/senaryo-dallari.mjs';

/** O an koşan ekran senaryosu denetimi (sunucu-platform.mjs koşucuyu verince ayarlar; tablo değişikliğinde koşan senaryo atlanır). */
let kosuyorMu = (/** @type {string} */ _dosya, /** @type {string} */ _ad) => false;
/** @param {(dosya: string, ad: string) => boolean} fn */
export function tabloKosuDenetimiAyarla(fn) { kosuyorMu = fn; }
/** Tablo değerini değiştiren diğer yollar (aktarımlar) için koşu denetimleri. */
export const tabloKosuDenetimi = () => ({ kosuyorMu, servisKosuyorMu: servisSenaryosuKosuyorMu });

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/**
 * Modelin alan yapısı: alan → bölüm kimliği (adımdaki bölüm; senaryo düzeyi "senaryo") ve alan → görünürlüğünü belirleyen alanlar.
 * @param {unknown} model @returns {{ bolum: Map<string, string>; kosul: Map<string, string[]> }}
 */
function alanYapisi(model) {
  /** @type {Map<string, string>} */
  const bolum = new Map();
  /** @type {Map<string, string[]>} */
  const kosul = new Map();
  const m = /** @type {Record<string, any>} */ (model && typeof model === 'object' ? model : {});
  const adimlar = [...(Array.isArray(m.adimlar) ? m.adimlar : []), ...(Array.isArray(m.akislar) ? m.akislar.flatMap((/** @type {any} */ a) => (a && Array.isArray(a.adimlar) ? a.adimlar : [])) : [])];
  for (const adim of adimlar) {
    for (const b of adim && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of b && Array.isArray(b.alanlar) ? b.alanlar : []) if (a && typeof a.id === 'string' && !bolum.has(a.id)) bolum.set(a.id, `${String(adim.id)}/${String(b.id)}`);
    }
  }
  for (const a of m.senaryoDuzeyi && Array.isArray(m.senaryoDuzeyi.alanlar) ? m.senaryoDuzeyi.alanlar : []) if (a && typeof a.id === 'string' && !bolum.has(a.id)) bolum.set(a.id, 'senaryo');
  for (const [id, ifade] of kosulHaritasi(m)) kosul.set(id, [...kosulBasvurulari(ifade).keys()].filter((x) => x !== id));
  return { bolum, kosul };
}

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d @param {string} alan */
const istegeBagliKimlik = (d, alan) => (d === undefined || d === null || d === '' ? undefined : kimlik(d, alan));

/**
 * Satır seçimi için tablolar: gizli sütun değeri null, yanında yalnız kısmi maskesi (satır.gizliMaskeleri: sütun → "4•••••8").
 * @param {Veritabani} db @param {string} projeId
 */
export function secimTablolari(db, projeId) {
  return tablolariListele(db, projeId, { cozulsun: true }).map((t) => {
    const gizliler = t.sutunlar.filter((c) => c.gizli).map((c) => c.ad);
    if (!gizliler.length) return t;
    return {
      ...t,
      satirlar: t.satirlar.map((r) => {
        /** @type {Record<string, string>} */
        const gizliMaskeleri = {};
        const degerler = { ...r.degerler };
        for (const ad of gizliler) {
          const d = degerler[ad];
          if (d !== null && d !== undefined && d !== '') gizliMaskeleri[ad] = kismiMaske(d);
          degerler[ad] = null;
        }
        return { ...r, degerler, gizliMaskeleri };
      })
    };
  });
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const TABLO_GET_UCLARI = [
  // baglam=1: bağlam profilleri de tablo olarak (Tablolar ekranı); diğer ekranlar yalnız test verisi tablolarını görür. Tablolar
  // ekranı için ayrıca ekran adları ve tabloların hangi ekranların alan bağlarında kullanıldığı (liste gruplaması; yalnız gösterim).
  // secim=1 (senaryo formunun satır seçimi): gizli sütunların değeri null kalır; yalnız KISMİ maskesi (ilk + son karakter,
  // kismiMaske) satırın gizliMaskeleri'nde döner. Tam gizli değer bu yanıtta da yoktur.
  ['/platform/tablolar', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    if (q.get('secim') === '1') return { tablolar: secimTablolari(db, projeId) };
    const baglamDahil = q.get('baglam') === '1';
    return { tablolar: tablolariListele(db, projeId, { baglamDahil }), ...(baglamDahil ? tabloEkranKullanimi(db, projeId) : {}) };
  }],
  // Test verisi ekranının üstündeki "Veri sağlığı" (benzer / kullanılmayan tablolar, boş sütunlar, kırık başvurular; değer dönmez).
  // Veri sağlığı özeti önbellekli (nesil-onbellegi.mjs): veritabanında herhangi bir değişiklik olunca yeniden hesaplanır; yanıt kopyadır.
  ['/platform/tablolar/veri-sagligi', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    acikAnahtar(db);
    return structuredClone(onbellekte(db, `veriSagligi\u0000${projeId}`, () => veriSagligi(db, projeId)));
  }],
  // Birleştirme geçmişi (yeniden eskiye; değer ve ham kayıt içermez): durum, geri alınabilir mi / neden, kaynaklar silinebilir mi.
  ['/platform/tablo/birlestirme/gecmis', (db, q) => birlestirmeGecmisi(db, kimlik(q.get('projeId'), 'projeId'))],
  // Ekranın "Test verisi" sekmesi: input'lar (senaryo ayarları dahil), ekranın KENDİ tablo bağlantıları, kullandığı ortak akışlardan gelen (varsayılan)
  // bağlar ve tablolar. ortakAkis: bu sayfa bir ortak akışın (bağları onu kullanan ekranlara geçer; senaryo dönüşümleri yok).
  ['/platform/ekran/alan-baglari', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const ekranId = kimlik(q.get('ekranId'), 'ekranId');
    const { girdiler } = ekranGirdileri(db, projeId, ekranId, { tumTipler: true, modelSecenekleri: true });
    const model = ekranModeliGetir(db, ekranId);
    // kaynak: alan ekranın kullandığı bir genel senaryodan (ortak akış) geliyorsa o genel senaryo { id, ad }; ortak akışın alan
    // kimlikleri ekrana açılınca değişmez. Aynı alan iki genel senaryoda varsa akıştaki ilki. Genel senaryonun kendi sayfasında yok.
    /** @type {Map<string, { id: string; ad: string }>} */
    const kaynaklar = new Map();
    for (const o of kullanilanOrtakAkislar(db, ekranId)) {
      for (const og of ekranGirdileri(db, projeId, o.id, { tumTipler: true }).girdiler) if (!kaynaklar.has(String(og.id))) kaynaklar.set(String(og.id), o);
    }
    // Seçime göre bağın kontrol adayları için (ekran-baglari.js): alanın bölümü ve görünürlüğünü etkileyen alanlar (senaryo-dallari.mjs).
    const yapi = alanYapisi(model ? model.model : null);
    return {
      baglar: ekranAlanBaglari(db, ekranId), ortakBaglar: ortakAkisBaglari(db, ekranId), ortakAkis: Boolean(model && model.model && model.model.tur === 'ortakAkis'),
      // senaryoAyari: ekranda karşılığı olmayan, akışı dallandıran seçim (rozetle gösterilir; tablodaki değer koda çevrilir).
      // modeldeSecenek: seçim alanının seçenekleri ekran modelinde zaten tanımlı (tabloya bağlamak gerekmez; "bağlı değil" uyarısı verilmez).
      girdiler: girdiler.map((g) => ({
        id: g.id, etiket: g.etiket, tip: g.tip, ...(g.senaryoAyari ? { senaryoAyari: true } : {}),
        ...(yapi.bolum.has(String(g.id)) ? { bolum: yapi.bolum.get(String(g.id)) } : {}),
        ...(yapi.kosul.get(String(g.id))?.length ? { kosulAlanlari: yapi.kosul.get(String(g.id)) } : {}),
        // Seçenekli seçim / radyo: seçime göre bağın kontrolü olabilir (seçenek değeri + metni).
        ...(g.tip === 'secim' && Array.isArray(g.secenekler) && g.secenekler.length ? { secenekler: g.secenekler.map((x) => ({ deger: x.deger, metin: x.metin })) } : {}),
        ...(g.tip === 'secim' && Array.isArray(g.secenekler) && g.secenekler.length ? { modeldeSecenek: true } : {}),
        // modelSecenekleri + seceneklerDurumu (tablo listesi uygulanmamış, sayfadaki seçenekler): bağ seçilirken sütun değerleri bunlarla
        // anında karşılaştırılır (tablo-uyumu.mjs; sunucuyla aynı kural).
        ...(g.modelSecenekleri && g.modelSecenekleri.length ? { modelSecenekleri: g.modelSecenekleri, ...(g.seceneklerDurumu ? { seceneklerDurumu: g.seceneklerDurumu } : {}) } : {}),
        ...(kaynaklar.has(String(g.id)) ? { kaynak: kaynaklar.get(String(g.id)) } : {})
      })), tablolar: tablolariListele(db, projeId)
    };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown>]>} */
export const TABLO_POST_UCLARI = [
  // etki: 'denetle' → değişen değeri düz kullanan senaryo varsa hiçbir şey yazılmaz, { onayGerekli, etki } döner; 'uygula' → tablo +
  // guncellenecekler'deki senaryolar tek işlemde ([] = yalnız tablo). Verilmezse yalnız tablo. Bkz. tablo-etkisi.mjs.
  ['/platform/tablo/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (g.tur !== undefined && g.tur !== null && !tabloTuruGecerliMi(g.tur)) throw new DepoHatasi('Tablo türü geçersiz: kayıt, liste ya da servis olmalıdır.');
    const s = tabloKaydetEtkiyle(db, {
      projeId, id: g.id ? kimlik(g.id) : undefined, ad: typeof g.ad === 'string' ? g.ad : '', sutunlar: g.sutunlar, satirlar: g.satirlar, silinenSatirlar: g.silinenSatirlar,
      // Tablo türü ('kayit' | 'liste' | 'servis'; isteğe bağlı): kaynak.tabloTuru (tablo-deposu.mjs). Başka değer yukarıda reddedilir.
      ...(tabloTuruGecerliMi(g.tur) ? { tur: g.tur } : {}),
      // Grup (isteğe bağlı kullanıcı metni, en çok 40 karakter): kaynak.grup. Verilmezse değişmez; null / '' kaldırır.
      ...(g.grup !== undefined ? { grup: tabloGrubuDogrula(g.grup) } : {}),
      etki: g.etki, guncellenecekler: g.guncellenecekler
    }, { kosuyorMu, servisKosuyorMu: servisSenaryosuKosuyorMu });
    if (s.onayGerekli) return { onayGerekli: true, etki: s.etki };
    const [tablo] = tablolariListele(db, projeId, { tabloId: s.id, baglamDahil: true });
    return { tablo, etki: s.etki, ...(s.guncelleme ? { guncelleme: s.guncelleme } : {}) };
  }],
  // Toplu grup atama: { projeId, tabloIdler: [id], grup } — grup null / '' kaldırır. Tablonun başka bilgisi değişmez.
  ['/platform/tablo/grup-ata', (db, g) => tablolaraGrupAta(db, kimlik(g.projeId, 'projeId'), g.tabloIdler, g.grup)],
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
  // Geçmişteki bir birleştirmeyi geri al (kayıtlı ters işlem) / kaynak tabloları sil (ayrı onay). onay yoksa yalnız ne yapılacağı döner.
  // birlestirmeId: geçmişteki kayıt (yoksa en yeni etkin birleştirme).
  ['/platform/tablo/birlestirme/geri-al', (db, g) => birlestirmeyiGeriAl(db, kimlik(g.projeId, 'projeId'), { birlestirmeId: istegeBagliKimlik(g.birlestirmeId, 'birlestirmeId'), onay: g.onay === true })],
  ['/platform/tablo/birlestirme/kaynaklari-sil', (db, g) => kaynaklariSil(db, kimlik(g.projeId, 'projeId'), { birlestirmeId: istegeBagliKimlik(g.birlestirmeId, 'birlestirmeId'), onay: g.onay === true })],
  // Önleme: yeni tablo oluşturulmadan önce aynı / çoğu aynı başlıklı tablolar ("Benzer tablo var: X — onu kullan / yine de yeni oluştur").
  ['/platform/tablo/benzer', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const sutunlar = Array.isArray(g.sutunlar) ? g.sutunlar.filter((x) => typeof x === 'string').slice(0, 60) : [];
    const ad = typeof g.ad === 'string' ? g.ad.trim().toLocaleLowerCase('tr') : '';
    // Satırlar (yalnız tek sütunlu tabloda örtüşme için; sütun adı → değer): değerler yanıtta dönmez.
    const satirlar = Array.isArray(g.satirlar) ? g.satirlar.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).slice(0, 500) : [];
    const tablolar = tablolariListele(db, projeId);
    // adVar: yazılacak ad zaten bir tablonun adı (o tabloya yazılacak; uyarı gerekmez).
    return { benzerler: benzerTablolar(sutunlar, tablolar, { ad, haricId: typeof g.haricId === 'string' ? g.haricId : '', satirlar }), adVar: Boolean(ad) && tablolar.some((t) => t.ad.toLocaleLowerCase('tr') === ad) };
  }],
  // Kişi alanlarını tabloya bağlama (kisi-baglama.mjs): onay yoksa yalnız plan (değer gösterilmez); onayla bağlar + yeni satırlar +
  // senaryo dönüşümü tek işlemde.
  ['/platform/ekran/kisi-baglama', (db, g) => kisiAlanlariniBagla(db, kimlik(g.projeId, 'projeId'), {
    ekranId: kimlik(g.ekranId, 'ekranId'), tabloId: typeof g.tabloId === 'string' && g.tabloId ? kimlik(g.tabloId, 'tabloId') : null,
    eslemeler: g.eslemeler && typeof g.eslemeler === 'object' && !Array.isArray(g.eslemeler) ? g.eslemeler : undefined,
    yeniSatirlar: g.yeniSatirlar && typeof g.yeniSatirlar === 'object' && !Array.isArray(g.yeniSatirlar) ? g.yeniSatirlar : undefined,
    etiketler: g.etiketler && typeof g.etiketler === 'object' && !Array.isArray(g.etiketler) ? g.etiketler : undefined,
    onay: g.onay === true, secimler: g.secimler
  }, { kosuyorMu })],
  // Otomatik eşleştirme (otomatik-eslestirme.mjs): onay yoksa yalnız öneri önizlemesi (değer dönmez); onayla seçilen alanların bağı yazılır
  // (önceki bağlar yanıtta döner); geri-al yalnız o alanların bağını öncekine döndürür.
  ['/platform/ekran/otomatik-eslestir', (db, g) => otomatikEslestir(db, kimlik(g.projeId, 'projeId'), { ekranId: kimlik(g.ekranId, 'ekranId'), onay: g.onay === true, secimler: g.secimler })],
  ['/platform/ekran/otomatik-eslestir/geri-al', (db, g) => otomatikEslestirmeyiGeriAl(db, kimlik(g.projeId, 'projeId'), { ekranId: kimlik(g.ekranId, 'ekranId'), alanlar: g.alanlar, onceki: g.onceki })],
  ['/platform/tablo/sil', (db, g) => ({ silindi: tabloSil(db, kimlik(g.projeId, 'projeId'), kimlik(g.id)) })]
];
