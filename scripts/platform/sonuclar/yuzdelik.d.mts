// scripts/platform/sonuclar/yuzdelik.mjs için tip bildirimi.
export declare const P99_EN_AZ: number;
export declare const YAVASLAMA_KATSAYISI: number;
export declare const YAVASLAMA_EN_AZ: number;
export declare function yuzdelik(degerler: ReadonlyArray<unknown>, x: number): number | null;
export declare function yuzdelikler(degerler: ReadonlyArray<unknown>): { n: number; p50: number | null; p95: number | null; p99: number | null; ortalama: number | null };
export declare function yavasladiMi(p95: number | null | undefined, oncekiP95: number | null | undefined, n: number): boolean;
