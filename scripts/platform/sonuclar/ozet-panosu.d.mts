// scripts/platform/sonuclar/ozet-panosu.mjs için tip bildirimi.
import type { PanoDuzeni } from './pano-duzeni.mjs';
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export type PanoSqlSonucu = { zaman: string; sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean; gizliSutunlar: string[]; satirSiniri: number;
  /** Önceki yenilemenin ilk satırı ("Sayı + değişim"; maskeli; ilk yenilemede null). */
  onceki?: { zaman: string; sutunlar: string[]; ilkSatir: unknown[] | null } | null };
export declare const PANO_AYAR_ANAHTARI: 'ozetPanosu';
export declare const PANO_SONUC_ANAHTARI: 'ozetPanosuSonuclari';
export declare function sqlImzasi(kart: { ayar?: Record<string, any> }): string;
export declare function panoGetir(vt: Veritabani, projeId: string): { duzen: PanoDuzeni; varsayilan: boolean; kayitli: boolean; goc: boolean; sqlSonuclari: Record<string, PanoSqlSonucu> };
export declare function panoKaydet(vt: Veritabani, projeId: string, ham: unknown): PanoDuzeni;
export declare function panoSonuclariniTemizle(vt: Veritabani): void;
export declare function sqlSonucuYaz(vt: Veritabani, projeId: string, kartId: string, sonuc: PanoSqlSonucu): void;
