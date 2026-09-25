export declare const ODEME_AKIS_ANAHTARI: string;
export declare const KABUL_EDILEN_ODEME_SONUCLARI: string[];
export declare function odemeAkisPaketi(s?: { kartHavuzu?: string; olusturulma?: string }): {
  tur: 'sayfa-paketi'; surum: 1; meta: Record<string, unknown>; model: Record<string, any>; senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown>; bilinmeyenler: string[];
};
