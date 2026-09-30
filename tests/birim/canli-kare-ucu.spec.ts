// CANLI KARE UCU (/canli) ve canlı adım durumu (/adim-durumu): token BAŞLIKTA (X-Test-Sunucu-Token) kabul edilir — arayüz kareyi
// fetch ile ister, token adres / geçmişe düşmez; kare henüz yoksa 204 (olağan durum, tarayıcı konsoluna "404" hatası düşmez).
// Tokensiz istek reddedilir. Geçici veritabanı, 127.0.0.1; dışarıya istek yok.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { nobetciBaslat, type Nobetci } from './nobetci-sunucusu';

const KOK = join(__dirname, '..', '..');
let klasor = '';
let nobetci: Nobetci;

test.beforeAll(async () => {
  test.setTimeout(60_000);
  klasor = mkdtempSync(join(tmpdir(), 'canli-kare-'));
  nobetci = await nobetciBaslat(klasor, join(klasor, 'platform.db'));
});
test.afterAll(() => {
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('/canli: tokensiz 401; başlıktaki token ile kare yokken 204 (gövdesiz); eski sorgu dizesi tokeni de çalışır', async () => {
  expect((await fetch(`${nobetci.adres}/canli?kosuId=yok`)).status).toBe(401);
  const r = await fetch(`${nobetci.adres}/canli?kosuId=yok`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } });
  expect(r.status).toBe(204);
  expect((await r.arrayBuffer()).byteLength).toBe(0);
  expect((await fetch(`${nobetci.adres}/canli?kosuId=yok&token=${encodeURIComponent(nobetci.token)}`)).status).toBe(204);
  expect((await fetch(`${nobetci.adres}/canli`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } })).status).toBe(400);
});

test('/adim-durumu: başlıktaki token kabul edilir; tokensiz 401', async () => {
  expect((await fetch(`${nobetci.adres}/adim-durumu?kosuId=yok`)).status).toBe(401);
  const r = await fetch(`${nobetci.adres}/adim-durumu?kosuId=yok`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ basarili: true, calisiyor: false, adimlar: [] });
});

test('arayüz: canlı kare ve adım durumu adreslerinde token yok (fetch başlığında)', () => {
  const klasorYolu = join(KOK, 'scripts', 'platform', 'arayuz');
  for (const ad of readdirSync(klasorYolu).filter((x) => x.endsWith('.js'))) {
    const kaynak = readFileSync(join(klasorYolu, ad), 'utf8');
    expect(kaynak, ad).not.toMatch(/\/canli\?token=|\/adim-durumu\?token=/);
  }
});
