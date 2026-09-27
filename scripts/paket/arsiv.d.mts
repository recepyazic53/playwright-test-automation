// scripts/paket/arsiv.mjs için tip bildirimi.
export interface ZipGirdisi {
  ad: string;
  tur: 'dosya' | 'klasor' | 'baglanti';
  /** Unix izin bitleri (ZIP Unix/macOS'ta üretildiyse), yoksa null. */
  mod: number | null;
  boyut: number;
  /** Açılmış içerik (bağlantıda hedef yolu); CRC-32 denetimli. */
  veri(): Buffer;
}
export interface TarGirdisi {
  ad: string;
  tur: 'dosya' | 'klasor' | 'baglanti' | 'diger';
  mod: number;
  hedef: string;
  veri: Buffer;
}
export interface TarKaydi {
  tur: 'dosya' | 'klasor' | 'baglanti';
  mod: number;
  boyut: number;
  hedef?: string;
}
export declare function zipGirdileri(b: Buffer): ZipGirdisi[];
export declare function tarGirdileri(arsiv: Buffer): TarGirdisi[];
export declare function yurutulebilirIcerikMi(v: Buffer): boolean;
export declare class TarYazici {
  constructor(hedefYol: string, secenek?: { zaman?: number; seviye?: number });
  readonly bayt: number;
  readonly kayitlar: Map<string, TarKaydi>;
  klasor(ad: string, mod?: number): Promise<void>;
  dosya(ad: string, veri: Buffer, mod: number): Promise<void>;
  baglanti(ad: string, hedef: string): Promise<void>;
  bitir(): Promise<void>;
}
