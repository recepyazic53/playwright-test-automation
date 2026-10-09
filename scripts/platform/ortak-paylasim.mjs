// EKİP PAYLAŞIMI — ortak klasör (OneDrive / ağ sürücüsü) üzerinden sürümlü yedek paylaşımı.
// Klasörde: `ortak-<sürüm>-<zaman>.tayedek` dosyaları (her yayın yeni sürüm; eskisi silinmez) + `ortak.json` (sürüm listesi).
// Yedekler `yedekDosyasiYaz(..., { ortak: true })` ile yazılır: kişiye özel bilgi ayıklanır (ortak-kisisel.mjs).
//
//   ortakKlasorAyarla(vt, klasor)   klasörü kaydeder (boş = paylaşımı kapat)
//   ortakDurum(vt)                  klasör, son sürüm, bende olan sürüm, güncelleme var mı, sürüm listesi
//   ortakYayinla(vt, secenekler)    yeni sürüm yazar; bende olan sürüm klasördekinden eskiyse REDDEDER ("önce güncelleyin")
//   ortakSurumDosyasi(vt, surum?)   güncelleme için sürümün dosya yolu (varsayılan: son)
//   ortakAlindiIsaretle(vt, surum)  bu makinede uygulanan sürümü kaydeder
// NOT: import.meta KULLANILMAZ.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { ayarGetir, ayarYaz } from './veritabani/depo.mjs';
import { YEDEK_UZANTISI, YedekHatasi, yedekDosyasiYaz } from './yedek.mjs';

export const ORTAK_KLASOR_AYARI = 'ortak-klasor';
export const ORTAK_DURUM_AYARI = 'ortak-durum';
export const ORTAK_LISTE_DOSYASI = 'ortak.json';

/**
 * @typedef {{ surum: number; dosya: string; yapan: string; zaman: string; not: string; bayt: number }} OrtakSurum
 */

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @returns {string | null} */
function klasorOku(vt) {
  const a = /** @type {{ klasor?: unknown } | null} */ (ayarGetir(vt, ORTAK_KLASOR_AYARI));
  return a && typeof a.klasor === 'string' && a.klasor ? a.klasor : null;
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @returns {number} */
function benimSurum(vt) {
  const d = /** @type {{ surum?: unknown } | null} */ (ayarGetir(vt, ORTAK_DURUM_AYARI));
  return d && typeof d.surum === 'number' ? d.surum : 0;
}

/** Klasördeki sürüm listesi (eskiden yeniye). Dosya yoksa/bozuksa boş liste. @param {string} klasor @returns {OrtakSurum[]} */
function listeOku(klasor) {
  const yol = join(klasor, ORTAK_LISTE_DOSYASI);
  if (!existsSync(yol)) return [];
  try {
    const o = JSON.parse(readFileSync(yol, 'utf8'));
    const dizi = Array.isArray(o?.surumler) ? o.surumler : [];
    return dizi
      .filter((/** @type {Record<string, unknown>} */ s) => typeof s?.surum === 'number' && typeof s?.dosya === 'string' && /^[\w.-]+$/.test(s.dosya))
      .map((/** @type {Record<string, unknown>} */ s) => ({
        surum: /** @type {number} */ (s.surum), dosya: /** @type {string} */ (s.dosya), yapan: String(s.yapan ?? ''), zaman: String(s.zaman ?? ''),
        not: String(s.not ?? ''), bayt: typeof s.bayt === 'number' ? s.bayt : 0
      }))
      .sort((/** @type {OrtakSurum} */ a, /** @type {OrtakSurum} */ b) => a.surum - b.surum);
  } catch {
    throw new YedekHatasi('VERI', 'Ortak klasördeki sürüm listesi (ortak.json) okunamadı; dosya bozulmuş olabilir.');
  }
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {unknown} klasor */
export function ortakKlasorAyarla(vt, klasor) {
  if (typeof klasor !== 'string' || !klasor.trim()) {
    ayarYaz(vt, ORTAK_KLASOR_AYARI, { klasor: null });
    return;
  }
  const yol = klasor.trim();
  if (!existsSync(yol) || !statSync(yol).isDirectory()) throw new YedekHatasi('VERI', 'Ortak klasör bulunamadı; OneDrive / ağ klasörünün bu bilgisayarda açık olduğundan emin olun.');
  ayarYaz(vt, ORTAK_KLASOR_AYARI, { klasor: yol });
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt */
export function ortakDurum(vt) {
  const klasor = klasorOku(vt);
  const benim = benimSurum(vt);
  if (!klasor) return { klasor: null, bulunamadi: false, benimSurum: benim, sonSurum: 0, guncelleVar: false, surumler: /** @type {OrtakSurum[]} */ ([]) };
  if (!existsSync(klasor)) return { klasor, bulunamadi: true, benimSurum: benim, sonSurum: 0, guncelleVar: false, surumler: [] };
  const surumler = listeOku(klasor);
  const son = surumler.length ? surumler[surumler.length - 1].surum : 0;
  return { klasor, bulunamadi: false, benimSurum: benim, sonSurum: son, guncelleVar: son > benim, surumler: surumler.slice(-30).reverse() };
}

/** @param {number} n */
const sirali = (n) => String(n).padStart(4, '0');

/**
 * Yeni sürüm yayınlar. Bende olan sürüm klasördeki sondan eskiyse reddedilir (başkasının değişikliğinin üzerine yazmamak için).
 * @param {import('./veritabani/baglanti.mjs').Veritabani} vt
 * @param {{ yapan?: string; not?: string; ilerleme?: (asama: string, yuzde: number) => void }} [secenekler]
 */
export async function ortakYayinla(vt, secenekler = {}) {
  const klasor = klasorOku(vt);
  if (!klasor) throw new YedekHatasi('VERI', 'Önce ortak klasörü seçin.');
  if (!existsSync(klasor)) throw new YedekHatasi('VERI', 'Ortak klasör bulunamadı; OneDrive / ağ klasörünün açık olduğundan emin olun.');
  const liste = listeOku(klasor);
  const son = liste.length ? liste[liste.length - 1].surum : 0;
  if (benimSurum(vt) < son) {
    throw new YedekHatasi('ONCE_GUNCELLE', `Ortak klasörde daha yeni bir sürüm var (v${son}). Başkasının değişikliğinin üzerine yazmamak için önce güncelleyin.`);
  }
  const surum = son + 1;
  const zaman = new Date().toISOString();
  const dosya = `ortak-${sirali(surum)}-${zaman.replace(/[-:]/g, '').slice(0, 13)}${YEDEK_UZANTISI}`;
  const hedef = join(klasor, dosya);
  if (existsSync(hedef)) throw new YedekHatasi('ONCE_GUNCELLE', 'Aynı sürüm numarası az önce başkası tarafından yayınlandı; güncelleyip tekrar deneyin.');
  await yedekDosyasiYaz(vt, hedef, { ortak: true, ...(secenekler.ilerleme ? { ilerleme: secenekler.ilerleme } : {}) });
  /** @type {OrtakSurum} */
  const kayit = {
    surum, dosya, yapan: (secenekler.yapan ?? '').trim() || userInfo().username, zaman,
    not: String(secenekler.not ?? '').trim().slice(0, 300), bayt: statSync(hedef).size
  };
  const gecici = join(klasor, `${ORTAK_LISTE_DOSYASI}.${process.pid}.gecici`);
  mkdirSync(klasor, { recursive: true });
  writeFileSync(gecici, JSON.stringify({ bicim: 1, surumler: [...liste, kayit] }, null, 2), 'utf8');
  renameSync(gecici, join(klasor, ORTAK_LISTE_DOSYASI));
  ayarYaz(vt, ORTAK_DURUM_AYARI, { surum });
  return kayit;
}

/** Güncelleme için sürümün dosya yolu (surum verilmezse son). @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {number} [surum] */
export function ortakSurumDosyasi(vt, surum) {
  const klasor = klasorOku(vt);
  if (!klasor || !existsSync(klasor)) throw new YedekHatasi('VERI', 'Ortak klasör bulunamadı.');
  const liste = listeOku(klasor);
  const k = surum === undefined ? liste[liste.length - 1] : liste.find((s) => s.surum === surum);
  if (!k) throw new YedekHatasi('VERI', 'Ortak klasörde yayınlanmış sürüm yok.');
  const yol = join(klasor, k.dosya);
  if (!existsSync(yol)) throw new YedekHatasi('VERI', `Sürüm dosyası klasörde yok (${k.dosya}); OneDrive eşitlemesinin bitmesini bekleyin.`);
  return { yol, kayit: k };
}

/** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {number} surum */
export function ortakAlindiIsaretle(vt, surum) {
  if (!Number.isInteger(surum) || surum < 0) throw new YedekHatasi('VERI', 'Geçersiz sürüm.');
  ayarYaz(vt, ORTAK_DURUM_AYARI, { surum });
}
