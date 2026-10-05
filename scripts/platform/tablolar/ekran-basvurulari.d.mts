// scripts/platform/tablolar/ekran-basvurulari.mjs için tip bildirimi (ekran senaryosunda ${Tablo.Sütun} başvuruları).
import type { Sutun, Tablo } from './tablo-secimi.mjs';

export type EkranBaglari = Record<string, import('./secime-gore-bag.mjs').AlanBagi>;
export declare function modelAlanBilgisi(model: unknown): {
  alanAnahtarlari: Record<string, string>; secenekDegerleri: Record<string, string[]>;
  /** Senaryo anahtarı → modeldeki alan tipi. */
  alanTipleri: Record<string, string>;
  /** Senaryo anahtarı → dosya alanının kabul ettiği uzantı. */
  kabuller: Record<string, string>;
  /** Senaryo anahtarı → senaryo ayarının etiketi ve seçenekleri (tablodaki değer koda çevrilir). */
  ayarSecenekleri: Record<string, AyarBilgisi>;
};
/** Senaryo ayarı: etiket ve seçenekler (kod = senaryoya yazılan değer; metinler = formdaki / sayfadaki okunur adlar). */
export type AyarBilgisi = { etiket: string; secenekler: Array<{ kod: string; metinler: string[] }> };
/** Tablodaki değerin senaryo ayarı kodu (karşılık → kod; yoksa kod ya da seçenek metni); eşleşmezse okunur hata. */
export declare function ayarKoduCoz(sutun: Sutun, deger: string, ayar: AyarBilgisi): { deger: string } | { hata: string };
/** true/false, evet/hayır, 1/0, E/H … → boolean; tanınmazsa null. */
export declare function mantiksalDeger(d: unknown): boolean | null;
/** Tablodan çözülen değerin ekrana gidecek biçimi (onay kutusu → boolean, dosya → dosya adı, diğerleri → seçenek / sayfa değeri). */
export declare function ekrandakiDeger(c: { sutun: Sutun; deger: string }, s?: {
  tip?: string; secenekler?: string[]; kabul?: string; dosyaDenetle?: (ad: string) => string | null;
}): { deger: string | boolean } | { hata: string };
export declare function ekranBasvurulariniCoz(veri: Record<string, unknown>, s: {
  tablolar: Tablo[]; baglar?: EkranBaglari; alanAnahtarlari?: Record<string, string>; secenekDegerleri?: Record<string, string[]>;
  alanTipleri?: Record<string, string>; kabuller?: Record<string, string>; ayarSecenekleri?: Record<string, AyarBilgisi>; dosyaDenetle?: (ad: string) => string | null;
  ortamId: string | null; tabloSecimleri?: Record<string, Record<string, string>>; satirSecimi?: import('./tablo-secimi.mjs').SatirSecimi;
}): { veri: Record<string, unknown>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }>; cozulen: number };
/** Senaryo kaydında: tablodan gelen senaryo ayarlarında koşuya girebilecek her satırın değeri seçenek koduna çevrilebiliyor mu. */
export declare function ayarBasvurulariniDenetle(veri: Record<string, unknown>, s: Parameters<typeof ekranBasvurulariniCoz>[1]): Array<{ alan: string; mesaj: string }>;
/** Metinlerin içindeki ${Tablo.Sütun} başvuruları (tablodaki değer; ${akis:…} ve tablo dışı ${…} atlanır). */
export declare function metinBasvurulariniCoz(metinler: ReadonlyArray<string>, veri: Record<string, unknown>, s: Parameters<typeof ekranBasvurulariniCoz>[1]):
  { degerler: Record<string, string>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }> };
/** Ekran senaryosunun satır seçimlerini doğrular / temizler (gizli sütun ve olmayan tablo / sütun hata). */
export declare function tabloSecimleriniAyikla(v: unknown, tablolar: ReadonlyArray<{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar?: ReadonlyArray<{ id?: string }> }>):
  { secimler: Record<string, Record<string, string>> | undefined; hatalar: string[] };
export declare function tabloBasvurusuVarMi(veri: unknown): boolean;
