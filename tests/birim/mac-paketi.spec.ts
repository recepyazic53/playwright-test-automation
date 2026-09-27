// KORUMA TESTLERİ — macOS paketi (scripts/paket/mac-paketi.mjs, arsiv.mjs): AĞ YOK; küçük SAHTE kaynak arşivlerle (Node tar.gz,
// Unix modlu / sembolik bağlantılı ZIP, Unix modu olmayan ZIP) ve sahte bir proje köküyle paket üretilir; arşiv yapısı, izinler
// (yürütülebilirler 0755, diğerleri 0644), sembolik bağlantı korunumu, OKUBENI, Info.plist, başlatıcı betiği (shebang, LF) ve
// kullanıcı verisinin (veri/, .env) pakete girmediği denetlenir. Sistemde "tar" varsa arşiv bağımsız olarak onunla da listelenir.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { TarYazici, tarGirdileri, zipGirdileri, type TarGirdisi } from '../../scripts/paket/arsiv.mjs';
import { MAC_VERI_KLASORU, baslaticiBetigi, infoPlist, macPaketiYaz, type MacMimarisi } from '../../scripts/paket/mac-paketi.mjs';
import { uygulamaIcerigi } from '../../scripts/paket/paket-ortak.mjs';
import { geciciKlasor } from './platform-ortak';

const MACHO = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from('sahte mach-o ikilisi')]);
const CHROME = 'chrome-mac-arm64/Google Chrome for Testing.app';
const CERCEVE = `${CHROME}/Contents/Frameworks/Google Chrome for Testing Framework.framework`;
const CHROME_IKILISI = `${CHROME}/Contents/MacOS/Google Chrome for Testing`;

interface ZipKaydi { ad: string; veri?: Buffer; mod?: number; unix?: boolean; sikistir?: boolean }

/** Küçük ZIP yazıcı (test için): Unix modlu (made-by 3) ya da modsuz (made-by 0, DOS) girdiler; stored / deflate. */
function zipYap(kayitlar: ZipKaydi[]): Buffer {
  const yereller: Buffer[] = [];
  const merkez: Buffer[] = [];
  let konum = 0;
  for (const k of kayitlar) {
    const ad = Buffer.from(k.ad, 'utf8');
    const acik = k.veri ?? Buffer.alloc(0);
    const sikisik = k.sikistir ? deflateRawSync(acik) : acik;
    const yontem = k.sikistir ? 8 : 0;
    const crc = crc32(acik);
    const y = Buffer.alloc(30);
    y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(0x800, 6); y.writeUInt16LE(yontem, 8);
    y.writeUInt32LE(crc, 14); y.writeUInt32LE(sikisik.length, 18); y.writeUInt32LE(acik.length, 22); y.writeUInt16LE(ad.length, 26);
    yereller.push(y, ad, sikisik);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(((k.unix ?? true) ? 3 : 0) << 8 | 20, 4); m.writeUInt16LE(20, 6);
    m.writeUInt16LE(0x800, 8); m.writeUInt16LE(yontem, 10); m.writeUInt32LE(crc, 16); m.writeUInt32LE(sikisik.length, 20);
    m.writeUInt32LE(acik.length, 24); m.writeUInt16LE(ad.length, 28);
    const dos = k.ad.endsWith('/') ? 0x10 : 0;
    m.writeUInt32LE((((k.unix ?? true) && k.mod ? k.mod : 0) << 16 | dos) >>> 0, 38);
    m.writeUInt32LE(konum, 42);
    merkez.push(m, ad);
    konum += 30 + ad.length + sikisik.length;
  }
  const cd = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(kayitlar.length, 8); son.writeUInt16LE(kayitlar.length, 10);
  son.writeUInt32LE(cd.length, 12); son.writeUInt32LE(konum, 16);
  return Buffer.concat([...yereller, cd, son]);
}

/** Sahte proje kökü: uygulama dosyaları + hariç tutulması gerekenler (veri/, .env, günlük, scripts/paket) + modüller. */
function sahteProje(kok: string): void {
  const yaz = (goreli: string, icerik: string) => {
    const y = join(kok, goreli);
    mkdirSync(dirname(y), { recursive: true });
    writeFileSync(y, icerik);
  };
  yaz('package.json', JSON.stringify({ name: 'sahte', version: '9.8.7', dependencies: { 'sahte-bagimlilik': '1.0.0' } }));
  yaz('playwright.config.ts', 'export default {};\n');
  yaz('scripts/baslat.mjs', '// sahte\n');
  yaz('scripts/test-sunucu.log', 'günlük\n');
  yaz('scripts/paket/Nobetci.cs', '// paketleme aracı\n');
  yaz('tests/support/destek.ts', '// sahte\n');
  yaz('tests/model-kosucu/model-senaryolari.spec.ts', '// sahte\n');
  yaz('tests/birim/gizli.spec.ts', '// pakete girmez\n');
  yaz('veri/platform.db', 'KULLANICI VERİSİ');
  yaz('.env', 'GIZLI=1\n');
  for (const m of ['@playwright/test', 'playwright', 'playwright-core', 'sql.js', 'dotenv']) yaz(`node_modules/${m}/package.json`, JSON.stringify({ name: m }));
  yaz('node_modules/sahte-bagimlilik/package.json', JSON.stringify({ name: 'sahte-bagimlilik', dependencies: { 'alt-bagimlilik': '1' } }));
  yaz('node_modules/alt-bagimlilik/package.json', JSON.stringify({ name: 'alt-bagimlilik' }));
  yaz('node_modules/typescript/package.json', JSON.stringify({ name: 'typescript' }));
}

async function sahteNodeArsivi(klasor: string): Promise<Buffer> {
  const yol = join(klasor, 'node-sahte.tar.gz');
  const t = new TarYazici(yol);
  await t.dosya('node-v0.0.0-darwin-arm64/bin/node', MACHO, 0o755);
  await t.baglanti('node-v0.0.0-darwin-arm64/bin/npm', '../lib/node_modules/npm/bin/npm-cli.js');
  await t.dosya('node-v0.0.0-darwin-arm64/README.md', Buffer.from('benioku'), 0o644);
  await t.bitir();
  return readFileSync(yol);
}

function sahteChromiumZip(): Buffer {
  return zipYap([
    { ad: 'chrome-mac-arm64/', mod: 0o040755 },
    { ad: CHROME_IKILISI, veri: MACHO, mod: 0o100755, sikistir: true },
    { ad: `${CERCEVE}/Versions/153.0.0.0/Google Chrome for Testing Framework`, veri: MACHO, mod: 0o100755, sikistir: true },
    { ad: `${CERCEVE}/Versions/153.0.0.0/Libraries/libEGL.dylib`, veri: MACHO, mod: 0o100755 },
    { ad: `${CERCEVE}/Versions/153.0.0.0/Helpers/chrome_crashpad_handler`, veri: MACHO, mod: 0o100755 },
    { ad: `${CERCEVE}/Versions/153.0.0.0/Resources/tr.lproj/locale.pak`, veri: Buffer.from('pak'), mod: 0o100644, sikistir: true },
    { ad: `${CERCEVE}/Versions/Current`, veri: Buffer.from('153.0.0.0'), mod: 0o120755 },
    { ad: `${CERCEVE}/Google Chrome for Testing Framework`, veri: Buffer.from('Versions/Current/Google Chrome for Testing Framework'), mod: 0o120755 },
    { ad: `${CHROME}/Contents/Info.plist`, veri: Buffer.from('<plist/>'), mod: 0o100644 }
  ]);
}

/** Unix modu OLMAYAN ZIP (ör. Windows'ta sıkıştırılmış): yürütülebilirlik içerikten (Mach-O / #!) çıkarılır. */
function sahteFfmpegZip(): Buffer {
  return zipYap([
    { ad: 'ffmpeg-mac', veri: MACHO, unix: false, sikistir: true },
    { ad: 'COPYING.LGPLv2.1', veri: Buffer.from('lisans'), unix: false }
  ]);
}

/** Basit XML iyi-biçimlilik denetimi (etiket dengesi; yorum/işlem talimatı/DOCTYPE atlanır). */
function xmlIyiBicimliMi(x: string): boolean {
  const yigin: string[] = [];
  const govde = x.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(govde)) return false;
  for (const m of govde.matchAll(/<(\/?)([A-Za-z][\w.-]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') { if (yigin.pop() !== m[2]) return false; } else yigin.push(m[2]);
  }
  return yigin.length === 0;
}

async function paketUret(mimari: MacMimarisi = 'arm64') {
  const klasor = geciciKlasor('mac-paketi');
  const kok = join(klasor.yol, 'proje');
  sahteProje(kok);
  const hedef = join(klasor.yol, 'Nöbetçi-mac.tar.gz');
  const ozet = await macPaketiYaz({
    kok, hedef, mimari, nodeArsivi: await sahteNodeArsivi(klasor.yol), nodeSurumu: 'v0.0.0',
    tarayicilar: [
      { klasor: 'chromium-1243', zip: sahteChromiumZip(), yurutulebilir: CHROME_IKILISI },
      { klasor: 'ffmpeg-1011', zip: sahteFfmpegZip(), yurutulebilir: 'ffmpeg-mac' }
    ]
  });
  const girdiler = new Map<string, TarGirdisi>(tarGirdileri(readFileSync(hedef)).map((g) => [g.ad, g]));
  return { klasor, kok, hedef, ozet, girdiler };
}

test('macOS paketi: arşiv yapısı, izinler, sembolik bağlantılar ve kullanıcı verisinin dışarıda kalması', async () => {
  const { klasor, hedef, ozet, girdiler } = await paketUret('arm64');
  try {
    const K = 'Nöbetçi-mac-arm64';
    const APP = `${K}/Nöbetçi.app/Contents`;
    const R = `${APP}/Resources`;
    const al = (ad: string): TarGirdisi => {
      const g = girdiler.get(ad);
      expect(g, ad).toBeTruthy();
      return g as TarGirdisi;
    };
    // Beklenen yollar ve modlar.
    for (const [ad, tur, mod] of [
      [K, 'klasor', 0o755], [`${K}/OKUBENI.txt`, 'dosya', 0o644], [`${APP}/Info.plist`, 'dosya', 0o644], [`${APP}/PkgInfo`, 'dosya', 0o644],
      [`${APP}/MacOS/Nobetci`, 'dosya', 0o755], [`${R}/runtime/node`, 'dosya', 0o755],
      [`${R}/uygulama/package.json`, 'dosya', 0o644], [`${R}/uygulama/scripts/baslat.mjs`, 'dosya', 0o644],
      [`${R}/uygulama/tests/support/destek.ts`, 'dosya', 0o644], [`${R}/uygulama/node_modules/sahte-bagimlilik/package.json`, 'dosya', 0o644],
      [`${R}/uygulama/node_modules/alt-bagimlilik/package.json`, 'dosya', 0o644], [`${R}/uygulama/node_modules/@playwright/test/package.json`, 'dosya', 0o644],
      [`${R}/tarayicilar/chromium-1243/${CHROME_IKILISI}`, 'dosya', 0o755],
      [`${R}/tarayicilar/chromium-1243/${CERCEVE}/Versions/153.0.0.0/Google Chrome for Testing Framework`, 'dosya', 0o755],
      [`${R}/tarayicilar/chromium-1243/${CERCEVE}/Versions/153.0.0.0/Libraries/libEGL.dylib`, 'dosya', 0o755],
      [`${R}/tarayicilar/chromium-1243/${CERCEVE}/Versions/153.0.0.0/Helpers/chrome_crashpad_handler`, 'dosya', 0o755],
      [`${R}/tarayicilar/chromium-1243/${CERCEVE}/Versions/153.0.0.0/Resources/tr.lproj/locale.pak`, 'dosya', 0o644],
      [`${R}/tarayicilar/chromium-1243/${CHROME}/Contents/Info.plist`, 'dosya', 0o644],
      [`${R}/tarayicilar/chromium-1243/INSTALLATION_COMPLETE`, 'dosya', 0o644],
      [`${R}/tarayicilar/ffmpeg-1011/ffmpeg-mac`, 'dosya', 0o755], [`${R}/tarayicilar/ffmpeg-1011/COPYING.LGPLv2.1`, 'dosya', 0o644]
    ] as const) {
      const g = al(ad);
      expect(g.tur, ad).toBe(tur);
      expect(g.mod.toString(8), ad).toBe(mod.toString(8));
    }
    // Node ikilisi arşivdeki bin/node'un kendisi; npm bağlantısı ve README alınmaz.
    expect(al(`${R}/runtime/node`).veri.equals(MACHO)).toBe(true);
    expect([...girdiler.keys()].some((a) => a.includes('npm'))).toBe(false);
    // Sembolik bağlantılar bağlantı olarak (hedefiyle) korunur.
    const current = al(`${R}/tarayicilar/chromium-1243/${CERCEVE}/Versions/Current`);
    expect(current.tur).toBe('baglanti');
    expect(current.hedef).toBe('153.0.0.0');
    const cerceve = al(`${R}/tarayicilar/chromium-1243/${CERCEVE}/Google Chrome for Testing Framework`);
    expect(cerceve.tur).toBe('baglanti');
    expect(cerceve.hedef).toBe('Versions/Current/Google Chrome for Testing Framework');
    expect(ozet.baglantiSayisi).toBe(2);
    // Her klasör 0755; her dosya 0644 ya da 0755.
    for (const g of girdiler.values()) {
      if (g.tur === 'klasor') expect(g.mod.toString(8), g.ad).toBe('755');
      if (g.tur === 'dosya') expect(['644', '755'], g.ad).toContain(g.mod.toString(8));
      expect(g.ad.startsWith(`${K}/`) || g.ad === K, g.ad).toBe(true);
    }
    // Kullanıcı verisi, .env, günlük, paketleme araçları, birim testleri ve geliştirme modülleri pakete GİRMEZ.
    const yollar = [...girdiler.keys()].filter((a) => a.startsWith(`${R}/uygulama/`)).map((a) => a.slice(`${R}/uygulama/`.length));
    for (const yasak of [/^veri(\/|$)/, /(^|\/)\.env$/, /test-sunucu\.log$/, /^scripts\/paket\/./, /^tests\/birim/, /^node_modules\/typescript/]) {
      expect(yollar.filter((y) => yasak.test(y)), String(yasak)).toEqual([]);
    }
    expect([...girdiler.values()].some((g) => g.veri.includes(Buffer.from('KULLANICI VERİSİ')))).toBe(false);

    // Başlatıcı: shebang, LF (CRLF YOK), paket içi Node / tarayıcılar, veri kökü ~/Library/Application Support, --arka-plan.
    const betik = al(`${APP}/MacOS/Nobetci`).veri.toString('utf8');
    expect(betik.startsWith('#!/bin/bash\n')).toBe(true);
    expect(betik).not.toContain('\r');
    expect(betik).toContain('export PLAYWRIGHT_BROWSERS_PATH="$KAYNAK/tarayicilar"');
    expect(betik).toContain('export NOBETCI_VERI_KOKU="$VERI"');
    expect(betik).toContain(`$HOME/${MAC_VERI_KLASORU}`);
    expect(betik).toContain('"$NODE" "$BASLAT" --arka-plan');
    expect(betik).toContain('cd "$UYGULAMA"');
    expect(betik).toContain('NOBETCI_CIKTI_KLASORU');
    expect(betik).toBe(baslaticiBetigi('arm64'));

    // Info.plist: iyi biçimli XML, doğru yürütülebilir ve mimari.
    const plist = al(`${APP}/Info.plist`).veri.toString('utf8');
    expect(xmlIyiBicimliMi(plist)).toBe(true);
    expect(plist).toMatch(/<key>CFBundleExecutable<\/key>\s*<string>Nobetci<\/string>/);
    expect(plist).toMatch(/<key>CFBundlePackageType<\/key>\s*<string>APPL<\/string>/);
    expect(plist).toMatch(/<key>CFBundleShortVersionString<\/key>\s*<string>9\.8\.7<\/string>/);
    expect(plist).toMatch(/<key>LSArchitecturePriority<\/key>\s*<array>\s*<string>arm64<\/string>/);
    expect(xmlIyiBicimliMi(infoPlist({ mimari: 'x64', surum: '1 & 2' }))).toBe(true);
    expect(xmlIyiBicimliMi('<plist><dict></plist>')).toBe(false);

    // OKUBENI: imzasız açılış, karantina komutu, veri yeri, mimari, Mac'te olmayanlar.
    const oku = al(`${K}/OKUBENI.txt`).veri.toString('utf8');
    for (const parca of ['sağ tıklayıp', 'Gizlilik ve Güvenlik', 'Yine de Aç', 'xattr -dr com.apple.quarantine',
      `~/${MAC_VERI_KLASORU}`, 'Apple Silicon', 'arm64', 'Nöbetçi-mac-x64', 'DPAPI', 'zamanlanmış görev']) expect(oku, parca).toContain(parca);

    // Uygulama içeriği ortak listeyle birebir aynı (Windows paketiyle aynı küme).
    const beklenen = [...uygulamaIcerigi(join(klasor.yol, 'proje'))].map((x) => `${R}/uygulama/${x.goreli}`).sort();
    const bulunan = [...girdiler.keys()].filter((a) => a.startsWith(`${R}/uygulama/`)).sort();
    expect(bulunan).toEqual(beklenen);

    // Bağımsız doğrulama: sistemde tar varsa (Windows'ta bsdtar, Git Bash'te GNU tar) listelenir.
    const liste = spawnSync('tar', ['-tvzf', hedef], { encoding: 'utf8' });
    if (!liste.error && liste.status === 0) {
      const satirlar = liste.stdout.split(/\r?\n/);
      expect(satirlar.some((s) => /^l\S+\s.*Versions\/Current -> 153\.0\.0\.0$/.test(s))).toBe(true);
      expect(satirlar.some((s) => /^-rwxr-xr-x\s.*\/runtime\/node$/.test(s))).toBe(true);
      expect(satirlar.some((s) => /^-rwxr-xr-x\s.*\/MacOS\/Nobetci$/.test(s))).toBe(true);
      expect(satirlar.some((s) => /^-rw-r--r--\s.*\/OKUBENI\.txt$/.test(s))).toBe(true);
    }
  } finally {
    klasor.temizle();
  }
});

test('macOS paketi: x64 başlatıcısı ve plist mimarisi; eksik tarayıcı ikilisi paketlemeyi durdurur', async () => {
  const x64 = baslaticiBetigi('x64');
  expect(x64).toContain('[ "x64" = "x64" ]');
  expect(x64).not.toContain('\r');
  expect(infoPlist({ mimari: 'x64', surum: '1.0.0' })).toMatch(/<string>x86_64<\/string>/);

  const klasor = geciciKlasor('mac-paketi-eksik');
  try {
    const kok = join(klasor.yol, 'proje');
    sahteProje(kok);
    await expect(macPaketiYaz({
      kok, hedef: join(klasor.yol, 'p.tar.gz'), mimari: 'x64', nodeArsivi: await sahteNodeArsivi(klasor.yol), nodeSurumu: 'v0.0.0',
      tarayicilar: [{ klasor: 'chromium-1243', zip: sahteChromiumZip(), yurutulebilir: 'chrome-mac-x64/yok' }]
    })).rejects.toThrow(/Tarayıcı ikilisi arşivde yok/);
    // Node arşivinde bin/node yoksa durur.
    const bos = join(klasor.yol, 'bos.tar.gz');
    const t = new TarYazici(bos);
    await t.dosya('node/README.md', Buffer.from('x'), 0o644);
    await t.bitir();
    await expect(macPaketiYaz({
      kok, hedef: join(klasor.yol, 'q.tar.gz'), mimari: 'x64', nodeArsivi: readFileSync(bos), nodeSurumu: 'v0.0.0', tarayicilar: []
    })).rejects.toThrow(/bin\/node bulunamadı/);
  } finally {
    klasor.temizle();
  }
});

test('arşiv araçları: ZIP CRC denetimi, uzun / ASCII dışı adlar (pax) ve güvensiz yollar', async () => {
  // Bozuk ZIP içeriği (CRC) yakalanır.
  const zip = zipYap([{ ad: 'a.txt', veri: Buffer.from('merhaba'), mod: 0o100644 }]);
  const bozuk = Buffer.from(zip);
  bozuk[30 + 'a.txt'.length] ^= 0xff;
  expect(() => zipGirdileri(bozuk)[0].veri()).toThrow(/CRC/);
  expect(zipGirdileri(zip)[0].veri().toString()).toBe('merhaba');

  const klasor = geciciKlasor('tar-yazici');
  try {
    const yol = join(klasor.yol, 't.tar.gz');
    const t = new TarYazici(yol);
    const uzun = `${'k'.repeat(120)}/Çalışma ağacı ğüşıöç.txt`;
    await t.dosya(uzun, Buffer.from('içerik'), 0o644);
    await t.baglanti(`${'b'.repeat(90)}/bağlantı`, `${'h'.repeat(110)}/hedef`);
    await expect(t.dosya('../dis.txt', Buffer.from('x'), 0o644)).rejects.toThrow(/Geçersiz arşiv yolu/);
    await expect(t.baglanti('mutlak', '/etc/passwd')).rejects.toThrow(/Mutlak/);
    await expect(t.dosya(uzun, Buffer.from('y'), 0o644)).rejects.toThrow(/yinelenen/);
    await t.bitir();
    const g = new Map(tarGirdileri(readFileSync(yol)).map((x) => [x.ad, x]));
    expect(g.get(uzun)?.veri.toString()).toBe('içerik');
    expect(g.get(`${'b'.repeat(90)}/bağlantı`)?.hedef).toBe(`${'h'.repeat(110)}/hedef`);
    expect(g.get('k'.repeat(120))?.tur).toBe('klasor');
  } finally {
    klasor.temizle();
  }
});
