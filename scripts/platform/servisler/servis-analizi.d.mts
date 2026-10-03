import type { AlanTipi, OperasyonSemasi } from './servis-govdesi.mjs';

/** Örnek isteğin sonucu (kullanıcı işaretler; koşulardan gelen kanıtta koşunun sonucu). */
export type OrnekDurumu = 'basarili' | 'hata' | 'bilinmiyor';
export type OrnekGozlemi = { durum: 'dolu' | 'bos' | 'nil'; deger: string; coklu: boolean };
export type CozulenOrnek = { kok: string; ns: string; alanlar: Map<string, OrnekGozlemi>; gruplar: Set<string>; hata: string | null };
export type AnalizTablosu = {
  id: string; ad: string; baglam?: boolean;
  sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }>;
  satirlar: ReadonlyArray<{ ad?: string; degerler: Record<string, string | null | undefined> }>;
};
export type AlanKurali = { tip?: AlanTipi; bicim?: string; desen?: string; enAzUzunluk?: number; enCokUzunluk?: number; degerler?: string[]; gizli?: boolean };
export type AnalizMevcudu = {
  zorunlu?: ReadonlyArray<string>;
  baglar?: Record<string, { tablo?: string; sutun?: string; kural?: string; etiket?: string; bicim?: string }>;
  varsayilanlar?: Record<string, { kaynak: string; deger?: string }>;
  kurallar?: Record<string, AlanKurali>;
  kararlar?: Record<string, 'uygulandi' | 'yoksayildi'>;
  /** Arayüzün önceden seçtiği (henüz onaylanmamış) tablo bağı önerilerinin anahtarları: bağ aynı olsa da öneri gösterilir. */
  onsecili?: ReadonlyArray<string>;
};
export type AnalizGirdisi = {
  metot: string; tur?: 'soap' | 'rest';
  sema?: OperasyonSemasi | null; ekler?: ReadonlyArray<{ yol: string; tip?: string }>;
  ornekler?: ReadonlyArray<{ ad?: string; govde: string; durum?: OrnekDurumu }>;
  ekKanitlar?: ReadonlyArray<{ ad?: string; govde: string; durum?: OrnekDurumu }>;
  tablolar?: ReadonlyArray<AnalizTablosu>; ekGizliAdlar?: ReadonlyArray<string>;
  mevcut?: AnalizMevcudu;
};
export type TabloEslesmesi = {
  tabloId: string; tablo: string; sutun: string; adTuru: 'birebir' | 'esAnlam' | 'benzer' | 'tablo' | null;
  bulunan: number; toplam: number; karsiliklar: Array<[string, string]>; guc: 'guclu' | 'zayif'; kanit: string;
};
export type YeniTabloPlani = {
  id: string; ad: string; tur: 'kayit' | 'liste';
  sutunlar: Array<{ ad: string; gizli: boolean }>;
  satirlar: Array<{ ad: string; degerler: Record<string, string | null> }>;
  alanlar: Array<{ yol: string; sutun: string }>;
  ayniAdli: { id: string; ad: string } | null;
};
export type OneriTuru = 'alanEkle' | 'zorunlu' | 'bosGonder' | 'celiski' | 'tip' | 'gizli' | 'tabloBagi' | 'yeniTablo' | 'kopukBag' | 'tabloyaDeger';
export type OneriGucu = 'guclu' | 'zayif' | 'not';
export type AnalizOnerisi = { anahtar: string; tur: OneriTuru; yol: string; deger: unknown; baslik: string; kanit: string; guc: OneriGucu };
export type AlanAnalizi = {
  yol: string; ad: string; wsdlde: boolean; ekli: boolean; wsdlZorunlu: boolean | null; dolu: number; bos: number; yok: number; toplam: number;
  degerler: string[]; gizli: boolean; ozet: string; tablo: TabloEslesmesi | null;
};
export type AnalizSonucu = {
  toplam: number; adliSayisi: number; hatalar: Array<{ ad: string; mesaj: string }>; kok: string; ns: string;
  alanlar: AlanAnalizi[]; oneriler: AnalizOnerisi[]; tumOneriler: AnalizOnerisi[];
  farklar: Array<{ yol: string; dolu: string[]; bos: string[]; metin: string }>;
  yeniTablolar: YeniTabloPlani[];
  /** Hata veren örneklerin çok farklı olduğu durumlar (zorunluluk kanıtı sayılmaz). */
  notlar: string[];
};
export type AnalizDurumu = {
  zorunlu: Set<string>;
  baglar: Record<string, { tablo?: string; sutun?: string; kural?: string; etiket?: string; bicim?: string }>;
  varsayilanlar: Record<string, { kaynak: string; deger?: string }>;
  kurallar: Record<string, AlanKurali>;
  ekler: Array<{ yol: string; tip?: string }>;
  kararlar: Record<string, 'uygulandi' | 'yoksayildi'>;
  yeniTablolar: YeniTabloPlani[];
  /** Bağlı tablolara eklenecek değerler (kayıtta yeni satırlar). */
  tabloDegerleri: Array<{ tablo: string; sutun: string; degerler: string[] }>;
};

export const EN_COK_ORNEK: number;
export const EN_COK_KUME: number;
export const EN_AZ_GOZLEM: number;
export function kavramGrubu(ad: string): string | null;
export function gucluOneriler(l: ReadonlyArray<AnalizOnerisi>): AnalizOnerisi[];
export const TIP_ADLARI: Readonly<Record<AlanTipi, string>>;
export const BICIM_ADLARI: Readonly<Record<string, string>>;
export function alanAdi(yol: string): string;
export function bulunmaEki(s: string): string;
export function ornekCoz(govde: string, s?: { tur?: 'soap' | 'rest'; kok?: string; ustAlanlar?: ReadonlyArray<string> }): CozulenOrnek;
export function tipCikar(degerler: string[]): { tip: AlanTipi; bicim?: string } | null;
export function adEslesmesi(alan: string, hedef: string): 'birebir' | 'esAnlam' | 'benzer' | null;
export function degerOrtusmesi(degerler: string[], t: AnalizTablosu, c: AnalizTablosu['sutunlar'][number]):
  { dogrudan: string[]; karsilik: Array<[string, string]>; eksik: string[]; bulunan: number; toplam: number };
export function tabloEslesmesi(ad: string, degerler: string[], tablolar: ReadonlyArray<AnalizTablosu>, gizli?: boolean): TabloEslesmesi | null;
export function oneriAnahtari(tur: string, yol: string, deger: unknown): string;
export function servisAnalizi(g: AnalizGirdisi): AnalizSonucu;
export function oneriyiUygula(d: AnalizDurumu, o: AnalizOnerisi): void;
export function oneriyiYoksay(d: AnalizDurumu, o: AnalizOnerisi): void;
export function farkKaydi(a: AnalizSonucu): Array<{ yol: string; dolu: string[]; bos: string[] }>;
