// scripts/platform/sonuclar/servis-sonuclari.mjs için tip bildirimi (testlerde kullanılan kısım).
import type { Veritabani } from '../veritabani/baglanti.mjs';

/** Doğrulanan dosyanın özeti (içerik dönmez). saklandi: dosyanın kendisi şifreli koşu kaydında. */
export interface DogrulananDosyaOzeti { sira: number; ad: string; bicim: string; boyut: number; gecti: boolean; saklandi: boolean }
export declare function servisSonucSenaryosu(vt: Veritabani, q: URLSearchParams): {
  sonuc: Record<string, unknown> & { id: string; servisId: string; baslik: string; durum: string; dosyalar: DogrulananDosyaOzeti[] };
};
/** Saklanan doğrulanan dosya (ham; tarayıcı indirir, sunucu diske yazmaz). */
export declare function servisSonucDosyasi(vt: Veritabani, q: URLSearchParams): { dosya: { ad: string; icerikTuru: string; icerikBase64: string } };
export declare const SERVIS_SONUC_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
