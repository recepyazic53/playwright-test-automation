// KORUMA TESTLERİ — "Adım adım > REST": tam adres ayrıştırma (şemasız adres https), gövde örneğinden alanlar ve senaryo şablonu,
// REST servisi kaydı (gizli başlık değeri şifreli tabloya; başlıkta yalnız başvuru), başlangıç senaryosunun koşusu ve "Dene".
// İstekler YALNIZCA 127.0.0.1'deki sahte sunucuya gider. Geçici klasör.
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adresAyir, baslangicSablonu, restSemasi, ucAdiOner } from '../../scripts/platform/servisler/rest-semasi.mjs';
import { restServisiKaydet, restUcuDene } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { servisGetir, servisSenaryolariniListele } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

const ORNEK = '{"kullanici":{"ad":"ornek","parola":"ornek-parola"},"yas":30,"etiketler":[{"kod":"A"}]}';

test('tam adres: köken + yol + sorgu; şemasız adres https; uç adı yoldan önerilir', () => {
  expect(adresAyir('xxx.com/api/rest/user-auth-rs/v10/authenticate')).toEqual({
    koken: 'https://xxx.com', yol: '/api/rest/user-auth-rs/v10/authenticate', sorgu: [], semaEklendi: true
  });
  expect(adresAyir('http://127.0.0.1:8080/k/{id}?sayfa=2&q=a b')).toEqual({
    koken: 'http://127.0.0.1:8080', yol: '/k/{id}', sorgu: [{ ad: 'sayfa', deger: '2' }, { ad: 'q', deger: 'a b' }], semaEklendi: false
  });
  expect(() => adresAyir('ftp://x.com/a')).toThrow(/http/);
  expect(ucAdiOner('/api/rest/user-auth-rs/v10/authenticate')).toBe('authenticate');
  expect(ucAdiOner('/kullanicilar/{id}')).toBe('kullanicilar');
});

test('gövde örneğinden alanlar (iç içe, dizi ilk eleman) ve şablon: bağlı alan başvuru, sayı tırnaksız, gizli değer yazılmaz', () => {
  const uc = { ad: 'ekle', yol: '/k/{id}', sorgu: [{ ad: 'dil', deger: 'tr' }], govdeOrnegi: ORNEK, icerikTuru: 'application/json' };
  const sema = restSemasi(uc);
  expect(sema.alanlar.map((a) => a.ad)).toEqual(['yol', 'sorgu', 'govde']);
  const govde = sema.alanlar[2].cocuklar ?? [];
  expect(govde.map((a) => a.ad)).toEqual(['kullanici', 'yas', 'etiketler']);
  expect(govde[1].tip).toBe('tamsayi');
  expect(govde[2]).toMatchObject({ coklu: true, cocuklar: [{ ad: 'kod', tip: 'metin' }] });
  const refler: Record<string, string> = { 'yol/id': 'Kişi.No', 'govde/kullanici/ad': 'Kişi.Ad', 'govde/yas': 'Kişi.Yaş' };
  const s = baslangicSablonu(uc, { ref: (y) => refler[y], gizli: new Set(['govde/kullanici/parola']) });
  expect(s.yol).toBe('/k/${Kişi.No}?dil=tr');
  expect(JSON.parse(s.govde.replace('${Kişi.Yaş}', '0'))).toEqual({ kullanici: { ad: '${Kişi.Ad}', parola: '' }, yas: 0, etiketler: [{ kod: 'A' }] });
  expect(s.govde).toContain('"yas": ${Kişi.Yaş}');
});

test.describe('REST servisi kaydı ve koşu (sahte sunucu)', () => {
  const klasor = geciciKlasor('rest');
  let vt: Veritabani;
  let sunucu: Server;
  const gelen: Array<{ metot: string; url: string; basliklar: IncomingHttpHeaders; govde: string }> = [];
  test.afterAll(async () => { vt?.kapat(); klasor.temizle(); await new Promise((c) => sunucu?.close(c)); });

  test('kayıt → gizli başlık tabloya → başlangıç senaryosu koşar; Dene yalnız TEST ve yer tutucusuz', async () => {
    sunucu = createServer((q, r) => {
      let g = '';
      q.on('data', (p) => { g += p; });
      q.on('end', () => { gelen.push({ metot: q.method ?? '', url: q.url ?? '', basliklar: q.headers, govde: g }); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"tamam":true}'); });
    });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const testO = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true });
    const canli = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { canli: true } });
    const kisi = tabloKaydet(vt, { projeId, ad: 'Kişi', sutunlar: [{ ad: 'Ad' }], satirlar: [{ degerler: { Ad: 'Ay"şe' } }] });

    const uc = { ad: 'authenticate', metot: 'POST', yol: '/api/v10/authenticate', sorgu: [{ ad: 'dil', deger: 'tr' }], icerikTuru: 'application/json',
      basliklar: [{ ad: 'Authorization', deger: 'Bearer gizli-anahtar-1' }, { ad: 'X-Kanal', deger: 'web' }], govdeOrnegi: ORNEK, yalnizTest: true,
      gizliAlanlar: ['govde/kullanici/parola'] };
    expect(() => restServisiKaydet(vt, projeId, { anahtar: 'r', ad: 'R', uclar: [{ ...uc, govdeOrnegi: '{bozuk' }] })).toThrow(/JSON/);
    const r = restServisiKaydet(vt, projeId, {
      anahtar: 'kimlik', ad: 'Kimlik', tabanlar: { [testO]: adres, [canli]: '' }, uclar: [uc],
      alanBaglari: { authenticate: { 'govde/kullanici/ad': { tablo: kisi, sutun: 'Ad' } } }, senaryolar: ['authenticate']
    });
    expect(r.eklenenSenaryolar).toEqual(['authenticate']);
    const s = servisGetir(vt, r.id);
    expect(s?.tur).toBe('rest');
    expect(s?.ayarlar.yalnizTestOperasyonlari).toEqual(['authenticate']);
    const op = s?.ayarlar.operasyonlar?.[0] as Record<string, any>;
    expect(op.basliklar).toEqual([{ ad: 'Authorization', deger: 'Bearer ${Kimlik başlıkları.Authorization}' }, { ad: 'X-Kanal', deger: 'web' }]);
    expect(JSON.stringify(s?.ayarlar)).not.toContain('gizli-anahtar-1');
    const baslikTablosu = tablolariListele(vt, projeId).find((t) => t.ad === 'Kimlik başlıkları');
    expect(baslikTablosu?.sutunlar).toEqual([expect.objectContaining({ ad: 'Authorization', gizli: true })]);

    const [sen] = servisSenaryolariniListele(vt, r.id);
    expect(sen.icerik.http).toEqual({ metot: 'POST', yol: '/api/v10/authenticate?dil=tr', icerikTuru: 'application/json' });
    const k = await servisSenaryosuCalistir(vt, projeId, { servisId: r.id, ortamId: testO, tur: 'dene', senaryoId: sen.id });
    expect(k.durum, String(k.hata)).toBe('basarili');
    const g = gelen[gelen.length - 1];
    expect([g.metot, g.url, g.basliklar.authorization, g.basliklar['x-kanal']]).toEqual(['POST', '/api/v10/authenticate?dil=tr', 'Bearer gizli-anahtar-1', 'web']);
    expect(JSON.parse(g.govde)).toEqual({ kullanici: { ad: 'Ay"şe', parola: '' }, yas: 30, etiketler: [{ kod: 'A' }] });
    expect(JSON.stringify(k)).not.toContain('gizli-anahtar-1');

    // Dene: TEST ortamında ister; CANLI reddedilir; yol yer tutucusu kalmışsa istek atılmaz.
    const once = gelen.length;
    const d = await restUcuDene(vt, projeId, { ortamId: testO, taban: adres, uc: { ...uc, metot: 'GET', basliklar: [] } });
    expect(d).toMatchObject({ basarili: true, durumKodu: 200, metot: 'GET' });
    expect(gelen.length).toBe(once + 1);
    await expect(restUcuDene(vt, projeId, { ortamId: canli, taban: adres, uc })).rejects.toThrow(/test ortamında/);
    await expect(restUcuDene(vt, projeId, { ortamId: testO, taban: adres, uc: { ...uc, yol: '/k/{id}' } })).rejects.toThrow(/yer tutucu/);
    expect(gelen.length).toBe(once + 1);
  });
});
