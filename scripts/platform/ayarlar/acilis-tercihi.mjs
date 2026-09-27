// AÇILIŞ TERCİHİ (Ayarlar > Arayüz > "Nöbetçi nasıl açılsın"): kullanıcı kararı — 'pencere' (kendi penceresinde, masaüstü
// uygulaması gibi) ya da 'tarayici' (varsayılan tarayıcıda sekme). Kasa açılmadan ÖNCE (başlatıcı, scripts/baslat.mjs) okunması
// gerektiği için kasada değil, veri kökündeki acilis.json dosyasında durur; gizli ya da kişisel bilgi içermez. Dosya yoksa
// (kullanıcı hiç seçmediyse; ilk kurulum / karşılama dahil) varsayılan 'tarayici'. Daha önce açıkça 'pencere' seçenin tercihi
// dosyada durduğu için korunur. Ortam değişkeni NOBETCI_ACILIS dosyanın önüne geçer (yalnız başlatıcıda).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ACILIS_BICIMLERI = /** @type {const} */ (['pencere', 'tarayici']);
const DOSYA = 'acilis.json';

/** Kaydedilmiş tercih yokken açılış biçimi. */
export const VARSAYILAN_ACILIS = /** @type {const} */ ('tarayici');

/** @param {string} veriKoku @returns {{ bicim: 'pencere' | 'tarayici'; ortamdan: boolean }} */
export function acilisTercihiniOku(veriKoku) {
  const ortam = String(process.env.NOBETCI_ACILIS || '').trim();
  if (ortam === 'pencere' || ortam === 'tarayici') return { bicim: ortam, ortamdan: true };
  try {
    const t = JSON.parse(readFileSync(join(veriKoku, DOSYA), 'utf8'));
    if (t && (t.bicim === 'pencere' || t.bicim === 'tarayici')) return { bicim: t.bicim, ortamdan: false };
  } catch { /* tercih yok */ }
  return { bicim: VARSAYILAN_ACILIS, ortamdan: false };
}

/** @param {string} veriKoku @param {unknown} bicim */
export function acilisTercihiniKaydet(veriKoku, bicim) {
  if (bicim !== 'pencere' && bicim !== 'tarayici') throw new Error("Açılış biçimi 'pencere' ya da 'tarayici' olmalı.");
  mkdirSync(veriKoku, { recursive: true });
  writeFileSync(join(veriKoku, DOSYA), `${JSON.stringify({ bicim }, null, 2)}\n`, 'utf8');
  return acilisTercihiniOku(veriKoku);
}
