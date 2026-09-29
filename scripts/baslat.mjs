#!/usr/bin/env node
// "npm run baslat": yerel test sunucusunu (scripts/test-sunucu.mjs) başlatır, hazır olunca arayüzü açar: http://127.0.0.1:<PORT>/
// Açılış biçimi KULLANICI KARARIDIR (Ayarlar > Arayüz > "Nöbetçi nasıl açılsın"; veri/acilis.json — gizli bilgi içermez;
// bkz. scripts/platform/ayarlar/acilis-tercihi.mjs):
//   - pencere  (varsayılan): kendi penceresinde masaüstü uygulaması gibi — Playwright'ın bu bilgisayarda zaten kurulu Chromium'u
//              uygulama kipinde (--app) açılır; adres çubuğu / sekme yoktur. Profil veri/pencere-profili altındadır (çerezler ve
//              önbellek kullanıcının varsayılan tarayıcısına karışmaz). Pencere kapanınca, sunucuyu bu komut başlattıysa sunucu da kapanır.
//   - tarayici : varsayılan tarayıcıda yeni sekme (scripts/dosya-ac.mjs).
//   Ortam değişkeni önceliklidir: NOBETCI_ACILIS=pencere|tarayici. Hiç açmamak için BASLAT_TARAYICI_ACMA=1.
// - Port: TEST_SUNUCU_PORT (varsayılan 5566). Portta çalışan sunucunun HANGİ KURULUMA ait olduğu /saglik'taki kurulum
//   kimliğiyle (veri klasörünün özeti; bkz. scripts/platform/kurulum-kimligi.mjs) denetlenir:
//     · aynı kurulum  → yenisi başlatılmaz; yalnızca arayüz açılır.
//     · başka kurulum → (ör. proje klasöründen çalışan başka bir Nöbetçi) o sunucuya dokunulmaz; sıradaki boş portta bu
//       kurulumun sunucusu başlatılır ve kullanıcıya bildirilir. Boş port aranırken kendi sunucusu bulunursa o açılır.
//   Chromium bulunamazsa varsayılan tarayıcıya düşülür (hiçbir şey indirilmez).
// - --arka-plan: arayüz açılmaz, bu kurulumun sunucusu zaten çalışıyorsa hiçbir şey yapılmaz (Windows oturum açılışı görevi;
//   bkz. arkaPlandaBaslat). Paketlerin başlatıcıları (Nöbetçi.exe, macOS Nobetci) bu betiği çağırdığı için aynı denetim geçerlidir.
// Sunucunun çıktısı bu terminalde görünür; kapatmak için Ctrl+C.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acilisTercihiniOku } from './platform/ayarlar/acilis-tercihi.mjs';
import { veriKoku } from './platform/calisma-alanlari.mjs';
import { kurulumKimligi, saglikOku, sunucuYeriBildirimi, sunucuYeriniBul } from './platform/kurulum-kimligi.mjs';

const klasor = dirname(fileURLToPath(import.meta.url));
const KOK = join(klasor, '..');
const ISTENEN_PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
const VERI = veriKoku(KOK);
const KIMLIK = kurulumKimligi(VERI);
/** Bu kurulumun sunucusunun portu (başka bir kurulum istenen portu tutuyorsa sıradaki boş port; bkz. yerBul). */
let PORT = ISTENEN_PORT;
let ADRES = `http://127.0.0.1:${PORT}/`;
/** Oturum açılışı görevinden: pencere/tarayıcı açmadan yalnız sunucu (bkz. arkaPlandaBaslat). */
const ARKA_PLAN = process.argv.includes('--arka-plan');
/** Tarayıcı açılamayıp pencereye düşülünce: pencere kapanınca yapılacak iş (aşağıda sunucuyu başlatan dal ayarlar). */
let yedekPencereKapaninca = (/** @type {import('node:child_process').ChildProcess} */ _p) => {};

/** Seçilen portta BU kurulumun sunucusu yanıt veriyor mu? */
async function sunucuHazirMi() {
  const y = await saglikOku(PORT);
  return Boolean(y && y.nobetci && y.kurulum === KIMLIK);
}

/**
 * Bu kurulumun sunucusunu bulur ya da yenisi için boş port seçer; PORT/ADRES'i ayarlar ve gerekiyorsa kullanıcıya bildirir.
 * @returns {Promise<'mevcut' | 'yeni' | 'yok'>}
 */
async function yerBul() {
  const yer = await sunucuYeriniBul({ port: ISTENEN_PORT, kimlik: KIMLIK });
  const bildirim = sunucuYeriBildirimi(yer, ISTENEN_PORT);
  if (bildirim) (yer.tur === 'yok' ? console.error : console.log)(bildirim);
  if (yer.port !== null) {
    PORT = yer.port;
    ADRES = `http://127.0.0.1:${PORT}/`;
  }
  return yer.tur;
}

/** Sunucu sürecinin ortamı: seçilen port sunucuya (ve onun başlattığı koşulara) verilir. */
const sunucuOrtami = () => ({ ...process.env, TEST_SUNUCU_PORT: String(PORT) });

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
  const tur = await yerBul();
  if (tur !== 'yeni') { if (tur === 'yok') process.exitCode = 1; return; }
  if (process.platform === 'win32' && process.env.NOBETCI_ARKA_PLAN_GIZLI !== '1') {
    const gizli = spawn(process.execPath, [fileURLToPath(import.meta.url), '--arka-plan'], {
      cwd: KOK, detached: true, windowsHide: true, stdio: 'ignore', shell: false, env: { ...process.env, NOBETCI_ARKA_PLAN_GIZLI: '1' }
    });
    gizli.unref();
    return;
  }
  // Çıktı görünmez: sunucu kendi günlüğünü (test-sunucu.log) yazar.
  const sunucu = spawn(process.execPath, [join(klasor, 'test-sunucu.mjs')], { cwd: KOK, stdio: 'ignore', shell: false, windowsHide: true, env: sunucuOrtami() });
  sunucu.on('exit', (kod) => process.exit(kod ?? 0));
  const kapat = (/** @type {NodeJS.Signals} */ sinyal) => { if (!sunucu.killed) sunucu.kill(sinyal); };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
}

/**
 * Varsayılan tarayıcıda açar. Açılamazsa (ör. Windows'ta "start" hatası: varsayılan tarayıcı tanımlı değil) yedek çağrılır — başlatıcı
 * paketteki Chromium penceresine düşer ve bunu günlüğe yazar. @param {() => void} [yedek]
 */
function varsayilanTarayicidaAc(yedek) {
  const alt = spawn(process.execPath, [join(klasor, 'dosya-ac.mjs'), ADRES], { stdio: 'inherit', shell: false });
  let dustu = false;
  const dus = (neden) => {
    if (dustu) return;
    dustu = true;
    console.error(`Varsayılan tarayıcı açılamadı (${neden}).${yedek ? ' Nöbetçi penceresi (Chromium) deneniyor.' : ` Adresi elle açın: ${ADRES}`}`);
    if (yedek) yedek();
  };
  alt.on('error', (hata) => dus(hata.message));
  alt.on('exit', (kod) => { if (kod) dus(`çıkış kodu ${kod}`); });
}

/** Kendi penceresi: Chromium uygulama kipi (--app). Chromium yoksa null. @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function pencereAc() {
  const yol = await chromiumYolu();
  if (!yol) return null;
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

/**
 * Arayüzü açar. Pencere kipinde pencere sürecini döndürür (kapanınca haber almak için); aksi hâlde null.
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
async function arayuzuAc() {
  if (process.env.BASLAT_TARAYICI_ACMA === '1') {
    console.log(`Nöbetçi arayüzü: ${ADRES}`);
    return null;
  }
  // Varsayılan (tercih kaydedilmemişse; ilk kurulum dahil): varsayılan tarayıcı. Açıkça "pencere" seçildiyse Chromium penceresi.
  if (acilisTercihiniOku(VERI).bicim === 'pencere') {
    const pencere = await pencereAc();
    if (pencere) return pencere;
    console.log('Chromium bulunamadı ("npx playwright install chromium"); varsayılan tarayıcı kullanılıyor.');
    varsayilanTarayicidaAc();
    return null;
  }
  // Tarayıcı açılamazsa pencereye düşülür; o pencere kapanınca (sunucuyu bu komut başlattıysa) Nöbetçi de kapanır.
  varsayilanTarayicidaAc(() => { void pencereAc().then((p) => { if (p) yedekPencereKapaninca(p); }); });
  return null;
}

const yerTuru = ARKA_PLAN ? null : await yerBul();
if (ARKA_PLAN) {
  await arkaPlandaBaslat();
} else if (yerTuru === 'yok') {
  process.exitCode = 1;
} else if (yerTuru === 'mevcut') {
  console.log(`Sunucu ${PORT} portunda zaten çalışıyor; arayüz açılıyor.`);
  await arayuzuAc();
} else {
  const sunucu = spawn(process.execPath, [join(klasor, 'test-sunucu.mjs')], { stdio: 'inherit', shell: false, env: sunucuOrtami() });
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
    const kapanincaKapat = (/** @type {import('node:child_process').ChildProcess} */ p) => p.on('exit', () => { console.log('Nöbetçi penceresi kapandı; sunucu kapatılıyor.'); kapat('SIGTERM'); });
    yedekPencereKapaninca = kapanincaKapat;
    const pencere = await arayuzuAc();
    // Pencere kipinde pencere kapanınca Nöbetçi de kapanır (sunucuyu bu komut başlattığı için).
    if (pencere) kapanincaKapat(pencere);
  }
}
