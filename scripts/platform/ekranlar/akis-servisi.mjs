// EKRAN AKIŞLARI (genel) — bir ekranın birden çok akışı (model.akislar; bkz. model-formu.mjs > akisModeli): listeleme,
// akış diyagramını modelden kurma (düzenleme / kopyalama / boş), kaydetme, varsayılan yapma, silme. Her değişiklik YENİ bir
// model sürümüdür (Model geçmişinde görünür); etkilenen senaryolar kaydetmeden önce gösterilir ve onay istenir.
//
//  - Diyagram, kayıttan sonraki diyagramla AYNI bloklarla kurulur (tarama/akis-tasarimi.mjs): modelin tüm akışlarındaki
//    alanlar/düğmeler/mesajlar "kayıtta yakalananlar" gibi sağ listeye gelir (YALNIZCA bu ekranın modeli — başka ekranın
//    alanı hiçbir zaman gelmez). Kaydedilen bloklar aynı çeviriyle (akistanKayitEnvanteri → kayitPaketiOlustur) adımlara
//    dönüşür; alanlar seçiciyle modeldeki mevcut tanımlarıyla (kimlik, seçenekler, koşul) eşleşir.
//  - Diyagramın gösteremediği parçalar (alt model adımı, seçicisiz alan, kod yöntemi, adres başarı göstergesi, düğmeli adımın
//    seçime bağlı görünürlüğü, alanlı + düğmeli isteğe bağlı adım, metinle süzülen tıklama, öğeye bağlı bekleme…) akışı
//    kilitlemez: salt okunur "korunan" blok / rozet olarak gösterilir, kaydederken modeldeki hâliyle AYNEN geri yazılır
//    (akisKorumasi → korunanParcalari → kayitPaketiOlustur; korunanDenetimi). Dayandığı alan akıştan çıkarılırsa kayıt anlaşılır
//    hatayla reddedilir; korunan parça silinirse onayda listelenir (etki.korunanSilinen). Yalnız korunamayan durumda (kimliksiz
//    ya da aynı kimlikli adım) akış görüntülenir, düzenlenmez (neden döner).
//  - Alanın "Doldurduktan sonra" tuşu (doldurucuParametreleri.tus: Tab / Enter) alan grubunun tuslar'ında gelir ve kaydedilir;
//    düğmesiz adımın göstergesi / uyarıları alan grubundan sonraki beklenen mesaj bloklarıdır (alandan çıkınca çıkan mesajlar).
//  - Ortak akış (tur "ortakAkis"): tek akışı vardır; içeriği aynı diyagramla düzenlenir (içine ortak akış
//    eklenmez). Kaydedince onu kullanan ekranlar etki olarak gösterilir (ekranlar ortak akışın hep son sürümüyle koşar).
//    ortakAkisEkranlaraEkle: ortak akışı seçilen ekranların varsayılan akışının sonuna ekler (her ekran için yeni sürüm; boş
//    ortak akış eklenmez). bosOrtakAkisOlustur: "Boş başla" — adımı olmayan ortak akış; adımları bu diyagramdan eklenir.
//  - Elle öğeler: kayıtta / modelde olmayan alan ve düğmeler diyagramda elle tanımlanabilir (etiket / yazı + seçici; akisKaydet >
//    elleOgeler → tarama/akis-tasarimi.mjs > elleOgeleriEkle); kaydedilince modele yazılır. Ekran ve ortak akış için aynıdır.
//  - Varsayılan akış model.adimlar'dır; varsayılan değişince akışı yazılı olmayan senaryolara eski varsayılan yazılır (akışları
//    değişmesin). Senaryosu olan ya da varsayılan akış silinemez.
// NOT: import.meta KULLANILMAZ. Tipler: akis-servisi.d.mts.

import { etiketMetni } from '../tablolar/secime-gore-bag.mjs';
import { DepoHatasi, ekranKaydet, ekranModeliEkle, ekranModeliGetir, ekranlariListele, senaryoGetir, senaryoKaydet as depoSenaryoKaydet } from '../veritabani/depo.mjs';
import { ANA_AKIS_ID, akisListesi, akisModeli } from '../senaryolar/model-formu.mjs';
import { senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { ALAN_TUSLARI, akisPaleti, akistanKayitEnvanteri, bloklariAyikla, elleOgeleriEkle } from '../tarama/akis-tasarimi.mjs';
import { ekranAnahtariOner, kayitPaketiOlustur, kimlikUret } from '../tarama/paket-olusturucu.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';
import { EkranDogrulamaHatasi, modeliDogrula } from './ekran-servisi.mjs';
import { EKRAN_ANAHTARI_DESENI } from './sayfa-paketi.mjs';
import { bagsizKosulUyarilari, sinirHatalari } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { paketTestVerisiOnizle, paketTestVerisiniYaz } from '../tablolar/paket-test-verisi.mjs';
import { gorunurseSatiriMi, gorunurseVar, ifadedenSatirlar } from '../tarama/gorunurluk-kosulu.mjs';
import { etkinAlanBaglari, ekranAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

const AD_EN_COK = 80;
/** Değer kuralı (alan.sinirlar) yazılabilen alan tipleri. */
const SINIRLI_TIPLER = ['sayi', 'tarih', 'metin', 'telefon'];
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kopya = (/** @type {any} */ d) => JSON.parse(JSON.stringify(d));
const etiketi = (/** @type {Nesne} */ a) => etiketMetni(a.etiket, a.id);
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

/**
 * Akış diyagramda düzenlenebilir mi? (neden: düzenlenemezse Türkçe açıklama) Diyagramın gösteremediği parçalar artık akışı
 * kilitlemez: salt okunur "korunan" parça olarak gösterilir ve kaydederken aynen geri yazılır (akisKorumasi). Yalnız
 * korunması imkânsız durumda kilit sürer: adımı kimliksiz (korunan parça ona başvuramaz) ya da bir akışta aynı kimlikli iki adım.
 * @param {Nesne} model
 */
export function akisDuzenlenebilirMi(model) {
  for (const akis of akisListesi(model)) {
    const m = akisModeli(model, akis.id);
    const gorulen = new Set();
    for (const adim of nesneMi(m) && Array.isArray(m.adimlar) ? m.adimlar : []) {
      if (!nesneMi(adim) || typeof adim.id !== 'string' || !adim.id) {
        return { duzenlenebilir: false, neden: `“${akis.ad}” akışında kimliği olmayan bir adım var; diyagramda gösterilemediği için korunamaz (kaydedilince kaybolurdu). Bu ekranın akışı görüntülenir, düzenlenmez; ekran paketiyle güncelleyin.` };
      }
      if (gorulen.has(adim.id)) {
        return { duzenlenebilir: false, neden: `“${akis.ad}” akışında “${adim.id}” kimliği iki adımda var; korunan parçalar adıma kimliğiyle bağlandığı için bu ekranın akışı görüntülenir, düzenlenmez.` };
      }
      gorulen.add(adim.id);
    }
  }
  return { duzenlenebilir: true, neden: null };
}

/** Diyagramın kendi bloğuyla kurduğu özel adım (ortak akış / SQL / dosya / yeniden giriş). @param {Nesne} adim */
const ozelAdimMi = (adim) => (nesneMi(adim.ortakAkis) && typeof adim.ortakAkis.dosya === 'string') || nesneMi(adim.sqlKontrolu) || nesneMi(adim.dosyaKontrolu) || nesneMi(adim.yenidenGiris);
const TIKLA_ANAHTARLARI = ['tur', 'secici', 'aciklama', 'cerceve'];
/** Aksiyon diyagramın aksiyon / bekleme bloğuyla gösterilebilir mi (seçicili düz tıklama, süreli bekleme)? @param {unknown} a */
const aksiyonTemsilEdilir = (a) => nesneMi(a) && (
  (a.tur === 'tikla' && typeof a.secici === 'string' && a.secici !== '' && Object.keys(a).every((k) => TIKLA_ANAHTARLARI.includes(k)))
  || (gorunurseMi(a) && typeof a.secici === 'string' && a.secici !== '' && (a.zamanAsimiSn === undefined || Number.isInteger(a.zamanAsimiSn))
    && Object.keys(a).every((k) => TIKLA_ANAHTARLARI.includes(k) || k === 'kosul' || k === 'zamanAsimiSn'))
  || (a.tur === 'bekle' && Number.isInteger(a.sureSn) && Object.keys(a).every((k) => k === 'tur' || k === 'sureSn'))
  || (a.tur === 'git' && typeof a.yol === 'string' && a.yol !== '' && Object.keys(a).every((k) => k === 'tur' || k === 'yol')));
/** "Yalnız görünürse bas" tıklaması mı? @param {unknown} a */
const gorunurseMi = (a) => nesneMi(a) && a.tur === 'tikla' && a.kosul === 'gorunurse';
/**
 * Adımın aksiyonları diyagramda gösterilebilir mi: her biri tek tek gösterilebilir ve "görünürse" tıklamalar adımın (her
 * senaryoda basılan) ilerleme düğmesinden SONRA gelir (ardından düz tıklama yok); görünürlük koşullu adımda görünürse tıklama
 * gösterilmez (aynen korunur). @param {Nesne} adim @param {unknown[]} aksiyonlar
 */
const aksiyonlarTemsilEdilir = (adim, aksiyonlar) => {
  if (!aksiyonlar.every(aksiyonTemsilEdilir)) return false;
  // "Şu adrese git" yalnız kendi adımı olarak gösterilir (tek aksiyon, alanı ve görünürlük koşulu yok); başka aksiyonlarla / alanlarla
  // karışıksa (elle yazılmış model) aynen korunur.
  if (aksiyonlar.some((x) => nesneMi(x) && x.tur === 'git')) {
    const alanli = (Array.isArray(adim.bolumler) ? adim.bolumler : []).some((b) => nesneMi(b) && Array.isArray(b.alanlar) && b.alanlar.some((x) => nesneMi(x) && !['buton', 'cikti'].includes(x.tip)));
    return aksiyonlar.length === 1 && !alanli && !nesneMi(adim.gorunurluk);
  }
  const ilkGorunurse = aksiyonlar.findIndex(gorunurseMi);
  if (ilkGorunurse < 0) return true;
  const duzler = aksiyonlar.map((x, i) => (nesneMi(x) && x.tur === 'tikla' && !gorunurseMi(x) ? i : -1)).filter((i) => i >= 0);
  return !nesneMi(adim.gorunurluk) && duzler.length > 0 && duzler.every((i) => i < ilkGorunurse);
};
/** Başarı göstergesi diyagramın mesaj bloklarıyla (ya da sonraki adımdan) yeniden kurulabilir mi? @param {unknown} g @param {boolean} sonAdim */
const gostergeTemsilEdilir = (g, sonAdim) => {
  if (g === undefined || g === null) return true;
  if (!nesneMi(g)) return false;
  const liste = g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  // Son adımın öğe göstergesi ("öğe görününce bitti") diyagramda "öğe" işaretli mesaj bloğudur; ara adımlarınki sonraki adımdan kurulur.
  return liste.length > 0 && liste.every((s) => nesneMi(s) && typeof s.deger === 'string' && (s.tur === 'metin' || s.tur === 'desen' || (s.tur === 'eleman' && (!sonAdim || s.deger !== ''))));
};
/** Görünürlüğün ifadesi (adlandırılmış koşul ya da doğrudan ifade). @param {Nesne} model @param {unknown} g */
const gorunurlukIfadesi = (model, g) => (nesneMi(g) ? (typeof g.kosul === 'string' ? model.kosullar?.[g.kosul]?.ifade : g.ifade) : undefined);
/**
 * Seçim alanına (ya da onay kutusuna: esit true / false → "true" / "false") bağlı basit koşul → { secim, degerler } (diyagramın
 * koşul biçimi), değilse null. @param {unknown} ifade
 */
const secimKosulu = (ifade) => (nesneMi(ifade) && typeof ifade.alan === 'string' && (Array.isArray(ifade.icinde) || typeof ifade.esit === 'string' || typeof ifade.esit === 'boolean')
  ? { secim: ifade.alan, degerler: Array.isArray(ifade.icinde) ? ifade.icinde.map(String) : [String(ifade.esit)] } : null);

/**
 * Görünürlük ifadesinin diyagram koşulu (düzenleyicide açılır): seçim alanına bağlı basit koşul eski biçimde ({ secim, degerler };
 * geri uyum), =, ≠, dolu, boş satırlarından oluşan tek düzey VE / VEYA yeni biçimde (gorunurluk-kosulu.mjs). Satırın alanı
 * diyagramda gösterilen (korunmayan) bir alan ya da bu modelde olmayan — genel senaryodan gelen — alan olmalı (ortak: true).
 * Gösterilemiyorsa null (koşul salt okunur, modeldeki hâliyle korunur).
 * @param {unknown} ifade @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env @param {Set<string>} korunanAlanlar
 * @param {Map<string, string>} modelAlanlari modelin (tüm akışlar + senaryo düzeyi) alan kimlikleri → etiket
 * @returns {import('../tarama/akis-tasarimi.d.mts').AkisKosulu | null}
 */
function diyagramKosulu(ifade, env, korunanAlanlar, modelAlanlari) {
  const eski = secimKosulu(ifade);
  if (eski && !korunanAlanlar.has(eski.secim) && kosulTemsilEdilir(env, eski)) return eski;
  const ks = ifadedenSatirlar(ifade);
  if (!ks) return null;
  for (const s of ks.satirlar) {
    if (gorunurseSatiriMi(s)) continue; // "ekranda görünürse": alanı yok
    if (!modelAlanlari.has(s.alan)) { s.ortak = true; continue; }
    if (korunanAlanlar.has(s.alan) || !env.alanlar.some((x) => x.alan.anahtar === s.alan)) return null;
  }
  return ks;
}

/** Modeldeki alanların kimlik → etiket haritası (tüm akışlar + senaryo düzeyi). @param {Nesne} model */
function alanEtiketleri(model) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const adim of tumAdimlar(model)) for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) m.set(String(a.id), String(etiketi(a)));
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) if (nesneMi(a)) m.set(String(a.id), String(etiketi(a)));
  return m;
}

/** Koşul ifadesinin okunur özeti. @param {unknown} ifade @param {Map<string, string>} etiketler @returns {string} */
function ifadeOzeti(ifade, etiketler) {
  if (!nesneMi(ifade)) return '';
  const ad = (/** @type {string} */ id) => `“${etiketler.get(id) ?? id}”`;
  for (const bag of ['ve', 'veya']) if (Array.isArray(ifade[bag])) return ifade[bag].map((x) => ifadeOzeti(x, etiketler)).filter(Boolean).join(bag === 've' ? ' ve ' : ' veya ');
  if (nesneMi(ifade.degil)) return `değil (${ifadeOzeti(ifade.degil, etiketler)})`;
  if (typeof ifade.alan === 'string' && typeof ifade.dolu === 'boolean') return `${ad(ifade.alan)} ${ifade.dolu ? 'dolu' : 'boş'}`;
  if (typeof ifade.alan === 'string') return `${ad(ifade.alan)} = ${Array.isArray(ifade.icinde) ? ifade.icinde.join(' / ') : String(ifade.esit)}`;
  if (typeof ifade.senaryoAyari === 'string') return `senaryo ayarı ${ad(ifade.senaryoAyari)} ${ifade.esit === false ? 'seçili değilse' : 'seçiliyse'}`;
  if (ifade.calismaZamani === 'gorunurse') return 'çalışma anında görünürse';
  if (nesneMi(ifade.baglam)) return `bağlam: ${String(ifade.baglam.alanSeti)}`;
  return JSON.stringify(ifade).slice(0, 120);
}
/** Görünürlüğün okunur özeti (koşulun açıklaması, yoksa ifadesi). @param {Nesne} model @param {unknown} g @param {Map<string, string>} etiketler */
function gorunurlukOzeti(model, g, etiketler) {
  if (!nesneMi(g)) return '';
  const k = typeof g.kosul === 'string' ? model.kosullar?.[g.kosul] : null;
  if (nesneMi(k) && typeof k.aciklama === 'string' && k.aciklama) return k.aciklama;
  return ifadeOzeti(gorunurlukIfadesi(model, g), etiketler) || (typeof g.kosul === 'string' ? g.kosul : 'özel koşul');
}
/**
 * Bölümün diyagramda düzenlenmeyen özelliklerinin (id / baslik / alanlar dışındaki her anahtar) okunur özeti; yoksa null.
 * kosullu: bölüm görünürlük koşullu mu. @param {Nesne} model @param {Nesne} b @param {Map<string, string>} etiketler
 * @returns {{ kosullu: boolean; ozet: string } | null}
 */
function bolumOzeti(model, b, etiketler) {
  const anahtarlar = Object.keys(b).filter((k) => !['id', 'baslik', 'alanlar'].includes(k) && b[k] !== undefined && b[k] !== null);
  if (!anahtarlar.length) return null;
  const parcalar = anahtarlar.map((k) => (k === 'gorunurluk' ? `görünürlük koşulu: ${gorunurlukOzeti(model, b.gorunurluk, etiketler)}`
    : k === 'pomMetodu' ? `kod yöntemi (${String(b.pomMetodu)})` : `“${k}” özelliği`));
  return { kosullu: nesneMi(b.gorunurluk), ozet: `“${String(b.baslik || b.id)}” bölümü — ${parcalar.join('; ')}` };
}
/** Başarı göstergesinin okunur özeti. @param {unknown} g @returns {string} */
function gostergeOzeti(g) {
  if (!nesneMi(g)) return '';
  if (g.tur === 'veya' && Array.isArray(g.secenekler)) return g.secenekler.map(gostergeOzeti).filter(Boolean).join(' veya ');
  if (g.tur === 'url') return `adres “${String(g.deger)}” açılır`;
  if (g.tur === 'eleman') return `“${String(g.deger)}” öğesi görünür`;
  if (g.tur === 'metin') return `“${String(g.deger)}” metni görünür`;
  if (g.tur === 'desen') return `/${String(g.deger)}/ kalıbı görünür`;
  return `${String(g.tur)} göstergesi`;
}
/** Koşu aksiyonunun okunur özeti. @param {unknown} a @returns {string} */
function aksiyonOzeti(a) {
  if (!nesneMi(a)) return 'bilinmeyen aksiyon';
  const sure = a.zamanAsimiSn !== undefined ? ` (en çok ${String(a.zamanAsimiSn)} sn)` : '';
  if (a.tur === 'tikla') return `“${String(a.aciklama || a.secici || '?')}” düğmesine bas${typeof a.metin === 'string' ? ` (yazısı “${a.metin}” olan)` : ''}${sure}`;
  if (a.tur === 'bekle' && Number.isInteger(a.sureSn) && a.secici === undefined) return `${a.sureSn} sn bekle`;
  if (a.tur === 'bekle') return `“${String(a.secici ?? a.metin ?? '?')}” ${a.durum === 'gizli' ? 'gizlenene' : a.durum === 'dolu' ? 'dolana' : 'görünene'} kadar bekle${sure}`;
  if (a.tur === 'ekranaDon') return 'ekranın adresine dön';
  if (a.tur === 'git') return `Şu adrese git: ${String(a.yol ?? '?')}`;
  return `${String(a.tur)} aksiyonu`;
}

/**
 * Bir akışın adımlarının KORUMA analizi: diyagramın gösteremediği (kaydedince kaybolacak) her parça. Adım başına:
 *  - tam: adımın diyagramda düzenlenecek içeriği yok (alt model adımı, yalnız öğe beklemesi / gösterilemeyen alanlar…) →
 *    adımın tamamı salt okunur "korunan adım" bloğu olur, aynen korunur.
 *  - ek: düzenlenebilir adımın gösterilemeyen özellikleri (görünürlük koşulu — ör. düğmeli adımın seçime bağlı görünürlüğü,
 *    alanlı + düğmeli isteğe bağlı adım —, kod yöntemi, adres / son adımda öğe başarı göstergesi, gösterilemeyen alanlar…) →
 *    adımın alan grubunda (yoksa aksiyonunda) rozet; kaydedince aynı kimlikli adıma aynen yazılır.
 *  - bolumNotlari: alanın bölümünün özellikleri (görünürlük koşulu, kod yöntemi…) → alanın yanında salt okunur not. Adıma değil
 *    bölüme bağlıdır: kaydederken bölümle birlikte taşınır (paket-olusturucu.mjs > bolumOzellikleriniTasi; korunanDenetimi).
 *  - aksiyonlar: gösterilemeyen koşu aksiyonu (metinle süzülen / kendi süreli tıklama, öğeye bağlı bekleme, ekrana dön) →
 *    adımın aksiyonları salt okunur "korunan aksiyonlar" bloğu olur (düğmesi adımın ilerlemesidir).
 *  - alanKosullari: düzenlenebilir alanın gösterilemeyen görünürlük koşulu (iç içe / karışık, bağlam, korunan alana bağlı…)
 *    → alanın yanında kilitli; alan modeldeki tanımıyla eşleştiği için koşul aynen kalır (kaydederken denetlenir).
 * Koşul, korunan (diyagramda olmayan) bir alana bağlıysa gösterilemez: korunan alanlar kararlı olana kadar yinelenir.
 * @param {Nesne} model @param {Nesne[]} sirali akışın adımları (sırayla) @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 */
function akisKorumasi(model, sirali, env) {
  const etiketler = alanEtiketleri(model);
  /** @type {Set<string>} */
  let korunanAlanlar = new Set();
  /** @type {ReturnType<typeof adimKorumasi>[]} */
  let analizler = [];
  for (let tur = 0; tur <= sirali.length + 1; tur++) {
    analizler = [];
    for (const [i, adim] of sirali.entries()) analizler.push(adimKorumasi(model, sirali, i, env, korunanAlanlar, analizler, etiketler));
    /** @type {Set<string>} */
    const yeni = new Set();
    for (const [i, an] of analizler.entries()) {
      if (an.tam) for (const b of Array.isArray(sirali[i].bolumler) ? sirali[i].bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) yeni.add(String(a.id));
      for (const x of an.ek.alanlar) yeni.add(String(x.alan.id));
    }
    if (yeni.size === korunanAlanlar.size && [...yeni].every((x) => korunanAlanlar.has(x))) break;
    korunanAlanlar = yeni;
  }
  return analizler;
}

/**
 * Tek adımın koruma analizi (bkz. akisKorumasi). @param {Nesne} model @param {Nesne[]} adimlar @param {number} i
 * @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env @param {Set<string>} korunanAlanlar
 * @param {Array<ReturnType<typeof adimKorumasi>>} onceki önceki adımların analizleri @param {Map<string, string>} etiketler
 */
function adimKorumasi(model, adimlar, i, env, korunanAlanlar, onceki, etiketler) {
  const adim = adimlar[i];
  /** @type {{ adimEk: Nesne; kosuEk: Nesne; alanlar: Array<{ alan: Nesne; bolum: { id: string; baslik: string }; onceki: string | null }> }} */
  const ek = { adimEk: {}, kosuEk: {}, alanlar: [] };
  const sonuc = {
    tam: false, ozel: false, ek, gorunurlukKorunur: false, gostergeKorunur: false,
    /** @type {Nesne[] | null} */ aksiyonlar: null,
    /** @type {Record<string, { id: string; gorunurluk: Nesne; aciklama: string }>} diyagram anahtarı → korunan koşul */ alanKosullari: {},
    /** @type {Record<string, { kosullu: boolean; ozet: string }>} diyagram anahtarı → alanın bölümünün özellikleri (salt okunur; bölümle korunur) */ bolumNotlari: {},
    /** @type {string[]} */ ozet: []
  };
  if (ozelAdimMi(adim)) { sonuc.ozel = true; return sonuc; }
  if (!Array.isArray(adim.bolumler)) {
    sonuc.tam = true;
    sonuc.ozet = tamAdimOzeti(model, adim, etiketler);
    return sonuc;
  }
  const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
  const aksiyonlar = Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : [];
  if (!aksiyonlarTemsilEdilir(adim, aksiyonlar)) sonuc.aksiyonlar = kopya(aksiyonlar);
  const tikla = aksiyonlar.some((x) => nesneMi(x) && x.tur === 'tikla');
  const kosulGosterilir = (/** @type {unknown} */ ifade) => diyagramKosulu(ifade, env, korunanAlanlar, etiketler) !== null;
  // Adım özellikleri: kod yöntemi vb. (diyagramın kurmadığı her adım anahtarı).
  for (const [k, v] of Object.entries(adim)) {
    if (!['id', 'sira', 'baslik', 'gorunurluk', 'bolumler', 'kosu'].includes(k)) { ek.adimEk[k] = kopya(v); sonuc.ozet.push(k === 'pomMetodu' ? `kod yöntemi (${String(v)})` : `adım özelliği “${k}”`); }
  }
  // Görünürlük: diyagram yalnız (a) "her senaryoda basılmaz" düğmenin kalıbını (düğme adımı + açtığı alanlar), (b) düğmesiz
  // adımda seçim alanına bağlı koşulu (alanlara taşınır) kurar; gerisi aynen korunur ve adım zorunlu adım gibi gösterilir.
  let istegeBagli = false;
  if (nesneMi(adim.gorunurluk)) {
    const kapsam = kapsamAyari(model, adim);
    let kurulur = false;
    if (kapsam) {
      const alanli = adim.bolumler.some((b) => nesneMi(b) && Array.isArray(b.alanlar) && b.alanlar.some((x) => nesneMi(x) && !['buton', 'cikti'].includes(x.tip)));
      const onc = adimlar[i - 1];
      const oncekiAcici = onc && !onceki[i - 1]?.gorunurlukKorunur && !onceki[i - 1]?.tam && kapsamAyari(model, onc) === kapsam
        && nesneMi(onc.kosu) && Array.isArray(onc.kosu.aksiyonlar) && onc.kosu.aksiyonlar.some((x) => nesneMi(x) && x.tur === 'tikla');
      kurulur = !sonuc.aksiyonlar && !(alanli && (tikla || !oncekiAcici));
      istegeBagli = kurulur;
    } else {
      // Adım düzeyinde "ekranda görünürse" alanlara taşınmaz (adımın kendi koşulu olarak aynen korunur).
      const k = diyagramKosulu(gorunurlukIfadesi(model, adim.gorunurluk), env, korunanAlanlar, etiketler);
      kurulur = !tikla && k !== null && !gorunurseVar(k);
    }
    if (!kurulur) {
      sonuc.gorunurlukKorunur = true;
      ek.adimEk.gorunurluk = kopya(adim.gorunurluk);
      sonuc.ozet.push(`görünürlük koşulu: ${gorunurlukOzeti(model, adim.gorunurluk, etiketler)}`);
    }
  }
  // Başarı göstergesi: adres (url), son adımda öğe ya da bilinmeyen gösterge aynen korunur (mesaj blokları gösterilmez).
  const sonAdim = i === adimlar.length - 1 || adimlar.slice(i + 1).every((x) => nesneMi(x.ortakAkis) || nesneMi(x.sqlKontrolu) || nesneMi(x.dosyaKontrolu));
  if (!gostergeTemsilEdilir(kosu.basariGostergesi, sonAdim)) {
    sonuc.gostergeKorunur = true;
    ek.kosuEk.basariGostergesi = kopya(kosu.basariGostergesi);
    sonuc.ozet.push(`başarı göstergesi: ${gostergeOzeti(kosu.basariGostergesi)}`);
  }
  // Adımın sonucu bekleme süresi yalnız zorunlu düğmede taşınır; not diyagramda yok.
  if (kosu.zamanAsimiSn !== undefined && (!tikla || istegeBagli || sonuc.aksiyonlar)) { ek.kosuEk.zamanAsimiSn = kosu.zamanAsimiSn; sonuc.ozet.push(`sonucu en çok bekleme: ${String(kosu.zamanAsimiSn)} sn`); }
  if (kosu.not !== undefined) { ek.kosuEk.not = kopya(kosu.not); sonuc.ozet.push('koşu notu'); }
  // Alanlar: gösterilemeyenler yerleriyle korunur; gösterilenlerin gösterilemeyen koşulları kilitli.
  const ilkTikla = aksiyonlar.find((x) => nesneMi(x) && x.tur === 'tikla');
  let oncekiAlan = /** @type {string | null} */ (null);
  let gosterilen = 0;
  for (const b of adim.bolumler) {
    if (!nesneMi(b)) continue;
    // Bölüm özellikleri (görünürlük koşulu, kod yöntemi…) diyagramda düzenlenmez; bölümle birlikte aynen korunur
    // (paket-olusturucu.mjs > bolumOzellikleriniTasi). Alanlarının yanında salt okunur not olarak gösterilir.
    const bolumNotu = bolumOzeti(model, b, etiketler);
    for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
      if (!nesneMi(a)) continue;
      const korunur = !temsilEdilir(a)
        || (a.tip === 'cikti' && sonuc.gostergeKorunur)
        || (a.tip === 'buton' && sonuc.aksiyonlar !== null && !(nesneMi(a.konum) && nesneMi(ilkTikla) && a.konum.secici === ilkTikla.secici));
      if (korunur) {
        ek.alanlar.push({ alan: kopya(a), bolum: { id: String(b.id), baslik: String(b.baslik || '') }, onceki: oncekiAlan });
        if (!['buton', 'cikti'].includes(a.tip)) sonuc.ozet.push(`alan “${etiketi(a)}” (diyagramda gösterilemiyor)`);
      } else if (!['buton', 'cikti'].includes(a.tip)) {
        gosterilen++;
        if (bolumNotu) sonuc.bolumNotlari[envanterAnahtari(a)] = bolumNotu;
        if (nesneMi(a.gorunurluk) && !kosulGosterilir(gorunurlukIfadesi(model, a.gorunurluk))) {
          sonuc.alanKosullari[envanterAnahtari(a)] = { id: String(a.id), gorunurluk: kopya(a.gorunurluk), aciklama: gorunurlukOzeti(model, a.gorunurluk, etiketler) };
        }
      }
      oncekiAlan = String(a.id);
    }
  }
  if (sonuc.aksiyonlar) sonuc.ozet.push(...sonuc.aksiyonlar.map(aksiyonOzeti).map((x) => `aksiyon: ${x}`));
  // Diyagramda taşıyıcısı (alan grubu ya da düğme) olmayan, korunacak parçası olan adım: tamamı korunur.
  const korunacak = Object.keys(ek.adimEk).length || Object.keys(ek.kosuEk).length || ek.alanlar.length || sonuc.aksiyonlar;
  if (korunacak && !gosterilen && !tikla) {
    sonuc.tam = true;
    sonuc.ozet = tamAdimOzeti(model, adim, etiketler);
  }
  return sonuc;
}

/** Tamamı korunan adımın okunur özeti. @param {Nesne} model @param {Nesne} adim @param {Map<string, string>} etiketler @returns {string[]} */
function tamAdimOzeti(model, adim, etiketler) {
  const ozet = [];
  if (nesneMi(adim.altModel)) ozet.push(`alt model: ${String(adim.altModel.dosya)} › ${String(adim.altModel.bolum)}`);
  const alanlar = (Array.isArray(adim.bolumler) ? adim.bolumler : []).flatMap((b) => (nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []))
    .filter((a) => nesneMi(a) && !['buton', 'cikti'].includes(a.tip));
  if (alanlar.length) ozet.push(`alanlar: ${alanlar.map((a) => `“${etiketi(a)}”`).join(', ')}`);
  if (typeof adim.pomMetodu === 'string') ozet.push(`kod yöntemi (${adim.pomMetodu})`);
  if (nesneMi(adim.gorunurluk)) ozet.push(`görünürlük koşulu: ${gorunurlukOzeti(model, adim.gorunurluk, etiketler)}`);
  const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
  for (const a of Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : []) ozet.push(`aksiyon: ${aksiyonOzeti(a)}`);
  if (kosu.basariGostergesi !== undefined) ozet.push(`başarı göstergesi: ${gostergeOzeti(kosu.basariGostergesi)}`);
  return ozet;
}

/** Koşul diyagramda gösterilebilir mi (seçim alanı envanterde select/radio ve değerleri seçeneklerinden)? @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env @param {{ secim: string; degerler: string[] }} k */
function kosulTemsilEdilir(env, k) {
  const s = env.alanlar.find((x) => x.alan.anahtar === k.secim)?.alan;
  if (s && s.tur === 'checkbox') return k.degerler.length === 1 && ['true', 'false'].includes(k.degerler[0]);
  if (!s || !['select', 'radio'].includes(s.tur)) return false;
  const degerler = new Set([...(s.secenekler ?? []), ...(s.radyolar ?? [])].map((x) => x.deger));
  return k.degerler.length > 0 && k.degerler.every((d) => degerler.has(d));
}

/**
 * Adımın (isteğe bağlı adım ayarı olmayan) görünürlük koşulu → alanlara uygulanacak { secim, degerler }; koşul yoksa null,
 * diyagramda karşılanamıyorsa false (düğmeli adım ya da seçim alanına bağlı olmayan koşul).
 * @param {Nesne} adim @param {Nesne} model @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 */
function adimKosulu(adim, model, env) {
  const g = adim.gorunurluk;
  if (!nesneMi(g)) return null;
  const aksiyonlu = nesneMi(adim.kosu) && Array.isArray(adim.kosu.aksiyonlar) && adim.kosu.aksiyonlar.some((/** @type {Nesne} */ a) => nesneMi(a) && a.tur === 'tikla');
  const ifade = gorunurlukIfadesi(model, g);
  if (nesneMi(ifade) && typeof ifade.senaryoAyari === 'string') return null; // isteğe bağlı adım (kapsam ayarı): ayrı işlenir
  if (aksiyonlu) return false;
  const k = diyagramKosulu(ifade, env, new Set(), alanEtiketleri(model));
  return k && !gorunurseVar(k) ? k : false;
}

/** Akışın adımları sırayla. @param {Nesne[]} adimlar */
const siraliAdimlar = (adimlar) => adimlar.filter(nesneMi).slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
/** Akışın başındaki (ilk ekran adımından önceki) ortak akış adımlarının sayısı. @param {unknown} adimlar */
const bastakiOrtakAdimSayisi = (adimlar) => {
  let n = 0;
  for (const a of siraliAdimlar(Array.isArray(adimlar) ? adimlar : [])) { if (!nesneMi(a.ortakAkis)) break; n++; }
  return n;
};
/** Korunan parça anahtarı: tür + akış + adım kimliği. @param {string} tur @param {string} akisId @param {string} adimId */
const korunanAnahtari = (tur, akisId, adimId) => `${tur}:${akisId}:${adimId}`;

/**
 * Modelin TÜM akışlarının korunan parçaları (kaydederken blokların "korunan" anahtarlarının karşılığı) ve gösterilemeyen alan
 * koşulları (alan kimliği → özgün görünürlük). @param {Nesne} model
 */
export function korunanParcalari(model) {
  const env = modeldenAkisEnvanteri(model);
  const etiketler = alanEtiketleri(model);
  /** @type {Record<string, import('../tarama/paket-olusturucu.d.mts').KorunanParca>} */
  const parcalar = {};
  /** @type {Record<string, { akis: string; baslik: string; ozet: string[] }>} */
  const ozetler = {};
  /** @type {Map<string, { anahtar: string; gorunurluk: Nesne; aciklama: string; etiket: string }>} */
  const alanKosullari = new Map();
  for (const akis of akisListesi(model)) {
    const m = akisModeli(model, akis.id);
    const sirali = siraliAdimlar(nesneMi(m) && Array.isArray(m.adimlar) ? m.adimlar : []);
    const analizler = akisKorumasi(model, sirali, env);
    for (const [i, an] of analizler.entries()) {
      const adim = sirali[i];
      const baslik = String(adim.baslik || adim.id);
      if (an.tam) {
        const anahtarlar = (Array.isArray(adim.bolumler) ? adim.bolumler : []).flatMap((b) => (nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []))
          .filter((a) => nesneMi(a) && !['buton', 'cikti'].includes(a.tip)).map((a) => envanterAnahtari(a));
        const k = korunanAnahtari('adim', akis.id, adim.id);
        parcalar[k] = { tur: 'adim', adim: /** @type {Nesne & { id: string }} */ (kopya(adim)), alanAnahtarlari: anahtarlar };
        ozetler[k] = { akis: akis.id, baslik, ozet: an.ozet };
        continue;
      }
      if (an.ozel) continue;
      const e = an.ek;
      if (Object.keys(e.adimEk).length || Object.keys(e.kosuEk).length || e.alanlar.length) {
        const k = korunanAnahtari('ek', akis.id, adim.id);
        parcalar[k] = {
          tur: 'ek', id: String(adim.id), ...(Object.keys(e.adimEk).length ? { adimEk: e.adimEk } : {}), ...(Object.keys(e.kosuEk).length ? { kosuEk: e.kosuEk } : {}),
          ...(e.alanlar.length ? { alanlar: e.alanlar } : {})
        };
        ozetler[k] = { akis: akis.id, baslik, ozet: an.ozet.filter((x) => !x.startsWith('aksiyon: ')) };
      }
      if (an.aksiyonlar) {
        const k = korunanAnahtari('aksiyonlar', akis.id, adim.id);
        parcalar[k] = { tur: 'aksiyonlar', aksiyonlar: an.aksiyonlar };
        ozetler[k] = { akis: akis.id, baslik, ozet: an.aksiyonlar.map(aksiyonOzeti) };
      }
      for (const [anahtar, x] of Object.entries(an.alanKosullari)) {
        if (!alanKosullari.has(x.id)) alanKosullari.set(x.id, { anahtar, gorunurluk: x.gorunurluk, aciklama: x.aciklama, etiket: etiketler.get(x.id) ?? x.id });
      }
    }
  }
  return { parcalar, ozetler, alanKosullari };
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
    if (!liste.some((x) => x.secici === o.secici && x.metin === o.metin && JSON.stringify(x.cerceve ?? []) === JSON.stringify(o.cerceve ?? []))) liste.push(o);
  };
  /** Akışların SON ekran adımlarının öğe göstergeleri (adim kimliği → seçiciler): yalnız bunlar diyagramda "öğe" bloğudur. */
  const sonOgeler = new Map();
  for (const l of [model.adimlar, ...(Array.isArray(model.akislar) ? model.akislar.map((/** @type {Nesne} */ a) => a.adimlar) : [])]) {
    const s = siraliAdimlar(Array.isArray(l) ? l : []);
    const son = [...s].reverse().find((x) => !nesneMi(x.ortakAkis) && !nesneMi(x.sqlKontrolu) && !nesneMi(x.dosyaKontrolu));
    if (son && nesneMi(son.kosu)) sonOgeler.set(son.id, new Set(ogeGostergeleri(son.kosu.basariGostergesi).map((g) => g.deger)));
  }
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
          ...(sabitAlanMi(a) ? { not: `sabit değer: ${String(a.sabitDeger)}` } : {}),
          // Çerçeve (iframe) ve özel açılır liste bilgisi: yeniden kaydederken alan aynı tanımla eşleşsin.
          ...cerceveEki(a.konum.cerceve), ...(a.doldurucu === 'ozelSecim' ? { ozelBilesen: true } : {})
        });
      }
    }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    for (const x of Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : []) {
      if (nesneMi(x) && x.tur === 'tikla' && typeof x.secici === 'string') ekle(dugmeler, { secici: x.secici, metin: typeof x.aciklama === 'string' ? x.aciklama : null, ...cerceveEki(x.cerceve) });
    }
    // Dosya adımının indirmeyi başlatan düğmesi de sağ listede (diyagramdaki dosya bloğu onu seçer).
    const t = nesneMi(adim.dosyaKontrolu) && nesneMi(adim.dosyaKontrolu.tetikleyici) ? adim.dosyaKontrolu.tetikleyici : null;
    if (t && typeof t.secici === 'string') ekle(dugmeler, { secici: t.secici, metin: typeof t.aciklama === 'string' ? t.aciklama : null });
    for (const g of metinGostergeleri(kosu.basariGostergesi)) ekle(mesajlar, { secici: typeof g.secici === 'string' ? g.secici : '', metin: g.deger, ...cerceveEki(g.cerceve) });
    for (const g of desenGostergeleri(kosu.basariGostergesi)) ekle(mesajlar, { secici: typeof g.secici === 'string' ? g.secici : '', metin: g.deger, ...cerceveEki(g.cerceve) });
    // Öğe göstergesi ("öğe görününce bitti"; örn. açılan pencere): sağ listede öğe olarak (metni: sonuç alanının etiketi).
    // (Ara adımların kendiliğinden kurulan göstergesi — sonraki adımın bir alanı / düğmesi — listelenmez.)
    for (const g of ogeGostergeleri(kosu.basariGostergesi)) if (sonOgeler.get(adim.id)?.has(g.deger)) ekle(mesajlar, { secici: g.deger, metin: ogeAdi(adim, g.deger), ...cerceveEki(g.cerceve) });
    for (const u of uyariListesi(kosu)) ekle(mesajlar, { secici: typeof u.secici === 'string' ? u.secici : '', metin: u.metin, ...cerceveEki(u.cerceve) });
  }
  return {
    kip: 'kayit', bicim: 'akis', profil: null, baslik: String(model.ad || ''),
    alanlar: [...alanlar.values()].map((alan) => ({ alan, secili: true })), dugmeler, mesajlar, olaylar: [], engellenenler: [], notlar: []
  };
}

/** Çerçeve (iframe) seçicileri (modelde konum.cerceve / aksiyon / gösterge) → { cerceve } ya da {}. @param {unknown} c */
function cerceveEki(c) {
  return Array.isArray(c) && c.length && c.every((x) => typeof x === 'string' && x) ? { cerceve: c.map(String) } : {};
}

/** Başarı göstergesinin metin göstergeleri ("veya" grubunda her seçenek). @param {unknown} g @returns {Array<{ deger: string; secici?: unknown; cerceve?: unknown }>} */
function metinGostergeleri(g) {
  const liste = nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  return liste.filter((x) => nesneMi(x) && x.tur === 'metin' && typeof x.deger === 'string');
}

/** Başarı göstergesinin öğe ("görününce bitti") göstergeleri. @param {unknown} g @returns {Array<{ deger: string; cerceve?: unknown }>} */
function ogeGostergeleri(g) {
  const liste = nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  return liste.filter((x) => nesneMi(x) && x.tur === 'eleman' && typeof x.deger === 'string' && x.deger);
}
/** Öğe göstergesinin sağ listedeki adı: aynı seçicili sonuç alanının (cikti) etiketi, yoksa "Öğe görünür". @param {Nesne} adim @param {string} secici */
function ogeAdi(adim, secici) {
  for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
    for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
      if (nesneMi(a) && a.tip === 'cikti' && nesneMi(a.konum) && a.konum.secici === secici) { const e = etiketi(a); if (e) return `Öğe görünür: ${e}`; }
    }
  }
  return 'Öğe görünür';
}

/** Başarı göstergesinin kalıp (düzenli ifade) göstergeleri. @param {unknown} g @returns {Array<{ deger: string; secici?: unknown; cerceve?: unknown }>} */
function desenGostergeleri(g) {
  const liste = nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  return liste.filter((x) => nesneMi(x) && x.tur === 'desen' && typeof x.deger === 'string');
}

/** Adımın kabul edilen uyarıları (kosu.uyarilar). @param {Nesne} kosu @returns {Array<{ metin: string; secici?: unknown; cerceve?: unknown }>} */
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
 * Diyagramın gösteremediği parçalar (akisKorumasi) salt okunur korunan bloklar / rozetler olur: "korunan" anahtarı kaydederken
 * modeldeki parçaya çözülür (korunanParcalari) ve aynen geri yazılır.
 * @param {Nesne} model tam model @param {Nesne[]} adimlar akışın adımları @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 * @param {string} [akisId] adımların akışı (korunan parça anahtarı için; verilmezse adımlardan bulunur, yoksa varsayılan akış)
 * @returns {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]}
 */
export function adimlardanBloklar(model, adimlar, env, akisId) {
  /** @type {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]} */
  const bloklar = [];
  const sirali = siraliAdimlar(adimlar);
  const akis = akisId ?? (Array.isArray(model.akislar) ? model.akislar.find((/** @type {Nesne} */ a) => nesneMi(a) && a.adimlar === adimlar)?.id : undefined) ?? akisListesi(model)[0]?.id ?? ANA_AKIS_ID;
  const analizler = akisKorumasi(model, sirali, env);
  /** Modelin alanları (bu modelde olmayan koşul alanı genel senaryodandır). */
  const modelEtiketleri = alanEtiketleri(model);
  for (const [sira, adim] of sirali.entries()) {
    const an = analizler[sira];
    // Diyagramda düzenlenecek içeriği olmayan korunan adım: tek salt okunur blok (tamamı aynen).
    if (an.tam) {
      bloklar.push({ tur: 'korunan', korunan: korunanAnahtari('adim', String(akis), String(adim.id)), ad: String(adim.baslik || adim.id), kapsam: 'adim', ozet: an.ozet });
      continue;
    }
    const istegeBagli = Boolean(kapsamAyari(model, adim)) && !an.gorunurlukKorunur;
    // Ortak akış adımı: tek blok (içi ortak akışın kendi yerinde düzenlenir).
    if (nesneMi(adim.ortakAkis) && typeof adim.ortakAkis.dosya === 'string') {
      // "Yeni senaryolarda dahil": bloğun "dahil" ayar alanının varsayılanı (senaryoDuzeyi; yoksa dahil değil).
      const ayarId = istegeBagli ? kapsamAyari(model, adim) : null;
      const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [];
      const ayarAlani = ayarId ? sd.find((/** @type {unknown} */ a) => nesneMi(a) && a.id === ayarId) : undefined;
      const dahil = nesneMi(ayarAlani) && nesneMi(ayarAlani.varsayilan) && ayarAlani.varsayilan.deger === true;
      bloklar.push({ tur: 'ortak', dosya: adim.ortakAkis.dosya, ad: String(adim.baslik || adim.id), istegeBagli, ...(dahil ? { dahilVarsayilan: true } : {}) });
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
    // Adım düzeyindeki koşul (düğmesiz adım) alanlara taşınır: alanın kendi koşulu yoksa adımınki yazılır (korunan koşul taşınmaz).
    const adimKosul = an.gorunurlukKorunur ? null : adimKosulu(adim, model, env);
    const alanlar = [];
    /** @type {string[]} */
    const zorunlu = [];
    /** @type {Record<string, { secim: string; degerler: string[] } | null>} */
    const kosullar = {};
    /** @type {Record<string, Nesne>} alanın değer kuralları (alan.sinirlar; diyagramdaki "Sınırlar" düzenleyicisi) */
    const sinirlar = {};
    /** @type {Record<string, string>} "Doldurduktan sonra" tuşu (alan.doldurucuParametreleri.tus; yalnız diyagramın sunduğu tuşlar) */
    const tuslar = {};
    /** @type {Record<string, string>} gösterilemeyen koşullar (salt okunur; alanın tanımıyla korunur) */
    const korunanKosullar = {};
    const ekAlanIdleri = new Set(an.ek.alanlar.map((x) => String(x.alan.id)));
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || ['buton', 'cikti'].includes(a.tip) || ekAlanIdleri.has(String(a.id))) continue;
        const anahtar = envanterAnahtari(a);
        if (!env.alanlar.some((x) => x.alan.anahtar === anahtar)) continue;
        alanlar.push(anahtar);
        if (nesneMi(a.sinirlar)) sinirlar[anahtar] = kopya(a.sinirlar);
        const tus = nesneMi(a.doldurucuParametreleri) ? a.doldurucuParametreleri.tus : undefined;
        if (typeof tus === 'string' && ALAN_TUSLARI.includes(tus)) tuslar[anahtar] = tus;
        if (a.mutlakaGorunmeli === true) zorunlu.push(anahtar);
        const g = a.gorunurluk;
        if (an.alanKosullari[anahtar]) { korunanKosullar[anahtar] = an.alanKosullari[anahtar].aciklama; continue; }
        const k = diyagramKosulu(gorunurlukIfadesi(model, g), env, new Set(), modelEtiketleri);
        if (!g) kosullar[anahtar] = nesneMi(adimKosul) ? adimKosul : null;
        else if (k) kosullar[anahtar] = k;
        // Başka biçimdeki koşul (ör. iç içe ve / veya): yazılmaz → modeldeki koşul korunur.
      }
    }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    const aksiyonlar = Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar.filter(nesneMi) : [];
    const tikla = aksiyonlar.some((x) => x.tur === 'tikla');
    const ilkBlok = bloklar.length;
    const e = an.ek;
    const ekVar = Object.keys(e.adimEk).length || Object.keys(e.kosuEk).length || e.alanlar.length;
    /** Gruptaki alanların bölüm notları (salt okunur gösterim). @type {Record<string, { kosullu: boolean; ozet: string }>} */
    const bolumNotlari = Object.fromEntries(alanlar.filter((x) => an.bolumNotlari[x]).map((x) => [x, an.bolumNotlari[x]]));
    const ekOzet = an.ozet.filter((x) => !x.startsWith('aksiyon: '));
    /** Adımın korunan özellikleri: ilk bloğunda (alan grubu, yoksa ilk aksiyon). */
    let ekAnahtari = ekVar ? korunanAnahtari('ek', String(akis), String(adim.id)) : null;
    if (alanlar.length || (!istegeBagli && (tikla || ekVar)) || an.aksiyonlar) {
      bloklar.push({
        tur: 'alanlar', ad: String(adim.baslik || adim.id), alanlar, zorunlu, kosullar, ...(Object.keys(sinirlar).length ? { sinirlar } : {}), ...(Object.keys(tuslar).length ? { tuslar } : {}),
        ...(ekAnahtari ? { korunan: ekAnahtari, korunanOzet: ekOzet } : {}), ...(Object.keys(korunanKosullar).length ? { korunanKosullar } : {}),
        ...(Object.keys(bolumNotlari).length ? { bolumNotlari } : {})
      });
      ekAnahtari = null;
    }
    if (an.aksiyonlar) {
      // Gösterilemeyen aksiyon: adımın aksiyonları tek salt okunur blok (aynen; düğmesi varsa adımın ilerlemesi).
      bloklar.push({ tur: 'korunan', korunan: korunanAnahtari('aksiyonlar', String(akis), String(adim.id)), ad: String(adim.baslik || adim.id), kapsam: 'aksiyonlar', ozet: an.aksiyonlar.map(aksiyonOzeti) });
    } else {
      // İsteğe bağlı düğme adımı: aksiyon önce (grubundan sonra); açtığı alanlar ayrı adımdaysa yukarıda grup olarak geldi.
      for (const x of aksiyonlar) {
        if (x.tur === 'bekle' && Number.isInteger(x.sureSn)) bloklar.push({ tur: 'bekle', saniye: x.sureSn });
        else if (x.tur === 'git') bloklar.push({ tur: 'git', yol: String(x.yol) });
        else if (x.tur === 'tikla') {
          const d = env.dugmeler.findIndex((o) => o.secici === x.secici && o.metin === (typeof x.aciklama === 'string' ? x.aciklama : null));
          if (gorunurseMi(x)) {
            // "Yalnız görünürse bas": kendi kısa bekleme süresiyle (adımın sonucu bekleme süresi ilerleme düğmesinde).
            if (d >= 0) bloklar.push({ tur: 'aksiyon', dugme: d, istegeBagli: false, gorunurse: true, ...(Number.isInteger(x.zamanAsimiSn) ? { zamanAsimiSn: x.zamanAsimiSn } : {}) });
            continue;
          }
          // Adımın sonucu bekleme süresi (kosu.zamanAsimiSn) ilerleme düğmesinde taşınır.
          const sure = !istegeBagli && Number.isInteger(kosu.zamanAsimiSn) ? { zamanAsimiSn: kosu.zamanAsimiSn } : {};
          if (d >= 0) {
            bloklar.push({ tur: 'aksiyon', dugme: d, istegeBagli, ...sure, ...(ekAnahtari ? { korunan: ekAnahtari, korunanOzet: ekOzet } : {}) });
            ekAnahtari = null;
          }
        }
      }
    }
    // Beklenen mesaj(lar): "veya" grubunun her seçeneği ardışık bir mesaj bloğu olur (gösterge korunuyorsa gösterilmez).
    if (!an.gostergeKorunur) {
      for (const g of metinGostergeleri(kosu.basariGostergesi)) {
        const m = env.mesajlar.findIndex((o) => o.metin === g.deger && o.secici === (typeof g.secici === 'string' ? g.secici : ''));
        bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: g.deger });
      }
      // Son adımın öğe göstergesi ("öğe görününce bitti"): "öğe" işaretli mesaj bloğu (metin aranmaz). Ara adımlarınki sonraki adımın ilk
      // öğesinden kendiliğinden kurulur (gösterilmez).
      if (sira === sirali.length - 1 || sirali.slice(sira + 1).every((x) => nesneMi(x.ortakAkis) || nesneMi(x.sqlKontrolu) || nesneMi(x.dosyaKontrolu))) {
        for (const g of ogeGostergeleri(kosu.basariGostergesi)) {
          const m = env.mesajlar.findIndex((o) => o.secici === g.deger && o.metin === ogeAdi(adim, g.deger));
          bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: null, oge: true });
        }
      }
      // Kalıp göstergesi (ör. toplam sıfırdan farklı: [1-9]): öğesi mesajın yeri, metni düzenli ifade.
      for (const g of desenGostergeleri(kosu.basariGostergesi)) {
        const m = env.mesajlar.findIndex((o) => o.metin === g.deger && o.secici === (typeof g.secici === 'string' ? g.secici : ''));
        bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: g.deger, desen: true });
      }
    }
    // Kabul edilen uyarılar: başarı mesajlarının ardından "Uyarı" işaretli mesaj blokları.
    for (const u of uyariListesi(kosu)) {
      const m = env.mesajlar.findIndex((o) => o.metin === u.metin && o.secici === (typeof u.secici === 'string' ? u.secici : ''));
      bloklar.push({ tur: 'mesaj', mesaj: m >= 0 ? m : null, metin: u.metin, uyari: true });
    }
    // "Ekran görüntüsü al" (kosu.ekranGoruntusu): adımın alan grubunda, grup yoksa (isteğe bağlı olmayan) aksiyonunda gösterilir.
    if (kosu.ekranGoruntusu === true) {
      const hedef = bloklar.slice(ilkBlok).find((x) => x.tur === 'alanlar') ?? bloklar.slice(ilkBlok).find((x) => x.tur === 'aksiyon' && !x.istegeBagli);
      if (hedef && (hedef.tur === 'alanlar' || hedef.tur === 'aksiyon')) hedef.ekranGoruntusu = true;
    }
    // "Tekrar denenebilir" (kosu.tekrarDenenebilir): aynı yerde (alan grubu, yoksa isteğe bağlı olmayan aksiyon).
    if (kosu.tekrarDenenebilir === true) {
      const hedef = bloklar.slice(ilkBlok).find((x) => x.tur === 'alanlar') ?? bloklar.slice(ilkBlok).find((x) => x.tur === 'aksiyon' && !x.istegeBagli);
      if (hedef && (hedef.tur === 'alanlar' || hedef.tur === 'aksiyon')) hedef.tekrarDenenebilir = true;
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
  if (model.tur !== 'ortakAkis') throw new DepoHatasi('Bu ekran bir genel senaryo değil.');
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
 * varsayılan akıştaki tüm senaryolar koşar. dahilVarsayilan (yalnız isteğe bağlıyken): yeni senaryolarda "dahil" işaretli başlar
 * (kayıtlı senaryolar değişmez). onay: false → yalnızca etki (ekran, akış, senaryo sayısı, seçim); true → yazar.
 * Eklenemeyen ekran seçilirse hiçbiri yazılmaz (DepoHatasi).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortakEkranId
 * @param {{ ekranIdleri: unknown; istegeBagli?: boolean; dahilVarsayilan?: boolean; onay?: boolean }} g
 */
export function ortakAkisEkranlaraEkle(vt, projeId, ortakEkranId, g) {
  const { ortakAkis, ekranlar } = ortakAkisAdaylari(vt, projeId, ortakEkranId);
  // Boş başlatılmış (henüz adımı olmayan) ortak akış ekranlara eklenmez: önce akışı diyagramda oluşturulur.
  if (!ekranModeli(vt, projeId, ortakEkranId).model.adimlar.length) {
    throw new DepoHatasi(`“${ortakAkis.ad}” genel senaryosunun henüz adımı yok; önce Akışlar sekmesinde “Düzenle” ile akışını oluşturun.`);
  }
  const idler = Array.isArray(g.ekranIdleri) ? [...new Set(g.ekranIdleri.filter((x) => typeof x === 'string'))] : [];
  if (!idler.length) throw new DepoHatasi('En az bir ekran seçin.');
  const secilen = idler.map((id) => {
    const e = ekranlar.find((x) => x.id === id);
    if (!e) throw new DepoHatasi('Seçilen ekranlardan biri bulunamadı.');
    if (!e.eklenebilir) throw new DepoHatasi(`“${e.ad}”: ${e.neden}`);
    return e;
  });
  const etki = secilen.map((e) => ({ id: e.id, ad: e.ad, akis: e.varsayilanAkis, senaryoSayisi: e.senaryoSayisi }));
  const istegeBagli = g.istegeBagli === true;
  const dahilVarsayilan = istegeBagli && g.dahilVarsayilan === true;
  // Önce hepsi doğrulanır (onaysız kayıt: yalnızca doğrulama); biri hatalıysa hiçbiri yazılmaz.
  const hazirlik = secilen.map((e) => {
    const { model } = ekranModeli(vt, projeId, e.id);
    const akis = akisListesi(model)[0];
    const bloklar = adimlardanBloklar(model, /** @type {Nesne} */ (akisModeli(model, akis.id)).adimlar, modeldenAkisEnvanteri(model), akis.id);
    bloklar.splice(bloklar.length - 1, 0, { tur: 'ortak', dosya: ortakAkis.dosya, ad: ortakAkis.ad, istegeBagli, ...(dahilVarsayilan ? { dahilVarsayilan: true } : {}) });
    const girdi = { akisId: akis.id, ad: akis.ad, bloklar };
    try { akisKaydet(vt, projeId, e.id, { ...girdi, onay: false }); } catch (hataNesnesi) {
      const mesaj = hataNesnesi instanceof EkranDogrulamaHatasi && hataNesnesi.hatalar.length ? hataNesnesi.hatalar.map((/** @type {Nesne} */ x) => x.mesaj).join(' ') : /** @type {Error} */ (hataNesnesi).message;
      throw new DepoHatasi(`“${e.ad}” akışına eklenemedi: ${mesaj}`);
    }
    return { e, girdi };
  });
  if (g.onay !== true) return { etki: { ortakAkis: ortakAkis.ad, istegeBagli, dahilVarsayilan, ekranlar: etki } };
  return vt.islem(() => ({
    eklenen: hazirlik.map(({ e, girdi }) => ({ id: e.id, ad: e.ad, surum: /** @type {{ surum: number }} */ (akisKaydet(vt, projeId, e.id, { ...girdi, onay: true })).surum }))
  }));
}

/** Koşul düzenleyicisine gelen alan tipleri (model tipi → sayfa envanteri türü). */
const KOSUL_ALAN_TIPLERI = ['secim', 'okluSecim', 'radyo', 'onayKutusu', 'metin', 'telefon', 'sayi', 'tarih'];
/** Koşul düzenleyicisinde bir alanın en çok değer sayısı (seçenek / tablo değeri). */
const KOSUL_DEGER_LISTESI_EN_COK = 200;

/**
 * Koşul düzenleyicisinin kaynakları (yalnız ekranın / genel senaryonun akışını düzenlerken):
 *  - alanlar: ekranın alanı (diyagram anahtarı) → { tabloDegerleri?, kismi? }. Seçenekleri modelde tam olmayan (kısmi / bilinmiyor /
 *    bağlı liste) ya da hiç olmayan alanın test verisi bağı (etkin bağ: ekranın ya da genel senaryonun) varsa tablo sütununun farklı
 *    değerleri gelir; metinde sayfa karşılığı (karsiliklar.sayfa) gösterilir. Değerler kullanıcının tablosundandır; yalnız seçim için.
 *  - ortak: projenin genel senaryoları / önce gidilebilen ekranları (dosya → ad + varsayılan akışının senaryo alanları: kimlik,
 *    etiket, tür, seçenekler, tablo değerleri). Arayüz yalnız akışta bloğu olanları listeler.
 * Kasa kapalıysa ya da tablo okunamazsa tablo değerleri gelmez (arayüz elle değer yazdırır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {Nesne} model
 * @param {Array<{ dosya: string; ad: string }>} ortakListesi
 */
function kosulKaynaklari(vt, projeId, ekranId, model, ortakListesi) {
  /** @type {import('../tablolar/tablo-deposu.mjs').Tablo[] | null} */
  let tablolar = null;
  const tablolariAl = () => {
    if (tablolar === null) { try { tablolar = tablolariListele(vt, projeId); } catch { tablolar = []; } }
    return tablolar;
  };
  /** Bağın sütun değerleri (farklı, boş olmayan; gizli sütun yok). @param {{ tablo: string; sutun: string } | undefined} b */
  const bagDegerleri = (b) => {
    if (!b) return null;
    const t = tablolariAl().find((x) => x.id === b.tablo);
    const s = t ? t.sutunlar.find((x) => x.ad.toLocaleLowerCase('tr-TR') === String(b.sutun).toLocaleLowerCase('tr-TR')) : undefined;
    if (!t || !s || s.gizli) return null;
    /** @type {Array<{ deger: string; metin: string }>} */
    const liste = [];
    for (const r of t.satirlar) {
      const v = r.degerler[s.ad];
      if (v === null || v === undefined || v === '' || liste.some((x) => x.deger === v)) continue;
      const sayfa = nesneMi(s.karsiliklar) && nesneMi(/** @type {Nesne} */ (s.karsiliklar)[v]) ? /** @type {Nesne} */ (s.karsiliklar)[v].sayfa : undefined;
      liste.push({ deger: String(v), metin: typeof sayfa === 'string' && sayfa && sayfa !== v ? `${v} (sayfada: ${sayfa})` : String(v) });
      if (liste.length >= KOSUL_DEGER_LISTESI_EN_COK) break;
    }
    return liste.length ? liste : null;
  };
  /** Seçenekleri modelde tam değil mi (kısmi, bilinmiyor, bağlı liste ya da hiç yok)? @param {Nesne} a */
  const kismiMi = (a) => a.tip !== 'onayKutusu' && (!Array.isArray(a.secenekler) || !a.secenekler.length || ['kismi', 'bilinmiyor'].includes(a.seceneklerDurumu) || nesneMi(a.bagimlilik));
  /** @param {Record<string, { tablo: string; sutun: string }>} baglar @param {Nesne} a */
  const alanKaynagi = (baglar, a) => {
    const kismi = kismiMi(a);
    const tabloDegerleri = kismi ? bagDegerleri(baglar[String(a.id)]) : null;
    return { ...(kismi ? { kismi: true } : {}), ...(tabloDegerleri ? { tabloDegerleri } : {}) };
  };
  /** @param {unknown} adimlar @returns {Nesne[]} */
  const senaryoAlanlari = (adimlar) => (Array.isArray(adimlar) ? adimlar : []).flatMap((adim) => (nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []))
    .flatMap((b) => (nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []))
    .filter((a) => nesneMi(a) && a.yapilandirma === 'senaryo' && KOSUL_ALAN_TIPLERI.includes(a.tip) && typeof a.id === 'string');
  /** @type {Record<string, { kismi?: true; tabloDegerleri?: Array<{ deger: string; metin: string }> }>} */
  const alanlar = {};
  let ekranBaglari = {};
  try { ekranBaglari = etkinAlanBaglari(vt, ekranId); } catch { ekranBaglari = {}; }
  for (const a of senaryoAlanlari(tumAdimlar(model))) {
    const k = alanKaynagi(ekranBaglari, a);
    if (Object.keys(k).length) alanlar[envanterAnahtari(a)] = k;
  }
  const ekranlar = ekranlariListele(vt, projeId);
  /** @type {Array<{ dosya: string; ad: string; alanlar: Array<Nesne> }>} */
  const ortak = [];
  for (const o of ortakListesi) {
    const e = ekranlar.find((x) => `${x.anahtar}.model.json` === o.dosya);
    const k = e ? ekranModeliGetir(vt, e.id) : undefined;
    if (!e || !k || !nesneMi(k.model) || !Array.isArray(k.model.adimlar)) continue;
    let baglar = {};
    try { baglar = ekranAlanBaglari(vt, e.id); } catch { baglar = {}; }
    const om = /** @type {Nesne} */ (akisModeli(k.model, null));
    ortak.push({
      dosya: o.dosya, ad: o.ad,
      alanlar: senaryoAlanlari(om.adimlar).map((a) => ({
        id: String(a.id), etiket: String(etiketi(a)), tur: TURLER[/** @type {keyof typeof TURLER} */ (a.tip)] ?? 'text',
        secenekler: a.tip === 'onayKutusu' ? null : Array.isArray(a.secenekler)
          ? a.secenekler.filter(nesneMi).map((/** @type {Nesne} */ s) => ({ deger: String(s.senaryoDegeri ?? s.deger), metin: String(s.formMetni || s.metin || s.senaryoDegeri || s.deger) })) : null,
        ...alanKaynagi(baglar, a)
      }))
    });
  }
  return { alanlar, ortak };
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
  if (ortakAkis && !s.akisId) throw new DepoHatasi('Genel senaryonun tek akışı vardır; yeni akış eklenmez, mevcut akış düzenlenir.');
  const env = modeldenAkisEnvanteri(model);
  const liste = akisListesi(model);
  const kaynakId = s.akisId || s.kopya || null;
  const kaynak = kaynakId ? liste.find((a) => a.id === kaynakId) : null;
  if (kaynakId && !kaynak) throw new DepoHatasi('Akış bulunamadı.');
  const akm = kaynak ? /** @type {Nesne} */ (akisModeli(model, kaynak.id)) : null;
  const bloklar = akm && kaynak ? adimlardanBloklar(model, akm.adimlar, env, kaynak.id) : [{ tur: /** @type {const} */ ('bitir') }];
  const ortakAkislar = ortakAkis ? [] : ortakAkislariListele(vt, projeId, ekranId);
  return {
    // Koşul düzenleyicisinin kaynakları: alanların test verisi değerleri ve genel senaryoların alanları.
    kosulKaynaklari: kosulKaynaklari(vt, projeId, ekranId, model, ortakAkislar),
    // "Ekran açılır" düğümünün yeri (salt görünüm): üstündeki bloklar (baştaki ortak akışlar) ekran açılmadan önce koşar. Her
    // ortak akış adımı tek bloktur; "sonra" ayarında düğüm girişin hemen altındadır. Ortak akışın kendi diyagramında yoktur.
    ekranAcilisSirasi: ortakAkis ? null : !akm || akm.bastakiOrtakAkislar === 'sonra' ? 0 : bastakiOrtakAdimSayisi(akm.adimlar),
    ekran, bloklar, palet: akisPaleti(env, bloklar), ortakAkislar, ortakAkis,
    ...(ortakAkis ? { kullananlar: ortakAkisKullananlari(vt, projeId, ekranId) } : {}),
    akis: s.akisId && kaynak ? { id: kaynak.id, ad: kaynak.ad, varsayilan: kaynak.varsayilan } : null,
    kopyaKaynagi: s.kopya && kaynak ? kaynak.ad : null,
    // Ekran girişsiz açılıyorsa diyagramın başı "Girişsiz" olur ve "Yeniden giriş" bloğu sunulmaz.
    girissiz: model.girisGerekmez === true
  };
}

/**
 * "Boş başla" (Ekranlar > Ekran ekle > Ne oluşturulsun? ○ Ortak akış): adımı olmayan bir ortak akış (model v1) oluşturur; adımları
 * ortak akışın Akışlar sekmesinde "Düzenle" ile diyagramdan eklenir (elle alan / düğme ya da başlangıç ekranından "Akışı kaydet").
 * Ekranlara ekleme otomatik yapılmaz. anahtar verilmezse addan üretilir; projede aynı anahtarlı (silinmemiş) kayıt olmamalı.
 * @param {Veritabani} vt @param {string} projeId @param {{ ad: unknown; anahtar?: unknown }} g
 */
export function bosOrtakAkisOlustur(vt, projeId, g) {
  const ad = typeof g.ad === 'string' ? g.ad.replace(/\s+/g, ' ').trim() : '';
  if (!ad || ad.length > 120) throw new DepoHatasi('Genel senaryonun adını yazın (en fazla 120 karakter).');
  const anahtar = typeof g.anahtar === 'string' && g.anahtar.trim() ? g.anahtar.trim() : ekranAnahtariOner(ad);
  if (!EKRAN_ANAHTARI_DESENI.test(anahtar)) throw new DepoHatasi('Anahtar küçük harf, rakam ve "-" içermeli (ör. odeme-adimlari).');
  const ayni = ekranlariListele(vt, projeId).find((e) => e.anahtar === anahtar);
  if (ayni) throw new DepoHatasi(`“${ayni.ad}” bu anahtarla (${anahtar}) zaten var; başka bir ad ya da anahtar verin.`);
  const aciklama = `${ad} (genel senaryo; adımları akış diyagramında eklenir)`;
  const model = {
    semaSurumu: 2, tur: 'ortakAkis', id: anahtar, ad, aciklama, kosullar: {}, adimlar: [],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  modeliDogrula(vt, projeId, model, `${anahtar}.model.json`);
  return vt.islem(() => {
    const ekranId = ekranKaydet(vt, { projeId, anahtar, ad, aciklama });
    const { surum } = ekranModeliEkle(vt, { ekranId, model, aciklama: 'Boş genel senaryo oluşturuldu' });
    return { ekranId, surum, akisId: ANA_AKIS_ID };
  });
}

/**
 * Bir model dosyasından başlayan ortak akış / ekran başvuru zinciri hedef dosyaya varıyor mu (ekran kendini içeremez).
 * @param {Veritabani} vt @param {string} projeId @param {string} baslangic @param {string} hedef
 */
function basvuruZincirindeMi(vt, projeId, baslangic, hedef) {
  /** @type {Set<string>} */
  const ziyaret = new Set();
  const kuyruk = [baslangic];
  for (let i = 0; i < kuyruk.length; i++) {
    const d = kuyruk[i];
    if (d === hedef) return true;
    if (ziyaret.has(d)) continue;
    ziyaret.add(d);
    const e = vt.tek('SELECT id FROM ekranlar WHERE proje_id = ? AND anahtar = ? AND durum <> ? ORDER BY rowid', [projeId, d.replace(/\.model\.json$/, ''), 'silindi']);
    const k = e ? ekranModeliGetir(vt, String(e.id)) : undefined;
    if (!k || !nesneMi(k.model)) continue;
    const m = /** @type {Nesne} */ (k.model);
    const listeler = [m.adimlar, ...(Array.isArray(m.akislar) ? m.akislar.map((/** @type {Nesne} */ a) => (nesneMi(a) ? a.adimlar : null)) : [])];
    for (const l of listeler) for (const a of Array.isArray(l) ? l : []) if (nesneMi(a) && nesneMi(a.ortakAkis) && typeof a.ortakAkis.dosya === 'string') kuyruk.push(a.ortakAkis.dosya);
  }
  return false;
}

/**
 * Akış tasarımında "Önce şu ekrana gidilsin" listesi: projenin ortak akışları VE tüm ekranları (her ekran başka bir akışın önceki
 * adımı olabilir): dosya ("<anahtar>.model.json"), ad, tur ('ortakAkis' | 'ekran'), adım başlıkları. haricEkranId: düzenlenen ekran
 * (kendini ya da kendini içeren bir ekranı içeremez; listede görünmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} [haricEkranId]
 */
export function ortakAkislariListele(vt, projeId, haricEkranId) {
  /** @type {Array<{ dosya: string; ad: string; tur: 'ortakAkis' | 'ekran'; adimlar: string[]; yalnizTest: boolean }>} */
  const liste = [];
  const haric = haricEkranId ? vt.tek('SELECT anahtar FROM ekranlar WHERE id = ?', [haricEkranId]) : undefined;
  const haricDosya = haric ? `${String(haric.anahtar)}.model.json` : null;
  for (const e of vt.tumu("SELECT id, anahtar, ad FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi' ORDER BY ad", [projeId])) {
    if (haricEkranId && String(e.id) === haricEkranId) continue;
    const k = ekranModeliGetir(vt, String(e.id));
    if (!k || !nesneMi(k.model) || k.model.tur === 'altModel' || !Array.isArray(k.model.adimlar)) continue;
    const ortak = k.model.tur === 'ortakAkis';
    const dosya = `${String(e.anahtar)}.model.json`;
    if (!ortak && (!k.model.adimlar.length || (haricDosya && basvuruZincirindeMi(vt, projeId, dosya, haricDosya)))) continue;
    liste.push({
      dosya, ad: String(e.ad), tur: ortak ? 'ortakAkis' : 'ekran',
      adimlar: (/** @type {unknown[]} */ (k.model.adimlar)).filter(nesneMi).map((/** @type {Nesne} */ a) => String(a.baslik || a.id)),
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

/** JSON değerinin anahtar sırasından bağımsız yazımı (karşılaştırma için). @param {unknown} d @returns {string} */
function kararli(d) {
  if (Array.isArray(d)) return `[${d.map(kararli).join(',')}]`;
  if (nesneMi(d)) return `{${Object.keys(d).sort().filter((k) => d[k] !== undefined).map((k) => `${JSON.stringify(k)}:${kararli(d[k])}`).join(',')}}`;
  return JSON.stringify(d) ?? 'undefined';
}
const esitMi = (/** @type {unknown} */ a, /** @type {unknown} */ b) => kararli(a) === kararli(b);
/** kucuk, buyuk'un ardışık bir parçası mı? @param {unknown[]} buyuk @param {unknown[]} kucuk */
const ardisikParcaMi = (buyuk, kucuk) => {
  for (let i = 0; i + kucuk.length <= buyuk.length; i++) if (kucuk.every((x, j) => esitMi(buyuk[i + j], x))) return true;
  return false;
};

/**
 * Korunan parçaların (blokların "korunan" anahtarları + alanların gösterilemeyen koşulları) kaydedilecek akışta AYNEN yer
 * aldığını denetler. Yer almıyorsa (ör. korunan görünürlük koşulunun dayandığı alan akıştan çıkarıldı) bloğun hatası döner:
 * kayıt reddedilir, sessiz kayıp olmaz.
 * @param {Nesne} tam @param {Nesne} yeni @param {Nesne[]} akisAdimlari @param {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]} bloklar
 * @param {ReturnType<typeof korunanParcalari>} korunan
 * @param {Nesne[]} oncekiAdimlar güncellenen akışın kaydetmeden önceki adımları (bölüm özellikleri denetimi; yeni akışta boş)
 * @returns {Array<{ blok: number | null; mesaj: string }>}
 */
function korunanDenetimi(tam, yeni, akisAdimlari, bloklar, korunan, oncekiAdimlar) {
  /** @type {Array<{ blok: number | null; mesaj: string }>} */
  const hatalar = [];
  const etiketler = alanEtiketleri(tam);
  // Kaydedilecek modeldeki alanlar (tüm akışlar + senaryo düzeyi).
  const alanIdleri = new Set();
  const topla = (/** @type {unknown} */ adimlar) => {
    for (const adim of Array.isArray(adimlar) ? adimlar : []) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) alanIdleri.add(String(a.id));
  };
  topla(akisAdimlari);
  topla(yeni.adimlar);
  for (const a of Array.isArray(yeni.akislar) ? yeni.akislar : []) topla(nesneMi(a) ? a.adimlar : null);
  for (const a of nesneMi(yeni.senaryoDuzeyi) && Array.isArray(yeni.senaryoDuzeyi.alanlar) ? yeni.senaryoDuzeyi.alanlar : []) if (nesneMi(a)) alanIdleri.add(String(a.id));
  /** Tanımdaki görünürlüklerin dayandığı, kaydedilecek modelde olmayan alanların adları. @param {unknown} d */
  const eksikDayanaklar = (d) => {
    const idler = new Set();
    const tara = (/** @type {unknown} */ x) => {
      if (Array.isArray(x)) { x.forEach(tara); return; }
      if (!nesneMi(x)) return;
      if (nesneMi(x.gorunurluk)) for (const m of JSON.stringify(gorunurlukIfadesi(tam, x.gorunurluk) ?? {}).match(/"alan":"([^"]+)"/g) ?? []) idler.add(m.slice(8, -1));
      for (const v of Object.values(x)) tara(v);
    };
    tara(d);
    // Modelde hiç olmayan alan genel senaryodandır (ortak akış alanı); akıştan çıkarılmış sayılmaz.
    return [...idler].filter((id) => !alanIdleri.has(id) && etiketler.has(id)).map((id) => `“${etiketler.get(id) ?? id}”`);
  };
  const neden = (/** @type {unknown} */ d) => {
    const e = eksikDayanaklar(d);
    return e.length ? `korunamaz: dayandığı ${e.join(', ')} ${e.length > 1 ? 'alanları' : 'alanı'} akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin)`
      : 'kaydederken korunamadı (diyagramı yeniden açıp deneyin)';
  };
  const adimBul = (/** @type {string} */ id) => akisAdimlari.find((a) => nesneMi(a) && a.id === id);
  const OZELLIK_ADLARI = /** @type {Record<string, string>} */ ({ gorunurluk: 'görünürlük koşulu', pomMetodu: 'kod yöntemi', basariGostergesi: 'başarı göstergesi', zamanAsimiSn: 'sonucu bekleme süresi', not: 'koşu notu' });
  const ozellikAdi = (/** @type {string} */ x) => OZELLIK_ADLARI[x] ?? `“${x}” özelliği`;
  bloklar.forEach((b, i) => {
    const anahtar = (b.tur === 'alanlar' || b.tur === 'aksiyon' || b.tur === 'korunan') && typeof b.korunan === 'string' ? b.korunan : null;
    const k = anahtar ? korunan.parcalar[anahtar] : undefined;
    if (!anahtar || !k) return;
    const baslik = korunan.ozetler[anahtar]?.baslik ?? '';
    if (k.tur === 'adim') {
      const son = adimBul(String(k.adim.id));
      const { sira: _s, ...beklenen } = k.adim;
      const gercek = son ? Object.fromEntries(Object.entries(son).filter(([x]) => x !== 'sira')) : null;
      if (!gercek || !esitMi(beklenen, gercek) || eksikDayanaklar(k.adim).length) hatalar.push({ blok: i, mesaj: `“${baslik}” korunan adımı ${neden(k.adim)}.` });
      return;
    }
    if (k.tur === 'ek') {
      const son = adimBul(k.id);
      /** @type {string[]} */
      const sorunlar = [];
      for (const [x, v] of Object.entries(k.adimEk ?? {})) if (!son || !esitMi(son[x], v) || (x === 'gorunurluk' && eksikDayanaklar({ gorunurluk: v }).length)) sorunlar.push(`${ozellikAdi(x)} ${neden(x === 'gorunurluk' ? { gorunurluk: v } : v)}`);
      for (const [x, v] of Object.entries(k.kosuEk ?? {})) if (!son || !nesneMi(son.kosu) || !esitMi(son.kosu[x], v)) sorunlar.push(`${ozellikAdi(x)} kaydederken korunamadı (diyagramı yeniden açıp deneyin)`);
      const sonAlanlar = son && Array.isArray(son.bolumler) ? son.bolumler.flatMap((/** @type {unknown} */ bb) => (nesneMi(bb) && Array.isArray(bb.alanlar) ? bb.alanlar : [])) : [];
      for (const ka of k.alanlar ?? []) {
        const a = sonAlanlar.find((/** @type {unknown} */ x) => nesneMi(x) && x.id === ka.alan.id);
        if (!a || !esitMi(a, ka.alan) || eksikDayanaklar(ka.alan).length) sorunlar.push(`“${etiketi(ka.alan)}” alanı ${neden(ka.alan)}`);
      }
      for (const s of sorunlar) hatalar.push({ blok: i, mesaj: `“${baslik}” adımında diyagramda düzenlenemeyen ${s}.` });
      return;
    }
    if (k.tur === 'aksiyonlar' && !akisAdimlari.some((a) => nesneMi(a) && nesneMi(a.kosu) && Array.isArray(a.kosu.aksiyonlar) && ardisikParcaMi(a.kosu.aksiyonlar, k.aksiyonlar))) {
      hatalar.push({ blok: i, mesaj: `“${baslik}” adımının korunan aksiyonları kaydederken korunamadı (diyagramı yeniden açıp deneyin).` });
    }
  });
  // Alanların diyagramda gösterilemeyen görünürlük koşulları: alan akışta kaldıysa (ve koşulu elle değiştirilmediyse) aynen olmalı.
  /** @type {Map<string, { blok: number; elle: boolean }>} */
  const gruplar = new Map();
  bloklar.forEach((b, i) => {
    if (b.tur === 'alanlar') for (const a of b.alanlar) gruplar.set(a, { blok: i, elle: Boolean(b.kosullar && Object.prototype.hasOwnProperty.call(b.kosullar, a)) });
  });
  for (const adim of akisAdimlari) {
    for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
        const kk = nesneMi(a) ? korunan.alanKosullari.get(String(a.id)) : undefined;
        const grup = kk ? gruplar.get(kk.anahtar) : undefined;
        if (!kk || !grup || grup.elle || (esitMi(a.gorunurluk, kk.gorunurluk) && !eksikDayanaklar({ gorunurluk: kk.gorunurluk }).length)) continue;
        hatalar.push({ blok: grup.blok, mesaj: `“${kk.etiket}” alanının diyagramda düzenlenemeyen görünürlük koşulu (${kk.aciklama}) ${neden({ gorunurluk: kk.gorunurluk })}.` });
      }
    }
  }
  // Bölüm özellikleri (görünürlük koşulu, kod yöntemi…; bölümle taşınır): alanlarından biri akışta kalan bölüm bu özelliklerle
  // kalmalı. Dayandığı alan akıştan çıkarıldıysa anlaşılır hata; bölümün bütün alanları çıkarıldıysa bölüm (doğal olarak) kalkar.
  const yeniBolumler = akisAdimlari.flatMap((a) => (nesneMi(a) && Array.isArray(a.bolumler) ? a.bolumler : [])).filter((b) => nesneMi(b) && Array.isArray(b.alanlar));
  for (const adim of oncekiAdimlar) {
    for (const eb of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      if (!nesneMi(eb)) continue;
      const ozellik = Object.fromEntries(Object.entries(eb).filter(([x]) => !['id', 'baslik', 'alanlar'].includes(x)));
      if (!Object.keys(ozellik).length) continue;
      const idler = new Set((Array.isArray(eb.alanlar) ? eb.alanlar : []).filter(nesneMi).map((a) => String(a.id)));
      for (const nb of yeniBolumler) {
        const alan = nb.alanlar.find((/** @type {unknown} */ a) => nesneMi(a) && idler.has(String(a.id)));
        if (!alan) continue;
        if (Object.entries(ozellik).every(([x, v]) => esitMi(nb[x], v)) && !eksikDayanaklar({ gorunurluk: ozellik.gorunurluk }).length) continue;
        const ozet = bolumOzeti(tam, eb, etiketler)?.ozet ?? String(eb.baslik || eb.id);
        hatalar.push({ blok: gruplar.get(envanterAnahtari(alan))?.blok ?? null, mesaj: `${ozet}: diyagramda düzenlenemeyen bu bölüm özellikleri ${neden({ gorunurluk: ozellik.gorunurluk })}.` });
        break;
      }
    }
  }
  return hatalar;
}

/**
 * Akışın korunan parçalarından gönderilen bloklarda artık olmayanlar (kaydedince modelden çıkacaklar): "“adım”: özet".
 * @param {Nesne} tam @param {string} akisId @param {import('../tarama/akis-tasarimi.d.mts').AkisBlogu[]} bloklar @param {ReturnType<typeof korunanParcalari>} korunan
 */
function silinenKorunanlar(tam, akisId, bloklar, korunan) {
  const kullanilan = new Set(bloklar.map((b) => ('korunan' in b && typeof b.korunan === 'string' ? b.korunan : null)).filter(Boolean));
  return Object.entries(korunan.ozetler).filter(([k, o]) => o.akis === akisId && !kullanilan.has(k))
    .map(([, o]) => `“${o.baslik}”: ${o.ozet.join('; ') || 'diyagramda düzenlenemeyen parça'}`);
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
 * elleOgeler: diyagramda ELLE tanımlanan alanlar / düğmeler (tarama/akis-tasarimi.mjs > elleOgeleriEkle): envanterin sonuna
 * eklenir; kaydedilince modele yazılır (ör. boş başlayan ortak akışa sıfırdan adım). Ekran ve ortak akış için aynıdır.
 * ekranAcilisSirasi: diyagramdaki "Ekran açılır" düğümünün üstündeki blok sayısı (salt görünüm düğümü; blok değildir). Üstünde
 * yalnız ortak akış blokları olabilir; baştaki ortak akışların hepsi üstündeyse akış "once" (varsayılan), hiçbiri değilse "sonra"
 * (model / akış "bastakiOrtakAkislar") olur. Verilmezse akışın mevcut ayarı korunur.
 * @param {{ akisId?: string | null; ad: unknown; bloklar: unknown; onay?: boolean; kayitEnvanteri?: import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri; testVerisi?: unknown; elleOgeler?: unknown; ekranAcilisSirasi?: unknown }} g
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
  if (ortakAkis && !mevcutAkis) throw new DepoHatasi('Genel senaryonun tek akışı vardır; yeni akış eklenmez, mevcut akış düzenlenir.');
  /** @type {Array<{ blok: number | null; mesaj: string }>} */
  const hatalar = [];
  if (!ad) hatalar.push({ blok: null, mesaj: 'Akışın adını yazın.' });
  else if (liste.some((a) => a.ad.toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR') && a.id !== mevcutAkis?.id)) hatalar.push({ blok: null, mesaj: `“${ad}” adında bir akış zaten var.` });
  const elle = elleOgeleriEkle(g.kayitEnvanteri ?? modeldenAkisEnvanteri(tam), g.elleOgeler);
  hatalar.push(...elle.hatalar);
  const env = elle.envanter;
  const ayik = bloklariAyikla(g.bloklar);
  hatalar.push(...ayik.hatalar);
  if (ortakAkis) ayik.bloklar.forEach((b, i) => { if (b.tur === 'ortak') hatalar.push({ blok: i, mesaj: 'Genel senaryonun içine genel senaryo eklenemez.' }); });
  // Ekran kendini (doğrudan ya da başka bir ekran üzerinden) içeremez.
  if (!ortakAkis) ayik.bloklar.forEach((b, i) => { if (b.tur === 'ortak' && basvuruZincirindeMi(vt, projeId, b.dosya, `${ekran.anahtar}.model.json`)) hatalar.push({ blok: i, mesaj: 'Bir ekran kendi içine (ya da kendini kullanan bir ekrana) eklenemez.' }); });
  // Alanların değer kuralları ("Sınırlar"): yalnız sayı / tarih / metin alanında; ekran modeli doğrulayıcısının kurallarıyla.
  /** @type {Map<string, Nesne>} */
  const modelAlanlari = new Map();
  for (const adim of tumAdimlar(tam)) for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) modelAlanlari.set(String(a.id), a);
  /** @type {Map<string, Nesne | null>} */
  const yeniSinirlar = new Map();
  ayik.bloklar.forEach((b, i) => {
    if (b.tur !== 'alanlar' || !b.sinirlar) return;
    for (const [anahtar, s] of Object.entries(b.sinirlar)) {
      const a = modelAlanlari.get(anahtar);
      if (s && (!a || !SINIRLI_TIPLER.includes(a.tip))) { hatalar.push({ blok: i, mesaj: `“${a ? etiketi(a) : anahtar}” alanına sınır yazılamaz (yalnız sayı, tarih, metin ve telefon alanları).` }); continue; }
      if (s) for (const m of sinirHatalari(/** @type {Nesne} */ (a).tip, s)) hatalar.push({ blok: i, mesaj: `“${etiketi(/** @type {Nesne} */ (a))}” sınırları: ${m}` });
      yeniSinirlar.set(anahtar, s ?? null);
    }
  });
  // Diyagramda düzenlenemeyen (aynen korunan) parçalar: blokların "korunan" anahtarları modeldeki karşılıklarına çözülür.
  const korunan = korunanParcalari(tam);
  // "Ekran açılır" (diyagramda salt görünüm düğümü; g.ekranAcilisSirasi = üstündeki blok sayısı): üstündeki bloklar ekran açılmadan
  // önce koşar — yalnız ortak akış blokları olabilir. Baştaki ortak akışların hepsi üstündeyse "once" (varsayılan), hiçbiri
  // değilse "sonra" (ekran önce açılır; eski davranış). Verilmezse akışın mevcut ayarı korunur.
  /** @type {'once' | 'sonra' | null} */
  let bastakiAyar = null;
  if (!ortakAkis && g.ekranAcilisSirasi !== undefined && g.ekranAcilisSirasi !== null) {
    const k = Number(g.ekranAcilisSirasi);
    const ortakBlokMu = (/** @type {import('../tarama/akis-tasarimi.d.mts').AkisBlogu} */ b) => b.tur === 'ortak'
      || (b.tur === 'korunan' && b.kapsam === 'adim' && nesneMi(/** @type {Nesne | undefined} */ (korunan.parcalar[b.korunan])?.adim?.ortakAkis));
    let bastakiSayi = 0;
    while (bastakiSayi < ayik.bloklar.length && ortakBlokMu(ayik.bloklar[bastakiSayi])) bastakiSayi++;
    if (!Number.isInteger(k) || k < 0 || k > ayik.bloklar.length) hatalar.push({ blok: null, mesaj: '“Ekran açılır”ın yeri okunamadı; diyagramı yeniden açın.' });
    else if (k > bastakiSayi) hatalar.push({ blok: bastakiSayi, mesaj: '“Ekran açılır”ın üstünde yalnız genel senaryo blokları olabilir (ekran açılmadan önce yalnız genel senaryolar koşar); bu bloğu “Ekran açılır”ın altına taşıyın.' });
    else if (k > 0 && k < bastakiSayi) hatalar.push({ blok: k, mesaj: 'Baştaki genel senaryoların hepsi “Ekran açılır”ın üstünde (ekran açılmadan önce) ya da hepsi altında (ekran açıldıktan sonra) olmalı.' });
    else bastakiAyar = bastakiSayi > 0 && k === 0 ? 'sonra' : 'once';
  }
  const cevrim = ayik.hatalar.length || elle.hatalar.length ? { envanter: null, hatalar: [] } : akistanKayitEnvanteri(env, ayik.bloklar, { satirSiniri: sqlSatirSiniriOku(vt), korunanlar: korunan.parcalar });
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
  // Diyagramda düzenlenen sınırlar (verilmeyen alanın mevcut kuralı eşleşen tanımdan korunur; null: kaldırılır).
  for (const adim of akisAdimlari) {
    for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a) || !yeniSinirlar.has(String(a.id))) continue;
        const s = yeniSinirlar.get(String(a.id));
        if (s) a.sinirlar = kopya(s); else delete a.sinirlar;
      }
    }
  }

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
    // "“…” dahil" ayarının "Yeni senaryolarda dahil" seçimi (varsayilan) diyagramdan güncellenir; ayarın geri kalanı korunur.
    if (nesneMi(a) && a.tip === 'onayKutusu') {
      const i = sd.findIndex((x) => nesneMi(x) && x.id === a.id);
      if (i >= 0 && nesneMi(sd[i]) && sd[i].tip === 'onayKutusu') {
        const { varsayilan: _eski, ...kalan } = /** @type {Nesne} */ (sd[i]);
        sd[i] = nesneMi(a.varsayilan) ? { ...kalan, varsayilan: kopya(a.varsayilan) } : kalan;
      }
    }
  }
  yeni.senaryoDuzeyi = { ...(nesneMi(yeni.senaryoDuzeyi) ? yeni.senaryoDuzeyi : {}), alanlar: sd };
  const akislar = Array.isArray(yeni.akislar) && yeni.akislar.length ? yeni.akislar
    : [{ id: ANA_AKIS_ID, ad: 'Ana akış', varsayilan: true, adimlar: yeni.adimlar, ...(yeni.bastakiOrtakAkislar === 'sonra' ? { bastakiOrtakAkislar: 'sonra' } : {}) }];
  // Baştaki ortak akışların sırası (akışın ayarı; yalnız "sonra" yazılır, varsayılan "once" yazılmaz).
  const sonra = !ortakAkis && (bastakiAyar ?? (mevcutAkis ? /** @type {Nesne} */ (akisModeli(tam, mevcutAkis.id)).bastakiOrtakAkislar : null)) === 'sonra';
  /** @param {Nesne} a */
  const ayarla = (a) => { if (sonra) a.bastakiOrtakAkislar = 'sonra'; else delete a.bastakiOrtakAkislar; return a; };
  let akisId;
  if (mevcutAkis) {
    akisId = mevcutAkis.id;
    const i = akislar.findIndex((/** @type {Nesne} */ a) => a.id === akisId);
    akislar[i] = ayarla({ ...akislar[i], ad, adimlar: akisAdimlari });
    if (akislar[i].varsayilan === true) { yeni.adimlar = akisAdimlari; ayarla(yeni); }
  } else {
    akisId = akisKimligi(ad, new Set(akislar.map((/** @type {Nesne} */ a) => a.id)));
    akislar.push(ayarla({ id: akisId, ad, adimlar: akisAdimlari }));
  }
  yeni.akislar = akislar;
  // Ortak akış tek akışlıdır (örtük "Ana akış").
  if (ortakAkis) delete yeni.akislar;
  // Kilitli koşulu değiştirilen / kaldırılan alanların ("Koşulu değiştir") eski adlı koşulu artık hiçbir yerde kullanılmıyorsa
  // çıkarılır (yerine yenisi yazıldı; bağsız koşul olarak kalmaz). Başka bir yerde kullanılıyorsa kalır.
  /** @type {Set<string>} */
  const degisenKosullar = new Set();
  for (const b of ayik.bloklar) {
    if (b.tur !== 'alanlar' || !b.kosullar) continue;
    for (const x of korunan.alanKosullari.values()) {
      if (Object.prototype.hasOwnProperty.call(b.kosullar, x.anahtar) && b.alanlar.includes(x.anahtar) && typeof x.gorunurluk.kosul === 'string') degisenKosullar.add(x.gorunurluk.kosul);
    }
  }
  if (degisenKosullar.size) {
    const bagsiz = new Set(bagsizKosulUyarilari(yeni).map((u) => u.yer.replace(/^kosullar\./, '')));
    for (const ad of degisenKosullar) if (bagsiz.has(ad)) delete yeni.kosullar[ad];
  }
  // Korunan parçalar aynen yazıldı mı (dayandığı alan silindiyse anlaşılır hatayla reddedilir; sessiz kayıp olmaz)?
  // Bölüm özellikleri yalnız diyagramdan kaydederken denetlenir (akış kaydında bölümler sayfanın bölümleridir).
  const oncekiAdimlar = mevcutAkis && !g.kayitEnvanteri ? /** @type {Nesne[]} */ (/** @type {Nesne} */ (akisModeli(tam, mevcutAkis.id)).adimlar ?? []) : [];
  const korunmayan = korunanDenetimi(tam, yeni, akisAdimlari, ayik.bloklar, korunan, oncekiAdimlar);
  if (korunmayan.length) throw new EkranDogrulamaHatasi(`Diyagramda düzeltilmesi gereken ${korunmayan.length} sorun var.`, korunmayan);
  modeliDogrula(vt, projeId, yeni, `${ekran.anahtar}.model.json`);
  // Eski biçimli (sürüm 1; ör. otomatik tarama) modele diyagram koşu tanımı yazdıysa model sürüm 2'ye yükseltildi (modeliDogrula).
  const semaYukseltme = Number(yeni.semaSurumu) > Number(tam.semaSurumu || 1);

  const varsayilan = liste[0]?.id ?? ANA_AKIS_ID;
  const etkilenen = mevcutAkis ? akisSenaryolari(vt, ekranId, akisId, varsayilan) : [];
  // Kayıttan yazılan akış: yakalanan seçenek listeleri (paketin testVerisi bölümü) tam modelle birlikte önizlenir / yazılır.
  const tvPaketi = g.kayitEnvanteri && nesneMi(paket.testVerisi) ? { meta: paket.meta, model: yeni, testVerisi: paket.testVerisi } : null;
  if (g.onay !== true) {
    const onizleme = tvPaketi ? paketTestVerisiOnizle(vt, projeId, tvPaketi, ekranId) : null;
    // Bağlantılar yeni model sürümüyle birlikte yazılır (bulgu beklemez): alanlar yazıldığında modelde olur.
    const testVerisi = onizleme ? { ...onizleme, baglantilar: onizleme.baglantilar.map((b) => ({ ...b, modeldeVar: true })) } : null;
    // Güncellenen akışın korunan parçalarından diyagramda artık olmayanlar (kullanıcı sildi / kayıt yerine geçti): onayda gösterilir.
    const korunanSilinen = mevcutAkis ? silinenKorunanlar(tam, mevcutAkis.id, ayik.bloklar, korunan) : [];
    return { etki: { yeni: !mevcutAkis, senaryolar: etkilenen, ...(korunanSilinen.length ? { korunanSilinen } : {}), ...(ortakAkis ? { ekranlar: ortakAkisKullananlari(vt, projeId, ekranId) } : {}), ...(semaYukseltme ? { semaYukseltme } : {}) }, akisId, ...(testVerisi ? { testVerisi } : {}) };
  }
  return vt.islem(() => {
    const { surum } = ekranModeliEkle(vt, { ekranId, model: yeni, aciklama: `Akış ${mevcutAkis ? 'düzenlendi' : 'eklendi'}: ${ad}${semaYukseltme ? ' (model yeni biçime güncellendi)' : ''}` });
    const tv = tvPaketi ? paketTestVerisiniYaz(vt, projeId, ekranId, tvPaketi, g.testVerisi) : null;
    return { akisId, surum, ...(semaYukseltme ? { semaYukseltme } : {}), ...(tv ? { testVerisi: { tablolar: tv.tablolar, baglanan: tv.baglanan } } : {}) };
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
  const yeniVarsayilan = yeni.akislar.find((/** @type {Nesne} */ a) => a.id === akisId);
  yeni.adimlar = yeniVarsayilan.adimlar;
  // Model kökündeki "baştaki ortak akışlar" ayarı varsayılan akışınkidir.
  if (yeniVarsayilan.bastakiOrtakAkislar === 'sonra') yeni.bastakiOrtakAkislar = 'sonra'; else delete yeni.bastakiOrtakAkislar;
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
