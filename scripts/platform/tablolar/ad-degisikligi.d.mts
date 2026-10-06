// scripts/platform/tablolar/ad-degisikligi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export type AdEslemi = Map<string, { yeniAd: string; sutunlar: Map<string, string> }>;
export declare function adEslemi(eski: { ad: string; sutunlar: Array<{ ad: string }> }, yeniAd: string, yeniSutunlar: Array<{ ad: string; eskiAd?: string | null }>): AdEslemi | null;
export declare function adDegisikliginiYay(vt: Veritabani, projeId: string, tabloId: string, eslem: AdEslemi, s?: { yapan?: string; kosuyorMu?: (dosya: string, ad: string) => boolean }):
  { ekranSenaryolari: number; servisSenaryolari: number; servisler: number; akislar: number; ekranBaglari: number };
