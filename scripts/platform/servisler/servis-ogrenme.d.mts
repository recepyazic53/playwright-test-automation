// scripts/platform/servisler/servis-ogrenme.mjs için tip bildirimi.
import type { Gozlem, KosuOnerisi } from './kosu-ogrenmesi.mjs';
export function ogrenmeyiZamanla(is: () => void): void;
export function ogrenmeyiCalistir(is: () => void): boolean;
export function metotOgrenmeOnerileri(s: unknown, op: string, tablolar: unknown): KosuOnerisi[];
export function ogrenmeOneriSayisi(vt: unknown, s: unknown, tablolar?: unknown): number;
export function kosudanOgren(vt: unknown, g: { servisId: string; senaryoId: string | null; baslik: string; icerik: { operasyon?: string; govde?: string }; kosuId: string; durum: string;
  sonuc: { istek?: unknown; hata?: unknown; yanit?: unknown; durduruldu?: unknown } }): void;
export function senaryodanOgren(vt: unknown, senaryoId: string): void;
export type { Gozlem };