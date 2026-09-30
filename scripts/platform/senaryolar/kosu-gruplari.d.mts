// scripts/platform/senaryolar/kosu-gruplari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type KosuGrubu = { id: string; projeId: string; ad: string; senaryoIdleri: string[]; olusturulma: string; guncellenme: string };
export declare const KOSU_GRUBU_AYAR_ANAHTARI: string;
export declare const KOSU_GRUBU_AD_SINIRI: number;
export declare const KOSU_GRUBU_SENARYO_SINIRI: number;
export declare function kosuGruplariniListele(vt: Veritabani, projeId: string): Array<KosuGrubu & { kayipSayisi: number }>;
export declare function kosuGrubuKaydet(vt: Veritabani, girdi: { id?: string | null; projeId: string; ad: unknown; senaryoIdleri: unknown }): KosuGrubu;
export declare function kosuGrubuSil(vt: Veritabani, projeId: string, id: string): { silindi: true };
export declare function kosuGruplariniTemizle(vt: Veritabani, projeId: string): void;
