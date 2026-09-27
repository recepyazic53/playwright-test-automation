#!/usr/bin/env node
// "npm run baslat": yerel test sunucusunu (scripts/test-sunucu.mjs) başlatır, hazır olunca arayüzü açar: http://127.0.0.1:<PORT>/
// Açılış biçimi KULLANICI KARARIDIR (Ayarlar > Arayüz > "Nöbetçi nasıl açılsın"; veri/acilis.json — gizli bilgi içermez;
// bkz. scripts/platform/ayarlar/acilis-tercihi.mjs):
//   - pencere  (varsayılan): kendi penceresinde masaüstü uygulaması gibi — Playwright'ın bu bilgisayarda zaten kurulu Chromium'u
//              uygulama kipinde (--app) açılır; adres çubuğu / sekme yoktur. Profil veri/pencere-profili altındadır (çerezler ve
//              önbellek kullanıcının varsayılan tarayıcısına karışmaz). Pencere kapanınca, sunucuyu bu komut başlattıysa sunucu da kapanır.
//   - tarayici : varsayılan tarayıcıda yeni sekme (scripts/dosya-ac.mjs).
//   Ortam değişkeni önceliklidir: NOBETCI_ACILIS=pencere|tarayici. Hiç açmamak için BASLAT_TARAYICI_ACMA=1.
// - Sunucu bu portta zaten çalışıyorsa yenisi başlatılmaz; yalnızca arayüz açılır.
// - Port: TEST_SUNUCU_PORT (varsayılan 5566). Chromium bulunamazsa varsayılan tarayıcıya düşülür (hiçbir şey indirilmez).
// - --arka-plan: arayüz açılmaz, sunucu zaten çalışıyorsa hiçbir şey yapılmaz (Windows oturum açılışı görevi; bkz. arkaPlandaBaslat).
// Sunucunun çıktısı bu terminalde görünür; kapatmak için Ctrl+C.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acilisTercihiniOku } from './platform/ayarlar/acilis-tercihi.mjs';
import { veriKoku } from './platform/calisma-alanlari.mjs';

const klasor = dirname(fileURLToPath(import.meta.url));
const KOK = join(klasor, '..');
const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
const ADRES = `http://127.0.0.1:${PORT}/`;
const VERI = veriKoku(KOK);
/** Oturum açılışı görevinden: pencere/tarayıcı açmadan yalnız sunucu (bkz. arkaPlandaBaslat). */
const ARKA_PLAN = process.argv.includes('--arka-plan');

async function sunucuHazirMi() {
  try {
    const yanit = await fetch(`http://127.0.0.1:${PORT}/saglik`, { signal: AbortSignal.timeout(1000) });
    return yanit.ok;
  } catch {
    return false;
  }
}

/** Playwright'ın kurulu Chromium'u (yoksa null; indirme yapılmaz). */
async function chromiumYolu() {
  try {
    const { chromium } = await import('playwright');
    const yol = chromium.executablePath();
    return yol && existsSync(yol) ? yol : null;
  } catch {
    return null;
  }
}

/**
 * --arka-plan (Ayarlar > Koşu > "Bilgisayar açılınca Nöbetçi arka planda başlasın" görevi): arayüz / pencere AÇILMAZ; sunucu
 * zaten çalışıyorsa hiçbir şey yapılmaz. Windows'ta Görev Zamanlayıcı node.exe'yi görünür bir konsolla başlatır: bu süreç
 * kendini konsolsuz (windowsHide + detached; ek araç gerekmez) yeniden başlatıp hemen çıkar — konsol yalnız bir an görünür.
 * Paketli sürümde Nöbetçi.exe node'u zaten penceresiz başlatır (NOBETCI_ARKA_PLAN_GIZLI=1) ve bu adım atlanır.
 */
async function arkaPlandaBaslat() {
  if (await sunucuHazirMi()) return;
  if (process.platform === 'win32' && process.env.NOBETCI_ARKA_PLAN_GIZLI !== '1') {
    const gizli = spawn(process.execPath, [fileURLToPath(import.meta.url), '--arka-plan'], {
      cwd: KOK, detached: true, windowsHide: true, stdio: 'ignore', shell: false, env: { ...process.env, NOBETCI_ARKA_PLAN_GIZLI: '1' }
    });
    gizli.unref();
    return;
  }
  // Çıktı görünmez: sunucu kendi günlüğünü (test-sunucu.log) yazar.
  const sunucu = spawn(process.execPath, [join(klasor, 'test-sunucu.mjs')], { cwd: KOK, stdio: 'ignore', shell: false, windowsHide: true, env: process.env });
  sunucu.on('exit', (kod) => process.exit(kod ?? 0));
  const kapat = (/** @type {NodeJS.Signals} */ sinyal) => { if (!sunucu.killed) sunucu.kill(sinyal); };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
}

function varsayilanTarayicidaAc() {
  const alt = spawn(process.execPath, [join(klasor, 'dosya-ac.mjs'), ADRES], { stdio: 'inherit', shell: false });
  alt.on('error', (hata) => console.error(`Tarayıcı açılamadı (${hata.message}); adresi elle açın: ${ADRES}`));
}

/**
 * Arayüzü açar. Pencere kipinde pencere sürecini döndürür (kapanınca haber almak için); aksi hâlde null.
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
async function arayuzuAc() {
  if (process.env.BASLAT_TARAYICI_ACMA === '1') {
    console.log(`Nöbetçi arayüzü: ${ADRES}`);
    return null;
  }
  if (acilisTercihiniOku(VERI).bicim === 'pencere') {
    const yol = await chromiumYolu();
    if (yol) {
      const profil = join(VERI, 'pencere-profili');
      mkdirSync(profil, { recursive: true });
      const pencere = spawn(yol, [
        `--app=${ADRES}`, `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check',
        '--window-size=1440,920', '--disable-features=Translate'
      ], { stdio: 'ignore', shell: false, detached: false });
      pencere.on('error', (hata) => { console.error(`Pencere açılamadı (${hata.message}); varsayılan tarayıcı kullanılıyor.`); varsayilanTarayicidaAc(); });
      console.log(`Nöbetçi kendi penceresinde açıldı (${ADRES}).`);
      return pencere;
    }
    console.log('Chromium bulunamadı ("npx playwright install chromium"); varsayılan tarayıcı kullanılıyor.');
  }
  varsayilanTarayicidaAc();
  return null;
}

if (ARKA_PLAN) {
  await arkaPlandaBaslat();
} else if (await sunucuHazirMi()) {
  console.log(`Sunucu ${PORT} portunda zaten çalışıyor; arayüz açılıyor.`);
  await arayuzuAc();
} else {
  const sunucu = spawn(process.execPath, [join(klasor, 'test-sunucu.mjs')], { stdio: 'inherit', shell: false, env: process.env });
  sunucu.on('exit', (kod) => process.exit(kod ?? 0));
  const kapat = (/** @type {NodeJS.Signals} */ sinyal) => { if (!sunucu.killed) sunucu.kill(sinyal); };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
  let hazir = false;
  for (let i = 0; i < 100 && !hazir; i++) {
    await new Promise((coz) => setTimeout(coz, 200));
    hazir = await sunucuHazirMi();
  }
  if (!hazir) console.error(`Sunucu 20 saniye içinde hazır olmadı; çıktıyı kontrol edin. Adres: ${ADRES}`);
  else {
    const pencere = await arayuzuAc();
    // Pencere kipinde pencere kapanınca Nöbetçi de kapanır (sunucuyu bu komut başlattığı için).
    pencere?.on('exit', () => { console.log('Nöbetçi penceresi kapandı; sunucu kapatılıyor.'); kapat('SIGTERM'); });
  }
}
