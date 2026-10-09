// AYARLAR KARTLARI — açılır / kapanır başlıklar. Ayarlar sayfalarındaki her kart (".kart" ve ilk çocuğu h3) yalnız başlığıyla görünür;
// başlığa (ya da ▸ düğmesine) tıklayınca açılır. Açılan kartlar bu tarayıcıda hatırlanır (yalnız kolaylık). Kart kapalıyken de görünmesi
// gereken kısa durum ".kart-ozet" sınıfıyla işaretlenir (ör. "Yeni sürüm var"). Kendiliğinden açılır: odak kartın içine gidince
// (ayara götüren bağlantılar) ve kartta hata / uyarı mesajı belirince. Kartlar sonradan yeniden çizilse de (MutationObserver) işlenir.
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
    const baslik = kart.firstElementChild;
    if (!baslik || baslik.tagName !== 'H3') return;
    const ad = (baslik.textContent || '').trim();
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
    baslik.prepend(dugme);
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
  /** @param {ParentNode} kok */
  const tara = (kok) => {
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
