// KORUMA TESTİ — Taşınabilir pakete yalnız çalışma zamanı dosyaları girer; scripts/paket/ (paketleyici araçları) pakete
// KOPYALANMAZ (paket-ortak.mjs > HARIC_DESENLERI). Uygulamanın çalışma zamanı kodu bu klasörden bir şey içe aktarırsa paket
// açılışta "Cannot find module" ile çöker. Bu test, pakete giren kaynak dosyaların hiçbirinin scripts/paket/'e bağımlı olmadığını
// ve içe aktardıkları göreli modüllerin pakette de bulunduğunu denetler (ağ yok, dosya okuma).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { haricMi } from '../../scripts/paket/paket-ortak.mjs';

const KOK = resolve(__dirname, '..', '..');
const PAKETE_GIREN = ['scripts', join('tests', 'support'), join('tests', 'model-kosucu'), 'playwright.config.ts'];
const UZANTI = /\.(mjs|js|ts|mts)$/;
// Paketleyici betikleri geliştirme aracıdır; pakete kopyalansa da paketin içinden çalıştırılmaz.
const ARACLAR = new Set([join('scripts', 'paketle.mjs'), join('scripts', 'paketle-mac.mjs')].map((p) => join(KOK, p)));

function dosyalar(yol: string): string[] {
  const tam = join(KOK, yol);
  if (!existsSync(tam)) return [];
  if (statSync(tam).isFile()) return [tam];
  return readdirSync(tam, { withFileTypes: true }).flatMap((g) => (g.isDirectory() ? dosyalar(join(yol, g.name)) : [join(tam, g.name)]));
}

test('pakete giren kod, pakete girmeyen modülleri içe aktarmaz', () => {
  const pakette = PAKETE_GIREN.flatMap(dosyalar).filter((f) => UZANTI.test(f) && !f.endsWith('.d.mts') && !haricMi(f) && !ARACLAR.has(f));
  expect(pakette.length).toBeGreaterThan(50);
  const sorunlar: string[] = [];
  const ice = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  for (const f of pakette) {
    const metin = readFileSync(f, 'utf8');
    for (const m of metin.matchAll(ice)) {
      const hedef = resolve(dirname(f), m[1] ?? m[2]);
      if (hedef.endsWith('.d.mts')) continue;
      const goreli = hedef.slice(KOK.length + 1);
      if (haricMi(sep + goreli)) sorunlar.push(`${f.slice(KOK.length + 1)} → ${goreli} (pakete kopyalanmıyor)`);
    }
  }
  expect(sorunlar).toEqual([]);
});
