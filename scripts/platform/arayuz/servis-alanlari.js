// Metot alan tablosu (ORTAK: Servis ekle sihirbazı 3. adım ve servisin Parametreler sekmesi).
// Satır: Alan (tip) | Varsayılan değer (parametre) | Zorunlu. İsteğe bağlı: "Alan ekle (WSDL'de yok)" — elle eklenen alanlar
// ek listesinde tutulur (servis ayarı ekAlanlar), şemaya semaBirlestir ile katılır ve kaldırılabilir.
// Yazma kutusu yoktur (seçim kutuları); alan ekleme formu ayrı durur, tablo yalnız ekleme / kaldırma olunca yeniden çizilir.
import { h, rozet } from './ortak.js';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';

const TIP = { metin: 'metin', tamsayi: 'sayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };
const YOL = /^[A-Za-z_][\w.-]*(\/[A-Za-z_][\w.-]*)*$/;

/**
 * @param {{
 *   ad: string;                                   // metot adı (etiketlerde)
 *   sema: import('./servis-govdesi.mjs').OperasyonSemasi;   // WSDL şeması (ekler hariç)
 *   varsayilan: Record<string, string>;           // yol → parametre adı ('' = yok); DEĞİŞTİRİLİR
 *   sabitler?: Record<string, string>;            // parametre dışı varsayılanların etiketi (ör. "Sabit: 12"): seçimde korunur
 *   zorunlu: Set<string>;                         // zorunlu yollar; DEĞİŞTİRİLİR
 *   ekler?: Array<{ yol: string; tip?: string }>; // elle eklenen alanlar; verilirse "Alan ekle" gösterilir; DEĞİŞTİRİLİR
 *   secenekler: Array<[string, Array<[string, string]>]>;   // [grup, [[parametre, etiket]]]
 *   degisti?: () => void;
 * }} s
 */
export function metotAlanTablosu(s) {
  const kap = h('div', { class: 'metot-alanlari' });
  const sayac = h('span', { class: 'soluk' });
  const sayacGuncelle = () => { sayac.textContent = ` · ${s.zorunlu.size} zorunlu${s.ekler && s.ekler.length ? ` · ${s.ekler.length} elle eklenen` : ''}`; };
  const tablo = h('div', { class: 'alan-formu sihirbaz-alanlari' });
  const ciz = () => {
    const birlesik = semaBirlestir(s.sema, s.ekler || []);
    const satirlar = alanSatirlari(birlesik.alanlar).map((st) => {
      if (st.grup) return h('div', { class: `alan-grubu derinlik-${Math.min(st.derinlik, 6)}` }, st.alan.ad);
      const sabit = s.sabitler?.[st.yol];
      const sec = h('select', { 'aria-label': `${s.ad} ${st.yol} varsayılanı` }, h('option', { value: '' }, '— yok (senaryoda doldurulur) —'),
        sabit ? h('option', { value: '__sabit', selected: !s.varsayilan[st.yol] }, sabit) : null,
        ...s.secenekler.map(([g, l]) => h('optgroup', { label: g }, l.map(([p, m]) => h('option', { value: p, selected: s.varsayilan[st.yol] === p }, m)))),
        s.varsayilan[st.yol] && !s.secenekler.some(([, l]) => l.some(([p]) => p === s.varsayilan[st.yol])) ? h('option', { value: s.varsayilan[st.yol], selected: true }, s.varsayilan[st.yol]) : null);
      const zk = h('input', { type: 'checkbox', checked: s.zorunlu.has(st.yol), 'aria-label': `${s.ad} ${st.yol} zorunlu`,
        title: st.alan.ek ? 'Elle eklenen alan' : st.alan.zorunlu ? 'WSDL\'de zorunlu (minOccurs=1)' : 'WSDL\'de isteğe bağlı' });
      const satir = h('div', { class: `alan-satiri derinlik-${Math.min(st.derinlik, 6)} ${s.varsayilan[st.yol] || sabit ? '' : 'gonderilmez'} ${s.zorunlu.has(st.yol) ? 'zorunlu' : ''}` },
        h('span', { class: 'alan-adi', title: st.yol }, st.alan.ad, h('span', { class: 'alan-tipi' }, st.alan.secenekler ? 'liste' : TIP[st.alan.tip] || 'metin'),
          st.alan.ek ? rozet('WSDL\'de yok', 'durdu') : null,
          st.alan.ek && s.ekler ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${st.yol} alanını kaldır`, onclick: () => {
            s.ekler.splice(s.ekler.findIndex((x) => x.yol === st.yol), 1);
            delete s.varsayilan[st.yol];
            s.zorunlu.delete(st.yol);
            ciz();
            s.degisti?.();
          } }, '×') : null),
        sec, h('span', { class: 'zorunlu-hucre' }, zk));
      sec.addEventListener('change', () => {
        if (sec.value === '__sabit') delete s.varsayilan[st.yol];
        else { s.varsayilan[st.yol] = sec.value; if (s.sabitler) delete s.sabitler[st.yol]; }
        satir.classList.toggle('gonderilmez', !sec.value);
        s.degisti?.();
      });
      zk.addEventListener('change', () => { zk.checked ? s.zorunlu.add(st.yol) : s.zorunlu.delete(st.yol); satir.classList.toggle('zorunlu', zk.checked); sayacGuncelle(); s.degisti?.(); });
      return satir;
    });
    tablo.replaceChildren(h('div', { class: 'alan-satiri baslik' }, h('span', {}, 'Alan'), h('span', {}, 'Varsayılan değer'), h('span', { class: 'zorunlu-hucre' }, 'Zorunlu')), ...satirlar);
    sayacGuncelle();
  };
  ciz();
  kap.append(tablo);
  if (s.ekler) {
    // Alan ekle (WSDL'de yok): yol (grup/alan), tip, zorunlu.
    const kok = s.sema.alanlar.length === 1 && s.sema.alanlar[0].cocuklar ? `${s.sema.alanlar[0].ad}/` : '';
    const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: `${kok}YeniAlan`, value: kok, 'aria-label': `${s.ad} yeni alan yolu` });
    const tip = h('select', { 'aria-label': `${s.ad} yeni alan tipi` }, Object.entries(TIP).map(([d, m]) => h('option', { value: d }, m)));
    const zor = h('input', { type: 'checkbox', 'aria-label': `${s.ad} yeni alan zorunlu` });
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme' }, '+ Alan ekle');
    ekle.addEventListener('click', () => {
      const y = yol.value.trim().replace(/^\/+|\/+$/g, '');
      not.textContent = '';
      if (!YOL.test(y)) { not.textContent = 'Yol harf ile başlamalı; gruplar "/" ile ayrılır (ör. Input/YeniAlan).'; return; }
      if (alanSatirlari(semaBirlestir(s.sema, s.ekler).alanlar).some((x) => x.yol === y)) { not.textContent = `"${y}" zaten var.`; return; }
      s.ekler.push({ yol: y, tip: tip.value });
      if (zor.checked) s.zorunlu.add(y);
      yol.value = kok;
      zor.checked = false;
      ciz();
      s.degisti?.();
    });
    kap.append(h('div', { class: 'alan-ekle-satiri' }, h('span', { class: 'soluk kucuk' }, 'WSDL\'de olmayan bir alan:'), yol, tip,
      h('label', { class: 'secenek' }, zor, 'Zorunlu'), ekle, not));
  }
  return { el: kap, sayac };
}
