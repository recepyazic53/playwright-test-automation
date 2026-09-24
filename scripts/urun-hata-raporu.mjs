// "MEVCUT GÖRÜNÜM" ÜRETİCİSİ (eski Galaksi dashboard'u: dashboard-<ortam>.html).
//
// Allure kaldırıldı: koşu sonuçları artık platform veritabanındadır ve platform arayüzündeki
// "Sonuçlar" sekmesinde gösterilir (scripts/platform/raporlayici.mjs yazar). Bu sayfa YALNIZCA
// senaryo işlevleri için üretilmeye devam eder: "Senaryolar" tablosu (▷ çalıştır, Koşuda
// anahtarları, Düzenle), "Senaryo Oluştur" formu ve canlı koşu paneli. Sonuç bölümlerinin yerinde
// "Sonuçlar artık Sonuçlar sekmesinde" notu görünür (bkz. rapor/dashboard-html.mjs); sayfanın
// istemci betiği boş sonuç verisiyle hatasız çalışır.
//
// Tek çıktı üretir: dashboard-<ortam>.html (test sunucusu /gorunum/<ortam> ile sunar ve gerekirse
// yeniden üretir).
//
// Kullanım:
//   node scripts/urun-hata-raporu.mjs test
//   node scripts/urun-hata-raporu.mjs canli
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tokenGetirYaOlustur, PORT as TEST_SUNUCU_PORT } from './test-sunucu.mjs';
import { KATEGORI, KATEGORILER } from './platform/sonuclar/siniflandirma.mjs';
import { senaryolariHazirla, jetSeyahatKabulEdilenOdemeSonuclariniOku } from './rapor/veri-senaryolar.mjs';
import { dashboardHtmlOlustur } from './rapor/dashboard-html.mjs';
import { ekranModeliniOku } from './dogrulama/model-oku.mjs';

const ortam = process.argv[2];

if (!ortam || !['test', 'canli'].includes(ortam)) {
  console.error('Kullanım: node scripts/urun-hata-raporu.mjs <test|canli>');
  process.exit(1);
}

const uretimBaslangicMs = Date.now();

// --- Senaryolar (sonuç verisi YOK: sonuçlar platformun "Sonuçlar" sekmesinde) ---
const { tumSenaryolar, tumUrunler } = await senaryolariHazirla(ortam, []);
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
  uretimMs: uretimBaslangicMs,
  sonKosuEtiket: 'Sonuçlar artık Sonuçlar sekmesinde',
  urunler: tumUrunler,
  kategoriler: [...KATEGORILER.map((k) => k.ad), KATEGORI.diger],
  // Sonuç bölümleri gizlidir; istemci betiği hatasız çalışsın diye boş yapılar verilir.
  kayitlar: [],
  kartlar: { genel: null, urunler: {} },
  kosuGecmisi: [],
  kosuDetaylari: [],
  adimOzeti: Object.fromEntries(tumUrunler.map((u) => [u, []])),
  ornekler: {}
};

const veriJson = JSON.stringify(veri).replace(/</g, '\\u003c'); // </script> enjeksiyonunu engelle

const html = dashboardHtmlOlustur({
  ortam,
  veri,
  veriJson,
  testSunucuTaban: `http://127.0.0.1:${TEST_SUNUCU_PORT}`,
  testSunucuToken: tokenGetirYaOlustur()
});

// Çıktı klasörü: proje kökü (PLATFORM_GORUNUM_KLASORU yalnızca ikinci sunucu örnekleri içindir).
const ciktiKlasoru = process.env.PLATFORM_GORUNUM_KLASORU ? resolve(process.env.PLATFORM_GORUNUM_KLASORU) : process.cwd();
const htmlDosyaYolu = join(ciktiKlasoru, `dashboard-${ortam}.html`);
writeFileSync(htmlDosyaYolu, html, 'utf-8');
console.log(`Dashboard sayfası yazıldı: ${htmlDosyaYolu}`);
