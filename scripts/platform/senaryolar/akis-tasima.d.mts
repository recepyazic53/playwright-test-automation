// scripts/platform/senaryolar/akis-tasima.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { AktarimAdaptoru, AkisSenaryoTaslagi } from '../../../projeler/index.mjs';

export type AkisTasimaTaslagi = AkisSenaryoTaslagi & { durum: 'yeni' | 'var' | 'hata'; hatalar: string[] };
export declare function akisTasimaOnizle(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, adaptor: AktarimAdaptoru | null): {
  kaynakEkran: string; ekran: { id: string; ad: string }; ortam: { id: string; ad: string }; notlar: string[]; taslaklar: AkisTasimaTaslagi[];
};
export declare function akisTasimaUygula(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, adaptor: AktarimAdaptoru | null, basliklar: unknown): {
  eklenen: number; atlanan: number;
};
