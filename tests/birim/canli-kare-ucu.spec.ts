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

test('/canli-akis (sürekli akış, SSE): token YALNIZ başlıkta (sorgu dizesi kabul edilmez); koşu yokken "bekleniyor"; /tarayiciyi-goster tokensiz 401', async () => {
  expect((await fetch(`${nobetci.adres}/canli-akis?kosuId=yok`)).status).toBe(401);
  expect((await fetch(`${nobetci.adres}/canli-akis?kosuId=yok&token=${encodeURIComponent(nobetci.token)}`)).status).toBe(401);
  expect((await fetch(`${nobetci.adres}/canli-akis`, { headers: { 'X-Test-Sunucu-Token': nobetci.token } })).status).toBe(400);
  const ac = new AbortController();
  const r = await fetch(`${nobetci.adres}/canli-akis?kosuId=yok`, { headers: { 'X-Test-Sunucu-Token': nobetci.token }, signal: ac.signal });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toMatch(/^text\/event-stream/);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const okuyucu = r.body!.getReader();
  let metin = '';
  while (!metin.includes('event: durum')) metin += new TextDecoder().decode((await okuyucu.read()).value);
  expect(metin).toContain('data: {"durum":"bekleniyor"}');
  ac.abort();
  // "Tarayıcıyı göster": tokensiz 401; çalışmayan koşu → açık ileti.
  const goster = (govde: Record<string, unknown>) => fetch(`${nobetci.adres}/tarayiciyi-goster`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde) });
  expect((await goster({ kosuId: 'yok' })).status).toBe(401);
  expect(await (await goster({ kosuId: 'yok', token: nobetci.token })).json()).toMatchObject({ basarili: false, gorunur: false, mesaj: /çalışmıyor/ });
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
