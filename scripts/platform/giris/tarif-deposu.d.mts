// scripts/platform/giris/tarif-deposu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { GirisTarifi } from './tarif.mjs';

export declare const GIRIS_TARIFI_ANAHTARI: 'girisTarifi';
export declare function etkinGirisTarifi(
  vt: Veritabani, projeId: string, ortamId: string,
  adaptor: { varsayilanGirisTarifi?: (vt: Veritabani, projeId: string, ortamId: string) => unknown } | null | undefined
): { tarif: GirisTarifi | null; kaynak: 'kayitli' | 'proje-varsayilani' | 'yok'; hatalar: string[] };
export declare function girisTarifiKaydet(vt: Veritabani, projeId: string, ortamId: string, ham: unknown): GirisTarifi;
export declare function girisTarifiniSifirla(vt: Veritabani, projeId: string, ortamId: string): boolean;
