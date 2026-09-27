import type { Veritabani } from '../veritabani/baglanti.mjs';

export type TabloIslemi = 'yeni' | 'birlestir' | 'yeniAd' | 'atla';
export type PaketTestVerisiSecimi = { tablolar?: Record<string, { islem: TabloIslemi; yeniAd?: string }>; baglantilar?: string[] };
export type PaketTestVerisiOnizlemesi = {
  kaynak: 'paket' | 'tarama' | 'kayit';
  tablolar: Array<{
    ad: string; aciklama: string | null; sutunlar: Array<{ ad: string; gizli: boolean; karsilikSayisi: number }>; satirSayisi: number; tekrarSayisi: number;
    ornek: Array<Array<string | null>>; bagliAlanlar: string[];
    mevcut: { id: string; ad: string; sutunSayisi: number; satirSayisi: number; yeniSutunlar: string[]; eklenecekSatir: number } | null;
  }>;
  baglantilar: Array<{ alanId: string; alanEtiketi: string; tablo: string; sutun: string; modeldeVar: boolean; mevcut: { tablo: string; sutun: string } | null }>;
};

export declare function paketKaynakTuru(meta: Record<string, unknown> | null | undefined): 'paket' | 'tarama' | 'kayit';
export declare function paketTestVerisiOnizle(vt: Veritabani, projeId: string, paket: unknown, ekranId: string | null): PaketTestVerisiOnizlemesi | null;
export declare function paketTestVerisiniYaz(vt: Veritabani, projeId: string, ekranId: string, paket: unknown, secim: unknown): {
  tablolar: Array<{ ad: string; id: string; islem: TabloIslemi; eklenenSatir: number; eklenenSutun: number }>; baglanan: number;
};
