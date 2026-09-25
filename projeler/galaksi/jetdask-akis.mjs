// JETDASK (AKIŞ) — koddaki JetDASK yeni iş akışının (tests/scenarios/jet-dask/yeni-is-matrisi.spec.ts +
// tests/support/pages/jet-dask.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetDASK" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetDASK (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): yeni iş (yenileme "Hayır"), sigortalı (özel / tüzel / pasaport; kimlik
// profili: telefon → doğum tarihi → uyruk → kimlik no + sorgu → telefon yeniden), adres (UAVT kodu + sorgu), tapu, poliçe
// bilgileri, prim hesaplama (sıfırdan farklı prim) ve isteğe bağlı "Ödeme (kredi kartı)" ortak akışı (kodlu testte her
// senaryoda var). Seçiciler ve sıra POM'dan. Açılır listelerin seçenekleri kodda yok (değerler şifreli test verisinde):
// "bilinmiyor" — 2. aşamada TEST ekranından okunacak.
// Çıktı: node scripts/jetdask-akis-paketi.mjs → "Claude outputs/jetdask-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { ODEME_AKIS_ANAHTARI } from './odeme-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETDASK_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', pasaport: 'ortak.kimlikBilgileri.pasaport', acente: 'ortak.kullaniciDegistir'
});

const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/** Seçenekleri henüz bilinmeyen açılır liste (senaryodaki değer önce "value", olmazsa görünen metinle seçilir). */
const liste = (id, etiket, secici, ek = {}) => alan(id, 'secim', etiket, secici, { zorunlu: true, secenekler: null, seceneklerDurumu: 'bilinmiyor', ...ek });
const sabitRadyo = (id, etiket, secici, deger) => ({
  id, tip: 'radyo', etiket: { ekran: etiket }, yapilandirma: 'sabit', sabitDeger: deger,
  secenekler: [secim(deger, etiket, { secici })], konum: { secici, kirilganlik: 'orta' }, doldurucu: 'radyoZorla'
});
/** Kimlik sorgusu: düğmeye basılır, ad / unvan gelene kadar beklenir ("Aranıyor" geçici metni dolu sayılmaz; POM: 20 sn). */
const sorgu = (dugme) => ({ tikla: dugme, bekle: { secici: '#identity-name', durum: 'dolu', icermez: 'Aranıyor', zamanAsimiSn: 20 } });

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; pasaport: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: prim hesaplandıktan sonra "Ödeme (kredi kartı)" ortak akışı (projede önce o yüklenmeli); senaryoda "“Ödeme” dahil"
 *   (varsayılan işaretli: kodlu testte her senaryo öder). girissiz: yalnızca yerel testlerde.
 */
export function jetDaskAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETDASK_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-dask-akis', ad: 'JetDASK (akış)',
    aciklama: 'JetDASK yeni iş akışı (koddaki testten; model koşucusuyla koşar): sigortalı, adres / tapu / poliçe bilgileri, prim hesaplama'
      + (s.odeme ? ' ve "Ödeme (kredi kartı)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir.'),
    ekranUrl: '/jet-satis/jet-dask/',
    specDosyasi: 'tests/scenarios/jet-dask-akis/jet-dask-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-dask-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: {
      ...(s.odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testte her senaryoda).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
    },
    adimlar: [
      {
        id: 'sigortali', sira: 1, baslik: 'Sigortalı bilgileri girilir ve sorgulanır',
        bolumler: [{
          id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
            // Yeni iş (yenileme değil) — POM: ekran açılınca "Hayır".
            sabitRadyo('yenilemeHayir', 'Yenileme: Hayır', '#Renewal-H', 'H'),
            alan('sigortaliTipi', 'radyo', 'Sigortalı tipi', '#InsuredType-O', {
              etiket: { ekran: null, form: 'Sigortalı tipi' }, zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam',
              secenekler: [
                secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: '#InsuredType-O' }),
                secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: '#InsuredType-T' }),
                secim('P', 'Pasaport', { senaryoDegeri: 'pasaport', formMetni: 'Pasaport', secici: '#InsuredType-P' })
              ]
            }),
            // Kimlik sorgu servisi telefonu istek sırasında zorunlu tutuyor (POM): ülke kodu sabit 90.
            { ...alan('telefonUlkeKodu', 'metin', 'Telefon ülke kodu', '#MobilePhoneCountry'), yapilandirma: 'sabit', sabitDeger: '90', eslesme: {} },
            {
              id: 'sigortaliKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel', pasaport: 'pasaport' }, bagimlilik: { alan: 'sigortaliTipi' },
              etiket: { ekran: null, form: 'Sigortalı kimliği' }, zorunlu: true, yapilandirma: 'senaryo',
              eslesme: { senaryo: ['sigortaliOzelKimligi', 'sigortaliTuzelKimligi', 'sigortaliPasaportKimligi', 'sigortaliProfili'], profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel, pasaport: h.pasaport } },
              // Kimlik türünde karşılığı olmayan alt alan atlanır (tüzelde doğum tarihi, özel/tüzelde uyruk yok).
              altAlanlar: [
                { id: 'sigortaliTelefon', tip: 'telefon', sira: 1, etiket: { ekran: 'Cep telefonu' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#TL', kirilganlik: 'orta' }, doldurucu: 'metinDoldur' },
                { id: 'sigortaliDogumTarihi', tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 2, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi', pasaport: 'dogumTarihi' } }, konum: { secici: '#BirthDate', kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
                { id: 'sigortaliUyruk', tip: 'secim', sira: 3, etiket: { ekran: 'Uyruk' }, eslesme: { kimlikAlani: { pasaport: 'uyruk' } }, konum: { secici: '#Nationality', kirilganlik: 'orta' } },
                {
                  id: 'sigortaliKimlikNo', tip: 'metin', sira: 4, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
                  konum: { secici: '#IdentityNo', kirilganlik: 'orta' }, doldurucuParametreleri: sorgu('#RefreshIdentity')
                },
                {
                  id: 'sigortaliPasaportNo', tip: 'metin', sira: 5, etiket: { ekran: 'Pasaport no' }, eslesme: { kimlikAlani: { pasaport: 'pasaportNo' } },
                  konum: { secici: '#IdentityNo', kirilganlik: 'orta' }, doldurucuParametreleri: sorgu('#QueryPassportNumber')
                },
                // Sorgu bazı müşterilerde iletişim alanlarını yeniden oluşturuyor (POM): telefon sorgudan sonra yeniden girilir.
                { id: 'sigortaliTelefonSonra', tip: 'telefon', sira: 6, etiket: { ekran: 'Cep telefonu (sorgudan sonra)' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#TL', kirilganlik: 'orta' }, doldurucu: 'metinDoldur' }
              ]
            }
          ]
        }]
      },
      {
        id: 'adresPolice', sira: 2, baslik: 'Adres, tapu ve poliçe bilgileri girilir',
        bolumler: [
          {
            id: 'adres', baslik: 'Adres', alanlar: [
              liste('sigortaEttirenSifati', 'Sigorta ettiren sıfatı', '#InsurerType'),
              // UAVT adres kodu: yazılır, sorgulanır; adres gelene kadar beklenir (POM: #DR adres koduyla dolar, 20 sn).
              alan('adresKodu', 'metin', 'Adres kodu (UAVT)', '#AK', {
                zorunlu: true, doldurucuParametreleri: { tikla: '#RefreshUAVT', bekle: { secici: '#DR', durum: 'dolu', zamanAsimiSn: 20 } }
              })
            ]
          },
          {
            id: 'tapu', baslik: 'Tapu', alanlar: [
              alan('ada', 'metin', 'Ada', '#AD', { zorunlu: true }),
              alan('sayfaNo', 'metin', 'Sayfa no', '#SY', { zorunlu: true }),
              alan('pafta', 'metin', 'Pafta', '#PF', { zorunlu: true }),
              alan('bagimsizBolum', 'metin', 'Bağımsız bölüm', '#BB', { zorunlu: true }),
              alan('parsel', 'metin', 'Parsel', '#PR', { zorunlu: true })
            ]
          },
          {
            id: 'police', baslik: 'Poliçe bilgileri', alanlar: [
              { ...alan('baslangicTarihi', 'tarih', 'Başlangıç tarihi', '#BeginDate', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {} },
              alan('brutYuzolcum', 'sayi', 'Brüt yüzölçümü (m²)', '#GrossAreaM2', { zorunlu: true }),
              liste('kullanimSekli', 'Kullanım şekli', '#UsageType'),
              liste('insaTarzi', 'İnşa tarzı', '#BuildType'),
              liste('insaYili', 'İnşa yılı', '#BuildYear'),
              liste('toplamKat', 'Toplam kat sayısı', '#TotalFloor'),
              liste('oncekiHasar', 'Önceki hasar', '#AnteriorDamage'),
              liste('bulunduguKat', 'Bulunduğu kat', '#KT'),
              // Dain-i mürtehin yok (POM: #LP-Y işaretlenir).
              sabitRadyo('dainiMurtehinYok', 'Dain-i mürtehin: Yok', '#LP-Y', 'Y')
            ]
          }
        ]
      },
      {
        id: 'primHesaplama', sira: 3, baslik: 'Prim hesaplanır',
        bolumler: [{
          id: 'islemler', baslik: 'İşlemler', alanlar: [
            { id: 'primHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#Hesapla', kirilganlik: 'orta' } },
            { id: 'toplamPrim', tip: 'cikti', etiket: { ekran: 'Toplam prim' }, yapilandirma: 'cikti', konum: { secici: '#premium-total', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#Hesapla', aciklama: 'Hesapla' }],
          // Başarı: toplam prim sıfırdan farklı (POM: #premium-total ve #dask-amount rakam içerir, "Poliçeleştir" görünür).
          basariGostergesi: { tur: 'desen', deger: '[1-9]', secici: '#premium-total' },
          zamanAsimiSn: 45
        }
      },
      ...(s.odeme ? [{ id: 'odeme', sira: 4, baslik: 'Ödeme', gorunurluk: { kosul: 'odemeDahil' }, ortakAkis: { dosya: `${ODEME_AKIS_ANAHTARI}.model.json` } }] : [])
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
            { tip: 'basarili', anlam: 'Prim sıfırdan farklı hesaplanır.' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda, belirtilen mesajı içeren uyarı beklenir.',
              alanlar: {
                adim: { etiket: 'Hatanın beklendiği adım', secenekler: [{ deger: 'primHesaplama', metin: 'Prim hesaplama' }] },
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
      'Açılır listelerin seçenekleri (sigorta ettiren sıfatı, kullanım şekli, inşa tarzı, inşa yılı, toplam kat, önceki hasar, bulunduğu kat) kodda yok; TEST ekranından okunacak. Senaryodaki değer önce "value", olmazsa görünen metinle seçilir.',
      'Bulunduğu kat: kodlu test TEST ortamında listede eksik olan seçeneği sayfaya ekliyordu (geçici çözüm); model koşucusu bunu yapmaz — seçenek yoksa adım hata verir.',
      'Kimlik, adres ve prim sorgularının sunucu hatası ("Status: false") sayfada nerede göründüğü bilinmiyor; hata göstergesi yok (hata olursa beklenen öğe gelmez, zaman aşımıyla düşer).',
      'Pasaport sorgusunun TEST\'te başlamadığı durumlar görülmüş (kodlu testin açıklaması); pasaport senaryosu TEST\'te doğrulanmalı.',
      'Koddaki testte olup burada olmayan: telefonun sorgudan sonra birebir aynı kaldığı denetimi, "Poliçeleştir" düğmesinin prim sonrası görünürlük denetimi (ödeme ortak akışı zaten ona basar).'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-dask-akis', ad: 'JetDASK (akış)', urlYolu: '/jet-satis/jet-dask/' },
      olusturan: 'Claude Code (koddan: yeni-is-matrisi.spec.ts + jet-dask.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetDASK yeni iş akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetDASK ekranını değiştirmez.'
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
