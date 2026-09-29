// GENİŞLETİLMİŞ SEÇİM KEŞFİ (tarama-motoru.ts) ve "Düğmeyi ve sonucu işaretle"nin saf kuralları (oge-isaretleri.mjs).
// Güvenlik: şirket sitesine HİÇBİR istek gitmez. Uygulama 127.0.0.1'deki sahte fiyat formudur (hesap-formu-fikstur.ts); tarayıcı
// DNS çözümlemez (korumaliTarayici) ve tarama yalnızca fikstürün kökenine izin verir. Fikstür her isteği kaydeder: kayıt oluşturan
// "Kaydet" düğmesine keşifte hiç basılmadığı (sayfanın kendi betiği bassa da) doğrulanır.
import { expect, test, type Browser } from '@playwright/test';
import { girisTarifiniDogrula } from '../../scripts/platform/giris/tarif.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { kesifGuvenligi } from '../../scripts/platform/tarama/koruma.mjs';
import { taramaPaketiOlustur, type HamAlan, type TaramaEnvanteri } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { kesifBulgulari, secilenOgeleriAyikla, taramaIsaretleriniUygula, type SecilenOge } from '../../scripts/platform/tarama/oge-isaretleri.mjs';
import { adaySirasi } from '../../scripts/platform/tarama/oge-secme-motoru';
import type { TaramaGirdisi } from '../../scripts/platform/tarama/protokol.mjs';
import { taramayiYurut } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { HESAP_KULLANICI, HESAP_PAROLA, HesapFormuUygulamasi, hesapGirisTarifi } from './hesap-formu-fikstur';

type Nesne = Record<string, any>;
const META = { ekranAnahtari: 'fiyat-hesaplama', ekranAdi: 'Fiyat Hesaplama', urlYolu: '/hesap/', girisGerekli: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const modelAlanlari = (m: Nesne): Nesne[] => (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));

test.describe.configure({ mode: 'serial' });
let tarayici: Browser;
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });

test('güvenli düğme kuralı (keşif): yalnız seçimler; kayıt / gönderim çağrıştıran seçim, devre dışı alan ve düğme denenmez', () => {
  const a = (tur: string, etiket: string, ek: Partial<HamAlan> = {}) => ({ tur, etiket, ad: null, kimlik: null, ...ek });
  expect(kesifGuvenligi(a('select', 'İl'))).toEqual({ guvenli: true });
  expect(kesifGuvenligi(a('radio', 'Müşteri tipi', { radyolar: [{ deger: 'b', metin: 'Bireysel', secici: null }] }))).toEqual({ guvenli: true });
  expect(kesifGuvenligi(a('checkbox', 'Hediye paketi'))).toEqual({ guvenli: true });
  expect(kesifGuvenligi(a('checkbox', 'Ödeme şekli'))).toEqual({ guvenli: true });
  for (const riskli of ['Kaydı onaylıyorum', 'Otomatik kaydet', 'Formu gönder', 'Sözleşmeyi kabul ediyorum', 'Accept terms', 'Siparişi tamamla', 'Kaydı sil']) {
    expect(kesifGuvenligi(a('checkbox', riskli)), riskli).toMatchObject({ guvenli: false, neden: expect.stringContaining('kayıt / gönderim') });
  }
  expect(kesifGuvenligi(a('radio', 'Seçim', { radyolar: [{ deger: 'x', metin: 'Hemen öde', secici: null }] }))).toMatchObject({ guvenli: false });
  expect(kesifGuvenligi(a('checkbox', 'Hediye paketi', { devreDisi: true }))).toMatchObject({ guvenli: false, neden: 'devre dışı ya da salt okunur' });
  for (const tur of ['submit', 'button', 'text']) expect(kesifGuvenligi(a(tur, 'Hesapla')), tur).toMatchObject({ guvenli: false });
});

test('tek taramada: radyo ve onay kutusuna bağlı koşullu alanlar, İl → İlçe bağımlı listesi; kayıt düğmesine basılmaz', async () => {
  test.setTimeout(120_000);
  const uygulama = new HesapFormuUygulamasi();
  const sunucu = await yerelSunucu(uygulama.isle);
  let envanter: TaramaEnvanteri;
  try {
    const tarif = girisTarifiniDogrula(hesapGirisTarifi()).tarif;
    if (!tarif) throw new Error('tarif geçersiz');
    const g: TaramaGirdisi = {
      tabanUrl: sunucu.adres, hedefAdres: `${sunucu.adres}/hesap/`, hedefYol: '/hesap/', tarif,
      kimlik: { kullaniciAdi: HESAP_KULLANICI, parola: HESAP_PAROLA, totpGizli: null, sabitKod: null, smsKipi: null },
      profiller: [{ ad: null, degerler: null }], kesif: true, yasakKaliplari: ['*yasak-ornek*'], izinliKokenler: [sunucu.adres], zamanAsimiMs: 120_000
    };
    envanter = await taramayiYurut(tarayici, g, async () => undefined);
  } finally {
    await sunucu.kapat();
  }
  const p = envanter.profiller[0];
  // Temel ekranda görünenler (Kurumsal / Hediye paketi alanları gizli; İlçe devre dışı).
  expect(p.alanlar.map((a) => a.anahtar)).toEqual(['radyo:musteriTipi', '#adSoyad', '#hediyePaketi', '#bulten', '#il', '#ilce']);
  const kesif = (anahtar: string) => p.kesifler.find((k) => k.secim === anahtar);
  // Radyo: Kurumsal → Vergi No + Unvan; geri alındı (Bireysel).
  expect(kesif('radyo:musteriTipi')).toMatchObject({ tur: 'radyo', ilkDeger: 'bireysel', geriAlindi: true });
  expect(kesif('radyo:musteriTipi')?.degerler.map((d) => [d.deger, d.gorunenler.map((a) => a.anahtar)])).toEqual([['kurumsal', ['#vergiNo', '#unvan']]]);
  // Onay kutusu: işaretli → Paket türü; geri alındı.
  expect(kesif('#hediyePaketi')).toMatchObject({ tur: 'onay', ilkDeger: 'false', geriAlindi: true });
  expect(kesif('#hediyePaketi')?.degerler.map((d) => [d.deger, d.gorunenler.map((a) => a.anahtar)])).toEqual([['true', ['#paketTuru']]]);
  // İl: her ilde İlçe etkinleşir ve seçenekleri değişir (bağımlı liste); geri alındı.
  const il = kesif('#il');
  expect(il).toMatchObject({ tur: 'secim', ilkDeger: '', geriAlindi: true });
  expect(il?.degerler.map((d) => [d.deger, d.etkinlesenler, (d.secenekler?.['#ilce'] ?? []).map((s) => s.deger)])).toEqual([
    ['06', ['#ilce'], ['', 'cankaya', 'kecioren']], ['34', ['#ilce'], ['', 'kadikoy', 'besiktas', 'uskudar']], ['35', ['#ilce'], ['', 'konak', 'bornova']]
  ]);
  // Bülten denendi; sayfanın betiği "Kaydet"e basmaya çalıştı ama tıklama yutuldu.
  expect(kesif('#bulten')).toMatchObject({ tur: 'onay', geriAlindi: true });

  // GÜVENLİK: kayıt düğmesine hiç basılmadı (ne tıklama isteği ne form gönderimi); Hesapla'ya da basılmadı.
  expect(uygulama.kayitBasmalari).toBe(0);
  expect(uygulama.kayitGonderimleri).toBe(0);
  expect(uygulama.hesaplamalar).toEqual([]);
  expect(uygulama.istekler.filter((x) => x.startsWith('POST'))).toEqual(['POST /giris']);
  expect(uygulama.istekler).toEqual(expect.arrayContaining(['GET /ilceler']));

  // Paket: koşullar (radyo, onay kutusu), bağımlı liste, etkinleşen İlçe senaryoda; doğrulayıcıdan geçer.
  const { paket, ozet } = taramaPaketiOlustur(META, envanter);
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  expect(ozet).toMatchObject({ kosulSayisi: 3, bagimlilikSayisi: 1 });
  const m = paket.model as Nesne;
  expect(m.kosullar.vergiNoGorunur).toMatchObject({ ifade: { alan: 'musteriTipi', esit: 'kurumsal' }, aciklama: expect.stringContaining('Müşteri tipi = Kurumsal seçilince görünür') });
  expect(m.kosullar.unvanGorunur.ifade).toEqual({ alan: 'musteriTipi', esit: 'kurumsal' });
  expect(m.kosullar.paketTuruGorunur).toMatchObject({ ifade: { alan: 'hediyePaketi', esit: true }, aciklama: expect.stringContaining('Hediye paketi işaretli iken görünür') });
  const alanlar = modelAlanlari(m);
  const ilce = alanlar.find((a) => a.id === 'ilce') as Nesne;
  expect(ilce).toMatchObject({
    tip: 'secim', yapilandirma: 'senaryo', seceneklerDurumu: 'tam',
    bagimlilik: { alan: 'il', secenekHaritasi: { '06': [{ deger: 'cankaya', metin: 'Çankaya' }, { deger: 'kecioren', metin: 'Keçiören' }], '35': [{ deger: 'konak', metin: 'Konak' }, { deger: 'bornova', metin: 'Bornova' }] } }
  });
  expect(ilce.secenekler).toHaveLength(7);
  expect(ilce.notlar).toEqual(expect.arrayContaining([expect.stringContaining('"İl" seçilince etkinleşiyor'), expect.stringContaining('Seçenekleri "İl" seçimine bağlı')]));
  expect(paket.bilinmeyenler).not.toEqual(expect.arrayContaining([expect.stringContaining('Seçim keşfi kapalıydı')]));
  // Önizlemede onaya sunulan bulgular.
  expect(kesifBulgulari(m).map((b) => b.anahtar)).toEqual(['gorunurluk:vergiNo', 'gorunurluk:unvan', 'gorunurluk:paketTuru', 'bagimlilik:ilce']);
});

const DUGME: SecilenOge = { tur: 'dugme', secici: 'role=button[name="Hesapla"]', kirilganlik: 'dusuk', seciciTuru: 'rol', metin: 'Hesapla' };
const SONUC: SecilenOge = { tur: 'sonuc', secici: '#sonuc', kirilganlik: 'dusuk', seciciTuru: 'kimlik', metin: 'Tutar: 1.234 TL' };

test('işaretleri uygulama: düğme → aksiyon + İşlemler, sonuç → çıktı + başarı (sabit metin), alan, hata göstergesi; reddedilen bulgu yazılmaz', () => {
  const alan = (anahtar: string, tur: string, ek: Partial<HamAlan> = {}): HamAlan => ({
    anahtar, tur, etiket: anahtar.slice(1), etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: anahtar.slice(1), secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
    zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'g', baslik: 'Genel' }, ...ek
  });
  const env: TaramaEnvanteri = {
    profiller: [{
      profil: null, yol: '/hesap/', baslik: 'Tutar', ekranGoruntusu: null, notlar: [],
      alanlar: [alan('#tip', 'select', { secenekler: [{ deger: 'a', metin: 'A' }, { deger: 'b', metin: 'B' }] }), alan('#ad', 'text')],
      kesifler: [{ secim: '#tip', ilkDeger: 'a', geriAlindi: true, tur: 'secim', degerler: [{ deger: 'b', metin: 'B', gorunenler: [alan('#ek', 'text')], kaybolanlar: [], gezinme: null }] }]
    }],
    hataliProfiller: [], engellenenler: [], kesifYapildi: true
  };
  const { paket } = taramaPaketiOlustur(META, env);
  const m0 = paket.model as Nesne;
  expect(m0.semaSurumu).toBe(1);
  expect(kesifBulgulari(m0)).toEqual([{ anahtar: 'gorunurluk:ek', tur: 'gorunurluk', alanId: 'ek', etiket: 'ek', aciklama: 'tip = B seçilince görünür.' }]);
  const secilen = secilenOgeleriAyikla([
    DUGME, SONUC, { tur: 'hata', secici: '#uyari', kirilganlik: 'dusuk', seciciTuru: 'kimlik', metin: null },
    { tur: 'alan', secici: 'role=textbox[name="Not"]', kirilganlik: 'dusuk', seciciTuru: 'rol', metin: 'Not', alanTuru: 'textarea' }
  ]);
  expect(secilen.hatalar).toEqual([]);
  const { paket: p, ozet } = taramaIsaretleriniUygula(paket, { ogeler: secilen.ogeler, reddedilenler: ['gorunurluk:ek'] });
  expect(ozet).toEqual({ dugme: 1, sonuc: 1, alan: 1, basari: 0, hata: 1, reddedilen: 1 });
  expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
  const m = p.model as Nesne;
  expect(m.semaSurumu).toBe(2);
  const adim = (m.adimlar as Nesne[])[0];
  expect(adim.kosu).toEqual({
    aksiyonlar: [{ tur: 'tikla', secici: 'role=button[name="Hesapla"]', aciklama: 'Hesapla' }],
    basariGostergesi: { tur: 'metin', deger: 'Tutar', secici: '#sonuc' }, hataGostergesi: { secici: '#uyari' }
  });
  const bolumler = adim.bolumler as Nesne[];
  expect(bolumler.map((b) => b.baslik)).toEqual(['Genel', 'Sayfada seçilen alanlar', 'İşlemler']);
  expect(bolumler[2].alanlar).toEqual([
    expect.objectContaining({ tip: 'buton', yapilandirma: 'aksiyon', etiket: { ekran: 'Hesapla' }, konum: { secici: 'role=button[name="Hesapla"]', kirilganlik: 'dusuk' } }),
    expect.objectContaining({ tip: 'cikti', yapilandirma: 'cikti', etiket: { ekran: 'Tutar' }, konum: { secici: '#sonuc', kirilganlik: 'dusuk' } })
  ]);
  expect(bolumler[1].alanlar[0]).toMatchObject({ tip: 'metin', yapilandirma: 'senaryo', konum: { secici: 'role=textbox[name="Not"]' } });
  // Reddedilen koşul: alan kalır, görünürlüğü ve kullanılmayan koşul silinir.
  expect(modelAlanlari(m).find((a) => a.id === 'ek')?.gorunurluk).toBeUndefined();
  expect(m.kosullar).toEqual({});
  expect(p.bilinmeyenler).not.toContain('Adım/aksiyon tanımları (düğmeler, başarı göstergeleri) otomatik çıkarılamadı — yapay zekâ aracınızla (ekran paketi) ya da akış kaydıyla tamamlayın.');
  // Asıl paket değişmedi (tekrar uygulanabilir).
  expect((paket.model as Nesne).semaSurumu).toBe(1);
  // Başarı göstergesi seçilirse sonuçtan önce gelir; metinsiz sonuçta "boş değil" deseni.
  const b = taramaIsaretleriniUygula(paket, { ogeler: [{ ...SONUC, metin: null }, { tur: 'basari', secici: '#tamam', kirilganlik: 'dusuk', seciciTuru: 'kimlik', metin: 'Sipariş hazır' }] });
  expect((b.paket.model as Nesne).adimlar[0].kosu).toEqual({ basariGostergesi: { tur: 'metin', deger: 'Sipariş hazır', secici: '#tamam' } });
  const c = taramaIsaretleriniUygula(paket, { ogeler: [DUGME, { ...SONUC, metin: '12' }] });
  expect((c.paket.model as Nesne).adimlar[0].kosu.basariGostergesi).toEqual({ tur: 'desen', deger: '\\S', secici: '#sonuc' });
});

test('seçilen öğe doğrulaması ve seçici sırası (önce rol ve metin, sonra kimlik ve etiket, son çare CSS)', () => {
  expect(secilenOgeleriAyikla('x').hatalar).toEqual(['Seçilen öğeler okunamadı.']);
  expect(secilenOgeleriAyikla([{ ...DUGME, tur: 'baska' }]).hatalar[0]).toContain('türü');
  expect(secilenOgeleriAyikla([{ ...DUGME, secici: 'https://ornek.invalid/' }]).hatalar[0]).toContain('seçicisi geçersiz');
  expect(secilenOgeleriAyikla([{ ...DUGME, tur: 'alan' }]).hatalar[0]).toContain('türünü seçin');
  expect(secilenOgeleriAyikla([SONUC], ['dugme', 'alan']).hatalar[0]).toContain('türü');
  const adaylar = [
    { secici: 'div > p:nth-of-type(2)', kirilganlik: 'yuksek' as const, tur: 'css' as const },
    { secici: '#hesapla', kirilganlik: 'dusuk' as const, tur: 'kimlik' as const },
    { secici: 'button:text-is("Hesapla")', kirilganlik: 'orta' as const, tur: 'metin' as const },
    { secici: 'role=button[name="Hesapla"]', kirilganlik: 'dusuk' as const, tur: 'rol' as const },
    { secici: 'button[name="h"]', kirilganlik: 'dusuk' as const, tur: 'etiket' as const }
  ];
  expect(adaySirasi(adaylar, 'dugme').map((a) => a.tur)).toEqual(['rol', 'metin', 'kimlik', 'etiket', 'css']);
  // Sonuçta rakamlı (değişken) rol / metin seçicileri atlanır; kimlik öne geçer.
  const sonuc = [
    { secici: 'role=status[name="Tutar: 1.234 TL"]', kirilganlik: 'orta' as const, tur: 'rol' as const },
    { secici: 'p:text-is("Tutar: 1.234 TL")', kirilganlik: 'yuksek' as const, tur: 'metin' as const },
    { secici: 'role=status', kirilganlik: 'orta' as const, tur: 'rolAdsiz' as const },
    { secici: '#sonuc', kirilganlik: 'dusuk' as const, tur: 'kimlik' as const }
  ];
  expect(adaySirasi(sonuc, 'sonuc').map((a) => a.secici)).toEqual(['#sonuc', 'role=status']);
});
