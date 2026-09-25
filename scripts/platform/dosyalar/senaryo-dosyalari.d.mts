// scripts/platform/dosyalar/senaryo-dosyalari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const SENARYO_DOSYASI_TURU: 'senaryo-dosyasi';
export declare const DOSYA_REFERANS_ON_EKI: 'nobetci-dosya://';
export declare const DOSYA_BOYUT_SINIRI: number;
export declare const IZINLI_UZANTILAR: readonly string[];

export type SenaryoDosyasiBilgisi = {
  id: string; ad: string; boyut: number; icerikTuru: string; olusturulma: string;
  sahipTuru: string | null; sahipId: string | null; kaynak: string | null; dosya: string;
};

export declare function dosyaReferansi(id: string, ad: string): string;
export declare function referansCoz(deger: unknown): { id: string; ad: string } | null;
export declare function guvenliDosyaAdi(ham: unknown): string;
export declare function kabulUzantilari(kabul: unknown): string[];
export declare function uzantiyiDenetle(ad: string, kabul?: unknown): string;
export declare function icerikTuruBul(ad: string): string;
export declare function senaryoDosyasiEkle(vt: Veritabani, girdi: {
  klasor: string; icerik: Buffer; ad: unknown; kabul?: unknown; sahipTuru?: 'senaryo' | 'ekran' | null; sahipId?: string | null; kaynak?: string | null;
}): Promise<{ id: string; ad: string; boyut: number; referans: string }>;
export declare function senaryoDosyasiBilgisi(vt: Veritabani, id: string): SenaryoDosyasiBilgisi | null;
export declare function kaynaktanDosyaBul(vt: Veritabani, kaynak: string): SenaryoDosyasiBilgisi | null;
export declare function referanslariBul(deger: unknown): Array<{ id: string; ad: string; referans: string }>;
export declare function metinleriDonustur<T>(deger: T, donustur: (metin: string) => string): { deger: T; degisti: boolean };
export declare function dosyaSahipleriniBagla(vt: Veritabani, sahipTuru: 'senaryo' | 'ekran', sahipId: string, deger: unknown): number;
export declare function referanslariCoz(vt: Veritabani, deger: unknown, s: { medyaKlasoru: string; hedefKlasor: string }): Promise<{ deger: unknown; cozulen: number; eksikler: string[] }>;
export declare function yollariReferansaCevir(vt: Veritabani, projeId: string, eslesme: Map<string, string>, secenekler?: { yapan?: string }): { senaryo: number; ekran: number };
export declare function kullanilanDosyaKimlikleri(vt: Veritabani): Set<string>;
export declare function sahipsizSenaryoDosyalariniTemizle(vt: Veritabani, klasor: string, secenekler?: { simdi?: number }): { silinen: number };
