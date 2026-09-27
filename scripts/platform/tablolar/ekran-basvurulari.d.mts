// scripts/platform/tablolar/ekran-basvurulari.mjs için tip bildirimi (ekran senaryosunda ${Tablo.Sütun} başvuruları).
import type { Sutun, Tablo } from './tablo-secimi.mjs';

export type EkranBaglari = Record<string, { tablo: string; sutun: string; etiket?: string }>;
export declare function modelAlanBilgisi(model: unknown): {
  alanAnahtarlari: Record<string, string>; secenekDegerleri: Record<string, string[]>;
  /** Senaryo anahtarı → modeldeki alan tipi. */
  alanTipleri: Record<string, string>;
  /** Senaryo anahtarı → dosya alanının kabul ettiği uzantı. */
  kabuller: Record<string, string>;
};
/** true/false, evet/hayır, 1/0, E/H … → boolean; tanınmazsa null. */
export declare function mantiksalDeger(d: unknown): boolean | null;
/** Tablodan çözülen değerin ekrana gidecek biçimi (onay kutusu → boolean, dosya → dosya adı, diğerleri → seçenek / sayfa değeri). */
export declare function ekrandakiDeger(c: { sutun: Sutun; deger: string }, s?: {
  tip?: string; secenekler?: string[]; kabul?: string; dosyaDenetle?: (ad: string) => string | null;
}): { deger: string | boolean } | { hata: string };
export declare function ekranBasvurulariniCoz(veri: Record<string, unknown>, s: {
  tablolar: Tablo[]; baglar?: EkranBaglari; alanAnahtarlari?: Record<string, string>; secenekDegerleri?: Record<string, string[]>;
  alanTipleri?: Record<string, string>; kabuller?: Record<string, string>; dosyaDenetle?: (ad: string) => string | null;
  ortamId: string | null; tabloSecimleri?: Record<string, Record<string, string>>;
}): { veri: Record<string, unknown>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }>; cozulen: number };
/** Ekran senaryosunun satır seçimlerini doğrular / temizler (gizli sütun ve olmayan tablo / sütun hata). */
export declare function tabloSecimleriniAyikla(v: unknown, tablolar: ReadonlyArray<{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }>):
  { secimler: Record<string, Record<string, string>> | undefined; hatalar: string[] };
export declare function tabloBasvurusuVarMi(veri: unknown): boolean;
