// EKRAN GÖRÜNTÜSÜ (saf, sahte sayfa): yakalamalar sayfa başına sırayla alınır, süre sınırlıdır; tam sayfa alınamazsa görünür
// alan denenir; hiç dönmeyen yakalama koşuyu takmaz (tests/support/screenshots.ts — koşunun ara sıra donması düzeltmesi).
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ekranGoruntusuAl } from '../support/screenshots';

type Yakalama = (s: { fullPage?: boolean; timeout?: number }) => Promise<Buffer>;
const sahteSayfa = (yakala: Yakalama): Page => ({ screenshot: yakala, isClosed: () => false }) as unknown as Page;

test('hiç dönmeyen yakalama koşuyu takmaz: süre dolunca null (tam sayfa ve görünür alan denenir)', async () => {
  const denemeler: boolean[] = [];
  const sayfa = sahteSayfa((s) => { denemeler.push(Boolean(s.fullPage)); return new Promise<Buffer>(() => undefined); });
  const bas = Date.now();
  expect(await ekranGoruntusuAl(sayfa, { fullPage: true, sureMs: 50 })).toBeNull();
  expect(Date.now() - bas).toBeLessThan(5_000);
  expect(denemeler).toEqual([true, false]);
});

test('tam sayfa alınamazsa görünür alan görüntüsü döner; Playwright süre sınırı da verilir', async () => {
  const sureler: Array<number | undefined> = [];
  const sayfa = sahteSayfa(async (s) => {
    sureler.push(s.timeout);
    if (s.fullPage) throw new Error('tam sayfa alınamadı');
    return Buffer.from('gorunur');
  });
  expect(String(await ekranGoruntusuAl(sayfa, { fullPage: true, sureMs: 1_000 }))).toBe('gorunur');
  expect(sureler).toEqual([1_000, 1_000]);
});

test('aynı sayfada yakalamalar üst üste binmez (canlı izleme + adım görüntüsü sırayla)', async () => {
  let etkin = 0;
  let enCok = 0;
  const sayfa = sahteSayfa(async () => {
    etkin++;
    enCok = Math.max(enCok, etkin);
    await new Promise((c) => setTimeout(c, 20));
    etkin--;
    return Buffer.from('x');
  });
  const sonuclar = await Promise.all([1, 2, 3, 4].map((i) => ekranGoruntusuAl(sayfa, { fullPage: i % 2 === 0, sureMs: 1_000 })));
  expect(sonuclar.every((b) => b !== null)).toBe(true);
  expect(enCok).toBe(1);
});
