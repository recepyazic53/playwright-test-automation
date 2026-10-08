// scripts/platform/servisler/servis-adimi.mjs için tip bildirimi.
export declare const SERVIS_ATAMA_EN_COK: number;
export declare const SERVIS_OKUMA_EN_COK: number;
export type ServisAtamasi = { bul: string; deger: string };
export type ServisOkumasi = { ad: string; yol: string; kaynak?: 'xml' | 'json' | 'baslik'; gizli?: boolean; hedefAlanlar?: string[] };
export type ServisTanimi = { servisId: string; senaryoId: string; atamalar?: ServisAtamasi[]; okumalar?: ServisOkumasi[]; sonraBekleSn?: number };
export declare function servisTanimiDogrula(ham: unknown): { tanim: ServisTanimi; hatalar: string[] };
export declare function atamalariCoz(atamalar: ServisAtamasi[], coz: (ifade: string) => string | undefined): { atamalar: ServisAtamasi[]; eksik: string[] };
export declare function atamalariUygula(icerik: Record<string, any>, atamalar: ServisAtamasi[]): { icerik: Record<string, any>; bulunamayan: string[] };
export declare function servisOzeti(t: ServisTanimi): string;
