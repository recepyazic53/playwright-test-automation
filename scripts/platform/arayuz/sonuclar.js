// "Sonuçlar" ekranı (genel, veritabanı kaynaklı): solda ürün/ekran listesi (Genel + ekranlar);
// sağda üst kartlar (önceki koşuya göre fark), trend, koşu geçmişi ve hata kalıpları. Koşu
// detayı (senaryo bazında sonuçlar) ve test detayı (hata, beklenen/görülen, adımlar, ekran
// görüntüleri, video, indirme, atlanan alanlar) aynı ekranda açılır.
// Adresler: #/sonuclar, #/sonuclar/u/<ürün>, #/sonuclar/kosu/<id>, #/sonuclar/sonuc/<id>
// Medya (ekran görüntüsü/video/iz) şifrelidir; sunucu /platform/medya/<id> ile kasa açıkken
// çözerek akıtır. <img>/<video> başlık gönderemediği için oturum token'ı sorgu parametresidir.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, TOKEN, tarihMetni } from './ortak.js';

const SAYFA_BOYU = 15;
const DURUM = {
  basarili: { etiket: 'Başarılı', sinif: 'basari' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata' },
  atlanan: { etiket: 'Atlanan', sinif: '' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'uyari' }
};
const KOSU_DURUMU = { calisiyor: 'Çalışıyor', tamamlandi: 'Tamamlandı', durduruldu: 'Durduruldu', zaman_asimi: 'Zaman aşımı', hata: 'Hata' };
const KART_SIRASI = ['basarili', 'basarisiz', 'atlanan', 'durduruldu'];

const medyaUrl = (id, indir = false) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}${indir ? '&indir=1' : ''}`;
const durumRozeti = (d) => h('span', { class: `rozet ${(DURUM[d] || {}).sinif || ''}` }, (DURUM[d] || { etiket: d }).etiket);
const sureMetni = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} sn` : `${Math.floor(ms / 60000)} dk ${Math.round((ms % 60000) / 1000)} sn`);
const toplam = (s) => (s ? s.basarili + s.basarisiz + s.atlanan + (s.durduruldu || 0) : 0);
const oran = (s) => {
  const payda = s.basarili + s.basarisiz + s.atlanan;
  return payda ? Math.round((s.basarili / payda) * 100) : null;
};
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/sonuclar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function sonuclarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik] = parcalar;
  const icerik = h('section', { class: 'sonuc-icerik', 'aria-live': 'polite' }, h('p', { class: 'soluk' }, 'Yükleniyor…'));
  const liste = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler' }, h('span', { class: 'soluk kucuk' }, 'Yükleniyor…'));
  main.replaceChildren(h('h1', { class: 'gorunmez' }, 'Sonuçlar'), h('div', { class: 'ayarlar-duzeni sonuclar-duzeni' }, liste, icerik));
  const secili = tur === 'u' && kimlik ? decodeURIComponent(kimlik) : tur ? null : '';
  const hata = (e) => { if (e && e.durum === 423) return; icerik.replaceChildren(hataKutusu(e)); };

  // Sol liste her görünümde aynı özetten gelir (koşu/sonuç detayında seçili ürün yok).
  api(`/platform/sonuclar/ozet?projeId=${encodeURIComponent(proje.id)}${secili ? `&urun=${encodeURIComponent(secili)}` : ''}`)
    .then((ozet) => {
      urunListesi(liste, ozet.ekranlar, secili);
      if (tur === 'kosu' && kimlik) return kosuDetayi(icerik, decodeURIComponent(kimlik), proje);
      if (tur === 'sonuc' && kimlik) return sonucDetayi(icerik, decodeURIComponent(kimlik));
      const ekran = secili ? ozet.ekranlar.find((e) => e.anahtar === secili) : null;
      return genelBakis(icerik, ozet, proje, secili || null, ekran ? ekran.ad : secili ? secili.replace(/^ad:/, '') : null);
    })
    .catch(hata);
}

function urunListesi(nav, ekranlar, secili) {
  const baglanti = (anahtar, ad, ek) => h('a', {
    href: anahtar ? `#/sonuclar/u/${encodeURIComponent(anahtar)}` : '#/sonuclar',
    'aria-current': (secili || '') === (anahtar || '') && secili !== null ? 'page' : null
  }, ad, ek ? h('span', { class: 'soluk kucuk' }, ` ${ek}`) : null);
  nav.replaceChildren(
    baglanti('', 'Genel'),
    h('div', { class: 'soluk kucuk alt-nav-baslik' }, 'Ürünler / ekranlar'),
    ...ekranlar.map((e) => baglanti(e.anahtar, e.ad, e.senaryoSayisi ? `(${e.senaryoSayisi})` : null)));
}

// ---------------------------------------------------------------------------------------
// Genel bakış / ürün sayfası
// ---------------------------------------------------------------------------------------

function genelBakis(icerik, ozet, proje, urun, urunAdi) {
  const kaliplarAlani = h('div', {});
  icerik.replaceChildren(
    h('h2', { tabindex: '-1' }, urunAdi ? `Sonuçlar — ${urunAdi}` : 'Sonuçlar — Genel'),
    kartlar(ozet.kart, urun),
    h('div', { class: 'kart' }, h('h3', {}, 'Koşu trendi'),
      h('p', { class: 'soluk kucuk' }, urun ? 'Bu ürünü içeren tam koşular (yalnızca bu ürünün sonuçları).' : 'Genel kapsamlı tam koşular. Tekil koşular trende girmez.'),
      trendGrafigi(ozet.trend)),
    kosuGecmisi(ozet.kosuGecmisi, urun),
    kaliplarAlani);
  hataKaliplariBolumu(kaliplarAlani, proje, urun);
}

function kartlar(kart, urun) {
  if (!kart) {
    return h('div', { class: 'kart' }, h('p', { class: 'bos-liste', role: 'status' }, 'Henüz koşu yok.'),
      h('p', { class: 'soluk kucuk' }, 'Kartlar yalnızca tam koşulardan hesaplanır (Koşuyu başlat, terminal/CI koşuları). Tekil ▷ koşuları koşu geçmişinde görünür.'));
  }
  const son = kart.son;
  const onceki = kart.onceki;
  const fark = (anahtar) => {
    if (!onceki) return null;
    const f = son[anahtar] - onceki[anahtar];
    if (f === 0) return h('span', { class: 'fark soluk' }, 'değişim yok');
    const iyi = anahtar === 'basarili' ? f > 0 : f < 0;
    return h('span', { class: `fark ${iyi ? 'iyi' : 'kotu'}` }, `${f > 0 ? '+' : '−'}${Math.abs(f)} önceki koşuya göre`);
  };
  const oranSimdi = oran(son);
  const oranOnce = onceki ? oran(onceki) : null;
  const oranFarki = oranSimdi !== null && oranOnce !== null && oranSimdi !== oranOnce
    ? h('span', { class: `fark ${oranSimdi > oranOnce ? 'iyi' : 'kotu'}` }, `${oranSimdi > oranOnce ? '+' : '−'}${Math.abs(oranSimdi - oranOnce)} puan`)
    : null;
  const kaynak = urun
    ? ['Son tam koşu: ', tarihMetni(new Date(son.z).toISOString()), son.kapsam ? ' · ' : '', son.kapsam ? h('span', { class: 'rozet vurgu' }, son.kapsam) : null]
    : [`Her ürünün son tam koşusunun toplamı (${kart.urunSayisi} ürün; en yenisi ${tarihMetni(new Date(kart.enYeniZ).toISOString())}).`];
  return h('div', {},
    h('div', { class: 'sonuc-kartlari' },
      ...KART_SIRASI.map((a) => h('div', { class: `sonuc-karti ${a}` },
        h('span', { class: 'kart-etiket' }, DURUM[a].etiket), h('strong', { class: 'kart-sayi' }, String(son[a] || 0)), fark(a))),
      h('div', { class: 'sonuc-karti oran' }, h('span', { class: 'kart-etiket' }, 'Başarı oranı'),
        h('strong', { class: 'kart-sayi' }, oranSimdi === null ? '—' : `%${oranSimdi}`), oranFarki)),
    h('p', { class: 'soluk kucuk' }, ...kaynak, onceki ? '' : ' Önceki koşu olmadığı için fark gösterilmiyor.'));
}

function trendGrafigi(noktalar) {
  if (!noktalar.length) return h('p', { class: 'bos-liste' }, 'Henüz tam koşu yok.');
  const son = noktalar.slice(-30);
  const en = Math.max(1, ...son.map(toplam));
  const G = 640; const Y = 160; const bosluk = 4;
  const genislik = Math.min(28, Math.max(6, Math.floor((G - bosluk * son.length) / son.length)));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${G} ${Y + 20}`);
  svg.setAttribute('class', 'trend-grafigi');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Son ${son.length} koşunun başarılı/başarısız dağılımı`);
  son.forEach((n, i) => {
    const x = i * (genislik + bosluk);
    let y = Y;
    for (const [anahtar, sinif] of [['basarili', 'cubuk-basari'], ['basarisiz', 'cubuk-hata'], ['atlanan', 'cubuk-notr'], ['durduruldu', 'cubuk-uyari']]) {
      const yukseklik = Math.round(((n[anahtar] || 0) / en) * (Y - 10));
      if (!yukseklik) continue;
      y -= yukseklik;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
      r.setAttribute('width', String(genislik)); r.setAttribute('height', String(yukseklik));
      r.setAttribute('class', sinif);
      const t = document.createElementNS(ns, 'title');
      t.textContent = `${tarihMetni(new Date(n.z).toISOString())} — ${DURUM[anahtar].etiket}: ${n[anahtar]}`;
      r.append(t);
      svg.append(r);
    }
  });
  return h('div', { class: 'trend-kapsayici' }, svg,
    h('div', { class: 'trend-lejant kucuk soluk' },
      h('span', { class: 'lejant basari' }, 'Başarılı'), h('span', { class: 'lejant hata' }, 'Başarısız'),
      h('span', { class: 'lejant notr' }, 'Atlanan'), h('span', { class: 'lejant uyari' }, 'Durduruldu'),
      ` · ${tarihMetni(new Date(son[0].z).toISOString())} – ${tarihMetni(new Date(son[son.length - 1].z).toISOString())}`));
}

function kosuGecmisi(kosular, urun) {
  const govde = h('tbody', {});
  const sayfalama = h('div', { class: 'dugmeler sayfalama' });
  let sayfa = 0;
  const ciz = () => {
    const dilim = kosular.slice(sayfa * SAYFA_BOYU, (sayfa + 1) * SAYFA_BOYU);
    govde.replaceChildren(...dilim.map((k) => {
      const o = oran(k);
      return h('tr', {},
        h('td', {}, h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(k.id)}` }, tarihMetni(k.bitis || k.baslangic))),
        h('td', {}, h('span', { class: `rozet ${k.tur === 'tam' ? 'vurgu' : ''}` }, k.tur === 'tam' ? 'tam' : 'tekil'), ' ',
          k.kapsam ? h('span', { class: 'rozet' }, k.kapsam) : null, k.kaynak === 'allure-aktarimi' ? h('span', { class: 'rozet', title: 'Eski Allure sonuçlarından aktarıldı' }, 'aktarıldı') : null),
        h('td', {}, KOSU_DURUMU[k.durum] || k.durum),
        h('td', { class: 'sayi' }, String(toplam(k))), h('td', { class: 'sayi' }, String(k.basarili)),
        h('td', { class: 'sayi' }, String(k.basarisiz)), h('td', { class: 'sayi' }, String(k.atlanan)),
        h('td', { class: 'sayi' }, String(k.durduruldu)), h('td', { class: 'sayi' }, o === null ? '—' : `%${o}`));
    }));
    const sayfaSayisi = Math.max(1, Math.ceil(kosular.length / SAYFA_BOYU));
    sayfalama.replaceChildren(
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa === 0, onclick: () => { sayfa--; ciz(); } }, '‹ Önceki'),
      h('span', { class: 'soluk kucuk' }, `Sayfa ${sayfa + 1} / ${sayfaSayisi} · ${kosular.length} koşu`),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa + 1 >= sayfaSayisi, onclick: () => { sayfa++; ciz(); } }, 'Sonraki ›'));
  };
  ciz();
  return h('div', { class: 'kart' }, h('h3', {}, 'Koşu geçmişi'),
    h('p', { class: 'soluk kucuk' }, urun ? 'Bu ürünü içeren tüm koşular (sayılar yalnızca bu ürün için).' : 'Tüm koşular: tam ve tekil. Bir koşuya tıklayınca senaryo bazında sonuçlar açılır.'),
    kosular.length
      ? [h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Koşu geçmişi'),
        h('thead', {}, h('tr', {}, ...['Koşu', 'Tür / kapsam', 'Durum', 'Toplam', 'Başarılı', 'Başarısız', 'Atlanan', 'Durduruldu', 'Oran'].map((b) => h('th', { scope: 'col' }, b)))),
        govde)), sayfalama]
      : h('p', { class: 'bos-liste' }, 'Henüz koşu yok.'));
}

function yerelDegerdenIso(deger) {
  if (!deger) return '';
  const t = new Date(deger);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
}

function hataKaliplariBolumu(alan, proje, urun) {
  const baslangic = h('input', { type: 'datetime-local', id: 'kalip-baslangic' });
  const bitis = h('input', { type: 'datetime-local', id: 'kalip-bitis' });
  const sonucAlani = h('div', {}, h('p', { class: 'soluk' }, 'Yükleniyor…'));
  const yukle = async () => {
    const q = new URLSearchParams({ projeId: proje.id });
    if (urun) q.set('urun', urun);
    if (baslangic.value) q.set('baslangic', yerelDegerdenIso(baslangic.value));
    if (bitis.value) q.set('bitis', yerelDegerdenIso(bitis.value));
    sonucAlani.replaceChildren(h('p', { class: 'soluk' }, 'Yükleniyor…'));
    try {
      const v = await api(`/platform/sonuclar/kaliplar?${q}`);
      if (!v.kaliplar.length) { sonucAlani.replaceChildren(h('p', { class: 'bos-liste' }, 'Bu aralıkta başarısız sonuç yok.')); return; }
      sonucAlani.replaceChildren(
        h('div', { class: 'sayac-cipleri' }, h('span', { class: 'rozet hata' }, `${v.toplam} başarısız sonuç`),
          ...Object.entries(v.kategoriler).map(([k, n]) => h('span', { class: 'rozet' }, `${k}: ${n}`))),
        h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu kalip-tablosu' },
          h('caption', { class: 'gorunmez' }, 'Hata kalıpları'),
          h('thead', {}, h('tr', {}, ...['Ürün', 'Kategori', 'Hata kalıbı', 'Adet', 'Senaryo', 'Son görülme', ''].map((b) => h('th', { scope: 'col' }, b)))),
          h('tbody', {}, ...v.kaliplar.map((k) => h('tr', {},
            h('td', {}, k.urun), h('td', {}, k.kategori), h('td', { class: 'kalip' }, k.kalip),
            h('td', { class: 'sayi' }, String(k.sayi)), h('td', { class: 'sayi' }, String(k.senaryoSayisi)),
            h('td', {}, tarihMetni(k.son)),
            h('td', {}, h('a', { href: `#/sonuclar/sonuc/${encodeURIComponent(k.ornekSonucId)}` }, 'Örnek'))))))));
    } catch (e) {
      if (e && e.durum === 423) return;
      sonucAlani.replaceChildren(hataKutusu(e));
    }
  };
  const uygula = h('button', { type: 'button', onclick: yukle }, 'Uygula');
  const tumu = h('button', { type: 'button', onclick: () => { baslangic.value = ''; bitis.value = ''; yukle(); } }, 'Tüm zamanlar');
  alan.replaceChildren(h('div', { class: 'kart' }, h('h3', {}, 'Hata kalıpları'),
    h('p', { class: 'soluk kucuk' }, 'Aynı kalıptaki hatalar (değişken sayılar # ile) tek satırda toplanır. Tarih aralığıyla daraltabilirsiniz.'),
    h('div', { class: 'filtre-satiri' },
      h('div', { class: 'alan' }, h('label', { for: baslangic.id }, 'Başlangıç'), baslangic),
      h('div', { class: 'alan' }, h('label', { for: bitis.id }, 'Bitiş'), bitis), uygula, tumu),
    sonucAlani));
  yukle();
}

// ---------------------------------------------------------------------------------------
// Koşu detayı
// ---------------------------------------------------------------------------------------

async function kosuDetayi(icerik, id, proje) {
  const [{ kosu, sonuclar }, ortamlar] = await Promise.all([
    api(`/platform/sonuclar/kosu?id=${encodeURIComponent(id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`).then((v) => v.ortamlar).catch(() => [])
  ]);
  const ortam = kosu.ortamId ? (ortamlar.find((o) => o.id === kosu.ortamId) || {}).ad : null;
  const satir = (s) => h('tr', {},
    h('td', {}, durumRozeti(s.durum)),
    h('td', {}, s.urun),
    h('td', {}, h('a', { href: `#/sonuclar/sonuc/${encodeURIComponent(s.id)}` }, s.senaryoBaslik)),
    h('td', { class: 'sayi' }, sureMetni(s.sureMs)),
    h('td', { class: 'kalip' }, s.hataKalibi || ''),
    h('td', {}, s.ekranGoruntusuSayisi ? h('span', { class: 'rozet', title: 'Ekran görüntüsü' }, `${s.ekranGoruntusuSayisi} görsel`) : null, ' ',
      s.videoSayisi ? h('span', { class: 'rozet', title: 'Video' }, 'video') : null));
  icerik.replaceChildren(
    h('p', {}, h('a', { href: '#/sonuclar' }, '← Sonuçlar')),
    h('h2', { tabindex: '-1' }, `Koşu — ${tarihMetni(kosu.bitis || kosu.baslangic)}`),
    h('div', { class: 'kart' },
      h('div', { class: 'sayac-cipleri' },
        h('span', { class: `rozet ${kosu.tur === 'tam' ? 'vurgu' : ''}` }, kosu.tur === 'tam' ? 'tam koşu' : 'tekil koşu'),
        kosu.kapsam ? h('span', { class: 'rozet' }, `kapsam: ${kosu.kapsam}`) : null,
        ortam ? h('span', { class: 'rozet' }, `ortam: ${ortam}`) : null,
        h('span', { class: 'rozet' }, KOSU_DURUMU[kosu.durum] || kosu.durum),
        kosu.kaynak === 'allure-aktarimi' ? h('span', { class: 'rozet' }, 'eski sonuçlardan aktarıldı') : null),
      h('p', { class: 'kucuk' }, `Başlangıç ${tarihMetni(kosu.baslangic)} · Bitiş ${tarihMetni(kosu.bitis)} · `,
        `${kosu.basarili} başarılı, ${kosu.basarisiz} başarısız, ${kosu.atlanan} atlanan, ${kosu.durduruldu} durduruldu`)),
    h('div', { class: 'kart' }, h('h3', {}, `Senaryolar (${sonuclar.length})`),
      sonuclar.length
        ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
          h('caption', { class: 'gorunmez' }, 'Senaryo sonuçları'),
          h('thead', {}, h('tr', {}, ...['Durum', 'Ürün', 'Senaryo', 'Süre', 'Hata kalıbı', 'Medya'].map((b) => h('th', { scope: 'col' }, b)))),
          h('tbody', {}, ...sonuclar.map(satir))))
        : h('p', { class: 'bos-liste' }, 'Bu koşuda sonuç yok.')));
}

// ---------------------------------------------------------------------------------------
// Test (sonuç) detayı
// ---------------------------------------------------------------------------------------

function indirBaglantisi(m, metin) {
  return h('a', { class: 'dugme kucuk-dugme', href: medyaUrl(m.id, true), download: '' }, metin);
}

async function sonucDetayi(icerik, id) {
  const { sonuc: s } = await api(`/platform/sonuclar/sonuc?id=${encodeURIComponent(id)}`);
  const gorseller = s.medya.filter((m) => m.tur === 'ekran_goruntusu');
  const videolar = s.medya.filter((m) => m.tur === 'video');
  const izler = s.medya.filter((m) => m.tur === 'iz');
  const digerleri = s.medya.filter((m) => m.tur === 'diger');

  const bolumler = [];
  if (s.hataMesaji) {
    bolumler.push(h('div', { class: 'kart' }, h('h3', {}, 'Hata'),
      s.hataKategorisi ? h('p', {}, h('span', { class: 'rozet hata' }, s.hataKategorisi)) : null,
      h('pre', { class: 'hata-mesaji' }, s.hataMesaji)));
  }
  if (s.beklenenGorulen || s.beklenenSonuc) {
    bolumler.push(h('div', { class: 'kart' }, h('h3', {}, 'Beklenen / görülen'),
      h('dl', { class: 'beklenen-gorulen' },
        s.beklenenSonuc ? [h('dt', {}, 'Senaryonun beklenen sonucu'), h('dd', {}, s.beklenenSonuc)] : null,
        s.beklenenGorulen ? [h('dt', {}, 'Beklenen'), h('dd', {}, h('code', {}, s.beklenenGorulen.beklenen || '—')),
          h('dt', {}, 'Görülen'), h('dd', {}, h('code', {}, s.beklenenGorulen.gorulen || '—'))] : null)));
  }
  bolumler.push(h('div', { class: 'kart' }, h('h3', {}, 'Adımlar'),
    s.adimlar.length
      ? h('ol', { class: 'adim-listesi' }, ...s.adimlar.map((a) => h('li', { class: `adim ${a.durum}` },
        durumRozeti(a.durum), ' ', h('span', {}, a.ad), h('span', { class: 'soluk kucuk' }, ` · ${sureMetni(a.sureMs)}`),
        a.hataMesaji ? h('pre', { class: 'hata-mesaji kucuk' }, a.hataMesaji) : null)))
      : h('p', { class: 'bos-liste' }, 'Adım bilgisi yok.')));

  // Ekran görüntüleri: küçük resimler; tıklayınca büyük görünüm (dialog).
  const diyalog = h('dialog', { class: 'gorsel-diyalog', 'aria-label': 'Ekran görüntüsü' });
  const gorselAc = (m) => {
    diyalog.replaceChildren(
      h('div', { class: 'bolum-basligi' }, h('strong', {}, m.ad),
        h('div', { class: 'dugmeler' }, indirBaglantisi(m, '⬇ İndir'), h('button', { type: 'button', onclick: () => diyalog.close() }, 'Kapat'))),
      h('img', { src: medyaUrl(m.id), alt: m.ad, class: 'buyuk-gorsel' }));
    diyalog.showModal();
  };
  bolumler.push(h('div', { class: 'kart' }, h('h3', {}, `Ekran görüntüleri (${gorseller.length})`),
    gorseller.length
      ? h('ul', { class: 'gorsel-izgarasi' }, ...gorseller.map((m) => h('li', {},
        h('button', { type: 'button', class: 'gorsel-dugmesi', onclick: () => gorselAc(m), 'aria-label': `${m.ad} — büyüt` },
          h('img', { src: medyaUrl(m.id), alt: '', loading: 'lazy' })),
        h('div', { class: 'kucuk' }, m.ad), indirBaglantisi(m, '⬇ İndir'))))
      : h('p', { class: 'bos-liste' }, 'Bu sonuçta ekran görüntüsü yok.'),
    diyalog));

  const videoAlani = h('div', {});
  bolumler.push(h('div', { class: 'kart' }, h('h3', {}, 'Video ve iz'),
    videolar.length ? videolar.map((v) => v.silinme
      ? h('p', { class: 'soluk' }, `Video saklama süresi dolduğu için ${tarihMetni(v.silinme)} tarihinde silindi.`)
      : h('div', { class: 'dugmeler' },
        h('button', { type: 'button', onclick: (o) => {
          videoAlani.replaceChildren(h('video', { controls: true, autoplay: true, src: medyaUrl(v.id), class: 'sonuc-videosu' }));
          o.currentTarget.disabled = true;
        } }, '▶ Videoyu izle'),
        indirBaglantisi(v, '⬇ Videoyu indir'))) : h('p', { class: 'soluk' }, 'Video yok.'),
    videoAlani,
    izler.length ? h('div', { class: 'dugmeler' }, ...izler.map((z) => indirBaglantisi(z, '⬇ İzi (trace) indir')),
      h('span', { class: 'soluk kucuk' }, 'İz dosyası "npx playwright show-trace <dosya>" ile açılır.')) : null,
    digerleri.length ? h('div', { class: 'dugmeler' }, ...digerleri.map((d) => indirBaglantisi(d, `⬇ ${d.ad}`))) : null));

  bolumler.push(h('div', { class: 'kart' }, h('h3', {}, 'Atlanan / doldurulamayan alanlar'),
    s.atlananAlanlar.length
      ? h('ul', {}, ...s.atlananAlanlar.map((a) => h('li', {}, h('strong', {}, a.alan), a.neden ? ` — ${a.neden}` : '')))
      : h('p', { class: 'soluk' }, 'Yok (bu testte atlanan ya da doldurulamayan alan bildirilmedi).')));

  icerik.replaceChildren(
    h('p', {}, h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(s.kosuId)}` }, '← Koşuya dön'), ' · ', h('a', { href: '#/sonuclar' }, 'Sonuçlar')),
    h('h2', { tabindex: '-1' }, s.senaryoBaslik),
    h('div', { class: 'kart' }, h('div', { class: 'sayac-cipleri' }, durumRozeti(s.durum), h('span', { class: 'rozet' }, s.urun),
      h('span', { class: 'rozet' }, `süre ${sureMetni(s.sureMs)}`), s.deneme ? h('span', { class: 'rozet uyari' }, `${s.deneme}. yeniden deneme`) : null),
    h('p', { class: 'soluk kucuk' }, `Başlangıç ${tarihMetni(s.baslangic)} · Bitiş ${tarihMetni(s.bitis)}`, s.senaryoAnahtari ? ` · ${s.senaryoAnahtari}` : '')),
    ...bolumler);
}
