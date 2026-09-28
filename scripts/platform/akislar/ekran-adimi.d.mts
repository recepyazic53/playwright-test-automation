// scripts/platform/akislar/ekran-adimi.mjs için tip bildirimi.
export declare const EKRAN_OKUMA_ADI: RegExp;
export declare const EZME_ANAHTARI: RegExp;
export declare const EN_COK_EZME: number;
export declare const EN_COK_EKRAN_OKUMASI: number;
export type EkranOkumasi = { ad: string; kaynak: 'ekran'; yol: string; gizli?: boolean };
export type EkranAdimi = {
  id: string; ad: string; tur: 'ekran'; senaryoId: string; ezmeler: Record<string, string>; okumalar: EkranOkumasi[]; hataOlursaDevam?: boolean;
};
export declare function ekranAdimiMi(a: unknown): boolean;
export declare function ekranAdimiDogrula(ham: unknown, yer: string, id: string): { tanim: EkranAdimi | null; hatalar: string[] };
export declare function akisAdlari(metin: string): string[];
export declare function ekranAdimiAkisDegerleri(a: unknown): string[];
export declare function ezmeleriCoz(ezmeler: Record<string, string>, degerler: Record<string, string>): { degerler: Record<string, string>; eksik: string[] };
