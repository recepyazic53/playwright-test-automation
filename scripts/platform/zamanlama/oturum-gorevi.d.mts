// scripts/platform/zamanlama/oturum-gorevi.mjs için tip bildirimi.
export type GorevYurutucu = (komut: string, argumanlar: string[]) => Promise<{ kod: number; cikti: string }>;
export interface GorevHedefi { komut: string; argumanlar: string[]; calismaKlasoru: string; paket: boolean }
export interface Komut { komut: string; argumanlar: string[] }

export declare const GOREV_ADI: string;
export declare const ARKA_PLAN_BAYRAGI: string;
export declare const PAKET_BASLATICISI: string;
export declare function schtasksYolu(): string;
export declare function gorevHedefi(g: { projeKoku: string; nodeYolu: string; varMi?: (yol: string) => boolean }): GorevHedefi;
export declare function komutSatiriArgumani(a: string): string;
export declare function gorevXml(g: { kullanici: string; komut: string; argumanlar: string[]; calismaKlasoru: string }): string;
export declare function gorevXmlBaytlari(xml: string): Buffer;
export declare function gorevKomutlari(xmlYolu?: string): { olustur: Komut; sorgula: Komut; sil: Komut };
export declare const varsayilanGorevYurutucu: GorevYurutucu;
export declare function gorevVarMi(yurutucu?: GorevYurutucu): Promise<boolean>;
export declare function gorevOlustur(g: {
  xml: string; xmlYolu: string; yaz: (yol: string, veri: Buffer) => void; sil: (yol: string) => void; yurutucu?: GorevYurutucu;
}): Promise<void>;
export declare function gorevSil(yurutucu?: GorevYurutucu): Promise<boolean>;
