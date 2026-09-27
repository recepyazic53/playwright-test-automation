// scripts/platform/servisler/hesap-kurallari.mjs için tip bildirimi.
export declare const VARSAYILAN_TARIH_BICIMI: string;
export declare const KURAL_ADI: RegExp;
export declare const FONKSIYON_ADLARI: readonly string[];
export declare class HesapHatasi extends Error {
  constructor(mesaj: string, tur?: string);
  tur: string;
}
export interface Sure { sure: true; n: number; birim: 'y' | 'a' | 'g' | 's' }
export type Deger = number | string | boolean | Date | Sure | null;
export interface Dugum { tur: string; [k: string]: unknown }
export interface Baglam {
  simdi: Date; ref?: (ad: string) => string | undefined; akis?: (ad: string) => string | undefined; onbellek?: Map<string, Deger>; yigin?: string[];
}
export declare function tarihBicimle(t: Date, bicim: string): string;
export declare function sayiMetni(x: number): string;
export declare function sayiBicimle(x: number, bicim: string): string;
export declare function sonucBicimle(v: Deger, bicim?: string, varsayilanTarihBicimi?: string): string;
export declare function kuralAyir(metin: string): { ifade: string; bicim: string };
export declare function ayristir(ifade: string): Dugum;
export declare function basvurular(d: Dugum, t?: { refler: Set<string>; akislar: Set<string>; adlar: Set<string> }): { refler: Set<string>; akislar: Set<string>; adlar: Set<string> };
export declare function kuralDegeri(ad: string, kurallar: Record<string, string>, b: Baglam): Deger;
export declare function kuralUygula(ad: string, kurallar: Record<string, string>, b: Baglam, varsayilanTarihBicimi?: string): string;
export declare function ifadeDegeri(ifade: string, kurallar: Record<string, string>, b: Baglam): Deger;
export declare function ifadeUygula(metin: string, kurallar: Record<string, string>, b: Baglam, varsayilanTarihBicimi?: string): string;
export declare function hesapBloklari(metin: string): Array<{ bas: number; son: number; ic: string }>;
export declare function hesapKurallariniDenetle(kurallar: Record<string, string>): Record<string, string>;
export declare function kuralParametreleri(adlar: string[], kurallar: Record<string, string>): { refler: string[]; akislar: string[] };
export declare function ornekSonuclar(kurallar: Record<string, string>, ornek?: Record<string, string>, simdi?: Date, varsayilanTarihBicimi?: string): Record<string, { sonuc?: string; hata?: string }>;
export declare function kuralOzeti(kural: string): string;
