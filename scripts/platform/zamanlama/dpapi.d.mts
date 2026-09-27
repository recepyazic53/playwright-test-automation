// scripts/platform/zamanlama/dpapi.mjs için tip bildirimi.
export type DpapiYurutucu = (komut: string, argumanlar: string[], stdin: string) => Promise<string>;

export declare const DPAPI_BICIMI: string;
export declare const DPAPI_SURUMU: number;
export declare const DPAPI_BETIGI: string;
export declare function powershellYolu(): string;
export declare function dpapiKomutu(): { komut: string; argumanlar: string[] };
export declare const varsayilanDpapiYurutucu: DpapiYurutucu;
export declare function dpapiKoru(veri: Buffer, tuz: Buffer, yurutucu?: DpapiYurutucu): Promise<Buffer>;
export declare function dpapiCoz(blob: Buffer, tuz: Buffer, yurutucu?: DpapiYurutucu): Promise<Buffer>;
export declare function dpapiDosyaYolu(veritabaniYolu: string): string;
export declare function dpapiDosyaBilgisi(yol: string): { var: boolean; gecerli: boolean; kasaTuzu: string | null };
export declare function dpapiDosyasiYaz(yol: string, anahtar: Buffer, kasaTuzu: string, yurutucu?: DpapiYurutucu): Promise<void>;
export declare function dpapiDosyasiOku(yol: string, secenekler?: { kasaTuzu?: string | null; yurutucu?: DpapiYurutucu }): Promise<Buffer>;
export declare function dosyayiGuvenliSil(yol: string): boolean;
