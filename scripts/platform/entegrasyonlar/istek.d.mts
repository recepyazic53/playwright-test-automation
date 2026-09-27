// scripts/platform/entegrasyonlar/istek.mjs için tip bildirimi.
import { DepoHatasi } from '../veritabani/depo.mjs';

export type YasakDeseni = { kalip: string; desen: RegExp };
export interface EntegrasyonYaniti { durumKodu: number; basliklar: Record<string, string | string[] | undefined>; govde: string }
export declare const MASKE: string;
export declare const YANIT_SINIRI: number;
export declare class EntegrasyonHatasi extends DepoHatasi {}
export declare function gizlileriMaskele(metin: string, gizliler: ReadonlyArray<string | null | undefined>): string;
export declare function adresOzeti(adres: string): string;
export declare function adresDenetle(adres: string, yasakDesenleri?: ReadonlyArray<YasakDeseni>): URL;
export declare function hostDenetle(host: string, yasakDesenleri?: ReadonlyArray<YasakDeseni>): void;
export declare function entegrasyonIstegi(istek: {
  adres: string; yontem?: string; basliklar?: Record<string, string>; govde?: string | Buffer; zamanAsimiMs?: number; yasakDesenleri?: ReadonlyArray<YasakDeseni>;
}): Promise<EntegrasyonYaniti>;
export declare function yanitOzeti(govde: string, gizliler: ReadonlyArray<string | null | undefined>): string;
