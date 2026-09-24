// scripts/platform/veritabani/gocler.mjs için tip bildirimi.
import type { Veritabani } from './baglanti.mjs';

export interface Goc { readonly surum: number; readonly ad: string; readonly sql: string }
export interface TabloBilgisi {
  readonly ad: string;
  readonly birincilAnahtar: string;
  readonly json: readonly string[];
  readonly guncellenme: boolean;
  readonly gecmisTuru?: string;
  readonly baslikAlani?: string;
}
export declare const GOCLER: readonly Goc[];
export declare const TABLOLAR: readonly TabloBilgisi[];
export declare const VERI_TABLOLARI: readonly string[];
export declare const GUNCEL_SEMA_SURUMU: number;
export declare function mevcutSemaSurumu(vt: Veritabani): number;
export declare function gocleriUygula(vt: Veritabani): { onceki: number; simdiki: number; uygulananlar: number[] };
