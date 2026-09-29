// scripts/platform/ayarlar/rapor-verileri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type OgeTuru = 'ekran' | 'servis' | 'akis';
export type RaporIsareti = {
  ogeTuru: OgeTuru; ogeId: string; kritik: boolean; ekipId: string | null; sureEsigiMs: number | null; metotEsikleri: Record<string, number>;
};
export type RaporVerileri = {
  kritik: Set<string>; ekip: Map<string, string>; esik: Map<string, { ms: number | null; metotlar: Record<string, number> }>;
  sayilar: { kritik: number; ekip: number; esik: number; ekipListesi: number };
};
export declare const OGE_TURLERI: readonly ['ekran', 'servis', 'akis'];
export declare const EN_AZ_ESIK_MS: number;
export declare const EN_COK_ESIK_MS: number;
export declare const EN_COK_METOT_ESIGI: number;
export declare const EKIP_ADI_EN_UZUN: number;
export declare const UYGULAMA_SURUMU_EN_UZUN: number;
export declare const UYGULAMA_SURUMU_DEGISKENI: string;
export declare function uygulamaSurumuTemizle(d: unknown): string | null;
export declare function ortamUygulamaSurumu(ortam: { ayarlar?: Record<string, unknown> } | null | undefined): string | null;
export declare function kosuUygulamaSurumu(kosudaki: unknown, ortam: { ayarlar?: Record<string, unknown> } | null | undefined): string | null;
export declare function ekipleriListele(vt: Veritabani, projeId: string): Array<{ id: string; ad: string }>;
export declare function ekipKaydet(vt: Veritabani, g: { projeId: string; id?: string | null; ad: unknown }): string;
export declare function ekipSil(vt: Veritabani, projeId: string, id: string): { etkilenen: number };
export declare function raporIsaretleriniListele(vt: Veritabani, projeId: string): RaporIsareti[];
export declare function raporIsaretiKaydet(vt: Veritabani, g: {
  projeId: string; ogeTuru: unknown; ogeId: unknown; kritik?: unknown; ekipId?: unknown; sureEsigiMs?: unknown; metotEsikleri?: unknown;
}): RaporIsareti | null;
export declare function ogeAnahtari(tur: OgeTuru, id: string): string;
export declare function raporVerileriniOku(vt: Veritabani, projeId: string): RaporVerileri;
export declare function bosRaporVerileri(): RaporVerileri;
