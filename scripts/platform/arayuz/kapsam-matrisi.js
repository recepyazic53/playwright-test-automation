// Sonuçlar > Raporlar > KAPSAM MATRİSİ (#/sonuclar/raporlar/kapsam): talep × senaryo × son sonuç (başarılı / başarısız / koşmadı, tarih,
// ortam). Yalnız senaryosu olan talepler listelenir (talep no senaryo formlarında girilir). Süzgeç: ortam ve dönem (ortak tarih aralığı
// bileşeni; seçim oturumda ayrı anahtarla saklanır). Çıktı: PDF (sunucuda yerel Chromium; ağ istekleri engelli, kaydedilmez) ve CSV.
// Hesap sunucuda (sonuclar/kapsam-matrisi.mjs). Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import { araligiCoz, tarihAraligiSecici, kayitliAralik } from './tarih-araligi.js';
import { indir, pdfAl } from './pdf-rapor.js';

const ARALIK_ANAHTARI = 'platform.kapsamMatrisiAraligi';
const SONUC_ROZETI = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], kosmadi: ['Koşmadı', 'atlanan'] };
const DURUM_ROZETI = { basarili: ['Tamamı başarılı', 'basari'], basarisiz: ['Başarısız var', 'hata'], eksik: ['Koşmayan var', 'atlanan'] };
/** Oturum boyunca korunan ortam seçimi ('' = tüm ortamlar). */
const secim = { ortamId: '' };

/**
 * @param {HTMLElement} icerik @param {{ id: string; ad: string }} proje @param {HTMLElement | null} [ust] Genel sekmeleri
 */
export async function kapsamMatrisiGorunumu(icerik, proje, ust = null) {
  let aralik = kayitliAralik(ARALIK_ANAHTARI);
  const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`);
  if (secim.ortamId && !ortamlar.some((o) => o.id === secim.ortamId)) secim.ortamId = '';
  const govde = h('div', { 'aria-live': 'polite' }, iskelet('liste'));
  const ortamSec = h('select', { 'aria-label': 'Ortam' }, [['', 'Tüm ortamlar'], ...ortamlar.map((o) => [o.id, o.ad])].map(([d, m]) => h('option', { value: d, selected: secim.ortamId === d }, m)));
  const ortamKutusu = h('div', { class: `filtre-secimi ${secim.ortamId ? 'etkin' : ''}` }, h('label', {}, 'Ortam'), ortamSec);
  ortamSec.addEventListener('change', () => { secim.ortamId = ortamSec.value; ortamKutusu.classList.toggle('etkin', Boolean(secim.ortamId)); void yenile(); });
  const suzgec = () => {
    const c = araligiCoz(aralik);
    return { projeId: proje.id, ...(secim.ortamId ? { ortamId: secim.ortamId } : {}), ...(c.baslangic ? { baslangic: c.baslangic } : {}), ...(c.bitis ? { bitis: c.bitis } : {}) };
  };
  const pdfDugmesi = h('button', { type: 'button', class: 'dugme birincil' }, ikon('indir'), 'PDF indir');
  const csvDugmesi = h('button', { type: 'button', class: 'dugme' }, ikon('indir'), 'CSV indir');
  pdfDugmesi.addEventListener('click', async () => {
    try {
      const r = await mesgulIken(pdfDugmesi, 'Hazırlanıyor…', () => pdfAl('/platform/kapsam-matrisi/pdf', suzgec()));
      indir(r.blob, r.ad);
      bildir('Kapsam matrisi (PDF) indirildi.');
    } catch (e) { bildir(`PDF hazırlanamadı: ${e.message || e}`, 'hata'); }
  });
  csvDugmesi.addEventListener('click', async () => {
    try {
      const r = await mesgulIken(csvDugmesi, 'Hazırlanıyor…', () => api('/platform/kapsam-matrisi/csv', { govde: suzgec() }));
      indir(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }), r.dosyaAdi);
      bildir('Kapsam matrisi (CSV) indirildi.');
    } catch (e) { bildir(`CSV hazırlanamadı: ${e.message || e}`, 'hata'); }
  });
  const aralikSecici = tarihAraligiSecici({ deger: aralik, anahtar: ARALIK_ANAHTARI, etiket: 'Dönem', degisti: (d) => { aralik = d; void yenile(); } });
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar/raporlar' }, 'Raporlar'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Kapsam matrisi')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Kapsam matrisi')),
        h('p', { class: 'soluk' }, 'Talep × senaryo × son sonuç. Talep no senaryo formlarında başlığın yanında girilir; yalnız senaryosu olan talepler listelenir.')),
      h('div', { class: 'eylemler' }, csvDugmesi, pdfDugmesi)),
    ust,
    h('div', { class: 'kart kapsam-suzgecleri' }, h('div', { class: 'senaryo-arac-cubugu' }, ortamKutusu), aralikSecici),
    govde);

  async function yenile() {
    govde.setAttribute('aria-busy', 'true');
    try {
      const q = new URLSearchParams(Object.entries(suzgec()).map(([a, d]) => [a, String(d)]));
      const { matris } = await api(`/platform/kapsam-matrisi?${q}`);
      ciz(matris);
    } catch (e) {
      if (!(e && e.durum === 423)) yerlestir(govde, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Kapsam matrisi alınamadı: ${e.message || e}`));
    } finally { govde.removeAttribute('aria-busy'); }
  }

  function ciz(m) {
    pdfDugmesi.disabled = false;
    csvDugmesi.disabled = !m.satirlar.length;
    if (!m.talepler.length) {
      yerlestir(govde, h('section', { class: 'kart' }, bosDurum('Talep numarası girilmiş senaryo yok.',
        'Ekran senaryosu, servis senaryosu ya da uçtan uca akış formunda başlığın yanındaki "Talep no" alanından ekleyin.', { ikon: 'isaret' })));
      return;
    }
    const say = (d) => m.satirlar.filter((r) => r.sonuc === d).length;
    const ozet = h('div', { class: 'kapsam-ozeti', role: 'status' },
      h('span', {}, h('b', {}, String(m.talepler.length)), ' talep'), h('span', {}, h('b', {}, String(m.satirlar.length)), ' talep × senaryo'),
      h('span', { class: 'basari-metni' }, h('b', {}, String(say('basarili'))), ' başarılı'), h('span', { class: 'hata-metni' }, h('b', {}, String(say('basarisiz'))), ' başarısız'),
      h('span', { class: 'soluk' }, h('b', {}, String(say('kosmadi'))), ' koşmadı'));
    const talepTablosu = h('table', { class: 'veri-tablosu kapsam-talepleri', 'aria-label': 'Talepler' },
      h('thead', {}, h('tr', {}, ['Talep', 'Senaryo', 'Başarılı', 'Başarısız', 'Koşmadı', 'Durum'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, m.talepler.map((x) => h('tr', {},
        h('th', { scope: 'row' }, x.talep), h('td', { class: 'sayi' }, String(x.toplam)), h('td', { class: 'sayi' }, String(x.basarili)),
        h('td', { class: 'sayi' }, String(x.basarisiz)), h('td', { class: 'sayi' }, String(x.kosmadi)),
        h('td', {}, rozet(DURUM_ROZETI[x.durum][0], DURUM_ROZETI[x.durum][1]))))));
    const baglanti = (r) => (r.tur === 'ekran' ? `#/senaryolar/duzenle/${encodeURIComponent(r.id)}` : r.tur === 'uctanUca' ? `#/akislar/${encodeURIComponent(r.id)}` : null);
    const matris = h('table', { class: 'veri-tablosu kapsam-matrisi-tablosu', 'aria-label': 'Talep × senaryo' },
      h('thead', {}, h('tr', {}, ['Talep', 'Tür', 'Senaryo', 'Ekran / servis', 'Son sonuç', 'Tarih', 'Ortam'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, m.satirlar.map((r) => h('tr', { 'data-talep': r.talep },
        h('td', {}, r.talep), h('td', {}, r.turAdi),
        h('td', {}, baglanti(r) ? h('a', { href: baglanti(r) }, r.baslik) : r.baslik),
        h('td', {}, r.oge || h('span', { class: 'cok-soluk' }, '—')),
        h('td', {}, rozet(SONUC_ROZETI[r.sonuc][0], SONUC_ROZETI[r.sonuc][1])),
        h('td', { class: 'mono' }, r.zaman ? tarihMetni(r.zaman) : h('span', { class: 'cok-soluk' }, '—')),
        h('td', {}, r.ortamAdi || h('span', { class: 'cok-soluk' }, '—'))))));
    yerlestir(govde, ozet,
      h('section', { class: 'kart' }, h('h3', {}, 'Talepler'), h('div', { class: 'tablo-kaydirma' }, talepTablosu)),
      h('section', { class: 'kart' }, h('h3', {}, 'Talep × senaryo'), h('div', { class: 'tablo-kaydirma' }, matris),
        h('p', { class: 'soluk kucuk' }, 'Son sonuç: seçilen ortam ve dönemdeki en yeni koşu. Ekran senaryosunda atlanan / durdurulan sonuç, servis ve uçtan uca akışta "Dene" koşu sayılmaz; hata başarısız sayılır.')));
  }

  await yenile();
}
