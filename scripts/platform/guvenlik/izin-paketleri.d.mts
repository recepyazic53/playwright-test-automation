// scripts/platform/guvenlik/izin-paketleri.mjs için tip bildirimi.
export type IzinPaketiAdi = 'hicbiri' | 'test' | 'test-veritabani' | 'ozel';
export interface IzinPaketiSecimi { paket: unknown; canli?: unknown; ozel?: unknown }
export declare const PAKET_DISI_IZINLER: readonly string[];
export declare const CANLI_IZNI: 'canli-ortam';
export declare const OZEL_SECILEBILIR: readonly string[];
export declare const IZIN_PAKETLERI: ReadonlyArray<{ ad: IzinPaketiAdi; etiket: string; ozet: string; izinler: readonly string[] | null }>;
export declare function paketIzinleri(secim: IzinPaketiSecimi): string[];
