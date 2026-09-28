// OTOMATİK TARAMA MOTORU (tarayıcıyla, yerel fikstür) — scripts/platform/tarama/tarama-motoru.ts.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez. Uygulama 127.0.0.1'deki çok profilli fikstürdür (tarama-fikstur.ts);
// tarayıcı DNS çözümlemez (korumaliTarayici) ve tarama yalnızca fikstürün kökenine izin verir. Fikstür her isteği
// kaydeder: yalnızca giriş ve profil değiştirme POST'larının sunucuya ulaştığı doğrulanır.
import { expect, test, type Browser } from '@playwright/test';
import { girisTarifiniDogrula, type GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { taramaPaketiOlustur, type HamAlan, type TaramaEnvanteri } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import type { TaramaGirdisi, TaramaOlayi } from '../../scripts/platform/tarama/protokol.mjs';
import { hataBilgisi, taramayiYurut } from '../../scripts/platform/tarama/tarama-motoru';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { SALT_OKUNUR_DEGER, TARAMA_KULLANICI, TARAMA_PAROLA, TaramaFiksturu, YASAKLI_GORSEL_HOST, taramaGirisTarifi } from './tarama-fikstur';

test.describe.configure({ mode: 'serial' });

let tarayici: Browser;
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });

function tarif(ayar: { sms?: boolean } = {}): GirisTarifi {
  const d = girisTarifiniDogrula(taramaGirisTarifi(ayar));
  if (!d.tarif) throw new Error(d.hatalar.join(' '));
  return d.tarif;
}

function girdi(adres: string, ek: Partial<TaramaGirdisi> = {}): TaramaGirdisi {
  return {
    tabanUrl: adres, hedefAdres: `${adres}/basvuru/`, hedefYol: '/basvuru/', tarif: tarif(),
    kimlik: { kullaniciAdi: TARAMA_KULLANICI, parola: TARAMA_PAROLA, totpGizli: null, sabitKod: null, smsKipi: null },
    profiller: [{ ad: 'Standart', degerler: { profilKodu: 'P1' } }, { ad: 'Yetkili', degerler: { profilKodu: 'P2' } }],
    kesif: true, yasakKaliplari: ['*yasak-ornek*'], izinliKokenler: [adres], zamanAsimiMs: 120_000, ...ek
  };
}

const anahtarlar = (alanlar: HamAlan[]): string[] => alanlar.map((a) => a.anahtar);
const alan = (alanlar: HamAlan[], anahtar: string): HamAlan => {
  const a = alanlar.find((x) => x.anahtar === anahtar);
  if (!a) throw new Error(`${anahtar} yok: ${anahtarlar(alanlar).join(', ')}`);
  return a;
};

test('iki profille tam tarama: alanlar, etiketler, bölümler, keşif, geri alma, engellenen yazma istekleri', async () => {
  test.setTimeout(120_000);
  const fikstur = new TaramaFiksturu();
  const sunucu = await yerelSunucu(fikstur.isle);
  const olaylar: TaramaOlayi[] = [];
  let envanter: TaramaEnvanteri;
  try {
    envanter = await taramayiYurut(tarayici, girdi(sunucu.adres), async (o) => { olaylar.push(o); });
  } finally {
    await sunucu.kapat();
  }
  expect(envanter.profiller.map((p) => p.profil)).toEqual(['Standart', 'Yetkili']);
  const [standart, yetkili] = envanter.profiller;

  // Profile göre görünen alanlar (indirim yalnızca Yetkili'de); gizli (type=hidden) alan yok.
  const ortak = ['#urun', '#adSoyad', '#dogum', '#eposta', '#dil', 'radyo:odeme', '#kampanya', '#musteriNo', '#kanal', '#belge', '@ilgi=spor', '@ilgi=muzik'];
  expect(anahtarlar(standart.alanlar)).toEqual(ortak);
  expect(anahtarlar(yetkili.alanlar)).toEqual([...ortak.slice(0, 7), '#indirim', ...ortak.slice(7)]);
  expect(standart.yol).toBe('/basvuru/');

  const a = standart.alanlar;
  expect(alan(a, '#urun')).toMatchObject({
    tur: 'select', etiket: 'Ürün', etiketKaynagi: 'label', zorunlu: true, secici: '#urun', kirilganlik: 'dusuk',
    bolum: { baslik: 'Temel bilgiler' },
    secenekler: [{ deger: '', metin: 'Seçiniz' }, { deger: 'A', metin: 'Temel' }, { deger: 'B', metin: 'Geniş' }, { deger: 'C', metin: 'Kurumsal' }]
  });
  expect(alan(a, '#adSoyad')).toMatchObject({ tur: 'text', etiket: 'Ad Soyad', etiketKaynagi: 'sarmalayan', zorunlu: true });
  expect(alan(a, '#dogum')).toMatchObject({ tur: 'date', etiket: 'Doğum tarihi' });
  expect(alan(a, '#eposta')).toMatchObject({ tur: 'email', etiket: 'E-posta', zorunlu: false });
  expect(alan(a, 'radyo:odeme')).toMatchObject({
    tur: 'radio', etiket: 'Ödeme şekli', etiketKaynagi: 'aria', zorunlu: true, secici: 'input[type="radio"][name="odeme"]',
    bolum: { baslik: 'Ödeme' },
    radyolar: [{ deger: 'pesin', metin: 'Peşin', secici: '#odemePesin' }, { deger: 'taksit', metin: 'Taksitli', secici: '#odemeTaksit' }]
  });
  expect(alan(a, '#kampanya')).toMatchObject({ tur: 'checkbox', etiket: 'Kampanya onayı', bolum: { baslik: 'Ödeme' } });
  expect(alan(a, '#musteriNo')).toMatchObject({ etiket: 'Müşteri no', etiketKaynagi: 'yakin', saltOkunur: true, devreDisi: false });
  expect(alan(a, '#kanal')).toMatchObject({ devreDisi: true });
  expect(alan(a, '#belge')).toMatchObject({ tur: 'file', kabul: '.xlsx', bolum: { baslik: 'Belgeler' } });
  expect(alan(a, '@ilgi=spor')).toMatchObject({ tur: 'checkbox', etiket: 'Spor', grup: 'ilgi', secici: expect.stringContaining('ilgi') });
  expect(alan(yetkili.alanlar, '#indirim')).toMatchObject({ tur: 'number', etiket: 'İndirim oranı' });
  expect(standart.ekranGoruntusu?.length ?? 0).toBeGreaterThan(1000);

  // Keşif: ürün B → Ek teslimat, C → Vergi numarası; ilk değer geri alındı. Dil → sayfa başka adrese gitti.
  const urun = standart.kesifler.find((k) => k.secim === '#urun');
  expect(urun).toMatchObject({ ilkDeger: '', geriAlindi: true });
  const deger = (d: string) => urun?.degerler.find((x) => x.deger === d);
  expect(deger('A')?.gorunenler).toEqual([]);
  expect(anahtarlar(deger('B')?.gorunenler ?? [])).toEqual(['#ekTeslimat']);
  expect(anahtarlar(deger('C')?.gorunenler ?? [])).toEqual(['#vergiNo']);
  expect(deger('B')?.gorunenler[0]).toMatchObject({ etiket: 'Ek teslimat', tur: 'select', bolum: { baslik: 'Temel bilgiler' } });
  const dil = standart.kesifler.find((k) => k.secim === '#dil');
  expect(dil?.degerler).toEqual([expect.objectContaining({ deger: 'en', gezinme: '/basvuru/?dil=en' })]);
  expect(dil?.geriAlindi).toBe(true);

  // Yalnızca giriş ve profil değiştirme POST'ları sunucuya ulaştı; gönder düğmesi/bağlantı/otomatik kaydet hiç gelmedi.
  expect(fikstur.postlar()).toEqual(['POST /giris', 'POST /profil', 'POST /profil']);
  const yollar = fikstur.kayitlar.map((k) => k.yol);
  expect(yollar).not.toContain('/basvuru/kaydet');
  expect(yollar).not.toContain('/basvuru/sil');
  expect(yollar).not.toContain('/basvuru/otomatik-kaydet');
  // Otomatik kaydet XHR'ı (her ürün değişikliğinde) ve C'deki requestSubmit ağ katmanında engellendi.
  const yazma = envanter.engellenenler.filter((e) => e.neden === 'yazma');
  expect(yazma.length).toBeGreaterThanOrEqual(4);
  expect(new Set(yazma.map((e) => `${e.yontem} ${new URL(e.adres).pathname} ${e.asama}`))).toEqual(new Set(['POST /basvuru/otomatik-kaydet tarama']));
  // Yasaklı host'a (görsel) giden istek her profilde engellendi; yasak örnek alan adına istek sunucuya ulaşmadı.
  expect(envanter.engellenenler.filter((e) => e.neden === 'yasakli').map((e) => new URL(e.adres).hostname)).toContain(YASAKLI_GORSEL_HOST);
  expect(fikstur.kayitlar.filter((k) => SIRKET_DESENI.test(k.yol))).toEqual([]);
  // İlerleme olayları.
  expect(olaylar).toEqual(expect.arrayContaining([
    // Varsayılan giriş kipi (Ayarlar > Koşu > Tarama ve akış kaydı): her seferinde baştan giriş; yöntem olayda ve adım mesajında.
    { tur: 'giris', yontem: 'bastanGiris' }, { tur: 'adim', adim: 'giris', durum: 'tamam', mesaj: 'Baştan giriş yapıldı.' }, { tur: 'profil', sira: 1, durum: 'suruyor', adim: 'kesif' },
    expect.objectContaining({ tur: 'profil', sira: 0, durum: 'tamam', alanSayisi: 14 }), expect.objectContaining({ tur: 'profil', sira: 1, durum: 'tamam', alanSayisi: 15 })
  ]));

  // Paket: doğrulayıcıdan geçer, değer taşımaz; görünürlük koşulları ve bağlam gözlemi doğru.
  const { paket, ozet } = taramaPaketiOlustur({
    ekranAnahtari: 'ornek-basvuru', ekranAdi: 'Örnek Başvuru', urlYolu: '/basvuru/', girisGerekli: true, ikiAsamali: 'yok', baglamTuru: 'Profil'
  }, envanter);
  const d = sayfaPaketiniDogrula(paket);
  expect(d.hatalar).toEqual([]);
  expect(ozet).toMatchObject({ alanSayisi: 15, kosulSayisi: 2, kanitSayisi: 2 });
  const metin = JSON.stringify({ ...paket, kanitlar: undefined }); // kanıtlar base64 PNG
  for (const gizli of [SALT_OKUNUR_DEGER, TARAMA_PAROLA, TARAMA_KULLANICI, 'gizli-token-degeri', 'profilKodu', '"P1"', '"P2"']) expect(metin.includes(gizli), gizli).toBe(false);
  const model = paket.model as { kosullar: Record<string, { ifade: unknown }>; baglamGorunurlugu: { alanlar: Record<string, unknown> }; adimlar: Array<{ bolumler: Array<{ baslik: string; alanlar: Array<Record<string, unknown>> }> }> };
  expect(model.kosullar.ekTeslimatGorunur.ifade).toEqual({ alan: 'urun', esit: 'B' });
  expect(model.kosullar.vergiNoGorunur.ifade).toEqual({ alan: 'urun', esit: 'C' });
  expect(model.baglamGorunurlugu.alanlar.indirim).toEqual({ Standart: false, Yetkili: true });
  expect(model.baglamGorunurlugu.alanlar.urun).toEqual({ Standart: true, Yetkili: true });
  expect(model.adimlar[0].bolumler.map((b) => b.baslik)).toEqual(['Temel bilgiler', 'Ödeme', 'Belgeler']);
  const tumAlanlar = model.adimlar[0].bolumler.flatMap((b) => b.alanlar);
  expect(tumAlanlar.find((x) => x.id === 'ekTeslimat')).toMatchObject({ tip: 'secim', gorunurluk: { kosul: 'ekTeslimatGorunur' } });
  expect(tumAlanlar.find((x) => x.id === 'odeme')).toMatchObject({ tip: 'radyo', secenekler: [{ deger: 'pesin', metin: 'Peşin', secici: '#odemePesin' }, { deger: 'taksit', metin: 'Taksitli', secici: '#odemeTaksit' }] });
  expect(tumAlanlar.find((x) => x.id === 'belge')).toMatchObject({ tip: 'dosya', kabul: '.xlsx', eslesme: { senaryo: 'belge' } });
  expect(tumAlanlar.find((x) => x.id === 'musteriNo')).toMatchObject({ yapilandirma: 'dokunulmuyor' });
  expect(tumAlanlar.find((x) => x.id === 'dogum')).toMatchObject({ tip: 'tarih' });
  expect(paket.bilinmeyenler).toEqual(expect.arrayContaining([
    'Adım/aksiyon tanımları (düğmeler, başarı göstergeleri) otomatik çıkarılamadı — yapay zekâ aracınızla (ekran paketi) ya da akış kaydıyla tamamlayın.',
    expect.stringContaining('"Dil" = "English" seçilince sayfa başka bir adrese gitti (/basvuru/?dil=en)'),
    expect.stringContaining('yazma isteği engellendi')
  ]));
});

test('keşif kapalı: seçimlere dokunulmaz, otomatik kaydet tetiklenmez', async () => {
  test.setTimeout(60_000);
  const fikstur = new TaramaFiksturu();
  const sunucu = await yerelSunucu(fikstur.isle);
  try {
    const e = await taramayiYurut(tarayici, girdi(sunucu.adres, { kesif: false, profiller: [{ ad: 'Yetkili', degerler: { profilKodu: 'P2' } }] }), async () => {});
    expect(e.profiller[0].kesifler).toEqual([]);
    expect(e.engellenenler.filter((x) => x.neden === 'yazma')).toEqual([]);
    expect(fikstur.postlar()).toEqual(['POST /giris', 'POST /profil']);
  } finally {
    await sunucu.kapat();
  }
});

test('açık hatalar: yanlış parola, CAPTCHA; yasaklı adreste hiçbir istek gitmeden red', async () => {
  test.setTimeout(60_000);
  const fikstur = new TaramaFiksturu({ captcha: true });
  const sunucu = await yerelSunucu(fikstur.isle);
  try {
    const kimlikHatasi = await taramayiYurut(tarayici, girdi(sunucu.adres, {
      tarif: girisTarifiniDogrula({ ...taramaGirisTarifi(), girisAdresi: '/giris' }).tarif,
      kimlik: { kullaniciAdi: TARAMA_KULLANICI, parola: 'yanlis-parola', totpGizli: null, sabitKod: null, smsKipi: null }
    }), async () => {}).then(() => null, (h: unknown) => hataBilgisi(h));
    // CAPTCHA'lı giriş sayfası: giriş formu doldurulmadan durur.
    expect(kimlikHatasi?.kod).toBe('CAPTCHA');
    expect(kimlikHatasi?.mesaj).toContain('CAPTCHA algılandı');
    expect(fikstur.postlar()).toEqual([]);
  } finally {
    await sunucu.kapat();
  }

  const normal = new TaramaFiksturu();
  const s2 = await yerelSunucu(normal.isle);
  try {
    const h = await taramayiYurut(tarayici, girdi(s2.adres, {
      kimlik: { kullaniciAdi: TARAMA_KULLANICI, parola: 'yanlis-parola', totpGizli: null, sabitKod: null, smsKipi: null }
    }), async () => {}).then(() => null, (e: unknown) => hataBilgisi(e));
    expect(h?.kod).toBe('KIMLIK_HATALI');
    expect(h?.mesaj).toContain('Kullanıcı adı veya parola hatalı');
    expect(h?.mesaj).not.toContain('yanlis-parola');

    const once = normal.kayitlar.length;
    const y = await taramayiYurut(tarayici, girdi(s2.adres, { yasakKaliplari: ['127.0.0.*'] }), async () => {}).then(() => null, (e: unknown) => hataBilgisi(e));
    expect(y?.kod).toBe('YASAKLI_ADRES');
    expect(y?.mesaj).toMatch(/^Tarama reddedildi: 127\.0\.0\.1 adresi yasaklı adres kalıbına \("127\.0\.0\.\*"\) uyuyor/);
    expect(normal.kayitlar.length).toBe(once);
  } finally {
    await s2.kapat();
  }
});
