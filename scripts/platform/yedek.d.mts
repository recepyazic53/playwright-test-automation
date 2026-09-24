// scripts/platform/yedek.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
import type { KdfParametreleri } from './kasa.mjs';

export type IlerlemeFn = (asama: string, yuzde: number) => void;
export type YedekHataKodu = 'BICIM' | 'SURUM' | 'ONAY_GEREKLI' | 'KASA_UYUSMAZ' | 'VERI' | 'DEGISTI' | 'MESGUL' | 'BULUNAMADI';
export declare class YedekHatasi extends Error {
  constructor(kod: YedekHataKodu, mesaj: string);
  readonly kod: YedekHataKodu;
}
export interface YedekManifesti {
  bicimSurumu: number;
  semaSurumu: number;
  olusturulma: string;
  makine: { id: string; ad: string };
  sayimlar: Record<string, number>;
}
export interface IceAktarmaSonucu {
  mod: 'tamYukle';
  manifest: YedekManifesti;
  sayimlar: Record<string, number>;
  guvenlikYedegi: string | null;
}

export declare const YEDEK_UZANTISI: string;
export declare const BICIM_SURUMU: number;
export declare const OTOMATIK_SAKLAMA_SAYISI: number;
export declare function varsayilanYedekKlasoru(vt: Veritabani): string;
export declare function yedekOlustur(vt: Veritabani, secenekler?: { ilerleme?: IlerlemeFn }): { veri: Buffer; manifest: YedekManifesti };
export declare function yedekAc(dosya: Buffer, parola: string, secenekler?: { ilerleme?: IlerlemeFn }): Promise<{
  manifest: YedekManifesti;
  kasa: { kdf: KdfParametreleri; dogrulayici: string };
  tablolar: Record<string, Record<string, unknown>[]>;
  kasaAnahtari: Buffer;
}>;
export declare function yedekIceAktar(
  vt: Veritabani,
  dosya: Buffer,
  parola: string,
  secenekler: { mod: 'tamYukle'; onay?: boolean; ilerleme?: IlerlemeFn; guvenlikYedegiKlasoru?: string }
): Promise<IceAktarmaSonucu>;
export declare function veritabaniBosMu(vt: Veritabani): boolean;
export declare function tabloSutunlari(vt: Veritabani, tablo: string): string[];
export declare function satirEkle(vt: Veritabani, tablo: string, satir: Record<string, unknown>, sutunlar: string[]): void;
export declare function sutunlariDogrula(vt: Veritabani, tablolar: Record<string, Record<string, unknown>[]>): Map<string, string[]>;
export declare function tamYukleYaz(
  vt: Veritabani,
  tablolar: Record<string, Record<string, unknown>[]>,
  kasa: { kdf: object; dogrulayici: string },
  kasaAnahtari: Buffer,
  ilerleme?: IlerlemeFn
): void;
export declare function otomatikYedekAl(
  vt: Veritabani,
  secenekler?: { klasor?: string; saklanacak?: number; simdi?: Date }
): { dosya: string; boyut: number; manifest: YedekManifesti; silinenler: string[] };
