// scripts/platform/sonuclar/coklu.mjs için tip bildirimi.
export type TamSayilar = { basarili: number; basarisiz: number; atlanan: number; hata: number; durduruldu: number };
export type KismiSayilar = Partial<TamSayilar>;
export type Rozet = { durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string };
export declare function sayilariBirlestir(liste: ReadonlyArray<KismiSayilar>): TamSayilar;
export declare function sonucAdedi(s: KismiSayilar): number;
export declare function kovalariBirlestir(listeler: ReadonlyArray<ReadonlyArray<KismiSayilar>>, uzunluk: number):
  Array<TamSayilar & { adet: number; kalan: number; oran: number | null }>;
export declare function birlesikOzet(simdi: ReadonlyArray<KismiSayilar>, onceki: ReadonlyArray<KismiSayilar>): {
  sayilar: TamSayilar; oncekiSayilar: TamSayilar; basari: number | null; oncekiBasari: number | null; oncekiVar: boolean;
  adet: number; oncekiAdet: number | null; fark: number | null;
};
export declare const ROZET_SIRASI: Readonly<{ kritik: number; dikkat: number; saglikli: number }>;
export declare function saglikSiralamasi<T extends { ad: string; basari: number | null; p1: number; kotulesen: number; acikSorun: number }>(
  ogeler: ReadonlyArray<T>, esikler: { yesil: number; sari: number }
): Array<T & { rozet: Rozet; sira: number }>;
export declare const KOTULESEN_DURUMLAR: ReadonlyArray<string>;
export declare function sorunSayimi(sorunlar: ReadonlyArray<{ durum: string; bant: string }>): { acikSorun: number; kotulesen: number; p1: number };
export declare function sinifDagilimi(
  sorunlar: ReadonlyArray<{ ogeId: string; sinif: string; n: number }>, ogeler: ReadonlyArray<{ id: string; ad: string; tur: 'ekran' | 'servis' }>
): Array<{ id: string; ad: string; tur: 'ekran' | 'servis'; sayilar: Record<string, number>; toplam: number }>;
export declare function aksiyonlariBirlestir<T extends { imza: string; puan: number; durum: string; baslik: string; nerede: string }>(
  ciftler: ReadonlyArray<{ ekran: T; servis: T; jaccard: number }>
): { haric: Set<string>; notlar: Map<string, string> };
