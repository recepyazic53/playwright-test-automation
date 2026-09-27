// scripts/platform/zamanlama/anahtar-emaneti.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare function anahtariEmanetEt(vt: Veritabani, anahtar: Buffer): void;
export declare function emanetVarMi(vt: Veritabani): boolean;
export declare function emanetiSil(vt: Veritabani): void;
export declare function arkaPlanIsiSuruyorMu(vt: Veritabani): boolean;
export declare function arayuzuKilitleEmanetle(vt: Veritabani): void;
export declare function arkaPlanIsiBaslat(vt: Veritabani): (() => void) | null;
export declare function arayuzKilidindeIzinliMi(yontem: string, yol: string): boolean;
