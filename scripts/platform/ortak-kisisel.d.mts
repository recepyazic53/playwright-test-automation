import type { Veritabani } from './veritabani/baglanti.mjs';

export type Satir = Record<string, unknown>;
export declare const ORTAK_KISISEL_SUTUNLAR: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
export declare const ORTAK_DISI_TABLOLAR: readonly string[];
export declare const ORTAK_MEDYA_TURU: string;
export declare function kisiselEntegrasyonAlanlari(tur: string): string[];
export declare function ortakIcinTemizle(tablolar: Record<string, Satir[]>, anahtar: Buffer): Record<string, Satir[]>;
export declare function yerelKisiseliKoru(vt: Veritabani, tablolar: Record<string, Satir[]>, anahtar: Buffer): void;
