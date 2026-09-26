// scripts/platform/servisler/servis-akislari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisAkisIcerigi, ServisKapsami } from './servis-deposu.mjs';
import type { OturumSaglayici } from './servis-islemleri.mjs';

export interface AkisAdimSonucu {
  no: number; ad: string; servis: string; senaryo: string; durum: 'basarili' | 'basarisiz' | 'hata' | 'atlandi' | 'durduruldu';
  sureMs: number; kosuId?: string; okunanlar?: Record<string, string>; neden?: string;
}
export declare function servisAkisiDenetle(vt: Veritabani, projeId: string, icerik: ServisAkisIcerigi): string[];
export declare function oturumlariTemizle(akisId?: string): void;
export declare const oturumDegerleriniAl: OturumSaglayici;
export declare function servisAkisiCalistir(vt: Veritabani, projeId: string, girdi: {
  akisId?: string; taslak?: { baslik?: string; tur?: 'akis' | 'oturum'; kapsam?: ServisKapsami; icerik: unknown };
  ortamId: string; tur: 'dene' | 'kosu'; sinyal?: AbortSignal; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void;
}): Promise<{ kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string; ortam: string; ortamTuru: 'test' | 'canli';
  adimlar: AkisAdimSonucu[]; ozet: string; durduruldu?: boolean }>;
