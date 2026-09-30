// Platform kabuğu: /platform/durum'a göre yönlendirme.
//   çalışma alanı açık değil → Başlangıç ekranı: çalışma alanı listesi (Aç · ⋯ Yeniden adlandır / Bu bilgisayardan
//                         kaldır) + "Yeni çalışma alanı" (ad adımı → Yedek yükle / Yeni proje başlat)
//   kasa yok            → Hoş geldiniz (açık — henüz kurulmamış — çalışma alanı için aynı seçenekler)
//   kasa var, kilitli   → Kilit ekranı (çalışma alanının adı, "Başka çalışma alanı"; yanlış parolada bekleme)
//   kasa açık, proje yok → Yeni proje sihirbazı (tanışma sorularından; kasa adımı atlanır)
//   kasa açık           → Ana düzen: üst çubuk (marka, proje seçici [projeler, ⋯ Yeniden adlandır / Varsayılan yap /
//                         Sil, + Yeni proje], Sonuçlar | Senaryolar | Ekranlar | Test verisi | Planlı koşular | Ayarlar, sunucu durumu, rehber (?),
//                         tema, Kilitle, çalışma alanı menüsü [Kilitle · Yeniden adlandır · Çalışma alanını kapat]) +
//                         sol panel + içerik.
//                         (#/sonuclar[/...], #/senaryolar[/...], #/ekranlar[/...], #/veri, #/planli-kosular, #/ayarlar/<bölüm>;
//                         Ayarlar'dan taşınan sayfaların eski adresleri ESKI_ADRESLER ile yeni yerlerine yönlenir)
// Senaryolar ekranı (senaryolar.js, senaryo-formu.js, kosu-paneli.js) ve Ekranlar ekranı (ekranlar.js,
// ekran-ortak.js, sayfa-paketi.js, bulgular.js) ayrı modüllerde ve DİNAMİK yüklenir: sunucu bu dosyaları
// henüz sunmuyorsa (eski sürüm çalışıyorsa) yalnızca o sekme hata verir.
import {
  ADRES_YARDIMI, MARKA, adresGecerliMi, alan, alanHatasi, api, bildir, geriSayim, h, ikon, iskelet, logo, mesajKutusu, mesgulIken,
  degisiklikleriBirak, parolaAlani, rozet, s, temaDugmesi, yerlestir
} from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { kurulumSonrasiTanitimIste, rehberAnahtari, rehberBaglaminiAyarla, rehberDugmesi, rehberOtomatikDene, sayfaRehberiBaglantisiKur } from './rehber.js';
import { yedekUyarisiniGoster } from './yedek-uyarisi.js';
import { hizliAramaDugmesi, hizliAramaKisayolu } from './hizli-arama.js';
import { olusturMenusu } from './olustur-menusu.js';
import { cikisKorumasiniKur } from './cikis-korumasi.js';
import { tabloSiralamaKur } from './tablo-siralama.js';
import { aranabilirSecimKur } from './aranabilir-secim.js';
import { ayarlarBolumu, AYAR_BOLUMLERI, ESKI_ADRESLER, UST_SAYFALAR, ustSayfaBolumu } from './ayarlar.js';
import { sonuclarEkrani } from './sonuclar.js';
import { kasayiKilitleSecimli, kilitBildirimi } from './zamanlanmis-kosular.js';
import { adCanliyiCagristiriyorMu, riskliSecimi } from './ortam-riski.mjs';
import { veriKlasoruSatiri } from './veri-klasoru.js';
// Basit / Gelişmiş mod (çalışma alanının ayarı; kayıt yoksa Gelişmiş = bugünkü arayüz): basit-mod.js.
import {
  BASIT_SAYFALAR, VARSAYILAN_MOD, basitSayfaEkrani, gecisAdresi, gelismisBolumuMu, gelismisSayfaNotu, kullanimModuSorusu, kullanimModunuAl,
  modAnahtari, modaGec, modunAnaSayfasi, yeniTestDugmesi
} from './basit-mod.js';

// Çalışma alanı ve proje ⋯ modülleri DİNAMİK yüklenir: eski sürüm bir sunucu (yeniden başlatılmamış) bu dosyaları sunmuyorsa
// kabuk yine açılır, yalnızca bu özellikler görünmez. (Eski sunucunun /platform/durum yanıtında "calismaAlani" alanı yoktur.)
/** @type {null | typeof import('./calisma-alani.js')} */
let alanMod = null;
/** @type {null | typeof import('./proje-islemleri.js')} */
let projeMod = null;
async function modulleriYukle() {
  if (!alanMod) alanMod = await import('./calisma-alani.js').catch(() => null);
  if (!projeMod) projeMod = await import('./proje-islemleri.js').catch(() => null);
}

const kok = document.getElementById('uygulama');
const durum = { sunucu: null, proje: null, projeler: [], varsayilanProjeId: null, kilitMesaji: '', kullanimModu: VARSAYILAN_MOD };
let ekranTemizle = () => {};

function ekran(...icerik) {
  ekranTemizle();
  ekranTemizle = () => {};
  kok.replaceChildren(...icerik);
  const baslik = kok.querySelector('h1');
  if (baslik) { baslik.tabIndex = -1; baslik.focus({ preventScroll: true }); }
}

const anaAlan = (sinif, ...icerik) => h('main', { id: 'ana', class: sinif, tabindex: '-1' }, ...icerik);
const sayfaBasligi = (alt) => { document.title = alt ? `${alt} · ${MARKA.ad}` : `${MARKA.ad} — ${MARKA.altBaslik}`; };

/** Marka bloğu (logo + ad + alt başlık). */
const markaOgesi = () => h('div', { class: 'marka' }, logo(),
  h('span', { class: 'marka-adi' }, MARKA.ad, h('small', {}, MARKA.altBaslik)));

/** Sunucu durumu hapı (canlı nokta + adres). */
function sunucuDurumu() {
  const el = h('div', { class: 'sunucu-durumu', role: 'status', title: `Yerel sunucu çalışıyor (${location.host})` },
    h('span', { class: 'canli-nokta', 'aria-hidden': 'true' }), h('span', { class: 'adres' }, location.host),
    h('span', { class: 'gorunmez' }, 'Sunucu bağlı'));
  el.durumAyarla = (bagli) => {
    el.classList.toggle('kopuk', !bagli);
    el.title = bagli ? `Yerel sunucu çalışıyor (${location.host})` : 'Sunucuya ulaşılamıyor';
    el.lastChild.textContent = bagli ? 'Sunucu bağlı' : 'Sunucuya ulaşılamıyor';
  };
  return el;
}

/** Hoş geldiniz / kilit / sihirbaz için tam sayfa çerçeve. */
function odakSayfa({ ustMetin, alt = true }, main) {
  return h('div', { class: 'odak-sayfa' },
    h('header', { class: 'odak-ust' }, markaOgesi(), ustMetin ? h('span', {}, '·') : null, ustMetin ? h('span', {}, ustMetin) : null,
      h('span', { class: 'bosluk' }), sunucuDurumu(), temaDugmesi()),
    main,
    alt ? h('footer', { class: 'odak-alt' },
      h('span', {}, ikon('kalkan'), 'AES-256 şifreli kasa'),
      h('span', {}, ikon('bilgisayar'), 'Veriler bu bilgisayardan çıkmaz'),
      h('span', {}, ikon('kilit'), 'Hareketsizlikte otomatik kilit')) : null);
}

// ---------------------------------------------------------------------------------------
// Yönlendirme
// ---------------------------------------------------------------------------------------

export async function yonlendir() {
  degisiklikleriBirak();
  let d;
  try {
    d = await api('/platform/durum');
  } catch (hata) {
    sayfaBasligi('Bağlantı yok');
    ekran(odakSayfa({ ustMetin: 'bağlantı yok', alt: false }, anaAlan('ortali dar',
      h('div', { class: 'kart kilit-kart' },
        h('div', { class: 'kilit-baslik' }, h('span', { class: 'kilit-ikon' }, ikon('ag')), h('h1', {}, 'Sunucuya ulaşılamadı'), h('p', { class: 'soluk' }, hata.message)),
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'birincil', onclick: () => yonlendir() }, ikon('yenile'), 'Tekrar dene'))))));
    return;
  }
  durum.sunucu = d;
  await modulleriYukle();
  // Açık çalışma alanı yok (kapatıldı / ilk kurulum) → başlangıç ekranı. Sabit veritabanıyla (PLATFORM_VERITABANI)
  // başlatılan sunucuda çalışma alanı her zaman açıktır. (undefined = eski sunucu: tek veritabanı gibi davranılır.)
  if (d.calismaAlani === null && alanMod) { baslangicEkrani(); return; }
  if (!d.kasa.olusturuldu) { hosgeldin(); return; }
  if (!d.kasa.acik) { kilitEkrani(d.parolaBeklemeSaniye); return; }
  const { projeler, varsayilanId } = await api('/platform/projeler');
  durum.projeler = projeler;
  durum.varsayilanProjeId = varsayilanId || null;
  durum.kullanimModu = await kullanimModunuAl();
  if (!projeler.length) { sihirbaz('proje'); return; }
  let secili = null;
  try { secili = localStorage.getItem(seciliProjeAnahtari()); } catch { secili = null; }
  durum.proje = projeler.find((p) => p.id === secili) || projeler.find((p) => p.id === durum.varsayilanProjeId) || projeler[0];
  anaDuzen();
}

/** Seçili proje çalışma alanı başına hatırlanır (başka çalışma alanının proje kimliği karışmasın). */
const seciliProjeAnahtari = () => `platform.seciliProje.${durum.sunucu && durum.sunucu.calismaAlani ? durum.sunucu.calismaAlani.id : '-'}`;

export function projeSec(id) {
  const p = durum.projeler.find((x) => x.id === id);
  if (!p) return;
  durum.proje = p;
  try { localStorage.setItem(seciliProjeAnahtari(), id); } catch { /* yok sayılır */ }
}

/**
 * Başka projeye geç: Sonuçlar / Senaryolar / Ekranlar / Ayarlar yeni projeyle yeniden yüklenir. Açık ayrıntı adresi (ör. bir
 * koşu ya da senaryo) önceki projeye ait olduğundan bölümün köküne dönülür.
 */
export function projeyeGec(id) {
  projeSec(id);
  const bolum = (location.hash || '#/sonuclar').split('/')[1] || 'sonuclar';
  location.hash = bolum === 'ayarlar' ? `#/ayarlar/${(location.hash.split('/')[2] || 'proje')}` : `#/${bolum}`;
  location.reload();
}

export async function projeleriYenile() {
  const { projeler, varsayilanId } = await api('/platform/projeler');
  durum.projeler = projeler;
  durum.varsayilanProjeId = varsayilanId || null;
  durum.proje = projeler.find((p) => durum.proje && p.id === durum.proje.id) || projeler[0] || null;
  const rozet = document.getElementById('proje-rozeti');
  if (rozet && durum.proje) {
    rozet.textContent = durum.proje.ad;
    const avatar = document.querySelector('.proje-secici .avatar');
    if (avatar) avatar.textContent = basHarf(durum.proje.ad);
  }
}

window.addEventListener('kasa-kilitli', (olay) => {
  // Otomatik kilitlenme sonrası gelen 423 de buraya düşer.
  durum.kilitMesaji = olay.detail || 'Kasa kilitli.';
  kilitEkrani(0);
});

// Nöbetçi yeniden başlatıldı (her başlatmada oturum token'ı değişir → bu sekmenin istekleri 401 alır): sekmedeki arayüz
// kodu eski olabilir ve istekler artık geçmez. Sayfanın üstünde yenileme bandı gösterilir (kendiliğinden yenilenmez: açık
// formdaki bilgi kullanıcının gözü önünde kalsın).
window.addEventListener('sunucu-yenilendi', () => {
  if (document.querySelector('.yenileme-bandi')) return;
  const bant = h('div', { class: 'yenileme-bandi', role: 'alert' },
    h('span', { class: 'bant-simge', 'aria-hidden': 'true' }, ikon('yenile')),
    h('div', { class: 'bant-metin' }, h('b', {}, 'Nöbetçi yeniden başlatıldı veya güncellendi'),
      h('span', {}, 'Bu sekme eski oturumu kullanıyor; devam etmek için sayfayı yenileyin.')),
    h('div', { class: 'dugmeler' },
      h('button', { type: 'button', class: 'birincil kucuk-dugme', onclick: () => location.reload() }, ikon('yenile'), 'Sayfayı yenile'),
      h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Uyarıyı kapat', title: 'Kapat', onclick: () => bant.remove() }, ikon('carpi'))));
  document.body.prepend(bant);
});

const basHarf = (ad) => (String(ad || '?').trim()[0] || '?').toLocaleUpperCase('tr');

// ---------------------------------------------------------------------------------------
// Hoş geldiniz
// ---------------------------------------------------------------------------------------

function radar() {
  return s('svg', { class: 'radar', viewBox: '0 0 560 560', 'aria-hidden': 'true' },
    s('defs', {},
      s('radialGradient', { id: 'radar-dolgu' }, s('stop', { offset: '0', 'stop-color': 'var(--vurgu)', 'stop-opacity': '.18' }), s('stop', { offset: '1', 'stop-color': 'var(--vurgu)', 'stop-opacity': '0' })),
      s('linearGradient', { id: 'radar-tarama', x1: '0', x2: '1' }, s('stop', { offset: '0', 'stop-color': 'var(--vurgu)', 'stop-opacity': '0' }), s('stop', { offset: '1', 'stop-color': 'var(--vurgu)', 'stop-opacity': '.22' }))),
    s('circle', { cx: 280, cy: 160, r: 150, fill: 'url(#radar-dolgu)' }),
    s('g', { fill: 'none', stroke: 'var(--vurgu)', 'stroke-opacity': '.16' },
      s('circle', { cx: 280, cy: 160, r: 70 }), s('circle', { cx: 280, cy: 160, r: 115 }),
      s('circle', { cx: 280, cy: 160, r: 160, 'stroke-dasharray': '2 6' }), s('circle', { cx: 280, cy: 160, r: 210, 'stroke-opacity': '.08' })),
    s('path', { class: 'tarama', d: 'M280 160 L440 160 A160 160 0 0 0 393 47 Z', fill: 'url(#radar-tarama)' }),
    s('circle', { cx: 372, cy: 98, r: 3, fill: 'var(--basari-dolgu)' }), s('circle', { cx: 178, cy: 226, r: 2.5, fill: 'var(--vurgu)' }),
    s('circle', { cx: 355, cy: 262, r: 2.5, fill: 'var(--vurgu-2)' }));
}

function secimKarti({ sinif = '', ikonAd, no, baslik, aciklama, altIkon, altMetin, altSinif, git, onerilen, onclick }) {
  return h('button', { type: 'button', class: `secim-karti ${sinif} ${onerilen ? 'onerilen' : ''}`.trim(), onclick, 'data-kisayol': String(no) },
    onerilen ? h('span', { class: 'onerilen-rozeti', 'aria-hidden': 'true' }, 'ÖNERİLEN') : null,
    h('span', { class: 'kart-ust' }, h('span', { class: 'kart-ikon' }, ikon(ikonAd)), h('kbd', { 'aria-hidden': 'true' }, String(no))),
    h('strong', {}, baslik),
    onerilen ? h('span', { class: 'gorunmez' }, ' (önerilen)') : null,
    h('span', { class: 'aciklama' }, aciklama),
    h('span', { class: 'kart-alt' }, ikon(altIkon), h('span', { class: altSinif || null }, altMetin), h('span', { class: 'git', 'aria-hidden': 'true' }, git, ikon('ok'))));
}

/**
 * Karşılamada kavram ilişkisi: tek cümle + küçük şema "Çalışma alanı (kasa) › Proje › Ortam". Şema görsel; ekran okuyucu
 * aynı bilgiyi cümleden ve listenin metninden alır.
 */
function kavramSemasi() {
  const kutu = (ad, ek, ikonAd) => h('li', { class: 'kavram-kutusu' }, ikon(ikonAd), h('b', {}, ad), ek ? h('span', { class: 'soluk' }, ` ${ek}`) : null);
  const ok = () => h('li', { class: 'kavram-oku', 'aria-hidden': 'true' }, '›');
  return h('div', { class: 'kavram-semasi' },
    h('p', { class: 'kucuk soluk' }, 'Çalışma alanı, kendi kasa parolasıyla şifrelenen ayrı bir veri kutusudur (kasa); içinde projeleriniz, her projede de testlerin çalışacağı ortamlar (ör. TEST) bulunur.'),
    h('ol', { class: 'kavram-listesi', 'aria-label': 'Çalışma alanı, proje ve ortam ilişkisi' },
      kutu('Çalışma alanı', '(kasa)', 'kilit'), ok(), kutu('Proje', '', 'katman'), ok(), kutu('Ortam', '(TEST, CANLI…)', 'ag')));
}

/** Yedek yükle / Yeni proje başlat kartları. yeniAlan: önce çalışma alanı adı sorulur. */
function baslangicKartlari(yeniAlan) {
  const once = (amac, fn) => (yeniAlan && alanMod ? () => alanMod.yeniAlanDiyalogu({
    amac,
    devam: (alan) => {
      // Yeni (boş) çalışma alanı açıldı: kabuk durumu güncellenir (sihirbaz/yedek ekranı adını gösterir).
      if (durum.sunucu) durum.sunucu = { ...durum.sunucu, calismaAlani: { id: alan.id, ad: alan.ad, sabit: false } };
      durum.projeler = [];
      durum.proje = null;
      fn();
    }
  }) : fn);
  return [
    secimKarti({
      ikonAd: 'yukle', no: 1, baslik: 'Yedek yükle', onclick: once('yedek dosyasını seçmek', () => yedekYukleEkrani()),
      aciklama: yeniAlan
        ? 'Bir .tayedek dosyasını YENİ bir çalışma alanına yükleyin. Yedeğin parolası bu çalışma alanının kasa parolası olur.'
        : 'Başka bir bilgisayardan aldığınız .tayedek dosyasını yükleyin. Yedeğin parolası bu bilgisayarın kasa parolası olur.',
      altIkon: 'dosya', altMetin: '.tayedek · şifreli', git: 'Seç'
    }),
    secimKarti({
      sinif: 'k-basari', ikonAd: 'arti', no: 2, baslik: 'Yeni proje başlat', onerilen: !yeniAlan, onclick: once('kasa parolası ve proje', () => sihirbaz('kasa', 'ilk')),
      aciklama: 'Kasa parolası belirleyin, projenizi ve test ortamlarınızı tanımlayın.',
      altIkon: 'saat', altMetin: 'yaklaşık 3 dakika', git: 'Başla'
    })
  ];
}

/** 1/2 kısayolları (yazı alanında değilken). */
function kartKisayollari() {
  const kisayol = (olay) => {
    if (olay.altKey || olay.ctrlKey || olay.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.querySelector('dialog[open]')) return;
    const kart = kok.querySelector(`.secim-karti[data-kisayol="${olay.key}"]`);
    if (kart) { olay.preventDefault(); kart.click(); }
  };
  document.addEventListener('keydown', kisayol);
  ekranTemizle = () => document.removeEventListener('keydown', kisayol);
}

/**
 * BAŞLANGIÇ EKRANI (açık çalışma alanı yok): üstte bu bilgisayardaki çalışma alanları, altta "Yeni çalışma alanı".
 */
async function baslangicEkrani() {
  history.replaceState(null, '', '/');
  sayfaBasligi('Hoş geldiniz');
  let liste = { alanlar: [] };
  try { liste = await api('/platform/calisma-alanlari'); } catch (hata) { bildir(hata.message, 'hata'); }
  const alanlar = liste.alanlar || [];
  const listeBolumu = alanMod.alanListesi(alanlar, { acildi: () => { location.hash = ''; yonlendir(); }, yenile: () => baslangicEkrani() });
  ekran(odakSayfa({ ustMetin: alanlar.length ? 'çalışma alanları' : 'ilk kurulum' }, anaAlan('karsilama baslangic',
    radar(),
    h('span', { class: 'buyuk-logo', 'aria-hidden': 'true' }, s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }), s('circle', { cx: 12, cy: 12, r: 2.6 }))),
    h('span', { class: 'ust-hap' }, h('span', { class: 'nokta vurgu', 'aria-hidden': 'true' }),
      alanlar.length ? `Bu bilgisayarda ${alanlar.length} çalışma alanı var` : 'Bu bilgisayarda henüz bir çalışma alanı yok'),
    h('h1', {}, `${MARKA.yonelme} `, h('span', { class: 'parlak' }, 'hoş geldiniz')),
    h('p', { class: 'giris' }, alanlar.length
      ? 'Bir çalışma alanını kendi kasa parolasıyla açın ya da yeni bir çalışma alanı oluşturun. Her çalışma alanının verisi ayrı ve şifreli kalır.'
      : 'Test senaryolarınızı çalıştırın, sonuçları izleyin, hataları kalıplara ayırın. Her şey bu bilgisayarda, şifreli bir kasada kalır. Başlamak için bir seçenek belirleyin.'),
    kavramSemasi(),
    listeBolumu,
    h('div', { class: 'yeni-alan-baslik' }, h('h2', {}, alanlar.length ? 'Yeni çalışma alanı' : 'Başlayın'),
      h('span', { class: 'kucuk cok-soluk' }, 'Önce çalışma alanına bir ad verirsiniz (kilit açılmadan önce görünür).')),
    h('div', { class: 'secim-kartlari' }, baslangicKartlari(true)),
    veriKlasoruSatiri())));
  kartKisayollari();
}

/** Başlangıç ekranına dön: açık (henüz kurulmamış ya da kilitli) çalışma alanı kapatılır. */
async function baskaCalismaAlani(dugme) {
  try {
    await mesgulIken(dugme, 'Kapatılıyor…', () => api('/platform/calisma-alani/kapat', { govde: {}, kilitOlayiYok: true }));
  } catch (hata) { bildir(hata.message, 'hata'); return; }
  location.hash = '';
  yonlendir();
}

/** HOŞ GELDİNİZ: çalışma alanı açık ama kasası yok (yeni çalışma alanı ya da tek veritabanı kurulumu). */
async function hosgeldin() {
  history.replaceState(null, '', '/');
  sayfaBasligi('Hoş geldiniz');
  const alan = durum.sunucu && durum.sunucu.calismaAlani;
  const cokluAlan = alan && !alan.sabit;
  const geri = cokluAlan ? h('button', { type: 'button', class: 'hayalet baska-alan', onclick: (o) => baskaCalismaAlani(o.currentTarget) }, ikon('geri'), 'Başlangıç ekranı') : null;
  ekran(odakSayfa({ ustMetin: cokluAlan ? `çalışma alanı: ${alan.ad}` : 'ilk kurulum' }, anaAlan('karsilama',
    radar(),
    h('span', { class: 'buyuk-logo', 'aria-hidden': 'true' }, s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }), s('circle', { cx: 12, cy: 12, r: 2.6 }))),
    h('span', { class: 'ust-hap' }, h('span', { class: 'nokta vurgu', 'aria-hidden': 'true' }), cokluAlan ? `"${alan.ad}" çalışma alanında henüz proje yok` : 'Bu bilgisayarda henüz bir proje yok'),
    h('h1', {}, `${MARKA.yonelme} `, h('span', { class: 'parlak' }, 'hoş geldiniz')),
    h('p', { class: 'giris' }, 'Test senaryolarınızı çalıştırın, sonuçları izleyin, hataları kalıplara ayırın. Her şey bu bilgisayarda, şifreli bir kasada kalır. Başlamak için bir seçenek belirleyin.'),
    kavramSemasi(),
    h('div', { class: 'secim-kartlari' }, baslangicKartlari(false)),
    veriKlasoruSatiri(),
    geri ? h('div', { class: 'dugmeler ortala ust-bosluk' }, geri) : null)));
  kartKisayollari();
}

function yedekYukleEkrani() {
  const kapsayici = h('div', {});
  sayfaBasligi('Yedek yükle');
  ekran(odakSayfa({ ustMetin: 'yedekten kurulum' }, anaAlan('ortali genis', h('h1', { class: 'gorunmez' }, 'Yedek yükle'), kapsayici)));
  iceAktarmaAkisi(kapsayici, { mod: 'hosgeldin', bitti: () => { location.hash = '#/ayarlar/proje'; yonlendir(); }, vazgec: () => hosgeldin() });
}

// ---------------------------------------------------------------------------------------
// Yeni proje sihirbazı
// ---------------------------------------------------------------------------------------

// İki kip: 'ilk' (kasa parolası → proje → ortamlar → izinler → giriş sorusu → tamam; yeni çalışma alanı) ve 'ek' (AYNI kasada
// yeni proje: proje → ortamlar → giriş sorusu → tamam; üst çubuktaki proje seçici > "+ Yeni proje"). Giriş profili / tarifinin
// AYRINTISI sihirbazda sorulmaz (Ayarlar > Giriş profilleri, ortam başına); yalnız isteğe bağlı "Uygulamanız giriş istiyor mu?"
// sorusu vardır (Evet → bitince giriş tarifi sayfası; Hayır → Başlarken'de "Girişe gerek yok"; Sonra → bugünkü davranış). Soru
// kendi başına bir adımdır (SORU_ADIMLARI): ileride eklenecek başka isteğe bağlı sorular (ör. basit / gelişmiş kullanım) aynı yere
// kendi adımı olarak girer. Eski "Sizi tanıyalım" adımı kaldırıldı: tek sorusu (hangi ortamlar) Ortamlar adımında
// satır eklenerek zaten cevaplanıyordu; cevabı yalnız bellekteydi (kalıcı bir kaydı yoktu).
/** İsteğe bağlı soru adımları (sırayla; Ortamlar / İzinler'den sonra, Tamam'dan önce). */
// "Kullanım" (Basit / Gelişmiş) çalışma alanının ayarıdır: yalnız ilk kurulumda sorulur (aynı kasada yeni projede sorulmaz).
const SORU_ADIMLARI = [{ ad: 'modSorusu', etiket: 'Kullanım' }, { ad: 'girisSorusu', etiket: 'Giriş' }];
const ILK_ADIMLAR = [
  { ad: 'kasa', etiket: 'Kasa parolası' },
  { ad: 'proje', etiket: 'Proje' },
  { ad: 'ortamlar', etiket: 'Ortamlar' },
  { ad: 'izinler', etiket: 'İzinler' },
  ...SORU_ADIMLARI,
  { ad: 'tamam', etiket: 'Tamam' }
];
// Aynı kasada yeni proje: kasa parolası ve izinler (kasa başına; zaten verilmiş kararlar) sorulmaz.
const EK_ADIMLAR = ILK_ADIMLAR.filter((a) => a.ad !== 'kasa' && a.ad !== 'izinler' && a.ad !== 'modSorusu');
let sihirbazModu = 'ilk';
const sihirbazAdimlari = () => (sihirbazModu === 'ek' ? EK_ADIMLAR : ILK_ADIMLAR);
/** Sıradaki soru adımı yalnız bu kipin adımlarından (ek kipte "Kullanım" sorulmaz). */
const kiptekiSorular = () => SORU_ADIMLARI.filter((a) => sihirbazAdimlari().some((x) => x.ad === a.ad));

function adimListesi(aktif) {
  const adimlar = sihirbazAdimlari();
  const aktifSira = adimlar.findIndex((a) => a.ad === aktif);
  return h('ol', { class: 'adimlar', 'aria-label': 'Sihirbaz adımları' },
    adimlar.map((a, i) => h('li', {
      class: i < aktifSira ? 'tamam' : null,
      'aria-current': a.ad === aktif ? 'step' : null
    }, a.etiket, i < aktifSira ? h('span', { class: 'gorunmez' }, ' (tamamlandı)') : null)));
}

const sihirbazBasligi = () => (sihirbazModu === 'ek' ? 'Yeni proje' : 'Yeni proje başlat');
const sihirbazUstMetni = () => {
  const alan = durum.sunucu && durum.sunucu.calismaAlani;
  return alan && !alan.sabit ? `yeni proje · ${alan.ad}` : 'yeni proje';
};

function sihirbazEkrani(adim, baslik, altMetin, ...icerik) {
  const adimlar = sihirbazAdimlari();
  const sira = adimlar.findIndex((a) => a.ad === adim) + 1;
  sayfaBasligi(baslik);
  ekran(odakSayfa({ ustMetin: sihirbazUstMetni() }, anaAlan('ortali sihirbaz-alani',
    h('div', { class: 'sihirbaz-baslik' },
      h('div', { class: 'kirinti' }, h('span', {}, `Adım ${sira} / ${adimlar.length}`)),
      h('h1', {}, baslik), altMetin ? h('p', { class: 'soluk' }, altMetin) : null),
    adimListesi(adim), ...icerik)));
}

/** @param {string} adim @param {'ilk' | 'ek'} [mod] */
export function sihirbaz(adim, mod) {
  history.replaceState(null, '', '/');
  if (mod) sihirbazModu = mod;
  else if (adim === 'kasa' || !durum.projeler.length) sihirbazModu = 'ilk';
  // Eski "tanisma" adımı (kaldırıldı; eski çağrı / yer imi): sihirbazın ilk adımına düşer.
  if (adim === 'tanisma') return sihirbazModu === 'ilk' && kasaYok() ? sihirbazKasa() : sihirbazProje();
  if (adim === 'kasa') return kasaYok() ? sihirbazKasa() : sihirbazProje();
  if (adim === 'proje') return sihirbazProje();
  if (adim === 'ortamlar') return sihirbazOrtamlar();
  if (adim === 'izinler' && sihirbazModu === 'ilk') return sihirbazIzinler();
  if (adim === 'modSorusu' && sihirbazModu === 'ilk') return sihirbazModSorusu();
  if (adim === 'girisSorusu') return sihirbazGirisSorusu();
  // Eski "giris" adımı kaldırıldı: bu adla gelen çağrı (eski yer imi / kayıtlı durum) hata vermeden özet sayfasına düşer.
  return sihirbazTamam();
}

/** Soru adımı adı → ekranı. */
const SORU_EKRANLARI = { modSorusu: () => sihirbazModSorusu(), girisSorusu: () => sihirbazGirisSorusu() };
/**
 * Sıradaki isteğe bağlı soru adımı (onceki verilmezse ilk soru; Ortamlar / İzinler'den sonra çağrılır); soru kalmadıysa Tamam.
 * @param {string} [onceki]
 */
function sorulardanSonra(onceki) {
  const sorular = kiptekiSorular();
  const sonraki = sorular[onceki ? sorular.findIndex((a) => a.ad === onceki) + 1 : 0];
  const ekran = sonraki && SORU_EKRANLARI[sonraki.ad];
  return ekran ? ekran() : sihirbazTamam();
}

/** Sihirbazda verilen isteğe bağlı cevaplar (yalnız bu kurulum için; kalıcı karar Başlarken işaretinde / ilgili ekranda). */
const sihirbazCevaplari = { giris: /** @type {'evet' | 'hayir' | 'sonra'} */ ('sonra'), mod: /** @type {'basit' | 'gelismis'} */ ('basit') };

/**
 * KULLANIM (yalnız ilk kurulum): Basit — ilk kez kullanıyorum / Gelişmiş — tüm özellikler. Seçim çalışma alanının ayarı olarak kasaya
 * yazılır (basit-mod.js > kullanimModuSorusu); Tamam'daki "Ana sayfaya geç" seçilen modun açılış sayfasına gider.
 */
function sihirbazModSorusu() {
  const { form, odak } = kullanimModuSorusu({
    secili: sihirbazCevaplari.mod,
    devam: (mod) => {
      sihirbazCevaplari.mod = mod;
      durum.kullanimModu = { ...durum.kullanimModu, mod, kayitli: true };
      sorulardanSonra('modSorusu');
    }
  });
  sihirbazEkrani('modSorusu', sihirbazBasligi(), 'Nöbetçi\'yi ilk kez kullanıyorsanız Basit mod yalnız gerekenleri gösterir. Seçiminizi üst çubuktan her an değiştirebilirsiniz.', form);
  odak.focus();
}

/**
 * GİRİŞ SORUSU (isteğe bağlı): "Uygulamanız giriş istiyor mu?" Evet → Tamam'da birincil düğme giriş tarifi sayfasını açar;
 * Hayır → projenin Başlarken listesinde "Girişe gerek yok" işaretlenir (kasada; oradan geri alınır); Sonra → bugünkü davranış.
 */
function sihirbazGirisSorusu() {
  const ad = yeniKimlikAdi('giris-sorusu');
  const secenek = (deger, baslik, aciklama) => {
    const r = h('input', { type: 'radio', name: ad, value: deger, id: `${ad}-${deger}`, checked: sihirbazCevaplari.giris === deger });
    return { r, el: h('label', { class: 'onay-satiri giris-sorusu-secenegi', for: r.id }, r, h('span', {}, h('b', {}, baslik), h('small', { class: 'blok soluk' }, aciklama))) };
  };
  const secenekler = [
    secenek('evet', 'Evet, giriş sayfası var', 'Kurulum bitince giriş tarifi sayfası açılır: girişi bir kez gösterirsiniz, testler aynı yoldan girer.'),
    secenek('hayir', 'Hayır, giriş gerekmiyor', 'Başlarken listesinde giriş adımı "Girişe gerek yok" olarak işaretlenir (oradan geri alabilirsiniz).'),
    secenek('sonra', 'Emin değilim, sonra karar vereceğim', 'Giriş tarifini istediğiniz zaman Ayarlar > Giriş profilleri\'nden tanımlarsınız.')
  ];
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Devam', ikon('ok'));
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('anahtar'), 'Uygulamanız giriş istiyor mu?')),
    mesaj.kutu,
    h('fieldset', { class: 'giris-sorusu' }, h('legend', { class: 'gorunmez' }, 'Uygulamanız giriş istiyor mu?'), secenekler.map((x) => x.el)),
    h('div', { class: 'dugmeler' }, gonder));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    const cevap = /** @type {'evet' | 'hayir' | 'sonra'} */ ((secenekler.find((x) => x.r.checked) || secenekler[2]).r.value);
    try {
      // Hayır: Başlarken'de "Girişe gerek yok" (kasada proje işareti). Evet / Sonra: işaret kaldırılmaz (geri dönülürse temizlenir).
      if (durum.proje && (cevap === 'hayir' || sihirbazCevaplari.giris === 'hayir')) {
        await mesgulIken(gonder, 'Kaydediliyor…', () => api('/platform/baslarken/kaydet', { govde: { projeId: durum.proje.id, girisGerekmez: cevap === 'hayir' } }));
      }
      sihirbazCevaplari.giris = cevap;
      sorulardanSonra('girisSorusu');
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('girisSorusu', sihirbazBasligi(), 'İsteğe bağlı. Testlerin uygulamanıza girip girmeyeceğini şimdi söyleyebilirsiniz; cevabınıza göre sıradaki adım gösterilir.', form);
  (secenekler.find((x) => x.r.checked) || secenekler[0]).r.focus();
}

/** Kasa henüz oluşturulmadı mı (yeni çalışma alanı / ilk kurulum)? */
const kasaYok = () => !(durum.sunucu && durum.sunucu.kasa && durum.sunucu.kasa.olusturuldu);

let adSayaci = 0;
const yeniKimlikAdi = (onEk) => `${onEk}-${++adSayaci}`;

function sihirbazKasa() {
  const p1 = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'new-password', yardim: 'En az 8 karakter. Tüm gizli bilgiler (parolalar, anahtarlar, adresler) bu parolayla şifrelenir.' });
  const p2 = parolaAlani('Kasa parolası (tekrar)', { zorunlu: true, otomatik: 'new-password' });
  const anladim = h('input', { type: 'checkbox', id: 'parola-anladim' });
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kasayı oluştur ve devam et', ikon('ok'));
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('kilit'), 'Kasa parolası belirleyin')),
    h('div', { class: 'not-kutusu uyari' },
      h('p', {}, h('strong', {}, 'Bu parolayı unutmayın. '), 'Parola unutulursa veriler kurtarılamaz; parolanın bir kopyası hiçbir yerde saklanmaz.')),
    mesaj.kutu, p1.kapsayici, p2.kapsayici,
    h('label', { class: 'secenek', for: 'parola-anladim' }, anladim, 'Parolayı unutursam verilerin kurtarılamayacağını anladım.'),
    h('div', { class: 'dugmeler' }, gonder, h('button', { type: 'button', class: 'hayalet', onclick: () => hosgeldin() }, ikon('geri'), 'Geri')));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    alanHatasi(p1.girdi, ''); alanHatasi(p2.girdi, '');
    if ([...p1.girdi.value].length < 8) { alanHatasi(p1.girdi, 'Parola en az 8 karakter olmalıdır.'); p1.girdi.focus(); return; }
    if (p1.girdi.value !== p2.girdi.value) { alanHatasi(p2.girdi, 'Parolalar aynı değil.'); p2.girdi.focus(); return; }
    if (!anladim.checked) { mesaj.goster('Devam etmek için parolanın kurtarılamayacağını onaylayın.'); anladim.focus(); return; }
    try {
      await mesgulIken(gonder, 'Kasa oluşturuluyor…', () => api('/platform/kasa/olustur', { govde: { parola: p1.girdi.value } }));
      p1.girdi.value = ''; p2.girdi.value = '';
      if (durum.sunucu) durum.sunucu = { ...durum.sunucu, kasa: { ...(durum.sunucu.kasa || {}), olusturuldu: true, acik: true } };
      durum.kullanimModu = VARSAYILAN_MOD;
      sihirbazProje();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  const alan = durum.sunucu && durum.sunucu.calismaAlani;
  sihirbazEkrani('kasa', 'Yeni proje başlat', alan && !alan.sabit
    ? `Önce "${alan.ad}" çalışma alanının şifreli kasası için bir parola belirleyin (her çalışma alanının kendi parolası vardır).`
    : 'Önce bu bilgisayardaki şifreli kasanın parolasını belirleyin.', form);
}

function sihirbazProje() {
  sihirbazCevaplari.giris = 'sonra';
  // Kullanım sorusunda önce seçili: kayıtlı mod (varsa), yoksa Basit (yeni çalışma alanı).
  sihirbazCevaplari.mod = durum.kullanimModu.kayitli ? durum.kullanimModu.mod : 'basit';
  const ad = h('input', { type: 'text', autocomplete: 'off', required: true, maxlength: '120' });
  const aciklama = h('textarea', { rows: '3', maxlength: '1000' });
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Devam', ikon('ok'));
  const vazgec = sihirbazModu === 'ek' && durum.projeler.length
    ? h('button', { type: 'button', class: 'hayalet', onclick: () => { location.hash = '#/sonuclar'; yonlendir(); } }, 'Vazgeç') : null;
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('katman'), 'Proje bilgileri')), mesaj.kutu,
    alan('Proje adı', ad, { zorunlu: true }),
    alan('Açıklama', aciklama, { yardim: 'İsteğe bağlı.' }),
    h('div', { class: 'dugmeler' }, gonder, vazgec));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Proje adı boş olamaz.'); ad.focus(); return; }
    try {
      const { proje } = await mesgulIken(gonder, 'Kaydediliyor…', () => api('/platform/proje/kaydet', { govde: { ad: ad.value, aciklama: aciklama.value } }));
      durum.proje = proje;
      durum.projeler = [...durum.projeler.filter((p) => p.id !== proje.id), proje];
      projeSec(proje.id);
      sihirbazOrtamlar();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('proje', sihirbazBasligi(), sihirbazModu === 'ek'
    ? 'Bu çalışma alanında (aynı kasa parolasıyla) yeni bir proje oluşturun. Projenize bir ad verin; açıklama isteğe bağlıdır.'
    : 'Projenize bir ad verin; açıklama isteğe bağlıdır.', form);
  ad.focus();
}

/**
 * ORTAMLAR: satır = × | Ortam adı | Adres | Ortam türü (Test / Canlı). TEST (ilk satır) zorunludur, türü Test'tir ve kaldırılamaz.
 * Eklenen satırda "Ortam türü" ZORUNLU seçimdir (seçilmeden kaydedilmez; saklama: riskli true = Canlı, false = Test); adı canlıyı
 * çağrıştıran ortama Test yalnızca onayla kaydedilir. Kaydedilen her satırın kimliği saklanır: bir satır sunucuda reddedilip form yeniden gönderilirse
 * önceki satırlar YENİDEN oluşturulmaz, güncellenir (yinelenen ortam olmaz). Kayıttan sonra liste sunucudan okunup her satırın
 * gerçekten kaydedildiği (ad + ortam türü) doğrulanır.
 */
function sihirbazOrtamlar() {
  /** @type {Array<{ ad: HTMLInputElement; adres: HTMLInputElement; zorunlu: boolean; test: HTMLInputElement; canli: HTMLInputElement; turHatasi: HTMLElement; tur: () => boolean | null; id: string | null; el: HTMLElement }>} */
  const satirlar = [];
  const liste = h('div', { class: 'ortam-satirlari' });
  const ortamSatiri = (zorunlu, ilkAd = '', canliMi = false) => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: zorunlu ? 'TEST' : ilkAd });
    const adres = h('input', { type: 'url', autocomplete: 'off', placeholder: 'https://test.uygulamaniz.example/', inputmode: 'url' });
    // Ortam türü: Test / Canlı (radyo). TEST satırı sabit Test; eklenen satırda seçim zorunlu (önceden seçili gelmez).
    const turAdi = yeniKimlikAdi('ortam-turu');
    const test = h('input', { type: 'radio', name: turAdi, value: 'test', id: `${turAdi}-test`, checked: zorunlu, disabled: zorunlu });
    const canli = h('input', { type: 'radio', name: turAdi, value: 'canli', id: `${turAdi}-canli`, checked: !zorunlu && canliMi, disabled: zorunlu });
    const turHatasi = h('p', { class: 'alan-hatasi', role: 'alert' });
    /** @type {any} */
    const satir = { ad, adres, zorunlu, test, canli, turHatasi, tur: () => (zorunlu ? false : canli.checked ? true : test.checked ? false : null), id: null, el: null };
    // TEST satırında × yerine kilit işareti: sütun boş kalıp satır "girintili" görünmesin; neden ipucunda.
    const kaldir = zorunlu
      ? h('span', { class: 'ortam-satiri-bos', title: 'TEST ortamı zorunludur; kaldırılamaz.' }, h('span', { 'aria-hidden': 'true' }, ikon('kilit')))
      : h('button', { type: 'button', class: 'ikon-dugme ortam-kaldir', 'aria-label': 'Ortamı kaldır', title: 'Ortamı kaldır', onclick: () => {
        satirlar.splice(satirlar.indexOf(satir), 1); satir.el.remove();
      } }, ikon('carpi'));
    // × (ortamı kaldır) satırın EN SOLUNDA, Ortam adı alanının solunda.
    const adAlani = alan('Ortam adı', ad, { zorunlu: true });
    adAlani.classList.add('ortam-adi-alani');
    const adresAlani = alan('Adres (link)', adres, { zorunlu: true, yardim: ADRES_YARDIMI });
    adresAlani.classList.add('ortam-adresi-alani');
    satir.el = h('div', { class: `ortam-satiri${zorunlu ? ' zorunlu' : ''}` },
      kaldir, adAlani, adresAlani,
      h('fieldset', { class: 'alan ortam-riski ortam-turu-secimi', 'aria-required': 'true' },
        h('legend', { class: 'alan-etiketi' }, 'Ortam türü'),
        h('div', { class: 'secenekler-satiri' },
          h('label', { class: 'secenek', for: test.id, title: zorunlu ? 'TEST ortamının türü Test\'tir.' : 'Test ortamı: onay sorulmaz.' }, test, 'Test'),
          h('label', { class: 'secenek', for: canli.id, title: zorunlu ? 'TEST ortamının türü Test\'tir.' : 'Canlı ortam: istek atan her işlemde onay sorulur.' }, canli, 'Canlı')),
        turHatasi));
    satirlar.push(satir);
    liste.append(satir.el);
    return satir;
  };
  ortamSatiri(true);
  const ekleDugmesi = h('button', { type: 'button', onclick: () => ortamSatiri(false).ad.focus() }, ikon('arti'), 'Ortam ekle');
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet ve devam', ikon('ok'));
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('ag'), 'Ortamlar')),
    h('p', { class: 'soluk' }, 'TEST ortamı zorunludur. Diğer ortamları (ör. hazırlık, canlı) şimdi veya daha sonra Ayarlar\'dan ekleyebilirsiniz; her ortam için türünü (Test / Canlı) seçin. Canlı ortamda istek atan her işlemde "Bu işlem CANLI ortamda yapılacak, emin misiniz?" diye sorulur ve "yalnızca test ortamı" adımları atlanır.'),
    mesaj.kutu, liste, ekleDugmesi,
    h('div', { class: 'dugmeler' }, gonder));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    let ilkHata = null;
    for (const s2 of satirlar) {
      alanHatasi(s2.ad, ''); alanHatasi(s2.adres, ''); s2.turHatasi.textContent = '';
      if (!s2.ad.value.trim()) { alanHatasi(s2.ad, 'Ortam adı boş olamaz.'); ilkHata ??= s2.ad; }
      if (!adresGecerliMi(s2.adres.value.trim())) { alanHatasi(s2.adres, 'Geçerli bir http(s) adresi girin.'); ilkHata ??= s2.adres; }
      if (s2.tur() === null) { s2.turHatasi.textContent = 'Ortam türünü seçin (Test / Canlı).'; ilkHata ??= s2.test; }
    }
    const adlar = satirlar.map((s2) => s2.ad.value.trim().toLocaleLowerCase('tr'));
    satirlar.forEach((s2, i) => {
      if (adlar[i] && adlar.indexOf(adlar[i]) !== i) { alanHatasi(s2.ad, 'Bu ad başka bir satırda da var.'); ilkHata ??= s2.ad; }
    });
    if (ilkHata) { ilkHata.focus(); return; }
    const adUyarisi = satirlar.filter((s2) => !s2.zorunlu && s2.tur() === false && adCanliyiCagristiriyorMu(s2.ad.value));
    let adOnayi = false;
    if (adUyarisi.length) {
      const { onayIste } = await import('./kosu-paneli.js');
      adOnayi = await onayIste({ baslik: 'Bu ortamın adı canlıyı çağrıştırıyor, emin misiniz?', ikonAd: 'uyari', dugme: 'Evet, Test ortamı',
        metin: `${adUyarisi.map((s2) => `"${s2.ad.value.trim()}"`).join(', ')} Test ortamı olarak kaydedilecek: bu ortamdaki işlemler CANLI onayı sorulmadan başlar.` });
      if (!adOnayi) return;
    }
    try {
      await mesgulIken(gonder, 'Kaydediliyor…', async () => {
        for (const s2 of satirlar) {
          const { ortam } = await api('/platform/ortam/kaydet', { govde: {
            id: s2.id || undefined, projeId: durum.proje.id, ad: s2.ad.value.trim(), tabanUrl: s2.adres.value.trim(),
            varsayilan: s2.zorunlu, riskli: s2.tur(), ...(adOnayi ? { onay: true } : {})
          } });
          s2.id = ortam.id;
        }
        // Doğrulama: her satır sunucuda (ad + ortam türü) kayıtlı mı?
        const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(durum.proje.id)}`);
        const eksik = satirlar.filter((s2) => {
          const o = ortamlar.find((x) => x.id === s2.id);
          return !o || o.ad !== s2.ad.value.trim() || riskliSecimi(o) !== s2.tur();
        });
        if (eksik.length) throw new Error(`Şu ortamlar kaydedilemedi: ${eksik.map((s2) => s2.ad.value.trim()).join(', ')}. Tekrar "Kaydet ve devam" deneyin.`);
      });
      if (sihirbazModu === 'ilk') sihirbazIzinler(); else sorulardanSonra();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('ortamlar', sihirbazBasligi(), 'Testlerin çalışacağı adresleri tanımlayın.', form);
}

/**
 * İZİNLER (yalnız ilk kurulum): "Nöbetçi sizin adınıza neleri yapabilsin?" — izin paketi (izinler.js > izinPaketiSecimi). Seçilen
 * paketin açacağı izinler riskleriyle listelenir, tek onayla açılır; "Hiçbiri" ve "Atla" hiçbir izni açmaz (her işlemde sorulur).
 */
async function sihirbazIzinler() {
  const kap = h('div', {}, iskelet('liste'));
  const atla = h('button', { type: 'button', class: 'hayalet', onclick: () => sorulardanSonra() }, 'Atla');
  sihirbazEkrani('izinler', sihirbazBasligi(), 'Nöbetçi\'nin sizin adınıza yapabileceklerini şimdi toplu seçebilir ya da her işlemde ayrı ayrı karar verebilirsiniz. Seçiminizi sonra Ayarlar > İzinler\'den değiştirebilirsiniz.', kap);
  try {
    const [{ izinPaketiSecimi }, { izinler }] = await Promise.all([import('./izinler.js'), api('/platform/izinler')]);
    kap.replaceChildren(izinPaketiSecimi({
      izinler, dugmeMetni: (n) => `Bu ${n} izni aç ve devam et`, bosDugmeMetni: 'Devam', ekDugmeler: [atla],
      bitti: () => sorulardanSonra()
    }));
  } catch (hata) {
    if (hata && hata.durum === 423) return;
    kap.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata)), h('div', { class: 'dugmeler' }, atla));
  }
}

/**
 * PROJE HAZIR: kısa özet (proje + kaydedilen ortamlar, sunucudan okunur), "Sıradaki: giriş tarifini kaydet" yönlendirmesi (sihirbazda
 * giriş sorulmaz; zorunlu adım değildir) ve ana sayfaya geçiş. İlk kurulumda ana düzen ilk açıldığında genel tanıtım kendiliğinden
 * başlar (rehber.js > kurulumSonrasiTanitimIste); ana sayfa Sonuçlar > Genel > Özet'tir (Başlarken listesi orada).
 */
function sihirbazTamam() {
  sayfaBasligi('Proje hazır');
  // Basit modda rehberler kendiliğinden açılmaz (genel tanıtım Gelişmiş menüsünü anlatır; "?" her zaman açar).
  if (sihirbazModu === 'ilk' && durum.kullanimModu.mod !== 'basit') kurulumSonrasiTanitimIste();
  const ozet = h('div', { class: 'proje-ozeti' }, iskelet('liste'));
  // Giriş sorusunun cevabı: Evet → birincil eylem giriş tarifi sayfası; Hayır → giriş notu yerine "gerek yok" bilgisi.
  const giris = sihirbazCevaplari.giris;
  const anaSayfa = h('button', { type: 'button', class: giris === 'evet' ? 'hayalet' : 'birincil', onclick: () => { location.hash = modunAnaSayfasi(durum.kullanimModu.mod); yonlendir(); } }, 'Ana sayfaya geç', ikon('ok'));
  const girisBaglantisi = h('a', { class: giris === 'evet' ? 'dugme birincil' : 'dugme', href: '#/ayarlar/giris', onclick: (o) => { o.preventDefault(); location.hash = girisBaglantisi.getAttribute('href'); yonlendir(); } },
    ikon('anahtar'), giris === 'evet' ? 'Giriş tarifine geç' : 'Girişi kaydet');
  const siradaki = giris === 'hayir'
    ? h('div', { class: 'not-kutusu bilgi siradaki-adim', role: 'note' },
      h('p', {}, h('strong', {}, 'Giriş gerekmiyor. '), 'Başlarken listesinde giriş adımı "Girişe gerek yok" olarak işaretlendi; fikriniz değişirse oradan "Geri al" deyin.'))
    : h('div', { class: 'not-kutusu bilgi siradaki-adim', role: 'note' },
      h('p', {}, h('strong', {}, 'Sıradaki: giriş tarifini kaydet. '),
        giris === 'evet'
          ? '"Giriş tarifine geç" bu projenin varsayılan ortamının giriş tarifi sayfasını açar: "Girişi kaydet" ile girişi bir kez kendiniz yaparsınız, yazdığınız değerler kaydedilmez.'
          : 'Testlerin uygulamanıza nasıl giriş yapacağını bir kez gösterin: "Girişi kaydet" giriş sayfasını açar, girişi siz yaparsınız, yazdığınız değerler kaydedilmez. Uygulamanız giriş istemiyorsa bu adımı atlayın.'),
      h('div', { class: 'dugmeler' }, girisBaglantisi));
  ekran(odakSayfa({ ustMetin: sihirbazUstMetni() }, anaAlan('ortali sihirbaz-alani',
    h('div', { class: 'sihirbaz-baslik' }, h('div', { class: 'kirinti' }, h('span', {}, 'Kurulum tamamlandı')),
      h('h1', {}, 'Proje hazır'), h('p', { class: 'soluk' }, sihirbazModu === 'ek'
        ? 'Proje ve ortamları oluşturuldu. Proje seçiciden projeler arasında geçebilirsiniz.'
        : 'Kasa, proje ve ortamlar oluşturuldu.')),
    adimListesi('tamam'),
    h('section', { class: 'kart proje-hazir', 'aria-label': 'Proje özeti' },
      h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('katman'), durum.proje ? durum.proje.ad : 'Proje')),
      ozet,
      siradaki,
      h('p', { class: 'soluk kucuk' }, 'Ana sayfadaki "Başlarken" listesi ilk koşuya kadar sıradaki adımı gösterir: giriş, ilk ekran (Tara / Akışı kaydet), ilk senaryo, Dene, Koşuyu başlat. Her sayfanın rehberi başlığın altındaki "Bu sayfanın rehberi" bağlantısıyla ya da üst çubuktaki "?" ile açılır.'),
      h('div', { class: 'dugmeler' }, anaSayfa)))));
  (giris === 'evet' ? girisBaglantisi : anaSayfa).focus({ preventScroll: true });
  if (!durum.proje) { ozet.replaceChildren(); return; }
  api(`/platform/ortamlar?projeId=${encodeURIComponent(durum.proje.id)}`).then(({ ortamlar }) => {
    const varsayilan = ortamlar.find((o) => o.varsayilan) || ortamlar[0];
    if (varsayilan) girisBaglantisi.setAttribute('href', `#/ayarlar/giris/tarif/${encodeURIComponent(varsayilan.id)}`);
    ozet.replaceChildren(h('h3', { class: 'ozet-basligi' }, 'Ortamlar ', rozet(String(ortamlar.length))),
      h('ul', { class: 'ozet-ortamlar' }, ortamlar.map((o) => h('li', {},
        h('strong', {}, o.ad),
        o.varsayilan ? h('span', { class: 'rozet vurgu' }, 'Varsayılan') : '',
        riskliSecimi(o) === true ? h('span', { class: 'rozet hata' }, 'Canlı') : riskliSecimi(o) === null ? h('span', { class: 'rozet uyari' }, 'Türünü seçin') : null,
        h('span', { class: 'mono soluk' }, o.tabanUrl)))));
  }).catch((hata) => { ozet.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); });
}

// ---------------------------------------------------------------------------------------
// Kilit ekranı
// ---------------------------------------------------------------------------------------

function geriSayimHalkasi() {
  const CEVRE = 2 * Math.PI * 19;
  const deger = s('circle', { class: 'deger', cx: 22, cy: 22, r: 19, fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': CEVRE.toFixed(1), 'stroke-dashoffset': '0' });
  const sayac = h('span', { class: 'sayac' }, '0');
  const kutu = h('div', { class: 'geri-sayim-halkasi', hidden: true, 'aria-hidden': 'true' },
    s('svg', { viewBox: '0 0 44 44' }, s('circle', { class: 'iz', cx: 22, cy: 22, r: 19, fill: 'none', 'stroke-width': 4 }), deger),
    h('div', {}, sayac, h('small', {}, 'saniye bekleme')));
  let ilk = 0;
  return {
    kutu,
    ayarla(kalan) {
      if (kalan > ilk) ilk = kalan;
      kutu.hidden = kalan <= 0;
      sayac.textContent = String(kalan);
      deger.setAttribute('stroke-dashoffset', String(ilk ? (CEVRE * (1 - kalan / ilk)).toFixed(1) : 0));
      if (kalan <= 0) ilk = 0;
    }
  };
}

function kilitEkrani(beklemeSaniye) {
  sayfaBasligi('Kasa kilitli');
  const parola = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'current-password' });
  const mesaj = mesajKutusu();
  const halka = geriSayimHalkasi();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, ikon('kilit'), 'Kilidi aç');
  // Kilitle çalışma alanını KAPATMAZ: kilit ekranı açık çalışma alanının adını gösterir; "Başka çalışma alanı" onu kapatıp
  // başlangıç ekranına döner (kilitliyken dışa aktarma sorulmaz — veriler bu bilgisayarda kalır).
  const alan = durum.sunucu && durum.sunucu.calismaAlani;
  const cokluAlan = alan && !alan.sabit;
  const baska = cokluAlan ? h('button', { type: 'button', class: 'bag-dugme baska-alan', onclick: (o) => { durdur(); baskaCalismaAlani(o.currentTarget); } }, ikon('cekmece'), 'Başka çalışma alanı') : null;
  const form = h('form', { class: 'kart kilit-kart', novalidate: true },
    h('div', { class: 'kilit-baslik' }, h('span', { class: 'kilit-ikon' }, ikon('kilit')),
      h('h1', {}, 'Kasa kilitli'),
      cokluAlan ? h('p', { class: 'kilit-alan-adi' }, h('span', { class: 'ca-avatar kucuk', 'aria-hidden': 'true' }, basHarf(alan.ad)), h('span', {}, alan.ad)) : null,
      h('p', { class: 'soluk' }, cokluAlan ? 'Devam etmek için bu çalışma alanının kasa parolasını girin.' : 'Devam etmek için kasa parolasını girin.')),
    mesaj.kutu, halka.kutu, parola.kapsayici, h('div', { class: 'dugmeler' }, gonder),
    durum.sunucu && durum.sunucu.zamanlama && durum.sunucu.zamanlama.anahtarBellekte
      ? h('p', { class: 'soluk kucuk', role: 'status' }, 'Planlı koşular arka planda sürebilir: kasa anahtarı yalnız zamanlayıcı için bellekte (Planlı koşular).') : null,
    baska ? h('div', { class: 'kilit-alt' }, baska) : null);
  let durdur = () => {};
  const bekle = (saniye, onMetin) => {
    durdur();
    durdur = geriSayim(saniye, (kalan) => {
      gonder.disabled = kalan > 0;
      halka.ayarla(kalan);
      mesaj.goster(kalan > 0
        ? `${onMetin} ${kalan} saniye sonra tekrar deneyebilirsiniz.`
        : `${onMetin} Şimdi tekrar deneyebilirsiniz.`, 'hata');
    });
  };
  if (durum.kilitMesaji) { mesaj.goster(durum.kilitMesaji, 'bilgi'); durum.kilitMesaji = ''; }
  if (beklemeSaniye > 0) bekle(beklemeSaniye, 'Art arda yanlış parola girildi.');
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    alanHatasi(parola.girdi, '');
    if (!parola.girdi.value) { alanHatasi(parola.girdi, 'Parolayı girin.'); parola.girdi.focus(); return; }
    try {
      await mesgulIken(gonder, 'Açılıyor…', () => api('/platform/kasa/ac', { govde: { parola: parola.girdi.value }, kilitOlayiYok: true }));
      parola.girdi.value = '';
      durdur();
      yonlendir();
    } catch (hata) {
      parola.girdi.select();
      if (hata.durum === 429 && hata.bekleSaniye) { bekle(hata.bekleSaniye, 'Art arda yanlış parola girildi.'); return; }
      if (hata.kod === 'PAROLA_YANLIS') {
        const d = await api('/platform/durum').catch(() => ({ parolaBeklemeSaniye: 0 }));
        if (d.parolaBeklemeSaniye > 0) { bekle(d.parolaBeklemeSaniye, 'Parola yanlış.'); return; }
        mesaj.goster('Parola yanlış.');
        return;
      }
      mesaj.goster(hata.message);
    }
  });
  ekran(odakSayfa({ ustMetin: cokluAlan ? `kilitli · ${alan.ad}` : 'kilitli' }, anaAlan('ortali dar', form)));
  ekranTemizle = () => durdur();
  parola.girdi.focus();
}

// ---------------------------------------------------------------------------------------
// Ana düzen
// ---------------------------------------------------------------------------------------

function projeSecici() {
  const acik = () => menu.hidden === false;
  const dugme = h('button', { type: 'button', class: 'proje-secici', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: `Etkin proje: ${durum.proje.ad}` },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, basHarf(durum.proje.ad)),
    h('b', { id: 'proje-rozeti' }, durum.proje.ad),
    durum.proje.aciklama ? h('span', { class: 'aciklama' }, durum.proje.aciklama) : null,
    ikon('asagi'));
  const kapat = () => {
    menu.hidden = true; dugme.setAttribute('aria-expanded', 'false');
    for (const k of menu.querySelectorAll('.proje-islem-kap')) k.dispatchEvent(new CustomEvent('proje-islem-kapat'));
  };
  const alan = durum.sunucu && durum.sunucu.calismaAlani;
  // Her projenin satırı: seç (radyo) + ⋯ (satırın altına açılan işlem satırı: Yeniden adlandır · Varsayılan yap · Sil; aynı işlemler
  // Ayarlar > Proje ve ortamlar > Projeler'de de var). "+ Yeni proje" aynı kasada sihirbazı açar.
  const satir = (p) => h('div', { class: 'proje-satiri' },
    h('button', {
      type: 'button', role: 'menuitemradio', class: 'proje-sec', 'aria-checked': p.id === durum.proje.id ? 'true' : 'false',
      onclick: () => { kapat(); if (p.id !== durum.proje.id) projeyeGec(p.id); }
    }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, basHarf(p.ad)), h('span', { class: 'proje-adi' }, p.ad),
    p.id === durum.varsayilanProjeId ? h('span', { class: 'rozet vurgu varsayilan-rozeti', title: 'Varsayılan proje' }, 'varsayılan') : null,
    p.id === durum.proje.id ? ikon('onay') : null),
    projeMod ? projeMod.projeMenusu({ proje: p, durum, kapat, yonlendir, projeleriYenile, projeyeGec }) : null);
  const menu = h('div', { class: 'acilir-menu proje-menusu', role: 'menu', hidden: true, 'aria-label': 'Projeler' },
    h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, alan && !alan.sabit ? `Projeler · ${alan.ad}` : 'Projeler'),
    durum.projeler.map(satir),
    h('hr', {}),
    h('button', { type: 'button', role: 'menuitem', class: 'yeni-proje', onclick: () => { kapat(); sihirbaz('proje', 'ek'); } }, ikon('arti'), 'Proje ekle'),
    h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); location.hash = '#/ayarlar/proje'; } }, ikon('duzenle'), 'Projeyi düzenle'));
  dugme.addEventListener('click', () => {
    if (acik()) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  });
  // Ok tuşları: listedeki görünür ve etkin tüm düğmeler (proje satırları, ⋯, açık işlem satırının düğmeleri, alttakiler) DOM sırasıyla.
  // Esc: açık işlem satırını proje-islemleri.js kapatır (olay buraya gelmez); değilse liste kapanır, odak seçici düğmesine döner.
  menu.addEventListener('keydown', (o) => {
    const ogeler = [...menu.querySelectorAll('button:not(:disabled)')].filter((b) => !b.closest('[hidden]'));
    const i = ogeler.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (o.key === 'Escape') { kapat(); dugme.focus(); }
    else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length].focus(); }
    else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length].focus(); }
    else if (o.key === 'Home') { o.preventDefault(); ogeler[0].focus(); }
    else if (o.key === 'End') { o.preventDefault(); ogeler[ogeler.length - 1].focus(); }
  });
  document.addEventListener('click', (o) => {
    if (acik() && !kap.contains(/** @type {Node} */ (o.target)) && !document.querySelector('dialog[open]')) kapat();
  });
  const kap = h('div', { class: 'proje-secici-kap' }, dugme, menu);
  return kap;
}

// ---------------------------------------------------------------------------------------
// Sol yan panel: daralt / genişlet (yalnız görünüm tercihi; tarayıcıda hatırlanır). Düğme panelin sağ kenar çizgisinin tam
// üstündedir (yarısı panelde, yarısı içerikte). Daralmış hâl ince bir ikon şerididir (Genel / Ekranlar / Servisler ve ayar
// bölümlerinin ikonları; üzerine gelince adı ipucunda). Dar ekranda (≤ 860 px) panel zaten yatay şerittir: düğme gösterilmez.
// ---------------------------------------------------------------------------------------
const YAN_PANEL_ANAHTARI = 'nobetci.yanPanel.dar';
const yanPanelDarMi = () => { try { return localStorage.getItem(YAN_PANEL_ANAHTARI) === '1'; } catch { return false; } };
const GRUP_SIMGELERI = { ekranlar: 'ekran', servisler: 'ag', senaryolar: 'liste' };

function yanPaneliUygula(dar) {
  document.documentElement.classList.toggle('yan-panel-dar', dar);
  for (const d of document.querySelectorAll('.yan-panel-dugmesi')) {
    d.setAttribute('aria-expanded', String(!dar));
    d.setAttribute('aria-label', dar ? 'Yan paneli genişlet' : 'Yan paneli daralt');
    d.title = dar ? 'Yan paneli genişlet' : 'Yan paneli daralt';
    yerlestir(d, ikon(dar ? 'sagCentik' : 'solCentik'));
  }
}

/** Yeni çizilen her .kabuk-duzen'e düğmeyi ekler; şerit için grup simgelerini ve ipuçlarını hazırlar. */
function yanPanelleriHazirla() {
  for (const duzen of document.querySelectorAll('.kabuk-duzen:not([data-yan-dugme])')) {
    const panel = duzen.querySelector(':scope > .yan-panel');
    if (!panel) continue;
    duzen.setAttribute('data-yan-dugme', '');
    if (!panel.id) panel.id = `yan-panel-${++adSayaci}`;
    const dugme = h('button', { type: 'button', class: 'yan-panel-dugmesi', 'aria-controls': panel.id,
      onclick: () => { const dar = !document.documentElement.classList.contains('yan-panel-dar'); try { localStorage.setItem(YAN_PANEL_ANAHTARI, dar ? '1' : '0'); } catch { /* yok sayılır */ } yanPaneliUygula(dar); } });
    duzen.prepend(dugme);
  }
  for (const grup of document.querySelectorAll('.yan-panel .nav-grup[data-grup]:not([data-simgeli])')) {
    grup.setAttribute('data-simgeli', '');
    const baslik = grup.querySelector('.nav-grup-baslik');
    const ad = GRUP_SIMGELERI[grup.getAttribute('data-grup')];
    if (baslik && ad) baslik.prepend(h('span', { class: 'nav-grup-simge', 'aria-hidden': 'true' }, ikon(ad)));
  }
  for (const o of document.querySelectorAll('.yan-panel a:not([title]), .yan-panel .nav-grup-baslik:not([title])')) {
    const metin = (o.querySelector('.nav-metni') || o).textContent.trim();
    if (metin) o.setAttribute('title', metin);
  }
  yanPaneliUygula(yanPanelDarMi());
}
new MutationObserver(() => { if (document.querySelector('.kabuk-duzen:not([data-yan-dugme]), .yan-panel .nav-grup[data-grup]:not([data-simgeli])')) yanPanelleriHazirla(); })
  .observe(kok, { childList: true, subtree: true });

function anaDuzen() {
  const main = anaAlan('ana-icerik');
  const navSonuclar = h('a', { href: '#/sonuclar/ozet' }, ikon('grafik'), 'Sonuçlar');
  // Senaryolar bölümünün alt kısmı (Servisler, Uçtan uca akışlar) açıkken üst menüde yanında adı yazar: 'Senaryolar › Servisler'.
  // Ek yalnız görseldir (aria-hidden; bağlantının adı değişmez); ekran okuyucu için yer bilgisi sayfanın başlık izindedir.
  const navAltBolum = h('span', { class: 'nav-alt-bolum', 'aria-hidden': 'true', hidden: true });
  const navSenaryolar = h('a', { href: '#/senaryolar' }, ikon('liste'), 'Senaryolar', navAltBolum);
  const navEkranlar = h('a', { href: '#/ekranlar' }, ikon('ekran'), 'Ekranlar');
  // Günlük iş nesneleri (Ayarlar'dan taşındı): Test verisi ve Planlı koşular.
  const ustSayfaBaglantisi = (s) => h('a', { href: `#/${s.ad}` }, ikon(s.ikon), s.menu);
  const [navVeri, navPlanli] = UST_SAYFALAR.map(ustSayfaBaglantisi);
  const navAyarlar = h('a', { href: '#/ayarlar/proje' }, ikon('ayar'), 'Ayarlar');
  const kilitle = h('button', { type: 'button', class: 'kilitle-dugmesi', 'aria-label': 'Kilitle' }, ikon('kilit'), h('span', { class: 'dugme-metni' }, 'Kilitle'));
  const kilitleVeDon = async () => {
    const secim = await mesgulIken(kilitle, 'Kilitleniyor…', () => kasayiKilitleSecimli());
    if (!secim) return;
    const [metin, tur] = kilitBildirimi(secim);
    bildir(metin, tur);
    // Uyarı kilit ekranında da kalıcı görünür (bildirim birkaç saniyede kaybolur).
    if (tur === 'hata') durum.kilitMesaji = metin;
    yonlendir();
  };
  kilitle.addEventListener('click', kilitleVeDon);
  // Sağ üst çalışma alanı (hesap) menüsü: Kilitle · Yeniden adlandır · Çalışma alanını kapat (dışa aktarma sorusu).
  const hesap = alanMod && durum.sunucu && durum.sunucu.calismaAlani !== undefined ? alanMod.hesapMenusu({
    calismaAlani: durum.sunucu ? durum.sunucu.calismaAlani : null,
    kilitle: kilitleVeDon,
    kapandi: () => { location.hash = ''; yonlendir(); },
    yenile: async () => { durum.sunucu = await api('/platform/durum').catch(() => durum.sunucu); anaDuzen(); }
  }) : null;
  const sunucu = sunucuDurumu();
  const aramaBaglami = () => ({ proje: durum.proje, ayarBolumleri: AYAR_BOLUMLERI, ustSayfalar: UST_SAYFALAR });
  // Basit mod (basit-mod.js): menü yalnız Testlerim · Sonuçlar · Ayarlar, "Oluştur" yerine "+ Yeni test"; Gelişmiş'e ait sayfanın
  // üstünde not; sağda Basit / Gelişmiş anahtarı. Gelişmiş = bugünkü üst çubuk (değişmez); Basit'e geçiş Ayarlar'ın yan panelinde.
  const basit = durum.kullanimModu.mod === 'basit';
  const navTestlerim = basit ? h('a', { href: '#/testlerim' }, ikon('liste'), 'Testlerim') : null;
  const navBasitSonuclar = basit ? h('a', { href: '#/basit-sonuclar' }, ikon('grafik'), 'Sonuçlar') : null;
  const gelismisNotu = basit ? gelismisSayfaNotu(() => moduDegistir('gelismis')) : null;
  const ust = h('header', { class: `ust-cubuk${basit ? ' basit-mod' : ''}` },
    markaOgesi(),
    projeSecici(),
    h('nav', { class: 'ust-nav', 'aria-label': 'Ana menü' }, basit ? [navTestlerim, navBasitSonuclar, navAyarlar] : [navSonuclar, navSenaryolar, navEkranlar, navVeri, navPlanli, navAyarlar]),
    basit ? yeniTestDugmesi() : olusturMenusu(() => ({ proje: durum.proje, ayarBolumleri: AYAR_BOLUMLERI, yeniProje: () => sihirbaz('proje', 'ek') })),
    h('span', { class: 'bosluk' }),
    hizliAramaDugmesi(aramaBaglami), sunucu, basit ? modAnahtari('basit', (hedef) => moduDegistir(hedef)) : null, rehberDugmesi(), temaDugmesi(), kilitle, hesap);
  hizliAramaKisayolu(aramaBaglami);
  ekran(...[ust, gelismisNotu, main].filter(Boolean));
  // Sayfa rehberi bağlantısı (başlığın altında) ve boş durum rehberi için seçili proje.
  rehberBaglaminiAyarla({ projeKimligi: () => (durum.proje ? durum.proje.id : null) });
  sayfaRehberiBaglantisiKur(main);

  const ciz = () => {
    const hash = location.hash || (basit ? '#/testlerim' : '#/sonuclar');
    const [, bolum, alt, ...kalan] = hash.split('/');
    // Ayarlar'dan taşınan sayfaların eski adresleri (yer imleri, eski bağlantılar): geçmişe eklemeden yeni adrese.
    if (bolum === 'ayarlar' && alt && Object.hasOwn(ESKI_ADRESLER, alt)) {
      history.replaceState(null, '', ESKI_ADRESLER[alt]);
      ciz();
      return;
    }
    // Sayfa değişince önceki sayfanın açık pencereleri (ör. geri düğmesiyle çıkılan rapor penceresi) kapanır.
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    for (const n of [navSonuclar, navSenaryolar, navEkranlar, navVeri, navPlanli, navAyarlar, navTestlerim, navBasitSonuclar]) n?.removeAttribute('aria-current');
    if (gelismisNotu) gelismisNotu.hidden = !gelismisBolumuMu(bolum);
    if (basit && bolum === 'sonuclar') navBasitSonuclar?.setAttribute('aria-current', 'page');
    const altBolum = bolum === 'servisler' ? 'Servisler' : bolum === 'akislar' ? 'Uçtan uca' : '';
    navAltBolum.textContent = altBolum ? `› ${altBolum}` : '';
    navAltBolum.hidden = !altBolum;
    if (altBolum) navSenaryolar.title = `Senaryolar › ${altBolum}`; else navSenaryolar.removeAttribute('title');
    if (BASIT_SAYFALAR.includes(bolum)) {
      // Basit mod sayfaları (her iki modda da açılır; Gelişmiş menüsünde bağlantıları yoktur).
      (bolum === 'basit-sonuclar' ? navBasitSonuclar : bolum === 'testlerim' ? navTestlerim : null)?.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi(bolum === 'basit-sonuclar' ? 'Sonuçlar' : bolum === 'hizli-test' ? 'Yeni test' : 'Testlerim');
      basitSayfaEkrani(main, bolum, alt ? [alt, ...kalan].map((p) => decodeURIComponent(p)) : [], { durum, gelismiseGec: (adres) => moduDegistir('gelismis', adres) });
    } else if (bolum === 'senaryolar') {
      navSenaryolar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Senaryolar');
      senaryolarModulu().then((m) => m.senaryolarEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Senaryolar ekranı yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'servisler') {
      // Servisler, Senaryolar bölümünün "ÜRÜNLER > 2 · Servisler" kısmıdır (aynı sol panel).
      navSenaryolar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Servisler');
      servislerModulu().then((m) => m.servislerEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Servisler yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'akislar') {
      // Uçtan uca akışlar (servis + ekran + SQL; uctan-uca.js): Senaryolar bölümünün sol panelinde.
      navSenaryolar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Uçtan uca akışlar');
      import('./uctan-uca.js').then((m) => m.uctanUcaEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Uçtan uca akışlar yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'ekranlar') {
      navEkranlar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Ekranlar');
      ekranlarModulu().then((m) => m.ekranlarEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Ekranlar yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'veri' || bolum === 'planli-kosular') {
      (bolum === 'veri' ? navVeri : navPlanli).setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      const tanim = UST_SAYFALAR.find((x) => x.ad === bolum);
      sayfaBasligi(tanim ? tanim.etiket : 'Nöbetçi');
      ustSayfaEkrani(main, bolum);
    } else if (bolum === 'ayarlar') {
      navAyarlar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Ayarlar');
      ayarlarEkrani(main, AYAR_BOLUMLERI.some((b) => b.ad === alt) ? alt : 'proje', kalan[0] ? decodeURIComponent(kalan[0]) : null);
    } else {
      // #/sonuclar ve bilinmeyen adresler (ör. eski #/gorunum yer imleri) → Sonuçlar.
      navSonuclar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Sonuçlar');
      sonuclarEkrani(main, bolum === 'sonuclar' && alt ? [alt, ...kalan] : [], { durum });
    }
  };
  // Ekran rehberi: ilk girişte yalnız tercih açıksa kendiliğinden başlar (varsayılan kapalı); "?" ve sayfadaki bağlantı her zaman açar.
  const cizVeRehber = () => { ciz(); etkinGezinmeyiGoster(); rehberOtomatikDene(rehberAnahtari(location.hash)); };
  window.addEventListener('hashchange', cizVeRehber);
  // Otomatik kilit: sunucu kasayı hareketsizlik sonrası kilitler; arayüz bunu periyodik durum
  // sorgusuyla (etkinlik SAYILMAZ) fark edip kilit ekranına döner. Aynı sorgu sunucu hapını da günceller.
  const kilitKontrolu = setInterval(async () => {
    try {
      const d = await api('/platform/durum');
      sunucu.durumAyarla(true);
      // Çalışma alanı başka bir sekmeden kapatıldı/değiştirildi → yeniden yönlendir (başlangıç ya da diğer alan).
      const acikAlan = durum.sunucu && durum.sunucu.calismaAlani;
      if (acikAlan && (!d.calismaAlani || d.calismaAlani.id !== acikAlan.id)) { location.hash = ''; yonlendir(); return; }
      if (d.kasa && d.kasa.olusturuldu && !d.kasa.acik) {
        durum.kilitMesaji = d.otomatikKilit && d.otomatikKilit.sonKilitlenme
          ? `Kasa ${d.otomatikKilit.dakika} dakika işlem yapılmadığı için otomatik olarak kilitlendi.`
          : 'Kasa kilitlendi.';
        kilitEkrani(d.parolaBeklemeSaniye || 0);
      }
    } catch { sunucu.durumAyarla(false); /* bağlantı hatası: bir sonraki denemede */ }
  }, 15_000);
  ekranTemizle = () => { window.removeEventListener('hashchange', cizVeRehber); clearInterval(kilitKontrolu); };
  if (basit && !location.hash) history.replaceState(null, '', '#/testlerim');
  cizVeRehber();
  // Ana sayfa (açılış / yeniden yükleme / kilit açma): yedekten yükleme izinleri değiştirdiyse bir kez uyarı penceresi.
  void yedekUyarisiniGoster({ izinlereGit: () => { location.hash = '#/ayarlar/izinler'; } });
}

/**
 * Basit / Gelişmiş geçişi (üst çubuktaki anahtar, "Gelişmiş'e geç" notu, Testlerim'deki "Gelişmiş'te göster"): mod kasaya yazılır
 * (basit-mod.js > modaGec; Gelişmiş'e ilk geçişte açıklamalı onay), ana düzen yeni modla yeniden çizilir. adres verilmezse
 * gecisAdresi (Ayarlar yerinde kalır; diğer sayfalar hedef modun karşılığına gider).
 * @param {'basit' | 'gelismis'} hedef @param {string} [adres]
 */
async function moduDegistir(hedef, adres) {
  if (durum.kullanimModu.mod === hedef) { if (adres) location.hash = adres; return; }
  const yeni = await modaGec(durum.kullanimModu, hedef);
  if (!yeni) return;
  durum.kullanimModu = yeni;
  const hedefAdres = adres || gecisAdresi(hedef, location.hash);
  // Eski düzenin çizimi durur; adres değişimi (çıkış korumasının izi de güncellenir) bitince yeni düzen bir kez çizilir.
  ekranTemizle();
  ekranTemizle = () => {};
  if (hedefAdres !== location.hash) {
    await new Promise((coz) => { window.addEventListener('hashchange', () => coz(undefined), { once: true }); location.hash = hedefAdres; });
  }
  anaDuzen();
}

/** Senaryolar modülü (bir kez yüklenir). */
let senaryolarSozu = null;
const senaryolarModulu = () => (senaryolarSozu ??= import('./senaryolar.js').catch((e) => { senaryolarSozu = null; throw e; }));
/** Servisler modülü (bir kez yüklenir). */
let servislerSozu = null;
const servislerModulu = () => (servislerSozu ??= import('./servisler.js').catch((e) => { servislerSozu = null; throw e; }));
/** Ekranlar modülü (bir kez yüklenir). */
let ekranlarSozu = null;
const ekranlarModulu = () => (ekranlarSozu ??= import('./ekranlar.js').catch((e) => { ekranlarSozu = null; throw e; }));
const mesajKutusuHata = (metin) => h('div', { class: 'not-kutusu hata', role: 'alert' }, metin);

function ayarlarEkrani(main, bolum, odak = null) {
  const icerik = h('section', { class: 'icerik-alani dar-icerik', 'aria-labelledby': 'bolum-basligi' }, iskelet('sayfa'));
  const altNav = h('nav', { class: 'alt-nav', 'aria-label': 'Ayarlar bölümleri' },
    AYAR_BOLUMLERI.map((b) => h('a', { href: `#/ayarlar/${b.ad}`, 'aria-current': b.ad === bolum ? 'page' : null }, ikon(b.ikon), b.etiket)));
  // Ayarlar'dan üst menüye taşınan sayfalar: eski yerinden de bulunabilsin diye "taşındı" bağlantıları (Ayarlar'da yalnız ayarlar kalır).
  const tasinan = h('nav', { class: 'alt-nav tasinan-bolumler', 'aria-label': 'Üst menüye taşınan sayfalar' },
    h('div', { class: 'alt-nav-alt-baslik' }, 'Üst menüye taşındı'),
    h('a', { href: '#/veri', title: 'Üst menüye taşındı: Test verisi' }, ikon('veri'), 'Test verisi'),
    h('a', { href: '#/planli-kosular', title: 'Üst menüye taşındı: Planlı koşular' }, ikon('tarih'), 'Planlı koşular'));
  main.replaceChildren(h('h1', { class: 'gorunmez' }, 'Ayarlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ayarlar'), altNav, tasinan,
        // Kullanım modu (Basit / Gelişmiş; çalışma alanının ayarı): Gelişmiş üst çubuğu değişmesin diye anahtar burada da durur.
        h('div', { class: 'kullanim-modu-secimi' }, h('span', { class: 'kucuk soluk' }, 'Kullanım modu'), modAnahtari(durum.kullanimModu.mod, (hedef) => moduDegistir(hedef))),
        h('div', { class: 'yan-not' }, h('b', {}, 'Kasa'), h('br', {}), 'Parolalar, anahtarlar ve hassas test verileri şifreli saklanır; burada maskeli görünür.')),
      icerik));
  ayarlarBolumu(icerik, bolum, { durum, yonlendir, projeSec, projeleriYenile, odak });
}

/** Üst menü sayfası (Veri / Planlı koşular): yan panelsiz tek sütun. @param {HTMLElement} main @param {'veri' | 'planli-kosular'} ad */
function ustSayfaEkrani(main, ad) {
  const icerik = h('section', { class: 'icerik-alani dar-icerik ust-sayfa', 'aria-labelledby': 'bolum-basligi' }, iskelet('sayfa'));
  main.replaceChildren(h('h1', { class: 'gorunmez' }, ad === 'veri' ? 'Test verisi' : 'Planlı koşular'), icerik);
  ustSayfaBolumu(icerik, ad, { durum, yonlendir, projeSec, projeleriYenile });
}

/** Dar ekranda yatay kayan menülerde (ana menü, Ayarlar bölümleri) etkin öğe görünür alana kaydırılır (sayfa kaymaz). */
function etkinGezinmeyiGoster() {
  requestAnimationFrame(() => {
    for (const nav of document.querySelectorAll('.ust-nav, .alt-nav')) {
      if (nav.scrollWidth <= nav.clientWidth + 1) continue;
      const etkin = nav.querySelector('[aria-current="page"]');
      if (!etkin) continue;
      const n = nav.getBoundingClientRect();
      const e = etkin.getBoundingClientRect();
      if (e.left < n.left) nav.scrollLeft -= n.left - e.left + 8;
      else if (e.right > n.right) nav.scrollLeft += e.right - n.right + 8;
    }
  });
}

cikisKorumasiniKur();
// Tüm tablolarda başlığa tıklayınca sıralama (sayfalı tablolar kendi verisinde sıralar; bkz. tablo-siralama.js).
tabloSiralamaKur();
// Uzun açılır listelerde (seçenek sayısı Ayarlar > Arayüz eşiğinin üstünde) yazarak arama (bkz. aranabilir-secim.js).
aranabilirSecimKur();
yonlendir();
