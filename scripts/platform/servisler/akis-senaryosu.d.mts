// scripts/platform/servisler/akis-senaryosu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export declare function projeAkisSenaryolari(vt: Veritabani, projeId: string): any[];
export declare function gecenAkisSenaryolari(vt: Veritabani, projeId: string, servisId: string): any[];
export declare function akisSenaryoAtlamaNedeni(vt: Veritabani, s: unknown, ortam: unknown): string;
export declare function akisSenaryosuDenetle(vt: Veritabani, projeId: string, icerik: unknown): string[];
export declare function servisSenaryoGorunumu(vt: Veritabani, projeId: string, servisId: string, senaryolar: any[], sonSonuclar: Record<string, any>): { senaryolar: any[]; sonSonuclar: Record<string, any> };
export declare function akisSenaryoFormVerisi(vt: Veritabani, projeId: string, akisId: string): { akis: Record<string, unknown>; adimlar: any[]; canliEngeli: string[] };
export declare const AKIS_SENARYO_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const AKIS_SENARYO_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>;
