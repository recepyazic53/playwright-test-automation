// scripts/platform/sql/sql-kullanimi.mjs için tip bildirimi.
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export type SqlKullanimi = { kaynak: 'ekran' | 'servisAkisi'; yer: string; veritabaniId?: string; baglantiId?: string };
export declare function sqlKullanimlari(vt: Veritabani, projeId: string): SqlKullanimi[];
export declare function sqlKosuDenetimi(vt: Veritabani, projeId: string): {
  veritabanlari: Array<{ id: string; ad: string; eslemeler: Record<string, string> }>;
  ekranSenaryolari: Record<string, string[]>;
  servisSenaryolari: Record<string, string[]>;
};
export declare function baglantiKullanimi(vt: Veritabani, projeId: string, baglantiId: string): {
  veritabanlari: Array<{ id: string; ad: string; ortamlar: string[] }>; adimlar: string[];
};
export declare const SQL_KULLANIM_GET_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
export declare const SQL_KULLANIM_POST_UCLARI: Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown>]>;
