// scripts/platform/servisler/curl-ayristirici.mjs için tip bildirimi.
export declare const MASKE: string;
export declare const EN_COK_KARAKTER: number;
export declare const EN_COK_KOMUT: number;
export declare class CurlHatasi extends Error {
  constructor(mesaj: string);
}
export type CurlBicimi = 'bash' | 'cmd' | 'powershell';
export interface CurlDegeri { ad: string; deger: string; gizli: boolean }
/** yol: REST alan yolu (JSON: "govde/a/b"; form: alan adı). */
export interface CurlGovdeAlani { yol: string; ad: string; deger: string; gizli: boolean }
export interface CurlIstegi {
  sira: number; metot: string; koken: string; yol: string; semaEklendi: boolean; sorgu: CurlDegeri[]; basliklar: CurlDegeri[];
  icerikTuru: string; govdeTuru: 'yok' | 'json' | 'form' | 'ham'; govde: string; govdeMaskeli: string; govdeGizlisiz: string;
  govdeAlanlari: CurlGovdeAlani[]; soap: boolean; uyarilar: string[]; yoksayilanlar: string[]; taninmayanlar: string[]; desteklenmeyenler: string[];
}
export interface CurlCozumu { bicim: CurlBicimi; istekler: CurlIstegi[] }
export interface CurlSecenekleri { gizliMi?: (ad: string) => boolean }
export interface CurlGizlisi { anahtar: string; tur: 'baslik' | 'sorgu' | 'govde'; ad: string; deger: string; alanYolu: string | null }
export interface CurlRestTaslagi {
  metot: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; basliklar: Array<{ ad: string; deger: string }>; icerikTuru: string;
  govdeOrnegi: string; gizliAlanlar: string[]; gizliDegerler: Record<string, string | null>; uyarilar: string[];
}
export declare function curlBicimi(metin: string): CurlBicimi;
export declare function curlAyristir(metin: string, secenekler?: CurlSecenekleri): CurlCozumu;
export declare function curlGizlileri(istek: CurlIstegi): CurlGizlisi[];
export declare function curlRestTaslagi(istek: CurlIstegi, s?: { taban?: string; onayli?: (anahtar: string) => boolean }): CurlRestTaslagi;
