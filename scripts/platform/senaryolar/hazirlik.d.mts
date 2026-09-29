export type HazirlikDurumu = 'tamam' | 'eksik' | 'yok' | 'bekliyor';
export interface HazirlikMaddesi {
  anahtar: string;
  durum: HazirlikDurumu;
  baslik: string;
  ayrinti: string;
  neden?: string;
  sayi?: string;
  hedef?: { tur: string; adimId?: string; alan?: string };
}
export type BeklenenSonuc = { tur: 'basari' } | { tur: 'hata'; adim?: string; mesaj?: string };

export declare const HAZIRLIK_BASLIKLARI: Readonly<Record<'alanlar' | 'parametreler' | 'veri' | 'gonderme' | 'beklenen' | 'kontrol' | 'ortam', string>>;
export declare const ORTAM_DENETIMI_GECERLILIK_MS: number;
export declare const NEDENLER: Readonly<{
  modelYok: string;
  kodluSenaryo: string;
  ekranSilindi: string;
  ortamdaTanimsiz: (ortam?: string | null) => string;
  gondermeYok: string;
  beklenenYok: string;
  hataAdimiYok: string;
  hataMesajiYok: string;
  hataAdimiModeldeYok: (adim: string) => string;
  hataAdimiKapsamDisi: (adim: string) => string;
  ortakAkisYok: (adim: string, ad: string) => string;
  alanlarEksik: (n: number) => string;
  veriEksik: (ayrinti: string) => string;
  parametreEksik: string;
  kontrolYok: string;
}>;
export declare function calistirilamazCumlesi(nedenler: ReadonlyArray<string>): string | null;
export declare function zincirNedeni(no: number, ad: string, durum?: string): string;
export declare function eylemDenetimi(model: unknown, g?: { adimDahil?: Record<string, boolean | null | undefined>; beklenen?: BeklenenSonuc | null }):
  { gonderme: HazirlikMaddesi; beklenen: HazirlikMaddesi; engeller: string[] };
export declare function alanMaddesi(g: { toplam: number; hatali: number; ilkHata?: string | null }): HazirlikMaddesi;
export declare function veriMaddesi(g: { kullaniliyor: boolean; bekliyor?: boolean; satirlar?: string[]; sorun?: string | null; hedef?: { tur: string; alan?: string } }): HazirlikMaddesi;
export declare function hazirlikOzeti(maddeler: ReadonlyArray<HazirlikMaddesi>, engeller?: ReadonlyArray<string>):
  { calistirilabilir: boolean; nedenler: string[]; neden: string | null; eksikler: string[] };
export declare function sayiIyelikEki(n: number): string;
export declare function kosuSayimMetni(toplam: number, calistirilamaz: number): string | null;
export declare function ortamDenetimiMetni(d: { erisilebilir: boolean; durumKodu?: number | null; sureMs?: number | null; oturum?: string | null; mesaj?: string | null; zaman?: number } | null | undefined, simdi?: number): string;
