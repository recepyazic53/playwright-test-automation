// SQL SORGU BAĞDAŞTIRICISI (ince) — SQL adımlarının yürütücüsü ile "Veritabanı bağlantısı" entegrasyonu (entegrasyonlar/*)
// arasındaki tek bağlantı noktası. İmza: sorguCalistir(vt, baglantiId, sql, parametreler, { zamanAsimiMs, satirSiniri })
// → Promise<{ sutunlar, satirlar, kesildi }>. SQL adımının hedefi (sqlHedefi): { veritabaniId } → ortamın eşlemesindeki bağlantı
// (sql/veritabanlari.mjs; eşleme yoksa sorgu ATILMADAN anlaşılır hata) ya da { baglantiId } (doğrudan bağlantı, eski). Bağlantı kasadan (şifreli) okunur; parola yalnız sürücüye gider, hiçbir
// mesaja / rapora yazılmaz (sürücü katmanı hata mesajında maskeler). "Yalnız okuma" kuralını sürücü katmanı uygular
// (veritabaniSorgusu → yalnizOkumaDenetle). Yasak adresler (Ayarlar > Güvenlik + ortam değişkeni) denetlenir.
// Model koşucusu (Playwright süreci) veritabanını açmaz: bağlantı ayarları veri-oku.mjs ile (giriş bilgisi gibi, yalnız
// stdout borusundan) gelir ve ayarlaSorgula ile çalışır.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
import { baglantiGetir, tumBaglantilar } from '../entegrasyonlar/depo.mjs';
import { eslemedenBaglanti, veritabaniGetir, veritabanlariListele } from './veritabanlari.mjs';
import { veritabaniAyari } from '../entegrasyonlar/katalog.mjs';
import { SURUCULER, sorguIzinleri, veritabaniSorgusu } from '../entegrasyonlar/veritabani-suruculeri.mjs';
import { izinDurumundanDenetle, izinGerekli } from '../guvenlik/izinler.mjs';
import { riskliOrtamMi, riskliSecimi } from '../guvenlik/ortam-riski.mjs';
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
  const ayar = veritabaniAyari(b.alanlar);
  // İzinler (Ayarlar > İzinler): okuma; "Yalnız okuma" kapalı bağlantıda yazma sorgusu ayrıca yazma — bağlanmadan önce.
  for (const a of sorguIzinleri(ayar, sql)) izinGerekli(vt, a, 'sorguCalistir');
  return veritabaniSorgusu(ayar, sql, parametreler, {
    zamanAsimiMs: secenekler.zamanAsimiMs, satirSiniri: secenekler.satirSiniri, yasakDesenleri: etkinYasakDesenleri(vt)
  });
}

/**
 * SQL adımının bu ortamdaki bağlantısı: { veritabaniId } → eslemeler[ortamId] (yoksa DepoHatasi; sorgu atılmaz), { baglantiId }
 * → doğrudan. Bağlantı kapalıysa / ortama açık değilse mevcut hatalar. Dönüş: bağlantı (ham; parola çağıranda kalır) ve
 * veritabanı (varsa).
 * @param {Veritabani} vt @param {{ veritabaniId?: string; baglantiId?: string }} tanim @param {{ projeId?: string; ortamId?: string }} [s]
 */
export function sqlHedefi(vt, tanim, s = {}) {
  if (tanim.veritabaniId) {
    if (!s.projeId) throw new DepoHatasi('SQL adımının projesi bilinmiyor.');
    const e = eslemedenBaglanti(vt, s.projeId, tanim.veritabaniId, s.ortamId);
    return { baglanti: kullanilabilirBaglanti(vt, e.baglantiId, s), veritabani: e.veritabani };
  }
  return { baglanti: kullanilabilirBaglanti(vt, String(tanim.baglantiId ?? ''), s), veritabani: undefined };
}

/**
 * SQL tanımının hedefinde sorgu (sunucu süreci; kasa açık). Önce hedef çözülür; çözülemezse sürücüye hiç gidilmez.
 * @param {Veritabani} vt @param {{ veritabaniId?: string; baglantiId?: string }} tanim @param {string} sql @param {Record<string, unknown>} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number; projeId?: string; ortamId?: string }} [secenekler]
 */
export async function sqlTanimiylaSorgula(vt, tanim, sql, parametreler, secenekler = {}) {
  const { baglanti } = sqlHedefi(vt, tanim, secenekler);
  const ayar = veritabaniAyari(baglanti.alanlar);
  for (const a of sorguIzinleri(ayar, sql)) izinGerekli(vt, a, 'sqlTanimiylaSorgula');
  return veritabaniSorgusu(ayar, sql, parametreler, {
    zamanAsimiMs: secenekler.zamanAsimiMs, satirSiniri: secenekler.satirSiniri, yasakDesenleri: etkinYasakDesenleri(vt)
  });
}

/**
 * Model koşucusu için: çözülmüş ayarla sorgu (veritabanı açılmaz). Yasak adresler ortam değişkeninden (koşuyu başlatan sunucu
 * Ayarlar'dakileri de buraya yazar). İzinler: koşucu kasayı açmaz — izin durumu veri-oku.mjs çıktısından gelir (izinler);
 * verilmezse kapalı sayılır.
 * @param {VeritabaniAyari} ayar @param {string} sql @param {Record<string, unknown>} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number; izinler?: Record<string, unknown> | null }} [secenekler]
 */
export function ayarlaSorgula(ayar, sql, parametreler, secenekler = {}) {
  const { izinler, ...kalan } = secenekler;
  for (const a of sorguIzinleri(ayar, sql)) izinDurumundanDenetle(izinler, a, 'ayarlaSorgula');
  return veritabaniSorgusu(ayar, sql, parametreler, { ...kalan, yasakDesenleri: yasakDesenleri(process.env[YASAK_ADRES_DEGISKENI]) });
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
 * Kayıt doğrulaması (SQL tanımı): veritabanı projede mi (eşlemeler koşuda, ortama göre denetlenir) ya da doğrudan bağlantı geçerli mi.
 * @param {Veritabani} vt @param {string} projeId @param {{ veritabaniId?: string; baglantiId?: string }} tanim @returns {string | null}
 */
export function sqlTanimDenetle(vt, projeId, tanim) {
  if (tanim.veritabaniId) return veritabaniGetir(vt, projeId, tanim.veritabaniId) ? null : 'veritabanı bulunamadı (Ayarlar > Entegrasyonlar > Veritabanları).';
  return sqlBaglantiDenetle(vt, projeId, String(tanim.baglantiId ?? ''));
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

/**
 * Koşu verisi (veri-oku.mjs): doğrudan bağlantıların ve mantıksal veritabanlarının bu ortamdaki çözümü. Veritabanının eşlendiği
 * bağlantının ayarı da sqlBaglantilari'na girer; eşleme yoksa / kullanılamıyorsa { hata } (adım sorgu atmadan bu hatayla kalır).
 * sqlBaglantiAdlari: raporda hangi bağlantının kullanıldığı (ad; parola asla).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {{ baglantiIdleri: Iterable<string>; veritabaniIdleri: Iterable<string> }} h
 */
export function kosuSqlVerisi(vt, projeId, ortamId, h) {
  /** @type {Record<string, { ad: string; baglantiId: string } | { ad?: string; hata: string }>} */
  const sqlVeritabanlari = {};
  const idler = new Set(h.baglantiIdleri);
  for (const id of new Set(h.veritabaniIdleri)) {
    const ad = veritabaniGetir(vt, projeId, id)?.ad;
    try {
      const e = eslemedenBaglanti(vt, projeId, id, ortamId);
      sqlVeritabanlari[id] = { ad: e.veritabani.ad, baglantiId: e.baglantiId };
      idler.add(e.baglantiId);
    } catch (x) { sqlVeritabanlari[id] = { ...(ad ? { ad } : {}), hata: String(/** @type {Error} */ (x).message) }; }
  }
  const sqlBaglantilari = kosuBaglantiAyarlari(vt, projeId, ortamId, idler);
  /** @type {Record<string, string>} */
  const sqlBaglantiAdlari = {};
  for (const b of tumBaglantilar(vt)) if (b.projeId === projeId && idler.has(b.id)) sqlBaglantiAdlari[b.id] = b.ad;
  return { sqlBaglantilari, sqlVeritabanlari, sqlBaglantiAdlari };
}

/**
 * Model koşucusunda (veritabanı açılmaz) SQL tanımının ayarı: koşu verisinden saf çözüm.
 * @param {{ sqlBaglantilari?: Record<string, VeritabaniAyari | { hata: string }>; sqlVeritabanlari?: Record<string, { ad: string; baglantiId: string } | { ad?: string; hata: string }>;
 *   sqlBaglantiAdlari?: Record<string, string> }} veri
 * @param {{ veritabaniId?: string; baglantiId?: string }} tanim
 * @returns {{ ayar: VeritabaniAyari; baglantiId: string; baglantiAdi: string; veritabaniAdi?: string } | { hata: string }}
 */
export function kosuSqlAyari(veri, tanim) {
  let baglantiId = tanim.baglantiId ?? '';
  /** @type {string | undefined} */
  let veritabaniAdi;
  if (tanim.veritabaniId) {
    const v = veri.sqlVeritabanlari?.[tanim.veritabaniId];
    if (!v) return { hata: 'SQL adımının veritabanı koşu verisinde yok (Ayarlar > Entegrasyonlar > Veritabanları).' };
    if ('hata' in v) return { hata: v.hata };
    baglantiId = v.baglantiId;
    veritabaniAdi = v.ad;
  }
  const ayar = veri.sqlBaglantilari?.[baglantiId];
  if (!ayar) return { hata: 'SQL adımının veritabanı bağlantısı koşu verisinde yok (Ayarlar > Entegrasyonlar).' };
  if ('hata' in ayar) return { hata: ayar.hata };
  return { ayar, baglantiId, baglantiAdi: veri.sqlBaglantiAdlari?.[baglantiId] ?? '', ...(veritabaniAdi ? { veritabaniAdi } : {}) };
}

/**
 * Modeldeki (ve alt / ortak modellerdeki) SQL adımlarının hedefleri: doğrudan bağlantı ve mantıksal veritabanı kimlikleri.
 * @param {unknown} kok @returns {{ baglantiIdleri: Set<string>; veritabaniIdleri: Set<string> }}
 */
export function modeldekiSqlHedefleri(kok) {
  /** @type {Set<string>} */
  const baglantiIdleri = new Set();
  /** @type {Set<string>} */
  const veritabaniIdleri = new Set();
  const gez = (/** @type {unknown} */ d, /** @type {number} */ derinlik) => {
    if (derinlik > 12 || !d || typeof d !== 'object') return;
    if (Array.isArray(d)) { for (const x of d) gez(x, derinlik + 1); return; }
    const n = /** @type {Record<string, unknown>} */ (d);
    const s = /** @type {any} */ (n.sqlKontrolu);
    if (s && typeof s === 'object') {
      if (typeof s.veritabaniId === 'string' && s.veritabaniId) veritabaniIdleri.add(s.veritabaniId);
      else if (typeof s.baglantiId === 'string') baglantiIdleri.add(s.baglantiId);
    }
    for (const [k, v] of Object.entries(n)) if (k !== 'sqlKontrolu' && v && typeof v === 'object') gez(v, derinlik + 1);
  };
  gez(kok, 0);
  return { baglantiIdleri, veritabaniIdleri };
}

/** Modeldeki (ve alt / ortak modellerdeki) SQL adımlarının doğrudan bağlantı kimlikleri. @param {unknown} kok */
export function modeldekiSqlBaglantilari(kok) {
  return modeldekiSqlHedefleri(kok).baglantiIdleri;
}

/** GET uçları (sunucu-platform.mjs kaydeder). @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SQL_GET_UCLARI = [
  ['/platform/sql/baglantilar', (db, q) => {
    const projeId = q.get('projeId') ?? '';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(projeId)) throw new DepoHatasi('"projeId" geçersiz.');
    // veritabanlari: SQL adımı seçiminde önce gelen mantıksal veritabanları (eşlemeler: ortamId → bağlantı kimliği).
    return {
      baglantilar: sqlBaglantilari(db, projeId),
      veritabanlari: veritabanlariListele(db, projeId).map((v) => ({ id: v.id, ad: v.ad, aciklama: v.aciklama, eslemeler: v.eslemeler })),
      ortamlar: ortamlariListele(db, projeId).map((o) => ({ id: o.id, ad: o.ad, varsayilan: o.varsayilan, riskli: riskliSecimi(o), canli: riskliOrtamMi(o) }))
    };
  }]
];
