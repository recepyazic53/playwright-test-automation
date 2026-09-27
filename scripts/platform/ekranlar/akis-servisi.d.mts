// scripts/platform/ekranlar/akis-servisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { AkisBlogu, AkisEnvanteri, AkisPaleti } from '../tarama/akis-tasarimi.mjs';
import type { PaketTestVerisiOnizlemesi } from '../tablolar/paket-test-verisi.mjs';

type AkisSatiri = { id: string; ad: string; varsayilan: boolean; adimSayisi: number; senaryoSayisi: number };
export declare function akisDuzenlenebilirMi(model: Record<string, unknown>): { duzenlenebilir: boolean; neden: string | null };
export declare function modeldenAkisEnvanteri(model: Record<string, unknown>): AkisEnvanteri;
/** Projenin ortak akışı (akış tasarımında "+ > Ortak akış" listesi). */
export type OrtakAkisOzeti = { dosya: string; ad: string; adimlar: string[]; yalnizTest: boolean };
export declare function ortakAkislariListele(vt: Veritabani, projeId: string): OrtakAkisOzeti[];
export declare function adimlardanBloklar(model: Record<string, unknown>, adimlar: Record<string, unknown>[], env: AkisEnvanteri): AkisBlogu[];
/** Ortak akışı kullanan ekran (akış adları + senaryo sayısı). */
export type OrtakAkisKullanani = { id: string; ad: string; akislar: string[]; senaryoSayisi: number };
export declare function akislariListele(vt: Veritabani, projeId: string, ekranId: string): {
  akislar: AkisSatiri[]; duzenlenebilir: boolean; neden: string | null; ortakAkis: boolean; kullananlar?: OrtakAkisKullanani[];
};
export declare function ortakAkisAdaylari(vt: Veritabani, projeId: string, ortakEkranId: string): {
  ortakAkis: { id: string; ad: string; dosya: string };
  ekranlar: Array<{ id: string; ad: string; varsayilanAkis: string; senaryoSayisi: number; kullananAkislar: string[]; eklenebilir: boolean; neden: string | null }>;
};
export declare function ortakAkisEkranlaraEkle(vt: Veritabani, projeId: string, ortakEkranId: string, g: { ekranIdleri: unknown; istegeBagli?: boolean; onay?: boolean }):
  { etki: { ortakAkis: string; istegeBagli: boolean; ekranlar: Array<{ id: string; ad: string; akis: string; senaryoSayisi: number }> } }
  | { eklenen: Array<{ id: string; ad: string; surum: number }> };
export declare function akisTasarimi(vt: Veritabani, projeId: string, ekranId: string, s: { akisId?: string | null; kopya?: string | null }): {
  ekran: { id: string; anahtar: string; ad: string }; bloklar: AkisBlogu[]; palet: AkisPaleti; ortakAkislar: OrtakAkisOzeti[]; ortakAkis: boolean; kullananlar?: OrtakAkisKullanani[];
  akis: { id: string; ad: string; varsayilan: boolean } | null; kopyaKaynagi: string | null;
};
export declare function akisKaydet(vt: Veritabani, projeId: string, ekranId: string, g: { akisId?: string | null; ad: unknown; bloklar: unknown; onay?: boolean; kayitEnvanteri?: AkisEnvanteri; testVerisi?: unknown }):
  { etki: { yeni: boolean; senaryolar: Array<{ id: string; baslik: string }>; ekranlar?: OrtakAkisKullanani[] }; akisId: string; testVerisi?: PaketTestVerisiOnizlemesi }
  | { akisId: string; surum: number; testVerisi?: { tablolar: Array<{ ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number }>; baglanan: number } };
export declare function akisVarsayilanYap(vt: Veritabani, projeId: string, ekranId: string, akisId: string, yapan?: string): { surum: number | null; tasinan: number };
export declare function akisSil(vt: Veritabani, projeId: string, ekranId: string, akisId: string): { surum: number };
