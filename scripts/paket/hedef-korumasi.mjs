// PAKET HEDEFİ KORUMASI — "npm run paketle" hedef klasörü silmeden ÖNCE iki durumu denetler:
//   1) Nöbetçi bu klasörden ÇALIŞIYOR mu? (hedef altındaki runtime\node.exe / Nöbetçi.exe süreçleri): Windows'ta süreç listesi
//      (PowerShell Get-CimInstance Win32_Process; yürütülebilir dosyanın yolu hedefin altında mı?) ve ek olarak kilit denemesi
//      (çalışan bir .exe yazmak için açılamaz). Çalışıyorsa silme REDDEDİLİR ("önce kapatın"); --zorla bunu AŞMAZ.
//   2) Hedefte kullanıcı verisi (uygulama\veri) var mı? Varsa silmeden önce uyarılır ve durulur; yalnız --zorla ile silinir.
// Hiçbir ağ isteği yapmaz; yalnız yerel süreç listesi ve dosya sistemi okunur.
import { closeSync, existsSync, openSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';

/** Hedef altında Nöbetçi'nin çalıştırdığı yürütülebilir dosyalar (paketin düzeni: scripts/paketle.mjs). */
export const CALISAN_DOSYALAR = Object.freeze([join('runtime', 'node.exe'), 'Nöbetçi.exe']);
/** Paketin içindeki kullanıcı verisi klasörü. */
export const VERI_KLASORU = join('uygulama', 'veri');

const kucuk = (y) => (process.platform === 'win32' ? y.toLowerCase() : y);
/** `yol` hedefin (kendisi ya da) altında mı? (Windows'ta büyük / küçük harf duyarsız.) */
export function altindaMi(yol, hedef) {
  const y = kucuk(resolve(yol));
  const k = kucuk(resolve(hedef));
  return y === k || y.startsWith(k.endsWith(sep) ? k : k + sep);
}

/**
 * Çalışan süreçlerin yürütülebilir dosya yolları (Windows: PowerShell + Win32_Process). Liste alınamazsa boş dizi (kilit denemesi
 * yine yapılır). @returns {Array<{ pid: number; yol: string }>}
 */
export function surecYollari() {
  if (process.platform !== 'win32') return [];
  try {
    const cikti = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { "$($_.ProcessId)`t$($_.ExecutablePath)" }'],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 });
    return cikti.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const [pid, ...yol] = s.split('\t');
      return { pid: Number(pid), yol: yol.join('\t') };
    }).filter((s) => Number.isInteger(s.pid) && s.yol);
  } catch { return []; }
}

/** Dosya başka bir süreçte kilitli mi (çalışan .exe yazmak için açılamaz)? Dosya yoksa false. */
export function kilitliMi(dosya) {
  if (!existsSync(dosya)) return false;
  try { closeSync(openSync(dosya, 'r+')); return false; } catch (h) {
    const kod = /** @type {NodeJS.ErrnoException} */ (h).code;
    return kod === 'EBUSY' || kod === 'EPERM' || kod === 'EACCES';
  }
}

/**
 * Hedef silinebilir mi? `surecler` verilmezse gerçek süreç listesi okunur (testler sahte liste verebilir).
 * @param {string} hedef
 * @param {{ zorla?: boolean; surecler?: Array<{ pid: number; yol: string }>; kilitDenemesi?: boolean }} [secenek]
 * @returns {{ silinebilir: true } | { silinebilir: false; neden: 'calisiyor' | 'veri'; mesaj: string }}
 */
export function hedefDenetimi(hedef, secenek = {}) {
  const kok = resolve(hedef);
  if (!existsSync(kok)) return { silinebilir: true };
  const surecler = (secenek.surecler ?? surecYollari()).filter((s) => altindaMi(s.yol, kok));
  const kilitli = secenek.kilitDenemesi === false ? [] : CALISAN_DOSYALAR.map((d) => join(kok, d)).filter(kilitliMi);
  if (surecler.length || kilitli.length) {
    const ayrinti = surecler.length ? surecler.map((s) => `  süreç ${s.pid}: ${s.yol}`) : kilitli.map((d) => `  kullanımda: ${d}`);
    return {
      silinebilir: false, neden: 'calisiyor',
      mesaj: [`Nöbetçi bu klasörden çalışıyor; önce kapatın (konsol penceresini kapatın ya da Nöbetçi'den çıkın), sonra yeniden deneyin.`,
        `Hedef: ${kok}`, ...ayrinti, 'Hedef klasör SİLİNMEDİ.'].join('\n')
    };
  }
  const veri = join(kok, VERI_KLASORU);
  if (!secenek.zorla && existsSync(veri) && readdirSync(veri).length) {
    return {
      silinebilir: false, neden: 'veri',
      mesaj: [`Hedefte kullanıcı verisi var: ${veri}`,
        'Bu klasör şifreli kasanızı (projeler, senaryolar, sonuçlar) içerir; hedef silinirse veriler de silinir.',
        'Önce Nöbetçi\'de Ayarlar > Yedekleme\'den yedek alın ya da veri klasörünü paketin dışına taşıyın; başka bir hedef klasör de verebilirsiniz.',
        'Yine de silmek için komutu --zorla ile çalıştırın. Hedef klasör SİLİNMEDİ.'].join('\n')
    };
  }
  return { silinebilir: true };
}

/** Tanınan bayraklar: --zorla (hedefteki veri de silinir), --acilis-denemesi-yok (paket sonunda açılış denemesi atlanır). */
export const PAKET_BAYRAKLARI = Object.freeze(['--zorla', '--acilis-denemesi-yok']);

/** Komut satırı: ilk bayraksız argüman hedef; bayraklar PAKET_BAYRAKLARI. @param {string[]} argumanlar process.argv.slice(2) */
export function paketArgumanlari(argumanlar) {
  const bayraklar = new Set(argumanlar.filter((a) => a.startsWith('--')));
  const bilinmeyen = [...bayraklar].filter((b) => !PAKET_BAYRAKLARI.includes(b));
  return { hedef: argumanlar.find((a) => !a.startsWith('--')) ?? null, zorla: bayraklar.has('--zorla'), acilisDenemesi: !bayraklar.has('--acilis-denemesi-yok'), bilinmeyen };
}
