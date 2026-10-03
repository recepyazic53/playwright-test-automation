// scripts/platform/servisler/kosu-ogrenmesi.mjs için tip bildirimi.
import type { AnalizOnerisi, AnalizTablosu } from './servis-analizi.mjs';
import type { OperasyonSemasi } from './servis-govdesi.mjs';

export type Gozlem = {
  kaynak: 'kosu' | 'senaryo'; senaryo: string; senaryoId: string | null; zaman: string; kosuId?: string;
  durum: 'basarili' | 'hata' | 'bilinmiyor';
  alanlar: Record<string, { d: 'dolu' | 'bos' | 'nil'; v?: string }>;
  supheli?: string[]; zayif?: boolean; tekFark?: boolean; belirsiz?: boolean;
};
export type KosuOnerisi = AnalizOnerisi & { kosuKaniti: { basarili: number; sonGorulme: string; senaryolar: string[] } };

export const EN_COK_GOZLEM: number;
export const GUCLU_KOSU_SAYISI: number;
export function hataMetni(sonuc: { hata?: unknown; yanit?: unknown }): string;
export function hataAlanlari(metin: string, yollar: string[]): string[];
export function gozlemOlustur(g: {
  istek: string; sablon: string; tur?: 'soap' | 'rest'; kosuDurumu: 'basarili' | 'basarisiz' | 'hata' | 'bilinmiyor'; sonuc?: { hata?: unknown; yanit?: unknown };
  senaryo: string; senaryoId: string | null; kosuId?: string; zaman: string; kaynak: 'kosu' | 'senaryo'; oncekiler?: ReadonlyArray<Gozlem>; kok?: string; ustAlanlar?: string[]; ekGizliAdlar?: ReadonlyArray<string>;
}): Gozlem | null;
export function gozlemEkle(l: Gozlem[], g: Gozlem): Gozlem[];
export function kosuOnerileri(g: {
  metot: string; sema?: OperasyonSemasi | null; ekler?: ReadonlyArray<{ yol: string; tip?: string }>; gozlemler: ReadonlyArray<Gozlem>; tablolar: ReadonlyArray<AnalizTablosu>;
  mevcut?: { zorunlu?: ReadonlyArray<string>; baglar?: Record<string, { tablo?: string; sutun?: string; kural?: string }>; varsayilanlar?: Record<string, unknown>; kararlar?: Record<string, string> };
}): KosuOnerisi[];
