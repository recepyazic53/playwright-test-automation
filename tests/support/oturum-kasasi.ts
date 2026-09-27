// ŞİFRELİ OTURUM DOSYASI — model koşucusunun paylaşılan giriş oturumu (Playwright storageState: çerezler + yerel depolama).
// Oturum koşular arasında YENİDEN KULLANILIR (her senaryo ayrı süreçte koşar; geçerli oturum varsa yeniden giriş yapılmaz), bu
// yüzden silinmez; kasa anahtarından türetilen anahtarla (HKDF, AES-256-GCM zarfı) şifreli yazılır. Düz metin çerez diske
// YAZILMAZ: kasa anahtarı yoksa (PLATFORM_KASA_ANAHTARI) oturum hiç kaydedilmez. Açılamayan (kasa parolası değişti) ya da eski
// düz metin (.json) dosya silinir; bir sonraki koşu yeniden giriş yapar.
import { hkdfSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { zarfCoz, zarfMi, zarfSifrele } from '../../scripts/platform/kasa.mjs';

/** Şifreli oturum dosyasının uzantısı (eski düz metin dosyalar ".json"du). */
export const OTURUM_UZANTISI = '.oturum';
type OturumDurumu = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Kasa anahtarından türetilmiş oturum anahtarı (yoksa null). */
function oturumAnahtari(): Buffer | null {
  const ham = process.env.PLATFORM_KASA_ANAHTARI;
  if (!ham) return null;
  const kasa = Buffer.from(ham, 'base64url');
  if (kasa.length !== 32) return null;
  return Buffer.from(hkdfSync('sha256', kasa, Buffer.alloc(0), Buffer.from('nobetci-oturum-dosyasi-v1'), 32));
}

/** Klasördeki eski (düz metin) oturum dosyalarını siler. */
export function eskiOturumDosyalariniSil(klasor: string): void {
  if (!existsSync(klasor)) return;
  for (const ad of readdirSync(klasor)) {
    if (ad.endsWith('.json')) { try { rmSync(join(klasor, ad), { force: true }); } catch { /* yok sayılır */ } }
  }
}

/** Oturumu şifreli yazar (anahtar yoksa hiçbir şey yazılmaz). */
export async function oturumuSifreliYaz(baglam: BrowserContext, dosya: string): Promise<boolean> {
  const anahtar = oturumAnahtari();
  if (!anahtar) return false;
  try {
    const durum = await baglam.storageState();
    mkdirSync(dirname(dosya), { recursive: true });
    writeFileSync(dosya, zarfSifrele(anahtar, JSON.stringify(durum)), { encoding: 'utf8', mode: 0o600 });
    return true;
  } finally {
    anahtar.fill(0);
  }
}

/** Şifreli oturumu çözer (Playwright storageState nesnesi). Yoksa / açılamazsa undefined (açılamayan dosya silinir). */
export function oturumuSifreliOku(dosya: string): OturumDurumu | undefined {
  if (!existsSync(dosya)) return undefined;
  const anahtar = oturumAnahtari();
  if (!anahtar) return undefined;
  try {
    const metin = readFileSync(dosya, 'utf8').trim();
    if (!zarfMi(metin)) throw new Error('biçim');
    const durum = JSON.parse(zarfCoz(anahtar, metin)) as OturumDurumu;
    if (!durum || !Array.isArray(durum.cookies)) throw new Error('biçim');
    return durum;
  } catch {
    try { rmSync(dosya, { force: true }); } catch { /* yok sayılır */ }
    return undefined;
  } finally {
    anahtar.fill(0);
  }
}
