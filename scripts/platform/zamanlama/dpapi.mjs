// ZAMANLANMIŞ KOŞULAR — "Windows oturumuna bağlı otomatik açma (DPAPI)" (Planlı koşular; varsayılan KAPALI; yalnız Windows).
// Kasa anahtarı Windows DPAPI (CurrentUser kapsamı + ek entropi) ile şifrelenip çalışma alanının veri klasörüne yazılır; diske
// YALNIZ DPAPI ile korunmuş hâli yazılır, düz anahtar asla. Sunucu açılışında dosya çözülür ve anahtar YALNIZ zamanlayıcının
// emanetine verilir (arayüz kilitli başlar; bkz. anahtar-emaneti.mjs).
// - DPAPI çağrısı Windows'un kendi PowerShell'iyle yapılır ([System.Security.Cryptography.ProtectedData]::Protect/Unprotect);
//   betik -EncodedCommand ile verilir, anahtar / blob KOMUT SATIRINDA DEĞİL stdin ile aktarılır; çıktı stdout'tan okunur.
//   Yürütücü enjekte edilebilir (testler). Hata mesajları gizli değer (anahtar, blob, stderr) içermez.
// - Dosya biçimi (JSON): { bicim, surum, kapsam, kasaTuzu, entropiTuzu, blob, olusturulma }. kasaTuzu kasanın KDF tuzudur
//   (meta'da zaten şifresiz): parola değişince / kasa yeniden anahtarlanınca tuz değişir ve dosya "eski" sayılır.
// - Dosya yedeklere (.tayedek: yalnız veritabanı + medya/) ve pakete (veri/ kopyalanmaz) GİRMEZ.
// - Silme: içerik rastgele baytlarla ezilip diske yazılır, sonra dosya silinir (SSD/kopya-yazma dosya sistemlerinde eski
//   blokların fiziksel olarak silindiği garanti edilemez; blob zaten DPAPI ile şifrelidir).
// Tipler: dpapi.d.mts.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fstatSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

export const DPAPI_BICIMI = 'nobetci-zamanlayici-anahtari';
export const DPAPI_SURUMU = 1;
/** Ek entropinin sabit kısmı (dosyadaki rastgele entropiTuzu ile birleştirilir). */
const ENTROPI_ON_EKI = Buffer.from('Nobetci/zamanlayici-anahtari/v1', 'utf8');

/**
 * PowerShell betiği: stdin'den üç satır okur (islem, entropi base64, veri base64), DPAPI CurrentUser ile korur / çözer,
 * sonucu base64 olarak stdout'a yazar. Betik gizli değer içermez.
 */
export const DPAPI_BETIGI = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Security',
  '$satirlar = [Console]::In.ReadToEnd() -split "`n"',
  '$islem = $satirlar[0].Trim()',
  '$entropi = [Convert]::FromBase64String($satirlar[1].Trim())',
  '$veri = [Convert]::FromBase64String($satirlar[2].Trim())',
  '$kapsam = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
  "if ($islem -eq 'koru') { $sonuc = [System.Security.Cryptography.ProtectedData]::Protect($veri, $entropi, $kapsam) }",
  "elseif ($islem -eq 'coz') { $sonuc = [System.Security.Cryptography.ProtectedData]::Unprotect($veri, $entropi, $kapsam) }",
  'else { exit 2 }',
  '[Console]::Out.Write([Convert]::ToBase64String($sonuc))',
  '[Array]::Clear($veri, 0, $veri.Length)',
  '[Array]::Clear($sonuc, 0, $sonuc.Length)'
].join('\n');

/** Windows PowerShell'in tam yolu (PATH'e güvenilmez). */
export function powershellYolu() {
  return join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * PowerShell komut satırı (saf): betik -EncodedCommand (UTF-16LE base64) ile; gizli değer İÇERMEZ.
 * @returns {{ komut: string; argumanlar: string[] }}
 */
export function dpapiKomutu() {
  return {
    komut: powershellYolu(),
    argumanlar: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(DPAPI_BETIGI, 'utf16le').toString('base64')]
  };
}

/** @typedef {(komut: string, argumanlar: string[], stdin: string) => Promise<string>} DpapiYurutucu */

/**
 * Varsayılan yürütücü: execFile (kabuk YOK, pencere gizli), girdi stdin ile. Hata mesajı gizli değer ya da stderr içermez.
 * @type {DpapiYurutucu}
 */
export const varsayilanDpapiYurutucu = (komut, argumanlar, stdin) => new Promise((coz, reddet) => {
  const alt = execFile(komut, argumanlar, { windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (hata, cikti) => {
    if (hata) {
      const kod = /** @type {{ code?: unknown }} */ (hata).code;
      reddet(new Error(`Windows DPAPI işlemi başarısız${typeof kod === 'number' ? ` (çıkış kodu ${kod})` : ''}.`));
      return;
    }
    coz(String(cikti).trim());
  });
  alt.stdin?.on('error', () => { /* süreç erken kapandı: hata execFile geri çağrısında */ });
  alt.stdin?.end(stdin);
});

/** @param {Buffer} tuz */
const entropi = (tuz) => Buffer.concat([ENTROPI_ON_EKI, tuz]);

/**
 * @param {'koru' | 'coz'} islem @param {Buffer} veri @param {Buffer} tuz @param {DpapiYurutucu} yurutucu
 * @returns {Promise<Buffer>}
 */
async function dpapi(islem, veri, tuz, yurutucu) {
  if (process.platform !== 'win32' && yurutucu === varsayilanDpapiYurutucu) throw new Error('Windows DPAPI yalnız Windows\'ta kullanılabilir.');
  const { komut, argumanlar } = dpapiKomutu();
  const cikti = await yurutucu(komut, argumanlar, `${islem}\n${entropi(tuz).toString('base64')}\n${veri.toString('base64')}\n`);
  if (!/^[A-Za-z0-9+/]+=*$/.test(cikti)) throw new Error('Windows DPAPI beklenmeyen çıktı verdi.');
  return Buffer.from(cikti, 'base64');
}

/** @param {Buffer} veri @param {Buffer} tuz @param {DpapiYurutucu} [yurutucu] */
export const dpapiKoru = (veri, tuz, yurutucu = varsayilanDpapiYurutucu) => dpapi('koru', veri, tuz, yurutucu);
/** @param {Buffer} blob @param {Buffer} tuz @param {DpapiYurutucu} [yurutucu] */
export const dpapiCoz = (blob, tuz, yurutucu = varsayilanDpapiYurutucu) => dpapi('coz', blob, tuz, yurutucu);

/**
 * Çalışma alanının DPAPI dosyası: veritabanının yanında, veritabanı adıyla (ör. veri/platform.db → veri/platform.zamanlayici.dpapi).
 * @param {string} veritabaniYolu
 */
export function dpapiDosyaYolu(veritabaniYolu) {
  return join(dirname(veritabaniYolu), `${basename(veritabaniYolu, extname(veritabaniYolu))}.zamanlayici.dpapi`);
}

/**
 * Dosyayı ÇÖZMEDEN okur (kasa kilitliyken de): var mı, biçim geçerli mi, hangi kasa tuzuna bağlı.
 * @param {string} yol
 * @returns {{ var: boolean; gecerli: boolean; kasaTuzu: string | null }}
 */
export function dpapiDosyaBilgisi(yol) {
  if (!existsSync(yol)) return { var: false, gecerli: false, kasaTuzu: null };
  try {
    const d = JSON.parse(readFileSync(yol, 'utf8'));
    const gecerli = d && d.bicim === DPAPI_BICIMI && d.surum === DPAPI_SURUMU && typeof d.blob === 'string' && typeof d.entropiTuzu === 'string'
      && typeof d.kasaTuzu === 'string';
    return { var: true, gecerli: Boolean(gecerli), kasaTuzu: gecerli ? d.kasaTuzu : null };
  } catch {
    return { var: true, gecerli: false, kasaTuzu: null };
  }
}

/**
 * Kasa anahtarını DPAPI ile korur ve dosyaya yazar (geçici dosya + yeniden adlandırma; yalnız korumalı blob yazılır).
 * @param {string} yol @param {Buffer} anahtar @param {string} kasaTuzu @param {DpapiYurutucu} [yurutucu]
 */
export async function dpapiDosyasiYaz(yol, anahtar, kasaTuzu, yurutucu = varsayilanDpapiYurutucu) {
  const tuz = randomBytes(16);
  const blob = await dpapiKoru(anahtar, tuz, yurutucu);
  if (blob.equals(anahtar) || blob.includes(anahtar)) throw new Error('Windows DPAPI korumalı veri üretmedi.');
  const icerik = JSON.stringify({
    bicim: DPAPI_BICIMI, surum: DPAPI_SURUMU, kapsam: 'CurrentUser', kasaTuzu, entropiTuzu: tuz.toString('base64'),
    blob: blob.toString('base64'), olusturulma: new Date().toISOString()
  });
  const gecici = `${yol}.${randomBytes(6).toString('hex')}.yaziliyor`;
  writeFileSync(gecici, icerik, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    // Eski dosya (ör. parola değişikliği öncesi) yeniden adlandırmayla üzerine yazılmadan önce ezilip silinir.
    dosyayiGuvenliSil(yol);
    renameSync(gecici, yol);
  } catch (hata) {
    dosyayiGuvenliSil(gecici);
    throw hata;
  }
}

/**
 * Dosyayı çözer ve kasa anahtarını döner (çağıran sıfırlamalıdır). Kasa tuzu verilirse ve uymuyorsa ESKI hatası.
 * @param {string} yol @param {{ kasaTuzu?: string | null; yurutucu?: DpapiYurutucu }} [secenekler]
 * @returns {Promise<Buffer>}
 */
export async function dpapiDosyasiOku(yol, secenekler = {}) {
  const bilgi = dpapiDosyaBilgisi(yol);
  if (!bilgi.var) throw Object.assign(new Error('DPAPI dosyası yok.'), { kod: 'YOK' });
  if (!bilgi.gecerli) throw Object.assign(new Error('DPAPI dosyasının biçimi tanınmadı.'), { kod: 'BOZUK' });
  if (secenekler.kasaTuzu && bilgi.kasaTuzu !== secenekler.kasaTuzu) {
    throw Object.assign(new Error('DPAPI dosyası kasanın eski anahtarına ait (parola değişmiş ya da kasa yeniden anahtarlanmış).'), { kod: 'ESKI' });
  }
  const d = JSON.parse(readFileSync(yol, 'utf8'));
  return dpapiCoz(Buffer.from(d.blob, 'base64'), Buffer.from(d.entropiTuzu, 'base64'), secenekler.yurutucu ?? varsayilanDpapiYurutucu);
}

/**
 * Dosyanın içeriğini rastgele baytlarla ezip (fsync) siler. Dosya yoksa false.
 * @param {string} yol
 */
export function dosyayiGuvenliSil(yol) {
  if (!existsSync(yol)) return false;
  try {
    const fd = openSync(yol, 'r+');
    try {
      const boyut = fstatSync(fd).size;
      if (boyut > 0) writeSync(fd, randomBytes(boyut), 0, boyut, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch { /* ezilemese de silinir */ }
  unlinkSync(yol);
  return true;
}
