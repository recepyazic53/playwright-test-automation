// SERVİS TESTLERİ — veri katmanı (servisler, servis senaryoları, servis giriş bilgileri, servis koşuları).
// Ekran kayıtlarından ve ekran koşularından AYRIDIR: servis raporları ekran sonuçlarına karışmaz.
// Şifreli sütunlar gocler.mjs SIFRELI_ALANLAR'da; yazmak/okumak için kasa açık olmalıdır.
import { randomUUID } from 'node:crypto';
import { acikAnahtar, coz, sifrele, zarfMi } from '../kasa.mjs';
import { DepoHatasi, gecmisYaz, jsonMetni, testVerisiTurleriniListele } from '../veritabani/depo.mjs';
import { TANIM_TURLERI } from './parametre-tanimlari.mjs';

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
 * @typedef {{ ad: string; eylem?: string }} ServisOperasyonu
 * @typedef {{ yol?: string; tabanlar?: Record<string, string>; wsdlYolu?: string; soapSurumu?: '1.1' | '1.2'; operasyonlar?: ServisOperasyonu[];
 *   adresler?: Record<string, string>; yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean;
 *   kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
 *   operasyonSemalari?: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi>;
 *   alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>; alanZorunluluklari?: Record<string, string[]>;
 *   ekAlanlar?: Record<string, Array<{ yol: string; tip?: import('./servis-govdesi.mjs').AlanTipi }>>;
 *   alanListeleri?: Record<string, Record<string, string>>;
 *   erisim?: { ortamId: string; zaman: string; durumKodu: number } }} ServisAyarlari
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
 * - veya: alt kontrollerden EN AZ BİRİ geçerse geçer (alt: kontroller; iç içe VEYA yok). Senaryonun kontrol listesi VE'dir.
 * @typedef {{ tur: 'durumKodu' | 'soapYaniti' | 'soapHatasiYok' | 'soapHatasi' | 'icerir' | 'icermez' | 'xpathEsit' | 'veya';
 *   deger?: string; xpath?: string; buyukKucukDuyarsiz?: boolean; duzenliIfade?: boolean; ad?: string; alt?: ServisKontrolu[] }} ServisKontrolu
 * @typedef {{ operasyon: string; govde: string; kontroller: ServisKontrolu[]; kimlikProfili?: string; veriProfilleri?: Record<string, string>;
 *   aciklama?: string; kaynak?: Record<string, unknown> }} ServisSenaryoIcerigi
 * @typedef {{ id: string; projeId: string; servisId: string; baslik: string; kapsam: 'test' | 'canli' | 'ikisi'; kosuyaDahil: boolean;
 *   sira: number | null; icerik: ServisSenaryoIcerigi; olusturulma: string; guncellenme: string }} ServisSenaryosu
 */

export const KONTROL_TURLERI = /** @type {const} */ (['durumKodu', 'soapYaniti', 'soapHatasiYok', 'soapHatasi', 'icerir', 'icermez', 'xpathEsit', 'veya']);

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
  if ((tur === 'icerir' || tur === 'icermez' || tur === 'xpathEsit' || tur === 'durumKodu') && (typeof k.deger !== 'string' || !k.deger)) {
    throw new DepoHatasi(`${yer} kontrol (${tur}) için "deger" gerekli.`);
  }
  if (tur === 'xpathEsit' && (typeof k.xpath !== 'string' || !k.xpath.startsWith('/'))) throw new DepoHatasi(`${yer} kontrol için "/" ile başlayan "xpath" gerekli.`);
  if (k.duzenliIfade) {
    try { new RegExp(k.deger); } catch { throw new DepoHatasi(`${yer} kontroldeki düzenli ifade geçersiz.`); }
  }
  return /** @type {ServisKontrolu} */ (Object.fromEntries(Object.entries(k).filter(([a]) => ['tur', 'deger', 'xpath', 'buyukKucukDuyarsiz', 'duzenliIfade', 'ad'].includes(a))));
}

/** @param {unknown} icerik @returns {ServisSenaryoIcerigi} */
export function senaryoIceriginiDogrula(icerik) {
  if (!icerik || typeof icerik !== 'object' || Array.isArray(icerik)) throw new DepoHatasi('"icerik" bir nesne olmalıdır.');
  const i = /** @type {Record<string, unknown>} */ (icerik);
  const operasyon = zorunluMetin(i.operasyon, 'operasyon');
  const govde = zorunluMetin(i.govde, 'govde');
  if (!Array.isArray(i.kontroller)) throw new DepoHatasi('"kontroller" bir dizi olmalıdır.');
  const kontroller = i.kontroller.map((k, n) => kontrolDogrula(k, `${n + 1}.`, false));
  return { ...i, operasyon, govde, kontroller };
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
  const icerik = senaryoIceriginiDogrula(girdi.icerik);
  return vt.islem(() => {
    const servis = vt.tek('SELECT proje_id FROM servisler WHERE id = ?', [kimlik(girdi.servisId, 'servisId')]);
    if (!servis || servis.proje_id !== girdi.projeId) throw new DepoHatasi('Servis bulunamadı.');
    const mevcut = girdi.id ? vt.tek('SELECT * FROM servis_senaryolari WHERE id = ?', [girdi.id]) : undefined;
    return kaydet(vt, 'servis_senaryolari', {
      proje_id: girdi.projeId, servis_id: girdi.servisId, baslik: zorunluMetin(girdi.baslik, 'baslik'),
      kapsam: secenek(girdi.kapsam ?? mevcut?.kapsam ?? 'test', SENARYO_KAPSAMLARI, 'kapsam'),
      kosuya_dahil: (girdi.kosuyaDahil ?? (mevcut ? mevcut.kosuya_dahil === 1 : true)) ? 1 : 0,
      sira: girdi.sira === undefined ? (mevcut?.sira ?? null) : girdi.sira,
      icerik_json: sifreliJson(vt, icerik, 'icerik')
    }, { id: girdi.id, gecmisTuru: 'servis_senaryosu', yapan: girdi.yapan });
  });
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
// Servis parametre tanımları (bir alanın alabileceği değerler; bkz. parametre-tanimlari.mjs)
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {Record<string, unknown>} s @returns {import('./parametre-tanimlari.mjs').ParametreTanimi} */
function tanimCevir(vt, s) {
  const i = sifreliJsonOku(vt, s.icerik_json);
  return {
    id: String(s.id), projeId: String(s.proje_id), ad: String(s.ad), aciklama: i.aciklama || '', tur: i.tur || 'serbest',
    degerler: Array.isArray(i.degerler) ? i.degerler : [], kaynak: i.kaynak || null, varsayilan: i.varsayilan || '',
    elleYazilabilir: i.elleYazilabilir !== false, kullanim: i.kullanim === 'ekran' ? 'ekran' : 'servis',
    hedef: i.hedef && typeof i.hedef === 'object' ? i.hedef : null, kosullar: Array.isArray(i.kosullar) ? i.kosullar : []
  };
}

/** Kasa açık olmalıdır. Ada göre sıralı. @param {Veritabani} vt @param {string} projeId */
export function servisParametreTanimlariniListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM servis_parametre_tanimlari WHERE proje_id = ? ORDER BY ad COLLATE NOCASE, olusturulma', [kimlik(projeId, 'projeId')])
    .map((s) => tanimCevir(vt, s));
}

/**
 * Kaydeder (id varsa günceller). Kurallar: ad geçerli XML alan adı; liste türünde en az bir değer, değerler tekrarsız;
 * test_verisi türünde kaynak tür / alan var ve hassas değil; varsayılan (liste / evet-hayır) listede olmalı; ad projede tekil
 * (harf duyarsız). Kullanım yeri:
 * - servis: hedef { servisId ('' = tüm servisler), parametre (alan adı; '' = yalnız metot tablosunda bağlanır) }
 * - ekran : hedef { ekranId, alan (model alan kimliği) } — zorunlu
 * Koşullar ("ve"): [{ alan, deger }] — servis için parametre adı, ekran için aynı ekranın alan kimliği; en fazla 5.
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; ad: string; aciklama?: string; tur: string; degerler?: Array<{ deger: unknown; aciklama?: unknown; ekranDegeri?: unknown; ekranMetni?: unknown }>;
 *   kaynak?: { turId: string; alan: string } | null; varsayilan?: string; elleYazilabilir?: boolean;
 *   kullanim?: string; (degerler öğeleri ayrıca ekranDegeri?, ekranMetni? taşıyabilir: sayfadaki value / görünen metin) hedef?: { servisId?: string; parametre?: string; ekranId?: string; alan?: string; alanEtiketi?: string } | null; kosullar?: Array<{ alan?: unknown; deger?: unknown; etiket?: unknown }> }} girdi
 */
export function servisParametreTanimiKaydet(vt, girdi) {
  acikAnahtar(vt);
  return vt.islem(() => {
    const projeId = kimlik(girdi.projeId, 'projeId');
    const ad = zorunluMetin(girdi.ad, 'Parametre adı');
    if (ad.length > 80 || /[\u0000-\u001f<>]/.test(ad)) throw new DepoHatasi(`Liste adı geçersiz: en fazla 80 karakter; < > ve kontrol karakteri içeremez.`);
    const tur = secenek(girdi.tur, TANIM_TURLERI, 'Değer türü');
    const aciklama = typeof girdi.aciklama === 'string' ? girdi.aciklama.trim().slice(0, 500) : '';
    /** @type {Array<{ deger: string; aciklama?: string }>} */
    let degerler = [];
    if (tur === 'liste' || tur === 'mantiksal') {
      for (const x of girdi.degerler || []) {
        const deger = String(x?.deger ?? '').trim();
        if (!deger) continue;
        if (deger.length > 200) throw new DepoHatasi('Bir değer en fazla 200 karakter olabilir.');
        if (degerler.some((y) => y.deger === deger)) throw new DepoHatasi(`"${deger}" değeri iki kez yazılmış.`);
        const a = typeof x.aciklama === 'string' ? x.aciklama.trim().slice(0, 200) : '';
        const ed = typeof x.ekranDegeri === 'string' ? x.ekranDegeri.trim().slice(0, 200) : '';
        const em = typeof x.ekranMetni === 'string' ? x.ekranMetni.trim().slice(0, 200) : '';
        degerler.push({ deger, ...(a ? { aciklama: a } : {}), ...(ed && ed !== deger ? { ekranDegeri: ed } : {}), ...(em ? { ekranMetni: em } : {}) });
      }
      if (tur === 'mantiksal') degerler = degerler.filter((x) => x.deger === 'true' || x.deger === 'false');
      if (tur === 'liste' && !degerler.length) throw new DepoHatasi('Liste türünde en az bir değer girin.');
      if (degerler.length > 2000) throw new DepoHatasi('Bir listede en fazla 2000 değer olabilir.');
    }
    /** @type {{ turId: string; alan: string } | null} */
    let kaynak = null;
    if (tur === 'test_verisi') {
      const k = girdi.kaynak;
      const t = k ? testVerisiTurleriniListele(vt, projeId).find((x) => x.id === k.turId) : undefined;
      if (!t) throw new DepoHatasi('Değerlerin geleceği test verisi türünü seçin.');
      const a = t.alanlar.find((x) => x.ad === k?.alan);
      if (!a) throw new DepoHatasi(`"${t.ad}" türünde "${k?.alan ?? ''}" alanı yok.`);
      if (a.hassas) throw new DepoHatasi(`"${t.ad}.${a.etiket || a.ad}" hassas bir alan; değerleri listelenemez. Hassas olmayan bir alan seçin.`);
      kaynak = { turId: t.id, alan: a.ad };
    }
    const varsayilan = typeof girdi.varsayilan === 'string' ? girdi.varsayilan.trim().slice(0, 200) : '';
    const elleYazilabilir = girdi.elleYazilabilir !== false;
    if (varsayilan && tur === 'mantiksal' && !['true', 'false'].includes(varsayilan)) throw new DepoHatasi('Evet / Hayır türünde varsayılan "true" ya da "false" olabilir.');
    if (varsayilan && tur === 'liste' && !elleYazilabilir && !degerler.some((x) => x.deger === varsayilan)) throw new DepoHatasi(`Varsayılan değer (${varsayilan}) listede yok.`);
    // Kullanım yeri, hedef ve koşullar.
    const kullanim = girdi.kullanim === 'ekran' ? 'ekran' : 'servis';
    const h = girdi.hedef && typeof girdi.hedef === 'object' ? girdi.hedef : {};
    const alanAdi = (/** @type {unknown} */ x, /** @type {string} */ ne) => {
      const s = typeof x === 'string' ? x.trim() : '';
      if (s.length > 200 || /[\u0000-\u001f]/.test(s)) throw new DepoHatasi(`${ne} geçersiz.`);
      return s;
    };
    /** @type {Record<string, string>} */
    let hedef;
    if (kullanim === 'ekran') {
      const ekranId = typeof h.ekranId === 'string' ? h.ekranId : '';
      if (!ekranId || !vt.tek('SELECT id FROM ekranlar WHERE id = ? AND proje_id = ?', [ekranId, projeId])) throw new DepoHatasi('Listenin kullanılacağı ekranı seçin.');
      const alan = alanAdi(h.alan, 'Input');
      if (!alan) throw new DepoHatasi('Listenin kullanılacağı input\'u seçin.');
      const alanEtiketi = alanAdi(h.alanEtiketi, 'Input etiketi');
      hedef = { ekranId, alan, ...(alanEtiketi ? { alanEtiketi } : {}) };
    } else {
      const servisId = typeof h.servisId === 'string' ? h.servisId : '';
      if (servisId && !vt.tek('SELECT id FROM servisler WHERE id = ? AND proje_id = ?', [servisId, projeId])) throw new DepoHatasi('Seçilen servis bu projede yok.');
      hedef = { servisId, parametre: alanAdi(h.parametre, 'Parametre') };
    }
    const kosullar = [];
    for (const k of girdi.kosullar || []) {
      const alan = alanAdi(k?.alan, 'Bağlı olduğu parametre');
      const deger = typeof k?.deger === 'string' ? k.deger.trim().slice(0, 200) : String(k?.deger ?? '').trim().slice(0, 200);
      if (!alan && !deger) continue;
      if (!alan || !deger) throw new DepoHatasi('Her koşulda bağlı olduğu parametreyi ve değerini seçin.');
      if (alan === (hedef.alan ?? hedef.parametre)) throw new DepoHatasi('Liste kendi parametresine bağlanamaz.');
      if (kosullar.some((x) => x.alan === alan)) throw new DepoHatasi(`"${alan}" iki kez koşul olarak seçilmiş.`);
      const etiket = alanAdi(k?.etiket, 'Koşul etiketi');
      kosullar.push({ alan, deger, ...(etiket && etiket !== alan ? { etiket } : {}) });
    }
    if (kosullar.length > 5) throw new DepoHatasi('En fazla 5 koşul olabilir.');
    if (kosullar.length && kullanim === 'servis' && !hedef.parametre) throw new DepoHatasi('Koşullu listede parametreyi seçin.');
    if (servisParametreTanimlariniListele(vt, projeId).some((t) => t.id !== girdi.id && t.ad.toLocaleLowerCase('en') === ad.toLocaleLowerCase('en'))) {
      throw new DepoHatasi(`"${ad}" adlı bir değer listesi zaten var; onu düzenleyin ya da başka bir ad verin (ör. "${ad} (Travel)").`);
    }
    if (girdi.id) {
      const mevcut = vt.tek('SELECT proje_id FROM servis_parametre_tanimlari WHERE id = ?', [kimlik(girdi.id)]);
      if (mevcut && mevcut.proje_id !== projeId) throw new DepoHatasi('Tanım bu projeye ait değil.');
    }
    return kaydet(vt, 'servis_parametre_tanimlari', {
      proje_id: projeId, ad,
      icerik_json: sifreliJson(vt, { aciklama, tur, degerler, kaynak, varsayilan, elleYazilabilir, kullanim, hedef, kosullar }, 'icerik')
    }, { id: girdi.id });
  });
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id */
export function servisParametreTanimiSil(vt, projeId, id) {
  const s = vt.tek('SELECT proje_id FROM servis_parametre_tanimlari WHERE id = ?', [kimlik(id)]);
  if (!s || s.proje_id !== projeId) return false;
  return sil(vt, 'servis_parametre_tanimlari', id);
}
