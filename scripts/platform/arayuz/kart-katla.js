// AYARLAR KARTLARI — açılır / kapanır başlıklar. Ayarlar sayfalarındaki her kart (".kart" ve ilk çocuğu h3) yalnız başlığıyla görünür;
// başlığa (ya da ▸ düğmesine) tıklayınca açılır. Açılan kartlar bu tarayıcıda hatırlanır (yalnız kolaylık). Kart kapalıyken de görünmesi
// gereken kısa durum ".kart-ozet" sınıfıyla işaretlenir (ör. "Yeni sürüm var"). Kendiliğinden açılır: odak kartın içine gidince
// (ayara götüren bağlantılar) ve kartta hata / uyarı mesajı belirince. Kartlar sonradan yeniden çizilse de (MutationObserver) işlenir.
// Bölüm başlığı (".bolum-basligi": başlık, sayı ve "Ortam ekle" gibi düğme) kutunun DIŞINDAYSA kendi kutusuna alınır: ardından gelen
// kart varsa başlık onun en üstüne taşınır, yoksa başlık ve ardındaki öğeler (bir sonraki bölüm başlığına / bölüme kadar) yeni bir
// ".kart.bolum-kutusu" içine alınır. Böylece her bölüm tek kutudur: başlık solda, düğmesi aynı satırda sağda.
// Otomasyonla açılan tarayıcıda (navigator.webdriver; koruma testleri) kartlar açık başlar; "nobetci.ayarKartlariVarsayilan" =
// "kapali" bunu ezer (bu davranışın kendi testi için).
import { h, ikon } from './ortak.js';

const ACIK_ANAHTARI = 'nobetci.acikAyarKartlari';
const VARSAYILAN_ANAHTARI = 'nobetci.ayarKartlariVarsayilan';

/** @returns {Set<string>} */
function acikKartlar() {
  try { return new Set(JSON.parse(localStorage.getItem(ACIK_ANAHTARI) || '[]')); } catch { return new Set(); }
}
/** @param {string} anahtar @param {boolean} acik */
function hatirla(anahtar, acik) {
  const s = acikKartlar();
  if (acik) s.add(anahtar); else s.delete(anahtar);
  try { localStorage.setItem(ACIK_ANAHTARI, JSON.stringify([...s].slice(-300))); } catch { /* depolama kapalı */ }
}
/** Kayıt yokken kart açık mı başlasın (yalnız otomasyonda; kullanıcıda kapalı). */
function varsayilanAcik() {
  try { if (localStorage.getItem(VARSAYILAN_ANAHTARI) === 'kapali') return false; } catch { /* yok sayılır */ }
  return Boolean(navigator.webdriver);
}

/**
 * Kapsayıcıdaki (ve sonradan eklenen) kartları açılır / kapanır yapar.
 * @param {HTMLElement} kapsayici @param {string} bolum anahtar öneki (Ayarlar bölümü)
 * @returns {() => void} gözlemi durdurur
 */
export function kartlariKatlanirYap(kapsayici, bolum) {
  const varsayilan = varsayilanAcik();
  /** @param {Element} kart */
  const isle = (kart) => {
    if (!(kart instanceof HTMLElement) || kart.dataset.katlanir || kart.closest('dialog')) return;
    // Bir düğmeyle açılan ekleme / düzenleme formları katlanmaz (açılınca hep açık).
    if (kart.classList.contains('form-paneli') || kart.closest('.kayit-duzenleme, .entegrasyon-form-alani, .zamanlama-form-alani, .ortak-akis-alani')) return;
    const baslik = kart.firstElementChild;
    // Başlık: kartın ilk çocuğu h3 ya da içinde h3 olan bölüm başlığı satırı.
    const h3 = baslik && baslik.tagName === 'H3' ? baslik : baslik && baslik.classList.contains('bolum-basligi') ? baslik.querySelector('h3') : null;
    if (!baslik || !h3) return;
    const ad = (h3.textContent || '').trim();
    if (!ad) return;
    kart.dataset.katlanir = '1';
    kart.classList.add('katlanir');
    const anahtar = `${bolum}:${ad}`;
    const kayit = acikKartlar();
    const dugme = h('button', { type: 'button', class: 'kart-katla-dugmesi', 'aria-label': `${ad}: aç / kapat` }, ikon('asagi'));
    const ayarla = (/** @type {boolean} */ acik, /** @type {boolean} */ kaydet) => {
      kart.classList.toggle('kapali', !acik);
      dugme.setAttribute('aria-expanded', acik ? 'true' : 'false');
      if (kaydet) hatirla(anahtar, acik);
    };
    h3.prepend(dugme);
    baslik.classList.add('kart-katla-basligi');
    baslik.addEventListener('click', (o) => {
      const hedef = /** @type {HTMLElement} */ (o.target);
      // Başlıktaki başka düğme / bağlantı (ör. "?" ipucu) kendi işini yapar.
      if (hedef.closest('a, button, input, select, textarea') && hedef.closest('.kart-katla-dugmesi') !== dugme) return;
      ayarla(kart.classList.contains('kapali'), true);
    });
    ayarla(kayit.has(anahtar) || varsayilan, false);
    // Odak içeri gelince (ayara götüren bağlantı, klavye) ya da hata / uyarı belirince açılır.
    kart.addEventListener('focusin', (o) => { if (kart.classList.contains('kapali') && o.target !== dugme) ayarla(true, false); });
  };
  /** Kutunun dışındaki bölüm başlığını kendi kutusuna alır. @param {Element} b */
  const kutula = (b) => {
    if (!(b instanceof HTMLElement) || b.closest('.kart, dialog') || !b.parentElement) return;
    // Başlığın hemen ardındaki (gizli yardım paneli atlanarak) kart: başlık onun en üstüne.
    let x = b.nextElementSibling;
    /** @type {Element[]} */
    const yardimlar = [];
    while (x && x.matches('.yardim-paneli')) { yardimlar.push(x); x = x.nextElementSibling; }
    if (x && x.matches('.kart')) { x.prepend(b, ...yardimlar); return; }
    // Yoksa: başlık ve ardındaki öğeler (sonraki bölüm başlığına, bölüme ya da karta kadar) yeni kutuda.
    const kutu = h('div', { class: 'kart bolum-kutusu' });
    b.parentElement.insertBefore(kutu, b);
    /** @type {Element[]} */
    const tasinacak = [b];
    for (let y = b.nextElementSibling; y && !y.matches('.bolum-basligi, section, .kart'); y = y.nextElementSibling) tasinacak.push(y);
    kutu.append(...tasinacak);
  };
  /** @param {ParentNode} kok */
  const tara = (kok) => {
    if (kok instanceof HTMLElement && kok.matches('.bolum-basligi')) kutula(kok);
    for (const b of kok.querySelectorAll('.bolum-basligi')) kutula(b);
    if (kok instanceof HTMLElement && kok.matches('.kart')) isle(kok);
    for (const k of kok.querySelectorAll('.kart')) isle(k);
  };
  /** Kapalı kartta görünür hale gelen hata / uyarı → kart açılır. @param {Node} n */
  const uyariVarsaAc = (n) => {
    const el = n instanceof HTMLElement ? n : n.parentElement;
    const kart = el && /** @type {HTMLElement | null} */ (el.closest('.kart.katlanir.kapali'));
    if (!kart || !el) return;
    const uyari = el.closest('[role="alert"], .not-kutusu.hata');
    if (uyari && (uyari.textContent || '').trim() && !uyari.closest('.kart-ozet')) {
      kart.classList.remove('kapali');
      kart.querySelector('.kart-katla-dugmesi')?.setAttribute('aria-expanded', 'true');
    }
  };
  tara(kapsayici);
  const gozlem = new MutationObserver((kayitlar) => {
    for (const k of kayitlar) {
      for (const n of k.addedNodes) { if (n instanceof HTMLElement) tara(n); uyariVarsaAc(n); }
      if (k.type === 'characterData') uyariVarsaAc(k.target);
    }
  });
  gozlem.observe(kapsayici, { childList: true, subtree: true, characterData: true });
  return () => gozlem.disconnect();
}
