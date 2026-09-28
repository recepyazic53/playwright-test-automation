// scripts/platform/sonuclar/genel.mjs için tip bildirimi.
import type { Zaman } from '../zamanlama/takvim.mjs';

export declare const TAMAMLANAN_TETIKLEMELER: ReadonlyArray<string>;
export declare function beklenenZamanlar(zaman: Zaman, bas: number, bit: number): number[];
export type TetiklemeKaydi = { zaman: string; durum: string };
export type PencereSonucu = {
  beklenen: number | null; kayit: number; tamamlandi: number; basarisizSonuclu: number; atlandi: number; yarida: number; hata: number;
  kacan: number | null; guvenilirlik: number | null; kisitli: boolean; bas: number; bit: number;
};
export declare function pencereGuvenilirligi(
  kural: { zaman: Zaman; etkin: boolean; olusturulma: string }, gecmis: ReadonlyArray<TetiklemeKaydi>,
  p: { bas: number; bit: number; simdi: number; gecmisSiniri: number }
): PencereSonucu;
export declare function toplamGuvenilirlik(l: ReadonlyArray<{ beklenen: number | null; tamamlandi: number }>): { beklenen: number; tamamlandi: number; guvenilirlik: number | null };
export declare function kararsizListesi<T extends { ad: string; oran: number; durum: string; kosu: number }>(l: ReadonlyArray<T>, enCok: number): T[];
export declare function metotKapsami(
  operasyonlar: ReadonlyArray<{ ad: string; metot?: string; yol?: string }> | undefined, senaryolar: ReadonlyArray<{ operasyon?: unknown; metot: string }>
): { toplam: number; senaryolu: number; eksik: string[] } | null;
export declare function ortamOranlari(
  ortamlar: ReadonlyArray<{ id: string; ad: string; riskli: boolean }>,
  ekran: ReadonlyArray<Record<string, Record<string, number>>>, servis: ReadonlyArray<Record<string, Record<string, number>>>
): Array<{ id: string; ad: string; riskli: boolean; test: number; ekranBasari: number | null; cagri: number; servisBasari: number | null }>;
