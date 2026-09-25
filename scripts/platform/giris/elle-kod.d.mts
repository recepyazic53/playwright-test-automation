// scripts/platform/giris/elle-kod.mjs için tip bildirimi.
export declare const KOD_YOLU_DEGISKENI: 'TEST_SUNUCU_KOD_YOLU';
export declare const KOD_DESENI: RegExp;
export declare function kodIstegiYaz(yol: string, istek: { mesaj: string; sureMs: number }): void;
export declare function kodIstegiOku(yol: string): { mesaj: string; kalanSn: number } | null;
export declare function koduYanitla(yol: string, kod: string): boolean;
export declare function kodYanitiniBekle(yol: string, sureMs: number, secenekler?: { aralikMs?: number; iptal?: () => boolean }): Promise<string | null>;
export declare function kodIsteginiTemizle(yol: string): void;
