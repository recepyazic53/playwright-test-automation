// Çoklu akış (saf): akış listesi, akışın modeli (adımlar + iş kuralı/ayar süzme), varsayılanın model.adimlar ile eşitlenmesi,
// doğrulayıcının akış kuralları ve modelden diyagram blokları → yeniden adımlar gidiş-dönüşü (akis-servisi.mjs).
import { expect, test } from '@playwright/test';
import { ANA_AKIS_ID, akisListesi, akisModeli, akislariEsitle, varsayilanAkisId } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { adimlardanBloklar, akisDuzenlenebilirMi, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';

type Nesne = Record<string, any>;
const alan = (anahtar: string, etiket: string, tur = 'text', ek: Partial<HamAlan> = {}): HamAlan => ({
  anahtar, tur, etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Genel' }, ...ek
});
const META = { ekranAnahtari: 'siparis', ekranAdi: 'Siparis', urlYolu: '/siparis/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };

/** Kayıttan model: müşteri (tip radyo, TC Bireysel'de) → isteğe bağlı "Ek adres ekle" → Devam → teslimat → mesaj. */
function ornekModel(): Nesne {
  const tip = alan('@tip', 'Müşteri tipi', 'radio', { secici: 'input[name="tip"]', radyolar: [{ deger: 'b', metin: 'Bireysel', secici: null }, { deger: 'k', metin: 'Kurumsal', secici: null }] });
  const env = {
    kip: 'kayit' as const, bicim: 'akis' as const, profil: null, baslik: 'Siparis',
    alanlar: [alan('#ad', 'Ad Soyad', 'text', { zorunlu: true }), tip, alan('#tc', 'TC kimlik no'), alan('#ekAd', 'Ek adres adı'), alan('#teslimat', 'Teslimat')].map((a) => ({ alan: a, secili: true })),
    dugmeler: [{ secici: '#ek', metin: 'Ek adres ekle' }, { secici: '#devam', metin: 'Devam' }, { secici: '#kaydet', metin: 'Kaydet' }],
    mesajlar: [{ secici: '#sonuc', metin: 'Siparis oluşturuldu. No: 5' }],
    olaylar: [], engellenenler: [], notlar: []
  };
  const { envanter, hatalar } = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad', '@tip', '#tc'], zorunlu: ['#ad'], kosullar: { '#tc': { secim: '@tip', degerler: ['b'] } } },
    { tur: 'aksiyon', dugme: 0, istegeBagli: true },
    { tur: 'alanlar', ad: 'Ek', alanlar: ['#ekAd'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'bekle', saniye: 2 },
    { tur: 'alanlar', ad: 'Teslimat', alanlar: ['#teslimat'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    { tur: 'mesaj', mesaj: 0, metin: 'Siparis oluşturuldu' },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  return kayitPaketiOlustur(META, envanter as NonNullable<typeof envanter>).paket.model as Nesne;
}

test('akış listesi ve akışın modeli: örtük "Ana akış"; seçilen akışın adımları, iş kuralları ve adım ayarları süzülür', () => {
  const m = ornekModel();
  expect(akisListesi(m)).toEqual([{ id: ANA_AKIS_ID, ad: 'Ana akış', varsayilan: true, adimSayisi: 5 }]);
  expect(akisModeli(m, 'yok')).toBe(m);
  // İkinci akış: yalnızca ilk ve son adım (ek adres yok); iş kuralı ek adres adımına bağlı.
  const ikinci = { id: 'kisa', ad: 'Kısa', adimlar: [m.adimlar[0], { ...m.adimlar[4], sira: 2 }] };
  const tam = { ...m, akislar: [{ id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: m.adimlar }, ikinci], isKurallari: [{ id: 'k1', adim: m.adimlar[1].id, kosul: { alan: 'tip', esit: 'b' }, mesaj: 'x' }] };
  expect(akisListesi(tam).map((a) => [a.id, a.varsayilan, a.adimSayisi])).toEqual([['ana', true, 5], ['kisa', false, 2]]);
  expect(varsayilanAkisId(tam)).toBe('ana');
  const kisa = akisModeli(tam, 'kisa') as Nesne;
  expect(kisa.akislar).toBeUndefined();
  expect(kisa.adimlar.map((a: Nesne) => a.baslik)).toEqual(['Müşteri', 'Teslimat']);
  expect(kisa.isKurallari).toEqual([]);
  // "“Ek adres ekle” dahil" ayarı yalnızca onu kullanan akışın formunda.
  expect(kisa.senaryoDuzeyi.alanlar.map((a: Nesne) => a.id)).toEqual([]);
  expect((akisModeli(tam, 'ana') as Nesne).senaryoDuzeyi.alanlar.map((a: Nesne) => a.id)).toEqual(['ekAdresEkleDahil']);
  expect((akisModeli(tam, 'ana') as Nesne).isKurallari).toHaveLength(1);
  // Varsayılan akışın kopyası model.adimlar ile eşitlenir.
  const esit = akislariEsitle({ ...tam, adimlar: [m.adimlar[0]] }) as Nesne;
  expect(esit.akislar[0].adimlar).toEqual([m.adimlar[0]]);
});

test('doğrulayıcı: tek varsayılan (adımları model.adimlar ile aynı), tekil kimlik, her akış geçerli bir akış modeli', () => {
  const m = ornekModel();
  const dogrula = (akislar: unknown) => () => ekranModeliniDogrula('siparis.model.json', { ...m, akislar }, () => { throw new Error('alt model yok'); });
  expect(dogrula([{ id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: m.adimlar }, { id: 'kisa', ad: 'Kısa', adimlar: [m.adimlar[0], { ...m.adimlar[4], sira: 2 }] }])).not.toThrow();
  expect(dogrula([{ id: 'ana', ad: 'Ana', varsayilan: true, adimlar: [m.adimlar[0]] }])).toThrow(/varsayılan akışın "adimlar"ı modelin "adimlar"ıyla aynı olmalı/);
  expect(dogrula([{ id: 'ana', ad: 'Ana', varsayilan: true, adimlar: m.adimlar }, { id: 'ana', ad: 'B', adimlar: m.adimlar }])).toThrow(/akış id'si "ana" birden fazla kez/);
  expect(dogrula([{ id: 'ana', ad: 'Ana', adimlar: m.adimlar }])).toThrow(/tam olarak bir akış "varsayilan": true olmalı/);
  // Akış içindeki adım geçersizse (ör. sıra bozuk) akışın adıyla bildirilir.
  expect(dogrula([{ id: 'ana', ad: 'Ana', varsayilan: true, adimlar: m.adimlar }, { id: 'b', ad: 'Bozuk', adimlar: [m.adimlar[4]] }])).toThrow(/akislar\[1\]\(b\).*"sira" 1 olmalı/);
});

test('modelden diyagram ve geri: bloklar adımların aynısını verir (koşul, zorunluluk, isteğe bağlı düğme, bekleme, mesaj)', () => {
  const m = ornekModel();
  expect(akisDuzenlenebilirMi(m)).toEqual({ duzenlenebilir: true, neden: null });
  const env = modeldenAkisEnvanteri(m);
  expect(env.alanlar.map((a) => [a.alan.anahtar, a.alan.tur, a.alan.zorunlu])).toEqual([
    ['ad', 'text', true], ['tip', 'radio', false], ['tc', 'text', false], ['ekAd', 'text', false], ['teslimat', 'text', false]
  ]);
  const bloklar = adimlardanBloklar(m, m.adimlar, env);
  expect(bloklar.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'alanlar', 'alanlar', 'aksiyon', 'bekle', 'alanlar', 'aksiyon', 'mesaj', 'bitir']);
  expect(bloklar[0]).toMatchObject({ ad: 'Müşteri', alanlar: ['ad', 'tip', 'tc'], zorunlu: ['ad'], kosullar: { ad: null, tip: null, tc: { secim: 'tip', degerler: ['b'] } } });
  expect(bloklar[1]).toEqual({ tur: 'aksiyon', dugme: 0, istegeBagli: true });
  const { envanter, hatalar } = akistanKayitEnvanteri(env, bloklar);
  expect(hatalar).toEqual([]);
  const yeni = kayitPaketiOlustur({ ...META, mevcutModel: m }, envanter as NonNullable<typeof envanter>).paket.model as Nesne;
  const ozet = (x: Nesne) => x.adimlar.map((a: Nesne) => [a.baslik, a.kosu ?? null, a.bolumler.flatMap((b: Nesne) => b.alanlar.map((y: Nesne) => [y.id, y.gorunurluk ?? null, y.mutlakaGorunmeli ?? false]))]);
  expect(ozet(yeni)).toEqual(ozet(m));
  // Aynı düğmenin "… dahil" ayarı yeniden kullanılır (ikinci ayar üretilmez).
  expect(yeni.senaryoDuzeyi.alanlar.map((a: Nesne) => a.id)).toEqual(['ekAdresEkleDahil']);
  // Alt model adımı olan model de düzenlenebilir: adım salt okunur "korunan adım" bloğudur (aynen korunur; akis-korunan.spec.ts).
  const altModelli = { ...m, adimlar: [...m.adimlar, { id: 'odeme', sira: 6, baslik: 'Ödeme', altModel: { dosya: 'x.model.json', bolum: 'kart' } }] };
  expect(akisDuzenlenebilirMi(altModelli).duzenlenebilir).toBe(true);
  expect(adimlardanBloklar(altModelli, altModelli.adimlar, modeldenAkisEnvanteri(altModelli)).at(-2)).toMatchObject({ tur: 'korunan', kapsam: 'adim', ad: 'Ödeme' });
});
