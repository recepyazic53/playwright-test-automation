// AKIŞ DİYAGRAMI — KORUNAN PARÇALAR: diyagramın gösteremediği parçalar (seçime bağlı düğmeli adım, alanlı + düğmeli isteğe
// bağlı adım, kod yöntemi, adres / son adımda öğe başarı göstergesi, iç içe / bağlam alan koşulu, yazısıyla seçilen
// tıklama, aksiyon başına süre, öğeye bağlı bekleme, ekrana dön, seçicisiz alan, alt model adımı) akışı KİLİTLEMEZ: salt okunur
// korunan blok / rozet olur ve kaydederken modeldeki hâliyle aynen yazılır. Dayandığı alan silinirse kayıt anlaşılır hatayla
// reddedilir; korunan parça silinirse onayda listelenir. Nötr fikstür ("Talep": işlem tipine göre iki dal + kat penceresi);
// veritabanı geçicidir, arayüz testi 127.0.0.1'deki Nöbetçi'yle — dışarıya istek yok.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranModeliEkle, ekranModeliGetir, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { EkranDogrulamaHatasi, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import {
  adimlardanBloklar, akisDuzenlenebilirMi, akisKaydet, akisTasarimi, korunanParcalari, modeldenAkisEnvanteri
} from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const alan = (id: string, tip: string, etiket: string, secici: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const buton = (id: string, etiket: string, secici: string): Nesne => ({ id, tip: 'buton', etiket: { ekran: etiket }, yapilandirma: 'aksiyon', konum: { secici, kirilganlik: 'orta' } });
const tikla = (secici: string, aciklama: string): Nesne => ({ tur: 'tikla', secici, aciklama });

/**
 * "Talep": İşlem (işlem tipi Yeni / Yenileme) → Devam; Yeni dalında "Sorgula" ve "Hesapla" düğmeli adımlar, Yenileme dalında
 * "Sorgula" düğmeli adım (adım görünürlüğü işlem tipine bağlı); kat penceresi açılırsa (senaryo ayarı) kat seçilip "Onayla"
 * (alanlı + düğmeli isteğe bağlı adım); Kaydet → "Talep hazır".
 */
function talepModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'talep', ad: 'Talep', aciklama: 'Korunan parçalar (nötr fikstür; değerler sahte).',
    ekranUrl: '/talep/', girisGerekmez: true, specDosyasi: 'tests/scenarios/talep/talep.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (talep)' },
    kosullar: {
      yeniIse: { aciklama: 'İşlem tipi Yeni', ifade: { alan: 'islemTipi', esit: 'yeni' } },
      yenilemeIse: { aciklama: 'İşlem tipi Yenileme', ifade: { alan: 'islemTipi', esit: 'yenileme' } },
      katPenceresiAcilirsa: { aciklama: 'Kat penceresi açılırsa', ifade: { senaryoAyari: 'katPenceresi', esit: true } }
    },
    adimlar: [
      {
        id: 'islem', sira: 1, baslik: 'İşlem',
        bolumler: [
          { id: 'islemBilgileri', baslik: 'İşlem bilgileri', alanlar: [
            alan('islemTipi', 'secim', 'İşlem tipi', '#islemTipi', { zorunlu: true, seceneklerDurumu: 'tam', secenekler: [{ deger: 'yeni', metin: 'Yeni' }, { deger: 'yenileme', metin: 'Yenileme' }] }),
            alan('musteriNo', 'metin', 'Müşteri no', '#musteriNo')
          ] },
          { id: 'islemIslemleri', baslik: 'İşlemler', alanlar: [buton('devamDugmesi', 'Devam', '#devam')] }
        ],
        kosu: { aksiyonlar: [tikla('#devam', 'Devam')], basariGostergesi: { tur: 'eleman', deger: '#sorgula' } }
      },
      {
        id: 'yeniSorgula', sira: 2, baslik: 'Yeni: sorgula', gorunurluk: { kosul: 'yeniIse' },
        bolumler: [{ id: 'yeniSorgulaIslemleri', baslik: 'İşlemler', alanlar: [buton('sorgulaDugmesi', 'Sorgula', '#sorgula')] }],
        kosu: { aksiyonlar: [tikla('#sorgula', 'Sorgula')], basariGostergesi: { tur: 'eleman', deger: '#tutar' } }
      },
      {
        id: 'yeniHesapla', sira: 3, baslik: 'Yeni: hesapla', gorunurluk: { kosul: 'yeniIse' },
        bolumler: [
          { id: 'hesapBilgileri', baslik: 'Hesap', alanlar: [alan('tutar', 'sayi', 'Tutar', '#tutar')] },
          { id: 'yeniHesaplaIslemleri', baslik: 'İşlemler', alanlar: [buton('hesaplaDugmesi', 'Hesapla', '#hesapla')] }
        ],
        kosu: { aksiyonlar: [tikla('#hesapla', 'Hesapla')], basariGostergesi: { tur: 'eleman', deger: '#kat' } }
      },
      {
        id: 'yenilemeSorgula', sira: 4, baslik: 'Yenileme: sorgula', gorunurluk: { kosul: 'yenilemeIse' },
        bolumler: [{ id: 'yenilemeIslemleri', baslik: 'İşlemler', alanlar: [buton('yenilemeSorgulaDugmesi', 'Sorgula', '#sorgulaYenileme')] }],
        kosu: { aksiyonlar: [tikla('#sorgulaYenileme', 'Sorgula')], basariGostergesi: { tur: 'eleman', deger: '#kat' } }
      },
      {
        id: 'katSecimi', sira: 5, baslik: 'Kat seçimi', gorunurluk: { kosul: 'katPenceresiAcilirsa' },
        bolumler: [
          { id: 'katBolumu', baslik: 'Kat', alanlar: [alan('kat', 'secim', 'Kat', '#kat', { seceneklerDurumu: 'tam', secenekler: [{ deger: '1', metin: '1. kat' }, { deger: '2', metin: '2. kat' }] })] },
          { id: 'katIslemleri', baslik: 'İşlemler', alanlar: [buton('onaylaDugmesi', 'Onayla', '#onayla')] }
        ],
        kosu: { aksiyonlar: [tikla('#onayla', 'Onayla')], basariGostergesi: { tur: 'eleman', deger: '#kaydet' } }
      },
      {
        id: 'kayit', sira: 6, baslik: 'Kayıt',
        bolumler: [{ id: 'kayitIslemleri', baslik: 'İşlemler', alanlar: [
          buton('kaydetDugmesi', 'Kaydet', '#kaydet'),
          { id: 'sonucMesaji', tip: 'cikti', etiket: { ekran: 'Talep hazır' }, yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'orta' } }
        ] }],
        kosu: { aksiyonlar: [tikla('#kaydet', 'Kaydet')], basariGostergesi: { tur: 'metin', deger: 'Talep hazır', secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'katPenceresi', tip: 'onayKutusu', etiket: { ekran: null, form: 'Kat penceresi açılır' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'katPenceresi' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const paket = (model: Nesne): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: model.id, ad: model.ad, urlYolu: model.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
  model, senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
  bilinmeyenler: []
});
/** Adımın diyagramın yeniden kurduğu kısımlar dışındaki içeriği (başarı göstergesi sonraki adımdan kurulur). */
const icerik = (a: Nesne): Nesne => ({ id: a.id, baslik: a.baslik, gorunurluk: a.gorunurluk, bolumler: a.bolumler, aksiyonlar: a.kosu?.aksiyonlar, pomMetodu: a.pomMetodu });
const adimBul = (m: Nesne, id: string): Nesne => (m.adimlar as Nesne[]).find((a) => a.id === id) as Nesne;
/** Saf gidiş-dönüş: modelden diyagram → (JSON) → ayıklama → kayıt envanteri (korunan parçalarla) → model. */
function gidisDonus(m: Nesne, degistir: (b: AkisBlogu[]) => AkisBlogu[] = (b) => b): { model: Nesne; bloklar: AkisBlogu[] } {
  const env = modeldenAkisEnvanteri(m);
  const bloklar = kopya(adimlardanBloklar(m, m.adimlar, env));
  const ayik = bloklariAyikla(degistir(kopya(bloklar)));
  expect(ayik.hatalar).toEqual([]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar, { korunanlar: korunanParcalari(m).parcalar });
  expect(c.hatalar).toEqual([]);
  const META = { ekranAnahtari: 'talep', ekranAdi: 'Talep', urlYolu: '/talep/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
  return { model: kayitPaketiOlustur({ ...META, mevcutModel: m }, c.envanter as NonNullable<typeof c.envanter>).paket.model as Nesne, bloklar };
}

test('saf: seçime bağlı düğmeli dallar ve alanlı + düğmeli isteğe bağlı adım korunan parça olur; gidiş-dönüşte aynen kalır', () => {
  const m = talepModeli();
  expect(akisDuzenlenebilirMi(m)).toEqual({ duzenlenebilir: true, neden: null });
  const { model, bloklar } = gidisDonus(m);
  // Dallar: alan grubu (alansız da olsa adın taşıyıcısı) + aksiyon; korunan görünürlük koşulu rozetle.
  const grup = (ad: string) => bloklar.find((b) => b.tur === 'alanlar' && b.ad === ad) as Extract<AkisBlogu, { tur: 'alanlar' }>;
  expect(grup('Yeni: sorgula')).toMatchObject({ alanlar: [], korunan: 'ek:ana:yeniSorgula', korunanOzet: ['görünürlük koşulu: İşlem tipi Yeni'] });
  expect(grup('Yeni: hesapla')).toMatchObject({ alanlar: ['tutar'], korunan: 'ek:ana:yeniHesapla' });
  // Kat penceresi: isteğe bağlı gösterilmez (zorunlu aksiyon), koşulu korunur.
  expect(grup('Kat seçimi')).toMatchObject({ alanlar: ['kat'], korunanOzet: ['görünürlük koşulu: Kat penceresi açılırsa'] });
  expect(bloklar.filter((b) => b.tur === 'aksiyon').every((b) => !(b as Nesne).istegeBagli)).toBe(true);
  // Model: her adımın içeriği aynen (kimlikler, görünürlükler, bölümler, aksiyonlar); koşullar ve senaryo ayarı yerinde.
  expect(model.adimlar.map(icerik)).toEqual(m.adimlar.map(icerik));
  expect(model.kosullar).toMatchObject(m.kosullar);
  expect(model.senaryoDuzeyi.alanlar.map((a: Nesne) => a.id)).toEqual(['katPenceresi']);
  // İlerleme göstergesi: aradaki koşullu dalların ilk öğelerinden herhangi biri (öğe "veya"); dalın içinde sonraki adım.
  expect(adimBul(model, 'islem').kosu.basariGostergesi).toEqual({ tur: 'veya', secenekler: ['#sorgula', '#sorgulaYenileme', '#kat', '#kaydet'].map((deger) => ({ tur: 'eleman', deger })) });
  expect(adimBul(model, 'yeniSorgula').kosu.basariGostergesi).toEqual({ tur: 'eleman', deger: '#tutar' });
  // İkinci gidiş-dönüş aynı modeli verir (kararlı).
  expect(gidisDonus(model).model.adimlar).toEqual(model.adimlar);
});

test('saf: eskiden kilitleyen her durum düzenlenebilir ve kaydedince aynen korunur', () => {
  const temel = talepModeli();
  /** Modeli değiştirir, düzenlenebilir olduğunu ve gidiş-dönüşte seçilen parçanın aynen kaldığını denetler. */
  const dene = (ad: string, degistir: (m: Nesne) => void, parca: (m: Nesne) => unknown, blokTuru?: { tur: string; kapsam?: string }) => {
    const m = kopya(temel);
    degistir(m);
    expect(akisDuzenlenebilirMi(m), ad).toEqual({ duzenlenebilir: true, neden: null });
    const { model, bloklar } = gidisDonus(m);
    expect(parca(model), ad).toEqual(parca(m));
    if (blokTuru) expect(bloklar.some((b) => b.tur === blokTuru.tur && (!blokTuru.kapsam || (b as Nesne).kapsam === blokTuru.kapsam)), ad).toBe(true);
    return { model, bloklar };
  };
  // Adres (url) başarı göstergesi ve son adımda öğe göstergesi.
  dene('url göstergesi', (m) => { adimBul(m, 'islem').kosu.basariGostergesi = { tur: 'url', deger: '/talep/2' }; }, (m) => adimBul(m, 'islem').kosu.basariGostergesi);
  dene('son adımda öğe', (m) => { adimBul(m, 'kayit').kosu.basariGostergesi = { tur: 'eleman', deger: '#sonuc' }; }, (m) => [adimBul(m, 'kayit').kosu.basariGostergesi, adimBul(m, 'kayit').bolumler]);
  // İç içe (karışık ve / veya) ve bağlam alan koşulu (alanın tanımıyla; diyagramda kilitli).
  const kosullu = dene('çok şartlı koşul', (m) => {
    adimBul(m, 'islem').bolumler[0].alanlar[1].gorunurluk = { ifade: { ve: [{ alan: 'islemTipi', esit: 'yeni' }, { veya: [{ calismaZamani: 'gorunurse' }, { alan: 'islemTipi', dolu: false }] }] } };
  }, (m) => adimBul(m, 'islem').bolumler[0].alanlar[1]);
  expect((kosullu.bloklar[0] as Nesne).korunanKosullar).toEqual({ musteriNo: '“İşlem tipi” = yeni ve çalışma anında görünürse veya “İşlem tipi” boş' });
  expect((kosullu.bloklar[0] as Nesne).kosullar).not.toHaveProperty('musteriNo');
  dene('bağlam', (m) => { adimBul(m, 'islem').bolumler[0].alanlar[1].gorunurluk = { ifade: { baglam: { alanSeti: 'A' } } }; }, (m) => adimBul(m, 'islem').bolumler[0].alanlar[1]);
  // Kod yöntemi (pomMetodu) ve bölüm özellikleri.
  dene('kod yöntemi', (m) => { adimBul(m, 'islem').pomMetodu = 'islemiDoldur'; }, (m) => adimBul(m, 'islem').pomMetodu);
  // Yazısıyla seçilen tıklama, aksiyon başına süre, öğeye bağlı bekleme → korunan aksiyonlar (düğmesi adımın ilerlemesi).
  dene('metinle süzülen tıklama', (m) => { adimBul(m, 'islem').kosu.aksiyonlar[0].metin = 'Devam'; }, (m) => adimBul(m, 'islem').kosu.aksiyonlar, { tur: 'korunan', kapsam: 'aksiyonlar' });
  dene('aksiyon süresi', (m) => { adimBul(m, 'yeniHesapla').kosu.aksiyonlar[0].zamanAsimiSn = 30; }, (m) => [adimBul(m, 'yeniHesapla').kosu.aksiyonlar, adimBul(m, 'yeniHesapla').gorunurluk], { tur: 'korunan', kapsam: 'aksiyonlar' });
  dene('öğeye bağlı bekleme', (m) => { adimBul(m, 'islem').kosu.aksiyonlar.push({ tur: 'bekle', secici: '#yukleniyor', durum: 'gizli' }); }, (m) => adimBul(m, 'islem').kosu.aksiyonlar, { tur: 'korunan', kapsam: 'aksiyonlar' });
  // Yalnız "ekrana dön" aksiyonlu adım ve alt model adımı: adımın tamamı korunan blok.
  const don = { id: 'ekranaDonus', sira: 2, baslik: 'Ekrana dön', bolumler: [], kosu: { aksiyonlar: [{ tur: 'ekranaDon' }] } };
  dene('ekrana dön', (m) => { m.adimlar.splice(1, 0, don); m.adimlar.forEach((a: Nesne, i: number) => { a.sira = i + 1; }); }, (m) => ({ ...adimBul(m, 'ekranaDonus'), sira: 0 }), { tur: 'korunan', kapsam: 'adim' });
  const odeme = { id: 'odeme', sira: 7, baslik: 'Ödeme', gorunurluk: { kosul: 'yeniIse' }, altModel: { dosya: 'kart.model.json', bolum: 'kart' } };
  const alt = dene('alt model', (m) => { m.adimlar.push(odeme); }, (m) => adimBul(m, 'odeme'), { tur: 'korunan', kapsam: 'adim' });
  expect(alt.bloklar.at(-2)).toMatchObject({ tur: 'korunan', ad: 'Ödeme', ozet: ['alt model: kart.model.json › kart', 'görünürlük koşulu: İşlem tipi Yeni'] });
  // Seçicisiz alan: yerinde (önceki alanın ardında) korunur.
  const seccisiz = { id: 'notlar', tip: 'metin', etiket: { ekran: 'Notlar' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'notlar' }, zorunlu: false };
  dene('seçicisiz alan', (m) => { adimBul(m, 'islem').bolumler[0].alanlar.splice(1, 0, seccisiz); }, (m) => adimBul(m, 'islem').bolumler);
});

test('saf: korunan parça yanlış yerde / iki kez ya da korunan adımın alanı başka grupta kullanılamaz', () => {
  const m = talepModeli();
  const { konum: _konum, ...kartNo } = alan('kartNo', 'metin', 'Kart no', '#kartNo');
  m.adimlar.push({ id: 'odeme', sira: 7, baslik: 'Ödeme', bolumler: [{ id: 'kartBolumu', baslik: 'Kart', alanlar: [kartNo] }] });
  const env = modeldenAkisEnvanteri(m);
  const korunanlar = korunanParcalari(m).parcalar;
  const bloklar = adimlardanBloklar(m, m.adimlar, env);
  const hatalar = (b: AkisBlogu[]) => akistanKayitEnvanteri(env, bloklariAyikla(kopya(b)).bloklar, { korunanlar }).hatalar.map((x) => x.mesaj);
  // Anahtarı modelde olmayan korunan parça ve aynı parçanın iki kez kullanılması.
  const i = bloklar.findIndex((b) => b.tur === 'alanlar' && b.ad === 'Yeni: sorgula');
  expect(hatalar(bloklar.map((b, j) => (j === i ? { ...b, korunan: 'ek:ana:yok' } : b)))).toContain('Bu bloğun korunan parçası modelde bulunamadı (model değişmiş olabilir); diyagramı yeniden açın.');
  const ikinci: AkisBlogu = { ...(bloklar[i] as Extract<AkisBlogu, { tur: 'alanlar' }>), ad: 'Yeni: sorgula (2)' };
  expect(hatalar([...bloklar.slice(0, -1), ikinci, { tur: 'aksiyon', dugme: 0, istegeBagli: false }, { tur: 'bitir' }]))
    .toContain('Aynı korunan parça birden çok blokta; fazlasını silin.');
  // Yalnız gösterilemeyen alanı olan (düğmesiz) adımın tamamı korunur; korunan adım isteğe bağlı aksiyondan hemen sonra gelemez.
  expect(bloklar.at(-2)).toMatchObject({ tur: 'korunan', kapsam: 'adim', ad: 'Ödeme', ozet: ['alanlar: “Kart no”'] });
  expect(hatalar([...bloklar.slice(0, -2), { tur: 'aksiyon', dugme: 0, istegeBagli: true }, ...bloklar.slice(-2)])).toContain('Korunan adım isteğe bağlı bir aksiyondan hemen sonra gelemez.');
  // Başarı göstergesi korunan adıma beklenen mesaj eklenemez.
  const url = kopya(m);
  adimBul(url, 'islem').kosu.basariGostergesi = { tur: 'url', deger: '/talep/2' };
  const b2 = adimlardanBloklar(url, url.adimlar, modeldenAkisEnvanteri(url));
  const j = b2.findIndex((b) => b.tur === 'aksiyon');
  const k2 = korunanParcalari(url).parcalar;
  expect(akistanKayitEnvanteri(modeldenAkisEnvanteri(url), bloklariAyikla(kopya([...b2.slice(0, j + 1), { tur: 'mesaj', mesaj: null, metin: 'Tamam' }, ...b2.slice(j + 1)])).bloklar, { korunanlar: k2 }).hatalar)
    .toEqual([{ blok: j + 1, mesaj: '“İşlem” adımının başarı göstergesi diyagramda düzenlenemez (aynen korunur); bu adıma beklenen mesaj eklenemez.' }]);
});

test.describe('veritabanı: akış tasarımı → kaydet → yeniden oku', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  let ekranId: string;
  test.beforeEach(async () => {
    klasor = geciciKlasor('akis-korunan');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Akis-Korunan-Kasa-Parolasi-5', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    ekranId = (await sayfaEkle(vt, projeId, paket(talepModeli()), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya') })).ekranId;
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });
  const model = (): Nesne => (ekranModeliGetir(vt, ekranId) as { model: Nesne }).model;
  const tasarim = (): AkisBlogu[] => akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' }).bloklar;
  const kaydet = (bloklar: AkisBlogu[], onay = true): Nesne => akisKaydet(vt, projeId, ekranId, { akisId: 'ana', ad: 'Ana akış', bloklar: kopya(bloklar), onay }) as Nesne;
  const hatalari = (bloklar: AkisBlogu[]): Array<{ blok: number | null; mesaj: string }> => {
    try { kaydet(bloklar, false); } catch (e) { if (e instanceof EkranDogrulamaHatasi) return e.hatalar as unknown as Array<{ blok: number | null; mesaj: string }>; throw e; }
    return [];
  };

  test('gerçek yapı: dallar ve kat penceresi düzenlenir; değişiklikler yazılır, korunan parçalar aynen kalır', () => {
    const ilk = model();
    const bloklar = tasarim();
    // Kullanıcı düzenler: "Yeni: hesapla" adımının adını değiştirir, müşteri no'yu çıkarır; korunan parçalar aynen kalır.
    const duzen = bloklar.map((b) => (b.tur === 'alanlar' && b.ad === 'İşlem' ? { ...b, alanlar: ['islemTipi'], zorunlu: ['islemTipi'] }
      : b.tur === 'alanlar' && b.ad === 'Yeni: hesapla' ? { ...b, ad: 'Yeni: tutarı hesapla' } : b));
    expect(kaydet(duzen, false)).toMatchObject({ etki: { yeni: false, senaryolar: [] } });
    expect(kaydet(duzen)).toMatchObject({ akisId: 'ana', surum: 2 });
    const son = model();
    expect(son.adimlar.map((a: Nesne) => [a.id, a.baslik, a.gorunurluk ?? null])).toEqual([
      ['islem', 'İşlem', null], ['yeniSorgula', 'Yeni: sorgula', { kosul: 'yeniIse' }], ['yeniHesapla', 'Yeni: tutarı hesapla', { kosul: 'yeniIse' }],
      ['yenilemeSorgula', 'Yenileme: sorgula', { kosul: 'yenilemeIse' }], ['katSecimi', 'Kat seçimi', { kosul: 'katPenceresiAcilirsa' }], ['kayit', 'Kayıt', null]
    ]);
    expect(adimBul(son, 'islem').bolumler[0].alanlar.map((a: Nesne) => a.id)).toEqual(['islemTipi']);
    for (const id of ['yeniSorgula', 'yenilemeSorgula', 'katSecimi', 'kayit']) expect(icerik(adimBul(son, id))).toEqual(icerik(adimBul(ilk, id)));
    expect(son.kosullar).toEqual(ilk.kosullar);
    expect(son.senaryoDuzeyi).toEqual(ilk.senaryoDuzeyi);
    // Yeniden açılan diyagram aynı korunan parçaları gösterir; değiştirmeden kaydetmek modeli değiştirmez.
    const ikinci = tasarim();
    expect(ikinci.filter((b) => 'korunan' in b && b.korunan).map((b) => (b as Nesne).korunan)).toEqual(['ek:ana:yeniSorgula', 'ek:ana:yeniHesapla', 'ek:ana:yenilemeSorgula', 'ek:ana:katSecimi']);
    kaydet(ikinci);
    expect(model().adimlar).toEqual(son.adimlar);
  });

  test('dayanak silinirse ret: korunan koşulun dayandığı alan akıştan çıkarılınca anlaşılır hata; korunan parça silinince onayda listelenir', () => {
    const once = model();
    const bloklar = tasarim();
    const islem = bloklar.findIndex((b) => b.tur === 'alanlar' && b.ad === 'İşlem');
    const hatalar = hatalari(bloklar.map((b, j) => (j === islem ? { ...(b as Extract<AkisBlogu, { tur: 'alanlar' }>), alanlar: ['musteriNo'], zorunlu: [] } : b)));
    const blokNo = (ad: string) => bloklar.findIndex((b) => b.tur === 'alanlar' && b.ad === ad);
    expect(hatalar).toEqual([
      { blok: blokNo('Yeni: sorgula'), mesaj: '“Yeni: sorgula” adımında diyagramda düzenlenemeyen görünürlük koşulu korunamaz: dayandığı “İşlem tipi” alanı akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin).' },
      { blok: blokNo('Yeni: hesapla'), mesaj: '“Yeni: hesapla” adımında diyagramda düzenlenemeyen görünürlük koşulu korunamaz: dayandığı “İşlem tipi” alanı akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin).' },
      { blok: blokNo('Yenileme: sorgula'), mesaj: '“Yenileme: sorgula” adımında diyagramda düzenlenemeyen görünürlük koşulu korunamaz: dayandığı “İşlem tipi” alanı akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin).' }
    ]);
    // Model değişmedi.
    expect(model().adimlar).toEqual(once.adimlar);
    // Korunan parçalı adımı (kat penceresi) silmek: onayda "silinecek korunan parça" olarak listelenir, onaylanınca yazılır.
    const kat = blokNo('Kat seçimi');
    const katsiz = bloklar.filter((_, j) => j !== kat && j !== kat + 1);
    expect((kaydet(katsiz, false).etki as Nesne).korunanSilinen).toEqual(['“Kat seçimi”: görünürlük koşulu: Kat penceresi açılırsa']);
    kaydet(katsiz);
    expect(model().adimlar.map((a: Nesne) => a.id)).not.toContain('katSecimi');
  });

  test('çok şartlı alan koşulu: dayandığı alan çıkarılırsa ret; eklenen yeni akışta (kopya) korunan parçalar da aynen', () => {
    const m = talepModeli();
    adimBul(m, 'islem').bolumler[0].alanlar[1].gorunurluk = { ifade: { ve: [{ alan: 'islemTipi', esit: 'yeni' }, { veya: [{ calismaZamani: 'gorunurse' }, { alan: 'islemTipi', dolu: false }] }] } };
    ekranModeliEkle(vt, { ekranId, model: m, aciklama: 'test' });
    const bloklar = tasarim();
    const islem = bloklar[0] as Extract<AkisBlogu, { tur: 'alanlar' }>;
    expect(islem.korunanKosullar).toEqual({ musteriNo: '“İşlem tipi” = yeni ve çalışma anında görünürse veya “İşlem tipi” boş' });
    // İşlem tipini başka bir gruba taşımak serbesttir; akıştan çıkarmak koşulu bozar → ret.
    const hatalar = hatalari([{ ...islem, alanlar: ['musteriNo'], zorunlu: [] }, ...bloklar.slice(1)]).map((h) => h.mesaj);
    expect(hatalar).toContain('“Müşteri no” alanının diyagramda düzenlenemeyen görünürlük koşulu (“İşlem tipi” = yeni ve çalışma anında görünürse veya “İşlem tipi” boş) korunamaz: dayandığı “İşlem tipi” alanı akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin).');
    // Kopyadan yeni akış: aynı korunan parçalar yeni akışın adımlarında da aynen.
    const kopyaBloklar = akisTasarimi(vt, projeId, ekranId, { kopya: 'ana' }).bloklar;
    const y = akisKaydet(vt, projeId, ekranId, { ad: 'Kopya akış', bloklar: kopya(kopyaBloklar), onay: true }) as Nesne;
    const yeni = model();
    const akis = (yeni.akislar as Nesne[]).find((a) => a.id === y.akisId) as Nesne;
    expect(akis.adimlar.map(icerik)).toEqual(yeni.adimlar.map(icerik));
    expect(akisDuzenlenebilirMi(yeni).duzenlenebilir).toBe(true);
  });
});

test('arayüz: korunan bloklar salt okunur ve kilitli görünür; korunan parçalı blok silinirken onay istenir', async () => {
  test.setTimeout(120_000);
  const klasor = mkdtempSync(join(tmpdir(), 'akis-korunan-arayuz-'));
  const PAROLA = 'Akis-Korunan-Arayuz-Parolasi-9';
  const vtYolu = join(klasor, 'platform.db');
  const m = talepModeli();
  adimBul(m, 'islem').bolumler[0].alanlar[1].gorunurluk = { ifade: { baglam: { alanSeti: 'A' } } };
  adimBul(m, 'islem').kosu.aksiyonlar[0].metin = 'Devam';
  let ekran = '';
  let projeId = '';
  {
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Korunan proje' });
    ekran = (await sayfaEkle(vt, projeId, paket(m), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor, 'medya') })).ekranId;
    vt.kapat();
  }
  const nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const tarayici = await korumaliTarayici();
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    expect(await nobetciApi(nobetci, `/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekran}`)).toMatchObject({ duzenlenebilir: true, neden: null });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran)}/akis`);
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    // Korunan aksiyonlar: salt okunur blok (girdi yok), kilitli not ve rozet.
    const aksiyonlar = diyagram.getByRole('listitem', { name: /blok: Korunan aksiyonlar \(İşlem\)$/ });
    await expect(aksiyonlar).toBeVisible();
    await expect(aksiyonlar.getByText('salt okunur', { exact: true })).toBeVisible();
    await expect(aksiyonlar.getByRole('note', { name: 'Diyagramda düzenlenemeyen parçalar' })).toContainText('“Devam” düğmesine bas (yazısı “Devam” olan)');
    await expect(aksiyonlar.locator('input, select, textarea')).toHaveCount(0);
    // Seçime bağlı düğmeli dal: alan grubunda "korunan parça" rozeti ve kilitli not; ad düzenlenebilir.
    const dal = diyagram.getByRole('listitem', { name: /blok: Alan grubu \(Yeni: sorgula\)$/ });
    await expect(dal.getByText('korunan parça', { exact: true })).toBeVisible();
    await expect(dal.getByRole('note', { name: 'Diyagramda düzenlenemeyen parçalar' })).toContainText('görünürlük koşulu: İşlem tipi Yeni');
    await expect(dal.getByRole('textbox', { name: 'Adım adı' })).toBeEditable();
    // Bağlam koşulu olan alan: kilitli, salt okunur koşul; yanında yalnız "Koşulu değiştir" (düzenle / ekle yok).
    const islem = diyagram.getByRole('listitem', { name: /blok: Alan grubu \(İşlem\)$/ });
    await expect(islem.getByRole('note', { name: 'Müşteri no: koşul (diyagramda düzenlenemez)' })).toHaveText('bağlam: A');
    await expect(islem.getByRole('button', { name: 'Müşteri no: koşul' })).toHaveText('Koşulu değiştir');
    await expect(islem.getByRole('button', { name: 'İşlem tipi: koşul' })).toBeVisible();
    // Korunan parçalı bloğu silmek onay ister; vazgeçilince blok kalır.
    await dal.getByRole('button', { name: 'Bloğu sil' }).click();
    const onay = page.locator('dialog.onay-diyalogu');
    await expect(onay.getByRole('heading', { name: 'Korunan parça silinsin mi?' })).toBeVisible();
    await expect(onay).toContainText('görünürlük koşulu: İşlem tipi Yeni');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dal).toBeVisible();
    // Değiştirmeden kaydetmek geçerli (korunan parçalar aynen).
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(onay.getByRole('heading', { name: '“Ana akış” akışı kaydedilsin mi?' })).toBeVisible();
    await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeHidden();
    const gecmis = ((await nobetciApi(nobetci, `/platform/ekran?projeId=${projeId}&id=${ekran}`)).gecmis as Nesne[]).map((g) => g.aciklama);
    expect(gecmis[0]).toBe('Akış düzenlendi: Ana akış');
    // Dar ekranda (390 px) taşma yok.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(aksiyonlar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});
