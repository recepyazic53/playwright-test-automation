// scripts/platform/ortak-birlestirme.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
export type UcluFarkTuru = 'yeni' | 'degisti' | 'cakisma' | 'silindi' | 'benimDegisti' | 'benimSildi' | 'benimYeni';
export type UcluFarkOgesi = { tablo: string; etiket: string; id: string; baslik: string; tur: UcluFarkTuru; alanlar: string[]; benSildim?: true };
export declare function ucluFark(vt: Veritabani, taban: Record<string, Record<string, unknown>[]>, onlar: Record<string, Record<string, unknown>[]>, anahtar: Buffer): UcluFarkOgesi[];
export declare function birlestirmeSecimi(farklar: UcluFarkOgesi[], kararlar: unknown): { secimler: Record<string, string[]>; silinecekler: Array<{ tablo: string; id: string }>; dahil: number; haric: number; geriAlinan: number };
export declare function eklediklerimiSil(vt: Veritabani, silinecekler: Array<{ tablo: string; id: string }>, yapan?: string): number;
