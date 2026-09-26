// scripts/platform/servisler/servis-deposu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const SERVIS_TURLERI: readonly ['soap', 'rest'];
export declare const SENARYO_KAPSAMLARI: readonly ['test', 'canli', 'ikisi'];
export declare const KOSU_DURUMLARI: readonly ['basarili', 'basarisiz', 'hata'];
export declare const KONTROL_TURLERI: readonly ['durumKodu', 'soapYaniti', 'soapHatasiYok', 'soapHatasi', 'icerir', 'icermez', 'xpathEsit', 'veya'];

export type ServisKapsami = 'test' | 'canli' | 'ikisi';
export interface ServisOperasyonu { ad: string; eylem?: string }
export interface ServisAyarlari {
  yol?: string; tabanlar?: Record<string, string>; wsdlYolu?: string; soapSurumu?: '1.1' | '1.2'; operasyonlar?: ServisOperasyonu[];
  adresler?: Record<string, string>; yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean;
  kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
  operasyonSemalari?: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi>;
  alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>;
  alanZorunluluklari?: Record<string, string[]>;
  ekAlanlar?: Record<string, Array<{ yol: string; tip?: import('./servis-govdesi.mjs').AlanTipi }>>;
  erisim?: { ortamId: string; zaman: string; durumKodu: number };
}
export interface Servis {
  id: string; projeId: string; anahtar: string; ad: string; tur: 'soap' | 'rest'; durum: 'etkin' | 'devre_disi';
  sira: number | null; ayarlar: ServisAyarlari; olusturulma: string; guncellenme: string;
}
export interface ServisKontrolu {
  tur: (typeof KONTROL_TURLERI)[number]; deger?: string; xpath?: string; buyukKucukDuyarsiz?: boolean; duzenliIfade?: boolean; ad?: string; alt?: ServisKontrolu[];
}
export interface ServisSenaryoIcerigi {
  operasyon: string; govde: string; kontroller: ServisKontrolu[]; kimlikProfili?: string; veriProfilleri?: Record<string, string>;
  aciklama?: string; kaynak?: Record<string, unknown>;
}
export interface ServisSenaryosu {
  id: string; projeId: string; servisId: string; baslik: string; kapsam: ServisKapsami; kosuyaDahil: boolean;
  sira: number | null; icerik: ServisSenaryoIcerigi; olusturulma: string; guncellenme: string;
}
export interface ServisKosusu {
  id: string; projeId: string; servisId: string; senaryoId: string | null; ortamId: string | null; tur: 'dene' | 'kosu';
  durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik: string; sonuc: Record<string, any>;
}

export declare function servisKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; anahtar: string; ad: string; tur?: 'soap' | 'rest'; durum?: 'etkin' | 'devre_disi'; sira?: number | null; ayarlar?: ServisAyarlari; yapan?: string;
}): string;
export declare function servisGetir(vt: Veritabani, id: string): Servis | undefined;
export declare function servisleriListele(vt: Veritabani, projeId: string): Servis[];
export declare function servisSil(vt: Veritabani, id: string, yapan?: string): boolean;

export declare function senaryoIceriginiDogrula(icerik: unknown): ServisSenaryoIcerigi;
export declare function servisSenaryosuKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; servisId: string; baslik: string; kapsam?: ServisKapsami; kosuyaDahil?: boolean; sira?: number | null; icerik: unknown; yapan?: string;
}): string;
export declare function servisSenaryosuGetir(vt: Veritabani, id: string): ServisSenaryosu | undefined;
export declare function servisSenaryolariniListele(vt: Veritabani, servisId: string): ServisSenaryosu[];
export declare function servisSenaryosuSil(vt: Veritabani, id: string, yapan?: string): boolean;

export declare function servisKimligiKaydet(vt: Veritabani, girdi: { projeId: string; ad: string; ortamId?: string | null; degerler: Record<string, string> }): string | null;
export declare function servisKimligiSil(vt: Veritabani, projeId: string, ad: string): boolean;
export declare function servisKimlikOzeti(vt: Veritabani, projeId: string): { ad: string; alanlar: string[]; ortamlar: Record<string, string[]> }[];
export declare function servisKimliginiCoz(vt: Veritabani, projeId: string, ad: string, ortamId: string): Record<string, string>;

export declare function servisKosusuKaydet(vt: Veritabani, girdi: {
  projeId: string; servisId: string; senaryoId?: string | null; ortamId?: string | null; tur: 'dene' | 'kosu';
  durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik?: string; sonuc: Record<string, unknown>;
}): string;
export declare function servisKosulariniListele(vt: Veritabani, filtre: { servisId: string; senaryoId?: string; sinir?: number }): ServisKosusu[];
export declare function servisKosusuGetir(vt: Veritabani, id: string): ServisKosusu | undefined;
