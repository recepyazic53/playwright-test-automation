#!/usr/bin/env node
// TAŞINABİLİR PAKET (macOS) — "npm run paketle:mac [arm64|x64|hepsi]": Apple Silicon (arm64) ve Intel (x64) için AYRI arşiv
// üretir: dist/Nöbetçi-mac-arm64.tar.gz, dist/Nöbetçi-mac-x64.tar.gz (içinde Nöbetçi-mac-<mimari>/Nöbetçi.app + OKUBENI.txt;
// düzen: scripts/paket/mac-paketi.mjs). Uygulama içeriği Windows paketiyle aynıdır (scripts/paket/paket-ortak.mjs).
//
// İNDİRMELER (yalnız bunlar; önbellek dist/.mac-onbellek/, tekrar çalışmada yeniden indirilmez):
//   - Node (bu makinedeki sürüm, process.version) macOS arşivi: https://nodejs.org/dist/<sürüm>/ — aynı klasördeki
//     SHASUMS256.txt ile SHA-256 doğrulanır; uyuşmazsa dosya silinir ve paketleme durur.
//   - Playwright tarayıcıları (chromium, chromium-headless-shell, ffmpeg): adresler node_modules/playwright-core'un KENDİ kayıt
//     defterinden (registry.findExecutable(..).downloadURLs; PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ile macOS platformu) alınır.
//     Playwright bu dosyalar için özet yayımlamaz: ilk indirmede SHA-256 önbelleğe yazılır, sonraki kullanımda denetlenir;
//     ZIP içeriği ayrıca CRC-32 ile denetlenir.
//   Yönlendirmeler yalnız izinli adreslere izlenir; başka hiçbir adrese istek atılmaz.
// Arşivler Windows diskine AÇILMAZ: izinler ve sembolik bağlantılar kaynaktan doğrudan hedef tar.gz'ye yazılır.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { MIMARILER, macPaketiYaz, paketAdi } from './paket/mac-paketi.mjs';
import { PaketHatasi, iceAktarmaCozumlemesi, uygulamaIcerigi } from './paket/paket-ortak.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(KOK, 'dist');
const ONBELLEK = join(DIST, '.mac-onbellek');
/** İstek atılabilecek adresler (kullanıcı onaylı): Node dağıtımı ve Playwright'ın resmî tarayıcı dağıtımı. */
const IZINLI_KOKENLER = ['https://nodejs.org', 'https://cdn.playwright.dev', 'https://playwright.download.prss.microsoft.com', 'https://storage.googleapis.com'];
const TARAYICILAR = ['chromium', 'chromium-headless-shell', 'ffmpeg'];

const adim = (/** @type {string} */ m) => console.log(`• ${m}`);
const mb = (/** @type {number} */ b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const sha256 = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex');

/** @param {string} adres */
function izinliMi(adres) {
  const u = new URL(adres);
  if (!IZINLI_KOKENLER.includes(u.origin)) return false;
  if (u.origin === 'https://nodejs.org') return u.pathname.startsWith(`/dist/${process.version}/`);
  // Google'ın resmî Chrome for Testing deposu: yalnız Playwright'ın kayıt defterindeki Chromium sürümü (kullanıcı onayıyla).
  if (u.origin === 'https://storage.googleapis.com') return u.pathname.startsWith('/chrome-for-testing-public/153.0.8010.12/');
  return true;
}

/**
 * Önbellekte yoksa indirir (yönlendirmeler yalnız izinli adreslere). Döndürür: dosya yolu.
 * @param {string[]} adresler sırayla denenir (Playwright yansıları)
 * @param {string} dosyaAdi önbellekteki ad
 */
async function indir(adresler, dosyaAdi) {
  const hedef = join(ONBELLEK, dosyaAdi);
  if (existsSync(hedef)) { adim(`Önbellekte: ${dosyaAdi} (${mb(statSync(hedef).size)})`); return hedef; }
  /** @type {unknown} */
  let sonHata = null;
  for (const ilk of adresler) {
    let adres = ilk;
    try {
      for (let yon = 0; yon < 5; yon++) {
        if (!izinliMi(adres)) throw new Error(`İzin verilmeyen adres: ${adres}`);
        const yanit = await fetch(adres, { redirect: 'manual', signal: AbortSignal.timeout(15 * 60 * 1000) });
        if (yanit.status >= 300 && yanit.status < 400 && yanit.headers.get('location')) {
          adres = new URL(/** @type {string} */ (yanit.headers.get('location')), adres).toString();
          continue;
        }
        if (!yanit.ok) throw new Error(`HTTP ${yanit.status}: ${adres}`);
        const veri = Buffer.from(await yanit.arrayBuffer());
        writeFileSync(`${hedef}.part`, veri);
        renameSync(`${hedef}.part`, hedef);
        adim(`İndirildi: ${adres} (${mb(veri.length)})`);
        return hedef;
      }
      throw new Error(`Çok fazla yönlendirme: ${ilk}`);
    } catch (h) {
      sonHata = h;
      console.error(`  ! ${adres}: ${h instanceof Error ? h.message : String(h)}`);
    }
  }
  throw new Error(`İndirilemedi: ${dosyaAdi} (${sonHata instanceof Error ? sonHata.message : String(sonHata)})`);
}

/** Node arşivi: SHASUMS256.txt ile doğrulanır. @param {import('./paket/mac-paketi.mjs').MacMimarisi} mimari */
async function nodeArsivi(mimari) {
  const surum = process.version;
  const taban = `https://nodejs.org/dist/${surum}`;
  const ozetler = readFileSync(await indir([`${taban}/SHASUMS256.txt`], `node-${surum}-SHASUMS256.txt`), 'utf8');
  const ad = `node-${surum}-${MIMARILER[mimari].node}.tar.gz`;
  const beklenen = ozetler.split(/\r?\n/).map((s) => s.trim().split(/\s+/)).find((p) => p[1] === ad)?.[0];
  if (!beklenen) throw new Error(`SHASUMS256.txt içinde ${ad} yok.`);
  const yol = await indir([`${taban}/${ad}`], ad);
  const veri = readFileSync(yol);
  const bulunan = sha256(veri);
  if (bulunan !== beklenen) {
    rmSync(yol, { force: true });
    throw new Error(`SHA-256 UYUŞMUYOR: ${ad} (beklenen ${beklenen}, bulunan ${bulunan}); dosya silindi, paketleme durdu.`);
  }
  adim(`SHA-256 doğrulandı: ${ad} (${bulunan})`);
  return { veri, adres: `${taban}/${ad}`, sha: bulunan };
}

/**
 * Playwright'ın kendi kayıt defterinden macOS indirme adresleri ve klasör / ikili yolları (ayrı süreçte, platform zorlamasıyla).
 * @param {import('./paket/mac-paketi.mjs').MacMimarisi} mimari
 * @returns {Array<{ ad: string; klasor: string; yurutulebilir: string; adresler: string[] }>}
 */
function playwrightIndirmeleri(mimari) {
  const betik = `
    const { registry } = require('playwright-core/lib/coreBundle').registry;
    const path = require('path');
    const cikti = ${JSON.stringify(TARAYICILAR)}.map((ad) => {
      const e = registry.findExecutable(ad);
      const yol = e.executablePath('javascript');
      return { ad, klasor: path.basename(e.directory), yurutulebilir: path.relative(e.directory, yol).split(path.sep).join('/'), adresler: e.downloadURLs };
    });
    process.stdout.write(JSON.stringify(cikti));`;
  const cikti = execFileSync(process.execPath, ['-e', betik], {
    cwd: KOK, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: MIMARILER[mimari].playwright }
  });
  /** @type {Array<{ ad: string; klasor: string; yurutulebilir: string; adresler: string[] }>} */
  const liste = JSON.parse(cikti);
  for (const x of liste) {
    if (!x.adresler.length) throw new Error(`Playwright ${x.ad} için ${mimari} indirme adresi vermedi.`);
    for (const a of x.adresler) if (!izinliMi(a)) throw new Error(`Beklenmeyen Playwright adresi: ${a}`);
  }
  return liste;
}

/** @param {{ ad: string; klasor: string; adresler: string[] }} x */
async function tarayiciArsivi(x) {
  const dosyaAdi = `${x.klasor}-${basename(new URL(x.adresler[0]).pathname)}`;
  const yol = await indir(x.adresler, dosyaAdi);
  const veri = readFileSync(yol);
  const ozet = sha256(veri);
  const kayit = `${yol}.sha256`;
  if (existsSync(kayit)) {
    const onceki = readFileSync(kayit, 'utf8').trim();
    if (onceki !== ozet) {
      rmSync(yol, { force: true });
      rmSync(kayit, { force: true });
      throw new Error(`Önbellekteki ${dosyaAdi} değişmiş (SHA-256 ${onceki} → ${ozet}); silindi, yeniden çalıştırın.`);
    }
  } else writeFileSync(kayit, `${ozet}\n`);
  return { veri, ozet, dosyaAdi };
}

async function main() {
  const secim = (process.argv[2] || 'hepsi').toLowerCase();
  /** @type {Array<import('./paket/mac-paketi.mjs').MacMimarisi>} */
  const mimariler = secim === 'hepsi' ? ['arm64', 'x64'] : secim === 'arm64' || secim === 'x64' ? [secim] : [];
  if (!mimariler.length) { console.error('Kullanım: npm run paketle:mac -- [arm64|x64|hepsi]'); process.exit(1); }
  // Hafif, platformdan bağımsız denetim (macOS arşivi burada açılıp çalıştırılamaz): arşive girecek uygulama dosyalarının içe
  // aktardığı tüm modüller arşivde var mı? İndirmeden ÖNCE yapılır; eksikse paketleme durur.
  const icerik = [...uygulamaIcerigi(KOK)];
  const kaynak = new Map(icerik.map((x) => [x.goreli, x.kaynak]));
  const cozulmeyen = iceAktarmaCozumlemesi(icerik, (g) => readFileSync(/** @type {string} */ (kaynak.get(g)), 'utf8'), builtinModules);
  if (cozulmeyen.length) { console.error(['İçe aktarılan modül arşivde yok:', ...cozulmeyen.map((x) => `  ${x}`)].join('\n')); process.exit(3); }
  adim('İçe aktarma çözümlemesi: arşive girecek tüm modüller var.');
  mkdirSync(ONBELLEK, { recursive: true });

  for (const mimari of mimariler) {
    console.log(`\n=== macOS ${mimari} (${MIMARILER[mimari].ad}) ===`);
    const node = await nodeArsivi(mimari);
    const tarayicilar = [];
    for (const x of playwrightIndirmeleri(mimari)) {
      const a = await tarayiciArsivi(x);
      adim(`${x.klasor}: ${a.dosyaAdi} ${mb(a.veri.length)} sha256=${a.ozet}`);
      tarayicilar.push({ klasor: x.klasor, zip: a.veri, yurutulebilir: x.yurutulebilir });
    }
    const hedef = join(DIST, `${paketAdi(mimari)}.tar.gz`);
    const gecici = `${hedef}.part`;
    rmSync(gecici, { force: true });
    adim(`Arşiv yazılıyor: ${hedef}`);
    try {
      const ozet = await macPaketiYaz({ kok: KOK, hedef: gecici, mimari, nodeArsivi: node.veri, nodeSurumu: process.version, tarayicilar });
      rmSync(hedef, { force: true });
      renameSync(gecici, hedef);
      adim(`${ozet.dosyaSayisi} dosya, ${ozet.klasorSayisi} klasör, ${ozet.baglantiSayisi} sembolik bağlantı, ${ozet.yurutulebilirSayisi} yürütülebilir; açık boyut ${mb(ozet.tarBayti)}`);
      console.log(`Paket hazır: ${hedef} (${mb(statSync(hedef).size)}).`);
    } catch (h) {
      rmSync(gecici, { force: true });
      throw h;
    }
  }
}

main().catch((h) => {
  console.error(h instanceof PaketHatasi || h instanceof Error ? h.message : String(h));
  process.exit(1);
});
