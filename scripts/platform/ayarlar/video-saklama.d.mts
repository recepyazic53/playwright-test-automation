// scripts/platform/ayarlar/video-saklama.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const MEDYA_AYAR_ANAHTARI: string;
export declare const VIDEO_SAKLAMA_VARSAYILAN_GUN: number;
export declare function kayitliVideoSaklamaGunu(vt: Veritabani | null | undefined): number | null;
export declare function videoSaklamaGunu(vt?: Veritabani | null): number;
