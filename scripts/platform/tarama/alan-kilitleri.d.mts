// scripts/platform/tarama/alan-kilitleri.mjs için tip bildirimi (alan kilidi kararı; hızlı test ve normal koşu ortak).
export declare const SERT_KILITLER: ReadonlySet<string>;
export declare const BETIKLE_YAZAN_DOLDURUCULAR: ReadonlySet<string>;
/** Okunan kilit nedeni alanı düzenlenemez kılıyor mu ('tus-deger' betikle yazılan alanda kilit değildir). */
export declare function kilitEngeller(kilit: string | null | undefined, s?: { betikle?: boolean; seciminGore?: boolean }): boolean;
