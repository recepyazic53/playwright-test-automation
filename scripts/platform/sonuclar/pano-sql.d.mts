// scripts/platform/sonuclar/pano-sql.mjs için tip bildirimi.
import type { PanoSqlSonucu } from './ozet-panosu.mjs';
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export declare const PANO_SQL_UCU: '/platform/pano/sql/yenile';
export declare const PANO_SQL_ZAMAN_ASIMI_MS: number;
export declare const PANO_SQL_EN_COK_ZAMAN_ASIMI_MS: number;
export declare function kartZamanAsimiMs(sn: unknown): number;
export declare const PANO_SQL_SATIR_SINIRI: number;
export declare const MASKE: string;
export declare function gizliSutunMu(ad: string, ekler: ReadonlyArray<string>, kisisel?: boolean): boolean;
export declare function sonucuMaskele(r: { sutunlar: string[]; satirlar: unknown[][] }, m: { ekler: ReadonlyArray<string>; gizliDegerler: ReadonlyArray<string>; kisisel?: boolean }):
  { sutunlar: string[]; satirlar: unknown[][]; gizliSutunlar: string[] };
export declare function hataIletisi(hata: unknown, ayar: { sunucu?: string; kullanici?: string; parola?: string; veritabani?: string; port?: number | null }, zamanAsimiMs: number): string;
export declare function sqlKarti(vt: Veritabani, projeId: string, kartId: string): {
  id: string; ayar: { baslik: string; hedef: { veritabaniId?: string; ortamId?: string; baglantiId?: string }; sorgu: string };
};
export declare function panoSqlCanliOrtamlari(vt: Veritabani, g: { projeId?: unknown; kartId?: unknown }): string[];
export declare function panoSorgusuDenetle(sql: string): void;
export declare function panoSqlYenile(vt: Veritabani, projeId: string, kartId: string, s?: { zamanAsimiMs?: number; satirSiniri?: number; simdi?: () => Date }): Promise<PanoSqlSonucu>;
export declare const PANO_INCELE_UCU: '/platform/pano/sql/incele';
export declare const PANO_INCELE_SATIR_SINIRI: number;
export declare function panoSqlIncele(vt: Veritabani, projeId: string, kartId: string, g: { satirIndeksi: unknown; zaman: unknown },
  s?: { zamanAsimiMs?: number; satirSiniri?: number }): Promise<{ zaman: string; sutunlar: string[]; satirlar: unknown[][]; gizliSutunlar: string[]; kesildi: boolean; satirSiniri: number }>;
