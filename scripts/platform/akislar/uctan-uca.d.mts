// scripts/platform/akislar/uctan-uca.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { CalistirmaSecenekleri, Kosucu } from '../senaryolar/calistirma.d.mts';
import type { AkisAdimSonucu } from '../servisler/servis-akislari.mjs';

export type UctanUcaCalistirici = { kosucu: () => Kosucu | null; secenekler: (vt: Veritabani) => CalistirmaSecenekleri };
export declare function uctanUcaKosucusuAyarla(c: UctanUcaCalistirici | null): void;
export declare function ekranAdimiDenetle(vt: Veritabani, projeId: string, a: unknown): string | null;

export type UctanUcaGirdisi = { akisId?: unknown; icerik?: unknown; baslik?: unknown; kapsam?: unknown; ortamId: unknown; sinyal?: AbortSignal };
export type UctanUcaOnDenetimi = {
  akis: { id: string | null; baslik: string; adimSayisi: number; taslak: boolean };
  ortam: { id: string; ad: string; riskli: boolean };
  hatalar: string[];
  uyarilar: string[];
  izinler: Array<{ anahtar: string; etiket: string; acik: boolean; adimlar: string[] }>;
  canliOnayGerekli: boolean;
  kosulabilir: boolean;
};
export declare function uctanUcaOnDenetim(vt: Veritabani, projeId: string, g: UctanUcaGirdisi): UctanUcaOnDenetimi;
export declare function uctanUcaCalistir(vt: Veritabani, projeId: string, g: UctanUcaGirdisi): Promise<{
  kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string; ortam: string; ortamTuru: 'test' | 'canli';
  adimlar: AkisAdimSonucu[]; ozet: string; durduruldu?: boolean;
}>;
export declare const UCTAN_UCA_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const UCTAN_UCA_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>;
