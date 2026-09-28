export type GoreliTaban = 'bugun' | 'ayBasi' | 'aySonu';
export type GoreliIfade = { taban: GoreliTaban; gun: number };
export type Gun = { yil: number; ay: number; gun: number };
export type TarihSinirlari = { enAz?: unknown; enCok?: unknown } | null | undefined;

export declare const GORELI_TARIH_SAAT_DILIMI: string;
export declare const VARSAYILAN_TARIH_BICIMI: string;
export declare const GORELI_ORNEK: string;
export declare const EN_COK_GUN: number;

export declare function goreliIfadeAyristir(metin: unknown): GoreliIfade | null;
export declare function goreliIfadeHataliMi(metin: unknown): boolean;
export declare function goreliHataMesaji(metin: unknown): string;
export declare function goreliIfadeYaz(i: GoreliIfade): string;
export declare function goreliIfadeKanonik(metin: unknown): string | null;
export declare function istanbulGunu(simdi?: Date): Gun;
export declare function gunSirasi(t: Gun): number;
export declare function gunFarki(a: Gun, b: Gun): number;
export declare function goreliGun(ifade: unknown, simdi?: Date): Gun | null;
export declare function tarihBicimle(t: Gun, bicim?: string | null): string;
export declare function sabitTarihAyristir(metin: unknown, bicim?: string | null): Gun | null;
export declare function goreliTarihCoz(ifade: unknown, bicim?: string | null, simdi?: Date): string | null;
export declare function tarihDegeriCoz(deger: unknown, bicim?: string | null, simdi?: Date): { gun: Gun; goreli: boolean } | null;
export declare function goreliOzet(ifade: unknown, bicim?: string | null, simdi?: Date): string | null;
export declare function tarihSinirDenetimi(gun: Gun, sinirlar: TarihSinirlari, bicim?: string | null, simdi?: Date):
  { tur: 'erken' | 'gec'; sinir: string; sinirTarihi: string; mesaj: string } | null;
export declare function eskiyenTarih(deger: unknown, bicim?: string | null, sinirlar?: TarihSinirlari, simdi?: Date, referans?: Date | string | null): { neden: 'gecmis' | 'sinir'; mesaj: string } | null;
export declare function bugunuGoreliOner(deger: unknown, bicim?: string | null, referans?: Date | string | null, sinirlar?: TarihSinirlari, simdi?: Date): string;
export type EskiyenTarihAlani = { anahtar: string; etiket: string; deger: string; mesaj: string; bicim: string | null; sinirlar: Record<string, unknown> | null };
export declare function eskiyenTarihAlanlari(alanlar: ReadonlyArray<unknown>, veri: Record<string, unknown> | null | undefined, simdi?: Date, referans?: Date | string | null): EskiyenTarihAlani[];
export declare function kayittanGoreliIfade(deger: unknown, bicim?: string | null, kayitAni?: Date): string | null;
