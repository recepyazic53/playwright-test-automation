// scripts/platform/ekranlar/ekran-surumleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

type Nesne = Record<string, any>;
export type Secenek = { deger: string; metin: string };
export type SurumAlani = { etiket: string; tur: string; secici: string; cerceve?: string[]; secenekler?: Secenek[]; degisken?: true; nerede: string[]; senaryolar: string[]; ham: Nesne };
export type SurumDugmesi = { metin: string; nerede: string[]; senaryolar: string[] };
export type EkranSurumu = { alanlar: Record<string, SurumAlani>; dugmeler: Record<string, SurumDugmesi>; adimlar: Record<string, string> };
export type Degisiklik = { tur: 'gelenAlan' | 'kaybolanAlan' | 'yeniSecenek' | 'kaldirilanSecenek' | 'gelenDugme' | 'kaybolanDugme'; baslik: string; nerede: string; anahtar?: string };
export declare const EKRAN_ANALIZI_EKI: 'ekran-analizi';
export declare const KESIF: 'kesif';
export declare function okumadanSurum(okuma: Nesne, senaryoId: string): { surum: EkranSurumu; kesifYapildi: boolean; gecilenAdimlar: string[] };
export declare function surumFarki(onceki: EkranSurumu, yeni: ReturnType<typeof okumadanSurum>, senaryoId: string): { surum: EkranSurumu; degisiklikler: Degisiklik[] };
export declare function ekranSurumleri(vt: Veritabani, projeId: string, ekranId: string): { gecmis: Nesne[]; alanSayisi: number; dugmeSayisi: number };
export declare function kosuEkranSurumu(vt: Veritabani, k: { sonucId: string; senaryoId: string }, s: { medyaKlasoru: string }): Promise<Nesne | null>;
export declare function alaniModeleEkle(vt: Veritabani, projeId: string, ekranId: string, anahtar: string, s: { medyaKlasoru: string }): Promise<{ ekranId: string; bulguSayisi: number }>;
