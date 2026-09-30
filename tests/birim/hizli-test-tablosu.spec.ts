// Hızlı test → test verisi tablosu (saf kurallar): elle yazılan değerler tabloya, sütun adı ekrandaki alan başlığı; alanlar tabloya bağlanır.
import { expect, test } from '@playwright/test';
import { adTemizle, tabloTaslagiKur } from '../../scripts/platform/hizli-test/test-verisi-tablosu.mjs';

test('ad temizleme: tablo adında yasak karakterler ve sondaki ":" atılır', () => {
  expect(adTemizle('D.TARİHİ')).toBe('D TARİHİ');
  expect(adTemizle('Sayı [adet]: ')).toBe('Sayı adet');
  expect(adTemizle('x'.repeat(80))).toHaveLength(60);
});

test('taslak: yalnız elle yazılan değerler; parola, dosya, boş ve tablo başvurulu alanlar girmez; aynı başlıklar ayrışır', () => {
  const t = tabloTaslagiKur({
    ekranAdi: 'Deneme ekranı', baslik: 'Kurumsal',
    alanlar: [
      { anahtar: 'a', tur: 'text', etiket: 'Ad soyad' }, { anahtar: 'b', tur: 'text', etiket: 'D.TARİHİ' }, { anahtar: 'c', tur: 'text', etiket: 'Ad soyad' },
      { anahtar: 'd', tur: 'password', etiket: 'Parola' }, { anahtar: 'e', tur: 'text', etiket: 'Boş' }, { anahtar: 'f', tur: 'text', etiket: 'Tablodan' },
      { anahtar: 'g', tur: 'text', etiket: 'Güvenlik kodu (CVV)' }, { anahtar: 'h', tur: 'text', ad: 'isim' }
    ],
    degerler: {
      a: { deger: 'Deneme Kişi', kaynak: 'elle' }, b: { deger: '13.04.1998', kaynak: 'elle' }, c: { deger: 'Başka', kaynak: 'elle' }, d: { deger: 'gizli', kaynak: 'elle' },
      e: { deger: '  ', kaynak: 'elle' }, f: { deger: '${Kişi.Ad soyad}', kaynak: 'tablo' }, g: { deger: '123', kaynak: 'elle' }, h: { deger: 'x', kaynak: 'elle' }
    }
  });
  expect(t?.tabloAdi).toBe('Deneme ekranı · Kurumsal');
  expect(t?.sutunlar.map((x) => x.ad)).toEqual(['Ad soyad', 'D TARİHİ', 'Ad soyad 2', 'Güvenlik kodu (CVV)', 'isim']);
  expect(t?.sutunlar.find((x) => x.ad.startsWith('Güvenlik'))?.gizli).toBe(true);
  expect(t?.satir).toMatchObject({ 'Ad soyad': 'Deneme Kişi', 'D TARİHİ': '13.04.1998', 'Ad soyad 2': 'Başka' });
  expect(t?.baglar.a.basvuru).toBe('${Deneme ekranı · Kurumsal.Ad soyad}');
  expect(Object.keys(t?.baglar ?? {}).sort()).toEqual(['a', 'b', 'c', 'g', 'h']);
});

test('taşınacak değer yoksa taslak yok', () => {
  expect(tabloTaslagiKur({ ekranAdi: 'E', baslik: 'B', alanlar: [{ anahtar: 'a', tur: 'text', etiket: 'A' }], degerler: {} })).toBeNull();
});
