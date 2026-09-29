// KURTARMA KURALLARI (Ayarlar > Proje ve ortamlar > "Kurtarma kuralları") — proje düzeyinde, YALNIZ kullanıcının tanımladığı
// kurallar: koşu sırasında bilinen geçici bir sorun görülünce (ekranda "oturum bitti" metni, serviste 503, yanıt alanında geçici hata
// kodu…) ne yapılacağı. Kodda hazır kural YOKTUR; tek istisna bugünkü ürün davranışının kendisidir: "Yetki hatasında (401 / 403)
// token'ı yenile, bir kez tekrar dene" (HAZIR_YETKI) — listede silinemeyen ama kapatılabilen satır olarak görünür; açık/kapalı seçimi
// kullanıcının ayarıdır (varsayılan açık = bugünkü davranış).
//
// KURAL MODELİ (tanim_json, kasada şifreli; ad düz metin — içe aktarmada doğal anahtar):
//   { tur: 'ekran' | 'servis', acik, kosul, kapsam: { ogeler: null | [...], ortamlar: null | [ortamId] }, ...türe özgü }
//   Ekran: kosul { tur: 'metin', metin } | { tur: 'oge', secici } | { tur: 'oge', rol, ad } | { tur: 'girisSayfasi' } | { tur: 'pencere', metin }
//          eylem { tur: 'yenile' | 'tikla' (secici) | 'girisYenile' | 'bekle' (sn) | 'pencereKapat' (secici?) }
//          sonra { tur: 'tekrar', kez } | { tur: 'devam' } | { tur: 'bastan' }; kapsam.ogeler: null (tüm ekranlar) | [ekranId]
//   Servis: kosul { tur: 'alan', yol, islec: 'esit' | 'icerir', deger } | { tur: 'http', kodlar } | { tur: 'fault', kod?, mesaj? } | { tur: 'baglanti' }
//          suzgec: null | { parametre, deger } (kural yalnız istekte bu parametre bu değerdeyken uygulanır)
//          yapilacak { bekleSn, tokenYenile, tekrarGonder, enCokDeneme, artanBekleme }; kapsam.ogeler: null | [{ servisId, metot: null | ad }]
// ÇİFT KAYIT KORUMASI: tekrar gönderme / adımı tekrar deneme / baştan başlatma / sayfayı yenileme YALNIZ kullanıcının "tekrar denenebilir"
//   işaretlediği öğede yapılır — servis: servis ayarlarında operasyon (servis.ayarlar.tekrarDenenebilirOperasyonlar), ekran: akış
//   tasarımında adım (modelde kosu.tekrarDenenebilir). Varsayılan işaretsiz; işaretsiz öğede kural yalnız tekrar içermeyen eylemleri
//   (bekle, tıkla, pencereyi kapat, girişi yenile + devam) yapar, tekrar gerekiyorsa sonuç notuna "kayıt oluşturan adım tekrar denenmedi" yazılır.
// RAPORLAMA: kuralın çalıştığı her sonuçta not (servis: sonuc.kurtarma, ekran: "kurtarma" notu) ve düz kurtarma_json sütunu
//   ([{ kuralId, durum, deneme }] — sayaçlar için; metin / değer yok). Kurtarılan sonuç başarılı sayılır; not ve sayı görünür kalır.
// Kural hiçbir koşu başlatmaz: yalnız kullanıcının başlattığı (CANLI'da onayladığı) koşunun içinde çalışır.
import { randomUUID } from 'node:crypto';
import { acikAnahtar, coz, sifrele, zarfMi } from '../kasa.mjs';
import { DepoHatasi, ekranlariListele, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { yanitAlanlari, yanitAlaniOku } from '../servisler/yanit-kontrolleri.mjs';
import { xmlAgaciOku } from '../servisler/sozlesme-dogrulayici.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./kurtarma-kurallari.d.mts').KurtarmaKurali} KurtarmaKurali */
/** @typedef {import('./kurtarma-kurallari.d.mts').KurtarmaOlayi} KurtarmaOlayi */

export const KURAL_TURLERI = /** @type {const} */ (['ekran', 'servis']);
export const EKRAN_KOSULLARI = /** @type {const} */ (['metin', 'oge', 'girisSayfasi', 'pencere']);
export const EKRAN_EYLEMLERI = /** @type {const} */ (['yenile', 'tikla', 'girisYenile', 'bekle', 'pencereKapat']);
export const EKRAN_SONRALARI = /** @type {const} */ (['tekrar', 'devam', 'bastan']);
export const SERVIS_KOSULLARI = /** @type {const} */ (['alan', 'http', 'fault', 'baglanti']);
export const ALAN_ISLECLERI = /** @type {const} */ (['esit', 'icerir']);
export const OLAY_DURUMLARI = /** @type {const} */ (['kurtarildi', 'kaldi', 'tekrarlanmadi', 'denendi']);
/** Tekrar içermeyen ekran eylemleri: işaretsiz (tekrar denenebilir olmayan) adımda da yapılabilir. */
export const GUVENLI_EKRAN_EYLEMLERI = /** @type {const} */ (['tikla', 'girisYenile', 'bekle', 'pencereKapat']);
/** Bugünkü ürün davranışı: 401 / 403'te token'ı yenile, bir kez tekrar dene (silinemez, kapatılabilir). */
export const HAZIR_YETKI = 'yetki-401-403';
export const HAZIR_YETKI_ADI = 'Yetki hatasında token\'ı yenile (401 / 403)';
export const EN_COK_KURAL = 100;
export const EN_COK_DENEME = 10;
export const EN_COK_BEKLEME_SN = 300;
export const SAYAC_GUN = 7;
const AD_EN_UZUN = 120;
const METIN_EN_UZUN = 300;
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;

const simdiIso = () => new Date().toISOString();
/** @param {unknown} d */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** @param {unknown} d @param {string} alan @param {{ bos?: boolean; en?: number }} [s] */
function metin(d, alan, s = {}) {
  if (d === undefined || d === null) d = '';
  if (typeof d !== 'string') throw new DepoHatasi(`"${alan}" metin olmalıdır.`);
  // eslint-disable-next-line no-control-regex
  const t = d.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!t && !s.bos) throw new DepoHatasi(`${alan} boş olamaz.`);
  if (t.length > (s.en ?? METIN_EN_UZUN)) throw new DepoHatasi(`${alan} en çok ${s.en ?? METIN_EN_UZUN} karakter olabilir.`);
  return t;
}

/** @param {unknown} d @param {string} alan @param {number} enAz @param {number} enCok */
function tamSayi(d, alan, enAz, enCok) {
  const n = typeof d === 'string' && d.trim() !== '' ? Number(d) : d;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < enAz || n > enCok) throw new DepoHatasi(`${alan} ${enAz}–${enCok} arasında tam sayı olmalıdır.`);
  return n;
}

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Ham kuralı doğrular ve temiz modeli döner (hatada DepoHatasi, Türkçe). Kimlik ve ad ayrıca denetlenir (kuralKaydet).
 * @param {unknown} ham @returns {Omit<KurtarmaKurali, 'id' | 'ad' | 'hazir' | 'sira'>}
 */
export function kuralTanimiDogrula(ham) {
  if (!nesneMi(ham)) throw new DepoHatasi('Kural bir nesne olmalıdır.');
  const g = /** @type {Record<string, any>} */ (ham);
  if (!KURAL_TURLERI.includes(g.tur)) throw new DepoHatasi('Kuralın türünü seçin (Ekran / Servis).');
  const k = nesneMi(g.kapsam) ? g.kapsam : {};
  const ortamlar = k.ortamlar === null || k.ortamlar === undefined || k.ortamlar === 'tumu' ? null
    : Array.isArray(k.ortamlar) ? [...new Set(k.ortamlar.map((/** @type {unknown} */ x) => kimlik(x, 'ortam')))] : null;
  if (Array.isArray(ortamlar) && !ortamlar.length) throw new DepoHatasi('Seçili ortamlar boş: en az bir ortam seçin ya da "Tüm ortamlar"ı seçin.');
  const acik = g.acik !== false;
  if (g.tur === 'ekran') {
    const ogeler = k.ogeler === null || k.ogeler === undefined || k.ogeler === 'tumu' ? null
      : Array.isArray(k.ogeler) ? [...new Set(k.ogeler.map((/** @type {unknown} */ x) => kimlik(x, 'ekran')))] : null;
    if (Array.isArray(ogeler) && !ogeler.length) throw new DepoHatasi('Seçili ekranlar boş: en az bir ekran seçin ya da "Tüm ekranlar"ı seçin.');
    return { tur: 'ekran', acik, kosul: ekranKosulu(g.kosul), eylem: ekranEylemi(g.eylem), sonra: ekranSonrasi(g.sonra), kapsam: { ogeler, ortamlar } };
  }
  /** @type {Array<{ servisId: string; metot: string | null }> | null} */
  let ogeler = null;
  if (Array.isArray(k.ogeler)) {
    /** @type {Map<string, { servisId: string; metot: string | null }>} */
    const tekil = new Map();
    for (const x of k.ogeler) {
      if (!nesneMi(x)) throw new DepoHatasi('Servis seçimi geçersiz.');
      const servisId = kimlik(x.servisId, 'servis');
      const metot = x.metot === null || x.metot === undefined || x.metot === '' ? null : metin(x.metot, 'Metot adı', { en: 200 });
      tekil.set(`${servisId}\u0000${metot ?? ''}`, { servisId, metot });
    }
    ogeler = [...tekil.values()];
    if (!ogeler.length) throw new DepoHatasi('Seçili servisler boş: en az bir servis / metot seçin ya da "Tüm servisler"i seçin.');
  }
  const suzgec = nesneMi(g.suzgec) && String(g.suzgec.parametre ?? '').trim()
    ? { parametre: metin(g.suzgec.parametre, 'İstek süzgecinin parametresi', { en: 100 }), deger: metin(g.suzgec.deger, 'İstek süzgecinin değeri', { bos: true }) }
    : null;
  return { tur: 'servis', acik, kosul: servisKosulu(g.kosul), suzgec, yapilacak: servisYapilacagi(g.yapilacak), kapsam: { ogeler, ortamlar } };
}

/** @param {unknown} ham */
function ekranKosulu(ham) {
  const k = nesneMi(ham) ? /** @type {Record<string, any>} */ (ham) : {};
  if (!EKRAN_KOSULLARI.includes(k.tur)) throw new DepoHatasi('Koşulu seçin.');
  if (k.tur === 'metin') return { tur: 'metin', metin: metin(k.metin, 'Aranan metin') };
  if (k.tur === 'girisSayfasi') return { tur: 'girisSayfasi' };
  if (k.tur === 'pencere') return { tur: 'pencere', metin: metin(k.metin, 'Pencere metni', { bos: true }) };
  const secici = metin(k.secici, 'Öğe seçicisi', { bos: true });
  const rol = metin(k.rol, 'Öğe rolü', { bos: true, en: 40 });
  const ad = metin(k.ad, 'Öğe adı (metni)', { bos: true, en: 200 });
  if (secici) return { tur: 'oge', secici };
  if (!rol) throw new DepoHatasi('Öğe için CSS seçici ya da rol + metin yazın.');
  if (!/^[a-z]+$/.test(rol)) throw new DepoHatasi('Öğe rolü küçük harfli bir ARIA rolü olmalıdır (ör. button, dialog, alert).');
  return { tur: 'oge', rol, ad };
}

/** @param {unknown} ham */
function ekranEylemi(ham) {
  const e = nesneMi(ham) ? /** @type {Record<string, any>} */ (ham) : {};
  if (!EKRAN_EYLEMLERI.includes(e.tur)) throw new DepoHatasi('Yapılacak eylemi seçin.');
  if (e.tur === 'tikla') return { tur: 'tikla', secici: metin(e.secici, 'Tıklanacak öğenin seçicisi') };
  if (e.tur === 'bekle') return { tur: 'bekle', sn: tamSayi(e.sn, 'Bekleme süresi (sn)', 1, EN_COK_BEKLEME_SN) };
  if (e.tur === 'pencereKapat') {
    const secici = metin(e.secici, 'Kapat düğmesinin seçicisi', { bos: true });
    return secici ? { tur: 'pencereKapat', secici } : { tur: 'pencereKapat' };
  }
  return { tur: /** @type {'yenile' | 'girisYenile'} */ (e.tur) };
}

/** @param {unknown} ham */
function ekranSonrasi(ham) {
  const s = nesneMi(ham) ? /** @type {Record<string, any>} */ (ham) : {};
  if (!EKRAN_SONRALARI.includes(s.tur)) throw new DepoHatasi('"Sonra" seçimini yapın.');
  if (s.tur === 'tekrar') return { tur: 'tekrar', kez: tamSayi(s.kez, 'Tekrar deneme sayısı', 1, EN_COK_DENEME) };
  return { tur: /** @type {'devam' | 'bastan'} */ (s.tur) };
}

/** @param {unknown} ham */
function servisKosulu(ham) {
  const k = nesneMi(ham) ? /** @type {Record<string, any>} */ (ham) : {};
  if (!SERVIS_KOSULLARI.includes(k.tur)) throw new DepoHatasi('Koşulu seçin.');
  if (k.tur === 'alan') {
    if (!ALAN_ISLECLERI.includes(k.islec)) throw new DepoHatasi('Alan koşulunda işleci seçin (eşittir / içerir).');
    return { tur: 'alan', yol: metin(k.yol, 'Yanıt alanı'), islec: k.islec, deger: metin(k.deger, 'Alan değeri', { bos: k.islec === 'esit' }) };
  }
  if (k.tur === 'http') {
    const ham2 = Array.isArray(k.kodlar) ? k.kodlar : String(k.kodlar ?? '').split(/[\s,;]+/).filter(Boolean);
    const kodlar = [...new Set(ham2.map((/** @type {unknown} */ x) => tamSayi(x, 'HTTP durum kodu', 100, 599)))];
    if (!kodlar.length) throw new DepoHatasi('En az bir HTTP durum kodu yazın (ör. 503).');
    if (kodlar.length > 20) throw new DepoHatasi('En çok 20 durum kodu yazılabilir.');
    return { tur: 'http', kodlar };
  }
  if (k.tur === 'fault') return { tur: 'fault', kod: metin(k.kod, 'Fault kodu', { bos: true }), mesaj: metin(k.mesaj, 'Fault mesajı', { bos: true }) };
  return { tur: 'baglanti' };
}

/** @param {unknown} ham */
function servisYapilacagi(ham) {
  const y = nesneMi(ham) ? /** @type {Record<string, any>} */ (ham) : {};
  const bekleSn = y.bekleSn === undefined || y.bekleSn === null || y.bekleSn === '' ? 0 : tamSayi(y.bekleSn, 'Bekleme süresi (sn)', 0, EN_COK_BEKLEME_SN);
  const tokenYenile = y.tokenYenile === true;
  const tekrarGonder = y.tekrarGonder === true;
  if (!bekleSn && !tokenYenile && !tekrarGonder) throw new DepoHatasi('En az bir şey yapılmalı: bekle, token\'ı yenile ya da isteği tekrar gönder.');
  const enCokDeneme = tekrarGonder ? tamSayi(y.enCokDeneme ?? 2, 'En çok deneme', 2, EN_COK_DENEME) : 1;
  return { bekleSn, tokenYenile, tekrarGonder, enCokDeneme, artanBekleme: tekrarGonder && y.artanBekleme === true };
}

// ---------------------------------------------------------------------------------------
// Depo
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {unknown} d @returns {Record<string, any>} */
function tanimOku(vt, d) {
  try {
    const v = JSON.parse(typeof d === 'string' && zarfMi(d) ? coz(vt, d) : String(d ?? '{}'));
    return nesneMi(v) ? v : {};
  } catch { return {}; }
}

/** @param {Veritabani} vt @param {string} projeId @returns {Array<{ id: string; ad: string; sira: number; tanim: Record<string, any> }>} */
function satirlar(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT id, ad, sira, tanim_json FROM kurtarma_kurallari WHERE proje_id = ? ORDER BY sira, olusturulma, id', [projeId])
    .map((s) => ({ id: String(s.id), ad: String(s.ad), sira: Number(s.sira ?? 0), tanim: tanimOku(vt, s.tanim_json) }));
}

/**
 * Projenin kuralları (kullanıcının sırasıyla) + en başta hazır "Yetki hatasında" kuralı. Okunamayan (bozuk) kural atlanır.
 * @param {Veritabani} vt @param {string} projeId @returns {KurtarmaKurali[]}
 */
export function kurallariListele(vt, projeId) {
  const liste = satirlar(vt, projeId);
  const hazirSatir = liste.find((s) => s.tanim.hazir === HAZIR_YETKI);
  /** @type {KurtarmaKurali[]} */
  const sonuc = [{
    id: HAZIR_YETKI, ad: HAZIR_YETKI_ADI, hazir: HAZIR_YETKI, sira: -1, tur: 'servis', acik: hazirSatir ? hazirSatir.tanim.acik !== false : true,
    kosul: { tur: 'http', kodlar: [401, 403] }, suzgec: null, yapilacak: { bekleSn: 0, tokenYenile: true, tekrarGonder: true, enCokDeneme: 2, artanBekleme: false },
    kapsam: { ogeler: null, ortamlar: null }
  }];
  for (const s of liste) {
    if (s.tanim.hazir) continue;
    try { sonuc.push({ id: s.id, ad: s.ad, sira: s.sira, ...kuralTanimiDogrula(s.tanim) }); } catch { /* bozuk kayıt atlanır */ }
  }
  return sonuc;
}

/**
 * Kural ekler (id yoksa) ya da günceller. Ad projede tekil olmalıdır. Hazır kural buradan değiştirilemez (hazirKuralAyarla).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} ham @returns {string} kural kimliği
 */
export function kuralKaydet(vt, projeId, ham) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  if (!nesneMi(ham)) throw new DepoHatasi('Kural bir nesne olmalıdır.');
  const g = /** @type {Record<string, any>} */ (ham);
  const id = g.id === undefined || g.id === null || g.id === '' ? null : kimlik(g.id, 'id');
  const liste = satirlar(vt, projeId);
  const mevcut = id ? liste.find((s) => s.id === id) : undefined;
  if (id && (!mevcut || id === HAZIR_YETKI)) throw new DepoHatasi(id === HAZIR_YETKI ? 'Hazır kural düzenlenemez; yalnız açılıp kapatılabilir.' : 'Kural bulunamadı.');
  if (mevcut?.tanim.hazir) throw new DepoHatasi('Hazır kural düzenlenemez; yalnız açılıp kapatılabilir.');
  const ad = metin(g.ad, 'Kuralın adı', { en: AD_EN_UZUN });
  const kucuk = ad.toLocaleLowerCase('tr');
  if (kucuk === HAZIR_YETKI_ADI.toLocaleLowerCase('tr') || liste.some((s) => s.id !== id && s.ad.toLocaleLowerCase('tr') === kucuk)) throw new DepoHatasi(`"${ad}" adlı bir kural zaten var.`);
  const tanim = kuralTanimiDogrula(g);
  const zaman = simdiIso();
  const sifreli = sifrele(vt, JSON.stringify(tanim));
  if (mevcut) {
    vt.calistir('UPDATE kurtarma_kurallari SET ad = ?, tanim_json = ?, guncellenme = ? WHERE id = ?', [ad, sifreli, zaman, mevcut.id]);
    return mevcut.id;
  }
  if (liste.filter((s) => !s.tanim.hazir).length >= EN_COK_KURAL) throw new DepoHatasi(`Bir projede en çok ${EN_COK_KURAL} kurtarma kuralı olabilir.`);
  const yeni = randomUUID();
  const sira = liste.reduce((m, s) => Math.max(m, s.sira), 0) + 1;
  vt.calistir('INSERT INTO kurtarma_kurallari (id, proje_id, ad, sira, tanim_json, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [yeni, projeId, ad, sira, sifreli, zaman, zaman]);
  return yeni;
}

/** Kuralı siler (hazır kural silinemez). @param {Veritabani} vt @param {string} projeId @param {unknown} id */
export function kuralSil(vt, projeId, id) {
  const k = kimlik(id, 'id');
  const s = satirlar(vt, projeId).find((x) => x.id === k);
  if (k === HAZIR_YETKI || s?.tanim.hazir) throw new DepoHatasi('Hazır kural silinemez; isterseniz kapatın.');
  if (!s) throw new DepoHatasi('Kural bulunamadı.');
  vt.calistir('DELETE FROM kurtarma_kurallari WHERE id = ?', [k]);
  return { silindi: true };
}

/**
 * Kuralı açar / kapatır. Hazır kural için satır yoksa oluşturulur (yalnız açık/kapalı seçimi saklanır).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} id @param {unknown} acik
 */
export function kuralDurumuAyarla(vt, projeId, id, acik) {
  if (typeof acik !== 'boolean') throw new DepoHatasi('"acik" true ya da false olmalıdır.');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const k = kimlik(id, 'id');
  const liste = satirlar(vt, projeId);
  const zaman = simdiIso();
  const hazirSatir = liste.find((s) => s.tanim.hazir === HAZIR_YETKI);
  if (k === HAZIR_YETKI || (hazirSatir && hazirSatir.id === k)) {
    const tanim = sifrele(vt, JSON.stringify({ hazir: HAZIR_YETKI, acik }));
    if (hazirSatir) vt.calistir('UPDATE kurtarma_kurallari SET tanim_json = ?, guncellenme = ? WHERE id = ?', [tanim, zaman, hazirSatir.id]);
    else vt.calistir('INSERT INTO kurtarma_kurallari (id, proje_id, ad, sira, tanim_json, olusturulma, guncellenme) VALUES (?, ?, ?, 0, ?, ?, ?)', [randomUUID(), projeId, HAZIR_YETKI_ADI, tanim, zaman, zaman]);
    return { acik };
  }
  const s = liste.find((x) => x.id === k);
  if (!s) throw new DepoHatasi('Kural bulunamadı.');
  vt.calistir('UPDATE kurtarma_kurallari SET tanim_json = ?, guncellenme = ? WHERE id = ?', [sifrele(vt, JSON.stringify({ ...s.tanim, acik })), zaman, k]);
  return { acik };
}

/**
 * Hazır "Yetki hatasında (401 / 403)" kuralı açık mı (varsayılan açık: bugünkü davranış). Kasa kilitli / okunamazsa açık sayılır.
 * @param {Veritabani} vt @param {string} projeId
 */
export function hazirYetkiKuraliAcik(vt, projeId) {
  try { return kurallariListele(vt, projeId)[0].acik; } catch { return true; }
}

/** @param {{ ortamlar: string[] | null }} kapsam @param {string} ortamId */
const ortamUyar = (kapsam, ortamId) => kapsam.ortamlar === null || kapsam.ortamlar.includes(ortamId);

/**
 * Bir servis çağrısına uygulanabilen açık kullanıcı kuralları (hazır kural hariç; sırasıyla). Okunamazsa boş.
 * @param {Veritabani} vt @param {string} projeId @param {{ ortamId: string; servisId: string; metot: string | null }} c
 * @returns {Array<KurtarmaKurali & { tur: 'servis' }>}
 */
export function servisKurallari(vt, projeId, c) {
  let liste;
  try { liste = kurallariListele(vt, projeId); } catch { return []; }
  return /** @type {Array<KurtarmaKurali & { tur: 'servis' }>} */ (liste.filter((k) => !k.hazir && k.acik && k.tur === 'servis' && ortamUyar(k.kapsam, c.ortamId)
    && (k.kapsam.ogeler === null || /** @type {Array<{ servisId: string; metot: string | null }>} */ (k.kapsam.ogeler)
      .some((o) => o.servisId === c.servisId && (o.metot === null || o.metot === c.metot)))));
}

/**
 * Ekran koşusuna giden kurallar: açık, türü ekran, ortamı uyan (ekran kapsamı koşucuda senaryonun ekranıyla süzülür).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @returns {Array<KurtarmaKurali & { tur: 'ekran' }>}
 */
export function ekranKurallari(vt, projeId, ortamId) {
  let liste;
  try { liste = kurallariListele(vt, projeId); } catch { return []; }
  return /** @type {Array<KurtarmaKurali & { tur: 'ekran' }>} */ (liste.filter((k) => !k.hazir && k.acik && k.tur === 'ekran' && ortamUyar(k.kapsam, ortamId)));
}

/** Ekran kuralı bu ekranda geçerli mi. @param {{ kapsam: { ogeler: unknown } }} k @param {string} ekranId */
export const ekranKapsamindaMi = (k, ekranId) => k.kapsam.ogeler === null || (Array.isArray(k.kapsam.ogeler) && k.kapsam.ogeler.includes(ekranId));

// ---------------------------------------------------------------------------------------
// Değerlendirme (saf)
// ---------------------------------------------------------------------------------------

/** @param {string} d */
const kucukHarf = (d) => d.toLocaleLowerCase('tr');

/**
 * Yol ya da alan adıyla değer: "/Envelope/Body/…" XML yolu; "a.b[0]" JSON yolu; yalnız ad ("SonucKodu") → aynı adlı ilk yaprak alan.
 * @param {string} govde @param {string} yol @returns {string | null}
 */
export function alanDegeri(govde, yol) {
  if (!govde) return null;
  if (yol.startsWith('/')) { const r = yanitAlaniOku(govde, 'xml', yol); return r.bulundu ? r.deger ?? '' : null; }
  if (/[.[]/.test(yol) || yol.startsWith('$')) {
    const r = yanitAlaniOku(govde, 'json', yol);
    if (r.bulundu) return r.deger ?? '';
  }
  const a = yanitAlanlari(govde).alanlar.find((x) => x.ad === yol);
  return a ? a.deger ?? '' : null;
}

/**
 * SOAP Fault (1.1: faultcode / faultstring; 1.2: Code/Value, Reason/Text). Fault yoksa null.
 * @param {string} govde @returns {{ kod: string; mesaj: string } | null}
 */
export function soapFaultOku(govde) {
  const kok = govde ? xmlAgaciOku(govde) : null;
  if (!kok || kok.ad !== 'Envelope') return null;
  const fault = kok.cocuklar.find((c) => c.ad === 'Body')?.cocuklar.find((c) => c.ad === 'Fault');
  if (!fault) return null;
  /** @param {import('../servisler/sozlesme-dogrulayici.mjs').XmlDugumu} d @returns {string} */
  const tum = (d) => d.metin + d.cocuklar.map(tum).join('');
  const bul = (/** @type {string[]} */ adlar) => {
    /** @type {import('../servisler/sozlesme-dogrulayici.mjs').XmlDugumu[]} */
    const yigin = [...fault.cocuklar];
    while (yigin.length) {
      const d = /** @type {import('../servisler/sozlesme-dogrulayici.mjs').XmlDugumu} */ (yigin.shift());
      if (adlar.includes(d.ad)) return tum(d).trim();
      yigin.push(...d.cocuklar);
    }
    return '';
  };
  return { kod: bul(['faultcode', 'Code']), mesaj: bul(['faultstring', 'Reason']) };
}

/** Bağlantı hatası / zaman aşımı iletisi mi (soap-istemcisi.mjs'nin ServisHatasi metinleri). @param {string | null | undefined} m */
export const baglantiHatasiMi = (m) => /^Bağlantı kurulamadı|sn içinde gelmedi\.?$/.test(String(m ?? ''));

/**
 * Servis koşulu bu çağrıda tutuyor mu; tutuyorsa kısa neden (değer yazılmaz; yalnız kuralın kendi metni ve durum kodu).
 * @param {KurtarmaKurali['kosul']} kosul @param {{ durumKodu?: number | null; govde?: string | null; hata?: string | null }} c
 * @returns {{ tutar: boolean; neden: string }}
 */
export function servisKosuluDegerlendir(kosul, c) {
  const k = /** @type {Record<string, any>} */ (kosul);
  if (k.tur === 'baglanti') {
    const t = baglantiHatasiMi(c.hata);
    return { tutar: t, neden: /gelmedi/.test(String(c.hata ?? '')) ? 'zaman aşımı' : 'bağlantı hatası' };
  }
  if (c.hata || typeof c.durumKodu !== 'number') return { tutar: false, neden: '' };
  if (k.tur === 'http') return { tutar: k.kodlar.includes(c.durumKodu), neden: `HTTP ${c.durumKodu}` };
  const govde = String(c.govde ?? '');
  if (k.tur === 'fault') {
    const f = soapFaultOku(govde);
    if (!f) return { tutar: false, neden: '' };
    const tutar = (!k.kod || kucukHarf(f.kod).includes(kucukHarf(k.kod))) && (!k.mesaj || kucukHarf(f.mesaj).includes(kucukHarf(k.mesaj)));
    return { tutar, neden: `SOAP Fault${k.kod ? ` ${k.kod}` : ''}${k.mesaj ? ` "${k.mesaj}"` : ''}` };
  }
  const d = alanDegeri(govde, String(k.yol));
  if (d === null) return { tutar: false, neden: '' };
  const ad = String(k.yol).split(/[/.]/).filter(Boolean).pop()?.replace(/\[\d+\]$/, '') ?? String(k.yol);
  const tutar = k.islec === 'esit' ? d.trim() === String(k.deger) : kucukHarf(d).includes(kucukHarf(String(k.deger)));
  return { tutar, neden: k.islec === 'esit' ? `${ad} ${k.deger}` : `${ad} içerir "${k.deger}"` };
}

/**
 * İstek süzgeci: süzgeç yoksa tutar; varsa istekteki parametre (çözülmüş parametre değerleri, yoksa istek gövdesindeki aynı adlı alan)
 * verilen değerde olmalıdır.
 * @param {{ parametre: string; deger: string } | null | undefined} suzgec @param {{ degerler?: Record<string, unknown>; govde?: string | null }} istek
 */
export function suzgecTutar(suzgec, istek) {
  if (!suzgec) return true;
  const degerler = istek.degerler ?? {};
  const anahtar = Object.keys(degerler).find((a) => a === suzgec.parametre) ?? Object.keys(degerler).find((a) => kucukHarf(a) === kucukHarf(suzgec.parametre));
  /** @type {string | null} */
  let d = anahtar !== undefined && degerler[anahtar] !== undefined && degerler[anahtar] !== null ? String(degerler[anahtar]) : null;
  if (d === null) {
    try { d = alanDegeri(String(istek.govde ?? ''), suzgec.parametre); } catch { d = null; }
  }
  return d !== null && d.trim() === suzgec.deger;
}

/**
 * Deneme öncesi bekleme (ms): bekleSn; artan beklemede her denemede katlanır (1×, 2×, 4×…, en çok EN_COK_BEKLEME_SN).
 * @param {{ bekleSn: number; artanBekleme: boolean }} y @param {number} deneme şimdiye kadarki deneme sayısı (1 = ilk istek)
 */
export function beklemeMs(y, deneme) {
  const kat = y.artanBekleme ? 2 ** Math.max(0, deneme - 1) : 1;
  return Math.min(EN_COK_BEKLEME_SN, y.bekleSn * kat) * 1000;
}

// ---------------------------------------------------------------------------------------
// Sayaçlar
// ---------------------------------------------------------------------------------------

/**
 * Sonuç satırının kurtarma_json sütunu (düz metin; yalnız kural kimliği, durum, deneme): okunamazsa boş.
 * @param {unknown} d @returns {Array<{ kuralId: string; durum: string; deneme: number }>}
 */
export function kurtarmaSutunuOku(d) {
  if (typeof d !== 'string' || !d) return [];
  try {
    const v = JSON.parse(d);
    return (Array.isArray(v) ? v : []).filter((x) => nesneMi(x) && typeof x.kuralId === 'string' && OLAY_DURUMLARI.includes(x.durum))
      .map((x) => ({ kuralId: String(x.kuralId), durum: String(x.durum), deneme: Number(x.deneme) || 1 }));
  } catch { return []; }
}

/**
 * Sonuç satırına yazılacak kurtarma_json (null: olay yok). Metin / değer içermez.
 * @param {ReadonlyArray<{ kuralId: string; durum: string; deneme?: number }> | null | undefined} olaylar
 */
export function kurtarmaSutunuYaz(olaylar) {
  const l = (olaylar ?? []).filter((o) => o && typeof o.kuralId === 'string' && KIMLIK.test(o.kuralId) && OLAY_DURUMLARI.includes(/** @type {any} */ (o.durum))).slice(0, 50)
    .map((o) => ({ kuralId: o.kuralId, durum: o.durum, deneme: Math.max(1, Math.min(100, Math.round(Number(o.deneme) || 1))) }));
  return l.length ? JSON.stringify(l) : null;
}

/**
 * Kuralların [bas, bit] aralığında kaç kez çalıştığı (ekran sonuçları + servis çağrıları; akış adımları dahil).
 * @param {Veritabani} vt @param {string} projeId @param {{ bas: Date; bit?: Date }} aralik
 * @returns {Record<string, { toplam: number; kurtarildi: number; kaldi: number; tekrarlanmadi: number; denendi: number }>}
 */
export function kurtarmaSayaclari(vt, projeId, aralik) {
  const bas = aralik.bas.toISOString();
  const bit = (aralik.bit ?? new Date(8.64e15)).toISOString();
  /** @type {Record<string, { toplam: number; kurtarildi: number; kaldi: number; tekrarlanmadi: number; denendi: number }>} */
  const sayac = {};
  const ekle = (/** @type {unknown} */ d) => {
    for (const o of kurtarmaSutunuOku(d)) {
      const s = (sayac[o.kuralId] ??= { toplam: 0, kurtarildi: 0, kaldi: 0, tekrarlanmadi: 0, denendi: 0 });
      s.toplam++;
      s[/** @type {'kurtarildi' | 'kaldi' | 'tekrarlanmadi' | 'denendi'} */ (o.durum)]++;
    }
  };
  for (const r of vt.tumu('SELECT kurtarma_json FROM servis_kosulari WHERE proje_id = ? AND kurtarma_json IS NOT NULL AND baslangic >= ? AND baslangic <= ?', [projeId, bas, bit])) ekle(r.kurtarma_json);
  for (const r of vt.tumu(`SELECT r.kurtarma_json FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE k.proje_id = ? AND r.kurtarma_json IS NOT NULL AND COALESCE(r.baslangic, r.bitis) >= ? AND COALESCE(r.baslangic, r.bitis) <= ?`, [projeId, bas, bit])) ekle(r.kurtarma_json);
  return sayac;
}

/**
 * Sonuçlar > Özet > Dikkat için: aralıkta çalışmış kurallar (ad + sayılar), çok çalışan önce.
 * @param {Veritabani} vt @param {string} projeId @param {{ bas: Date; bit: Date }} aralik
 */
export function calisanKurallar(vt, projeId, aralik) {
  const sayac = kurtarmaSayaclari(vt, projeId, aralik);
  return kurallariListele(vt, projeId).map((k) => {
    const s = sayac[k.id];
    return s ? { id: k.id, ad: k.ad, tur: k.tur, ...s } : null;
  }).filter((x) => x !== null).sort((a, b) => b.toplam - a.toplam || a.ad.localeCompare(b.ad, 'tr'));
}

// ---------------------------------------------------------------------------------------
// Uçlar (Ayarlar > Proje ve ortamlar > Kurtarma kuralları). Dış istek yok; yalnız kasaya yazılır.
// ---------------------------------------------------------------------------------------

/**
 * Ekranın verisi: kurallar, "son 7 günde" sayaçları ve kapsam seçenekleri (ekranlar, servisler + metotlar, ortamlar).
 * @param {Veritabani} vt @param {string} projeId @param {Date} [simdi]
 */
export function kurtarmaEkrani(vt, projeId, simdi = new Date()) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const kurallar = kurallariListele(vt, projeId);
  const sayac = kurtarmaSayaclari(vt, projeId, { bas: new Date(simdi.getTime() - SAYAC_GUN * 86_400_000), bit: simdi });
  const servisler = vt.tumu('SELECT id, ad, ayarlar_json FROM servisler WHERE proje_id = ? ORDER BY ad', [projeId]).map((s) => {
    const ayar = tanimOku(vt, s.ayarlar_json);
    return {
      id: String(s.id), ad: String(s.ad),
      metotlar: (Array.isArray(ayar.operasyonlar) ? ayar.operasyonlar : []).map((/** @type {any} */ o) => String(o?.ad ?? '')).filter(Boolean),
      tekrarDenenebilir: Array.isArray(ayar.tekrarDenenebilirOperasyonlar) ? ayar.tekrarDenenebilirOperasyonlar.map(String) : []
    };
  });
  return {
    kurallar: kurallar.map((k) => ({ ...k, son7Gun: sayac[k.id]?.toplam ?? 0 })),
    sayacGun: SAYAC_GUN,
    secenekler: {
      ekranlar: ekranlariListele(vt, projeId).map((e) => ({ id: e.id, ad: e.ad })),
      servisler,
      ortamlar: ortamlariListele(vt, projeId).map((o) => ({ id: o.id, ad: o.ad }))
    }
  };
}

/** @param {unknown} d */
const projeKimligi = (d) => kimlik(d, 'projeId');

/** @type {Array<[string, (vt: Veritabani, q: URLSearchParams) => unknown]>} */
export const KURTARMA_GET_UCLARI = [
  ['/platform/kurtarma-kurallari', (vt, q) => kurtarmaEkrani(vt, projeKimligi(q.get('projeId')))]
];

/** @type {Array<[string, (vt: Veritabani, g: Record<string, any>) => unknown]>} */
export const KURTARMA_POST_UCLARI = [
  ['/platform/kurtarma-kurallari/kaydet', (vt, g) => ({ id: kuralKaydet(vt, projeKimligi(g.projeId), g.kural) })],
  ['/platform/kurtarma-kurallari/sil', (vt, g) => kuralSil(vt, projeKimligi(g.projeId), g.id)],
  ['/platform/kurtarma-kurallari/durum', (vt, g) => kuralDurumuAyarla(vt, projeKimligi(g.projeId), g.id, g.acik)]
];
