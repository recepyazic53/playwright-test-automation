// Sonuçlar > Genel > "Özet" sekmesi (#/sonuclar/ozet; Genel'in varsayılan sekmesi): kullanıcının düzenleyebildiği bir PANO
// (ozet-panosu.js). Varsayılan pano bugünkü Özet'tir: Başlarken, Ekranlar / Servisler / Uçtan uca özet kutuları (seçili dönemin
// başarı oranı, önceki eşit döneme göre ▲▼; tıklayınca ilgili sekme) ve Dikkat / Bakım / Kapsam ve güvenlik kartları. Kullanıcı
// "Panoyu düzenle" ile kartları kaldırır, "Kart ekle" ile geri ekler ya da SQL / Nöbetçi verisi / metin kartı ekler, taşır,
// boyutlandırır; düzen proje başına kasada saklanır. Bu dosya sayfa kabuğunu (başlık, sekmeler; genel dönem seçici yok — dönem kart başına) ve YERLEŞİK kartları
// üretir. Yerleşik kart verisi tek uçtan gelir (GET /platform/sonuclar/farkindalik — sonuclar/farkindalik.mjs; sunucuda kısa
// önbellekli) ve yalnız panoda o kartlardan biri varsa istenir; kartlar iskeletle ayrı yüklenir (sayfa açılışını bekletmez).
// Kurallar: her madde tıklanabilir ve ilgili ekranı açar; kartta ilk KART_ILK maddesi görünür, gerisi "Tümü (N)" ile açılır; madde
// yoksa kart tek satırlık "Sorun yok" olur. Maddelerde yalnız ad ve sayı vardır (adlar sunucuda maskelenir); DOM'a yalnız metin
// yazılır (h(); innerHTML yok). Eşikler Ayarlar > Raporlar > Eşikler'ndedir.
// Adresler: #/sonuclar/ozet/duzenle düzenleme kipini, #/sonuclar/ozet/kart-ekle "Kart ekle" penceresini açar (hızlı arama).
import { api, h, ikon, rozet } from './ortak.js';
import { araligiSorguyaEkle } from './tarih-araligi.js';
import { farkHapi, oranSaglikSinifi, trendKarti } from './sonuclar.js';
import { baslarkenKarti } from './baslarken.js';
import { ozetPanosu } from './ozet-panosu.js';

/** Kartta ilk bakışta gösterilen madde. */
export const KART_ILK = 5;

const KUTULAR = [
  ['ekran', 'Ekranlar', 'ekran', '#/sonuclar/ekranlar'],
  ['servis', 'Servisler', 'ag', '#/sonuclar/servisler'],
  ['uctanUca', 'Uçtan uca', 'katman', '#/sonuclar/uctan-uca']
];
const KARTLAR = [
  ['dikkat', 'Dikkat', 'uyari', 'Kritik, P1 ya da uzun süredir kırmızı öğeler, yavaşlayan servisler, kaçan planlı koşular, çalışan kurtarma kuralları'],
  ['bakim', 'Bakım', 'duzenle', 'Eskiyen tarihler, koşmayan senaryolar, bekleyen bulgular, test verisi sağlığı'],
  ['kapsam', 'Kapsam ve güvenlik', 'kalkan', 'Senaryosuz metotlar, denenmemiş koşul dalları, yedek, riskli izinler, ortam türü']
];

/** Sağlık sınıfı → özet kutusunun renk sınıfı. */
const KUTU_SINIFI = { basari: 'basarili', uyari: 'uyari', hata: 'basarisiz' };

const yuzde = (v) => (v === null || v === undefined ? '—' : `%${Math.round(v).toLocaleString('tr-TR')}`);

/**
 * @param {HTMLElement} icerik
 * @param {{ id: string; ad: string }} proje
 * @param {HTMLElement} sekmeler Genel sekme çubuğu (Özet seçili)
 * @param {() => void} aralikDegisti tarih aralığı değişince ekran yeniden yüklenir
 * @param {string} [altAdres] "duzenle" (düzenleme kipi) ya da "kart-ekle" (düzenleme kipi + Kart ekle penceresi)
 */
export function sonucOzetiEkrani(icerik, proje, sekmeler, aralikDegisti, altAdres) {
  // Panonun GENEL dönem seçicisi yoktur: döneme bağlı her kartın başlığında kendi dönem seçimi durur (ozet-panosu.js; kart.donem).
  void aralikDegisti;
  const notAlani = h('div', {});
  const panoAlani = h('div', { class: 'ozet-panosu-kap' });
  const eylemler = h('div', { class: 'eylemler' });
  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar/ozet' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Genel')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Sonuçlar — '), 'Genel'))),
      eylemler),
    sekmeler,
    panoAlani,
    notAlani);

  // Yerleşik kartların verisi (tek uç): döneme göre ayrı istek; aynı dönemi isteyen kartlar aynı yanıtı paylaşır. Dikkat / Bakım /
  // Kapsam ve güvenlik döneme bağlı değildir (dönemsiz istek: sunucunun varsayılan penceresi). Panoda bu kartlardan hiçbiri yoksa
  // istek gitmez.
  /** @type {Map<string, Promise<any>>} */
  const sozler = new Map();
  const farkindalik = (/** @type {object | null} */ donem) => {
    const d = donem && !(/** @type {any} */ (donem).hizli === 'tumu') ? donem : null;
    const anahtar = JSON.stringify(d);
    if (!sozler.has(anahtar)) {
      const sorgu = new URLSearchParams({ projeId: proje.id });
      if (d) araligiSorguyaEkle(sorgu, d);
      sozler.set(anahtar, api(`/platform/sonuclar/farkindalik?${sorgu}`).then((v) => {
        if (v.hesaplanamayan && v.hesaplanamayan.length) {
          notAlani.replaceChildren(h('p', { class: 'soluk kucuk farkindalik-notu', role: 'note' }, ikon('uyari'),
            `Hesaplanamayan: ${v.hesaplanamayan.map((x) => `${x.sinyal} (${x.neden})`).join('; ')}`));
        }
        return v;
      }).catch((e) => { sozler.delete(anahtar); throw e; }));
    }
    return /** @type {Promise<any>} */ (sozler.get(anahtar));
  };

  /** Yerleşik kartlar (pano türü → öğe üreticisi; döneme bağlı kartlar kartın dönemini alır). */
  const yerlesik = {
    // Başlarken: ilk koşuya giden yol (tamamlanınca ya da gizlenince kaybolur; baslarken.js).
    baslarken: () => baslarkenKarti(proje),
    ozetKutulari: (/** @type {object} */ donem) => ozetKutulariKarti(() => farkindalik(donem)),
    dikkat: () => farkindalikKarti(KARTLAR[0], () => farkindalik(null)),
    bakim: () => farkindalikKarti(KARTLAR[1], () => farkindalik(null)),
    kapsam: () => farkindalikKarti(KARTLAR[2], () => farkindalik(null)),
    kosuTrendi: (/** @type {object} */ donem) => kosuTrendiKarti(proje, donem)
  };
  ozetPanosu(panoAlani, { proje, yerlesik, eylemler, altAdres: altAdres || '' });
}

/** Özet kutuları (üç kutu; veri gelince dolar) ve altında dönem açıklaması. @param {() => Promise<any>} veri */
function ozetKutulariKarti(veri) {
  const kutuAlani = h('div', { class: 'sonuc-kartlari ozet-kutulari', 'aria-busy': 'true' },
    KUTULAR.map(([anahtar, etiket]) => h('div', { class: 'sonuc-karti ozet-kutusu yukleniyor', 'data-kutu': anahtar },
      h('span', { class: 'kart-etiket' }, etiket), h('div', { class: 'iskelet' }, h('i', { class: 'yarim' }), h('i', {})))));
  // Kartın dönemi "Tümü" iken özet, önceki eşit dönemle karşılaştırılabilsin diye son 30 günü kullanır; bunu açıkça söyler.
  const donemMetni = h('span', { class: 'mono' });
  const donemNotu = h('span', { class: 'ozet-donem-notu', hidden: true }, ' Özet, önceki dönemle karşılaştırabilmek için sabit bir dönem kullanır; başka dönem için kartın dönemini seçin.');
  const donemSatiri = h('p', { class: 'soluk kucuk ozet-donem-metni', hidden: true }, ikon('takvim'), 'Dönem ', donemMetni, donemNotu);
  veri().then((v) => {
    kutuAlani.removeAttribute('aria-busy');
    kutuAlani.replaceChildren(...KUTULAR.map(([anahtar, etiket, ikonAd, adres]) => ozetKutusu(v.ozet[anahtar], etiket, ikonAd, adres)));
    if (v.donem) {
      donemMetni.textContent = v.donem.tumu
        ? `son 30 gün (${v.donem.etiket}) · önceki 30 gün (${v.donem.oncekiEtiket})`
        : `${v.donem.etiket} · önceki ${v.donem.oncekiEtiket}`;
      donemNotu.hidden = !v.donem.tumu;
      donemSatiri.hidden = false;
    }
  }).catch((e) => {
    kutuAlani.removeAttribute('aria-busy');
    kutuAlani.replaceChildren();
    if (!(e && e.durum === 423)) kutuAlani.append(h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
  });
  const parca = document.createDocumentFragment();
  parca.append(kutuAlani, donemSatiri);
  return parca;
}

/** Dikkat / Bakım / Kapsam ve güvenlik kartı. @param {string[]} tanim @param {() => Promise<any>} veri */
function farkindalikKarti([anahtar, baslik, ikonAd, aciklama], veri) {
  const basId = `farkindalik-${anahtar}`;
  const govde = h('div', { class: 'farkindalik-govdesi' }, h('div', { class: 'iskelet', 'aria-busy': 'true' },
    h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', {}), h('i', { class: 'yarim' })));
  const sayac = h('span', { class: 'farkindalik-sayaci' });
  const kart = h('section', { class: `kart farkindalik-karti ${anahtar}`, 'aria-labelledby': basId, 'data-kart': anahtar },
    h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon(ikonAd), baslik), sayac),
    h('p', { class: 'gorunmez' }, aciklama), govde);
  veri().then((v) => kartCiz({ kart, govde, sayac }, v.kartlar[anahtar])).catch((e) => {
    if (e && e.durum === 423) return;
    govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
  });
  return kart;
}

/** Koşu trendi (Genel kapsamlı tam koşular; Ekranlar sekmesindeki grafikle aynı bileşen). @param {{ id: string }} proje */
function kosuTrendiKarti(proje, donem) {
  const kap = h('div', { class: 'pano-trend' }, h('section', { class: 'kart' }, h('div', { class: 'iskelet', 'aria-busy': 'true' },
    h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' }))));
  api(`/platform/sonuclar/ozet?${araligiSorguyaEkle(new URLSearchParams({ projeId: proje.id }), donem || { hizli: 'tumu' })}`)
    .then((ozet) => kap.replaceChildren(trendKarti(ozet.trend, null, { digerNoktalar: ozet.trendTumKapsamlar || [] })))
    .catch((e) => { if (!(e && e.durum === 423)) kap.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e))); });
  return kap;
}

/** Özet kutusu: dönem başarı oranı, önceki döneme göre fark (puan), sayılar; tıklayınca ilgili sekme. */
function ozetKutusu(k, etiket, ikonAd, adres) {
  const fark = k && k.basari !== null && k.oncekiBasari !== null ? Math.round(k.basari - k.oncekiBasari) : null;
  // Renk, soldaki "Sağlık noktası" açıklamasıyla aynı eşiklerden (oranSaglikSinifi): yeşil / sarı / kırmızı.
  const sinif = !k || k.basari === null ? '' : KUTU_SINIFI[oranSaglikSinifi(k.basari)] || '';
  // Erişilebilir ad kartın görünen içeriğidir (aria-label yok: ad görünen metinle başlasın); sonda yalnız ekran okuyucu için eylem.
  return h('a', { class: `sonuc-karti ozet-kutusu ${sinif}`, href: adres },
    h('span', { class: 'kart-etiket' }, ikon(ikonAd), etiket),
    h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, k ? yuzde(k.basari) : '—'), h('small', {}, 'başarı')),
    h('div', { class: 'kart-alt' },
      fark === null ? h('span', { class: 'fark notr' }, k && k.oncekiAdet ? '—' : 'önceki yok') : farkHapi(fark, fark > 0, ' puan'),
      h('span', {}, k && k.adet ? `${k.adet.toLocaleString('tr-TR')} ${k.birim} · ${k.kalan.toLocaleString('tr-TR')} başarısız` : 'Bu dönemde koşu yok')),
    h('span', { class: 'gorunmez' }, ' — sekmeyi aç'));
}

/** Kart gövdesi: madde listesi (ilk KART_ILK; "Tümü (N)" açar) ya da "Sorun yok". */
function kartCiz(k, veri) {
  const toplam = veri ? veri.toplam : 0;
  const maddeler = veri ? veri.maddeler : [];
  k.sayac.replaceChildren(toplam ? rozet(String(toplam), k.kart.dataset.kart === 'dikkat' ? 'hata' : 'atlanan') : rozet('0', 'basari'));
  if (!toplam) {
    k.kart.classList.add('temiz');
    k.govde.replaceChildren(h('p', { class: 'farkindalik-temiz', role: 'status' }, ikon('onay'), 'Sorun yok.'));
    return;
  }
  const satir = (m) => h('li', {}, h('a', { href: m.adres, class: `farkindalik-maddesi m-${m.tur}` },
    h('span', { class: 'farkindalik-adi' }, m.ad), h('span', { class: 'farkindalik-ayrintisi' }, m.ayrinti)));
  const liste = h('ul', { class: 'farkindalik-listesi' }, maddeler.slice(0, KART_ILK).map(satir));
  const cocuklar = [liste];
  if (toplam > KART_ILK) {
    let acik = false;
    const dugme = h('button', { type: 'button', class: 'kucuk-dugme hayalet farkindalik-tumu', 'aria-expanded': 'false' });
    const etiketle = () => { dugme.replaceChildren(ikon(acik ? 'eksi' : 'asagi'), acik ? 'Daha az göster' : `Tümü (${toplam})`); dugme.setAttribute('aria-expanded', String(acik)); };
    dugme.addEventListener('click', () => {
      acik = !acik;
      liste.replaceChildren(...(acik ? maddeler : maddeler.slice(0, KART_ILK)).map(satir));
      etiketle();
    });
    etiketle();
    cocuklar.push(dugme);
    if (maddeler.length < toplam) cocuklar.push(h('p', { class: 'soluk kucuk' }, `İlk ${maddeler.length} madde gösteriliyor.`));
  }
  k.govde.replaceChildren(...cocuklar);
}
