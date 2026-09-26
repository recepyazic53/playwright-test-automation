// scripts/platform/servisler/soap-istemcisi.mjs için tip bildirimi.
import type { ServisKontrolu } from './servis-deposu.mjs';

export declare const VARSAYILAN_ZAMAN_ASIMI_MS: number;
export declare const YANIT_SAKLAMA_SINIRI: number;
export declare class ServisHatasi extends Error {}
export declare const MASKE: string;

export declare function tarihBicimle(t: Date, bicim: string): string;
export declare function goreliTarih(ifade: string, simdi: Date): Date;
export declare function tarihKuraliUygula(kural: string, simdi: Date): string;
export declare function tarihDegeriBicimle(deger: string, bicim: string, ad: string): string;
export declare function yerTutuculariDoldur(govde: string, baglam: {
  degerler: Record<string, string>; tarihKurallari?: Record<string, string>; simdi?: Date; eksikAciklamasi?: (ad: string) => string;
  akisDegerleri?: Record<string, string>; kacis?: 'xml' | 'baslik';
}): string;
export declare function kullanilanParametreler(govde: string): string[];
export declare function kullanilanAkisDegerleri(metin: string): string[];
export declare const AKIS_DEGERI_ADI: RegExp;
export declare function degerOku(yanit: { govde: string; basliklar?: Record<string, string> }, okuma: { kaynak?: 'xml' | 'json' | 'baslik'; yol: string }): string | undefined;
export declare function xmlKacis(s: string): string;
export declare function xmlKacisCoz(s: string): string;
export declare function gizlileriMaskele(metin: string, gizliler: string[]): string;

export interface HamYanit { durumKodu: number; basliklar: Record<string, string>; govde: string; sureMs: number }
export declare function httpIstegi(istek: {
  adres: string; yontem?: 'GET' | 'POST'; basliklar?: Record<string, string>; govde?: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
  sinyal?: AbortSignal; gonderildi?: () => void;
}): Promise<HamYanit>;
export declare function soapIstegi(istek: {
  adres: string; eylem?: string; soapSurumu?: '1.1' | '1.2'; govde: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
  sinyal?: AbortSignal; gonderildi?: () => void; ekBasliklar?: Record<string, string>;
}): Promise<HamYanit>;
export declare function wsdlOperasyonlari(wsdl: string): { ad: string; eylem?: string }[];
export declare function erisimiDenetle(girdi: { adres: string; zamanAsimiMs?: number; tlsDogrulama?: boolean }): Promise<{
  durumKodu: number; sureMs: number; operasyonlar: { ad: string; eylem?: string }[]; semalar: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi>;
  iceAktarilan?: number; alinamayan?: string[];
}>;
export declare function iceAktarmaAdresleri(metin: string, taban: string): string[];

export interface XmlDugumu { ad: string; cocuklar: XmlDugumu[]; metin: string }
export declare function xmlAgaci(xml: string): XmlDugumu | null;
export declare function xpathMetni(kok: XmlDugumu, yol: string): string | undefined;
export interface KontrolSonucu { tur: string; ad: string; gecti: boolean; aciklama: string; alt?: KontrolSonucu[] }
export declare function kontrolAdi(k: ServisKontrolu): string;
export declare function kontrolleriDegerlendir(yanit: { durumKodu: number; govde: string }, kontroller: ServisKontrolu[]): KontrolSonucu[];
export declare function yanitOzeti(govde: string): string;
