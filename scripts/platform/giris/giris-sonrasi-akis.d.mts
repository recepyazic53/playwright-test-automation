// scripts/platform/giris/giris-sonrasi-akis.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export type GirisSonrasiAlani = { anahtar: string; etiket: string; tip: string; secenekler?: Array<{ deger: string; metin: string }> };
export declare function akisDosyasi(anahtar: string): string;
export declare function girisSonrasiAkislari(vt: Veritabani, projeId: string): Array<{ dosya: string; ad: string; alanlar: GirisSonrasiAlani[] }>;
export declare function girisSonrasiAdimlari(model: Record<string, any>): { adimlar: Record<string, any>[]; hatalar: string[] };
export declare function girisSonrasiCoz<T extends Record<string, any> | null>(vt: Veritabani, projeId: string, tarif: T): T;
