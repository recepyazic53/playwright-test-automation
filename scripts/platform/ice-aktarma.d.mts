// scripts/platform/ice-aktarma.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
import type { ParolaDenemeSiniri } from './kasa.mjs';
import type { IlerlemeFn, YedekManifesti } from './yedek.mjs';

export type Satir = Record<string, unknown>;

export declare const ONIZLEME_TABLOLARI: Readonly<Record<string, string>>;
export declare const EKLEME_TABLOLARI: readonly string[];
/** Gizli değerlerin önizlemedeki yer tutucusu. */
export declare const MASKE: string;
export declare const HAZIRLIK_SAKLAMA_MS: number;

export interface AlanFarki {
  /** Sütun adı; JSON nesne sütunlarında "sutun.icAnahtar". */
  alan: string;
  yerel: unknown;
  dosya: unknown;
  /** Gizli değer değişti; iki taraf da MASKE ile gösterilir. */
  maskeli?: true;
}
export interface VarlikOnizlemesi {
  etiket: string;
  yeni: Array<{ id: string; baslik: string; dosya: Satir; uygulanamaz?: string }>;
  degisen: Array<{ id: string; baslik: string; yerel: Satir; dosya: Satir; farklar: AlanFarki[] }>;
  yalnizBurada: Array<{ id: string; baslik: string }>;
  ayniSayisi: number;
}
export interface Onizleme {
  yedek: { olusturulma: string; makine: string | null; semaSurumu: number };
  yerelBos: boolean;
  /** Yerelde kasa yok: uygulamada yedeğin kasası (parolası) benimsenir. */
  kasaBenimsenecek: boolean;
  varliklar: Record<string, VarlikOnizlemesi>;
  eklenecekler: Record<string, { dosyada: number; yeni: number }>;
  toplam: { yeni: number; degisen: number; yalnizBurada: number; ayni: number };
}
export interface Hazirlik {
  manifest: YedekManifesti;
  hedefAnahtar: Buffer;
  benimsenecekKasa: { kdf: object; dogrulayici: string } | null;
  tablolar: Record<string, Satir[]>;
  onizleme: Onizleme;
}
export interface Secim {
  tumu?: boolean;
  secimler?: Record<string, readonly string[]>;
}
export interface UygulamaSonucu {
  tamYukleme: boolean;
  varliklar: Record<string, { eklenen: number; uzerineYazilan: number; ayni: number; atlanan: number }>;
  eklenenler: Record<string, { eklenen: number; mevcut: number; atlanan: number; baglantisiKaldirilan: number }>;
  otomatikEklenenUstKayitlar: Array<{ tablo: string; id: string }>;
  atlananlar: Array<{ tablo: string; id: string; neden: string }>;
  gecmiseYazilan: number;
  sayimlar: Record<string, number>;
}
export type IsDurumu = 'hazirlaniyor' | 'hazir' | 'uygulaniyor' | 'uygulandi' | 'hata' | 'iptal';
export interface IsGorunumu {
  id: string;
  durum: IsDurumu;
  asama: string;
  yuzde: number;
  mesaj: string | null;
  kod: string | null;
  bekleSaniye: number | null;
  baslangic: number;
  sonKullanma: number;
  onizleme: Onizleme | null;
  sonuc: UygulamaSonucu | null;
}

export declare function iceAktarmaHazirla(
  vt: Veritabani | null, dosya: Buffer, parola: string, secenekler?: { ilerleme?: IlerlemeFn }
): Promise<Hazirlik>;
export declare function hazirligiAt(hazirlik: Hazirlik): void;
export declare function iceAktarmaUygula(vt: Veritabani, hazirlik: Hazirlik, secim: Secim, secenekler?: { yapan?: string }): UygulamaSonucu;

export declare class IceAktarmaYoneticisi {
  constructor(secenekler: {
    veritabani: (olustur: boolean) => Promise<Veritabani | null>;
    denemeSiniri?: ParolaDenemeSiniri;
    saklamaMs?: number;
    simdi?: () => number;
  });
  temizle(): void;
  aktifIs(): string | null;
  baslat(dosya: Buffer, parola: string): string;
  bekle(id: string): Promise<IsGorunumu | undefined>;
  durum(id: string): IsGorunumu | undefined;
  uygula(id: string, secim: Secim, secenekler?: { yapan?: string }): Promise<UygulamaSonucu>;
  iptal(id: string): boolean;
  hepsiniAt(): void;
}
