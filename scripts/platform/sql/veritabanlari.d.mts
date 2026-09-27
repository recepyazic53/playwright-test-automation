// scripts/platform/sql/veritabanlari.mjs için tip bildirimi.
type Veritabani = import('../veritabani/baglanti.mjs').Veritabani;
export type MantiksalVeritabani = {
  id: string; projeId: string; ad: string; aciklama: string; eslemeler: Record<string, string>; olusturulma: string; guncellenme: string;
};
export declare const VERITABANI_AYAR_ANAHTARI: 'sqlVeritabanlari';
export declare const EN_COK_VERITABANI: number;
export declare function tumVeritabanlari(vt: Veritabani): MantiksalVeritabani[];
export declare function veritabanlariListele(vt: Veritabani, projeId: string): MantiksalVeritabani[];
export declare function veritabaniGetir(vt: Veritabani, projeId: string, id: string): MantiksalVeritabani | undefined;
export declare function eslemeUyarilari(vt: Veritabani, projeId: string, eslemeler: Record<string, string>): string[];
export declare function veritabaniKaydet(vt: Veritabani, projeId: string, girdi: unknown): { veritabani: MantiksalVeritabani; uyarilar: string[] };
export declare function veritabaniSil(vt: Veritabani, projeId: string, id: string): boolean;
export declare function baglantininVeritabanlari(vt: Veritabani, projeId: string, baglantiId: string): Array<{ id: string; ad: string; ortamIdleri: string[] }>;
export declare function baglantiEslemeleriniKaldir(vt: Veritabani, projeId: string, baglantiId: string): number;
export declare function eslemedenBaglanti(vt: Veritabani, projeId: string, veritabaniId: string, ortamId: string | undefined): { veritabani: MantiksalVeritabani; baglantiId: string };
export declare function veritabaniGorunumleri(vt: Veritabani, projeId: string): Array<{ id: string; ad: string; aciklama: string; eslemeler: Record<string, string>; uyarilar: string[] }>;
