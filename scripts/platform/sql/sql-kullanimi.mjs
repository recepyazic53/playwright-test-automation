// SQL ADIMLARININ KULLANIMI ve VERİTABANLARI uçları (Ayarlar > Entegrasyonlar > Veritabanları).
//  - sqlKullanimlari: projedeki SQL adımları (ekran modellerinin tüm akışları + servis akışları) ve hedefleri — veritabanı /
//    bağlantı silinirken "kullanan adımlar" listesi.
//  - sqlKosuDenetimi: koşu diyaloğunun uyarısı için senaryo → kullandığı mantıksal veritabanları (ekran senaryosu: ekranın akış
//    modeli + alt / ortak modeller; servis senaryosu: akış senaryosunun akışı + servisin oturum akışı). Eşleme ortama göre
//    istemcide denetlenir (koşu engellenmez; senaryo o SQL adımında kalır).
// Hiçbir uç ağ isteği atmaz, veritabanına bağlanmaz. NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ekranModeliGetir, ekranlariListele, ortamlariListele } from '../veritabani/depo.mjs';
import { tumBaglantilar } from '../entegrasyonlar/depo.mjs';
import { modelBaglami, senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { servisAkisiGetir, servisAkislariniListele, servisSenaryolariniListele, servisleriListele } from '../servisler/servis-deposu.mjs';
import { modeldekiSqlHedefleri } from './sorgu-bagdastirici.mjs';
import {
  baglantininVeritabanlari, veritabaniGetir, veritabaniGorunumleri, veritabaniKaydet, veritabaniSil, veritabanlariListele
} from './veritabanlari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ kaynak: 'ekran' | 'servisAkisi'; yer: string; veritabaniId?: string; baglantiId?: string }} SqlKullanimi */

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Projedeki tüm SQL adımları (yer: "Ekran › akış › adım" ya da "Servis akışı › adım").
 * @param {Veritabani} vt @param {string} projeId @returns {SqlKullanimi[]}
 */
export function sqlKullanimlari(vt, projeId) {
  /** @type {SqlKullanimi[]} */
  const sonuc = [];
  /** @type {Set<string>} */
  const gorulen = new Set();
  const ekle = (/** @type {SqlKullanimi['kaynak']} */ kaynak, /** @type {string} */ yer, /** @type {any} */ t) => {
    if (!nesneMi(t)) return;
    const hedef = typeof t.veritabaniId === 'string' && t.veritabaniId ? { veritabaniId: t.veritabaniId } : typeof t.baglantiId === 'string' ? { baglantiId: t.baglantiId } : null;
    if (!hedef || gorulen.has(`${yer}\u0000${JSON.stringify(hedef)}`)) return;
    gorulen.add(`${yer}\u0000${JSON.stringify(hedef)}`);
    sonuc.push({ kaynak, yer, ...hedef });
  };
  for (const e of ekranlariListele(vt, projeId)) {
    const m = ekranModeliGetir(vt, e.id)?.model;
    if (!nesneMi(m)) continue;
    const akislar = Array.isArray(m.akislar) && m.akislar.length ? m.akislar.filter(nesneMi) : [{ ad: '', adimlar: m.adimlar }];
    for (const a of akislar) {
      const akisAdi = akislar.length > 1 && a.ad ? ` › ${String(a.ad)}` : '';
      for (const adim of Array.isArray(a.adimlar) ? a.adimlar : []) {
        if (nesneMi(adim) && nesneMi(adim.sqlKontrolu)) ekle('ekran', `${e.ad}${akisAdi} › ${String(adim.baslik || adim.id || 'SQL sorgusu')}`, adim.sqlKontrolu);
      }
    }
  }
  for (const a of servisAkislariniListele(vt, projeId)) {
    for (const adim of a.icerik.adimlar) if (adim.tur === 'sql') ekle('servisAkisi', `${a.baslik} (servis akışı) › ${adim.ad}`, adim.sql);
  }
  return sonuc;
}

/** Servis akışının SQL adımlarındaki veritabanları. @param {Veritabani} vt @param {string | undefined} akisId */
function akisVeritabanlari(vt, akisId) {
  const a = akisId ? servisAkisiGetir(vt, akisId) : undefined;
  return a ? a.icerik.adimlar.filter((x) => x.tur === 'sql' && x.sql?.veritabaniId).map((x) => String(x.sql.veritabaniId)) : [];
}

/**
 * Koşu diyaloğu uyarısı için: senaryo → kullandığı mantıksal veritabanları + projenin veritabanlarının eşlemeleri.
 * @param {Veritabani} vt @param {string} projeId
 */
export function sqlKosuDenetimi(vt, projeId) {
  /** @type {Record<string, string[]>} */
  const ekranSenaryolari = {};
  /** @type {Map<string, string[]>} */
  const modelOnbellegi = new Map();
  for (const s of vt.tumu('SELECT id, ekran_id, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id IS NOT NULL', [projeId])) {
    /** @type {unknown} */
    let icerik = null;
    try { icerik = JSON.parse(String(s.icerik_json)); } catch { continue; }
    const akis = senaryoAkisi(icerik);
    const anahtar = `${String(s.ekran_id)}\u0000${akis ?? ''}`;
    if (!modelOnbellegi.has(anahtar)) {
      /** @type {string[]} */
      let idler = [];
      try {
        const mb = modelBaglami(vt, String(s.ekran_id), akis, { listesiz: true });
        if (mb) idler = [...modeldekiSqlHedefleri([mb.model, mb.altModeller]).veritabaniIdleri];
      } catch { idler = []; }
      modelOnbellegi.set(anahtar, idler);
    }
    const idler = modelOnbellegi.get(anahtar) ?? [];
    if (idler.length) ekranSenaryolari[String(s.id)] = idler;
  }
  /** @type {Record<string, string[]>} */
  const servisSenaryolari = {};
  for (const sv of servisleriListele(vt, projeId)) {
    const oturum = akisVeritabanlari(vt, /** @type {string | undefined} */ (sv.ayarlar?.oturumAkisi));
    for (const x of servisSenaryolariniListele(vt, sv.id)) {
      const ic = /** @type {any} */ (x.icerik);
      const idler = [...new Set([...oturum, ...(ic?.tur === 'akis' ? akisVeritabanlari(vt, ic.akisId) : [])])];
      if (idler.length) servisSenaryolari[x.id] = idler;
    }
  }
  return {
    veritabanlari: veritabanlariListele(vt, projeId).map((v) => ({ id: v.id, ad: v.ad, eslemeler: v.eslemeler })),
    ekranSenaryolari, servisSenaryolari
  };
}

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Bağlantı silinmeden önce: eşli olduğu veritabanları (ortam adlarıyla) ve bağlantıyı doğrudan kullanan SQL adımları.
 * @param {Veritabani} vt @param {string} projeId @param {string} baglantiId
 */
export function baglantiKullanimi(vt, projeId, baglantiId) {
  const ortamAdi = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  return {
    veritabanlari: baglantininVeritabanlari(vt, projeId, baglantiId).map((v) => ({ id: v.id, ad: v.ad, ortamlar: v.ortamIdleri.map((o) => ortamAdi.get(o) ?? 'silinmiş ortam') })),
    adimlar: sqlKullanimlari(vt, projeId).filter((k) => k.baglantiId === baglantiId).map((k) => k.yer)
  };
}

/** GET uçları. @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SQL_KULLANIM_GET_UCLARI = [
  ['/platform/sql/veritabanlari', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const kullanimlar = sqlKullanimlari(db, projeId);
    /** @type {Record<string, number>} */
    const adimSayisi = {};
    for (const k of kullanimlar) if (k.veritabaniId) adimSayisi[k.veritabaniId] = (adimSayisi[k.veritabaniId] ?? 0) + 1;
    return {
      veritabanlari: veritabaniGorunumleri(db, projeId).map((v) => ({ ...v, adimSayisi: adimSayisi[v.id] ?? 0 })),
      // Veritabanına bağlı olmayan (eski) doğrudan bağlantılı SQL adımı sayısı ("Veritabanına çevir…" önerisi için).
      dogrudanAdimSayisi: kullanimlar.filter((k) => k.baglantiId).length
    };
  }],
  ['/platform/sql/baglanti-kullanimi', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const baglantiId = kimlik(q.get('baglantiId'), 'baglantiId');
    if (!tumBaglantilar(db).some((b) => b.id === baglantiId && b.projeId === projeId)) throw new DepoHatasi('Bağlantı bulunamadı.');
    return baglantiKullanimi(db, projeId, baglantiId);
  }],
  ['/platform/sql/kosu-denetimi', (db, q) => sqlKosuDenetimi(db, kimlik(q.get('projeId'), 'projeId'))]
];

/** POST uçları. @type {Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown>]>} */
export const SQL_KULLANIM_POST_UCLARI = [
  ['/platform/sql/veritabani/kaydet', (db, g) => veritabaniKaydet(db, kimlik(g.projeId, 'projeId'), g)],
  ['/platform/sql/veritabani/kullanim', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const id = kimlik(g.id, 'id');
    if (!veritabaniGetir(db, projeId, id)) throw new DepoHatasi('Veritabanı bulunamadı.');
    return { adimlar: sqlKullanimlari(db, projeId).filter((k) => k.veritabaniId === id).map((k) => k.yer) };
  }],
  // Silme: kullanan SQL adımı varsa yalnız açık onayla (onay: true); adımlar sonra "veritabanı bulunamadı" hatasıyla kalır.
  ['/platform/sql/veritabani/sil', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const id = kimlik(g.id, 'id');
    const v = veritabaniGetir(db, projeId, id);
    if (!v) throw new DepoHatasi('Veritabanı bulunamadı.');
    const adimlar = sqlKullanimlari(db, projeId).filter((k) => k.veritabaniId === id).map((k) => k.yer);
    if (adimlar.length && g.onay !== true) throw new DepoHatasi(`"${v.ad}" şu SQL adımlarında kullanılıyor: ${adimlar.slice(0, 10).join('; ')}${adimlar.length > 10 ? ` (+${adimlar.length - 10})` : ''}. Silmek için onaylayın.`);
    return { silindi: veritabaniSil(db, projeId, id), etkilenenAdimlar: adimlar };
  }]
];
