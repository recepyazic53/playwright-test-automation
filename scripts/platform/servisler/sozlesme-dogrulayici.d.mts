// scripts/platform/servisler/sozlesme-dogrulayici.mjs için tip bildirimi.
export interface Sema {
  type?: string | string[]; properties?: Record<string, Sema>; required?: string[]; items?: Sema; enum?: unknown[]; nullable?: boolean; format?: string; anyOf?: Sema[];
}
export interface Uyumsuzluk { yol: string; mesaj: string }
export interface DogrulamaSonucu { uyumsuzluklar: Uyumsuzluk[]; toplam: number }
export interface XmlDugumu { ad: string; oz: Record<string, string>; cocuklar: XmlDugumu[]; metin: string }
export interface SemaAlani { parcalar: string[]; yol: string; derinlik: number; tip: string; zorunlu: boolean; nullIzinli: boolean; format?: string; enum?: unknown[] }

export declare const SEMA_TIPLERI: readonly string[];
export declare const BICIMLER: readonly string[];
export declare const TIP_ETIKETLERI: Readonly<Record<string, string>>;
export declare class SozlesmeHatasi extends Error { constructor(mesaj: string); }
export declare function semaTemizle(ham: unknown): Sema;
export declare function semaTipleri(s: Sema | undefined): string[];
export declare function nullIzinliMi(s: Sema | undefined): boolean;
export declare function jsonDogrula(sema: Sema, deger: unknown, s?: { kok?: string; bicimDenetle?: boolean; enCok?: number }): DogrulamaSonucu;
export declare function jsonMetniDogrula(sema: Sema, metin: string, s?: { kok?: string; bicimDenetle?: boolean; enCok?: number }): DogrulamaSonucu;
export declare function xmlAgaciOku(xml: string): XmlDugumu | null;
export declare function xmlDegeri(d: XmlDugumu): unknown;
export declare function soapGovdeOgesi(kok: XmlDugumu): { dugum?: XmlDugumu; fault?: boolean; bos?: boolean };
export declare function xmlDogrula(sema: Sema, xml: string, s?: { xmlKok?: string; bicimDenetle?: boolean; enCok?: number }): DogrulamaSonucu;
export declare function taslakCikar(ornekler: unknown[], s?: { xml?: boolean; kok?: string }): { sema: Sema; uyarilar: string[] };
export declare function alanYolu(p: string[]): string;
export declare function semaAlanlari(sema: Sema): SemaAlani[];
export declare function alanTipiAyarla(sema: Sema, p: string[], tip: string): void;
export declare function alanNullAyarla(sema: Sema, p: string[], acik: boolean): void;
export declare function alanZorunluAyarla(sema: Sema, p: string[], zorunlu: boolean): void;
export declare function alanKaldir(sema: Sema, p: string[]): void;
export declare function sozlesmeOzeti(sema: Sema): { alanSayisi: number; zorunluSayisi: number };
export declare function sozlesmeFarki(eski: Sema | null | undefined, yeni: Sema): { eklenen: string[]; kaldirilan: string[]; degisen: string[] };
