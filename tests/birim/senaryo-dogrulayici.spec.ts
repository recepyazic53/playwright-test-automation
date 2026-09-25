// KORUMA TESTLERİ — tek senaryo doğrulayıcısı (scripts/dogrulama/senaryo-dogrulayici.mjs).
// Tarayıcı AÇMAZ, şirket ortamına BAĞLANMAZ. Çalıştırma: npm run test:birim
// Kontroller:
//  - Her kural için geçerli/geçersiz örnekler (kapsam/alternatif, acenteye göre COVID, TC/VKN,
//    telefon, doğum tarihi, kart alanları + son kullanma ay/yıl, ortak kart uyarısı, profil
//    havuzları, beklenen sonuç, "ikisi birlikte" kuralları, girdi ↔ kayıt farkları).
//  - Mesaj şablonları birbirinden farklı; hiçbir mesaj kart numarası/CVV içermiyor.
//  - Her hata alanı dashboard formunda bir kontrole eşleniyor (modelin form karşılıkları).
//  - Örnek (sahte değerli) veri dosyalarındaki tüm senaryolar hatasız (bkz. ayrıca ekran-modeli.spec.ts > c).
// Model ve ortak veri: tests/birim/fixtures/ornek-eski-dosyalar/ (gerçek veri platform veritabanında).
import { expect, test } from '@playwright/test';
import {
  MESAJLAR,
  TAKSIT_UST_SINIRI,
  alanFormKimlikleri,
  kartSuresiGectiMi,
  kartiNormallestir,
  krediKartlariAyniMi,
  ortakBaglaminiOlustur,
  senaryoyuDogrula,
  tcKimlikNoGecerliMi,
  type DogrulamaBaglami,
  type DogrulamaBulgusu,
  type DogrulamaKarti,
  type DogrulamaSonucu
} from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { ekranModeliniYukle, modelFormKontrolleri, type YuklenmisEkranModeli } from '../support/ekran-modeli';
import type { JetSeyahatTestData, OrtakTestData } from '../support/test-data';
import { ORNEK_MODEL_DOSYASI, ornekVeri } from './platform-ortak';

const ORTAMLAR = ['test', 'canli'] as const;
let modelOnbellegi: YuklenmisEkranModeli | undefined;
const jetSeyahatModeliniYukle = (): YuklenmisEkranModeli => (modelOnbellegi ??= ekranModeliniYukle(ORNEK_MODEL_DOSYASI));
/** Sabit "şimdi": 24.09.2026 (tarih kuralları buna göre). */
const SIMDI = new Date(2026, 8, 24, 12, 0, 0);

function ortakOku(ortam: (typeof ORTAMLAR)[number]): OrtakTestData {
  return ornekVeri<OrtakTestData>(ortam, 'ortak');
}

function baglam(ek: Partial<DogrulamaBaglami> = {}): DogrulamaBaglami {
  const { model, altModeller } = jetSeyahatModeliniYukle();
  return { model, altModeller, ortak: ortakBaglaminiOlustur(ortakOku('test')), ortam: 'test', simdi: SIMDI, kaynak: 'kayit', ...ek };
}

/** Geçerli bir 90002 (COVID görünür) kaydı; vakalar bunun üzerine değişiklik yapar. */
const TEMEL: Readonly<Record<string, unknown>> = Object.freeze({
  baslik: 'Birim testi senaryosu',
  kapsam: 'DÜNYA',
  alternatif: 'VİZE TÜM DÜNYA',
  covidTeminati: 'E',
  sorguTipi: 'tekli',
  ettiren: 'ayni',
  odemeAdimiDahil: true,
  acenteProfili: 'JetSeyahatÖzelTanımlıAcente'
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
const HASSAS_DEGERLER = ['4111111111111111', '4111 1111 1111 1111', '987', '123456789012', '12'];

function senaryo(degisiklik: Record<string, unknown>, silinecekler: string[] = []): Record<string, unknown> {
  const s: Record<string, unknown> = { ...TEMEL, ...degisiklik };
  for (const a of silinecekler) delete s[a];
  return s;
}

type Vaka = {
  ad: string;
  senaryo: Record<string, unknown>;
  baglam?: Partial<DogrulamaBaglami>;
  /** Beklenen HATA: alan + mesaj (tam eşleşme). Boşsa geçerli olmalı. */
  hatalar: DogrulamaBulgusu[];
  uyarilar?: DogrulamaBulgusu[];
};

const kart = (ek: Partial<Record<keyof DogrulamaKarti, unknown>>): Record<string, unknown> => ({ ...GECERLI_KART, ...ek });

const VAKALAR: Vaka[] = [
  { ad: 'geçerli temel kayıt', senaryo: senaryo({}), hatalar: [] },
  // Kapsam / alternatif (modelin seçenekleri, alternatif kapsama bağlı)
  { ad: 'kapsam listede değil', senaryo: senaryo({ kapsam: 'ASYA' }), hatalar: [{ alan: 'kapsam', mesaj: MESAJLAR.secenekDisi('Kapsam', 'ASYA', ['DÜNYA', 'AVRUPA']) }] },
  {
    ad: 'alternatif kapsama uymuyor',
    senaryo: senaryo({ alternatif: 'VİZE SCHENGEN' }),
    hatalar: [{ alan: 'alternatif', mesaj: MESAJLAR.bagimliSecenekDisi('Alternatif', 'VİZE SCHENGEN', 'Kapsam', 'DÜNYA', ['VİZE TÜM DÜNYA', 'SEYAHAT PAKET']) }]
  },
  { ad: 'AVRUPA + VİZE SCHENGEN geçerli', senaryo: senaryo({ kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN' }), hatalar: [] },
  { ad: 'sorguTipi listede değil', senaryo: senaryo({ sorguTipi: 'toplu' }), hatalar: [{ alan: 'sorguTipi', mesaj: MESAJLAR.secenekDisi('Sorgu Tipi', 'toplu', ['tekli', 'coklu']) }] },
  // COVID: yalnızca acentede görünürse (ya da bilinmiyorsa) zorunlu
  { ad: 'COVID eksik, 90002 (görünür) → hata', senaryo: senaryo({}, ['covidTeminati']), hatalar: [{ alan: 'covidTeminati', mesaj: MESAJLAR.zorunlu('COVID Teminatı') }] },
  { ad: 'COVID eksik, varsayılan acente 90001 (gizli) → geçerli', senaryo: senaryo({}, ['covidTeminati', 'acenteProfili']), hatalar: [] },
  {
    ad: 'COVID verilmiş, 90001 → uyarı (değer kullanılmaz)',
    senaryo: senaryo({}, ['acenteProfili']),
    hatalar: [],
    uyarilar: [{ alan: 'covidTeminati', mesaj: MESAJLAR.gorunmeyenAlan('COVID Teminatı') }]
  },
  { ad: 'COVID eksik, girdide acenteKodu 90001 → geçerli', senaryo: senaryo({ acenteKodu: '90001', acenteKullanicisi: '90000001' }, ['covidTeminati', 'acenteProfili']), baglam: { kaynak: 'girdi' }, hatalar: [] },
  {
    ad: 'COVID eksik, bilinmeyen acente → zorunlu kalır',
    senaryo: senaryo({ acenteKodu: '99999', acenteKullanicisi: '1' }, ['covidTeminati', 'acenteProfili']),
    baglam: { kaynak: 'girdi' },
    hatalar: [{ alan: 'covidTeminati', mesaj: MESAJLAR.zorunlu('COVID Teminatı') }]
  },
  { ad: 'COVID geçersiz değer', senaryo: senaryo({ covidTeminati: 'X' }), hatalar: [{ alan: 'covidTeminati', mesaj: MESAJLAR.secenekDisi('COVID Teminatı', 'X', ['E', 'H']) }] },
  // Serbest kimlik: TC (11 hane + kontrol haneleri), telefon, doğum tarihi
  {
    ad: 'serbest sigortalı geçerli',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '24.09.2026', cepTelefonu: '5550000001' } }),
    hatalar: []
  },
  {
    ad: 'TC kontrol hanesi yanlış',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '10000000147', dogumTarihi: '01.02.1985', cepTelefonu: '5550000001' } }),
    hatalar: [{ alan: 'sigortaliKimligi.tcKimlikNo', mesaj: MESAJLAR.tcKontrolHanesi() }]
  },
  {
    ad: 'TC 0 ile başlıyor / 10 hane',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '0100000001', dogumTarihi: '01.02.1985', cepTelefonu: '5550000001' } }),
    hatalar: [{ alan: 'sigortaliKimligi.tcKimlikNo', mesaj: MESAJLAR.tcBicim() }]
  },
  {
    ad: 'telefon başında 0',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1985', cepTelefonu: '05550000001' } }),
    hatalar: [{ alan: 'sigortaliKimligi.cepTelefonu', mesaj: MESAJLAR.telefonBicim() }]
  },
  {
    ad: 'doğum tarihi gelecekte (yarın)',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '25.09.2026', cepTelefonu: '5550000001' } }),
    hatalar: [{ alan: 'sigortaliKimligi.dogumTarihi', mesaj: MESAJLAR.tarihGelecekte('Doğum Tarihi') }]
  },
  {
    ad: 'doğum tarihi takvimde yok / yanlış biçim',
    senaryo: senaryo({
      ettiren: 'farkliOzel',
      ettirenOzelKimligi: { tcKimlikNo: '10000000214', dogumTarihi: '31.02.2000', cepTelefonu: '5550000002' },
      sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '1985-02-01', cepTelefonu: '5550000001' }
    }),
    hatalar: [
      { alan: 'sigortaliKimligi.dogumTarihi', mesaj: MESAJLAR.tarihBicim('Doğum Tarihi', 'gg.aa.yyyy') },
      { alan: 'ettirenOzelKimligi.dogumTarihi', mesaj: MESAJLAR.tarihBicim('Doğum Tarihi', 'gg.aa.yyyy') }
    ]
  },
  {
    ad: 'serbest kimlikte alan eksik',
    senaryo: senaryo({ sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '', cepTelefonu: '5550000001' } }),
    hatalar: [{ alan: 'sigortaliKimligi.dogumTarihi', mesaj: MESAJLAR.zorunlu('Doğum Tarihi') }]
  },
  {
    ad: 'tüzel ettiren: VKN 10 hane, doğum tarihi istenmez',
    senaryo: senaryo({ ettiren: 'farkliTuzel', ettirenTuzelKimligi: { vergiKimlikNo: '123', cepTelefonu: '5550000005' } }),
    hatalar: [{ alan: 'ettirenTuzelKimligi.vergiKimlikNo', mesaj: MESAJLAR.vknBicim() }]
  },
  { ad: 'tüzel ettiren geçerli', senaryo: senaryo({ ettiren: 'farkliTuzel', ettirenTuzelKimligi: { vergiKimlikNo: '1000000001', cepTelefonu: '5550000005' } }), hatalar: [] },
  // Profiller (modeldeki profilHavuzu)
  {
    ad: 'farklı ettiren, profil de kimlik de yok',
    senaryo: senaryo({ ettiren: 'farkliOzel' }),
    hatalar: [{ alan: 'ettirenProfili', mesaj: MESAJLAR.profilYaDaKimlikZorunlu('Sigorta ettiren kimliği') }]
  },
  {
    ad: 'ettiren profili havuzda yok (tüzel havuzunda özel anahtar)',
    senaryo: senaryo({ ettiren: 'farkliTuzel', ettirenProfili: 'tc1' }),
    hatalar: [{ alan: 'ettirenProfili', mesaj: MESAJLAR.profilYok('Sigorta ettiren kimliği', 'tc1') }]
  },
  {
    ad: 'sigortalı profil + kimlik birlikte',
    senaryo: senaryo({ sigortaliProfili: 'tc2', sigortaliKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1985', cepTelefonu: '5550000001' } }),
    hatalar: [{ alan: 'sigortaliProfili', mesaj: MESAJLAR.profilVeKimlikBirlikte('Sigortalı') }]
  },
  { ad: 'acente profili ortak veride yok', senaryo: senaryo({ acenteProfili: 'YokBoyleAcente' }), hatalar: [{ alan: 'acenteProfili', mesaj: MESAJLAR.profilYok('Acente Kodu', 'YokBoyleAcente') }] },
  {
    ad: 'girdide acente kodu var, kullanıcı yok',
    senaryo: senaryo({ acenteKodu: '90002' }, ['acenteProfili']),
    baglam: { kaynak: 'girdi' },
    hatalar: [{ alan: 'acenteKullanicisi', mesaj: MESAJLAR.birlikteZorunlu('Acente Kodu', 'Acente Kullanıcı Kodu') }]
  },
  // Başlık: kayıtta zorunlu, girdide sonradan verilebilir
  { ad: 'kayıtta başlık yok', senaryo: senaryo({}, ['baslik']), hatalar: [{ alan: 'baslik', mesaj: MESAJLAR.zorunlu('Senaryo Başlığı') }] },
  { ad: 'girdide başlık yok (Dene)', senaryo: senaryo({}, ['baslik']), baglam: { kaynak: 'girdi' }, hatalar: [] },
  { ad: 'girdide başlık boş (Düzenle)', senaryo: senaryo({ baslik: '  ' }), baglam: { kaynak: 'girdi' }, hatalar: [{ alan: 'baslik', mesaj: MESAJLAR.zorunlu('Senaryo Başlığı') }] },
  // Çoklu sorgu dosyası ↔ kişi sayısı
  {
    ad: 'çoklu dosya var, kişi sayısı yok',
    senaryo: senaryo({ sorguTipi: 'coklu', cokluSorguDosyasi: 'tests/fixtures/jet-seyahat/yuklenen/a.xlsx' }),
    hatalar: [{ alan: 'cokluSorguKisiSayisi', mesaj: MESAJLAR.birlikteZorunlu('Özel Excel Yükle', 'Kişi Sayısı') }]
  },
  {
    ad: 'çoklu dosya uzantısı yanlış, kişi sayısı 0',
    senaryo: senaryo({ sorguTipi: 'coklu', cokluSorguDosyasi: 'a.xls', cokluSorguKisiSayisi: 0 }),
    hatalar: [
      { alan: 'cokluSorguDosyasi', mesaj: MESAJLAR.dosyaUzantisi('Özel Excel Yükle', '.xlsx') },
      { alan: 'cokluSorguKisiSayisi', mesaj: MESAJLAR.pozitifTamSayi('Kişi Sayısı') }
    ]
  },
  // Beklenen sonuç (modelin varyantları + adım seçeneği koşulu)
  { ad: 'odemeAdimiDahil eksik', senaryo: senaryo({}, ['odemeAdimiDahil']), hatalar: [{ alan: 'odemeAdimiDahil', mesaj: MESAJLAR.zorunlu('Ödeme adımını dahil et') }] },
  {
    ad: 'poliçeleştirmede hata, ödeme dahil değil',
    senaryo: senaryo({ odemeAdimiDahil: false, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'policelestirme', mesaj: 'x' } }),
    hatalar: [{ alan: 'beklenenSonuc.adim', mesaj: MESAJLAR.kosulluSecenek('Hatanın Beklendiği Adım', 'Poliçeleştirme', 'ödeme adımı dahil (odemeAdimiDahil: true)') }]
  },
  {
    ad: 'iş kuralı hatası, mesaj boş',
    senaryo: senaryo({ beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'primHesaplama', mesaj: '  ' } }),
    hatalar: [{ alan: 'beklenenSonuc.mesaj', mesaj: MESAJLAR.zorunlu('Beklenen Mesaj') }]
  },
  {
    ad: 'eski beklenenHataMesaji alanı',
    senaryo: senaryo({ beklenenHataMesaji: 'm' }),
    hatalar: [{ alan: 'beklenenSonuc', mesaj: MESAJLAR.eskiBeklenenSonucAlanlari(['beklenenHataMesaji']) }]
  },
  // Kart: tek kural kümesi, son kullanma AY + YIL
  { ad: 'senaryo kartı geçerli (bu ay)', senaryo: senaryo({ krediKarti: kart({}) }), hatalar: [] },
  {
    ad: 'senaryo kartının süresi geçmiş (geçen ay)',
    senaryo: senaryo({ krediKarti: kart({ sonKullanmaAyi: { deger: '8', metin: '08' } }) }),
    hatalar: [{ alan: 'krediKarti.sonKullanmaYili', mesaj: MESAJLAR.kartSuresiGecmis('08/2026') }]
  },
  {
    ad: 'kart alanları biçim dışı',
    senaryo: senaryo({
      krediKarti: kart({ isim: ' ', kartNo: '123456789012', guvenlikKodu: '12', sonKullanmaAyi: { deger: '13' }, sonKullanmaYili: { deger: '26' }, taksit: { deger: String(TAKSIT_UST_SINIRI + 1) } })
    }),
    hatalar: [
      { alan: 'krediKarti.isim', mesaj: MESAJLAR.zorunlu('Kart üzerindeki ad') },
      { alan: 'krediKarti.kartNo', mesaj: MESAJLAR.kartNoBicim() },
      { alan: 'krediKarti.guvenlikKodu', mesaj: MESAJLAR.cvvBicim() },
      { alan: 'krediKarti.sonKullanmaAyi', mesaj: MESAJLAR.kartAyBicim() },
      { alan: 'krediKarti.sonKullanmaYili', mesaj: MESAJLAR.kartYilBicim() },
      { alan: 'krediKarti.taksit', mesaj: MESAJLAR.kartTaksitBicim(TAKSIT_UST_SINIRI) }
    ]
  },
  {
    ad: 'ödeme dahil değilken kart',
    senaryo: senaryo({ odemeAdimiDahil: false, krediKarti: kart({}) }),
    hatalar: [{ alan: 'krediKarti', mesaj: MESAJLAR.kosulluAlan('Ödeme kartı', 'ödeme adımı dahil (odemeAdimiDahil: true)') }]
  },
  {
    ad: 'ortak kartın süresi geçmiş → yalnızca uyarı',
    senaryo: senaryo({}),
    baglam: { ortak: { ...ortakBaglaminiOlustur(ortakOku('test')), varsayilanKrediKarti: { ...GECERLI_KART, sonKullanmaAyi: { deger: '1' }, sonKullanmaYili: { deger: '2026' } } } },
    hatalar: [],
    uyarilar: [{ alan: 'krediKarti', mesaj: MESAJLAR.ortakKartSuresiGecmis('01/2026') }]
  },
  { ad: 'senaryo nesne değil', senaryo: null as unknown as Record<string, unknown>, hatalar: [{ alan: '', mesaj: MESAJLAR.senaryoNesneDegil() }] }
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
      // (Test ortamının ortak kartı 01/2026 — SIMDI'de süresi geçmiş; o uyarı her ödemeli vakada da bulunur.)
      if (vaka.uyarilar) expect(sonuc.uyarilar).toEqual(expect.arrayContaining(vaka.uyarilar));
    });
  }

  test('kayıt ile aynı değerler girdide de aynı sonucu verir (spec ↔ sunucu/form)', () => {
    for (const vaka of VAKALAR.filter((v) => !v.baglam?.kaynak && v.senaryo && 'baslik' in v.senaryo)) {
      expect(senaryoyuDogrula(vaka.senaryo, baglam({ ...vaka.baglam, kaynak: 'girdi' })).hatalar, vaka.ad).toEqual(vaka.hatalar);
    }
  });
});

test.describe('Tek senaryo doğrulayıcısı — yardımcılar ve koruma', () => {
  test('TC kontrol hanesi algoritması; ortak profillerin TC, telefon ve doğum tarihleri kurallara uyuyor', () => {
    expect(tcKimlikNoGecerliMi('10000000146')).toBe(true);
    expect(tcKimlikNoGecerliMi('10000000147')).toBe(false);
    expect(tcKimlikNoGecerliMi('00000000000')).toBe(false);
    // Kurallar mevcut verinin TAMAMINI kabul etmeli (telefon kuralı buradan seçildi).
    const sorunlar: string[] = [];
    for (const ortam of ORTAMLAR) {
      const ortak = ortakOku(ortam);
      for (const [anahtar, kimlik] of Object.entries(ortak.kimlikBilgileri.ozel)) {
        const s = senaryo({ sigortaliKimligi: kimlik });
        for (const h of senaryoyuDogrula(s, baglam()).hatalar) sorunlar.push(`${ortam} ozel.${anahtar} > ${h.alan}: ${h.mesaj}`);
      }
      for (const [anahtar, kimlik] of Object.entries(ortak.kimlikBilgileri.tuzel)) {
        const s = senaryo({ ettiren: 'farkliTuzel', ettirenTuzelKimligi: kimlik });
        for (const h of senaryoyuDogrula(s, baglam()).hatalar) sorunlar.push(`${ortam} tuzel.${anahtar} > ${h.alan}: ${h.mesaj}`);
      }
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });

  test('kart son kullanma: ay duyarlı; normalleştirme ve karşılaştırma', () => {
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '9' }, sonKullanmaYili: { deger: '2026' } }, SIMDI)).toBe(false);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '8' }, sonKullanmaYili: { deger: '2026' } }, SIMDI)).toBe(true);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: '1' }, sonKullanmaYili: { deger: '2027' } }, SIMDI)).toBe(false);
    expect(kartSuresiGectiMi({ sonKullanmaAyi: { deger: 'x' }, sonKullanmaYili: { deger: '2027' } }, SIMDI)).toBeNull();
    const ortakKart = ortakOku('test').odeme.krediKarti;
    const normal = kartiNormallestir({ ...ortakKart, kartNo: ortakKart.kartNo.replace(/(\d{4})/g, '$1 ') }, ortakKart);
    expect(normal.kartNo).toBe(ortakKart.kartNo);
    expect(normal.taksit).toEqual({ deger: '1', metin: 'Tek Çekim' });
    expect(krediKartlariAyniMi(normal, ortakKart)).toBe(true);
    expect(kartiNormallestir(GECERLI_KART, ortakKart).sonKullanmaAyi).toEqual({ deger: '9', metin: '09' });
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
      kartTaksitBicim: [12], kartSuresiGecmis: ['01/2026'], ortakKartSuresiGecmis: ['01/2026'], eskiBeklenenSonucAlanlari: [liste]
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
    }
    // Ortak kartın numarası/CVV'si de sızmamalı.
    const ortakKart = ortakOku('test').odeme.krediKarti;
    for (const mesaj of tumMesajlar) {
      expect(mesaj).not.toContain(ortakKart.kartNo);
      expect(mesaj.includes(` ${ortakKart.guvenlikKodu} `)).toBe(false);
    }
  });

  test('her hata alanı dashboard formunda bir kontrole eşleniyor', () => {
    const yuklenmis = jetSeyahatModeliniYukle();
    const formIdleri = new Set(modelFormKontrolleri(yuklenmis).keys());
    const alanlar = new Set(VAKALAR.flatMap((v) => dogrula(v).hatalar.map((h) => h.alan)).filter((a) => a !== ''));
    expect(alanlar.size).toBeGreaterThan(15);
    const sorunlar: string[] = [];
    for (const alan of alanlar) {
      const adaylar = alanFormKimlikleri(alan, yuklenmis);
      if (!adaylar.length) sorunlar.push(`${alan}: form kontrolü bulunamadı`);
      for (const id of adaylar) if (!formIdleri.has(id)) sorunlar.push(`${alan}: ${id} modelin form karşılıklarında yok`);
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
    expect(alanFormKimlikleri('ettirenTuzelKimligi.vergiKimlikNo', yuklenmis)).toEqual(['sof_ettirenTc', 'sof_ettirenVkn']);
    expect(alanFormKimlikleri('krediKarti.sonKullanmaYili', yuklenmis)).toEqual(['sof_kartYil']);
    expect(alanFormKimlikleri('acenteKullanicisi', yuklenmis)).toEqual(['sof_acenteKullanicisi']);
    expect(alanFormKimlikleri('beklenenSonuc.mesaj', yuklenmis)).toEqual(['sof_beklenenHata']);
  });

  test('örnek veri dosyalarındaki tüm senaryolar hatasız (gerçek tarih; ortak kart uyarısı serbest)', () => {
    const { model, altModeller } = jetSeyahatModeliniYukle();
    const sorunlar: string[] = [];
    for (const ortam of ORTAMLAR) {
      const urun = ornekVeri<JetSeyahatTestData>(ortam, 'jet-seyahat').jetSeyahat;
      const ortak = ortakBaglaminiOlustur(ortakOku(ortam));
      for (const s of urun.senaryolar) {
        const sonuc = senaryoyuDogrula(s, { model, altModeller, ortak, ortam, simdi: new Date() });
        for (const h of sonuc.hatalar) sorunlar.push(`${ortam} > "${s.baslik}" > ${h.alan}: ${h.mesaj}`);
      }
    }
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });
});
