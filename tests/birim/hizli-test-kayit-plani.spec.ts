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
  expect(o.slice(1).map((x) => x.alt?.degisiklikler.map((d) => d.deger).join()).sort()).toEqual(['Fransa', 'Türkiye']);
  expect(o.slice(1).every((x) => !x.varsayilanSecili)).toBe(true);
});

test('senaryo önerileri: bağlı listeler gözlenen geçerli yolla BİRLİKTE değişir (il değişip ilçe eski kalmaz); diğer seçimler farklı değerlerle; her aday en az bir kez', () => {
  const s = (deger: string, metin = deger) => ({ deger, metin });
  const alanlar2: Array<Record<string, any>> = [
    { anahtar: 'il', tur: 'select', etiket: 'İl', secenekler: [s('', 'Seçiniz'), s('01', 'Adana'), s('06', 'Ankara'), s('34', 'İstanbul')] },
    { anahtar: 'ilce', tur: 'select', etiket: 'İlçe', secenekler: [s('0601', 'Çankaya'), s('0602', 'Keçiören')] },
    { anahtar: 'mah', tur: 'select', etiket: 'Mahalle', secenekler: [s('Etlik')] },
    { anahtar: 'tip', tur: 'radio', etiket: 'Müşteri tipi', hazir: true, mevcut: 'Bireysel', radyolar: [s('B', 'Bireysel'), s('K', 'Kurumsal')] },
    { anahtar: 'vergi', tur: 'text', etiket: 'Vergi no', kosul: { secim: 'tip', degerler: ['K'] } },
    { anahtar: 'yapi', tur: 'select', etiket: 'Yapı', hazir: true, mevcut: 'Kagir', secenekler: [s('k', 'Kagir'), s('b', 'Betonarme'), s('c', 'Çelik')] }
  ];
  const gozlemler: Array<{ anahtar: string; secimler: Record<string, string>; secenekler: Array<{ deger: string; metin: string }> }> = [
    { anahtar: 'ilce', secimler: { il: '01' }, secenekler: [s('0101', 'Seyhan'), s('0102', 'Çukurova')] },
    { anahtar: 'mah', secimler: { il: '01', ilce: '0101' }, secenekler: [s('Reşatbey')] },
    { anahtar: 'ilce', secimler: { il: '34' }, secenekler: [s('3401', 'Kadıköy')] },
    { anahtar: 'mah', secimler: { il: '34', ilce: '3401' }, secenekler: [s('Moda')] },
    { anahtar: 'mah', secimler: { il: '06', ilce: '0602' }, secenekler: [s('Etlik')] }
  ];
  // Tablolarda zincirin gözlenen seçenekleri de bulunur (hızlı test planı kurarken ekler).
  const ekli = alanlar2.map((a) => a.anahtar === 'ilce' ? { ...a, secenekler: [...a.secenekler, s('0101', 'Seyhan'), s('0102', 'Çukurova'), s('3401', 'Kadıköy')] }
    : a.anahtar === 'mah' ? { ...a, secenekler: [...a.secenekler, s('Reşatbey'), s('Moda')] } : a);
  const p = planKur({ baslik: 'Adres', alanlar: ekli, degerler: { il: { deger: '06' }, ilce: { deger: '0602' }, mah: { deger: 'Etlik' } } });
  const o = senaryoOnerileri(p, 'Adres', { enCok: 5, alanlar: ekli, iliskiler: [{ ust: 'il', alt: 'ilce' }, { ust: 'ilce', alt: 'mah' }], gozlemler, degerler: { il: '06', ilce: '0602', mah: 'Etlik' } });
  const degisim = (x: (typeof o)[number]) => Object.fromEntries((x.alt?.degisiklikler ?? []).map((d) => [d.oturumAnahtar, d.deger]));
  // 1. öneri: Adana yolu (il + ilçe + mahalle birlikte) + Yapı'nın başka değeri; Müşteri tipi "Kurumsal" önerilmez (değeri girilmemiş Vergi no açılırdı).
  expect(o.slice(1).map(degisim)).toEqual([
    { il: 'Adana', ilce: 'Seyhan', mah: 'Reşatbey', yapi: 'Betonarme' },
    { il: 'İstanbul', ilce: 'Kadıköy', mah: 'Moda', yapi: 'Çelik' }
  ]);
  // Hiçbir öneride il, ilçesi ve mahallesi olmadan değişmez.
  for (const x of o.slice(1)) { const d = degisim(x); if (d.il) expect(d.ilce && d.mah).toBeTruthy(); }
  expect(o[1].baslik).toBe('Adres — İl: Adana / Seyhan / Reşatbey · Yapı: Betonarme');
});
