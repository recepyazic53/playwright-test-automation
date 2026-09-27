// scripts/platform/ayarlar/saglik-esikleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const SAGLIK_AYAR_ANAHTARI: string;
export declare const VARSAYILAN_SAGLIK_ESIKLERI: Readonly<{ yesil: number; sari: number }>;
export declare function saglikEsikleriniOku(vt: Veritabani, projeId: string): { yesil: number; sari: number };
export declare function saglikEsikleriniKaydet(vt: Veritabani, projeId: string, girdi: unknown): { yesil: number; sari: number };
export declare function saglikSinifi(oran: number, esikler?: { yesil: number; sari: number }): 'basari' | 'uyari' | 'hata';
