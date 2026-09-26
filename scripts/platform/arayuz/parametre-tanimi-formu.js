// DEĞER LİSTELERİ (ORTAK): Ayarlar > Test verisi > "Değer listeleri" tablosu ve soru-cevap formu. Servisin metot tablosundaki
// "+ Yeni" / ✎ ve servis sihirbazı da aynı pencereyi açar (kayıt test verisine yazılır, sayfadan çıkılmaz).
// Form, listenin kullanılacağı yere göre değişir:
//   Ekran : ürün (ekran) → Input (ekran alanı) · bağlı olduğu Input ve değeri (değer ekranın kendi listesinden)
//   Servis: servis (ya da tüm servisler) → Parametre (servis alanı) · bağlı olduğu Parametre ve değeri
// Koşullar "ve" ile birleşir (ALTERNATİF ÜLKELER: Kapsam = 1 ve Alternatif = 2). Değerler kod + metin çiftleridir; hedefin
// bilinen bir listesi varsa (ekran seçenekleri) oradan seçilir (tümü / arama), Excel'den iki sütun (kod, metin) yüklenebilir.
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, onayliDugme, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { alanListesi, birlesikDegerler, degerEtiketi, servisHedefiMi, TANIM_TURU_ETIKETI, tanimDegerleri } from './parametre-tanimlari.mjs';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';

const q = encodeURIComponent;

/** Değer çipleri: ilk n değer + "+k". @param {Array<{ deger: string; aciklama?: string }>} degerler @param {number} [n] */
export function degerCipleri(degerler, n = 6) {
  if (!degerler.length) return h('span', { class: 'cok-soluk' }, '—');
  return h('span', { class: 'deger-cipleri' },
    degerler.slice(0, n).map((x) => h('span', { class: 'deger-cipi', title: x.aciklama || null }, degerEtiketi(x))),
    degerler.length > n ? h('span', { class: 'soluk kucuk', title: degerler.slice(n).map(degerEtiketi).join(', ') }, `+${degerler.length - n}`) : null);
}

/** Form için gerekli veriler: test verisi türleri / profilleri, servisler, ekranlar, mevcut listeler. @param {{ id: string }} proje */
export async function tanimVerileri(proje) {
  const [{ turler }, { profiller }, { servisler }, ekr, { tanimlar }] = await Promise.all([
    api(`/platform/test-verisi-turleri?projeId=${q(proje.id)}`), api(`/platform/test-verisi-profilleri?projeId=${q(proje.id)}`),
    api(`/platform/servisler?projeId=${q(proje.id)}`), api(`/platform/ekranlar?projeId=${q(proje.id)}`),
    api(`/platform/servis-parametre-tanimlari?projeId=${q(proje.id)}`)
  ]);
  return { turler, profiller, servisler, ekranlar: (ekr.ekranlar || []).filter((e) => e.modelTuru === 'ekran' && e.durum !== 'silindi'), tanimlar };
}

/** Servisin (ya da tüm servislerin) parametre adları, WSDL şemalarından + elle eklenen alanlardan (tekrarsız, sıralı). */
function servisParametreAdlari(servisler, servisId) {
  const adlar = new Set();
  for (const s of servisler.filter((x) => !servisId || x.id === servisId)) {
    for (const [op, sm] of Object.entries(s.ayarlar?.operasyonSemalari || {})) {
      for (const st of alanSatirlari(semaBirlestir(sm, (s.ayarlar.ekAlanlar || {})[op] || []).alanlar)) if (!st.grup) adlar.add(st.alan.ad);
    }
  }
  return [...adlar].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Değer listesi penceresi. tanim verilirse düzenler; yoksa on ile dolu açılır (ör. metot tablosundan: servis + parametre).
 * bitti(id) kayıttan sonra çağrılır. Eksik veriler (servisler, ekranlar, listeler) pencere açılırken yüklenir.
 * @param {{ proje: { id: string }; tanim?: any; on?: { ad?: string; tur?: string; degerler?: Array<{ deger: string; aciklama?: string }>; kullanim?: string;
 *   hedef?: { servisId?: string; parametre?: string; ekranId?: string; alan?: string } };
 *   turler?: any[]; profiller?: any[]; servisler?: any[]; ekranlar?: any[]; tanimlar?: any[]; bitti?: (id: string) => void }} s
 */
export async function tanimDiyalogu(s) {
  const veri = s.servisler && s.ekranlar && s.tanimlar && s.turler && s.profiller
    ? { turler: s.turler, profiller: s.profiller, servisler: s.servisler, ekranlar: s.ekranlar, tanimlar: s.tanimlar }
    : await tanimVerileri(s.proje);
  const t = s.tanim || null;
  const on = s.on || {};
  const ilkHedef = (t ? t.hedef : on.hedef) || {};
  let kullanim = (t ? t.kullanim : on.kullanim) === 'ekran' ? 'ekran' : 'servis';
  const ad = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: t ? t.ad : on.ad || '', placeholder: 'ör. ALTERNATİF ÜLKELER', 'aria-label': 'Ad' });
  const aciklama = h('input', { type: 'text', autocomplete: 'off', value: t ? t.aciklama || '' : '', placeholder: 'ör. Vize Schengen ülkeleri' });
  const tur = h('select', { 'aria-label': 'Değer türü' }, Object.entries(TANIM_TURU_ETIKETI).map(([d, m]) => h('option', { value: d, selected: (t ? t.tur : on.tur || 'liste') === d }, m)));
  const elle = h('input', { type: 'checkbox', id: yeniKimlik('elle'), checked: t ? t.elleYazilabilir !== false : true });

  // --- Nerede kullanılacak + hedef -------------------------------------------------------------------------------------
  const yerSecimi = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': 'Nerede kullanılacak' });
  const ekranSec = h('select', { 'aria-label': 'Ürün (ekran)' }, h('option', { value: '' }, '— ekran seçin —'),
    veri.ekranlar.map((e) => h('option', { value: e.id, selected: ilkHedef.ekranId === e.id }, `${e.ad}${e.durum === 'devre_disi' ? ' (devre dışı)' : ''}`)));
  const girdiSec = h('select', { 'aria-label': 'Input' });
  const servisSec = h('select', { 'aria-label': 'Servis' }, h('option', { value: '' }, 'Tüm servisler'),
    veri.servisler.map((x) => h('option', { value: x.id, selected: ilkHedef.servisId === x.id }, x.ad)));
  const parametreListesi = h('datalist', { id: yeniKimlik('parametreler') });
  const parametreG = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', list: parametreListesi.id, value: ilkHedef.parametre || '', placeholder: 'ör. Channel', 'aria-label': 'Parametre' });
  const hedefKap = h('div', {});
  /** @type {Map<string, Array<{ id: string; etiket: string; tip: string; secenekler: Array<{ deger: string; metin: string }> }>>} */
  const girdiOnbellek = new Map();
  let girdiler = [];
  const girdileriYukle = async () => {
    const id = ekranSec.value;
    if (!id) { girdiler = []; return; }
    if (!girdiOnbellek.has(id)) girdiOnbellek.set(id, (await api(`/platform/ekran/girdiler?projeId=${q(s.proje.id)}&ekranId=${q(id)}`)).girdiler);
    girdiler = girdiOnbellek.get(id) || [];
  };
  const girdiEtiketi = (g) => `${g.etiket}${g.secenekler.length ? ` (${g.secenekler.length} seçenek)` : ''}`;
  const girdiSecCiz = (secili) => yerlestir(girdiSec, h('option', { value: '' }, girdiler.length ? '— input seçin —' : 'Bu ekranın modeli yok'),
    ...girdiler.map((g) => h('option', { value: g.id, selected: g.id === secili }, girdiEtiketi(g))));
  const parametreListesiCiz = () => yerlestir(parametreListesi, ...servisParametreAdlari(veri.servisler, servisSec.value).map((a) => h('option', { value: a })));
  const hedefCiz = () => {
    yerlestir(yerSecimi, ...[['ekran', 'Ekran'], ['servis', 'Servis']].map(([d, m]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': kullanim === d ? 'true' : 'false', 'aria-pressed': kullanim === d ? 'true' : 'false',
      onclick: () => { if (kullanim !== d) { kullanim = d; kosullar.length = 0; hedefCiz(); kosulCiz(); degerleriCiz(); } }
    }, m)));
    yerlestir(hedefKap, kullanim === 'ekran'
      ? h('div', { class: 'satir-duzen' }, alan('Ürün (ekran)', ekranSec), alan('Input', girdiSec, { yardim: 'Listenin değerlerini belirleyeceği ekran alanı.' }))
      : h('div', { class: 'satir-duzen' }, alan('Servis', servisSec), alan('Parametre', parametreG, { yardim: 'Servis gövdesindeki alan adı (büyük / küçük harf fark etmez).' }), parametreListesi));
  };
  ekranSec.addEventListener('change', async () => { await girdileriYukle(); girdiSecCiz(''); kosullar.length = 0; kosulCiz(); degerleriCiz(); });
  girdiSec.addEventListener('change', () => { secili.clear(); kosulCiz(); degerleriCiz(); });
  servisSec.addEventListener('change', () => { parametreListesiCiz(); kosulCiz(); });
  parametreG.addEventListener('change', () => { kosulCiz(); degerleriCiz(); });

  // --- Koşullar (bağlı olduğu Input / Parametre ve değeri) -------------------------------------------------------------
  /** @type {Array<{ alan: string; deger: string }>} */
  const kosullar = ((t ? t.kosullar : null) || []).map((k) => ({ ...k }));
  const kosulKap = h('div', {});
  /** Servis parametresinin bilinen değerleri (onu hedefleyen koşulsuz listeler + adı aynı liste). */
  const servisParametreDegerleri = (p) => birlesikDegerler(veri.tanimlar.filter((l) => l.id !== t?.id && !(l.kosullar || []).length
    && (servisHedefiMi(l, servisSec.value || null, p) || alanListesi([l], undefined, '', p) === l)), veri.profiller);
  const kosulCiz = () => {
    const ekranda = kullanim === 'ekran';
    const hedefId = ekranda ? girdiSec.value : parametreG.value.trim();
    const satirlar = kosullar.map((k, i) => {
      const no = i + 1;
      let alanG;
      if (ekranda) {
        alanG = h('select', { 'aria-label': `${no}. bağlı olduğu input` }, h('option', { value: '' }, '— input —'),
          girdiler.filter((g) => g.id !== hedefId).map((g) => h('option', { value: g.id, selected: g.id === k.alan }, g.etiket)));
      } else {
        alanG = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', list: parametreListesi.id, value: k.alan, placeholder: 'ör. Channel', 'aria-label': `${no}. bağlı olduğu parametre` });
      }
      const bilinen = ekranda ? (girdiler.find((g) => g.id === k.alan)?.secenekler || []).map((x) => ({ deger: x.deger, aciklama: x.metin }))
        : k.alan ? servisParametreDegerleri(k.alan) : [];
      const degerG = bilinen.length
        ? h('select', { 'aria-label': `${no}. bağlı olduğu değer` }, h('option', { value: '' }, '— değer —'),
          bilinen.map((x) => h('option', { value: x.deger, selected: x.deger === k.deger }, degerEtiketi(x))),
          k.deger && !bilinen.some((x) => x.deger === k.deger) ? h('option', { value: k.deger, selected: true }, `${k.deger} (listede yok)`) : null)
        : h('input', { type: 'text', autocomplete: 'off', value: k.deger, placeholder: 'değer', 'aria-label': `${no}. bağlı olduğu değer` });
      alanG.addEventListener('change', () => { k.alan = alanG.value.trim(); k.deger = ''; kosulCiz(); });
      degerG.addEventListener(degerG.tagName === 'SELECT' ? 'change' : 'input', () => { k.deger = degerG.value; });
      return h('div', { class: 'kosul-satiri' }, h('span', { class: 'baglac' }, i ? 've' : 'eğer'), alanG, h('span', { class: 'soluk' }, '='), degerG,
        h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}. koşulu kaldır`, onclick: () => { kosullar.splice(i, 1); kosulCiz(); } }, ikon('carpi')));
    });
    yerlestir(kosulKap, h('fieldset', {}, h('legend', {}, ekranda ? 'Bağlı olduğu input ve değeri' : 'Bağlı olduğu parametre ve değeri'),
      satirlar.length ? h('div', { class: 'kosul-listesi' }, satirlar) : h('p', { class: 'soluk kucuk' }, 'Koşul yok: liste her zaman geçerli. Koşul eklerseniz yalnız koşullar tutunca kullanılır.'),
      kosullar.length < 5 ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { kosullar.push({ alan: '', deger: '' }); kosulCiz(); } }, ikon('arti'), 'Koşul ekle') : null));
  };

  // --- Değerler ----------------------------------------------------------------------------------------------------------
  /** Liste / evet-hayır satırları (kod + metin). */
  let satirlar = (t ? t.degerler || [] : on.degerler || []).map((x) => ({ deger: String(x.deger), aciklama: x.aciklama || '', ...(x.ekranDegeri ? { ekranDegeri: x.ekranDegeri } : {}), ...(x.ekranMetni ? { ekranMetni: x.ekranMetni } : {}) }));
  /** Ana listeden seçim modunda seçili kodlar. */
  const secili = new Set(satirlar.map((x) => x.deger));
  let ara = '';
  let varsayilan = t ? t.varsayilan || '' : '';
  const degerKap = h('div', {});
  const varsayilanKap = h('div', {});
  const kaynakTur = h('select', { 'aria-label': 'Test verisi türü' }, h('option', { value: '' }, '— tür seçin —'),
    veri.turler.map((x) => h('option', { value: x.id, selected: t?.kaynak?.turId === x.id }, x.ad)));
  const kaynakAlan = h('select', { 'aria-label': 'Test verisi alanı' });
  const kaynakOnizleme = h('div', { class: 'soluk kucuk' });
  const kaynakAlanlariCiz = () => {
    const tt = veri.turler.find((x) => x.id === kaynakTur.value);
    yerlestir(kaynakAlan, h('option', { value: '' }, '— alan seçin —'), ...(tt ? tt.alanlar : []).map((a) => h('option', {
      value: a.ad, disabled: a.hassas, selected: t?.kaynak?.alan === a.ad && t?.kaynak?.turId === kaynakTur.value
    }, `${a.etiket || a.ad}${a.hassas ? ' (hassas — listelenemez)' : ''}`)));
  };
  /** Hedefin bilinen (ana) listesi: ekranda input'un seçenekleri. */
  const anaListe = () => (kullanim === 'ekran' ? (girdiler.find((g) => g.id === girdiSec.value)?.secenekler || []).map((x) => ({ deger: x.deger, aciklama: x.metin, ...(x.ekranDegeri ? { ekranDegeri: x.ekranDegeri } : {}), ...(x.ekranMetni ? { ekranMetni: x.ekranMetni } : {}) })) : []);
  const secimModu = () => tur.value === 'liste' && anaListe().length > 0;
  const suankiDegerler = () => tur.value === 'test_verisi'
    ? tanimDegerleri({ id: '', ad: '', tur: 'test_verisi', kaynak: kaynakTur.value && kaynakAlan.value ? { turId: kaynakTur.value, alan: kaynakAlan.value } : null }, veri.profiller)
    : tur.value === 'mantiksal' ? tanimDegerleri({ id: '', ad: '', tur: 'mantiksal', degerler: satirlar }, [])
      : secimModu() ? anaListe().filter((x) => secili.has(x.deger))
        : satirlar.filter((x) => x.deger.trim()).map((x) => ({ deger: x.deger.trim(), ...(x.aciklama ? { aciklama: x.aciklama } : {}), ...(x.ekranDegeri ? { ekranDegeri: x.ekranDegeri } : {}), ...(x.ekranMetni ? { ekranMetni: x.ekranMetni } : {}) }));

  const varsayilanCiz = () => {
    const liste = suankiDegerler();
    const g = tur.value === 'serbest'
      ? h('input', { type: 'text', autocomplete: 'off', value: varsayilan, 'aria-label': 'Varsayılan değer' })
      : h('select', { 'aria-label': 'Varsayılan değer' }, h('option', { value: '' }, '— yok —'),
        liste.map((x) => h('option', { value: x.deger, selected: varsayilan === x.deger }, degerEtiketi(x))),
        varsayilan && !liste.some((x) => x.deger === varsayilan) ? h('option', { value: varsayilan, selected: true }, `${varsayilan} (listede yok)`) : null);
    g.addEventListener(g.tagName === 'SELECT' ? 'change' : 'input', () => { varsayilan = g.value; });
    yerlestir(varsayilanKap, alan('Varsayılan değer', g, { yardim: 'Yeni senaryoda alan bu değerle açılır.' }));
  };

  // Excel'den yükleme: kod sütunu + (isteğe bağlı) metin sütunu. SheetJS yalnız gerekince yüklenir (cdnjs).
  const excelNot = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const excelSecim = h('span', {});
  const dosya = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt', class: 'gorunmez', 'aria-label': 'Excel dosyası' });
  const excelDugmesi = h('label', { class: 'dugme kucuk-dugme' }, ikon('yukle'), 'Excel\'den yükle', dosya);
  dosya.addEventListener('change', async () => {
    const f = dosya.files && dosya.files[0];
    if (!f) return;
    excelNot.textContent = 'Okunuyor…';
    try {
      const satirlarX = await tabloOku(f);
      const bas = satirlarX[0] || [];
      const kodS = h('select', { 'aria-label': 'Kod sütunu' }, bas.map((b, i) => h('option', { value: String(i) }, `Kod: ${b ?? `Sütun ${i + 1}`}`)));
      const metinS = h('select', { 'aria-label': 'Metin sütunu' }, h('option', { value: '' }, 'Metin: yok'), bas.map((b, i) => h('option', { value: String(i), selected: i === 1 }, `Metin: ${b ?? `Sütun ${i + 1}`}`)));
      const baslik = h('input', { type: 'checkbox', id: yeniKimlik('bas'), checked: true });
      const al = h('button', { type: 'button', class: 'kucuk-dugme birincil' }, 'Değerleri al');
      al.addEventListener('click', () => {
        const k = Number(kodS.value); const m = metinS.value === '' ? -1 : Number(metinS.value);
        const okunan = satirlarX.slice(baslik.checked ? 1 : 0).map((r) => ({ deger: String(r[k] ?? '').trim(), aciklama: m >= 0 ? String(r[m] ?? '').trim() : '' })).filter((x) => x.deger);
        if (secimModu()) {
          const ana = anaListe();
          let bulunmayan = 0;
          for (const x of okunan) {
            const e = ana.find((a) => a.deger === x.deger) || ana.find((a) => (a.aciklama || '').toLocaleLowerCase('tr') === x.deger.toLocaleLowerCase('tr'));
            if (e) secili.add(e.deger); else bulunmayan++;
          }
          excelNot.textContent = `${okunan.length} satır okundu${bulunmayan ? `; ${bulunmayan} tanesi ekranın listesinde yok (eklenmedi)` : ''}.`;
        } else {
          for (const x of okunan) if (!satirlar.some((y) => y.deger === x.deger)) satirlar.push(x);
          satirlar = satirlar.filter((x) => x.deger);
          excelNot.textContent = `${okunan.length} satır okundu.`;
        }
        yerlestir(excelSecim);
        degerleriCiz();
      });
      yerlestir(excelSecim, kodS, metinS, h('label', { class: 'secenek', for: baslik.id }, baslik, 'İlk satır başlık'), al);
      excelNot.textContent = `${f.name} · ${satirlarX.length} satır`;
    } catch (e) { excelNot.textContent = `Dosya okunamadı: ${e.message}`; }
    dosya.value = '';
  });
  const excelSatiri = () => h('div', { class: 'excel-satiri' }, excelDugmesi, excelSecim, excelNot);

  const degerleriCiz = () => {
    if (tur.value === 'liste' && secimModu()) {
      const ana = anaListe();
      const a = ara.toLocaleLowerCase('tr');
      const gorunen = ana.filter((x) => !a || `${x.deger} ${x.aciklama || ''}`.toLocaleLowerCase('tr').includes(a));
      const araG = h('input', { type: 'search', placeholder: 'Ara…', value: ara, 'aria-label': 'Değerlerde ara' });
      araG.addEventListener('input', () => { ara = araG.value; degerleriCiz(); const y = degerKap.querySelector('input[type="search"]'); y?.focus(); y?.setSelectionRange?.(ara.length, ara.length); });
      const kutular = gorunen.map((x) => {
        const c = h('input', { type: 'checkbox', checked: secili.has(x.deger), 'aria-label': degerEtiketi(x) });
        c.addEventListener('change', () => { c.checked ? secili.add(x.deger) : secili.delete(x.deger); sayac.textContent = `${secili.size} / ${ana.length} seçili`; varsayilanCiz(); });
        return h('label', { class: 'secenek' }, c, degerEtiketi(x));
      });
      const sayac = h('span', { class: 'soluk kucuk' }, `${secili.size} / ${ana.length} seçili`);
      yerlestir(degerKap, h('fieldset', {}, h('legend', {}, 'Değerler (ekranın listesinden)'),
        h('div', { class: 'secim-araclari' }, araG,
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { ana.forEach((x) => secili.add(x.deger)); degerleriCiz(); } }, 'Tümünü seç'),
          h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { secili.clear(); degerleriCiz(); } }, 'Hiçbiri'), sayac),
        h('div', { class: 'deger-secim-listesi' }, kutular.length ? kutular : h('p', { class: 'soluk kucuk' }, 'Eşleşen değer yok.')),
        excelSatiri()));
    } else if (tur.value === 'liste' || tur.value === 'mantiksal') {
      if (tur.value === 'mantiksal') {
        const acik = (d) => satirlar.find((x) => x.deger === d)?.aciklama || '';
        satirlar = [{ deger: 'true', aciklama: acik('true') }, { deger: 'false', aciklama: acik('false') }];
      } else if (!satirlar.length) satirlar = [{ deger: '', aciklama: '' }];
      const tablo = h('div', { class: 'tanim-degerleri' }, h('div', { class: 'tanim-deger-satiri baslik' }, h('span', {}, 'Değer (kod)'), h('span', {}, 'Metin'), h('span', {})));
      satirlar.forEach((x, i) => {
        const d = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: x.deger, readonly: tur.value === 'mantiksal', 'aria-label': `${i + 1}. değer` });
        const a = h('input', { type: 'text', autocomplete: 'off', value: x.aciklama, placeholder: tur.value === 'mantiksal' ? (x.deger === 'true' ? 'Evet' : 'Hayır') : 'ör. ALMANYA', 'aria-label': `${i + 1}. değerin açıklaması` });
        d.addEventListener('input', () => { x.deger = d.value; });
        d.addEventListener('change', varsayilanCiz);
        a.addEventListener('input', () => { x.aciklama = a.value; });
        a.addEventListener('change', varsayilanCiz);
        const kaldir = tur.value === 'liste' ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. değeri kaldır`, onclick: () => { satirlar.splice(i, 1); degerleriCiz(); } }, ikon('carpi')) : h('span', {});
        tablo.append(h('div', { class: 'tanim-deger-satiri' }, d, a, kaldir));
      });
      yerlestir(degerKap, h('fieldset', {}, h('legend', {}, 'Değerler'), tablo,
        tur.value === 'liste' ? h('div', { class: 'excel-satiri' },
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { satirlar.push({ deger: '', aciklama: '' }); degerleriCiz(); degerKap.querySelectorAll('.tanim-deger-satiri input')[satirlar.length * 2 - 2]?.focus(); } }, '+ Değer ekle')) : null,
        tur.value === 'liste' ? excelSatiri() : null));
    } else if (tur.value === 'test_verisi') {
      const onizle = () => { const l = suankiDegerler(); kaynakOnizleme.textContent = l.length ? `Şu an ${l.length} değer: ${l.slice(0, 8).map(degerEtiketi).join(', ')}${l.length > 8 ? '…' : ''}` : 'Bu alanda henüz değer yok (kayıt ekleyince listelenir).'; varsayilanCiz(); };
      kaynakTur.onchange = () => { kaynakAlanlariCiz(); onizle(); };
      kaynakAlan.onchange = onizle;
      kaynakAlanlariCiz();
      yerlestir(degerKap, h('fieldset', {}, h('legend', {}, 'Değerler test verisi kayıtlarından'),
        h('p', { class: 'soluk kucuk' }, 'Değerler seçilen kayıt türünden gelir (ör. Servis girişi → kanal). Kayıt eklendikçe liste kendiliğinden büyür. Gizli alanlar listelenemez.'),
        h('div', { class: 'satir-duzen' }, alan('Tür', kaynakTur), alan('Alan', kaynakAlan)), kaynakOnizleme));
      onizle();
      return;
    } else {
      yerlestir(degerKap, h('p', { class: 'soluk kucuk' }, 'Serbest: değer listesi yok; senaryoda istenen değer yazılır.'));
    }
    varsayilanCiz();
  };
  tur.addEventListener('change', () => { if (tur.value !== 'liste' && tur.value !== 'mantiksal') satirlar = []; degerleriCiz(); });

  // --- Pencere ---------------------------------------------------------------------------------------------------------
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const baslikId = yeniKimlik('tanim-baslik');
  const form = h('form', { class: 'diyalog-govde tanim-formu', novalidate: true },
    h('h2', { id: baslikId }, t ? `Değer listesini düzenle: ${t.ad}` : 'Değer listesi ekle'),
    mesaj.kutu,
    h('div', { class: 'satir-duzen' }, alan('Ad', ad, { zorunlu: true, yardim: 'Listenin adı; test verisi ekranında bu adla görünür.' }), alan('Değer türü', tur)),
    alan('Açıklama', aciklama),
    h('div', { class: 'alan' }, h('span', { class: 'alan-etiketi' }, 'Nerede kullanılacak'), yerSecimi),
    hedefKap, kosulKap, degerKap, varsayilanKap,
    h('label', { class: 'secenek', for: elle.id }, elle, 'Listede olmayan değer de yazılabilir (senaryoda "Elle yaz")'),
    h('div', { class: 'diyalog-alt' }, vazgec, kaydet));
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-diyalog', 'aria-labelledby': baslikId }, form);
  vazgec.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Ad boş olamaz.'); ad.focus(); return; }
    if (kullanim === 'ekran' && (!ekranSec.value || !girdiSec.value)) { mesaj.goster('Listenin kullanılacağı ekranı ve input\'u seçin.'); return; }
    if (kosullar.some((k) => !k.alan || !k.deger)) { mesaj.goster('Her koşulda bağlı olduğu alanı ve değerini seçin.'); return; }
    const degerler = tur.value === 'liste' || tur.value === 'mantiksal' ? suankiDegerler() : [];
    if (tur.value === 'liste' && !degerler.length) { mesaj.goster('En az bir değer girin ya da seçin.'); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-parametre-tanimi/kaydet', { govde: {
        id: t ? t.id : undefined, projeId: s.proje.id, ad: ad.value.trim(), aciklama: aciklama.value, tur: tur.value, degerler,
        kaynak: tur.value === 'test_verisi' && kaynakTur.value ? { turId: kaynakTur.value, alan: kaynakAlan.value } : null,
        varsayilan, elleYazilabilir: elle.checked, kullanim,
        hedef: kullanim === 'ekran' ? { ekranId: ekranSec.value, alan: girdiSec.value, alanEtiketi: girdiler.find((g) => g.id === girdiSec.value)?.etiket || '' } : { servisId: servisSec.value, parametre: parametreG.value.trim() },
        kosullar: kosullar.map((k) => ({ alan: k.alan, deger: k.deger, etiket: kullanim === 'ekran' ? girdiler.find((g) => g.id === k.alan)?.etiket || '' : '' }))
      } }));
      bildir(`"${ad.value.trim()}" değer listesi kaydedildi.`);
      diyalog.close();
      s.bitti?.(r.id);
    } catch (e) { mesaj.goster(e.message); }
  });
  document.body.append(diyalog);
  if (kullanim === 'ekran') { await girdileriYukle(); girdiSecCiz(ilkHedef.alan || ''); }
  parametreListesiCiz();
  hedefCiz();
  kosulCiz();
  degerleriCiz();
  diyalog.showModal();
  ad.focus();
}

/**
 * Excel (.xlsx) / CSV / TXT dosyasının ilk sayfası satırlar olarak (her satır hücre metinleri dizisi). Kütüphane kullanılmaz:
 * .xlsx bir ZIP'tir; tarayıcının DecompressionStream'i ile açılır, sayfa ve ortak metinler DOMParser ile okunur.
 * Eski ikili .xls desteklenmez (xlsx ya da csv olarak kaydedilmeli).
 * @param {File} dosya @returns {Promise<string[][]>}
 */
export async function tabloOku(dosya) {
  if (/\.(csv|txt)$/i.test(dosya.name)) {
    const metin = (await dosya.text()).replace(/^﻿/, '');
    const ilk = metin.split(/\r?\n/, 1)[0] || '';
    const ayrac = ilk.includes('\t') ? '\t' : ilk.includes(';') ? ';' : ',';
    return metin.split(/\r?\n/).filter((x) => x.trim()).map((x) => x.split(ayrac).map((y) => y.trim().replace(/^"|"$/g, '')));
  }
  if (/\.xls$/i.test(dosya.name)) throw new Error('Eski .xls biçimi okunamıyor; dosyayı Excel\'de .xlsx ya da .csv olarak kaydedin.');
  const zip = new Uint8Array(await dosya.arrayBuffer());
  const g = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let son = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (g.getUint32(i, true) === 0x06054b50) { son = i; break; }
  if (son < 0) throw new Error('Dosya .xlsx değil.');
  /** @type {Map<string, { yontem: number; boyut: number; yerel: number }>} */
  const girdiler = new Map();
  let p = g.getUint32(son + 16, true);
  for (let n = g.getUint16(son + 10, true); n > 0; n--) {
    if (g.getUint32(p, true) !== 0x02014b50) break;
    const adUz = g.getUint16(p + 28, true);
    const ad = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + adUz));
    girdiler.set(ad, { yontem: g.getUint16(p + 10, true), boyut: g.getUint32(p + 20, true), yerel: g.getUint32(p + 42, true) });
    p += 46 + adUz + g.getUint16(p + 30, true) + g.getUint16(p + 32, true);
  }
  const oku = async (ad) => {
    const e = girdiler.get(ad);
    if (!e) return null;
    const bas = e.yerel + 30 + g.getUint16(e.yerel + 26, true) + g.getUint16(e.yerel + 28, true);
    const ham = zip.subarray(bas, bas + e.boyut);
    const veri = e.yontem === 0 ? ham : new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    return new DOMParser().parseFromString(new TextDecoder().decode(veri), 'application/xml');
  };
  // İlk sayfa: workbook.xml'deki ilk <sheet> → ilişki dosyasındaki hedef.
  let sayfaYolu = 'xl/worksheets/sheet1.xml';
  const kitap = await oku('xl/workbook.xml');
  const iliski = await oku('xl/_rels/workbook.xml.rels');
  const ilkSayfa = kitap?.getElementsByTagName('sheet')[0];
  const rid = ilkSayfa ? ilkSayfa.getAttribute('r:id') || ilkSayfa.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') : null;
  const hedef = rid && iliski ? [...iliski.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') : null;
  if (hedef) sayfaYolu = hedef.startsWith('/') ? hedef.slice(1) : `xl/${hedef.replace(/^\.\//, '')}`;
  const ortak = await oku('xl/sharedStrings.xml');
  const metinler = ortak ? [...ortak.getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent || '').join('')) : [];
  const sayfa = await oku(sayfaYolu);
  if (!sayfa) throw new Error('Sayfa bulunamadı.');
  const sutun = (ref) => { let n = 0; for (const c of (ref.match(/^[A-Z]+/) || ['A'])[0]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
  return [...sayfa.getElementsByTagName('row')].map((r) => {
    /** @type {string[]} */
    const satir = [];
    for (const c of r.getElementsByTagName('c')) {
      const tip = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const deger = tip === 's' ? metinler[Number(v)] ?? '' : tip === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent || '').join('') : tip === 'b' ? (v === '1' ? 'true' : 'false') : v;
      satir[sutun(c.getAttribute('r') || 'A')] = deger;
    }
    return Array.from(satir, (x) => x ?? '');
  }).filter((x) => x.some((y) => String(y).trim()));
}

/** Listenin nerede kullanıldığı (kısa metin). */
function yerMetni(t, veri) {
  if (t.kullanim === 'ekran') {
    const e = veri.ekranlar.find((x) => x.id === t.hedef?.ekranId);
    return `Ekran · ${e ? e.ad : '(silinmiş ekran)'} › ${t.hedef?.alanEtiketi || t.hedef?.alan || '?'}`;
  }
  const sv = t.hedef?.servisId ? veri.servisler.find((x) => x.id === t.hedef.servisId)?.ad || '(silinmiş servis)' : 'Tüm servisler';
  return `Servis · ${sv}${t.hedef?.parametre ? ` › ${t.hedef.parametre}` : ''}`;
}

/**
 * Ayarlar > Test verisi > Değer listeleri: listeler tablosu (ekle / düzenle / sil).
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {() => void} yenile
 */
export async function servisParametreleriBolumu(kap, proje, yenile) {
  const veri = await tanimVerileri(proje);
  const { tanimlar } = veri;
  const ac = (tanim) => tanimDiyalogu({ proje, tanim, ...veri, bitti: yenile });
  const arama = h('input', { type: 'search', placeholder: 'Liste ara…', 'aria-label': 'Liste ara' });
  const yerSuzgeci = h('select', { 'aria-label': 'Nerede' }, [['', 'Tümü'], ['ekran', 'Ekran'], ['servis', 'Servis']].map(([d, m]) => h('option', { value: d }, m)));
  const tabloKap = h('div', {});
  // Ekran modellerindeki seçenek listelerini değer listesi olarak al: önce ne ekleneceği gösterilir, onayla eklenir.
  const iceAlmaKap = h('div', { 'aria-live': 'polite' });
  const iceAl = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('yukle'), 'Ekranlardan içe al');
  iceAl.addEventListener('click', async () => {
    try {
      const { onizleme: o } = await mesgulIken(iceAl, 'Hazırlanıyor…', () => api('/platform/deger-listeleri/modellerden', { govde: { projeId: proje.id } }));
      if (!o.toplam) { yerlestir(iceAlmaKap, h('div', { class: 'not-kutusu', role: 'status' }, 'Eklenecek yeni liste yok: ekranların seçenek listeleri zaten değer listelerinde.')); return; }
      const uygula = h('button', { type: 'button', class: 'birincil kucuk-dugme' }, `${o.toplam} listeyi ekle`);
      uygula.addEventListener('click', async () => {
        try {
          await mesgulIken(uygula, 'Ekleniyor…', () => api('/platform/deger-listeleri/modellerden', { govde: { projeId: proje.id, onay: true } }));
          bildir(`${o.toplam} değer listesi eklendi.`);
          yenile();
        } catch (e) { bildir(e.message, 'hata'); }
      });
      yerlestir(iceAlmaKap, h('div', { class: 'not-kutusu', role: 'status' },
        h('div', {}, h('b', {}, `${o.toplam} değer listesi eklenecek`), ` (${o.kosullu} tanesi koşullu: bağımlı alanlar)`),
        h('ul', { class: 'kucuk' }, o.ekranlar.map((e) => h('li', {}, `${e.ekran}: ${e.eklenecek} liste${e.atlanan ? ` (${e.atlanan} zaten var)` : ''}`))),
        h('div', { class: 'soluk kucuk' }, 'Listeler ekranın modelindeki seçeneklerden oluşur ve bundan sonra modelin önüne geçer: senaryo formu, doğrulama ve koşu bu listeleri kullanır. Model yedek olarak kalır.'),
        h('div', { class: 'dugmeler' }, uygula, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => yerlestir(iceAlmaKap) }, 'Vazgeç'))));
    } catch (e) { bildir(e.message, 'hata'); }
  });
  const ciz = () => {
    const a = arama.value.trim().toLocaleLowerCase('tr');
    const liste = tanimlar.filter((t) => (!yerSuzgeci.value || t.kullanim === yerSuzgeci.value) && (!a || `${t.ad} ${t.aciklama} ${yerMetni(t, veri)}`.toLocaleLowerCase('tr').includes(a)));
    if (!tanimlar.length) {
      yerlestir(tabloKap, bosDurum('Henüz değer listesi yok.', 'Bir input\'un ya da servis parametresinin alabileceği değerleri tanımlayın (ör. ALTERNATİF ÜLKELER: Kapsam = 1 ve Alternatif = 2 ise şu ülkeler). Servisin metot tablosundan da "+ Yeni" ile eklenebilir.', { ikon: 'liste' }));
      return;
    }
    const kosulMetni = (t) => {
      if (!(t.kosullar || []).length) return h('span', { class: 'cok-soluk' }, 'her zaman');
      return h('span', {}, t.kosullar.map((k, i) => h('span', {}, i ? ' ve ' : '', h('code', { class: 'duz' }, `${k.etiket || k.alan} = ${k.deger}`))));
    };
    yerlestir(tabloKap, h('section', { class: 'kart senaryo-karti' }, h('div', { class: 'tablo-kaydirma' },
      h('table', { class: 'senaryo-tablosu tanim-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Değer listeleri'),
        h('thead', {}, h('tr', {}, ['Ad', 'Nerede', 'Koşul', 'Değerler'].map((x) => h('th', { scope: 'col' }, x)),
          h('th', { scope: 'col', class: 'eylemler' }, h('span', { class: 'gorunmez' }, 'Eylemler')))),
        h('tbody', {}, liste.map((t) => h('tr', { 'data-tanim': t.id },
          h('td', {}, h('div', { class: 'senaryo-adi' }, h('strong', {}, t.ad),
            h('small', {}, rozet(TANIM_TURU_ETIKETI[t.tur] || t.tur, 'vurgu'), t.elleYazilabilir === false ? rozet('yalnız liste', 'durdu') : null, t.aciklama ? h('span', {}, t.aciklama) : null))),
          h('td', { class: 'kucuk' }, yerMetni(t, veri)),
          h('td', { class: 'kucuk' }, kosulMetni(t)),
          h('td', {}, degerCipleri(tanimDegerleri(t, veri.profiller), 6)),
          h('td', { class: 'eylemler' }, h('span', { class: 'satir-eylemleri' },
            h('button', { type: 'button', class: 'dugme ikon-dugme', title: 'Düzenle', 'aria-label': `Düzenle: ${t.ad}`, onclick: () => ac(t) }, ikon('duzenle')),
            onayliDugme('Sil', 'Silmeyi onayla', async () => {
              await api('/platform/servis-parametre-tanimi/sil', { govde: { projeId: proje.id, id: t.id } });
              bildir('Değer listesi silindi.');
              yenile();
            }, { kucuk: true, etiket: `${t.ad}: sil` }))))))))));
  };
  arama.addEventListener('input', ciz);
  yerSuzgeci.addEventListener('change', ciz);
  yerlestir(kap,
    h('div', { class: 'bolum-basligi' }, h('h3', {}, 'Değer listeleri', rozet(String(tanimlar.length))),
      h('span', { class: 'sag' }, iceAl, h('button', { type: 'button', class: 'birincil', onclick: () => ac(null) }, '+ Değer listesi ekle'))),
    iceAlmaKap,
    h('p', { class: 'soluk kucuk' }, 'Bir ekran input\'unun ya da servis parametresinin alabileceği değerler. Koşul eklenirse (ör. Kapsam = 1 ve Alternatif = 2) liste yalnız o seçimlerde kullanılır; senaryo oluştururken alanın seçenekleri bu listeden gelir. Listede olmayan değer (olumsuz senaryo) uyarıyla kaydedilir.'),
    tanimlar.length ? h('div', { class: 'senaryo-arac-cubugu' }, h('div', { class: 'arama-kutusu' }, ikon('ara'), arama),
      h('div', { class: 'filtre-secimi' }, h('label', {}, 'Nerede'), yerSuzgeci)) : null,
    tabloKap);
  ciz();
}
