// "Ekranlar" bölümü (genel; ekran = projenin test edilen bir sayfası/ürünü).
//   Liste: ekran kartları (model sürümü, adım/alan/senaryo sayıları, bekleyen analiz) + "Sayfa ekle".
//   Ayrıntı: güncel model (adım › bölüm › alan; seçenekler, görünürlük, bağlam profiline göre görünürlük),
//   Model geçmişi (sürümler ve sürümler arası fark), Kanıtlar (şifreli ekran görüntüleri), eylemler:
//   "Paket yükle", "Ekranı tara" (otomatik tarama — tarama.js), "Akışı kaydet" (kullanıcı akışı tarayıcıda yürütür; tarama.js),
//   "Tekrar analiz et" (bağlam profili seçimi), "Claude ile yorumla".
//   Kartta ve ayrıntı başlığında ⋯ menüsü (ekran-yonetimi.js): yeniden adlandır, düzenle (URL yolu), yukarı/aşağı taşı,
//   devre dışı bırak / etkinleştir, kalıcı sil. Devre dışı ekranlar sol listede varsayılan olarak gizlidir ("Devre dışı
//   ekranları göster"); silinmiş ekranlar (mezar taşı) "Tüm ekranlar"ın altında listelenir (geri yükle / temizle).
// Adresler: #/ekranlar · #/ekranlar/yeni[/tara] · #/ekranlar/e/<id>[/gecmis[/<sürüm>] | /kanitlar | /yukle | /bulgular] ·
//   #/ekranlar/tarama/<iş kimliği> (otomatik taramanın ilerlemesi → önizleme/kabul)
// Ekran keşfinin ana yolu: kullanıcı sayfa bağlantısını Claude Code'a verir, Claude sayfayı düğme kurallarına göre (paket-istekleri.mjs > INCELEME_KURALLARI)
// inceleyip bir "sayfa paketi" (docs/sayfa-paketi.md) üretir; paket burada yüklenir. Claude API kullanılmaz.
import { TOKEN, api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import {
  BULGU_TURLERI, bulguRozeti, claudeDosyasiOlustur, farkGosterimi, goreliZaman, gorselDiyalogu, kopyalaDugmesi, modelAgaciCiz, tekrarAnalizDiyalogu
} from './ekran-ortak.js';
import { sayfaPaketiAkisi } from './sayfa-paketi.js';
import { akisDiyagrami } from './akis-diyagrami.mjs';
import { akisModeli } from './model-formu.mjs';
import { onayIste } from './kosu-paneli.js';
import { akisDiyagramiCiz } from './senaryo-diyagrami.js';
import { bulgularEkrani } from './bulgular.js';
import { ekranBaglariSekmesi } from './ekran-baglari.js';
import { ekranlarGrubu, navGrubu, servisleriAl, servislerBolumu, urunlerBasligi } from './urunler.js';
import { devreDisiAnahtari, devreDisiGoster, devreDisiRozeti, durumDegistir, ekranMenusu, formDiyalogu, geriYukle, silDiyalogu, yenile } from './ekran-yonetimi.js';
import { girisAkislariniAl, girisBaglantisi, girisKarti } from './giris-akisi.js';
import { paketIstekCumlesi } from './paket-istekleri.mjs';

/** Otomatik tarama modülü isteğe bağlı yüklenir (yüklenemezse yalnızca tarama çalışmaz). */
let taramaSozu = null;
let akisTasarimiSozu = null;
const akisTasarimiModulu = () => (akisTasarimiSozu ??= import('./akis-tasarimi.js').catch((e) => { akisTasarimiSozu = null; throw e; }));
const taramaModulu = () => (taramaSozu ??= import('./tarama.js').catch((e) => { taramaSozu = null; throw e; }));
/** "Ekranı otomatik tara" diyaloğu (ekran: mevcut ekran; null = yeni ekran). */
function taramaBaslat(proje, ekran) {
  taramaModulu().then((m) => m.taramaDiyalogu({ proje, ekran })).catch((e) => bildir(`Tarama ekranı yüklenemedi (${e.message}). Sunucuyu yeniden başlatın.`, 'hata'));
}
/** "Akışı kaydet" diyaloğu (ekran: mevcut ekran; null = yeni ekran). */
function kayitBaslat(proje, ekran) {
  taramaModulu().then((m) => m.kayitDiyalogu({ proje, ekran })).catch((e) => bildir(`Kayıt ekranı yüklenemedi (${e.message}). Sunucuyu yeniden başlatın.`, 'hata'));
}
const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
// Claude'un inceleme kuralları ve istek cümlesi: TEK kaynak paket-istekleri.mjs (sayfa-paketi.js ve sunucu da aynısını kullanır).
export const CLAUDE_ISTEK_CUMLESI = (adres) => paketIstekCumlesi(adres);

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/ekranlar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function ekranlarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik, alt, altKimlik] = parcalar.map((p) => decodeURIComponent(p || ''));
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ekranlar' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Ekranlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Sayfa paketi'), h('br', {}),
          'Yeni sayfaları Claude Code inceler (yalnızca okuma) ve bir paket üretir; paketi "Sayfa ekle" ile yükleyin — ya da Nöbetçi ekranı kendisi tarasın ("Ekranı tara"). Aynı ekran için yeni paket = tekrar analiz.')),
      icerik));
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };

  (async () => {
    // Girişler (ortam başına giriş tarifi) "Ortak akışlar"da görünür; düzenleme Ayarlar > Giriş profilleri'nde.
    const [liste, servisler, girisler] = await Promise.all([api(`/platform/ekranlar?projeId=${encodeURIComponent(proje.id)}`), servisleriAl(proje), girisAkislariniAl(proje)]);
    const secim = tur === 'e' ? kimlik : tur === 'yeni' ? '__yeni' : '';
    const yanCiz = () => yanListe(nav, liste.ekranlar, secim, yanCiz, servisler, girisler);
    yanCiz();
    if (tur === 'yeni') {
      sayfaPaketiAkisi(icerik, { mod: 'yeni', proje, tara: () => taramaBaslat(proje, null), kaydet: () => kayitBaslat(proje, null), bitti: (id) => { location.hash = `#/ekranlar/e/${encodeURIComponent(id)}`; } });
      // #/ekranlar/yeni/tara (yeni proje sihirbazının "Ekranı otomatik tara" adımı): tarama diyaloğu hemen açılır.
      if (kimlik === 'tara') { history.replaceState(null, '', '#/ekranlar/yeni'); taramaBaslat(proje, null); }
      return;
    }
    if (tur === 'tarama' && kimlik) {
      const m = await taramaModulu();
      m.taramaEkrani(icerik, {
        proje, isId: kimlik,
        bitti: (id, analiz) => { location.hash = analiz ? `#/ekranlar/e/${encodeURIComponent(id)}/bulgular` : `#/ekranlar/e/${encodeURIComponent(id)}`; }
      });
      return;
    }
    if (tur === 'e' && kimlik) {
      const ekran = liste.ekranlar.find((e) => e.id === kimlik);
      if (!ekran) { yerlestir(icerik, bosDurum('Ekran bulunamadı.', 'Silinmiş ya da başka bir projeye ait olabilir.', { ikon: 'ekran' })); return; }
      if (alt === 'yukle') {
        sayfaPaketiAkisi(icerik, {
          mod: ekran.modelSurumu ? 'analiz' : 'yeni', proje, ekran, tara: () => taramaBaslat(proje, ekran), kaydet: () => kayitBaslat(proje, ekran),
          bitti: (id, analiz) => { location.hash = analiz ? `#/ekranlar/e/${encodeURIComponent(id)}/bulgular` : `#/ekranlar/e/${encodeURIComponent(id)}`; }
        });
        return;
      }
      if (alt === 'bulgular') { bulgularEkrani(icerik, { proje, ekranId: kimlik }); return; }
      await ekranAyrintisi(icerik, { proje, ekranId: kimlik, sekme: alt || 'model', surum: alt === 'gecmis' && altKimlik ? Number(altKimlik) : null, akisSecimi: alt === 'akis' ? altKimlik || null : null, listeKaydi: ekran, idler: gorunenSira(liste).idler });
      return;
    }
    listeGorunumu(icerik, proje, liste, girisler);
  })().catch(hata);
}

/** Ekran listesinde (ürün/ekran kartları) gösterilmeyen model türleri: yan listede kendi gruplarında. */
const EKRAN_DISI_TURLER = ['altModel', 'ortakAkis'];

function yanListe(nav, tumu, secili, yeniden, servisler = [], girisler = []) {
  // Devre dışı ekranlar varsayılan olarak gizli (seçili olan hariç); "Devre dışı ekranları göster" ile görünür.
  const devreDisiSayisi = tumu.filter((e) => e.durum === 'devre_disi').length;
  const ekranlar = devreDisiGoster() ? tumu : tumu.filter((e) => e.durum !== 'devre_disi' || e.id === secili);
  const ekranModelli = ekranlar.filter((e) => !EKRAN_DISI_TURLER.includes(e.modelTuru));
  const altModeller = ekranlar.filter((e) => e.modelTuru === 'altModel');
  const ortakAkislar = ekranlar.filter((e) => e.modelTuru === 'ortakAkis');
  const baglanti = (e) => h('a', { href: `#/ekranlar/e/${encodeURIComponent(e.id)}`, 'aria-current': secili === e.id ? 'page' : null, class: e.durum === 'devre_disi' ? 'devre-disi' : null,
    title: e.durum === 'devre_disi' ? `${e.ad} — devre dışı` : null },
    e.modelSurumu ? ikon(e.modelTuru === 'altModel' ? 'arsiv' : e.modelTuru === 'ortakAkis' ? 'pusula' : 'katman') : h('span', { class: 'saglik', 'aria-hidden': 'true' }),
    h('span', { class: 'nav-metni' }, e.ad),
    e.durum === 'devre_disi' ? h('span', { class: 'nav-etiketi' }, 'kapalı') : null,
    e.bekleyenAnaliz ? h('span', { class: 'adet bekleyen', title: `${e.bekleyenAnaliz.bulguSayisi} bulgu karar bekliyor` }, String(e.bekleyenAnaliz.bulguSayisi))
      : e.modelSurumu ? h('span', { class: 'adet', title: `model sürümü ${e.modelSurumu}` }, `v${e.modelSurumu}`) : null);
  yerlestir(nav,
    h('a', { href: '#/ekranlar', 'aria-current': secili === '' ? 'page' : null }, ikon('izgara'), 'Tüm ekranlar', h('span', { class: 'adet' }, String(tumu.filter((e) => !EKRAN_DISI_TURLER.includes(e.modelTuru)).length))),
    h('a', { href: '#/ekranlar/yeni', 'aria-current': secili === '__yeni' ? 'page' : null }, ikon('artiYalin'), 'Sayfa ekle'),
    ...urunlerBasligi(),
    ekranlarGrubu(ekranModelli.map(baglanti)),
    navGrubu({ anahtar: 'ortak-akislar', baslik: 'Ortak akışlar', ogeler: [...girisler.map(girisBaglantisi), ...ortakAkislar.map(baglanti)], bosMetin: 'Henüz ortak akış yok.', ekle: { etiket: 'Ortak akış ekle (sayfa paketiyle)', href: '#/ekranlar/yeni' } }),
    altModeller.length ? navGrubu({ anahtar: 'alt-modeller', baslik: 'Alt modeller', ogeler: altModeller.map(baglanti), ekle: { etiket: 'Alt model ekle (sayfa paketiyle)', href: '#/ekranlar/yeni' } }) : null,
    devreDisiAnahtari(devreDisiSayisi, () => yeniden()),
    ...servislerBolumu(servisler));
}

// ---------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------

/**
 * Kartların sırası: elle sıra verilmişse sunucunun sırası (sira, ad); verilmemişse karar bekleyenler ve modelliler önce.
 * Yukarı/Aşağı taşı bu GÖRÜNEN sırayı esas alır (alt modeller sona eklenir) — ilk taşımada görünen sıra kalıcı olur.
 */
function gorunenSira(liste) {
  const ekranlar = liste.ekranlar.filter((e) => !EKRAN_DISI_TURLER.includes(e.modelTuru));
  const elleSirali = liste.ekranlar.some((e) => e.sira !== null && e.sira !== undefined);
  const sirali = elleSirali ? ekranlar : ekranlar.slice().sort((x, y) => Number(Boolean(y.bekleyenAnaliz)) - Number(Boolean(x.bekleyenAnaliz)) || Number(Boolean(y.modelSurumu)) - Number(Boolean(x.modelSurumu)));
  return { sirali, idler: [...sirali.map((e) => e.id), ...liste.ekranlar.filter((e) => EKRAN_DISI_TURLER.includes(e.modelTuru)).map((e) => e.id)] };
}

function listeGorunumu(icerik, proje, liste, girisler = []) {
  const ekranlar = liste.ekranlar.filter((e) => !EKRAN_DISI_TURLER.includes(e.modelTuru));
  const { sirali, idler } = gorunenSira(liste);
  const devreDisi = ekranlar.filter((e) => e.durum === 'devre_disi').length;
  const modelli = ekranlar.filter((e) => e.modelSurumu).length;
  const bekleyen = ekranlar.filter((e) => e.bekleyenAnaliz);
  const cumle = CLAUDE_ISTEK_CUMLESI('');
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Ekranlar')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Ekranlar'), rozet(`${ekranlar.length} ekran`, 'vurgu')),
        h('div', { class: 'meta' },
          h('span', {}, ikon('katman'), `${modelli} ekranın modeli var`),
          h('span', {}, ikon('uyari'), bekleyen.length ? `${bekleyen.length} ekranda karar bekleyen bulgu` : 'bekleyen bulgu yok'),
          h('span', {}, ikon('liste'), `${ekranlar.reduce((t, e) => t + e.senaryoSayisi, 0)} senaryo`),
          devreDisi ? h('span', {}, ikon('eksi'), `${devreDisi} devre dışı`) : null)),
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni' }, ikon('artiYalin'), 'Sayfa ekle'))),
    h('section', { class: 'kesif-seridi', 'aria-label': 'Yeni sayfa nasıl eklenir' },
      h('ol', { class: 'kesif-adimlari' },
        h('li', {}, h('b', {}, 'Bağlantıyı Claude Code\'a verin'), h('span', {}, 'Seçimler değiştirilir, ekran açan ve hesaplayan düğmelere basılır; kayıt oluşturan düğmeden önce size sorulur.')),
        h('li', {}, h('b', {}, 'Sayfa paketi üretilir'), h('span', {}, 'Model, senaryo önerileri, gereken ayarlar, bilinmeyenler — gizli değer yok.')),
        h('li', {}, h('b', {}, 'Paketi yükleyin'), h('span', {}, 'Önizleyin, seçin, kabul edin. Aynı ekran için yeni paket = tekrar analiz.'))),
      h('div', { class: 'kesif-cumlesi' }, h('code', {}, cumle), kopyalaDugmesi(cumle, 'Cümleyi kopyala'))),
    ekranlar.length
      ? h('div', { class: 'ekran-izgarasi' }, sirali.map((e) => ekranKarti(e, { proje, idler })))
      : bosDurum('Henüz ekran yok.', 'İlk sayfanızı "Sayfa ekle" ile ekleyin.', { ikon: 'ekran', eylem: h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni' }, ikon('artiYalin'), 'Sayfa ekle') }),
    ortakAkisBolumu(liste.ekranlar.filter((e) => e.modelTuru === 'ortakAkis'), girisler),
    silinmisEkranlar(proje, liste.silinmisEkranlar || []));
}

/**
 * Ortak akışlar (ör. ödeme): ekran kartlarından ayrı; ekranların akışına "+ > Ortak akış" ile eklenir. Her ortamın GİRİŞİ
 * de burada "Giriş (<ortam>)" kartıdır (adımlar okunur dille; Düzenle → Ayarlar > Giriş profilleri > Giriş tarifi).
 */
function ortakAkisBolumu(liste, girisler = []) {
  if (!liste.length && !girisler.length) return null;
  return h('section', { class: 'ortak-akis-bolumu', 'aria-labelledby': 'ortak-akislar-baslik' },
    h('div', { class: 'bolum-basligi' }, h('h3', { id: 'ortak-akislar-baslik' }, ikon('pusula'), 'Ortak akışlar', rozet(String(liste.length + girisler.length), 'vurgu')),
      h('span', { class: 'kucuk cok-soluk' }, 'Ekranların akışına “+ > Ortak akış” ile eklenir; hep son sürümüyle koşar. Giriş her koşuda ortamın giriş tarifiyle yapılır.')),
    h('div', { class: 'ekran-izgarasi' }, ...girisler.map(girisKarti), ...liste.map((e) => h('a', { class: 'kart ortak-akis-karti', href: `#/ekranlar/e/${encodeURIComponent(e.id)}` },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), e.ad), e.modelSurumu ? rozet(`model v${e.modelSurumu}`, 'vurgu') : null),
      h('code', { class: 'duz kucuk' }, e.anahtar),
      h('p', { class: 'kucuk soluk' }, `${e.adimSayisi ?? 0} adım · ${e.alanSayisi ?? 0} alan`)))));
}

/** Silinmiş ekranlar (mezar taşı): geçmiş sonuçları ve/veya kodu hâlâ duran testleri için tutulur. */
function silinmisEkranlar(proje, liste) {
  if (!liste.length) return null;
  return h('details', { class: 'kart silinmis-ekranlar' },
    h('summary', {}, ikon('arsiv'), h('b', {}, 'Silinmiş ekranlar'), rozet(String(liste.length), ''),
      h('span', { class: 'kucuk cok-soluk' }, 'geçmiş sonuçları için tutulur')),
    h('ul', { class: 'silinmis-listesi' }, liste.map((e) => h('li', {},
      h('div', { class: 'silinmis-ad' }, h('b', {}, e.ad), h('code', {}, e.anahtar), rozet('silinmiş ekran', 'hata')),
      h('div', { class: 'kucuk soluk' }, [
        `silinme ${tarihMetni(e.silinme)}`,
        e.sonucSayisi ? `${e.sonucSayisi} geçmiş sonuç korunuyor` : null
      ].filter(Boolean).join(' · ')),
      h('div', { class: 'dugmeler' },
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => geriYukle({ proje, ekran: e }) }, ikon('yenile'), 'Geri yükle'),
        h('button', { type: 'button', class: 'kucuk-dugme tehlike', onclick: () => silDiyalogu({ proje, ekran: e }) }, ikon('cop'), 'Temizle…'))))));
}

function ekranKarti(e, s) {
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const sayi = (deger, etiket) => h('div', { class: 'ekran-sayisi' }, h('b', {}, String(deger)), h('span', {}, etiket));
  const devreDisi = e.durum === 'devre_disi';
  return h('article', { class: `ekran-karti ${e.modelSurumu ? '' : 'modelsiz'} ${e.bekleyenAnaliz ? 'bekleyen' : ''} ${devreDisi ? 'devre-disi' : ''}`.replace(/\s+/g, ' ').trim(), 'data-ekran': e.id },
    h('div', { class: 'ekran-karti-ust' },
      h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(e.modelSurumu ? 'katman' : 'ekran')),
      h('div', { class: 'ekran-karti-ad' }, h('h3', {}, h('a', { href: adres }, e.ad)), h('code', {}, e.anahtar),
        devreDisi ? h('div', { class: 'ekran-karti-durum' }, devreDisiRozeti()) : null),
      h('div', { class: 'ekran-karti-rozetler' },
        e.modelSurumu ? rozet(`model v${e.modelSurumu}`, 'vurgu') : rozet('model yok', ''),
        ekranMenusu({ proje: s.proje, ekran: e, idler: s.idler }))),
    e.modelSurumu
      ? h('div', { class: 'ekran-sayilari' }, sayi(e.adimSayisi, 'adım'), sayi(e.alanSayisi, 'alan'), sayi(e.senaryoSayisi, 'senaryo'))
      : h('p', { class: 'kucuk soluk' }, `${e.senaryoSayisi} senaryo · modeli yok — sayfa paketi yükleyerek model oluşturun.`),
    e.bekleyenAnaliz
      ? h('a', { class: 'bekleyen-bant', href: `${adres}/bulgular` }, ikon('uyari'), h('span', {}, h('b', {}, String(e.bekleyenAnaliz.bulguSayisi)), ' bulgu karar bekliyor'), ikon('ok'))
      : null,
    h('div', { class: 'ekran-karti-alt' },
      e.urlYolu ? h('span', { class: 'mono cok-soluk' }, e.urlYolu) : null,
      e.modelTarihi ? h('span', { class: 'cok-soluk zaman', title: tarihMetni(e.modelTarihi) }, goreliZaman(e.modelTarihi)) : null,
      h('a', { class: 'dugme kucuk-dugme', href: `${adres}/yukle` }, ikon('yukle'), e.modelSurumu ? 'Paket yükle' : 'Model ekle')));
}

// ---------------------------------------------------------------------------------------
// Ayrıntı
// ---------------------------------------------------------------------------------------

async function ekranAyrintisi(icerik, s) {
  const d = await api(`/platform/ekran?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(s.ekranId)}`);
  const e = d.ekran;
  const devreDisi = e.durum === 'devre_disi';
  const menu = ekranMenusu({
    proje: s.proje, idler: s.idler,
    ekran: { ...e, modelTuru: s.listeKaydi?.modelTuru ?? d.modelTuru, modelSurumu: d.surum, urlYolu: s.listeKaydi?.urlYolu ?? null },
    sonra: () => { location.hash = '#/ekranlar'; yenile(); }
  });
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const paketYukle = () => { location.hash = `${adres}/yukle`; };
  const yorumla = h('button', { type: 'button', class: 'hayalet', title: 'Model, bulgular ve senaryo özetlerini Claude Code için dosyaya yazar' }, ikon('simsek'), 'Claude ile yorumla');
  yorumla.addEventListener('click', () => claudeDosyasiOlustur({ proje: s.proje, ekranId: e.id, tur: 'yorumla' }, yorumla));
  const tekrar = h('button', { type: 'button' }, ikon('yenile'), 'Tekrar analiz et');
  const tara = h('button', { type: 'button', title: 'Nöbetçi sayfayı seçilen ortamda yalnızca okuyarak tarar ve bir sayfa paketi üretir' }, ikon('ara'), 'Ekranı tara');
  tara.addEventListener('click', () => taramaBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }));
  const kaydet = h('button', { type: 'button', title: 'Akışı tarayıcıda siz yürütürsünüz; Nöbetçi adımları ve alanların yapısını kaydeder (değerleri kaydetmez)' }, ikon('video'), 'Akışı kaydet');
  kaydet.addEventListener('click', () => kayitBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }));
  tekrar.addEventListener('click', () => tekrarAnalizDiyalogu({ proje: s.proje, ekran: e, baglamProfilleri: d.baglamProfilleri, sonSecim: d.analiz.sonBaglamProfilleri, paketYukle }));
  const agac = d.agac || (d.altModel ? d.altModel.agac : null);
  const sekmeler = [
    ['model', 'Model', null], ['gecmis', 'Model geçmişi', d.gecmis.length], ['kanitlar', 'Kanıtlar', d.analiz.kanitlar.length],
    ...(d.model ? [['akis', 'Akışlar', Array.isArray(d.model.akislar) && d.model.akislar.length ? d.model.akislar.length : 1]] : []),
    ...(d.model && !EKRAN_DISI_TURLER.includes(d.modelTuru) ? [['veri', 'Test verisi', null]] : [])
  ];
  const sekmeAlani = h('div', {});
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, e.ad)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, e.ad),
          d.surum ? rozet(`model v${d.surum}`, 'vurgu') : rozet('model yok'), d.modelTuru === 'altModel' ? rozet('alt model', 'durdu') : d.modelTuru === 'ortakAkis' ? rozet('ortak akış', 'durdu') : null,
          devreDisi ? devreDisiRozeti() : null),
        h('div', { class: 'meta' },
          h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, e.anahtar)),
          agac && agac.ekranUrl ? h('span', {}, ikon('ag'), h('code', { class: 'duz' }, agac.ekranUrl)) : null,
          h('span', {}, ikon('liste'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(e.id)}` }, `${d.senaryoSayisi} senaryo`)),
          d.gecmis[0] ? h('span', { title: tarihMetni(d.gecmis[0].olusturulma) }, ikon('saat'), `son sürüm ${goreliZaman(d.gecmis[0].olusturulma)}`) : null)),
      h('div', { class: 'eylemler' }, d.surum && !EKRAN_DISI_TURLER.includes(d.modelTuru) ? yorumla : null, d.surum && !EKRAN_DISI_TURLER.includes(d.modelTuru) ? tekrar : null,
        !EKRAN_DISI_TURLER.includes(d.modelTuru) ? tara : null, !EKRAN_DISI_TURLER.includes(d.modelTuru) ? kaydet : null,
        !EKRAN_DISI_TURLER.includes(d.modelTuru) ? h('a', { class: 'dugme birincil', href: `${adres}/yukle` }, ikon('yukle'), d.surum ? 'Paket yükle' : 'Model ekle') : null,
        menu)),
    devreDisi ? h('div', { class: 'not-kutusu uyari devre-disi-seridi', role: 'status' },
      h('span', {}, h('b', {}, 'Bu ekran devre dışı. '), 'Senaryoları Koşuyu başlat ile toplu koşuya girmez (tek başına ▷ ile çalıştırılabilir); geçmiş sonuçlar görünür kalır.'),
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => durumDegistir({ proje: s.proje, ekran: e }) }, ikon('oynat'), 'Etkinleştir')) : null,
    d.analiz.bekleyen ? h('a', { class: 'bekleyen-bant genis', href: `${adres}/bulgular` }, ikon('uyari'),
      h('span', {}, h('b', {}, `${d.analiz.bekleyen.bulguSayisi} bulgu`), ` karar bekliyor · paket ${goreliZaman(d.analiz.bekleyen.zaman)} yüklendi`),
      h('span', { class: 'sag' }, 'Bulgulara git', ikon('ok'))) : null,
    !d.analiz.bekleyen && d.analiz.son ? h('div', { class: 'bilgi-seridi' }, ikon('onay'),
      h('span', {}, `Son analiz ${goreliZaman(d.analiz.son.zaman)} uygulandı${d.analiz.son.sonucSurum ? ` → model v${d.analiz.son.sonucSurum}` : ' (model değişmedi)'}.`),
      h('a', { href: `${adres}/bulgular` }, 'Bulgular ve etki paneli')) : null,
    h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Ekran bölümleri' },
      sekmeler.map(([ad, etiket, sayi]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': s.sekme === ad ? 'true' : 'false',
        onclick: () => { location.hash = ad === 'model' ? adres : `${adres}/${ad}`; }
      }, etiket, sayi !== null ? h('span', { class: 'sekme-sayisi' }, String(sayi)) : null))),
    sekmeAlani);

  if (s.sekme === 'gecmis') { await gecmisSekmesi(sekmeAlani, s, d); return; }
  if (s.sekme === 'kanitlar') { kanitSekmesi(sekmeAlani, d); return; }
  if (s.sekme === 'akis' && d.model) { await akisSekmesi(sekmeAlani, s, d, icerik); return; }
  if (s.sekme === 'veri' && d.model) { await ekranBaglariSekmesi(sekmeAlani, s, e); return; }
  if (!agac) {
    yerlestir(sekmeAlani, bosDurum('Bu ekranın modeli yok.', 'Claude Code ile üretilen bir sayfa paketini yükleyerek ya da ekranı otomatik tarayarak model oluşturun. Mevcut senaryolar korunur.', {
      ikon: 'katman', eylem: h('div', { class: 'dugmeler' },
        h('a', { class: 'dugme birincil', href: `${adres}/yukle` }, ikon('yukle'), 'Sayfa paketi yükle'),
        h('button', { type: 'button', onclick: () => taramaBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }) }, ikon('ara'), 'Ekranı tara'),
        h('button', { type: 'button', onclick: () => kayitBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }) }, ikon('video'), 'Akışı kaydet'))
    }));
    return;
  }
  yerlestir(sekmeAlani, h('div', { class: 'form-duzeni' },
    h('div', { class: 'form-sutunu' }, modelAgaciCiz(agac)),
    h('aside', { class: 'ozet-sutunu', 'aria-label': 'Model özeti' }, modelOzetKarti(agac, d))));
}

/**
 * "Akışlar" sekmesi (Model geçmişi düzeninde): solda ekranın akışları (varsayılan önce; adım ve senaryo sayısı), "Yeni akış
 * oluştur" (ad + boş / bir akıştan kopya); sağda seçilen akışın diyagramı ve işlemleri (Düzenle, Kopyala, Varsayılan yap, Sil).
 * Düzenleme / yeni akış aynı sayfada diyagram düzenleyicisini açar (akis-tasarimi.js, kaynak 'ekran'); kaydedince yeni sürüm.
 * Ortak akışta: tek akış (yeni / kopya / varsayılan / sil yok); onu kullanan ekranlar ve "Ekranlara ekle…".
 */
async function akisSekmesi(kap, s, d, icerik) {
  const e = d.ekran;
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}/akis`;
  const liste = await api(`/platform/ekran/akislar?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(e.id)}`);
  const secili = liste.akislar.find((a) => a.id === s.akisSecimi) || liste.akislar[0];
  const yeniden = () => ekranAyrintisi(icerik, s);
  const git = (akisId) => {
    const hedef = `${adres}/${encodeURIComponent(akisId)}`;
    if (location.hash === hedef) yeniden(); else location.hash = hedef;
  };
  const tasarimiAc = (secenek) => akisTasarimiModulu().then((m) => m.akisTasarimi(icerik, {
    kaynak: 'ekran', proje: s.proje, ekranId: e.id, ust: null, ...secenek,
    bitti: (akisId) => git(akisId), vazgec: () => yeniden()
  })).catch((hataNesnesi) => { if (hataNesnesi.durum !== 423) bildir(hataNesnesi.message, 'hata'); });

  // Yeni akış formu (sol kartta açılır).
  const yeniForm = h('form', { class: 'yeni-akis-formu', hidden: true, 'aria-label': 'Yeni akış' });
  const cokluAkis = liste.duzenlenebilir && !liste.ortakAkis;
  if (cokluAkis) {
    const ad = h('input', { type: 'text', maxlength: '80', placeholder: 'ör. Tüzel teklif', 'aria-label': 'Yeni akışın adı', required: true });
    const bos = h('input', { type: 'radio', name: 'yeni-akis-baslangic', value: '', checked: true });
    const kopyala = h('input', { type: 'radio', name: 'yeni-akis-baslangic', value: 'kopya' });
    const kaynak = h('select', { 'aria-label': 'Kopyalanacak akış' }, liste.akislar.map((a) => h('option', { value: a.id, selected: a.id === secili.id }, a.ad)));
    const hataEl = h('p', { class: 'tasarim-hatalari', role: 'alert' });
    yerlestir(yeniForm,
      h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Akışın adı'), ad),
      h('div', { class: 'radyo-grubu', role: 'radiogroup', 'aria-label': 'Nasıl başlasın?' },
        h('label', {}, bos, 'Boş başla'), h('label', {}, kopyala, 'Şu akıştan kopyala')),
      kaynak, hataEl,
      h('div', { class: 'dugmeler' },
        h('button', { type: 'submit', class: 'kucuk-dugme birincil' }, 'Oluştur'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { yeniForm.hidden = true; } }, 'Vazgeç')));
    yeniForm.addEventListener('submit', (o) => {
      o.preventDefault();
      if (!ad.value.trim()) { hataEl.textContent = 'Akışın adını yazın.'; ad.focus(); return; }
      tasarimiAc({ ad: ad.value.trim(), kopya: kopyala.checked ? kaynak.value : null });
    });
  }

  const islem = async (dugme, metin, fn, basari) => {
    try { await mesgulIken(dugme, metin, fn); bildir(basari); yeniden(); } catch (hataNesnesi) { if (hataNesnesi.durum !== 423) bildir(hataNesnesi.message, 'hata'); }
  };
  const varsayilanYap = h('button', { type: 'button' }, ikon('yildiz'), 'Varsayılan yap');
  varsayilanYap.addEventListener('click', async () => {
    if (!(await onayIste({ baslik: `“${secili.ad}” varsayılan akış olsun mu?`, metin: 'Yeni senaryolarda önce bu akış gelir. Akışı belirtilmemiş mevcut senaryolar eski varsayılan akışta kalır. Yeni model sürümü açılır.', dugme: 'Varsayılan yap', tehlikeli: false, ikonAd: 'uyari' }))) return;
    islem(varsayilanYap, 'Değiştiriliyor…', () => api('/platform/ekran/akis/varsayilan', { govde: { projeId: s.proje.id, ekranId: e.id, akisId: secili.id } }), 'Varsayılan akış değişti.');
  });
  const sil = h('button', { type: 'button', class: 'tehlike' }, ikon('cop'), 'Sil');
  sil.addEventListener('click', async () => {
    if (!(await onayIste({ baslik: `“${secili.ad}” akışı silinsin mi?`, metin: 'Akış modelden çıkarılır (yeni model sürümü; eski sürüm Model geçmişinde kalır).', dugme: 'Sil', tehlikeli: true, ikonAd: 'uyari' }))) return;
    try {
      await mesgulIken(sil, 'Siliniyor…', () => api('/platform/ekran/akis/sil', { govde: { projeId: s.proje.id, ekranId: e.id, akisId: secili.id } }));
      bildir('Akış silindi.');
      location.hash = adres;
    } catch (hataNesnesi) { if (hataNesnesi.durum !== 423) bildir(hataNesnesi.message, 'hata'); }
  });

  const diyagram = h('section', { class: 'kart akis-diyagrami', 'aria-label': 'Ekranın akışı' });
  try {
    akisDiyagramiCiz(diyagram, akisDiyagrami(akisModeli(d.model, secili.id)), {
      durum: 'ekran', ortamAdi: '', projeId: s.proje.id,
      not: 'İsteğe bağlı adımlar senaryoda “dahil” işaretliyse, koşullu alanlar koşulu sağlandığında koşulur. Senaryoya göre görünüm için senaryoyu açıp “Akış diyagramı” sekmesine bakın.'
    });
  } catch (hataNesnesi) {
    yerlestir(diyagram, h('div', { class: 'not-kutusu hata', role: 'alert' }, hataNesnesi.message));
  }
  yerlestir(kap, h('div', { class: 'gecmis-duzeni' },
    h('section', { class: 'kart surum-listesi-karti akis-listesi-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'Akışlar'),
        cokluAkis ? h('button', { type: 'button', class: 'kucuk-dugme sag', onclick: () => { yeniForm.hidden = false; yeniForm.querySelector('input')?.focus(); } }, ikon('artiYalin'), 'Yeni akış oluştur') : null),
      yeniForm,
      h('ol', { class: 'surum-listesi', 'aria-label': 'Akışlar' }, liste.akislar.map((a, i) => h('li', { class: a.id === secili.id ? 'secili' : null },
        h('a', { href: `${adres}/${encodeURIComponent(a.id)}`, 'aria-current': a.id === secili.id ? 'true' : null },
          h('span', { class: 'surum-no' }, String(i + 1)),
          h('span', { class: 'surum-bilgisi' }, h('b', {}, a.ad), h('small', {}, `${a.adimSayisi} adım · ${a.senaryoSayisi} senaryo`)),
          a.varsayilan ? rozet('varsayılan', 'vurgu') : null)))),
      liste.duzenlenebilir ? null : h('p', { class: 'kucuk soluk ust-bosluk' }, liste.neden),
      liste.ortakAkis ? ortakAkisKullananlar(liste.kullananlar || []) : null),
    h('div', { class: 'form-sutunu' },
      h('div', { class: 'akis-eylemleri' },
        h('h3', {}, secili.ad, secili.varsayilan ? rozet('varsayılan', 'vurgu') : null),
        liste.duzenlenebilir ? h('div', { class: 'dugmeler' },
          h('button', { type: 'button', class: 'birincil', onclick: () => tasarimiAc({ akisId: secili.id }) }, ikon('duzenle'), 'Düzenle'),
          liste.ortakAkis ? h('button', { type: 'button', onclick: () => ortakAkisiEkranlaraEkle(s.proje, e, yeniden) }, ikon('artiYalin'), 'Ekranlara ekle…') : null,
          liste.ortakAkis ? null : h('button', { type: 'button', onclick: () => tasarimiAc({ kopya: secili.id }) }, ikon('kopya'), 'Kopyala'),
          secili.varsayilan || liste.ortakAkis ? null : varsayilanYap,
          secili.varsayilan || liste.ortakAkis ? null : sil) : null),
      diyagram)));
}

/** Ortak akışı kullanan ekranlar (Akışlar sekmesinin sol kartında). */
function ortakAkisKullananlar(liste) {
  return h('div', { class: 'ust-bosluk' },
    h('h4', { class: 'kucuk' }, 'Kullanan ekranlar'),
    liste.length
      ? h('ul', { class: 'duz-liste kucuk', 'aria-label': 'Kullanan ekranlar' }, liste.map((k) => h('li', {},
        h('a', { href: `#/ekranlar/e/${encodeURIComponent(k.id)}/akis` }, k.ad), h('span', { class: 'cok-soluk' }, ` · ${k.akislar.join(', ')} · ${k.senaryoSayisi} senaryo`))))
      : h('p', { class: 'kucuk cok-soluk' }, 'Henüz hiçbir ekranın akışında yok.'));
}

/**
 * "Ekranlara ekle…": ortak akış seçilen ekranların varsayılan akışının sonuna eklenir (her ekran için yeni model sürümü).
 * Önce etki (ekran, akış, senaryo sayısı) gösterilir, onaylanınca yazılır.
 */
async function ortakAkisiEkranlaraEkle(proje, ortak, yeniden) {
  let aday;
  try {
    aday = await api(`/platform/ortak-akis/ekranlar?projeId=${encodeURIComponent(proje.id)}&ekranId=${encodeURIComponent(ortak.id)}`);
  } catch (hataNesnesi) { bildir(hataNesnesi.message, 'hata'); return; }
  const kutular = aday.ekranlar.map((x) => ({ x, kutu: h('input', { type: 'checkbox', value: x.id, disabled: !x.eklenebilir }) }));
  const istegeBagli = h('input', { type: 'checkbox', checked: true });
  formDiyalogu({
    baslik: `“${aday.ortakAkis.ad}” ekranlara eklensin`, ikonAd: 'pusula', dugme: 'Devam',
    aciklama: 'Seçilen ekranların varsayılan akışının sonuna eklenir. Ekranlar ortak akışın hep son sürümüyle koşar.',
    govde: [
      kutular.length
        ? h('ul', { class: 'duz-liste ortak-ekran-listesi', 'aria-label': 'Ekranlar' }, kutular.map(({ x, kutu }) => h('li', {},
          h('label', {}, kutu, h('b', {}, x.ad), h('span', { class: 'kucuk cok-soluk' }, ` · ${x.varsayilanAkis} · ${x.senaryoSayisi} senaryo`)),
          x.eklenebilir ? null : h('div', { class: 'kucuk cok-soluk' }, x.neden))))
        : h('p', { class: 'soluk' }, 'Projede ekran yok.'),
      h('label', { class: 'onay-satiri' }, istegeBagli, h('span', {}, 'İsteğe bağlı: yalnızca senaryoda “… dahil” işaretlenirse koşar (mevcut senaryolar etkilenmez)'))
    ],
    gonder: async () => {
      const ekranIdleri = kutular.filter(({ kutu }) => kutu.checked).map(({ x }) => x.id);
      if (!ekranIdleri.length) throw new Error('En az bir ekran seçin.');
      const govde = { projeId: proje.id, ekranId: ortak.id, ekranIdleri, istegeBagli: istegeBagli.checked };
      const on = await api('/platform/ortak-akis/ekle', { govde });
      const toplam = on.etki.ekranlar.reduce((n, x) => n + x.senaryoSayisi, 0);
      const onay = await onayIste({
        baslik: `“${on.etki.ortakAkis}” ${on.etki.ekranlar.length} ekrana eklensin mi?`,
        metin: `${on.etki.istegeBagli ? 'İsteğe bağlı eklenir: mevcut senaryolar değişmez; koşması için senaryoda işaretlenir.' : `Varsayılan akıştaki senaryolar (${toplam}) sonraki koşularında ortak akışı da koşar.`} Her ekranın yeni model sürümü açılır.`,
        liste: on.etki.ekranlar.map((x) => `${x.ad} · ${x.akis} · ${x.senaryoSayisi} senaryo`), dugme: 'Ekle', tehlikeli: false, ikonAd: 'uyari'
      });
      if (!onay) return false;
      const y = await api('/platform/ortak-akis/ekle', { govde: { ...govde, onay: true } });
      bildir(`Ortak akış ${y.eklenen.length} ekrana eklendi.`);
      yeniden();
      return true;
    }
  });
}

function modelOzetKarti(agac, d) {
  const sayilar = agac.sayilar;
  const satir = (etiket, deger) => [h('dt', {}, etiket), h('dd', {}, String(deger))];
  return [
    h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('katman'), 'Model özeti'), h('span', { class: 'sag' }, d.surum ? rozet(`v${d.surum}`, 'vurgu') : null)),
      h('div', { class: 'mini-sayilar' },
        [['Adım', sayilar.adim], ['Alan', sayilar.alan], ['Senaryoda', sayilar.senaryoAlani]].map(([e, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, e)))),
      h('dl', { class: 'ozet-satirlari' }, satir('Zorunlu alan', sayilar.zorunlu), satir('Koşullu alan', sayilar.kosullu), satir('Bölüm', sayilar.bolum))),
    agac.adimKapsami.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'İsteğe bağlı adımlar')),
      h('ul', { class: 'duz-liste kucuk' }, agac.adimKapsami.map((k) => h('li', {}, h('b', {}, k.etiket), ` → ${k.adimlar.join(', ')}`)))) : null,
    agac.profiller.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('hedef'), 'İncelenen bağlam profilleri')),
      h('div', { class: 'etiketler' }, agac.profiller.map((p) => rozet(p, ''))),
      h('p', { class: 'kucuk cok-soluk ust-bosluk' }, 'Alanlardaki ✓ / – / ? çipleri gözlemdir: koşuda alan görünüyorsa doldurulur, görünmüyorsa atlanır ("mutlaka görünmeli" işaretli değilse).')) : null,
    agac.bilinmeyenler.length ? h('section', { class: 'kart bilinmeyen-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Bilinmeyenler'), h('span', { class: 'sag' }, rozet(String(agac.bilinmeyenler.length), 'uyari'))),
      h('ul', { class: 'bilinmeyen-listesi' }, agac.bilinmeyenler.map((b) => h('li', {}, b)))) : null
  ];
}

async function gecmisSekmesi(alan, s, d) {
  if (!d.gecmis.length) { yerlestir(alan, bosDurum('Model sürümü yok.', null, { ikon: 'tarih' })); return; }
  const secili = s.surum && d.gecmis.some((g) => g.surum === s.surum) ? s.surum : d.gecmis[0].surum;
  const farkAlani = h('div', {}, iskelet('liste'));
  const adres = `#/ekranlar/e/${encodeURIComponent(d.ekran.id)}/gecmis`;
  yerlestir(alan, h('div', { class: 'gecmis-duzeni' },
    h('section', { class: 'kart surum-listesi-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('tarih'), 'Sürümler'), h('span', { class: 'sag cok-soluk kucuk' }, 'yeniden eskiye')),
      h('ol', { class: 'surum-listesi' }, d.gecmis.map((g) => h('li', { class: g.surum === secili ? 'secili' : null },
        h('a', { href: `${adres}/${g.surum}`, 'aria-current': g.surum === secili ? 'true' : null },
          h('span', { class: 'surum-no' }, `v${g.surum}`),
          h('span', { class: 'surum-bilgisi' },
            h('b', {}, g.aciklama || (g.surum === 1 ? 'İlk sürüm' : 'Güncelleme')),
            h('small', {}, tarihMetni(g.olusturulma))),
          g.degisiklikSayisi !== null ? rozet(`${g.degisiklikSayisi} değişiklik`, g.degisiklikSayisi ? 'vurgu' : '') : rozet('ilk', 'basari')))))),
    farkAlani));
  try {
    const f = await api(`/platform/ekran/surum?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(d.ekran.id)}&surum=${secili}`);
    yerlestir(farkAlani, h('section', { class: 'kart surum-farki-karti' },
      h('div', { class: 'kart-basligi' },
        h('h3', {}, ikon('katman'), f.oncekiSurum ? `v${f.oncekiSurum} → v${f.surum}` : `v${f.surum} (ilk sürüm)`),
        h('span', { class: 'sag' }, Object.entries(f.ozet.turler).map(([t, n]) => h('span', { class: 'tur-sayaci', title: BULGU_TURLERI[t]?.etiket || t }, bulguRozeti(t), h('b', {}, String(n)))))),
      f.aciklama ? h('p', { class: 'kucuk soluk' }, f.aciklama) : null,
      f.bulgular.length
        ? h('ul', { class: 'bulgu-listesi salt-okunur' }, f.bulgular.map((b) => h('li', { class: 'bulgu-satiri' },
          h('div', { class: 'bulgu-tur' }, bulguRozeti(b.tur)),
          h('div', { class: 'bulgu-ana' }, h('strong', {}, b.baslik), h('small', {}, b.konum), farkGosterimi(b)))))
        : h('p', { class: 'soluk' }, f.oncekiSurum ? 'Bu sürümde alan/adım değişikliği yok.' : 'İlk sürüm: sayfa paketinden oluşturuldu.'),
      f.agac ? h('details', { class: 'fark ust-bosluk' }, h('summary', {}, `v${f.surum} modelini göster`), modelAgaciCiz(f.agac, { kompakt: true, vurgulu: new Set(f.bulgular.map((b) => b.alanId).filter(Boolean)) })) : null));
  } catch (e) {
    if (e.durum !== 423) yerlestir(farkAlani, hataKutusu(e));
  }
}

function kanitSekmesi(alan, d) {
  const k = d.analiz.kanitlar;
  if (!k.length) { yerlestir(alan, bosDurum('Kanıt yok.', 'Sayfa paketlerindeki ekran görüntüleri burada şifreli saklanır.', { ikon: 'ekran' })); return; }
  yerlestir(alan, h('section', { class: 'kart' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Paket ekran görüntüleri'), h('span', { class: 'sag cok-soluk kucuk' }, 'medya deposunda şifreli')),
    h('ul', { class: 'gorsel-izgarasi genis-gorseller' }, k.slice().reverse().map((m) => h('li', {},
      h('button', { type: 'button', class: 'gorsel-dugmesi', onclick: () => gorselDiyalogu(medyaUrl(m.medyaId), m.ad), 'aria-label': `${m.ad} — büyüt` },
        h('img', { src: medyaUrl(m.medyaId), alt: '', loading: 'lazy' })),
      h('div', { class: 'gorsel-adi' }, h('span', {}, m.ad)),
      h('small', { class: 'cok-soluk kucuk' }, [m.kaynak, tarihMetni(m.zaman)].filter(Boolean).join(' · ')))))));
}

