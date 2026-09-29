// scripts/platform/ayarlar/kurtarma-kurallari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type EkranKosulu =
  | { tur: 'metin'; metin: string }
  | { tur: 'oge'; secici: string }
  | { tur: 'oge'; rol: string; ad: string }
  | { tur: 'girisSayfasi' }
  | { tur: 'pencere'; metin: string };
export type EkranEylemi =
  | { tur: 'yenile' }
  | { tur: 'tikla'; secici: string }
  | { tur: 'girisYenile' }
  | { tur: 'bekle'; sn: number }
  | { tur: 'pencereKapat'; secici?: string };
export type EkranSonrasi = { tur: 'tekrar'; kez: number } | { tur: 'devam' } | { tur: 'bastan' };
export type ServisKosulu =
  | { tur: 'alan'; yol: string; islec: 'esit' | 'icerir'; deger: string }
  | { tur: 'http'; kodlar: number[] }
  | { tur: 'fault'; kod: string; mesaj: string }
  | { tur: 'baglanti' };
export type ServisYapilacagi = { bekleSn: number; tokenYenile: boolean; tekrarGonder: boolean; enCokDeneme: number; artanBekleme: boolean };
export type KuralKapsami<T> = { ogeler: T[] | null; ortamlar: string[] | null };

type KuralOrtak = { id: string; ad: string; sira: number; acik: boolean; hazir?: string };
export type EkranKurali = KuralOrtak & { tur: 'ekran'; kosul: EkranKosulu; eylem: EkranEylemi; sonra: EkranSonrasi; kapsam: KuralKapsami<string> };
export type ServisKurali = KuralOrtak & {
  tur: 'servis'; kosul: ServisKosulu; suzgec: { parametre: string; deger: string } | null; yapilacak: ServisYapilacagi;
  kapsam: KuralKapsami<{ servisId: string; metot: string | null }>;
};
export type KurtarmaKurali = EkranKurali | ServisKurali;

export type OlayDurumu = 'kurtarildi' | 'kaldi' | 'tekrarlanmadi' | 'denendi';
/** Sonuca yazılan kurtarma notu (ekran: "kurtarma" notu; servis: sonuc.kurtarma). */
export type KurtarmaOlayi = { kuralId: string; kural: string; durum: OlayDurumu; deneme: number; not: string; adim?: string };
export type KuralSayaci = { toplam: number; kurtarildi: number; kaldi: number; tekrarlanmadi: number; denendi: number };

export declare const KURAL_TURLERI: readonly ['ekran', 'servis'];
export declare const EKRAN_KOSULLARI: readonly ['metin', 'oge', 'girisSayfasi', 'pencere'];
export declare const EKRAN_EYLEMLERI: readonly ['yenile', 'tikla', 'girisYenile', 'bekle', 'pencereKapat'];
export declare const EKRAN_SONRALARI: readonly ['tekrar', 'devam', 'bastan'];
export declare const SERVIS_KOSULLARI: readonly ['alan', 'http', 'fault', 'baglanti'];
export declare const ALAN_ISLECLERI: readonly ['esit', 'icerir'];
export declare const OLAY_DURUMLARI: readonly OlayDurumu[];
export declare const GUVENLI_EKRAN_EYLEMLERI: readonly ['tikla', 'girisYenile', 'bekle', 'pencereKapat'];
export declare const HAZIR_YETKI: 'yetki-401-403';
export declare const HAZIR_YETKI_ADI: string;
export declare const EN_COK_KURAL: number;
export declare const EN_COK_DENEME: number;
export declare const EN_COK_BEKLEME_SN: number;
export declare const SAYAC_GUN: number;

export declare function kuralTanimiDogrula(ham: unknown): Omit<EkranKurali, keyof KuralOrtak> & { acik: boolean } | Omit<ServisKurali, keyof KuralOrtak> & { acik: boolean };
export declare function kurallariListele(vt: Veritabani, projeId: string): KurtarmaKurali[];
export declare function kuralKaydet(vt: Veritabani, projeId: string, ham: unknown): string;
export declare function kuralSil(vt: Veritabani, projeId: string, id: unknown): { silindi: true };
export declare function kuralDurumuAyarla(vt: Veritabani, projeId: string, id: unknown, acik: unknown): { acik: boolean };
export declare function hazirYetkiKuraliAcik(vt: Veritabani, projeId: string): boolean;
export declare function servisKurallari(vt: Veritabani, projeId: string, c: { ortamId: string; servisId: string; metot: string | null }): ServisKurali[];
export declare function ekranKurallari(vt: Veritabani, projeId: string, ortamId: string): EkranKurali[];
export declare function ekranKapsamindaMi(k: { kapsam: { ogeler: unknown } }, ekranId: string): boolean;
export declare function alanDegeri(govde: string, yol: string): string | null;
export declare function soapFaultOku(govde: string): { kod: string; mesaj: string } | null;
export declare function baglantiHatasiMi(m: string | null | undefined): boolean;
export declare function servisKosuluDegerlendir(kosul: ServisKosulu, c: { durumKodu?: number | null; govde?: string | null; hata?: string | null }): { tutar: boolean; neden: string };
export declare function suzgecTutar(suzgec: { parametre: string; deger: string } | null | undefined, istek: { degerler?: Record<string, unknown>; govde?: string | null }): boolean;
export declare function beklemeMs(y: { bekleSn: number; artanBekleme: boolean }, deneme: number): number;
export declare function kurtarmaSutunuOku(d: unknown): Array<{ kuralId: string; durum: string; deneme: number }>;
export declare function kurtarmaSutunuYaz(olaylar: ReadonlyArray<{ kuralId: string; durum: string; deneme?: number }> | null | undefined): string | null;
export declare function kurtarmaSayaclari(vt: Veritabani, projeId: string, aralik: { bas: Date; bit?: Date }): Record<string, KuralSayaci>;
export declare function calisanKurallar(vt: Veritabani, projeId: string, aralik: { bas: Date; bit: Date }): Array<KuralSayaci & { id: string; ad: string; tur: 'ekran' | 'servis' }>;
export declare function kurtarmaEkrani(vt: Veritabani, projeId: string, simdi?: Date): {
  kurallar: Array<KurtarmaKurali & { son7Gun: number }>;
  sayacGun: number;
  secenekler: {
    ekranlar: Array<{ id: string; ad: string }>;
    servisler: Array<{ id: string; ad: string; metotlar: string[]; tekrarDenenebilir: string[] }>;
    ortamlar: Array<{ id: string; ad: string }>;
  };
};
export declare const KURTARMA_GET_UCLARI: Array<[string, (vt: Veritabani, q: URLSearchParams) => unknown]>;
export declare const KURTARMA_POST_UCLARI: Array<[string, (vt: Veritabani, g: Record<string, unknown>) => unknown]>;
