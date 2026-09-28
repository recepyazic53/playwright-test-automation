// scripts/platform/tablolar/veri-kosulari.mjs için tip bildirimi.
export interface VkSatir { id?: string; ad?: string; ortamId: string | null; degerler: Record<string, string | null>; guncellenme?: string }
export interface VkTablo { id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: VkSatir[] }
export type GrupAyari = { kip: 'secili'; satirlar: string[] } | { kip: 'tumu' };
export interface VeriKosulari { gruplar: Record<string, GrupAyari>; birlesim?: 'kartezyen' | 'eslestir'; eslesmeler?: Array<Record<string, string>> }
export interface VeriKosusu { anahtar: string; ad: string; satirlar: Record<string, string> }
export interface SatirOzeti {
  grup: string; tablo: string; etiket?: string; satirId: string; satirAdi: string; guncellenme?: string;
  degerler: Record<string, string | null>; gizliSutunlar: string[];
}
export interface VeriKosusuAcmaSecenekleri {
  tablolar: ReadonlyArray<VkTablo>; gruplar: ReadonlyArray<{ anahtar: string; tablo?: VkTablo; etiket?: string }>; ortamId?: string | null;
  tabloSecimleri?: Record<string, Record<string, string>> | null; kip?: string | null;
}
export declare const VERI_KIPLERI: ReadonlyArray<string>;
export declare const BIRLESIMLER: ReadonlyArray<string>;
export declare const KOSU_KIPLERI: ReadonlyArray<string>;
export declare const VARSAYILAN_VERI_KOSUSU_SINIRI: number;
export declare function basvuruGruplari(veri: Record<string, unknown> | null | undefined, tablolar: ReadonlyArray<VkTablo>): Array<{ anahtar: string; tablo: VkTablo; etiket: string }>;
export declare function veriKosulariniAyikla(v: unknown, tablolar: ReadonlyArray<VkTablo>): { ayar: VeriKosulari | undefined; hatalar: string[] };
export declare function veriKosulariniAc(ayar: VeriKosulari | null | undefined, s: VeriKosusuAcmaSecenekleri): { kosular: VeriKosusu[]; hatalar: string[]; cokluGruplar: string[] };
export declare function veriKosusuSayisi(ayar: VeriKosulari | null | undefined, s: VeriKosusuAcmaSecenekleri): { sayi: number; hatalar: string[]; coklu: boolean };
export declare function satirOzeti(grup: string, tablo: VkTablo, satir: VkSatir): SatirOzeti;
export declare function veriKosusuBasligi(baslik: string, ad: string | null | undefined): string;
export declare const VERI_KIPI_DEGISKENI: string;
export declare const TEKRAR_PLANI_DEGISKENI: string;
export declare const TEKRAR_KAYNAGI_DEGISKENI: string;
export interface TekrarKosusu { anahtar: string | null; ad: string | null; satirlar: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }
export interface TekrarSenaryosu { modelSurumu: number | null; kosular: TekrarKosusu[] }
export declare function tekrarPlaniniAyristir(metin: unknown): Record<string, TekrarSenaryosu>;
