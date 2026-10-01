export declare const KISI_TABLOSU: string;
export declare const KART_TABLOSU: string;
export declare function adTemizle(m: unknown, en?: number): string;
export declare function alanGrubu(a: Record<string, any>): { tablo: string; sutun: string };
export declare function hassasAlanMi(a: Record<string, any>, yer: { tablo: string; sutun: string }, ekler?: ReadonlyArray<string>): boolean;
export declare function tumSecenekler(a: Record<string, any>): Array<{ metin: string; kod: string }>;
export declare function tabloTaslagiKur(g: {
  baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string>;
}): {
  satirAdi: string;
  tablolar: Array<{
    tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
    /** Tek başına duran seçim alanı: tablo bir liste tablosudur, TÜM seçenekleri satır olarak yazılır (yoksa null). */
    liste: { sutun: string; secenekler: Array<{ metin: string; kod: string }> } | null;
    /** sütun → { tablodaki metin → sayfadaki seçenek değeri } */
    karsiliklar: Record<string, Record<string, string>>;
    baglar: Record<string, { tablo: string; sutun: string; basvuru: string }>;
  }>;
} | null;
