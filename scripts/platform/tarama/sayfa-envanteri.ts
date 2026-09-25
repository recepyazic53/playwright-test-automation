// SAYFA İÇİ fonksiyonlar (otomatik tarama) — page.evaluate / addInitScript ile tarayıcıda çalışır; bu yüzden her
// fonksiyon KENDİ İÇİNDE bağımsızdır (dış değişkene/import'a erişmez, yalnızca tip import edilir).
//   sayfadakiAlanlar      GÖRÜNÜR form alanlarının yapısı: etiket (<label for>, sarmalayan label, aria-label /
//                         aria-labelledby, yakındaki metin, yer tutucu), tür, name/id, seçici önerisi (#id →
//                         [name=…] → role=…[name=…] → CSS yolu), zorunluluk, seçenekler (değer + metin), radyo ve onay
//                         kutusu grupları, dosya (accept), devre dışı/salt okunur, bölüm (fieldset/legend, başlıklar).
//                         Alan DEĞERİ okunmaz/döndürülmez.
//   formGonderimKorumasi  tarama sayfasında form gönderimini etkisizleştirir (submit/requestSubmit, submit olayı,
//                         window.open, sendBeacon) — ağ katmanındaki yazma isteği engeline ek savunma.
import type { HamAlan, HamRadyo, Kirilganlik, SayfaEnvanteri } from './paket-olusturucu.mjs';

export function sayfadakiAlanlar(): SayfaEnvanteri {
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

    const gorunur = gorunurMu(el) || ((tur === 'checkbox' || tur === 'file') && el.labels ? [...el.labels].some(gorunurMu) : false);
    if (!gorunur) return;
    const e = etiketBul(el, tur === 'checkbox');
    const { secici, kirilganlik, adaylar } = seciciOner(el, e.metin, rolu(el, tur));
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
    alanlar.push(alan);
  });

  const ozelBilesenSayisi = [...document.querySelectorAll('[role="combobox"]:not(input):not(select),[role="listbox"]:not(select),[contenteditable="true"],[role="textbox"]:not(input):not(textarea)')]
    .filter(gorunurMu).length;
  const cerceveSayisi = [...document.querySelectorAll('iframe')].filter(gorunurMu).length;
  return { alanlar, baslik: bosluk(document.title).slice(0, 200), ozelBilesenSayisi, cerceveSayisi };
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
