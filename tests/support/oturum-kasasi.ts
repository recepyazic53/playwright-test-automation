// ŞİFRELİ OTURUM DOSYASI — model koşucusunun paylaşılan giriş oturumu (Playwright storageState: çerezler + yerel depolama).
// Oturum koşular arasında YENİDEN KULLANILIR (her senaryo ayrı süreçte koşar; geçerli oturum varsa yeniden giriş yapılmaz), bu
// yüzden silinmez; kasa anahtarından türetilen anahtarla (HKDF, AES-256-GCM zarfı) şifreli ve ATOMİK yazılır. Düz metin çerez
// diske YAZILMAZ: kasa anahtarı yoksa (PLATFORM_KASA_ANAHTARI) oturum hiç kaydedilmez. Açılamayan (kasa parolası değişti) ya da
// eski düz metin (.json) dosya silinir; bir sonraki koşu yeniden giriş yapar. Kurallar (yer, ad, şifre, atomik yazım) tarama /
// akış kaydıyla ORTAK: scripts/platform/giris/oturum-dosyasi.mjs ("Koşunun saklanan oturumunu kullan" aynı dosyayı okur/yazar).
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// ---- Eşzamanlı ekran koşusu (Ayarlar > Koşu > Ekran senaryoları > 1): her senaryo ayrı süreçte koşar ve paylaşılan oturum
// dosyasını okur. Oturum geçersizse giriş KİLİTLE yapılır (süreçler arası; dosyanın yanında "<dosya>.kilit" klasörü): kilidi alan
// süreç önce başka bir sürecin bu arada yazdığı oturumu dener, geçerliyse aynı kullanıcıyla ikinci kez giriş yapılmaz.
/** Bu sürecin başladığı an: oturum dosyası bundan sonra yazıldıysa başka bir süreç yenilemiştir. */
const SUREC_BASLANGICI = Date.now();
const KILIT_BAYAT_MS = 3 * 60_000;
const KILIT_EN_COK_BEKLEME_MS = 5 * 60_000;

/** fn'i oturum dosyasının süreçler arası kilidiyle çalıştırır (bayat kilit — 3 dk — kırılır; 5 dk sonra kilitsiz sürer). */
export async function oturumKilidiyle<T>(dosya: string, fn: () => Promise<T>): Promise<T> {
  const kilit = `${dosya}.kilit`;
  mkdirSync(dirname(dosya), { recursive: true });
  const son = Date.now() + KILIT_EN_COK_BEKLEME_MS;
  let alindi = false;
  while (!alindi && Date.now() < son) {
    try {
      mkdirSync(kilit);
      alindi = true;
    } catch {
      try { if (Date.now() - statSync(kilit).mtimeMs > KILIT_BAYAT_MS) rmSync(kilit, { recursive: true, force: true }); } catch { /* bu arada bırakıldı */ }
      if (!alindi) await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    if (alindi) { try { rmSync(kilit, { recursive: true, force: true }); } catch { /* yok sayılır */ } }
  }
}

/**
 * Bu süreç başladıktan SONRA başka bir süreç oturum dosyasını yazdıysa o oturumu bağlama yükler (çerezler + yerel depolama) ve
 * true döner; yoksa false (bağlam değişmez).
 */
export async function yeniOturumuYukle(baglam: BrowserContext, dosya: string): Promise<boolean> {
  try { if (!existsSync(dosya) || statSync(dosya).mtimeMs <= SUREC_BASLANGICI) return false; } catch { return false; }
  const durum = oturumuSifreliOku(dosya);
  if (!durum) return false;
  await baglam.clearCookies();
  if (durum.cookies.length) await baglam.addCookies(durum.cookies);
  if (durum.origins.length) {
    await baglam.addInitScript((kokenler: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>) => {
      const k = kokenler.find((x) => x.origin === location.origin);
      if (!k) return;
      try { for (const o of k.localStorage) localStorage.setItem(o.name, o.value); } catch { /* depolama kapalı */ }
    }, durum.origins);
  }
  return true;
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
