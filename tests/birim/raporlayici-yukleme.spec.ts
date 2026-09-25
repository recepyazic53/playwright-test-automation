// KORUMA TESTİ — platform raporlayıcısının Playwright koşusunda YÜKLENEBİLMESİ.
// Node 24 + Playwright 1.63'te yapılandırma (TypeScript → CommonJS) scripts/platform/calisma-alanlari.mjs'i
// önceden yükleyince, doğrudan .mjs olarak verilen raporlayıcı "does not provide an export named
// 'VERITABANI_DOSYASI'" hatasıyla koşuyu açılışta düşürüyordu (Windows doğrulamasında görüldü). Çözüm:
// raporlayıcı TypeScript giriş noktası (tests/support/platform-raporlayici.ts) üzerinden yüklenir.
// Bu test ayrı bir Playwright süreci başlatır; GEÇİCİ klasörde sahte kasalı veritabanı + tek sahte test kullanır,
// tarayıcı açmaz, siteye bağlanmaz.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const GIRIS_NOKTASI = './tests/support/platform-raporlayici.ts';
/** TS/ESM içine gömülecek mutlak yol (Windows ters bölüleri olmadan). */
const yolMetni = (yol: string): string => JSON.stringify(yol.replace(/\\/g, '/'));

test('playwright.config.ts raporlayıcıyı .mjs olarak değil TypeScript giriş noktasından yükler', () => {
  const yapilandirma = readFileSync(join(KOK, 'playwright.config.ts'), 'utf8');
  expect(yapilandirma).toContain(`['${GIRIS_NOKTASI}'`);
  expect(yapilandirma).not.toMatch(/\[\s*'\.\/scripts\/platform\/raporlayici\.mjs'/);
});

test('yapılandırma calisma-alanlari.mjs\'i önceden yüklese de raporlayıcı açılır ve sonucu veritabanına yazar', async () => {
  test.setTimeout(120_000);
  const k = geciciKlasor('raporlayici-yukleme');
  try {
    const vtYolu = join(k.yol, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, 'Raporlayici-Deneme-Parolasi-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Raporlayıcı Deneme' });
    vt.kapat();

    mkdirSync(join(k.yol, 'testler'));
    writeFileSync(join(k.yol, 'testler', 'deneme.spec.ts'),
      `import { test, expect } from ${yolMetni(join(KOK, 'node_modules', '@playwright', 'test'))};\n`
      + `test('geçen', () => { expect(1).toBe(1); });\n`);
    // Hatanın koşulu: yapılandırma (platform-veri.ts gibi) calisma-alanlari.mjs'i önceden yükler.
    writeFileSync(join(k.yol, 'deneme.config.ts'),
      `import ${yolMetni(join(KOK, 'scripts', 'platform', 'calisma-alanlari.mjs'))};\n`
      + `export default { testDir: './testler', reporter: [['line'], [${yolMetni(join(KOK, GIRIS_NOKTASI))}, { projeId: ${JSON.stringify(projeId)}, ortam: 'test' }]] };\n`);

    const env: NodeJS.ProcessEnv = {};
    for (const [a, d] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI|NOBETCI_)/.test(a)) env[a] = d;
    const cikti = await new Promise<{ kod: number | null; metin: string }>((coz) => {
      const alt = spawn(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test',
        '--config', join(k.yol, 'deneme.config.ts'), `--output=${join(k.yol, 'cikti')}`], {
        cwd: KOK, env: { ...env, PLATFORM_VERITABANI: vtYolu, NOBETCI_VERI_KOKU: k.yol }, stdio: ['ignore', 'pipe', 'pipe']
      });
      let metin = '';
      alt.stdout.on('data', (p: Buffer) => { metin += p.toString(); });
      alt.stderr.on('data', (p: Buffer) => { metin += p.toString(); });
      alt.on('close', (kod) => coz({ kod, metin }));
    });
    expect(cikti.metin).not.toContain('does not provide an export');
    expect(cikti.kod, cikti.metin).toBe(0);

    const sonra = await veritabaniniHazirla(vtYolu);
    try {
      expect(sonra.tumu('SELECT durum FROM kosular')).toHaveLength(1);
      expect(sonra.tumu('SELECT id FROM kosu_sonuclari')).toHaveLength(1);
    } finally { sonra.kapat(); }
  } finally {
    k.temizle();
  }
});
