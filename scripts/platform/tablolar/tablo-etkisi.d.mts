// scripts/platform/tablolar/tablo-etkisi.mjs için tip bildirimi (tablo değer değişikliğinin senaryolara etkisi, onaylı güncelleme).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Tablo, TabloKaynagi } from './tablo-deposu.mjs';

export interface Degisiklik { satirId: string; satirAdi: string; sutun: string; eski: string; yeni: string | null; gizli: boolean }
export interface SatirDegerleri { ortamId: string | null; degerler: Record<string, string | null> }
export type EtkiDurumu = 'guncellenebilir' | 'silindi-uyari' | 'kosuyor' | 'belirsiz' | 'atlanacak';
export interface Etkilenen {
  /** Onaylı çağrıda guncellenecekler bununla verilir (değer içermez). */
  anahtar: string;
  tur: 'ekran' | 'servis'; kaynakId: string; kaynakAdi: string; senaryoId: string; baslik: string;
  nitelik: 'alan' | 'secim';
  /** Alan etiketi / servis alan yolu / "Satır seçimi: Tablo [etiket]". */
  alan: string;
  /** Gizli sütun / hassas alanda "•••". */
  eski: string; yeni: string | null; gizli: boolean;
  durum: EtkiDurumu; neden?: string; ortamlar?: string[];
}
export interface TabloEtkisi {
  degisiklikler: Array<{ tablo: string; satir: string; sutun: string; gizli: boolean; eski: string; yeni: string | null }>;
  etkilenenler: Etkilenen[];
  karsiliklar: Array<{ tablo: string; sutun: string; eski: string; yeni: string }>;
  /** Önizleme ↔ uygulama karşılaştırması için imza (etkiDenetimiyle). */
  imza?: string;
}
export interface EtkiGuncellemesi { guncellenenSenaryo: number; guncellenenAlan: number; atlananlar: Array<{ baslik: string; alan: string; neden: string }>; uyari: number }
export declare const MASKE: string;
export declare const NEDENLER: Readonly<Record<'belirsiz' | 'kismenSilindi' | 'silindi' | 'kosuyor' | 'sayiDegil' | 'dogrulama', string>>;
export declare function sutunTasimasi(eski: Tablo, sutunlar: unknown): Map<string, string>;
export declare function eskiSatirlar(eski: Tablo, tasima: Map<string, string>): Map<string, SatirDegerleri>;
export declare function hucreDegisiklikleri(eski: Tablo, yeni: Tablo, tasima: Map<string, string>): Degisiklik[];
export declare function karsiliklariTasi(yeni: Tablo, degisiklikler: Degisiklik[]): {
  sutunlar: Map<string, Record<string, { sayfa?: string; servis?: string }>>; bilgi: Array<{ sutun: string; eski: string; yeni: string }>;
};
export declare function degerEtkisi(c: {
  sutun: string; deger: string; digerleri: Array<{ sutun: string; deger: string }>; ortamId: string | null;
  degisiklikler: Degisiklik[]; eskiSatirlar: Map<string, SatirDegerleri>; yeni: Tablo;
}): null | { durum: 'guncellenebilir'; yeni: string } | { durum: 'silindi' } | { durum: 'belirsiz'; yeniler: string[] };
export declare function secimEtkisi(c: { kosullar: Record<string, string>; degisiklikler: Degisiklik[]; eskiSatirlar: Map<string, SatirDegerleri>; yeni: Tablo }):
  null | { durum: 'guncellenebilir' | 'silindi' | 'belirsiz'; yeniKosullar: Record<string, string>; degisenler: Array<{ sutun: string; eski: string; yeni: string | null }> };
export declare function tabloKaydetEtkiyle(
  vt: Veritabani,
  girdi: { projeId: string; id?: string; ad: string; sutunlar: unknown; satirlar?: unknown; silinenSatirlar?: unknown; ortamVar?: (id: string) => boolean; kaynak?: TabloKaynagi; etki?: unknown; guncellenecekler?: unknown },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean; yapan?: string }
): { id: string; onayGerekli?: true; etki: TabloEtkisi; guncelleme?: EtkiGuncellemesi };
export interface EtkiSecenekleri {
  etki?: unknown; guncellenecekler?: unknown; kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean; yapan?: string; beklenenImza?: unknown;
}
export interface EtkiliYazici {
  tabloKaydet(girdi: { projeId: string; id?: string; ad: string; sutunlar: unknown; satirlar?: unknown; silinenSatirlar?: unknown; ortamVar?: (id: string) => boolean; kaynak?: TabloKaynagi }): string;
  izle<T>(projeId: string, tabloId: string | null | undefined, yaz: () => T): T;
}
/** Tablo yazan işlemi etki denetimiyle çalıştırır (etki: 'denetle' | 'uygula' | 'onizle'). */
export declare function etkiDenetimiyle<T>(vt: Veritabani, s: EtkiSecenekleri, fn: (yazici: EtkiliYazici) => T): { onayGerekli?: true; farkli?: true; sonuc?: T; etki: TabloEtkisi; guncelleme?: EtkiGuncellemesi };
export declare function etkiImzasi(e: TabloEtkisi): string;
