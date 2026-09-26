// JETKASKO (AKIŞ) — koddaki JetKasko "YK" (yeni kayıt / tescilsiz araç) akışının (tests/scenarios/jet-kasko/yeni-kayit.spec.ts +
// tests/support/pages/jet-kasko.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetKasko" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetKasko (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): sigortalı (özel / tüzel; kimlik profili: kimlik no → doğum tarihi → cep
// telefonu), plaka (il kodu + "YK") ve sigortalı sorgusu (#QueryVehicle → araç bilgileri açılır), sigorta ettiren (kendisi /
// farklı özel / farklı tüzel; kimlik profili + sorgu), yeni araç bilgileri (model yılı, marka kodu sorgusu, motor / şasi no,
// tescil tarihi = bugün, araç tipi → sınıf / kullanım), isteğe bağlı yetkili indirimi, prim hesaplama (ürünler kademeli gelir:
// 15 sn bekleme), ürün seçimi (KaskoTur radyoları GÖRÜNEN ADIYLA) ve isteğe bağlı "Ödeme (kredi kartı)" ortak akışı (kodlu
// testte her senaryo öder; JetKasko ödemeye #Policelestir ile geçer → mevcut ortak akış olduğu gibi kullanılır).
// Seçiciler ve sıra POM'dan. Açılır listelerin seçenekleri kodda yok (değerler şifreli test verisinde): "bilinmiyor" — 2.
// aşamada TEST ekranından okunacak.
// Çıktı: node scripts/jetkasko-akis-paketi.mjs → "Claude outputs/jetkasko-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { ODEME_AKIS_ANAHTARI } from './odeme-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETKASKO_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', acente: 'ortak.kullaniciDegistir'
});

/** KaskoTur ürünleri (POM: JETKASKO_URUN_KODLARI). Radyonun "value"su senaryoya göre değiştiği için ADIYLA seçilir. */
export const JETKASKO_URUNLERI = Object.freeze({
  1: 'GENİŞLETİLMİŞ KASKO(İKAME+YOL YARD.)',
  2: 'MAVİ KASKO(Dar)',
  3: 'GÜLÜMSETEN KASKO(YOL YARD.)',
  4: 'GENİŞLETİLMİŞ KASKO(YOL YARD.)',
  5: 'GÜLÜMSETEN KASKO(İKAME+YOL YARD.)'
});

/** Galaksi hata penceresi (POM hataPopupVarsaDurdur: "Tamam" bağlantılı fancybox / jQuery UI penceresi). */
const HATA_PENCERESI = '#fancybox-wrap:has(a:text-is("Tamam")), .ui-dialog:has(a:text-is("Tamam"))';

const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/** Seçenekleri henüz bilinmeyen açılır liste (senaryodaki değer önce "value", olmazsa görünen metinle seçilir). */
const liste = (id, etiket, secici, ek = {}) => alan(id, 'secim', etiket, secici, { zorunlu: true, secenekler: null, seceneklerDurumu: 'bilinmiyor', ...ek });
/** Gizli çizimli olabilen radyo (POM: .check({ force: true })). */
const radyo = (id, etiket, secenekler, ek = {}) => alan(id, 'radyo', etiket, secenekler[0].secici, {
  etiket: { ekran: null, form: etiket }, zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam', secenekler, ...ek
});
const ozelTuzel = (onEk) => [
  secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: `#${onEk}-O` }),
  secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: `#${onEk}-T` })
];
/** Maskeli telefon (POM maskliTelefonGir: tuş tuş yazılır, Tab ile çıkılır). */
const telefonAlani = (id, sira, secici) => ({
  id, tip: 'telefon', sira, etiket: { ekran: 'Cep telefonu' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici, kirilganlik: 'orta' },
  doldurucu: 'tuslayarakYaz', doldurucuParametreleri: { tus: 'Tab' }
});
/** Maskeli tarih (POM maskliTarihGir): betikle yazılır (maske tuş vuruşlarında karakter kaydırıyordu). */
const dogumTarihiAlani = (id, sira, secici) => ({
  id, tip: 'tarih', bicim: 'gg.aa.yyyy', sira, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi' } },
  konum: { secici, kirilganlik: 'orta' }, doldurucu: 'tarihJs'
});

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: ürün seçildikten sonra "Ödeme (kredi kartı)" ortak akışı (projede önce o yüklenmeli); senaryoda "“Ödeme” dahil"
 *   (kodlu testte her senaryo öder). girissiz: yalnızca yerel testlerde.
 */
export function jetKaskoAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETKASKO_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-kasko-akis', ad: 'JetKasko (akış)',
    aciklama: 'JetKasko yeni kayıt (YK, tescilsiz araç) akışı (koddaki testten; model koşucusuyla koşar): sigortalı ve plaka, sigorta ettiren, yeni araç bilgileri, prim hesaplama, ürün seçimi'
      + (s.odeme ? ' ve "Ödeme (kredi kartı)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir.'),
    ekranUrl: '/jet-satis/jet-kasko/',
    specDosyasi: 'tests/scenarios/jet-kasko-akis/jet-kasko-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-kasko-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: {
      ettirenFarkli: { aciklama: 'Sigorta ettiren sigortalıdan farklı (farklı özel / farklı tüzel)', ifade: { alan: 'sigortaEttiren', esit: 'farkli' } },
      ...(s.odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testte her senaryoda).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
    },
    adimlar: [
      {
        id: 'sigortali', sira: 1, baslik: 'Sigortalı ve plaka bilgileri girilir, sorgulanır',
        bolumler: [
          {
            id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
              radyo('sigortaliTipi', 'Sigortalı tipi', ozelTuzel('InsuredType')),
              {
                id: 'sigortaliKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: 'sigortaliTipi' },
                etiket: { ekran: null, form: 'Sigortalı kimliği' }, zorunlu: true, yapilandirma: 'senaryo',
                eslesme: { senaryo: ['sigortaliOzelKimligi', 'sigortaliTuzelKimligi', 'sigortaliProfili'], profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel } },
                // POM sırası: kimlik no → (özelde) doğum tarihi → cep telefonu. Tüzelde doğum tarihi alanı yok (alt alan atlanır).
                altAlanlar: [
                  {
                    id: 'sigortaliKimlikNo', tip: 'metin', sira: 1, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
                    konum: { secici: '#IdentityNo', kirilganlik: 'orta' }
                  },
                  dogumTarihiAlani('sigortaliDogumTarihi', 2, '#BirthDate'),
                  telefonAlani('sigortaliTelefon', 3, '#PhoneNumber')
                ]
              }
            ]
          },
          {
            id: 'plaka', baslik: 'Plaka', alanlar: [
              alan('plakaIlKodu', 'metin', 'Plaka il kodu', '#PlateCity', { zorunlu: true, doldurucuParametreleri: { tus: 'Tab' } }),
              // "YK" yazılınca ekran tescilsiz / yeni araç kipine geçer (sitenin isPlateYK()).
              alan('plakaNo', 'metin', 'Plaka no ("YK")', '#PlateNo', { zorunlu: true, varsayilan: { deger: 'YK' }, doldurucuParametreleri: { tus: 'Tab' } })
            ]
          },
          {
            id: 'sigortaliIslemleri', baslik: 'İşlemler', alanlar: [
              { id: 'sorgulaDugmesi', tip: 'buton', etiket: { ekran: 'Sorgula' }, yapilandirma: 'aksiyon', konum: { secici: '#QueryVehicle', kirilganlik: 'orta' } }
            ]
          }
        ],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#QueryVehicle', aciklama: 'Sorgula' }],
          // POM: #ModelYear görünür (araç bilgileri açıldı), hata penceresi çıkarsa senaryo o anda durur.
          basariGostergesi: { tur: 'eleman', deger: '#ModelYear' },
          hataGostergesi: { secici: HATA_PENCERESI },
          zamanAsimiSn: 20
        }
      },
      {
        id: 'ettirenArac', sira: 2, baslik: 'Sigorta ettiren ve araç bilgileri girilir',
        bolumler: [
          {
            id: 'sigortaEttirenBolumu', baslik: 'Sigorta ettiren', alanlar: [
              radyo('sigortaEttiren', 'Sigorta ettiren', [
                secim('H', 'Sigortalı (kendisi)', { senaryoDegeri: 'ayni', formMetni: 'Sigortalı (kendisi)', secici: '#DifferentClient-H' }),
                secim('E', 'Farklı kişi / kurum', { senaryoDegeri: 'farkli', formMetni: 'Farklı kişi / kurum', secici: '#DifferentClient-E' })
              ], { varsayilan: { deger: 'ayni' } }),
              radyo('sigortaEttirenTipi', 'Sigorta ettiren tipi', ozelTuzel('ClientType'), { gorunurluk: { kosul: 'ettirenFarkli' } }),
              {
                id: 'sigortaEttirenKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: 'sigortaEttirenTipi' },
                etiket: { ekran: null, form: 'Sigorta ettiren kimliği' }, zorunlu: true, yapilandirma: 'senaryo', gorunurluk: { kosul: 'ettirenFarkli' },
                eslesme: { senaryo: ['sigortaEttirenOzelKimligi', 'sigortaEttirenTuzelKimligi', 'sigortaEttirenProfili'], profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel } },
                // POM sırası: (özelde) doğum tarihi → telefon → kimlik no + sorgu; ad / unvan gelene kadar beklenir (20 sn).
                altAlanlar: [
                  dogumTarihiAlani('sigortaEttirenDogumTarihi', 1, '#ClientBirthDate'),
                  telefonAlani('sigortaEttirenTelefon', 2, '#ClientPhoneNumber'),
                  {
                    id: 'sigortaEttirenKimlikNo', tip: 'metin', sira: 3, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
                    konum: { secici: '#ClientIdentityNo', kirilganlik: 'orta' },
                    doldurucuParametreleri: { tikla: '#RefreshClientIdentity', bekle: { secici: '#client-identity-name', durum: 'dolu', zamanAsimiSn: 20 } }
                  }
                ]
              }
            ]
          },
          {
            id: 'arac', baslik: 'Yeni araç bilgileri', alanlar: [
              // Marka listesinin yüklenmesi için alan gerçekten bırakılmalı (POM: Tab).
              alan('modelYili', 'sayi', 'Model yılı', '#ModelYear', { zorunlu: true, doldurucuParametreleri: { tus: 'Tab' } }),
              // Marka kodu sorgusu marka / modeli kendiliğinden seçer (POM: #VehicleModel değeri marka koduna eşit olur, 20 sn).
              alan('markaKodu', 'metin', 'Marka kodu', '#VehicleModelCode', {
                zorunlu: true, doldurucuParametreleri: { tikla: '#QueryVehicleModelCode', bekle: { secici: '#VehicleModel', durum: 'dolu', zamanAsimiSn: 20 } }
              }),
              alan('motorNo', 'metin', 'Motor no', '#EngineNo', { zorunlu: true }),
              alan('sasiNo', 'metin', 'Şasi no', '#ChassisNo', { zorunlu: true }),
              // Tescil tarihi: senaryonun koşulduğu gün (POM bugununTarihi, İstanbul saati).
              { ...alan('tescilTarihi', 'tarih', 'Tescil tarihi', '#RegistrationDate', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {} },
              // Araç tipi seçilince sınıf listesi yeniden yüklenir (koşucu alanın başlattığı isteği bekler).
              liste('aracTipi', 'Araç tipi', '#VehicleType'),
              liste('sinif', 'Sınıf (tarife)', '#TariffClass'),
              liste('kullanim', 'Kullanım şekli', '#UsageType'),
              // Kodda değer acente profilinden (kullaniciDegistir > yetkiliIndirimi) gelir ve alan kapalıysa atlanır; burada
              // isteğe bağlı senaryo alanı (bkz. bilinmeyenler).
              alan('yetkiliIndirimi', 'sayi', 'Yetkili indirimi %', '#AuthorizedDiscount', { zorunlu: false })
            ]
          }
        ],
        // Adımda düğme yok; sigorta ettiren / marka kodu sorgusundan sonra hata penceresi açık kaldıysa adım burada düşer.
        kosu: { aksiyonlar: [], hataGostergesi: { secici: HATA_PENCERESI }, zamanAsimiSn: 5 }
      },
      {
        id: 'primHesaplama', sira: 3, baslik: 'Prim hesaplanır',
        bolumler: [{
          id: 'islemler', baslik: 'İşlemler', alanlar: [
            { id: 'primHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#Hesapla', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          // Teklifler kademeli gelir (POM: ilk ürünün ardından sabit 15 sn); koşucuda bekleme tıklamadan itibaren sayılır.
          aksiyonlar: [{ tur: 'tikla', secici: '#Hesapla', aciklama: 'Hesapla' }, { tur: 'bekle', sureSn: 15 }],
          basariGostergesi: { tur: 'eleman', deger: 'input[name="KaskoTur"]' },
          hataGostergesi: { secici: HATA_PENCERESI },
          zamanAsimiSn: 30
        }
      },
      {
        id: 'urunSecimi', sira: 4, baslik: 'Ürün seçilir',
        bolumler: [{
          id: 'urun', baslik: 'Ürün', alanlar: [
            radyo('urun', 'Ürün (KaskoTur)', Object.entries(JETKASKO_URUNLERI).map(([kod, ad]) =>
              // Seçici erişilebilir ada göre (değer senaryodan senaryoya değişir); senaryoda kısa kod (1–5) saklanır.
              secim(kod, ad, { formMetni: `${kod} — ${ad}`, secici: `internal:role=radio[name="${ad}"s]` })), {
              konum: { secici: 'input[name="KaskoTur"]', kirilganlik: 'orta' }, zorunlu: false, varsayilan: { deger: '4' }
            })
          ]
        }]
      },
      ...(s.odeme ? [{ id: 'odeme', sira: 5, baslik: 'Ödeme', gorunurluk: { kosul: 'odemeDahil' }, ortakAkis: { dosya: `${ODEME_AKIS_ANAHTARI}.model.json` } }] : [])
    ],
    senaryoDuzeyi: {
      alanlar: [
        ...(s.odeme ? [{ id: 'odemeAdimiDahil', tip: 'onayKutusu', etiket: { ekran: null, form: '“Ödeme” dahil' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'odemeAdimiDahil' } }] : []),
        { id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
        {
          id: 'acenteProfili', tip: 'secim', etiket: { ekran: null, form: 'Acente' }, zorunlu: false, yapilandirma: 'senaryo',
          eslesme: { senaryo: 'acenteProfili', profilHavuzu: h.acente }, varsayilan: { deger: 'varsayilan' }
        },
        {
          id: 'beklenenSonuc', tip: 'birlesim', etiket: { ekran: null, form: 'Beklenen sonuç' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
          varyantlar: [
            { tip: 'basarili', anlam: 'Prim hesaplanır, ürün seçilir (ödeme dahilse ödeme sonucu kabul edilir).' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda, belirtilen mesajı içeren hata penceresi beklenir.',
              alanlar: {
                adim: {
                  etiket: 'Hatanın beklendiği adım', secenekler: [
                    { deger: 'sigortali', metin: 'Sigortalı sorgusu' }, { deger: 'ettirenArac', metin: 'Sigorta ettiren ve araç bilgileri' },
                    { deger: 'primHesaplama', metin: 'Prim hesaplama' }
                  ]
                },
                mesaj: { etiket: 'Beklenen mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    },
    urunDuzeyi: {},
    isKurallari: [],
    bilinmeyenler: [
      ...(s.odeme ? [] : ['Ödeme (poliçeleştirme + kredi kartı) bu pakette yok; "Ödeme (kredi kartı)" ortak akışı akışa eklenebilir.']),
      'Açılır listelerin (araç tipi, sınıf, kullanım şekli) seçenekleri kodda yok (jet-kasko-yk.json şifreli); TEST ekranından okunacak. Senaryodaki değer önce "value", olmazsa görünen metinle seçilir.',
      'Araç bilgileri (plaka, model yılı, marka kodu, motor / şasi no, araç tipi, sınıf, kullanım) kodda senaryolar arası ortak "araclar" sözlüğünden (ozelOtomobil / kamyon) gelir; aktarımda araç profil havuzu olmadığı için burada her senaryoda ayrı senaryo alanlarıdır.',
      'Yetkili indirimi: kodda değer senaryonun ACENTE profilinden (kullaniciDegistir > yetkiliIndirimi) okunur ve alan kapalıysa (disabled) atlanır. Koşucu bağlam profilinden alan dolduramadığı ve kapalı alanı atlamadığı için burada isteğe bağlı senaryo alanıdır: yalnızca alanın açık olduğu acenteyle doldurulmalı (kapalı alana yazmaya çalışınca adım düşer).',
      'Prim: POM ilk ürün radyosu görünüp yükleme perdesi (blockUI) kalktıktan SONRA 15 sn bekler; koşucuda 15 sn "Hesapla"ya basıldıktan itibaren sayılır, ardından ürün radyosu (en çok 30 sn) beklenir. İlk ürün geç gelirse (>15 sn) diğer teklifler henüz yüklenmemiş olabilir. Perde kalkması ayrıca beklenmez.',
      'Ürün radyoları erişilebilir adlarıyla (tam eşleşme) seçilir; ad TEST ekranında birebir doğrulanmalı. Senaryoda kısa kod (1–5) saklanır (kodlu veri tam ad da kabul ediyordu; senaryo doğrulayıcısı yalnızca kodu kabul eder); boşsa "4" (GENİŞLETİLMİŞ KASKO(YOL YARD.)).',
      'Maskeli alanlar: doğum tarihi / tescil tarihi betikle (tarihJs), telefon tuş tuş yazılır. POM\'un yaz → doğrula → 3 kez yeniden dene döngüsü koşucuda yok; maske değeri kaydırırsa sonraki sorgu hata verir.',
      'Sigortalı sorgusunun (#QueryVehicle) hata penceresi adımın hata göstergesiyle yakalanır. Sigorta ettiren ve marka kodu sorgularında pencere çıkarsa koşucu önce beklenen öğeyi (ad / #VehicleModel) 20 sn bekler, adım zaman aşımıyla düşer; pencere adım sonunda ayrıca denetlenir.',
      'Marka kodu sorgusunun başarısı #VehicleModel\'in dolmasıyla beklenir (POM: değeri marka koduna EŞİT olur); eşitlik denetlenmez.',
      'Ödeme sonucu: kodlu test jet-kasko-yk.json > kabulEdilenOdemeSonuclari listesinin herhangi birini kabul eder; ortak akış yalnızca "Hiçbir poliçe onaylanamadı." bekler. Listede başka sonuç varsa ortak akışa eklenmeli.',
      'Koddaki testte olup burada olmayan: sigorta ettiren "kendisi" radyosunun işaretli kaldığı denetimi, her adımdaki ekran görüntülerinin adları (03–10).'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-kasko-akis', ad: 'JetKasko (akış)', urlYolu: '/jet-satis/jet-kasko/' },
      olusturan: 'Claude Code (koddan: yeni-kayit.spec.ts + jet-kasko.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetKasko YK (yeni kayıt) akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetKasko ekranını değiştirmez.'
    },
    model,
    senaryoOnerileri: [],
    gerekenAyarlar: {
      girisGerekli: !s.girissiz, ikiAsamaliDogrulama: 'bilinmiyor', captchaGoruldu: false,
      testVerisiTurleri: [], ...(s.girissiz ? {} : { baglamTurleri: ['Acente'] })
    },
    bilinmeyenler: [...model.bilinmeyenler]
  };
}
