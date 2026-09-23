// Allure'ın "Trend" grafiği, allure-results/history klasörünü okuyarak geçmiş
// koşularla karşılaştırma yapar. Ancak "allure generate" her seferinde raporu
// baştan üretir ve history'yi allure-report/history altına yazar — bir sonraki
// koşuda allure-results klasörü boş olduğu için geçmiş kaybolur.
// Bu script her "allure generate" sonrasında otomatik çalışır (package.json'daki
// allure:generate:test / allure:generate:canli script'lerine zincirlenmiştir) ve
// üretilen history'yi bir sonraki koşunun okuyacağı yere geri kopyalar.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ortam = process.argv[2];

if (!ortam || !['test', 'canli'].includes(ortam)) {
  console.error('Kullanım: node scripts/allure-history-sync.mjs <test|canli>');
  process.exit(1);
}

const raporGecmisi = join(process.cwd(), `allure-report-${ortam}`, 'history');
const sonuclarGecmisi = join(process.cwd(), `allure-results-${ortam}`, 'history');

if (existsSync(raporGecmisi)) {
  mkdirSync(sonuclarGecmisi, { recursive: true });
  cpSync(raporGecmisi, sonuclarGecmisi, { recursive: true });
  console.log(`[allure-history-sync] Trend geçmişi güncellendi: ${sonuclarGecmisi}`);
} else {
  console.log('[allure-history-sync] Henüz bir rapor geçmişi yok (muhtemelen ilk koşu); trend geçmişi bu koşudan sonra oluşmaya başlayacak.');
}
