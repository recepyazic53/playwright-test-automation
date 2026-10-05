export interface TekBag { tablo: string; sutun: string; etiket?: string }
export interface AlanBagi extends TekBag { secimeGore?: { alan: string; degerler: Record<string, TekBag> } }
export declare function tekBag(b: unknown): TekBag;
export declare function secimeGoreVar(b: unknown): boolean;
export declare function secimeGoreCoz(b: unknown, deger: unknown): TekBag;
export declare function olasiBaglar(b: unknown): Array<TekBag & { deger: string | null }>;
export declare function bagTablolari(b: unknown): string[];
export declare function bagiDonustur(b: AlanBagi, donustur: (x: TekBag) => TekBag | null): { bag: AlanBagi; degisti: boolean };
export declare function baglariCoz(baglar: Record<string, unknown>, degerOku: (alanId: string) => unknown): Record<string, TekBag>;
export declare function bagOzeti(b: unknown, s: { tabloAdi: (id: string) => string; kontrolEtiketi: string; degerMetni?: (deger: string) => string; secenekler?: string[] }): string;
export declare function etiketMetni(etiket: unknown, yedek?: unknown): string;
