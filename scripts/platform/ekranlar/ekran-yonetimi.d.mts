// scripts/platform/ekranlar/ekran-yonetimi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { EkranDurumu } from '../veritabani/depo.mjs';

export declare const AD_EN_UZUN: number;
export declare const ACIKLAMA_EN_UZUN: number;
export declare const URL_YOLU_EN_UZUN: number;
export declare const KOD_DOSYASI_EN_COK: number;
export declare const KOD_KLASORU: 'scenarios';

/** Koşulardan hariç tutulacak testler: dosyalar (testDir'e göre spec yolları) + paylaşılan dosyalardaki anahtarlar. */
export type KodKapsami = { dosyalar: string[]; anahtarlar: string[] };
export type MezarTasi = {
  zaman: string;
  /** Kodu KALDIRILMAMIŞ (hariç tutulmaya devam eden) testler. */
  kod: KodKapsami;
  /** Kodu kaldırılan spec dosyaları (testDir'e göre). */
  kaldirilanDosyalar: string[];
  sonuclarSilindi: boolean;
  onceki: Record<string, unknown>;
};

export declare function mezarTasiOku(ham: unknown): MezarTasi | null;
export declare function ekranHaricKapsami(vt: Veritabani, projeId: string): KodKapsami;
export declare function silinmisEkranDosyalari(vt: Veritabani, projeId: string): Set<string>;
export declare function ekranEtkinMi(vt: Veritabani, ekranId: string | null): boolean;

export declare function ekranYenidenAdlandir(vt: Veritabani, projeId: string, ekranId: string, girdi: { ad: unknown; aciklama?: unknown; yapan?: string }): { degisti: boolean; ad: string; aciklama: string | null };
export declare function urlYoluDogrula(ham: unknown): string;
export declare function ekranDuzenle(vt: Veritabani, projeId: string, ekranId: string, girdi: { urlYolu: unknown; yapan?: string }): { degisti: boolean; surum: number; urlYolu: string };
export declare function ekranlariSirala(vt: Veritabani, projeId: string, idler: unknown, yapan?: string): { degisti: boolean };
export declare function ekranDurumunuAyarla(vt: Veritabani, projeId: string, ekranId: string, etkin: boolean, yapan?: string): { durum: EkranDurumu; degisti: boolean };
export declare function ekranGeriYukle(vt: Veritabani, projeId: string, ekranId: string, yapan?: string): { durum: 'etkin' };

export declare function kodYolunuDenetle(kok: string, goreli: unknown): { tam: string; goreli: string } | { neden: string };

export type EkranSilmeOnizlemesi = {
  ekran: { id: string; ad: string; anahtar: string; durum: EkranDurumu };
  sayilar: { modelSurumu: number; senaryo: number; sonuc: number; medya: number; sonucMedyasi: number; ekranMedyasi: number };
  kod: {
    /** Ekranın kodda tanımlı testi var mı (dosyası duran ya da paylaşılan dosyada)? */
    testVar: boolean;
    /** Klasörün tamamı kaldırılacaksa proje köküne göre yolu (ör. "tests/scenarios/urun"). */
    klasor: string | null;
    /** Kaldırılacak dosyaların TAM listesi (proje köküne göre; kuru çalıştırma). */
    dosyalar: string[];
    /** Başka bir ekranla paylaşılan (silinmeyecek) spec dosyaları. */
    paylasilanlar: string[];
    /** tests/scenarios dışında ya da güvensiz olduğu için kaldırılmayacak yollar. */
    reddedilenler: Array<{ yol: string; neden: string }>;
  };
};
export declare function ekranSilmeOnizlemesi(vt: Veritabani, projeId: string, ekranId: string, s: { kodKoku: string }): EkranSilmeOnizlemesi;
export declare function ekranSil(vt: Veritabani, projeId: string, ekranId: string, s: {
  onayAdi: unknown; sonuclariSil?: unknown; koduKaldir?: unknown; beklenenDosyalar?: unknown;
  kodKoku: string; medyaKlasoru: string; yapan?: string; kosuyorMu?: (dosya: string, ad: string) => boolean;
}): {
  tamamenSilindi: boolean;
  mezarTasi: boolean;
  silinen: { modelSurumu: number; senaryo: number; sonuc: number; kosu: number; medya: number; medyaDosyasi: number };
  korunanSonuc: number;
  kod: { kaldirilanlar: string[]; hatalar: Array<{ yol: string; neden: string }>; haricKalan: number };
};
