import type { Veritabani } from '../veritabani/baglanti.mjs';

export type EkranBaglari = Record<string, { tablo: string; sutun: string; etiket?: string }>;
export declare function ekranAlanBaglari(vt: Veritabani, ekranId: string): EkranBaglari;
export declare function ekranAlanBaglariniKaydet(vt: Veritabani, projeId: string, ekranId: string, baglar: unknown): EkranBaglari;
export declare function tabloEkranKullanimi(vt: Veritabani, projeId: string): { ekranAdlari: string[]; ekranKullanimi: Record<string, string[]> };
export type OrtakAkisBaglari = Record<string, { tablo: string; sutun: string; etiket?: string; ortakAkis: { id: string; ad: string } }>;
export declare function ortakAkisBaglari(vt: Veritabani, ekranId: string): OrtakAkisBaglari;
export declare function kullanilanOrtakAkislar(vt: Veritabani, ekranId: string): Array<{ id: string; ad: string }>;
export declare function baglamakGerekmez(g: { tip?: unknown; secenekler?: unknown; senaryoAyari?: unknown }): boolean;
export declare function etkinAlanBaglari(vt: Veritabani, ekranId: string): EkranBaglari;
