export declare const KISI_TABLOSU: string;
export declare const KART_TABLOSU: string;
export declare function adTemizle(m: unknown, en?: number): string;
export declare function alanGrubu(a: Record<string, any>): { tablo: string; sutun: string };
export declare function tabloTaslagiKur(g: {
  baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>;
}): {
  satirAdi: string;
  tablolar: Array<{
    tabloAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
    /** sütun → { tablodaki metin → sayfadaki seçenek değeri } */
    karsiliklar: Record<string, Record<string, string>>;
    baglar: Record<string, { tablo: string; sutun: string; basvuru: string }>;
  }>;
} | null;
