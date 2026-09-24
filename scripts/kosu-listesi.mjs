// KOŞU LİSTESİ — Node betikleri (test-sunucu.mjs, urun-hata-raporu.mjs) tarafı.
// Dosya biçimi ve anahtar kuralları için bkz. tests/support/kosu-listesi.ts (playwright.config.ts
// tarafı) ve tests/data/README.md. İki taraf AYNI dosyayı, AYNI anahtar biçimiyle kullanır:
// { "haricTutulanlar": ["<dosya>::<ad>", ...] } — listede olmayan her senaryo koşuya dahildir.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projeKoku = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KOSU_LISTESI_DOSYASI = join(projeKoku, 'tests', 'data', 'kosu-listesi.json');
export const KOSU_LISTESI_ANAHTAR_AYRACI = '::';

const VARSAYILAN_ACIKLAMA =
  "Koşudan HARİÇ tutulan senaryolar (\"<dosya>::<ad>\"; dosya tests/ klasörüne göre göreli, '/' ayraçlı). " +
  "Listede olmayan her senaryo koşuya dahildir. Dashboard'daki 'Koşuda' anahtarları bu dosyayı günceller; " +
  'npm run test / CI koşuları da bu listeye uyar (bkz. tests/support/kosu-listesi.ts).';

// "--list" çıktısındaki dosya yolu Windows'ta "\" ile gelebilir; dosyada her zaman "/"
// saklanır ki aynı liste her işletim sisteminde aynı anlamı taşısın.
export function kosuListesiAnahtari(dosya, ad) {
  return `${String(dosya).replace(/\\/g, '/')}${KOSU_LISTESI_ANAHTAR_AYRACI}${ad}`;
}

export function kosuListesiAnahtariNormalizeEt(anahtar) {
  const i = String(anahtar).indexOf(KOSU_LISTESI_ANAHTAR_AYRACI);
  if (i <= 0) return null;
  const ad = anahtar.slice(i + KOSU_LISTESI_ANAHTAR_AYRACI.length);
  if (!ad) return null;
  return kosuListesiAnahtari(anahtar.slice(0, i), ad);
}

// Dosya yoksa boş liste döner. Bozuk JSON'da HATA FIRLATILIR (sunucu, bozuk dosyanın
// üzerine yazıp kullanıcının elle yaptığı düzenlemeyi sessizce silmesin diye);
// rapor tarafı bunu yakalayıp "hepsi dahil" varsayar.
export function haricTutulanlariOku(dosyaYolu = KOSU_LISTESI_DOSYASI) {
  if (!existsSync(dosyaYolu)) return [];
  const veri = JSON.parse(readFileSync(dosyaYolu, 'utf-8'));
  const liste = Array.isArray(veri?.haricTutulanlar) ? veri.haricTutulanlar : [];
  return [...new Set(liste.map(kosuListesiAnahtariNormalizeEt).filter(Boolean))];
}

// ATOMİK yazım (geçici dosya + rename) — yarım/bozuk bir JSON asla oluşmaz (bkz.
// test-sunucu.mjs > atomikYaz ile aynı yaklaşım). Anahtarlar sıralı yazılır ki git
// farkları okunaklı olsun.
export function haricTutulanlariYaz(anahtarlar, dosyaYolu = KOSU_LISTESI_DOSYASI) {
  let aciklama = VARSAYILAN_ACIKLAMA;
  try {
    if (existsSync(dosyaYolu)) {
      const mevcut = JSON.parse(readFileSync(dosyaYolu, 'utf-8'));
      if (typeof mevcut?._aciklama === 'string') aciklama = mevcut._aciklama;
    }
  } catch {
    // mevcut dosya okunamıyorsa varsayılan açıklama kullanılır
  }
  const siraliListe = [...new Set(anahtarlar.map(kosuListesiAnahtariNormalizeEt).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr')
  );
  const icerik = JSON.stringify({ _aciklama: aciklama, haricTutulanlar: siraliListe }, null, 2) + '\n';
  const geciciYol = `${dosyaYolu}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(geciciYol, icerik, 'utf-8');
    renameSync(geciciYol, dosyaYolu);
  } catch (hata) {
    try {
      if (existsSync(geciciYol)) unlinkSync(geciciYol);
    } catch {
      // yok sayılır — asıl hata aşağıda fırlatılıyor
    }
    throw hata;
  }
  return siraliListe;
}

// Verilen anahtarları koşuya dahil eder (dahil=true → hariç listesinden çıkarır) ya da
// koşudan çıkarır (dahil=false → hariç listesine ekler). Oku-değiştir-yaz TAMAMEN
// senkron yapılır; Node tek iş parçacıklı olduğundan eşzamanlı iki istek birbirinin
// değişikliğini ezemez. Yeni hariç listesini döner.
export function kosuListesiniGuncelle(anahtarlar, dahil, dosyaYolu = KOSU_LISTESI_DOSYASI) {
  const hariclar = new Set(haricTutulanlariOku(dosyaYolu));
  for (const anahtar of anahtarlar) {
    const normal = kosuListesiAnahtariNormalizeEt(anahtar);
    if (!normal) continue;
    if (dahil) hariclar.delete(normal);
    else hariclar.add(normal);
  }
  return haricTutulanlariYaz([...hariclar], dosyaYolu);
}
