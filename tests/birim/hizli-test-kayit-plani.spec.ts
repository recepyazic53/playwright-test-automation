// Hızlı test kayıt planı (saf kurallar): tablo grupları, seçim alanlarının TÜM seçenekleri, senaryo önerileri, önizleme (birleştirme).
import { expect, test } from '@playwright/test';
import { planKur, senaryoOnerileri } from '../../scripts/platform/hizli-test/kayit-plani.mjs';

const alanlar = [
  { anahtar: 'ad', tur: 'text', etiket: 'Ad soyad' },
  { anahtar: 'tel', tur: 'tel', etiket: 'Telefon' },
  { anahtar: 'ulke', tur: 'select', etiket: 'GİDİLECEK ÜLKE', secenekler: [{ deger: 'TR', metin: 'Türkiye' }, { deger: 'DE', metin: 'Almanya' }, { deger: 'FR', metin: 'Fransa' }] },
  { anahtar: 'kanal', tur: 'radio', etiket: 'Kanal', radyolar: [{ deger: 'w', metin: 'Web' }, { deger: 'm', metin: 'Mobil' }] }
];
const degerler = { ad: { deger: 'Ali Veli' }, tel: { deger: '5321234567' }, ulke: { deger: 'DE' } };

test('plan: kişi alanları tek tabloda, seçim alanı kendi tablosunda TÜM seçenekleriyle; değer yazılmayan seçim alanı da liste tablosu olur', () => {
  const p = planKur({ baslik: 'Kayıt', alanlar, degerler });
  expect(p.tablolar.map((t) => t.ad).sort()).toEqual(['GİDİLECEK ÜLKE', 'Kanal', 'Kişi bilgileri']);
  const ulke = p.tablolar.find((t) => t.ad === 'GİDİLECEK ÜLKE');
  expect(ulke?.tur).toBe('liste');
  expect(ulke?.satirlar).toHaveLength(3);
  expect(ulke?.secilen).toEqual({ 'GİDİLECEK ÜLKE': 'Almanya' });
  expect(p.tablolar.find((t) => t.ad === 'Kanal')?.secilen).toBeNull();
  const kisi = p.tablolar.find((t) => t.ad === 'Kişi bilgileri');
  expect(kisi?.tur).toBe('kayit');
  expect(kisi?.sutunlar.map((s) => s.ad)).toEqual(expect.arrayContaining(['Ad soyad', 'Telefon']));
});

test('senaryo önerileri: ilki yapılan senaryo (seçili); seçilen liste alanının diğer seçenekleri seçilmemiş alternatif', () => {
  const p = planKur({ baslik: 'Kayıt', alanlar, degerler });
  const o = senaryoOnerileri(p, 'Kayıt');
  expect(o[0]).toMatchObject({ indeks: 0, baslik: 'Kayıt', varsayilanSecili: true, alt: null });
  expect(o.slice(1).map((x) => x.alt?.deger).sort()).toEqual(['Fransa', 'Türkiye']);
  expect(o.slice(1).every((x) => !x.varsayilanSecili)).toBe(true);
});
