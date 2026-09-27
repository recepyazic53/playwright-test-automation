// scripts/platform/servisler/postman-ice-aktarma.mjs için tip bildirimi.
import type { ServisKontrolu } from './servis-deposu.mjs';

export declare const HTTP_METOTLARI: readonly string[];
export interface PostmanDegiskeni {
  ad: string; deger: string | undefined; kaynak: 'koleksiyon' | 'ortam' | 'istek' | 'tanimsiz'; gizli: boolean; betikle: boolean; kullanim: number;
}
export interface PostmanIstegi {
  baslik: string; operasyon: string; metot: string; yol: string; basliklar: Record<string, string>; govde: string; icerikTuru?: string;
  kontroller: ServisKontrolu[]; uyarilar: string[]; koken: string; kaynak: Record<string, string>;
}
export interface PostmanKlasoru { anahtar: string; ad: string; istekler: PostmanIstegi[] }
export interface PostmanCozumu {
  koleksiyon: string; surum: '2.0' | '2.1'; klasorler: PostmanKlasoru[]; degiskenler: PostmanDegiskeni[]; tabanDegiskenleri: string[]; uyarilar: string[];
}
export declare function postmanAnahtari(ad: string): string;
export declare function postmanGizliMi(ad: string, tur?: string, ekler?: ReadonlyArray<string>): boolean;
export declare function postmanCozumle(koleksiyonMetni: string, secenekler?: { ortamMetni?: string; ekGizliAdlar?: ReadonlyArray<string> }): PostmanCozumu;
export declare function sablonDegiskenleri(s: string): string[];
export declare function sablonCevir(s: string, cevir: (ad: string) => string | undefined): string;
export declare function ortakYol(yollar: string[]): string;
export declare function postmanOzeti(c: PostmanCozumu): {
  koleksiyon: string; surum: '2.0' | '2.1'; uyarilar: string[]; tabanDegiskenleri: string[];
  degiskenler: Array<{ ad: string; kaynak: PostmanDegiskeni['kaynak']; gizli: boolean; betikle: boolean; kullanim: number; tanimli: boolean; deger?: string }>;
  klasorler: Array<{ anahtar: string; ad: string; kokenler: string[];
    istekler: Array<{ baslik: string; metot: string; operasyon: string; kontrolSayisi: number; uyarilar: string[] }> }>;
};
