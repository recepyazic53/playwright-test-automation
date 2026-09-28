// scripts/platform/guvenlik/uc-denetimi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare class CanliOnayHatasi extends Error {
  constructor(ortamAdi: string);
  readonly kod: 'CANLI_ONAY_GEREKLI';
}
export declare function denetlenenUclar(): Set<string>;
export declare function gerekenIzinler(vt: Veritabani, yol: string, g: Record<string, any>): { izinler: string[]; canliOnayGerekli: boolean; ortamAdi: string | null };
export declare function ucDenetle(vt: Veritabani, yol: string, g: Record<string, any>): void;
export declare function kapaliIzinler(vt: Veritabani, yol: string, g: Record<string, any>): string[];
/** Uçtan uca akışın koşu ucu. */
export declare const UCTAN_UCA_KOS_UCU: '/platform/uctan-uca/kos';
/** Bir akış adımının gerektirdiği izinler (riskli ortam izni hariç). */
export declare function adimIzinleri(vt: Veritabani, projeId: string, ortamId: string, a: unknown): string[];
