// VERİ KOŞUSU SEÇİMİ (arayüz; ekran ve servis senaryosu formu ortak) — tablo grubunda çoklu çalıştırma ("Uyan her satır ayrı
// test"; kayıtlı "seçili satırlar" korunur), satır işaretleri, birden çok çoklu grupta birleşim (tüm kombinasyonlar / eşleştirerek)
// ve tahmini test sayısı. Kural ve sayım tablolar/veri-kosulari.mjs'dedir (sunucu ve koşucuyla aynı).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { h, ikon } from './ortak.js';
import { uyanSatirlar } from './tablo-secimi.mjs';
import { veriKosusuSayisi } from './veri-kosulari.mjs';

let sayac = 0;
const yeniId = (on) => `vks-${on}-${++sayac}`;

/**
 * Kaydedilecek çalıştırma biçimi: yalnız kullanılan çoklu gruplar; hiçbiri yoksa null (bugünkü davranış: grup başına tek satır).
 * @param {{ gruplar: Record<string, any>; birlesim?: string; eslesmeler?: Array<Record<string, string>> }} veriKosulari
 * @param {Iterable<string>} kullanilanAnahtarlar
 */
export function kaydedilecekVeriKosulari(veriKosulari, kullanilanAnahtarlar) {
  const kullanilan = new Set(kullanilanAnahtarlar);
  const gruplar = Object.fromEntries(Object.entries(veriKosulari.gruplar || {}).filter(([k, v]) => kullanilan.has(k) && v && (v.kip === 'tumu' || v.kip === 'secili')));
  const coklu = Object.keys(gruplar);
  if (!coklu.length) return null;
  if (coklu.length === 1) return { gruplar };
  const birlesim = veriKosulari.birlesim === 'eslestir' ? 'eslestir' : 'kartezyen';
  return { gruplar, birlesim, ...(birlesim === 'eslestir' ? { eslesmeler: (veriKosulari.eslesmeler || []).filter((e) => coklu.every((g) => e[g])) } : {}) };
}

/** Satır listesindeki metin: ad — ilk açık sütunlar [yalnız ortam]. */
const satirMetni = (t, r, d) => {
  const acik = t.sutunlar.filter((c) => !c.gizli);
  return `${r.ad || 'Satır'}${acik.length ? ` — ${acik.slice(0, 3).map((c) => r.degerler[c.ad] ?? '—').join(' · ')}` : ''}${r.ortamId ? ` [yalnız ${d.ortamAdi(r.ortamId)}]` : ''}`;
};

/**
 * Kayıtlı "seçili satırlar" biçiminin satır işaretleri (her işaretli satır ayrı test). Yeni senaryoda bu biçim sunulmaz; kayıtlı
 * senaryoda değer korunur ve işaretler düzenlenebilir.
 * @param {{ sutunlar: Array<{ ad: string; gizli?: boolean }>; satirlar: Array<{ id: string; ad?: string; ortamId: string | null; degerler: Record<string, string | null> }> }} t
 * @param {string} anahtar grup anahtarı ("<tabloId>|<etiket>")
 * @param {{ veriKosulari: { gruplar: Record<string, any> }; ortamAdi: (id: string) => string; degisti: () => void }} d
 */
export function satirIsaretleri(t, anahtar, d) {
  const ayar = d.veriKosulari.gruplar[anahtar];
  const secili = new Set(ayar && ayar.kip === 'secili' ? ayar.satirlar : []);
  return h('fieldset', { class: 'satir-isaretleri', 'data-satir-isaretleri': anahtar }, h('legend', {}, 'Koşulacak satırlar (her biri ayrı test)'),
    t.satirlar.map((r) => {
      const kutu = h('input', { type: 'checkbox', value: r.id, checked: secili.has(r.id) });
      kutu.addEventListener('change', () => {
        const liste = new Set(d.veriKosulari.gruplar[anahtar]?.satirlar || []);
        if (kutu.checked) liste.add(r.id); else liste.delete(r.id);
        d.veriKosulari.gruplar[anahtar] = { kip: 'secili', satirlar: t.satirlar.map((x) => x.id).filter((x) => liste.has(x)) };
        d.degisti();
      });
      return h('label', { class: 'satir-isareti' }, kutu, h('span', {}, satirMetni(t, r, d)));
    }),
    !secili.size ? h('div', { class: 'alan-uyarisi' }, 'En az bir satır işaretleyin.') : null);
}

/**
 * Tek tablo grubunda çoklu çalıştırma (sade; eski üç seçenekli "Çalıştırma biçimi" listesinin yerine): "Uyan her satır ayrı test"
 * onay kutusu (veriKosulari 'tumu'; işaretsiz = tek satır, bugünkü davranış). Kayıtlı 'secili' biçimi korunur (kutu işaretli, satır
 * işaretleri düzenlenebilir). Tabloda birden az satır varsa ve çoklu biçim kayıtlı değilse çoklu çalıştırma anlamsızdır: null.
 * d: { veriKosulari, ortam: { id, ad }, ortamAdi(id), degisti() } — degisti yeniden çizimi tetikler.
 * @param {{ id: string; ad: string; sutunlar: Array<{ ad: string; gizli?: boolean }>; satirlar: Array<{ id: string; ad?: string; ortamId: string | null; degerler: Record<string, string | null> }> }} t
 * @param {string} anahtar grup anahtarı ("<tabloId>|<etiket>") @param {Record<string, string>} secim grubun satır seçimi (tabloSecimleri)
 * @param {{ veriKosulari: { gruplar: Record<string, any> }; ortam: { id: string; ad: string }; ortamAdi: (id: string) => string; degisti: () => void }} d
 */
export function cokluCalistirmaSecimi(t, anahtar, secim, d) {
  const ayar = d.veriKosulari.gruplar[anahtar] || null;
  const kip = ayar && (ayar.kip === 'tumu' || ayar.kip === 'secili') ? ayar.kip : 'tek';
  if (kip === 'tek' && t.satirlar.length < 2) return null;
  const id = yeniId('coklu');
  const kutu = h('input', { type: 'checkbox', id, 'data-coklu-calistirma': anahtar, checked: kip !== 'tek' });
  kutu.addEventListener('change', () => {
    if (kutu.checked) d.veriKosulari.gruplar[anahtar] = { kip: 'tumu' };
    else delete d.veriKosulari.gruplar[anahtar];
    d.degisti();
  });
  let ek = null;
  if (kip === 'secili') ek = satirIsaretleri(t, anahtar, d);
  else if (kip === 'tumu') {
    const n = uyanSatirlar(t, secim, { ortamId: d.ortam.id }).length;
    ek = h('div', { class: 'alan-notu' }, `Koşullara uyan her satır ayrı test olarak koşar (${d.ortam.ad} ortamında ${n}). Ortama özel satır yalnız kendi ortamında koşar.`);
  }
  // Satır seçimi dili kayıt grubundakiyle aynı: "Ayrı test: koşullara uyan her satır" / "Ayrı test: işaretli her satır".
  return h('div', { class: 'calistirma-bicimi' },
    h('label', { class: 'onay-satiri', for: id }, kutu, h('span', {}, kip === 'secili' ? 'Ayrı test: işaretli her satır' : 'Ayrı test: koşullara uyan her satır')), ek);
}

/**
 * Birden çok çoklu grupta birleşim (tüm kombinasyonlar / eşleştirerek) + eşleşmeler ve tahmini test sayısı. Çoklu grup yoksa null.
 * @param {Array<{ anahtar: string; tablo: any; etiket: string }>} gruplar kullanılan gruplar (formdaki sırayla)
 * @param {{ veriKosulari: { gruplar: Record<string, any>; birlesim?: string; eslesmeler?: Array<Record<string, string>> }; ortam: { id: string; ad: string };
 *   ortamAdi: (id: string) => string; degisti: () => void; tablolar: any[]; tabloSecimleri: Record<string, Record<string, string>> }} d
 */
export function veriKosusuOzeti(gruplar, d) {
  const coklu = gruplar.filter((x) => d.veriKosulari.gruplar[x.anahtar]);
  if (!coklu.length) return null;
  const ayar = kaydedilecekVeriKosulari(d.veriKosulari, gruplar.map((g) => g.anahtar));
  const r = veriKosusuSayisi(ayar, { tablolar: d.tablolar, gruplar, ortamId: d.ortam.id, tabloSecimleri: d.tabloSecimleri });
  let birlesimBolumu = null;
  if (coklu.length > 1) {
    const ad = yeniId('birlesim');
    const bir = d.veriKosulari.birlesim === 'eslestir' ? 'eslestir' : 'kartezyen';
    const radyolar = [['kartezyen', 'Tüm kombinasyonlar'], ['eslestir', 'Eşleştirerek (satır satır)']].map(([deger, etiket]) => {
      const r2 = h('input', { type: 'radio', name: ad, value: deger, checked: bir === deger });
      r2.addEventListener('change', () => { d.veriKosulari.birlesim = deger; d.degisti(); });
      return h('label', {}, r2, etiket);
    });
    let eslesmeBolumu = null;
    if (bir === 'eslestir') {
      d.veriKosulari.eslesmeler ??= [];
      const liste = d.veriKosulari.eslesmeler;
      const adaylar = (x) => {
        const a = d.veriKosulari.gruplar[x.anahtar];
        return a.kip === 'tumu' ? x.tablo.satirlar : x.tablo.satirlar.filter((r3) => a.satirlar.includes(r3.id));
      };
      eslesmeBolumu = h('div', { class: 'eslesmeler' },
        liste.map((e, i) => h('div', { class: 'eslesme-satiri' },
          coklu.map((x) => {
            const sel = h('select', { 'aria-label': `${i + 1}. eşleşme — ${x.tablo.ad}${x.etiket ? ` [${x.etiket}]` : ''}` }, h('option', { value: '' }, `${x.tablo.ad}…`),
              adaylar(x).map((r3) => h('option', { value: r3.id, selected: e[x.anahtar] === r3.id }, `${r3.ad || 'Satır'}${r3.ortamId ? ` [yalnız ${d.ortamAdi(r3.ortamId)}]` : ''}`)));
            sel.addEventListener('change', () => { if (sel.value) e[x.anahtar] = sel.value; else delete e[x.anahtar]; d.degisti(); });
            return sel;
          }),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. eşleşmeyi kaldır`, onclick: () => { liste.splice(i, 1); d.degisti(); } }, ikon('carpi')))),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { liste.push({}); d.degisti(); } }, ikon('arti'), 'Eşleşme ekle'),
        !liste.length ? h('div', { class: 'alan-uyarisi' }, 'En az bir eşleşme ekleyin (her tablodan bir satır).') : null);
    }
    birlesimBolumu = h('div', { class: 'birlesim-secimi' }, h('div', { class: 'radyo-grubu', role: 'radiogroup', 'aria-label': 'Birden çok tablo' }, radyolar), eslesmeBolumu);
  }
  return h('div', { class: 'veri-kosusu-ozeti' }, birlesimBolumu,
    h('div', { class: `alan-notu ${r.hatalar.length ? 'alan-uyarisi' : ''}`.trim(), role: 'status', 'data-tahmini-test': String(r.sayi) },
      r.hatalar.length ? r.hatalar[0] : `Tahmini test sayısı (${d.ortam.ad}): ${r.sayi} — her satır / kombinasyon ayrı test, başlık "Senaryo [satır adı]".`));
}
