// KORUMA TESTLERİ — SQL sorgusu adımı (sql/sql-adimi.mjs; saf): tanım doğrulaması, yer tutucuların sürücü parametresine
// bağlanması (SQL'e metin eklenmez), beklenen sonuç türleri, yeniden deneme, maskeleme, okumalar; ekran akışında blok →
// model adımı → koşu planı (ve geri); servis akışında adım doğrulaması. Gerçek veritabanı YOK: sahte yürütücü.
import { expect, test } from '@playwright/test';
import { sqlAdiminiKos, sqlBagla, sqlTanimiDogrula, type SqlSonucu, type SqlTanimi } from '../../scripts/platform/sql/sql-adimi.mjs';
import { akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { akisIceriginiDogrula } from '../../scripts/platform/servisler/servis-deposu.mjs';

type Nesne = Record<string, any>;
const tanim = (ek: Partial<SqlTanimi> = {}): SqlTanimi => sqlTanimiDogrula({ baglantiId: 'db1', sql: 'SELECT durum, no FROM kayit WHERE no = ${akis:No}', beklenen: { tur: 'bosDegil' }, ...ek }).tanim;

test('tanım: yer tutucu tırnak içindeyse hata; bağlama parametre üretir (değer SQL metnine girmez)', () => {
  expect(sqlTanimiDogrula({ baglantiId: 'db1', sql: "SELECT 1 FROM t WHERE a = '${akis:No}'", beklenen: { tur: 'bos' } }).hatalar[0]).toContain('tırnak');
  expect(sqlTanimiDogrula({ sql: '', beklenen: { tur: 'x' } }).hatalar).toEqual(['Veritabanı bağlantısını seçin.', 'SQL sorgusunu yazın.', 'Beklenen sonucu seçin.']);
  const b = sqlBagla("SELECT * FROM t WHERE a = ${akis:No} AND b = ${musteriNo} AND c = ${akis:No} AND d = '${x}'", (i) => ({ 'akis:No': "1' OR '1'='1", musteriNo: '42' } as Record<string, string>)[i]);
  expect(b.sql).toBe("SELECT * FROM t WHERE a = :nb1 AND b = :nb2 AND c = :nb1 AND d = '${x}'");
  expect(b.parametreler).toEqual({ nb1: "1' OR '1'='1", nb2: '42' });
  expect(b.eksikler).toEqual([]);
});

test('koşu: geçti / kaldı (Beklenen / Görülen), okuma, gizli sütun maskeli, sorgu hatası, yeniden deneme', async () => {
  const cagrilar: Array<{ sql: string; p: Record<string, string> }> = [];
  const sonuclar: SqlSonucu[] = [];
  const yurutucu = async (sql: string, p: Record<string, string>): Promise<SqlSonucu> => { cagrilar.push({ sql, p }); return sonuclar.shift() ?? { sutunlar: [], satirlar: [] }; };
  const coz = (i: string): string | undefined => (i === 'akis:No' ? '7' : undefined);
  const ortak = { adimAdi: 'Kayıt yazıldı', yurutucu, coz, gizliSutunMu: (ad: string) => /token/i.test(ad) };

  sonuclar.push({ sutunlar: ['DURUM', 'NO', 'TOKEN'], satirlar: [['ONAY', 7, 'gizli-deger']] });
  const r1 = await sqlAdiminiKos(tanim({ beklenen: { tur: 'sutunDegeri', sutun: 'durum', deger: 'ONAY' }, okumalar: [{ ad: 'KayitNo', sutun: 'NO' }] }), ortak);
  expect(r1).toMatchObject({ durum: 'basarili', okunanlar: { KayitNo: '7' }, deneme: 1 });
  expect(cagrilar[0]).toEqual({ sql: 'SELECT durum, no FROM kayit WHERE no = :nb1', p: { nb1: '7' } });
  expect(r1.ozet?.satirlar).toEqual([['ONAY', '7', '••••••']]);

  sonuclar.push({ sutunlar: ['DURUM'], satirlar: [['RED']] });
  const r2 = await sqlAdiminiKos(tanim({ beklenen: { tur: 'sutunDegeri', sutun: 'DURUM', deger: 'ONAY' } }), ortak);
  expect(r2.durum).toBe('basarisiz');
  expect(r2.mesaj).toBe('Kayıt yazıldı adımında beklenen sonuç doğrulanamadı.\nBeklenen: "ilk satırda DURUM = "ONAY"" — Görülen: "ilk satırda DURUM = "RED""');

  const r3 = await sqlAdiminiKos(tanim(), { ...ortak, yurutucu: async () => { throw new Error('bağlantı reddedildi'); } });
  expect(r3).toMatchObject({ durum: 'hata', deneme: 1 });
  expect(r3.mesaj).toContain('bağlantı reddedildi');

  // Veri geç yazılıyor: ilk iki sorgu boş, üçüncüde 2 satır (yeniden deneme 10 sn / 2 sn; sahte saat).
  let saat = 0;
  sonuclar.push({ sutunlar: ['NO'], satirlar: [] }, { sutunlar: ['NO'], satirlar: [] }, { sutunlar: ['NO'], satirlar: [[1], [2]] });
  const r4 = await sqlAdiminiKos(tanim({ beklenen: { tur: 'satirSayisi', deger: 2 }, yenidenDeneme: { sureSn: 10, aralikSn: 2 } }),
    { ...ortak, simdi: () => saat, bekle: async (ms) => { saat += ms; } });
  expect(r4).toMatchObject({ durum: 'basarili', deneme: 3 });

  sonuclar.push({ sutunlar: ['NO', 'DURUM'], satirlar: [[1, 'A'], [2, 'B']] });
  const r5 = await sqlAdiminiKos(tanim({ beklenen: { tur: 'tabloEsit', sutunlar: ['NO', 'DURUM'], satirlar: [['1', 'A'], ['2', 'C']] } }), ortak);
  expect(r5.durum).toBe('basarisiz');
  expect(r5.mesaj).toContain('Görülen: "2 satır: 1 | A; 2 | B"');

  const r6 = await sqlAdiminiKos(tanim({ sql: 'SELECT 1 FROM t WHERE a = ${bilinmeyen}' }), ortak);
  expect(r6).toMatchObject({ durum: 'hata', deneme: 0 });
});

const alan = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Kayıt' }
});
const ENV: AkisEnvanteri = {
  kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Kayıt', alanlar: [{ alan: alan('#no', 'Kayıt no'), secili: true }],
  dugmeler: [{ secici: '#kaydet', metin: 'Kaydet' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
};
const META = { ekranAnahtari: 'kayit', ekranAdi: 'Kayıt', urlYolu: '/kayit/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };

test('ekran akışı: SQL bloğu kendi adımı olur (son beklenen mesaj ekran adımında), modelden geri döner, koşu planında sql', () => {
  const sql = { baglantiId: 'db1', sql: 'SELECT durum FROM kayit WHERE no = ${no}', beklenen: { tur: 'sutunDegeri', sutun: 'durum', deger: 'ONAY' } };
  const { envanter: k, hatalar } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Kayıt', alanlar: ['#no'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'sql', ad: 'Veritabanına yazıldı', sql },
    { tur: 'mesaj', mesaj: null, metin: 'Kaydedildi' },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => [a.baslik, a.kosu?.basariGostergesi ?? null, a.sqlKontrolu?.beklenen?.tur ?? null])).toEqual([
    ['Kayıt', { tur: 'metin', deger: 'Kaydedildi' }, null],
    ['Veritabanına yazıldı', null, 'sutunDegeri']
  ]);
  expect(adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)).map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'mesaj', 'sql', 'bitir']);
  const plan = modelKosuPlani(m, {});
  expect(plan.adimlar[1]).toMatchObject({ baslik: 'Veritabanına yazıldı', sql: { baglantiId: 'db1' }, sonAdim: true });
  // Aksiyonsuz alan grubundan hemen sonra SQL olmaz; SQL'den sonra bekleme konmaz.
  expect(akistanKayitEnvanteri(ENV, [{ tur: 'alanlar', ad: 'Kayıt', alanlar: ['#no'], zorunlu: [] }, { tur: 'sql', ad: '', sql }, { tur: 'bitir' }]).hatalar[0].mesaj).toContain('aksiyondan');
  expect(akistanKayitEnvanteri(ENV, [{ tur: 'alanlar', ad: 'Kayıt', alanlar: ['#no'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'sql', ad: '', sql }, { tur: 'bekle', saniye: 2 }, { tur: 'bitir' }]).hatalar[0].mesaj).toContain('yeniden dene');
});

test('servis akışı: SQL adımı doğrulanır (servis / senaryo istemez); oturum akışında SQL okuması sayılır', () => {
  const icerik = akisIceriginiDogrula({ adimlar: [{ ad: 'Kontrol', tur: 'sql', sql: { baglantiId: 'db1', sql: 'SELECT token FROM oturum', beklenen: { tur: 'bosDegil' }, okumalar: [{ ad: 'Token', sutun: 'token' }] } }] }, 'oturum');
  expect(icerik.adimlar[0]).toMatchObject({ tur: 'sql', okumalar: [], sql: { baglantiId: 'db1', okumalar: [{ ad: 'Token', sutun: 'token' }] } });
  expect(() => akisIceriginiDogrula({ adimlar: [{ ad: 'X', tur: 'sql', sql: { baglantiId: 'db1', sql: '', beklenen: { tur: 'bos' } } }] }, 'akis')).toThrow('SQL sorgusunu yazın');
});

test('tanım: mantıksal veritabanı (veritabaniId) ya da doğrudan bağlantı (baglantiId, eski) — ikisinden yalnız biri', () => {
  const temel = { sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } };
  const v = sqlTanimiDogrula({ ...temel, veritabaniId: 'vt-1' });
  expect(v.hatalar).toEqual([]);
  expect(v.tanim).toEqual({ veritabaniId: 'vt-1', sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } });
  expect(sqlTanimiDogrula({ ...temel, baglantiId: 'db1' }).tanim).toEqual({ baglantiId: 'db1', sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } });
  expect(sqlTanimiDogrula({ ...temel, veritabaniId: 'vt-1', baglantiId: 'db1' }).hatalar).toEqual(['Veritabanı ya da doğrudan bağlantıdan yalnız birini seçin.']);
  expect(sqlTanimiDogrula({ ...temel, veritabaniId: 'geçersiz kimlik' }).hatalar).toEqual(['Veritabanı bağlantısını seçin.']);
  // Ekran akışı: veritabanlı SQL bloğu modele (sqlKontrolu) ve koşu planına aynen geçer; model doğrulayıcı kabul eder.
  const { envanter: k, hatalar } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Kayıt', alanlar: ['#no'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'sql', ad: 'Veritabanına yazıldı', sql: { veritabaniId: 'vt-1', ...temel } },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar[1].sqlKontrolu).toEqual({ veritabaniId: 'vt-1', sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } });
  expect(modelKosuPlani(m, {}).adimlar[1]).toMatchObject({ sql: { veritabaniId: 'vt-1' } });
  // Servis akışı adımı da kabul eder.
  expect(akisIceriginiDogrula({ adimlar: [{ ad: 'K', tur: 'sql', sql: { veritabaniId: 'vt-1', ...temel } }] }, 'akis').adimlar[0]).toMatchObject({ sql: { veritabaniId: 'vt-1' } });
});
