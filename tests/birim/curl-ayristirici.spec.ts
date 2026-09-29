// KORUMA TESTLERİ — cURL komutu ayrıştırıcısı (scripts/platform/servisler/curl-ayristirici.mjs) ve cURL'den REST servisi kaydı
// (gizli değer yalnız onayla şifreli sütuna; onaysızın sütunu boş; adlandırılmış taban adresine bağlanma). Ağ isteği YOKTUR:
// ayrıştırıcı saftır, kayıt geçici veritabanına yazılır. Örnek adresler example.com / 127.0.0.1.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { curlAyristir, curlBicimi, curlGizlileri, curlRestTaslagi, CurlHatasi, MASKE } from '../../scripts/platform/servisler/curl-ayristirici.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { servisGetir, servisSenaryolariniListele } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

const ilk = (metin: string) => curlAyristir(metin).istekler[0];

test.describe('cURL ayrıştırıcı', () => {
  test('bash: tek / çift tırnak, \\ ile çok satır, JSON gövde alanları, sorgu, içerik türü', () => {
    const c = curlAyristir(`curl -X POST 'https://example.com/api/v1/giris?dil=tr' \\
  -H 'Content-Type: application/json' \\
  -H "X-Kanal: web" \\
  --data-raw '{"kullanici":{"ad":"ornek","parola":"p-1"},"yas":30,"etiketler":[{"kod":"A"},{"kod":"B"}]}'`);
    expect(c.bicim).toBe('bash');
    expect(c.istekler).toHaveLength(1);
    const i = c.istekler[0];
    expect(i).toMatchObject({ metot: 'POST', koken: 'https://example.com', yol: '/api/v1/giris', icerikTuru: 'application/json', govdeTuru: 'json', soap: false });
    expect(i.sorgu).toEqual([{ ad: 'dil', deger: 'tr', gizli: false }]);
    expect(i.basliklar).toEqual([{ ad: 'X-Kanal', deger: 'web', gizli: false }]);
    expect(i.govdeAlanlari).toEqual([
      { yol: 'govde/kullanici/ad', ad: 'ad', deger: 'ornek', gizli: false },
      { yol: 'govde/kullanici/parola', ad: 'parola', deger: 'p-1', gizli: true },
      { yol: 'govde/yas', ad: 'yas', deger: '30', gizli: false },
      { yol: 'govde/etiketler/kod', ad: 'kod', deger: 'A', gizli: false }
    ]);
    expect(i.govdeMaskeli).toContain(`"parola": "${MASKE}"`);
    expect(i.govdeMaskeli).not.toContain('p-1');
    expect(JSON.parse(i.govdeGizlisiz)).toEqual({ kullanici: { ad: 'ornek', parola: '' }, yas: 30, etiketler: [{ kod: 'A' }, { kod: 'B' }] });
    // $'…' (ANSI-C) ve çift tırnak içindeki kaçışlar.
    expect(ilk(`curl $'https://example.com/a' -H "X-Not: \\"tırnak\\" \\$x" -d $'{"s":"a\\nb"}'`)).toMatchObject({
      basliklar: [{ ad: 'X-Not', deger: '"tırnak" $x', gizli: false }], govde: '{"s":"a\nb"}'
    });
  });

  test('Windows cmd: ^ satır devamı ve ^" kaçışı (tarayıcının "Copy as cURL (cmd)" çıktısı)', () => {
    const metin = [
      'curl ^"https://example.com/api/x?q=1^" ^',
      '  -H ^"accept: application/json^" ^',
      '  -H ^"content-type: application/json^" ^',
      '  --data-raw ^"^{^\\^"ad^\\^":^\\^"x y^\\^",^\\^"n^\\^":2^}^"'
    ].join('\r\n');
    expect(curlBicimi(metin)).toBe('cmd');
    const i = ilk(metin);
    expect(i).toMatchObject({ metot: 'POST', koken: 'https://example.com', yol: '/api/x', icerikTuru: 'application/json', govde: '{"ad":"x y","n":2}' });
    expect(i.basliklar).toEqual([{ ad: 'accept', deger: 'application/json', gizli: false }]);
    // Elle yazılmış cmd: çift tırnak + \" kaçışı.
    expect(ilk('curl -X PUT "https://example.com/k/1" ^\n -H "Content-Type: application/json" ^\n -d "{\\"a\\":1}"')).toMatchObject({ metot: 'PUT', yol: '/k/1', govde: '{"a":1}' });
  });

  test('PowerShell curl.exe: ` satır devamı, tek tırnak, \\" kaçışlı JSON', () => {
    const metin = "curl.exe -X PATCH \"https://example.com/k/2\" `\n  -H \"X-Api-Key: anahtar-1\" `\n  -H 'Content-Type: application/json' `\n  --data-raw '{\\\"durum\\\":\\\"acik\\\"}'";
    expect(curlBicimi(metin)).toBe('powershell');
    const i = ilk(metin);
    expect(i).toMatchObject({ metot: 'PATCH', yol: '/k/2', govdeTuru: 'json', govde: '{"durum":"acik"}' });
    expect(i.basliklar).toEqual([{ ad: 'X-Api-Key', deger: 'anahtar-1', gizli: true }]);
    expect(ilk("& curl.exe 'https://example.com/a' -H 'X-Ad: it''s'").basliklar).toEqual([{ ad: 'X-Ad', deger: "it's", gizli: false }]);
  });

  test('form gövdesi, --data-urlencode, -G ile sorgu, --json', () => {
    const f = ilk("curl https://example.com/giris -d 'kullanici=ornek' -d 'password=gizli%20deger' --data-urlencode 'not=a b&c'");
    expect(f).toMatchObject({ metot: 'POST', icerikTuru: 'application/x-www-form-urlencoded', govdeTuru: 'form', govde: 'kullanici=ornek&password=gizli%20deger&not=a%20b%26c' });
    expect(f.govdeAlanlari).toEqual([
      { yol: 'kullanici', ad: 'kullanici', deger: 'ornek', gizli: false },
      { yol: 'password', ad: 'password', deger: 'gizli deger', gizli: true },
      { yol: 'not', ad: 'not', deger: 'a b&c', gizli: false }
    ]);
    expect(f.govdeMaskeli).toBe(`kullanici=ornek&password=${MASKE}&not=a%20b%26c`);
    const g = ilk('curl -G https://example.com/ara?x=1 -d q=a+b --data-urlencode "s=ç d"');
    expect(g).toMatchObject({ metot: 'GET', govdeTuru: 'yok', govde: '' });
    expect(g.sorgu.map((x) => [x.ad, x.deger])).toEqual([['x', '1'], ['q', 'a b'], ['s', 'ç d']]);
    const j = ilk(`curl --json '{"a":1}' https://example.com/j`);
    expect(j).toMatchObject({ metot: 'POST', icerikTuru: 'application/json', govdeTuru: 'json' });
    expect(j.basliklar).toEqual([{ ad: 'Accept', deger: 'application/json', gizli: false }]);
    // İçerik türü yazılmamış JSON gövde: JSON alınır, uyarılır.
    expect(ilk(`curl https://example.com/x -d '{"a":1}'`).uyarilar.join(' ')).toMatch(/application\/json alındı/);
  });

  test('-u / --user Basic başlığına çevrilir ve gizlidir; Cookie, Authorization, API anahtarı gizli; maskeli ad listesi eklenebilir', () => {
    const i = ilk("curl -u 'kul:par-1' -b 'oturum=abc; dil=tr' -H 'Authorization-Ek: x' -H 'X-Musteri-Anahtari: m1' -H 'X-Kanal: web' 'https://example.com/a?token=t1&sayfa=2'");
    const b = Object.fromEntries(i.basliklar.map((x) => [x.ad, x]));
    expect(b.Authorization).toEqual({ ad: 'Authorization', deger: `Basic ${Buffer.from('kul:par-1').toString('base64')}`, gizli: true });
    expect(b.Cookie).toMatchObject({ deger: 'oturum=abc; dil=tr', gizli: true });
    expect(b['X-Kanal'].gizli).toBe(false);
    expect(b['X-Musteri-Anahtari'].gizli).toBe(false);
    expect(i.sorgu).toEqual([{ ad: 'token', deger: 't1', gizli: true }, { ad: 'sayfa', deger: '2', gizli: false }]);
    // Kullanıcının maskeli ad listesi (gizliMi) başlığı da gizli yapar.
    const ek = curlAyristir("curl -H 'X-Musteri-Anahtari: m1' https://example.com", { gizliMi: (ad) => /musterianahtari/i.test(ad.replace(/[-_]/g, '')) }).istekler[0];
    expect(ek.basliklar[0].gizli).toBe(true);
    // Adresteki kullanıcı:parola Authorization'a taşınır, adreste kalmaz.
    const a = ilk('curl http://kul:par@127.0.0.1:8080/x');
    expect(a).toMatchObject({ koken: 'http://127.0.0.1:8080', yol: '/x' });
    expect(a.basliklar[0]).toMatchObject({ ad: 'Authorization', gizli: true });
    expect(curlGizlileri(i).map((g) => g.anahtar)).toEqual(['baslik:Authorization-Ek', 'baslik:Authorization', 'baslik:Cookie', 'sorgu:token']);
  });

  test('yok sayılan ve tanınmayan seçenekler uyarıyla; -F ve @dosya desteklenmiyor; SOAP gövdesi WSDL önerir', () => {
    const i = ilk("curl --compressed -k -L -sS -v --max-time 5 -o cikti.txt --bilinmeyen --baska=1 -Z9 https://example.com/x -F 'dosya=@a.txt' -d @veri.json");
    expect(i.yoksayilanlar).toEqual(expect.arrayContaining(['--compressed', '-k', '-L', '-s', '-S', '-v', '--max-time', '-o']));
    expect(i.taninmayanlar).toEqual(expect.arrayContaining(['--bilinmeyen', '--baska']));
    expect(i.desteklenmeyenler.join(' ')).toMatch(/-F.*multipart/);
    expect(i.desteklenmeyenler.join(' ')).toMatch(/@dosya/);
    expect(i.uyarilar.join(' ')).toMatch(/-k \/ --insecure/);
    // Tanınmayan seçeneğin değeri metinde geçmez (yalnız adı).
    expect(JSON.stringify([i.uyarilar, i.taninmayanlar])).not.toContain('cikti.txt');
    const soap = ilk(`curl https://example.com/s.asmx -H 'Content-Type: text/xml; charset=utf-8' -H 'SOAPAction: "urn:Siparis"' -d '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Siparis><Parola>p1</Parola></Siparis></soap:Body></soap:Envelope>'`);
    expect(soap).toMatchObject({ soap: true, govdeTuru: 'ham', metot: 'POST' });
    expect(soap.uyarilar.join(' ')).toMatch(/SOAP \(WSDL\)/);
    expect(soap.govdeMaskeli).toContain(`<Parola>${MASKE}</Parola>`);
    expect(soap.govdeGizlisiz).toContain('<Parola></Parola>');
  });

  test('bozuk tırnak, eksik değer, adres yok, curl dışı metin: anlaşılır hata; yapıştırılan metin hataya yazılmaz', () => {
    const hata = (m: string) => { try { curlAyristir(m); return ''; } catch (e) { expect(e).toBeInstanceOf(CurlHatasi); return (e as Error).message; } };
    expect(hata("curl 'https://example.com/a' \\\n -H 'X: gizli-deger-1")).toMatch(/^2\. satırda açılan tek tırnak/);
    expect(hata('curl -d "{\\"parola\\":\\"gizli-deger-2\\"}')).toMatch(/1\. satırda açılan çift tırnak \("\) kapanmamış/);
    expect(hata('curl ^"https://example.com/gizli-deger-3')).toMatch(/çift tırnak/);
    expect(hata("curl.exe 'https://example.com/a")).toMatch(/tek tırnak/);
    expect(hata('curl https://example.com -H')).toBe('1. komut: -H seçeneğinin değeri eksik.');
    expect(hata('curl -X POST -d gizli-deger-4')).toMatch(/adres yok/);
    expect(hata('wget https://example.com')).toMatch(/"curl" ile başlamıyor/);
    expect(hata('   ')).toBe('Yapıştırılan metin boş.');
    expect(hata('Invoke-WebRequest -Uri https://example.com')).toMatch(/Invoke-WebRequest/);
    for (const m of [hata("curl 'https://example.com/a' \\\n -H 'X: gizli-deger-1"), hata('curl ^"https://example.com/gizli-deger-3'), hata('curl -X POST -d gizli-deger-4')]) {
      expect(m).not.toMatch(/gizli-deger|example/);
    }
  });

  test('birden çok komut: satır sonu ve ; ayırır; unutulmuş satır devamı önceki komuta eklenir; kabuk istemi atlanır', () => {
    const c = curlAyristir([
      '$ curl https://example.com/api/v1/liste',
      "curl -X DELETE 'https://example.com/api/v1/kayit/5'; curl -X POST https://example.com/api/v1/kayit",
      "  -H 'Content-Type: application/json' -d '{\"ad\":\"x\"}'",
      '',
      '# yorum satırı',
      'curl -I https://example.com/api/v1/durum'
    ].join('\n'));
    expect(c.istekler.map((i) => `${i.sira} ${i.metot} ${i.yol}`)).toEqual(['1 GET /api/v1/liste', '2 DELETE /api/v1/kayit/5', '3 POST /api/v1/kayit', '4 HEAD /api/v1/durum']);
    expect(c.istekler[2].govdeTuru).toBe('json');
    expect(() => curlAyristir('curl https://example.com/a\nbaska komut')).toThrow(/1\. komuttan sonra "curl" ile başlamayan/);
  });

  test('REST uç taslağı: tabana göre yol; onaysız gizli değer uçta yazılmaz (başlıkta şema kalır), onaylı ayrı döner', () => {
    const i = ilk("curl -X POST 'https://example.com/api/v1/giris?token=t1&dil=tr' -H 'Authorization: Bearer abc-1' -H 'Cookie: s=1' -H 'Content-Type: application/json' --data-raw '{\"kullanici\":\"ornek\",\"parola\":\"p-1\"}'");
    const onaysiz = curlRestTaslagi(i, { taban: 'https://example.com/api' });
    expect(onaysiz).toMatchObject({ metot: 'POST', yol: '/v1/giris', icerikTuru: 'application/json' });
    expect(onaysiz.basliklar).toEqual([{ ad: 'Authorization', deger: 'Bearer' }, { ad: 'Cookie', deger: '' }]);
    expect(onaysiz.sorgu).toEqual([{ ad: 'token', deger: '' }, { ad: 'dil', deger: 'tr' }]);
    expect(onaysiz.gizliDegerler).toEqual({ 'sorgu/token': null, 'govde/parola': null });
    expect(onaysiz.gizliAlanlar).toEqual(['sorgu/token', 'govde/parola']);
    expect(JSON.stringify(onaysiz)).not.toMatch(/abc-1|p-1|t1|s=1/);
    const onayli = curlRestTaslagi(i, { taban: 'https://example.com', onayli: (a) => a !== 'baslik:Cookie' });
    expect(onayli.yol).toBe('/api/v1/giris');
    expect(onayli.basliklar).toEqual([{ ad: 'Authorization', deger: 'Bearer abc-1' }, { ad: 'Cookie', deger: '' }]);
    expect(onayli.gizliDegerler).toEqual({ 'sorgu/token': 't1', 'govde/parola': 'p-1' });
    expect(JSON.parse(onayli.govdeOrnegi)).toEqual({ kullanici: 'ornek', parola: '' });
    // HEAD → GET (uyarı); GET gövdesi alınmaz.
    expect(curlRestTaslagi(ilk('curl -I https://example.com/x')).uyarilar.join(' ')).toMatch(/HEAD.*GET/);
    const g = curlRestTaslagi(ilk("curl -X GET https://example.com/x -d 'a=1'"));
    expect(g.govdeOrnegi).toBe('');
    expect(g.uyarilar.join(' ')).toMatch(/gövdesi alınmadı/);
  });
});

test.describe('cURL\'den REST servisi kaydı (geçici veritabanı)', () => {
  const klasor = geciciKlasor('curl-kayit');
  let vt: Veritabani;
  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });

  test('onaylı gizli değer şifreli sütuna, onaysızın sütunu boş; alan gizli sütuna bağlanır; senaryoda değer yok', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const testO = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const i = ilk("curl -X POST 'http://127.0.0.1:9/api/giris?token=t-1' -H 'Authorization: Bearer abc-1' -H 'Cookie: s=c-1' -H 'Content-Type: application/json' --data-raw '{\"kullanici\":\"ornek\",\"parola\":\"p-1\"}'");
    const t = curlRestTaslagi(i, { taban: 'http://127.0.0.1:9', onayli: (a) => a === 'baslik:Authorization' || a === 'sorgu:token' });
    const r = restServisiKaydet(vt, projeId, {
      anahtar: 'giris', ad: 'Giris', tabanlar: { [testO]: 'http://127.0.0.1:9' },
      uclar: [{ ad: 'giris', ...t, yalnizTest: false }], gizliBosSutun: true, gizliAlanDegerleri: { giris: t.gizliDegerler }, senaryolar: ['giris']
    });
    const s = servisGetir(vt, r.id);
    const op = s?.ayarlar.operasyonlar?.[0] as Record<string, any>;
    expect(op.basliklar).toEqual([{ ad: 'Authorization', deger: 'Bearer ${Giris başlıkları.Authorization}' }, { ad: 'Cookie', deger: '${Giris başlıkları.Cookie}' }]);
    const tablolar = tablolariListele(vt, projeId);
    const basliklar = tablolar.find((x) => x.ad === 'Giris başlıkları');
    expect(basliklar?.sutunlar.map((c) => [c.ad, c.gizli])).toEqual([['Authorization', true], ['Cookie', true]]);
    expect(basliklar?.satirlar[0].doluGizli).toEqual(['Authorization']);
    const gizli = tablolar.find((x) => x.ad === 'Giris gizli değerleri');
    expect(gizli?.sutunlar.map((c) => [c.ad, c.gizli])).toEqual([['token', true], ['parola', true]]);
    expect(gizli?.satirlar[0].doluGizli).toEqual(['token']);
    expect(s?.ayarlar.alanBaglari).toEqual({ giris: { 'sorgu/token': { tablo: gizli?.id, sutun: 'token' }, 'govde/parola': { tablo: gizli?.id, sutun: 'parola' } } });
    // Hiçbir gizli değer servis ayarlarında ya da senaryoda düz durmaz.
    const [sen] = servisSenaryolariniListele(vt, r.id);
    for (const metin of [JSON.stringify(s?.ayarlar), JSON.stringify(sen)]) expect(metin).not.toMatch(/abc-1|c-1|p-1|t-1/);
    expect(sen.icerik.http?.yol).toBe('/api/giris?token=${Giris gizli değerleri.token}');
    expect(JSON.parse(String(sen.icerik.govde).replace('${Giris gizli değerleri.parola}', 'X'))).toEqual({ kullanici: 'ornek', parola: 'X' });
    // gizliBosSutun olmadan (elle REST sihirbazı) boş başlık eskisi gibi kalır.
    const r2 = restServisiKaydet(vt, projeId, { anahtar: 'elle', ad: 'Elle', uclar: [{ ad: 'a', metot: 'GET', yol: '/a', basliklar: [{ ad: 'Authorization', deger: '' }] }] });
    expect((servisGetir(vt, r2.id)?.ayarlar.operasyonlar?.[0] as Record<string, any>).basliklar).toEqual([{ ad: 'Authorization', deger: '' }]);
    expect(() => restServisiKaydet(vt, projeId, { anahtar: 'x', ad: 'X', uclar: [{ ad: 'a', metot: 'GET' }], gizliAlanDegerleri: { a: { 'sorgu/x': 'a\nb' } } })).toThrow(/tek satır/);
  });
});
