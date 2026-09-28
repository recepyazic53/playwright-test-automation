// scripts/paket/hedef-korumasi.mjs için tip bildirimi.
export declare const CALISAN_DOSYALAR: readonly string[];
export declare const VERI_KLASORU: string;
export declare function altindaMi(yol: string, hedef: string): boolean;
export declare function surecYollari(): Array<{ pid: number; yol: string }>;
export declare function kilitliMi(dosya: string): boolean;
export type HedefDenetimi = { silinebilir: true } | { silinebilir: false; neden: 'calisiyor' | 'veri'; mesaj: string };
export declare function hedefDenetimi(
  hedef: string,
  secenek?: { zorla?: boolean; surecler?: Array<{ pid: number; yol: string }>; kilitDenemesi?: boolean }
): HedefDenetimi;
export declare const PAKET_BAYRAKLARI: readonly string[];
export declare function paketArgumanlari(argumanlar: string[]): { hedef: string | null; zorla: boolean; acilisDenemesi: boolean; bilinmeyen: string[] };
