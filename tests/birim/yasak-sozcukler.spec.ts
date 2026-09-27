// KORUMA TESTLERİ — kod deposunda şirket / ürün / servis adı ve alana (sektöre) özgü terim kalmaz.
// Liste yalnızca özet olarak tutulur (yasak-sozcukler.ts); bu dosya da sözcükleri düz yazmaz: denetimin
// yakaladığını göstermek için örnek sözcükler karakter kodlarından üretilir.
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DENETIM_MUAFLARI, MOTOR_YASAK_OZETLERI, tabloTanimindaYasakBul, yasakSozcukleriBul } from './yasak-sozcukler';

const KOK = join(__dirname, '..', '..');
const METIN_UZANTILARI = new Set(['.mjs', '.js', '.cjs', '.ts', '.mts', '.json', '.md', '.css', '.html', '.cs', '.txt', '.xml', '.yml', '.yaml']);
const ATLANAN_KLASORLER = new Set(['node_modules', 'test-results', 'playwright-report', '.git', 'dist', 'veri']);
/** Kökteki denetlenen dosyalar (kilit dosyası dış paket adları taşır, denetlenmez). */
const KOK_DOSYALARI = /^(?:[^/]+\.(?:md|ts|mts)|package\.json|tsconfig\.json|[^/]+\.code-workspace)$/;

/** Karakter kodlarından metin (sözcük test dosyasında düz geçmesin). */
const k = (...kodlar: number[]): string => String.fromCharCode(...kodlar);

function dosyalar(klasor: string): string[] {
  const sonuc: string[] = [];
  for (const ad of readdirSync(klasor)) {
    if (ATLANAN_KLASORLER.has(ad)) continue;
    const yol = join(klasor, ad);
    if (statSync(yol).isDirectory()) sonuc.push(...dosyalar(yol));
    else if (METIN_UZANTILARI.has(ad.slice(ad.lastIndexOf('.')))) sonuc.push(yol);
  }
  return sonuc;
}

test('denetim bilinen yasak sözcükleri yakalar (düz metin, Türkçe karakter, camelCase, tire, önek)', () => {
  // Dört bilinen yasak sözcük (Türkçe karakterli, camelCase ürün adı, önek) karakter kodlarından.
  const s1 = k(83, 105, 103, 111, 114, 116, 97, 108, 305);
  const s2 = k(112, 111, 108, 105, 231, 101);
  const s3 = k(74, 101, 116, 83, 101, 121, 97, 104, 97, 116);
  const s4 = k(97, 99, 101, 110, 116, 101);
  const ornekler = [
    `// ${s1} kişi bilgileri`,
    `const no = kayit.${s2}No;`,
    `class Ornek${s3}Sayfasi {}`,
    `const yol = '/${s3.toLowerCase().replace('ts', 't-s')}/liste';`,
    `const b = model.${s4}Baglami;`,
    `<${k(84, 114, 97, 118, 101, 108, 83, 101, 114, 118, 105, 99, 101)}Soap>`
  ];
  for (const metin of ornekler) expect(yasakSozcukleriBul(metin), metin).toHaveLength(1);
  // Satır numarası bildirilir.
  expect(yasakSozcukleriBul(`a\nb\nx ${s4}Kodu y`)).toEqual([{ dizi: `${s4}Kodu`, satir: 3 }]);
  // Tablo tanımı ve motor listesi.
  expect(tabloTanimindaYasakBul(`CREATE TABLE x (${s4}_kodu TEXT);`)).toHaveLength(1);
  expect(tabloTanimindaYasakBul(`CREATE TABLE x (kod TEXT); -- ${s4}`)).toEqual([]);
  expect(yasakSozcukleriBul(`const kart${k(79, 100, 101, 109, 101)}Adimi = 1;`, MOTOR_YASAK_OZETLERI)).toHaveLength(1);
});

test('denetim genel sözcüklere takılmaz', () => {
  const temiz = [
    "'Content-Security-Policy': \"default-src 'self'\"", 'const primary = object.jetton;', 'Sipariş oluşturuldu. No: SP-1003',
    'SiparisServisiSoap → siparis-servisi', 'Teslimat bölgesi: EKSPRES / STANDART'
  ].join('\n');
  expect(yasakSozcukleriBul(temiz)).toEqual([]);
});

test('kod deposunda (scripts, docs, tests, kök dosyalar) yasak sözcük yok', () => {
  const muaf = new Set(DENETIM_MUAFLARI);
  const aday = [
    ...['scripts', 'docs', 'tests'].flatMap((k) => dosyalar(join(KOK, k))),
    ...readdirSync(KOK).filter((ad) => KOK_DOSYALARI.test(ad)).map((ad) => join(KOK, ad))
  ];
  const bulgular: string[] = [];
  for (const yol of aday) {
    const goreli = relative(KOK, yol).split(sep).join('/');
    if (muaf.has(goreli)) continue;
    for (const b of yasakSozcukleriBul(readFileSync(yol, 'utf8'))) bulgular.push(`${goreli}:${b.satir}: ${b.dizi}`);
  }
  expect(aday.length).toBeGreaterThan(100);
  expect(bulgular).toEqual([]);
});
