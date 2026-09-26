import type { AkisSenaryoTaslagi, YenidenKurulanVeri } from '../index.d.mts';

/** JetKonut kodlu senaryoları → "JetKonut (akış)" taslakları (tasima-konut.mjs). */
export declare function jetKonutTasiyici(v: YenidenKurulanVeri): { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] };
/** JetİlkAteşKonut kodlu senaryoları → "JetİlkAteşKonut (akış)" taslakları (tasima-konut.mjs). */
export declare function jetIlkAtesKonutTasiyici(v: YenidenKurulanVeri): { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] };
