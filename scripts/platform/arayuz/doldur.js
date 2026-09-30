// "Doldur" BİLEŞENİ (yeniden kullanılabilir): boş alanın yanındaki düğme, alanın değerini YALNIZ test verisi tablosundan seçtirir —
// hiçbir değer üretilmez (sentetik veri yok). Eşleme saf modüldedir (doldur-onerisi.mjs; sunucu testleriyle ORTAK): önce alanın bağlı
// sütunu, yoksa adı uyan sütunlar, seçim alanında liste tablosu. Tek anlamlı eşleşme (tek sütun, tek satır) tıklayınca yazılır; birden
// çok aday tablo / satır varsa küçük seçim listesi açılır ("Tablo › Sütun", satır adı; gizli sütun ve hassas alanda değer maskeli).
// Uygun tablo yoksa "Bu alan için tablo yok — elle yazın ya da tablo ekleyin" ve Test verisi tablolarına bağlantı.
// Seçim secildi({ deger, basvuru, tabloSecimi, satir, aday }) ile döner: deger "${Tablo.Sütun}" (ekran senaryosu), basvuru "Tablo.Sütun"
// (servis senaryosu); tabloSecimi = { anahtar: "<tabloId>|<etiket>", kosul } grubun satır seçimidir (tabloSecimleri biçimi).
// Tablolar /platform/tablolar?secim=1'den okunur (gizli değer yok; yalnız kısmi maske) ve proje başına önbellekte tutulur.
// Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yeniKimlik, yerlestir } from './ortak.js';
import { NEDEN_METINLERI, adaySecimi, doldurAdaylari, tekAnlamliSecim, tumunuDoldur } from './doldur-onerisi.mjs';

/** Proje → { zaman, istek }; kısa ömürlü (başka sayfada eklenen tablo kısa sürede görünür). @type {Map<string, { zaman: number; istek: Promise<any[]> }>} */
const onbellek = new Map();
const ONBELLEK_SURESI = 10_000;
const deger = (x) => (typeof x === 'function' ? x() : x);

/**
 * Projenin tabloları (satır seçimi biçimi; gizli sütunda yalnız kısmi maske). Kısa süre önbellekli; tazele: true yeniden okur.
 * @param {string} projeId @param {{ tazele?: boolean }} [s] @returns {Promise<any[]>}
 */
export function doldurTablolari(projeId, s = {}) {
  const k = onbellek.get(projeId);
  if (!s.tazele && k && Date.now() - k.zaman < ONBELLEK_SURESI) return k.istek;
  const istek = api(`/platform/tablolar?projeId=${encodeURIComponent(projeId)}&secim=1`).then((y) => y.tablolar || []);
  istek.catch(() => onbellek.delete(projeId));
  onbellek.set(projeId, { zaman: Date.now(), istek });
  return istek;
}

/** "Tablo yok" iletisi + Test verisi bağlantısı. */
const tabloYokIletisi = () => h('p', { class: 'doldur-yok kucuk' }, 'Bu alan için tablo yok — elle yazın ya da tablo ekleyin. ',
  h('a', { href: '#/veri' }, 'Test verisi tabloları'));

/** Adayın başlığı: "Tablo [etiket] › Sütun". */
const adayBasligi = (a) => `${a.tablo}${a.etiket ? ` [${a.etiket}]` : ''} › ${a.sutun}`;
/** Satırın seçim listesindeki metni: satır adı (yoksa sıra) — değer (gizli / hassasta maske). */
const satirMetni = (r) => `${r.ad || `Satır ${r.sira}`} — ${r.gosterim}`;

/**
 * "Doldur" düğmesi (+ küçük seçim listesi). Döndürülen öğe düğme ile paneli taşır; çağıran onu alanın başlığına ekler.
 * @param {{
 *   projeId: string;
 *   alan: { id: string; etiket: string; tip?: string; hassas?: boolean; secenekler?: Array<string | { deger: string; metin?: string }> | null } | (() => any);
 *   mevcutBag?: { tablo: string; sutun: string; etiket?: string } | null | (() => any);   // tablo: kimlik ya da ad
 *   secildi: (secim: { deger: string; basvuru: string; tabloSecimi: { anahtar: string; kosul: Record<string, string> } | null; satir: any; aday: any }) => void;
 *   ortamId?: string | null | (() => string | null);
 *   tabloSecimleri?: Record<string, Record<string, string>> | (() => Record<string, Record<string, string>>);
 *   cokluGruplar?: string[] | (() => string[]);
 *   digerDegerler?: Array<{ tablo: string; sutun: string; etiket?: string; deger: unknown }> | (() => Array<{ tablo: string; sutun: string; etiket?: string; deger: unknown }>);
 * }} s
 * @returns {HTMLElement}
 */
export function doldurDugmesi(s) {
  const panelId = yeniKimlik('doldur-paneli');
  const ilkAlan = deger(s.alan);
  // Erişilebilir ad yalnız "Doldur" (alanın adı aria-label'a girmez: alanın kendi etiketiyle karışmasın — getByLabel / sesli
  // komut alanın girdisini bulur); hangi alan olduğu açıklamada (title).
  const dugme = h('button', {
    type: 'button', class: 'kucuk-dugme doldur-dugmesi', 'aria-expanded': 'false', 'aria-controls': panelId,
    title: `${ilkAlan.etiket}: değeri test verisi tablosundan seçin (değer üretilmez)`
  }, ikon('veri'), 'Doldur');
  const panel = h('div', { class: 'doldur-paneli', id: panelId, role: 'group', 'aria-label': 'Tablodan seçim', hidden: true });
  const kap = h('span', { class: 'doldur-kap' }, dugme, panel);
  const kapat = (odak = true) => {
    panel.hidden = true;
    dugme.setAttribute('aria-expanded', 'false');
    if (odak) dugme.focus();
  };
  const ac = (...icerik) => {
    yerlestir(panel, ...icerik, h('button', { type: 'button', class: 'kucuk-dugme hayalet doldur-vazgec', onclick: () => kapat() }, 'Vazgeç'));
    panel.hidden = false;
    dugme.setAttribute('aria-expanded', 'true');
    panel.querySelector('button, a')?.focus();
  };
  const sec = (secim) => {
    kapat(false);
    s.secildi({ deger: secim.deger, basvuru: secim.basvuru, tabloSecimi: secim.tabloSecimi, satir: secim.satir, aday: secim.aday });
  };
  panel.addEventListener('keydown', (o) => { if (o.key === 'Escape') { o.stopPropagation(); kapat(); } });
  dugme.addEventListener('click', async () => {
    if (!panel.hidden) { kapat(); return; }
    let tablolar;
    try {
      dugme.setAttribute('aria-busy', 'true');
      tablolar = await doldurTablolari(s.projeId);
    } catch (e) {
      if (e && e.durum === 423) return;
      ac(h('p', { class: 'alan-hatasi', role: 'alert' }, e.message || String(e)));
      return;
    } finally { dugme.removeAttribute('aria-busy'); }
    const alan = deger(s.alan);
    const adaylar = doldurAdaylari({
      alan, tablolar, bag: deger(s.mevcutBag) || null, ortamId: deger(s.ortamId) ?? null,
      tabloSecimleri: deger(s.tabloSecimleri) || {}, cokluGruplar: deger(s.cokluGruplar) || [], digerDegerler: deger(s.digerDegerler) || []
    });
    if (!adaylar.length) { ac(tabloYokIletisi()); return; }
    const tek = tekAnlamliSecim(adaylar);
    if (tek) { sec(tek); return; }
    ac(h('p', { class: 'doldur-baslik kucuk' }, `${alan.etiket}: tablodan seçin`),
      ...adaylar.map((a) => h('div', { class: 'doldur-aday' },
        h('div', { class: 'doldur-aday-basligi' }, ikon('veri'), h('span', {}, adayBasligi(a)), h('small', { class: 'soluk' }, ` · ${NEDEN_METINLERI[a.neden]}`)),
        !a.satirlar.length
          ? h('p', { class: 'soluk kucuk' }, 'Bu ortam için sütunda değer yok — tabloya satır ekleyin.')
          : a.coklu
          ? h('button', { type: 'button', class: 'doldur-secenegi', onclick: () => sec(adaySecimi(a, null)) }, `${adayBasligi(a)} (satırlar veri koşusundan)`)
          : h('ul', { class: 'doldur-satirlari', 'aria-label': `${adayBasligi(a)}: satırlar` }, a.satirlar.map((r) => h('li', {},
            h('button', { type: 'button', class: 'doldur-secenegi', onclick: () => sec(adaySecimi(a, r.satirId)) }, satirMetni(r))))))));
  });
  return kap;
}

/**
 * "Tümünü doldur (tablodan)": yalnız tek anlamlı eşleşmesi olan alanları doldurur, kalanları nedenleriyle listeler.
 * @param {{
 *   projeId: string;
 *   alanlar: () => Array<{ alan: { id: string; etiket: string; tip?: string; hassas?: boolean; secenekler?: any }; bag?: { tablo: string; sutun: string; etiket?: string } | null }>;
 *   uygula: (dolanlar: Array<{ alanId: string; etiket: string; secim: { deger: string; basvuru: string; tabloSecimi: { anahtar: string; kosul: Record<string, string> } | null } }>) => void;
 *   ortamId?: string | null | (() => string | null);
 *   tabloSecimleri?: Record<string, Record<string, string>> | (() => Record<string, Record<string, string>>);
 *   cokluGruplar?: string[] | (() => string[]);
 *   digerDegerler?: Array<{ tablo: string; sutun: string; etiket?: string; deger: unknown }> | (() => Array<{ tablo: string; sutun: string; etiket?: string; deger: unknown }>);
 * }} s
 * @returns {HTMLElement}
 */
export function tumunuDoldurDugmesi(s) {
  const sonuc = h('div', { class: 'doldur-sonucu', role: 'status', 'aria-live': 'polite' });
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme doldur-tumu', title: 'Yalnız tek anlamlı eşleşmesi olan (tek tablo sütunu, tek satır) boş zorunlu alanlar doldurulur; değer üretilmez.' },
    ikon('veri'), 'Tümünü doldur (tablodan)');
  dugme.addEventListener('click', async () => {
    const alanlar = s.alanlar();
    if (!alanlar.length) { yerlestir(sonuc, h('p', { class: 'kucuk' }, 'Boş zorunlu alan yok.')); return; }
    let tablolar;
    try {
      dugme.disabled = true;
      tablolar = await doldurTablolari(s.projeId);
    } catch (e) {
      if (e && e.durum === 423) return;
      yerlestir(sonuc, h('p', { class: 'alan-hatasi' }, e.message || String(e)));
      return;
    } finally { dugme.disabled = false; }
    const r = tumunuDoldur({
      alanlar, tablolar, ortamId: deger(s.ortamId) ?? null, tabloSecimleri: deger(s.tabloSecimleri) || {},
      cokluGruplar: deger(s.cokluGruplar) || [], digerDegerler: deger(s.digerDegerler) || []
    });
    if (r.dolanlar.length) s.uygula(r.dolanlar);
    const neden = { coklu: 'birden çok seçenek var — yanındaki "Doldur" ile seçin', yok: 'tablo yok — elle yazın ya da tablo ekleyin', bos: 'bağlı sütunda bu ortam için değer yok' };
    yerlestir(sonuc,
      h('p', { class: 'kucuk' }, r.dolanlar.length ? `${r.dolanlar.length} alan tablodan dolduruldu.` : 'Tek anlamlı eşleşmesi olan alan yok; hiçbir alan doldurulmadı.'),
      r.kalanlar.length ? h('ul', { class: 'doldur-kalanlar kucuk', 'aria-label': 'Doldurulmayan alanlar' },
        r.kalanlar.map((k) => h('li', {}, h('b', {}, k.etiket), `: ${neden[k.neden]}`))) : null,
      r.kalanlar.some((k) => k.neden === 'yok') ? h('p', { class: 'kucuk' }, h('a', { href: '#/veri' }, 'Test verisi tabloları')) : null);
  });
  return h('div', { class: 'doldur-tumu-kap' }, dugme, sonuc);
}
