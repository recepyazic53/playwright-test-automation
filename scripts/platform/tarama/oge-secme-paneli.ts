// ÖĞE SEÇME ("Sayfada seç") — SAYFA İÇİ fonksiyonlar (oge-secme-motoru.ts addInitScript ile verir). Tarayıcıda çalışırlar; bu
// yüzden her fonksiyon KENDİ İÇİNDE bağımsızdır (dış değişkene / import'a erişmez, yalnızca tip import edilir).
//   ogeBilgisi           seçilen öğenin seçici ADAYLARI (öncelik: rol + erişilebilir ad, görünen metin, kimlik / test kimliği,
//                        ad (name) / aria-label, adsız rol, son çare CSS yolu — kayit-paneli.ts > seciciUret ve
//                        sayfa-envanteri.ts > seciciOner ile aynı kurallar), görünen yazısı (düğmenin / sonucun metni; form
//                        alanında etiketi — DEĞER OKUNMAZ), önerilen türü ve form alanıysa yapısı (sayfa envanteri). Öğeye geçici
//                        data-nobetci-secilen işareti koyar; motor adayları Playwright ile denetleyip (tek eşleşme + aynı öğe) işareti kaldırır.
//   ogeSecmePaneliniKur  sayfanın köşesindeki Nöbetçi paneli (ayrı shadow kökünde). "Öğe seç" açıkken sayfadaki tıklama, basma,
//                        dokunma ve Enter / Boşluk tuşu YAKALANIR ve sayfaya İLETİLMEZ (düğmeye basılmaz, form gönderilmez);
//                        tıklanan öğe vurgulanır, türü sorulur (düğme / sonuç / alan / başarı göstergesi / hata göstergesi) ve
//                        köprüyle motora gider. Kapalıyken kullanıcı sayfayı normal kullanır (motor yazma isteklerini engeller).
//                        Aynı kökenli çerçevelerdeki olaylar da üst penceredeki panele iletilir.
import type { HamAlan } from './paket-olusturucu.mjs';

/** Seçici adayı (sayfa içi): tur 'rolAdsiz' motor tarafında 'rol' sayılır ama kimlik ve etiketten sonra denenir. */
export type SeciciAdayi = { secici: string; kirilganlik: 'dusuk' | 'orta' | 'yuksek'; tur: 'rol' | 'metin' | 'kimlik' | 'etiket' | 'rolAdsiz' | 'css' };
export type OgeBilgisi = {
  adaylar: SeciciAdayi[]; metin: string | null; oneri: 'dugme' | 'sonuc' | 'alan'; alan: HamAlan | null; alanTuru: string | null; isaret: string;
};
/** Panelin gösterdiği durum (motordan). */
export type SecimPaneliDurumu = { ogeler: Array<{ tur: string; metin: string | null; secici: string; kirilganlik: string }> };

export function ogeBilgisi(el: Element, isaret: string): OgeBilgisi {
  const doc = el.ownerDocument;
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  const kacis = (d: string): string => CSS.escape(d);
  const tek = (s: string): boolean => { try { return doc.querySelectorAll(s).length === 1; } catch { return false; } };
  const etiket = el.tagName.toLowerCase();
  const tip = etiket === 'input' ? ((el as HTMLInputElement).type || 'text').toLowerCase() : '';
  const dugmeGirdisi = etiket === 'input' && ['submit', 'button', 'reset', 'image'].includes(tip);
  const kontrol = ['input', 'select', 'textarea'].includes(etiket) && !dugmeGirdisi && tip !== 'hidden';
  const dugmeMi = etiket === 'button' || dugmeGirdisi || el.getAttribute('role') === 'button' || (etiket === 'a' && el.hasAttribute('href'));
  const idMetni = (ids: string): string => ids.split(/\s+/).filter(Boolean).map((id) => doc.getElementById(id))
    .map((e) => (e ? bosluk((e as HTMLElement).innerText || e.textContent) : '')).filter(Boolean).join(' ');
  // Görünen metin: düğme / bağlantı / sonuç öğesinin yazısı. Form alanının DEĞERİ okunmaz (düğme türü girdide value = etiket).
  const gorunenMetin = (): string => {
    if (etiket === 'input') return dugmeGirdisi ? bosluk(el.getAttribute('value') || el.getAttribute('alt')) : '';
    if (etiket === 'textarea' || etiket === 'select') return '';
    return bosluk((el as HTMLElement).innerText ?? el.textContent);
  };
  const etiketMetni = (): string => {
    const l = (el as HTMLInputElement).labels;
    if (!l || !l.length) return '';
    const k = l[0].cloneNode(true) as Element;
    k.querySelectorAll('input,select,textarea,button,option,script,style').forEach((x) => x.remove());
    return bosluk(k.textContent);
  };
  const ariaAd = bosluk(el.getAttribute('aria-labelledby') ? idMetni(el.getAttribute('aria-labelledby') ?? '') : '') || bosluk(el.getAttribute('aria-label'));
  const ad = (ariaAd || (kontrol ? etiketMetni() : gorunenMetin()) || bosluk(el.getAttribute('title')) || (kontrol ? bosluk(el.getAttribute('placeholder')) : '')).slice(0, 120);
  const rolBul = (): string | null => {
    const r = el.getAttribute('role');
    if (r) return r.split(/\s+/)[0];
    if (dugmeMi && etiket !== 'a') return 'button';
    if (etiket === 'a' && el.hasAttribute('href')) return 'link';
    if (etiket === 'select') return (el as HTMLSelectElement).multiple || (el as HTMLSelectElement).size > 1 ? 'listbox' : 'combobox';
    if (etiket === 'textarea') return 'textbox';
    if (etiket === 'input') {
      const roller: Record<string, string> = { text: 'textbox', email: 'textbox', tel: 'textbox', url: 'textbox', search: 'searchbox', number: 'spinbutton', checkbox: 'checkbox', radio: 'radio', range: 'slider' };
      return roller[tip] ?? null;
    }
    if (/^h[1-6]$/.test(etiket)) return 'heading';
    if (etiket === 'output') return 'status';
    return null;
  };
  const adaylar: SeciciAdayi[] = [];
  const ekle = (secici: string, kirilganlik: SeciciAdayi['kirilganlik'], tur: SeciciAdayi['tur']): void => {
    if (secici && !adaylar.some((a) => a.secici === secici)) adaylar.push({ secici, kirilganlik, tur });
  };
  const rol = rolBul();
  // 1) Rol + erişilebilir ad (Playwright rol seçicisi; model koşucusu page.locator ile çözer).
  if (rol && ad && ad.length <= 80) ekle(`role=${rol}[name="${tirnak(ad)}"]`, /\d/.test(ad) ? 'orta' : 'dusuk', 'rol');
  // 2) Görünen metin (düğme / sonuç; kayıt panelinin :text-is kuralı).
  const yazi = gorunenMetin();
  if (!kontrol && yazi && yazi.length <= 60) ekle(`${etiket}:text-is("${tirnak(yazi)}")`, /\d/.test(yazi) ? 'yuksek' : 'orta', 'metin');
  // 3) Kimlik ve test kimlikleri.
  const id = el.getAttribute('id');
  if (id && !/^\d/.test(id) && tek(`#${kacis(id)}`)) ekle(`#${kacis(id)}`, /\d{4,}|^(ctl\d|ext-|ember|react|mui-|ng-|:r)/i.test(id) ? 'orta' : 'dusuk', 'kimlik');
  for (const a of ['data-testid', 'data-test', 'data-qa']) {
    const v = el.getAttribute(a);
    if (v && tek(`[${a}="${tirnak(v)}"]`)) ekle(`[${a}="${tirnak(v)}"]`, 'dusuk', 'kimlik');
  }
  // 4) Ad (name) ve aria-label.
  const nm = el.getAttribute('name');
  if (nm && tek(`${etiket}[name="${tirnak(nm)}"]`)) ekle(`${etiket}[name="${tirnak(nm)}"]`, 'dusuk', 'etiket');
  const al = el.getAttribute('aria-label');
  if (al && tek(`${etiket}[aria-label="${tirnak(al)}"]`)) ekle(`${etiket}[aria-label="${tirnak(al)}"]`, 'orta', 'etiket');
  // 5) Adsız rol (ör. tek "status" bölgesi).
  if (rol && !ad) ekle(`role=${rol}`, 'orta', 'rolAdsiz');
  // 6) Son çare: CSS yolu (kimliği tekil ata kadar).
  const parcalar: string[] = [];
  let d: Element | null = el;
  while (d && d !== doc.documentElement && parcalar.length < 8) {
    const ebeveyn: Element | null = d.parentElement;
    if (d !== el && d.id && tek(`#${kacis(d.id)}`)) { parcalar.unshift(`#${kacis(d.id)}`); break; }
    const e = d.tagName.toLowerCase();
    const ayni = ebeveyn ? [...ebeveyn.children].filter((c) => c.tagName === d?.tagName) : [];
    parcalar.unshift(ayni.length > 1 ? `${e}:nth-of-type(${ayni.indexOf(d) + 1})` : e);
    d = ebeveyn;
  }
  ekle(parcalar.join(' > '), 'yuksek', 'css');

  // Form alanı: sayfa envanterindeki yapısı (etiket, tür, seçenekler, radyo grubu…; DEĞER yok).
  let alan: HamAlan | null = null;
  if (kontrol) {
    const oku = (doc.defaultView as unknown as { __nobetciSayfadakiAlanlar?: (d: number) => { alanlar: HamAlan[] } } | null)?.__nobetciSayfadakiAlanlar;
    if (typeof oku === 'function') {
      const PW = /^(role|text|xpath)=|>>|:text|:has-text/;
      alan = oku(0).alanlar.find((a) => !a.cerceve?.length && [a.secici, ...a.adaySeciciler, ...(a.radyolar ?? []).map((r) => r.secici ?? '')].some((s) => {
        if (!s || PW.test(s)) return false;
        try { return [...doc.querySelectorAll(s)].includes(el); } catch { return false; }
      })) ?? null;
    }
  }
  el.setAttribute('data-nobetci-secilen', isaret);
  return {
    adaylar, isaret, alan,
    metin: (dugmeMi ? yazi || ad : kontrol ? alan?.etiket || ad : yazi).slice(0, 200) || null,
    oneri: dugmeMi ? 'dugme' : kontrol ? 'alan' : 'sonuc',
    alanTuru: kontrol ? (etiket === 'input' ? tip : etiket) : null
  };
}

export function ogeSecmePaneliniKur(ayar: { kopru: string; kimlik: string; turler: string[]; turAdlari: Record<string, string>; alanTurleri: Array<[string, string]> }): void {
  type Merkez = { olay: (tur: string, e: Event) => void };
  const OLAYLAR = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend', 'submit', 'keydown', 'keyup', 'keypress', 'mouseover'];
  if (window.top !== window) {
    // AYNI KÖKENLİ ÇERÇEVE: panel çizilmez; olaylar üst penceredeki panele (window.top.__nobetciSecimMerkezi) iletilir.
    const cp = window as unknown as Record<string, unknown>;
    if (cp.__nobetciSecimCocuk) return;
    cp.__nobetciSecimCocuk = true;
    const merkez = (): Merkez | null => {
      try { return ((window.top as unknown as Record<string, unknown>).__nobetciSecimMerkezi as Merkez | undefined) ?? null; } catch { return null; }
    };
    for (const tur of OLAYLAR) window.addEventListener(tur, (e) => { merkez()?.olay(tur, e); }, true);
    return;
  }
  const pencere = window as unknown as Record<string, unknown>;
  if (pencere.__nobetciSecimKuruldu) return;
  pencere.__nobetciSecimKuruldu = true;
  type Kopru = (veri: Record<string, unknown>) => Promise<unknown>;
  const kopru = (veri: Record<string, unknown>): Promise<unknown> => {
    const f = pencere[ayar.kopru];
    return typeof f === 'function' ? (f as Kopru)(veri) : Promise.reject(new Error('Nöbetçi seçim köprüsü yok.'));
  };
  const ogeMi = (x: unknown): x is Element => typeof x === 'object' && x !== null && (x as Node).nodeType === 1;
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();

  // ---- Panel ve vurgu (ayrı shadow kökleri; sayfanın stiline karışmaz, sayfa envanterine girmez) ----
  const host = document.createElement('div');
  host.id = ayar.kimlik;
  host.setAttribute('style', 'all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;');
  const kok = host.attachShadow({ mode: 'open' });
  const vurguHost = document.createElement('div');
  vurguHost.setAttribute('style', 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;');
  const vurguKok = vurguHost.attachShadow({ mode: 'open' });
  vurguKok.innerHTML = '<div data-k="v" style="position:fixed;display:none;box-sizing:border-box;border:2px solid #3fb8af;background:rgba(63,184,175,.14);border-radius:3px;pointer-events:none"></div>';
  const vurgu = vurguKok.querySelector('[data-k="v"]') as HTMLElement;
  const panelIci = (e: Event): boolean => e.composedPath().includes(host);
  kok.innerHTML = `<style>
    :host { all: initial; }
    .p { box-sizing: border-box; width: 340px; max-width: calc(100vw - 32px); max-height: 76vh; overflow: auto; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #e6edf3; background: #0f1720; border: 1px solid #2a3a4a; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.45); }
    .u { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2a3a4a; position: sticky; top: 0; background: #0f1720; z-index: 1; }
    .u b { font-size: 13px; } .u .n { width: 8px; height: 8px; border-radius: 50%; background: #3fb8af; box-shadow: 0 0 0 3px rgba(63,184,175,.25); }
    .u .n.acik { background: #e3b341; box-shadow: 0 0 0 3px rgba(227,179,65,.3); } .u .s { margin-left: auto; }
    .g { padding: 10px 12px; display: grid; gap: 8px; }
    .i { color: #9fb0c0; font-size: 12px; } .v { color: #e3b341; font-size: 12px; } .h { color: #ff7b72; font-size: 12px; }
    h4 { margin: 2px 0 0; font-size: 12px; color: #c9d4de; }
    button, select, input { font: inherit; }
    button { cursor: pointer; border-radius: 6px; border: 1px solid #2a3a4a; background: #16212c; color: #e6edf3; padding: 6px 10px; }
    button:hover { border-color: #3fb8af; } button.b { background: #1f6f68; border-color: #3fb8af; } button.t { color: #ff7b72; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    select, input[type="text"] { background: #16212c; color: #e6edf3; border: 1px solid #2a3a4a; border-radius: 6px; padding: 5px 8px; width: 100%; box-sizing: border-box; }
    .r { display: flex; flex-wrap: wrap; gap: 6px; }
    fieldset { border: 1px solid #2a3a4a; border-radius: 8px; margin: 0; padding: 6px 10px; display: grid; gap: 4px; } legend { font-size: 12px; color: #c9d4de; }
    label { display: flex; gap: 6px; align-items: center; }
    ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    li { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: start; font-size: 12px; background: #131d27; border-radius: 6px; padding: 5px 7px; }
    li code { display: block; color: #9fb0c0; font-size: 11px; word-break: break-all; } li button { padding: 2px 7px; }
  </style><div class="p" role="dialog" aria-label="Nöbetçi öğe seçme"><div class="u"><span class="n" data-k="nokta" aria-hidden="true"></span><b>Nöbetçi · Sayfada seç</b>
  <button class="s" type="button" data-k="kucult" aria-label="Paneli küçült">–</button></div><div class="g" data-k="govde"></div></div>`;
  const govde = kok.querySelector('[data-k="govde"]') as HTMLElement;
  const nokta = kok.querySelector('[data-k="nokta"]') as HTMLElement;
  let kucuk = false;
  (kok.querySelector('[data-k="kucult"]') as HTMLElement).addEventListener('click', () => { kucuk = !kucuk; govde.style.display = kucuk ? 'none' : ''; });
  const el = (etiket: string, ozellik: Record<string, string> = {}, ...cocuklar: Array<Node | string | null>): HTMLElement => {
    const e = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik)) e.setAttribute(k, v);
    for (const c of cocuklar) if (c !== null) e.append(c);
    return e;
  };
  const dugme = (metin: string, f: () => void, sinif = '', ek: Record<string, string> = {}): HTMLButtonElement => {
    const b = el('button', { type: 'button', ...(sinif ? { class: sinif } : {}), ...ek }, metin) as HTMLButtonElement;
    b.addEventListener('click', f);
    return b;
  };

  let secimModu = true;
  let durum: SecimPaneliDurumu = { ogeler: [] };
  let hata = '';
  let mesaj = '';
  let bitti = false;
  let sayac = 0;
  /** Türü sorulan (henüz eklenmemiş) öğe. */
  let bekleyen: { bilgi: OgeBilgisi; cerceve: string[] | null; oge: Element } | null = null;

  const islem = (veri: Record<string, unknown>): Promise<boolean> => kopru(veri)
    .then((d) => { hata = ''; if (d && typeof d === 'object' && 'ogeler' in d) durum = d as SecimPaneliDurumu; return true; })
    .catch((e: unknown) => { hata = e instanceof Error ? e.message.replace(/^Error: /, '') : String(e); return false; })
    .then((t) => { ciz(); return t; });

  /** Öğenin çerçeve zinciri (dıştan içe; ana sayfada boş). Seçiciler sayfa envanterinin verdiğiyle aynı; erişilemezse null. */
  const cerceveZinciri = (e: Element): string[] | null => {
    const zincir: string[] = [];
    let w: Window | null = e.ownerDocument.defaultView;
    for (let i = 0; w && w !== window && i < 5; i++) {
      let f: Element | null = null;
      try { f = w.frameElement; } catch { return null; }
      if (!f) return null;
      const ust = f.ownerDocument.defaultView as (Window & { __nobetciCerceveSecicileri?: WeakMap<Element, string>; __nobetciSayfadakiAlanlar?: (d: number) => unknown }) | null;
      if (ust && !ust.__nobetciCerceveSecicileri?.get(f) && typeof ust.__nobetciSayfadakiAlanlar === 'function') { try { ust.__nobetciSayfadakiAlanlar(0); } catch { /* yok */ } }
      const s = ust?.__nobetciCerceveSecicileri?.get(f) ?? (f.id ? `${f.tagName.toLowerCase()}#${CSS.escape(f.id)}` : null);
      if (!s) return null;
      zincir.unshift(s);
      w = ust;
    }
    return w === window ? zincir : null;
  };
  /** Vurgu kutusu: öğenin görünür alanı (çerçevedeyse çerçevelerin konumu eklenir). */
  const vurgula = (e: Element | null): void => {
    if (!e || !secimModu || bekleyen) { vurgu.style.display = 'none'; return; }
    const r = e.getBoundingClientRect();
    let x = r.left;
    let y = r.top;
    let w: Window | null = e.ownerDocument.defaultView;
    for (let i = 0; w && w !== window && i < 5; i++) {
      let f: Element | null = null;
      try { f = w.frameElement; } catch { f = null; }
      if (!f) break;
      const fr = f.getBoundingClientRect();
      x += fr.left + f.clientLeft;
      y += fr.top + f.clientTop;
      w = f.ownerDocument.defaultView;
    }
    Object.assign(vurgu.style, { display: 'block', left: `${x - 2}px`, top: `${y - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
  };

  /** Tıklanan öğe → seçim adayı (etiket tıklandıysa bağlı form alanı; değer okunmaz). */
  const sec = (hedef: Element): void => {
    let e: Element = hedef;
    if (e.tagName === 'LABEL' && (e as HTMLLabelElement).control) e = (e as HTMLLabelElement).control as Element;
    else if (e.tagName === 'OPTION') e = e.closest('select') ?? e;
    const w = e.ownerDocument.defaultView as unknown as { __nobetciOgeBilgisi?: (x: Element, i: string) => OgeBilgisi } | null;
    const bilgiVer = w?.__nobetciOgeBilgisi ?? (pencere.__nobetciOgeBilgisi as ((x: Element, i: string) => OgeBilgisi) | undefined);
    if (typeof bilgiVer !== 'function') { hata = 'Öğe okunamadı; sayfayı yenileyin.'; ciz(); return; }
    const cerceve = cerceveZinciri(e);
    if (e.ownerDocument !== document && !cerceve) { hata = 'Bu öğe okunamayan bir çerçevede (başka kökenden); seçilemez.'; ciz(); return; }
    try {
      bekleyen = { bilgi: bilgiVer(e, `s${++sayac}`), cerceve: cerceve && cerceve.length ? cerceve : null, oge: e };
    } catch {
      hata = 'Öğe okunamadı.';
      bekleyen = null;
    }
    mesaj = '';
    vurgula(null);
    ciz();
  };
  const bekleyeniBirak = (): void => {
    try { bekleyen?.oge.removeAttribute('data-nobetci-secilen'); } catch { /* sayfa değişmiş */ }
    bekleyen = null;
  };

  function turSecimi(b: NonNullable<typeof bekleyen>): HTMLElement[] {
    const varsayilan = ayar.turler.includes(b.bilgi.oneri) ? b.bilgi.oneri : ayar.turler[0];
    let secili = varsayilan;
    const alanTuru = el('select', { 'aria-label': 'Alanın türü' }) as HTMLSelectElement;
    for (const [d, m] of ayar.alanTurleri) {
      const o = el('option', { value: d }, m) as HTMLOptionElement;
      if (d === (b.bilgi.alanTuru ?? 'text')) o.selected = true;
      alanTuru.append(o);
    }
    const etiketGirdisi = el('input', { type: 'text', maxlength: '80', 'aria-label': 'Alanın etiketi', placeholder: 'Alanın etiketi' }) as HTMLInputElement;
    etiketGirdisi.value = b.bilgi.metin ?? '';
    const alanAyari = el('div', { class: 'r' });
    const alanAyariCiz = (): void => {
      // Form alanı seçildiyse yapısı sayfadan gelir; değilse türü ve etiketi sorulur.
      alanAyari.replaceChildren(...(secili === 'alan' && !b.bilgi.alan ? [el('span', { class: 'i' }, 'Türü ve etiketi:'), alanTuru, etiketGirdisi] : []));
    };
    const radyolar = ayar.turler.map((t) => {
      const r = el('input', { type: 'radio', name: 'nobetci-oge-turu', value: t }) as HTMLInputElement;
      r.checked = t === varsayilan;
      r.addEventListener('change', () => { secili = t; alanAyariCiz(); });
      return el('label', {}, r, el('span', {}, ayar.turAdlari[t] ?? t));
    });
    alanAyariCiz();
    return [
      el('div', {}, el('b', {}, 'Seçilen öğe: '), b.bilgi.metin ? `“${b.bilgi.metin}”` : '(yazısız öğe)'),
      el('fieldset', {}, el('legend', {}, 'Bu öğe nedir?'), ...radyolar),
      alanAyari,
      el('div', { class: 'r' },
        dugme('Ekle', () => {
          const alanEki = secili === 'alan' && !b.bilgi.alan ? { alanTuru: alanTuru.value, metin: bosluk(etiketGirdisi.value) || null } : {};
          const veri = { tur: 'ekle', oge: { ...b.bilgi, tur: secili, ...alanEki, cerceve: b.cerceve } };
          bekleyen = null;
          void islem(veri).then((tamam) => { if (tamam) mesaj = 'Eklendi. Başka bir öğe seçebilir ya da bitirebilirsiniz.'; ciz(); });
        }, 'b'),
        dugme('Vazgeç', () => { bekleyeniBirak(); ciz(); }))
    ];
  }

  function iptalDugmesi(): HTMLButtonElement {
    let emin = false;
    const b = dugme('İptal', () => {
      if (!emin) { emin = true; b.textContent = 'Seçim iptal edilsin mi? Evet'; return; }
      bitti = true;
      void kopru({ tur: 'iptal' }).catch(() => undefined);
      govde.replaceChildren(el('div', { class: 'i' }, 'Seçim iptal edildi. Bu pencere kapanacak.'));
    }, 't');
    return b;
  }

  function ciz(): void {
    if (bitti) return;
    nokta.classList.toggle('acik', secimModu);
    const liste = durum.ogeler.length
      ? el('ul', { 'aria-label': 'Seçilen öğeler' }, ...durum.ogeler.map((o, i) => el('li', {},
        el('div', {}, el('b', {}, `${ayar.turAdlari[o.tur] ?? o.tur}: `), o.metin ? `“${o.metin}”` : '(yazısız)', el('code', {}, o.secici)),
        dugme('×', () => { void islem({ tur: 'kaldir', sira: i }); }, 't', { 'aria-label': `${o.metin ?? o.secici}: listeden çıkar` }))))
      : el('div', { class: 'i' }, 'Henüz öğe seçilmedi.');
    govde.replaceChildren(...[
      bekleyen ? null : el('div', { class: secimModu ? 'v' : 'i' }, secimModu
        ? 'Öğe seç açık: işaretlemek istediğiniz öğeye (ör. hesaplayan düğme, sonuç yazısı) tıklayın. Bu tıklama sayfaya GİTMEZ; düğmeye basılmaz, form gönderilmez. Esc: seçimi durdur.'
        : 'Öğe seç kapalı: sayfayı normal kullanabilirsiniz (ör. sonucu görmek için hesaplayın). Kayıt oluşturan / gönderen istekler engellenir.'),
      bekleyen ? null : dugme(secimModu ? 'Öğe seçmeyi durdur' : 'Öğe seç', () => { secimModu = !secimModu; mesaj = ''; vurgula(null); ciz(); }, secimModu ? '' : 'b'),
      ...(bekleyen ? turSecimi(bekleyen) : []),
      el('h4', {}, `Seçilenler (${durum.ogeler.length})`),
      liste,
      mesaj ? el('div', { class: 'i', role: 'status' }, mesaj) : null,
      hata ? el('div', { class: 'h', role: 'alert' }, hata) : null,
      el('div', { class: 'r' },
        (() => {
          const b = dugme('Bitir ve Nöbetçi’ye gönder', () => {
            kopru({ tur: 'bitir' }).then(() => { bitti = true; govde.replaceChildren(el('div', { class: 'i' }, 'Seçilenler Nöbetçi’ye gönderildi. Bu pencere kapanacak.')); })
              .catch((e: unknown) => { hata = String(e instanceof Error ? e.message : e); ciz(); });
          }, 'b');
          b.disabled = !durum.ogeler.length;
          return b;
        })(),
        iptalDugmesi()),
      el('div', { class: 'i' }, 'Yalnız öğenin yeri ve görünen yazısı alınır; alanlara girdiğiniz değerler okunmaz.')
    ].filter((x): x is HTMLElement => x !== null));
  }

  // ---- Olaylar: seçim açıkken sayfanın (ve aynı kökenli çerçevelerin) olayları yakalanır, sayfaya iletilmez ----
  const olay = (tur: string, e: Event): void => {
    if (bitti || panelIci(e)) return;
    const t = e.composedPath()[0] ?? e.target;
    if (tur === 'mouseover') { if (ogeMi(t)) vurgula(t); return; }
    if (tur === 'keydown' && (e as KeyboardEvent).key === 'Escape' && (secimModu || bekleyen)) {
      if (bekleyen) bekleyeniBirak(); else secimModu = false;
      e.preventDefault();
      vurgula(null);
      ciz();
      return;
    }
    if (!secimModu && !bekleyen) return;
    if (tur.startsWith('key') && !['Enter', ' ', 'Spacebar'].includes((e as KeyboardEvent).key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (tur === 'click' && !bekleyen && ogeMi(t)) sec(t);
  };
  for (const tur of OLAYLAR) window.addEventListener(tur, (e) => olay(tur, e), true);
  const merkez: Merkez = { olay: (tur, e) => { try { olay(tur, e); } catch { /* çerçeve olayı işlenemedi */ } } };
  pencere.__nobetciSecimMerkezi = merkez;

  const yerlestir = (): void => {
    if (!document.documentElement) { setTimeout(yerlestir, 50); return; }
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!vurguHost.isConnected) document.documentElement.appendChild(vurguHost);
  };
  yerlestir();
  setInterval(yerlestir, 1000);
  void islem({ tur: 'durum' });
}
