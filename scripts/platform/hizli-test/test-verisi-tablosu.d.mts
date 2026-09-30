export declare function adTemizle(m: unknown, en?: number): string;
export declare function tabloTaslagiKur(g: {
  ekranAdi: string; baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>;
}): {
  tabloAdi: string; satirAdi: string; sutunlar: Array<{ ad: string; gizli: boolean }>; satir: Record<string, string>;
  baglar: Record<string, { tablo: string; sutun: string; basvuru: string }>;
} | null;
