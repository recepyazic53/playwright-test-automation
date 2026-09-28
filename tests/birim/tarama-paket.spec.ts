// OTOMATİK TARAMA — saf yardımcılar (tarayıcı YOK): koruma kararları (hedef çözümü, yasaklı adres, istek kararı)
// ve envanter → ekran paketi dönüşümü (tip eşlemesi, görünürlük koşulları, bağlam gözlemi, gizli metin süzme,
// mevcut modelle birleştirme). Tüm değerler SAHTEDİR.
import { expect, test } from '@playwright/test';
import { girisTarifiniDogrula } from '../../scripts/platform/giris/tarif.mjs';
import { yasakDesenleri } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { adresOzeti, hedefCoz, istekKarari, taramaAdresleri, yasakliAdresBul } from '../../scripts/platform/tarama/koruma.mjs';
import {
  AKSIYON_BILINMEYENI, ekranAnahtariOner, kimlikUret, taramaPaketiOlustur, type HamAlan, type PaketMetasi, type TaramaEnvanteri
} from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { taramaGirisTarifi } from './tarama-fikstur';

const bolum = { anahtar: 'fs:temel', baslik: 'Temel' };
function ham(anahtar: string, tur: string, ek: Partial<HamAlan> = {}): HamAlan {
  const id = anahtar.replace(/^#/, '');
  return {
    anahtar, tur, etiket: id, etiketKaynagi: 'label', kimlik: id, ad: id, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`, `[name="${id}"]`],
    zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum, ...ek
  };
}
type ModelAlani = Record<string, unknown> & { id: string; tip: string; etiket?: unknown; eslesme?: unknown };
type TestModeli = Record<string, unknown> & {
  adimlar: Array<{ bolumler: Array<{ alanlar: ModelAlani[] }> }>;
  kosullar: Record<string, { ifade: unknown }>;
  baglamGorunurlugu: { alanlar: Record<string, unknown> };
};
const META: PaketMetasi = { ekranAnahtari: 'deneme', ekranAdi: 'Deneme', urlYolu: '/deneme/', girisGerekli: true, ikiAsamali: 'yok', baglamTuru: 'Profil' };

test('hedef çözümü: yol, göreli yol, aynı köken; başka köken ve kullanıcı:parola reddedilir', () => {
  expect(hedefCoz('https://test.ornek.invalid/uygulama/', '/satis/odeme/?adim=1#x')).toEqual({ adres: 'https://test.ornek.invalid/satis/odeme/?adim=1', yol: '/satis/odeme/?adim=1' });
  expect(hedefCoz('https://test.ornek.invalid/uygulama/', 'form')).toEqual({ adres: 'https://test.ornek.invalid/uygulama/form', yol: '/uygulama/form' });
  expect(hedefCoz('https://test.ornek.invalid', 'https://test.ornek.invalid/a')).toMatchObject({ yol: '/a' });
  expect(() => hedefCoz('https://test.ornek.invalid', 'https://baska.ornek.invalid/a')).toThrow(/aynı kökende/);
  expect(() => hedefCoz('https://test.ornek.invalid', '//baska.ornek.invalid/a')).toThrow(/kökeninde/);
  expect(() => hedefCoz('https://test.ornek.invalid', 'javascript:alert(1)')).toThrow(/http\(s\)/);
  expect(() => hedefCoz('https://test.ornek.invalid', 'https://k:p@test.ornek.invalid/a')).toThrow(/kullanıcı adı\/parola/);
  expect(() => hedefCoz('https://test.ornek.invalid', '  ')).toThrow(/yolunu yazın/);
});

test('yasaklı adres: ortam, hedef, tarif ve bağlam adımlarının (yer tutucular doldurularak) adresleri denetlenir', () => {
  const tarif = girisTarifiniDogrula({
    ...taramaGirisTarifi(),
    baglamDegistirme: { baglamTuru: 'Profil', adimlar: [{ islem: 'git', adres: 'https://{alanAdi}/profil' }] }
  }).tarif;
  const adresler = taramaAdresleri('https://test.ornek.invalid', 'https://test.ornek.invalid/a', tarif, [{ alanAdi: 'giris.yasak-ornek-deneme.invalid' }, null]);
  expect(adresler).toContain('https://giris.yasak-ornek-deneme.invalid/profil');
  expect(yasakliAdresBul(adresler, yasakDesenleri('*yasak-ornek*'))).toEqual({ adres: 'https://giris.yasak-ornek-deneme.invalid/profil', host: 'giris.yasak-ornek-deneme.invalid', kalip: '*yasak-ornek*' });
  expect(yasakliAdresBul(adresler, yasakDesenleri('baska.invalid'))).toBeNull();
});

test('istek kararı: tarama aşamasında yalnızca GET/HEAD; yasaklı host her aşamada; izinli köken listesi', () => {
  const d = yasakDesenleri('*yasak-ornek*');
  const karar = (yontem: string, adres: string, asama: 'giris' | 'baglam' | 'tarama', izinli: string[] | null = null) =>
    istekKarari({ yontem, adres, asama, yasakDesenleri: d, izinliKokenler: izinli });
  expect(karar('POST', 'https://test.ornek.invalid/giris', 'giris')).toEqual({ izin: true });
  expect(karar('POST', 'https://test.ornek.invalid/profil', 'baglam')).toEqual({ izin: true });
  expect(karar('POST', 'https://test.ornek.invalid/kaydet', 'tarama')).toEqual({ izin: false, neden: 'yazma' });
  expect(karar('PUT', 'https://test.ornek.invalid/kaydet', 'tarama')).toEqual({ izin: false, neden: 'yazma' });
  expect(karar('GET', 'https://test.ornek.invalid/liste?q=1', 'tarama')).toEqual({ izin: true });
  expect(karar('HEAD', 'https://test.ornek.invalid/', 'tarama')).toEqual({ izin: true });
  expect(karar('GET', 'https://cdn.yasak-ornek.invalid/a.js', 'giris')).toEqual({ izin: false, neden: 'yasakli', kalip: '*yasak-ornek*' });
  expect(karar('GET', 'https://cdn.ornek.invalid/a.js', 'giris', ['https://test.ornek.invalid'])).toEqual({ izin: false, neden: 'izinsiz-koken' });
  expect(karar('GET', 'data:image/png;base64,AAAA', 'tarama', ['https://test.ornek.invalid'])).toEqual({ izin: true });
  expect(adresOzeti('https://test.ornek.invalid/kaydet?tc=12345678901#x')).toBe('https://test.ornek.invalid/kaydet');
});

test('kimlik ve anahtar üretimi', () => {
  expect(kimlikUret('Ad Soyad')).toBe('adSoyad');
  expect(kimlikUret('user_name')).toBe('userName');
  expect(kimlikUret('İndirim Oranı (%)')).toBe('indirimOrani');
  expect(kimlikUret('123')).toBe('alan123');
  expect(ekranAnahtariOner('Ödeme Formu — Yeni!')).toBe('odeme-formu-yeni');
});

test('paket: tip eşlemesi, koşullar, bağlam gözlemi, gizli metin süzme; doğrulayıcıdan geçer', () => {
  const urun = ham('#urun', 'select', { etiket: 'Ürün', zorunlu: true, secenekler: [{ deger: '', metin: 'Seçiniz' }, { deger: 'A', metin: 'Temel' }, { deger: 'B', metin: 'Geniş' }] });
  const envanter: TaramaEnvanteri = {
    kesifYapildi: true, hataliProfiller: [{ profil: 'Bozuk', mesaj: 'Bağlam değiştirme adımı başarısız' }],
    engellenenler: [{ yontem: 'POST', adres: 'https://test.ornek.invalid/kaydet', asama: 'tarama', neden: 'yazma' }],
    profiller: [
      {
        profil: 'A', yol: '/deneme/', baslik: 'Deneme', ekranGoruntusu: null, notlar: ['Not bir.'],
        alanlar: [
          urun, ham('#tel', 'tel'), ham('#tarih', 'date'), ham('#tutar', 'number'), ham('#aciklama', 'textarea', { etiket: 'Kart 4111 1111 1111 1111' }),
          ham('#parola', 'password'), ham('#belge', 'file', { kabul: '.pdf,.png' }),
          ham('radyo:sekil', 'radio', { kimlik: null, ad: 'sekil', etiket: 'Şekil', secici: 'input[type="radio"][name="sekil"]', radyolar: [{ deger: 'x', metin: 'X', secici: null }] }),
          ham('#gizlenen', 'text', { etiket: 'Gizlenen' })
        ],
        kesifler: [{
          secim: '#urun', ilkDeger: 'A', geriAlindi: true, degerler: [
            { deger: 'B', metin: 'Geniş', gorunenler: [ham('#ek', 'checkbox', { etiket: 'Ek' })], kaybolanlar: ['#gizlenen'], gezinme: null }
          ]
        }]
      },
      { profil: 'B', yol: '/deneme/', baslik: 'Deneme', ekranGoruntusu: null, notlar: [], alanlar: [urun, ham('#tel', 'tel')], kesifler: [] }
    ]
  };
  const { paket, ozet } = taramaPaketiOlustur({ ...META, olusturulma: '2026-09-25T10:00:00Z' }, envanter);
  const d = sayfaPaketiniDogrula(paket);
  expect(d.hatalar).toEqual([]);
  expect(ozet).toMatchObject({ alanSayisi: 10, kosulSayisi: 2, kanitSayisi: 0, engellenenYazma: 1 });
  const model = paket.model as TestModeli;
  const alanlar = new Map(model.adimlar[0].bolumler.flatMap((b) => b.alanlar).map((a) => [a.id, a]));
  expect([...alanlar.values()].map((a) => [a.id, a.tip])).toEqual([
    ['urun', 'secim'], ['tel', 'telefon'], ['tarih', 'tarih'], ['tutar', 'sayi'], ['aciklama', 'metin'], ['parola', 'metin'], ['belge', 'dosya'],
    ['sekil', 'radyo'], ['gizlenen', 'metin'], ['ek', 'onayKutusu']
  ]);
  expect(alanlar.get('urun')).toMatchObject({ secenekler: [{ deger: 'A', metin: 'Temel' }, { deger: 'B', metin: 'Geniş' }], seceneklerDurumu: 'tam', zorunlu: true, eslesme: { senaryo: 'urun' } });
  expect(alanlar.get('aciklama')?.etiket).toEqual({ ekran: null });
  expect(alanlar.get('parola')).toMatchObject({ hassas: true });
  expect(alanlar.get('belge')?.kabul).toBeUndefined();
  expect(alanlar.get('ek')).toMatchObject({ gorunurluk: { kosul: 'ekGorunur' } });
  expect(model.kosullar.ekGorunur.ifade).toEqual({ alan: 'urun', esit: 'B' });
  expect(model.kosullar.gizlenenGorunur.ifade).toEqual({ alan: 'urun', esit: 'A' });
  expect(model.baglamGorunurlugu.alanlar.tel).toEqual({ A: true, B: true });
  expect(model.baglamGorunurlugu.alanlar.tarih).toEqual({ A: true, B: false });
  expect(paket.bilinmeyenler).toEqual(expect.arrayContaining([
    AKSIYON_BILINMEYENI, '"A" profili: Not bir.', expect.stringContaining('"Bozuk" bağlam profili taranamadı'),
    expect.stringContaining('1 yazma isteği engellendi (POST https://test.ornek.invalid/kaydet)'), expect.stringContaining('gizli/kişisel veri kalıbına')
  ]));
  expect(JSON.stringify(paket)).not.toContain('4111');
});

test('mevcut modelle birleştirme: eşleşen alanların kimliği korunur, yeni alan bulgu olur, görülmeyen alan kaldırılmaz', () => {
  const ilk = taramaPaketiOlustur(META, {
    kesifYapildi: false, hataliProfiller: [], engellenenler: [],
    profiller: [{ profil: null, yol: '/deneme/', baslik: '', ekranGoruntusu: null, notlar: [], kesifler: [], alanlar: [ham('#a', 'text', { etiket: 'A' }), ham('#b', 'text', { etiket: 'B' })] }]
  }).paket.model as TestModeli;
  // Kullanıcı modeli elle düzenlemiş: "a" alanının kimliği "adSoyad", senaryo anahtarı korunmalı.
  const alan = ilk.adimlar[0].bolumler[0].alanlar[0];
  alan.id = 'adSoyad';
  alan.eslesme = { senaryo: 'adSoyad' };
  const ikinci = taramaPaketiOlustur({ ...META, mevcutModel: ilk }, {
    kesifYapildi: false, hataliProfiller: [], engellenenler: [],
    profiller: [{ profil: null, yol: '/deneme/', baslik: '', ekranGoruntusu: null, notlar: [], kesifler: [], alanlar: [ham('#a', 'text', { etiket: 'A (yeni)', zorunlu: true }), ham('#c', 'text', { etiket: 'C' })] }]
  });
  expect(sayfaPaketiniDogrula(ikinci.paket).hatalar).toEqual([]);
  expect(ikinci.ozet).toMatchObject({ eslesenSayisi: 1, yeniAlanSayisi: 1, eslesmeyenSayisi: 1 });
  const bulgular = modelFarki(ilk, ikinci.paket.model as Record<string, unknown>).map((b: { tur: string; baslik: string }) => `${b.tur}: ${b.baslik}`);
  expect(bulgular.sort()).toEqual(['etiketDegisikligi: Etiket değişti: A (yeni)', 'yeniAlan: Yeni alan: C', 'zorunlulukDegisikligi: Zorunluluk: A (yeni)'].sort());
  expect(ikinci.paket.bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('1 alan taramada görülmedi')]));
});
