export type PoligonSayaci = { gonderim: number; gonderimler: Array<Record<string, unknown>>; olaylar: Record<string, number>; doldurma: Array<{ alan: string; zaman: number }> };
export type PoligonEkrani = { kok: string; ad: string; alan: string; teknikler: string[] };
export const EKRANLAR: PoligonEkrani[];
export function poligonUygulamasi(): { sayaclar: () => Record<string, PoligonSayaci>; sifirla: () => void };
export function poligonBaslat(port?: number): Promise<{
  adres: string;
  sayaclar: () => Record<string, PoligonSayaci>;
  sifirla: () => void;
  kapat: () => Promise<void>;
}>;
