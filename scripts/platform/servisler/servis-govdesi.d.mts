// scripts/platform/servisler/servis-govdesi.mjs için tip bildirimi.
export type AlanTipi = 'metin' | 'tamsayi' | 'ondalik' | 'mantiksal' | 'tarih' | 'tarihSaat';
export interface Alan { ad: string; tip?: AlanTipi; zorunlu?: boolean; nillable?: boolean; coklu?: boolean; secenekler?: string[]; cocuklar?: Alan[]; ek?: boolean }
export interface OperasyonSemasi { ad: string; eylem?: string; kok: string; ns: string; alanlar: Alan[] }
export type AlanKaynagi = 'sabit' | 'parametre' | 'bos' | 'nil' | 'gonderme';
export interface AlanDegeri { kaynak: AlanKaynagi; deger?: string }
export interface XmlOgesi { ad: string; yerel: string; oz: Record<string, string>; cocuklar: XmlOgesi[]; metin: string }

export declare const KAYNAKLAR: readonly AlanKaynagi[];
export declare function xmlKacis(s: string): string;
export declare function xmlAyristir(xml: string): XmlOgesi;
export declare function semaBirlestir(sema: OperasyonSemasi, ekler?: Array<{ yol: string; tip?: AlanTipi; zorunlu?: boolean }>): OperasyonSemasi;
export declare function alanSatirlari(alanlar: Alan[], on?: string, derinlik?: number): Array<{ yol: string; alan: Alan; derinlik: number; grup: boolean }>;
export declare function baslangicDegerleri(sema: OperasyonSemasi, varsayilanlar?: Record<string, AlanDegeri>): Record<string, AlanDegeri>;
export declare function govdeUret(sema: OperasyonSemasi, degerler: Record<string, AlanDegeri>, secenekler?: { soapSurumu?: '1.1' | '1.2' }): string;
export declare function govdeCoz(govde: string, sema: OperasyonSemasi): { degerler: Record<string, AlanDegeri>; uyumsuz: string[] };
export declare function sabitDegerUyarisi(alan: Alan, deger: string): string | null;
