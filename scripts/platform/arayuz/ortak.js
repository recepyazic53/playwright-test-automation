// Platform arayüzü — ortak yardımcılar: API istemcisi, DOM oluşturucu, form bileşenleri.
// Kullanıcı verisi DOM'a YALNIZCA metin düğümü/özellik olarak yazılır (innerHTML kullanılmaz).

const tokenMeta = document.querySelector('meta[name="oturum-tokeni"]');
/** Sunucunun bu yanıta enjekte ettiği oturum token'ı (yalnızca bellekte tutulur). */
export const TOKEN = tokenMeta ? tokenMeta.getAttribute('content') || '' : '';
if (tokenMeta) tokenMeta.remove();

// ---------------------------------------------------------------------------------------
// Marka (TEK YER): ürün adını değiştirmek için yalnızca burayı düzenleyin.
//   ad: üst çubuk ve sekme başlığı · altBaslik: marka altındaki kısa tanım
//   yonelme: hoş geldiniz başlığındaki "…'ye hoş geldiniz" biçimi (Türkçe ek ada göre değişir)
// ---------------------------------------------------------------------------------------
export const MARKA = Object.freeze({ ad: 'Nöbetçi', altBaslik: 'test komuta merkezi', yonelme: "Nöbetçi'ye" });

// ---------------------------------------------------------------------------------------
// Tema: <html data-tema="koyu|acik">. Seçim yapılmamışsa (localStorage boş) işletim sisteminin
// açık/koyu ayarı geçerlidir (CSS prefers-color-scheme). Seçim 'platform.tema' anahtarında durur.
// ---------------------------------------------------------------------------------------
const TEMA_ANAHTARI = 'platform.tema';
const sistemAcikMi = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
export function kayitliTema() {
  try { const t = localStorage.getItem(TEMA_ANAHTARI); return t === 'koyu' || t === 'acik' ? t : null; } catch { return null; }
}
/** Etkin tema ('koyu' | 'acik'). */
export const etkinTema = () => document.documentElement.dataset.tema || (sistemAcikMi() ? 'acik' : 'koyu');
export function temaUygula(tema) {
  if (tema === 'koyu' || tema === 'acik') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  window.dispatchEvent(new CustomEvent('tema-degisti', { detail: etkinTema() }));
}
temaUygula(kayitliTema());

/** Başlık çubuklarındaki tema düğmesi (güneş/ay). Seçim hatırlanır. */
export function temaDugmesi() {
  const dugme = h('button', { type: 'button', class: 'ikon-dugme tema-dugmesi' });
  const guncelle = () => {
    const koyu = etkinTema() === 'koyu';
    dugme.replaceChildren(ikon(koyu ? 'gunes' : 'ay'));
    dugme.setAttribute('aria-label', koyu ? 'Açık temaya geç' : 'Koyu temaya geç');
    dugme.title = koyu ? 'Açık temaya geç' : 'Koyu temaya geç';
  };
  dugme.addEventListener('click', () => {
    const yeni = etkinTema() === 'koyu' ? 'acik' : 'koyu';
    try { localStorage.setItem(TEMA_ANAHTARI, yeni); } catch { /* yok sayılır */ }
    temaUygula(yeni);
  });
  window.addEventListener('tema-degisti', guncelle);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!kayitliTema()) temaUygula(null); });
  guncelle();
  return dugme;
}

// ---------------------------------------------------------------------------------------
// İkonlar (24×24, çizgi). 'c:x,y,r' daire, 'r:x,y,g,y,rx' dikdörtgen, diğerleri path.
// ---------------------------------------------------------------------------------------
const IKONLAR = {
  grafik: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  liste: ['M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01'],
  ekran: ['r:3,4,18,13,2', 'M8 21h8M12 17v4'],
  ayar: ['c:12,12,3', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z'],
  kilit: ['r:4,11,16,10,2', 'M8 11V7a4 4 0 018 0v4'],
  ara: ['c:11,11,7', 'M20 20l-3.5-3.5'],
  gunes: ['c:12,12,4', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  ay: ['M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z'],
  oynat: ['M7 4.5v15l12-7.5z'],
  onay: ['M5 12.5l4.5 4.5L19 7.5'],
  carpi: ['M6 6l12 12M18 6L6 18'],
  eksi: ['M6 12h12'],
  indir: ['M12 4v11M7 10l5 5 5-5M5 20h14'],
  saat: ['c:12,12,9', 'M12 7v5l3 2'],
  takvim: ['r:3,5,18,16,2', 'M3 10h18M8 3v4M16 3v4'],
  cpu: ['r:6,6,12,12,2', 'M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4'],
  uyari: ['M12 3l9.5 17h-19z', 'M12 10v4M12 17.5h.01'],
  zamanlayici: ['c:12,13,8', 'M12 9v4M9 2h6'],
  ag: ['c:12,12,9', 'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18'],
  hedef: ['c:12,12,8', 'c:12,12,3'],
  izgara: ['r:3,3,7,7,1.5', 'r:14,3,7,7,1.5', 'r:3,14,7,7,1.5', 'r:14,14,7,7,1.5'],
  asagi: ['M8 10l4 4 4-4'],
  video: ['r:2.5,6,13,12,2', 'M15.5 10.5L21 7.5v9l-5.5-3'],
  genislet: ['M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  yukle: ['M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4', 'M12 15V3M7 8l5-5 5 5'],
  arti: ['r:3,3,18,18,4', 'M12 8v8M8 12h8'],
  artiYalin: ['M12 5v14M5 12h14'],
  klasor: ['M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 13h7M13 10l3 3-3 3'],
  dosya: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z', 'M14 3v5h5'],
  kalkan: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  bilgisayar: ['r:3,4,18,13,2', 'M8 21h8M12 17v4'],
  ok: ['M5 12h14M13 6l6 6-6 6'],
  geri: ['M19 12H5M11 6l-6 6 6 6'],
  yenile: ['M20 11a8 8 0 10-2.3 5.7', 'M20 4v7h-7'],
  anahtar: ['c:8,15,4', 'M10.8 12.2L20 3M16 7l3 3M14 9l2 2'],
  kullanici: ['c:12,8,4', 'M4 21a8 8 0 0116 0'],
  katman: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  veri: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  arsiv: ['r:3,4,18,5,1.5', 'M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9', 'M10 13h4'],
  gorunum: ['r:3,3,18,18,2', 'M3 9h18M9 21V9'],
  tarih: ['c:12,12,9', 'M12 7v5l3 2', 'M3 4v4h4'],
  kopya: ['r:8,8,12,12,2', 'M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2'],
  goz: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'c:12,12,3'],
  duzenle: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  cop: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 13h10l1-13M9 7V4h6v3'],
  isaret: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'c:12,12,2.4'],
  pusula: ['c:12,12,9', 'M15.5 8.5l-2 5-5 2 2-5z'],
  simsek: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  cikis: ['M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3', 'M10 17l5-5-5-5M15 12H3'],
  yildiz: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  cekmece: ['M3 13l3-8h12l3 8v6a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M3 13h5l1 3h6l1-3h5']
};
const SVG_NS = 'http://www.w3.org/2000/svg';
/** SVG öğesi oluşturur (özellikler setAttribute ile). */
export function s(etiket, ozellikler, ...cocuklar) {
  const el = document.createElementNS(SVG_NS, etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') el.addEventListener(ad.slice(2), deger);
    else el.setAttribute(ad, String(deger));
  }
  for (const c of cocuklar.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
/** Dekoratif ikon (aria-hidden). ad: IKONLAR anahtarı. */
export function ikon(ad, sinif = '') {
  const parcalar = IKONLAR[ad] || IKONLAR.isaret;
  const svg = s('svg', { viewBox: '0 0 24 24', class: `ikon ${ad === 'oynat' ? 'dolu ' : ''}${sinif}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  for (const p of parcalar) {
    if (p.startsWith('c:')) { const [cx, cy, r] = p.slice(2).split(','); svg.append(s('circle', { cx, cy, r })); }
    else if (p.startsWith('r:')) { const [x, y, w, hh, rx] = p.slice(2).split(','); svg.append(s('rect', { x, y, width: w, height: hh, rx })); }
    else svg.append(s('path', { d: p }));
  }
  return svg;
}
/** Marka logosu (altıgen işaret). */
export const logo = (sinif = 'logo') => h('span', { class: sinif, 'aria-hidden': 'true' },
  s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }), s('circle', { cx: 12, cy: 12, r: 2.4 })));

export class ApiHatasi extends Error {
  constructor(mesaj, durum, govde) {
    super(mesaj);
    this.durum = durum;
    this.govde = govde || {};
    this.kod = this.govde.kod || null;
    this.bekleSaniye = this.govde.bekleSaniye || null;
  }
}

/** Kaydedilmemiş değişiklik izi (cikis-korumasi.js kurar ve işaretler). */
export const kayitIzi = { kirli: false };
/** Kaydedildi / bilerek vazgeçildi: sayfadan çıkarken uyarı sorulmaz. */
export const degisiklikleriBirak = () => { kayitIzi.kirli = false; };
/** Başarılı olunca veriyi saklayan uçlar (önizleme, deneme, denetim gibi uçlar izi temizlemez). */
const KAYIT_UCU = /(?:\/|-)(kaydet|sil|uygula|ekle|olustur|degistir|duzenle|tasi|aktar|kosuya-dahil|varsayilan|yeniden-adlandir|sirala|toplu-ata|tasarim|geri-yukle|kopyala|modellerden|sifirla|unut|kaldir|test-verisine-tasi)(?:$|[/?])/;

/**
 * JSON API çağrısı (aynı köken). govde verilirse POST. 423 (kasa kilitli) olursa
 * "kasa-kilitli" olayı yayınlanır; kabuk kilit ekranına döner.
 */
export async function api(yol, secenekler = {}) {
  const istek = { method: secenekler.govde ? 'POST' : 'GET', headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' };
  if (secenekler.govde) {
    istek.headers['Content-Type'] = 'application/json';
    istek.body = JSON.stringify(Object.assign({}, secenekler.govde, { token: TOKEN }));
  }
  let yanit;
  try {
    yanit = await fetch(yol, istek);
  } catch {
    throw new ApiHatasi('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm run baslat).', 0, {});
  }
  let veri = null;
  try { veri = await yanit.json(); } catch { veri = null; }
  if (!yanit.ok || (veri && veri.basarili === false)) {
    const hata = new ApiHatasi((veri && veri.mesaj) || `İstek başarısız oldu (${yanit.status}).`, yanit.status, veri);
    if (yanit.status === 423 && !secenekler.kilitOlayiYok) window.dispatchEvent(new CustomEvent('kasa-kilitli', { detail: hata.message }));
    // 401: sayfanın oturum token'ı sunucuyu tutmuyor → Nöbetçi yeniden başlatılmış (her başlatmada token değişir).
    if (yanit.status === 401) window.dispatchEvent(new CustomEvent('sunucu-yenilendi'));
    throw hata;
  }
  if (secenekler.govde && KAYIT_UCU.test(yol)) degisiklikleriBirak();
  return veri || {};
}

/**
 * DOM oluşturucu: h('button', { class: 'x', onclick: fn, disabled: true }, 'Metin', altOge)
 * Metinler her zaman metin düğümü olarak eklenir.
 */
export function h(etiket, ozellikler, ...cocuklar) {
  const el = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') el.addEventListener(ad.slice(2), deger);
    else if (ad === 'class') el.className = deger;
    else if (ad === 'style' && typeof deger === 'object') { for (const [k, v] of Object.entries(deger)) el.style.setProperty(k, String(v)); }
    else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate', 'required', 'multiple', 'readOnly'].includes(ad)) el[ad] = deger;
    else if (deger === true) el.setAttribute(ad, '');
    else el.setAttribute(ad, String(deger));
  }
  ekle(el, cocuklar);
  return el;
}

/** replaceChildren'ın null/false/dizi güvenli karşılığı (h() ile aynı kurallar). */
export function yerlestir(el, ...cocuklar) {
  el.replaceChildren();
  ekle(el, cocuklar);
  return el;
}

function ekle(el, cocuklar) {
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) ekle(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let kimlikSayaci = 0;
export const yeniKimlik = (onEk = 'k') => `${onEk}-${++kimlikSayaci}`;

/**
 * Temaya uygun öneri listesi (tarayıcının beyaz datalist'i yerine): odaklanınca / tıklayınca tümü, yazdıkça süzülür
 * (Türkçe, içerir); ↑ / ↓ gezer, Enter seçer, Esc kapatır (diyaloğu kapatmaz). Seçim girdiye yazılır, input + change
 * olayları yayınlanır. Liste diyalog içindeyse diyaloğa, değilse gövdeye eklenir ve girdinin altına sabitlenir
 * (kaydırılan kaplarda kırpılmaz).
 * @param {HTMLInputElement} girdi @param {() => string[]} secenekler
 */
export function oneriListesi(girdi, secenekler) {
  const liste = h('div', { class: 'secim-onerileri', role: 'listbox', id: yeniKimlik('oneri'), hidden: true });
  girdi.setAttribute('role', 'combobox');
  girdi.setAttribute('aria-autocomplete', 'list');
  girdi.setAttribute('aria-controls', liste.id);
  girdi.setAttribute('aria-expanded', 'false');
  girdi.setAttribute('autocomplete', 'off');
  /** @type {string[]} */
  let gorunen = [];
  let aktif = -1;
  let seciliyor = false;
  const kucuk = (/** @type {string} */ x) => x.toLocaleLowerCase('tr');
  const konumla = () => {
    const r = girdi.getBoundingClientRect();
    Object.assign(liste.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${Math.max(r.width, 180)}px` });
  };
  const kaydirinca = () => { if (!girdi.isConnected) kapat(); else konumla(); };
  function kapat() {
    liste.hidden = true;
    aktif = -1;
    girdi.setAttribute('aria-expanded', 'false');
    girdi.removeAttribute('aria-activedescendant');
    window.removeEventListener('scroll', kaydirinca, true);
    window.removeEventListener('resize', kaydirinca);
  }
  const sec = (/** @type {string} */ x) => {
    girdi.value = x;
    kapat();
    seciliyor = true;
    girdi.dispatchEvent(new Event('input', { bubbles: true }));
    girdi.dispatchEvent(new Event('change', { bubbles: true }));
    seciliyor = false;
    secilenDeger = x;
  };
  const ciz = (/** @type {boolean} */ tumu) => {
    const ara = kucuk(girdi.value.trim());
    const hepsi = secenekler();
    gorunen = (tumu || !ara ? hepsi : hepsi.filter((x) => kucuk(x).includes(ara))).slice(0, 300);
    if (!gorunen.length) { kapat(); return; }
    if (aktif >= gorunen.length) aktif = gorunen.length - 1;
    const kap = girdi.closest('dialog') || document.body;
    if (liste.parentElement !== kap) kap.append(liste);
    yerlestir(liste, gorunen.map((x, i) => h('div', {
      class: `secim-onerisi${i === aktif ? ' aktif' : ''}${x === girdi.value ? ' secili' : ''}`, role: 'option', id: `${liste.id}-${i}`,
      'aria-selected': i === aktif ? 'true' : 'false', onmousedown: (/** @type {MouseEvent} */ o) => { o.preventDefault(); sec(x); }
    }, x)));
    if (aktif >= 0) { girdi.setAttribute('aria-activedescendant', `${liste.id}-${aktif}`); liste.children[aktif]?.scrollIntoView({ block: 'nearest' }); }
    if (liste.hidden) {
      liste.hidden = false;
      girdi.setAttribute('aria-expanded', 'true');
      window.addEventListener('scroll', kaydirinca, true);
      window.addEventListener('resize', kaydirinca);
    }
    konumla();
  };
  let tumuAcik = false;
  // Seçimden sonra tarayıcı, alan odağı kaybedince (yazılmış metin değiştiği için) bir change daha yayınlar; değer aynıysa
  // yutulur. Yutulmazsa dinleyen form yeniden çizilir ve tıklanan düğme (ör. "Koşul ekle") tıklamayı kaçırır.
  let secilenDeger = /** @type {string | null} */ (null);
  girdi.addEventListener('change', (o) => {
    if (seciliyor) return;
    if (secilenDeger !== null && girdi.value === secilenDeger) o.stopImmediatePropagation();
    secilenDeger = null;
  }, true);
  girdi.addEventListener('input', () => { if (!seciliyor) { aktif = -1; tumuAcik = false; ciz(false); } });
  girdi.addEventListener('focus', () => { tumuAcik = true; ciz(true); });
  girdi.addEventListener('click', () => { if (liste.hidden) { tumuAcik = true; ciz(true); } });
  girdi.addEventListener('blur', () => kapat());
  girdi.addEventListener('keydown', (o) => {
    if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
      o.preventDefault();
      if (liste.hidden) { tumuAcik = true; ciz(true); return; }
      aktif = o.key === 'ArrowDown' ? Math.min(aktif + 1, gorunen.length - 1) : Math.max(aktif - 1, 0);
      ciz(tumuAcik);
    } else if (o.key === 'Enter' && !liste.hidden && aktif >= 0) {
      o.preventDefault();
      sec(gorunen[aktif]);
    } else if (o.key === 'Escape' && !liste.hidden) {
      o.preventDefault();
      o.stopPropagation();
      kapat();
    }
  });
  return girdi;
}

/** Kısa bildirim (ekran okuyucu için role=status bölgesinde). */
export function bildir(mesaj, tur = 'basari') {
  const kutu = document.getElementById('bildirimler');
  if (!kutu) return;
  const oge = h('div', { class: `bildirim ${tur === 'hata' ? 'hata' : ''}` }, ikon(tur === 'hata' ? 'uyari' : 'onay'), h('span', {}, mesaj));
  kutu.append(oge);
  setTimeout(() => oge.remove(), tur === 'hata' ? 8000 : 4000);
}

/** Etiketli form alanı. input'a id verilir, yardım metni aria-describedby ile bağlanır. */
export function alan(etiket, girdi, secenekler = {}) {
  const id = girdi.id || yeniKimlik('alan');
  girdi.id = id;
  const yardimId = secenekler.yardim ? `${id}-yardim` : null;
  const hataId = `${id}-hata`;
  const aciklamalar = [yardimId, hataId].filter(Boolean).join(' ');
  girdi.setAttribute('aria-describedby', aciklamalar);
  return h('div', { class: 'alan' },
    h('label', { for: id }, etiket, secenekler.zorunlu ? h('span', { class: 'soluk' }, ' (zorunlu)') : null),
    secenekler.icerik || girdi,
    yardimId ? h('div', { class: 'yardim', id: yardimId }, secenekler.yardim) : null,
    h('div', { class: 'alan-hatasi', id: hataId, role: 'alert' }));
}

/** Alanın altına hata yazar (boş mesaj = temizle). */
export function alanHatasi(girdi, mesaj) {
  const kutu = document.getElementById(`${girdi.id}-hata`);
  if (kutu) kutu.textContent = mesaj || '';
  if (mesaj) girdi.setAttribute('aria-invalid', 'true');
  else girdi.removeAttribute('aria-invalid');
}

/**
 * Parola/gizli değer alanı: type=password + "Göster" anahtarı. kayitli.dolu ise alan boş
 * bırakılırsa mevcut değer korunur; "Kayıtlı değeri göster" (gosterFn) açıkça istenince
 * sunucudan tek değeri alır.
 */
export function parolaAlani(etiket, secenekler = {}) {
  const girdi = h('input', {
    type: 'password', autocomplete: secenekler.otomatik || 'off', required: secenekler.zorunlu,
    name: secenekler.ad, spellcheck: 'false'
  });
  if (secenekler.kayitli && secenekler.kayitli.dolu) girdi.placeholder = `${secenekler.kayitli.maske} kayıtlı — değiştirmek için yazın`;
  const goster = h('button', { type: 'button', class: 'kucuk-dugme goster-dugmesi', 'aria-pressed': 'false' }, 'Göster');
  goster.addEventListener('click', () => {
    const acik = girdi.type === 'password';
    girdi.type = acik ? 'text' : 'password';
    goster.textContent = acik ? 'Gizle' : 'Göster';
    goster.setAttribute('aria-pressed', acik ? 'true' : 'false');
  });
  goster.setAttribute('aria-label', `${etiket}: ${'göster veya gizle'}`);
  const satir = h('div', { class: 'parola-satiri' }, h('div', { class: 'parola-kutusu' }, girdi, goster));
  if (secenekler.kayitli && secenekler.kayitli.dolu && secenekler.gosterFn) {
    const kayitliGoster = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('goz'), 'Kayıtlı değeri göster');
    kayitliGoster.addEventListener('click', async () => {
      kayitliGoster.disabled = true;
      try {
        girdi.value = await secenekler.gosterFn();
        girdi.type = 'text';
        goster.textContent = 'Gizle';
        goster.setAttribute('aria-pressed', 'true');
        girdi.focus();
      } catch (hata) {
        alanHatasi(girdi, hata.message);
      } finally {
        kayitliGoster.disabled = false;
      }
    });
    satir.append(kayitliGoster);
  }
  const yardim = secenekler.yardim || (secenekler.kayitli && secenekler.kayitli.dolu ? 'Boş bırakırsanız kayıtlı değer korunur.' : null);
  return { kapsayici: alan(etiket, girdi, { yardim, zorunlu: secenekler.zorunlu, icerik: satir }), girdi };
}

/** İki adımlı onay: ilk tıklama düğmeyi "…onayla" durumuna getirir, 5 sn içinde ikinci tıklama çalıştırır. */
export function onayliDugme(metin, onayMetni, fn, secenekler = {}) {
  const dugme = h('button', { type: 'button', class: `tehlike ${secenekler.kucuk ? 'kucuk-dugme' : ''}`, 'aria-label': secenekler.etiket || metin }, metin);
  let zamanlayici = null;
  dugme.addEventListener('click', async () => {
    if (!dugme.classList.contains('onay-bekliyor')) {
      dugme.classList.add('onay-bekliyor');
      dugme.textContent = onayMetni;
      zamanlayici = setTimeout(() => { dugme.classList.remove('onay-bekliyor'); dugme.textContent = metin; }, 5000);
      return;
    }
    clearTimeout(zamanlayici);
    dugme.disabled = true;
    try { await fn(); } finally { dugme.disabled = false; dugme.classList.remove('onay-bekliyor'); dugme.textContent = metin; }
  });
  return dugme;
}

/** Form içi genel hata/bilgi kutusu. */
export function mesajKutusu() {
  const kutu = h('div', { role: 'alert', hidden: true });
  return {
    kutu,
    goster(mesaj, tur = 'hata') { kutu.className = `not-kutusu ${tur}`; kutu.textContent = mesaj; kutu.hidden = !mesaj; },
    temizle() { kutu.hidden = true; kutu.textContent = ''; }
  };
}

/** İşlem sürerken düğmeyi kilitler ve metnini değiştirir. */
export async function mesgulIken(dugme, metin, fn) {
  const eski = [...dugme.childNodes]; // ikonlu düğmeler de aynen geri gelsin
  dugme.disabled = true;
  dugme.replaceChildren(h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), metin);
  dugme.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally {
    dugme.disabled = false;
    dugme.replaceChildren(...eski);
    dugme.removeAttribute('aria-busy');
  }
}

/** Geri sayım: her saniye cb(kalan) çağrılır, 0'da biter. Durdurma fonksiyonu döner. */
export function geriSayim(saniye, cb) {
  let kalan = Math.max(0, Math.ceil(saniye));
  cb(kalan);
  if (kalan <= 0) return () => {};
  const z = setInterval(() => {
    kalan -= 1;
    cb(kalan);
    if (kalan <= 0) clearInterval(z);
  }, 1000);
  return () => clearInterval(z);
}

export const tarihMetni = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? String(iso) : t.toLocaleString('tr-TR');
};

export const boyutMetni = (bayt) => {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
  if (bayt < 1024 * 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
  return `${(bayt / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** http(s) adres kontrolü. */
export function adresGecerliMi(metin) {
  try {
    const u = new URL(metin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Boş durum kutusu: ikon + başlık + açıklama (+ isteğe bağlı eylem). */
export function bosDurum(baslik, aciklama, secenekler = {}) {
  return h('div', { class: 'bos-durum', role: secenekler.rol || null },
    h('span', { class: 'bos-ikon' }, ikon(secenekler.ikon || 'pusula')),
    h('strong', {}, baslik), aciklama ? h('p', {}, aciklama) : null, secenekler.eylem || null);
}

/** İskelet yükleyici (ekran okuyucuya "Yükleniyor…" der). tur: 'liste' | 'kartlar' | 'sayfa' */
export function iskelet(tur = 'liste') {
  const cizgiler = tur === 'kartlar'
    ? [h('div', { class: 'iskelet-kartlar' }, h('i', {}), h('i', {}), h('i', {}), h('i', {}), h('i', {}))]
    : tur === 'sayfa'
      ? [h('i', { class: 'yarim' }), h('i', { class: 'uzun' }), h('i', {}), h('i', {}), h('i', { class: 'yarim' })]
      : [h('i', {}), h('i', {}), h('i', { class: 'yarim' })];
  return h('div', { class: 'iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), ...cizgiler);
}

/** Rozet (etiket). tur: vurgu | basari | hata | atlanan | durdu | '' */
export const rozet = (metin, tur = '', ek = {}) => h('span', { class: `rozet ${tur}`.trim(), ...ek }, metin);
