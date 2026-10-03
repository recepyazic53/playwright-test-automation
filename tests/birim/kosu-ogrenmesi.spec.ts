// KORUMA TESTLERİ — servis analizinde sürekli öğrenme (scripts/platform/servisler/kosu-ogrenmesi.mjs, servis-ogrenme.mjs):
// koşudan gözlem (yalnız elle yazılmış değerler; tablo / akış / kural / maskeli atlanır), başarısız koşuda hata metninin andığı alan
// şüpheli (diğerleri zayıf), tek farkla ayrılan alan şüpheli, belirsiz sebepte değer yok; öneriler (tabloya değer ekle — ≥ 2 başarılı
// koşuda güçlü —, bağı olmayan alana tablo eşleşmesi, başarılı koşuda boş giden zorunlu alan → isteğe bağlı), kanıt birikimi,
// karar süzgeci, budama, koşudan bağımsız hata yakalama. Ağ yok; veri sentetik.
import { expect, test } from '@playwright/test';
import { EN_COK_GOZLEM, gozlemEkle, gozlemOlustur, hataAlanlari, hataMetni, kosuOnerileri, type Gozlem } from '../../scripts/platform/servisler/kosu-ogrenmesi.mjs';
import { ogrenmeyiCalistir } from '../../scripts/platform/servisler/servis-ogrenme.mjs';
import type { OperasyonSemasi } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { oneriyiUygula, type AnalizDurumu, type TabloSatiriOnerisi } from '../../scripts/platform/servisler/servis-analizi.mjs';

const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Islem xmlns="urn:ornek"><Girdi>${ic}</Girdi></Islem></s:Body></s:Envelope>`;
const SEMA: OperasyonSemasi = { ad: 'Islem', kok: 'Islem', ns: 'urn:ornek', alanlar: [{ ad: 'Girdi', cocuklar: [
  { ad: 'Kanal', tip: 'metin' }, { ad: 'Kod', tip: 'metin' }, { ad: 'Username', tip: 'metin' }, { ad: 'Not', tip: 'metin', zorunlu: true }
] }] };
const SABLON = zarf('<Kanal>7</Kanal><Kod>K1</Kod><Kullanici>${Giris.Kullanici}</Kullanici><Belirtec>${akis:Tok}</Belirtec><Tarih>${BEGIN_DATE}</Tarih><Parola>p</Parola><Not/>');
const ISTEK = zarf('<Kanal>7</Kanal><Kod>K1</Kod><Kullanici>tablodan</Kullanici><Belirtec>akistan</Belirtec><Tarih>2026-01-01</Tarih><Parola>••••••</Parola><Not/>');
const temel = { tur: 'soap' as const, kok: 'Islem', ustAlanlar: ['Girdi'], senaryo: 'A', senaryoId: 's1', zaman: '2026-10-03T10:00:00.000Z', kaynak: 'kosu' as const };

test('gözlem: yalnız elle yazılmış değerler; tablo / akış / kural ve maskeli değer yalnız "dolu"; boş alan', () => {
  const g = gozlemOlustur({ ...temel, istek: ISTEK, sablon: SABLON, kosuDurumu: 'basarili' }) as Gozlem;
  expect(g.durum).toBe('basarili');
  expect(g.alanlar).toEqual({
    'Girdi/Kanal': { d: 'dolu', v: '7' }, 'Girdi/Kod': { d: 'dolu', v: 'K1' }, 'Girdi/Kullanici': { d: 'dolu' }, 'Girdi/Belirtec': { d: 'dolu' },
    'Girdi/Tarih': { d: 'dolu' }, 'Girdi/Parola': { d: 'dolu' }, 'Girdi/Not': { d: 'bos' }
  });
  expect(gozlemOlustur({ ...temel, istek: '<bozuk', sablon: SABLON, kosuDurumu: 'basarili' })).toBeNull();
  // Adı gizli alanın elle yazılmış değeri (maskesiz olsa da) saklanmaz.
  const acik = gozlemOlustur({ ...temel, istek: zarf('<Parola>duz-deger</Parola>'), sablon: zarf('<Parola>duz-deger</Parola>'), kosuDurumu: 'bilinmiyor', kaynak: 'senaryo' }) as Gozlem;
  expect(acik.alanlar).toEqual({ 'Girdi/Parola': { d: 'dolu' } });
});

test('başarısız koşu: hata metni alanı anıyorsa şüpheli (diğerleri zayıf); tek farkla ayrılıyorsa şüpheli; belirsizse değer yok', () => {
  expect(hataMetni({ yanit: '<soap:Fault><faultstring>Kanal geçersiz</faultstring></soap:Fault>' })).toBe('Kanal geçersiz');
  expect(hataMetni({ yanit: '{"error":{"message":"Kullanıcı bulunamadı"}}' })).toBe('Kullanıcı bulunamadı');
  expect(hataAlanlari('Kullanıcı bulunamadı', ['Girdi/Username', 'Girdi/Kanal'])).toEqual(['Girdi/Username']);
  expect(hataAlanlari('İşlem tamamlanamadı', ['Girdi/Username', 'Girdi/Kanal'])).toEqual([]);
  const anilan = gozlemOlustur({ ...temel, istek: ISTEK, sablon: SABLON, kosuDurumu: 'basarisiz', sonuc: { yanit: '<Sonuc><Aciklama>Kod hatalı</Aciklama></Sonuc>' } }) as Gozlem;
  expect(anilan).toMatchObject({ durum: 'hata', supheli: ['Girdi/Kod'], zayif: true });
  expect(anilan.alanlar['Girdi/Kanal']).toEqual({ d: 'dolu', v: '7' });

  const onceki = gozlemOlustur({ ...temel, istek: ISTEK, sablon: SABLON, kosuDurumu: 'basarili' }) as Gozlem;
  const tekIstek = ISTEK.replace('<Kanal>7</Kanal>', '<Kanal>9</Kanal>');
  const tek = gozlemOlustur({ ...temel, istek: tekIstek, sablon: SABLON.replace('<Kanal>7', '<Kanal>9'), kosuDurumu: 'basarisiz', sonuc: { hata: 'HTTP 500' }, oncekiler: [onceki] }) as Gozlem;
  expect(tek).toMatchObject({ durum: 'hata', supheli: ['Girdi/Kanal'], tekFark: true });
  const iki = gozlemOlustur({ ...temel, istek: tekIstek.replace('K1', 'K2'), sablon: SABLON, kosuDurumu: 'basarisiz', sonuc: { hata: 'HTTP 500' }, oncekiler: [onceki] }) as Gozlem;
  expect(iki).toMatchObject({ durum: 'hata', belirsiz: true });
  expect(Object.values(iki.alanlar).some((a) => a.v !== undefined)).toBe(false);
  // Başka senaryonun başarılı koşusu karşılaştırılmaz → belirsiz.
  expect(gozlemOlustur({ ...temel, senaryoId: 's2', istek: tekIstek, sablon: SABLON, kosuDurumu: 'basarisiz', sonuc: {}, oncekiler: [onceki] })).toMatchObject({ belirsiz: true });
});

const gz = (b: Partial<Gozlem> & { alanlar: Gozlem['alanlar'] }): Gozlem => ({ kaynak: 'kosu', senaryo: 'A', senaryoId: 's1', zaman: '2026-10-03T10:00:00.000Z', durum: 'basarili', ...b });
const TABLOLAR = [
  { id: 't1', ad: 'Giriş', sutunlar: [{ ad: 'Kanal' }], satirlar: [{ degerler: { Kanal: '5' } }] },
  { id: 't2', ad: 'Bayi', sutunlar: [{ ad: 'Kullanıcı' }], satirlar: [{ degerler: { 'Kullanıcı': '51234001' } }] }
];

test('öneriler: değer ekle (≥ 2 başarılı koşu güçlü), şüpheli değer eklenmez, belirsiz yok sayılır, bağsız alana eşleşme, boş zorunlu → isteğe bağlı', () => {
  const gozlemler = [
    gz({ senaryo: 'A', alanlar: { 'Girdi/Kanal': { d: 'dolu', v: '7' }, 'Girdi/Username': { d: 'dolu', v: '51234001' }, 'Girdi/Not': { d: 'bos' } } }),
    gz({ senaryo: 'B', zaman: '2026-10-03T11:00:00.000Z', alanlar: { 'Girdi/Kanal': { d: 'dolu', v: '7' }, 'Girdi/Kanal2': { d: 'dolu' } } }),
    gz({ senaryo: 'A', alanlar: { 'Girdi/Kanal': { d: 'dolu', v: '9' }, 'Girdi/Not': { d: 'dolu', v: 'x' } } }),
    gz({ senaryo: 'C', durum: 'hata', supheli: ['Girdi/Kod'], zayif: true, alanlar: { 'Girdi/Kanal': { d: 'dolu', v: '11' }, 'Girdi/Kod': { d: 'dolu', v: 'K9' } } }),
    gz({ senaryo: 'D', durum: 'hata', belirsiz: true, alanlar: { 'Girdi/Kanal': { d: 'dolu' } } })
  ];
  const o = kosuOnerileri({ metot: 'Islem', sema: SEMA, gozlemler, tablolar: TABLOLAR,
    mevcut: { zorunlu: ['Girdi/Not'], baglar: { 'Girdi/Kanal': { tablo: 't1', sutun: 'Kanal' } } } });
  // Satır bütünlüğü: tablo başına tek kart, koşu başına satır (aynı değer kümesi tek satır, kanıt sayacı artar).
  expect(o.some((x) => x.tur === 'tabloyaDeger')).toBe(false);
  const kart = o.find((x) => x.tur === 'tabloyaSatir' && x.yol === '#t1');
  expect(kart).toMatchObject({ guc: 'zayif', baslik: 'Giriş tablosuna 3 satır eklensin mi' });
  const satirlar = (kart?.deger as TabloSatiriOnerisi).satirlar;
  expect(satirlar.map((x) => [x.ad, x.degerler, x.guclu, x.kanit])).toEqual([
    ['A', { Kanal: '7' }, true, '2 başarılı koşuda görüldü: A, B (son: 2026-10-03 11:00)'],
    ['A (2)', { Kanal: '9' }, false, '1 başarılı koşuda görüldü: A (son: 2026-10-03 10:00)'],
    ['C', { Kanal: '11' }, false, '1 başarısız koşuda (başka alan hatası) görüldü: C (son: 2026-10-03 10:00)']]);
  expect(JSON.stringify(o.filter((x) => x.tur === 'tabloyaSatir'))).not.toContain('K9');
  expect(o.find((x) => x.tur === 'supheli')).toMatchObject({ yol: 'Girdi/Kod', guc: 'not', baslik: 'Hataya yol açmış olabilir' });
  expect(o.find((x) => x.tur === 'supheli')?.kanit).toContain('Değer K9 eklenmedi · hata metni bu alanı anıyor');
  expect(o.find((x) => x.tur === 'tabloBagi')).toMatchObject({ yol: 'Girdi/Username', deger: { tablo: 't2', sutun: 'Kullanıcı' } });
  expect(o.find((x) => x.tur === 'zorunlu')).toMatchObject({ yol: 'Girdi/Not', deger: false, guc: 'guclu' });
  expect(o.find((x) => x.tur === 'celiski' && x.yol === 'Girdi/Not')).toBeDefined();
  // Satır kararı ayrı hatırlanır (yoksayılan satır yeniden çıkmaz); tabloda aynı değerli satır varsa önerilmez.
  const kararli = kosuOnerileri({ metot: 'Islem', sema: SEMA, gozlemler, tablolar: [{ ...TABLOLAR[0], satirlar: [{ degerler: { Kanal: '7' } }] }, TABLOLAR[1]],
    mevcut: { zorunlu: [], baglar: { 'Girdi/Kanal': { tablo: 't1', sutun: 'Kanal' } }, kararlar: { [String(satirlar[1].anahtar)]: 'yoksayildi' } } });
  expect(kararli.filter((x) => x.tur === 'tabloyaSatir').flatMap((x) => (x.deger as TabloSatiriOnerisi).satirlar.map((s) => s.degerler.Kanal))).toEqual(['11']);
  // Senaryodan (sonucu bilinmeyen) gözlem: yalnız bağsız alana zayıf tablo eşleşmesi.
  const sen = kosuOnerileri({ metot: 'Islem', sema: SEMA, tablolar: TABLOLAR, gozlemler: [gz({ kaynak: 'senaryo', durum: 'bilinmiyor', alanlar: { 'Girdi/Username': { d: 'dolu', v: '51234001' }, 'Girdi/Kanal': { d: 'dolu', v: '8' } } })],
    mevcut: { baglar: { 'Girdi/Kanal': { tablo: 't1', sutun: 'Kanal' } } } });
  expect(sen.map((x) => [x.tur, x.yol, x.guc])).toEqual([['tabloBagi', 'Girdi/Username', 'zayif']]);
});

test('satır bütünlüğü (öğrenme): koşu başına tek satır, yalnız o tablonun sütunları; iki tablo → iki kart; şüpheli hücre boş + not; gizli yazılmaz; tablodan gelen değer satır üretmez', () => {
  const tablolar = [
    { id: 'kisi', ad: 'Kişi bilgileri', sutunlar: [{ ad: 'Ad' }, { ad: 'Soyad' }, { ad: 'Vergi no', gizli: true }], satirlar: [{ degerler: { Ad: 'Ayşe', Soyad: 'Demir' } }] },
    { id: 'teslim', ad: 'Teslim', sutunlar: [{ ad: 'Teslim şekli' }], satirlar: [] }
  ];
  const baglar = { 'Girdi/Firstname': { tablo: 'kisi', sutun: 'Ad' }, 'Girdi/Lastname': { tablo: 'kisi', sutun: 'Soyad' }, 'Girdi/TaxNumber': { tablo: 'kisi', sutun: 'Vergi no' },
    'Girdi/Delivery': { tablo: 'teslim', sutun: 'Teslim şekli' }, 'Girdi/Kullanici': { tablo: 'kisi', sutun: 'Ad' } };
  const s1 = { 'Girdi/Firstname': { d: 'dolu', v: 'Ali' }, 'Girdi/Lastname': { d: 'dolu', v: 'Kaya' }, 'Girdi/TaxNumber': { d: 'dolu', v: '1234567890' },
    'Girdi/Delivery': { d: 'dolu', v: 'Kapıda' }, 'Girdi/Serbest': { d: 'dolu', v: 'serbest-metin' } } as Gozlem['alanlar'];
  const gozlemler = [
    gz({ senaryo: 'S1', senaryoId: 's1', alanlar: s1 }),
    gz({ senaryo: 'S1', senaryoId: 's1', zaman: '2026-10-03T12:00:00.000Z', alanlar: s1 }),
    // Hata metni Lastname'i anıyor: Soyad hücresi boş kalır, satırın geri kalanı (zayıf) yine önerilir.
    gz({ senaryo: 'S2', senaryoId: 's2', durum: 'hata', zayif: true, supheli: ['Girdi/Lastname'], alanlar: { 'Girdi/Firstname': { d: 'dolu', v: 'Veli' }, 'Girdi/Lastname': { d: 'dolu', v: 'Bey' } } }),
    // Tabloda aynı değerli satır var: önerilmez. Tablodan seçilen değer (v yok) satır üretmez.
    gz({ senaryo: 'S3', senaryoId: 's3', alanlar: { 'Girdi/Firstname': { d: 'dolu', v: 'Ayşe' }, 'Girdi/Lastname': { d: 'dolu', v: 'Demir' } } }),
    gz({ senaryo: 'S4', senaryoId: 's4', alanlar: { 'Girdi/Kullanici': { d: 'dolu' } } })
  ];
  const o = kosuOnerileri({ metot: 'Islem', gozlemler, tablolar, mevcut: { baglar } });
  const kartlar = o.filter((x) => x.tur === 'tabloyaSatir');
  expect(kartlar.map((x) => [x.yol, x.baslik, x.guc])).toEqual([
    ['#kisi', 'Kişi bilgileri tablosuna 2 satır eklensin mi', 'zayif'], ['#teslim', 'Teslim tablosuna 1 satır eklensin mi', 'guclu']]);
  const kisi = kartlar[0].deger as TabloSatiriOnerisi;
  expect(kisi.satirlar.map((x) => [x.ad, x.degerler, x.guclu])).toEqual([['S1', { Ad: 'Ali', Soyad: 'Kaya' }, true], ['S2', { Ad: 'Veli' }, false]]);
  expect(kisi.satirlar[1].kanit).toContain('Soyad: Lastname hataya yol açmış olabilir, hücre boş');
  expect(kisi.gizliSutunlar).toEqual(['Vergi no']);
  expect((kartlar[1].deger as TabloSatiriOnerisi).satirlar.map((x) => [x.ad, x.degerler])).toEqual([['S1', { 'Teslim şekli': 'Kapıda' }]]);
  // Diğer parametreler (bağsız "Serbest") ve gizli değer hiçbir satıra yazılmaz.
  expect(JSON.stringify(kartlar)).not.toContain('serbest-metin');
  expect(JSON.stringify(kartlar)).not.toContain('1234567890');
  expect(kartlar[0].kosuKaniti).toMatchObject({ basarili: 2, senaryolar: ['S1', 'S2'] });
  // Uygulanınca kayıt yeni biçimde ({ tablo, satirlar }); satır kararları da yazılır, kart yeniden çıkmaz.
  const d: AnalizDurumu = { zorunlu: new Set(), baglar: {}, varsayilanlar: {}, kurallar: {}, ekler: [], kararlar: {}, yeniTablolar: [], tabloDegerleri: [] };
  oneriyiUygula(d, kartlar[0]);
  expect(d.tabloDegerleri).toEqual([{ tablo: 'kisi', satirlar: [{ ad: 'S1', degerler: { Ad: 'Ali', Soyad: 'Kaya' } }, { ad: 'S2', degerler: { Ad: 'Veli' } }] }]);
  expect(kosuOnerileri({ metot: 'Islem', gozlemler, tablolar, mevcut: { baglar, kararlar: d.kararlar } }).filter((x) => x.tur === 'tabloyaSatir').map((x) => x.yol)).toEqual(['#teslim']);
});

test('gözlem listesi budanır; senaryo gözlemi yenisiyle değişir; öğrenme hatası yakalanır (koşu etkilenmez)', () => {
  let l: Gozlem[] = [];
  for (let i = 0; i < EN_COK_GOZLEM + 5; i++) l = gozlemEkle(l, gz({ kosuId: `k${i}`, alanlar: {} }));
  expect(l).toHaveLength(EN_COK_GOZLEM);
  expect(l[0].kosuId).toBe('k5');
  l = gozlemEkle(gozlemEkle([], gz({ kaynak: 'senaryo', senaryoId: 's1', alanlar: { a: { d: 'dolu', v: '1' } } })), gz({ kaynak: 'senaryo', senaryoId: 's1', alanlar: { a: { d: 'dolu', v: '2' } } }));
  expect(l.map((x) => x.alanlar.a.v)).toEqual(['2']);
  expect(ogrenmeyiCalistir(() => { throw new Error('bozuk'); })).toBe(false);
  expect(ogrenmeyiCalistir(() => undefined)).toBe(true);
});
