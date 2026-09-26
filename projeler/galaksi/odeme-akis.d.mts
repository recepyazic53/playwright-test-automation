export declare const ODEME_AKIS_ANAHTARI: string;
export declare const KABUL_EDILEN_ODEME_SONUCLARI: string[];
export declare const TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR: string[];
export declare const DOGRUDAN_KART_KABUL_EDILEN_SONUCLAR: string[];
export declare function odemeAkisPaketi(s?: { kartHavuzu?: string; olusturulma?: string; kabulEdilenSonuclar?: string[] }): {
  tur: 'sayfa-paketi'; surum: 1; meta: Record<string, unknown>; model: Record<string, any>; senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown>; bilinmeyenler: string[];
};
export declare const TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI: 'odeme-teklif-kaydet-akis';
export declare const TEKLIF_KAYDET_SECICISI: string;
export declare function teklifKaydetOdemeAkisPaketi(s?: { kartHavuzu?: string; olusturulma?: string }): ReturnType<typeof odemeAkisPaketi>;
export declare const DOGRUDAN_KART_ODEME_AKIS_ANAHTARI: 'odeme-dogrudan-kart-akis';
export declare function dogrudanKartOdemeAkisPaketi(s?: { kartHavuzu?: string; olusturulma?: string }): ReturnType<typeof odemeAkisPaketi>;
