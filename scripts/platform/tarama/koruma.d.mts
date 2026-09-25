// scripts/platform/tarama/koruma.mjs için tip bildirimi.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { YasakDeseni } from '../senaryolar/model-kosusu.mjs';

export type TaramaAsamasi = 'hazirlik' | 'giris' | 'baglam' | 'tarama' | 'kayit';

export declare const OKUMA_YONTEMLERI: readonly string[];
export declare class HedefHatasi extends Error {}
export declare function hedefCoz(tabanUrl: string, hedef: unknown): { adres: string; yol: string };
export declare function taramaAdresleri(tabanUrl: string, hedefAdres: string, tarif: GirisTarifi | null, profilDegerleri: Array<Record<string, unknown> | null>): string[];
export declare function yasakliAdresBul(adresler: string[], desenler: YasakDeseni[]): { adres: string; host: string; kalip: string } | null;
export declare function yasakliTaramaMesaji(b: { host: string; kalip: string }): string;
export declare function adresOzeti(adres: string): string;
export declare function istekKarari(i: {
  yontem: string; adres: string; asama: TaramaAsamasi; yasakDesenleri: YasakDeseni[]; izinliKokenler?: string[] | null;
}): { izin: true } | { izin: false; neden: 'yazma' | 'yasakli' | 'izinsiz-koken'; kalip?: string };
