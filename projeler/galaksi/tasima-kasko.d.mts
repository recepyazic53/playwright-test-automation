import type { AkisSenaryoTaslagi, YenidenKurulanVeri } from '../index.d.mts';

/** JetKasko YK kodlu senaryoları → "JetKasko (akış)" taslakları (tasima-kasko.mjs). */
export declare function jetKaskoTasiyici(v: YenidenKurulanVeri): { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] };
