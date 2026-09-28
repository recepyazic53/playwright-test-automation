// scripts/platform/sonuclar/oncelik.mjs için tip bildirimi.
export type Sinif = 'uygulama' | 'veri' | 'bakim' | 'ortam' | 'kararsiz';
export declare const SINIFLAR: Readonly<Record<Sinif, Readonly<{ ad: string; katsayi: number; sahip: string; simge: string }>>>;
export declare const EGILIM_AGIRLIKLARI: Readonly<Record<string, number>>;
export declare const BILESEN_AGIRLIKLARI: Readonly<{ etki: number; siklik: number; egilim: number; kritiklik: number; sureklilik: number }>;
export declare const BANT_ESIKLERI: Readonly<{ p1: number; p2: number }>;
export declare const ETKI_SENARYO: number;
export declare const SIKLIK_ORANI: number;
export declare const SUREKLILIK_GUN: number;
export declare const EK_AKSIYON_PUANI: number;
export declare function oncelikPuani(s: { sinif: string; durum: string; senaryo: number; oran: number; kritiklik?: number; acikGun?: number }): number;
export declare function bant(puan: number): 'P1' | 'P2' | 'P3';
export declare function sahipOnerisi(sinif: string): string;
export declare function aksiyonOnerisi(s: { sinif: string; tur: 'ekran' | 'servis' }): string;
export declare function aksiyonListesi<T extends { durum: string; puan: number }>(sorunlar: ReadonlyArray<T>, adet?: number): T[];
export declare function durumRozeti(g: { basari: number | null; p1: number; esikler: { yesil: number; sari: number }; kritikKaldi?: boolean }): {
  durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string;
};
