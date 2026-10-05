// KORUMA TESTLERİ — LİSTE UÇLARININ HIZI ve ÖNBELLEĞİN DOĞRULUĞU (gerçek kurulum büyüklüğünde SAHTE veri: buyuk-proje-fikstur.mjs —
// 9 ekran, 23 servis, ~37 senaryo, 43 tablo, birinde ~2264 satır).
//  1) Performans koruması: senaryolar / servisler / veri sağlığı / ekranlar uçları eşiğin altında (eşikler GEVŞEK: eski kod bu
//     veride saniyelerce sürüyordu; yavaş makinede kırılmasın diye hedefin çok üstünde). Servis listesi ağır ayarları taşımaz.
//  2) Veri değişince liste yeni veriyi gösterir (senaryo başlığı, ekran adı, servis senaryosu, yeni tablo, tablo değeri → seçenek).
//  3) Kasa kilitlenince liste uçları önbellekten yanıt vermez; açılınca veri aynıdır.
// Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış adrese istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { buyukProjeDosyasiOlustur, type BuyukProje } from './buyuk-proje-fikstur.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Uc-Hizi-${randomBytes(6).toString('hex')}`;

test.describe.configure({ mode: 'serial' });

let nobetci: Nobetci;
let klasor = '';
let proje: BuyukProje;

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
async function basarili(yol: string, govde?: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
/** GET süresi (ms) ve yanıt boyutu (bayt). */
async function olc(yol: string): Promise<{ ms: number; bayt: number; y: Nesne }> {
  const t = performance.now();
  const r = await fetch(`${nobetci.adres}${yol}`, { headers: { 'x-test-sunucu-token': nobetci.token } });
  const metin = await r.text();
  const ms = performance.now() - t;
  const y = JSON.parse(metin) as Nesne;
  expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true);
  return { ms, bayt: Buffer.byteLength(metin), y };
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  klasor = mkdtempSync(join(tmpdir(), 'uc-hizi-'));
  const vtYolu = join(klasor, 'platform.db');
  proje = await buyukProjeDosyasiOlustur(vtYolu, PAROLA, { kdf: HIZLI_KDF });
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

const uclar = () => ({
  senaryolar: `/platform/senaryolar?projeId=${proje.projeId}`,
  servisler: `/platform/servisler?projeId=${proje.projeId}`,
  veriSagligi: `/platform/tablolar/veri-sagligi?projeId=${proje.projeId}`,
  ekranlar: `/platform/ekranlar?projeId=${proje.projeId}`
});

test('performans koruması: dört liste ucu büyük veride eşiğin altında; servis listesi ağır ayar taşımaz', async () => {
  test.setTimeout(120_000);
  const sureler: Record<string, number[]> = {};
  for (let tur = 0; tur < 3; tur++) {
    for (const [ad, yol] of Object.entries(uclar())) (sureler[ad] ??= []).push((await olc(yol)).ms);
  }
  console.log(`[uç hızı] ${Object.entries(sureler).map(([ad, s]) => `${ad}: ${s.map((x) => Math.round(x)).join(' / ')} ms`).join(' · ')}`);
  // İlk (soğuk) istek: önbellekler boşken. Sonrakiler: önbellek dolu. Eski kod bu veride senaryolarda ~4 sn, veri sağlığında ~2,5 sn.
  for (const [ad, s] of Object.entries(sureler)) {
    expect(s[0], `${ad} soğuk`).toBeLessThan(4000);
    expect(Math.min(...s.slice(1)), `${ad} sıcak`).toBeLessThan(1500);
  }
  const servis = await olc(uclar().servisler);
  expect(servis.bayt, 'servis listesi boyutu').toBeLessThan(200 * 1024);
  const s0 = servis.y.servisler[0] as Nesne;
  expect(s0).toMatchObject({ senaryoSayisi: 12, kosuyaDahilSayisi: 9 });
  expect(s0.sonKosu).toMatchObject({ durum: expect.any(String) });
  expect(Object.keys(s0.ayarlar).sort()).toEqual(['alanBaglari', 'operasyonlar', 'soapSurumu', 'tabanlar', 'tarihKurallari', 'yol']);
  expect(s0.ayarlar.operasyonlar[0]).toEqual({ ad: expect.any(String), eylem: expect.any(String) });
  // Ağır ayarlar tekil uçta.
  const d = (await basarili(`/platform/servis?projeId=${proje.projeId}&id=${s0.id}`)).servis as Nesne;
  expect(Object.keys(d.ayarlar)).toEqual(expect.arrayContaining(['ornekIstekler', 'operasyonSemalari', 'sozlesmeler']));
  expect(d).toMatchObject({ senaryoSayisi: 12, kosuyaDahilSayisi: 9 });
});

test('veri değişince liste uçları yeni veriyi gösterir', async () => {
  test.setTimeout(120_000);
  const p = proje.projeId;
  // Önbellekler dolu.
  for (const yol of Object.values(uclar())) await olc(yol);

  // Senaryo başlığı → senaryo listesi.
  await basarili('/platform/senaryo/kaydet', { projeId: p, id: proje.senaryoIdleri[0], baslik: 'Önbellek sonrası başlık' });
  expect(((await olc(uclar().senaryolar)).y.senaryolar as Nesne[]).map((s) => s.baslik)).toContain('Önbellek sonrası başlık');

  // Ekran adı → ekran listesi ve senaryo listesindeki ekran adı.
  const ekranlar = (await olc(uclar().ekranlar)).y.ekranlar as Nesne[];
  const ekran = ekranlar.find((e) => e.anahtar === 'ekran-2') as Nesne;
  await basarili('/platform/ekran/yeniden-adlandir', { projeId: p, ekranId: ekran.id, ad: 'Yeniden adlı ekran' });
  expect(((await olc(uclar().ekranlar)).y.ekranlar as Nesne[]).find((e) => e.id === ekran.id)?.ad).toBe('Yeniden adlı ekran');
  expect(((await olc(uclar().senaryolar)).y.senaryolar as Nesne[]).filter((s) => s.ekranId === ekran.id).every((s) => s.ekranAdi === 'Yeniden adlı ekran')).toBe(true);

  // Servis senaryosu → servis listesindeki sayı.
  const servis = ((await olc(uclar().servisler)).y.servisler as Nesne[])[0];
  await basarili('/platform/servis/senaryo/kaydet', { projeId: p, servisId: servis.id, baslik: 'Önbellek senaryosu',
    icerik: { operasyon: servis.ayarlar.operasyonlar[0].ad, govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] } });
  expect(((await olc(uclar().servisler)).y.servisler as Nesne[]).find((s) => s.id === servis.id)?.senaryoSayisi).toBe(servis.senaryoSayisi + 1);

  // Yeni tablo → veri sağlığında kullanılmayan tablolar.
  await basarili('/platform/tablo/kaydet', { projeId: p, ad: 'Önbellek tablosu', sutunlar: [{ ad: 'Kolon' }], satirlar: [{ degerler: { Kolon: 'x' } }] });
  expect(((await olc(uclar().veriSagligi)).y.kullanilmayan as Nesne[]).map((t) => t.ad)).toContain('Önbellek tablosu');

  // Tablo değeri → bağlı seçim alanının seçenekleri (model bağlamı önbelleği).
  const e3 = ekranlar.find((e) => e.anahtar === 'ekran-3') as Nesne;
  const bag = await basarili(`/platform/ekran/alan-baglari?projeId=${p}&ekranId=${e3.id}`);
  const { tablolar } = await basarili(`/platform/tablolar?projeId=${p}`);
  const [alan, b] = Object.entries(bag.baglar as Record<string, Nesne>).find(([, x]) => (tablolar as Nesne[]).some((t) => t.id === x.tablo && t.ad.startsWith('Liste '))) as [string, Nesne];
  const tablo = (tablolar as Nesne[]).find((t) => t.id === b.tablo) as Nesne;
  const secenekler = async () => (((await basarili(`/platform/ekran/girdiler?projeId=${p}&ekranId=${e3.id}`)).girdiler as Nesne[]).find((g) => g.id === alan)?.secenekler as Nesne[]).map((s) => s.deger);
  expect(await secenekler()).not.toContain('Önbellek değeri');
  await basarili('/platform/tablo/kaydet', { projeId: p, id: tablo.id, ad: tablo.ad, sutunlar: (tablo.sutunlar as Nesne[]).map((s) => ({ ad: s.ad, gizli: s.gizli })),
    satirlar: [{ degerler: { [b.sutun]: 'Önbellek değeri' } }] });
  expect(await secenekler()).toContain('Önbellek değeri');
});

test('kasa kilitlenince liste uçları önbellekten yanıt vermez; açılınca veri aynı', async () => {
  const once = (await olc(uclar().veriSagligi)).y;
  await basarili('/platform/kasa/kilitle', { tamamen: true });
  for (const yol of Object.values(uclar())) {
    const y = await api(yol);
    expect(y.basarili, yol).toBe(false);
  }
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  expect((await olc(uclar().veriSagligi)).y).toEqual(once);
});
