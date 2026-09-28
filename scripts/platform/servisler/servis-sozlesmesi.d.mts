// scripts/platform/servisler/servis-sozlesmesi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Alan } from './servis-govdesi.mjs';
import type { Servis } from './servis-deposu.mjs';
import type { KontrolSonucu } from './soap-istemcisi.mjs';
import type { Sema } from './sozlesme-dogrulayici.mjs';

export declare const SOZLESME_KAYNAKLARI: readonly ['wsdl', 'openapi', 'jsonSchema', 'taslak'];
export type SozlesmeKaynagi = (typeof SOZLESME_KAYNAKLARI)[number];
export declare const KAYNAK_ETIKETLERI: Readonly<Record<SozlesmeKaynagi, string>>;
export interface Sozlesme { kaynak: SozlesmeKaynagi; bicim: 'json' | 'xml'; sema: Sema; xmlKok?: string; kaynakBilgisi?: string; guncellenme: string }
export interface SozlesmeGecmisi {
  zaman: string; islem: 'olustur' | 'degistir' | 'sil'; kaynak?: string; kaynakBilgisi?: string; alanSayisi?: number;
  fark?: { eklenen: number; kaldirilan: number; degisen: number }; yapan?: string;
}
export interface SozlesmeTaslagi { kaynak: SozlesmeKaynagi; bicim: 'json' | 'xml'; sema: Sema; xmlKok?: string; kaynakBilgisi?: string; uyarilar: string[]; ozet: { alanSayisi: number; zorunluSayisi: number } }
export interface OpenapiOperasyonu { anahtar: string; metot: string; yol: string; operationId?: string; ozet?: string; durumKodu?: string; sema?: Sema; uyarilar: string[]; hata?: string }

export declare function belgeOku(metin: string): unknown;
export declare function refCoz(belge: unknown, dugum: unknown, uyarilar?: string[]): any;
export declare function openapiOperasyonlari(metin: string): { baslik: string; operasyonlar: OpenapiOperasyonu[] };
export declare function openapiOnerisi(ops: Array<{ anahtar: string; metot: string; yol: string; operationId?: string }>, uc: { ad: string; metot?: string; yol?: string }): string | null;
export declare function jsonSemaOku(metin: string): { sema: Sema; uyarilar: string[] };
export declare function alanlardanSema(alanlar: Alan[]): Sema;
export declare function wsdlDosyalarindanYanit(metinler: string[], operasyon: string): { kok: string; ns: string; alanlar: Alan[] };
export declare function sozlesmeBilgisi(vt: Veritabani, projeId: string, g: { servisId: string; operasyon: string }): {
  sozlesme: Sozlesme | null; ozet?: { alanSayisi: number; zorunluSayisi: number }; gecmis: SozlesmeGecmisi[]; wsdlYanitiVar: boolean;
  ornekler: Array<{ kosuId: string; baslik: string; baslangic: string; tur: 'dene' | 'kosu'; ortamId: string | null }>; senaryoSayisi: number;
};
export declare function sozlesmeOnizle(vt: Veritabani, projeId: string, g: {
  servisId: string; operasyon: string; kaynak: string; metin?: string; metinler?: string[]; dosyaAdi?: string; openapiAnahtari?: string; kosuIdleri?: string[];
}): { taslak?: SozlesmeTaslagi; operasyonlar?: Array<Omit<OpenapiOperasyonu, 'sema'> & { semaVar: boolean }>; oneri?: string | null; baslik?: string };
export declare function sozlesmeKaydet(vt: Veritabani, projeId: string, g: { servisId: string; operasyon: string; sozlesme: unknown; onay?: boolean; yapan?: string }): {
  kaydedildi?: boolean; sozlesme?: Sozlesme; onayGerekli?: boolean;
  fark?: { eklenen: number | string[]; kaldirilan: number | string[]; degisen: number | string[]; sayilar?: { eklenen: number; kaldirilan: number; degisen: number } };
};
export declare function sozlesmeSil(vt: Veritabani, projeId: string, g: { servisId: string; operasyon: string; onay?: boolean; yapan?: string }): { silindi?: boolean; onayGerekli?: boolean; senaryoSayisi?: number };
export declare function yanitSozlesmesiniDenetle(servis: Servis, operasyon: string, yanit: { govde: string }, maskele: (m: string) => string): {
  kontrol: KontrolSonucu; ozet: { durum: 'gecti' | 'kaldi' | 'yok'; toplam: number; uyumsuzluklar: Array<{ yol: string; mesaj: string }> };
};
