// Platform kabuğu: /platform/durum'a göre yönlendirme.
//   kasa yok            → Hoş geldiniz (Yedek yükle / Yeni proje başlat / [eski dosyalar varsa]
//                         Mevcut proje dosyalarını aktar)
//   kasa var, kilitli   → Kilit ekranı (yanlış parolada bekleme geri sayımı)
//   kasa açık, proje yok → Yeni proje sihirbazı (proje adımından)
//   kasa açık           → Ana düzen: Mevcut görünüm | Ayarlar | Kilitle  (#/gorunum, #/ayarlar/<bölüm>)
import {
  adresGecerliMi, alan, alanHatasi, api, bildir, geriSayim, h, mesajKutusu, mesgulIken, parolaAlani
} from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { aktarimAkisi } from './aktarim.js';
import { ayarlarBolumu, AYAR_BOLUMLERI } from './ayarlar.js';

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

// ---------------------------------------------------------------------------------------
// Yönlendirme
// ---------------------------------------------------------------------------------------

export async function yonlendir() {
  let d;
  try {
    d = await api('/platform/durum');
  } catch (hata) {
    ekran(anaAlan('ortali', h('h1', {}, 'Sunucuya ulaşılamadı'), h('p', {}, hata.message),
      h('button', { type: 'button', onclick: () => yonlendir() }, 'Tekrar dene')));
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
  if (rozet && durum.proje) rozet.textContent = durum.proje.ad;
}

window.addEventListener('kasa-kilitli', (olay) => {
  // Otomatik kilitlenme sonrası gelen 423 de buraya düşer.
  durum.kilitMesaji = olay.detail || 'Kasa kilitli.';
  kilitEkrani(0);
});

// ---------------------------------------------------------------------------------------
// Hoş geldiniz
// ---------------------------------------------------------------------------------------

async function hosgeldin() {
  history.replaceState(null, '', '/');
  // Bu klasörde eski proje dosyaları (ör. tests/data, .env) varsa üçüncü kart gösterilir.
  let aktarilabilir = null;
  try {
    const d = await api('/platform/aktarim/durum');
    aktarilabilir = d.veritabaniBos ? (d.adaptorler || []).find((a) => a.dosyalarVar && !a.aktarildi) || null : null;
  } catch { aktarilabilir = null; }
  ekran(anaAlan('ortali',
    h('h1', {}, 'Hoş geldiniz'),
    h('p', {}, 'Bu bilgisayarda henüz bir proje yok. Başlamak için bir seçenek belirleyin.'),
    h('div', { class: 'secim-kartlari' },
      aktarilabilir ? h('button', { type: 'button', class: 'secim-karti', onclick: () => dosyaAktarimEkrani(aktarilabilir) },
        h('strong', {}, 'Mevcut proje dosyalarını aktar'),
        h('span', {}, `Bu klasördeki ${aktarilabilir.projeAdi} dosyalarını (test verileri, ortamlar, giriş bilgileri, senaryolar) şifreli platform veritabanına aktarın. Dosyalar değiştirilmez.`)) : null,
      h('button', { type: 'button', class: 'secim-karti', onclick: () => yedekYukleEkrani() },
        h('strong', {}, 'Yedek yükle'),
        h('span', {}, 'Başka bir bilgisayardan aldığınız .tayedek dosyasını yükleyin. Yedeğin parolası bu bilgisayarın kasa parolası olur.')),
      h('button', { type: 'button', class: 'secim-karti', onclick: () => sihirbaz('kasa') },
        h('strong', {}, 'Yeni proje başlat'),
        h('span', {}, 'Kasa parolası belirleyin, projenizi ve test ortamlarınızı tanımlayın.')))));
}

function dosyaAktarimEkrani(adaptor) {
  const kapsayici = h('div', {});
  ekran(anaAlan('ortali', h('h1', { class: 'gorunmez' }, 'Mevcut proje dosyalarını aktar'), kapsayici));
  aktarimAkisi(kapsayici, {
    mod: 'hosgeldin', adaptor,
    bitti: () => { location.hash = '#/gorunum'; yonlendir(); },
    vazgec: () => hosgeldin()
  });
}

function yedekYukleEkrani() {
  const kapsayici = h('div', {});
  ekran(anaAlan('ortali', h('h1', { class: 'gorunmez' }, 'Yedek yükle'), kapsayici));
  iceAktarmaAkisi(kapsayici, { mod: 'hosgeldin', bitti: () => { location.hash = '#/ayarlar/proje'; yonlendir(); }, vazgec: () => hosgeldin() });
}

// ---------------------------------------------------------------------------------------
// Yeni proje sihirbazı
// ---------------------------------------------------------------------------------------

const SIHIRBAZ_ADIMLARI = [
  { ad: 'kasa', etiket: 'Kasa parolası' },
  { ad: 'proje', etiket: 'Proje' },
  { ad: 'ortamlar', etiket: 'Ortamlar' },
  { ad: 'sayfa', etiket: 'Sayfa ekle (yakında)', yakinda: true },
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
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kasayı oluştur ve devam et');
  const form = h('form', { class: 'kart', novalidate: true },
    h('h2', {}, 'Kasa parolası belirleyin'),
    h('div', { class: 'not-kutusu uyari' },
      h('p', {}, h('strong', {}, 'Bu parolayı unutmayın. '), 'Parola unutulursa veriler kurtarılamaz; parolanın bir kopyası hiçbir yerde saklanmaz.')),
    mesaj.kutu, p1.kapsayici, p2.kapsayici,
    h('label', { class: 'secenek', for: 'parola-anladim' }, anladim, 'Parolayı unutursam verilerin kurtarılamayacağını anladım.'),
    h('div', { class: 'dugmeler' }, gonder, h('button', { type: 'button', onclick: () => hosgeldin() }, 'Geri')));
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
  ekran(anaAlan('ortali', h('h1', {}, 'Yeni proje başlat'), adimListesi('kasa'), form));
}

function sihirbazProje() {
  const ad = h('input', { type: 'text', autocomplete: 'off', required: true, maxlength: '120' });
  const aciklama = h('textarea', { rows: '3', maxlength: '1000' });
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Devam');
  const form = h('form', { class: 'kart', novalidate: true },
    h('h2', {}, 'Proje bilgileri'), mesaj.kutu,
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
  ekran(anaAlan('ortali', h('h1', {}, 'Yeni proje başlat'), adimListesi('proje'), form));
}

function sihirbazOrtamlar() {
  const satirlar = [];
  const liste = h('div', {});
  const ortamSatiri = (zorunlu) => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: zorunlu ? 'TEST' : '' });
    const adres = h('input', { type: 'url', autocomplete: 'off', placeholder: 'https://' , inputmode: 'url' });
    const satir = { ad, adres, zorunlu, el: null };
    const kaldir = zorunlu ? null : h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
      satirlar.splice(satirlar.indexOf(satir), 1); satir.el.remove();
    } }, 'Kaldır');
    if (kaldir) kaldir.setAttribute('aria-label', 'Bu ortamı kaldır');
    satir.el = h('div', { class: 'ortam-satiri' },
      alan(zorunlu ? 'Ortam adı' : 'Ortam adı', ad, { zorunlu: true }),
      alan('Adres (link)', adres, { zorunlu: true }),
      kaldir || h('span', { class: 'rozet vurgu' }, 'Zorunlu'));
    satirlar.push(satir);
    liste.append(satir.el);
    return satir;
  };
  ortamSatiri(true);
  const ekleDugmesi = h('button', { type: 'button', onclick: () => ortamSatiri(false).ad.focus() }, '+ Ortam ekle');
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet ve bitir');
  const form = h('form', { class: 'kart', novalidate: true },
    h('h2', {}, 'Ortamlar'),
    h('p', { class: 'soluk' }, 'TEST ortamı zorunludur. Diğer ortamları (ör. hazırlık, canlı) şimdi veya daha sonra Ayarlar\'dan ekleyebilirsiniz.'),
    mesaj.kutu, liste, ekleDugmesi,
    h('div', { class: 'dugmeler' }, gonder));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    let ilkHata = null;
    for (const s of satirlar) {
      alanHatasi(s.ad, ''); alanHatasi(s.adres, '');
      if (!s.ad.value.trim()) { alanHatasi(s.ad, 'Ortam adı boş olamaz.'); ilkHata ??= s.ad; }
      if (!adresGecerliMi(s.adres.value.trim())) { alanHatasi(s.adres, 'Geçerli bir http(s) adresi girin.'); ilkHata ??= s.adres; }
    }
    if (ilkHata) { ilkHata.focus(); return; }
    try {
      await mesgulIken(gonder, 'Kaydediliyor…', async () => {
        for (const s of satirlar) {
          await api('/platform/ortam/kaydet', { govde: { projeId: durum.proje.id, ad: s.ad.value.trim(), tabanUrl: s.adres.value.trim(), varsayilan: s.zorunlu } });
        }
      });
      sihirbazTamam();
    } catch (hata) {
      mesaj.goster(hata.message);
    }
  });
  ekran(anaAlan('ortali', h('h1', {}, 'Yeni proje başlat'), adimListesi('ortamlar'), form));
}

function sihirbazTamam() {
  ekran(anaAlan('ortali', h('h1', {}, 'Proje hazır'), adimListesi('tamam'),
    h('div', { class: 'kart pasif-kart', 'aria-disabled': 'true' },
      h('h2', {}, 'Sayfa ekle (yakında)'),
      h('p', { class: 'soluk' }, 'Test edilecek sayfaları ve senaryoları tanımlama adımı bir sonraki sürümde eklenecek.'),
      h('button', { type: 'button', disabled: true }, 'Sayfa ekle')),
    h('div', { class: 'kart' },
      h('h2', {}, 'Sırada ne var?'),
      h('p', {}, 'Giriş profillerini, bağlam profillerini ve test verilerini Ayarlar\'dan ekleyebilirsiniz.'),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'birincil', onclick: () => { location.hash = '#/ayarlar/proje'; yonlendir(); } }, 'Ayarlara git')))));
}

// ---------------------------------------------------------------------------------------
// Kilit ekranı
// ---------------------------------------------------------------------------------------

function kilitEkrani(beklemeSaniye) {
  const parola = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'current-password' });
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Kilidi aç');
  const form = h('form', { class: 'kart', novalidate: true }, mesaj.kutu, parola.kapsayici, h('div', { class: 'dugmeler' }, gonder));
  let durdur = () => {};
  const bekle = (saniye, onMetin) => {
    durdur();
    durdur = geriSayim(saniye, (kalan) => {
      gonder.disabled = kalan > 0;
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
  ekran(anaAlan('ortali dar', h('h1', {}, 'Kasa kilitli'), h('p', { class: 'soluk' }, 'Devam etmek için kasa parolasını girin.'), form));
  ekranTemizle = () => durdur();
  parola.girdi.focus();
}

// ---------------------------------------------------------------------------------------
// Ana düzen
// ---------------------------------------------------------------------------------------

function anaDuzen() {
  const main = anaAlan('ana-icerik');
  const navGorunum = h('a', { href: '#/gorunum' }, 'Mevcut görünüm');
  const navAyarlar = h('a', { href: '#/ayarlar/proje' }, 'Ayarlar');
  const kilitle = h('button', { type: 'button' }, 'Kilitle');
  kilitle.addEventListener('click', async () => {
    await mesgulIken(kilitle, 'Kilitleniyor…', () => api('/platform/kasa/kilitle', { govde: {} }));
    bildir('Kasa kilitlendi.');
    yonlendir();
  });
  const ust = h('header', { class: 'ust-cubuk' },
    h('span', { class: 'marka' }, 'Test otomasyon platformu'),
    h('span', { class: 'proje-rozeti', id: 'proje-rozeti', title: 'Etkin proje' }, durum.proje.ad),
    h('nav', { class: 'ust-nav', 'aria-label': 'Ana menü' }, navGorunum, navAyarlar),
    kilitle);
  ekran(ust, main);

  const ciz = () => {
    const hash = location.hash || '#/gorunum';
    const [, bolum, alt] = hash.split('/');
    navGorunum.removeAttribute('aria-current');
    navAyarlar.removeAttribute('aria-current');
    if (bolum === 'ayarlar') {
      navAyarlar.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik';
      ayarlarEkrani(main, AYAR_BOLUMLERI.some((b) => b.ad === alt) ? alt : 'proje');
    } else {
      navGorunum.setAttribute('aria-current', 'page');
      main.className = 'ana-icerik tam-genislik';
      mevcutGorunum(main);
    }
  };
  window.addEventListener('hashchange', ciz);
  // Otomatik kilit: sunucu kasayı hareketsizlik sonrası kilitler; arayüz bunu periyodik durum
  // sorgusuyla (etkinlik SAYILMAZ) fark edip kilit ekranına döner.
  const kilitKontrolu = setInterval(async () => {
    try {
      const d = await api('/platform/durum');
      if (d.kasa && d.kasa.olusturuldu && !d.kasa.acik) {
        durum.kilitMesaji = d.otomatikKilit && d.otomatikKilit.sonKilitlenme
          ? `Kasa ${d.otomatikKilit.dakika} dakika işlem yapılmadığı için otomatik olarak kilitlendi.`
          : 'Kasa kilitlendi.';
        kilitEkrani(d.parolaBeklemeSaniye || 0);
      }
    } catch { /* bağlantı hatası: bir sonraki denemede */ }
  }, 15_000);
  ekranTemizle = () => { window.removeEventListener('hashchange', ciz); clearInterval(kilitKontrolu); };
  ciz();
}

function mevcutGorunum(main) {
  let ortam = 'test';
  try { ortam = localStorage.getItem('platform.gorunumOrtami') === 'canli' ? 'canli' : 'test'; } catch { /* yok sayılır */ }
  const secim = h('select', { id: 'gorunum-ortami' },
    h('option', { value: 'test', selected: ortam === 'test' }, 'test'),
    h('option', { value: 'canli', selected: ortam === 'canli' }, 'canli'));
  const durumMetni = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const cerceve = h('iframe', { class: 'gorunum-cercevesi', title: 'Mevcut görünüm (dashboard)' });
  const yukle = (yenile) => {
    durumMetni.textContent = yenile ? 'Görünüm yeniden üretiliyor… (bu biraz sürebilir)' : 'Yükleniyor…';
    cerceve.src = `/gorunum/${secim.value}${yenile ? '?yenile=1' : ''}`;
  };
  cerceve.addEventListener('load', () => { durumMetni.textContent = ''; });
  secim.addEventListener('change', () => {
    try { localStorage.setItem('platform.gorunumOrtami', secim.value); } catch { /* yok sayılır */ }
    yukle(false);
  });
  const yenile = h('button', { type: 'button', onclick: () => yukle(true) }, 'Yeniden üret');
  const yeniSekme = h('a', { class: 'dugme', target: '_blank', rel: 'noopener', href: `/gorunum/${ortam}` }, 'Yeni sekmede aç');
  secim.addEventListener('change', () => { yeniSekme.href = `/gorunum/${secim.value}`; });
  main.replaceChildren(
    h('h1', { class: 'gorunmez' }, 'Mevcut görünüm'),
    h('div', { class: 'gorunum-cubugu' }, alan('Ortam', secim), yenile, yeniSekme, durumMetni),
    cerceve);
  yukle(false);
}

function ayarlarEkrani(main, bolum) {
  const icerik = h('section', { 'aria-labelledby': 'bolum-basligi' });
  const altNav = h('nav', { class: 'alt-nav', 'aria-label': 'Ayarlar bölümleri' },
    AYAR_BOLUMLERI.map((b) => h('a', { href: `#/ayarlar/${b.ad}`, 'aria-current': b.ad === bolum ? 'page' : null }, b.etiket)));
  main.replaceChildren(h('h1', {}, 'Ayarlar'), h('div', { class: 'ayarlar-duzeni' }, altNav, icerik));
  ayarlarBolumu(icerik, bolum, { durum, yonlendir, projeSec, projeleriYenile });
}

yonlendir();
