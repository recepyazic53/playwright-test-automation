// scripts/platform/sql/sorgu-bagdastirici.mjs için tip bildirimi.
import type { SqlSonucu } from './sql-adimi.mjs';
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
/** Çözülmüş bağlantı ayarı (parola dahil; yalnız bellekte). */
export type VeritabaniAyari = {
  surucu: 'mssql' | 'oracle' | 'postgres' | 'mysql'; sunucu: string; port?: number | null; veritabani?: string; kullanici?: string; parola?: string;
  tls?: 'kapali' | 'acik' | 'acik-dogrulamasiz'; zamanAsimiSn?: number; yalnizOkuma?: boolean;
};
export declare function sorguCalistir(vt: Veritabani, baglantiId: string, sql: string, parametreler: Record<string, unknown>,
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number; projeId?: string; ortamId?: string }): Promise<SqlSonucu & { kesildi: boolean }>;
export declare function ayarlaSorgula(ayar: VeritabaniAyari, sql: string, parametreler: Record<string, unknown>,
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number; izinler?: Record<string, unknown> | null }): Promise<SqlSonucu & { kesildi: boolean }>;
export declare function sqlBaglantilari(vt: Veritabani, projeId: string): Array<{ id: string; ad: string; etkin: boolean; ortamIdleri: string[]; surucu: string; yalnizOkuma: boolean }>;
export declare function sqlBaglantiDenetle(vt: Veritabani, projeId: string, baglantiId: string): string | null;
export declare function kosuBaglantiAyarlari(vt: Veritabani, projeId: string, ortamId: string, idler: Iterable<string>): Record<string, VeritabaniAyari | { hata: string }>;
export declare function modeldekiSqlBaglantilari(kok: unknown): Set<string>;
export declare const SQL_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export type SqlHedefTanimi = { veritabaniId?: string; baglantiId?: string };
export type KosuSqlVeritabani = { ad: string; baglantiId: string } | { ad?: string; hata: string };
export declare function sqlHedefi(vt: Veritabani, tanim: SqlHedefTanimi, s?: { projeId?: string; ortamId?: string }):
  { baglanti: import('../entegrasyonlar/depo.mjs').Baglanti; veritabani: import('./veritabanlari.mjs').MantiksalVeritabani | undefined };
export declare function sqlTanimiylaSorgula(vt: Veritabani, tanim: SqlHedefTanimi, sql: string, parametreler: Record<string, unknown>,
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number; projeId?: string; ortamId?: string }): Promise<SqlSonucu & { kesildi: boolean }>;
export declare function sqlTanimDenetle(vt: Veritabani, projeId: string, tanim: SqlHedefTanimi): string | null;
export declare function kosuSqlVerisi(vt: Veritabani, projeId: string, ortamId: string, h: { baglantiIdleri: Iterable<string>; veritabaniIdleri: Iterable<string> }): {
  sqlBaglantilari: Record<string, VeritabaniAyari | { hata: string }>; sqlVeritabanlari: Record<string, KosuSqlVeritabani>; sqlBaglantiAdlari: Record<string, string>;
};
export declare function kosuSqlAyari(veri: { sqlBaglantilari?: Record<string, VeritabaniAyari | { hata: string }>; sqlVeritabanlari?: Record<string, KosuSqlVeritabani>; sqlBaglantiAdlari?: Record<string, string> },
  tanim: SqlHedefTanimi): { ayar: VeritabaniAyari; baglantiId: string; baglantiAdi: string; veritabaniAdi?: string } | { hata: string };
export declare function modeldekiSqlHedefleri(kok: unknown): { baglantiIdleri: Set<string>; veritabaniIdleri: Set<string> };
