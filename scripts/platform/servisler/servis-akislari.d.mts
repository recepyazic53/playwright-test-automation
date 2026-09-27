// scripts/platform/servisler/servis-akislari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisAkisIcerigi, ServisKapsami } from './servis-deposu.mjs';
import type { OturumSaglayici } from './servis-islemleri.mjs';

export interface AkisAdimSonucu {
  no: number; ad: string; servis: string; senaryo: string; durum: 'basarili' | 'basarisiz' | 'hata' | 'atlandi' | 'durduruldu';
  sureMs: number; kosuId?: string; okunanlar?: Record<string, string>; neden?: string; tur?: 'sql' | 'operasyon'; sql?: Record<string, unknown>; sqlHedefi?: { baglanti: string; veritabani?: string };
}
export declare function servisAkisiDenetle(vt: Veritabani, projeId: string, icerik: ServisAkisIcerigi, adimIcerikleri?: Record<string, unknown>): string[];
export declare function oturumlariTemizle(akisId?: string): void;
export declare const oturumDegerleriniAl: OturumSaglayici;
export declare function servisAkisiCalistir(vt: Veritabani, projeId: string, girdi: {
  akisId?: string; taslak?: { baslik?: string; tur?: 'akis' | 'oturum'; kapsam?: ServisKapsami; icerik: unknown };
  ortamId: string; tur: 'dene' | 'kosu'; sinyal?: AbortSignal; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void;
  /** Akış senaryosu: operasyon adımlarının içerikleri (adım kimliği → tek istekli senaryo içeriği) ve senaryo bilgisi. */
  adimIcerikleri?: Record<string, unknown>; senaryo?: { id: string | null; baslik: string; kapsam: ServisKapsami };
}): Promise<{ kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string; ortam: string; ortamTuru: 'test' | 'canli';
  adimlar: AkisAdimSonucu[]; ozet: string; durduruldu?: boolean }>;
/** Operasyonun varsayılan içeriği (şema başlangıç değerleri / REST metodu + yolu). */
export declare function operasyonVarsayilanIcerigi(servis: import('./servis-deposu.mjs').Servis, operasyon: string): Record<string, unknown>;
/** Operasyon adımının isteği: adım içeriği (yoksa varsayılan) + bağlar. */
export declare function operasyonIcerigi(servis: import('./servis-deposu.mjs').Servis, adim: unknown, icerik?: unknown): Record<string, unknown>;
