// Ayarlar bölümleri: Proje ve ortamlar, Giriş profilleri, Bağlam profilleri, Test verisi,
// Yedekleme, Güvenlik. Tüm veriler /platform/* uç noktalarından gelir; gizli değerler
// (parola, authenticator anahtarı, hassas test verisi) API'den yalnızca { dolu, maske } olarak
// döner, açıkça "Kayıtlı değeri göster" istenmedikçe düz metin gelmez.
import {
  ADRES_YARDIMI, adresGecerliMi, alan, alanHatasi, api, bildir, bosDurum, boyutMetni, geriSayim, h, ikon, iskelet, kullaniciAyarlari, kullaniciAyarlariniTazele, mesajKutusu, mesgulIken,
  kisaAciklama, onayliDugme, parolaAlani, rozet, tarihMetni, TOKEN, yeniKimlik, yerlestir, kayitliStil, STILLER, stilUygula } from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { KOSU_HIZI_ALANLARI } from './kosu-hizi.mjs';
import { HIZ_ALANLARI, HIZ_PROFILLERI, KANIT_ALANLARI, KANIT_PROFILLERI, hizDegerleri, hizProfili, kanitDegerleri, kanitProfili } from './kosu-profilleri.mjs';
import { girisTarifiBolumu } from './giris-tarifi.js';
import { veriKlasoruKarti, yedekKlasoruBolumu } from './veri-klasoru.js';
import { dosyaOnDenetimi, dosyaYukle } from './dosya-yukleme.js';
import { tablolarBolumu } from './tablolar.js';
import { tabanAdresleriBolumu } from './taban-adresler.js';
import { kurtarmaKurallariBolumu } from './kurtarma-kurallari.js';
import { rehberAyarlariniGuncelle, rehberBaslat } from './rehber.js';
import { entegrasyonlarBolumu } from './entegrasyonlar.js';
import { kasayiKilitleSecimli, kilitBildirimi, zamanlanmisKosularKarti } from './zamanlanmis-kosular.js';
import { izinlerBolumu } from './izinler.js';
import { TERIMLER } from './terimler.mjs';
import { onayIste, riskBelirtinNotu } from './kosu-paneli.js';
import { projeIslemleri } from './proje-islemleri.js';
import { RISKLI_ORTAM_TANIMI, adCanliyiCagristiriyorMu, riskBelirtilmemisMi, riskliOrtamMi, riskliSecimi } from './ortam-riski.mjs';

export const AYAR_BOLUMLERI = [
  { ad: 'proje', etiket: 'Proje ve ortamlar', ikon: 'katman', aciklama: 'Projeler (yeniden adlandır, varsayılan yap, sil), projenin adı ve testlerin çalışacağı ortamlar. Ortam adları ve adresleri kasada şifreli saklanır.' },
  { ad: 'giris', etiket: 'Giriş profilleri', ikon: 'kullanici', aciklama: 'Testlerin sisteme giriş yaparken kullanacağı hesaplar ve ortam başına giriş tarifi (giriş sayfasının alanları, iki aşamalı doğrulama, bağlam seçimi). Parolalar ve anahtarlar kasada şifreli saklanır ve burada gösterilmez.' },
  { ad: 'kosu', etiket: 'Koşu', ikon: 'oynat', aciklama: 'Koşuların davranışı: kanıt düzeyi ve ortam hızı profilleri, yeniden deneme ve süre limiti; tüm ayrıntılar (video / ekran görüntüsü / iz kaydı, bekleme süreleri, servis zaman aşımı, tarih biçimi, tarama / akış kaydı) Gelişmiş\'te. Kararlar sizindir; değişiklik sonraki koşulardan itibaren geçerlidir.' },
  // Kurtarma kuralları eskiden "Proje ve ortamlar" sayfasının dibindeydi; orada "taşındı" bağlantısı kalır (adres: #/ayarlar/kurtarma).
  { ad: 'kurtarma', etiket: 'Kurtarma kuralları', ikon: 'yenile', aciklama: 'Koşuda bilinen geçici bir sorun görülünce ne yapılacağı: "şu görülürse şunu yap" kuralları (ör. oturum bitti yazısı → girişi yenile, HTTP 503 → bekleyip tekrar gönder). Proje düzeyindedir; ekran ve servis kuralları, kapsam (ekranlar / servisler, ortamlar) ve son 7 günde kaç kez çalıştıkları burada.' },
  { ad: 'yedekleme', etiket: 'Yedekleme', ikon: 'arsiv', aciklama: 'Şifreli .tayedek dosyası olarak dışa aktarın, başka bir bilgisayarın yedeğini içe aktarın; yerel otomatik yedekler burada listelenir. Saklama kartı dört saklama kuralını (koşu sonuçları, medya inceltme, rapor ve video saklama) ve otomatik yedek sayısını tek zaman çizelgesinde gösterir.' },
  { ad: 'guvenlik', etiket: 'Güvenlik', ikon: 'kalkan', aciklama: 'Kasa kilidi, otomatik kilit süresi, yasak adresler, maskelenecek gizli adlar ve kasa parolası.' },
  { ad: 'izinler', etiket: 'İzinler', ikon: 'kilit', aciklama: 'Nöbetçi\'nin sizin adınıza yapabileceği işlemler (tarayıcıyla erişim, servis istekleri, veritabanı, canlı ortam, giriş bilgisi, dış gönderim, arka plan, sistem değişikliği, güvenlik gevşetme). Hepsi varsayılan olarak kapalıdır; bir izin paketiyle birkaçını tek onayla ya da tek tek açarsınız. Açtığınız izinler kasada saklanır.' },
  { ad: 'entegrasyonlar', etiket: 'Entegrasyonlar', ikon: 'ag', aciklama: 'Dış uygulamalarla bağlantılar: koşu bitince webhook bildirimi, testten iş takip sisteminde hata kaydı açma ve SQL adımları için veritabanı bağlantıları. Token, parola ve gizli adresler kasada şifreli saklanır; hiçbir istek siz denemeden ya da seçtiğiniz olay gerçekleşmeden gönderilmez.' },
  { ad: 'raporlar', etiket: 'Raporlar', ikon: 'grafik', aciklama: 'PDF raporlarının kullandığı kararlarınız: ekip listesi ve ekran / servis → ekip eşlemesi (sahip önerisi), kritik işaretli ekran, servis ve akışlar (öncelik ve durum rozeti) ve süre eşikleri (ekran, servis, metot). Hepsi isteğe bağlıdır; boşken raporlar varsayılanlarla çalışır.' },
  { ad: 'arayuz', etiket: 'Arayüz', ikon: 'ekran', aciklama: 'Görünüm tercihleriniz: tema (Komuta merkezi, Kurumsal, Parlak), Nöbetçi\'nin kendi penceresinde mi tarayıcıda mı açılacağı, ekran rehberlerinin ilk girişte kendiliğinden açılıp açılmayacağı, listelerin sayfa boyları ve Sonuçlar > Özet kartlarının eşikleri.' }
];

/**
 * Üst menüdeki günlük iş sayfaları (Ayarlar'dan taşındı): Test verisi (tablolar) ve Planlı koşular (planlı koşu
 * kuralları). Eski adresler (#/ayarlar/test-verisi, #/ayarlar/baglam, #/ayarlar/zamanlanmis-kosular, #/ayarlar/planli-kosular)
 * uygulama.js'te yeni adreslere yönlenir (ESKI_ADRESLER).
 */
export const UST_SAYFALAR = [
  { ad: 'veri', menu: 'Test verisi', etiket: 'Test verisi', ikon: 'veri', aciklama: 'Her tablo bir Excel sayfası gibidir: sütunlar alan, her satır birlikte geçerli bir değer kombinasyonudur (ör. Kanal | Kullanıcı | Parola). Ekran alanlarını ve servis parametrelerini sütunlara bağladığınızda senaryoda seçtikçe diğer listeler satırlardan süzülür; koşul tanımlamazsınız. Tek sütunlu tablo düz bir değer listesidir. Bağlam tabloları (ör. şube) senaryoda satır adıyla seçilir.' },
  { ad: 'planli-kosular', menu: 'Planlı koşular', etiket: 'Planlı koşular', ikon: 'tarih', aciklama: 'Nöbetçi\'nin belirli zamanlarda (her gün, haftanın seçili günleri, her N saatte bir) kendiliğinden başlattığı koşular: kurallar, son çalışmalar, kaçan / çakışan zaman davranışı ve kasa kilitliyken çalışma tercihleri. Koşular yalnız Nöbetçi ve kasa açıkken çalışır (tercihlerle değiştirilebilir).' }
];

/** Eski adres → yeni adres (Ayarlar'dan taşınan sayfalar; eski yer imleri ve bağlantılar çalışmaya devam eder). */
export const ESKI_ADRESLER = Object.freeze({ 'test-verisi': '#/veri', baglam: '#/veri', 'zamanlanmis-kosular': '#/planli-kosular', 'planli-kosular': '#/planli-kosular',
  'kurtarma-kurallari': '#/ayarlar/kurtarma' });

const ISLEM_ETIKETI = {
  olustur: 'Oluşturuldu', guncelle: 'Güncellendi', sil: 'Silindi',
  birlestirme_cakismasi: 'Birleştirme çakışması', ice_aktarma_uzerine_yazildi: 'Yedekten üzerine yazıldı'
};

/**
 * @param {HTMLElement} kapsayici
 * @param {string} bolum
 * @param {{ durum: any; yonlendir: () => void; projeSec: (id: string) => void; projeleriYenile: () => Promise<void>; odak?: string | null }} baglam
 *   odak: bölüm içinde odaklanılacak öğe (İzinler: #/ayarlar/izinler/<izin anahtarı>).
 */
export function ayarlarBolumu(kapsayici, bolum, baglam) {
  const tanim = AYAR_BOLUMLERI.find((b) => b.ad === bolum) || AYAR_BOLUMLERI[0];
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('div', { class: 'kirinti' }, h('span', {}, baglam.durum.proje ? baglam.durum.proje.ad : ''), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', {}, 'Ayarlar'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, tanim.etiket)),
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, tanim.etiket),
    // En çok 1–2 cümle; ayrıntı "?" ipucunda ve rehberde (bilgi kaybolmaz).
    h('p', { class: 'soluk kucuk bolum-aciklamasi' }, kisaAciklama(tanim.aciklama, tanim.etiket))));
  const govde = h('div', {}, iskelet('sayfa'));
  kapsayici.replaceChildren(baslik, govde);
  const yenile = () => ayarlarBolumu(kapsayici, bolum, baglam);
  const ciz = {
    proje: projeVeOrtamlar, giris: girisProfilleri,
    entegrasyonlar: entegrasyonlarBolumu, izinler: izinlerBolumu,
    kosu: kosuAyarlari, kurtarma: kurtarmaKurallariSayfasi, yedekleme, guvenlik, arayuz: arayuzAyarlari, raporlar: raporVerileriBolumu
  }[bolum] || projeVeOrtamlar;
  Promise.resolve(ciz(govde, baglam, yenile)).catch((hata) => {
    if (hata && hata.durum === 423) return; // kabuk kilit ekranına geçti
    govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata)));
  });
}

/**
 * Üst menü sayfası (Veri / Planlı koşular): Ayarlar bölümüyle aynı başlık düzeni, kırıntı "proje / sayfa".
 * @param {HTMLElement} kapsayici @param {'veri' | 'planli-kosular'} ad
 * @param {{ durum: any; yonlendir: () => void; projeSec: (id: string) => void; projeleriYenile: () => Promise<void> }} baglam
 */
export function ustSayfaBolumu(kapsayici, ad, baglam) {
  const tanim = UST_SAYFALAR.find((b) => b.ad === ad) || UST_SAYFALAR[0];
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('div', { class: 'kirinti' }, h('span', {}, baglam.durum.proje ? baglam.durum.proje.ad : ''), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', { class: 'simdiki' }, tanim.etiket)),
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, tanim.etiket),
    h('p', { class: 'soluk kucuk bolum-aciklamasi' }, kisaAciklama(tanim.aciklama, tanim.etiket))));
  const govde = h('div', {}, iskelet('sayfa'));
  kapsayici.replaceChildren(baslik, govde);
  const ciz = tanim.ad === 'planli-kosular' ? planliKosular : testVerisi;
  Promise.resolve(ciz(govde, baglam)).catch((hata) => {
    if (hata && hata.durum === 423) return;
    govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata)));
  });
}

// ---- küçük yardımcılar ------------------------------------------------------------------

function formPaneli(baslik, ...icerik) {
  return h('form', { class: 'kart form-paneli', novalidate: true }, h('h3', {}, baslik), ...icerik);
}

function kayitListesi(ogeler, bosMetin, ikonAd = 'pusula') {
  if (!ogeler.length) return bosDurum(bosMetin, null, { ikon: ikonAd, rol: 'status' });
  return h('ul', { class: 'kayit-listesi' }, ogeler);
}

function kayitSatiri(baslik, meta, eylemler, ikonAd = null) {
  return h('li', {},
    ikonAd ? h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(ikonAd)) : null,
    h('div', { class: 'kayit-ana' }, h('strong', {}, baslik), meta ? h('div', { class: 'kayit-meta' }, meta) : null),
    h('div', { class: 'kayit-eylemleri' }, eylemler));
}

/** Bölüm başlığı (h3 + adet rozeti + sağda eylem düğmesi). */
const bolumBasligi = (metin, adet, dugme) => h('div', { class: 'bolum-basligi' },
  h('h3', {}, metin, adet === null || adet === undefined ? null : rozet(String(adet))), dugme || null);

function formuGoster(formAlani, form) {
  formAlani.replaceChildren(form);
  const ilk = form.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea');
  if (ilk) ilk.focus();
  form.scrollIntoView({ block: 'nearest' });
}

const duzenleDugmesi = (ad, fn) => h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${ad}: düzenle`, onclick: fn }, ikon('duzenle'), 'Düzenle');
const silDugmesi = (ad, fn) => onayliDugme('Sil', 'Silmeyi onayla', fn, { kucuk: true, etiket: `${ad}: sil` });
const gecmisDugmesi = (ad, fn) => h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${ad}: değişiklik geçmişi`, onclick: fn }, ikon('tarih'), 'Geçmiş');

/** "kullanici@<makineId>" → "kullanici · <makine adı>" (makine adları yalnızca kasa açıkken gelir). */
function yapanMetni(yapan, makineler, yerelMakineId) {
  if (typeof yapan !== 'string') return '—';
  if (yapan.startsWith('ice-aktarma:')) {
    const id = yapan.slice('ice-aktarma:'.length);
    return `Yedekten içe aktarma (${makineler[id] || 'bilinmeyen bilgisayar'})`;
  }
  const at = yapan.lastIndexOf('@');
  if (at < 0) return yapan;
  const kullanici = yapan.slice(0, at);
  const id = yapan.slice(at + 1);
  const makine = makineler[id] || (id === 'bilinmeyen-makine' ? 'bilinmeyen bilgisayar' : 'başka bir bilgisayar');
  return `${kullanici} · ${makine}${id === yerelMakineId ? ' (bu bilgisayar)' : ''}`;
}

async function gecmisGoster(varlikTuru, varlikId, baslik, baglam) {
  const { kayitlar, makineler } = await api(`/platform/gecmis?varlikTuru=${encodeURIComponent(varlikTuru)}&varlikId=${encodeURIComponent(varlikId)}`);
  const kapat = h('button', { type: 'button', class: 'birincil' }, 'Kapat');
  const dialog = h('dialog', { class: 'cekmece', 'aria-labelledby': 'gecmis-basligi' },
    h('div', { class: 'kirinti' }, h('span', {}, 'Değişiklik geçmişi')),
    h('h2', { id: 'gecmis-basligi' }, `Değişiklik geçmişi: ${baslik}`),
    kayitlar.length
      ? h('ul', { class: 'gecmis-listesi' }, [...kayitlar].reverse().map((k) => h('li', {},
        h('strong', {}, ISLEM_ETIKETI[k.islem] || k.islem), ' — ', tarihMetni(k.zaman),
        h('div', { class: 'soluk kucuk' }, yapanMetni(k.yapan, makineler, baglam.durum.sunucu && baglam.durum.sunucu.makineId)),
        k.aciklama ? h('div', { class: 'kucuk' }, k.aciklama) : null)))
      : h('p', { class: 'soluk' }, 'Kayıt yok.'),
    h('div', { class: 'dugmeler' }, kapat));
  kapat.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  kapat.focus();
}

// ---------------------------------------------------------------------------------------
// Proje ve ortamlar
// ---------------------------------------------------------------------------------------

/** Giriş tarifli ortamda ekran eşzamanlılığı > 1 uyarısı (engellemez). @param {string[]} [ortamAdlari] */
function girisliEszamanliUyarisi(ortamAdlari = []) {
  return h('div', { class: 'not-kutusu uyari eszamanli-giris-uyarisi', role: 'note', hidden: true },
    'Aynı kullanıcıyla eşzamanlı girişler birbirinin oturumunu düşürebilir; kendi uygulamanızda 1 önerilir.',
    ortamAdlari.length ? ` Giriş tarifi olan ortam: ${ortamAdlari.join(', ')}.` : '');
}

/**
 * Ortam formundaki "Koşu hızı": genel ayarı (Ayarlar > Koşu) bu ortam için ezen dört değer; boş = genel ayar. Giriş tarifli ortamda
 * ekran eşzamanlılığı 1'den büyükse uyarı. deger(): kaydedilecek nesne (boşlar gönderilmez; sunucu doğrular).
 * @param {any} ortam @param {Record<string, any>} genel
 */
function kosuHiziAlanlari(ortam, genel) {
  const mevcut = (ortam && ortam.kosuHizi) || {};
  /** @type {Map<string, HTMLInputElement>} */
  const girdiler = new Map();
  const uyari = girisliEszamanliUyarisi();
  const satirlar = KOSU_HIZI_ALANLARI.map((t) => {
    const birim = t.anahtar.endsWith('Ms') ? 'ms' : 'senaryo';
    const g = h('input', { type: 'number', min: String(t.enAz), max: String(t.enCok), step: '1', inputmode: 'numeric', 'data-kosu-hizi': t.anahtar,
      value: mevcut[t.anahtar] !== undefined ? String(mevcut[t.anahtar]) : '', placeholder: `Genel: ${genel[t.anahtar] ?? t.varsayilan}` });
    girdiler.set(t.anahtar, g);
    return alan(`${t.etiket} (${birim})`, g, { yardim: `${t.enAz}–${t.enCok}; boş: genel ayar (${genel[t.anahtar] ?? t.varsayilan}${birim === 'ms' ? ' ms' : ''}).` });
  });
  const ekranN = /** @type {HTMLInputElement} */ (girdiler.get('ekranEszamanli'));
  const guncelle = () => { uyari.hidden = !(ortam && ortam.girisTarifiVar && Number(ekranN.value || genel.ekranEszamanli || 1) > 1); };
  ekranN.addEventListener('input', guncelle);
  guncelle();
  const bolum = h('fieldset', { class: 'kosu-hizi-alanlari' }, h('legend', {}, 'Koşu hızı'),
    h('p', { class: 'soluk kucuk' }, 'Bu ortamda aynı anda kaç senaryo koşacağı ve beklemeler. Boş bırakılan değer Ayarlar > Koşu\'daki genel ayarı kullanır.'),
    h('div', { class: 'alan-izgarasi' }, ...satirlar), uyari);
  const deger = () => {
    /** @type {Record<string, string>} */
    const d = {};
    for (const [a, g] of girdiler) if (g.value.trim() !== '') d[a] = g.value.trim();
    return d;
  };
  return { bolum, deger, girdiler };
}

async function projeVeOrtamlar(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const [{ ortamlar }, genelAyarlar] = await Promise.all([api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`), kullaniciAyarlari()]);

  const projeSecimi = baglam.durum.projeler.length > 1
    ? alan('Etkin proje', h('select', { onchange: (o) => { baglam.projeSec(o.target.value); location.reload(); } },
      baglam.durum.projeler.map((p) => h('option', { value: p.id, selected: p.id === proje.id }, p.ad))))
    : null;

  const ad = h('input', { type: 'text', value: proje.ad, autocomplete: 'off', maxlength: '120' });
  const aciklama = h('textarea', { rows: '2', maxlength: '1000' });
  aciklama.value = proje.aciklama || '';
  const projeMesaj = mesajKutusu();
  const projeKaydet = h('button', { type: 'submit', class: 'birincil' }, 'Projeyi kaydet');
  const projeFormu = h('form', { class: 'kart', novalidate: true }, h('h3', {}, ikon('katman'), 'Proje'), projeSecimi, projeMesaj.kutu,
    alan('Proje adı', ad, { zorunlu: true }), alan('Açıklama', aciklama), h('div', { class: 'dugmeler' }, projeKaydet));
  projeFormu.addEventListener('submit', async (o) => {
    o.preventDefault();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Proje adı boş olamaz.'); ad.focus(); return; }
    try {
      await mesgulIken(projeKaydet, 'Kaydediliyor…', () => api('/platform/proje/kaydet', { govde: { id: proje.id, ad: ad.value, aciklama: aciklama.value } }));
      await baglam.projeleriYenile();
      bildir('Proje kaydedildi.');
    } catch (hata) { projeMesaj.goster(hata.message); }
  });

  const formAlani = h('div', {});
  const ortamFormu = (ortam) => {
    const oAd = h('input', { type: 'text', autocomplete: 'off', value: ortam ? ortam.ad : '' });
    const oAdres = h('input', { type: 'url', autocomplete: 'off', inputmode: 'url', placeholder: 'https://test.uygulamaniz.example/', value: ortam ? ortam.tabanUrl : '' });
    const oVarsayilan = h('input', { type: 'checkbox', id: yeniKimlik('vars'), checked: ortam ? ortam.varsayilan : false });
    // "Ortam türü: Test / Canlı" — kullanıcı seçimi, ZORUNLU (saklama: riskli true = Canlı, false = Test). Seçilmemiş eski ortamda
    // ikisi de seçili gelmez (Canlı sayılır) ve "türünü seçin" uyarısı gösterilir; seçmeden kaydedilmez.
    const oncekiRisk = ortam ? riskliSecimi(ortam) : null;
    const riskAdi = yeniKimlik('ortam-turu');
    const turTest = h('input', { type: 'radio', name: riskAdi, value: 'test', id: `${riskAdi}-test`, checked: oncekiRisk === false });
    const turCanli = h('input', { type: 'radio', name: riskAdi, value: 'canli', id: `${riskAdi}-canli`, checked: oncekiRisk === true });
    const turHatasi = h('p', { class: 'alan-hatasi', role: 'alert', hidden: true });
    const riskAlani = h('fieldset', { class: 'risk-secimi ortam-turu-secimi', 'aria-required': 'true', 'aria-describedby': `${riskAdi}-aciklama` },
      h('legend', {}, 'Ortam türü', h('span', { class: 'zorunlu-isaret', 'aria-hidden': 'true' }, ' *')),
      h('div', { class: 'secenekler-satiri' },
        h('label', { class: 'secenek', for: turTest.id }, turTest, 'Test'),
        h('label', { class: 'secenek', for: turCanli.id }, turCanli, 'Canlı')),
      turHatasi,
      h('p', { class: 'soluk kucuk', id: `${riskAdi}-aciklama` }, RISKLI_ORTAM_TANIMI,
        ' Canlı ortamda ayrıca "Canlı ortamda çalıştırma" izni gerekir.'),
      ortam && oncekiRisk === null ? riskBelirtinNotu() : null);
    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const hiz = kosuHiziAlanlari(ortam, genelAyarlar);
    // Uygulama sürümü (isteğe bağlı; PDF rapor A4): bu ortamdaki koşulara etiket olarak yazılır. Nöbetçi sürümü hiçbir adrese sormaz.
    const oSurum = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', placeholder: 'Ör. 2.4.1', value: ortam && ortam.uygulamaSurumu ? ortam.uygulamaSurumu : '' });
    const form = formPaneli(ortam ? `Ortamı düzenle: ${ortam.ad}` : 'Yeni ortam', mesaj.kutu,
      alan('Ortam adı', oAd, { zorunlu: true }), alan('Adres (link)', oAdres, { zorunlu: true, yardim: ADRES_YARDIMI }),
      h('label', { class: 'secenek', for: oVarsayilan.id }, oVarsayilan, 'Varsayılan ortam (koşular bu ortamda başlar)'),
      riskAlani,
      alan('Uygulama sürümü (isteğe bağlı)', oSurum, { yardim: 'Test edilen uygulamanın bu ortamdaki sürümü. Koşulara etiket olarak yazılır; raporlar sürüme göre başarıyı ve sorunun hangi sürümde başladığını gösterir. Koşu başlatılırken değiştirilebilir. Nöbetçi sürümü kendiliğinden sormaz.' }),
      hiz.bolum,
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      alanHatasi(oAd, ''); alanHatasi(oAdres, '');
      if (!oAd.value.trim()) { alanHatasi(oAd, 'Ortam adı boş olamaz.'); oAd.focus(); return; }
      if (!adresGecerliMi(oAdres.value.trim())) { alanHatasi(oAdres, 'Geçerli bir http(s) adresi girin.'); oAdres.focus(); return; }
      const riskli = turCanli.checked ? true : turTest.checked ? false : null;
      turHatasi.hidden = true;
      if (riskli === null) { turHatasi.textContent = 'Ortam türünü seçin (Test / Canlı).'; turHatasi.hidden = false; turTest.focus(); return; }
      let onay = false;
      if (riskli === false && oncekiRisk !== false) {
        // Canlı → Test onay ister; adı canlıyı çağrıştıran ortama Test de (yalnız onay: ad türü belirlemez).
        const adUyarisi = adCanliyiCagristiriyorMu(oAd.value);
        if (oncekiRisk === true || adUyarisi) {
          onay = await onayIste({
            baslik: oncekiRisk === true ? 'Ortam Test yapılsın mı?' : 'Bu ortamın adı canlıyı çağrıştırıyor, emin misiniz?', ikonAd: 'uyari', dugme: 'Evet, Test ortamı',
            metin: `${oncekiRisk === true ? 'Canlı ortam Test olarak kaydedilecek: bu ortamdaki işlemler CANLI onayı ve canlı ortam izni sorulmadan başlar. ' : ''}${adUyarisi ? `"${oAd.value.trim()}" adı canlı / üretim ortamını çağrıştırıyor. ` : ''}Değişiklik geçmişe yazılır.`
          });
          if (!onay) return;
        }
      }
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/ortam/kaydet', {
          govde: { id: ortam ? ortam.id : undefined, projeId: proje.id, ad: oAd.value.trim(), tabanUrl: oAdres.value.trim(), varsayilan: oVarsayilan.checked, riskli, kosuHizi: hiz.deger(),
            uygulamaSurumu: oSurum.value.trim(), ...(onay ? { onay: true } : {}) }
        }));
        bildir('Ortam kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(formAlani, form);
  };

  const satirlar = ortamlar.map((o) => kayitSatiri(
    [o.ad, ' ', o.varsayilan ? h('span', { class: 'rozet vurgu' }, 'Varsayılan') : null,
      riskBelirtilmemisMi(o)
        ? [' ', h('button', { type: 'button', class: 'rozet uyari risk-belirtin-rozeti', title: 'Ortam türü seçilmemiş; seçilene kadar Canlı sayılır', onclick: () => ortamFormu(o) }, ikon('uyari'), 'Türünü seçin')]
        : riskliOrtamMi(o) ? [' ', h('span', { class: 'rozet hata', title: 'Canlı ortam: istek atan her işlemde onay sorulur' }, 'Canlı')] : null],
    h('span', { class: 'mono' }, o.tabanUrl),
    [duzenleDugmesi(o.ad, () => ortamFormu(o)),
      gecmisDugmesi(`${o.ad} ortam türü`, () => gecmisGoster('ortam_riski', o.id, `${o.ad} — ortam türü`, baglam)),
      // Silinemeyen (varsayılan) satırda da aynı Sil düğmesi: aynı boy ve biçim, devre dışı ve nedeni ipucunda.
      o.varsayilan
        ? h('button', { type: 'button', class: 'tehlike kucuk-dugme', 'aria-label': `${o.ad}: sil`, disabled: true, title: 'Varsayılan ortam silinemez; önce başka bir ortamı varsayılan yapın.' }, ikon('cop'), h('span', {}, 'Sil'))
        : silDugmesi(o.ad, async () => { await api('/platform/ortam/sil', { govde: { id: o.id } }); bildir('Ortam silindi.'); yenile(); })], 'ag'));

  // Projeler: her satırda Yeniden adlandır · Varsayılan yap · Sil (üst çubuktaki ⋯ ile aynı işlemler ve diyaloglar:
  // proje-islemleri.js; Sil = kuru çalıştırma + adı birebir yazarak onay + otomatik yedek). Düğmeler Ortamlar satırlarıyla aynı boy/biçim.
  const projeSatirlari = baglam.durum.projeler.map((p) => kayitSatiri(
    [p.ad, ' ', p.id === baglam.durum.varsayilanProjeId ? h('span', { class: 'rozet vurgu' }, 'Varsayılan') : null,
      p.id === proje.id ? [' ', h('span', { class: 'rozet' }, 'Açık')] : null],
    p.aciklama ? h('span', {}, p.aciklama) : null,
    projeIslemleri({ proje: p, durum: baglam.durum, sonra: () => { baglam.yonlendir(); }, silinceAdres: '#/ayarlar/proje' }).map((o) => h('button', {
      type: 'button', class: o.tehlikeli ? 'tehlike kucuk-dugme' : 'kucuk-dugme', 'aria-label': `${p.ad}: ${o.kisaMetin.toLocaleLowerCase('tr')}`,
      disabled: Boolean(o.devreDisi), title: o.title || null, 'data-islem': o.ad, onclick: o.fn
    }, ikon(o.ikon), h('span', {}, o.kisaMetin))), 'katman'));

  yerlestir(govde,
    projeFormu,
    bolumBasligi('Projeler', baglam.durum.projeler.length),
    h('ul', { class: 'kayit-listesi proje-listesi' }, projeSatirlari),
    bolumBasligi('Ortamlar', ortamlar.length, h('button', { type: 'button', class: 'birincil', onclick: () => ortamFormu(null) }, ikon('arti'), 'Ortam ekle')),
    formAlani,
    ortamlar.some((o) => riskBelirtilmemisMi(o)) ? riskBelirtinNotu() : null,
    kayitListesi(satirlar, 'Henüz ortam yok.', 'ag'),
    tabanAdresleriBolumu(proje),
    // Kurtarma kuralları kendi Ayarlar bölümüne taşındı; eski yerinden de bulunabilsin.
    h('p', { class: 'not-kutusu bilgi tasindi-notu kurtarma-tasindi', role: 'note' }, 'Kurtarma kuralları artık Ayarlar menüsünde kendi bölümünde: ',
      h('a', { href: '#/ayarlar/kurtarma' }, 'Kurtarma kuralları'), '.'));
}

/**
 * Ayarlar > Kurtarma kuralları (eskiden Proje ve ortamlar sayfasının dibinde). Proje yoksa kısa not.
 * #/ayarlar/kurtarma/yeni: "Kural ekle" penceresi açık gelir (hızlı aramadaki "Kurtarma kuralı ekle").
 */
function kurtarmaKurallariSayfasi(govde, baglam) {
  const proje = baglam.durum.proje;
  if (!proje) { yerlestir(govde, bosDurum('Önce bir proje seçin.', null, { ikon: 'yenile', rol: 'status' })); return; }
  yerlestir(govde, kurtarmaKurallariBolumu(proje, { sayfa: true, yeniKural: baglam.odak === 'yeni' }));
}

// ---------------------------------------------------------------------------------------
// Giriş profilleri
// ---------------------------------------------------------------------------------------

/** Giriş tarifinin giriş adımlarındaki "{ad}" yer tutucusu (giris/tarif.mjs ile aynı desen). */
const YER_TUTUCU = /\{([\p{L}\p{N}_.-]+)\}/gu;

/**
 * Profilin hangi alanlarının gerektiğini ortamın giriş tarifinden çıkarır (ortamId boş = tüm ortamların tarifleri).
 * bilinmiyor: ilgili ortamda tarif yok (bu durumda koşullu alanlar "Gelişmiş" altında durur).
 * kodlar: tarifin profilden istediği kod kaynağı ('totp' / 'sms'; SMS "elle" kipindeyse profilde kod gerekmez).
 * ekAdlar: giriş adımlarındaki {ad} yer tutucuları (profilin ek alanlarından dolar).
 * @param {Array<{ ortamId: string; tarif: any }>} tarifler @param {string} ortamId
 */
function tarifIhtiyaci(tarifler, ortamId) {
  const ilgili = tarifler.filter((o) => o.tarif && (!ortamId || o.ortamId === ortamId)).map((o) => o.tarif);
  const kodlar = new Set();
  /** @type {string[]} */
  const ekAdlar = [];
  for (const t of ilgili) {
    const ik = t.ikinciAdim || { tur: 'yok' };
    if (ik.tur === 'totp') kodlar.add('totp');
    if (ik.tur === 'sms' && ik.smsKipi !== 'elle') kodlar.add('sms');
    for (const a of Array.isArray(t.girisAdimlari) ? t.girisAdimlari : []) {
      for (const e of JSON.stringify(a).matchAll(YER_TUTUCU)) if (!ekAdlar.includes(e[1])) ekAdlar.push(e[1]);
    }
  }
  return { bilinmiyor: ilgili.length === 0, kodlar, ekAdlar };
}

async function girisProfilleri(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const [{ profiller }, { ortamlar }, tarifVerisi] = await Promise.all([
    api(`/platform/giris-profilleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`),
    // Tarif yalnız formun düzenini belirler (hangi alan birincil); gelmezse tüm koşullu alanlar "Gelişmiş" altında durur.
    api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(proje.id)}`).catch((hata) => { if (hata && hata.durum === 423) throw hata; return null; })
  ]);
  const tarifler = tarifVerisi && Array.isArray(tarifVerisi.ortamlar) ? tarifVerisi.ortamlar : [];
  const ortamAdi = (id) => (id ? (ortamlar.find((o) => o.id === id) || { ad: 'silinmiş ortam' }).ad : 'Tüm ortamlar');
  const formAlani = h('div', {});

  const profilFormu = (p) => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: p ? p.ad : '' });
    const ortam = h('select', {}, h('option', { value: '' }, 'Tüm ortamlar'),
      ortamlar.map((o) => h('option', { value: o.id, selected: p ? p.ortamId === o.id : false }, o.ad)));
    const kullanici = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: p ? p.kullaniciAdi : '' });
    const parola = parolaAlani('Parola', {
      kayitli: p ? p.parola : null, zorunlu: !p,
      gosterFn: p ? async () => (await api('/platform/giris-profili/goster', { govde: { id: p.id, alan: 'parola' } })).deger : null
    });
    const tur = p ? p.ikiAsamaliTur : 'yok';
    const radyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: 'iki-asamali', value: deger, id: yeniKimlik('iki'), checked: tur === deger });
      return { r, etiket: h('label', { class: 'secenek', for: r.id }, r, metin) };
    };
    const rYok = radyo('yok', 'Yok');
    const rTotp = radyo('totp', 'Authenticator uygulaması (gizli anahtar)');
    const rSms = radyo('sms', 'SMS');
    const totp = parolaAlani('Authenticator gizli anahtarı', {
      kayitli: p ? p.totpGizli : null,
      yardim: kisaAciklama(`Kurulumda gösterilen base32 anahtar. Kodlar koşu sırasında bu anahtardan üretilir; anahtar kasada şifreli saklanır. Anahtarı bulmak için uygulamanın iki aşamalı doğrulama kurulumunda QR kodun altındaki "elle gir" / "kodu tarayamıyorum" bağlantısına bakın.${p && p.totpGizli && p.totpGizli.dolu ? ' Boş bırakırsanız kayıtlı değer korunur.' : ''}`, 'Authenticator gizli anahtarı'),
      gosterFn: p ? async () => (await api('/platform/giris-profili/goster', { govde: { id: p.id, alan: 'totpGizli' } })).deger : null
    });
    const smsYontem = p && p.sms && p.sms.yontem === 'elle' ? 'elle' : 'sabit';
    const smsSabit = h('input', { type: 'radio', name: 'sms-yontem', value: 'sabit', id: yeniKimlik('sms'), checked: smsYontem === 'sabit' });
    const smsElle = h('input', { type: 'radio', name: 'sms-yontem', value: 'elle', id: yeniKimlik('sms'), checked: smsYontem === 'elle' });
    // Sabit SMS test kodu da parola gibi maskelenir ("Göster" ile açılır).
    const smsKodAlani = parolaAlani('Test kodu', { yardim: 'Test ortamının her girişte kabul ettiği sabit kod.' });
    const smsKod = smsKodAlani.girdi;
    smsKod.value = p && p.sms ? p.sms.kod : '';
    smsKod.setAttribute('inputmode', 'numeric');
    const totpAlani = h('div', { class: 'ic-alanlar' }, totp.kapsayici);
    const smsAlani = h('div', { class: 'ic-alanlar' },
      h('label', { class: 'secenek', for: smsSabit.id }, smsSabit, 'Sabit test kodu'),
      smsKodAlani.kapsayici,
      h('label', { class: 'secenek', for: smsElle.id }, smsElle, 'Koşu sırasında elle girilir'));
    const gorunurluk = () => {
      totpAlani.hidden = !rTotp.r.checked;
      smsAlani.hidden = !rSms.r.checked;
      smsKod.disabled = !smsSabit.checked;
    };
    // Kullanıcı kod kaynağını kendisi seçtiyse ortam değişince tarifin istediği türe kendiliğinden geçilmez.
    let turSecildi = false;
    [rYok.r, rTotp.r, rSms.r].forEach((r) => r.addEventListener('change', () => { turSecildi = true; }));
    [rYok.r, rTotp.r, rSms.r, smsSabit, smsElle].forEach((r) => r.addEventListener('change', gorunurluk));
    gorunurluk();
    const kodBolumu = h('fieldset', { class: 'giris-profili-kod' }, h('legend', {}, 'Doğrulama kodu'),
      h('p', { class: 'yardim' }, kisaAciklama('Giriş tarifi ikinci adımda kod istiyorsa kodun kaynağı. Authenticator anahtarı ve sabit SMS test kodu kasada şifreli saklanır, maskeli gösterilir.', 'Doğrulama kodu')),
      rYok.etiket, rTotp.etiket, totpAlani, rSms.etiket, smsAlani);

    // Ek alanlar: giriş tarifinin giriş adımlarındaki "{ad}" değerleri (ör. firma kodu, şube, PIN). Gizli işaretli olan
    // kasada şifreli saklanır ve maskeli gösterilir (boş bırakılırsa kayıtlı değer korunur).
    const ekSatirlari = [];
    /** Ek alan listesi değişince tarifin istediği eksik adları yeniden çizer (aşağıda bağlanır). */
    let ekDegisti = () => {};
    const ekKutusu = h('div', { class: 'ek-alan-listesi' });
    const ekAlanEkle = (e = { ad: '', gizli: false, deger: '' }) => {
      const adG = h('input', { type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', value: e.ad, placeholder: 'ör. firmaKodu', 'aria-label': 'Ek alan adı' });
      const kayitliGizli = e.gizli && e.deger && typeof e.deger === 'object' && e.deger.dolu;
      const degerG = h('input', {
        type: e.gizli ? 'password' : 'text', autocomplete: 'off', spellcheck: 'false', value: e.gizli ? '' : (e.deger || ''), 'aria-label': 'Ek alan değeri',
        placeholder: kayitliGizli ? `${e.deger.maske} kayıtlı — değiştirmek için yazın` : ''
      });
      const gizli = h('input', { type: 'checkbox', id: yeniKimlik('ekgizli'), checked: Boolean(e.gizli) });
      gizli.addEventListener('change', () => { degerG.type = gizli.checked ? 'password' : 'text'; });
      const s = { adG, degerG, gizli, kayitliGizli, el: null };
      s.el = h('div', { class: 'ek-alan-satiri' }, adG, degerG,
        h('label', { class: 'secenek mini-secenek', for: gizli.id }, gizli, 'Gizli'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Bu ek alanı kaldır', onclick: () => { ekSatirlari.splice(ekSatirlari.indexOf(s), 1); s.el.remove(); ekDegisti(); } }, ikon('carpi')));
      adG.addEventListener('input', () => ekDegisti());
      ekSatirlari.push(s);
      ekKutusu.append(s.el);
      ekDegisti();
    };
    (p && p.ekAlanlar ? p.ekAlanlar : []).forEach(ekAlanEkle);
    // Tarifin istediği ama profilde olmayan {ad}'lar için tek tıkla satır ekleyen düğmeler.
    const eksikEkAlanlar = h('div', { class: 'yer-tutucu-cipleri', 'aria-live': 'polite' });
    const ekAlanlarBolumu = h('fieldset', { class: 'giris-profili-ek' }, h('legend', {}, 'Ek alanlar'),
      h('p', { class: 'yardim' }, kisaAciklama('Kullanıcı adı ve paroladan başka giriş alanı (firma kodu, şube, PIN…) için değer. Giriş tarifinin adımında {ad} olarak kullanılır. Gizli işaretlenen değer kasada şifreli saklanır, maskeli gösterilir ve hata mesajlarına yazılmaz; boş bırakılırsa kayıtlı değer korunur.', 'Ek alanlar')),
      eksikEkAlanlar, ekKutusu, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => ekAlanEkle() }, ikon('arti'), 'Ek alan ekle'));

    // Birincil görünüm: ad, ortam, kullanıcı adı, parola; ortamın giriş tarifi kod / ek alan istiyorsa onlar da.
    // Tarifin istemediği ama profilde dolu olan (ya da tarifi henüz olmayan ortamdaki) ayarlar "Gelişmiş" altındadır;
    // tarif kod istemiyorsa ve profilde kod ayarı yoksa kod alanları hiç gösterilmez.
    const birincilKosullu = h('div', { class: 'giris-profili-kosullu' });
    const gelismisIcerik = h('div', {});
    const gelismis = h('details', { class: 'gelismis-ayarlar giris-profili-gelismis' },
      h('summary', {}, 'Gelişmiş'),
      h('p', { class: 'soluk kucuk' }, 'Bu ortamın giriş tarifinin şu an istemediği ayarlar.'),
      gelismisIcerik);
    const eksikleriCiz = () => {
      const adlar = new Set(ekSatirlari.map((s) => s.adG.value.trim()));
      const eksikler = tarifIhtiyaci(tarifler, ortam.value).ekAdlar.filter((x) => !adlar.has(x));
      eksikEkAlanlar.replaceChildren(...(eksikler.length
        ? [h('span', { class: 'soluk kucuk' }, 'Giriş tarifinin istediği:'), ...eksikler.map((x) => h('button', {
          type: 'button', class: 'kucuk-dugme', 'aria-label': `Ek alan ekle: ${x}`,
          onclick: () => { ekAlanEkle({ ad: x, gizli: false, deger: '' }); ekSatirlari[ekSatirlari.length - 1].degerG.focus(); }
        }, ikon('arti'), h('code', {}, `{${x}}`)))]
        : []));
    };
    ekDegisti = eksikleriCiz;
    /** Bölümü yerine taşır (zaten oradaysa dokunmaz: içindeki odak kaybolmaz). */
    const yerlestirBolum = (bolum, hedef) => { if (bolum.parentElement !== hedef) hedef.append(bolum); };
    const duzeniKur = () => {
      const ihtiyac = tarifIhtiyaci(tarifler, ortam.value);
      // Yeni profilde (kullanıcı seçmediyse) kod kaynağı tarifin istediği türle başlar; tarif istemiyorsa "Yok"a döner.
      if (!p && !turSecildi) {
        const tek = ihtiyac.kodlar.size === 1 ? [...ihtiyac.kodlar][0] : 'yok';
        ({ yok: rYok, totp: rTotp, sms: rSms })[tek].r.checked = true;
        gorunurluk();
      }
      if (ihtiyac.kodlar.size > 0) yerlestirBolum(kodBolumu, birincilKosullu);
      else if (ihtiyac.bilinmiyor || !rYok.r.checked) yerlestirBolum(kodBolumu, gelismisIcerik);
      else kodBolumu.remove();
      yerlestirBolum(ekAlanlarBolumu, ihtiyac.ekAdlar.length ? birincilKosullu : gelismisIcerik);
      // Sıra sabit: kod bölümü ek alanlardan önce.
      for (const kap of [birincilKosullu, gelismisIcerik]) if (kap.contains(kodBolumu) && kap.firstElementChild !== kodBolumu) kap.prepend(kodBolumu);
      gelismis.hidden = gelismisIcerik.childElementCount === 0;
      eksikleriCiz();
    };
    ortam.addEventListener('change', duzeniKur);
    duzeniKur();

    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(p ? `Giriş profilini düzenle: ${p.ad}` : 'Yeni giriş profili', mesaj.kutu,
      alan('Profil adı', ad, { zorunlu: true, yardim: 'Ör. "Yönetici kullanıcı".' }),
      alan('Ortam', ortam, { yardim: kisaAciklama('Profilin kullanılacağı ortam. "Tüm ortamlar" seçilirse ortama özel profili olmayan her ortamda kullanılır; gösterilen alanlar o ortamların giriş tarifine göre belirlenir.', 'Ortam') }),
      alan('Kullanıcı adı', kullanici, { zorunlu: true }),
      parola.kapsayici,
      birincilKosullu,
      gelismis,
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    /** Alan "Gelişmiş" içindeyse önce açar, sonra hatayı yazıp odaklar. */
    const hataGoster = (girdi, metin) => { if (gelismis.contains(girdi)) gelismis.open = true; alanHatasi(girdi, metin); girdi.focus(); };
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      mesaj.temizle();
      [ad, kullanici, parola.girdi, totp.girdi, smsKod].forEach((g) => alanHatasi(g, ''));
      if (!ad.value.trim()) { hataGoster(ad, 'Profil adı boş olamaz.'); return; }
      if (!kullanici.value.trim()) { hataGoster(kullanici, 'Kullanıcı adı boş olamaz.'); return; }
      if (!p && !parola.girdi.value) { hataGoster(parola.girdi, 'Parola girin.'); return; }
      const secilenTur = rTotp.r.checked ? 'totp' : rSms.r.checked ? 'sms' : 'yok';
      if (secilenTur === 'totp' && !totp.girdi.value && !(p && p.totpGizli.dolu)) { hataGoster(totp.girdi, 'Authenticator gizli anahtarını girin.'); return; }
      if (secilenTur === 'sms' && smsSabit.checked && !smsKod.value.trim()) { hataGoster(smsKod, 'Test kodunu girin veya "koşu sırasında elle girilir" seçin.'); return; }
      const istek = {
        id: p ? p.id : undefined, projeId: proje.id, ad: ad.value.trim(), ortamId: ortam.value || null,
        kullaniciAdi: kullanici.value.trim(), ikiAsamaliTur: secilenTur,
        sms: { yontem: smsElle.checked ? 'elle' : 'sabit', kod: smsKod.value.trim() }
      };
      const ekAdlar = new Set();
      for (const s of ekSatirlari) {
        const ekAd = s.adG.value.trim();
        if (!/^[\p{L}\p{N}_.-]{1,60}$/u.test(ekAd)) { mesaj.goster(`Ek alan adı "${ekAd}" geçersiz: boşluksuz; harf, rakam, _ . - (ör. firmaKodu).`); if (gelismis.contains(s.adG)) gelismis.open = true; s.adG.focus(); return; }
        if (ekAdlar.has(ekAd)) { mesaj.goster(`"${ekAd}" ek alanı iki kez yazılmış.`); if (gelismis.contains(s.adG)) gelismis.open = true; s.adG.focus(); return; }
        ekAdlar.add(ekAd);
      }
      // Gizli alanda boş değer = kayıtlı değeri koru (sunucu); açık alanda yazılan değer olduğu gibi.
      istek.ekAlanlar = ekSatirlari.map((s) => (s.gizli.checked
        ? { ad: s.adG.value.trim(), gizli: true, ...(s.degerG.value ? { deger: s.degerG.value } : {}) }
        : { ad: s.adG.value.trim(), gizli: false, deger: s.degerG.value }));
      if (parola.girdi.value) istek.parola = parola.girdi.value;
      if (secilenTur === 'totp' && totp.girdi.value) istek.totpGizli = totp.girdi.value.replace(/\s+/g, '');
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/giris-profili/kaydet', { govde: istek }));
        bildir('Giriş profili kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(formAlani, form);
  };

  // Satır sade: ad, ortam, kullanıcı adı (parola ve kod kaynağı gösterilmez; ayrıntı düzenleme formunda).
  // "<ortam> · " ile başlayan meta, tarif formundaki "Profili aç" bağlantısının profil bulma biçimidir.
  const satirlar = profiller.map((p) => kayitSatiri(p.ad,
    `${ortamAdi(p.ortamId)} · ${p.kullaniciAdi}`,
    [duzenleDugmesi(p.ad, () => profilFormu(p)), gecmisDugmesi(p.ad, () => gecmisGoster('giris_profili', p.id, p.ad, baglam)),
      silDugmesi(p.ad, async () => { await api('/platform/giris-profili/sil', { govde: { id: p.id } }); bildir('Giriş profili silindi.'); yenile(); })], 'kullanici'));

  const tarifAlani = h('section', { class: 'giris-tarifi-bolumu', 'aria-label': 'Giriş tarifi' }, iskelet('liste'));
  govde.replaceChildren(
    bolumBasligi('Profiller', profiller.length, h('button', { type: 'button', class: 'birincil', onclick: () => profilFormu(null) }, ikon('arti'), 'Giriş profili ekle')),
    formAlani,
    kayitListesi(satirlar, 'Henüz giriş profili yok.', 'kullanici'),
    tarifAlani);
  await girisTarifiBolumu(tarifAlani, baglam).catch((hata) => {
    if (hata && hata.durum === 423) throw hata;
    tarifAlani.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, `Giriş tarifleri yüklenemedi: ${hata.message || hata}`));
  });
}

// ---------------------------------------------------------------------------------------
// Test verisi: tablolar (bağlam profilleri dahil; bkz. tablolar.js)
// ---------------------------------------------------------------------------------------

async function testVerisi(govde, baglam) {
  // Tablolar (kendi içinde yeniden çizilir). "Test verisi ayarları" (kullanıcı kararları; ör. birleştirme önerisi eşiği) Veri sağlığı
  // kartının başlığındaki ayarlar (dişli) düğmesiyle diyalogda açılır (veri-sagligi.js); sayfada ayrı kart yok.
  const tablolarKap = h('div', { class: 'test-verisi-tablolari' });
  yerlestir(govde, tablolarKap);
  await tablolarBolumu(tablolarKap, baglam.durum.proje, {
    ayarlarFormu: (kaydedildi) => ayarFormu('testVerisi', 'Test verisi ayarları', 'Test verisi ayarları kaydedildi.', { baslik: 'Veri sağlığı önerileri', kaydedildi })
  });
}

// ---------------------------------------------------------------------------------------
// Yedekleme
// ---------------------------------------------------------------------------------------

// Dışa aktarma formu (ortak): Ayarlar > Yedekleme > "Dışa aktar" ve "Çalışma alanını kapat" > "Dışa aktar ve kapat"
// (calisma-alani.js) AYNI akışı kullanır — medya seçimi (tahmini boyutlarla), kasa parolası, arka plan işi (ilerleme) ve
// tarayıcının kendi indirmesi (büyük dosya belleğe alınmaz). Medya varsayılanları sunucudaki yedek.mjs > VARSAYILAN_MEDYA_SECIMI.
const MEDYA_SECENEKLERI = [
  { ad: 'ekranGoruntuleriDahil', etiket: 'Ekran görüntüleri', aciklama: 'hata bağlamı gibi küçük ekler dahil' },
  { ad: 'videolarDahil', etiket: 'Videolar', aciklama: 'büyük olabilir' },
  { ad: 'izDosyalariDahil', etiket: 'İz (trace) dosyaları', aciklama: 'büyük olabilir' }
];

/**
 * @param {{ secenekler?: Record<string, { sayi: number; bayt: number }>; varsayilan?: Record<string, boolean> } | null} tahmin GET /platform/yedek/tahmin
 * @param {{ baslik?: string | null; aciklama?: string | null; dugmeMetni?: string; kart?: boolean; ekDugmeler?: Node[];
 *   bitti?: (is: { dosyaAdi: string; boyut: number | null; medya: { dosyaSayisi?: number } | null }) => void | Promise<void> }} [ayar]
 *   bitti: indirme başlatıldıktan sonra çağrılır (ör. çalışma alanını kapatmak için).
 */
export function disaAktarmaFormu(tahmin, ayar = {}) {
  const parola = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'current-password', yardim: 'Yedeği indirmeden önce parolayı yeniden girin. Yedek dosyası bu parolayla şifrelenir.' });
  const disaMesaj = mesajKutusu();
  const indir = h('button', { type: 'submit', class: 'birincil' }, ayar.dugmeMetni || 'Yedeği indir');
  const varsayilan = (tahmin && tahmin.varsayilan) || { ekranGoruntuleriDahil: true, videolarDahil: false, izDosyalariDahil: false };
  const toplamSatiri = h('p', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const kutular = MEDYA_SECENEKLERI.map((s) => {
    const t = tahmin && tahmin.secenekler ? tahmin.secenekler[s.ad] : null;
    const kutu = h('input', { type: 'checkbox', id: yeniKimlik('medya'), name: s.ad, checked: Boolean(varsayilan[s.ad]) });
    const tahminMetni = t ? (t.sayi ? `${t.sayi} dosya, yaklaşık ${boyutMetni(t.bayt)}` : 'bu bilgisayarda yok') : 'boyut hesaplanamadı';
    return {
      ad: s.ad, kutu, t,
      oge: h('label', { class: 'secenek', for: kutu.id }, kutu,
        h('span', { class: 'secenek-metni' }, h('b', {}, s.etiket), h('span', { class: 'tahmin' }, `${tahminMetni} (${s.aciklama})`)),
        h('span', { class: 'boyut-rozeti', 'aria-hidden': 'true' }, t && t.sayi ? boyutMetni(t.bayt) : '—'))
    };
  });
  const toplamGuncelle = () => {
    const secili = kutular.filter((k) => k.kutu.checked && k.t);
    const bayt = secili.reduce((a, k) => a + k.t.bayt, 0);
    toplamSatiri.textContent = secili.length
      ? `Seçilen medya: yaklaşık ${boyutMetni(bayt)} (veriler buna ek olarak küçük bir yer tutar).`
      : 'Medya dosyası eklenmeyecek; yedekteki sonuçlarda medya "yedeğe dahil edilmedi" olarak görünür.';
  };
  for (const k of kutular) k.kutu.addEventListener('change', toplamGuncelle);
  toplamGuncelle();
  const ilerlemeCubugu = h('progress', { max: '100', value: '0', 'aria-label': 'Yedek hazırlanıyor' });
  const ilerlemeMetni = h('p', { class: 'soluk kucuk secim-sayaci', 'aria-live': 'polite' });
  const ilerlemeYuzdesi = h('span', { class: 'yuzde', 'aria-hidden': 'true' }, '%0');
  const ilerlemeKutusu = h('div', { class: 'ilerleme', hidden: true },
    h('div', { class: 'ilerleme-ust' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), ilerlemeMetni, ilerlemeYuzdesi), ilerlemeCubugu);
  const baslik = ayar.baslik === null ? null : h('h3', {}, ikon('indir'), ayar.baslik || 'Dışa aktar');
  const aciklama = ayar.aciklama === null ? null
    : h('p', { class: 'soluk' }, ayar.aciklama || 'Tüm proje verisini tek bir şifreli .tayedek dosyası olarak indirir. Dosyayı başka bir bilgisayarda "Yedek yükle" ile açabilirsiniz.');
  const form = h('form', { class: ayar.kart === false ? 'disa-aktarma-formu' : 'kart', novalidate: true }, baslik, aciklama,
    disaMesaj.kutu,
    h('fieldset', { class: 'medya-secimi' }, h('legend', {}, 'Yedeğe eklenecek medya dosyaları'), kutular.map((k) => k.oge), toplamSatiri),
    parola.kapsayici, ilerlemeKutusu, h('div', { class: 'dugmeler' }, ...(ayar.ekDugmeler || []), indir));
  let durdur = () => {};
  const ilerlemeGoster = (is) => {
    ilerlemeKutusu.hidden = false;
    ilerlemeCubugu.value = is.yuzde || 0;
    ilerlemeMetni.textContent = is.asama;
    ilerlemeYuzdesi.textContent = `%${Math.round(is.yuzde || 0)}`;
  };
  const ilerlemeGizle = () => { ilerlemeKutusu.hidden = true; };
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    disaMesaj.temizle();
    alanHatasi(parola.girdi, '');
    if (!parola.girdi.value) { alanHatasi(parola.girdi, 'Parolayı girin.'); parola.girdi.focus(); return; }
    const secim = Object.fromEntries(kutular.map((k) => [k.ad, k.kutu.checked]));
    await mesgulIken(indir, 'Hazırlanıyor…', async () => {
      let isId;
      try {
        ({ isId } = await api('/platform/yedek/disa-aktar', { govde: { parola: parola.girdi.value, ...secim } }));
      } catch (hata) {
        if (hata.durum === 423) return;
        if (hata.durum === 429 && hata.bekleSaniye) {
          durdur();
          durdur = geriSayim(hata.bekleSaniye, (k) => disaMesaj.goster(k > 0 ? `Art arda yanlış parola girildi. ${k} saniye sonra tekrar deneyebilirsiniz.` : 'Şimdi tekrar deneyebilirsiniz.'));
          return;
        }
        disaMesaj.goster(hata.message || 'Yedek alınamadı.');
        return;
      }
      parola.girdi.value = '';
      ilerlemeGoster({ asama: 'başlıyor', yuzde: 0 });
      for (;;) {
        await new Promise((coz) => setTimeout(coz, 400));
        let is;
        try {
          ({ is } = await api(`/platform/yedek/disa-aktar/${isId}`));
        } catch (hata) {
          ilerlemeGizle();
          disaMesaj.goster((hata.govde && hata.govde.is && hata.govde.is.mesaj) || hata.message);
          return;
        }
        if (is.durum === 'hazirlaniyor') { ilerlemeGoster(is); continue; }
        ilerlemeGizle();
        if (is.durum !== 'hazir') { disaMesaj.goster(is.mesaj || 'Yedek alınamadı.'); return; }
        // Tarayıcının kendi indirmesi (büyük dosya belleğe alınmaz).
        const a = h('a', { href: `/platform/yedek/disa-aktar/${isId}/indir?token=${encodeURIComponent(TOKEN)}`, download: is.dosyaAdi, hidden: true });
        document.body.append(a);
        a.click();
        a.remove();
        const medya = is.medya && is.medya.dosyaSayisi ? `, ${is.medya.dosyaSayisi} medya dosyası` : ', medya dosyası yok';
        disaMesaj.goster(`Yedek hazır ve indiriliyor: ${is.dosyaAdi} (${boyutMetni(is.boyut || 0)}${medya}).`, 'basari');
        if (ayar.bitti) {
          try { await ayar.bitti(is); } catch (hata) { disaMesaj.goster(hata.message || String(hata)); }
        }
        return;
      }
    });
  });
  return { form, parola };
}

async function yedekleme(govde, baglam, yenile) {
  const [{ klasor, dosyalar }, tahmin, saklamaFormu, { klasor: yedekKlasoru }, veriKarti] = await Promise.all([
    api('/platform/yedek/otomatik-liste'),
    api('/platform/yedek/tahmin').catch(() => null),
    saklamaKarti(),
    api('/platform/yedek/klasor'),
    veriKlasoruKarti()
  ]);

  // Dışa aktar (ortak form — "Çalışma alanını kapat" > "Dışa aktar ve kapat" da bunu kullanır)
  const { form: disaForm } = disaAktarmaFormu(tahmin);

  // İçe aktar
  const iceAlani = h('div', {});
  const iceBaslat = h('button', { type: 'button', class: 'birincil' }, 'Yedek dosyası seç…');
  const iceKart = h('div', { class: 'kart' }, h('h3', {}, ikon('yukle'), 'İçe aktar'),
    h('p', { class: 'soluk' }, 'Bir yedekteki kayıtları bu bilgisayardakilerle karşılaştırır; neyin ekleneceğini ve değişeceğini seçersiniz. Bu bilgisayardaki kayıtlar silinmez.'),
    h('div', { class: 'dugmeler' }, iceBaslat));
  const digerKartlar = () => [disaForm, otomatikKart];
  iceBaslat.addEventListener('click', () => {
    iceKart.hidden = true;
    for (const k of digerKartlar()) k.hidden = true;
    iceAktarmaAkisi(iceAlani, {
      mod: 'ayarlar',
      bitti: async () => { await baglam.projeleriYenile(); yenile(); },
      vazgec: () => { iceAlani.replaceChildren(); iceKart.hidden = false; for (const k of digerKartlar()) k.hidden = false; iceBaslat.focus(); }
    });
  });

  // Otomatik yedekler
  const simdi = h('button', { type: 'button' }, ikon('arsiv'), 'Şimdi yedek al');
  simdi.addEventListener('click', async () => {
    try {
      await mesgulIken(simdi, 'Yedek alınıyor…', () => api('/platform/yedek/otomatik', { govde: {} }));
      bildir('Yedek alındı.');
      yenile();
    } catch (hata) { bildir(hata.message, 'hata'); }
  });
  const liste = kayitListesi(dosyalar.map((d) => kayitSatiri(h('span', { class: 'mono' }, d.ad), `${tarihMetni(d.zaman)} · ${boyutMetni(d.boyut)}${d.otomatik ? '' : ' · elle alınmış'}`, [], 'arsiv')),
    'Henüz yerel yedek yok.', 'arsiv');

  const otomatikKart = h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('saat'), 'Otomatik yedekler'), h('div', { class: 'sag' }, simdi)),
    h('p', { class: 'soluk' }, 'Sunucu açıkken ve kasa açıkken günde bir yerel yedek alınır; kaç tanesinin saklanacağını aşağıdaki "Saklama" kartından belirlersiniz.'),
    h('p', { class: 'soluk kucuk' }, 'Klasör: ', h('code', {}, klasor)),
    yedekKlasoruBolumu(yedekKlasoru, yenile),
    liste);
  govde.replaceChildren(disaForm, iceKart, iceAlani, otomatikKart, saklamaFormu, veriKarti, sonucTemizlemeKarti());
  // Hızlı aramadan gelince (#/ayarlar/yedekleme/disa | ice): ilgili kart görünür alana gelir ve ilk öğesine odaklanılır.
  const hedef = baglam.odak === 'disa' ? disaForm : baglam.odak === 'ice' ? iceKart : null;
  if (hedef) {
    hedef.scrollIntoView({ block: 'start' });
    /** @type {HTMLElement | null} */ (baglam.odak === 'ice' ? iceBaslat : hedef.querySelector('input[type="password"]'))?.focus();
  }
}

/**
 * Ayarlar > Yedekleme > Saklama: dört saklama kuralı TEK kartta ve tek zaman çizelgesinde — koşu sonuçlarını sakla, medyayı
 * incelt (3 ayar), rapor saklama ve video saklama (güvenlik amaçlı; kalkan simgeli) + otomatik yedek sayısı. Anahtarlar ve
 * davranış aynıdır: ilk dördü koşu ayarlarına (/platform/kosu-ayarlari), video saklama güvenlik ayarına (/platform/guvenlik)
 * yazılır; tek "Kaydet" ikisini de kaydeder. Çizelge formdaki değerlerle canlı güncellenir (kaydetmeden önce görülür).
 */
async function saklamaKarti() {
  const guv = await api('/platform/guvenlik');
  const videoGun = h('input', { type: 'number', min: '1', max: '365', step: '1', value: String(guv.videoSaklamaGun), inputmode: 'numeric' });
  const videoAlani = alan('Video saklama süresi (gün)', videoGun, { yardim: `Koşu videoları şifreli saklanır; bu süreden eski videolar günlük temizlikte silinir (güvenlik amaçlı). Ekran görüntüleri, izler ve sonuçlar bu kuralla silinmez. 1–365 gün; varsayılan ${guv.videoSaklamaVarsayilan}.` });
  videoAlani.classList.add('guvenlik-kurali');
  videoAlani.querySelector('label')?.prepend(h('span', { class: 'kalkan-simge', title: 'Güvenlik amaçlı kural', 'aria-hidden': 'true' }, ikon('kalkan')));
  const cizelge = h('ol', { class: 'saklama-cizelgesi', 'aria-label': 'Saklama zaman çizelgesi' });
  const kalan = h('p', { class: 'saklama-ozeti', 'aria-live': 'polite' });
  const ust = h('div', { class: 'saklama-gorunumu' }, h('h4', {}, 'Ne zaman ne silinir?'), cizelge, kalan);
  /** @param {Record<string, unknown>} d */
  const degisti = (d) => {
    const video = Number(videoGun.value);
    const sonuc = Number(d.sonucSaklamaGun);
    const rapor = Number(d.raporSaklamaGun);
    const incelt = String(d.medyaInceltme);
    const inceltGun = Number(d.medyaInceltmeGun);
    const koru = d.medyaInceltmeKoru === true;
    const kimin = { basarili: 'başarılı testlerin', hatali: 'başarısız testlerin', ikisi: 'tüm testlerin' }[incelt];
    /** @type {Array<{ gun: number; metin: string; guvenlik?: boolean }>} */
    const olaylar = [];
    if (kimin && inceltGun > 0) olaylar.push({ gun: inceltGun, metin: `${kimin} ekran görüntüleri ve videoları silinir${koru && incelt !== 'basarili' ? ' (başarısız testlerde hatanın görüldüğü 2 görüntü kalır)' : ''}` });
    if (video > 0) olaylar.push({ gun: video, metin: 'tüm videolar silinir', guvenlik: true });
    if (rapor > 0) olaylar.push({ gun: rapor, metin: 'kaydedilen PDF raporlar silinir' });
    if (sonuc > 0) olaylar.push({ gun: sonuc, metin: 'koşu sonucunun tamamı silinir (adımlar, görüntüler, videolar, izler)' });
    olaylar.sort((a, b) => a.gun - b.gun);
    const suresiz = [sonuc > 0 ? null : 'sonuç, adımlar ve izler', rapor > 0 ? null : 'PDF raporlar'].filter(Boolean);
    cizelge.replaceChildren(
      ...olaylar.map((o) => h('li', { class: o.guvenlik ? 'guvenlik-kurali' : null },
        h('span', { class: 'gun' }, `${o.gun} gün`), h('span', { class: 'olay' }, o.metin),
        o.guvenlik ? h('span', { class: 'kalkan-simge', title: 'Güvenlik amaçlı kural' }, ikon('kalkan'), h('span', { class: 'gorunmez' }, ' (güvenlik amaçlı)')) : null)),
      ...(suresiz.length ? [h('li', { class: 'suresiz' }, h('span', { class: 'gun' }, 'süresiz'), h('span', { class: 'olay' }, `${suresiz.join(' ve ')} kalır`))] : []));
    // "N gün sonra elinizde kalan" (N: en uzun süreli kural, yoksa 90).
    const n = olaylar.length ? olaylar[olaylar.length - 1].gun : 90;
    let metin;
    if (sonuc > 0 && sonuc <= n) metin = `${n} gün sonra o koşunun sonucu kalmaz (Koşu sonuçlarını sakla: ${sonuc} gün).`;
    else {
      const parcalar = ['durum, süre, hata metni, adımlar ve iz'];
      const inceltildi = kimin && inceltGun <= n;
      if (!inceltildi) parcalar.push('ekran görüntüleri');
      else if (incelt === 'basarili') parcalar.push('başarısız testlerin ekran görüntüleri');
      else if (incelt === 'hatali') parcalar.push(`başarılı testlerin ekran görüntüleri${koru ? ' ve başarısız testlerin 2 kanıt görüntüsü' : ''}`);
      else if (koru) parcalar.push('başarısız testlerin 2 kanıt görüntüsü');
      const videoKalir = video > n && !(kimin && inceltGun <= n && incelt === 'ikisi');
      if (videoKalir) parcalar.push(incelt === 'basarili' && inceltildi ? 'başarısız testlerin videoları' : incelt === 'hatali' && inceltildi ? 'başarılı testlerin videoları' : 'videolar');
      if (!(rapor > 0 && rapor <= n)) parcalar.push('PDF raporlar');
      metin = `${n} gün sonra elinizde kalan: ${parcalar.join(', ')}.`;
    }
    kalan.textContent = metin;
  };
  return ayarFormu('yedekleme', 'Saklama ayarları', 'Saklama ayarları kaydedildi; günlük yedek ve temizlikte geçerli.', {
    sinif: 'saklama-karti',
    basliklar: [h('h3', {}, ikon('saat'), 'Saklama'), h('p', { class: 'soluk' }, 'Dört saklama kuralı tek yerde: koşu sonuçları, medya inceltme, rapor saklama ve video saklama. Günlük temizlikte sıra: 1) koşu sonuçlarını sakla (bütün sonuç), 2) medyayı incelt, 3) video saklama, 4) sahipsiz dosyalar; video hangi kuralın süresi önce dolarsa o zaman silinir.')],
    ek: {
      ust, alanlar: [h('fieldset', {}, h('legend', {}, 'Video saklama'), videoAlani)], degisti,
      dogrula: () => {
        alanHatasi(videoGun, '');
        const g = Number(videoGun.value);
        if (Number.isInteger(g) && g >= 1 && g <= 365) return true;
        alanHatasi(videoGun, '1 ile 365 arasında bir tam sayı girin.');
        videoGun.focus();
        return false;
      },
      kaydet: async () => {
        const g = Number(videoGun.value);
        if (g !== Number(guv.videoSaklamaGun)) { await api('/platform/guvenlik/kaydet', { govde: { videoSaklamaGun: g } }); guv.videoSaklamaGun = g; }
      }
    }
  });
}

// ---------------------------------------------------------------------------------------
// Güvenlik
// ---------------------------------------------------------------------------------------

/**
 * Geçmiş sonuçları sil (geri alınamaz): tümü ya da N günden eski koşular — sonuçlar, adımlar, ekran görüntüleri, videolar, izler
 * ile servis / akış koşuları. Önce sayım gösterilir; silme düğmesi sayımdan sonra açılır.
 */
function sonucTemizlemeKarti() {
  const kapsam = h('select', {}, h('option', { value: 'tumu' }, 'Tüm geçmiş sonuçlar'), h('option', { value: 'gun' }, 'Şu kadar günden eski olanlar'));
  const gun = h('input', { type: 'number', min: '1', max: '3650', step: '1', value: '30', inputmode: 'numeric', 'aria-label': 'Gün' });
  const gunAlani = alan('Gün', gun);
  gunAlani.hidden = true;
  const mesaj = mesajKutusu();
  const say = h('button', { type: 'button' }, 'Neler silinecek?');
  const sil = h('button', { type: 'button', class: 'tehlike', disabled: true }, ikon('cop'), 'Kalıcı olarak sil');
  const govdeAl = () => (kapsam.value === 'tumu' ? { tumu: true } : { gun: Number(gun.value) });
  const sifirla = () => { sil.disabled = true; mesaj.temizle(); };
  kapsam.addEventListener('change', () => { gunAlani.hidden = kapsam.value === 'tumu'; sifirla(); });
  gun.addEventListener('input', sifirla);
  say.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const { onizleme: o } = await mesgulIken(say, 'Sayılıyor…', () => api('/platform/sonuclar/temizle', { govde: govdeAl() }));
      const toplam = o.kosu + o.servisKosusu + o.akisKosusu;
      mesaj.goster(toplam ? `Silinecek: ${o.kosu} ekran koşusu (${o.sonuc} sonuç, ${o.medya} ekran görüntüsü / video / iz), ${o.servisKosusu} servis koşusu, ${o.akisKosusu} akış koşusu. Bu işlem geri alınamaz.` : 'Silinecek sonuç yok.', toplam ? 'uyari' : 'basari');
      sil.disabled = !toplam;
    } catch (hata) { mesaj.goster(hata.message); }
  });
  sil.addEventListener('click', async () => {
    try {
      const { silinen: s } = await mesgulIken(sil, 'Siliniyor…', () => api('/platform/sonuclar/temizle', { govde: { ...govdeAl(), onay: true } }));
      mesaj.goster(`Silindi: ${s.kosu} ekran koşusu (${s.sonuc} sonuç, ${s.medya} medya dosyası), ${s.servisKosusu} servis koşusu, ${s.akisKosusu} akış koşusu.`, 'basari');
      sil.disabled = true;
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return h('div', { class: 'kart form-paneli', role: 'group', 'aria-label': 'Geçmiş sonuçları sil' }, h('h3', {}, ikon('cop'), 'Geçmiş sonuçları sil'),
    h('p', { class: 'soluk' }, 'Koşu sonuçlarını, adımlarını, ekran görüntülerini, videolarını ve izlerini; servis ve akış koşularını siler. Senaryolar, ekranlar ve test verisi silinmez. Çalışmakta olan koşular etkilenmez.'),
    mesaj.kutu, alan('Kapsam', kapsam), gunAlani, h('div', { class: 'dugmeler' }, say, sil));
}

/** Ayarlar > Koşu: koşu ayarları + hata sınıflandırma kuralları (planlı koşular üst menüde: Planlı koşular). */
async function kosuAyarlari(govde, baglam) {
  const proje = baglam && baglam.durum ? baglam.durum.proje : null;
  const [form, kurallar] = await Promise.all([
    ayarFormu('kosu', 'Koşu ayarları', 'Koşu ayarları kaydedildi; sonraki koşulardan itibaren geçerli.', proje ? { projeId: proje.id } : {}), siniflandirmaKarti()
  ]);
  const tasindi = h('p', { class: 'not-kutusu bilgi tasindi-notu', role: 'note' }, 'Planlı koşular (kurallar, kaçan / çakışan zaman davranışı, kasa kilitliyken çalışma) artık üst menüde: ',
    h('a', { href: '#/planli-kosular' }, 'Planlı koşular'), '.');
  yerlestir(govde, form, kurallar, tasindi);
  // #/ayarlar/kosu/<ayar anahtarı> (ör. giriş tarifindeki "Oturum kontrolü" bağlantısı, hızlı arama): ayarın bulunduğu kapalı
  // "Gelişmiş" açılır, alan görünür alana gelir ve odaklanır.
  const odak = baglam && baglam.odak ? form.querySelector(`[data-ayar="${CSS.escape(baglam.odak)}"]`) : null;
  if (odak) {
    const kapali = odak.closest('details');
    if (kapali) /** @type {HTMLDetailsElement} */ (kapali).open = true;
    odak.classList.add('ayar-vurgu');
    odak.scrollIntoView({ block: 'center' });
    /** @type {HTMLElement | null} */ (odak.querySelector('input, select'))?.focus();
  }
}

/**
 * Planlı koşular (üst menü; eskiden Ayarlar > Koşu içinde kart): planlı koşu kuralları + "Planlı koşu davranışı"
 * (kaçan / çakışan zaman; tüm kurallar için) + kasa kilitliyken ve açılışta tercihleri. Proje yoksa yalnız davranış formu.
 */
async function planliKosular(govde, baglam) {
  const proje = baglam && baglam.durum ? baglam.durum.proje : null;
  const zamanlamaFormu = () => ayarFormu('zamanlama', 'Planlı koşu davranışı', 'Planlı koşu davranışı kaydedildi.', { baslik: 'Tüm planlı koşular için' });
  const zamanli = await (proje ? zamanlanmisKosularKarti(proje, { davranisFormu: zamanlamaFormu }).catch((hata) => {
    if (hata && hata.durum === 423) throw hata;
    return h('div', { class: 'not-kutusu hata', role: 'alert' }, `Planlı koşular yüklenemedi: ${hata.message || hata}`);
  }) : zamanlamaFormu().then((f) => h('section', { class: 'kart form-paneli', 'aria-label': 'Planlı koşu kuralları' }, h('h3', {}, ikon('tarih'), 'Planlı koşular'), f)));
  yerlestir(govde, zamanli);
}

/** Hata sınıflandırma kuralları: "hata mesajında şu geçerse → kategori" (genel kurallardan önce denenir). */
async function siniflandirmaKarti() {
  const { kurallar, kategoriler } = await api('/platform/siniflandirma');
  const is = kurallar.map((k) => ({ ...k }));
  const mesaj = mesajKutusu();
  const liste = h('div', { class: 'siniflandirma-kurallari' });
  const ciz = () => {
    yerlestir(liste, is.length ? is.map((k, n) => {
      const metin = h('input', { type: 'text', value: k.icerir, maxlength: '200', 'aria-label': `${n + 1}. kural: hata mesajında geçen metin`, placeholder: 'ör. beklenmeyen bir hata' });
      metin.addEventListener('input', () => { k.icerir = metin.value; });
      const kat = h('select', { 'aria-label': `${n + 1}. kural: kategori` }, kategoriler.map((x) => h('option', { value: x, selected: x === k.kategori }, x)));
      kat.addEventListener('change', () => { k.kategori = kat.value; });
      return h('div', { class: 'kural-satiri' }, metin, kat,
        h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${n + 1}. kuralı sil`, onclick: () => { is.splice(n, 1); ciz(); } }, ikon('carpi')));
    }) : h('p', { class: 'soluk kucuk' }, 'Kural yok: yalnız genel kurallar (zaman aşımı, seçici, doğrulama) uygulanır.'));
  };
  ciz();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart form-paneli', novalidate: true, 'aria-label': 'Hata sınıflandırma kuralları' },
    h('h3', {}, ikon('uyari'), 'Hata sınıflandırma kuralları'),
    h('p', { class: 'soluk' }, 'Başarısız testin hata mesajında bu metin geçerse Sonuçlar\'da seçtiğiniz kategoride görünür (ör. uygulamanızın iş kuralı pop-up metni → "İş Kuralı / Ekran Hatası"). Kurallar yukarıdan aşağı denenir; eşleşmezse genel kurallar uygulanır. Yeni koşulara uygulanır.'),
    mesaj.kutu, liste,
    h('div', { class: 'dugmeler' },
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { is.push({ icerir: '', kategori: kategoriler[0] }); ciz(); } }, ikon('arti'), 'Kural ekle'), kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/siniflandirma/kaydet', { govde: { kurallar: is.map((k) => ({ icerir: k.icerir.trim(), kategori: k.kategori })) } }));
      mesaj.goster(`${r.kurallar.length} kural kaydedildi.`, 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return form;
}

/**
 * Ayarlar > Koşu'nun hazır profilleri (kosu-profilleri.mjs): "Kanıt düzeyi" (6 kayıt ayarı) ve "Ortam hızı" (15 zaman aşımı /
 * bekleme süresi). Profil saklanmaz: seçim formdaki ilgili alanları topluca doldurur (Kaydet'e basınca yazılır); gösterilen profil
 * formdaki değerlerden türetilir — değerler hiçbir profile uymuyorsa "Özel".
 * @param {Array<Record<string, any>>} tanimlar tüm ayar tanımları (varsayılan ve sınırlar için)
 */
function kosuProfilSecimleri(tanimlar) {
  /** @type {Array<{ girdi: HTMLInputElement; ad: string }>} */
  const kanitRadyolari = [];
  /** @type {Array<{ girdi: HTMLInputElement; ad: string }>} */
  const hizRadyolari = [];
  const kanitAciklamasi = h('p', { class: 'yardim profil-aciklamasi', 'aria-live': 'polite' });
  const secimGrubu = (baslik, yardim, secenekler, radyolar, aciklama) => {
    const ad = yeniKimlik('profil');
    return h('fieldset', { class: 'profil-secimi' }, h('legend', {}, baslik),
      h('div', { class: 'profil-secenekleri' }, secenekler.map((p) => {
        const girdi = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: ad, value: p.ad, id: `${ad}-${p.ad}` }));
        radyolar.push({ girdi, ad: p.ad });
        return h('label', { class: 'profil-secenegi', for: girdi.id }, girdi, h('span', {}, h('b', {}, p.etiket), h('small', { class: 'soluk' }, p.ozet)));
      })),
      aciklama, h('p', { class: 'yardim' }, yardim));
  };
  const ozel = { ad: 'ozel', etiket: 'Özel…', ozet: 'alanları tek tek seçin' };
  const alanlar = [
    secimGrubu('Kanıt düzeyi', 'Video, video boyutu, test sonu ve adım görüntüleri, iz ve doğrulanan dosya ayarlarını topluca seçer. "Özel…" bu altı ayarı Gelişmiş > Kayıt\'ta açar.',
      [...KANIT_PROFILLERI, ozel], kanitRadyolari, kanitAciklamasi),
    secimGrubu('Ortam hızı', `Seçim ${HIZ_ALANLARI.length} zaman aşımı ve bekleme süresini varsayılanın bu katına ayarlar (Kaydet'e basınca yazılır; aradaki beklemeler ve ortam bazındaki koşu hızı değişmez). Bir süreyi Gelişmiş'te elle değiştirirseniz "Özel" görünür.`,
      [...HIZ_PROFILLERI, { ...ozel, ozet: 'süreleri tek tek girin' }], hizRadyolari, null)
  ];
  /** @param {Record<string, unknown>} d */
  const goster = (d) => {
    const k = kanitProfili(d);
    const hz = hizProfili(d, tanimlar);
    for (const r of kanitRadyolari) r.girdi.checked = r.ad === k;
    for (const r of hizRadyolari) r.girdi.checked = r.ad === hz;
    const p = KANIT_PROFILLERI.find((x) => x.ad === k);
    kanitAciklamasi.textContent = p ? `${p.etiket}: ${p.aciklama}` : 'Özel: kayıt ayarları Gelişmiş > Kayıt\'taki seçimlerinizdir.';
  };
  /** @param {{ girdiler: Map<string, HTMLElement>; form: HTMLFormElement; guncelle: () => void }} b */
  const bagla = ({ girdiler, form, guncelle }) => {
    const doldur = (/** @type {Record<string, string | number> | null} */ degerler) => {
      for (const [a, v] of Object.entries(degerler || {})) {
        const g = /** @type {HTMLInputElement | undefined} */ (girdiler.get(a));
        if (g) g.value = String(v);
      }
    };
    const gelismisiAc = (/** @type {string} */ anahtar) => {
      const g = girdiler.get(anahtar);
      const acilir = g && g.closest('details');
      if (acilir) acilir.open = true;
      if (g) { g.scrollIntoView({ block: 'center' }); g.focus(); }
    };
    for (const r of kanitRadyolari) {
      r.girdi.addEventListener('change', () => {
        if (r.ad === 'ozel') { gelismisiAc(KANIT_ALANLARI[0]); return; }
        doldur(kanitDegerleri(r.ad));
        guncelle();
      });
    }
    for (const r of hizRadyolari) {
      r.girdi.addEventListener('change', () => {
        if (r.ad === 'ozel') { gelismisiAc(HIZ_ALANLARI.find((a) => girdiler.has(a) && !girdiler.get(a)?.closest('[hidden]')) || HIZ_ALANLARI[0]); return; }
        doldur(hizDegerleri(tanimlar, r.ad));
        guncelle();
      });
    }
    // Alanlar elle değişince profil yeniden türetilir (radyoların kendi olayları hariç).
    const alanDegisti = (/** @type {Event} */ o) => { if (!(o.target instanceof HTMLInputElement && o.target.type === 'radio')) guncelle(); };
    form.addEventListener('input', alanDegisti);
    form.addEventListener('change', alanDegisti);
  };
  return { alanlar, goster, bagla };
}

/**
 * Kullanıcı kararları formu (tanımlar sunucudan: scripts/platform/ayarlar/kosu-ayarlari.mjs): bölümün ayarları gruplar hâlinde.
 * altBolum 'gelismis' tanımları açılır "Gelişmiş koşu davranışı" kısmındadır (varsayılan kapalı; her ayarın varsayılanı önceki davranış).
 * @param {'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama' | 'testVerisi'} bolum @param {string} ad formun erişilebilir adı @param {string} basariMetni
 * @param {{ baslik?: string; kaydedildi?: (ayarlar: Record<string, unknown>) => void; projeId?: string; sinif?: string; basliklar?: Node[];
 *   ek?: { ust?: Node; alanlar: Node[]; dogrula: () => boolean; kaydet: () => Promise<void>; degisti?: (d: Record<string, unknown>) => void } }} [secenek]
 *   baslik: formun üstünde başlık (kart / diyalog içinde gömülü form); kaydedildi: kayıt başarılı olunca çağrılır; projeId: giriş
 *   tarifli ortam uyarısı (ekran eşzamanlılığı) için; sinif / basliklar: kartın ek sınıfı ve üstteki başlık öğeleri; ek: aynı "Kaydet"
 *   ile başka bir uca yazılan ek alanlar (dogrula false dönerse kayıt yapılmaz) ve değerlerle güncellenen üst görünüm
 */
async function ayarFormu(bolum, ad, basariMetni, secenek = {}) {
  const { ayarlar, tanimlar: tumu } = await api('/platform/kosu-ayarlari');
  const tanimlar = tumu.filter((t) => (t.bolum || 'kosu') === bolum);
  const mesaj = mesajKutusu();
  /** @type {Map<string, HTMLElement>} */
  const girdiler = new Map();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  /** @param {Array<Record<string, any>>} liste */
  // Başka bir kartın içine gömülen form (secenek.baslik): kart çerçevesi / parıltısı yok; tek grup varsa grup başlığı (legend)
  // tekrar edilmez — başlığı dıştaki bölüm verir.
  const gomulu = Boolean(secenek.baslik);
  const grupKabi = (g, tekGrup, ...cocuklar) => (gomulu && tekGrup ? h('div', { class: 'ayar-grubu' }, ...cocuklar) : h('fieldset', {}, h('legend', {}, g), ...cocuklar));
  const grupAlanlari = (liste) => [...new Set(liste.map((t) => t.grup))].map((g, _i, gruplar) => grupKabi(g, gruplar.length === 1, ...liste.filter((t) => t.grup === g).map((t) => {
      let girdi;
      if (t.tur === 'onay') {
        // Açık / kapalı ayar: onay kutusu (etiket kutunun yanında; yardım ve pasif açıklaması altında).
        girdi = h('input', { type: 'checkbox', id: yeniKimlik('ayar'), checked: ayarlar[t.anahtar] === true });
        girdiler.set(t.anahtar, girdi);
        const yardimId = `${girdi.id}-yardim`;
        girdi.setAttribute('aria-describedby', `${yardimId} ${girdi.id}-hata`);
        const kutu = h('div', { class: 'alan onay-alani' },
          h('label', { class: 'secenek', for: girdi.id }, girdi, t.etiket),
          h('div', { class: 'yardim', id: yardimId }, kisaAciklama(t.aciklama, t.etiket), ` Varsayılan: ${t.varsayilan ? 'açık' : 'kapalı'}.`),
          h('div', { class: 'alan-hatasi', id: `${girdi.id}-hata`, role: 'alert' }));
        kutu.dataset.ayar = t.anahtar;
        if (t.etkinKosul) {
          const not = h('div', { class: 'yardim pasif-aciklamasi', id: `${girdi.id}-pasif` }, t.etkinKosul.pasifAciklama);
          girdi.setAttribute('aria-describedby', `${girdi.getAttribute('aria-describedby')} ${not.id}`);
          kutu.insertBefore(not, kutu.querySelector('.yardim'));
          kosulluAlanlar.push({ t, girdi, kutu, not });
        }
        return kutu;
      }
      if (t.tur === 'secim') girdi = h('select', {}, t.secenekler.map(([d, e]) => h('option', { value: d, selected: ayarlar[t.anahtar] === d }, e)));
      else if (t.tur === 'sayi') girdi = h('input', { type: 'number', min: String(t.enAz), max: String(t.enCok), step: '1', inputmode: 'numeric', value: String(ayarlar[t.anahtar]) });
      else girdi = h('input', { type: 'text', value: String(ayarlar[t.anahtar]), spellcheck: 'false', autocomplete: 'off', class: 'kod-girdisi' });
      girdiler.set(t.anahtar, girdi);
      const varsayilan = t.tur === 'secim' ? (t.secenekler.find(([d]) => d === t.varsayilan) || [])[1] : `${t.varsayilan}${t.birim ? ` ${t.birim}` : ''}`;
      const sinir = t.tur === 'sayi' ? `${t.enAz}–${t.enCok}${t.birim ? ` ${t.birim}` : ''}; ` : '';
      // Uzun açıklama: 1–2 cümle görünür, ayrıntı "?" ipucunda; sınırlar ve varsayılan her zaman görünür.
      // İlişkili ayarın yeri (tanımdaki "baglanti"; ör. Oturum kontrolü → giriş tarifindeki Oturum kontrol adresi): her zaman görünür.
      const baglanti = t.baglanti ? h('span', { class: 'ayar-baglantisi' }, ' ', t.baglanti.metin, ' ', h('a', { href: t.baglanti.adres }, t.baglanti.etiket), '.') : null;
      const kutu = alan(`${t.etiket}${t.birim ? ` (${t.birim})` : ''}`, girdi, { yardim: h('span', {}, kisaAciklama(t.aciklama, t.etiket), ` ${sinir}Varsayılan: ${varsayilan}.`, baglanti) });
      kutu.dataset.ayar = t.anahtar;
      if (t.etkinKosul) {
        // Bağlı ayar (etkinKosul) bu değerde değilken alan pasif; neden alanın altında yazar (değer korunur, kaydedilir).
        const not = h('div', { class: 'yardim pasif-aciklamasi', id: `${girdi.id}-pasif` }, t.etkinKosul.pasifAciklama);
        girdi.setAttribute('aria-describedby', `${girdi.getAttribute('aria-describedby')} ${not.id}`);
        kutu.insertBefore(not, kutu.querySelector('.yardim'));
        kosulluAlanlar.push({ t, girdi, kutu, not });
      }
      return kutu;
    })));
  /** @type {Array<{ t: Record<string, any>; girdi: HTMLElement; kutu: HTMLElement; not: HTMLElement }>} */
  const kosulluAlanlar = [];
  // Ayarlar > Koşu: sayfada hazır profiller (Kanıt düzeyi, Ortam hızı) ve "ana" ayarlar; bölümün diğer tüm ayarları tek bir kapalı
  // "Gelişmiş" kısmında (bugünkü alanların birebir aynısı). Diğer bölümlerde düzen değişmez.
  const profilli = bolum === 'kosu';
  const temel = profilli ? tanimlar.filter((t) => t.ana) : tanimlar.filter((t) => t.altBolum !== 'gelismis');
  const gelismisOnu = profilli ? tanimlar.filter((t) => !t.ana && t.altBolum !== 'gelismis') : [];
  const gelismis = tanimlar.filter((t) => t.altBolum === 'gelismis');
  const profiller = profilli ? kosuProfilSecimleri(tumu) : null;
  const gelismisSayisi = gelismisOnu.length + gelismis.length;
  const degisenRozeti = h('span', { class: 'degisen-sayaci soluk kucuk' });
  const form = h('form', { class: `${gomulu ? 'gomulu-ayar-formu kosu-ayarlari' : 'kart form-paneli kosu-ayarlari'}${secenek.sinif ? ` ${secenek.sinif}` : ''}`, novalidate: true, 'aria-label': ad },
    ...(secenek.basliklar || []),
    secenek.baslik ? h('p', { class: 'soluk kucuk' }, secenek.baslik) : null, mesaj.kutu,
    ...(profiller ? profiller.alanlar : []),
    ...grupAlanlari(temel),
    gelismisSayisi ? h('details', { class: 'gelismis-ayarlar' },
      profilli ? h('summary', {}, `Gelişmiş (${gelismisSayisi} ayar)`, degisenRozeti) : h('summary', {}, 'Gelişmiş koşu davranışı'),
      profilli ? h('p', { class: 'soluk kucuk' }, 'Bugünkü ayarların tamamı burada; profiller bunları topluca doldurur, burada tek tek değiştirebilirsiniz. Değiştirdiğiniz bir ayar ilgili profili "Özel" yapar.') : null,
      ...grupAlanlari(gelismisOnu),
      profilli && gelismis.length ? h('h4', { class: 'gelismis-alt-baslik' }, 'Gelişmiş koşu davranışı') : null,
      h('p', { class: 'soluk kucuk' }, `Koşucunun bekleme süreleri ve kararları. Her ayarın varsayılanı Nöbetçi'nin bugüne kadarki davranışıdır; değiştirmediğiniz sürece koşular aynı çalışır.`),
      ...grupAlanlari(gelismis)) : null,
    h('div', { class: 'dugmeler' }, kaydet));
  if (profiller) {
    // Formdaki anlık değerler (profil türetme ve "değişen" sayısı için; kaydedilmemiş olabilir).
    const formDegerleri = () => Object.fromEntries(tanimlar.filter((t) => girdiler.has(t.anahtar)).map((t) => {
      const g = /** @type {any} */ (girdiler.get(t.anahtar));
      return [t.anahtar, t.tur === 'onay' ? g.checked : t.tur === 'sayi' ? Number(g.value) : g.value];
    }));
    const guncelle = () => {
      const d = formDegerleri();
      profiller.goster(d);
      const degisen = [...gelismisOnu, ...gelismis].filter((t) => String(d[t.anahtar]) !== String(t.varsayilan)).length;
      degisenRozeti.textContent = degisen ? ` · değişen: ${degisen}` : ' · hepsi varsayılan';
    };
    profiller.bagla({ girdiler, form, guncelle });
    // "Tarama ve akış kaydında koşu ayarlarını kullan": açıkken taramanın ayrı değerleri (ekran boyutu, dil, oturum kontrolü, giriş
    // alanı beklemesi) gizlenir ve koşudaki eşleri kullanılır; kayıtlı ayrı değerler silinmez (kapatınca geri gelir).
    const birlesik = /** @type {HTMLInputElement | undefined} */ (girdiler.get('taramaKosuAyarlariniKullan'));
    const esliKutular = tanimlar.filter((t) => t.esi && girdiler.has(t.anahtar)).map((t) => girdiler.get(t.anahtar)?.closest('.alan')).filter(Boolean);
    if (birlesik && esliKutular.length) {
      const not = h('p', { class: 'yardim esli-not' }, 'Tarayıcı ekran boyutu, dili, girişte oturum kontrolü ve giriş alanı beklemesi koşu ayarlarından alınır (Tarayıcı ve Giriş grupları). Ayrı değer için sayfanın üstündeki "Tarama ve akış kaydında koşu ayarlarını kullan" seçimini kaldırın.');
      esliKutular[0].before(not);
      const esGuncelle = () => {
        for (const k of esliKutular) k.hidden = birlesik.checked;
        not.hidden = !birlesik.checked;
      };
      birlesik.addEventListener('change', esGuncelle);
      esGuncelle();
    }
    guncelle();
  }
  for (const k of kosulluAlanlar) {
    const bagli = girdiler.get(k.t.etkinKosul.anahtar);
    const guncelle = () => {
      const etkinDegerler = k.t.etkinKosul.degerler || [k.t.etkinKosul.deger];
      const pasif = !bagli || !etkinDegerler.includes(bagli.value);
      k.girdi.disabled = pasif;
      k.kutu.classList.toggle('pasif', pasif);
      k.not.hidden = !pasif;
    };
    if (bagli) bagli.addEventListener('change', guncelle);
    guncelle();
  }
  // "Aynı anda en çok N ekran senaryosu" > 1 ve projede (kendi değeri olmayan) giriş tarifli ortam varsa uyarı (engellemez).
  const ekranN = girdiler.get('ekranEszamanli');
  if (ekranN && secenek.projeId) {
    const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(secenek.projeId)}`).catch(() => ({ ortamlar: [] }));
    const girisli = ortamlar.filter((o) => o.girisTarifiVar && !(o.kosuHizi && o.kosuHizi.ekranEszamanli));
    const uyari = girisliEszamanliUyarisi(girisli.map((o) => o.ad));
    ekranN.closest('.alan')?.after(uyari);
    const guncelle = () => { uyari.hidden = !(girisli.length && Number(ekranN.value) > 1); };
    ekranN.addEventListener('input', guncelle);
    guncelle();
  }
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    for (const g of girdiler.values()) alanHatasi(g, '');
    /** @type {Record<string, string | number>} */
    const yeni = {};
    for (const t of tanimlar) {
      const g = girdiler.get(t.anahtar);
      if (t.tur === 'onay') { yeni[t.anahtar] = g.checked; continue; }
      if (t.tur === 'sayi') {
        const n = Number(g.value);
        if (!Number.isInteger(n) || n < t.enAz || n > t.enCok) {
          // Pasif (kullanılmayan) ya da gizli alan: geçersiz değer gönderilmez; kayıtlı değer korunur.
          if (g.disabled || g.closest('[hidden]')) continue;
          alanHatasi(g, `${t.enAz} ile ${t.enCok} arasında bir tam sayı girin.`);
          const acilir = g.closest('details');
          if (acilir) acilir.open = true;
          g.focus();
          return;
        }
        yeni[t.anahtar] = n;
      } else yeni[t.anahtar] = g.value.trim();
    }
    const ek = secenek.ek;
    if (ek && !ek.dogrula()) return;
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', async () => {
        await api('/platform/kosu-ayarlari/kaydet', { govde: { ayarlar: yeni } });
        if (ek) await ek.kaydet();
      });
      kullaniciAyarlariniTazele();
      mesaj.goster(basariMetni, 'basari');
      if (secenek.kaydedildi) secenek.kaydedildi(yeni);
    } catch (hata) { mesaj.goster(hata.message); }
  });
  if (secenek.ek) {
    // Ek alanlar (ör. Saklama kartındaki video saklama süresi) ve formdaki değerlerle canlı güncellenen üst görünüm.
    const ek = secenek.ek;
    const degerler = () => Object.fromEntries(tanimlar.map((t) => {
      const g = /** @type {any} */ (girdiler.get(t.anahtar));
      return [t.anahtar, t.tur === 'onay' ? g.checked : t.tur === 'sayi' ? Number(g.value) : g.value];
    }));
    if (ek.ust) form.insertBefore(ek.ust, mesaj.kutu.nextSibling);
    form.querySelector(':scope > .dugmeler')?.before(...ek.alanlar);
    const guncelle = () => ek.degisti?.(degerler());
    form.addEventListener('input', guncelle);
    form.addEventListener('change', guncelle);
    guncelle();
  }
  return form;
}

/** Güvenlik > Maskeleme: çekirdek liste (salt okunur) + kullanıcının ek gizli adları (her satıra bir ad). */
async function maskelemeKarti() {
  const { cekirdek, ekAdlar } = await api('/platform/maskeleme');
  const liste = h('textarea', { rows: '4', spellcheck: 'false', autocomplete: 'off', class: 'kod-alani', placeholder: 'musteriAnahtari' });
  liste.value = ekAdlar.join('\n');
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart', novalidate: true, 'aria-label': 'Maskeleme' }, h('h3', {}, ikon('goz'), 'Maskeleme'),
    h('p', { class: 'soluk' }, 'Adı bu listede geçen alanların, başlıkların ve servis okumalarının değerleri raporlarda maskelenir, ekran paketlerinde reddedilir. Çekirdek liste güvenlik gereği değiştirilemez; kendi adlarınızı ekleyebilirsiniz.'),
    h('p', { class: 'kucuk' }, h('b', {}, 'Çekirdek: '), cekirdek.join(', ')),
    mesaj.kutu,
    alan('Ek gizli adlar (her satıra bir ad)', liste, { yardim: 'Harf, rakam, "-", "_"; 2–40 karakter. Büyük/küçük harf ve "-", "_" yok sayılır (ör. musteriAnahtari → Musteri_Anahtari da gizli).' }),
    h('div', { class: 'dugmeler' }, kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/maskeleme/kaydet', { govde: { ekAdlar: liste.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) } }));
      liste.value = r.ekAdlar.join('\n');
      mesaj.goster(`${r.ekAdlar.length} ek ad kaydedildi.`, 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return form;
}

async function guvenlik(govde, baglam) {
  const [ayar, maskeleme] = await Promise.all([api('/platform/guvenlik'), maskelemeKarti()]);
  const dakika = h('input', { type: 'number', min: String(ayar.enAz), max: String(ayar.enCok), step: '1', value: String(ayar.otomatikKilitDakika), inputmode: 'numeric' });
  const kilitMesaj = mesajKutusu();
  const kilitKaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const kilitForm = h('form', { class: 'kart', novalidate: true }, h('h3', {}, ikon('saat'), 'Otomatik kilit'),
    h('p', { class: 'soluk' }, 'Bu süre boyunca hiçbir işlem yapılmazsa kasa kendiliğinden kilitlenir; devam etmek için parola gerekir.'),
    kilitMesaj.kutu,
    alan('Süre (dakika)', dakika, { yardim: `${ayar.enAz}–${ayar.enCok} dakika; varsayılan ${ayar.varsayilan}.` }),
    h('div', { class: 'dugmeler' }, kilitKaydet));
  kilitForm.addEventListener('submit', async (o) => {
    o.preventDefault();
    kilitMesaj.temizle();
    alanHatasi(dakika, '');
    const dk = Number(dakika.value);
    if (!Number.isInteger(dk) || dk < ayar.enAz || dk > ayar.enCok) { alanHatasi(dakika, `${ayar.enAz} ile ${ayar.enCok} arasında bir tam sayı girin.`); dakika.focus(); return; }
    try {
      await mesgulIken(kilitKaydet, 'Kaydediliyor…', () => api('/platform/guvenlik/kaydet', { govde: { otomatikKilitDakika: dk } }));
      kilitMesaj.goster(`Kasa ${dk} dakika hareketsizlikten sonra kilitlenecek.`, 'basari');
    } catch (hata) { kilitMesaj.goster(hata.message); }
  });
  // Video saklama süresi artık Ayarlar > Yedekleme > Saklama kartında (diğer saklama kurallarıyla tek zaman çizelgesinde);
  // burada yalnız mevcut değer ve bağlantı kalır.
  const saklamaForm = h('div', { class: 'kart', role: 'group', 'aria-label': 'Video saklama süresi' }, h('h3', {}, ikon('video'), 'Video saklama süresi'),
    h('p', { class: 'soluk' }, `Şu an: ${ayar.videoSaklamaGun} gün. Video saklama, diğer saklama kurallarıyla birlikte tek kartta ve tek zaman çizelgesinde ayarlanır.`),
    h('div', { class: 'dugmeler' }, h('a', { class: 'dugme', href: '#/ayarlar/yedekleme' }, ikon('saat'), 'Yedekleme > Saklama\'ya git')));
  // Yasak adresler: Nöbetçi'nin HİÇBİR ZAMAN bağlanmayacağı host kalıpları (koşular ve ekran taraması reddedilir).
  const yasakMetni = h('textarea', { rows: '4', spellcheck: 'false', autocomplete: 'off', placeholder: 'ör. *.sirket-ici.local\nuretim.ornek.com', value: (ayar.yasakAdresler || []).join('\n') });
  const yasakMesaj = mesajKutusu();
  const yasakKaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const yasakForm = h('form', { class: 'kart', novalidate: true }, h('h3', {}, ikon('kalkan'), 'Yasak adresler'),
    h('p', { class: 'soluk' }, 'Bu listedeki bir host\'a bağlanan koşu ve ekran taraması hiç başlamaz; koşu sırasında bu host\'lara giden istekler iptal edilir. Her satıra bir host kalıbı yazın; "*" herhangi bir karakter dizisi yerine geçer. Liste boşsa kısıtlama yoktur.'),
    yasakMesaj.kutu,
    alan('Host kalıpları', yasakMetni, { yardim: `Satır başına bir kalıp (en fazla ${ayar.yasakAdresEnCok || 100}). Adres yapıştırırsanız yalnızca host'u alınır.` }),
    (ayar.ortamYasakAdresleri || []).length ? h('div', { class: 'not-kutusu bilgi' }, h('p', {}, 'Ortam değişkeninden (NOBETCI_YASAK_ADRESLER) gelen ek kalıplar da uygulanır: ',
      h('span', { class: 'etiketler' }, ayar.ortamYasakAdresleri.map((k) => rozet(k, ''))))) : null,
    h('div', { class: 'dugmeler' }, yasakKaydet));
  yasakForm.addEventListener('submit', async (o) => {
    o.preventDefault();
    yasakMesaj.temizle();
    alanHatasi(yasakMetni, '');
    try {
      const r = await mesgulIken(yasakKaydet, 'Kaydediliyor…', () => api('/platform/guvenlik/kaydet', { govde: { yasakAdresler: yasakMetni.value.split(/\n/) } }));
      yasakMetni.value = r.yasakAdresler.join('\n');
      yasakMesaj.goster(r.yasakAdresler.length ? `${r.yasakAdresler.length} kalıp kaydedildi.` : 'Liste boş: adres kısıtlaması yok.', 'basari');
    } catch (hata) { alanHatasi(yasakMetni, hata.message); }
  });

  const kilitle = h('button', { type: 'button' }, ikon('kilit'), 'Kasayı kilitle');
  kilitle.addEventListener('click', async () => {
    const secim = await mesgulIken(kilitle, 'Kilitleniyor…', () => kasayiKilitleSecimli());
    if (!secim) return;
    bildir(...kilitBildirimi(secim));
    baglam.yonlendir();
  });

  const eski = parolaAlani('Mevcut parola', { zorunlu: true, otomatik: 'current-password' });
  const yeni1 = parolaAlani('Yeni parola', { zorunlu: true, otomatik: 'new-password', yardim: 'En az 8 karakter. Tüm şifreli değerler yeni parolayla yeniden şifrelenir.' });
  const yeni2 = parolaAlani('Yeni parola (tekrar)', { zorunlu: true, otomatik: 'new-password' });
  const mesaj = mesajKutusu();
  const degistir = h('button', { type: 'submit', class: 'birincil' }, 'Parolayı değiştir');
  const form = h('form', { class: 'kart', novalidate: true }, h('h3', {}, ikon('anahtar'), 'Parolayı değiştir'),
    h('div', { class: 'not-kutusu uyari' }, h('p', {}, 'Yeni parolayı unutursanız veriler kurtarılamaz. Daha önce alınmış yedekler eski parolayla açılmaya devam eder.')),
    mesaj.kutu, eski.kapsayici, yeni1.kapsayici, yeni2.kapsayici, h('div', { class: 'dugmeler' }, degistir));
  let durdur = () => {};
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    [eski.girdi, yeni1.girdi, yeni2.girdi].forEach((g) => alanHatasi(g, ''));
    if (!eski.girdi.value) { alanHatasi(eski.girdi, 'Mevcut parolayı girin.'); eski.girdi.focus(); return; }
    if ([...yeni1.girdi.value].length < 8) { alanHatasi(yeni1.girdi, 'Yeni parola en az 8 karakter olmalıdır.'); yeni1.girdi.focus(); return; }
    if (yeni1.girdi.value !== yeni2.girdi.value) { alanHatasi(yeni2.girdi, 'Parolalar aynı değil.'); yeni2.girdi.focus(); return; }
    try {
      await mesgulIken(degistir, 'Değiştiriliyor…', () => api('/platform/kasa/parola-degistir', { govde: { eskiParola: eski.girdi.value, yeniParola: yeni1.girdi.value } }));
      [eski.girdi, yeni1.girdi, yeni2.girdi].forEach((g) => { g.value = ''; });
      mesaj.goster('Parola değiştirildi.', 'basari');
    } catch (hata) {
      if (hata.durum === 429 && hata.bekleSaniye) {
        durdur();
        durdur = geriSayim(hata.bekleSaniye, (k) => mesaj.goster(k > 0 ? `Art arda yanlış parola girildi. ${k} saniye sonra tekrar deneyebilirsiniz.` : 'Şimdi tekrar deneyebilirsiniz.'));
        return;
      }
      mesaj.goster(hata.message);
    }
  });

  govde.replaceChildren(
    h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('kalkan'), 'Kasayı kilitle'),
      h('span', { class: 'alt' }, rozet([h('span', { class: 'nokta basari', 'aria-hidden': 'true' }), 'kasa açık'], 'basari')), h('div', { class: 'sag' }, kilitle)),
    h('p', { class: 'soluk', style: { margin: '0' } }, 'Kasa kilitlenince şifreli bilgiler okunamaz; devam etmek için parola gerekir. Sunucu kapanınca kasa da kilitlenir.')),
    h('div', { class: 'ayar-izgarasi' }, kilitForm, saklamaForm),
    yasakForm,
    maskeleme,
    form);
}

// ---------------------------------------------------------------------------------------
// Ayarlar > Raporlar (PDF rapor A4): ekip listesi, ekran / servis → ekip eşlemesi, kritik işareti (ekran, servis, akış) ve süre
// eşikleri (ekran, servis, servis metodu). Hepsi isteğe bağlıdır ve proje başınadır; her değişiklik hemen kaydedilir (kasada).
// Uygulama sürümü burada değil: ortam ayarında (Proje ve ortamlar) ya da koşu başlatılırken girilir.
// ---------------------------------------------------------------------------------------

async function raporVerileriBolumu(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const v = await api(`/platform/rapor-verileri?projeId=${encodeURIComponent(proje.id)}`);
  const kaydet = async (ogeTuru, ogeId, degisiklik, durumAlani) => {
    durumAlani.textContent = 'Kaydediliyor…';
    try {
      await api('/platform/rapor-verileri/oge/kaydet', { govde: { projeId: proje.id, ogeTuru, ogeId, ...degisiklik } });
      durumAlani.textContent = 'Kaydedildi';
      return true;
    } catch (hata) {
      durumAlani.textContent = '';
      bildir(hata.message, 'hata');
      return false;
    }
  };
  /** Eşik girdisi (ms; boş = eşik yok). */
  const esikGirdisi = (deger, etiket) => h('input', {
    type: 'number', min: '1', max: '3600000', step: '1', inputmode: 'numeric', placeholder: 'yok', value: deger === null || deger === undefined ? '' : String(deger),
    'aria-label': etiket, class: 'esik-girdisi'
  });
  const esikDegeri = (girdi) => (girdi.value.trim() === '' ? null : Number(girdi.value));
  const esikGecerli = (girdi) => {
    const d = esikDegeri(girdi);
    const tamam = d === null || (Number.isInteger(d) && d >= 1 && d <= 3600000);
    girdi.setAttribute('aria-invalid', tamam ? 'false' : 'true');
    if (!tamam) bildir('Süre eşiği 1–3.600.000 ms arasında tam sayı olmalı (boş = eşik yok).', 'hata');
    return tamam;
  };
  const ekipSecimi = (secili, etiket) => h('select', { 'aria-label': etiket, class: 'ekip-secimi' },
    h('option', { value: '' }, 'Ekip yok (sınıfın varsayılanı)'),
    v.ekipler.map((e) => h('option', { value: e.id, selected: e.id === secili }, e.ad)));

  /** Tek öğe satırı: kritik anahtarı, (ekran / servis) ekip ve süre eşiği, (servis) metot eşikleri. */
  const ogeSatiri = (tur, x, ek = {}) => {
    const durumAlani = h('span', { class: 'soluk kucuk rapor-ogesi-durumu', role: 'status' });
    const kritik = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', id: yeniKimlik('kritik'), checked: x.kritik, 'aria-label': `${x.ad}: kritik` });
    kritik.addEventListener('change', async () => { if (!(await kaydet(tur, x.id, { kritik: kritik.checked }, durumAlani))) kritik.checked = !kritik.checked; });
    const parcalar = [h('label', { class: 'onay-satiri rapor-kritik', for: kritik.id }, kritik, h('span', {}, 'Kritik'))];
    if (tur !== 'akis') {
      const ekip = ekipSecimi(x.ekipId, `${x.ad}: ekip`);
      ekip.addEventListener('change', () => kaydet(tur, x.id, { ekipId: ekip.value || null }, durumAlani));
      const esik = esikGirdisi(x.sureEsigiMs, `${x.ad}: süre eşiği (ms)`);
      esik.addEventListener('change', () => { if (esikGecerli(esik)) kaydet(tur, x.id, { sureEsigiMs: esikDegeri(esik) }, durumAlani); });
      parcalar.push(h('label', { class: 'rapor-alan' }, h('span', { class: 'soluk kucuk' }, 'Ekip'), ekip),
        h('label', { class: 'rapor-alan' }, h('span', { class: 'soluk kucuk' }, tur === 'ekran' ? 'Test süresi eşiği (ms)' : 'Çağrı süresi eşiği (ms)'), esik));
    }
    let metotlar = null;
    if (tur === 'servis' && x.metotlar.length) {
      const girdiler = x.metotlar.map((m) => ({ m, g: esikGirdisi(x.metotEsikleri[m] ?? null, `${x.ad} › ${m}: süre eşiği (ms)`) }));
      const tanimli = girdiler.filter((y) => y.g.value !== '').length;
      for (const y of girdiler) {
        y.g.addEventListener('change', () => {
          if (!girdiler.every((z) => esikGecerli(z.g))) return;
          kaydet('servis', x.id, { metotEsikleri: Object.fromEntries(girdiler.filter((z) => z.g.value.trim() !== '').map((z) => [z.m, Number(z.g.value)])) }, durumAlani);
        });
      }
      metotlar = h('details', { class: 'rapor-metotlari' },
        h('summary', {}, `Metot eşikleri (${tanimli} / ${x.metotlar.length})`),
        h('p', { class: 'soluk kucuk' }, 'Metodun eşiği yoksa servisin eşiği kullanılır.'),
        h('ul', { class: 'rapor-metot-listesi' }, girdiler.map((y) => h('li', {}, h('span', { class: 'mono' }, y.m), y.g))));
    }
    return h('li', { class: 'rapor-ogesi', 'data-oge': `${tur}:${x.id}` },
      h('div', { class: 'rapor-ogesi-adi' }, h('strong', {}, x.ad), ek.rozet ? [' ', h('span', { class: 'rozet' }, ek.rozet)] : null, durumAlani),
      h('div', { class: 'rapor-ogesi-alanlari' }, parcalar), metotlar);
  };

  // Ekipler
  const ekipAdi = h('input', { type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Ör. ekip adı' });
  const ekipEkle = h('button', { type: 'submit', class: 'birincil' }, ikon('arti'), 'Ekip ekle');
  const ekipMesaj = mesajKutusu();
  const ekipFormu = h('form', { class: 'satir-formu ekip-formu', novalidate: true, 'aria-label': 'Ekip ekle' }, alan('Ekip adı', ekipAdi), ekipEkle);
  ekipFormu.addEventListener('submit', async (o) => {
    o.preventDefault();
    alanHatasi(ekipAdi, '');
    if (!ekipAdi.value.trim()) { alanHatasi(ekipAdi, 'Ekip adı boş olamaz.'); ekipAdi.focus(); return; }
    try {
      await mesgulIken(ekipEkle, 'Ekleniyor…', () => api('/platform/rapor-verileri/ekip/kaydet', { govde: { projeId: proje.id, ad: ekipAdi.value } }));
      bildir('Ekip eklendi.');
      yenile();
    } catch (hata) { ekipMesaj.goster(hata.message); }
  });
  const ekipFormAlani = h('div', {});
  const ekipAdlandir = (e) => {
    const ad = h('input', { type: 'text', maxlength: '80', autocomplete: 'off', value: e.ad });
    const mesaj = mesajKutusu();
    const kaydetDugmesi = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(`Ekibi yeniden adlandır: ${e.ad}`, mesaj.kutu, alan('Ekip adı', ad, { zorunlu: true }),
      h('div', { class: 'dugmeler' }, kaydetDugmesi, h('button', { type: 'button', onclick: () => ekipFormAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      alanHatasi(ad, '');
      if (!ad.value.trim()) { alanHatasi(ad, 'Ekip adı boş olamaz.'); ad.focus(); return; }
      try {
        await mesgulIken(kaydetDugmesi, 'Kaydediliyor…', () => api('/platform/rapor-verileri/ekip/kaydet', { govde: { projeId: proje.id, id: e.id, ad: ad.value } }));
        bildir('Ekip yeniden adlandırıldı.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(ekipFormAlani, form);
  };
  const ekipSatirlari = v.ekipler.map((e) => kayitSatiri(e.ad, null, [
    duzenleDugmesi(e.ad, () => ekipAdlandir(e)),
    silDugmesi(e.ad, async () => { await api('/platform/rapor-verileri/ekip/sil', { govde: { projeId: proje.id, id: e.id } }); bildir('Ekip silindi; atandığı öğeler sahipsiz kaldı.'); yenile(); })
  ], 'kullanici'));

  const liste = (baslik, tur, ogeler, bos, rozetFn = () => null) => [
    bolumBasligi(baslik, ogeler.length),
    ogeler.length ? h('ul', { class: 'rapor-ogeleri', 'aria-label': baslik }, ogeler.map((x) => ogeSatiri(tur, x, { rozet: rozetFn(x) }))) : h('p', { class: 'soluk' }, bos)
  ];
  yerlestir(govde,
    h('div', { class: 'not-kutusu bilgi kucuk', role: 'note' },
      'Bu kararlar yalnız PDF raporlarını etkiler ve hepsi isteğe bağlıdır. Kritik işaretli öğe öncelik puanını artırır; son koşusunda kalırsa raporun durum rozeti Kritik olur. Ekip, aksiyonların "Sahip önerisi"dir (yoksa sınıfın varsayılan ekibi). Süre eşiği aşılırsa (p95 > eşik) raporda "Süre eşiği aşımları"nda ve aksiyon listesinde görünür. Uygulama sürümü: Proje ve ortamlar > ortam > "Uygulama sürümü" ya da koşu başlatılırken.'),
    bolumBasligi('Ekipler', v.ekipler.length), ekipMesaj.kutu, ekipFormu, ekipFormAlani, kayitListesi(ekipSatirlari, 'Henüz ekip yok.', 'kullanici'),
    ...liste('Ekranlar ve ortak akışlar', 'ekran', v.ekranlar, 'Projede ekran yok.', (x) => (x.ortakAkis ? 'Ortak akış' : x.devreDisi ? 'Devre dışı' : null)),
    ...liste('Servisler', 'servis', v.servisler, 'Projede servis yok.', (x) => String(x.tur || '').toUpperCase() || null),
    ...liste('Servis akışları ve uçtan uca akışlar', 'akis', v.akislar, 'Projede akış yok.', (x) => x.tur));
}

// ---------------------------------------------------------------------------------------
// Ayarlar > Arayüz: ekran rehberleri (kullanıcı kararı: ilk girişte kendiliğinden açılsın mı)
// ---------------------------------------------------------------------------------------

async function arayuzAyarlari(govde, baglam) {
  const proje = baglam && baglam.durum ? baglam.durum.proje : null;
  const [{ rehber }, listeFormu, { acilis }, saglik] = await Promise.all([api('/platform/rehber'), ayarFormu('arayuz', 'Arayüz ayarları', 'Arayüz ayarları kaydedildi.'), api('/platform/acilis'),
    proje ? saglikEsikleriKarti(proje) : null]);
  const otomatik = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', id: yeniKimlik('rehber-otomatik'), checked: rehber.otomatik, disabled: rehber.ortamKapali });
  const mesaj = mesajKutusu();
  const sifirla = h('button', { type: 'button' }, ikon('yenile'), 'Tüm rehberleri yeniden göster');
  const tanitim = h('button', { type: 'button', class: 'hayalet' }, ikon('pusula'), 'Genel tanıtımı şimdi aç');
  otomatik.addEventListener('change', async () => {
    mesaj.temizle();
    try {
      const y = await api('/platform/rehber/kaydet', { govde: { otomatik: otomatik.checked } });
      rehberAyarlariniGuncelle(y.rehber);
      mesaj.goster(otomatik.checked ? 'Rehberler her ekranın ilk açılışında kendiliğinden başlayacak.' : 'Rehberler artık kendiliğinden açılmayacak; "?" düğmesi ve "Bu sayfanın rehberi" bağlantısı çalışmaya devam eder.', 'basari');
    } catch (hata) { otomatik.checked = !otomatik.checked; mesaj.goster(hata.message); }
  });
  sifirla.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const y = await mesgulIken(sifirla, 'Sıfırlanıyor…', () => api('/platform/rehber/kaydet', { govde: { sifirla: true } }));
      rehberAyarlariniGuncelle(y.rehber);
      mesaj.goster('Tüm rehberler yeniden "görülmemiş" sayıldı; ekranları açtıkça tekrar gösterilecek.', 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  tanitim.addEventListener('click', () => rehberBaslat('genel'));
  // Başlarken listesi (Sonuçlar > Genel > Özet) gizlendiyse proje için yeniden gösterilir (karar kasada; baslarken.js).
  const baslarken = proje ? h('button', { type: 'button', class: 'hayalet' }, ikon('liste'), 'Başlarken listesini yeniden göster') : null;
  baslarken?.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const { baslarkeniYenidenGoster } = await import('./baslarken.js');
      const d = await mesgulIken(baslarken, 'Kaydediliyor…', () => baslarkeniYenidenGoster(proje));
      mesaj.goster(d.tamam ? 'Başlarken listesi yeniden açıldı; tüm adımlar tamam olduğu için Özet\'te görünmez.' : 'Başlarken listesi Sonuçlar > Genel > Özet\'te yeniden görünecek.', 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  yerlestir(govde, h('div', { class: 'kart form-paneli', role: 'group', 'aria-label': 'Rehberler' },
    h('h3', {}, ikon('soru'), 'Rehberler'),
    h('p', { class: 'soluk' }, 'Her ekranın, o ekranda işlerin hangi sırayla ve nasıl yapılacağını anlatan bir rehberi vardır. Rehber bitince ya da kapatılınca "görüldü" sayılır.'),
    mesaj.kutu,
    h('label', { class: 'onay-satiri', for: otomatik.id }, otomatik,
      h('span', {}, h('b', {}, 'Rehberleri ilk girişte kendiliğinden göster'),
        h('small', { class: 'blok soluk' }, rehber.ortamKapali
          ? 'Bu sunucuda NOBETCI_REHBER_OTOMATIK=0 ortam değişkeniyle kapatılmış.'
          : 'Varsayılan kapalı: rehberler sayfa başlığındaki "Bu sayfanın rehberi" bağlantısıyla ya da üst çubuktaki "?" düğmesiyle açılır.'))),
    h('p', { class: 'soluk kucuk' }, `Görülen rehber: ${rehber.gorulenler.length}`),
    h('div', { class: 'dugmeler' }, sifirla, tanitim, baslarken)), temaKarti(), kullanimModuKarti(baglam), acilisKarti(acilis), listeFormu, saglik, terimlerKarti());
}

/** Kullanım modu (Basit / Gelişmiş; çalışma alanının ayarı): üst çubuktaki anahtarla aynı ayar. Gelişmiş → Basit sorusuz geçer. */
function kullanimModuKarti(baglam) {
  const mod = baglam && baglam.durum && baglam.durum.kullanimModu ? baglam.durum.kullanimModu.mod : 'gelismis';
  const degistir = baglam && baglam.moduDegistir ? baglam.moduDegistir : null;
  if (!degistir) return null;
  const secenek = (deger, baslik, aciklama) => {
    const r = h('input', { type: 'radio', name: 'ayar-kullanim-modu', value: deger, id: yeniKimlik(`ayar-mod-${deger}`), checked: mod === deger });
    r.addEventListener('change', () => { if (r.checked && mod !== deger) void degistir(deger); });
    return h('label', { class: 'onay-satiri giris-sorusu-secenegi', for: r.id }, r, h('span', {}, h('b', {}, baslik), h('small', { class: 'blok soluk' }, aciklama)));
  };
  return h('section', { class: 'kart form-paneli kullanim-modu-karti', 'aria-labelledby': 'kullanim-modu-basligi' },
    h('h3', { id: 'kullanim-modu-basligi' }, ikon('katman'), 'Kullanım modu'),
    h('p', { class: 'soluk' }, 'Basit modda menü yalnız Testlerim, Sonuçlar ve Ayarlar\'dır. Gelişmiş mod tüm özellikleri açar. Hiçbir veri silinmez; istediğiniz zaman ikisi arasında geçebilirsiniz. Aynı anahtar üst çubukta da vardır.'),
    h('div', { role: 'radiogroup', 'aria-label': 'Kullanım modu', 'data-kayit-disi': '' },
      secenek('basit', 'Basit', 'Testlerim, Sonuçlar ve Ayarlar; adres girin, çalıştırın, sonucu görün.'),
      secenek('gelismis', 'Gelişmiş', 'Ekran modelleri, test verisi, servisler, uçtan uca akışlar, planlı koşular ve tüm ayarlar.')));
}

/** Terimler sözlüğü (terimler.mjs): arayüzdeki her kavram tek cümleyle. */
function terimlerKarti() {
  return h('section', { class: 'kart form-paneli terimler-karti', 'aria-labelledby': 'terimler-basligi' },
    h('h3', { id: 'terimler-basligi' }, ikon('liste'), 'Terimler'),
    h('p', { class: 'soluk' }, 'Nöbetçi\'de her kavram tek adla geçer. Kısa açıklamalar:'),
    h('dl', { class: 'terimler-listesi' }, TERIMLER.flatMap((t) => [h('dt', {}, t.terim), h('dd', {}, t.aciklama)])));
}

/** Sağlık noktası eşikleri (proje başına; Sonuçlar ekranındaki noktanın rengi — ayarlar/saglik-esikleri.mjs). */
async function saglikEsikleriKarti(proje) {
  const { esikler, varsayilan } = await api(`/platform/saglik-esikleri?projeId=${encodeURIComponent(proje.id)}`);
  const sayi = (deger) => h('input', { type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric', value: String(deger) });
  const yesil = sayi(esikler.yesil);
  const sari = sayi(esikler.sari);
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart form-paneli', novalidate: true, 'aria-label': 'Sağlık noktası' },
    h('h3', {}, ikon('grafik'), 'Sağlık noktası'),
    h('p', { class: 'soluk' }, `Sonuçlar ekranında her ekranın yanındaki nokta son tam koşunun başarı oranına göre renklenir. Bu eşikler yalnız "${proje.ad}" projesi içindir.`),
    mesaj.kutu,
    alan('Yeşil: başarı oranı en az (%)', yesil, { yardim: `1–100. Varsayılan: ${varsayilan.yesil}.` }),
    alan('Sarı: başarı oranı en az (%)', sari, { yardim: `Yeşil eşiğinden küçük olmalı; altı kırmızı. Varsayılan: ${varsayilan.sari}.` }),
    h('div', { class: 'dugmeler' }, kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    alanHatasi(yesil, '');
    alanHatasi(sari, '');
    const y = Number(yesil.value);
    const s = Number(sari.value);
    if (!Number.isInteger(y) || y < 2 || y > 100) { alanHatasi(yesil, '2 ile 100 arasında bir tam sayı girin.'); yesil.focus(); return; }
    if (!Number.isInteger(s) || s < 1 || s >= y) { alanHatasi(sari, `1 ile ${y - 1} arasında bir tam sayı girin.`); sari.focus(); return; }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/saglik-esikleri/kaydet', { govde: { projeId: proje.id, esikler: { yesil: y, sari: s } } }));
      mesaj.goster('Sağlık noktası eşikleri kaydedildi.', 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return form;
}

/** Tema seçimi (renk ailesi + biçim); açık / koyu seçimi üst çubuktaki düğmededir. Seçim hemen uygulanır. */
function temaKarti() {
  const ad = yeniKimlik('stil');
  const secili = kayitliStil();
  const kart = (s) => {
    const girdi = h('input', { type: 'radio', name: ad, value: s.ad, id: `${ad}-${s.ad}`, checked: s.ad === secili });
    girdi.addEventListener('change', () => { if (girdi.checked) { stilUygula(s.ad); bildir(`Tema: ${s.etiket}`); } });
    return h('label', { class: 'tema-karti', for: girdi.id }, girdi,
      h('span', { class: `tema-onizleme ${s.ad}`, 'aria-hidden': 'true' }, h('i', { class: 'to-ust' }), h('i', { class: 'to-sol' }), h('i', { class: 'to-ana' })),
      h('b', {}, s.etiket), h('small', {}, s.aciklama));
  };
  return h('div', { class: 'kart form-paneli', role: 'group', 'aria-label': 'Tema' },
    h('h3', {}, ikon('gorunum'), 'Tema'),
    h('p', { class: 'soluk' }, 'Nöbetçi\'nin görünümü. Her tema açık ve koyu modda çalışır; açık / koyu seçimi üst çubuktaki güneş / ay düğmesindedir. Seçim bu tarayıcıda hatırlanır.'),
    h('div', { class: 'tema-secimi', role: 'radiogroup', 'aria-label': 'Tema' }, STILLER.map(kart)));
}

/** "Nöbetçi nasıl açılsın": kendi penceresi (masaüstü uygulaması gibi) ya da varsayılan tarayıcı. Bir sonraki açılışta geçerli. */
function acilisKarti(acilis) {
  const mesaj = mesajKutusu();
  const ad = yeniKimlik('acilis');
  const secenek = (deger, baslik, aciklama) => {
    const girdi = h('input', { type: 'radio', name: ad, value: deger, id: `${ad}-${deger}`, checked: acilis.bicim === deger, disabled: acilis.ortamdan });
    girdi.addEventListener('change', async () => {
      mesaj.temizle();
      try {
        await api('/platform/acilis/kaydet', { govde: { bicim: deger } });
        mesaj.goster(deger === 'pencere' ? 'Nöbetçi bir sonraki açılışta kendi penceresinde açılacak.' : 'Nöbetçi bir sonraki açılışta varsayılan tarayıcınızda açılacak.', 'basari');
      } catch (hata) { mesaj.goster(hata.message); }
    });
    return h('label', { class: 'onay-satiri', for: girdi.id }, girdi, h('span', {}, h('b', {}, baslik), h('small', { class: 'blok soluk' }, aciklama)));
  };
  return h('div', { class: 'kart form-paneli', role: 'group', 'aria-label': 'Açılış' },
    h('h3', {}, ikon('bilgisayar'), 'Nöbetçi nasıl açılsın'),
    h('p', { class: 'soluk' }, acilis.ortamdan ? 'Bu bilgisayarda NOBETCI_ACILIS ortam değişkeniyle belirlenmiş; buradan değiştirilemez.' : 'Seçiminiz bir sonraki açılışta ("npm run baslat" ya da Nöbetçi.exe) geçerli olur.'),
    mesaj.kutu,
    secenek('tarayici', 'Varsayılan tarayıcıda', 'Her zamanki tarayıcınızda yeni bir sekme açılır; sekme kapansa da Nöbetçi arka planda çalışmaya devam eder. Varsayılan budur; varsayılan tarayıcı açılamazsa Nöbetçi penceresi kullanılır.'),
    secenek('pencere', 'Kendi penceresinde (masaüstü uygulaması gibi)', 'Adres çubuğu ve sekmeler olmadan ayrı bir pencere. Bu bilgisayardaki Chromium kullanılır; pencere kapanınca Nöbetçi de kapanır.'));
}
