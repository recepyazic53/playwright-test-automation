// Tipler: zincir-kesfi.mjs (bağlı alan zinciri kuralları).
export const ZINCIR_DERINLIK_VARSAYILAN: number;
export const ZINCIR_ORNEK_VARSAYILAN: number;
export const ZINCIR_SECENEK_BEKLEME_MS: number;
export const ZINCIR_EN_COK_ACILIS: number;
export const ZINCIR_EN_COK_KOK: number;

export type Secenek = { deger: string; metin: string };
/** Zincir kurallarının okuduğu alan biçimi (HamAlan'ın alt kümesi). */
export type ZincirAlani = {
  anahtar: string; tur: string; coklu?: boolean; devreDisi?: boolean;
  secenekler?: ReadonlyArray<{ deger: string; metin?: string | null }>;
  radyolar?: ReadonlyArray<{ deger: string; metin?: string | null }>;
};
/** Zincirde yapılan seçim (kökten aşağı). */
export type ZincirSecimi = { anahtar: string; deger: string; metin: string };
export type ZincirBulgusu = {
  tur: 'bosListe' | 'tekrarlayan' | 'secilemedi' | 'hataMesaji' | 'gezinme';
  /** Bulgunun ilgili olduğu liste (bosListe / tekrarlayan / secilemedi). */
  alan: string | null;
  /** Bulguya götüren seçimler (kökten aşağı). */
  secimler: ZincirSecimi[];
  /** secilemedi: denenen seçeneğin metni; hataMesaji: sayfanın mesajı; gezinme: gidilen yol. */
  metin?: string | null;
  metinler?: string[];
  ayrinti?: string | null;
  beklenenMs?: number;
};
export type ZincirGozlemi = { anahtar: string; secimler: Record<string, string>; secenekler: Secenek[] };
/** Zincir keşfinin sonucu (tarama envanterine ve hızlı test keşfine girer). */
export type ZincirSonucu = {
  iliskiler: Array<{ ust: string; alt: string }>;
  gozlemler: ZincirGozlemi[];
  bulgular: ZincirBulgusu[];
  /** Sayfanın kaç kez yeniden açıldığı ve kaç seçim yapıldığı (rapor). */
  acilis: number; secim: number;
  notlar: string[];
  /** Alt listenin dolma süreleri (ms; üst seçildikten seçenekler okunana kadar): anahtar → ölçümler. */
  sureler: Record<string, number[]>;
};

export function gercekSecenekler(liste: ReadonlyArray<{ deger: string; metin?: string | null }> | null | undefined): Secenek[];
export function ornekDegerler(liste: ReadonlyArray<{ deger: string; metin?: string | null }> | null | undefined, n: number): Secenek[];
export function degisenSecimler<T extends ZincirAlani>(once: ReadonlyArray<ZincirAlani>, sonra: ReadonlyArray<T>, haric: ReadonlySet<string>):
  Array<{ anahtar: string; neden: 'secenek' | 'etkinlesti' | 'belirdi'; alan: T }>;
export function birinciDuzeyIliskiler(
  kesifler: ReadonlyArray<{ secim: string; tur?: string | null; degerler: ReadonlyArray<{ deger: string; gezinme?: string | null; hata?: string | null; gorunenler?: ReadonlyArray<ZincirAlani>; secenekler?: Record<string, unknown>; etkinlesenler?: ReadonlyArray<string> }> }>,
  alanlar: ReadonlyArray<ZincirAlani>
): { iliskiler: Array<{ ust: string; alt: string }>; kokler: string[] };
export function tekrarlayanSecenekler(liste: ReadonlyArray<{ deger: string; metin?: string | null }>): string[];
export function zincirMetni(iliskiler: ReadonlyArray<{ ust: string; alt: string }>, etiket: (anahtar: string) => string): string[];
export function bulguMetni(b: ZincirBulgusu, etiket: (anahtar: string) => string): string;
export function bulgulariTekillestir(liste: ReadonlyArray<ZincirBulgusu>): ZincirBulgusu[];
export function olaganYuklenme(olcumler: ReadonlyArray<number> | null | undefined): number | null;
export function yuklenmeBeklemesi(olaganMs: number | null | undefined, varsayilanMs: number): { sinirMs: number; yavasMs: number | null };
export function zincirBagimliliklari(
  iliskiler: ReadonlyArray<{ ust: string; alt: string }>,
  gozlemler: ReadonlyArray<{ anahtar: string; secimler: Record<string, string>; secenekler: ReadonlyArray<{ deger: string; metin?: string | null }> }>
): Map<string, { ust: string; harita: Map<string, Secenek[]> }>;
