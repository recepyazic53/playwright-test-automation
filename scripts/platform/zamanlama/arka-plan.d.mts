// scripts/platform/zamanlama/arka-plan.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DpapiYurutucu } from './dpapi.mjs';
import type { GorevYurutucu } from './oturum-gorevi.mjs';

export interface ArkaPlanTercihleri { kilitliyken: boolean; dpapi: boolean; oturumAcilisi: boolean }
export interface ArkaPlanDurumu {
  tercihler: ArkaPlanTercihleri;
  windows: boolean;
  anahtarBellekte: boolean;
  dpapi: { dosyaVar: boolean; gecerli: boolean };
  gorev: { var: boolean | null; paket: boolean; komut: string } | null;
  uyari: string | null;
}

export declare const TERCIH_AYAR_ANAHTARI: string;
export declare const TERCIH_ADLARI: readonly ['kilitliyken', 'dpapi', 'oturumAcilisi'];
export declare const VARSAYILAN_TERCIHLER: Readonly<ArkaPlanTercihleri>;
export declare function tercihleriOku(db: Veritabani): ArkaPlanTercihleri;
export declare function arkaPlanYoneticisi(bag: {
  veritabaniYolu: () => string | null;
  projeKoku: string;
  denemeSiniri: { dene<T>(fn: () => Promise<T>): Promise<T> };
  platform?: string;
  dpapiYurutucu?: DpapiYurutucu;
  gorevYurutucu?: GorevYurutucu;
  nodeYolu?: string;
  kullanici?: () => string;
  geciciKlasor?: () => string;
  log?: (mesaj: string) => void;
}): {
  tercihleriOku(db: Veritabani): ArkaPlanTercihleri;
  kasaAcildi(db: Veritabani): void;
  kilitle(db: Veritabani, secenekler?: { tamamen?: boolean }): { arkaPlan: boolean };
  kilitSecimiVarMi(db: Veritabani): boolean;
  parolaDegisti(db: Veritabani): Promise<void>;
  acilistaYukle(db: Veritabani | null): Promise<boolean>;
  kilitDurumu(db: Veritabani | null): { anahtarBellekte: boolean; dpapiDosyasi: boolean; kilitSecimi: boolean };
  durum(db: Veritabani): Promise<ArkaPlanDurumu>;
  tercihDegistir(db: Veritabani, g: Record<string, unknown>): Promise<ArkaPlanDurumu>;
  alanKaldirildi(veritabaniYolu: string): void;
};
