// scripts/platform/veritabani/baglanti.mjs için tip bildirimi.
export declare const VARSAYILAN_VERITABANI_GORELI_YOLU: string;
export declare function veritabaniYolu(projeKoku?: string): string;
export declare const DEGISIKLIK_SAYACI_META: string;
export declare function atomikIkiliYaz(hedef: string, veri: Uint8Array): void;

export type SqlDegeri = string | number | null | Uint8Array;
export type HamSatir = Record<string, unknown>;

export declare class Veritabani {
  private constructor();
  readonly yol: string | null;
  readonly kapali: boolean;
  calistir(sql: string, parametreler?: readonly unknown[]): void;
  tumu(sql: string, parametreler?: readonly unknown[]): HamSatir[];
  tek(sql: string, parametreler?: readonly unknown[]): HamSatir | undefined;
  islem<T>(fn: () => T): T;
  /** Değişiklik sayacını artırmadan işlem yapar. */
  sayacsizIslem<T>(fn: () => T): T;
  toplamDegisiklik(): number;
  kaydet(): void;
  metaOku(anahtar: string): string | undefined;
  metaYaz(anahtar: string, deger: string): void;
  kapat(): void;
}

export declare function veritabaniAc(yol: string | null, secenekler?: { olustur?: boolean; saltOkunur?: boolean }): Promise<Veritabani>;
