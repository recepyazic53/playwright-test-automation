// scripts/platform/ayarlar/gizli-adlar.mjs için tip bildirimi.
export declare const CEKIRDEK_GIZLI_ADLAR: readonly string[];
export declare function gizliAdMi(ad: string, ekler?: ReadonlyArray<string>): boolean;
export type MetinBicimi = { bicim?: 'govde' | 'basliklar' | 'yol' };
/** Metinde adı gizli alanların düz değerleri (XML öğesi, JSON alanı; başlık satırı ya da yol sorgusu). */
export declare function gizliAdliDegerler(metin: unknown, ekler?: ReadonlyArray<string>, s?: MetinBicimi): string[];
/** Adı gizli alanların değerini maskeler; asıl değerleri (ad → sırayla; maskelenmeyen yer null) döner. */
export declare function adaGoreMaskele(metin: string, ekler: ReadonlyArray<string>, maske: string, s?: MetinBicimi): { metin: string; asillar: Record<string, Array<string | null>> };
/** adaGoreMaskele'nin tersi: değeri hâlâ maske olan yere asıl değeri yazar. */
export declare function maskeyiGeriKoy(metin: string, asillar: Record<string, Array<string | null>>, ekler: ReadonlyArray<string>, maske: string, s?: MetinBicimi): string;
/** Servis senaryosu içeriğinin görünümü: gövde / başlık / yolda (akış senaryosunda adımlarda da) adı gizli alanlar maskeli. */
export declare function servisIceriginiMaskele(icerik: unknown, ekler: ReadonlyArray<string>, maske: string): unknown;
export declare const EK_GIZLI_AD: RegExp;
export declare const EN_COK_EK_GIZLI_AD: number;
