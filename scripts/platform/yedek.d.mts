// scripts/platform/yedek.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
import type { KdfParametreleri } from './kasa.mjs';

export type IlerlemeFn = (asama: string, yuzde: number, bayt?: { islenen: number; toplam: number }) => void;
export type YedekHataKodu = 'BICIM' | 'SURUM' | 'ONAY_GEREKLI' | 'KASA_UYUSMAZ' | 'VERI' | 'DEGISTI' | 'MESGUL' | 'BULUNAMADI';
export declare class YedekHatasi extends Error {
  constructor(kod: YedekHataKodu, mesaj: string);
  readonly kod: YedekHataKodu;
}
export interface MedyaSecimi {
  ekranGoruntuleriDahil?: boolean;
  videolarDahil?: boolean;
  izDosyalariDahil?: boolean;
}
export type CozulmusMedyaSecimi = Required<MedyaSecimi>;
export interface YedekMedyaOzeti {
  secim: CozulmusMedyaSecimi;
  dosyaSayisi: number;
  bayt: number;
  turler: Record<string, { sayi: number; bayt: number }>;
}
export interface YedekManifesti {
  bicimSurumu: number;
  semaSurumu: number;
  olusturulma: string;
  makine: { id: string; ad: string };
  ortak?: boolean;
  sayimlar: Record<string, number>;
  /** Biçim 2: yedeğe alınan medya dosyaları (biçim 1'de yok). */
  medya?: YedekMedyaOzeti;
}
export interface MedyaYerlestirmeSonucu {
  eklenen: number;
  bayt: number;
  zatenVardi: number;
  atlanan: number;
  dahilDegil: number;
  yenidenSifrelenen: number;
}
export interface IceAktarmaSonucu {
  mod: 'tamYukle';
  manifest: YedekManifesti;
  sayimlar: Record<string, number>;
  guvenlikYedegi: string | null;
  medya: MedyaYerlestirmeSonucu | null;
}
export interface YedekKasaBilgisi {
  kdf: KdfParametreleri;
  dogrulayici: string;
  medyaAnahtari?: string;
}
export interface AcilmisYedek {
  manifest: YedekManifesti;
  kasa: YedekKasaBilgisi;
  tablolar: Record<string, Record<string, unknown>[]>;
  bicimSurumu: number;
  kasaAnahtari: Buffer;
  /** Yedekteki medya ana anahtarı (açılmış); yoksa null. Çağıran sıfırlamalıdır. */
  medyaAnahtari: Buffer | null;
  /** medya kimliği → hazırlık klasörüne çıkarılan şifreli dosya (hazırlık klasörü yoksa yol null). */
  medyaDosyalari: Map<string, { yol: string | null; boyut: number }>;
}

export declare const YEDEK_UZANTISI: string;
/** Yedeğe girmeyen ayarlar kayıtları (ör. Özet panosu SQL kartı sonuçları). */
export declare const YEDEK_DISI_AYARLAR: readonly string[];
export declare function yedekDosyaAdi(alanAdi: string | null | undefined, zaman?: Date): string;
export declare const BICIM_SURUMU: number;
export declare const ESKI_BICIM_SURUMU: number;
export declare const OTOMATIK_SAKLAMA_SAYISI: number;
export declare const YEDEK_PARCA_BOYUTU: number;
export declare const VARSAYILAN_MEDYA_SECIMI: Readonly<CozulmusMedyaSecimi>;
export declare const MEDYA_TURU_SECENEGI: Readonly<Record<string, keyof CozulmusMedyaSecimi>>;
export declare const YEDEK_KLASORU_AYARI: 'yedek-klasoru';
export declare function veriKlasoruYedekYolu(vt: Veritabani): string;
export declare function seciliYedekKlasoru(vt: Veritabani): string | null;
export declare function varsayilanYedekKlasoru(vt: Veritabani): string;
export declare function medyaSeciminiCoz(secim?: MedyaSecimi): CozulmusMedyaSecimi;
export declare function yedekOlustur(vt: Veritabani, secenekler?: { ilerleme?: IlerlemeFn }): { veri: Buffer; manifest: YedekManifesti };
export declare function yedekDosyasiYaz(
  vt: Veritabani,
  hedef: string,
  secenekler?: MedyaSecimi & { medyaKlasoru?: string | null; ilerleme?: IlerlemeFn; ortak?: boolean }
): Promise<{ dosya: string; boyut: number; manifest: YedekManifesti }>;
export declare function yedekBoyutTahmini(vt: Veritabani): {
  secenekler: Record<keyof CozulmusMedyaSecimi, { sayi: number; bayt: number }>;
  varsayilan: CozulmusMedyaSecimi;
};
export declare function yedekAc(
  kaynak: Buffer | string,
  parola: string,
  secenekler?: { ilerleme?: IlerlemeFn; hazirlikKlasoru?: string | null }
): Promise<AcilmisYedek>;
export declare function yedekIceAktar(
  vt: Veritabani,
  dosya: Buffer | string,
  parola: string,
  secenekler: { mod: 'tamYukle'; onay?: boolean; ilerleme?: IlerlemeFn; guvenlikYedegiKlasoru?: string; medyaKlasoru?: string | null }
): Promise<IceAktarmaSonucu>;
export declare function hazirlikKlasoruYolu(klasor: string): string;
export declare function hazirlikKlasorunuSil(yol: string | null | undefined): void;
export declare function medyalariYerlestir(
  vt: Veritabani,
  girdi: {
    klasor: string;
    kaynakAnahtar: Buffer | null;
    dosyalar: Map<string, { yol: string | null; boyut: number }>;
    idler: readonly string[];
    ilerleme?: IlerlemeFn;
  }
): Promise<MedyaYerlestirmeSonucu>;
export declare function medyaAnahtariniBenimse(vt: Veritabani, yedekZarfi: string | undefined, anahtarlar: Array<Buffer | null>): void;
export declare function veritabaniBosMu(vt: Veritabani): boolean;
export declare function tabloSutunlari(vt: Veritabani, tablo: string): string[];
export declare function satirEkle(vt: Veritabani, tablo: string, satir: Record<string, unknown>, sutunlar: string[]): void;
export declare function sutunlariDogrula(vt: Veritabani, tablolar: Record<string, Record<string, unknown>[]>): Map<string, string[]>;
export declare function tamYukleYaz(
  vt: Veritabani,
  tablolar: Record<string, Record<string, unknown>[]>,
  kasa: { kdf: object; dogrulayici: string; medyaAnahtari?: string },
  kasaAnahtari: Buffer,
  ilerleme?: IlerlemeFn
): void;
export declare function otomatikYedekAl(
  vt: Veritabani,
  secenekler?: { klasor?: string; saklanacak?: number; simdi?: Date }
): { dosya: string; boyut: number; manifest: YedekManifesti; silinenler: string[] };
