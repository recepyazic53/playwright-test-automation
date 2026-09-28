// KORUMA TESTLERİ — paket sonu denetimleri (scripts/paket/acilis-denemesi.mjs, paket-ortak.mjs > iceAktarmaCozumlemesi):
//  · içe aktarma çözümlemesi (platformdan bağımsız; macOS arşivinde de kullanılır): gerçek paket içeriğinde eksik yok; eksik göreli
//    modül ve pakette olmayan paket yakalanır.
//  · açılış denemesi: SAHTE paket (runtime\node + küçük bir sunucu betiği) geçici veri kökü ve boş portla başlatılır; ana sayfa ve
//    listedeki arayüz dosyaları 200 ise başarılı; biri 404 ise hata ayrıntısı döner; süreç her durumda kapanır. İstekler yalnız
//    127.0.0.1'e gider; tam paketleme ÇALIŞMAZ.
import { copyFileSync, linkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { acilisDenemesi, arayuzAdresleri } from '../../scripts/paket/acilis-denemesi.mjs';
import { iceAktarmaCozumlemesi, uygulamaIcerigi } from '../../scripts/paket/paket-ortak.mjs';
import { geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');

test('içe aktarma çözümlemesi: gerçek paket içeriğinde eksik modül yok; eksik göreli modül ve paket yakalanır', () => {
  const icerik = [...uygulamaIcerigi(KOK)];
  const kaynak = new Map(icerik.map((x) => [x.goreli, x.kaynak]));
  expect(iceAktarmaCozumlemesi(icerik, (g) => readFileSync(kaynak.get(g) as string, 'utf8'), builtinModules)).toEqual([]);
  const sahte = [{ goreli: 'scripts', klasor: true }, { goreli: 'scripts/a.mjs', klasor: false }, { goreli: 'scripts/b.mjs', klasor: false }];
  const metin: Record<string, string> = {
    'scripts/a.mjs': "import { x } from './b.mjs';\nimport { y } from './yok.mjs';\nimport { readFileSync } from 'node:fs';\nimport path from 'path';\nimport z from 'yok-paket/alt';\nconst d = await import('./b.mjs');",
    'scripts/b.mjs': "export const x = 1;"
  };
  expect(iceAktarmaCozumlemesi(sahte, (g) => metin[g], builtinModules)).toEqual(['scripts/a.mjs → scripts/yok.mjs', 'scripts/a.mjs → yok-paket/alt (paket pakette yok)']);
});

test('arayüz dosya listesi sunucudan okunur (ARAYUZ_DOSYALARI)', () => {
  const adresler = arayuzAdresleri(readFileSync(join(KOK, 'scripts', 'test-sunucu.mjs'), 'utf8'));
  expect(adresler.length).toBeGreaterThan(40);
  expect(adresler).toEqual(expect.arrayContaining(['/arayuz/stil.css', '/arayuz/uygulama.js', '/arayuz/ortak.js', '/arayuz/taban-adresler.js']));
});

test('açılış denemesi: sahte paket — başarılı, eksik dosyada hata; geçici veri kökü ve boş port; süreç kapanır', async () => {
  test.setTimeout(90_000);
  const g = geciciKlasor('paket-acilis');
  try {
    const hedef = join(g.yol, 'Paket');
    mkdirSync(join(hedef, 'runtime'), { recursive: true });
    mkdirSync(join(hedef, 'uygulama', 'scripts'), { recursive: true });
    const node = join(hedef, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
    try { linkSync(process.execPath, node); } catch { copyFileSync(process.execPath, node); }
    const sunucu = (eksik: string) => `import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const ARAYUZ_DOSYALARI = new Map([
  ['/arayuz/stil.css', { dosya: 'stil.css' }],
  ['/arayuz/uygulama.js', { dosya: 'uygulama.js' }]
]);
writeFileSync(process.env.NOBETCI_VERI_KOKU + '/calisti.txt', process.env.TEST_SUNUCU_PORT);
createServer((q, r) => {
  const ok = q.url === '/' || (ARAYUZ_DOSYALARI.has(q.url) && q.url !== '${eksik}');
  r.writeHead(ok ? 200 : 404); r.end(ok ? 'tamam' : 'yok');
}).listen(Number(process.env.TEST_SUNUCU_PORT), '127.0.0.1');`;
    writeFileSync(join(hedef, 'uygulama', 'scripts', 'test-sunucu.mjs'), sunucu(''));
    const iyi = await acilisDenemesi({ hedef, zamanAsimiMs: 20_000 });
    expect(iyi, iyi.hatalar.join('\n')).toMatchObject({ basarili: true, dosyaSayisi: 2, hatalar: [] });
    expect(iyi.port).toBeGreaterThan(0);
    writeFileSync(join(hedef, 'uygulama', 'scripts', 'test-sunucu.mjs'), sunucu('/arayuz/uygulama.js'));
    const kotu = await acilisDenemesi({ hedef, zamanAsimiMs: 20_000 });
    expect(kotu.basarili).toBe(false);
    expect(kotu.hatalar[0]).toBe('/arayuz/uygulama.js: HTTP 404');
    // Sunucu açılmazsa (betik hemen çıkar): anlaşılır hata, askıda kalmaz.
    writeFileSync(join(hedef, 'uygulama', 'scripts', 'test-sunucu.mjs'), "const ARAYUZ_DOSYALARI = new Map([['/arayuz/a.js', {}]]);\nconsole.error('başlatılamadı');\nprocess.exit(1);");
    const cokmus = await acilisDenemesi({ hedef, zamanAsimiMs: 20_000 });
    expect(cokmus.basarili).toBe(false);
    expect(cokmus.hatalar[0]).toBe('Sunucu açılışta kapandı.');
    expect(cokmus.hatalar.join('\n')).toContain('başlatılamadı');
  } finally { g.temizle(); }
});
