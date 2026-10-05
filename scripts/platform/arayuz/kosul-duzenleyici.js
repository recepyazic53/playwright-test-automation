// AKIŞ TASARIMINDA "NE ZAMAN GÖRÜNÜR?" DÜZENLEYİCİSİ (genel; ürüne / sektöre özgü sabit yok). Bir alanın görünürlük koşulu:
//  - Alan listesi: ekranın kendi alanları (akıştaki tüm alan grupları) ve akıştaki genel senaryoların (ortak akış / önce gidilen ekran
//    blokları) alanları ("‹genel senaryo› › ‹alan›"). Alanın kendisi ve döngü kuracak alanlar (koşulu dolaylı olarak bu alana bağlı
//    olanlar) listede yoktur.
//  - Karşılaştırma: = (şunlardan biri), ≠ (hiçbiri), dolu, boş. Değerler: alanın modeldeki seçenekleri; seçenekleri kısmi / dinamik
//    ya da hiç olmayan alanda bağlı test verisi tablosunun değerleri (sunucu: kosulKaynaklari); ikisi de yoksa elle yazılan değer.
//    Çoklu işaretlenir. Onay kutusunda işaretli / işaretsiz.
//  - "ekranda görünürse (koşuda belli olur)": alanı olmayan karşılaştırma (model { calismaZamani: 'gorunurse' }); koşulda en çok bir
//    kez. Diğer satırlarla VE / VEYA ile birleşir: "Bayi = X VE ekranda görünürse" → Bayi X değilse atlanır, X ise görünürse doldurulur.
//  - "+ VE koşul" / "+ VEYA koşul": tek düzey VE ya da VEYA (karışık iç içe yok).
//  - Kilitli koşul (düzenleyicinin gösteremediği ifade; ör. iç içe ve / veya, bağlam): "Koşulu değiştir" ile açılır — şu anki koşul
//    üstte salt okunur, altında BOŞ düzenleyici; kaydedilince eski ifadenin yerini alır, "Koşulu kaldır" alanı her zaman görünür
//    yapar, Vazgeç hiçbir şeyi değiştirmez.
// Kaydedilen biçim (gorunurluk-kosulu.mjs): tek satır "=" + ekranın seçim alanı + değerler seçeneklerinden → eski biçim { secim, degerler }
// (geri uyum); diğerleri { bag, satirlar }. Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { h, ikon, yerlestir } from './ortak.js';
import { ISLEM_ADLARI, KOSUL_SATIR_EN_COK, gorunurseSatiriMi, kosulOzeti, kosulSatirlari } from './gorunurluk-kosulu.mjs';

/** Onay kutusunun koşul değerleri. */
const ONAY_DEGERLERI = [{ deger: 'true', metin: 'İşaretli' }, { deger: 'false', metin: 'İşaretsiz' }];
const ORTAK_ONEKI = 'ortak:';
let duzenleyiciSayaci = 0;

/**
 * @typedef {{ deger: string; metin: string }} Secenek
 * @typedef {{ anahtar: string; etiket: string; tur: string; secenekler: Secenek[] | null }} PaletAlani
 * @typedef {{ kismi?: boolean; tabloDegerleri?: Secenek[] }} AlanKaynagi
 * @typedef {{ id: string; etiket: string; tur: string; secenekler: Secenek[] | null } & AlanKaynagi} OrtakAlan
 * @typedef {{ alanlar?: Record<string, AlanKaynagi>; ortak?: Array<{ dosya: string; ad: string; alanlar: OrtakAlan[] }> }} KosulKaynaklari
 */

/**
 * @param {{ alanBilgisi: Map<string, PaletAlani>; kaynaklar: KosulKaynaklari | null | undefined; bloklar: () => Array<Record<string, any>> }} s
 */
export function kosulAraclari(s) {
  const kaynaklar = s.kaynaklar || {};
  const ortakKaynaklari = Array.isArray(kaynaklar.ortak) ? kaynaklar.ortak : [];
  /** Genel senaryo alanı (kimliğiyle; ilk bulunan). @param {string} id */
  const ortakAlanBul = (id) => {
    for (const o of ortakKaynaklari) {
      const a = o.alanlar.find((x) => x.id === id);
      if (a) return { o, a };
    }
    return null;
  };
  /** Satırın alanının görünen adı. @param {{ alan: string; ortak?: boolean; etiket?: string }} satir */
  const etiketBul = (satir) => {
    if (satir.ortak) { const b = ortakAlanBul(satir.alan); return b ? `${b.o.ad} › ${b.a.etiket}` : satir.etiket || satir.alan; }
    const a = s.alanBilgisi.get(satir.alan);
    return a ? a.etiket : satir.alan;
  };
  /**
   * Satır alanının tanımı: tür, değer listesi (seçenekler + tablo değerleri), elle değer gerekir mi.
   * @param {{ alan: string; ortak?: boolean }} satir
   */
  const alanTanimi = (satir) => {
    /** @type {{ tur: string; secenekler: Secenek[] | null; kaynak: AlanKaynagi }} */
    let t;
    if (satir.ortak) {
      const b = ortakAlanBul(satir.alan);
      t = b ? { tur: b.a.tur, secenekler: b.a.secenekler, kaynak: b.a } : { tur: 'text', secenekler: null, kaynak: {} };
    } else {
      const a = s.alanBilgisi.get(satir.alan);
      t = { tur: a ? a.tur : 'text', secenekler: a ? a.secenekler : null, kaynak: (kaynaklar.alanlar && kaynaklar.alanlar[satir.alan]) || {} };
    }
    const onay = t.tur === 'checkbox';
    const secenekler = onay ? ONAY_DEGERLERI : Array.isArray(t.secenekler) ? t.secenekler : [];
    const tablo = onay ? [] : Array.isArray(t.kaynak.tabloDegerleri) ? t.kaynak.tabloDegerleri : [];
    const liste = [...secenekler];
    for (const x of tablo) if (!liste.some((y) => y.deger === x.deger)) liste.push({ ...x, tablodan: true });
    const elle = !onay && !tablo.length && (!secenekler.length || t.kaynak.kismi === true);
    return { onay, liste, secenekler, elle };
  };
  /** Değerin görünen metni. @param {{ alan: string; ortak?: boolean }} satir @param {string} d */
  const degerMetni = (satir, d) => {
    const x = alanTanimi(satir).liste.find((y) => y.deger === d);
    return x ? x.metin.replace(/ \(sayfada: .*\)$/, '') : d;
  };
  /** Koşulun okunur özeti ("Tip = A ve Bayi = X ise"); koşul yoksa null. @param {unknown} kosul */
  const metin = (kosul) => (kosul ? kosulOzeti(kosul, etiketBul, degerMetni) : null);

  /** Alan grubu koşullarındaki başvurular (döngü denetimi): alan → koşulunun başvurduğu ekran alanları. */
  const basvurular = () => {
    /** @type {Map<string, string[]>} */
    const m = new Map();
    for (const b of s.bloklar()) {
      if (b.tur !== 'alanlar' || !b.kosullar) continue;
      for (const [alan, k] of Object.entries(b.kosullar)) {
        const ks = kosulSatirlari(k);
        if (ks) m.set(alan, ks.satirlar.filter((x) => !x.ortak && x.alan).map((x) => x.alan));
      }
    }
    return m;
  };
  /** aday alanın koşulu (dolaylı) hedefe bağlı mı? (o zaman hedefin koşulunda aday kullanılamaz: döngü) @param {string} aday @param {string} hedef */
  const donguMu = (aday, hedef) => {
    const m = basvurular();
    const gorulen = new Set();
    const yigin = [aday];
    while (yigin.length) {
      const x = /** @type {string} */ (yigin.pop());
      if (x === hedef) return true;
      if (gorulen.has(x)) continue;
      gorulen.add(x);
      yigin.push(...(m.get(x) || []));
    }
    return false;
  };

  /**
   * Alanın koşul düzenleyicisi.
   * @param {Record<string, any>} b alan grubu @param {string} anahtar koşullanan alan
   * kilitli: düzenleyicinin gösteremediği şu anki koşulun okunur metni (varsa düzenleyici boş başlar; kaydedilen yenisi onun yerini alır).
   * @param {{ kaydet: (kosul: Record<string, any> | null) => void; vazgec: () => void; kilitli?: string | null }} geri
   */
  function duzenleyici(b, anahtar, geri) {
    const no = ++duzenleyiciSayaci;
    const a = s.alanBilgisi.get(anahtar);
    const etiket = a ? a.etiket : anahtar;
    const kilitli = typeof geri.kilitli === 'string' && geri.kilitli ? geri.kilitli : null;
    const mevcut = kilitli ? undefined : b.kosullar ? b.kosullar[anahtar] : undefined;
    const baslangic = kosulSatirlari(mevcut);
    // Alan adayları: akıştaki ekran alanları (kendisi ve döngü kuracaklar hariç), sonra akıştaki genel senaryoların alanları.
    const ekranAdaylari = [...new Set(s.bloklar().flatMap((x) => (x.tur === 'alanlar' ? x.alanlar : [])))]
      .filter((x) => x !== anahtar && s.alanBilgisi.get(x) && s.alanBilgisi.get(x).tur !== 'kimlik' && !donguMu(x, anahtar));
    const akistakiOrtaklar = new Set(s.bloklar().filter((x) => x.tur === 'ortak').map((x) => x.dosya));
    const ortakGruplari = ortakKaynaklari.filter((o) => akistakiOrtaklar.has(o.dosya) && o.alanlar.length);
    /** @type {'ve' | 'veya'} */
    let bag = baslangic ? baslangic.bag : 've';
    /** @type {Array<{ alan: string; ortak?: boolean; islem: string; degerler: string[]; onay?: boolean; etiket?: string }>} */
    const satirlar = baslangic && baslangic.satirlar.length ? baslangic.satirlar.map((x) => ({ ...x })) : [{ alan: '', islem: 'esit', degerler: [] }];
    const satirKabi = h('div', { class: 'gk-satirlar' });
    const hataEl = h('p', { class: 'tasarim-hatalari', role: 'alert' });
    const ekleVe = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => satirEkle('ve') }, '+ VE koşul');
    const ekleVeya = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => satirEkle('veya') }, '+ VEYA koşul');
    /** @param {'ve' | 'veya'} yeniBag */
    function satirEkle(yeniBag) {
      if (satirlar.length >= KOSUL_SATIR_EN_COK) return;
      bag = yeniBag;
      satirlar.push({ alan: '', islem: 'esit', degerler: [] });
      ciz();
      satirKabi.querySelector(`[data-satir="${satirlar.length - 1}"] select`)?.focus();
    }
    const secimDegeri = (/** @type {{ alan: string; ortak?: boolean }} */ x) => (x.alan ? `${x.ortak ? ORTAK_ONEKI : ''}${x.alan}` : '');
    /** Satırın düzenleyicisi. @param {number} i */
    function satirDugumu(i) {
      const x = satirlar[i];
      const alanSecimi = h('select', { 'aria-label': 'Alan' },
        h('option', { value: '' }, 'Alan seçin…'),
        ekranAdaylari.length ? h('optgroup', { label: 'Bu ekran' }, ekranAdaylari.map((k) => h('option', { value: k, selected: !x.ortak && x.alan === k }, s.alanBilgisi.get(k).etiket))) : null,
        ortakGruplari.map((o) => h('optgroup', { label: o.ad }, o.alanlar.map((oa) => h('option', { value: `${ORTAK_ONEKI}${oa.id}`, selected: Boolean(x.ortak) && x.alan === oa.id }, `${o.ad} › ${oa.etiket}`))))
      );
      // Listede olmayan mevcut alan (ör. genel senaryo akıştan çıkarıldı): yine gösterilir, kaydederken sunucu denetler.
      if (x.alan && alanSecimi.value !== secimDegeri(x)) alanSecimi.append(h('option', { value: secimDegeri(x), selected: true }, `${etiketBul(x)} (akışta yok)`));
      const islemSecimi = h('select', { 'aria-label': 'Karşılaştırma' },
        Object.entries(ISLEM_ADLARI).map(([k, m]) => h('option', { value: k, selected: x.islem === k }, m)));
      // "Ekranda görünürse" satırının alanı yoktur (koşullanan alanın kendisi koşuda görünüyor mu).
      const alanKilidi = () => { alanSecimi.disabled = gorunurseSatiriMi(x); if (alanSecimi.disabled) alanSecimi.value = ''; };
      alanKilidi();
      const degerKabi = h('div', { class: 'kosul-degerleri', role: 'group', 'aria-label': 'Değerler' });
      const degerleriCiz = () => {
        if (gorunurseSatiriMi(x)) {
          yerlestir(degerKabi, h('p', { class: 'soluk kucuk' }, `Koşuda “${etiket}” ekranda görünüyorsa doldurulur, görünmüyorsa atlanır. Diğer koşullarla VE / VEYA ile birleşir.`));
          return;
        }
        if (!x.alan || (x.islem !== 'esit' && x.islem !== 'degil')) {
          yerlestir(degerKabi, x.alan ? h('p', { class: 'soluk kucuk' }, x.islem === 'dolu' ? 'Alana bir değer girilmişse görünür.' : 'Alan boşsa görünür.') : null);
          return;
        }
        const t = alanTanimi(x);
        // Listede olmayan seçili değerler (elle yazılmış / tablodan) da işaretli gösterilir.
        const liste = [...t.liste, ...x.degerler.filter((d) => !t.liste.some((y) => y.deger === d)).map((d) => ({ deger: d, metin: d }))];
        const ad = `kosul-${no}-${i}`;
        const kutular = liste.map((o) => h('label', { class: `onay-satiri kucuk${o.tablodan ? ' tablodan' : ''}`, title: o.tablodan ? 'Test verisi tablosundan' : null },
          h('input', { type: t.onay ? 'radio' : 'checkbox', name: t.onay ? ad : null, value: o.deger, checked: x.degerler.includes(o.deger) }), o.metin));
        const elleGirdi = t.elle ? h('input', { type: 'text', maxlength: '200', placeholder: 'değer yazın', 'aria-label': 'Elle değer' }) : null;
        const elleEkle = () => {
          if (!elleGirdi) return;
          const v = elleGirdi.value.trim();
          if (!v) return;
          if (!x.degerler.includes(v)) x.degerler.push(v);
          degerleriCiz();
          degerKabi.querySelector('input[type="text"]')?.focus();
        };
        if (elleGirdi) elleGirdi.addEventListener('keydown', (o) => { if (o.key === 'Enter') { o.preventDefault(); elleEkle(); } });
        yerlestir(degerKabi,
          ...kutular,
          !liste.length && !t.elle ? h('p', { class: 'soluk kucuk' }, 'Bu alanın seçeneği yok.') : null,
          elleGirdi ? h('span', { class: 'gk-elle' }, elleGirdi, h('button', { type: 'button', class: 'kucuk-dugme', onclick: elleEkle }, 'Değer ekle')) : null,
          t.elle ? h('small', { class: 'soluk' }, 'Seçenekleri tam bilinmiyor ve test verisi tablosuna bağlı değil: değeri yazıp ekleyin.') : null);
      };
      alanSecimi.addEventListener('change', () => {
        const v = alanSecimi.value;
        const ortak = v.startsWith(ORTAK_ONEKI);
        x.alan = ortak ? v.slice(ORTAK_ONEKI.length) : v;
        if (ortak) x.ortak = true; else delete x.ortak;
        x.degerler = [];
        hataEl.textContent = '';
        degerleriCiz();
      });
      islemSecimi.addEventListener('change', () => {
        x.islem = islemSecimi.value;
        if (x.islem !== 'esit' && x.islem !== 'degil') x.degerler = [];
        if (gorunurseSatiriMi(x)) { x.alan = ''; delete x.ortak; }
        alanKilidi();
        hataEl.textContent = '';
        degerleriCiz();
      });
      degerKabi.addEventListener('change', (o) => {
        const g = /** @type {HTMLInputElement} */ (o.target);
        if (!g || g.type === 'text') return;
        if (g.type === 'radio') x.degerler = [g.value];
        else x.degerler = g.checked ? [...new Set([...x.degerler, g.value])] : x.degerler.filter((d) => d !== g.value);
        hataEl.textContent = '';
      });
      degerleriCiz();
      return h('div', { class: 'gk-satir', role: 'group', 'aria-label': `Koşul ${i + 1}`, 'data-satir': String(i) },
        i > 0 ? h('span', { class: 'gk-bag', 'aria-hidden': 'true' }, bag === 'veya' ? 'VEYA' : 'VE') : null,
        h('div', { class: 'gk-satir-ust' },
          h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Alan'), alanSecimi),
          h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Karşılaştırma'), islemSecimi),
          satirlar.length > 1 ? h('button', {
            type: 'button', class: 'kucuk-dugme hayalet gk-kaldir', 'aria-label': `Koşul ${i + 1}: kaldır`,
            onclick: () => { satirlar.splice(i, 1); ciz(); }
          }, ikon('carpi')) : null),
        degerKabi);
    }
    function ciz() {
      yerlestir(satirKabi, ...satirlar.map((_, i) => satirDugumu(i)));
      // Tek düzey: iki ve daha çok satırda bağlaç sabittir (karışık VE / VEYA yok).
      const tam = satirlar.length >= KOSUL_SATIR_EN_COK;
      ekleVe.disabled = tam || (satirlar.length > 1 && bag !== 've');
      ekleVeya.disabled = tam || (satirlar.length > 1 && bag !== 'veya');
      ekleVe.title = ekleVe.disabled && !tam ? 'Koşullar VEYA ile bağlı; aynı koşulda VE ile karıştırılamaz.' : 'Bu koşul da sağlanmalı';
      ekleVeya.title = ekleVeya.disabled && !tam ? 'Koşullar VE ile bağlı; aynı koşulda VEYA ile karıştırılamaz.' : 'Bu koşullardan biri yeter';
    }
    ciz();
    /** Kaydedilecek koşul ya da hata metni. */
    const oku = () => {
      for (const [i, x] of satirlar.entries()) {
        const sira = satirlar.length > 1 ? `${i + 1}. koşulda ` : '';
        if (gorunurseSatiriMi(x)) continue;
        if (!x.alan) return { hata: `${sira}alan seçin.` };
        if ((x.islem === 'esit' || x.islem === 'degil') && !x.degerler.length) return { hata: `${sira}“${etiketBul(x)}” için en az bir değer işaretleyin ya da yazın.` };
      }
      if (satirlar.filter(gorunurseSatiriMi).length > 1) return { hata: '“ekranda görünürse” yalnız bir kez eklenebilir.' };
      const ilk = satirlar[0];
      const pa =!ilk.ortak ? s.alanBilgisi.get(ilk.alan) : undefined;
      // Geri uyum: tek "=" satırı, ekranın seçim alanı / onay kutusu, değerler seçeneklerinden → eski biçim.
      if (satirlar.length === 1 && ilk.islem === 'esit' && pa && Array.isArray(pa.secenekler) && ['select', 'radio', 'checkbox'].includes(pa.tur)
        && ilk.degerler.every((d) => pa.secenekler.some((o) => o.deger === d))) {
        return { kosul: { secim: ilk.alan, degerler: [...ilk.degerler] } };
      }
      return {
        kosul: {
          bag: satirlar.length > 1 ? bag : 've',
          satirlar: satirlar.map((x) => {
            if (gorunurseSatiriMi(x)) return { alan: '', islem: 'gorunurse', degerler: [] };
            const onay = alanTanimi(x).onay;
            return {
              alan: x.alan, islem: x.islem, degerler: x.islem === 'esit' || x.islem === 'degil' ? [...x.degerler] : [],
              ...(x.ortak ? { ortak: true, etiket: etiketBul(x) } : {}), ...(onay ? { onay: true } : {})
            };
          })
        }
      };
    };
    return h('div', { class: `kosul-duzenleyici genel-kosul${kilitli ? ' gk-degistir' : ''}`, role: 'group', 'aria-label': `${etiket}: ne zaman görünür` },
      h('b', {}, `“${etiket}” ne zaman görünür?`),
      // Kilitli koşulu değiştirme: şu anki koşul salt okunur; altındaki boş düzenleyici kaydedilince onun yerini alır.
      kilitli ? h('p', { class: 'gk-mevcut', 'data-kosul-mevcut': '' }, ikon('kilit'), h('span', {}, `Şu anki: ${kilitli}`)) : null,
      kilitli ? h('p', { class: 'gk-uyari', role: 'note', 'aria-label': 'Uyarı' }, 'Kaydedince şu anki koşulun yerini alır. Vazgeçerseniz şu anki koşul aynen kalır.') : null,
      ekranAdaylari.length || ortakGruplari.length ? null : h('p', { class: 'soluk kucuk' }, 'Akışta koşula bağlanabilecek başka alan yok; önce o alanı bir gruba ekleyin.'),
      satirKabi,
      h('div', { class: 'dugmeler gk-ekle' }, ekleVe, ekleVeya),
      hataEl,
      h('div', { class: 'dugmeler' },
        h('button', {
          type: 'button', class: 'kucuk-dugme birincil', onclick: () => {
            const r = oku();
            if ('hata' in r) { hataEl.textContent = `Koşul kaydedilemedi: ${r.hata}`; return; }
            geri.kaydet(r.kosul);
          }
        }, 'Koşulu kaydet'),
        mevcut || kilitli ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => geri.kaydet(null) }, 'Koşulu kaldır') : null,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => geri.vazgec() }, 'Vazgeç')));
  }

  return { metin, duzenleyici };
}
