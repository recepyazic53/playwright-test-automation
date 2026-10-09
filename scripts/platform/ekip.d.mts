// scripts/platform/ekip.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
export type EkipUyesi = { ad: string; rol: 'admin' | 'kullanici' };
export declare const EKIP_AYARI: string;
export declare const EKIP_ROLLERI: readonly string[];
export declare const EKIP_EN_COK: number;
export declare function ekipUyeleriOku(vt: Veritabani): EkipUyesi[];
export declare function girisDenetle(vt: Veritabani, ad: unknown): EkipUyesi | null;
export declare function ekipUyeleriKaydet(vt: Veritabani, uyeler: unknown, ben: string): EkipUyesi[];
