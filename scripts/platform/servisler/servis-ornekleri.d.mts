// scripts/platform/servisler/servis-ornekleri.mjs için tip bildirimi.
export type OrnekIstek = { id: string; ad: string; govde: string; kaynak: string };
export function ornekIstekleriniDogrula(v: unknown, mevcut: Record<string, OrnekIstek[]> | undefined, ekler: ReadonlyArray<string>): Record<string, OrnekIstek[]>;
export function alanKurallariniDogrula(v: unknown): Record<string, Record<string, Record<string, unknown>>>;
export function analizKararlariniDogrula(v: unknown): Record<string, Record<string, 'uygulandi' | 'yoksayildi'>>;
export function ornekFarklariniDogrula(v: unknown): Record<string, Array<{ yol: string; dolu: string[]; bos: string[] }>>;
export function ornekKokleriniDogrula(v: unknown): Record<string, { kok: string; ns: string }>;
export function ornekleriMaskele<T extends { ornekIstekler?: Record<string, OrnekIstek[]> }>(ayarlar: T, ekler: ReadonlyArray<string>): T;
export function ornekleriEkle(mevcut: Record<string, OrnekIstek[]> | undefined, op: string, yeniler: Array<{ ad: string; govde: string; kaynak: string }>): Record<string, OrnekIstek[]>;
export function analizTablolariniYaz(vt: unknown, projeId: string, v: unknown): Map<string, { tabloId: string; sutunlar: Map<string, string> } | null>;
export function baglariCoz(baglar: unknown, eslem: Map<string, { tabloId: string; sutunlar: Map<string, string> } | null>): unknown;
export function analizKanitlari(vt: unknown, servis: unknown, ekler: ReadonlyArray<string>, sinir?: number): {
  senaryolar: Array<{ ad: string; operasyon: string; govde: string }>; kosular: Array<{ ad: string; operasyon: string; govde: string }>;
};
