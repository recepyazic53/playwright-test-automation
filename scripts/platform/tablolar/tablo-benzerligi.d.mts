// scripts/platform/tablolar/tablo-benzerligi.mjs için tip bildirimi (esnek başlık, sütun eşleme önerisi, birleştirme önerileri).
export interface BSutun { ad: string; gizli?: boolean }
export interface BTablo { id: string; ad: string; sutunlar: BSutun[]; baglam?: boolean; kaynak?: { tur?: string; ekran?: string; tabloTuru?: string } | null; satirImzalari?: string[]; satirlar?: Array<{ degerler: Record<string, unknown> }> }
export type BenzerlikGrubu = 'birebir' | 'cogu' | 'veriFarkli';
export interface BirlestirmeOnerisi { tablolar: string[]; grup: BenzerlikGrubu; puan: number; tur: 'liste' | 'kayit' | 'servis'; eslemeGerekli: boolean }
export declare function baslikNormal(ad: unknown): string;
export declare function basliklarBenzer(a: string, b: string): boolean;
export declare function uzaklik(a: string, b: string): number;
export declare function sutunEslemesiOner(kaynak: BSutun[], hedef: BSutun[]): Array<{ kaynak: string; hedef: string | null; kesin: boolean }>;
export declare function tabloTuru(t: BTablo, ek?: { ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }): 'liste' | 'kayit' | 'servis';
export declare function baslikBenzerligi(a: BSutun[], b: BSutun[]): number;
export declare function satirOrtusmesi(a: string[], b: string[]): number;
export declare function birlestirmeOnerileri(tablolar: BTablo[], ek?: { ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }): BirlestirmeOnerisi[];
export declare function benzerTablolar(sutunlar: BSutun[] | string[], tablolar: BTablo[], s?: { ad?: string; haricId?: string; satirlar?: Array<Record<string, unknown>> }): Array<{ id: string; ad: string; puan: number; ayni: boolean }>;
export declare const GENEL_SUTUNLAR: readonly string[];
export declare const GENEL_AGIRLIK: number;
export declare function baslikAyirtEdiciligi(sutunlar: BSutun[]): number;
export declare function agirlikliBaslikBenzerligi(a: BSutun[], b: BSutun[]): number;
