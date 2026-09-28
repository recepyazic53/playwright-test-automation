// TARİH ALANI GİRDİSİ (genel) — senaryo formunun tarih alanları: "Sabit tarih" / "Bugüne göre" (/ bağlı tabloda "Tablodan").
//  - Bugüne göre: "Bugün | Ay başı | Ay sonu" [+/−] [N] gün; altında önizleme "Bugün koşulursa: 05.10.2026". Saklanan değer göreli
//    ifade metnidir ("bugün+7"); koşucu her koşuda o günün tarihini (Europe/Istanbul) alanın biçimiyle yazar.
//  - Alanın sınırları (enAz / enCok; göreli olabilir) varsa önizleme sınır dışında uyarır.
//  - Sabit tarih geçmişte kaldıysa (ya da bugün koşulursa sınır dışındaysa) uyarı + tek tık "Bugüne göre yap": tarihin senaryonun son
//    kaydedildiği güne göre farkı korunur (kaydedildiği gün 5 gün sonrası yazılmışsa "bugün+5"); kayıt anı yoksa "bugün".
//  - Sabit kutuya doğrudan "bugün+7" yazılırsa "Bugüne göre"ye geçilir.
// Kurallar tek kaynaktan: goreli-tarih.mjs (koşucuyla ortak). Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h()).
import { h, ikon } from './ortak.js';
import {
  EN_COK_GUN, bugunuGoreliOner, eskiyenTarih, goreliGun, goreliIfadeAyristir, goreliIfadeYaz, gunFarki, istanbulGunu, sabitTarihAyristir,
  tarihBicimle, tarihSinirDenetimi
} from './goreli-tarih.mjs';

let sayac = 0;

/**
 * @param {{ id: string; etiket: string; deger: unknown; bicim?: string | null; sinirlar?: { enAz?: unknown; enCok?: unknown } | null;
 *   referans?: string | null; tablodan?: { deger: string; metin: string } | null; tabloBasvurusu?: (d: unknown) => unknown;
 *   degistir: (deger: string) => void; simdi?: () => Date }} s
 * @returns {{ el: HTMLElement; girdiler: HTMLElement[]; kip: () => 'sabit' | 'goreli' | 'tablo' }}
 */
export function tarihGirdisi(s) {
  const simdi = () => (s.simdi ? s.simdi() : new Date());
  const bicim = s.bicim || 'gg.aa.yyyy';
  const on = `tg-${++sayac}`;
  const ilkDeger = typeof s.deger === 'string' ? s.deger : '';
  let kip = s.tabloBasvurusu && s.tabloBasvurusu(ilkDeger) ? 'tablo' : goreliIfadeAyristir(ilkDeger) ? 'goreli' : 'sabit';
  let sonTablo = kip === 'tablo' ? ilkDeger : s.tablodan?.deger ?? '';

  // --- Kip seçimi (radyo) ---
  const secenekler = [['sabit', 'Sabit tarih'], ['goreli', 'Bugüne göre'], ...(s.tablodan || kip === 'tablo' ? [['tablo', 'Tablodan']] : [])];
  const radyolar = secenekler.map(([d]) => h('input', { type: 'radio', name: `${on}-kip`, value: d, checked: d === kip }));
  const kipGrubu = h('div', { class: 'tarih-kipi', role: 'radiogroup', 'aria-label': `${s.etiket}: tarih nasıl verilsin` },
    radyolar.map((r, i) => h('label', {}, r, secenekler[i][1])));

  // --- Sabit tarih ---
  const sabit = h('input', { type: 'text', id: s.id, value: kip === 'sabit' ? ilkDeger : '', autocomplete: 'off', spellcheck: 'false', placeholder: bicim,
    'aria-describedby': `${s.id}-hata ${s.id}-uyari ${on}-eskime` });
  const eskimeMetni = h('span', {});
  const bugunuYap = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${s.etiket}: bugüne göre yap` }, ikon('takvim'), 'Bugüne göre yap');
  const eskime = h('div', { class: 'tarih-eskime', id: `${on}-eskime`, role: 'status', hidden: true }, ikon('uyari'), eskimeMetni, bugunuYap);
  const sabitPanel = h('div', { class: 'tarih-sabit' }, sabit, eskime);

  // --- Bugüne göre ---
  const ilk = goreliIfadeAyristir(ilkDeger) ?? { taban: 'bugun', gun: 0 };
  const taban = h('select', { 'aria-label': `${s.etiket}: başlangıç` },
    [['bugun', 'Bugün'], ['ayBasi', 'Ay başı'], ['aySonu', 'Ay sonu']].map(([d, m]) => h('option', { value: d, selected: d === ilk.taban }, m)));
  const yon = h('select', { class: 'tarih-yon', 'aria-label': `${s.etiket}: ileri / geri` },
    h('option', { value: '+', selected: ilk.gun >= 0 }, '+'), h('option', { value: '-', selected: ilk.gun < 0 }, '−'));
  const gun = h('input', { type: 'number', class: 'tarih-gun', min: '0', max: String(EN_COK_GUN), step: '1', inputmode: 'numeric', value: String(Math.abs(ilk.gun)),
    'aria-label': `${s.etiket}: gün sayısı`, 'aria-describedby': `${on}-onizleme` });
  const onizleme = h('div', { class: 'tarih-onizleme', id: `${on}-onizleme`, 'aria-live': 'polite' });
  const sinirUyarisi = h('div', { class: 'tarih-sinir-uyarisi', role: 'status' });
  const goreliPanel = h('div', { class: 'tarih-goreli' },
    h('div', { class: 'tarih-goreli-satiri' }, taban, yon, gun, h('span', { class: 'soluk' }, 'gün')), onizleme, sinirUyarisi);

  // --- Tablodan ---
  const tabloMetni = h('span', {});
  const tabloPanel = h('div', { class: 'tablodan-deger' }, ikon('veri'), tabloMetni,
    h('small', { class: 'soluk' }, ' · tablo hücresine "bugün+7" gibi göreli tarih de yazılabilir'));

  const goreliDeger = () => {
    const n = Math.min(EN_COK_GUN, Math.max(0, Math.trunc(Number(gun.value) || 0)));
    return goreliIfadeYaz({ taban: /** @type {any} */ (taban.value), gun: yon.value === '-' ? -n : n });
  };
  const sinirMetni = (/** @type {import('./goreli-tarih.mjs').Gun} */ t) => {
    const d = tarihSinirDenetimi(t, s.sinirlar, bicim, simdi());
    return d ? `Bugün koşulursa sınır dışında: ${d.mesaj}` : '';
  };

  function goreliyiGuncelle() {
    const ifade = goreliDeger();
    const t = goreliGun(ifade, simdi());
    onizleme.replaceChildren(ikon('takvim'), h('span', {}, 'Bugün koşulursa: ', h('strong', { class: 'mono' }, t ? tarihBicimle(t, bicim) : '—')),
      h('small', { class: 'soluk' }, ` · saklanan: ${ifade}; her koşuda o günün tarihi yazılır`));
    sinirUyarisi.textContent = t ? sinirMetni(t) : '';
  }
  function eskimeyiGuncelle() {
    // Yeni senaryoda kayıt anı "şimdi": geçmiş tarih bilerek yazılmış sayılır (ör. doğum tarihi); yalnız sınır dışı uyarılır.
    const e = kip === 'sabit' ? eskiyenTarih(sabit.value, bicim, s.sinirlar, simdi(), s.referans ?? simdi()) : null;
    eskime.hidden = !e;
    if (!e) return;
    const oneri = bugunuGoreliOner(sabit.value, bicim, s.referans ?? null, s.sinirlar, simdi());
    const t = sabitTarihAyristir(sabit.value, bicim);
    const r = s.referans ? new Date(s.referans) : null;
    const neden = e.neden === 'sinir' ? ` Sınıra göre önerilen: ${oneri}.` : t && r && !Number.isNaN(r.getTime())
      ? ` Kaydedildiği güne (${tarihBicimle(istanbulGunu(r), bicim)}) göre farkı korunur: ${oneri}.`
      : ` Önerilen: ${oneri}.`;
    eskimeMetni.textContent = `${e.mesaj}${neden}`;
    bugunuYap.dataset.oneri = oneri;
  }
  function goster() {
    sabitPanel.hidden = kip !== 'sabit';
    goreliPanel.hidden = kip !== 'goreli';
    tabloPanel.hidden = kip !== 'tablo';
    for (const r of radyolar) r.checked = r.value === kip;
    const b = s.tabloBasvurusu && sonTablo ? /** @type {any} */ (s.tabloBasvurusu(sonTablo)) : null;
    tabloMetni.textContent = b ? `Tablodan: ${b.tablo}${b.etiket ? ` [${b.etiket}]` : ''} → ${b.sutun}` : (s.tablodan?.metin ?? '');
    if (kip === 'goreli') goreliyiGuncelle();
    eskimeyiGuncelle();
  }
  /** Göreli ifadeyi denetimlere yazar. @param {string} ifade */
  function goreliyeYaz(ifade) {
    const i = goreliIfadeAyristir(ifade) ?? { taban: 'bugun', gun: 0 };
    taban.value = i.taban;
    yon.value = i.gun < 0 ? '-' : '+';
    gun.value = String(Math.abs(i.gun));
  }

  for (const r of radyolar) {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      const onceki = kip;
      kip = /** @type {any} */ (r.value);
      if (kip === 'goreli') {
        // Sabit tarih yazılıysa bugüne göre farkı alınır (önizleme aynı tarihi gösterir); boşsa "bugün".
        const t = onceki === 'sabit' ? sabitTarihAyristir(sabit.value, bicim) : null;
        if (t) goreliyeYaz(goreliIfadeYaz({ taban: 'bugun', gun: gunFarki(istanbulGunu(simdi()), t) }));
        s.degistir(goreliDeger());
      } else if (kip === 'sabit') {
        const t = onceki === 'goreli' ? goreliGun(goreliDeger(), simdi()) : null;
        if (t) sabit.value = tarihBicimle(t, bicim);
        s.degistir(sabit.value);
      } else {
        if (!sonTablo && s.tablodan) sonTablo = s.tablodan.deger;
        s.degistir(sonTablo);
      }
      goster();
    });
  }
  sabit.addEventListener('input', () => { s.degistir(sabit.value); eskimeyiGuncelle(); });
  sabit.addEventListener('change', () => {
    // "bugün+7" doğrudan yazıldıysa "Bugüne göre"ye geçilir.
    if (goreliIfadeAyristir(sabit.value)) {
      goreliyeYaz(sabit.value);
      sabit.value = '';
      kip = 'goreli';
      s.degistir(goreliDeger());
      goster();
      gun.focus();
    }
  });
  for (const el of [taban, yon, gun]) {
    el.addEventListener(el === gun ? 'input' : 'change', () => { s.degistir(goreliDeger()); goreliyiGuncelle(); });
  }
  bugunuYap.addEventListener('click', () => {
    goreliyeYaz(bugunuYap.dataset.oneri || 'bugün');
    sabit.value = '';
    kip = 'goreli';
    s.degistir(goreliDeger());
    goster();
    gun.focus();
  });
  goster();
  return {
    el: h('div', { class: 'tarih-girdisi' }, kipGrubu, sabitPanel, goreliPanel, tabloPanel),
    girdiler: [sabit, gun],
    kip: () => /** @type {any} */ (kip)
  };
}
