// scripts/platform/ayarlar/hata-pencereleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type HataPenceresi = { id: string; ad: string; secici: string; cerceve?: string[]; goruntu?: string; etkin: boolean };
export declare const HATA_PENCERELERI_ANAHTARI: string;
export declare const HATA_PENCERESI_EN_COK: number;
export declare function hataPencereleriniOku(vt: Veritabani, projeId: string): HataPenceresi[];
export declare function hataPencereleriniKaydet(vt: Veritabani, projeId: string, girdi: unknown): HataPenceresi[];
export declare function kosuHataPencereleri(vt: Veritabani, projeId: string): Array<{ ad: string; secici: string; cerceve?: string[] }>;
