// scripts/platform/sonuclar/rapor-arsivi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const RAPOR_MEDYA_SAHIBI: string;
export declare const EN_COK_PDF_BAYT: number;
export type ArsivRaporu = { id: string; kapsam: string; olusturulma: string; olusturan: string; boyut: number | null; dosyaVar: boolean; meta: Record<string, any> };
export declare function raporKaydet(vt: Veritabani, g: {
  projeId: string; kapsam: string; pdf: Buffer; dosyaAdi: string; meta: Record<string, unknown>; medyaKlasoru: string; olusturulma?: string; olusturan?: string;
}): Promise<string>;
export declare function raporlariListele(vt: Veritabani, projeId: string): ArsivRaporu[];
export declare function raporGetir(vt: Veritabani, projeId: string, id: string): { id: string; kapsam: string; olusturulma: string; medyaId: string | null; meta: Record<string, any> } | null;
export declare function raporPdfiniAl(vt: Veritabani, projeId: string, id: string, medyaKlasoru: string): Promise<{ pdf: Buffer; dosyaAdi: string }>;
export declare function raporSil(vt: Veritabani, projeId: string, id: string, medyaKlasoru: string): { silinen: number };
export declare function eskiRaporlariSil(vt: Veritabani, gun: number, s: { medyaKlasoru: string; simdi?: number }): { rapor: number; sahipsiz: number };
