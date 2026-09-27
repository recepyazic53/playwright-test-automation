// scripts/platform/guvenlik/ortam-riski.mjs için tip bildirimi.
export type RiskOrtami = { canli?: unknown; varsayilan?: unknown; ad?: unknown; ayarlar?: { canli?: unknown } | null } | null | undefined;
export declare function riskliOrtamMi(ortam: RiskOrtami): boolean;
export declare function canliIsaretliMi(ortam: RiskOrtami): boolean;
