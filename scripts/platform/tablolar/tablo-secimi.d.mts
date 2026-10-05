export interface Karsilik { sayfa?: string; servis?: string }
export interface Sutun { ad: string; gizli: boolean; tip?: string; karsiliklar?: Record<string, Karsilik> }
export interface Satir { id?: string; ortamId: string | null; degerler: Record<string, string | null> }
export interface Tablo { id: string; ad: string; sutunlar: Sutun[]; satirlar: Satir[] }
export interface Basvuru { tablo: string; etiket: string; sutun: string; bicim: string }

export declare const AD_KALIBI: string;
export declare const ETIKET_KALIBI: string;
export declare const BICIM_KALIBI: string;
export declare function basvuruCoz(ad: string): Basvuru | null;
export declare function basvuru(tablo: string, sutun: string, etiket?: string, bicim?: string): string;
export declare function grupAnahtari(tabloId: string, etiket?: string): string;
/** Satır seçiminde satır kimliğiyle sabitleme anahtarı ("$satir"). */
export declare const SATIR_KIMLIGI: string;
export declare function satirSabitlemesi(satirId: string): Record<string, string>;
/** Gizli sütun değerinin satır seçimi için kısmi maskesi ("4•••••8"; 4 karakterden kısa değer "•••"). */
export declare function kismiMaske(deger: unknown): string;
export declare function tabloBul<T extends { ad: string }>(tablolar: T[], ad: string): T | undefined;
export declare function sutunBul(tablo: Tablo, ad: string): Sutun | undefined;
export declare function uyanSatirlar<T extends Satir>(tablo: { sutunlar: Sutun[]; satirlar: T[] }, secim?: Record<string, string>, s?: { ortamId?: string | null; haric?: string }): T[];
export declare function sutunSecenekleri(tablo: Tablo, secim: Record<string, string>, sutun: string, ortamId?: string | null): string[];
export declare function formSuzgecleri(tablo: { sutunlar: Sutun[]; satirlar: Satir[] }, secim: Record<string, string>, alanlar: Array<{ etiket: string; deger: string; metin?: string; sutun?: string | null }>): Array<{ etiket: string; sutun: string; formDegeri: string; tabloDegeri: string | null }>;
export declare function satirUyumu(tablo: { sutunlar: Sutun[] }, satir: Satir, secim: Record<string, string>, suzgecler?: Array<{ etiket: string; sutun: string; formDegeri: string; tabloDegeri: string | null }>): { nedenler: string[]; celisenler: Array<{ etiket: string; sutun: string; formDegeri: string; satirDegeri: string }> };
export declare function tabloDegerListeleri(baglar: Record<string, { tablo: string; sutun: string; etiket?: string }>, tablolar: Tablo[], ekranId: string, sira?: string[], secenekler?: { hedefler?: ReadonlySet<string>; atlananVar?: boolean }): Array<{
  id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; baglanti: { tablo: string; sutun: string; etiket?: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string; ekranDegeri?: string }>;
}>;
export declare function servisDegeri(sutun: Sutun, deger: string): string;
export interface SatirSecimi {
  kip?: string; rastgele?: () => number; onbellek?: Map<string, Satir | undefined>;
  /** Grup anahtarı → satır kimliği (veri koşusu / tekrar koşusu: grubun satırı sabit). */
  sabit?: Record<string, string>;
  /** Grup anahtarı → satırın o koşudaki değerleri ("o koşudaki veriyle" tekrar; yalnız gizli sütunsuz tabloda uygulanır). */
  veriler?: Record<string, Record<string, string | null>>;
  /** Koşuda kullanılan satırlar (grup anahtarı → satır). */
  kullanilan?: Map<string, Satir>;
}
export declare function satirSecimiOlustur(kip: unknown, rastgele?: () => number): SatirSecimi;
export declare function secilenSatir<T extends Satir>(tablo: { id?: string; sutunlar: Sutun[]; satirlar: T[] }, secim: Record<string, string>, ortamId?: string | null,
  satirSecimi?: SatirSecimi, grup?: string): T | undefined;
export declare function sayfaDegeri(sutun: Sutun, deger: string): string;
/** Senaryo değerinin tamamı "${Tablo.Sütun}" ise başvuru, değilse null. */
export declare function degerBasvurusu(deger: unknown): Basvuru | null;
export declare function degerBasvurusuYaz(tablo: string, sutun: string, etiket?: string): string;
export declare function basvuruyuCoz<T extends Tablo>(tablolar: T[], b: Basvuru, tabloSecimleri: Record<string, Record<string, string>> | undefined, ortamId?: string | null, satirSecimi?: SatirSecimi):
  { tablo: T; sutun: Sutun; satir: T['satirlar'][number]; deger: string } | { hata: string; tabloYok?: boolean; bos?: { tablo: string; sutun: string } };
/**
 * Koşul değerlendirmesi için başvurunun TEK değeri (senaryo doğrulayıcısının tabloDegeri'si): seçimle / çalıştırma biçimiyle ve
 * ortam(lar)la uyan satırların bu sütundaki değeri tek ise { deger, sayfa }, satıra göre değişiyorsa ya da bulunamıyorsa null.
 */
export declare function basvurununTekDegeri(tablolar: ReadonlyArray<Tablo>, b: Basvuru, s?: {
  tabloSecimleri?: Record<string, Record<string, string>> | null;
  veriKosulari?: { gruplar?: Record<string, { kip: string; satirlar?: string[] }> } | null;
  ortamIdler?: ReadonlyArray<string | null>;
}): { deger: string; sayfa: string } | null;
