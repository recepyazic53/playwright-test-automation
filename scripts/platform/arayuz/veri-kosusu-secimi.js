// VERİ KOŞUSU SEÇİMİ (arayüz; ekran ve servis senaryosu formu ortak) — tablo grubunun "Çalıştırma biçimi" (tek satır / seçili
// satırların her biri / uyan tüm satırlar), satır işaretleri, birden çok çoklu grupta birleşim (tüm kombinasyonlar / eşleştirerek)
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

/**
 * Grup başına "Çalıştırma biçimi" seçimi (+ seçili satırlarda satır işaretleri, tümünde bu ortamdaki sayı).
 * d: { veriKosulari, ortam: { id, ad }, ortamAdi(id), degisti() } — degisti yeniden çizimi tetikler.
 * @param {{ id: string; ad: string; sutunlar: Array<{ ad: string; gizli?: boolean }>; satirlar: Array<{ id: string; ad?: string; ortamId: string | null; degerler: Record<string, string | null> }> }} t
 * @param {string} anahtar grup anahtarı ("<tabloId>|<etiket>") @param {Record<string, string>} secim grubun satır seçimi (tabloSecimleri)
 * @param {{ veriKosulari: { gruplar: Record<string, any> }; ortam: { id: string; ad: string }; ortamAdi: (id: string) => string; degisti: () => void }} d
 */
export function calistirmaBicimi(t, anahtar, secim, d) {
  const ayar = d.veriKosulari.gruplar[anahtar] || null;
  const kip = ayar ? ayar.kip : 'tek';
  const id = yeniId('bicim');
  const sel = h('select', { id, 'data-calistirma-bicimi': anahtar },
    h('option', { value: 'tek', selected: kip === 'tek' }, 'Tek satır (varsayılan)'),
    h('option', { value: 'secili', selected: kip === 'secili' }, 'Seçili satırların her biri için ayrı test'),
    h('option', { value: 'tumu', selected: kip === 'tumu' }, 'Uyan tüm satırlar (her biri ayrı test)'));
  sel.addEventListener('change', () => {
    if (sel.value === 'tek') delete d.veriKosulari.gruplar[anahtar];
    else if (sel.value === 'tumu') d.veriKosulari.gruplar[anahtar] = { kip: 'tumu' };
    else d.veriKosulari.gruplar[anahtar] = { kip: 'secili', satirlar: (ayar && ayar.kip === 'secili' ? ayar.satirlar : []) };
    d.degisti();
  });
  const acik = t.sutunlar.filter((c) => !c.gizli);
  const satirMetni = (r) => `${r.ad || 'Satır'}${acik.length ? ` — ${acik.slice(0, 3).map((c) => r.degerler[c.ad] ?? '—').join(' · ')}` : ''}${r.ortamId ? ` [yalnız ${d.ortamAdi(r.ortamId)}]` : ''}`;
  let ek = null;
  if (kip === 'secili') {
    const secili = new Set(ayar.satirlar);
    ek = h('fieldset', { class: 'satir-isaretleri' }, h('legend', {}, 'Koşulacak satırlar'),
      t.satirlar.map((r) => {
        const kutu = h('input', { type: 'checkbox', value: r.id, checked: secili.has(r.id) });
        kutu.addEventListener('change', () => {
          const liste = new Set(d.veriKosulari.gruplar[anahtar]?.satirlar || []);
          if (kutu.checked) liste.add(r.id); else liste.delete(r.id);
          d.veriKosulari.gruplar[anahtar] = { kip: 'secili', satirlar: t.satirlar.map((x) => x.id).filter((x) => liste.has(x)) };
          d.degisti();
        });
        return h('label', { class: 'satir-isareti' }, kutu, h('span', {}, satirMetni(r)));
      }),
      !secili.size ? h('div', { class: 'alan-uyarisi' }, 'En az bir satır işaretleyin.') : null);
  } else if (kip === 'tumu') {
    const n = uyanSatirlar(t, secim, { ortamId: d.ortam.id }).length;
    ek = h('div', { class: 'alan-notu' }, `Seçimlerle uyan her satır ayrı test olarak koşar (${d.ortam.ad} ortamında ${n}). Ortama özel satır yalnız kendi ortamında koşar.`);
  }
  return h('div', { class: 'calistirma-bicimi' }, h('label', { for: id }, 'Çalıştırma biçimi'), sel, ek);
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
