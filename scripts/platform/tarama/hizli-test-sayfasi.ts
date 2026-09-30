// HIZLI TEST — SAYFA İÇİ fonksiyonlar (hizli-test-motoru.ts page.evaluate ile verir). Tarayıcıda çalışırlar; bu yüzden her fonksiyon
// KENDİ İÇİNDE bağımsızdır (dış değişkene / import'a erişmez, yalnız tip import edilir). Hiçbiri tıklamaz, yazmaz, odaklamaz; seçme
// şeridi yalnız kullanıcının tıklamasını YAKALAR (sayfaya iletmez).
//   hizliMetinleriTopla  görünen metin blokları (kendi metni olan en dıştaki öğe; düğme / bağlantı / form alanı / etiket metni hariç) ve
//                        türü: hata / uyarı kutusu (role=alert, hata sınıfı), bekleme (spinner, progressbar, aria-busy, "…yükleniyor"),
//                        başarı kutusu, sıradan metin. Alan DEĞERİ okunmaz.
//   beklemeDurumu        sayfada şu an görünen bekleme göstergesi var mı + görünen bekleme metinleri.
//   hizliSecimSeridiKur  "Başka düğmeye bas": sayfanın üstünde Nöbetçi şeridi; kullanıcının tıkladığı öğe (tıklama sayfaya İLETİLMEZ)
//                        window.__nobetciOgeBilgisi ile seçici adaylarına çevrilip köprüyle motora gider. Esc / Vazgeç iptal eder.
import type { SeciciAdayi } from './oge-secme-paneli';

type Tur = 'hata' | 'bekleme' | 'basari' | 'normal';

export function hizliMetinleriTopla(ayar: { kaliplar: Record<string, string>; enCok: number }): Array<{ metin: string; tur: Tur }> {
  const k = (ad: string): RegExp => new RegExp(ayar.kaliplar[ad], 'i');
  const katla = (m: string | null | undefined): string => (m ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/̇/g, '').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, ' ').trim();
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const gorunur = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cv = (e as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility;
    if (typeof cv === 'function') return cv.call(e, { checkVisibilityCSS: true });
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const siniflar = (e: Element): string[] => [...e.classList].map((c) => c.toLowerCase());
  const turu = (e: Element, m: string): Tur => {
    let a: Element | null = e;
    for (let i = 0; a && i < 5; a = a.parentElement, i++) {
      const cls = siniflar(a);
      const rol = (a.getAttribute('role') ?? '').toLowerCase();
      if (rol === 'alert' || rol === 'alertdialog' || cls.some((c) => k('alanHataSinifi').test(c) || (k('hataSinifi').test(c) && !/^(is|has|was|needs)-/.test(c)))) return 'hata';
      if (rol === 'progressbar' || a.getAttribute('aria-busy') === 'true' || cls.some((c) => k('beklemeSinifi').test(c))) return 'bekleme';
      if (cls.some((c) => k('basariSinifi').test(c) && !/^(is|has)-/.test(c))) return 'basari';
    }
    return k('beklemeMetni').test(katla(m)) ? 'bekleme' : 'normal';
  };
  const ATLA = 'script, style, noscript, template, svg, button, a, label, legend, select, option, textarea, [role="button"], [id^="nobetci"]';
  const alinan = new Set<Element>();
  const gorulen = new Set<string>();
  const sonuc: Array<{ metin: string; tur: Tur }> = [];
  for (const e of Array.from(document.body.querySelectorAll('*')).slice(0, 8000)) {
    if (sonuc.length >= ayar.enCok) break;
    if (e.closest(ATLA)) continue;
    // Üst öğesi alınmışsa metni zaten o bloğun içindedir.
    let ust = e.parentElement;
    let altinda = false;
    for (; ust; ust = ust.parentElement) if (alinan.has(ust)) { altinda = true; break; }
    if (altinda) continue;
    const kendi = bosluk([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    if (!kendi || !gorunur(e)) continue;
    const m = bosluk((e as HTMLElement).innerText || e.textContent).slice(0, 200);
    if (!m) continue;
    alinan.add(e);
    if (gorulen.has(m)) continue;
    gorulen.add(m);
    sonuc.push({ metin: m, tur: turu(e, m) });
  }
  return sonuc;
}

export function beklemeDurumu(ayar: { kaliplar: Record<string, string> }): { bekliyor: boolean; metinler: string[] } {
  const k = (ad: string): RegExp => new RegExp(ayar.kaliplar[ad], 'i');
  const katla = (m: string | null | undefined): string => (m ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/̇/g, '').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, ' ').trim();
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const gorunur = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
  };
  let bekliyor = false;
  const metinler = new Set<string>();
  for (const e of Array.from(document.body.querySelectorAll('*')).slice(0, 8000)) {
    if (e.closest('[id^="nobetci"], script, style, noscript, template')) continue;
    const rol = (e.getAttribute('role') ?? '').toLowerCase();
    const cls = [...e.classList].map((c) => c.toLowerCase());
    const gosterge = rol === 'progressbar' || e.getAttribute('aria-busy') === 'true' || cls.some((c) => k('beklemeSinifi').test(c));
    const kendi = bosluk([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    const metinli = Boolean(kendi) && k('beklemeMetni').test(katla(kendi));
    if (!gosterge && !metinli) continue;
    if (!gorunur(e)) continue;
    bekliyor = true;
    const m = bosluk((e as HTMLElement).innerText || e.textContent).slice(0, 200);
    if (m) metinler.add(m);
  }
  return { bekliyor, metinler: [...metinler] };
}

export function hizliSecimSeridiKur(ayar: { kopru: string; kimlik: string; isaret: string }): void {
  const w = window as unknown as Record<string, unknown>;
  if (document.getElementById(ayar.kimlik)) return;
  type Kopru = (veri: Record<string, unknown>) => Promise<unknown>;
  const kopru = (veri: Record<string, unknown>): void => {
    const f = w[ayar.kopru];
    if (typeof f === 'function') void (f as Kopru)(veri).catch(() => undefined);
  };
  const host = document.createElement('div');
  host.id = ayar.kimlik;
  host.setAttribute('style', 'all: initial; position: fixed; left: 50%; top: 12px; transform: translateX(-50%); z-index: 2147483647;');
  const kok = host.attachShadow({ mode: 'open' });
  kok.innerHTML = `<style>
    .p { box-sizing: border-box; max-width: calc(100vw - 24px); display: flex; gap: 10px; align-items: center; padding: 8px 12px;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6edf3; background: #0f1720; border: 1px solid #3fb8af;
      border-radius: 10px; box-shadow: 0 10px 28px rgba(0,0,0,.4); }
    button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #2a3a4a; background: #16212c; color: #e6edf3; padding: 4px 10px; }
  </style><div class="p" role="dialog" aria-label="Nöbetçi düğme seçme"><b>Nöbetçi</b><span>Basılacak düğmeye tıklayın (tıklama sayfaya iletilmez).</span>
  <button type="button" data-k="vazgec">Vazgeç</button></div>`;
  const OLAYLAR = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart', 'touchend', 'submit'];
  const serit = (e: Event): boolean => e.composedPath().includes(host);
  const kapat = (): void => {
    for (const t of OLAYLAR) window.removeEventListener(t, yut, true);
    window.removeEventListener('keydown', tus, true);
    host.remove();
    delete w.__nobetciHizliSecimKapat;
  };
  const yut = (e: Event): void => {
    if (serit(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    const hedef = e.composedPath().find((x): x is Element => typeof x === 'object' && x !== null && (x as Node).nodeType === 1) ?? null;
    if (!hedef) return;
    const oge = hedef.closest('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a[href], [onclick]') ?? hedef;
    const bilgi = w.__nobetciOgeBilgisi as ((el: Element, isaret: string) => { adaylar: SeciciAdayi[]; metin: string | null }) | undefined;
    if (typeof bilgi !== 'function') return;
    const b = bilgi(oge, ayar.isaret);
    kapat();
    kopru({ tur: 'secildi', isaret: ayar.isaret, adaylar: b.adaylar, metin: b.metin });
  };
  const tus = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); kopru({ tur: 'vazgec' }); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !serit(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  (kok.querySelector('[data-k="vazgec"]') as HTMLElement).addEventListener('click', () => { kapat(); kopru({ tur: 'vazgec' }); });
  for (const t of OLAYLAR) window.addEventListener(t, yut, true);
  window.addEventListener('keydown', tus, true);
  w.__nobetciHizliSecimKapat = kapat;
  document.documentElement.append(host);
}
