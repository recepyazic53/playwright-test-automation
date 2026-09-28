// UÇTAN UCA AKIŞ — sunucu ↔ ekran koşusu (Playwright süreci) arasındaki değer taşıma kanalı. Saf olmayan (node:crypto, node:fs)
// küçük yardımcı; sunucu (akislar/uctan-uca.mjs) ve koşucu (tests/support/uctan-uca-adimi.ts) ORTAK kullanır.
//   Giden (sunucu → koşu): NOBETCI_AKIS_ADIMI ortam değişkeni (yalnız alt sürecin belleğinde; kasa anahtarının geçtiği yolla
//     aynı): { senaryoId, ezmeler (${akis:Ad} çözülmüş), gizliDegerler (maskelenecek değerler), okumalar: [{ ad, yol, gizli }] }.
//   Gelen (koşu → sunucu): ekrandan okunan değerler, koşuya özgü rastgele anahtarla (AES-256-GCM) ŞİFRELİ, yalnız kullanıcının
//     okuyabildiği geçici bir dosyaya yazılır (NOBETCI_AKIS_CIKTI_DOSYASI + NOBETCI_AKIS_CIKTI_ANAHTARI); sunucu koşu bitince
//     okur ve dosyayı siler. Anahtar diske yazılmaz.
// NOT: import.meta KULLANILMAZ.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export const AKIS_ADIMI_DEGISKENI = 'NOBETCI_AKIS_ADIMI';
export const AKIS_CIKTI_DOSYASI_DEGISKENI = 'NOBETCI_AKIS_CIKTI_DOSYASI';
export const AKIS_CIKTI_ANAHTARI_DEGISKENI = 'NOBETCI_AKIS_CIKTI_ANAHTARI';
/** Koşucuya verilebilecek ek ortam değişkenlerinin öneki (test-sunucu.mjs yalnız bunları geçirir). */
export const AKIS_ORTAM_ONEKI = 'NOBETCI_AKIS_';

/** Koşuya özgü rastgele anahtar (base64url, 32 bayt). */
export function ciktiAnahtariUret() {
  return randomBytes(32).toString('base64url');
}

/** @param {string} anahtar base64url @returns {Buffer} */
function anahtarAl(anahtar) {
  const b = Buffer.from(String(anahtar ?? ''), 'base64url');
  if (b.length !== 32) throw new Error('Akış çıktı anahtarı geçersiz.');
  return b;
}

/**
 * Ekrandan okunan değerleri şifreli yazar (dosya yalnız kullanıcıya açık: 0600).
 * @param {string} yol @param {string} anahtar @param {{ okunanlar: Record<string, string>; gizliOkunanlar: string[] }} veri
 */
export function akisCiktisiYaz(yol, anahtar, veri) {
  const iv = randomBytes(12);
  const sifre = createCipheriv('aes-256-gcm', anahtarAl(anahtar), iv);
  const govde = Buffer.concat([sifre.update(JSON.stringify(veri), 'utf8'), sifre.final()]);
  const kayit = { v: 1, iv: iv.toString('base64'), etiket: sifre.getAuthTag().toString('base64'), veri: govde.toString('base64') };
  writeFileSync(yol, JSON.stringify(kayit), { encoding: 'utf8', mode: 0o600 });
}

/**
 * Şifreli çıktıyı okur (yoksa / bozuksa null). Okunan değerler yalnız bellekte kalır.
 * @param {string} yol @param {string} anahtar @returns {{ okunanlar: Record<string, string>; gizliOkunanlar: string[] } | null}
 */
export function akisCiktisiOku(yol, anahtar) {
  if (!existsSync(yol)) return null;
  try {
    const k = JSON.parse(readFileSync(yol, 'utf8'));
    const coz = createDecipheriv('aes-256-gcm', anahtarAl(anahtar), Buffer.from(String(k.iv), 'base64'));
    coz.setAuthTag(Buffer.from(String(k.etiket), 'base64'));
    const metin = Buffer.concat([coz.update(Buffer.from(String(k.veri), 'base64')), coz.final()]).toString('utf8');
    const v = JSON.parse(metin);
    /** @type {Record<string, string>} */
    const okunanlar = {};
    if (v && typeof v.okunanlar === 'object' && v.okunanlar) for (const [a, d] of Object.entries(v.okunanlar)) if (typeof d === 'string') okunanlar[a] = d;
    return { okunanlar, gizliOkunanlar: Array.isArray(v?.gizliOkunanlar) ? v.gizliOkunanlar.filter((/** @type {unknown} */ x) => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}

/** Çıktı dosyasını siler (yoksa sessiz). @param {string} yol */
export function akisCiktisiniSil(yol) {
  try { rmSync(yol, { force: true }); } catch { /* yok sayılır */ }
}

/**
 * Koşucuya verilecek ek ortam değişkenlerinden yalnız akış kanalına ait olanlar (başka değişken geçirilmez).
 * @param {unknown} ek @returns {Record<string, string>}
 */
export function akisOrtamDegiskenleri(ek) {
  /** @type {Record<string, string>} */
  const sonuc = {};
  if (!ek || typeof ek !== 'object' || Array.isArray(ek)) return sonuc;
  for (const [a, d] of Object.entries(ek)) {
    if (a.startsWith(AKIS_ORTAM_ONEKI) && /^[A-Z_]{1,60}$/.test(a) && typeof d === 'string' && d.length <= 30_000) sonuc[a] = d;
  }
  return sonuc;
}
