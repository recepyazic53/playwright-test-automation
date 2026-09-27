// EKRAN REHBERLERİ — her ekranı ve o ekrandaki işlerin sırasını adım adım anlatır (bkz. rehber-icerikleri.js).
//   - Ekran ilk açıldığında otomatik başlar (Ayarlar > Arayüz > "Rehberleri ilk girişte göster"; kullanıcı kararı). Bir
//     rehber bitince ya da kapatılınca "görüldü" olur (kasada; bkz. scripts/platform/ayarlar/rehber-ayarlari.mjs).
//   - Üst çubuktaki "?" düğmesi o anki ekranın rehberini istediğiniz zaman yeniden başlatır.
//   - Adımın hedefi (CSS seçici) sayfada varsa vurgulanır ve kart onun yanına konur; yoksa kart ortada açılır.
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
  if (bolum === 'sonuclar' || !bolum) anahtar = parca === 'kosu' ? 'sonuclar-kosu' : parca === 'sonuc' ? 'sonuclar-sonuc' : 'sonuclar';
  else if (bolum === 'senaryolar') anahtar = parca === 'yeni' || parca === 'duzenle' ? 'senaryo-formu' : 'senaryolar';
  else if (bolum === 'servisler') {
    const sekme = String(hash).split('/')[4] || '';
    anahtar = parca === 'yeni' ? 'servis-ekle' : parca === 's' ? (sekme === 'akislar' ? 'servis-akislari' : 'servis') : 'servisler';
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

  const yerlestirKart = () => {
    const adim = rehber.adimlar[sira];
    const el = hedefBul(adim);
    kart.classList.toggle('ortada', !el);
    if (!el) { vurgu.hidden = true; kart.style.removeProperty('top'); kart.style.removeProperty('left'); return; }
    const r = el.getBoundingClientRect();
    const bosluk = 6;
    vurgu.hidden = false;
    Object.assign(vurgu.style, { top: `${r.top - bosluk}px`, left: `${r.left - bosluk}px`, width: `${r.width + bosluk * 2}px`, height: `${r.height + bosluk * 2}px` });
    if (window.innerWidth < 640) { kart.style.removeProperty('top'); kart.style.removeProperty('left'); kart.classList.add('altta'); return; }
    kart.classList.remove('altta');
    const k = kart.getBoundingClientRect();
    const altaSigar = r.bottom + 12 + k.height < window.innerHeight;
    const top = altaSigar ? r.bottom + 12 : Math.max(12, r.top - 12 - k.height);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - k.width - 12);
    kart.style.top = `${top}px`;
    kart.style.left = `${left}px`;
  };

  const ciz = () => {
    const adim = rehber.adimlar[sira];
    const son = sira === rehber.adimlar.length - 1;
    const geri = h('button', { type: 'button', class: 'hayalet', disabled: sira === 0, onclick: () => git(-1) }, ikon('geri'), 'Geri');
    const ileri = h('button', { type: 'button', class: 'birincil', onclick: () => (son ? kapat(true) : git(1)) }, son ? 'Bitti' : 'İleri', son ? ikon('onay') : ikon('ok'));
    const kapatDugmesi = h('button', { type: 'button', class: 'ikon-dugme hayalet rehber-kapat', 'aria-label': 'Rehberi kapat', title: 'Kapat (Esc)', onclick: () => kapat(true) }, ikon('carpi'));
    const metinler = (Array.isArray(adim.metin) ? adim.metin : [adim.metin]).filter(Boolean);
    yerlestir(kart,
      h('div', { class: 'rehber-ust' },
        h('span', { class: 'rehber-etiket' }, ikon('pusula'), rehber.baslik),
        h('span', { class: 'rehber-sayac' }, `${sira + 1} / ${rehber.adimlar.length}`), kapatDugmesi),
      h('h2', { id: baslikId }, adim.baslik),
      ...metinler.map((m) => h('p', {}, m)),
      adim.sira ? h('ol', { class: 'rehber-sira' }, adim.sira.map((x) => h('li', {}, x))) : null,
      adim.cizim ? cizim(adim.cizim) : null,
      adim.ipucu ? h('p', { class: 'rehber-ipucu' }, ikon('simsek'), adim.ipucu) : null,
      h('div', { class: 'rehber-nokta', 'aria-hidden': 'true' }, rehber.adimlar.map((_, i) => h('span', { class: i === sira ? 'aktif' : '' }))),
      h('div', { class: 'dugmeler' }, geri, ileri));
    const el = hedefBul(adim);
    if (el) el.scrollIntoView({ block: 'center' });
    requestAnimationFrame(yerlestirKart);
    ileri.focus();
  };

  const git = (yon) => { sira = Math.min(Math.max(0, sira + yon), rehber.adimlar.length - 1); ciz(); };

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
 * Anlatım çizimi (örnek veri kurulmaz; kullanıcı kararı "yalnız anlatım"): kutular ve oklarla küçük bir akış.
 * @param {{ tur: 'akis'; kutular: Array<{ baslik: string; alt?: string; ikon?: string }> }} c
 */
function cizim(c) {
  if (c.tur !== 'akis') return null;
  const ogeler = [];
  c.kutular.forEach((k, i) => {
    if (i) ogeler.push(h('span', { class: 'rehber-ok', 'aria-hidden': 'true' }, ikon('ok')));
    ogeler.push(h('span', { class: 'rehber-kutu' }, k.ikon ? ikon(k.ikon) : null, h('b', {}, k.baslik), k.alt ? h('small', {}, k.alt) : null));
  });
  return h('div', { class: 'rehber-cizim', role: 'img', 'aria-label': c.kutular.map((k) => k.baslik).join(' → ') }, ogeler);
}
