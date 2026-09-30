// scripts/platform/tablolar/doldur-onerisi.mjs için tip bildirimi ("Doldur": boş alanın değerini tablodan seçtirme; değer üretilmez).
export interface DoldurSecenegi { deger: string; metin?: string }
export interface DoldurAlani { id: string; etiket: string; tip?: string; hassas?: boolean; secenekler?: Array<string | DoldurSecenegi> | null }
/** tablo: tablonun kimliği ya da adı. */
export interface DoldurBagi { tablo: string; sutun: string; etiket?: string }
export interface DoldurSatiri { id?: string; ad?: string; ortamId?: string | null; degerler: Record<string, string | null>; gizliMaskeleri?: Record<string, string>; doluGizli?: string[] }
export interface DoldurSutunu { ad: string; gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }
export interface DoldurTablosu { id: string; ad: string; sutunlar: DoldurSutunu[]; satirlar: DoldurSatiri[]; baglam?: boolean; kaynak?: { tur?: string; tabloTuru?: string } | null }
export interface AdaySatiri { satirId: string; sira: number; ad: string; gosterim: string; kosul: Record<string, string> }
export interface DoldurAdayi {
  anahtar: string; tabloId: string; tablo: string; sutun: string; etiket: string; neden: 'bagli' | 'ad' | 'liste' | 'benzer'; gizli: boolean;
  grup: string; deger: string; basvuru: string; coklu: boolean; satirlar: AdaySatiri[];
}
export interface DoldurSecimi { aday: DoldurAdayi; deger: string; basvuru: string; satir: AdaySatiri | null; tabloSecimi: { anahtar: string; kosul: Record<string, string> } | null }
export interface DoldurGirdisi {
  alan: DoldurAlani; tablolar: DoldurTablosu[]; bag?: DoldurBagi | null; ortamId?: string | null;
  tabloSecimleri?: Record<string, Record<string, string>>; cokluGruplar?: string[];
  digerDegerler?: Array<DoldurBagi & { deger: unknown }>;
}
export declare const NEDEN_METINLERI: Readonly<{ bagli: string; ad: string; liste: string; benzer: string }>;
export declare function benzerAdMi(a: string, b: string): boolean;
export declare function doldurAdaylari(g: DoldurGirdisi): DoldurAdayi[];
export declare function adaySecimi(aday: DoldurAdayi, satirId?: string | null): DoldurSecimi;
export declare function tekAnlamliSecim(adaylar: DoldurAdayi[]): DoldurSecimi | null;
export declare function tumunuDoldur(g: Omit<DoldurGirdisi, 'alan' | 'bag'> & { alanlar: Array<{ alan: DoldurAlani; bag?: DoldurBagi | null }> }): {
  dolanlar: Array<{ alanId: string; etiket: string; secim: DoldurSecimi }>;
  kalanlar: Array<{ alanId: string; etiket: string; neden: 'yok' | 'bos' | 'coklu'; adaySayisi: number }>;
  tabloSecimleri: Record<string, Record<string, string>>;
};
