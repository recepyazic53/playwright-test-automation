// scripts/platform/guvenlik/ortam-riski.mjs için tip bildirimi.
export type RiskOrtami = { riskli?: unknown; canli?: unknown; ad?: unknown; varsayilan?: unknown; ayarlar?: { riskli?: unknown; canli?: unknown } | Record<string, unknown> | null } | null | undefined;
export declare const RISKLI_ORTAM_TANIMI: string;
export declare function riskliSecimi(ortam: RiskOrtami): boolean | null;
export declare function riskliOrtamMi(ortam: RiskOrtami): boolean;
export declare function riskBelirtilmemisMi(ortam: RiskOrtami): boolean;
export declare function adCanliyiCagristiriyorMu(ad: unknown): boolean;
export declare function canliIsaretliMi(ortam: RiskOrtami): boolean;
