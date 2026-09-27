// EKRAN REHBERLERİ — her ekranı ve o ekrandaki işlerin sırasını adım adım anlatır (bkz. rehber-icerikleri.js).
//   - Ekran ilk açıldığında otomatik başlar (Ayarlar > Arayüz > "Rehberleri ilk girişte göster"; kullanıcı kararı). Bir
//     rehber bitince ya da kapatılınca "görüldü" olur (kasada; bkz. scripts/platform/ayarlar/rehber-ayarlari.mjs).
//   - Üst çubuktaki "?" düğmesi o anki ekranın rehberini istediğiniz zaman yeniden başlatır.
//   - Kart her zaman ekranın ortasında açılır; adımın hedefi (CSS seçici) sayfada varsa ayrıca vurgulanır.
//   - Klavye: → / Enter ileri, ← geri, Esc kapat; odak kartın içinde kalır, kapanınca eski yerine döner.
//   - Otomatik sürülen tarayıcıda (navigator.webdriver; ör. Playwright testleri) kendiliğinden açılmaz — testler "?" ile ya da
//     localStorage 'nobetci-rehber-otomatik' = '1' ile açar.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yerlestir } from './ortak.js';
import { REHBERLER } from './rehber-icerikleri.js';

/** Hash'ten ekranın rehber anahtarı (rehber yoksa null). @param {string} hash */
export function rehberAnahtari(hash) {
  const [, bolum = 'sonuclar', alt = '', , dorduncu = ''] = String(hash || '#/sonuclar').split('/');
  const parca = alt ? decodeURIComponent(alt) : '';
  let anahtar = null;
  if (bolum === 'sonuclar' || !bolum) anahtar = parca === 'kosu' ? 'sonuclar-kosu' : parca === 'sonuc' ? 'sonuclar-sonuc' : parca === 'karsilastir' ? 'sonuclar-karsilastir' : 'sonuclar';
  else if (bolum === 'senaryolar') anahtar = parca === 'yeni' || parca === 'duzenle' ? 'senaryo-formu' : 'senaryolar';
  else if (bolum === 'servisler') {
    const sekme = String(hash).split('/')[4] || '';
    anahtar = parca === 'yeni' ? 'servis-ekle' : parca === 'sonuclar' ? (String(hash).split('/')[3] === 'karsilastir' ? 'sonuclar-karsilastir' : 'servis-sonuclari') : parca === 's' ? (sekme === 'akislar' ? 'servis-akislari' : 'servis') : 'servisler';
  } else if (bolum === 'ekranlar') {
    if (parca === 'yeni') anahtar = 'ekran-ekle';
    else if (parca === 'tarama') anahtar = 'tarama';
    else if (parca === 'e') anahtar = dorduncu === 'akis' ? 'akis-tasarimi' : dorduncu === 'bulgular' ? 'bulgular' : dorduncu === 'yukle' ? 'ekran-ekle' : 'ekran';
    else anahtar = 'ekranlar';
  } else if (bolum === 'ayarlar') anahtar = `ayarlar-${parca || 'proje'}`;
  return anahtar && REHBERLER[anahtar] ? anahtar : null;
}

let ayarSozu = null;
/** Rehber ayarları (oturum boyunca önbellekte; kaydedilince güncellenir). */
function ayarlar() {
  ayarSozu ??= api('/platform/rehber').then((y) => y.rehber).catch(() => ({ otomatik: false, gorulenler: [] }));
  return ayarSozu;
}
/** Ayarlar ekranı tercihi değiştirdiğinde önbelleği tazeler. @param {{ otomatik: boolean; gorulenler: string[] }} yeni */
export function rehberAyarlariniGuncelle(yeni) { ayarSozu = Promise.resolve(yeni); }

async function gorulduIsaretle(anahtar) {
  // Önbellek hemen güncellenir: sunucu yanıtı gelmeden ekran değişirse aynı rehber yeniden açılmasın.
  const onceki = ayarSozu ?? ayarlar();
  ayarSozu = onceki.then((a) => (a.gorulenler.includes(anahtar) ? a : { ...a, gorulenler: [...a.gorulenler, anahtar] }));
  try {
    const y = await api('/platform/rehber/kaydet', { govde: { gorulen: anahtar } });
    rehberAyarlariniGuncelle(y.rehber);
  } catch { /* kasa kilitlenmiş olabilir: bir dahaki girişte yine gösterilir */ }
}

/** Otomatik sürülen tarayıcıda yalnızca açıkça istenirse (testler). */
function otomatikIzinli() {
  if (!navigator.webdriver) return true;
  try { return localStorage.getItem('nobetci-rehber-otomatik') === '1'; } catch { return false; }
}

let acik = null;
let bekleyen = null;

/**
 * Ekranın rehberini ilk girişte (tercih açıksa ve daha önce görülmediyse) başlatır. Ekran çizilirken çağrılır; hedefler
 * yüklenene kadar kısa süre beklenir. @param {string | null} anahtar
 */
export async function rehberOtomatikDene(anahtar) {
  clearTimeout(bekleyen);
  if (!anahtar || acik || !otomatikIzinli()) return;
  const a = await ayarlar();
  if (!a.otomatik) return;
  // İlk girişte önce genel tanıtım, sonra ekranın rehberi.
  if (!a.gorulenler.includes('genel')) anahtar = 'genel';
  else if (a.gorulenler.includes(anahtar)) return;
  bekleyen = setTimeout(() => {
    // Ekran bu arada değiştiyse ya da bir diyalog açıksa başlatılmaz.
    if ((anahtar !== 'genel' && rehberAnahtari(location.hash) !== anahtar) || document.querySelector('dialog[open]') || acik) return;
    rehberBaslat(anahtar);
  }, 700);
}

/** Üst çubuktaki "?" düğmesi: o anki ekranın rehberini başlatır. */
export function rehberDugmesi() {
  const d = h('button', { type: 'button', class: 'ikon-dugme rehber-dugmesi', title: 'Bu ekranın rehberi', 'aria-label': 'Bu ekranın rehberini aç' }, ikon('soru'));
  d.addEventListener('click', () => {
    const anahtar = rehberAnahtari(location.hash);
    rehberBaslat(anahtar || 'genel');
  });
  return d;
}

/**
 * Rehberi başlatır (açık bir rehber varsa önce kapanır).
 * @param {string} anahtar REHBERLER anahtarı
 */
export function rehberBaslat(anahtar) {
  const rehber = REHBERLER[anahtar];
  if (!rehber) return;
  if (acik) acik.kapat(false);
  clearTimeout(bekleyen);
  const onceOdak = /** @type {HTMLElement | null} */ (document.activeElement);
  let sira = 0;
  const perde = h('div', { class: 'rehber-perde', 'aria-hidden': 'true' });
  const vurgu = h('div', { class: 'rehber-vurgu', 'aria-hidden': 'true' });
  const baslikId = `rehber-baslik-${Date.now()}`;
  const kart = h('div', { class: 'rehber-karti', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': baslikId, tabindex: '-1' });
  const kok = h('div', { class: 'rehber-kok' }, perde, vurgu, kart);
  document.body.append(kok);

  const hedefBul = (adim) => {
    if (!adim.hedef) return null;
    const secenekler = Array.isArray(adim.hedef) ? adim.hedef : [adim.hedef];
    for (const secici of secenekler) {
      const el = document.querySelector(secici);
      if (el && el.getClientRects().length) return el;
    }
    return null;
  };

  // Kart HER ZAMAN ekranın ortasında açılır (masaüstü ve telefon); adımın hedefi varsa yalnızca vurgulanır (kart hedefin yanına
  // taşınmaz — kenara / üste yapışık kart olmaz).
  const yerlestirKart = () => {
    const adim = rehber.adimlar[sira];
    const el = hedefBul(adim);
    kart.classList.add('ortada');
    kart.classList.toggle('hedefli', !!el);
    if (!el) { vurgu.hidden = true; return; }
    const r = el.getBoundingClientRect();
    const bosluk = 6;
    vurgu.hidden = false;
    Object.assign(vurgu.style, { top: `${r.top - bosluk}px`, left: `${r.left - bosluk}px`, width: `${r.width + bosluk * 2}px`, height: `${r.height + bosluk * 2}px` });
  };

  let yon = 1;
  const ciz = () => {
    const adim = rehber.adimlar[sira];
    const sonAdim = sira === rehber.adimlar.length - 1;
    const geri = h('button', { type: 'button', class: 'hayalet', disabled: sira === 0, onclick: () => git(-1) }, ikon('geri'), 'Geri');
    const ileri = h('button', { type: 'button', class: 'birincil', onclick: () => (sonAdim ? kapat(true) : git(1)) }, sonAdim ? 'Bitti' : 'İleri', sonAdim ? ikon('onay') : ikon('ok'));
    const kapatDugmesi = h('button', { type: 'button', class: 'ikon-dugme hayalet rehber-kapat', 'aria-label': 'Rehberi kapat', title: 'Kapat (Esc)', onclick: () => kapat(true) }, ikon('carpi'));
    const metinler = (Array.isArray(adim.metin) ? adim.metin : [adim.metin]).filter(Boolean);
    const sahne = adim.cizim ? cizim(adim.cizim) : null;
    // İlerleme: her adım bir parça; tıklayınca o adıma gider.
    const ilerleme = h('div', { class: 'rehber-ilerleme', role: 'group', 'aria-label': 'Adımlar' },
      rehber.adimlar.map((a, i) => h('button', {
        type: 'button', class: `rehber-parca${i === sira ? ' aktif' : i < sira ? ' gecti' : ''}`, title: a.baslik,
        'aria-label': `Adım ${i + 1}: ${a.baslik}`, 'aria-current': i === sira ? 'step' : null,
        onclick: () => { if (i !== sira) { yon = i > sira ? 1 : -1; sira = i; ciz(); } }
      })));
    const icerik = h('div', { class: 'rehber-icerik' },
      h('h2', { id: baslikId }, adim.baslik),
      ...metinler.map((x) => h('p', {}, x)),
      adim.sira ? h('ol', { class: 'rehber-sira' }, adim.sira.map((x, i) => h('li', { style: { '--i': i } }, h('span', { class: 'rehber-sira-no', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, x)))) : null,
      adim.ipucu ? h('p', { class: 'rehber-ipucu' }, ikon('simsek'), adim.ipucu) : null);
    kart.classList.toggle('sahneli', !!sahne);
    yerlestir(kart,
      h('div', { class: 'rehber-ust' },
        h('span', { class: 'rehber-etiket' }, ikon('pusula'), rehber.baslik),
        h('span', { class: 'rehber-sayac' }, `${sira + 1} / ${rehber.adimlar.length}`), kapatDugmesi),
      ilerleme,
      h('div', { class: `rehber-govde ${yon > 0 ? 'ileri' : 'geri'}` }, sahne ? h('div', { class: 'rehber-sahne' }, sahne) : null, icerik),
      h('div', { class: 'dugmeler' }, geri, ileri));
    const el = hedefBul(adim);
    if (el) el.scrollIntoView({ block: 'center' });
    requestAnimationFrame(yerlestirKart);
    ileri.focus();
  };

  const git = (adim) => { yon = adim; sira = Math.min(Math.max(0, sira + adim), rehber.adimlar.length - 1); ciz(); };

  const tus = (o) => {
    if (o.key === 'Escape') { o.preventDefault(); kapat(true); return; }
    if (o.key === 'ArrowRight' && !o.altKey) { o.preventDefault(); if (sira < rehber.adimlar.length - 1) git(1); return; }
    if (o.key === 'ArrowLeft' && !o.altKey) { o.preventDefault(); if (sira > 0) git(-1); return; }
    if (o.key === 'Tab') {
      // Odak kartın içinde kalır.
      const odaklanabilir = [...kart.querySelectorAll('button:not([disabled])')];
      if (!odaklanabilir.length) return;
      const ilk = odaklanabilir[0];
      const sonEl = odaklanabilir[odaklanabilir.length - 1];
      if (o.shiftKey && document.activeElement === ilk) { o.preventDefault(); sonEl.focus(); } else if (!o.shiftKey && document.activeElement === sonEl) { o.preventDefault(); ilk.focus(); }
    }
  };
  const yeniden = () => requestAnimationFrame(yerlestirKart);
  document.addEventListener('keydown', tus, true);
  window.addEventListener('resize', yeniden);
  window.addEventListener('scroll', yeniden, true);
  const ekranDegisti = () => kapat(false);
  window.addEventListener('hashchange', ekranDegisti);

  function kapat(goruldu) {
    document.removeEventListener('keydown', tus, true);
    window.removeEventListener('resize', yeniden);
    window.removeEventListener('scroll', yeniden, true);
    window.removeEventListener('hashchange', ekranDegisti);
    kok.remove();
    if (acik && acik.kok === kok) acik = null;
    if (goruldu) gorulduIsaretle(anahtar);
    if (onceOdak && onceOdak.isConnected) onceOdak.focus();
  }
  acik = { kok, kapat };
  ciz();
}

/**
 * ANLATIM ÇİZİMLERİ (örnek veri kurulmaz; kullanıcı kararı "yalnız anlatım"). Hepsi CSS ile canlandırılır; "hareketi azalt"
 * tercihinde durağan gösterilir. Türler:
 *   akis   { kutular: [{ baslik, alt?, ikon? }] }        kutular tek satırda, sırayla yanar; oklarda ilerleyen nokta
 *   maket  { bolge, etiket? }                              küçük uygulama maketi: imleç vurgulu bölgeye gider ve tıklar
 *          bolge: 'menu' | 'sol' | 'eylem' | 'arac' | 'tablo' | 'kartlar' | 'grafik' | 'form' | 'soru' | 'proje'
 *   form   { alanlar: string[], dugme }                    alanlar sırayla dolar, sonra düğmeye basılır
 *   istek  { sol, sag, gidis, donus, kontroller? }        istek gider, yanıt döner, kontroller tek tek onaylanır
 *   katman { katmanlar: [{ baslik, alt? }] }               iç içe katmanlar (ör. kasa → proje → ortam)
 * @param {Record<string, any>} c
 */
function cizim(c) {
  if (c.tur === 'akis') return akisCizimi(c);
  if (c.tur === 'maket') return maketCizimi(c);
  if (c.tur === 'form') return formCizimi(c);
  if (c.tur === 'istek') return istekCizimi(c);
  if (c.tur === 'katman') return katmanCizimi(c);
  return null;
}

/** @param {Record<string, any>} c */
function akisCizimi(c) {
  const ogeler = [];
  c.kutular.forEach((k, i) => {
    if (i) ogeler.push(h('span', { class: 'rehber-ok', style: { '--i': i }, 'aria-hidden': 'true' }, h('span', { class: 'rehber-ok-nokta' })));
    ogeler.push(h('span', { class: 'rehber-kutu', style: { '--i': i } },
      h('span', { class: 'rehber-kutu-ikon' }, ikon(k.ikon || 'hedef')), h('b', {}, k.baslik), k.alt ? h('small', {}, k.alt) : null));
  });
  return h('div', { class: `rehber-cizim rehber-akis${c.kutular.length >= 4 ? ' genis' : ''}`, style: { '--n': c.kutular.length }, role: 'img', 'aria-label': c.kutular.map((k) => k.baslik).join(' → ') }, ogeler);
}

const MAKET_BOLGELERI = ['menu', 'sol', 'eylem', 'arac', 'tablo', 'kartlar', 'grafik', 'form', 'soru', 'proje'];
/** @param {Record<string, any>} c */
function maketCizimi(c) {
  const bolge = MAKET_BOLGELERI.includes(c.bolge) ? c.bolge : 'tablo';
  const b = (ad, ...cocuk) => h('div', { class: `mk-${ad}${ad === bolge ? ' mk-hedef' : ''}` }, ...cocuk);
  const cizgiler = (adet) => Array.from({ length: adet }, (_, i) => h('i', { style: { '--i': i } }));
  const pano = bolge === 'kartlar' || bolge === 'grafik';
  return h('div', { class: `rehber-cizim rehber-maket hedef-${bolge}`, role: 'img', 'aria-label': c.etiket || 'Ekran maketi' },
    h('div', { class: 'mk-ekran' },
      h('div', { class: 'mk-ust' }, h('span', { class: 'mk-logo' }), b('proje'), b('menu', ...cizgiler(4)), b('soru')),
      h('div', { class: 'mk-alt' },
        b('sol', ...cizgiler(5)),
        h('div', { class: 'mk-ana' },
          h('div', { class: 'mk-baslik' }, h('span', { class: 'mk-baslik-metin' }), b('eylem', h('i'), h('i'))),
          pano ? h('div', { class: 'mk-panolar' }, b('kartlar', ...cizgiler(3)), b('grafik', h('span', { class: 'mk-egri' }))) : null,
          bolge === 'form' ? b('form', ...cizgiler(4)) : null,
          !pano && bolge !== 'form' ? b('arac', h('i'), h('i')) : null,
          !pano && bolge !== 'form' ? b('tablo', ...cizgiler(4)) : null)),
      h('span', { class: 'mk-imlec', 'aria-hidden': 'true' }, h('span', { class: 'mk-dalga' }))),
    c.etiket ? h('span', { class: 'mk-etiket' }, c.etiket) : null);
}

/** @param {Record<string, any>} c */
function formCizimi(c) {
  return h('div', { class: 'rehber-cizim rehber-form', style: { '--n': c.alanlar.length }, role: 'img', 'aria-label': `Form: ${c.alanlar.join(', ')}; ardından ${c.dugme}` },
    ...c.alanlar.map((a, i) => h('div', { class: 'rf-satir', style: { '--i': i } },
      h('span', { class: 'rf-etiket' }, a), h('span', { class: 'rf-girdi' }, h('span', { class: 'rf-dolgu' })), h('span', { class: 'rf-onay' }, ikon('onay')))),
    h('div', { class: 'rf-dugme' }, ikon('oynat'), c.dugme));
}

/** @param {Record<string, any>} c */
function istekCizimi(c) {
  const kontroller = c.kontroller || [];
  return h('div', { class: 'rehber-cizim rehber-istek', style: { '--n': kontroller.length }, role: 'img', 'aria-label': `${c.sol} → ${c.gidis} → ${c.sag}; ${c.donus} geri döner${kontroller.length ? `; kontroller: ${kontroller.join(', ')}` : ''}` },
    h('div', { class: 'ri-hat' },
      h('span', { class: 'ri-dugum' }, ikon('bilgisayar'), h('b', {}, c.sol)),
      h('span', { class: 'ri-yol' }, h('span', { class: 'ri-paket gidis' }, c.gidis), h('span', { class: 'ri-paket donus' }, c.donus)),
      h('span', { class: 'ri-dugum' }, ikon('ag'), h('b', {}, c.sag))),
    kontroller.length ? h('ul', { class: 'ri-kontroller' }, kontroller.map((k, i) => h('li', { style: { '--i': i } }, ikon('onay'), h('span', {}, k)))) : null);
}

/** @param {Record<string, any>} c */
function katmanCizimi(c) {
  return h('div', { class: 'rehber-cizim rehber-katman', role: 'img', 'aria-label': c.katmanlar.map((k) => k.baslik).join(' → ') },
    ...c.katmanlar.map((k, i) => h('div', { class: 'rk-katman', style: { '--i': i } }, h('b', {}, k.baslik), k.alt ? h('small', {}, k.alt) : null)));
}
