// scripts/platform/sonuclar/pano-uclari.mjs için tip bildirimi.
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export declare function panoSecenekleri(vt: Veritabani, projeId: string): Record<string, any>;
export declare const PANO_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const PANO_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>;
