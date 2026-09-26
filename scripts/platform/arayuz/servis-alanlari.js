// Metot alan tablosu (ORTAK: Servis ekle sihirbazı 3. adım ve servisin Parametreler sekmesi).
// Satır: Alan (tip) | Değer kaynağı (değer listesi ya da koşuda dolan parametre; + Yeni / ✎; altında listenin değerleri) | Zorunlu. İsteğe bağlı: "Alan ekle (WSDL'de yok)" — elle eklenen alanlar
// ek listesinde tutulur (servis ayarı ekAlanlar), şemaya semaBirlestir ile katılır ve kaldırılabilir.
// Yazma kutusu yoktur (seçim kutuları); alan ekleme formu "+ Alan ekle" ile açılır, tablo yalnız ekleme / kaldırma olunca yeniden çizilir.
// metotKutulari: her metot bir kutucuk; tıklanan metodun tablosu altta çerçeve içinde açılır (iç içe açılır bölümler yok).
import { h, ikon, rozet, yeniKimlik } from './ortak.js';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';
import { alanListesi, tanimDegerleri, wsdlOnerisi } from './parametre-tanimlari.mjs';
import { degerCipleri } from './parametre-tanimi-formu.js';

const TIP = { metin: 'metin', tamsayi: 'sayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };
const YOL = /^[A-Za-z_][\w.-]*(\/[A-Za-z_][\w.-]*)*$/;

/**
 * Alanın seçili değer kaynağı: koşuda dolan parametre ("SIGORTALI_TC") | "liste:<id>" | "__sabit" (korunan diğer varsayılan) | "".
 * @param {Parameters<typeof metotAlanTablosu>[0]} s @param {string} yol @param {string} alanAdi
 */
export function kaynakSecimi(s, yol, alanAdi) {
  const p = s.varsayilan[yol];
  if (p) return p;
  const l = s.baglantilar ? alanListesi(s.listeler || [], s.baglantilar, yol, alanAdi) : null;
  if (l) return `liste:${l.id}`;
  return s.sabitler?.[yol] ? '__sabit' : '';
}

/**
 * @param {{
 *   ad: string;                                   // metot adı (etiketlerde)
 *   sema: import('./servis-govdesi.mjs').OperasyonSemasi;   // WSDL şeması (ekler hariç)
 *   varsayilan: Record<string, string>;           // yol → koşuda dolan parametre adı ('' = yok); DEĞİŞTİRİLİR
 *   sabitler?: Record<string, string>;            // diğer varsayılanların etiketi (ör. "Sabit: 12", "Boş gönder"): seçimde korunur
 *   zorunlu: Set<string>;                         // zorunlu yollar; DEĞİŞTİRİLİR
 *   ekler?: Array<{ yol: string; tip?: string }>; // elle eklenen alanlar; verilirse "Alan ekle" gösterilir; DEĞİŞTİRİLİR
 *   secenekler: Array<[string, Array<[string, string]>]>;   // koşuda dolan parametreler: [grup, [[parametre, etiket]]]
 *   baglantilar?: Record<string, string>;         // yol → değer listesi id ('' = bilerek yok); verilirse listeler seçilebilir; DEĞİŞTİRİLİR
 *   listeler?: import('./parametre-tanimlari.mjs').ParametreTanimi[];   // değer listeleri (Ayarlar > Test verisi > Servis parametreleri)
 *   profiller?: Array<{ turId: string; ad: string; degerler: Record<string, unknown> }>;   // "test verisinden" listelerin değerleri için
 *   listeAc?: (tanim: any, alan: { ad: string; tip?: string; secenekler?: string[] }, sonra: (id: string) => void) => void;  // + Yeni / ✎
 *   degisti?: () => void;
 * }} s
 */
export function metotAlanTablosu(s) {
  const kap = h('div', { class: 'metot-alanlari' });
  const sayac = h('span', { class: 'soluk' });
  const sayacGuncelle = () => { sayac.textContent = ` · ${s.zorunlu.size} zorunlu${s.ekler && s.ekler.length ? ` · ${s.ekler.length} elle eklenen` : ''}`; };
  const listeli = Boolean(s.baglantilar);
  const tablo = h('div', { class: `alan-formu sihirbaz-alanlari${listeli ? ' listeli' : ''}` });
  // Arama ve süzgeçler: yalnız tablo yeniden çizilir (seçimler s üzerinde durduğu için kaybolmaz).
  const ara = h('input', { type: 'search', placeholder: 'Alan ara…', 'aria-label': `${s.ad} alan ara` });
  const yalnizZorunlu = h('input', { type: 'checkbox', id: yeniKimlik('yz'), 'aria-label': `${s.ad} yalnız zorunlular` });
  const yalnizBos = h('input', { type: 'checkbox', id: yeniKimlik('yb'), 'aria-label': `${s.ad} yalnız değer kaynağı olmayanlar` });
  const ust = h('div', { class: 'alan-formu-ust' }, ara,
    h('label', { class: 'secenek', for: yalnizZorunlu.id }, yalnizZorunlu, 'Yalnız zorunlular'),
    h('label', { class: 'secenek', for: yalnizBos.id }, yalnizBos, 'Yalnız değer kaynağı olmayanlar'));
  const listeEtiketi = (t) => {
    const d = tanimDegerleri(t, s.profiller || []);
    return `${t.ad}${d.length ? ` (${d.slice(0, 3).map((x) => x.deger).join(', ')}${d.length > 3 ? '…' : ''})` : ''}`;
  };
  const ciz = () => {
    const birlesik = semaBirlestir(s.sema, s.ekler || []);
    const a = ara.value.trim().toLocaleLowerCase('tr');
    const suzgecli = Boolean(a || yalnizZorunlu.checked || yalnizBos.checked);
    const satirlar = alanSatirlari(birlesik.alanlar).map((st) => {
      if (st.grup) return suzgecli ? null : h('div', { class: `alan-grubu derinlik-${Math.min(st.derinlik, 6)}` }, st.alan.ad);
      const secili = kaynakSecimi(s, st.yol, st.alan.ad);
      if (a && !st.yol.toLocaleLowerCase('tr').includes(a)) return null;
      if (yalnizZorunlu.checked && !s.zorunlu.has(st.yol)) return null;
      if (yalnizBos.checked && secili) return null;
      const sabit = s.sabitler?.[st.yol];
      const liste = secili.startsWith('liste:') ? (s.listeler || []).find((t) => `liste:${t.id}` === secili) ?? null : null;
      const sec = h('select', { 'aria-label': `${s.ad} ${st.yol} değer kaynağı` }, h('option', { value: '' }, '— yok (senaryoda doldurulur) —'),
        sabit ? h('option', { value: '__sabit', selected: secili === '__sabit' }, sabit) : null,
        listeli && (s.listeler || []).length ? h('optgroup', { label: 'Değer listeleri (senaryoda listeden seçilir)' },
          (s.listeler || []).map((t) => h('option', { value: `liste:${t.id}`, selected: secili === `liste:${t.id}` }, listeEtiketi(t)))) : null,
        ...s.secenekler.map(([g, l]) => h('optgroup', { label: `Koşuda dolan — ${g}` }, l.map(([p, m]) => h('option', { value: p, selected: secili === p }, m)))),
        s.varsayilan[st.yol] && !s.secenekler.some(([, l]) => l.some(([p]) => p === s.varsayilan[st.yol])) ? h('option', { value: s.varsayilan[st.yol], selected: true }, s.varsayilan[st.yol]) : null);
      // Bağlantı: liste seçilince parametre kalkar; parametre / "yok" seçilince ad eşleşmesi de kapanır ('' = bilerek yok).
      const baglaListe = (id) => { delete s.varsayilan[st.yol]; if (s.sabitler) delete s.sabitler[st.yol]; if (s.baglantilar) s.baglantilar[st.yol] = id; ciz(); s.degisti?.(); };
      sec.addEventListener('change', () => {
        const v = sec.value;
        if (v === '__sabit') return;
        if (v.startsWith('liste:')) { baglaListe(v.slice('liste:'.length)); return; }
        delete s.varsayilan[st.yol];
        if (s.sabitler) delete s.sabitler[st.yol];
        if (v) s.varsayilan[st.yol] = v;
        if (s.baglantilar) s.baglantilar[st.yol] = '';
        ciz();
        s.degisti?.();
      });
      const oneri = liste ? null : wsdlOnerisi(st.alan);
      const altBilgi = liste
        ? degerCipleri(tanimDegerleri(liste, s.profiller || []), 5)
        : oneri && listeli ? h('span', { class: 'oneri-degerleri', title: 'WSDL\'den öneri: "+ Yeni" ile değer listesi olarak kaydedilir' }, degerCipleri(oneri.tur === 'mantiksal' ? [{ deger: 'true' }, { deger: 'false' }] : oneri.degerler, 5)) : null;
      const kaynakHucresi = h('span', { class: 'kaynak-hucresi' },
        h('span', { class: 'kaynak-secimi' }, sec,
          listeli && s.listeAc && liste ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', title: 'Listeyi düzenle', 'aria-label': `Listeyi düzenle: ${st.alan.ad}`, onclick: () => s.listeAc?.(liste, st.alan, () => ciz()) }, ikon('duzenle')) : null,
          listeli && s.listeAc ? h('button', { type: 'button', class: 'kucuk-dugme', title: 'Yeni değer listesi oluştur ve bu alana bağla', 'aria-label': `Yeni değer listesi: ${st.alan.ad}`, onclick: () => s.listeAc?.(null, st.alan, baglaListe) }, ikon('arti'), 'Yeni') : null),
        altBilgi);
      const zk = h('input', { type: 'checkbox', checked: s.zorunlu.has(st.yol), 'aria-label': `${s.ad} ${st.yol} zorunlu`,
        title: st.alan.ek ? 'Elle eklenen alan' : st.alan.zorunlu ? 'WSDL\'de zorunlu (minOccurs=1)' : 'WSDL\'de isteğe bağlı' });
      const satir = h('div', { class: `alan-satiri derinlik-${suzgecli ? 0 : Math.min(st.derinlik, 6)} ${secili ? '' : 'gonderilmez'} ${s.zorunlu.has(st.yol) ? 'zorunlu' : ''}` },
        h('span', { class: 'alan-adi', title: st.yol }, st.alan.ad, h('span', { class: 'alan-tipi' }, st.alan.secenekler ? 'liste' : TIP[st.alan.tip] || 'metin'),
          st.alan.ek ? rozet('WSDL\'de yok', 'durdu') : null,
          st.alan.ek && s.ekler ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${st.yol} alanını kaldır`, onclick: () => {
            s.ekler.splice(s.ekler.findIndex((x) => x.yol === st.yol), 1);
            delete s.varsayilan[st.yol];
            if (s.baglantilar) delete s.baglantilar[st.yol];
            s.zorunlu.delete(st.yol);
            ciz();
            s.degisti?.();
          } }, '×') : null),
        kaynakHucresi, h('span', { class: 'zorunlu-hucre' }, zk));
      zk.addEventListener('change', () => { zk.checked ? s.zorunlu.add(st.yol) : s.zorunlu.delete(st.yol); satir.classList.toggle('zorunlu', zk.checked); sayacGuncelle(); s.degisti?.(); });
      return satir;
    }).filter(Boolean);
    tablo.replaceChildren(h('div', { class: 'alan-satiri baslik' }, h('span', {}, 'Alan'),
      h('span', { title: 'Değer listesi: senaryoda bu alanın değeri listeden seçilir. Koşuda dolan: gövdeye ${AD} yazılır, değer koşuda test verisinden / tarih kuralından gelir.' }, 'Değer kaynağı'),
      h('span', { class: 'zorunlu-hucre' }, 'Zorunlu')),
    ...(satirlar.length ? satirlar : [h('p', { class: 'soluk kucuk' }, 'Süzgeçle eşleşen alan yok.')]));
    sayacGuncelle();
  };
  ara.addEventListener('input', ciz);
  yalnizZorunlu.addEventListener('change', ciz);
  yalnizBos.addEventListener('change', ciz);
  ciz();
  kap.append(ust, tablo);
  if (s.ekler) {
    // Alan ekle (WSDL'de yok): "+ Alan ekle" formu açar; yol (grup/alan), tip, zorunlu.
    const kok = s.sema.alanlar.length === 1 && s.sema.alanlar[0].cocuklar ? `${s.sema.alanlar[0].ad}/` : '';
    const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: `${kok}YeniAlan`, value: kok, 'aria-label': `${s.ad} yeni alan yolu` });
    const tip = h('select', { 'aria-label': `${s.ad} yeni alan tipi` }, Object.entries(TIP).map(([d, m]) => h('option', { value: d }, m)));
    const zor = h('input', { type: 'checkbox', 'aria-label': `${s.ad} yeni alan zorunlu` });
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme birincil' }, 'Ekle');
    const ac = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-expanded': 'false' }, '+ Alan ekle');
    const form = h('div', { class: 'alan-ekle-formu', hidden: true });
    const goster = (acik) => {
      form.hidden = !acik; ac.hidden = acik; ac.setAttribute('aria-expanded', String(acik));
      not.textContent = ''; yol.value = kok; zor.checked = false;
      if (acik) yol.focus(); else ac.focus();
    };
    ac.addEventListener('click', () => goster(true));
    const vazgec = h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => goster(false) }, 'Vazgeç');
    ekle.addEventListener('click', () => {
      const y = yol.value.trim().replace(/^\/+|\/+$/g, '');
      not.textContent = '';
      if (!YOL.test(y)) { not.textContent = 'Yol harf ile başlamalı; gruplar "/" ile ayrılır (ör. Input/YeniAlan).'; return; }
      if (alanSatirlari(semaBirlestir(s.sema, s.ekler).alanlar).some((x) => x.yol === y)) { not.textContent = `"${y}" zaten var.`; return; }
      s.ekler.push({ yol: y, tip: tip.value });
      if (zor.checked) s.zorunlu.add(y);
      ciz();
      s.degisti?.();
      goster(false);
    });
    form.append(h('span', { class: 'soluk kucuk' }, 'WSDL\'de olmayan bir alan (gruplar "/" ile):'),
      h('div', { class: 'alan-ekle-satiri' }, yol, tip, h('label', { class: 'secenek' }, zor, 'Zorunlu'), ekle, vazgec), not);
    kap.append(h('div', { class: 'alan-ekle' }, ac, form));
  }
  return { el: kap, sayac };
}

/** Son açılan metot (anahtar → metot adı): kaydet / yenile sonrası aynı metot açık gelir. */
const sonAcik = new Map();

/**
 * Metot kutucukları: her metot bir kutucuk (ad, alan ve zorunlu sayısı); tıklanan metodun alan tablosu altta çerçeve içinde
 * açılır. Tek metot varsa kendiliğinden açılır. Tablolar ilk açılışta kurulur; açılıp kapanınca girilenler korunur.
 * @param {Array<Parameters<typeof metotAlanTablosu>[0]>} tanimlar @param {{ anahtar?: string }} [secim]
 */
export function metotKutulari(tanimlar, secim = {}) {
  /** @type {Map<string, ReturnType<typeof metotAlanTablosu>>} */
  const tablolar = new Map();
  /** @type {Map<string, Array<() => void>>} */
  const guncelleyiciler = new Map();
  const alanSayisi = (s) => alanSatirlari(semaBirlestir(s.sema, s.ekler || []).alanlar).filter((x) => !x.grup).length;
  const bilgi = (s) => {
    const el = h('span', { class: 'metot-kutusu-bilgi' });
    const g = () => {
      const bos = alanSatirlari(semaBirlestir(s.sema, s.ekler || []).alanlar).filter((x) => !x.grup && !kaynakSecimi(s, x.yol, x.alan.ad)).length;
      el.textContent = `${alanSayisi(s)} alan · ${s.zorunlu.size} zorunlu${s.ekler && s.ekler.length ? ` · ${s.ekler.length} elle eklenen` : ''}${bos ? ` · ${bos} alanın değer kaynağı yok` : ''}`;
    };
    g();
    guncelleyiciler.get(s.ad)?.push(g);
    return el;
  };
  for (const s of tanimlar) {
    guncelleyiciler.set(s.ad, []);
    const eski = s.degisti;
    s.degisti = () => { for (const g of guncelleyiciler.get(s.ad) || []) g(); eski?.(); };
  }
  const cerceve = h('div', { class: 'metot-cercevesi', hidden: true });
  const kutular = tanimlar.map((s) => h('button', {
    type: 'button', class: 'metot-kutusu', 'aria-pressed': 'false', 'aria-label': `${s.ad} metodu`, onclick: () => ac(acik === s.ad ? null : s.ad)
  }, h('code', { class: 'duz' }, s.ad), bilgi(s)));
  let acik = null;
  function ac(ad) {
    acik = ad;
    if (secim.anahtar) { if (ad) sonAcik.set(secim.anahtar, ad); else sonAcik.delete(secim.anahtar); }
    tanimlar.forEach((s, i) => kutular[i].setAttribute('aria-pressed', s.ad === ad ? 'true' : 'false'));
    const s = tanimlar.find((x) => x.ad === ad);
    if (!s) { cerceve.hidden = true; cerceve.replaceChildren(); return; }
    if (!tablolar.has(ad)) tablolar.set(ad, metotAlanTablosu(s));
    const t = /** @type {ReturnType<typeof metotAlanTablosu>} */ (tablolar.get(ad));
    cerceve.replaceChildren(
      h('div', { class: 'metot-cercevesi-baslik' }, h('h4', {}, h('code', { class: 'duz' }, s.ad)), bilgi(s),
        h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${s.ad} alanlarını kapat`, title: 'Kapat', onclick: () => ac(null) }, ikon('carpi'))),
      t.el);
    cerceve.hidden = false;
  }
  const ilk = (secim.anahtar && sonAcik.get(secim.anahtar)) || (tanimlar.length === 1 ? tanimlar[0].ad : null);
  if (ilk && tanimlar.some((s) => s.ad === ilk)) ac(ilk);
  return h('div', { class: 'metot-kutulari' },
    h('div', { class: 'metot-izgara', role: 'group', 'aria-label': 'Metotlar' }, kutular),
    tanimlar.length > 1 ? h('p', { class: 'soluk kucuk metot-ipucu' }, 'Alanlarını görmek için bir metot seçin.') : null,
    cerceve);
}
