// scripts/platform/servisler/taban-adresleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface TabanHucresi { deger: string; kaynak: 'servis' | 'ortam' | 'yok' | 'eski' }
export declare function tabanHucresi(ayarlar: { tabanlar?: Record<string, string>; adresler?: Record<string, string> }, ortam: { id: string; tabanUrl: string }): TabanHucresi;
export declare function tabanTablosu(vt: Veritabani, projeId: string): {
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
