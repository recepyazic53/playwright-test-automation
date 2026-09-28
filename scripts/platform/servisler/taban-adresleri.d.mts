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
  /** Değişen adreslerde sorgu dizisi / parça uyarıları (kaydı engellemez). */
  uyarilar: TabanAdresUyarisi[];
}
export interface TabanAdresUyarisi { ortamId: string; ortam: string; adres: string; mesaj: string }
export declare const TABAN_SORGU_UYARISI: string;
/** Taban adresinde sorgu dizisi (?…) ya da parça (#…) varsa uyarı metni; yoksa null. Engellemez. */
export declare function tabanAdresiUyarisi(adres: string): string | null;
export declare function tabanlariUygula(vt: Veritabani, projeId: string, girdi: {
  degisiklikler: Record<string, { tabanlar?: Record<string, string | null>; grup?: string | null }>; onay?: boolean; yapan?: string;
  tabanKararlari?: Record<string, TabanKarari>; tabanDegisikligi?: boolean;
}): { onizleme: TabanEtkisi; uygulandi?: true; tabanKararlari?: Record<string, TabanKarari> };

/** Bağlı servisin adresi tabandan farklılaşırken kararlar: ayır / tabanın adresini güncelle / vazgeç. */
export declare const TABAN_KARARLARI: readonly ['ayir', 'tabaniGuncelle', 'vazgec'];
export type TabanKarari = typeof TABAN_KARARLARI[number];
export interface TabanCakismasi { ortamId: string; ortam: string; eski: string; yeni: string }
export declare class TabanKarariHatasi extends Error {
  kod: 'TABAN_KARARI';
  karar: { servisId: string; servis: string; taban: string; cakismalar: TabanCakismasi[]; etki: TabanAdiEtkisi };
  constructor(mesaj: string, karar: TabanKarariHatasi['karar']);
}
export declare function tabanKararlariniDogrula(x: unknown): Record<string, TabanKarari>;
export interface TekServisTabanKarari { tabanlar: Record<string, string>; ayir: boolean; guncelle: { ad: string; adresler: Record<string, string> } | null }
export declare function tabanKarari(vt: Veritabani, projeId: string, g: {
  servis: Servis | undefined; tabanlar: Record<string, string>; kararlar?: Record<string, TabanKarari>; onizleme?: boolean;
}): TekServisTabanKarari;
export declare function tabanKarariUygula(vt: Veritabani, projeId: string, k: TekServisTabanKarari, yapan?: string): void;
export declare function servisTabanBaglantisi(vt: Veritabani, projeId: string, servisId: string | undefined, ad: string): { tabanlar: Record<string, string> };
export interface TabanAdiEtkisi extends TabanEtkisi {
  /** Adresi boş kalacak (bu ortamda koşamayacak) servisler ve ortam adları. */
  bosKalacaklar: Array<{ servisId: string; ad: string; ortamlar: string[] }>;
  taban: { islem: 'ekle' | 'degistir' | 'sil'; ad: string; yeniAd: string; eski: Record<string, string> | null; yeni: Record<string, string> | null };
}
export declare function tabanAdresiIslemi(vt: Veritabani, projeId: string, girdi: {
  islem: 'ekle' | 'degistir' | 'sil'; ad: string; yeniAd?: string; adresler?: Record<string, string>; baglanacaklar?: string[]; onay?: boolean; yapan?: string;
}): { onizleme: TabanAdiEtkisi; uygulandi?: true };
