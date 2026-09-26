// JETKONUT (AKIŞ) — koddaki JetKonut teklif akışının (tests/scenarios/jet-konut/teklif-matrisi.spec.ts +
// tests/support/pages/jet-konut.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetKonut" ekranı ve kodlu testleri
// DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetKonut (akış)") olarak yüklenir (Ekranlar > Sayfa ekle > Paket yükle).
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): sigortalı (özel / tüzel; telefon kodu + numarası → kimlik profili: doğum
// tarihi → T.C. / VKN + sorgu), sigorta ettiren (aynı / farklı özel / farklı tüzel; aynı sıra), adres (UAVT kodu + sorgu),
// riziko ve poliçe bilgileri (mal sahibi / kiracı; mal sahibinde brüt m² ve DASK'a bağlılık), "Standart" paket → "Sonraki
// Adım", teminatlar, teklif hesaplama ("Teklif Kaydet" görünür) ve isteğe bağlı ödeme.
// ÖDEME: JetKonut (ve JetİlkAteşKonut) "Poliçeleştir" (#Policelestir) yerine "Teklif Kaydet" ile ödemeye geçer (POM:
// teklifKaydetVeKrediKartiFormunuAc). Mevcut "Ödeme (kredi kartı)" ortak akışı #Policelestir'e bastığı için burada
// kullanılamaz; bu dosya ondan türetilen İKİNCİ bir ortak akış üretir: "Ödeme (teklif kaydet + kredi kartı)" — ilk adımı
// "Teklif Kaydet", kart formu ve ödeme adımları "Ödeme (kredi kartı)"yla aynı (yalnızca test ortamında koşar).
// Seçiciler ve sıra POM'dan. Açılır listelerin seçenekleri kodda yok (değerler şifreli test verisinde): "bilinmiyor" —
// 2. aşamada TEST ekranından okunacak. Listeler gizli (jqTransform) olabilir: seçici önce görünür <select>'i, yoksa
// jqTransform açıcısını bulur (koşucu açar ve seçeneği GÖRÜNEN METNİYLE seçer).
// Çıktı: node scripts/jetkonut-akis-paketi.mjs → "Claude outputs/jetkonut-akis.paket.json" ve
// "Claude outputs/odeme-teklif-kaydet-akis.paket.json" (git'e girmez).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, TEKLIF_KAYDET_SECICISI, teklifKaydetOdemeAkisPaketi } from './odeme-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETKONUT_HAVUZLARI = Object.freeze({
  ozel: 'ortak.kimlikBilgileri.ozel', tuzel: 'ortak.kimlikBilgileri.tuzel', acente: 'ortak.kullaniciDegistir'
});

// "Ödeme (teklif kaydet + kredi kartı)" ortak akışı odeme-akis.mjs'te (JetKOBİ ile ortak); geriye uyum için yeniden verilir.
export { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, TEKLIF_KAYDET_SECICISI, teklifKaydetOdemeAkisPaketi };

// ---- Yardımcılar -------------------------------------------------------------------------------------------------------

const secim = (deger, metin, ek = {}) => ({ deger, metin, ...ek });
const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/**
 * Seçenekleri henüz bilinmeyen, gizli olabilen (jqTransform) açılır liste. Seçici: görünür <select> (değer ya da metinle
 * seçilir) ya da jqTransform açıcısı (koşucu açar, seçeneği görünen metniyle seçer). İkisi de görünmezse "mutlaka görünmeli"
 * olduğu için adım düşer (sessizce atlanmaz).
 */
export const gizliListeSecicisi = (/** @type {string} */ id) => `#${id}, :has(> #${id}) a.jqTransformSelectOpen`;
const liste = (id, etiket, selectId, ek = {}) => alan(id, 'secim', etiket, gizliListeSecicisi(selectId), {
  zorunlu: true, mutlakaGorunmeli: true, secenekler: null, seceneklerDurumu: 'bilinmiyor', ...ek
});
/**
 * TEST ekranından seçenekleri okunan gizli (jqTransform) liste: POM gibi betikle yazılır (degerJs: önce değer, yoksa metin;
 * input/change tetiklenir). Taşınan senaryolarda metin değerler olduğu için doğrulama gevşek ("bilinmiyor") kalır; okunan
 * seçenekler seceneklerKaynagi notunda.
 */
const testListesi = (id, etiket, selectId, secenekler, ek = {}) => alan(id, 'secim', etiket, `#${selectId}`, {
  zorunlu: true, mutlakaGorunmeli: true, doldurucu: 'degerJs', secenekler: null, seceneklerDurumu: 'bilinmiyor',
  seceneklerKaynagi: `TEST ekranı (2026-09-26): ${secenekler.map(([d, m]) => `${d}=${m}`).join(', ')}`, ...ek
});
/**
 * Özel çizimli (gizli girdili) evet / hayır radyosu: #<ad>-E / #<ad>-H. evet / hayir: [senaryo değeri, görünen metin].
 * @param {string} id @param {string} etiket @param {string} ad @param {[string, string]} evet @param {[string, string]} hayir
 */
const evetHayir = (id, etiket, ad, evet = ['evet', 'Evet'], hayir = ['hayir', 'Hayır'], ek = {}) => alan(id, 'radyo', etiket, `#${ad}-E`, {
  zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam',
  secenekler: [
    secim('E', evet[1], { senaryoDegeri: evet[0], formMetni: evet[1], secici: `#${ad}-E` }),
    secim('H', hayir[1], { senaryoDegeri: hayir[0], formMetni: hayir[1], secici: `#${ad}-H` })
  ],
  ...ek
});
/** Kimlik tipi radyosu (özel / tüzel): #<ad>-O / #<ad>-T. */
const kimlikTipi = (id, etiket, ad, ek = {}) => alan(id, 'radyo', etiket, `#${ad}-O`, {
  etiket: { ekran: null, form: etiket }, zorunlu: true, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam',
  secenekler: [
    secim('O', 'Özel (T.C.)', { senaryoDegeri: 'ozel', formMetni: 'Özel (T.C.)', secici: `#${ad}-O` }),
    secim('T', 'Tüzel (VKN)', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel (VKN)', secici: `#${ad}-T` })
  ],
  ...ek
});
/**
 * Kimlik bloğu (özel / tüzel): doğum tarihi (özelde) → T.C. / VKN + sorgu bağlantısı; sonuç (detay kutusu) görünene kadar
 * beklenir (POM: 20 sn). Telefon kimlik bloğunda DEĞİL: ekran kod + numara diye iki alan ister (ayrı senaryo alanları).
 * @param {{ id: string; form: string; tipAlani: string; senaryo: string[]; havuz: { ozel: string; tuzel: string }; dogum: string; kimlikNo: string; sorgu: string; detay: string; ek?: object }} k
 */
export const kimlikBlogu = (k) => ({
  id: k.id, tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: k.tipAlani },
  etiket: { ekran: null, form: k.form }, zorunlu: true, yapilandirma: 'senaryo',
  eslesme: { senaryo: k.senaryo, profilHavuzu: { ozel: k.havuz.ozel, tuzel: k.havuz.tuzel } },
  altAlanlar: [
    { id: `${k.id}DogumTarihi`, tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 1, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi' } }, konum: { secici: k.dogum, kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
    {
      id: `${k.id}No`, tip: 'metin', sira: 2, etiket: { ekran: 'Kimlik no (T.C. / VKN)' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } },
      konum: { secici: k.kimlikNo, kirilganlik: 'orta' },
      doldurucuParametreleri: { tikla: k.sorgu, bekle: { secici: k.detay, durum: 'gorunur', zamanAsimiSn: 20 } }
    }
  ],
  ...(k.ek ?? {})
});
/** Sigortalı ve sigorta ettiren adımları (JetKonut ile JetİlkAteşKonut'ta aynı seçiciler). @param {{ ozel: string; tuzel: string }} h */
export function kisiAdimlari(h) {
  return [
    {
      id: 'sigortali', sira: 1, baslik: 'Sigortalı bilgileri girilir ve sorgulanır',
      bolumler: [{
        id: 'sigortaliBolumu', baslik: 'Sigortalı', alanlar: [
          kimlikTipi('sigortaliTipi', 'Sigortalı tipi', 'CustomerType'),
          // POM: telefonun ilk 3 hanesi koda, kalanı numaraya (profildeki cepTelefonu bölünemediği için ayrı alanlar).
          alan('sigortaliTelefonKodu', 'metin', 'Cep telefonu kodu (ilk 3 hane)', '#TelefonKodu', { zorunlu: true, hassas: true }),
          alan('sigortaliTelefonNo', 'metin', 'Cep telefonu numarası (son 7 hane)', '#Telefonu', { zorunlu: true, hassas: true }),
          kimlikBlogu({
            id: 'sigortaliKimlik', form: 'Sigortalı kimliği', tipAlani: 'sigortaliTipi', havuz: h,
            senaryo: ['sigortaliOzelKimligi', 'sigortaliTuzelKimligi', 'sigortaliProfili'],
            dogum: '#BirthDate', kimlikNo: '#IdentityNumber', sorgu: 'a[href="javascript:CheckIdentity(\'INSURED\')"]', detay: '#IdentityDetail'
          })
        ]
      }]
    },
    {
      id: 'ettiren', sira: 2, baslik: 'Sigorta ettiren seçimi yapılır',
      bolumler: [{
        id: 'ettirenBolumu', baslik: 'Sigorta ettiren', alanlar: [
          alan('sigortaEttiren', 'radyo', 'Sigorta ettiren', '#DifferentClient-H', {
            etiket: { ekran: null, form: 'Sigorta ettiren' }, zorunlu: false, doldurucu: 'radyoZorla', seceneklerDurumu: 'tam', varsayilan: { deger: 'ayni' },
            secenekler: [
              secim('H', 'Sigortalı ile aynı', { senaryoDegeri: 'ayni', formMetni: 'Sigortalı ile aynı', secici: '#DifferentClient-H' }),
              secim('E', 'Farklı', { senaryoDegeri: 'farkli', formMetni: 'Farklı', secici: '#DifferentClient-E' })
            ]
          }),
          kimlikTipi('ettirenTipi', 'Sigorta ettiren tipi', 'ClientType', { gorunurluk: { kosul: 'ettirenFarkli' } }),
          alan('ettirenTelefonKodu', 'metin', 'Sigorta ettiren cep telefonu kodu (ilk 3 hane)', '#ClientTelefonKodu', { zorunlu: true, hassas: true, gorunurluk: { kosul: 'ettirenFarkli' } }),
          alan('ettirenTelefonNo', 'metin', 'Sigorta ettiren cep telefonu numarası (son 7 hane)', '#ClientTelefonu', { zorunlu: true, hassas: true, gorunurluk: { kosul: 'ettirenFarkli' } }),
          kimlikBlogu({
            id: 'ettirenKimlik', form: 'Sigorta ettiren kimliği', tipAlani: 'ettirenTipi', havuz: h,
            senaryo: ['ettirenOzelKimligi', 'ettirenTuzelKimligi', 'ettirenProfili'],
            dogum: '#ClientBirthDate', kimlikNo: '#ClientIdentityNumber', sorgu: 'a[href="javascript:CheckIdentity(\'CLIENT\')"]', detay: '#ClientIdentityDetail',
            ek: { gorunurluk: { kosul: 'ettirenFarkli' } }
          })
        ]
      }]
    }
  ];
}
/**
 * UAVT adres adımı: kod yazılır, sorgulanır; seçici "-1" (boş seçim) olmaktan çıkana kadar beklenir (POM: 20 sn). Yükleme
 * örtüsünün (.blockUI) kalkması bir sonraki alanda (başlangıç tarihi) beklenir: öğeye bağlı adım beklemesi diyagramda
 * taşınmadığı için. @param {number} sira @param {string} bekleSecici
 */
export const adresAdimi = (sira, bekleSecici) => ({
  id: 'adres', sira, baslik: 'Adres kodu girilir ve sorgulanır',
  bolumler: [{
    id: 'adresBolumu', baslik: 'Adres', alanlar: [
      alan('adresKodu', 'metin', 'Adres kodu (UAVT)', '#AK', {
        zorunlu: true, doldurucuParametreleri: { tikla: '#RefreshUAVT', bekle: { secici: bekleSecici, durum: 'dolu', icermez: '-1', zamanAsimiSn: 20 } }
      })
    ]
  }]
});
/**
 * Poliçe başlangıcı (salt okunur; POM: betikle bugün). Ardından adres sorgusunun yükleme örtüsü kalkana kadar beklenir (POM:
 * 20 sn; POM örtüyü tarihten önce bekliyordu — tarih betikle yazıldığı için örtüden etkilenmez).
 */
export const baslangicTarihi = () => ({
  ...alan('baslangicTarihi', 'tarih', 'Başlangıç tarihi', '#BeginDate', {
    doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy', doldurucuParametreleri: { bekle: { secici: '.blockUI.blockOverlay', durum: 'gizli', zamanAsimiSn: 20 } }
  }),
  yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {}
});
/** Sigortalı durumu: mal sahibi (#IsOwner-E) / kiracı (#IsOwner-H). */
export const sigortaliDurumu = () => evetHayir('sigortaliDurumu', 'Sigortalı durumu', 'IsOwner', ['malSahibi', 'Mal sahibi'], ['kiraci', 'Kiracı'], { etiket: { ekran: null, form: 'Sigortalı durumu' } });
/** Senaryo düzeyi ortak alanlar (ödeme dahil, başlık, acente, beklenen sonuç). */
export function senaryoDuzeyiAlanlari(/** @type {{ acente: string }} */ h, /** @type {boolean} */ odeme, /** @type {Array<{ deger: string; metin: string }>} */ hataAdimlari, /** @type {string} */ basariAnlami) {
  return [
    ...(odeme ? [{ id: 'odemeAdimiDahil', tip: 'onayKutusu', etiket: { ekran: null, form: '“Ödeme” dahil' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'odemeAdimiDahil' } }] : []),
    { id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
    {
      id: 'acenteProfili', tip: 'secim', etiket: { ekran: null, form: 'Acente' }, zorunlu: false, yapilandirma: 'senaryo',
      eslesme: { senaryo: 'acenteProfili', profilHavuzu: h.acente }, varsayilan: { deger: 'varsayilan' }
    },
    {
      id: 'beklenenSonuc', tip: 'birlesim', etiket: { ekran: null, form: 'Beklenen sonuç' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
      varyantlar: [
        { tip: 'basarili', anlam: basariAnlami },
        {
          tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda, belirtilen mesajı içeren uyarı beklenir.',
          alanlar: {
            adim: { etiket: 'Hatanın beklendiği adım', secenekler: hataAdimlari },
            mesaj: { etiket: 'Beklenen mesaj', tip: 'metin', zorunlu: true }
          }
        }
      ]
    }
  ];
}
/** Ortak kosullar: farklı sigorta ettiren, mal sahibi, ödeme dahil. @param {boolean} odeme */
export const ortakKosullar = (odeme) => ({
  ettirenFarkli: { aciklama: 'Sigorta ettiren sigortalıdan farklı', ifade: { alan: 'sigortaEttiren', esit: 'farkli' } },
  malSahibi: { aciklama: 'Sigortalı mal sahibi', ifade: { alan: 'sigortaliDurumu', esit: 'malSahibi' } },
  ...(odeme ? { odemeDahil: { aciklama: '“Ödeme” senaryoda seçildiyse (kodlu testte her senaryoda).', ifade: { senaryoAyari: 'odemeAdimiDahil', esit: true } } } : {})
});
/** Ödeme ortak akışı adımı. @param {number} sira */
export const odemeAdimi = (sira) => ({ id: 'odeme', sira, baslik: 'Ödeme', gorunurluk: { kosul: 'odemeDahil' }, ortakAkis: { dosya: `${TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI}.model.json` } });

// ---- JetKonut (akış) ---------------------------------------------------------------------------------------------------

/** Teklif hatası penceresi (POM: "JetKonut Hızlı Teklif Ekranı" başlığının iki üst öğesi). */
const TEKLIF_HATA_PENCERESI = 'internal:text="JetKonut Hızlı Teklif Ekranı"s >> xpath=../..';
const onay = (id, etiket, secici) => alan(id, 'onayKutusu', etiket, secici, { zorunlu: false, doldurucu: 'onayKutusuZorla' });

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: teklif alındıktan sonra "Ödeme (teklif kaydet + kredi kartı)" ortak akışı (projede önce o yüklenmeli); senaryoda
 *   "“Ödeme” dahil" (kodlu testte her senaryo öder). girissiz: yalnızca yerel testlerde.
 */
export function jetKonutAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETKONUT_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-konut-akis', ad: 'JetKonut (akış)',
    aciklama: 'JetKonut teklif akışı (koddaki testten; model koşucusuyla koşar): sigortalı, sigorta ettiren, adres, riziko / poliçe bilgileri, teminatlar, teklif'
      + (s.odeme ? ' ve "Ödeme (teklif kaydet + kredi kartı)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir.'),
    ekranUrl: '/jet-satis/jet-konut/',
    specDosyasi: 'tests/scenarios/jet-konut-akis/jet-konut-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-konut-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: ortakKosullar(Boolean(s.odeme)),
    adimlar: [
      ...kisiAdimlari(h),
      adresAdimi(3, '#DR'),
      {
        id: 'riziko', sira: 4, baslik: 'Riziko ve poliçe bilgileri girilir',
        bolumler: [{
          id: 'rizikoBolumu', baslik: 'Riziko ve poliçe bilgileri', alanlar: [
            baslangicTarihi(),
            sigortaliDurumu(),
            testListesi('binaTipi', 'Bina tipi', 'BuildingType', [['9', 'APARTMAN DAİRESİ'], ['1', 'MÜSTAKİL BİNA']]),
            alan('brutYuzolcum', 'sayi', 'Brüt yüzölçümü (m²)', '#GrossAreaM2', { zorunlu: true, gorunurluk: { kosul: 'malSahibi' } }),
            evetHayir('daskaBagli', 'DASK\'a bağlı', 'IsDASKDepended', undefined, undefined, { gorunurluk: { kosul: 'malSahibi' } }),
            evetHayir('dainiMurtehin', 'Dain-i mürtehin', 'IsHaveLossPayee', ['var', 'Var'], ['yok', 'Yok']),
            testListesi('alternatifPlus', 'Alternatif plus', 'AlternativePlus', [['E', 'E'], ['H', 'H']]),
            testListesi('alternatif', 'Alternatif', 'Alternative', [['1', '1'], ['2', '2'], ['3', '3']]),
            testListesi('yapiTarzi', 'Yapı tarzı', 'ConstructionType', [['1', 'TAM KAGİR'], ['2', 'YIĞMA KAGİR'], ['3', 'ADİ KAGİR'], ['4', 'AHŞAP']]),
            // Kat sayısı seçilince bulunduğu kat listesi yenilenir (POM: yükleme örtüsü kalkana kadar beklenir).
            testListesi('toplamKat', 'Toplam kat sayısı', 'TotalFloor', [['1', '1-4 ARASI'], ['2', '5-7 ARASI'], ['3', '8 KAT VE ÜZERİ']], { doldurucuParametreleri: { bekle: { secici: '.blockUI.blockOverlay', durum: 'gizli', zamanAsimiSn: 20 } } }),
            testListesi('rizikonunBulunduguKat', 'Rizikonun bulunduğu kat', 'RiskFloor', [['1', 'ZEMİN ALTI / BODRUM'], ['2', 'ZEMİN / GİRİŞ'], ['3', '1.KAT'], ['4', '2.KAT VE ÜSTÜ'], ['5', 'EN ÜST KAT']]),
            testListesi('catiTipi', 'Çatı tipi', 'RoofType', [['1', 'AHŞAP ÜSTÜ KİREMİT'], ['2', 'BETONARME TERAS'], ['3', 'ÇELİK KONSTRÜKSİYON ÜZE.İZOLE'], ['4', 'ETERNİT'], ['5', 'DİĞER']]),
            evetHayir('altmisGundenFazlaBos', '60 günden fazla boş', 'BlankMoreThan60Days'),
            alan('binaInsaYili', 'sayi', 'Bina inşa yılı', '#BuildYear', { zorunlu: true })
          ]
        }]
      },
      {
        id: 'standartPaket', sira: 5, baslik: 'Standart paket seçilir, teminat adımına geçilir',
        bolumler: [{
          id: 'paketIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'standartDugmesi', tip: 'buton', etiket: { ekran: 'Standart' }, yapilandirma: 'aksiyon', konum: { secici: '#btnStandart', kirilganlik: 'orta' } },
            { id: 'sonrakiAdimDugmesi', tip: 'buton', etiket: { ekran: 'Sonraki Adım' }, yapilandirma: 'aksiyon', konum: { secici: '#TeklifHesaplaButon', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [
            { tur: 'tikla', secici: '#btnStandart', aciklama: 'Standart' },
            // Aynı düğme sonra "Teklif hesapla" olur; metinle süzme diyagramda taşınmadığı için yalnızca seçiciyle (görünene kadar beklenir).
            { tur: 'tikla', secici: '#TeklifHesaplaButon', aciklama: 'Sonraki Adım' }
          ],
          basariGostergesi: { tur: 'eleman', deger: '#C1008' },
          zamanAsimiSn: 30
        }
      },
      {
        id: 'teminatlar', sira: 6, baslik: 'Teminat bilgileri girilir',
        bolumler: [{
          id: 'teminatBolumu', baslik: 'Teminatlar', alanlar: [
            alan('binaYangin', 'sayi', 'Bina yangın bedeli', '#C1000', { zorunlu: true, gorunurluk: { kosul: 'malSahibi' } }),
            alan('esyaYangin', 'sayi', 'Eşya yangın bedeli', '#C1008', { zorunlu: true }),
            alan('dahiliDekorasyonYangin', 'sayi', 'Dahili dekorasyon yangın bedeli', '#C1089', { zorunlu: true }),
            alan('camKirilmasi', 'sayi', 'Cam kırılması bedeli', '#C1036', { zorunlu: true }),
            onay('esyaDeprem', 'Eşya deprem', '#C1016'),
            onay('dahiliDekorasyonDeprem', 'Dahili dekorasyon deprem', '#C1087'),
            onay('hirsizlik', 'Hırsızlık', '#C1090'),
            onay('binaSabitKiymetHirsizlik', 'Bina sabit kıymet hırsızlık', '#C1092'),
            liste('ferdiKazaTekLimit', 'Ferdi kaza tek limit', 'PersonalAccidentLimit'),
            liste('hukuksalKoruma', 'Hukuksal koruma', 'LegalProtection'),
            liste('enflasyonOrani', 'Enflasyon oranı', 'InflationRate')
          ]
        }]
      },
      {
        id: 'teklif', sira: 7, baslik: 'Teklif alınır',
        bolumler: [{
          id: 'teklifIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'teklifHesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Teklif hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#TeklifHesaplaButon', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#TeklifHesaplaButon', aciklama: 'Teklif hesapla' }],
          // Başarı: "Teklif Kaydet" görünür (POM, 45 sn) = sonraki adımın ilk alanı. Hata: "JetKonut Hızlı Teklif Ekranı" penceresi.
          basariGostergesi: { tur: 'eleman', deger: '#TeklifKaydetButon' },
          hataGostergesi: { secici: TEKLIF_HATA_PENCERESI },
          zamanAsimiSn: 45
        }
      },
      // Teklif sonucu: "Teklif Kaydet" düğmesi (çıktı; doldurulmaz). Son adımda öğe göstergesi diyagramda taşınmadığı için
      // başarı "sonraki adımın ilk alanı görünür" biçiminde bu adıma bağlanır (POM'daki denetimle aynı).
      {
        id: 'teklifSonucu', sira: 8, baslik: 'Teklif sonucu görünür',
        bolumler: [{
          id: 'teklifSonucuBolumu', baslik: 'Teklif sonucu', alanlar: [
            { id: 'teklifKaydetGorunur', tip: 'cikti', etiket: { ekran: 'Teklif Kaydet' }, yapilandirma: 'cikti', konum: { secici: '#TeklifKaydetButon', kirilganlik: 'orta' } }
          ]
        }]
      },
      ...(s.odeme ? [odemeAdimi(9)] : [])
    ],
    senaryoDuzeyi: {
      alanlar: senaryoDuzeyiAlanlari(h, Boolean(s.odeme), [{ deger: 'teklif', metin: 'Teklif alınır' }], 'Teklif hesaplanır, "Teklif Kaydet" görünür.')
    },
    urunDuzeyi: {},
    isKurallari: [],
    bilinmeyenler: [
      ...(s.odeme ? [] : ['Ödeme (teklif kaydet + kredi kartı) bu pakette yok; "Ödeme (teklif kaydet + kredi kartı)" ortak akışı akışa eklenebilir.']),
      'Açılır listelerin seçenekleri (bina tipi, alternatif plus, alternatif, yapı tarzı, toplam kat, bulunduğu kat, çatı tipi, ferdi kaza limiti, hukuksal koruma, enflasyon oranı) kodda yok; TEST ekranından okunacak.',
      'Listeler POM\'da gizli (jqTransform) <select>; seçici görünür <select>\'i, yoksa jqTransform açıcısını bulur. jqTransform yolunda seçenek GÖRÜNEN METNİYLE seçilir (senaryoda metin yazılmalı; sayfada aynı metinli başka görünür öğe varsa yanlış öğeye basılabilir). İkisi de yoksa alan "mutlaka görünmeli" olduğu için adım düşer.',
      'Cep telefonu ekranda kod (ilk 3 hane) + numara (son 7 hane) diye iki alan; hazır kimlik profilindeki tek parça telefon bölünemediği için senaryoda ayrı alanlar olarak girilir.',
      'Doğum tarihi betikle yazılır (tarihJs); POM tuşlayarak yazıp Tab + Escape basıyordu (maske / takvim). TEST\'te doğrulanmalı.',
      'Kimlik sorgusunda yalnızca detay kutusunun görünmesi beklenir; POM ayrıca başlık dışında metin olmasını ve sayfadaki hata metinlerini (bulunamadı / geçersiz / zorunlu …) izliyordu — bu hata izleme koşucuda yok, hata olursa zaman aşımıyla düşer.',
      'Adres sorgusunda #DR "-1" olmaktan çıkana kadar beklenir (değerde "-1" geçmediği varsayılır).',
      'Koddaki testte olup burada olmayan: bina tipinden sonra ve toplam kattan sonra seçimlerin korunduğu (#RiskFloor değeri) denetimi, "Sonraki Adım" düğme metni denetimi, onay kutularının son durum denetimi.'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-konut-akis', ad: 'JetKonut (akış)', urlYolu: '/jet-satis/jet-konut/' },
      olusturan: 'Claude Code (koddan: teklif-matrisi.spec.ts + jet-konut.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki JetKonut teklif akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetKonut ekranını değiştirmez.'
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
