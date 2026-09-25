// Playwright test listesini (dosya + başlık) "--list --reporter=json" ile okur — genel yardımcı
// (hiçbir projeye özgü değil). Aktarım adaptörleri senaryo satırlarını bu listeden üretir.
// Tarayıcı AÇMAZ, siteye bağlanmaz: yalnızca spec dosyaları yüklenip testler listelenir.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirebilir).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Alt süreç ortamı: bu süreçten gelen Playwright worker değişkenleri (iç içe çalışmada), platform
 * veritabanı/kasa ve sunucu koşu değişkenleri çıkarılır — liste yalnızca ekOrtam'daki değerlerle kurulur.
 * @returns {NodeJS.ProcessEnv}
 */
function temizOrtam() {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|PLATFORM_|TEST_SUNUCU_)/.test(k)) continue;
    env[k] = v;
  }
  return env;
}

/**
 * @param {string} projeKoku
 * @param {Record<string, string>} ekOrtam alt sürece eklenecek ortam değişkenleri
 * @returns {Promise<Array<{ dosya: string; ad: string }>>} dosya: testDir'e göre göreli, "/" ayraçlı
 */
export function playwrightTestleriniListele(projeKoku, ekOrtam = {}) {
  const cli = join(projeKoku, 'node_modules', '@playwright', 'test', 'cli.js');
  return new Promise((coz, reddet) => {
    if (!existsSync(cli)) { reddet(new Error('Playwright bulunamadı (npm install çalıştırılmamış olabilir).')); return; }
    execFile(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
      cwd: projeKoku, env: { ...temizOrtam(), ...ekOrtam }, maxBuffer: 64 * 1024 * 1024, shell: false, windowsHide: true
    }, (hata, stdout, stderr) => {
      let veri;
      try {
        veri = JSON.parse(stdout);
      } catch {
        // stderr gizli değer içermez (yalnızca Playwright/yükleme hataları) ama yine de kısaltılır.
        reddet(new Error(`Test listesi alınamadı: ${(hata?.message || String(stderr || '')).split('\n')[0].slice(0, 300)}`));
        return;
      }
      /** @type {Array<{ dosya: string; ad: string }>} */
      const liste = [];
      (function gez(/** @type {Record<string, *>} */ suite, /** @type {string | undefined} */ ustDosya) {
        const dosya = suite.file ?? ustDosya;
        for (const alt of suite.suites ?? []) gez(alt, dosya);
        for (const spec of suite.specs ?? []) {
          if (spec.title) liste.push({ dosya: String(spec.file ?? dosya).replace(/\\/g, '/'), ad: String(spec.title) });
        }
      })(veri, undefined);
      if (Array.isArray(veri.errors) && veri.errors.length) {
        reddet(new Error(`Test listesi yüklenirken hata: ${String(veri.errors[0]?.message ?? '').split('\n')[0].slice(0, 300)}`));
        return;
      }
      coz(liste);
    });
  });
}
