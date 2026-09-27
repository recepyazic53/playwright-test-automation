// scripts/platform/guvenlik/izinler.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const IZIN_AYAR_ANAHTARI: 'izinler';
export declare const IZIN_GECMIS_TURU: 'izin';
export { IZIN_ANAHTARLARI, izinMesaji } from './izin-tanimlari.mjs';

export declare class IzinHatasi extends Error {
  constructor(anahtar: string, baglam?: string);
  readonly kod: 'IZIN_KAPALI';
  readonly izin: string;
  readonly etiket: string;
  readonly baglam: string | null;
}
export declare function izinleriOku(vt: Veritabani | null | undefined): Record<string, boolean>;
export declare function izinAcikMi(vt: Veritabani | null | undefined, anahtar: string): boolean;
export declare function izinGerekli(vt: Veritabani | null | undefined, anahtar: string, baglam?: string): void;
export declare function izinDurumundanDenetle(durum: Record<string, unknown> | null | undefined, anahtar: string, baglam?: string): void;
export declare function izinDegistir(vt: Veritabani, anahtar: unknown, acik: unknown, s?: { onay?: unknown; yapan?: string }): {
  izinler: Record<string, boolean>; degisti: boolean;
};
export declare function izinDegisiklikleri(vt: Veritabani, sinir?: number): Array<{
  id: string; zaman: string; izin: string; etiket: string; acik: boolean; yapan: string; makineId: string | null;
}>;
