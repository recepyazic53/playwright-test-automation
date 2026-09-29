// scripts/platform/sonuclar/farkindalik.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DonemSecimi } from './donem.mjs';

/** Kart maddesi: maskeli öğe adı, yalnız sayı / sabit metin içeren ayrıntı ve tıklayınca açılan adres. */
export type FarkindalikMaddesi = { tur: string; ad: string; ayrinti: string; adres: string };
export type FarkindalikKarti = { toplam: number; maddeler: FarkindalikMaddesi[] };
export type OzetKutusu = {
  basari: number | null; oncekiBasari: number | null; adet: number; oncekiAdet: number | null; basarili: number; kalan: number; birim: string;
};
export type FarkindalikEsikleri = { kirmiziGun: number; yavaslamaYuzde: number; kosmayanGun: number; yedekGun: number };
export type FarkindalikVerisi = {
  olusturma: string;
  donem: { etiket: string; oncekiEtiket: string; gun: number; tumu: boolean } | null;
  esikler: FarkindalikEsikleri;
  ozet: { ekran: OzetKutusu | null; servis: OzetKutusu | null; uctanUca: OzetKutusu | null };
  kartlar: { dikkat: FarkindalikKarti; bakim: FarkindalikKarti; kapsam: FarkindalikKarti };
  hesaplanamayan: Array<{ sinyal: string; neden: string }>;
};

export declare const KART_ILK_MADDE: number;
export declare const KART_EN_COK_MADDE: number;
export declare const ONBELLEK_MS: number;
export declare const KIRMIZI_GERIYE_BAKIS_GUN: number;
export declare const ESIK_ANAHTARLARI: readonly string[];
export declare function aralikDonemi(aralik: { baslangic: string | null; bitis: string | null }, simdi: Date): { secim: DonemSecimi; tumu: boolean };
export declare function kirmiziSeriBaslangici(birimler: ReadonlyArray<{ zaman: number; kirmizi: boolean }>): number | null;
export declare function yavaslayanMetotlar<T extends { p95: number | null; oncekiP95: number | null; n: number }>(metotlar: ReadonlyArray<T>, yuzde: number): Array<T & { artis: number }>;
export declare function tetiklemeNedeni(t: { durum: string; mesaj?: string }): string;
export declare function farkindalikOnbelleginiTemizle(): void;
export declare function farkindalikVerisi(
  vt: Veritabani, projeId: string,
  s: { aralik: { baslangic: string | null; bitis: string | null }; simdi?: Date; sonYedek?: string | null; onbellek?: boolean }
): Promise<FarkindalikVerisi>;
export declare function dalKapsami(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, ekAdlar: string[], simdi: Date): { kapsanan: number; toplam: number } | null;
