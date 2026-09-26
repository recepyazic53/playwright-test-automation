// ÖDEME (KREDİ KARTI) — ORTAK AKIŞ. Kodlu testlerin ödeme POM'unun (tests/support/pages/kredi-karti-odeme.page.ts) model
// koşucusu karşılığı: ekran akışlarına "+ > Ortak akış" ile eklenir (ör. JetSeyahat (akış) > prim hesaplandıktan sonra), koşuda
// oraya açılır. Yalnızca test ortamında koşar (canlıda atlanır: gerçek ödeme yapılmaz).
// Adımlar: Poliçeleştir → kart formunu aç → kart bilgileri + "Ödemeyi tamamla". Kart, Ayarlar > Test verisi profilleri >
// "Kredi kartı" profilinden (varsayılan "ortak"; koşu anında çözülür, arayüze gelmez) ya da senaryoya özel karttan gelir.
// Başarı (TEST): kodlu testlerin kabul ettiği ödeme sonucu ("Hiçbir poliçe onaylanamadı." — test kartıyla poliçe kesilmez).
// NOT: import.meta KULLANILMAZ.

export const ODEME_AKIS_ANAHTARI = 'odeme-kredi-karti-akis';
// Kodlu testlerin TEST ortamında kabul ettiği ödeme sonuçları (ürün verisi > kabulEdilenOdemeSonuclari; ortak veri > kredi
// kartı > beklenen hata mesajı) — test kartıyla poliçe kesilmez. Ortak akışın "veya" başarı mesajlarıdır (içerir eşleşmesi;
// en çok 5). Kullanıcı kararı (2026-09-26): ürünlerin kabul ettiği sonuçlar, o ürünlerin kullandığı ortak akışa eklenir.
/** "Ödeme (kredi kartı)": JetSeyahat, JetDASK, JetKasko. */
export const KABUL_EDILEN_ODEME_SONUCLARI = ['Hiçbir poliçe onaylanamadı.', 'XML dodururken hata', 'mükerrer poliçe üretimi yapılamamaktadır', 'BRV-OVM-POLICE'];
/** "Ödeme (teklif kaydet + kredi kartı)": JetKOBİ, JetKonut, JetİlkAteşKonut. */
export const TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR = ['Hiçbir poliçe onaylanamadı.', 'XML dodururken hata', 'Bu adres kodu için genel müdürlüğe başvurunuz'];
/** "Ödeme (doğrudan kart formu)": JetSağlık, JetDASK. */
export const DOGRUDAN_KART_KABUL_EDILEN_SONUCLAR = ['Hiçbir poliçe onaylanamadı.', 'XML dodururken hata', 'mükerrer poliçe üretimi yapılamamaktadır'];
/** Kabul edilen sonuçlar → başarı göstergesi (tek mesaj ya da "veya"). @param {string[]} l */
const odemeSonucuGostergesi = (l) => (l.length > 1 ? { tur: 'veya', secenekler: l.map((deger) => ({ tur: 'metin', deger })) } : { tur: 'metin', deger: l[0] });
/**
 * Galaksi hata penceresi ("Tamam" düğmeli): fancybox / jQuery UI ya da #dialog > #dialogcontainer (JetDASK; ödemede çıkan iş kuralı
 * uyarıları — ör. "… numaralı teklif onaylanamadı …" — burada: görünür görünmez adım mesajıyla düşer, 90 sn beklenmez).
 */
const HATA_PENCERESI = '#fancybox-wrap:has(a:text-is("Tamam")), .ui-dialog:has(a:text-is("Tamam")), #dialogcontainer';

const kartAlani = (id, sira, kimlikAlani, etiket, secici, ek = {}) => ({
  id, tip: 'metin', sira, etiket: { ekran: etiket }, eslesme: { kimlikAlani }, konum: { secici, kirilganlik: 'dusuk' }, ...ek
});

/**
 * @param {{ kartHavuzu?: string; olusturulma?: string; kabulEdilenSonuclar?: string[] }} [s] kartHavuzu: kart profillerinin test
 *   verisi türü (Galaksi: "Kredi kartı"); kabulEdilenSonuclar: ödeme adımının başarı mesajları (varsayılan KABUL_EDILEN_ODEME_SONUCLARI).
 */
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
          basariGostergesi: odemeSonucuGostergesi(s.kabulEdilenSonuclar ?? KABUL_EDILEN_ODEME_SONUCLARI),
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

// ---- "Ödeme (teklif kaydet + kredi kartı)" — ödemeye "Teklif Kaydet" ile geçen ürünler (JetKonut, JetİlkAteşKonut, JetKOBİ) ----

export const TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI = 'odeme-teklif-kaydet-akis';
/** POM: getByRole('button', { name: 'Teklif Kaydet', exact: true }).or('#TeklifKaydetButon'). */
export const TEKLIF_KAYDET_SECICISI = 'internal:role=button[name="Teklif Kaydet"s] >> internal:or="#TeklifKaydetButon"';

/**
 * "Teklif Kaydet" ile ödemeye geçen ürünlerin (JetKonut, JetİlkAteşKonut; kodda JetKOBİ de) ödeme ortak akışı. Kart formu ve
 * ödeme adımları "Ödeme (kredi kartı)" ortak akışından (odeme-akis.mjs) kopyalanır; yalnızca ilk adım farklıdır.
 * @param {{ kartHavuzu?: string; olusturulma?: string }} [s]
 */
export function teklifKaydetOdemeAkisPaketi(s = {}) {
  const temel = odemeAkisPaketi({ kabulEdilenSonuclar: TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR, ...s });
  /** @type {any} */
  const kaynak = JSON.parse(JSON.stringify(temel.model));
  const [policelestir, ...kalan] = kaynak.adimlar;
  const teklifKaydet = {
    id: 'teklifKaydet', sira: 1, baslik: 'Teklif kaydedilir',
    bolumler: [{ id: 'teklifKaydetIslemleri', baslik: 'İşlemler', alanlar: [
      { id: 'teklifKaydetDugmesi', tip: 'buton', etiket: { ekran: 'Teklif Kaydet' }, yapilandirma: 'aksiyon', konum: { secici: TEKLIF_KAYDET_SECICISI, kirilganlik: 'orta' } }
    ] }],
    // Başarı ve hata göstergeleri "Poliçeleştir" adımıyla aynı (kredi kartı seçeneği ya da kart formu; "Tamam"lı hata penceresi).
    kosu: { ...policelestir.kosu, aksiyonlar: [{ tur: 'tikla', secici: TEKLIF_KAYDET_SECICISI, aciklama: 'Teklif Kaydet' }] }
  };
  const model = {
    ...kaynak,
    id: TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, ad: 'Ödeme (teklif kaydet + kredi kartı)',
    aciklama: 'Teklif kaydetme ve kredi kartıyla ödeme (kodlu testlerin teklifKaydetVeKrediKartiFormunuAc + ödeme adımlarından). Ekran akışlarına ortak akış olarak eklenir; yalnızca test ortamında koşar.',
    adimlar: [teklifKaydet, ...kalan.map((/** @type {any} */ a, /** @type {number} */ i) => ({ ...a, sira: i + 2 }))],
    bilinmeyenler: [
      ...kaynak.bilinmeyenler,
      '"Ödeme (kredi kartı)" ortak akışının kopyasıdır (yalnızca ilk adım "Teklif Kaydet"); kart / ödeme adımları orada değişirse bu ortak akış paketi yeniden üretilmelidir.'
    ]
  };
  return {
    ...temel,
    meta: {
      ...temel.meta,
      ekran: { anahtar: TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, ad: model.ad },
      olusturan: 'Claude Code (koddan: kredi-karti-odeme.page.ts > teklifKaydetVeKrediKartiFormunuAc)',
      not: 'Ortak akış: "Teklif Kaydet" ile ödemeye geçen ekranların akışlarına eklenir; yalnızca test ortamında koşar.'
    },
    model,
    bilinmeyenler: [...model.bilinmeyenler]
  };
}

// ---- "Ödeme (doğrudan kart formu)" — "Poliçeleştir"den sonra kart formu DOĞRUDAN açılan ürünler (JetSağlık) ----

export const DOGRUDAN_KART_ODEME_AKIS_ANAHTARI = 'odeme-dogrudan-kart-akis';

/**
 * "Ödeme (kredi kartı)" ortak akışının ara "KREDİ KARTI İLE POLİÇELEŞTİR" adımı olmayan hâli: Poliçeleştir → kart formu görünür →
 * kart bilgileri + "Ödemeyi tamamla" (JetSağlık POM'u: policelestirVeKrediKartiFormunuAc kart formunu doğrudan bekler).
 * @param {{ kartHavuzu?: string; olusturulma?: string }} [s]
 */
export function dogrudanKartOdemeAkisPaketi(s = {}) {
  const temel = odemeAkisPaketi({ kabulEdilenSonuclar: DOGRUDAN_KART_KABUL_EDILEN_SONUCLAR, ...s });
  /** @type {any} */
  const kaynak = JSON.parse(JSON.stringify(temel.model));
  const [policelestir, kartFormu, ...kalan] = kaynak.adimlar;
  if (kartFormu.id !== 'kartFormu') throw new Error('odeme-akis: "Kart formu açılır" adımı beklenen yerde değil.');
  // Başarı: kart formu (ilk kart alanı) görünür; "Tamam"lı hata penceresi hata olarak kalır.
  policelestir.kosu = { ...policelestir.kosu, basariGostergesi: { tur: 'eleman', deger: '#isim' } };
  const model = {
    ...kaynak,
    id: DOGRUDAN_KART_ODEME_AKIS_ANAHTARI, ad: 'Ödeme (doğrudan kart formu)',
    aciklama: 'Poliçeleştirme ve kredi kartıyla ödeme; kart formu Poliçeleştir\'den sonra doğrudan açılır (ör. JetSağlık). Ekran akışlarına ortak akış olarak eklenir; yalnızca test ortamında koşar.',
    adimlar: [policelestir, ...kalan].map((/** @type {any} */ a, /** @type {number} */ i) => ({ ...a, sira: i + 1 })),
    bilinmeyenler: [
      ...kaynak.bilinmeyenler,
      '"Ödeme (kredi kartı)" ortak akışının kopyasıdır ("KREDİ KARTI İLE POLİÇELEŞTİR" adımı çıkarılmış); kart / ödeme adımları orada değişirse bu paket yeniden üretilmelidir.'
    ]
  };
  return {
    ...temel,
    meta: {
      ...temel.meta,
      ekran: { anahtar: DOGRUDAN_KART_ODEME_AKIS_ANAHTARI, ad: model.ad },
      olusturan: 'Claude Code (koddan: kredi-karti-odeme.page.ts; JetSağlık kart formu doğrudan açılır)',
      not: 'Ortak akış: Poliçeleştir\'den sonra kart formu doğrudan açılan ekranlar (ör. JetSağlık (akış)); yalnızca test ortamında koşar.'
    },
    model,
    bilinmeyenler: [...model.bilinmeyenler]
  };
}
