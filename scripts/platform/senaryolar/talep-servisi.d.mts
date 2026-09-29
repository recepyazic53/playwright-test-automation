// scripts/platform/senaryolar/talep-servisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Servis, ServisSenaryosu } from '../servisler/servis-deposu.mjs';

export type TalepTuru = 'ekran' | 'servis' | 'uctanUca';
export declare const TALEP_TUR_ADLARI: Readonly<Record<TalepTuru, string>>;

export type TalepliEkranSenaryosu = { tur: 'ekran'; id: string; baslik: string; talepler: string[]; ekranId: string | null; ekranAdi: string | null; ekranEtkin: boolean; ortamlar: string[] };
export type TalepliServisSenaryosu = { tur: 'servis'; id: string; baslik: string; talepler: string[]; servisId: string; servisAdi: string; kapsam: string; senaryo: ServisSenaryosu; servis: Servis };
export type TalepliUctanUcaAkisi = { tur: 'uctanUca'; id: string; baslik: string; talepler: string[]; kapsam: string };
export type TalepliOgeler = { ekran: TalepliEkranSenaryosu[]; servis: TalepliServisSenaryosu[]; uctanUca: TalepliUctanUcaAkisi[] };

export declare function talepliOgeler(vt: Veritabani, projeId: string): TalepliOgeler;
export declare function talepGruplari(ogeler: ReadonlyArray<{ tur: TalepTuru; talepler: string[] }>):
  Array<{ talep: string; anahtar: string; ekran: number; servis: number; uctanUca: number; toplam: number }>;
export declare function projeTalepleri(vt: Veritabani, projeId: string): Array<{ talep: string; ekran: number; servis: number; uctanUca: number; toplam: number }>;
export declare function talepSenaryolari(vt: Veritabani, projeId: string, talep: string): TalepliOgeler;

export type TalepKosuPlani = {
  talep: string;
  sayilar: { ekran: number; servis: number; uctanUca: number };
  planlar: Array<{
    ortamId: string; ortamAdi: string; riskli: boolean;
    ekran: Array<{ id: string; baslik: string; ekranAdi: string | null }>;
    servis: Array<{ servisId: string; servisAdi: string; senaryolar: Array<{ id: string; baslik: string }> }>;
    uctanUca: Array<{ id: string; baslik: string }>;
    atlananlar: Array<{ tur: TalepTuru; baslik: string; neden: string }>;
  }>;
};
export declare function talepKosuPlani(vt: Veritabani, projeId: string, talep: unknown): TalepKosuPlani;

export declare const TALEP_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const TALEP_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>;
