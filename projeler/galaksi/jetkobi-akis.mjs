// JETKOBİ (AKIŞ) — koddaki JetKOBİ teklif akışının (tests/scenarios/jet-kobi/teklif-matrisi.spec.ts +
// tests/support/pages/jet-kobi.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetKOBİ" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetKOBİ (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): sigortalı (özel / tüzel; telefon alan kodu + numara, doğum tarihi, kimlik
// no + sorgu), sigorta ettiren (aynı / farklı özel / farklı tüzel; aynı sıra), riziko adresi (UAVT kodu + sorgu, yükleme
// perdesi), riziko ve poliçe bilgileri (mal sahibi / kiracı; mal sahibine özel alanlar koşullu), "Standart" → teminat ekranı,
// teminatlar ve teklif (Teklif Kaydet görünür) ve isteğe bağlı ödeme. Seçiciler ve sıra POM'dan.
// ÖDEME: JetKOBİ "Poliçeleştir" (#Policelestir) değil "Teklif Kaydet" (#TeklifKaydetButon) ile kart seçeneğine gider; mevcut
// "Ödeme (kredi kartı)" ortak akışı #Policelestir'e bastığı için burada kullanılamaz. Bu yüzden aynı ödeme adımlarının ilk
// adımı "Teklif kaydet" olan ikinci bir ortak akış üretilir: "Ödeme (teklif kaydet + kredi kartı)" (teklifKaydetOdemeAkisPaketi;
// kart adımları odeme-akis.mjs'den birebir alınır, yalnızca test ortamında koşar). Nöbetçi'de önce o yüklenmeli.
// Açılır listeler gerçek ekranda jqTransform (gizli <select> + görünen liste); seçenekleri kodda yok (değerler şifreli test
// verisinde): "bilinmiyor" — senaryoya GÖRÜNEN METİN yazılır, 2. aşamada TEST ekranından okunacak.
// Çıktı: node scripts/jetkobi-akis-paketi.mjs → "Claude outputs/jetkobi-akis.paket.json" ve
// "Claude outputs/odeme-teklif-kaydet-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, teklifKaydetOdemeAkisPaketi } from './odeme-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETKOBI_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', acente: 'ortak.kullaniciDegistir'
});
// "Ödeme (teklif kaydet + kredi kartı)" ortak akışı odeme-akis.mjs'te (JetKonut ile ortak); geriye uyum için yeniden verilir.
export { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, teklifKaydetOdemeAkisPaketi };
/** Teklif hata penceresi (POM: "JetKobi Hızlı Teklif Ekranı" başlığının iki üstü). */
const TEKLIF_HATA_PENCERESI = 'internal:text="JetKobi Hızlı Teklif Ekranı"s >> xpath=../..';

const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/**
 * jqTransform açılır listesi: asıl <select> gizli, koşucu görünen açma düğmesine (select'in kardeşi) basıp seçeneği GÖRÜNEN
 * METNİYLE seçer (özel açılır liste yolu). Seçenekler bilinmiyor: senaryoya görünen metin yazılır.
 */
const jqListe = (id, etiket, selectId, ek = {}) => alan(id, 'secim', etiket, `:has(> #${selectId}) a.jqTransformSelectOpen`, {
  zorunlu: true, secenekler: null, seceneklerDurumu: 'bilinmiyor', ...ek
});
/** Gizli çizimli iki seçenekli radyo (POM radioSec: yanındaki bağlantıya zorla tıklar). */
const radyo = (id, etiket, secenekler, ek = {}) => alan(id, 'radyo', etiket, secenekler[0].secici, {
  etiket: { ekran: null, form: etiket }, zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam', secenekler, ...ek
});
const evetHayir = (onEk, evet, hayir, evetMetin, hayirMetin) => [
  secim('E', evetMetin, { senaryoDegeri: evet, formMetni: evetMetin, secici: `#${onEk}-E` }),
  secim('H', hayirMetin, { senaryoDegeri: hayir, formMetni: hayirMetin, secici: `#${onEk}-H` })
];
/** Telefon iki alanda (alan kodu 3 hane + numara). Koşucu profil değerini bölemediği için senaryo alanı (hassas). */
const telefon = (id, etiket, secici, ek = {}) => alan(id, 'metin', etiket, secici, { zorunlu: true, hassas: true, ...ek });
/** Kimlik sorgusu: bağlantıya basılır, sonuç kutusu görünene kadar beklenir (POM: 20 sn). */
const sorgu = (kim, detay) => ({ tikla: `a[href="javascript:CheckIdentity('${kim}')"]`, bekle: { secici: detay, durum: 'gorunur', zamanAsimiSn: 20 } });
const kimlikBlogu = (id, form, onEk, tipAlani, secici, kosul, h) => ({
  id, tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: tipAlani },
  etiket: { ekran: null, form }, zorunlu: true, yapilandirma: 'senaryo', ...(kosul ? { gorunurluk: { kosul } } : {}),
  eslesme: { senaryo: [`${onEk}OzelKimligi`, `${onEk}TuzelKimligi`, `${onEk}Profili`], profilHavuzu: { ozel: h.ozel, tuzel: h.tuzel } },
  // Tüzelde doğum tarihi yok (kimlik türünde karşılığı olmayan alt alan atlanır). Telefon ayrı senaryo alanlarında.
  altAlanlar: [
    { id: `${onEk}DogumTarihi`, tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 1, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi' } }, konum: { secici: secici.dogum, kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
    {
      id: `${onEk}KimlikNo`, tip: 'metin', sira: 2, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
      konum: { secici: secici.no, kirilganlik: 'orta' }, doldurucuParametreleri: sorgu(secici.sorgu, secici.detay)
    }
  ]
});
/** Teminat tutarı: 0 olabilir (sayı tipi pozitif ister) ve ekran biçimleyebilir; metin olarak yazılır. */
const teminat = (id, etiket, secici) => alan(id, 'metin', etiket, secici, { zorunlu: true });

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: teklif alındıktan sonra "Ödeme (teklif kaydet + kredi kartı)" ortak akışı (projede önce o yüklenmeli); senaryoda
 *   "“Ödeme” dahil" (kodlu testte her senaryo öder). girissiz: yalnızca yerel testlerde.
 */
export function jetKobiAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETKOBI_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-kobi-akis', ad: 'JetKOBİ (akış)',
    aciklama: 'JetKOBİ teklif akışı (koddaki testten; model koşucusuyla koşar): sigortalı, sigorta ettiren, riziko ve poliçe bilgileri, teminatlar, teklif'
      + (s.odeme ? ' ve "Ödeme (teklif kaydet + kredi kartı)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir ("Ödeme (teklif kaydet + kredi kartı)").'),
    ekranUrl: '/jet-satis/jet-kobi/',
    specDosyasi: 'tests/scenarios/jet-kobi-akis/jet-kobi-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-kobi-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: {
      ettirenFarkli: { aciklama: 'Sigorta ettiren sigortalıdan farklı', ifade: { alan: 'sigortaEttiren', esit: 'farkli' } },
      malSahibi: { aciklama: 'Sigortalı durumu mal sahibi (bina tipi, brüt yüzölçümü, DASK\'a bağlı yalnızca bunda)', ifade: { alan: 'sigortaliDurumu', esit: 'malSahibi' } },
      ...(s.odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testte her senaryoda).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
    },
    adimlar: [
      {
        id: 'sigortali', sira: 1, baslik: 'Sigortalı bilgileri girilir ve sorgulanır',
        bolumler: [{
          id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
            radyo('sigortaliTipi', 'Sigortalı tipi', [
              secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: '#CustomerType-O' }),
              secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: '#CustomerType-T' })
            ]),
            telefon('sigortaliTelefonKodu', 'Cep telefonu alan kodu (3 hane)', '#TelefonKodu'),
            telefon('sigortaliTelefonNo', 'Cep telefonu numarası (7 hane)', '#Telefonu'),
            kimlikBlogu('sigortaliKimlik', 'Sigortalı kimliği', 'sigortali', 'sigortaliTipi',
              { dogum: '#BirthDate', no: '#IdentityNumber', sorgu: 'INSURED', detay: '#IdentityDetail' }, null, h)
          ]
        }]
      },
      {
        id: 'sigortaEttiren', sira: 2, baslik: 'Sigorta ettiren seçimi yapılır',
        bolumler: [{
          id: 'sigortaEttirenBolumu', baslik: 'Sigorta ettiren', alanlar: [
            radyo('sigortaEttiren', 'Sigorta ettiren', evetHayir('DifferentClient', 'farkli', 'ayni', 'Farklı', 'Sigortalı ile aynı'), { varsayilan: { deger: 'ayni' } }),
            radyo('sigortaEttirenTipi', 'Sigorta ettiren tipi', [
              secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: '#ClientType-O' }),
              secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: '#ClientType-T' })
            ], { gorunurluk: { kosul: 'ettirenFarkli' } }),
            telefon('sigortaEttirenTelefonKodu', 'Sigorta ettiren cep telefonu alan kodu', '#ClientTelefonKodu', { gorunurluk: { kosul: 'ettirenFarkli' } }),
            telefon('sigortaEttirenTelefonNo', 'Sigorta ettiren cep telefonu numarası', '#ClientTelefonu', { gorunurluk: { kosul: 'ettirenFarkli' } }),
            kimlikBlogu('sigortaEttirenKimlik', 'Sigorta ettiren kimliği', 'sigortaEttiren', 'sigortaEttirenTipi',
              { dogum: '#ClientBirthDate', no: '#ClientIdentityNumber', sorgu: 'CLIENT', detay: '#ClientIdentityDetail' }, 'ettirenFarkli', h)
          ]
        }]
      },
      {
        id: 'rizikoPolice', sira: 3, baslik: 'Riziko ve poliçe bilgileri girilir',
        bolumler: [
          {
            id: 'adres', baslik: 'Riziko adresi', alanlar: [
              // UAVT adres kodu: yazılır, sorgulanır; #DR "-1" dışında bir değer alana kadar beklenir (POM: 20 sn).
              alan('adresKodu', 'metin', 'Adres kodu (UAVT)', '#AK', {
                zorunlu: true, doldurucuParametreleri: { tikla: '#RefreshUAVT', bekle: { secici: '#DR', durum: 'dolu', icermez: '-1', zamanAsimiSn: 20 } }
              })
            ]
          },
          {
            id: 'police', baslik: 'Poliçe', alanlar: [
              // Tarih betikle yazılır (perde engellemez); ardından sorgunun yükleme perdesi (blockUI) kalkana kadar beklenir —
              // POM: perde kalkmadan radyolara basılmaz. (Adım aksiyonundaki öğe beklemesi diyagramda taşınmadığı için burada.)
              {
                ...alan('baslangicTarihi', 'tarih', 'Başlangıç tarihi', '#BeginDate', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {},
                doldurucuParametreleri: { bekle: { secici: '.blockUI.blockOverlay', durum: 'gizli', zamanAsimiSn: 20 } }
              },
              radyo('sigortaliDurumu', 'Sigortalı durumu', evetHayir('IsOwner', 'malSahibi', 'kiraci', 'Mal sahibi', 'Kiracı'))
            ]
          },
          {
            id: 'bina', baslik: 'Bina (mal sahibi)', alanlar: [
              jqListe('binaTipi', 'Bina tipi', 'BuildingType', { gorunurluk: { kosul: 'malSahibi' } }),
              alan('brutYuzolcum', 'sayi', 'Brüt yüzölçümü (m²)', '#GrossAreaM2', { zorunlu: true, gorunurluk: { kosul: 'malSahibi' } }),
              radyo('daskaBagli', 'DASK\'a bağlı', evetHayir('IsDASKDepended', 'evet', 'hayir', 'Evet', 'Hayır'), { gorunurluk: { kosul: 'malSahibi' } })
            ]
          },
          {
            id: 'riziko', baslik: 'Riziko', alanlar: [
              radyo('dainiMurtehin', 'Dain-i mürtehin', evetHayir('IsHaveLossPayee', 'var', 'yok', 'Var', 'Yok')),
              // İşçi sayısı tuşlanır, Tab'la çıkılır; yıllık brüt işçilik ücreti kendiliğinden dolar (POM).
              alan('isciSayisi', 'sayi', 'İşçi sayısı', '#numberOfWorkers', {
                zorunlu: true, doldurucu: 'tuslayarakYaz', doldurucuParametreleri: { tus: 'Tab', bekle: { secici: '#YearLaborWage', durum: 'dolu', zamanAsimiSn: 15 } }
              }),
              jqListe('isverenMaliMesuliyeti', 'İşveren mali mesuliyeti', 'EmployerLiability'),
              jqListe('ucuncuSahisMaliMesuliyeti', 'Üçüncü şahıs mali mesuliyeti', 'ThirdPartyFinancialLiability'),
              jqListe('yapiTarzi', 'Yapı tarzı', 'ConstructionType'),
              // İştigal cinsleri tipe göre sonradan yüklenir: ilk gerçek seçenek gelene kadar beklenir (POM: 15 sn).
              jqListe('istigalTipi', 'İştigal tipi', 'IstigalTipi', {
                doldurucuParametreleri: { bekle: { secici: '#IstigalCinsi option:not([value=""]):not([value="-1"])', durum: 'dolu', zamanAsimiSn: 15 } }
              }),
              jqListe('istigalCinsi', 'İştigal cinsi', 'IstigalCinsi'),
              jqListe('toplamKat', 'Toplam kat', 'TotalFloor'),
              jqListe('rizikonunBulunduguKat', 'Rizikonun bulunduğu kat', 'RiskFloor'),
              jqListe('catiTipi', 'Çatı tipi', 'RoofType'),
              alan('binaInsaYili', 'sayi', 'Bina inşa yılı', '#BuildYear', { zorunlu: true }),
              jqListe('ferdiKazaTeminati', 'Ferdi kaza teminatı', 'PersonalAccident')
            ]
          },
          {
            id: 'rizikoIslemleri', baslik: 'İşlemler', alanlar: [
              { id: 'standartDugmesi', tip: 'buton', etiket: { ekran: 'Standart' }, yapilandirma: 'aksiyon', konum: { secici: '#btnStandart', kirilganlik: 'orta' } }
            ]
          }
        ],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#btnStandart', aciklama: 'Standart' }],
          basariGostergesi: { tur: 'eleman', deger: '#TeklifHesaplaButon' },
          zamanAsimiSn: 30
        }
      },
      {
        id: 'teminatEkrani', sira: 4, baslik: 'Teminat ekranı açılır',
        bolumler: [{ id: 'teminatEkraniIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'teminatEkraniDugmesi', tip: 'buton', etiket: { ekran: 'Teklif hesapla (teminatlara geç)' }, yapilandirma: 'aksiyon', konum: { secici: '#TeklifHesaplaButon', kirilganlik: 'orta' } }
        ] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#TeklifHesaplaButon', aciklama: 'Teklif hesapla (teminat ekranına geçer)' }],
          // POM: adres /jet-satis/jet-kobi/teminatlar olur ve #C1225 görünür (koşucu tek gösterge bekler: sonraki alan).
          basariGostergesi: { tur: 'eleman', deger: '#C1225' },
          zamanAsimiSn: 30
        }
      },
      {
        id: 'teklif', sira: 5, baslik: 'Teminatlar girilir ve teklif alınır',
        bolumler: [
          {
            id: 'teminatlar', baslik: 'Teminatlar', alanlar: [
              teminat('binaYangin', 'Bina yangın', '#C1000'),
              teminat('sigortaliyaAitEmtea', 'Sigortalıya ait emtea', '#C1225'),
              teminat('ucuncuSahsaAitEmtea', 'Üçüncü şahsa ait emtea', '#C1230'),
              teminat('demirbas', 'Demirbaş', '#C1116'),
              teminat('makine', 'Makine', '#C1117'),
              teminat('kasa', 'Kasa', '#C1118'),
              teminat('dahiliDekorasyon', 'Dahili dekorasyon', '#C1089'),
              teminat('urunSorumluluk', 'Ürün sorumluluk', '#C3180'),
              teminat('isDurmasi', 'İş durması', '#C1119'),
              teminat('dekorasyonHirsizlik', 'Dekorasyon hırsızlık', '#C1147'),
              teminat('camKirilmasi', 'Cam kırılması', '#C1036'),
              alan('yanginVeGuvenlikOnlemleri', 'metin', 'Yangın ve güvenlik önlemleri', '#FireAndTheftPrecautionsinRisk', { zorunlu: true })
            ]
          },
          {
            id: 'teklifIslemleri', baslik: 'İşlemler', alanlar: [
              { id: 'teklifHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Teklif hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#TeklifHesaplaButon', kirilganlik: 'orta' } },
              { id: 'teklifKaydetGostergesi', tip: 'cikti', etiket: { ekran: 'Teklif Kaydet' }, yapilandirma: 'cikti', konum: { secici: '#TeklifKaydetButon', kirilganlik: 'orta' } }
            ]
          }
        ],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#TeklifHesaplaButon', aciklama: 'Teklif hesapla' }],
          // Başarı: "Teklif Kaydet" düğmesi görünür; hata: "JetKobi Hızlı Teklif Ekranı" başlıklı pencere (POM teklifAl, 45 sn).
          // Son adımdaki öğe göstergesi diyagramda taşınmadığı için düğmenin metniyle (görünmeyen öğenin metni okunmaz).
          basariGostergesi: { tur: 'metin', deger: 'Teklif Kaydet', secici: '#TeklifKaydetButon' },
          hataGostergesi: { secici: TEKLIF_HATA_PENCERESI },
          zamanAsimiSn: 45
        }
      },
      ...(s.odeme ? [{ id: 'odeme', sira: 6, baslik: 'Ödeme', gorunurluk: { kosul: 'odemeDahil' }, ortakAkis: { dosya: `${TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI}.model.json` } }] : [])
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
            { tip: 'basarili', anlam: 'Teklif alınır ("Teklif Kaydet" görünür).' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda, belirtilen mesajı içeren uyarı beklenir.',
              alanlar: {
                adim: { etiket: 'Hatanın beklendiği adım', secenekler: [{ deger: 'teklif', metin: 'Teminatlar ve teklif' }] },
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
      ...(s.odeme ? [] : ['Ödeme (teklif kaydet + kredi kartı) bu pakette yok; "Ödeme (teklif kaydet + kredi kartı)" ortak akışı akışa eklenebilir.']),
      'Mevcut "Ödeme (kredi kartı)" ortak akışı #Policelestir\'e basar; JetKOBİ "Teklif Kaydet" ile ödemeye geçer. Bu yüzden ilk adımı Teklif Kaydet olan ayrı bir ortak akış ("Ödeme (teklif kaydet + kredi kartı)") kullanılır; önce o yüklenmeli.',
      'Açılır listelerin (bina tipi, işveren / üçüncü şahıs mali mesuliyeti, yapı tarzı, iştigal tipi / cinsi, toplam kat, rizikonun bulunduğu kat, çatı tipi, ferdi kaza) seçenekleri kodda yok; TEST ekranından okunacak. Listeler jqTransform: senaryoya GÖRÜNEN METİN yazılır (kodlu verideki "metin"); koşucu açma düğmesine basıp o metni sayfada arar.',
      'jqTransform seçimi: koşucu seçeneği sayfanın tamamında "tam metin" ile arar; başka bir listenin seçili değeri aynı metni gösteriyorsa (ör. iki mesuliyet listesinde aynı tutar) yanlış öğeye basabilir. TEST\'te doğrulanmalı. POM\'un gizli <select>\'e betikle değer yazma yedeği koşucuda yok.',
      'Cep telefonu iki alanda (#TelefonKodu: ilk 3 hane, #Telefonu: kalanı). Koşucu kimlik profilindeki "cepTelefonu"nu bölemediği için telefon senaryoda iki ayrı alanla girilir (profilden gelmez).',
      'Kimlik sorgusunun başarısı: POM sonuç kutusunun görünür olmasını VE "Sigortalı" / "Sigorta Ettiren" başlığı dışında metin içermesini bekler; koşucu yalnızca kutunun görünmesini bekler. Kutu sorgudan önce görünüyorsa bekleme erken biter — TEST\'te doğrulanmalı.',
      'Kimlik sorgusu hataları (POM: "bulunamadı / hata oluştu / geçersiz / zorunlu…" içeren uyarı, pencere, fancybox) koşucuda hata göstergesi değil: sorgu başarısız olursa sonuç kutusu gelmez ve adım zaman aşımıyla (20 sn) düşer.',
      'UAVT: #DR\'nin "-1" dışında değer alması "-1" içermez koşuluyla beklenir (#DR\'nin türü / değer biçimi bilinmiyor).',
      'Teklif başarısı #TeklifKaydetButon\'un "Teklif Kaydet" metniyle beklenir (POM: düğme görünür). Düğme <input> ise metni boş okunur ve adım zaman aşımıyla düşer: o durumda "öğe görünür" göstergesine dönülmeli (bu, son adımda diyagramda taşınmıyor).',
      'Teklif hata penceresi seçicisi POM\'dan ("JetKobi Hızlı Teklif Ekranı" başlığının iki üst öğesi); başka hata biçimleri bilinmiyor.',
      'Koddaki testte olup burada olmayan: işçi sayısının ve iştigal cinsinin son değer denetimi, teminat tutarlarının (sigortalıya ait emtea, cam kırılması) rakam denetimi, telefon alanlarının değer denetimi, teminat ekranı adres (URL) denetimi (yalnızca #C1225 beklenir), açık takvimin (#ui-datepicker-div) kapatılması.',
      'Sigortalı ya da sigorta ettiren için yabancı kimlik / pasaport seçeneği kodlu testte yok; ekranda olup olmadığı bilinmiyor.'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-kobi-akis', ad: 'JetKOBİ (akış)', urlYolu: '/jet-satis/jet-kobi/' },
      olusturan: 'Claude Code (koddan: teklif-matrisi.spec.ts + jet-kobi.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetKOBİ teklif akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetKOBİ ekranını değiştirmez.'
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
