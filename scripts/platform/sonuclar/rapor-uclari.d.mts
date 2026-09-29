// scripts/platform/sonuclar/rapor-uclari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DonemRaporuVerisi, RaporGirdisi, RaporKapsami } from './donem-raporu.mjs';
import type { ArsivRaporu } from './rapor-arsivi.mjs';

export type UcBaglami = { medyaKlasoru: string; simdi?: Date };
export declare const RAPOR_KAPSAMLARI: ReadonlyArray<string>;
export declare const KAPSAM_ADLARI: Readonly<Record<RaporKapsami, string>>;
export declare function raporGirdisiDogrula(g: Record<string, unknown>): RaporGirdisi;
export declare function pdfDosyaAdi(kapsam: RaporKapsami, ad: string, tarih: Date): string;
export declare function raporHazirla(vt: Veritabani, girdi: RaporGirdisi, b: UcBaglami): Promise<{ veri: DonemRaporuVerisi; html: string; baslik: string; dosyaAdi: string }>;
export declare function raporOnizle(vt: Veritabani, g: Record<string, unknown>, b: UcBaglami): Promise<{
  html: string; onizlemeId: string; dosyaAdi: string; boyut: number; rozet: { durum: string; gerekce: string };
}>;
export declare function raporPdf(vt: Veritabani, g: Record<string, unknown>, b: UcBaglami): Promise<{
  pdf: Buffer; dosyaAdi: string; raporId: string | null; sayfa: number; engellenenIstek: number;
}>;
export declare function raporListesi(vt: Veritabani, q: URLSearchParams): { raporlar: ArsivRaporu[] };
export declare function raporIndir(vt: Veritabani, q: URLSearchParams, b: UcBaglami): Promise<{ pdf: Buffer; dosyaAdi: string }>;
export declare function raporYenidenOlustur(vt: Veritabani, g: Record<string, unknown>, b: UcBaglami): Promise<{ raporId: string | null; dosyaAdi: string; sayfa: number }>;
export declare function raporSilUc(vt: Veritabani, g: Record<string, unknown>, b: UcBaglami): { silinen: number };
export declare function raporSecenekleri(vt: Veritabani, q: URLSearchParams): {
  ekranlar: Array<{ id: string; ad: string; devreDisi: boolean }>; servisler: Array<{ id: string; ad: string; tur: string }>;
  ortamlar: Array<{ id: string; ad: string }>; kapsamlar: ReadonlyArray<string>;
};
/** GET /platform/rapor-verileri (Ayarlar > Raporlar; PDF rapor A4). */
export declare function raporVerileriEkrani(vt: Veritabani, projeId: string): {
  ekipler: Array<{ id: string; ad: string }>;
  ekranlar: Array<{ id: string; ad: string; ortakAkis: boolean; devreDisi: boolean; kritik: boolean; ekipId: string | null; sureEsigiMs: number | null }>;
  servisler: Array<{ id: string; ad: string; tur: string; metotlar: string[]; kritik: boolean; ekipId: string | null; sureEsigiMs: number | null; metotEsikleri: Record<string, number> }>;
  akislar: Array<{ id: string; ad: string; tur: string; kritik: boolean }>;
};
export declare function raporSaklamaTemizligi(vt: Veritabani, s: { medyaKlasoru: string; simdi?: number }): { rapor: number; sahipsiz: number };
