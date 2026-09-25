// ÖDEME (KREDİ KARTI) — ORTAK AKIŞ. Kodlu testlerin ödeme POM'unun (tests/support/pages/kredi-karti-odeme.page.ts) model
// koşucusu karşılığı: ekran akışlarına "+ > Ortak akış" ile eklenir (ör. JetSeyahat (akış) > prim hesaplandıktan sonra), koşuda
// oraya açılır. Yalnızca test ortamında koşar (canlıda atlanır: gerçek ödeme yapılmaz).
// Adımlar: Poliçeleştir → kart formunu aç → kart bilgileri + "Ödemeyi tamamla". Kart, Ayarlar > Test verisi profilleri >
// "Kredi kartı" profilinden (varsayılan "ortak"; koşu anında çözülür, arayüze gelmez) ya da senaryoya özel karttan gelir.
// Başarı (TEST): kodlu testlerin kabul ettiği ödeme sonucu ("Hiçbir poliçe onaylanamadı." — test kartıyla poliçe kesilmez).
// NOT: import.meta KULLANILMAZ.

export const ODEME_AKIS_ANAHTARI = 'odeme-kredi-karti-akis';
/** Kodlu testlerin TEST ortamında kabul ettiği ödeme sonucu (jet-seyahat > kabulEdilenOdemeSonuclari). */
export const KABUL_EDILEN_ODEME_SONUCLARI = ['Hiçbir poliçe onaylanamadı.'];
/** Galaksi hata penceresi (fancybox / jQuery UI; "Tamam" düğmeli). */
const HATA_PENCERESI = '#fancybox-wrap:has(a:text-is("Tamam")), .ui-dialog:has(a:text-is("Tamam"))';

const kartAlani = (id, sira, kimlikAlani, etiket, secici, ek = {}) => ({
  id, tip: 'metin', sira, etiket: { ekran: etiket }, eslesme: { kimlikAlani }, konum: { secici, kirilganlik: 'dusuk' }, ...ek
});

/** @param {{ kartHavuzu?: string; olusturulma?: string }} [s] kartHavuzu: kart profillerinin test verisi türü (Galaksi: "Kredi kartı"). */
export function odemeAkisPaketi(s = {}) {
  const havuz = s.kartHavuzu ?? 'Kredi kartı';
  const model = {
    semaSurumu: 2, tur: 'ortakAkis', id: ODEME_AKIS_ANAHTARI, ad: 'Ödeme (kredi kartı)',
    aciklama: 'Poliçeleştirme ve kredi kartıyla ödeme (kodlu testlerin ödeme adımlarından). Ekran akışlarına ortak akış olarak eklenir; yalnızca test ortamında koşar.',
    yalnizTestOrtami: true,
    kosullar: {},
    adimlar: [
      {
        id: 'policelestir', sira: 1, baslik: 'Poliçeleştirilir',
        bolumler: [{ id: 'policelestirIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'policelestirDugmesi', tip: 'buton', etiket: { ekran: 'Poliçeleştir' }, yapilandirma: 'aksiyon', konum: { secici: '#Policelestir', kirilganlik: 'orta' } }
        ] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#Policelestir', aciklama: 'Poliçeleştir' }],
          // Kredi kartı seçeneği (bağlantı) ya da doğrudan kart formu (bazı ürünler) açılır.
          basariGostergesi: { tur: 'veya', secenekler: [
            { tur: 'eleman', deger: 'internal:role=link[name="KREDİ KARTI İLE POLİÇELEŞTİR"i]' },
            { tur: 'eleman', deger: '#isim' }
          ] },
          hataGostergesi: { secici: HATA_PENCERESI },
          zamanAsimiSn: 15
        }
      },
      {
        id: 'kartFormu', sira: 2, baslik: 'Kart formu açılır',
        bolumler: [{ id: 'kartFormuIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'kartIlePolicelestir', tip: 'buton', etiket: { ekran: 'KREDİ KARTI İLE POLİÇELEŞTİR' }, yapilandirma: 'aksiyon', konum: { secici: 'internal:role=link[name="KREDİ KARTI İLE POLİÇELEŞTİR"i]', kirilganlik: 'orta' } }
        ] }],
        kosu: {
          // Pencerenin açılış animasyonu bitsin (POM: fancybox animasyonu beklenir).
          aksiyonlar: [{ tur: 'bekle', sureSn: 1 }, { tur: 'tikla', secici: 'internal:role=link[name="KREDİ KARTI İLE POLİÇELEŞTİR"i]', aciklama: 'KREDİ KARTI İLE POLİÇELEŞTİR' }],
          basariGostergesi: { tur: 'eleman', deger: '#isim' },
          hataGostergesi: { secici: HATA_PENCERESI },
          zamanAsimiSn: 15
        }
      },
      {
        id: 'odeme', sira: 3, baslik: 'Kart bilgileri girilir, ödeme tamamlanır',
        bolumler: [
          { id: 'kart', baslik: 'Kredi kartı', alanlar: [
            {
              id: 'krediKarti', tip: 'kimlikProfili', kimlikTuru: 'kart', etiket: { ekran: null, form: 'Kredi kartı' }, zorunlu: false, yapilandirma: 'senaryo',
              eslesme: { senaryo: ['krediKarti', 'krediKartiProfili'], profilHavuzu: havuz }, varsayilan: { deger: 'ortak' },
              altAlanlar: [
                kartAlani('kartIsim', 1, 'isim', 'Kart üzerindeki isim', '#isim'),
                kartAlani('kartSoyisim', 2, 'soyisim', 'Kart üzerindeki soyisim', '#soyisim'),
                kartAlani('kartNo', 3, 'kartNo', 'Kart numarası', '#kartno', { doldurucu: 'tuslayarakYaz', hassas: true }),
                kartAlani('kartCvv', 4, 'guvenlikKodu', 'Güvenlik kodu (CVV)', '#cvv', { hassas: true }),
                kartAlani('kartAy', 5, 'sonKullanmaAyi', 'Son kullanma ayı', '#ay', { tip: 'secim' }),
                kartAlani('kartYil', 6, 'sonKullanmaYili', 'Son kullanma yılı', '#yil', { tip: 'secim' }),
                // Taksit bazı ürünlerde yok: görünmüyorsa atlanır.
                kartAlani('kartTaksit', 7, 'taksit', 'Taksit', '#taksit', { tip: 'secim' })
              ]
            }
          ] },
          { id: 'odemeIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'odemeyiTamamla', tip: 'buton', etiket: { ekran: 'Ödemeyi tamamla' }, yapilandirma: 'aksiyon', konum: { secici: 'internal:role=link[name="Ödemeyi tamamla"i]', kirilganlik: 'orta' } }
          ] }
        ],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: 'internal:role=link[name="Ödemeyi tamamla"i]', aciklama: 'Ödemeyi tamamla' }],
          // TEST'te kabul edilen sonuç (tarayıcı uyarısı ya da pencerede): koşucu ikisini de okur.
          basariGostergesi: KABUL_EDILEN_ODEME_SONUCLARI.length > 1
            ? { tur: 'veya', secenekler: KABUL_EDILEN_ODEME_SONUCLARI.map((deger) => ({ tur: 'metin', deger })) }
            : { tur: 'metin', deger: KABUL_EDILEN_ODEME_SONUCLARI[0] },
          hataGostergesi: { secici: HATA_PENCERESI },
          zamanAsimiSn: 90
        }
      }
    ],
    senaryoDuzeyi: { alanlar: [] },
    urunDuzeyi: {},
    isKurallari: [],
    bilinmeyenler: [
      'Başarı mesajı TEST ortamı içindir (test kartıyla poliçe kesilmez); gerçek poliçe numarasının göründüğü sonuç bilinmiyor.',
      '3D Secure adımı yok (kodlu testlerde de yok).',
      'Hata penceresi seçicisi POM\'dan ("Tamam" düğmeli fancybox / jQuery UI penceresi).'
    ]
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: {
      ekran: { anahtar: ODEME_AKIS_ANAHTARI, ad: 'Ödeme (kredi kartı)' },
      olusturan: 'Claude Code (koddan: kredi-karti-odeme.page.ts)', olusturulma: s.olusturulma ?? new Date().toISOString(), baglamProfilleri: [],
      not: 'Ortak akış: ekran akışlarına "+ > Ortak akış" ile eklenir; yalnızca test ortamında koşar.'
    },
    model,
    senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: true, ikiAsamaliDogrulama: 'bilinmiyor', captchaGoruldu: false, testVerisiTurleri: [havuz] },
    bilinmeyenler: [...model.bilinmeyenler]
  };
}
