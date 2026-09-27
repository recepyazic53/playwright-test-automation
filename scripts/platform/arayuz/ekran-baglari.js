// Ekran sayfası > "Test verisi" sekmesi: ekranın input'ları test verisi tablolarının sütunlarına bağlanır (anında kaydedilir).
// Bağlı seçim alanının seçenekleri senaryo formunda tablodan gelir; aynı tabloya bağlı alanlar birbirini süzer (ör. Kapsam →
// Alternatif → Ülke). Aynı tablo iki kez gerekiyorsa etiket verilir (aynı etiketli alanlar aynı satırdan).
import { api, bildir, bosDurum, h, ikon, iskelet, yerlestir } from './ortak.js';
import { degerCipleri } from './parametre-tanimi-formu.js';
import { onayIste } from './kosu-paneli.js';

const q = encodeURIComponent;
const TIP = { secim: 'seçim', metin: 'metin', sayi: 'sayı', tarih: 'tarih', telefon: 'telefon', onayKutusu: 'onay kutusu', dosya: 'dosya' };
const kucuk = (x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/** @param {HTMLElement} kap @param {{ proje: { id: string } }} s @param {{ id: string; ad: string }} ekran */
export async function ekranBaglariSekmesi(kap, s, ekran) {
  yerlestir(kap, iskelet('liste'));
  const { baglar, girdiler, tablolar } = await api(`/platform/ekran/alan-baglari?projeId=${q(s.proje.id)}&ekranId=${q(ekran.id)}`);
  if (!girdiler.length) {
    yerlestir(kap, h('section', { class: 'kart' }, bosDurum('Bu ekranın input\'u yok.', 'Model yüklenince senaryoda ayarlanan alanlar burada listelenir.', { ikon: 'liste' })));
    return;
  }
  const durum = h('span', { class: 'kayit-durumu soluk kucuk', 'aria-live': 'polite' });
  let zaman = null;
  const kaydet = async () => {
    durum.textContent = 'Kaydediliyor…';
    durum.className = 'kayit-durumu soluk kucuk';
    try {
      await api('/platform/ekran/alan-baglari/kaydet', { govde: { projeId: s.proje.id, ekranId: ekran.id, baglar } });
      durum.textContent = '✓ Kaydedildi';
    } catch (e) {
      durum.textContent = `Kaydedilemedi: ${e.message}`;
      durum.className = 'kayit-durumu alan-uyarisi';
    }
  };
  const degisti = () => { clearTimeout(zaman); durum.textContent = 'Değişti…'; zaman = setTimeout(kaydet, 400); };

  /** Adı aynı sütun (bağlı olmayan input'lar için öneri). */
  const oneri = (g) => {
    for (const t of tablolar) {
      const c = t.sutunlar.find((x) => !x.gizli && kucuk(x.ad) === kucuk(g.etiket));
      if (c) return { tablo: t.id, sutun: c.ad };
    }
    return null;
  };
  const liste = h('div', { class: 'alan-formu ekran-baglari' });
  const ciz = () => {
    const satirlar = girdiler.map((g) => {
      const b = baglar[g.id];
      const tablo = b ? tablolar.find((t) => t.id === b.tablo) : null;
      const sutun = tablo ? tablo.sutunlar.find((c) => c.ad === b.sutun) : null;
      const sec = h('select', { 'aria-label': `${g.etiket} tablo sütunu` }, h('option', { value: '' }, '— bağlı değil —'),
        tablolar.map((t) => h('optgroup', { label: t.ad }, t.sutunlar.filter((c) => !c.gizli).map((c) => h('option', {
          value: `${t.id}\u0001${c.ad}`, selected: Boolean(b && b.tablo === t.id && b.sutun === c.ad)
        }, `${t.ad} → ${c.ad}`)))),
        b && !sutun ? h('option', { value: '__yok', selected: true }, 'Bulunamadı (tablo ya da sütun silinmiş)') : null);
      sec.addEventListener('change', () => {
        if (sec.value === '__yok') return;
        if (!sec.value) delete baglar[g.id];
        else { const [tabloId, sutunAdi] = sec.value.split('\u0001'); baglar[g.id] = { tablo: tabloId, sutun: sutunAdi, ...(b && b.etiket ? { etiket: b.etiket } : {}) }; }
        ciz();
        degisti();
      });
      const etiket = b ? h('input', { type: 'text', value: b.etiket || '', maxlength: '40', placeholder: 'etiket', class: 'bag-etiketi', 'aria-label': `${g.etiket} etiketi`,
        title: 'Aynı tablo bu ekranda iki kez gerekiyorsa (ör. başvuran / kefil) farklı etiket verin; aynı etiketli alanlar aynı satırdan dolar.' }) : null;
      etiket?.addEventListener('change', () => { const e = etiket.value.trim(); if (e) b.etiket = e; else delete b.etiket; degisti(); });
      let alt = null;
      if (sutun) {
        const degerler = [...new Set(tablo.satirlar.map((r) => r.degerler[sutun.ad]).filter((x) => x !== null && x !== undefined && x !== ''))];
        alt = degerler.length ? degerCipleri(degerler.map((deger) => ({ deger })), 5) : h('span', { class: 'soluk kucuk' }, 'sütunda değer yok');
      }
      return h('div', { class: `alan-satiri ${b ? '' : 'gonderilmez'}` },
        h('span', { class: 'alan-adi', title: g.id }, g.etiket, h('span', { class: 'alan-tipi' }, TIP[g.tip] || g.tip)),
        h('span', { class: 'kaynak-hucresi' }, h('span', { class: 'kaynak-secimi' }, sec, etiket), alt));
    });
    const bagsiz = girdiler.filter((g) => !baglar[g.id] && oneri(g));
    yerlestir(liste,
      h('div', { class: 'alan-satiri baslik' }, h('span', {}, 'Input'), h('span', {}, 'Tablo sütunu')),
      ...satirlar);
    yerlestir(oneriKap, bagsiz.length ? h('div', { class: 'not-kutusu bilgi kucuk' },
      `${bagsiz.length} input'un adı bir tablo sütunuyla aynı. `,
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { for (const g of bagsiz) baglar[g.id] = oneri(g); ciz(); degisti(); } }, 'Adı aynı sütunlara bağla')) : null);
  };
  const oneriKap = h('div', {});
  // "Değerleri tabloya bağla…": bu ekranın senaryolarında bağlı alanların düz değerleri → ${Tablo.Sütun} (önce plan, onayla).
  const donustur = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('veri'), 'Değerleri tabloya bağla…');
  donustur.addEventListener('click', async () => {
    if (zaman) { clearTimeout(zaman); zaman = null; await kaydet(); }
    await degerleriTabloyaBagla(s.proje, ekran, donustur);
  });
  yerlestir(kap, h('section', { class: 'kart form-paneli', 'aria-label': 'Ekranın test verisi bağlantıları' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, 'Test verisi'), h('span', { class: 'sag' }, durum, donustur,
      h('a', { class: 'dugme kucuk-dugme hayalet', href: '#/ayarlar/test-verisi' }, 'Test verisi tabloları'))),
    h('p', { class: 'soluk kucuk' }, 'Her input\'u bir test verisi tablosunun sütununa bağlayın. Senaryo formunda bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tabloya bağlı alanlar seçtikçe birbirini süzer (ör. Kapsam → Alternatif → Ülke). Bağlı olmayan alanlar modeldeki seçenekleri kullanır. Değişiklikler anında kaydedilir. Mevcut senaryolardaki düz değerleri tabloya bağlamak için "Değerleri tabloya bağla…" (önce ne değişeceği gösterilir).'),
    tablolar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Henüz test verisi tablosu yok. ', h('a', { href: '#/ayarlar/test-verisi' }, 'Ayarlar > Test verisi > Tablolar'), ' bölümünden ekleyin.'),
    oneriKap, liste));
  ciz();
}

const DURUM_METNI = { cevrilecek: 'çevrilecek', atlandi: 'atlandı', secilmedi: 'seçilmedi' };

/**
 * Dönüşüm planı → onay penceresi: çevrilecek satırlar işaretlenebilir (varsayılan işaretli), atlananlar nedenleriyle gösterilir.
 * Gizli sütun / hassas alan değerleri sunucudan zaten "•••" gelir. Onayla yalnız işaretliler yazılır.
 * @param {{ id: string }} proje @param {{ id: string; ad: string }} ekran @param {HTMLButtonElement} dugme
 */
export async function degerleriTabloyaBagla(proje, ekran, dugme) {
  let plan;
  dugme.disabled = true;
  try {
    ({ onizleme: plan } = await api('/platform/ekran/senaryolar/tablo-donusumu', { govde: { projeId: proje.id, ekranId: ekran.id } }));
  } catch (e) {
    if (e && e.durum !== 423) bildir(e.message, 'hata');
    return;
  } finally { dugme.disabled = false; }
  if (!plan.satirlar.length) { bildir('Senaryolarda tabloya bağlı alanların düz değeri yok; çevrilecek bir şey bulunmadı.'); return; }
  const secili = new Set(plan.satirlar.filter((x) => x.durum === 'cevrilecek').map((x) => x.anahtar));
  let yenile = () => {};
  const tumu = h('input', { type: 'checkbox', checked: secili.size > 0, disabled: !secili.size, 'aria-label': 'Çevrilecek tüm alanları seç' });
  const kutular = [];
  const sayac = h('span', { class: 'soluk', 'aria-live': 'polite' });
  const sayacYaz = () => { sayac.textContent = `${secili.size} alan seçili`; tumu.checked = secili.size > 0 && secili.size === kutular.length; yenile(); };
  const satirlar = plan.satirlar.map((x) => {
    const kutu = x.durum === 'cevrilecek' ? h('input', { type: 'checkbox', checked: true, 'aria-label': `${x.senaryo} · ${x.alanEtiketi}: çevir` }) : null;
    if (kutu) {
      kutular.push([kutu, x.anahtar]);
      kutu.addEventListener('change', () => { if (kutu.checked) secili.add(x.anahtar); else secili.delete(x.anahtar); sayacYaz(); });
    }
    return h('tr', { class: x.durum, 'data-anahtar': x.anahtar },
      h('td', {}, kutu),
      h('td', { 'data-baslik': 'Senaryo' }, x.senaryo),
      h('td', { 'data-baslik': 'Alan' }, x.alanEtiketi),
      h('td', { 'data-baslik': 'Eski değer' }, x.gizli ? h('span', { title: 'Gizli / hassas değer gösterilmez' }, '•••') : x.eskiDeger),
      h('td', { 'data-baslik': 'Yeni' }, x.yeniDeger ? h('code', {}, x.yeniDeger) : '—', x.satirSecimi ? h('span', { class: 'neden' }, `Satır seçimi: ${x.satirSecimi}`) : null),
      h('td', { 'data-baslik': 'Durum' }, DURUM_METNI[x.durum] || x.durum, x.neden ? h('span', { class: 'neden' }, x.neden) : null));
  });
  tumu.addEventListener('change', () => {
    for (const [k, a] of kutular) { k.checked = tumu.checked; if (tumu.checked) secili.add(a); else secili.delete(a); }
    sayacYaz();
  });
  const o = plan.ozet;
  const ek = h('div', { class: 'donusum-plani' },
    h('div', { class: 'donusum-ozeti' }, h('b', {}, `${o.cevrilecek} alan çevrilebilir`), h('span', {}, `${o.atlanan} alan atlandı`), h('span', {}, `${o.senaryo} senaryo`), sayac),
    h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Dönüşüm planı' },
      h('thead', {}, h('tr', {}, h('th', {}, tumu), h('th', {}, 'Senaryo'), h('th', {}, 'Alan'), h('th', {}, 'Eski değer'), h('th', {}, 'Yeni'), h('th', {}, 'Durum'))),
      h('tbody', {}, satirlar))),
    h('p', { class: 'soluk kucuk' }, 'Koşuda ekrana giden değer değişmez: her ortamda tablodan çözülen değer eski değerle karşılaştırıldı; tutmayanlar atlandı. ', plan.geriAlma));
  sayacYaz();
  const onay = await onayIste({
    baslik: 'Değerler tabloya bağlansın mı?',
    metin: `${ekran.ad} ekranının senaryolarında seçtiğiniz alanların düz değeri test verisi tablosu başvurusuna (\${Tablo.Sütun}) çevrilir; gerekirse o satırı seçecek satır seçimi yazılır.`,
    ek, hazir: () => secili.size > 0, baglan: (fn) => { yenile = fn; }, dugme: 'Tabloya bağla', ikonAd: 'veri'
  });
  if (!onay) return;
  try {
    const secimler = plan.satirlar.filter((x) => secili.has(x.anahtar)).map((x) => ({ senaryoId: x.senaryoId, alan: x.alan }));
    const y = await api('/platform/ekran/senaryolar/tablo-donusumu', { govde: { projeId: proje.id, ekranId: ekran.id, onay: true, secimler } });
    const atlanan = y.satirlar.filter((x) => secili.has(x.anahtar) && x.durum === 'atlandi').length;
    bildir(`${y.guncellenenSenaryo} senaryoda ${y.cevrilenAlan} alan tabloya bağlandı.${atlanan ? ` ${atlanan} alan yeniden denetimde atlandı.` : ''}`, atlanan ? 'hata' : 'basari');
  } catch (e) {
    if (e && e.durum !== 423) bildir(e.message, 'hata');
  }
}
