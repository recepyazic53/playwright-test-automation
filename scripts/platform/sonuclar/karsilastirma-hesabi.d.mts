// scripts/platform/sonuclar/karsilastirma-hesabi.mjs için tip bildirimi.
export type DegisimSinifi = 'yeni-kalan' | 'yalniz-b' | 'degisti' | 'duzelen' | 'yalniz-a' | 'hep-kalan' | 'ayni' | 'hep-gecen';
export type SenaryoTarafi = { anahtar: string; baslik: string; grup: string; durum: string; sureMs: number | null } & Record<string, unknown>;
export type KarsilastirmaSayilari = { basarili: number; kalan: number; atlanan: number; durduruldu: number };
export declare const DEGISIM_SINIFLARI: readonly DegisimSinifi[];
export declare const DEGISIM_ETIKETLERI: Readonly<Record<DegisimSinifi, string>>;
export declare function kalanMi(d: string | null | undefined): boolean;
export declare function degisimSinifi(a: string | null | undefined, b: string | null | undefined): DegisimSinifi | null;
export declare function degistiMi(sinif: string | null): boolean;
export declare function senaryolariKarsilastir<T extends SenaryoTarafi>(a: T[], b: T[]): {
  senaryolar: Array<{ anahtar: string; baslik: string; grup: string; a: T | null; b: T | null; degisim: DegisimSinifi; degisti: boolean; sureFarkiMs: number | null }>;
  sayim: Record<DegisimSinifi, number>;
  degisen: number;
};
export declare function ozetFarki(
  a: { sayilar: KarsilastirmaSayilari; oran: number | null; sureMs: number | null },
  b: { sayilar: KarsilastirmaSayilari; oran: number | null; sureMs: number | null }
): { basarili: number; kalan: number; atlanan: number; durduruldu: number; oran: number | null; sureMs: number | null };
export declare function hizala<T>(a: T[], b: T[], anahtar: (x: T) => string): Array<{ a: T | null; b: T | null }>;
export declare function adimlariKarsilastir<T extends { ad: string; durum: string; sureMs?: number | null }>(a: T[], b: T[]): Array<{
  ad: string; a: T | null; b: T | null; degisim: DegisimSinifi; degisti: boolean; sureFarkiMs: number | null;
}>;
export declare function kontrolleriDuzlestir(liste: unknown, on?: string): Array<{ yol: string; ad: string; gecti: boolean; aciklama: string }>;
export declare function kontrolleriKarsilastir(a: unknown, b: unknown): Array<{
  ad: string; a: { yol: string; ad: string; gecti: boolean; aciklama: string } | null; b: { yol: string; ad: string; gecti: boolean; aciklama: string } | null;
  degisim: DegisimSinifi; degisti: boolean;
}>;
export declare function yakalananlariKarsilastir(
  a: Array<{ kaynak: string; kalip: string; metin: string; sayi?: number; beklenen?: boolean }>,
  b: Array<{ kaynak: string; kalip: string; metin: string; sayi?: number; beklenen?: boolean }>
): Array<{ kaynak: string; kalip: string; metinA: string | null; metinB: string | null; sayiA: number; sayiB: number; beklenen: boolean; durum: 'yalniz-a' | 'yalniz-b' | 'ikisinde' }>;
