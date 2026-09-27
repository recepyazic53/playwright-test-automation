// Ekranlar > Ortak akışlar'da her ortamın GİRİŞİ ("Giriş (<ortam>)"): giriş bir ortak akıştır ama tarifi ortam başına
// Ayarlar > Giriş profilleri > Giriş tarifi'nde durur. Burada adımları okunur dille listelenir (giris-ozeti.mjs);
// "Düzenle" ilgili ortamın tarif formunu doğrudan açar (#/ayarlar/giris/tarif/<ortamId>). Gizli değer yoktur.
import { api, h, ikon, rozet } from './ortak.js';
import { girisAdimlariOzeti, tarifFormuAdresi } from './giris-ozeti.mjs';

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
    o.tarif ? null : h('span', { class: 'nav-etiketi' }, 'tanımsız'));
}

/** Ortak akışlar bölümündeki giriş kartı: okunur adımlar + Düzenle. */
export function girisKarti(o) {
  const adimlar = girisAdimlariOzeti(o.tarif);
  return h('article', { class: 'kart ortak-akis-karti giris-akisi-karti', 'data-ortam': o.ortamId, 'aria-label': baslik(o) },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), baslik(o)),
      o.tarif ? rozet('giriş tarifi', 'vurgu') : rozet('tanımlı değil', 'uyari')),
    o.tarif
      ? h('ol', { class: 'giris-ozet-adimlari kucuk' }, adimlar.map((x) => h('li', { class: x.bolum !== 'giris' ? `giris-ozet-${x.bolum}` : null }, x.metin)))
      : h('p', { class: 'kucuk soluk' }, 'Bu ortamda giriş tarifi yok; testler giriş yapamaz.'),
    o.hatalar && o.hatalar.length ? h('p', { class: 'kucuk hata-metni' }, `Tarif geçersiz: ${o.hatalar.join(' ')}`) : null,
    h('div', { class: 'dugmeler' },
      h('a', { class: 'dugme kucuk-dugme', href: tarifFormuAdresi(o.ortamId), 'aria-label': `${baslik(o)}: düzenle` }, ikon('duzenle'), o.tarif ? 'Düzenle' : 'Tanımla')));
}
