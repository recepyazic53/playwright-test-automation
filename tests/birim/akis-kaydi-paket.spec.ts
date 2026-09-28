// AKIŞ KAYDI → EKRAN PAKETİ — saf dönüşüm (tarayıcı YOK): kayıt envanterinden çok adımlı model (koşu tanımları, "İşlemler"
// bölümü, bağlam profili alanı), değişken gösterge metninin sabitlenmesi ve MEVCUT modelle birleştirme (seçiciyle eşleşen
// alanların kimliği/ek bilgileri korunur; artık var olmayan adımlara bağlı iş kuralları çıkarılır; paket geçerlidir ve
// Bulgular'ın fark motorundan geçer). Tüm değerler SAHTEDİR.
import { expect, test } from '@playwright/test';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { kayitPaketiOlustur, sabitGostergeMetni, type HamAlan, type KayitEnvanteri, type PaketMetasi } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { ornekBasvuruModeli } from './model-fikstur';

type Nesne = Record<string, any>;
const bolum = { anahtar: 'b:temel', baslik: 'Temel bilgiler' };
function ham(id: string, tur: string, ek: Partial<HamAlan> = {}): HamAlan {
  return {
    anahtar: `#${id}`, tur, etiket: id, etiketKaynagi: 'label', kimlik: id, ad: id, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`],
    zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum, ...ek
  };
}
const META: PaketMetasi = { ekranAnahtari: 'ornek-basvuru', ekranAdi: 'Örnek Başvuru', urlYolu: '/basvuru/', girisGerekli: true, ikiAsamali: 'totp', baglamTuru: 'Şube' };
const envanter = (ek: Partial<KayitEnvanteri> = {}): KayitEnvanteri => ({
  kip: 'kayit', profil: 'Yetkili',
  adimlar: [
    { ad: 'Müşteri oluşturma', yol: '/basvuru/', baslik: 'Başvuru', alanlar: [ham('urun', 'select', { secenekler: [{ deger: 'A', metin: 'Temel' }] }), ham('adSoyad', 'text')], ilerleme: { secici: '#devam', metin: 'Devam' } },
    { ad: 'Boş adım', yol: '/basvuru/', baslik: 'Başvuru', alanlar: [], ilerleme: null },
    { ad: 'Teslimat seçimi', yol: '/basvuru/teslimat', baslik: 'Teslimat', alanlar: [ham('teslimatSecimi', 'select', { secenekler: [{ deger: 'T1', metin: 'Dar' }] })], ilerleme: { secici: '#kaydet', metin: 'Kaydet' } }
  ],
  basariGostergesi: { secici: '#sonuc', metin: 'Kayıt oluşturuldu. No: 5550012' },
  engellenenler: [], notlar: [], ...ek
});

test('değişken gösterge metni: rakam içeren ilk kelimeden öncesi, sondaki noktalama atılır; çok kısaysa null', () => {
  expect(sabitGostergeMetni('Başvuru onaylandı. No: 1001')).toBe('Başvuru onaylandı. No');
  expect(sabitGostergeMetni('Siparis oluşturuldu. No: SP-1003')).toBe('Siparis oluşturuldu. No');
  expect(sabitGostergeMetni('İşlem tamamlandı.')).toBe('İşlem tamamlandı');
  expect(sabitGostergeMetni('12345 numaralı')).toBeNull();
  expect(sabitGostergeMetni(null)).toBeNull();
});

test('yeni ekran: adımlar sırayla, koşu tanımları, İşlemler bölümü, bağlam profili alanı; boş adım atlanır; paket geçerli', () => {
  const { paket, ozet } = kayitPaketiOlustur(META, envanter());
  const d = sayfaPaketiniDogrula(paket);
  expect(d.hatalar).toEqual([]);
  const m = paket.model as Nesne;
  expect(m.semaSurumu).toBe(2);
  expect(m.adimlar.map((a: Nesne) => [a.id, a.sira, a.baslik])).toEqual([['musteriOlusturma', 1, 'Müşteri oluşturma'], ['teslimatSecimi', 2, 'Teslimat seçimi']]);
  expect(m.adimlar[0].kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#teslimatSecimi' } });
  expect(m.adimlar[1].kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kayıt oluşturuldu. No', secici: '#sonuc' } });
  expect(m.adimlar[1].bolumler.at(-1)).toMatchObject({ baslik: 'İşlemler', alanlar: [{ tip: 'buton', yapilandirma: 'aksiyon' }, { id: 'sonucMesaji', tip: 'cikti', yapilandirma: 'cikti' }] });
  // Bölüm kimlikleri model genelinde tekil ("İşlemler" iki adımda).
  const bolumIdleri = m.adimlar.flatMap((a: Nesne) => a.bolumler.map((b: Nesne) => b.id));
  expect(new Set(bolumIdleri).size).toBe(bolumIdleri.length);
  expect(m.senaryoDuzeyi.alanlar).toEqual([expect.objectContaining({ id: 'baglamProfili', eslesme: { senaryo: 'baglamProfili', profilHavuzu: 'Şube' }, varsayilan: { deger: 'Yetkili' } })]);
  expect(paket.bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('"Boş adım" adımında alan, ilerleme düğmesi ya da gösterge kaydedilmediği')]));
  expect(ozet).toMatchObject({ adimSayisi: 2, alanSayisi: 3, yeniAlanSayisi: 3, eslesenSayisi: 0 });
});

test('mevcut ekran (tekrar kayıt): eşleşen alanların kimliği ve seçenekleri korunur; eski adıma bağlı iş kuralı çıkarılır; Bulgular hesaplanır', () => {
  const mevcut = ornekBasvuruModeli() as Nesne;
  // Mevcut modelde "urun" alanına elle eklenmiş bir bilgi: korunmalı.
  const urunAlani = mevcut.adimlar[0].bolumler[0].alanlar.find((a: Nesne) => a.id === 'urun');
  urunAlani.notlar = ['Elle eklenmiş not'];
  const { paket, ozet } = kayitPaketiOlustur({ ...META, mevcutModel: mevcut }, envanter());
  const d = sayfaPaketiniDogrula(paket);
  expect(d.hatalar).toEqual([]);
  const m = paket.model as Nesne;
  const alanlar = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  const urun = alanlar.find((a: Nesne) => a.konum.secici === '#urun');
  expect(urun).toMatchObject({ id: 'urun', notlar: ['Elle eklenmiş not'], secenekler: [{ deger: 'A', metin: 'Temel' }, { deger: 'B', metin: 'Geniş' }] });
  expect(alanlar.find((a: Nesne) => a.konum.secici === '#adSoyad')?.id).toBe('adSoyad');
  // Mevcut senaryo düzeyindeki şube alanı korunur (yeni bağlam alanı eklenmez).
  expect(m.senaryoDuzeyi.alanlar.map((a: Nesne) => a.id)).toEqual(expect.arrayContaining(['subeProfili']));
  expect(m.senaryoDuzeyi.alanlar.some((a: Nesne) => a.id === 'baglamProfili')).toBe(false);
  // "hesaplama" adımı artık yok: ona bağlı iş kuralı çıkarıldı, bilinmeyenlere yazıldı.
  expect(m.isKurallari).toEqual([]);
  expect(paket.bilinmeyenler).toEqual(expect.arrayContaining([
    expect.stringContaining('iş kuralı modelden çıkarıldı'), expect.stringMatching(/Mevcut modeldeki \d+ alan kayıtta seçilmedi/)
  ]));
  expect(ozet).toMatchObject({ eslesenSayisi: 2, yeniAlanSayisi: 1 });
  // Bulgular (fark motoru) hatasız çalışır ve adım değişikliklerini gösterir.
  const bulgular = modelFarki(mevcut, m);
  expect(bulgular.length).toBeGreaterThan(0);
});

test('gizlilik: gizli veri kalıbına benzeyen gösterge metni pakete yazılmaz (gösterge "öğe görünür" olur)', () => {
  const { paket } = kayitPaketiOlustur(META, envanter({
    basariGostergesi: { secici: '#sonuc', metin: 'Kart 4111 1111 1111 1111 ile ödendi' }
  }));
  const metin = JSON.stringify(paket);
  expect(metin).not.toContain('4111');
  expect((paket.model as Nesne).adimlar[1].kosu.basariGostergesi).toEqual({ tur: 'eleman', deger: '#sonuc' });
});

test('alan açan düğme (her senaryoda basılır, varsayılan): alt adımlara bölünür, isteğe bağlı değildir; ilerleme son parçada', () => {
  const { paket } = kayitPaketiOlustur({ ...META, baglamTuru: null, girissiz: true }, {
    kip: 'kayit', profil: null,
    adimlar: [{
      ad: 'Müşteri', yol: '/f/', baslik: 'F', alanlar: [ham('ad', 'text'), ham('ekAd', 'text')], parcalar: [0, 1],
      acicilar: [{ secici: '#ekle', metin: 'Ek kişi ekle', secimli: false }], ilerleme: { secici: '#devam', metin: 'Devam' }
    }],
    basariGostergesi: { secici: '#sonuc', metin: 'Tamam', aranan: null }, engellenenler: [], notlar: []
  });
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const m = paket.model as Nesne;
  expect(m.girisGerekmez).toBe(true);
  expect(m.adimlar.map((a: Nesne) => [a.baslik, Boolean(a.gorunurluk)])).toEqual([['Müşteri', false], ['Müşteri: Ek kişi ekle', false], ['Müşteri: Ek kişi ekle sonrası', false]]);
  expect(m.adimlar[1].kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#ekle', aciklama: 'Ek kişi ekle' }], basariGostergesi: { tur: 'eleman', deger: '#ekAd' } });
  // İlerleme isteğe bağlı olmayan son parçaya eklendi; gösterge: "yalnızca öğe görünür".
  expect(m.adimlar[2].kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#sonuc' } });
  expect(m.kosullar).toEqual({});
  expect(m.senaryoDuzeyi.alanlar).toEqual([]);
});

test('seçime göre görünürlük: okumalar arasında değişen tek seçimden koşul; iki seçim birden değişirse koşul yazılmaz', () => {
  const tip = ham('tip', 'radio', { secici: 'input[type="radio"][name="tip"]', radyolar: [{ deger: 'bireysel', metin: 'Bireysel', secici: null }, { deger: 'tuzel', metin: 'Tüzel', secici: null }] });
  const kanal = ham('kanal', 'select', { secenekler: [{ deger: 'web', metin: 'Web' }, { deger: 'sube', metin: 'Şube' }] });
  const adim = (okumalar: Array<{ gorunen: string[]; secimler: Record<string, string> }>) => kayitPaketiOlustur({ ...META, baglamTuru: null }, {
    kip: 'kayit', profil: null,
    adimlar: [{ ad: 'Başvuran', yol: '/s/', baslik: 'S', alanlar: [tip, kanal, ham('tc', 'text'), ham('vkn', 'text')], ilerleme: null, okumalar }],
    basariGostergesi: null, engellenenler: [], notlar: []
  });
  const tekDegisim = adim([
    { gorunen: ['#tip', '#kanal', '#tc'], secimler: { '#tip': 'bireysel', '#kanal': 'web' } },
    { gorunen: ['#tip', '#kanal', '#vkn'], secimler: { '#tip': 'tuzel', '#kanal': 'web' } }
  ]);
  expect(sayfaPaketiniDogrula(tekDegisim.paket).hatalar).toEqual([]);
  const m = tekDegisim.paket.model as Nesne;
  const alanlar = m.adimlar[0].bolumler.flatMap((b: Nesne) => b.alanlar);
  const kosul = (id: string): unknown => m.kosullar[alanlar.find((a: Nesne) => a.id === id).gorunurluk?.kosul]?.ifade;
  expect(kosul('tc')).toEqual({ alan: 'tip', esit: 'bireysel' });
  expect(kosul('vkn')).toEqual({ alan: 'tip', esit: 'tuzel' });
  expect(alanlar.find((a: Nesne) => a.id === 'kanal').gorunurluk).toBeUndefined();
  expect(m.kosullar.tcGorunur.aciklama).toBe('tip = Bireysel seçilince görünür (akış kaydı).');

  const ikiDegisim = adim([
    { gorunen: ['#tip', '#kanal', '#tc'], secimler: { '#tip': 'bireysel', '#kanal': 'web' } },
    { gorunen: ['#tip', '#kanal', '#vkn'], secimler: { '#tip': 'tuzel', '#kanal': 'sube' } }
  ]);
  const m2 = ikiDegisim.paket.model as Nesne;
  expect(m2.adimlar[0].bolumler.flatMap((b: Nesne) => b.alanlar).every((a: Nesne) => !a.gorunurluk)).toBe(true);
  expect(ikiDegisim.paket.bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('"tc" alanının görünürlüğü birden çok seçime bağlı görünüyor')]));
});
