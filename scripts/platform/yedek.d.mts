// scripts/platform/yedek.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
import type { KdfParametreleri } from './kasa.mjs';

export type IlerlemeFn = (asama: string, yuzde: number) => void;
export type YedekHataKodu = 'BICIM' | 'SURUM' | 'ONAY_GEREKLI' | 'KASA_UYUSMAZ' | 'VERI';
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
export interface BirlestirmeCakismasi {
  tablo: string;
  id: string;
  baslik: string | null;
  kazanan: 'yerel' | 'yedek';
  yerelGuncellenme: string | null;
  yedekGuncellenme: string | null;
  aciklama: string;
}
export interface IceAktarmaSonucu {
  mod: 'tamYukle' | 'birlestir';
  manifest: YedekManifesti;
  sayimlar: Record<string, number>;
  guvenlikYedegi: string | null;
  cakismalar: BirlestirmeCakismasi[];
  ozet?: Record<string, { eklenen: number; guncellenen: number; ayni: number; atlanan: number }>;
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
  secenekler: { mod: 'tamYukle' | 'birlestir'; onay?: boolean; ilerleme?: IlerlemeFn; yapan?: string; guvenlikYedegiKlasoru?: string }
): Promise<IceAktarmaSonucu>;
export declare function otomatikYedekAl(
  vt: Veritabani,
  secenekler?: { klasor?: string; saklanacak?: number; simdi?: Date }
): { dosya: string; boyut: number; manifest: YedekManifesti; silinenler: string[] };
