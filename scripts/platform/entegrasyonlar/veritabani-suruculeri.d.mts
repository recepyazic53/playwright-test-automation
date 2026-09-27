// scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs için tip bildirimi.
import type { YasakDeseni } from './istek.mjs';

export type SurucuAdi = 'mssql' | 'oracle' | 'postgres' | 'mysql';
export interface VeritabaniAyari {
  surucu: SurucuAdi; sunucu: string; port?: number | null; veritabani?: string; kullanici?: string; parola?: string;
  tls?: 'kapali' | 'acik' | 'acik-dogrulamasiz'; zamanAsimiSn?: number; yalnizOkuma?: boolean;
}
export interface SorguSonucu { sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean }
export declare const SURUCULER: Readonly<Record<SurucuAdi, { etiket: string; paket: string; modul?: string; port: number; deneme: string }>>;
export declare function surucuYukleyiciAyarla(fn: ((paket: string) => Promise<any>) | null): void;
export declare function yalnizOkumaDenetle(sql: string): void;
export declare function yazmaSorgusuMu(sql: string): boolean;
export declare function sorguIzinleri(ayar: { yalnizOkuma?: boolean }, sql: string): string[];
export declare function parametreleriDonustur(surucu: SurucuAdi, sql: string, parametreler: Record<string, unknown>): { sql: string; degerler: unknown[]; adlar: Record<string, unknown> };
export declare function veritabaniSorgusu(ayar: VeritabaniAyari, sql: string, parametreler: Record<string, unknown> | null | undefined,
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number; yasakDesenleri?: ReadonlyArray<YasakDeseni> }): Promise<SorguSonucu>;
