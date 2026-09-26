export interface Sutun { ad: string; gizli: boolean; tip?: string }
export interface Satir { id?: string; ortamId: string | null; degerler: Record<string, string | null> }
export interface Tablo { id: string; ad: string; sutunlar: Sutun[]; satirlar: Satir[] }
export interface Basvuru { tablo: string; etiket: string; sutun: string }

export declare const AD_KALIBI: string;
export declare const ETIKET_KALIBI: string;
export declare function basvuruCoz(ad: string): Basvuru | null;
export declare function basvuru(tablo: string, sutun: string, etiket?: string): string;
export declare function grupAnahtari(tabloId: string, etiket?: string): string;
export declare function tabloBul<T extends { ad: string }>(tablolar: T[], ad: string): T | undefined;
export declare function sutunBul(tablo: Tablo, ad: string): Sutun | undefined;
export declare function uyanSatirlar<T extends Satir>(tablo: { sutunlar: Sutun[]; satirlar: T[] }, secim?: Record<string, string>, s?: { ortamId?: string | null; haric?: string }): T[];
export declare function sutunSecenekleri(tablo: Tablo, secim: Record<string, string>, sutun: string, ortamId?: string | null): string[];
export declare function tabloDegerListeleri(baglar: Record<string, { tablo: string; sutun: string; etiket?: string }>, tablolar: Tablo[], ekranId: string, sira?: string[]): Array<{
  id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string }>;
}>;
export declare function secilenSatir<T extends Satir>(tablo: { sutunlar: Sutun[]; satirlar: T[] }, secim: Record<string, string>, ortamId?: string | null): T | undefined;
