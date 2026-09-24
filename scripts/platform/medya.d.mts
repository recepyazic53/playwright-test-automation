// scripts/platform/medya.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';

export declare const MEDYA_SIHIRLI: Buffer;
export declare const MEDYA_SURUMU: number;
export declare const PARCA_BOYUTU: number;
export declare const MEDYA_DOSYA_DESENI: RegExp;
export declare const HAZIRLIK_KLASORU_DESENI: RegExp;
export declare class MedyaHatasi extends Error {
  constructor(kod: 'BICIM' | 'BOZUK' | 'YOK' | 'ARALIK', mesaj: string);
  kod: 'BICIM' | 'BOZUK' | 'YOK' | 'ARALIK';
}
export declare function medyaKlasoru(veritabaniYolu: string): string;
export declare function medyaDosyaAdiGecerliMi(ad: unknown): boolean;
export declare function medyaSifrele(anaAnahtar: Buffer, klasor: string, kaynak: Buffer | string | AsyncIterable<Buffer>): Promise<{ dosya: string; boyut: number }>;
export declare function medyaBoyutu(yol: string): Promise<{ duzBoyut: number; parcaSayisi: number }>;
export declare function medyaCoz(anaAnahtar: Buffer, yol: string, aralik?: { baslangic?: number; bitis?: number }): AsyncGenerator<Buffer>;
export declare function medyaTamamenCoz(anaAnahtar: Buffer, yol: string): Promise<Buffer>;
export declare function medyaDosyasiniSil(klasor: string, dosya: string): boolean;
export declare function medyaSaklamaTemizligi(vt: Veritabani, klasor: string, secenekler: { videoGun: number; simdi?: number }): { silinenVideo: number; silinenSahipsiz: number };
