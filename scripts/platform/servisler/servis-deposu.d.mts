// scripts/platform/servisler/servis-deposu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const SERVIS_TURLERI: readonly ['soap', 'rest'];
export declare const SENARYO_KAPSAMLARI: readonly ['test', 'canli', 'ikisi'];
export declare const KOSU_DURUMLARI: readonly ['basarili', 'basarisiz', 'hata'];
export declare const KONTROL_TURLERI: readonly ['durumKodu', 'soapYaniti', 'soapHatasiYok', 'soapHatasi', 'icerir', 'icermez', 'xpathEsit', 'jsonEsit', 'veya'];

export declare const HTTP_METOTLARI: readonly ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export type ServisKapsami = 'test' | 'canli' | 'ikisi';
export interface ServisOperasyonu { ad: string; eylem?: string; metot?: string; yol?: string }
/** REST isteğinin tanımı: metot, servis yoluna göre göreli yol (sorgu dahil; ${…} parametreleri olabilir), gövdenin içerik türü. */
export interface ServisHttpTanimi { metot: string; yol: string; icerikTuru?: string }
export interface ServisAyarlari {
  yol?: string; tabanlar?: Record<string, string>; wsdlYolu?: string; soapSurumu?: '1.1' | '1.2'; operasyonlar?: ServisOperasyonu[];
  adresler?: Record<string, string>; yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean;
  kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
  operasyonSemalari?: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi>;
  alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>;
  alanZorunluluklari?: Record<string, string[]>;
  ekAlanlar?: Record<string, Array<{ yol: string; tip?: import('./servis-govdesi.mjs').AlanTipi }>>;
  alanListeleri?: Record<string, Record<string, string>>;
  /** Alan → tablo sütunu ({ tablo, sutun, etiket?, bicim? }) ya da hesaplama kuralı ({ kural }). */
  alanBaglari?: Record<string, Record<string, { tablo?: string; sutun?: string; etiket?: string; bicim?: string; kural?: string }>>;
  erisim?: { ortamId: string; zaman: string; durumKodu: number }; oturumAkisi?: string;
  /** Adlandırılmış taban adres: aynı adlı servislerin taban adresleri hep aynıdır (taban-adresleri.mjs). */
  tabanGrubu?: string;
}
export interface Servis {
  id: string; projeId: string; anahtar: string; ad: string; tur: 'soap' | 'rest'; durum: 'etkin' | 'devre_disi';
  sira: number | null; ayarlar: ServisAyarlari; olusturulma: string; guncellenme: string;
}
export interface ServisKontrolu {
  tur: (typeof KONTROL_TURLERI)[number]; deger?: string; xpath?: string; yol?: string; buyukKucukDuyarsiz?: boolean; duzenliIfade?: boolean; ad?: string; alt?: ServisKontrolu[];
}
export interface ServisSenaryoIcerigi {
  operasyon: string; govde: string; kontroller: ServisKontrolu[]; kimlikProfili?: string; veriProfilleri?: Record<string, string>;
  tabloSecimleri?: Record<string, Record<string, string>>; aciklama?: string; kaynak?: Record<string, unknown>; basliklar?: Record<string, string>;
  http?: ServisHttpTanimi; kosuOrtamlari?: Record<string, boolean>;
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
export declare function kosuOrtamlariDogrula(v: unknown): Record<string, boolean> | undefined;
export declare function servisOrtamdaKosuyaDahil(s: { kosuyaDahil: boolean; icerik: unknown }, ortamId: string): boolean;
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


// Servis akışları (sürüm 11)
export declare const AKIS_TURLERI: readonly ['akis', 'oturum'];
export declare const OKUMA_KAYNAKLARI: readonly ['xml', 'json', 'baslik'];
export declare const EN_COK_AKIS_ADIMI: number;
export declare const VARSAYILAN_OTURUM_OMRU_SN: number;
export interface AkisOkumaTanimi { ad: string; kaynak: 'xml' | 'json' | 'baslik'; yol: string; gizli?: boolean }
/** tur "operasyon": servisin operasyonu (senaryoId yok; baglar: alan yolu → ${akis:Ad}); tur "sql": SQL sorgusu. */
export interface AkisAdimi { id: string; ad: string; servisId: string; senaryoId: string; okumalar: AkisOkumaTanimi[]; hataOlursaDevam?: boolean; tur?: 'sql' | 'operasyon'; operasyon?: string; baglar?: Record<string, string>; sql?: import('../sql/sql-adimi.mjs').SqlTanimi }
export declare const TOKEN_YENILEME: readonly ['suresiDolunca', 'herIstekte'];
export interface ServisAkisIcerigi { adimlar: AkisAdimi[]; omurSaniye?: number; tokenYenileme?: 'suresiDolunca' | 'herIstekte'; aciklama?: string }
export interface ServisAkisi {
  id: string; projeId: string; baslik: string; tur: 'akis' | 'oturum'; kapsam: ServisKapsami; kosuyaDahil: boolean;
  sira: number | null; icerik: ServisAkisIcerigi; olusturulma: string; guncellenme: string;
}
export declare function akisIceriginiDogrula(icerik: unknown, tur: 'akis' | 'oturum', s?: { satirSiniri?: number }): ServisAkisIcerigi;
export declare function servisAkisiKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; baslik: string; tur?: 'akis' | 'oturum'; kapsam?: ServisKapsami; kosuyaDahil?: boolean; sira?: number | null; icerik: unknown; yapan?: string;
}): string;
export declare function servisAkisiGetir(vt: Veritabani, id: string): ServisAkisi | undefined;
export declare function servisAkislariniListele(vt: Veritabani, projeId: string): ServisAkisi[];
export declare function servisAkisiSil(vt: Veritabani, id: string, yapan?: string): boolean;
export interface ServisAkisKosusu {
  id: string; projeId: string; akisId: string | null; ortamId: string | null; tur: 'dene' | 'kosu';
  durum: 'basarili' | 'basarisiz' | 'hata'; baslangic: string; sureMs: number; baslik: string; sonuc: Record<string, any>;
}
export declare function servisAkisKosusuKaydet(vt: Veritabani, girdi: {
  projeId: string; akisId?: string | null; ortamId?: string | null; tur: 'dene' | 'kosu'; durum: 'basarili' | 'basarisiz' | 'hata';
  baslangic: string; sureMs: number; baslik?: string; sonuc: Record<string, unknown>;
}): string;
export declare function servisAkisKosulariniListele(vt: Veritabani, filtre: { projeId: string; akisId?: string; sinir?: number }): ServisAkisKosusu[];
export declare function servisAkisKosusuGetir(vt: Veritabani, id: string): ServisAkisKosusu | undefined;
