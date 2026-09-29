// scripts/platform/senaryolar/oneri-baglami.mjs için tip bildirimi (birim testleri import eder).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { OneriGecmisi } from './senaryo-onerileri.mjs';

/** Başarısız sonuçların bakıldığı gün sayısı. */
export declare const HATA_GUNU: number;
/** Görülen uyarıların bakıldığı gün sayısı. */
export declare const UYARI_GUNU: number;

/** oneriGecmisi sonucu: tüm alanlar dolu. */
export type OneriGecmisiSonucu = Required<OneriGecmisi>;

export declare function degerSatirlari(
  veri: Record<string, unknown>, veriKosulari: Record<string, unknown> | null, tabloSecimleri: Record<string, Record<string, string>> | null, tablolar: unknown[], ortamId: string
): Array<Record<string, unknown>> | null;

export declare function oneriBaglami(
  vt: Veritabani, projeId: string, ekranId: string, ortamId: string, akisId?: string | null, simdi?: Date
): Record<string, unknown> & { senaryolar: unknown[]; kapsamSenaryolari: unknown[]; gecmis: OneriGecmisiSonucu; kararlar: unknown[] };

/**
 * Ekranın koşu geçmişi (bu ortam ya da ortamı bilinmeyen koşular): son HATA_GUNU gündeki başarısız sonuçlar (senaryo + hatanın
 * alındığı ilk adım) ve son UYARI_GUNU gündeki iş kuralı uyarıları (hata göstergesi / diyalog; kalıba göre gruplu, maskeli).
 */
export declare function oneriGecmisi(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, simdi: Date): OneriGecmisiSonucu;
