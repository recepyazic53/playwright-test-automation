// scripts/platform/servisler/rest-servisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface RestUcu {
  ad: string; eskiAd?: string; metot: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; icerikTuru: string;
  basliklar: Array<{ ad: string; deger: string }>; govdeOrnegi: string; yalnizTest: boolean; gizliAlanlar: string[];
}
export declare function restUcuDogrula(x: unknown, i: number): RestUcu;
export declare function restServisiKaydet(vt: Veritabani, projeId: string, girdi: {
  id?: string; anahtar: string; ad: string; tabanlar?: Record<string, string>; tlsDogrulama?: boolean; uclar: unknown[];
  alanBaglari?: unknown; alanZorunluluklari?: unknown; tarihKurallari?: unknown; senaryolar?: string[]; kapsam?: 'test' | 'canli' | 'ikisi'; yapan?: string;
  tabanKararlari?: Record<string, import('./taban-adresleri.mjs').TabanKarari>;
}): { id: string; eklenenSenaryolar: string[] };
export declare function restUcuDene(vt: Veritabani, projeId: string, girdi: { ortamId: string; taban?: string; uc: unknown; tlsDogrulama?: boolean }): Promise<{
  basarili: boolean; adres: string; metot: string; durumKodu?: number; sureMs?: number; yanit?: string; mesaj?: string; atlananBasliklar: string[];
}>;
