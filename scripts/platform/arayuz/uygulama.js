// Platform kabuğu: /platform/durum'a göre yönlendirme.
//   kasa yok            → Hoş geldiniz (Yedek yükle / Yeni proje başlat / [eski dosya klasörü varsa —
//                         veri/eski-dosyalar/<zaman>/ yedeği] Eski proje dosyalarını aktar)
//   kasa var, kilitli   → Kilit ekranı (yanlış parolada bekleme geri sayımı)
//   kasa açık, proje yok → Yeni proje sihirbazı (proje adımından)
//   kasa açık           → Ana düzen: üst çubuk (marka, proje seçici, Sonuçlar | Senaryolar |
//                         Ekranlar | Ayarlar, hızlı arama*, sunucu durumu, tema, Kilitle) + sol
//                         panel + içerik. (* = yakında; bağlantı değildir.)
//                         (#/sonuclar[/...], #/senaryolar[/...], #/ekranlar[/...], #/ayarlar/<bölüm>)
// Senaryolar ekranı (senaryolar.js, senaryo-formu.js, kosu-paneli.js) ve Ekranlar ekranı (ekranlar.js,
// ekran-ortak.js, sayfa-paketi.js, bulgular.js) ayrı modüllerde ve DİNAMİK yüklenir: sunucu bu dosyaları
// henüz sunmuyorsa (eski sürüm çalışıyorsa) yalnızca o sekme hata verir.
import {
  MARKA, adresGecerliMi, alan, alanHatasi, api, bildir, geriSayim, h, ikon, iskelet, logo, mesajKutusu, mesgulIken,
  parolaAlani, s, temaDugmesi
} from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { aktarimAkisi } from './aktarim.js';
import { ayarlarBolumu, AYAR_BOLUMLERI } from './ayarlar.js';
import { sonuclarEkrani } from './sonuclar.js';

const kok = document.getElementById('uygulama');
const durum = { sunucu: null, proje: null, projeler: [], kilitMesaji: '' };
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
  const el = h('div', { class: 'sunucu-durumu', role: 'status', title: 'Yerel sunucu çalışıyor' },
    h('span', { class: 'canli-nokta', 'aria-hidden': 'true' }), h('span', { class: 'adres' }, location.host),
    h('span', { class: 'gorunmez' }, 'Sunucu bağlı'));
  el.durumAyarla = (bagli) => {
    el.classList.toggle('kopuk', !bagli);
    el.title = bagli ? 'Yerel sunucu çalışıyor' : 'Sunucuya ulaşılamıyor';
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
  if (!d.kasa.olusturuldu) { hosgeldin(); return; }
  if (!d.kasa.acik) { kilitEkrani(d.parolaBeklemeSaniye); return; }
  const { projeler } = await api('/platform/projeler');
  durum.projeler = projeler;
  if (!projeler.length) { sihirbaz('proje'); return; }
  let secili = null;
  try { secili = localStorage.getItem('platform.seciliProje'); } catch { secili = null; }
  durum.proje = projeler.find((p) => p.id === secili) || projeler[0];
  anaDuzen();
}

export function projeSec(id) {
  const p = durum.projeler.find((x) => x.id === id);
  if (!p) return;
  durum.proje = p;
  try { localStorage.setItem('platform.seciliProje', id); } catch { /* yok sayılır */ }
}

export async function projeleriYenile() {
  const { projeler } = await api('/platform/projeler');
  durum.projeler = projeler;
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

async function hosgeldin() {
  history.replaceState(null, '', '/');
  sayfaBasligi('Hoş geldiniz');
  // Eski proje dosyalarının olduğu bir klasör varsa (en yeni veri/eski-dosyalar/<zaman>/ yedeği ya da
  // proje kökünde hâlâ duran tests/data) üçüncü kart gösterilir.
  let aktarilabilir = null;
  try {
    const d = await api('/platform/aktarim/durum');
    aktarilabilir = d.veritabaniBos ? (d.adaptorler || []).find((a) => a.dosyalarVar && !a.aktarildi) || null : null;
  } catch { aktarilabilir = null; }
  const kartlar = [
    secimKarti({
      ikonAd: 'yukle', no: 1, baslik: 'Yedek yükle', onclick: () => yedekYukleEkrani(),
      aciklama: 'Başka bir bilgisayardan aldığınız .tayedek dosyasını yükleyin. Yedeğin parolası bu bilgisayarın kasa parolası olur.',
      altIkon: 'dosya', altMetin: '.tayedek · şifreli', git: 'Seç'
    }),
    secimKarti({
      sinif: 'k-basari', ikonAd: 'arti', no: 2, baslik: 'Yeni proje başlat', onerilen: !aktarilabilir, onclick: () => sihirbaz('kasa'),
      aciklama: 'Kasa parolası belirleyin, projenizi ve test ortamlarınızı tanımlayın.',
      altIkon: 'saat', altMetin: 'yaklaşık 3 dakika', git: 'Başla'
    }),
    aktarilabilir ? secimKarti({
      sinif: 'k-mor', ikonAd: 'klasor', no: 3, baslik: 'Eski proje dosyalarını aktar', onerilen: true, onclick: () => dosyaAktarimEkrani(aktarilabilir),
      aciklama: `Eski ${aktarilabilir.projeAdi} dosyalarını (test verileri, ortamlar, giriş bilgileri, senaryolar) şifreli platform veritabanına aktarın. Klasör: ${aktarilabilir.kaynakKlasoru}. Dosyalar değiştirilmez.`,
      altIkon: 'ara', altMetin: 'eski dosyalar bulundu', altSinif: 'bulundu', git: 'Aktar'
    }) : null
  ].filter(Boolean);
  const kisayol = (olay) => {
    if (olay.altKey || olay.ctrlKey || olay.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    const kart = kok.querySelector(`.secim-karti[data-kisayol="${olay.key}"]`);
    if (kart) { olay.preventDefault(); kart.click(); }
  };
  ekran(odakSayfa({ ustMetin: 'ilk kurulum' }, anaAlan('karsilama',
    radar(),
    h('span', { class: 'buyuk-logo', 'aria-hidden': 'true' }, s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }), s('circle', { cx: 12, cy: 12, r: 2.6 }))),
    h('span', { class: 'ust-hap' }, h('span', { class: 'nokta vurgu', 'aria-hidden': 'true' }), 'Bu bilgisayarda henüz bir proje yok'),
    h('h1', {}, `${MARKA.yonelme} `, h('span', { class: 'parlak' }, 'hoş geldiniz')),
    h('p', { class: 'giris' }, 'Test senaryolarınızı çalıştırın, sonuçları izleyin, hataları kalıplara ayırın. Her şey bu bilgisayarda, şifreli bir kasada kalır. Başlamak için bir seçenek belirleyin.'),
    h('div', { class: 'secim-kartlari' }, kartlar))));
  document.addEventListener('keydown', kisayol);
  ekranTemizle = () => document.removeEventListener('keydown', kisayol);
}

function dosyaAktarimEkrani(adaptor) {
  const kapsayici = h('div', {});
  sayfaBasligi('Eski proje dosyalarını aktar');
  ekran(odakSayfa({ ustMetin: 'dosyalardan aktarım' }, anaAlan('ortali', h('h1', { class: 'gorunmez' }, 'Eski proje dosyalarını aktar'), kapsayici)));
  aktarimAkisi(kapsayici, {
    mod: 'hosgeldin', adaptor,
    bitti: () => { location.hash = '#/senaryolar'; yonlendir(); },
    vazgec: () => hosgeldin()
  });
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

const SIHIRBAZ_ADIMLARI = [
  { ad: 'kasa', etiket: 'Kasa parolası' },
  { ad: 'proje', etiket: 'Proje' },
  { ad: 'ortamlar', etiket: 'Ortamlar' },
  { ad: 'tamam', etiket: 'Tamam' }
];

function adimListesi(aktif) {
  const aktifSira = SIHIRBAZ_ADIMLARI.findIndex((a) => a.ad === aktif);
  return h('ol', { class: 'adimlar', 'aria-label': 'Sihirbaz adımları' },
    SIHIRBAZ_ADIMLARI.map((a, i) => h('li', {
      class: [a.yakinda ? 'yakinda' : '', i < aktifSira && !a.yakinda ? 'tamam' : ''].join(' ').trim(),
      'aria-current': a.ad === aktif ? 'step' : null,
      'aria-disabled': a.yakinda ? 'true' : null
    }, a.etiket, i < aktifSira && !a.yakinda ? h('span', { class: 'gorunmez' }, ' (tamamlandı)') : null)));
}

function sihirbazEkrani(adim, baslik, altMetin, ...icerik) {
  const sira = SIHIRBAZ_ADIMLARI.findIndex((a) => a.ad === adim) + 1;
  sayfaBasligi(baslik);
  ekran(odakSayfa({ ustMetin: 'yeni proje' }, anaAlan('ortali',
    h('div', { class: 'sihirbaz-baslik' },
      h('div', { class: 'kirinti' }, h('span', {}, `Adım ${sira} / ${SIHIRBAZ_ADIMLARI.length}`)),
      h('h1', {}, baslik), altMetin ? h('p', { class: 'soluk' }, altMetin) : null),
    adimListesi(adim), ...icerik)));
}

function sihirbaz(adim) {
  history.replaceState(null, '', '/');
  if (adim === 'kasa') return sihirbazKasa();
  if (adim === 'proje') return sihirbazProje();
  if (adim === 'ortamlar') return sihirbazOrtamlar();
  return sihirbazTamam();
}

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
      sihirbazProje();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('kasa', 'Yeni proje başlat', 'Önce bu bilgisayardaki şifreli kasanın parolasını belirleyin.', form);
}

function sihirbazProje() {
  const ad = h('input', { type: 'text', autocomplete: 'off', required: true, maxlength: '120' });
  const aciklama = h('textarea', { rows: '3', maxlength: '1000' });
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Devam', ikon('ok'));
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('katman'), 'Proje bilgileri')), mesaj.kutu,
    alan('Proje adı', ad, { zorunlu: true }),
    alan('Açıklama', aciklama, { yardim: 'İsteğe bağlı.' }),
    h('div', { class: 'dugmeler' }, gonder));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Proje adı boş olamaz.'); ad.focus(); return; }
    try {
      const { proje } = await mesgulIken(gonder, 'Kaydediliyor…', () => api('/platform/proje/kaydet', { govde: { ad: ad.value, aciklama: aciklama.value } }));
      durum.proje = proje;
      durum.projeler = [proje];
      projeSec(proje.id);
      sihirbazOrtamlar();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('proje', 'Yeni proje başlat', 'Projenize bir ad verin; açıklama isteğe bağlıdır.', form);
}

function sihirbazOrtamlar() {
  const satirlar = [];
  const liste = h('div', {});
  const ortamSatiri = (zorunlu) => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: zorunlu ? 'TEST' : '' });
    const adres = h('input', { type: 'url', autocomplete: 'off', placeholder: 'https://', inputmode: 'url' });
    const satir = { ad, adres, zorunlu, el: null };
    const kaldir = zorunlu ? null : h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => {
      satirlar.splice(satirlar.indexOf(satir), 1); satir.el.remove();
    } }, ikon('carpi'), 'Kaldır');
    if (kaldir) kaldir.setAttribute('aria-label', 'Bu ortamı kaldır');
    satir.el = h('div', { class: 'ortam-satiri' },
      alan('Ortam adı', ad, { zorunlu: true }),
      alan('Adres (link)', adres, { zorunlu: true }),
      kaldir || h('span', { class: 'rozet vurgu' }, 'Zorunlu'));
    satirlar.push(satir);
    liste.append(satir.el);
    return satir;
  };
  ortamSatiri(true);
  const ekleDugmesi = h('button', { type: 'button', onclick: () => ortamSatiri(false).ad.focus() }, '+ Ortam ekle');
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet ve bitir', ikon('onay'));
  const form = h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('ag'), 'Ortamlar')),
    h('p', { class: 'soluk' }, 'TEST ortamı zorunludur. Diğer ortamları (ör. hazırlık, canlı) şimdi veya daha sonra Ayarlar\'dan ekleyebilirsiniz.'),
    mesaj.kutu, liste, ekleDugmesi,
    h('div', { class: 'dugmeler' }, gonder));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    let ilkHata = null;
    for (const s2 of satirlar) {
      alanHatasi(s2.ad, ''); alanHatasi(s2.adres, '');
      if (!s2.ad.value.trim()) { alanHatasi(s2.ad, 'Ortam adı boş olamaz.'); ilkHata ??= s2.ad; }
      if (!adresGecerliMi(s2.adres.value.trim())) { alanHatasi(s2.adres, 'Geçerli bir http(s) adresi girin.'); ilkHata ??= s2.adres; }
    }
    if (ilkHata) { ilkHata.focus(); return; }
    try {
      await mesgulIken(gonder, 'Kaydediliyor…', async () => {
        for (const s2 of satirlar) {
          await api('/platform/ortam/kaydet', { govde: { projeId: durum.proje.id, ad: s2.ad.value.trim(), tabanUrl: s2.adres.value.trim(), varsayilan: s2.zorunlu } });
        }
      });
      sihirbazTamam();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  sihirbazEkrani('ortamlar', 'Yeni proje başlat', 'Testlerin çalışacağı adresleri tanımlayın.', form);
}

function sihirbazTamam() {
  sayfaBasligi('Proje hazır');
  ekran(odakSayfa({ ustMetin: 'yeni proje' }, anaAlan('ortali',
    h('div', { class: 'sihirbaz-baslik' }, h('div', { class: 'kirinti' }, h('span', {}, 'Kurulum tamamlandı')),
      h('h1', {}, 'Proje hazır'), h('p', { class: 'soluk' }, 'Kasa, proje ve ortamlar oluşturuldu.')),
    adimListesi('tamam'),
    h('div', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('ekran'), 'Sayfa ekle')),
      h('p', { class: 'soluk' }, 'Test edilecek sayfanın bağlantısını Claude Code\'a verin: sayfayı yalnızca okuyarak inceler ve bir sayfa paketi (model + senaryo önerileri) üretir. Paketi Ekranlar > Sayfa ekle ile yükleyin.'),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', onclick: () => { location.hash = '#/ekranlar/yeni'; yonlendir(); } }, ikon('artiYalin'), 'Sayfa ekle'))),
    h('div', { class: 'kart vurgulu' },
      h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('pusula'), 'Sırada ne var?')),
      h('p', {}, 'Giriş profillerini, bağlam profillerini ve test verilerini Ayarlar\'dan ekleyebilirsiniz.'),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'birincil', onclick: () => { location.hash = '#/ayarlar/proje'; yonlendir(); } }, 'Ayarlara git', ikon('ok')))))));
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
  const form = h('form', { class: 'kart kilit-kart', novalidate: true },
    h('div', { class: 'kilit-baslik' }, h('span', { class: 'kilit-ikon' }, ikon('kilit')),
      h('h1', {}, 'Kasa kilitli'), h('p', { class: 'soluk' }, 'Devam etmek için kasa parolasını girin.')),
    mesaj.kutu, halka.kutu, parola.kapsayici, h('div', { class: 'dugmeler' }, gonder));
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
  ekran(odakSayfa({ ustMetin: 'kilitli' }, anaAlan('ortali dar', form)));
  ekranTemizle = () => durdur();
  parola.girdi.focus();
}

// ---------------------------------------------------------------------------------------
// Ana düzen
// ---------------------------------------------------------------------------------------

function projeSecici() {
  const acik = () => menu.hidden === false;
  const dugme = h('button', { type: 'button', class: 'proje-secici', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Etkin proje' },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, basHarf(durum.proje.ad)),
    h('b', { id: 'proje-rozeti' }, durum.proje.ad),
    durum.proje.aciklama ? h('span', { class: 'aciklama' }, durum.proje.aciklama) : null,
    ikon('asagi'));
  const kapat = () => { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); };
  const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true, 'aria-label': 'Projeler' },
    h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, 'Projeler'),
    durum.projeler.map((p) => h('button', {
      type: 'button', role: 'menuitemradio', 'aria-checked': p.id === durum.proje.id ? 'true' : 'false',
      onclick: () => { kapat(); if (p.id !== durum.proje.id) { projeSec(p.id); location.reload(); } }
    }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, basHarf(p.ad)), p.ad, p.id === durum.proje.id ? ikon('onay') : null)),
    h('hr', {}),
    h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); location.hash = '#/ayarlar/proje'; } }, ikon('duzenle'), 'Projeyi düzenle'));
  dugme.addEventListener('click', () => {
    if (acik()) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  });
  menu.addEventListener('keydown', (o) => {
    const ogeler = [...menu.querySelectorAll('button')];
    const i = ogeler.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (o.key === 'Escape') { kapat(); dugme.focus(); }
    else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length].focus(); }
    else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length].focus(); }
  });
  document.addEventListener('click', (o) => { if (acik() && !kap.contains(/** @type {Node} */ (o.target))) kapat(); });
  const kap = h('div', { class: 'proje-secici-kap' }, dugme, menu);
  return kap;
}

function anaDuzen() {
  const main = anaAlan('ana-icerik');
  const navSonuclar = h('a', { href: '#/sonuclar' }, ikon('grafik'), 'Sonuçlar');
  const navSenaryolar = h('a', { href: '#/senaryolar' }, ikon('liste'), 'Senaryolar');
  const navEkranlar = h('a', { href: '#/ekranlar' }, ikon('ekran'), 'Ekranlar');
  const navAyarlar = h('a', { href: '#/ayarlar/proje' }, ikon('ayar'), 'Ayarlar');
  const kilitle = h('button', { type: 'button', class: 'kilitle-dugmesi', 'aria-label': 'Kilitle' }, ikon('kilit'), h('span', { class: 'dugme-metni' }, 'Kilitle'));
  kilitle.addEventListener('click', async () => {
    await mesgulIken(kilitle, 'Kilitleniyor…', () => api('/platform/kasa/kilitle', { govde: {} }));
    bildir('Kasa kilitlendi.');
    yonlendir();
  });
  const arama = h('button', { type: 'button', class: 'hizli-arama', 'aria-disabled': 'true', title: 'Hızlı arama yakında', 'aria-label': 'Hızlı arama (yakında)' },
    ikon('ara'), h('span', { class: 'arama-metni' }, 'Hızlı ara…'), h('kbd', {}, '⌘K'));
  arama.addEventListener('click', () => bildir('Hızlı arama bir sonraki sürümde gelecek.'));
  const sunucu = sunucuDurumu();
  const ust = h('header', { class: 'ust-cubuk' },
    markaOgesi(),
    projeSecici(),
    h('nav', { class: 'ust-nav', 'aria-label': 'Ana menü' }, navSonuclar, navSenaryolar, navEkranlar, navAyarlar),
    h('span', { class: 'bosluk' }),
    arama, sunucu, temaDugmesi(), kilitle);
  ekran(ust, main);

  const ciz = () => {
    const hash = location.hash || '#/sonuclar';
    const [, bolum, alt, ...kalan] = hash.split('/');
    for (const n of [navSonuclar, navSenaryolar, navEkranlar, navAyarlar]) n.removeAttribute('aria-current');
    if (bolum === 'senaryolar') {
      navSenaryolar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Senaryolar');
      senaryolarModulu().then((m) => m.senaryolarEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Senaryolar ekranı yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'ekranlar') {
      navEkranlar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Ekranlar');
      ekranlarModulu().then((m) => m.ekranlarEkrani(main, alt ? [alt, ...kalan] : [], { durum }))
        .catch((hata) => main.replaceChildren(h('div', { class: 'icerik-alani' }, mesajKutusuHata(`Ekranlar yüklenemedi (${hata.message}). Sunucuyu yeniden başlatın (npm run baslat).`))));
    } else if (bolum === 'ayarlar') {
      navAyarlar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Ayarlar');
      ayarlarEkrani(main, AYAR_BOLUMLERI.some((b) => b.ad === alt) ? alt : 'proje');
    } else {
      // #/sonuclar ve bilinmeyen adresler (ör. eski #/gorunum yer imleri) → Sonuçlar.
      navSonuclar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      sayfaBasligi('Sonuçlar');
      sonuclarEkrani(main, bolum === 'sonuclar' && alt ? [alt, ...kalan] : [], { durum });
    }
  };
  window.addEventListener('hashchange', ciz);
  // Otomatik kilit: sunucu kasayı hareketsizlik sonrası kilitler; arayüz bunu periyodik durum
  // sorgusuyla (etkinlik SAYILMAZ) fark edip kilit ekranına döner. Aynı sorgu sunucu hapını da günceller.
  const kilitKontrolu = setInterval(async () => {
    try {
      const d = await api('/platform/durum');
      sunucu.durumAyarla(true);
      if (d.kasa && d.kasa.olusturuldu && !d.kasa.acik) {
        durum.kilitMesaji = d.otomatikKilit && d.otomatikKilit.sonKilitlenme
          ? `Kasa ${d.otomatikKilit.dakika} dakika işlem yapılmadığı için otomatik olarak kilitlendi.`
          : 'Kasa kilitlendi.';
        kilitEkrani(d.parolaBeklemeSaniye || 0);
      }
    } catch { sunucu.durumAyarla(false); /* bağlantı hatası: bir sonraki denemede */ }
  }, 15_000);
  ekranTemizle = () => { window.removeEventListener('hashchange', ciz); clearInterval(kilitKontrolu); };
  ciz();
}

/** Senaryolar modülü (bir kez yüklenir). */
let senaryolarSozu = null;
const senaryolarModulu = () => (senaryolarSozu ??= import('./senaryolar.js').catch((e) => { senaryolarSozu = null; throw e; }));
/** Ekranlar modülü (bir kez yüklenir). */
let ekranlarSozu = null;
const ekranlarModulu = () => (ekranlarSozu ??= import('./ekranlar.js').catch((e) => { ekranlarSozu = null; throw e; }));
const mesajKutusuHata = (metin) => h('div', { class: 'not-kutusu hata', role: 'alert' }, metin);

function ayarlarEkrani(main, bolum) {
  const icerik = h('section', { class: 'icerik-alani dar-icerik', 'aria-labelledby': 'bolum-basligi' }, iskelet('sayfa'));
  const altNav = h('nav', { class: 'alt-nav', 'aria-label': 'Ayarlar bölümleri' },
    AYAR_BOLUMLERI.map((b) => h('a', { href: `#/ayarlar/${b.ad}`, 'aria-current': b.ad === bolum ? 'page' : null }, ikon(b.ikon), b.etiket)));
  main.replaceChildren(h('h1', { class: 'gorunmez' }, 'Ayarlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ayarlar'), altNav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Kasa'), h('br', {}), 'Parolalar, anahtarlar ve hassas test verileri şifreli saklanır; burada maskeli görünür.')),
      icerik));
  ayarlarBolumu(icerik, bolum, { durum, yonlendir, projeSec, projeleriYenile });
}

yonlendir();
