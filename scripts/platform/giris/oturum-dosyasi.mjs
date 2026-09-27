// ŞİFRELİ OTURUM DOSYASI — ortak kurallar (tek kaynak). Koşu (tests/support/oturum-kasasi.ts + genel-veri.ts) ve tarama / akış
// kaydı (tarama/yonetici.mjs; Ayarlar > Koşu > Tarama ve akış kaydı > "Koşunun saklanan oturumunu kullan") AYNI dosyayı aynı
// kurallarla okur ve yazar:
//   yer      <veritabanı klasörü>/oturumlar/ (Git dışında; çalışma alanları birbirinin oturumunu görmez)
//   ad       genel-<ortam kimliği>-<giriş profili kimliği | profil-yok>.oturum — anahtar ORTAM + GİRİŞ PROFİLİ (ortam kimliği
//            projeye özgüdür); başka profilin oturumu hiçbir zaman kullanılmaz. Ortamın adı şifreli saklandığı için ada yazılmaz.
//   şifre    kasa anahtarından HKDF ile türetilen anahtar, AES-256-GCM zarfı (kasa.mjs). Kasa anahtarı yoksa dosya YAZILMAZ
//            (düz metin çerez diske asla yazılmaz); açılamayan dosya silinir (bir sonraki giriş yeniden yazar).
//   yazım    ATOMİK (geçici dosya + rename): koşu ve tarama aynı anda yazsa da dosya bozulmaz, son yazan kazanır.
// NOT: import.meta KULLANILMAZ. Tipler: oturum-dosyasi.d.mts.
import { hkdfSync } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { zarfCoz, zarfMi, zarfSifrele } from '../kasa.mjs';
import { atomikIkiliYaz } from '../veritabani/baglanti.mjs';

/** Şifreli oturum dosyasının uzantısı (eski düz metin dosyalar ".json"du). */
export const OTURUM_UZANTISI = '.oturum';
const HKDF_BILGISI = 'nobetci-oturum-dosyasi-v1';

/** @param {string} d */
const temiz = (d) => String(d).replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);

/** Oturum dosyalarının klasörü (veritabanının yanında). @param {string} veritabaniYolu */
export function oturumKlasoru(veritabaniYolu) {
  return join(dirname(veritabaniYolu), 'oturumlar');
}

/** Ortam + giriş profili anahtarlı dosya adı. @param {string} ortamId @param {string | null | undefined} profilKimligi */
export function oturumDosyaAdi(ortamId, profilKimligi) {
  return `genel-${temiz(ortamId)}-${profilKimligi ? temiz(profilKimligi) : 'profil-yok'}${OTURUM_UZANTISI}`;
}

/** @param {string} veritabaniYolu @param {string} ortamId @param {string | null | undefined} profilKimligi */
export function oturumDosyaYolu(veritabaniYolu, ortamId, profilKimligi) {
  return join(oturumKlasoru(veritabaniYolu), oturumDosyaAdi(ortamId, profilKimligi));
}

/**
 * Kasa anahtarından oturum dosyası anahtarı (YENİ tampon; kasa anahtarına dokunulmaz). Geçersizse null.
 * @param {Buffer | null | undefined} kasaAnahtari @returns {Buffer | null}
 */
export function oturumAnahtariTuret(kasaAnahtari) {
  if (!kasaAnahtari || kasaAnahtari.length !== 32) return null;
  return Buffer.from(hkdfSync('sha256', kasaAnahtari, Buffer.alloc(0), Buffer.from(HKDF_BILGISI), 32));
}

/** Playwright storageState biçiminde mi (en azından çerez dizisi)? @param {unknown} d */
export function oturumDurumuMu(d) {
  return typeof d === 'object' && d !== null && Array.isArray(/** @type {{ cookies?: unknown }} */ (d).cookies)
    && (/** @type {{ origins?: unknown }} */ (d).origins === undefined || Array.isArray(/** @type {{ origins?: unknown }} */ (d).origins));
}

/**
 * Şifreli oturumu çözer. Dosya yoksa ya da anahtar yoksa undefined; açılamayan (başka anahtar) / biçimi bozuk dosya SİLİNİR.
 * Atomik yazım sayesinde yarım yazılmış dosya görülmez.
 * @param {string} dosya @param {Buffer | null} anahtar oturumAnahtariTuret'in sonucu
 */
export function oturumDosyasiniOku(dosya, anahtar) {
  if (!anahtar || !existsSync(dosya)) return undefined;
  let metin;
  // Okuma hatası (ör. Windows'ta başka süreç o an yazıyor): dosya SİLİNMEZ, bu seferlik oturum yok sayılır.
  try { metin = readFileSync(dosya, 'utf8').trim(); } catch { return undefined; }
  try {
    if (!zarfMi(metin)) throw new Error('biçim');
    const durum = JSON.parse(zarfCoz(anahtar, metin));
    if (!oturumDurumuMu(durum)) throw new Error('biçim');
    return durum;
  } catch {
    try { rmSync(dosya, { force: true }); } catch { /* yok sayılır */ }
    return undefined;
  }
}

/**
 * Oturumu şifreli ve ATOMİK yazar (anahtar yoksa hiçbir şey yazılmaz → false). Oturum bir önbellektir: Windows'ta hedef başka
 * süreçte (koşu / tarama / virüs tarayıcı) kısa süre kilitliyse birkaç kez daha denenir; yine yazılamazsa HATA FIRLATILMAZ,
 * false döner (bir sonraki giriş yeniden yazar; koşu ya da tarama bu yüzden durmaz). Dosya hiçbir durumda yarım kalmaz.
 * @param {string} dosya @param {Buffer | null} anahtar @param {unknown} durum Playwright storageState
 */
export function oturumDosyasinaYaz(dosya, anahtar, durum) {
  if (!anahtar || !oturumDurumuMu(durum)) return false;
  const veri = Buffer.from(zarfSifrele(anahtar, JSON.stringify(durum)), 'utf8');
  for (let deneme = 0; deneme < 4; deneme++) {
    try {
      atomikIkiliYaz(dosya, veri);
      return true;
    } catch (hata) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(/** @type {NodeJS.ErrnoException} */ (hata).code ?? '')) return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 + Math.floor(Math.random() * 80));
    }
  }
  return false;
}

/** Çerez alanı (domain) bu host'a uygulanır mı (RFC 6265 alan eşleşmesi)? @param {string} alan @param {string} host */
function alanEslesir(alan, host) {
  const a = String(alan).replace(/^\./, '').toLowerCase();
  const h = host.toLowerCase();
  return Boolean(a) && (h === a || h.endsWith(`.${a}`));
}

/**
 * Oturumu YALNIZ verilen kökenlere (ortamın taban adresi + tarifteki giriş adresi) sınırlar: başka sitelerin çerezleri ve yerel
 * depolaması atılır. Tarama / akış kaydı saklanan oturumu bununla uygular.
 * @param {unknown} durum @param {readonly string[]} kokenler
 * @returns {{ cookies: Array<Record<string, unknown>>; origins: Array<Record<string, unknown>> } | null}
 */
export function oturumuKokenlereSinirla(durum, kokenler) {
  if (!oturumDurumuMu(durum)) return null;
  const d = /** @type {{ cookies: Array<Record<string, unknown>>; origins?: Array<Record<string, unknown>> }} */ (durum);
  /** @type {string[]} */
  const hostlar = [];
  for (const k of kokenler) { try { hostlar.push(new URL(k).hostname); } catch { /* geçersiz köken */ } }
  return {
    cookies: d.cookies.filter((c) => typeof c.domain === 'string' && hostlar.some((h) => alanEslesir(String(c.domain), h))),
    origins: (d.origins ?? []).filter((o) => typeof o.origin === 'string' && kokenler.includes(o.origin))
  };
}
