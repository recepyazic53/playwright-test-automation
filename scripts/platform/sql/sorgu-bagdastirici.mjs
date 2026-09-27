// SQL SORGU BAĞDAŞTIRICISI (ince) — SQL adımlarının yürütücüsü ile "Veritabanı bağlantısı" entegrasyonu (entegrasyonlar/*)
// arasındaki tek bağlantı noktası. İmza: sorguCalistir(vt, baglantiId, sql, parametreler, { zamanAsimiMs, satirSiniri })
// → Promise<{ sutunlar, satirlar, kesildi }>. Bağlantı kasadan (şifreli) okunur; parola yalnız sürücüye gider, hiçbir
// mesaja / rapora yazılmaz (sürücü katmanı hata mesajında maskeler). "Yalnız okuma" kuralını sürücü katmanı uygular
// (veritabaniSorgusu → yalnizOkumaDenetle). Yasak adresler (Ayarlar > Güvenlik + ortam değişkeni) denetlenir.
// Model koşucusu (Playwright süreci) veritabanını açmaz: bağlantı ayarları veri-oku.mjs ile (giriş bilgisi gibi, yalnız
// stdout borusundan) gelir ve ayarlaSorgula ile çalışır.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi } from '../veritabani/depo.mjs';
import { baglantiGetir, tumBaglantilar } from '../entegrasyonlar/depo.mjs';
import { veritabaniAyari } from '../entegrasyonlar/katalog.mjs';
import { SURUCULER, veritabaniSorgusu } from '../entegrasyonlar/veritabani-suruculeri.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { yasakDesenleri, YASAK_ADRES_DEGISKENI } from '../senaryolar/model-kosusu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../entegrasyonlar/veritabani-suruculeri.mjs').VeritabaniAyari} VeritabaniAyari */

const TUR = 'veritabani';

/**
 * Kullanılabilir bağlantı (projede, türü veritabanı, etkin, ortama açık). Uymuyorsa DepoHatasi.
 * @param {Veritabani} vt @param {string} baglantiId @param {{ projeId?: string; ortamId?: string }} [s]
 */
function kullanilabilirBaglanti(vt, baglantiId, s = {}) {
  let b;
  try { b = baglantiGetir(vt, baglantiId, s.projeId); } catch { throw new DepoHatasi('SQL adımının veritabanı bağlantısı bulunamadı (Ayarlar > Entegrasyonlar).'); }
  if (b.tur !== TUR) throw new DepoHatasi(`"${b.ad}" bir veritabanı bağlantısı değil.`);
  if (!b.etkin) throw new DepoHatasi(`"${b.ad}" veritabanı bağlantısı kapalı (Ayarlar > Entegrasyonlar).`);
  if (s.ortamId && Array.isArray(b.ortamIdleri) && b.ortamIdleri.length && !b.ortamIdleri.includes(s.ortamId)) {
    throw new DepoHatasi(`"${b.ad}" veritabanı bağlantısı bu ortamda kullanılamaz.`);
  }
  return b;
}

/**
 * Sorguyu çalıştırır (sunucu süreci; kasa açık).
 * @param {Veritabani} vt @param {string} baglantiId @param {string} sql @param {Record<string, unknown>} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number; projeId?: string; ortamId?: string }} [secenekler]
 * @returns {Promise<{ sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean }>}
 */
export async function sorguCalistir(vt, baglantiId, sql, parametreler, secenekler = {}) {
  const b = kullanilabilirBaglanti(vt, baglantiId, secenekler);
  return veritabaniSorgusu(veritabaniAyari(b.alanlar), sql, parametreler, {
    zamanAsimiMs: secenekler.zamanAsimiMs, satirSiniri: secenekler.satirSiniri, yasakDesenleri: etkinYasakDesenleri(vt)
  });
}

/**
 * Model koşucusu için: çözülmüş ayarla sorgu (veritabanı açılmaz). Yasak adresler ortam değişkeninden (koşuyu başlatan sunucu
 * Ayarlar'dakileri de buraya yazar).
 * @param {VeritabaniAyari} ayar @param {string} sql @param {Record<string, unknown>} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number }} [secenekler]
 */
export function ayarlaSorgula(ayar, sql, parametreler, secenekler = {}) {
  return veritabaniSorgusu(ayar, sql, parametreler, { ...secenekler, yasakDesenleri: yasakDesenleri(process.env[YASAK_ADRES_DEGISKENI]) });
}

/** Arayüz seçim listesi (gizli alan yok). @param {Veritabani} vt @param {string} projeId */
export function sqlBaglantilari(vt, projeId) {
  return tumBaglantilar(vt).filter((b) => b.projeId === projeId && b.tur === TUR).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((b) => ({
    id: b.id, ad: b.ad, etkin: b.etkin, ortamIdleri: b.ortamIdleri ?? [],
    surucu: SURUCULER[/** @type {keyof typeof SURUCULER} */ (String(b.alanlar.surucu))]?.etiket ?? String(b.alanlar.surucu ?? ''),
    yalnizOkuma: b.alanlar.yalnizOkuma !== false
  }));
}

/** Kayıt doğrulaması: bağlantı projede ve veritabanı türünde mi? Hata metni ya da null. @param {Veritabani} vt @param {string} projeId @param {string} baglantiId */
export function sqlBaglantiDenetle(vt, projeId, baglantiId) {
  const b = tumBaglantilar(vt).find((x) => x.id === baglantiId && x.projeId === projeId);
  if (!b) return 'veritabanı bağlantısı bulunamadı (Ayarlar > Entegrasyonlar).';
  if (b.tur !== TUR) return `"${b.ad}" bir veritabanı bağlantısı değil.`;
  return null;
}

/**
 * Koşu verisi (veri-oku.mjs): istenen bağlantıların çözülmüş ayarları (parola dahil; yalnız stdout borusundan gider). Kullanılamayan
 * bağlantı yerine { hata } yazılır (adım koşarken bu hatayla kalır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {Iterable<string>} idler
 * @returns {Record<string, VeritabaniAyari | { hata: string }>}
 */
export function kosuBaglantiAyarlari(vt, projeId, ortamId, idler) {
  /** @type {Record<string, VeritabaniAyari | { hata: string }>} */
  const sonuc = {};
  for (const id of new Set(idler)) {
    try { sonuc[id] = veritabaniAyari(kullanilabilirBaglanti(vt, id, { projeId, ortamId }).alanlar); } catch (e) { sonuc[id] = { hata: String(/** @type {Error} */ (e).message) }; }
  }
  return sonuc;
}

/** Modeldeki (ve alt / ortak modellerdeki) SQL adımlarının bağlantı kimlikleri. @param {unknown} kok */
export function modeldekiSqlBaglantilari(kok) {
  /** @type {Set<string>} */
  const idler = new Set();
  const gez = (/** @type {unknown} */ d, /** @type {number} */ derinlik) => {
    if (derinlik > 12 || !d || typeof d !== 'object') return;
    if (Array.isArray(d)) { for (const x of d) gez(x, derinlik + 1); return; }
    const n = /** @type {Record<string, unknown>} */ (d);
    const s = n.sqlKontrolu;
    if (s && typeof s === 'object' && typeof (/** @type {any} */ (s)).baglantiId === 'string') idler.add(/** @type {any} */ (s).baglantiId);
    for (const [k, v] of Object.entries(n)) if (k !== 'sqlKontrolu' && v && typeof v === 'object') gez(v, derinlik + 1);
  };
  gez(kok, 0);
  return idler;
}

/** GET uçları (sunucu-platform.mjs kaydeder). @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SQL_GET_UCLARI = [
  ['/platform/sql/baglantilar', (db, q) => {
    const projeId = q.get('projeId') ?? '';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(projeId)) throw new DepoHatasi('"projeId" geçersiz.');
    return { baglantilar: sqlBaglantilari(db, projeId) };
  }]
];
