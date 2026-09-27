// KORUMA TESTLERİ — tek senaryo doğrulayıcısı (scripts/dogrulama/senaryo-dogrulayici.mjs).
// Tarayıcı AÇMAZ, hiçbir siteye BAĞLANMAZ. Çalıştırma: npm run test:birim
// Kontroller (genel, modelden okunan kurallar):
//  - Her kural için geçerli/geçersiz örnekler (seçenek listesi, bağımlı seçenek, görünürlük koşulu,
//    TC/VKN, telefon, doğum tarihi, kart alanları + son kullanma ay/yıl, profil ↔ kimlik, beklenen
//    sonuç, başlık, dosya uzantısı / pozitif sayı, girdi ↔ kayıt farkları).
//  - Mesaj şablonları birbirinden farklı; hiçbir mesaj kart numarası/CVV içermiyor.
//  - Her hata alanı formda bir kontrole eşleniyor (modelin form karşılıkları).
//  - Örnek sayfa paketinin (model-fikstur.ts) önerileri hatasız.
//  - Geriye uyum: eski anahtar adlarıyla gelen model aynı sonucu verir; etiketsiz alanda iç anahtar gösterilmez.
// Model: bu dosyadaki NÖTR "Örnek talep" ekran modeli + kart alt modeli (değerler sahte).
import { expect, test } from '@playwright/test';
import {
  MESAJLAR,
  alanFormKimlikleri,
  kartSuresiGectiMi,
  kartiNormallestir,
  krediKartlariAyniMi,
  senaryoyuDogrula,
  tcKimlikNoGecerliMi,
  type DogrulamaBaglami,
  type DogrulamaBulgusu,
  type DogrulamaKarti,
  type DogrulamaSonucu
} from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { modelFormKontrolleri, type YuklenmisEkranModeli } from '../support/ekran-modeli';
import { ornekBasvuruModeli, ornekBasvuruPaketi } from './model-fikstur';

type Nesne = Record<string, unknown>;
/** Örnek kimlik profilleri (sahte; kuralların kabul etmesi gereken biçimler). */
type OrnekKimlikler = { ozel: Record<string, Nesne>; tuzel: Record<string, Nesne> };

/** Sabit "şimdi": 24.09.2026 (tarih kuralları buna göre). */
const SIMDI = new Date(2026, 8, 24, 12, 0, 0);
const KART_DOSYASI = 'ornek-kart.model.json';
const ONAY_KOSULU = 'onay adımı dahil (onayAdimiDahil: true)';

// ---------------------------------------------------------------------------------------
// Nötr örnek model (yalnızca doğrulayıcının okuduğu anahtarlar + form karşılıkları)
// ---------------------------------------------------------------------------------------

const form = (id: string, kontrol: string, yardimcilar: Array<[string, string, string]> = []): Nesne => ({
  id, kontrol, ...(yardimcilar.length ? { yardimciKontroller: yardimcilar.map(([yid, yk, amac]) => ({ id: yid, kontrol: yk, amac })) } : {})
});
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket, form: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, form: form(`f_${id}`, tip), ...ek
});
const kimlikParcalari = (onEk: string): Nesne[] => [
  { id: `${onEk}No`, tip: 'metin', etiket: { ekran: 'Kimlik no', form: 'Kimlik no' }, eslesme: { kimlikAlani: 'tcKimlikNo' }, form: form(`f_${onEk}No`, 'metin') },
  { id: `${onEk}Dogum`, tip: 'tarih', bicim: 'gg.aa.yyyy', etiket: { ekran: 'Doğum', form: 'Doğum' }, eslesme: { kimlikAlani: 'dogumTarihi' }, form: form(`f_${onEk}Dogum`, 'metin') },
  { id: `${onEk}Telefon`, tip: 'metin', etiket: { ekran: 'Telefon', form: 'Telefon' }, eslesme: { kimlikAlani: 'cepTelefonu' }, form: form(`f_${onEk}Telefon`, 'metin') }
];
const kartAlani = (kart: string, etiket: string, tip = 'metin', ek: Nesne = {}): Nesne => ({
  id: `kart_${kart}`, tip, etiket: { ekran: etiket, form: etiket }, yapilandirma: 'senaryo', eslesme: { kayitAlani: kart }, form: form(`f_kart_${kart}`, tip), ...ek
});

function ornekTalepModeli(): Nesne {
  return {
    semaSurumu: 1, tur: 'ekran', id: 'ornek-talep', ad: 'Örnek talep',
    kosullar: {
      onayDahil: { aciklama: ONAY_KOSULU, ifade: { senaryoAyari: 'onayAdimiDahil', esit: true } },
      ekHizmetGorunur: { aciklama: 'kapsam EKSPRES', ifade: { alan: 'kapsam', esit: 'EKSPRES' } },
      tekliTalep: { aciklama: 'tekli talep', ifade: { alan: 'talepTipi', esit: 'tekli' } },
      cokluTalep: { aciklama: 'çoklu talep', ifade: { alan: 'talepTipi', esit: 'coklu' } },
      farkliSahip: { aciklama: 'hesap sahibi farklı', ifade: { alan: 'sahip', icinde: ['farkliBireysel', 'farkliKurumsal'] } }
    },
    adimlar: [
      { id: 'giris', sira: 1, baslik: 'Ekran açılır', bolumler: [] },
      {
        id: 'bilgiler', sira: 2, baslik: 'Talep bilgileri girilir',
        bolumler: [
          {
            id: 'temel', alanlar: [
              alan('kapsam', 'secim', 'Kapsam', { zorunlu: true, secenekler: [{ deger: 'EKSPRES' }, { deger: 'STANDART' }] }),
              alan('plan', 'secim', 'Plan', {
                zorunlu: true,
                bagimlilik: { alan: 'kapsam', secenekHaritasi: { 'EKSPRES': [{ deger: 'PLAN A' }, { deger: 'PLAN B' }], STANDART: [{ deger: 'PLAN C' }] } }
              }),
              alan('ekHizmet', 'secim', 'Ek hizmet', { zorunlu: true, secenekler: [{ deger: 'E' }, { deger: 'H' }], gorunurluk: { kosul: 'ekHizmetGorunur' } }),
              alan('talepTipi', 'secim', 'Talep tipi', { zorunlu: true, secenekler: [{ deger: 'tekli' }, { deger: 'coklu' }] }),
              alan('talepDosyasi', 'dosya', 'Talep dosyası', { kabul: '.xlsx', gorunurluk: { kosul: 'cokluTalep' } }),
              alan('kisiSayisi', 'sayi', 'Kişi sayısı', { gorunurluk: { kosul: 'cokluTalep' } })
            ]
          },
          {
            id: 'kisi', gorunurluk: { kosul: 'tekliTalep' }, alanlar: [{
              ...alan('kisiKimlik', 'kimlikProfili', 'Kişi kimliği', {
                zorunlu: false, kimlikTuru: 'ozel', eslesme: { senaryo: ['kisiProfili', 'kisiKimligi'], profilHavuzu: 'Bireysel müşteri' },
                form: form('f_kisiKip', 'radyo', [['f_kisiProfil', 'secim', 'profil']])
              }),
              altAlanlar: kimlikParcalari('kisi')
            }]
          },
          {
            id: 'sahipBilgileri', alanlar: [
              alan('sahip', 'radyo', 'Hesap sahibi', { zorunlu: true, secenekler: [{ deger: 'ayni' }, { deger: 'farkliBireysel' }, { deger: 'farkliKurumsal' }] }),
              {
                ...alan('sahipKimlik', 'kimlikProfili', 'Hesap sahibi kimliği', {
                  zorunlu: true, gorunurluk: { kosul: 'farkliSahip' }, bagimlilik: { alan: 'sahip' },
                  kimlikTuru: { farkliBireysel: 'ozel', farkliKurumsal: 'tuzel' },
                  eslesme: {
                    senaryo: ['sahipProfili', 'sahipOzelKimligi', 'sahipTuzelKimligi'],
                    profilHavuzu: { farkliBireysel: 'Bireysel müşteri', farkliKurumsal: 'Kurumsal müşteri' }
                  },
                  form: form('f_sahipKip', 'radyo', [['f_sahipProfil', 'secim', 'profil']])
                }),
                altAlanlar: [
                  {
                    id: 'sahipNo', tip: 'metin', etiket: { ekran: 'Kimlik no', form: 'Kimlik no' },
                    eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
                    form: form('f_sahipNo', 'metin', [['f_sahipVkn', 'metin', 'vergiKimlikNo']])
                  },
                  {
                    id: 'sahipDogum', tip: 'tarih', bicim: 'gg.aa.yyyy', etiket: { ekran: 'Doğum', form: 'Doğum' }, eslesme: { kimlikAlani: 'dogumTarihi' },
                    gorunurluk: { ifade: { alan: 'sahip', esit: 'farkliBireysel' } }, form: form('f_sahipDogum', 'metin')
                  },
                  { id: 'sahipTelefon', tip: 'metin', etiket: { ekran: 'Telefon', form: 'Telefon' }, eslesme: { kimlikAlani: 'cepTelefonu' }, form: form('f_sahipTelefon', 'metin') }
                ]
              }
            ]
          }
        ]
      },
      { id: 'hesaplama', sira: 3, baslik: 'Tutar hesaplanır', bolumler: [] },
      { id: 'onay', sira: 4, baslik: 'Talep onaylanır', gorunurluk: { kosul: 'onayDahil' }, bolumler: [] },
      { id: 'odeme', sira: 5, baslik: 'Ödeme yapılır', gorunurluk: { kosul: 'onayDahil' }, altModel: { dosya: KART_DOSYASI, bolum: 'kartFormu' } }
    ],
    senaryoDuzeyi: {
      alanlar: [
        { ...alan('baslik', 'metin', 'Senaryo Başlığı', { zorunlu: true }) },
        { ...alan('subeProfili', 'secim', 'Şube', { eslesme: { senaryo: 'subeProfili', profilHavuzu: 'Şube' }, varsayilan: { deger: 'Merkez' } }) },
        alan('onayAdimiDahil', 'onayKutusu', 'Onay adımını dahil et', { zorunlu: true }),
        {
          ...alan('odemeKarti', 'altModelGecersizKilma', 'Ödeme kartı', { gorunurluk: { kosul: 'onayDahil' }, altModel: { dosya: KART_DOSYASI, bolum: 'kartFormu' } }),
          form: null
        },
        {
          ...alan('beklenenSonuc', 'birlesim', 'Beklenen sonuç', {
            form: form('f_beklenen', 'secim', [['f_beklenenAdim', 'secim', 'isKuraliHatasi.adim'], ['f_beklenenMesaj', 'metin', 'isKuraliHatasi.mesaj']])
          }),
          varyantlar: [
            { tip: 'basarili' },
            {
              tip: 'isKuraliHatasi',
              alanlar: {
                adim: {
                  etiket: 'Hatanın Beklendiği Adım',
                  secenekler: [
                    { deger: 'hesaplama', metin: 'Tutar hesaplama' }, { deger: 'onay', metin: 'Onay', kosul: 'onayDahil' },
                    { deger: 'odeme', metin: 'Ödeme', kosul: 'onayDahil' }
                  ]
                },
                mesaj: { etiket: 'Beklenen Mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    }
  };
}

const TAKSITLER = ['1', '2', '3', '6', '9'];

function ornekKartModeli(): Nesne {
  const ay = Array.from({ length: 12 }, (_, i) => ({ deger: String(i + 1), metin: String(i + 1).padStart(2, '0') }));
  return {
    tur: 'altModel', id: 'ornek-kart', ad: 'Ödeme kartı',
    bolumler: [{
      id: 'kartFormu', alanlar: [
        kartAlani('isim', 'Kart üzerindeki ad', 'metin', { zorunlu: true }),
        kartAlani('soyisim', 'Kart üzerindeki soyad'),
        kartAlani('kartNo', 'Kart numarası', 'metin', { zorunlu: true, hassas: true }),
        kartAlani('guvenlikKodu', 'Güvenlik kodu', 'metin', { zorunlu: true, hassas: true }),
        kartAlani('sonKullanmaAyi', 'Son kullanma ayı', 'secim', { zorunlu: true, secenekler: ay }),
        kartAlani('sonKullanmaYili', 'Son kullanma yılı', 'secim', { zorunlu: true }),
        // Taksit: izinli değerler modelden gelir (kodda sabit üst sınır yok).
        kartAlani('taksit', 'Taksit', 'secim', { secenekler: TAKSITLER.map((t) => ({ deger: t })) })
      ]
    }]
  };
}

const MODEL = ornekTalepModeli();
const ALT_MODELLER: Record<string, Nesne> = { [KART_DOSYASI]: ornekKartModeli() };
const YUKLENMIS = { model: MODEL, altModeller: ALT_MODELLER, dosyaYolu: 'ornek-talep.model.json' } as unknown as YuklenmisEkranModeli;

function baglam(ek: Partial<DogrulamaBaglami> = {}): DogrulamaBaglami {
  return { ...(YUKLENMIS as unknown as Pick<DogrulamaBaglami, 'model' | 'altModeller'>), ortam: 'test', simdi: SIMDI, kaynak: 'kayit', ...ek };
}

/** Geçerli bir kayıt (kapsam EKSPRES: ek hizmet görünür); vakalar bunun üzerine değişiklik yapar. */
const TEMEL: Readonly<Nesne> = Object.freeze({
  baslik: 'Birim testi senaryosu',
  kapsam: 'EKSPRES',
  plan: 'PLAN A',
  ekHizmet: 'E',
  talepTipi: 'tekli',
  sahip: 'ayni',
  onayAdimiDahil: true,
  subeProfili: 'Yetkili'
});

const GECERLI_KART = Object.freeze({
  isim: 'DENEME',
  soyisim: 'KART',
  kartNo: '4111 1111 1111 1111',
  guvenlikKodu: '987',
  sonKullanmaAyi: { deger: '9', metin: '09' },
  sonKullanmaYili: { deger: '2026', metin: '2026' },
  taksit: { deger: '3', metin: '3 Taksit' }
});
/** Örnek varsayılan kart (sahte; normalleştirme / karşılaştırma için). */
const VARSAYILAN_KART = Object.freeze({
  isim: 'ORNEK', soyisim: 'KART', kartNo: '4000000000000002', guvenlikKodu: '456',
  sonKullanmaAyi: { deger: '1', metin: '01' }, sonKullanmaYili: { deger: '2030', metin: '2030' }, taksit: { deger: '1', metin: 'Tek Çekim' }
});
const HASSAS_DEGERLER = ['4111111111111111', '4111 1111 1111 1111', '987', '123456789012', '12'];
const ORNEK_KIMLIKLER: OrnekKimlikler = {
  ozel: {
    k1: { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1985', cepTelefonu: '5550000001' },
    k2: { tcKimlikNo: '10000000214', dogumTarihi: '29.02.2000', cepTelefonu: '5550000002' }
  },
  tuzel: { t1: { vergiKimlikNo: '1000000001', cepTelefonu: '5550000005' } }
};

function senaryo(degisiklik: Nesne, silinecekler: string[] = []): Nesne {
  const s: Nesne = { ...TEMEL, ...degisiklik };
  for (const a of silinecekler) delete s[a];
  return s;
}

type Vaka = {
  ad: string;
  senaryo: Nesne;
  baglam?: Partial<DogrulamaBaglami>;
  /** Beklenen HATA: alan + mesaj (tam eşleşme). Boşsa geçerli olmalı. */
  hatalar: DogrulamaBulgusu[];
  uyarilar?: DogrulamaBulgusu[];
};

const kart = (ek: Partial<Record<keyof DogrulamaKarti, unknown>>): Nesne => ({ ...GECERLI_KART, ...ek });
const kisi = (ek: Nesne): Nesne => ({ kisiKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1985', cepTelefonu: '5550000001', ...ek } });

const VAKALAR: Vaka[] = [
  { ad: 'geçerli temel kayıt', senaryo: senaryo({}), hatalar: [] },
  // Seçenek listesi / bağımlı seçenek (modelin seçenekleri, plan kapsama bağlı)
  { ad: 'kapsam listede değil', senaryo: senaryo({ kapsam: 'KURYE' }), hatalar: [{ alan: 'kapsam', mesaj: MESAJLAR.secenekDisi('Kapsam', 'KURYE', ['EKSPRES', 'STANDART']) }] },
  {
    ad: 'plan kapsama uymuyor',
    senaryo: senaryo({ plan: 'PLAN C' }),
    hatalar: [{ alan: 'plan', mesaj: MESAJLAR.bagimliSecenekDisi('Plan', 'PLAN C', 'Kapsam', 'EKSPRES', ['PLAN A', 'PLAN B']) }]
  },
  { ad: 'STANDART + PLAN C geçerli', senaryo: senaryo({ kapsam: 'STANDART', plan: 'PLAN C' }, ['ekHizmet']), hatalar: [] },
  { ad: 'talep tipi listede değil', senaryo: senaryo({ talepTipi: 'toplu' }), hatalar: [{ alan: 'talepTipi', mesaj: MESAJLAR.secenekDisi('Talep tipi', 'toplu', ['tekli', 'coklu']) }] },
  // Görünürlük koşulu: alan yalnızca görünürse zorunlu; görünmeyen alana değer → uyarı
  { ad: 'ek hizmet eksik, görünür → hata', senaryo: senaryo({}, ['ekHizmet']), hatalar: [{ alan: 'ekHizmet', mesaj: MESAJLAR.zorunlu('Ek hizmet') }] },
  { ad: 'ek hizmet eksik, gizli → geçerli', senaryo: senaryo({ kapsam: 'STANDART', plan: 'PLAN C' }, ['ekHizmet']), hatalar: [] },
  {
    ad: 'ek hizmet verilmiş, gizli → uyarı (değer kullanılmaz)',
    senaryo: senaryo({ kapsam: 'STANDART', plan: 'PLAN C' }),
    hatalar: [],
    uyarilar: [{ alan: 'ekHizmet', mesaj: MESAJLAR.gorunmeyenAlan('Ek hizmet') }]
  },
  { ad: 'ek hizmet geçersiz değer', senaryo: senaryo({ ekHizmet: 'X' }), hatalar: [{ alan: 'ekHizmet', mesaj: MESAJLAR.secenekDisi('Ek hizmet', 'X', ['E', 'H']) }] },
  // Serbest kimlik: TC (11 hane + kontrol haneleri), telefon, doğum tarihi
  { ad: 'serbest kişi kimliği geçerli', senaryo: senaryo(kisi({ dogumTarihi: '24.09.2026' })), hatalar: [] },
  { ad: 'TC kontrol hanesi yanlış', senaryo: senaryo(kisi({ tcKimlikNo: '10000000147' })), hatalar: [{ alan: 'kisiKimligi.tcKimlikNo', mesaj: MESAJLAR.tcKontrolHanesi() }] },
  { ad: 'TC 0 ile başlıyor / 10 hane', senaryo: senaryo(kisi({ tcKimlikNo: '0100000001' })), hatalar: [{ alan: 'kisiKimligi.tcKimlikNo', mesaj: MESAJLAR.tcBicim() }] },
  { ad: 'telefon başında 0', senaryo: senaryo(kisi({ cepTelefonu: '05550000001' })), hatalar: [{ alan: 'kisiKimligi.cepTelefonu', mesaj: MESAJLAR.telefonBicim() }] },
  {
    ad: 'doğum tarihi gelecekte (yarın)',
    senaryo: senaryo(kisi({ dogumTarihi: '25.09.2026' })),
    hatalar: [{ alan: 'kisiKimligi.dogumTarihi', mesaj: MESAJLAR.tarihGelecekte('Doğum Tarihi') }]
  },
  {
    ad: 'doğum tarihi takvimde yok / yanlış biçim',
    senaryo: senaryo({
      sahip: 'farkliBireysel',
      sahipOzelKimligi: { tcKimlikNo: '10000000214', dogumTarihi: '31.02.2000', cepTelefonu: '5550000002' },
      ...kisi({ dogumTarihi: '1985-02-01' })
    }),
    hatalar: [
      { alan: 'kisiKimligi.dogumTarihi', mesaj: MESAJLAR.tarihBicim('Doğum Tarihi', 'gg.aa.yyyy') },
      { alan: 'sahipOzelKimligi.dogumTarihi', mesaj: MESAJLAR.tarihBicim('Doğum Tarihi', 'gg.aa.yyyy') }
    ]
  },
  { ad: 'serbest kimlikte alan eksik', senaryo: senaryo(kisi({ dogumTarihi: '' })), hatalar: [{ alan: 'kisiKimligi.dogumTarihi', mesaj: MESAJLAR.zorunlu('Doğum Tarihi') }] },
  {
    ad: 'kurumsal sahip: VKN 10 hane, doğum tarihi istenmez',
    senaryo: senaryo({ sahip: 'farkliKurumsal', sahipTuzelKimligi: { vergiKimlikNo: '123', cepTelefonu: '5550000005' } }),
    hatalar: [{ alan: 'sahipTuzelKimligi.vergiKimlikNo', mesaj: MESAJLAR.vknBicim() }]
  },
  { ad: 'kurumsal sahip geçerli', senaryo: senaryo({ sahip: 'farkliKurumsal', sahipTuzelKimligi: { vergiKimlikNo: '1000000001', cepTelefonu: '5550000005' } }), hatalar: [] },
  // Profil ↔ kimlik
  {
    ad: 'farklı sahip, profil de kimlik de yok',
    senaryo: senaryo({ sahip: 'farkliBireysel' }),
    hatalar: [{ alan: 'sahipProfili', mesaj: MESAJLAR.profilYaDaKimlikZorunlu('Hesap sahibi kimliği') }]
  },
  { ad: 'farklı sahip, hazır profil geçerli', senaryo: senaryo({ sahip: 'farkliKurumsal', sahipProfili: 't1' }), hatalar: [] },
  {
    ad: 'kişi profil + kimlik birlikte',
    senaryo: senaryo({ kisiProfili: 'k2', ...kisi({}) }),
    hatalar: [{ alan: 'kisiProfili', mesaj: MESAJLAR.profilVeKimlikBirlikte('Kişi kimliği') }]
  },
  {
    ad: 'aynı sahipken verilen sahip kimliği → uyarı',
    senaryo: senaryo({ sahipProfili: 'k1' }),
    hatalar: [],
    uyarilar: [{ alan: 'sahipProfili', mesaj: MESAJLAR.gorunmeyenAlan('Hesap sahibi kimliği') }]
  },
  // Başlık: kayıtta zorunlu, girdide sonradan verilebilir
  { ad: 'kayıtta başlık yok', senaryo: senaryo({}, ['baslik']), hatalar: [{ alan: 'baslik', mesaj: MESAJLAR.zorunlu('Senaryo Başlığı') }] },
  { ad: 'girdide başlık yok (Dene)', senaryo: senaryo({}, ['baslik']), baglam: { kaynak: 'girdi' }, hatalar: [] },
  { ad: 'girdide başlık boş (Düzenle)', senaryo: senaryo({ baslik: '  ' }), baglam: { kaynak: 'girdi' }, hatalar: [{ alan: 'baslik', mesaj: MESAJLAR.zorunlu('Senaryo Başlığı') }] },
  // Dosya uzantısı / pozitif tam sayı (yalnızca çoklu talepte görünen alanlar)
  {
    ad: 'çoklu dosya uzantısı yanlış, kişi sayısı 0',
    senaryo: senaryo({ talepTipi: 'coklu', talepDosyasi: 'a.xls', kisiSayisi: 0 }),
    hatalar: [
      { alan: 'talepDosyasi', mesaj: MESAJLAR.dosyaUzantisi('Talep dosyası', '.xlsx') },
      { alan: 'kisiSayisi', mesaj: MESAJLAR.pozitifTamSayi('Kişi sayısı') }
    ]
  },
  { ad: 'çoklu dosya ve kişi sayısı geçerli', senaryo: senaryo({ talepTipi: 'coklu', talepDosyasi: 'liste.xlsx', kisiSayisi: '3' }), hatalar: [] },
  {
    ad: 'tekli talepte çoklu dosya → uyarı',
    senaryo: senaryo({ talepDosyasi: 'liste.xlsx' }),
    hatalar: [],
    uyarilar: [{ alan: 'talepDosyasi', mesaj: MESAJLAR.gorunmeyenAlan('Talep dosyası') }]
  },
  // Beklenen sonuç (modelin varyantları + adım seçeneği koşulu)
  { ad: 'onayAdimiDahil eksik', senaryo: senaryo({}, ['onayAdimiDahil']), hatalar: [{ alan: 'onayAdimiDahil', mesaj: MESAJLAR.zorunlu('Onay adımını dahil et') }] },
  { ad: 'onayAdimiDahil boolean değil', senaryo: senaryo({ onayAdimiDahil: 'evet' }), hatalar: [{ alan: 'onayAdimiDahil', mesaj: MESAJLAR.booleanOlmali('Onay adımını dahil et') }] },
  {
    ad: 'onayda hata, onay dahil değil',
    senaryo: senaryo({ onayAdimiDahil: false, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'onay', mesaj: 'x' } }),
    hatalar: [{ alan: 'beklenenSonuc.adim', mesaj: MESAJLAR.kosulluSecenek('Hatanın Beklendiği Adım', 'Onay', ONAY_KOSULU) }]
  },
  {
    ad: 'iş kuralı hatası, mesaj boş',
    senaryo: senaryo({ beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: '  ' } }),
    hatalar: [{ alan: 'beklenenSonuc.mesaj', mesaj: MESAJLAR.zorunlu('Beklenen Mesaj') }]
  },
  {
    ad: 'beklenen sonuç tipi bilinmiyor',
    senaryo: senaryo({ beklenenSonuc: { tip: 'zamanAsimi' } }),
    hatalar: [{ alan: 'beklenenSonuc.tip', mesaj: MESAJLAR.secenekDisi('Beklenen Sonuç tipi', 'zamanAsimi', ['basarili', 'isKuraliHatasi']) }]
  },
  {
    ad: 'eski beklenenHataMesaji alanı',
    senaryo: senaryo({ beklenenHataMesaji: 'm' }),
    hatalar: [{ alan: 'beklenenSonuc', mesaj: MESAJLAR.eskiBeklenenSonucAlanlari(['beklenenHataMesaji']) }]
  },
  // Kart (alt model ezme): tek kural kümesi, son kullanma AY + YIL
  { ad: 'senaryo kartı geçerli (bu ay)', senaryo: senaryo({ odemeKarti: kart({}) }), hatalar: [] },
  {
    ad: 'senaryo kartının süresi geçmiş (geçen ay)',
    senaryo: senaryo({ odemeKarti: kart({ sonKullanmaAyi: { deger: '8', metin: '08' } }) }),
    hatalar: [{ alan: 'odemeKarti.sonKullanmaYili', mesaj: MESAJLAR.kartSuresiGecmis('08/2026') }]
  },
  {
    ad: 'kart alanları biçim dışı',
    senaryo: senaryo({
      odemeKarti: kart({ isim: ' ', kartNo: '123456789012', guvenlikKodu: '12', sonKullanmaAyi: { deger: '13' }, sonKullanmaYili: { deger: '26' }, taksit: { deger: '24' } })
    }),
    hatalar: [
      { alan: 'odemeKarti.isim', mesaj: MESAJLAR.zorunlu('Kart üzerindeki ad') },
      { alan: 'odemeKarti.kartNo', mesaj: MESAJLAR.kartNoBicim() },
      { alan: 'odemeKarti.guvenlikKodu', mesaj: MESAJLAR.cvvBicim() },
      { alan: 'odemeKarti.sonKullanmaAyi', mesaj: MESAJLAR.kartAyBicim() },
      { alan: 'odemeKarti.sonKullanmaYili', mesaj: MESAJLAR.kartYilBicim() },
      { alan: 'odemeKarti.taksit', mesaj: MESAJLAR.secenekDisi('Taksit', '24', TAKSITLER) }
    ]
  },
  {
    ad: 'onay dahil değilken kart',
    senaryo: senaryo({ onayAdimiDahil: false, odemeKarti: kart({}) }),
    hatalar: [{ alan: 'odemeKarti', mesaj: MESAJLAR.kosulluAlan('Ödeme kartı', ONAY_KOSULU) }]
  },
  { ad: 'kart nesne değil', senaryo: senaryo({ odemeKarti: 'kart' }), hatalar: [{ alan: 'odemeKarti', mesaj: MESAJLAR.nesneOlmali('Ödeme kartı') }] },
  { ad: 'senaryo nesne değil', senaryo: null as unknown as Nesne, hatalar: [{ alan: '', mesaj: MESAJLAR.senaryoNesneDegil() }] }
];

function dogrula(vaka: Vaka): DogrulamaSonucu {
  return senaryoyuDogrula(vaka.senaryo, baglam(vaka.baglam));
}

test.describe('Tek senaryo doğrulayıcısı — kurallar', () => {
  for (const vaka of VAKALAR) {
    test(vaka.ad, () => {
      const sonuc = dogrula(vaka);
      expect(sonuc.hatalar).toEqual(vaka.hatalar);
      expect(sonuc.gecerli).toBe(vaka.hatalar.length === 0);
      if (vaka.uyarilar) expect(sonuc.uyarilar).toEqual(vaka.uyarilar);
    });
  }

  test('kayıt ile aynı değerler girdide de aynı sonucu verir (form ↔ sunucu)', () => {
    for (const vaka of VAKALAR.filter((v) => !v.baglam?.kaynak && v.senaryo && 'baslik' in v.senaryo)) {
      expect(senaryoyuDogrula(vaka.senaryo, baglam({ ...vaka.baglam, kaynak: 'girdi' })).hatalar, vaka.ad).toEqual(vaka.hatalar);
    }
  });

  test('model olmadan doğrulama yapılmaz', () => {
    expect(() => senaryoyuDogrula({}, {} as DogrulamaBaglami)).toThrow(/baglam\.model/);
  });
});

test.describe('Tek senaryo doğrulayıcısı — yardımcılar ve koruma', () => {
  test('TC kontrol hanesi algoritması; örnek profillerin TC, telefon ve doğum tarihleri kurallara uyuyor', () => {
    expect(tcKimlikNoGecerliMi('10000000146')).toBe(true);
    expect(tcKimlikNoGecerliMi('10000000147')).toBe(false);
    expect(tcKimlikNoGecerliMi('00000000000')).toBe(false);
    expect(tcKimlikNoGecerliMi(10000000146)).toBe(false);
    const sorunlar: string[] = [];
    for (const [anahtar, kimlik] of Object.entries(ORNEK_KIMLIKLER.ozel)) {
      for (const h of senaryoyuDogrula(senaryo({ kisiKimligi: kimlik }), baglam()).hatalar) sorunlar.push(`ozel.${anahtar} > ${h.alan}: ${h.mesaj}`);
    }
    for (const [anahtar, kimlik] of Object.entries(ORNEK_KIMLIKLER.tuzel)) {
      for (const h of senaryoyuDogrula(senaryo({ sahip: 'farkliKurumsal', sahipTuzelKimligi: kimlik }), baglam()).hatalar) sorunlar.push(`tuzel.${anahtar} > ${h.alan}: ${h.mesaj}`);
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });

  test('kart son kullanma: ay duyarlı; normalleştirme ve karşılaştırma', () => {
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '9' }, sonKullanmaYili: { deger: '2026' } }, SIMDI)).toBe(false);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '8' }, sonKullanmaYili: { deger: '2026' } }, SIMDI)).toBe(true);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '1' }, sonKullanmaYili: { deger: '2027' } }, SIMDI)).toBe(false);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: 'x' }, sonKullanmaYili: { deger: '2027' } }, SIMDI)).toBeNull();
    const normal = kartiNormallestir({ ...VARSAYILAN_KART, kartNo: VARSAYILAN_KART.kartNo.replace(/(\d{4})/g, '$1 ') }, VARSAYILAN_KART);
    expect(normal.kartNo).toBe(VARSAYILAN_KART.kartNo);
    expect(normal.taksit).toEqual({ deger: '1', metin: 'Tek Çekim' });
    expect(krediKartlariAyniMi(normal, VARSAYILAN_KART)).toBe(true);
    expect(krediKartlariAyniMi(normal, { ...VARSAYILAN_KART, guvenlikKodu: '457' })).toBe(false);
    expect(kartiNormallestir(GECERLI_KART, VARSAYILAN_KART)).toMatchObject({ sonKullanmaAyi: { deger: '9', metin: '09' }, taksit: { deger: '3', metin: '3 Taksit' } });
  });

  test('mesaj şablonları benzersiz, kart numarası/CVV hiçbir mesajda yok', () => {
    // Her şablon AYNI örnek argümanlarla çağrılır; iki kural aynı metni üretmemeli.
    // (Record<keyof MESAJLAR> — yeni bir şablon eklenirse burası derlenmez.)
    const liste = ['A', 'B'];
    const ARGUMANLAR: Record<keyof typeof MESAJLAR, unknown[]> = {
      senaryoNesneDegil: [], zorunlu: ['E'], metinOlmali: ['E'], nesneOlmali: ['E'], booleanOlmali: ['E'],
      pozitifTamSayi: ['E'], dosyaUzantisi: ['E', '.x'], secenekDisi: ['E', 'D', liste],
      bagimliSecenekDisi: ['E', 'D', 'B', 'BD', liste], kosulluAlan: ['E', 'K'], kosulluSecenek: ['E', 'D', 'K'],
      gorunmeyenAlan: ['E'], birlikteZorunlu: ['E', 'F'], profilYok: ['E', 'P'], profilVeKimlikBirlikte: ['E'],
      profilYaDaKimlikZorunlu: ['E'], tcBicim: [], tcKontrolHanesi: [], vknBicim: [], telefonBicim: [],
      tarihBicim: ['E', 'B'], tarihGelecekte: ['E'], kartNoBicim: [], cvvBicim: [], kartAyBicim: [], kartYilBicim: [],
      kartSuresiGecmis: ['01/2026'], varsayilanKayitSuresiGecmis: ['E', '01/2026'], eskiBeklenenSonucAlanlari: [liste],
      tabloBasvurusuAlamaz: ['E'], tabloYok: ['E', 'T'], tabloSutunuYok: ['E', 'T', 'S'], gizliSutunSecimde: ['E', 'S'], gizliSutunDosyada: ['E', 'S']
    };
    const metinler = Object.entries(MESAJLAR).map(([ad, sablon]) =>
      (sablon as (...a: unknown[]) => string)(...ARGUMANLAR[ad as keyof typeof MESAJLAR]));
    expect(new Set(metinler).size, metinler.join('\n')).toBe(metinler.length);

    const tumMesajlar = VAKALAR.flatMap((v) => {
      const s = dogrula(v);
      return [...s.hatalar, ...s.uyarilar].map((h) => h.mesaj);
    });
    for (const mesaj of tumMesajlar) {
      for (const hassas of HASSAS_DEGERLER) {
        if (hassas.length >= 3) expect(mesaj, `mesaj hassas değer içeriyor: ${mesaj}`).not.toContain(hassas);
      }
      expect(mesaj).not.toContain(VARSAYILAN_KART.kartNo);
      expect(mesaj.includes(` ${VARSAYILAN_KART.guvenlikKodu} `)).toBe(false);
    }
  });

  test('her hata alanı formda bir kontrole eşleniyor', () => {
    const formIdleri = new Set(modelFormKontrolleri(YUKLENMIS).keys());
    const alanlar = new Set(VAKALAR.flatMap((v) => dogrula(v).hatalar.map((h) => h.alan)).filter((a) => a !== ''));
    expect(alanlar.size).toBeGreaterThan(15);
    const b = baglam();
    const sorunlar: string[] = [];
    for (const a of alanlar) {
      const adaylar = alanFormKimlikleri(a, b);
      if (!adaylar.length) sorunlar.push(`${a}: form kontrolü bulunamadı`);
      for (const id of adaylar) if (!formIdleri.has(id)) sorunlar.push(`${a}: ${id} modelin form karşılıklarında yok`);
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
    expect(alanFormKimlikleri('sahipTuzelKimligi.vergiKimlikNo', b)).toEqual(['f_sahipNo', 'f_sahipVkn']);
    expect(alanFormKimlikleri('sahipProfili', b)).toEqual(['f_sahipKip', 'f_sahipProfil']);
    expect(alanFormKimlikleri('odemeKarti.sonKullanmaYili', b)).toEqual(['f_kart_sonKullanmaYili']);
    expect(alanFormKimlikleri('beklenenSonuc.mesaj', b)).toEqual(['f_beklenenMesaj']);
    expect(alanFormKimlikleri('olmayanAlan', b)).toEqual([]);
  });

  test('örnek sayfa paketinin önerileri hatasız (gerçek tarih)', () => {
    const model = ornekBasvuruModeli() as unknown as DogrulamaBaglami['model'];
    const oneriler = (ornekBasvuruPaketi().senaryoOnerileri as Array<{ veri: Nesne }>);
    expect(oneriler.length).toBeGreaterThan(0);
    const sorunlar: string[] = [];
    for (const o of oneriler) {
      for (const h of senaryoyuDogrula(o.veri, { model, altModeller: {}, simdi: new Date() }).hatalar) sorunlar.push(`"${String(o.veri.baslik)}" > ${h.alan}: ${h.mesaj}`);
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });
});

test.describe('Tek senaryo doğrulayıcısı — bağlam profili ve anahtar adları', () => {
  /** Bağlam profiline göre görünen alan: bilinen durum profil koduyla eşleşir. */
  const baglamModeli = (durum: Nesne): DogrulamaBaglami['model'] => ({
    kosullar: { profileGore: { aciklama: 'profile göre', ifade: { calismaZamani: 'gorunurse' }, bilinenDurumlar: [durum] } },
    adimlar: [],
    senaryoDuzeyi: {
      alanlar: [
        { id: 'baglamProfili', tip: 'secim', yapilandirma: 'senaryo', etiket: { form: 'Profil' }, eslesme: { senaryo: 'profil' } },
        { id: 'gizli', tip: 'metin', yapilandirma: 'senaryo', zorunlu: true, etiket: { form: 'Gizli alan' }, eslesme: { senaryo: 'gizli' }, gorunurluk: { kosul: 'profileGore' } }
      ]
    }
  } as unknown as DogrulamaBaglami['model']);

  test('bağlam profili görünürlüğü: profiller.baglamProfilleri[].kod ile bilinenDurumlar[].profilKodu eşleşir', () => {
    const senaryoVerisi = { profil: 'Merkez' };
    const sonuc = senaryoyuDogrula(senaryoVerisi, {
      model: baglamModeli({ profil: 'Merkez', profilKodu: '100', gorunur: false, kaynak: 'test' }),
      profiller: { baglamProfilleri: { Merkez: { kod: '100' } } }
    });
    expect(sonuc).toEqual({ gecerli: true, hatalar: [], uyarilar: [] });
    // Profil bağlamı yoksa görünürlük bilinmiyor: alan zorunlu kalır.
    const bilinmiyor = senaryoyuDogrula(senaryoVerisi, { model: baglamModeli({ profilKodu: '100', gorunur: false }) });
    expect(bilinmiyor.hatalar).toEqual([{ alan: 'gizli', mesaj: MESAJLAR.zorunlu('Gizli alan') }]);
  });

  test('ekran modeli: baglam ekranı, bağlam koşul ifadesi ve bilinen durumlar yalnızca yeni adlarla geçerli', () => {
    const model = {
      ...ornekBasvuruModeli(),
      kosullar: {
        ...(ornekBasvuruModeli().kosullar as Nesne),
        profilKosulu: {
          ifade: { calismaZamani: 'gorunurse' }, hedefIfade: { baglam: { alanSeti: 'A' } },
          bilinenDurumlar: [{ profil: 'Merkez', profilKodu: '100', gorunur: true, kaynak: 'gözlem' }]
        }
      },
      baglam: { aciklama: 'Bağlam ekranı', veriKaynagi: 'test', alanlar: [], bilinenProfiller: ['Merkez'] }
    } as Nesne;
    const altModelYok = () => { throw new Error('alt model yok'); };
    expect(() => ekranModeliniDogrula('yeni.model.json', model, altModelYok)).not.toThrow();
    // Tanınmayan kök anahtar ve tanınmayan koşul ifadesi reddedilir (önceki sürümlerin adları okunmaz).
    expect(() => ekranModeliniDogrula('kok.model.json', { ...model, baglamOnceki: model.baglam }, altModelYok)).toThrow(/baglamOnceki/);
    const kosullar = { ...(model.kosullar as Nesne), profilKosulu: { ifade: { oncekiBaglam: { alanSeti: 'A' } } } };
    expect(() => ekranModeliniDogrula('ifade.model.json', { ...model, kosullar }, altModelYok)).toThrow(/tanınmayan koşul ifadesi/);
  });

  test('etiketi olmayan alanın mesajında iç anahtar görünmez', () => {
    const model = {
      adimlar: [],
      senaryoDuzeyi: { alanlar: [{ id: 'icAnahtarAdi', tip: 'metin', yapilandirma: 'senaryo', zorunlu: true, eslesme: { senaryo: 'icAnahtarAdi' } }] }
    } as unknown as DogrulamaBaglami['model'];
    const { hatalar } = senaryoyuDogrula({}, { model });
    expect(hatalar).toEqual([{ alan: 'icAnahtarAdi', mesaj: 'Bu alan zorunludur.' }]);
  });
});
