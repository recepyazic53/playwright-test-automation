// scripts/platform/ortak-birlestirme.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
export type UcluFarkOgesi = { tablo: string; etiket: string; id: string; baslik: string; tur: 'yeni' | 'degisti' | 'cakisma' | 'silindi'; alanlar: string[]; benSildim?: true };
export declare function ucluFark(vt: Veritabani, taban: Record<string, Record<string, unknown>[]>, onlar: Record<string, Record<string, unknown>[]>, anahtar: Buffer): UcluFarkOgesi[];
export declare function birlestirmeSecimi(farklar: UcluFarkOgesi[], kararlar: unknown): { secimler: Record<string, string[]>; dahil: number; haric: number };
