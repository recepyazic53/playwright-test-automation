// scripts/platform/servisler/servis-akislari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisAkisIcerigi, ServisKapsami } from './servis-deposu.mjs';
import type { OturumSaglayici } from './servis-islemleri.mjs';

export interface AkisAdimSonucu {
  no: number; ad: string; servis: string; senaryo: string; durum: 'basarili' | 'basarisiz' | 'hata' | 'atlandi' | 'durduruldu';
  sureMs: number; kosuId?: string; okunanlar?: Record<string, string>; neden?: string; /** 401 / 403 sonrası tekrar notu. */ not?: string; tur?: 'sql' | 'operasyon' | 'ekran'; sql?: Record<string, unknown>; sqlHedefi?: { baglanti: string; veritabani?: string };
  /** Ekran adımı (uçtan uca akış): senaryo, ekran koşusunun sonuç / ekran görüntüsü kimlikleri; ezilen alanlar (gizliler maskeli). */
  ekran?: Record<string, unknown>; ezmeler?: Record<string, string>;
}
export declare function servisAkisiDenetle(vt: Veritabani, projeId: string, icerik: ServisAkisIcerigi, adimIcerikleri?: Record<string, unknown>): string[];
export declare function oturumlariTemizle(akisId?: string): void;
/** Ekran adımı kancası (akislar/uctan-uca.mjs kaydeder). */
export type EkranAdimKancasi = {
  denetle: (vt: Veritabani, projeId: string, adim: unknown) => string | null;
  etiket: (vt: Veritabani, adim: unknown) => string;
  kos: (vt: Veritabani, projeId: string, g: { ortamId: string; adim: unknown; degerler: Record<string, string>; gizliler: string[]; sinyal?: AbortSignal; akisBaslik: string; adimNo: number })
    => Promise<{ sonuc: Record<string, unknown>; acik: { okunan: Record<string, string>; gizliler: string[] } }>;
};
export declare function ekranAdimKancasiAyarla(k: EkranAdimKancasi | null): void;
export declare const oturumDegerleriniAl: OturumSaglayici;
export declare function servisAkisiCalistir(vt: Veritabani, projeId: string, girdi: {
  akisId?: string; taslak?: { baslik?: string; tur?: 'akis' | 'oturum'; kapsam?: ServisKapsami; icerik: unknown };
  ortamId: string; tur: 'dene' | 'kosu'; sinyal?: AbortSignal; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void;
  /** Akış senaryosu: operasyon adımlarının içerikleri (adım kimliği → tek istekli senaryo içeriği) ve senaryo bilgisi. */
  adimIcerikleri?: Record<string, unknown>; senaryo?: { id: string | null; baslik: string; kapsam: ServisKapsami };
  /** Uçtan uca akış koşusu (akislar/uctan-uca.mjs): adım başına denetim ve sonuca ek (maskeli taşınan değerler). */
  uctanUca?: boolean; adimDenetimi?: (adim: unknown) => string; sonucEki?: (adimlar: AkisAdimSonucu[]) => Record<string, unknown>;
}): Promise<{ kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string; ortam: string; ortamTuru: 'test' | 'canli';
  adimlar: AkisAdimSonucu[]; ozet: string; durduruldu?: boolean }>;
/** Operasyonun varsayılan içeriği (şema başlangıç değerleri / REST metodu + yolu). */
export declare function operasyonVarsayilanIcerigi(servis: import('./servis-deposu.mjs').Servis, operasyon: string): Record<string, unknown>;
/** Operasyon adımının isteği: adım içeriği (yoksa varsayılan) + bağlar. */
export declare function operasyonIcerigi(servis: import('./servis-deposu.mjs').Servis, adim: unknown, icerik?: unknown): Record<string, unknown>;
