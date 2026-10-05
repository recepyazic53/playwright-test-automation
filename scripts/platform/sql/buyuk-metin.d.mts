// scripts/platform/sql/buyuk-metin.mjs için tip bildirimi.
export declare const HUCRE_METIN_SINIRI: number;
export declare const KESILDI_EKI: string;
export declare const ONIZLEME_SINIRI: number;
export declare function ikiliVeriMetni(n: number): string;
export declare function metinSinirla(s: string, sinir?: number): string;
export declare function ikiliMi(b: Uint8Array): boolean;
export declare function hucreyiDuzenle(v: unknown, s?: { ikili?: boolean }): unknown;
export declare function satirlariDuzenle(satirlar: unknown[][], ikiliSutunlar?: ReadonlyArray<boolean | undefined>): Promise<unknown[][]>;
export declare function uzunMetinMi(v: unknown): v is string;
export declare function metinKisalt(s: string, n?: number): string;
export declare function metniBicimle(s: string): { metin: string; tur: 'json' | 'xml' | 'duz'; bicimlendi: boolean };
export declare function govdeGibiMi(s: unknown): boolean;
export declare function govdeKokAdi(s: string): string;
export declare function metotOner(kok: string, metotlar: ReadonlyArray<string>): string | null;
export declare function durumOner(sutunlar: ReadonlyArray<string>, satir: ReadonlyArray<unknown>): { durum: 'basarili' | 'hata'; sutun: string; deger: string } | null;
export declare function satirZamani(sutunlar: ReadonlyArray<string>, satir: ReadonlyArray<unknown>): string | null;
