import type { Veritabani } from '../veritabani/baglanti.mjs';

export type TabloIslemi = 'yeni' | 'birlestir' | 'yeniAd' | 'atla';
export type PaketTestVerisiSecimi = { tablolar?: Record<string, { islem: TabloIslemi; yeniAd?: string }>; baglantilar?: string[] };
export type PaketTestVerisiOnizlemesi = {
  kaynak: 'paket' | 'tarama' | 'kayit';
  tablolar: Array<{
    ad: string; tur: 'liste' | 'kayit' | 'servis' | null; aciklama: string | null; sutunlar: Array<{ ad: string; gizli: boolean; karsilikSayisi: number }>; satirSayisi: number; tekrarSayisi: number;
    ornek: Array<Array<string | null>>; bagliAlanlar: string[];
    mevcut: { id: string; ad: string; sutunSayisi: number; satirSayisi: number; yeniSutunlar: string[]; eklenecekSatir: number } | null;
  }>;
  baglantilar: Array<{ alanId: string; alanEtiketi: string; tablo: string; sutun: string; modeldeVar: boolean; mevcut: { tablo: string; sutun: string } | null }>;
};

export declare function paketKaynakTuru(meta: Record<string, unknown> | null | undefined): 'paket' | 'tarama' | 'kayit';
export declare function paketTestVerisiOnizle(vt: Veritabani, projeId: string, paket: unknown, ekranId: string | null): PaketTestVerisiOnizlemesi | null;
export declare function paketTestVerisiniYaz(vt: Veritabani, projeId: string, ekranId: string, paket: unknown, secim: unknown, secenekler?: { ertele?: (alanId: string) => boolean }): {
  tablolar: Array<{ ad: string; id: string; islem: TabloIslemi; eklenenSatir: number; eklenenSutun: number }>; baglanan: number;
  ertelenen: Record<string, { tablo: string; sutun: string; etiket?: string }>;
};

/** Mevcut tablo ile yeni tablonun birleştirme planı: sütun eşleşmesi (paket sütunu → mevcut sütun adı), eklenecek sütunlar ve satırlar. */
export declare function birlestirmePlani(
  mevcut: { sutunlar: Array<{ ad: string }>; satirlar: Array<{ degerler: Record<string, string | null> }> },
  t: { sutunlar: Array<{ ad: string; gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }>; satirlar: Array<Record<string, string | null>> }
): { eslesme: Map<string, string>; yeniSutunlar: Array<{ ad: string; gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }>; eklenecek: Array<Record<string, string | null>> };
