// scripts/platform/senaryolar/deger-listesi-modeli.mjs için tip bildirimi.
export type ListeDegeri = { deger: string; aciklama?: string; ekranDegeri?: string; ekranMetni?: string };
export declare function modelSecimAlanlari(model: Record<string, any>): Array<Record<string, any>>;
export declare function listeDegeri(s: Record<string, any>): ListeDegeri;
export declare function modeleListeleriUygula(
  model: Record<string, any>,
  listeler: Array<{ hedef?: Record<string, any> | null; kosullar?: Array<{ alan: string; deger: string }>; degerler?: ListeDegeri[] }>
): Record<string, any>;
