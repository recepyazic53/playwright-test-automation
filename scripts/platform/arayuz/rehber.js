// EKRAN REHBERLERİ — her sayfayı ve o sayfadaki işlerin sırasını adım adım anlatır (bkz. rehber-icerikleri.js).
//   - Sayfa rehberleri İSTEĞE BAĞLIDIR: her sayfanın başlığında küçük "Bu sayfanın rehberi (N adım)" bağlantısı ve üst çubuktaki
//     "?" düğmesi o sayfanın rehberini açar. İlk girişte kendiliğinden açılma Ayarlar > Arayüz > "Rehberleri ilk girişte göster"
//     tercihine bağlıdır (yeni kurulumda kapalı; kullanıcı kararı). Bir rehber bitince ya da kapatılınca "görüldü" olur (kasada;
//     bkz. scripts/platform/ayarlar/rehber-ayarlari.mjs). 5 adımlı genel tanıtım kurulum sihirbazından sonra bir kez açılır.
//   - Aynı anda tek pencere (pencere-yoneticisi.js): bir işlem penceresi açıkken rehber başlamaz, sıraya girer — pencere kapanınca
//     kendiliğinden başlamaz, sayfadaki bağlantı "hazır" olarak işaretlenir. Rehber açıkken işlem penceresi açılırsa rehber kapanır.
//   - Hedefi (CSS seçici) sayfada olmayan adım atlanır; adımın hedefi varsa ayrıca vurgulanır. Kart her zaman ekranın ortasındadır.
//   - Boş durum: projede henüz tam koşu yokken Sonuçlar'da kısa "ilk koşu" rehberi açılır (BOS_DURUM_REHBERLERI); ayrıntılı
//     rehber ilk tam koşudan sonra.
//   - Klavye: → / Enter ileri, ← geri, Esc kapat; odak kartın içinde kalır, kapanınca eski yerine döner.
//   - Otomatik sürülen tarayıcıda (navigator.webdriver; ör. Playwright testleri) kendiliğinden açılmaz — testler "?" ile ya da
//     localStorage 'nobetci-rehber-otomatik' = '1' ile açar.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yerlestir } from './ortak.js';
import { BOS_DURUM_REHBERLERI, REHBERLER } from './rehber-icerikleri.js';
import { acikPencereVar, rehberPenceresiKaydet } from './pencere-yoneticisi.js';

/** Hash'ten ekranın rehber anahtarı (rehber yoksa null). @param {string} hash */
export function rehberAnahtari(hash) {
  const [, bolum = 'sonuclar', alt = '', , dorduncu = ''] = String(hash || '#/sonuclar').split('/');
  const parca = alt ? decodeURIComponent(alt) : '';
  let anahtar = null;
  // Sonuçlar > Servisler (servis sonuçlarının tek yeri): #/sonuclar/servisler[/karsilastir|kosu|senaryo|a/…].
  const servisAlti = parca === 'servisler' ? String(hash).split('/')[3] || '' : '';
  if (bolum === 'sonuclar' || !bolum) {
    anahtar = parca === 'ozet' ? 'sonuclar-ozet' : parca === 'kosu' ? 'sonuclar-kosu' : parca === 'sonuc' ? 'sonuclar-sonuc' : parca === 'karsilastir' || servisAlti === 'karsilastir' ? 'sonuclar-karsilastir'
      : parca === 's' || servisAlti ? 'servis-sonuclari' : 'sonuclar';
  }
  else if (bolum === 'senaryolar') anahtar = parca === 'yeni' || parca === 'duzenle' ? 'senaryo-formu' : 'senaryolar';
  else if (bolum === 'servisler') {
    const sekme = String(hash).split('/')[4] || '';
    anahtar = parca === 'yeni' ? 'servis-ekle' : parca === 'sonuclar' ? (String(hash).split('/')[3] === 'karsilastir' ? 'sonuclar-karsilastir' : 'servis-sonuclari') : parca === 's' ? (sekme === 'akislar' ? 'servis-akislari' : sekme === 'sozlesme' ? 'servis-sozlesmesi' : 'servis') : 'servisler';
  } else if (bolum === 'ekranlar') {
    if (parca === 'yeni') anahtar = 'ekran-ekle';
    else if (parca === 'tarama') anahtar = 'tarama';
    else if (parca === 'e') anahtar = dorduncu === 'akis' ? 'akis-tasarimi' : dorduncu === 'bulgular' ? 'bulgular' : dorduncu === 'yukle' ? 'ekran-ekle' : 'ekran';
    else anahtar = 'ekranlar';
  } else if (bolum === 'akislar') anahtar = 'uctan-uca-akis';
  else if (bolum === 'veri' || bolum === 'planli-kosular') anahtar = bolum;
  // Ayarlar'dan taşınan sayfaların eski adresleri (uygulama yeni adrese yönlendirir) yeni sayfanın rehberini açar.
  else if (bolum === 'ayarlar') anahtar = parca === 'test-verisi' || parca === 'baglam' ? 'veri' : parca === 'zamanlanmis-kosular' || parca === 'planli-kosular' ? 'planli-kosular' : `ayarlar-${parca || 'proje'}`;
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

// ---- Boş durum: proje henüz tam koşu görmediyse (Başlarken'in "Koşuyu başlat" adımı) kısa rehber ----
/** @type {() => string | null} */
let projeKimligi = () => null;
/** Uygulama, seçili projeyi okuyan işlevi verir (boş durum rehberi için). @param {{ projeKimligi: () => string | null }} b */
export function rehberBaglaminiAyarla(b) { projeKimligi = b.projeKimligi; }
/** @type {Map<string, { bos: boolean; zaman: number }>} */
const bosDurumOnbellegi = new Map();

/** Seçili projede henüz tam koşu yok mu (kısa süre önbellekte; okunamazsa "var" sayılır → ayrıntılı rehber). */
async function tamKosuYokMu() {
  const id = projeKimligi();
  if (!id) return false;
  const k = bosDurumOnbellegi.get(id);
  if (k && Date.now() - k.zaman < 5_000) return k.bos;
  try {
    const { baslarken } = await api(`/platform/baslarken?projeId=${encodeURIComponent(id)}`);
    const bos = !baslarken.adimlar.some((/** @type {{ anahtar: string; durum: string }} */ a) => a.anahtar === 'kosu' && a.durum === 'tamam');
    bosDurumOnbellegi.set(id, { bos, zaman: Date.now() });
    return bos;
  } catch { return false; }
}

/** Sayfanın o anki rehberi: boş durumda kısa rehber. @param {string} anahtar @param {boolean} bos */
function etkinAnahtar(anahtar, bos) {
  const kisa = BOS_DURUM_REHBERLERI[anahtar];
  return bos && kisa && REHBERLER[kisa] ? kisa : anahtar;
}
/** @param {string} anahtar */
async function etkinRehber(anahtar) {
  return BOS_DURUM_REHBERLERI[anahtar] ? etkinAnahtar(anahtar, await tamKosuYokMu()) : anahtar;
}

/** Adımın hedefi sayfada (görünür) mi. @param {Record<string, any>} adim @returns {HTMLElement | null} */
function hedefBul(adim) {
  if (!adim.hedef) return null;
  const secenekler = Array.isArray(adim.hedef) ? adim.hedef : [adim.hedef];
  for (const secici of secenekler) {
    const el = /** @type {HTMLElement | null} */ (document.querySelector(secici));
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

/**
 * Bu sayfada gösterilecek adımlar: hedefi sayfada olmayan adım atlanır (anlattığı bölüm burada yok); hedefsiz ve "atlanmaz" adımlar
 * kalır. Hiç adım kalmazsa rehberin tamamı. @param {{ adimlar: Array<Record<string, any>> }} rehber
 */
function gorunurAdimlar(rehber) {
  const l = rehber.adimlar.filter((a) => !a.hedef || a.atlanmaz || hedefBul(a));
  return l.length ? l : rehber.adimlar;
}

let acik = null;
let bekleyen = null;
let kurulumTanitimi = false;
let kurulumBekleyen = null;
/** İşlem penceresi açıkken istenen rehber (kendiliğinden başlamaz; bağlantı "hazır" görünür). @type {{ anahtar: string; hash: string } | null} */
let siradaki = null;

/**
 * İlk kurulum sihirbazı bitti: ana düzen ilk çizildiğinde (hangi ekrana geçilirse) 5 adımlık genel tanıtım kendiliğinden açılır —
 * "Rehberleri ilk girişte göster" tercihinden bağımsız, tek sefer. Kullanıcı × / Esc ile kapatabilir; Ayarlar > Arayüz > "Genel
 * tanıtımı şimdi aç" aynen durur. Otomatik sürülen tarayıcıda ve NOBETCI_REHBER_OTOMATIK=0 ile yine açılmaz (testler açıkça ister).
 */
export function kurulumSonrasiTanitimIste() { kurulumTanitimi = true; }

async function kurulumTanitiminiAc() {
  kurulumTanitimi = false;
  if (!otomatikIzinli()) return;
  // Kasa sihirbazda oluşturuldu: önbellek (kasa yokken okunmuş olabilir) tazelenir.
  ayarSozu = null;
  const a = await ayarlar();
  if (a.ortamKapali || a.gorulenler.includes('genel')) return;
  clearTimeout(kurulumBekleyen);
  kurulumBekleyen = setTimeout(() => {
    kurulumBekleyen = null;
    if (acik) return;
    rehberBaslat('genel');
  }, 700);
}

/**
 * Ekranın rehberini ilk girişte (tercih açıksa ve daha önce görülmediyse) başlatır. Ekran çizilirken çağrılır; hedefler
 * yüklenene kadar kısa süre beklenir. @param {string | null} anahtar
 */
export async function rehberOtomatikDene(anahtar) {
  if (kurulumTanitimi) { await kurulumTanitiminiAc(); return; }
  if (kurulumBekleyen) return;
  clearTimeout(bekleyen);
  if (!anahtar || acik || !otomatikIzinli()) return;
  const a = await ayarlar();
  if (!a.otomatik) return;
  const sayfa = anahtar;
  // İlk girişte önce genel tanıtım, sonra ekranın rehberi.
  let baslatilacak = 'genel';
  if (a.gorulenler.includes('genel')) {
    baslatilacak = await etkinRehber(anahtar);
    if (a.gorulenler.includes(baslatilacak)) return;
  }
  clearTimeout(bekleyen);
  bekleyen = setTimeout(() => {
    // Ekran bu arada değiştiyse başlatılmaz; işlem penceresi açıksa rehberBaslat sıraya alır.
    if ((baslatilacak !== 'genel' && rehberAnahtari(location.hash) !== sayfa) || acik) return;
    rehberBaslat(baslatilacak);
  }, 700);
}

/** O anki sayfanın rehberini açar ("?" düğmesi ve "Bu sayfanın rehberi" bağlantısı). */
export async function sayfaRehberiniAc() {
  const anahtar = rehberAnahtari(location.hash);
  rehberBaslat(anahtar ? await etkinRehber(anahtar) : 'genel');
}

/** Üst çubuktaki "?" düğmesi: o anki ekranın rehberini başlatır. */
export function rehberDugmesi() {
  const d = h('button', { type: 'button', class: 'ikon-dugme rehber-dugmesi', title: 'Bu ekranın rehberi', 'aria-label': 'Bu ekranın rehberini aç' }, ikon('soru'));
  d.addEventListener('click', () => { void sayfaRehberiniAc(); });
  return d;
}

// ---- "Bu sayfanın rehberi (N adım)" bağlantısı: sayfa başlığının altında, "?" ile aynı işi yapar ----
/** @type {(() => void) | null} */
let baglantiyiPlanla = null;
let yoklananAdres = '';

/**
 * Ana içerik alanını izler; sayfanın başlığına (ilk görünür .sayfa-basligi; yoksa içerik alanının başına) küçük bağlantıyı yerleştirir
 * ve adım sayısını günceller. İkisi de yoksa bağlantı gösterilmez ("?" her zaman çalışır). @param {HTMLElement} kap
 */
export function sayfaRehberiBaglantisiKur(kap) {
  const metin = h('span', { class: 'sayfa-rehberi-metni' }, 'Bu sayfanın rehberi');
  const baglanti = h('button', { type: 'button', class: 'sayfa-rehberi', title: 'Bu sayfanın rehberini aç (üst çubuktaki "?" ile aynı)' }, ikon('pusula'), metin);
  // Bekleyen rehber (işlem penceresi yüzünden başlatılamayan; ör. kurulum sonrası genel tanıtım) varsa önce o açılır.
  baglanti.addEventListener('click', () => { if (siradaki && siradaki.hash === location.hash) rehberBaslat(siradaki.anahtar); else void sayfaRehberiniAc(); });
  let zamanlayici = 0;
  const guncelle = () => {
    zamanlayici = 0;
    if (!kap.isConnected) return;
    const anahtar = rehberAnahtari(location.hash);
    const gorunur = (/** @type {string} */ secici) => (anahtar ? [...kap.querySelectorAll(secici)].find((b) => !b.closest('dialog') && b.getClientRects().length) : undefined);
    // Yer: sayfa başlığının metin bloğu; başlığı olmayan sayfada (ör. boş durum) içerik alanının başı.
    const baslik = gorunur('.sayfa-basligi');
    const alan = baslik ? null : gorunur('.icerik-alani');
    if (!baslik && !alan) { if (baglanti.isConnected) baglanti.remove(); return; }
    if (baslik) {
      const ilk = baslik.firstElementChild;
      const yer = ilk && ilk.tagName === 'DIV' && !ilk.classList.contains('eylemler') ? ilk : baslik;
      if (baglanti.parentElement !== yer || yer.lastElementChild !== baglanti) yer.append(baglanti);
    } else if (alan && alan.firstElementChild !== baglanti) alan.prepend(baglanti);
    // Boş durum sayfasında proje durumu adres değişince bir kez yoklanır; yanıt gelince sayı yenilenir.
    if (BOS_DURUM_REHBERLERI[anahtar] && yoklananAdres !== location.hash) {
      yoklananAdres = location.hash;
      void tamKosuYokMu().then(planla);
    }
    const id = projeKimligi();
    const kayit = id ? bosDurumOnbellegi.get(id) : undefined;
    const gecerli = etkinAnahtar(anahtar, Boolean(kayit && kayit.bos));
    const hazir = Boolean(siradaki && siradaki.hash === location.hash);
    const baska = hazir && siradaki && siradaki.anahtar !== gecerli ? siradaki.anahtar : null;
    const yazi = baska
      ? `Rehber hazır: ${baska === 'genel' ? 'Genel tanıtım' : REHBERLER[baska].baslik} (${gorunurAdimlar(REHBERLER[baska]).length} adım)`
      : `Bu sayfanın rehberi (${gorunurAdimlar(REHBERLER[gecerli]).length} adım)`;
    if (metin.textContent !== yazi) metin.textContent = yazi;
    if (baglanti.classList.contains('hazir') !== hazir) {
      baglanti.classList.toggle('hazir', hazir);
      baglanti.title = hazir ? 'Rehber, açık pencere yüzünden başlatılmadı: buradan açabilirsiniz' : 'Bu sayfanın rehberini aç (üst çubuktaki "?" ile aynı)';
    }
  };
  const planla = () => { if (!zamanlayici) zamanlayici = window.setTimeout(guncelle, 120); };
  new MutationObserver(planla).observe(kap, { childList: true, subtree: true });
  baglantiyiPlanla = planla;
  planla();
}

/**
 * Rehberi başlatır (açık bir rehber varsa önce kapanır). İşlem penceresi açıksa başlamaz, sıraya girer: pencere kapanınca
 * kendiliğinden açılmaz, sayfadaki bağlantı "hazır" görünür.
 * @param {string} anahtar REHBERLER anahtarı @returns {boolean} başladı mı
 */
export function rehberBaslat(anahtar) {
  const rehber = REHBERLER[anahtar];
  if (!rehber) return false;
  if (acikPencereVar()) {
    siradaki = { anahtar, hash: location.hash };
    baglantiyiPlanla?.();
    return false;
  }
  if (siradaki) { siradaki = null; baglantiyiPlanla?.(); }
  if (acik) acik.kapat(false);
  clearTimeout(bekleyen);
  const adimlar = gorunurAdimlar(rehber);
  const onceOdak = /** @type {HTMLElement | null} */ (document.activeElement);
  let sira = 0;
  const perde = h('div', { class: 'rehber-perde', 'aria-hidden': 'true' });
  const vurgu = h('div', { class: 'rehber-vurgu', 'aria-hidden': 'true' });
  const baslikId = `rehber-baslik-${Date.now()}`;
  const kart = h('div', { class: 'rehber-karti', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': baslikId, tabindex: '-1', 'data-rehber': anahtar });
  const kok = h('div', { class: 'rehber-kok' }, perde, vurgu, kart);
  document.body.append(kok);

  // Kart HER ZAMAN ekranın ortasında açılır (masaüstü ve telefon); adımın hedefi varsa yalnızca vurgulanır (kart hedefin yanına
  // taşınmaz — kenara / üste yapışık kart olmaz).
  const yerlestirKart = () => {
    const adim = adimlar[sira];
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
    const adim = adimlar[sira];
    const sonAdim = sira === adimlar.length - 1;
    const geri = h('button', { type: 'button', class: 'hayalet', disabled: sira === 0, onclick: () => git(-1) }, ikon('geri'), 'Geri');
    const ileri = h('button', { type: 'button', class: 'birincil', onclick: () => (sonAdim ? kapat(true) : git(1)) }, sonAdim ? 'Bitti' : 'İleri', sonAdim ? ikon('onay') : ikon('ok'));
    const kapatDugmesi = h('button', { type: 'button', class: 'ikon-dugme hayalet rehber-kapat', 'aria-label': 'Rehberi kapat', title: 'Kapat (Esc)', onclick: () => kapat(true) }, ikon('carpi'));
    const metinler = (Array.isArray(adim.metin) ? adim.metin : [adim.metin]).filter(Boolean);
    const sahne = adim.cizim ? cizim(adim.cizim) : null;
    // İlerleme: her adım bir parça; tıklayınca o adıma gider.
    const ilerleme = h('div', { class: 'rehber-ilerleme', role: 'group', 'aria-label': 'Adımlar' },
      adimlar.map((a, i) => h('button', {
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
        h('span', { class: 'rehber-sayac' }, `${sira + 1} / ${adimlar.length}`), kapatDugmesi),
      ilerleme,
      h('div', { class: `rehber-govde ${yon > 0 ? 'ileri' : 'geri'}` }, sahne ? h('div', { class: 'rehber-sahne' }, sahne) : null, icerik),
      h('div', { class: 'dugmeler' }, geri, ileri));
    const el = hedefBul(adim);
    if (el) el.scrollIntoView({ block: 'center' });
    requestAnimationFrame(yerlestirKart);
    ileri.focus();
  };

  const git = (adim) => { yon = adim; sira = Math.min(Math.max(0, sira + adim), adimlar.length - 1); ciz(); };

  const tus = (o) => {
    if (o.key === 'Escape') { o.preventDefault(); kapat(true); return; }
    if (o.key === 'ArrowRight' && !o.altKey) { o.preventDefault(); if (sira < adimlar.length - 1) git(1); return; }
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
  // Sayfa geç yüklenen içerikle kayarsa (kart, liste) vurgu ve kart yeniden konumlanır.
  const yerlesimGozcusu = typeof ResizeObserver === 'function' ? new ResizeObserver(yeniden) : null;
  yerlesimGozcusu?.observe(document.body);
  const ekranDegisti = () => kapat(false);
  window.addEventListener('hashchange', ekranDegisti);
  // İşlem penceresi açılırsa rehber kapanır (görüldü sayılmaz).
  const kayitSil = rehberPenceresiKaydet((goruldu) => kapat(goruldu));

  function kapat(goruldu) {
    kayitSil();
    document.removeEventListener('keydown', tus, true);
    window.removeEventListener('resize', yeniden);
    window.removeEventListener('scroll', yeniden, true);
    yerlesimGozcusu?.disconnect();
    window.removeEventListener('hashchange', ekranDegisti);
    kok.remove();
    if (acik && acik.kok === kok) acik = null;
    if (goruldu) gorulduIsaretle(anahtar);
    if (onceOdak && onceOdak.isConnected) onceOdak.focus();
  }
  acik = { kok, kapat };
  ciz();
  return true;
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
