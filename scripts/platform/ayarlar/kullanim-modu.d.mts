// scripts/platform/ayarlar/kullanim-modu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type KullanimModu = 'basit' | 'gelismis';
export type KullanimModuAyari = { mod: KullanimModu; kayitli: boolean; gelismisAciklamasiGoruldu: boolean };
export declare const KULLANIM_MODU_AYAR_ANAHTARI: 'kullanim-modu';
export declare const KULLANIM_MODLARI: readonly ['basit', 'gelismis'];
export declare const VARSAYILAN_KULLANIM_MODU: 'gelismis';
export declare function kullanimModunuOku(vt: Veritabani): KullanimModuAyari;
export declare function kullanimModunuKaydet(vt: Veritabani, girdi: unknown): KullanimModuAyari;
