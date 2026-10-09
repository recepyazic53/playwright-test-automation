// scripts/platform/hizli-test/dal-birlestirme.mjs için tip bildirimi.
export declare const EKRANDA_GORUNURSE: string;
export declare function gorulmeyenBagliSecenekleriKoru(yeni: Record<string, any>, eski: Record<string, any> | null | undefined): { alanlar: string[] };
export declare function ulasilamayanAdimlariKoru(yeni: Record<string, any>, eski: Record<string, any> | null | undefined): { adimlar: string[] };
export declare function dallariBirlestir(yeni: Record<string, any>, eski: Record<string, any> | null | undefined): { korunan: string[]; kosullanan: string[] };
