// scripts/platform/ayarlar/rehber-ayarlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type RehberAyarlari = { otomatik: boolean; gorulenler: string[]; ortamKapali: boolean };
export declare const REHBER_AYAR_ANAHTARI: 'rehber';
export declare const REHBER_ANAHTARI: RegExp;
export declare const REHBER_TERCIH_SURUMU: 2;
export declare function rehberAyarlariniOku(vt: Veritabani): RehberAyarlari;
export declare function rehberAyarlariniKaydet(vt: Veritabani, girdi: unknown): RehberAyarlari;
