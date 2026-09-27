// scripts/paket/paket-ortak.mjs için tip bildirimi.
export declare const UYGULAMA_GIRDILERI: readonly string[];
export declare const HARIC_DESENLERI: readonly RegExp[];
export declare function haricMi(yol: string): boolean;
export declare const TEMEL_MODULLER: readonly string[];
export declare const EK_MODULLER: readonly string[];
export declare class PaketHatasi extends Error {
  constructor(mesaj: string);
}
export declare function calismaZamaniModulleri(kok: string): { moduller: string[]; veritabaniSurucuLeri: string[] };
export declare function uygulamaIcerigi(kok: string): Generator<{ goreli: string; kaynak: string; klasor: boolean }>;
