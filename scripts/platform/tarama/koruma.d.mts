// scripts/platform/tarama/koruma.mjs için tip bildirimi.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { YasakDeseni } from '../senaryolar/model-kosusu.mjs';

export type TaramaAsamasi = 'hazirlik' | 'giris' | 'baglam' | 'tarama' | 'kayit' | 'secme';

export declare const KESIF_TURLERI: readonly string[];
export declare const KESIF_RISKLI_DESENI: RegExp;
export declare function kesifGuvenligi(a: {
  tur: string; etiket?: string | null; ad?: string | null; kimlik?: string | null; devreDisi?: boolean; saltOkunur?: boolean;
  radyolar?: Array<{ metin?: string | null; deger?: string }>;
}): { guvenli: true } | { guvenli: false; neden: string };

export declare const OKUMA_YONTEMLERI: readonly string[];
export declare class HedefHatasi extends Error {
  constructor(mesaj: string, bilinmeyenKoken?: string | null);
  bilinmeyenKoken: string | null;
}
export declare function ekKokenleri(ortam: { tabanUrl?: string; ayarlar?: Record<string, unknown> } | null | undefined): string[];
export declare function hedefCoz(tabanUrl: string, hedef: unknown, ekKokenler?: string[]): { adres: string; yol: string; koken?: string };
export declare function taramaAdresleri(tabanUrl: string, hedefAdres: string, tarif: GirisTarifi | null, profilDegerleri: Array<Record<string, unknown> | null>): string[];
export declare function yasakliAdresBul(adresler: string[], desenler: YasakDeseni[]): { adres: string; host: string; kalip: string } | null;
export declare function yasakliTaramaMesaji(b: { host: string; kalip: string }): string;
export declare function adresOzeti(adres: string): string;
export declare function istekKarari(i: {
  yontem: string; adres: string; asama: TaramaAsamasi; yasakDesenleri: YasakDeseni[]; izinliKokenler?: string[] | null;
}): { izin: true } | { izin: false; neden: 'yazma' | 'yasakli' | 'izinsiz-koken'; kalip?: string };
