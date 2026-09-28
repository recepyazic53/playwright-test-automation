// KORUMA TESTİ — Tema metin kontrastı (scripts/platform/arayuz/stil.css). Açık ve koyu temada (tüm görünüm stilleriyle) metin
// belirteçleri (--metin, --metin-2 "soluk", --metin-3 "çok soluk") zemin ve panel renkleri üzerinde en az 4.5:1 (WCAG AA, normal metin)
// kontrasta sahip olmalı. Yarı saydam panel (--panel) zemin üzerine bindirilerek hesaplanır. Tarayıcı yok; CSS metinden okunur.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const CSS = readFileSync(join(resolve(__dirname, '..', '..'), 'scripts', 'platform', 'arayuz', 'stil.css'), 'utf8');
type Renk = [number, number, number, number];

/** #rgb / #rrggbb / rgba(r, g, b, a) → [r, g, b, a]. */
function renk(deger: string): Renk | null {
  const d = deger.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(d);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1) as Renk;
  m = /^#([0-9a-f]{6})$/i.exec(d);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as Renk;
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(d);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  return null;
}
const bindir = (ust: Renk, alt: Renk): Renk => [0, 1, 2].map((i) => ust[i] * ust[3] + alt[i] * (1 - ust[3])).concat(1) as Renk;
const parlaklik = (r: Renk) => {
  const [a, b, c] = r.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a + 0.7152 * b + 0.0722 * c;
};
export const kontrast = (x: Renk, y: Renk) => { const [a, b] = [parlaklik(x), parlaklik(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

/** CSS bloklarındaki belirteçler: seçici → { --ad: değer } (yalnız renk belirteçleri). */
function bloklar(): Array<{ secici: string; acik: boolean; belirtecler: Record<string, string> }> {
  const sonuc: Array<{ secici: string; acik: boolean; belirtecler: Record<string, string> }> = [];
  // Yalnız belirteç TANIMLAYAN bloklar (--metin-3: …), seçicinin son satırı (ör. @media içindeki :root:not(...)).
  const desen = /([^{}]+)\{([^{}]*--metin-3\s*:[^{}]*)\}/g;
  for (const m of CSS.matchAll(desen)) {
    const secici = m[1].trim().split('\n').pop()!.trim();
    // Açık tema: data-tema="acik" ya da (prefers-color-scheme: light içinde) :not([data-tema="koyu"]).
    const acik = /acik/.test(secici) || /not\(\[data-tema="koyu"\]\)/.test(secici);
    const belirtecler: Record<string, string> = {};
    for (const b of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) belirtecler[b[1]] = b[2].trim();
    sonuc.push({ secici, acik, belirtecler });
  }
  return sonuc;
}

test('tema belirteçleri: metin / soluk / çok soluk metin açık ve koyu temada zemin ve panel üzerinde en az 4.5:1', () => {
  const liste = bloklar();
  expect(liste.length).toBeGreaterThanOrEqual(6);
  const temel = liste[0].belirtecler;
  const acikTemel = liste.find((b) => b.acik && b.secici.includes('data-tema="acik"') && !b.secici.includes('data-stil'))!.belirtecler;
  const sorunlar: string[] = [];
  for (const b of liste) {
    const tema = { ...temel, ...(b.acik ? acikTemel : {}), ...b.belirtecler };
    const zemin = renk(tema['--zemin'])!;
    const zeminler: Record<string, Renk> = {
      '--zemin': zemin, '--zemin-2': renk(tema['--zemin-2'])!, '--panel-kati': renk(tema['--panel-kati'])!, '--panel': bindir(renk(tema['--panel'])!, zemin)
    };
    for (const m of ['--metin', '--metin-2', '--metin-3']) {
      const metin = renk(tema[m]);
      expect(metin, `${b.secici} ${m}`).not.toBeNull();
      for (const [ad, z] of Object.entries(zeminler)) {
        const k = kontrast(metin!, z);
        if (k < 4.5) sorunlar.push(`${b.secici}: ${m} (${tema[m]}) / ${ad} = ${k.toFixed(2)}:1`);
      }
    }
  }
  expect(sorunlar).toEqual([]);
  // Denetim gerçekten tüm temaları kapsar: koyu ve açık bloklar (görünüm stilleri dahil).
  expect(liste.filter((b) => b.acik).length).toBeGreaterThanOrEqual(3);
  expect(liste.filter((b) => !b.acik).length).toBeGreaterThanOrEqual(3);
});

test('kontrast hesabı: siyah / beyaz 21:1, aynı renk 1:1', () => {
  expect(kontrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 1);
  expect(kontrast([90, 90, 90, 1], [90, 90, 90, 1])).toBeCloseTo(1, 5);
});

test('soluk metin saydamlıkla (opacity) yapılmaz: soluk / pasif / dışarıda metinler kontrastlı belirteç rengini kullanır', () => {
  // Saydamlık metnin zemine karşı kontrastını 4.5:1'in altına düşürür; bu sınıflar renk belirteciyle soluklaşır.
  const sorunlar: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const secici = m[1].trim().split('\n').pop()!.trim();
    if (!/\.(soluk|cok-soluk|pasif|disarida|yakinda|bos)\b/.test(secici) || /(^|,)\s*(button|input|select|\.pasif-kart)/.test(secici)) continue;
    const o = /(?:^|;)\s*opacity\s*:\s*([\d.]+)/.exec(m[2]);
    if (o && Number(o[1]) < 1) sorunlar.push(`${secici} { opacity: ${o[1]} }`);
  }
  expect(sorunlar).toEqual([]);
});
