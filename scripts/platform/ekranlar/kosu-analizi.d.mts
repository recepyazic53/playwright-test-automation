// scripts/platform/ekranlar/kosu-analizi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

type Nesne = Record<string, any>;
export type EkranGozlemi = {
  adimId: string;
  baslik: string;
  /** Keşif okuması (adımı yok). */
  kesif?: boolean;
  alanlar: Nesne[];
  dugmeler: Array<{ metin: string | null; secici: string; cerceve?: string[]; baglanti?: boolean }>;
};
export declare const EKRAN_ANALIZI_EKI: 'ekran-analizi';
export declare function gozlenenModel(model: Nesne, gozlemler: EkranGozlemi[]): { model: Nesne; notlar: string[] };
export declare function kosuAnaliziPaketi(ekran: { anahtar: string; ad: string }, model: Nesne, gozlemler: EkranGozlemi[], senaryoBasligi: string): Nesne & { bilinmeyenler: string[] };
export declare function kosuAnaliziniYukle(vt: Veritabani, k: { sonucId: string; senaryoId: string }, s: { medyaKlasoru: string }):
  Promise<{ ekranId: string; bulguSayisi: number; gizlenenSayisi: number; notlar: string[] } | null>;
