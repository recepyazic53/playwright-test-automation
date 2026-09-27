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
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number }): Promise<SqlSonucu & { kesildi: boolean }>;
export declare function sqlBaglantilari(vt: Veritabani, projeId: string): Array<{ id: string; ad: string; etkin: boolean; ortamIdleri: string[]; surucu: string; yalnizOkuma: boolean }>;
export declare function sqlBaglantiDenetle(vt: Veritabani, projeId: string, baglantiId: string): string | null;
export declare function kosuBaglantiAyarlari(vt: Veritabani, projeId: string, ortamId: string, idler: Iterable<string>): Record<string, VeritabaniAyari | { hata: string }>;
export declare function modeldekiSqlBaglantilari(kok: unknown): Set<string>;
export declare const SQL_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
