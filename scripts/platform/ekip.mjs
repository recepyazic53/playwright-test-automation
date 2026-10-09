// EKİP (Ayarlar > Ekip): dosyayı (çalışma alanının kasasını) açabilecek kişiler ve rolleri. Liste kasada şifreli durur ve ortak yayınla
// (Ekip paylaşımı) diğer bilgisayarlara gider. Kişiye özel parola YOKTUR: giriş = kullanıcı adı + kasanın parolası; liste "listede
// olmayanı içeri almamak" ve "Ekip ayarını yalnız Admin'e göstermek" içindir, kimlik doğrulaması değildir.
//
//   ekipUyeleriOku(vt)                     üyeler [{ ad, rol }] (boş = ekip kullanılmıyor; herkes Admin sayılır)
//   girisDenetle(vt, ad)            kasa açılırken: liste boşsa ad verilmişse o kişi ilk Admin olur; liste doluysa ad listede olmalı
//   ekipUyeleriKaydet(vt, uyeler, ben)     Admin kaydeder: adlar tekil, en az bir Admin, kaydeden kendini silemez / Admin'likten çıkaramaz
// NOT: import.meta KULLANILMAZ.
import { ayarGetir, ayarYaz, DepoHatasi } from './veritabani/depo.mjs';

export const EKIP_AYARI = 'ekip-uyeleri';
export const EKIP_ROLLERI = Object.freeze(['admin', 'kullanici']);
export const EKIP_EN_COK = 200;

/** @typedef {{ ad: string; rol: 'admin' | 'kullanici' }} EkipUyesi */

/** Karşılaştırma için ad (büyük / küçük harf ve baştaki / sondaki boşluk yok sayılır). @param {string} ad */
const anahtar = (ad) => ad.trim().toLocaleLowerCase('tr');

/** @param {unknown} ad @returns {string} */
function adTemizle(ad) {
  const t = typeof ad === 'string' ? ad.trim() : '';
  if (!t) throw new DepoHatasi('Kullanıcı adı boş olamaz.');
  if (t.length > 60 || /[\u0000-\u001f@]/.test(t)) throw new DepoHatasi(`"${t.slice(0, 60)}": kullanıcı adı en fazla 60 karakter olmalı ve "@" içermemelidir.`);
  return t;
}

/** Kayıtlı ekip (kasa kilitli / okunamazsa boş). @param {import('./veritabani/baglanti.mjs').Veritabani} vt @returns {EkipUyesi[]} */
export function ekipUyeleriOku(vt) {
  try {
    const a = /** @type {{ uyeler?: unknown } | null} */ (ayarGetir(vt, EKIP_AYARI));
    const dizi = Array.isArray(a?.uyeler) ? a.uyeler : [];
    return dizi
      .filter((/** @type {any} */ u) => u && typeof u.ad === 'string' && u.ad.trim())
      .map((/** @type {any} */ u) => ({ ad: String(u.ad).trim(), rol: u.rol === 'admin' ? 'admin' : 'kullanici' }));
  } catch {
    return [];
  }
}

/**
 * Kasa açılırken kullanıcı adını denetler. Liste boşsa: ad verilmişse o kişi ilk Admin olarak eklenir; ad yoksa ekip kullanılmıyor
 * (Admin sayılır). Liste doluysa ad listede olmalı (değilse null: "Yetkili değilsiniz").
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {unknown} ad @returns {EkipUyesi | null}
 */
export function girisDenetle(vt, ad) {
  const t = typeof ad === 'string' ? ad.trim() : '';
  const uyeler = ekipUyeleriOku(vt);
  if (!uyeler.length) {
    if (!t) return { ad: '', rol: 'admin' };
    const ilk = /** @type {EkipUyesi} */ ({ ad: adTemizle(t), rol: 'admin' });
    ayarYaz(vt, EKIP_AYARI, { uyeler: [ilk] });
    return ilk;
  }
  if (!t) return null;
  return uyeler.find((u) => anahtar(u.ad) === anahtar(t)) ?? null;
}

/**
 * Ekibi kaydeder (yalnız Admin; uç denetler). Adlar tekil (büyük / küçük harf yok sayılır), roller admin | kullanici, en az bir Admin.
 * Kaydeden (ben) listede Admin olarak kalmalı. ben boşsa (ekip henüz yok) kendi kısıtı yok.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {unknown} uyeler @param {string} ben @returns {EkipUyesi[]}
 */
export function ekipUyeleriKaydet(vt, uyeler, ben) {
  if (!Array.isArray(uyeler)) throw new DepoHatasi('"uyeler" bir dizi olmalıdır.');
  if (uyeler.length > EKIP_EN_COK) throw new DepoHatasi(`Ekipte en çok ${EKIP_EN_COK} kişi olabilir.`);
  /** @type {EkipUyesi[]} */
  const temiz = [];
  const gorulen = new Set();
  for (const u of uyeler) {
    const ad = adTemizle(/** @type {any} */ (u)?.ad);
    const rol = /** @type {any} */ (u)?.rol;
    if (!EKIP_ROLLERI.includes(rol)) throw new DepoHatasi(`"${ad}" için rol Admin ya da Kullanıcı olmalıdır.`);
    if (gorulen.has(anahtar(ad))) throw new DepoHatasi(`"${ad}" listede birden fazla kez var.`);
    gorulen.add(anahtar(ad));
    temiz.push({ ad, rol });
  }
  if (temiz.length && !temiz.some((u) => u.rol === 'admin')) throw new DepoHatasi('Ekipte en az bir Admin olmalıdır.');
  if (ben && temiz.length && !temiz.some((u) => anahtar(u.ad) === anahtar(ben) && u.rol === 'admin')) {
    throw new DepoHatasi('Kendinizi listeden silemez ya da Admin rolünden çıkaramazsınız.');
  }
  ayarYaz(vt, EKIP_AYARI, { uyeler: temiz });
  return temiz;
}
