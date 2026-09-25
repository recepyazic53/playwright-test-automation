// scripts/platform/aktarim/allure-sonuclari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type AllureSonucu = Record<string, unknown>;
export declare function allureSonuclariniOku(klasor: string): Array<{ icerik: AllureSonucu; zaman: number }>;
export declare function allureKosulariniGrupla(tumIcerikler: Array<{ icerik: AllureSonucu; zaman: number }>): Array<{
  kimlik: string | null; tur: 'tam' | 'tekil'; kapsam: string; bitis: number; baslangic: number; testler: Map<string, AllureSonucu>;
}>;
export declare function varsayilanSonucAnahtari(icerik: AllureSonucu): string | null;
export declare function allureSonuclariniAktar(vt: Veritabani, s: {
  projeId: string; ortamAnahtari: string; ortamId?: string | null; klasor: string; medyaAnahtari: Buffer; medyaKlasoru: string;
  sonucAnahtari?: (icerik: AllureSonucu) => string | null;
}): Promise<{ kosu: number; sonuc: number; medya: number; zatenVar: number; eksikEk: number }>;
