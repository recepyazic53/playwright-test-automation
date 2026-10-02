export type VeriBekliyorOgesi = { etiket: string; tabloId: string; sutun: string; satirId: string };
export type BekleyenAlan = VeriBekliyorOgesi & { tablo: string | null; satirAdi: string | null };
export declare const VERI_BEKLIYOR_ETIKETI: string;
export declare function veriBekliyorAyikla(l: unknown): VeriBekliyorOgesi[] | null;
export declare function bekleyenAlanlar(
  liste: unknown,
  tablolar: ReadonlyArray<{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: ReadonlyArray<{ id?: string; ad?: string; degerler: Record<string, unknown>; doluGizli?: ReadonlyArray<string> }> }>
): BekleyenAlan[];
export declare function veriBekliyorMesaji(bekleyen: ReadonlyArray<{ etiket: string }>): string;
