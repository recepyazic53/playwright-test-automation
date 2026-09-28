// scripts/platform/ice-aktarma-esleme.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';

export type Satir = Record<string, unknown>;

export declare const YENI: 'yeni';
export declare const PROJE_TABLOLARI: Readonly<Record<string, readonly string[] | null>>;
export declare const SAYI_ETIKETLERI: Readonly<Record<string, string>>;

export interface ProjeEslemesi {
  /** 'yeni' (yedekteki adıyla yeni proje) ya da yerel proje kimliği. */
  hedef: string;
  /** Kaynak ortam kimliği → 'yeni' ya da hedef projedeki yerel ortam kimliği. */
  ortamlar?: Record<string, string>;
}
export interface Esleme { projeler: Record<string, ProjeEslemesi> }
export interface OrtamOzeti { id: string; ad: string; tur: 'test' | 'canli' | null }
export interface ProjeEslemesiBilgisi {
  yedekProjeleri: Array<{ id: string; ad: string; yerelde: boolean; onerilenMevcut: string | null; ortamlar: OrtamOzeti[]; sayilar: Record<string, number> }>;
  yerelProjeler: Array<{ id: string; ad: string; ortamlar: OrtamOzeti[] }>;
  oneri: Esleme;
}
export interface EslemeOzeti {
  kaynak: { id: string; ad: string };
  hedef: { id: string; ad: string; yeni: boolean };
  sayilar: Record<string, number>;
  /** Ör. "Kaynak → Hedef: 23 servis, 7 ekran". */
  metin: string;
  /** Bu bilgisayarda silinmiş kaynak projeden kalan (öksüz) kayıtlar: { tablo: sayı }; yoksa null. */
  kalinti: Record<string, number> | null;
  ortamlar: Array<{ kaynak: OrtamOzeti; hedef: OrtamOzeti | null; yeni: boolean }>;
}
export interface KimlikDegisimi {
  tablo: string;
  eski: string;
  yeni: string;
  neden: 'kimlik_cakismasi' | 'ayni_ad' | 'ortam_eslemesi' | 'proje_eslemesi';
}

export declare function turetilmisKimlik(hedefProje: string, tablo: string, id: string): string;
export declare function projeEslemesiBilgisi(vt: Veritabani | null, tablolar: Record<string, Satir[]>, anahtar: Buffer): ProjeEslemesiBilgisi;
export declare function eslemeyiDogrula(vt: Veritabani | null, tablolar: Record<string, Satir[]>, anahtar: Buffer, ham: unknown): Esleme;
export declare function eslemeyiUygula(vt: Veritabani | null, tablolar: Record<string, Satir[]>, anahtar: Buffer, hamEsleme: unknown): {
  esleme: Esleme;
  tablolar: Record<string, Satir[]>;
  ozet: EslemeOzeti[];
  kimlikDegisimleri: KimlikDegisimi[];
  /** Kimliği değişen (başka projeye aktarılan / yeni kimlikle eklenen) yedek projeleri. */
  kaynakProjeler: string[];
  /** Mevcut projeye aktarılan ve bu bilgisayarda proje kaydı olmayan (kalıntısı olabilecek) yedek projeleri. */
  kalintiProjeler: string[];
};
export declare function ozetMetni(kaynak: string, hedef: string, sayilar: Record<string, number>): string;
