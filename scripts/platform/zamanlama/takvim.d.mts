// scripts/platform/zamanlama/takvim.mjs için tip bildirimi.
export type Zaman =
  | { tur: 'gunluk'; saat: string }
  | { tur: 'haftalik'; saat: string; gunler: number[] }
  | { tur: 'aralik'; saatAraligi: number; baslangic: string };

export declare const TOLERANS_MS: number;
export declare const SAAT_ARALIKLARI: readonly number[];
export declare const GUN_ADLARI: readonly string[];
export declare function zamanDogrula(girdi: unknown): Zaman;
export declare function gununZamanlari(z: Zaman, t: Date): Date[];
export declare function sonrakiZaman(z: Zaman, simdi: Date): Date | null;
export declare function oncekiZaman(z: Zaman, simdi: Date): Date | null;
export declare function vadesiGelenZaman(z: Zaman, simdi: Date, tuketilen: string | null | undefined, toleransMs?: number): Date | null;
export declare function sonrakiZamanlar(z: Zaman, simdi: Date, adet: number): Date[];
export declare function zamanMetni(z: Zaman): string;
