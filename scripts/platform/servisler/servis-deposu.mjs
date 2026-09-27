// SERVİS TESTLERİ — veri katmanı (servisler, servis senaryoları, servis giriş bilgileri, servis koşuları).
// Ekran kayıtlarından ve ekran koşularından AYRIDIR: servis raporları ekran sonuçlarına karışmaz.
// Şifreli sütunlar gocler.mjs SIFRELI_ALANLAR'da; yazmak/okumak için kasa açık olmalıdır.
import { randomUUID } from 'node:crypto';
import { acikAnahtar, coz, sifrele, zarfMi } from '../kasa.mjs';
import { DepoHatasi, gecmisYaz, jsonMetni, testVerisiTurleriniListele } from '../veritabani/depo.mjs';
import { TANIM_TURLERI } from './parametre-tanimlari.mjs';
import { sqlTanimiDogrula } from '../sql/sql-adimi.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';
import { akisSenaryoIceriginiDogrula, akisSenaryosuMu, baglariDogrula } from './akis-senaryo-icerigi.mjs';
import { dosyaTanimiDogrula } from '../dosyalar/dosya-icerigi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

const simdi = () => new Date().toISOString();

export const SERVIS_TURLERI = /** @type {const} */ (['soap', 'rest']);
export const SENARYO_KAPSAMLARI = /** @type {const} */ (['test', 'canli', 'ikisi']);
export const KOSU_DURUMLARI = /** @type {const} */ (['basarili', 'basarisiz', 'hata']);

/** @param {unknown} deger @param {string} alan */
function zorunluMetin(deger, alan) {
  if (typeof deger !== 'string' || !deger.trim()) throw new DepoHatasi(`"${alan}" boş olamaz.`);
  return deger.trim();
}

/** @param {unknown} deger @param {string} alan */
function kimlik(deger, alan = 'id') {
  if (typeof deger !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(deger)) {
    throw new DepoHatasi(`"${alan}" geçersiz (yalnızca harf, rakam, "-" ve "_"; en fazla 100 karakter).`);
  }
  return deger;
}

/** @template T @param {unknown} deger @param {readonly T[]} liste @param {string} alan @returns {T} */
function secenek(deger, liste, alan) {
  if (!liste.includes(/** @type {T} */ (deger))) throw new DepoHatasi(`"${alan}" yalnızca ${liste.join(', ')} olabilir.`);
  return /** @type {T} */ (deger);
}

/** @param {Veritabani} vt @param {unknown} nesne @param {string} alan */
const sifreliJson = (vt, nesne, alan) => sifrele(vt, jsonMetni(nesne ?? {}, alan));

/** @param {Veritabani} vt @param {unknown} deger @returns {Record<string, any>} */
function sifreliJsonOku(vt, deger) {
  acikAnahtar(vt);
  if (typeof deger !== 'string' || !deger) return {};
  return JSON.parse(zarfMi(deger) ? coz(vt, deger) : deger);
}

/**
 * Genel ekle/güncelle (depo.mjs kaydetGenel ile aynı kural): id verildiyse ve satır varsa günceller.
 * @param {Veritabani} vt @param {string} tablo @param {Record<string, unknown>} degerler
 * @param {{ id?: string; gecmisTuru?: string; yapan?: string }} [secenekler]
 */
function kaydet(vt, tablo, degerler, secenekler = {}) {
  return vt.islem(() => {
    const zaman = simdi();
    const id = secenekler.id ? kimlik(secenekler.id) : randomUUID();
    const onceki = vt.tek(`SELECT * FROM ${tablo} WHERE id = ?`, [id]);
    const sutunlar = Object.keys(degerler);
    if (onceki) {
      vt.calistir(`UPDATE ${tablo} SET ${sutunlar.map((s) => `${s} = ?`).join(', ')}, guncellenme = ? WHERE id = ?`,
        [...sutunlar.map((s) => degerler[s]), zaman, id]);
    } else {
      vt.calistir(`INSERT INTO ${tablo} (id, ${sutunlar.join(', ')}, olusturulma, guncellenme) VALUES (?, ${sutunlar.map(() => '?').join(', ')}, ?, ?)`,
        [id, ...sutunlar.map((s) => degerler[s]), zaman, zaman]);
    }
    if (secenekler.gecmisTuru) {
      gecmisYaz(vt, { varlikTuru: secenekler.gecmisTuru, varlikId: id, islem: onceki ? 'guncelle' : 'olustur', yapan: secenekler.yapan,
        onceki, sonraki: vt.tek(`SELECT * FROM ${tablo} WHERE id = ?`, [id]) });
    }
    return id;
  });
}

/** @param {Veritabani} vt @param {string} tablo @param {string} id @param {{ gecmisTuru?: string; yapan?: string }} [secenekler] */
function sil(vt, tablo, id, secenekler = {}) {
  return vt.islem(() => {
    const onceki = vt.tek(`SELECT * FROM ${tablo} WHERE id = ?`, [id]);
    if (!onceki) return false;
    vt.calistir(`DELETE FROM ${tablo} WHERE id = ?`, [id]);
    if (secenekler.gecmisTuru) gecmisYaz(vt, { varlikTuru: secenekler.gecmisTuru, varlikId: id, islem: 'sil', yapan: secenekler.yapan, onceki });
    return true;
  });
}

// ---------------------------------------------------------------------------------------
// Servisler
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ ad: string; eylem?: string; metot?: string; yol?: string }} ServisOperasyonu  metot / yol: REST (bkz. ServisHttpTanimi)
 * @typedef {{ yol?: string; tabanlar?: Record<string, string>; wsdlYolu?: string; soapSurumu?: '1.1' | '1.2'; operasyonlar?: ServisOperasyonu[];
 *   adresler?: Record<string, string>; yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean;
 *   kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
 *   operasyonSemalari?: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi>;
 *   alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>; alanZorunluluklari?: Record<string, string[]>;
 *   ekAlanlar?: Record<string, Array<{ yol: string; tip?: import('./servis-govdesi.mjs').AlanTipi }>>;
 *   alanListeleri?: Record<string, Record<string, string>>;
 *   alanBaglari?: Record<string, Record<string, { tablo?: string; sutun?: string; etiket?: string; bicim?: string; kural?: string }>>;
 *   erisim?: { ortamId: string; zaman: string; durumKodu: number }; oturumAkisi?: string; tabanGrubu?: string }} ServisAyarlari  tabanGrubu: adlandırılmış taban adres (taban-adresleri.mjs)
 * @typedef {{ id: string; projeId: string; anahtar: string; ad: string; tur: 'soap' | 'rest'; durum: 'etkin' | 'devre_disi';
 *   sira: number | null; ayarlar: ServisAyarlari; olusturulma: string; guncellenme: string }} Servis
 */

/** @param {Veritabani} vt @param {Record<string, unknown>} s @returns {Servis} */
const servisCevir = (vt, s) => ({
  id: String(s.id), projeId: String(s.proje_id), anahtar: String(s.anahtar), ad: String(s.ad),
  tur: /** @type {'soap' | 'rest'} */ (String(s.tur)), durum: /** @type {'etkin' | 'devre_disi'} */ (String(s.durum)),
  sira: s.sira == null ? null : Number(s.sira), ayarlar: sifreliJsonOku(vt, s.ayarlar_json),
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/** Servis anahtarı: küçük harf, rakam ve "-" (URL ve dosya adlarında kullanılır). @param {unknown} deger */
function servisAnahtari(deger) {
  const a = zorunluMetin(deger, 'anahtar');
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(a)) throw new DepoHatasi('"anahtar" yalnızca küçük harf, rakam ve "-" içerebilir (en fazla 80 karakter).');
  return a;
}

/**
 * Kasa açık olmalıdır. ayarlar verilmezse mevcut korunur.
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; anahtar: string; ad: string; tur?: 'soap' | 'rest'; durum?: 'etkin' | 'devre_disi'; sira?: number | null; ayarlar?: ServisAyarlari; yapan?: string }} girdi
 */
export function servisKaydet(vt, girdi) {
  acikAnahtar(vt);
  return vt.islem(() => {
    const projeId = kimlik(girdi.projeId, 'projeId');
    const anahtar = servisAnahtari(girdi.anahtar);
    const ayni = vt.tek('SELECT id FROM servisler WHERE proje_id = ? AND anahtar = ?', [projeId, anahtar]);
    if (ayni && ayni.id !== girdi.id) throw new DepoHatasi(`"${anahtar}" anahtarlı bir servis zaten var.`);
    const mevcut = girdi.id ? vt.tek('SELECT * FROM servisler WHERE id = ?', [girdi.id]) : undefined;
    return kaydet(vt, 'servisler', {
      proje_id: projeId, anahtar, ad: zorunluMetin(girdi.ad, 'ad'),
      tur: secenek(girdi.tur ?? mevcut?.tur ?? 'soap', SERVIS_TURLERI, 'tur'),
      durum: secenek(girdi.durum ?? mevcut?.durum ?? 'etkin', ['etkin', 'devre_disi'], 'durum'),
      sira: girdi.sira === undefined ? (mevcut?.sira ?? null) : girdi.sira,
      ayarlar_json: girdi.ayarlar !== undefined ? sifreliJson(vt, girdi.ayarlar, 'ayarlar') : (mevcut?.ayarlar_json ?? sifreliJson(vt, {}, 'ayarlar'))
    }, { id: girdi.id, gecmisTuru: 'servis', yapan: girdi.yapan });
  });
}

/** @param {Veritabani} vt @param {string} id */
export function servisGetir(vt, id) {
  const s = vt.tek('SELECT * FROM servisler WHERE id = ?', [id]);
  return s ? servisCevir(vt, s) : undefined;
}

/** Elle sıra, sonra ada göre. @param {Veritabani} vt @param {string} projeId */
export function servisleriListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM servisler WHERE proje_id = ?', [projeId]).map((s) => servisCevir(vt, s))
    .sort((a, b) => (a.sira ?? 1e9) - (b.sira ?? 1e9) || a.ad.localeCompare(b.ad, 'tr'));
}

/** Senaryoları ve koşu kayıtları da silinir (CASCADE). @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function servisSil(vt, id, yapan) {
  return sil(vt, 'servisler', id, { gecmisTuru: 'servis', yapan });
}

// ---------------------------------------------------------------------------------------
// Servis senaryoları
// ---------------------------------------------------------------------------------------

/**
 * Kontrol: yanıt üzerinde bir denetim.
 * - durumKodu: HTTP durum kodu (deger: sayı ya da "200-299")
 * - soapYaniti: yanıt geçerli bir SOAP zarfı
 * - soapHatasiYok / soapHatasi: yanıtta SOAP Fault olmamalı / olmalı
 * - icerir / icermez: metin (buyukKucukDuyarsiz, duzenliIfade)
 * - xpathEsit: xpath ile bulunan ilk düğümün metni "deger"e eşit (basit yol: /a/b/c, önekler yok sayılır)
 * - jsonEsit: JSON yanıtta "yol"daki değer (a.b[0].c; baştaki "$." isteğe bağlı) "deger"e eşit (REST)
 * - veya: alt kontrollerden EN AZ BİRİ geçerse geçer (alt: kontroller; iç içe VEYA yok). Senaryonun kontrol listesi VE'dir.
 * - dosya: yanıt gövdesi dosya olarak (CSV / XLSX / PDF / metin) "dosya" tanımındaki beklentilerle doğrulanır (dosyalar/dosya-icerigi.mjs).
 * @typedef {{ tur: 'durumKodu' | 'soapYaniti' | 'soapHatasiYok' | 'soapHatasi' | 'icerir' | 'icermez' | 'xpathEsit' | 'jsonEsit' | 'veya' | 'dosya';
 *   deger?: string; xpath?: string; yol?: string; buyukKucukDuyarsiz?: boolean; duzenliIfade?: boolean; ad?: string; alt?: ServisKontrolu[];
 *   dosya?: import('../dosyalar/dosya-icerigi.mjs').DosyaTanimi }} ServisKontrolu
 * @typedef {{ operasyon: string; govde: string; kontroller: ServisKontrolu[]; kimlikProfili?: string; veriProfilleri?: Record<string, string>;
 *   tabloSecimleri?: Record<string, Record<string, string>>; aciklama?: string; kaynak?: Record<string, unknown>;
 *   basliklar?: Record<string, string>; http?: ServisHttpTanimi }} ServisSenaryoIcerigi
 * REST isteği (servis türü rest): metot, servis yoluna göre göreli yol (sorgu dahil; ${…} parametreleri olabilir), gövdenin içerik türü.
 * @typedef {{ metot: string; yol: string; icerikTuru?: string }} ServisHttpTanimi
 * @typedef {{ id: string; projeId: string; servisId: string; baslik: string; kapsam: 'test' | 'canli' | 'ikisi'; kosuyaDahil: boolean;
 *   sira: number | null; icerik: ServisSenaryoIcerigi; olusturulma: string; guncellenme: string }} ServisSenaryosu
 */

export const KONTROL_TURLERI = /** @type {const} */ (['durumKodu', 'soapYaniti', 'soapHatasiYok', 'soapHatasi', 'icerir', 'icermez', 'xpathEsit', 'jsonEsit', 'veya', 'dosya']);

/**
 * Tek kontrolü doğrular (VEYA'nın alt kontrolleri de; iç içe VEYA kabul edilmez).
 * @param {any} k @param {string} yer hata mesajı için ("2." / "2.1.") @param {boolean} altMi @returns {ServisKontrolu}
 */
function kontrolDogrula(k, yer, altMi) {
  if (!k || typeof k !== 'object') throw new DepoHatasi(`${yer} kontrol geçersiz.`);
  const tur = secenek(k.tur, KONTROL_TURLERI, `${yer} kontrolün türü`);
  if (tur === 'veya') {
    if (altMi) throw new DepoHatasi(`${yer} kontrol: VEYA içinde VEYA kullanılamaz.`);
    if (!Array.isArray(k.alt) || k.alt.length < 2) throw new DepoHatasi(`${yer} kontrol (VEYA) en az iki alt kontrol içermeli.`);
    return { tur, alt: k.alt.map((/** @type {unknown} */ a, /** @type {number} */ n) => kontrolDogrula(a, `${yer}${n + 1}.`, true)), ...(typeof k.ad === 'string' && k.ad ? { ad: k.ad } : {}) };
  }
  if (tur === 'dosya') {
    // Yanıttaki dosya (dosyalar/dosya-icerigi.mjs): beklentiler tanımda; VEYA içinde kullanılmaz (sonucu kendi beklentileridir).
    if (altMi) throw new DepoHatasi(`${yer} kontrol: dosya kontrolü VEYA içinde kullanılamaz.`);
    const d = dosyaTanimiDogrula(k.dosya);
    if (d.hatalar.length) throw new DepoHatasi(`${yer} kontrol (dosya): ${d.hatalar.join(' ')}`);
    const { tetikleyici: _t, zamanAsimiSn: _z, ...tanim } = d.tanim;
    return { tur, dosya: tanim, ...(typeof k.ad === 'string' && k.ad ? { ad: k.ad } : {}) };
  }
  if ((tur === 'icerir' || tur === 'icermez' || tur === 'xpathEsit' || tur === 'jsonEsit' || tur === 'durumKodu') && (typeof k.deger !== 'string' || !k.deger)) {
    throw new DepoHatasi(`${yer} kontrol (${tur}) için "deger" gerekli.`);
  }
  if (tur === 'xpathEsit' && (typeof k.xpath !== 'string' || !k.xpath.startsWith('/'))) throw new DepoHatasi(`${yer} kontrol için "/" ile başlayan "xpath" gerekli.`);
  if (tur === 'jsonEsit' && (typeof k.yol !== 'string' || !k.yol.trim())) throw new DepoHatasi(`${yer} kontrol için JSON "yol" gerekli (ör. data.id).`);
  if (k.duzenliIfade) {
    try { new RegExp(k.deger); } catch { throw new DepoHatasi(`${yer} kontroldeki düzenli ifade geçersiz.`); }
  }
  return /** @type {ServisKontrolu} */ (Object.fromEntries(Object.entries(k).filter(([a]) => ['tur', 'deger', 'xpath', 'yol', 'buyukKucukDuyarsiz', 'duzenliIfade', 'ad'].includes(a))));
}

/** @param {unknown} icerik @returns {ServisSenaryoIcerigi} */
export function senaryoIceriginiDogrula(icerik) {
  if (!icerik || typeof icerik !== 'object' || Array.isArray(icerik)) throw new DepoHatasi('"icerik" bir nesne olmalıdır.');
  // Akış senaryosu (tur 'akis'; akis-senaryo-icerigi.mjs): her operasyon adımının içeriği bu işlevle doğrulanır.
  if (akisSenaryosuMu(icerik)) return /** @type {any} */ (akisSenaryoIceriginiDogrula(icerik, senaryoIceriginiDogrula, DepoHatasi));
  const i = /** @type {Record<string, unknown>} */ (icerik);
  const operasyon = zorunluMetin(i.operasyon, 'operasyon');
  const http = httpTanimiDogrula(i.http);
  // REST isteğinde gövde boş olabilir (GET / DELETE); SOAP'ta zorunlu.
  const govde = http ? (typeof i.govde === 'string' ? i.govde : '') : zorunluMetin(i.govde, 'govde');
  if (!Array.isArray(i.kontroller)) throw new DepoHatasi('"kontroller" bir dizi olmalıdır.');
  const kontroller = i.kontroller.map((k, n) => kontrolDogrula(k, `${n + 1}.`, false));
  const tabloSecimleri = tabloSecimleriniDogrula(i.tabloSecimleri);
  const basliklar = basliklariDogrula(i.basliklar);
  const { tabloSecimleri: _eski, basliklar: _b, http: _h, ...kalan } = i;
  return { ...kalan, operasyon, govde, kontroller, ...(tabloSecimleri ? { tabloSecimleri } : {}), ...(basliklar ? { basliklar } : {}), ...(http ? { http } : {}) };
}

export const HTTP_METOTLARI = /** @type {const} */ (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * REST isteği tanımı: metot (listeden), göreli yol (boş, "/" ya da "?" ile başlar; boşluk / satır sonu yok), içerik türü (tek satır).
 * @param {unknown} v @returns {ServisHttpTanimi | undefined}
 */
function httpTanimiDogrula(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"http" bir nesne olmalıdır.');
  const o = /** @type {Record<string, unknown>} */ (v);
  const metot = secenek(typeof o.metot === 'string' ? o.metot.toUpperCase() : o.metot, HTTP_METOTLARI, 'http.metot');
  const yol = typeof o.yol === 'string' ? o.yol.trim() : '';
  if (yol && (!/^[/?]/.test(yol) || /\s/.test(yol.replace(/\$\{[^}]*\}/g, '')) || yol.length > 2000)) {
    throw new DepoHatasi('"http.yol" "/" ya da "?" ile başlamalı, ${…} dışında boşluk içermemeli (en çok 2000 karakter).');
  }
  const icerikTuru = typeof o.icerikTuru === 'string' ? o.icerikTuru.trim() : '';
  if (icerikTuru && (icerikTuru.length > 200 || /[\r\n]/.test(icerikTuru))) throw new DepoHatasi('"http.icerikTuru" geçersiz.');
  return { metot, yol, ...(icerikTuru ? { icerikTuru } : {}) };
}

/** İstek gövdesi / SOAP başlıkları koşucunun: senaryoda değiştirilemez. */
const KORUNAN_BASLIKLAR = new Set(['content-type', 'soapaction', 'content-length', 'host']);

/**
 * Ek HTTP başlıkları (ör. Authorization: Bearer ${akis:Token}): { Ad: değer } — ad HTTP belirteci, değer tek satır (en çok 4000).
 * @param {unknown} v @returns {Record<string, string> | undefined}
 */
function basliklariDogrula(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"basliklar" bir nesne olmalıdır.');
  const girdiler = Object.entries(v).filter(([, d]) => d !== '' && d !== undefined && d !== null);
  if (girdiler.length > 30) throw new DepoHatasi('Bir senaryoda en çok 30 başlık olabilir.');
  /** @type {Record<string, string>} */
  const s = {};
  for (const [ad, d] of girdiler) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(ad)) throw new DepoHatasi(`Geçersiz başlık adı: "${ad}".`);
    if (KORUNAN_BASLIKLAR.has(ad.toLowerCase())) throw new DepoHatasi(`"${ad}" başlığı koşucu tarafından yazılır; senaryoda verilemez.`);
    if (typeof d !== 'string' || d.length > 4000 || /[\r\n]/.test(d)) throw new DepoHatasi(`"${ad}" başlığının değeri geçersiz (tek satır metin, en çok 4000 karakter).`);
    s[ad] = d;
  }
  return Object.keys(s).length ? s : undefined;
}

/**
 * Senaryonun tablo seçimleri: { "<tabloId>|<etiket>": { Sütun: değer } } (boş gruplar atılır).
 * @param {unknown} v @returns {Record<string, Record<string, string>> | undefined}
 */
function tabloSecimleriniDogrula(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"tabloSecimleri" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, string>>} */
  const s = {};
  const gruplar = Object.entries(v);
  if (gruplar.length > 50) throw new DepoHatasi('Bir senaryoda en çok 50 tablo seçimi olabilir.');
  for (const [anahtar, secim] of gruplar) {
    if (!/^[A-Za-z0-9_-]{1,100}\|[\p{L}\p{N} _-]{0,40}$/u.test(anahtar)) throw new DepoHatasi(`Geçersiz tablo seçimi: "${anahtar}".`);
    if (!secim || typeof secim !== 'object' || Array.isArray(secim)) throw new DepoHatasi('Tablo seçimi bir nesne olmalıdır.');
    const temiz = Object.fromEntries(Object.entries(secim).filter(([k, d]) => typeof d === 'string' && d !== '' && k.length <= 60).map(([k, d]) => [k, d.slice(0, 500)]));
    if (Object.keys(temiz).length) s[anahtar] = temiz;
  }
  return Object.keys(s).length ? s : undefined;
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s @returns {ServisSenaryosu} */
const senaryoCevir = (vt, s) => ({
  id: String(s.id), projeId: String(s.proje_id), servisId: String(s.servis_id), baslik: String(s.baslik),
  kapsam: /** @type {'test' | 'canli' | 'ikisi'} */ (String(s.kapsam)), kosuyaDahil: s.kosuya_dahil === 1,
  sira: s.sira == null ? null : Number(s.sira), icerik: /** @type {ServisSenaryoIcerigi} */ (sifreliJsonOku(vt, s.icerik_json)),
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/**
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; servisId: string; baslik: string; kapsam?: 'test' | 'canli' | 'ikisi'; kosuyaDahil?: boolean; sira?: number | null; icerik: unknown; yapan?: string }} girdi
 */
export function servisSenaryosuKaydet(vt, girdi) {
  acikAnahtar(vt);
  // "Koşuda" ORTAM BAŞINA (icerik.kosuOrtamlari: { ortamId: boolean }) içerik doğrulamasından ayrı ele alınır:
  //  - verilirse (nesne) o yazılır; null verilirse silinir (tüm ortamlarda genel değer geçerli olur);
  //  - verilmezse mevcut korunur; ama genel "Koşuda" değeri açıkça DEĞİŞTİRİLDİYSE (düzenleyicideki anahtar) ortam ezmeleri silinir.
  const ham = girdi.icerik && typeof girdi.icerik === 'object' && !Array.isArray(girdi.icerik) ? /** @type {Record<string, unknown>} */ (girdi.icerik) : null;
  const { kosuOrtamlari: gelenOrtamlar, ...hamKalan } = ham ?? {};
  const temel = senaryoIceriginiDogrula(ham ? hamKalan : girdi.icerik);
  return vt.islem(() => {
    const servis = vt.tek('SELECT proje_id FROM servisler WHERE id = ?', [kimlik(girdi.servisId, 'servisId')]);
    if (!servis || servis.proje_id !== girdi.projeId) throw new DepoHatasi('Servis bulunamadı.');
    const mevcut = girdi.id ? vt.tek('SELECT * FROM servis_senaryolari WHERE id = ?', [girdi.id]) : undefined;
    const genelDegisti = mevcut && typeof girdi.kosuyaDahil === 'boolean' && girdi.kosuyaDahil !== (mevcut.kosuya_dahil === 1);
    const genel = girdi.kosuyaDahil ?? (mevcut ? mevcut.kosuya_dahil === 1 : true);
    // Genel değer "en az bir ortamda koşuda"dır; genel kapalıysa ezme tutulmaz (hiçbir ortamda koşmaz).
    const ortamlar = !genel ? undefined : gelenOrtamlar !== undefined ? kosuOrtamlariDogrula(gelenOrtamlar)
      : mevcut && !genelDegisti ? kosuOrtamlariDogrula(/** @type {any} */ (sifreliJsonOku(vt, mevcut.icerik_json))?.kosuOrtamlari) : undefined;
    const icerik = { ...temel, ...(ortamlar ? { kosuOrtamlari: ortamlar } : {}) };
    return kaydet(vt, 'servis_senaryolari', {
      proje_id: girdi.projeId, servis_id: girdi.servisId, baslik: zorunluMetin(girdi.baslik, 'baslik'),
      kapsam: secenek(girdi.kapsam ?? mevcut?.kapsam ?? 'test', SENARYO_KAPSAMLARI, 'kapsam'),
      kosuya_dahil: genel ? 1 : 0,
      sira: girdi.sira === undefined ? (mevcut?.sira ?? null) : girdi.sira,
      icerik_json: sifreliJson(vt, icerik, 'icerik')
    }, { id: girdi.id, gecmisTuru: 'servis_senaryosu', yapan: girdi.yapan });
  });
}

/**
 * Ortam başına "Koşuda" ezmeleri: { ortamId: boolean } (en çok 50; geçersiz girdiler atılır). Boş ya da null → undefined.
 * @param {unknown} v @returns {Record<string, boolean> | undefined}
 */
export function kosuOrtamlariDogrula(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const s = Object.fromEntries(Object.entries(v).filter(([k, d]) => /^[A-Za-z0-9_-]{1,100}$/.test(k) && typeof d === 'boolean').slice(0, 50));
  return Object.keys(s).length ? s : undefined;
}

/**
 * Senaryo bu ortamda "Koşuda" mı: ortam ezmesi varsa o, yoksa genel değer (kosuya_dahil). Eski kayıtlarda ezme yoktur → genel.
 * @param {{ kosuyaDahil: boolean; icerik: unknown }} s @param {string} ortamId
 */
export function servisOrtamdaKosuyaDahil(s, ortamId) {
  const o = /** @type {any} */ (s.icerik)?.kosuOrtamlari;
  return o && typeof o === 'object' && typeof o[ortamId] === 'boolean' ? o[ortamId] : s.kosuyaDahil;
}

/** @param {Veritabani} vt @param {string} id */
export function servisSenaryosuGetir(vt, id) {
  const s = vt.tek('SELECT * FROM servis_senaryolari WHERE id = ?', [id]);
  return s ? senaryoCevir(vt, s) : undefined;
}

/** @param {Veritabani} vt @param {string} servisId */
export function servisSenaryolariniListele(vt, servisId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM servis_senaryolari WHERE servis_id = ? ORDER BY IFNULL(sira, 1e9), olusturulma', [servisId])
    .map((s) => senaryoCevir(vt, s));
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function servisSenaryosuSil(vt, id, yapan) {
  return sil(vt, 'servis_senaryolari', id, { gecmisTuru: 'servis_senaryosu', yapan });
}

// ---------------------------------------------------------------------------------------
// Servis giriş bilgileri (gövdede ${USERNAME} gibi parametreler): adlı profiller. ortam_id NULL = profilin genel değerleri; ortama özel satır
// genel değerleri alan alan ezer (ör. CANLI'da farklı parola).
// ---------------------------------------------------------------------------------------

/** @param {unknown} degerler @returns {Record<string, string>} */
function kimlikDegerleri(degerler) {
  if (!degerler || typeof degerler !== 'object' || Array.isArray(degerler)) throw new DepoHatasi('"degerler" bir nesne olmalıdır.');
  /** @type {Record<string, string>} */
  const sonuc = {};
  for (const [ad, deger] of Object.entries(degerler)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(ad)) throw new DepoHatasi(`"${ad}" geçersiz bir giriş bilgisi alanı (harf ile başlar; harf, rakam, "_").`);
    if (typeof deger !== 'string') throw new DepoHatasi(`"${ad}" değeri metin olmalıdır.`);
    sonuc[ad] = deger;
  }
  return sonuc;
}

/** @param {unknown} ad */
function profilAdi(ad) {
  const a = zorunluMetin(ad, 'ad');
  if (a.length > 80) throw new DepoHatasi('Profil adı en fazla 80 karakter olabilir.');
  return a;
}

/**
 * Profilin (genel ya da ortama özel) değerlerini yazar. Verilen alanlar eklenir / değişir, boş metin verilen alan silinir,
 * verilmeyenler korunur. Hiç alan kalmazsa satır silinir.
 * @param {Veritabani} vt @param {{ projeId: string; ad: string; ortamId?: string | null; degerler: Record<string, string> }} girdi
 */
export function servisKimligiKaydet(vt, girdi) {
  acikAnahtar(vt);
  const projeId = kimlik(girdi.projeId, 'projeId');
  const ad = profilAdi(girdi.ad);
  const ortamId = girdi.ortamId ? kimlik(girdi.ortamId, 'ortamId') : null;
  const yeni = kimlikDegerleri(girdi.degerler);
  return vt.islem(() => {
    const mevcut = vt.tek("SELECT * FROM servis_kimlikleri WHERE proje_id = ? AND ad = ? AND IFNULL(ortam_id, '') = ?", [projeId, ad, ortamId ?? '']);
    const birlesik = { ...(mevcut ? sifreliJsonOku(vt, mevcut.degerler_json) : {}), ...yeni };
    for (const [a, d] of Object.entries(birlesik)) if (d === '') delete birlesik[a];
    if (!Object.keys(birlesik).length) {
      if (mevcut) vt.calistir('DELETE FROM servis_kimlikleri WHERE id = ?', [mevcut.id]);
      return null;
    }
    return kaydet(vt, 'servis_kimlikleri', { proje_id: projeId, ad, ortam_id: ortamId, degerler_json: sifreliJson(vt, birlesik, 'degerler') },
      { id: mevcut ? String(mevcut.id) : undefined });
  });
}

/** Profilin tüm satırlarını (genel + ortama özel) siler. @param {Veritabani} vt @param {string} projeId @param {string} ad */
export function servisKimligiSil(vt, projeId, ad) {
  return vt.islem(() => {
    const n = vt.tumu('SELECT id FROM servis_kimlikleri WHERE proje_id = ? AND ad = ?', [projeId, ad]).length;
    vt.calistir('DELETE FROM servis_kimlikleri WHERE proje_id = ? AND ad = ?', [projeId, ad]);
    return n > 0;
  });
}

/**
 * Arayüz için özet: profiller ve tanımlı alan ADLARI (DEĞERLER DÖNMEZ).
 * @param {Veritabani} vt @param {string} projeId
 * @returns {{ ad: string; alanlar: string[]; ortamlar: Record<string, string[]> }[]}
 */
export function servisKimlikOzeti(vt, projeId) {
  acikAnahtar(vt);
  /** @type {Map<string, { ad: string; alanlar: string[]; ortamlar: Record<string, string[]> }>} */
  const profiller = new Map();
  for (const s of vt.tumu('SELECT * FROM servis_kimlikleri WHERE proje_id = ?', [projeId])) {
    const ad = String(s.ad);
    const p = profiller.get(ad) ?? { ad, alanlar: [], ortamlar: {} };
    const alanlar = Object.keys(sifreliJsonOku(vt, s.degerler_json)).sort();
    if (s.ortam_id == null) p.alanlar = alanlar;
    else p.ortamlar[String(s.ortam_id)] = alanlar;
    profiller.set(ad, p);
  }
  return [...profiller.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * Koşuda kullanılacak ÇÖZÜLMÜŞ değerler: profilin genel değerleri + ortama özel ezmeler. Yalnızca sunucu içinde kullanılır.
 * Profil yoksa boş nesne (eksik alanlar yer tutucu doldurulurken açık hatayla bildirilir).
 * @param {Veritabani} vt @param {string} projeId @param {string} ad @param {string} ortamId @returns {Record<string, string>}
 */
export function servisKimliginiCoz(vt, projeId, ad, ortamId) {
  acikAnahtar(vt);
  const genel = vt.tek('SELECT degerler_json FROM servis_kimlikleri WHERE proje_id = ? AND ad = ? AND ortam_id IS NULL', [projeId, ad]);
  const ozel = vt.tek('SELECT degerler_json FROM servis_kimlikleri WHERE proje_id = ? AND ad = ? AND ortam_id = ?', [projeId, ad, ortamId]);
  return { ...(genel ? sifreliJsonOku(vt, genel.degerler_json) : {}), ...(ozel ? sifreliJsonOku(vt, ozel.degerler_json) : {}) };
}

// ---------------------------------------------------------------------------------------
// Servis koşuları (deneme ve koşu sonuçları — ekran sonuçlarından ayrı)
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ id: string; projeId: string; servisId: string; senaryoId: string | null; ortamId: string | null; tur: 'dene' | 'kosu';
 *   durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik: string; sonuc: Record<string, any> }} ServisKosusu
 */

/**
 * @param {Veritabani} vt
 * @param {{ projeId: string; servisId: string; senaryoId?: string | null; ortamId?: string | null; tur: 'dene' | 'kosu';
 *   durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik?: string; sonuc: Record<string, unknown> }} girdi
 */
export function servisKosusuKaydet(vt, girdi) {
  acikAnahtar(vt);
  const id = randomUUID();
  vt.calistir(`INSERT INTO servis_kosulari (id, proje_id, servis_id, senaryo_id, ortam_id, tur, durum, baslangic, sure_ms, baslik, sonuc_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, kimlik(girdi.projeId, 'projeId'), kimlik(girdi.servisId, 'servisId'), girdi.senaryoId ?? null, girdi.ortamId ?? null,
    secenek(girdi.tur, ['dene', 'kosu'], 'tur'), secenek(girdi.durum, KOSU_DURUMLARI, 'durum'), girdi.baslangic,
    Math.max(0, Math.round(girdi.sureMs)), girdi.baslik ?? '', sifreliJson(vt, girdi.sonuc, 'sonuc')
  ]);
  return id;
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s @param {boolean} ayrinti @returns {ServisKosusu} */
const kosuCevir = (vt, s, ayrinti) => ({
  id: String(s.id), projeId: String(s.proje_id), servisId: String(s.servis_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id),
  ortamId: s.ortam_id == null ? null : String(s.ortam_id), tur: /** @type {'dene' | 'kosu'} */ (String(s.tur)),
  durum: /** @type {'basarili' | 'basarisiz' | 'hata'} */ (String(s.durum)), baslangic: String(s.baslangic), sureMs: Number(s.sure_ms),
  baslik: String(s.baslik), sonuc: ayrinti ? sifreliJsonOku(vt, s.sonuc_json) : {}
});

/** En yeniler önce; ayrıntı (istek/yanıt) yalnızca servisKosusuGetir ile. @param {Veritabani} vt @param {{ servisId: string; senaryoId?: string; sinir?: number }} filtre */
export function servisKosulariniListele(vt, filtre) {
  const kosullar = ['servis_id = ?'];
  const degerler = [filtre.servisId];
  if (filtre.senaryoId) { kosullar.push('senaryo_id = ?'); degerler.push(filtre.senaryoId); }
  const sinir = Math.min(Math.max(Number(filtre.sinir) || 200, 1), 1000);
  return vt.tumu(`SELECT id, proje_id, servis_id, senaryo_id, ortam_id, tur, durum, baslangic, sure_ms, baslik FROM servis_kosulari
    WHERE ${kosullar.join(' AND ')} ORDER BY baslangic DESC LIMIT ${sinir}`, degerler).map((s) => kosuCevir(vt, s, false));
}

/** @param {Veritabani} vt @param {string} id */
export function servisKosusuGetir(vt, id) {
  const s = vt.tek('SELECT * FROM servis_kosulari WHERE id = ?', [id]);
  return s ? kosuCevir(vt, s, true) : undefined;
}

// ---------------------------------------------------------------------------------------
// Servis akışları (sürüm 11): sırayla koşan servis senaryoları; adım yanıtından okunan değer sonraki adımlarda ${akis:Ad}
// ---------------------------------------------------------------------------------------

export const AKIS_TURLERI = /** @type {const} */ (['akis', 'oturum']);
export const OKUMA_KAYNAKLARI = /** @type {const} */ (['xml', 'json', 'baslik']);
const OKUMA_ADI = /^[A-Za-z_][A-Za-z0-9_-]{0,59}$/;
export const EN_COK_AKIS_ADIMI = 30;
/** Oturum akışının değerleri (token) varsayılan olarak 1 saat geçerli. */
export const VARSAYILAN_OTURUM_OMRU_SN = 3600;
export const TOKEN_YENILEME = /** @type {const} */ (['suresiDolunca', 'herIstekte']);

/**
 * @typedef {{ ad: string; kaynak: 'xml' | 'json' | 'baslik'; yol: string; gizli?: boolean }} AkisOkumaTanimi
 * @typedef {{ id: string; ad: string; servisId: string; senaryoId: string; okumalar: AkisOkumaTanimi[]; hataOlursaDevam?: boolean; tur?: 'sql' | 'operasyon'; sql?: any;
 *   operasyon?: string; baglar?: Record<string, string> }} AkisAdimi
 *   tur 'sql': SQL sorgusu adımı (servisId / senaryoId yok; sql: sql-adimi.mjs SqlTanimi).
 * @typedef {{ adimlar: AkisAdimi[]; omurSaniye?: number; tokenYenileme?: 'suresiDolunca' | 'herIstekte'; aciklama?: string }} ServisAkisIcerigi
 *   tokenYenileme (oturum akışı): süresiDolunca (varsayılan: değer ömür boyunca koşular arasında yeniden kullanılır) ·
 *   herIstekte (her senaryo çalıştırmasında oturum akışı yeniden koşulur).
 * @typedef {{ id: string; projeId: string; baslik: string; tur: 'akis' | 'oturum'; kapsam: 'test' | 'canli' | 'ikisi'; kosuyaDahil: boolean;
 *   sira: number | null; icerik: ServisAkisIcerigi; olusturulma: string; guncellenme: string }} ServisAkisi
 */

/**
 * Akış içeriğinin yapısal doğrulaması (servis / senaryo varlığı ve ${akis:} kullanımı servis-akislari.mjs'de).
 * s.satirSiniri: SQL adımlarının beklenen satır sayısı için kullanıcının satır sınırı (bkz. kosu-ayarlari.mjs > sqlSatirSiniriOku).
 * @param {unknown} icerik @param {'akis' | 'oturum'} tur @param {{ satirSiniri?: number }} [s] @returns {ServisAkisIcerigi}
 */
export function akisIceriginiDogrula(icerik, tur, s = {}) {
  if (!icerik || typeof icerik !== 'object' || Array.isArray(icerik)) throw new DepoHatasi('"icerik" bir nesne olmalıdır.');
  const i = /** @type {Record<string, unknown>} */ (icerik);
  if (!Array.isArray(i.adimlar) || !i.adimlar.length) throw new DepoHatasi('Akışta en az bir adım olmalıdır.');
  if (i.adimlar.length > EN_COK_AKIS_ADIMI) throw new DepoHatasi(`Bir akışta en çok ${EN_COK_AKIS_ADIMI} adım olabilir.`);
  const kimlikler = new Set();
  const adimlar = i.adimlar.map((x, n) => {
    const a = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
    const yer = `${n + 1}. adım`;
    const id = typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(a.id) && !kimlikler.has(a.id) ? a.id : `adim${n + 1}`;
    kimlikler.add(id);
    // SQL adımı (sql/sql-adimi.mjs): servis / senaryo yok; sorgudan okunan değerler tanımın okumalarında (sql.okumalar).
    if (a.tur === 'sql') {
      const d = sqlTanimiDogrula(a.sql, { satirSiniri: s.satirSiniri });
      if (d.hatalar.length) throw new DepoHatasi(`${yer} (SQL): ${d.hatalar.join(' ')}`);
      return { id, ad: typeof a.ad === 'string' && a.ad.trim() ? a.ad.trim().slice(0, 100) : yer, tur: 'sql', sql: d.tanim, okumalar: [], ...(a.hataOlursaDevam === true ? { hataOlursaDevam: true } : {}) };
    }
    const okumalar = a.okumalar === undefined ? [] : a.okumalar;
    if (!Array.isArray(okumalar) || okumalar.length > 20) throw new DepoHatasi(`${yer}: "okumalar" en çok 20 öğelik bir dizi olmalıdır.`);
    // Operasyon adımı (akis-senaryo-icerigi.mjs): servisin bir operasyonu; alan değerleri akış senaryosunda, bağlar burada.
    const opMi = a.tur === 'operasyon';
    return {
      id, ad: typeof a.ad === 'string' && a.ad.trim() ? a.ad.trim().slice(0, 100) : yer,
      ...(opMi
        ? { tur: 'operasyon', servisId: kimlik(a.servisId, `${yer} servisId`), operasyon: zorunluMetin(a.operasyon, `${yer} operasyon`), baglar: baglariDogrula(a.baglar, yer, DepoHatasi) }
        : { servisId: kimlik(a.servisId, `${yer} servisId`), senaryoId: kimlik(a.senaryoId, `${yer} senaryoId`) }),
      okumalar: okumalar.map((y, k) => {
        const o = /** @type {Record<string, unknown>} */ (y && typeof y === 'object' ? y : {});
        const ad = typeof o.ad === 'string' ? o.ad.trim() : '';
        if (!OKUMA_ADI.test(ad)) throw new DepoHatasi(`${yer}, ${k + 1}. okuma: ad geçersiz (harf ya da "_" ile başlar; harf, rakam, "_", "-").`);
        const yol = typeof o.yol === 'string' ? o.yol.trim() : '';
        if (!yol || yol.length > 300) throw new DepoHatasi(`${yer}, "${ad}" okuması: yol boş olamaz (en çok 300 karakter).`);
        return { ad, kaynak: secenek(o.kaynak ?? 'xml', OKUMA_KAYNAKLARI, `${ad} kaynak`), yol, ...(typeof o.gizli === 'boolean' ? { gizli: o.gizli } : {}) };
      }),
      ...(a.hataOlursaDevam === true ? { hataOlursaDevam: true } : {})
    };
  });
  const omur = i.omurSaniye === undefined || i.omurSaniye === null || i.omurSaniye === '' ? undefined : Number(i.omurSaniye);
  if (omur !== undefined && (!Number.isInteger(omur) || omur < 30 || omur > 86_400)) throw new DepoHatasi('"omurSaniye" 30 ile 86400 arasında tam sayı olmalıdır.');
  if (tur === 'oturum' && !adimlar.some((a) => a.okumalar.length || a.sql?.okumalar?.length)) throw new DepoHatasi('Oturum akışı en az bir değer okumalıdır (ör. Token).');
  return {
    adimlar, ...(tur === 'oturum' ? { omurSaniye: omur ?? VARSAYILAN_OTURUM_OMRU_SN, tokenYenileme: secenek(i.tokenYenileme ?? 'suresiDolunca', TOKEN_YENILEME, 'tokenYenileme') } : {}),
    ...(typeof i.aciklama === 'string' && i.aciklama.trim() ? { aciklama: i.aciklama.trim().slice(0, 2000) } : {})
  };
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s @returns {ServisAkisi} */
const akisCevir = (vt, s) => ({
  id: String(s.id), projeId: String(s.proje_id), baslik: String(s.baslik), tur: /** @type {'akis' | 'oturum'} */ (String(s.tur)),
  kapsam: /** @type {'test' | 'canli' | 'ikisi'} */ (String(s.kapsam)), kosuyaDahil: s.kosuya_dahil === 1, sira: s.sira == null ? null : Number(s.sira),
  icerik: /** @type {ServisAkisIcerigi} */ (sifreliJsonOku(vt, s.icerik_json)), olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/**
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; baslik: string; tur?: 'akis' | 'oturum'; kapsam?: 'test' | 'canli' | 'ikisi'; kosuyaDahil?: boolean;
 *   sira?: number | null; icerik: unknown; yapan?: string }} girdi
 */
export function servisAkisiKaydet(vt, girdi) {
  acikAnahtar(vt);
  return vt.islem(() => {
    const mevcut = girdi.id ? vt.tek('SELECT * FROM servis_akislari WHERE id = ?', [girdi.id]) : undefined;
    if (girdi.id && mevcut && mevcut.proje_id !== girdi.projeId) throw new DepoHatasi('Akış bulunamadı.');
    const tur = secenek(girdi.tur ?? mevcut?.tur ?? 'akis', AKIS_TURLERI, 'tur');
    return kaydet(vt, 'servis_akislari', {
      proje_id: kimlik(girdi.projeId, 'projeId'), baslik: zorunluMetin(girdi.baslik, 'baslik').slice(0, 200), tur,
      kapsam: secenek(girdi.kapsam ?? mevcut?.kapsam ?? 'test', SENARYO_KAPSAMLARI, 'kapsam'),
      kosuya_dahil: (girdi.kosuyaDahil ?? (mevcut ? mevcut.kosuya_dahil === 1 : true)) ? 1 : 0,
      sira: girdi.sira === undefined ? (mevcut?.sira ?? null) : girdi.sira,
      icerik_json: sifreliJson(vt, akisIceriginiDogrula(girdi.icerik, tur, { satirSiniri: sqlSatirSiniriOku(vt) }), 'icerik')
    }, { id: girdi.id, gecmisTuru: 'servis_akisi', yapan: girdi.yapan });
  });
}

/** @param {Veritabani} vt @param {string} id */
export function servisAkisiGetir(vt, id) {
  const s = vt.tek('SELECT * FROM servis_akislari WHERE id = ?', [id]);
  return s ? akisCevir(vt, s) : undefined;
}

/** @param {Veritabani} vt @param {string} projeId */
export function servisAkislariniListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM servis_akislari WHERE proje_id = ? ORDER BY IFNULL(sira, 1e9), olusturulma', [projeId]).map((s) => akisCevir(vt, s));
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function servisAkisiSil(vt, id, yapan) {
  return sil(vt, 'servis_akislari', id, { gecmisTuru: 'servis_akisi', yapan });
}

/**
 * @typedef {{ id: string; projeId: string; akisId: string | null; ortamId: string | null; tur: 'dene' | 'kosu';
 *   durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik: string; sonuc: Record<string, any> }} ServisAkisKosusu
 */

/**
 * @param {Veritabani} vt
 * @param {{ projeId: string; akisId?: string | null; ortamId?: string | null; tur: 'dene' | 'kosu'; durum: 'basarili' | 'basarisiz' | 'hata';
 *   baslangic: string; sureMs: number; baslik?: string; sonuc: Record<string, unknown> }} girdi
 */
export function servisAkisKosusuKaydet(vt, girdi) {
  acikAnahtar(vt);
  const id = randomUUID();
  vt.calistir(`INSERT INTO servis_akis_kosulari (id, proje_id, akis_id, ortam_id, tur, durum, baslangic, sure_ms, baslik, sonuc_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, kimlik(girdi.projeId, 'projeId'), girdi.akisId ?? null, girdi.ortamId ?? null, secenek(girdi.tur, ['dene', 'kosu'], 'tur'),
    secenek(girdi.durum, KOSU_DURUMLARI, 'durum'), girdi.baslangic, Math.max(0, Math.round(girdi.sureMs)), girdi.baslik ?? '', sifreliJson(vt, girdi.sonuc, 'sonuc')
  ]);
  return id;
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s @param {boolean} ayrinti @returns {ServisAkisKosusu} */
const akisKosuCevir = (vt, s, ayrinti) => ({
  id: String(s.id), projeId: String(s.proje_id), akisId: s.akis_id == null ? null : String(s.akis_id), ortamId: s.ortam_id == null ? null : String(s.ortam_id),
  tur: /** @type {'dene' | 'kosu'} */ (String(s.tur)), durum: /** @type {'basarili' | 'basarisiz' | 'hata'} */ (String(s.durum)),
  baslangic: String(s.baslangic), sureMs: Number(s.sure_ms), baslik: String(s.baslik), sonuc: ayrinti ? sifreliJsonOku(vt, s.sonuc_json) : {}
});

/** En yeniler önce. @param {Veritabani} vt @param {{ projeId: string; akisId?: string; sinir?: number }} filtre */
export function servisAkisKosulariniListele(vt, filtre) {
  const kosullar = ['proje_id = ?'];
  const degerler = [filtre.projeId];
  if (filtre.akisId) { kosullar.push('akis_id = ?'); degerler.push(filtre.akisId); }
  const sinir = Math.min(Math.max(Number(filtre.sinir) || 200, 1), 1000);
  return vt.tumu(`SELECT id, proje_id, akis_id, ortam_id, tur, durum, baslangic, sure_ms, baslik FROM servis_akis_kosulari
    WHERE ${kosullar.join(' AND ')} ORDER BY baslangic DESC LIMIT ${sinir}`, degerler).map((s) => akisKosuCevir(vt, s, false));
}

/** @param {Veritabani} vt @param {string} id */
export function servisAkisKosusuGetir(vt, id) {
  const s = vt.tek('SELECT * FROM servis_akis_kosulari WHERE id = ?', [id]);
  return s ? akisKosuCevir(vt, s, true) : undefined;
}
