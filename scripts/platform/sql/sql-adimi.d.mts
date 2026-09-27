// scripts/platform/sql/sql-adimi.mjs için tip bildirimi.
export type SqlBeklenen =
  | { tur: 'satirSayisi'; deger: number }
  | { tur: 'sutunDegeri'; sutun: string; deger: string }
  | { tur: 'bosDegil' }
  | { tur: 'bos' }
  | { tur: 'tabloEsit'; sutunlar: string[]; satirlar: string[][] };
export type SqlOkuma = { ad: string; sutun: string; gizli?: boolean };
export type SqlTanimi = {
  baglantiId: string;
  sql: string;
  beklenen: SqlBeklenen;
  yenidenDeneme?: { sureSn: number; aralikSn: number };
  zamanAsimiSn?: number;
  okumalar?: SqlOkuma[];
};
export type SqlSonucu = { sutunlar: string[]; satirlar: unknown[][]; kesildi?: boolean };
export type SqlOzeti = { sutunlar: string[]; satirlar: string[][]; toplamSatir: number; kesildi: boolean };
export type SqlYurutucu = (sql: string, parametreler: Record<string, string>, s: { zamanAsimiMs: number; satirSiniri: number }) => Promise<SqlSonucu>;
export type SqlAdimSonucu = {
  durum: 'basarili' | 'basarisiz' | 'hata';
  mesaj?: string;
  beklenen?: string;
  gorulen?: string;
  ozet?: SqlOzeti;
  okunanlar: Record<string, string>;
  gizliOkunanlar: string[];
  deneme: number;
  sureMs: number;
};
export declare const SQL_BEKLENEN_TURLERI: readonly string[];
export declare const SQL_BEKLENEN_ETIKETLERI: Readonly<Record<string, string>>;
export declare const SQL_RAPOR_SATIR_SINIRI: number;
export declare const SQL_SORGU_SATIR_SINIRI: number;
export declare const SQL_EN_UZUN: number;
export declare const SQL_MASKE: string;
export declare function sqlYerTutuculari(sql: string): { kodda: string[]; metinde: string[] };
export declare function sqlAkisDegerleri(tanim: unknown): string[];
export declare function sqlTanimiDogrula(ham: unknown): { tanim: SqlTanimi; hatalar: string[] };
export declare function sqlBagla(sql: string, coz: (ifade: string) => string | undefined): { sql: string; parametreler: Record<string, string>; eksikler: string[] };
export declare function hucreMetni(v: unknown): string;
export declare function sonucOzeti(sonuc: SqlSonucu, s?: { gizliSutunMu?: (ad: string) => boolean; gizliDegerler?: string[] }): SqlOzeti;
export declare function sonucuDegerlendir(beklenen: SqlBeklenen, sonuc: SqlSonucu, coz: (ifade: string) => string | undefined, ozet: SqlOzeti): { gecti: boolean; beklenen: string; gorulen: string };
export declare function beklenenGorulenMetni(adim: string, beklenen: string, gorulen: string): string;
export declare function sqlAdiminiKos(tanim: SqlTanimi, g: {
  adimAdi: string;
  yurutucu: SqlYurutucu;
  coz: (ifade: string) => string | undefined;
  gizliSutunMu?: (ad: string) => boolean;
  gizliDegerler?: string[];
  bekle?: (ms: number) => Promise<void>;
  simdi?: () => number;
  sinyal?: AbortSignal;
}): Promise<SqlAdimSonucu>;
