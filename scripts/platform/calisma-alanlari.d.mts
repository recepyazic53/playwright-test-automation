// scripts/platform/calisma-alanlari.mjs için tip bildirimi.
export declare const KAYIT_DEFTERI_DOSYASI: string;
export declare const CALISMA_ALANLARI_KLASORU: string;
export declare const VERITABANI_DOSYASI: string;
export declare const CALISMA_ALANI_DEGISKENI: string;
export declare const VERI_KOKU_DEGISKENI: string;
export declare const AD_EN_COK: number;
export declare const ILK_ALAN_ADI: string;

export type CalismaAlaniHataKodu = 'GECERSIZ' | 'BULUNAMADI' | 'AYNI_AD' | 'BOZUK' | 'ACIK' | 'ONAY' | 'MESGUL' | 'SABIT' | 'KAPALI';
export declare class CalismaAlaniHatasi extends Error {
  constructor(kod: CalismaAlaniHataKodu, mesaj: string);
  kod: CalismaAlaniHataKodu;
}

export interface CalismaAlani {
  id: string;
  ad: string;
  /** Veri köküne göre göreli ("/" ayraçlı). */
  veritabani: string;
  medya: string;
  yedekler: string;
  olusturulma: string;
  sonAcilma: string | null;
  projeSayisi: number | null;
}
export interface KayitDefteri {
  surum: 1;
  sonAcilan: string | null;
  alanlar: CalismaAlani[];
}
export interface AlanYollari {
  veritabani: string;
  medya: string;
  yedekler: string;
}

export declare function veriKoku(projeKoku?: string): string;
export declare function adiDogrula(ad: unknown): string;
export declare function kayitDefteriniOku(kok: string): KayitDefteri | null;
export declare function kayitDefteriniYaz(kok: string, defter: KayitDefteri): void;
export declare function kayitDefteriniHazirla(kok: string): { defter: KayitDefteri; yerindeKaydedildi: boolean };
export declare function alanYollari(kok: string, alan: CalismaAlani): AlanYollari;
export declare function alanOlustur(kok: string, ad: unknown): CalismaAlani;
export declare function alanYenidenAdlandir(kok: string, id: string, ad: unknown): CalismaAlani;
export declare function alanAcildi(kok: string, id: string, bilgi?: { projeSayisi?: number | null }): CalismaAlani;
export declare function alanProjeSayisiniYaz(kok: string, id: string, projeSayisi: number | null): void;
export declare function sonAcilaniTemizle(kok: string): void;
export declare function alanKaldir(kok: string, id: string, onayAdi: unknown): { silinenDosya: number };
export declare function alanBul(defter: KayitDefteri, secim: string): CalismaAlani | undefined;
export declare function calismaAlaniniCoz(kok: string): { alan: CalismaAlani; yollar: AlanYollari; kaynak: 'degisken' | 'son-acilan' | 'tek' } | null;
