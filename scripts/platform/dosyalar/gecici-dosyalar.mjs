// KOŞUYA ÖZEL GEÇİCİ DOSYA KLASÖRLERİ (genel) — şifreli senaryo dosyaları (senaryo-dosyalari.mjs) koşu anında
// YALNIZCA burada, düz metin olarak durur ve koşu bitince silinir:
//   <işletim sisteminin kullanıcıya özel geçici klasörü>/nobetci-dosyalar/<veritabanı yolunun özeti>/<koşu klasörü>/
// Klasörler 0700, dosyalar 0600 (yalnızca kullanıcı okuyabilir). Kök veritabanı yoluna göre ayrılır: ikinci bir
// Nöbetçi örneği (ör. geçici veritabanıyla) başka kökü kullanır.
//
// Yaşam döngüsü:
//   - Nöbetçi koşusu: sunucu her test sürecine ayrı bir klasör açar (NOBETCI_DOSYA_KLASORU), süreç kimliğini
//     ".sahip" dosyasına yazar ve süreç kapanınca klasörü siler.
//   - Terminal koşusu: global-setup klasörü açar, global-teardown siler.
//   - Çökme: sunucu açılışta sahibi (süreci) artık çalışmayan klasörleri siler (artikKlasorleriTemizle).
// Veri okuyucu (aktarim/veri-oku.mjs) dosyaları YALNIZCA bu kökün altındaki bir klasöre çözer.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: gecici-dosyalar.d.mts.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';

export const DOSYA_KLASORU_DEGISKENI = 'NOBETCI_DOSYA_KLASORU';
const KOK_ADI = 'nobetci-dosyalar';
const KLASOR_DESENI = /^[A-Za-z0-9._-]{1,120}$/;
const SAHIP_DOSYASI = '.sahip';

/** @param {string} veritabaniYolu */
const vtOzeti = (veritabaniYolu) => createHash('sha256').update(resolve(veritabaniYolu)).digest('hex').slice(0, 16);

/** Veritabanı yoluna özgü geçici kök (oluşturmaz). @param {string} veritabaniYolu @param {string} [taban] */
export function geciciDosyaKoku(veritabaniYolu, taban = tmpdir()) {
  return join(taban, KOK_ADI, vtOzeti(veritabaniYolu));
}

/**
 * Alt süreçten gelen koşu klasörü (NOBETCI_DOSYA_KLASORU) bu veritabanının geçici kökünün altında, bu kullanıcıya ait,
 * yalnızca kullanıcının erişebildiği (0700) gerçek bir klasör mü? (Geçici klasör tabanı süreçler arasında farklı
 * olabilir — ör. TMPDIR — bu yüzden taban değil, "<…>/nobetci-dosyalar/<veritabanı özeti>/<ad>" yapısı denetlenir.)
 * @param {string} klasor @param {string} veritabaniYolu
 */
export function kosuKlasoruDogrula(klasor, veritabaniYolu) {
  if (!klasor || !isAbsolute(klasor)) return false;
  const k = resolve(klasor);
  if (!kosuKlasoruGecerliMi(k, dirname(k))) return false;
  if (basename(dirname(k)) !== vtOzeti(veritabaniYolu) || basename(dirname(dirname(k))) !== KOK_ADI) return false;
  try {
    const b = lstatSync(k);
    if (!b.isDirectory() || b.isSymbolicLink()) return false;
    if (typeof process.getuid === 'function' && b.uid !== process.getuid()) return false;
    if (process.platform !== 'win32' && (b.mode & 0o077) !== 0) return false;
  } catch {
    return false;
  }
  return true;
}

/** @param {string} klasor */
function ozelKlasor(klasor) {
  mkdirSync(klasor, { recursive: true, mode: 0o700 });
  try { chmodSync(klasor, 0o700); } catch { /* yok sayılır */ }
}

/**
 * Koşuya özel klasör oluşturur (ad güvenli hale getirilir, rastgele ek alır) ve sahibini yazar.
 * @param {string} kok geciciDosyaKoku @param {string} onEk @param {number} [sahipPid]
 */
export function kosuKlasoruOlustur(kok, onEk, sahipPid = process.pid) {
  ozelKlasor(dirname(kok));
  ozelKlasor(kok);
  const ad = `${String(onEk).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)}-${randomBytes(4).toString('hex')}`;
  const klasor = join(kok, ad);
  ozelKlasor(klasor);
  sahipYaz(klasor, sahipPid);
  return klasor;
}

/** Klasörün sahibi (süreç kimliği). @param {string} klasor @param {number} pid */
export function sahipYaz(klasor, pid) {
  writeFileSync(join(klasor, SAHIP_DOSYASI), String(pid), { mode: 0o600 });
}

/**
 * Klasör verilen kökün DOĞRUDAN altında güvenli adlı bir klasör mü? (veri okuyucu yalnızca buraya yazar)
 * @param {string} klasor @param {string} kok
 */
export function kosuKlasoruGecerliMi(klasor, kok) {
  if (!klasor || !isAbsolute(klasor)) return false;
  const g = relative(resolve(kok), resolve(klasor));
  return Boolean(g) && !g.startsWith('..') && !isAbsolute(g) && !g.includes(sep) && KLASOR_DESENI.test(g);
}

/** Dosyanın içeriğini (en iyi çabayla) sıfırlarla ezer. @param {string} yol */
function ez(yol) {
  try {
    const boyut = statSync(yol).size;
    const fd = openSync(yol, 'r+');
    try {
      const sifir = Buffer.alloc(Math.min(boyut, 1024 * 1024));
      for (let konum = 0; konum < boyut; konum += sifir.length) writeSync(fd, sifir, 0, Math.min(sifir.length, boyut - konum), konum);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch { /* yok sayılır */ }
}

/** @param {string} klasor */
function icerigiEz(klasor) {
  let girdiler;
  try { girdiler = readdirSync(klasor, { withFileTypes: true }); } catch { return; }
  for (const g of girdiler) {
    const yol = join(klasor, g.name);
    if (g.isDirectory()) icerigiEz(yol);
    else if (g.isFile()) ez(yol);
  }
}

/**
 * Koşu klasörünü siler (önce dosyalar ezilir). Yalnızca kökün altındaki geçerli klasörlere dokunur.
 * @param {string} klasor @param {string} kok @returns {boolean} silindi mi
 */
export function kosuKlasorunuSil(klasor, kok) {
  if (!kosuKlasoruGecerliMi(klasor, kok) || !existsSync(klasor)) return false;
  try {
    if (lstatSync(klasor).isSymbolicLink()) return false;
  } catch { return false; }
  icerigiEz(klasor);
  rmSync(klasor, { recursive: true, force: true });
  return true;
}

/** @param {number} pid */
function surecCalisiyorMu(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (hata) {
    return /** @type {NodeJS.ErrnoException} */ (hata).code === 'EPERM';
  }
}

/**
 * Sahibi (süreci) artık çalışmayan ya da sahip bilgisi olmayan koşu klasörlerini siler (sunucu açılışı).
 * @param {string} kok @returns {number} silinen klasör sayısı
 */
export function artikKlasorleriTemizle(kok) {
  if (!existsSync(kok)) return 0;
  let silinen = 0;
  for (const ad of readdirSync(kok)) {
    const klasor = join(kok, ad);
    let pid = NaN;
    try { pid = Number(readFileSync(join(klasor, SAHIP_DOSYASI), 'utf8').trim()); } catch { /* sahip yok */ }
    if (surecCalisiyorMu(pid)) continue;
    if (kosuKlasorunuSil(klasor, kok)) silinen++;
  }
  return silinen;
}
