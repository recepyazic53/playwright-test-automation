// BASİT MOD — kabuğun (uygulama.js) Basit / Gelişmiş parçaları. Mod çalışma alanının ayarıdır (sunucu: ayarlar/kullanim-modu.mjs;
// kayıt yoksa Gelişmiş). Gelişmiş = bugünkü arayüz; Basit modda üst menü yalnız Testlerim · Sonuçlar · Ayarlar, "Oluştur" yerine
// "+ Yeni test". Hiçbir veri gizlenmez ya da silinmez: Gelişmiş'e ait bir adres Basit modda da açılır, üstte not görünür.
//   Sayfalar: #/testlerim (testlerim.js), #/basit-sonuclar[/kosu/<id>] (basit-sonuclar.js), #/hizli-test (Hızlı test sihirbazı:
//   hizli-test.js; Gelişmiş modda da açılır — Oluştur menüsü ve Ekran ekle sayfası).
//   Geçiş: Basit → Gelişmiş ilk seferde açıklamalı onayla (bir kez; işaret kasada), Gelişmiş → Basit sorusuz. Kaydedilmemiş
//   değişiklik varsa önce çıkış onayı sorulur.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, degisiklikleriBirak, h, ikon, kayitIzi, mesajKutusu, mesgulIken } from './ortak.js';

/** Basit moda ait sayfalar (bölüm adları). */
export const BASIT_SAYFALAR = Object.freeze(['testlerim', 'basit-sonuclar', 'hizli-test']);
/** Her iki modda da menüde olan bölümler (Basit modda "Gelişmiş moda ait" notu çıkmaz). */
const ORTAK_BOLUMLER = new Set(['ayarlar']);

/** @typedef {{ mod: 'basit' | 'gelismis'; kayitli: boolean; gelismisAciklamasiGoruldu: boolean }} KullanimModu */

/** Kayıt okunamazsa (eski sunucu, hata) bugünkü arayüz. @type {KullanimModu} */
export const VARSAYILAN_MOD = Object.freeze({ mod: 'gelismis', kayitli: false, gelismisAciklamasiGoruldu: false });

/** Çalışma alanının kullanım modu (kasa açık olmalı). @returns {Promise<KullanimModu>} */
export async function kullanimModunuAl() {
  try {
    const { kullanimModu } = await api('/platform/kullanim-modu');
    return kullanimModu && (kullanimModu.mod === 'basit' || kullanimModu.mod === 'gelismis') ? kullanimModu : VARSAYILAN_MOD;
  } catch {
    return VARSAYILAN_MOD;
  }
}

/** Modun açılış adresi. @param {string} mod */
export const modunAnaSayfasi = (mod) => (mod === 'basit' ? '#/testlerim' : '#/sonuclar/ozet');

/** Adresin bölümü ("#/testlerim/x" → "testlerim"). @param {string} hash */
const bolumu = (hash) => String(hash || '').split('/')[1] || '';

/** Basit modda bu bölüm Gelişmiş'e mi ait (üstte not)? @param {string} bolum */
export const gelismisBolumuMu = (bolum) => Boolean(bolum) && !BASIT_SAYFALAR.includes(bolum) && !ORTAK_BOLUMLER.has(bolum);

/**
 * Mod değişince gidilecek adres: ortak sayfa (Ayarlar) ve hedef moda ait sayfa yerinde kalır; diğerlerinde hedef modun karşılığı.
 * @param {'basit' | 'gelismis'} hedef @param {string} hash
 */
export function gecisAdresi(hedef, hash) {
  const bolum = bolumu(hash);
  if (ORTAK_BOLUMLER.has(bolum)) return hash;
  if (hedef === 'basit') return BASIT_SAYFALAR.includes(bolum) ? hash : '#/testlerim';
  if (bolum === 'testlerim') return '#/senaryolar';
  if (bolum === 'basit-sonuclar') return '#/sonuclar/ozet';
  // Hızlı test sihirbazı iki modda da aynıdır: yerinde kalır (süren sihirbaz kesilmez).
  if (bolum === 'hizli-test') return hash;
  return hash || modunAnaSayfasi(hedef);
}

/** Gelişmiş'e ilk geçişte gösterilen açıklama (ne açılır; hiçbir veri değişmez). @returns {Promise<boolean>} */
async function gelismisAciklamasi() {
  const { onayIste } = await import('./kosu-paneli.js');
  return onayIste({
    baslik: 'Gelişmiş moda geç', ikonAd: 'katman', dugme: 'Gelişmiş\'e geç',
    metin: 'Gelişmiş modda şunlar da görünür: ekran modeli ve sürümleri, akış diyagramı, genel senaryolar, test verisi tabloları ve alan bağlantıları, servisler ve servis akışları, uçtan uca akışlar, senaryo önerileri ve kapsam, planlı koşular, kurtarma kuralları ve paket yükleme.',
    ek: h('div', { class: 'not-kutusu bilgi', role: 'note' }, h('p', {}, h('strong', {}, 'Hiçbir veri değişmez. '), 'Basit moda üst çubuktaki anahtarla istediğiniz zaman dönebilirsiniz.'))
  });
}

/**
 * Modu değiştirir: gerekirse önce çıkış onayı (kaydedilmemiş değişiklik) ve Gelişmiş açıklaması (bir kez); sonra kasaya yazar.
 * @param {KullanimModu} simdiki @param {'basit' | 'gelismis'} hedef @returns {Promise<KullanimModu | null>} yeni ayar ya da null (vazgeçildi / hata)
 */
export async function modaGec(simdiki, hedef) {
  if (simdiki.mod === hedef) return simdiki;
  if (kayitIzi.kirli) {
    const { onayIste } = await import('./kosu-paneli.js');
    const tamam = await onayIste({
      baslik: 'Değişiklikleriniz kaydedilmeyecek', ikonAd: 'uyari', dugme: 'Kaydetmeden geç',
      metin: 'Bu sayfada kaydedilmemiş değişiklikler var. Modu değiştirirseniz girdiğiniz bilgiler kaybolacak.'
    });
    if (!tamam) return null;
    degisiklikleriBirak();
  }
  const aciklama = hedef === 'gelismis' && !simdiki.gelismisAciklamasiGoruldu;
  if (aciklama && !(await gelismisAciklamasi())) return null;
  try {
    const { kullanimModu } = await api('/platform/kullanim-modu/kaydet', { govde: { mod: hedef, ...(aciklama ? { gelismisAciklamasiGoruldu: true } : {}) } });
    bildir(hedef === 'basit' ? 'Basit moda geçildi.' : 'Gelişmiş moda geçildi.');
    return kullanimModu;
  } catch (e) {
    if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
    return null;
  }
}

/**
 * Üst çubuktaki Basit / Gelişmiş anahtarı (iki düğmeli grup; seçili olan aria-pressed). Tıklayınca hemen geçer.
 * @param {'basit' | 'gelismis'} mod @param {(hedef: 'basit' | 'gelismis') => void} degistir
 */
export function modAnahtari(mod, degistir) {
  const dugme = (deger, etiket, ipucu) => h('button', {
    type: 'button', 'aria-pressed': String(mod === deger), title: ipucu,
    onclick: () => { if (mod !== deger) degistir(deger); }
  }, etiket);
  return h('div', { class: 'segment mod-anahtari', role: 'group', 'aria-label': 'Kullanım modu' },
    dugme('basit', 'Basit', 'Basit mod: Testlerim, Sonuçlar ve Ayarlar'),
    dugme('gelismis', 'Gelişmiş', 'Gelişmiş mod: tüm özellikler'));
}

/** Basit modda "Oluştur" menüsünün yerine: "+ Yeni test". */
export const yeniTestDugmesi = () => h('a', { href: '#/hizli-test', class: 'dugme birincil yeni-test-dugmesi', 'aria-label': 'Yeni test' },
  ikon('artiYalin'), h('span', { class: 'dugme-metni' }, 'Yeni test'));

/**
 * Basit modda Gelişmiş'e ait sayfanın üstündeki not (ana içeriğin dışında; sayfa modülleri içeriği değiştirse de kalır).
 * @param {() => void} gec Gelişmiş'e geç
 */
export function gelismisSayfaNotu(gec) {
  return h('div', { class: 'gelismis-sayfa-notu', role: 'note', hidden: true },
    ikon('katman'), h('span', {}, 'Bu sayfa Gelişmiş moda ait'), h('span', { 'aria-hidden': 'true' }, '·'),
    h('button', { type: 'button', class: 'bag-dugme', onclick: gec }, 'Gelişmiş\'e geç'));
}

/** Basit akışın beş adımı (boş durum ve yer tutucu sayfada şerit). @param {number} [etkin] 1–5 */
export function adimSeridi(etkin = 1) {
  const adlar = ['Adres gir', 'Keşfet', 'Eksikleri tamamla', 'Çalıştır', 'Sonucu gör'];
  return h('ol', { class: 'basit-adimlar', 'aria-label': 'Basit test adımları' },
    adlar.map((ad, i) => h('li', { class: i + 1 === etkin ? 'etkin' : null, 'aria-current': i + 1 === etkin ? 'step' : null },
      h('span', { class: 'adim-no', 'aria-hidden': 'true' }, String(i + 1)), ad)));
}

/**
 * Basit mod sayfaları (ana düzen çağırır). Sayfa modülleri dinamik yüklenir.
 * @param {HTMLElement} main @param {string} bolum @param {string[]} parcalar @param {{ durum: any; gelismiseGec: (adres?: string) => void }} baglam
 */
export function basitSayfaEkrani(main, bolum, parcalar, baglam) {
  const baslik = bolum === 'basit-sonuclar' ? 'Sonuçlar' : bolum === 'hizli-test' ? (parcalar[0] === 'guncelle' ? 'Nöbetçi taraması' : 'Yeni test') : 'Testlerim';
  const icerik = h('section', { class: 'icerik-alani dar-icerik basit-sayfa', 'aria-labelledby': 'bolum-basligi' });
  main.replaceChildren(h('h1', { class: 'gorunmez' }, baslik), icerik);
  const hata = (e) => {
    if (e && e.durum === 423) return;
    icerik.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, `${baslik} yüklenemedi (${e && e.message ? e.message : String(e)}). Sunucuyu yeniden başlatın (npm run baslat).`));
  };
  if (bolum === 'hizli-test') {
    import('./hizli-test.js').then((m) => m.hizliTestEkrani(icerik, parcalar, baglam)).catch(hata);
    return;
  }
  if (bolum === 'basit-sonuclar') {
    import('./basit-sonuclar.js').then((m) => m.basitSonuclarEkrani(icerik, parcalar, baglam)).catch(hata);
    return;
  }
  import('./testlerim.js').then((m) => m.testlerimEkrani(icerik, baglam)).catch(hata);
}

/**
 * Kurulum sihirbazının "Kullanım" adımı (yeni çalışma alanı): Basit — ilk kez kullanıyorum / Gelişmiş — tüm özellikler.
 * Seçim kasaya yazılır (çalışma alanının ayarı); sonra devam() çağrılır.
 * @param {{ secili: 'basit' | 'gelismis'; devam: (mod: 'basit' | 'gelismis') => void }} s @returns {{ form: HTMLFormElement; odak: HTMLInputElement }}
 */
export function kullanimModuSorusu(s) {
  const ad = 'kullanim-modu-sorusu';
  const secenek = (deger, baslik, aciklama) => {
    const r = h('input', { type: 'radio', name: ad, value: deger, id: `${ad}-${deger}`, checked: s.secili === deger });
    return { r, el: h('label', { class: 'onay-satiri giris-sorusu-secenegi', for: r.id }, r, h('span', {}, h('b', {}, baslik), h('small', { class: 'blok soluk' }, aciklama))) };
  };
  const secenekler = [
    secenek('basit', 'Basit — Nöbetçi\'yi ilk kez kullanıyorum', 'Menüde yalnız Testlerim, Sonuçlar ve Ayarlar: adres girin, keşfedin, eksikleri tamamlayın, çalıştırın, sonucu görün.'),
    secenek('gelismis', 'Gelişmiş — tüm özellikler', 'Ekran modelleri, test verisi tabloları, servisler, uçtan uca akışlar, planlı koşular ve tüm ayarlar.')
  ];
  const mesaj = mesajKutusu();
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Devam', ikon('ok'));
  const form = /** @type {HTMLFormElement} */ (h('form', { class: 'kart', novalidate: true },
    h('div', { class: 'kart-basligi' }, h('h2', {}, ikon('katman'), 'Nöbetçi\'yi nasıl kullanacaksınız?')),
    mesaj.kutu,
    h('fieldset', { class: 'giris-sorusu' }, h('legend', { class: 'gorunmez' }, 'Nöbetçi\'yi nasıl kullanacaksınız?'), secenekler.map((x) => x.el)),
    h('p', { class: 'soluk kucuk' }, 'Hiçbir özellik silinmez: üst çubuktaki Basit / Gelişmiş anahtarıyla istediğiniz zaman geçersiniz.'),
    h('div', { class: 'dugmeler' }, gonder)));
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    mesaj.temizle();
    const mod = /** @type {'basit' | 'gelismis'} */ ((secenekler.find((x) => x.r.checked) || secenekler[0]).r.value);
    try {
      await mesgulIken(gonder, 'Kaydediliyor…', () => api('/platform/kullanim-modu/kaydet', { govde: { mod } }));
      s.devam(mod);
    } catch (e) {
      mesaj.goster(e && e.message ? e.message : String(e));
    }
  });
  return { form, odak: /** @type {HTMLInputElement} */ ((secenekler.find((x) => x.r.checked) || secenekler[0]).r) };
}
