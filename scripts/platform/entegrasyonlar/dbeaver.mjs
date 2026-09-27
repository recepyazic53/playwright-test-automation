// DBEAVER BAĞLANTILARINI İÇE AKTARMA — kullanıcının SEÇTİĞİ data-sources.json dosyasının içeriğinden (Nöbetçi dosyayı
// kendiliğinden okumaz; arayüzde kullanıcı seçer) bağlantı adı, sürücü, sunucu, port, veritabanı ve (varsa) kullanıcı adı
// alınır. Parolalar ALINMAZ (DBeaver onları ayrı, şifreli bir dosyada tutar); kullanıcı Nöbetçi'de girer.
// Varsayılan yer (Windows): %APPDATA%\DBeaverData\workspace6\General\.dbeaver\data-sources.json
// NOT: import.meta KULLANILMAZ.
import { EntegrasyonHatasi } from './istek.mjs';
import { SURUCULER } from './veritabani-suruculeri.mjs';

/**
 * @typedef {{ kaynakId: string; ad: string; surucu: 'mssql' | 'oracle' | 'postgres' | 'mysql' | null; kaynakSurucu: string; sunucu: string;
 *   port: number | null; veritabani: string; kullanici: string; destekleniyor: boolean; neden: string | null }} DbeaverBaglantisi
 */

/** @param {string} metin @returns {'mssql' | 'oracle' | 'postgres' | 'mysql' | null} */
function surucuEsle(metin) {
  const m = metin.toLowerCase();
  if (/postgres|greenplum|redshift|cockroach/.test(m)) return 'postgres';
  if (/mysql|maria/.test(m)) return 'mysql';
  if (/sqlserver|mssql|jtds|microsoft|azure-sql/.test(m)) return 'mssql';
  if (/oracle/.test(m)) return 'oracle';
  return null;
}

/** JDBC adresinden host / port / veritabanı. @param {string} url */
function jdbcCoz(url) {
  const m = /\/\/(?:[^@/]*@)?([^:/;?]+)(?::(\d+))?(?:[/:]([^;?/]+))?/.exec(url) || /@([^:/;?]+)(?::(\d+))?[:/]([^;?/]+)/.exec(url);
  const vt = /databaseName=([^;]+)/i.exec(url);
  return { host: m?.[1] ?? '', port: m?.[2] ?? '', veritabani: vt?.[1] ?? m?.[3] ?? '' };
}

const temiz = (/** @type {unknown} */ v, uzunluk = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().replace(/[\u0000-\u001f]/g, '').slice(0, uzunluk) : '');

/**
 * data-sources.json içeriğini ayrıştırır (önizleme). Geçersiz JSON → EntegrasyonHatasi.
 * @param {unknown} icerik dosyanın metni @returns {DbeaverBaglantisi[]}
 */
export function dbeaverBaglantilariniOku(icerik) {
  if (typeof icerik !== 'string' || !icerik.trim()) throw new EntegrasyonHatasi('Dosya boş.');
  let j;
  try { j = JSON.parse(icerik.replace(/^﻿/, '')); } catch { throw new EntegrasyonHatasi('Dosya geçerli bir JSON değil. DBeaver\'ın data-sources.json dosyasını seçin.'); }
  const baglantilar = j && typeof j === 'object' && j.connections && typeof j.connections === 'object' ? j.connections : null;
  if (!baglantilar) throw new EntegrasyonHatasi('Dosyada DBeaver bağlantısı ("connections") bulunamadı. data-sources.json dosyasını seçin.');
  /** @type {DbeaverBaglantisi[]} */
  const sonuc = [];
  for (const [kaynakId, ham] of Object.entries(baglantilar).slice(0, 500)) {
    if (!ham || typeof ham !== 'object') continue;
    const b = /** @type {Record<string, any>} */ (ham);
    const c = b.configuration && typeof b.configuration === 'object' ? b.configuration : {};
    const kaynakSurucu = temiz(`${b.provider ?? ''} ${b.driver ?? ''}`.trim(), 120);
    const surucu = surucuEsle(kaynakSurucu);
    const jdbc = typeof c.url === 'string' ? jdbcCoz(c.url) : { host: '', port: '', veritabani: '' };
    const sunucu = temiz(c.host) || jdbc.host;
    const portMetni = temiz(c.port) || jdbc.port;
    const port = /^\d{1,5}$/.test(portMetni) && Number(portMetni) > 0 && Number(portMetni) <= 65535 ? Number(portMetni) : null;
    const veritabani = temiz(c.database) || jdbc.veritabani;
    const neden = !surucu ? `Desteklenmeyen sürücü (${kaynakSurucu || 'bilinmiyor'}); desteklenenler: ${Object.values(SURUCULER).map((s) => s.etiket).join(', ')}.`
      : !sunucu ? 'Sunucu adı bulunamadı.' : null;
    sonuc.push({
      kaynakId: temiz(kaynakId, 200), ad: temiz(b.name, 120) || temiz(kaynakId, 120), surucu, kaynakSurucu, sunucu, port, veritabani,
      kullanici: temiz(c.user), destekleniyor: !neden, neden
    });
  }
  return sonuc;
}
