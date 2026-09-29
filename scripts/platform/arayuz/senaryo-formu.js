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
import { BILEREK_BOS_ANAHTARI, bilerekBosAnahtarlari, gorunurlukleriHesapla, senaryoyuDogrula, tabloBasvurusuCoz } from './senaryo-dogrulayici.mjs';
import { basvuru, degerBasvurusuYaz, grupAnahtari, sutunBul, sutunSecenekleri, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';
import { cokluCalistirmaSecimi, kaydedilecekVeriKosulari as veriKosulariniHazirla, veriKosusuOzeti } from './veri-kosusu-secimi.js';
import { canliOnayEki, canliOnayIste, onayIste } from './kosu-paneli.js';
import { GIRIS_DUGUMU, SONUC_DUGUMU, adimDugumu, akisDiyagrami, hataDugumleri } from './akis-diyagrami.mjs';
import { birlesikDegerler, eslesenListeler } from './parametre-tanimlari.mjs';
import { akisDiyagramiCiz } from './senaryo-diyagrami.js';
import { playwrightKodunaAktar } from './playwright-disa-aktarma.js';
import { tarihGirdisi } from './goreli-tarih-girdisi.js';
import { talepAlani } from './talep-alani.js';

const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const kimlikUret = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
let kimlikSayaci = 0;
const yeniId = (on) => `sf-${on}-${++kimlikSayaci}`;
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
/** Tablo başvurusunun kullanıcıya görünen adı (ham ${…} gösterilmez): "Tablodan: Kişi [etiket] › Telefon". */
const basvuruMetni = (b) => `Tablodan: ${b.tablo}${b.etiket ? ` [${b.etiket}]` : ''} › ${b.sutun}`;
/** "Bilerek boş bırak" işaretinin sunulduğu (tek değerli) form alanı tipleri. */
const BILEREK_BOS_TIPLERI = ['secim', 'metin', 'sayi', 'tarih', 'dosya'];

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
  const talep = talepAlani({ projeId: s.proje.id, degerler: senaryo.talepler || [], sinif: 'model-alani' });
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, ikon('onay'), 'Kaydet');
  const form = h('form', { class: 'kart form-paneli model-yok-karti', novalidate: true },
    h('h3', {}, 'Senaryo özeti'),
    h('div', { class: 'not-kutusu bilgi' },
      h('p', {}, 'Bu ekranın ekran modeli yok. Başlık ve Koşuda ayarı düzenlenebilir; alanların tam düzenlenmesi için ekran modeli gerekir.'),
      h('p', { class: 'kucuk' }, 'Ekranın modelini Ekranlar > ekran > "Paket yükle" ya da "Ekranı tara" ile ekleyin.')),
    h('div', { class: 'model-alani' }, h('div', { class: 'alan-ust' }, h('label', { for: baslik.id }, 'Başlık', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), baslik, baslikHata),
    talep.el,
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
      await api('/platform/senaryo/kaydet', { govde: { id: senaryo.id, projeId: s.proje.id, baslik: baslik.value, kosuyaDahil: kosuda.checked, talepler: talep.degerler() } });
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
  // Bilerek boş bırakılan zorunlu alanlar (olumsuz senaryo; verideki bilerekBos listesi).
  const bilerekBos = new Set(bilerekBosAnahtarlari(s.taslak?.veri || senaryo?.veri));
  // Giriş seçimi (senaryo-girisi.mjs): { kip: ortam | girissiz | temiz, profil }; null = ortamın girişiyle (varsayılan).
  let girisSecimi = s.taslak && 'giris' in s.taslak ? s.taslak.giris : senaryo?.giris ?? null;
  /** Adım ekran görüntüsü seçimi (null = Ayarlara uy; Ayarlar > Koşu > Kayıt). */
  let adimGoruntusuSecimi = s.taslak && 'adimGoruntusu' in s.taslak ? s.taslak.adimGoruntusu : senaryo?.adimGoruntusu ?? null;
  // Satır seçimleri: "<tabloId>|<etiket>" → { Sütun: değer } (çözümleyicinin okuduğu biçim; servis senaryosundakiyle aynı).
  // ${Tablo.Sütun} değerleri koşuda bu koşullarla (+ bağlı alanların düz değerleri ve ortam) uyan ilk satırdan gelir.
  const tabloSecimleri = JSON.parse(JSON.stringify(s.taslak?.tabloSecimleri ?? senaryo?.tabloSecimleri ?? {}));
  // Çalıştırma biçimi (tablolar/veri-kosulari.mjs): grup → { kip: 'secili', satirlar } | { kip: 'tumu' }; listede olmayan grup "Tek satır"
  // (bugünkü davranış). Birden çok grup çoklu ise birleşim: tüm kombinasyonlar ya da eşleştirerek (eslesmeler).
  const veriKosulari = JSON.parse(JSON.stringify(s.taslak?.veriKosulari ?? senaryo?.veriKosulari ?? {}));
  veriKosulari.gruplar ??= {};
  const modelGirissiz = baglam.model?.girisGerekmez === true;
  const dogrulamaBaglami = { model: baglam.model, altModeller: baglam.altModeller, kaynak: 'kayit' };
  const tumAlanlar = tumFormAlanlari(sema);
  // Koşullu değer listeleri (Veri > Tablolar): koşulları tutan liste seçim alanının seçeneklerini belirler (metin: listedeki
  // açıklama, yoksa modelin metni); tutan liste yoksa modelin kendi listesi. Senaryo ayarının listesi (senaryoAyari; ekranda
  // karşılığı olmayan, akışı dallandıran seçim) seçenekleri değiştirmez — kodlar modelden; yalnız "Tablodan" başvurusu için.
  const degerListeleri = baglam.degerListeleri || [];
  const alanDegeri = (id) => { const a = tumAlanlar.find((x) => x.id === id); return a ? String(degerler[a.anahtar] ?? '') : undefined; };
  const alanSecenekleri = (alan) => {
    const model = secenekleriBul(alan, degerler, sema);
    const eslesen = eslesenListeler(degerListeleri, (l) => l.hedef?.alan === alan.id && !l.senaryoAyari, alanDegeri);
    if (!eslesen.length) return model;
    const metinler = new Map([...(alan.secenekler || []), ...Object.values(alan.bagimlilik?.harita || {}).flat()].map((x) => [x.deger, x.metin]));
    return birlesikDegerler(eslesen).map((x) => ({ deger: x.deger, metin: x.aciklama || metinler.get(x.deger) || x.deger }));
  };
  // "Tablodan": tablo sütununa bağlı alanın değeri ${Tablo.Sütun} olabilir — koşuda senaryonun seçtiği satırdan (aynı tablodaki
  // diğer seçimler ve ortamla uyan ilk satır) çözülür (tablolar/ekran-basvurulari.mjs). Bağlı değilse null. Gizli sütuna bağlı alan
  // (ör. CVV) değer listesinde yoktur; başvuru baglam.gizliBaglar'dan (yalnız tablo / sütun adı) kurulur, değer gösterilmez.
  // Kayıt grubunda "Yeni (elle gir)" seçiliyse alan tablodan almaz (Tablodan seçeneği / düğmesi yok).
  const tabloSecenegi = (alan) => {
    if (alanGrubu.get(alan.id)?.kip === 'yeni') return null;
    const l = degerListeleri.find((x) => x.hedef?.alan === alan.id && x.baglanti);
    const b = l ? l.baglanti : (baglam.gizliBaglar || {})[alan.id];
    if (!b) return null;
    return { deger: degerBasvurusuYaz(b.tablo, b.sutun, b.etiket || ''), metin: basvuruMetni(b) };
  };

  // --- KAYIT GRUPLARI ------------------------------------------------------------------------
  // Aynı KAYIT tablosuna (tür 'kayit'; ör. kişi) aynı etiketle bağlı alanlar (ekran alan bağları ya da senaryodaki
  // ${Tablo[etiket].Sütun} başvuruları; en az iki alan, en az biri seçim dışı) tek grup olarak yönetilir: grubun başında "Hazır <tablo> (tablodan)" /
  // "Yeni (elle gir)". Hazır: tüm alanlar aynı satırdan gelir (değer ${Tablo[etiket].Sütun}, satır tabloSecimleri + veriKosulari'nda
  // — koşu ve saklama biçimi değişmez); alanlar salt okunur özet olarak görünür. Yeni: alanlar düz girdi (Tablodan seçeneği yok).
  // Karışık (bir kısmı tablodan, bir kısmı elle / boş) açıkça gösterilir; kullanıcı birini seçince tüm alanlara uygulanır.
  const KAYIT_GRUBU_TIPLERI = ['metin', 'sayi', 'tarih', 'secim', 'onayKutusu', 'dosya'];
  const kucukAd = (x) => String(x ?? '').trim().toLocaleLowerCase('tr');
  const kayitTabloAdlari = new Set((baglam.kayitTablolari || []).map(kucukAd));
  /** @type {Map<string, { anahtar: string; tablo: string; etiket: string; kip: 'hazir' | 'yeni' | 'karisik'; kaplar: HTMLElement[]; uyeler: Array<{ alan: any; sutun: string; bicim: string }> }>} */
  const kayitGruplari = new Map();
  /** alan kimliği → kayıt grubu */
  const alanGrubu = new Map();
  for (const alan of tumAlanlar) {
    if (!alan.anahtar || !KAYIT_GRUBU_TIPLERI.includes(alan.tip)) continue;
    const ref = tabloBasvurusuCoz(degerler[alan.anahtar]);
    const bag = (baglam.kayitBaglari || {})[alan.id];
    const b = ref ? (kayitTabloAdlari.has(kucukAd(ref.tablo)) ? ref : null) : bag ? { tablo: bag.tablo, sutun: bag.sutun, etiket: bag.etiket || '', bicim: '' } : null;
    if (!b) continue;
    const k = `${kucukAd(b.tablo)}|${b.etiket}`;
    if (!kayitGruplari.has(k)) kayitGruplari.set(k, { anahtar: k, tablo: b.tablo, etiket: b.etiket, kip: 'yeni', kaplar: [], uyeler: [] });
    kayitGruplari.get(k).uyeler.push({ alan, sutun: b.sutun, bicim: b.bicim || '' });
  }
  // Yalnız seçim alanlarından oluşan bağlar (ör. plan / kategori süzme tabloları) grup sayılmaz: orada düz seçimler satırı süzer
  // (eski "Tablodan" + satır seçimi davranışı kalır).
  for (const [k, g] of [...kayitGruplari]) {
    if (g.uyeler.length < 2 || g.uyeler.every((u) => u.alan.tip === 'secim')) { kayitGruplari.delete(k); continue; }
    const tablodan = g.uyeler.filter((u) => tabloBasvurusuCoz(degerler[u.alan.anahtar])).length;
    g.kip = tablodan === g.uyeler.length ? 'hazir' : tablodan === 0 ? 'yeni' : 'karisik';
    for (const u of g.uyeler) alanGrubu.set(u.alan.id, g);
  }
  /** Grubun alanı için başvuru metni (${Tablo[etiket].Sütun|biçim}). */
  const uyeBasvurusu = (g, u) => `\${${basvuru(g.tablo, u.sutun, g.etiket, u.bicim)}}`;
  // Projenin tabloları (satır seçimi; gizli sütunda yalnız kısmi maske — /platform/tablolar?secim=1). İlk gerektiğinde okunur.
  /** @type {any[] | null} */
  let tabloListesi = null;
  /** @type {Promise<void> | null} */
  let tabloIstegi = null;
  const ortamAdi = (id) => (s.ortamlar.find((o) => o.id === id) || {}).ad || 'başka ortam';
  function tablolariOku() {
    tabloIstegi ??= api(`/platform/tablolar?projeId=${encodeURIComponent(s.proje.id)}&secim=1`)
      .then((y) => { tabloListesi = y.tablolar || []; })
      .catch(() => { tabloListesi = []; })
      .finally(() => { satirSecimiCiz(true); kayitGruplariniYenile(); });
    return tabloIstegi;
  }
  /** Satırın açık sütun değerleri (satır seçiminin koşulları; gizli sütun koşula girmez). */
  const satirKosulu = (t, r) => Object.fromEntries(t.sutunlar.filter((c) => !c.gizli && r.degerler[c.ad] !== null && r.degerler[c.ad] !== undefined && r.degerler[c.ad] !== '')
    .map((c) => [c.ad, String(r.degerler[c.ad])]));
  const ayniKosul = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const ortamdaGecerli = (r) => !r.ortamId || r.ortamId === s.ortam.id;
  /**
   * Satır seçim listesindeki ad: satır adı (yoksa gizli olmayan ilk sütunların özeti); gizli sütunda yalnız sunucunun kısmi maskesi
   * ("4•••••8"); başka ortamın satırı ortam adıyla.
   */
  function satirEtiketi(t, r) {
    const acik = t.sutunlar.filter((c) => !c.gizli);
    const ad = r.ad || acik.slice(0, 3).map((c) => r.degerler[c.ad] ?? '—').join(' · ') || 'Satır';
    const maskeler = Object.entries(r.gizliMaskeleri || {}).map(([k, v]) => `${k} ${v}`);
    return `${ad}${maskeler.length ? ` — ${maskeler.join(' · ')}` : ''}${r.ortamId ? ` [${ortamAdi(r.ortamId)}]` : ''}`;
  }
  /**
   * Grubun satır durumu (saklama: tabloSecimleri + veriKosulari; biçim değişmez):
   *  ilk: seçim yok (koşuda uyan ilk satır) · satir: tek satır (seçim = satırın açık değerleri) · coklu: işaretli satırların her biri
   *  ayrı test (veriKosulari 'secili') · tumu: koşullara uyan tüm satırlar ('tumu') · kosul: elle yazılmış koşullar (bir satıra denk değil).
   */
  function grupDurumu(g, t) {
    const anahtar = grupAnahtari(t.id, g.etiket);
    const secim = tabloSecimleri[anahtar] || {};
    const ayar = veriKosulari.gruplar[anahtar] || null;
    if (ayar && ayar.kip === 'tumu') return { anahtar, secim, mod: 'tumu', idler: [] };
    if (ayar && ayar.kip === 'secili') return { anahtar, secim, mod: 'coklu', idler: [...ayar.satirlar] };
    if (!Object.keys(secim).length) return { anahtar, secim, mod: 'ilk', idler: [] };
    const r = t.satirlar.find((x) => ayniKosul(satirKosulu(t, x), secim));
    return r ? { anahtar, secim, mod: 'satir', idler: [r.id] } : { anahtar, secim, mod: 'kosul', idler: [] };
  }
  /** Özetlerde gösterilen satır: seçilen (ilk) satır; yoksa bu ortamda koşullara uyan ilk satır. */
  function onizlemeSatiri(g, t) {
    const d = grupDurumu(g, t);
    if (d.idler.length) return t.satirlar.find((r) => r.id === d.idler[0]) || null;
    return uyanSatirlar(t, d.secim, { ortamId: s.ortam.id })[0] || null;
  }
  /** Hazır moddaki alanın salt okunur özeti: "Telefon: 0532…" (gizli sütunda kısmi maske); ham ${…} gösterilmez. */
  function kayitOzetiCiz(ozet, g, alan) {
    const u = g.uyeler.find((x) => x.alan.id === alan.id);
    const t = tabloListesi ? tabloBul(tabloListesi, g.tablo) : null;
    const kaynak = h('small', { class: 'soluk' }, `${t ? t.ad : g.tablo}${g.etiket ? ` [${g.etiket}]` : ''} › ${u.sutun}`);
    if (!tabloListesi) { yerlestir(ozet, ikon('veri'), h('span', { class: 'kayit-ozeti-deger soluk' }, 'yükleniyor…'), kaynak); return; }
    const sutun = t ? sutunBul(t, u.sutun) : null;
    if (!t || !sutun) {
      yerlestir(ozet, ikon('uyari'), h('span', { class: 'kayit-ozeti-deger' }, t ? `"${u.sutun}" sütunu yok` : `"${g.tablo}" tablosu yok`), kaynak);
      return;
    }
    const r = onizlemeSatiri(g, t);
    const d = grupDurumu(g, t);
    let metin;
    if (!r) metin = '— (uyan satır yok)';
    else if (sutun.gizli) metin = `${(r.gizliMaskeleri || {})[sutun.ad] || '•••'} (gizli)`;
    else metin = r.degerler[sutun.ad] === null || r.degerler[sutun.ad] === undefined || r.degerler[sutun.ad] === '' ? '— (satırda boş)' : String(r.degerler[sutun.ad]);
    const not = d.mod === 'coklu' ? ` · ${d.idler.length} satırın her biri ayrı test` : d.mod === 'tumu' ? ' · uyan her satır ayrı test' : d.mod === 'ilk' || d.mod === 'kosul' ? ' · koşuda uyan ilk satır' : '';
    yerlestir(ozet, ikon(sutun.gizli ? 'kilit' : 'veri'), h('span', { class: 'kayit-ozeti-deger' }, metin), h('small', { class: 'soluk' }, `${kaynak.textContent}${not}`));
  }
  /** Bölümdeki alanların kayıt gruplarının başlık kapları (içerik kayitGruplariniYenile ile çizilir). */
  function kayitGrubuBasliklari(alanListesi) {
    const gruplar = [...new Set(alanListesi.map((a) => alanGrubu.get(a.id)).filter(Boolean))];
    return gruplar.map((g) => {
      const kap = h('div', { class: 'kayit-grubu', 'data-kayit-grubu': `${g.tablo}${g.etiket ? `[${g.etiket}]` : ''}` });
      g.kaplar.push(kap);
      return kap;
    });
  }
  /** Tüm kayıt grubu başlıklarını ve hazır moddaki alan özetlerini yeniden çizer. */
  function kayitGruplariniYenile() {
    for (const g of kayitGruplari.values()) {
      for (const kap of g.kaplar) kayitGrubuCiz(g, kap);
      for (const u of g.uyeler) alanlar.get(u.alan.id)?.ozetCiz?.();
    }
  }
  /** Grubun modunu değiştirir; tüm alanlara uygulanır (Hazır: başvuru; Yeni: tablodan gelen değerler temizlenir). */
  function kayitKipiSec(g, kip) {
    for (const u of g.uyeler) {
      const ref = tabloBasvurusuCoz(degerler[u.alan.anahtar]);
      if (kip === 'hazir' && !ref) { bilerekBos.delete(u.alan.anahtar); degerYaz(u.alan.anahtar, uyeBasvurusu(g, u), { dokun: false }); }
      if (kip === 'yeni' && ref) degerYaz(u.alan.anahtar, u.alan.tip === 'onayKutusu' ? false : '', { dokun: false });
    }
    g.kip = kip;
    degisti = true;
    for (const u of g.uyeler) alanlar.get(u.alan.id)?.ciz();
    if (kip === 'hazir' && !tabloListesi) tablolariOku();
    kayitGruplariniYenile();
    satirSecimiCiz(true);
  }
  /** Satır seçimi değişti: başlıklar, özetler, alttaki kart ve (açıksa) diyagram yenilenir. */
  function kayitSecimiDegisti() {
    degisti = true;
    kayitGruplariniYenile();
    satirSecimiCiz(true);
    if (!diyagramAlani.hidden) diyagramiCiz();
  }
  function kayitGrubuCiz(g, kap) {
    const t = tabloListesi ? tabloBul(tabloListesi, g.tablo) : null;
    const tabloAdi = t ? t.ad : g.tablo;
    const grupAdi = `${tabloAdi}${g.etiket ? ` [${g.etiket}]` : ''}`;
    const ad = yeniId('kayit-kip');
    const kipler = [['hazir', `Hazır ${tabloAdi.toLocaleLowerCase('tr')} (tablodan)`], ['yeni', 'Yeni (elle gir)']];
    const radyolar = kipler.map(([d]) => h('input', { type: 'radio', name: ad, value: d, checked: g.kip === d }));
    radyolar.forEach((r) => r.addEventListener('change', () => { if (r.checked) kayitKipiSec(g, /** @type {any} */ (r.value)); }));
    const parcalar = [
      h('div', { class: 'kayit-grubu-ust' },
        h('span', { class: 'kayit-grubu-adi' }, ikon('veri'), h('span', {}, grupAdi), h('small', { class: 'soluk' }, ` · ${g.uyeler.map((u) => u.alan.etiket).join(', ')}`)),
        h('div', { class: 'kayit-kipi', role: 'radiogroup', 'aria-label': `${grupAdi}: veri kaynağı` },
          radyolar.map((r, i) => h('label', { title: kipler[i][1] }, r, h('span', {}, kipler[i][1])))))
    ];
    if (g.kip === 'karisik') {
      parcalar.push(h('p', { class: 'alan-uyarisi kayit-karisik', role: 'status' },
        ikon('uyari'), 'Bu grupta bazı alanlar elle girilmiş (ya da boş), bazıları tablodan geliyor. Hazır ya da Yeni seçin; seçim gruptaki tüm alanlara uygulanır.'));
    } else if (g.kip === 'yeni') {
      parcalar.push(h('p', { class: 'alan-notu' }, 'Alanlara değerleri elle girin.'), tabloyaEkleSecimi(g, tabloAdi));
    } else if (!tabloListesi) {
      tablolariOku();
      parcalar.push(h('p', { class: 'alan-notu' }, 'Satırlar yükleniyor…'));
    } else if (!t) {
      parcalar.push(h('p', { class: 'alan-uyarisi' }, `"${g.tablo}" adında tablo yok (Veri > Tablolar).`));
    } else {
      parcalar.push(...hazirSatirSecimi(g, t, grupAdi));
    }
    yerlestir(kap, ...parcalar);
    kap.dataset.kip = g.kip;
  }
  /** Gizli sütuna bağlı olmayan grup alanlarının ilk değerleri: satır adı önerisi (gizli değer öneriye girmez). */
  function satirAdiOnerisi(g) {
    return g.uyeler.filter((u) => !(baglam.kayitBaglari || {})[u.alan.id]?.gizli && !u.alan.hassas)
      .map((u) => degerler[u.alan.anahtar]).filter((v) => (typeof v === 'string' && v.trim() && !v.trim().startsWith('${')) || typeof v === 'number')
      .slice(0, 2).map((v) => String(v).trim()).join(' ').slice(0, 60);
  }
  /**
   * Yeni (elle gir): "Bu kaydı “<tablo>” tablosuna da ekle". İşaretliyse kayıtta gruptaki değerler tabloya yeni satır olarak eklenir
   * (senaryoyla tek işlemde; aynı değerlerle satır varsa o kullanılır) ve senaryo o satırı kullanır (grup Hazır'a geçer).
   */
  function tabloyaEkleSecimi(g, tabloAdi) {
    const kutuId = yeniId('kayit-tabloya');
    const kutu = h('input', { type: 'checkbox', id: kutuId, checked: Boolean(g.tabloyaEkle) });
    const adId = yeniId('kayit-satir-adi');
    const ad = h('input', { type: 'text', id: adId, maxlength: '120', value: g.satirAdi || '', autocomplete: 'off' });
    const oneriYaz = () => { const o = satirAdiOnerisi(g); ad.placeholder = o ? `Boşsa: ${o}` : 'Boşsa tablo sıradan ad verir'; };
    oneriYaz();
    ad.addEventListener('focus', oneriYaz);
    ad.addEventListener('input', () => { g.satirAdi = ad.value; degisti = true; });
    const adSatiri = h('div', { class: 'kayit-satir-adi', hidden: !g.tabloyaEkle }, h('label', { for: adId }, 'Satır adı'), ad,
      h('small', { class: 'soluk' }, 'Kaydedince senaryo bu satırı kullanır; aynı değerlerle satır varsa yenisi eklenmez.'));
    kutu.addEventListener('change', () => {
      g.tabloyaEkle = kutu.checked;
      adSatiri.hidden = !kutu.checked;
      degisti = true;
      if (kutu.checked) { oneriYaz(); ad.focus(); }
    });
    return h('div', { class: 'kayit-tabloya-ekle' },
      h('label', { class: 'onay-satiri', for: kutuId }, kutu, h('span', {}, `Bu kaydı “${tabloAdi}” tablosuna da ekle`)),
      adSatiri);
  }
  /** Kaydedilecek tablo eklemeleri (Yeni + "tabloya da ekle" işaretli gruplar). */
  function kaydedilecekTabloSatirlari() {
    return [...kayitGruplari.values()].filter((g) => g.kip === 'yeni' && g.tabloyaEkle).map((g) => ({
      tablo: g.tablo, etiket: g.etiket, satirAdi: String(g.satirAdi || '').trim() || satirAdiOnerisi(g),
      alanlar: g.uyeler.map((u) => ({ anahtar: u.alan.anahtar, sutun: u.sutun, ...(u.bicim ? { bicim: u.bicim } : {}) }))
    }));
  }
  /** Hazır: satır seçimi (+ bir satır daha → her satır ayrı test; "Koşula uyan tüm satırlar" → koşullar grubun içinde). */
  function hazirSatirSecimi(g, t, grupAdi) {
    const d = grupDurumu(g, t);
    const tekil = t.ad.toLocaleLowerCase('tr');
    const satirSecenekleri = (seciliId, haric) => t.satirlar.filter((r) => r.id === seciliId || !haric.includes(r.id))
      .map((r) => h('option', { value: `s:${r.id}`, selected: r.id === seciliId }, satirEtiketi(t, r)));
    const ilkId = yeniId('kayit-satir');
    const ilk = h('select', { id: ilkId, 'data-kayit-satiri': '0' },
      h('option', { value: '', selected: d.mod === 'ilk' }, 'Koşuda ilk uygun satır'),
      h('optgroup', { label: 'Satır' }, satirSecenekleri(d.idler[0] ?? null, d.idler.slice(1))),
      h('option', { value: 'tumu', selected: d.mod === 'tumu' }, 'Koşula uyan tüm satırlar (her biri ayrı test)'),
      d.mod === 'kosul' ? h('option', { value: 'kosul', selected: true }, `Koşullar: ${Object.entries(d.secim).map(([k, v]) => `${k} = ${v}`).join(', ')}`) : null);
    ilk.addEventListener('change', () => {
      const v = ilk.value;
      if (v === 'kosul') return;
      if (!v) { delete tabloSecimleri[d.anahtar]; delete veriKosulari.gruplar[d.anahtar]; }
      else if (v === 'tumu') {
        // Bir satırdan gelen koşullar (satır / çoklu) tüm satırları tek satıra daraltır: kaldırılır; elle yazılan koşullar kalır.
        if (d.mod === 'satir' || d.mod === 'coklu') delete tabloSecimleri[d.anahtar];
        veriKosulari.gruplar[d.anahtar] = { kip: 'tumu' };
      } else {
        const r = t.satirlar.find((x) => `s:${x.id}` === v);
        if (!r) return;
        tabloSecimleri[d.anahtar] = satirKosulu(t, r);
        if (d.mod === 'coklu') veriKosulari.gruplar[d.anahtar] = { kip: 'secili', satirlar: [r.id, ...d.idler.slice(1).filter((x) => x !== r.id)] };
        else delete veriKosulari.gruplar[d.anahtar];
        if (veriKosulari.gruplar[d.anahtar]?.satirlar?.length === 1) delete veriKosulari.gruplar[d.anahtar];
      }
      kayitSecimiDegisti();
    });
    const satirlar = [h('div', { class: 'kayit-satiri' }, h('label', { for: ilkId }, `${grupAdi}:`), ilk)];
    // Çoklu: ek satırlar (× ile kaldırılır); tek satıra inince eski "tek satır" seçimine döner.
    d.idler.slice(1).forEach((sid, i) => {
      const no = i + 2;
      const sel = h('select', { 'aria-label': `${grupAdi}: ${no}. satır`, 'data-kayit-satiri': String(no - 1) },
        satirSecenekleri(sid, d.idler.filter((x) => x !== sid)));
      sel.addEventListener('change', () => {
        const idler = [...d.idler];
        idler[no - 1] = sel.value.slice(2);
        veriKosulari.gruplar[d.anahtar] = { kip: 'secili', satirlar: idler };
        kayitSecimiDegisti();
      });
      const kaldir = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${grupAdi}: ${no}. satırı kaldır` }, ikon('carpi'));
      kaldir.addEventListener('click', () => {
        const idler = d.idler.filter((_, j) => j !== no - 1);
        if (idler.length > 1) veriKosulari.gruplar[d.anahtar] = { kip: 'secili', satirlar: idler };
        else delete veriKosulari.gruplar[d.anahtar];
        kayitSecimiDegisti();
      });
      satirlar.push(h('div', { class: 'kayit-satiri' }, h('span', { class: 'kayit-satiri-no', 'aria-hidden': 'true' }, `${no}.`), sel, kaldir));
    });
    const parcalar = [h('div', { class: 'kayit-satirlari' }, satirlar)];
    if (d.mod === 'satir' || d.mod === 'coklu') {
      const ekle = h('button', { type: 'button', class: 'kucuk-dugme', 'data-kayit-ekle': '' }, ikon('arti'), `Bir ${tekil} daha ekle`);
      ekle.addEventListener('click', () => {
        const aday = t.satirlar.find((r) => !d.idler.includes(r.id) && ortamdaGecerli(r)) || t.satirlar.find((r) => !d.idler.includes(r.id));
        if (!aday) { bildir(`"${t.ad}" tablosunda eklenecek başka satır yok.`, 'hata'); return; }
        veriKosulari.gruplar[d.anahtar] = { kip: 'secili', satirlar: [...d.idler, aday.id] };
        kayitSecimiDegisti();
      });
      parcalar.push(h('div', { class: 'kayit-ekle' }, ekle, h('small', { class: 'soluk' }, 'Her satır ayrı test olarak koşar.')));
    }
    // Durum + test sayısı (bu ortamda).
    const uyan = uyanSatirlar(t, d.secim, { ortamId: s.ortam.id });
    let sayi = 1;
    let durum;
    let uyari = false;
    if (d.mod === 'coklu') {
      sayi = t.satirlar.filter((r) => d.idler.includes(r.id) && ortamdaGecerli(r)).length;
      durum = `${sayi} test — seçilen her ${tekil} ayrı test (${s.ortam.ad}${sayi < d.idler.length ? `; ${d.idler.length - sayi} satır bu ortamda geçerli değil` : ''}).`;
    } else if (d.mod === 'tumu') {
      sayi = uyan.length;
      durum = `Şu an ${uyan.length} satır uyuyor (${s.ortam.ad}) · her biri ayrı test.`;
      uyari = !uyan.length;
    } else if (d.mod === 'satir') {
      const r = t.satirlar.find((x) => x.id === d.idler[0]);
      uyari = !r || !ortamdaGecerli(r) || !uyan.length;
      durum = uyari ? `Bu satır ${s.ortam.ad} ortamında geçerli değil.` : '1 test.';
    } else {
      uyari = !uyan.length;
      durum = uyan.length ? `1 test — koşuda ${s.ortam.ad} ortamında uyan ilk satır kullanılır${d.mod === 'kosul' ? ` (${uyan.length} satır uyuyor)` : ''}.` : `${s.ortam.ad} ortamında uyan satır yok.`;
    }
    parcalar.push(h('div', { class: `alan-notu ${uyari ? 'alan-uyarisi' : ''}`.trim(), role: 'status', 'data-test-sayisi': String(sayi) }, durum));
    if (d.mod === 'ilk' || d.mod === 'tumu' || d.mod === 'kosul') {
      parcalar.push(kosulDuzenleyici(t, d.anahtar, d.secim, d.mod !== 'ilk', kayitSecimiDegisti));
    }
    return parcalar;
  }
  /**
   * Koşullar: açık sütun başına değer; bir sütunun seçenekleri kendinden önceki koşullarla uyan satırlardan (yukarıdan aşağı).
   * Gizli sütun koşula girmez.
   */
  function kosulDuzenleyici(t, anahtar, secim, acikMi, degisince) {
    const acik = t.sutunlar.filter((c) => !c.gizli);
    if (!acik.length) return null;
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
        degisince();
      });
      return h('label', { class: 'kosul-satiri' }, h('span', {}, c.ad), k);
    });
    return h('details', { open: acikMi, class: 'kosul-duzenleyici' }, h('summary', { class: 'kucuk' }, 'Koşullar'), h('div', { class: 'kosul-izgarasi' }, kosullar));
  }
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
    if (bilerekBos.size) senaryoNesnesi[BILEREK_BOS_ANAHTARI] = [...bilerekBos];
    else delete senaryoNesnesi[BILEREK_BOS_ANAHTARI];
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
      sel.append(h('option', { value: deger, selected: true }, b ? basvuruMetni(b) : `${deger} (listede yok)`));
    }
    return sel;
  }

  // --- Alan çizimleri ---------------------------------------------------------------------
  function alanCiz(alan) {
    const kap = h('div', { class: `model-alani ${['kimlik', 'altModel'].includes(alan.tip) ? 'genis' : ''}`.trim(), 'data-alan': alan.id });
    /** @type {{ kap: HTMLElement; ciz: () => void; gorunurlukCipi: HTMLElement | null; ozetCiz: (() => void) | null }} */
    const kayit = { kap, ciz: () => {}, gorunurlukCipi: null, ozetCiz: null };
    alanlar.set(alan.id, kayit);
    const ciz = () => {
      const id = yeniId(alan.id);
      const hata = hataKutusuOlustur(id);
      const uyari = uyariKutusuOlustur(id);
      let govde;
      let ust;
      // Kayıt grubunda "Hazır": değer seçilen satırdan gelir; alan salt okunur özet (ham ${…} gösterilmez).
      const grup = alanGrubu.get(alan.id);
      if (grup && grup.kip === 'hazir') {
        ust = alanUst(alan, id);
        const ozet = h('output', { id, class: 'kayit-ozeti', 'aria-describedby': `${id}-hata ${id}-uyari` });
        kayit.ozetCiz = () => kayitOzetiCiz(ozet, grup, alan);
        kayit.ozetCiz();
        kontrolKaydet(alan.anahtar, [], hata, uyari);
        kayit.gorunurlukCipi = ust.cip;
        kap.classList.remove('bilerek-bos-acik');
        yerlestir(kap, ust.el, ozet, hata, uyari);
        return;
      }
      kayit.ozetCiz = null;
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
              h('span', {}, basvuruMetni(b), h('small', { class: 'soluk' }, ' · koşuda evet / hayır olarak okunur')), kaldir);
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
        case 'tarih':
          // Hassas tarih alanı (maskeli) düz metin girdisiyle kalır (aşağıdaki varsayılan).
          if (!alan.hassas) {
            const tg = tarihGirdisi({
              id, etiket: alan.etiket, deger: degerler[alan.anahtar], bicim: alan.bicim, sinirlar: alan.sinirlar ?? null,
              referans: senaryo?.guncellenme ?? null, tablodan: tabloSecenegi(alan), tabloBasvurusu: tabloBasvurusuCoz,
              degistir: (d) => degerYaz(alan.anahtar, d, { dokun: false })
            });
            govde = tg.el;
            ust = alanUst(alan, id);
            kontrolKaydet(alan.anahtar, tg.girdiler, hata, uyari);
            break;
          }
        // falls through
        default: {
          // Değeri tablo başvurusu (${Tablo.Sütun}) olan alan: ham ${…} yerine "Tablodan: Tablo › Sütun" rozeti + Kaldır.
          const tb = tabloBasvurusuCoz(degerler[alan.anahtar]);
          if (tb) {
            const kaldir = h('button', { type: 'button', class: 'kucuk-dugme hayalet', id, 'aria-label': `${alan.etiket}: tablodan almayı kaldır` }, ikon('carpi'), 'Kaldır');
            kaldir.addEventListener('click', () => { degerYaz(alan.anahtar, ''); kayit.ciz(); });
            ust = alanUst(alan, id);
            govde = h('div', { class: 'tablodan-deger' }, ikon('veri'),
              h('span', {}, basvuruMetni(tb), h('small', { class: 'soluk' }, ' · koşuda seçilen satırdan gelir')), kaldir);
            kontrolKaydet(alan.anahtar, [kaldir], hata, uyari);
            break;
          }
          // Hassas alanın düz değeri maskelenir.
          const tip = alan.tip === 'sayi' ? 'number' : alan.hassas ? 'password' : 'text';
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
          // Tabloya bağlı alan: "Tablodan" değeri ${Tablo.Sütun} yapar (koşuda seçilen satırdan gelir). Hassas alanda da olur:
          // yazılan yalnız başvurudur, değer (ör. gizli sütundaki CVV) kasada kalır.
          const tablodan = tabloSecenegi(alan);
          const tablodanDugmesi = tablodan ? h('button', {
            type: 'button', class: 'kucuk-dugme hayalet', title: tablodan.metin, 'aria-label': `${alan.etiket}: ${tablodan.metin}`,
            onclick: () => { degerYaz(alan.anahtar, tablodan.deger); kayit.ciz(); }
          }, ikon('veri'), 'Tablodan') : null;
          ust = alanUst(alan, id, tablodanDugmesi ? [tablodanDugmesi] : []);
          kontrolKaydet(alan.anahtar, [girdi], hata, uyari);
        }
      }
      // Zorunlu basit alan: "Bilerek boş bırak" (olumsuz senaryo; senaryo verisinde bilerekBos). Açıkken alan temizlenir ve kapalı
      // görünür; doğrulayıcı boşluğu hata değil uyarı sayar, koşucu bu alana değer (varsayılanı da) yazmaz.
      if (alan.zorunlu === true && BILEREK_BOS_TIPLERI.includes(alan.tip) && alan.anahtar !== sema.baslik) {
        const acik = bilerekBos.has(alan.anahtar);
        const kutu = h('input', { type: 'checkbox', checked: acik, 'aria-label': 'Bilerek boş bırak', 'aria-describedby': `${id}-uyari` });
        kutu.addEventListener('change', () => {
          if (kutu.checked) { bilerekBos.add(alan.anahtar); degerYaz(alan.anahtar, ''); } else { bilerekBos.delete(alan.anahtar); planla(); }
          degisti = true;
          kayit.ciz();
        });
        ust.el.querySelector('.sag')?.append(h('label', { class: 'bilerek-bos', title: 'Olumsuz senaryo: alan boş bırakılır; koşucu bu alana değer yazmaz.' }, kutu, h('span', {}, 'Bilerek boş bırak')));
        kap.classList.toggle('bilerek-bos-acik', acik);
        if (acik) for (const el of [govde, ...govde.querySelectorAll('input, select, textarea, button')]) if ('disabled' in el) el.disabled = true;
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
          h('strong', { class: 'dosya-adi' }, basvuruMetni(tb)),
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
        kayitGrubuBasliklari(bolum.alanlar),
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
  // Talep no (isteğe bağlı; birden çok): başlığın yanında. Akış değişince (s.taslak) kaydedilmemiş talepler taşınır.
  const talep = talepAlani({ projeId: s.proje.id, degerler: s.taslak?.talepler ?? senaryo?.talepler ?? [], sinif: 'model-alani genis', degisti: () => { degisti = true; } });
  // Akış seçimi (birden çok akışlı ekranda).
  const akislar = Array.isArray(baglam.akislar) ? baglam.akislar : [];
  const akisSecimi = akislar.length > 1 ? h('select', { id: yeniId('akis') },
    akislar.map((a) => h('option', { value: a.id, selected: a.id === baglam.akisId }, `${a.ad}${a.varsayilan ? ' (varsayılan)' : ''}`))) : null;
  if (akisSecimi) {
    akisSecimi.addEventListener('change', () => {
      const d = hesapla();
      senaryoFormu(icerik, { ...s, akisId: akisSecimi.value, taslak: { veri: d.senaryo, baslik: baslikDegeri, oncekiAkis: baglam.akisId, ortamlar: [...ortamSecimi], kosuyaDahil, mutlaka: [...mutlaka], giris: girisSecimi, adimGoruntusu: adimGoruntusuSecimi, tabloSecimleri, veriKosulari, talepler: talep.degerler(), sekme: diyagramAlani.hidden ? 'form' : 'akis' } });
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
  // Adım ekran görüntüleri: "Ayarlara uy" (varsayılan; Ayarlar > Koşu > Kayıt) ya da bu senaryoya özel seçim.
  const adimGoruntusuGirdisi = h('select', { id: yeniId('adimGoruntusu') },
    [['ayar', 'Ayarlara uy (varsayılan)'], ['her', 'Her adımda'], ['yalnizKalan', 'Yalnız kalan adımda'], ['secili', 'Seçili adımlarda'], ['kapali', 'Kapalı']]
      .map(([d, m]) => h('option', { value: d, selected: (adimGoruntusuSecimi ?? 'ayar') === d }, m)));
  adimGoruntusuGirdisi.addEventListener('change', () => {
    adimGoruntusuSecimi = adimGoruntusuGirdisi.value === 'ayar' ? null : adimGoruntusuGirdisi.value;
    degisti = true;
  });
  const senaryoKarti = h('section', { class: 'kart', 'aria-labelledby': 'senaryo-karti-baslik' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'senaryo-karti-baslik' }, ikon('liste'), 'Senaryo'),
      h('span', { class: 'alt' }, 'Başlık, Playwright test adıdır; aynı ekranda tekil olmalıdır.')),
    h('div', { class: 'alan-izgarasi' },
      akisSecimi ? h('div', { class: 'model-alani genis' }, h('div', { class: 'alan-ust' }, h('label', { for: akisSecimi.id }, 'Akış')), akisSecimi,
        h('div', { class: 'alan-notu' }, 'Senaryo bu akışın adımlarıyla koşar; form seçilen akışa göre değişir.')) : null,
      h('div', { class: 'model-alani genis giris-secimi' }, h('div', { class: 'alan-ust' }, h('label', { for: girisKipi.id }, 'Giriş')), girisKipi, girisProfilAlani, girisNotu),
      h('div', { class: 'model-alani genis' }, h('div', { class: 'alan-ust' }, h('label', { for: adimGoruntusuGirdisi.id }, 'Adım ekran görüntüleri')), adimGoruntusuGirdisi,
        h('div', { class: 'alan-notu' }, 'Seçili adımlarda: ekranın akış tasarımında "Ekran görüntüsü al" işaretli adımlar. Test sonu görüntüsü, video ve iz Ayarlar > Koşu > Kayıt\'tadır.')),
      h('div', { class: 'model-alani genis' }, h('div', { class: 'alan-ust' }, h('label', { for: baslikId }, 'Başlık', h('span', { class: 'zorunlu-isareti', 'aria-hidden': 'true' }, '*'))), baslikGirdisi, baslikHata),
      talep.el,
      kayitGrubuBasliklari(sema.senaryoAlanlari).map((x) => h('div', { class: 'genis' }, x)),
      sema.senaryoAlanlari.map(alanCiz)));

  // --- Satır seçimi (tablo başvuruları) --------------------------------------------------------
  // Formda ${Tablo.Sütun} kullanan her tablo + etiket grubu için koşuda kullanılacak satır: "Otomatik" (bağlı alanların düz
  // değerleri ve ortamla uyan ilk satır) ya da bir satır / sütun koşulları (tabloSecimleri; satır seçilince satırın açık sütun
  // değerleri koşul olur, gizli sütun koşula girmez). Ortama özel satırlar ortam adıyla gösterilir.
  // Hazır moddaki KAYIT GRUPLARININ satırı grubun başında seçilir (kayitGrubuCiz); burada yalnız grubu olmayan başvurular ve birden
  // çok çoklu grubun birleşimi / tahmini test sayısı.
  const satirSecimiKarti = h('section', { class: 'kart satir-secimi-karti', 'aria-labelledby': 'satir-secimi-baslik', hidden: true });
  let satirImzasi = null;
  /** Başvuru grubu (tablo + etiket) hazır moddaki bir kayıt grubunda mı (satırı grubun başında seçilir). */
  const kayitGrubundaMi = (g) => kayitGruplari.get(`${kucukAd(g.tablo)}|${g.etiket}`)?.kip === 'hazir';
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
    const imza = JSON.stringify([gruplar, [...kayitGruplari.values()].map((g) => g.kip)]);
    if (!zorla && imza === satirImzasi) return;
    satirImzasi = imza;
    if (!gruplar.length) { satirSecimiKarti.hidden = true; return; }
    if (!tabloListesi) { tablolariOku(); return; }
    const tekiller = gruplar.filter((g) => !kayitGrubundaMi(g));
    const ozet = veriKosusuOzetiCiz(gruplar);
    satirSecimiKarti.hidden = !tekiller.length && !ozet;
    if (satirSecimiKarti.hidden) { yerlestir(satirSecimiKarti); return; }
    yerlestir(satirSecimiKarti,
      tekiller.length
        ? h('div', { class: 'kart-basligi' }, h('h3', { id: 'satir-secimi-baslik' }, ikon('veri'), 'Satır seçimi'),
          h('span', { class: 'alt' }, 'Tablodan alınan değerler koşuda bu satırdan gelir.'))
        : h('div', { class: 'kart-basligi' }, h('h3', { id: 'satir-secimi-baslik' }, ikon('veri'), 'Test sayısı'),
          h('span', { class: 'alt' }, 'Tablodan birden çok satırla koşulacak testler.')),
      ...tekiller.map(satirGrubuCiz),
      ozet);
  }
  /** Formda kullanılan grupların anahtarları (tablo kimliğiyle). */
  const grupAnahtarlari = (gruplar) => gruplar.map((g) => { const t = tabloBul(tabloListesi || [], g.tablo); return t ? { anahtar: grupAnahtari(t.id, g.etiket), tablo: t, etiket: g.etiket } : null; }).filter(Boolean);
  /** Kaydedilecek çalıştırma biçimi (veri-kosusu-secimi.js): kullanılan çoklu gruplar; hiçbiri yoksa null. Tablolar okunmadıysa undefined (mevcut korunur). */
  const kaydedilecekVeriKosulari = () => {
    if (!tabloListesi) return kullanilanGruplar().length ? undefined : null;
    return veriKosulariniHazirla(veriKosulari, grupAnahtarlari(kullanilanGruplar()).map((g) => g.anahtar));
  };
  const veriKosusuDurumu = () => ({
    veriKosulari, ortam: s.ortam, ortamAdi, tablolar: tabloListesi || [], tabloSecimleri,
    degisti: () => { degisti = true; satirSecimiCiz(true); kayitGruplariniYenile(); }
  });
  /**
   * Grubu olmayan (tekil) tablo başvurusunda sade çoklu çalıştırma ("Uyan her satır ayrı test"; veri-kosusu-secimi.js). Açılırken
   * tek bir satırdan gelen seçim tüm satırları o satıra daraltacağından kaldırılır; elle yazılan koşullar kalır.
   */
  function cokluCalistirmaCiz(t, anahtar, secim, secilenSatir) {
    const d = veriKosusuDurumu();
    return cokluCalistirmaSecimi(t, anahtar, secim, { ...d, degisti: () => {
      if (secilenSatir && veriKosulari.gruplar[anahtar]?.kip === 'tumu') delete tabloSecimleri[anahtar];
      d.degisti();
    } });
  }
  function veriKosusuOzetiCiz(gruplar) { return veriKosusuOzeti(grupAnahtarlari(gruplar), veriKosusuDurumu()); }
  function satirGrubuCiz(g) {
    const t = tabloBul(tabloListesi, g.tablo);
    const baslikEl = h('h4', {}, `${t ? t.ad : g.tablo}${g.etiket ? ` [${g.etiket}]` : ''}`, h('small', { class: 'soluk' }, ` · ${g.alanlar.join(', ')}`));
    if (!t) return h('div', { class: 'satir-secimi-grubu' }, baslikEl, h('div', { class: 'alan-uyarisi' }, `"${g.tablo}" adında tablo yok (Veri > Tablolar).`));
    const anahtar = grupAnahtari(t.id, g.etiket);
    const secim = tabloSecimleri[anahtar] || {};
    const secimVar = Object.keys(secim).length > 0;
    const acik = t.sutunlar.filter((c) => !c.gizli);
    const secilenSatir = secimVar ? t.satirlar.find((r) => ayniKosul(satirKosulu(t, r), secim)) : null;
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
        if (r) tabloSecimleri[anahtar] = satirKosulu(t, r);
      }
      degisti = true;
      satirSecimiCiz(true);
      if (!diyagramAlani.hidden) diyagramiCiz();
    });
    const uyan = uyanSatirlar(t, secim, { ortamId: s.ortam.id });
    // Çoklu çalıştırma açıkken durum notu onay kutusunun altında (uyan / işaretli satırların her biri ayrı test).
    const cokluAcik = Boolean(veriKosulari.gruplar[anahtar]);
    const durum = cokluAcik ? null : !secimVar ? 'Koşuda bağlı alanların değerleri ve ortamla uyan ilk satır kullanılır.'
      : uyan.length === 1 ? `✓ ${s.ortam.ad} ortamında tek satır uyuyor.` : uyan.length ? `${uyan.length} satır uyuyor (${s.ortam.ad}) · koşuda ilki.` : `${s.ortam.ad} ortamında uyan satır yok.`;
    return h('div', { class: 'satir-secimi-grubu', 'data-tablo': t.ad },
      baslikEl, h('label', { class: 'gorunmez', for: id }, `${t.ad}${g.etiket ? ` [${g.etiket}]` : ''} satırı`), sel,
      durum ? h('div', { class: `alan-notu ${secimVar && !uyan.length ? 'alan-uyarisi' : ''}`.trim(), role: 'status' }, durum) : null,
      kosulDuzenleyici(t, anahtar, secim, secimVar && !secilenSatir, () => { degisti = true; satirSecimiCiz(true); }),
      cokluCalistirmaCiz(t, anahtar, secim, secilenSatir));
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
          // Adım ekran görüntüsü seçimi ('ayar' = Ayarlara uy; içeriğe yazılmaz).
          adimGoruntusu: adimGoruntusuSecimi ?? 'ayar',
          // Satır seçimleri (yalnız formda kullanılan tablo grupları; boşsa kaldırılır).
          tabloSecimleri: kaydedilecekSecimler(),
          // Çalıştırma biçimi (tablodan çoklu satır; hepsi "Tek satır"sa kaldırılır). Tablolar okunamadıysa mevcut korunur.
          ...(kaydedilecekVeriKosulari() !== undefined ? { veriKosulari: kaydedilecekVeriKosulari() } : {}),
          // Yeni + "tabloya da ekle": grubun değerleri tabloya yeni satır (senaryoyla tek işlemde); senaryo o satırı kullanır.
          ...(kaydedilecekTabloSatirlari().length ? { yeniTabloSatirlari: kaydedilecekTabloSatirlari() } : {}),
          // Talep numaraları (boş liste kaldırır).
          talepler: talep.degerler()
        }
      });
      degisti = false;
      bildir(s.mod === 'yeni' ? 'Senaryo oluşturuldu.' : 'Senaryo kaydedildi.');
      for (const x of yanit.tabloSatirlari || []) {
        bildir(x.yeni ? `“${x.satirAdi}” ${x.tablo} tablosuna eklendi; senaryo bu satırı kullanıyor.`
          : `Aynı değerlerle “${x.satirAdi}” satırı ${x.tablo} tablosunda zaten vardı; yeni satır eklenmedi, senaryo bu satırı kullanıyor.`);
      }
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
    // Riskli ortam (tek tanım: ortam-riski.mjs): açık onay; sunucu istekte canliOnay: true ister (+ canlı ortam izni).
    if (!(await canliOnayIste(ortam, 'Deneme'))) return;
    const kosuId = kimlikUret();
    deneme = { kosuId, bitti: false };
    deneDugmesi.disabled = true;
    kaydetDugmesi.disabled = true;
    denemeCiz({ durum: 'calisiyor', kosuId, ortam });
    try {
      const yanit = await api('/platform/senaryo/dene', {
        govde: {
          projeId: s.proje.id, ekranId: baglam.ekran.id, ortamId, veri: d.senaryo, kosuId, ...(senaryo ? { id: senaryo.id } : {}), ...canliOnayEki(ortamId),
          ...(baglam.akisId ? { akisId: baglam.akisId } : {}), mutlakaGorunmeli: [...mutlaka], giris: modelGirissiz ? null : girisSecimi, adimGoruntusu: adimGoruntusuSecimi ?? 'ayar',
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
      const tb = tabloBasvurusuCoz(v);
      if (tb) m = basvuruMetni(tb);
      else if (alan.tip === 'secim') { const x = String(v ?? ''); m = x ? (alanSecenekleri(alan).find((y) => y.deger === x)?.metin ?? x) : null; }
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
  // Playwright koduna dışa aktar: KAYDEDİLMİŞ senaryodan (kaydedilmemiş değişiklikler dosyaya girmez); senaryonun kayıtlı ortamlarından biri.
  const disaAktarDugmesi = senaryo ? h('button', {
    type: 'button', class: 'hayalet', title: 'Kaydedilmiş senaryoyu seçilen ortam için çalıştırılabilir tek bir .spec.ts dosyası olarak indirir (gizli değerler ortam değişkeniyle)',
    onclick: () => playwrightKodunaAktar({ projeId: s.proje.id, senaryo: { id: senaryo.id, baslik: senaryo.baslik }, ortamlar: s.ortamlar.filter((o) => senaryo.ortamlar.includes(o.id)) })
  }, ikon('indir'), 'Playwright koduna dışa aktar') : null;
  yerlestir(icerik,
    sayfaBasligi(s, s.mod === 'yeni' ? 'Yeni senaryo' : senaryo.baslik, meta, disaAktarDugmesi, h('button', { type: 'button', class: 'hayalet', onclick: () => vazgecDugmesi.click() }, ikon('geri'), s.taslak?.oneri ? 'Önerilere dön' : 'Listeye dön')),
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
  kayitGruplariniYenile();
  if (s.taslak?.oneri) {
    // Senaryo önerisinin önizlemesi (senaryo-onerileri.js): kaydedilmedi; oluşturmak kullanıcının kararı.
    icerik.querySelector('.form-duzeni')?.before(h('div', { class: 'not-kutusu bilgi oneri-onizleme-notu', role: 'note' },
      h('p', {}, h('b', {}, 'Öneri önizlemesi — kaydedilmedi. '), `Beklenen: ${s.taslak.oneri.beklenen}. İsterseniz düzenleyip "Senaryoyu oluştur" ile ekleyin; "Koşuda" kapalı gelir.`)));
  } else if (s.taslak) {
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
