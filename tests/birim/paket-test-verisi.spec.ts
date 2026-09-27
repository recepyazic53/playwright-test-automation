// KORUMA TESTLERİ — Sayfa paketinin TEST VERİSİ bölümü: biçim doğrulaması (gizli sütun, bağlantılar, senaryo önerileri
// tablodaki değerle), seçenek gözlemlerinden tablo üretimi (bağımlı listelerde kombinasyon satırları), otomatik tarama ve
// akış kaydı paketlerine aktarım, kayıt panelinin açılan liste okuması (yerel sahte sayfa; ağ yok) ve onaylanan seçimle
// yazma (yeni / birleştir / yeni ad / atla; kaynak; alan bağlantıları). Tüm değerler SAHTEDİR.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranAyarlariniGetir, ekranModeliGetir, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { analizGetir, analizUygula, analizYukle, claudeDosyasiYaz, modeliPaketleDegistir, paketOnizle, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { MEVCUT_TABLO_KURALI } from '../../scripts/platform/ekranlar/paket-istekleri.mjs';
import { adimlardanBloklar, akisKaydet, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { ekranListesiTabloAdi, paketListeleri, paketTablolari, secenekTablolariUret } from '../../scripts/platform/tablolar/paket-tablolari.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { kayitPaketiOlustur, taramaPaketiOlustur, type HamAlan, type PaketMetasi } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { acikListeSecenekleri } from '../../scripts/platform/tarama/kayit-paneli';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';

type Nesne = Record<string, any>;
const V1 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'sayfa-paketi', 'ornek-rota-v1.json'), 'utf-8')) as Nesne;
const V2 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'sayfa-paketi', 'ornek-rota-v2.json'), 'utf-8')) as Nesne;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;

const TEST_VERISI = {
  tablolar: [
    {
      ad: 'Kapsam - Alternatif', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }],
      satirlar: [['EKSPRES', 'HIZLI TESLİMAT'], ['EKSPRES', 'ROTA PAKET'], ['STANDART', 'ADRESE TESLİM'], ['STANDART', 'ROTA PAKET'], ['EKSPRES', 'ROTA PAKET']]
    },
    { ad: 'Taksit', sutunlar: [{ ad: 'Taksit' }], satirlar: [['Tek çekim'], ['3 taksit'], ['6 taksit']] },
    { ad: 'Servis girişi', sutunlar: [{ ad: 'Kullanıcı' }, { ad: 'Parola', gizli: true }], satirlar: [['kanal-1', null]] }
  ],
  baglantilar: [
    { alanId: 'kapsam', tablo: 'Kapsam - Alternatif', sutun: 'Kapsam' },
    { alanId: 'alternatif', tablo: 'Kapsam - Alternatif', sutun: 'Alternatif' },
    { alanId: 'taksitSayisi', tablo: 'Taksit', sutun: 'Taksit' }
  ]
};
const paketTV = (ek: Nesne = {}): Nesne => ({ ...kopya(V1), testVerisi: kopya(TEST_VERISI), ...ek });

test.describe('Sayfa paketi — testVerisi doğrulaması', () => {
  test('geçerli bölüm: tekrar satır uyarı; görünen metnin sayfa değeri bağlı alanın modelinden karşılık olur', () => {
    const d = sayfaPaketiniDogrula(paketTV());
    expect(d.hatalar).toEqual([]);
    expect(d.uyarilar.map((u) => u.yer)).toContain('testVerisi.tablolar[0].satirlar');
    const { tablolar, baglantilar } = paketTablolari(paketTV().testVerisi, V1.model);
    expect(tablolar[0].satirlar).toHaveLength(4);
    expect(tablolar[1].sutunlar[0].karsiliklar).toEqual({ 'Tek çekim': { sayfa: '1' }, '3 taksit': { sayfa: '3' }, '6 taksit': { sayfa: '6' } });
    expect(tablolar[2].sutunlar[1]).toMatchObject({ ad: 'Parola', gizli: true });
    expect(baglantilar.map((b) => b.alanId)).toEqual(['kapsam', 'alternatif', 'taksitSayisi']);
  });

  test('gizli sütuna değer, gizli adlı işaretsiz sütun, bilinmeyen alan / sütun, tekrar eden tablo adı', () => {
    const p = paketTV();
    p.testVerisi.tablolar[2].satirlar = [['kanal-1', 'gizli-deger-1']];
    p.testVerisi.tablolar.push({ ad: 'Giriş', sutunlar: [{ ad: 'Şifre' }], satirlar: [] });
    p.testVerisi.tablolar.push({ ad: 'taksit', sutunlar: [{ ad: 'X' }], satirlar: [] });
    p.testVerisi.baglantilar.push({ alanId: 'yokAlan', tablo: 'Taksit', sutun: 'Taksit' }, { alanId: 'ekHizmet', tablo: 'Taksit', sutun: 'Yok' },
      { alanId: 'plan', tablo: 'Servis girişi', sutun: 'Parola' });
    const d = sayfaPaketiniDogrula(p);
    const yerler = d.hatalar.map((h) => h.yer);
    expect(yerler).toContain('testVerisi.tablolar[2].satirlar[0][1]');
    expect(yerler).toContain('testVerisi.tablolar[4].ad');
    expect(yerler).toContain('testVerisi.baglantilar[3].alanId');
    expect(yerler).toContain('testVerisi.baglantilar[4].sutun');
    expect(yerler).toContain('testVerisi.baglantilar[5].alanId'); // "plan" senaryoda ayarlanmıyor
    expect(yerler).toContain('testVerisi.baglantilar[5].sutun'); // gizli sütuna bağlanmaz
    expect(d.uyarilar.some((u) => u.yer === 'testVerisi.tablolar[3].sutunlar[0].ad' && /gizli/.test(u.mesaj))).toBe(true);
    // Gizli adlı sütunda değer: hata.
    const q = paketTV();
    q.testVerisi.tablolar.push({ ad: 'Giriş', sutunlar: [{ ad: 'Parola' }], satirlar: [['deneme-1']] });
    expect(sayfaPaketiniDogrula(q).hatalar.map((h) => h.yer)).toContain('testVerisi.tablolar[3].satirlar[0][0]');
    // Hücrede kart numarası kalıbı: genel gizli değer taraması reddeder.
    const k = paketTV();
    k.testVerisi.tablolar[1].satirlar.push(['4111 1111 1111 1111']);
    expect(sayfaPaketiniDogrula(k).gecerli).toBe(false);
    // Bilinmeyen anahtar.
    expect(sayfaPaketiniDogrula(paketTV({ testVerisi: { tablolar: [], fazla: 1 } })).hatalar.map((h) => h.yer)).toContain('testVerisi.fazla');
  });

  test('senaryo önerileri tabloya bağlı alanda tablodaki değerle doğrulanır', () => {
    // Öneri 0 taksitSayisi = "1" (sayfa değeri) yazıyor: tabloya bağlıyken geçersiz; tablodaki değer ("Tek çekim") geçerli.
    const once = sayfaPaketiniDogrula(paketTV());
    expect(once.senaryoSorunlari[0].some((s) => s.alan === 'taksitSayisi')).toBe(true);
    const p = paketTV();
    p.senaryoOnerileri[0].veri.taksitSayisi = 'Tek çekim';
    expect(sayfaPaketiniDogrula(p).senaryoSorunlari[0]).toEqual([]);
    // Liste modele uygulanınca seçenek sayfa değeriyle seçilir, senaryoya tablodaki değer yazılır.
    const m = modeleListeleriUygula(V1.model, paketListeleri(p.testVerisi, V1.model) as never) as Nesne;
    const taksit = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar)).find((a: Nesne) => a.id === 'taksitSayisi');
    expect(taksit.secenekler[0]).toMatchObject({ deger: '1', senaryoDegeri: 'Tek çekim' });
  });
});

test.describe('Seçenek gözlemlerinden tablolar', () => {
  const alanlar = [
    { anahtar: '#il', id: 'il', etiket: 'İl', secenekler: [{ deger: '34', metin: 'İstanbul' }, { deger: '06', metin: 'Ankara' }] },
    { anahtar: '#ilce', id: 'ilce', etiket: 'İlçe', secenekler: [{ deger: '34-1', metin: 'Kadıköy' }, { deger: '34-2', metin: 'Üsküdar' }] },
    { anahtar: '#tip', id: 'tip', etiket: 'Müşteri tipi', secenekler: [{ deger: 'B', metin: 'Bireysel' }, { deger: 'K', metin: 'Kurumsal' }] },
    { anahtar: '#soru', id: 'guvenlikSorusu', etiket: 'Güvenlik sorusu', secenekler: [{ deger: '1', metin: 'İlk okul' }, { deger: '2', metin: 'Doğum yeri' }] }
  ];
  const gozlemler: Array<{ anahtar: string; secimler: Record<string, string>; secenekler: Array<{ deger: string; metin: string }> }> = [
    { anahtar: '#ilce', secimler: { '#il': '34', '#tip': 'B' }, secenekler: [{ deger: '34-1', metin: 'Kadıköy' }, { deger: '34-2', metin: 'Üsküdar' }] },
    { anahtar: '#ilce', secimler: { '#il': '34', '#tip': 'K' }, secenekler: [{ deger: '34-1', metin: 'Kadıköy' }, { deger: '34-2', metin: 'Üsküdar' }] },
    { anahtar: '#ilce', secimler: { '#il': '06', '#tip': 'B' }, secenekler: [{ deger: '06-1', metin: 'Çankaya' }] },
    { anahtar: '#tip', secimler: { '#il': '34' }, secenekler: [{ deger: 'B', metin: 'Bireysel' }, { deger: 'K', metin: 'Kurumsal' }] },
    { anahtar: '#tip', secimler: { '#il': '06' }, secenekler: [{ deger: 'B', metin: 'Bireysel' }, { deger: 'K', metin: 'Kurumsal' }] }
  ];

  test('bağımlı liste üst seçimle aynı tabloda (satır = kombinasyon); bağımsız liste tek sütun; gizli alan alınmaz; ad "<Ekran> — <Alan>", tür liste', () => {
    const { testVerisi, notlar } = secenekTablolariUret({ alanlar, gozlemler, ekranAdi: 'Adres formu' });
    expect(testVerisi?.tablolar).toEqual([
      {
        ad: 'Adres formu — İl - İlçe', tur: 'liste',
        sutunlar: [{ ad: 'İl', karsiliklar: { İstanbul: { sayfa: '34' }, Ankara: { sayfa: '06' } } }, { ad: 'İlçe', karsiliklar: { Kadıköy: { sayfa: '34-1' }, Üsküdar: { sayfa: '34-2' }, Çankaya: { sayfa: '06-1' } } }],
        satirlar: [['İstanbul', 'Kadıköy'], ['İstanbul', 'Üsküdar'], ['Ankara', 'Çankaya']]
      },
      { ad: 'Adres formu — Müşteri tipi', tur: 'liste', sutunlar: [{ ad: 'Müşteri tipi', karsiliklar: { Bireysel: { sayfa: 'B' }, Kurumsal: { sayfa: 'K' } } }], satirlar: [['Bireysel'], ['Kurumsal']] }
    ]);
    expect(testVerisi?.baglantilar).toEqual([
      { alanId: 'il', tablo: 'Adres formu — İl - İlçe', sutun: 'İl' }, { alanId: 'ilce', tablo: 'Adres formu — İl - İlçe', sutun: 'İlçe' },
      { alanId: 'tip', tablo: 'Adres formu — Müşteri tipi', sutun: 'Müşteri tipi' }
    ]);
    expect(notlar.some((n) => /Güvenlik sorusu/.test(n))).toBe(true);
    // Ekran adı verilmezse yalnız alan etiketi (eski çağıranlar).
    expect(secenekTablolariUret({ alanlar, gozlemler }).testVerisi?.tablolar.map((t) => t.ad)).toEqual(['İl - İlçe', 'Müşteri tipi']);
  });

  test('tablo adı: "<Ekran> — <Alan>", 60 karakter sınırı (önce ekran adı kısalır), yasak karakterler atılır; aynı ad tekilleşir', () => {
    expect(ekranListesiTabloAdi('Başvuru', ['İl'])).toBe('Başvuru — İl');
    expect(ekranListesiTabloAdi('Başvuru', ['İl', 'İlçe'])).toBe('Başvuru — İl - İlçe');
    expect(ekranListesiTabloAdi('', ['İl'])).toBe('İl');
    expect(ekranListesiTabloAdi('Ekran {1}. [x]', ['Alan.Adı'])).toBe('Ekran 1 x — Alan Adı');
    const uzunEkran = 'Çok uzun bir ekran adı olan başvuru ve siparis sayfası (deneme)';
    const ad = ekranListesiTabloAdi(uzunEkran, ['Başvuranın doğum yeri bilgisi']);
    expect(ad.length).toBeLessThanOrEqual(60);
    expect(ad.endsWith(' — Başvuranın doğum yeri bilgisi')).toBe(true);
    expect(ad.startsWith('Çok uzun bir ekran')).toBe(true);
    // Alan adı da çok uzunsa ekran adının en az 20 karakteri kalır, tamamı 60'ta kesilir.
    const ikisi = ekranListesiTabloAdi(uzunEkran, ['Alan '.repeat(20)]);
    expect(ikisi.length).toBeLessThanOrEqual(60);
    expect(ikisi.startsWith(uzunEkran.slice(0, 20).trim())).toBe(true);
    // Paket şemasına uyar (adı tablo deposu da kabul eder).
    expect(/^[^.[\]{}$<>&|\u0000-\u001f]{1,60}$/u.test(ikisi)).toBe(true);
    // Aynı adı üreten iki grup: ikinci "… 2".
    const { testVerisi } = secenekTablolariUret({
      ekranAdi: 'Form', gozlemler: [],
      alanlar: [{ anahtar: '#a', id: 'a', etiket: 'Tür', secenekler: [{ deger: '1', metin: 'Bir' }, { deger: '2', metin: 'İki' }] },
        { anahtar: '#b', id: 'b', etiket: 'Tür', secenekler: [{ deger: '3', metin: 'Üç' }, { deger: '4', metin: 'Dört' }] }]
    });
    expect(testVerisi?.tablolar.map((t) => t.ad)).toEqual(['Form — Tür', 'Form — Tür 2']);
  });

  test('aynı görünen metin farklı değerlere denk geliyorsa sütun değerle yazılır', () => {
    const { testVerisi } = secenekTablolariUret({
      alanlar: alanlar.slice(0, 2),
      gozlemler: [
        { anahtar: '#ilce', secimler: { '#il': '34' }, secenekler: [{ deger: '34-9', metin: 'Merkez' }] },
        { anahtar: '#ilce', secimler: { '#il': '06' }, secenekler: [{ deger: '06-9', metin: 'Merkez' }] }
      ]
    });
    expect(testVerisi?.tablolar[0].satirlar).toEqual([['İstanbul', '34-9'], ['Ankara', '06-9']]);
    expect(testVerisi?.tablolar[0].sutunlar[1].karsiliklar).toBeUndefined();
  });
});

const bolum = { anahtar: 'b:temel', baslik: 'Temel' };
function ham(id: string, tur: string, ek: Partial<HamAlan> = {}): HamAlan {
  return {
    anahtar: `#${id}`, tur, etiket: id, etiketKaynagi: 'label', kimlik: id, ad: id, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`],
    zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum, ...ek
  };
}
const META: PaketMetasi = { ekranAnahtari: 'adres-formu', ekranAdi: 'Adres formu', urlYolu: '/adres/', girisGerekli: false, ikiAsamali: 'yok', baglamTuru: null };
const il = ham('il', 'select', { etiket: 'İl', secenekler: [{ deger: '', metin: 'Seçiniz' }, { deger: '34', metin: 'İstanbul' }, { deger: '06', metin: 'Ankara' }] });
const ilce = ham('ilce', 'select', { etiket: 'İlçe', secenekler: [{ deger: '34-1', metin: 'Kadıköy' }, { deger: '34-2', metin: 'Üsküdar' }] });

test('otomatik tarama: keşifte seçenekleri değişen liste üst seçimle kombinasyon tablosu olur; paket geçerli', () => {
  const { paket } = taramaPaketiOlustur(META, {
    profiller: [{
      profil: null, yol: '/adres/', baslik: 'Adres', alanlar: [il, ilce, ham('not', 'text')], ekranGoruntusu: null, notlar: [],
      kesifler: [{
        secim: '#il', ilkDeger: '34', geriAlindi: true,
        degerler: [{ deger: '06', metin: 'Ankara', gorunenler: [], kaybolanlar: [], gezinme: null, secenekler: { '#ilce': [{ deger: '06-1', metin: 'Çankaya' }] } }]
      }]
    }],
    hataliProfiller: [], engellenenler: [], kesifYapildi: true
  });
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const tv = paket.testVerisi as Nesne;
  expect(tv.tablolar).toHaveLength(1);
  expect(tv.tablolar[0]).toMatchObject({ ad: 'Adres formu — İl - İlçe', tur: 'liste', satirlar: [['İstanbul', 'Kadıköy'], ['İstanbul', 'Üsküdar'], ['Ankara', 'Çankaya']] });
  expect(tv.baglantilar.map((b: Nesne) => b.alanId)).toEqual(['il', 'ilce']);
});

test('akış kaydı: okumalardaki listeler ve tıklanınca açılan liste (metin alanı) tabloya girer; yazılan değer yok', () => {
  const sehir = ham('sehirAra', 'text', { etiket: 'Şehir' });
  const { paket } = kayitPaketiOlustur(META, {
    kip: 'kayit', profil: null,
    adimlar: [{ ad: 'Adres', yol: '/adres/', baslik: 'Adres', alanlar: [il, ilce, sehir], ilerleme: null }],
    basariGostergesi: null, engellenenler: [], notlar: [],
    secenekGozlemleri: [
      { anahtar: '#il', secimler: {}, secenekler: [{ deger: '34', metin: 'İstanbul' }, { deger: '06', metin: 'Ankara' }], kaynak: 'liste' },
      { anahtar: '#ilce', secimler: { '#il': '34' }, secenekler: [{ deger: '34-1', metin: 'Kadıköy' }], kaynak: 'liste' },
      { anahtar: '#ilce', secimler: { '#il': '06' }, secenekler: [{ deger: '06-1', metin: 'Çankaya' }], kaynak: 'liste' },
      { anahtar: '#sehirAra', secimler: { '#il': '34' }, secenekler: [{ deger: 'Bursa', metin: 'Bursa' }, { deger: 'İzmir', metin: 'İzmir' }], kaynak: 'acilir' }
    ]
  });
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const tv = paket.testVerisi as Nesne;
  expect(tv.tablolar.map((t: Nesne) => [t.ad, t.tur, t.satirlar])).toEqual([
    ['Adres formu — İl - İlçe', 'liste', [['İstanbul', 'Kadıköy'], ['Ankara', 'Çankaya']]],
    ['Adres formu — Şehir', 'liste', [['Bursa'], ['İzmir']]]
  ]);
  expect(tv.baglantilar.map((b: Nesne) => b.alanId)).toEqual(['il', 'ilce', 'sehirAra']);
});

test('kayıt paneli: tıklanınca açılan listbox seçenekleri okunur; yazarak süzülen liste ve yerel select alınmaz (yerel sayfa)', async () => {
  const tarayici = await chromium.launch();
  try {
    const sayfa = await tarayici.newPage();
    await sayfa.route('**/*', (r) => r.abort());
    await sayfa.setContent(`
      <label for="il">İl</label><input id="il" role="combobox" aria-controls="il-liste" readonly>
      <ul id="il-liste" role="listbox"><li role="option" data-value="34">İstanbul</li><li role="option" data-value="06">Ankara</li>
        <li role="option" data-value="99" style="display:none">Gizli seçenek</li></ul>
      <label for="ara">Kişi ara</label><input id="ara" role="combobox" aria-autocomplete="list" aria-controls="ara-liste" value="ali">
      <ul id="ara-liste" role="listbox"><li role="option">Ali Deneme</li></ul>
      <select id="yerel"><option value="1">Bir</option></select>`);
    expect(await sayfa.locator('#il').evaluate(acikListeSecenekleri)).toEqual([{ deger: '34', metin: 'İstanbul' }, { deger: '06', metin: 'Ankara' }]);
    expect(await sayfa.locator('#ara').evaluate(acikListeSecenekleri)).toBeNull();
    expect(await sayfa.locator('#yerel').evaluate(acikListeSecenekleri)).toBeNull();
  } finally {
    await tarayici.close();
  }
});

test.describe('Onaylanan test verisinin yazılması', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  test.beforeEach(async () => {
    klasor = geciciKlasor('paket-test-verisi');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Paket-Tablo-Kasa-Parolasi-7', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  test('önizleme → yeni tablolar + bağlantılar + kaynak; seçimsiz yazılmaz; aynı ad: yeni reddedilir, birleştir / yeni ad / atla', async () => {
    const medya = join(klasor.yol, 'medya');
    const o = paketOnizle(vt, projeId, paketTV());
    const tv = (o.onizleme as Nesne).testVerisi as Nesne;
    expect(tv.kaynak).toBe('paket');
    expect(tv.tablolar.map((t: Nesne) => [t.ad, t.satirSayisi, t.mevcut])).toEqual([['Kapsam - Alternatif', 4, null], ['Taksit', 3, null], ['Servis girişi', 1, null]]);
    expect(tv.tablolar[2].ornek).toEqual([['kanal-1', null]]);
    expect(tv.baglantilar.map((b: Nesne) => [b.alanId, b.alanEtiketi, b.mevcut])).toEqual([['kapsam', expect.any(String), null], ['alternatif', expect.any(String), null], ['taksitSayisi', expect.any(String), null]]);

    // Seçim verilmezse test verisine hiçbir şey yazılmaz.
    const bos = await sayfaEkle(vt, projeId, paketTV({ meta: { ...V1.meta, ekran: { ...V1.meta.ekran, anahtar: 'bos-ekran' } }, model: { ...V1.model, id: 'bos-ekran' } }),
      { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya });
    expect(bos.testVerisi).toEqual({ tablolar: [], baglanan: 0 });
    expect(tablolariListele(vt, projeId)).toEqual([]);

    const ek = await sayfaEkle(vt, projeId, paketTV(), {
      senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya,
      testVerisi: { tablolar: { 'Kapsam - Alternatif': { islem: 'yeni' }, Taksit: { islem: 'yeni' }, 'Servis girişi': { islem: 'atla' } }, baglantilar: ['kapsam', 'taksitSayisi'] }
    });
    expect(ek.testVerisi.tablolar.map((t) => [t.ad, t.islem, t.eklenenSatir])).toEqual([['Kapsam - Alternatif', 'yeni', 4], ['Taksit', 'yeni', 3]]);
    expect(ek.testVerisi.baglanan).toBe(2);
    const tablolar = tablolariListele(vt, projeId);
    expect(tablolar.map((t) => t.ad).sort()).toEqual(['Kapsam - Alternatif', 'Taksit']);
    const taksit = tablolar.find((t) => t.ad === 'Taksit');
    expect(taksit?.kaynak).toMatchObject({ tur: 'paket', olusturan: V1.meta.olusturan, ekran: V1.meta.ekran.ad });
    expect(taksit?.sutunlar[0].karsiliklar).toEqual({ 'Tek çekim': { sayfa: '1' }, '3 taksit': { sayfa: '3' }, '6 taksit': { sayfa: '6' } });
    const baglar = ekranAlanBaglari(vt, ek.ekranId);
    expect(baglar).toEqual({ kapsam: { tablo: tablolar.find((t) => t.ad === 'Kapsam - Alternatif')?.id, sutun: 'Kapsam' }, taksitSayisi: { tablo: taksit?.id, sutun: 'Taksit' } });

    // İkinci paket (başka ekran): aynı adlı tablolar.
    const ikinci = paketTV({ meta: { ...V1.meta, ekran: { ...V1.meta.ekran, anahtar: 'ikinci-ekran' } }, model: { ...V1.model, id: 'ikinci-ekran' } });
    ikinci.testVerisi.tablolar[0].satirlar.push(['KURYE', 'ROTA PAKET']);
    ikinci.testVerisi.tablolar[0].sutunlar.push({ ad: 'Bölge' });
    const o2 = paketOnizle(vt, projeId, ikinci);
    const m2 = ((o2.onizleme as Nesne).testVerisi as Nesne).tablolar[0].mevcut;
    expect(m2).toMatchObject({ satirSayisi: 4, eklenecekSatir: 1, yeniSutunlar: ['Bölge'] });
    await expect(sayfaEkle(vt, projeId, ikinci, { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya, testVerisi: { tablolar: { Taksit: { islem: 'yeni' } } } }))
      .rejects.toThrow('zaten var');
    const ek2 = await sayfaEkle(vt, projeId, ikinci, {
      senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya,
      testVerisi: { tablolar: { 'Kapsam - Alternatif': { islem: 'birlestir' }, Taksit: { islem: 'yeniAd', yeniAd: 'Taksit 2' } }, baglantilar: ['alternatif', 'taksitSayisi'] }
    });
    expect(ek2.testVerisi.tablolar.map((t) => [t.ad, t.islem, t.eklenenSatir, t.eklenenSutun])).toEqual([['Kapsam - Alternatif', 'birlestir', 1, 1], ['Taksit 2', 'yeniAd', 3, 1]]);
    const son = tablolariListele(vt, projeId);
    expect(son.map((t) => t.ad).sort()).toEqual(['Kapsam - Alternatif', 'Taksit', 'Taksit 2']);
    const ka = son.find((t) => t.ad === 'Kapsam - Alternatif');
    expect(ka?.sutunlar.map((s) => s.ad)).toEqual(['Kapsam', 'Alternatif', 'Bölge']);
    expect(ka?.satirlar).toHaveLength(5);
    expect(ekranAlanBaglari(vt, ek2.ekranId)).toEqual({ alternatif: { tablo: ka?.id, sutun: 'Alternatif' }, taksitSayisi: { tablo: son.find((t) => t.ad === 'Taksit 2')?.id, sutun: 'Taksit' } });
    // Birleştirme mevcut tablonun KAYNAĞINI değiştirmez (ilk yazımdaki kaynak aynen; yazılma zamanı dahil).
    expect(ka?.kaynak).toEqual(tablolar.find((t) => t.ad === 'Kapsam - Alternatif')?.kaynak);
  });

  test('birleştirme: kaynağı olmayan (elle oluşturulmuş) tablonun kaynağı yok kalır; paket tablosunun türü kaynakta saklanır', async () => {
    const medya = join(klasor.yol, 'medya');
    tabloKaydet(vt, { projeId, ad: 'Taksit', sutunlar: [{ ad: 'Taksit' }], satirlar: [{ degerler: { Taksit: 'Tek çekim' } }] });
    const p = paketTV();
    p.testVerisi.tablolar[0].tur = 'liste';
    p.testVerisi.tablolar[2].tur = 'kayit';
    const o = paketOnizle(vt, projeId, p);
    expect(((o.onizleme as Nesne).testVerisi as Nesne).tablolar.map((t: Nesne) => t.tur)).toEqual(['liste', null, 'kayit']);
    await sayfaEkle(vt, projeId, p, {
      senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya,
      testVerisi: { tablolar: { 'Kapsam - Alternatif': { islem: 'yeni' }, Taksit: { islem: 'birlestir' }, 'Servis girişi': { islem: 'yeni' } }, baglantilar: [] }
    });
    const t = (ad: string) => tablolariListele(vt, projeId).find((x) => x.ad === ad);
    expect(t('Taksit')?.kaynak).toBeNull();
    expect(t('Taksit')?.satirlar).toHaveLength(3);
    expect(t('Kapsam - Alternatif')?.kaynak).toMatchObject({ tur: 'paket', tabloTuru: 'liste' });
    expect(t('Servis girişi')?.kaynak).toMatchObject({ tur: 'paket', tabloTuru: 'kayit' });
    // Geçersiz tür reddedilir.
    const q = paketTV();
    q.testVerisi.tablolar[0].tur = 'tablo';
    expect(sayfaPaketiniDogrula(q).hatalar.map((h) => h.yer)).toContain('testVerisi.tablolar[0].tur');
  });

  test('tekrar analiz: tablolar hemen, bağlantılar bulgu kararına göre (kabul → yazılır, red → yazılmaz; bulgusuz alan hemen)', async () => {
    const medya = join(klasor.yol, 'medya');
    const ek = await sayfaEkle(vt, projeId, kopya(V1), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya });
    const { paket, secim } = v2TestVerisi();
    const o = paketOnizle(vt, projeId, paket, { ekranId: ek.ekranId, mod: 'analiz' });
    expect(o.gecerli, JSON.stringify(o.hatalar)).toBe(true);
    const onizleme = (o.onizleme as Nesne).testVerisi as Nesne;
    expect(Object.fromEntries(onizleme.baglantilar.map((b: Nesne) => [b.alanId, b.modeldeVar]))).toEqual({ rotaAmaci: false, kapsam: true, taksitSayisi: true });
    const y = await analizYukle(vt, projeId, ek.ekranId, paket, { medyaKlasoru: medya, testVerisi: secim });
    expect(y.bulguSayisi).toBeGreaterThan(0);
    // Taksit (bulgusu yok, modelde var) hemen; Rota amacı (yeni alan) ve Kapsam (yeni seçenek bulgusu) bulgu kararını bekler.
    expect(y.testVerisi).toMatchObject({ baglanan: 1, bekleyenBaglanti: 2 });
    const tablo = (ad: string) => tablolariListele(vt, projeId).find((x) => x.ad === ad);
    expect(tablolariListele(vt, projeId)).toHaveLength(3);
    expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({ taksitSayisi: { tablo: tablo('Örnek Rota — Taksit')?.id, sutun: 'Taksit' } });
    const a = analizGetir(vt, projeId, ek.ekranId).analiz as Nesne;
    const bulgu = (tur: string) => (a.bulgular as Nesne[]).find((b) => b.tur === tur) as Nesne;
    const r = analizUygula(vt, projeId, ek.ekranId, { analizId: a.id, kabul: [bulgu('yeniAlan').id], red: [bulgu('yeniSecenek').id] });
    expect(r).toMatchObject({ yeniSurum: true, kabul: 1, red: 1, baglanan: 1 });
    expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({
      taksitSayisi: { tablo: tablo('Örnek Rota — Taksit')?.id, sutun: 'Taksit' },
      rotaAmaci: { tablo: tablo('Örnek Rota — Rota amacı')?.id, sutun: 'Rota amacı' }
    });
    // Uygulanan analizde bekleyen bağlantılar kalmaz (bir sonraki analizde yeniden yazılmaz).
    const durum = ekranAyarlariniGetir(vt, ek.ekranId) as Nesne;
    expect(durum.analiz.son.baglantilar).toBeUndefined();
    // Tekrar analiz istek dosyası: mevcut bağlantılar + bağlı tabloların adı / sütunları (değer yok) ve "aynı adları kullan" talimatı.
    const dosya = claudeDosyasiYaz(vt, projeId, ek.ekranId, { tur: 'tekrar-analiz', klasor: join(klasor.yol, 'analiz'), projeKoku: klasor.yol });
    const metin = readFileSync(dosya.tamYol, 'utf8');
    const icerik = JSON.parse(metin) as Nesne;
    expect(icerik.testVerisi.alanBaglari).toEqual(expect.arrayContaining([
      { alanId: 'rotaAmaci', alanEtiketi: expect.any(String), tablo: 'Örnek Rota — Rota amacı', sutun: 'Rota amacı' },
      { alanId: 'taksitSayisi', alanEtiketi: expect.any(String), tablo: 'Örnek Rota — Taksit', sutun: 'Taksit' }
    ]));
    expect(icerik.testVerisi.tablolar.map((t: Nesne) => [t.ad, t.tur, t.sutunlar])).toEqual(expect.arrayContaining([['Örnek Rota — Rota amacı', 'liste', [{ ad: 'Rota amacı' }]]]));
    expect(metin).not.toContain('Yalnız tablo değeri'); // tablo değeri yazılmaz (yalnız ad / sütun)
    expect(icerik.talimat).toContain(MEVCUT_TABLO_KURALI);
    expect(dosya.cumle).toContain(MEVCUT_TABLO_KURALI);
  });

  test('modeli değiştir: onaylanan tablolar ve bağlantılar yeni model sürümüyle yazılır', async () => {
    const medya = join(klasor.yol, 'medya');
    const ek = await sayfaEkle(vt, projeId, kopya(V1), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya });
    const { paket, secim } = v2TestVerisi();
    const r = await modeliPaketleDegistir(vt, projeId, ek.ekranId, paket, { onay: true, medyaKlasoru: medya, testVerisi: secim });
    expect((r as Nesne).testVerisi).toEqual({ tablolar: expect.any(Array), baglanan: 3 });
    expect(tablolariListele(vt, projeId).map((t) => [t.ad, t.kaynak?.tabloTuru]).sort()).toEqual([
      ['Örnek Rota — Kapsam', 'liste'], ['Örnek Rota — Rota amacı', 'liste'], ['Örnek Rota — Taksit', 'liste']
    ]);
    expect(Object.keys(ekranAlanBaglari(vt, ek.ekranId)).sort()).toEqual(['kapsam', 'rotaAmaci', 'taksitSayisi']);
  });

  test('akış kaydı → doğrudan akışa yaz: seçenek listeleri önizlenir; seçimsiz yazılmaz; onaylanan tablo + bağlantı yeni sürümle yazılır', async () => {
    const medya = join(klasor.yol, 'medya');
    const ek = await sayfaEkle(vt, projeId, akisPaketi(), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya });
    const model = (ekranModeliGetir(vt, ek.ekranId) as { model: Nesne }).model;
    const env = modeldenAkisEnvanteri(model);
    const bloklar = adimlardanBloklar(model, model.adimlar, env);
    const on = akisKaydet(vt, projeId, ek.ekranId, { ad: 'Kayıttan akış', bloklar, kayitEnvanteri: env }) as Nesne;
    expect(on.etki).toEqual({ yeni: true, senaryolar: [] });
    const tv = on.testVerisi as Nesne;
    expect(tv.kaynak).toBe('kayit');
    const kategori = (tv.tablolar as Nesne[]).find((t) => t.ad === 'Başvuru (akış) — Kategori') as Nesne;
    expect(kategori).toMatchObject({ tur: 'liste', satirSayisi: 2, mevcut: null });
    expect((tv.baglantilar as Nesne[]).every((b) => b.modeldeVar === true)).toBe(true);
    // Seçim yok: model yazılır, test verisine hiçbir şey yazılmaz.
    const y1 = akisKaydet(vt, projeId, ek.ekranId, { ad: 'Kayıttan akış', bloklar, kayitEnvanteri: env, onay: true }) as Nesne;
    expect(y1.testVerisi).toEqual({ tablolar: [], baglanan: 0 });
    expect(tablolariListele(vt, projeId)).toEqual([]);
    expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({});
    // Onaylanan seçim: yalnız seçilen tablo ve bağlantı.
    const y2 = akisKaydet(vt, projeId, ek.ekranId, {
      ad: 'Kayıttan akış 2', bloklar, kayitEnvanteri: env, onay: true,
      testVerisi: { tablolar: { 'Başvuru (akış) — Kategori': { islem: 'yeni' } }, baglantilar: ['kategori'] }
    }) as Nesne;
    expect((y2.testVerisi as Nesne).tablolar.map((t: Nesne) => [t.ad, t.islem, t.eklenenSatir])).toEqual([['Başvuru (akış) — Kategori', 'yeni', 2]]);
    const t = tablolariListele(vt, projeId);
    expect(t).toHaveLength(1);
    expect(t[0].kaynak).toMatchObject({ tur: 'kayit', tabloTuru: 'liste', ekran: 'Başvuru (akış)' });
    expect(t[0].sutunlar[0].karsiliklar).toEqual({ Bireysel: { sayfa: 'K1' }, Kurumsal: { sayfa: 'K2' } });
    expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({ kategori: { tablo: t[0].id, sutun: 'Kategori' } });
    // Ekranın Akışlar sekmesinden (kayıt yok) düzenleme test verisi önermez.
    expect('testVerisi' in (akisKaydet(vt, projeId, ek.ekranId, { ad: 'Elle akış', bloklar }) as Nesne)).toBe(false);
  });
});

/** V2 paketi + üç tablo (Rota amacı: yeni alan, Kapsam: yeni seçenek bulgusu olan alan, Taksit: bulgusuz alan) ve tümünü yazan seçim. */
function v2TestVerisi(): { paket: Nesne; secim: Nesne } {
  const tablolar = [
    { ad: 'Örnek Rota — Rota amacı', tur: 'liste', sutunlar: [{ ad: 'Rota amacı' }], satirlar: [['Turistik'], ['İş']] },
    { ad: 'Örnek Rota — Kapsam', tur: 'liste', sutunlar: [{ ad: 'Kapsam' }], satirlar: [['EKSPRES'], ['KURYE']] },
    { ad: 'Örnek Rota — Taksit', tur: 'liste', sutunlar: [{ ad: 'Taksit' }], satirlar: [['Tek çekim'], ['3 taksit'], ['Yalnız tablo değeri']] }
  ];
  const paket = {
    ...kopya(V2), testVerisi: {
      tablolar, baglantilar: [
        { alanId: 'rotaAmaci', tablo: tablolar[0].ad, sutun: 'Rota amacı' }, { alanId: 'kapsam', tablo: tablolar[1].ad, sutun: 'Kapsam' },
        { alanId: 'taksitSayisi', tablo: tablolar[2].ad, sutun: 'Taksit' }
      ]
    }
  };
  return { paket, secim: { tablolar: Object.fromEntries(tablolar.map((t) => [t.ad, { islem: 'yeni' }])), baglantilar: ['rotaAmaci', 'kapsam', 'taksitSayisi'] } };
}

test.describe('Arayüz: paket önizlemesinde test verisi', () => {
  test('bölüm tablo / bağlantıları gösterir; seçilen tablolar yazılır, kaynak Tablolar ekranında görünür', async () => {
    test.setTimeout(120_000);
    const k = geciciKlasor('paket-tv-arayuz');
    const vtYolu = join(k.yol, 'platform.db');
    const PAROLA = 'Paket-Arayuz-Kasa-Parolasi-5';
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    const nobetci = await nobetciBaslat(k.yol, vtYolu, {});
    const tarayici = await chromium.launch();
    try {
      const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
      expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
      expect((await api('/platform/proje/kaydet', { ad: 'Arayüz projesi' })).basarili).toBe(true);
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto('/#/ekranlar/yeni');
      await page.locator('#paket-dosyasi').setInputFiles({ name: 'paket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paketTV())) });
      const bolum = page.getByRole('region', { name: 'Test verisine yazılacaklar' });
      await expect(bolum).toBeVisible();
      await expect(bolum).toContainText('Kapsam - Alternatif');
      await expect(bolum).toContainText('gizli sütun');
      await bolum.getByLabel('Servis girişi tablosunu yaz').uncheck();
      await bolum.getByLabel(/taksit.* alanını bağla/i).uncheck();
      await expect(page.getByText('2 tablo yazılır, 2 alan bağlanır')).toBeVisible();
      // Projede ortam yok: senaryo önerileri seçilmeden eklenir.
      await page.getByRole('button', { name: 'Hiçbiri' }).click();
      await page.getByRole('button', { name: 'Ekranı oluştur' }).click();
      await expect(page.getByText(/Test verisi: Kapsam - Alternatif \(4 satır\), Taksit \(3 satır\); 2 alan bağlandı/)).toBeVisible();
      await page.goto('/#/ayarlar/test-verisi');
      const nav = page.getByRole('navigation', { name: 'Tablolar' });
      await expect(nav.getByRole('button', { name: /^Kapsam - Alternatif/ })).toContainText('kaynak: Sayfa paketi');
      await nav.getByRole('button', { name: /^Kapsam - Alternatif/ }).click();
      await expect(page.getByRole('region', { name: 'Tablo düzenleyici' })).toContainText('Kaynak: Sayfa paketi');
      await expect(nav.getByRole('button', { name: /^Servis girişi/ })).toHaveCount(0);
      expect(hatalar).toEqual([]);
    } finally {
      await tarayici.close();
      nobetci.surec.kill('SIGTERM');
      k.temizle();
    }
  });
});
