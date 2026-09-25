// KODLU SENARYOLARI AKIŞA TAŞIMA (genel) — kodlu (POM'lu) bir ürünün senaryolarını, aynı ürünün model koşucusuyla koşan
// "akış" ekranına senaryo olarak kurar. Değerler projenin aktarım adaptöründen gelir (akisSenaryoTaslaklari: ürün verisini
// sunucu içinde okuyup kodlu testin senaryo matrisini akış ekranının alanlarına çevirir); bu dosyada proje bilgisi yoktur.
//  - Önizleme: taslaklar, her biri mevcut senaryo kaydıyla AYNI doğrulamadan geçirilir (yazılıp geri alınır); durum
//    yeni | var (bu ekranda aynı başlık) | hata (doğrulama mesajlarıyla).
//  - Uygula: seçilen başlıklardaki "yeni" taslaklar tek işlemde kaydedilir (biri hata verirse hiçbiri yazılmaz).
//  - Senaryolar yalnızca seçilen ortamda oluşur ve "Koşuda" kapalı gelir (toplu koşuya kendiliğinden girmez).
// NOT: import.meta KULLANILMAZ. Tipler: akis-tasima.d.mts.

import { DepoHatasi } from '../veritabani/depo.mjs';
import { KasaHatasi } from '../kasa.mjs';
import { ortamAnahtariBul, senaryoKaydet } from './senaryo-servisi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../../../projeler/index.d.mts').AktarimAdaptoru} AktarimAdaptoru */

const TASLAK_EN_COK = 200;
/** Önizlemede yazılıp geri alınan kaydın işareti. */
class Denetim extends Error {}

/**
 * Hedef ekran + ortam için adaptörün taslakları (doğrulanmamış).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {AktarimAdaptoru | null} adaptor
 */
function taslaklariAl(vt, projeId, ekranId, ortamId, adaptor) {
  const ekran = vt.tek("SELECT id, anahtar, ad FROM ekranlar WHERE id = ? AND proje_id = ? AND durum <> 'silindi'", [ekranId, projeId]);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  const ortam = vt.tek('SELECT id, ad FROM ortamlar WHERE id = ? AND proje_id = ?', [ortamId, projeId]);
  if (!ortam) throw new DepoHatasi('Ortam bulunamadı.');
  if (!adaptor || typeof adaptor.akisSenaryoTaslaklari !== 'function') throw new DepoHatasi('Bu projede kodlu senaryo taşıması yok.');
  const ortamAnahtari = ortamAnahtariBul(vt, projeId, ortamId);
  if (!ortamAnahtari) throw new DepoHatasi('Bu ortam aktarımla gelmedi; kodlu senaryoların verisi yalnızca aktarılmış ortamlarda var.');
  /** @type {ReturnType<NonNullable<AktarimAdaptoru['akisSenaryoTaslaklari']>>} */
  let t;
  try {
    t = adaptor.akisSenaryoTaslaklari(vt, projeId, ortamAnahtari, String(ekran.anahtar));
  } catch (hata) {
    // Adaptörün veri hatası (ör. ürün verisi bu ortamda yok) kullanıcıya açık mesaj olarak döner.
    throw hata instanceof DepoHatasi || hata instanceof KasaHatasi ? hata : new DepoHatasi(/** @type {Error} */ (hata).message);
  }
  if (!t) throw new DepoHatasi('Bu ekran için kodlu senaryo taşıması tanımlı değil.');
  if (t.taslaklar.length > TASLAK_EN_COK) throw new DepoHatasi(`Taslak sayısı çok fazla (${t.taslaklar.length}).`);
  return { ekran: { id: String(ekran.id), ad: String(ekran.ad) }, ortam: { id: String(ortam.id), ad: String(ortam.ad) }, ...t };
}

/**
 * Önizleme: taslaklar + durumları (yeni / var / hata). Hiçbir şey kalıcı yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {AktarimAdaptoru | null} adaptor
 */
export function akisTasimaOnizle(vt, projeId, ekranId, ortamId, adaptor) {
  // Önizleme her taslağı yazıp geri alır: bu yalnızca EN DIŞ işlemde geri alınır (iç içe işlem geri almaz, kalıcı olurdu).
  if (/** @type {any} */ (vt).islemDerinligi > 0) throw new Error('akisTasimaOnizle bir işlemin içinden çağrılamaz.');
  const t = taslaklariAl(vt, projeId, ekranId, ortamId, adaptor);
  const mevcut = new Set(vt.tumu('SELECT baslik FROM senaryolar WHERE ekran_id = ?', [ekranId]).map((s) => String(s.baslik)));
  const taslaklar = t.taslaklar.map((x) => {
    if (mevcut.has(x.baslik)) return { ...x, durum: /** @type {const} */ ('var'), hatalar: [] };
    try {
      vt.islem(() => {
        senaryoKaydet(vt, { projeId, ekranId, baslik: x.baslik, veri: x.veri, ortamIdleri: [ortamId], kosuyaDahil: false, yapan: 'Nöbetçi (taşıma önizlemesi)' }, { adaptor });
        throw new Denetim();
      });
    } catch (hata) {
      if (!(hata instanceof Denetim)) {
        const h = /** @type {{ message?: string; hatalar?: Array<{ alan: string; mesaj: string }> }} */ (hata);
        return { ...x, durum: /** @type {const} */ ('hata'), hatalar: Array.isArray(h.hatalar) && h.hatalar.length ? h.hatalar.map((y) => `${y.alan}: ${y.mesaj}`) : [String(h.message ?? hata)] };
      }
    }
    return { ...x, durum: /** @type {const} */ ('yeni'), hatalar: [] };
  });
  return { kaynakEkran: t.kaynakEkran, ekran: t.ekran, ortam: t.ortam, notlar: t.notlar, taslaklar };
}

/**
 * Seçilen başlıklardaki yeni taslakları kaydeder (tek işlem). var / hata olanlar seçilse de yazılmaz (sayılır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {AktarimAdaptoru | null} adaptor
 * @param {unknown} basliklar
 */
export function akisTasimaUygula(vt, projeId, ekranId, ortamId, adaptor, basliklar) {
  const secilen = new Set(Array.isArray(basliklar) ? basliklar.filter((b) => typeof b === 'string') : []);
  if (!secilen.size) throw new DepoHatasi('En az bir senaryo seçin.');
  const o = akisTasimaOnizle(vt, projeId, ekranId, ortamId, adaptor);
  const yazilacak = o.taslaklar.filter((x) => secilen.has(x.baslik) && x.durum === 'yeni');
  const eklenen = vt.islem(() => yazilacak.map((x) => senaryoKaydet(vt, {
    projeId, ekranId, baslik: x.baslik, veri: x.veri, ortamIdleri: [ortamId], kosuyaDahil: false, yapan: `Nöbetçi (kodlu senaryodan taşındı: ${o.kaynakEkran})`
  }, { adaptor }).id));
  return { eklenen: eklenen.length, atlanan: secilen.size - eklenen.length };
}
