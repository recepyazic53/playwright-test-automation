// scripts/platform/guvenlik/izin-tanimlari.mjs için tip bildirimi.
export type IzinIslemi = { ad: string; uclar: readonly string[]; kosul?: string };
export type IzinTanimi = {
  anahtar: string; etiket: string; aciklama: string; yapabilecekleri: readonly string[]; yerler: readonly string[];
  islemler: readonly IzinIslemi[]; risk: string; kapaliyken: string;
};
export declare const IZIN_TANIMLARI: readonly IzinTanimi[];
export declare const IZIN_ANAHTARLARI: readonly string[];
export declare function izinTanimi(anahtar: string): IzinTanimi | undefined;
export declare function izinMesaji(anahtar: string): string;
export declare function izinKapaliNotu(anahtar: string): string;
export declare function izinAdresi(anahtar: string): string;
