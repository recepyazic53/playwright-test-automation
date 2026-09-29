// ARANABİLİR SEÇİM (tüm uzun açılır listeler): seçenek sayısı eşiğin (Ayarlar > Arayüz > "Aranabilir liste eşiği"; varsayılan 15)
// üstündeki her <select>, tıklanınca ya da odaktayken yazılınca tarayıcının uzun listesi yerine yazarak aranan bir liste açar.
//   - Değer her zaman ALTTAKİ GERÇEK <select>'te durur: seçim select'e yazılır, input + change olayları yayınlanır. Select yerinde,
//     görünür ve erişilebilirlik ağacında kalır (etiketi, rolü, değeri, Playwright selectOption'ı değişmez); bileşen yalnızca açılan
//     arama penceresidir ve kapanınca DOM'dan kalkar. Seçenekler her açılışta select'ten okunur: bağımlı listeler, "Tablodan"
//     seçenekleri ve yeniden çizilen formlar ek iş gerektirmez; açıkken seçenekler değişirse liste yenilenir.
//   - WAI-ARIA combobox + listbox: arama kutusu role=combobox (aria-expanded, aria-controls, aria-activedescendant), liste
//     role=listbox, satırlar role=option. ↑ / ↓ gezer, Enter seçer, Esc kapatır (select'e döner), Tab çıkar.
//   - Süzme: içerir; Türkçe büyük / küçük harf duyarsız (İ/i/I/ı birbirine denk). En çok EN_COK_CIZIM eşleşme çizilir.
//   - Kısa listeler, çoklu seçim (multiple / size > 1), kapalı select ve data-aranabilir="hayir" olanlar olağan select kalır.
import { h, kullaniciAyarlari, yeniKimlik } from './ortak.js';

/** Eşiğin varsayılanı (Ayarlar > Arayüz'deki ayarın varsayılanıyla aynı). */
export const VARSAYILAN_ESIK = 15;
/** Listede aynı anda çizilen en çok eşleşme (2000+ seçenekte de akıcı kalsın diye). */
export const EN_COK_CIZIM = 200;

let esik = VARSAYILAN_ESIK;
let sonTazeleme = 0;
/** Eşiği kullanıcı ayarından tazeler (önbellekli; Ayarlar kaydedilince ortak önbellek boşalır, burada en çok 2 sn'de bir sorulur). */
function esigiTazele() {
  const simdi = Date.now();
  if (simdi - sonTazeleme < 2000) return;
  sonTazeleme = simdi;
  kullaniciAyarlari().then((a) => {
    const n = /** @type {Record<string, unknown>} */ (a).aranabilirSecimEsigi;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) esik = n;
  }).catch(() => { /* ayar okunamazsa varsayılan kalır */ });
}

/** Arama için metin: Türkçe küçük harf; noktasız ı, i'ye denk (büyük harfli kod listelerinde "ISTANBUL" = "istanbul"). @param {string} x */
export const aramaMetni = (x) => String(x).toLocaleLowerCase('tr').replace(/ı/g, 'i');

/** Değeri boş olmayan seçenek sayısı ("Seçin…" gibi yer tutucular sayılmaz). @param {HTMLSelectElement} sel */
const secenekSayisi = (sel) => {
  let n = 0;
  for (const o of sel.options) if (o.value !== '') n += 1;
  return n;
};

/** Bu select aranabilir listeyle açılır mı? @param {EventTarget | null} el @returns {el is HTMLSelectElement} */
export function aranabilirMi(el) {
  return el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled && el.dataset.aranabilir !== 'hayir'
    && secenekSayisi(el) > esik;
}

/** Alanın okunur adı (etiket → aria-label → title). @param {HTMLSelectElement} sel */
function alanAdi(sel) {
  const etiket = sel.labels && sel.labels[0] ? sel.labels[0].textContent : '';
  const ad = (etiket || sel.getAttribute('aria-label') || sel.title || '').replace(/\s*\(zorunlu\)\s*/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  return ad || 'Seçim';
}

/** @typedef {{ indeks: number; metin: string; kucuk: string; grup: string; kapali: boolean; bos: boolean }} Oge */

/** Açık pencere (aynı anda tek). @type {null | { select: HTMLSelectElement; kapat: (odak: boolean) => void }} */
let acik = null;

/**
 * Select için arama penceresini açar. ilkMetin: odaktayken basılan harf (aramaya yazılır).
 * @param {HTMLSelectElement} select @param {string} ilkMetin
 */
export function aramaPenceresiniAc(select, ilkMetin = '') {
  if (acik) acik.kapat(false);
  const ad = alanAdi(select);
  const listeId = yeniKimlik('aranabilir');
  const girdi = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text', class: 'aranabilir-girdi', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': listeId,
    'aria-label': `${ad}: yazarak arayın`, placeholder: 'Yazarak arayın…', autocomplete: 'off', spellcheck: 'false', value: ilkMetin
  }));
  const durum = h('div', { class: 'aranabilir-durum', role: 'status', 'aria-live': 'polite' });
  const liste = h('div', { class: 'aranabilir-liste', role: 'listbox', id: listeId, 'aria-label': ad });
  const not = h('div', { class: 'aranabilir-not', hidden: true });
  const pencere = h('div', { class: 'aranabilir-pencere', 'data-aranabilir-pencere': '' }, girdi, durum, liste, not);

  /** @type {Oge[]} */
  let ogeler = [];
  /** @type {Oge[]} */
  let gorunen = [];
  let aktif = -1;
  const ogeleriOku = () => {
    ogeler = [...select.options].map((o, indeks) => ({
      indeks, metin: o.text, kucuk: aramaMetni(o.text), grup: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : '',
      kapali: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled), bos: o.value === ''
    })).filter((x) => !select.options[x.indeks].hidden);
  };

  /** Metni eşleşen kısmı <mark> ile vurgulanmış hâlde ekler. @param {HTMLElement} el @param {Oge} x @param {string} ara */
  const metinYaz = (el, x, ara) => {
    const i = ara ? x.kucuk.indexOf(ara) : -1;
    // Küçük harfe çevirme uzunluğu değiştirdiyse (nadir) vurgu yapılmaz; süzme yine doğrudur.
    if (i < 0 || x.kucuk.length !== x.metin.length) { el.textContent = x.metin; return; }
    el.append(x.metin.slice(0, i), h('mark', {}, x.metin.slice(i, i + ara.length)), x.metin.slice(i + ara.length));
  };

  const aktifYap = (/** @type {number} */ yeni) => {
    const eski = liste.querySelector('.aranabilir-secenek.aktif');
    if (eski) { eski.classList.remove('aktif'); eski.setAttribute('aria-selected', 'false'); }
    aktif = yeni;
    const el = aktif >= 0 ? document.getElementById(`${listeId}-${aktif}`) : null;
    if (!el) { girdi.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('aktif');
    el.setAttribute('aria-selected', 'true');
    girdi.setAttribute('aria-activedescendant', el.id);
    // Sayfa kaydırılmadan yalnız liste kaydırılır.
    if (el.offsetTop < liste.scrollTop) liste.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > liste.scrollTop + liste.clientHeight) liste.scrollTop = el.offsetTop + el.offsetHeight - liste.clientHeight;
  };

  const ciz = (/** @type {boolean} */ ilkAcilis) => {
    const ara = aramaMetni(girdi.value.trim());
    const eslesen = ara ? ogeler.filter((x) => x.kucuk.includes(ara)) : ogeler;
    // Aramasız açılışta seçili değer ilk EN_COK_CIZIM'in dışındaysa pencere onu içine alacak biçimde kaydırılır.
    const seciliYer = !ara ? eslesen.findIndex((x) => x.indeks === select.selectedIndex) : -1;
    const bas = seciliYer >= EN_COK_CIZIM ? Math.max(0, Math.min(seciliYer - Math.floor(EN_COK_CIZIM / 2), eslesen.length - EN_COK_CIZIM)) : 0;
    gorunen = eslesen.slice(bas, bas + EN_COK_CIZIM);
    const parca = document.createDocumentFragment();
    let grup = '';
    gorunen.forEach((x, i) => {
      if (x.grup && x.grup !== grup) parca.append(h('div', { class: 'aranabilir-grup', role: 'presentation', 'aria-hidden': 'true' }, x.grup));
      grup = x.grup;
      const el = h('div', {
        class: `aranabilir-secenek${x.indeks === select.selectedIndex ? ' secili' : ''}${x.kapali ? ' kapali' : ''}`, role: 'option', id: `${listeId}-${i}`,
        'aria-selected': 'false', 'aria-disabled': x.kapali ? 'true' : null, 'data-indeks': String(x.indeks)
      });
      metinYaz(el, x, ara);
      parca.append(el);
    });
    liste.replaceChildren(parca);
    liste.scrollTop = 0;
    // Sayıya yer tutucu (değeri boş seçenek, ör. "Seçin…") girmez.
    const sayi = eslesen.reduce((n, x) => n + (x.bos ? 0 : 1), 0);
    durum.textContent = !sayi ? 'Sonuç yok' : ara ? `${sayi} sonuç` : `${sayi} seçenek`;
    durum.classList.toggle('bos', !sayi);
    not.hidden = eslesen.length <= EN_COK_CIZIM;
    not.textContent = not.hidden ? '' : `${sayi} sonuçtan ${EN_COK_CIZIM} tanesi gösteriliyor; daha fazlası için yazmaya devam edin.`;
    // Açılışta seçili değer, yazınca ilk seçilebilir eşleşme etkin olur (Enter hemen seçer).
    const seciliSira = ilkAcilis && !ara ? gorunen.findIndex((x) => x.indeks === select.selectedIndex) : -1;
    aktifYap(seciliSira >= 0 ? seciliSira : gorunen.findIndex((x) => !x.kapali));
    konumla();
  };

  // Konum: select'in altında (yer yoksa üstünde), pencere içinde; genişlik en az 260 px, ekrandan taşmaz.
  const konumla = () => {
    if (!select.isConnected) { kapat(false); return; }
    const r = select.getBoundingClientRect();
    const pay = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const genislik = Math.min(Math.max(r.width, 260), vw - pay * 2);
    const sol = Math.min(Math.max(r.left, pay), vw - pay - genislik);
    const alt = vh - r.bottom - pay - 4;
    const ust = r.top - pay - 4;
    const ek = pencere.offsetHeight - liste.offsetHeight;
    const istenen = ek + Math.min(liste.scrollHeight, 300);
    const yukari = alt < istenen && ust > alt;
    const yer = Math.max((yukari ? ust : alt), 120);
    liste.style.maxHeight = `${Math.max(Math.min(300, yer - ek), 60)}px`;
    Object.assign(pencere.style, { left: `${sol}px`, width: `${genislik}px` });
    if (yukari) { pencere.style.top = ''; pencere.style.bottom = `${vh - r.top + 4}px`; } else { pencere.style.bottom = ''; pencere.style.top = `${r.bottom + 4}px`; }
    pencere.classList.toggle('yukari', yukari);
  };
  const kaydirinca = (/** @type {Event} */ o) => { if (o.target !== liste) konumla(); };

  // Form yeniden çizilip select kaldırılırsa (bağımlı liste) pencere kapanır; açıkken seçenekleri değişirse liste yenilenir.
  const gozlemci = new MutationObserver((kayitlar) => {
    if (!select.isConnected) { kapat(false); return; }
    if (kayitlar.some((k) => select.contains(k.target))) { ogeleriOku(); ciz(false); }
  });

  const sec = (/** @type {number} */ indeks) => {
    const o = select.options[indeks];
    if (!o || o.disabled) return;
    const degisti = select.selectedIndex !== indeks;
    const id = select.id;
    kapat(false);
    select.selectedIndex = indeks;
    if (degisti) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Değişiklik formu yeniden çizdiyse odak aynı kimlikli yeni select'e gider.
    const hedef = select.isConnected ? select : (id ? document.getElementById(id) : null);
    if (hedef) hedef.focus();
  };

  function kapat(/** @type {boolean} */ odak) {
    if (!acik || acik.select !== select) return;
    acik = null;
    gozlemci.disconnect();
    window.removeEventListener('scroll', kaydirinca, true);
    window.removeEventListener('resize', konumla);
    select.removeAttribute('aria-expanded');
    pencere.remove();
    if (odak && select.isConnected) select.focus();
  }

  girdi.addEventListener('input', () => ciz(false));
  girdi.addEventListener('keydown', (o) => {
    if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
      o.preventDefault();
      // Kapalı (disabled) seçenekler atlanır; ucunda durulur.
      const adim = o.key === 'ArrowDown' ? 1 : -1;
      for (let i = aktif + adim; i >= 0 && i < gorunen.length; i += adim) {
        if (!gorunen[i].kapali) { aktifYap(i); break; }
      }
    } else if (o.key === 'Enter') {
      o.preventDefault();
      if (aktif >= 0 && gorunen[aktif]) sec(gorunen[aktif].indeks);
    } else if (o.key === 'Escape') {
      // Diyalog içindeyse diyaloğu kapatmaz.
      o.preventDefault();
      o.stopPropagation();
      kapat(true);
    } else if (o.key === 'Tab') {
      // Odak select'e döner; tarayıcının Tab'ı oradan sonraki (ya da önceki) öğeye geçer.
      kapat(true);
    }
  });
  liste.addEventListener('mousedown', (o) => {
    o.preventDefault(); // odak arama kutusunda kalır
    const el = o.target instanceof Element ? o.target.closest('.aranabilir-secenek') : null;
    if (el instanceof HTMLElement && el.getAttribute('aria-disabled') !== 'true') sec(Number(el.dataset.indeks));
  });
  pencere.addEventListener('focusout', (o) => {
    if (!(o.relatedTarget instanceof Node && pencere.contains(o.relatedTarget))) kapat(false);
  });

  acik = { select, kapat };
  ogeleriOku();
  (select.closest('dialog') || document.body).append(pencere);
  select.setAttribute('aria-expanded', 'true');
  ciz(true);
  gozlemci.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'hidden'], characterData: true });
  window.addEventListener('scroll', kaydirinca, true);
  window.addEventListener('resize', konumla);
  girdi.focus();
  const son = girdi.value.length;
  girdi.setSelectionRange(son, son);
  return pencere;
}

let kuruldu = false;
/** Belge düzeyinde bir kez kurulur (uygulama.js): uzun select'lerde tıklama ve klavye arama penceresini açar. */
export function aranabilirSecimKur() {
  if (kuruldu) return;
  kuruldu = true;
  esigiTazele();
  const tazele = (/** @type {Event} */ o) => { if (o.target instanceof HTMLSelectElement) esigiTazele(); };
  document.addEventListener('focusin', tazele, true);
  document.addEventListener('pointerover', tazele, true);
  document.addEventListener('mousedown', (o) => {
    if (o.button !== 0 || !aranabilirMi(o.target)) return;
    o.preventDefault(); // tarayıcının kendi uzun listesi açılmasın
    const sel = o.target;
    if (acik && acik.select === sel) acik.kapat(true);
    else aramaPenceresiniAc(sel);
  }, true);
  document.addEventListener('keydown', (o) => {
    if (!aranabilirMi(o.target) || (acik && acik.select === o.target)) return;
    const sel = o.target;
    const harf = o.key.length === 1 && o.key !== ' ' && !o.ctrlKey && !o.metaKey && !o.altKey;
    const acan = ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(o.key) && !o.ctrlKey && !o.metaKey;
    if (!harf && !acan) return;
    o.preventDefault();
    aramaPenceresiniAc(sel, harf ? o.key : '');
  }, true);
}
