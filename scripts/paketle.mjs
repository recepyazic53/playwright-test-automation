#!/usr/bin/env node
// TAŞINABİLİR PAKET (Windows) — "npm run paketle": Nöbetçi'yi, bilgisayarında Node / VS Code olmayan birinin çift tıklayıp
// açabileceği bir klasöre dönüştürür. Hiçbir şey indirmez: bu bilgisayardaki Node (process.execPath), node_modules'teki
// çalışma zamanı paketleri ve Playwright'ın indirilmiş tarayıcıları kopyalanır; başlatıcı Windows'un kendi .NET Framework
// derleyicisiyle (csc.exe) derlenir.
//
// Çıktı (varsayılan dist/Nöbetçi/; ilk argümanla değişir):
//   Nöbetçi.exe          başlatıcı (scripts/paket/Nobetci.cs)
//   runtime/node.exe     Node
//   uygulama/            Nöbetçi (scripts, tests/support, tests/model-kosucu, yapılandırma, çalışma zamanı modülleri);
//                        kullanıcı verisi uygulama/veri/ altında (şifreli kasa) oluşur
//   tarayicilar/         Playwright tarayıcıları (Chromium + başsız kabuk + ffmpeg)
//   OKUBENI.txt          kullanım notu
// Kullanıcı verisi (veri/), .env, test sonuçları ve oturum dosyaları pakete GİRMEZ.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEDEF = resolve(process.argv[2] || join(KOK, 'dist', 'Nöbetçi'));
const UYGULAMA = join(HEDEF, 'uygulama');

if (process.platform !== 'win32') {
  console.error('Taşınabilir paket yalnızca Windows için üretilir (başlatıcı .exe).');
  process.exit(1);
}
// Güvenlik: hedef proje klasörü ya da onun üst klasörlerinden biri olamaz (yanlışlıkla silinmesin).
if (KOK === HEDEF || KOK.startsWith(HEDEF + sep)) {
  console.error(`Geçersiz hedef: ${HEDEF}`);
  process.exit(1);
}

const adim = (m) => console.log(`• ${m}`);
const boyut = (yol) => {
  let t = 0;
  const gez = (y) => { const s = statSync(y); if (s.isDirectory()) for (const a of readdirSync(y)) gez(join(y, a)); else t += s.size; };
  if (existsSync(yol)) gez(yol);
  return t;
};
const mb = (b) => `${Math.round(b / 1024 / 1024)} MB`;

adim(`Hedef: ${HEDEF}`);
if (existsSync(HEDEF)) rmSync(HEDEF, { recursive: true, force: true });
mkdirSync(UYGULAMA, { recursive: true });

// 1) Uygulama dosyaları (kullanıcı verisi, günlük ve geçici dosyalar hariç).
const HARIC = [/[\\/]test-sunucu\.log$/, /[\\/]\.test-sunucu-token$/, /[\\/]paket[\\/]/];
const kopyala = (goreli) => {
  const kaynak = join(KOK, goreli);
  if (!existsSync(kaynak)) return;
  cpSync(kaynak, join(UYGULAMA, goreli), { recursive: true, filter: (y) => !HARIC.some((d) => d.test(y)) });
};
for (const g of ['package.json', 'playwright.config.ts', 'tsconfig.json', 'README.md', 'docs', 'scripts', join('tests', 'support'), join('tests', 'model-kosucu')]) kopyala(g);
adim('Uygulama dosyaları kopyalandı.');

// 2) Çalışma zamanı modülleri (geliştirme araçları — typescript, @types — hariç).
for (const m of ['@playwright', 'playwright', 'playwright-core', 'sql.js', 'dotenv']) {
  const k = join(KOK, 'node_modules', m);
  if (!existsSync(k)) { console.error(`Eksik modül: node_modules/${m} ("npm install" çalıştırın).`); process.exit(1); }
  cpSync(k, join(UYGULAMA, 'node_modules', m), { recursive: true });
}
// package.json "dependencies" ve veritabanı sürücüleri (Ayarlar > Entegrasyonlar > Veritabanı bağlantısı; kuruluysa) bağımlılık
// ağaçlarıyla birlikte (node_modules kökündeki bağımlılıklar tek tek izlenir; paketin kendi node_modules'ü onunla kopyalanır).
const EK_MODULLER = ['mssql', 'oracledb', 'pg', 'mysql2'];
const kopyalananlar = new Set(['@playwright', 'playwright', 'playwright-core', 'sql.js', 'dotenv']);
const modulKopyala = (ad, zorunlu) => {
  if (kopyalananlar.has(ad) || kopyalananlar.has(ad.split('/')[0])) return;
  const k = join(KOK, 'node_modules', ad);
  if (!existsSync(join(k, 'package.json'))) {
    if (zorunlu) { console.error(`Eksik modül: node_modules/${ad} ("npm install" çalıştırın).`); process.exit(1); }
    return;
  }
  kopyalananlar.add(ad);
  cpSync(k, join(UYGULAMA, 'node_modules', ad), { recursive: true });
  const p = JSON.parse(readFileSync(join(k, 'package.json'), 'utf8'));
  for (const b of Object.keys({ ...(p.dependencies ?? {}), ...(p.optionalDependencies ?? {}) })) modulKopyala(b, false);
};
const kokPaket = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8'));
for (const m of Object.keys(kokPaket.dependencies ?? {})) modulKopyala(m, true);
for (const m of EK_MODULLER) modulKopyala(m, false);
adim(`Çalışma zamanı modülleri kopyalandı (veritabanı sürücüleri: ${EK_MODULLER.filter((m) => kopyalananlar.has(m)).join(', ') || 'kurulu değil'}).`);

// 3) Node.
mkdirSync(join(HEDEF, 'runtime'), { recursive: true });
cpSync(process.execPath, join(HEDEF, 'runtime', 'node.exe'));
adim(`Node ${process.version} kopyalandı.`);

// 4) Playwright tarayıcıları (bu Playwright sürümünün istediği revizyonlar).
const tarayiciKokleri = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(KOK, '.playwright-browsers'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright')]
  .filter((x) => x && existsSync(x));
const { browsers } = JSON.parse(readFileSync(join(KOK, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8'));
const gerekli = browsers.filter((b) => ['chromium', 'chromium-headless-shell', 'ffmpeg', 'winldd'].includes(b.name))
  .map((b) => `${b.name.replace(/-/g, '_')}-${b.revision}`);
for (const klasor of gerekli) {
  const kaynak = tarayiciKokleri.map((k) => join(k, klasor)).find((y) => existsSync(y));
  if (!kaynak) {
    if (klasor.startsWith('winldd')) continue;
    console.error(`Tarayıcı bulunamadı: ${klasor} ("npx playwright install chromium" çalıştırın).`);
    process.exit(1);
  }
  cpSync(kaynak, join(HEDEF, 'tarayicilar', klasor), { recursive: true });
}
adim(`Tarayıcılar kopyalandı (${gerekli.join(', ')}).`);

// 5) Başlatıcı: Windows'un kendi .NET Framework derleyicisi.
const csc = [join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find((y) => existsSync(y));
if (!csc) { console.error('.NET Framework derleyicisi (csc.exe) bulunamadı; başlatıcı derlenemedi.'); process.exit(1); }
const exe = join(HEDEF, 'Nöbetçi.exe');
execFileSync(csc, ['/nologo', '/target:exe', '/codepage:65001', `/out:${exe}`, join(KOK, 'scripts', 'paket', 'Nobetci.cs')], { stdio: 'inherit' });
adim(`Başlatıcı derlendi: ${basename(exe)}`);

// 6) Kullanım notu.
writeFileSync(join(HEDEF, 'OKUBENI.txt'), [
  'NÖBETÇİ — taşınabilir sürüm',
  '',
  'Başlatmak: "Nöbetçi.exe" dosyasına çift tıklayın. Nöbetçi kendi penceresinde açılır (Ayarlar > Arayüz bölümünden varsayılan',
  'tarayıcıyı da seçebilirsiniz). Nöbetçi penceresini kapatınca Nöbetçi de kapanır.',
  '',
  'Kurulum gerekmez; Node, VS Code ya da internet bağlantısı gerekmez. Nöbetçi yalnızca bu bilgisayardan erişilebilir.',
  'Verileriniz "uygulama\\veri" klasöründe, sizin belirlediğiniz kasa parolasıyla şifreli durur. Yeni bir sürüme geçerken',
  'önce Ayarlar > Yedekleme\'den yedek alın ya da "uygulama\\veri" klasörünü yeni sürümün aynı yerine kopyalayın.',
  '',
  'Windows ilk açılışta "Windows kişisel bilgisayarınızı korudu" uyarısı gösterebilir (başlatıcı imzasızdır):',
  '"Ek bilgi" > "Yine de çalıştır" ile açabilirsiniz.',
  ''
].join('\r\n'), 'utf8');

console.log(`\nPaket hazır: ${HEDEF} (${mb(boyut(HEDEF))}).`);
console.log(`Göreli: ${relative(KOK, HEDEF) || '.'}`);
