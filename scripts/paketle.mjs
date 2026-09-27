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
import { PaketHatasi, UYGULAMA_GIRDILERI, calismaZamaniModulleri, haricMi } from './paket/paket-ortak.mjs';

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

// 1) Uygulama dosyaları (kullanıcı verisi, günlük ve geçici dosyalar hariç; liste: scripts/paket/paket-ortak.mjs).
const kopyala = (goreli) => {
  const kaynak = join(KOK, goreli);
  if (!existsSync(kaynak)) return;
  cpSync(kaynak, join(UYGULAMA, goreli), { recursive: true, filter: (y) => !haricMi(y) });
};
for (const g of UYGULAMA_GIRDILERI) kopyala(g);
adim('Uygulama dosyaları kopyalandı.');

// 2) Çalışma zamanı modülleri (geliştirme araçları — typescript, @types — hariç), package.json "dependencies" ve veritabanı
// sürücüleri (Ayarlar > Entegrasyonlar > Veritabanı bağlantısı; kuruluysa) bağımlılık ağaçlarıyla birlikte.
let moduller;
try { moduller = calismaZamaniModulleri(KOK); } catch (h) {
  if (!(h instanceof PaketHatasi)) throw h;
  console.error(h.message);
  process.exit(1);
}
for (const m of moduller.moduller) cpSync(join(KOK, 'node_modules', m), join(UYGULAMA, 'node_modules', m), { recursive: true });
adim(`Çalışma zamanı modülleri kopyalandı (veritabanı sürücüleri: ${moduller.veritabaniSurucuLeri.join(', ') || 'kurulu değil'}).`);

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
// /target:winexe: arka plan açılışında (--arka-plan) konsol hiç oluşmaz; normal açılışta başlatıcı konsolu kendisi açar (Nobetci.cs).
execFileSync(csc, ['/nologo', '/target:winexe', '/codepage:65001', `/out:${exe}`, join(KOK, 'scripts', 'paket', 'Nobetci.cs')], { stdio: 'inherit' });
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
