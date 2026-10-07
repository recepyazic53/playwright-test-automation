// scripts/platform/ayarlar/maskeleme.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export declare const MASKELEME_AYAR_ANAHTARI: string;
export declare const CEKIRDEK_GIZLI_ADLAR: readonly string[];
export declare function ekGizliAdlar(vt: Veritabani): string[];
export declare function ekGizliAdlariKaydet(vt: Veritabani, liste: unknown): string[];
export declare function adGizliMi(vt: Veritabani, ad: string): boolean;
export declare function kisiselVeriMaskelenir(vt: Veritabani): boolean;
export declare function kisiselVeriMaskesiKaydet(vt: Veritabani, acik: unknown): boolean;
