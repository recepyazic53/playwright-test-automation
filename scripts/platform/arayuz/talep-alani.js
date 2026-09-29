// "Talep no" alanı (ekran senaryosu, servis senaryosu, akış senaryosu ve uçtan uca akış formlarında başlığın yanında; isteğe bağlı).
// Bir senaryoya birden çok talep yazılır; her talep bir çiptir (× ile kaldırılır). Yazarken projede daha önce girilmiş talepler önerilir
// (GET /platform/talepler; temaya uygun öneri listesi — ortak.js > oneriListesi). Yazım farkını önleme (talepler.mjs > benzerTalep):
// aynı talep farklı büyük / küçük harfle yazılırsa projedeki yazım kullanılır; yalnız harf / rakam dışı işaretleri farklıysa
// ("Talep 101" / "TALEP-101") "Benzer talep var" notu ve "… kullan" düğmesi çıkar. Talep serbest metindir; baştaki ve sondaki boşluklar
// kırpılır. Enter ya da virgül çipi ekler; kaydederken alanda kalan yazı da eklenir. Kullanıcı verisi DOM'a yalnız metin olarak yazılır.
import { api, h, ikon, oneriListesi, yeniKimlik } from './ortak.js';
import { TALEP_EN_COK, TALEP_EN_UZUN, benzerTalep, talepEslesir, talepKucuk, talepTemizle } from './talepler.mjs';

/**
 * @param {{ projeId: string; degerler?: string[]; degisti?: () => void; sinif?: string }} s
 *   sinif: dış kabın sınıfı (senaryo formu 'model-alani genis', diğer formlar 'alan').
 * @returns {{ el: HTMLElement; degerler: () => string[]; girdi: HTMLInputElement }}
 */
export function talepAlani(s) {
  /** @type {string[]} */
  let talepler = [...(s.degerler ?? [])];
  /** @type {string[]} projedeki talepler (öneri listesi) */
  let oneriler = [];
  const id = yeniKimlik('talep');
  const girdi = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text', id, maxlength: String(TALEP_EN_UZUN), autocomplete: 'off', spellcheck: 'false', placeholder: 'ör. TALEP-101 — Enter ile ekleyin',
    'aria-describedby': `${id}-yardim ${id}-hata`
  }));
  const cipler = h('ul', { class: 'talep-cipleri', 'aria-label': 'Eklenen talepler' });
  const not = h('div', { class: 'talep-notu', 'aria-live': 'polite' });
  const hata = h('div', { class: 'alan-hatasi', id: `${id}-hata`, role: 'alert' });
  const degisti = () => { if (typeof s.degisti === 'function') s.degisti(); };

  const ciz = () => {
    cipler.replaceChildren(...talepler.map((t) => h('li', { class: 'talep-cipi' },
      h('span', { class: 'talep-cipi-metni', title: t }, t),
      h('button', { type: 'button', class: 'talep-cipi-kaldir', 'aria-label': `Talebi kaldır: ${t}`, title: 'Kaldır', onclick: () => kaldir(t) }, ikon('carpi')))));
    cipler.hidden = !talepler.length;
  };
  /** @param {string} t */
  const kaldir = (t) => {
    talepler = talepler.filter((x) => talepKucuk(x) !== talepKucuk(t));
    not.replaceChildren();
    ciz();
    degisti();
    girdi.focus();
  };
  /** Yazılanı çip yapar. @returns {boolean} eklendi mi (ya da zaten vardı) */
  const ekle = (/** @type {string} */ ham) => {
    hata.textContent = '';
    const { talep, hata: h1 } = talepTemizle(ham);
    if (h1) { hata.textContent = h1; return false; }
    if (!talep) return true;
    const b = benzerTalep(talep, oneriler);
    const yazim = b && b.tur === 'ayni' ? b.talep : talep;
    girdi.value = '';
    if (talepEslesir(talepler, yazim)) { not.replaceChildren(h('span', { class: 'soluk' }, `"${yazim}" zaten ekli.`)); return true; }
    if (talepler.length >= TALEP_EN_COK) { hata.textContent = `Bir senaryoda en çok ${TALEP_EN_COK} talep olabilir.`; return false; }
    talepler.push(yazim);
    not.replaceChildren();
    if (b && b.tur === 'ayni' && b.talep !== talep) not.replaceChildren(h('span', { class: 'soluk' }, `Projedeki yazım kullanıldı: "${b.talep}".`));
    if (b && b.tur === 'benzer') {
      // Yalnız işaret / boşluk farkı: projedeki yazımı kullanmak tek tıkla (yazılan olduğu gibi de kalabilir).
      not.replaceChildren(h('span', { class: 'talep-benzer' }, ikon('uyari'), ` Benzer talep var: "${b.talep}". `,
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          talepler = talepler.map((x) => (x === yazim ? b.talep : x)).filter((x, i, l) => l.findIndex((y) => talepKucuk(y) === talepKucuk(x)) === i);
          not.replaceChildren(h('span', { class: 'soluk' }, `"${b.talep}" kullanıldı.`));
          ciz();
          degisti();
        } }, `"${b.talep}" kullan`)));
    }
    ciz();
    degisti();
    return true;
  };

  oneriListesi(girdi, () => oneriler.filter((t) => !talepEslesir(talepler, t)));
  // Öneriden seçim (ya da alandan çıkma) çip ekler.
  girdi.addEventListener('change', () => { if (girdi.value.trim()) ekle(girdi.value); });
  girdi.addEventListener('keydown', (o) => {
    if (o.defaultPrevented) return;
    if (o.key === 'Enter' || o.key === ',') {
      if (!girdi.value.trim()) { if (o.key === ',') o.preventDefault(); return; }
      o.preventDefault();
      ekle(girdi.value);
    } else if (o.key === 'Backspace' && !girdi.value && talepler.length) {
      kaldir(talepler[talepler.length - 1]);
    }
  });
  girdi.addEventListener('input', () => { hata.textContent = ''; if (girdi.value.includes(',')) { for (const p of girdi.value.split(',')) if (p.trim()) ekle(p); girdi.value = ''; } });
  api(`/platform/talepler?projeId=${encodeURIComponent(s.projeId)}`).then((y) => { oneriler = (y.talepler || []).map((x) => x.talep); }).catch(() => { oneriler = []; });
  ciz();

  const el = h('div', { class: `${s.sinif || 'alan'} talep-alani` },
    h('div', { class: 'alan-ust' }, h('label', { for: id }, 'Talep no', h('span', { class: 'soluk' }, ' (isteğe bağlı)'))),
    h('div', { class: 'talep-kutusu', onclick: (/** @type {MouseEvent} */ o) => { if (o.target === o.currentTarget) girdi.focus(); } }, cipler, girdi),
    h('div', { class: 'yardim', id: `${id}-yardim` }, 'Bu senaryonun karşıladığı talep numaraları (serbest metin; birden çok olabilir). Sonuçlar > Raporlar > Kapsam matrisi ve listelerdeki "Talep" süzgeci bunları kullanır.'),
    not, hata);
  return {
    el, girdi,
    // Alanda kalan (Enter'a basılmamış) yazı da kaydedilir.
    degerler: () => {
      const { talep } = talepTemizle(girdi.value);
      if (!talep) return [...talepler];
      const b = benzerTalep(talep, oneriler);
      const yazim = b && b.tur === 'ayni' ? b.talep : talep;
      return talepEslesir(talepler, yazim) ? [...talepler] : [...talepler, yazim];
    }
  };
}
