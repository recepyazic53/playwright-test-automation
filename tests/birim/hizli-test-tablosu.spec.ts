// Hızlı test → test verisi tabloları (saf kurallar): elle yazılan değerler anlamlı gruplara ayrılır; aynı gruptaki alanlar tek tabloda,
// diğer her alan kendi tablosunda (tablo ve sütun adı ekrandaki başlık); alanlar ilgili tabloya bağlanır.
import { expect, test } from '@playwright/test';
import { adTemizle, alanGrubu, tabloTaslagiKur } from '../../scripts/platform/hizli-test/test-verisi-tablosu.mjs';

test('ad temizleme: tablo adında yasak karakterler ve sondaki ":" atılır', () => {
  expect(adTemizle('D.TARİHİ')).toBe('D TARİHİ');
  expect(adTemizle('Sayı [adet]: ')).toBe('Sayı adet');
  expect(adTemizle('x'.repeat(80))).toHaveLength(60);
});

test('alan grubu: kişi alanları "Kişi bilgileri", kart alanları "Kart bilgileri", diğerleri kendi başlığıyla kendi tablosu', () => {
  expect(alanGrubu({ tur: 'text', etiket: 'TC KİMLİK NO' })).toEqual({ tablo: 'Kişi bilgileri', sutun: 'Kimlik no' });
  expect(alanGrubu({ tur: 'text', etiket: 'TELEFON' })).toEqual({ tablo: 'Kişi bilgileri', sutun: 'Telefon' });
  expect(alanGrubu({ tur: 'text', etiket: 'D.TARİHİ', kimlik: 'txtDogumTarihi' })).toEqual({ tablo: 'Kişi bilgileri', sutun: 'Doğum tarihi' });
  expect(alanGrubu({ tur: 'text', etiket: 'Kart üzerindeki isim' })).toEqual({ tablo: 'Kart bilgileri', sutun: 'Kart üzerindeki isim' });
  expect(alanGrubu({ tur: 'text', etiket: 'Kart üzerindeki soyisim' })).toEqual({ tablo: 'Kart bilgileri', sutun: 'Kart üzerindeki soyisim' });
  expect(alanGrubu({ tur: 'text', etiket: 'Güvenlik kodu (CVV)' }).tablo).toBe('Kart bilgileri');
  expect(alanGrubu({ tur: 'text', etiket: 'Geçerlilik tarihi' }).tablo).toBe('Kart bilgileri');
  expect(alanGrubu({ tur: 'select-one', etiket: 'GİDİLECEK ÜLKE' })).toEqual({ tablo: 'GİDİLECEK ÜLKE', sutun: 'GİDİLECEK ÜLKE' });
});

test('taslak: gruplara ayrılır; yalnız elle yazılanlar; parola, dosya, boş ve tablo başvurulu alanlar girmez; seçimde görünen metin yazılır', () => {
  const t = tabloTaslagiKur({
    baslik: 'Kurumsal',
    alanlar: [
      { anahtar: 'u', tur: 'select-one', etiket: 'GİDİLECEK ÜLKE', secenekler: [{ deger: '550', metin: 'A.B.D' }, { deger: '551', metin: 'FRANSA' }] },
      { anahtar: 'd', tur: 'text', etiket: 'D.TARİHİ', kimlik: 'txtDogumTarihi' }, { anahtar: 't', tur: 'text', etiket: 'TELEFON' }, { anahtar: 'k', tur: 'text', etiket: 'TC KİMLİK NO' },
      { anahtar: 'i', tur: 'text', etiket: 'Kart üzerindeki isim' }, { anahtar: 'n', tur: 'text', etiket: 'Kart numarası' }, { anahtar: 'c', tur: 'text', etiket: 'Güvenlik kodu (CVV)' },
      { anahtar: 'p', tur: 'password', etiket: 'Parola' }, { anahtar: 'b', tur: 'text', etiket: 'Boş' }, { anahtar: 'x', tur: 'text', etiket: 'Tablodan' }
    ],
    degerler: {
      u: { deger: '550', kaynak: 'elle' }, d: { deger: '13.04.1998', kaynak: 'elle' }, t: { deger: '5426502153', kaynak: 'elle' }, k: { deger: '45520772518', kaynak: 'elle' },
      i: { deger: 'Deneme', kaynak: 'elle' }, n: { deger: '5555', kaynak: 'elle' }, c: { deger: '123', kaynak: 'elle' }, p: { deger: 'gizli', kaynak: 'elle' },
      b: { deger: '  ', kaynak: 'elle' }, x: { deger: '${Kişi.Ad}', kaynak: 'tablo' }
    }
  });
  expect(t?.satirAdi).toBe('Kurumsal');
  expect(t?.tablolar.map((x) => x.tabloAdi)).toEqual(['GİDİLECEK ÜLKE', 'Kişi bilgileri', 'Kart bilgileri']);
  const [ulke, kisi, kart] = t!.tablolar;
  expect(ulke.satir).toEqual({ 'GİDİLECEK ÜLKE': 'A.B.D' });
  // Tek başına duran seçim alanı: liste tablosu; seçilen değil TÜM seçenekler tabloya yazılır ve her biri için sayfa karşılığı eklenir.
  expect(ulke.liste).toEqual({ sutun: 'GİDİLECEK ÜLKE', secenekler: [{ metin: 'A.B.D', kod: '550' }, { metin: 'FRANSA', kod: '551' }] });
  expect(ulke.karsiliklar).toEqual({ 'GİDİLECEK ÜLKE': { 'A.B.D': '550', FRANSA: '551' } });
  expect(kisi.liste).toBeNull();
  expect(kart.liste).toBeNull();
  expect(kisi.sutunlar.map((x) => x.ad)).toEqual(['Doğum tarihi', 'Telefon', 'Kimlik no']);
  expect(kisi.satir).toEqual({ 'Doğum tarihi': '13.04.1998', Telefon: '5426502153', 'Kimlik no': '45520772518' });
  expect(kart.sutunlar.map((x) => [x.ad, x.gizli])).toEqual([['Kart üzerindeki isim', true], ['Kart numarası', true], ['Güvenlik kodu (CVV)', true]]);
  expect(kisi.baglar.t.basvuru).toBe('${Kişi bilgileri.Telefon}');
  expect(ulke.baglar.u.basvuru).toBe('${GİDİLECEK ÜLKE.GİDİLECEK ÜLKE}');
  expect(Object.keys(kisi.baglar).concat(Object.keys(kart.baglar), Object.keys(ulke.baglar)).sort()).toEqual(['c', 'd', 'i', 'k', 'n', 't', 'u']);
});

test('aynı gruptaki aynı türden iki alan ayrışır; taşınacak değer yoksa taslak yok', () => {
  const t = tabloTaslagiKur({
    baslik: 'B', alanlar: [{ anahtar: 'a', tur: 'tel', etiket: 'Telefon' }, { anahtar: 'b', tur: 'tel', etiket: 'Cep telefonu' }],
    degerler: { a: { deger: '1', kaynak: 'elle' }, b: { deger: '2', kaynak: 'elle' } }
  });
  expect(t?.tablolar[0].sutunlar.map((x) => x.ad)).toEqual(['Telefon', 'Telefon 2']);
  expect(tabloTaslagiKur({ baslik: 'B', alanlar: [{ anahtar: 'a', tur: 'text', etiket: 'A' }], degerler: {} })).toBeNull();
});

test('sayı / tarih alanı (kişi / kart dışı) tek sütunlu tablo açmaz; doğum tarihi kişi tablosunda kalır', () => {
  const t = tabloTaslagiKur({
    baslik: 'C',
    alanlar: [{ anahtar: 'a', tur: 'number', etiket: 'Adet' }, { anahtar: 't', tur: 'date', etiket: 'Teslimat tarihi' }, { anahtar: 'd', tur: 'date', etiket: 'Doğum tarihi' }],
    degerler: { a: { deger: '3', kaynak: 'elle' }, t: { deger: '2026-10-05', kaynak: 'elle' }, d: { deger: '1990-01-01', kaynak: 'elle' } }
  });
  expect(t?.tablolar.map((x) => x.tabloAdi)).toEqual(['Kişi bilgileri']);
  expect(t?.tablolar[0].satir).toEqual({ 'Doğum tarihi': '1990-01-01' });
  expect(tabloTaslagiKur({ baslik: 'C', alanlar: [{ anahtar: 'a', tur: 'number', etiket: 'Adet' }], degerler: { a: { deger: '3', kaynak: 'elle' } } })).toBeNull();
});

test('metin kutusuna yazılan tutar / sayı / yıl / tarih tabloya önerilmez; uzun kod ve düz metin kalır', () => {
  const bolum = { anahtar: 'b1', baslik: 'Ana Teminat Bilgileri' };
  const t = tabloTaslagiKur({
    baslik: 'D',
    alanlar: [
      { anahtar: 'a', tur: 'text', etiket: 'Bina (Yangın)', bolum }, { anahtar: 'b', tur: 'text', etiket: 'Cam Kırılması', bolum },
      { anahtar: 'c', tur: 'text', etiket: 'Başlangıç Tarihi', bolum }, { anahtar: 'y', tur: 'text', etiket: 'İnşa Yılı', bolum },
      { anahtar: 'k', tur: 'text', etiket: 'Adres kodu', bolum }, { anahtar: 'm', tur: 'text', etiket: 'Açıklama', bolum }
    ],
    degerler: {
      a: { deger: '1.000.000', kaynak: 'elle' }, b: { deger: '7500', kaynak: 'elle' }, c: { deger: '06.10.2026', kaynak: 'elle' },
      y: { deger: '2026', kaynak: 'elle' }, k: { deger: '1234567890', kaynak: 'elle' }, m: { deger: 'Depo', kaynak: 'elle' }
    }
  });
  expect(t?.tablolar.map((x) => [x.tabloAdi, x.sutunlar.map((s) => s.ad)])).toEqual([['Ana Teminat Bilgileri', ['Adres kodu', 'Açıklama']]]);
});

test('bölümdeki açılır liste bölüm tablosuna girmez: kendi tablosunu tüm seçenekleriyle açar; bölüm tablosunda metin alanları kalır', () => {
  const bolum = { anahtar: 'b1', baslik: 'Poliçe Bilgileri' };
  const t = tabloTaslagiKur({
    baslik: 'E',
    alanlar: [
      { anahtar: 'n', tur: 'text', etiket: 'Not', bolum },
      { anahtar: 'm', tur: 'select-one', etiket: 'İşveren Mali Mesuliyeti', bolum, secenekler: [{ deger: '', metin: 'Lütfen seçiniz...' }, { deger: ' 1', metin: '50000' }, { deger: ' 6', metin: '300000' }] },
      { anahtar: 'a', tur: 'text', etiket: 'Açıklama', bolum }
    ],
    degerler: { n: { deger: 'Depo', kaynak: 'elle' }, m: { deger: ' 6', kaynak: 'elle' }, a: { deger: 'Deneme', kaynak: 'elle' } }
  });
  expect(t?.tablolar.map((x) => [x.tabloAdi, x.sutunlar.map((s) => s.ad), x.liste?.secenekler.map((s) => s.metin) ?? null])).toEqual([
    ['Poliçe Bilgileri', ['Not', 'Açıklama'], null],
    ['İşveren Mali Mesuliyeti', ['İşveren Mali Mesuliyeti'], ['50000', '300000']]
  ]);
  const m = t?.tablolar[1];
  expect(m?.satir).toEqual({ 'İşveren Mali Mesuliyeti': '300000' });
  expect(m?.karsiliklar['İşveren Mali Mesuliyeti']).toMatchObject({ '50000': ' 1', '300000': ' 6' });
});
