// KORUMA TESTLERİ — Modeli güncelle (koşudan ekran analizi; ekranlar/kosu-analizi.mjs): senaryo koşarken okunan ekranlar mevcut
// modelle karşılaştırılır. Denetlenenler: yeni alan eklenir, görülmeyen alan çıkarılır, seçenek farkı yazılır; koşunun geçmediği adım,
// koşullu alan, çıktı / aksiyon alanı ve okumanın tanımadığı seçici "kaldırıldı" sayılmaz; düğme notları (gelen / görülmeyen); paket
// geçerli ve fark motoru beklenen bulguları verir. Tarayıcı / ağ YOK.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { gozlenenModel, kosuAnaliziPaketi, type EkranGozlemi } from '../../scripts/platform/ekranlar/kosu-analizi.mjs';
import { modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';

type Nesne = Record<string, any>;
const PAKET = JSON.parse(readFileSync(join(resolve(__dirname, 'fixtures', 'sayfa-paketi'), 'ornek-rota-v1.json'), 'utf-8')) as Nesne;
const model = (): Nesne => JSON.parse(JSON.stringify(PAKET.model)) as Nesne;
const ham = (secici: string, tur: string, ek: Nesne = {}): Nesne => ({
  anahtar: secici, tur, etiket: null, secici, adaySeciciler: [secici], kirilganlik: 'dusuk', zorunlu: false, devreDisi: false, ...ek
});
const alanIdleri = (m: Nesne) => (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler ?? []).flatMap((b: Nesne) => (b.alanlar ?? []).map((x: Nesne) => x.id as string)));

// Koşu: başvuru bilgileri (başlangıç tarihi yok, ülke yok, yeni alan var, sorgu tipinde yeni seçenek) ve toplam (#Refresh düğmesi yok,
// "Kaydet" geldi).
const gozlemler: EkranGozlemi[] = [
  {
    adimId: 'basvuruBilgileri', baslik: 'Başvuru bilgileri', dugmeler: [{ metin: 'Kurallar', secici: 'a#kurallar', baglanti: true }],
    alanlar: [
      ham('#to', 'text'),
      ham('#select-sorgu', 'select', { adaySeciciler: ['#select-sorgu', '#selectAllClientOrders'], secenekler: [
        { deger: '', metin: 'Seçiniz' }, { deger: '1', metin: 'Tekli Sorgulama' }, { deger: '2', metin: 'Çoklu Sorgulama' }, { deger: '3', metin: 'Grup Sorgulama' }] }),
      ham('#referans-kodu', 'text', { etiket: 'Referans Kodu', zorunlu: true })
    ]
  },
  { adimId: 'toplamHesaplama', baslik: 'Toplam', alanlar: [], dugmeler: [{ metin: 'Kaydet', secici: '#Kaydet' }] }
];

test('gözlenen model: yeni alan eklenir, görülmeyen alan çıkar, seçenek farkı yazılır; gezilmeyen / koşullu / tanınmayan alan kalır', () => {
  const eski = model();
  const { model: yeni, notlar } = gozlenenModel(eski, gozlemler);
  const idler = alanIdleri(yeni);
  // Yeni alan: ilk görüldüğü adıma, etiketinden kimlikle.
  const referans = ((yeni.adimlar as Nesne[]).find((a) => a.id === 'basvuruBilgileri') as Nesne).bolumler.flatMap((b: Nesne) => b.alanlar).find((x: Nesne) => x.id === 'referansKodu');
  expect(referans).toMatchObject({ tip: 'metin', etiket: { ekran: 'Referans Kodu' }, yapilandirma: 'senaryo', zorunlu: true, konum: { secici: '#referans-kodu' } });
  // Görülmeyen: başlangıç tarihi (geçilen adımda, koşulsuz, düz seçici). Ülke de görülmedi ama modelin başka yerinde kullanılıyor:
  // silinmez, not düşülür.
  expect(idler).not.toContain('baslangicTarihi');
  expect(idler).toContain('bitisTarihi');
  expect(idler).toContain('ulke');
  expect(notlar.some((n) => n.startsWith('Görülmeyen alan:') && n.includes('kaldırılmadı'))).toBe(true);
  // Kalanlar: koşullu (ekHizmet, plan), yardımcılı (kapsam), çıktı (musteriListesi), gezilmeyen adım (musteriKefil, ekranAcilir).
  for (const id of ['ekHizmet', 'plan', 'kapsam', 'musteriListesi', 'odeyen', 'urunLinki']) expect(idler).toContain(id);
  // Seçenekler: aday seçiciyle eşleşen alan; yer tutucu atlanır, yeni seçenek eklenir.
  const sorgu = (yeni.adimlar as Nesne[]).flatMap((a) => (a.bolumler ?? []).flatMap((b: Nesne) => b.alanlar)).find((x: Nesne) => x.id === 'sorguTipi');
  // Var olan seçenekler (senaryo değeri, form metni) korunur.
  expect(sorgu.secenekler.map((s: Nesne) => s.deger)).toEqual(['1', '2', '3']);
  expect(sorgu.secenekler[0]).toMatchObject({ senaryoDegeri: 'tekli', formMetni: 'Tekli' });
  // Düğmeler: gelen (bağlantı sayılmaz) ve görülmeyen; gezilmeyen adımlar not edilir.
  expect(notlar.some((n) => n.startsWith('Yeni düğme: “Kaydet”'))).toBe(true);
  expect(notlar.some((n) => n.includes('Kurallar'))).toBe(false);
  expect(notlar.some((n) => n.startsWith('Görülmeyen düğme:'))).toBe(true);
  expect(notlar.some((n) => n.startsWith('Koşunun geçmediği adımlar'))).toBe(true);
  // Girdi modeli değişmez.
  expect(alanIdleri(eski)).toContain('baslangicTarihi');

  // Fark motoru: Değişiklikler sayfasında görünecek bulgular.
  const bulgular = modelFarki(eski, yeni);
  expect(bulgular.some((b) => b.tur === 'yeniAlan' && b.alanId === 'referansKodu')).toBe(true);
  expect(bulgular.some((b) => b.tur === 'kaldirilanAlan' && b.alanId === 'baslangicTarihi')).toBe(true);
  expect(bulgular.some((b) => b.tur === 'yeniSecenek' && b.alanId === 'sorguTipi')).toBe(true);
});

test('koşu analizi paketi geçerli bir ekran paketidir; fark yoksa bulgu çıkmaz', () => {
  const paket = kosuAnaliziPaketi(PAKET.meta.ekran, model(), gozlemler, 'Örnek senaryo');
  const d = sayfaPaketiniDogrula(paket);
  expect(d.hatalar).toEqual([]);
  expect(d.gecerli).toBe(true);
  // Aynı ekran yeniden okunursa (model zaten güncel): fark yok.
  const ikinci = gozlenenModel(paket.model, gozlemler);
  expect(modelFarki(paket.model, ikinci.model)).toEqual([]);
});

test('akışlı model: varsayılan akış modelin adımlarıyla eşitlenir; her okumada görülen (menü) düğmeleri not edilmez', () => {
  const eski = model();
  eski.akislar = [{ id: 'ana', ad: 'Ana', varsayilan: true, adimlar: JSON.parse(JSON.stringify(eski.adimlar)) }];
  const menu = { metin: 'Ana Sayfa', secici: '#ana-sayfa' };
  const okunan = gozlemler.map((g) => ({ ...g, dugmeler: [...g.dugmeler, menu] }));
  const { model: yeni, notlar } = gozlenenModel(eski, okunan);
  expect(JSON.stringify(yeni.akislar[0].adimlar)).toBe(JSON.stringify(yeni.adimlar));
  expect(alanIdleri({ adimlar: yeni.akislar[0].adimlar })).toContain('referansKodu');
  expect(notlar.some((n) => n.includes('Ana Sayfa'))).toBe(false);
  const d = sayfaPaketiniDogrula(kosuAnaliziPaketi(PAKET.meta.ekran, eski, okunan, 'Örnek'));
  expect(d.hatalar).toEqual([]);
});
