// scripts/platform/sonuclar/donem.mjs için tip bildirimi.
export declare const GUN_MS: number;
export declare const DONEM_TURLERI: ReadonlyArray<string>;
export declare const VARSAYILAN_DONEM: string;
export declare const EN_COK_GUN: number;
export declare const GERIYE_BAKIS_GUN: number;
export declare const GUNLUK_KIRILIM_SINIRI: number;
export declare class DonemHatasi extends Error {}
export type Kova = { bas: Date; bit: Date; etiket: string };
export type DonemSecimi = { tur: string; baslangic?: string; bitis?: string };
export type Donem = {
  tur: string; gun: number; bas: Date; bit: Date; onceki: { bas: Date; bit: Date }; geriBakisBas: Date;
  kirilim: 'gunluk' | 'haftalik'; kovalar: Kova[]; oncekiKovalar: Kova[]; etiket: string; oncekiEtiket: string;
};
export declare function gunEkle(d: Date, n: number): Date;
export declare function gunAnahtari(t: Date | number | string): string;
export declare function kisaGun(d: Date): string;
export declare function tamGun(d: Date): string;
export declare function kovalariUret(bas: Date, bit: Date, kirilim: 'gunluk' | 'haftalik'): Kova[];
export declare function kovaIndeksi(kovalar: Kova[], zamanMs: number): number;
export declare function aralikEtiketi(bas: Date, bit: Date): string;
export declare function donemHesapla(secim: DonemSecimi, simdi?: Date): Donem;
export declare function donemiBuguneKaydir(secim: DonemSecimi, simdi?: Date): DonemSecimi;
export declare function donemParcasi(d: Donem, zamanMs: number): 'D' | 'O' | 'G' | null;
