// scripts/platform/servisler/akis-senaryo-icerigi.mjs için tip bildirimi.
export declare const AKIS_SENARYOSU: 'akis';
export declare const EN_COK_BAG: number;
export declare function akisSenaryosuMu(icerik: unknown): boolean;
export declare function bagAdi(v: unknown): string | null;
export declare function baglariDogrula(v: unknown, yer: string, Hata?: new (m: string) => Error): Record<string, string>;
export type AkisSenaryoIcerigi = { tur: 'akis'; akisId: string; adimlar: Record<string, any>; aciklama?: string };
export declare function akisSenaryoIceriginiDogrula(ham: unknown, adimDogrula: (icerik: unknown) => any, Hata?: new (m: string) => Error): AkisSenaryoIcerigi;
export declare function operasyonAdimlari(icerik: { adimlar: any[] }): Array<{
  id: string; no: number; ad: string; servisId: string; operasyon: string; kilitli: Array<{ yol: string; ad: string; ureten: number | null }>;
}>;
export declare function baglariUygula(icerik: any, baglar: Record<string, string>, s: {
  rest: boolean; sema?: any; soapSurumu?: '1.1' | '1.2';
  govdeCoz?: (g: string, s: any) => { degerler: Record<string, any>; uyumsuz: string[] }; govdeUret?: (s: any, d: Record<string, any>, o?: any) => string;
}): any;
