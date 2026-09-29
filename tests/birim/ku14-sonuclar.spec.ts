// KORUMA (saf fonksiyonlar, ağ yok) — v1.4 Sonuçlar düzeltmeleri: Genel trendi yalnız "Genel" kapsamlı tam koşuları sayar,
// tumKapsamlar seçeneği ekran kapsamlıları da verir (trend boşken "ekran koşuları: N" açıklaması için); sonuç kaydındaki beklenen
// sonuç metni başarılı akışta adım adı değil son adımın başarı göstergesidir, iş kuralı hatasında adım + mesaj.
import { expect, test } from '@playwright/test';
import { trendHesapla } from '../../scripts/platform/sonuclar/hesaplama.mjs';
import { beklenenSonucMetni, formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';

const sayilar = (basarili: number, basarisiz: number) => ({ basarili, basarisiz, atlanan: 0, durduruldu: 0 });
const KOSULAR = [
  { id: 'k1', z: 1, tur: 'tam', kapsam: 'Başvuru', urunler: { 'id:e1': sayilar(5, 1) } },
  { id: 'k2', z: 2, tur: 'tam', kapsam: 'Başvuru', urunler: { 'id:e1': sayilar(6, 0) } },
  { id: 'k3', z: 3, tur: 'tekil', kapsam: null, urunler: { 'id:e1': sayilar(1, 0) } }
];

test('Genel trendi: yalnız Genel kapsamlı tam koşular; tumKapsamlar ekran kapsamlıları da verir (tekil hiçbiri)', () => {
  expect(trendHesapla(KOSULAR, null)).toEqual([]);
  const tum = trendHesapla(KOSULAR, null, { tumKapsamlar: true });
  expect(tum.map((n) => n.kosuId)).toEqual(['k1', 'k2']);
  expect(tum[0]).toMatchObject({ kapsam: 'Başvuru', basarili: 5, basarisiz: 1 });
  // Genel kapsamlı koşu eklenince varsayılan trende o girer.
  const genelle = [...KOSULAR, { id: 'k4', z: 4, tur: 'tam', kapsam: 'Genel', urunler: { 'id:e1': sayilar(2, 0) } }];
  expect(trendHesapla(genelle, null).map((n) => n.kosuId)).toEqual(['k4']);
  // Ürün trendi değişmez (kapsamdan bağımsız, o ürünü içeren tam koşular).
  expect(trendHesapla(KOSULAR, 'id:e1').map((n) => n.kosuId)).toEqual(['k1', 'k2']);
});

test('beklenen sonuç metni: başarıda son adımın başarı göstergesi (adım adı değil); hatada adım ve mesaj', () => {
  const model = {
    id: 'm', ad: 'Örnek',
    adimlar: [
      { id: 'giris', sira: 1, baslik: 'Giriş', bolumler: [], kosu: { basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' } } },
      { id: 'ozet', sira: 2, baslik: 'Özet', bolumler: [], kosu: { basariGostergesi: { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'İşlem tamamlandı' }, { tur: 'url', deger: 'islem/tamam' }] } } }
    ],
    senaryoDuzeyi: { alanlar: [{
      id: 'beklenenSonuc', tip: 'birlesim', yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
      varyantlar: [{ tip: 'basarili' }, { tip: 'isKuraliHatasi', alanlar: { adim: { etiket: 'Adım', secenekler: ['giris', 'ozet'] }, mesaj: { etiket: 'Mesaj' } } }]
    }] }
  };
  const sema = formSemasiOlustur(model);
  const basari = beklenenSonucMetni(model, sema, {});
  expect(basari).toContain('"İşlem tamamlandı"');
  expect(basari).toContain('adres /islem/tamam/');
  expect(basari).not.toBe('Özet');
  expect(basari?.startsWith('Başarı:')).toBe(true);
  const hata = beklenenSonucMetni(model, sema, { beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'giris', mesaj: 'Kullanıcı kilitli' } });
  expect(hata).toMatch(/^İş kuralı hatası beklenir \(.+\): Kullanıcı kilitli$/);
  // Başarı göstergesi olmayan modelde akışın açıklaması yazılır.
  const gostergesiz = { ...model, adimlar: model.adimlar.map((a) => ({ id: a.id, sira: a.sira, baslik: a.baslik, bolumler: [] })) };
  expect(beklenenSonucMetni(gostergesiz, formSemasiOlustur(gostergesiz), {})).toMatch(/^Başarılı akış: .+ adımına kadar\.$/);
  // Beklenen sonucu olmayan model: null.
  const bossuz = { id: 'b', ad: 'B', adimlar: [{ id: 'a', sira: 1, baslik: 'A', bolumler: [] }] };
  expect(beklenenSonucMetni(bossuz, formSemasiOlustur(bossuz), {})).toBeNull();
});
