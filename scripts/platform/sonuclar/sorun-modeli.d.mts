// scripts/platform/sonuclar/sorun-modeli.mjs için tip bildirimi.
import type { Donem } from './donem.mjs';

export declare const ESIKLER: Readonly<{
  artis: number; azalis: number; enAzFark: number; cozulmeGecis: number; kararsizPay: number; kararsizOran: number; kararsizKosu: number; izlenirOran: number;
}>;
export declare const SORUN_DURUMLARI: ReadonlyArray<string>;
export declare const SORUN_DURUM_ETIKETLERI: Readonly<Record<string, string>>;
export declare const SERVIS_HATA_TURLERI: ReadonlyArray<readonly [string, string]>;
export type Gozlem = {
  zaman: number; durum: string; senaryo: string; maruz: string; ortam: string | null; surum?: string | number | null;
  deneme?: number; tekrarKosusu?: boolean; imza?: { parcalar: string[]; bilgi: Record<string, unknown> };
};
export type Kararlilik = { kosu: number; degisim: number; oran: number; ekKanit: boolean; durum: 'kararsiz' | 'izlenir' | 'kararli' };
export type Sorun = {
  imza: string; bilgi: Record<string, unknown>; durum: string; n: number; nOnceki: number; maruz: number; maruzOnceki: number;
  oran: number; oranOnceki: number; senaryolar: string[]; ilk: number; son: number; seri: number[]; oncekiSeri: number[]; acikGun: number;
  tekrarRozeti: boolean; kararsizPay: number; gecis: number;
};
export declare function imzaKimligi(parcalar: ReadonlyArray<string>): string;
export declare function kararlilikHesapla(gozlemler: ReadonlyArray<Gozlem>, e?: typeof ESIKLER): Map<string, Kararlilik>;
export declare function sorunlariHesapla(gozlemler: ReadonlyArray<Gozlem>, donem: Donem, s?: { esikler?: typeof ESIKLER; kararlilik?: Map<string, Kararlilik>; simdi?: number }): Sorun[];
export declare function kategoriKisaAdi(kategori: string): string;
export declare function sinifTahmini(g: { tur: 'ekran' | 'servis'; kategori?: string | null; hataTuru?: string | null; durum?: string }): {
  sinif: 'uygulama' | 'veri' | 'bakim' | 'ortam' | 'kararsiz'; dayanak: string;
};
export declare const BAGLANTI_ESIKLERI: Readonly<{ jaccard: number; enAzOrtak: number }>;
export declare function baglantiliSorunlar<T extends { imza: string; seri: number[]; n: number }>(
  ekranSorunlari: ReadonlyArray<T>, servisSorunlari: ReadonlyArray<T>, e?: Readonly<{ jaccard: number; enAzOrtak: number }>
): Array<{ ekran: T; servis: T; ortak: number; birlesim: number; jaccard: number }>;
