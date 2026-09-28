// scripts/platform/ice-aktarma.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';
import type { ParolaDenemeSiniri } from './kasa.mjs';
import type { IlerlemeFn, MedyaYerlestirmeSonucu, YedekKasaBilgisi, YedekManifesti } from './yedek.mjs';
import type { Esleme, EslemeOzeti, KimlikDegisimi, ProjeEslemesiBilgisi } from './ice-aktarma-esleme.mjs';

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
  medya: MedyaOnizlemesi;
  toplam: { yeni: number; degisen: number; yalnizBurada: number; ayni: number };
  /** Hedef proje / ortam eşlemesi (öneri; uygulanan eşleme ve özeti eslemeOnizlemesi'nden sonra dolu). */
  projeEslemesi?: ProjeEslemesiOnizlemesi;
}
export interface ProjeEslemesiOnizlemesi extends ProjeEslemesiBilgisi {
  uygulanan: Esleme | null;
  ozet: EslemeOzeti[] | null;
  kimlikDegisimleri: KimlikDegisimi[];
}
export interface MedyaTuruOnizlemesi {
  /** Yedekteki medya satırı (saklama süresi dolmuşlar hariç). */
  dosyada: number;
  /** Dosyası yedekte olan. */
  dosyasiYedekte: number;
  /** Uygulanınca dosyası bu makineye eklenecek (satır yeni ya da yerelde dosyası yok). */
  eklenecek: number;
  eklenecekBayt: number;
  /** Dosyası yedeğe dahil edilmemiş ve bu makinede de olmayan. */
  dahilDegil: number;
  /** Dosyası bu makinede zaten var. */
  zatenVar: number;
}
export interface MedyaOnizlemesi {
  bicimSurumu: number;
  secim: Record<string, boolean> | null;
  turler: Record<string, MedyaTuruOnizlemesi>;
  toplam: { eklenecek: number; eklenecekBayt: number; dahilDegil: number };
}
export interface Hazirlik {
  manifest: YedekManifesti;
  hedefAnahtar: Buffer;
  benimsenecekKasa: YedekKasaBilgisi | null;
  tablolar: Record<string, Satir[]>;
  onizleme: Onizleme;
  medyaKlasoru: string | null;
  hazirlikKlasoru: string | null;
  kaynakMedyaAnahtari: Buffer | null;
  medyaDosyalari: Map<string, { yol: string | null; boyut: number }>;
}
export interface Secim {
  tumu?: boolean;
  secimler?: Record<string, readonly string[]>;
  /** Hedef proje / ortam eşlemesi; verilmezse kayıtlar yedekteki kimlikleriyle yazılır. */
  esleme?: Esleme | null;
}
export interface UygulamaSonucu {
  tamYukleme: boolean;
  varliklar: Record<string, { eklenen: number; uzerineYazilan: number; ayni: number; atlanan: number }>;
  eklenenler: Record<string, { eklenen: number; mevcut: number; atlanan: number; baglantisiKaldirilan: number }>;
  otomatikEklenenUstKayitlar: Array<{ tablo: string; id: string }>;
  atlananlar: Array<{ tablo: string; id: string; neden: string }>;
  gecmiseYazilan: number;
  sayimlar: Record<string, number>;
  /** Yalnızca yönetici (IceAktarmaYoneticisi.uygula) ya da iceAktarmaMedyasiniYaz sonrası. */
  medya?: MedyaYerlestirmeSonucu;
  medyaHatasi?: string;
  projeEslemesi?: { ozet: EslemeOzeti[]; kimlikDegisimleri: KimlikDegisimi[] };
  /** Eşlemeli uygulamada: silinmiş kaynak projeden kalan ve hâlâ duran (öksüz) kayıtlar { kaynak proje: { tablo: sayı } }. */
  kalintilar?: Record<string, Record<string, number>>;
  /** Eşlemeli uygulamada: hedef projeye taşınan öksüz koşu / geçmiş kayıtları. */
  kalintiTasinan?: number;
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
  vt: Veritabani | null, dosya: Buffer | string, parola: string, secenekler?: { ilerleme?: IlerlemeFn; medyaKlasoru?: string | null }
): Promise<Hazirlik>;
export declare function hazirligiAt(hazirlik: Hazirlik): void;
export declare function iceAktarmaMedyasiniYaz(vt: Veritabani, hazirlik: Hazirlik, secenekler?: { ilerleme?: IlerlemeFn }): Promise<MedyaYerlestirmeSonucu>;
export declare function eslemeOnizlemesi(vt: Veritabani | null, hazirlik: Hazirlik, esleme: unknown): Promise<Onizleme>;
export declare function iceAktarmaUygula(vt: Veritabani, hazirlik: Hazirlik, secim: Secim, secenekler?: { yapan?: string }): UygulamaSonucu;

export declare class IceAktarmaYoneticisi {
  constructor(secenekler: {
    veritabani: (olustur: boolean) => Promise<Veritabani | null>;
    medyaKlasoru?: () => string | null;
    denemeSiniri?: ParolaDenemeSiniri;
    saklamaMs?: number;
    simdi?: () => number;
  });
  temizle(): void;
  aktifIs(): string | null;
  baslat(dosya: Buffer | string, parola: string, secenekler?: { geciciDosya?: boolean }): string;
  bekle(id: string): Promise<IsGorunumu | undefined>;
  durum(id: string): IsGorunumu | undefined;
  uygula(id: string, secim: Secim, secenekler?: { yapan?: string }): Promise<UygulamaSonucu>;
  esleme(id: string, esleme: unknown): Promise<Onizleme>;
  iptal(id: string): boolean;
  hepsiniAt(): void;
}
