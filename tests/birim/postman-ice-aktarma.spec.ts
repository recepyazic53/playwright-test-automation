// KORUMA TESTLERİ — Postman koleksiyonu ayrıştırma (scripts/platform/servisler/postman-ice-aktarma.mjs): klasör → servis,
// değişken çözümü (koleksiyon + ortam dosyası), gizli değerlerin tespiti ve düz yazılmış sırların değişkene çevrilmesi.
// Ağ isteği ve veritabanı YOK. Koleksiyon SENTETİKTİR (gerçek adres / kimlik içermez).
import { expect, test } from '@playwright/test';
import { ortakYol, postmanCozumle, postmanOzeti, sablonCevir } from '../../scripts/platform/servisler/postman-ice-aktarma.mjs';

const SIR = 'sahte-sir-9f3a';
const KOLEKSIYON = JSON.stringify({
  info: { name: 'Örnek API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{erisimAnahtari}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:9/api/v1' }, { key: 'sayfaBoyu', value: '20' }],
  item: [
    {
      name: 'Kullanıcılar',
      item: [
        {
          name: 'Liste', request: { method: 'GET', url: { raw: '{{baseUrl}}/kullanicilar?boyut={{sayfaBoyu}}&kapali=1', query: [{ key: 'boyut', value: '{{sayfaBoyu}}' }, { key: 'kapali', value: '1', disabled: true }] } },
          event: [{ listen: 'test', script: { exec: ['pm.test("200", () => pm.response.to.have.status(200));'] } }]
        },
        {
          name: 'Ekle',
          request: {
            method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Api-Key', value: SIR }],
            body: { mode: 'raw', raw: '{"ad":"{{ad}}","password":"duz-parola"}', options: { raw: { language: 'json' } } },
            url: { raw: '{{baseUrl}}/kullanicilar/:id', variable: [{ key: 'id', value: '' }] }
          }
        },
        { name: 'Alt', item: [{ name: 'Sil', request: { method: 'DELETE', url: '{{baseUrl}}/kullanicilar/7' } }] }
      ]
    },
    {
      name: 'Oturum',
      item: [{
        name: 'Giriş', request: { method: 'POST', url: '{{baseUrl}}/oturum', body: { mode: 'formdata', formdata: [{ key: 'f', type: 'file' }] } },
        event: [{ listen: 'test', script: { exec: ['pm.environment.set("erisimAnahtari", pm.response.json().token);'] } }]
      }]
    },
    { name: 'Durum', request: { method: 'GET', url: 'https://ornek.test/saglik' } }
  ]
});
const ORTAM = JSON.stringify({ name: 'TEST', values: [
  { key: 'ad', value: 'Ayşe', enabled: true },
  { key: 'erisimAnahtari', value: 'ortam-anahtari', type: 'secret', enabled: true }
] });

test.describe('Postman koleksiyonu ayrıştırma', () => {
  test('klasör → servis; kök istekler koleksiyon adıyla tek serviste; alt klasör istekleri üst klasörün servisinde', () => {
    const c = postmanCozumle(KOLEKSIYON);
    expect(c.surum).toBe('2.1');
    expect(c.klasorler.map((k) => [k.anahtar, k.ad, k.istekler.length])).toEqual([
      ['kullanicilar', 'Kullanıcılar', 3], ['oturum', 'Oturum', 1], ['ornek-api', 'Örnek API', 1]
    ]);
    const [liste, ekle, sil] = c.klasorler[0].istekler;
    expect(sil.baslik).toBe('Alt / Sil');
    expect(liste.operasyon).toBe('GET /api/v1/kullanicilar');
    // Kapalı sorgu parametresi atlanır; betikteki durum kodu kontrolü alınır.
    expect(liste.yol).toBe('/api/v1/kullanicilar?boyut={{sayfaBoyu}}');
    expect(liste.kontroller).toEqual([{ tur: 'durumKodu', deger: '200' }]);
    expect(liste.koken).toBe('http://127.0.0.1:9');
    // Yol değişkeni (değersiz) {{id}} olur; Content-Type içerik türüne gider; miras bearer yetkisi başlık olur.
    expect(ekle.yol).toBe('/api/v1/kullanicilar/{{id}}');
    expect(ekle.icerikTuru).toBe('application/json');
    expect(ekle.basliklar.Authorization).toBe('Bearer {{erisimAnahtari}}');
    expect(ortakYol(c.klasorler[0].istekler.map((i) => i.yol))).toBe('/api/v1');
    // Desteklenmeyen gövde uyarı olur; betikle atanan değişken işaretlenir.
    expect(c.klasorler[1].istekler[0].uyarilar.join(' ')).toContain('form-data');
    expect(c.degiskenler.find((v) => v.ad === 'erisimAnahtari')?.betikle).toBe(true);
    expect(c.tabanDegiskenleri).toEqual(['baseUrl']);
  });

  test('ortam dosyası değişkenleri çözer; gizliler işaretlenir, düz yazılmış sırlar değişkene çevrilir, önizlemede değer dönmez', () => {
    const c = postmanCozumle(KOLEKSIYON, { ortamMetni: ORTAM });
    const v = Object.fromEntries(c.degiskenler.map((x) => [x.ad, x]));
    expect(v.ad).toMatchObject({ deger: 'Ayşe', kaynak: 'ortam', gizli: false });
    expect(v.sayfaBoyu).toMatchObject({ deger: '20', kaynak: 'koleksiyon', gizli: false });
    expect(v.erisimAnahtari).toMatchObject({ deger: 'ortam-anahtari', kaynak: 'ortam', gizli: true });
    // Düz yazılmış X-Api-Key başlığı ve JSON "password" alanı: şablonda değer kalmaz.
    const ekle = c.klasorler[0].istekler[1];
    expect(ekle.basliklar['X-Api-Key']).toBe('{{X-Api-Key}}');
    expect(ekle.govde).toBe('{"ad":"{{ad}}","password":"{{password}}"}');
    expect(v['X-Api-Key']).toMatchObject({ deger: SIR, kaynak: 'istek', gizli: true });
    expect(v.password).toMatchObject({ deger: 'duz-parola', gizli: true });
    const ozet = JSON.stringify(postmanOzeti(c));
    for (const sir of [SIR, 'duz-parola', 'ortam-anahtari']) expect(ozet.includes(sir), 'önizleme gizli değer içermemeli').toBe(false);
    expect(ozet).toContain('Ayşe');
    expect(sablonCevir(ekle.govde, (ad) => (ad === 'ad' ? '${Tablo.ad}' : undefined))).toBe('{"ad":"${Tablo.ad}","password":"{{password}}"}');
  });

  test('Postman olmayan ya da v1 dosya açık hatayla reddedilir', () => {
    expect(() => postmanCozumle('{')).toThrow(/JSON/);
    expect(() => postmanCozumle(JSON.stringify({ name: 'x', requests: [] }))).toThrow(/v1/);
    expect(() => postmanCozumle(JSON.stringify({ info: { name: 'x', schema: 'https://schema.getpostman.com/json/collection/v3.0.0/' }, item: [] }))).toThrow(/şema/);
  });
});
