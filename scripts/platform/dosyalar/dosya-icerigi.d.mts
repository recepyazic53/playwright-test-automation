// scripts/platform/dosyalar/dosya-icerigi.mjs için tip bildirimi.
export type DosyaBicimi = 'otomatik' | 'csv' | 'xlsx' | 'pdf' | 'metin';
export type HucreSatiri = { tur: 'no'; no: number } | { tur: 'kosul'; sutun: string; deger: string };
export type HucreBeklentisi = { tur: 'hucre'; sutun: string; deger: string; satir?: HucreSatiri };
export type DosyaBeklentisi =
  | { tur: 'adDeseni'; deger: string }
  | { tur: 'enAzBoyut'; deger: number }
  | { tur: 'icerir'; deger: string }
  | { tur: 'icermez'; deger: string }
  | { tur: 'sutunVar'; deger: string }
  | { tur: 'satirSayisi'; islem: 'esit' | 'enAz'; deger: number }
  | HucreBeklentisi;
export type DosyaTanimi = {
  bicim: DosyaBicimi;
  ayrac?: string;
  kodlama?: string;
  baslikSatiri?: boolean;
  sayfa?: string;
  /** Ekran: indirmeyi bekleme süresi (sn). */
  zamanAsimiSn?: number;
  /** Ekran: indirmeyi başlatan düğme. */
  tetikleyici?: { secici: string; aciklama?: string };
  beklentiler: DosyaBeklentisi[];
};
export type DosyaIcerigi = { metin: string; hucreMetni?: string; tablo: { baslik: string[]; satirlar: string[][] } | null; bilgi: Record<string, string> };
export type BeklentiSonucu = { tur: DosyaBeklentisi['tur']; ad: string; gecti: boolean; beklenen: string; gorulen: string };
export type DosyaKontrolSonucu = {
  gecti: boolean;
  dosya: { ad: string; boyut: number; bicim: string; kodlama?: string; ayrac?: string; sayfa?: string; satirSayisi?: number; sutunlar?: string[] };
  beklentiler: BeklentiSonucu[];
  okumaHatasi?: string;
};
export declare const DOSYA_BICIMLERI: readonly DosyaBicimi[];
export declare const KODLAMALAR: readonly string[];
export declare const AYRACLAR: readonly string[];
export declare const BEKLENTI_TURLERI: readonly DosyaBeklentisi['tur'][];
export declare const TABLO_BEKLENTILERI: readonly string[];
export declare const BEKLENTI_EN_COK: number;
export declare const METIN_EN_UZUN: number;
export declare const DOSYA_EN_BUYUK: number;
export declare const KESIT_UZUNLUGU: number;
export declare const MASKE: string;
export declare class DosyaIcerikHatasi extends Error {
  constructor(mesaj: string);
}
export declare function metniNormallestir(metin: unknown): string;
export declare function adDesenineUyar(ad: string, desen: string): boolean;
export declare function dosyaTanimiDogrula(ham: unknown): { tanim: DosyaTanimi; hatalar: string[] };
export declare function beklentiAdi(b: DosyaBeklentisi): string;
export declare function tanimMetinleri(tanim: unknown): string[];
export declare function basvurular(m: string): string[];
export declare function boyutMetni(n: number): string;
export declare function bicimBul(d: { ad?: string; icerikTuru?: string | null; veri: Buffer }, istenen?: string): 'csv' | 'xlsx' | 'pdf' | 'metin';
export declare function metinCoz(v: Buffer, kodlama?: string): { metin: string; kodlama: 'utf8' | 'utf8bom' | 'windows1254' };
export declare function ayracBul(m: string): string;
export declare function csvAyristir(m: string, ayrac: string): string[][];
export declare function sutunIndeksi(ref: string): number;
export declare function sutunHarfi(i: number): string;
export declare function xlsxOku(v: Buffer, sayfa?: string): { sayfa: string; satirlar: string[][] };
export declare function pdfMetni(veri: Buffer): string;
export declare function dosyaIceriginiOku(veri: Buffer, bicim: 'csv' | 'xlsx' | 'pdf' | 'metin', a?: { ayrac?: string; kodlama?: string; baslikSatiri?: boolean; sayfa?: string }): DosyaIcerigi;
export declare function maskele(m: string, gizliler: ReadonlyArray<string>): string;
export declare function dosyayiDogrula(
  dosya: { ad: string; icerikTuru?: string | null; veri: Buffer },
  tanim: DosyaTanimi,
  s?: { coz?: (ifade: string) => string | undefined; gizliler?: ReadonlyArray<string>; ekGizliAdlar?: ReadonlyArray<string> }
): DosyaKontrolSonucu;
export declare function sonucOzeti(r: DosyaKontrolSonucu): string;
export declare function kalanlarMetni(adim: string, r: DosyaKontrolSonucu): string;
export declare function yanitDosyaAdi(basliklar: Record<string, string> | undefined, adres?: string): string;
