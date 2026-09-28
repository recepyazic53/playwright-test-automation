// Ekranlar > Ortak akışlar'da her ortamın GİRİŞİ ("Giriş (<ortam>)"): giriş bir ortak akıştır ama tarifi ortam başına
// Ayarlar > Giriş profilleri > Giriş tarifi'nde durur. Kartta tek satır özet (adım sayısı, iki aşamalı doğrulama, bağlam seçimi)
// görünür; adımların okunur listesi (giris-ozeti.mjs) tarif formundadır;
// "Düzenle" ilgili ortamın tarif formunu doğrudan açar (#/ayarlar/giris/tarif/<ortamId>). Gizli değer yoktur.
import { api, h, ikon, rozet } from './ortak.js';
import { girisAdimlariOzeti, tarifFormuAdresi } from './giris-ozeti.mjs';
import { girisiDeneDugmesi } from './giris-denemesi.js';

/** Ortam başına giriş tarifleri (yüklenemezse boş liste; Ekranlar sayfası yine açılır). @param {{ id: string }} proje */
export async function girisAkislariniAl(proje) {
  try {
    const v = await api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(proje.id)}`);
    return Array.isArray(v.ortamlar) ? v.ortamlar : [];
  } catch (hata) {
    if (hata && hata.durum === 423) throw hata;
    return [];
  }
}

const baslik = (o) => `Giriş (${o.ortamAd})`;

/** Sol gezinmedeki "Ortak akışlar" grubunun giriş kalemi. */
export function girisBaglantisi(o) {
  return h('a', { href: tarifFormuAdresi(o.ortamId), class: 'giris-akisi-baglantisi', title: `${baslik(o)} — Ayarlar > Giriş profilleri'nde düzenlenir` },
    ikon('anahtar'), h('span', { class: 'nav-metni' }, baslik(o)),
    o.tarif ? null : h('span', { class: 'nav-etiketi' }, 'tanımlı değil'));
}

const IKINCI_ADIM = { totp: 'Authenticator kodu', sms: 'SMS kodu' };

/**
 * Giriş tarifinin tek satır özeti: "N adım · <iki aşamalı doğrulama> · <bağlam seçimi>" (adım listesi değil).
 * @param {any} tarif @returns {string}
 */
export function girisOzetSatiri(tarif) {
  if (!tarif) return '';
  const adim = girisAdimlariOzeti(tarif).filter((x) => x.bolum === 'giris').length;
  const ikinci = tarif.ikinciAdim && tarif.ikinciAdim.tur && tarif.ikinciAdim.tur !== 'yok'
    ? `${IKINCI_ADIM[tarif.ikinciAdim.tur] || 'doğrulama kodu'}${tarif.ikinciAdim.tur === 'sms' && tarif.ikinciAdim.smsKipi === 'elle' ? ' (elle)' : ''}`
    : 'iki aşamalı doğrulama yok';
  const b = tarif.baglamDegistirme;
  const baglam = b && Array.isArray(b.adimlar) && b.adimlar.length ? `bağlam seçimi: ${b.baglamTuru || 'var'}` : 'bağlam seçimi yok';
  return `${adim} adım · ${ikinci} · ${baglam}`;
}

/**
 * Ortak akışlar bölümündeki giriş kartı: ekran kartıyla AYNI düzen — başlık + "giriş tarifi" rozeti, ortam adı (ikincil),
 * tek satır özet, kullanım, altta "Girişi dene" (yalnız giriş; giris-denemesi.js) ve Düzenle. Adımlar burada listelenmez; Düzenle'de (tarif formu) görünür.
 */
export function girisKarti(o, projeId) {
  const duzenle = tarifFormuAdresi(o.ortamId);
  return h('article', { class: 'ekran-karti ortak-akis-karti giris-akisi-karti', 'data-ortam': o.ortamId, 'aria-label': baslik(o) },
    h('div', { class: 'ekran-karti-ust' },
      h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('anahtar')),
      h('div', { class: 'ekran-karti-ad' }, h('h3', {}, h('a', { href: duzenle, title: baslik(o) }, baslik(o))), h('code', {}, `ortam: ${o.ortamAd}`)),
      h('div', { class: 'ekran-karti-rozetler' }, o.tarif ? rozet('giriş tarifi', 'vurgu') : rozet('tanımlı değil', 'uyari'))),
    h('p', { class: 'ortak-akis-ozeti' }, o.tarif ? girisOzetSatiri(o.tarif) : 'Bu ortamda giriş tarifi yok; testler giriş yapamaz.'),
    o.tarif ? h('p', { class: 'ortak-akis-kullanimi kucuk soluk' }, `${o.ortamAd} ortamındaki her koşuda kullanılır`) : null,
    o.hatalar && o.hatalar.length ? h('p', { class: 'kucuk hata-metni' }, `Tarif geçersiz: ${o.hatalar.join(' ')}`) : null,
    h('div', { class: 'ekran-karti-alt' },
      o.tarif ? girisiDeneDugmesi(o, projeId) : null,
      (o.tarif ? h('a', { class: 'dugme kucuk-dugme', href: duzenle, 'aria-label': `${baslik(o)}: düzenle` }, ikon('duzenle'), 'Düzenle')
        : h('a', { class: 'dugme kucuk-dugme', href: duzenle, 'aria-label': `${baslik(o)}: giriş akışı ekle` }, ikon('arti'), 'Giriş akışı ekle'))));
}
