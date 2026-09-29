// RAPOR VERİLERİ (Ayarlar > Raporlar; PDF rapor A4) — kullanıcının raporlar için verdiği kararlar. Hepsi varsayılan olarak BOŞTUR;
// boşken raporlar önceki gibi çalışır (kritiklik 0, sahip = sınıfın varsayılan ekibi, eşik yok, sürüm yok).
//   - Ekip listesi (ekipler tablosu; proje başına).
//   - Öğe işaretleri (rapor_isaretleri; öğe başına tek satır): kritik işareti (ekran — ortak akış dahil —, servis, akış), sahip ekip
//     (ekran, servis) ve süre eşiği (ekran: test süresi, servis: çağrı süresi; servis için metot başına ayrı eşik de verilebilir).
//     Satırın bütün alanları boşalınca satır silinir.
//   - Uygulama sürümü: test edilen uygulamanın sürümü koşuya etiket olarak bağlanır. Kaynak: koşu başlatılırken girilen değer, yoksa
//     ortam ayarındaki "Uygulama sürümü" (ortamlar.ayarlar_json.uygulamaSurumu). Nöbetçi sürümü hiçbir adrese SORMAZ.
// Kodda kullanıcıya ait ad / kural yoktur; her şey kasadadır. metot_esikleri_json şifrelidir ('ozel'; metot adları senaryo içeriğinden).
import { randomUUID } from 'node:crypto';
import { acikAnahtar, coz, sifrele, zarfMi } from '../kasa.mjs';
import { DepoHatasi, projeGetir } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {'ekran' | 'servis' | 'akis'} OgeTuru */
/**
 * @typedef {{ ogeTuru: OgeTuru; ogeId: string; kritik: boolean; ekipId: string | null; sureEsigiMs: number | null;
 *   metotEsikleri: Record<string, number> }} RaporIsareti
 */

export const OGE_TURLERI = /** @type {const} */ (['ekran', 'servis', 'akis']);
/** Süre eşiği sınırları (ms). */
export const EN_AZ_ESIK_MS = 1;
export const EN_COK_ESIK_MS = 3_600_000;
export const EN_COK_METOT_ESIGI = 200;
export const EKIP_ADI_EN_UZUN = 80;
export const UYGULAMA_SURUMU_EN_UZUN = 60;
/** Ekran koşusu sürecine sürümü taşıyan ortam değişkeni (sunucu koyar; raporlayıcı koşu kaydına yazar). */
export const UYGULAMA_SURUMU_DEGISKENI = 'NOBETCI_UYGULAMA_SURUMU';

const simdi = () => new Date().toISOString();

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Uygulama sürümü etiketi: kırpılır, denetim karakterleri ve fazla boşluk atılır, en çok 60 karakter. Boş → null.
 * @param {unknown} d @returns {string | null}
 */
export function uygulamaSurumuTemizle(d) {
  if (typeof d !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = d.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, UYGULAMA_SURUMU_EN_UZUN).trim();
  return t || null;
}

/** Ortam ayarındaki uygulama sürümü (yoksa null). @param {{ ayarlar?: Record<string, unknown> } | null | undefined} ortam */
export const ortamUygulamaSurumu = (ortam) => uygulamaSurumuTemizle(ortam?.ayarlar?.uygulamaSurumu);

/**
 * Koşuya bağlanacak sürüm: koşu başlatılırken girilen (boş değilse), yoksa ortam ayarındaki.
 * @param {unknown} kosudaki @param {{ ayarlar?: Record<string, unknown> } | null | undefined} ortam
 */
export const kosuUygulamaSurumu = (kosudaki, ortam) => uygulamaSurumuTemizle(kosudaki) ?? ortamUygulamaSurumu(ortam);

/** @param {unknown} d @param {string} alan @returns {number | null} */
function esikAl(d, alan) {
  if (d === null || d === undefined || d === '') return null;
  const n = Number(d);
  if (!Number.isInteger(n) || n < EN_AZ_ESIK_MS || n > EN_COK_ESIK_MS) {
    throw new DepoHatasi(`${alan} ${EN_AZ_ESIK_MS}–${EN_COK_ESIK_MS} ms arasında tam sayı olmalı (boş = eşik yok).`);
  }
  return n;
}

/** @param {unknown} d @returns {Record<string, number>} */
function metotEsikleriAl(d) {
  if (d === null || d === undefined) return {};
  if (typeof d !== 'object' || Array.isArray(d)) throw new DepoHatasi('"metotEsikleri" bir nesne olmalıdır ({ metot: ms }).');
  /** @type {Record<string, number>} */
  const sonuc = {};
  const girdiler = Object.entries(/** @type {Record<string, unknown>} */ (d));
  if (girdiler.length > EN_COK_METOT_ESIGI) throw new DepoHatasi(`En çok ${EN_COK_METOT_ESIGI} metot eşiği tanımlanabilir.`);
  for (const [metot, deger] of girdiler) {
    const ad = metot.trim();
    if (!ad || ad.length > 300) throw new DepoHatasi('Metot adı boş ya da çok uzun.');
    const n = esikAl(deger, `"${ad}" eşiği`);
    if (n !== null) sonuc[ad] = n;
  }
  return sonuc;
}

/** @param {Veritabani} vt @param {unknown} deger @returns {Record<string, number>} */
function metotEsikleriOku(vt, deger) {
  if (typeof deger !== 'string' || !deger) return {};
  try {
    const d = JSON.parse(zarfMi(deger) ? coz(vt, deger) : deger);
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    return Object.fromEntries(Object.entries(d).filter(([, v]) => Number.isInteger(v) && v >= EN_AZ_ESIK_MS && v <= EN_COK_ESIK_MS));
  } catch { return {}; }
}

/** @param {Veritabani} vt @param {string} projeId */
function projeOlmali(vt, projeId) {
  if (!projeGetir(vt, kimlik(projeId, 'projeId'))) throw new DepoHatasi('Proje bulunamadı.');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Ekipler
// ---------------------------------------------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @returns {Array<{ id: string; ad: string }>} */
export function ekipleriListele(vt, projeId) {
  return vt.tumu('SELECT id, ad FROM ekipler WHERE proje_id = ?', [projeId]).map((s) => ({ id: String(s.id), ad: String(s.ad) }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * Ekip ekler ya da yeniden adlandırır (ad proje içinde tekil; büyük / küçük harf fark etmez).
 * @param {Veritabani} vt @param {{ projeId: string; id?: string | null; ad: unknown }} g @returns {string}
 */
export function ekipKaydet(vt, g) {
  projeOlmali(vt, g.projeId);
  const ad = typeof g.ad === 'string' ? g.ad.replace(/\s+/g, ' ').trim() : '';
  if (!ad) throw new DepoHatasi('Ekip adı boş olamaz.');
  if (ad.length > EKIP_ADI_EN_UZUN) throw new DepoHatasi(`Ekip adı en çok ${EKIP_ADI_EN_UZUN} karakter olabilir.`);
  const id = g.id ? kimlik(g.id, 'id') : null;
  if (id && !vt.tek('SELECT 1 AS var FROM ekipler WHERE id = ? AND proje_id = ?', [id, g.projeId])) throw new DepoHatasi('Ekip bulunamadı.');
  const ayni = ekipleriListele(vt, g.projeId).find((e) => e.id !== id && e.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
  if (ayni) throw new DepoHatasi(`"${ad}" adlı bir ekip zaten var.`);
  const zaman = simdi();
  if (id) {
    vt.calistir('UPDATE ekipler SET ad = ?, guncellenme = ? WHERE id = ?', [ad, zaman, id]);
    return id;
  }
  const yeni = randomUUID();
  vt.calistir('INSERT INTO ekipler (id, proje_id, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?)', [yeni, g.projeId, ad, zaman, zaman]);
  return yeni;
}

/**
 * Ekibi siler; ona atanmış öğeler sahipsiz kalır (rapor sınıfın varsayılan ekibini önerir). Boşalan işaret satırı silinir.
 * @param {Veritabani} vt @param {string} projeId @param {string} id
 */
export function ekipSil(vt, projeId, id) {
  projeOlmali(vt, projeId);
  kimlik(id, 'id');
  return vt.islem(() => {
    if (!vt.tek('SELECT 1 AS var FROM ekipler WHERE id = ? AND proje_id = ?', [id, projeId])) throw new DepoHatasi('Ekip bulunamadı.');
    const etkilenen = Number(vt.tek('SELECT COUNT(*) AS n FROM rapor_isaretleri WHERE ekip_id = ?', [id])?.n ?? 0);
    vt.calistir('UPDATE rapor_isaretleri SET ekip_id = NULL, guncellenme = ? WHERE ekip_id = ?', [simdi(), id]);
    vt.calistir('DELETE FROM ekipler WHERE id = ?', [id]);
    bosIsaretleriSil(vt, projeId);
    return { etkilenen };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Öğe işaretleri
// ---------------------------------------------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId */
function bosIsaretleriSil(vt, projeId) {
  for (const s of vt.tumu('SELECT id, metot_esikleri_json FROM rapor_isaretleri WHERE proje_id = ? AND kritik = 0 AND ekip_id IS NULL AND sure_esigi_ms IS NULL', [projeId])) {
    if (!Object.keys(metotEsikleriOku(vt, s.metot_esikleri_json)).length) vt.calistir('DELETE FROM rapor_isaretleri WHERE id = ?', [s.id]);
  }
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s @returns {RaporIsareti} */
const isaretCevir = (vt, s) => ({
  ogeTuru: /** @type {OgeTuru} */ (String(s.oge_turu)), ogeId: String(s.oge_id), kritik: Number(s.kritik) === 1,
  ekipId: s.ekip_id == null ? null : String(s.ekip_id), sureEsigiMs: s.sure_esigi_ms == null ? null : Number(s.sure_esigi_ms),
  metotEsikleri: metotEsikleriOku(vt, s.metot_esikleri_json)
});

/** Projenin öğe işaretleri (kasa açık olmalı). @param {Veritabani} vt @param {string} projeId @returns {RaporIsareti[]} */
export function raporIsaretleriniListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM rapor_isaretleri WHERE proje_id = ? ORDER BY oge_turu, oge_id', [projeId]).map((s) => isaretCevir(vt, s));
}

/** Öğe bu projede var mı? @param {Veritabani} vt @param {string} projeId @param {OgeTuru} tur @param {string} id */
function ogeVarMi(vt, projeId, tur, id) {
  const tablo = tur === 'ekran' ? 'ekranlar' : tur === 'servis' ? 'servisler' : 'servis_akislari';
  return Boolean(vt.tek(`SELECT 1 AS var FROM ${tablo} WHERE id = ? AND proje_id = ?`, [id, projeId]));
}

/**
 * Öğenin işaretini yazar. Verilmeyen alan (undefined) korunur; null / boş = temizle. Akışta yalnız kritik işareti, ekranda metot
 * eşiği yoktur. Bütün alanlar boşalırsa satır silinir (null döner).
 * @param {Veritabani} vt
 * @param {{ projeId: string; ogeTuru: unknown; ogeId: unknown; kritik?: unknown; ekipId?: unknown; sureEsigiMs?: unknown; metotEsikleri?: unknown }} g
 * @returns {RaporIsareti | null}
 */
export function raporIsaretiKaydet(vt, g) {
  acikAnahtar(vt);
  projeOlmali(vt, g.projeId);
  const tur = /** @type {OgeTuru} */ (g.ogeTuru);
  if (!OGE_TURLERI.includes(tur)) throw new DepoHatasi(`"ogeTuru" yalnız ${OGE_TURLERI.join(', ')} olabilir.`);
  const ogeId = kimlik(g.ogeId, 'ogeId');
  if (!ogeVarMi(vt, g.projeId, tur, ogeId)) throw new DepoHatasi('Öğe bu projede bulunamadı.');
  if (tur === 'akis' && ((g.ekipId !== undefined && g.ekipId !== null && g.ekipId !== '') || (g.sureEsigiMs !== undefined && g.sureEsigiMs !== null && g.sureEsigiMs !== ''))) {
    throw new DepoHatasi('Akışlarda yalnız kritik işareti tutulur.');
  }
  if (tur !== 'servis' && g.metotEsikleri !== undefined && g.metotEsikleri !== null && Object.keys(/** @type {object} */ (g.metotEsikleri)).length) {
    throw new DepoHatasi('Metot eşiği yalnız servislerde tanımlanır.');
  }
  return vt.islem(() => {
    const mevcutSatir = vt.tek('SELECT * FROM rapor_isaretleri WHERE proje_id = ? AND oge_turu = ? AND oge_id = ?', [g.projeId, tur, ogeId]);
    const mevcut = mevcutSatir ? isaretCevir(vt, mevcutSatir) : null;
    const kritik = g.kritik === undefined ? mevcut?.kritik ?? false : g.kritik === true;
    let ekipId = mevcut?.ekipId ?? null;
    if (g.ekipId !== undefined) {
      ekipId = g.ekipId === null || g.ekipId === '' ? null : kimlik(g.ekipId, 'ekipId');
      if (ekipId && !vt.tek('SELECT 1 AS var FROM ekipler WHERE id = ? AND proje_id = ?', [ekipId, g.projeId])) throw new DepoHatasi('Ekip bulunamadı.');
    }
    const sureEsigiMs = g.sureEsigiMs === undefined ? mevcut?.sureEsigiMs ?? null : esikAl(g.sureEsigiMs, 'Süre eşiği');
    const metotEsikleri = g.metotEsikleri === undefined ? mevcut?.metotEsikleri ?? {} : metotEsikleriAl(g.metotEsikleri);
    const bos = !kritik && !ekipId && sureEsigiMs === null && !Object.keys(metotEsikleri).length;
    if (bos) {
      if (mevcutSatir) vt.calistir('DELETE FROM rapor_isaretleri WHERE id = ?', [mevcutSatir.id]);
      return null;
    }
    const zaman = simdi();
    const metotMetni = sifrele(vt, JSON.stringify(metotEsikleri));
    if (mevcutSatir) {
      vt.calistir('UPDATE rapor_isaretleri SET kritik = ?, ekip_id = ?, sure_esigi_ms = ?, metot_esikleri_json = ?, guncellenme = ? WHERE id = ?',
        [kritik ? 1 : 0, ekipId, sureEsigiMs, metotMetni, zaman, mevcutSatir.id]);
    } else {
      vt.calistir(`INSERT INTO rapor_isaretleri (id, proje_id, oge_turu, oge_id, kritik, ekip_id, sure_esigi_ms, metot_esikleri_json, olusturulma, guncellenme)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), g.projeId, tur, ogeId, kritik ? 1 : 0, ekipId, sureEsigiMs, metotMetni, zaman, zaman]);
    }
    return { ogeTuru: tur, ogeId, kritik, ekipId, sureEsigiMs, metotEsikleri };
  });
}

/** Rapor hesabında öğe anahtarı. @param {OgeTuru} tur @param {string} id */
export const ogeAnahtari = (tur, id) => `${tur}:${id}`;

/**
 * Rapor hesabının okuduğu biçim (kasa açık olmalı). Anahtar: ogeAnahtari(tür, kimlik).
 * @param {Veritabani} vt @param {string} projeId
 * @returns {{ kritik: Set<string>; ekip: Map<string, string>; esik: Map<string, { ms: number | null; metotlar: Record<string, number> }>;
 *   sayilar: { kritik: number; ekip: number; esik: number; ekipListesi: number } }}
 */
export function raporVerileriniOku(vt, projeId) {
  const ekipler = new Map(ekipleriListele(vt, projeId).map((e) => [e.id, e.ad]));
  /** @type {Set<string>} */
  const kritik = new Set();
  /** @type {Map<string, string>} */
  const ekip = new Map();
  /** @type {Map<string, { ms: number | null; metotlar: Record<string, number> }>} */
  const esik = new Map();
  for (const x of raporIsaretleriniListele(vt, projeId)) {
    const a = ogeAnahtari(x.ogeTuru, x.ogeId);
    if (x.kritik) kritik.add(a);
    const ad = x.ekipId ? ekipler.get(x.ekipId) : undefined;
    if (ad && x.ogeTuru !== 'akis') ekip.set(a, ad);
    if (x.ogeTuru !== 'akis' && (x.sureEsigiMs !== null || Object.keys(x.metotEsikleri).length)) {
      esik.set(a, { ms: x.sureEsigiMs, metotlar: x.ogeTuru === 'servis' ? x.metotEsikleri : {} });
    }
  }
  return { kritik, ekip, esik, sayilar: { kritik: kritik.size, ekip: ekip.size, esik: esik.size, ekipListesi: ekipler.size } };
}

/** Boş rapor verisi (tüm alanlar boş: raporlar önceki gibi). */
export const bosRaporVerileri = () => ({
  kritik: /** @type {Set<string>} */ (new Set()), ekip: /** @type {Map<string, string>} */ (new Map()),
  esik: /** @type {Map<string, { ms: number | null; metotlar: Record<string, number> }>} */ (new Map()),
  sayilar: { kritik: 0, ekip: 0, esik: 0, ekipListesi: 0 }
});
