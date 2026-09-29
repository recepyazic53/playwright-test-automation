// scripts/platform/ayarlar/kosu-profilleri.mjs için tip bildirimi.
export type KanitProfilAdi = 'hafif' | 'dengeli' | 'tam';
export type HizProfilAdi = 'hizli' | 'normal' | 'yavas';
export interface ProfilTanimi { anahtar: string; varsayilan: unknown; enAz?: number; enCok?: number }
export declare const KANIT_ALANLARI: readonly string[];
export declare const KANIT_PROFILLERI: ReadonlyArray<{ ad: KanitProfilAdi; etiket: string; ozet: string; aciklama: string; degerler: Readonly<Record<string, string>> }>;
export declare const HIZ_ALANLARI: readonly string[];
export declare const HIZ_PROFILLERI: ReadonlyArray<{ ad: HizProfilAdi; etiket: string; ozet: string; carpan: number }>;
export declare function kanitDegerleri(ad: string): Record<string, string> | null;
export declare function hizDegerleri(tanimlar: ReadonlyArray<ProfilTanimi>, ad: string): Record<string, number> | null;
export declare function kanitProfili(ayarlar: Record<string, unknown>): KanitProfilAdi | 'ozel';
export declare function hizProfili(ayarlar: Record<string, unknown>, tanimlar: ReadonlyArray<ProfilTanimi>): HizProfilAdi | 'ozel';
