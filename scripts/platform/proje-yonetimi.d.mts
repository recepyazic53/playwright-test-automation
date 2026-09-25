// scripts/platform/proje-yonetimi.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';

export interface ProjeSilmeSayilari {
  ortam: number;
  ekran: number;
  senaryo: number;
  girisProfili: number;
  baglamProfili: number;
  testVerisi: number;
  kosu: number;
  sonuc: number;
  medya: number;
}
export declare function varsayilanProjeKimligi(vt: Veritabani): string | null;
export declare function varsayilanProjeAyarla(vt: Veritabani, id: string): string;
export declare function projeSilmeOnizlemesi(vt: Veritabani, projeId: string): { proje: { id: string; ad: string }; sayilar: ProjeSilmeSayilari; sonProje: boolean };
export declare function projeyiSil(vt: Veritabani, projeId: string, secenekler: { medyaKlasoru: string; yapan?: string }): {
  silinen: ProjeSilmeSayilari & { medyaDosyasi: number };
};
