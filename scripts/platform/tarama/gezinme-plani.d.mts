// scripts/platform/tarama/gezinme-plani.mjs için tip bildirimi.
import type { AkisEnvanteri } from './akis-tasarimi.mjs';

export type GezinmeOzeti = {
  /** Kayıtta görülen adres değişimi (adım olanlar + alınmayanlar + yeni pencereler). */
  toplam: number;
  /** Adım olan (oynatmada "adrese git") sayısı. */
  adim: number;
  /** Alınmayanların nedenleri. */
  atlanan: { ayniSayfa: number; baskaSite: number; otomatik: number; tiklama: number; yeniPencere: number };
  /** Gidilen başka siteler (yalnız köken; kayitli: ortamın ek taban adreslerinde zaten var). */
  baskaSiteler: Array<{ koken: string; kayitli: boolean }>;
  /** Açılan / kapanan pencereler (yol: açıldığında görülen adres; yoksa ''). */
  pencereler: Array<{ sira: number; olay: 'acildi' | 'kapandi'; yol: string }>;
};
export type GezinmePlani = { adimlar: Array<{ sira: number; yol: string }>; gecisler: Array<{ sira: number; yol: string; adim: boolean }>; ozet: GezinmeOzeti };

export declare function ilkSayfaYolu(env: AkisEnvanteri): string | null;
export declare function gezinmePlani(env: AkisEnvanteri, s?: { ilkYol?: string | null }): GezinmePlani;
export declare function gezinmeOzetMetni(o: GezinmeOzeti): string;
export declare function gezinmeUyarilari(o: GezinmeOzeti): string[];
