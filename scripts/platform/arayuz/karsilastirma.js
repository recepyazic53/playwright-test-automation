// YAN YANA KOŞU KARŞILAŞTIRMASI (Sonuçlar ve Servis sonuçları ekranları): iki koşunun özeti (A | B, fark ↑↓), senaryo tablosu
// (A durumu | B durumu | değişim rozeti, süre farkı; "yalnız değişenler" süzgeci varsayılan AÇIK; sıralama tablo-siralama.js
// ile veri üzerinde) ve açılan satırda adım adım fark (ekran: hata / Beklenen–Görülen farkı, iki tarafın ekran görüntüsü, koşuda
// yakalanan mesajlar farkı; servis: istekler, HTTP kodu, kontrol sonuçları farkı — gövdeler gösterilmez).
// Adresler (paylaşılabilir): #/sonuclar/karsilastir/<A>/<B> ve #/sonuclar/servisler/karsilastir/<A>/<B>. A = önceki koşu (tarihçe
// sırasıyla seçilir), B = sonraki; "Yer değiştir" ile çevrilir. Seçim: koşu geçmişinde iki onay kutusu + "Karşılaştır" ya da koşu
// ayrıntısında "Başka bir koşuyla karşılaştır…" (karsilastirmaSecimi; aynı proje, isteğe bağlı aynı ortam / kapsam).
// Veri: /platform/sonuclar/karsilastir* (sonuclar/karsilastirma.mjs; metinler sunucuda maskeli). Ekran görüntüleri şifreli medya
// ucundan (/platform/medya/<id>, kasa açıkken). Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { TOKEN, api, bosDurum, h, ikon, iskelet, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { veriyiSirala } from './tablo-siralama.js';
import { htmlRaporDugmesi } from './html-rapor.js';

const q = encodeURIComponent;
const DEGISIM = {
  'yeni-kalan': ['yeni başarısız', 'hata'], 'yalniz-b': ["yalnız B'de", 'vurgu'], degisti: ['durum değişti', 'atlanan'], duzelen: ['düzelen', 'basari'],
  'yalniz-a': ["yalnız A'da", ''], 'hep-kalan': ['hep başarısız', 'hata soluk-rozet'], ayni: ['aynı', ''], 'hep-gecen': ['hep geçen', 'basari soluk-rozet']
};
const DEGISIM_SIRASI = Object.keys(DEGISIM);
const DEGISMEYEN = new Set(['hep-gecen', 'hep-kalan', 'ayni']);
const DURUM = {
  basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlanan: ['Atlanan', 'atlanan'], durduruldu: ['Durduruldu', 'durdu']
};
const DURUM_SIRASI = { basarisiz: 0, hata: 0, durduruldu: 1, atlanan: 2, basarili: 3 };
const KAYNAK = { diyalog: 'Diyalog', 'hata-gostergesi': 'Hata göstergesi', konsol: 'Konsol', 'sayfa-hatasi': 'Sayfa hatası', ag: 'Ağ' };

const iki = (n) => String(n).padStart(2, '0');
/** "24.09.2026 17:12" */
const kisaTarih = (d) => {
  const t = new Date(String(d ?? ''));
  return d == null || Number.isNaN(t.getTime()) ? '—' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
};
const sureMetni = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} sn` : `${Math.floor(ms / 60000)} dk ${Math.round((ms % 60000) / 1000)} sn`);
const medyaUrl = (id) => `/platform/medya/${q(id)}?token=${q(TOKEN)}`;
const durumRozeti = (d) => (d ? rozet((DURUM[d] || [d])[0], (DURUM[d] || [])[1] || '') : h('span', { class: 'cok-soluk' }, '—', h('span', { class: 'gorunmez' }, ' bu koşuda yok')));
const degisimRozeti = (d) => rozet((DEGISIM[d] || [d])[0], `degisim-rozeti ${(DEGISIM[d] || [])[1] || ''}`.trim());
const hataKutusu = (e) => h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e));
const ayrac = () => h('span', { 'aria-hidden': 'true' }, '/');

/** Fark hapı (↑ / ↓). artisIyi: artış iyi mi; bicim: mutlak değerin metni. */
function farkHapi(fark, artisIyi, bicim = (n) => String(n)) {
  if (fark === null || fark === undefined) return h('span', { class: 'fark notr' }, '—');
  if (fark === 0) return h('span', { class: 'fark notr' }, '= 0', h('span', { class: 'gorunmez' }, ' değişim yok'));
  const iyi = artisIyi ? fark > 0 : fark < 0;
  return h('span', { class: `fark ${iyi ? 'iyi' : 'kotu'}` }, `${fark > 0 ? '↑' : '↓'} ${bicim(Math.abs(fark))}`, h('span', { class: 'gorunmez' }, fark > 0 ? ' arttı' : ' azaldı'));
}

/** @param {'ekran' | 'servis'} tur @param {string} a @param {string} b */
export const karsilastirmaAdresi = (tur, a, b) => `${tur === 'servis' ? '#/sonuclar/servisler' : '#/sonuclar'}/karsilastir/${q(a)}/${q(b)}`;

/**
 * Seçilen iki koşuyu tarihçe sırasına koyup (A = önceki) karşılaştırmayı açar.
 * @param {'ekran' | 'servis'} tur @param {Array<{ id: string; z: string | null }>} ikili
 */
export function karsilastirmayiAc(tur, ikili) {
  const [x, y] = ikili;
  const zaman = (k) => { const t = Date.parse(String(k.z ?? '')); return Number.isNaN(t) ? 0 : t; };
  const [a, b] = zaman(x) <= zaman(y) ? [x, y] : [y, x];
  location.hash = karsilastirmaAdresi(tur, a.id, b.id);
}

// ---------------------------------------------------------------------------------------
// Koşu geçmişi seçimi (iki onay kutusu + "Karşılaştır")
// ---------------------------------------------------------------------------------------

/**
 * Koşu geçmişi tablosuna seçim sütunu için yardımcı: kutular ve düğme durumu ortak tutulur (sayfa değişse de seçim kalır).
 * @param {'ekran' | 'servis'} tur
 */
export function kosuSecici(tur) {
  /** @type {Map<string, { z: string | null; grup: string }>} */
  const secili = new Map();
  /** @type {Set<HTMLInputElement>} */
  let kutular = new Set();
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme karsilastir-dugmesi', disabled: true, title: 'Karşılaştırmak için iki koşu seçin' },
    ikon('grafik'), 'Karşılaştır', h('span', { class: 'secim-sayisi mono' }, '0/2'));
  // Yalnız aynı gruptaki koşular birlikte seçilebilir (servis ↔ servis, akış ↔ akış).
  const guncelle = () => {
    dugme.disabled = secili.size !== 2;
    dugme.querySelector('.secim-sayisi').textContent = `${secili.size}/2`;
    const ilkGrup = secili.size ? [...secili.values()][0].grup : null;
    for (const k of kutular) if (k.isConnected) k.disabled = !k.checked && (secili.size >= 2 || (ilkGrup !== null && k.dataset.grup !== ilkGrup));
  };
  dugme.addEventListener('click', () => {
    if (secili.size !== 2) return;
    karsilastirmayiAc(tur, [...secili].map(([id, d]) => ({ id, z: d.z })));
  });
  return {
    dugme,
    /** Yeni sayfa çizilmeden önce çağrılır. */
    sifirla() { kutular = new Set(); },
    baslik: () => h('th', { scope: 'col', class: 'secim karsilastir-secim' }, h('span', { class: 'gorunmez' }, 'Karşılaştırma için seç')),
    /** @param {{ id: string }} k @param {string | null} z @param {string} etiket @param {string} [grup] */
    hucre(k, z, etiket, grup = '') {
      const kutu = h('input', { type: 'checkbox', checked: secili.has(k.id), 'data-grup': grup, 'aria-label': `Karşılaştırmak için seç: ${etiket}` });
      kutu.addEventListener('change', () => {
        if (kutu.checked) secili.set(k.id, { z, grup }); else secili.delete(k.id);
        guncelle();
      });
      kutular.add(kutu);
      queueMicrotask(guncelle);
      return h('td', { class: 'secim karsilastir-secim', 'data-kayit-disi': true }, kutu);
    }
  };
}

// ---------------------------------------------------------------------------------------
// "Başka bir koşuyla karşılaştır…" seçim diyaloğu
// ---------------------------------------------------------------------------------------

/**
 * @param {{ tur: 'ekran' | 'servis'; projeId: string; kosuId: string }} s
 * @returns {HTMLButtonElement}
 */
export function karsilastirDugmesi(s) {
  return h('button', { type: 'button', class: 'dugme hayalet', onclick: () => karsilastirmaSecimi(s) }, ikon('grafik'), 'Başka bir koşuyla karşılaştır…');
}

const kosuEtiketi = (k) => [kisaTarih(k.baslangic), k.kapsam, k.ortam].filter(Boolean).join(' · ');

/** @param {{ tur: 'ekran' | 'servis'; projeId: string; kosuId: string }} s */
export async function karsilastirmaSecimi(s) {
  const liste = h('div', { class: 'karsilastir-adaylari', role: 'radiogroup', 'aria-label': 'Karşılaştırılacak koşu' }, iskelet('liste'));
  const ayniOrtam = h('input', { type: 'checkbox', id: yeniKimlik('kars-ortam') });
  const ayniKapsam = h('input', { type: 'checkbox', id: yeniKimlik('kars-kapsam') });
  const bilgi = h('p', { class: 'soluk kucuk', role: 'status', 'aria-live': 'polite' });
  const tamam = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('grafik'), 'Karşılaştır');
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const baslikId = yeniKimlik('kars-baslik');
  const referansMetni = h('p', { class: 'soluk' }, 'Seçilen koşu yükleniyor…');
  const diyalog = h('dialog', { class: 'onay-diyalogu karsilastir-diyalogu', 'aria-labelledby': baslikId },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' }, h('h2', { id: baslikId }, 'Başka bir koşuyla karşılaştır'), kapat),
      referansMetni,
      h('div', { class: 'karsilastir-suzgecleri' },
        h('label', { class: 'onay-satiri', for: ayniOrtam.id }, ayniOrtam, 'Yalnız aynı ortam'),
        h('label', { class: 'onay-satiri', for: ayniKapsam.id }, ayniKapsam, s.tur === 'servis' ? 'Yalnız aynı servis / akış' : 'Yalnız aynı kapsam')),
      bilgi, liste),
    h('div', { class: 'diyalog-alt' }, h('button', { type: 'button', onclick: () => diyalog.close() }, 'Vazgeç'), tamam));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  /** @type {any} */
  let veri;
  try {
    veri = await api(`/platform/sonuclar/karsilastir/adaylar?${new URLSearchParams({ projeId: s.projeId, tur: s.tur, kosu: s.kosuId })}`);
  } catch (e) {
    if (e && e.durum === 423) { diyalog.close(); return; }
    yerlestir(liste, hataKutusu(e));
    return;
  }
  const ref = veri.referans;
  yerlestir(referansMetni, 'Seçilen koşu: ', h('b', {}, kosuEtiketi(ref)), '. Önceki koşu A, sonraki B olur.');
  ayniOrtam.checked = Boolean(ref.ortamId);
  ayniOrtam.disabled = !ref.ortamId;
  ayniKapsam.checked = true;
  let secilen = null;
  const grupAdi = yeniKimlik('kars-aday');
  const ciz = () => {
    const uyan = veri.kosular.filter((k) => (!ayniOrtam.checked || k.ortamId === ref.ortamId) && (!ayniKapsam.checked || k.kapsamAnahtari === ref.kapsamAnahtari));
    const gosterilen = uyan.slice(0, 60);
    if (secilen && !gosterilen.some((k) => k.id === secilen.id)) secilen = null;
    tamam.disabled = !secilen;
    bilgi.textContent = uyan.length ? `${uyan.length} koşu${uyan.length > gosterilen.length ? ` (en yeni ${gosterilen.length} gösteriliyor)` : ''}` : '';
    if (!gosterilen.length) {
      yerlestir(liste, h('p', { class: 'bos-liste' }, veri.kosular.length ? 'Süzgeçlere uyan başka koşu yok; süzgeçleri kaldırın.' : 'Karşılaştırılacak başka koşu yok.'));
      return;
    }
    yerlestir(liste, ...gosterilen.map((k) => {
      const id = yeniKimlik('kars-sec');
      const girdi = h('input', { type: 'radio', name: grupAdi, id, value: k.id, checked: secilen?.id === k.id });
      girdi.addEventListener('change', () => { secilen = k; tamam.disabled = false; });
      const o = k.oran === null ? '—' : `%${k.oran}`;
      return h('label', { class: 'karsilastir-adayi', for: id }, girdi,
        h('span', { class: 'aday-metni' },
          h('b', { class: 'mono' }, kisaTarih(k.baslangic)),
          h('small', { class: 'soluk' }, [k.kapsam, k.ortam].filter(Boolean).join(' · '))),
        h('span', { class: 'aday-sayilari mono' }, `${k.sayilar.basarili} ✓ · ${k.sayilar.kalan} ✗ · ${o}`));
    }));
  };
  ayniOrtam.addEventListener('change', ciz);
  ayniKapsam.addEventListener('change', ciz);
  tamam.addEventListener('click', () => {
    if (!secilen) return;
    diyalog.close();
    karsilastirmayiAc(s.tur, [{ id: ref.id, z: ref.baslangic }, { id: secilen.id, z: secilen.baslangic }]);
  });
  ciz();
}

// ---------------------------------------------------------------------------------------
// Karşılaştırma ekranı
// ---------------------------------------------------------------------------------------

/** Kullanıcının süzgeç seçimi (sayfa içinde korunur). */
let yalnizDegisenler = true;

/**
 * @param {HTMLElement} icerik
 * @param {{ id: string; ad: string }} proje
 * @param {{ tur: 'ekran' | 'servis'; a: string; b: string; ust?: HTMLElement | null }} s
 */
export async function karsilastirmaEkrani(icerik, proje, s) {
  yerlestir(icerik, iskelet('kartlar'), iskelet('sayfa'));
  const servis = s.tur === 'servis';
  const taban = servis ? '#/sonuclar/servisler' : '#/sonuclar';
  const kosuAdresi = (id) => `${taban}/kosu/${q(id)}`;
  const v = await api(`/platform/sonuclar/karsilastir?${new URLSearchParams({ projeId: proje.id, tur: s.tur, a: s.a, b: s.b })}`);
  const tabloAlani = h('div', {});
  const baslik = h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), ayrac(), h('a', { href: taban }, servis ? 'Servis sonuçları' : 'Sonuçlar'), ayrac(),
        h('span', { class: 'simdiki' }, 'Karşılaştırma')),
      h('div', { class: 'baslik-satiri' },
        h('h2', { tabindex: '-1' }, 'Koşu karşılaştırması'),
        v.degisen ? rozet([ikon('uyari'), `${v.degisen} değişen senaryo`], v.sayim['yeni-kalan'] ? 'hata' : 'vurgu') : rozet([ikon('onay'), 'değişen senaryo yok'], 'basari')),
      h('div', { class: 'meta' },
        h('span', {}, rozet('A', 'kars-a'), ' ', h('a', { href: kosuAdresi(v.a.id), class: 'mono' }, kisaTarih(v.a.baslangic))),
        h('span', { 'aria-hidden': 'true' }, '↔'),
        h('span', {}, rozet('B', 'kars-b'), ' ', h('a', { href: kosuAdresi(v.b.id), class: 'mono' }, kisaTarih(v.b.baslangic))),
        servis ? h('span', {}, rozet(v.a.kosuTuru === 'akis' ? 'akış koşuları' : 'servis koşuları', 'vurgu')) : null)),
    h('div', { class: 'eylemler' },
      h('a', { class: 'dugme hayalet', href: karsilastirmaAdresi(s.tur, v.b.id, v.a.id), title: 'A ile B yer değiştirir' }, ikon('yenile'), 'Yer değiştir'),
      htmlRaporDugmesi({ tur: s.tur, projeId: proje.id, id: v.a.id, b: v.b.id }),
      h('a', { class: 'dugme hayalet', href: taban }, ikon('geri'), servis ? 'Servis sonuçları' : 'Sonuçlar')));
  yerlestir(icerik, baslik, s.ust || null, ozetKartlari(v, servis), senaryoBolumu(v, proje, s, tabloAlani));
}

/** A | B özet kartları (dar ekranda alt alta). */
function ozetKartlari(v, servis) {
  const taraf = (ad, k, fark) => {
    const satir = (etiket, deger, farkOgesi = null) => [h('dt', {}, etiket), h('dd', {}, h('span', { class: 'kars-deger' }, deger), farkOgesi ? [' ', farkOgesi] : null)];
    return h('section', { class: `kart kars-ozet-karti kars-${ad.toLowerCase()}`, 'aria-label': `Koşu ${ad} özeti` },
      h('div', { class: 'kart-basligi' }, h('h3', {}, rozet(ad, `kars-${ad.toLowerCase()}`), ' ', h('span', { class: 'mono' }, kisaTarih(k.baslangic))),
        fark ? h('span', { class: 'alt' }, "fark: B − A") : h('span', { class: 'alt' }, 'referans')),
      h('dl', { class: 'kars-ozet' },
        satir('Tarih', kisaTarih(k.baslangic)),
        satir('Ortam', k.ortam || '—'),
        satir(servis ? 'Servis / akış' : 'Kapsam', k.kapsam || '—'),
        satir('Süre', sureMetni(k.sureMs), fark ? farkHapi(fark.sureMs, false, sureMetni) : null),
        satir('Başarılı', String(k.sayilar.basarili), fark ? farkHapi(fark.basarili, true) : null),
        satir('Başarısız', String(k.sayilar.kalan), fark ? farkHapi(fark.kalan, false) : null),
        satir('Atlanan', String(k.sayilar.atlanan), fark ? farkHapi(fark.atlanan, false) : null),
        k.sayilar.durduruldu || (fark && fark.durduruldu) ? satir('Durduruldu', String(k.sayilar.durduruldu), fark ? farkHapi(fark.durduruldu, false) : null) : null,
        satir('Başarı oranı', k.oran === null ? '—' : `%${k.oran}`, fark ? farkHapi(fark.oran, true, (n) => `${n} puan`) : null)));
  };
  return h('div', { class: 'kars-ozet-izgarasi' }, taraf('A', v.a, null), taraf('B', v.b, v.fark));
}

/** Senaryo tablosu: süzgeç, değişim çipleri, veri üzerinde sıralama, açılır adım farkı. */
function senaryoBolumu(v, proje, s, alan) {
  const servis = s.tur === 'servis';
  const tekSatir = v.senaryolar.length === 1;
  let sinifSuzgeci = null;
  let siralama = { anahtar: null, yon: null };
  const durumDegeri = (t) => (t ? DURUM_SIRASI[t.durum] ?? 5 : 9);
  const ALANLAR = {
    senaryo: (x) => `${x.grup} ${x.baslik}`, a: (x) => durumDegeri(x.a), b: (x) => durumDegeri(x.b),
    degisim: (x) => DEGISIM_SIRASI.indexOf(x.degisim), sureA: (x) => x.a?.sureMs ?? -1, sureB: (x) => x.b?.sureMs ?? -1, fark: (x) => x.sureFarkiMs ?? 0
  };
  const suzgecKutusu = h('input', { type: 'checkbox', id: yeniKimlik('kars-degisen'), checked: yalnizDegisenler });
  const cipAlani = h('div', { class: 'kars-cipleri', role: 'group', 'aria-label': 'Değişim süzgeci' });
  const govde = h('tbody', {});
  const bilgi = h('p', { class: 'soluk kucuk', role: 'status', 'aria-live': 'polite' });
  const basliklar = [
    h('th', { scope: 'col', class: 'secim' }, h('span', { class: 'gorunmez' }, 'Ayrıntı')),
    h('th', { scope: 'col', 'data-sirala-anahtar': 'senaryo', 'aria-sort': 'none' }, 'Senaryo'),
    h('th', { scope: 'col', 'data-sirala-anahtar': 'a', 'aria-sort': 'none' }, 'A'),
    h('th', { scope: 'col', 'data-sirala-anahtar': 'b', 'aria-sort': 'none' }, 'B'),
    h('th', { scope: 'col', 'data-sirala-anahtar': 'degisim', 'aria-sort': 'none' }, 'Değişim'),
    h('th', { scope: 'col', class: 'sayi', 'data-sirala-anahtar': 'sureA', 'aria-sort': 'none' }, 'Süre A'),
    h('th', { scope: 'col', class: 'sayi', 'data-sirala-anahtar': 'sureB', 'aria-sort': 'none' }, 'Süre B'),
    h('th', { scope: 'col', class: 'sayi', 'data-sirala-anahtar': 'fark', 'aria-sort': 'none' }, 'Süre farkı')
  ];
  const tablo = h('table', { class: 'ozet-tablosu kars-tablosu', 'data-siralama': 'veri' },
    h('caption', { class: 'gorunmez' }, 'Senaryo karşılaştırması'), h('thead', {}, h('tr', {}, basliklar)), govde);
  const cipleriCiz = () => {
    yerlestir(cipAlani, ...DEGISIM_SIRASI.filter((d) => v.sayim[d]).map((d) => h('button', {
      type: 'button', class: `kars-cipi ${(DEGISIM[d] || [])[1] || ''}`.trim(), 'aria-pressed': sinifSuzgeci === d ? 'true' : 'false',
      onclick: () => { sinifSuzgeci = sinifSuzgeci === d ? null : d; cipleriCiz(); ciz(); }
    }, DEGISIM[d][0], h('b', { class: 'mono' }, String(v.sayim[d])))));
  };
  const ciz = () => {
    const suzulen = v.senaryolar.filter((x) => (sinifSuzgeci ? x.degisim === sinifSuzgeci : !suzgecKutusu.checked || x.degisti));
    const sirali = siralama.anahtar ? veriyiSirala(suzulen, ALANLAR[siralama.anahtar], siralama.yon) : suzulen;
    for (const th of basliklar) {
      const a = th.getAttribute('data-sirala-anahtar');
      if (a) th.setAttribute('aria-sort', a === siralama.anahtar && siralama.yon ? (siralama.yon === 'artan' ? 'ascending' : 'descending') : 'none');
    }
    bilgi.textContent = `${sirali.length} / ${v.senaryolar.length} senaryo gösteriliyor${sinifSuzgeci ? ` (${DEGISIM[sinifSuzgeci][0]})` : suzgecKutusu.checked ? ' (yalnız değişenler)' : ''}`;
    if (!sirali.length) {
      govde.replaceChildren(h('tr', {}, h('td', { colspan: '8' }, h('p', { class: 'bos-liste' },
        v.senaryolar.length ? 'Değişen senaryo yok. Tümünü görmek için "Yalnız değişenler" kutusunu kaldırın.' : 'Karşılaştırılacak senaryo yok.'))));
      return;
    }
    govde.replaceChildren(...sirali.flatMap((x) => senaryoSatiri(x, proje, s, tekSatir)));
  };
  suzgecKutusu.addEventListener('change', () => { yalnizDegisenler = suzgecKutusu.checked; sinifSuzgeci = null; cipleriCiz(); ciz(); });
  tablo.addEventListener('tablo-sirala', (o) => {
    const { anahtar, yon } = /** @type {CustomEvent} */ (o).detail || {};
    siralama = yon && ALANLAR[anahtar] ? { anahtar, yon } : { anahtar: null, yon: null };
    ciz();
  });
  // Tek satırlı karşılaştırma (ör. aynı akış senaryosunun iki koşusu) süzgeçsiz ve açık gelir.
  if (tekSatir) suzgecKutusu.checked = false;
  cipleriCiz();
  ciz();
  yerlestir(alan, h('div', { class: 'tablo-kaydirma kars-kaydirma' }, tablo));
  // Süzgeç kutusu veri değildir (çıkış koruması saymaz).
  return h('section', { class: 'kart', 'aria-labelledby': 'kars-senaryo-basligi', 'data-kayit-disi': true },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'kars-senaryo-basligi' }, ikon('liste'), servis ? (v.a.kosuTuru === 'akis' ? 'Akış senaryoları' : 'Servis senaryoları') : 'Senaryolar'),
      h('span', { class: 'alt' }, 'Satırı açınca adım adım yan yana fark'),
      h('div', { class: 'sag' }, h('label', { class: 'secenek mini-secenek', for: suzgecKutusu.id }, suzgecKutusu, 'Yalnız değişenler'))),
    cipAlani, bilgi, alan,
    servis ? h('p', { class: 'soluk kucuk', role: 'note' }, ikon('kalkan'), ' İstek / yanıt gövdeleri karşılaştırmada gösterilmez; hata ve kontrol mesajları maskelidir.') : null);
}

/** Senaryo satırı + (açılınca) ayrıntı satırı. */
function senaryoSatiri(x, proje, s, acik) {
  const detayId = yeniKimlik('kars-detay');
  const detay = h('td', { colspan: '8', class: 'kars-detay-hucresi' });
  const detaySatiri = h('tr', { class: 'kars-detay-satiri', id: detayId, hidden: !acik }, detay);
  const ac = h('button', { type: 'button', class: 'ikon-dugme hayalet kars-ac', 'aria-expanded': acik ? 'true' : 'false', 'aria-controls': detayId, 'aria-label': `${acik ? 'Adım farkını kapat' : 'Adım farkını aç'}: ${x.baslik}` }, ikon('asagi'));
  let yuklendi = false;
  const yukle = () => {
    if (yuklendi) return;
    yuklendi = true;
    senaryoFarki(detay, x, proje, s);
  };
  ac.addEventListener('click', () => {
    const acilacak = detaySatiri.hidden;
    detaySatiri.hidden = !acilacak;
    ac.setAttribute('aria-expanded', String(acilacak));
    ac.setAttribute('aria-label', `${acilacak ? 'Adım farkını kapat' : 'Adım farkını aç'}: ${x.baslik}`);
    if (acilacak) yukle();
  });
  if (acik) queueMicrotask(yukle);
  const sure = (t) => h('td', { class: 'sayi mono' }, t ? sureMetni(t.sureMs) : '—');
  const http = (t) => (t && typeof t.httpKodu === 'number' ? h('small', { class: 'mono soluk' }, ` HTTP ${t.httpKodu}`) : null);
  return [h('tr', { class: `kars-satiri d-${x.degisim}` },
    h('td', { class: 'secim' }, ac),
    h('td', { class: 'kars-senaryo' }, h('span', { class: 'kars-baslik', title: x.baslik }, x.baslik), h('small', { class: 'soluk' }, x.grup)),
    h('td', {}, durumRozeti(x.a?.durum), http(x.a)), h('td', {}, durumRozeti(x.b?.durum), http(x.b)),
    h('td', {}, degisimRozeti(x.degisim)), sure(x.a), sure(x.b),
    h('td', { class: 'sayi' }, x.sureFarkiMs === null ? h('span', { class: 'cok-soluk' }, '—') : farkHapi(x.sureFarkiMs, false, sureMetni))), detaySatiri];
}

/** Açılan satırın adım adım farkı. */
async function senaryoFarki(alan, x, proje, s) {
  yerlestir(alan, iskelet('liste'));
  let d;
  try {
    d = await api(`/platform/sonuclar/karsilastir/senaryo?${new URLSearchParams({ projeId: proje.id, tur: s.tur, a: x.a?.ref || '', b: x.b?.ref || '' })}`);
  } catch (e) {
    if (e && e.durum === 423) return;
    yerlestir(alan, hataKutusu(e));
    return;
  }
  if (s.tur === 'servis') { yerlestir(alan, servisFarki(d, x)); return; }
  yerlestir(alan, ekranFarki(d, x));
}

/** Bir tarafın hata / görüntü özeti (ekran). */
function ekranTarafi(ad, t) {
  const sinif = `kars-taraf kars-${ad.toLowerCase()}`;
  if (!t) return h('div', { class: sinif }, h('h4', { class: 'bolum-etiketi' }, rozet(ad, `kars-${ad.toLowerCase()}`), ' bu koşuda yok'));
  const son = t.gorseller.length ? t.gorseller[t.gorseller.length - 1] : null;
  return h('div', { class: sinif },
    h('h4', { class: 'bolum-etiketi' }, rozet(ad, `kars-${ad.toLowerCase()}`), ' ', durumRozeti(t.durum), h('span', { class: 'mono' }, sureMetni(t.sureMs))),
    t.kalinanAdim ? h('p', { class: 'kucuk' }, h('b', {}, 'Kalınan adım: '), t.kalinanAdim) : null,
    t.beklenenGorulen ? h('dl', { class: 'karsilastirma' },
      h('div', { class: 'beklenen' }, h('dt', {}, 'Beklenen'), h('dd', {}, t.beklenenGorulen.beklenen || '—')),
      h('div', { class: 'gorulen' }, h('dt', {}, 'Görülen'), h('dd', {}, t.beklenenGorulen.gorulen || '—'))) : null,
    t.hata ? h('pre', { class: 'hata-mesaji kucuk kars-hata' }, t.hata) : null,
    son ? gorselDugmesi(son, ad) : h('div', { class: 'medya-bos kars-medya-bos' }, ikon('ekran'), 'Ekran görüntüsü yok'),
    h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/sonuclar/sonuc/${q(t.id)}`, 'aria-label': `${ad} sonucunun tüm ayrıntıları` }, 'Tüm ayrıntılar', ikon('ok')));
}

/** Küçük görüntü; tıklayınca büyük görünüm (diyalog). */
function gorselDugmesi(m, ad) {
  const dugme = h('button', { type: 'button', class: 'kars-gorsel', 'aria-label': `${ad} ekran görüntüsünü büyüt: ${m.ad}` },
    h('img', { src: medyaUrl(m.id), alt: '', loading: 'lazy' }));
  dugme.addEventListener('click', () => {
    const d = h('dialog', { class: 'gorsel-diyalog', 'aria-label': `${ad} ekran görüntüsü` },
      h('div', { class: 'diyalog-ust' }, h('strong', {}, `${ad}: ${m.ad}`),
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme birincil', onclick: () => d.close() }, 'Kapat'))),
      h('img', { src: medyaUrl(m.id), alt: m.ad, class: 'buyuk-gorsel' }));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  });
  return dugme;
}

/** Adım tablosu satırı (ortak): ad | A | B | değişim; hata farkı altta. */
function adimTablosu(adimlar, secenek = {}) {
  if (!adimlar.length) return h('p', { class: 'bos-liste' }, 'Adım bilgisi yok.');
  const hucre = (t) => (t
    ? h('td', {}, durumRozeti(t.durum), typeof t.httpKodu === 'number' ? h('small', { class: 'mono' }, ` HTTP ${t.httpKodu}`) : null,
      h('small', { class: 'mono soluk' }, ` ${sureMetni(t.sureMs)}`))
    : h('td', {}, h('span', { class: 'cok-soluk' }, '—', h('span', { class: 'gorunmez' }, ' yok'))));
  const satirlar = adimlar.flatMap((a, i) => {
    const hataFarki = (a.a?.hata || a.b?.hata) && a.a?.hata !== a.b?.hata;
    const kontroller = (a.kontroller || []).filter((k) => secenek.tumKontroller || k.degisti || (k.a && !k.a.gecti) || (k.b && !k.b.gecti));
    const ek = [];
    if (hataFarki) {
      ek.push(h('div', { class: 'kars-ikili' },
        h('div', {}, h('span', { class: 'kars-etiket' }, 'A'), a.a?.hata ? h('pre', { class: 'hata-mesaji kucuk kars-hata' }, a.a.hata) : h('span', { class: 'cok-soluk' }, 'hata yok')),
        h('div', {}, h('span', { class: 'kars-etiket' }, 'B'), a.b?.hata ? h('pre', { class: 'hata-mesaji kucuk kars-hata' }, a.b.hata) : h('span', { class: 'cok-soluk' }, 'hata yok'))));
    }
    if (kontroller.length) {
      ek.push(h('ul', { class: 'kars-kontroller', 'aria-label': `Kontrol sonuçları: ${a.ad}` }, kontroller.map((k) => h('li', { class: k.degisti ? 'degisti' : null },
        h('span', { class: 'kars-kontrol-adi' }, k.ad),
        h('span', { class: 'kars-kontrol-sonuclari mono' },
          h('span', {}, 'A ', k.a ? (k.a.gecti ? '✓' : '✗') : '—', h('span', { class: 'gorunmez' }, k.a ? (k.a.gecti ? ' geçti' : ' başarısız') : ' yok')),
          h('span', {}, 'B ', k.b ? (k.b.gecti ? '✓' : '✗') : '—', h('span', { class: 'gorunmez' }, k.b ? (k.b.gecti ? ' geçti' : ' başarısız') : ' yok'))),
        k.degisti ? degisimRozeti(k.degisim) : null,
        (k.a?.aciklama || k.b?.aciklama) ? h('small', { class: 'kars-kontrol-aciklama soluk' },
          k.a?.aciklama === k.b?.aciklama || !k.a || !k.b ? (k.b?.aciklama || k.a?.aciklama) : `A: ${k.a.aciklama || '—'} · B: ${k.b.aciklama || '—'}`) : null))));
    }
    return [h('tr', { class: a.degisti ? 'degisti' : null },
      h('td', { class: 'sayi mono' }, String(i + 1)), h('td', { class: 'kars-adim-adi' }, a.ad), hucre(a.a), hucre(a.b), h('td', {}, degisimRozeti(a.degisim))),
    ek.length ? h('tr', { class: 'kars-adim-eki' }, h('td', {}), h('td', { colspan: '4' }, ek)) : null].filter(Boolean);
  });
  return h('div', { class: 'tablo-kaydirma kars-kaydirma' }, h('table', { class: 'ozet-tablosu kars-adim-tablosu', 'data-siralama': 'yok' },
    h('caption', { class: 'gorunmez' }, secenek.baslik || 'Adım karşılaştırması'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'sayi' }, '#'), h('th', { scope: 'col' }, secenek.adBasligi || 'Adım'),
      h('th', { scope: 'col' }, 'A'), h('th', { scope: 'col' }, 'B'), h('th', { scope: 'col' }, 'Değişim'))),
    h('tbody', {}, satirlar)));
}

function ekranFarki(d, x) {
  const yakalanan = d.yakalanan || [];
  const DURUM_Y = { 'yalniz-a': ["yalnız A'da", ''], 'yalniz-b': ["yalnız B'de", 'hata'], ikisinde: ['ikisinde', 'atlanan'] };
  return h('div', { class: 'kars-detay' },
    h('div', { class: 'kars-ikili' }, ekranTarafi('A', d.a), ekranTarafi('B', d.b)),
    h('h4', { class: 'bolum-etiketi' }, 'Adımlar', h('span', { class: 'mono' }, `${d.adimlar.filter((a) => a.degisti).length} değişen / ${d.adimlar.length}`)),
    adimTablosu(d.adimlar, { baslik: `Adım karşılaştırması: ${x.baslik}` }),
    h('h4', { class: 'bolum-etiketi' }, 'Koşuda yakalanan mesajlar', h('span', { class: 'mono' }, String(yakalanan.length))),
    yakalanan.length
      ? h('ul', { class: 'yakalanan-listesi kars-yakalanan', 'aria-label': 'Yakalanan mesaj farkı' }, yakalanan.map((m) => h('li', { class: m.beklenen ? 'beklenen' : 'beklenmeyen' },
        h('span', { class: 'satir' }, rozet(DURUM_Y[m.durum][0], DURUM_Y[m.durum][1]), rozet(KAYNAK[m.kaynak] || m.kaynak, 'yakalanan-kaynak'),
          m.beklenen ? rozet('beklenen', 'atlanan') : rozet('beklenmeyen', 'hata'),
          h('small', { class: 'mono soluk' }, `A ${m.sayiA} · B ${m.sayiB}`)),
        h('span', { class: 'yakalanan-metin' }, m.metinB ?? m.metinA ?? m.kalip))))
      : h('p', { class: 'soluk kucuk' }, 'İki tarafta da yakalanan mesaj yok.'));
}

function servisFarki(d, x) {
  const taraf = (ad, t) => h('div', { class: `kars-taraf kars-${ad.toLowerCase()}` },
    t ? [
      h('h4', { class: 'bolum-etiketi' }, rozet(ad, `kars-${ad.toLowerCase()}`), ' ', durumRozeti(t.durum),
        typeof t.httpKodu === 'number' ? rozet(`HTTP ${t.httpKodu}`) : null, h('span', { class: 'mono' }, sureMetni(t.sureMs))),
      t.hata ? h('pre', { class: 'hata-mesaji kucuk kars-hata' }, t.hata) : h('p', { class: 'soluk kucuk' }, 'Hata yok.'),
      /^a-/.test(t.id) ? h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/sonuclar/servisler/kosu/${q(t.id)}` }, 'Koşuyu aç', ikon('ok'))
        : h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/sonuclar/servisler/senaryo/${q(t.id)}` }, 'Ayrıntı', ikon('ok'))
    ] : h('h4', { class: 'bolum-etiketi' }, rozet(ad, `kars-${ad.toLowerCase()}`), ' bu koşuda yok'));
  return h('div', { class: 'kars-detay' },
    h('div', { class: 'kars-ikili' }, taraf('A', d.a), taraf('B', d.b)),
    h('h4', { class: 'bolum-etiketi' }, 'İstekler', h('span', { class: 'mono' }, `${d.adimlar.filter((a) => a.degisti).length} değişen / ${d.adimlar.length}`)),
    adimTablosu(d.adimlar, { baslik: `İstek karşılaştırması: ${x.baslik}`, adBasligi: 'İstek' }));
}

/** Boş / hatalı durum (ör. silinmiş koşu). */
export function karsilastirmaHatasi(icerik, e, taban) {
  yerlestir(icerik, hataKutusu(e), bosDurum('Karşılaştırma açılamadı.', 'Koşulardan biri silinmiş ya da başka bir projeye ait olabilir.', {
    ikon: 'grafik', eylem: h('a', { class: 'dugme birincil', href: taban }, ikon('geri'), 'Sonuçlara dön')
  }));
}
