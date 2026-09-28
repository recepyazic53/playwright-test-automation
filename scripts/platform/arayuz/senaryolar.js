// "Senaryolar" ekranı (genel, veritabanı kaynaklı; senaryo kimliği = UUID).
//   Solda ürün/ekran listesi (Sonuçlar ile aynı düzen), sağda senaryo tablosu: Türkçe duyarsız arama,
//   filtreler (ekran, Koşuda, beklenen sonuç, son durum), seçim + toplu işlemler (Seçilenleri
//   çalıştır, Koşuya ekle/çıkar, Sil), satır eylemleri (▷ / Düzenle / ⋯: Kopyala, Geçmiş, Playwright koduna dışa aktar, Sil),
//   "Koşuyu başlat" (tam: Genel ya da ürün, filtresiz; aksi halde kısmi) ve canlı koşu paneli.
//   ORTAMLAR: tüm senaryolar tek listede (birleşik liste: GET /platform/senaryolar?projeId, ortamId'siz). "Kapsam" sütunu
//   senaryonun tanımlı olduğu ortamların adları ("TEST + CANLI"; adlar kullanıcının verisinden). "Koşuda" ve "Son sonuç"
//   ORTAM BAŞINA. Ortam yalnız çalıştırırken (Koşuyu başlat / ▷ / Seçilenleri çalıştır) koşu diyaloğunda seçilir; koşuya o
//   ortamda tanımlı ve o ortamda Koşuda açık senaryolar girer.
//   Sıralama: başlığa tıklayınca VERİDE (sayfalı tablo; bkz. tablo-siralama.js, data-siralama="veri").
//   Oluşturma/düzenleme: model tabanlı form (senaryo-formu.js).
//   DEVRE DIŞI EKRANLAR (Ekranlar > ⋯): sol listede ve Genel listede varsayılan olarak gizli ("Devre dışı ekranları göster");
//   senaryoları "Koşuyu başlat"a / ▷'ye girmez (sunucu da reddeder), satırda "ekran devre dışı" rozeti.
//   Ekran seçiliyken "Senaryo önerileri": senaryo tasarım yardımcısı (senaryo-onerileri.js; öneri yalnızca öneridir).
// Adresler: #/senaryolar, #/senaryolar/u/<ekranId>, #/senaryolar/yeni/<ekranId>, #/senaryolar/duzenle/<id>, #/senaryolar/oneriler/<ekranId>
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, yerlestir, bildir, bosDurum, h, ikon, iskelet, kullaniciAyarlari, mesgulIken, rozet, yeniKimlik } from './ortak.js';
import { aramaEslesiyorMu } from './model-formu.mjs';
import { dinle, durdur, kosuBaslat, kosuDurumu, kosuOnayi, kosuOrtamiId, kosuSuruyorMu, onayIste, onerilenOrtam, riskliOrtamMi, secenekIste } from './kosu-paneli.js';
import { senaryoFormu } from './senaryo-formu.js';
import { senaryoOnerileriEkrani } from './senaryo-onerileri.js';
import { sqlKosuDenetimiAl, sqlKosuUyarilari } from './sql-adimi-formu.js';
import { devreDisiAnahtari, devreDisiGoster } from './ekran-yonetimi.js';
import { ekranlarGrubu, servisleriAl, servislerBolumu, uctanUcaBaglantisi, urunlerBasligi } from './urunler.js';
import { veriyiSirala } from './tablo-siralama.js';
import { playwrightKodunaAktar } from './playwright-disa-aktarma.js';

/** Bir sayfadaki satır (Ayarlar > Arayüz > Senaryolar sayfa boyu; kullanıcı kararı). */
let SAYFA_BOYU = 50;
const SON_DURUM = {
  basarili: { etiket: 'Başarılı', sinif: 'basari' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata' },
  atlanan: { etiket: 'Atlandı', sinif: 'atlanan' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu' }
};
const iki = (n) => String(n).padStart(2, '0');
const kisaTarih = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '—' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/** Son durumun kısa simgesi (Son sonuç sütununda ortam etiketinin yanında). */
const DURUM_SIMGESI = { basarili: '✓', basarisiz: '✗', atlanan: '↷', durduruldu: '■' };
const gunAy = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}`; };

/** Oturum boyunca korunan liste durumu (filtreler, sayfa, sıralama). Seçim ekran değişince temizlenir. */
const liste = { arama: '', ekran: '', kosuda: '', beklenen: '', son: '', kapsam: '', sayfa: 0, secim: new Set(), secimEkrani: null, siralama: { anahtar: null, yon: null } };

const birlesikListe = (proje) => api(`/platform/senaryolar?projeId=${encodeURIComponent(proje.id)}`);
/** Satırın ortam kaydı ({ ortamId, tanimli, kosuyaDahil, sonSonuc }) ya da undefined. */
const ortamKaydi = (x, ortamId) => (x.ortamlar || []).find((o) => o.ortamId === ortamId);
/** Senaryonun tanımlı olduğu ortamlar (proje ortam sırasıyla). */
const tanimliOrtamlar = (x, ortamlar) => ortamlar.filter((o) => ortamKaydi(x, o.id)?.tanimli);
/** Kapsam etiketi: tanımlı ortamların adları " + " ile (servis senaryolarındaki gibi). */
const kapsamEtiketi = (liste2) => (liste2.length ? liste2.map((o) => o.ad).join(' + ') : 'Hiçbir ortam');
const ortamdaDahil = (x, ortamId) => Boolean(ortamKaydi(x, ortamId)?.kosuyaDahil);

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/senaryolar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function senaryolarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik] = parcalar;
  const secili = tur === 'u' && kimlik ? decodeURIComponent(kimlik) : '';
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Senaryolar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Senaryo kimliği'), h('br', {}),
          'Senaryolar veritabanında tutulur; başlık değişse de koşu geçmişi ve sonuçlar aynı senaryoya bağlı kalır.')),
      icerik));
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };

  (async () => {
    const [{ ortamlar }, ayar] = await Promise.all([api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`), kullaniciAyarlari()]);
    if (Number.isInteger(ayar.senaryoSayfaBoyu)) SAYFA_BOYU = ayar.senaryoSayfaBoyu;
    if (!ortamlar.length) { yerlestir(icerik, bosDurum('Projede ortam yok.', 'Ayarlar > Ortamlar bölümünden bir ortam ekleyin.', { ikon: 'ag' })); return; }
    const [veri, servisler] = await Promise.all([birlesikListe(proje), servisleriAl(proje)]);
    // Formun doğrulama bağlamı: düzenlenen senaryonun tanımlı olduğu ortam (varsayılan önce), yoksa önerilen ortam.
    const duzenlenen = tur === 'duzenle' ? veri.senaryolar.find((s) => s.id === decodeURIComponent(kimlik || '')) : null;
    const ortam = (duzenlenen && onerilenOrtam(tanimliOrtamlar(duzenlenen, ortamlar))) || onerilenOrtam(ortamlar);
    const navCiz = () => ekranListesi(nav, veri, servisler, null, tur === 'u' || tur === undefined ? secili : null, tur === 'duzenle' ? veri.senaryolar.find((s) => s.id === decodeURIComponent(kimlik || ''))?.ekranId : tur === 'yeni' || tur === 'oneriler' ? decodeURIComponent(kimlik || '') : null,
      () => { navCiz(); if (tur !== 'yeni' && tur !== 'duzenle' && tur !== 'oneriler') window.dispatchEvent(new HashChangeEvent('hashchange')); });
    navCiz();
    if (tur === 'oneriler' && kimlik) {
      // Senaryo tasarım yardımcısı (senaryo-onerileri.js): öneriler seçili ortamın bağlamıyla üretilir; eklenenler o ortama yazılır.
      const ekranId = decodeURIComponent(kimlik);
      senaryoOnerileriEkrani(icerik, {
        proje, ortam, ortamlar, ekranId, ekranAdi: veri.ekranlar.find((e) => e.id === ekranId)?.ad ?? null,
        geri: () => { location.hash = `#/senaryolar/u/${encodeURIComponent(ekranId)}`; }
      });
      return;
    }
    if (tur === 'yeni' || tur === 'duzenle') {
      const senaryo = tur === 'duzenle' ? veri.senaryolar.find((s) => s.id === decodeURIComponent(kimlik || '')) : null;
      const ekranId = tur === 'yeni' ? decodeURIComponent(kimlik || '') : senaryo?.ekranId ?? null;
      senaryoFormu(icerik, {
        mod: tur, proje, ortam, ortamlar, ekranId, senaryoId: tur === 'duzenle' ? decodeURIComponent(kimlik || '') : null,
        ekranAdi: veri.ekranlar.find((e) => e.id === ekranId)?.ad ?? null,
        geri: () => { location.hash = ekranId ? `#/senaryolar/u/${encodeURIComponent(ekranId)}` : '#/senaryolar'; }
      });
      return;
    }
    listeGorunumu(icerik, { proje, ortamlar, veri, secili });
  })().catch(hata);
}

/**
 * Sol panel "ÜRÜNLER" (Servisler sayfası da kullanır): açılır-kapanır Ekranlar ve Servisler grupları.
 * @param {HTMLElement} nav @param {{ id: string }} proje @param {{ servisId?: string | null }} secim
 */
export async function urunlerPaneli(nav, proje, secim) {
  const [veri, servisler] = await Promise.all([birlesikListe(proje), servisleriAl(proje)]);
  const ciz = () => ekranListesi(nav, veri, servisler, secim.servisId ?? null, null, null, ciz);
  ciz();
}

function ekranListesi(nav, veri, servisler, seciliServis, secili, formEkrani, degisti) {
  const goster = devreDisiGoster();
  const pasif = new Set(veri.ekranlar.filter((e) => e.durum === 'devre_disi').map((e) => e.id));
  const toplam = veri.senaryolar.filter((x) => goster || !pasif.has(x.ekranId)).length;
  const baglanti = (id, ad, adet, ikonAd) => h('a', {
    href: id ? `#/senaryolar/u/${encodeURIComponent(id)}` : '#/senaryolar',
    'aria-current': (secili !== null && (secili || '') === (id || '')) || (formEkrani && formEkrani === id) ? 'page' : null,
    title: ad
  }, ikonAd ? ikon(ikonAd) : h('span', { class: 'saglik', 'aria-hidden': 'true' }), h('span', { class: 'nav-metni' }, ad), adet ? h('span', { class: 'adet' }, String(adet)) : null);
  const ekranlar = veri.ekranlar.filter((e) => (e.senaryoSayisi || e.olusturulabilir) && (goster || !pasif.has(e.id) || e.id === secili || e.id === formEkrani));
  yerlestir(nav,
    baglanti('', 'Genel', toplam, 'izgara'),
    ...urunlerBasligi(),
    ekranlarGrubu(ekranlar.map((e) => {
      const a = baglanti(e.id, e.ad, e.senaryoSayisi, e.modelVar ? 'katman' : null);
      if (pasif.has(e.id)) {
        a.classList.add('devre-disi');
        a.title = `${e.ad} — devre dışı (senaryoları koşulara girmez)`;
        a.insertBefore(h('span', { class: 'nav-etiketi' }, 'kapalı'), a.querySelector('.adet'));
      }
      return a;
    })),
    devreDisiAnahtari(veri.ekranlar.filter((e) => pasif.has(e.id) && e.senaryoSayisi).length, degisti),
    ...servislerBolumu(servisler, { seciliServis }),
    uctanUcaBaglantisi());
}

// ---------------------------------------------------------------------------------------
// Liste görünümü
// ---------------------------------------------------------------------------------------

function listeGorunumu(icerik, s) {
  const { proje, ortamlar } = s;
  let veri = s.veri;
  const kapsamOf = (x) => kapsamEtiketi(tanimliOrtamlar(x, ortamlar));
  /** Koşu diyaloğunda önce seçili ortam: sürmekte olan koşu varsa onun ortamı (tek ▷ aynı panele eklenebilsin). */
  const surenOrtam = () => (kosuSuruyorMu() && kosuOrtamiId() ? { id: kosuOrtamiId() } : undefined);
  /** Tanımlı ortamlardaki son sonuçlar (null: o ortamda koşulmadı). */
  const ortamSonuclari = (x) => (x.ortamlar || []).filter((o) => o.tanimli).map((o) => o.sonSonuc);
  /** Veride sıralama alanları (th[data-sirala-anahtar]). */
  const SIRALAMA_ALANLARI = {
    baslik: (x) => x.baslik,
    ekran: (x) => x.ekranAdi || '',
    profil: (x) => x.baglamProfili?.ad || '',
    beklenen: (x) => x.beklenenSonuc?.metin || '',
    kapsam: kapsamOf,
    son: (x) => { const t = x.sonSonuc ? Date.parse(x.sonSonuc.zaman) : NaN; return Number.isNaN(t) ? 0 : t; },
    kosuda: (x) => (x.ortamlar || []).filter((o) => o.kosuyaDahil).length
  };
  const ekran = s.secili ? veri.ekranlar.find((e) => e.id === s.secili) || null : null;
  // Ekran değişince seçim ve arama sıfırlanır (filtre seçimleri korunur).
  if (liste.secimEkrani !== (s.secili || '')) { liste.secim = new Set(); liste.sayfa = 0; liste.arama = ''; liste.secimEkrani = s.secili || ''; }
  if (ekran) liste.ekran = '';

  const tabloAlani = h('div', {});
  const topluAlani = h('div', {});
  const ozetAlani = h('span', { class: 'liste-ozeti', 'aria-live': 'polite' });
  const baslikRozeti = h('span', {});
  const metaAlani = h('div', { class: 'meta' });

  // --- Filtreler ---
  const arama = h('input', { type: 'search', placeholder: 'Senaryo ara… (Türkçe karakter duyarsız)', value: liste.arama, 'aria-label': 'Senaryo ara' });
  const secimKutusu = (etiket, anahtar, secenekler) => {
    const sel = h('select', { 'aria-label': etiket }, secenekler.map(([d, m]) => h('option', { value: d, selected: liste[anahtar] === d }, m)));
    const kap = h('div', { class: `filtre-secimi ${liste[anahtar] ? 'etkin' : ''}` }, h('label', {}, etiket), sel);
    sel.addEventListener('change', () => { liste[anahtar] = sel.value; liste.sayfa = 0; kap.classList.toggle('etkin', Boolean(sel.value)); ciz(); });
    return { kap, sel };
  };
  const ekranSecimi = ekran ? null : secimKutusu('Ekran', 'ekran', [['', 'Tümü'], ...veri.ekranlar.filter((e) => e.senaryoSayisi).map((e) => [e.id, e.ad])]);
  const kosudaSecimi = secimKutusu('Koşuda', 'kosuda', [['', 'Tümü'], ['evet', 'Koşuda'], ['hayir', 'Hariç']]);
  kosudaSecimi.sel.title = 'Koşuda: en az bir ortamda koşuda · Hariç: hiçbir ortamda koşuda değil';
  // Kapsam: veride bulunan ortam kombinasyonları (liste yenilenince ciz() seçenekleri günceller).
  const kapsamSecenekleri = () => [...new Set(veri.senaryolar.map(kapsamOf))].sort((a, b) => a.localeCompare(b, 'tr'));
  const kapsamSecimi = secimKutusu('Kapsam', 'kapsam', [['', 'Tümü'], ...kapsamSecenekleri().map((k) => [k, k])]);
  const beklenenSecimi = secimKutusu('Beklenen', 'beklenen', [['', 'Tümü'], ['basari', 'Başarılı akış'], ['hata', 'İş kuralı hatası'], ['yok', 'Tanımsız']]);
  const sonSecimi = secimKutusu('Son durum', 'son', [['', 'Tümü'], ['basarili', 'Başarılı'], ['basarisiz', 'Başarısız'], ['atlanan', 'Atlandı'], ['durduruldu', 'Durduruldu'], ['yok', 'Koşulmadı']]);
  sonSecimi.sel.title = 'Herhangi bir ortamdaki son sonuca göre';
  const temizle = h('button', { type: 'button', class: 'kucuk-dugme hayalet filtre-temizle', onclick: () => {
    Object.assign(liste, { arama: '', ekran: '', kosuda: '', beklenen: '', son: '', kapsam: '', sayfa: 0 });
    arama.value = '';
    for (const x of [ekranSecimi, kosudaSecimi, kapsamSecimi, beklenenSecimi, sonSecimi]) if (x) { x.sel.value = ''; x.kap.classList.remove('etkin'); }
    ciz();
  } }, ikon('carpi'), 'Filtreleri temizle');
  let aramaZamanlayici = null;
  arama.addEventListener('input', () => {
    clearTimeout(aramaZamanlayici);
    aramaZamanlayici = setTimeout(() => { liste.arama = arama.value; liste.sayfa = 0; ciz(); }, 120);
  });

  const filtreliMi = () => Boolean(liste.arama.trim() || liste.kosuda || liste.beklenen || liste.son || liste.kapsam || (!ekran && liste.ekran));
  const gorunenler = () => veri.senaryolar.filter((x) => {
    // Devre dışı ekranın senaryoları Genel listede gizli (anahtar açıksa ya da o ekran seçiliyse görünür).
    if (!ekran && x.ekranEtkin === false && !devreDisiGoster()) return false;
    if (ekran && x.ekranId !== ekran.id) return false;
    if (!ekran && liste.ekran && x.ekranId !== liste.ekran) return false;
    if (liste.kosuda === 'evet' && !x.kosuyaDahil) return false;
    if (liste.kosuda === 'hayir' && x.kosuyaDahil) return false;
    if (liste.beklenen === 'basari' && x.beklenenSonuc?.tur !== 'basari') return false;
    if (liste.beklenen === 'hata' && x.beklenenSonuc?.tur !== 'hata') return false;
    if (liste.beklenen === 'yok' && x.beklenenSonuc) return false;
    if (liste.kapsam && kapsamOf(x) !== liste.kapsam) return false;
    if (liste.son === 'yok' && ortamSonuclari(x).some(Boolean)) return false;
    if (liste.son && liste.son !== 'yok' && !ortamSonuclari(x).some((r) => r?.durum === liste.son)) return false;
    return aramaEslesiyorMu(liste.arama, x.baslik, x.ekranAdi, x.baglamProfili?.ad, x.beklenenSonuc?.metin, x.kaynak?.dosya);
  });
  /** Görünenler, liste durumundaki sıralamayla (sayfalamadan önce). */
  const siraliGorunenler = () => {
    const alan = liste.siralama.anahtar ? SIRALAMA_ALANLARI[liste.siralama.anahtar] : null;
    return alan ? veriyiSirala(gorunenler(), alan, liste.siralama.yon) : gorunenler();
  };

  // --- Başlık ve eylemler ---
  const olusturulabilirler = veri.ekranlar.filter((e) => e.olusturulabilir);
  const yeniDugmesi = ekran
    ? (ekran.olusturulabilir ? h('a', { class: 'dugme', href: `#/senaryolar/yeni/${encodeURIComponent(ekran.id)}` }, ikon('arti'), 'Senaryo ekle') : null)
    : olusturulabilirler.length ? yeniMenusu(olusturulabilirler) : null;
  // Senaryo tasarım yardımcısı: modelden öneri (kaydetmez; kullanıcı seçip ekler).
  const oneriDugmesi = ekran && ekran.olusturulabilir && ekran.modelVar
    ? h('a', { class: 'dugme senaryo-onerileri-dugmesi', href: `#/senaryolar/oneriler/${encodeURIComponent(ekran.id)}`, title: 'Ekran modelinden ve mevcut senaryolardan senaryo önerileri (siz seçmeden senaryo oluşmaz)' }, ikon('simsek'), 'Senaryo önerileri')
    : null;
  const kosuDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Koşuyu başlat');
  kosuDugmesi.addEventListener('click', () => kosuyuBaslat());

  const baslikMetni = ekran ? ekran.ad : 'Genel';
  yerlestir(icerik, 
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/senaryolar' }, 'Senaryolar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, baslikMetni)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Senaryolar — '), baslikMetni), baslikRozeti),
        metaAlani),
      h('div', { class: 'eylemler' }, oneriDugmesi, yeniDugmesi, kosuDugmesi)),
    h('div', { class: 'senaryo-arac-cubugu' },
      h('div', { class: 'arama-kutusu' }, ikon('ara'), arama, h('kbd', { 'aria-hidden': 'true' }, '/')),
      ekranSecimi ? ekranSecimi.kap : null, kosudaSecimi.kap, kapsamSecimi.kap, beklenenSecimi.kap, sonSecimi.kap, temizle, ozetAlani),
    topluAlani,
    tabloAlani);
  const kisayol = (o) => {
    if (o.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.querySelector('dialog[open]')) { o.preventDefault(); arama.focus(); }
  };
  document.addEventListener('keydown', kisayol);

  async function yenile() {
    try {
      veri = await birlesikListe(proje);
      const gecerli = new Set(veri.senaryolar.map((x) => x.id));
      for (const id of [...liste.secim]) if (!gecerli.has(id)) liste.secim.delete(id);
      ciz();
    } catch (e) {
      if (e && e.durum === 423) return;
      bildir(e.message, 'hata');
    }
  }

  // Koşu durumu değişince satırlar yeniden çizilir; bir senaryo bitince son sonuç için liste yenilenir.
  let yenilemeZamanlayici = null;
  const birak = dinle((olay) => {
    if (!icerik.isConnected) { birak(); document.removeEventListener('keydown', kisayol); return; }
    if (olay === 'satir-bitti' || olay === 'bitti') { clearTimeout(yenilemeZamanlayici); yenilemeZamanlayici = setTimeout(yenile, 400); }
    else ciz();
  });

  // Başlığa tıklayınca sıralama (tablo-siralama.js olayı): durum listede tutulur, veri sıralanıp ilk sayfaya dönülür.
  tabloAlani.addEventListener('tablo-sirala', (o) => {
    const { anahtar, yon } = /** @type {CustomEvent} */ (o).detail || {};
    liste.siralama = yon && SIRALAMA_ALANLARI[anahtar] ? { anahtar, yon } : { anahtar: null, yon: null };
    liste.sayfa = 0;
    ciz();
  });

  /** Kapsam süzgecinin seçenekleri veriden (liste yenilenince yeni kombinasyonlar görünsün; geçersiz seçim sıfırlanır). */
  function kapsamSecenekleriniGuncelle() {
    const secenekler = kapsamSecenekleri();
    if (liste.kapsam && !secenekler.includes(liste.kapsam)) liste.kapsam = '';
    yerlestir(kapsamSecimi.sel, [['', 'Tümü'], ...secenekler.map((k) => [k, k])].map(([d, m]) => h('option', { value: d, selected: liste.kapsam === d }, m)));
    kapsamSecimi.sel.value = liste.kapsam;
    kapsamSecimi.kap.classList.toggle('etkin', Boolean(liste.kapsam));
  }

  function ciz() {
    kapsamSecenekleriniGuncelle();
    const liste2 = siraliGorunenler();
    const kapsam = ekran ? veri.senaryolar.filter((x) => x.ekranId === ekran.id) : veri.senaryolar.filter((x) => x.ekranEtkin !== false || devreDisiGoster());
    const dahil = kapsam.filter((x) => x.kosuyaDahil && x.ekranEtkin !== false).length;
    yerlestir(baslikRozeti, rozet(`${kapsam.length} senaryo`, 'vurgu'));
    yerlestir(metaAlani,
      h('span', { title: 'En az bir ortamda Koşuda açık olan senaryolar' }, ikon('liste'), `${dahil} / ${kapsam.length} koşuda`),
      ekran ? h('span', {}, ikon(ekran.modelVar ? 'katman' : 'ekran'), ekran.modelVar ? 'ekran modeli var' : 'ekran modeli yok') : h('span', {}, ikon('ekran'), `${veri.ekranlar.filter((e) => e.senaryoSayisi).length} ürün / ekran`));
    yerlestir(ozetAlani, liste2.length !== kapsam.length ? h('span', {}, h('b', {}, String(liste2.length)), ` / ${kapsam.length} gösteriliyor`) : '');
    temizle.hidden = !filtreliMi();
    kosuDugmesi.disabled = kosuSuruyorMu() || !liste2.some((x) => x.kosuyaDahil && x.ekranEtkin !== false && !kosuDurumu(x.id));
    // Pasifken nedeni söylenir (düğmenin üstüne gelince ve ekran okuyucuda).
    kosuDugmesi.title = !kosuDugmesi.disabled ? 'Koşuda açık senaryoları sırayla koşar (ortam sorulur)'
      : kosuSuruyorMu() ? 'Sürmekte olan bir koşu var; bitmesini bekleyin ya da durdurun.'
        : 'Koşuda açık senaryo yok: tablodaki "Koşuda" anahtarını açın ya da senaryoları seçip "Koşuya ekle"yi kullanın.';
    kosuDugmesi.title = kosuSuruyorMu() ? 'Sürmekte olan bir koşu var' : ekran && ekran.durum === 'devre_disi' ? 'Ekran devre dışı: senaryoları koşulara girmez (Ekranlar > ⋯ > Etkinleştir)' : '';
    topluCubukCiz(liste2);
    tabloCiz(liste2);
  }

  /** Toplu çoğaltma: adet + başlık şablonu → önizleme (yeni başlıklar, çakışanlar) → onay. Kopyalar "Koşuda" kapalı gelir. */
  async function cogalt(secilenler) {
    const adet = h('input', { type: 'number', min: '1', max: '50', value: '1', id: yeniKimlik('cogalt-adet'), inputmode: 'numeric' });
    const sablon = h('input', { type: 'text', value: '{baslik} ({n})', id: yeniKimlik('cogalt-sablon'), spellcheck: 'false' });
    const onizleme = h('div', { class: 'cogalt-onizleme', 'aria-live': 'polite' });
    const hata = h('p', { class: 'hata-metni', role: 'alert' });
    const tamam = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('kopya'), 'Oluştur');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis', 'aria-labelledby': 'cogalt-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'cogalt-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('kopya')), `${secilenler.length} senaryoyu çoğalt`),
        h('p', { class: 'soluk' }, 'Her seçili senaryodan istediğiniz sayıda kopya oluşur; kopyalar "Koşuda" kapalı gelir. Değerlerini sonra satırdan ya da toplu değer atamayla değiştirebilirsiniz.'),
        h('div', { class: 'satir-duzen' },
          h('div', { class: 'alan' }, h('label', { for: adet.id }, 'Her senaryodan kopya'), adet),
          h('div', { class: 'alan' }, h('label', { for: sablon.id }, 'Başlık şablonu'), sablon, h('small', { class: 'yardim' }, '{baslik} = asıl başlık, {n} = kopya numarası'))),
        hata, onizleme),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    let plan = null;
    const govde = (onay) => ({ projeId: proje.id, idler: secilenler.map((x) => x.id), adet: Number(adet.value), sablon: sablon.value, onay });
    let zaman = null;
    const onizle = async () => {
      hata.textContent = '';
      tamam.disabled = true;
      try {
        const y = await api('/platform/senaryolar/cogalt', { govde: govde(false) });
        plan = y.plan;
        yerlestir(onizleme, h('p', { class: 'kucuk' }, h('b', {}, String(y.plan.length)), ' yeni senaryo', y.cakisanlar ? h('span', { class: 'hata-metni' }, ` · ${y.cakisanlar} başlık çakışıyor`) : null),
          h('ul', { class: 'onay-listesi' }, y.plan.slice(0, 30).map((p) => h('li', { class: p.cakisma ? 'hata-metni' : null }, p.baslik, p.cakisma ? ' (zaten var)' : '')),
            y.plan.length > 30 ? h('li', {}, `… ve ${y.plan.length - 30} daha`) : null));
        tamam.disabled = y.cakisanlar > 0;
      } catch (e) { plan = null; yerlestir(onizleme); hata.textContent = e.message; }
    };
    for (const g of [adet, sablon]) g.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(onizle, 250); });
    tamam.addEventListener('click', async () => {
      if (!plan) return;
      try {
        const y = await mesgulIken(tamam, 'Oluşturuluyor…', () => api('/platform/senaryolar/cogalt', { govde: govde(true) }));
        diyalog.close();
        bildir(`${y.olusanlar.length} kopya oluşturuldu ("Koşuda" kapalı).`);
        liste.secim.clear();
        yenile();
      } catch (e) { hata.textContent = e.message; }
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => diyalog.remove());
    document.body.append(diyalog);
    diyalog.showModal();
    adet.focus();
    onizle();
  }

  /**
   * Eskimiş sabit tarihler → bugüne göre: önce önizleme (senaryo, ortam, alan, eski → yeni ifade ve bugünkü karşılığı), onayla yazılır.
   * Yeni ifade tarihin senaryonun son kaydedildiği güne göre farkını korur (sunucu: senaryolar/tarih-donusumu.mjs).
   */
  async function tarihleriBugununGoreYap(secilenler) {
    const govde = (onay) => ({ projeId: proje.id, senaryoIdleri: secilenler.map((x) => x.id), onay });
    let plan;
    try { ({ onizleme: plan } = await api('/platform/senaryolar/tarih-donusumu', { govde: govde(false) })); } catch (e) { bildir(e.message, 'hata'); return; }
    const hata = h('p', { class: 'hata-metni', role: 'alert' });
    const tamam = h('button', { type: 'button', class: 'birincil', disabled: !plan.satirlar.length }, ikon('onay'), `${plan.ozet.alan} tarihi bugüne göre yap`);
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay', 'aria-labelledby': 'tarih-donusumu-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'tarih-donusumu-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('takvim')), 'Tarihleri bugüne göre yap'),
        h('p', { class: 'soluk' }, plan.aciklama, ' Koşuda her gün o günün tarihi yazılır; tarih geçince senaryo kırılmaz.'),
        h('div', { class: 'tarih-donusum-kap' }, h('table', { class: 'tarih-donusum-tablosu', 'aria-label': 'Tarih dönüşümü önizlemesi' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Senaryo'), h('th', { scope: 'col' }, 'Alan'), h('th', { scope: 'col' }, 'Eski'), h('th', { scope: 'col' }, 'Yeni'))),
          h('tbody', {}, plan.satirlar.map((r) => h('tr', {},
            h('td', {}, r.senaryo, ortamlar.length > 1 ? h('small', { class: 'soluk' }, ` · ${r.ortam}`) : null),
            h('td', {}, r.alanEtiketi),
            h('td', { class: 'mono', title: r.mesaj }, r.eski),
            h('td', { class: 'mono' }, r.yeni, h('small', { class: 'soluk' }, ` → bugün ${r.yeniTarih}`))))))),
        plan.atlananlar.length ? h('p', { class: 'kucuk soluk' }, 'Değişmeyecek: ', plan.atlananlar.map((a) => `${a.senaryo} (${a.neden})`).join(', ')) : null,
        hata),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    tamam.addEventListener('click', async () => {
      try {
        const y = await mesgulIken(tamam, 'Yazılıyor…', () => api('/platform/senaryolar/tarih-donusumu', { govde: govde(true) }));
        diyalog.close();
        bildir(`${y.guncellenenSenaryo} senaryoda ${y.donusturulenAlan} tarih bugüne göre yapıldı.`);
        liste.secim.clear();
        yenile();
      } catch (e) { hata.textContent = e.message; }
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => diyalog.remove());
    document.body.append(diyalog);
    diyalog.showModal();
    tamam.focus();
  }

  function topluCubukCiz(gorunen) {
    const gorunenIdler = new Set(gorunen.map((x) => x.id));
    const secilenler = gorunen.filter((x) => liste.secim.has(x.id));
    const gizliSecili = [...liste.secim].filter((id) => !gorunenIdler.has(id)).length;
    if (!liste.secim.size) { yerlestir(topluAlani); return; }
    yerlestir(topluAlani, h('div', { class: 'toplu-cubuk', role: 'toolbar', 'aria-label': 'Seçili senaryolar için işlemler' },
      h('span', { class: 'secim-bilgisi' }, h('b', {}, String(secilenler.length)), 'seçili',
        gizliSecili ? h('span', { class: 'soluk kucuk' }, `(+${gizliSecili} filtre dışında; işlemlere dahil edilmez)`) : null),
      h('button', { type: 'button', class: 'kucuk-dugme birincil', disabled: !secilenler.length, onclick: () => seciliCalistir(secilenler) }, ikon('oynat'), 'Seçilenleri çalıştır'),
      h('span', { class: 'ayrac', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !secilenler.some((x) => tanimliOrtamlar(x, ortamlar).some((o) => !ortamdaDahil(x, o.id))), onclick: () => kosuyaDahilEt(secilenler, true) }, ikon('onay'), 'Koşuya ekle'),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !secilenler.some((x) => x.kosuyaDahil), onclick: () => kosuyaDahilEt(secilenler, false) }, ikon('eksi'), 'Koşudan çıkar'),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !secilenler.length, onclick: () => cogalt(secilenler) }, ikon('kopya'), 'Çoğalt…'),
      h('button', {
        type: 'button', class: 'kucuk-dugme', disabled: !secilenler.some((x) => x.eskiyenTarihler?.length),
        title: secilenler.some((x) => x.eskiyenTarihler?.length) ? 'Tarihi geçmiş sabit tarihleri "bugün+N" yapar (önce önizleme)' : 'Seçili senaryolarda eskimiş sabit tarih yok',
        onclick: () => tarihleriBugununGoreYap(secilenler.filter((x) => x.eskiyenTarihler?.length))
      }, ikon('takvim'), 'Tarihleri bugüne göre yap…'),
      h('button', {
        type: 'button', class: 'kucuk-dugme tehlike', disabled: !secilenler.length,
        onclick: () => sil(secilenler)
      }, ikon('cop'), 'Sil'),
      h('span', { class: 'sag' }, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { liste.secim.clear(); ciz(); } }, 'Seçimi temizle'))));
  }

  function tabloCiz(gorunen) {
    if (!gorunen.length) {
      yerlestir(tabloAlani, h('section', { class: 'kart' }, veri.senaryolar.length
        ? bosDurum('Filtreyle eşleşen senaryo yok.', 'Aramayı ya da filtreleri değiştirin.', { ikon: 'ara', eylem: h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => temizle.click() }, 'Filtreleri temizle') })
        : bosDurum('Henüz senaryo yok.', 'Ekran modeli olan bir ekranda yeni senaryo oluşturun.', { ikon: 'liste' })));
      return;
    }
    /** Veride sıralanan başlık: aria-sort liste durumundan çizilir (tablo-siralama.js düğmeyi ekler, olayı yayar). */
    const sth = (anahtar, metin, sinif = null) => h('th', {
      scope: 'col', class: sinif, 'data-sirala-anahtar': anahtar,
      'aria-sort': liste.siralama.anahtar === anahtar && liste.siralama.yon ? (liste.siralama.yon === 'artan' ? 'ascending' : 'descending') : 'none'
    }, metin);
    const sayfaSayisi = Math.max(1, Math.ceil(gorunen.length / SAYFA_BOYU));
    if (liste.sayfa >= sayfaSayisi) liste.sayfa = sayfaSayisi - 1;
    const dilim = gorunen.slice(liste.sayfa * SAYFA_BOYU, (liste.sayfa + 1) * SAYFA_BOYU);
    const tumu = h('input', { type: 'checkbox', 'aria-label': 'Görünen tüm senaryoları seç' });
    const secilenGorunen = gorunen.filter((x) => liste.secim.has(x.id)).length;
    tumu.checked = secilenGorunen > 0 && secilenGorunen === gorunen.length;
    tumu.indeterminate = secilenGorunen > 0 && secilenGorunen < gorunen.length;
    tumu.addEventListener('change', () => {
      for (const x of gorunen) { if (tumu.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); }
      ciz();
    });
    const tablo = h('table', { class: 'senaryo-tablosu ortamli-senaryo-tablosu', 'data-siralama': 'veri' },
      h('caption', { class: 'gorunmez' }, 'Senaryolar'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'secim' }, tumu),
        sth('baslik', 'Senaryo'),
        ekran ? null : sth('ekran', 'Ekran', 'ekran-sutunu'),
        sth('profil', 'Bağlam profili', 'profil-sutunu'),
        sth('beklenen', 'Beklenen', 'beklenen-sutunu'),
        sth('kapsam', 'Kapsam', 'kapsam-sutunu'),
        sth('son', 'Son sonuç', 'son-sutunu'),
        sth('kosuda', 'Koşuda', 'kosuda'),
        h('th', { scope: 'col', class: 'eylemler' }, h('span', { class: 'gorunmez' }, 'Eylemler')))),
      h('tbody', {}, dilim.map((x) => satir(x))));
    yerlestir(tabloAlani, h('section', { class: 'kart senaryo-karti' },
      h('div', { class: 'tablo-kaydirma' }, tablo),
      sayfaSayisi > 1 ? h('div', { class: 'tablo-alti' },
        h('span', {}, `Sayfa ${liste.sayfa + 1} / ${sayfaSayisi} · ${gorunen.length} senaryo`),
        h('span', { class: 'sag' },
          h('button', { type: 'button', class: 'kucuk-dugme', disabled: liste.sayfa === 0, onclick: () => { liste.sayfa--; ciz(); } }, '‹ Önceki'),
          h('button', { type: 'button', class: 'kucuk-dugme', disabled: liste.sayfa + 1 >= sayfaSayisi, onclick: () => { liste.sayfa++; ciz(); } }, 'Sonraki ›'))) : null));
  }

  function satir(x) {
    const kosu = kosuDurumu(x.id);
    const secim = h('input', { type: 'checkbox', 'aria-label': `Seç: ${x.baslik}`, checked: liste.secim.has(x.id) });
    secim.addEventListener('change', () => { if (secim.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); ciz(); });
    const tanimli = tanimliOrtamlar(x, ortamlar);
    const kapsamMetni = kapsamOf(x);
    // Koşuda: ORTAM BAŞINA ayrı anahtar (ortam adıyla etiketli).
    const kosudaHucresi = tanimli.length ? h('div', { class: 'ortam-anahtarlari' }, tanimli.map((o) => {
      const kutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: ortamdaDahil(x, o.id), 'aria-label': `Koşuda (${o.ad}): ${x.baslik}` });
      kutu.addEventListener('change', async () => {
        const yeni = kutu.checked;
        kutu.disabled = true;
        try {
          await api('/platform/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: [x.id], dahil: yeni, ortamId: o.id } });
          const kayit = ortamKaydi(x, o.id);
          if (kayit) kayit.kosuyaDahil = yeni;
          x.kosuyaDahil = (x.ortamlar || []).some((k) => k.kosuyaDahil);
          bildir(yeni ? `Senaryo ${o.ad} ortamında koşuya eklendi.` : `Senaryo ${o.ad} ortamında koşudan çıkarıldı.`);
        } catch (e) {
          kutu.checked = !yeni;
          bildir(`Koşu listesi güncellenemedi: ${e.message}`, 'hata');
        } finally {
          kutu.disabled = false;
          ciz();
        }
      });
      return h('label', { class: 'ortam-anahtari', title: `${o.ad} ortamında koşuda` }, kutu, h('span', { class: 'ortam-adi', 'aria-hidden': 'true' }, o.ad));
    })) : h('span', { class: 'cok-soluk', title: 'Senaryo hiçbir ortamda tanımlı değil' }, '—');
    const bs = x.beklenenSonuc;
    const altBilgi = [
      // Dar ekranda Ekran sütunu gizlenir; ekran adı başlığın altında görünür (yalnız Genel listede).
      !ekran && x.ekranAdi ? h('span', { class: 'ekran-alt-bilgi' }, x.ekranAdi) : null,
      x.akis ? rozet(`akış: ${x.akis.ad}`, '', { kisalt: true, title: 'Senaryonun koştuğu akış (ekranın birden çok akışı var)' }) : null,
      x.paketten ? rozet('paketten', 'vurgu', { title: 'Ekran paketindeki öneriden eklendi' }) : null,
      !x.kosuyaDahil ? rozet('hariç', 'atlanan', { title: 'Hiçbir ortamda koşu listesinde değil — Koşuyu başlat bu senaryoyu koşmaz' }) : null,
      x.ekranEtkin === false ? rozet('ekran devre dışı', 'atlanan', { title: 'Ekran devre dışı: senaryo toplu koşulara girmez; ▷ ile tek başına çalıştırılabilir (Ekranlar > ⋯ > Etkinleştir)' }) : null,
      x.mutlakaGorunmeliSayisi ? rozet(`${x.mutlakaGorunmeliSayisi} zorunlu görünür`, 'durdu', { title: '"Mutlaka görünmeli" işaretli alan sayısı' }) : null,
      // Sabit tarihi geçmiş (ya da bugün koşulursa sınır dışında): seçip "Tarihleri bugüne göre yap…" ile düzeltilir.
      x.eskiyenTarihler?.length ? rozet([ikon('takvim'), 'tarih eskidi'], 'atlanan', {
        title: `${x.eskiyenTarihler.map((e) => `${e.etiket}: ${e.deger} — ${e.mesaj}`).join('\n')}\nSeçip "Tarihleri bugüne göre yap…" ile düzeltin.`
      }) : null
    ].filter(Boolean);
    // Son sonuç: ORTAM BAŞINA nokta + kısa etiket ("TEST ✓ 27.09", "CANLI —"); çalışan ortamda "Çalışıyor / Sırada".
    const kosuOrtami = kosu ? kosuOrtamiId() : null;
    const sonHucre = tanimli.length ? h('div', { class: 'ortam-sonuclari' }, tanimli.map((o) => {
      if (kosu && kosuOrtami === o.id) {
        const metin = kosu.durum === 'calisiyor' ? 'Çalışıyor' : 'Sırada';
        return h('span', { class: 'son-sonuc ortam-sonucu calisiyor', title: `${o.ad}: ${metin}` },
          kosu.durum === 'calisiyor' ? h('span', { class: 'donen-halka', 'aria-hidden': 'true' }) : ikon('saat'),
          h('span', { class: 'etiket' }, o.ad), h('span', { class: 'zaman' }, metin));
      }
      const r = ortamKaydi(x, o.id)?.sonSonuc;
      if (!r) {
        return h('span', { class: 'son-sonuc ortam-sonucu yok', title: `${o.ad}: koşulmadı`, 'aria-label': `${o.ad}: koşulmadı` },
          h('span', { class: 'nokta', 'aria-hidden': 'true' }), h('span', { class: 'etiket' }, o.ad), h('span', { class: 'zaman', 'aria-hidden': 'true' }, '—'));
      }
      const g = SON_DURUM[r.durum] || { etiket: r.durum, sinif: '' };
      const tam = `${o.ad}: ${g.etiket} · ${kisaTarih(r.zaman)}`;
      return h('a', { class: `son-sonuc ortam-sonucu ${g.sinif}`, href: `#/sonuclar/sonuc/${encodeURIComponent(r.sonucId)}`, title: `${tam} — sonuç ayrıntısını aç`, 'aria-label': tam },
        h('span', { class: `nokta ${g.sinif}`, 'aria-hidden': 'true' }), h('span', { class: 'etiket' }, o.ad),
        h('span', { class: 'zaman', 'aria-hidden': 'true' }, `${DURUM_SIMGESI[r.durum] || ''} ${gunAy(r.zaman)}`.trim()));
    })) : h('span', { class: 'son-sonuc yok' }, '—');
    const calistir = kosu
      ? h('button', {
        type: 'button', class: 'ikon-dugme durdur-dugmesi', disabled: Boolean(kosu.durduruluyor), title: kosu.durduruluyor ? 'Durduruluyor…' : 'Durdur',
        'aria-label': `Durdur: ${x.baslik}`, onclick: () => durdur(x.id)
      }, h('span', { class: 'kare', 'aria-hidden': 'true' }))
      : h('button', {
        type: 'button', class: 'ikon-dugme oynat-dugmesi',
        title: x.ekranEtkin === false ? 'Çalıştır (ekran devre dışı: yalnızca tek başına)' : 'Çalıştır',
        'aria-label': `Çalıştır: ${x.baslik}`, onclick: () => tekCalistir(x)
      }, ikon('oynat'));
    return h('tr', { class: [liste.secim.has(x.id) ? 'secili' : '', kosu ? 'calisiyor' : '', x.kosuyaDahil ? '' : 'haric'].join(' ').trim() || null, 'data-senaryo': x.id },
      h('td', { class: 'secim' }, secim),
      h('td', {}, h('div', { class: 'senaryo-adi' }, h('a', { class: 'senaryo-adi-baglantisi', href: `#/senaryolar/duzenle/${encodeURIComponent(x.id)}`, title: 'Senaryoyu aç' }, h('strong', {}, x.baslik)), altBilgi.length ? h('small', {}, altBilgi) : null)),
      ekran ? null : h('td', { class: 'ekran-hucresi' }, x.ekranAdi ? h('span', { class: 'ekran-adi', title: x.ekranAdi }, x.ekranAdi) : '—'),
      h('td', { class: 'profil-sutunu' }, x.baglamProfili
        ? h('span', { class: `profil-hapi ${x.baglamProfili.varsayilan ? 'varsayilan' : ''}`, title: x.baglamProfili.varsayilan ? 'Varsayılan bağlam profili' : 'Bağlam profili' }, ikon('kullanici'), x.baglamProfili.ad || 'varsayılan')
        : h('span', { class: 'cok-soluk' }, '—')),
      h('td', { class: 'beklenen-hucresi' }, bs ? rozet(bs.metin, bs.tur === 'hata' ? 'hata' : 'basari', { title: bs.aciklama }) : h('span', { class: 'cok-soluk' }, '—')),
      h('td', { class: 'kapsam-hucresi', 'data-deger': kapsamMetni },
        rozet(kapsamMetni, tanimli.length ? 'durdu' : 'atlanan', { title: 'Kapsam: senaryonun tanımlı olduğu ortamlar' })),
      h('td', { class: 'son-hucresi' }, sonHucre),
      h('td', { class: 'kosuda' }, kosudaHucresi),
      h('td', { class: 'eylemler' }, h('span', { class: 'satir-eylemleri' },
        calistir,
        h('a', { class: 'dugme ikon-dugme', href: `#/senaryolar/duzenle/${encodeURIComponent(x.id)}`, title: 'Düzenle', 'aria-label': `Düzenle: ${x.baslik}` }, ikon('duzenle')),
        satirMenusu(x))));
  }

  function satirMenusu(x) {
    const dugme = h('button', { type: 'button', class: 'ikon-dugme', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Diğer işlemler: ${x.baslik}`, title: 'Diğer' }, '⋯');
    const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
      h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); kopyala(x); } }, ikon('kopya'), 'Kopyala'),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); gecmisCekmecesi(x); } }, ikon('tarih'), 'Geçmiş'),
      h('button', {
        type: 'button', role: 'menuitem', disabled: !tanimliOrtamlar(x, ortamlar).length || x.modelKosusu === false,
        title: 'Seçilen ortam için çalıştırılabilir tek bir .spec.ts dosyası indirir (gizli değerler ortam değişkeniyle)',
        onclick: () => { kapat(); playwrightKodunaAktar({ projeId: proje.id, senaryo: x, ortamlar: tanimliOrtamlar(x, ortamlar) }); }
      }, ikon('indir'), 'Playwright koduna dışa aktar'),
      h('hr', {}),
      h('button', { type: 'button', role: 'menuitem', class: 'tehlikeli', onclick: () => { kapat(); sil([x]); } }, ikon('cop'), 'Sil'));
    const kap = h('span', { class: 'satir-menusu-kap' }, dugme, menu);
    const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
    function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
    dugme.addEventListener('click', () => {
      if (!menu.hidden) { kapat(); return; }
      menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
      setTimeout(() => document.addEventListener('click', disTik), 0);
      menu.querySelector('button:not(:disabled)')?.focus();
    });
    menu.addEventListener('keydown', (o) => {
      const ogeler = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = ogeler.indexOf(document.activeElement);
      if (o.key === 'Escape') { kapat(); dugme.focus(); }
      else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length]?.focus(); }
      else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length]?.focus(); }
    });
    return kap;
  }

  // --- İşlemler ---
  // Ortam yalnız burada, koşu diyaloğunda seçilir (kosuOnayi: ortam seçimli). Riskli ortam uyarısı diyalogda.
  async function tekCalistir(x) {
    const secenek = tanimliOrtamlar(x, ortamlar);
    if (!secenek.length) { bildir(`"${x.baslik}" hiçbir ortamda tanımlı değil.`, 'hata'); return; }
    let ortam = secenek[0];
    const denetim = await sqlKosuDenetimiAl(proje.id);
    const sqlUyarilari = (o) => sqlKosuUyarilari(denetim, denetim?.ekranSenaryolari, [x], o);
    // Tek, riskli olmayan ortamda tanımlıysa (ve SQL uyarısı yoksa, senaryo tablodan veri almıyorsa) sormadan çalışır; aksi halde
    // ortam (ve tablodan veri alan senaryoda veri koşusu biçimi, tahmini test sayısı) diyalogda seçilir.
    let veriKipi = 'senaryo';
    if (secenek.length > 1 || riskliOrtamMi(ortam) || sqlUyarilari(ortam).length || await veriGrupluMu(x, ortam)) {
      const y = await kosuOnayi({ baslik: 'Senaryoyu çalıştır?', ortamlar: secenek, ortam: surenOrtam(), hesapla: (o) => ({ senaryolar: [x], uyarilar: sqlUyarilari(o) }), tur: 'tekil', esZamanli: true, dugme: 'Çalıştır', veriKosusu: { projeId: proje.id } });
      if (!y) return;
      ortam = y.ortam;
      veriKipi = y.veriKipi;
    }
    kosuBaslat({ projeId: proje.id, ortam, senaryolar: [x], tur: 'tekil', esZamanli: true, baslik: x.baslik, tekBasina: true, veriKipi });
  }

  /** Senaryo bu ortamda tablodan veri alıyor mu (koşu diyaloğunda veri koşusu seçimi gösterilsin)? Hesaplanamazsa hayır. */
  async function veriGrupluMu(x, ortam) {
    try {
      const y = await api('/platform/senaryolar/veri-kosusu-tahmini', { govde: { projeId: proje.id, ortamId: ortam.id, senaryoIdleri: [x.id] } });
      return Boolean(y.gruplu);
    } catch { return false; }
  }

  async function seciliCalistir(secilenler) {
    const calisabilir = secilenler.filter((x) => !kosuDurumu(x.id) && x.ekranEtkin !== false);
    if (!calisabilir.length) return;
    const ilgili = ortamlar.filter((o) => calisabilir.some((x) => ortamKaydi(x, o.id)?.tanimli));
    if (!ilgili.length) { bildir('Seçilen senaryolar hiçbir ortamda tanımlı değil.', 'hata'); return; }
    const denetim = await sqlKosuDenetimiAl(proje.id);
    const y = await kosuOnayi({
      baslik: 'Seçilenleri çalıştır?', ortamlar: ilgili, ortam: surenOrtam(), tur: 'tekil', esZamanli: true, veriKosusu: { projeId: proje.id },
      hesapla: (o) => {
        const k = calisabilir.filter((x) => ortamKaydi(x, o.id)?.tanimli);
        return { senaryolar: k, tanimsizSayisi: calisabilir.length - k.length, uyarilar: sqlKosuUyarilari(denetim, denetim?.ekranSenaryolari, k, o) };
      }
    });
    if (!y) return;
    kosuBaslat({ projeId: proje.id, ortam: y.ortam, senaryolar: y.senaryolar, tur: 'tekil', esZamanli: true, baslik: `${y.senaryolar.length} seçili senaryo`, veriKipi: y.veriKipi });
  }

  async function kosuyuBaslat() {
    const gorunen = gorunenler();
    if (!gorunen.some((x) => x.kosuyaDahil && x.ekranEtkin !== false && !kosuDurumu(x.id))) return;
    const tam = !filtreliMi();
    const kapsam = ekran ? ekran.ad : 'Genel';
    const denetim = await sqlKosuDenetimiAl(proje.id);
    const y = await kosuOnayi({
      baslik: tam ? 'Koşuyu başlat?' : 'Kısmi koşuyu başlat?', ortamlar, ortam: surenOrtam(), tur: tam ? 'tam' : 'tekil', kapsam, esZamanli: false, veriKosusu: { projeId: proje.id },
      // Koşuya o ortamda tanımlı ve o ortamda Koşuda açık senaryolar girer.
      hesapla: (o) => {
        const tanimli = gorunen.filter((x) => ortamKaydi(x, o.id)?.tanimli);
        const kosacak = tanimli.filter((x) => ortamdaDahil(x, o.id) && x.ekranEtkin !== false && !kosuDurumu(x.id));
        return {
          senaryolar: kosacak,
          haricSayisi: tanimli.filter((x) => !ortamdaDahil(x, o.id) || x.ekranEtkin === false).length,
          tanimsizSayisi: gorunen.length - tanimli.length,
          // Veritabanı bu ortamda eşli değilse uyarı (koşu engellenmez; senaryo o SQL adımında kalır).
          uyarilar: sqlKosuUyarilari(denetim, denetim?.ekranSenaryolari, kosacak, o)
        };
      },
      not: tam
        ? (kapsam === 'Genel'
          ? 'Tam koşu olarak kaydedilir; bitince Genel kartlar, Genel trend ve koşulan her ürünün kartları güncellenir.'
          : `Tam koşu olarak kaydedilir; bitince ${kapsam} kartları ve trendi güncellenir (Genel trend değişmez).`)
        : 'Arama ya da filtre etkin: yalnızca listelenenler koşar. Kısmi koşu olarak kaydedilir; kartları ve trendi değiştirmez.'
    });
    if (!y) return;
    kosuBaslat({ projeId: proje.id, ortam: y.ortam, senaryolar: y.senaryolar, tur: tam ? 'tam' : 'tekil', kapsam, esZamanli: false, baslik: tam ? `${kapsam} koşusu` : `${kapsam} (kısmi)`, veriKipi: y.veriKipi });
  }

  /** Toplu Koşuya ekle / çıkar: birden çok ortam varsa hangi ortamda (ya da tüm tanımlı ortamlarda) olduğu sorulur. */
  async function kosuyaDahilEt(secilenler, dahil) {
    const ilgili = ortamlar.filter((o) => secilenler.some((x) => ortamKaydi(x, o.id)?.tanimli));
    if (!ilgili.length) return;
    let ortamId = null;
    if (ilgili.length > 1) {
      const secim = await secenekIste({
        baslik: dahil ? 'Hangi ortamda koşuya eklensin?' : 'Hangi ortamda koşudan çıkarılsın?',
        metin: `${secilenler.length} seçili senaryo. Senaryo seçilen ortamda tanımlı değilse atlanır.`,
        ikonAd: dahil ? 'onay' : 'eksi',
        secenekler: [
          { deger: '*', etiket: 'Tüm ortamlar', aciklama: 'Her senaryonun tanımlı olduğu tüm ortamlarda', ikonAd: 'ag' },
          ...ilgili.map((o) => ({ deger: o.id, etiket: o.ad, aciklama: riskliOrtamMi(o) ? 'Yalnız bu ortamda (Canlı ortam)' : 'Yalnız bu ortamda', ikonAd: 'ag' }))
        ]
      });
      if (secim === null) return;
      ortamId = secim === '*' ? null : secim;
    }
    const ortamAdi = ortamId ? ilgili.find((o) => o.id === ortamId)?.ad : null;
    try {
      const { degisen } = await api('/platform/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: secilenler.map((x) => x.id), dahil, ...(ortamId ? { ortamId } : {}) } });
      bildir(`${degisen} senaryo ${ortamAdi ? `${ortamAdi} ortamında ` : ''}${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'}.`);
      await yenile();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  async function sil(secilenler) {
    const tamam = await onayIste({
      baslik: secilenler.length === 1 ? 'Senaryo silinsin mi?' : `${secilenler.length} senaryo silinsin mi?`,
      metin: 'Senaryo veritabanından silinir; testleri bir sonraki koşuda üretilmez. Geçmiş sonuçlar ve değişiklik geçmişi korunur.',
      liste: secilenler.map((x) => x.baslik), dugme: 'Sil', tehlikeli: true
    });
    if (!tamam) return;
    try {
      const { silinen } = await api('/platform/senaryo/sil', { govde: { projeId: proje.id, idler: secilenler.map((x) => x.id) } });
      for (const x of secilenler) liste.secim.delete(x.id);
      bildir(`${silinen} senaryo silindi.`);
      await yenile();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  async function kopyala(x) {
    try {
      const k = await api('/platform/senaryo/kopyala', { govde: { projeId: proje.id, id: x.id } });
      bildir(`Kopya oluşturuldu: "${k.baslik}" (Koşuda kapalı).`);
      await yenile();
      const tr = tabloAlani.querySelector(`tr[data-senaryo="${CSS.escape(k.id)}"]`);
      tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) { bildir(e.message, 'hata'); }
  }

  ciz();
}

function yeniMenusu(ekranlar) {
  const dugme = h('button', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ikon('arti'), 'Senaryo ekle', ikon('asagi'));
  const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
    h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, 'Ekran modeli olan ekranlar'),
    ekranlar.map((e) => h('button', { type: 'button', role: 'menuitem', onclick: () => { location.hash = `#/senaryolar/yeni/${encodeURIComponent(e.id)}`; } }, ikon('katman'), e.ad)));
  const kap = h('div', { class: 'proje-secici-kap' }, dugme, menu);
  const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
  function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
  dugme.addEventListener('click', () => {
    if (!menu.hidden) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', disTik), 0);
    menu.querySelector('button')?.focus();
  });
  menu.addEventListener('keydown', (o) => { if (o.key === 'Escape') { kapat(); dugme.focus(); } });
  menu.style.setProperty('left', 'auto');
  menu.style.setProperty('right', '0');
  return kap;
}

// ---------------------------------------------------------------------------------------
// Geçmiş çekmecesi
// ---------------------------------------------------------------------------------------

const ISLEM = {
  olustur: { etiket: 'Oluşturuldu', ikon: 'artiYalin' },
  guncelle: { etiket: 'Güncellendi', ikon: 'duzenle' },
  sil: { etiket: 'Silindi', ikon: 'cop' },
  birlestirme_cakismasi: { etiket: 'Birleştirme çakışması', ikon: 'uyari' },
  ice_aktarma_uzerine_yazildi: { etiket: 'İçe aktarmada üzerine yazıldı', ikon: 'yukle' }
};

export async function gecmisCekmecesi(x) {
  const govde = h('div', {}, iskelet('liste'));
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'cekmece', 'aria-labelledby': 'gecmis-baslik' },
    h('div', { class: 'cekmece-ust' }, h('div', {}, h('h2', { id: 'gecmis-baslik' }, 'Değişiklik geçmişi'), h('p', { class: 'soluk' }, x.baslik)), kapat),
    govde);
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  try {
    const { kayitlar, makineler } = await api(`/platform/senaryo/gecmis?id=${encodeURIComponent(x.id)}`);
    const yapanAdi = (y) => {
      const i = String(y).indexOf('@');
      if (i < 0) return y;
      const m = makineler[y.slice(i + 1)];
      return m ? `${y.slice(0, i)} (${m})` : y.slice(0, i);
    };
    yerlestir(govde, kayitlar.length
      ? h('ol', { class: 'gecmis-zaman-cizelgesi' }, kayitlar.map((k) => {
        const g = ISLEM[k.islem] || { etiket: k.islem, ikon: 'isaret' };
        return h('li', { class: k.islem },
          h('span', { class: 'islem-simgesi', 'aria-hidden': 'true' }, ikon(g.ikon)),
          h('div', { class: 'ust' }, h('b', {}, g.etiket), h('span', {}, `${new Date(k.zaman).toLocaleString('tr-TR')} · ${yapanAdi(k.yapan)}`)),
          k.degisenler.length ? h('ul', {}, k.degisenler.map((d) => h('li', {}, d))) : k.islem === 'guncelle' ? h('p', { class: 'soluk kucuk' }, 'İçerik aynı kaldı (yeniden kaydedildi).') : null,
          k.aciklama ? h('p', { class: 'soluk kucuk' }, k.aciklama) : null);
      }))
      : bosDurum('Geçmiş kaydı yok.', null, { ikon: 'tarih' }));
  } catch (e) {
    yerlestir(govde, hataKutusu(e));
  }
}
