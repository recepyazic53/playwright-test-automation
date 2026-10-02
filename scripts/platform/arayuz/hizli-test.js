// HIZLI TEST SİHİRBAZI (#/hizli-test) — Basit modun "+ Yeni test"i; Gelişmiş modda Oluştur menüsünden ve Ekran ekle sayfasından da açılır.
// Altı durak: 1 Başlat (adres, ortam, "Ne yapılsın?", basma izni) → 2 Keşfet (seçimler iç içe denenir; sayfa içinde bir şey açan düğmelere
// izne göre basılır / sorulur — kaydedilmez) → 3 Veri durağı (Doldur / elle; seçimler anında sayfaya uygulanır) → 4 Adım adım
// ("Şimdi ne yapayım?", Bana sor onayı, hata sorusu) → 5 Bitiş koşulu (Bitti / Devam / Hata) → 6 Kaydet (doğrulama sorusu, farklar).
// Sunucu: /platform/hizli-test/* (hizli-test/yonetici.mjs) — durum makinesi sunucudadır; bu sayfa durumu yoklar ve soruyu çizer.
// Adresler: #/hizli-test (yeni), #/hizli-test/duzenle/<ekranId> (düzenleme kipi: ekranın adresiyle başlar, kayıt yeni model sürümü),
// #/hizli-test/o/<oturumId> (süren sihirbaz; sayfa yenilense de sürer), #/hizli-test/ozet/<oturumId> (kayıt özeti; kendi sekmesinde açılır). Değer ÜRETİLMEZ: alanlara yalnız kullanıcı yazar ya da
// "Doldur" ile tablodan seçer. Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, degisiklikleriBirak, h, ikon, mesajKutusu, mesgulIken, rozet, yerlestir } from './ortak.js';
import { doldurDugmesi } from './doldur.js';
import { dosyaOnDenetimi, dosyaReferansiCoz, dosyaYukle } from './dosya-yukleme.js';
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
/** Bitiş durağındaki seçenekler: üç etiket + "Etiketsiz". Seçili etikete yeniden tıklamak da etiketi kaldırır (Etiketsiz'e döner). */
const ETIKET_SECENEKLERI = [...ETIKETLER, [null, 'Etiketsiz']];
/** Süren işlerde yoklama aralığı (ms). */
const YOKLAMA_MS = 1000;
/** Tarayıcının yeniden açılması: zincir baştan tekrar yürütülür (düğmelere yeniden basılır). */
const TEKRAR_YURUTME_METNI = 'Tarayıcı yeniden açılır ve zincir baştan tekrar yürütülerek kaldığınız adıma gelinir: daha önce basılan düğmelere yeniden basılır (yeni kayıt oluşabilir).';

/** Alanın "Doldur" bileşenine verilecek tipi (sayfa türü → model tipi). @param {string} tur */
const doldurTipi = (tur) => ({ select: 'secim', radio: 'radyo', checkbox: 'onayKutusu', date: 'tarih', number: 'sayi', tel: 'telefon' })[tur] || 'metin';
/** @param {unknown} e */
const hataMetni = (e) => (e && typeof e === 'object' && 'message' in e ? String(/** @type {any} */ (e).message) : String(e));
/** Uç hatasının kayıt sorunları (sunucu: hatalar[] — { mesaj, ayrinti?, duzelt? } ya da ham { yer, mesaj }); yoksa null. @param {unknown} e */
const hataSorunlari = (e) => {
  const l = e && typeof e === 'object' && /** @type {any} */ (e).govde && Array.isArray(/** @type {any} */ (e).govde.hatalar) ? /** @type {any} */ (e).govde.hatalar : null;
  return l && l.length ? l.map((/** @type {any} */ x) => ({
    mesaj: String(x.mesaj ?? ''), ayrinti: x.ayrinti ? String(x.ayrinti) : x.yer ? `${x.yer}: ${String(x.mesaj ?? '')}` : null, duzelt: x.duzelt ?? null
  })) : null;
};
/**
 * Tarayıcının yeniden açılıp zincirin tekrar yürütüleceği istek: sunucu yeniden basılacak düğmeler için onay isterse (409 onayGerekli)
 * düğmeler adlarıyla sorulur; onaylanınca { onay: true } ile yinelenir. Vazgeçilirse null.
 * @template T @param {(onay: boolean) => Promise<T>} istek @returns {Promise<T | null>}
 */
async function yenidenYurutmeOnayli(istek) {
  try {
    return await istek(false);
  } catch (e) {
    const g = /** @type {any} */ (e) && /** @type {any} */ (e).govde;
    if (!g || !g.onayGerekli) throw e;
    const { onayIste } = await import('./kosu-paneli.js');
    const dugmeler = Array.isArray(g.dugmeler) ? g.dugmeler : [];
    const evet = await onayIste({
      baslik: 'Zincir yeniden yürütülecek', ikonAd: 'uyari', dugme: 'Evet, yeniden yürüt', tehlikeli: false,
      metin: `Tarayıcı yeniden açılacak ve zincir baştan yürütülecek; şu düğmelere yeniden basılacak: ${dugmeler.map((/** @type {string} */ d) => `“${d}”`).join(', ')}. Bu düğmeler sayfada yeni kayıt oluşturabilir. Devam edilsin mi?`
    });
    return evet ? istek(true) : null;
  }
}
/** "Düzelt" düğmesinin metni (hedef → hızlı testin ilgili ekranı). */
const DUZELT_METNI = { bitis: 'Bitiş koşulunu düzenle', karar: 'Adım adım’a dön', tablo: 'Tablo kartına git' };

/**
 * Kayıt sorunları kutusu: her madde anlaşılır dille, mümkünse "Düzelt" düğmesiyle (duzelt(hedef, düğme)); teknik iletiler "Ayrıntı" altında.
 * @param {Array<{ mesaj: string; ayrinti: string | null; duzelt: 'bitis' | 'karar' | 'tablo' | null }>} sorunlar
 * @param {(hedef: 'bitis' | 'karar' | 'tablo', dugme: HTMLButtonElement) => void} duzelt @param {Array<'bitis' | 'karar' | 'tablo'>} hedefler gösterilebilen hedefler
 */
function sorunKutusu(sorunlar, duzelt, hedefler) {
  const ayrintilar = sorunlar.map((s) => s.ayrinti).filter(Boolean);
  return h('div', { class: 'not-kutusu hata hizli-sorunlar', role: 'alert' },
    h('p', {}, h('b', {}, sorunlar.length === 1 ? 'Kaydetmeden önce düzeltilmesi gereken 1 sorun var:' : `Kaydetmeden önce düzeltilmesi gereken ${sorunlar.length} sorun var:`)),
    h('ul', { 'aria-label': 'Kayıt sorunları' }, sorunlar.map((s) => {
      const hedef = s.duzelt && hedefler.includes(s.duzelt) ? s.duzelt : null;
      const dugme = hedef ? h('button', { type: 'button', class: 'hayalet', 'aria-label': `Düzelt: ${DUZELT_METNI[hedef]}` }, ikon('geri'), `Düzelt: ${DUZELT_METNI[hedef]}`) : null;
      if (dugme && hedef) dugme.addEventListener('click', () => duzelt(hedef, /** @type {HTMLButtonElement} */ (dugme)));
      return h('li', {}, h('span', {}, s.mesaj), dugme ? h('div', { class: 'dugmeler' }, dugme) : null);
    })),
    ayrintilar.length ? h('details', {}, h('summary', {}, 'Ayrıntı'), h('ul', { class: 'kucuk' }, ayrintilar.map((x) => h('li', {}, h('code', {}, x))))) : null);
}

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
  // Süre bandı: boşta kalma süresi dolmadan önce uyarı + "Süreyi uzat"; tarayıcı kapalıyken (tarayıcı gerektiren adımda) "Tarayıcıyı
  // yeniden aç". Öğeler kalıcıdır (her yoklamada yalnız metin değişir; tıklama kaçmaz).
  const sureMetni = h('span', {});
  const uzatDugmesi = h('button', { type: 'button', class: 'ikincil' }, ikon('yenile'), 'Süreyi uzat');
  const acDugmesi = h('button', { type: 'button', class: 'ikincil' }, ikon('oynat'), 'Tarayıcıyı yeniden aç');
  const sureBandi = h('div', { class: 'not-kutusu uyari hizli-sure', role: 'status', hidden: true }, sureMetni, h('div', { class: 'dugmeler' }, uzatDugmesi, acDugmesi));
  uzatDugmesi.addEventListener('click', async () => {
    try { await mesgulIken(uzatDugmesi, 'Uzatılıyor…', () => api('/platform/hizli-test/uzat', { govde: { id } })); bildir('Süre uzatıldı.', 'basari'); } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); }
    hemen();
  });
  acDugmesi.addEventListener('click', async () => {
    // Basılacak düğme varsa sunucu onay ister (yeniden basılacak düğmeler adlarıyla sorulur); yoksa yalnız alanlar doldurulur.
    try { await mesgulIken(acDugmesi, 'Açılıyor…', () => yenidenYurutmeOnayli((onay) => api('/platform/hizli-test/devam', { govde: { id, kip: 'tarayici', ...(onay ? { onay: true } : {}) } }))); } catch (e) { if (!(e && e.durum === 423)) bildir(hataMetni(e), 'hata'); }
    hemen();
  });
  /** @param {any} o */
  const sureCiz = (o) => {
    const s = o.sure;
    const kapaliAdim = o.tarayici === 'kapali' && ['veri', 'karar', 'bitis', 'hayirSecim', 'hataSorusu', 'onay'].includes(o.durum);
    const uyari = Boolean(s && s.uyari && o.tarayici !== 'kapali');
    sureBandi.hidden = !uyari && !kapaliAdim;
    if (sureBandi.hidden) return;
    uzatDugmesi.hidden = !uyari || !s.uzatilabilir;
    acDugmesi.hidden = !kapaliAdim;
    const kalan = s ? Math.max(0, Math.round(s.kalanMs / 1000)) : 0;
    const kalanYazi = kalan >= 60 ? `${Math.ceil(kalan / 60)} dk` : `${kalan} sn`;
    const metin = kapaliAdim ? 'Tarayıcı kapalı. Bu adımda tarayıcı gerekirse yeniden açılır ve zincir baştan tekrar yürütülerek buraya gelinir.'
      : s.sebep === 'ust' ? `Hızlı testin en uzun süresi doluyor: tarayıcı ${kalanYazi} içinde kapanacak (uzatılamaz). Toplananlar kaybolmaz.`
        : `${kalanYazi} içinde işlem yapılmazsa tarayıcı kapanacak. Toplananlar kaybolmaz; yine de sürdürmek için süreyi uzatın.`;
    if (sureMetni.textContent !== metin) sureMetni.textContent = metin;
  };
  govde.replaceChildren(serit, durumSatiri, sureBandi, h('div', { class: 'hizli-duzen' }, ana, yan));
  let imza = '';
  let yanImza = '';
  let sonDurumMetni = '';
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
    sureCiz(o);
    // Durum satırı yalnız iş metni değişince yazılır (araya giren duyuru her yoklamada silinmez).
    const durumMetni = o.calisiyor ? o.calisiyor : '';
    if (durumMetni !== sonDurumMetni) { sonDurumMetni = durumMetni; durumSatiri.textContent = durumMetni; }
    const yeniYan = JSON.stringify([o.adimlar, o.gunluk.length, (o.goruntu || '').length, o.bulgular, o.zincir]);
    if (yeniYan !== yanImza) { yanImza = yeniYan; yanCiz(yan, o); }
    if (yeniImza === imza) return;
    // Seçim sayfaya uygulanırken kart yerinde kalır (kullanıcı yazmayı / seçmeyi sürdürür); yanıt gelince yeniden çizilir.
    if (otoSuruyor(o)) return;
    imza = yeniImza;
    // Veri durağı yeniden çizilirken odak yerinde kalır (aynı alanın aynı girdisi).
    const oncekiOdak = o.soru && o.soru.tur === 'veri' ? odakYakala(ana) : null;
    yerlestir(ana, soruCiz(o, { hemen }));
    // Öncelikli odak (ör. yerinde zincir isteğinden sonra ilk yeni alan), yoksa önceki odak, yoksa kartın başlığı.
    const oncelik = ana.querySelector('[data-odak-oncelik]');
    if (oncelik instanceof HTMLElement) oncelik.focus();
    else if (!(oncekiOdak && odakGeriYukle(ana, oncekiOdak))) {
      const odak = ana.querySelector('[data-odak]');
      if (odak instanceof HTMLElement) odak.focus();
    }
    if (bekleyenDuyuru) { durumSatiri.textContent = bekleyenDuyuru; bekleyenDuyuru = ''; }
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
    // Bağlı liste zinciri ve bulguları (zincir keşfi; sayfanın kendisinde görülen sorunlar: boş kalan / hata veren / tekrarlayan liste).
    (o.zincir && o.zincir.length) || (o.bulgular && o.bulgular.length) ? h('section', { class: 'kart hizli-bulgular' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Bağlı listeler'), o.bulgular && o.bulgular.length ? rozet(`${o.bulgular.length} bulgu`, 'uyari') : null),
      o.zincir && o.zincir.length ? h('ul', { class: 'kucuk' }, o.zincir.map((z) => h('li', {}, z))) : null,
      o.bulgular && o.bulgular.length ? h('div', {}, h('h4', {}, 'Bulgular'), h('ul', { class: 'kucuk' }, o.bulgular.map((b) => h('li', {}, b))))
        : h('p', { class: 'soluk kucuk' }, 'Denenen seçimlerde sorun görülmedi.')) : null,
    o.gunluk && o.gunluk.length ? h('details', { class: 'kart hizli-gunluk' }, h('summary', {}, 'Olanlar'),
      h('ul', {}, o.gunluk.slice().reverse().map((g) => h('li', { class: 'kucuk' }, g.metin)))) : null);
}

/**
 * Sorunun çizimi. @param {any} o @param {{ hemen: () => void }} y
 * @returns {HTMLElement}
 */
/**
 * Düğme adaylarının seçenekleri: gerçek düğmeler önce, bağlantılar sonra (<optgroup> "Düğmeler (n)" / "Bağlantılar (m)"); her grup kendi
 * içinde aday sırasını korur, önerilen değer seçili gelir. Boş grup çizilmez.
 * @param {Array<{ secici: string; metin: string | null; baglanti?: boolean }>} adaylar @param {string | null} oneri
 * @param {(a: any) => string} yazi
 */
function dugmeSecenekleri(adaylar, oneri, yazi) {
  const secenek = (a) => h('option', { value: a.secici, selected: a.secici === oneri || null }, yazi(a));
  // Sayfa içi pencere (modal) açıksa: önce "Açılan pencerede" (düğme ve bağlantılar), en sonda "Pencerenin arkasında"; alanların yanındaki
  // simgeler (bilgi / ok…) ayrı "Alan ikonları" grubunda, en sonda.
  const ikonlar = adaylar.filter((a) => a.alanIkonu);
  const kalan = adaylar.filter((a) => !a.alanIkonu);
  const pencerede = kalan.filter((a) => a.pencerede);
  const arkada = kalan.filter((a) => a.arkada);
  const sayfa = kalan.filter((a) => !a.pencerede && !a.arkada);
  const dugmeler = sayfa.filter((a) => !a.baglanti);
  const baglantilar = sayfa.filter((a) => a.baglanti);
  return [
    pencerede.length ? h('optgroup', { label: `Açılan pencerede (${pencerede.length})` }, pencerede.map(secenek)) : null,
    dugmeler.length ? h('optgroup', { label: `Düğmeler (${dugmeler.length})` }, dugmeler.map(secenek)) : null,
    baglantilar.length ? h('optgroup', { label: `Bağlantılar (${baglantilar.length})` }, baglantilar.map(secenek)) : null,
    arkada.length ? h('optgroup', { label: `Pencerenin arkasında (${arkada.length}; pencere açıkken basılamayabilir)` }, arkada.map(secenek)) : null,
    ikonlar.length ? h('optgroup', { label: `Alan ikonları (${ikonlar.length})` }, ikonlar.map(secenek)) : null
  ];
}

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
      // Tarayıcı yeniden açılıp daha önce basılan düğmelere yeniden basılacaksa kullanıcıya düğmeler adlarıyla sorulur.
      const r = await mesgulIken(dugme, 'Gönderiliyor…', () => yenidenYurutmeOnayli((onay) => api(`/platform/hizli-test/${uc}`, { govde: { id: o.id, ...govde, ...(onay ? { onay: true } : {}) } })));
      if (r === null) return null;
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
    return kart(o.durum === 'dogrulama' ? 'Doğrulama koşusu' : o.durum === 'kesif' ? 'Keşfediliyor…' : o.durum === 'yeniden' ? 'Tarayıcı yeniden açılıyor…' : 'Çalışıyor…', 'pusula',
      h('p', { class: 'hizli-bekliyor' }, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), o.calisiyor || 'Bekleyin…'),
      o.durum === 'kesif' ? h('p', { class: 'soluk' }, 'Bu adımda hiçbir düğmeye basılmaz: alanlar, koşullar, düğme ve mesaj adayları okunur.') : null,
      // Doğrulama koşusu: zincirin adımları ve hangisinde olunduğu (motorun ilerleme bildirimleri).
      o.durum === 'dogrulama' && o.dogrulamaAdimlari ? dogrulamaAdimListesi(o.dogrulamaAdimlari) : null,
      // İşin (hazırlık / giriş) adımları yalnız keşifte anlamlı; sonrasında eski ileti (ör. "Tarayıcı hazır") yanıltır.
      o.durum === 'kesif' && adimlar.length ? h('ul', { class: 'hizli-is-adimlari kucuk' }, adimlar.map((a) => h('li', {}, `${a.etiket}: ${a.durum === 'tamam' ? 'tamam' : a.durum === 'atlandi' ? 'atlandı' : a.durum === 'hata' ? 'hata' : a.durum === 'suruyor' ? 'sürüyor' : 'bekliyor'}${a.mesaj ? ` — ${a.mesaj}` : ''}`))) : null);
  }
  const m = mesajKutusu();

  if (s.tur === 'askida') return askidaDuragi(o, s, kart, m, gonder);
  if (s.tur === 'veri') return veriDuragi(o, s, kart, m, gonder, y);

  if (s.tur === 'karar') {
    const sonFark = [...o.adimlar].reverse().find((a) => a.fark);
    const secenek = (deger, ...icerik) => {
      const r = h('input', { type: 'radio', name: 'hizli-karar', value: deger, id: `hizli-karar-${deger}` });
      return { r, el: h('label', { class: 'onay-satiri hizli-karar-secenegi', for: r.id }, r, h('span', {}, ...icerik)) };
    };
    const aday = h('select', { id: 'hizli-aday', 'aria-label': 'Basılacak düğme' },
      dugmeSecenekleri(s.adaylar, s.oneri, (a) => `${a.metin || a.secici}${a.kayitOlusturabilir ? ' (kayıt oluşturabilir)' : ''}`));
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

  // Keşif toplu sorusu: emin olunmayan düğmeler tek kartta, her biri için onay kutusu ("Seçilenlere bas" / "Hiçbirine basma" /
  // "Kalanları atla"). Keşif basışı akışın parçası değildir; kaydedilmez.
  if (s.tur === 'kesifOnay') {
    const dugmeler = Array.isArray(s.dugmeler) ? s.dugmeler : [];
    const kutular = dugmeler.map((/** @type {any} */ d, /** @type {number} */ i) => {
      const id = `hizli-kesif-dugme-${i}`;
      const c = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id, value: d.secici }));
      return {
        c,
        el: h('li', { class: 'hizli-kesif-dugmesi' }, h('label', { class: 'onay-satiri', for: id }, c, ' ', h('b', {}, d.metin || d.secici)),
          d.neden ? h('span', { class: 'soluk kucuk' }, d.emin ? `Sayfa içinde ${d.neden.replace(/^sayfa içinde /, '')}.` : `Emin değil: ${d.neden}.`) : null)
      };
    });
    const bas = h('button', { type: 'button', class: 'birincil', 'data-odak': '' }, 'Seçilenlere bas');
    const basma = h('button', { type: 'button', class: 'ikincil' }, 'Hiçbirine basma');
    const atlaDugmesi = h('button', { type: 'button', class: 'hayalet' }, 'Kalanları atla');
    bas.addEventListener('click', () => {
      const secilenler = kutular.filter((k) => k.c.checked).map((k) => k.c.value);
      if (!secilenler.length) { m.goster('Basılacak düğme seçin ya da “Hiçbirine basma” deyin.'); return; }
      void gonder(bas, 'onay', { cevap: true, secilenler }, m);
    });
    basma.addEventListener('click', () => void gonder(basma, 'onay', { cevap: false }, m));
    atlaDugmesi.addEventListener('click', () => void gonder(atlaDugmesi, 'onay', { cevap: 'atla' }, m));
    return kart('Keşif için şu düğmelere basılabilir', 'soru', m.kutu,
      h('div', { class: 'hizli-kesif-sorusu' },
        h('p', {}, 'Bu düğmelerin ne yaptığından emin değilim. Seçtiklerinize keşif için basıp sayfada ne açıldığına bakarım (yeni alanlar, seçimler, pencereler, metinler). Bu basışlar kaydedilen senaryoya girmez; basarken kayıt oluşturan / gönderen istekler engellenir, sonra sayfa ilk durumuna döndürülür.'),
        h('ul', { class: 'hizli-kesif-dugmeleri', 'aria-label': 'Keşif için basılabilecek düğmeler' }, kutular.map((k) => k.el))),
      h('div', { class: 'dugmeler' }, bas, basma, atlaDugmesi));
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

  // Bana sor: basışta sayfa onay / soru penceresi açtı (tarayıcıda pencere açık bekliyor). Yanıt modele aksiyonun pencere yanıtı olarak
  // yazılır; doğrulama ve normal koşu aynı yanıtı verir.
  if (s.tur === 'diyalog') {
    const tamam = h('button', { type: 'button', class: 'birincil', 'data-odak': '' }, 'Tamam (onayla)');
    const iptalEt = h('button', { type: 'button', class: 'hayalet' }, 'İptal');
    tamam.addEventListener('click', () => void gonder(tamam, 'diyalog', { cevap: 'kabul' }, m));
    iptalEt.addEventListener('click', () => void gonder(iptalEt, 'diyalog', { cevap: 'iptal' }, m));
    return kart('Şimdi ne yapayım? Sayfa bir pencere açtı', 'soru', m.kutu,
      h('p', {}, s.dugme ? h('span', {}, h('b', {}, `“${s.dugme.metin || s.dugme.secici}”`), ' düğmesine basınca sayfa bir ', s.diyalogTuru === 'prompt' ? 'soru' : 'onay', ' penceresi açtı:') : 'Sayfa bir pencere açtı:'),
      h('blockquote', { class: 'hizli-diyalog-metni' }, s.mesaj || '(metinsiz pencere)'),
      h('p', { class: 'soluk kucuk' }, 'Seçiminiz teste yazılır: doğrulama ve normal koşu bu pencereye aynı yanıtı verir.'),
      h('div', { class: 'dugmeler' }, tamam, iptalEt));
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

  // Bitiş koşulu için tarayıcıda seçim ("Sayfada seç…" / "Şu öğe görününce bitti…"): tıklama sayfaya iletilmez.
  if (s.tur === 'bitisSecim') {
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    vazgec.addEventListener('click', () => void gonder(vazgec, 'bitis-sec', { vazgec: true }, m));
    return kart(s.secimTuru === 'oge' ? 'Tarayıcıda bitişi gösteren öğeyi seçin' : 'Tarayıcıda bitiş metnini seçin', 'hedef', m.kutu,
      h('p', {}, s.secimTuru === 'oge'
        ? 'Hızlı test tarayıcısında, görününce testin bittiğini gösteren öğeye (açılan pencere, kutu, düğme) tıklayın. Tıklama sayfaya iletilmez.'
        : 'Hızlı test tarayıcısında, görününce testin bittiğini gösteren yazıya tıklayın. Tıklama sayfaya iletilmez; yazı “Bitti” olarak eklenir.'),
      h('div', { class: 'dugmeler' }, vazgec));
  }

  if (s.tur === 'secim') {
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    vazgec.addEventListener('click', () => void gonder(vazgec, 'karar', { karar: 'vazgec' }, m));
    return kart('Tarayıcıda düğmeyi seçin', 'hedef', m.kutu,
      h('p', {}, 'Hızlı test tarayıcısında basılacak düğmeye tıklayın. Tıklama sayfaya iletilmez; seçtiğiniz düğme burada sorulur.'),
      h('div', { class: 'dugmeler' }, vazgec));
  }

  if (s.tur === 'hayirSecim') {
    const dugme = h('select', { id: 'hizli-hayir-dugme' }, dugmeSecenekleri(s.adaylar, s.oneri, (a) => a.metin || a.secici));
    const kutular = s.mesajlar.map((x, i) => {
      const k = h('input', { type: 'checkbox', id: `hizli-mesaj-${i}`, value: x.metin, checked: (x.tur === 'basari' && i === 0) || null });
      return { k, el: h('label', { class: 'onay-satiri', for: k.id }, k, h('span', {}, x.metin, ' ', rozet(x.kaynak === 'cumle' ? 'cümleden' : x.tur === 'hata' ? 'hata adayı' : x.tur === 'bekleme' ? 'bekleme adayı' : 'sayfada gizli'))) };
    });
    const bitir = h('button', { type: 'button', class: 'birincil' }, 'Burada bitir');
    bitir.addEventListener('click', () => void gonder(bitir, 'karar', { karar: 'bitir', dugme: dugme.value, mesajlar: kutular.filter((x) => x.k.checked).map((x) => x.k.value) }, m));
    const duzelt = h('button', { type: 'button', class: 'hayalet' }, 'Veriyi düzenle');
    duzelt.addEventListener('click', () => void gonder(duzelt, 'karar', { karar: 'duzelt' }, m));
    // Aday listesinde olmayan düğme: tarayıcıda tıklanarak seçilir (tıklama sayfaya iletilmez; basılmaz).
    const sayfadaSec = h('button', { type: 'button', class: 'hayalet' }, 'Tarayıcıda seç…');
    sayfadaSec.addEventListener('click', () => void gonder(sayfadaSec, 'karar', { karar: 'baska' }, m));
    bitir.disabled = !s.adaylar.length;
    return kart('Düğmeyi ve mesajı seçin', 'hedef', m.kutu,
      h('div', { class: 'not-kutusu bilgi', role: 'note' }, 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz. Seçimler adaylardandır; test “doğrulanmadı” olarak kaydedilir ve ilk koşuda doğrulanır.'),
      !s.adaylar.length ? h('div', { class: 'not-kutusu uyari', role: 'status' }, 'Sayfada düğme adayı bulunamadı. Formu gönderen düğmeyi “Tarayıcıda seç…” ile hızlı test tarayıcısında tıklayarak seçin; ya da hızlı testi iptal edip “Evet” / “Bana sor” izniyle yeniden başlatın.') : null,
      h('div', { class: 'alan' }, h('label', { for: 'hizli-hayir-dugme' }, 'Formu gönderen düğme'), dugme, h('div', { class: 'dugmeler' }, sayfadaSec)),
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
/**
 * Tarayıcı kapandı (boşta kalma / en uzun süre doldu, pencere kapatıldı): toplananlar duruyor. "Kaldığın yerden devam et" tarayıcıyı
 * yeniden açıp zinciri tekrar yürütür; "Toplananları kaydet" tarayıcı açmadan bitiş koşuluna / kaydete geçer (doğrulanmadı).
 * @param {any} o @param {any} s @param {(...a: any[]) => HTMLElement} kart @param {{ kutu: HTMLElement; goster: (m: string) => void }} m
 * @param {(dugme: HTMLButtonElement, uc: string, govde: Record<string, unknown>, m: { goster: (m: string) => void }) => Promise<any>} gonder
 */
function askidaDuragi(o, s, kart, m, gonder) {
  const t = s.toplanan || {};
  const devam = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Kaldığın yerden devam et'));
  devam.addEventListener('click', () => void gonder(devam, 'devam', { kip: 'tarayici' }, m));
  const kaydet = s.kaydedilebilir ? /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'ikincil' }, ikon('onay'), 'Toplananları kaydet')) : null;
  if (kaydet) kaydet.addEventListener('click', () => void gonder(kaydet, 'devam', { kip: 'kaydet' }, m));
  return kart('Tarayıcı kapandı — toplananlar duruyor', 'uyari',
    h('div', { class: 'not-kutusu uyari', role: 'alert' }, s.mesaj),
    m.kutu,
    h('p', {}, `Toplanan: ${t.adim ?? 0} adım, ${t.deger ?? 0} değer, ${t.basis ?? 0} düğme basışı${t.etiket ? `, ${t.etiket} etiket` : ''}${s.bitisVar ? ', bitiş koşulu' : ''}.`),
    h('ul', { class: 'kucuk' },
      h('li', {}, h('b', {}, 'Kaldığın yerden devam et: '), TEKRAR_YURUTME_METNI),
      kaydet ? h('li', {}, h('b', {}, 'Toplananları kaydet: '), s.bitisVar ? 'Tarayıcı açılmadan kaydet adımına geçilir; doğrulama yapılmadıysa test “doğrulanmadı” olarak kaydedilir.'
        : 'Tarayıcı açılmadan bitiş koşulu adımına geçilir, sonra kaydedilir; test “doğrulanmadı” olarak kaydedilir.')
        : h('li', {}, 'Henüz hiçbir düğmeye basılmadığı için kaydedilecek bir zincir yok; devam edin.')),
    h('div', { class: 'dugmeler' }, devam, kaydet));
}

function farkCiz(a) {
  const f = a.fark;
  const sn = (f.sureMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return h('div', { class: 'hizli-fark' },
    h('p', {}, h('b', {}, `“${a.bas ? a.bas.metin || a.bas.secici : '?'}”`), ` düğmesine basıldı; ${sn} sn sonra sayfa:`,
      f.zamanAsimi ? h('span', { class: 'soluk' }, ' (bekleme 60 sn’de kesildi)') : null),
    f.tiklamaNotu ? h('p', { class: 'kucuk' }, `Not: ${f.tiklamaNotu}.`) : null,
    // Basışta açılan tarayıcı pencereleri (alert / confirm / prompt) ve verilen yanıt.
    Array.isArray(f.diyaloglar) && f.diyaloglar.length ? h('ul', { class: 'hizli-diyaloglar kucuk', 'aria-label': 'Tarayıcı pencereleri' }, f.diyaloglar.map((x) => h('li', {},
      `${x.tur === 'alert' ? 'Bilgi' : x.tur === 'prompt' ? 'Soru' : 'Onay'} penceresi: “${x.mesaj}” → `,
      h('b', {}, x.tur === 'alert' ? 'Tamam' : x.yanit === 'kabul' ? 'Tamam (onaylandı)' : 'İptal')))) : null,
    f.beklemeMetinleri.length ? h('p', { class: 'kucuk soluk' }, `Beklerken: ${f.beklemeMetinleri.join(' · ')}`) : null,
    f.yeniMetinler.length ? h('ul', { class: 'hizli-metinler', 'aria-label': 'Yeni metinler' }, f.yeniMetinler.slice(0, 12).map((m) => h('li', {},
      h('span', { class: `hizli-cip${m.tur === 'hata' ? ' e-hata' : m.tur === 'basari' ? ' e-bitti' : ''}` }, m.metin)))) : h('p', { class: 'soluk kucuk' }, 'Yeni metin görülmedi.'),
    f.yeniAlanlar.length ? h('p', { class: 'kucuk' }, `Yeni alanlar: ${f.yeniAlanlar.join(', ')}`) : null,
    f.yeniDugmeler.length ? h('p', { class: 'kucuk' }, `Yeni düğmeler: ${f.yeniDugmeler.join(', ')}`) : null,
    f.adres ? h('p', { class: 'kucuk' }, `Adres değişti: ${f.adres.once} → ${f.adres.sonra}`) : null);
}

/**
 * Yerinde zincir isteğinden ("↓ … seçeneklerini getir") sonraki çizim için: hangi oturumda hangi üst liste için istendi. Seçenekler gelince
 * odak ilk yeni alana gider ve oturum ekranının canlı durum satırında duyurulur.
 * kosul: "Önce bunu seçin" isteği (ust = görünürlüğü belirleyen seçim).
 * @type {{ id: string; ust: string; kosul?: boolean } | null}
 */
let zincirOdagi = null;
/** Oturum ekranının canlı durum satırında (aria-live) bir kez okunacak duyuru. */
let bekleyenDuyuru = '';

/** Seçimin değişikliğinden sayfaya uygulanmasına kadar beklenen süre (ms): hızlı ardışık değişikliklerde yalnız son durum uygulanır. */
const OTO_GECIKME_MS = 400;
/**
 * Seçimlerin ANINDA uygulanması (veri durağı): bir seçim (radyo, liste, onay kutusu) değişince kısa gecikmeyle sayfaya uygulanır (düğmeye
 * basılmaz); sayfa sakinleşince yerinde keşif yapılır ve form güncellenir. Kart yeniden çizilirken kullanıcının o arada yazdıkları (taslak)
 * korunur, odak yerinde kalır. Durum oturum ve adım başınadır (kart yeniden çizilse de sürer).
 * id / adim: hangi veri durağı; zamanlayici: gecikme; kuyruk: uygulanacak seçimler (son değişen sonda; aynı seçim bir kez — hızlı
 * ardışık değişiklikte yalnız son durumu gider); suruyor: sayfaya uygulanan seçim (sunucu yanıtı gelene kadar kart yeniden çizilmez);
 * taslak: gönderimden sonra değişen değerler; uygulananlar: bu durakta sayfaya uygulanmış seçimler; gonder: son çizimin gönderici
 * işlevi; hata: son uygulamanın hatası (seçimin satırında gösterilir).
 * @type {{ id: string | null; adim: number | null; zamanlayici: ReturnType<typeof setTimeout> | null; kuyruk: string[]; suruyor: string | null;
 *   taslak: Record<string, any>; uygulananlar: Set<string>; gonder: (() => void) | null; hata: { anahtar: string; mesaj: string } | null }}
 */
const oto = { id: null, adim: null, zamanlayici: null, kuyruk: [], suruyor: null, taslak: {}, uygulananlar: new Set(), gonder: null, hata: null };
/** Başka bir veri durağına geçildi: anında uygulama durumu sıfırlanır. @param {string | null} id @param {number | null} adim */
function otoSifirla(id, adim) {
  if (oto.zamanlayici) clearTimeout(oto.zamanlayici);
  Object.assign(oto, { id, adim, zamanlayici: null, kuyruk: [], suruyor: null, taslak: {}, uygulananlar: new Set(), gonder: null, hata: null });
}
/** Seçim sayfaya uygulanıyor ya da uygulanmayı bekliyor mu. @param {string} anahtar */
const otoBekliyor = (anahtar) => oto.suruyor === anahtar || oto.kuyruk.includes(anahtar);
/** Seçim uygulanırken kart yeniden çizilmez (form yerinde kalır; kullanıcı yazmayı sürdürebilir). @param {any} o */
const otoSuruyor = (o) => Boolean(o && oto.suruyor && oto.id === o.id && ['zincir', 'calisiyor'].includes(o.durum));

/** Odaktaki girdinin yeri (hangi alanın satırında, kaçıncı aynı tür öğe, imleç): kart yeniden çizilince geri konur. @param {HTMLElement} kok */
function odakYakala(kok) {
  const e = document.activeElement;
  if (!(e instanceof HTMLElement) || !kok.contains(e)) return null;
  const sahip = e.closest('[data-anahtar]');
  if (!sahip) return null;
  const ayni = [...sahip.querySelectorAll(e.tagName)].filter((x) => x.closest('[data-anahtar]') === sahip);
  const g = /** @type {HTMLInputElement} */ (e);
  let bas = null;
  let son = null;
  try { bas = typeof g.selectionStart === 'number' ? g.selectionStart : null; son = typeof g.selectionEnd === 'number' ? g.selectionEnd : null; } catch { /* seçim yok */ }
  return { anahtar: sahip.getAttribute('data-anahtar'), etiket: e.tagName, tip: e.getAttribute('type'), deger: g.value ?? null, sira: ayni.indexOf(e), bas, son };
}
/** @param {HTMLElement} kok @param {NonNullable<ReturnType<typeof odakYakala>>} b @returns {boolean} */
function odakGeriYukle(kok, b) {
  for (const sahip of kok.querySelectorAll('[data-anahtar]')) {
    if (sahip.getAttribute('data-anahtar') !== b.anahtar) continue;
    const l = [...sahip.querySelectorAll(b.etiket)].filter((x) => x.closest('[data-anahtar]') === sahip);
    // Radyoda aynı değerli seçenek; diğerlerinde aynı sıradaki öğe.
    const e = /** @type {HTMLInputElement | undefined} */ ((b.tip === 'radio' ? l.find((x) => /** @type {HTMLInputElement} */ (x).value === b.deger) : null) ?? l[b.sira] ?? l[0]);
    if (!e || e.disabled) continue;
    e.focus();
    try { if (b.bas !== null && b.son !== null) e.setSelectionRange(b.bas, b.son); } catch { /* seçim yok */ }
    return true;
  }
  return false;
}

/**
 * Veri durağında dosya alanı: seçili dosyanın adı + "Dosya seç" (bilgisayardan; tarayıcı dosya girdisi → şifreli depoya yükleme) ve
 * "Depodan seç" (projenin şifreli senaryo dosyaları). sec(başvuru | null) seçimi bildirir.
 * @param {any} o oturum @param {any} a alan @param {HTMLElement} kap @param {string} id @param {{ deger: unknown }} d
 * @param {(ref: string | null) => void} sec @param {{ goster: (m: string, tur?: string) => void }} m
 */
function dosyaAlaniCiz(o, a, kap, id, d, sec, m) {
  const ref = dosyaReferansiCoz(d.deger);
  const girdi = /** @type {HTMLInputElement} */ (h('input', { type: 'file', class: 'gorunmez-dosya', accept: a.kabul || null, tabindex: '-1', 'aria-hidden': 'true' }));
  // Etiket (label for) bu düğmeyi gösterir; adı ne yaptığını ve hangi alan olduğunu söyler.
  const sec_ = h('button', { type: 'button', id, class: 'kucuk-dugme hizli-dosya-sec', 'aria-label': `${ref ? 'Başka dosya seç' : 'Dosya seç'}: ${a.etiket}` }, ikon('yukle'), ref ? 'Başka dosya seç' : 'Dosya seç');
  const durumSatiri = h('span', { class: 'soluk kucuk', role: 'status' });
  sec_.addEventListener('click', () => girdi.click());
  girdi.addEventListener('change', async () => {
    const dosya = girdi.files && girdi.files[0];
    if (!dosya) return;
    const hata = dosyaOnDenetimi(dosya, a.kabul);
    if (hata) { m.goster(hata); return; }
    sec_.disabled = true;
    try {
      const r = await dosyaYukle(`/platform/hizli-test/dosya-yukle?id=${encodeURIComponent(o.id)}&alan=${encodeURIComponent(a.anahtar)}`, dosya, (y) => { durumSatiri.textContent = `Yükleniyor… %${y}`; });
      sec(r.referans);
    } catch (e) {
      m.goster(e && e.message ? e.message : 'Dosya yüklenemedi.');
      sec_.disabled = false;
      durumSatiri.textContent = '';
    }
  });
  const depo = h('button', { type: 'button', class: 'kucuk-dugme hayalet hizli-dosya-depo' }, 'Depodan seç');
  const depoKap = h('div', { class: 'hizli-dosya-deposu' });
  depo.addEventListener('click', async () => {
    depo.disabled = true;
    try {
      const r = await api(`/platform/hizli-test/dosyalar?id=${encodeURIComponent(o.id)}`);
      const liste = Array.isArray(r.dosyalar) ? r.dosyalar : [];
      if (!liste.length) { yerlestir(depoKap, h('p', { class: 'soluk kucuk' }, 'Bu projenin dosya deposunda dosya yok; “Dosya seç” ile bilgisayarınızdan seçin.')); return; }
      const secim = h('select', { 'aria-label': `${a.etiket}: depodaki dosyalar` }, h('option', { value: '' }, 'Dosya seçin'),
        liste.map((x) => h('option', { value: x.referans }, `${x.ad} (${Math.max(1, Math.round(x.boyut / 1024))} KB)`)));
      secim.addEventListener('change', () => { if (/** @type {HTMLSelectElement} */ (secim).value) sec(/** @type {HTMLSelectElement} */ (secim).value); });
      yerlestir(depoKap, secim);
      /** @type {HTMLSelectElement} */ (secim).focus();
    } catch (e) {
      m.goster(e && e.message ? e.message : 'Dosya deposu okunamadı.');
    } finally { depo.disabled = false; }
  });
  const kaldir = ref ? h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, 'Kaldır') : null;
  if (kaldir) kaldir.addEventListener('click', () => sec(null));
  yerlestir(kap,
    ref ? h('span', { class: 'hizli-dosya-adi' }, ikon('dosya'), ref.ad) : h('span', { class: 'soluk kucuk' }, 'Dosya seçilmedi'),
    ref ? rozet('şifreli depoda') : null, girdi, sec_, depo, kaldir, durumSatiri, depoKap);
}

/**
 * Türkçe yönelme eki (ünlü uyumu; ünlüyle biten adda kaynaştırma "y"): "Kaydet" → "e", "İleri" → "ye", "Onay" → "a". Harfle bitmeyen
 * adda boş (başlık "düğmesine" ile kurulur). @param {string} s @returns {string | null}
 */
function yonelmeEki(s) {
  const kucuk = String(s).trim().toLocaleLowerCase('tr');
  const sesli = [...kucuk].reverse().find((c) => 'aeıioöuü'.includes(c));
  if (!sesli || !/\p{L}/u.test(kucuk.slice(-1))) return null;
  return `${'aeıioöuü'.includes(kucuk.slice(-1)) ? 'y' : ''}${'eiöü'.includes(sesli) ? 'e' : 'a'}`;
}

/**
 * Keşif basışıyla açılan alanlar (bilgi; sorulmaz): keşifte basılan düğmenin açtığı alanlar — akışta o düğmeye basılırsa sorulur.
 * @param {any} s
 */
function kesifAlanlariBolumu(s) {
  const l = Array.isArray(s.kesifAlanlari) ? s.kesifAlanlari : [];
  if (!l.length) return null;
  return h('div', { class: 'hizli-kesif-alanlari' }, l.map((/** @type {any} */ x) => {
    const id = `hizli-kesif-alanlari-${Math.random().toString(36).slice(2, 9)}`;
    const ek = yonelmeEki(x.dugme);
    return h('section', { class: 'hizli-salt-okunur', 'aria-labelledby': id },
      h('h4', { id }, `“${x.dugme}”${ek ?? ' düğmesine'} basınca açılan alanlar (akışta bu düğmeye basarsanız sorulur)`),
      h('ul', { class: 'hizli-salt-okunur-liste kucuk' }, x.alanlar.map((/** @type {string} */ a) => h('li', {}, a))));
  }));
}

/**
 * Sayfanın doldurduğu (salt okunur, hesaplanan) alanlar: sorulmaz; bilgi olarak sayfadaki değerleriyle ("neden sorulmadı?"). Bitişte
 * basıştan sonraki değerler (kontrol için okunur). @param {any} s @param {boolean} bitis
 */
function saltOkunurBolumu(s, bitis) {
  const l = Array.isArray(s.saltOkunurlar) ? s.saltOkunurlar : [];
  if (!l.length) return null;
  const id = `hizli-salt-okunur-${Math.random().toString(36).slice(2, 9)}`;
  return h('section', { class: 'hizli-salt-okunur', 'aria-labelledby': id },
    h('h4', { id }, 'Sayfanın doldurduğu alanlar (salt okunur)'),
    h('p', { class: 'soluk kucuk' }, bitis ? 'Bunlar sorulmadı: sayfa kendisi dolduruyor. Son durumdaki değerleri:'
      : 'Bunlar sorulmaz: sayfa kendisi dolduruyor (çoğu zaman başka seçimlere göre hesaplanır). Şu anki değerleri:'),
    h('ul', { class: 'hizli-salt-okunur-liste kucuk' }, l.map((/** @type {any} */ x) => h('li', {}, h('span', { class: 'hizli-salt-okunur-adi' }, x.etiket), ': ',
      x.deger ? h('span', { class: 'hizli-salt-okunur-degeri' }, x.deger) : h('span', { class: 'soluk' }, 'şu an boş')))));
}

/** 3. durak: veri durağı. */
function veriDuragi(o, s, kart, m, gonder, y) {
  // Anında uygulama: başka veri durağına geçildiyse sıfırlanır; uygulanan seçimin yanıtı geldiyse (bu çizim) biter.
  if (oto.id !== o.id || oto.adim !== s.adim) otoSifirla(o.id, s.adim);
  const otoBitti = oto.suruyor;
  if (otoBitti) { oto.suruyor = null; if (s.not) bekleyenDuyuru = String(s.not); }
  // Uygulama sürerken başka seçim değiştiyse (yalnız son durumu): çizimden hemen sonra uygulanır.
  if (otoBitti && oto.kuyruk.length && !oto.zamanlayici) setTimeout(() => { if (oto.gonder) oto.gonder(); }, 0);
  /** Kart kurulurken (sunucunun değerleri) taslağa yazılmaz; sonra kullanıcının her değişikliği taslağa da yazılır. */
  let kuruluyor = true;
  /** @type {Record<string, { deger: string | boolean | null; kaynak: 'elle' | 'tablo' | 'dosya' | null; tabloSecimi?: any }>} */
  const durum = new Proxy({}, {
    set(t, k, v) { /** @type {any} */ (t)[k] = v; if (!kuruluyor && typeof k === 'string') oto.taslak[k] = v; return true; }
  });
  /** Alanın başlangıç değeri: uygulama sürerken yazılan (taslak), yoksa sunucudaki. @param {any} a */
  const ilkDurum = (a) => oto.taslak[a.anahtar] ?? { deger: a.deger, kaynak: a.kaynak };
  /** Yerinde zincir isteği sürüyor mu (üst liste anahtarı): kart yerinde kalır, girdiler beklerken kapalıdır. */
  const getiriliyor = s.getiriliyor || null;
  // Bağlı listeler (il → ilçe → mahalle, marka → model…): seçenekleri üst listenin seçimine göre gelir. Üst seçilince alanın HEMEN YANINDA
  // "↓ “İlçe” seçeneklerini getir" düğmesi etkinleşir; basınca yalnız o seçim sayfaya uygulanır, alt liste aynı kartta, üstünün altında,
  // girintili ve seçenekleriyle belirir. Seçenekleri bu üst değere göre gelmemiş liste kilitlidir ("Önce … seçin").
  const bul = (/** @type {string} */ k) => s.alanlar.find((x) => x.anahtar === k);
  /** Bu duraktaki bağlı alt listeler. @param {string} ust */
  const altlari = (ust) => s.alanlar.filter((x) => x.bagli && x.bagli.ust === ust);
  /** Zincir bağı bu durakta mı (üst liste de burada)? */
  const zincirde = (/** @type {any} */ a) => Boolean(a.bagli && bul(a.bagli.ust));
  /** @type {Set<string>} */
  const kilitli = new Set(s.alanlar.filter((a) => a.bagli && (zincirde(a) ? !a.bagli.getirildi : a.bagli.bekliyor)).map((a) => a.anahtar));
  /** @type {Map<string, () => void>} */
  const cizenler = new Map();
  /** @type {Map<string, () => void>} */
  const zincirCizenler = new Map();
  /** Etiketi seçime göre değişen alanların ad çizicileri (seçim değişince ad anında değişir). @type {Map<string, () => void>} */
  const etiketCizenler = new Map();
  /** Anında uygulama göstergelerinin çizicileri (seçimin satırında "Sayfaya uygulanıyor…" / hata). @type {Map<string, () => void>} */
  const otoCizenler = new Map();
  /**
   * Seçimin şu anki değeri: girilen, yoksa sayfadaki (uygulanmış) / ilk değer; tablodan gelen değer bilinmez (null).
   * @param {any} k @returns {string | null}
   */
  function secimDegeri(k) {
    const d = durum[k.anahtar];
    if (d && d.kaynak === 'tablo') return null;
    const v = d && d.deger !== null && d.deger !== undefined && d.deger !== '' ? d.deger : (k.sayfadaki ?? k.ilk ?? null);
    return v === null || v === undefined ? null : String(v);
  }
  /** Alanın seçimin verilen değerindeki adı (etiketKosulu; bilinmiyorsa ilk görülen ad). @param {any} a @param {string | null} v */
  const degerdekiEtiket = (a, v) => (a.etiketKosulu ? ((v !== null && a.etiketKosulu.etiketler[v]) || a.etiketKosulu.varsayilan || a.etiket) : a.etiket);
  /** Alanın şu an gösterilen adı: etiketi seçime göre değişiyorsa seçimin şu anki değerindeki ad. @param {any} a @returns {string} */
  function gosterilenEtiket(a) {
    if (!a.etiketKosulu) return a.etiket;
    const k = bul(a.etiketKosulu.secim);
    const d = durum[a.etiketKosulu.secim];
    if (!k || (d && d.kaynak === 'tablo')) return a.etiket;
    return degerdekiEtiket(a, secimDegeri(k));
  }
  /** Alanın seçimin verilen değerindeki en çok karakter sayısı (maxlength; seçime göre değişiyorsa o değerdeki). @param {any} a @param {string | null} v */
  const degerdekiEnCok = (a, v) => {
    const l = a.etiketKosulu && a.etiketKosulu.enCoklar;
    if (l && v !== null && l[v] !== undefined) return l[v];
    return Number.isInteger(a.enCok) ? a.enCok : null;
  };
  /** Alanın şu anki en çok karakter sayısı (seçimin şu anki değerine göre). @param {any} a @returns {number | null} */
  function gosterilenEnCok(a) {
    const k = a.etiketKosulu ? bul(a.etiketKosulu.secim) : null;
    return degerdekiEnCok(a, k ? secimDegeri(k) : null);
  }
  /** "Özel" → "Özel'de", "Tüzel" → "Tüzel'de", "Kurum" → "Kurum'da", "Şirket" → "Şirket'te" (Türkçe bulunma eki). @param {string} s */
  const bulunmaEki = (s) => {
    const t = String(s).trim();
    const kucuk = t.toLocaleLowerCase('tr');
    const son = kucuk.slice(-1);
    const sesli = [...kucuk].reverse().find((c) => 'aeıioöuü'.includes(c));
    if (!sesli || !/\p{L}/u.test(son)) return `${t} seçiminde`;
    return `${t}'${'fstkçşhp'.includes(son) ? 't' : 'd'}${'eiöü'.includes(sesli) ? 'e' : 'a'}`;
  };
  /** Alanın seçimin DİĞER değerlerindeki adları: "Özel'de: Kimlik no" (aynı adı soran değerler birlikte). @param {any} a @returns {string} */
  function digerEtiketler(a) {
    const k = a.etiketKosulu ? bul(a.etiketKosulu.secim) : null;
    if (!k) return '';
    const simdiki = gosterilenEtiket(a);
    const secenekler = k.tur === 'checkbox' ? [{ deger: 'true', metin: 'işaretli' }, { deger: 'false', metin: 'işaretsiz' }] : (k.secenekler || []);
    /** @type {Map<string, string[]>} */
    const adlar = new Map();
    const simdikiEnCok = gosterilenEnCok(a);
    for (const x of secenekler) {
      if (String(x.deger) === '') continue;
      const n = degerdekiEnCok(a, String(x.deger));
      const ad0 = degerdekiEtiket(a, String(x.deger));
      if (!ad0 || (ad0 === simdiki && n === simdikiEnCok)) continue;
      const ad = n !== simdikiEnCok && n !== null ? `${ad0}, en çok ${n} karakter` : ad0;
      (adlar.get(ad) || adlar.set(ad, []).get(ad) || []).push(bulunmaEki(x.metin || x.deger));
    }
    return [...adlar].map(([ad, l]) => `${l.join(', ')}: ${ad}`).join('; ');
  }
  /** Üst liste değişti: altları (ve onların altlarını) boşaltır ve kilitler. @param {string} ust */
  const altlariKilitle = (ust) => {
    for (const a of altlari(ust)) {
      if (durum[a.anahtar] && durum[a.anahtar].kaynak === 'tablo') continue;
      durum[a.anahtar] = { deger: null, kaynak: null };
      kilitli.add(a.anahtar);
      const c = cizenler.get(a.anahtar);
      if (c) c();
      altlariKilitle(a.anahtar);
    }
  };
  /** Değer girilmiş mi (sayfada hazır gelen de sayılır)? */
  const dolu = (/** @type {any} */ a) => {
    const d = durum[a.anahtar];
    return (d && d.deger !== null && d.deger !== '' && d.deger !== undefined) || (a.hazir && a.deger === null && !acilan.has(a.anahtar));
  };
  /** Alt liste hazır mı: tablodan seçildi ya da seçenekleri üstün şu anki değerine göre geldi. */
  const altHazir = (/** @type {any} */ a) => (durum[a.anahtar] && durum[a.anahtar].kaynak === 'tablo') || !kilitli.has(a.anahtar);
  /**
   * Sayfada hazır gelen (değeri okunan, kullanıcının değer girmediği) alanın sayfadaki değeri, girdinin biçiminde: liste / radyo → seçenek
   * değeri, onay kutusu → true, metin → yazı. Hazır değilse null. Bu değer değiştirilmezse sunucuya gitmez (sayfadaki kullanılır).
   * @param {any} a @returns {string | boolean | null}
   */
  const hazirDegeri = (a) => {
    if (!a.hazir || a.deger !== null || a.mevcut === null || a.mevcut === undefined) return null;
    if (a.tur === 'checkbox') return true;
    if (Array.isArray(a.secenekler)) {
      const x = a.secenekler.find((/** @type {any} */ y) => y.metin === a.mevcut) || a.secenekler.find((/** @type {any} */ y) => String(y.deger) === a.mevcut);
      return x ? String(x.deger) : null;
    }
    return String(a.mevcut);
  };
  /** Girilen değer sayfadaki hazır değerle aynıysa "girilmedi" sayılır (sayfadaki kullanılır, yeniden yazılmaz). @param {any} a @param {string | boolean | null} v */
  const girilen = (a, v) => {
    const sd = hazirDegeri(a);
    return v === null || v === '' || (sd !== null && String(v) === String(sd)) ? { deger: null, kaynak: null } : { deger: v, kaynak: /** @type {'elle'} */ ('elle') };
  };
  const satirYap = (a) => {
    durum[a.anahtar] = ilkDurum(a);
    const sd = hazirDegeri(a);
    const id = `hizli-alan-${Math.random().toString(36).slice(2, 9)}`;
    const kap = h('div', { class: 'hizli-alan-girdisi' });
    // En çok karakter (maxlength; seçime göre değişebilir): ipucu "En çok 10 karakter."; aşılırsa uyarı (engellemez, sayfa da kısaltabilir).
    const uzunlukIpucu = h('div', { class: 'hizli-uzunluk soluk kucuk', id: `${id}-uzunluk` });
    const uzunlukCiz = () => {
      const n = ['checkbox', 'radio', 'file', 'select', 'select-one', 'select-multiple'].includes(String(a.tur)) || Array.isArray(a.secenekler) ? null : gosterilenEnCok(a);
      const d = durum[a.anahtar];
      const v = d && d.kaynak !== 'tablo' && typeof d.deger === 'string' ? d.deger : '';
      uzunlukIpucu.hidden = n === null;
      if (n === null) return;
      const asti = v.length > n;
      uzunlukIpucu.classList.toggle('hizli-uzunluk-asim', asti);
      uzunlukIpucu.textContent = asti ? `${v.length} karakter girildi; bu alan en çok ${n} karakter alır.` : `En çok ${n} karakter.`;
    };
    const ciz = () => {
      const d = durum[a.anahtar];
      if (a.bagli && kilitli.has(a.anahtar) && d.kaynak !== 'tablo') {
        // Seçenekler henüz yok: liste kilitli; tablodan (geçerli kombinasyon satırı) yine seçilebilir.
        const ust = bul(a.bagli.ust);
        const ustSecili = ust ? dolu(ust) : false;
        const kilit = h('select', { id, disabled: true }, h('option', { value: '' },
          ust && ustSecili ? `“${altlari(ust.anahtar).map((x) => x.etiket).join('”, “')}” seçeneklerini getirin` : `Önce “${a.bagli.ustEtiket}” seçin`));
        const doldurKilitli = doldurDugmesi({
          projeId: o.projeId, ortamId: o.ortam.id, alan: { id: a.anahtar, etiket: gosterilenEtiket(a), tip: doldurTipi(a.tur), hassas: a.gizli, secenekler: null },
          secildi: (secim) => { durum[a.anahtar] = { deger: secim.deger, kaynak: 'tablo', tabloSecimi: secim.tabloSecimi }; ciz(); zincirGuncelle(); }
        });
        yerlestir(kap, kilit, doldurKilitli);
        return;
      }
      if (d.kaynak === 'tablo') {
        const elle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, 'Elle yaz');
        elle.addEventListener('click', () => { durum[a.anahtar] = { deger: null, kaynak: null }; ciz(); altlariKilitle(a.anahtar); kosulGuncelle(); });
        yerlestir(kap, h('span', { class: 'hizli-tablo-degeri', id }, String(d.deger)), rozet('tablodan'), elle);
        return;
      }
      /** @type {HTMLElement} */
      let girdi;
      const secenekler = Array.isArray(a.secenekler) ? a.secenekler : null;
      // Dosya alanı: kullanıcı dosyayı bilgisayarından seçer ("Dosya seç") ya da Nöbetçi'nin şifreli dosya deposundan ("Depodan seç").
      // Dosya şifreli depoya yazılır, senaryoya başvuru ("nobetci-dosya://…") olarak kaydedilir; hızlı test / doğrulama / normal koşu
      // tarayıcının dosya girdisine yükler. Değer üretilmez.
      if (a.tur === 'file') {
        dosyaAlaniCiz(o, a, kap, id, d, (ref) => { durum[a.anahtar] = ref ? { deger: ref, kaynak: 'dosya' } : { deger: null, kaynak: null }; ciz(); }, m);
        return;
      }
      // Sayfada hazır gelen değer önyazılı gelir (değiştirilebilir); değiştirilmezse sayfadaki değer kullanılır (yeniden yazılmaz).
      const gosterilen = d.deger !== null && d.deger !== undefined ? d.deger : sd;
      if (a.tur === 'checkbox') {
        girdi = h('input', { type: 'checkbox', id, checked: gosterilen === true || gosterilen === 'true' || null });
        girdi.addEventListener('change', () => {
          const c = /** @type {HTMLInputElement} */ (girdi).checked;
          // Sayfaya daha önce uygulanmış seçim sayfadaki değerine dönerse yine uygulanır (sayfada artık başka değer var).
          durum[a.anahtar] = sd === true && c && !oto.uygulananlar.has(a.anahtar) ? { deger: null, kaynak: null } : { deger: c, kaynak: 'elle' };
          kosulGuncelle();
          otoIste(a.anahtar);
        });
      } else if (secenekler) {
        girdi = h('select', { id }, h('option', { value: '' }, 'Seçin'), secenekler.filter((x) => x.deger !== '').map((x) => h('option', { value: x.deger, selected: gosterilen !== null && String(gosterilen) === x.deger || null }, x.metin || x.deger)));
        girdi.addEventListener('change', () => {
          const v = /** @type {HTMLSelectElement} */ (girdi).value || null;
          const g = girilen(a, v);
          durum[a.anahtar] = g.deger === null && v !== null && oto.uygulananlar.has(a.anahtar) ? { deger: v, kaynak: 'elle' } : g;
          altlariKilitle(a.anahtar);
          kosulGuncelle();
          // Seçim anında sayfaya uygulanır (bağlı listenin seçenekleri / koşullu alanlar gelir); boş seçim uygulanmaz.
          if (v !== null) otoIste(a.anahtar);
        });
      } else {
        girdi = h('input', { type: a.gizli ? 'password' : a.tur === 'date' ? 'date' : 'text', id, autocomplete: 'off', value: gosterilen === null || gosterilen === undefined ? '' : String(gosterilen) });
        girdi.addEventListener('input', () => { durum[a.anahtar] = girilen(a, /** @type {HTMLInputElement} */ (girdi).value); uzunlukCiz(); });
        girdi.setAttribute('aria-describedby', `${id}-uzunluk`);
      }
      if (sd !== null) girdi.setAttribute('aria-describedby', [`${id}-hazir`, girdi.getAttribute('aria-describedby')].filter(Boolean).join(' '));
      if (a.zorunlu) girdi.setAttribute('aria-required', 'true');
      const doldur = doldurDugmesi({
        projeId: o.projeId, ortamId: o.ortam.id,
        alan: { id: a.anahtar, etiket: gosterilenEtiket(a), tip: doldurTipi(a.tur), hassas: a.gizli, secenekler: secenekler ? secenekler.map((x) => ({ deger: x.deger, metin: x.metin })) : null },
        secildi: (secim) => { durum[a.anahtar] = { deger: secim.deger, kaynak: 'tablo', tabloSecimi: secim.tabloSecimi }; ciz(); altlariKilitle(a.anahtar); kosulGuncelle(); }
      });
      yerlestir(kap, girdi, doldur);
    };
    cizenler.set(a.anahtar, ciz);
    ciz();
    uzunlukCiz();
    // Anında uygulama göstergesi (seçim alanları): "Sayfaya uygulanıyor…" / satırın hatası.
    const otoDurumu = h('div', { class: 'hizli-oto-durum kucuk', role: 'status' });
    if (['checkbox', 'radio', 'select', 'select-one'].includes(String(a.tur)) || Array.isArray(a.secenekler)) {
      otoCizenler.set(a.anahtar, () => {
        const hata = oto.hata && oto.hata.anahtar === a.anahtar ? oto.hata.mesaj : null;
        const isliyor = otoBekliyor(a.anahtar);
        // Bağlı listenin üstünde gösterge yerinde zincir düğmesinin yerindedir.
        yerlestir(otoDurumu, isliyor && !altlari(a.anahtar).length ? [h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), ' Sayfaya uygulanıyor…'] : hata ? h('span', { class: 'alan-hatasi' }, hata) : null);
        otoDurumu.hidden = !otoDurumu.childNodes.length;
      });
    }
    otoDurumu.hidden = true;
    // Üst liste: alanın hemen yanında yerinde "↓ … seçeneklerini getir" düğmesi (ya da "✓ … seçenekleri geldi").
    const zincirKap = h('div', { class: 'hizli-zincir-getir' });
    if (altlari(a.anahtar).length) zincirCizenler.set(a.anahtar, () => zincirDugmesiCiz(a, zincirKap, id));
    // Doldurma sırası: alanlar sayfadaki sırayla listelenir ve bu sırayla doldurulur; kullanıcı yukarı / aşağı taşıyabilir.
    // Düğme adı genel ("Yukarı taşı"); hangi alan olduğu aria-describedby ile alanın etiketinden okunur (alan etiketiyle karışmaz).
    // Bağlı alt liste üstünün altında durur (kendi sıra düğmesi yok; üstüyle birlikte taşınır).
    // Koşullu alan seçiminin grubunda durur (kendi sıra düğmesi yok; seçimden hemen sonra doldurulur).
    const sira = zincirde(a) || grupSahibi(a) ? null : h('span', { class: 'hizli-sira', role: 'group', 'aria-label': 'Doldurma sırası' },
      h('button', { type: 'button', class: 'kucuk-dugme hayalet hizli-sira-yukari', 'aria-label': 'Yukarı taşı', 'aria-describedby': `${id}-etiket`, title: 'Yukarı taşı (daha önce doldurulur)', onclick: () => tasi(a, -1) }, h('span', { 'aria-hidden': 'true' }, '↑')),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet hizli-sira-asagi', 'aria-label': 'Aşağı taşı', 'aria-describedby': `${id}-etiket`, title: 'Aşağı taşı (daha sonra doldurulur)', onclick: () => tasi(a, 1) }, h('span', { 'aria-hidden': 'true' }, '↓')));
    const derinlik = Math.min(4, zincirDerinligi(a));
    // Etiketi seçime göre değişen alan: adı seçimin şu anki değerine göre (anında değişir); diğer değerlerdeki adı yanında, etiketin DIŞINDA
    // yazılır (alanın erişilebilir adı yalnız şu anki ad kalır).
    const etiketYazi = h('span', { class: 'hizli-alan-adi' }, gosterilenEtiket(a));
    const digerAdlar = h('span', { class: 'hizli-etiket-diger soluk kucuk' });
    if (a.etiketKosulu) {
      const etiketCiz = () => {
        etiketYazi.textContent = gosterilenEtiket(a);
        const d = digerEtiketler(a);
        digerAdlar.textContent = d ? `(${d})` : '';
        digerAdlar.hidden = !d;
      };
      etiketCizenler.set(a.anahtar, () => { etiketCiz(); uzunlukCiz(); });
      etiketCiz();
    } else digerAdlar.hidden = true;
    return h('div', { class: `alan hizli-alan${a.yeni ? ' yeni' : ''}${derinlik ? ` hizli-alan-bagli zd-${derinlik}` : ''}${a.etiketKosulu ? ' hizli-alan-etiketli' : ''}`, 'data-anahtar': a.anahtar },
      h('div', { class: 'hizli-alan-baslik' },
        h('label', { for: id, id: `${id}-etiket`, title: a.teknikAd && !a.etiketBulundu ? `Sayfadaki teknik ad: ${a.teknikAd}` : null },
          etiketYazi, a.zorunlu ? h('span', { class: 'soluk' }, ' (zorunlu)') : null, a.yeni ? ' ' : null, a.yeni ? rozet('yeni alan', 'bilgi') : null),
        digerAdlar,
        // "Sayfada hazır" rozeti etiketin dışında (alanın erişilebilir adı yalnız etiket kalır).
        sd !== null ? h('span', { class: 'hizli-hazir-rozet' }, rozet('sayfada hazır', 'bilgi')) : null,
        sira),
      // Seçim keşfi: koşullu alan, kontrol eden seçimin grubunda durur; seçim bu durakta değilse hangi seçimde göründüğü yazılır.
      a.kosul && !grupSahibi(a) && !zincirde(a) ? h('div', { class: 'hizli-kosul soluk kucuk' }, `${a.kosul.metin} olunca görünür`) : null,
      sd !== null ? h('div', { class: 'hizli-hazir-ipucu soluk kucuk', id: `${id}-hazir` }, 'Sayfada bu değerle geliyor; değiştirmezseniz sayfadaki değer kullanılır.') : null,
      a.bagli ? h('div', { class: 'hizli-kosul soluk kucuk' }, a.bagli.belirsiz
        ? `Seçenekleri “${a.bagli.ustEtiket}” seçimine göre gelebilir (keşifte kesinleşmedi; “${a.bagli.ustEtiket}” seçip yanındaki “↓ … seçeneklerini getir” ile deneyin).`
        : `Seçenekleri “${a.bagli.ustEtiket}” seçimine göre gelir.`) : null,
      kap, otoDurumu, uzunlukIpucu, zincirKap, a.hata ? h('div', { class: 'alan-hatasi', role: 'alert' }, a.hata) : null);
  };
  /** Üstleri bu durakta olan bağlı listenin zincirdeki derinliği (kök 0). */
  const zincirDerinligi = (/** @type {any} */ a) => {
    let n = 0;
    for (let x = a; x && zincirde(x) && n < 10; x = bul(x.bagli.ust)) n++;
    return n;
  };
  /** Yerinde zincir düğmesi: üst seçilmeden pasif; seçilince "↓ … seçeneklerini getir"; gelince "✓ … seçenekleri geldi (n seçenek)". */
  const zincirDugmesiCiz = (/** @type {any} */ a, /** @type {HTMLElement} */ zincirKap, /** @type {string} */ id) => {
    const altlar = altlari(a.anahtar).filter((x) => aktifMi(x));
    // Geçmiş adımın verisi düzenlenirken seçim sayfaya tek başına uygulanmaz (değer "Devam et"te zincir yeniden yürütülerek uygulanır).
    if (!altlar.length || s.gecmis) { zincirKap.replaceChildren(); return; }
    const adlar = `“${altlar.map((x) => x.etiket).join('”, “')}”`;
    if (getiriliyor === a.anahtar) {
      yerlestir(zincirKap, h('button', { type: 'button', class: 'kucuk-dugme hizli-zincir-dugmesi', 'aria-disabled': 'true', 'aria-busy': 'true', 'data-odak-oncelik': '' },
        h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), `${adlar} seçenekleri getiriliyor…`));
      return;
    }
    // Anında uygulama: üst seçilince alt listelerin seçenekleri kendiliğinden getirilir (düğme beklenmez).
    if (otoBekliyor(a.anahtar)) {
      yerlestir(zincirKap, h('span', { class: 'hizli-oto-durum kucuk', role: 'status' }, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), ` Sayfaya uygulanıyor; ${adlar} seçenekleri getiriliyor…`));
      return;
    }
    if (altlar.every(altHazir)) {
      const parca = altlar.map((x) => (durum[x.anahtar] && durum[x.anahtar].kaynak === 'tablo' ? `“${x.etiket}” tablodan`
        : `“${x.etiket}” seçenekleri geldi (${(x.secenekler || []).length} seçenek)`));
      yerlestir(zincirKap, h('span', { class: 'hizli-zincir-tamam' }, h('span', { 'aria-hidden': 'true' }, '✓ '), parca.join(' · ')));
      return;
    }
    const secili = dolu(a);
    const ipucuId = `${id}-zincir-ipucu`;
    const bos = secili && durum[a.anahtar].deger === a.deger && altlar.filter((x) => !altHazir(x)).every((x) => x.bagli.bos);
    const dugme = h('button', {
      type: 'button', class: 'kucuk-dugme hizli-zincir-dugmesi', disabled: !secili || null, 'aria-describedby': secili && !bos ? null : ipucuId
    }, h('span', { 'aria-hidden': 'true' }, '↓ '), `${adlar} seçeneklerini getir`);
    dugme.addEventListener('click', () => {
      otoBirak();
      zincirOdagi = { id: o.id, ust: a.anahtar };
      void gonder(/** @type {HTMLButtonElement} */ (dugme), 'veri', { degerler: degerleriTopla(), sira: siralama, zincir: a.anahtar }, m)
        .then((r) => { if (!r) zincirOdagi = null; });
    });
    yerlestir(zincirKap, dugme,
      !secili ? h('span', { class: 'soluk kucuk', id: ipucuId }, `Önce “${a.etiket}” seçin`)
        : bos ? h('span', { class: 'hizli-zincir-bos kucuk', id: ipucuId }, `Bu seçimde ${adlar} için seçenek gelmedi; başka bir “${a.etiket}” seçin.`) : null);
  };
  // Sayfada hazır gelen alanlar (bugünün tarihi gibi varsayılanlar gözden kaçmasın) ANA listede, sayfadaki sırasıyla, değeri önyazılı ve
  // "sayfada hazır" rozetiyle durur; değiştirilmezse sayfadaki değer kullanılır. Hazır gelen üst listenin bağlı altı henüz gelmediyse üst
  // "girilmiş" sayılmaz (yerinde düğmesi için seçilmeli).
  // "Önce bunu seçin": görünürlüğü belirleyen (koşullu alanları açan / kapatan), sayfada önseçili seçimler (radyo, hazır liste / onay
  // kutusu) en üstte TÜM seçenekleriyle sorulur; sayfadaki değer önseçilidir. Bu seçimin koşullu alanları kutusunun İÇİNDE, altında gruplu
  // durur ve seçim değişince anında değişir; yerinde "↓ Bu seçime göre alanları getir" seçimi sayfaya uygular.
  const kontrolMu = (/** @type {any} */ a) => Boolean(a.kontrol) && !a.kosul && !a.bagli && !altlari(a.anahtar).length && (a.hazir || a.tur === 'radio');
  const kontroller = s.alanlar.filter(kontrolMu);
  /**
   * İç içe kontrol: kendisi bir üst seçimin değerinde beliren (koşullu) ve başka alanların görünürlüğünü / adını belirleyen seçim. Üst
   * seçimin değer grubunun İÇİNDE kendi "Önce bunu seçin" satırıyla durur; alanları onun altında gruplu.
   * @param {any} a
   */
  const icIceKontrolMu = (a) => Boolean(a.kontrol) && Boolean(a.kosul) && !a.bagli && !altlari(a.anahtar).length
    && ['radio', 'select', 'select-one', 'checkbox'].includes(String(a.tur)) && Boolean(bul(a.kosul.secim));
  // İç içe kontrollerin değeri liste kurulmadan önce bilinir (alt alanların görünürlüğü ilk çizimde doğru olsun).
  for (const a of s.alanlar) if (icIceKontrolMu(a)) durum[a.anahtar] = ilkDurum(a);
  const hazirlar = s.alanlar.filter((a) => a.hazir && a.deger === null && !kontrolMu(a));
  const acilan = new Set(hazirlar.filter((a) => altlari(a.anahtar).some((x) => kilitli.has(x.anahtar))).map((a) => a.anahtar));
  /** @type {Map<string, HTMLElement>} */
  const satirlari = new Map();
  const satir = (/** @type {any} */ a) => { if (!satirlari.has(a.anahtar)) satirlari.set(a.anahtar, satirYap(a)); return /** @type {HTMLElement} */ (satirlari.get(a.anahtar)); };
  const satirlarKap = h('div', { class: 'hizli-alanlar' });
  // Doldurma sırası (anahtarlar): başlangıçta sayfadaki sıra; "Devam et"te sunucuya gider, motor bu sırayla doldurur.
  const siralama = s.alanlar.map((a) => a.anahtar);
  /** Sıralı alanlar; bağlı alt liste üstünün hemen altında (zincir birlikte durur, üst her zaman altından önce). */
  const alanlarSirali = () => {
    const sirali = siralama.map((k) => bul(k)).filter(Boolean);
    /** @type {any[]} */
    const l = [];
    const ekle = (/** @type {any} */ a) => {
      if (l.includes(a)) return;
      l.push(a);
      for (const x of sirali.filter((y) => zincirde(y) && y.bagli.ust === a.anahtar)) ekle(x);
    };
    for (const a of sirali) if (!zincirde(a)) ekle(a);
    for (const a of sirali) ekle(a);
    return l;
  };
  /** Koşullu alan şu an geçerli mi (seçimin değeri: yazılan, yoksa sayfanın ilk değeri; tablodan gelen değer bilinmez → geçerli). */
  const aktifMi = (/** @type {any} */ a, gorulen = new Set()) => {
    if (!a.kosul || gorulen.has(a.anahtar)) return true;
    gorulen.add(a.anahtar);
    const kontrol = s.alanlar.find((x) => x.anahtar === a.kosul.secim);
    if (kontrol && !aktifMi(kontrol, gorulen)) return false;
    const d = durum[a.kosul.secim];
    if (d && d.kaynak === 'tablo') return true;
    // Değer girilmediyse seçimin sayfadaki (uygulanmış) değeri, o da bilinmiyorsa keşifteki ilk değeri.
    const sayfada = kontrol && kontrol.sayfadaki !== null && kontrol.sayfadaki !== undefined ? kontrol.sayfadaki : a.kosul.ilk;
    const simdi = d && d.deger !== null && d.deger !== undefined && d.deger !== '' ? d.deger : sayfada;
    if (simdi === null || simdi === undefined) return true;
    return a.kosul.degerler.includes(String(simdi));
  };
  const sorulanlar = () => alanlarSirali().filter((a) => !kontroller.includes(a) && aktifMi(a));
  /**
   * Koşullu alanın grubu: görünürlüğünü belirleyen seçimin anahtarı (bağlı listede zincir kökünün koşulu); seçim bu durakta değilse null
   * (alan ana listede, "… olunca görünür" notuyla durur).
   * @param {any} a @returns {string | null}
   */
  function grupSahibi(a) {
    let x = a;
    for (let n = 0; x && zincirde(x) && n < 10; n++) x = bul(x.bagli.ust);
    // Etiketi seçime göre değişen alan da o seçimin grubunda (adı ve girilecek verinin anlamı seçime bağlı). İç içe: alanın adını
    // belirleyen seçim alanla aynı bölümdeyse (ikisi de aynı üst seçimin değerinde beliriyor) alan o seçimin grubundadır.
    const ek = x && x.etiketKosulu ? bul(x.etiketKosulu.secim) : null;
    const ayniBolum = Boolean(ek && x.kosul && ek.kosul && ek.kosul.secim === x.kosul.secim);
    const k = ayniBolum ? ek.anahtar : x && x.kosul ? x.kosul.secim : x && x.etiketKosulu ? x.etiketKosulu.secim : null;
    return k && k !== a.anahtar && bul(k) ? k : null;
  }
  /** Seçimin şu anki değerinin görünen metni ("Müşteri tipi: Kurumsal"). @param {any} k */
  const secimMetni = (k) => {
    const d = durum[k.anahtar];
    if (d && d.kaynak === 'tablo') return `${k.etiket}: tablodan`;
    const hd = hazirDegeri(k);
    let v = d && d.deger !== null && d.deger !== undefined && d.deger !== '' ? d.deger : (k.sayfadaki ?? hd ?? k.ilk ?? null);
    if (v === null) { const u = s.alanlar.find((/** @type {any} */ x) => x.kosul && x.kosul.secim === k.anahtar); v = u ? u.kosul.ilk : null; }
    if (v === null || v === undefined) return k.etiket;
    if (k.tur === 'checkbox') return `${k.etiket}: ${String(v) === 'true' ? 'işaretli' : 'işaretsiz'}`;
    const x = (k.secenekler || []).find((/** @type {any} */ y) => String(y.deger) === String(v));
    return `${k.etiket}: ${x ? x.metin || x.deger : String(v)}`;
  };
  /** @type {Map<string, { kap: HTMLElement; baslik: HTMLElement; liste: HTMLElement }>} */
  const gruplar = new Map();
  /** Seçimin koşullu alan grubu (yoksa kurulur); başlığı seçimin şu anki değerini söyler. @param {string} sahip @param {any[]} uyeler */
  const grupKutusu = (sahip, uyeler) => {
    let g = gruplar.get(sahip);
    if (!g) {
      const baslik = h('p', { class: 'hizli-kosul-grubu-baslik kucuk' });
      const liste = h('div', { class: 'hizli-alanlar' });
      // Bu seçimde sorulmayan (gizlenen) alanlar ya da hiçbir şey değişmiyorsa açık metin: grup hiç boş görünmez.
      const not = h('p', { class: 'hizli-kosul-grubu-notu soluk kucuk' });
      g = { kap: h('div', { class: 'hizli-kosul-grubu', role: 'group' }, baslik, not, liste), baslik, liste, not };
      gruplar.set(sahip, g);
    }
    yerlestir(g.liste, ...uyeler.flatMap((x) => satirVeGrubu(x, uyelerOf(x.anahtar))));
    g.liste.hidden = !uyeler.length;
    grupBasligi(sahip);
    return g.kap;
  };
  /** @param {string} sahip */
  const grupBasligi = (sahip) => {
    const g = gruplar.get(sahip);
    const k = bul(sahip);
    if (!g || !k) return;
    const m = `“${secimMetni(k)}” seçimine göre`;
    // (Grubun adı görünen başlığıdır; aria-label verilmez: alanların erişilebilir adlarıyla karışmasın.)
    g.baslik.textContent = `${m}:`;
    // Bu değerde değişenler: açılan / adı değişen alanlar grubun listesinde; gizlenenler burada (“Bu seçimde “Doğum tarihi” sorulmaz.”).
    const v = secimDegeri(k);
    const gizlenen = v === null ? [] : s.alanlar.filter((x) => x.kosul && x.kosul.secim === sahip && !x.kosul.degerler.includes(v));
    const uyeVar = uyelerOf(sahip).length > 0;
    g.not.textContent = gizlenen.length ? `Bu seçimde ${gizlenen.map((x) => `“${gosterilenEtiket(x)}”`).join(', ')} sorulmaz.`
      : uyeVar ? '' : 'Bu seçimde ek ya da farklı alan yok; aynı alanlar sorulur.';
    g.not.hidden = !g.not.textContent;
  };
  /** O an sorulan alanlardan bu seçimin grubundakiler (sayfa sırasıyla). @param {string} sahip */
  let sorulanOnbellek = /** @type {any[]} */ ([]);
  const uyelerOf = (/** @type {string} */ sahip) => sorulanOnbellek.filter((x) => grupSahibi(x) === sahip);
  /** Satır + (varsa) altında koşullu alan grubu. @param {any} a @param {any[]} uyeler */
  // (Görünürlüğü / adları belirleyen seçimin grubu, o değerde açılan alan olmasa da gösterilir: gizlenenleri ya da "değişiklik yok"u yazar.)
  // İç içe kontrol kendi "Önce bunu seçin" satırıyla (grubu satırın içinde) durur.
  const satirVeGrubu = (a, uyeler) => (icIceKontrolMu(a) ? [icIceSatiri(a)] : uyeler.length || a.kontrol ? [satir(a), grupKutusu(a.anahtar, uyeler)] : [satir(a)]);
  /** İç içe kontrolün satırı (bir kez kurulur; yeniden listelemede seçimi korunur). @type {Map<string, HTMLElement>} */
  const icIceSatirlari = new Map();
  /** @param {any} a */
  const icIceSatiri = (a) => {
    if (!icIceSatirlari.has(a.anahtar)) icIceSatirlari.set(a.anahtar, kontrolSatiri(a, true));
    return /** @type {HTMLElement} */ (icIceSatirlari.get(a.anahtar));
  };
  /** "Önce bunu seçin" satırlarının grup kapları (seçimin kutusunun içinde, altında). @type {Map<string, HTMLElement>} */
  const kontrolGrupKaplari = new Map();
  /** Seçimin sayfadaki (uygulanmış) değeri. @param {any} a */
  const sayfadakiDeger = (a) => (a.sayfadaki ?? a.ilk ?? null);
  /** Seçimin şu anki değeri: girilen, yoksa sayfadaki. @param {any} a @returns {string | null} */
  const kontrolDegeri = (a) => {
    const d = durum[a.anahtar];
    const v = d && d.deger !== null && d.deger !== undefined && d.deger !== '' ? d.deger : sayfadakiDeger(a);
    return v === null || v === undefined ? null : String(v);
  };
  /**
   * Seçim sayfada mı (iç içe kontrol ancak üst seçimin değeri sayfaya uygulanmışken sayfadadır): üst seçimlerin şu anki değeri sayfadaki
   * değeriyle aynı mı. @param {any} a @returns {boolean}
   */
  const ustSayfada = (a, gorulen = new Set()) => {
    if (!a.kosul || gorulen.has(a.anahtar)) return true;
    gorulen.add(a.anahtar);
    const u = bul(a.kosul.secim);
    if (!u) return true;
    const sd = sayfadakiDeger(u);
    return kontrolDegeri(u) === (sd === null || sd === undefined ? null : String(sd)) && ustSayfada(u, gorulen);
  };
  /**
   * "Önce bunu seçin" satırı: tüm seçenekler; seçim değişince kısa gecikmeyle sayfaya ANINDA uygulanır (düğme beklenmez) ve satırda
   * "Sayfaya uygulanıyor…" görünür; hata olursa satırda yazılır ("Yeniden uygula"). ic: iç içe kontrol (üst seçimin grubunun içinde).
   * @param {any} a @param {boolean} [ic]
   */
  const kontrolSatiri = (a, ic = false) => {
    durum[a.anahtar] = ilkDurum(a);
    const id = `hizli-onsecim-${Math.random().toString(36).slice(2, 9)}`;
    const dugmeKap = h('div', { class: 'hizli-zincir-getir hizli-onsecim-durum', role: 'status' });
    const sec = (/** @type {string | boolean} */ v) => { durum[a.anahtar] = { deger: v, kaynak: 'elle' }; kosulGuncelle(); otoIste(a.anahtar); };
    /** @type {HTMLElement} */
    let girdi;
    if (a.tur === 'radio') {
      girdi = h('fieldset', { class: 'hizli-onsecim-secenekler', id }, h('legend', {}, a.etiket),
        (a.secenekler || []).map((/** @type {any} */ x) => {
          const r = h('input', { type: 'radio', name: `${id}-ad`, value: x.deger, checked: kontrolDegeri(a) === String(x.deger) || null });
          r.addEventListener('change', () => { if (/** @type {HTMLInputElement} */ (r).checked) sec(x.deger); });
          return h('label', { class: 'onay-satiri' }, r, ' ', x.metin || x.deger);
        }));
    } else if (a.tur === 'checkbox') {
      const c = h('input', { type: 'checkbox', id, checked: kontrolDegeri(a) === 'true' || null });
      c.addEventListener('change', () => sec(/** @type {HTMLInputElement} */ (c).checked));
      girdi = h('label', { class: 'onay-satiri', for: id }, c, ' ', a.etiket);
    } else {
      const l = h('select', { id }, (a.secenekler || []).filter((/** @type {any} */ x) => x.deger !== '')
        .map((/** @type {any} */ x) => h('option', { value: x.deger, selected: kontrolDegeri(a) === String(x.deger) || null }, x.metin || x.deger)));
      l.addEventListener('change', () => sec(/** @type {HTMLSelectElement} */ (l).value));
      girdi = h('div', {}, h('label', { for: id }, a.etiket), l);
    }
    const metni = (/** @type {string | null} */ v) => (a.tur === 'checkbox' ? (v === 'true' ? 'işaretli' : 'işaretsiz')
      : ((a.secenekler || []).find((/** @type {any} */ x) => String(x.deger) === v) || { metin: v }).metin);
    const dugmeCiz = () => {
      if (getiriliyor === a.anahtar || otoBekliyor(a.anahtar)) {
        yerlestir(dugmeKap, h('span', { class: 'hizli-oto-durum' }, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), ' Sayfaya uygulanıyor; bu seçimin alanları getiriliyor…'));
        return;
      }
      if (s.gecmis) { yerlestir(dugmeKap); return; }
      const v = kontrolDegeri(a);
      const sd = sayfadakiDeger(a);
      const sayfada = ustSayfada(a) && sd !== null && sd !== undefined ? String(sd) : null;
      const hata = oto.hata && oto.hata.anahtar === a.anahtar ? oto.hata.mesaj : null;
      if (hata || (v !== null && v !== sayfada && !oto.suruyor && !oto.kuyruk.length)) {
        // Uygulanamadı (ya da henüz uygulanmadı): yeniden dene.
        const dugme = h('button', { type: 'button', class: 'kucuk-dugme hizli-zincir-dugmesi hizli-onsecim-dugmesi' }, h('span', { 'aria-hidden': 'true' }, '↻ '), 'Sayfaya uygula');
        dugme.addEventListener('click', () => { otoIste(a.anahtar, true); });
        yerlestir(dugmeKap, hata ? h('span', { class: 'alan-hatasi' }, hata) : null, dugme,
          !hata && sayfada !== null ? h('span', { class: 'soluk kucuk' }, ` Sayfada şu an: “${metni(sayfada)}”.`) : null);
        return;
      }
      yerlestir(dugmeKap, sayfada === null ? null : h('span', { class: 'hizli-zincir-tamam' }, h('span', { 'aria-hidden': 'true' }, '✓ '), `Sayfada “${metni(sayfada)}” seçili; alanlar bu seçime göre soruluyor.`));
    };
    otoCizenler.set(a.anahtar, dugmeCiz);
    dugmeCiz();
    const grupKap = h('div', { class: 'hizli-onsecim-grubu' });
    kontrolGrupKaplari.set(a.anahtar, grupKap);
    return h('div', { class: `hizli-onsecim-alani${ic ? ' hizli-onsecim-ic' : ''}`, 'data-anahtar': a.anahtar },
      ic ? h('p', { class: 'hizli-onsecim-ic-baslik kucuk' }, 'Önce bunu seçin') : null, girdi, dugmeKap,
      a.hata ? h('div', { class: 'alan-hatasi', role: 'alert' }, a.hata) : null, grupKap);
  };
  const kontrolKap = kontroller.length ? h('section', { class: 'hizli-onsecim', 'aria-labelledby': 'hizli-onsecim-baslik' },
    h('h4', { id: 'hizli-onsecim-baslik' }, 'Önce bunu seçin'),
    h('p', { class: 'soluk kucuk' }, 'Bu seçim hangi alanların sorulacağını belirler. Sayfadaki seçim önseçilidir; değiştirdiğinizde hemen sayfaya uygulanır ve o seçimin alanları sorulur.'),
    kontroller.map((a) => kontrolSatiri(a))) : null;
  // Seçim değişince koşullu alanlar açılır / kapanır (görünen küme değişmediyse liste yeniden çizilmez: odak kaybolmaz).
  let gorunenImza = '';
  const kosulGuncelle = () => {
    const imza = sorulanlar().map((a) => a.anahtar).join('|');
    if (imza !== gorunenImza) listeyiCiz();
    else zincirGuncelle();
  };
  const tasi = (/** @type {any} */ a, /** @type {number} */ yon) => {
    // Taşıma kökler arasında: bağlı alt listeler üstleriyle birlikte yer değiştirir.
    const gorunen = sorulanlar().filter((x) => !zincirde(x) && !grupSahibi(x));
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
  // Zincir göstergesi (kartın üstünde): "Bağlı alanlar: İl → İlçe → Mahalle (1/3 tamam)".
  const gosterge = h('div', { class: 'hizli-zincir-gostergesi' });
  /** Getirilmemiş bağlı alanlar (zincir tamamlanmadı). */
  // (Belirsiz bağın alt listesi "Devam et"i kilitlemez: bağ keşifte kesinleşmedi, seçenek hiç gelmeyebilir.)
  const getirilmemis = () => sorulanlar().filter((a) => zincirde(a) && !altHazir(a) && !a.bagli.belirsiz);
  const devam = h('button', { type: 'button', class: 'birincil' }, 'Devam et', ikon('ok'));
  const devamIpucu = h('span', { class: 'soluk kucuk', id: `hizli-devam-ipucu-${Math.random().toString(36).slice(2, 9)}` });
  const atla = h('button', { type: 'button', class: 'baglanti-dugmesi hizli-zincir-atla' }, 'Bağlı alanları atla ve devam et');
  const zincirGuncelle = () => {
    const gorunen = sorulanlar();
    for (const a of gorunen) { const c = zincirCizenler.get(a.anahtar); if (c) c(); }
    // Kökler: altı olan, kendisi bu durakta bir zincirin altı olmayan listeler.
    const kokler = gorunen.filter((a) => !zincirde(a) && altlari(a.anahtar).some((x) => aktifMi(x)));
    yerlestir(gosterge, ...kokler.map((k) => {
      /** @type {any[]} */
      const yol = [];
      const yuru = (/** @type {any} */ a) => { yol.push(a); for (const x of altlari(a.anahtar).filter((y) => aktifMi(y))) yuru(x); };
      yuru(k);
      const tamam = yol.filter((a) => dolu(a) && altlari(a.anahtar).filter((x) => aktifMi(x)).every(altHazir)).length;
      return h('p', { class: 'kucuk' }, h('b', {}, 'Bağlı alanlar: '), yol.map((a) => a.etiket).join(' → '), ` (${tamam}/${yol.length} tamam)`);
    }));
    gosterge.hidden = !kokler.length;
    // "Devam et": zincirde getirilmemiş alan varsa pasif ve ne olacağını söyler; "Bağlı alanları atla" ikincil yol.
    // Anında uygulanan seçim sürüyorken "Devam et" bekler (sayfa o seçimi uyguluyor; yanıtla form güncellenir).
    const uygulaniyor = Boolean(oto.suruyor);
    const eksikler = uygulaniyor ? [] : getirilmemis();
    const kapali = Boolean(getiriliyor) || uygulaniyor || eksikler.length > 0;
    devam.disabled = kapali;
    yerlestir(devam, eksikler.length ? 'Devam et (önce bağlı alanları tamamlayın)' : 'Devam et', ikon('ok'));
    devamIpucu.textContent = uygulaniyor ? 'Seçim sayfaya uygulanıyor; bitince devam edebilirsiniz.'
      : eksikler.length ? `Seçenekleri getirilmemiş: ${eksikler.map((a) => `“${a.etiket}”`).join(', ')}. Üst listeyi seçin (seçenekler kendiliğinden gelir) ya da yanındaki “↓ … seçeneklerini getir” düğmesine basın.` : '';
    devamIpucu.hidden = !devamIpucu.textContent;
    if (devamIpucu.textContent) devam.setAttribute('aria-describedby', devamIpucu.id); else devam.removeAttribute('aria-describedby');
    atla.hidden = !eksikler.length;
    atla.disabled = Boolean(getiriliyor);
    // Etiketi seçime göre değişen alanların adları; koşullu alan gruplarının başlıkları ve notları seçimin şu anki değerine göre.
    for (const c of etiketCizenler.values()) c();
    for (const k of gruplar.keys()) grupBasligi(k);
  };
  const listeyiCiz = () => {
    const sorulan = sorulanlar();
    gorunenImza = sorulan.map((a) => a.anahtar).join('|');
    sorulanOnbellek = sorulan;
    // Ana liste: kökler (sayfa sırasıyla); koşullu alanlar kontrol eden seçimin altında gruplu (seçim "Önce bunu seçin"deyse onun kutusunda).
    const gosterilen = (/** @type {string} */ k) => sorulan.some((x) => x.anahtar === k) || kontroller.some((x) => x.anahtar === k);
    const anaListe = sorulan.filter((a) => { const g = grupSahibi(a); return !g || !gosterilen(g); });
    yerlestir(satirlarKap, ...(anaListe.length ? anaListe.flatMap((a) => satirVeGrubu(a, uyelerOf(a.anahtar)))
      : [h('p', { class: 'soluk' }, sorulan.length ? 'Bu seçimin alanları yukarıda, seçimin altında.' : 'Sayfada sizden doldurmanızı isteyeceğim alan yok. Devam edebilirsiniz.')]));
    // "Önce bunu seçin" satırlarının grupları (iç içe olanlar üst grubun içinde kurulur; kurulanlar da sırayla doldurulur).
    for (const [k, kap] of kontrolGrupKaplari) yerlestir(kap, grupKutusu(k, uyelerOf(k)));
    const kokler = sorulan.filter((a) => !zincirde(a) && !grupSahibi(a));
    kokler.forEach((a, i) => {
      const d = satir(a).querySelectorAll('.hizli-sira button');
      if (d.length < 2) return;
      /** @type {HTMLButtonElement} */ (d[0]).disabled = i === 0;
      /** @type {HTMLButtonElement} */ (d[1]).disabled = i === kokler.length - 1;
    });
    zincirGuncelle();
  };
  /** Ekrandaki değerler (sunucuya gidecek biçimde). */
  const degerleriTopla = () => Object.fromEntries(Object.entries(durum).map(([k, d]) => [k, d.deger === null || d.deger === '' ? null
    : { deger: d.deger, kaynak: d.kaynak || 'elle', ...(d.tabloSecimi ? { tabloSecimi: d.tabloSecimi } : {}) }]));
  /** "Devam et" / "Bağlı alanları atla": zorunlu boş alan yoksa veri gönderilir. @param {HTMLButtonElement} dugme @param {boolean} zinciriAtla */
  const ilerle = (dugme, zinciriAtla) => {
    // Bekleyen anında uygulama gerekmez: "Devam et" tüm değerleri gönderir ve sayfaya uygular.
    otoBirak();
    const degerler = degerleriTopla();
    const eksik = s.alanlar.filter((a) => a.zorunlu && !a.hazir && a.tur !== 'file' && !degerler[a.anahtar] && aktifMi(a) && !kilitli.has(a.anahtar)).map((a) => a.etiket);
    if (eksik.length) { m.goster(`Zorunlu alanlar boş: ${eksik.join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`); return; }
    void gonder(dugme, 'veri', { degerler, sira: siralama, ...(zinciriAtla ? { zinciriAtla: true } : {}) }, m);
  };
  /** Göstergeler (seçimin satırı, zincir düğmeleri, Devam). */
  const otoGostergeleriCiz = () => { for (const c of otoCizenler.values()) c(); zincirGuncelle(); };
  /** Bekleyen anında uygulamayı bırakır (Devam / getir düğmesi tüm değerleri kendisi gönderir). */
  function otoBirak() {
    if (oto.zamanlayici) clearTimeout(oto.zamanlayici);
    oto.zamanlayici = null;
    oto.kuyruk = [];
    oto.taslak = {};
  }
  /**
   * Seçim değişti: kısa gecikmeyle sayfaya uygulanır (hızlı ardışık değişiklikte gecikme yeniden başlar; aynı seçim kuyrukta bir kez,
   * son değeriyle). hemen: gecikmesiz ("Sayfaya uygula" düğmesi). @param {string} anahtar @param {boolean} [hemen]
   */
  function otoIste(anahtar, hemen = false) {
    if (s.gecmis) return;
    oto.kuyruk = [...oto.kuyruk.filter((k) => k !== anahtar), anahtar];
    if (oto.hata && oto.hata.anahtar === anahtar) oto.hata = null;
    if (oto.zamanlayici) clearTimeout(oto.zamanlayici);
    oto.zamanlayici = setTimeout(() => { oto.zamanlayici = null; if (oto.gonder) oto.gonder(); }, hemen ? 0 : OTO_GECIKME_MS);
    otoGostergeleriCiz();
  }
  /** Bir seçimin üst seçimleri (koşul zinciri ve bağlı liste üstleri): sunucu onları da birlikte uygular. @param {string} k @returns {string[]} */
  const otoUstleri = (k) => {
    /** @type {string[]} */
    const l = [];
    for (let a = bul(k), n = 0; a && n < 10; n++) {
      const u = a.kosul ? a.kosul.secim : a.bagli ? a.bagli.ust : null;
      if (!u || l.includes(u)) break;
      l.push(u);
      a = bul(u);
    }
    return l;
  };
  // Gönderici: kuyruğun sonundaki (en son değişen) seçim sayfaya uygulanır; üstleri sunucuda birlikte uygulandığı için kuyruktan düşer.
  // Yanıt gelene kadar kart yeniden çizilmez (otoSuruyor); gelince yeniden çizilir ve kuyrukta kalan varsa sıradaki uygulanır.
  oto.gonder = () => {
    if (oto.suruyor) return;
    while (oto.kuyruk.length) {
      const anahtar = /** @type {string} */ (oto.kuyruk.pop());
      const a = bul(anahtar);
      const d = durum[anahtar];
      if (!a || !d || d.deger === null || d.deger === undefined || d.deger === '' || d.kaynak === 'tablo' || !aktifMi(a)) continue;
      const ustler = otoUstleri(anahtar);
      oto.kuyruk = oto.kuyruk.filter((k) => !ustler.includes(k));
      oto.suruyor = anahtar;
      oto.taslak = {};
      oto.hata = null;
      oto.uygulananlar.add(anahtar);
      for (const u of ustler) oto.uygulananlar.add(u);
      const govde = { id: o.id, degerler: degerleriTopla(), sira: siralama, ...(altlari(anahtar).some((x) => aktifMi(x)) ? { zincir: anahtar } : { kosulSecimi: anahtar }) };
      otoGostergeleriCiz();
      api('/platform/hizli-test/veri', { govde }).then(() => { degisiklikleriBirak(); y.hemen(); }).catch((e) => {
        oto.suruyor = null;
        if (!(e && e.durum === 423)) oto.hata = { anahtar, mesaj: hataMetni(e) };
        otoGostergeleriCiz();
      });
      return;
    }
    otoGostergeleriCiz();
  };
  devam.addEventListener('click', () => ilerle(devam, false));
  atla.addEventListener('click', () => ilerle(atla, true));
  listeyiCiz();
  kuruluyor = false;
  // Yerinde zincir isteği sürerken girdiler kapalıdır (sunucu sayfayı dolduruyor; sonuç gelince kart yeniden çizilir).
  // (Getiriliyor düğmesi odakta kalabilsin diye kapatılmaz; aria-disabled taşır ve tıklaması yoktur.)
  if (getiriliyor) for (const kap of [satirlarKap, kontrolKap]) for (const el of kap ? kap.querySelectorAll('select, input, button:not([aria-busy])') : []) /** @type {HTMLButtonElement} */ (el).disabled = true;
  // "Önce bunu seçin" isteğinden sonra: odak bu seçimin ilk alanına; canlı durum satırında hangi alanların geldiği duyurulur.
  if (!getiriliyor && zincirOdagi && zincirOdagi.id === o.id && zincirOdagi.kosul) {
    const kontrol = bul(zincirOdagi.ust);
    zincirOdagi = null;
    const gelen = sorulanlar().filter((x) => kontrol && ((x.kosul && x.kosul.secim === kontrol.anahtar) || (x.etiketKosulu && x.etiketKosulu.secim === kontrol.anahtar)));
    const ilk = gelen.length ? satir(gelen[0]).querySelector('select, input') : null;
    if (ilk) ilk.setAttribute('data-odak-oncelik', '');
    // Duyuru: sunucunun değişiklik özeti (açılan / gizlenen / adı değişen alanlar); yoksa gelen alanlar.
    bekleyenDuyuru = s.not ? String(s.not) : kontrol ? (gelen.length ? `“${kontrol.etiket}” seçiminin alanları geldi: ${gelen.map((x) => gosterilenEtiket(x)).join(', ')}.` : `“${kontrol.etiket}” seçiminde ek ya da farklı alan yok; aynı alanlar sorulur.`) : '';
  }
  // Yerinde zincir isteğinden sonra: odak ilk yeni alana; canlı durum satırında "“İlçe” seçenekleri geldi" duyurusu.
  if (!getiriliyor && zincirOdagi && zincirOdagi.id === o.id) {
    const ust = bul(zincirOdagi.ust);
    zincirOdagi = null;
    const altlar = ust ? altlari(ust.anahtar).filter((x) => aktifMi(x)) : [];
    const gelen = altlar.filter((x) => !kilitli.has(x.anahtar) && Array.isArray(x.secenekler) && x.secenekler.length);
    const ilk = gelen.length ? satir(gelen[0]).querySelector('select, input') : null;
    if (ilk) ilk.setAttribute('data-odak-oncelik', '');
    else if (ust) { const u = satir(ust).querySelector('select, input'); if (u) u.setAttribute('data-odak-oncelik', ''); }
    bekleyenDuyuru = gelen.length ? gelen.map((x) => `“${x.etiket}” seçenekleri geldi (${x.secenekler.length} seçenek).`).join(' ')
      : altlar.length ? `${altlar.map((x) => `“${x.etiket}”`).join(', ')} için seçenek gelmedi.` : '';
  }
  const zorunluSayisi = s.alanlar.filter((a) => a.zorunlu && !a.hazir && a.tur !== 'file' && (a.deger === null || a.deger === '') && !kilitli.has(a.anahtar)).length;
  return kart(s.gecmis ? `Adım ${s.adim}: veriyi düzenle` : o.adimlar.length > 1 ? `Adım ${s.adim}: veri gerekli` : 'Devam etmek için veri gerekli', 'veri',
    s.not ? h('div', { class: 'not-kutusu bilgi', role: 'note' }, s.not) : null,
    // Keşfin notları (ör. seçimlerin sayfada tek tek denendiği) ilk veri durağında gösterilir.
    o.adimlar.length === 1 && o.kesif && Array.isArray(o.kesif.notlar) && o.kesif.notlar.length
      ? h('ul', { class: 'soluk kucuk hizli-kesif-notlari' }, o.kesif.notlar.map((x) => h('li', {}, x))) : null,
    h('p', { class: 'soluk' }, 'Sayfadaki alanlar sayfadaki sırasıyla aşağıda; adları sayfadaki gibi yazıldı. Değeri yazın ya da “Doldur” ile test verisi tablosundan seçin; hiçbir değer uydurulmaz. Sayfada hazır gelen değerler önyazılı ve “sayfada hazır” işaretli: değiştirmezseniz sayfadaki değer kullanılır. Doldurduğunuzda akış kaldığı yerden sürer.'),
    kontrolKap, gosterge, m.kutu, satirlarKap, kesifAlanlariBolumu(s), saltOkunurBolumu(s, false),
    h('div', { class: 'dugmeler' }, devam, atla, zorunluSayisi ? h('span', { class: 'soluk' }, `${zorunluSayisi} zorunlu alan eksik`) : null),
    devamIpucu);
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
        // Seçili etikete yeniden tıklamak etiketi kaldırır (kullanıcı kararı); "Etiketsiz" de aynı işi görür.
        onclick: () => { etiketler[g.metin] = secili === deger ? null : deger; ciz(); olumsuzGuncelle(); uyariGuncelle(); }
      }, ad)));
    };
    ciz();
    return h('li', { class: 'hizli-bitis-satiri', 'data-sira': String(i) }, h('span', { class: 'hizli-cip' }, g.metin),
      g.kaynak === 'elle' ? rozet('elle yazıldı') : g.kaynak === 'secim' ? rozet('sayfada seçildi') : null, grup,
      // Sahte başarıyı önleme: basıştan önce de görünen metin bitiş olamaz (hiçbir koşuda sonucu göstermez).
      g.onceGorundu ? h('small', { class: 'blok soluk hizli-once-gorundu' }, 'Bu metin düğmeye basmadan da görünüyordu.') : null);
  });
  // Bitti öğeleri: seçicisi görünür olunca bitti (açılan pencere / kutu / düğme). İşaretli olanlar bitiş koşuluna girer.
  const ogeSecili = new Set((s.ogeler || []).filter((x) => x.secili).map((x) => x.secici));
  /** Arayüzün o anki seçimleri (sunucuya giden her bitiş isteğine eklenir; yeniden çizimde kaybolmaz). */
  const secimler = () => ({ etiketler, ogeler: [...ogeSecili] });
  const ogeSatirlari = (s.ogeler || []).map((x, i) => {
    const k = h('input', { type: 'checkbox', id: `hizli-bitis-oge-${i}`, checked: ogeSecili.has(x.secici) || null });
    k.addEventListener('change', () => { if (/** @type {HTMLInputElement} */ (k).checked) ogeSecili.add(x.secici); else ogeSecili.delete(x.secici); gecerlilikGuncelle(); });
    const cikar = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Çıkar: ${x.metin || x.secici}` }, 'Çıkar');
    cikar.addEventListener('click', () => void gonder(cikar, 'bitis-ekle', { ...secimler(), oge: x.secici, sil: true }, m));
    return h('li', { class: 'hizli-bitis-oge' },
      h('label', { class: 'onay-satiri', for: k.id }, k, h('span', {}, 'Bitti: ', h('b', {}, `“${x.metin || x.secici}”`), x.kaynak === 'pencere' ? ' penceresi görününce' : ' öğesi görününce')),
      h('code', { class: 'kucuk soluk' }, x.secici), cikar);
  });
  // Listede olmayan bitiş: tarayıcıda seç (metin ya da öğe), elle metin yaz, açılan pencere önerisi.
  const sayfadaSec = h('button', { type: 'button', class: 'hayalet', id: 'hizli-bitis-sayfada-sec' }, 'Sayfada seç…');
  sayfadaSec.title = 'Hızlı test tarayıcısında bir yazıya tıklayın (tıklama sayfaya iletilmez); yazı “Bitti” olarak eklenir.';
  sayfadaSec.addEventListener('click', () => void gonder(sayfadaSec, 'bitis-sec', { ...secimler(), tur: 'metin' }, m));
  const ogeSec = h('button', { type: 'button', class: 'hayalet', id: 'hizli-bitis-oge-sec' }, 'Şu öğe görününce bitti…');
  ogeSec.title = 'Hızlı test tarayıcısında bir öğeye (pencere, kutu, düğme) tıklayın; o öğe görününce test biter (metin seçmeden).';
  ogeSec.addEventListener('click', () => void gonder(ogeSec, 'bitis-sec', { ...secimler(), tur: 'oge' }, m));
  const pencereOnerisi = s.pencereOnerisi
    ? h('button', { type: 'button', class: 'birincil', id: 'hizli-bitis-pencere' }, `Açılan pencere görününce bitti${s.pencereOnerisi.metin ? `: “${s.pencereOnerisi.metin}”` : ''}`)
    : null;
  if (pencereOnerisi) pencereOnerisi.addEventListener('click', () => void gonder(pencereOnerisi, 'bitis-ekle', { ...secimler(), pencere: true }, m));
  const elleMetin = h('input', { type: 'text', id: 'hizli-bitis-metin', maxlength: 200, placeholder: 'Görününce testin bittiği yazı' });
  const elleEkle = h('button', { type: 'button', class: 'kucuk-dugme', id: 'hizli-bitis-metin-ekle' }, 'Ekle');
  const elleKutusu = h('div', { class: 'alan hizli-bitis-elle', hidden: true },
    h('label', { for: 'hizli-bitis-metin' }, 'Metin yaz ', h('span', { class: 'soluk' }, '(“Bitti” olarak eklenir; doğrulama koşusu sayfada arar)')),
    h('div', { class: 'dugmeler' }, elleMetin, elleEkle));
  const metinYaz = h('button', { type: 'button', class: 'hayalet', id: 'hizli-bitis-metin-yaz', 'aria-expanded': 'false' }, 'Metin yaz…');
  metinYaz.addEventListener('click', () => {
    elleKutusu.hidden = !elleKutusu.hidden;
    metinYaz.setAttribute('aria-expanded', String(!elleKutusu.hidden));
    if (!elleKutusu.hidden) /** @type {HTMLInputElement} */ (elleMetin).focus();
  });
  const elleGonder = () => {
    const t = /** @type {HTMLInputElement} */ (elleMetin).value.trim();
    if (!t) { m.goster('Eklenecek metni yazın.'); return; }
    void gonder(elleEkle, 'bitis-ekle', { ...secimler(), metin: t, etiket: 'bitti' }, m);
  };
  elleEkle.addEventListener('click', elleGonder);
  elleMetin.addEventListener('keydown', (e) => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') { e.preventDefault(); elleGonder(); } });
  // Uyarılar (engellemez): hiçbir basışta gönderim olmadıysa ve basıştan önce de görünen metin "Bitti" seçildiyse (sunucudaki kuralın aynısı).
  const uyariKutusu = h('div', { class: 'not-kutusu uyari hizli-bitis-uyarisi', role: 'status' });
  function uyariGuncelle() {
    const l = [];
    if (!s.gonderimVar) l.push('Hiçbir basışta sunucuya kayıt / gönderim isteği gitmedi ve sayfa başka bir sayfaya geçmedi: “Bitti” seçtiğiniz metin gerçek bir sonucu göstermeyebilir (ör. sekme, anahtar ya da liste yazısı). Formu gönderen düğmeye basıldığından emin olun.');
    for (const g of s.gorulenler) if (g.onceGorundu && etiketler[g.metin] === 'bitti') l.push(`“${g.metin}”: Bu metin düğmeye basmadan da görünüyordu; bitiş için basıştan sonra beliren bir sonuç metni seçin.`);
    yerlestir(uyariKutusu, ...l.map((x) => h('p', {}, x)));
    uyariKutusu.hidden = !l.length;
  }
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
    const gecerli = Object.values(etiketler).includes('bitti') || ogeSecili.size > 0 || Boolean(adres.value.trim()) || (olumsuz.checked && Boolean(olumsuzMesaj.value));
    devam.disabled = !gecerli;
    eksikNotu.textContent = gecerli ? '' : 'En az bir metni “Bitti” etiketleyin (ya da “Adres şu olursa bitti”yi yazın).';
  }
  olumsuz.addEventListener('change', olumsuzGuncelle);
  olumsuzMesaj.addEventListener('change', gecerlilikGuncelle);
  adres.addEventListener('input', gecerlilikGuncelle);
  olumsuzGuncelle();
  uyariGuncelle();
  devam.addEventListener('click', () => void gonder(devam, 'bitis', {
    ...secimler(), adres: adres.value.trim() || null, olumsuz: olumsuz.checked && olumsuzMesaj.value ? { mesaj: olumsuzMesaj.value } : null
  }, m));
  const tara = h('button', { type: 'button', class: 'hayalet' }, 'Sayfayı yeniden tara');
  tara.title = 'Tarayıcıda şu an görünen yeni mesajları (ör. sonradan çıkan hata / başarı) listeye ekler; verdiğiniz etiketler korunur.';
  tara.addEventListener('click', () => void gonder(tara, 'yeniden-tara', secimler(), m));
  // Geri dönüş: zincire devam (etiketler saklanır; yeniden "Burada bitir" denince korunur).
  const zincireDon = h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Adım adım’a dön: zincire devam et');
  zincireDon.addEventListener('click', () => void gonder(zincireDon, 'geri', { hedef: 'karar' }, m));
  return kart('Bitiş koşulu: ne görülünce biter?', 'hedef',
    h('p', {}, 'Akış boyunca görülen metinler. Her birine bir etiket verin:'),
    uyariKutusu,
    h('ul', { class: 'hizli-bitis', 'aria-label': 'Görülen metinler' }, satirlar),
    ogeSatirlari.length ? h('ul', { class: 'hizli-bitis hizli-bitis-ogeleri', 'aria-label': 'Bitiş öğeleri' }, ogeSatirlari) : null,
    h('div', { class: 'dugmeler hizli-bitis-ekle' }, pencereOnerisi, sayfadaSec, ogeSec, metinYaz),
    elleKutusu,
    h('p', { class: 'soluk kucuk' }, 'Test çalışırken: “Devam” metinleri görüldükçe test beklemeye devam eder (en çok 60 sn). “Bitti” metni ya da öğesi görülünce başarılı biter. “Hata” görülünce başarısız biter ve mesaj rapora yazılır. Hiçbiri görünmezse süre dolunca başarısız: “Bitiş mesajı görülmedi.”'),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-bitis-adres' }, 'Adres şu olursa bitti ', h('span', { class: 'soluk' }, '(isteğe bağlı)')), adres),
    olumsuzKutusu, saltOkunurBolumu(s, true),
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
    oz.bitis ? h('li', {}, oz.olumsuz ? `Beklenen uyarı: “${oz.olumsuz.mesaj}”` : `Bitti: ${[...oz.bitis.bitti.map((x) => `“${x}”`),
      ...(oz.bitis.ogeler || []).map((x) => `“${x.metin || x.secici}” öğesi görünür`), ...(oz.bitis.adres ? [`adres ${oz.bitis.adres}`] : [])].join(' veya ')}`,
      oz.bitis.hata.length && !oz.olumsuz ? ` · Hata: ${oz.bitis.hata.map((x) => `“${x}”`).join(', ')}` : null,
      oz.bitis.devam.length ? ` · Devam: ${oz.bitis.devam.map((x) => `“${x}”`).join(', ')}` : null) : null);
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet — özeti göster');
  const ozetAdresi = `#/hizli-test/ozet/${encodeURIComponent(o.id)}`;
  // Ön denetimin (özet yanıtındaki "sorunlar") maddeleri: "Düzelt" ilgili durağa döner; tablo sorunu özetin tablo kartında düzeltilir.
  const sorunAlani = h('div', { class: 'hizli-sorun-alani' });
  /** @param {Array<any>} sorunlar */
  const sorunlariGoster = (sorunlar) => yerlestir(sorunAlani, sorunKutusu(sorunlar, (hedef, dugme) => {
    if (hedef === 'tablo') { window.open(ozetAdresi, '_blank'); return; }
    void gonder(dugme, 'geri', { hedef }, m);
  }, ['bitis', 'karar', 'tablo']), h('p', { class: 'kucuk' }, h('a', { href: ozetAdresi, target: '_blank' }, 'Özeti yine de aç'), ' (sorunlar giderilmeden kayıt onaylanamaz).'));
  kaydet.addEventListener('click', async () => {
    // Seçimler oturuma yazılır (özet sekmesi okur; veritabanına hiçbir şey yazılmaz), sonra özet YENİ SEKMEDE açılır: uzun tablo listesi
    // bu sayfanın altına dizilmez. Tarayıcı yeni sekmeyi engellerse bağlantı gösterilir.
    try {
      const yanit = await mesgulIken(kaydet, 'Özet hazırlanıyor…', () => api('/platform/hizli-test/ozet', {
        govde: { id: o.id, baslik: baslikGirdi.value.trim(), kosuyaDahil: dahil.checked, tabloOlustur: tabloOlustur.checked }
      }));
      degisiklikleriBirak();
      const sorunlar = yanit && yanit.ozet && Array.isArray(yanit.ozet.sorunlar) ? yanit.ozet.sorunlar : [];
      if (sorunlar.length) { m.temizle(); sorunlariGoster(sorunlar); return; }
      sorunAlani.replaceChildren();
      const sekme = window.open(ozetAdresi, '_blank');
      if (!sekme) {
        m.goster('Tarayıcı yeni sekmeyi engelledi.', 'uyari');
        m.kutu.replaceChildren('Tarayıcı yeni sekmeyi engelledi: ', h('a', { href: ozetAdresi, target: '_blank' }, 'özeti yeni sekmede açın'), '.');
      } else bildir('Özet yeni sekmede açıldı; kaydı oradan onaylayın.', 'basari');
    } catch (e) {
      if (e && e.durum === 423) return;
      const sorunlar = hataSorunlari(e);
      if (sorunlar) { m.temizle(); sorunlariGoster(sorunlar); } else m.goster(hataMetni(e));
    }
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
    Array.isArray(s.uyarilar) && s.uyarilar.length ? h('div', { class: 'not-kutusu uyari', role: 'note' }, s.uyarilar.map((x) => h('p', {}, x))) : null,
    // Aynı adlı tablo: özet sekmesinde varsayılan "Birleştir" (yeni satır) seçili gelir; kullanıcı açıkça değiştirebilir.
    s.tabloKarariGerekebilir ? h('p', { class: 'kucuk soluk hizli-tablo-karari-notu' }, 'Projede aynı adlı test verisi tablosu varsa (bu ekranın ya da başka bir ekranın) özet sekmesinde her tablo için “Birleştir / Yeni adla yaz / Atla” seçimi gösterilir; varsayılan “Birleştir”dir: değerleriniz yeni satır olarak eklenir, mevcut satırlar değişmez ve senaryo kendi satırını kullanır. Tablo yazmak istemiyorsanız aşağıdaki “test verisi tablosu olarak kaydet” seçeneğini kaldırın.') : null,
    h('ul', { class: 'hizli-ozet kucuk' },
      h('li', {}, h('b', {}, 'Ekrana: '), 'alanlar, koşullar, düğme zinciri, bitiş ve hata mesajları'),
      h('li', {}, h('b', {}, 'Senaryoya: '), `girilen değerler, tablo bağlantıları, izin (${oz.izin}), bitiş koşulu`)),
    h('div', { class: 'alan' }, h('label', { for: 'hizli-senaryo-basligi' }, 'Senaryonun adı'), baslikGirdi),
    h('label', { class: 'onay-satiri', for: 'hizli-kosuya-dahil' }, dahil, 'Toplu koşuya dahil'),
    h('label', { class: 'onay-satiri', for: 'hizli-tablo-olustur' }, tabloOlustur, 'Girdiğim değerleri test verisi tablosu olarak kaydet ve ekranın test verisine bağla'),
    dogrulamaKutusu, farklar, sorunAlani, m.kutu,
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

/** Öneri, değeri olmayan alan açan ("veri gerekli") bir dal mı? @param {any} x */
const veriGerekliMi = (x) => Array.isArray(x.veriGerekli) && x.veriGerekli.length > 0;

/**
 * Kayıt özeti — KENDİ SEKMESİNDE (#/hizli-test/ozet/<oturumId>): tablolar / birleştirme kararı / bağlantılar / senaryo önerileri; onaylamadan
 * hiçbir şey yazılmaz. Kaydet sekmesindeki seçimler (senaryo adı, toplu koşu, tablo) oturumdan okunur.
 * @param {HTMLElement} govde @param {string} id @param {string | null} [yenilemeNotu] özet bir kayıt hatasından sonra yenilendiyse gösterilen not
 */
async function ozetEkrani(govde, id, yenilemeNotu = null) {
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
  // Ön denetim sorunları (sunucu: özet.sorunlar; kaydet hatasında hatalar[]): varken "Onayla" pasif, maddeler "Düzelt" yönlendirmesiyle.
  /** @type {Array<any>} */
  let sorunlar = Array.isArray(oz.sorunlar) ? oz.sorunlar : [];
  const sorunAlani = h('div', { class: 'hizli-sorun-alani' });
  /** "Düzelt": bitiş / adım adım → sunucuda geri dönülür ve hızlı test sayfası açılır; tablo → tablo kartı. @param {'bitis' | 'karar' | 'tablo'} hedef @param {HTMLButtonElement} dugme */
  const duzelt = async (hedef, dugme) => {
    if (hedef === 'tablo') {
      tv.bolum.scrollIntoView({ block: 'start' });
      const ilk = tv.bolum.querySelector('input, select, button');
      if (ilk instanceof HTMLElement) ilk.focus();
      return;
    }
    let r;
    try { r = await mesgulIken(dugme, 'Açılıyor…', () => yenidenYurutmeOnayli((onay) => api('/platform/hizli-test/geri', { govde: { id, hedef, ...(onay ? { onay: true } : {}) } }))); } catch (e) { if (!(e && e.durum === 423)) m.goster(hataMetni(e)); return; }
    if (r === null) return;
    degisiklikleriBirak();
    location.hash = oturumAdresi;
  };
  const sorunlariCiz = () => {
    if (sorunlar.length) yerlestir(sorunAlani, sorunKutusu(sorunlar, (hedef, dugme) => void duzelt(hedef, dugme), tercih.tabloOlustur ? ['bitis', 'karar', 'tablo'] : ['bitis', 'karar']));
    else sorunAlani.replaceChildren();
  };
  // Aynı adlı tabloda varsayılan: yeni satır olarak birleştir (senaryo eklenen kendi satırına satır kimliğiyle sabitlenir); karar açıkça değiştirilebilir.
  const tv = testVerisiSecimi(tercih.tabloOlustur ? oz.onizleme : null, () => guncelle(), { kompakt: true, varsayilanBirlestir: true });
  const oneriler = oz.senaryolar.filter((x) => x.indeks > 0);
  const secili = new Set(oneriler.filter((x) => x.varsayilanSecili).map((x) => x.indeks));
  const onayla = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), oz.farklar ? 'Farkları onayla ve kaydet' : 'Onayla ve kaydet');
  const neden = h('p', { class: 'kucuk soluk', role: 'status' });
  /** Kayıt başka sekmede onaylandı (görünür olunca durum sorulur): Onayla kapalı kalır. */
  let baskaSekmedeKaydedildi = false;
  const guncelle = () => {
    const bekleyen = tv.bekleyenler();
    onayla.disabled = baskaSekmedeKaydedildi || sorunlar.length > 0 || !tv.hazir();
    // Karar bekleyen tablo varsa her neden ilgili tablo kartına "Göster" bağlantısıyla.
    if (!sorunlar.length && bekleyen.length) {
      neden.replaceChildren(...bekleyen.flatMap((x, i) => {
        const goster = x.satir ? h('button', { type: 'button', class: 'baglanti-dugmesi' }, 'Göster') : null;
        if (goster) goster.addEventListener('click', () => { x.satir.scrollIntoView({ block: 'center' }); const o = x.odak && x.odak(); if (o) o.focus(); });
        return [i ? ' · ' : '', x.metin, goster ? ' ' : '', goster];
      }));
    } else {
      const bekleyenSayisi = oneriler.filter((x) => veriGerekliMi(x) && secili.has(x.indeks)).length;
      neden.textContent = sorunlar.length ? 'Kayıt onaylanamaz: önce yukarıdaki sorunları düzeltin.'
        : `Yazılacak: ${tv.ozet() ?? 'test verisi yazılmaz'}; ${1 + secili.size} senaryo${bekleyenSayisi ? ` (${bekleyenSayisi} veri bekliyor, koşu dışı)` : ''}`;
    }
  };
  const baslikSatiri = h('b', {}, baslik);
  const senaryoListesi = h('ul', { class: 'hizli-oneriler' },
    h('li', {}, h('label', {}, h('input', { type: 'checkbox', checked: true, disabled: true, 'aria-label': 'Yaptığınız senaryo' }), ' ', baslikSatiri, h('span', { class: 'kucuk soluk' }, String(baslik).toLocaleLowerCase('tr').includes('hızlı test') ? ' — yaptığınız akış' : ' — hızlı testte yaptığınız akış'))),
    oneriler.map((x) => {
      // Veri gerektiren dal: değer üretilmez, sorulmaz. Seçilirse senaryo "veri bekliyor" olarak koşu dışı kaydedilir (tablo satırında
      // hücreler boş); değerler sonra Test verisi'nde doldurulur, koşuya dahil etmeyi kullanıcı yapar.
      const veriGerekli = veriGerekliMi(x);
      const k = h('input', { type: 'checkbox', checked: secili.has(x.indeks), 'aria-label': `${x.baslik} senaryosunu ekle` });
      const not = veriGerekli ? h('p', { class: 'kucuk hizli-veri-bekliyor-notu', hidden: !k.checked },
        `“Veri bekliyor” olarak koşu dışı kaydedilir: ${x.veriGerekli.join(', ')} için değer sorulmaz ve üretilmez; tablo satırında boş kalır. Değerleri sonra Test verisi'nde doldurup senaryo ekranından koşuya dahil edersiniz.`) : null;
      k.addEventListener('change', () => { if (k.checked) secili.add(x.indeks); else secili.delete(x.indeks); if (not) not.hidden = !k.checked; guncelle(); });
      return h('li', { class: veriGerekli ? 'hizli-oneri-veri-gerekli' : '' }, h('label', {}, k, ' ', h('b', {}, x.baslik), h('span', { class: 'kucuk soluk' }, ` — ${x.gerekce}`)),
        veriGerekli ? rozet(`veri gerekli: ${x.veriGerekli.join(', ')}`, 'uyari', { title: 'Bu dalın alanlarına değer üretilmez. Seçerseniz senaryo “veri bekliyor” olarak koşu dışı kaydedilir; değerleri Test verisi\'nde doldurursunuz.' }) : null,
        not);
    }));
  /** Seçilmeyen veri gerektiren dallar (kayıttan sonra "yeni hızlı test" yolu gösterilir). */
  const veriGerekenDallar = () => oneriler.filter((x) => veriGerekliMi(x) && !secili.has(x.indeks));
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
    } catch (e) {
      if (e && e.durum === 423) return;
      // Test verisi tabloları özet açıldıktan sonra değişti (ör. başka bir kayıt aynı adlı tabloyu yazdı): özet yenilenir, kart güncel
      // seçenekleri (Birleştir / Yeni adla yaz / Atla) gösterir.
      if (e && e.kod === 'TABLO' && /zaten var|artık uygun değil/.test(hataMetni(e))) {
        void ozetEkrani(govde, id, `${hataMetni(e)} Özet yenilendi: tablo kararlarını gözden geçirip yeniden onaylayın.`);
        return;
      }
      const hs = hataSorunlari(e);
      if (hs) { sorunlar = hs; m.temizle(); sorunlariCiz(); guncelle(); sorunAlani.scrollIntoView({ block: 'nearest' }); } else m.goster(hataMetni(e));
      return;
    }
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
      const bekleyenler = (Array.isArray(r.ekSenaryolar) ? r.ekSenaryolar : []).filter((x) => Array.isArray(x.veriBekliyor) && x.veriBekliyor.length);
      const kalanDallar = veriGerekenDallar();
      yerlestir(govde, h('section', { class: 'kart hizli-soru' },
        h('div', { class: 'kart-basligi' }, h('h3', { tabindex: '-1', 'data-odak': '' }, ikon('onay'), 'Test kaydedildi'),
          h('span', { class: 'sag' }, rozet(r.dogrulandi ? 'Doğrulandı' : 'Doğrulanmadı', r.dogrulandi ? 'basari' : 'uyari'))),
        h('p', {}, `Ekran “${oz.ekran.ad}” ve senaryo “${r.senaryoBasligi || baslik}” kaydedildi. Bu sekmeyi kapatabilirsiniz.`),
        bekleyenler.length ? h('div', { class: 'not-kutusu uyari hizli-veri-bekliyor-sonucu', role: 'note' },
          h('p', {}, h('b', {}, `${bekleyenler.length} senaryo “veri bekliyor” olarak koşu dışı kaydedildi. `),
            'Değeri olmayan alanlar test verisi satırında boş; senaryo ekranındaki “Değerleri doldur” ile doldurun, sonra koşuya dahil edin.'),
          h('ul', {}, bekleyenler.map((x) => h('li', {}, h('a', { href: `#/senaryolar/duzenle/${encodeURIComponent(String(x.id))}` }, x.baslik), ` — veri bekliyor: ${x.veriBekliyor.join(', ')}`)))) : null,
        kalanDallar.length ? h('div', { class: 'not-kutusu bilgi', role: 'note' },
          `Seçmediğiniz veri gerektiren dallar kaydedilmedi (${kalanDallar.map((x) => x.gerekce.split(' — ')[0]).join('; ')}). O dalı denemek için `,
          h('a', { href: `#/hizli-test/duzenle/${encodeURIComponent(String(r.ekranId))}` }, 'bu ekranla yeni hızlı test başlatın'), ' ve dalın alanlarına değer girin.') : null,
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
    yenilemeNotu ? h('div', { class: 'not-kutusu uyari', role: 'alert' }, yenilemeNotu) : null,
    sorunAlani,
    tercih.tabloOlustur ? tv.bolum : h('p', { class: 'kucuk soluk' }, 'Test verisi tablosu oluşturulmaz: değerler senaryoda düz değer olarak kalır.'),
    h('div', { class: 'ara-baslik' }, `Senaryolar (${1 + oneriler.length} öneri)`), senaryoListesi,
    m.kutu, neden, h('div', { class: 'dugmeler' }, onayla, h('a', { class: 'dugme hayalet', href: oturumAdresi }, 'Hızlı teste dön'))));
  sorunlariCiz();
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
