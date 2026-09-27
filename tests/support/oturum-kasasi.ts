// ŞİFRELİ OTURUM DOSYASI — model koşucusunun paylaşılan giriş oturumu (Playwright storageState: çerezler + yerel depolama).
// Oturum koşular arasında YENİDEN KULLANILIR (her senaryo ayrı süreçte koşar; geçerli oturum varsa yeniden giriş yapılmaz), bu
// yüzden silinmez; kasa anahtarından türetilen anahtarla (HKDF, AES-256-GCM zarfı) şifreli ve ATOMİK yazılır. Düz metin çerez
// diske YAZILMAZ: kasa anahtarı yoksa (PLATFORM_KASA_ANAHTARI) oturum hiç kaydedilmez. Açılamayan (kasa parolası değişti) ya da
// eski düz metin (.json) dosya silinir; bir sonraki koşu yeniden giriş yapar. Kurallar (yer, ad, şifre, atomik yazım) tarama /
// akış kaydıyla ORTAK: scripts/platform/giris/oturum-dosyasi.mjs ("Koşunun saklanan oturumunu kullan" aynı dosyayı okur/yazar).
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { OTURUM_UZANTISI as ORTAK_UZANTI, oturumAnahtariTuret, oturumDosyasiniOku, oturumDosyasinaYaz } from '../../scripts/platform/giris/oturum-dosyasi.mjs';

/** Şifreli oturum dosyasının uzantısı (eski düz metin dosyalar ".json"du). */
export const OTURUM_UZANTISI = ORTAK_UZANTI;
type OturumDurumu = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Kasa anahtarından türetilmiş oturum anahtarı (yoksa null). */
function oturumAnahtari(): Buffer | null {
  const ham = process.env.PLATFORM_KASA_ANAHTARI;
  if (!ham) return null;
  const kasa = Buffer.from(ham, 'base64url');
  try {
    return oturumAnahtariTuret(kasa);
  } finally {
    kasa.fill(0);
  }
}

/** Klasördeki eski (düz metin) oturum dosyalarını siler. */
export function eskiOturumDosyalariniSil(klasor: string): void {
  if (!existsSync(klasor)) return;
  for (const ad of readdirSync(klasor)) {
    if (ad.endsWith('.json')) { try { rmSync(join(klasor, ad), { force: true }); } catch { /* yok sayılır */ } }
  }
}

/** Oturumu şifreli ve atomik yazar (anahtar yoksa hiçbir şey yazılmaz). */
export async function oturumuSifreliYaz(baglam: BrowserContext, dosya: string): Promise<boolean> {
  const anahtar = oturumAnahtari();
  if (!anahtar) return false;
  try {
    return oturumDosyasinaYaz(dosya, anahtar, await baglam.storageState());
  } finally {
    anahtar.fill(0);
  }
}

/** Şifreli oturumu çözer (Playwright storageState nesnesi). Yoksa / açılamazsa undefined (açılamayan dosya silinir). */
export function oturumuSifreliOku(dosya: string): OturumDurumu | undefined {
  const anahtar = oturumAnahtari();
  if (!anahtar) return undefined;
  try {
    return oturumDosyasiniOku(dosya, anahtar) as OturumDurumu | undefined;
  } finally {
    anahtar.fill(0);
  }
}
