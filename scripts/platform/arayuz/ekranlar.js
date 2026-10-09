// "Ekranlar" bölümü (genel; ekran = projenin test edilen bir sayfası/ürünü).
//   Liste: ekran kartları (model sürümü, adım/alan/senaryo sayıları, bekleyen analiz) + "Ekran ekle".
//   Ayrıntı: güncel model (adım › bölüm › alan; seçenekler, görünürlük, bağlam profiline göre görünürlük),
//   Model geçmişi (sürümler ve sürümler arası fark), Kanıtlar (şifreli ekran görüntüleri), eylemler:
//   "Paket yükle", "Ekranı tara" (otomatik tarama — tarama.js), "Akışı kaydet" (kullanıcı akışı tarayıcıda yürütür; tarama.js),
//   "Tekrar analiz et" (bağlam profili seçimi), "Yapay zekâ ile yorumla". Genel senaryoda "Ekranı tara" yok; kayıt ve tekrar analiz
//   bir BAŞLANGIÇ EKRANININ adresinden yapılır (başlangıç ekranı sorulur). Alt modelde yalnız "Paket yükle".
//   Kartta ve ayrıntı başlığında ⋯ menüsü (ekran-yonetimi.js): yeniden adlandır, düzenle (URL yolu), yukarı/aşağı taşı,
//   devre dışı bırak / etkinleştir, kalıcı sil. Devre dışı ekranlar sol listede varsayılan olarak gizlidir ("Devre dışı
//   ekranları göster"); silinmiş ekranlar (mezar taşı) "Tüm ekranlar"ın altında listelenir (geri yükle / temizle).
// "Ekran ekle" yalnız ekran oluşturur (her ekran başka senaryoda önceki adım olabilir); eski ortak-akis bağlantısı geriye uyum için durur.
// "Kullanan ekranlar" ve "Ekranlara ekle…" vardır.
// Adresler: #/ekranlar · #/ekranlar/yeni[/tara | /ortak-akis] ·#/ekranlar/e/<id>[/gecmis[/<sürüm>] | /kanitlar | /yukle | /bulgular] ·
//   #/ekranlar/tarama/<iş kimliği> (otomatik taramanın ilerlemesi → önizleme/kabul)
// Ekran keşfinin yolları (öncelik sırasıyla): "Ekranı tara", "Akışı kaydet" ve — "İleri düzey" altında, kapalı — ekran paketi (kullanıcı istek metnini ve biçim dosyasını sayfa bağlantısıyla yapay zekâ aracına verir; araç sayfayı
// düğme kurallarına göre — paket-istekleri.mjs > INCELEME_KURALLARI — inceleyip paketi üretir, paket burada yüklenir).
import { TOKEN, api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import { pdfRaporDugmesi } from './pdf-rapor.js';
import {
  BULGU_TURLERI, bulguRozeti, claudeDosyasiOlustur, farkGosterimi, goreliZaman, gorselDiyalogu, modelAgaciCiz, paketAdiniGuncelle, tekrarAnalizDiyalogu
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
import { paketIstekCumlesi } from './paket-istekleri.mjs';
import { acilirMenu } from './calisma-alani.js';
import { ortakCalismaSecimi, ortakSecimMetni } from './akis-tasarimi.js';

/** Otomatik tarama modülü isteğe bağlı yüklenir (yüklenemezse yalnızca tarama çalışmaz). */
let taramaSozu = null;
let akisTasarimiSozu = null;
const akisTasarimiModulu = () => (akisTasarimiSozu ??= import('./akis-tasarimi.js').catch((e) => { akisTasarimiSozu = null; throw e; }));
const taramaModulu = () => (taramaSozu ??= import('./tarama.js').catch((e) => { taramaSozu = null; throw e; }));
/**
 * "Ekranı otomatik tara" diyaloğu (ekran: mevcut ekran; null = yeni). olusturulacak: yeni eklemede "Ne oluşturulsun?" seçimi
 * ('ortakAkis': sonuç genel senaryo olur).
 */
function taramaBaslat(proje, ekran, olusturulacak = 'ekran') {
  taramaModulu().then((m) => m.taramaDiyalogu({ proje, ekran, olusturulacak })).catch((e) => bildir(`Tarama ekranı yüklenemedi (${e.message}). Sunucuyu yeniden başlatın.`, 'hata'));
}
/** "Akışı kaydet" diyaloğu (ekran: mevcut ekran; null = yeni; olusturulacak: yeni eklemede "Ne oluşturulsun?" seçimi). */
function kayitBaslat(proje, ekran, olusturulacak = 'ekran') {
  taramaModulu().then((m) => m.kayitDiyalogu({ proje, ekran, olusturulacak })).catch((e) => bildir(`Kayıt ekranı yüklenemedi (${e.message}). Sunucuyu yeniden başlatın.`, 'hata'));
}
const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
// İnceleme kuralları ve istek metni: TEK kaynak paket-istekleri.mjs (sayfa-paketi.js ve sunucu da aynısını kullanır).
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
        h('div', { class: 'yan-not' }, h('b', {}, 'Yeni ekran'), h('br', {}),
          'Yeni ekranı "Ekran ekle"de ekleyin: Nöbetçi taratsın ("Ekranı tara") ya da akışı siz kaydedin. Hazır ekran paketi (ör. yapay zekâ aracından) yine "Ekran ekle"de yüklenir. Aynı ekranı yeniden taramak = tekrar analiz.')),
      icerik));
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };

  (async () => {
    // Giriş (ortam başına giriş tarifi) Ekranlar'da listelenmez; yalnız Ayarlar > Giriş profilleri > Giriş tarifi'nden yönetilir.
    const [liste, servisler] = await Promise.all([api(`/platform/ekranlar?projeId=${encodeURIComponent(proje.id)}`), servisleriAl(proje)]);
    const secim = tur === 'e' ? kimlik : tur === 'yeni' ? '__yeni' : '';
    const yanCiz = () => yanListe(nav, liste.ekranlar, secim, yanCiz, servisler);
    yanCiz();
    if (tur === 'yeni') {
      // Ekran ekle yalnız EKRAN oluşturur: her ekran başka bir senaryonun önceki / başlangıç adımı olarak da kullanılabilir (akış
      // tasarımında "Önce şu ekrana git"), bunun için seçim yoktur. Yalnız ESKİ #/ekranlar/yeni/ortak-akis bağlantısı (yer imleri, eski
      // kayıtlar) geriye uyum için eskisi gibi genel senaryo oluşturur; arayüzde hiçbir yerden bu adrese bağlantı verilmez.
      // Eski #/ekranlar/yeni/ortak-akis adresi artık ayrı sayfa değildir: Ekran ekle'ye yönlenir (genel senaryo "Boş başla" kutusundadır).
      if (kimlik === 'ortak-akis') history.replaceState(null, '', '#/ekranlar/yeni');
      const olusturulacak = 'ekran';
      sayfaPaketiAkisi(icerik, {
        mod: 'yeni', proje, olusturulacak,
        tara: () => taramaBaslat(proje, null, olusturulacak), kaydet: () => kayitBaslat(proje, null, olusturulacak),
        bitti: (id) => { location.hash = `#/ekranlar/e/${encodeURIComponent(id)}`; }
      });
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
      if (!ekran) {
        yerlestir(icerik, bosDurum('Ekran bulunamadı.', 'Silinmiş ya da başka bir projeye ait olabilir.',
          { ikon: 'ekran', eylem: h('a', { class: 'dugme', href: '#/ekranlar' }, ikon('geri'), 'Ekranlara dön') }));
        return;
      }
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
    listeGorunumu(icerik, proje, liste);
  })().catch(hata);
}

/** Ekran listesinde (ürün/ekran kartları) gösterilmeyen model türleri: yan listede kendi gruplarında. */
const EKRAN_DISI_TURLER = ['altModel', 'ortakAkis'];

function yanListe(nav, tumu, secili, yeniden, servisler = []) {
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
    h('a', { href: '#/ekranlar/yeni', 'aria-current': secili === '__yeni' ? 'page' : null }, ikon('arti'), 'Ekran ekle'),
    ...urunlerBasligi(),
    ekranlarGrubu(ekranModelli.map(baglanti)),
    // Genel senaryo yalnız "Ekran ekle > Boş başla > Boş genel senaryo oluştur" ile oluşturulur (her ekran başka akışın önceki
    // adımı da olabildiği için sol menüde ayrı "ekle" bağlantısı yok); burada var olanlar listelenir.
    ortakAkislar.length ? navGrubu({ anahtar: 'ortak-akislar', baslik: 'Genel senaryolar', ogeler: ortakAkislar.map(baglanti) }) : null,
    altModeller.length ? navGrubu({ anahtar: 'alt-modeller', baslik: 'Alt modeller', ogeler: altModeller.map(baglanti), ekle: { etiket: 'Alt model ekle (ekran paketiyle)', href: '#/ekranlar/yeni' } }) : null,
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

function listeGorunumu(icerik, proje, liste) {
  const ekranlar = liste.ekranlar.filter((e) => !EKRAN_DISI_TURLER.includes(e.modelTuru));
  const { sirali, idler } = gorunenSira(liste);
  const devreDisi = ekranlar.filter((e) => e.durum === 'devre_disi').length;
  const modelli = ekranlar.filter((e) => e.modelSurumu).length;
  const bekleyen = ekranlar.filter((e) => e.bekleyenAnaliz);
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
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni' }, ikon('arti'), 'Ekran ekle'))),
    ekranlar.length
      ? h('div', { class: 'ekran-izgarasi' }, sirali.map((e) => ekranKarti(e, { proje, idler })))
      : bosDurum('Henüz ekran yok.', 'İlk ekranınızı ekleyin: "Ekranı tara" sayfayı yalnızca okuyarak alanlarını çıkarır; çok adımlı formlarda "Ekran ekle" > "Akışı kaydet" ile işlemi bir kez siz yaparsınız.',
        { ikon: 'ekran', eylem: h('div', { class: 'dugmeler' }, h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni/tara' }, ikon('ara'), 'Ekranı tara'), h('a', { class: 'dugme', href: '#/ekranlar/yeni' }, ikon('arti'), 'Ekran ekle')) }),
    ortakAkisBolumu(proje, liste.ekranlar.filter((e) => e.modelTuru === 'ortakAkis')),
    silinmisEkranlar(proje, liste.silinmisEkranlar || []));
}

/**
 * Genel senaryolar (ör. ödeme): ekran kartlarından ayrı; ekranların akışına "+ > Genel senaryo" ile eklenir. Kartlar ekran kartlarıyla
 * aynı düzende (ortakAkisKarti). Giriş burada listelenmez: yalnız Ayarlar > Giriş profilleri > Giriş tarifi'nden yönetilir.
 */
function ortakAkisBolumu(proje, liste) {
  if (!liste.length) return null;
  return h('section', { class: 'ortak-akis-bolumu', 'aria-labelledby': 'ortak-akislar-baslik' },
    h('div', { class: 'bolum-basligi' }, h('h3', { id: 'ortak-akislar-baslik' }, ikon('pusula'), 'Genel senaryolar', rozet(String(liste.length), 'vurgu')),
      h('span', { class: 'kucuk cok-soluk' }, 'Önceden oluşturduğunuz genel senaryolar; ekranların akışına “+ > Önce şu ekrana git” ile eklenir, hep son sürümüyle koşar.')),
    h('div', { class: 'ekran-izgarasi ortak-akis-izgarasi' }, ...liste.map((e) => ortakAkisKarti(e, proje))));
}

/**
 * Genel senaryo kartı: ekran kartıyla AYNI düzen — başlık + tür rozeti üstte, tek satır özet, kullanım, altta hizalı eylemler; ⋯
 * menüsü ekran kartındakiyle aynı (yeniden adlandır, devre dışı, sil; URL yolu yok, taşıma yok).
 * Adım listesi ana ekranda gösterilmez (Aç / Düzenle'de görünür); iç anahtar küçük soluk ikincil metindir.
 */
function ortakAkisKarti(e, proje) {
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const kullanan = typeof e.kullananSayisi === 'number' ? e.kullananSayisi : null;
  return h('article', { class: 'ekran-karti ortak-akis-karti', 'data-ekran': e.id, 'aria-label': e.ad },
    h('div', { class: 'ekran-karti-ust' },
      h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('pusula')),
      h('div', { class: 'ekran-karti-ad' }, h('h3', {}, h('a', { href: adres, title: e.ad }, e.ad)), h('code', { title: e.anahtar }, e.anahtar)),
      h('div', { class: 'ekran-karti-rozetler' }, rozet('genel senaryo', 'durdu'), e.modelSurumu ? rozet(`model v${e.modelSurumu}`, 'vurgu') : rozet('model yok', ''),
        ekranMenusu({ proje, ekran: e }))),
    h('p', { class: 'ortak-akis-ozeti' }, `${e.adimSayisi ?? 0} adım · ${e.alanSayisi ?? 0} alan`),
    kullanan !== null ? h('p', { class: 'ortak-akis-kullanimi kucuk soluk' }, kullanan ? `${kullanan} ekranda kullanılıyor` : 'Henüz hiçbir ekranda kullanılmıyor') : null,
    h('div', { class: 'ekran-karti-alt' },
      h('a', { class: 'dugme kucuk-dugme', href: adres, 'aria-label': `${e.ad}: aç` }, ikon('goz'), 'Aç'),
      h('a', { class: 'dugme kucuk-dugme', href: `${adres}/akis`, 'aria-label': `${e.ad}: düzenle` }, ikon('duzenle'), 'Düzenle')));
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
      h('div', { class: 'ekran-karti-ad' }, h('h3', {}, h('a', { href: adres, title: e.ad }, e.ad)), h('code', { title: e.anahtar }, e.anahtar),
        devreDisi ? h('div', { class: 'ekran-karti-durum' }, devreDisiRozeti()) : null),
      h('div', { class: 'ekran-karti-rozetler' },
        e.modelSurumu ? rozet(`model v${e.modelSurumu}`, 'vurgu') : rozet('model yok', ''),
        ekranMenusu({ proje: s.proje, ekran: e, idler: s.idler }))),
    e.modelSurumu
      ? h('div', { class: 'ekran-sayilari' }, sayi(e.adimSayisi, 'adım'), sayi(e.alanSayisi, 'alan'), sayi(e.senaryoSayisi, 'senaryo'))
      : h('p', { class: 'kucuk soluk' }, `${e.senaryoSayisi} senaryo · modeli yok — ekran paketi yükleyerek model oluşturun.`),
    e.bekleyenAnaliz
      ? h('a', { class: 'bekleyen-bant', href: `${adres}/bulgular` }, ikon('uyari'), h('span', {}, h('b', {}, String(e.bekleyenAnaliz.bulguSayisi)), ' bulgu karar bekliyor'), ikon('ok'))
      : null,
    h('div', { class: 'ekran-karti-alt' },
      e.urlYolu ? h('span', { class: 'mono cok-soluk', title: e.urlYolu }, e.urlYolu) : null,
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
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const paketYukle = () => { location.hash = `${adres}/yukle`; };
  // Model eylemleri tek menüde ("Modeli güncelle ▾"; modeli yoksa "Model ekle ▾"): her seçenekte bir satırlık "ne zaman kullanılır".
  const modelVar = Boolean(d.surum);
  // Alt model: taranmaz, kaydedilmez; yalnız paketle güncellenir (menüde yalnız Paket yükle). Genel senaryo taranmaz (kendi adresi yok)
  // ama bir BAŞLANGIÇ EKRANININ adresinden kaydedilir ve tekrar analiz edilir (başlangıç ekranı sorulur).
  const altModel = d.modelTuru === 'altModel';
  const ortakAkis = d.modelTuru === 'ortakAkis' ? (d.ortakAkis || { baslangicEkranlari: [], sonBaslangicEkranId: null }) : null;
  const menu = ekranMenusu({
    proje: s.proje, idler: s.idler,
    // Modeli değiştirmeyen yapay zekâ yardımcıları "Modeli güncelle" menüsünde değil, burada.
    ekOgeler: [
      modelVar && !altModel ? { ikon: 'yenile', metin: 'Tekrar analiz et', aciklama: ortakAkis ? 'Genel senaryoyu yapay zekâ aracınızla, başlangıç ekranının adresinden yeniden inceletmek için istek metni.' : 'Modeli yapay zekâ aracınızla yeniden inceletmek için istek metni (bağlam profilleriyle).',
        fn: () => tekrarAnalizDiyalogu({ proje: s.proje, ekran: e, baglamProfilleri: d.baglamProfilleri, sonSecim: d.analiz.sonBaglamProfilleri, paketYukle, ortakAkis }) } : null,
      modelVar && !altModel ? { ikon: 'simsek', metin: 'Yapay zekâ ile yorumla', aciklama: 'Model, bulgular ve senaryo özetlerini yorum için dosyaya yazar (gizli değer yok).',
        fn: () => claudeDosyasiOlustur({ proje: s.proje, ekranId: e.id, tur: 'yorumla' }, null) } : null
    ],
    ekran: { ...e, modelTuru: s.listeKaydi?.modelTuru ?? d.modelTuru, modelSurumu: d.surum, urlYolu: s.listeKaydi?.urlYolu ?? null },
    sonra: () => { location.hash = '#/ekranlar'; yenile(); }
  });
  /**
   * "Nöbetçi taraması": modeli olan ekranda hızlı test ekranı (düzenleme kipi) — örnek senaryonun verileriyle gezer, düğmelere izinle basar;
   * modeli yoksa sayfayı okuyan tarama.
   */
  const nobetciTaramasi = () => {
    if (!modelVar) { taramaBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }); return; }
    location.hash = `#/hizli-test/duzenle/${encodeURIComponent(e.id)}`;
  };
  const modelDugmesi = h('button', { type: 'button', class: 'birincil model-menusu-dugmesi' }, ikon(modelVar ? 'yenile' : 'arti'), modelVar ? 'Modeli güncelle' : 'Model ekle', ikon('asagi'));
  const modelMenusu = acilirMenu({
    dugme: modelDugmesi, sinif: 'satir-menusu-kap model-menusu', ogeler: [
      // Nöbetçi taraması (tek giriş): hızlı test ekranı gibi gezer (seçtiğiniz senaryonun verileriyle, düğmelere izinle basar).
      altModel || ortakAkis ? null : { ikon: 'ara', metin: 'Nöbetçi taraması', aciklama: 'Nöbetçi ekranı seçtiğiniz senaryonun verileriyle gezer, düğmelere izninizle basar; farkları gösterir, onayınızla günceller.',
        fn: () => nobetciTaramasi() },
      { ikon: 'yukle', metin: 'Paket yükle', aciklama: 'Yapay zekâ aracınızın ürettiği ekran paketi elinizdeyse.', fn: paketYukle },
      altModel ? null : {
        ikon: 'video', metin: 'Akışı kaydet',
        aciklama: ortakAkis ? 'Başlangıç ekranının adresinden: o ekranda gerekli adımları, sonra genel senaryoyu siz yürütürsünüz; Nöbetçi kaydeder.' : 'Çok adımlı / koşullu akışlarda: işlemi siz yaparsınız, Nöbetçi adımları kaydeder.',
        fn: () => kayitBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar })
      }
    ]
  });
  const agac = d.agac || (d.altModel ? d.altModel.agac : null);
  const sekmeler = [
    ['model', 'Model', null], ['gecmis', 'Model geçmişi', d.gecmis.length], ['kanitlar', 'Kanıtlar', d.analiz.kanitlar.length],
    ...(d.model ? [['akis', 'Akışlar', Array.isArray(d.model.akislar) && d.model.akislar.length ? d.model.akislar.length : 1]] : []),
    // Test verisi: ekranlarda ve genel senaryoda (bağları onu kullanan ekranlara varsayılan olarak geçer); alt modelde yok.
    ...(d.model && d.modelTuru !== 'altModel' ? [['veri', 'Test verisi', null]] : [])
  ];
  const sekmeAlani = h('div', {});
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, e.ad)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, e.ad),
          d.surum ? rozet(`model v${d.surum}`, 'vurgu') : rozet('model yok'), d.modelTuru === 'altModel' ? rozet('alt model', 'durdu') : d.modelTuru === 'ortakAkis' ? rozet('genel senaryo', 'durdu') : null,
          devreDisi ? devreDisiRozeti() : null),
        h('div', { class: 'meta' },
          h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, e.anahtar)),
          agac && agac.ekranUrl ? h('span', {}, ikon('ag'), h('code', { class: 'duz' }, agac.ekranUrl)) : null,
          // Genel senaryonun senaryosu yoktur: yerine onu kullanan ekran sayısı (Akışlar sekmesinde liste + "Ekranlara ekle…").
          ortakAkis
            ? h('span', {}, ikon('pusula'), h('a', { href: `${adres}/akis`, class: 'ortak-akis-kullanimi-baglantisi' },
              typeof s.listeKaydi?.kullananSayisi === 'number' && s.listeKaydi.kullananSayisi ? `${s.listeKaydi.kullananSayisi} ekranda kullanılıyor` : 'henüz hiçbir ekranda kullanılmıyor'))
            : h('span', {}, ikon('liste'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(e.id)}` }, `${d.senaryoSayisi} senaryo`)),
          // Senaryo tasarım yardımcısı (Senaryolar > ekran > "Senaryo önerileri"; öneri yalnızca öneridir).
          d.model && !EKRAN_DISI_TURLER.includes(d.modelTuru)
            ? h('span', {}, ikon('simsek'), h('a', { href: `#/senaryolar/oneriler/${encodeURIComponent(e.id)}`, class: 'senaryo-onerileri-baglantisi' }, 'Senaryo önerileri')) : null,
          d.gecmis[0] ? h('span', { title: tarihMetni(d.gecmis[0].olusturulma) }, ikon('saat'), `son sürüm ${goreliZaman(d.gecmis[0].olusturulma)}`) : null)),
      // Dönem raporu (PDF) kısayolu: kapsam ve seçim dolu gelir (alt model ve genel senaryonun kendi sonucu yoktur).
      h('div', { class: 'eylemler' }, altModel || ortakAkis ? null : pdfRaporDugmesi(s.proje, { kapsam: 'ekran', id: e.id }), modelMenusu, menu)),
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
    yerlestir(sekmeAlani, bosDurum('Bu ekranın modeli yok.', 'Yapay zekâ aracınızın ürettiği bir ekran paketini yükleyerek, ekranı tarayarak ya da akışı kaydederek model oluşturun. Mevcut senaryolar korunur.', {
      ikon: 'katman', eylem: h('div', { class: 'dugmeler' },
        h('a', { class: 'dugme birincil', href: `${adres}/yukle` }, ikon('yukle'), 'Ekran paketi yükle'),
        h('button', { type: 'button', onclick: () => taramaBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }) }, ikon('ara'), 'Ekranı tara'),
        h('button', { type: 'button', onclick: () => kayitBaslat(s.proje, { id: e.id, ad: e.ad, anahtar: e.anahtar }) }, ikon('video'), 'Akışı kaydet'))
    }));
    return;
  }
  // Model uyarıları (yalnız bilgi; model kendiliğinden değişmez): ör. hiçbir yere bağlı olmayan koşullar.
  const uyarilar = Array.isArray(d.uyarilar) ? d.uyarilar : [];
  yerlestir(sekmeAlani, h('div', { class: 'form-duzeni' },
    h('div', { class: 'form-sutunu' },
      uyarilar.length ? h('div', { class: 'not-kutusu uyari model-uyarilari', role: 'note', 'aria-label': 'Model uyarıları' },
        h('b', {}, `${uyarilar.length} model uyarısı`),
        h('ul', {}, uyarilar.map((u) => h('li', {}, u.mesaj)))) : null,
      modelAgaciCiz(agac)),
    h('aside', { class: 'ozet-sutunu', 'aria-label': 'Model özeti' }, modelOzetKarti(agac, d))));
}

/**
 * "Akışlar" sekmesi (Model geçmişi düzeninde): solda ekranın akışları (varsayılan önce; adım ve senaryo sayısı), "Yeni akış
 * oluştur" (ad + boş / bir akıştan kopya); sağda seçilen akışın diyagramı ve işlemleri (Düzenle, Kopyala, Varsayılan yap, Sil).
 * Düzenleme / yeni akış aynı sayfada diyagram düzenleyicisini açar (akis-tasarimi.js, kaynak 'ekran'); kaydedince yeni sürüm.
 * Genel senaryoda: tek akış (yeni / kopya / varsayılan / sil yok); onu kullanan ekranlar ve "Ekranlara ekle…".
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
    const ad = h('input', { type: 'text', maxlength: '80', placeholder: 'ör. Kurumsal sipariş', 'aria-label': 'Yeni akışın adı', required: true });
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

  // Boş başlatılmış genel senaryo (henüz adımı yok): diyagram yerine yol gösterilir; "Ekranlara ekle…" adım eklenince açılır.
  const bosOrtak = liste.ortakAkis && !secili.adimSayisi;
  const diyagram = h('section', { class: 'kart akis-diyagrami', 'aria-label': liste.ortakAkis ? 'Genel senaryonun akışı' : 'Ekranın akışı' });
  if (bosOrtak) {
    yerlestir(diyagram, bosDurum('Bu genel senaryonun henüz adımı yok.', '“Düzenle” ile diyagramı açın: alan grubu, aksiyon, beklenen mesaj ekleyin; alan ve düğmeleri sağdaki listede seçicisiyle elle tanımlayabilirsiniz. Ya da “Modeli güncelle > Akışı kaydet” ile bir başlangıç ekranından kaydedin.', {
      ikon: 'pusula', eylem: liste.duzenlenebilir ? h('button', { type: 'button', class: 'birincil', onclick: () => tasarimiAc({ akisId: secili.id }) }, ikon('duzenle'), 'Diyagramdan adım ekle') : null
    }));
  } else {
    try {
      akisDiyagramiCiz(diyagram, akisDiyagrami(akisModeli(d.model, secili.id)), {
        durum: 'ekran', ortamAdi: '', projeId: s.proje.id,
        not: 'İsteğe bağlı adımlar senaryoda “dahil” işaretliyse, koşullu alanlar koşulu sağlandığında koşulur. Senaryoya göre görünüm için senaryoyu açıp “Akış diyagramı” sekmesine bakın.'
      });
    } catch (hataNesnesi) {
      yerlestir(diyagram, h('div', { class: 'not-kutusu hata', role: 'alert' }, hataNesnesi.message));
    }
  }
  yerlestir(kap, h('div', { class: 'gecmis-duzeni' },
    h('section', { class: 'kart surum-listesi-karti akis-listesi-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'Akışlar'),
        cokluAkis ? h('button', { type: 'button', class: 'kucuk-dugme sag', onclick: () => { yeniForm.hidden = false; yeniForm.querySelector('input')?.focus(); } }, ikon('arti'), 'Akış ekle') : null),
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
          liste.ortakAkis ? h('button', {
            type: 'button', disabled: bosOrtak, title: bosOrtak ? 'Önce genel senaryoya adım ekleyin (Düzenle).' : null, onclick: () => ortakAkisiEkranlaraEkle(s.proje, e, yeniden)
          }, ikon('artiYalin'), 'Ekranlara ekle…') : null,
          liste.ortakAkis ? null : h('button', { type: 'button', onclick: () => tasarimiAc({ kopya: secili.id }) }, ikon('kopya'), 'Kopyala'),
          secili.varsayilan || liste.ortakAkis ? null : varsayilanYap,
          secili.varsayilan || liste.ortakAkis ? null : sil) : null),
      diyagram)));
}

/** Genel senaryoyu kullanan ekranlar (Akışlar sekmesinin sol kartında). */
function ortakAkisKullananlar(liste) {
  return h('div', { class: 'ust-bosluk' },
    h('h4', { class: 'kucuk' }, 'Kullanan ekranlar'),
    liste.length
      ? h('ul', { class: 'duz-liste kucuk', 'aria-label': 'Kullanan ekranlar' }, liste.map((k) => h('li', {},
        h('a', { href: `#/ekranlar/e/${encodeURIComponent(k.id)}/akis` }, k.ad), h('span', { class: 'cok-soluk' }, ` · ${k.akislar.join(', ')} · ${k.senaryoSayisi} senaryo`))))
      : h('p', { class: 'kucuk cok-soluk' }, 'Henüz hiçbir ekranın akışında yok.'));
}

/**
 * "Ekranlara ekle…": genel senaryo seçilen ekranların varsayılan akışının sonuna eklenir (her ekran için yeni model sürümü).
 * Önce etki (ekran, akış, senaryo sayısı) gösterilir, onaylanınca yazılır.
 */
async function ortakAkisiEkranlaraEkle(proje, ortak, yeniden) {
  let aday;
  try {
    aday = await api(`/platform/ortak-akis/ekranlar?projeId=${encodeURIComponent(proje.id)}&ekranId=${encodeURIComponent(ortak.id)}`);
  } catch (hataNesnesi) { bildir(hataNesnesi.message, 'hata'); return; }
  const kutular = aday.ekranlar.map((x) => ({ x, kutu: h('input', { type: 'checkbox', value: x.id, disabled: !x.eklenebilir }) }));
  // Çalışma seçimi (akış diyagramındaki genel senaryo bloğuyla aynı denetim): varsayılan her senaryoda çalışır (kullanıcı kararı; diyagramdaki yeni blokla aynı).
  const secim = { istegeBagli: false };
  formDiyalogu({
    baslik: `“${aday.ortakAkis.ad}” ekranlara eklensin`, ikonAd: 'pusula', dugme: 'Devam',
    aciklama: 'Seçilen ekranların varsayılan akışının sonuna eklenir. Ekranlar genel senaryonun hep son sürümüyle koşar.',
    govde: [
      kutular.length
        ? h('ul', { class: 'duz-liste ortak-ekran-listesi', 'aria-label': 'Ekranlar' }, kutular.map(({ x, kutu }) => h('li', {},
          h('label', {}, kutu, h('b', {}, x.ad), h('span', { class: 'kucuk cok-soluk' }, ` · ${x.varsayilanAkis} · ${x.senaryoSayisi} senaryo`)),
          x.eklenebilir ? null : h('div', { class: 'kucuk cok-soluk' }, x.neden))))
        : h('p', { class: 'soluk' }, 'Projede ekran yok.'),
      ortakCalismaSecimi(secim, () => {}, aday.ortakAkis.ad)
    ],
    gonder: async () => {
      const ekranIdleri = kutular.filter(({ kutu }) => kutu.checked).map(({ x }) => x.id);
      if (!ekranIdleri.length) throw new Error('En az bir ekran seçin.');
      const govde = { projeId: proje.id, ekranId: ortak.id, ekranIdleri, istegeBagli: secim.istegeBagli === true, dahilVarsayilan: secim.dahilVarsayilan === true };
      const on = await api('/platform/ortak-akis/ekle', { govde });
      const toplam = on.etki.ekranlar.reduce((n, x) => n + x.senaryoSayisi, 0);
      const onay = await onayIste({
        baslik: `“${on.etki.ortakAkis}” ${on.etki.ekranlar.length} ekrana eklensin mi?`,
        // Seçim tekrarlanır (ör. "“Çıkış”: isteğe bağlı, yeni senaryolarda dahil değil").
        metin: `“${on.etki.ortakAkis}”: ${ortakSecimMetni(on.etki)}. ${on.etki.istegeBagli ? 'Mevcut senaryolar değişmez; koşması için senaryo formunda “… dahil” anahtarı açılır.' : `Varsayılan akıştaki senaryolar (${toplam}) sonraki koşularında genel senaryoyu da koşar.`} Her ekranın yeni model sürümü açılır.`,
        liste: on.etki.ekranlar.map((x) => `${x.ad} · ${x.akis} · ${x.senaryoSayisi} senaryo`), dugme: 'Ekle', tehlikeli: false, ikonAd: 'uyari'
      });
      if (!onay) return false;
      const y = await api('/platform/ortak-akis/ekle', { govde: { ...govde, onay: true } });
      bildir(`Genel senaryo ${y.eklenen.length} ekrana eklendi.`);
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
        [['Adım', sayilar.adim, null], ['Alan', sayilar.alan, null], ['alan senaryodan', sayilar.senaryoAlani, 'Değeri senaryoda verilen alan sayısı']]
          .map(([e, v, t]) => h('div', t ? { title: t } : {}, h('b', {}, String(v)), h('span', {}, e)))),
      h('dl', { class: 'ozet-satirlari' }, satir('Zorunlu alan', sayilar.zorunlu), satir('Koşullu alan', sayilar.kosullu), satir('Bölüm', sayilar.bolum))),
    agac.adimKapsami.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'İsteğe bağlı adımlar')),
      h('ul', { class: 'duz-liste kucuk' }, agac.adimKapsami.map((k) => h('li', {}, h('b', {}, k.etiket), ` → ${k.adimlar.join(', ')}`)))) : null,
    agac.profiller.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('hedef'), 'İncelenen bağlam profilleri')),
      h('div', { class: 'etiketler' }, agac.profiller.map((p) => rozet(p, '', { kisalt: true }))),
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
            h('b', {}, paketAdiniGuncelle(g.aciklama) || (g.surum === 1 ? 'İlk sürüm' : 'Güncelleme')),
            h('small', {}, tarihMetni(g.olusturulma))),
          g.degisiklikSayisi !== null ? rozet(`${g.degisiklikSayisi} değişiklik`, g.degisiklikSayisi ? 'vurgu' : '') : rozet('ilk', 'basari')))))),
    farkAlani));
  try {
    const f = await api(`/platform/ekran/surum?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(d.ekran.id)}&surum=${secili}`);
    yerlestir(farkAlani, h('section', { class: 'kart surum-farki-karti' },
      h('div', { class: 'kart-basligi' },
        h('h3', {}, ikon('katman'), f.oncekiSurum ? `v${f.oncekiSurum} → v${f.surum}` : `v${f.surum} (ilk sürüm)`),
        h('span', { class: 'sag' }, Object.entries(f.ozet.turler).map(([t, n]) => h('span', { class: 'tur-sayaci', title: BULGU_TURLERI[t]?.etiket || t }, bulguRozeti(t), h('b', {}, String(n)))))),
      f.aciklama ? h('p', { class: 'kucuk soluk' }, paketAdiniGuncelle(f.aciklama)) : null,
      f.bulgular.length
        ? h('ul', { class: 'bulgu-listesi salt-okunur' }, f.bulgular.map((b) => h('li', { class: 'bulgu-satiri' },
          h('div', { class: 'bulgu-tur' }, bulguRozeti(b.tur)),
          h('div', { class: 'bulgu-ana' }, h('strong', {}, b.baslik), h('small', {}, b.konum), farkGosterimi(b)))))
        : h('p', { class: 'soluk' }, f.oncekiSurum ? 'Bu sürümde alan/adım değişikliği yok.' : 'İlk sürüm: ekran paketinden oluşturuldu.'),
      f.agac ? h('details', { class: 'fark ust-bosluk' }, h('summary', {}, `v${f.surum} modelini göster`), modelAgaciCiz(f.agac, { kompakt: true, vurgulu: new Set(f.bulgular.map((b) => b.alanId).filter(Boolean)) })) : null));
  } catch (e) {
    if (e.durum !== 423) yerlestir(farkAlani, hataKutusu(e));
  }
}

function kanitSekmesi(alan, d) {
  const k = d.analiz.kanitlar;
  if (!k.length) { yerlestir(alan, bosDurum('Kanıt yok.', 'Ekran paketlerindeki ekran görüntüleri burada şifreli saklanır.', { ikon: 'ekran' })); return; }
  yerlestir(alan, h('section', { class: 'kart' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Paket ekran görüntüleri'), h('span', { class: 'sag cok-soluk kucuk' }, 'medya deposunda şifreli')),
    h('ul', { class: 'gorsel-izgarasi genis-gorseller' }, k.slice().reverse().map((m) => h('li', {},
      h('button', { type: 'button', class: 'gorsel-dugmesi', onclick: () => gorselDiyalogu(medyaUrl(m.medyaId), m.ad), 'aria-label': `${m.ad} — büyüt` },
        h('img', { src: medyaUrl(m.medyaId), alt: '', loading: 'lazy' })),
      h('div', { class: 'gorsel-adi' }, h('span', {}, m.ad)),
      h('small', { class: 'cok-soluk kucuk' }, [paketAdiniGuncelle(m.kaynak), tarihMetni(m.zaman)].filter(Boolean).join(' · ')))))));
}

