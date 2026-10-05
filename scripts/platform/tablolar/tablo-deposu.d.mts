import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface Karsilik { sayfa?: string; servis?: string }
export interface TabloSutunu { ad: string; gizli: boolean; tip: string; karsiliklar?: Record<string, Karsilik> }
export interface TabloSatiri { id: string; ad: string; ortamId: string | null; degerler: Record<string, string | null>; doluGizli: string[]; guncellenme?: string }
export interface TabloKaynagi { tur?: string; olusturan?: string; olusturulma?: string; ekran?: string; yazilma?: string; tabloTuru?: 'liste' | 'kayit' }
export interface Tablo { id: string; ad: string; sutunlar: TabloSutunu[]; satirlar: TabloSatiri[]; guncellenme: string; baglam?: boolean; kaynak?: TabloKaynagi | null }
export declare const BAGLAM_ONEKI: string;

export declare const TABLO_ADI: RegExp;
export declare const EN_COK_SATIR: number;
export declare const EN_COK_SUTUN: number;
export declare const EN_COK_KARSILIK: number;
export declare function tablolariListele(vt: Veritabani, projeId: string, secenekler?: { cozulsun?: boolean; tabloId?: string; baglamDahil?: boolean }): Tablo[];
/** Önbellekli (gizli değerler çözülmeden); dönen nesneler paylaşılır — değiştirilmemelidir. */
export declare function tablolariListeleOnbellekli(vt: Veritabani, projeId: string): Tablo[];
export declare function tabloKaydet(vt: Veritabani, girdi: {
  projeId: string; id?: string; ad: string; sutunlar: unknown; satirlar?: unknown; silinenSatirlar?: unknown; ortamVar?: (id: string) => boolean; kaynak?: TabloKaynagi; tur?: unknown;
}): string;
export declare function tabloSil(vt: Veritabani, projeId: string, id: string): boolean;
