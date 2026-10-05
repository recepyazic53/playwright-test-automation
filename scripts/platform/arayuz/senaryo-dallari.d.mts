// scripts/platform/arayuz/senaryo-dallari.mjs için tip bildirimi.
export declare function kosulHaritasi(model: unknown): Map<string, unknown>;
export declare function kosulBasvurulari(ifade: unknown): Map<string, { pozitif: Set<unknown>; negatif: Set<unknown> }>;
export declare function bolumDuzeni<T extends { id: string }>(alanlar: T[], kosullar: Map<string, unknown>): { kontroller: T[]; digerleri: T[] };
export declare function grupDali(uyeIdler: string[], kosullar: Map<string, unknown>): { kontrolId: string; pozitif: unknown[]; negatif: unknown[] } | null;
export declare function grupGorunurlugu(durumlar: Array<boolean | null | undefined>): { gizli: boolean; belirsiz: boolean };
