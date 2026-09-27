// scripts/platform/entegrasyonlar/dbeaver.mjs için tip bildirimi.
export interface DbeaverBaglantisi {
  kaynakId: string; ad: string; surucu: 'mssql' | 'oracle' | 'postgres' | 'mysql' | null; kaynakSurucu: string; sunucu: string;
  port: number | null; veritabani: string; kullanici: string; destekleniyor: boolean; neden: string | null;
}
export declare function dbeaverBaglantilariniOku(icerik: unknown): DbeaverBaglantisi[];
