// scripts/platform/servisler/govde-degeri.mjs için tip bildirimi (senaryo gövdesinde tek alanın düz değerini yerinde değiştirme).
export interface Icerik { govde: string; yol?: string }
export type Degisim = { sonuc: string } | { neden: string };
export declare const NEDENLER: Readonly<Record<'bulunamadi' | 'cokEslesme' | 'ozelIcerik' | 'sayiDegil' | 'gecersizJson' | 'sablonYok', string>>;
export declare function soapYapraklari(govde: string, yol: string, kok?: string): Array<{ bas: number; son: number; metin: string; ozel: boolean }>;
export declare function soapDegeriniDegistir(govde: string, yol: string, eski: string, yeni: string, kok?: string): Degisim;
export declare function restDegerleri(icerik: Icerik, yol: string, sablon?: string): string[];
export declare function restDegeriniDegistir(icerik: Icerik, yol: string, eski: string, yeni: string, sablon?: string): { sonuc: Icerik } | { neden: string };
