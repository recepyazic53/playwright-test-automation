// scripts/platform/servisler/soapui-ice-aktarma.mjs için tip bildirimi.
import type { ServisKontrolu } from './servis-deposu.mjs';

export declare const KIMLIK_PARAMETRELERI: Readonly<Record<string, string>>;
export interface Operasyon { ad: string; eylem?: string }
export interface Arayuz { ad: string; soapSurumu: '1.1' | '1.2'; wsdl: string; operasyonlar: Operasyon[] }
export type OzellikCozumu = { tur: 'deger'; deger: string } | { tur: 'tarih'; ifade: string };
export interface AlanBasvurusu { yol: string; ad: string }
export interface IstekAdimi {
  ad: string; etkin: boolean; arayuz: string; operasyon: string; eylem?: string; adres: string; yol: string; govde: string;
  kontroller: ServisKontrolu[]; uyarilar: string[]; alanlar: AlanBasvurusu[];
}
export type OzellikKaynagi = 'Proje' | 'Ortam' | 'Takım' | 'Test durumu' | 'Groovy' | 'Gövde';
export interface KullanilanOzellik { ad: string; kaynak: OzellikKaynagi | null; deger?: string; tarih?: string }
export interface TestDurumu {
  takim: string; ad: string; adimlar: IstekAdimi[]; kimlik: Record<string, string>; tarihKurallari: Record<string, string>;
  veriParametreleri: string[]; uyarilar: string[]; ozellikler: KullanilanOzellik[];
}
export interface SoapuiCozumu { proje: string; arayuzler: Arayuz[]; durumlar: TestDurumu[] }
export interface SenaryoTaslagi {
  baslik: string; operasyon: string; govde: string; kontroller: ServisKontrolu[]; kosuyaDahil: boolean; uyarilar: string[]; kaynak: Record<string, string>;
  alanlar: AlanBasvurusu[];
}
export interface ServisTaslagi {
  anahtar: string; ad: string; yol: string; soapSurumu: '1.1' | '1.2'; operasyonlar: Operasyon[]; adresler: string[]; senaryolar: SenaryoTaslagi[];
}

export declare function groovyOzellikleri(betik: string): { ozellikler: Record<string, OzellikCozumu>; anlasilmayanlar: string[] };
export declare function soapuiCozumle(xml: string): SoapuiCozumu;
export declare function alanBasvurulari(govde: string): AlanBasvurusu[];
export declare function servisAnahtariUret(ad: string): string;
export declare function servisTaslaklari(cozum: SoapuiCozumu, secim: { takim: string; durum: string }): {
  durum: { takim: string; ad: string; uyarilar: string[] };
  kimlikParametreleri: string[]; kimlikAdaylari: Record<string, string>; tarihKurallari: Record<string, string>; veriParametreleri: string[];
  ozellikler: KullanilanOzellik[]; servisler: ServisTaslagi[];
};
export declare function soapuiOzeti(cozum: SoapuiCozumu): {
  takim: string; durum: string; istekSayisi: number; arayuzler: string[]; kimlikParametreleri: string[]; veriParametreleri: string[]; uyariSayisi: number;
}[];
