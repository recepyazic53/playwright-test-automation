// scripts/platform/servisler/taban-adresleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Servis } from './servis-deposu.mjs';

export interface TabanHucresi { deger: string; kaynak: 'servis' | 'ortam' | 'yok' | 'eski' }
/** Adlandırılmış taban adresi. adresler: ortamId → adres ('' = bu ortamda yok); kayitli: ortam ayarında kayıtlı (değilse eski addan türetildi). */
export interface TabanAdi { ad: string; adresler: Record<string, string>; kayitli: boolean; kullanan: string[] }
export declare function tabanHucresi(ayarlar: { tabanlar?: Record<string, string>; adresler?: Record<string, string> }, ortam: { id: string; tabanUrl: string }): TabanHucresi;
export declare function tabanAdlari(ortamlar: Array<{ id: string; tabanUrl: string; ayarlar: Record<string, unknown> }>, servisler: Servis[]): TabanAdi[];
export declare function tabanTablosu(vt: Veritabani, projeId: string): {
  tabanAdlari: TabanAdi[];
  ortamlar: Array<{ id: string; ad: string; canli: boolean; tabanUrl: string; tabanAdresleri: string[] }>;
  satirlar: Array<{ servisId: string; ad: string; anahtar: string; tur: 'soap' | 'rest'; yol: string; grup: string | null;
    tabanlar: Record<string, TabanHucresi>; senaryoSayisi: number; akislar: string[] }>;
};
export interface TabanEtkisi {
  servisler: Array<{ servisId: string; ad: string; tur: 'soap' | 'rest'; grup: { eski: string | null; yeni: string | null };
    adresler: Array<{ ortamId: string; ortam: string; eski: TabanHucresi; yeni: TabanHucresi }>; senaryoSayisi: number; akislar: string[] }>;
  toplam: { servis: number; senaryo: number; akis: number };
}
export declare function tabanlariUygula(vt: Veritabani, projeId: string, girdi: {
  degisiklikler: Record<string, { tabanlar?: Record<string, string | null>; grup?: string | null }>; onay?: boolean; yapan?: string;
}): { onizleme: TabanEtkisi; uygulandi?: true };
export declare function servisTabanBaglantisi(vt: Veritabani, projeId: string, servisId: string | undefined, ad: string): { tabanlar: Record<string, string> };
export interface TabanAdiEtkisi extends TabanEtkisi {
  /** Adresi boş kalacak (bu ortamda koşamayacak) servisler ve ortam adları. */
  bosKalacaklar: Array<{ servisId: string; ad: string; ortamlar: string[] }>;
  taban: { islem: 'ekle' | 'degistir' | 'sil'; ad: string; yeniAd: string; eski: Record<string, string> | null; yeni: Record<string, string> | null };
}
export declare function tabanAdresiIslemi(vt: Veritabani, projeId: string, girdi: {
  islem: 'ekle' | 'degistir' | 'sil'; ad: string; yeniAd?: string; adresler?: Record<string, string>; baglanacaklar?: string[]; onay?: boolean; yapan?: string;
}): { onizleme: TabanAdiEtkisi; uygulandi?: true };
