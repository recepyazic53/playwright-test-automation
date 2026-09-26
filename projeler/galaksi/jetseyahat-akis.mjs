// JETSEYAHAT (AKIŞ) — koddaki JetSeyahat prim hesaplama akışının (tests/scenarios/jet-seyahat/prim-hesaplama.spec.ts +
// tests/support/pages/jet-seyahat.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetSeyahat" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetSeyahat (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// Kapsam (1. aşama): poliçe bilgileri (oklu kapsam/alternatif, bugün / bugün+7 tarih, acenteye göre görünen COVID / kayak /
// iptal bedeli / plan, ülke, tekli / çoklu sorgu, çoklu sorgu Excel'i), tekli sorguda sigortalı (kimlik profili: doğum tarihi →
// telefon → T.C. + sorgu), sigorta ettiren (aynı / farklı özel / farklı tüzel; kimlik sorgusu), prim hesaplama (sıfırdan farklı
// prim) ve prim hesaplamada beklenen iş kuralı uyarısı. ÖDEME (poliçeleştirme + kredi kartı) YOK — ortak akış olarak eklenecek.
// Seçiciler ve sıra POM'dan alınmış, seçenek listeleri ve koşullar Galaksi TEST ekranından okunarak düzeltilmiştir
// (jetseyahat-secenekler.mjs). Alan değerleri: senaryo (kapsam, alternatif, COVID, sorgu tipi…), hazır kimlik
// profilleri (Ayarlar > Test verisi profilleri: Özel kişi / Tüzel kişi) ve acente profili (bağlam).
// Çıktı: node scripts/jetseyahat-akis-paketi.mjs → "Claude outputs/jetseyahat-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { ODEME_AKIS_ANAHTARI } from './odeme-akis.mjs';
import { HESAPLA_UYARILARI, IPTAL_BEDELLERI, KAPSAM_ALTERNATIF, PLANLAR, SUNUCU_UYARILARI } from './jetseyahat-secenekler.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const GALAKSI_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', acente: 'ortak.kullaniciDegistir'
});

/** Kapsam / alternatif değişince ülke listesini yeniden yükleyen istek (POM: okluSecimYap bunu bekler). */
export const ULKE_LISTESI_ISTEGI = '/jet-satis/jet-seyahat/ulke-listesi/';
const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const liste = (/** @type {string[][]} */ l) => l.map(([d, m]) => secim(d, m));
// Varsayılanı olan alanlar senaryoda zorunlu değildir (boş bırakılırsa koşucu varsayılanı kullanır).
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: prim hesaplandıktan sonra "Ödeme (kredi kartı)" ortak akışı (odeme-akis.mjs; projede önce o yüklenmeli), senaryoda
 *   "“Ödeme” dahil" ile seçilir (kodlu testteki odemeAdimiDahil).
 *   havuzlar: kimlik ve acente profil havuzları (Galaksi projesinde varsayılan); girissiz: yalnızca yerel testlerde.
 */
export function jetSeyahatAkisPaketi(s = {}) {
  const h = s.havuzlar ?? GALAKSI_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-seyahat-akis', ad: 'JetSeyahat (akış)',
    aciklama: s.odeme
      ? 'JetSeyahat prim hesaplama ve ödeme akışı (koddaki testten; model koşucusuyla koşar). Ödeme "Ödeme (kredi kartı)" ortak akışıyla.'
      : 'JetSeyahat prim hesaplama akışı (koddaki testten; model koşucusuyla koşar). Ödeme "+ > Ortak akış" ile eklenebilir.',
    ekranUrl: '/jet-satis/jet-seyahat/',
    specDosyasi: 'tests/scenarios/jet-seyahat-akis/jet-seyahat-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-seyahat-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: {
      tekliSorgu: { aciklama: 'Sorgu tipi Tekli', ifade: { alan: 'sorguTipi', esit: 'tekli' } },
      cokluSorgu: { aciklama: 'Sorgu tipi Çoklu', ifade: { alan: 'sorguTipi', esit: 'coklu' } },
      ettirenFarkli: { aciklama: 'Sigorta ettiren sigortalıdan farklı', ifade: { alan: 'farkliMusteri', esit: 'farkli' } },
      seyahatPaket: { aciklama: 'Alternatif SEYAHAT PAKET (iptal bedeli yalnızca bunda etkin; TEST ekranında görüldü)', ifade: { alan: 'alternatif', esit: 'SEYAHAT PAKET' } },
      ...(s.odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testteki odemeAdimiDahil).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
    },
    adimlar: [
      {
        id: 'policeBilgileri', sira: 1, baslik: 'Poliçe bilgileri girilir',
        bolumler: [{
          id: 'police', baslik: 'Poliçe bilgileri', alanlar: [
            alan('kapsam', 'okluSecim', 'Kapsam', '#kapsam-text', {
              zorunlu: true, doldurucu: 'okluSecim', seceneklerDurumu: 'tam',
              secenekler: Object.keys(KAPSAM_ALTERNATIF).map((k) => secim(k, k)),
              konum: {
                secici: '#kapsam-text', kirilganlik: 'yuksek',
                yardimci: { arttir: '#syh-kapsam-tb img[onclick*="Increase"]', azalt: '#syh-kapsam-tb img[onclick*="Decrease"]' }
              },
              // Her değişiklikte ülke listesi AJAX ile yeniden yüklenir (POM gibi beklenir; yoksa sonra seçilen ülke sıfırlanır).
              doldurucuParametreleri: { maksDeneme: 6, yanitBekle: ULKE_LISTESI_ISTEGI }
            }),
            alan('alternatif', 'okluSecim', 'Alternatif', '#alternatif-text', {
              zorunlu: true, doldurucu: 'okluSecim', seceneklerDurumu: 'tam', secenekler: null,
              // Kapsama bağlı (TEST ekranı): DÜNYA → SEYAHAT PAKET / VİZE TÜM DÜNYA; AVRUPA → VİZE SCHENGEN / SEYAHAT PAKET.
              bagimlilik: { alan: 'kapsam', secenekHaritasi: Object.fromEntries(Object.entries(KAPSAM_ALTERNATIF).map(([k, l]) => [k, l.map((a) => secim(a, a))])) },
              konum: {
                secici: '#alternatif-text', kirilganlik: 'yuksek',
                // Halka: koşucu önce "arttır" yönünde döner; değer değişmez ya da başa dönerse "azalt" yönünü dener.
                yardimci: { arttir: '#syh-alternatif-tb img[onclick*="Increase"]', azalt: '#syh-alternatif-tb img[onclick*="Decrease"]' }
              },
              doldurucuParametreleri: { maksDeneme: 6, yanitBekle: ULKE_LISTESI_ISTEGI }
            }),
            { ...alan('baslangicTarihi', 'tarih', 'Başlangıç tarihi', '#from', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {} },
            { ...alan('bitisTarihi', 'tarih', 'Bitiş tarihi', '#to', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun+7', eslesme: {} },
            // Acenteye göre görünür (görünmüyorsa atlanır — "görünürse doldur").
            alan('covidTeminati', 'secim', 'COVID teminatı', '#covid-teminati', {
              zorunlu: false, doldurucu: 'secimGerekirse', seceneklerDurumu: 'tam', secenekler: [secim('E', 'Evet'), secim('H', 'Hayır')]
            }),
            alan('kayakTeminati', 'onayKutusu', 'Kayak teminatı', '#kayak', { zorunlu: false }),
            // Gerçek alan #Bedel_Select: yalnızca SEYAHAT PAKET'te etkin (diğerlerinde pasif). #cmbIpt bu acentede hep gizli.
            // Varsayılan yok: boş bırakılırsa ekranın seçili değeri kalır.
            alan('seyahatIptalBedeli', 'secim', 'Seyahat iptal bedeli', '#Bedel_Select', {
              zorunlu: false, doldurucu: 'secimGerekirse', seceneklerDurumu: 'tam', secenekler: liste(IPTAL_BEDELLERI), gorunurluk: { kosul: 'seyahatPaket' }
            }),
            alan('plan', 'secim', 'Plan', '#Plan_Select', {
              zorunlu: false, doldurucu: 'secimGerekirse', seceneklerDurumu: 'tam', secenekler: liste(PLANLAR), varsayilan: { deger: '1' }
            }),
            // Ülke listesi kodda tutulmaz: test verisi tablosundan gelir (Kapsam / Alternatif / Ülke sütunları; ülke adı tablo değeri,
            // sayfadaki kod sütunun karşılıklarında "sayfa değeri"). Sayfada liste kapsama göre AJAX ile değişir.
            alan('ulke', 'secim', 'Ülke', '#cmbCountries', {
              zorunlu: false, doldurucu: 'secimGerekirse', seceneklerDurumu: 'bilinmiyor', secenekler: null, varsayilan: { deger: '15' },
              seceneklerKaynagi: 'Test verisi tablosu (Ülke sütunu; sayfa değeri karşılıklarda).'
            }),
            alan('sorguTipi', 'secim', 'Sorgu tipi', '#selectAllClientPolicy', {
              zorunlu: false, doldurucu: 'secimGerekirse', varsayilan: { deger: 'tekli' },
              secenekler: [secim('1', 'Tekli', { senaryoDegeri: 'tekli', formMetni: 'Tekli' }), secim('2', 'Çoklu', { senaryoDegeri: 'coklu', formMetni: 'Çoklu' })]
            }),
            alan('sigortaliSayisi', 'metin', 'Sigortalı sayısı', '#sigortali_sayisi', {
              zorunlu: false, doldurucu: 'secimGerekirse', varsayilan: { deger: '1' }, gorunurluk: { kosul: 'tekliSorgu' },
              doldurucuParametreleri: { tus: 'Tab' }
            }),
            alan('cokluSorguDosyasi', 'dosya', 'Çoklu sorgu dosyası (Excel)', '#fileinsuredlist', {
              zorunlu: true, kabul: '.xlsx', gorunurluk: { kosul: 'cokluSorgu' },
              // Liste yüklenince sigortalıların adları gelir (POM: satırların ad-soyadı dolana kadar, 30 sn).
              doldurucuParametreleri: { bekle: { secici: '#InsurerList tr.syh-tc-tr td[id$="-fullname"]', durum: 'dolu', zamanAsimiSn: 30 } }
            })
          ]
        }]
      },
      {
        id: 'sigortali', sira: 2, baslik: 'Sigortalı bilgileri girilir', gorunurluk: { kosul: 'tekliSorgu' },
        bolumler: [{
          id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
            // POM sırası: önce "sigorta ettiren aynı" işaretlenir, sonra sigortalı (doğum tarihi → telefon → T.C.).
            {
              id: 'ettirenAyniOnce', tip: 'radyo', etiket: { ekran: 'Sigorta ettiren aynı (ön seçim)' }, yapilandirma: 'sabit', sabitDeger: 'H',
              secenekler: [secim('H', 'Aynı', { secici: '#DifferentClient-H' })], konum: { secici: '#DifferentClient-H', kirilganlik: 'orta' }, doldurucu: 'radyoZorla'
            },
            {
              id: 'sigortaliKimlik', tip: 'kimlikProfili', kimlikTuru: 'ozel', etiket: { ekran: null, form: 'Sigortalı' }, zorunlu: false, yapilandirma: 'senaryo',
              eslesme: { senaryo: ['sigortaliKimligi', 'sigortaliProfili'], profilHavuzu: h.ozel }, varsayilan: { deger: 'tc1' },
              altAlanlar: [
                { id: 'sigortaliDogumTarihi', tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 1, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: 'dogumTarihi' }, konum: { secici: '#insurers-1-birthday', kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
                { id: 'sigortaliTelefon', tip: 'telefon', sira: 2, etiket: { ekran: 'Cep telefonu' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#insurers-1-tel', kirilganlik: 'orta' }, doldurucu: 'telefonTuslama' },
                {
                  id: 'sigortaliTc', tip: 'metin', sira: 3, etiket: { ekran: 'T.C. kimlik no' }, eslesme: { kimlikAlani: 'tcKimlikNo' }, konum: { secici: '#insurer-1-textbox', kirilganlik: 'orta' },
                  doldurucu: 'tuslayarakYaz', doldurucuParametreleri: { tus: 'Tab', bekle: { secici: '#insurer-1-fullname', durum: 'dolu', zamanAsimiSn: 20 } }
                }
              ]
            }
          ]
        }]
      },
      {
        id: 'ettiren', sira: 3, baslik: 'Sigorta ettiren bilgileri girilir',
        bolumler: [{
          id: 'ettirenBolumu', baslik: 'Sigorta ettiren', alanlar: [
            alan('farkliMusteri', 'radyo', 'Sigorta ettiren', '#DifferentClient-E', {
              etiket: { ekran: null, form: 'Sigorta ettiren' }, zorunlu: false, doldurucu: 'radyoZorla', varsayilan: { deger: 'ayni' },
              secenekler: [
                secim('H', 'Sigortalı ile aynı', { senaryoDegeri: 'ayni', formMetni: 'Sigortalı ile aynı', secici: '#DifferentClient-H' }),
                secim('E', 'Farklı', { senaryoDegeri: 'farkli', formMetni: 'Farklı', secici: '#DifferentClient-E' })
              ]
            }),
            alan('musteriTipi', 'radyo', 'Müşteri tipi', '#ClientType-O', {
              etiket: { ekran: null, form: 'Sigorta ettiren tipi' }, zorunlu: true, doldurucu: 'radyoZorla', gorunurluk: { kosul: 'ettirenFarkli' },
              secenekler: [
                secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: '#ClientType-O' }),
                secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: '#ClientType-T' })
              ]
            }),
            {
              id: 'ettirenKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: 'musteriTipi' },
              etiket: { ekran: null, form: 'Sigorta ettiren kimliği' }, zorunlu: true, yapilandirma: 'senaryo', gorunurluk: { kosul: 'ettirenFarkli' },
              eslesme: { senaryo: ['ettirenOzelKimligi', 'ettirenTuzelKimligi', 'ettirenProfili'], profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel } },
              altAlanlar: [
                // Tüzelde doğum tarihi yok (kimlik türünde karşılığı olmayan alt alan atlanır).
                { id: 'ettirenDogumTarihi', tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 1, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi' } }, konum: { secici: '#BirthDate', kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
                { id: 'ettirenTelefon', tip: 'telefon', sira: 2, etiket: { ekran: 'Cep telefonu' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#ClientPhoneNumber', kirilganlik: 'orta' }, doldurucu: 'telefonTuslama' },
                {
                  id: 'ettirenKimlikNo', tip: 'metin', sira: 3, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
                  konum: { secici: '#ClientIdentityNo', kirilganlik: 'orta' },
                  // Kimlik sorgulanır, ad / unvan gelene kadar beklenir (POM: 20 sn).
                  doldurucuParametreleri: { tikla: '#RefreshClientIdentity', bekle: { secici: '#client-identity-name', durum: 'dolu', zamanAsimiSn: 20 } }
                }
              ]
            }
          ]
        }]
      },
      {
        id: 'primHesaplama', sira: 4, baslik: 'Prim hesaplanır',
        bolumler: [{
          id: 'islemler', baslik: 'İşlemler', alanlar: [
            { id: 'primHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#Refresh', kirilganlik: 'orta' } },
            { id: 'toplamPrimEur', tip: 'cikti', etiket: { ekran: 'Toplam prim (EUR)' }, yapilandirma: 'cikti', konum: { secici: '#premium-total-eur', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#Refresh', aciklama: 'Hesapla' }],
          // Hesapla'nın doğrulama uyarıları (TEST'te tarayıcı uyarısı — alert — olarak görüldü): kabul edilen uyarılar.
          uyarilar: [...HESAPLA_UYARILARI.map((metin) => ({ metin })), ...SUNUCU_UYARILARI.map(([metin, secici]) => ({ metin, secici }))],
          // Başarı: toplam prim sıfırdan farklı (POM: > 0, 45 sn). İş kuralı uyarısı açılır pencerede.
          basariGostergesi: { tur: 'desen', deger: '[1-9]', secici: '#premium-total-eur' },
          hataGostergesi: { secici: '#dialog-content' },
          zamanAsimiSn: 45
        }
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
      'Çoklu sorguda kişi sayısı denetlenmez; liste yüklenince ilk satırın adı dolana kadar beklenir.',
      'Seçenek listeleri ve iptal bedelinin koşulu tek acenteyle (TEST) okundu; acenteye göre değişebilir. #cmbIpt bu acentede hep gizliydi.',
      'Ülke seçenekleri test verisi tablosundan gelir (Kapsam → Alternatif → Ülke süzülür); tablo bağlı değilse ülke serbest yazılır.',
      'Sunucu tarafı iş kuralı uyarıları (#dialog-content) kodlu senaryoların beklenen mesajlarından alındı; TEST\'te geçerli kimlikle doğrulanmadı.',
      'Ödeme alanları aynı sayfada gizli (#isim, #soyisim, #kartno, #cvv, #ay, #yil; "Ödemeyi tamamla", "AÇIK HESAP OLARAK") — 2. aşamada ortak akış.',
      'Koddaki testte olup burada olmayan: T.C. yazıldıktan sonra telefonun korunduğu denetimi, ürün bağlantısının görünürlük denetimi.'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-seyahat-akis', ad: 'JetSeyahat (akış)', urlYolu: '/jet-satis/jet-seyahat/' },
      olusturan: 'Claude Code (koddan: prim-hesaplama.spec.ts + jet-seyahat.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetSeyahat prim hesaplama akışının model koşucusu karşılığı (ödemesiz). Mevcut JetSeyahat ekranını değiştirmez.'
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
