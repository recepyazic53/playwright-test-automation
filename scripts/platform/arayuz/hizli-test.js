// HIZLI TEST SİHİRBAZI (#/hizli-test) — Basit modun "+ Yeni test"i; Gelişmiş modda Oluştur menüsünden ve Ekran ekle sayfasından da açılır.
// Altı durak: 1 Başlat (adres, ortam, "Ne yapılsın?", basma izni) → 2 Keşfet (basmadan) → 3 Veri durağı (Doldur / elle) → 4 Adım adım
// ("Şimdi ne yapayım?", Bana sor onayı, hata sorusu) → 5 Bitiş koşulu (Bitti / Devam / Hata) → 6 Kaydet (doğrulama sorusu, farklar).
// Sunucu: /platform/hizli-test/* (hizli-test/yonetici.mjs) — durum makinesi sunucudadır; bu sayfa durumu yoklar ve soruyu çizer.
// Adresler: #/hizli-test (yeni), #/hizli-test/duzenle/<ekranId> (düzenleme kipi: ekranın adresiyle başlar, kayıt yeni model sürümü),
// #/hizli-test/o/<oturumId> (süren sihirbaz; sayfa yenilense de sürer), #/hizli-test/ozet/<oturumId> (kayıt özeti; kendi sekmesinde açılır). Değer ÜRETİLMEZ: alanlara yalnız kullanıcı yazar ya da
// "Doldur" ile tablodan seçer. Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, degisiklikleriBirak, h, ikon, mesajKutusu, mesgulIken, rozet, yerlestir } from './ortak.js';
import { doldurDugmesi } from './doldur.js';
import { testVerisiSecimi } from './sayfa-paketi.js';
import { adresliIstek } from './adres-ayirma.js';

const DURAKLAR = ['Başlat', 'Keşfet', 'Veri durağı', 'Adım adım', 'Bitiş koşulu', 'Kaydet'];
const IZIN_SECENEKLERI = [
  { deger: 'evet', baslik: 'Evet', aciklama: 'Gereken düğmelere basarım; birden çok aday varsa yine sorarım.' },
  { deger: 'sor', baslik: 'Bana sor', aciklama: 'Her düğmeden önce sorarım, yalnız onayladıklarına basarım.' },
  { deger: 'hayir', baslik: 'Hayır', aciklama: 'Hiçbir düğmeye basmam; düğmeyi ve mesajı siz seçersiniz, test “doğrulanmadı” olarak kaydedilir.' }
];
const ETIKETLER = [['bitti', 'Bitti'], ['devam', 'Devam'], ['hata', 'Hata']];
/** Kullanım modu Basit mi (hızlı test iki modda da açılır): kayıt sonrası / vazgeç bağlantısı moda göre. */
let basitMod = false;
/** Basit'te "Testlerim" (Basit mod sayfası), Gelişmiş'te "Senaryolar". */
const listeHedefi = () => (basitMod ? { adres: '#/testlerim', ad: 'Testlerim' } : { adres: '#/senaryolar', ad: 'Senaryolara git' });
/** Bitiş durağındaki radyo seçenekleri: üç etiket + "Etiketsiz" (seçili radyoya tıklamak seçimi kaldırmaz; etiketi kaldırmak için bu seçilir). */
const ETIKET_SECENEKLERI = [...ETIKETLER, [null, 'Etiketsiz']];
/** Süren işlerde yoklama aralığı (ms). */
const YOKLAMA_MS = 1000;

/** Alanın "Doldur" bileşenine verilecek tipi (sayfa türü → model tipi). @param {string} tur */
const doldurTipi = (tur) => ({ select: 'secim', radio: 'radyo', checkbox: 'onayKutusu', date: 'tarih', number: 'sayi', tel: 'telefon' })[tur] || 'metin';
/** @param {unknown} e */
const hataMetni = (e) => (e && typeof e === 'object' && 'message' in e ? String(/** @type {any} */ (e).message) : String(e));

/** Altı duraklı şerit. @param {number} etkin 1–6 */
function durakSeridi(etkin) {
  return h('ol', { class: 'basit-adimlar hizli-duraklar', 'aria-label': 'Hızlı test durakları' },
    DURAKLAR.map((ad, i) => h('li', { class: i + 1 === etkin ? 'etkin' : i + 1 < etkin ? 'gecti' : null, 'aria-current': i + 1 === etkin ? 'step' : null },
      h('span', { class: 'adim-no', 'aria-hidden': 'true' }, String(i + 1)), ad)));
}

/**
 * Sihirbaz sayfası. @param {HTMLElement} icerik @param {string[]} parcalar @param {{ durum: any }} baglam
 */
export function hizliTestEkrani(icerik, parcalar, baglam) {
  const proje = baglam.durum && baglam.durum.proje;
  basitMod = Boolean(baglam.durum && baglam.durum.kullanimModu && baglam.durum.kullanimModu.mod === 'basit');
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, 'Hızlı test'),
    h('p', { class: 'soluk' }, 'Sayfanın adresini verin: Nöbetçi alanları bulur, eksik veriyi size sorar, düğmelere yalnız izin verdiğiniz kadar basar ve sonunda testi kaydeder.')));
  const govde = h('div', { class: 'hizli-test' });
  icerik.replaceChildren(baslik, govde);
  // Kayıt özeti kendi sekmesinde: oturum kimliği yeter (proje oturumdan gelir).
  if (parcalar[0] === 'ozet' && parcalar[1]) { void ozetEkrani(govde, parcalar[1]); return; }
  if (!proje) {
    govde.replaceChildren(h('div', { class: 'not-kutusu uyari', role: 'note' }, 'Önce bir proje seçin (üst çubuk).'));
    return;
  }
  if (parcalar[0] === 'o' && parcalar[1]) { oturumEkrani(govde, parcalar[1]); return; }
  baslatEkrani(govde, proje, parcalar[0] === 'duzenle' ? parcalar[1] || null : null);
}

/** 1. durak: Başlat. @param {HTMLElement} govde @param {{ id: string }} proje @param {string | null} ekranId */
async function baslatEkrani(govde, proje, ekranId) {
  govde.replaceChildren(durakSeridi(1), h('p', { class: 'soluk' }, 'Yükleniyor…'));
  let s;
  try {
    s = await api(`/platform/hizli-test/secenekler?projeId=${encodeURIComponent(proje.id)}${ekranId ? `&ekranId=${encodeURIComponent(ekranId)}` : ''}`);
  } catch (e) {
    if (e && e.durum === 423) return;
    govde.replaceChildren(durakSeridi(1), h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
    return;
  }
  const mesaj = mesajKutusu();
  const ad = h('input', { type: 'text', id: 'hizli-ad', maxlength: 120, autocomplete: 'off', placeholder: 'ör. Başvuru formu', value: s.ekran ? s.ekran.ad : '' });
  if (s.ekran) ad.readOnly = true;
  const adres = h('input', { type: 'text', id: 'hizli-adres', maxlength: 2000, autocomplete: 'off', placeholder: '/basvuru', value: s.ekran && s.ekran.urlYolu ? s.ekran.urlYolu : '' });
  const ortam = h('select', { id: 'hizli-ortam' }, (s.ortamlar || []).map((o) => h('option', { value: o.id, selected: o.varsayilan || null }, o.canli ? `${o.ad} — CANLI ortam` : o.ad)));
  const cumle = h('textarea', { id: 'hizli-cumle', rows: 2, maxlength: 1000, placeholder: 'ör. Hesapla butonuna tıklayacağım, Başvurunuz alındı yazısını görünce bitir' });
  const girissiz = h('input', { type: 'checkbox', id: 'hizli-girissiz' });
  const girissizSatiri = h('label', { class: 'onay-satiri', for: 'hizli-girissiz' }, girissiz, 'Giriş yapmadan aç (ortamın giriş tarifi kullanılmaz)');
  const secilenOrtam = () => (s.ortamlar || []).find((o) => o.id === ortam.value) || null;
  const girisGuncelle = () => { const o = secilenOrtam(); girissizSatiri.hidden = !(o && o.tarif); if (girissizSatiri.hidden) girissiz.checked = false; };
  ortam.addEventListener('change', girisGuncelle);
  girisGuncelle();
  const izinler = IZIN_SECENEKLERI.map((x) => {
    const r = h('input', { type: 'radio', name: 'hizli-izin', value: x.deger, id: `hizli-izin-${x.deger}` });
    return { r, el: h('label', { class: 'onay-satiri hizli-izin-secenegi', for: r.id }, r, h('span', {}, h('b', {}, x.baslik), h('small', { class: 'blok soluk' }, x.aciklama))) };
  });
  const baslat = h('button', { type: 'submit', class: 'birincil' }, ikon('oynat'), 'Başlat');
  const form = h('form', { class: 'kart hizli-baslat', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('simsek'), s.ekran ? `Hızlı test: ${s.ekran.ad} (düzenle)` : 'Yeni hızlı test'),
      h('span', { class: 'sag' }, rozet('1 / 6'))),
    s.surenOturum ? h('div', { class: 'not-kutusu bilgi', role: 'note' }, 'Süren bir hızlı test var: ',
      h('a', { href: `#/hizli-test/o/${encodeURIComponent(s.surenOturum.id)}` }, `“${s.surenOturum.ekranAdi}” testine dön`)) : null,
    s.ekran ? h('div', { class: 'not-kutusu bilgi', role: 'note' }, 'Düzenleme: kaydedince ekranın yeni model sürümü oluşur; farklar kaydetmeden önce onayınıza sunulur.') : null,
    mesaj.kutu,
    h('div', { class: 'alan' }, h('label', { for: 'hizli-ad' }, 'Testin adı'), ad),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-adres' }, 'Sayfa adresi'), adres,
      h('div', { class: 'yardim' }, 'Ortamın adresine göre yol (ör. /basvuru) ya da tam adres. Başka bir sitenin adresi kayıtlı değilse kaydetmeyi size sorarım.')),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-ortam' }, 'Ortam'), ortam),
    girissizSatiri,
    h('div', { class: 'alan' }, h('label', { for: 'hizli-cumle' }, 'Ne yapılsın? ', h('span', { class: 'soluk' }, '(isteğe bağlı)')), cumle,
      h('div', { class: 'yardim' }, 'Kalıp gerekmez, normal yazın. Örnekler: “Hesapla butonuna tıklayacağım”; “Başvurunuz alındı yazısını görünce bitir”; “Toplam tutarı yazısı gelmeli”. Anlaşılmayan kısım yok sayılır.')),
    h('fieldset', { class: 'hizli-izinler' }, h('legend', {}, 'Nöbetçi sayfadaki düğmelere basabilir mi?'), izinler.map((x) => x.el)),
    h('div', { class: 'dugmeler' }, baslat,
      h('a', { class: 'dugme hayalet', href: listeHedefi().adres }, 'Vazgeç')));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    const izin = (izinler.find((x) => x.r.checked) || { r: { value: '' } }).r.value;
    if (!ad.value.trim()) { mesaj.goster('Testin adını yazın.'); ad.focus(); return; }
    if (!adres.value.trim()) { mesaj.goster('Sayfa adresini yazın.'); adres.focus(); return; }
    if (!izin) { mesaj.goster('Nöbetçi’nin düğmelere basıp basamayacağını seçin.'); izinler[0].r.focus(); return; }
    const o = secilenOrtam();
    let canliOnay = false;
    if (o && o.canli) {
      const { onayIste } = await import('./kosu-paneli.js');
      canliOnay = await onayIste({
        baslik: 'CANLI ortam', ikonAd: 'uyari', dugme: 'Evet, devam et', tehlikeli: false,
        metin: (s.canliOnayMetinleri && s.canliOnayMetinleri[izin]) || 'CANLI ortamda çalışılacak.'
      });
      if (!canliOnay) return;
    }
    try {
      const istek = () => api('/platform/hizli-test/baslat', {
        govde: {
          projeId: proje.id, ortamId: ortam.value, hedef: adres.value.trim(), ...(s.ekran ? { ekranId: s.ekran.id } : { ekranAdi: ad.value.trim() }),
          cumle: cumle.value.trim() || undefined, izin, girissiz: girissiz.checked || undefined, ...(canliOnay ? { canliOnay: true } : {})
        }
      });
      // Başka bir sitenin tam adresi kayıtlı değilse sorulur; onaylanmadan hiçbir istek atılmaz.
      const { onayIste } = await import('./kosu-paneli.js');
      const y = await mesgulIken(baslat, 'Başlatılıyor…', () => adresliIstek(istek, { projeId: proje.id, ortamId: ortam.value, onayIste }));
      // Girilenler sunucuya gitti: çıkış uyarısı gerekmez.
      degisiklikleriBirak();
      location.hash = `#/hizli-test/o/${encodeURIComponent(y.id)}`;
    } catch (e) {
      if (e && e.durum === 423) return;
      mesaj.goster(hataMetni(e));
    }
  });
  govde.replaceChildren(durakSeridi(1), form);
  (s.ekran ? adres : ad).focus();
}

/** 2–6. duraklar: süren oturum (sunucunun durumu yoklanır; soru değişince yeniden çizilir). @param {HTMLElement} govde @param {string} id */
function oturumEkrani(govde, id) {
  const ana = h('div', { class: 'hizli-ana' });
  const yan = h('aside', { class: 'hizli-yan', 'aria-label': 'Tarayıcıda şu an' });
  const serit = h('div', {});
  const durumSatiri = h('div', { class: 'hizli-durum', role: 'status', 'aria-live': 'polite' });
  govde.replaceChildren(serit, durumSatiri, h('div', { class: 'hizli-duzen' }, ana, yan));
  let imza = '';
  let yanImza = '';
  /** @type {ReturnType<typeof setTimeout> | null} */
  let zamanlayici = null;
  let bitti = false;
  const yenile = async () => {
    if (!govde.isConnected) return;
    let o;
    try {
      o = (await api(`/platform/hizli-test/durum?id=${encodeURIComponent(id)}`)).oturum;
    } catch (e) {
      if (e && e.durum === 423) return;
      yerlestir(ana, h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)), h('p', {}, h('a', { href: '#/hizli-test' }, 'Yeni hızlı test başlat')));
      return;
    }
    ciz(o);
    bitti = ['kaydedildi', 'iptal', 'hata'].includes(o.durum);
    if (!bitti && govde.isConnected) zamanlayici = setTimeout(yenile, YOKLAMA_MS);
  };
  /** Bir işlemden sonra hemen yeniden yokla. */
  const hemen = () => { if (zamanlayici) clearTimeout(zamanlayici); imza = ''; void yenile(); };
  /** @param {any} o */
  const ciz = (o) => {
    const yeniImza = JSON.stringify([o.durum, o.soru, o.calisiyor, o.sonHata, o.hata, o.dogrulamaAdimlari]);
    yerlestir(serit, durakSeridi(o.durak || 1));
    durumSatiri.textContent = o.calisiyor ? o.calisiyor : '';
    const yeniYan = JSON.stringify([o.adimlar, o.gunluk.length, (o.goruntu || '').length]);
    if (yeniYan !== yanImza) { yanImza = yeniYan; yanCiz(yan, o); }
    if (yeniImza === imza) return;
    imza = yeniImza;
    yerlestir(ana, soruCiz(o, { hemen }));
    const odak = ana.querySelector('[data-odak]');
    if (odak instanceof HTMLElement) odak.focus();
  };
  void yenile();
}

/** Sağ sütun: son görüntü, zincir, günlük. @param {HTMLElement} yan @param {any} o */
function yanCiz(yan, o) {
  const zincir = (o.adimlar || []).filter((a) => a.bas || a.alanlar.some((x) => x.deger !== null));
  yerlestir(yan,
    h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Tarayıcıda şu an'),
      h('span', { class: 'sag' }, rozet(o.ortam.canli ? `${o.ortam.ad} · CANLI ortam` : o.ortam.ad, o.ortam.canli ? 'uyari' : ''), rozet(`İzin: ${o.izinAdi}`))),
      o.goruntu ? h('img', { class: 'hizli-goruntu', src: `data:image/jpeg;base64,${o.goruntu}`, alt: 'Hızlı test tarayıcısındaki sayfanın son görüntüsü' })
        : h('p', { class: 'soluk kucuk' }, 'Görüntü keşiften sonra gelir.'),
      h('p', { class: 'soluk kucuk' }, `Sayfa: ${o.hedef}`)),
    zincir.length ? h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Zincir')),
      h('ol', { class: 'hizli-zincir' }, zincir.map((a) => h('li', {},
        a.alanlar.length ? h('span', {}, `${a.alanlar.filter((x) => x.deger !== null).length} alan dolduruldu`) : null,
        a.bas ? h('span', {}, a.alanlar.length ? ' → ' : '', h('b', {}, `“${a.bas.metin || a.bas.secici}”`), ' basıldı') : null)))) : null,
    o.gunluk && o.gunluk.length ? h('details', { class: 'kart hizli-gunluk' }, h('summary', {}, 'Olanlar'),
      h('ul', {}, o.gunluk.slice().reverse().map((g) => h('li', { class: 'kucuk' }, g.metin)))) : null);
}

/**
 * Sorunun çizimi. @param {any} o @param {{ hemen: () => void }} y
 * @returns {HTMLElement}
 */
function soruCiz(o, y) {
  const s = o.soru;
  const hata = o.sonHata ? h('div', { class: 'not-kutusu hata', role: 'alert' }, o.sonHata) : null;
  const iptal = !['kaydedildi', 'iptal', 'hata'].includes(o.durum)
    ? h('button', { type: 'button', class: 'hayalet hizli-iptal', onclick: async () => {
      const { onayIste } = await import('./kosu-paneli.js');
      if (!(await onayIste({ baslik: 'Hızlı testi iptal et', metin: 'Tarayıcı kapanır; hiçbir şey kaydedilmez.', dugme: 'İptal et', ikonAd: 'uyari' }))) return;
      try { await api('/platform/hizli-test/iptal', { govde: { id: o.id } }); } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); }
      y.hemen();
    } }, 'Hızlı testi iptal et') : null;
  const kart = (baslikMetni, ikonAd, ...cocuklar) => h('section', { class: 'kart hizli-soru' },
    h('div', { class: 'kart-basligi' }, h('h3', { tabindex: '-1', 'data-odak': '' }, ikon(ikonAd), baslikMetni), h('span', { class: 'sag' }, rozet(`${o.durak} / 6`))),
    o.uyari ? h('div', { class: 'not-kutusu uyari', role: 'alert' }, o.uyari) : null, hata, ...cocuklar, iptal ? h('div', { class: 'hizli-alt' }, iptal) : null);
  /** Uç çağrısı + hata kutusu. @param {HTMLButtonElement} dugme @param {string} uc @param {Record<string, unknown>} govde @param {{ goster: (m: string) => void }} m */
  const gonder = async (dugme, uc, govde, m) => {
    try {
      const r = await mesgulIken(dugme, 'Gönderiliyor…', () => api(`/platform/hizli-test/${uc}`, { govde: { id: o.id, ...govde } }));
      // Seçimler sunucuya gitti (oturumda saklanır): çıkış uyarısı gerekmez.
      degisiklikleriBirak();
      y.hemen();
      return r;
    } catch (e) {
      if (!(e && e.durum === 423)) m.goster(hataMetni(e));
      return null;
    }
  };

  if (o.durum === 'hata' || o.durum === 'iptal') {
    return h('section', { class: 'kart hizli-soru' },
      h('div', { class: `not-kutusu ${o.durum === 'iptal' ? 'bilgi' : 'hata'}`, role: 'alert' }, (o.hata && o.hata.mesaj) || 'Hızlı test durdu.'),
      h('div', { class: 'dugmeler' }, h('a', { class: 'dugme birincil', href: '#/hizli-test' }, ikon('yenile'), 'Yeni hızlı test başlat')));
  }
  if (!s) {
    const adimlar = o.is && Array.isArray(o.is.adimlar) ? o.is.adimlar : [];
    return kart(o.durum === 'dogrulama' ? 'Doğrulama koşusu' : o.durum === 'kesif' ? 'Keşfediliyor…' : 'Çalışıyor…', 'pusula',
      h('p', { class: 'hizli-bekliyor' }, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), o.calisiyor || 'Bekleyin…'),
      o.durum === 'kesif' ? h('p', { class: 'soluk' }, 'Bu adımda hiçbir düğmeye basılmaz: alanlar, koşullar, düğme ve mesaj adayları okunur.') : null,
      // Doğrulama koşusu: zincirin adımları ve hangisinde olunduğu (motorun ilerleme bildirimleri).
      o.durum === 'dogrulama' && o.dogrulamaAdimlari ? dogrulamaAdimListesi(o.dogrulamaAdimlari) : null,
      // İşin (hazırlık / giriş) adımları yalnız keşifte anlamlı; sonrasında eski ileti (ör. "Tarayıcı hazır") yanıltır.
      o.durum === 'kesif' && adimlar.length ? h('ul', { class: 'hizli-is-adimlari kucuk' }, adimlar.map((a) => h('li', {}, `${a.etiket}: ${a.durum === 'tamam' ? 'tamam' : a.durum === 'atlandi' ? 'atlandı' : a.durum === 'hata' ? 'hata' : a.durum === 'suruyor' ? 'sürüyor' : 'bekliyor'}${a.mesaj ? ` — ${a.mesaj}` : ''}`))) : null);
  }
  const m = mesajKutusu();

  if (s.tur === 'veri') return veriDuragi(o, s, kart, m, gonder);

  if (s.tur === 'karar') {
    const sonFark = [...o.adimlar].reverse().find((a) => a.fark);
    const secenek = (deger, ...icerik) => {
      const r = h('input', { type: 'radio', name: 'hizli-karar', value: deger, id: `hizli-karar-${deger}` });
      return { r, el: h('label', { class: 'onay-satiri hizli-karar-secenegi', for: r.id }, r, h('span', {}, ...icerik)) };
    };
    const aday = h('select', { id: 'hizli-aday', 'aria-label': 'Basılacak düğme' },
      s.adaylar.map((a) => h('option', { value: a.secici, selected: a.secici === s.oneri || null }, `${a.metin || a.secici}${a.kayitOlusturabilir ? ' (kayıt oluşturabilir)' : ''}`)));
    const bitir = secenek('bitir', h('b', {}, 'Burada bitir.'), s.bitirilebilir ? ' Görülen metinlerden bitiş koşulunu seçersiniz.' : h('small', { class: 'blok soluk' }, 'Önce en az bir düğmeye basılmalı.'));
    bitir.r.disabled = !s.bitirilebilir;
    const devam = secenek('bas', h('b', {}, 'Devam et: '), aday, h('span', {}, ' düğmesine bas.'), o.izin === 'sor' ? h('small', { class: 'blok soluk' }, 'Bana sor: basmadan önce ayrıca onayınız istenir.') : null);
    const baska = secenek('baska', h('b', {}, 'Başka bir düğmeye bas…'), ' (tarayıcıda tıklayarak seçin)');
    if (!s.adaylar.length) { devam.r.disabled = true; baska.r.checked = true; } else if (s.bitirilebilir && !sonFark?.fark?.yeniDugmeler?.length) bitir.r.checked = true; else devam.r.checked = true;
    const uygula = h('button', { type: 'button', class: 'birincil' }, 'Uygula');
    uygula.addEventListener('click', () => {
      const k = [bitir, devam, baska].find((x) => x.r.checked);
      if (!k) { m.goster('Bir seçim yapın.'); return; }
      void gonder(uygula, 'karar', k.r.value === 'bas' ? { karar: 'bas', secici: aday.value } : { karar: k.r.value }, m);
    });
    const duzelt = h('button', { type: 'button', class: 'hayalet' }, 'Veriyi düzenle');
    duzelt.addEventListener('click', () => void gonder(duzelt, 'karar', { karar: 'duzelt' }, m));
    return kart('Şimdi ne yapayım?', 'pusula', sonFark ? farkCiz(sonFark) : null, m.kutu,
      h('fieldset', { class: 'hizli-kararlar' }, h('legend', { class: 'gorunmez' }, 'Şimdi ne yapayım?'), bitir.el, devam.el, baska.el),
      h('div', { class: 'dugmeler' }, uygula, duzelt));
  }

  if (s.tur === 'onay') {
    const evet = h('button', { type: 'button', class: 'birincil', 'data-odak': '' }, `Evet, “${s.dugme.metin || s.dugme.secici}” düğmesine bas`);
    const hayir = h('button', { type: 'button', class: 'hayalet' }, 'Hayır, basma');
    evet.addEventListener('click', () => void gonder(evet, 'onay', { cevap: true }, m));
    hayir.addEventListener('click', () => void gonder(hayir, 'onay', { cevap: false }, m));
    return kart(`“${s.dugme.metin || s.dugme.secici}” düğmesine basayım mı?`, 'soru', m.kutu,
      s.dugme.kayitOlusturabilir ? h('div', { class: 'not-kutusu uyari', role: 'note' }, 'Bu düğme kayıt oluşturabilir (ör. kaydetme, onaylama, gönderme).') : null,
      h('div', { class: 'dugmeler' }, evet, hayir));
  }

  if (s.tur === 'hata') {
    const sec = (cevap, metin, sinif) => {
      const b = h('button', { type: 'button', class: sinif }, metin);
      b.addEventListener('click', () => void gonder(b, 'hata-cevabi', { cevap }, m));
      return b;
    };
    return kart('Bu bir hata mı, beklenen uyarı mı?', 'uyari', m.kutu,
      h('ul', { class: 'hizli-metinler' }, s.metinler.map((x) => h('li', {}, h('span', { class: 'hizli-cip e-hata' }, x)))),
      h('div', { class: 'dugmeler hizli-dikey' },
        sec('hata', 'Hata — verileri düzeltip yeniden deneyeceğim', 'birincil'),
        sec('uyari', 'Beklenen uyarı — bu mesaj testin beklenen sonucu (olumsuz senaryo)', ''),
        sec('onemsiz', 'Önemli değil, devam et', 'hayalet')));
  }

  if (s.tur === 'secim') {
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    vazgec.addEventListener('click', () => void gonder(vazgec, 'karar', { karar: 'vazgec' }, m));
    return kart('Tarayıcıda düğmeyi seçin', 'hedef', m.kutu,
      h('p', {}, 'Hızlı test tarayıcısında basılacak düğmeye tıklayın. Tıklama sayfaya iletilmez; seçtiğiniz düğme burada sorulur.'),
      h('div', { class: 'dugmeler' }, vazgec));
  }

  if (s.tur === 'hayirSecim') {
    const dugme = h('select', { id: 'hizli-hayir-dugme' }, s.adaylar.map((a) => h('option', { value: a.secici, selected: a.secici === s.oneri || null }, a.metin || a.secici)));
    const kutular = s.mesajlar.map((x, i) => {
      const k = h('input', { type: 'checkbox', id: `hizli-mesaj-${i}`, value: x.metin, checked: (x.tur === 'basari' && i === 0) || null });
      return { k, el: h('label', { class: 'onay-satiri', for: k.id }, k, h('span', {}, x.metin, ' ', rozet(x.kaynak === 'cumle' ? 'cümleden' : x.tur === 'hata' ? 'hata adayı' : x.tur === 'bekleme' ? 'bekleme adayı' : 'sayfada gizli'))) };
    });
    const bitir = h('button', { type: 'button', class: 'birincil' }, 'Burada bitir');
    bitir.addEventListener('click', () => void gonder(bitir, 'karar', { karar: 'bitir', dugme: dugme.value, mesajlar: kutular.filter((x) => x.k.checked).map((x) => x.k.value) }, m));
    const duzelt = h('button', { type: 'button', class: 'hayalet' }, 'Veriyi düzenle');
    duzelt.addEventListener('click', () => void gonder(duzelt, 'karar', { karar: 'duzelt' }, m));
    return kart('Düğmeyi ve mesajı seçin', 'hedef', m.kutu,
      h('div', { class: 'not-kutusu bilgi', role: 'note' }, 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz. Seçimler adaylardandır; test “doğrulanmadı” olarak kaydedilir ve ilk koşuda doğrulanır.'),
      h('div', { class: 'alan' }, h('label', { for: 'hizli-hayir-dugme' }, 'Formu gönderen düğme'), dugme),
      h('fieldset', { class: 'hizli-mesajlar' }, h('legend', {}, 'Başarıyı gösteren mesaj'),
        kutular.length ? kutular.map((x) => x.el) : h('p', { class: 'soluk' }, 'Mesaj adayı bulunamadı: “Ne yapılsın?” cümlesinde beklenen mesajı tırnak içinde yazıp yeniden başlatın.')),
      h('div', { class: 'dugmeler' }, bitir, duzelt));
  }

  if (s.tur === 'bitis') return bitisDuragi(o, s, kart, m, gonder);
  if (s.tur === 'kaydet') return kaydetDuragi(o, s, kart, m, gonder);

  if (s.tur === 'kaydedildi') {
    const maddeler = s.hazirlik && Array.isArray(s.hazirlik.maddeler) ? s.hazirlik.maddeler : [];
    return h('section', { class: 'kart hizli-soru' },
      h('div', { class: 'kart-basligi' }, h('h3', { tabindex: '-1', 'data-odak': '' }, ikon('onay'), 'Test kaydedildi'), h('span', { class: 'sag' }, rozet(s.dogrulandi ? 'Doğrulandı' : 'Doğrulanmadı', s.dogrulandi ? 'basari' : 'uyari'))),
      h('p', {}, `Ekran “${o.ekran.ad}” ve senaryo “${s.senaryoBasligi}” kaydedildi.`),
      s.tablo ? h('div', { class: 'not-kutusu bilgi', role: 'note' },
        h('p', {}, `Test verisi tabloları (${s.tablo.tablolar.length}): ${s.tablo.baglanan ?? 0} alan ekranın Test verisi bölümünde ilgili tabloya bağlandı.`),
        h('ul', { class: 'kucuk' }, s.tablo.tablolar.map((t) => h('li', {}, `${t.tablo} — ${t.secenekSayisi ? `${t.secenekSayisi} seçenek (liste)` : `${t.sutunSayisi} sütun`} (${t.yeni ? 'yeni' : `birleştirildi: +${t.eklenenSatir ?? 0} satır`})`)))) : null,
      s.ekSenaryolar && s.ekSenaryolar.length ? h('p', { class: 'kucuk' }, `Önerilerden eklenen senaryolar: ${s.ekSenaryolar.map((x) => x.baslik).join(', ')}`) : null,
      maddeler.length ? h('ul', { class: 'hizli-hazirlik', 'aria-label': 'Hazırlık kontrolü' }, maddeler.map((x) => h('li', { class: x.durum },
        h('span', { 'aria-hidden': 'true' }, x.durum === 'tamam' ? '✓' : x.durum === 'yok' ? '–' : '!'), ` ${x.baslik}: ${x.ayrinti}`))) : null,
      s.hazirlik && s.hazirlik.neden ? h('div', { class: 'not-kutusu uyari', role: 'note' }, s.hazirlik.neden) : null,
      h('div', { class: 'dugmeler' },
        h('a', { class: 'dugme birincil', href: listeHedefi().adres }, ikon('liste'), listeHedefi().ad),
        h('a', { class: 'dugme', href: `#/ekranlar/e/${encodeURIComponent(s.ekranId)}/akis` }, ikon('katman'), 'Akış diyagramında aç'),
        h('a', { class: 'dugme hayalet', href: '#/hizli-test' }, ikon('artiYalin'), 'Yeni hızlı test')));
  }
  return kart('Bekleniyor', 'saat', h('p', {}, 'Sayfayı yenileyin.'));
}

/** Basıştan sonraki fark (yeni metinler, alanlar, düğmeler, adres). @param {any} a */
function farkCiz(a) {
  const f = a.fark;
  const sn = (f.sureMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return h('div', { class: 'hizli-fark' },
    h('p', {}, h('b', {}, `“${a.bas ? a.bas.metin || a.bas.secici : '?'}”`), ` düğmesine basıldı; ${sn} sn sonra sayfa:`,
      f.zamanAsimi ? h('span', { class: 'soluk' }, ' (bekleme 60 sn’de kesildi)') : null),
    f.tiklamaNotu ? h('p', { class: 'kucuk' }, `Not: ${f.tiklamaNotu}.`) : null,
    f.beklemeMetinleri.length ? h('p', { class: 'kucuk soluk' }, `Beklerken: ${f.beklemeMetinleri.join(' · ')}`) : null,
    f.yeniMetinler.length ? h('ul', { class: 'hizli-metinler', 'aria-label': 'Yeni metinler' }, f.yeniMetinler.slice(0, 12).map((m) => h('li', {},
      h('span', { class: `hizli-cip${m.tur === 'hata' ? ' e-hata' : m.tur === 'basari' ? ' e-bitti' : ''}` }, m.metin)))) : h('p', { class: 'soluk kucuk' }, 'Yeni metin görülmedi.'),
    f.yeniAlanlar.length ? h('p', { class: 'kucuk' }, `Yeni alanlar: ${f.yeniAlanlar.join(', ')}`) : null,
    f.yeniDugmeler.length ? h('p', { class: 'kucuk' }, `Yeni düğmeler: ${f.yeniDugmeler.join(', ')}`) : null,
    f.adres ? h('p', { class: 'kucuk' }, `Adres değişti: ${f.adres.once} → ${f.adres.sonra}`) : null);
}

/** 3. durak: veri durağı. */
function veriDuragi(o, s, kart, m, gonder) {
  /** @type {Record<string, { deger: string | boolean | null; kaynak: 'elle' | 'tablo' | null; tabloSecimi?: any }>} */
  const durum = {};
  const satirYap = (a) => {
    durum[a.anahtar] = { deger: a.deger, kaynak: a.kaynak };
    const id = `hizli-alan-${Math.random().toString(36).slice(2, 9)}`;
    const kap = h('div', { class: 'hizli-alan-girdisi' });
    const ciz = () => {
      const d = durum[a.anahtar];
      if (d.kaynak === 'tablo') {
        const elle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, 'Elle yaz');
        elle.addEventListener('click', () => { durum[a.anahtar] = { deger: null, kaynak: null }; ciz(); });
        yerlestir(kap, h('span', { class: 'hizli-tablo-degeri', id }, String(d.deger)), rozet('tablodan'), elle);
        return;
      }
      /** @type {HTMLElement} */
      let girdi;
      const secenekler = Array.isArray(a.secenekler) ? a.secenekler : null;
      if (a.tur === 'checkbox') {
        girdi = h('input', { type: 'checkbox', id, checked: d.deger === true || d.deger === 'true' || null });
        girdi.addEventListener('change', () => { durum[a.anahtar] = { deger: /** @type {HTMLInputElement} */ (girdi).checked, kaynak: 'elle' }; kosulGuncelle(); });
      } else if (secenekler) {
        girdi = h('select', { id }, h('option', { value: '' }, 'Seçin'), secenekler.filter((x) => x.deger !== '').map((x) => h('option', { value: x.deger, selected: String(d.deger) === x.deger || null }, x.metin || x.deger)));
        girdi.addEventListener('change', () => { durum[a.anahtar] = { deger: /** @type {HTMLSelectElement} */ (girdi).value || null, kaynak: 'elle' }; kosulGuncelle(); });
      } else {
        girdi = h('input', { type: a.gizli ? 'password' : a.tur === 'date' ? 'date' : 'text', id, autocomplete: 'off', value: d.deger === null ? '' : String(d.deger) });
        girdi.addEventListener('input', () => { durum[a.anahtar] = { deger: /** @type {HTMLInputElement} */ (girdi).value, kaynak: 'elle' }; });
      }
      if (a.zorunlu) girdi.setAttribute('aria-required', 'true');
      const doldur = doldurDugmesi({
        projeId: o.projeId, ortamId: o.ortam.id,
        alan: { id: a.anahtar, etiket: a.etiket, tip: doldurTipi(a.tur), hassas: a.gizli, secenekler: secenekler ? secenekler.map((x) => ({ deger: x.deger, metin: x.metin })) : null },
        secildi: (secim) => { durum[a.anahtar] = { deger: secim.deger, kaynak: 'tablo', tabloSecimi: secim.tabloSecimi }; ciz(); kosulGuncelle(); }
      });
      yerlestir(kap, girdi, doldur);
    };
    ciz();
    // Doldurma sırası: alanlar sayfadaki sırayla listelenir ve bu sırayla doldurulur; kullanıcı yukarı / aşağı taşıyabilir.
    // Düğme adı genel ("Yukarı taşı"); hangi alan olduğu aria-describedby ile alanın etiketinden okunur (alan etiketiyle karışmaz).
    const sira = h('span', { class: 'hizli-sira', role: 'group', 'aria-label': 'Doldurma sırası' },
      h('button', { type: 'button', class: 'kucuk-dugme hayalet hizli-sira-yukari', 'aria-label': 'Yukarı taşı', 'aria-describedby': `${id}-etiket`, title: 'Yukarı taşı (daha önce doldurulur)', onclick: () => tasi(a, -1) }, h('span', { 'aria-hidden': 'true' }, '↑')),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet hizli-sira-asagi', 'aria-label': 'Aşağı taşı', 'aria-describedby': `${id}-etiket`, title: 'Aşağı taşı (daha sonra doldurulur)', onclick: () => tasi(a, 1) }, h('span', { 'aria-hidden': 'true' }, '↓')));
    return h('div', { class: `alan hizli-alan${a.yeni ? ' yeni' : ''}` },
      h('div', { class: 'hizli-alan-baslik' },
        h('label', { for: id, id: `${id}-etiket`, title: a.teknikAd && !a.etiketBulundu ? `Sayfadaki teknik ad: ${a.teknikAd}` : null }, a.etiket, a.zorunlu ? h('span', { class: 'soluk' }, ' (zorunlu)') : null, a.yeni ? ' ' : null, a.yeni ? rozet('yeni alan', 'bilgi') : null),
        sira),
      // Seçim keşfi: alan bir seçimin belirli değerinde görünüyorsa hangi seçimde göründüğü yazılır.
      a.kosul ? h('div', { class: 'hizli-kosul soluk kucuk' }, `${a.kosul.metin} olunca görünür`) : null,
      kap, a.hata ? h('div', { class: 'alan-hatasi', role: 'alert' }, a.hata) : null);
  };
  // Önce analiz: sayfada zaten dolu gelen alanlar SORULMAZ (olduğu gibi kullanılır); yalnız boş olanlar istenir.
  const hazirlar = s.alanlar.filter((a) => a.hazir && a.deger === null);
  const acilan = new Set();
  /** @type {Map<string, HTMLElement>} */
  const satirlari = new Map();
  const satir = (/** @type {any} */ a) => { if (!satirlari.has(a.anahtar)) satirlari.set(a.anahtar, satirYap(a)); return /** @type {HTMLElement} */ (satirlari.get(a.anahtar)); };
  const satirlarKap = h('div', { class: 'hizli-alanlar' });
  const hazirKap = h('details', { class: 'hizli-hazir' });
  // Doldurma sırası (anahtarlar): başlangıçta sayfadaki sıra; "Devam et"te sunucuya gider, motor bu sırayla doldurur.
  const siralama = s.alanlar.map((a) => a.anahtar);
  const alanlarSirali = () => siralama.map((k) => s.alanlar.find((a) => a.anahtar === k)).filter(Boolean);
  /** Koşullu alan şu an geçerli mi (seçimin değeri: yazılan, yoksa sayfanın ilk değeri; tablodan gelen değer bilinmez → geçerli). */
  const aktifMi = (/** @type {any} */ a, gorulen = new Set()) => {
    if (!a.kosul || gorulen.has(a.anahtar)) return true;
    gorulen.add(a.anahtar);
    const kontrol = s.alanlar.find((x) => x.anahtar === a.kosul.secim);
    if (kontrol && !aktifMi(kontrol, gorulen)) return false;
    const d = durum[a.kosul.secim];
    if (d && d.kaynak === 'tablo') return true;
    const simdi = d && d.deger !== null && d.deger !== undefined && d.deger !== '' ? d.deger : a.kosul.ilk;
    if (simdi === null || simdi === undefined) return true;
    return a.kosul.degerler.includes(String(simdi));
  };
  const sorulanlar = () => alanlarSirali().filter((a) => (!hazirlar.includes(a) || acilan.has(a.anahtar)) && aktifMi(a));
  // Seçim değişince koşullu alanlar açılır / kapanır (görünen küme değişmediyse liste yeniden çizilmez: odak kaybolmaz).
  let gorunenImza = '';
  const kosulGuncelle = () => {
    const imza = sorulanlar().map((a) => a.anahtar).join('|');
    if (imza !== gorunenImza) listeyiCiz();
  };
  const tasi = (/** @type {any} */ a, /** @type {number} */ yon) => {
    const gorunen = sorulanlar();
    const j = gorunen.indexOf(a) + yon;
    if (j < 0 || j >= gorunen.length) return;
    const x = siralama.indexOf(a.anahtar);
    const y = siralama.indexOf(gorunen[j].anahtar);
    [siralama[x], siralama[y]] = [siralama[y], siralama[x]];
    listeyiCiz();
    const dugmeler = satir(a).querySelectorAll('.hizli-sira button');
    const hedef = /** @type {HTMLButtonElement} */ (dugmeler[yon < 0 ? 0 : 1]);
    (hedef.disabled ? /** @type {HTMLButtonElement} */ (dugmeler[yon < 0 ? 1 : 0]) : hedef).focus();
  };
  const listeyiCiz = () => {
    const sorulan = sorulanlar();
    gorunenImza = sorulan.map((a) => a.anahtar).join('|');
    yerlestir(satirlarKap, ...(sorulan.length ? sorulan.map(satir) : [h('p', { class: 'soluk' }, 'Sayfa hazır: sizden doldurmanızı isteyeceğim boş alan yok. Devam edebilirsiniz.')]));
    sorulan.forEach((a, i) => {
      const d = satir(a).querySelectorAll('.hizli-sira button');
      /** @type {HTMLButtonElement} */ (d[0]).disabled = i === 0;
      /** @type {HTMLButtonElement} */ (d[1]).disabled = i === sorulan.length - 1;
    });
    const kalan = hazirlar.filter((a) => !acilan.has(a.anahtar));
    hazirKap.hidden = !kalan.length;
    yerlestir(hazirKap, h('summary', {}, `Sayfada hazır gelen ${kalan.length} değer (olduğu gibi kullanılacak)`),
      h('ul', { class: 'hizli-hazir-liste' }, kalan.map((a) => h('li', {},
        h('span', { class: 'hizli-hazir-ad' }, a.etiket), h('span', { class: 'hizli-hazir-deger' }, a.mevcut ?? 'dolu'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${a.etiket}: değiştir`, onclick: () => { acilan.add(a.anahtar); listeyiCiz(); } }, 'Değiştir')))));
  };
  listeyiCiz();
  const devam = h('button', { type: 'button', class: 'birincil' }, 'Devam et', ikon('ok'));
  devam.addEventListener('click', () => {
    const degerler = Object.fromEntries(Object.entries(durum).map(([k, d]) => [k, d.deger === null || d.deger === '' ? null
      : { deger: d.deger, kaynak: d.kaynak || 'elle', ...(d.tabloSecimi ? { tabloSecimi: d.tabloSecimi } : {}) }]));
    const eksik = s.alanlar.filter((a) => a.zorunlu && !a.hazir && !degerler[a.anahtar] && aktifMi(a)).map((a) => a.etiket);
    if (eksik.length) { m.goster(`Zorunlu alanlar boş: ${eksik.join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`); return; }
    void gonder(devam, 'veri', { degerler, sira: siralama }, m);
  });
  const zorunluSayisi = s.alanlar.filter((a) => a.zorunlu && !a.hazir && (a.deger === null || a.deger === '')).length;
  return kart(o.adimlar.length > 1 ? `Adım ${s.adim}: veri gerekli` : 'Devam etmek için veri gerekli', 'veri',
    s.not ? h('div', { class: 'not-kutusu bilgi', role: 'note' }, s.not) : null,
    h('p', { class: 'soluk' }, 'Sayfada boş görünen alanlar aşağıda; adları sayfadaki gibi yazıldı. Değeri yazın ya da “Doldur” ile test verisi tablosundan seçin; hiçbir değer uydurulmaz. Sayfada zaten dolu gelenler sorulmaz, olduğu gibi kullanılır. Doldurduğunuzda akış kaldığı yerden sürer.'),
    m.kutu, satirlarKap, hazirKap,
    h('div', { class: 'dugmeler' }, devam, zorunluSayisi ? h('span', { class: 'soluk' }, `${zorunluSayisi} zorunlu alan eksik`) : null));
}

/** 5. durak: bitiş koşulu. */
function bitisDuragi(o, s, kart, m, gonder) {
  /** @type {Record<string, string | null>} */
  const etiketler = { ...s.etiketler };
  const satirlar = s.gorulenler.map((g, i) => {
    const grup = h('div', { class: 'hizli-etiketler', role: 'radiogroup', 'aria-label': `“${g.metin}” etiketi` });
    const ciz = () => {
      const secili = etiketler[g.metin] ?? null;
      yerlestir(grup, ...ETIKET_SECENEKLERI.map(([deger, ad]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(secili === deger), class: `hizli-etiket e-${deger ?? 'yok'}${secili === deger ? ' secili' : ''}`,
        // Radyo: tıklama yalnız seçer (seçili olana tıklamak seçimi KALDIRMAZ); etiketi kaldırmak için "Etiketsiz".
        onclick: () => { if (secili === deger) return; etiketler[g.metin] = deger; ciz(); olumsuzGuncelle(); }
      }, ad)));
    };
    ciz();
    return h('li', { class: 'hizli-bitis-satiri', 'data-sira': String(i) }, h('span', { class: 'hizli-cip' }, g.metin), grup);
  });
  const adres = h('input', { type: 'text', id: 'hizli-bitis-adres', maxlength: 300, placeholder: s.onerilenAdres || '/…', value: s.adres || '' });
  const olumsuz = h('input', { type: 'checkbox', id: 'hizli-olumsuz', checked: s.olumsuz ? true : null });
  const olumsuzMesaj = h('select', { id: 'hizli-olumsuz-mesaj', 'aria-label': 'Beklenen hata mesajı' });
  const olumsuzKutusu = h('div', { class: 'hizli-olumsuz' }, h('label', { class: 'onay-satiri', for: 'hizli-olumsuz' }, olumsuz, 'Olumsuz senaryo: bu hata mesajı testin beklenen sonucudur'), olumsuzMesaj);
  const olumsuzGuncelle = () => {
    const hatalar = Object.entries(etiketler).filter(([, e]) => e === 'hata').map(([k]) => k);
    const onceki = olumsuzMesaj.value || (s.olumsuz ? s.olumsuz.mesaj : '');
    yerlestir(olumsuzMesaj, ...hatalar.map((x) => h('option', { value: x, selected: x === onceki || null }, x)));
    // Hata etiketli metin yoksa olumsuz senaryo seçeneği görünmez.
    olumsuzKutusu.hidden = !hatalar.length;
    if (!hatalar.length) olumsuz.checked = false;
    olumsuzMesaj.disabled = !olumsuz.checked;
    gecerlilikGuncelle();
  };
  // İstemci doğrulaması (sunucudaki kuralın aynısı): en az bir "Bitti", ya da bitiş adresi, ya da olumsuz senaryo. Yoksa "Devam et"
  // pasif ve gerekçe yazılı (sunucuya 400 alacak istek gitmez).
  const eksikNotu = h('span', { class: 'soluk kucuk', id: 'hizli-bitis-eksik', role: 'status' });
  const devam = h('button', { type: 'button', class: 'birincil', 'aria-describedby': 'hizli-bitis-eksik' }, 'Devam et', ikon('ok'));
  function gecerlilikGuncelle() {
    const gecerli = Object.values(etiketler).includes('bitti') || Boolean(adres.value.trim()) || (olumsuz.checked && Boolean(olumsuzMesaj.value));
    devam.disabled = !gecerli;
    eksikNotu.textContent = gecerli ? '' : 'En az bir metni “Bitti” etiketleyin (ya da “Adres şu olursa bitti”yi yazın).';
  }
  olumsuz.addEventListener('change', olumsuzGuncelle);
  olumsuzMesaj.addEventListener('change', gecerlilikGuncelle);
  adres.addEventListener('input', gecerlilikGuncelle);
  olumsuzGuncelle();
  devam.addEventListener('click', () => void gonder(devam, 'bitis', {
    etiketler, adres: adres.value.trim() || null, olumsuz: olumsuz.checked && olumsuzMesaj.value ? { mesaj: olumsuzMesaj.value } : null
  }, m));
  const tara = h('button', { type: 'button', class: 'hayalet' }, 'Sayfayı yeniden tara');
  tara.title = 'Tarayıcıda şu an görünen yeni mesajları (ör. sonradan çıkan hata / başarı) listeye ekler; verdiğiniz etiketler korunur.';
  tara.addEventListener('click', () => void gonder(tara, 'yeniden-tara', { etiketler }, m));
  // Geri dönüş: zincire devam (etiketler saklanır; yeniden "Burada bitir" denince korunur).
  const zincireDon = h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Adım adım’a dön: zincire devam et');
  zincireDon.addEventListener('click', () => void gonder(zincireDon, 'geri', { hedef: 'karar' }, m));
  return kart('Bitiş koşulu: ne görülünce biter?', 'hedef',
    h('p', {}, 'Akış boyunca görülen metinler. Her birine bir etiket verin:'),
    h('ul', { class: 'hizli-bitis', 'aria-label': 'Görülen metinler' }, satirlar),
    h('p', { class: 'soluk kucuk' }, 'Test çalışırken: “Devam” metinleri görüldükçe test beklemeye devam eder (en çok 60 sn). “Bitti” görülünce başarılı biter. “Hata” görülünce başarısız biter ve mesaj rapora yazılır. Hiçbiri görünmezse süre dolunca başarısız: “Bitiş mesajı görülmedi.”'),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-bitis-adres' }, 'Adres şu olursa bitti ', h('span', { class: 'soluk' }, '(isteğe bağlı)')), adres),
    olumsuzKutusu,
    m.kutu, h('div', { class: 'dugmeler' }, devam, tara, zincireDon), eksikNotu);
}

/** 6. durak: kaydet (H3 doğrulama sorusu; aynı ekran varsa farklar). Özet kendi sekmesinde açılır (#/hizli-test/ozet/<id>). */
function kaydetDuragi(o, s, kart, m, gonder) {
  const oz = s.ozet;
  const baslikGirdi = h('input', { type: 'text', id: 'hizli-senaryo-basligi', maxlength: 200, value: s.baslik || '' });
  const dahil = h('input', { type: 'checkbox', id: 'hizli-kosuya-dahil', checked: true });
  const tabloOlustur = h('input', { type: 'checkbox', id: 'hizli-tablo-olustur', checked: true });
  const zincir = h('ol', { class: 'hizli-zincir buyuk', 'aria-label': 'Kaydedilecek adımlar' },
    oz.adimlar.filter((a) => a.alanSayisi || a.bas).map((a) => h('li', {},
      a.alanSayisi ? `${a.alanSayisi} alan doldur` : null, a.alanSayisi && a.bas ? ', sonra ' : null, a.bas ? h('span', {}, 'bas: ', h('b', {}, a.bas)) : null)),
    oz.bitis ? h('li', {}, oz.olumsuz ? `Beklenen uyarı: “${oz.olumsuz.mesaj}”` : `Bitti: ${[...oz.bitis.bitti.map((x) => `“${x}”`), ...(oz.bitis.adres ? [`adres ${oz.bitis.adres}`] : [])].join(' veya ')}`,
      oz.bitis.hata.length && !oz.olumsuz ? ` · Hata: ${oz.bitis.hata.map((x) => `“${x}”`).join(', ')}` : null,
      oz.bitis.devam.length ? ` · Devam: ${oz.bitis.devam.map((x) => `“${x}”`).join(', ')}` : null) : null);
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet — özeti göster');
  const ozetAdresi = `#/hizli-test/ozet/${encodeURIComponent(o.id)}`;
  kaydet.addEventListener('click', async () => {
    // Seçimler oturuma yazılır (özet sekmesi okur; veritabanına hiçbir şey yazılmaz), sonra özet YENİ SEKMEDE açılır: uzun tablo listesi
    // bu sayfanın altına dizilmez. Tarayıcı yeni sekmeyi engellerse bağlantı gösterilir.
    try {
      await mesgulIken(kaydet, 'Özet hazırlanıyor…', () => api('/platform/hizli-test/ozet', {
        govde: { id: o.id, baslik: baslikGirdi.value.trim(), kosuyaDahil: dahil.checked, tabloOlustur: tabloOlustur.checked }
      }));
      degisiklikleriBirak();
      const sekme = window.open(ozetAdresi, '_blank');
      if (!sekme) {
        m.goster('Tarayıcı yeni sekmeyi engelledi.', 'uyari');
        m.kutu.replaceChildren('Tarayıcı yeni sekmeyi engelledi: ', h('a', { href: ozetAdresi, target: '_blank' }, 'özeti yeni sekmede açın'), '.');
      } else bildir('Özet yeni sekmede açıldı; kaydı oradan onaylayın.', 'basari');
    } catch (e) { if (!(e && e.durum === 423)) m.goster(hataMetni(e)); }
  });
  const dogrula = h('button', { type: 'button', class: s.dogrulama ? 'hayalet' : 'birincil' }, ikon('oynat'), s.dogrulama ? 'Yeniden doğrula' : 'Evet, doğrula');
  dogrula.addEventListener('click', () => void gonder(dogrula, 'dogrula', {}, m));
  const d = s.dogrulama;
  const dogrulamaKutusu = !s.dogrulanabilir
    ? h('div', { class: 'not-kutusu uyari', role: 'note' }, d ? d.mesaj : 'Doğrulama koşusu yapılmaz.')
    : !d ? h('div', { class: 'hizli-h3' },
      h('p', {}, h('b', {}, 'Kaydetmeden önce baştan sona bir doğrulama koşusu yapayım mı? '), '(yeni kayıt oluşabilir)'),
      h('div', { class: 'dugmeler' }, dogrula, kaydetHayirDugmesi(kaydet)))
      : h('div', { class: `not-kutusu ${d.durum === 'basarili' ? 'basari' : 'hata'}`, role: 'status' },
        `Doğrulama koşusu ${d.durum === 'basarili' ? 'başarılı' : 'başarısız'}: ${d.mesaj}`,
        o.dogrulamaAdimlari && d.durum !== 'basarili' ? dogrulamaAdimListesi(o.dogrulamaAdimlari) : null);
  // Geri dönüş: bitiş koşulunu düzenle / adım adım zincire dön (doğrulama sonucu geçersiz olur).
  const bitiseDon = h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Bitiş koşulunu düzenle');
  bitiseDon.addEventListener('click', () => void gonder(bitiseDon, 'geri', { hedef: 'bitis' }, m));
  const zincireDon = h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Adım adım’a dön: zincire devam et');
  zincireDon.addEventListener('click', () => void gonder(zincireDon, 'geri', { hedef: 'karar' }, m));
  const farklar = s.farklar ? h('div', { class: 'not-kutusu uyari hizli-farklar', role: 'note' },
    h('p', {}, h('b', {}, `“${oz.ekranAdi}” ekranı zaten var. `), `Kaydedince yeni model sürümü oluşur (${s.farklar.ozet.toplam} fark).`),
    s.farklar.maddeler.length ? h('ul', {}, s.farklar.maddeler.slice(0, 12).map((x) => h('li', {}, x))) : null,
    s.farklar.senaryolar.length ? h('p', {}, `Etkilenebilecek senaryolar: ${s.farklar.senaryolar.join(', ')}`) : null) : null;
  return kart('Kaydedilecekler', 'onay',
    zincir,
    h('ul', { class: 'hizli-ozet kucuk' },
      h('li', {}, h('b', {}, 'Ekrana: '), 'alanlar, koşullar, düğme zinciri, bitiş ve hata mesajları'),
      h('li', {}, h('b', {}, 'Senaryoya: '), `girilen değerler, tablo bağlantıları, izin (${oz.izin}), bitiş koşulu`)),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-senaryo-basligi' }, 'Senaryonun adı'), baslikGirdi),
    h('label', { class: 'onay-satiri', for: 'hizli-kosuya-dahil' }, dahil, 'Toplu koşuya dahil'),
    h('label', { class: 'onay-satiri', for: 'hizli-tablo-olustur' }, tabloOlustur, 'Girdiğim değerleri test verisi tablosu olarak kaydet ve ekranın test verisine bağla'),
    dogrulamaKutusu, farklar, m.kutu,
    (!s.dogrulanabilir || d) ? h('div', { class: 'dugmeler' }, kaydet, d && s.dogrulanabilir ? dogrula : null) : null,
    h('p', { class: 'kucuk soluk' }, 'Özet yeni bir sekmede açılır; kaydı orada onaylarsınız. Onaylamadan hiçbir şey yazılmaz.'),
    h('div', { class: 'dugmeler hizli-geri' }, bitiseDon, zincireDon));
}

/** Doğrulama koşusunun adımları ve durumları (bekliyor / sürüyor / tamam / hata). @param {Array<{ metin: string; durum: string; ayrinti: string | null }>} liste */
function dogrulamaAdimListesi(liste) {
  const ad = { tamam: 'tamam', suruyor: 'sürüyor', hata: 'hata', bekliyor: 'bekliyor' };
  const isaret = { tamam: '✓', suruyor: '…', hata: '✗', bekliyor: '·' };
  return h('ol', { class: 'hizli-dogrulama-adimlari', 'aria-label': 'Doğrulama adımları' }, liste.map((x) => h('li', { class: `d-${x.durum}`, 'aria-current': x.durum === 'suruyor' ? 'step' : null },
    h('span', { class: 'hizli-dogrulama-isaret', 'aria-hidden': 'true' }, isaret[x.durum] || '·'),
    h('span', {}, x.metin, ' ', h('span', { class: 'gorunmez' }, `(${ad[x.durum] || x.durum})`),
      x.durum === 'suruyor' && x.ayrinti ? h('small', { class: 'blok soluk' }, x.ayrinti) : null))));
}

/**
 * Kayıt özeti — KENDİ SEKMESİNDE (#/hizli-test/ozet/<oturumId>): tablolar / birleştirme kararı / bağlantılar / senaryo önerileri; onaylamadan
 * hiçbir şey yazılmaz. Kaydet sekmesindeki seçimler (senaryo adı, toplu koşu, tablo) oturumdan okunur.
 * @param {HTMLElement} govde @param {string} id
 */
async function ozetEkrani(govde, id) {
  const oturumAdresi = `#/hizli-test/o/${encodeURIComponent(id)}`;
  govde.replaceChildren(h('p', { class: 'soluk' }, 'Özet hazırlanıyor…'));
  let oz;
  try {
    oz = (await api('/platform/hizli-test/ozet', { govde: { id } })).ozet;
  } catch (e) {
    if (e && e.durum === 423) return;
    govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)), h('p', {}, h('a', { href: oturumAdresi }, 'Hızlı teste dön')));
    return;
  }
  const m = mesajKutusu();
  const tercih = oz.tercih || { kosuyaDahil: true, tabloOlustur: true };
  let baslik = oz.baslik;
  const tv = testVerisiSecimi(tercih.tabloOlustur ? oz.onizleme : null, () => guncelle(), { kompakt: true });
  const oneriler = oz.senaryolar.filter((x) => x.indeks > 0);
  const secili = new Set(oneriler.filter((x) => x.varsayilanSecili).map((x) => x.indeks));
  const onayla = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), oz.farklar ? 'Farkları onayla ve kaydet' : 'Onayla ve kaydet');
  const neden = h('p', { class: 'kucuk soluk', role: 'status' });
  /** Kayıt başka sekmede onaylandı (görünür olunca durum sorulur): Onayla kapalı kalır. */
  let baskaSekmedeKaydedildi = false;
  const guncelle = () => {
    const bekleyen = tv.bekleyenler();
    onayla.disabled = baskaSekmedeKaydedildi || !tv.hazir();
    neden.textContent = bekleyen.length ? bekleyen.map((x) => x.metin).join(' · ') : `Yazılacak: ${tv.ozet() ?? 'test verisi yazılmaz'}; ${1 + secili.size} senaryo`;
  };
  const baslikSatiri = h('b', {}, baslik);
  const senaryoListesi = h('ul', { class: 'hizli-oneriler' },
    h('li', {}, h('label', {}, h('input', { type: 'checkbox', checked: true, disabled: true, 'aria-label': 'Yaptığınız senaryo' }), ' ', baslikSatiri, h('span', { class: 'kucuk soluk' }, String(baslik).toLocaleLowerCase('tr').includes('hızlı test') ? ' — yaptığınız akış' : ' — hızlı testte yaptığınız akış'))),
    oneriler.map((x) => {
      const k = h('input', { type: 'checkbox', checked: secili.has(x.indeks), 'aria-label': `${x.baslik} senaryosunu ekle` });
      k.addEventListener('change', () => { if (k.checked) secili.add(x.indeks); else secili.delete(x.indeks); guncelle(); });
      return h('li', {}, h('label', {}, k, ' ', h('b', {}, x.baslik), h('span', { class: 'kucuk soluk' }, ` — ${x.gerekce}`)));
    }));
  /** Kaydet; aynı başlıklı senaryo varsa (düzenleme kipi) önce sorulur. @param {Record<string, unknown>} ek */
  const kaydet = async (ek = {}) => {
    let r;
    try {
      r = await mesgulIken(onayla, 'Kaydediliyor…', () => api('/platform/hizli-test/kaydet', {
        govde: {
          id, baslik, kosuyaDahil: tercih.kosuyaDahil, tabloOlustur: tercih.tabloOlustur, ...(tercih.tabloOlustur ? { secim: tv.govde() } : {}),
          senaryoIndeksleri: [...secili], ...(oz.farklar ? { onay: true } : {}), ...ek
        }
      }));
    } catch (e) { if (!(e && e.durum === 423)) m.goster(hataMetni(e)); return; }
    degisiklikleriBirak();
    if (r && r.senaryoVar) {
      const karar = await senaryoVarSorusu(baslik);
      if (!karar) return;
      if (karar.tur === 'uzerineYaz') { await kaydet({ uzerineYaz: true }); return; }
      baslik = karar.baslik;
      baslikSatiri.textContent = baslik;
      await kaydet();
      return;
    }
    if (r && r.onayGerekli) { bildir('Bu ekran zaten var: farkları gözden geçirip onaylayın.', 'uyari'); return; }
    if (r && r.kaydedildi) {
      yerlestir(govde, h('section', { class: 'kart hizli-soru' },
        h('div', { class: 'kart-basligi' }, h('h3', { tabindex: '-1', 'data-odak': '' }, ikon('onay'), 'Test kaydedildi'),
          h('span', { class: 'sag' }, rozet(r.dogrulandi ? 'Doğrulandı' : 'Doğrulanmadı', r.dogrulandi ? 'basari' : 'uyari'))),
        h('p', {}, `Ekran “${oz.ekran.ad}” ve senaryo “${r.senaryoBasligi || baslik}” kaydedildi. Bu sekmeyi kapatabilirsiniz.`),
        h('div', { class: 'dugmeler' },
          h('a', { class: 'dugme birincil', href: listeHedefi().adres }, ikon('liste'), listeHedefi().ad),
          h('a', { class: 'dugme', href: `#/ekranlar/e/${encodeURIComponent(String(r.ekranId))}/akis` }, ikon('katman'), 'Akış diyagramında aç'),
          h('a', { class: 'dugme hayalet', href: oturumAdresi }, 'Hızlı teste dön'))));
      const odak = govde.querySelector('[data-odak]');
      if (odak instanceof HTMLElement) odak.focus();
    }
  };
  onayla.addEventListener('click', () => void kaydet());
  govde.replaceChildren(h('section', { class: 'kart hizli-soru hizli-ozet-karti' },
    h('div', { class: 'kart-basligi' }, h('h3', { tabindex: '-1', 'data-odak': '' }, ikon('onay'), 'Kayıt özeti — onaylamadan hiçbir şey yazılmaz'), h('span', { class: 'sag' }, rozet('6 / 6'))),
    h('p', {}, `Ekran “${oz.ekran.ad}” ${oz.ekran.mevcut ? '(mevcut: yeni model sürümü)' : '(yeni)'} · ortam ${oz.ortam.ad} · ${oz.dogrulandi ? 'doğrulandı' : 'doğrulanmadı'}`),
    oz.senaryoVar ? h('div', { class: 'not-kutusu uyari', role: 'note' }, `“${baslik}” adlı senaryo bu ekranda zaten var: kaydederken üzerine yazmak ya da yeni adla kaydetmek sorulur.`) : null,
    tercih.tabloOlustur ? tv.bolum : h('p', { class: 'kucuk soluk' }, 'Test verisi tablosu oluşturulmaz: değerler senaryoda düz değer olarak kalır.'),
    h('div', { class: 'ara-baslik' }, `Senaryolar (${1 + oneriler.length} öneri)`), senaryoListesi,
    m.kutu, neden, h('div', { class: 'dugmeler' }, onayla, h('a', { class: 'dugme hayalet', href: oturumAdresi }, 'Hızlı teste dön'))));
  guncelle();
  const odak = govde.querySelector('[data-odak]');
  if (odak instanceof HTMLElement) odak.focus();
  // Kayıt başka sekmede onaylandıysa (aynı özet iki sekmede açık) bu sekme görünür olunca durumu sorar: ikinci "Onayla" 409 almasın.
  const gorununceDenetle = async () => {
    if (!govde.isConnected) { document.removeEventListener('visibilitychange', gorununceDenetle); return; }
    if (document.visibilityState !== 'visible' || !onayla.isConnected || baskaSekmedeKaydedildi) return;
    try {
      const o = (await api(`/platform/hizli-test/durum?id=${encodeURIComponent(id)}`)).oturum;
      if (o && o.durum === 'kaydedildi' && onayla.isConnected) {
        baskaSekmedeKaydedildi = true;
        onayla.disabled = true;
        m.goster('Bu kayıt başka bir sekmede onaylandı; yeniden onaylamanız gerekmez.', 'bilgi');
      }
    } catch { /* bir sonraki görünüşte yeniden sorulur */ }
  };
  document.addEventListener('visibilitychange', gorununceDenetle);
}

/**
 * Düzenleme kipi: aynı başlıklı senaryo var → "Üzerine yaz / Yeni adla kaydet / Vazgeç". Promise: { tur: 'uzerineYaz' } |
 * { tur: 'yeniAd', baslik } | null (Vazgeç / Esc). @param {string} baslik
 */
function senaryoVarSorusu(baslik) {
  return new Promise((coz) => {
    /** @type {{ tur: 'uzerineYaz' } | { tur: 'yeniAd'; baslik: string } | null} */
    let sonuc = null;
    const yeniAd = h('input', { type: 'text', id: 'hizli-yeni-senaryo-adi', maxlength: 200, value: `${baslik} (2)`.slice(0, 200), autocomplete: 'off' });
    const uyari = h('p', { class: 'alan-hatasi', role: 'alert', hidden: true });
    const uzerine = h('button', { type: 'button', class: 'tehlike' }, 'Üzerine yaz');
    const yeni = h('button', { type: 'button', class: 'birincil' }, 'Yeni adla kaydet');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'hizli-senaryo-var-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'hizli-senaryo-var-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), `“${baslik}” senaryosu var`),
        h('p', { class: 'soluk' }, 'Bu ekranda aynı adlı bir senaryo zaten var. Üzerine yazarsanız eski senaryonun değerleri ve bitiş koşulu değişir.'),
        h('div', { class: 'alan' }, h('label', { for: 'hizli-yeni-senaryo-adi' }, 'Yeni ad'), yeniAd), uyari),
      h('div', { class: 'diyalog-alt' }, vazgec, uzerine, yeni));
    uzerine.addEventListener('click', () => { sonuc = { tur: 'uzerineYaz' }; diyalog.close(); });
    yeni.addEventListener('click', () => {
      const ad = yeniAd.value.trim();
      if (!ad || ad === baslik) { uyari.textContent = 'Farklı bir ad yazın.'; uyari.hidden = false; yeniAd.focus(); return; }
      sonuc = { tur: 'yeniAd', baslik: ad };
      diyalog.close();
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/** H3'te "Hayır, kaydet": doğrulamadan kaydeder (sihirbaz koşusu doğrulama sayılmaz; "doğrulanmadı" rozeti). @param {HTMLButtonElement} kaydet */
function kaydetHayirDugmesi(kaydet) {
  const b = h('button', { type: 'button', class: 'hayalet' }, 'Hayır, kaydet');
  b.addEventListener('click', () => kaydet.click());
  return b;
}
