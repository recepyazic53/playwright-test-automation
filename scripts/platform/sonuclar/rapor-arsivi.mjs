// RAPOR ARŞİVİ (sunucu; kasa açık olmalı): "Raporlar'a kaydet" ile üretilen PDF'ler (Sonuçlar > Raporlar).
// - PDF, ekran görüntüleri gibi şifreli medya deposundadır (medya.mjs > medyaSifrele): medya satırı tur 'diger', sonuc_id NULL,
//   sahip_turu 'rapor', sahip_id = rapor kimliği, icerik_turu application/pdf. İndirme o günkü PDF'in AYNISIDIR (yeniden üretilmez).
// - raporlar satırı proje kapsamlıdır (proje silinince CASCADE); meta_json şifreli ('ozel'): kapsam, seçim, dönem, ortam, seçenekler,
//   durum rozeti ve özet sayılar — gizli değer ya da test verisi değeri içermez.
// - Saklama: Ayarlar > Yedekleme > Rapor saklama süresi (30 / 90 / 180 gün / sınırsız; varsayılan 90). Günlük temizlik eski raporları
//   ve raporu silinmiş (ör. proje silindiğinde CASCADE ile) sahipsiz rapor medyasını siler; dosyalar güvenle (ezilerek) silinir.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { acikAnahtar, coz, medyaAnahtariniHazirla, sifrele, zarfMi } from '../kasa.mjs';
import { DepoHatasi } from '../veritabani/depo.mjs';
import { medyaDosyaAdiGecerliMi, medyaDosyasiniGuvenliSil, medyaSifrele, medyaTamamenCoz } from '../medya.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const RAPOR_MEDYA_SAHIBI = 'rapor';
const GUN_MS = 86_400_000;
/** Tek PDF'in en çok boyutu (bayt). */
export const EN_COK_PDF_BAYT = 100 * 1024 * 1024;

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** Raporu oluşturan (işletim sistemi kullanıcı adı; yoksa boş). */
function olusturanAdi() {
  try { return userInfo().username || ''; } catch { return ''; }
}

/**
 * PDF'i şifreleyip arşive yazar.
 * @param {Veritabani} vt
 * @param {{ projeId: string; kapsam: string; pdf: Buffer; dosyaAdi: string; meta: Record<string, unknown>; medyaKlasoru: string; olusturulma?: string; olusturan?: string }} g
 * @returns {Promise<string>} rapor kimliği
 */
export async function raporKaydet(vt, g) {
  acikAnahtar(vt);
  kimlik(g.projeId, 'projeId');
  if (!Buffer.isBuffer(g.pdf) || !g.pdf.length || g.pdf.length > EN_COK_PDF_BAYT) throw new DepoHatasi('PDF geçersiz.');
  if (!vt.tek('SELECT 1 AS v FROM projeler WHERE id = ?', [g.projeId])) throw new DepoHatasi('Proje bulunamadı.');
  const anahtar = medyaAnahtariniHazirla(vt);
  let yazilan;
  try {
    yazilan = await medyaSifrele(anahtar, g.medyaKlasoru, g.pdf);
  } finally {
    anahtar.fill(0);
  }
  const id = randomUUID();
  const medyaId = randomUUID();
  const zaman = g.olusturulma ?? new Date().toISOString();
  try {
    vt.islem(() => {
      vt.calistir(
        `INSERT INTO medya (id, sonuc_id, sira, tur, ad, icerik_turu, boyut, dosya, olusturulma, sahip_turu, sahip_id)
         VALUES (?, NULL, 0, 'diger', ?, 'application/pdf', ?, ?, ?, ?, ?)`,
        [medyaId, g.dosyaAdi.slice(0, 200), yazilan.boyut, yazilan.dosya, zaman, RAPOR_MEDYA_SAHIBI, id]
      );
      vt.calistir('INSERT INTO raporlar (id, proje_id, kapsam, olusturulma, olusturan, medya_id, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        id, g.projeId, String(g.kapsam).slice(0, 40), zaman, (g.olusturan ?? olusturanAdi()).slice(0, 200), medyaId,
        sifrele(vt, JSON.stringify({ ...g.meta, dosyaAdi: g.dosyaAdi, boyut: g.pdf.length }))
      ]);
    });
  } catch (hata) {
    medyaDosyasiniGuvenliSil(g.medyaKlasoru, yazilan.dosya);
    throw hata;
  }
  return id;
}

/** @param {Veritabani} vt @param {unknown} deger @returns {Record<string, any>} */
function metaOku(vt, deger) {
  try {
    const m = typeof deger === 'string' && deger ? JSON.parse(zarfMi(deger) ? coz(vt, deger) : deger) : {};
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}

/**
 * Projenin kaydedilmiş raporları (en yeni önce).
 * @param {Veritabani} vt @param {string} projeId
 */
export function raporlariListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu(
    `SELECT r.id, r.kapsam, r.olusturulma, r.olusturan, r.medya_id, r.meta_json, m.boyut, m.silinme, m.yedek_disi
       FROM raporlar r LEFT JOIN medya m ON m.id = r.medya_id WHERE r.proje_id = ? ORDER BY r.olusturulma DESC`, [kimlik(projeId, 'projeId')]
  ).map((r) => ({
    id: String(r.id), kapsam: String(r.kapsam), olusturulma: String(r.olusturulma), olusturan: r.olusturan == null ? '' : String(r.olusturan),
    boyut: r.boyut == null ? null : Number(r.boyut), dosyaVar: r.boyut != null && r.silinme == null && Number(r.yedek_disi ?? 0) === 0,
    meta: metaOku(vt, r.meta_json)
  }));
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id */
export function raporGetir(vt, projeId, id) {
  acikAnahtar(vt);
  const r = vt.tek('SELECT id, proje_id, kapsam, olusturulma, olusturan, medya_id, meta_json FROM raporlar WHERE id = ? AND proje_id = ?',
    [kimlik(id, 'id'), kimlik(projeId, 'projeId')]);
  if (!r) return null;
  return { id: String(r.id), kapsam: String(r.kapsam), olusturulma: String(r.olusturulma), medyaId: r.medya_id == null ? null : String(r.medya_id), meta: metaOku(vt, r.meta_json) };
}

/**
 * Kaydedilmiş PDF'in kendisi (kasadan çözülür; yeniden üretilmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} id @param {string} medyaKlasoru
 * @returns {Promise<{ pdf: Buffer; dosyaAdi: string }>}
 */
export async function raporPdfiniAl(vt, projeId, id, medyaKlasoru) {
  const r = raporGetir(vt, projeId, id);
  if (!r) throw new DepoHatasi('Rapor bulunamadı.');
  const m = r.medyaId ? vt.tek('SELECT dosya, silinme, yedek_disi FROM medya WHERE id = ?', [r.medyaId]) : null;
  if (!m || m.silinme != null || !medyaDosyaAdiGecerliMi(m.dosya)) throw new DepoHatasi('Raporun PDF dosyası bulunamadı.');
  if (Number(m.yedek_disi ?? 0) === 1) throw new DepoHatasi('Bu raporun PDF dosyası yedeğe dahil edilmemişti.');
  const anahtar = medyaAnahtariniHazirla(vt);
  try {
    const pdf = await medyaTamamenCoz(anahtar, join(medyaKlasoru, String(m.dosya)));
    return { pdf, dosyaAdi: typeof r.meta.dosyaAdi === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(r.meta.dosyaAdi) ? r.meta.dosyaAdi : 'nobetci-rapor.pdf' };
  } catch {
    throw new DepoHatasi('Raporun PDF dosyası okunamadı.');
  } finally {
    anahtar.fill(0);
  }
}

/**
 * Raporu (satır + medya satırı + şifreli dosya) siler.
 * @param {Veritabani} vt @param {string} projeId @param {string} id @param {string} medyaKlasoru
 */
export function raporSil(vt, projeId, id, medyaKlasoru) {
  const r = raporGetir(vt, projeId, id);
  if (!r) throw new DepoHatasi('Rapor bulunamadı.');
  /** @type {string[]} */
  const dosyalar = [];
  vt.islem(() => {
    for (const m of vt.tumu('SELECT id, dosya FROM medya WHERE sahip_turu = ? AND sahip_id = ?', [RAPOR_MEDYA_SAHIBI, r.id])) {
      dosyalar.push(String(m.dosya));
      vt.calistir('DELETE FROM medya WHERE id = ?', [m.id]);
    }
    vt.calistir('DELETE FROM raporlar WHERE id = ?', [r.id]);
  });
  for (const d of dosyalar) medyaDosyasiniGuvenliSil(medyaKlasoru, d);
  return { silinen: 1 };
}

/**
 * Saklama temizliği: gun günden eski raporlar (gun <= 0: hiçbiri) ve raporu olmayan (ör. proje silinince CASCADE ile giden)
 * rapor medyası silinir. Kasa gerekmez (şifreli alan okunmaz).
 * @param {Veritabani} vt @param {number} gun @param {{ medyaKlasoru: string; simdi?: number }} s
 * @returns {{ rapor: number; sahipsiz: number }}
 */
export function eskiRaporlariSil(vt, gun, s) {
  const simdi = s.simdi ?? Date.now();
  /** @type {string[]} */
  const dosyalar = [];
  let rapor = 0;
  let sahipsiz = 0;
  vt.islem(() => {
    if (Number.isFinite(gun) && gun > 0) {
      const esik = new Date(simdi - gun * GUN_MS).toISOString();
      for (const r of vt.tumu('SELECT id FROM raporlar WHERE olusturulma < ?', [esik])) {
        for (const m of vt.tumu('SELECT id, dosya FROM medya WHERE sahip_turu = ? AND sahip_id = ?', [RAPOR_MEDYA_SAHIBI, r.id])) {
          dosyalar.push(String(m.dosya));
          vt.calistir('DELETE FROM medya WHERE id = ?', [m.id]);
        }
        vt.calistir('DELETE FROM raporlar WHERE id = ?', [r.id]);
        rapor++;
      }
    }
    for (const m of vt.tumu('SELECT id, dosya FROM medya WHERE sahip_turu = ? AND sahip_id NOT IN (SELECT id FROM raporlar)', [RAPOR_MEDYA_SAHIBI])) {
      dosyalar.push(String(m.dosya));
      vt.calistir('DELETE FROM medya WHERE id = ?', [m.id]);
      sahipsiz++;
    }
  });
  for (const d of dosyalar) medyaDosyasiniGuvenliSil(s.medyaKlasoru, d);
  return { rapor, sahipsiz };
}
