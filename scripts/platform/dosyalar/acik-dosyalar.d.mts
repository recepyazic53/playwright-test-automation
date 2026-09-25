// scripts/platform/dosyalar/acik-dosyalar.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type AcikDosya = { kimlik: string; konum: string; kok: string; goreliYol: string; yol: string; boyut: number; sifreliKopyaVar: boolean };
export type AtlananDosya = { goreliYol: string; konum: string; neden: string };

export declare function acikDosyalariBul(
  vt: Veritabani | null,
  adaptor: { dosyaKaynaklari?: (kok: string) => Array<{ goreliYol: string; yol: string }> } | null,
  kokler: Array<{ kok: string; konum: string }>
): AcikDosya[];
export declare function acikDosyalariAktar(vt: Veritabani, projeId: string, dosyalar: AcikDosya[], s: { medyaKlasoru: string; yapan?: string }): Promise<{
  aktarilan: number; zatenVardi: number; referans: { senaryo: number; ekran: number }; eslesme: Map<string, string>; hatalar: AtlananDosya[];
}>;
export declare function guvenliSil(yol: string): void;
export declare function acikDosyalariTasi(vt: Veritabani, projeId: string, dosyalar: AcikDosya[], s: {
  medyaKlasoru: string; yapan?: string; bosKlasorKoku?: (d: AcikDosya) => string | null;
}): Promise<{ aktarilan: number; zatenVardi: number; referans: { senaryo: number; ekran: number }; silinen: number; atlanan: AtlananDosya[] }>;
