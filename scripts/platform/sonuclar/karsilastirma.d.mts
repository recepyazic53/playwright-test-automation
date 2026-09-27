// scripts/platform/sonuclar/karsilastirma.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DegisimSinifi } from './karsilastirma-hesabi.mjs';

export type KarsilastirmaKosuOzeti = {
  id: string; tur: 'ekran' | 'servis'; kosuTuru: string; kapsam: string; kapsamAnahtari: string; baslangic: string | null; bitis: string | null;
  sureMs: number | null; ortamId: string | null; ortam: string | null; durum: string | null;
  sayilar: { basarili: number; kalan: number; atlanan: number; durduruldu: number }; toplam: number; oran: number | null;
};
export type KarsilastirmaSenaryoTarafi = {
  anahtar: string; baslik: string; grup: string; durum: string; sureMs: number | null; ref: string; httpKodu?: number | null; hataKalibi?: string | null; gorsel?: number;
};
export type KarsilastirmaVerisi = {
  tur: 'ekran' | 'servis'; a: KarsilastirmaKosuOzeti; b: KarsilastirmaKosuOzeti;
  fark: { basarili: number; kalan: number; atlanan: number; durduruldu: number; oran: number | null; sureMs: number | null };
  senaryolar: Array<{ anahtar: string; baslik: string; grup: string; a: KarsilastirmaSenaryoTarafi | null; b: KarsilastirmaSenaryoTarafi | null;
    degisim: DegisimSinifi; degisti: boolean; sureFarkiMs: number | null }>;
  sayim: Record<DegisimSinifi, number>; degisen: number;
};
export type KarsilastirmaAdimi = {
  ad: string; degisim: DegisimSinifi; degisti: boolean; sureFarkiMs: number | null;
  a: { ad: string; durum: string; sureMs: number | null; hata: string | null; httpKodu?: number | null } | null;
  b: { ad: string; durum: string; sureMs: number | null; hata: string | null; httpKodu?: number | null } | null;
  kontroller?: Array<{ ad: string; degisim: DegisimSinifi; degisti: boolean; a: { gecti: boolean; aciklama: string } | null; b: { gecti: boolean; aciklama: string } | null }>;
};
export type KarsilastirmaSenaryosu = {
  tur: 'ekran' | 'servis';
  a: Record<string, unknown> | null; b: Record<string, unknown> | null;
  adimlar: KarsilastirmaAdimi[];
  yakalanan?: Array<{ kaynak: string; kalip: string; metinA: string | null; metinB: string | null; sayiA: number; sayiB: number; beklenen: boolean; durum: 'yalniz-a' | 'yalniz-b' | 'ikisinde' }>;
};
export declare function karsilastirmaVerisi(vt: Veritabani, q: URLSearchParams): KarsilastirmaVerisi;
export declare function karsilastirmaSenaryosu(vt: Veritabani, q: URLSearchParams): KarsilastirmaSenaryosu;
export declare function karsilastirmaAdaylari(vt: Veritabani, q: URLSearchParams): {
  referans: Omit<KarsilastirmaKosuOzeti, 'toplam'>; kosular: Array<Omit<KarsilastirmaKosuOzeti, 'toplam'>>;
};
export declare function karsilastirmaRaporuOlustur(vt: Veritabani, q: URLSearchParams, ortamlar: { medyaKlasoru: string }): Promise<{
  html: string; dosyaAdi: string; boyut: number; goruntu: { eklenen: number; atlanan: number; bayt: number };
}>;
export declare const KARSILASTIRMA_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
