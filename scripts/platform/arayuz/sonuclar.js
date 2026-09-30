// "Sonuçlar" ekranı (genel, veritabanı kaynaklı): solda ürün/ekran listesi (Genel + ekranlar,
// son tam koşuya göre sağlık noktası); sağda KPI kartları (kıvılcım grafiği + önceki koşuya göre
// fark), yığılmış çubuk trend grafiği (Adet / Oran), son koşunun başarısız testleri ("Yeni
// başarısız / Tekrar eden / Düzeldi"), koşu geçmişi, hata kalıpları ve sağda başarısız test paneli
// (ekran görüntüsü, video, hata, adımlar, atlanan alanlar). Koşu detayı ve test detayı aynı
// ekranda açılır.
// Adresler: #/sonuclar/ozet (Genel > Özet, varsayılan sekme: sonuc-ozeti.js), #/sonuclar/ekranlar ve eski #/sonuclar (Genel > Ekranlar),
// #/sonuclar/servisler (Genel > Servisler: servis-sonuclari.js),
// #/sonuclar/u/<ürün>, #/sonuclar/kosu/<id>, #/sonuclar/sonuc/<id>, #/sonuclar/karsilastir/<A>/<B> (yan yana koşu
// karşılaştırması: karsilastirma.js), #/sonuclar/raporlar (kaydedilmiş PDF raporları: pdf-rapor.js). Tarih aralığı: ortak süzgeç
// (tarih-araligi.js; oturumda).
// Medya (ekran görüntüsü/video/iz) şifrelidir; sunucu /platform/medya/<id> ile kasa açıkken
// çözerek akıtır. <img>/<video> başlık gönderemediği için oturum token'ı sorgu parametresidir.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h()/s(); innerHTML yok).
import { api, bildir, bosDurum, h, ikon, iskelet, kullaniciAyarlari, rozet, s, TOKEN, tarihMetni, yerlestir } from './ortak.js';
import { baslarkenKarti, sonuclarIncelendi } from './baslarken.js';
import { ekranlarGrubu, navGrubu, servisleriAl, servislerBolumu, urunlerBasligi } from './urunler.js';
import { aralikMetni, araligiSorguyaEkle, kayitliAralik, tarihAraligiSecici } from './tarih-araligi.js';
import { hataKaydiDugmesi } from './entegrasyonlar.js';
import { veriyiSirala } from './tablo-siralama.js';
import { htmlRaporDugmesi } from './html-rapor.js';
import { pdfRaporDugmesi, raporlarGorunumu } from './pdf-rapor.js';
import { karsilastirDugmesi, karsilastirmaEkrani, karsilastirmaHatasi, kosuSecici } from './karsilastirma.js';
import { onayIste } from './ekran-ortak.js';

/** Koşu geçmişinde bir sayfadaki koşu (Ayarlar > Arayüz; kullanıcı kararı). */
let SAYFA_BOYU = 15;
const DURUM = {
  basarili: { etiket: 'Başarılı', sinif: 'basari', ikon: 'onay' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata', ikon: 'carpi' },
  atlanan: { etiket: 'Atlanan', sinif: 'atlanan', ikon: 'eksi' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu', ikon: 'eksi' }
};
const KOSU_DURUMU = { calisiyor: 'Çalışıyor', tamamlandi: 'Tamamlandı', durduruldu: 'Durduruldu', zaman_asimi: 'Zaman aşımı', hata: 'Hata' };
const KART_SIRASI = ['basarili', 'basarisiz', 'atlanan', 'durduruldu'];
const KART_SINIFI = { basarili: 'basarili', basarisiz: 'basarisiz', atlanan: 'atlanan', durduruldu: 'durduruldu' };
const DEGISIM = {
  yeni: { etiket: 'Yeni başarısız', sinif: 'hata' },
  tekrar: { etiket: 'Tekrar eden', sinif: 'atlanan' },
  duzeldi: { etiket: 'Düzeldi', sinif: 'basari' }
};

const medyaUrl = (id, indir = false) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}${indir ? '&indir=1' : ''}`;
const durumRozeti = (d) => rozet((DURUM[d] || { etiket: d }).etiket, (DURUM[d] || {}).sinif || '');
/** Ekran koşusunda saklanan doğrulanan dosyanın ek adı öneki (tests/support/model-kosucu.ts > "İndirilen dosya - <ad>"). */
const DOSYA_EKI_ONEKI = 'İndirilen dosya - ';

/**
 * "Dosyayı indir": Ayarlar > Koşu > Kayıt > "Doğrulanan dosya" saklamaya izin verdiyse saklanan dosya (ekran test ayrıntısı ve servis
 * senaryo sonucu; HTML raporda yok). Önce gizli veri onayı; dosya kasadan çözülür ve TARAYICIDA indirilir (sunucu diske yazmaz).
 * Dosya ham hâliyle iner: raporlardaki gizli değer maskelemesi dosyanın içine uygulanmaz.
 * @param {string} ad dosya adı @param {() => Promise<Blob>} getir
 */
export function dogrulananDosyaIndir(ad, getir) {
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Dosyayı indir: ${ad}` }, ikon('indir'), 'Dosyayı indir');
  dugme.addEventListener('click', async () => {
    const tamam = await onayIste({
      baslik: 'Dosya indirilsin mi?', ikonAd: 'indir', dugme: 'İndir',
      metin: `"${ad}" ham hâliyle iner: raporlardaki gizli değer maskelemesi dosyanın içine uygulanmaz. Dosya kişisel / gizli veri içerebilir; indirdiğiniz kopyayı buna göre saklayın.`
    });
    if (!tamam) return;
    dugme.disabled = true;
    try {
      const url = URL.createObjectURL(await getir());
      const a = h('a', { href: url, download: ad, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { bildir(e && e.message ? e.message : String(e), 'hata'); } finally { dugme.disabled = false; }
  });
  return h('li', { class: 'dogrulanan-dosya' }, h('span', { class: 'mono dosya-adi' }, ad), dugme);
}

/** Doğrulanan dosyalar listesi + maskeleme notu. @param {HTMLElement[]} satirlar */
export const dogrulananDosyalar = (satirlar) => h('div', { class: 'dogrulanan-dosyalar' },
  h('h4', {}, 'Doğrulanan dosyalar'), h('ul', { class: 'dogrulanan-dosya-listesi' }, satirlar),
  h('p', { class: 'soluk kucuk', role: 'note' }, ikon('kalkan'), ' Dosya ham hâliyle iner; gizli içerik maskelenmez.'));
export const sureMetni = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} sn` : `${Math.floor(ms / 60000)} dk ${Math.round((ms % 60000) / 1000)} sn`);
const toplam = (x) => (x ? x.basarili + x.basarisiz + x.atlanan + (x.durduruldu || 0) : 0);
const oran = (x) => {
  const payda = x.basarili + x.basarisiz + x.atlanan;
  return payda ? Math.round((x.basarili / payda) * 100) : null;
};
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
const iki = (n) => String(n).padStart(2, '0');
const tarihNesnesi = (d) => (d instanceof Date ? d : new Date(typeof d === 'number' ? d : String(d)));
/** "24.09" */
const gunAy = (d) => { const t = tarihNesnesi(d); return Number.isNaN(t.getTime()) ? '—' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}`; };
/** "24.09.2026 17:12" */
export const kisaTarih = (d) => { const t = tarihNesnesi(d); return d == null || Number.isNaN(t.getTime()) ? '—' : `${gunAy(t)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };
const saatMetni = (d) => { const t = tarihNesnesi(d); return d == null || Number.isNaN(t.getTime()) ? '—' : `${iki(t.getHours())}:${iki(t.getMinutes())}:${iki(t.getSeconds())}`; };
const kategoriSinifi = (k) => {
  const m = String(k || '').toLocaleLowerCase('tr');
  if (m.includes('zaman')) return 'k-zaman';
  if (m.includes('seçici') || m.includes('secici')) return 'k-secici';
  if (m.includes('pop-up') || m.includes('iş kuralı')) return 'k-popup';
  if (m.includes('doğrulama')) return 'k-dogrulama';
  return 'k-diger';
};
const KATEGORI_IKONU = { 'k-zaman': 'zamanlayici', 'k-secici': 'ara', 'k-popup': 'uyari', 'k-dogrulama': 'hedef', 'k-diger': 'ag' };
const kisaKategori = (k) => String(k || 'Diğer').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+Hatası$/, '').trim();

/** Trend grafiğinde en çok bu kadar koşu çizilir (aralıktaki en yeniler; daha fazlası okunmaz). */
const TREND_EN_COK = 60;
/** Koşu geçmişinde "Dene" koşularını göster (oturumda). */
const DENEME_GOSTER_ANAHTARI = 'platform.ekranSonucDenemeler';
const oturumOku = (a) => { try { return sessionStorage.getItem(a) || ''; } catch { return ''; } };
const oturumYaz = (a, d) => { try { sessionStorage.setItem(a, d); } catch { /* yok sayılır */ } };

/**
 * Genel görünümün "Özet | Ekranlar | Servisler | Uçtan uca akışlar" sekmeleri (Raporlar üst menüde, Planlı koşular'ın yanında). Özet (#/sonuclar/ozet; sonuc-ozeti.js)
 * Genel'in varsayılanıdır: sol paneldeki "Genel" onu açar. Ekranlar: #/sonuclar/ekranlar — eski #/sonuclar adresi de aynı görünümü
 * açar (mevcut bağlantılar ve yer imleri bozulmaz).
 */
function genelSekmeleri(secili) {
  return h('div', { class: 'segment sekme-cubugu sonuc-sekmeleri', role: 'tablist', 'aria-label': 'Genel rapor' },
    [['ozet', 'Özet', '#/sonuclar/ozet', 'izgara'], ['ekranlar', 'Ekranlar', '#/sonuclar/ekranlar', 'ekran'], ['servisler', 'Servisler', '#/sonuclar/servisler', 'ag'],
      ['uctan', 'Uçtan uca akışlar', '#/sonuclar/uctan-uca', 'katman']].map(([a, etiket, adres, ikonAd]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': a === secili ? 'true' : 'false',
      onclick: () => { if (a !== secili) location.hash = adres; }
    }, ikon(ikonAd), etiket)));
}

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/sonuclar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function sonuclarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik] = parcalar;
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('kartlar'), iskelet('sayfa'));
  const liste = h('nav', { class: 'alt-nav', 'aria-label': 'Ekranlar ve servisler' }, iskelet('liste'));
  // Sağlık noktası eşikleri proje başınadır (Ayarlar > Arayüz > Sağlık noktası); not eşikler gelince güncellenir.
  const saglikMetni = h('span', {}, esikMetni(ESIKLER));
  const saglikNotu = h('div', { class: 'yan-not' }, h('b', {}, 'Sağlık noktası'), h('br', {}), saglikMetni, ' ',
    h('a', { href: '#/ayarlar/arayuz', class: 'kucuk' }, 'Eşikleri değiştir'));
  main.replaceChildren(h('h1', { class: 'gorunmez' }, 'Sonuçlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, liste,
        saglikNotu),
      icerik));
  // "servisler": Genel'in Servisler sekmesi (Genel seçili kalır).
  const secili = tur === 'u' && kimlik ? decodeURIComponent(kimlik) : tur && !GENEL_SEKMELERI.includes(tur) ? null : '';
  const hata = (e) => { if (e && e.durum === 423) return; icerik.replaceChildren(hataKutusu(e)); };
  // Tarih aralığı (ortak süzgeç; oturumda saklanır): kartlar, trend ve koşu geçmişi sunucuda aralığa göre hesaplanır.
  const sorgu = araligiSorguyaEkle(new URLSearchParams({ projeId: proje.id }), kayitliAralik());
  if (secili) sorgu.set('urun', secili);

  // Sol liste her görünümde aynı özetten gelir (koşu/sonuç detayında seçili ürün yok).
  Promise.all([api(`/platform/sonuclar/ozet?${sorgu}`), kullaniciAyarlari(),
    api(`/platform/saglik-esikleri?projeId=${encodeURIComponent(proje.id)}`).then((y) => y.esikler).catch(() => null)])
    .then(([ozet, ayar, esikler]) => {
      if (Number.isInteger(ayar.kosuGecmisiSayfaBoyu)) SAYFA_BOYU = ayar.kosuGecmisiSayfaBoyu;
      ESIKLER = esikler && Number.isInteger(esikler.yesil) && Number.isInteger(esikler.sari) ? esikler : VARSAYILAN_ESIKLER;
      saglikMetni.textContent = esikMetni(ESIKLER);
      const seciliServis = tur === 's' && kimlik ? decodeURIComponent(kimlik) : null;
      urunListesi(liste, ozet.ekranlar, secili, [], seciliServis);
      servisleriAl(proje).then((servisler) => { if (servisler.length) urunListesi(liste, ozet.ekranlar, secili, servisler, seciliServis); });
      if (tur === 'kosu' && kimlik) return kosuDetayi(icerik, decodeURIComponent(kimlik), proje);
      if (tur === 'sonuc' && kimlik) return sonucDetayi(icerik, decodeURIComponent(kimlik), proje);
      if (tur === 'karsilastir' && kimlik && parcalar[2]) {
        return karsilastirmaEkrani(icerik, proje, { tur: 'ekran', a: decodeURIComponent(kimlik), b: decodeURIComponent(parcalar[2]) })
          .catch((e) => { if (!(e && e.durum === 423)) karsilastirmaHatasi(icerik, e, '#/sonuclar'); });
      }
      // Genel > Servisler: servis sonuçlarının TEK yeri (servis-sonuclari.js). Alt görünümler: a/<akış>, kosu/<id>, senaryo/<id>,
      // karsilastir/<A>/<B> (#/sonuclar/servisler/…).
      if (tur === 'servisler') {
        return import('./servis-sonuclari.js').then((m) => (parcalar.length > 1 && m.servisSonucAltGorunumu(icerik, proje, parcalar.slice(1)))
          || m.servisGenelBakis(icerik, proje, { ust: genelSekmeleri('servisler'), gomulu: true }));
      }
      // Sol paneldeki servis: Servis sonuçlarının o servise süzülmüş görünümü, Sonuçlar ekranının içinde (ekranlarla aynı).
      if (tur === 's' && seciliServis) {
        return import('./servis-sonuclari.js').then((m) => m.servisGenelBakis(icerik, proje, { servisId: seciliServis, gomulu: true }));
      }
      // Genel > Özet (varsayılan sekme): özet kutuları + Dikkat / Bakım / Kapsam ve güvenlik kartları (sonuc-ozeti.js; ayrı yüklenir).
      if (tur === 'ozet') {
        return import('./sonuc-ozeti.js').then((m) => m.sonucOzetiEkrani(icerik, proje, genelSekmeleri('ozet'), () => sonuclarEkrani(main, parcalar, baglam)));
      }
      // Genel > Raporlar: kaydedilmiş PDF raporları (pdf-rapor.js).
      // Raporlar > Kapsam matrisi (#/sonuclar/raporlar/kapsam; kapsam-matrisi.js).
      if (tur === 'raporlar' && kimlik === 'kapsam') return import('./kapsam-matrisi.js').then((m) => m.kapsamMatrisiGorunumu(icerik, proje, null));
      if (tur === 'raporlar') return raporlarGorunumu(icerik, proje, null);
      // Genel > Uçtan uca akışlar: servis + ekran + SQL akışlarının koşuları (uctan-uca.js).
      if (tur === 'uctan-uca') {
        return import('./uctan-uca.js').then((m) => m.uctanUcaSonuclari(icerik, proje, { ust: genelSekmeleri('uctan'), kosuId: kimlik ? decodeURIComponent(kimlik) : null }));
      }
      const ekran = secili ? ozet.ekranlar.find((e) => e.anahtar === secili) : null;
      const yenile = () => sonuclarEkrani(main, parcalar, baglam);
      genelBakis(icerik, ozet, proje, secili || null, ekran ? ekran.ad : secili ? secili.replace(/^ad:/, '') : null, ekran, yenile);
      if (!secili) {
        // Sekmeler sayfa başlığının hemen altında (başlık yoksa en üstte).
        const sekmeler = genelSekmeleri('ekranlar');
        const baslik = icerik.querySelector(':scope > .sayfa-basligi');
        if (baslik) baslik.after(sekmeler); else icerik.prepend(sekmeler);
        // Henüz tam koşusu olmayan projede "Başlarken" listesi burada da (ilk açılış bu görünümdür; baslarken.js).
        sekmeler.after(baslarkenKarti(proje, { yalnizKosusuz: true }));
      }
      return undefined;
    })
    .catch(hata);
}

/** Genel'in sekme adresleri (#/sonuclar/<sekme>; sol panelde "Genel" seçili kalır). "ekranlar" = eski #/sonuclar. */
const GENEL_SEKMELERI = ['ozet', 'ekranlar', 'servisler', 'uctan-uca', 'raporlar'];

/** Sağlık noktası eşikleri (proje başına; Ayarlar > Arayüz; varsayılan yeşil ≥ 90, sarı ≥ 75 — ayarlar/saglik-esikleri.mjs ile aynı kural). */
const VARSAYILAN_ESIKLER = { yesil: 90, sari: 75 };
let ESIKLER = VARSAYILAN_ESIKLER;
const esikMetni = (e) => `Son tam koşunun başarı oranı: yeşil ≥ %${e.yesil}, sarı ≥ %${e.sari}, kırmızı altı.`;

/**
 * Oranın (0–100) sağlık sınıfı — Sonuçlar'daki TEK kural (sol listedeki nokta, Özet kutuları): 'basari' | 'uyari' | 'hata';
 * oran yoksa ''. Eşikler projenin Ayarlar > Arayüz > Sağlık noktası değerleridir (Sonuçlar açılırken yüklenir).
 * @param {number | null | undefined} o
 */
export function oranSaglikSinifi(o) {
  if (o === null || o === undefined || Number.isNaN(o)) return '';
  const r = Math.round(o);
  return r >= ESIKLER.yesil ? 'basari' : r >= ESIKLER.sari ? 'uyari' : 'hata';
}

function saglikSinifi(son) {
  return son ? oranSaglikSinifi(oran(son)) : '';
}

/** Ekranı devre dışı / silinmiş ürünün rozeti (sonuçlar görünür kalır). */
function ekranDurumRozeti(durum) {
  if (durum === 'devre_disi') return rozet('devre dışı', 'atlanan', { title: 'Ekran devre dışı: yeni koşulara girmez; geçmiş sonuçlar görünür' });
  if (durum === 'silindi') return rozet('silinmiş ekran', 'hata', { title: 'Ekran silindi; geçmiş sonuçları korunuyor' });
  return null;
}

function urunListesi(nav, ekranlar, secili, servisler = [], seciliServis = null) {
  const toplamSenaryo = ekranlar.reduce((a, e) => a + (e.senaryoSayisi || 0), 0);
  const baglanti = (anahtar, ad, adet, son, ikonAd, durum) => {
    const o = son ? oran(son) : null;
    return h('a', {
      // "Genel" varsayılan sekmesi Özet'i açar.
      href: anahtar ? `#/sonuclar/u/${encodeURIComponent(anahtar)}` : '#/sonuclar/ozet',
      'aria-current': (secili || '') === (anahtar || '') && secili !== null ? 'page' : null,
      class: durum === 'devre_disi' || durum === 'silindi' ? 'devre-disi' : null,
      title: durum === 'devre_disi' ? `${ad} — devre dışı` : durum === 'silindi' ? `${ad} — silinmiş ekran` : null
    }, ikonAd ? ikon(ikonAd) : h('span', { class: `saglik ${saglikSinifi(son)}`, 'aria-hidden': 'true' }), h('span', { class: 'nav-metni' }, ad),
    durum === 'silindi' ? h('span', { class: 'nav-etiketi', 'aria-hidden': 'true' }, 'silinmiş') : durum === 'devre_disi' ? h('span', { class: 'nav-etiketi', 'aria-hidden': 'true' }, 'kapalı') : null,
    durum === 'silindi' || durum === 'devre_disi' ? h('span', { class: 'gorunmez' }, durum === 'silindi' ? ' (silinmiş ekran)' : ' (devre dışı)') : null,
    adet ? h('span', { class: 'adet' }, String(adet)) : null,
    o !== null ? h('span', { class: 'gorunmez' }, ` — son koşu başarı oranı %${o}`) : null);
  };
  nav.replaceChildren(
    baglanti('', 'Genel', toplamSenaryo, null, 'izgara'),
    ...urunlerBasligi(),
    // Genel senaryolar ekranlardan ayrı grupta (ekran sayısına girmez); genel senaryoyu yoksa grup hiç çizilmez.
    ekranlarGrubu(ekranlar.filter((e) => !e.ortakAkis).map((e) => baglanti(e.anahtar, e.ad, e.senaryoSayisi, e.son, null, e.ekranDurumu))),
    ekranlar.some((e) => e.ortakAkis)
      ? navGrubu({ anahtar: 'ortak-akislar', baslik: 'Genel senaryolar', ogeler: ekranlar.filter((e) => e.ortakAkis).map((e) => baglanti(e.anahtar, e.ad, e.senaryoSayisi, e.son, null, e.ekranDurumu)) })
      : '',
    // Ekranlarla aynı davranış: servis bağlantısı Sonuçlar ekranında kalır ve Servis sonuçlarının o servise süzülmüş
    // görünümünü açar (#/sonuclar/s/<servisId>; servis sonuçları ekran sonuçlarına karışmaz).
    ...servislerBolumu(servisler, { adres: servisSonucAdresi, seciliServis: seciliServis ?? null, saglik: true }));
}
/** Sonuçlar ekranında bir servisin süzülmüş sonuç görünümü. @param {string} id */
export const servisSonucAdresi = (id) => `#/sonuclar/s/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------------------------------
// Genel bakış / ürün sayfası
// ---------------------------------------------------------------------------------------

function genelBakis(icerik, ozet, proje, urun, urunAdi, ekran, aralikDegisti) {
  const kart = ozet.kart;
  const sonKosuId = urun ? kart && kart.son && kart.son.kosuId : (ozet.trend.length ? ozet.trend[ozet.trend.length - 1].kosuId : null);
  const sonKosu = sonKosuId ? ozet.kosuGecmisi.find((k) => k.id === sonKosuId) : null;
  const panelAlani = h('aside', { class: 'kart test-paneli', 'aria-label': 'Başarısız test detayı', hidden: true });
  const izgara = h('div', { class: 'sonuc-izgarasi panelsiz' });
  const panel = {
    ac: (sonucId, odakla = false) => {
      panelAlani.hidden = false;
      izgara.classList.remove('panelsiz');
      testPaneli(panelAlani, sonucId, () => { panelAlani.hidden = true; izgara.classList.add('panelsiz'); panel.secili(null); });
      panel.secili(sonucId);
      if (odakla) panelAlani.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    secili: () => {}
  };
  const trendAlani = h('div', {});
  const kartAlani = h('div', {});
  const ciz = () => {
    kartAlani.replaceChildren(kartlar(kart, ozet.trend, urun));
    trendAlani.replaceChildren(trendKarti(ozet.trend, urun, { digerNoktalar: ozet.trendTumKapsamlar || [] }));
  };
  // Tarih aralığı süzgeci (ortak bileşen): seçim oturumda saklanır, ekran sunucudan aralığa göre yeniden yüklenir.
  const aralikSatiri = h('section', { class: 'kart sonuc-araligi', 'aria-label': 'Tarih aralığı süzgeci' },
    tarihAraligiSecici({ degisti: () => aralikDegisti() }));
  const basarisizSayisi = kart ? kart.son.basarisiz : 0;
  const meta = [];
  if (kart) {
    meta.push(h('span', {}, ikon('takvim'), urun ? 'Son tam koşu ' : 'En yeni tam koşu ', h('b', { class: 'mono' }, kisaTarih(urun ? kart.son.z : kart.enYeniZ))));
    if (sonKosu && sonKosu.bitis) meta.push(h('span', {}, ikon('saat'), h('span', { class: 'mono' }, sureMetni(new Date(sonKosu.bitis).getTime() - new Date(sonKosu.baslangic).getTime()))));
  }
  meta.push(h('span', {}, ikon('liste'), `${urun ? (ekran ? ekran.senaryoSayisi : 0) : ozet.ekranlar.reduce((a, e) => a + (e.senaryoSayisi || 0), 0)} senaryo`));
  if (!urun) meta.push(h('span', {}, ikon('ekran'), `${ozet.ekranlar.filter((e) => !e.ortakAkis).length} ekran`));
  if (urun && kart && kart.son.kapsam) meta.push(h('span', {}, ikon('hedef'), `kapsam: ${kart.son.kapsam}`));
  if (ekran && ekranDurumRozeti(ekran.ekranDurumu)) meta.push(h('span', {}, ekranDurumRozeti(ekran.ekranDurumu)));

  const degisimAlani = h('div', {});
  const solSutun = h('div', { class: 'sonuc-sutunu' }, trendAlani, degisimAlani);
  izgara.append(solSutun, panelAlani);
  const kalipAlani = h('div', {});
  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, urunAdi || 'Genel')),
        h('div', { class: 'baslik-satiri' },
          h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Sonuçlar — '), urunAdi || 'Genel'),
          basarisizSayisi ? rozet([ikon('uyari'), `${basarisizSayisi} başarısız`], 'hata') : kart ? rozet([ikon('onay'), 'hepsi geçti'], 'basari') : null),
        h('div', { class: 'meta' }, meta)),
      h('div', { class: 'eylemler' },
        // Dönem raporu (PDF): yalnız tek ekranın sayfasında (kapsam dolu gelir); Genel görünümde yok (Raporlar üst menüde).
        urun && !urun.startsWith('ad:') ? pdfRaporDugmesi(proje, { kapsam: 'ekran', id: urun }) : null,
        // Silinmiş / devre dışı ekranın koşusu başlatılamaz (sonuçları yalnızca görüntülenir).
        ekran && (ekran.ekranDurumu === 'silindi' || ekran.ekranDurumu === 'devre_disi') ? null
          : h('a', { class: 'dugme birincil', href: urun && !urun.startsWith('ad:') ? `#/senaryolar/u/${encodeURIComponent(urun)}` : '#/senaryolar', title: 'Senaryolar ekranında onayla başlatılır' }, ikon('oynat'), 'Koşuyu başlat'))),
    aralikSatiri, kartAlani, izgara,
    h('div', { class: 'sonuc-sutunu alt-bolumler' }, kosuGecmisi(ozet.kosuGecmisi, urun), kalipAlani));
  ciz();
  hataKaliplariBolumu(kalipAlani, proje, urun, (id) => panel.ac(id, true));
  if (sonKosuId) basarisizTestler(degisimAlani, ozet.kosuGecmisi, sonKosuId, urun, panel, proje);
}

/** Segment denetimi (aria-pressed düğmeler). */
export function segment(secenekler, secili, degisti, etiket) {
  const kap = h('div', { class: 'segment', role: 'group', 'aria-label': etiket });
  const ciz = (d) => kap.replaceChildren(...secenekler.map(([deger, metin]) => h('button', {
    type: 'button', 'aria-pressed': deger === d ? 'true' : 'false',
    onclick: () => { ciz(deger); degisti(deger); }
  }, metin)));
  ciz(secili);
  return kap;
}

/** Aralık sunucuda uygulanır; grafik okunaklı kalsın diye en yeni TREND_EN_COK nokta çizilir. */
const aralikUygula = (noktalar) => noktalar.slice(-TREND_EN_COK);

let kivilcimSayaci = 0;
/** Kıvılcım (sparkline): alan + çizgi; renk kartın --k değişkeninden. */
export function kivilcim(degerler) {
  if (degerler.length < 2) return null;
  const G = 120; const Y = 40; const en = Math.max(...degerler, 1);
  const noktalar = degerler.map((v, i) => [(i * G) / (degerler.length - 1), Y - 4 - (v / en) * (Y - 12)]);
  const d = noktalar.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = `kivilcim-${++kivilcimSayaci}`;
  return s('svg', { class: 'kivilcim', viewBox: `0 0 ${G} ${Y}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('defs', {}, s('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, s('stop', { offset: 0, class: 'ust' }), s('stop', { offset: 1, class: 'alt' }))),
    s('path', { class: 'alan', d: `${d} L${G} ${Y} L0 ${Y}Z`, fill: `url(#${id})` }),
    s('path', { class: 'cizgi', d, fill: 'none', 'vector-effect': 'non-scaling-stroke' }));
}

export function farkHapi(fark, iyiMi, birim = '') {
  if (fark === 0) return h('span', { class: 'fark notr' }, '= 0', h('span', { class: 'gorunmez' }, ' değişim yok'));
  return h('span', { class: `fark ${iyiMi ? 'iyi' : 'kotu'}` }, `${fark > 0 ? '▲' : '▼'} ${Math.abs(fark)}${birim}`,
    h('span', { class: 'gorunmez' }, fark > 0 ? ' arttı' : ' azaldı'));
}

function kartlar(kart, trend, urun) {
  if (!kart) {
    return h('div', { class: 'sonuc-kartlari-bos' },
      bosDurum(kayitliAralik().hizli === 'tumu' ? 'Henüz koşu yok.' : `Bu aralıkta tam koşu yok (${aralikMetni(kayitliAralik())}).`, 'Kartlar yalnızca tam koşulardan (Koşuyu başlat) hesaplanır. Tekil ▷ koşuları koşu geçmişinde görünür.', { ikon: 'grafik' }));
  }
  const son = kart.son;
  const onceki = kart.onceki;
  const noktalar = aralikUygula(trend);
  const topl = toplam(son);
  const kartlarDizisi = KART_SIRASI.map((a) => {
    const fark = onceki ? son[a] - onceki[a] : null;
    const iyi = a === 'basarili' ? fark > 0 : fark < 0;
    return h('div', { class: `sonuc-karti ${KART_SINIFI[a]}` },
      h('span', { class: 'kart-etiket' }, DURUM[a].etiket),
      h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, String(son[a] || 0)), h('small', {}, `/ ${topl}`)),
      h('div', { class: 'kart-alt' }, fark === null ? h('span', { class: 'fark notr' }, 'ilk koşu') : farkHapi(fark, iyi), h('span', {}, 'önceki koşuya göre')),
      kivilcim(noktalar.map((n) => n[a] || 0)));
  });
  const oranSimdi = oran(son);
  const oranOnce = onceki ? oran(onceki) : null;
  const yuzde = (v) => `${topl ? ((v / topl) * 100).toFixed(1) : 0}%`;
  kartlarDizisi.push(h('div', { class: 'sonuc-karti oran' },
    h('span', { class: 'kart-etiket' }, 'Başarı oranı'),
    h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, oranSimdi === null ? '—' : `%${oranSimdi}`)),
    h('div', { class: 'kart-alt' },
      oranSimdi !== null && oranOnce !== null ? farkHapi(oranSimdi - oranOnce, oranSimdi > oranOnce, ' puan') : h('span', { class: 'fark notr' }, '—'),
      h('span', {}, oranOnce !== null ? `önceki %${oranOnce}` : 'önceki yok')),
    h('div', { class: 'dagilim-seridi', 'aria-hidden': 'true' },
      h('span', { class: 'd-basari', style: { width: yuzde(son.basarili) } }), h('span', { class: 'd-hata', style: { width: yuzde(son.basarisiz) } }),
      h('span', { class: 'd-atlanan', style: { width: yuzde(son.atlanan) } }), h('span', { class: 'd-durdu', style: { width: yuzde(son.durduruldu || 0) } }))));
  const kaynak = urun
    ? ['Son tam koşu: ', h('span', { class: 'mono' }, kisaTarih(son.z)), son.kapsam ? rozet(`kapsam: ${son.kapsam}`, 'vurgu') : null]
    : [`Her ürünün son tam koşusunun toplamı (${kart.urunSayisi} ürün; en yenisi ${kisaTarih(kart.enYeniZ)}).`];
  return h('div', {},
    h('div', { class: 'sonuc-kartlari' }, kartlarDizisi),
    h('p', { class: 'kart-kaynak' }, ...kaynak, onceki ? '' : ' Önceki koşu olmadığı için fark gösterilmiyor.'));
}

// ---------------------------------------------------------------------------------------
// Trend: yığılmış çubuk (Adet / Oran), üzerine gelince koşu ayrıntısı
// ---------------------------------------------------------------------------------------

let trendKipi = 'adet';
/**
 * Trend kartı. Noktalar: { z, kosuId, basarili, basarisiz, atlanan, durduruldu, kapsam? }. secenek (servis sonuçları için):
 * altYazi, aciklama, bosBaslik, bosAciklama, grafikEtiketi ("tam koşunun"), kosuAdresi(nokta) → hash.
 */
export function trendKarti(tumNoktalar, urun, secenek = {}) {
  const kap = h('div', { class: 'trend-kapsayici' });
  const kipSegmenti = segment([['adet', 'Adet'], ['oran', 'Oran']], trendKipi, (d) => { trendKipi = d; ciz(); }, 'Grafik birimi');
  const noktalar = aralikUygula(tumNoktalar);
  const ciz = () => kap.replaceChildren(...trendGrafigi(noktalar, kap, secenek));
  const kart = h('section', { class: 'kart', 'aria-labelledby': 'trend-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'trend-basligi' }, ikon('grafik'), 'Koşu trendi'),
      h('span', { class: 'alt' }, `${secenek.altYazi || `${urun ? 'Bu ürünü içeren tam koşular' : 'Genel kapsamlı tam koşular'} · ${aralikMetni(kayitliAralik())}`} · `
        + (tumNoktalar.length > noktalar.length ? `en yeni ${noktalar.length} / ${tumNoktalar.length}` : `${noktalar.length} koşu`)),
      noktalar.length ? h('div', { class: 'sag' }, kipSegmenti) : null),
    h('p', { class: 'gorunmez' }, secenek.aciklama || (urun ? 'Bu ürünü içeren tam koşular (yalnızca bu ürünün sonuçları).' : 'Genel kapsamlı tam koşular. Tekil koşular trende girmez.')),
    kap);
  // Genel'de Genel kapsamlı koşu yok ama ekran kapsamlı tam koşular varsa: neden boş olduğunu söyle, istenirse onları göster.
  const diger = !urun && !noktalar.length && Array.isArray(secenek.digerNoktalar) ? aralikUygula(secenek.digerNoktalar) : [];
  if (diger.length) {
    const goster = h('button', {
      type: 'button', class: 'dugme kucuk-dugme',
      onclick: () => kart.replaceWith(trendKarti(secenek.digerNoktalar, urun, {
        altYazi: `Ekran kapsamlı tam koşular · ${aralikMetni(kayitliAralik())}`,
        aciklama: 'Ekran kapsamlı tam koşular (her çubuk o koşunun tüm sonuçları). Tekil koşular trende girmez.'
      }))
    }, ikon('grafik'), 'Göster');
    kap.append(bosDurum(`Genel kapsamlı koşu yok — ekran koşuları: ${diger.length}`,
      'Bu trend yalnız tüm ekranları kapsayan (Genel kapsamlı) tam koşuları gösterir. Tek ekran için başlatılan tam koşuları görmek için "Göster"e basın.',
      { ikon: 'grafik', eylem: goster }));
    return kart;
  }
  if (!noktalar.length) { kap.append(bosDurum(secenek.bosBaslik || 'Henüz tam koşu yok.', secenek.bosAciklama || 'Tam koşular (Koşuyu başlat) burada günlük çubuklar olarak görünür.', { ikon: 'grafik' })); return kart; }
  // Genişlik kapsayıcıya göre; boyut değişince yeniden çizilir.
  requestAnimationFrame(ciz);
  if (window.ResizeObserver) {
    let son = 0;
    new ResizeObserver(() => { const g = kap.clientWidth; if (Math.abs(g - son) > 8) { son = g; ciz(); } }).observe(kap);
  }
  return kart;
}

let trendSayaci = 0;
function trendGrafigi(noktalar, kap, secenek = {}) {
  const W = Math.max(320, kap.clientWidth || 640); const H = 232;
  const L = 36; const R = 10; const T = 14; const B = 28;
  const ih = H - T - B; const iw = W - L - R; const n = noktalar.length;
  const slot = iw / n; const bw = Math.max(4, Math.min(28, slot * 0.58));
  const oranKipi = trendKipi === 'oran';
  const enCok = Math.max(1, ...noktalar.map(toplam));
  const adim = oranKipi ? 25 : Math.max(1, Math.ceil(enCok / 4 / (enCok > 20 ? 5 : 1)) * (enCok > 20 ? 5 : 1));
  const ustSinir = oranKipi ? 100 : adim * Math.ceil(enCok / adim);
  const y = (v) => (ih * v) / ustSinir;
  const filtreId = `trend-parilti-${++trendSayaci}`;
  const svg = s('svg', { class: 'trend-grafigi', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': `Son ${n} ${secenek.grafikEtiketi || 'tam koşunun'} durum dağılımı (${oranKipi ? 'yüzde' : 'adet'})` },
    s('defs', {}, s('filter', { id: filtreId, x: '-50%', y: '-20%', width: '200%', height: '140%' },
      s('feGaussianBlur', { stdDeviation: '4', result: 'b' }), s('feMerge', {}, s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })))));
  for (let t = 0; t <= ustSinir; t += adim) {
    const yy = T + ih - y(t);
    svg.append(s('line', { class: t ? 'izgara-cizgisi kesikli' : 'izgara-cizgisi', x1: L, x2: W - R, y1: yy, y2: yy }),
      s('text', { class: 'eksen-yazisi', x: L - 8, y: yy + 4, 'text-anchor': 'end' }, oranKipi ? `${t}%` : String(t)));
  }
  const etiketAdimi = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 64))));
  const ipucu = h('div', { class: 'trend-ipucu', hidden: true, role: 'presentation' });
  const ipucuGoster = (nk, x) => {
    const o = oran(nk);
    ipucu.replaceChildren(
      h('b', {}, `${kisaTarih(nk.z)} · ${nk.kapsam && nk.kapsam !== 'Genel' ? nk.kapsam : 'tam'}`),
      h('div', { class: 'satirlar' }, ...KART_SIRASI.flatMap((a) => [h('span', { class: `lejant ${DURUM[a].sinif}` }, DURUM[a].etiket), h('span', {}, String(nk[a] || 0))])),
      h('div', { class: 'oran-satiri' }, `Başarı oranı ${o === null ? '—' : `%${o}`} · ${toplam(nk)} test`));
    ipucu.hidden = false;
    const oranX = (x / W) * kap.clientWidth;
    const solda = oranX > kap.clientWidth / 2;
    ipucu.classList.toggle('solda', solda);
    ipucu.style.setProperty('left', `${solda ? oranX - bw / 2 - 12 : oranX + bw / 2 + 12}px`);
    ipucu.style.setProperty('top', `${T}px`);
  };
  noktalar.forEach((nk, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    const son = i === n - 1;
    const topl = toplam(nk) || 1;
    const o = oran(nk);
    const grup = s('g', {
      class: `cubuk-grubu${son ? ' son' : ''}`, tabindex: '0', role: 'link',
      'aria-label': `${kisaTarih(nk.z)}: ${nk.basarili} başarılı, ${nk.basarisiz} başarısız, ${nk.atlanan} atlanan, ${nk.durduruldu || 0} durduruldu; başarı oranı ${o === null ? 'yok' : `%${o}`}. Koşuyu aç.`
    });
    grup.append(s('rect', { class: 'vurgu-cercevesi', x: x - 4, y: T - 4, width: bw + 8, height: ih + 8, rx: 7 }));
    let yy = T + ih;
    const dilimler = [['basarili', 'c-basari'], ['atlanan', 'c-atlanan'], ['basarisiz', 'c-hata'], ['durduruldu', 'c-durdu']].filter(([a]) => nk[a]);
    dilimler.forEach(([a, sinif], j) => {
      const deger = oranKipi ? ((nk[a] || 0) / topl) * 100 : nk[a] || 0;
      const yuk = Math.max(1.5, y(deger) - 1.5);
      yy -= yuk + 1.5;
      grup.append(s('rect', { class: sinif, x, y: yy, width: bw, height: yuk, rx: j === dilimler.length - 1 ? Math.min(4, bw / 3) : 1.5, filter: son ? `url(#${filtreId})` : null }));
    });
    grup.append(s('rect', { class: 'dokunma', x: L + slot * i, y: T, width: slot, height: ih, fill: 'transparent' }));
    const ac = () => { location.hash = secenek.kosuAdresi ? secenek.kosuAdresi(nk) : `#/sonuclar/kosu/${encodeURIComponent(nk.kosuId)}`; };
    grup.addEventListener('mouseenter', () => ipucuGoster(nk, x + bw / 2));
    grup.addEventListener('focus', () => ipucuGoster(nk, x + bw / 2));
    grup.addEventListener('mouseleave', () => { ipucu.hidden = true; });
    grup.addEventListener('blur', () => { ipucu.hidden = true; });
    grup.addEventListener('click', ac);
    grup.addEventListener('keydown', (o2) => { if (o2.key === 'Enter' || o2.key === ' ') { o2.preventDefault(); ac(); } });
    svg.append(grup);
    if (i % etiketAdimi === (n - 1) % etiketAdimi || son) {
      svg.append(s('text', { class: `eksen-yazisi${son ? ' son' : ''}`, x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, gunAy(nk.z)));
    }
  });
  const lejant = h('div', { class: 'trend-lejant' },
    h('span', { class: 'lejant basari' }, 'Başarılı'), h('span', { class: 'lejant hata' }, 'Başarısız'),
    h('span', { class: 'lejant atlanan' }, 'Atlanan'), h('span', { class: 'lejant durdu' }, 'Durduruldu'),
    h('span', { class: 'aralik' }, `${gunAy(noktalar[0].z)} → ${kisaTarih(noktalar[n - 1].z).slice(0, 10)}`));
  return [svg, ipucu, lejant];
}

// ---------------------------------------------------------------------------------------
// Son koşunun başarısız testleri: Yeni başarısız / Tekrar eden / Düzeldi
// ---------------------------------------------------------------------------------------

const senaryoKimligi = (x) => x.senaryoAnahtari || `${x.urunAnahtari || x.urun}::${x.senaryoBaslik}`;

async function basarisizTestler(alan, kosuGecmisi, sonKosuId, urun, panel, proje) {
  const tamlar = kosuGecmisi.filter((k) => k.tur === 'tam');
  const sira = tamlar.findIndex((k) => k.id === sonKosuId);
  const hedefler = (sira >= 0 ? tamlar.slice(sira, sira + 9) : [kosuGecmisi.find((k) => k.id === sonKosuId)]).filter(Boolean);
  alan.replaceChildren(h('section', { class: 'kart' }, iskelet('liste')));
  let detaylar;
  try {
    detaylar = await Promise.all(hedefler.map((k) => api(`/platform/sonuclar/kosu?id=${encodeURIComponent(k.id)}`).catch(() => null)));
  } catch { alan.replaceChildren(); return; }
  const filtre = (d) => (d ? d.sonuclar.filter((x) => !urun || x.urunAnahtari === urun) : []);
  const son = filtre(detaylar[0]);
  const gecmis = detaylar.slice(1).map(filtre);
  const satirlar = [];
  for (const x of son) {
    const kimlik = senaryoKimligi(x);
    const onceki = gecmis.map((g) => g.find((y) => senaryoKimligi(y) === kimlik)).filter(Boolean);
    const oncekiDurum = onceki.length ? onceki[0].durum : null;
    if (x.durum === 'basarisiz') {
      let seri = 1;
      for (const o of onceki) { if (o.durum === 'basarisiz') seri++; else break; }
      satirlar.push({ x, tur: oncekiDurum === 'basarisiz' ? 'tekrar' : 'yeni', seri });
    } else if (x.durum === 'basarili' && oncekiDurum === 'basarisiz') {
      satirlar.push({ x, tur: 'duzeldi', seri: 0 });
    }
  }
  const siralama = { yeni: 0, tekrar: 1, duzeldi: 2 };
  satirlar.sort((a, b) => siralama[a.tur] - siralama[b.tur] || b.seri - a.seri);
  const basarisizlar = satirlar.filter((r) => r.tur !== 'duzeldi');
  // "Yalnızca başarısızları tekrar çalıştır": başarısız sonuçların senaryo KİMLİKLERİ (UUID) son koşunun
  // ortamında, Senaryolar ekranıyla aynı onay penceresi ve canlı panel üzerinden (kısmi koşu) çalışır.
  const yenidenCalistir = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('yenile'), 'Yalnızca başarısızları tekrar çalıştır');
  yenidenCalistir.addEventListener('click', async () => {
    const gorulen = new Set();
    const hedefler = satirlar.filter((r) => r.tur !== 'duzeldi' && r.x.senaryoId && !gorulen.has(r.x.senaryoId) && gorulen.add(r.x.senaryoId))
      .map((r) => ({ id: r.x.senaryoId, baslik: r.x.senaryoBaslik, ekranAdi: r.x.urun }));
    const baglanamayan = satirlar.filter((r) => r.tur !== 'duzeldi' && !r.x.senaryoId).length;
    if (!hedefler.length) { bildir('Başarısız sonuçlar platformdaki bir senaryoya bağlı değil; Senaryolar ekranından çalıştırın.', 'hata'); return; }
    try {
      const [{ kosuOnayi, kosuBaslat }, { ortamlar }] = await Promise.all([
        import('./kosu-paneli.js'), api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
      ]);
      const ortamId = detaylar[0] && detaylar[0].kosu ? detaylar[0].kosu.ortamId : null;
      const ortam = ortamlar.find((o) => o.id === ortamId) || ortamlar.find((o) => o.varsayilan) || ortamlar[0];
      if (!ortam) { bildir('Projede ortam yok.', 'hata'); return; }
      const onay = await kosuOnayi({
        baslik: 'Başarısızları tekrar çalıştır?', senaryolar: hedefler, ortam, tur: 'tekil', esZamanli: false,
        not: `Son koşuda başarısız olan senaryolar ${ortam.ad} ortamında sırayla, kısmi (tekil) koşu olarak çalışır.${baglanamayan ? ` ${baglanamayan} sonuç bir senaryoya bağlı olmadığı için dahil edilmedi.` : ''}`
      });
      if (!onay) return;
      kosuBaslat({ projeId: proje.id, ortam, senaryolar: hedefler, tur: 'tekil', esZamanli: false, baslik: 'Başarısızlar (tekrar)' });
    } catch (e) {
      if (e && e.durum === 423) return;
      bildir(e.message, 'hata');
    }
  });
  // Kart yalnız son sonucu BAŞARISIZ olanları sayar ve listeler; önceki koşuya göre düzelenler ayrı, kapalı bir alt bölümde.
  const duzelenler = satirlar.filter((r) => r.tur === 'duzeldi');
  const liste = h('ul', { class: 'degisim-listesi' });
  const duzelenListesi = h('ul', { class: 'degisim-listesi' });
  const fazlasi = [];
  const ogeler = new Map();
  for (const r of satirlar) {
    const li = h('li', {},
      h('span', { class: 'etiket-hucresi' }, rozet(DEGISIM[r.tur].etiket, DEGISIM[r.tur].sinif)),
      h('span', { class: 'ad' },
        h('button', { type: 'button', onclick: () => panel.ac(r.x.id, true), title: r.x.senaryoBaslik }, r.x.senaryoBaslik),
        (() => { const alt = [r.x.urun, r.x.hataKategorisi ? kisaKategori(r.x.hataKategorisi) : null, r.tur === 'tekrar' ? `${r.seri} koşudur başarısız` : null].filter(Boolean).join(' · '); return h('small', { title: alt }, alt); })()),
      h('span', { class: 'sag-hucre' },
        r.x.ekranGoruntusuSayisi ? h('span', { title: 'Ekran görüntüsü var' }, ikon('ekran'), h('span', { class: 'gorunmez' }, 'ekran görüntüsü')) : null,
        r.x.videoSayisi ? h('span', { title: 'Video var' }, ikon('video'), h('span', { class: 'gorunmez' }, 'video')) : null,
        sureMetni(r.x.sureMs)));
    ogeler.set(r.x.id, li);
    if (r.tur === 'duzeldi') duzelenListesi.append(li);
    else if (liste.childElementCount < 8) liste.append(li); else fazlasi.push(li);
  }
  const tumunuGoster = fazlasi.length ? h('div', { class: 'liste-alti' }, h('button', {
    type: 'button', class: 'kucuk-dugme hayalet tumunu-goster', onclick: (o) => { liste.append(...fazlasi); o.currentTarget.parentElement.remove(); }
  }, `Tümünü göster (${basarisizlar.length})`)) : null;
  const duzelenBolumu = duzelenler.length
    ? h('details', { class: 'duzelen-testler' }, h('summary', {}, `Önceki koşuya göre düzelen testler (${duzelenler.length})`), duzelenListesi)
    : null;
  panel.secili = (id) => { for (const [k, li] of ogeler) li.classList.toggle('secili', k === id); };
  const kosu = hedefler[0];
  alan.replaceChildren(h('section', { class: 'kart', 'aria-labelledby': 'basarisiz-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'basarisiz-basligi' }, ikon('uyari'), 'Başarısız testler', basarisizlar.length ? rozet(String(basarisizlar.length), 'hata') : null),
      h('span', { class: 'alt' }, `son koşu · ${kisaTarih(kosu.bitis || kosu.baslangic)}${gecmis.length ? ` · önceki ${gecmis.length} tam koşuyla karşılaştırıldı` : ''}`),
      basarisizlar.length ? h('div', { class: 'sag' }, yenidenCalistir) : null),
    basarisizlar.length ? [liste, tumunuGoster]
      : bosDurum('Son koşuda başarısız test yok', duzelenler.length ? 'Önceki koşuda başarısız olup bu koşuda düzelen testler aşağıda.' : gecmis.length ? 'Önceki koşuya göre düzelen test de yok.' : 'Karşılaştırılacak önceki koşu bulunmuyor.', { ikon: 'onay' }),
    duzelenBolumu));
  if (basarisizlar.length) panel.ac(basarisizlar[0].x.id);
}

// ---------------------------------------------------------------------------------------
// Koşu geçmişi
// ---------------------------------------------------------------------------------------

function kosuNoktasi(k) {
  const sinif = k.durum === 'durduruldu' ? 'durdu' : k.durum === 'calisiyor' ? 'vurgu' : k.basarisiz ? 'hata' : k.durum === 'tamamlandi' ? 'basari' : 'atlanan';
  return h('span', { class: `nokta ${sinif}`, 'aria-hidden': 'true', title: KOSU_DURUMU[k.durum] || k.durum });
}

export function dagilimCubugu(x, genislik = null) {
  const t = toplam(x) || 1;
  const w = (v) => `${((v / t) * 100).toFixed(1)}%`;
  return h('span', { class: 'dagilim', 'aria-hidden': 'true', style: genislik ? { width: genislik } : null },
    h('span', { class: 'd-basari', style: { width: w(x.basarili) } }), h('span', { class: 'd-hata', style: { width: w(x.basarisiz) } }),
    h('span', { class: 'd-atlanan', style: { width: w(x.atlanan) } }), h('span', { class: 'd-durdu', style: { width: w(x.durduruldu || 0) } }));
}

function kosuGecmisi(kosular, urun) {
  const govde = h('tbody', {});
  const sayfalama = h('div', { class: 'sayfalama' });
  let sayfa = 0;
  let filtre = 'tumu';
  // "Yalnız başarısızlar": yalnız başarısız testi olan koşular (hızlı süzgeç).
  let yalnizKalan = false;
  // Senaryo formundaki "Dene" koşuları varsayılan gizli (servis sonuçlarındaki "Denemeleri (Dene) de say" gibi; oturumda saklanır).
  let denemeler = oturumOku(DENEME_GOSTER_ANAHTARI) === '1';
  // Sıralama VERİDE (sayfalı tablo; tablo-siralama.js 'tablo-sirala' olayı → { anahtar, yon }).
  /** @type {{ anahtar: string | null; yon: 'artan' | 'azalan' | null }} */
  let siralama = { anahtar: null, yon: null };
  // Karşılaştırma: iki satır seçilip "Karşılaştır" (karsilastirma.js; seçim sayfa değişse de korunur).
  const secici = kosuSecici('ekran');
  const SIRALAMA_ALANLARI = {
    zaman: (k) => { const t = Date.parse(k.baslangic || k.bitis); return Number.isNaN(t) ? 0 : t; },
    tur: (k) => `${k.tur === 'tam' ? 'tam' : 'tekil'} ${k.kapsam || ''}`,
    toplam: (k) => toplam(k), basarili: (k) => k.basarili || 0, basarisiz: (k) => k.basarisiz || 0,
    atlanan: (k) => k.atlanan || 0, durduruldu: (k) => k.durduruldu || 0, oran: (k) => oran(k) ?? -1
  };
  const basliklar = [['Koşu (başlangıç)', 'zaman'], ['Tür / kapsam', 'tur'], ['Dağılım', null], ['Top.', 'toplam', 1], ['Başarılı', 'basarili', 1], ['Başarısız', 'basarisiz', 1], ['Atlanan', 'atlanan', 1], ['Durd.', 'durduruldu', 1], ['Oran', 'oran', 1]]
    .map(([b, anahtar, sag]) => h('th', { scope: 'col', class: sag ? 'sayi' : null, ...(anahtar ? { 'data-sirala-anahtar': anahtar, 'aria-sort': 'none' } : { 'data-sirala': 'yok' }) }, b));
  basliklar.unshift(secici.baslik());
  const sayiHucresi = (v, ek = '') => h('td', { class: `sayi ${v ? ek : 'sifir'}`.trim() }, String(v));
  const ciz = () => {
    const suzulen = (filtre === 'tumu' ? kosular : kosular.filter((k) => k.tur === filtre))
      .filter((k) => (!yalnizKalan || (k.basarisiz || 0) > 0) && (denemeler || !k.denemeKosusu));
    const secilen = siralama.anahtar ? veriyiSirala(suzulen, SIRALAMA_ALANLARI[siralama.anahtar], siralama.yon) : suzulen;
    for (const th of basliklar) {
      const a = th.getAttribute('data-sirala-anahtar');
      if (a) th.setAttribute('aria-sort', a === siralama.anahtar && siralama.yon ? (siralama.yon === 'artan' ? 'ascending' : 'descending') : 'none');
    }
    const dilim = secilen.slice(sayfa * SAYFA_BOYU, (sayfa + 1) * SAYFA_BOYU);
    secici.sifirla();
    govde.replaceChildren(...dilim.map((k) => {
      const o = oran(k);
      // Saat: koşunun BAŞLANGICI (karşılaştırma ve servis sonuçlarıyla aynı). Tüm satır tıklanabilir; klavyede satıra
      // odaklanıp Enter / Boşluk koşuyu açar (içteki bağlantı sekme sırasından çıkarılır, iki kez durulmasın).
      const adres = `#/sonuclar/kosu/${encodeURIComponent(k.id)}`;
      const tarih = kisaTarih(k.baslangic || k.bitis);
      return h('tr', {
        class: 'tiklanabilir-satir', tabindex: '0', title: 'Koşunun senaryo sonuçlarını aç',
        onclick: (o2) => { if (!(/** @type {Element} */ (o2.target)).closest('a, button, input, label, .karsilastir-secim')) location.hash = adres; },
        onkeydown: (o2) => { if (o2.target === o2.currentTarget && (o2.key === 'Enter' || o2.key === ' ')) { o2.preventDefault(); location.hash = adres; } }
      }, secici.hucre(k, k.baslangic || k.bitis, tarih),
        h('td', {}, h('a', { class: 'kosu-baglantisi', href: adres, tabindex: '-1' }, kosuNoktasi(k), tarih),
          h('span', { class: 'gorunmez' }, ` (${KOSU_DURUMU[k.durum] || k.durum})`)),
        h('td', {}, h('span', { class: 'etiketler' }, rozet(k.tur === 'tam' ? 'tam' : 'tekil', k.tur === 'tam' ? 'vurgu' : ''), ' ',
          k.denemeKosusu ? [rozet('deneme'), ' '] : null,
          k.kapsam ? rozet(k.kapsam, '', { kisalt: true }) : null)),
        h('td', {}, dagilimCubugu(k)),
        h('td', { class: 'sayi' }, String(toplam(k))), sayiHucresi(k.basarili, 'basarili-renk'),
        sayiHucresi(k.basarisiz, 'basarisiz-renk'), sayiHucresi(k.atlanan),
        sayiHucresi(k.durduruldu), h('td', { class: 'sayi oran' }, o === null ? '—' : `%${o}`));
    }));
    const sayfaSayisi = Math.max(1, Math.ceil(secilen.length / SAYFA_BOYU));
    sayfalama.replaceChildren(
      h('span', {}, `Sayfa ${sayfa + 1} / ${sayfaSayisi} · ${secilen.length} koşu`),
      h('span', { class: 'sag' },
        h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa === 0, onclick: () => { sayfa--; ciz(); } }, '‹ Önceki'),
        h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa + 1 >= sayfaSayisi, onclick: () => { sayfa++; ciz(); } }, 'Sonraki ›')));
  };
  ciz();
  const filtreSegmenti = segment([['tumu', 'Tümü'], ['tam', 'Tam'], ['tekil', 'Tekil']], filtre, (d) => { filtre = d; sayfa = 0; ciz(); }, 'Koşu türü');
  const kalanKutusu = h('input', { type: 'checkbox', id: 'gecmis-yalniz-kalan' });
  kalanKutusu.addEventListener('change', () => { yalnizKalan = kalanKutusu.checked; sayfa = 0; ciz(); });
  const kalanSuzgeci = h('label', { class: 'secenek mini-secenek', for: kalanKutusu.id, 'data-kayit-disi': '' }, kalanKutusu, 'Yalnız başarısızlar');
  const denemeKutusu = h('input', { type: 'checkbox', id: 'gecmis-denemeler', checked: denemeler });
  denemeKutusu.addEventListener('change', () => { denemeler = denemeKutusu.checked; oturumYaz(DENEME_GOSTER_ANAHTARI, denemeler ? '1' : ''); sayfa = 0; ciz(); });
  const denemeSuzgeci = kosular.some((k) => k.denemeKosusu)
    ? h('label', { class: 'secenek mini-secenek', for: denemeKutusu.id, 'data-kayit-disi': '', title: 'Senaryo formundaki Dene koşuları (kartlar ve trend yalnız tam koşulardandır)' }, denemeKutusu, 'Denemeleri (Dene) de göster')
    : null;
  const tablo = h('table', { class: 'ozet-tablosu gecmis-tablosu', 'data-siralama': 'veri' },
    h('caption', { class: 'gorunmez' }, 'Koşu geçmişi'),
    h('thead', {}, h('tr', {}, basliklar)),
    govde);
  tablo.addEventListener('tablo-sirala', (o) => {
    const { anahtar, yon } = /** @type {CustomEvent} */ (o).detail || {};
    siralama = yon && SIRALAMA_ALANLARI[anahtar] ? { anahtar, yon } : { anahtar: null, yon: null };
    sayfa = 0;
    ciz();
  });
  return h('section', { class: 'kart', 'aria-labelledby': 'gecmis-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'gecmis-basligi' }, ikon('liste'), 'Koşu geçmişi'),
      h('span', { class: 'alt' }, urun ? 'Bu ürünü içeren tüm koşular; sayılar yalnızca bu ürün için' : 'Tam ve tekil koşular; bir koşuya tıklayınca senaryo sonuçları açılır'),
      kosular.length ? h('div', { class: 'sag' }, kalanSuzgeci, denemeSuzgeci, filtreSegmenti, kosular.length > 1 ? secici.dugme : null) : null),
    kosular.length
      ? [h('div', { class: 'tablo-kaydirma' }, tablo), sayfalama]
      : h('p', { class: 'bos-liste' }, 'Henüz koşu yok.'));
}

// ---------------------------------------------------------------------------------------
// Hata kalıpları
// ---------------------------------------------------------------------------------------

/** Kalıp metnindeki "#" yer tutucularını vurgular (metin düğümleriyle). */
export function kalipMetni(kalip) {
  const parcalar = String(kalip).split('#');
  const cikti = [];
  parcalar.forEach((p, i) => { if (p) cikti.push(p); if (i < parcalar.length - 1) cikti.push(h('em', {}, '#')); });
  return h('code', { title: kalip }, cikti);
}

/** Uzun listeler: ilk "sinir" öğe + "Tümünü göster (N)". */
function sinirliListe(ogeler, sinir, sinif, ekOzellik = {}) {
  const liste = h('div', { class: sinif, ...ekOzellik }, ...ogeler.slice(0, sinir));
  if (ogeler.length <= sinir) return liste;
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme hayalet tumunu-goster' }, `Tümünü göster (${ogeler.length})`);
  dugme.addEventListener('click', () => { liste.append(...ogeler.slice(sinir)); dugme.remove(); });
  return h('div', {}, liste, h('div', { class: 'liste-alti' }, dugme));
}
const kalipListesi = (ogeler) => sinirliListe(ogeler, 8, 'kalip-listesi', { role: 'list', 'aria-label': 'Hata kalıpları' });

/**
 * Kalıbın testleri: her başarısız sonuç için senaryo, hatanın alındığı adım, zaman; "Ayrıntı" (sağ panel), "Koşu" (koşu
 * detayı), "Tekrar çalıştır" (senaryoya bağlıysa; aynı ortamda, canlı panelde). Üstte "Hepsini tekrar çalıştır".
 */
function kalipTestleri(k, proje, ornekAc) {
  const sonuclar = k.sonuclar || [];
  const tekrar = async (hedefler, ortamId, dugme) => {
    try {
      if (dugme) dugme.disabled = true;
      const [{ kosuOnayi, kosuBaslat }, { ortamlar }] = await Promise.all([
        import('./kosu-paneli.js'), api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
      ]);
      const ortam = ortamlar.find((o) => o.id === ortamId) || ortamlar.find((o) => o.varsayilan) || ortamlar[0];
      if (!ortam) { bildir('Projede ortam yok.', 'hata'); return; }
      const onay = await kosuOnayi({ baslik: 'Tekrar çalıştırılsın mı?', senaryolar: hedefler, ortam, tur: 'tekil', esZamanli: false,
        not: `Bu hata kalıbının alındığı senaryolar ${ortam.ad} ortamında sırayla, kısmi (tekil) koşu olarak çalışır.` });
      if (!onay) return;
      kosuBaslat({ projeId: proje.id, ortam, senaryolar: hedefler, tur: 'tekil', esZamanli: false, baslik: 'Hata kalıbı (tekrar)' });
    } catch (e) {
      if (e && e.durum === 423) return;
      bildir(e.message, 'hata');
    } finally { if (dugme) dugme.disabled = false; }
  };
  const hedef = (x) => ({ id: x.senaryoId, baslik: x.senaryoBaslik, ekranAdi: k.urun });
  const gorulen = new Set();
  const benzersiz = sonuclar.filter((x) => x.senaryoId && !gorulen.has(x.senaryoId) && gorulen.add(x.senaryoId));
  const hepsi = benzersiz.length > 1 ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: (o) => tekrar(benzersiz.map(hedef), benzersiz[0].ortamId, o.currentTarget) },
    ikon('yenile'), `Hepsini tekrar çalıştır (${benzersiz.length} senaryo)`) : null;
  if (!sonuclar.length) return h('p', { class: 'soluk kucuk' }, 'Test bilgisi yok.');
  return h('div', {},
    hepsi ? h('div', { class: 'kalip-testleri-ust' }, hepsi) : null,
    h('ul', { class: 'kalip-test-listesi', 'aria-label': 'Hatanın alındığı testler' }, sonuclar.map((x) => h('li', {},
      h('span', { class: 'kalip-test-adi' }, h('b', { title: x.senaryoBaslik }, x.senaryoBaslik),
        h('small', {}, [x.adim ? `"${x.adim}" adımında` : null, kisaTarih(x.zaman)].filter(Boolean).join(' · '))),
      h('span', { class: 'kalip-test-eylemleri' },
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => ornekAc(x.sonucId), 'aria-label': `Ayrıntı: ${x.senaryoBaslik}` }, 'Ayrıntı'),
        h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/sonuclar/kosu/${encodeURIComponent(x.kosuId)}`, 'aria-label': `Koşu: ${x.senaryoBaslik}` }, 'Koşu'),
        x.senaryoId ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Tekrar çalıştır: ${x.senaryoBaslik}`, onclick: (o) => tekrar([hedef(x)], x.ortamId, o.currentTarget) },
          ikon('oynat'), 'Tekrar çalıştır') : null)))));
}

// --- Koşuda yakalanan mesajlar (geçen testler dahil; sonuclar/yakalanan-mesajlar.mjs) ---

const YAKALAMA_KAYNAGI = { diyalog: 'Diyalog', 'hata-gostergesi': 'Hata göstergesi', konsol: 'Konsol', 'sayfa-hatasi': 'Sayfa hatası', ag: 'Ağ' };
/** Hata kalıpları bölümünün son seçilen görünümü (sayfa içinde korunur). */
let kalipGorunumu = 'kalan';
let yakalananKaynakSuzgeci = 'tumu';

const kaynakRozeti = (k) => rozet(YAKALAMA_KAYNAGI[k] || k, 'yakalanan-kaynak');
const beklenenRozeti = (beklenen) => (beklenen
  ? rozet('beklenen', 'atlanan', { title: 'Senaryonun beklediği mesajla eşleşti' })
  : rozet('beklenmeyen', 'hata', { title: 'Senaryoda beklenmeyen mesaj' }));

/** Grubun testleri: senaryo, adım, zaman, testin durumu; Ayrıntı ve Koşu. */
function yakalananTestleri(k, ornekAc) {
  const sonuclar = k.sonuclar || [];
  if (!sonuclar.length) return h('p', { class: 'soluk kucuk' }, 'Test bilgisi yok.');
  return h('ul', { class: 'kalip-test-listesi', 'aria-label': 'Mesajın yakalandığı testler' }, sonuclar.map((x) => h('li', {},
    h('span', { class: 'kalip-test-adi' }, h('b', { title: x.senaryoBaslik }, x.senaryoBaslik),
      h('small', {}, [x.adim ? `"${x.adim}" adımında` : null, x.sayi > 1 ? `${x.sayi} kez` : null, kisaTarih(x.zaman)].filter(Boolean).join(' · '))),
    h('span', { class: 'kalip-test-eylemleri' }, durumRozeti(x.durum),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => ornekAc(x.sonucId), 'aria-label': `Ayrıntı: ${x.senaryoBaslik}` }, 'Ayrıntı'),
      h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/sonuclar/kosu/${encodeURIComponent(x.kosuId)}`, 'aria-label': `Koşu: ${x.senaryoBaslik}` }, 'Koşu')))));
}

/** "Koşuda yakalanan mesajlar" görünümü: kaynak süzgeci; satırlar önce beklenmeyen (sunucu sıralar). */
function yakalananMesajlarGorunumu(y, urun, ornekAc) {
  if (!y.kaliplar.length) {
    return h('p', { class: 'bos-liste' }, 'Bu aralıkta koşuda yakalanan mesaj yok (diyalog, hata göstergesi, konsol, sayfa hatası, ağ 4xx/5xx).');
  }
  const listeAlani = h('div', {});
  const ciz = () => {
    const secilen = y.kaliplar.filter((k) => yakalananKaynakSuzgeci === 'tumu' || k.kaynak === yakalananKaynakSuzgeci);
    if (!secilen.length) { listeAlani.replaceChildren(h('p', { class: 'bos-liste' }, 'Bu kaynakta mesaj yok.')); return; }
    listeAlani.replaceChildren(sinirliListe(secilen.map((k) => {
      const testler = h('div', { class: 'kalip-testleri', hidden: true });
      const ac = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-expanded': 'false', 'aria-label': `Mesajın yakalandığı testler: ${YAKALAMA_KAYNAGI[k.kaynak] || k.kaynak}` },
        ikon('liste'), `Testler (${(k.sonuclar || []).length})`);
      const degistir = () => {
        const acik = testler.hidden;
        testler.hidden = !acik;
        ac.setAttribute('aria-expanded', String(acik));
        if (acik && !testler.childElementCount) yerlestir(testler, yakalananTestleri(k, ornekAc));
      };
      ac.addEventListener('click', (o) => { o.stopPropagation(); degistir(); });
      const gecenKalan = [k.kalanTestSayisi ? `${k.kalanTestSayisi} başarısız` : null, k.gecenTestSayisi ? `${k.gecenTestSayisi} geçen` : null].filter(Boolean).join(' · ');
      const satir = h('div', { class: `kalip-satiri yakalanan-satiri ${k.beklenen ? 'beklenen' : 'beklenmeyen'}`, role: 'listitem' },
        h('span', { class: 'kalip-ikon', 'aria-hidden': 'true' }, ikon(k.beklenen ? 'onay' : 'uyari')),
        h('div', { class: 'kalip-baslik' }, kaynakRozeti(k.kaynak), beklenenRozeti(k.beklenen), rozet(`${k.senaryoSayisi} senaryo`),
          gecenKalan ? rozet(gecenKalan) : null, urun ? null : (k.urunler || []).slice(0, 3).map((u) => rozet(u, 'vurgu')),
          h('span', { class: 'cok-soluk' }, `ilk ${gunAy(k.ilk)} · son ${kisaTarih(k.son)}`)),
        h('div', { class: 'kalip-sayi' }, h('span', {}, String(k.sayi), h('small', {}, ' kez')), ac),
        kalipMetni(k.kalip),
        k.ornekMetin && k.ornekMetin !== k.kalip ? h('p', { class: 'yakalanan-ornek soluk kucuk', title: 'Son örnek (maskeli)' }, k.ornekMetin) : null,
        testler);
      satir.addEventListener('click', (o) => { if (!(o.target instanceof Element) || !o.target.closest('button, a, .kalip-testleri')) degistir(); });
      return satir;
    }), 8, 'kalip-listesi', { role: 'list', 'aria-label': 'Koşuda yakalanan mesajlar' }));
  };
  const kaynaklar = Object.entries(y.kaynaklar || {}).filter(([, n]) => n > 0);
  if (yakalananKaynakSuzgeci !== 'tumu' && !kaynaklar.some(([k]) => k === yakalananKaynakSuzgeci)) yakalananKaynakSuzgeci = 'tumu';
  const suzgec = segment([['tumu', `Tümü (${y.toplam})`], ...kaynaklar.map(([k, n]) => [k, `${YAKALAMA_KAYNAGI[k] || k} (${n})`])],
    yakalananKaynakSuzgeci, (d) => { yakalananKaynakSuzgeci = d; ciz(); }, 'Kaynak süzgeci');
  ciz();
  return h('div', {},
    h('div', { class: 'kategori-cipleri' }, h('span', { class: 'rozet hap hata' }, h('b', {}, String(y.beklenmeyen)), 'beklenmeyen'),
      h('span', { class: 'rozet hap' }, h('b', {}, String(y.toplam - y.beklenmeyen)), 'beklenen')),
    h('div', { class: 'yakalanan-suzgec' }, suzgec),
    listeAlani);
}

/** Test ayrıntısı: testin koşuda yakalanan mesajları (önce beklenmeyen). */
function yakalananMesajListesi(liste) {
  if (!liste || !liste.length) return h('p', { class: 'soluk kucuk' }, 'Yok (bu testte diyalog, hata göstergesi, konsol / sayfa hatası ya da ağ 4xx/5xx yakalanmadı).');
  return h('ul', { class: 'yakalanan-listesi', 'aria-label': 'Testin yakalanan mesajları' }, ...liste.map((m) => h('li', { class: m.beklenen ? 'beklenen' : 'beklenmeyen' },
    h('span', { class: 'satir' }, kaynakRozeti(m.kaynak), beklenenRozeti(m.beklenen), m.sayi > 1 ? rozet(`${m.sayi} kez`) : null,
      m.adim ? h('small', { class: 'soluk' }, `"${m.adim}" adımında`) : null),
    h('span', { class: 'yakalanan-metin' }, m.metin))));
}

/** Hata kalıpları sayfanın tarih aralığı süzgecini izler (ayrı alan yok; aralık değişince sayfa yeniden yüklenir). */
function hataKaliplariBolumu(alan, proje, urun, ornekAc) {
  const sonucAlani = h('div', {}, iskelet('liste'));
  const aralik = kayitliAralik();
  const yukle = async () => {
    const q = araligiSorguyaEkle(new URLSearchParams({ projeId: proje.id }), aralik);
    if (urun) q.set('urun', urun);
    sonucAlani.replaceChildren(iskelet('liste'));
    try {
      const v = await api(`/platform/sonuclar/kaliplar?${q}`);
      // İki görünüm: "Başarısız testlerin hataları" (Playwright hata mesajı) ve "Koşuda yakalanan mesajlar" (geçen testler dahil).
      const y = v.yakalanan || { toplam: 0, beklenmeyen: 0, kaynaklar: {}, kaliplar: [] };
      const kalanAlani = h('div', { class: 'kalip-gorunumu', hidden: kalipGorunumu !== 'kalan' });
      const yakalananAlani = h('div', { class: 'kalip-gorunumu', hidden: kalipGorunumu !== 'yakalanan' }, yakalananMesajlarGorunumu(y, urun, ornekAc));
      const sekmeler = segment([['kalan', `Başarısız testlerin hataları (${v.toplam})`], ['yakalanan', `Koşuda yakalanan mesajlar (${y.toplam})`]], kalipGorunumu, (d) => {
        kalipGorunumu = d;
        kalanAlani.hidden = d !== 'kalan';
        yakalananAlani.hidden = d !== 'yakalanan';
      }, 'Hata kalıpları görünümü');
      sonucAlani.replaceChildren(sekmeler, kalanAlani, yakalananAlani);
      if (!v.kaliplar.length) { kalanAlani.replaceChildren(h('p', { class: 'bos-liste' }, 'Bu aralıkta başarısız sonuç yok.')); return; }
      kalanAlani.replaceChildren(
        h('div', { class: 'kategori-cipleri' }, h('span', { class: 'rozet hap hata' }, h('b', {}, String(v.toplam)), 'başarısız sonuç'),
          ...Object.entries(v.kategoriler).map(([k, n]) => h('span', { class: 'rozet hap' }, kisaKategori(k), h('b', {}, String(n))))),
        kalipListesi(v.kaliplar.map((k) => {
          const sinif = kategoriSinifi(k.kategori);
          // Kalıba tıklanınca: hatanın alındığı testler (senaryo, adım, zaman) — ayrıntı, koşu, tekrar çalıştır.
          const testler = h('div', { class: 'kalip-testleri', hidden: true });
          const ac = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-expanded': 'false', 'aria-label': `Hatanın alındığı testler: ${kisaKategori(k.kategori)}, ${k.urun}` },
            ikon('liste'), `Testler (${(k.sonuclar || []).length})`);
          const degistir = () => {
            const acik = testler.hidden;
            testler.hidden = !acik;
            ac.setAttribute('aria-expanded', String(acik));
            if (acik && !testler.childElementCount) yerlestir(testler, kalipTestleri(k, proje, ornekAc));
          };
          ac.addEventListener('click', (o) => { o.stopPropagation(); degistir(); });
          const satir = h('div', { class: `kalip-satiri ${sinif}`, role: 'listitem' },
            h('span', { class: 'kalip-ikon', 'aria-hidden': 'true' }, ikon(KATEGORI_IKONU[sinif])),
            h('div', { class: 'kalip-baslik' }, kisaKategori(k.kategori), rozet(`${k.senaryoSayisi} senaryo`), urun ? null : rozet(k.urun, 'vurgu', { kisalt: true }),
              h('span', { class: 'cok-soluk' }, `ilk ${gunAy(k.ilk)} · son ${kisaTarih(k.son)}`)),
            h('div', { class: 'kalip-sayi' }, h('span', {}, String(k.sayi), h('small', {}, ' adet')),
              h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: (o) => { o.stopPropagation(); ornekAc(k.ornekSonucId); }, 'aria-label': `Örnek sonucu aç: ${kisaKategori(k.kategori)}, ${k.urun}` }, 'Örnek'), ac),
            kalipMetni(k.kalip), testler);
          satir.addEventListener('click', (o) => { if (!(o.target instanceof Element) || !o.target.closest('button, a, .kalip-testleri')) degistir(); });
          return satir;
        })));
    } catch (e) {
      if (e && e.durum === 423) return;
      sonucAlani.replaceChildren(hataKutusu(e));
    }
  };
  alan.replaceChildren(h('section', { class: 'kart', 'aria-labelledby': 'kalip-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'kalip-basligi' }, ikon('uyari'), 'Hata kalıpları'),
      h('span', { class: 'alt' }, `${aralikMetni(aralik)} (sayfanın tarih aralığı) · değişken sayılar # ile tek satırda toplanır · koşuda yakalanan mesajlar geçen testleri de kapsar`)),
    sonucAlani));
  yukle();
}

// ---------------------------------------------------------------------------------------
// Ortak test sonucu parçaları (sağ panel ve detay sayfası)
// ---------------------------------------------------------------------------------------

/** Adım görüntüsü alınamadığında koşucunun eklediği not (ad: "NN - <adım> (ekran görüntüsü alınamadı: <neden>)"). */
const ALINAMADI_DESENI = /^(.*) \(ekran görüntüsü alınamadı(?:: (.*))?\)$/;
const alinamadiMi = (m) => m.tur === 'diger' && ALINAMADI_DESENI.test(m.ad);

/**
 * Sonucun medya notları: saklama süresi dolduğu için silinen ekran görüntüleri (Ayarlar > Yedekleme > Saklama > Medyayı
 * incelt) ve alınamayan adım görüntüleri ("görüntü alınamadı: neden").
 */
function medyaNotlari(s2) {
  const silinen = s2.medya.filter((m) => m.tur === 'ekran_goruntusu' && m.silinme);
  const alinamayan = s2.medya.filter(alinamadiMi);
  if (!silinen.length && !alinamayan.length) return null;
  const son = silinen.reduce((a, m) => (!a || m.silinme > a ? m.silinme : a), null);
  return h('ul', { class: 'medya-notlari soluk kucuk', 'aria-label': 'Medya notları' },
    silinen.length ? h('li', {}, ikon('saat'), `${silinen.length} ekran görüntüsü saklama süresi dolduğu için ${tarihMetni(son)} tarihinde silindi (sonuç ve adımlar duruyor).`) : null,
    ...alinamayan.map((m) => {
      const [, adim, neden] = m.ad.match(ALINAMADI_DESENI) || [];
      return h('li', {}, ikon('uyari'), `Görüntü alınamadı: ${neden || 'süre sınırı doldu'} — ${adim || m.ad}`);
    }));
}

/** Başka bir bilgisayardan yedekle gelen ve dosyası yedeğe alınmamış medya. */
function yedekDisiNotu(m) {
  const tur = { ekran_goruntusu: 'Ekran görüntüsü', video: 'Video', iz: 'İz (trace) dosyası', diger: 'Ek' }[m.tur] || 'Medya';
  return h('p', { class: 'medya-yedek-disi soluk kucuk', role: 'note' }, ikon('arsiv'),
    h('span', {}, `${tur}: Bu medya yedeğe dahil edilmemişti. `,
      h('span', {}, 'Dosya, kaydedildiği bilgisayarda; medyalı bir yedekle yeniden içe aktarılabilir.')));
}

function indirBaglantisi(m, metin, sinif = 'dugme kucuk-dugme') {
  return h('a', { class: sinif, href: medyaUrl(m.id, true), download: '' }, ikon('indir'), metin);
}

/** Büyük görünüm diyaloğu: önceki/sonraki, indir, tam ekran, kapat. */
function gorselDiyalogu(gorseller) {
  const diyalog = h('dialog', { class: 'gorsel-diyalog', 'aria-label': 'Ekran görüntüsü' });
  let sira = 0;
  const ciz = () => {
    const m = gorseller[sira];
    const img = h('img', { src: medyaUrl(m.id), alt: m.ad, class: 'buyuk-gorsel' });
    const tamEkran = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { img.requestFullscreen?.().catch(() => {}); } }, ikon('genislet'), 'Tam ekran');
    diyalog.replaceChildren(
      h('div', { class: 'diyalog-ust' }, h('strong', {}, m.ad), gorseller.length > 1 ? h('span', { class: 'cok-soluk mono kucuk' }, `${sira + 1} / ${gorseller.length}`) : null,
        h('div', { class: 'dugmeler' },
          gorseller.length > 1 ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': 'Önceki görüntü', onclick: () => { sira = (sira - 1 + gorseller.length) % gorseller.length; ciz(); } }, '‹') : null,
          gorseller.length > 1 ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': 'Sonraki görüntü', onclick: () => { sira = (sira + 1) % gorseller.length; ciz(); } }, '›') : null,
          indirBaglantisi(m, 'İndir'), tamEkran,
          h('button', { type: 'button', class: 'kucuk-dugme birincil', onclick: () => diyalog.close() }, 'Kapat'))),
      img);
  };
  return {
    diyalog,
    ac(m, tamEkran = false) {
      sira = Math.max(0, gorseller.indexOf(m));
      ciz();
      diyalog.showModal();
      if (tamEkran) diyalog.querySelector('img')?.requestFullscreen?.().catch(() => {});
    }
  };
}

/** Ekran görüntüsü görüntüleyici (tarayıcı çerçevesi + hata anı vurgusu). */
function goruntuleyici(s2, gorseller, buyut, secenekler = {}) {
  const gosterilebilir = gorseller.filter((m) => !m.yedekDisi);
  const m = gosterilebilir.length ? gosterilebilir[gosterilebilir.length - 1] : null;
  const kap = h('div', { class: `goruntuleyici ${s2.durum === 'basarisiz' ? 'hata-ani' : ''}` },
    h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, m ? m.ad : s2.urun)),
    m ? h('span', { class: 'zaman-damgasi', 'aria-hidden': 'true' }, saatMetni(s2.bitis)) : null);
  const icerikAlani = h('div', {});
  kap.append(icerikAlani);
  const onizleme = () => {
    if (m) {
      icerikAlani.replaceChildren(h('button', { type: 'button', class: 'onizleme-dugmesi', onclick: () => buyut(m), 'aria-label': `${m.ad} — büyüt` },
        h('img', { src: medyaUrl(m.id), alt: '', loading: secenekler.tembel ? 'lazy' : null })));
    } else if (gorseller.some((g) => g.yedekDisi)) {
      icerikAlani.replaceChildren(yedekDisiNotu(gorseller.find((g) => g.yedekDisi)));
    } else {
      icerikAlani.replaceChildren(h('div', { class: 'medya-bos' }, ikon('ekran'), 'Bu sonuçta ekran görüntüsü yok.'));
    }
  };
  onizleme();
  return {
    kap, gorsel: m,
    videoOynat(v) {
      icerikAlani.replaceChildren(h('video', { controls: true, autoplay: true, src: medyaUrl(v.id), class: 'sonuc-videosu' }));
    },
    onizleme
  };
}

function hataOzeti(s2) {
  if (!s2.hataMesaji) return null;
  const ilk = s2.hataMesaji.split('\n').find((x) => x.trim()) || s2.hataMesaji;
  const bg = s2.beklenenGorulen;
  return h('div', {},
    h('div', { class: 'hata-ozeti' }, h('b', {}, 'Hata: '), ilk.replace(/^\w*Error:\s*/, '')),
    bg ? h('dl', { class: 'karsilastirma' },
      h('div', { class: 'beklenen' }, h('dt', {}, 'Beklenen'), h('dd', {}, bg.beklenen || '—')),
      h('div', { class: 'gorulen' }, h('dt', {}, 'Görülen'), h('dd', {}, bg.gorulen || '—'))) : null);
}

function adimCizelgesi(adimlar) {
  if (!adimlar.length) return h('p', { class: 'bos-liste' }, 'Adım bilgisi yok.');
  return h('ol', { class: 'adim-listesi' }, ...adimlar.map((a) => h('li', { class: `adim ${a.durum}` },
    h('span', { class: 'adim-isareti', 'aria-hidden': 'true' }, ikon((DURUM[a.durum] || DURUM.atlanan).ikon)),
    h('span', { class: 'adim-metni' }, h('span', {}, a.ad), h('span', { class: 'gorunmez' }, ` — ${(DURUM[a.durum] || { etiket: a.durum }).etiket}`),
      a.hataMesaji ? h('pre', { class: 'hata-mesaji kucuk' }, a.hataMesaji) : null),
    h('span', { class: 'adim-suresi' }, a.sureMs === null ? '—' : sureMetni(a.sureMs)))));
}

function alanCipleri(alanlar) {
  if (!alanlar.length) return h('p', { class: 'soluk kucuk' }, 'Yok (bu testte atlanan ya da doldurulamayan alan bildirilmedi).');
  return h('ul', { class: 'alan-cipleri' }, ...alanlar.map((a) => h('li', { class: 'alan-cipi' }, h('strong', {}, a.alan), a.neden ? h('small', {}, a.neden) : null)));
}

const adimOzeti = (adimlar) => (adimlar.length ? `${adimlar.filter((a) => a.durum === 'basarili').length} / ${adimlar.length} başarılı` : '');

// ---------------------------------------------------------------------------------------
// Sağ panel: başarısız test (A tasarımı)
// ---------------------------------------------------------------------------------------

async function testPaneli(alan, id, kapat) {
  alan.replaceChildren(h('div', { class: 'bolum' }, iskelet('sayfa')));
  let s2;
  try {
    ({ sonuc: s2 } = await api(`/platform/sonuclar/sonuc?id=${encodeURIComponent(id)}`));
  } catch (e) {
    if (e && e.durum === 423) return;
    alan.replaceChildren(h('div', { class: 'bolum' }, hataKutusu(e)));
    return;
  }
  // Saklama süresi dolup silinen görüntüler gösterilmez (medya notu kalır).
  const gorseller = s2.medya.filter((m) => m.tur === 'ekran_goruntusu' && !m.silinme);
  const video = s2.medya.find((m) => m.tur === 'video' && !m.silinme && !m.yedekDisi);
  const silinenVideo = s2.medya.find((m) => m.tur === 'video' && m.silinme);
  const dg = gorselDiyalogu(gorseller.filter((m) => !m.yedekDisi));
  const gv = goruntuleyici(s2, gorseller, (m) => dg.ac(m));
  alan.classList.toggle('basarili', s2.durum !== 'basarisiz');
  const izle = h('button', {
    type: 'button', class: 'birincil', disabled: !video,
    title: video ? null : silinenVideo ? `Video saklama süresi dolduğu için ${tarihMetni(silinenVideo.silinme)} tarihinde silindi` : 'Bu sonuçta video yok (Ayarlar > Koşu > Kayıt > Video)'
  }, ikon('oynat'), 'Videoyu izle');
  let oynuyor = false;
  izle.addEventListener('click', () => {
    if (!video) return;
    if (oynuyor) { gv.onizleme(); izle.replaceChildren(ikon('oynat'), 'Videoyu izle'); oynuyor = false; return; }
    gv.videoOynat(video); oynuyor = true; izle.replaceChildren(ikon('gorunum'), 'Görüntüye dön');
  });
  yerlestir(alan,
    h('div', { class: 'panel-ust' },
      h('div', { class: 'satir' }, durumRozeti(s2.durum), s2.hataKategorisi ? rozet(kisaKategori(s2.hataKategorisi)) : null, rozet(sureMetni(s2.sureMs)),
        h('button', { type: 'button', class: 'ikon-dugme hayalet kapat', 'aria-label': 'Paneli kapat', onclick: kapat }, ikon('carpi'))),
      h('h3', {}, s2.senaryoBaslik),
      h('div', { class: 'm' }, h('span', {}, s2.urun, ' ', ekranDurumRozeti(s2.ekranDurumu)), s2.deneme ? h('span', {}, `${s2.deneme}. yeniden deneme`) : null,
        h('span', {}, `${saatMetni(s2.baslangic)} → ${saatMetni(s2.bitis)}`))),
    h('div', { class: 'bolum' }, gv.kap, medyaNotlari(s2)),
    h('div', { class: 'panel-eylemleri' }, izle,
      gv.gorsel ? indirBaglantisi(gv.gorsel, 'İndir', 'dugme') : null,
      gv.gorsel ? h('button', { type: 'button', class: 'ikon-dugme', 'aria-label': 'Tam ekran', title: 'Tam ekran', onclick: () => dg.ac(gv.gorsel, true) }, ikon('genislet')) : null),
    s2.hataMesaji ? h('div', { class: 'bolum' }, hataOzeti(s2)) : null,
    h('div', { class: 'bolum' }, h('h4', { class: 'bolum-etiketi' }, 'Adımlar', h('span', { class: 'mono' }, adimOzeti(s2.adimlar))), adimCizelgesi(s2.adimlar)),
    h('div', { class: 'bolum' }, h('h4', { class: 'bolum-etiketi' }, 'Atlanan / doldurulamayan alanlar', h('span', { class: 'mono' }, String(s2.atlananAlanlar.length))), alanCipleri(s2.atlananAlanlar)),
    h('div', { class: 'bolum' }, h('h4', { class: 'bolum-etiketi' }, 'Koşuda yakalanan mesajlar', h('span', { class: 'mono' }, String((s2.yakalananMesajlar || []).length))),
      yakalananMesajListesi(s2.yakalananMesajlar)),
    h('div', { class: 'bolum' }, h('a', { class: 'dugme hayalet kucuk-dugme', href: `#/sonuclar/sonuc/${encodeURIComponent(s2.id)}` }, 'Tüm ayrıntılar', ikon('ok'))),
    dg.diyalog);
}

// ---------------------------------------------------------------------------------------
// Koşu detayı
// ---------------------------------------------------------------------------------------

async function kosuDetayi(icerik, id, proje) {
  const [{ kosu, sonuclar }, ortamlar] = await Promise.all([
    api(`/platform/sonuclar/kosu?id=${encodeURIComponent(id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`).then((v) => v.ortamlar).catch(() => [])
  ]);
  const ortamKaydi = kosu.ortamId ? ortamlar.find((o) => o.id === kosu.ortamId) || null : null;
  const ortam = ortamKaydi ? ortamKaydi.ad : null;
  // Başlarken listesinin son adımı ("Sonuçları incele"): tam koşunun ayrıntısı açıldı.
  if (kosu.tur === 'tam') sonuclarIncelendi(proje);
  // Hızlı süzgeçler: "Yalnız başarısızlar" ve hata kalıbı (kalıba tıklayınca yalnız o kalıptaki testler; çip ile kaldırılır).
  const suzgec = { kalan: false, kalip: /** @type {string | null} */ (null) };
  let suzgecUygula = () => {};
  const kalipDugmesi = (kalip) => h('button', { type: 'button', class: 'baglanti-dugmesi kalip-suzgec-dugmesi', title: 'Yalnız bu hata kalıbındaki testleri göster',
    onclick: () => { suzgec.kalip = kalip; suzgecUygula(); } }, kalip);
  const satir = (x, alt = false) => h('tr', {
    class: [alt ? 'veri-kosusu-alt' : '', x.durum === 'basarisiz' ? 'kalan-satir' : ''].join(' ').trim() || null, hidden: alt ? true : null,
    'data-kalip': x.hataKalibi || null
  },
    // Hazırlığı eksik (koşuya alınmadı): "Çalıştırılamadı" + gerekçe (atlananlar içinde sayılır).
    h('td', {}, x.hamDurum === 'calistirilamadi' ? rozet('Çalıştırılamadı', 'atlanan', { title: 'Hazırlığı eksik: koşuya alınmadı (gerekçe test ayrıntısında)' }) : durumRozeti(x.durum)),
    h('td', {}, x.urun, x.ekranDurumu === 'silindi' || x.ekranDurumu === 'devre_disi' ? [' ', ekranDurumRozeti(x.ekranDurumu)] : null),
    h('td', {}, h('a', { href: `#/sonuclar/sonuc/${encodeURIComponent(x.id)}` }, alt && x.veriKosusu && x.veriKosusu.ad ? x.veriKosusu.ad : x.senaryoBaslik)),
    h('td', { class: 'sayi' }, sureMetni(x.sureMs)),
    h('td', { class: 'kalip' }, x.hataKalibi ? kalipDugmesi(x.hataKalibi) : ''),
    h('td', {}, h('span', { class: 'etiketler' },
      x.ekranGoruntusuSayisi ? rozet([ikon('ekran'), `${x.ekranGoruntusuSayisi} görsel`], '', { title: 'Ekran görüntüsü' }) : null, ' ',
      x.videoSayisi ? rozet([ikon('video'), 'video'], '', { title: 'Video' }) : null)));
  // VERİ KOŞULARI: aynı senaryonun tablodan çoklu satırla koşan testleri tek senaryo satırında toplanır (açılınca satır satır).
  const gruplar = new Map();
  for (const x of sonuclar) {
    if (!x.senaryoId || !x.veriKosusu || !x.veriKosusu.anahtar) continue;
    if (!gruplar.has(x.senaryoId)) gruplar.set(x.senaryoId, []);
    gruplar.get(x.senaryoId).push(x);
  }
  const DURUM_SIRASI = ['basarisiz', 'durduruldu', 'atlanan', 'basarili'];
  const grupSatirlari = (liste) => {
    const ilk = liste[0];
    const temel = ilk.veriKosusu.ad && ilk.senaryoBaslik.endsWith(` [${ilk.veriKosusu.ad}]`) ? ilk.senaryoBaslik.slice(0, -(ilk.veriKosusu.ad.length + 3)) : ilk.senaryoBaslik;
    const durum = liste.map((x) => x.durum).sort((a, b) => DURUM_SIRASI.indexOf(a) - DURUM_SIRASI.indexOf(b))[0];
    const kalan = liste.filter((x) => x.durum === 'basarisiz').length;
    const altlar = liste.map((x) => satir(x, true));
    const ac = h('button', { type: 'button', class: 'veri-kosusu-ac', 'aria-expanded': 'false', title: 'Veri koşularını göster' },
      h('span', { class: 'ok-simge', 'aria-hidden': 'true' }, '▸'), h('span', {}, temel), rozet(`${liste.length} veri koşusu`, 'vurgu'));
    ac.addEventListener('click', () => {
      const acik = ac.getAttribute('aria-expanded') !== 'true';
      ac.setAttribute('aria-expanded', String(acik));
      for (const a of altlar) a.hidden = !acik;
    });
    const ust = h('tr', { class: `veri-kosusu-grubu${kalan ? ' kalan-satir' : ''}`, 'data-senaryo': ilk.senaryoId, 'data-kaliplar': JSON.stringify([...new Set(liste.map((x) => x.hataKalibi).filter(Boolean))]) },
      h('td', {}, durumRozeti(durum)), h('td', {}, ilk.urun), h('td', {}, ac),
      h('td', { class: 'sayi' }, sureMetni(liste.reduce((t, x) => t + (x.sureMs || 0), 0))),
      h('td', { class: 'kalip' }, kalan ? `${kalan} / ${liste.length} satır başarısız` : `${liste.length} satırın hepsi geçti`),
      h('td', {}));
    return [ust, ...altlar];
  };
  const tabloSatirlari = [];
  const islenen = new Set();
  for (const x of sonuclar) {
    const g = x.senaryoId ? gruplar.get(x.senaryoId) : null;
    if (!g) { tabloSatirlari.push(satir(x)); continue; }
    if (islenen.has(x.senaryoId)) continue;
    islenen.add(x.senaryoId);
    tabloSatirlari.push(...grupSatirlari(g));
  }
  // Başarısızları tekrar çalıştır: yalnız başarısız testler (veri koşularında yalnız kalan satırlar), aynı ortam, o koşudaki satırlar ve model sürümü.
  const tekrarlanabilir = sonuclar.filter((x) => x.durum === 'basarisiz' && x.senaryoId).length;
  const tekrarDugmesi = tekrarlanabilir && kosu.ortamId
    ? h('button', { type: 'button', class: 'dugme', onclick: () => basarisizlariTekrarCalistir(kosu, ortamKaydi, proje) }, ikon('yenile'), `Başarısızları tekrar çalıştır (${tekrarlanabilir})`)
    : null;
  const tekrarBagi = kosu.tekrarKaynagi ? h('span', { class: 'tekrar-bagi' }, ikon('yenile'), 'Tekrar: ',
    kosu.tekrarKaynagi.var ? h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(kosu.tekrarKaynagi.id)}` }, kisaTarih(kosu.tekrarKaynagi.bitis || kosu.tekrarKaynagi.baslangic)) : 'önceki koşu silinmiş',
    kosu.tekrarKaynagi.var ? [' · ', h('a', { href: `#/sonuclar/karsilastir/${encodeURIComponent(kosu.tekrarKaynagi.id)}/${encodeURIComponent(kosu.id)}` }, 'karşılaştır')] : null) : null;
  const tekrarlar = (kosu.tekrarlar || []).length ? h('span', { class: 'tekrar-bagi' }, `Tekrarları (${kosu.tekrarlar.length}): `,
    kosu.tekrarlar.slice(0, 3).map((t, i) => [i ? ', ' : '', h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(t.id)}` }, kisaTarih(t.bitis || t.baslangic))])) : null;
  // Süzgeç: satırlar gizlenir (veri koşusu alt satırlarının açık / kapalı durumu korunur: data-suzuldu ile ayrı tutulur).
  const kalanSayisi = sonuclar.filter((x) => x.durum === 'basarisiz').length;
  const kalanKutusu = h('input', { type: 'checkbox', id: `kosu-yalniz-kalan-${kosu.id}`.replace(/[^A-Za-z0-9_-]/g, '-') });
  const suzgecCipi = h('span', { class: 'suzgec-cipi', hidden: true });
  const bosSuzgec = h('p', { class: 'bos-liste', hidden: true }, 'Süzgece uyan test yok.');
  suzgecUygula = () => {
    kalanKutusu.checked = suzgec.kalan;
    let gorunen = 0;
    for (const tr of tabloSatirlari) {
      const kaliplar = tr.dataset.kalip ? [tr.dataset.kalip] : tr.dataset.kaliplar ? JSON.parse(tr.dataset.kaliplar) : [];
      const uyar = (!suzgec.kalan || tr.classList.contains('kalan-satir')) && (!suzgec.kalip || kaliplar.includes(suzgec.kalip));
      tr.classList.toggle('suzuldu', !uyar);
      if (uyar && !tr.hidden) gorunen++;
    }
    bosSuzgec.hidden = gorunen > 0;
    suzgecCipi.hidden = !suzgec.kalip;
    if (suzgec.kalip) {
      yerlestir(suzgecCipi, h('span', {}, 'Hata kalıbı: ', h('code', {}, suzgec.kalip)),
        h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Hata kalıbı süzgecini kaldır', onclick: () => { suzgec.kalip = null; suzgecUygula(); } }, ikon('carpi')));
    }
  };
  kalanKutusu.addEventListener('change', () => { suzgec.kalan = kalanKutusu.checked; suzgecUygula(); });
  const hizliSuzgec = sonuclar.length ? h('div', { class: 'hizli-suzgec', 'data-kayit-disi': '' },
    h('label', { class: 'secenek mini-secenek', for: kalanKutusu.id }, kalanKutusu, `Yalnız başarısızlar (${kalanSayisi})`), suzgecCipi) : null;
  const sure = kosu.bitis ? new Date(kosu.bitis).getTime() - new Date(kosu.baslangic).getTime() : null;
  const o = oran(kosu);
  const ozetKarti = (etiket, deger, sinif) => h('div', { class: `sonuc-karti ${sinif}` },
    h('span', { class: 'kart-etiket' }, etiket), h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, String(deger))));
  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Koşu')),
        h('h2', { tabindex: '-1' }, `Koşu — ${tarihMetni(kosu.bitis || kosu.baslangic)}`),
        h('div', { class: 'meta' },
          h('span', {}, rozet(kosu.tur === 'tam' ? 'tam koşu' : kosu.denemeKosusu ? 'deneme (Dene)' : 'tekil koşu', kosu.tur === 'tam' ? 'vurgu' : '')),
          kosu.kapsam ? h('span', {}, rozet(`kapsam: ${kosu.kapsam}`, '', { kisalt: true })) : null,
          ortam ? h('span', {}, ikon('ag'), `ortam: ${ortam}`) : null,
          h('span', {}, kosuNoktasi(kosu), KOSU_DURUMU[kosu.durum] || kosu.durum),
          h('span', {}, ikon('saat'), h('span', { class: 'mono' }, `${kisaTarih(kosu.baslangic)} → ${kosu.bitis ? saatMetni(kosu.bitis) : '—'}`)),
          sure !== null ? h('span', {}, h('span', { class: 'mono' }, sureMetni(sure))) : null,
          tekrarBagi, tekrarlar)),
      h('div', { class: 'eylemler' }, tekrarDugmesi, karsilastirDugmesi({ tur: 'ekran', projeId: proje.id, kosuId: kosu.id }), htmlRaporDugmesi({ tur: 'ekran', projeId: proje.id, id: kosu.id }),
        h('a', { class: 'dugme hayalet', href: '#/sonuclar' }, ikon('geri'), 'Sonuçlar'))),
    h('div', { class: 'sonuc-kartlari mini' },
      ozetKarti('Başarılı', kosu.basarili, 'basarili'), ozetKarti('Başarısız', kosu.basarisiz, 'basarisiz'),
      ozetKarti('Atlanan', kosu.atlanan, 'atlanan'), ozetKarti('Durduruldu', kosu.durduruldu, 'durduruldu'),
      h('div', { class: 'sonuc-karti oran' }, h('span', { class: 'kart-etiket' }, 'Başarı oranı'),
        h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, o === null ? '—' : `%${o}`)), dagilimCubugu(kosu, '100%'))),
    h('p', { class: 'kart-kaynak' }, `${kosu.basarili} başarılı, ${kosu.basarisiz} başarısız, ${kosu.atlanan} atlanan, ${kosu.durduruldu} durduruldu`,
      kosu.calistirilamadi ? `; atlananlardan ${kosu.calistirilamadi} senaryo hazırlığı eksik olduğu için koşuya alınmadı (Çalıştırılamadı)` : ''),
    h('section', { class: 'kart', 'aria-labelledby': 'senaryo-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'senaryo-basligi' }, ikon('liste'), `Senaryolar (${sonuclar.length})`),
        h('span', { class: 'alt' }, 'Başarısızlar önce; bir senaryoya tıklayınca test ayrıntısı açılır; hata kalıbına tıklayınca yalnız o kalıptaki testler'),
        hizliSuzgec),
      bosSuzgec,
      sonuclar.length
        ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
          h('caption', { class: 'gorunmez' }, 'Senaryo sonuçları'),
          h('thead', {}, h('tr', {}, ...['Durum', 'Ürün', 'Senaryo', 'Süre', 'Hata kalıbı', 'Medya'].map((b, i) => h('th', { scope: 'col', class: i === 3 ? 'sayi' : null }, b)))),
          h('tbody', {}, ...tabloSatirlari)))
        : h('p', { class: 'bos-liste' }, 'Bu koşuda sonuç yok.')));
}

/**
 * "Başarısızları tekrar çalıştır": önce plan (başarısız testler, o koşudan bu yana değişen satırlar / model) gösterilir; kullanıcı model
 * sürümünü (o koşudaki / güncel) ve değişen satırlar için veriyi (güncel / o koşudaki — yalnız o koşudaki değerleri saklanabilen,
 * gizli sütunsuz tablolarda) seçer. Riskli ortamda ayrıca açık onay istenir; izinler sunucuda denetlenir. Yeni koşu "Tekrar:" bağı taşır.
 */
async function basarisizlariTekrarCalistir(kosu, ortam, proje) {
  try {
    const [{ plan }, { onayIste, canliOnayIste, kosuBaslat }] = await Promise.all([
      api(`/platform/sonuclar/tekrar-plani?kosuId=${encodeURIComponent(kosu.id)}&projeId=${encodeURIComponent(proje.id)}`), import('./kosu-paneli.js')
    ]);
    if (!ortam) { bildir('Koşunun ortamı bulunamadı; başarısızlar yalnız o ortamda tekrar çalıştırılabilir.', 'hata'); return; }
    if (!plan.senaryolar.length) { bildir(plan.atlananlar.length ? `Tekrar çalıştırılacak test yok: ${plan.atlananlar[0].baslik} — ${plan.atlananlar[0].neden}.` : 'Tekrar çalıştırılacak test yok.', 'hata'); return; }
    const modelDegisen = plan.senaryolar.filter((s) => s.modelDegisti);
    const satirDegisen = plan.senaryolar.flatMap((s) => s.satirDegisiklikleri);
    const kosudakiVeriOlur = satirDegisen.length > 0 && satirDegisen.every((x) => x.kosudakiVeri);
    let model = 'kosudaki';
    let veri = 'guncel';
    const radyo = (ad, secenekler, secili, degis) => h('div', { class: 'radyo-grubu', role: 'radiogroup' }, secenekler.map(([d, e]) => {
      const r = h('input', { type: 'radio', name: ad, value: d, checked: d === secili });
      r.addEventListener('change', () => degis(d));
      return h('label', {}, r, e);
    }));
    const ek = h('div', { class: 'tekrar-plani' },
      h('ul', { 'aria-label': 'Tekrar çalıştırılacak testler' }, plan.senaryolar.slice(0, 20).flatMap((s) => s.testler.map((t) => h('li', {}, t.baslik))).slice(0, 30)),
      modelDegisen.length ? h('div', { class: 'not-kutusu', role: 'note' },
        h('strong', {}, 'Ekran modeli o koşudan bu yana değişti. '),
        modelDegisen.map((s) => `${s.baslik}: v${s.modelSurumu} → v${s.guncelModelSurumu}`).join('; '),
        radyo(`tekrar-model-${kosu.id}`, [['kosudaki', 'O koşudaki model sürümüyle'], ['guncel', 'Güncel model sürümüyle']], model, (d) => { model = d; })) : null,
      satirDegisen.length ? h('div', { class: 'not-kutusu', role: 'note' },
        h('strong', {}, 'Tablo satırı o koşudan bu yana değişti: '),
        satirDegisen.map((x) => `${x.tablo} → ${x.satirAdi} (${x.durum === 'silindi' ? 'silindi' : 'verisi değişti'})`).join(', '), '. ',
        kosudakiVeriOlur
          ? radyo(`tekrar-veri-${kosu.id}`, [['guncel', 'Güncel veriyle'], ['kosudaki', 'O koşudaki veriyle']], veri, (d) => { veri = d; })
          : h('span', {}, 'O koşudaki değerler saklanmadığı için (gizli sütunlu tablo ya da silinmiş satır) güncel veriyle koşar.')) : null,
      plan.atlananlar.length ? h('p', { class: 'soluk kucuk' }, `${plan.atlananlar.length} test tekrar çalıştırılamaz: ${plan.atlananlar.map((x) => `${x.baslik} (${x.neden})`).slice(0, 5).join(', ')}.`) : null,
      plan.bagsiz ? h('p', { class: 'soluk kucuk' }, `${plan.bagsiz} sonuç bir senaryoya bağlı olmadığı için dahil edilmedi.`) : null);
    const tamam = await onayIste({
      baslik: 'Başarısızları tekrar çalıştır?', ikonAd: 'yenile', dugme: `${plan.sayi} testi çalıştır`, ek,
      metin: `Yalnız başarısız ${plan.sayi} test ${ortam.ad} ortamında, o koşudaki tablo satırlarıyla, sırayla ve kısmi (tekil) koşu olarak çalışır. Yeni koşu "Tekrar: önceki koşu" bağıyla kaydedilir.`
    });
    if (!tamam) return;
    if (!(await canliOnayIste(ortam, 'Tekrar koşusu'))) return;
    kosuBaslat({
      projeId: proje.id, ortam, senaryolar: plan.senaryolar.map((s) => ({ id: s.id, baslik: s.baslik })), tur: 'tekil', esZamanli: false,
      baslik: 'Başarısızlar (tekrar)', tekrar: { kaynakKosuId: kosu.id, model, veri }
    });
  } catch (e) {
    if (e && e.durum === 423) return;
    bildir(e.message, 'hata');
  }
}

/** Testin koştuğu tablo satırları (açık sütunlar; gizli sütun maskeli — değeri hiç saklanmaz). */
function tabloSatirlariKarti(vk) {
  if (!vk || !Array.isArray(vk.satirlar) || !vk.satirlar.length) return null;
  return h('section', { class: 'kart', 'aria-labelledby': 'tablo-satir-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'tablo-satir-basligi' }, ikon('veri'), 'Kullanılan tablo satırları'),
      h('span', { class: 'alt' }, [vk.ad ? `veri koşusu: ${vk.ad}` : null, vk.modelSurumu ? `model v${vk.modelSurumu}` : null].filter(Boolean).join(' · '))),
    h('ul', { class: 'tablo-satirlari' }, vk.satirlar.map((s) => h('li', {},
      h('strong', {}, `${s.tablo}${s.etiket ? ` [${s.etiket}]` : ''} → ${s.satirAdi}`),
      h('dl', {}, Object.entries(s.degerler).map(([a, d]) => [h('dt', {}, a), h('dd', {}, d === null || d === '' ? '—' : d)]),
        (s.gizliSutunlar || []).map((a) => [h('dt', {}, a), h('dd', { class: 'soluk' }, '••• (gizli)')]))))));
}

// ---------------------------------------------------------------------------------------
// Test (sonuç) detayı
// ---------------------------------------------------------------------------------------

async function sonucDetayi(icerik, id, proje) {
  const { sonuc: s2 } = await api(`/platform/sonuclar/sonuc?id=${encodeURIComponent(id)}`);
  // Saklama süresi dolup silinen görüntüler ve "görüntü alınamadı" notları medya notlarında gösterilir.
  const gorseller = s2.medya.filter((m) => m.tur === 'ekran_goruntusu' && !m.silinme);
  const videolar = s2.medya.filter((m) => m.tur === 'video');
  const izler = s2.medya.filter((m) => m.tur === 'iz' && !m.silinme);
  const tumDigerleri = s2.medya.filter((m) => m.tur === 'diger' && !m.silinme && !alinamadiMi(m));
  // Saklanan doğrulanan dosyalar ayrı: "Dosyayı indir" (gizli veri onayıyla).
  const dosyaEkleri = tumDigerleri.filter((m) => m.ad.startsWith(DOSYA_EKI_ONEKI) && !m.yedekDisi);
  const digerleri = tumDigerleri.filter((m) => !dosyaEkleri.includes(m));
  const dg = gorselDiyalogu(gorseller.filter((m) => !m.yedekDisi));
  const gv = goruntuleyici(s2, gorseller, (m) => dg.ac(m));

  const sol = [];
  const sag = [];
  // Ekran görüntüleri: büyük önizleme (son görüntü = hata anı) + küçük resimler; tıklayınca büyük görünüm.
  sol.push(h('section', { class: 'kart', 'aria-labelledby': 'gorsel-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'gorsel-basligi' }, ikon('ekran'), `Ekran görüntüleri (${gorseller.length})`),
      gv.gorsel ? h('div', { class: 'sag' }, indirBaglantisi(gv.gorsel, 'İndir'),
        h('button', { type: 'button', class: 'kucuk-dugme ikon-dugme', 'aria-label': 'Tam ekran', title: 'Tam ekran', onclick: () => dg.ac(gv.gorsel, true) }, ikon('genislet'))) : null),
    gv.kap,
    medyaNotlari(s2),
    gorseller.length
      ? h('ul', { class: 'gorsel-izgarasi' }, ...gorseller.map((m) => h('li', {},
        m.yedekDisi
          ? h('div', { class: 'gorsel-yok', title: 'Bu medya yedeğe dahil edilmemişti' }, ikon('arsiv'), 'Yedeğe dahil değil')
          : h('button', { type: 'button', class: `gorsel-dugmesi${m === gv.gorsel ? ' secili' : ''}`, onclick: () => dg.ac(m), 'aria-label': `${m.ad} — büyüt` },
            h('img', { src: medyaUrl(m.id), alt: '', loading: 'lazy' })),
        h('div', { class: 'gorsel-adi' }, h('span', {}, m.ad), m.yedekDisi ? null : indirBaglantisi(m, 'İndir', 'kucuk')))))
      : null,
    dg.diyalog));

  const videoAlani = h('div', { class: 'video-alani' });
  sol.push(h('section', { class: 'kart', 'aria-labelledby': 'video-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'video-basligi' }, ikon('video'), 'Video ve iz')),
    videolar.length ? videolar.map((v) => v.silinme
      ? h('p', { class: 'soluk' }, `Video saklama süresi dolduğu için ${tarihMetni(v.silinme)} tarihinde silindi.`)
      : v.yedekDisi ? yedekDisiNotu(v) : h('div', { class: 'dugmeler' },
        h('button', { type: 'button', class: 'birincil', onclick: (o) => {
          videoAlani.replaceChildren(h('video', { controls: true, autoplay: true, src: medyaUrl(v.id), class: 'sonuc-videosu' }));
          o.currentTarget.disabled = true;
        } }, '▶ Videoyu izle'),
        h('a', { class: 'dugme', href: medyaUrl(v.id, true), download: '' }, '⬇ Videoyu indir'))) : h('p', { class: 'soluk' }, 'Video yok.'),
    videoAlani,
    izler.filter((z) => z.yedekDisi).map(yedekDisiNotu),
    izler.some((z) => !z.yedekDisi) ? h('div', { class: 'dugmeler' }, ...izler.filter((z) => !z.yedekDisi).map((z) => h('a', { class: 'dugme kucuk-dugme', href: medyaUrl(z.id, true), download: '' }, '⬇ İzi (trace) indir')),
      h('span', { class: 'soluk kucuk' }, 'İz dosyası ', h('code', {}, 'npx playwright show-trace <dosya>'), ' ile açılır.')) : null,
    digerleri.filter((d) => d.yedekDisi).map(yedekDisiNotu),
    digerleri.some((d) => !d.yedekDisi) ? h('div', { class: 'dugmeler' }, ...digerleri.filter((d) => !d.yedekDisi).map((d) => h('a', { class: 'dugme kucuk-dugme', href: medyaUrl(d.id, true), download: '' }, `⬇ ${d.ad}`))) : null,
    dosyaEkleri.length ? dogrulananDosyalar(dosyaEkleri.map((m) => dogrulananDosyaIndir(m.ad.slice(DOSYA_EKI_ONEKI.length), async () => {
      const y = await fetch(medyaUrl(m.id, true), { cache: 'no-store' });
      if (!y.ok) throw new Error(`Dosya alınamadı (${y.status}).`);
      return y.blob();
    }))) : null));

  if (s2.hataMesaji) {
    sol.push(h('section', { class: 'kart', 'aria-labelledby': 'hata-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'hata-basligi' }, ikon('uyari'), 'Hata'),
        s2.hataKategorisi ? h('div', { class: 'sag' }, rozet(s2.hataKategorisi, 'hata')) : null),
      h('pre', { class: 'hata-mesaji' }, s2.hataMesaji)));
  }
  if (s2.beklenenGorulen || s2.beklenenSonuc) {
    sol.push(h('section', { class: 'kart', 'aria-labelledby': 'bg-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'bg-basligi' }, ikon('hedef'), 'Beklenen / görülen')),
      s2.beklenenSonuc ? h('dl', { class: 'beklenen-gorulen' }, h('dt', {}, 'Senaryonun beklenen sonucu'), h('dd', {}, s2.beklenenSonuc)) : null,
      s2.beklenenGorulen ? h('dl', { class: 'karsilastirma' },
        h('div', { class: 'beklenen' }, h('dt', {}, 'Beklenen'), h('dd', {}, h('code', {}, s2.beklenenGorulen.beklenen || '—'))),
        h('div', { class: 'gorulen' }, h('dt', {}, 'Görülen'), h('dd', {}, h('code', {}, s2.beklenenGorulen.gorulen || '—')))) : null));
  }
  // Çalışan kurtarma kuralları (Ayarlar > Proje ve ortamlar): kurtarılan test başarılı sayılır; not burada görünür kalır.
  if ((s2.kurtarma || []).length) {
    sol.push(h('section', { class: 'kart', 'aria-labelledby': 'kurtarma-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'kurtarma-basligi' }, ikon('yenile'), 'Kurtarma kuralı'), h('span', { class: 'alt mono' }, String(s2.kurtarma.length))),
      h('ul', { class: 'kurtarma-notlari' }, s2.kurtarma.map((k) => h('li', { class: `kurtarma-notu ${k.durum}` },
        h('b', {}, k.kural), k.adim ? h('span', { class: 'soluk' }, ` · ${k.adim}`) : null, h('div', {}, k.not))))));
  }
  const satirKarti = tabloSatirlariKarti(s2.veriKosusu);
  if (satirKarti) sag.push(satirKarti);
  sag.push(h('section', { class: 'kart', 'aria-labelledby': 'adim-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'adim-basligi' }, ikon('liste'), 'Adımlar'), h('span', { class: 'alt mono' }, adimOzeti(s2.adimlar))),
    adimCizelgesi(s2.adimlar)));
  sag.push(h('section', { class: 'kart', 'aria-labelledby': 'atlanan-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'atlanan-basligi' }, ikon('eksi'), 'Atlanan / doldurulamayan alanlar'), h('span', { class: 'alt mono' }, String(s2.atlananAlanlar.length))),
    alanCipleri(s2.atlananAlanlar)));
  sag.push(h('section', { class: 'kart', 'aria-labelledby': 'yakalanan-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'yakalanan-basligi' }, ikon('uyari'), 'Koşuda yakalanan mesajlar'),
      h('span', { class: 'alt mono' }, String((s2.yakalananMesajlar || []).length))),
    yakalananMesajListesi(s2.yakalananMesajlar)));

  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(s2.kosuId)}` }, 'Koşu'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Test')),
        h('h2', { tabindex: '-1' }, s2.senaryoBaslik),
        h('div', { class: 'meta' },
          h('span', {}, durumRozeti(s2.durum)), h('span', {}, rozet(s2.urun, 'vurgu', { title: s2.urun })), ekranDurumRozeti(s2.ekranDurumu) ? h('span', {}, ekranDurumRozeti(s2.ekranDurumu)) : null,
          h('span', {}, ikon('saat'), h('span', { class: 'mono' }, sureMetni(s2.sureMs))),
          s2.deneme ? h('span', {}, rozet(`${s2.deneme}. yeniden deneme`, 'atlanan')) : null,
          h('span', {}, ikon('takvim'), h('span', { class: 'mono' }, `${kisaTarih(s2.baslangic)} → ${saatMetni(s2.bitis)}`)),
          null)),
      h('div', { class: 'eylemler' },
        // Entegrasyonlar: yalnız kullanıcı basınca, önizleme + onayla iş takip sisteminde hata kaydı (entegrasyonlar.js).
        s2.durum !== 'basarili' ? hataKaydiDugmesi(s2, proje) : null,
        h('a', { class: 'dugme hayalet', href: `#/sonuclar/kosu/${encodeURIComponent(s2.kosuId)}` }, ikon('geri'), 'Koşuya dön'))),
    h('div', { class: 'detay-izgarasi' }, h('div', {}, sol), h('div', {}, sag)));
}
