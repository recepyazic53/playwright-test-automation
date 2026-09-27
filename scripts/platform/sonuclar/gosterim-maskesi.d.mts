// scripts/platform/sonuclar/gosterim-maskesi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type GosterimMaskesi = { metin: (m: unknown) => string; ad: (m: unknown) => string };
export declare function gosterimMaskesi(vt: Veritabani, projeId: string | null | undefined): GosterimMaskesi;
export declare function sonucDetayiniMaskele<T extends Record<string, any>>(s: T, m: GosterimMaskesi): T;
export declare function kosuDetayiniMaskele<T extends Record<string, any>>(d: T, m: GosterimMaskesi): T;
export declare function hataKaliplariniMaskele<T extends Record<string, any>>(v: T, m: GosterimMaskesi): T;
export declare function servisSonucunuMaskele(yol: string, v: Record<string, any>, m: GosterimMaskesi): Record<string, any>;
