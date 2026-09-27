// scripts/platform/servisler/rest-istemcisi.mjs için tip bildirimi.
import type { HamYanit } from './soap-istemcisi.mjs';

export declare function adresBirlestirRest(servisAdresi: string, yol: string): string;
export declare function govdeKacisi(icerikTuru: string | undefined): 'json' | 'url' | 'xml' | 'yok';
export declare function restIstegi(istek: {
  adres: string; metot: string; govde?: string; icerikTuru?: string; ekBasliklar?: Record<string, string>; zamanAsimiMs?: number;
  tlsDogrulama?: boolean; sinyal?: AbortSignal; gonderildi?: () => void; yasakDesenleri?: ReadonlyArray<{ kalip: string; desen: RegExp }>;
}): Promise<HamYanit>;
