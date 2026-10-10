// KORUMA TESTLERİ — "Modeli güncelle" karşılaştırmasında yeni / kaldırılan seçeneğin bağlı test verisi tablosuna da yansıtılması
// (tablolar/secenek-tablosu.mjs): öneri (uygulanabilir mi, neden) ve yazma (yeni seçenek satır + karşılık; kalkan seçeneğin satırları silinir).
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { secenekleriTabloyaYaz, tabloOnerisi } from '../../scripts/platform/tablolar/secenek-tablosu.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('yeni seçenek tabloya satır (ve karşılık) olur; kalkan seçeneğin satırı silinir; uygulanamaz durumlarda neden', async () => {
  const klasor = geciciKlasor('secenek-tablosu');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Secenek-Tablosu-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Seçenek' });
    const ulke = tabloKaydet(vt, { projeId, ad: 'Form — Ülke', sutunlar: [{ ad: 'Ülke' }], satirlar: [{ degerler: { Ülke: 'FRANSA' } }, { degerler: { Ülke: 'İTALYA' } }], tur: 'liste' });
    const gizli = tabloKaydet(vt, { projeId, ad: 'Gizli kod', sutunlar: [{ ad: 'Kod', gizli: true }], satirlar: [], tur: 'liste' });
    const iki = tabloKaydet(vt, { projeId, ad: 'Form — İl / İlçe', sutunlar: [{ ad: 'İl' }, { ad: 'İlçe' }], satirlar: [{ degerler: { İl: 'İSTANBUL', İlçe: 'KADIKÖY' } }] });
    const tablolar = () => tablolariListele(vt, projeId) as unknown as Parameters<typeof tabloOnerisi>[1];
    const baglar = { ulke: { tablo: ulke, sutun: 'Ülke' }, ilce: { tablo: iki, sutun: 'İlçe' }, kosullu: { tablo: ulke, sutun: 'Ülke', secimeGore: { alan: 'x', degerler: { a: { tablo: iki, sutun: 'İl' } } } },
      kayip: { tablo: 'silinmis-tablo', sutun: 'Ülke' }, sutunsuz: { tablo: ulke, sutun: 'Kıta' }, gizli: { tablo: gizli, sutun: 'Kod' } };
    const yeni = { id: 'b1', tur: 'yeniSecenek', alanId: 'ulke', secenek: { deger: 'DE', metin: 'ALMANYA' } };
    const kalkan = { id: 'b2', tur: 'kaldirilanSecenek', alanId: 'ulke', secenek: { deger: 'IT', metin: 'İTALYA' } };
    expect(tabloOnerisi(baglar, tablolar(), yeni)).toMatchObject({ islem: 'ekle', tabloAd: 'Form — Ülke', sutun: 'Ülke', uygulanabilir: true });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'yok' })).toBeNull();
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, tur: 'yeniAlan' })).toBeNull();
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'ilce' })).toMatchObject({ uygulanabilir: false, nedenKodu: 'cokSutun', neden: expect.stringContaining('birden çok sütun') });
    expect(tabloOnerisi(baglar, tablolar(), { ...kalkan, alanId: 'ilce' })).toMatchObject({ uygulanabilir: true });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'kosullu' })).toMatchObject({ uygulanabilir: false, nedenKodu: 'secimeGore', neden: expect.stringContaining('seçime göre') });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'kayip' })).toMatchObject({ uygulanabilir: false, nedenKodu: 'tabloYok', tabloAd: 'silinmis-tablo' });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'sutunsuz' })).toMatchObject({ uygulanabilir: false, nedenKodu: 'sutunYok', neden: 'tabloda "Kıta" sütunu yok' });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'gizli' })).toMatchObject({ uygulanabilir: false, nedenKodu: 'sutunGizli', tabloAd: 'Gizli kod', sutun: 'Kod' });

    const oneriler = [tabloOnerisi(baglar, tablolar(), yeni)!, tabloOnerisi(baglar, tablolar(), kalkan)!];
    expect(secenekleriTabloyaYaz(vt, projeId, tablolar(), oneriler)).toEqual({ eklenen: 1, silinen: 1, sonuclar: { b1: { durum: 'eklendi' }, b2: { durum: 'silindi', satir: 1 } } });
    const t = tablolariListele(vt, projeId).find((x) => x.id === ulke)!;
    expect(t.satirlar.map((r) => r.degerler.Ülke).sort()).toEqual(['ALMANYA', 'FRANSA']);
    expect(t.sutunlar[0].karsiliklar).toMatchObject({ ALMANYA: { sayfa: 'DE' } });
    // Tekrar yazmak yinelenen satır üretmez (zaten var / zaten yok).
    expect(secenekleriTabloyaYaz(vt, projeId, tablolar(), [tabloOnerisi(baglar, tablolar(), yeni)!, tabloOnerisi(baglar, tablolar(), kalkan)!]))
      .toEqual({ eklenen: 0, silinen: 0, sonuclar: { b1: { durum: 'zatenVardi' }, b2: { durum: 'zatenYoktu' } } });
  } finally { vt.kapat(); klasor.temizle(); }
});

test('tablo notu: uygulanabilir (karar öncesi / sonrası) ve her uygulanamaz neden için sade cümle; tablo ve sütun adıyla', async () => {
  const { secenekTabloNotu } = await import('../../scripts/platform/arayuz/secenek-tablo-notu.mjs');
  const o = { tabloAd: 'Kişi', sutun: 'Ülke', islem: 'ekle' as const, uygulanabilir: true };
  const k = { ...o, islem: 'cikar' as const };
  // Karar öncesi (uygulanabilir).
  expect(secenekTabloNotu(o, { secili: true })).toBe('Kabul ederseniz "Kişi" tablosunun "Ülke" sütununa satır olarak eklenecek.');
  expect(secenekTabloNotu(o, { secili: true, sayi: 181 })).toBe('Kabul ederseniz 181 değer "Kişi" tablosunun "Ülke" sütununa satır olarak eklenecek.');
  expect(secenekTabloNotu(o, { secili: false })).toBe('Tabloya eklenmeyecek (işaret kaldırıldı); kabul ederseniz yalnız ekran modeli güncellenir.');
  expect(secenekTabloNotu(k, { secili: true })).toBe('Kabul ederseniz bu değeri taşıyan satırlar "Kişi" tablosundan silinecek ("Ülke" sütunu).');
  // Uygulandıktan sonra: yalnız gerçekten yazıldıysa "eklendi".
  const u = { uygulandi: true, karar: 'kabul', kayitli: true };
  expect(secenekTabloNotu(o, { ...u, sonuc: { durum: 'eklendi' } })).toBe('"Kişi" tablosunun "Ülke" sütununa satır olarak eklendi.');
  expect(secenekTabloNotu(o, { ...u, sonuc: { durum: 'zatenVardi' } })).toBe('"Kişi" tablosunun "Ülke" sütununda bu değer zaten vardı; yeni satır eklenmedi.');
  expect(secenekTabloNotu(o, { ...u, sonuc: null })).toBe('Tabloya eklenmedi (seçilmemişti); yalnız ekran modeli güncellendi.');
  expect(secenekTabloNotu(k, { ...u, sonuc: { durum: 'silindi', satir: 2 } })).toBe('"Kişi" tablosundan 2 satır silindi ("Ülke" sütunu).');
  expect(secenekTabloNotu(k, { ...u, sonuc: { durum: 'zatenYoktu' } })).toBe('"Kişi" tablosunun "Ülke" sütununda bu değer yoktu; silinecek satır olmadı.');
  expect(secenekTabloNotu(o, { ...u, kayitli: false })).toBe('Tabloya yazılıp yazılmadığı bu kayıtta yok; Test verisi > "Kişi" tablosundan kontrol edin.');
  expect(secenekTabloNotu(o, { uygulandi: true, karar: 'red' })).toBe('Kabul edilmediği için "Kişi" tablosu değişmedi.');
  // Uygulanamaz nedenler (karar öncesi ve sonrası).
  const olmaz = (nedenKodu: string, islem: 'ekle' | 'cikar' = 'ekle') => ({ ...o, islem, uygulanabilir: false, nedenKodu });
  expect(secenekTabloNotu(olmaz('cokSutun'))).toBe('Tabloya eklenmeyecek: "Kişi" tablosunda birden çok sütun var. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Bu değerle test etmek isterseniz satırı Test verisi > "Kişi" tablosuna ekleyin ("Ülke" sütunu).');
  expect(secenekTabloNotu(olmaz('cokSutun'), { uygulandi: true, karar: 'kabul', kayitli: true })).toBe('Tabloya eklenmedi: "Kişi" tablosunda birden çok sütun var. Yalnız ekran modeli güncellendi. '
    + 'Bu değerle test etmek isterseniz satırı Test verisi > "Kişi" tablosuna ekleyin ("Ülke" sütunu).');
  expect(secenekTabloNotu(olmaz('cokSutun'), { sayi: 3 })).toContain('Bu değerlerle test etmek isterseniz satırları Test verisi > "Kişi" tablosuna ekleyin');
  expect(secenekTabloNotu(olmaz('secimeGore'))).toBe('Tabloya eklenmeyecek: bu alanın tablosu başka bir alandaki seçime göre değişiyor (varsayılan: "Kişi" tablosu, "Ülke" sütunu). '
    + 'Kabul ederseniz yalnız ekran modeli güncellenir. Bu değerle test etmek isterseniz satırı Test verisi\'nde uygun tabloya ekleyin.');
  expect(secenekTabloNotu(olmaz('tabloYok'))).toBe('Tabloya eklenmeyecek: alanın bağlı olduğu "Kişi" tablosu bulunamadı. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Alanın tablo bağını ekran sayfasının "Test verisi" sekmesinden kontrol edin.');
  expect(secenekTabloNotu(olmaz('baglamTablosu'))).toContain('"Kişi" bir bağlam profili tablosu; seçenekler oraya otomatik yazılmaz.');
  expect(secenekTabloNotu(olmaz('sutunYok'))).toBe('Tabloya eklenmeyecek: "Kişi" tablosunda "Ülke" sütunu yok. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Sütunu Test verisi > "Kişi" tablosuna ekleyin ya da alanın bağını düzeltin.');
  expect(secenekTabloNotu(olmaz('sutunGizli'))).toBe('Tabloya eklenmeyecek: "Kişi" tablosunun "Ülke" sütunu gizli; gizli sütuna otomatik yazılmaz. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Bu değerle test etmek isterseniz satırı Test verisi > "Kişi" tablosuna ekleyin ("Ülke" sütunu).');
  // Kaldırılan seçenek (uygulanamaz).
  expect(secenekTabloNotu(olmaz('sutunGizli', 'cikar'))).toBe('Tablodan silinmeyecek: "Kişi" tablosunun "Ülke" sütunu gizli; gizli sütuna otomatik yazılmaz. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Bu değeri taşıyan satırlar varsa Test verisi > "Kişi" tablosundan silin ("Ülke" sütunu).');
  expect(secenekTabloNotu(olmaz('secimeGore', 'cikar'), { uygulandi: true, karar: 'kabul', kayitli: true })).toContain('Tablodan silinmedi: bu alanın tablosu');
});
