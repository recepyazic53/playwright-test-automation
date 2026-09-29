// scripts/platform/sonuclar/kapsam-matrisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { TalepTuru } from '../senaryolar/talep-servisi.mjs';

export type Aralik = { baslangic: string | null; bitis: string | null };
export type MatrisSonucu = 'basarili' | 'basarisiz' | 'kosmadi';
export type TalepDurumu = 'basarili' | 'basarisiz' | 'eksik';
export declare const SONUC_ADLARI: Readonly<Record<MatrisSonucu, string>>;
export declare const TALEP_DURUM_ADLARI: Readonly<Record<TalepDurumu, string>>;

export type KapsamMatrisiSatiri = {
  talep: string; tur: TalepTuru; turAdi: string; id: string; baslik: string; oge: string;
  sonuc: MatrisSonucu; sonucAdi: string; zaman: string | null; ortamId: string | null; ortamAdi: string | null;
};
export type KapsamMatrisi = {
  proje: { id: string; ad: string };
  ortam: { id: string; ad: string } | null;
  aralik: Aralik;
  olusturulma: string;
  talepler: Array<{ talep: string; toplam: number; basarili: number; basarisiz: number; kosmadi: number; durum: TalepDurumu }>;
  satirlar: KapsamMatrisiSatiri[];
};
export declare function kapsamMatrisi(vt: Veritabani, projeId: string, s?: { ortamId?: string | null; aralik?: Aralik; simdi?: Date }): KapsamMatrisi;
export declare function matrisGirdisi(vt: Veritabani, g: Record<string, unknown>, simdi?: Date): { projeId: string; ortamId: string | null; aralik: Aralik };
export declare function kapsamMatrisiCsv(m: KapsamMatrisi): string;
export declare function kapsamMatrisiDosyaAdi(m: KapsamMatrisi, uzanti: 'csv' | 'pdf'): string;
export declare function kapsamMatrisiHtml(m: KapsamMatrisi, s: { maskele: (m: unknown) => string; adMaskele: (m: unknown) => string }): { html: string; baslik: string };
export declare function kapsamMatrisiUcu(vt: Veritabani, q: URLSearchParams): { matris: KapsamMatrisi };
export declare function kapsamMatrisiCsvUcu(vt: Veritabani, govde: Record<string, unknown>): { dosyaAdi: string; csv: string; satir: number };
export declare function kapsamMatrisiPdf(vt: Veritabani, govde: Record<string, unknown>, b?: { simdi?: Date }):
  Promise<{ pdf: Buffer; dosyaAdi: string; sayfa: number; engellenenIstek: number; html: string }>;
export declare const KAPSAM_MATRISI_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const KAPSAM_MATRISI_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>;
