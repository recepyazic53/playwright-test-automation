// Servis parametre tanımları = DEĞER LİSTELERİ (ORTAK): Ayarlar > Test verisi > "Servis parametreleri" listesi ve tanım penceresi.
// Servisin metot tablosundaki "+ Yeni" / ✎ de aynı pencereyi açar (kayıt test verisine yazılır, sayfadan çıkılmaz).
// Bir liste: ad, açıklama, değer türü (liste / evet-hayır / test verisinden / serbest), değerler ve açıklamaları, varsayılan,
// "listede olmayan değer yazılabilir". Tüm servislerde seçilebilir; hangi alana bağlanacağı servisin metot tablosunda seçilir.
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, onayliDugme, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { degerEtiketi, TANIM_TURU_ETIKETI, tanimDegerleri } from './parametre-tanimlari.mjs';

const q = encodeURIComponent;

/** Değer çipleri: ilk n değer + "+k". @param {Array<{ deger: string; aciklama?: string }>} degerler @param {number} [n] */
export function degerCipleri(degerler, n = 6) {
  if (!degerler.length) return h('span', { class: 'cok-soluk' }, '—');
  return h('span', { class: 'deger-cipleri' },
    degerler.slice(0, n).map((x) => h('span', { class: 'deger-cipi', title: x.aciklama || null }, degerEtiketi(x))),
    degerler.length > n ? h('span', { class: 'soluk kucuk', title: degerler.slice(n).map(degerEtiketi).join(', ') }, `+${degerler.length - n}`) : null);
}

/**
 * Tanım penceresi. tanim verilirse düzenler; yoksa on (ad, tur, degerler) ile dolu açılır. bitti(id) kayıttan sonra çağrılır.
 * @param {{ proje: { id: string }; tanim?: any; on?: { ad?: string; tur?: string; degerler?: Array<{ deger: string; aciklama?: string }> };
 *   turler: any[]; profiller: any[]; bitti?: (id: string) => void }} s
 */
export function tanimDiyalogu(s) {
  const t = s.tanim || null;
  const on = s.on || {};
  const ad = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: t ? t.ad : on.ad || '', placeholder: 'ör. IsTestMode' });
  const aciklama = h('input', { type: 'text', autocomplete: 'off', value: t ? t.aciklama || '' : '', placeholder: 'ör. Test modu (kayıt oluşmaz)' });
  const tur = h('select', {}, Object.entries(TANIM_TURU_ETIKETI).map(([d, m]) => h('option', { value: d, selected: (t ? t.tur : on.tur || 'liste') === d }, m)));
  const elle = h('input', { type: 'checkbox', id: yeniKimlik('elle'), checked: t ? t.elleYazilabilir !== false : true });
  const varsayilanKap = h('div', {});
  const degerKap = h('div', {});
  /** Liste / evet-hayır satırları. */
  let satirlar = (t ? t.degerler || [] : on.degerler || []).map((x) => ({ deger: String(x.deger), aciklama: x.aciklama || '' }));
  let varsayilan = t ? t.varsayilan || '' : '';
  const kaynakTur = h('select', { 'aria-label': 'Test verisi türü' }, h('option', { value: '' }, '— tür seçin —'),
    s.turler.map((x) => h('option', { value: x.id, selected: t?.kaynak?.turId === x.id }, x.ad)));
  const kaynakAlan = h('select', { 'aria-label': 'Test verisi alanı' });
  const kaynakOnizleme = h('div', { class: 'soluk kucuk' });
  const kaynakAlanlariCiz = () => {
    const tt = s.turler.find((x) => x.id === kaynakTur.value);
    yerlestir(kaynakAlan, h('option', { value: '' }, '— alan seçin —'), ...(tt ? tt.alanlar : []).map((a) => h('option', {
      value: a.ad, disabled: a.hassas, selected: t?.kaynak?.alan === a.ad && t?.kaynak?.turId === kaynakTur.value
    }, `${a.etiket || a.ad}${a.hassas ? ' (hassas — listelenemez)' : ''}`)));
  };
  const suankiDegerler = () => tur.value === 'test_verisi'
    ? tanimDegerleri({ id: '', ad: '', tur: 'test_verisi', kaynak: kaynakTur.value && kaynakAlan.value ? { turId: kaynakTur.value, alan: kaynakAlan.value } : null }, s.profiller)
    : tur.value === 'mantiksal' ? tanimDegerleri({ id: '', ad: '', tur: 'mantiksal', degerler: satirlar }, [])
      : satirlar.filter((x) => x.deger.trim()).map((x) => ({ deger: x.deger.trim(), ...(x.aciklama ? { aciklama: x.aciklama } : {}) }));

  const varsayilanCiz = () => {
    const liste = suankiDegerler();
    const g = tur.value === 'serbest'
      ? h('input', { type: 'text', autocomplete: 'off', value: varsayilan, 'aria-label': 'Varsayılan değer' })
      : h('select', { 'aria-label': 'Varsayılan değer' }, h('option', { value: '' }, '— yok —'),
        liste.map((x) => h('option', { value: x.deger, selected: varsayilan === x.deger }, degerEtiketi(x))),
        varsayilan && !liste.some((x) => x.deger === varsayilan) ? h('option', { value: varsayilan, selected: true }, `${varsayilan} (listede yok)`) : null);
    g.addEventListener(g.tagName === 'SELECT' ? 'change' : 'input', () => { varsayilan = g.value; });
    yerlestir(varsayilanKap, alan('Varsayılan değer', g, { yardim: 'Yeni senaryoda zorunlu alan boşsa bu değerle açılır.' }));
  };

  const degerleriCiz = () => {
    if (tur.value === 'liste' || tur.value === 'mantiksal') {
      if (tur.value === 'mantiksal') {
        const acik = (d) => satirlar.find((x) => x.deger === d)?.aciklama || '';
        satirlar = [{ deger: 'true', aciklama: acik('true') }, { deger: 'false', aciklama: acik('false') }];
      } else if (!satirlar.length) satirlar = [{ deger: '', aciklama: '' }];
      const tablo = h('div', { class: 'tanim-degerleri' }, h('div', { class: 'tanim-deger-satiri baslik' }, h('span', {}, 'Değer'), h('span', {}, 'Açıklama'), h('span', {})));
      satirlar.forEach((x, i) => {
        const d = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: x.deger, readonly: tur.value === 'mantiksal', 'aria-label': `${i + 1}. değer` });
        const a = h('input', { type: 'text', autocomplete: 'off', value: x.aciklama, placeholder: tur.value === 'mantiksal' ? (x.deger === 'true' ? 'Evet' : 'Hayır') : 'ör. Basılı', 'aria-label': `${i + 1}. değerin açıklaması` });
        d.addEventListener('input', () => { x.deger = d.value; });
        d.addEventListener('change', varsayilanCiz);
        a.addEventListener('input', () => { x.aciklama = a.value; });
        a.addEventListener('change', varsayilanCiz);
        const kaldir = tur.value === 'liste' ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. değeri kaldır`, onclick: () => { satirlar.splice(i, 1); degerleriCiz(); } }, ikon('carpi')) : h('span', {});
        tablo.append(h('div', { class: 'tanim-deger-satiri' }, d, a, kaldir));
      });
      yerlestir(degerKap, h('fieldset', {}, h('legend', {}, 'Alabileceği değerler'), tablo,
        tur.value === 'liste' ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { satirlar.push({ deger: '', aciklama: '' }); degerleriCiz(); degerKap.querySelectorAll('.tanim-deger-satiri input')[satirlar.length * 2 - 2]?.focus(); } }, '+ Değer ekle') : null));
    } else if (tur.value === 'test_verisi') {
      const onizle = () => { const l = suankiDegerler(); kaynakOnizleme.textContent = l.length ? `Şu an ${l.length} değer: ${l.slice(0, 8).map(degerEtiketi).join(', ')}${l.length > 8 ? '…' : ''}` : 'Bu alanda henüz değer yok (profil ekleyince listelenir).'; varsayilanCiz(); };
      kaynakTur.onchange = () => { kaynakAlanlariCiz(); onizle(); };
      kaynakAlan.onchange = onizle;
      kaynakAlanlariCiz();
      yerlestir(degerKap, h('fieldset', {}, h('legend', {}, 'Değerler test verisinden'),
        h('p', { class: 'soluk kucuk' }, 'Değerler seçilen türün profillerinden gelir (ör. Servis girişi → kanal). Profil eklendikçe liste kendiliğinden büyür. Hassas alanlar listelenemez.'),
        h('div', { class: 'satir-duzen' }, alan('Tür', kaynakTur), alan('Alan', kaynakAlan)), kaynakOnizleme));
      onizle();
      return;
    } else {
      yerlestir(degerKap, h('p', { class: 'soluk kucuk' }, 'Serbest: değer listesi yok; senaryoda istenen değer yazılır.'));
    }
    varsayilanCiz();
  };
  tur.addEventListener('change', () => { if (tur.value !== 'liste' && tur.value !== 'mantiksal') satirlar = []; degerleriCiz(); });

  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const baslikId = yeniKimlik('tanim-baslik');
  const form = h('form', { class: 'diyalog-govde tanim-formu', novalidate: true },
    h('h2', { id: baslikId }, t ? `Değer listesini düzenle: ${t.ad}` : 'Değer listesi ekle'),
    t ? h('p', { class: 'soluk kucuk' }, 'Bu listeye bağlı tüm servis alanları değişiklikten etkilenir.') : null,
    mesaj.kutu,
    h('div', { class: 'satir-duzen' }, alan('Parametre adı', ad, { zorunlu: true, yardim: 'Listenin adı. Alan adıyla aynıysa (ör. Channel) servislerde o alana kendiliğinden bağlanır.' }), alan('Değer türü', tur)),
    alan('Açıklama', aciklama),
    degerKap, varsayilanKap,
    h('label', { class: 'secenek', for: elle.id }, elle, 'Listede olmayan değer de yazılabilir (senaryoda "Elle yaz")'),
    h('div', { class: 'diyalog-alt' }, vazgec, kaydet));
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-diyalog', 'aria-labelledby': baslikId }, form);
  vazgec.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Parametre adı boş olamaz.'); ad.focus(); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-parametre-tanimi/kaydet', { govde: {
        id: t ? t.id : undefined, projeId: s.proje.id, ad: ad.value.trim(), aciklama: aciklama.value, tur: tur.value,
        degerler: tur.value === 'liste' || tur.value === 'mantiksal' ? satirlar : [],
        kaynak: tur.value === 'test_verisi' && kaynakTur.value ? { turId: kaynakTur.value, alan: kaynakAlan.value } : null,
        varsayilan, elleYazilabilir: elle.checked
      } }));
      bildir(`"${ad.value.trim()}" değer listesi kaydedildi.`);
      diyalog.close();
      s.bitti?.(r.id);
    } catch (e) { mesaj.goster(e.message); }
  });
  document.body.append(diyalog);
  degerleriCiz();
  diyalog.showModal();
  ad.focus();
}

/** Tanım için gerekli veriler (test verisi türleri / profilleri). @param {{ id: string }} proje */
export async function tanimVerileri(proje) {
  const [{ turler }, { profiller }] = await Promise.all([
    api(`/platform/test-verisi-turleri?projeId=${q(proje.id)}`), api(`/platform/test-verisi-profilleri?projeId=${q(proje.id)}`)
  ]);
  return { turler, profiller };
}

/**
 * Ayarlar > Test verisi > Servis parametreleri: tanımlar tablosu (ekle / düzenle / sil).
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {() => void} yenile
 */
export async function servisParametreleriBolumu(kap, proje, yenile) {
  const [{ tanimlar }, veri] = await Promise.all([api(`/platform/servis-parametre-tanimlari?projeId=${q(proje.id)}`), tanimVerileri(proje)]);
  const ac = (tanim) => tanimDiyalogu({ proje, tanim, ...veri, bitti: yenile });
  const arama = h('input', { type: 'search', placeholder: 'Parametre ara…', 'aria-label': 'Parametre ara' });
  const tabloKap = h('div', {});
  const ciz = () => {
    const a = arama.value.trim().toLocaleLowerCase('tr');
    const liste = tanimlar.filter((t) => !a || `${t.ad} ${t.aciklama}`.toLocaleLowerCase('tr').includes(a));
    if (!tanimlar.length) {
      yerlestir(tabloKap, bosDurum('Henüz servis parametresi tanımı yok.', 'Bir alanın alabileceği değerleri tanımlayın (ör. IsTestMode: true / false, PrintType: 1 / 2 / 3). Servisin metot tablosunda alana bağlanır; oradan da "+ Yeni" ile eklenebilir.', { ikon: 'liste' }));
      return;
    }
    yerlestir(tabloKap, h('section', { class: 'kart senaryo-karti' }, h('div', { class: 'tablo-kaydirma' },
      h('table', { class: 'senaryo-tablosu tanim-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Servis parametreleri'),
        h('thead', {}, h('tr', {}, ['Parametre', 'Alabileceği değerler', 'Varsayılan'].map((x) => h('th', { scope: 'col' }, x)),
          h('th', { scope: 'col', class: 'eylemler' }, h('span', { class: 'gorunmez' }, 'Eylemler')))),
        h('tbody', {}, liste.map((t) => h('tr', { 'data-tanim': t.id },
          h('td', {}, h('div', { class: 'senaryo-adi' }, h('strong', {}, h('code', { class: 'duz' }, t.ad)),
            h('small', {}, rozet(TANIM_TURU_ETIKETI[t.tur] || t.tur, 'vurgu'), t.elleYazilabilir === false ? rozet('yalnız liste', 'durdu') : null, t.aciklama ? h('span', {}, t.aciklama) : null))),
          h('td', {}, degerCipleri(tanimDegerleri(t, veri.profiller), 8)),
          h('td', {}, t.varsayilan ? h('code', { class: 'duz' }, t.varsayilan) : h('span', { class: 'cok-soluk' }, '—')),
          h('td', { class: 'eylemler' }, h('span', { class: 'satir-eylemleri' },
            h('button', { type: 'button', class: 'dugme ikon-dugme', title: 'Düzenle', 'aria-label': `Düzenle: ${t.ad}`, onclick: () => ac(t) }, ikon('duzenle')),
            onayliDugme('Sil', 'Silmeyi onayla', async () => {
              await api('/platform/servis-parametre-tanimi/sil', { govde: { projeId: proje.id, id: t.id } });
              bildir('Parametre tanımı silindi.');
              yenile();
            }, { kucuk: true, etiket: `${t.ad}: sil` }))))))))));
  };
  arama.addEventListener('input', ciz);
  yerlestir(kap,
    h('div', { class: 'bolum-basligi' }, h('h3', {}, 'Servis parametreleri', rozet(String(tanimlar.length))),
      h('button', { type: 'button', class: 'birincil', onclick: () => ac(null) }, '+ Parametre ekle')),
    h('p', { class: 'soluk kucuk' }, 'Servis alanlarının alabileceği değerler (değer listeleri). Tüm servislerde seçilebilir; servisin metot tablosunda bir alana bağlanınca senaryo düzenleyicide o alanın değeri bu listeden seçilir. Listede olmayan değer (olumsuz senaryo) uyarıyla kaydedilir.'),
    tanimlar.length ? h('div', { class: 'senaryo-arac-cubugu' }, h('div', { class: 'arama-kutusu' }, ikon('ara'), arama)) : null,
    tabloKap);
  ciz();
}
