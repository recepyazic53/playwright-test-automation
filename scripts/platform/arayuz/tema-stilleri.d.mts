// scripts/platform/arayuz/tema-stilleri.mjs için tip bildirimi.
export declare const VARSAYILAN_STIL: 'komuta';
export declare const STILLER: ReadonlyArray<{ readonly ad: 'komuta' | 'kurumsal' | 'parlak'; readonly etiket: string; readonly aciklama: string }>;
export declare const ESKI_STIL_ADLARI: Readonly<Record<'canli', 'parlak'>>;
export declare function stilAdiniCoz(kayit: unknown): string;
