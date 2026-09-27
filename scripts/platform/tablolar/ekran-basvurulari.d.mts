// scripts/platform/tablolar/ekran-basvurulari.mjs için tip bildirimi (ekran senaryosunda ${Tablo.Sütun} başvuruları).
import type { Tablo } from './tablo-secimi.mjs';

export type EkranBaglari = Record<string, { tablo: string; sutun: string; etiket?: string }>;
export declare function modelAlanBilgisi(model: unknown): { alanAnahtarlari: Record<string, string>; secenekDegerleri: Record<string, string[]> };
export declare function ekranBasvurulariniCoz(veri: Record<string, unknown>, s: {
  tablolar: Tablo[]; baglar?: EkranBaglari; alanAnahtarlari?: Record<string, string>; secenekDegerleri?: Record<string, string[]>;
  ortamId: string | null; tabloSecimleri?: Record<string, Record<string, string>>;
}): { veri: Record<string, unknown>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }>; cozulen: number };
export declare function tabloBasvurusuVarMi(veri: unknown): boolean;
