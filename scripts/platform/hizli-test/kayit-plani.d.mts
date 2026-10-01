import type { Veritabani } from '../veritabani/baglanti.mjs';

export type PlanTablosu = {
  ad: string; tur: 'kayit' | 'liste'; sutunlar: Array<{ ad: string; gizli: boolean; karsiliklar: Record<string, { sayfa: string }> }>;
  satirlar: Array<Record<string, string | null>>; secilen: Record<string, string> | null;
  alanlar: Array<{ oturumAnahtar: string; sutun: string; etiket: string; degerli: boolean }>;
};
export type KayitPlani = { satirAdi: string; tablolar: PlanTablosu[] };
export type PlanSecimi = { tablolar?: Record<string, { islem: string; yeniAd?: string; hedefId?: string }>; baglantilar?: string[] };
export type YazilanTablo = {
  planAdi: string; ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number; hedef: (sutun: string) => string;
  pin: Record<string, string> | null; tur: 'kayit' | 'liste'; plan: PlanTablosu;
};
export type PlanOnizlemesi = {
  kaynak: 'hizli';
  tablolar: Array<{
    ad: string; tur: 'kayit' | 'liste'; aciklama: null; sutunlar: Array<{ ad: string; gizli: boolean; karsilikSayisi: number }>; satirSayisi: number; tekrarSayisi: number;
    ornek: Array<Array<string | null>>; bagliAlanlar: string[];
    benzer: Array<{ id: string; ad: string; puan: number; eklenecekSatir: number }>;
    mevcut: { id: string; ad: string; sutunSayisi: number; satirSayisi: number; yeniSutunlar: string[]; eklenecekSatir: number } | null;
  }>;
  baglantilar: Array<{ alanId: string; alanEtiketi: string; tablo: string; sutun: string; modeldeVar: boolean; mevcut: { tablo: string; sutun: string } | null }>;
};
export type SenaryoOnerisi = { indeks: number; baslik: string; gerekce: string; varsayilanSecili: boolean; alt: { planAdi: string; sutun: string; deger: string; etiket: string } | null };

export declare function planKur(g: { baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string> }): KayitPlani;
export declare function planOnizle(vt: Veritabani, projeId: string, plan: KayitPlani, ekranId: string | null, anahtarlar: Record<string, string>): PlanOnizlemesi;
export declare function varsayilanSecim(onizleme: PlanOnizlemesi): { tablolar: Record<string, { islem: string }>; baglantilar: string[] };
export declare function planYaz(vt: Veritabani, projeId: string, plan: KayitPlani, secim: PlanSecimi, bilgi: { ekranAdi: string }): YazilanTablo[];
export declare function basvuruYaz(tabloAdi: string, sutun: string): string;
export declare function pinAnahtari(tabloId: string): string;
export declare function senaryoOnerileri(plan: KayitPlani, baslik: string): SenaryoOnerisi[];
