// scripts/platform/tablolar/paket-tablolari.mjs için tip bildirimi (sayfa paketinin testVerisi bölümü).

export type Karsilik = { sayfa?: string; servis?: string };
export type PaketSutunu = { ad: string; gizli: boolean; karsiliklar: Record<string, Karsilik> };
export type PaketTablosu = { ad: string; tur: 'liste' | 'kayit' | null; aciklama: string | null; sutunlar: PaketSutunu[]; satirlar: Array<Record<string, string | null>>; tekrarSayisi: number };
export type PaketBaglantisi = { alanId: string; tablo: string; sutun: string; etiket?: string };
export type Secenek = { deger: string; metin: string };
export type UretimAlani = { anahtar: string; id: string; etiket: string; secenekler: Secenek[] };
/** Bir seçim alanının bir anda gözlenen seçenekleri ve o andaki DİĞER seçimlerin değerleri (anahtar → seçenek değeri). */
export type SecenekGozlemi = { anahtar: string; secimler: Record<string, string>; secenekler: Secenek[] };
/** Paket biçimindeki testVerisi bölümü (tablolar satırları sütun sırasıyla dizi). */
export type PaketTestVerisi = {
  tablolar: Array<{ ad: string; tur?: 'liste' | 'kayit'; aciklama?: string; sutunlar: Array<{ ad: string; gizli?: boolean; karsiliklar?: Record<string, Karsilik> }>; satirlar: Array<Array<string | number | boolean | null>> }>;
  baglantilar?: PaketBaglantisi[];
};

export declare const PAKET_TABLO_EN_COK: number;
export declare const PAKET_SATIR_EN_COK: number;
export declare const PAKET_SUTUN_EN_COK: number;
export declare const PAKET_HUCRE_EN_UZUN: number;
export declare const TABLO_TURLERI: readonly ['liste', 'kayit'];
/** Ekran listesi tablosunun adı: "<Ekran adı> — <Alan>" (en çok 60 karakter). */
export declare function ekranListesiTabloAdi(ekranAdi: string | null | undefined, alanEtiketleri: string[]): string;
export declare function modelAlanlari(model: unknown): Map<string, Record<string, any>>;
export declare function alanEtiketi(a: Record<string, any>): string;
export declare function testVerisiniDogrula(tv: unknown, model: unknown): { hatalar: Array<{ yer: string; mesaj: string }>; uyarilar: Array<{ yer: string; mesaj: string }> };
export declare function paketTablolari(tv: unknown, model: unknown): { tablolar: PaketTablosu[]; baglantilar: PaketBaglantisi[] };
export declare function paketListeleri(tv: unknown, model: unknown): Array<{ id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; baglanti: { tablo: string; sutun: string; etiket?: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string; ekranDegeri?: string }> }>;
export declare function secenekTablolariUret(girdi: { alanlar: UretimAlani[]; gozlemler: SecenekGozlemi[]; ekranAdi?: string | null }): { testVerisi: { tablolar: Array<Record<string, any>>; baglantilar: PaketBaglantisi[] } | null; notlar: string[] };
