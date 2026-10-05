export type SayfaFarki = {
  belirenler: string[]; kaybolanlar: string[];
  dolanListeler: string[]; degisenListeler: string[]; bosalanListeler: string[];
  etkinlesenler: string[]; kilitlenenler: string[];
  sayfaDoldurdu: Array<{ anahtar: string; deger: string }>;
};
export declare function sayfaFarki(once: ReadonlyArray<any>, sonra: ReadonlyArray<any>, yazilanlar?: ReadonlyArray<string>): SayfaFarki;
export declare function farkVar(f: SayfaFarki): boolean;
export declare function farkOzeti(f: SayfaFarki, s: { neden?: string | null; ad: (anahtar: string) => string }): string;
export declare function tetikHedefleri(f: SayfaFarki, kaynak: string, bagliUst?: ReadonlyMap<string, string>): Array<{ hedef: string; olay: 'belirdi' | 'doldu' }>;
