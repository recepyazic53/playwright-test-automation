// JETİLKATEŞKONUT (AKIŞ) — koddaki Jet İlk Ateş Konut teklif akışının (tests/scenarios/jet-ilk-ates-konut/teklif-matrisi.spec.ts
// + tests/support/pages/jet-ilk-ates-konut.page.ts) MODEL KOŞUCUSUYLA koşan sayfa paketi. Mevcut "JetİlkAteşKonut" ekranı ve
// kodlu testleri DEĞİŞMEZ: paket Nöbetçi'de ayrı, yeni bir ekran ("JetİlkAteşKonut (akış)") olarak yüklenir.
//
// 1. aşama (KODDAN; TEST ekranı henüz okunmadı): sigortalı (özel / tüzel; telefon kodu + numarası → kimlik profili: doğum
// tarihi → T.C. / VKN + sorgu), sigorta ettiren (aynı / farklı özel / farklı tüzel), adres (UAVT kodu + sorgu), poliçe
// bilgileri (mal sahibi / kiracı, alternatif, yapı tarzı, inşa yılı), "Standart" ile teklif (sayfada "Prim … ₺") ve isteğe
// bağlı ödeme. Sigortalı / ettiren / adres adımları ve ödeme JetKonut (akış) ile ortak (jetkonut-akis.mjs): ödeme
// "Teklif Kaydet" ile başlar, bu yüzden "Ödeme (teklif kaydet + kredi kartı)" ortak akışını kullanır.
// Açılır listelerin seçenekleri kodda yok (değerler şifreli test verisinde): "bilinmiyor" — 2. aşamada TEST ekranından okunacak.
// Çıktı: node scripts/jetilkateskonut-akis-paketi.mjs → "Claude outputs/jetilkateskonut-akis.paket.json" (+ ödeme ortak akışı).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirebilir).

import {
  JETKONUT_HAVUZLARI, adresAdimi, baslangicTarihi, gizliListeSecicisi, kisiAdimlari, odemeAdimi, ortakKosullar, senaryoDuzeyiAlanlari, sigortaliDurumu
} from './jetkonut-akis.mjs';

/** Galaksi aktarımının profil havuzları (projeler/galaksi/aktarim.mjs > profilHavuzlari). */
export const JETILKATESKONUT_HAVUZLARI = JETKONUT_HAVUZLARI;

/**
 * POM'un teklif hata izlemesindeki pencere seçicileri (görünür ve metni olan her biri hata sayılır). POM ayrıca sayfadaki
 * "bulunamadı / hata oluştu / başarısız / geçersiz / zorunlu …" metinlerini de hata sayıyordu (koşucuda karşılığı yok).
 */
const HATA_PENCERELERI = '[role="alert"], .alert-danger, .validation-summary-errors, .field-validation-error, .toast-error, .ui-dialog, .bootbox, .sweet-alert, .swal2-popup, .modal';
/** POM: sayfanın görünen metninde /Prim\s+[\d.,]+\s*₺/i. */
const PRIM_DESENI = '[Pp][Rr][İIiı][Mm]\\s+[\\d.,]+\\s*₺';

const alan = (id, tip, etiket, secici, ek = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, ...ek
});
/**
 * Gizli (jqTransform) <select>: kodlu test gibi değer betikle yazılır + change (degerJs; görünen listeye tıklanmaz — "1" gibi kısa
 * metinler sayfada başka öğelerle karışabiliyordu). Seçenekler TEST ekranından (2026-09-26), not olarak
 * (seceneklerKaynagi); listeye kısıtlanmaz, taşınan senaryolardaki görünen metinler geçerli kalsın (degerJs önce değer, sonra metin).
 */
const liste = (id, etiket, selectId, secenekler) => alan(id, 'secim', etiket, `#${selectId}`, {
  zorunlu: true, mutlakaGorunmeli: true, doldurucu: 'degerJs', secenekler: null, seceneklerDurumu: 'bilinmiyor',
  seceneklerKaynagi: `TEST ekranı (2026-09-26): ${secenekler.map(([d, m]) => `${d}=${m}`).join(', ')}`
});

/**
 * @param {{ havuzlar?: { ozel: string; tuzel: string; acente: string }; girissiz?: boolean; olusturulma?: string; odeme?: boolean }} [s]
 *   odeme: teklif alındıktan sonra "Ödeme (teklif kaydet + kredi kartı)" ortak akışı (projede önce o yüklenmeli); senaryoda
 *   "“Ödeme” dahil" (kodlu testte her senaryo öder). girissiz: yalnızca yerel testlerde.
 */
export function jetIlkAtesKonutAkisPaketi(s = {}) {
  const h = s.havuzlar ?? JETILKATESKONUT_HAVUZLARI;
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'jet-ilk-ates-konut-akis', ad: 'JetİlkAteşKonut (akış)',
    aciklama: 'Jet İlk Ateş Konut teklif akışı (koddaki testten; model koşucusuyla koşar): sigortalı, sigorta ettiren, adres, poliçe bilgileri, teklif'
      + (s.odeme ? ' ve "Ödeme (teklif kaydet + kredi kartı)" ortak akışı.' : '. Ödeme "+ > Ortak akış" ile eklenebilir.'),
    ekranUrl: '/jet-satis/jet-fire/',
    specDosyasi: 'tests/scenarios/jet-ilk-ates-konut-akis/jet-ilk-ates-konut-akis.spec.ts',
    pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (jet-ilk-ates-konut-akis)' },
    ...(s.girissiz ? { girisGerekmez: true } : {}),
    kosullar: (({ malSahibi: _m, ...k }) => k)(ortakKosullar(Boolean(s.odeme))),
    adimlar: [
      ...kisiAdimlari(h),
      // POM: önce #IL, sonra #DR "-1" olmaktan çıkar; koşucu yalnızca sonuncuyu bekler.
      adresAdimi(3, '#DR'),
      {
        id: 'police', sira: 4, baslik: 'Poliçe bilgileri girilir',
        bolumler: [{
          id: 'policeBolumu', baslik: 'Poliçe bilgileri', alanlar: [
            baslangicTarihi(),
            sigortaliDurumu(),
            // Alternatif seçilince eşya yangın ve ek teminat bedelleri dolar (POM bunları test verisiyle karşılaştırıyordu).
            liste('alternatif', 'Alternatif', 'Alternative', [['1', '1'], ['2', '2']]),
            liste('yapiTarzi', 'Yapı tarzı', 'ConstructionType', [['1', 'TAM KAGİR']]),
            alan('binaInsaYili', 'sayi', 'Bina inşa yılı', '#BuildYear', { zorunlu: true })
          ]
        }]
      },
      {
        id: 'teklif', sira: 5, baslik: 'Teklif alınır',
        bolumler: [{
          id: 'teklifIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'standartDugmesi', tip: 'buton', etiket: { ekran: 'Standart' }, yapilandirma: 'aksiyon', konum: { secici: '#btnStandart', kirilganlik: 'orta' } }
          ]
        }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#btnStandart', aciklama: 'Standart' }],
          // Başarı: sayfada "Prim <tutar> ₺" (POM, 45 sn; sıfır tutar da kabul). Hata: POM'un izlediği pencereler.
          basariGostergesi: { tur: 'desen', deger: PRIM_DESENI },
          hataGostergesi: { secici: HATA_PENCERELERI },
          zamanAsimiSn: 45
        }
      },
      ...(s.odeme ? [odemeAdimi(6)] : [])
    ],
    senaryoDuzeyi: {
      alanlar: senaryoDuzeyiAlanlari(h, Boolean(s.odeme), [{ deger: 'teklif', metin: 'Teklif alınır' }], 'Teklif hesaplanır, sayfada "Prim … ₺" görünür.')
    },
    urunDuzeyi: {},
    isKurallari: [],
    bilinmeyenler: [
      ...(s.odeme ? [] : ['Ödeme (teklif kaydet + kredi kartı) bu pakette yok; "Ödeme (teklif kaydet + kredi kartı)" ortak akışı akışa eklenebilir.']),
      'Açılır listelerin seçenekleri (alternatif, yapı tarzı) kodda yok; TEST ekranından okunacak.',
      'Listeler POM\'da gizli <select> (değer betikle atanıyordu). Seçici görünür <select>\'i, yoksa jqTransform açıcısını bulur (seçenek görünen metniyle seçilir); ikisi de yoksa alan "mutlaka görünmeli" olduğu için adım düşer — koşucuda gizli listeyi betikle seçen doldurucu yok.',
      'Cep telefonu ekranda kod (ilk 3 hane) + numara (son 7 hane) diye iki alan; hazır kimlik profilindeki tek parça telefon bölünemediği için senaryoda ayrı alanlar olarak girilir.',
      'Doğum tarihi betikle yazılır (tarihJs); POM tuşlayarak yazıp Tab + Escape basıyordu (maske / takvim). TEST\'te doğrulanmalı.',
      'Kimlik sorgusunda yalnızca detay kutusunun görünmesi beklenir; POM ayrıca sayfadaki hata metinlerini (bulunamadı / geçersiz / zorunlu …) izliyordu — koşucuda yok, hata olursa zaman aşımıyla düşer.',
      'Adres sorgusunda yalnızca #DR beklenir ("-1" olmaktan çıkana kadar); POM önce #IL\'yi de bekliyordu.',
      'Teklif hatası: POM\'un pencere seçicileri hata göstergesi; POM\'un metin desenine göre (pencere dışı) hata yakalaması koşucuda yok.',
      'Koddaki testte olup burada olmayan: alternatif seçildikten sonra eşya yangın (#EsyaYangin) ve ek teminat (#EkTeminatlar) bedellerinin test verisiyle aynı olduğu denetimi.'
    ]
  };
  return {
    tur: 'sayfa-paketi',
    surum: 1,
    meta: {
      ekran: { anahtar: 'jet-ilk-ates-konut-akis', ad: 'JetİlkAteşKonut (akış)', urlYolu: '/jet-satis/jet-fire/' },
      olusturan: 'Claude Code (koddan: teklif-matrisi.spec.ts + jet-ilk-ates-konut.page.ts)',
      olusturulma: s.olusturulma ?? new Date().toISOString(),
      baglamProfilleri: [],
      not: 'Koddaki Jet İlk Ateş Konut teklif akışının model koşucusu karşılığı (1. aşama, koddan). Mevcut JetİlkAteşKonut ekranını değiştirmez.'
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
