// scripts/platform/servisler/gizli-sabitler.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export declare const GIZLI_SABIT_MASKESI: string;
/** Gizli adlı alanların sabit değerlerini içerikten ayırır (maske + kasada zarf: içerik.gizliSabitler). */
export declare function gizliSabitleriAyir<T>(vt: Veritabani, icerik: T, ekler: ReadonlyArray<string>): T;
/** Kasadaki gizli sabitleri maskeli yerlerine koyar; kaydı olmayan (eski) içerik aynen döner. */
export declare function gizliSabitleriBirlestir<T>(vt: Veritabani, icerik: T): T;
/** Arayüzden maskeli gelen yerleri önceki tam içerikteki asıl değerle doldurur. */
export declare function gizliSabitleriGeriKoy<T>(yeni: T, onceki: unknown, ekler: ReadonlyArray<string>): T;
/** Kayıtlı içerikte adı verilen gizli alanın sabit değeri (yoksa null). */
export declare function gizliSabitDegeri(icerik: unknown, alanAdi: string, ekler: ReadonlyArray<string>): string | null;
/** Gizli sabiti "<servis> gizli değerleri" tablosunun gizli sütununa yazar; alanın bağlanacağı başvuruyu döner. */
export declare function gizliSabitiTabloyaTasi(vt: Veritabani, projeId: string, g: {
  servis: { ad: string; anahtar: string }; icerik?: unknown; alanAdi: string; deger?: string; ekler: ReadonlyArray<string>;
}): { tablo: string; sutun: string; basvuru: string; yeniSutun: boolean };
