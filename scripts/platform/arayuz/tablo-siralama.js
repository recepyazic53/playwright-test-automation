// TABLO SIRALAMA (tüm tablolar): başlığa tıklayınca artan → azalan → ilk sıra. Sayfaya eklenen her <table> kendiliğinden
// sıralanabilir olur (MutationObserver). Sıralama Türkçe ve sayıya duyarlıdır; "27.09.2026 01:25" gibi tarihleri, "%85" ve
// "1,5 sn" gibi sayıları tanır. Hücrede data-deger varsa o değer kullanılır. Seçim / eylem sütunları (th.secim, th.eylemler,
// içinde form öğesi olan başlıklar) ve data-sirala="yok" olan başlıklar sıralanmaz.
//   - Sayfalı tablolar sıralamayı kendi verisinde yapar: <table data-siralama="veri"> ve olay 'tablo-sirala'
//     (detail: { sutun: başlık metni, anahtar: th[data-sirala-anahtar], yon: 'artan' | 'azalan' | null }). Başlığın aria-sort'unu
//     tablo kendisi çizer (siralamaBasligi yardımcısı).
//   - data-siralama="yok" olan tablolar hiç dokunulmaz. İçinde colspan'li satır (ayrıntı satırı) olan tablolar DOM'da
//     sıralanmaz (satır grupları bozulmasın).
//   - Aynı tablo yeniden çizilince (başlıkları aynıysa) son sıralama yeniden uygulanır.

const siralayici = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
/** @type {Map<string, { sutun: number; yon: 'artan' | 'azalan' }>} */
const durumlar = new Map();

/** Hücrenin sıralama değeri: sayı ya da metin. @param {Element | undefined} td */
function deger(td) {
  if (!td) return '';
  let ham = (td.getAttribute('data-deger') ?? td.textContent ?? '').trim();
  // Metni olmayan form hücreleri (Koşuda anahtarı, satır içi metin kutusu): değeri / işareti.
  if (!ham && !td.hasAttribute('data-deger')) {
    const girdi = td.querySelector('input, select, textarea');
    if (girdi instanceof HTMLInputElement && (girdi.type === 'checkbox' || girdi.type === 'radio')) return girdi.checked ? 1 : 0;
    if (girdi && 'value' in girdi) ham = String(girdi.value).trim();
  }
  const tarih = ham.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (tarih) return Date.UTC(+tarih[3], +tarih[2] - 1, +tarih[1], +(tarih[4] || 0), +(tarih[5] || 0));
  const sayi = ham.replace(/^%/, '').replace(/\s*(sn|ms|dk|sa|%)$/i, '').replace(/\./g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(sayi)) return Number(sayi);
  return ham;
}

/** @param {HTMLTableCellElement} th */
function siralanabilirMi(th) {
  if (th.getAttribute('data-sirala') === 'yok' || th.classList.contains('secim') || th.classList.contains('eylemler')) return false;
  if (th.querySelector('input, select, button:not(.siralama-dugmesi)')) return false;
  return Boolean((th.textContent || '').trim());
}

const tabloAnahtari = (/** @type {HTMLTableElement} */ t) =>
  [t.getAttribute('aria-label') || t.querySelector('caption')?.textContent || '', ...[...t.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim())].join('|');

/** @param {HTMLTableElement} tablo @param {number} sutun @param {'artan' | 'azalan' | null} yon */
function domdaSirala(tablo, sutun, yon) {
  const govde = tablo.tBodies[0];
  if (!govde) return;
  const satirlar = [...govde.rows];
  if (!satirlar.every((r) => r.dataset.ilkSira)) satirlar.forEach((r, i) => { r.dataset.ilkSira = String(i); });
  const sirali = [...satirlar].sort((a, b) => {
    if (!yon) return Number(a.dataset.ilkSira) - Number(b.dataset.ilkSira);
    const x = deger(a.cells[sutun]);
    const y = deger(b.cells[sutun]);
    const f = typeof x === 'number' && typeof y === 'number' ? x - y : siralayici.compare(String(x), String(y));
    return yon === 'artan' ? f : -f;
  });
  govde.append(...sirali);
}

/** Başlıkların aria-sort durumunu çizer. @param {HTMLTableElement} tablo @param {number} sutun @param {'artan' | 'azalan' | null} yon */
function basliklariCiz(tablo, sutun, yon) {
  [...(tablo.tHead?.rows[0]?.cells || [])].forEach((th, i) => {
    if (!th.querySelector('.siralama-dugmesi')) return;
    th.setAttribute('aria-sort', i === sutun && yon ? (yon === 'artan' ? 'ascending' : 'descending') : 'none');
  });
}

/** @param {HTMLTableElement} tablo */
function hazirla(tablo) {
  if (tablo.dataset.siralamaHazir || tablo.getAttribute('data-siralama') === 'yok' || !tablo.tHead) return;
  tablo.dataset.siralamaHazir = '1';
  const veriIle = tablo.getAttribute('data-siralama') === 'veri';
  const domUygun = !veriIle && !tablo.querySelector('tbody td[colspan]');
  if (!veriIle && !domUygun) return;
  const basliklar = [...(tablo.tHead.rows[0]?.cells || [])];
  const anahtar = tabloAnahtari(tablo);
  basliklar.forEach((th, i) => {
    if (!siralanabilirMi(/** @type {HTMLTableCellElement} */ (th))) return;
    const metin = (th.textContent || '').trim();
    const dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.className = 'siralama-dugmesi';
    dugme.title = 'Sırala';
    dugme.append(...th.childNodes);
    const ok = document.createElement('span');
    ok.className = 'siralama-oku';
    ok.setAttribute('aria-hidden', 'true');
    dugme.append(ok);
    th.append(dugme);
    if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none');
    dugme.addEventListener('click', () => {
      const simdiki = th.getAttribute('aria-sort');
      /** @type {'artan' | 'azalan' | null} */
      const yon = simdiki === 'ascending' ? 'azalan' : simdiki === 'descending' ? null : 'artan';
      if (veriIle) {
        tablo.dispatchEvent(new CustomEvent('tablo-sirala', { bubbles: true, detail: { sutun: metin, anahtar: th.getAttribute('data-sirala-anahtar') || metin, yon } }));
        return;
      }
      if (yon) durumlar.set(anahtar, { sutun: i, yon }); else durumlar.delete(anahtar);
      basliklariCiz(tablo, i, yon);
      domdaSirala(tablo, i, yon);
    });
  });
  const onceki = durumlar.get(anahtar);
  if (onceki && domUygun) { basliklariCiz(tablo, onceki.sutun, onceki.yon); domdaSirala(tablo, onceki.sutun, onceki.yon); }
}

let kuruldu = false;
/** Tüm sayfada tabloları sıralanabilir yapar (bir kez kurulur). */
export function tabloSiralamaKur() {
  if (kuruldu) return;
  kuruldu = true;
  const tara = (/** @type {ParentNode} */ kok) => kok.querySelectorAll?.('table').forEach((t) => hazirla(/** @type {HTMLTableElement} */ (t)));
  tara(document);
  new MutationObserver((kayitlar) => {
    for (const k of kayitlar) for (const n of k.addedNodes) {
      if (n instanceof HTMLTableElement) hazirla(n);
      else if (n instanceof Element) tara(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Veriyle sıralayan tablolar için: dizi sıralama (tablo-sirala olayındaki anahtar/yön ile).
 * @template T @param {T[]} dizi @param {(x: T) => unknown} alan @param {'artan' | 'azalan' | null} yon
 */
export function veriyiSirala(dizi, alan, yon) {
  if (!yon) return dizi;
  return [...dizi].sort((a, b) => {
    const x = alan(a);
    const y = alan(b);
    const f = typeof x === 'number' && typeof y === 'number' ? x - y : siralayici.compare(String(x ?? ''), String(y ?? ''));
    return yon === 'artan' ? f : -f;
  });
}
