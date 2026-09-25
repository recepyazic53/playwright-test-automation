// scripts/platform/guvenlik/yasak-adresler.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { YasakDeseni } from '../senaryolar/model-kosusu.mjs';

export declare const GUVENLIK_AYAR_ANAHTARI: 'guvenlik';
export declare const YASAK_ADRES_EN_COK: number;
export declare function yasakAdresleriniNormallestir(ham: unknown): string[];
export declare function ayarlardakiYasakAdresler(vt: Veritabani | null | undefined): string[];
export declare function yasakAdresleriKaydet(vt: Veritabani, ham: unknown): string[];
export declare function ortamdakiYasakAdresler(ortam?: NodeJS.ProcessEnv): string[];
export declare function etkinYasakAdresler(vt: Veritabani | null | undefined, ortam?: NodeJS.ProcessEnv): string[];
export declare function etkinYasakDesenleri(vt: Veritabani | null | undefined, ortam?: NodeJS.ProcessEnv): YasakDeseni[];
