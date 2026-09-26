import type { Veritabani } from '../veritabani/baglanti.mjs';

export type EkranBaglari = Record<string, { tablo: string; sutun: string; etiket?: string }>;
export declare function ekranAlanBaglari(vt: Veritabani, ekranId: string): EkranBaglari;
export declare function ekranAlanBaglariniKaydet(vt: Veritabani, projeId: string, ekranId: string, baglar: unknown): EkranBaglari;
