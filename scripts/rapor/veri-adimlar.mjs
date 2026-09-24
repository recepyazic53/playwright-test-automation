// Adım (test.step) bazlı başarı/başarısız istatistikleri.
import { kosuEtiketi } from './veri-siniflandirma.mjs';

// Adım (step) bazlı başarı/başarısız gezgini için: allure-playwright her test.step()
// çağrısını icerik.steps altında kaydeder. SADECE üst seviye (senaryo dosyalarımızda
// bizim açtığımız test.step() bloklarına karşılık gelen) adımlar sayılır — playwright.
// config.ts'deki `detail: true` ayarı yüzünden her fixture kurulumu ve her sayfa
// aksiyonu (Fill/Click/Navigate/Launch browser vb.) da otomatik olarak iç içe adım
// gibi kaydediliyor; bunların içine inmiyoruz (recursion yok), yoksa "Fill 'değer'"
// gibi anlamsız ve hatta hassas veri içerebilecek satırlar tabloyu doldurur.
// Ayrıca bilinen fixture/hook/otomatik-aksiyon adları ve boş (0/0) adımlar filtrelenir.
const ADIM_GURULTU_ADLARI = new Set([
  'Before Hooks',
  'After Hooks',
  'Launch browser',
  'Create context',
  'Create page',
  'Close context',
  'Navigate',
  'Click',
  'Screenshot'
]);

export function adimGurultuMu(ad) {
  if (ADIM_GURULTU_ADLARI.has(ad)) return true;
  // "Fixture X", "Fill 'değer'", "Attach ..." gibi Playwright/allure otomatik
  // enstrümantasyon adları — hepsi belirli bir önekle başlıyor.
  return /^(Fixture |Fill |Attach |Expect |Get by|Locator|Wait for)/.test(ad);
}

// icerik/zaman parametreleri; her adım geçişi/başarısızlığı için (dashboard'da
// adım satırına tıklanınca açılan detay/popup listesi için) tek tek KAYIT tutulur —
// sadece sayaç değil. Başarısız kayıtlarda mesaj + varsa ekran görüntüsü de eklenir.
// medya: medyaYollariOlustur() dönüşü (bkz. veri-okuma.mjs).
export function adimlariGezVeTopla(icerik, zaman, sayaclar, medya) {
  for (const adim of icerik.steps ?? []) {
    const ad = adim.name ?? 'İsimsiz adım';
    if (adimGurultuMu(ad)) continue;
    sayaclar[ad] ??= { basarili: 0, basarisiz: 0, kayitlar: [] };
    const basariliMi = adim.status === 'passed';
    const basarisizMi = adim.status === 'failed' || adim.status === 'broken';
    if (!basariliMi && !basarisizMi) continue; // 'skipped' vb. adım tablosuna dahil değil
    if (basariliMi) sayaclar[ad].basarili += 1;
    else sayaclar[ad].basarisiz += 1;
    sayaclar[ad].kayitlar.push({
      basarili: basariliMi,
      zaman,
      senaryoAdi: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
      mesaj: basarisizMi ? (adim.statusDetails?.message || icerik.statusDetails?.message || '') : '',
      ekranGoruntusu: basarisizMi ? medya.ekranGoruntusuYoluGetir(icerik) : null,
      video: basarisizMi ? medya.videoYoluGetir(icerik) : null
    });
    // Kasıtlı olarak adim.steps içine inilmiyor — bizim test.step() bloklarımız kendi
    // içlerinde iç içe adım açmıyor, alt seviyedeki her şey Playwright'ın otomatik
    // enstrümantasyonudur.
  }
}

const ADIM_LISTESI_LIMIT = 30; // ürün başına gösterilecek en fazla adım satırı

// Bazı ürünlerde adım bazlı özet tablosu, en çok başarısız olan adımı değil, gerçek
// ekran akışı sırasını takip etsin diye (kullanıcı tercihi) elle tanımlı bir sıralama
// listesi tutuluyor. Listede olmayan bir adım (örn. henüz yeniden yapılandırılmamış
// eski bir isim) listenin sonuna, en çok başarısız olan üstte kalacak şekilde eklenir.
const ADIM_SIRASI = {
  JetKasko: [
    'Özel sigortalı ve plaka bilgileri girilir',
    'Tüzel sigortalı ve plaka bilgileri girilir',
    'Sigorta ettiren farklı tüzel ve araç bilgisi girişi',
    'Sigorta ettiren farklı özel ve araç bilgisi girişi',
    'Sigorta ettiren kendisi ve araç bilgisi girişi',
    'Prim hesaplanır',
    'Ürün seçimi',
    'Poliçeleştirme süreci başlatılması',
    'Kart bilgileri girişi',
    'Ödeme gönderilir ve sonuç doğrulanır'
  ]
};

// Tüm ürünlerde ortak olan, ürüne özel bilgi taşımayan adımlar (giriş/acente
// değiştirme testBaslangiciniHazirla() içinden, tüm senaryolarda birebir aynı) —
// ürün bazlı "Adım bazlı başarı" tablosunda gösterilmez. Bu adımların hata durumu
// zaten üstteki genel Başarısız sayısına ve "Hata kalıpları" bölümüne yansır.
const ORTAK_ADIMLAR = new Set(['Sisteme giriş yapılır', 'Acente ve kullanıcı değiştirilir']);

// Ürün başına adım listesi. ADIM_SIRASI'nda tanımlı ürünlerde ekran akışı sırası
// kullanılır; diğer ürünlerde (henüz elle sıralama tanımlanmamış) en çok başarısız
// olan adım en üstte gösterilir. En fazla ADIM_LISTESI_LIMIT satır.
// urunAdimSayaclari: urun -> { [adımAdı]: { basarili, basarisiz, kayitlar } }
export function adimOzetiCikar(urunler, urunAdimSayaclari) {
  const adimOzeti = {};
  for (const urun of urunler) {
    const sayaclar = urunAdimSayaclari[urun] ?? {};
    const satirlar = Object.entries(sayaclar)
      .filter(([ad, s]) => !ORTAK_ADIMLAR.has(ad) && s.basarili + s.basarisiz > 0)
      .map(([ad, s]) => ({
        ad,
        basarili: s.basarili,
        basarisiz: s.basarisiz,
        toplam: s.basarili + s.basarisiz,
        // En yeni kayıt en üstte olacak şekilde sıralanır (detay popup'ında/listesinde
        // gösterilecek sıra budur).
        kayitlar: s.kayitlar
          .slice()
          .sort((a, b) => b.zaman - a.zaman)
          .map((k) => ({
            basarili: k.basarili,
            z: k.zaman, // istemci tarafında tarih aralığı filtresi için ham zaman damgası
            t: kosuEtiketi(k.zaman),
            ad: k.senaryoAdi,
            m: k.mesaj,
            g: k.ekranGoruntusu,
            v: k.video
          }))
      }));

    const sira = ADIM_SIRASI[urun];
    if (sira) {
      satirlar.sort((a, b) => {
        const aSira = sira.indexOf(a.ad);
        const bSira = sira.indexOf(b.ad);
        // Listede olmayan adımlar (-1) sona atılır, aralarında en çok başarısız üstte.
        if (aSira === -1 && bSira === -1) return b.basarisiz - a.basarisiz || b.toplam - a.toplam;
        if (aSira === -1) return 1;
        if (bSira === -1) return -1;
        return aSira - bSira;
      });
    } else {
      satirlar.sort((a, b) => b.basarisiz - a.basarisiz || b.toplam - a.toplam);
    }

    adimOzeti[urun] = satirlar.slice(0, ADIM_LISTESI_LIMIT);
  }
  return adimOzeti;
}
