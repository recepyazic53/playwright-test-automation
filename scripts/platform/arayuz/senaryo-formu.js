// Senaryo oluşturma / düzenleme — MODEL TABANLI form (genel).
// Form, ekranın modelinden çizilir (model-formu.mjs: adımlar akış sırasıyla, bölümler, alan tipleri,
// seçenekler, bağımlı seçenekler, görünürlük koşulları, zorunluluk, isteğe bağlı adımlar = "adım
// kapsamı", beklenen sonuç varyantları, profil havuzları). Görünürlük ve doğrulama TEK doğrulayıcıyla
// (senaryo-dogrulayici.mjs — sunucu ve testler de aynısını kullanır) yapılır; hatalar alanların altında.
// Kayıt veritabanına yazılır (POST /platform/senaryo/kaydet; değişiklik geçmişiyle). "Dene", taslağı
// kaydetmeden geçici bir deneme senaryosu olarak koşar (POST /platform/senaryo/dene).
// Modeli olmayan ekranlarda yalnızca özet + başlık + Koşuda düzenlenir.
// "Akış diyagramı" sekmesi: formdaki güncel seçimlerle akış + seçili ortamdaki son koşunun adım renkleri
// (senaryo-diyagrami.js). Diyagramdan SENARYO düzeyi düzenlenir (aşama 3b): kutu seçilince formun kendi bileşenleri (adımın
// alanları, senaryo kartı / giriş, beklenen sonuç kartı) kutunun altındaki düzenleme alanına TAŞINIR — tek taslak, tek doğrulama,
// kaydetme formun "Kaydet"iyle; Form sekmesine dönünce yerlerine geri konur. İsteğe bağlı adımın "dahil" anahtarı, "Burada hata
// beklenir" ve kutulardaki hata rozetleri de aynı değerleri yazar/okur. Akış yapısı buradan değişmez. Kayıt paneli (sağ sütun) iki
// sekmede de görünür.
// Çoklu akış: ekranın birden çok akışı varsa senaryo kartında "Akış" seçilir (yeni senaryoda varsayılan akış önde); akış
// değişince form o akışın modeliyle yeniden çizilir, girilen değerler korunur (yeni akışta olmayanlar uyarıyla kaldırılır).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, yerlestir, bildir, boyutMetni, degisiklikleriBirak, h, ikon, iskelet, oneriListesi, rozet, TOKEN } from './ortak.js';
import { dosyaOnDenetimi, dosyaReferansiCoz, dosyaYukle, kabulListesi } from './dosya-yukleme.js';
import {
  beklenenHataOnerisi, formDegerleriniKur, formSemasiOlustur, hatalariDagit, kimlikAnahtariBul, kimlikTuruBul, profilHavuzuBul,
  secenekleriBul, senaryoNesnesiOlustur, tumFormAlanlari
} from './model-formu.mjs';
import { gorunurlukleriHesapla, senaryoyuDogrula, tabloBasvurusuCoz } from './senaryo-dogrulayici.mjs';
import { degerBasvurusuYaz, grupAnahtari, sutunSecenekleri, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';
import { onayIste } from './kosu-paneli.js';
import { GIRIS_DUGUMU, SONUC_DUGUMU, adimDugumu, akisDiyagrami, hataDugumleri } from './akis-diyagrami.mjs';
import { birlesikDegerler, eslesenListeler } from './parametre-tanimlari.mjs';
import { akisDiyagramiCiz } from './senaryo-diyagrami.js';

const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const kimlikUret = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
let kimlikSayaci = 0;
const yeniId = (on) => `sf-${on}-${++kimlikSayaci}`;
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/**
 * @param {HTMLElement} icerik
 * @param {{ mod: 'yeni' | 'duzenle'; proje: { id: string; ad: string }; ortam: { id: string; ad: string; varsayilan?: boolean };
 *   ortamlar: Array<{ id: string; ad: string; varsayilan?: boolean }>; ekranId: string | null; senaryoId: string | null; ekranAdi: string | null; geri: () => void }} s
 */
export async function senaryoFormu(icerik, s) {
  yerlestir(icerik, iskelet('sayfa'));
  try {
    let senaryo = null;
    let dosyaBilgileri = {};
    if (s.mod === 'duzenle') {
      ({ senaryo, dosyalar: dosyaBilgileri = {} } = await api(`/platform/senaryo?id=${encodeURIComponent(s.senaryoId || '')}&ortamId=${encodeURIComponent(s.ortam.id)}`));
    }
    const ekranId = s.ekranId || senaryo?.ekranId || null;
    const akisId = s.akisId || senaryo?.akis || '';
    const baglam = ekranId
      ? await api(`/platform/senaryo/form?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(ekranId)}&ortamId=${encodeURIComponent(s.ortam.id)}${akisId ? `&akisId=${encodeURIComponent(akisId)}` : ''}`)
      : null;
    if (!baglam || !baglam.model) {
      if (s.mod === 'yeni') {
        yerlestir(icerik, sayfaBasligi(s, 'Yeni senaryo', null), hataKutusu(new Error('Bu ekranın modeli (ya da senaryo veri kaynağı) yok; yeni senaryo yalnızca ekran modeli olan ekranlarda oluşturulabilir.')));
        return;
      }
      ozetDuzenleyici(icerik, s, senaryo, baglam);
      return;
    }
    if (s.mod === 'yeni' && !baglam.olusturulabilir) {
      yerlestir(icerik, sayfaBasligi(s, 'Yeni senaryo', null), hataKutusu(new Error('Bu ekran için senaryo verisi kaynağı bilinmiyor; yeni senaryo oluşturulamaz.')));
      return;
    }
    modelFormu(icerik, s, senaryo, { ...baglam, dosyaBilgileri });
  } catch (hata) {
    if (hata && hata.durum === 423) return;
    yerlestir(icerik, sayfaBasligi(s, s.mod === 'yeni' ? 'Yeni senaryo' : 'Senaryoyu düzenle', null), hataKutusu(hata));
  }
}

function sayfaBasligi(s, baslik, meta, ...eylemler) {
  return h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/senaryolar' }, 'Senaryolar'),
        s.ekranAdi ? [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(s.ekranId || '')}` }, s.ekranAdi)] : null,
        h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, s.mod === 'yeni' ? 'Yeni senaryo' : 'Düzenle')),
      h('h2', { tabindex: '-1' }, baslik),
      meta ? h('div', { class: 'meta' }, meta) : null),
    h('div', { class: 'eylemler' }, ...eylemler));
}

// ---------------------------------------------------------------------------------------
// Modelsiz senaryo: özet + başlık + Koşuda
// ---------------------------------------------------------------------------------------

function ozetDuzenleyici(icerik, s, senaryo, baglam) {
  const baslik = h('input', { type: 'text', value: senaryo.baslik, maxlength: '300', autocomplete: 'off', id: yeniId('baslik') });
  const baslikHata = h('div', { class: 'alan-hatasi', role: 'alert', id: `${baslik.id}-hata` });
  baslik.setAttribute('aria-describedby', `${baslik.id}-hata`);
  const kosuda = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: senaryo.kosuyaDahil, id: yeniId('kosuda') });
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, ikon('onay'), 'Kaydet');
  const form = h('form', { class: 'kart form-paneli model-yok-karti', novalidate: true },
    h('h3', {}, 'Senaryo özeti'),
    h('div', { class: 'not-kutusu bilgi' },
      h('p', {}, 'Bu ekranın ekran modeli yok. Başlık ve Koşuda ayarı düzenlenebilir; alanların tam düzenlenmesi için ekran modeli gerekir.'),
      h('p', { class: 'kucuk' }, 'Ekranın modelini Ekranlar > ekran > "Paket yükle" ya da "Ekranı tara" ile ekleyin.')),
    h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: baslik.id }, 'Başlık', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), baslik, baslikHata),
    h('label', { class: 'onay-satiri', for: kosuda.id }, kosuda, 'Koşuda (Koşuyu başlat bu senaryoyu koşar)'),
    h('dl', { class: 'ozet-satirlari' },
      h('dt', {}, 'Ekran'), h('dd', {}, baglam?.ekran?.ad || s.ekranAdi || '—'),
      h('dt', {}, 'Kimlik'), h('dd', { class: 'mono cok-soluk' }, senaryo.id),
      senaryo.veri ? [h('dt', {}, 'Veri alanları'), h('dd', {}, Object.keys(senaryo.veri).join(', '))] : null),
    h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', class: 'hayalet', onclick: s.geri }, 'Vazgeç')));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    baslikHata.textContent = '';
    if (!baslik.value.trim()) { baslikHata.textContent = 'Başlık zorunludur.'; baslik.focus(); return; }
    kaydet.disabled = true;
    try {
      await api('/platform/senaryo/kaydet', { govde: { id: senaryo.id, projeId: s.proje.id, baslik: baslik.value, kosuyaDahil: kosuda.checked } });
      bildir('Senaryo kaydedildi.');
      s.geri();
    } catch (e) {
      baslikHata.textContent = e.message;
    } finally { kaydet.disabled = false; }
  });
  yerlestir(icerik, sayfaBasligi(s, senaryo.baslik, [h('span', {}, ikon('ekran'), baglam?.ekran?.ad || s.ekranAdi || 'Ekran yok')]), form);
}

// ---------------------------------------------------------------------------------------
// Model tabanlı form
// ---------------------------------------------------------------------------------------

function modelFormu(icerik, s, senaryo, baglam) {
  const sema = formSemasiOlustur(baglam.model, baglam.altModeller);
  // Akış değişince (s.taslak) formdaki değerler yeni akışın formuna taşınır.
  const onceki = s.taslak?.veri || senaryo?.veri || undefined;
  const degerler = formDegerleriniKur(sema, onceki || {});
  let baslikDegeri = s.taslak ? s.taslak.baslik : senaryo ? senaryo.baslik : '';
  // Akış değişince (s.taslak) kaydedilmemiş ortam / koşuda / mutlaka görünmeli seçimleri de taşınır.
  const ortamSecimi = new Set(s.taslak?.ortamlar ?? (senaryo ? senaryo.ortamlar.filter((o) => s.ortamlar.some((x) => x.id === o)) : [s.ortam.id]));
  if (!ortamSecimi.size) ortamSecimi.add(s.ortam.id);
  let kosuyaDahil = s.taslak?.kosuyaDahil ?? (senaryo ? senaryo.kosuyaDahil : true);
  const mutlaka = new Set(s.taslak?.mutlaka ?? senaryo?.mutlakaGorunmeli ?? []);
  // Giriş seçimi (senaryo-girisi.mjs): { kip: ortam | girissiz | temiz, profil }; null = ortamın girişiyle (varsayılan).
  let girisSecimi = s.taslak && 'giris' in s.taslak ? s.taslak.giris : senaryo?.giris ?? null;
  // Satır seçimleri: "<tabloId>|<etiket>" → { Sütun: değer } (çözümleyicinin okuduğu biçim; servis senaryosundakiyle aynı).
  // ${Tablo.Sütun} değerleri koşuda bu koşullarla (+ bağlı alanların düz değerleri ve ortam) uyan ilk satırdan gelir.
  const tabloSecimleri = JSON.parse(JSON.stringify(s.taslak?.tabloSecimleri ?? senaryo?.tabloSecimleri ?? {}));
  const modelGirissiz = baglam.model?.girisGerekmez === true;
  const dogrulamaBaglami = { model: baglam.model, altModeller: baglam.altModeller, ...(baglam.ortak ? { ortak: baglam.ortak } : {}), kaynak: 'kayit' };
  const tumAlanlar = tumFormAlanlari(sema);
  // Koşullu değer listeleri (Ayarlar > Test verisi): koşulları tutan liste seçim alanının seçeneklerini belirler (metin: listedeki
  // açıklama, yoksa modelin metni); tutan liste yoksa modelin kendi listesi.
  const degerListeleri = baglam.degerListeleri || [];
  const alanDegeri = (id) => { const a = tumAlanlar.find((x) => x.id === id); return a ? String(degerler[a.anahtar] ?? '') : undefined; };
  const alanSecenekleri = (alan) => {
    const model = secenekleriBul(alan, degerler, sema);
    const eslesen = eslesenListeler(degerListeleri, (l) => l.hedef?.alan === alan.id, alanDegeri);
    if (!eslesen.length) return model;
    const metinler = new Map([...(alan.secenekler || []), ...Object.values(alan.bagimlilik?.harita || {}).flat()].map((x) => [x.deger, x.metin]));
    return birlesikDegerler(eslesen).map((x) => ({ deger: x.deger, metin: x.aciklama || metinler.get(x.deger) || x.deger }));
  };
  // "Tablodan": tablo sütununa bağlı alanın değeri ${Tablo.Sütun} olabilir — koşuda senaryonun seçtiği satırdan (aynı tablodaki
  // diğer seçimler ve ortamla uyan ilk satır) çözülür (tablolar/ekran-basvurulari.mjs). Bağlı değilse null.
  const tabloSecenegi = (alan) => {
    const l = degerListeleri.find((x) => x.hedef?.alan === alan.id && x.baglanti);
    if (!l) return null;
    const b = l.baglanti;
    return { deger: degerBasvurusuYaz(b.tablo, b.sutun, b.etiket || ''), metin: `Tablodan: ${b.tablo} → ${b.sutun}${b.etiket ? ` [${b.etiket}]` : ''} (koşuda seçilen satır)` };
  };
  /** kontrol anahtarı → { el, hata, uyari, odak } */
  const kontroller = new Map();
  /** alan kimliği → { kap, ciz } */
  const alanlar = new Map();
  const adimKartlari = new Map();
  const bolumKaplari = new Map();
  const dokunulan = new Set();
  let gonderildi = false;
  let degisti = false;
  let sonDurum = { senaryo: {}, gorunurluk: null, hatalar: [], uyarilar: [] };

  // --- Durum hesaplama ------------------------------------------------------------------
  const gorunurlukHesapla = (taslak) => gorunurlukleriHesapla(taslak, dogrulamaBaglami);
  function hesapla() {
    const senaryoNesnesi = senaryoNesnesiOlustur(sema, { ...degerler, [sema.baslik]: baslikDegeri }, { gorunurlukHesapla, onceki });
    const gorunurluk = gorunurlukHesapla(senaryoNesnesi);
    const sonuc = senaryoyuDogrula(senaryoNesnesi, dogrulamaBaglami);
    sonDurum = { senaryo: senaryoNesnesi, gorunurluk, hatalar: sonuc.hatalar, uyarilar: sonuc.uyarilar };
    return sonDurum;
  }

  let zamanlayici = null;
  const planla = () => { clearTimeout(zamanlayici); zamanlayici = setTimeout(guncelle, 90); };
  function degerYaz(anahtar, deger, secenekler = {}) {
    degerler[anahtar] = deger;
    degisti = true;
    if (secenekler.dokun !== false) dokunulan.add(anahtar);
    bagimlilariYenile(anahtar);
    planla();
  }

  function guncelle() {
    const d = hesapla();
    const g = d.gorunurluk;
    // Görünürlük: adımlar (kapsam), bölümler, alanlar, kimlik parçaları
    for (const adim of sema.adimlar) {
      const kart = adimKartlari.get(adim.id);
      if (!kart) continue;
      const disarida = g.adimlar[adim.id] === false;
      kart.el.classList.toggle('kapsam-disi', disarida);
      kart.alt.textContent = disarida ? 'Bu senaryoda koşulmaz (adım kapsamı dışında)' : kart.altMetin;
    }
    for (const [id, kap] of bolumKaplari) kap.hidden = g.bolumler[id] === false;
    for (const alan of tumAlanlar) {
      const k = alanlar.get(alan.id);
      if (!k) continue;
      const v = g.alanlar[alan.id];
      k.kap.hidden = v === false;
      if (k.gorunurlukCipi) {
        k.gorunurlukCipi.hidden = !alan.gorunurlukVar;
        k.gorunurlukCipi.title = v === null
          ? 'Koşullu alan: seçili bağlamda ekranda görünüp görünmediği bilinmiyor; zorunlu kabul edilir.'
          : 'Koşullu alan: bu senaryonun bağlamında ekranda görünür.';
        k.gorunurlukCipi.lastChild.textContent = v === null ? 'koşullu · bilinmiyor' : 'koşullu';
      }
      if (alan.tip === 'kimlik') {
        for (const alt of alan.altAlanlar) {
          const kap = k.kap.querySelector(`[data-alt="${alt.id}"]`);
          if (kap) kap.hidden = g.altAlanlar[`${alan.id}.${alt.id}`] === false;
        }
      }
    }
    // Hatalar ve uyarılar (dokunulan alanlar ya da kaydetme denemesinden sonra tümü)
    const dagit = hatalariDagit(d.hatalar, sema);
    const uyari = hatalariDagit(d.uyarilar, sema);
    for (const [anahtar, k] of kontroller) {
      const goster = gonderildi || dokunulan.has(anahtar);
      const mesajlar = goster ? dagit.alanlar[anahtar] || [] : [];
      if (k.hata) k.hata.textContent = mesajlar.join(' ');
      if (k.uyari) k.uyari.textContent = (uyari.alanlar[anahtar] || []).join(' ');
      for (const el of k.girdiler) { if (mesajlar.length) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    }
    yerlestir(genelHatalar, ...(gonderildi ? dagit.genel : []).map((m) => h('li', {}, m)));
    genelHatalar.hidden = !(gonderildi && dagit.genel.length);
    ozetiCiz(d);
    satirSecimiCiz();
    beklenenAdimSecenekleriniGuncelle(g);
    if (!diyagramAlani.hidden) diyagramiCiz();
  }

  // --- Bağımlılıklar (seçenekler / kimlik türü değişince yeniden çizim) ---------------------
  function bagimlilariYenile(anahtar) {
    const degisenAlan = tumAlanlar.find((a) => a.anahtar === anahtar);
    if (!degisenAlan) return;
    for (const alan of tumAlanlar) {
      const k = alanlar.get(alan.id);
      if (!k) continue;
      const bagli = (alan.tip === 'secim' && alan.bagimlilik && alan.bagimlilik.alan === degisenAlan.id) || (alan.tip === 'kimlik' && alan.bagliAlan === degisenAlan.id)
        || (alan.tip === 'secim' && degerListeleri.some((l) => l.hedef?.alan === alan.id && (l.kosullar || []).some((k) => k.alan === degisenAlan.id)));
      if (!bagli) continue;
      if (alan.tip === 'secim') {
        const liste = alanSecenekleri(alan);
        // Tablo başvurusu (${Tablo.Sütun}) üst seçime göre temizlenmez: satır koşuda seçimlerle bulunur.
        if (degerler[alan.anahtar] && !tabloBasvurusuCoz(degerler[alan.anahtar]) && !liste.some((x) => x.deger === degerler[alan.anahtar])) degerler[alan.anahtar] = '';
      }
      k.ciz();
    }
  }

  // --- Kontrol yardımcıları ---------------------------------------------------------------
  function kontrolKaydet(anahtar, girdiler, hataEl, uyariEl) {
    kontroller.set(anahtar, { girdiler, hata: hataEl, uyari: uyariEl });
    for (const el of girdiler) el.addEventListener('blur', () => { dokunulan.add(anahtar); planla(); });
  }
  const hataKutusuOlustur = (id) => h('div', { class: 'alan-hatasi', role: 'alert', id: `${id}-hata` });
  const uyariKutusuOlustur = (id) => h('div', { class: 'alan-uyarisi', id: `${id}-uyari` });
  const bagla = (girdi, id) => { girdi.id = id; girdi.setAttribute('aria-describedby', `${id}-hata ${id}-uyari`); return girdi; };

  function alanUst(alan, id, ekler = []) {
    const cip = alan.gorunurlukVar ? h('span', { class: 'kosullu-cip', title: '' }, ikon('isaret'), 'koşullu') : null;
    const mutlakaKutu = alan.akistaZorunlu
      // Akışta zorunlu: her senaryoda mutlaka görünmeli (değiştirilemez; akıştan değişir).
      ? h('label', { class: 'mutlaka-gorunmeli', title: 'Akışta zorunlu: ekranda görünmezse test başarısız olur (ekranın Akış’ından değişir).' },
        h('input', { type: 'checkbox', checked: true, disabled: true, 'aria-label': `${alan.etiket}: akışta zorunlu` }), h('span', {}, 'Akışta zorunlu'))
      : alan.gorunurlukVar
      ? h('label', { class: 'mutlaka-gorunmeli', title: 'İşaretliyse bu alan ekranda görünmediğinde test başarısız sayılmalıdır (kural senaryoda saklanır).' },
        h('input', { type: 'checkbox', checked: mutlaka.has(alan.id), 'aria-label': `${alan.etiket}: mutlaka görünmeli`,
          onchange: (o) => { if (o.currentTarget.checked) mutlaka.add(alan.id); else mutlaka.delete(alan.id); degisti = true; } }),
        h('span', {}, 'Mutlaka görünmeli'))
      : null;
    return {
      el: h('div', { class: 'alan-ust' },
        h('label', { for: id }, alan.etiket, alan.zorunlu === true ? h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*') : null,
          alan.zorunlu === true ? h('span', { class: 'gorunmez' }, ' (zorunlu)') : null),
        h('span', { class: 'sag' }, cip, mutlakaKutu, ...ekler)),
      cip
    };
  }

  function secimGirdisi(secenekler, deger, bosMetin = 'Seçin…', tablodan = null) {
    const sel = h('select', {}, h('option', { value: '' }, bosMetin),
      secenekler.map((x) => h('option', { value: x.deger, selected: x.deger === deger }, x.metin)),
      tablodan ? h('optgroup', { label: 'Test verisi tablosundan' }, h('option', { value: tablodan.deger, selected: tablodan.deger === deger }, tablodan.metin)) : null);
    if (deger && !secenekler.some((x) => x.deger === deger) && !(tablodan && tablodan.deger === deger)) {
      const b = tabloBasvurusuCoz(deger);
      sel.append(h('option', { value: deger, selected: true }, b ? `Tablodan: ${b.tablo} → ${b.sutun}` : `${deger} (listede yok)`));
    }
    return sel;
  }

  // --- Alan çizimleri ---------------------------------------------------------------------
  function alanCiz(alan) {
    const kap = h('div', { class: `model-alani ${['kimlik', 'altModel'].includes(alan.tip) ? 'genis' : ''}`.trim(), 'data-alan': alan.id });
    const kayit = { kap, ciz: () => {}, gorunurlukCipi: null };
    alanlar.set(alan.id, kayit);
    const ciz = () => {
      const id = yeniId(alan.id);
      const hata = hataKutusuOlustur(id);
      const uyari = uyariKutusuOlustur(id);
      let govde;
      let ust;
      switch (alan.tip) {
        case 'secim': {
          const tablodan = alan.hassas ? null : tabloSecenegi(alan);
          const liste = alan.gorunum === 'radyo' && tablodan ? [...alanSecenekleri(alan), tablodan] : alanSecenekleri(alan);
          if (alan.gorunum === 'radyo') {
            const ad = yeniId(`${alan.id}-r`);
            const radyolar = liste.map((x) => h('input', { type: 'radio', name: ad, value: x.deger, checked: degerler[alan.anahtar] === x.deger }));
            radyolar.forEach((r) => r.addEventListener('change', () => degerYaz(alan.anahtar, r.value)));
            govde = h('div', { class: 'radyo-grubu', role: 'radiogroup', id, 'aria-labelledby': `${id}-etiket` },
              radyolar.map((r, i) => h('label', {}, r, liste[i].metin)));
            ust = alanUst(alan, id);
            ust.el.querySelector('label').id = `${id}-etiket`;
            ust.el.querySelector('label').removeAttribute('for');
            kontrolKaydet(alan.anahtar, radyolar, hata, uyari);
          } else {
            const sel = bagla(secimGirdisi(liste, String(degerler[alan.anahtar] || ''), alan.bagimlilik && !liste.length ? 'Önce bağlı alanı seçin' : 'Seçin…', tablodan), id);
            sel.addEventListener('change', () => degerYaz(alan.anahtar, sel.value));
            govde = sel;
            ust = alanUst(alan, id);
            kontrolKaydet(alan.anahtar, [sel], hata, uyari);
          }
          break;
        }
        case 'onayKutusu': {
          // Tabloya bağlı onay kutusu "Tablodan" alabilir: koşuda seçilen satırdaki değer evet / hayır olarak okunur
          // (true/false, evet/hayır, 1/0, E/H; tanınmazsa koşu anlaşılır hatayla durur).
          const tablodan = alan.hassas ? null : tabloSecenegi(alan);
          const b = tabloBasvurusuCoz(degerler[alan.anahtar]);
          if (b) {
            const kaldir = h('button', { type: 'button', class: 'kucuk-dugme hayalet', id, 'aria-label': `${alan.etiket}: tablodan almayı kaldır` }, ikon('carpi'), 'Kaldır');
            kaldir.addEventListener('click', () => { degerYaz(alan.anahtar, false); kayit.ciz(); });
            ust = alanUst(alan, id);
            govde = h('div', { class: 'tablodan-deger' }, ikon('veri'),
              h('span', {}, `Tablodan: ${b.tablo}${b.etiket ? ` [${b.etiket}]` : ''} → ${b.sutun}`, h('small', { class: 'soluk' }, ' · koşuda evet / hayır olarak okunur')), kaldir);
            kontrolKaydet(alan.anahtar, [kaldir], hata, uyari);
            break;
          }
          const kutu = h('input', { type: 'checkbox', checked: degerler[alan.anahtar] === true, id });
          kutu.addEventListener('change', () => degerYaz(alan.anahtar, kutu.checked));
          const tablodanDugmesi = tablodan ? h('button', {
            type: 'button', class: 'kucuk-dugme hayalet', title: tablodan.metin, 'aria-label': `${alan.etiket}: ${tablodan.metin}`,
            onclick: () => { degerYaz(alan.anahtar, tablodan.deger); kayit.ciz(); }
          }, ikon('veri'), 'Tablodan') : null;
          ust = alanUst(alan, id, tablodanDugmesi ? [tablodanDugmesi] : []);
          ust.el.querySelector('label').textContent = '';
          govde = h('label', { class: 'onay-satiri', for: id }, kutu, alan.etiket);
          kontrolKaydet(alan.anahtar, [kutu], hata, uyari);
          break;
        }
        case 'profil': {
          const secenekler = (baglam.profiller[alan.profilHavuzu] || []).map((p) => ({ deger: p.ad, metin: p.kapsam === 'ortam' ? `${p.ad} (yalnız bu ortam)` : p.ad }));
          const sel = bagla(secimGirdisi(secenekler, String(degerler[alan.anahtar] || ''), `Varsayılan${alan.varsayilanProfil ? ` (${alan.varsayilanProfil})` : ''}`), id);
          const onizleme = h('div', { class: 'profil-onizleme', 'aria-live': 'polite' });
          const onizle = () => profilOnizlemesi(onizleme, (baglam.profiller[alan.profilHavuzu] || []).find((p) => p.ad === (sel.value || alan.varsayilanProfil)));
          sel.addEventListener('change', () => { degerYaz(alan.anahtar, sel.value); onizle(); });
          onizle();
          govde = h('div', {}, sel, onizleme);
          ust = alanUst(alan, id);
          kontrolKaydet(alan.anahtar, [sel], hata, uyari);
          break;
        }
        case 'dosya':
          ({ govde, ust } = dosyaCiz(alan, id, hata, uyari));
          break;
        case 'kimlik':
          ({ govde, ust } = kimlikCiz(alan, id, hata, uyari));
          break;
        case 'altModel':
          ({ govde, ust } = altModelCiz(alan, id, hata, uyari));
          break;
        default: {
          // Değeri tablo başvurusu (${Tablo.Sütun}) olan sayı alanı metin olarak gösterilir.
          const tip = alan.tip === 'sayi' && !tabloBasvurusuCoz(degerler[alan.anahtar]) ? 'number' : alan.hassas ? 'password' : 'text';
          const girdi = bagla(h('input', {
            type: tip, value: String(degerler[alan.anahtar] ?? ''), autocomplete: 'off', spellcheck: 'false',
            placeholder: alan.tip === 'tarih' ? (alan.bicim || '') : alan.tip === 'dosya' ? `proje köküne göre yol${alan.kabul ? ` (${alan.kabul})` : ''}` : ''
          }), id);
          if (alan.tip === 'sayi') girdi.min = '1';
          // Tabloya (ya da değer listesine) bağlı metin alanı: aynı tablodaki seçimlere göre süzülen öneriler (elle yazılabilir).
          if (!alan.hassas && degerListeleri.some((l) => l.hedef?.alan === alan.id)) {
            oneriListesi(girdi, () => birlesikDegerler(eslesenListeler(degerListeleri, (l) => l.hedef?.alan === alan.id, alanDegeri)).map((x) => x.deger));
          }
          girdi.addEventListener('input', () => degerYaz(alan.anahtar, girdi.value, { dokun: false }));
          girdi.addEventListener('change', () => { dokunulan.add(alan.anahtar); planla(); });
          govde = girdi;
          // Tabloya bağlı alan: "Tablodan" değeri ${Tablo.Sütun} yapar (koşuda seçilen satırdan gelir).
          const tablodan = alan.hassas ? null : tabloSecenegi(alan);
          const tablodanDugmesi = tablodan ? h('button', {
            type: 'button', class: 'kucuk-dugme hayalet', title: tablodan.metin, 'aria-label': `${alan.etiket}: ${tablodan.metin}`,
            onclick: () => { degerYaz(alan.anahtar, tablodan.deger); kayit.ciz(); }
          }, ikon('veri'), 'Tablodan') : null;
          ust = alanUst(alan, id, tablodanDugmesi ? [tablodanDugmesi] : []);
          kontrolKaydet(alan.anahtar, [girdi], hata, uyari);
        }
      }
      kayit.gorunurlukCipi = ust.cip;
      yerlestir(kap, ust.el, govde, hata, uyari);
    };
    kayit.ciz = () => { ciz(); planla(); };
    ciz();
    return kap;
  }

  // Dosya alanı: dosya ŞİFRELİ depoya yüklenir (düz metin diske yazılmaz); senaryo verisinde yalnızca referans durur.
  // Koşuda dosya yalnızca kullanıcının okuyabildiği geçici bir klasöre çözülür ve koşu bitince silinir.
  const dosyaBilgileri = baglam.dosyaBilgileri || {};
  function dosyaCiz(alan, id, hata, uyari) {
    const deger = String(degerler[alan.anahtar] ?? '');
    const ref = dosyaReferansiCoz(deger);
    const kabul = kabulListesi(alan.kabul);
    const secici = h('input', { type: 'file', id, class: 'gorunmez-dosya', ...(kabul ? { accept: kabul.join(',') } : {}), 'aria-describedby': `${id}-hata ${id}-uyari ${id}-not` });
    const durum = h('div', { class: 'dosya-durumu', 'aria-live': 'polite' });
    const sec = () => secici.click();
    secici.addEventListener('change', async () => {
      const dosya = secici.files && secici.files[0];
      secici.value = '';
      if (!dosya) return;
      const sorun = dosyaOnDenetimi(dosya, alan.kabul);
      if (sorun) { hata.textContent = sorun; return; }
      hata.textContent = '';
      const cubuk = h('span', { class: 'dosya-ilerleme-cubugu', style: { width: '0%' } });
      yerlestir(durum, h('div', { class: 'dosya-ilerleme' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), h('span', {}, `${dosya.name} şifrelenip yükleniyor…`), h('span', { class: 'dosya-ilerleme-yolu' }, cubuk)));
      try {
        const adres = `/platform/senaryo-dosyasi/yukle?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(baglam.ekran.id)}&alan=${encodeURIComponent(alan.anahtar)}`;
        const d = await dosyaYukle(adres, dosya, (y) => { cubuk.style.width = `${y}%`; });
        dosyaBilgileri[d.referans] = { id: d.id, ad: d.ad, boyut: d.boyut };
        degerYaz(alan.anahtar, d.referans);
        bildir(`${d.ad} şifreli olarak yüklendi; senaryoyu kaydedince bağlanır.`, 'basari');
        alanlar.get(alan.id)?.ciz();
      } catch (e) {
        if (e.durum === 423) return;
        yerlestir(durum);
        hata.textContent = e.message;
      }
    });
    const kaldir = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${alan.etiket}: dosyayı kaldır` }, ikon('carpi'), 'Kaldır');
    kaldir.addEventListener('click', () => { degerYaz(alan.anahtar, ''); alanlar.get(alan.id)?.ciz(); });
    let icerikEl;
    // Tabloya bağlı dosya alanı "Tablodan" alabilir: koşuda seçilen satırdaki dosya ADI kullanılır (izinli klasör kuralları aynen).
    const tablodan = alan.hassas ? null : tabloSecenegi(alan);
    const tb = tabloBasvurusuCoz(deger);
    if (tb) {
      icerikEl = h('div', { class: 'dosya-karti' },
        h('span', { class: 'dosya-karti-ikon', 'aria-hidden': 'true' }, ikon('veri')),
        h('div', { class: 'dosya-karti-ana' },
          h('strong', { class: 'dosya-adi' }, `Tablodan: ${tb.tablo}${tb.etiket ? ` [${tb.etiket}]` : ''} → ${tb.sutun}`),
          h('small', { class: 'soluk' }, 'Koşuda seçilen satırdaki dosya adı; dosya izinli klasörde olmalı (NOBETCI_YUKLEME_KLASORU ya da veri/yuklenecek-dosyalar/).')),
        h('span', { class: 'dosya-karti-eylemler' },
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: sec, 'aria-label': `${alan.etiket}: dosya yükle` }, ikon('yukle'), 'Dosya yükle'), kaldir));
    } else if (ref) {
      const b = dosyaBilgileri[deger];
      icerikEl = h('div', { class: `dosya-karti ${b && b.eksik ? 'eksik' : ''}`.trim() },
        h('span', { class: 'dosya-karti-ikon', 'aria-hidden': 'true' }, ikon('dosya')),
        h('div', { class: 'dosya-karti-ana' },
          h('strong', { class: 'dosya-adi' }, b ? b.ad : ref.ad),
          h('small', { class: 'soluk' }, b && b.eksik ? 'şifreli depoda bulunamadı — yeniden yükleyin' : b && b.boyut !== null && b.boyut !== undefined ? boyutMetni(b.boyut) : 'şifreli depoda')),
        rozet([ikon('kilit'), 'şifreli'], 'basari', { title: 'Dosya diskte yalnızca şifreli durur; koşuda geçici olarak çözülür.' }),
        h('span', { class: 'dosya-karti-eylemler' },
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: sec, 'aria-label': `${alan.etiket}: dosyayı değiştir` }, ikon('yukle'), 'Değiştir'), kaldir));
    } else if (deger) {
      icerikEl = h('div', { class: 'dosya-karti eski' },
        h('span', { class: 'dosya-karti-ikon', 'aria-hidden': 'true' }, ikon('uyari')),
        h('div', { class: 'dosya-karti-ana' },
          h('code', { class: 'dosya-adi' }, deger),
          h('small', { class: 'soluk' }, 'eski düz metin dosya yolu — şifreli depoya almak için dosyayı yükleyin (ya da Ayarlar > Güvenlik > "Açık dosyaları şifreli depoya taşı")')),
        h('span', { class: 'dosya-karti-eylemler' },
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: sec, 'aria-label': `${alan.etiket}: dosya yükle` }, ikon('yukle'), 'Dosya yükle'), kaldir));
    } else {
      icerikEl = h('button', { type: 'button', class: 'dosya-sec-dugmesi', onclick: sec, 'aria-label': `${alan.etiket}: dosya yükle` },
        ikon('yukle'), h('span', {}, h('strong', {}, 'Dosya yükle'), h('small', { class: 'soluk' }, `${kabul ? kabul.join(', ') : 'dosya'} · en fazla 20 MB · şifreli saklanır`)));
    }
    const govde = h('div', { class: 'dosya-alani' }, secici, icerikEl, durum,
      h('div', { class: 'alan-notu', id: `${id}-not` }, alan.varsayilan !== undefined
        ? 'Boş bırakılırsa ekranın varsayılan dosyası kullanılır (Ayarlar > Dosyalar).'
        : 'Dosya diskte yalnızca şifreli durur; koşuda geçici olarak çözülür ve koşu bitince silinir.'));
    const tablodanDugmesi = tablodan && !tb ? h('button', {
      type: 'button', class: 'kucuk-dugme hayalet', title: tablodan.metin, 'aria-label': `${alan.etiket}: ${tablodan.metin}`,
      onclick: () => { degerYaz(alan.anahtar, tablodan.deger); alanlar.get(alan.id)?.ciz(); }
    }, ikon('veri'), 'Tablodan') : null;
    const ust = alanUst(alan, id, tablodanDugmesi ? [tablodanDugmesi] : []);
    kontrolKaydet(alan.anahtar, [secici], hata, uyari);
    return { govde, ust };
  }

  function profilOnizlemesi(kap, profil) {
    if (!profil) { yerlestir(kap); return; }
    yerlestir(kap, ...profil.alanlar.map((a) => h('span', { class: a.dolu ? null : 'bos', title: a.deger === undefined ? 'Hassas değer: maskeli' : null },
      `${a.etiket}: `, a.deger !== undefined ? (a.deger || '—') : h('b', {}, a.dolu ? '••••' : '—'))));
  }

  function kimlikCiz(alan, id, hata, uyari) {
    const kipAnahtari = `${alan.id}#kip`;
    const profilAnahtari = `${alan.id}#profil`;
    const tur = kimlikTuruBul(alan, degerler, sema);
    const havuz = profilHavuzuBul(alan, degerler, sema);
    const profiller = havuz ? baglam.profiller[havuz] || [] : [];
    const kipler = [...(alan.zorunlu === true ? [] : [['yok', 'Varsayılan']]), ['profil', 'Hazır profil'], ['yeni', 'Yeni kimlik']];
    const ad = yeniId(`${alan.id}-kip`);
    const radyolar = kipler.map(([d]) => h('input', { type: 'radio', name: ad, value: d, checked: degerler[kipAnahtari] === d }));
    radyolar.forEach((r) => r.addEventListener('change', () => { degerYaz(kipAnahtari, r.value); alanlar.get(alan.id).ciz(); }));
    const kipGrubu = h('div', { class: 'radyo-grubu', role: 'radiogroup', 'aria-label': `${alan.etiket}: kaynak` }, radyolar.map((r, i) => h('label', {}, r, kipler[i][1])));
    const ust = alanUst(alan, id);
    ust.el.querySelector('label').removeAttribute('for');
    kontrolKaydet(kipAnahtari, radyolar, hata, uyari);
    const kutu = h('div', { class: 'kimlik-kutusu' }, kipGrubu);
    if (!tur && alan.bagliAlan) {
      kutu.append(h('p', { class: 'soluk kucuk' }, 'Kimlik türü bağlı alana göre belirlenir; önce onu seçin.'));
    } else if (degerler[kipAnahtari] === 'profil') {
      const pid = yeniId(`${alan.id}-profil`);
      const sel = bagla(secimGirdisi(profiller.map((p) => ({ deger: p.ad, metin: p.kapsam === 'ortam' ? `${p.ad} (yalnız bu ortam)` : p.ad })), String(degerler[profilAnahtari] || ''), 'Profil seçin…'), pid);
      const onizleme = h('div', { class: 'profil-onizleme' });
      const onizle = () => profilOnizlemesi(onizleme, profiller.find((p) => p.ad === sel.value));
      sel.addEventListener('change', () => { degerYaz(profilAnahtari, sel.value); onizle(); });
      onizle();
      const ph = hataKutusuOlustur(pid);
      kontrolKaydet(profilAnahtari, [sel], ph, uyariKutusuOlustur(pid));
      kutu.append(h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: pid }, `Profil${havuz ? '' : ''}`)), sel, onizleme, ph));
    } else if (degerler[kipAnahtari] === 'yeni') {
      const izgara = h('div', { class: 'alan-izgarasi' });
      for (const alt of alan.altAlanlar) {
        const altAd = typeof alt.kimlikAlani === 'string' ? alt.kimlikAlani : tur ? alt.kimlikAlani[tur] : null;
        if (!altAd) continue;
        const aid = yeniId(`${alan.id}-${altAd}`);
        const anahtar = `${alan.id}.${altAd}`;
        const girdi = bagla(h('input', { type: 'text', value: String(degerler[anahtar] ?? ''), autocomplete: 'off', spellcheck: 'false', placeholder: alt.bicim || '', inputmode: /Tarih/i.test(alt.id) ? null : 'numeric' }), aid);
        girdi.addEventListener('input', () => degerYaz(anahtar, girdi.value, { dokun: false }));
        girdi.addEventListener('change', () => { dokunulan.add(anahtar); planla(); });
        const ah = hataKutusuOlustur(aid);
        kontrolKaydet(anahtar, [girdi], ah, uyariKutusuOlustur(aid));
        izgara.append(h('div', { class: 'model-alani', 'data-alt': alt.id }, h('div', { class: 'alan-ust' }, h('label', { for: aid }, alt.etiket)), girdi, ah));
      }
      kutu.append(izgara, h('p', { class: 'alan-notu' }, 'Kimlik bilgileri kasada şifreli saklanır.'));
    } else {
      kutu.append(h('p', { class: 'soluk kucuk' }, 'Ürünün varsayılan kimliği kullanılır.'));
    }
    return { govde: kutu, ust };
  }

  function altModelCiz(alan, id, hata, uyari) {
    const ozelAnahtari = `${alan.anahtar}#ozel`;
    const kutu = h('input', { type: 'checkbox', checked: degerler[ozelAnahtari] === true, id });
    kutu.addEventListener('change', () => { degerYaz(ozelAnahtari, kutu.checked); alanlar.get(alan.id).ciz(); });
    const ust = alanUst(alan, id);
    ust.el.querySelector('label').textContent = alan.etiket;
    kontrolKaydet(ozelAnahtari, [kutu], hata, uyari);
    const govde = h('div', { class: 'alt-model-kutusu' },
      h('label', { class: 'onay-satiri', for: id }, kutu, `Senaryoya özel ${alan.etiket.toLocaleLowerCase('tr')} kullan`));
    if (degerler[ozelAnahtari] === true) {
      const izgara = h('div', { class: 'alan-izgarasi' });
      for (const a of alan.alanlar) {
        const aid = yeniId(`${alan.anahtar}-${a.anahtar}`);
        const anahtar = `${alan.anahtar}.${a.anahtar}`;
        let girdi;
        if (a.tip === 'secim' && a.secenekler) {
          girdi = bagla(secimGirdisi(a.secenekler, String(degerler[anahtar] || '')), aid);
          girdi.addEventListener('change', () => degerYaz(anahtar, girdi.value));
        } else {
          girdi = bagla(h('input', { type: a.hassas ? 'password' : 'text', value: String(degerler[anahtar] ?? ''), autocomplete: 'off', spellcheck: 'false', placeholder: a.tip === 'secim' ? 'değer' : '' }), aid);
          girdi.addEventListener('input', () => degerYaz(anahtar, girdi.value, { dokun: false }));
          girdi.addEventListener('change', () => { dokunulan.add(anahtar); planla(); });
        }
        const ah = hataKutusuOlustur(aid);
        kontrolKaydet(anahtar, [girdi], ah, uyariKutusuOlustur(aid));
        izgara.append(h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: aid }, a.etiket, a.zorunlu ? h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*') : null)), girdi, ah));
      }
      govde.append(izgara, h('p', { class: 'alan-notu' }, 'Değerler kasada şifreli saklanır. Ortak değerle aynıysa kaydedilmez (senaryo ortak değeri kullanır).'));
    } else {
      govde.append(h('p', { class: 'soluk kucuk' }, 'Ortak değer kullanılır.'));
    }
    return { govde, ust };
  }

  // --- Adımlar ----------------------------------------------------------------------------
  function kapsamAnahtari(adim) {
    const grup = sema.adimKapsami.find((k) => k.ayar === adim.ayar);
    const kutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: degerler[adim.ayar] === true, 'aria-label': `${grup ? grup.etiket : adim.baslik}` });
    kutu.addEventListener('change', () => {
      degerYaz(adim.ayar, kutu.checked);
      for (const k of adimAkisi.querySelectorAll(`input[data-ayar="${CSS.escape(adim.ayar)}"]`)) k.checked = kutu.checked;
    });
    kutu.dataset.ayar = adim.ayar;
    return h('label', { class: 'kapsam-anahtari', title: grup ? `${grup.etiket} (${grup.adimlar.length} adım)` : '' }, kutu, 'Dahil');
  }

  const adimAkisi = h('div', { class: 'adim-akisi' });
  sema.adimlar.forEach((adim, i) => {
    const alanSayisi = adim.bolumler.reduce((t, b) => t + b.alanlar.length, 0);
    const altMetin = adim.ayar ? `İsteğe bağlı adım${alanSayisi ? ` · ${alanSayisi} alan` : ''}` : alanSayisi ? `${alanSayisi} alan` : 'Bu adımda senaryoya özel alan yok';
    const alt = h('small', {}, altMetin);
    const govde = h('div', { class: 'adim-govdesi' });
    for (const bolum of adim.bolumler) {
      if (!bolum.alanlar.length) continue;
      const grup = h('div', { class: 'bolum-grubu' }, adim.bolumler.filter((b) => b.alanlar.length).length > 1 || bolum.baslik !== adim.baslik ? h('h4', {}, bolum.baslik) : null,
        h('div', { class: 'alan-izgarasi' }, bolum.alanlar.map(alanCiz)));
      bolumKaplari.set(bolum.id, grup);
      govde.append(grup);
    }
    const el = h('section', { class: `kart adim-karti ${alanSayisi ? '' : 'bos'}`.trim(), 'aria-labelledby': `adim-${adim.id}` },
      h('div', { class: 'adim-basligi' }, h('span', { class: 'adim-no', 'aria-hidden': 'true' }, String(i + 1)),
        h('div', {}, h('h3', { id: `adim-${adim.id}` }, adim.baslik), alt),
        adim.ayar ? h('div', { class: 'sag' }, kapsamAnahtari(adim)) : null),
      govde);
    adimKartlari.set(adim.id, { el, alt, altMetin, govde, alanSayisi });
    adimAkisi.append(el);
  });

  // --- Senaryo kartı (başlık + senaryo düzeyi alanlar) --------------------------------------
  const baslikId = yeniId('baslik');
  const baslikGirdisi = bagla(h('input', { type: 'text', value: baslikDegeri, maxlength: '300', autocomplete: 'off', placeholder: 'ör. bağlam / kapsam / beklenen sonuç…' }), baslikId);
  baslikGirdisi.addEventListener('input', () => { baslikDegeri = baslikGirdisi.value; degisti = true; planla(); });
  baslikGirdisi.addEventListener('change', () => { dokunulan.add(sema.baslik); planla(); });
  const baslikHata = hataKutusuOlustur(baslikId);
  kontrolKaydet(sema.baslik, [baslikGirdisi], baslikHata, uyariKutusuOlustur(baslikId));
  // Akış seçimi (birden çok akışlı ekranda).
  const akislar = Array.isArray(baglam.akislar) ? baglam.akislar : [];
  const akisSecimi = akislar.length > 1 ? h('select', { id: yeniId('akis') },
    akislar.map((a) => h('option', { value: a.id, selected: a.id === baglam.akisId }, `${a.ad}${a.varsayilan ? ' (varsayılan)' : ''}`))) : null;
  if (akisSecimi) {
    akisSecimi.addEventListener('change', () => {
      const d = hesapla();
      senaryoFormu(icerik, { ...s, akisId: akisSecimi.value, taslak: { veri: d.senaryo, baslik: baslikDegeri, oncekiAkis: baglam.akisId, ortamlar: [...ortamSecimi], kosuyaDahil, mutlaka: [...mutlaka], giris: girisSecimi, tabloSecimleri, sekme: diyagramAlani.hidden ? 'form' : 'akis' } });
    });
  }
  // Giriş: ortamın girişiyle (varsayılan) / girişsiz / temiz oturumla yeniden giriş; birden çok giriş profili varsa profil. Ekran
  // modeli girişsizse seçim kilitli (her zaman girişsiz).
  const girisKipi = h('select', { id: yeniId('giris'), disabled: modelGirissiz },
    [['ortam', 'Ortamın girişiyle (varsayılan)'], ['girissiz', 'Girişsiz'], ['temiz', 'Temiz oturumla yeniden giriş (kayıtlı oturumu kullanma)']]
      .map(([d, m]) => h('option', { value: d, selected: (modelGirissiz ? 'girissiz' : girisSecimi?.kip ?? 'ortam') === d }, m)));
  const girisProfili = h('select', { id: yeniId('girisProfili'), 'aria-label': 'Giriş profili' });
  const girisNotu = h('div', { class: 'alan-notu' });
  const girisProfilAlani = h('div', { class: 'giris-profil-secimi' }, h('label', { for: girisProfili.id, class: 'kucuk' }, 'Giriş profili'), girisProfili);
  /** Seçili ortamlarda kullanılabilen giriş profili adları (tüm ortamlar için olanlar dahil). */
  const profilAdlari = () => [...new Set((baglam.girisProfilleri || []).filter((p) => p.ortamId === null || ortamSecimi.has(p.ortamId)).map((p) => p.ad))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
  const girisCiz = () => {
    const adlar = profilAdlari();
    const secili = girisSecimi?.profil ?? '';
    girisProfili.replaceChildren(h('option', { value: '' }, 'Ortamın varsayılan profili'),
      ...[...new Set([...adlar, ...(secili ? [secili] : [])])].map((ad) => h('option', { value: ad, selected: ad === secili }, adlar.includes(ad) ? ad : `${ad} (seçili ortamlarda yok)`)));
    const kip = modelGirissiz ? 'girissiz' : girisKipi.value;
    girisProfilAlani.hidden = kip === 'girissiz' || (adlar.length < 2 && !secili);
    girisNotu.textContent = modelGirissiz ? 'Bu ekranın modeli girişsiz: senaryo giriş yapmadan koşar (seçim kilitli).'
      : kip === 'girissiz' ? 'Giriş yapılmaz; kayıtlı oturum da kullanılmaz (ekran girişsiz açılır).'
        : kip === 'temiz' ? 'Kayıtlı oturum kullanılmaz: çerezler temizlenip ortamın giriş tarifiyle yeniden girilir.'
          : 'Kayıtlı oturum geçerliyse kullanılır, değilse ortamın giriş tarifiyle girilir (Ayarlar > Giriş profilleri > Giriş tarifi).';
  };
  const girisDegistir = () => {
    const kip = girisKipi.value;
    const profil = kip === 'girissiz' ? null : girisProfili.value || null;
    girisSecimi = kip === 'ortam' && !profil ? null : { kip, profil };
    degisti = true;
    girisCiz();
    if (!diyagramAlani.hidden) diyagramiCiz();
  };
  girisKipi.addEventListener('change', girisDegistir);
  girisProfili.addEventListener('change', girisDegistir);
  girisCiz();
  const senaryoKarti = h('section', { class: 'kart', 'aria-labelledby': 'senaryo-karti-baslik' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'senaryo-karti-baslik' }, ikon('liste'), 'Senaryo'),
      h('span', { class: 'alt' }, 'Başlık, Playwright test adıdır; aynı ekranda tekil olmalıdır.')),
    h('div', { class: 'alan-izgarasi' },
      akisSecimi ? h('div', { class: 'model-alani genis' }, h('div', { class: 'alan-ust' }, h('label', { for: akisSecimi.id }, 'Akış')), akisSecimi,
        h('div', { class: 'alan-notu' }, 'Senaryo bu akışın adımlarıyla koşar; form seçilen akışa göre değişir.')) : null,
      h('div', { class: 'model-alani genis giris-secimi' }, h('div', { class: 'alan-ust' }, h('label', { for: girisKipi.id }, 'Giriş')), girisKipi, girisProfilAlani, girisNotu),
      h('div', { class: 'model-alani genis' }, h('div', { class: 'alan-ust' }, h('label', { for: baslikId }, 'Başlık', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), baslikGirdisi, baslikHata),
      sema.senaryoAlanlari.map(alanCiz)));

  // --- Satır seçimi (tablo başvuruları) --------------------------------------------------------
  // Formda ${Tablo.Sütun} kullanan her tablo + etiket grubu için koşuda kullanılacak satır: "Otomatik" (bağlı alanların düz
  // değerleri ve ortamla uyan ilk satır) ya da bir satır / sütun koşulları (tabloSecimleri; satır seçilince satırın açık sütun
  // değerleri koşul olur, gizli sütun koşula girmez). Ortama özel satırlar ortam adıyla gösterilir.
  const satirSecimiKarti = h('section', { class: 'kart satir-secimi-karti', 'aria-labelledby': 'satir-secimi-baslik', hidden: true });
  let tabloListesi = null;
  let tabloIstegi = null;
  let satirImzasi = null;
  const ortamAdi = (id) => (s.ortamlar.find((o) => o.id === id) || {}).ad || 'başka ortam';
  /** Formda tablo başvurusu kullanan gruplar: [{ tablo, etiket, alanlar: [etiket] }]. */
  const kullanilanGruplar = () => {
    const gruplar = new Map();
    for (const alan of tumAlanlar) {
      const b = alan.anahtar ? tabloBasvurusuCoz(degerler[alan.anahtar]) : null;
      if (!b) continue;
      const k = `${b.tablo.toLocaleLowerCase('tr')}|${b.etiket}`;
      if (!gruplar.has(k)) gruplar.set(k, { tablo: b.tablo, etiket: b.etiket, alanlar: [] });
      gruplar.get(k).alanlar.push(alan.etiket);
    }
    return [...gruplar.values()];
  };
  /** Kaydedilecek seçimler: yalnız formda kullanılan gruplar (başvuru kalmadıysa hiçbiri). */
  const kaydedilecekSecimler = () => {
    const gruplar = kullanilanGruplar();
    if (!gruplar.length) return {};
    if (!tabloListesi) return tabloSecimleri;
    const kullanilan = new Set(gruplar.map((g) => { const t = tabloBul(tabloListesi, g.tablo); return t ? grupAnahtari(t.id, g.etiket) : null; }).filter(Boolean));
    return Object.fromEntries(Object.entries(tabloSecimleri).filter(([k, v]) => kullanilan.has(k) && Object.keys(v).length));
  };
  function satirSecimiCiz(zorla = false) {
    const gruplar = kullanilanGruplar();
    const imza = JSON.stringify(gruplar);
    if (!zorla && imza === satirImzasi) return;
    satirImzasi = imza;
    if (!gruplar.length) { satirSecimiKarti.hidden = true; return; }
    if (!tabloListesi) {
      tabloIstegi ??= api(`/platform/tablolar?projeId=${encodeURIComponent(s.proje.id)}`)
        .then((y) => { tabloListesi = y.tablolar || []; })
        .catch(() => { tabloListesi = []; })
        .finally(() => satirSecimiCiz(true));
      return;
    }
    satirSecimiKarti.hidden = false;
    yerlestir(satirSecimiKarti,
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'satir-secimi-baslik' }, ikon('veri'), 'Satır seçimi'),
        h('span', { class: 'alt' }, 'Tablodan alınan değerler koşuda bu satırdan gelir.')),
      ...gruplar.map(satirGrubuCiz));
  }
  function satirGrubuCiz(g) {
    const t = tabloBul(tabloListesi, g.tablo);
    const baslikEl = h('h4', {}, `${t ? t.ad : g.tablo}${g.etiket ? ` [${g.etiket}]` : ''}`, h('small', { class: 'soluk' }, ` · ${g.alanlar.join(', ')}`));
    if (!t) return h('div', { class: 'satir-secimi-grubu' }, baslikEl, h('div', { class: 'alan-uyarisi' }, `"${g.tablo}" adında tablo yok (Ayarlar > Test verisi).`));
    const anahtar = grupAnahtari(t.id, g.etiket);
    const secim = tabloSecimleri[anahtar] || {};
    const secimVar = Object.keys(secim).length > 0;
    const acik = t.sutunlar.filter((c) => !c.gizli);
    const satirKosulu = (r) => Object.fromEntries(acik.filter((c) => r.degerler[c.ad] !== null && r.degerler[c.ad] !== undefined && r.degerler[c.ad] !== '')
      .map((c) => [c.ad, String(r.degerler[c.ad])]));
    const ayni = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
    const secilenSatir = secimVar ? t.satirlar.find((r) => ayni(satirKosulu(r), secim)) : null;
    const id = yeniId('satir');
    const sel = h('select', { id },
      h('option', { value: '', selected: !secimVar }, 'Otomatik (bağlı alanlar ve ortamla uyan ilk satır)'),
      h('optgroup', { label: 'Satır' }, t.satirlar.map((r) => h('option', { value: `s:${r.id}`, selected: secilenSatir === r },
        `${r.ad || 'Satır'}${acik.length ? ` — ${acik.slice(0, 3).map((c) => r.degerler[c.ad] ?? '—').join(' · ')}` : ''}${r.ortamId ? ` [${ortamAdi(r.ortamId)}]` : ''}`))),
      secimVar && !secilenSatir ? h('option', { value: 'kosul', selected: true }, `Koşullar: ${Object.entries(secim).map(([k, v]) => `${k} = ${v}`).join(', ')}`) : null);
    sel.addEventListener('change', () => {
      if (!sel.value) delete tabloSecimleri[anahtar];
      else if (sel.value.startsWith('s:')) {
        const r = t.satirlar.find((x) => `s:${x.id}` === sel.value);
        if (r) tabloSecimleri[anahtar] = satirKosulu(r);
      }
      degisti = true;
      satirSecimiCiz(true);
      if (!diyagramAlani.hidden) diyagramiCiz();
    });
    // Koşullar: açık sütun başına değer; bir sütunun seçenekleri kendinden önceki koşullarla uyan satırlardan (yukarıdan aşağı).
    const kosullar = acik.map((c, i) => {
      const onceki = Object.fromEntries(Object.entries(secim).filter(([k]) => acik.findIndex((x) => x.ad === k) < i));
      const secenekler = sutunSecenekleri(t, onceki, c.ad);
      const mevcut = secim[c.ad] || '';
      const k = h('select', { 'aria-label': `${t.ad} → ${c.ad} koşulu` }, h('option', { value: '' }, '— koşul yok —'),
        secenekler.map((x) => h('option', { value: x, selected: x === mevcut }, x)),
        mevcut && !secenekler.includes(mevcut) ? h('option', { value: mevcut, selected: true }, `${mevcut} (uyuşmuyor)`) : null);
      k.addEventListener('change', () => {
        const yeni = { ...secim };
        if (k.value) yeni[c.ad] = k.value; else delete yeni[c.ad];
        if (Object.keys(yeni).length) tabloSecimleri[anahtar] = yeni; else delete tabloSecimleri[anahtar];
        degisti = true;
        satirSecimiCiz(true);
      });
      return h('label', { class: 'kosul-satiri' }, h('span', {}, c.ad), k);
    });
    const uyan = uyanSatirlar(t, secim, { ortamId: s.ortam.id });
    const durum = !secimVar ? 'Koşuda bağlı alanların değerleri ve ortamla uyan ilk satır kullanılır.'
      : uyan.length === 1 ? `✓ ${s.ortam.ad} ortamında tek satır uyuyor.` : uyan.length ? `${uyan.length} satır uyuyor (${s.ortam.ad}) · koşuda ilki.` : `${s.ortam.ad} ortamında uyan satır yok.`;
    return h('div', { class: 'satir-secimi-grubu', 'data-tablo': t.ad },
      baslikEl, h('label', { class: 'gorunmez', for: id }, `${t.ad}${g.etiket ? ` [${g.etiket}]` : ''} satırı`), sel,
      h('div', { class: `alan-notu ${secimVar && !uyan.length ? 'alan-uyarisi' : ''}`.trim(), role: 'status' }, durum),
      acik.length ? h('details', { open: secimVar && !secilenSatir }, h('summary', { class: 'kucuk' }, 'Koşullar'), h('div', { class: 'kosul-izgarasi' }, kosullar)) : null);
  }

  // --- Beklenen sonuç -----------------------------------------------------------------------
  const bs = sema.beklenenSonuc;
  const beklenenKarti = h('section', { class: 'kart beklenen-karti', 'aria-labelledby': 'beklenen-baslik' });
  let adimSecimi = null;
  /** Beklenen uyarı elle mi yazılıyor (null: kayıtlı mesaja göre ilk çizimde belirlenir). */
  let beklenenElle = null;
  function beklenenCiz() {
    if (!bs) { beklenenKarti.hidden = true; return; }
    const tipAnahtari = `${bs.anahtar}.tip`;
    const ad = yeniId('bs');
    const secenekler = [[bs.basariTipi, 'Başarılı akış'], ...(bs.hataTipi ? [[bs.hataTipi, 'İş kuralı hatası beklenir']] : [])];
    const radyolar = secenekler.map(([d]) => h('input', { type: 'radio', name: ad, value: d, checked: degerler[tipAnahtari] === d }));
    radyolar.forEach((r) => r.addEventListener('change', () => { degerYaz(tipAnahtari, r.value); beklenenCiz(); }));
    const tipHata = hataKutusuOlustur(ad);
    kontrolKaydet(tipAnahtari, radyolar, tipHata, null);
    const govde = [h('div', { class: 'radyo-grubu', role: 'radiogroup', 'aria-label': bs.etiket }, radyolar.map((r, i) => h('label', {}, r, secenekler[i][1]))), tipHata];
    adimSecimi = null;
    const uyarilar = bs.uyarilar || [];
    if (degerler[tipAnahtari] !== bs.hataTipi && (bs.basariMesajlari || []).length) {
      govde.push(h('p', { class: 'eslesme-notu' }, ikon('hedef'), `Bu akışta başarı: ${bs.basariMesajlari.map((m) => `“${m}”`).join(' veya ')} (akışta tanımlı).`));
    }
    if (degerler[tipAnahtari] === bs.hataTipi && beklenenElle === null) {
      // Kayıtlı mesaj akıştaki uyarılardan biri değilse elle yazılmış hâliyle açılır.
      const m = String(degerler[`${bs.anahtar}.mesaj`] || '');
      beklenenElle = !uyarilar.length || (m !== '' && !uyarilar.some((u) => u.metin === m));
    }
    if (degerler[tipAnahtari] === bs.hataTipi && !beklenenElle) {
      // Akışta kabul edilen uyarılardan seçim: adım uyarının adımıdır; birden çok seçilirse (aynı adımda) VEYA.
      const adimAnahtari = `${bs.anahtar}.adim`;
      const listeAnahtari = `${bs.anahtar}.mesajlar`;
      const secili = Array.isArray(degerler[listeAnahtari]) ? degerler[listeAnahtari] : [];
      const gruplar = new Map();
      for (const u of uyarilar) (gruplar.get(u.adim) || gruplar.set(u.adim, { baslik: u.adimBasligi, liste: [] }).get(u.adim)).liste.push(u);
      const kutular = [];
      const lid = yeniId('bs-uyari');
      const listeEl = h('div', { class: 'uyari-secimi', id: lid, role: 'group', 'aria-labelledby': `${lid}-etiket`, 'aria-required': 'true' }, [...gruplar.entries()].map(([adimId, gr]) =>
        h('fieldset', {}, h('legend', {}, `${gr.baslik} adımında`), gr.liste.map((u) => {
          const k = h('input', { type: 'checkbox', checked: degerler[adimAnahtari] === adimId && secili.includes(u.metin) });
          kutular.push(k);
          k.addEventListener('change', () => {
            let yeni = degerler[adimAnahtari] === adimId ? secili.filter((m) => m !== u.metin) : [];
            if (k.checked) yeni = [...yeni, u.metin];
            degerYaz(adimAnahtari, yeni.length ? adimId : '');
            degerYaz(listeAnahtari, yeni);
            degerYaz(`${bs.anahtar}.mesaj`, yeni[0] || '');
            beklenenCiz();
          });
          return h('label', {}, k, u.metin);
        }))));
      const ah = hataKutusuOlustur(`${lid}-adim`);
      const mh = hataKutusuOlustur(lid);
      kontrolKaydet(adimAnahtari, kutular, ah, null);
      kontrolKaydet(`${bs.anahtar}.mesaj`, kutular, mh, null);
      govde.push(h('div', { class: 'hata-ayrintisi' },
        h('div', { class: 'model-alani genis' },
          h('div', { class: 'alan-ust' }, h('span', { class: 'etiket', id: `${lid}-etiket` }, 'Beklenen uyarı', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))),
          listeEl, ah, mh,
          h('div', { class: 'alan-notu' }, 'Birden fazla seçerseniz herhangi biri görünürse beklenen sonuç sağlanır. Uyarılar akışta tanımlanır (ekranın Akışlar sekmesi).'),
          h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { beklenenElle = true; degerYaz(listeAnahtari, []); beklenenCiz(); } }, 'Listede yok, elle yaz'))));
    } else if (degerler[tipAnahtari] === bs.hataTipi) {
      const aid = yeniId('bs-adim');
      adimSecimi = bagla(secimGirdisi(bs.adimlar, String(degerler[`${bs.anahtar}.adim`] || ''), 'Adım seçin…'), aid);
      adimSecimi.addEventListener('change', () => degerYaz(`${bs.anahtar}.adim`, adimSecimi.value));
      const ah = hataKutusuOlustur(aid);
      kontrolKaydet(`${bs.anahtar}.adim`, [adimSecimi], ah, null);
      const mid = yeniId('bs-mesaj');
      const mesaj = bagla(h('textarea', { rows: '3', placeholder: 'Ekranda beklenen uyarı metni (ya da bir parçası)' }), mid);
      mesaj.value = String(degerler[`${bs.anahtar}.mesaj`] || '');
      mesaj.addEventListener('input', () => { degerler[`${bs.anahtar}.mesajlar`] = []; degerYaz(`${bs.anahtar}.mesaj`, mesaj.value, { dokun: false }); });
      mesaj.addEventListener('change', () => { dokunulan.add(`${bs.anahtar}.mesaj`); planla(); });
      const mh = hataKutusuOlustur(mid);
      kontrolKaydet(`${bs.anahtar}.mesaj`, [mesaj], mh, null);
      govde.push(h('div', { class: 'hata-ayrintisi' },
        h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: aid }, bs.adimEtiketi || 'Adım', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), adimSecimi, ah),
        h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: mid }, bs.mesajEtiketi || 'Mesaj', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), mesaj, mh),
        h('p', { class: 'eslesme-notu' }, ikon('hedef'), 'Eşleşme toleranslıdır: büyük/küçük harf, kıvrık/düz tırnak ve boşluk farkları yok sayılır; ekranda görülen metnin beklenen mesajı içermesi yeterlidir.'),
        uyarilar.length ? h('div', { class: 'alan-notu' },
          String(degerler[`${bs.anahtar}.mesaj`] || '') && !uyarilar.some((u) => u.metin === degerler[`${bs.anahtar}.mesaj`])
            ? 'Bu mesaj akıştaki uyarılar arasında yok; elle yazılmış hâliyle kullanılır. ' : '',
          h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { beklenenElle = false; beklenenCiz(); } }, 'Akıştaki uyarılardan seç')) : null));
    }
    yerlestir(beklenenKarti,
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'beklenen-baslik' }, ikon('hedef'), 'Beklenen sonuç'),
        h('span', { class: 'alt' }, 'Test bu sonuca ulaşırsa başarılı sayılır')),
      ...govde);
    planla();
  }
  function beklenenAdimSecenekleriniGuncelle(g) {
    if (!adimSecimi || !bs) return;
    for (const opt of adimSecimi.options) {
      const s2 = bs.adimlar.find((x) => x.deger === opt.value);
      const kapali = Boolean(s2 && s2.kosul && g.adimlar[s2.deger] === false);
      opt.disabled = kapali;
      opt.textContent = s2 ? `${s2.metin}${kapali ? ' — adım kapsam dışında' : ''}` : opt.textContent;
    }
  }

  // --- Sağ sütun: kayıt özeti ----------------------------------------------------------------
  const ortamKutulari = h('div', { class: 'ortam-secimleri', role: 'group', 'aria-label': 'Senaryonun geçerli olduğu ortamlar' },
    s.ortamlar.map((o) => {
      const k = h('input', { type: 'checkbox', checked: ortamSecimi.has(o.id) });
      k.addEventListener('change', () => { if (k.checked) ortamSecimi.add(o.id); else ortamSecimi.delete(o.id); degisti = true; ortamHata.textContent = ''; girisCiz(); });
      return h('label', {}, k, o.ad);
    }));
  const ortamHata = h('div', { class: 'alan-hatasi', role: 'alert' });
  const kosudaKutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: kosuyaDahil, id: yeniId('kosuda') });
  kosudaKutu.addEventListener('change', () => { kosuyaDahil = kosudaKutu.checked; degisti = true; });
  const akisOzeti = h('ol', { class: 'akis-ozeti', 'aria-label': 'Akış özeti' });
  const dogrulamaOzeti = h('div', { class: 'dogrulama-ozeti', role: 'status' });
  const genelHatalar = h('ul', { class: 'not-kutusu hata', hidden: true });
  const kaydetDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), s.mod === 'yeni' ? 'Senaryoyu oluştur' : 'Değişiklikleri kaydet');
  const deneDugmesi = h('button', { type: 'button' }, ikon('oynat'), 'Dene');
  const vazgecDugmesi = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const denemeAlani = h('section', { class: 'kart', hidden: true, 'aria-labelledby': 'deneme-baslik', 'aria-live': 'polite' });

  function ozetiCiz(d) {
    const g = d.gorunurluk;
    const tip = bs ? degerler[`${bs.anahtar}.tip`] : null;
    const hataAdimi = bs && tip === bs.hataTipi ? degerler[`${bs.anahtar}.adim`] : null;
    const kapsamda = sema.adimlar.filter((a) => g.adimlar[a.id] !== false);
    const hedef = hataAdimi || (kapsamda.length ? kapsamda[kapsamda.length - 1].id : null);
    const hedefSirasi = sema.adimlar.findIndex((a) => a.id === hedef);
    yerlestir(akisOzeti, ...sema.adimlar.map((a, i) => {
      const disarida = g.adimlar[a.id] === false || (hataAdimi && i > hedefSirasi);
      return h('li', { class: [disarida ? 'kapsam-disi' : '', a.id === hedef ? `hedef ${hataAdimi ? 'hata' : ''}` : ''].join(' ').trim() || null },
        h('span', { class: 'nokta-no', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, a.baslik),
        a.id === hedef ? rozet(hataAdimi ? 'hata beklenir' : 'son adım', hataAdimi ? 'hata' : 'basari') : disarida ? h('span', { class: 'cok-soluk kucuk' }, 'koşulmaz') : null);
    }));
    const hataSayisi = hatalariDagit(d.hatalar, sema);
    const toplam = Object.values(hataSayisi.alanlar).reduce((t, x) => t + x.length, 0) + hataSayisi.genel.length;
    dogrulamaOzeti.className = `dogrulama-ozeti ${toplam ? 'hatali' : 'gecerli'}`;
    yerlestir(dogrulamaOzeti, ikon(toplam ? 'uyari' : 'onay'),
      h('span', {}, toplam ? `${toplam} alan düzeltilmeli` : 'Tüm kurallar sağlanıyor'),
      toplam ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { gonderildi = true; guncelle(); ilkHatayaGit(); } }, 'Göster') : null,
      d.uyarilar.length ? rozet(`${d.uyarilar.length} uyarı`, 'atlanan', { title: d.uyarilar.map((u) => u.mesaj).join('\n') }) : null);
  }

  function gorunenHatayaOdaklan() {
    for (const [, k] of kontroller) {
      if (k.hata && k.hata.textContent && k.girdiler[0] && k.girdiler[0].offsetParent !== null) { k.girdiler[0].focus(); k.girdiler[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; }
    }
    return false;
  }
  function ilkHatayaGit() {
    if (gorunenHatayaOdaklan()) return;
    // Diyagram açıksa: hatası olan ilk kutunun düzenleme alanı açılır, hatalı alana gidilir.
    if (!diyagramAlani.hidden) {
      const dagilim = hataDugumleri(hatalariDagit(sonDurum.hatalar, sema).alanlar, sema);
      const ilk = [GIRIS_DUGUMU, ...sema.adimlar.map((a) => adimDugumu(a.id)), SONUC_DUGUMU].find((x) => (dagilim[x] || []).length);
      if (ilk) {
        if (seciliDugum !== ilk) dugumSec(ilk);
        if (gorunenHatayaOdaklan()) return;
      }
    }
    if (!genelHatalar.hidden) genelHatalar.scrollIntoView({ block: 'center' });
  }

  function sunucuHatalariniGoster(e) {
    if (Array.isArray(e.govde?.hatalar)) {
      const dagit = hatalariDagit(e.govde.hatalar, sema);
      for (const [anahtar, mesajlar] of Object.entries(dagit.alanlar)) {
        const k = kontroller.get(anahtar);
        if (k && k.hata) k.hata.textContent = mesajlar.join(' ');
      }
      const ortamMesaji = e.govde.hatalar.find((x) => x.alan === 'ortamlar');
      if (ortamMesaji) ortamHata.textContent = ortamMesaji.mesaj;
      const genel = [...dagit.genel].filter((m) => !m.startsWith('ortamlar'));
      yerlestir(genelHatalar, ...genel.map((m) => h('li', {}, m)));
      genelHatalar.hidden = !genel.length;
      ilkHatayaGit();
      return;
    }
    yerlestir(genelHatalar, h('li', {}, e.message));
    genelHatalar.hidden = false;
    genelHatalar.scrollIntoView({ block: 'center' });
  }

  kaydetDugmesi.addEventListener('click', async () => {
    gonderildi = true;
    const d = hesapla();
    guncelle();
    if (!ortamSecimi.size) { ortamHata.textContent = 'En az bir ortam seçin.'; return; }
    if (d.hatalar.length) { ilkHatayaGit(); return; }
    kaydetDugmesi.disabled = true;
    try {
      const veri = d.senaryo;
      const yanit = await api('/platform/senaryo/kaydet', {
        govde: {
          ...(senaryo ? { id: senaryo.id } : { ekranId: baglam.ekran.id }), projeId: s.proje.id, baslik: baslikDegeri, veri,
          ...(baglam.akisId ? { akisId: baglam.akisId } : {}),
          ortamIdleri: [...ortamSecimi], kosuyaDahil, mutlakaGorunmeli: [...mutlaka],
          // Model girişsizse seçim yok sayılır (her zaman girişsiz); varsayılan seçim sunucuda içeriğe yazılmaz.
          giris: modelGirissiz ? null : girisSecimi,
          // Satır seçimleri (yalnız formda kullanılan tablo grupları; boşsa kaldırılır).
          tabloSecimleri: kaydedilecekSecimler()
        }
      });
      degisti = false;
      bildir(s.mod === 'yeni' ? 'Senaryo oluşturuldu.' : 'Senaryo kaydedildi.');
      if (yanit.uyarilar && yanit.uyarilar.length) bildir(`${yanit.uyarilar.length} uyarı: ${yanit.uyarilar[0].mesaj}`, 'hata');
      s.geri();
    } catch (e) {
      if (e && e.durum === 423) return;
      sunucuHatalariniGoster(e);
    } finally { kaydetDugmesi.disabled = false; }
  });

  vazgecDugmesi.addEventListener('click', async () => {
    if (degisti && !(await onayIste({ baslik: 'Değişiklikler kaydedilmedi', metin: 'Formdaki kaydedilmemiş değişiklikler kaybolacak.', dugme: 'Çık', tehlikeli: false, ikonAd: 'uyari' }))) return;
    degisiklikleriBirak();
    s.geri();
  });

  // --- Dene (deneme koşusu; taslak kaydedilmez) -----------------------------------------------
  let deneme = null;
  deneDugmesi.addEventListener('click', async () => {
    gonderildi = true;
    const d = hesapla();
    guncelle();
    const baslikDisi = d.hatalar.filter((x) => x.alan !== sema.baslik);
    if (baslikDisi.length) { ilkHatayaGit(); return; }
    const ortamId = ortamSecimi.has(s.ortam.id) ? s.ortam.id : [...ortamSecimi][0] || s.ortam.id;
    const ortam = s.ortamlar.find((o) => o.id === ortamId) || s.ortam;
    if (!ortam.varsayilan && !(await onayIste({ baslik: `${ortam.ad} ortamında denensin mi?`, metin: 'Bu ortam varsayılan test ortamı değil; deneme gerçek işlem oluşturabilir.', dugme: 'Dene', ikonAd: 'uyari' }))) return;
    const kosuId = kimlikUret();
    deneme = { kosuId, bitti: false };
    deneDugmesi.disabled = true;
    kaydetDugmesi.disabled = true;
    denemeCiz({ durum: 'calisiyor', kosuId, ortam });
    try {
      const yanit = await api('/platform/senaryo/dene', {
        govde: {
          projeId: s.proje.id, ekranId: baglam.ekran.id, ortamId, veri: d.senaryo, kosuId, ...(senaryo ? { id: senaryo.id } : {}),
          ...(baglam.akisId ? { akisId: baglam.akisId } : {}), mutlakaGorunmeli: [...mutlaka], giris: modelGirissiz ? null : girisSecimi,
          tabloSecimleri: kaydedilecekSecimler()
        }
      });
      deneme.bitti = true;
      denemeCiz({ durum: 'bitti', yanit, ortam });
    } catch (e) {
      deneme.bitti = true;
      if (e && e.durum === 423) return;
      if (Array.isArray(e.govde?.hatalar)) { sunucuHatalariniGoster(e); denemeAlani.hidden = true; }
      else denemeCiz({ durum: 'bitti', yanit: { basarili: false, mesaj: e.message }, ortam });
    } finally {
      deneDugmesi.disabled = false;
      kaydetDugmesi.disabled = false;
    }
  });

  let canliZamanlayici = null;
  function denemeCiz(d) {
    clearInterval(canliZamanlayici);
    denemeAlani.hidden = false;
    const baslik = h('div', { class: 'kart-basligi' }, h('h3', { id: 'deneme-baslik' }, ikon('oynat'), 'Deneme'), h('span', { class: 'alt' }, `${d.ortam.ad} · taslak kaydedilmez`));
    if (d.durum === 'calisiyor') {
      const img = h('img', { alt: 'Deneme: canlı ekran görüntüsü' });
      const bos = h('div', { class: 'medya-bos' }, h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), 'Deneme başlatıldı; canlı görüntü bekleniyor…');
      const durdur = h('button', { type: 'button', class: 'kucuk-dugme tehlike' }, h('span', { class: 'kare-simge', 'aria-hidden': 'true' }), 'Durdur');
      durdur.addEventListener('click', async () => {
        durdur.disabled = true;
        durdur.textContent = 'Durduruluyor…';
        try { await api('/durdur', { govde: { kosuId: d.kosuId } }); } catch (e) { bildir(e.message, 'hata'); }
      });
      const yukle = () => {
        const on = new Image();
        on.onload = () => { img.src = on.src; if (bos.isConnected) bos.replaceWith(img); };
        on.src = `/canli?token=${encodeURIComponent(TOKEN)}&kosuId=${encodeURIComponent(d.kosuId)}&t=${Date.now()}`;
      };
      canliZamanlayici = setInterval(() => { if (!denemeAlani.isConnected || deneme?.bitti) { clearInterval(canliZamanlayici); return; } yukle(); }, 1200);
      yukle();
      yerlestir(denemeAlani, baslik,
        h('div', { class: 'deneme-sonucu' },
          h('div', { class: 'izleme-basligi satir' }, h('span', { class: 'canli-rozeti' }, 'CANLI'), h('span', { class: 'soluk kucuk' }, 'Senaryo koşuyor…'), h('span', { class: 'bosluk' }), durdur),
          h('div', { class: 'goruntuleyici' }, h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, 'canlı')), bos)));
      denemeAlani.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const y = d.yanit || {};
    const durumu = !y.basarili ? ['Çalıştırılamadı', 'hata'] : y.durum === 'passed' ? ['Başarılı', 'basari'] : y.durum === 'iptal' ? ['Durduruldu', 'durdu'] : y.durum === 'skipped' ? ['Atlandı', 'atlanan'] : ['Başarısız', 'hata'];
    const oneri = y.basarili && y.durum !== 'passed' && y.durum !== 'iptal' ? beklenenHataOnerisi(y, sema) : null;
    const gorsel = y.ekranGoruntusuId ? h('a', { href: medyaUrl(y.ekranGoruntusuId), target: '_blank', rel: 'noopener', class: 'onizleme-dugmesi', 'aria-label': 'Son ekran görüntüsünü yeni sekmede aç' }, h('img', { src: medyaUrl(y.ekranGoruntusuId), alt: 'Son ekran görüntüsü' })) : null;
    const kullan = oneri ? h('button', { type: 'button', class: 'kucuk-dugme birincil' }, ikon('hedef'), 'Bu mesajı beklenen hata olarak kullan') : null;
    if (kullan) {
      kullan.addEventListener('click', () => {
        degerler[`${bs.anahtar}.tip`] = bs.hataTipi;
        degerler[`${bs.anahtar}.mesaj`] = oneri.mesaj;
        degerler[`${bs.anahtar}.mesajlar`] = [oneri.mesaj];
        beklenenElle = null;
        if (oneri.adim) {
          degerler[`${bs.anahtar}.adim`] = oneri.adim;
          const grup = sema.adimKapsami.find((k) => k.adimlar.includes(oneri.adim));
          if (grup) {
            degerler[grup.ayar] = true;
            for (const k of adimAkisi.querySelectorAll(`input[data-ayar="${CSS.escape(grup.ayar)}"]`)) k.checked = true;
          }
        }
        degisti = true;
        beklenenCiz();
        guncelle();
        kullan.disabled = true;
        bildir(`Form güncellendi: iş kuralı hatası beklenir${oneri.adim ? '' : ' (adım çıkarılamadı, seçimi kontrol edin)'}. Kaydetmeden önce yeniden deneyebilirsiniz.`);
        beklenenKarti.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    yerlestir(denemeAlani, baslik,
      h('div', { class: 'deneme-sonucu' },
        h('div', { class: 'izleme-basligi' }, rozet(durumu[0], durumu[1]), y.sureMs != null ? h('span', { class: 'cok-soluk mono kucuk' }, `${(y.sureMs / 1000).toFixed(1).replace('.', ',')} sn`) : null),
        gorsel ? h('div', { class: `goruntuleyici ${durumu[1] === 'hata' ? 'hata-ani' : ''}` }, h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, 'son ekran görüntüsü')), gorsel) : null,
        y.videoId ? h('a', { class: 'dugme kucuk-dugme', href: medyaUrl(y.videoId), target: '_blank', rel: 'noopener' }, ikon('video'), 'Videoyu aç') : null,
        y.hataMesaji || (!y.basarili && y.mesaj) ? h('div', { class: 'hata-ozeti' }, h('b', {}, 'Hata: '), String(y.hataMesaji || y.mesaj).split('\n').find((x) => x.trim()) || '') : null,
        y.basarisizAdim ? h('p', { class: 'soluk kucuk' }, `Başarısız adım: ${y.basarisizAdim}`) : null,
        oneri ? h('div', { class: 'not-kutusu bilgi' }, h('p', {}, `Görülen mesaj: “${oneri.mesaj}”`), kullan) : null));
  }

  // --- Akış diyagramı (sekme) -------------------------------------------------------------------
  const diyagramAlani = h('section', { class: 'kart akis-diyagrami', role: 'tabpanel', hidden: true, id: yeniId('diyagram'), 'aria-label': 'Akış diyagramı' });
  const formAlani = h('div', { class: 'form-sekmesi', role: 'tabpanel', id: yeniId('form'), 'aria-label': 'Form' });
  /** @type {{ durum: 'yeni' | 'yukleniyor' | 'hazir' | 'hata'; sonuc?: any; hata?: string }} */
  let sonKosu = { durum: senaryo ? 'yukleniyor' : 'yeni' };
  let sonKosuIstendi = false;

  // Diyagramdan düzenleme: seçili kutunun altındaki kalıcı alan (li). İçeriği formun kendi öğeleridir (taşınır, kopyalanmaz):
  // adımın alan gövdesi, senaryo kartı (giriş, başlık, senaryo ayarları) ya da beklenen sonuç kartı.
  /** @type {string | null} */
  let seciliDugum = null;
  /** @type {{ el: HTMLElement; ebeveyn: Node | null; sonraki: Node | null } | null} */
  let tasinan = null;
  const panelBasligi = h('h3', { tabindex: '-1', id: yeniId('dp-baslik') });
  const panelBilgisi = h('div', { class: 'diyagram-paneli-bilgi' });
  const panelIcerigi = h('div', { class: 'diyagram-paneli-icerik' });
  const diyagramPaneli = h('li', { class: 'diyagram-paneli', id: yeniId('diyagram-paneli'), hidden: true },
    h('section', { 'aria-labelledby': panelBasligi.id },
      h('div', { class: 'diyagram-paneli-ust' }, ikon('duzenle'), panelBasligi,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'data-odak': 'panel-kapat', onclick: () => dugumSec(null) }, ikon('carpi'), 'Kapat')),
      panelBilgisi, panelIcerigi));
  diyagramPaneli.addEventListener('keydown', (o) => {
    if (o.key !== 'Escape' || /** @type {HTMLElement} */ (o.target).tagName === 'SELECT') return;
    o.stopPropagation();
    dugumSec(null);
  });
  function tasi(el) {
    tasinan = { el, ebeveyn: el.parentNode, sonraki: el.nextSibling };
    panelIcerigi.append(el);
  }
  function geriVer() {
    if (!tasinan) return;
    const { el, ebeveyn, sonraki } = tasinan;
    tasinan = null;
    if (ebeveyn) ebeveyn.insertBefore(el, sonraki && sonraki.parentNode === ebeveyn ? sonraki : null);
  }
  const seciliAdim = () => (seciliDugum && seciliDugum.startsWith('adim:') ? sema.adimlar.find((a) => adimDugumu(a.id) === seciliDugum) || null : null);
  function panelDoldur() {
    geriVer();
    if (seciliDugum === GIRIS_DUGUMU) { panelBasligi.textContent = 'Giriş ve senaryo ayarları'; tasi(senaryoKarti); return; }
    if (seciliDugum === SONUC_DUGUMU) { panelBasligi.textContent = 'Beklenen sonuç'; tasi(beklenenKarti); return; }
    const adim = seciliAdim();
    const kart = adim ? adimKartlari.get(adim.id) : null;
    if (!adim || !kart) { seciliDugum = null; return; }
    panelBasligi.textContent = `${sema.adimlar.indexOf(adim) + 1}. ${adim.baslik}`;
    tasi(kart.govde);
  }
  /** Kutuyu seçer (null: kapatır); odak düzenleme alanının başlığına, kapatınca kutunun "Düzenle" düğmesine döner. */
  function dugumSec(id) {
    const onceki = seciliDugum;
    seciliDugum = id;
    if (id) panelDoldur(); else geriVer();
    diyagramiCiz();
    if (seciliDugum) {
      diyagramPaneli.scrollIntoView({ block: 'nearest' });
      panelBasligi.focus({ preventScroll: true });
    } else if (onceki) {
      /** @type {HTMLElement | null} */ (diyagramAlani.querySelector(`[data-odak="${CSS.escape(`ac:${onceki}`)}"]`))?.focus();
    }
  }
  /** İsteğe bağlı adımın "Bu senaryoda dahil" anahtarı (diyagram kutusunda; formdaki anahtarla aynı değeri yazar). */
  function diyagramKapsamAnahtari(adimId) {
    const adim = sema.adimlar.find((a) => a.id === adimId);
    if (!adim || !adim.ayar) return null;
    const kutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: degerler[adim.ayar] === true, 'data-odak': `kapsam:${adimId}`, 'aria-label': `${adim.baslik}: bu senaryoda dahil` });
    kutu.addEventListener('change', () => {
      degerYaz(adim.ayar, kutu.checked);
      for (const k of adimAkisi.querySelectorAll(`input[data-ayar="${CSS.escape(adim.ayar)}"]`)) k.checked = kutu.checked;
    });
    return h('label', { class: 'kapsam-anahtari' }, kutu, 'Bu senaryoda dahil');
  }
  /** Beklenen hatayı bu adıma kurar ve beklenen sonucun düzenleme alanını açar (mesaj orada yazılır / seçilir). */
  function buradaHataBekle(adimId) {
    const tipA = `${bs.anahtar}.tip`;
    const adimA = `${bs.anahtar}.adim`;
    const degisti2 = degerler[adimA] !== adimId || degerler[tipA] !== bs.hataTipi;
    degerYaz(tipA, bs.hataTipi, { dokun: false });
    degerYaz(adimA, adimId, { dokun: false });
    const uyarilar = (bs.uyarilar || []).filter((u) => u.adim === adimId);
    if (degisti2 && uyarilar.length) { degerYaz(`${bs.anahtar}.mesajlar`, [], { dokun: false }); degerYaz(`${bs.anahtar}.mesaj`, '', { dokun: false }); }
    beklenenElle = !uyarilar.length;
    // İsteğe bağlı adımsa senaryoya dahil edilir (hata o adımda beklenir).
    const grup = sema.adimKapsami.find((k) => k.adimlar.includes(adimId));
    if (grup && degerler[grup.ayar] !== true) {
      degerYaz(grup.ayar, true);
      for (const k of adimAkisi.querySelectorAll(`input[data-ayar="${CSS.escape(grup.ayar)}"]`)) k.checked = true;
    }
    beklenenCiz();
    guncelle();
    dugumSec(SONUC_DUGUMU);
    const ilkGirdi = /** @type {HTMLElement | null} */ (beklenenKarti.querySelector('.hata-ayrintisi textarea, .hata-ayrintisi input'));
    if (ilkGirdi) ilkGirdi.focus();
    bildir('Beklenen sonuç: bu adımda iş kuralı hatası. Beklenen mesajı yazın ya da seçin.');
  }
  function basariBekle() {
    degerYaz(`${bs.anahtar}.tip`, bs.basariTipi, { dokun: false });
    beklenenCiz();
    guncelle();
    /** @type {HTMLElement | null} */ (diyagramAlani.querySelector('[data-odak="panel-hata"]'))?.focus();
  }
  /** Düzenleme alanının üst bilgisi: koşulmama nedeni, hata beklentisi düğmeleri. */
  function panelBilgisiniCiz(diyagram) {
    const parcalar = [];
    const adim = seciliAdim();
    if (adim) {
      const da = diyagram.adimlar.find((x) => x.id === adim.id);
      const kart = adimKartlari.get(adim.id);
      if (da && da.kosulur === false) {
        parcalar.push(h('p', { class: 'not-kutusu uyari' }, `Bu senaryoda koşulmaz: ${da.neden || ''} Bu adımın alanları kayda yazılmaz.`));
      }
      if (kart && !kart.alanSayisi) parcalar.push(h('p', { class: 'soluk kucuk' }, 'Bu adımda senaryoya özel alan yok.'));
      const secilebilir = bs && bs.hataTipi && bs.adimlar.some((x) => x.deger === adim.id);
      if (secilebilir) {
        const burada = degerler[`${bs.anahtar}.tip`] === bs.hataTipi && degerler[`${bs.anahtar}.adim`] === adim.id;
        const kosulKapali = sonDurum.gorunurluk && sonDurum.gorunurluk.adimlar[adim.id] === false && !adim.ayar;
        parcalar.push(h('div', { class: 'diyagram-paneli-hedef' }, burada
          ? [h('span', { class: 'rozet hata' }, ikon('uyari'), 'Bu adımda iş kuralı hatası beklenir'),
            h('button', { type: 'button', class: 'kucuk-dugme', 'data-odak': 'panel-mesaj', onclick: () => dugumSec(SONUC_DUGUMU) }, ikon('hedef'), 'Beklenen mesajı düzenle'),
            h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'data-odak': 'panel-basari', onclick: basariBekle }, 'Hata beklentisini kaldır')]
          : kosulKapali ? h('span', { class: 'soluk kucuk' }, 'Adım bu senaryoda koşulmadığı için burada hata beklenemez.')
            : h('button', { type: 'button', class: 'kucuk-dugme', 'data-odak': 'panel-hata', onclick: () => buradaHataBekle(adim.id) }, ikon('uyari'), 'Burada hata beklenir')));
      }
    } else if (seciliDugum === SONUC_DUGUMU && !bs) {
      parcalar.push(h('p', { class: 'soluk kucuk' }, 'Bu ekranın modelinde beklenen sonuç seçimi yok: kapsamdaki son adımın başarı göstergesi beklenir.'));
    }
    yerlestir(panelBilgisi, ...parcalar);
    panelBilgisi.hidden = !parcalar.length;
  }
  /** Diyagram kutularında gösterilecek değer okunuşları (hassas değer maskeli; dosyada yalnız ad). */
  function degerOzetleri() {
    /** @type {Record<string, string | null>} */
    const o = {};
    const kisa = (m) => (m.length > 60 ? `${m.slice(0, 59)}…` : m);
    for (const alan of tumAlanlar) {
      if (!alan.adimId) continue;
      let m = null;
      const v = degerler[alan.anahtar];
      if (alan.tip === 'secim') { const x = String(v ?? ''); m = x ? (alanSecenekleri(alan).find((y) => y.deger === x)?.metin ?? x) : null; }
      else if (alan.tip === 'onayKutusu') m = v === true ? 'işaretli' : null;
      else if (alan.tip === 'dosya') { const x = String(v ?? ''); m = x ? (dosyaBilgileri[x]?.ad || dosyaReferansiCoz(x)?.ad || x) : null; }
      else if (alan.tip === 'kimlik') { const kip = degerler[`${alan.id}#kip`]; m = kip === 'profil' ? String(degerler[`${alan.id}#profil`] || '') || 'profil seçilmedi' : kip === 'yeni' ? 'yeni kimlik' : null; }
      else if (alan.tip === 'altModel') m = degerler[`${alan.anahtar}#ozel`] === true ? 'senaryoya özel' : null;
      else { const x = String(v ?? '').trim(); m = x ? (alan.hassas ? '••••' : x) : null; }
      o[alan.id] = m ? kisa(String(m)) : null;
    }
    return o;
  }
  function diyagramiCiz() {
    const d = sonDurum.gorunurluk ? sonDurum : hesapla();
    const tip = bs ? degerler[`${bs.anahtar}.tip`] : null;
    const hataAdimi = bs && tip === bs.hataTipi ? String(degerler[`${bs.anahtar}.adim`] || '') || null : null;
    let diyagram;
    try {
      diyagram = akisDiyagrami(baglam.model, {
        gorunurluk: d.gorunurluk,
        beklenen: hataAdimi ? { hataAdimi, mesaj: String(degerler[`${bs.anahtar}.mesaj`] || '') || null } : null,
        sonuc: sonKosu.durum === 'hazir' ? sonKosu.sonuc : null,
        giris: girisSecimi,
        degerler: degerOzetleri()
      });
    } catch (e) {
      geriVer();
      seciliDugum = null;
      yerlestir(diyagramAlani, hataKutusu(e));
      return;
    }
    // Yeniden çizimde kutular yenilenir; odak kutudaki bir denetimdeyse (anahtar, Düzenle) yeni karşılığına döner.
    const odak = /** @type {HTMLElement | null} */ (document.activeElement);
    const odakAnahtari = odak && diyagramAlani.contains(odak) ? odak.dataset.odak || null : null;
    panelBilgisiniCiz(diyagram);
    const ekranId = baglam.ekran?.id || s.ekranId;
    akisDiyagramiCiz(diyagramAlani, diyagram, {
      ...sonKosu, ortamAdi: s.ortam.ad, projeId: s.proje.id, ortamId: s.ortam.id,
      duzenleme: {
        secili: seciliDugum, sec: dugumSec, panel: diyagramPaneli, panelId: diyagramPaneli.id,
        hatalar: hataDugumleri(hatalariDagit(d.hatalar, sema).alanlar, sema),
        kapsamAnahtari: diyagramKapsamAnahtari,
        akisAdresi: ekranId ? `#/ekranlar/e/${encodeURIComponent(ekranId)}/akis${baglam.akisId ? `/${encodeURIComponent(baglam.akisId)}` : ''}` : null
      }
    });
    if (odakAnahtari && odak && !odak.isConnected) {
      /** @type {HTMLElement | null} */ (diyagramAlani.querySelector(`[data-odak="${CSS.escape(odakAnahtari)}"]`))?.focus();
    }
  }
  async function sonKosuyuOku() {
    if (!senaryo || sonKosuIstendi) return;
    sonKosuIstendi = true;
    try {
      const y = await api(`/platform/senaryo/son-sonuc?id=${encodeURIComponent(senaryo.id)}&ortamId=${encodeURIComponent(s.ortam.id)}`);
      sonKosu = { durum: 'hazir', sonuc: y.sonuc };
    } catch (e) {
      if (e && e.durum === 423) return;
      sonKosu = { durum: 'hata', hata: e.message };
    }
    if (!diyagramAlani.hidden) diyagramiCiz();
  }
  const sekmeler = [['form', 'Form', formAlani], ['akis', 'Akış diyagramı', diyagramAlani]];
  const sekmeDugmeleri = sekmeler.map(([ad, etiket, panel]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': ad === 'form' ? 'true' : 'false', 'aria-controls': panel.id, 'data-sekme': ad,
    onclick: () => sekmeSec(ad)
  }, ikon(ad === 'form' ? 'liste' : 'katman'), etiket));
  function sekmeSec(ad) {
    for (const b of sekmeDugmeleri) b.setAttribute('aria-selected', b.dataset.sekme === ad ? 'true' : 'false');
    // Form sekmesine dönünce diyagramın düzenleme alanına taşınan öğeler yerlerine geri konur (seçim korunur; diyagram
    // yeniden açılınca aynı kutu açık gelir).
    if (ad === 'form') geriVer();
    formAlani.hidden = ad !== 'form';
    diyagramAlani.hidden = ad !== 'akis';
    if (ad === 'akis') { if (seciliDugum) panelDoldur(); diyagramiCiz(); sonKosuyuOku(); }
  }
  const sekmeCubugu = h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Senaryo görünümü' }, sekmeDugmeleri);

  // --- Yerleşim --------------------------------------------------------------------------------
  const meta = [
    h('span', {}, ikon('katman'), `${sema.modelAdi || baglam.ekran.ad} modeli${baglam.modelSurumu ? ` · sürüm ${baglam.modelSurumu}` : ''}`),
    h('span', {}, ikon('ag'), `doğrulama bağlamı: ${s.ortam.ad}`),
    senaryo ? h('span', { class: 'mono cok-soluk' }, senaryo.id) : null
  ];
  yerlestir(icerik, 
    sayfaBasligi(s, s.mod === 'yeni' ? 'Yeni senaryo' : senaryo.baslik, meta, h('button', { type: 'button', class: 'hayalet', onclick: () => vazgecDugmesi.click() }, ikon('geri'), 'Listeye dön')),
    h('div', { class: 'form-duzeni' },
      h('div', { class: 'form-sutunu' }, sekmeCubugu, formAlani, diyagramAlani),
      h('aside', { class: 'ozet-sutunu', 'aria-label': 'Kayıt' },
        h('section', { class: 'kart form-paneli', 'aria-labelledby': 'kayit-baslik' },
          h('h3', { id: 'kayit-baslik' }, 'Kayıt'),
          h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', {}, 'Ortamlar')), ortamKutulari, ortamHata),
          h('label', { class: 'onay-satiri', for: kosudaKutu.id }, kosudaKutu, 'Koşuda'),
          h('div', { class: 'bolum-grubu' }, h('h4', {}, 'Akış'), akisOzeti),
          dogrulamaOzeti, genelHatalar,
          h('div', { class: 'form-eylemleri' }, kaydetDugmesi, deneDugmesi, vazgecDugmesi)),
        denemeAlani)));
  formAlani.append(senaryoKarti, adimAkisi, satirSecimiKarti, beklenenKarti);
  beklenenCiz();
  guncelle();
  if (s.taslak) {
    // Akış değişti: yeni akışta olmayan değerler kaldırıldı mı?
    degisti = true;
    const yeni = hesapla().senaryo;
    const doluMu = (d) => d !== undefined && d !== null && d !== '' && d !== false && !(Array.isArray(d) && !d.length);
    const kayip = Object.keys(s.taslak.veri || {}).filter((k) => !(k in yeni) && !/^baslik$/.test(k) && doluMu(s.taslak.veri[k]));
    bildir(kayip.length ? `Akış değişti; yeni akışta olmayan ${kayip.length} alanın değeri kaldırıldı.` : 'Akış değişti; form yeni akışa göre güncellendi.', kayip.length ? 'hata' : 'basari');
  }
  (s.mod === 'yeni' ? baslikGirdisi : icerik.querySelector('h2'))?.focus();
  // Akış seçimi diyagramdan değiştirildiyse diyagram sekmesi açık kalır.
  if (s.taslak?.sekme === 'akis') sekmeSec('akis');
}
