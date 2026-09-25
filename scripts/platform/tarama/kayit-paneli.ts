// AKIŞ KAYDI — SAYFA İÇİ fonksiyonlar ("Akışı kaydet"; kayit-motoru.ts addInitScript ile verir). Tarayıcıda çalışırlar; bu
// yüzden her fonksiyon KENDİ İÇİNDE bağımsızdır (dış değişkene/import'a erişmez, yalnızca tip import edilir).
//   kayitPaneliniKur   sayfanın köşesindeki Nöbetçi paneli (ayrı shadow kökünde; sitenin stiline/koduna karışmaz, sayfa
//                      envanterine girmez). Panel yalnızca TOPLAR (topla → tasarla; akışın diyagramı "Bitir"den sonra
//                      Nöbetçi'de kurulur):
//                        - "Görülen alanlar": ekranda görülen form alanları (etiket + tür; DEĞER YOK). Kullanıcı listeye
//                          alınacakları işaretler (varsayılan: dokunduğu alanlar); "şu an görünmüyor" / "yeni" işaretleri,
//                        - "Ekranı yeniden oku": yeni açılan alanları listeye getirir (ekran ayrıca kendiliğinden okunur:
//                          açılışta, seçim/onay kutusu değişince ve düğmeye basıldıktan sonra),
//                        - basılan düğmeler (seçici + görünen metni) — düğmeye basılmadan HEMEN ÖNCEKİ ekran da okunur
//                          (sayfa değişse bile o adımın alanları kaybolmaz),
//                        - "Mesaj seç": sayfada beklenen mesajı gösteren öğeye tıklanır (tıklama SİTEYE GİTMEZ),
//                        - "Bitir" / "Sıfırla" / "İptal".
//                      Ekran okuması sayfada eşzamanlı yapılır (window.__nobetciSayfadakiAlanlar vb. — kayıt motoru init
//                      betiğiyle verir) ve köprüyle (exposeBinding) kayıt motoruna gider; durum motordadır (sayfa değişse
//                      de kalır).
//   dokunulanlariBul   alanların aday CSS seçicileri → son düğme basışından beri kullanıcı o alana dokundu mu?
//   secimDegerleri     seçim alanlarının (select/radyo) seçili SEÇENEK değeri (metin kutusu değeri okunmaz).
import type { SayfaEnvanteri } from './paket-olusturucu.mjs';

/** Panelin gösterdiği durum (kayıt motorundan; değer içermez). */
export type PanelDurumu = {
  /** Görülen alanlar (ilk görülme sırasıyla): listeye alındı mı, son okumada görünüyor mu, dokunuldu mu, son okumada mı belirdi. */
  alanlar: Array<{ anahtar: string; etiket: string; tur: string; secili: boolean; gorunuyor: boolean; dokunuldu: boolean; yeni: boolean }>;
  /** Basılan düğmelerin metinleri (ilk basılış sırasıyla, tekil). */
  dugmeler: string[];
  /** Seçilen mesajların metinleri. */
  mesajlar: string[];
};
/** Sayfada eşzamanlı alınan ekran anlığı (kayıt motoru süzer). */
export type EkranAnligi = { yol: string; baslik: string; alanlar: SayfaEnvanteri['alanlar']; dokunulan: string[]; secimler: Record<string, string> };

export function kayitPaneliniKur(ayar: { kopru: string; kimlik: string }): void {
  if (window.top !== window) return;
  type Kopru = (veri: Record<string, unknown>) => Promise<unknown>;
  type Envanter = { alanlar: Array<{ anahtar: string; tur: string; secici: string; adaySeciciler: string[]; radyolar?: Array<{ secici?: string | null }> }>; baslik: string };
  const pencere = window as unknown as Record<string, unknown>;
  if (pencere.__nobetciKayitKuruldu) return;
  pencere.__nobetciKayitKuruldu = true;
  const dokunulan = new Set<Element>();
  pencere.__nobetciKayitDokunulan = dokunulan;
  const kopru = (veri: Record<string, unknown>): Promise<unknown> => {
    const f = pencere[ayar.kopru];
    return typeof f === 'function' ? (f as Kopru)(veri) : Promise.reject(new Error('Nöbetçi kayıt köprüsü yok.'));
  };

  // ---- Ekran anlığı (eşzamanlı; düğmeye basılmadan önce de alınır) ----
  const anlik = (): Record<string, unknown> | null => {
    const oku = pencere.__nobetciSayfadakiAlanlar as (() => Envanter) | undefined;
    const dokunmaBul = pencere.__nobetciDokunulanlariBul as ((a: string[][]) => boolean[]) | undefined;
    const secimOku = pencere.__nobetciSecimDegerleri as ((a: Array<{ anahtar: string; seciciler: string[] }>) => Record<string, string>) | undefined;
    if (!oku || !dokunmaBul || !secimOku) return null;
    try {
      const env = oku();
      const adaylar = env.alanlar.map((a) => [a.secici, ...a.adaySeciciler, ...(a.radyolar ?? []).flatMap((r) => (r.secici ? [r.secici] : []))]);
      const dok = dokunmaBul(adaylar);
      const secimler = secimOku(env.alanlar.map((a, i) => ({ anahtar: a.anahtar, seciciler: adaylar[i], tur: a.tur }))
        .filter((a) => a.tur === 'select' || a.tur === 'radio').map(({ anahtar, seciciler }) => ({ anahtar, seciciler })));
      return { yol: `${location.pathname}${location.search}`, baslik: env.baslik, alanlar: env.alanlar, dokunulan: env.alanlar.filter((_, i) => dok[i]).map((a) => a.anahtar), secimler };
    } catch {
      return null;
    }
  };

  // ---- Seçici ve görünen metin (değer değil: düğmenin etiketi) ----
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  const tek = (s: string): boolean => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const gorunenMetin = (el: Element): string => {
    // Girdinin değeri OKUNMAZ (kullanıcı verisi); yalnızca düğme türü girdinin (submit/button/reset) etiketi değerindedir.
    const dugmeGirdisi = el instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(el.type);
    const g = el instanceof HTMLInputElement ? (dugmeGirdisi ? el.getAttribute('value') : '')
      : el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? '' : (el as HTMLElement).innerText;
    return bosluk(g || el.getAttribute('aria-label') || el.getAttribute('title')).slice(0, 120);
  };
  const seciciUret = (el: Element): string => {
    const etiket = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id && tek(`#${CSS.escape(id)}`)) return `#${CSS.escape(id)}`;
    for (const a of ['name', 'data-testid', 'data-test', 'data-qa', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && tek(`${etiket}[${a}="${tirnak(v)}"]`)) return `${etiket}[${a}="${tirnak(v)}"]`;
    }
    const metin = gorunenMetin(el);
    if (metin && metin.length <= 60 && [...document.querySelectorAll(etiket)].filter((x) => gorunenMetin(x) === metin).length === 1) {
      // Playwright metin seçicisi (model koşucusu page.locator ile çözer).
      return `${etiket}:text-is("${tirnak(metin)}")`;
    }
    const parcalar: string[] = [];
    let d: Element | null = el;
    while (d && d !== document.documentElement && parcalar.length < 8) {
      const ebeveyn: Element | null = d.parentElement;
      if (d !== el && d.id && tek(`#${CSS.escape(d.id)}`)) { parcalar.unshift(`#${CSS.escape(d.id)}`); break; }
      const ad = d.tagName.toLowerCase();
      const ayni = ebeveyn ? [...ebeveyn.children].filter((c) => c.tagName === d?.tagName) : [];
      parcalar.unshift(ayni.length > 1 ? `${ad}:nth-of-type(${ayni.indexOf(d) + 1})` : ad);
      d = ebeveyn;
    }
    return parcalar.join(' > ');
  };
  const ogeBilgisi = (el: Element): { secici: string; metin: string | null } => ({ secici: seciciUret(el), metin: gorunenMetin(el) || null });
  const TIKLANABILIR = 'button, [role="button"], a[href], input[type="submit"], input[type="button"], input[type="image"], summary';

  // ---- Panel (shadow kökü) ----
  const host = document.createElement('div');
  host.id = ayar.kimlik;
  host.setAttribute('style', 'all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;');
  const kok = host.attachShadow({ mode: 'open' });
  const panelIci = (e: Event): boolean => e.composedPath().includes(host);
  kok.innerHTML = `<style>
    :host { all: initial; }
    .p { box-sizing: border-box; width: 340px; max-height: 76vh; overflow: auto; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #e6edf3; background: #0f1720; border: 1px solid #2a3a4a; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.45); }
    .u { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2a3a4a; position: sticky; top: 0; background: #0f1720; z-index: 1; }
    .u b { font-size: 13px; letter-spacing: .02em; } .u .n { width: 8px; height: 8px; border-radius: 50%; background: #f85149; box-shadow: 0 0 0 3px rgba(248,81,73,.25); }
    .u .s { margin-left: auto; }
    .g { padding: 10px 12px; display: grid; gap: 8px; }
    .i { color: #9fb0c0; font-size: 12px; } .v { color: #e3b341; font-size: 12px; } .h { color: #ff7b72; font-size: 12px; }
    h4 { margin: 2px 0 0; font-size: 12px; color: #c9d4de; letter-spacing: .02em; }
    button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #2a3a4a; background: #16212c; color: #e6edf3; padding: 6px 10px; }
    button:hover { border-color: #3fb8af; } button.b { background: #1f6f68; border-color: #3fb8af; } button.t { color: #ff7b72; }
    .r { display: flex; flex-wrap: wrap; gap: 6px; } .a { display: grid; gap: 3px; max-height: 34vh; overflow: auto; padding-right: 2px; }
    label { display: flex; gap: 6px; align-items: flex-start; } label.soluk > span { opacity: .6; }
    .e { font-size: 11px; color: #3fb8af; margin-left: 4px; } .e.g2 { color: #9fb0c0; }
    ul { margin: 0; padding-left: 18px; } li { font-size: 12px; }
  </style><div class="p" role="dialog" aria-label="Nöbetçi akış kaydı"><div class="u"><span class="n" aria-hidden="true"></span><b>Nöbetçi · Akış kaydı</b>
  <button class="s" type="button" data-k="kucult" aria-label="Paneli küçült">–</button></div><div class="g" data-k="govde"></div></div>`;
  const govde = kok.querySelector('[data-k="govde"]') as HTMLElement;
  const doldur = (...c: Array<Node | string | null>): void => { govde.replaceChildren(...c.filter((x): x is Node | string => x !== null)); };
  let kucuk = false;
  (kok.querySelector('[data-k="kucult"]') as HTMLElement).addEventListener('click', () => { kucuk = !kucuk; govde.style.display = kucuk ? 'none' : ''; });

  const el = (etiket: string, ozellik: Record<string, string> = {}, ...cocuklar: Array<Node | string | null>): HTMLElement => {
    const e = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik)) e.setAttribute(k, v);
    for (const c of cocuklar) if (c !== null) e.append(c);
    return e;
  };
  const dugme = (metin: string, f: () => void, sinif = ''): HTMLButtonElement => {
    const b = el('button', { type: 'button', ...(sinif ? { class: sinif } : {}) }, metin) as HTMLButtonElement;
    b.addEventListener('click', f);
    return b;
  };
  let durum: PanelDurumu = { alanlar: [], dugmeler: [], mesajlar: [] };
  let mesajModu = false;
  let mesaj = '';
  let hata = '';
  let gorunum: 'ana' | 'bitir' = 'ana';
  const islem = (veri: Record<string, unknown>): Promise<void> => kopru(veri)
    .then((d) => { hata = ''; if (d && typeof d === 'object' && 'alanlar' in d) durum = d as PanelDurumu; })
    .catch((e: unknown) => { hata = e instanceof Error ? e.message.replace(/^Error: /, '') : String(e); })
    .then(() => { if (gorunum === 'ana') anaGorunum(); });
  const oku = (elle: boolean): void => {
    const a = anlik();
    if (a) void islem({ tur: 'okuma', elle, anlik: a });
  };
  let okumaZamanlayici: ReturnType<typeof setTimeout> | null = null;
  const sonraOku = (ms: number): void => {
    if (okumaZamanlayici) clearTimeout(okumaZamanlayici);
    okumaZamanlayici = setTimeout(() => { okumaZamanlayici = null; oku(false); }, ms);
  };

  function anaGorunum(): void {
    gorunum = 'ana';
    // Liste yeniden çizilirken kaydırma konumu korunur.
    const eskiListe = kok.querySelector('.a');
    const kaydirma = eskiListe ? eskiListe.scrollTop : 0;
    const secili = durum.alanlar.filter((a) => a.secili).length;
    const liste = durum.alanlar.length
      ? el('div', { class: 'a', role: 'group', 'aria-label': 'Görülen alanlar' }, ...durum.alanlar.map((a) => {
        const k = el('input', { type: 'checkbox', 'aria-label': `${a.etiket || '(etiketsiz)'}: listeye al` }) as HTMLInputElement;
        k.checked = a.secili;
        k.addEventListener('change', () => { void islem({ tur: 'sec', anahtar: a.anahtar, secili: k.checked }); });
        return el('label', a.gorunuyor ? {} : { class: 'soluk' }, k, el('span', {}, `${a.etiket || '(etiketsiz)'} `, el('small', { class: 'i' }, a.tur),
          a.dokunuldu ? el('span', { class: 'e' }, 'dokundunuz') : null,
          a.yeni && !a.dokunuldu ? el('span', { class: 'e' }, 'yeni') : null,
          a.gorunuyor ? null : el('span', { class: 'e g2' }, 'şu an görünmüyor')));
      }))
      : el('div', { class: 'i' }, 'Henüz alan görülmedi. Sayfa yüklenince alanlar burada listelenir.');
    doldur(
      el('div', { class: 'i' }, 'Akışı sayfada normal yürütün. Yeni alanlar açılınca “Ekranı yeniden oku”ya basın. Kullanılacak alanları işaretleyin (dokunduklarınız işaretli gelir). “Bitir”e bastıktan sonra akış diyagramını Nöbetçi’de kurarsınız.'),
      el('h4', {}, `Görülen alanlar (${durum.alanlar.length}; listede ${secili})`),
      liste,
      el('h4', {}, `Basılan düğmeler (${durum.dugmeler.length})`),
      durum.dugmeler.length ? el('ul', {}, ...durum.dugmeler.map((d) => el('li', {}, `“${d}”`))) : el('div', { class: 'i' }, 'Henüz düğmeye basılmadı.'),
      durum.mesajlar.length ? el('h4', {}, `Mesajlar (${durum.mesajlar.length})`) : null,
      durum.mesajlar.length ? el('ul', {}, ...durum.mesajlar.map((d) => el('li', {}, `“${d}”`))) : null,
      mesajModu ? el('div', { class: 'v' }, 'Beklenen mesajı seçin: sayfada mesajın yazdığı yere tıklayın (bu tıklama siteye gitmez). Esc: vazgeç.') : null,
      mesaj ? el('div', { class: 'i' }, mesaj) : null,
      hata ? el('div', { class: 'h', role: 'alert' }, hata) : null,
      el('div', { class: 'r' },
        dugme('Ekranı yeniden oku', () => { mesaj = 'Ekran okundu.'; oku(true); }, 'b'),
        dugme(mesajModu ? 'Seçimi bırak' : 'Mesaj seç', () => { mesajModu = !mesajModu; anaGorunum(); })),
      el('div', { class: 'r' }, dugme('Bitir', bitirGorunumu), durum.alanlar.length || durum.dugmeler.length ? sifirlaDugmesi() : null, iptalDugmesi()),
      el('div', { class: 'i' }, 'Girdiğiniz değerler kaydedilmez; yalnızca alanların yapısı, bastığınız düğmeler ve seçtiğiniz mesajlar kaydedilir.'));
    mesaj = '';
    const yeniListe = kok.querySelector('.a');
    if (yeniListe) yeniListe.scrollTop = kaydirma;
  }

  /** Sıfırla: görülen alanlar, düğmeler, mesajlar ve olaylar silinir (iki adımlı onay); tarayıcı açık kalır. */
  function sifirlaDugmesi(): HTMLButtonElement {
    let emin = false;
    const b = dugme('Sıfırla', () => {
      if (!emin) { emin = true; b.textContent = 'Kayıt silinsin mi? Evet'; return; }
      dokunulan.clear();
      mesaj = 'Kayıt sıfırlandı; ekran yeniden okundu.';
      void islem({ tur: 'sifirla' }).then(() => oku(false));
    }, 't');
    return b;
  }

  function iptalDugmesi(): HTMLButtonElement {
    let emin = false;
    const b = dugme('İptal', () => {
      if (!emin) { emin = true; b.textContent = 'Kayıt iptal edilsin mi? Evet'; return; }
      void kopru({ tur: 'iptal' }).catch(() => undefined);
      govde.replaceChildren(el('div', { class: 'i' }, 'Kayıt iptal edildi. Bu pencere kapanacak.'));
    }, 't');
    return b;
  }

  function bitirGorunumu(): void {
    const secili = durum.alanlar.filter((a) => a.secili).length;
    if (!secili && !durum.dugmeler.length) { hata = 'Önce akışı yürütün: listede en az bir alan ya da basılmış bir düğme olmalı.'; anaGorunum(); return; }
    gorunum = 'bitir';
    doldur(
      el('div', {}, el('b', {}, 'Kayıt bitirilsin mi?'),
        el('div', { class: 'i' }, `Listede ${secili} alan, ${durum.dugmeler.length} düğme${durum.mesajlar.length ? `, ${durum.mesajlar.length} mesaj` : ''} var. Nöbetçi’de bunlardan hazırlanan taslak diyagram açılır; adımları orada adlandırıp düzenlersiniz.`)),
      durum.mesajlar.length ? null : el('div', { class: 'v' }, 'Mesaj seçmediniz: beklenen mesajı diyagramda elle yazabilirsiniz.'),
      hata ? el('div', { class: 'h', role: 'alert' }, hata) : null,
      el('div', { class: 'r' },
        dugme('Bitir ve Nöbetçi’ye gönder', () => {
          kopru({ tur: 'bitir' }).then(() => govde.replaceChildren(el('div', { class: 'i' }, 'Kayıt Nöbetçi’ye gönderildi. Bu pencere kapanacak; diyagrama Nöbetçi’den devam edin.')))
            .catch((e: unknown) => { hata = String(e instanceof Error ? e.message : e); bitirGorunumu(); });
        }, 'b'),
        dugme('Geri', anaGorunum)));
  }

  // ---- Dinleyiciler (yakalama aşaması; panelin kendi olayları yok sayılır) ----
  const dokun = (e: Event): void => { if (!panelIci(e) && e.target instanceof Element) dokunulan.add(e.target); };
  window.addEventListener('input', dokun, true);
  window.addEventListener('change', (e) => {
    dokun(e);
    // Seçim / onay kutusu değişince yeni alanlar açılabilir: ekran kısa süre sonra kendiliğinden okunur.
    const t = e.target;
    if (!panelIci(e) && (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === 'radio' || t.type === 'checkbox')))) sonraOku(400);
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mesajModu) { mesajModu = false; anaGorunum(); } }, true);
  window.addEventListener('click', (e) => {
    if (panelIci(e) || !(e.target instanceof Element)) return;
    if (mesajModu) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Form alanı mesaj olamaz (içindeki değer kullanıcı verisidir): mod açık kalır, kullanıcı mesajın yerine tıklar.
      if (e.target.closest('input:not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, [contenteditable="true"]')) {
        mesaj = 'Form alanı mesaj olarak seçilemez; mesajın yazdığı yere tıklayın.';
        anaGorunum();
        return;
      }
      mesajModu = false;
      mesaj = 'Mesaj seçildi.';
      void islem({ tur: 'mesaj', ...ogeBilgisi(e.target) });
      return;
    }
    const tik = e.target.closest(TIKLANABILIR);
    if (!tik) return;
    // Düğmenin kendi işi çalışmadan (sayfa değişmeden) önceki ekran: bu adımın alanları.
    const oncesi = anlik();
    dokunulan.clear();
    void islem({ tur: 'tik', ...ogeBilgisi(tik), anlik: oncesi });
    sonraOku(900);
  }, true);

  const yerlestir = (): void => {
    if (!document.documentElement) { setTimeout(yerlestir, 50); return; }
    if (!host.isConnected) document.documentElement.appendChild(host);
  };
  yerlestir();
  setInterval(yerlestir, 1000);
  void islem({ tur: 'durum' });
  // Açılışta ekran okunur (sayfa yüklendikten kısa süre sonra).
  const ilkOkuma = (): void => { sonraOku(600); };
  if (document.readyState === 'complete') ilkOkuma();
  else window.addEventListener('load', ilkOkuma, { once: true });
}

/** Alanların aday CSS seçicileri → son düğme basışından beri dokunuldu mu? (Playwright'a özgü seçiciler atlanır.) */
export function dokunulanlariBul(adaylar: string[][]): boolean[] {
  const dokunulan = (window as unknown as { __nobetciKayitDokunulan?: Set<Element> }).__nobetciKayitDokunulan;
  if (!dokunulan || !dokunulan.size) return adaylar.map(() => false);
  return adaylar.map((liste) => liste.some((s) => {
    if (/^(role|text|xpath)=|>>|:text|:has-text/.test(s)) return false;
    try { return [...document.querySelectorAll(s)].some((e) => dokunulan.has(e)); } catch { return false; }
  }));
}

/**
 * Seçim alanlarının (select / radyo grubu) o an SEÇİLİ SEÇENEK değeri — seçime göre görünen alanların koşulu için.
 * Yalnızca select ve radyo okunur; metin kutularının değeri hiçbir zaman okunmaz. (Kayıt motoru değeri alanın kayıtlı
 * seçenekleriyle ayrıca süzer.)
 */
export function secimDegerleri(adaylar: Array<{ anahtar: string; seciciler: string[] }>): Record<string, string> {
  const sonuc: Record<string, string> = {};
  for (const a of adaylar) {
    for (const s of a.seciciler) {
      if (/^(role|text|xpath)=|>>|:text|:has-text/.test(s)) continue;
      let ogeler: Element[] = [];
      try { ogeler = [...document.querySelectorAll(s)]; } catch { continue; }
      const liste = ogeler.find((e): e is HTMLSelectElement => e instanceof HTMLSelectElement);
      if (liste) { sonuc[a.anahtar] = liste.value; break; }
      const radyolar = ogeler.filter((e): e is HTMLInputElement => e instanceof HTMLInputElement && e.type === 'radio');
      if (radyolar.length) {
        const secili = radyolar.find((r) => r.checked);
        if (secili) sonuc[a.anahtar] = secili.value;
        break;
      }
    }
  }
  return sonuc;
}
