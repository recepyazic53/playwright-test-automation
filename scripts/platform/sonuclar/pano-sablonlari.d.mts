// scripts/platform/sonuclar/pano-sablonlari.mjs için tip bildirimi.
import type { VeriSablonu } from './pano-duzeni.mjs';
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export type PanoMaddesi = { ad: string; ayrinti: string; adres: string };
export type SablonSonucu = { tur: 'sayi'; deger: number | null; birim: string; alt: string; adres: string | null }
  | { tur: 'liste'; maddeler: PanoMaddesi[]; toplam: number; bos: string };
export declare function sablonSonucu(vt: Veritabani, projeId: string, sablon: string, hamParametreler: unknown, s?: { simdi?: Date }): SablonSonucu;
export declare function sablonSecenekleri(vt: Veritabani, projeId: string): { sablonlar: ReadonlyArray<VeriSablonu>; hedefler: Array<{ deger: string; ad: string }> };
