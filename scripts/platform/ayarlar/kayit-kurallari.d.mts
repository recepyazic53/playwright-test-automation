// scripts/platform/ayarlar/kayit-kurallari.mjs için tip bildirimi.
export type KayitSecimi = 'her' | 'yalnizBasari' | 'yalnizHata' | 'kapali';
export type AdimGoruntusuSecimi = 'her' | 'yalnizKalan' | 'secili' | 'kapali';
export type MedyaSinifi = 'video' | 'iz' | 'testSonu' | 'kalanAdim' | 'adim' | 'diger';
export type KayitKurallari = { video: string; ekranGoruntusu: string; iz: string };

export declare const KAYIT_SECIMLERI: readonly KayitSecimi[];
export declare const ADIM_GORUNTUSU_SECIMLERI: readonly AdimGoruntusuSecimi[];
export declare const VIDEO_BOYUTU_SECIMLERI: readonly ['kucuk', 'ekran'];
export declare const BASARILI_GORUNTU_ADI: string;
export declare const HATA_GORUNTU_ADI: string;
export declare const TEST_SONU_GORUNTU_ADLARI: readonly string[];
export declare const KALAN_ADIM_EKI: string;
export declare const GORUNTU_ALINAMADI_EKI: string;
export declare function kayitSecimi(v: unknown, varsayilan: string): string;
export declare function videoIzKipi(secim: string): 'on' | 'retain-on-failure' | 'off';
export declare function ekranGoruntusuKipi(secim: string): 'on' | 'only-on-failure' | 'off';
export declare function medyaAtilsinMi(secim: string, basarili: boolean): boolean;
export declare function medyaSinifi(m: { ad: string; icerikTuru?: string | null; tur?: string | null }): MedyaSinifi;
export declare function ekAtilsinMi(ek: { name: string; contentType?: string }, kurallar: KayitKurallari, basarili: boolean): boolean;
export declare function ortamKayitKurallari(): KayitKurallari;
export declare function adimGoruntusuSecimi(v: unknown): AdimGoruntusuSecimi | null;
export declare function senaryoAdimGoruntusuAyikla(ham: unknown): { secim: AdimGoruntusuSecimi | null; hata: string | null };
export declare function adimGoruntusuAlinsinMi(secim: string, adim: { isaretli?: boolean }): boolean;
export declare const MEDYA_INCELTME_SECIMLERI: readonly ['kapali', 'basarili', 'hatali', 'ikisi'];
export declare function inceltmedeSilinsinMi(
  ayar: { secim: string; koru: boolean },
  m: { sonucBasarili: boolean; sinif: MedyaSinifi; korunanAdim: boolean }
): boolean;
