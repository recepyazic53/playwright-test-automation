import type { Veritabani } from './veritabani/baglanti.mjs';

export interface OrtakSurum { surum: number; dosya: string; yapan: string; zaman: string; not: string; bayt: number }
export interface OrtakDurum {
  klasor: string | null;
  bulunamadi: boolean;
  benimSurum: number;
  sonSurum: number;
  /** Eski bir sürüme bilinçli dönüldü: yeni sürüm yayınlanabilir. */
  geriDonus: boolean;
  guncelleVar: boolean;
  surumler: OrtakSurum[];
}
export declare const ORTAK_KLASOR_AYARI: string;
export declare const ORTAK_DURUM_AYARI: string;
export declare const ORTAK_LISTE_DOSYASI: string;
export declare function ortakKlasorAyarla(vt: Veritabani, klasor: unknown): void;
export declare function ortakDurum(vt: Veritabani): OrtakDurum;
export declare function ortakYayinla(
  vt: Veritabani,
  secenekler?: { yapan?: string; not?: string; ilerleme?: (asama: string, yuzde: number) => void }
): Promise<OrtakSurum>;
export declare function ortakSurumDosyasi(vt: Veritabani, surum?: number): { yol: string; kayit: OrtakSurum };
export declare function ortakAlindiIsaretle(vt: Veritabani, surum: number): void;
export declare const KULLANICI_ADI_AYARI: string;
export declare function kullaniciAdiOku(vt: Veritabani): string;
export declare function kullaniciAdiYaz(vt: Veritabani, ad: unknown): void;
