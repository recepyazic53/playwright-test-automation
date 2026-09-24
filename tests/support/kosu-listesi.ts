// KOŞU LİSTESİ (hangi senaryolar "koşu"ya dahil) — playwright.config.ts tarafı.
//
// tests/data/kosu-listesi.json dosyası, koşudan HARİÇ TUTULAN senaryoların anahtarlarını
// tutar: { "haricTutulanlar": ["<dosya>::<ad>", ...] }. Listede OLMAYAN her senaryo
// (kodla yeni eklenen senaryolar dahil) varsayılan olarak koşuya DAHİLDİR.
//   - <dosya>: "playwright test --list --reporter=json" çıktısındaki, testDir'e (tests/)
//     GÖRE GÖRELİ yol, her zaman "/" ayracıyla (ör. "scenarios/jet-konut/teklif-matrisi.spec.ts").
//   - <ad>: senaryonun (test) başlığı. Aynı başlık birden fazla ürün dosyasında
//     tekrarlanabildiği için anahtar dosya + başlık ikilisidir.
// Dosyayı dashboard'daki "Koşuda" anahtarları (test-sunucu.mjs > /kosu-listesi) yazar;
// elle de düzenlenebilir.
//
// Node betikleri (test-sunucu.mjs, urun-hata-raporu.mjs) aynı dosyayı
// scripts/kosu-listesi.mjs üzerinden okur/yazar — anahtar biçimi ikisinde AYNI TUTULMALI.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const KOSU_LISTESI_DOSYASI = join(__dirname, '..', 'data', 'kosu-listesi.json');
export const KOSU_LISTESI_ANAHTAR_AYRACI = '::';

// Dosya yoksa ya da bozuksa boş liste döner (hiçbir senaryo hariç tutulmaz) — bozuk bir
// JSON, "npm run test" koşularını tamamen durdurmasın; uyarı terminale yazılır.
export function haricTutulanAnahtarlariOku(dosyaYolu: string = KOSU_LISTESI_DOSYASI): string[] {
  if (!existsSync(dosyaYolu)) return [];
  try {
    const veri: unknown = JSON.parse(readFileSync(dosyaYolu, 'utf-8'));
    const liste = (veri as { haricTutulanlar?: unknown })?.haricTutulanlar;
    if (!Array.isArray(liste)) return [];
    return liste.filter((anahtar): anahtar is string => typeof anahtar === 'string' && anahtar.includes(KOSU_LISTESI_ANAHTAR_AYRACI));
  } catch (hata) {
    console.warn(`[kosu-listesi] ${dosyaYolu} okunamadı, hiçbir senaryo hariç tutulmadı: ${(hata as Error).message}`);
    return [];
  }
}

function regexIcinKac(metin: string): string {
  return metin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bir "<dosya>::<ad>" anahtarını, Playwright'ın grep/grepInvert ile eşleştirdiği metne
// uyan bir RegExp'e çevirir. Playwright bu metni şöyle kurar (bkz. node_modules/playwright
// > _grepTitleWithTags): kök suite ("") + proje adı + DOSYA suite başlığı (rootDir'e göre
// göreli yol, işletim sisteminin ayracıyla — Windows'ta "\") + varsa describe başlıkları +
// test başlığı + varsa etiketler (@tag), aralarında TEK boşluk. Örn:
//   " Chromium scenarios/jet-konut/teklif-matrisi.spec.ts <başlık>"
// Başlıklar ürünler arasında tekrarlandığı için desen DOSYA + BAŞLIK birlikte eşleşir:
//   (^|boşluk) dosya boşluk [describe'lar boşluk] başlık [ @etiket...] $
// Dosya yolundaki "/" hem "/" hem "\" ile eşleşir (Windows desteği).
export function anahtardanGrepDeseni(anahtar: string): RegExp | null {
  const ayracIndex = anahtar.indexOf(KOSU_LISTESI_ANAHTAR_AYRACI);
  if (ayracIndex <= 0) return null;
  const dosya = anahtar.slice(0, ayracIndex).replace(/\\/g, '/');
  const ad = anahtar.slice(ayracIndex + KOSU_LISTESI_ANAHTAR_AYRACI.length);
  if (!ad) return null;
  const dosyaDeseni = dosya.split('/').map(regexIcinKac).join('[\\\\/]');
  return new RegExp(`(?:^|\\s)${dosyaDeseni}\\s(?:.*\\s)?${regexIcinKac(ad)}(?:\\s@\\S+)*$`);
}

// playwright.config.ts > grepInvert için: hariç tutulan her anahtarın deseni. Boşsa
// undefined döner (grepInvert hiç verilmez).
export function kosuListesiHaricDesenleri(dosyaYolu: string = KOSU_LISTESI_DOSYASI): RegExp[] | undefined {
  const desenler = haricTutulanAnahtarlariOku(dosyaYolu)
    .map(anahtardanGrepDeseni)
    .filter((desen): desen is RegExp => desen !== null);
  return desenler.length ? desenler : undefined;
}
