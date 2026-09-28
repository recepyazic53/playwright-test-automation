// DOSYA DOĞRULAMA FORMU (ortak: ekranların akış tasarımındaki "İndirilen dosyayı doğrula" bloğu ve servis senaryosundaki "Yanıttaki
// dosyayı doğrula" kontrolü). Tanım nesnesi yerinde değiştirilir; her değişiklikte degisti() çağrılır. Beklenti türü değişince yalnız
// o beklentinin satırı yeniden çizilir (odak korunur). Kurallar ve biçimler: scripts/platform/dosyalar/dosya-icerigi.mjs (sunucu
// kaydederken doğrular). Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { h, ikon, yerlestir } from './ortak.js';

/** Beklenti türleri (sunucudaki BEKLENTI_TURLERI ile aynı sıra). */
export const BEKLENTI_TURLERI = [
  ['icerir', 'Metin içeriyor'], ['icermez', 'Metin içermiyor'], ['adDeseni', 'Dosya adı deseni'], ['enAzBoyut', 'En az boyut'],
  ['sutunVar', 'Sütun var (CSV / XLSX)'], ['satirSayisi', 'Satır sayısı (CSV / XLSX)'], ['hucre', 'Hücre değeri (CSV / XLSX)']
];
const BICIMLER = [['otomatik', 'Otomatik (addan / içerikten)'], ['csv', 'CSV'], ['xlsx', 'Excel (XLSX)'], ['pdf', 'PDF'], ['metin', 'Düz metin']];
const AYRACLAR = [['otomatik', 'Otomatik'], [';', 'Noktalı virgül ( ; )'], [',', 'Virgül ( , )'], ['\t', 'Sekme'], ['|', 'Dikey çizgi ( | )']];
const KODLAMALAR = [['otomatik', 'Otomatik'], ['utf8', 'UTF-8'], ['utf8bom', 'UTF-8 (BOM)'], ['windows1254', 'Windows-1254 (Türkçe)']];
const TABLO = new Set(['sutunVar', 'satirSayisi', 'hucre']);

/** Yeni tanım: otomatik biçim, boş bir "metin içeriyor" beklentisi. */
export const yeniDosyaTanimi = () => ({ bicim: 'otomatik', beklentiler: [{ tur: 'icerir', deger: '' }] });

/** Kutudaki kısa özet: "CSV · 3 beklenti". @param {any} t */
export function dosyaOzeti(t) {
  const b = BICIMLER.find(([d]) => d === (t && t.bicim))?.[1] ?? 'Otomatik';
  const n = t && Array.isArray(t.beklentiler) ? t.beklentiler.length : 0;
  return `${b.split(' (')[0]} · ${n} beklenti`;
}

/** Tür değişince beklentinin alanları: yalnız o türün alanları kalır. @param {string} tur @param {Record<string, any>} eski */
function turuDegistir(tur, eski) {
  const metin = typeof eski.deger === 'string' ? eski.deger : '';
  if (tur === 'enAzBoyut') return { tur, deger: 1 };
  if (tur === 'satirSayisi') return { tur, islem: 'enAz', deger: 1 };
  if (tur === 'hucre') return { tur, sutun: '', deger: metin };
  return { tur, deger: metin };
}

/**
 * @param {Record<string, any>} t dosya tanımı (yerinde değişir)
 * @param {{ degisti: () => void; ekran?: boolean; ad?: string }} s ekran: indirmeyi bekleme süresi gösterilir; ad: erişilebilir ad öneki
 */
export function dosyaKontroluFormu(t, s) {
  if (!Array.isArray(t.beklentiler)) t.beklentiler = [];
  if (!t.bicim) t.bicim = 'otomatik';
  const on = s.ad ? `${s.ad}: ` : '';
  const kok = h('div', { class: 'dosya-kontrolu' });
  const secim = (/** @type {Array<[string, string]>} */ secenekler, /** @type {string} */ deger, /** @type {string} */ etiket, /** @type {(v: string) => void} */ yaz) => {
    const el = h('select', { 'aria-label': `${on}${etiket}` }, secenekler.map(([d, m]) => h('option', { value: d, selected: d === deger }, m)));
    el.addEventListener('change', () => yaz(el.value));
    return el;
  };
  const metinGirdisi = (/** @type {string} */ deger, /** @type {string} */ etiket, /** @type {string} */ ornek, /** @type {(v: string) => void} */ yaz) => {
    const el = h('input', { type: 'text', value: deger ?? '', maxlength: '500', placeholder: ornek, autocomplete: 'off', spellcheck: 'false', 'aria-label': `${on}${etiket}` });
    el.addEventListener('input', () => { yaz(el.value); s.degisti(); });
    return el;
  };
  const sayiGirdisi = (/** @type {number | string} */ deger, /** @type {string} */ etiket, /** @type {number} */ enAz, /** @type {(v: number | string) => void} */ yaz) => {
    const el = h('input', { type: 'number', min: String(enAz), step: '1', value: String(deger ?? ''), 'aria-label': `${on}${etiket}` });
    el.addEventListener('input', () => { const n = Number(el.value); yaz(el.value !== '' && Number.isInteger(n) ? n : el.value); s.degisti(); });
    return el;
  };

  // ---- Okuma ayarları --------------------------------------------------------------------
  const ayarlar = h('div', { class: 'dosya-ayarlari' });
  const ayarlariCiz = () => {
    const csv = t.bicim === 'otomatik' || t.bicim === 'csv';
    const xlsx = t.bicim === 'otomatik' || t.bicim === 'xlsx';
    const kodlamali = csv || t.bicim === 'metin';
    const baslik = h('input', { type: 'checkbox', checked: t.baslikSatiri !== false });
    baslik.addEventListener('change', () => { if (baslik.checked) delete t.baslikSatiri; else t.baslikSatiri = false; s.degisti(); });
    const sayfa = metinGirdisi(t.sayfa || '', 'Excel sayfası', 'boşsa ilk sayfa', (v) => { if (v.trim()) t.sayfa = v; else delete t.sayfa; });
    yerlestir(ayarlar,
      csv ? h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'CSV ayracı'), secim(AYRACLAR, t.ayrac || 'otomatik', 'CSV ayracı', (v) => { if (v === 'otomatik') delete t.ayrac; else t.ayrac = v; s.degisti(); })) : null,
      kodlamali ? h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Kodlama'), secim(KODLAMALAR, t.kodlama || 'otomatik', 'Kodlama', (v) => { if (v === 'otomatik') delete t.kodlama; else t.kodlama = v; s.degisti(); })) : null,
      xlsx ? h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Excel sayfası'), sayfa) : null,
      csv || xlsx ? h('label', { class: 'onay-satiri kucuk' }, baslik, 'İlk satır başlık (sütun adları)') : null);
  };
  const bicim = secim(BICIMLER, t.bicim, 'Dosya biçimi', (v) => { t.bicim = v; ayarlariCiz(); beklentileriCiz(); s.degisti(); });

  // ---- Beklentiler ------------------------------------------------------------------------
  const liste = h('ol', { class: 'dosya-beklentileri', 'aria-label': `${on}Beklentiler` });
  /** @param {Record<string, any>} b @param {number} i */
  const beklentiSatiri = (b, i) => {
    const no = `${i + 1}. beklenti`;
    const li = h('li', { class: 'dosya-beklentisi' });
    const ciz = () => {
      const turler = BEKLENTI_TURLERI.filter(([d]) => !(TABLO.has(d) && (t.bicim === 'pdf' || t.bicim === 'metin')) || d === b.tur);
      const tur = secim(turler, b.tur, `${no} türü`, (v) => {
        const yeni = turuDegistir(v, b);
        for (const k of Object.keys(b)) delete b[k];
        Object.assign(b, yeni);
        ciz();
        s.degisti();
        /** @type {HTMLElement | null} */ (li.querySelector('select'))?.focus();
      });
      /** @type {Array<HTMLElement | null>} */
      let alanlar = [];
      if (b.tur === 'icerir' || b.tur === 'icermez') alanlar = [metinGirdisi(b.deger, `${no} metni`, 'ör. Sipariş özeti ya da ${Siparişler.No}', (v) => { b.deger = v; })];
      else if (b.tur === 'adDeseni') alanlar = [metinGirdisi(b.deger, `${no} ad deseni`, 'ör. siparisler-*.csv', (v) => { b.deger = v; })];
      else if (b.tur === 'sutunVar') alanlar = [metinGirdisi(b.deger, `${no} sütun adı`, 'ör. Ürün', (v) => { b.deger = v; })];
      else if (b.tur === 'enAzBoyut') alanlar = [sayiGirdisi(b.deger, `${no} en az bayt`, 1, (v) => { b.deger = v; }), h('span', { class: 'soluk kucuk' }, 'bayt')];
      else if (b.tur === 'satirSayisi') {
        alanlar = [secim([['enAz', 'en az (≥)'], ['esit', 'tam (=)']], b.islem || 'esit', `${no} karşılaştırma`, (v) => { b.islem = v; s.degisti(); }),
          sayiGirdisi(b.deger, `${no} satır sayısı`, 0, (v) => { b.deger = v; }), h('span', { class: 'soluk kucuk' }, 'satır (başlık hariç)')];
      } else if (b.tur === 'hucre') {
        const satirTuru = !b.satir ? 'herhangi' : b.satir.tur;
        const satirSecim = secim([['herhangi', 'herhangi bir satırda'], ['no', 'şu numaralı satırda'], ['kosul', 'şu sütunu şu olan satırda']], satirTuru, `${no} satır`, (v) => {
          if (v === 'herhangi') delete b.satir;
          else b.satir = v === 'no' ? { tur: 'no', no: 1 } : { tur: 'kosul', sutun: '', deger: '' };
          ciz();
          s.degisti();
        });
        alanlar = [
          metinGirdisi(b.sutun, `${no} sütun`, 'sütun adı ya da harfi (ör. Tutar, C)', (v) => { b.sutun = v; }),
          h('span', { class: 'soluk kucuk' }, '='),
          metinGirdisi(b.deger, `${no} beklenen değer`, 'ör. 145,90', (v) => { b.deger = v; }),
          satirSecim,
          b.satir && b.satir.tur === 'no' ? sayiGirdisi(b.satir.no, `${no} satır numarası`, 1, (v) => { b.satir.no = v; }) : null,
          b.satir && b.satir.tur === 'kosul' ? metinGirdisi(b.satir.sutun, `${no} koşul sütunu`, 'ör. Sipariş No', (v) => { b.satir.sutun = v; }) : null,
          b.satir && b.satir.tur === 'kosul' ? metinGirdisi(b.satir.deger, `${no} koşul değeri`, 'ör. ${akis:SiparisNo}', (v) => { b.satir.deger = v; }) : null
        ];
      }
      const sil = h('button', {
        type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${on}${no}: kaldır`,
        onclick: () => { t.beklentiler.splice(i, 1); beklentileriCiz(); s.degisti(); }
      }, ikon('carpi'));
      yerlestir(li, h('span', { class: 'dosya-beklenti-no', 'aria-hidden': 'true' }, String(i + 1)), tur, ...alanlar, sil);
    };
    ciz();
    return li;
  };
  const beklentileriCiz = () => {
    yerlestir(liste, t.beklentiler.length ? t.beklentiler.map(beklentiSatiri) : h('li', { class: 'soluk kucuk' }, 'Beklenti yok: en az bir beklenti ekleyin.'));
  };
  const ekle = h('button', {
    type: 'button', class: 'kucuk-dugme', 'aria-label': `${on}Beklenti ekle`,
    onclick: () => {
      t.beklentiler.push({ tur: 'icerir', deger: '' });
      beklentileriCiz();
      s.degisti();
      /** @type {HTMLElement | null} */ (liste.querySelector('li:last-child input'))?.focus();
    }
  }, ikon('arti'), 'Beklenti ekle');

  const sure = s.ekran ? sayiGirdisi(t.zamanAsimiSn ?? '', 'İndirmeyi en çok bekleme (sn)', 1, (v) => { if (v === '') delete t.zamanAsimiSn; else t.zamanAsimiSn = v; }) : null;
  if (sure) sure.setAttribute('placeholder', 'varsayılan');
  ayarlariCiz();
  beklentileriCiz();
  yerlestir(kok,
    h('div', { class: 'dosya-ust' },
      h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Dosya biçimi'), bicim),
      sure ? h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'İndirmeyi en çok bekleme (sn)'), sure) : null),
    ayarlar,
    h('b', { class: 'dosya-baslik' }, 'Beklentiler'),
    liste, ekle,
    h('p', { class: 'soluk kucuk' }, 'Karşılaştırma büyük / küçük harf ve Türkçe büyük harf (İ / I) farkını yok sayar. Metinde test verisi ${Tablo.Sütun}, önceki adımlarda okunan değer ${akis:Ad} ile yazılır. Sonuçta her beklenti için Beklenen / Görülen yazar; dosyanın kendisi yalnız Ayarlar > Koşu > Kayıt > “Doğrulanan dosya” izin verirse saklanır.'));
  return kok;
}
