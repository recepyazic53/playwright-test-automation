// TEK EKRAN test dashboard'u: ürün bazlı özet + "son koşu" hızlı bakış + ürüne
// tıklayınca açılan, tarih aralığı seçilebilen HATA KALIBI tablosu.
//
// Neden "hata kalıbı"? Aynı hata farklı testlerde farklı değişken değerlerle
// (teklif no, id, tarih vb.) çıkar — örn:
//   "250166487 numaralı teklif onaylanamadı..."
//   "250166488 numaralı teklif onaylanamadı..."
// Bu script mesajdaki değişken (sayısal) kısımları "#" ile değiştirip sabit
// KALIBI çıkarır (örn. "# numaralı teklif onaylanamadı...") ve aynı kalıba
// düşen tüm hataları tek satırda toplayıp sayar. Ürüne tıklayıp iki tarih
// seçtiğinizde, o aralıkta hangi kalıptan kaç adet geldiğini gösterir.
//
// allure-results-<ortam>/ klasörü hiç temizlenmediği için (bkz. allure-history-sync.mjs
// ve README) içinde geçmişteki TÜM koşuların ham sonuç dosyaları birikir. Bu script
// o dosyaların tamamını okuyup tek bir HTML sayfasına gömer; tarih aralığı filtresi
// sayfa açıldıktan sonra JavaScript ile anlık çalışır — yeniden komut çalıştırmaya
// gerek kalmaz.
//
// Tek çıktı üretir: dashboard-<ortam>.html
// (npm run rapor:test / rapor:canli ile üretilip tarayıcıda otomatik açılır.
//  Allure raporu artık zorunlu ikinci ekran değil; sadece adım adım/trace
//  incelemek isterseniz diye dashboard'daki küçük bilgi notunda anılır.)
//
// Kullanım:
//   node scripts/urun-hata-raporu.mjs test
//   node scripts/urun-hata-raporu.mjs canli
// (veya npm run hata:ozet:test / npm run hata:ozet:canli / npm run rapor:test / rapor:canli)
//
// Yapı: bu dosya yalnızca giriş noktasıdır (argüman, akış, dosya yazma). Veri işleme
// scripts/rapor/veri-*.mjs'de; HTML iskeleti rapor/dashboard-html.mjs, stil
// rapor/dashboard-stil.css, tarayıcı betiği rapor/dashboard-istemci.js'dedir.
// Kategori tanımları (rapor/veri-siniflandirma.mjs) playwright.config.ts'teki
// allure-playwright "categories" listesiyle aynı mantığı kullanır; ikisini birlikte güncelleyin.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenGetirYaOlustur, PORT as TEST_SUNUCU_PORT } from './test-sunucu.mjs';
import { eskiVideolariTemizle } from './medya-temizligi.mjs';
import { KATEGORI, KATEGORILER, kacHesapla } from './rapor/veri-siniflandirma.mjs';
import { sonuclariOku, medyaYollariOlustur } from './rapor/veri-okuma.mjs';
import { kosulariGrupla, kartlariHesapla, kosuGecmisiCikar, kosuDetaylariCikar } from './rapor/veri-kosular.mjs';
import { kayitlariTopla, ornekleriDuzlestir } from './rapor/veri-kayitlar.mjs';
import { adimOzetiCikar } from './rapor/veri-adimlar.mjs';
import { senaryolariHazirla, jetSeyahatKabulEdilenOdemeSonuclariniOku } from './rapor/veri-senaryolar.mjs';
import { konsolOzetiYaz, markdownOzetiOlustur } from './rapor/ozet-cikti.mjs';
import { dashboardHtmlOlustur } from './rapor/dashboard-html.mjs';
import { ekranModeliniOku } from './dogrulama/model-oku.mjs';

const ortam = process.argv[2];

if (!ortam || !['test', 'canli'].includes(ortam)) {
  console.error('Kullanım: node scripts/urun-hata-raporu.mjs <test|canli>');
  process.exit(1);
}

// Dashboard'un "üretim anı" — sonuç dosyaları okunmaya BAŞLAMADAN alınır. İstemci
// tarafında localStorage'da tutulan dashboard koşularından (bkz. anlikKosuDepoyuYukle)
// zamanı bu değere eşit/küçük olanlar zaten aşağıda okunan Allure sonuçlarında yer
// aldığı için atılır (çift sayılmasınlar). Okumadan ÖNCE alınması, okuma sırasında
// biten bir koşunun hem rapordan hem depodan düşmesini engeller.
const uretimBaslangicMs = Date.now();

const sonuclarKlasoru = join(process.cwd(), `allure-results-${ortam}`);
const sonuclarKlasoruGoreli = `allure-results-${ortam}`;

// Video saklama kuralı: VIDEO_SAKLAMA_GUN'den (varsayılan 30) eski videolar rapor
// üretilmeden ÖNCE silinir — böylece aşağıda artık var olmayan bir videoya bağlantı
// verilmez (bkz. medya-temizligi.mjs). Ekran görüntüleri ve sonuç JSON'ları silinmez.
eskiVideolariTemizle(process.cwd(), [ortam], '[urun-hata-raporu]');

// Sonuç klasörü yoksa (ör. proje yeni kurulduysa ve hiç test koşulmadıysa) rapor
// DURMAZ — dashboard yine üretilir; ürünler ve senaryolar projedeki spec
// dosyalarından listelenir, sonuç tabloları boş görünür.
const sonuclarKlasoruVar = existsSync(sonuclarKlasoru);
if (!sonuclarKlasoruVar) {
  console.warn(`"${sonuclarKlasoru}" bulunamadı — henüz koşu yok, dashboard yalnızca senaryo listesiyle üretilecek.`);
}

const medya = medyaYollariOlustur(sonuclarKlasoru, sonuclarKlasoruGoreli);

// --- 1) Tüm ham sonuç dosyalarını oku ---
const tumIcerikler = sonuclariOku(sonuclarKlasoru, sonuclarKlasoruVar);
if (tumIcerikler.length === 0) {
  console.warn('Henüz kayıtlı koşu sonucu yok — dashboard yalnızca senaryo listesiyle üretilecek.');
}

// --- 2) Koşular, üst kartlar, koşu geçmişi ---
const kosular = kosulariGrupla(tumIcerikler);
const { tamKosular, urunKartlari, genelKart, sonKosuOzet, oncekiKosuOzet, sonKosuEtiketi } = kartlariHesapla(kosular);
const tumKosuOzetleri = kosuGecmisiCikar(kosular);

// --- 3) Düz kayıt listesi, hata kalıbı örnekleri, adım özetleri, koşu detayları ---
const { tumKayitlar, ornekler, urunAdimSayaclari, urunler } = kayitlariTopla(tumIcerikler, medya);
const kosuDetaylari = kosuDetaylariCikar(kosular, medya);
const adimOzeti = adimOzetiCikar(urunler, urunAdimSayaclari);

// --- 4) Konsola kısa özet (hızlı bakış) ---
konsolOzetiYaz({ ortam, sonKosuEtiketi, sonKosuOzet, kosuSayisi: kosular.length, tamKosuSayisi: tamKosular.length });

// --- 5) Kısa markdown özeti (paylaşım için) ---
const markdownDosyaYolu = join(process.cwd(), `urun-hata-ozeti-${ortam}.md`);
writeFileSync(markdownDosyaYolu, markdownOzetiOlustur({ ortam, sonKosuEtiketi, sonKosuOzet, oncekiKosuOzet }), 'utf-8');

// --- 6) Tek ekranlık, etkileşimli HTML dashboard ---
const { tumSenaryolar, tumUrunler } = await senaryolariHazirla(ortam, urunler);
const jetSeyahatKabulEdilenOdemeSonuclari = jetSeyahatKabulEdilenOdemeSonuclariniOku(ortam);
// "Senaryo Oluştur/Düzenle" formunun tek doğrulayıcısı (sayfaya gömülü SenaryoDogrulayici) bu
// modelle çalışır. Okunamazsa rapor durmaz; form yalnızca sunucu doğrulamasına kalır.
let jetSeyahatEkranModeli = null;
try {
  jetSeyahatEkranModeli = ekranModeliniOku(process.cwd());
} catch (hata) {
  console.warn(`[urun-hata-raporu] JetSeyahat ekran modeli okunamadı, form istemci doğrulaması kapalı: ${hata.message}`);
}

const veri = {
  ortam,
  tumSenaryolar,
  jetSeyahatKabulEdilenOdemeSonuclari,
  jetSeyahatEkranModeli,
  uretimZamani: new Date(uretimBaslangicMs).toLocaleString('tr-TR'),
  // Sayısal üretim anı (bkz. uretimBaslangicMs) — istemci, localStorage'daki bundan eski
  // dashboard koşularını atar (zaten bu rapordaki Allure sonuçlarında yer alıyorlar).
  uretimMs: uretimBaslangicMs,
  sonKosuEtiket: sonKosuEtiketi,
  urunler: tumUrunler,
  // Sabit kategori sırası — istemci tarafında kategori-renk eşlemesi bu sıraya göre yapılır.
  kategoriler: [...KATEGORILER.map((k) => k.ad), KATEGORI.diger],
  kayitlar: tumKayitlar,
  // Üst kartların kaynağı (bkz. rapor/veri-kosular.mjs "Üst kartlar" açıklaması) — istemci
  // yalnızca seçili görünüme göre birini okur: genel (null = henüz koşu yok) ya da urunler[P]
  // ({ son, onceki } — P'yi içeren son / bir önceki koşu; ürün hiç koşulmadıysa yok).
  kartlar: { genel: genelKart, urunler: urunKartlari },
  kosuGecmisi: tumKosuOzetleri,
  kosuDetaylari,
  adimOzeti,
  ornekler: ornekleriDuzlestir(ornekler)
};

const veriJson = JSON.stringify(veri).replace(/</g, '\\u003c'); // </script> enjeksiyonunu engelle

// Sidebar'daki genel başarı oranı donutu her zaman TÜM ürünlerin son koşusunu gösterir
// (seçimden bağımsız — Allure'daki gibi sabit bir "genel durum" göstergesi).
const sonKosuToplam = kacHesapla(sonKosuOzet);
const sonKosuOran = sonKosuToplam > 0 ? Math.round((sonKosuOzet.basarili / sonKosuToplam) * 100) : 0;

// Üst istatistik kartları ve koşu trendi grafiği, GENEL/ürün seçimine göre değiştiği
// için tamamen istemci tarafında (JS) çizilir — bkz. rapor/dashboard-istemci.js.
const html = dashboardHtmlOlustur({
  ortam,
  veri,
  veriJson,
  sonKosuOzet,
  sonKosuToplam,
  sonKosuOran,
  testSunucuTaban: `http://127.0.0.1:${TEST_SUNUCU_PORT}`,
  testSunucuToken: tokenGetirYaOlustur()
});

const htmlDosyaYolu = join(process.cwd(), `dashboard-${ortam}.html`);
writeFileSync(htmlDosyaYolu, html, 'utf-8');
console.log(`Dashboard sayfası yazıldı: ${htmlDosyaYolu}`);
