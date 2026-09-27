// Ayarlar bölümleri: Proje ve ortamlar, Giriş profilleri, Bağlam profilleri, Test verisi,
// Yedekleme, Güvenlik. Tüm veriler /platform/* uç noktalarından gelir; gizli değerler
// (parola, authenticator anahtarı, hassas test verisi) API'den yalnızca { dolu, maske } olarak
// döner, açıkça "Kayıtlı değeri göster" istenmedikçe düz metin gelmez.
import {
  adresGecerliMi, alan, alanHatasi, api, bildir, bosDurum, boyutMetni, geriSayim, h, ikon, iskelet, kullaniciAyarlariniTazele, mesajKutusu, mesgulIken,
  onayliDugme, parolaAlani, rozet, tarihMetni, TOKEN, yeniKimlik, yerlestir
} from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { girisTarifiBolumu } from './giris-tarifi.js';
import { dosyaOnDenetimi, dosyaYukle } from './dosya-yukleme.js';
import { tablolarBolumu } from './tablolar.js';
import { rehberAyarlariniGuncelle, rehberBaslat } from './rehber.js';

export const AYAR_BOLUMLERI = [
  { ad: 'proje', etiket: 'Proje ve ortamlar', ikon: 'katman', aciklama: 'Projenin adı ve testlerin çalışacağı ortamlar. Ortam adları ve adresleri kasada şifreli saklanır.' },
  { ad: 'giris', etiket: 'Giriş profilleri', ikon: 'kullanici', aciklama: 'Testlerin sisteme giriş yaparken kullanacağı hesaplar ve ortam başına giriş tarifi (giriş sayfasının alanları, iki aşamalı doğrulama, bağlam seçimi). Parolalar ve anahtarlar kasada şifreli saklanır ve burada gösterilmez.' },
  { ad: 'test-verisi', etiket: 'Test verisi', ikon: 'veri', aciklama: 'Tablolar: sütunlar alan, her satır birlikte geçerli değerler (kanal | kullanıcı | parola, kapsam | alternatif | ülke…). Ekran input\'ları ve servis alanları sütunlara bağlanır; senaryoda seçtikçe süzülür. Bağlam tabloları (ör. şube) senaryoda satır adıyla seçilir.' },
  { ad: 'dosyalar', etiket: 'Dosyalar', ikon: 'dosya', aciklama: 'Ekranların varsayılan dosyaları (ör. ürünün çoklu sorgu Excel\'i). Dosyalar yalnızca şifreli saklanır; koşuda geçici olarak çözülür ve koşu bitince silinir.' },
  { ad: 'kosu', etiket: 'Koşu', ikon: 'oynat', aciklama: 'Koşuların davranışı: video / ekran görüntüsü / iz kaydı, yeniden deneme, süre limiti, bekleme süreleri, servis zaman aşımı, varsayılan tarih biçimi ve ekran taraması / akış kaydı süreleri. Kararlar sizindir; değişiklik sonraki koşulardan itibaren geçerlidir.' },
  { ad: 'yedekleme', etiket: 'Yedekleme', ikon: 'arsiv', aciklama: 'Şifreli .tayedek dosyası olarak dışa aktarın, başka bir bilgisayarın yedeğini içe aktarın; yerel otomatik yedekler burada listelenir. Kaç otomatik yedeğin tutulacağını ve koşu sonuçlarının ne kadar saklanacağını siz belirlersiniz.' },
  { ad: 'guvenlik', etiket: 'Güvenlik', ikon: 'kalkan', aciklama: 'Kasa kilidi, otomatik kilit süresi, video saklama süresi, yasak adresler, maskelenecek gizli adlar ve kasa parolası.' },
  { ad: 'arayuz', etiket: 'Arayüz', ikon: 'ekran', aciklama: 'Ekran rehberlerinin ilk girişte kendiliğinden açılıp açılmayacağı ve listelerin sayfa boyları. Rehberler her ekranda üst çubuktaki "?" düğmesiyle yeniden açılır.' }
];

const IKI_ASAMALI_ETIKET = { yok: 'Yok', totp: 'Authenticator', sms: 'SMS' };

const ISLEM_ETIKETI = {
  olustur: 'Oluşturuldu', guncelle: 'Güncellendi', sil: 'Silindi',
  birlestirme_cakismasi: 'Birleştirme çakışması', ice_aktarma_uzerine_yazildi: 'Yedekten üzerine yazıldı'
};

/**
 * @param {HTMLElement} kapsayici
 * @param {string} bolum
 * @param {{ durum: any; yonlendir: () => void; projeSec: (id: string) => void; projeleriYenile: () => Promise<void> }} baglam
 */
export function ayarlarBolumu(kapsayici, bolum, baglam) {
  if (bolum === 'baglam') bolum = 'test-verisi';
  const tanim = AYAR_BOLUMLERI.find((b) => b.ad === bolum) || AYAR_BOLUMLERI[0];
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('div', { class: 'kirinti' }, h('span', {}, baglam.durum.proje ? baglam.durum.proje.ad : ''), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', {}, 'Ayarlar'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, tanim.etiket)),
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, tanim.etiket),
    h('p', { class: 'soluk kucuk bolum-aciklamasi' }, tanim.aciklama)));
  const govde = h('div', {}, iskelet('sayfa'));
  kapsayici.replaceChildren(baslik, govde);
  const yenile = () => ayarlarBolumu(kapsayici, bolum, baglam);
  const ciz = {
    proje: projeVeOrtamlar, giris: girisProfilleri,
    'test-verisi': testVerisi, dosyalar, kosu: kosuAyarlari, yedekleme, guvenlik, arayuz: arayuzAyarlari
  }[bolum] || projeVeOrtamlar;
  Promise.resolve(ciz(govde, baglam, yenile)).catch((hata) => {
    if (hata && hata.durum === 423) return; // kabuk kilit ekranına geçti
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

async function projeVeOrtamlar(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`);

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
    const oAdres = h('input', { type: 'url', autocomplete: 'off', inputmode: 'url', placeholder: 'https://', value: ortam ? ortam.tabanUrl : '' });
    const oVarsayilan = h('input', { type: 'checkbox', id: yeniKimlik('vars'), checked: ortam ? ortam.varsayilan : false });
    const oCanli = h('input', { type: 'checkbox', id: yeniKimlik('canli'), checked: ortam ? ortam.canli === true : false });
    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(ortam ? `Ortamı düzenle: ${ortam.ad}` : 'Yeni ortam', mesaj.kutu,
      alan('Ortam adı', oAd, { zorunlu: true }), alan('Adres (link)', oAdres, { zorunlu: true }),
      h('label', { class: 'secenek', for: oVarsayilan.id }, oVarsayilan, 'Varsayılan ortam (koşular bu ortamda başlar)'),
      h('label', { class: 'secenek', for: oCanli.id }, oCanli, 'Bu ortam canlı: akış kaydı kapalı ("Akışı kaydet" sırasında bastığınız düğmeler siteye gerçek istek gönderir)'),
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      alanHatasi(oAd, ''); alanHatasi(oAdres, '');
      if (!oAd.value.trim()) { alanHatasi(oAd, 'Ortam adı boş olamaz.'); oAd.focus(); return; }
      if (!adresGecerliMi(oAdres.value.trim())) { alanHatasi(oAdres, 'Geçerli bir http(s) adresi girin.'); oAdres.focus(); return; }
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/ortam/kaydet', {
          govde: { id: ortam ? ortam.id : undefined, projeId: proje.id, ad: oAd.value.trim(), tabanUrl: oAdres.value.trim(), varsayilan: oVarsayilan.checked, canli: oCanli.checked }
        }));
        bildir('Ortam kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(formAlani, form);
  };

  const satirlar = ortamlar.map((o) => kayitSatiri(
    [o.ad, ' ', o.varsayilan ? h('span', { class: 'rozet vurgu' }, 'Varsayılan') : null, o.canli ? [' ', h('span', { class: 'rozet uyari', title: 'Akış kaydı bu ortamda kapalı' }, 'Canlı')] : null],
    h('span', { class: 'mono' }, o.tabanUrl),
    [duzenleDugmesi(o.ad, () => ortamFormu(o)),
      o.varsayilan
        ? h('button', { type: 'button', class: 'kucuk-dugme', disabled: true, title: 'Varsayılan ortam silinemez; önce başka bir ortamı varsayılan yapın.' }, 'Sil')
        : silDugmesi(o.ad, async () => { await api('/platform/ortam/sil', { govde: { id: o.id } }); bildir('Ortam silindi.'); yenile(); })], 'ag'));

  govde.replaceChildren(
    projeFormu,
    bolumBasligi('Ortamlar', ortamlar.length, h('button', { type: 'button', class: 'birincil', onclick: () => ortamFormu(null) }, '+ Ortam ekle')),
    formAlani,
    kayitListesi(satirlar, 'Henüz ortam yok.', 'ag'));
}

// ---------------------------------------------------------------------------------------
// Giriş profilleri
// ---------------------------------------------------------------------------------------

async function girisProfilleri(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const [{ profiller }, { ortamlar }] = await Promise.all([
    api(`/platform/giris-profilleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
  ]);
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
      yardim: 'Authenticator kurulumunda gösterilen gizli anahtar (base32). Kodlar koşu sırasında bu anahtardan üretilir.',
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
    [rYok.r, rTotp.r, rSms.r, smsSabit, smsElle].forEach((r) => r.addEventListener('change', gorunurluk));
    gorunurluk();

    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(p ? `Giriş profilini düzenle: ${p.ad}` : 'Yeni giriş profili', mesaj.kutu,
      alan('Profil adı', ad, { zorunlu: true, yardim: 'Ör. "Yönetici kullanıcı" veya "Salt okunur kullanıcı".' }),
      alan('Ortam', ortam),
      alan('Kullanıcı adı', kullanici, { zorunlu: true }),
      parola.kapsayici,
      h('fieldset', {}, h('legend', {}, 'İki aşamalı doğrulama'), rYok.etiket, rTotp.etiket, totpAlani, rSms.etiket, smsAlani),
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      mesaj.temizle();
      [ad, kullanici, parola.girdi, totp.girdi, smsKod].forEach((g) => alanHatasi(g, ''));
      if (!ad.value.trim()) { alanHatasi(ad, 'Kayıt adı boş olamaz.'); ad.focus(); return; }
      if (!kullanici.value.trim()) { alanHatasi(kullanici, 'Kullanıcı adı boş olamaz.'); kullanici.focus(); return; }
      if (!p && !parola.girdi.value) { alanHatasi(parola.girdi, 'Parola girin.'); parola.girdi.focus(); return; }
      const secilenTur = rTotp.r.checked ? 'totp' : rSms.r.checked ? 'sms' : 'yok';
      if (secilenTur === 'totp' && !totp.girdi.value && !(p && p.totpGizli.dolu)) { alanHatasi(totp.girdi, 'Gizli anahtarı girin.'); totp.girdi.focus(); return; }
      if (secilenTur === 'sms' && smsSabit.checked && !smsKod.value.trim()) { alanHatasi(smsKod, 'Test kodunu girin veya "koşu sırasında elle girilir" seçin.'); smsKod.focus(); return; }
      const istek = {
        id: p ? p.id : undefined, projeId: proje.id, ad: ad.value.trim(), ortamId: ortam.value || null,
        kullaniciAdi: kullanici.value.trim(), ikiAsamaliTur: secilenTur,
        sms: { yontem: smsElle.checked ? 'elle' : 'sabit', kod: smsKod.value.trim() }
      };
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

  const satirlar = profiller.map((p) => kayitSatiri(p.ad,
    [`${ortamAdi(p.ortamId)} · ${p.kullaniciAdi} · Parola: ${p.parola.dolu ? `${p.parola.maske} kayıtlı` : 'yok'} · İki aşamalı: ${IKI_ASAMALI_ETIKET[p.ikiAsamaliTur] || p.ikiAsamaliTur}`,
      p.ikiAsamaliTur === 'sms' ? (p.sms.yontem === 'elle' ? ' (elle girilir)' : ' (sabit test kodu)') : ''],
    [duzenleDugmesi(p.ad, () => profilFormu(p)), gecmisDugmesi(p.ad, () => gecmisGoster('giris_profili', p.id, p.ad, baglam)),
      silDugmesi(p.ad, async () => { await api('/platform/giris-profili/sil', { govde: { id: p.id } }); bildir('Giriş profili silindi.'); yenile(); })], 'kullanici'));

  const tarifAlani = h('section', { class: 'giris-tarifi-bolumu', 'aria-label': 'Giriş tarifi' }, iskelet('liste'));
  govde.replaceChildren(
    bolumBasligi('Profiller', profiller.length, h('button', { type: 'button', class: 'birincil', onclick: () => profilFormu(null) }, '+ Giriş profili ekle')),
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
  return tablolarBolumu(govde, baglam.durum.proje);
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
  const [{ klasor, dosyalar }, tahmin, saklamaFormu] = await Promise.all([
    api('/platform/yedek/otomatik-liste'),
    api('/platform/yedek/tahmin').catch(() => null),
    ayarFormu('yedekleme', 'Saklama ayarları', 'Saklama ayarları kaydedildi; günlük yedek ve temizlikte geçerli.')
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
    h('p', { class: 'soluk' }, 'Sunucu açıkken ve kasa açıkken günde bir yerel yedek alınır; kaç tanesinin saklanacağını aşağıdaki "Saklama ayarları"ndan belirlersiniz.'),
    h('p', { class: 'soluk kucuk' }, 'Klasör: ', h('code', {}, klasor)),
    liste);
  govde.replaceChildren(disaForm, iceKart, iceAlani, otomatikKart, saklamaFormu, sonucTemizlemeKarti());
}

// ---------------------------------------------------------------------------------------
// Dosyalar (ekranların varsayılan dosyaları — şifreli)
// ---------------------------------------------------------------------------------------

async function dosyalar(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const { ekranlar } = await api(`/platform/ekran-dosyalari?projeId=${encodeURIComponent(proje.id)}`);
  const satirlar = [];
  for (const e of ekranlar) {
    for (const d of e.dosyalar) {
      const secici = h('input', { type: 'file', class: 'gorunmez-dosya', 'aria-label': `${e.ad}: ${d.anahtar} dosyasını değiştir` });
      const mesaj = h('div', { class: 'kucuk', 'aria-live': 'polite' });
      const eskiUzanti = (d.dosya ? d.dosya.ad : d.eskiYol || '').split('.').pop();
      secici.accept = eskiUzanti ? `.${eskiUzanti}` : '';
      const degistir = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => secici.click() }, ikon('yukle'), d.dosya ? 'Değiştir' : 'Yükle ve şifrele');
      secici.addEventListener('change', async () => {
        const dosya = secici.files && secici.files[0];
        secici.value = '';
        if (!dosya) return;
        const sorun = dosyaOnDenetimi(dosya, secici.accept);
        if (sorun) { mesaj.className = 'kucuk hata-metni'; mesaj.textContent = sorun; return; }
        mesaj.className = 'kucuk soluk';
        mesaj.textContent = `${dosya.name} şifrelenip yükleniyor…`;
        degistir.disabled = true;
        try {
          const adres = `/platform/ekran-dosyasi/yukle?projeId=${encodeURIComponent(proje.id)}&ekranId=${encodeURIComponent(e.id)}&yol=${encodeURIComponent(JSON.stringify(d.yol))}`;
          const y = await dosyaYukle(adres, dosya, (p) => { mesaj.textContent = `${dosya.name} şifrelenip yükleniyor… %${p}`; });
          bildir(`${e.ad}: ${y.ad} şifreli olarak kaydedildi.`, 'basari');
          yenile();
        } catch (hata) {
          degistir.disabled = false;
          if (hata.durum === 423) return;
          mesaj.className = 'kucuk hata-metni';
          mesaj.textContent = hata.message;
        }
      });
      const dosyaMetni = d.dosya
        ? [h('strong', {}, d.dosya.ad), ' ', rozet([ikon('kilit'), 'şifreli'], 'basari'), d.dosya.eksik ? rozet('şifreli depoda yok', 'hata') : null]
        : [h('code', {}, d.eskiYol), ' ', rozet([ikon('uyari'), 'düz metin yol'], 'uyari', { title: 'Eski düz metin dosya yolu: dosyayı yükleyip şifreleyin.' })];
      satirlar.push(kayitSatiri(
        h('span', {}, e.ad, h('span', { class: 'soluk kucuk' }, ` · ${d.anahtar}`)),
        [h('span', {}, ...dosyaMetni), h('br', {}), h('span', {}, `${d.ortamAd || 'tüm ortamlar'}${d.dosya && d.dosya.boyut !== null ? ` · ${boyutMetni(d.dosya.boyut)}` : ''}`), mesaj],
        [secici, degistir], 'dosya'));
    }
  }
  govde.replaceChildren(
    h('div', { class: 'not-kutusu bilgi' }, h('p', {}, 'Senaryoda dosya seçilmemişse ekranın varsayılan dosyası kullanılır. Dosyalar diskte yalnızca şifreli durur ve indirilemez; koşuda yalnızca sizin okuyabildiğiniz geçici bir klasöre çözülür, koşu bitince silinir. Senaryoya özel dosyalar senaryo formundan yüklenir.')),
    bolumBasligi('Ekran dosyaları', satirlar.length),
    kayitListesi(satirlar, 'Ekran ayarlarında dosya yok.', 'dosya'));
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

/** Ayarlar > Koşu: koşu ayarları + hata sınıflandırma kuralları. */
async function kosuAyarlari(govde) {
  const [form, kurallar] = await Promise.all([
    ayarFormu('kosu', 'Koşu ayarları', 'Koşu ayarları kaydedildi; sonraki koşulardan itibaren geçerli.'), siniflandirmaKarti()
  ]);
  yerlestir(govde, form, kurallar);
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
    h('p', { class: 'soluk' }, 'Kalan testin hata mesajında bu metin geçerse Sonuçlar\'da seçtiğiniz kategoride görünür (ör. uygulamanızın iş kuralı pop-up metni → "İş Kuralı / Ekran Hatası"). Kurallar yukarıdan aşağı denenir; eşleşmezse genel kurallar uygulanır. Yeni koşulara uygulanır.'),
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
 * Kullanıcı kararları formu (tanımlar sunucudan: scripts/platform/ayarlar/kosu-ayarlari.mjs): bölümün ayarları gruplar hâlinde.
 * @param {'kosu' | 'yedekleme'} bolum @param {string} ad formun erişilebilir adı @param {string} basariMetni
 */
async function ayarFormu(bolum, ad, basariMetni) {
  const { ayarlar, tanimlar: tumu } = await api('/platform/kosu-ayarlari');
  const tanimlar = tumu.filter((t) => (t.bolum || 'kosu') === bolum);
  const mesaj = mesajKutusu();
  /** @type {Map<string, HTMLElement>} */
  const girdiler = new Map();
  const gruplar = [...new Set(tanimlar.map((t) => t.grup))];
  const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const form = h('form', { class: 'kart form-paneli kosu-ayarlari', novalidate: true, 'aria-label': ad }, mesaj.kutu,
    ...gruplar.map((g) => h('fieldset', {}, h('legend', {}, g), ...tanimlar.filter((t) => t.grup === g).map((t) => {
      let girdi;
      if (t.tur === 'secim') girdi = h('select', {}, t.secenekler.map(([d, e]) => h('option', { value: d, selected: ayarlar[t.anahtar] === d }, e)));
      else if (t.tur === 'sayi') girdi = h('input', { type: 'number', min: String(t.enAz), max: String(t.enCok), step: '1', inputmode: 'numeric', value: String(ayarlar[t.anahtar]) });
      else girdi = h('input', { type: 'text', value: String(ayarlar[t.anahtar]), spellcheck: 'false', autocomplete: 'off', class: 'kod-girdisi' });
      girdiler.set(t.anahtar, girdi);
      const varsayilan = t.tur === 'secim' ? (t.secenekler.find(([d]) => d === t.varsayilan) || [])[1] : `${t.varsayilan}${t.birim ? ` ${t.birim}` : ''}`;
      const sinir = t.tur === 'sayi' ? `${t.enAz}–${t.enCok}${t.birim ? ` ${t.birim}` : ''}; ` : '';
      return alan(`${t.etiket}${t.birim ? ` (${t.birim})` : ''}`, girdi, { yardim: `${t.aciklama} ${sinir}Varsayılan: ${varsayilan}.` });
    }))),
    h('div', { class: 'dugmeler' }, kaydet));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    mesaj.temizle();
    for (const g of girdiler.values()) alanHatasi(g, '');
    /** @type {Record<string, string | number>} */
    const yeni = {};
    for (const t of tanimlar) {
      const g = girdiler.get(t.anahtar);
      if (t.tur === 'sayi') {
        const n = Number(g.value);
        if (!Number.isInteger(n) || n < t.enAz || n > t.enCok) { alanHatasi(g, `${t.enAz} ile ${t.enCok} arasında bir tam sayı girin.`); g.focus(); return; }
        yeni[t.anahtar] = n;
      } else yeni[t.anahtar] = g.value.trim();
    }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/kosu-ayarlari/kaydet', { govde: { ayarlar: yeni } }));
      kullaniciAyarlariniTazele();
      mesaj.goster(basariMetni, 'basari');
    } catch (hata) { mesaj.goster(hata.message); }
  });
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
    h('p', { class: 'soluk' }, 'Adı bu listede geçen alanların, başlıkların ve servis okumalarının değerleri raporlarda maskelenir, sayfa paketlerinde reddedilir. Çekirdek liste güvenlik gereği değiştirilemez; kendi adlarınızı ekleyebilirsiniz.'),
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
  // Video saklama süresi (şifreli medya deposu): bu süreden eski koşu videoları silinir;
  // ekran görüntüleri ve sonuçlar saklanır.
  const gun = h('input', { type: 'number', min: '1', max: '365', step: '1', value: String(ayar.videoSaklamaGun), inputmode: 'numeric' });
  const saklamaMesaj = mesajKutusu();
  const saklamaKaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
  const saklamaForm = h('form', { class: 'kart', novalidate: true }, h('h3', {}, ikon('video'), 'Video saklama süresi'),
    h('p', { class: 'soluk' }, 'Koşu videoları şifreli olarak saklanır; bu süreden eski videolar günlük temizlikte silinir. Ekran görüntüleri, izler ve sonuçlar silinmez.'),
    saklamaMesaj.kutu,
    alan('Süre (gün)', gun, { yardim: `1–365 gün; varsayılan ${ayar.videoSaklamaVarsayilan}.` }),
    h('div', { class: 'dugmeler' }, saklamaKaydet));
  saklamaForm.addEventListener('submit', async (o) => {
    o.preventDefault();
    saklamaMesaj.temizle();
    alanHatasi(gun, '');
    const g = Number(gun.value);
    if (!Number.isInteger(g) || g < 1 || g > 365) { alanHatasi(gun, '1 ile 365 arasında bir tam sayı girin.'); gun.focus(); return; }
    try {
      await mesgulIken(saklamaKaydet, 'Kaydediliyor…', () => api('/platform/guvenlik/kaydet', { govde: { videoSaklamaGun: g } }));
      saklamaMesaj.goster(`${g} günden eski videolar silinecek.`, 'basari');
    } catch (hata) { saklamaMesaj.goster(hata.message); }
  });
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
    await mesgulIken(kilitle, 'Kilitleniyor…', () => api('/platform/kasa/kilitle', { govde: {} }));
    bildir('Kasa kilitlendi.');
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
// Ayarlar > Arayüz: ekran rehberleri (kullanıcı kararı: ilk girişte kendiliğinden açılsın mı)
// ---------------------------------------------------------------------------------------

async function arayuzAyarlari(govde) {
  const [{ rehber }, listeFormu] = await Promise.all([api('/platform/rehber'), ayarFormu('arayuz', 'Arayüz ayarları', 'Arayüz ayarları kaydedildi.')]);
  const otomatik = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', id: yeniKimlik('rehber-otomatik'), checked: rehber.otomatik, disabled: rehber.ortamKapali });
  const mesaj = mesajKutusu();
  const sifirla = h('button', { type: 'button' }, ikon('yenile'), 'Tüm rehberleri yeniden göster');
  const tanitim = h('button', { type: 'button', class: 'hayalet' }, ikon('pusula'), 'Genel tanıtımı şimdi aç');
  otomatik.addEventListener('change', async () => {
    mesaj.temizle();
    try {
      const y = await api('/platform/rehber/kaydet', { govde: { otomatik: otomatik.checked } });
      rehberAyarlariniGuncelle(y.rehber);
      mesaj.goster(otomatik.checked ? 'Rehberler her ekranın ilk açılışında kendiliğinden başlayacak.' : 'Rehberler artık kendiliğinden açılmayacak; "?" düğmesi çalışmaya devam eder.', 'basari');
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
  yerlestir(govde, h('div', { class: 'kart form-paneli', role: 'group', 'aria-label': 'Rehberler' },
    h('h3', {}, ikon('soru'), 'Rehberler'),
    h('p', { class: 'soluk' }, 'Her ekranın, o ekranda işlerin hangi sırayla ve nasıl yapılacağını anlatan bir rehberi vardır. Rehber bitince ya da kapatılınca "görüldü" sayılır.'),
    mesaj.kutu,
    h('label', { class: 'onay-satiri', for: otomatik.id }, otomatik,
      h('span', {}, h('b', {}, 'Rehberleri ilk girişte kendiliğinden göster'),
        h('small', { class: 'blok soluk' }, rehber.ortamKapali
          ? 'Bu sunucuda NOBETCI_REHBER_OTOMATIK=0 ortam değişkeniyle kapatılmış.'
          : 'Kapalıysa rehberler yalnızca üst çubuktaki "?" düğmesiyle açılır.'))),
    h('p', { class: 'soluk kucuk' }, `Görülen rehber: ${rehber.gorulenler.length}`),
    h('div', { class: 'dugmeler' }, sifirla, tanitim)), listeFormu);
}
