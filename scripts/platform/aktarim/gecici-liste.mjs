// AKTARIM SIRASINDA TEST LİSTESİ (genel) — testler veriyi YALNIZCA platform veritabanından okur
// (tests/support/platform-veri.ts). Aktarım adaptörü, senaryo satırlarını üretmek için test listesine
// ("playwright test --list") ihtiyaç duyar; ama henüz veritabanı yoktur. Bu yardımcı paketi GEÇİCİ,
// atılacak bir veritabanına (rastgele, hiçbir yere yazılmayan kasa parolasıyla) uygular, listeyi o
// veritabanı üzerinden alır ve veritabanını siler. Tarayıcı AÇILMAZ, siteye bağlanılmaz.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirebilir).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { veritabaniniHazirla } from '../veritabani/depo.mjs';
import { acikAnahtar, kasaOlustur } from '../kasa.mjs';
import { aktarimiUygula } from './motor.mjs';
import { playwrightTestleriniListele } from './playwright-liste.mjs';

/** Parola rastgele ve atıldığı için düşük maliyet yeterli (veritabanı iş bitince silinir). */
const GECICI_KDF = Object.freeze({ N: 2 ** 14, r: 8, p: 1 });

/**
 * @param {string} projeKoku spec dosyalarının bulunduğu proje kökü (Playwright burada çalışır)
 * @param {import('./motor.d.mts').AktarimPaketi} paket senaryo listesi OLMADAN kurulmuş paket
 * @param {string[]} ortamlar listelenecek ortam anahtarları
 * @returns {Promise<Record<string, Array<{ dosya: string; ad: string }> | Error>>} ortam → liste (ya da hata)
 */
export async function paketleTestleriListele(projeKoku, paket, ortamlar) {
  const klasor = mkdtempSync(join(tmpdir(), 'platform-aktarim-liste-'));
  try {
    const yol = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(yol);
    let anahtar;
    try {
      await kasaOlustur(vt, randomBytes(24).toString('base64url'), { kdf: GECICI_KDF });
      aktarimiUygula(vt, paket);
      anahtar = acikAnahtar(vt).toString('base64url');
    } finally {
      vt.kapat();
    }
    /** @type {Record<string, Array<{ dosya: string; ad: string }> | Error>} */
    const sonuc = {};
    for (const ortam of ortamlar) {
      try {
        sonuc[ortam] = await playwrightTestleriniListele(projeKoku, {
          TEST_ENV: ortam, TEST_SUNUCU_TUM_LISTE: '1', PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar
        });
      } catch (hata) {
        sonuc[ortam] = hata instanceof Error ? hata : new Error(String(hata));
      }
    }
    return sonuc;
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
}
