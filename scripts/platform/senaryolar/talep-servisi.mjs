// TALEP SERVİSİ (sunucu; kasa açık olmalı) — talep numaralarının proje içi listesi (formdaki otomatik tamamlama), bir talebe bağlı
// senaryo kümesi (ekran senaryoları, servis senaryoları, uçtan uca akışlar) ve "Bu talebin senaryolarını koş" için ORTAM BAŞINA koşu
// planı. Talep no senaryonun içeriğinde durur (icerik.talepler; bkz. talepler.mjs): ayrı tablo yoktur, yedek / içe aktarma / proje silme
// senaryo satırlarıyla birlikte taşır. Hiçbir istek atılmaz; koşu mevcut koşu yollarıyla (arayüzün koşu diyalogları) başlar.
//   GET  /platform/talepler?projeId=                        → { talepler: [{ talep, ekran, servis, uctanUca, toplam }] }
//   POST /platform/talepler/kosu-plani { projeId, talep }   → { talep, sayilar, planlar: [{ ortamId, ... }] }
// NOT: import.meta KULLANILMAZ. Tipler: talep-servisi.d.mts.
import { DepoHatasi, ekranlariListele, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { servisSenaryolariniListele, servisleriListele } from '../servisler/servis-deposu.mjs';
import { servisSenaryoAtlamaNedeni } from '../servisler/servis-isleri.mjs';
import { uctanUcaAkislari, uctanUcaOnDenetim } from '../akislar/uctan-uca.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { icerikTalepleri, talepEslesir, talepKucuk, talepSirala, talepTemizle } from './talepler.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {'ekran' | 'servis' | 'uctanUca'} TalepTuru */

/** Tür adları (arayüz, CSV, PDF). */
export const TALEP_TUR_ADLARI = Object.freeze({ ekran: 'Ekran senaryosu', servis: 'Servis senaryosu', uctanUca: 'Uçtan uca akış' });

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** @param {unknown} d */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Projedeki talepli tüm öğeler (tek geçiş): ekran senaryoları (ham satırdan; model şeması kurulmaz), servis senaryoları, uçtan uca akışlar.
 * @param {Veritabani} vt @param {string} projeId
 */
export function talepliOgeler(vt, projeId) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const ekranlar = new Map(ekranlariListele(vt, projeId, { silinenlerDahil: true }).map((e) => [e.id, e]));
  /** @type {Array<{ tur: 'ekran'; id: string; baslik: string; talepler: string[]; ekranId: string | null; ekranAdi: string | null; ekranEtkin: boolean; ortamlar: string[] }>} */
  const ekran = [];
  for (const s of vt.tumu('SELECT id, baslik, ekran_id, icerik_json FROM senaryolar WHERE proje_id = ? ORDER BY baslik', [projeId])) {
    let icerik = {};
    try { icerik = JSON.parse(String(s.icerik_json)); } catch { icerik = {}; }
    const talepler = icerikTalepleri(icerik);
    if (!talepler.length) continue;
    const e = s.ekran_id == null ? undefined : ekranlar.get(String(s.ekran_id));
    const o = nesneMi(icerik) && nesneMi(/** @type {any} */ (icerik).ortamlar) ? Object.keys(/** @type {any} */ (icerik).ortamlar) : [];
    ekran.push({ tur: 'ekran', id: String(s.id), baslik: String(s.baslik), talepler, ekranId: e?.id ?? null, ekranAdi: e?.ad ?? null, ekranEtkin: Boolean(e) && e?.durum === 'etkin', ortamlar: o });
  }
  const servisler = servisleriListele(vt, projeId);
  /** @type {Array<{ tur: 'servis'; id: string; baslik: string; talepler: string[]; servisId: string; servisAdi: string; kapsam: string; senaryo: import('../servisler/servis-deposu.mjs').ServisSenaryosu; servis: import('../servisler/servis-deposu.mjs').Servis }>} */
  const servis = [];
  for (const sv of servisler) {
    for (const s of servisSenaryolariniListele(vt, sv.id)) {
      const talepler = icerikTalepleri(s.icerik);
      if (talepler.length) servis.push({ tur: 'servis', id: s.id, baslik: s.baslik, talepler, servisId: sv.id, servisAdi: sv.ad, kapsam: s.kapsam, senaryo: s, servis: sv });
    }
  }
  /** @type {Array<{ tur: 'uctanUca'; id: string; baslik: string; talepler: string[]; kapsam: string }>} */
  const uctanUca = uctanUcaAkislari(vt, projeId).map((a) => ({ tur: /** @type {const} */ ('uctanUca'), id: a.id, baslik: a.baslik, talepler: icerikTalepleri(a.icerik), kapsam: a.kapsam }))
    .filter((a) => a.talepler.length);
  return { ekran, servis, uctanUca };
}

/**
 * Talep gruplaması: aynı talep (harf duyarsız) tek satır; görünen yazım en sık kullanılan (eşitse sıralamada ilki).
 * @param {Array<{ tur: TalepTuru; talepler: string[] }>} ogeler
 * @returns {Array<{ talep: string; anahtar: string; ekran: number; servis: number; uctanUca: number; toplam: number }>}
 */
export function talepGruplari(ogeler) {
  /** @type {Map<string, { yazimlar: Map<string, number>; ekran: number; servis: number; uctanUca: number }>} */
  const gruplar = new Map();
  for (const o of ogeler) {
    for (const t of o.talepler) {
      const k = talepKucuk(t);
      const g = gruplar.get(k) ?? { yazimlar: new Map(), ekran: 0, servis: 0, uctanUca: 0 };
      g.yazimlar.set(t, (g.yazimlar.get(t) ?? 0) + 1);
      g[o.tur]++;
      gruplar.set(k, g);
    }
  }
  return [...gruplar.entries()].map(([anahtar, g]) => {
    const talep = [...g.yazimlar.entries()].sort((a, b) => b[1] - a[1] || talepSirala(a[0], b[0]))[0][0];
    return { talep, anahtar, ekran: g.ekran, servis: g.servis, uctanUca: g.uctanUca, toplam: g.ekran + g.servis + g.uctanUca };
  }).sort((a, b) => talepSirala(a.talep, b.talep));
}

/**
 * Projedeki talepler (formdaki öneri listesi; proje içi benzersiz, harf duyarsız).
 * @param {Veritabani} vt @param {string} projeId
 */
export function projeTalepleri(vt, projeId) {
  const o = talepliOgeler(vt, projeId);
  return talepGruplari([...o.ekran, ...o.servis, ...o.uctanUca]).map(({ anahtar: _a, ...x }) => x);
}

/**
 * Talebin senaryo kümesi (harf duyarsız tam eşleşme).
 * @param {Veritabani} vt @param {string} projeId @param {string} talep
 */
export function talepSenaryolari(vt, projeId, talep) {
  const o = talepliOgeler(vt, projeId);
  const uyan = (/** @type {{ talepler: string[] }} */ x) => talepEslesir(x.talepler, talep);
  return { ekran: o.ekran.filter(uyan), servis: o.servis.filter(uyan), uctanUca: o.uctanUca.filter(uyan) };
}

/**
 * "Bu talebin senaryolarını koş" planı — her ortam için hangi senaryonun koşacağı ve atlananlar (nedeniyle). Kurallar mevcut koşu
 * yollarınınkiyle aynıdır, hiçbir istek atılmaz:
 *  - Ekran senaryosu: o ortamda tanımlı ve ekranı etkin olmalı ("Seçilenleri çalıştır" gibi; "Koşuda" anahtarı bakılmaz — açık seçim).
 *  - Servis senaryosu: servis işinin atlama kuralı (servisSenaryoAtlamaNedeni: taban adres, kapsam, CANLI'da çağrılmayan metot).
 *  - Uçtan uca akış: koşu penceresinin ön denetimi (uctanUcaOnDenetim: kapsam, ortamda eksik adım, yapısal hata).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} talepHam
 */
export function talepKosuPlani(vt, projeId, talepHam) {
  const { talep, hata } = talepTemizle(talepHam);
  if (hata || !talep) throw new DepoHatasi(hata ?? 'Talep no boş olamaz.');
  const kume = talepSenaryolari(vt, projeId, talep);
  const planlar = ortamlariListele(vt, projeId).map((ortam) => {
    /** @type {Array<{ tur: TalepTuru; baslik: string; neden: string }>} */
    const atlananlar = [];
    const ekran = [];
    for (const x of kume.ekran) {
      if (!x.ortamlar.includes(ortam.id)) atlananlar.push({ tur: 'ekran', baslik: x.baslik, neden: `"${ortam.ad}" ortamında tanımlı değil.` });
      else if (!x.ekranEtkin) atlananlar.push({ tur: 'ekran', baslik: x.baslik, neden: 'Ekran devre dışı.' });
      else ekran.push({ id: x.id, baslik: x.baslik, ekranAdi: x.ekranAdi });
    }
    /** @type {Map<string, { servisId: string; servisAdi: string; senaryolar: Array<{ id: string; baslik: string }> }>} */
    const servisler = new Map();
    for (const x of kume.servis) {
      const neden = servisSenaryoAtlamaNedeni(vt, x.servis, x.senaryo, ortam);
      if (neden) { atlananlar.push({ tur: 'servis', baslik: x.baslik, neden }); continue; }
      const g = servisler.get(x.servisId) ?? { servisId: x.servisId, servisAdi: x.servisAdi, senaryolar: [] };
      g.senaryolar.push({ id: x.id, baslik: x.baslik });
      servisler.set(x.servisId, g);
    }
    const uctanUca = [];
    for (const x of kume.uctanUca) {
      const d = uctanUcaOnDenetim(vt, projeId, { akisId: x.id, ortamId: ortam.id });
      if (!d.kosulabilir) atlananlar.push({ tur: 'uctanUca', baslik: x.baslik, neden: [...d.hatalar, ...d.uyarilar][0] ?? 'Bu ortamda koşamaz.' });
      else uctanUca.push({ id: x.id, baslik: x.baslik });
    }
    return { ortamId: ortam.id, ortamAdi: ortam.ad, riskli: riskliOrtamMi(ortam), ekran, servis: [...servisler.values()], uctanUca, atlananlar };
  });
  return {
    talep,
    sayilar: { ekran: kume.ekran.length, servis: kume.servis.length, uctanUca: kume.uctanUca.length },
    planlar
  };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const TALEP_GET_UCLARI = [
  ['/platform/talepler', (db, q) => ({ talepler: projeTalepleri(db, kimlik(q.get('projeId'), 'projeId')) })]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>} */
export const TALEP_POST_UCLARI = [
  ['/platform/talepler/kosu-plani', (db, g) => talepKosuPlani(db, kimlik(g.projeId, 'projeId'), g.talep)]
];
