// scripts/platform/tarama/alan-kilitleri.mjs için tip bildirimi (alan kilidi kararı; hızlı test ve normal koşu ortak).
export declare const BETIKLE_YAZAN_DOLDURUCULAR: ReadonlySet<string>;
/** Okunan kilit nedeni alanı önden atlatır mı: yalnız model alanın seçime göre kilitlendiğini söylüyorsa (önce dene ilkesi). */
export declare function kilitEngeller(kilit: string | null | undefined, s?: { seciminGore?: boolean }): boolean;
