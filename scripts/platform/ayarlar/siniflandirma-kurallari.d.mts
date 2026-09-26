// scripts/platform/ayarlar/siniflandirma-kurallari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export interface SiniflandirmaKurali { icerir: string; kategori: string }
export declare const SINIFLANDIRMA_AYAR_ANAHTARI: string;
export declare const EN_COK_KURAL: number;
export declare const KATEGORI_SECENEKLERI: readonly string[];
export declare function siniflandirmaKurallari(vt: Veritabani): SiniflandirmaKurali[];
export declare function siniflandirmaKurallariniKaydet(vt: Veritabani, kurallar: unknown): SiniflandirmaKurali[];
