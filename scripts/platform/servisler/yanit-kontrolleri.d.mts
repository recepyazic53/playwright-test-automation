// scripts/platform/servisler/yanit-kontrolleri.mjs için tip bildirimi (birim testleri import eder).
export declare const KONTROL_ISLECLERI: readonly ['esit', 'icerir', 'var', 'yok', 'desen', 'aralik'];
export type KontrolIsleci = (typeof KONTROL_ISLECLERI)[number];
export declare const ISLEC_ETIKETLERI: Readonly<Record<KontrolIsleci, string>>;
export declare const EN_COK_ALAN: number;
export declare const EN_COK_ALTIN_ALAN: number;
export declare const EN_COK_ALTIN_YOL: number;
export declare const DESENLER: Readonly<{ tarih: string; tarihSaat: string; uuid: string }>;

export interface YanitAlani { yol: string; ad: string; deger: string | null; bicim: string; maskeli: boolean }
export interface YanitAlaniKontrolu { tur?: 'yanitAlani'; kaynak?: 'xml' | 'json'; yol?: string; islec?: string; deger?: string; enAz?: number; enCok?: number; gizli?: boolean }
export interface AltinYanitKontrolu { tur: 'altinYanit'; bicim: 'xml' | 'json'; yapi: string[]; alanlar: Array<{ yol: string; deger: string }>; yokSay: string[] }

export declare const maskeliMi: (m: unknown) => boolean;
export declare function sayiOku(d: unknown): number | null;
export declare function degerBicimi(d: string | null): string;
export declare function yanitAlanlari(govde: string): { bicim: 'xml' | 'json' | null; alanlar: YanitAlani[]; kirpildi: boolean };
export declare const alanAdi: (yol: string) => string;
export declare const yapiYolu: (yol: string) => string;
export declare function yanitAlaniOku(govde: string, kaynak: 'xml' | 'json', yol: string): { bulundu: boolean; deger: string | null };
export declare function yanitAlaniAdi(k: YanitAlaniKontrolu): string;
export declare function yanitAlaniDegerlendir(govde: string, k: YanitAlaniKontrolu): { gecti: boolean; aciklama: string };
export declare function kontrolOnerisi(alan: { yol: string; ad?: string; deger: string | null; bicim?: string; maskeli?: boolean }, gizliMi?: (ad: string) => boolean): {
  islec: string; deger?: string; enAz?: number; enCok?: number; gizli: boolean; neden: string;
};
export declare const degiskenMi: (alan: { deger: string | null; bicim?: string }) => boolean;
export declare function altinYanitOlustur(govde: string, s: { karsilastir: string[]; yokSay: string[]; gizliMi?: (ad: string) => boolean }): AltinYanitKontrolu;
export declare function altinYanitKarsilastir(govde: string, k: { bicim?: string; yapi?: string[]; alanlar?: Array<{ yol: string; deger: string }>; yokSay?: string[] }): {
  gecti: boolean; aciklama: string; farklar: Array<{ tur: 'eklenen' | 'kaldirilan' | 'degisen'; yol: string }>;
};
export declare function yanitSuresiDegerlendir(sureMs: number | undefined, k: { deger?: string }): { gecti: boolean; aciklama: string };
