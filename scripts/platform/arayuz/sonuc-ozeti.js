// Sonuçlar > Genel > "Özet" sekmesi (#/sonuclar/ozet; Genel'in varsayılan sekmesi): üstte Ekranlar / Servisler / Uçtan uca özet
// kutuları (seçili dönemin başarı oranı, önceki eşit döneme göre ▲▼; tıklayınca ilgili sekme), altında Dikkat / Bakım / Kapsam ve
// güvenlik kartları. Veri tek uçtan gelir (GET /platform/sonuclar/farkindalik — sonuclar/farkindalik.mjs; sunucuda kısa önbellekli):
// başlık, sekmeler ve tarih aralığı hemen çizilir, kutular ve kartlar iskeletle ayrı yüklenir (sayfa açılışını bekletmez).
// Kurallar: her madde tıklanabilir ve ilgili ekranı açar; kartta ilk KART_ILK maddesi görünür, gerisi "Tümü (N)" ile açılır; madde
// yoksa kart tek satırlık "Sorun yok" olur. Maddelerde yalnız ad ve sayı vardır (adlar sunucuda maskelenir); DOM'a yalnız metin
// yazılır (h(); innerHTML yok). Eşikler Ayarlar > Arayüz > Sonuçlar özeti'ndedir.
import { api, h, ikon, rozet } from './ortak.js';
import { aralikMetni, araligiSorguyaEkle, kayitliAralik, tarihAraligiSecici } from './tarih-araligi.js';
import { farkHapi, oranSaglikSinifi } from './sonuclar.js';
import { baslarkenKarti } from './baslarken.js';

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
 */
export function sonucOzetiEkrani(icerik, proje, sekmeler, aralikDegisti) {
  const donemMetni = h('span', { class: 'mono' }, aralikMetni(kayitliAralik()) || '');
  const donemNotu = h('span', { class: 'soluk kucuk ozet-donem-notu', hidden: true },
    'Özet, önceki dönemle karşılaştırabilmek için sabit bir dönem kullanır; başka dönem için tarih aralığını seçin.');
  const kutuAlani = h('div', { class: 'sonuc-kartlari ozet-kutulari', 'aria-busy': 'true' },
    KUTULAR.map(([anahtar, etiket]) => h('div', { class: 'sonuc-karti ozet-kutusu yukleniyor', 'data-kutu': anahtar },
      h('span', { class: 'kart-etiket' }, etiket), h('div', { class: 'iskelet' }, h('i', { class: 'yarim' }), h('i', {})))));
  const kartlar = Object.fromEntries(KARTLAR.map(([anahtar, baslik, ikonAd, aciklama]) => {
    const basId = `farkindalik-${anahtar}`;
    const govde = h('div', { class: 'farkindalik-govdesi' }, h('div', { class: 'iskelet', 'aria-busy': 'true' },
      h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', {}), h('i', { class: 'yarim' })));
    const sayac = h('span', { class: 'farkindalik-sayaci' });
    const kart = h('section', { class: `kart farkindalik-karti ${anahtar}`, 'aria-labelledby': basId, 'data-kart': anahtar },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon(ikonAd), baslik), sayac),
      h('p', { class: 'gorunmez' }, aciklama), govde);
    return [anahtar, { kart, govde, sayac, baslik }];
  }));
  const notAlani = h('div', {});
  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar/ozet' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Genel')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Sonuçlar — '), 'Genel')),
        h('div', { class: 'meta' }, h('span', {}, ikon('takvim'), 'Dönem ', donemMetni), donemNotu))),
    sekmeler,
    // Başlarken: ilk koşuya giden yol (tamamlanınca ya da gizlenince kaybolur; baslarken.js).
    baslarkenKarti(proje),
    h('section', { class: 'kart sonuc-araligi', 'aria-label': 'Tarih aralığı süzgeci' }, tarihAraligiSecici({ degisti: () => aralikDegisti() })),
    kutuAlani,
    h('div', { class: 'farkindalik-kartlari' }, KARTLAR.map(([a]) => kartlar[a].kart)),
    notAlani);

  const sorgu = araligiSorguyaEkle(new URLSearchParams({ projeId: proje.id }), kayitliAralik());
  api(`/platform/sonuclar/farkindalik?${sorgu}`).then((v) => {
    // Tarih aralığı "Tümü" iken özet, önceki eşit dönemle karşılaştırılabilsin diye son 30 günü kullanır; bunu açıkça söyle.
    if (v.donem) {
      donemMetni.textContent = v.donem.tumu
        ? `son 30 gün (${v.donem.etiket}) · önceki 30 gün (${v.donem.oncekiEtiket})`
        : `${v.donem.etiket} · önceki ${v.donem.oncekiEtiket}`;
      donemNotu.hidden = !v.donem.tumu;
    }
    kutuAlani.removeAttribute('aria-busy');
    kutuAlani.replaceChildren(...KUTULAR.map(([anahtar, etiket, ikonAd, adres]) => ozetKutusu(v.ozet[anahtar], etiket, ikonAd, adres)));
    for (const [anahtar] of KARTLAR) kartCiz(kartlar[anahtar], v.kartlar[anahtar]);
    if (v.hesaplanamayan && v.hesaplanamayan.length) {
      notAlani.replaceChildren(h('p', { class: 'soluk kucuk farkindalik-notu', role: 'note' }, ikon('uyari'),
        `Hesaplanamayan: ${v.hesaplanamayan.map((x) => `${x.sinyal} (${x.neden})`).join('; ')}`));
    }
  }).catch((e) => {
    if (e && e.durum === 423) return;
    kutuAlani.removeAttribute('aria-busy');
    kutuAlani.replaceChildren();
    for (const [anahtar] of KARTLAR) kartlar[anahtar].govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
  });
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
