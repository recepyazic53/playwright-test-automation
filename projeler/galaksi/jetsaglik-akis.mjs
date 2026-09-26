// JETSAĞLIK (AKIŞ) — koddaki JetSağlık yeni iş akışının (tests/scenarios/jet-saglik/yeni-is-matrisi.spec.ts +
// tests/support/pages/jet-saglik.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetSağlık" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetSağlık (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): sigortalı (yabancı kimlik / pasaport; kimlik profili: telefon → doğum tarihi
// → yabancı kimlik no + sorgu | uyruk → pasaport no + sorgu → pasaport ayrıntıları → telefon yeniden), sigorta ettiren
// (kendisi / farklı özel / tüzel / pasaport; kimlik sorgusu), poliçe ve sağlık beyanı (pasaportlu sigortalıda adres profili,
// yabancı kimlikte eksik adres seçimleri; poliçe süresi, hastalık, KVKK, yenileme, indirim), prim hesaplama (sıfırdan farklı
// prim) ve isteğe bağlı "Ödeme (kredi kartı)" ortak akışı (kodlu testte her senaryoda var — ama bkz. bilinmeyenler: ortak
// akışın kart formu adımı JetSağlık'a uymuyor). Seçiciler ve sıra POM'dan. Açılır listelerin seçenekleri kodda yok (değerler
// şifreli test verisinde): "bilinmiyor" — 2. aşamada TEST ekranından okunacak.
// Çıktı: node scripts/jetsaglik-akis-paketi.mjs → "Claude outputs/jetsaglik-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { DOGRUDAN_KART_ODEME_AKIS_ANAHTARI } from './odeme-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETSAGLIK_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', pasaport: 'ortak.kimlikBilgileri.pasaport',
  yabanciKimlik: 'ortak.kimlikBilgileri.yabanciKimlik', adres: 'ortak.adresBilgileri', acente: 'ortak.kullaniciDegistir'
});

const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/** Seçenekleri henüz bilinmeyen açılır liste (senaryodaki değer önce "value", olmazsa görünen metinle seçilir). */
const liste = (id, etiket, secici, ek = {}) => alan(id, 'secim', etiket, secici, { zorunlu: true, secenekler: null, seceneklerDurumu: 'bilinmiyor', ...ek });
/** Senaryo alanı olmayan, her koşuda aynı değerle doldurulan alan (ör. telefon ülke kodu 90). */
const sabit = (id, etiket, secici, deger, ek = {}) => ({ ...alan(id, 'metin', etiket, secici), yapilandirma: 'sabit', sabitDeger: deger, eslesme: {}, ...ek });
/** Kimlik bloğunun alt alanı: kimlikAlani metin (her türde) ya da türe göre harita (türde karşılığı yoksa atlanır). */
const alt = (id, sira, tip, etiket, secici, kimlikAlani, ek = {}) => ({
  id, tip, sira, etiket: { ekran: etiket }, eslesme: { kimlikAlani }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/** Kimlik / pasaport sorgusu: düğmeye basılır, sonuç öğesi görünene kadar beklenir (POM: istek 30 sn). */
const sorgu = (dugme, sonuc) => ({ tikla: dugme, bekle: { secici: sonuc, durum: 'gorunur', zamanAsimiSn: 30 } });
/** Pasaport ayrıntıları (sorgudan sonra açılır; POM pasaportDetaylariniGir): önek '' (sigortalı) ya da 'Client' (ettiren). */
const pasaportAyrintilari = (onEk, idOnEki, ilkSira) => {
  const s = (x) => `#${onEk}${x}`;
  const p = (ad) => ({ pasaport: ad });
  return [
    alt(`${idOnEki}Ad`, ilkSira, 'metin', 'Ad', s('Firstname'), p('ad')),
    alt(`${idOnEki}Soyad`, ilkSira + 1, 'metin', 'Soyad', s('Lastname'), p('soyad')),
    alt(`${idOnEki}BabaAdi`, ilkSira + 2, 'metin', 'Baba adı', s('FatherName'), p('babaAdi')),
    // Salt okunur tarih: betikle yazılır (POM readonlyTarihAyarla).
    alt(`${idOnEki}PasaportDogumTarihi`, ilkSira + 3, 'tarih', 'Doğum tarihi (pasaport)', s('Birthday'), p('dogumTarihi'), { bicim: 'gg.aa.yyyy', doldurucu: 'tarihJs' }),
    alt(`${idOnEki}DogumYeri`, ilkSira + 4, 'metin', 'Doğum yeri', s('Birthplace'), p('dogumYeri')),
    alt(`${idOnEki}Cinsiyet`, ilkSira + 5, 'radyo', 'Cinsiyet', s('Gender-E'), p('cinsiyet'), {
      doldurucu: 'radyoZorla', secenekler: [secim('erkek', 'Erkek', { secici: s('Gender-E') }), secim('kadin', 'Kadın', { secici: s('Gender-K') })]
    })
  ];
};

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; pasaport: string; yabanciKimlik: string; adres: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: prim hesaplandıktan sonra "Ödeme (doğrudan kart formu)" ortak akışı (JetSağlık'ta kart formu Poliçeleştir'den sonra
 *   doğrudan açılır; projede önce o yüklenmeli); senaryoda "“Ödeme” dahil".
 *   girissiz: yalnızca yerel testlerde.
 */
export function jetSaglikAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETSAGLIK_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-saglik-akis', ad: 'JetSağlık (akış)',
    aciklama: 'JetSağlık yeni iş akışı (koddaki testten; model koşucusuyla koşar): sigortalı, sigorta ettiren, poliçe ve sağlık beyanı, prim hesaplama'
      + (s.odeme ? ' ve "Ödeme (doğrudan kart formu)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir ("Ödeme (doğrudan kart formu)").'),
    ekranUrl: '/jet-satis/jet-saglik/',
    specDosyasi: 'tests/scenarios/jet-saglik-akis/jet-saglik-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-saglik-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: {
      sigortaliYabanci: { aciklama: 'Sigortalı yabancı kimlikli', ifade: { alan: 'sigortaliTipi', esit: 'yabanciKimlik' } },
      sigortaliPasaport: { aciklama: 'Sigortalı pasaportlu (adres test verisinden girilir)', ifade: { alan: 'sigortaliTipi', esit: 'pasaport' } },
      ettirenFarkli: { aciklama: 'Sigorta ettiren sigortalıdan farklı', ifade: { alan: 'farkliMusteri', esit: 'farkli' } },
      ...(s.odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testte her senaryoda).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
    },
    adimlar: [
      {
        id: 'sigortali', sira: 1, baslik: 'Sigortalı bilgileri girilir ve sorgulanır',
        bolumler: [{
          id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
            alan('sigortaliTipi', 'radyo', 'Sigortalı tipi', '#InsuredType-O', {
              etiket: { ekran: null, form: 'Sigortalı tipi' }, zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam',
              secenekler: [
                // Yabancı kimlik numarası "Özel" tipte, T.C. alanına yazılır (POM).
                secim('O', 'Yabancı kimlik', { senaryoDegeri: 'yabanciKimlik', formMetni: 'Yabancı kimlik', secici: '#InsuredType-O' }),
                secim('P', 'Pasaport', { senaryoDegeri: 'pasaport', formMetni: 'Pasaport', secici: '#InsuredType-P' })
              ]
            }),
            // Kimlik sorgu servisi telefonu istek sırasında zorunlu tutuyor (POM: ekran açılır açılmaz yazılır; ülke kodu 90).
            // POM ülke kodlarını betikle yazar (görünür olmayabilir): degerJs.
            sabit('telefonUlkeKodu', 'Telefon ülke kodu', '#MobilePhoneCountry', '90', { doldurucu: 'degerJs' }),
            {
              id: 'sigortaliKimlik', tip: 'kimlikProfili', kimlikTuru: { yabanciKimlik: 'yabanciKimlik', pasaport: 'pasaport' }, bagimlilik: { alan: 'sigortaliTipi' },
              etiket: { ekran: null, form: 'Sigortalı kimliği' }, zorunlu: true, yapilandirma: 'senaryo',
              eslesme: {
                senaryo: ['sigortaliYabanciKimligi', 'sigortaliPasaportKimligi', 'sigortaliProfili'],
                profilHavuzu: { yabanciKimlik: h.yabanciKimlik, pasaport: h.pasaport }
              },
              // Kimlik türünde karşılığı olmayan alt alan atlanır.
              altAlanlar: [
                alt('sigortaliTelefon', 1, 'telefon', 'Cep telefonu', '#MobilePhone', 'cepTelefonu', { doldurucu: 'metinDoldur' }),
                // POM tarihGir: yazılır, Tab'a basılır (takvim kapanır).
                alt('sigortaliDogumTarihi', 2, 'tarih', 'Doğum tarihi', '#BirthDate', { yabanciKimlik: 'dogumTarihi' }, { bicim: 'gg.aa.yyyy', doldurucuParametreleri: { tus: 'Tab' } }),
                // Sorgu bitince kimlik alanı yeniden yazılabilir olur ve ayrıntı açılır (POM: #IdentityDetail görünür).
                alt('sigortaliYabanciKimlikNo', 3, 'metin', 'Yabancı kimlik no', '#IdentityNo', { yabanciKimlik: 'yabanciKimlikNo' }, {
                  doldurucuParametreleri: sorgu('#QueryIdentity', '#IdentityDetail')
                }),
                alt('sigortaliUyruk', 4, 'secim', 'Uyruk', '#Nationality', { pasaport: 'uyruk' }),
                alt('sigortaliPasaportNo', 5, 'metin', 'Pasaport no', '#PassportNumber', { pasaport: 'pasaportNo' }, {
                  doldurucuParametreleri: sorgu('#QueryPassportNumber', '#Firstname')
                }),
                ...pasaportAyrintilari('', 'sigortali', 6),
                // Sorgu bazı müşterilerde kayıtlı eski telefonu alana yeniden yazıyor (POM telefonuGerekirseDuzelt): yeniden girilir.
                alt('sigortaliTelefonSonra', 12, 'telefon', 'Cep telefonu (sorgudan sonra)', '#MobilePhone', 'cepTelefonu', { doldurucu: 'metinDoldur' })
              ]
            }
          ]
        }],
        // Sigortalı sorgulanınca poliçe bölümü açılır (POM: #PolicyDetail ve #Hesapla görünür).
        kosu: { aksiyonlar: [], basariGostergesi: { tur: 'eleman', deger: '#PolicyDetail' }, zamanAsimiSn: 30 }
      },
      {
        id: 'sigortaEttiren', sira: 2, baslik: 'Sigorta ettiren bilgileri girilir',
        bolumler: [{
          id: 'ettirenBolumu', baslik: 'Sigorta ettiren', alanlar: [
            alan('farkliMusteri', 'radyo', 'Sigorta ettiren', '#DifferentClient-H', {
              etiket: { ekran: null, form: 'Sigorta ettiren' }, zorunlu: false, doldurucu: 'radyoZorla', varsayilan: { deger: 'kendisi' }, seceneklerDurumu: 'tam',
              secenekler: [
                secim('H', 'Kendisi (sigortalı ile aynı)', { senaryoDegeri: 'kendisi', formMetni: 'Kendisi', secici: '#DifferentClient-H' }),
                secim('E', 'Farklı', { senaryoDegeri: 'farkli', formMetni: 'Farklı', secici: '#DifferentClient-E' })
              ]
            }),
            alan('musteriTipi', 'radyo', 'Sigorta ettiren tipi', '#ClientType-O', {
              etiket: { ekran: null, form: 'Sigorta ettiren tipi' }, zorunlu: true, doldurucu: 'radyoZorla', gorunurluk: { kosul: 'ettirenFarkli' }, seceneklerDurumu: 'tam',
              secenekler: [
                secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: '#ClientType-O' }),
                secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: '#ClientType-T' }),
                secim('P', 'Pasaport', { senaryoDegeri: 'pasaport', formMetni: 'Pasaport', secici: '#ClientType-P' })
              ]
            }),
            sabit('ettirenTelefonUlkeKodu', 'Sigorta ettiren telefon ülke kodu', '#ClientMobilePhoneCountry', '90', { doldurucu: 'degerJs', gorunurluk: { kosul: 'ettirenFarkli' } }),
            {
              id: 'ettirenKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel', pasaport: 'pasaport' }, bagimlilik: { alan: 'musteriTipi' },
              etiket: { ekran: null, form: 'Sigorta ettiren kimliği' }, zorunlu: true, yapilandirma: 'senaryo', gorunurluk: { kosul: 'ettirenFarkli' },
              eslesme: {
                senaryo: ['ettirenOzelKimligi', 'ettirenTuzelKimligi', 'ettirenPasaportKimligi', 'ettirenProfili'],
                profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel, pasaport: h.pasaport }
              },
              altAlanlar: [
                // Salt okunur tarih: betikle yazılır, takvim Escape ile kapanır (POM).
                alt('ettirenDogumTarihi', 1, 'tarih', 'Doğum tarihi', '#BirthDateCL', { ozel: 'dogumTarihi' }, { bicim: 'gg.aa.yyyy', doldurucu: 'tarihJs', doldurucuParametreleri: { tus: 'Escape' } }),
                // Uygulama kimlik sorgusundan önce telefonu zorunlu tutuyor (POM).
                // Pasaportlu ettirende satır gizli, hesaplama servisi telefonu yine de ister (POM betikle yazar): degerJs.
                alt('ettirenTelefon', 2, 'telefon', 'Cep telefonu', '#ClientMobilePhone', { ozel: 'cepTelefonu', tuzel: 'cepTelefonu' }, { doldurucu: 'degerJs' }),
                alt('ettirenKimlikNo', 3, 'metin', 'Kimlik no (T.C. / VKN)', '#ClientIdentityNo', { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' }, {
                  doldurucuParametreleri: sorgu('#QueryClientIdentity', '#ClientIdentityDetail')
                }),
                alt('ettirenUyruk', 4, 'secim', 'Uyruk', '#ClientNationality', { pasaport: 'uyruk' }),
                alt('ettirenPasaportNo', 5, 'metin', 'Pasaport no', '#ClientPassportNumber', { pasaport: 'pasaportNo' }, {
                  doldurucuParametreleri: sorgu('#QueryClientPassportNumber', '#ClientFirstname')
                }),
                ...pasaportAyrintilari('Client', 'ettiren', 6),
                // Özel / tüzel: sorgu eski telefonu yazabiliyor, yeniden girilir. Pasaport: telefon sorgudan sonra girilir — satır
                // gizli olduğundan koşucu bunu ATLAR (bkz. bilinmeyenler).
                alt('ettirenTelefonSonra', 12, 'telefon', 'Cep telefonu (sorgudan sonra)', '#ClientMobilePhone', 'cepTelefonu', { doldurucu: 'degerJs' })
              ]
            }
          ]
        }]
      },
      {
        id: 'policeBilgileri', sira: 3, baslik: 'Poliçe ve sağlık beyanı bilgileri girilir',
        bolumler: [
          {
            id: 'adres', baslik: 'Adres', alanlar: [
              // Pasaportlu sigortalı: adres test verisi profilinden (POM sigortaliAdresiniGir). İl → ilçe → belde listeleri sırayla
              // yüklenir; seçim, seçenek gelene kadar bekler.
              {
                id: 'sigortaliAdres', tip: 'kimlikProfili', kimlikTuru: 'adres', etiket: { ekran: null, form: 'Sigortalı adresi' }, zorunlu: true,
                yapilandirma: 'senaryo', gorunurluk: { kosul: 'sigortaliPasaport' },
                eslesme: { senaryo: ['sigortaliAdresi', 'sigortaliAdresProfili'], profilHavuzu: h.adres },
                altAlanlar: [
                  alt('adresIl', 1, 'secim', 'İl', '#IL', 'il'),
                  alt('adresIlce', 2, 'secim', 'İlçe', '#IC', 'ilce'),
                  alt('adresBelde', 3, 'secim', 'Belde / köy', '#BE', 'belde'),
                  alt('adresCadde', 4, 'metin', 'Cadde', '#CD', 'cadde'),
                  alt('adresSokak', 5, 'metin', 'Sokak', '#SK', 'sokak'),
                  alt('adresTipi', 6, 'secim', 'Adres tipi', '#STAPSelector', 'adresTipi'),
                  alt('adresParcasi', 7, 'metin', 'Adres parçası', '#STAP', 'adresParcasi'),
                  alt('adresMahalle', 8, 'metin', 'Mahalle', '#MH', 'mahalle'),
                  alt('adresBinaNo', 9, 'metin', 'Bina no', '#BN', 'binaNo'),
                  alt('adresBlokKodu', 10, 'metin', 'Blok kodu', '#BK', 'blokKodu'),
                  alt('adresSiteAdi', 11, 'metin', 'Site adı', '#SM', 'siteAdi'),
                  alt('adresDaireNo', 12, 'metin', 'Daire no', '#DR', 'daireNo'),
                  alt('adresKat', 13, 'metin', 'Kat', '#KT', 'kat')
                ]
              },
              // Yabancı kimlikli sigortalı: adres sorgudan gelir; POM eksik seçimleri tamamlar (belde "-1" ise ilk geçerli değer,
              // mahalle / cadde boşsa sabit metin). Koşucu "boşsa doldur" yapamaz: senaryoda verilirse HER ZAMAN yazılır, boşsa dokunulmaz.
              liste('eksikBelde', 'Belde / köy (eksikse)', '#BE', { zorunlu: false, gorunurluk: { kosul: 'sigortaliYabanci' } }),
              alan('eksikMahalle', 'metin', 'Mahalle (eksikse)', '#MH', { zorunlu: false, gorunurluk: { kosul: 'sigortaliYabanci' } }),
              alan('eksikCadde', 'metin', 'Cadde (eksikse)', '#CD', { zorunlu: false, gorunurluk: { kosul: 'sigortaliYabanci' } })
            ]
          },
          {
            id: 'police', baslik: 'Poliçe ve sağlık beyanı', alanlar: [
              { ...alan('baslangicTarihi', 'tarih', 'Başlangıç tarihi', '#BeginDate', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {} },
              liste('policeSuresi', 'Poliçe süresi', '#slPolicyPeriod'),
              liste('hastalik', 'Hastalık beyanı', '#slHaveDisease'),
              liste('kvkkOnayi', 'KVKK onayı', '#KVKKOnay'),
              // Gizli liste (POM betikle seçer): koşucu görünmeyen alanı ATLAR — ekranın varsayılanı kalır (bkz. bilinmeyenler).
              // Gizli liste (POM betikle seçer): degerJs.
              liste('yenileme', 'Yenileme', '#Yenileme', { zorunlu: false, doldurucu: 'degerJs' }),
              // 0 olabilir (kodlu verideki değer); "sayi" tipi yalnızca pozitif kabul ettiği için metin.
              alan('indirimOrani', 'metin', 'İndirim oranı (%)', '#DiscountRate', { zorunlu: true })
            ]
          }
        ]
      },
      {
        id: 'primHesaplama', sira: 4, baslik: 'Prim hesaplanır',
        bolumler: [{
          id: 'islemler', baslik: 'İşlemler', alanlar: [
            { id: 'primHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#Hesapla', kirilganlik: 'orta' } },
            { id: 'toplamPrim', tip: 'cikti', etiket: { ekran: 'Toplam prim' }, yapilandirma: 'cikti', konum: { secici: '#premium-total', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#Hesapla', aciklama: 'Hesapla' }],
          // Başarı: toplam prim sıfırdan farklı (POM: #premium-total "0 TL" / "0,00 TL" değil, "Poliçeleştir" görünür).
          basariGostergesi: { tur: 'desen', deger: '[1-9]', secici: '#premium-total' },
          zamanAsimiSn: 45
        }
      },
      ...(s.odeme ? [{ id: 'odeme', sira: 5, baslik: 'Ödeme', gorunurluk: { kosul: 'odemeDahil' }, ortakAkis: { dosya: `${DOGRUDAN_KART_ODEME_AKIS_ANAHTARI}.model.json` } }] : [])
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
      ...(s.odeme
        ? []
        : ['Ödeme (poliçeleştirme + kredi kartı) bu pakette yok; "Ödeme (doğrudan kart formu)" ortak akışı eklenebilir ("Ödeme (kredi kartı)" JetSağlık\'a uymaz: kart formu doğrudan açılır).']),
      'Kodlu test ödeme sonucunu "/jet-satis/jet-saglik/policelestir" servis cevabında da arıyor; ortak akış yalnızca sayfa metnini ve tarayıcı uyarılarını okur. Sonucun ekranda görünüp görünmediği TEST\'te doğrulanmalı.',
      'Açılır listelerin seçenekleri (poliçe süresi, hastalık, KVKK, yenileme, uyruk, il / ilçe / belde, adres tipi) kodda yok; TEST ekranından okunacak. Senaryodaki değer önce "value", olmazsa görünen metinle seçilir.',
      'Gizli alanlar (#Yenileme, #ClientMobilePhone, telefon ülke kodları) POM gibi betikle yazılır (degerJs; görünmeseler de). Maskeli telefon alanının betikle yazılan değeri kabul ettiği TEST\'te doğrulanmalı.',
      'Yabancı kimlikli sigortalıda POM eksik adres seçimlerini koşullu tamamlar (belde "-1" ise ilk geçerli seçenek, mahalle / cadde boşsa "Test Mahallesi" / "Test Caddesi"); koşucu "boşsa doldur" ve "ilk geçerli seçenek" yapamaz: senaryoda verilen değer her zaman yazılır, verilmezse dokunulmaz.',
      'Telefon maskeli alan: POM değeri "(5xx) xxx xx xx" biçiminde betikle atar (tuşlamak rakamları kaydırıyor); koşucu değeri doğrudan yazar (fill). Maskenin bunu kabul ettiği TEST\'te doğrulanmalı.',
      'Sorgu düğmeleri (#QueryIdentity, #QueryPassportNumber, #QueryClient…) POM\'da betikle tıklanıyor (görünür olmayabilir); koşucu görünür düğmeye basar. Doğum tarihi girişinde POM açık kalan takvimi (#ui-datepicker-div) gizler; koşucu yalnızca Tab / Escape\'e basar.',
      'Kimlik sorgusunda POM kimlik alanının salt okunurluğunun kalkmasını da bekler; burada yalnızca ayrıntı bölümünün görünmesi beklenir. Kimlik, pasaport ve prim sorgularının sunucu hatası ("Status: false") sayfada nerede göründüğü bilinmiyor; hata göstergesi yok (hata olursa beklenen öğe gelmez, zaman aşımıyla düşer).',
      'Koddaki testte olup burada olmayan: telefonun sorgudan sonra birebir aynı kaldığı denetimi, poliçe listelerinin seçilen değerde kaldığı denetimi, "Poliçeleştir" düğmesinin prim sonrası görünürlük denetimi, adres alanlarının değer denetimi.'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-saglik-akis', ad: 'JetSağlık (akış)', urlYolu: '/jet-satis/jet-saglik/' },
      olusturan: 'Claude Code (koddan: yeni-is-matrisi.spec.ts + jet-saglik.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetSağlık yeni iş akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetSağlık ekranını değiştirmez.'
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
