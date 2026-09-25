// KOŞU LİSTESİ (hangi senaryolar "koşu"ya dahil) — playwright.config.ts tarafı.
//
// Koşudan HARİÇ TUTULAN senaryolar platform veritabanındaki senaryoların "kosuya_dahil" alanından
// gelir (Nöbetçi > Senaryolar > "Koşuda"); anahtar biçimi "<dosya>::<ad>":
//   - <dosya>: "playwright test --list --reporter=json" çıktısındaki, testDir'e (tests/)
//     GÖRE GÖRELİ yol, her zaman "/" ayracıyla (ör. "scenarios/jet-konut/teklif-matrisi.spec.ts").
//   - <ad>: senaryonun (test) başlığı. Aynı başlık birden fazla ürün dosyasında
//     tekrarlanabildiği için anahtar dosya + başlık ikilisidir.
// Veritabanında olmayan her test (kodla yeni eklenenler dahil) varsayılan olarak koşuya DAHİLDİR.
// EKRAN DÜZEYİ: Nöbetçi > Ekranlar'da devre dışı bırakılan ya da silinen (kodu kaldırılmamış) ekranların spec dosyalarının
// TÜM testleri dosya deseniyle hariç tutulur (kodla sonradan eklenen testler dahil) — bkz. platformHaricTutulanDosyalar.
import { platformHaricTutulanAnahtarlar, platformHaricTutulanDosyalar } from './platform-veri';

export const KOSU_LISTESI_ANAHTAR_AYRACI = '::';

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

// Bir spec dosyasının (testDir'e göre, "/" ayraçlı) TÜM testlerini eşleştiren desen: dosya suite başlığı + boşluk.
// Dosya yolu ".." / mutlak yol içeremez (veritabanından gelen yol yine de kaçışlanır).
export function dosyadanGrepDeseni(dosya: string): RegExp | null {
  const d = dosya.replace(/\\/g, '/');
  if (!d || d.startsWith('/') || d.split('/').some((p) => p === '' || p === '..')) return null;
  return new RegExp(`(?:^|\\s)${d.split('/').map(regexIcinKac).join('[\\\\/]')}\\s`);
}

// playwright.config.ts > grepInvert için: hariç tutulan her anahtarın ve (ekran düzeyinde) her dosyanın deseni.
// Boşsa undefined döner (grepInvert hiç verilmez). Listeler veritabanından gelir (bkz. platform-veri.ts).
export function kosuListesiHaricDesenleri(
  anahtarlar: readonly string[] = platformHaricTutulanAnahtarlar(),
  dosyalar: readonly string[] = platformHaricTutulanDosyalar()
): RegExp[] | undefined {
  const desenler = [...anahtarlar.map(anahtardanGrepDeseni), ...dosyalar.map(dosyadanGrepDeseni)]
    .filter((desen): desen is RegExp => desen !== null);
  return desenler.length ? desenler : undefined;
}
