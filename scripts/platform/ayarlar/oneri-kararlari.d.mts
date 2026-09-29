// scripts/platform/ayarlar/oneri-kararlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { OneriKarari } from '../senaryolar/senaryo-onerileri.d.mts';

export declare const ONERI_KARARLARI_ANAHTARI: string;
export declare const PROJE_BASINA_EN_COK_KARAR: number;
export declare const EN_COK_KARAR: number;
export declare function oneriKararlariniOku(vt: Veritabani, projeId: string, tur?: 'ekran' | 'servis'): OneriKarari[];
export declare function oneriKarariKaydet(vt: Veritabani, projeId: string, girdi: unknown, simdi?: Date): OneriKarari;
export declare function oneriKararlariniSifirla(vt: Veritabani, projeId: string, ekranId?: string | null): number;
