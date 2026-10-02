// ÖZET PANOSU — UÇLAR (sunucu-platform.mjs kaydeder; kasa açık olmalı; dış istek yalnız SQL kartının "Yenile"sinde, kullanıcının
// tanımladığı veritabanı bağlantısına):
//   GET  /platform/pano?projeId=                       düzen (kayıt yoksa varsayılan) + SQL kartlarının önbellekteki son sonuçları
//   GET  /platform/pano/secenekler?projeId=            "Kart ekle" seçimleri: veritabanları × ortamlar, bağlantılar, şablonlar, hedefler
//   GET  /platform/pano/veri?projeId=&sablon=&p=       Nöbetçi verisi kartının sonucu (p: parametreler, JSON)
//   POST /platform/pano/kaydet { projeId, duzen }      düzeni kaydeder ("Bitti")
//   POST /platform/pano/sql/denetle { projeId, sorgu } yalnız okuma kuralı (bağlantı AÇILMAZ; kart eklerken uyarı)
//   POST /platform/pano/sql/yenile { projeId, kartId } SQL kartını çalıştırır (izin: Veritabanı okuma; CANLI'da canliOnay: true)
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
import { sqlBaglantilari } from '../sql/sorgu-bagdastirici.mjs';
import { veritabanlariListele } from '../sql/veritabanlari.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { panoGetir, panoKaydet } from './ozet-panosu.mjs';
import { PANO_SQL_SATIR_SINIRI, PANO_SQL_UCU, PANO_SQL_ZAMAN_ASIMI_MS, panoSorgusuDenetle, panoSqlYenile } from './pano-sql.mjs';
import { sablonSecenekleri, sablonSonucu } from './pano-sablonlari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
/** @param {unknown} v @param {string} ad */
function kimlik(v, ad) {
  if (typeof v !== 'string' || !KIMLIK.test(v)) throw new DepoHatasi(`"${ad}" geçersiz.`);
  return v;
}

/**
 * "Kart ekle" seçenekleri. SQL hedefleri: mantıksal veritabanları (ortam başına; eşlemesi olan ortamlar) ve doğrudan bağlantılar.
 * canli: hedef CANLI ortama ait mi (arayüz rozet gösterir; onayı uç denetimi ister).
 * @param {Veritabani} vt @param {string} projeId
 */
export function panoSecenekleri(vt, projeId) {
  const ortamlar = ortamlariListele(vt, projeId);
  const ortamAdi = new Map(ortamlar.map((o) => [o.id, o]));
  const canliMi = (/** @type {string} */ oid) => { const o = ortamAdi.get(oid); return Boolean(o && riskliOrtamMi(o)); };
  const mantiksal = veritabanlariListele(vt, projeId);
  /** Bağlantının eşlendiği ortamlar (veritabanı eşlemeleri). @type {Map<string, string[]>} */
  const eslenen = new Map();
  for (const v of mantiksal) for (const [oid, bid] of Object.entries(v.eslemeler)) eslenen.set(bid, [...(eslenen.get(bid) ?? []), oid]);
  return {
    veritabanlari: mantiksal.map((v) => ({
      id: v.id, ad: v.ad,
      ortamlar: Object.keys(v.eslemeler).map((oid) => ortamAdi.get(oid)).filter((o) => o !== undefined).map((o) => ({ id: o.id, ad: o.ad, canli: riskliOrtamMi(o) }))
    })),
    baglantilar: sqlBaglantilari(vt, projeId).map((b) => ({
      id: b.id, ad: b.ad, surucu: b.surucu, etkin: b.etkin, canli: [...b.ortamIdleri, ...(eslenen.get(b.id) ?? [])].some(canliMi)
    })),
    ...sablonSecenekleri(vt, projeId),
    sinirlar: { zamanAsimiSn: PANO_SQL_ZAMAN_ASIMI_MS / 1000, satirSiniri: PANO_SQL_SATIR_SINIRI }
  };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const PANO_GET_UCLARI = [
  ['/platform/pano', (db, q) => panoGetir(db, kimlik(q.get('projeId'), 'projeId'))],
  ['/platform/pano/secenekler', (db, q) => panoSecenekleri(db, kimlik(q.get('projeId'), 'projeId'))],
  ['/platform/pano/veri', (db, q) => {
    let p = {};
    try { p = JSON.parse(q.get('p') || '{}'); } catch { throw new DepoHatasi('Şablon parametreleri geçersiz.'); }
    return { sonuc: sablonSonucu(db, kimlik(q.get('projeId'), 'projeId'), String(q.get('sablon') ?? ''), p) };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>} */
export const PANO_POST_UCLARI = [
  ['/platform/pano/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    // SQL kartlarının sorgusu kaydederken de yalnız okuma kuralından geçer (Yenile'de yeniden denetlenir).
    const kartlar = g.duzen && Array.isArray(g.duzen.kartlar) ? g.duzen.kartlar : [];
    for (const k of kartlar) if (k && k.tur === 'sql' && k.ayar && typeof k.ayar.sorgu === 'string') panoSorgusuDenetle(k.ayar.sorgu);
    panoKaydet(db, projeId, g.duzen);
    return panoGetir(db, projeId);
  }],
  ['/platform/pano/sql/denetle', (db, g) => {
    kimlik(g.projeId, 'projeId');
    if (typeof g.sorgu !== 'string' || !g.sorgu.trim()) throw new DepoHatasi('Sorgu boş olamaz.');
    panoSorgusuDenetle(g.sorgu);
    return { gecerli: true };
  }],
  [PANO_SQL_UCU, async (db, g) => ({ sonuc: await panoSqlYenile(db, kimlik(g.projeId, 'projeId'), kimlik(g.kartId, 'kartId')) })]
];
