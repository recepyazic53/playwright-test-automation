// SAYFA İÇİ fonksiyonlar (otomatik tarama) — page.evaluate / addInitScript ile tarayıcıda çalışır; bu yüzden her
// fonksiyon KENDİ İÇİNDE bağımsızdır (dış değişkene/import'a erişmez, yalnızca tip import edilir).
//   sayfadakiAlanlar      GÖRÜNÜR form alanlarının yapısı: etiket (<label for>, sarmalayan label, aria-label /
//                         aria-labelledby, yakındaki metin, yer tutucu), tür, name/id, seçici önerisi (#id →
//                         [name=…] → role=…[name=…] → CSS yolu), zorunluluk, seçenekler (değer + metin), radyo ve onay
//                         kutusu grupları, dosya (accept), devre dışı/salt okunur, bölüm (fieldset/legend, başlıklar).
//                         Alan DEĞERİ okunmaz/döndürülmez.
//                         Özel açılır liste (aramalı liste bileşenleri): gerçek <select> gizli, yanında GÖRÜNÜR bir kutu
//                         (role=combobox, aria-controls/aria-owns, bilinen bileşen kapları, "<select id>_chosen" gibi
//                         kimlik desenleri) → alan görünür sayılır (ozelBilesen), seçici gerçek <select>'in, seçenekler ondan.
//                         Çerçeveler (iframe): AYNI KÖKENLİ çerçevelerin içi de okunur (en çok 2 düzey; her alan "cerceve"
//                         seçicileriyle); başka kökenli (cross-origin) çerçeveler "okunamadı" sayılır. Çerçevenin içi, o
//                         çerçevenin kendi penceresindeki window.__nobetciSayfadakiAlanlar ile okunur (init betiğiyle verilir;
//                         sınıf denetimleri o belgenin kendi dünyasında çalışsın diye).
//   ozelBilesenIsaretle   (model koşucusu) gizli <select>'e bağlı görünür bileşeni aynı kurallarla bulur ve işaretler.
//   formGonderimKorumasi  tarama sayfasında form gönderimini etkisizleştirir (submit/requestSubmit, submit olayı,
//                         window.open, sendBeacon) — ağ katmanındaki yazma isteği engeline ek savunma.
import type { HamAlan, HamRadyo, Kirilganlik, SayfaEnvanteri } from './paket-olusturucu.mjs';

/** Çerçevelerin içi en çok bu derinliğe kadar okunur (ana sayfa 0; iframe 1; iframe içindeki iframe 2). */
export const CERCEVE_EN_DERIN = 2;

export function sayfadakiAlanlar(derinlik = 0): SayfaEnvanteri {
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const kacis = (d: string): string => CSS.escape(d);
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  const tekMi = (s: string): boolean => {
    try { return document.querySelectorAll(s).length === 1; } catch { return false; }
  };
  const gorunurMu = (el: Element | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const KONTROLLER = 'input,select,textarea,button';

  // ---- Özel açılır liste bileşenleri (gizli <select> + görünür kutu). Kural ozelBilesenIsaretle ile AYNIDIR. ----
  // Bilinen bileşen kapları (kütüphane sınıfları; siteye özgü değil) ve açılır parçaları (arama kutusu, liste).
  const OZEL_KAP = '.select2-container,.select2,.chosen-container,.bootstrap-select,.ms-parent,.ui-selectmenu-button,.selectize-control,.choices,.ts-wrapper,.dropdown.bootstrap-select';
  const OZEL_ACILIR = '.select2-dropdown,.select2-search,.chosen-drop,.bs-searchbox,.selectize-dropdown,.choices__list--dropdown,.ts-dropdown,.ms-drop';
  const OZEL_TIK = '[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="true"],.select2-selection,.chosen-single,.chosen-choices,.dropdown-toggle,.selectize-input,.choices__inner,.ts-control,button';
  /** Gizli (display:none / görünmez) ya da 2 pikselden küçük (erişilebilir gizleme) <select>. */
  const gizliSecimMi = (s: HTMLSelectElement): boolean => {
    if (!gorunurMu(s)) return true;
    const r = s.getBoundingClientRect();
    return r.width <= 2 && r.height <= 2;
  };
  /** Gizli <select>'e bağlı görünür bileşen: { kap, tik } ya da null. */
  const ozelBilesen = (s: HTMLSelectElement): { kap: HTMLElement; tik: HTMLElement } | null => {
    if (!gizliSecimMi(s)) return null;
    const guclu: Element[] = [];
    const zayif: Element[] = [];
    const id = s.getAttribute('id');
    if (id) {
      for (const k of [`${id}_chosen`, `${id}-container`, `select2-${id}-container`, `${id}-button`, `${id}_ms`, `${id}-ts-control`]) {
        const e = document.getElementById(k);
        if (e) guclu.push(e.closest(OZEL_KAP) ?? e);
      }
      try { guclu.push(...document.querySelectorAll(`[aria-controls~="${tirnak(id)}"],[aria-owns~="${tirnak(id)}"]`)); } catch { /* geçersiz kimlik */ }
    }
    for (let k = s.nextElementSibling, i = 0; k && i < 2; k = k.nextElementSibling, i++) zayif.push(k);
    for (let k = s.previousElementSibling, i = 0; k && i < 2; k = k.previousElementSibling, i++) zayif.push(k);
    if (s.parentElement) zayif.push(s.parentElement);
    const bilesenMi = (e: Element): boolean => e.matches(`${OZEL_KAP},[role="combobox"],[aria-haspopup]`) || !!e.querySelector('[role="combobox"],[aria-haspopup]');
    const adaylar = [...guclu.map((e) => ({ e, guclu: true })), ...zayif.map((e) => ({ e, guclu: false }))];
    for (const { e, guclu: g } of adaylar) {
      if (!(e instanceof HTMLElement) || e === s || e.matches('select,input,textarea,label,form,body')) continue;
      if (!g && !bilesenMi(e)) continue;
      // Ebeveyn kap: yalnızca bileşen kabıysa (bootstrap-select gibi <select>'i saran) ve içinde başka bir <select> yoksa.
      if (e.contains(s) && (!e.matches(`${OZEL_KAP},[role="combobox"]`) || e.querySelectorAll('select').length > 1)) continue;
      if (!gorunurMu(e)) continue;
      const tik = e.matches(OZEL_TIK) ? e : ([...e.querySelectorAll(OZEL_TIK)].find((x) => x !== s && gorunurMu(x)) as HTMLElement | undefined) ?? e;
      return { kap: e, tik };
    }
    return null;
  };
  const ozelKaplar = new Map<HTMLSelectElement, { kap: HTMLElement; tik: HTMLElement }>();
  for (const s of document.querySelectorAll('select')) {
    const b = ozelBilesen(s);
    if (b) ozelKaplar.set(s, b);
  }
  const kaplar = [...ozelKaplar.values()].map((b) => b.kap);
  /** Öğe bir özel bileşenin (kabı ya da açılır parçası) içinde mi? (Bileşenin kendi arama kutusu ayrı alan sayılmaz.) */
  const ozelIcinde = (el: Element): boolean => kaplar.some((k) => k.contains(el)) || !!el.closest(OZEL_ACILIR);
  const saltMetin = (el: Element): string => {
    const k = el.cloneNode(true) as Element;
    k.querySelectorAll(`${KONTROLLER},script,style,option,noscript,template`).forEach((x) => x.remove());
    return bosluk(k.textContent);
  };
  const etiketTemizle = (m: string): string => bosluk(m).replace(/[\s:*：]+$/u, '').replace(/^[\s*]+/, '').trim().slice(0, 160);
  const idMetni = (ids: string | null): string => (ids ?? '').split(/\s+/).filter(Boolean)
    .map((id) => { const e = document.getElementById(id); return e ? saltMetin(e) : ''; }).filter(Boolean).join(' ');

  /** Yakındaki metin: öğenin (ya da 3 düzeye kadar atalarının) önceki kardeşlerindeki ilk kısa metin. */
  const yakinMetin = (el: Element): string | null => {
    let d: Element | null = el;
    for (let seviye = 0; seviye < 3 && d; seviye++) {
      let o: ChildNode | null = d.previousSibling;
      while (o) {
        // Özel bileşenin kutusu ("Seçiniz…") etiket değildir: atlanır.
        if (o instanceof Element && kaplar.includes(o as HTMLElement)) { o = o.previousSibling; continue; }
        if (o instanceof Element && o.querySelector('input,select,textarea')) return null;
        const t = o.nodeType === Node.TEXT_NODE ? bosluk(o.textContent) : o instanceof Element && !o.matches(KONTROLLER) && gorunurMu(o) ? saltMetin(o) : '';
        if (t) return t.length <= 80 ? t : null;
        o = o.previousSibling;
      }
      d = d.parentElement;
      if (!d || d.matches('form,fieldset,body,main,section,article')) break;
    }
    return null;
  };
  /** Onay kutusu/radyo için sonraki kardeş metni ("<input type=radio> Peşin"). */
  const sonrakiMetin = (el: Element): string | null => {
    let o: ChildNode | null = el.nextSibling;
    while (o) {
      if (o instanceof Element && o.matches(KONTROLLER)) return null;
      const t = o.nodeType === Node.TEXT_NODE ? bosluk(o.textContent) : o instanceof Element ? saltMetin(o) : '';
      if (t) return t.length <= 80 ? t : null;
      o = o.nextSibling;
    }
    return null;
  };

  type EtiketBilgisi = { metin: string | null; kaynak: HamAlan['etiketKaynagi']; yildiz: boolean };
  const etiketBul = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, secimliMi: boolean): EtiketBilgisi => {
    const etiketler = el.labels ? [...el.labels] : [];
    for (const l of etiketler) {
      const ham = saltMetin(l);
      if (ham) return { metin: etiketTemizle(ham), kaynak: l.contains(el) ? 'sarmalayan' : 'label', yildiz: ham.includes('*') };
    }
    const aria = idMetni(el.getAttribute('aria-labelledby')) || bosluk(el.getAttribute('aria-label'));
    if (aria) return { metin: etiketTemizle(aria), kaynak: 'aria', yildiz: aria.includes('*') };
    const yakin = secimliMi ? sonrakiMetin(el) ?? yakinMetin(el) : yakinMetin(el);
    if (yakin) return { metin: etiketTemizle(yakin), kaynak: 'yakin', yildiz: yakin.includes('*') };
    const yer = bosluk(el.getAttribute('placeholder')) || bosluk(el.getAttribute('title'));
    if (yer) return { metin: etiketTemizle(yer), kaynak: 'yer-tutucu', yildiz: false };
    // Özel bileşen: kutunun aria adı ya da kutunun önündeki metin (aria-labelledby çoğu bileşende seçili değeri gösterir; alınmaz).
    const ozel = el instanceof HTMLSelectElement ? ozelKaplar.get(el) : undefined;
    if (ozel) {
      const t = bosluk(ozel.tik.getAttribute('aria-label')) || bosluk(ozel.kap.getAttribute('aria-label'));
      if (t) return { metin: etiketTemizle(t), kaynak: 'aria', yildiz: t.includes('*') };
      const y = yakinMetin(ozel.kap);
      if (y) return { metin: etiketTemizle(y), kaynak: 'yakin', yildiz: y.includes('*') };
    }
    return { metin: null, kaynak: null, yildiz: false };
  };

  const basliklar = [...document.querySelectorAll('h2,h3,h4,h5,h6,[role="heading"]')].filter((b) => gorunurMu(b) && saltMetin(b));
  const anaBaslik = [...document.querySelectorAll('h1')].find((b) => gorunurMu(b) && saltMetin(b)) ?? null;
  const bolumBul = (el: Element, fieldsetHaric: Element | null = null): HamAlan['bolum'] => {
    let fs = el.closest('fieldset');
    if (fs && fs === fieldsetHaric) fs = fs.parentElement ? fs.parentElement.closest('fieldset') : null;
    if (fs) {
      const lg = fs.querySelector(':scope > legend');
      const t = lg ? etiketTemizle(saltMetin(lg)) : '';
      if (t) return { anahtar: `fs:${fs.id || t}`, baslik: t };
    }
    let son: Element | null = null;
    for (const b of basliklar) {
      if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) son = b;
      else break;
    }
    if (son) { const t = etiketTemizle(saltMetin(son)); return { anahtar: `h:${t}`, baslik: t }; }
    if (anaBaslik && anaBaslik.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      const t = etiketTemizle(saltMetin(anaBaslik));
      return { anahtar: `h1:${t}`, baslik: t };
    }
    return { anahtar: 'genel', baslik: 'Genel' };
  };

  const rolu = (el: Element, tur: string): string | null => {
    if (el instanceof HTMLSelectElement) return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (el instanceof HTMLTextAreaElement) return 'textbox';
    if (['text', 'email', 'tel', 'url'].includes(tur)) return 'textbox';
    if (tur === 'search') return 'searchbox';
    if (tur === 'number') return 'spinbutton';
    if (tur === 'checkbox' || tur === 'radio') return tur;
    return null;
  };
  const seciciOner = (el: Element, etiket: string | null, rol: string | null): { secici: string; kirilganlik: Kirilganlik; adaylar: string[] } => {
    const etiketAdi = el.tagName.toLowerCase();
    const adaylar: string[] = [];
    const id = el.getAttribute('id');
    const ad = el.getAttribute('name');
    if (id) adaylar.push(`#${kacis(id)}`, `[id="${tirnak(id)}"]`, `${etiketAdi}#${kacis(id)}`);
    if (ad) adaylar.push(`[name="${tirnak(ad)}"]`, `${etiketAdi}[name="${tirnak(ad)}"]`);
    if (id && !/^\d/.test(id) && tekMi(`#${kacis(id)}`)) {
      return { secici: `#${kacis(id)}`, kirilganlik: /\d{4,}|^(ctl\d|ext-|ember|react|mui-|ng-|:r)/i.test(id) ? 'orta' : 'dusuk', adaylar };
    }
    if (ad && tekMi(`${etiketAdi}[name="${tirnak(ad)}"]`)) return { secici: `${etiketAdi}[name="${tirnak(ad)}"]`, kirilganlik: 'dusuk', adaylar };
    const deger = el.getAttribute('value');
    if (ad && deger !== null && (rol === 'checkbox' || rol === 'radio')) {
      const s = `${etiketAdi}[name="${tirnak(ad)}"][value="${tirnak(deger)}"]`;
      adaylar.push(s);
      if (tekMi(s)) return { secici: s, kirilganlik: 'dusuk', adaylar };
    }
    if (etiket && rol) {
      const s = `role=${rol}[name="${tirnak(etiket)}"]`;
      adaylar.push(s);
      return { secici: s, kirilganlik: 'orta', adaylar };
    }
    const parcalar: string[] = [];
    let d: Element | null = el;
    while (d && d !== document.body && parcalar.length < 6) {
      const pid = d.getAttribute('id');
      if (pid && d !== el && tekMi(`#${kacis(pid)}`)) { parcalar.unshift(`#${kacis(pid)}`); break; }
      const ebeveyn: Element | null = d.parentElement;
      const buEtiket = d.tagName;
      const ayni = ebeveyn ? [...ebeveyn.children].filter((c) => c.tagName === buEtiket) : [];
      parcalar.unshift(ayni.length > 1 ? `${buEtiket.toLowerCase()}:nth-of-type(${ayni.indexOf(d) + 1})` : buEtiket.toLowerCase());
      d = ebeveyn;
    }
    const s = parcalar.join(' > ');
    adaylar.push(s);
    return { secici: s, kirilganlik: 'yuksek', adaylar };
  };

  const anahtarlar = new Set<string>();
  const anahtarVer = (temel: string): string => {
    let a = temel;
    for (let i = 2; anahtarlar.has(a); i++) a = `${temel}#${i}`;
    anahtarlar.add(a);
    return a;
  };
  const onayAdlari = new Map<string, number>();
  for (const c of document.querySelectorAll('input[type="checkbox"][name]')) {
    const ad = c.getAttribute('name') ?? '';
    onayAdlari.set(ad, (onayAdlari.get(ad) ?? 0) + 1);
  }

  const alanlar: HamAlan[] = [];
  const islenenRadyolar = new Set<string>();
  const ogeler = [...document.querySelectorAll('input, select, textarea')] as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  ogeler.forEach((el, sira) => {
    const etiketAdi = el.tagName.toLowerCase();
    const tur = el instanceof HTMLInputElement ? (el.getAttribute('type') || 'text').toLowerCase() : etiketAdi;
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(tur)) return;
    if (ozelIcinde(el)) return;
    const devreDisi = el.matches(':disabled');
    const zorunluOzellik = el.required || el.getAttribute('aria-required') === 'true';

    if (tur === 'radio') {
      const ad = el.getAttribute('name') || `#${el.id || sira}`;
      if (islenenRadyolar.has(ad)) return;
      const grup = (el.getAttribute('name')
        ? [...document.querySelectorAll(`input[type="radio"][name="${tirnak(ad)}"]`)]
        : [el]) as HTMLInputElement[];
      const gorunenler = grup.filter((r) => gorunurMu(r) || (r.labels ? [...r.labels].some(gorunurMu) : false));
      if (!gorunenler.length) return;
      islenenRadyolar.add(ad);
      // Grup etiketi: yalnızca bu grubu içeren fieldset'in legend'ı, radiogroup'un aria adı ya da grubun önündeki metin.
      let etiket: string | null = null;
      let kaynak: HamAlan['etiketKaynagi'] = null;
      let grupFieldset: Element | null = null;
      const fs = el.closest('fieldset');
      if (fs && [...fs.querySelectorAll('input,select,textarea')].every((x) => grup.includes(x as HTMLInputElement))) {
        const lg = fs.querySelector(':scope > legend');
        if (lg && saltMetin(lg)) { etiket = etiketTemizle(saltMetin(lg)); kaynak = 'legend'; grupFieldset = fs; }
      }
      const rg = el.closest('[role="radiogroup"]');
      if (!etiket && rg) {
        const t = idMetni(rg.getAttribute('aria-labelledby')) || bosluk(rg.getAttribute('aria-label'));
        if (t) { etiket = etiketTemizle(t); kaynak = 'aria'; }
      }
      if (!etiket) {
        let kap: Element | null = el.parentElement;
        while (kap && !grup.every((r) => kap?.contains(r))) kap = kap.parentElement;
        const t = kap ? yakinMetin(kap) : null;
        if (t) { etiket = etiketTemizle(t); kaynak = 'yakin'; }
      }
      const radyolar: HamRadyo[] = grup.map((r) => {
        const lm = r.labels && r.labels.length ? saltMetin(r.labels[0]) : sonrakiMetin(r);
        const rid = r.getAttribute('id');
        return { deger: r.value, metin: lm ? etiketTemizle(lm) : null, secici: rid && tekMi(`#${kacis(rid)}`) ? `#${kacis(rid)}` : null };
      });
      const gercekAd = el.getAttribute('name');
      const secici = gercekAd ? `input[type="radio"][name="${tirnak(gercekAd)}"]` : seciciOner(el, etiket, 'radio').secici;
      alanlar.push({
        anahtar: anahtarVer(gercekAd ? `radyo:${gercekAd}` : `radyo:${el.id || sira}`), tur: 'radio', etiket, etiketKaynagi: kaynak,
        kimlik: null, ad: gercekAd, secici, kirilganlik: gercekAd ? 'dusuk' : 'yuksek',
        adaySeciciler: gercekAd ? [secici, `input[name="${tirnak(gercekAd)}"]`, `[name="${tirnak(gercekAd)}"]`] : [secici],
        zorunlu: grup.some((r) => r.required) || rg?.getAttribute('aria-required') === 'true', devreDisi: grup.every((r) => r.disabled),
        saltOkunur: false, coklu: false, radyolar, bolum: bolumBul(el, grupFieldset)
      });
      return;
    }

    const ozel = el instanceof HTMLSelectElement ? ozelKaplar.get(el) : undefined;
    const gorunur = Boolean(ozel) || gorunurMu(el) || ((tur === 'checkbox' || tur === 'file') && el.labels ? [...el.labels].some(gorunurMu) : false);
    if (!gorunur) return;
    const e = etiketBul(el, tur === 'checkbox');
    // Özel bileşende rol seçicisi (role=combobox[name=…]) gizli <select>'i bulamaz: kimlik / ad / CSS yolu.
    const { secici, kirilganlik, adaylar } = seciciOner(el, e.metin, ozel ? null : rolu(el, tur));
    const id = el.getAttribute('id');
    const ad = el.getAttribute('name');
    const grup = tur === 'checkbox' && ad && (onayAdlari.get(ad) ?? 0) > 1 ? ad : null;
    const temelAnahtar = id ? `#${id}` : ad ? `@${ad}${grup ? `=${(el as HTMLInputElement).value}` : ''}` : e.metin ? `~${e.metin}` : `${etiketAdi}:${sira}`;
    const alan: HamAlan = {
      anahtar: anahtarVer(temelAnahtar), tur, etiket: e.metin, etiketKaynagi: e.kaynak, kimlik: id, ad, secici, kirilganlik, adaySeciciler: adaylar,
      zorunlu: zorunluOzellik || e.yildiz, devreDisi,
      saltOkunur: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : false) || el.getAttribute('aria-readonly') === 'true',
      coklu: el instanceof HTMLSelectElement ? el.multiple : false, grup, bolum: bolumBul(el)
    };
    if (el instanceof HTMLSelectElement) {
      alan.secenekler = [...el.options].slice(0, 300).map((o) => ({ deger: o.value, metin: bosluk(o.label || o.text) }));
    }
    if (tur === 'file') alan.kabul = el.getAttribute('accept') || null;
    if (ozel) {
      alan.ozelBilesen = true;
      alan.bilesen = seciciOner(ozel.kap, null, null).secici;
    }
    alanlar.push(alan);
  });

  const ozelBilesenSayisi = [...document.querySelectorAll('[role="combobox"]:not(input):not(select),[role="listbox"]:not(select),[contenteditable="true"],[role="textbox"]:not(input):not(textarea)')]
    .filter((x) => gorunurMu(x) && !ozelIcinde(x)).length;

  // ---- Çerçeveler (iframe / frame): aynı kökenli olanların içi, çerçevenin kendi penceresindeki okuyucuyla. ----
  /** Çerçevenin seçicisi (bu belgeye göre): kimlik → ad → src deseni → başlık → CSS yolu. */
  const cerceveSecici = (f: HTMLIFrameElement | HTMLFrameElement): string => {
    const t = f.tagName.toLowerCase();
    const id = f.getAttribute('id');
    if (id && !/^\d/.test(id) && tekMi(`${t}#${kacis(id)}`)) return `${t}#${kacis(id)}`;
    const ad = f.getAttribute('name');
    if (ad && tekMi(`${t}[name="${tirnak(ad)}"]`)) return `${t}[name="${tirnak(ad)}"]`;
    const src = (f.getAttribute('src') ?? '').split(/[?#]/)[0];
    const son = src.split('/').filter(Boolean).pop() ?? '';
    if (son && !/^(about:|javascript:|data:)/i.test(src) && tekMi(`${t}[src*="${tirnak(son)}"]`)) return `${t}[src*="${tirnak(son)}"]`;
    const baslik = f.getAttribute('title');
    if (baslik && tekMi(`${t}[title="${tirnak(baslik)}"]`)) return `${t}[title="${tirnak(baslik)}"]`;
    return seciciOner(f, null, null).secici;
  };
  let cerceveSayisi = 0;
  let okunamayanCerceveSayisi = 0;
  let icOzel = 0;
  for (const f of [...document.querySelectorAll('iframe,frame')] as Array<HTMLIFrameElement | HTMLFrameElement>) {
    if (!gorunurMu(f)) continue;
    cerceveSayisi++;
    let alt: SayfaEnvanteri | null = null;
    try {
      // Başka kökenli çerçevede contentDocument null'dır (ya da erişim hata verir).
      const w = f.contentWindow as (Window & { __nobetciSayfadakiAlanlar?: (d: number) => SayfaEnvanteri }) | null;
      if (f.contentDocument && w && derinlik + 1 <= 2 && typeof w.__nobetciSayfadakiAlanlar === 'function') alt = w.__nobetciSayfadakiAlanlar(derinlik + 1);
    } catch { alt = null; }
    if (!alt) { okunamayanCerceveSayisi++; continue; }
    const cs = cerceveSecici(f);
    // Kayıt paneli çerçevedeki düğmenin çerçeve zincirini aynı seçiciyle kursun diye (window.__nobetciCerceveSecicileri).
    try {
      const w = window as unknown as { __nobetciCerceveSecicileri?: WeakMap<Element, string> };
      (w.__nobetciCerceveSecicileri ??= new WeakMap()).set(f, cs);
    } catch { /* yok sayılır */ }
    for (const a of alt.alanlar) {
      alanlar.push({
        ...a, anahtar: anahtarVer(`${cs}::${a.anahtar}`), cerceve: [cs, ...(a.cerceve ?? [])],
        bolum: { anahtar: `${cs}::${a.bolum.anahtar}`, baslik: a.bolum.baslik }
      });
    }
    cerceveSayisi += alt.cerceveSayisi;
    okunamayanCerceveSayisi += alt.okunamayanCerceveSayisi ?? 0;
    icOzel += alt.ozelBilesenSayisi;
  }
  return { alanlar, baslik: bosluk(document.title).slice(0, 200), ozelBilesenSayisi: ozelBilesenSayisi + icOzel, cerceveSayisi, okunamayanCerceveSayisi };
}

/**
 * Model koşucusu için (sayfa içi; kendi içinde bağımsız): gizli <select>'e bağlı GÖRÜNÜR özel açılır liste bileşenini
 * (sayfadakiAlanlar ile AYNI kurallar) bulur ve tıklanacak parçasına data-nobetci-ozel="<isaret>" yazar. Bulunamazsa false.
 */
export function ozelBilesenIsaretle(s: Element, isaret: string): boolean {
  if (!s || s.tagName !== 'SELECT') return false;
  const doc = s.ownerDocument;
  const gorunurMu = (el: Element | null): boolean => {
    if (!el || el.nodeType !== 1) return false;
    const h = el as HTMLElement;
    if (typeof h.checkVisibility === 'function' && !h.checkVisibility({ checkVisibilityCSS: true })) return false;
    const st = (doc.defaultView ?? window).getComputedStyle(h);
    if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false;
    const r = h.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  const OZEL_KAP = '.select2-container,.select2,.chosen-container,.bootstrap-select,.ms-parent,.ui-selectmenu-button,.selectize-control,.choices,.ts-wrapper,.dropdown.bootstrap-select';
  const OZEL_TIK = '[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="true"],.select2-selection,.chosen-single,.chosen-choices,.dropdown-toggle,.selectize-input,.choices__inner,.ts-control,button';
  if (gorunurMu(s)) {
    const r = s.getBoundingClientRect();
    if (r.width > 2 || r.height > 2) return false;
  }
  const guclu: Element[] = [];
  const zayif: Element[] = [];
  const id = s.getAttribute('id');
  if (id) {
    for (const k of [`${id}_chosen`, `${id}-container`, `select2-${id}-container`, `${id}-button`, `${id}_ms`, `${id}-ts-control`]) {
      const e = doc.getElementById(k);
      if (e) guclu.push(e.closest(OZEL_KAP) ?? e);
    }
    try { guclu.push(...doc.querySelectorAll(`[aria-controls~="${tirnak(id)}"],[aria-owns~="${tirnak(id)}"]`)); } catch { /* geçersiz kimlik */ }
  }
  for (let k = s.nextElementSibling, i = 0; k && i < 2; k = k.nextElementSibling, i++) zayif.push(k);
  for (let k = s.previousElementSibling, i = 0; k && i < 2; k = k.previousElementSibling, i++) zayif.push(k);
  if (s.parentElement) zayif.push(s.parentElement);
  const bilesenMi = (e: Element): boolean => e.matches(`${OZEL_KAP},[role="combobox"],[aria-haspopup]`) || !!e.querySelector('[role="combobox"],[aria-haspopup]');
  for (const { e, g } of [...guclu.map((e) => ({ e, g: true })), ...zayif.map((e) => ({ e, g: false }))]) {
    if (e === s || e.matches('select,input,textarea,label,form,body')) continue;
    if (!g && !bilesenMi(e)) continue;
    if (e.contains(s) && (!e.matches(`${OZEL_KAP},[role="combobox"]`) || e.querySelectorAll('select').length > 1)) continue;
    if (!gorunurMu(e)) continue;
    const tik = e.matches(OZEL_TIK) ? e : [...e.querySelectorAll(OZEL_TIK)].find((x) => x !== s && gorunurMu(x)) ?? e;
    tik.setAttribute('data-nobetci-ozel', isaret);
    return true;
  }
  return false;
}

/**
 * Tarama sayfasında (addInitScript; YALNIZ otomatik tarama — kullanıcının tıkladığı kayıt / öğe seçme penceresinde değil):
 * düğmeye / bağlantıya gelen HER tıklama sayfa içinde yutulur. Tarama hiçbir düğmeye basmaz; bu, keşif bir seçimi değiştirince
 * SAYFANIN KENDİ BETİĞİNİN bir düğmeye basmaya çalışmasına (ör. "değişince kaydet") karşı ek savunmadır. Seçim kutularının
 * (radyo / onay kutusu) kendisine tıklamak düğme sayılmaz. Yutulan tıklama sayısı window.__nobetciYutulanTiklama'da.
 */
export function dugmeTiklamaKorumasi(): void {
  const w = window as unknown as { __nobetciDugmeKorumasi?: boolean; __nobetciYutulanTiklama?: number };
  if (w.__nobetciDugmeKorumasi) return;
  w.__nobetciDugmeKorumasi = true;
  w.__nobetciYutulanTiklama = 0;
  const DUGME = 'button, [role="button"], [role="link"], [role="menuitem"], a[href], input[type="submit"], input[type="button"], input[type="image"], input[type="reset"], summary';
  const yut = (o: Event): void => {
    const t = o.target;
    if (!(t instanceof Element)) return;
    if (t.matches('input[type="radio"], input[type="checkbox"], select, option')) return;
    if (!t.closest(DUGME)) return;
    o.preventDefault();
    o.stopImmediatePropagation();
    w.__nobetciYutulanTiklama = (w.__nobetciYutulanTiklama ?? 0) + 1;
  };
  for (const tur of ['click', 'auxclick', 'dblclick']) window.addEventListener(tur, yut, true);
}

/** Tarama sayfasında (addInitScript) form gönderimini ve yeni pencereleri etkisizleştirir. */
export function formGonderimKorumasi(): void {
  const w = window as unknown as { __nobetciTaramaKorumasi?: boolean };
  if (w.__nobetciTaramaKorumasi) return;
  w.__nobetciTaramaKorumasi = true;
  HTMLFormElement.prototype.submit = function engelliSubmit(): void { /* tarama: form gönderilmez */ };
  HTMLFormElement.prototype.requestSubmit = function engelliRequestSubmit(): void { /* tarama: form gönderilmez */ };
  window.addEventListener('submit', (o) => { o.preventDefault(); o.stopImmediatePropagation(); }, true);
  window.open = (): null => null;
  try {
    Object.defineProperty(navigator, 'sendBeacon', { value: (): boolean => false, configurable: true });
  } catch { /* desteklenmiyor */ }
}
