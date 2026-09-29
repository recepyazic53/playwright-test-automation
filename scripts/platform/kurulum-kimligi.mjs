// KURULUM KİMLİĞİ (genel): bu bilgisayarda birden çok Nöbetçi kurulumu (ör. indirilen paket ve proje klasörü) aynı anda
// çalışabilir. Başlatıcı (scripts/baslat.mjs) portta çalışan sunucunun KENDİ kurulumuna ait olup olmadığını buradan anlar.
// - Kimlik: veri klasörünün (kasa, çalışma alanları) tam yolunun kısa özeti (SHA-256, 16 hane). Aynı veri klasörü = aynı
//   kurulum: aynı kasayı açan iki sunucu başlatılmaz. Yolun kendisi yanıtta yer almaz.
// - Sunucu GET /saglik yanıtına { uygulama: 'nobetci', kurulum } ekler (token gerekmez; yalnız 127.0.0.1).
// - sunucuYeriniBul: istenen porttan başlayıp sırayla bakar — kendi sunucusu bulunursa 'mevcut'; başka bir kurulumun
//   sunucusu ya da başka bir uygulama portu tutuyorsa atlanır; ilk boş port 'yeni' olarak döner. Karşı tarafın sürecine
//   dokunulmaz; hiçbir dış adrese istek atılmaz.
// - Eski sürüm sunucular kimlik bildirmez (kurulum: null): veriyi iki sunucuyla açmamak için bugünkü gibi 'mevcut' sayılır
//   ve kullanıcıya uyarı gösterilir (kurulumBilinmiyor).
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

/** Bir portta en çok kaç ardışık port denenir (istenen dahil). */
export const EN_COK_PORT_DENEMESI = 20;

/** @param {string} veriKokuYolu @returns {string} */
export function kurulumKimligi(veriKokuYolu) {
  let yol = resolve(veriKokuYolu).replace(/[\\/]+$/, '');
  if (process.platform === 'win32' || process.platform === 'darwin') yol = yol.toLowerCase();
  return createHash('sha256').update(`nobetci-kurulum\n${yol}`).digest('hex').slice(0, 16);
}

/**
 * Porttaki sunucunun sağlık yanıtı. Yanıt yoksa null; Nöbetçi değilse { nobetci: false }.
 * @param {number} port @param {number} [zamanAsimiMs]
 * @returns {Promise<{ nobetci: boolean; kurulum: string | null } | null>}
 */
export async function saglikOku(port, zamanAsimiMs = 1000) {
  let yanit;
  try {
    yanit = await fetch(`http://127.0.0.1:${port}/saglik`, { signal: AbortSignal.timeout(zamanAsimiMs) });
  } catch {
    return null;
  }
  /** @type {unknown} */
  let govde = null;
  try { govde = await yanit.json(); } catch { /* Nöbetçi değil */ }
  if (!yanit.ok || !govde || typeof govde !== 'object') return { nobetci: false, kurulum: null };
  const g = /** @type {Record<string, unknown>} */ (govde);
  const nobetci = g.uygulama === 'nobetci' || (g.basarili === true && g.mesaj === 'Test sunucusu çalışıyor.');
  return { nobetci, kurulum: nobetci && typeof g.kurulum === 'string' && g.kurulum ? g.kurulum : null };
}

/** 127.0.0.1'de bu port dinlenebilir mi? @param {number} port @returns {Promise<boolean>} */
export function portBosMu(port) {
  return new Promise((coz) => {
    const s = createServer();
    s.once('error', () => coz(false));
    s.listen(port, '127.0.0.1', () => s.close(() => coz(true)));
  });
}

/**
 * Kendi sunucusunu bulur ya da yenisi için boş port seçer.
 * @param {{ port: number; kimlik: string; enCok?: number;
 *   saglik?: (port: number) => Promise<{ nobetci: boolean; kurulum: string | null } | null>; bosMu?: (port: number) => Promise<boolean> }} s
 * @returns {Promise<import('./kurulum-kimligi.d.mts').SunucuYeri>}
 */
export async function sunucuYeriniBul(s) {
  const saglik = s.saglik ?? saglikOku;
  const bosMu = s.bosMu ?? portBosMu;
  const enCok = Math.max(1, s.enCok ?? EN_COK_PORT_DENEMESI);
  /** @type {number[]} */
  const baskaKurulumlar = [];
  /** @type {number[]} */
  const baskaUygulamalar = [];
  for (let i = 0; i < enCok; i++) {
    const port = s.port + i;
    if (port > 65535) break;
    const y = await saglik(port);
    if (y && y.nobetci) {
      if (y.kurulum === s.kimlik) return { tur: 'mevcut', port, baskaKurulumlar, baskaUygulamalar, kurulumBilinmiyor: false };
      if (y.kurulum === null) return { tur: 'mevcut', port, baskaKurulumlar, baskaUygulamalar, kurulumBilinmiyor: true };
      baskaKurulumlar.push(port);
      continue;
    }
    if (await bosMu(port)) return { tur: 'yeni', port, baskaKurulumlar, baskaUygulamalar, kurulumBilinmiyor: false };
    baskaUygulamalar.push(port);
  }
  return { tur: 'yok', port: null, baskaKurulumlar, baskaUygulamalar, kurulumBilinmiyor: false };
}

/**
 * Kullanıcıya gösterilecek bildirim (gerekmiyorsa null).
 * @param {import('./kurulum-kimligi.d.mts').SunucuYeri} yer @param {number} istenenPort
 * @returns {string | null}
 */
export function sunucuYeriBildirimi(yer, istenenPort) {
  const liste = (/** @type {number[]} */ p) => p.join(', ');
  if (yer.tur === 'yok') {
    return `${istenenPort}–${istenenPort + EN_COK_PORT_DENEMESI - 1} portlarının hiçbiri boş değil; Nöbetçi başlatılamadı. TEST_SUNUCU_PORT ile başka bir port seçin.`;
  }
  if (yer.kurulumBilinmiyor) {
    return `${yer.port} portunda kurulum kimliğini bildirmeyen eski bir Nöbetçi sürümü çalışıyor; bu kurulumun olmayabilir. Başka bir kasa görürseniz o Nöbetçi'yi kapatıp bunu yeniden başlatın.`;
  }
  if (yer.port === istenenPort) return null;
  const parcalar = [];
  if (yer.baskaKurulumlar.length) parcalar.push(`Bu bilgisayarda başka bir Nöbetçi ${liste(yer.baskaKurulumlar)} portunda çalışıyor`);
  if (yer.baskaUygulamalar.length) parcalar.push(`${liste(yer.baskaUygulamalar)} portunu başka bir uygulama kullanıyor`);
  const ek = yer.tur === 'yeni' ? `bu kurulum ${yer.port} portunda açıldı` : `bu kurulumun Nöbetçi'si ${yer.port} portunda çalışıyor`;
  return `${parcalar.join('; ')}; ${ek}.`;
}
