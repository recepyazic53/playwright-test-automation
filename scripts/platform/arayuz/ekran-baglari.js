// Ekran sayfası > "Test verisi" sekmesi: ekranın input'ları test verisi tablolarının sütunlarına bağlanır (anında kaydedilir).
// Bağlı seçim alanının seçenekleri senaryo formunda tablodan gelir; aynı tabloya bağlı alanlar birbirini süzer (ör. Kapsam →
// Alternatif → Ülke). Aynı tablo iki kez gerekiyorsa etiket verilir (aynı etiketli alanlar aynı satırdan).
// Ortak akışın sayfasında da vardır: bağ orada bir kez kurulur, onu kullanan ekranlarda ekranın kendi alanlarının altında, ortak
// akış başına ayrı bir "Ortak akıştan: <ad>" bölümünde görünür (varsayılan kapalı; ekrana özel bağ varsa açık). Ekranda
// değiştirilirse ekrana özel olur (ezme), "Ortak akışa dön" ekranın bağını siler. Yalnız görünüm: etkin bağ sunucuda çözülür.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { degerCipleri } from './parametre-tanimi-formu.js';
import { onayIste } from './kosu-paneli.js';

const q = encodeURIComponent;
const TIP = { secim: 'seçim', metin: 'metin', sayi: 'sayı', tarih: 'tarih', telefon: 'telefon', onayKutusu: 'onay kutusu', dosya: 'dosya' };
const kucuk = (x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** Seçenekleri tablodan listelenen alan tipleri: gizli sütuna bağlanamaz. */
const SECIM_TIPLERI = ['secim', 'okluSecim', 'radyo'];
/**
 * Senaryo ayarı (ekranda karşılığı olmayan, akışı dallandıran seçim; ör. "Teslim şekli: kargo / mağaza") rozeti. Tablodaki okunur
 * değer koşuda seçeneğin koduna çevrilir: bağ kurulunca sütunun karşılıkları (sayfa değeri = kod) modelden dolar.
 */
const ayarRozeti = () => h('span', {
  class: 'rozet vurgu ayar-rozeti', title: 'Ekranda karşılığı yok; akışın hangi dala gideceğini seçer. Tablodaki değer (ör. seçeneğin adı) koşuda seçeneğin koduna çevrilir (sütunun karşılıkları: sayfa değeri = kod).'
}, 'Ekranda alan değil · senaryo ayarı');

/** @param {HTMLElement} kap @param {{ proje: { id: string } }} s @param {{ id: string; ad: string }} ekran */
export async function ekranBaglariSekmesi(kap, s, ekran) {
  yerlestir(kap, iskelet('liste'));
  // baglar: ekranın KENDİ bağları (yazılan); ortakBaglar: kullandığı ortak akışlardan gelen varsayılan bağlar (ekranınki yoksa
  // geçerli); ortakAkis: bu sayfa bir ortak akış (bağları onu kullanan ekranlara geçer; senaryo dönüşümleri yok).
  const { baglar, girdiler, tablolar, ortakBaglar = {}, ortakAkis = false } = await api(`/platform/ekran/alan-baglari?projeId=${q(s.proje.id)}&ekranId=${q(ekran.id)}`);
  if (!girdiler.length) {
    yerlestir(kap, h('section', { class: 'kart' }, ortakAkis
      ? bosDurum('Bu ortak akışın alanı yok.', 'Akışlar sekmesinde diyagrama alan ekleyince senaryoda ayarlanan alanlar burada listelenir.', { ikon: 'liste' })
      : bosDurum('Bu ekranın alanı yok.', 'Model yüklenince senaryoda ayarlanan alanlar burada listelenir.', { ikon: 'liste' })));
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
  // Ortak akış bölümleri (ekranın kendi alanlarının altında); açık / kapalı durumu yeniden çizimde korunur. İlk çizimde: o ortak
  // akışın alanlarından biri bu ekranda ekrana özel bağlıysa açık, değilse kapalı.
  const ortakKap = h('div', { class: 'ortak-bolumler' });
  /** @type {Map<string, boolean>} */
  const acik = new Map();
  const basliklar = () => h('div', { class: 'alan-satiri baslik' }, h('span', {}, 'Alan'), h('span', {}, 'Tablo sütunu'));
  /** @param {{ id: string; ad: string }} o @param {HTMLElement[]} satirlar @param {number} ozelSayisi */
  const ortakBolumu = (o, satirlar, ozelSayisi) => {
    if (!acik.has(o.id)) acik.set(o.id, ozelSayisi > 0);
    const acikMi = Boolean(acik.get(o.id));
    const govde = h('div', { class: 'acilir-govde', id: yeniKimlik('ortak-bolum'), hidden: !acikMi },
      h('p', { class: 'soluk kucuk' }, 'Bu bağlar ortak akışta kurulur ve bu ekrana otomatik gelir. Burada değiştirirseniz yalnız bu ekran için geçerli olur.'),
      h('div', { class: 'alan-formu ekran-baglari' }, basliklar(), ...satirlar));
    const dugme = h('button', { type: 'button', class: 'acilir-dugme', id: yeniKimlik('ortak-baslik'), 'aria-expanded': String(acikMi), 'aria-controls': govde.id },
      h('span', { class: 'acilir-ok', 'aria-hidden': 'true' }), `Ortak akıştan: ${o.ad} `, h('span', { class: 'acilir-sayi' }, `(${satirlar.length} alan)`));
    dugme.addEventListener('click', () => {
      const ac = dugme.getAttribute('aria-expanded') !== 'true';
      acik.set(o.id, ac);
      dugme.setAttribute('aria-expanded', String(ac));
      govde.hidden = !ac;
    });
    return h('section', { class: 'ortak-bolum', 'aria-labelledby': dugme.id },
      h('div', { class: 'acilir-baslik' }, h('h4', {}, dugme),
        h('a', { class: 'dugme kucuk-dugme hayalet', href: `#/ekranlar/e/${q(o.id)}/veri` }, 'Ortak akış sayfasında düzenle →')),
      govde);
  };
  const ciz = () => {
    /** @type {HTMLElement[]} */
    const kendiSatirlari = [];
    /** @type {Map<string, { o: { id: string; ad: string }; satirlar: HTMLElement[]; ozel: number }>} */
    const gruplar = new Map();
    girdiler.forEach((g) => {
      const kendi = baglar[g.id];
      const miras = ortakBaglar[g.id] || null;
      // Etkin bağ: ekrana özel bağ varsa o (ortak akışınkini ezer), yoksa ortak akıştan gelen.
      const b = kendi || miras;
      const tablo = b ? tablolar.find((t) => t.id === b.tablo) : null;
      const sutun = tablo ? tablo.sutunlar.find((c) => c.ad === b.sutun) : null;
      // Gizli sütun (ör. CVV, parola) yalnız seçim olmayan alanlara bağlanır: değer koşuda şifreli sütundan gelir, raporlarda
      // maskelenir. Seçim alanının seçenekleri tablodan listelendiği için gizli sütun ona sunulmaz.
      const gizliOlur = !SECIM_TIPLERI.includes(g.tip);
      const sec = h('select', { 'aria-label': `${g.etiket} tablo sütunu` }, h('option', { value: '' }, '— bağlı değil —'),
        tablolar.map((t) => h('optgroup', { label: t.ad }, t.sutunlar.filter((c) => gizliOlur || !c.gizli).map((c) => h('option', {
          value: `${t.id}\u0001${c.ad}`, selected: Boolean(b && b.tablo === t.id && b.sutun === c.ad)
        }, `${t.ad} → ${c.ad}${c.gizli ? ' (gizli)' : ''}`)))),
        b && !sutun ? h('option', { value: '__yok', selected: true }, 'Bulunamadı (tablo ya da sütun silinmiş)') : null);
      sec.addEventListener('change', () => {
        if (sec.value === '__yok') return;
        // Ortak akıştan gelen bağ değiştirilirse ekrana özel bağ olur (ezme); boş seçim ekranın bağını siler (varsa ortak akışınkine döner).
        if (!sec.value) delete baglar[g.id];
        else { const [tabloId, sutunAdi] = sec.value.split('\u0001'); baglar[g.id] = { tablo: tabloId, sutun: sutunAdi, ...(b && b.etiket ? { etiket: b.etiket } : {}) }; }
        ciz();
        degisti();
      });
      // Ortak akıştan gelen alan kendi bölümünde durur (bölüm başlığı kaynağı söyler); ekrana özel bağ ortak akışınkini eziyorsa
      // "ekrana özel" rozeti ve "Ortak akışa dön" (ekran bağı silinir).
      const kaynak = miras && kendi
        ? h('span', { class: 'ortak-bag-isareti kucuk' }, rozet('ekrana özel', 'uyari'), h('button', {
          type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${g.etiket}: ortak akışa dön`,
          title: `Ortak akıştaki bağ: ${(tablolar.find((t) => t.id === miras.tablo) || { ad: '?' }).ad} → ${miras.sutun} (${miras.ortakAkis.ad})`,
          onclick: () => { delete baglar[g.id]; ciz(); degisti(); }
        }, ikon('geri'), 'Ortak akışa dön'))
        : null;
      const etiket = kendi ? h('input', { type: 'text', value: b.etiket || '', maxlength: '40', placeholder: 'etiket', class: 'bag-etiketi', 'aria-label': `${g.etiket} etiketi`,
        title: 'Aynı tablo bu ekranda iki kez gerekiyorsa (ör. başvuran / kefil) farklı etiket verin; aynı etiketli alanlar aynı satırdan dolar.' }) : null;
      etiket?.addEventListener('change', () => { const e = etiket.value.trim(); if (e) kendi.etiket = e; else delete kendi.etiket; degisti(); });
      // Senaryo ayarı rozeti (bağlı değilken de): sütun seçiminin altında, değer çiplerinin üstünde.
      let alt = g.senaryoAyari ? ayarRozeti() : null;
      if (sutun && sutun.gizli) {
        alt = h('span', { class: 'soluk kucuk' }, ikon('kilit'), ' gizli sütun: değer şifreli, koşuda kullanılır, gösterilmez');
      } else if (sutun) {
        const degerler = [...new Set(tablo.satirlar.map((r) => r.degerler[sutun.ad]).filter((x) => x !== null && x !== undefined && x !== ''))];
        alt = [alt, degerler.length ? degerCipleri(degerler.map((deger) => ({ deger })), 5) : h('span', { class: 'soluk kucuk' }, 'sütunda değer yok')];
      }
      const satir = h('div', { class: `alan-satiri ${b ? '' : 'gonderilmez'}` },
        h('span', { class: 'alan-adi', title: g.id }, g.etiket, h('span', { class: 'alan-tipi' }, TIP[g.tip] || g.tip)),
        h('span', { class: 'kaynak-hucresi' }, h('span', { class: 'kaynak-secimi' }, sec, etiket), kaynak, alt));
      if (!miras) { kendiSatirlari.push(satir); return; }
      const grup = gruplar.get(miras.ortakAkis.id) || { o: miras.ortakAkis, satirlar: [], ozel: 0 };
      grup.satirlar.push(satir);
      if (kendi) grup.ozel += 1;
      gruplar.set(miras.ortakAkis.id, grup);
    });
    const bagsiz = girdiler.filter((g) => !baglar[g.id] && !ortakBaglar[g.id] && oneri(g));
    yerlestir(liste, basliklar(), ...kendiSatirlari,
      kendiSatirlari.length ? null : h('p', { class: 'soluk kucuk' }, 'Bu ekranın kendi alanı yok; alanları aşağıdaki ortak akışlardan gelir.'));
    yerlestir(ortakKap, [...gruplar.values()].map((x) => ortakBolumu(x.o, x.satirlar, x.ozel)));
    yerlestir(oneriKap, bagsiz.length ? h('div', { class: 'not-kutusu bilgi kucuk' },
      `${bagsiz.length} alanın adı bir tablo sütunuyla aynı. `,
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { for (const g of bagsiz) baglar[g.id] = oneri(g); ciz(); degisti(); } }, 'Adı aynı sütunlara bağla')) : null);
  };
  const oneriKap = h('div', {});
  // "Değerleri tabloya bağla…": bu ekranın senaryolarında bağlı alanların düz değerleri → ${Tablo.Sütun} (önce plan, onayla).
  const donustur = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('veri'), 'Değerleri tabloya bağla…');
  donustur.addEventListener('click', async () => {
    if (zaman) { clearTimeout(zaman); zaman = null; await kaydet(); }
    await degerleriTabloyaBagla(s.proje, ekran, donustur);
  });
  // "Kişi alanlarını tabloya bağla…": kişi / kimlik alanları kişi / kayıt tablosunun sütunlarına (öneri + onay), senaryo değerleri satıra.
  const kisi = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('kullanici'), 'Kişi alanlarını tabloya bağla…');
  kisi.addEventListener('click', async () => {
    if (zaman) { clearTimeout(zaman); zaman = null; await kaydet(); }
    if (await kisiAlanlariniBagla(s.proje, ekran, kisi)) ekranBaglariSekmesi(kap, s, ekran);
  });
  yerlestir(kap, h('section', { class: 'kart form-paneli', 'aria-label': 'Ekranın test verisi bağlantıları' },
    // Ortak akışın senaryosu yok: senaryo dönüşümleri ("Değerleri / Kişi alanlarını tabloya bağla…") gösterilmez.
    h('div', { class: 'kart-basligi' }, h('h3', {}, 'Test verisi'), h('span', { class: 'sag' }, durum, ortakAkis ? null : donustur, ortakAkis ? null : kisi,
      h('a', { class: 'dugme kucuk-dugme hayalet', href: '#/veri' }, 'Test verisi tabloları'))),
    ortakAkis ? h('div', { class: 'not-kutusu bilgi kucuk ortak-bag-notu' }, 'Bu ortak akışın alanlarını burada bir kez bağlayın: bağlar onu kullanan tüm ekranlara varsayılan olarak geçer. Bir ekran aynı alanı kendi Test verisi sekmesinde başka sütuna bağlarsa o ekranda onunki geçerli olur.')
      : Object.keys(ortakBaglar).length ? h('div', { class: 'not-kutusu bilgi kucuk ortak-bag-notu' }, 'Üstteki tablo bu ekranın kendi alanlarıdır. Ortak akışlardan gelen alanlar altta, ortak akış başına ayrı “Ortak akıştan” bölümündedir; bağları ortak akışın sayfasında kurulur. Değiştirirseniz yalnız bu ekran için geçerli olur (ekrana özel); “Ortak akışa dön” ekranın bağını siler.') : null,
    h('p', { class: 'soluk kucuk' }, 'Her alanı bir test verisi tablosunun sütununa bağlayın. Senaryo formunda bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tabloya bağlı alanlar seçtikçe birbirini süzer (ör. Kapsam → Alternatif → Ülke). Bağlı olmayan alanlar modeldeki seçenekleri kullanır. Değişiklikler anında kaydedilir. Mevcut senaryolardaki düz değerleri tabloya bağlamak için "Değerleri tabloya bağla…" (önce ne değişeceği gösterilir).'),
    tablolar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Henüz test verisi tablosu yok. ', h('a', { href: '#/veri' }, 'Test verisi > Tablolar'), ' bölümünden ekleyin.'),
    oneriKap, liste, ortakKap));
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

const KISI_DURUMU = { eslesti: 'eşleşti', yeniSatir: 'yeni satır', atlandi: 'atlandı' };

/**
 * Kişi alanlarını tabloya bağlama penceresi (sunucu: tablolar/kisi-baglama.mjs). Sütun eşlemesi öneridir (kullanıcı onaylar); her
 * senaryo için "eşleşti / yeni satır / atlandı: neden" gösterilir — değer GÖSTERİLMEZ. Seçim değişince önizleme yeniden hesaplanır
 * (sunucuda denenir, yazılmaz). Uygula: bağlar + yeni satırlar + senaryo dönüşümü tek işlemde.
 * @param {{ id: string }} proje @param {{ id: string; ad: string }} ekran @param {HTMLButtonElement} dugme
 * @returns {Promise<boolean>} uygulandıysa true
 */
export function kisiAlanlariniBagla(proje, ekran, dugme) {
  return new Promise((coz) => {
    const is = { tabloId: '', eslemeler: /** @type {Record<string, string> | null} */ (null), etiketler: /** @type {Record<string, string> | null} */ (null), yeniSatirlar: /** @type {Record<string, any>} */ ({}), o: /** @type {any} */ (null), hata: '', sira: 0, bekliyor: true };
    let uygulandi = false;
    const govde = h('div', { class: 'diyalog-govde' });
    const uygula = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('onay'), 'Bağla ve çevir');
    const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay etki-diyalogu kisi-baglama-diyalogu', 'aria-labelledby': 'kisi-baglama-basligi' }, govde, h('div', { class: 'diyalog-alt' }, kapat, uygula));
    const girdi = () => ({ projeId: proje.id, ekranId: ekran.id, ...(is.tabloId ? { tabloId: is.tabloId } : {}), ...(is.eslemeler ? { eslemeler: is.eslemeler } : {}),
      ...(is.etiketler ? { etiketler: is.etiketler } : {}), yeniSatirlar: is.yeniSatirlar });
    let zaman = null;
    const hesapla = (gecikme = 0) => {
      clearTimeout(zaman);
      const n = ++is.sira;
      is.bekliyor = true;
      ciz();
      zaman = setTimeout(async () => {
        try {
          const r = await api('/platform/ekran/kisi-baglama', { govde: girdi() });
          if (n !== is.sira) return;
          is.o = r.onizleme; is.hata = '';
          is.tabloId = r.onizleme.tabloId || '';
          is.eslemeler = Object.fromEntries(r.onizleme.alanlar.map((a) => [a.alanId, a.sutun]));
          is.etiketler = Object.fromEntries(r.onizleme.alanlar.map((a) => [a.alanId, a.kisiEtiketi || '']));
        } catch (e) { if (n === is.sira) is.hata = e.message; }
        if (n === is.sira) { is.bekliyor = false; ciz(); }
      }, gecikme);
    };
    const yeniSatirHucresi = (x) => {
      const karar = (is.yeniSatirlar[x.anahtar] ??= {});
      const ad = h('input', { type: 'text', maxlength: '120', value: karar.ad ?? x.onerilenAd ?? '', 'aria-label': `${x.senaryo}: yeni satır adı` });
      ad.addEventListener('change', () => { karar.ad = ad.value; hesapla(); });
      const ozel = h('input', { type: 'checkbox', checked: Boolean(x.ortamaOzel), 'aria-label': `${x.senaryo}: ortama özel` });
      ozel.addEventListener('change', () => { karar.ortamaOzel = ozel.checked; hesapla(); });
      const ekle = h('input', { type: 'checkbox', checked: karar.ekle !== false, 'aria-label': `${x.senaryo}: yeni satır ekle` });
      ekle.addEventListener('change', () => { karar.ekle = ekle.checked; hesapla(); });
      return h('div', { class: 'kisi-yeni-satir' }, h('label', { class: 'secenek' }, ekle, 'Yeni satır ekle'), ad, h('label', { class: 'secenek' }, ozel, 'Ortama özel'));
    };
    function ciz() {
      const o = is.o;
      const parcalar = [h('h2', { id: 'kisi-baglama-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('kullanici')), 'Kişi alanlarını tabloya bağla'),
        h('p', { class: 'soluk kucuk' }, `${ekran.ad} ekranındaki kişi / kimlik alanları (kimlik no, doğum tarihi, telefon, e-posta, ad soyad…) bir kişi / kayıt tablosunun sütunlarına bağlanır; senaryolardaki düz değerler o tablonun satırına çevrilir. Eşlemeler öneridir: kontrol edip onaylayın. Değerler burada gösterilmez.`)];
      if (is.hata) parcalar.push(h('div', { class: 'not-kutusu hata', role: 'alert' }, is.hata));
      if (is.bekliyor) parcalar.push(h('p', { class: 'soluk kucuk', 'aria-live': 'polite' }, 'Hesaplanıyor…'));
      uygula.disabled = true;
      if (o && !o.alanlar.length) parcalar.push(h('div', { class: 'not-kutusu bilgi kucuk' }, 'Bu ekranda kişi / kimlik alanı bulunamadı.'));
      else if (o && !o.tabloId) {
        parcalar.push(h('div', { class: 'not-kutusu uyari kucuk' }, 'Bu alanlara uyan bir kişi / kayıt tablosu yok. Önce ', h('a', { href: '#/veri' }, 'Test verisi'),
          ' bölümünde bu türden sütunları olan bir tablo oluşturun (ör. Kimlik no, Telefon, E-posta).'));
      } else if (o) {
        const tabloSec = h('select', { 'aria-label': 'Kişi tablosu' }, o.tablolar.map((t) => h('option', { value: t.id, selected: t.id === o.tabloId }, `${t.ad} (${t.puan} alan türü uyuyor)`)));
        tabloSec.addEventListener('change', () => { is.tabloId = tabloSec.value; is.eslemeler = null; is.etiketler = null; is.yeniSatirlar = {}; hesapla(); });
        const etiketli = o.alanlar.some((a) => a.kisiEtiketi || a.onerilenEtiket);
        parcalar.push(h('label', { class: 'kisi-tablo-secimi' }, h('span', {}, 'Kişi tablosu'), tabloSec),
          h('h3', { class: 'kucuk-baslik' }, 'Sütun eşleme (öneri)'),
          h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Kişi alanı eşleme' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Alan'), h('th', {}, 'Tür'), h('th', {}, 'Tablo sütunu'), h('th', {}, 'Kişi etiketi'))),
            h('tbody', {}, o.alanlar.map((a) => {
              const sec = h('select', { 'aria-label': `${a.etiket} sütunu`, disabled: a.zatenBagli }, h('option', { value: '' }, '— bağlama —'),
                o.sutunlar.map((s) => h('option', { value: s.ad, selected: s.ad === a.sutun }, `${s.ad}${s.gizli ? ' (gizli)' : ''}`)));
              sec.addEventListener('change', () => { is.eslemeler = { ...(is.eslemeler || {}), [a.alanId]: sec.value }; hesapla(); });
              const not = a.zatenBagli ? 'zaten bağlı' : a.neden ? a.neden : a.onerilen && a.sutun === a.onerilen ? 'öneri — onaylayın' : '';
              // Kişi etiketi: aynı türden ikinci kişi ayrı satırdan gelsin diye (ör. "ödeyen"); boş = etiketsiz (ana kişi).
              const etiket = h('input', { type: 'text', maxlength: '40', value: a.kisiEtiketi || '', placeholder: 'etiketsiz', disabled: a.zatenBagli, 'aria-label': `${a.etiket} kişi etiketi` });
              etiket.addEventListener('change', () => { is.etiketler = { ...(is.etiketler || {}), [a.alanId]: etiket.value.trim() }; hesapla(); });
              return h('tr', {}, h('td', { 'data-baslik': 'Alan' }, a.etiket, a.hassas ? h('span', { class: 'neden' }, 'hassas alan') : null),
                h('td', { 'data-baslik': 'Tür' }, a.kategoriAdi),
                h('td', { 'data-baslik': 'Sütun' }, sec, not ? h('span', { class: 'neden' }, not) : null),
                h('td', { 'data-baslik': 'Kişi etiketi' }, etiket, a.onerilenEtiket && a.kisiEtiketi === a.onerilenEtiket ? h('span', { class: 'neden' }, 'ayrı kişi — öneri') : null));
            })))));
        if (etiketli) parcalar.push(h('p', { class: 'soluk kucuk' }, 'Etiketli alanlar ayrı bir kişidir: değerleri tablonun başka bir satırından gelir (başvuru: ${Tablo[etiket].Sütun}). Etiketi değiştirebilir ya da silebilirsiniz.'));
        if (o.kimlikAlanlari.length) parcalar.push(h('p', { class: 'soluk kucuk' }, `Bağlanmayan kimlik profili alanları: ${o.kimlikAlanlari.map((k) => k.etiket).join(', ')} — ${o.kimlikAlanlari[0].neden}.`));
        parcalar.push(h('h3', { class: 'kucuk-baslik' }, 'Senaryolar'),
          h('div', { class: 'donusum-ozeti' }, h('b', {}, `${o.ozet.eslesti} eşleşti`), h('span', {}, `${o.ozet.yeniSatir} yeni satır`), h('span', {}, `${o.ozet.atlandi} atlandı`)),
          o.senaryolar.length ? h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Kişi satırları' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Senaryo'), h('th', {}, 'Durum'), h('th', {}, 'Satır'))),
            h('tbody', {}, o.senaryolar.map((x) => {
              const yeni = x.durum === 'yeniSatir' || (x.durum === 'atlandi' && is.yeniSatirlar[x.anahtar] && is.yeniSatirlar[x.anahtar].ekle === false);
              return h('tr', { class: x.durum === 'atlandi' ? 'atlandi' : '' },
                h('td', { 'data-baslik': 'Senaryo' }, x.senaryo, x.kisiEtiketi ? rozet(x.kisiEtiketi, 'vurgu', { kisalt: true }) : null, h('span', { class: 'neden' }, x.ortamlar.join(', '))),
                h('td', { 'data-baslik': 'Durum' }, KISI_DURUMU[x.durum] || x.durum, x.neden ? h('span', { class: 'neden' }, x.neden) : null),
                h('td', { 'data-baslik': 'Satır' }, yeni ? yeniSatirHucresi(x) : x.satir ? x.satir : h('span', { class: 'soluk' }, '—')));
            })))) : h('p', { class: 'soluk kucuk' }, 'Senaryolarda bu alanların düz değeri yok.'));
        const cevrilecek = o.donusum.filter((x) => x.durum === 'cevrilecek');
        const atlanan = o.donusum.filter((x) => x.durum === 'atlandi');
        parcalar.push(h('h3', { class: 'kucuk-baslik' }, 'Kuru doğrulama'),
          h('p', { class: 'kucuk' }, `${cevrilecek.length} alan değeri tabloya çevrilecek: koşuda ekrana giden değer her ortamda aynı kalıyor.${atlanan.length ? ` ${atlanan.length} alan atlanacak:` : ''}`),
          atlanan.length ? h('ul', { class: 'etki-ozeti' }, atlanan.map((x) => h('li', {}, `${x.senaryo} · ${x.alanEtiketi}: ${x.neden || 'atlandı'}`))) : null,
          h('p', { class: 'soluk kucuk' }, 'Onaylayınca bağlar, yeni satırlar ve senaryolar tek işlemde yazılır; her senaryonun önceki hâli değişiklik geçmişinde kalır.'));
        uygula.disabled = is.bekliyor || (!cevrilecek.length && !o.alanlar.some((a) => a.sutun && !a.zatenBagli));
      }
      yerlestir(govde, parcalar);
    }
    uygula.addEventListener('click', async () => {
      const o = is.o;
      if (!o) return;
      const tamam = await onayIste({ baslik: 'Kişi alanları tabloya bağlansın mı?', ikonAd: 'kullanici', dugme: 'Bağla ve çevir',
        metin: `"${o.tabloAdi}" tablosuna ${o.alanlar.filter((a) => a.sutun && !a.zatenBagli).length} alan bağlanır, ${o.ozet.yeniSatir} yeni satır eklenir, ${o.donusum.filter((x) => x.durum === 'cevrilecek').length} senaryo değeri tabloya çevrilir.` });
      if (!tamam) return;
      try {
        const r = await mesgulIken(uygula, 'Uygulanıyor…', () => api('/platform/ekran/kisi-baglama', { govde: { ...girdi(), onay: true } }));
        uygulandi = true;
        bildir(`${r.baglanan} alan bağlandı, ${r.eklenenSatir} satır eklendi; ${r.guncellenenSenaryo} senaryoda ${r.cevrilenAlan} değer tabloya çevrildi.`);
        diyalog.close();
      } catch (e) { bildir(e.message, 'hata'); }
    });
    kapat.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(uygulandi); });
    document.body.append(diyalog);
    diyalog.showModal();
    dugme.blur();
    hesapla();
  });
}
