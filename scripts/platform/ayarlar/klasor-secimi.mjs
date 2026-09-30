// KLASÖR SEÇİMİ — kullanıcının seçtiği VERİ KLASÖRÜ (Nöbetçi'nin veri kökü: çalışma alanları, kasa, medya, yedekler) ve YEDEK
// KLASÖRÜ için ortak doğrulama, veri klasörü ayar dosyası ve "kopyala + doğrula" taşıma.
//
// VERİ KLASÖRÜ SEÇİMİ KASA DIŞINDADIR (kasa o klasörün içindedir): başlatıcının verdiği ayar dosyasında (NOBETCI_AYAR_DOSYASI) durur —
//   Windows: %LOCALAPPDATA%\Nöbetçi\ayar.json, macOS: ~/Library/Application Support/Nöbetçi/ayar.json. Dosya paketin DIŞINDA
//   olduğundan yeni sürüm indirilip açıldığında da aynı klasör kullanılır. Başlatıcılar (scripts/paket/Nobetci.cs, mac-paketi.mjs)
//   dosyayı okuyup NOBETCI_VERI_KOKU'yu ayarlar; sunucu da aynı dosyayı okur (calisma-alanlari.mjs > veriKoku). Ortam değişkeni
//   verilmemişse (geliştirme: npm run baslat) seçim yapılamaz, bugünkü davranış sürer. Hiçbir şey kendiliğinden taşınmaz.
// YEDEK KLASÖRÜ SEÇİMİ KASADADIR (Ayarlar > Yedekleme; yedek.mjs > varsayilanYedekKlasoru): boşsa veri klasörü altındaki varsayılan.
//
// Güvenlik: yol mutlak olmalı; sürücü kökü, sistem klasörleri ve Nöbetçi'nin kendi program / paket klasörünün içi reddedilir.
// Ağ sürücüsü ve eşitlenen klasörler (OneDrive, Dropbox, Google Drive, iCloud) ENGELLENMEZ, uyarı verilir (sql.js veritabanı
// dosyası eşitleme / ağ kilidi sırasında bozulabilir).
// NOT: import.meta KULLANILMAZ.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix as posixYol, relative, resolve, sep, win32 as win32Yol } from 'node:path';

export const AYAR_DOSYASI_DEGISKENI = 'NOBETCI_AYAR_DOSYASI';
/** Başlatıcı yeniden başlatma döngüsünü destekliyorsa '1' (sunucu 75 koduyla çıkınca yeniden başlatılır). */
export const YENIDEN_BASLATMA_DEGISKENI = 'NOBETCI_YENIDEN_BASLATILABILIR';
export const YENIDEN_BASLAT_KODU = 75;
/** Taşımada kopyalanmayanlar (tarayıcı profili: büyük, kilitli ve yeniden oluşturulur). */
const TASINMAYANLAR = new Set(['pencere-profili']);

export class KlasorHatasi extends Error {
  /** @param {'GECERSIZ' | 'SISTEM' | 'PAKET_ICI' | 'YAZILAMAZ' | 'DOLU' | 'NOBETCI_DEGIL' | 'AYNI' | 'DOGRULAMA' | 'SECIM_YOK'} kod @param {string} mesaj */
  constructor(kod, mesaj) {
    super(mesaj);
    this.name = 'KlasorHatasi';
    this.kod = kod;
  }
}

const kucuk = (/** @type {string} */ s) => (process.platform === 'win32' ? s.toLowerCase() : s);
/** a, b'nin kendisi ya da içinde mi? @param {string} a @param {string} b */
function icindeMi(a, b) {
  const r = relative(kucuk(resolve(b)), kucuk(resolve(a)));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

/** Sistem klasörleri (işletim sistemine göre). */
function sistemKlasorleri() {
  if (process.platform === 'win32') {
    const e = process.env;
    return [e.SystemRoot || 'C:\\Windows', e.ProgramFiles || 'C:\\Program Files', e['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', e.ProgramData || 'C:\\ProgramData']
      .filter(Boolean);
  }
  return ['/System', '/usr', '/bin', '/sbin', '/etc', '/Library', '/Applications', '/dev', '/proc', '/boot'];
}

/**
 * Yolu doğrular (yazılabilirlik HARİÇ): mutlak, sistem klasörü / sürücü kökü değil, yasak köklerin (program / paket klasörü) içinde
 * değil. Uyarılar: ağ sürücüsü, eşitlenen klasör.
 * @param {unknown} yol @param {{ yasakKokler?: string[] }} [s]
 * @returns {{ yol: string; uyarilar: string[] }}
 */
export function klasorYoluDogrula(yol, s = {}) {
  if (typeof yol !== 'string' || !yol.trim()) throw new KlasorHatasi('GECERSIZ', 'Klasör yolu boş olamaz.');
  const ham = yol.trim();
  if (ham.length > 400 || /[\u0000-\u001f]/.test(ham)) throw new KlasorHatasi('GECERSIZ', 'Klasör yolu geçersiz.');
  if (!isAbsolute(ham)) throw new KlasorHatasi('GECERSIZ', 'Tam (mutlak) bir klasör yolu yazın (ör. Windows\'ta D:\\Nöbetçi verisi).');
  const tam = resolve(ham);
  if (dirname(tam) === tam || /^[A-Za-z]:\\?$/.test(tam)) throw new KlasorHatasi('SISTEM', 'Sürücü kökü seçilemez; bir alt klasör seçin.');
  for (const k of sistemKlasorleri()) if (icindeMi(tam, k)) throw new KlasorHatasi('SISTEM', `Sistem klasörü seçilemez: ${k}`);
  for (const k of s.yasakKokler || []) {
    if (k && icindeMi(tam, k)) throw new KlasorHatasi('PAKET_ICI', 'Nöbetçi\'nin program / paket klasörünün içi seçilemez (yeni sürüme geçerken silinebilir). Paketin dışında bir klasör seçin.');
  }
  const uyarilar = [];
  if (/^\\\\/.test(tam) || /^\/Volumes\//.test(tam)) uyarilar.push('Ağ ya da çıkarılabilir sürücü görünüyor: bağlantı koparsa veritabanı kilitlenebilir ya da bozulabilir. Yerel bir disk önerilir.');
  if (/(^|[\\/])(OneDrive[^\\/]*|Dropbox|Google Drive|GoogleDrive|iCloud Drive|Mobile Documents)([\\/]|$)/i.test(tam)) {
    uyarilar.push('Eşitlenen bir klasör (OneDrive, Dropbox, Google Drive, iCloud) görünüyor: eşitleme sırasında veritabanı dosyası bozulabilir. Eşitlenmeyen yerel bir klasör önerilir.');
  }
  return { yol: tam, uyarilar };
}

/** Klasörü oluşturur ve bir deneme dosyası yazıp siler; yazılamazsa KlasorHatasi. @param {string} klasor */
export function yazilabilirOlmali(klasor) {
  const deneme = join(klasor, `.nobetci-yazma-denemesi-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(klasor, { recursive: true });
    writeFileSync(deneme, 'deneme');
    unlinkSync(deneme);
  } catch (hata) {
    throw new KlasorHatasi('YAZILAMAZ', `Klasöre yazılamıyor (${/** @type {Error} */ (hata).message}).`);
  }
}

/**
 * Klasörün durumu: yok / boş / Nöbetçi verisi (kayıt defteri ya da platform.db) / başka dosyalarla dolu.
 * @param {string} klasor @returns {'yok' | 'bos' | 'nobetci' | 'dolu'}
 */
export function veriKlasoruDurumu(klasor) {
  if (!existsSync(klasor)) return 'yok';
  let ogeler;
  try { ogeler = readdirSync(klasor); } catch { return 'dolu'; }
  if (ogeler.includes('calisma-alanlari.json') || ogeler.includes('platform.db')) return 'nobetci';
  return ogeler.filter((a) => !a.startsWith('.nobetci-yazma-denemesi')).length ? 'dolu' : 'bos';
}

// --- Veri klasörü ayar dosyası (kasa dışı) ------------------------------------------------------------------------------

/**
 * Geliştirme başlatıcısı ("npm run baslat") için varsayılan ayar dosyası: paketli başlatıcılarla AYNI yer (Windows'ta
 * %LOCALAPPDATA%\\Nöbetçi\\ayar.json, macOS'ta ~/Library/Application Support/Nöbetçi/ayar.json, diğerlerinde ~/.config/Nöbetçi/ayar.json);
 * böylece veri klasörü seçimi hangi yoldan açılırsa açılsın aynı kalır. Ana klasör bulunamazsa null.
 * @param {NodeJS.ProcessEnv} [ortam] @param {string} [platform]
 */
export function varsayilanAyarDosyasi(ortam = process.env, platform = process.platform) {
  // Yol kuralları HEDEF platformun (çalışan makinenin değil): Windows'ta sınanan macOS yolu da '/' ile kurulur.
  const y = platform === 'win32' ? win32Yol : posixYol;
  const ev = ortam.HOME || ortam.USERPROFILE;
  let taban = null;
  if (platform === 'win32') taban = ortam.LOCALAPPDATA || (ortam.USERPROFILE ? y.join(ortam.USERPROFILE, 'AppData', 'Local') : null);
  else if (platform === 'darwin') taban = ev ? y.join(ev, 'Library', 'Application Support') : null;
  else taban = ortam.XDG_CONFIG_HOME || (ev ? y.join(ev, '.config') : null);
  return taban && y.isAbsolute(taban) ? y.join(taban, 'Nöbetçi', 'ayar.json') : null;
}

/** Başlatıcının verdiği ayar dosyası (yoksa null: seçim yapılamaz). */
export function ayarDosyasiYolu() {
  const y = process.env[AYAR_DOSYASI_DEGISKENI];
  return y && y.trim() ? resolve(y.trim()) : null;
}

/** @returns {{ veriKoku?: string }} */
export function veriAyariniOku() {
  const y = ayarDosyasiYolu();
  if (!y) return {};
  try {
    const d = JSON.parse(readFileSync(y, 'utf8'));
    return d && typeof d === 'object' && typeof d.veriKoku === 'string' && d.veriKoku.trim() ? { veriKoku: d.veriKoku.trim() } : {};
  } catch { return {}; }
}

/** Seçili veri klasörünü yazar (null: seçim kaldırılır, varsayılana dönülür). Atomik yazılır. @param {string | null} veriKoku */
export function veriAyariniYaz(veriKoku) {
  const y = ayarDosyasiYolu();
  if (!y) throw new KlasorHatasi('SECIM_YOK', 'Bu kurulumda veri klasörü seçilemez (başlatıcı ayar dosyası vermedi).');
  mkdirSync(dirname(y), { recursive: true });
  let mevcut = {};
  try { mevcut = JSON.parse(readFileSync(y, 'utf8')) || {}; } catch { mevcut = {}; }
  const yeni = { ...mevcut };
  if (veriKoku) yeni.veriKoku = veriKoku; else delete yeni.veriKoku;
  const gecici = `${y}.${process.pid}.gecici`;
  writeFileSync(gecici, `${JSON.stringify(yeni, null, 2)}\n`, 'utf8');
  renameSync(gecici, y);
}

// --- Kopyala + doğrula (eskiyi SİLMEZ) -------------------------------------------------------------------------------------

/** @param {string} dosya */
const ozet = (dosya) => createHash('sha256').update(readFileSync(dosya)).digest('hex');

/** Klasördeki dosyalar (göreli yol → boyut), taşınmayanlar hariç. @param {string} kok */
function dosyaListesi(kok) {
  /** @type {Map<string, number>} */
  const liste = new Map();
  const gez = (/** @type {string} */ goreli) => {
    for (const ad of readdirSync(join(kok, goreli))) {
      if (!goreli && TASINMAYANLAR.has(ad)) continue;
      const g = goreli ? join(goreli, ad) : ad;
      const st = statSync(join(kok, g));
      if (st.isDirectory()) gez(g);
      else if (st.isFile()) liste.set(g, st.size);
    }
  };
  gez('');
  return liste;
}

/**
 * Veri klasörünü yeni klasöre KOPYALAR, her dosyayı boyut + SHA-256 ile doğrular; eski klasöre DOKUNMAZ (silinmez).
 * Hedef boş (ya da yok) olmalıdır. @param {string} eski @param {string} yeni
 * @returns {{ dosya: number; bayt: number }}
 */
export function veriyiKopyalaVeDogrula(eski, yeni) {
  if (icindeMi(yeni, eski) || icindeMi(eski, yeni)) throw new KlasorHatasi('GECERSIZ', 'Yeni klasör eski veri klasörünün içinde (ya da tersi) olamaz.');
  const durum = veriKlasoruDurumu(yeni);
  if (durum !== 'yok' && durum !== 'bos') throw new KlasorHatasi('DOLU', 'Taşıma için hedef klasör boş olmalıdır.');
  mkdirSync(yeni, { recursive: true });
  const liste = dosyaListesi(eski);
  cpSync(eski, yeni, { recursive: true, errorOnExist: true, force: false, filter: (kaynak) => !TASINMAYANLAR.has(relative(eski, kaynak).split(sep)[0]) });
  let bayt = 0;
  for (const [g, boyut] of liste) {
    const hedef = join(yeni, g);
    if (!existsSync(hedef) || statSync(hedef).size !== boyut || ozet(hedef) !== ozet(join(eski, g))) {
      throw new KlasorHatasi('DOGRULAMA', `Kopya doğrulanamadı: ${g}. Eski veri klasörü değiştirilmedi; seçim kaydedilmedi.`);
    }
    bayt += boyut;
  }
  return { dosya: liste.size, bayt };
}
