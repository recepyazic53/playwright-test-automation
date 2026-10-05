// SAYFA İÇİ fonksiyonlar (otomatik tarama) — page.evaluate / addInitScript ile tarayıcıda çalışır; bu yüzden her
// fonksiyon KENDİ İÇİNDE bağımsızdır (dış değişkene/import'a erişmez, yalnızca tip import edilir).
//   sayfadakiAlanlar      GÖRÜNÜR form alanlarının yapısı: etiket (<label for>, sarmalayan label, aria-label /
//                         aria-labelledby, yakındaki metin, yer tutucu), tür, name/id, seçici önerisi (#id →
//                         [name=…] → role=…[name=…] → CSS yolu), zorunluluk, seçenekler (değer + metin), radyo ve onay
//                         kutusu grupları, dosya (accept), devre dışı/salt okunur, bölüm (fieldset/legend, başlıklar).
//                         Alan DEĞERİ okunmaz/döndürülmez; yalnız "sayfada hazır geldi mi" (hazir) bilgisi verilir. Değerin kendisi (mevcut)
//                         YALNIZ degerOku=true iken (Hızlı test: hazır gelenleri kullanıcıya göstermek için) okunur; hiçbir yere yazılmaz.
//                         Etiket: yan yana sütun başlıkları (başlık satırı) alanın kendi sütununa eşlenir; etiketsiz alan yakınındaki (üstündeki /
//                         solundaki) görünen metinden ad alır.
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

export function sayfadakiAlanlar(derinlik = 0, degerOku = false): SayfaEnvanteri {
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const kacis = (d: string): string => CSS.escape(d);
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  // ---- Açık gölge kökleri (shadow DOM): alanlar ve seçicilerin tekilliği gölge köklerin içinde de aranır (Playwright'ın CSS ve rol
  // seçicileri açık gölge köklerini deler). Kapalı kökler okunamaz. ----
  const golgeKokleri: ShadowRoot[] = [];
  const kokleriTopla = (k: ParentNode, n = 0): void => {
    for (const e of Array.from(k.querySelectorAll('*'))) {
      // Nöbetçi'nin kendi arayüzü (kayıt paneli, seçme şeridi; kimliği "nobetci" ile başlar) okunmaz.
      if (e.shadowRoot && !e.closest('[id^="nobetci"]') && golgeKokleri.length < 200) { golgeKokleri.push(e.shadowRoot); if (n < 5) kokleriTopla(e.shadowRoot, n + 1); }
    }
  };
  kokleriTopla(document);
  /** Belge + açık gölge kökleri boyunca, sayfa (düz ağaç) sırasıyla eşleşen öğeler. */
  const derinSec = (s: string): Element[] => {
    if (!golgeKokleri.length) return [...document.querySelectorAll(s)];
    const l: Element[] = [];
    const yuru = (k: ParentNode): void => {
      for (const e of Array.from(k.children)) {
        if (e.matches(s)) l.push(e);
        if (e.shadowRoot && !e.closest('[id^="nobetci"]')) yuru(e.shadowRoot);
        yuru(e);
      }
    };
    yuru(document);
    return l;
  };
  const tekMi = (s: string): boolean => {
    try {
      let n = document.querySelectorAll(s).length;
      for (const k of golgeKokleri) { n += k.querySelectorAll(s).length; if (n > 1) return false; }
      return n === 1;
    } catch { return false; }
  };
  /** Öğenin kökündeki (belge ya da gölge kök) kimlikli öğe. */
  const kokteBul = (el: Element, id: string): Element | null => {
    const kok = el.getRootNode() as Document | ShadowRoot;
    return typeof kok.getElementById === 'function' ? kok.getElementById(id) : document.getElementById(id);
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
    return seciliGosterge(s);
  };
  /**
   * Bileşen kütüphanesi bilinmese de: gizli <select>'in SEÇİLİ METNİNİ gösteren görünür sarmalayıcısı ya da kardeşi (içinde başka form
   * denetimi yok, görünen yazısı tam olarak listenin bir seçeneğinin metni — genellikle seçili olanın; ör. "<div><span>1</span><a></a></div><ul hidden>…</ul><select hidden>").
   * Tıklanacak parça içindeki görünür bağlantı / düğme, yoksa kabın kendisi. Kural ozelBilesenIsaretle ile AYNIDIR.
   */
  function seciliGosterge(s: HTMLSelectElement): { kap: HTMLElement; tik: HTMLElement } | null {
    // (Gösterilen yazı bir seçeneğin metnidir: sayfa listeyi betikle değiştirince bileşen yazısını güncellemeyebilir.)
    const metinler = new Set([...s.options].map((o) => bosluk(o.text)).filter(Boolean));
    if (!metinler.size) return null;
    for (const e of [s.parentElement, s.previousElementSibling, s.nextElementSibling, s.previousElementSibling?.previousElementSibling]) {
      if (!(e instanceof HTMLElement) || e.matches('select,input,textarea,label,form,body,fieldset,option')) continue;
      if ([...e.querySelectorAll('input,select,textarea')].some((x) => x !== s) || !gorunurMu(e)) continue;
      if (!metinler.has(bosluk(e.innerText))) continue;
      const tik = ([...e.querySelectorAll('a,[role="button"],button')].find((x) => gorunurMu(x)) as HTMLElement | undefined) ?? e;
      return { kap: e, tik };
    }
    return null;
  }
  const ozelKaplar = new Map<HTMLSelectElement, { kap: HTMLElement; tik: HTMLElement }>();
  for (const s of derinSec('select') as HTMLSelectElement[]) {
    const b = ozelBilesen(s);
    if (b) ozelKaplar.set(s, b);
  }
  const kaplar = [...ozelKaplar.values()].map((b) => b.kap);
  /** Öğe bir özel bileşenin (kabı ya da açılır parçası) içinde mi? (Bileşenin kendi arama kutusu ayrı alan sayılmaz.) */
  // (Kabın içindeki gizli <select>'in kendisi alandır: sarmalayıcı kap onu içerir.)
  /**
   * Gizli onay kutusu / radyo girdisinin GÖRÜNEN yerine geçen çizimi (özel çizimli kutular: gerçek girdi gizli, yanında kutu çizen
   * küçük bir öğe): girdinin hemen önceki / sonraki kardeşi ya da yalnız bu girdiyi saran ebeveyni; görünür, başka form denetimi
   * içermez, kutu boyunda (en çok 64 piksel). Kütüphane / sınıf adına bakılmaz.
   */
  const gorselVekil = (el: Element): HTMLElement | null => {
    if (gorunurMu(el)) return null;
    for (const v of [el.previousElementSibling, el.nextElementSibling, el.parentElement]) {
      if (!(v instanceof HTMLElement) || v.matches('label,form,body,fieldset,select,input,textarea')) continue;
      if ([...v.querySelectorAll('input,select,textarea')].some((x) => x !== el) || !gorunurMu(v)) continue;
      const r = v.getBoundingClientRect();
      if (r.width <= 64 && r.height <= 64) return v;
    }
    return null;
  };
  const ozelIcinde = (el: Element): boolean => !(el instanceof HTMLSelectElement && ozelKaplar.has(el)) && (kaplar.some((k) => k.contains(el)) || !!el.closest(OZEL_ACILIR));
  const saltMetin = (el: Element): string => {
    const k = el.cloneNode(true) as Element;
    k.querySelectorAll(`${KONTROLLER},script,style,option,noscript,template`).forEach((x) => x.remove());
    return bosluk(k.textContent);
  };
  const etiketTemizle = (m: string): string => bosluk(m).replace(/[\s:*：]+$/u, '').replace(/^[\s*]+/, '').trim().slice(0, 160);
  const idMetni = (ids: string | null, kaynak: Element | null = null): string => (ids ?? '').split(/\s+/).filter(Boolean)
    .map((id) => { const e = kaynak ? kokteBul(kaynak, id) : document.getElementById(id); return e ? saltMetin(e) : ''; }).filter(Boolean).join(' ');

  /** Form denetimleri (gizli alanlar sayılmaz). */
  const denetimleri = (e: Element): Element[] => (e.matches('input,select,textarea') ? [e] : [...e.querySelectorAll('input,select,textarea')])
    .filter((x) => !(x instanceof HTMLInputElement && x.type === 'hidden'));
  /** Serbest metin kutusu mu (radyo / onay kutusu / liste değil)? */
  const metinKutusuMu = (x: Element): boolean => x instanceof HTMLTextAreaElement
    || (x instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color'].includes(x.type));
  /** Kap yalnız bu alanı mı sarıyor (içinde başka denetim ve kendi yazısı yok)? Süsleme kütüphanelerinin iç içe kapları böyledir. */
  const yalnizSarar = (kap: Element, el: Element): boolean => {
    const d = denetimleri(kap);
    return d.length === 1 && d[0] === el && !saltMetin(kap);
  };
  /**
   * Yakındaki metin: öğenin (ya da atalarının) önceki kardeşlerindeki ilk kısa metin. Yalnız bu alanı saran kaplar düzey sayılmaz (en çok
   * 3 gerçek düzey): süsleme kütüphaneleri kutuyu birkaç kat sarar, ad ise satırın ayrı bir sütunundadır. Önceki kardeşte yalnız metin
   * kutusu varsa (aynı satırda alan kodu + numara gibi birden çok kutu) atlanır ve satırın adı sıra ekiyle ("Telefon (2)") alınır;
   * radyo / onay kutusu / liste varsa durulur: oradaki yazı onların seçeneği, seçili değeri ya da adıdır. Başka bir denetimin etiketi
   * (label[for=başka]) de bu alanın adı olamaz.
   */
  const yakinMetin = (el: Element): string | null => {
    let d: Element | null = el;
    let seviye = 0;
    let kardes = 0;
    for (let adim = 0; adim < 12 && d; adim++) {
      let o: ChildNode | null = d.previousSibling;
      while (o) {
        // Özel bileşenin kutusu ("Seçiniz…") etiket değildir: atlanır.
        // (Kabın içindeki parçalar da: seçili metni gösteren kutu, gizli seçenek listesi.)
        if (o instanceof Element && kaplar.some((k) => k === o || k.contains(o as Element))) { o = o.previousSibling; continue; }
        if (o instanceof Element && o.matches('label')) {
          const hedef = (o as HTMLLabelElement).control;
          // Atlanan yan kutunun etiketi satırın adıdır ("İl [kutu] [kutu]" → ikinci kutu "İl (2)"); değilse başka denetimin adı.
          if (hedef && hedef !== el && !kardes) return null;
        }
        if (o instanceof Element) {
          const ds = denetimleri(o);
          if (ds.length) {
            if (!ds.every(metinKutusuMu)) return null;
            kardes += ds.length;
            o = o.previousSibling;
            continue;
          }
        }
        const t = o.nodeType === Node.TEXT_NODE ? bosluk(o.textContent) : o instanceof Element && !o.matches(KONTROLLER) && gorunurMu(o) ? saltMetin(o) : '';
        // Yalnız ayraç olan metin (":", "*", "-") etiket değildir: atlanıp bir öncekine bakılır ("Ad : [input]" tabloları).
        if (t && /[\p{L}\p{N}]/u.test(t)) return t.length <= 80 ? (kardes ? `${etiketTemizle(t)} (${kardes + 1})` : t) : null;
        o = o.previousSibling;
      }
      const ust: Element | null = d.parentElement;
      if (!ust || ust.matches('form,fieldset,body,main,section,article')) break;
      if (!yalnizSarar(ust, el) && ++seviye >= 3) break;
      d = ust;
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


  // ---- Görsel yakınlık: sütun başlığı ve etiketsiz alanın yakınındaki görünen metin ----
  type MetinOgesi = { metin: string; r: DOMRect };
  /** Öğenin doğrudan metin düğümlerinin kapladığı alan (öğenin kutusu değil: sabit genişlikli başlık hücresi yazıyı aşabilir). */
  const metinKutusu = (e: Element): DOMRect | null => {
    let sol = Infinity; let ust = Infinity; let sag = -Infinity; let alt = -Infinity;
    for (const c of e.childNodes) {
      if (c.nodeType !== Node.TEXT_NODE || !bosluk(c.textContent)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(c);
      for (const r of rg.getClientRects()) {
        if (r.width <= 0 || r.height <= 0) continue;
        sol = Math.min(sol, r.left); ust = Math.min(ust, r.top); sag = Math.max(sag, r.right); alt = Math.max(alt, r.bottom);
      }
    }
    return sol === Infinity ? null : new DOMRect(sol, ust, sag - sol, alt - ust);
  };
  /** Kökün altındaki görünür, denetimsiz, KISA metin öğeleri (başlık / etiket adayları). */
  const metinOgeleri = (kok: Element, sinir = 400): MetinOgesi[] => {
    const sonuc: MetinOgesi[] = [];
    const adaylar: Element[] = [kok, ...kok.querySelectorAll('*')];
    for (const e of adaylar.slice(0, sinir)) {
      if (e.matches(`${KONTROLLER},option,script,style,noscript,template,svg`) || e.closest('select,button,option,script,style')) continue;
      let dogrudan = '';
      e.childNodes.forEach((c) => { if (c.nodeType === Node.TEXT_NODE) dogrudan += c.textContent ?? ''; });
      const t = etiketTemizle(dogrudan);
      if (!t || t.length > 60 || !/\p{L}/u.test(t) || !gorunurMu(e)) continue;
      const r = metinKutusu(e);
      if (r) sonuc.push({ metin: t, r });
    }
    return sonuc;
  };
  const alanKutusu = (el: Element): DOMRect => ((el instanceof HTMLSelectElement ? ozelKaplar.get(el)?.kap : undefined) ?? el).getBoundingClientRect();
  /**
   * Yan yana sütun başlıkları: alanın (ya da atalarının) öncesindeki, denetim içermeyen bir "başlık satırı" (≥ 2 metin) varsa
   * alanın YATAY OLARAK hizalandığı başlığı döndürür (tablo th'leri de, <div> hücreleri de). Başlık alanın hemen üstünde olmalı.
   */
  const sutunBasligi = (el: Element): string | null => {
    const k = alanKutusu(el);
    let d: Element | null = el;
    for (let seviye = 0; seviye < 6 && d && !d.matches('body,html'); seviye++) {
      let o: Element | null = d.previousElementSibling;
      for (let sayi = 0; o && sayi < 3; sayi++, o = o.previousElementSibling) {
        if (o.matches(KONTROLLER) || o.querySelector(KONTROLLER)) break;
        if (!gorunurMu(o)) continue;
        const ogeler = metinOgeleri(o);
        if (new Set(ogeler.map((x) => Math.round(x.r.left / 4))).size < 2) continue;
        let en: { metin: string; puan: number } | null = null;
        for (const x of ogeler) {
          const dikey = k.top - x.r.bottom;
          if (dikey < -4 || dikey > 56) continue;
          const bosluk_ = Math.max(0, Math.max(x.r.left, k.left) - Math.min(x.r.right, k.right));
          if (bosluk_ > 16) continue;
          const puan = bosluk_ * 10 + Math.abs((x.r.left + x.r.right) / 2 - (k.left + k.right) / 2) * 0.1 + dikey * 0.01;
          if (!en || puan < en.puan) en = { metin: x.metin, puan };
        }
        if (en) return en.metin;
      }
      d = d.parentElement;
    }
    return null;
  };
  /** Alan bir "tablo satırında" mı: aynı yatay bantta (üst üste binen) yanında başka görünür alan var. */
  const satirdaBaskaAlanVar = (el: Element): boolean => {
    const k = alanKutusu(el);
    return [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].some((x) => {
      if (x === el || (x instanceof HTMLInputElement && ['submit', 'button', 'reset', 'image'].includes(x.type)) || !gorunurMu(x)) return false;
      const r = x.getBoundingClientRect();
      return Math.min(r.bottom, k.bottom) - Math.max(r.top, k.top) >= 0.5 * Math.min(r.height, k.height) && (r.right <= k.left + 2 || r.left >= k.right - 2);
    });
  };
  let tumMetinler: MetinOgesi[] | null = null;
  /** Etiketsiz alan: alanın hemen üstündeki ya da solundaki (aynı satır) görünen en yakın kısa metin. */
  const gorselEtiket = (el: Element): string | null => {
    tumMetinler ??= metinOgeleri(document.body, 1500);
    const k = alanKutusu(el);
    let en: { metin: string; puan: number } | null = null;
    for (const x of tumMetinler) {
      const r = x.r;
      if (r.right > k.left + 4 && r.left < k.right && r.bottom > k.top && r.top < k.bottom) continue; // alanın içindeki metin (ör. bileşenin kendi yazısı)
      const ustte = k.top - r.bottom >= -4 && k.top - r.bottom <= 48 && r.left <= k.right && r.right >= k.left - 24 && Math.abs(r.left - k.left) <= Math.max(48, k.width);
      const solda = Math.min(r.bottom, k.bottom) - Math.max(r.top, k.top) >= 0.4 * Math.min(r.height, k.height) && k.left - r.right >= -4 && k.left - r.right <= 200;
      if (!ustte && !solda) continue;
      const puan = ustte ? (k.top - r.bottom) + Math.abs(r.left - k.left) * 0.3 : (k.left - r.right) * 0.6;
      if (!en || puan < en.puan) en = { metin: x.metin, puan };
    }
    return en?.metin ?? null;
  };
  const kar = (m: string): string => m.replace(/\s+/g, '').toLocaleLowerCase('tr');


  /**
   * Yer tutucu (placeholder) seçenek: "SEÇİNİZ", "Seçiniz", "-- Lütfen seçin --", "Ülke seçiniz", "Please select", "--", boş metin; ya da
   * listenin İLK seçeneği değeri "" / "0" / "-1" ve metninde rakam yok. Böyle bir seçenekte kalan liste DOLDURULMASI GEREKEN alandır
   * (sayfada hazır gelen değer sayılmaz). Türkçe büyük harf (İ) için yerel küçük harfe çevrilerek bakılır.
   * (Sunucu tarafındaki eşi: tarama/yer-tutucu-secenek.mjs > yerTutucuSecenekMi — sayfa içinde içe aktarma olmadığı için aynı kural.)
   */
  const yerTutucuMu = (metin: string, deger: string, ilk: boolean): boolean => {
    const n = metin.toLocaleLowerCase('tr').replace(/[\s\-–—.…*:_()[\]<>«»"'!]+/g, ' ').trim();
    if (!n) return true;
    if (/^(?:(?:\p{L}+ ){0,3})?(?:lütfen )?(?:bir )?(?:seç|seçiniz|seçin|seçim yapınız|seçim yapın|seçiniz lütfen)$/u.test(n)) return true;
    if (/^(?:please )?(?:select|choose)(?: (?:one|an? \p{L}+|\p{L}+))?$/u.test(n)) return true;
    return ilk && ['', '0', '-1'].includes(deger.trim()) && !/\d/.test(n);
  };
  /** Alanın sayfada HAZIR gelen değeri (dolu mu) — değer yalnız degerOku iken metin olarak da döner. */
  const hazirBilgisi = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, tur: string): { hazir: boolean; mevcut: string | null } => {
    const kes = (m: string): string | null => (degerOku && m ? m.slice(0, 80) : null);
    if (tur === 'password' || tur === 'file') return { hazir: false, mevcut: null };
    if (el instanceof HTMLSelectElement) {
      const sec = el.selectedOptions[0];
      if (!sec) return { hazir: false, mevcut: null };
      const metin = bosluk(sec.label || sec.text);
      const bos = el.multiple ? false : sec.value === '' || yerTutucuMu(metin, sec.value, sec.index === 0);
      return { hazir: !bos, mevcut: bos ? null : kes(el.multiple ? [...el.selectedOptions].map((o) => bosluk(o.label || o.text)).join(', ') : metin) };
    }
    if (tur === 'checkbox') return { hazir: (el as HTMLInputElement).checked, mevcut: (el as HTMLInputElement).checked ? kes('İşaretli') : null };
    // Zengin metin alanı (contenteditable): görünen yazısı.
    const v = bosluk(tur === 'contenteditable' ? (el as unknown as HTMLElement).innerText : el.value);
    return { hazir: v !== '', mevcut: kes(v) };
  };

  type EtiketBilgisi = { metin: string | null; kaynak: HamAlan['etiketKaynagi']; yildiz: boolean };
  const etiketBul = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, secimliMi: boolean): EtiketBilgisi => {
    const etiketler = el.labels ? [...el.labels] : [];
    for (const l of etiketler) {
      const ham = saltMetin(l);
      if (ham) return { metin: etiketTemizle(ham), kaynak: l.contains(el) ? 'sarmalayan' : 'label', yildiz: ham.includes('*') };
    }
    const aria = idMetni(el.getAttribute('aria-labelledby'), el) || bosluk(el.getAttribute('aria-label'));
    if (aria) return { metin: etiketTemizle(aria), kaynak: 'aria', yildiz: aria.includes('*') };
    let yakin = secimliMi ? sonrakiMetin(el) ?? yakinMetin(el) : yakinMetin(el);
    // Yan yana sütun başlıkları tek metin olarak gelmişse (ya da hiç gelmemişse) alanın kendi sütununun başlığı alınır.
    const sutun = secimliMi && yakin ? null : sutunBasligi(el);
    if (sutun && (!yakin || (kar(yakin) !== kar(sutun) && (kar(yakin).includes(kar(sutun)) || satirdaBaskaAlanVar(el))))) yakin = sutun;
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
    const gorsel = gorselEtiket(el);
    if (gorsel) return { metin: gorsel, kaynak: 'yakin', yildiz: false };
    return { metin: null, kaynak: null, yildiz: false };
  };

  /**
   * Sayfanın üst çubuğu / menüsü / altbilgisi (oturum açmış kullanıcının adı, menü, telif satırı): bölüm başlığı buradan alınmaz.
   * <header> / <footer> yalnız sayfa düzeyindeyse (main, section, article, form, fieldset, pencere içinde değilse) sayılır.
   */
  const ustBantta = (e: Element): boolean => {
    const bant = e.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], .navbar, .topbar, .top-bar');
    if (!bant) return false;
    return !(bant.matches('header, footer') && bant.parentElement?.closest('main, section, article, form, fieldset, aside, dialog, [role="main"], [role="dialog"]'));
  };
  const basliklar = [...document.querySelectorAll('h2,h3,h4,h5,h6,[role="heading"]')].filter((b) => gorunurMu(b) && saltMetin(b) && !ustBantta(b));
  const anaBaslik = [...document.querySelectorAll('h1')].find((b) => gorunurMu(b) && saltMetin(b) && !ustBantta(b)) ?? null;
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
  for (const c of derinSec('input[type="checkbox"][name]')) {
    const ad = c.getAttribute('name') ?? '';
    onayAdlari.set(ad, (onayAdlari.get(ad) ?? 0) + 1);
  }

  const alanlar: HamAlan[] = [];
  const islenenRadyoOgeleri = new Set<Element>();
  // Form alanları + zengin metin alanları (contenteditable / role=textbox; iç içe olanın yalnız en dıştaki). Gölge köklerin içi dahil.
  const ZENGIN = '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]:not(input):not(textarea)';
  const zenginMi = (e: Element): boolean => !(e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement);
  const ogeler = derinSec(`input, select, textarea, ${ZENGIN}`)
    .filter((e) => !zenginMi(e) || !e.parentElement?.closest(ZENGIN)) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  ogeler.forEach((el, sira) => {
    const etiketAdi = el.tagName.toLowerCase();
    const tur = zenginMi(el) ? 'contenteditable' : el instanceof HTMLInputElement ? (el.getAttribute('type') || 'text').toLowerCase() : etiketAdi;
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(tur)) return;
    if (ozelIcinde(el)) return;
    const devreDisi = el.matches(':disabled');
    const zorunluOzellik = el.required || el.getAttribute('aria-required') === 'true';

    if (tur === 'radio') {
      if (islenenRadyoOgeleri.has(el)) return;
      const gercekAd = el.getAttribute('name');
      // Grup: aynı name'li radyolar; name yoksa aynı kaptaki (radiogroup / fieldset; yoksa radyonun yalnız kendisini saran kabın üstü)
      // name'siz radyolar — kimliği (id) olmayan gruplar da tek alan olarak okunur.
      let grup: HTMLInputElement[];
      // (aynı kökte: belge ya da gölge kök)
      if (gercekAd) grup = [...(el.getRootNode() as Document | ShadowRoot).querySelectorAll(`input[type="radio"][name="${tirnak(gercekAd)}"]`)] as HTMLInputElement[];
      else {
        let kap: Element | null = el.closest('[role="radiogroup"], fieldset') ?? el.parentElement;
        const adsizlar = (k: Element): HTMLInputElement[] => [...k.querySelectorAll('input[type="radio"]:not([name])')] as HTMLInputElement[];
        for (let i = 0; kap && i < 3 && adsizlar(kap).length < 2 && !kap.matches('form, body, main, [role="radiogroup"], fieldset'); i++) kap = kap.parentElement;
        const radyo = el as HTMLInputElement;
        grup = kap ? adsizlar(kap) : [radyo];
        if (!grup.includes(radyo)) grup = [radyo];
      }
      for (const r of grup) islenenRadyoOgeleri.add(r);
      const gorunenler = grup.filter((r) => gorunurMu(r) || (r.labels ? [...r.labels].some(gorunurMu) : false) || Boolean(gorselVekil(r)));
      if (!gorunenler.length) return;
      const secenekMetni = (r: HTMLInputElement): string | null => {
        const lm = r.labels && r.labels.length ? saltMetin(r.labels[0]) : sonrakiMetin(r);
        return lm ? etiketTemizle(lm) : null;
      };
      const secenekMetinleri = new Set(grup.map((r) => kar(secenekMetni(r) ?? '')).filter(Boolean));
      // Grup etiketi: yalnızca bu grubu içeren fieldset'in legend'ı, radiogroup'un aria adı, grubun ilk radyosunun önündeki metin (ör.
      // "<span>Biçim:</span> <label><input> PDF</label>"; tablo satırında satırın başlık hücresi) ya da yalnız bu grubu saran kabın önündeki metin.
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
        const t = idMetni(rg.getAttribute('aria-labelledby'), rg) || bosluk(rg.getAttribute('aria-label'));
        if (t) { etiket = etiketTemizle(t); kaynak = 'aria'; }
      }
      // Seçeneğin kendi yazısı grup adı olamaz.
      const grupAdi = (t: string | null): string | null => (t && !secenekMetinleri.has(kar(etiketTemizle(t))) ? t : null);
      if (!etiket) {
        const t = grupAdi(yakinMetin(grup[0]));
        if (t) { etiket = etiketTemizle(t); kaynak = 'yakin'; }
      }
      if (!etiket) {
        let kap: Element | null = el.parentElement;
        while (kap && !grup.every((r) => kap?.contains(r))) kap = kap.parentElement;
        const yalnizGrup = kap ? denetimleri(kap).every((x) => grup.includes(x as HTMLInputElement)) : false;
        const t = kap && yalnizGrup ? grupAdi(yakinMetin(kap)) : null;
        if (t) { etiket = etiketTemizle(t); kaynak = 'yakin'; }
      }
      // Seçeneğin seçicisi: kimlik → name + value → rol + yazı → CSS yolu (kimliği olmayan radyo da seçilebilir).
      const radyolar: HamRadyo[] = grup.map((r) => {
        const metin = secenekMetni(r);
        return { deger: r.value, metin, secici: seciciOner(r, metin, 'radio').secici };
      });
      const secici = gercekAd ? `input[type="radio"][name="${tirnak(gercekAd)}"]` : seciciOner(el, etiket, 'radio').secici;
      alanlar.push({
        anahtar: anahtarVer(gercekAd ? `radyo:${gercekAd}` : `radyo:${el.id || etiket || sira}`), tur: 'radio', etiket, etiketKaynagi: kaynak,
        kimlik: null, ad: gercekAd, secici, kirilganlik: gercekAd ? 'dusuk' : 'yuksek',
        adaySeciciler: gercekAd ? [secici, `input[name="${tirnak(gercekAd)}"]`, `[name="${tirnak(gercekAd)}"]`] : [secici],
        zorunlu: grup.some((r) => r.required) || rg?.getAttribute('aria-required') === 'true', devreDisi: grup.every((r) => r.disabled),
        saltOkunur: false, coklu: false, radyolar, bolum: bolumBul(el, grupFieldset),
        ...(gorunenler.every((r) => !gorunurMu(r) && !(r.labels && [...r.labels].some(gorunurMu))) ? { gizliGirdi: true } : {}),
        ...(() => {
          const i = grup.findIndex((r) => r.checked);
          return { hazir: i >= 0, mevcut: i >= 0 && degerOku ? (radyolar[i].metin ?? radyolar[i].deger).slice(0, 80) : null };
        })()
      });
      return;
    }

    const ozel = el instanceof HTMLSelectElement ? ozelKaplar.get(el) : undefined;
    // Gizli onay kutusunun yerine çizilen görünür kutu (etiketi olmasa da alan görünür sayılır; doldurulurken girdi betikle tıklanır).
    const vekil = tur === 'checkbox' ? gorselVekil(el) : null;
    const gorunur = Boolean(ozel) || gorunurMu(el) || ((tur === 'checkbox' || tur === 'file') && el.labels ? [...el.labels].some(gorunurMu) : false) || Boolean(vekil);
    if (!gorunur) return;
    const e = etiketBul(el, tur === 'checkbox');
    // Özel bileşende rol seçicisi (role=combobox[name=…]) gizli <select>'i bulamaz: kimlik / ad / CSS yolu.
    const { secici, kirilganlik, adaylar } = seciciOner(el, e.metin, ozel ? null : rolu(el, tur));
    const id = el.getAttribute('id');
    const ad = el.getAttribute('name');
    const grup = tur === 'checkbox' && ad && (onayAdlari.get(ad) ?? 0) > 1 ? ad : null;
    // Kimlik gölge bileşenlerde tekrarlanabilir (her bileşende id="i"): yalnız sayfada tekse anahtar olur, değilse name.
    const temelAnahtar = id && (tekMi(`#${kacis(id)}`) || !ad) ? `#${id}` : ad ? `@${ad}${grup ? `=${(el as HTMLInputElement).value}` : ''}` : e.metin ? `~${e.metin}` : `${etiketAdi}:${sira}`;
    const alan: HamAlan = {
      anahtar: anahtarVer(temelAnahtar), tur, etiket: e.metin, etiketKaynagi: e.kaynak, kimlik: id, ad, secici, kirilganlik, adaySeciciler: adaylar,
      zorunlu: zorunluOzellik || e.yildiz, devreDisi,
      saltOkunur: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : false) || el.getAttribute('aria-readonly') === 'true',
      coklu: el instanceof HTMLSelectElement ? el.multiple : false, grup, bolum: bolumBul(el), ...hazirBilgisi(el, tur)
    };
    if (el instanceof HTMLSelectElement) {
      alan.secenekler = [...el.options].slice(0, 300).map((o) => ({ deger: o.value, metin: bosluk(o.label || o.text) }));
    }
    if (tur === 'file') alan.kabul = el.getAttribute('accept') || null;
    const metinTuru = el instanceof HTMLInputElement && ['text', 'search', ''].includes(tur);
    // Salt okunur ama yalnız takvimden seçilen tarih alanı: adı / yer tutucusu / sınıfı tarih ya da takvim çağrıştırıyor ya da açılır pencere
    // (aria-haspopup) bildiriyor. Doldurulabilir sayılır (değer + olaylar; olmazsa takvimden).
    if (metinTuru && !devreDisi) {
      const ipucu = `${e.metin ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('name') ?? ''} ${id ?? ''} ${el.getAttribute('class') ?? ''}`.toLocaleLowerCase('tr');
      const tarihIpucu = /tarih|date|takvim|calendar|datepicker|gün|day/.test(ipucu) || ['dialog', 'grid', 'true'].includes(el.getAttribute('aria-haspopup') ?? '');
      // Salt okunur DEĞİL ama yazmayı engelleyen tarih alanı: tuş basımı sayfanın betiğiyle engelli (onkeypress / onkeydown "return false" /
      // preventDefault) ya da takvim bileşenine bağlı (takvim kütüphanelerinin "datepicker" sınıfı ya da yanında takvim simgesi / düğmesi).
      // Gerçek tuşlarla yazılamaz: değer + olaylarla (olmazsa takvimden) yazılır.
      const tusEngelli = /return\s+false|preventDefault/i.test(`${el.getAttribute('onkeypress') ?? ''} ${el.getAttribute('onkeydown') ?? ''}`);
      const simgeMi = (x: Element | null): boolean => Boolean(x) && x instanceof Element && x.matches('img,button,span,a,i')
        && /takvim|calendar|datepicker|date-picker/i.test(`${x.getAttribute('class') ?? ''} ${x.getAttribute('alt') ?? ''} ${x.getAttribute('title') ?? ''} ${x.getAttribute('aria-label') ?? ''}`);
      const takvimBileseni = /(^|\s)(hasDatepicker|datepicker|date-picker|flatpickr-input)(\s|$)/i.test(el.getAttribute('class') ?? '')
        || simgeMi(el.nextElementSibling) || simgeMi(el.nextElementSibling?.nextElementSibling ?? null);
      if (alan.saltOkunur ? tarihIpucu : (takvimBileseni || (tusEngelli && tarihIpucu))) alan.takvimden = true;
    }
    // En çok karakter (maxlength) ve desen (pattern): veri durağında ipucu; seçime göre değişirse keşif kaydeder.
    if ((metinTuru || el instanceof HTMLTextAreaElement || ['tel', 'email', 'number', 'url', 'password'].includes(tur)) && !zenginMi(el)) {
      const ml = (el as HTMLInputElement).maxLength;
      if (Number.isInteger(ml) && ml > 0 && ml < 100_000) alan.enCok = ml;
      const desen = el.getAttribute('pattern');
      if (desen) alan.desen = desen.slice(0, 200);
    }
    // "Yazıp Enter'a basın" (etiket / beceri girdisi): değer Enter ile eklenir; doldurduktan sonra Enter (modelde doldurucuParametreleri.tus).
    // ("Enter your name" gibi İngilizce yönergeler sayılmaz: yalnız Enter'a basma yönergesi.)
    if (metinTuru && /enter['’]?\s*(?:a|e|ya|ye)?\s*bas|enter\s*tuşu|enter\s+ile\s+ekle|(?:press|hit)\s+enter/i.test(`${e.metin ?? ''} ${el.getAttribute('placeholder') ?? ''} ${idMetni(el.getAttribute('aria-describedby'), el)}`)) alan.tus = 'Enter';
    // Otomatik tamamlama: yazınca öneri listesi açılan alan (aria-autocomplete, role=combobox, list, bağlı liste kutusu ya da yanında liste).
    if (metinTuru && !alan.saltOkunur) {
      const bagliIdler = `${el.getAttribute('aria-controls') ?? ''} ${el.getAttribute('aria-owns') ?? ''}`.split(/\s+/).filter(Boolean);
      const bagliListe = bagliIdler.some((x) => kokteBul(el, x)?.matches('[role="listbox"], ul, ol, datalist'));
      const yanindaListe = Boolean(el.parentElement?.querySelector(':scope > [role="listbox"]'));
      if (['list', 'both'].includes(el.getAttribute('aria-autocomplete') ?? '') || el.getAttribute('role') === 'combobox' || el.hasAttribute('list') || bagliListe || yanindaListe) alan.oneri = true;
    }
    if (vekil && !gorunurMu(el) && !(el.labels && [...el.labels].some(gorunurMu))) alan.gizliGirdi = true;
    if (ozel) {
      alan.ozelBilesen = true;
      alan.bilesen = seciciOner(ozel.kap, null, null).secici;
    }
    // Düzenlenebilirlik (salt okuma; alanKilidi — init betiğiyle bu belgenin penceresinde): yoksa okunmaz. Seçime göre değişirse keşif kaydeder.
    if (!ozel) {
      const kilidi = (window as unknown as { __nobetciAlanKilidi?: (e: Element) => string | null }).__nobetciAlanKilidi;
      let k: string | null = null;
      try { k = typeof kilidi === 'function' ? kilidi(el) : null; } catch { k = null; }
      if (k) alan.kilit = k;
    }
    alanlar.push(alan);
  });

  // Alan olarak okunamayan özel bileşenler (combobox / listbox; zengin metin alanları artık alan olarak okunur).
  const ozelBilesenSayisi = derinSec('[role="combobox"]:not(input):not(select),[role="listbox"]:not(select)')
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
      const w = f.contentWindow as (Window & { __nobetciSayfadakiAlanlar?: (d: number, o?: boolean) => SayfaEnvanteri }) | null;
      if (f.contentDocument && w && derinlik + 1 <= 2 && typeof w.__nobetciSayfadakiAlanlar === 'function') alt = w.__nobetciSayfadakiAlanlar(derinlik + 1, degerOku);
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
 * Alanın şu an DÜZENLENEMEZ olup olmadığı (sayfa içi; kendi içinde bağımsız — envanter, keşif, hızlı test ve normal koşunun ORTAK kuralı).
 * YALNIZ OKUR: sayfaya yazmaz, olay göndermez, geri alacak bir şey bırakmaz. Nedeni döner (düzenlenebilirse null):
 *  - 'devre-disi'      disabled ya da kapsayan fieldset disabled (:disabled),
 *  - 'salt-okunur'     readonly ya da aria-readonly="true",
 *  - 'aria-devre-disi' kendisi ya da kapsayanı aria-disabled="true",
 *  - 'takvim-kilidi'   takvim bileşenine bağlı (hasDatepicker / datepicker / flatpickr sınıfı) ve kilit sınıfı taşıyor (disabled,
 *                      readonly, locked…) ya da bileşenin kendi kaydında kapalı (jQuery UI datepicker'ın kapalı listesi; okunur).
 * Yalnız 'devre-disi' ve 'salt-okunur' kesin kanıttır; 'aria-devre-disi' ve 'takvim-kilidi' keşfin "seçime göre kilitlenir" kaydı içindir —
 * koşu bunlarla alanı önden atlamaz, yalnız model alanı seçime göre kilitli diyorsa (alan-kilitleri.mjs > kilitEngeller).
 * Kural genel: alan adı / ekran / ürün bilgisi yoktur.
 */
export function alanKilidi(el: Element): string | null {
  if (!el || el.nodeType !== 1) return null;
  const g = (el.ownerDocument?.defaultView ?? window) as Window & { jQuery?: any };
  const etiketAdi = el.tagName;
  if (el.matches(':disabled')) return 'devre-disi';
  if (((etiketAdi === 'INPUT' || etiketAdi === 'TEXTAREA') && (el as HTMLInputElement).readOnly) || el.getAttribute('aria-readonly') === 'true') return 'salt-okunur';
  if (el.closest('[aria-disabled="true"]')) return 'aria-devre-disi';
  const sinif = el.getAttribute('class') ?? '';
  if (/(^|\s)(hasDatepicker|datepicker|date-picker|flatpickr-input)(\s|$)/i.test(sinif)) {
    if (/(^|[\s_-])(disabled|readonly|read-only|locked|kilitli)($|[\s_-])/i.test(sinif.replace(/(^|\s)(hasDatepicker|datepicker|date-picker|flatpickr-input)(?=\s|$)/gi, ' '))) return 'takvim-kilidi';
    try {
      const dp = g.jQuery?.datepicker;
      if (dp && typeof dp._isDisabledDatepicker === 'function' && dp._isDisabledDatepicker(el)) return 'takvim-kilidi';
    } catch { /* okunamadı */ }
  }
  // Olay işleyicisinin kaynağına (preventDefault / return false) ya da alanın üstündeki öğeye bakan sezgiler (eski 'tus-deger' ve 'ortu')
  // kaldırıldı: maske eklentileri de tuşu engeller, örtü anlık olabilir — yanlış pozitif üretiyordu. Önce dene: alan yazılır, sayfa
  // yazılanı kabul etmezse yazma yolu bunu görür (alan-cikisi.ts > alanaYaz → 'kilitli').
  return null;
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
  // Seçili metni gösteren görünür sarmalayıcı / kardeş (sayfadakiAlanlar > seciliGosterge ile AYNI kural).
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const sel = s as HTMLSelectElement;
  const metinler = new Set([...sel.options].map((o) => bosluk(o.text)).filter(Boolean));
  if (!metinler.size) return false;
  for (const e of [s.parentElement, s.previousElementSibling, s.nextElementSibling, s.previousElementSibling?.previousElementSibling]) {
    if (!e || e.matches('select,input,textarea,label,form,body,fieldset,option')) continue;
    if ([...e.querySelectorAll('input,select,textarea')].some((x) => x !== s) || !gorunurMu(e)) continue;
    if (!metinler.has(bosluk((e as HTMLElement).innerText))) continue;
    const tik = [...e.querySelectorAll('a,[role="button"],button')].find((x) => gorunurMu(x)) ?? e;
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
