// Ayarlar bölümleri: Proje ve ortamlar, Giriş profilleri, Bağlam profilleri, Test verisi,
// Yedekleme, Güvenlik. Tüm veriler /platform/* uç noktalarından gelir; gizli değerler
// (parola, authenticator anahtarı, hassas test verisi) API'den yalnızca { dolu, maske } olarak
// döner, açıkça "Kayıtlı değeri göster" istenmedikçe düz metin gelmez.
import {
  adresGecerliMi, alan, alanHatasi, api, bildir, bosDurum, boyutMetni, geriSayim, h, ikon, iskelet, mesajKutusu, mesgulIken,
  onayliDugme, parolaAlani, rozet, tarihMetni, TOKEN, yeniKimlik, yerlestir
} from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';
import { aktarimAkisi } from './aktarim.js';
import { girisTarifiBolumu } from './giris-tarifi.js';
import { dosyaOnDenetimi, dosyaYukle } from './dosya-yukleme.js';

export const AYAR_BOLUMLERI = [
  { ad: 'proje', etiket: 'Proje ve ortamlar', ikon: 'katman', aciklama: 'Projenin adı ve testlerin çalışacağı ortamlar. Ortam adları ve adresleri kasada şifreli saklanır.' },
  { ad: 'giris', etiket: 'Giriş profilleri', ikon: 'kullanici', aciklama: 'Testlerin sisteme giriş yaparken kullanacağı hesaplar ve ortam başına giriş tarifi (giriş sayfasının alanları, iki aşamalı doğrulama, bağlam seçimi). Parolalar ve anahtarlar kasada şifreli saklanır ve burada gösterilmez.' },
  { ad: 'baglam', etiket: 'Bağlam profilleri', ikon: 'hedef', aciklama: 'Testlerin hangi bağlamda (ör. rol, şube, müşteri tipi) çalışacağını tanımlayan profiller. Tür adlarını projeniz belirler.' },
  { ad: 'test-verisi', etiket: 'Test verisi', ikon: 'veri', aciklama: 'Testlerin kullanacağı veri kalıpları (türler) ve bu kalıplara göre doldurulmuş kayıtlar (profiller).' },
  { ad: 'dosyalar', etiket: 'Dosyalar', ikon: 'dosya', aciklama: 'Ekranların varsayılan dosyaları (ör. ürünün çoklu sorgu Excel\'i). Dosyalar yalnızca şifreli saklanır; koşuda geçici olarak çözülür ve koşu bitince silinir.' },
  { ad: 'yedekleme', etiket: 'Yedekleme', ikon: 'arsiv', aciklama: 'Şifreli .tayedek dosyası olarak dışa aktarın, başka bir bilgisayarın yedeğini içe aktarın; yerel otomatik yedekler burada listelenir.' },
  { ad: 'guvenlik', etiket: 'Güvenlik', ikon: 'kalkan', aciklama: 'Kasa kilidi, otomatik kilit süresi, video saklama süresi, yasak adresler, açık dosyaların şifreli depoya taşınması ve kasa parolası.' }
];

const IKI_ASAMALI_ETIKET = { yok: 'Yok', totp: 'Authenticator', sms: 'SMS' };
const TIP_SECENEKLERI = [
  ['metin', 'Metin'], ['sayi', 'Sayı'], ['tarih', 'Tarih'], ['eposta', 'E-posta'], ['mantiksal', 'Evet / hayır'],
  ['secim', 'Seçim (değer + metin, JSON)'], ['json', 'JSON']
];

/** Profil kapsamı seçimi: "Tüm ortamlar" veya tek bir ortam. */
function ortamSecimi(ortamlar, seciliId) {
  return h('select', {}, h('option', { value: '' }, 'Tüm ortamlar'),
    ortamlar.map((o) => h('option', { value: o.id, selected: seciliId === o.id }, o.ad)));
}
const ortamAdiBul = (ortamlar, id) => (id ? (ortamlar.find((o) => o.id === id) || { ad: 'silinmiş ortam' }).ad : 'Tüm ortamlar');
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
    proje: projeVeOrtamlar, giris: girisProfilleri, baglam: baglamProfilleri,
    'test-verisi': testVerisi, dosyalar, yedekleme, guvenlik
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
      if (!ad.value.trim()) { alanHatasi(ad, 'Profil adı boş olamaz.'); ad.focus(); return; }
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
// Bağlam profilleri (tür adı projeye özgü serbest metin)
// ---------------------------------------------------------------------------------------

async function baglamProfilleri(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const [{ profiller, turler }, { ortamlar }] = await Promise.all([
    api(`/platform/baglam-profilleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
  ]);
  const formAlani = h('div', {});
  const turListesiId = yeniKimlik('turler');

  const profilFormu = (p) => {
    const tur = h('input', { type: 'text', autocomplete: 'off', list: turListesiId, value: p ? p.tur : '' });
    const ad = h('input', { type: 'text', autocomplete: 'off', value: p ? p.ad : '' });
    const ortam = ortamSecimi(ortamlar, p ? p.ortamId : null);
    const satirlar = [];
    const satirKutusu = h('div', {});
    const satirEkle = (anahtar = '', deger = '') => {
      const a = h('input', { type: 'text', autocomplete: 'off', value: anahtar });
      const d = h('input', { type: 'text', autocomplete: 'off', value: deger });
      const s = { a, d, el: null };
      const kaldir = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': 'Bu alanı kaldır', onclick: () => { satirlar.splice(satirlar.indexOf(s), 1); s.el.remove(); } }, 'Kaldır');
      s.el = h('div', { class: 'anahtar-deger-satiri' }, alan('Alan adı', a), alan('Değer', d), kaldir);
      satirlar.push(s);
      satirKutusu.append(s.el);
      return s;
    };
    for (const [k, v] of Object.entries((p && p.alanlar) || {})) satirEkle(k, typeof v === 'string' ? v : JSON.stringify(v));
    if (!satirlar.length) satirEkle();
    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(p ? `Bağlam profilini düzenle: ${p.ad}` : 'Yeni bağlam profili', mesaj.kutu,
      alan('Tür', tur, { zorunlu: true, yardim: 'Projenize özgü bağlam türü; ör. Rol, Şube, Müşteri tipi. Var olan bir türü seçebilir ya da yenisini yazabilirsiniz.' }),
      h('datalist', { id: turListesiId }, turler.map((t) => h('option', { value: t }))),
      alan('Profil adı', ad, { zorunlu: true }),
      alan('Ortam', ortam, { yardim: 'Profil yalnızca seçilen ortamda mı, yoksa tüm ortamlarda mı geçerli?' }),
      h('fieldset', {}, h('legend', {}, 'Alanlar'), h('p', { class: 'soluk kucuk' }, 'Alan değerleri kasada şifreli saklanır.'), satirKutusu,
        h('button', { type: 'button', onclick: () => satirEkle().a.focus() }, '+ Alan ekle')),
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      mesaj.temizle();
      alanHatasi(tur, ''); alanHatasi(ad, '');
      if (!tur.value.trim()) { alanHatasi(tur, 'Tür boş olamaz.'); tur.focus(); return; }
      if (!ad.value.trim()) { alanHatasi(ad, 'Profil adı boş olamaz.'); ad.focus(); return; }
      const alanlar = {};
      for (const s of satirlar) {
        alanHatasi(s.a, '');
        const k = s.a.value.trim();
        if (!k && !s.d.value.trim()) continue;
        if (!k) { alanHatasi(s.a, 'Alan adı boş olamaz.'); s.a.focus(); return; }
        if (k in alanlar) { alanHatasi(s.a, 'Bu alan adı tekrar ediyor.'); s.a.focus(); return; }
        alanlar[k] = s.d.value;
      }
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/baglam-profili/kaydet', {
          govde: { id: p ? p.id : undefined, projeId: proje.id, tur: tur.value.trim(), ad: ad.value.trim(), alanlar, ortamId: ortam.value || null }
        }));
        bildir('Bağlam profili kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(formAlani, form);
  };

  const gruplar = turler.map((t) => h('section', { 'aria-label': t },
    h('h4', { class: 'grup-basligi-h4' }, ikon('hedef'), t, ' ', h('span', { class: 'rozet' }, String(profiller.filter((p) => p.tur === t).length))),
    kayitListesi(profiller.filter((p) => p.tur === t).map((p) => kayitSatiri(p.ad,
      `${ortamAdiBul(ortamlar, p.ortamId)} · ${Object.keys(p.alanlar || {}).length ? `Alanlar: ${Object.keys(p.alanlar).join(', ')}` : 'Alan yok'}`,
      [duzenleDugmesi(p.ad, () => profilFormu(p)), gecmisDugmesi(p.ad, () => gecmisGoster('baglam_profili', p.id, p.ad, baglam)),
        silDugmesi(p.ad, async () => { await api('/platform/baglam-profili/sil', { govde: { id: p.id } }); bildir('Bağlam profili silindi.'); yenile(); })])), '')));

  govde.replaceChildren(
    bolumBasligi('Profiller', profiller.length, h('button', { type: 'button', class: 'birincil', onclick: () => profilFormu(null) }, '+ Bağlam profili ekle')),
    formAlani,
    ...(gruplar.length ? gruplar : [bosDurum('Henüz bağlam profili yok.', 'Rol, şube ya da müşteri tipi gibi bir tür yazarak ilk profili ekleyin.', { ikon: 'hedef', rol: 'status' })]));
}

// ---------------------------------------------------------------------------------------
// Test verisi türleri ve profilleri
// ---------------------------------------------------------------------------------------

/** Parametre adından rol tahmini: SIGORTA_ETTIREN_TC → ettiren, SIGORTALI_TC2 → sigortali; bilinmeyen önek → önek; öneksiz → "varsayilan". */
function rolTahmini(ad) {
  const on = ad.toUpperCase();
  if (on.startsWith('SIGORTA_ETTIREN')) return 'ettiren';
  if (on.startsWith('SIGORTALI')) return 'sigortali';
  const m = /^([A-Z]+)_/.exec(on);
  return m ? m[1].toLocaleLowerCase('tr') : 'varsayilan';
}

/**
 * Test verisi alanının servis parametreleri: 1) servis seçilir, 2) o servisin senaryolarında geçen parametrelerden biri seçilir
 * (eşlenmemişler önce; eşli olanın yanında nereye bağlı olduğu yazar) ya da "Elle yaz…", 3) rol (addan tahmin, değiştirilebilir).
 * Eşleme parametre ADINA göredir: aynı ad (ör. SIGORTALI_TC) tüm servislerde bu alandan dolar.
 */
function servisParametreEditoru(proje, baslangic, servisler) {
  const liste = baslangic.map((x) => ({ ad: x.ad, rol: x.rol || 'varsayilan' }));
  const cipler = h('div', { class: 'parametre-cipleri' });
  const servisSec = h('select', { 'aria-label': 'Servis' }, h('option', { value: '' }, servisler.length ? '— servis seçin —' : 'Kayıtlı servis yok'),
    servisler.map((s) => h('option', { value: s.id }, s.ad)), h('option', { value: '__elle' }, 'Elle yaz…'));
  const paramSec = h('select', { 'aria-label': 'Parametre', disabled: true }, h('option', { value: '' }, '— önce servis —'));
  const elle = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'PARAMETRE_ADI', 'aria-label': 'Parametre adı', hidden: true });
  const rol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'rol', 'aria-label': 'Rol', class: 'rol-girdisi' });
  const ekle = h('button', { type: 'button', class: 'kucuk-dugme', disabled: true }, '+ Ekle');
  const hata = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
  let rolElle = false;
  const secilenAd = () => (servisSec.value === '__elle' ? elle.value.trim() : paramSec.value);
  const durumGuncelle = () => { ekle.disabled = !secilenAd(); if (secilenAd() && !rolElle) rol.value = rolTahmini(secilenAd()); };
  const cipCiz = () => yerlestir(cipler, ...liste.map((x, i) => h('span', { class: 'parametre-cipi sabit' }, x.ad, x.rol !== 'varsayilan' ? h('span', { class: 'soluk' }, ` · ${x.rol}`) : null,
    h('button', { type: 'button', class: 'cip-kaldir', 'aria-label': `${x.ad} eşlemesini kaldır`, onclick: () => { liste.splice(i, 1); cipCiz(); } }, '×'))),
    liste.length ? null : h('span', { class: 'soluk kucuk' }, 'Bu alan henüz bir servis parametresine eşli değil.'));
  servisSec.addEventListener('change', async () => {
    hata.textContent = '';
    elle.hidden = servisSec.value !== '__elle';
    paramSec.hidden = servisSec.value === '__elle';
    if (!servisSec.value || servisSec.value === '__elle') { paramSec.disabled = true; durumGuncelle(); if (!elle.hidden) elle.focus(); return; }
    paramSec.disabled = true;
    yerlestir(paramSec, h('option', { value: '' }, 'Yükleniyor…'));
    try {
      const p = await api(`/platform/servis/parametreler?projeId=${encodeURIComponent(proje.id)}&id=${encodeURIComponent(servisSec.value)}`);
      const adaylar = p.parametreler.filter((x) => x.kaynak.tur === 'veri' || x.kaynak.tur === 'eslenmemis')
        .sort((a, b) => (a.kaynak.tur === 'eslenmemis' ? 0 : 1) - (b.kaynak.tur === 'eslenmemis' ? 0 : 1) || a.ad.localeCompare(b.ad));
      yerlestir(paramSec, h('option', { value: '' }, adaylar.length ? '— parametre seçin —' : 'Bu serviste test verisi parametresi yok'),
        adaylar.map((x) => h('option', { value: x.ad, disabled: liste.some((l) => l.ad === x.ad) },
          x.kaynak.tur === 'eslenmemis' ? `${x.ad} (eşlenmemiş · ${x.senaryoSayisi} senaryo)` : `${x.ad} → ${x.kaynak.turAd}.${x.kaynak.alanEtiketi || x.kaynak.alan}`)));
      paramSec.disabled = !adaylar.length;
    } catch (e) { hata.textContent = e.message; }
    durumGuncelle();
  });
  paramSec.addEventListener('change', durumGuncelle);
  elle.addEventListener('input', durumGuncelle);
  rol.addEventListener('input', () => { rolElle = Boolean(rol.value); });
  ekle.addEventListener('click', () => {
    const ad = secilenAd();
    hata.textContent = '';
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(ad)) { hata.textContent = `Geçersiz parametre adı: "${ad}" (harf ya da "_" ile başlar).`; return; }
    if (liste.some((x) => x.ad === ad)) { hata.textContent = `"${ad}" zaten ekli.`; return; }
    const r = rol.value.trim() || 'varsayilan';
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(r)) { hata.textContent = 'Rol yalnız harf, rakam, "_" ve "-" içerebilir.'; return; }
    liste.push({ ad, rol: r });
    for (const o of paramSec.options) if (o.value === ad) o.disabled = true;
    paramSec.value = ''; elle.value = ''; rol.value = ''; rolElle = false;
    durumGuncelle();
    cipCiz();
  });
  cipCiz();
  const el = h('div', { class: 'servis-parametre-editoru' },
    h('div', { class: 'alan-etiketi' }, 'Servis parametreleri'),
    cipler,
    h('div', { class: 'servis-parametre-ekle' }, servisSec, paramSec, elle, rol, ekle),
    hata,
    h('p', { class: 'soluk kucuk' }, 'Servisi, sonra o servisin senaryolarında geçen parametreyi seçin. Aynı parametre adı tüm servislerde bu alandan dolar. Rol, aynı türün farklı kişileri (sigortalı / ettiren) için ayrı profil seçmeye yarar.'));
  return { el, deger: () => liste.map((x) => (x.rol && x.rol !== 'varsayilan' ? { ad: x.ad, rol: x.rol } : { ad: x.ad })) };
}

async function testVerisi(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  const [{ turler }, { profiller }, { ortamlar }, servisler] = await Promise.all([
    api(`/platform/test-verisi-turleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/test-verisi-profilleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`).then((x) => x.servisler).catch(() => [])
  ]);
  const turFormAlani = h('div', {});
  const profilFormAlani = h('div', {});

  const turFormu = (t) => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: t ? t.ad : '' });
    const satirlar = [];
    const kutu = h('div', {});
    const profilVar = t ? profiller.some((p) => p.turId === t.id) : false;
    // Yeni alanlar varsayılan olarak HASSAS (şifreli) gelir; kullanıcı alan bazında kaldırabilir.
    const satirEkle = (a = { ad: '', etiket: '', tip: 'metin', hassas: true }) => {
      const adG = h('input', { type: 'text', autocomplete: 'off', value: a.ad, spellcheck: 'false' });
      const etiketG = h('input', { type: 'text', autocomplete: 'off', value: a.etiket === a.ad ? '' : a.etiket });
      const tipG = h('select', {}, TIP_SECENEKLERI.map(([d, m]) => h('option', { value: d, selected: a.tip === d }, m)));
      const hassasG = h('input', { type: 'checkbox', id: yeniKimlik('hassas'), checked: a.hassas !== false });
      // Servis parametreleri: bu alanın servis gövdelerinde karşılık geldiği adlar (servis seçilir → o servisin parametreleri).
      const servisP = servisParametreEditoru(proje, a.servisParametreleri || [], servisler);
      const s = { adG, etiketG, tipG, hassasG, servisP, el: null };
      const kaldir = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': 'Bu alanı kaldır', onclick: () => { satirlar.splice(satirlar.indexOf(s), 1); s.el.remove(); } }, 'Kaldır');
      hassasG.classList.add('anahtar');
      s.el = h('div', { class: 'tur-alan-satiri' }, alan('Alan adı', adG), alan('Etiket', etiketG), alan('Tip', tipG),
        h('label', { class: 'secenek', for: hassasG.id, title: profilVar ? 'Değiştirirseniz bu türdeki profillerin mevcut değerleri de buna göre şifrelenir/çözülür.' : null }, hassasG, 'Hassas'), kaldir,
        h('div', { class: 'tur-alan-servis' }, servisP.el));
      satirlar.push(s);
      kutu.append(s.el);
      return s;
    };
    for (const a of (t && t.alanlar) || []) satirEkle(a);
    if (!satirlar.length) satirEkle();
    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(t ? `Türü düzenle: ${t.ad}` : 'Yeni test verisi türü', mesaj.kutu,
      alan('Tür adı', ad, { zorunlu: true, yardim: 'Ör. Müşteri, Adres, Kart.' }),
      h('fieldset', {}, h('legend', {}, 'Alanlar'),
        h('p', { class: 'soluk kucuk' }, 'Hassas işaretli alanların değerleri kasada şifreli saklanır ve maskeli gösterilir. Yeni alanlar varsayılan olarak hassastır; yalnızca gerçekten gizli olmayan alanlarda işareti kaldırın.'),
        kutu, h('button', { type: 'button', onclick: () => satirEkle().adG.focus() }, '+ Alan ekle')),
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => turFormAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      mesaj.temizle();
      alanHatasi(ad, '');
      if (!ad.value.trim()) { alanHatasi(ad, 'Tür adı boş olamaz.'); ad.focus(); return; }
      const alanlar = [];
      for (const s of satirlar) {
        alanHatasi(s.adG, '');
        const a = s.adG.value.trim();
        if (!a) { if (s.etiketG.value.trim()) { alanHatasi(s.adG, 'Alan adı boş olamaz.'); s.adG.focus(); return; } continue; }
        if (alanlar.some((x) => x.ad === a)) { alanHatasi(s.adG, 'Bu alan adı tekrar ediyor.'); s.adG.focus(); return; }
        const servisParametreleri = s.servisP.deger();
        alanlar.push({ ad: a, etiket: s.etiketG.value.trim() || a, tip: s.tipG.value, hassas: s.hassasG.checked, servisParametreleri });
      }
      if (!alanlar.length) { mesaj.goster('En az bir alan ekleyin.'); return; }
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/test-verisi-turu/kaydet', {
          govde: { id: t ? t.id : undefined, projeId: proje.id, ad: ad.value.trim(), alanlar }
        }));
        bildir('Test verisi türü kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(turFormAlani, form);
  };

  const profilFormu = (p, varsayilanTurId) => {
    const turSecimi = h('select', { disabled: Boolean(p) }, turler.map((t) => h('option', { value: t.id, selected: (p ? p.turId : varsayilanTurId) === t.id }, t.ad)));
    const ad = h('input', { type: 'text', autocomplete: 'off', value: p ? p.ad : '' });
    const ortam = ortamSecimi(ortamlar, p ? p.ortamId : null);
    const alanKutusu = h('div', {});
    let girdiler = [];
    const alanlariCiz = () => {
      const tur = turler.find((t) => t.id === turSecimi.value);
      girdiler = [];
      alanKutusu.replaceChildren();
      for (const a of (tur && tur.alanlar) || []) {
        const mevcut = p ? p.degerler[a.ad] : undefined;
        if (a.hassas) {
          const pa = parolaAlani(a.etiket, {
            kayitli: mevcut && typeof mevcut === 'object' ? mevcut : null,
            gosterFn: p ? async () => (await api('/platform/test-verisi-profili/goster', { govde: { id: p.id, alan: a.ad } })).deger : null
          });
          girdiler.push({ alan: a, girdi: pa.girdi, hassas: true });
          alanKutusu.append(pa.kapsayici);
          continue;
        }
        let girdi;
        if (a.tip === 'mantiksal') {
          girdi = h('input', { type: 'checkbox', id: yeniKimlik('tv'), checked: mevcut === true });
          alanKutusu.append(h('div', { class: 'alan' }, h('label', { class: 'secenek', for: girdi.id }, girdi, a.etiket)));
        } else {
          const tip = { sayi: 'number', tarih: 'date', eposta: 'email' }[a.tip] || 'text';
          girdi = h('input', { type: tip, autocomplete: 'off', value: mevcut === undefined || mevcut === null ? '' : String(mevcut) });
          alanKutusu.append(alan(a.etiket, girdi));
        }
        girdiler.push({ alan: a, girdi, hassas: false });
      }
      if (!girdiler.length) alanKutusu.append(h('p', { class: 'soluk' }, 'Bu türde alan yok.'));
    };
    turSecimi.addEventListener('change', alanlariCiz);
    alanlariCiz();
    const mesaj = mesajKutusu();
    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Kaydet');
    const form = formPaneli(p ? `Test verisi profilini düzenle: ${p.ad}` : 'Yeni test verisi profili', mesaj.kutu,
      alan('Tür', turSecimi), alan('Profil adı', ad, { zorunlu: true }), alan('Ortam', ortam), alanKutusu,
      h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', onclick: () => profilFormAlani.replaceChildren() }, 'Vazgeç')));
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      mesaj.temizle();
      alanHatasi(ad, '');
      if (!ad.value.trim()) { alanHatasi(ad, 'Profil adı boş olamaz.'); ad.focus(); return; }
      const degerler = {};
      for (const g of girdiler) {
        if (g.hassas) { if (g.girdi.value) degerler[g.alan.ad] = g.girdi.value; continue; }
        if (g.alan.tip === 'mantiksal') degerler[g.alan.ad] = g.girdi.checked;
        else if (g.alan.tip === 'sayi') degerler[g.alan.ad] = g.girdi.value === '' ? null : Number(g.girdi.value);
        else degerler[g.alan.ad] = g.girdi.value;
      }
      try {
        await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/test-verisi-profili/kaydet', {
          govde: { id: p ? p.id : undefined, projeId: proje.id, turId: turSecimi.value, ad: ad.value.trim(), degerler, ortamId: ortam.value || null }
        }));
        bildir('Test verisi profili kaydedildi.');
        yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    formuGoster(profilFormAlani, form);
  };

  const turSatirlari = turler.map((t) => kayitSatiri(t.ad,
    `${t.alanlar.length} alan: ${t.alanlar.map((a) => `${a.etiket}${a.hassas ? ' (hassas)' : ''}`).join(', ')}`,
    [duzenleDugmesi(t.ad, () => turFormu(t)),
      onayliDugme('Sil', 'Tür ve profilleri silinsin', async () => {
        await api('/platform/test-verisi-turu/sil', { govde: { id: t.id } }); bildir('Test verisi türü silindi.'); yenile();
      }, { kucuk: true, etiket: `${t.ad}: sil (bu türün tüm profilleri de silinir)` })], 'veri'));
  const turAdi = (id) => (turler.find((t) => t.id === id) || { ad: '?' }).ad;
  const profilSatirlari = profiller.map((p) => kayitSatiri(p.ad,
    [`Tür: ${turAdi(p.turId)} · ${ortamAdiBul(ortamlar, p.ortamId)} · `, Object.entries(p.degerler).map(([k, v]) => `${k}: ${v && typeof v === 'object' ? (v.dolu ? v.maske : '—') : v === null || v === '' ? '—' : String(v)}`).join(', ')],
    [duzenleDugmesi(p.ad, () => profilFormu(p)), gecmisDugmesi(p.ad, () => gecmisGoster('test_verisi_profili', p.id, p.ad, baglam)),
      silDugmesi(p.ad, async () => { await api('/platform/test-verisi-profili/sil', { govde: { id: p.id } }); bildir('Test verisi profili silindi.'); yenile(); })], 'dosya'));

  govde.replaceChildren(
    bolumBasligi('Türler', turler.length, h('button', { type: 'button', class: 'birincil', onclick: () => turFormu(null) }, '+ Tür ekle')),
    turFormAlani,
    kayitListesi(turSatirlari, 'Henüz test verisi türü yok.', 'veri'),
    bolumBasligi('Profiller', profiller.length,
      h('button', { type: 'button', class: 'birincil', disabled: !turler.length, title: turler.length ? null : 'Önce bir tür ekleyin.', onclick: () => profilFormu(null, turler[0] && turler[0].id) }, '+ Profil ekle')),
    profilFormAlani,
    kayitListesi(profilSatirlari, turler.length ? 'Henüz test verisi profili yok.' : 'Profil eklemek için önce bir tür tanımlayın.', 'dosya'));
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
  const [{ klasor, dosyalar }, aktarimDurumu, tahmin] = await Promise.all([
    api('/platform/yedek/otomatik-liste'),
    api('/platform/aktarim/durum').catch(() => ({ adaptorler: [] })),
    api('/platform/yedek/tahmin').catch(() => null)
  ]);

  // Dışa aktar (ortak form — "Çalışma alanını kapat" > "Dışa aktar ve kapat" da bunu kullanır)
  const { form: disaForm } = disaAktarmaFormu(tahmin);

  // İçe aktar
  const iceAlani = h('div', {});
  const iceBaslat = h('button', { type: 'button', class: 'birincil' }, 'Yedek dosyası seç…');
  const iceKart = h('div', { class: 'kart' }, h('h3', {}, ikon('yukle'), 'İçe aktar'),
    h('p', { class: 'soluk' }, 'Bir yedekteki kayıtları bu bilgisayardakilerle karşılaştırır; neyin ekleneceğini ve değişeceğini seçersiniz. Bu bilgisayardaki kayıtlar silinmez.'),
    h('div', { class: 'dugmeler' }, iceBaslat));
  // Eski proje dosyalarından yeniden aktar (eski dosya klasörü — ör. veri/eski-dosyalar/<zaman> — varsa)
  const aktarimAlani = h('div', {});
  const aktarilabilir = (aktarimDurumu.adaptorler || []).find((a) => a.dosyalarVar);
  let aktarimKart = null;
  if (aktarilabilir) {
    const baslat = h('button', { type: 'button', class: 'birincil' }, 'Önizle ve aktar…');
    aktarimKart = h('div', { class: 'kart' }, h('h3', {}, ikon('klasor'), 'Eski proje dosyalarından yeniden aktar'),
      h('p', { class: 'soluk' }, `${aktarilabilir.etiket}. Kaynak anahtarına göre birleştirir: dosyada değişen kayıtlar güncellenir, yeni kayıtlar eklenir; önce önizleme gösterilir. Dosyalardan veritabanına otomatik aktarım yapılmaz.`),
      h('p', { class: 'soluk kucuk' }, 'Klasör: ', h('code', {}, aktarilabilir.kaynakKlasoru || '')),
      h('p', { class: 'soluk kucuk' }, aktarilabilir.sonAktarim ? `Son aktarım: ${tarihMetni(aktarilabilir.sonAktarim)}` : 'Bu proje henüz dosyalardan aktarılmadı.'),
      h('div', { class: 'dugmeler' }, baslat));
    baslat.addEventListener('click', () => {
      for (const k of [aktarimKart, ...digerKartlar(), iceKart]) k.hidden = true;
      aktarimAkisi(aktarimAlani, {
        mod: 'ayarlar', adaptor: aktarilabilir,
        bitti: async () => { await baglam.projeleriYenile(); yenile(); },
        vazgec: () => { aktarimAlani.replaceChildren(); for (const k of [aktarimKart, ...digerKartlar(), iceKart]) k.hidden = false; baslat.focus(); }
      });
    });
  }
  const digerKartlar = () => [disaForm, otomatikKart];
  iceBaslat.addEventListener('click', () => {
    iceKart.hidden = true;
    for (const k of digerKartlar()) k.hidden = true;
    if (aktarimKart) aktarimKart.hidden = true;
    iceAktarmaAkisi(iceAlani, {
      mod: 'ayarlar',
      bitti: async () => { await baglam.projeleriYenile(); yenile(); },
      vazgec: () => { iceAlani.replaceChildren(); iceKart.hidden = false; for (const k of digerKartlar()) k.hidden = false; if (aktarimKart) aktarimKart.hidden = false; iceBaslat.focus(); }
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
    h('p', { class: 'soluk' }, 'Sunucu açıkken ve kasa açıkken günde bir yerel yedek alınır; en yeni 30 otomatik yedek saklanır.'),
    h('p', { class: 'soluk kucuk' }, 'Klasör: ', h('code', {}, klasor)),
    liste);
  govde.replaceChildren(disaForm, iceKart, iceAlani, ...(aktarimKart ? [aktarimKart, aktarimAlani] : []), otomatikKart);
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
        : [h('code', {}, d.eskiYol), ' ', rozet([ikon('uyari'), 'düz metin yol'], 'uyari', { title: 'Eski düz metin dosya yolu: dosyayı yükleyin ya da Güvenlik > "Açık dosyaları şifreli depoya taşı"yı kullanın.' })];
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

async function guvenlik(govde, baglam) {
  const ayar = await api('/platform/guvenlik');
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

  // Açık (düz metin) dosyaları şifreli depoya taşıma — TEK SEFERLİK, önce önizleme.
  const tasimaKarti = acikDosyaTasimaKarti(baglam);

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
    tasimaKarti,
    form);
}

/**
 * "Açık dosyaları şifreli depoya taşı": proje adaptörünün bildiği düz metin dosyalar (ör. tests/fixtures/**.xlsx ve
 * eski dosya yedeklerindeki kopyaları) listelenir; kullanıcı seçip onaylayınca dosyalar şifreli depoya alınır, senaryo
 * ve ekran ayarlarındaki yollar referansa çevrilir, şifreli kopya doğrulanınca düz metin ezilip silinir.
 */
function acikDosyaTasimaKarti(baglam) {
  const proje = baglam.durum.proje;
  const govde = h('div', {});
  const onizle = h('button', { type: 'button' }, ikon('ara'), 'Dosyaları listele');
  const kart = h('section', { class: 'kart acik-dosya-karti' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('dosya'), 'Açık dosyaları şifreli depoya taşı'), h('div', { class: 'sag' }, onizle)),
    h('p', { class: 'soluk' }, 'Eski proje düzeninde senaryoların kullandığı dosyalar (ör. çoklu sorgu Excel\'leri) diskte düz metin durur. Bu işlem onları şifreli depoya alır, senaryo ve ekran ayarlarındaki yolları şifreli dosyaya bağlar ve şifreli kopya doğrulanınca düz metin dosyaları ezip siler. Önce liste gösterilir; hiçbir şey onayınız olmadan değişmez.'),
    govde);
  onizle.addEventListener('click', async () => {
    try {
      const { dosyalar } = await mesgulIken(onizle, 'Listeleniyor…', () => api('/platform/acik-dosyalar/onizle', { govde: { projeId: proje.id } }));
      listeCiz(dosyalar);
    } catch (hata) { if (hata.durum !== 423) yerlestirHata(hata); }
  });
  function yerlestirHata(hata) { govde.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); }
  function listeCiz(dosyalar) {
    if (!dosyalar.length) {
      govde.replaceChildren(h('div', { class: 'not-kutusu basari' }, h('p', {}, 'Düz metin dosya bulunamadı: taşınacak bir şey yok.')));
      return;
    }
    const secim = new Set(dosyalar.map((d) => d.kimlik));
    const tasi = h('button', { type: 'button', class: 'tehlike' }, ikon('kilit'), 'Şifreli depoya taşı ve düz metinleri sil');
    const ozet = h('span', { class: 'kucuk soluk' });
    const guncelle = () => { ozet.textContent = `${secim.size} / ${dosyalar.length} dosya seçili`; tasi.disabled = !secim.size; };
    const satirlar = dosyalar.map((d) => {
      const kutu = h('input', { type: 'checkbox', checked: true, 'aria-label': `Seç: ${d.goreliYol} (${d.konum})` });
      kutu.addEventListener('change', () => { if (kutu.checked) secim.add(d.kimlik); else secim.delete(d.kimlik); guncelle(); });
      return h('li', {}, h('label', { class: 'acik-dosya-satiri' }, kutu,
        h('span', { class: 'acik-dosya-ana' }, h('code', {}, d.goreliYol),
          h('small', { class: 'soluk' }, `${d.konum === 'proje' ? 'proje klasörü' : d.konum.replace('eski-dosyalar/', 'eski dosya yedeği ')} · ${boyutMetni(d.boyut)}`)),
        d.sifreliKopyaVar ? rozet([ikon('kilit'), 'şifreli kopyası var'], 'basari') : rozet('yalnızca düz metin', 'uyari')));
    });
    const onayAlani = h('div', {});
    tasi.addEventListener('click', () => {
      const secilenler = dosyalar.filter((d) => secim.has(d.kimlik));
      const evet = h('button', { type: 'button', class: 'tehlike' }, ikon('cop'), `Evet, ${secilenler.length} dosyayı taşı`);
      const vazgec = h('button', { type: 'button', class: 'hayalet', onclick: () => onayAlani.replaceChildren() }, 'Vazgeç');
      onayAlani.replaceChildren(h('div', { class: 'not-kutusu uyari', role: 'alertdialog', 'aria-label': 'Taşımayı onayla' },
        h('p', {}, h('b', {}, 'Düz metin dosyalar silinecek. '), 'Her dosya önce şifreli depoya alınır ve şifreli kopyası doğrulanır; doğrulanamayan dosya silinmez. Silme en iyi çabayla yapılır (dosya ezilip kaldırılır; SSD\'lerde eski bloklar fiziksel olarak kalabilir). Yedeğiniz yoksa önce Yedekleme\'den şifreli yedek alın.'),
        h('div', { class: 'dugmeler' }, vazgec, evet)));
      evet.focus();
      evet.addEventListener('click', async () => {
        try {
          const { sonuc } = await mesgulIken(evet, 'Taşınıyor…', () => api('/platform/acik-dosyalar/tasi', { govde: { projeId: proje.id, kimlikler: [...secim], onay: true } }));
          govde.replaceChildren(h('div', { class: `not-kutusu ${sonuc.atlanan.length ? 'uyari' : 'basari'}` },
            h('p', {}, h('b', {}, `${sonuc.silinen} düz metin dosya silindi. `),
              `${sonuc.aktarilan} dosya şifreli depoya alındı${sonuc.zatenVardi ? `, ${sonuc.zatenVardi} dosyanın şifreli kopyası zaten vardı` : ''}; ${sonuc.referans.senaryo} senaryo ve ${sonuc.referans.ekran} ekran ayarı şifreli dosyaya bağlandı.`),
            sonuc.atlanan.length ? h('ul', {}, sonuc.atlanan.map((a) => h('li', {}, h('code', {}, a.goreliYol), ` (${a.konum}): ${a.neden}`))) : null));
          bildir('Açık dosyalar şifreli depoya taşındı.', 'basari');
        } catch (hata) { if (hata.durum !== 423) yerlestirHata(hata); }
      });
    });
    govde.replaceChildren(
      h('ul', { class: 'acik-dosya-listesi' }, satirlar),
      h('div', { class: 'dugmeler' }, ozet, tasi),
      onayAlani);
    guncelle();
  }
  return kart;
}
