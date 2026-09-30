// "Senaryo önerileri" (senaryo tasarım yardımcısı; Senaryolar > ekran > "Senaryo önerileri"). Öneriler tarayıcıda saf fonksiyonla
// üretilir (senaryo-onerileri.mjs; kural tabanlı, yapay zekâ yok): az sayıda, GEREKÇELİ öneri — önce risk (geçmiş hata, test
// edilmemiş uyarı), sonra hiç denenmemiş koşul dalı, pairwise eksikleri, sınır değerleri, zorunlu alan boş. Sayfanın başında KAPSAM
// göstergesi (alanlar, koşul dalları, ikililer, görülen uyarılar; tıklayınca eksikler). Öneri YALNIZCA öneridir: kullanıcı işaretleyip
// "Senaryo olarak ekle" demeden senaryo oluşmaz; eklenenler tek doğrulayıcıdan geçer ve "Koşuda" KAPALI gelir. "Reddet" (neden isteğe
// bağlı: gereksiz / yanlış / sonra) kararı kaydedilir; kabul ve redler sonraki önerilerin puanını etkiler. "Önizle": öneri, senaryo
// formunda doldurulmuş hâliyle açılır (kaydedilmez).
// Adres: #/senaryolar/oneriler/<ekranId>. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, yerlestir } from './ortak.js';
import { formSemasiOlustur } from './model-formu.mjs';
import { gorunurlukleriHesapla, hatalariMetneCevir, senaryoyuDogrula } from './senaryo-dogrulayici.mjs';
import { degerBasvurusuYaz } from './tablo-secimi.mjs';
import { gizliAdMi } from './gizli-adlar.mjs';
import { KOMBINASYON_ALAN_SINIRI, ONERI_UST_SINIRI, senaryoOnerileri } from './senaryo-onerileri.mjs';
import { senaryoFormu } from './senaryo-formu.js';

const TUR_ETIKETLERI = { zorunlu: 'Zorunlu alan', sinir: 'Sınır değeri', kosullu: 'Koşul dalı', kombinasyon: 'İkili kombinasyon', uyari: 'İş kuralı uyarısı' };
const NEDEN_ETIKETLERI = {
  risk: ['Risk', 'hata'], kapsam: ['Kapsam boşluğu', 'vurgu'], pairwise: ['Pairwise', 'vurgu'], sinir: ['Sınır', 'atlanan'], zorunlu: ['Zorunlu', 'atlanan']
};
const RED_SECENEKLERI = [['gereksiz', 'Gereksiz'], ['yanlis', 'Yanlış'], ['sonra', 'Sonra']];
const OLCULER = [
  ['alanlar', 'Alanlar', 'Senaryolarda değer verilmiş ekran alanları'],
  ['dallar', 'Koşul dalları', 'Görünürlüğü ya da listesi değişen dallar (denk dallar bir sayılır)'],
  ['ikililer', 'İkili kombinasyonlar', 'Seçili alanların birlikte denenen değer ikilileri'],
  ['uyarilar', 'Görülen uyarılar', 'Koşularda görülen iş kuralı uyarılarından beklenen sonuç olarak test edilenler']
];
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/** Önizlemeden dönünce korunan durum (ekran başına). */
const durum = {
  ekranId: '', akisId: '', kombinasyon: /** @type {string[] | null} */ (null), secim: new Set(), ustSinir: ONERI_UST_SINIRI, acikOlcu: '',
  reddedilenleriGoster: false, redAcik: ''
};

/**
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; ortam: { id: string; ad: string }; ortamlar: Array<{ id: string; ad: string }>;
 *   ekranId: string; ekranAdi: string | null; geri: () => void }} s
 */
export async function senaryoOnerileriEkrani(icerik, s) {
  if (durum.ekranId !== s.ekranId) {
    Object.assign(durum, { ekranId: s.ekranId, akisId: '', kombinasyon: null, secim: new Set(), ustSinir: ONERI_UST_SINIRI, acikOlcu: '', reddedilenleriGoster: false, redAcik: '' });
  }
  yerlestir(icerik, iskelet('sayfa'));
  const baglamAdresi = (akisId) => `/platform/senaryo/oneri-baglami?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(s.ekranId)}&ortamId=${encodeURIComponent(s.ortam.id)}${akisId ? `&akisId=${encodeURIComponent(akisId)}` : ''}`;
  let baglam;
  let ekGizliAdlar = [];
  try {
    [baglam, ekGizliAdlar] = await Promise.all([
      api(baglamAdresi(durum.akisId)),
      api('/platform/maskeleme').then((m) => m.ekAdlar || []).catch(() => [])
    ]);
  } catch (hata) {
    if (hata && hata.durum === 423) return;
    yerlestir(icerik, baslik(s, null), hataKutusu(hata));
    return;
  }
  if (!baglam.model) {
    yerlestir(icerik, baslik(s, null), bosDurum('Bu ekranın modeli yok.', 'Öneriler ekran modelinden üretilir; önce Ekranlar\'dan model ekleyin.', { ikon: 'katman' }));
    return;
  }
  durum.akisId = baglam.akisId || '';
  const sema = formSemasiOlustur(baglam.model, baglam.altModeller);
  const dogrulamaBaglami = { model: baglam.model, altModeller: baglam.altModeller, kaynak: 'kayit' };
  // Değer üretilmeyen (kişisel / gizli) alanlar bağlı tablonun başvurusuyla dolar (koşuda seçilen satırdan gelir).
  const tabloBasvurulari = {};
  for (const l of baglam.degerListeleri || []) {
    if (l.baglanti && l.hedef && l.hedef.alan && !tabloBasvurulari[l.hedef.alan]) tabloBasvurulari[l.hedef.alan] = degerBasvurusuYaz(l.baglanti.tablo, l.baglanti.sutun, l.baglanti.etiket || '');
  }
  // Kayıt tablosuna bağlı alanlar (Hazır / Yeni kayıt grubu) öneride değiştirilmez; tabandaki satır seçimi korunur.
  const haricAlanlar = Object.keys(baglam.kayitBaglari || {});
  const uret = () => senaryoOnerileri({
    model: baglam.model, sema, senaryolar: baglam.senaryolar, kapsamSenaryolari: baglam.kapsamSenaryolari || [], tabloBasvurulari, haricAlanlar,
    kombinasyonAlanlari: durum.kombinasyon, gecmis: baglam.gecmis, kararlar: baglam.kararlar || [], ekranId: s.ekranId,
    reddedilenleriGoster: durum.reddedilenleriGoster, ustSinir: durum.ustSinir,
    gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, dogrulamaBaglami),
    dogrula: (veri) => senaryoyuDogrula(veri, dogrulamaBaglami),
    gizliAdMi: (ad) => gizliAdMi(ad, ekGizliAdlar)
  });
  let sonuc = uret();

  const govde = h('div', { class: 'oneri-govdesi' });
  const secimSayisi = h('span', { class: 'oneri-secim-sayisi', 'aria-live': 'polite' });
  const ekleDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('artiYalin'), 'Senaryo olarak ekle');
  const sonucAlani = h('div', { 'aria-live': 'polite' });
  const cubuk = h('div', { class: 'oneri-eylem-cubugu', role: 'region', 'aria-label': 'Seçilen öneriler' },
    h('div', { class: 'oneri-cubuk-metni' }, secimSayisi,
      h('span', { class: 'kucuk soluk' }, ikon('isaret'), 'Eklenenler "Toplu koşuya dahil" KAPALI gelir; gözden geçirip açın.')),
    ekleDugmesi);

  const akisSecimi = (baglam.akislar || []).length > 1
    ? h('select', { 'aria-label': 'Akış', onchange: (o) => { durum.akisId = o.currentTarget.value; durum.secim = new Set(); senaryoOnerileriEkrani(icerik, s); } },
      baglam.akislar.map((a) => h('option', { value: a.id, selected: a.id === baglam.akisId }, a.ad)))
    : null;
  // Temel alınan senaryo listenin üstünde BİR KEZ; öneri satırlarında yalnız fark ("E-posta: boş", "Yaş: 17").
  const tabanNotu = h('p', { class: 'oneri-tabani', role: 'note' });

  /** Seçimi güncel önerilere indirger (artık üretilmeyen öneriler seçimden çıkar). */
  function secimiDuzelt() {
    const gecerli = new Set(sonuc.oneriler.map((o) => o.kimlik));
    for (const k of [...durum.secim]) if (!gecerli.has(k)) durum.secim.delete(k);
    secimSayisi.textContent = durum.secim.size ? `${durum.secim.size} öneri seçili` : 'Öneri seçilmedi';
    ekleDugmesi.disabled = !durum.secim.size;
  }

  function kapsamPaneli() {
    const k = sonuc.kapsam;
    const acik = OLCULER.find(([ad]) => ad === durum.acikOlcu);
    const olcuDugmesi = ([ad, etiket, aciklama]) => {
      const o = k[ad];
      // Verisiz ölçüde ('—') çubuk boş kalır; genişlik CSS değişkeniyle (CSP: satır içi style özniteliği yok).
      const oran = o.toplam ? Math.round((o.kapsanan / o.toplam) * 100) : 0;
      return h('button', {
        type: 'button', class: `kapsam-olcusu${durum.acikOlcu === ad ? ' acik' : ''}`, 'aria-expanded': String(durum.acikOlcu === ad),
        'aria-controls': 'kapsam-eksikleri', title: aciklama, 'data-olcu': ad,
        onclick: () => { durum.acikOlcu = durum.acikOlcu === ad ? '' : ad; ciz(); }
      },
      h('span', { class: 'kapsam-adi' }, etiket),
      h('b', { class: 'kapsam-degeri' }, o.toplam ? `${o.kapsanan} / ${o.toplam}` : '—'),
      h('span', { class: `kapsam-cubugu${o.toplam ? '' : ' bos'}`, 'aria-hidden': 'true' }, h('span', { style: { '--oran': `${oran}%` } })));
    };
    return h('section', { class: 'kart kapsam-paneli', 'aria-labelledby': 'kapsam-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'kapsam-baslik' }, ikon('hedef'), 'Kapsam'),
        h('span', { class: 'alt' }, 'Mevcut senaryolar (tüm akışlar, veri güdümlü satırlar dahil); eksikleri görmek için tıklayın')),
      h('div', { class: 'kapsam-olculeri' }, OLCULER.map(olcuDugmesi)),
      acik ? h('div', { id: 'kapsam-eksikleri', class: 'kapsam-eksikleri' },
        h('p', { class: 'kucuk soluk' }, `${acik[1]}: eksikler${k[acik[0]].eksikler.length < k[acik[0]].toplam - k[acik[0]].kapsanan ? ` (ilk ${k[acik[0]].eksikler.length})` : ''}`),
        k[acik[0]].eksikler.length
          ? h('ul', { 'aria-label': `${acik[1]}: eksikler` }, k[acik[0]].eksikler.map((e) => h('li', {}, e)))
          : h('p', { class: 'kucuk' }, k[acik[0]].toplam ? 'Eksik yok.' : 'Bu ölçü için veri yok.')) : null);
  }

  function kombinasyonKarti() {
    const k = sonuc.kombinasyon;
    const secili = new Set(k.secili);
    const kutular = k.secilebilir.map((a) => h('label', { class: 'kombinasyon-alani' },
      h('input', {
        type: 'checkbox', checked: secili.has(a.id), disabled: !secili.has(a.id) && secili.size >= KOMBINASYON_ALAN_SINIRI,
        onchange: (o) => {
          const yeni = o.currentTarget.checked ? [...k.secili, a.id] : k.secili.filter((x) => x !== a.id);
          durum.kombinasyon = yeni;
          yenidenUret();
        }
      }), h('span', {}, a.etiket), h('small', { class: 'cok-soluk' }, `${a.secenekSayisi} değer`)));
    const ozet = k.secili.length < 2
      ? 'İkili kombinasyon için en az 2 alan işaretleyin.'
      : `${k.evren} ikili: ${k.kapsanan} mevcut senaryolarda denenmiş; ${k.eksik} eksik ikili ${k.satir} ek senaryoyla kapanır${k.gecersiz ? ` (${k.gecersiz} ikili koşullar gereği kurulamaz)` : ''}.`;
    return h('section', { class: 'kart kombinasyon-karti', 'aria-labelledby': 'kombinasyon-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'kombinasyon-baslik' }, ikon('izgara'), 'İkili kombinasyon alanları'),
        durum.kombinasyon ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { durum.kombinasyon = null; yenidenUret(); } }, 'Varsayılana dön') : null),
      h('p', { class: 'kucuk soluk' }, `Pairwise: her iki alanın her değer ikilisi en az bir senaryoda denensin (tüm kombinasyonlar değil). Varsayılan: koşul yöneten ve seçenekli alanlar; kişisel alanlar hariç. En çok ${KOMBINASYON_ALAN_SINIRI} alan.`),
      k.secilebilir.length
        ? h('div', { class: 'kombinasyon-alanlari', role: 'group', 'aria-label': 'Kombinasyon alanları' }, kutular)
        : h('p', { class: 'kucuk soluk' }, 'Bu ekranda kombinasyona uygun (seçenekli, kişisel olmayan) alan yok.'),
      h('p', { class: 'kucuk soluk kombinasyon-ozeti' }, ozet));
  }

  async function karar(o, kararTuru, redNedeni = null) {
    const govdesi = { projeId: s.proje.id, ekranId: s.ekranId, kimlik: o.kimlik, tur: o.tur, neden: o.neden, alanlar: o.alanlar, karar: kararTuru, ...(redNedeni ? { redNedeni } : {}) };
    const y = await api('/platform/senaryo/oneri-karari', { govde: govdesi });
    baglam.kararlar = [...(baglam.kararlar || []), y.karar];
  }

  function redPaneli(o) {
    const reddet = async (neden, dugme) => {
      await mesgulIken(dugme, 'Kaydediliyor…', async () => {
        try {
          await karar(o, 'red', neden);
          durum.redAcik = '';
          durum.secim.delete(o.kimlik);
          bildir(neden === 'sonra' ? 'Öneri bir hafta gizlendi.' : 'Öneri reddedildi; benzerleri daha geride sıralanır.');
          yenidenUret();
        } catch (hata) {
          if (hata && hata.durum === 423) return;
          bildir(hata.message || String(hata), 'hata');
        }
      });
    };
    return h('div', { class: 'oneri-red-paneli', role: 'group', 'aria-label': `${o.baslik}: red nedeni` },
      h('span', { class: 'kucuk soluk' }, 'Neden (isteğe bağlı):'),
      ...RED_SECENEKLERI.map(([deger, etiket]) => h('button', { type: 'button', class: 'kucuk-dugme', onclick: (e) => reddet(deger, e.currentTarget) }, etiket)),
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: (e) => reddet(null, e.currentTarget) }, 'Nedensiz reddet'),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { durum.redAcik = ''; ciz(); } }, 'Vazgeç'));
  }

  function oneriSatiri(o) {
    const kutu = h('input', {
      type: 'checkbox', checked: durum.secim.has(o.kimlik), 'aria-label': `${o.baslik}: seç`,
      onchange: (e) => { if (e.currentTarget.checked) durum.secim.add(o.kimlik); else durum.secim.delete(o.kimlik); secimiDuzelt(); }
    });
    const [nedenEtiketi, nedenTuru] = NEDEN_ETIKETLERI[o.neden] || [o.neden, ''];
    const beklenenRozet = rozet(o.beklenenMetni, o.beklenen.tur === 'basari' ? 'basari' : o.beklenen.tur === 'hata' ? 'hata' : 'atlanan',
      o.beklenen.tur === 'belirsiz' ? { title: o.beklenen.neden } : {});
    return h('li', { class: `oneri${o.reddedildi ? ' reddedildi' : ''}`, 'data-oneri': o.kimlik, 'data-puan': String(o.puan), 'data-neden': o.neden },
      kutu,
      h('div', { class: 'oneri-icerigi' },
        h('p', { class: 'oneri-gerekcesi' }, o.gerekce),
        h('div', { class: 'oneri-ust' }, h('span', { class: 'oneri-basligi' }, o.baslik),
          h('span', { class: 'oneri-rozetleri' }, rozet(TUR_ETIKETLERI[o.tur] || o.tur, 'tur-rozeti'), rozet(nedenEtiketi, nedenTuru), beklenenRozet,
            o.eksikler.length ? rozet('değer eksik', 'atlanan', { title: `Değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')}` }) : null,
            o.reddedildi ? rozet('reddedildi', 'atlanan') : null)),
        // Sıralama puanı kullanıcıya gösterilmez (anlamsız sayı); liste zaten önem sırasındadır (data-puan yalnız iz için).
        // Yalnız fark: değişen alanlar (boş / seçilen / sınır değeri).
        (o.degisiklikler || []).length
          ? h('ul', { class: 'oneri-farklari', 'aria-label': `${o.baslik}: farklar` }, o.degisiklikler.map((d) => h('li', {},
            h('b', {}, `${d.etiket}: `), d.deger === '(boş)' ? 'boş' : d.deger)))
          : null,
        h('p', { class: 'oneri-ozeti kucuk soluk' }, o.ozet),
        o.eksikler.length ? h('p', { class: 'kucuk cok-soluk' }, `Değeri olmayan zorunlu alanlar (Önizle ile açıp "Doldur" ile tablodan seçin): ${o.eksikler.join(', ')}`) : null,
        o.engel ? h('p', { class: 'kucuk cok-soluk' }, o.engel) : null,
        o.beklenen.tur === 'belirsiz' ? h('p', { class: 'kucuk cok-soluk' }, o.beklenen.neden) : null,
        durum.redAcik === o.kimlik ? redPaneli(o) : null),
      h('div', { class: 'oneri-eylemleri' },
        h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.baslik}: önizle`, onclick: () => onizle(o) }, ikon('goz'), 'Önizle'),
        o.reddedildi ? null : h('button', {
          type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${o.baslik}: reddet`, 'aria-expanded': String(durum.redAcik === o.kimlik),
          onclick: () => { durum.redAcik = durum.redAcik === o.kimlik ? '' : o.kimlik; ciz(); }
        }, ikon('carpi'), 'Reddet')));
  }

  function oneriListesi() {
    const e = sonuc.elenen;
    const elenenMetni = [
      e.kapsanan ? `${e.kapsanan} öneri mevcut senaryolarca zaten denendiği` : null,
      e.denklik ? `${e.denklik} öneri başka bir öneriyle denk olduğu` : null
    ].filter(Boolean);
    const gizli = e.reddedilen + e.ertelenen;
    return h('section', { class: 'kart oneri-grubu', 'aria-labelledby': 'oneri-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'oneri-baslik' }, ikon('yildiz'), 'Öneriler', rozet(String(sonuc.toplam), 'vurgu')),
        h('span', { class: 'alt' }, 'Sıra: risk › denenmemiş koşul dalı › eksik ikililer › sınır değerleri › zorunlu alan boş')),
      elenenMetni.length ? h('p', { class: 'kucuk soluk oneri-elenen' }, `${elenenMetni.join(', ')} için gösterilmedi.`) : null,
      gizli || durum.reddedilenleriGoster
        ? h('p', { class: 'kucuk soluk oneri-elenen' }, gizli ? `${e.reddedilen} öneri reddedildi, ${e.ertelenen} öneri ertelendi. ` : '',
          h('button', { type: 'button', class: 'baglanti-dugmesi', onclick: () => { durum.reddedilenleriGoster = !durum.reddedilenleriGoster; yenidenUret(); } },
            durum.reddedilenleriGoster ? 'Reddedilenleri gizle' : 'Reddedilenleri göster'))
        : null,
      sonuc.oneriler.length
        ? h('ul', { class: 'oneri-listesi', 'aria-label': 'Öneriler' }, sonuc.oneriler.map(oneriSatiri))
        : h('p', { class: 'kucuk' }, 'Yeni bir şey kapsayan öneri yok: mevcut senaryolar bu kuralların kapsadığı her şeyi deniyor.'),
      sonuc.kalan
        ? h('button', { type: 'button', class: 'kucuk-dugme daha-fazla', onclick: () => { durum.ustSinir += ONERI_UST_SINIRI; yenidenUret(); } },
          `Daha fazla göster (${sonuc.kalan})`)
        : null);
  }

  function notlarKutusu() {
    const liste = sonuc.notlar.filter((n) => n.tur !== 'taban' && n.tur !== 'elenen');
    if (!liste.length) return null;
    return h('details', { class: 'oneri-notlari-kutusu' }, h('summary', {}, `Bilgi notları (${liste.length})`),
      h('ul', { class: 'oneri-notlari', 'aria-label': 'Bilgi notları' }, liste.map((n) => h('li', {}, ikon('isaret'), h('span', {}, n.mesaj)))));
  }

  function ciz() {
    yerlestir(tabanNotu, ikon('katman'), h('span', {}, sonuc.taban.kaynak === 'senaryo' ? `Taban: “${sonuc.taban.baslik}”` : 'Taban: modelin varsayılanları'),
      h('span', { class: 'kucuk soluk' }, ' — öneriler bu değerlerle başlar; satırlarda yalnız farklar yazılır.'));
    yerlestir(govde,
      ...sonuc.notlar.filter((n) => n.tur === 'taban').map((n) => h('div', { class: 'not-kutusu uyari', role: 'note' }, n.mesaj)),
      kapsamPaneli(), oneriListesi(), kombinasyonKarti(), notlarKutusu());
    secimiDuzelt();
  }
  function yenidenUret() {
    sonuc = uret();
    ciz();
  }

  function onizle(o) {
    senaryoFormu(icerik, {
      mod: 'yeni', proje: s.proje, ortam: s.ortam, ortamlar: s.ortamlar, ekranId: s.ekranId, ekranAdi: s.ekranAdi, senaryoId: null, akisId: baglam.akisId,
      taslak: { veri: o.veri, baslik: o.baslik, ortamlar: [s.ortam.id], kosuyaDahil: false, mutlaka: [], tabloSecimleri: o.tabloSecimleri || {}, oneri: { tur: o.tur, beklenen: o.beklenenMetni } },
      geri: () => senaryoOnerileriEkrani(icerik, s)
    });
  }

  ekleDugmesi.addEventListener('click', async () => {
    const secilenler = sonuc.oneriler.filter((o) => durum.secim.has(o.kimlik));
    if (!secilenler.length) return;
    const eklenen = [];
    const atlanan = [];
    await mesgulIken(ekleDugmesi, 'Ekleniyor…', async () => {
      for (const o of secilenler) {
        if (o.beklenen.tur === 'belirsiz') { atlanan.push([o.baslik, 'beklenen sonucu siz seçin (Önizle ile açıp seçin)']); continue; }
        if (o.eksikler.length) { atlanan.push([o.baslik, `değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')} (Önizle ile açıp "Doldur" ile tablodan seçin)`]); continue; }
        if (o.engel) { atlanan.push([o.baslik, `${o.engel} (Önizle ile açın)`]); continue; }
        const d = senaryoyuDogrula(o.veri, dogrulamaBaglami);
        if (d.hatalar.length) { atlanan.push([o.baslik, hatalariMetneCevir(d.hatalar)]); continue; }
        try {
          await api('/platform/senaryo/kaydet', {
            govde: {
              ekranId: s.ekranId, projeId: s.proje.id, baslik: o.baslik, veri: o.veri, ortamIdleri: [s.ortam.id], kosuyaDahil: false, mutlakaGorunmeli: [],
              ...(baglam.akisId ? { akisId: baglam.akisId } : {}), ...(o.tabloSecimleri ? { tabloSecimleri: o.tabloSecimleri } : {})
            }
          });
          eklenen.push(o.baslik);
          durum.secim.delete(o.kimlik);
          // Kabul kararı (öğrenme); kaydedilemese de senaryo eklenmiştir.
          try { await karar(o, 'kabul'); } catch { /* karar kaydı isteğe bağlı */ }
        } catch (hata) {
          if (hata && hata.durum === 423) return;
          atlanan.push([o.baslik, hata.message || String(hata)]);
        }
      }
    });
    if (eklenen.length) bildir(`${eklenen.length} senaryo eklendi ("Toplu koşuya dahil" kapalı).`);
    // Liste yeniden okunur: eklenenler artık kapsamda (öneri olarak çıkmaz).
    try {
      const yeni = await api(baglamAdresi(baglam.akisId));
      baglam = { ...baglam, senaryolar: yeni.senaryolar, kapsamSenaryolari: yeni.kapsamSenaryolari, kararlar: yeni.kararlar };
    } catch { /* liste eski kalır */ }
    yenidenUret();
    yerlestir(sonucAlani, h('div', { class: `not-kutusu ${atlanan.length ? 'uyari' : 'basari'}`, role: 'status' },
      h('p', {}, eklenen.length ? `${eklenen.length} senaryo eklendi; "Toplu koşuya dahil" kapalı — Senaryolar listesinden gözden geçirip açın.` : 'Hiç senaryo eklenmedi.'),
      atlanan.length ? h('ul', { 'aria-label': 'Eklenmeyen öneriler' }, atlanan.map(([b, neden]) => h('li', {}, h('b', {}, b), `: ${neden}`))) : null));
  });

  yerlestir(icerik,
    baslik(s, [h('span', {}, ikon('ag'), `Ortam: ${s.ortam.ad}`), akisSecimi ? h('label', { class: 'akis-secimi' }, 'Akış', akisSecimi) : null]),
    h('div', { class: 'not-kutusu bilgi oneri-bilgisi', role: 'note' },
      h('p', {}, h('b', {}, 'Öneriler yalnızca öneridir. '), 'Siz işaretleyip "Senaryo olarak ekle" demeden hiçbir senaryo oluşmaz; eklenenler kurallardan geçer.'),
      h('p', { class: 'kucuk' }, 'Her önerinin gerekçesi yazar; mevcut senaryoların zaten denediği şey önerilmez. Kişisel / gizli alanlarda değer üretilmez. Beklenen sonuç belli değilse "Beklenen sonucu siz seçin" yazar.')),
    sonucAlani, tabanNotu, govde, cubuk);
  ciz();
}

function baslik(s, meta) {
  return h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/senaryolar' }, 'Senaryolar'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(s.ekranId)}` }, s.ekranAdi || 'Ekran'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Senaryo önerileri')),
      h('h2', { tabindex: '-1' }, 'Senaryo önerileri'),
      meta ? h('div', { class: 'meta' }, meta) : null),
    h('div', { class: 'eylemler' }, h('button', { type: 'button', class: 'hayalet', onclick: s.geri }, ikon('geri'), 'Senaryolara dön')));
}
