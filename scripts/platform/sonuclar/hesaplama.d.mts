// scripts/platform/sonuclar/hesaplama.mjs için tip bildirimi.
export type Sayilar = { basarili: number; basarisiz: number; atlanan: number; durduruldu: number };
export declare const BOS_SAYILAR: Readonly<Sayilar>;
export declare function durumToplami(s: Partial<Sayilar> | null | undefined): number;
export declare function sayilariTopla(liste: Array<Partial<Sayilar>>): Sayilar;
export declare function basariYuzdesi(s: Partial<Sayilar> & { hata?: number }): number | null;
export declare function basariOrani(s: Sayilar): number | null;
export type HesapKosusu = { id: string; z: number; tur: string; kapsam: string | null; urunler: Record<string, Sayilar> };
export type TrendNoktasi = Sayilar & { kosuId: string; z: number; kapsam: string | null };
/** Trend noktaları; Genel'de yalnız "Genel" kapsamlı tam koşular (tumKapsamlar: true → tüm tam koşular). */
export declare function trendHesapla(kosular: HesapKosusu[], urun: string | null, secenek?: { tumKapsamlar?: boolean }): TrendNoktasi[];
