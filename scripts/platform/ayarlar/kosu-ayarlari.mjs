// KOŞU VE SAKLAMA AYARLARI (Ayarlar > Koşu, Ayarlar > Yedekleme) — kullanıcının verdiği kararlar. Kasada (ayarlar tablosu,
// anahtar "kosu") şifreli saklanır; verilmeyen ayar varsayılanını kullanır. Nöbetçi koşuyu başlatırken ayarları alt sürece
// ortam değişkeni olarak verir (kosuOrtamDegiskenleri); playwright.config.ts / playwright.model.config.ts ve model koşucusu
// bu değişkenleri okur (yoksa aynı varsayılanlar). Servis ayarları (zaman aşımı, varsayılan tarih biçimi) sunucuda kullanılır.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const KOSU_AYAR_ANAHTARI = 'kosu';
const KAYIT_SECENEKLERI = /** @type {const} */ (['her', 'yalnizHata', 'kapali']);

/**
 * Tanımlar: arayüz bu listeden formu çizer (bölüm: ayar sayfası, grup, etiket, açıklama, tür, sınırlar); sunucu doğrular.
 * env: alt sürece verilen ortam değişkeni (yoksa yalnız sunucuda kullanılır). carpan: ortam değişkenine yazılırken çarpan.
 * @type {ReadonlyArray<{ anahtar: string; bolum?: 'kosu' | 'yedekleme'; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin';
 *   varsayilan: string | number; secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number }>}
 */
export const KOSU_AYAR_TANIMLARI = Object.freeze([
  { anahtar: 'video', grup: 'Kayıt', etiket: 'Video', aciklama: 'Nöbetçi\'den başlatılan koşularda video kaydı.', tur: 'secim', varsayilan: 'her',
    secenekler: [['her', 'Her koşuda'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_VIDEO' },
  { anahtar: 'ekranGoruntusu', grup: 'Kayıt', etiket: 'Ekran görüntüsü (test sonu)', aciklama: 'Testin sonunda alınan ekran görüntüsü. Adım görüntüleri bundan bağımsızdır.',
    tur: 'secim', varsayilan: 'yalnizHata', secenekler: [['her', 'Her testte'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_EKRAN_GORUNTUSU' },
  { anahtar: 'iz', grup: 'Kayıt', etiket: 'İz (trace)', aciklama: 'Hata incelemesi için Playwright izi (ağ, DOM, adımlar).', tur: 'secim', varsayilan: 'yalnizHata',
    secenekler: [['her', 'Her testte'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_IZ' },
  { anahtar: 'yenidenDeneme', grup: 'Koşu', etiket: 'Yeniden deneme', aciklama: 'Kalan test kaç kez yeniden denensin (0: denenmez).', tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3, env: 'NOBETCI_YENIDEN_DENEME' },
  { anahtar: 'kosuSureLimitiDk', grup: 'Koşu', etiket: 'Koşu süre limiti', aciklama: 'Tek bir koşu bu süreyi aşarsa durdurulur.', tur: 'sayi', varsayilan: 10, enAz: 1, enCok: 120, birim: 'dk' },
  { anahtar: 'alanBeklemeSn', grup: 'Bekleme süreleri', etiket: 'Alan işlemi', aciklama: 'Alan doldurulduktan sonraki tıklama / sorgu (ör. kimlik sorgula) en çok bu kadar beklenir.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ALAN_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'zorlaIsaretlemeSn', grup: 'Bekleme süreleri', etiket: 'Zorla işaretlenecek seçenek', aciklama: 'Gizli radyo / onay kutusunun sayfada belirmesi için en çok bekleme.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ZORLA_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'servisZamanAsimiSn', grup: 'Servisler', etiket: 'Servis isteği zaman aşımı', aciklama: 'Servis yanıtı bu sürede gelmezse istek kesilir.', tur: 'sayi', varsayilan: 60, enAz: 5, enCok: 600, birim: 'sn' },
  { anahtar: 'tarihBicimi', grup: 'Servisler', etiket: 'Varsayılan tarih biçimi', aciklama: 'Biçim verilmemiş tarih kurallarında ve ${tarih:…} ifadelerinde kullanılır. yyyy yıl, MM ay, dd gün, HH saat, mm dakika, ss saniye; sabitler tek tırnakta.',
    tur: 'metin', varsayilan: "yyyy-MM-dd'T'HH:mm:ss" },
  { anahtar: 'otomatikYedekSayisi', bolum: 'yedekleme', grup: 'Otomatik yedek', etiket: 'Saklanacak otomatik yedek', aciklama: 'Günlük otomatik yedeklerden en yeni bu kadarı tutulur; eskiler silinir.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 365, birim: 'adet' },
  { anahtar: 'sonucSaklamaGun', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Koşu sonuçlarını sakla', aciklama: 'Bu süreden eski ekran ve servis koşu sonuçları (adımlar, ekran görüntüleri, videolar dahil) günlük temizlikte silinir. 0: süresiz (hiç silinmez).',
    tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3650, birim: 'gün' }
]);

/** @typedef {{ video: string; ekranGoruntusu: string; iz: string; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
 *   zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; tarihBicimi: string; otomatikYedekSayisi: number; sonucSaklamaGun: number }} KosuAyarlari */

/** @returns {KosuAyarlari} */
export const varsayilanKosuAyarlari = () => /** @type {KosuAyarlari} */ (Object.fromEntries(KOSU_AYAR_TANIMLARI.map((t) => [t.anahtar, t.varsayilan])));

/**
 * Tek değeri doğrular; geçersizse hata (kaydederken) — okurken geçersiz değer varsayılana düşer.
 * @param {(typeof KOSU_AYAR_TANIMLARI)[number]} t @param {unknown} v
 */
function degerDogrula(t, v) {
  if (t.tur === 'secim') {
    if (!t.secenekler?.some(([d]) => d === v)) throw new DepoHatasi(`"${t.etiket}" için geçersiz seçim.`);
    return String(v);
  }
  if (t.tur === 'sayi') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < /** @type {number} */ (t.enAz) || n > /** @type {number} */ (t.enCok)) {
      throw new DepoHatasi(`"${t.etiket}" ${t.enAz}–${t.enCok}${t.birim ? ` ${t.birim}` : ''} arasında bir tam sayı olmalıdır.`);
    }
    return n;
  }
  const m = typeof v === 'string' ? v.trim() : '';
  if (!m || m.length > 60 || /[{}$\u0000-\u001f]/.test(m) || !/yyyy|MM|dd|HH|mm|ss/.test(m)) throw new DepoHatasi(`"${t.etiket}" geçersiz (ör. yyyy-MM-dd'T'HH:mm:ss).`);
  return m;
}

/** Kayıtlı ayarlar + varsayılanlar (kasa açık olmalı; okunamazsa varsayılanlar). @param {Veritabani} vt @returns {KosuAyarlari} */
export function kosuAyarlariniOku(vt) {
  const sonuc = varsayilanKosuAyarlari();
  let kayit;
  try { kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, KOSU_AYAR_ANAHTARI)); } catch { kayit = undefined; }
  for (const t of KOSU_AYAR_TANIMLARI) {
    if (kayit?.[t.anahtar] === undefined) continue;
    try { /** @type {any} */ (sonuc)[t.anahtar] = degerDogrula(t, kayit[t.anahtar]); } catch { /* varsayılan kalır */ }
  }
  return sonuc;
}

/** Verilen ayarları doğrulayıp kaydeder (verilmeyenler korunur). @param {Veritabani} vt @param {unknown} girdi @returns {KosuAyarlari} */
export function kosuAyarlariniKaydet(vt, girdi) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Ayarlar bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const mevcut = /** @type {Record<string, unknown>} */ ((() => { try { return ayarGetir(vt, KOSU_AYAR_ANAHTARI); } catch { return undefined; } })() ?? {});
  /** @type {Record<string, unknown>} */
  const yeni = { ...mevcut };
  for (const t of KOSU_AYAR_TANIMLARI) if (g[t.anahtar] !== undefined) yeni[t.anahtar] = degerDogrula(t, g[t.anahtar]);
  ayarYaz(vt, KOSU_AYAR_ANAHTARI, yeni);
  return kosuAyarlariniOku(vt);
}

/** Alt sürece verilecek ortam değişkenleri. @param {KosuAyarlari} a @returns {Record<string, string>} */
export function kosuOrtamDegiskenleri(a) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const t of KOSU_AYAR_TANIMLARI) {
    if (!t.env) continue;
    const v = /** @type {any} */ (a)[t.anahtar];
    env[t.env] = String(typeof v === 'number' && t.carpan ? v * t.carpan : v);
  }
  return env;
}
