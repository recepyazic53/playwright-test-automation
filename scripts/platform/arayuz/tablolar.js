// TEST VERİSİ TABLOLARI (Ayarlar > Test verisi > Tablolar). Test verisi Excel sayfaları gibidir: sütunlar alan, her satır
// birlikte geçerli bir değer kombinasyonu (ör. Servis girişi: Kanal | Kullanıcı | Parola). Ekran input'ları ve servis
// parametreleri bir sütuna bağlanır; senaryoda seçtikçe aynı tablodaki listeler satırlardan süzülür (koşul tanımı yok).
//   · Sol: tablolar (sütun / satır sayısı) + "Yeni tablo".
//   · Sağ: düzenlenebilir ızgara — sütun adı / gizli / sil, satır hücreleri, Ortam (Tümü / ortam), satır sil; arama;
//     Excel / CSV yükle ve yapıştır (ilk satır sütun adlarıyla eşleşirse başlık sayılır, yeni başlıklar sütun olur).
//   · Gizli sütun (parola vb.) değerleri sunucudan hiç gelmez; boş bırakılan gizli hücre kayıtlı değeri korur.
//   · Kaydet yalnız değişen satırları gönderir. Kaydedilmemiş değişiklik varken başka tabloya geçmek onay ister.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { tabloOku } from './parametre-tanimi-formu.js';

const q = encodeURIComponent;
/** Oturum boyunca seçili tablo. */
let seciliId = '';
const GORUNUR_ADIM = 200;
const kucuk = (x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** "Seçim" türü sütun: değer { deger, metin } JSON'u olarak saklanır; hücrede "34 — İSTANBUL" diye yazılır / okunur. */
const AYRAC = ' — ';
function secimGoster(v) {
  if (!v) return '';
  try {
    const o = JSON.parse(v);
    if (o && typeof o === 'object' && 'deger' in o) return o.metin ? `${o.deger ?? ''}${AYRAC}${o.metin}` : String(o.deger ?? '');
  } catch { /* düz metin */ }
  return String(v);
}
function secimYaz(metin) {
  const m = metin.trim();
  if (!m) return '';
  const i = m.indexOf(AYRAC.trim());
  return JSON.stringify(i < 0 ? { deger: m, metin: '' } : { deger: m.slice(0, i).trim(), metin: m.slice(i + 1).trim() });
}

/** Sunucudaki tablodan düzenleme kopyası. */
function kopya(t) {
  return {
    id: t ? t.id : undefined, ad: t ? t.ad : '',
    sutunlar: t ? t.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli, tip: s.tip })) : [{ ad: 'Değer', eskiAd: null, gizli: false, tip: 'metin' }],
    satirlar: t ? t.satirlar.map((r) => ({ id: r.id, ad: r.ad || '', ortamId: r.ortamId, degerler: { ...r.degerler }, doluGizli: new Set(r.doluGizli), degisti: false })) : [],
    silinen: new Set(), degisti: !t, baglam: Boolean(t && t.baglam)
  };
}

/**
 * @param {HTMLElement} govde @param {{ id: string }} proje
 */
export async function tablolarBolumu(govde, proje) {
  yerlestir(govde, iskelet('liste'));
  const [{ tablolar }, { ortamlar }] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}&baglam=1`),
    api(`/platform/ortamlar?projeId=${q(proje.id)}`)
  ]);
  let liste = tablolar;
  if (!liste.some((t) => t.id === seciliId)) seciliId = liste[0]?.id || '';
  let is = liste.length ? kopya(liste.find((t) => t.id === seciliId)) : null;
  let ara = '';
  let gorunur = GORUNUR_ADIM;

  const solKap = h('div', {});
  const sagKap = h('div', {});
  yerlestir(govde,
    h('p', { class: 'not-kutusu bilgi kucuk' }, h('b', {}, 'Her tablo bir Excel sayfası gibidir. '),
      'Sütunlar alanlardır; her satır birlikte geçerli bir değer kombinasyonudur (ör. Kanal | Kullanıcı | Parola). Ekran input\'larını ve servis parametrelerini sütunlara bağladığınızda senaryoda seçtikçe diğer listeler satırlardan süzülür; koşul tanımlamazsınız. Tek sütunlu tablo düz bir değer listesidir.'),
    h('div', { class: 'tablo-duzeni' }, solKap, sagKap));

  const degistiMi = () => Boolean(is && (is.degisti || is.silinen.size || is.satirlar.some((r) => r.degisti)));
  const gecebilirMi = async () => !degistiMi() || onayIste({
    baslik: 'Değişiklikleriniz kaydedilmeyecek', metin: 'Bu tabloda kaydedilmemiş değişiklikler var.', dugme: 'Kaydetmeden geç', tehlikeli: false, ikonAd: 'uyari'
  });

  function solCiz() {
    yerlestir(solKap, h('nav', { class: 'kart tablo-listesi', 'aria-label': 'Tablolar' },
      liste.map((t) => h('button', {
        type: 'button', 'aria-current': t.id === seciliId && is?.id ? 'true' : 'false',
        onclick: async () => { if (t.id === seciliId && is?.id) return; if (!(await gecebilirMi())) return; seciliId = t.id; is = kopya(t); ara = ''; gorunur = GORUNUR_ADIM; ciz(); }
      }, h('span', { class: 'tablo-adi' }, t.ad, t.baglam ? h('span', { class: 'rozet kucuk-rozet', title: 'Kullanıcı / acente değiştirme profilleri: senaryoda satır adıyla seçilir' }, 'bağlam') : null),
        h('small', {}, `${t.sutunlar.length} sütun · ${t.satirlar.length} satır`))),
      h('button', { type: 'button', class: 'kucuk-dugme yeni-tablo', onclick: async () => { if (!(await gecebilirMi())) return; seciliId = ''; is = kopya(null); ciz(); } },
        ikon('arti'), 'Yeni tablo')));
  }

  function ciz() {
    solCiz();
    if (!is) {
      yerlestir(sagKap, h('section', { class: 'kart' }, bosDurum('Henüz tablo yok.', 'Yeni tablo ekleyin ya da Excel / CSV dosyasından yükleyin.', {
        ikon: 'liste', eylem: h('button', { type: 'button', class: 'birincil', onclick: () => { is = kopya(null); ciz(); } }, ikon('arti'), 'Yeni tablo')
      })));
      return;
    }
    sagCiz();
  }

  // --- İçe alma (Excel / CSV / yapıştır) ---------------------------------------------------------------------------------
  /** @param {string[][]} satirlar */
  function iceAl(satirlar) {
    const dolu = satirlar.map((r) => r.map((x) => String(x ?? '').trim())).filter((r) => r.some(Boolean));
    if (!dolu.length) { bildir('İçe alınacak satır yok.', 'hata'); return; }
    const ilk = dolu[0];
    const mevcutAdlar = is.sutunlar.map((s) => kucuk(s.ad));
    const bosTablo = !is.satirlar.length && is.sutunlar.length === 1 && is.sutunlar[0].ad === 'Değer' && !is.id;
    const baslikMi = bosTablo || ilk.some((x) => mevcutAdlar.includes(kucuk(x)));
    /** @type {number[]} dosya sütunu → tablo sütunu */
    let eslem;
    let veri = dolu;
    if (baslikMi) {
      veri = dolu.slice(1);
      if (bosTablo) is.sutunlar = [];
      eslem = ilk.map((b, i) => {
        const ad = b || `Sütun ${i + 1}`;
        let k = is.sutunlar.findIndex((s) => kucuk(s.ad) === kucuk(ad));
        if (k < 0) { is.sutunlar.push({ ad, eskiAd: null, gizli: false }); k = is.sutunlar.length - 1; is.degisti = true; }
        return k;
      });
    } else {
      eslem = ilk.map((_, i) => i);
      while (is.sutunlar.length < ilk.length) { is.sutunlar.push({ ad: `Sütun ${is.sutunlar.length + 1}`, eskiAd: null, gizli: false }); is.degisti = true; }
    }
    for (const r of veri) {
      /** @type {Record<string, string>} */
      const degerler = {};
      eslem.forEach((k, i) => { if (k >= 0 && is.sutunlar[k]) degerler[is.sutunlar[k].ad] = r[i] ?? ''; });
      is.satirlar.push({ id: undefined, ad: '', ortamId: null, degerler, doluGizli: new Set(), degisti: true });
    }
    bildir(`${veri.length} satır eklendi${baslikMi ? ' (ilk satır sütun adı sayıldı)' : ''}. Kaydetmeyi unutmayın.`);
    ciz();
  }

  // --- Kaydet ---------------------------------------------------------------------------------------------------------------
  async function kaydet(dugme) {
    const adlar = is.sutunlar.map((s) => s.ad.trim());
    if (!is.ad.trim()) { bildir('Tablo adı boş olamaz.', 'hata'); return; }
    if (adlar.some((a) => !a)) { bildir('Sütun adı boş olamaz.', 'hata'); return; }
    const gizliler = new Set(is.sutunlar.filter((s) => s.gizli).map((s) => s.ad));
    const govde = {
      projeId: proje.id, id: is.id, ad: is.ad.trim(),
      sutunlar: is.sutunlar.map((s) => ({ ad: s.ad.trim(), eskiAd: s.eskiAd, gizli: s.gizli })),
      satirlar: is.satirlar.filter((r) => r.degisti).map((r) => ({
        id: r.id, ad: r.ad.trim(), ortamId: r.ortamId,
        degerler: Object.fromEntries(is.sutunlar.map((s) => {
          const v = r.degerler[s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad];
          return [s.ad.trim(), gizliler.has(s.ad) && (v === null || v === undefined || v === '') ? null : (v ?? '')];
        }))
      })),
      silinenSatirlar: [...is.silinen]
    };
    try {
      const { tablo } = await mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/tablo/kaydet', { govde }));
      const i = liste.findIndex((t) => t.id === tablo.id);
      liste = i >= 0 ? liste.map((t) => (t.id === tablo.id ? tablo : t)) : [...liste, tablo].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      seciliId = tablo.id;
      is = kopya(tablo);
      bildir(`"${tablo.ad}" kaydedildi.`);
      ciz();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  async function tabloyuSil() {
    const t = liste.find((x) => x.id === is.id);
    if (!t) { is = liste.length ? kopya(liste[0]) : null; seciliId = liste[0]?.id || ''; ciz(); return; }
    const tamam = await onayIste({ baslik: `"${t.ad}" silinsin mi?`, metin: `${t.satirlar.length} satırıyla birlikte silinir. Bu tabloya bağlı alanlar bağlantısız kalır.`, dugme: 'Sil', tehlikeli: true });
    if (!tamam) return;
    try {
      await api('/platform/tablo/sil', { govde: { projeId: proje.id, id: t.id } });
      liste = liste.filter((x) => x.id !== t.id);
      seciliId = liste[0]?.id || '';
      is = liste.length ? kopya(liste[0]) : null;
      bildir(`"${t.ad}" silindi.`);
      ciz();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  // --- Izgara ---------------------------------------------------------------------------------------------------------------
  function sagCiz() {
    const adG = h('input', { type: 'text', value: is.ad, maxlength: '60', placeholder: 'ör. Servis girişi', 'aria-label': 'Tablo adı', class: 'tablo-adi-girdisi' });
    adG.addEventListener('input', () => { is.ad = adG.value; is.degisti = true; durumCiz(); });
    const aramaG = h('input', { type: 'search', placeholder: 'Satırlarda ara…', value: ara, 'aria-label': 'Satırlarda ara' });
    let zaman = null;
    aramaG.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(() => { ara = aramaG.value; gorunur = GORUNUR_ADIM; govdeCiz(); }, 150); });
    const dosya = h('input', { type: 'file', accept: '.xlsx,.csv,.txt', class: 'gorunmez', 'aria-label': 'Excel ya da CSV dosyası' });
    dosya.addEventListener('change', async () => {
      const f = dosya.files && dosya.files[0];
      dosya.value = '';
      if (!f) return;
      try { iceAl(await tabloOku(f)); } catch (e) { bildir(e.message, 'hata'); }
    });
    const yapistirG = h('textarea', { rows: '4', placeholder: 'Excel\'den satırları kopyalayıp buraya yapıştırın. İlk satır sütun adlarıysa başlık sayılır.', 'aria-label': 'Yapıştırılacak satırlar' });
    const yapistirKutusu = h('details', { class: 'yapistir-kutusu' }, h('summary', {}, 'Excel\'den yapıştır'), yapistirG,
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
        iceAl(yapistirG.value.split(/\r?\n/).map((s) => s.split('\t')));
      } }, ikon('arti'), 'Yapıştırılanları ekle')));
    const durum = h('span', { class: 'kucuk', 'aria-live': 'polite' });
    const kaydetD = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
    kaydetD.addEventListener('click', () => kaydet(kaydetD));
    const geriAl = h('button', { type: 'button', class: 'hayalet' }, 'Değişiklikleri geri al');
    geriAl.addEventListener('click', () => { const t = liste.find((x) => x.id === is.id); is = t ? kopya(t) : (liste.length ? kopya(liste[0]) : null); ciz(); });
    function durumCiz() {
      const d = degistiMi();
      yerlestir(durum, d ? h('span', { class: 'rozet uyari' }, 'kaydedilmemiş değişiklik') : is.id ? h('span', { class: 'soluk' }, 'kayıtlı') : null);
      geriAl.hidden = !d;
    }

    const tablo = h('table', { class: 'veri-tablosu' });
    const altBilgi = h('div', { class: 'kucuk soluk tablo-alt-bilgi' });
    function basCiz() {
      return h('thead', {}, h('tr', {},
        h('th', { class: 'sira', scope: 'col' }, '#'),
        h('th', { scope: 'col', class: 'satir-adi-sutunu', title: is.baglam ? 'Senaryoda bu adla seçilir (zorunlu)' : 'Senaryoda satırı adıyla seçmek için (ör. tc1); boşsa değerlerden üretilir' }, is.baglam ? 'Satır adı *' : 'Satır adı'),
        is.sutunlar.map((s, i) => {
          const g = h('input', { type: 'text', value: s.ad, maxlength: '60', 'aria-label': `${i + 1}. sütunun adı` });
          g.addEventListener('input', () => { s.ad = g.value; is.degisti = true; durumCiz(); });
          const gizli = h('input', { type: 'checkbox', checked: s.gizli, 'aria-label': `${i + 1}. sütun gizli` });
          gizli.addEventListener('change', () => { s.gizli = gizli.checked; is.degisti = true; ciz(); });
          return h('th', { scope: 'col' }, h('div', { class: 'sutun-basligi' }, g,
            is.baglam ? null : h('label', { class: 'gizli-secimi', title: 'Gizli: değer ekranda hiç gösterilmez (parola vb.); koşuda satırdan gelir.' }, gizli, ikon('kilit')),
            is.sutunlar.length > 1 ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. sütunu sil`, title: 'Sütunu sil', onclick: () => {
              is.sutunlar.splice(i, 1); is.degisti = true; ciz();
            } }, ikon('carpi')) : null));
        }),
        h('th', { scope: 'col', class: 'ortam-sutunu', title: 'Satırın geçerli olduğu ortam (Tümü: her ortamda)' }, 'Ortam'),
        h('th', { scope: 'col', class: 'eylem' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          is.sutunlar.push({ ad: `Sütun ${is.sutunlar.length + 1}`, eskiAd: null, gizli: false }); is.degisti = true; ciz();
        } }, ikon('arti'), 'Sütun'))));
    }
    function satirCiz(r, no) {
      const hucreler = is.sutunlar.map((s) => {
        const anahtar = s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad;
        const secim = s.tip === 'secim';
        const g = h('input', {
          type: s.gizli ? 'password' : 'text', value: secim ? secimGoster(r.degerler[anahtar]) : r.degerler[anahtar] ?? '', autocomplete: s.gizli ? 'new-password' : 'off',
          title: secim ? 'Değer — metin (ör. 34 — İSTANBUL)' : null,
          placeholder: s.gizli && r.doluGizli.has(s.eskiAd || s.ad) ? '•••• kayıtlı' : '', 'aria-label': `${no}. satır ${s.ad}`
        });
        g.addEventListener('input', () => { r.degerler[s.ad] = secim ? secimYaz(g.value) : g.value; if (anahtar !== s.ad) delete r.degerler[anahtar]; r.degisti = true; durumCiz(); });
        return h('td', {}, g);
      });
      const ortam = h('select', { 'aria-label': `${no}. satır ortamı` }, h('option', { value: '' }, 'Tümü'),
        ortamlar.map((o) => h('option', { value: o.id, selected: r.ortamId === o.id }, o.ad)));
      ortam.addEventListener('change', () => { r.ortamId = ortam.value || null; r.degisti = true; durumCiz(); });
      const adG = h('input', { type: 'text', value: r.ad, maxlength: '120', 'aria-label': `${no}. satır adı`, placeholder: is.baglam ? 'zorunlu' : '' });
      adG.addEventListener('input', () => { r.ad = adG.value; r.degisti = true; durumCiz(); });
      return h('tr', { class: r.degisti ? 'degisti' : null }, h('td', { class: 'sira' }, String(no)), h('td', { class: 'satir-adi-sutunu' }, adG), hucreler, h('td', { class: 'ortam-sutunu' }, ortam),
        h('td', { class: 'eylem' }, h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}. satırı sil`, title: 'Satırı sil', onclick: () => {
          const i = is.satirlar.indexOf(r);
          if (i >= 0) is.satirlar.splice(i, 1);
          if (r.id) is.silinen.add(r.id);
          govdeCiz(); durumCiz();
        } }, ikon('carpi'))));
    }
    function govdeCiz() {
      const a = kucuk(ara);
      const eslesen = is.satirlar.map((r, i) => ({ r, no: i + 1 })).filter(({ r }) => !a || is.sutunlar.some((s) => !s.gizli && kucuk(secimGoster(r.degerler[s.ad] ?? r.degerler[s.eskiAd])).includes(a)) || kucuk(r.ad).includes(a));
      const gosterilen = eslesen.slice(0, gorunur);
      yerlestir(tablo, basCiz(), h('tbody', {},
        gosterilen.length ? gosterilen.map(({ r, no }) => satirCiz(r, no))
          : h('tr', {}, h('td', { colspan: String(is.sutunlar.length + 4), class: 'cok-soluk' }, is.satirlar.length ? 'Aramayla eşleşen satır yok.' : 'Satır yok. "+ Satır" ya da Excel / CSV ile ekleyin.'))));
      yerlestir(altBilgi, `${is.satirlar.length} satır${a ? ` · ${eslesen.length} eşleşiyor` : ''}`,
        eslesen.length > gosterilen.length ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { gorunur += GORUNUR_ADIM * 5; govdeCiz(); } },
          `${eslesen.length - gosterilen.length} satır daha göster`) : null);
    }

    yerlestir(sagKap, h('section', { class: 'kart tablo-duzenleyici', 'aria-label': 'Tablo düzenleyici' },
      h('div', { class: 'kart-basligi' }, adG, durum,
        h('span', { class: 'sag' },
          is.id ? h('button', { type: 'button', class: 'kucuk-dugme tehlike', onclick: () => tabloyuSil() }, ikon('cop'), 'Tabloyu sil') : null)),
      h('div', { class: 'tablo-arac-cubugu' },
        h('div', { class: 'arama-kutusu' }, ikon('ara'), aramaG),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          is.satirlar.push({ id: undefined, ad: '', ortamId: null, degerler: {}, doluGizli: new Set(), degisti: true });
          ara = ''; aramaG.value = ''; gorunur = Math.max(gorunur, is.satirlar.length); govdeCiz(); durumCiz();
          tablo.querySelector('tbody tr:last-child input')?.focus();
        } }, ikon('arti'), 'Satır'),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => dosya.click() }, ikon('yukle'), 'Excel / CSV yükle'), dosya,
        is.satirlar.length ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: async () => {
          if (!(await onayIste({ baslik: 'Tüm satırlar silinsin mi?', metin: `${is.satirlar.length} satır kaldırılır (Kaydet'e basınca kalıcı olur).`, dugme: 'Satırları kaldır', tehlikeli: true }))) return;
          for (const r of is.satirlar) if (r.id) is.silinen.add(r.id);
          is.satirlar = []; ciz();
        } }, 'Tüm satırları kaldır') : null),
      yapistirKutusu,
      h('div', { class: 'tablo-kaydirma veri-tablosu-kap' }, tablo), altBilgi,
      h('div', { class: 'dugmeler' }, geriAl, kaydetD)));
    govdeCiz();
    durumCiz();
  }

  ciz();
}
