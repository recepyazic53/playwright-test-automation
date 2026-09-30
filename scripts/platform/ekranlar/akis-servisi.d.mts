// scripts/platform/ekranlar/akis-servisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { AkisBlogu, AkisEnvanteri, AkisPaleti } from '../tarama/akis-tasarimi.mjs';
import type { PaketTestVerisiOnizlemesi } from '../tablolar/paket-test-verisi.mjs';
import type { KorunanParca } from '../tarama/paket-olusturucu.mjs';

type AkisSatiri = { id: string; ad: string; varsayilan: boolean; adimSayisi: number; senaryoSayisi: number };
export declare function akisDuzenlenebilirMi(model: Record<string, unknown>): { duzenlenebilir: boolean; neden: string | null };
export declare function modeldenAkisEnvanteri(model: Record<string, unknown>): AkisEnvanteri;
/** Akış tasarımında "Önce şu ekrana gidilsin" listesi öğesi: projenin ortak akışı ya da ekranı. */
export type OrtakAkisOzeti = { dosya: string; ad: string; tur: 'ortakAkis' | 'ekran'; adimlar: string[]; yalnizTest: boolean };
export declare function ortakAkislariListele(vt: Veritabani, projeId: string, haricEkranId?: string): OrtakAkisOzeti[];
export declare function adimlardanBloklar(model: Record<string, unknown>, adimlar: Record<string, unknown>[], env: AkisEnvanteri, akisId?: string): AkisBlogu[];
/** Modelin tüm akışlarının diyagramda düzenlenemeyen (aynen korunan) parçaları: blok anahtarı → parça; özetler; alanların gösterilemeyen koşulları. */
export declare function korunanParcalari(model: Record<string, unknown>): {
  parcalar: Record<string, KorunanParca>;
  ozetler: Record<string, { akis: string; baslik: string; ozet: string[] }>;
  alanKosullari: Map<string, { anahtar: string; gorunurluk: Record<string, unknown>; aciklama: string; etiket: string }>;
};
/** Ortak akışı kullanan ekran (akış adları + senaryo sayısı). */
export type OrtakAkisKullanani = { id: string; ad: string; akislar: string[]; senaryoSayisi: number };
export declare function akislariListele(vt: Veritabani, projeId: string, ekranId: string): {
  akislar: AkisSatiri[]; duzenlenebilir: boolean; neden: string | null; ortakAkis: boolean; kullananlar?: OrtakAkisKullanani[];
};
export declare function ortakAkisAdaylari(vt: Veritabani, projeId: string, ortakEkranId: string): {
  ortakAkis: { id: string; ad: string; dosya: string };
  ekranlar: Array<{ id: string; ad: string; varsayilanAkis: string; senaryoSayisi: number; kullananAkislar: string[]; eklenebilir: boolean; neden: string | null }>;
};
export declare function ortakAkisEkranlaraEkle(vt: Veritabani, projeId: string, ortakEkranId: string, g: { ekranIdleri: unknown; istegeBagli?: boolean; dahilVarsayilan?: boolean; onay?: boolean }):
  { etki: { ortakAkis: string; istegeBagli: boolean; dahilVarsayilan: boolean; ekranlar: Array<{ id: string; ad: string; akis: string; senaryoSayisi: number }> } }
  | { eklenen: Array<{ id: string; ad: string; surum: number }> };
export declare function akisTasarimi(vt: Veritabani, projeId: string, ekranId: string, s: { akisId?: string | null; kopya?: string | null }): {
  ekran: { id: string; anahtar: string; ad: string }; bloklar: AkisBlogu[]; palet: AkisPaleti; ortakAkislar: OrtakAkisOzeti[]; ortakAkis: boolean; kullananlar?: OrtakAkisKullanani[];
  akis: { id: string; ad: string; varsayilan: boolean } | null; kopyaKaynagi: string | null;
  /** Diyagramdaki "Ekran açılır" düğümünün üstündeki blok sayısı (baştaki ortak akışlar ekran açılmadan önce); ortak akışta null. */
  ekranAcilisSirasi: number | null;
};
/**
 * ekranAcilisSirasi: "Ekran açılır"ın üstündeki blok sayısı (yalnız ortak akış blokları olabilir). Baştaki ortak akışların hepsi
 * üstündeyse "once" (varsayılan), hiçbiri değilse "sonra" yazılır; verilmezse akışın mevcut ayarı korunur.
 */
export declare function akisKaydet(vt: Veritabani, projeId: string, ekranId: string, g: { akisId?: string | null; ad: unknown; bloklar: unknown; onay?: boolean; kayitEnvanteri?: AkisEnvanteri; testVerisi?: unknown; elleOgeler?: unknown; ekranAcilisSirasi?: unknown }):
  { etki: { yeni: boolean; senaryolar: Array<{ id: string; baslik: string }>; korunanSilinen?: string[]; ekranlar?: OrtakAkisKullanani[]; semaYukseltme?: true }; akisId: string; testVerisi?: PaketTestVerisiOnizlemesi }
  | { akisId: string; surum: number; semaYukseltme?: true; testVerisi?: { tablolar: Array<{ ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number }>; baglanan: number } };
export declare function akisVarsayilanYap(vt: Veritabani, projeId: string, ekranId: string, akisId: string, yapan?: string): { surum: number | null; tasinan: number };
export declare function akisSil(vt: Veritabani, projeId: string, ekranId: string, akisId: string): { surum: number };
/** "Boş başla": adımı olmayan ortak akış (model v1) oluşturur; adımları Akışlar sekmesinde diyagramdan eklenir. */
export declare function bosOrtakAkisOlustur(vt: Veritabani, projeId: string, g: { ad: unknown; anahtar?: unknown }): { ekranId: string; surum: number; akisId: string };
