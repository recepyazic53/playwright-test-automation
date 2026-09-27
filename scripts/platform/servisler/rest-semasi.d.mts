// scripts/platform/servisler/rest-semasi.mjs için tip bildirimi.
import type { Alan, OperasyonSemasi } from './servis-govdesi.mjs';

export declare const REST_METOTLARI: readonly string[];
export declare const GOVDELI_METOTLAR: readonly string[];
export declare const ICERIK_TURLERI: ReadonlyArray<readonly [string, string]>;
export declare function adresAyir(metin: string): { koken: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; semaEklendi: boolean };
export declare function ucAdiOner(yol: string): string;
export declare function yolYerTutuculari(yol: string): string[];
export declare function govdeOrnegiCoz(metin: string): unknown;
export declare function jsonAlanlari(v: unknown): Alan[];
export declare function restSemasi(uc: { ad: string; yol?: string; sorgu?: Array<{ ad: string }>; govdeOrnegi?: string; icerikTuru?: string }): OperasyonSemasi;
export declare function baslangicSablonu(
  uc: { yol?: string; sorgu?: Array<{ ad: string; deger: string }>; govdeOrnegi?: string; icerikTuru?: string },
  s: { ref: (yol: string) => string | undefined; gizli?: ReadonlySet<string> }
): { yol: string; govde: string };
