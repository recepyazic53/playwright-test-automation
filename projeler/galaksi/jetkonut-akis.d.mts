export declare const JETKONUT_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; acente: string }>;
export { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, TEKLIF_KAYDET_SECICISI, teklifKaydetOdemeAkisPaketi } from './odeme-akis.mjs';

export type SayfaPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};
export type JetKonutAkisPaketi = SayfaPaketi;


export declare function jetKonutAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetKonutAkisPaketi;

/** JetİlkAteşKonut (akış) ile paylaşılan model parçaları. */
export declare function gizliListeSecicisi(id: string): string;
export declare function kimlikBlogu(k: {
  id: string; form: string; tipAlani: string; senaryo: string[]; havuz: { ozel: string; tuzel: string };
  dogum: string; kimlikNo: string; sorgu: string; detay: string; ek?: object;
}): Record<string, unknown>;
export declare function kisiAdimlari(h: { ozel: string; tuzel: string }): Array<Record<string, unknown>>;
export declare function adresAdimi(sira: number, bekleSecici: string): Record<string, unknown>;
export declare function baslangicTarihi(): Record<string, unknown>;
export declare function sigortaliDurumu(): Record<string, unknown>;
export declare function senaryoDuzeyiAlanlari(h: { acente: string }, odeme: boolean, hataAdimlari: Array<{ deger: string; metin: string }>, basariAnlami: string): Array<Record<string, unknown>>;
export declare function ortakKosullar(odeme: boolean): Record<string, unknown>;
export declare function odemeAdimi(sira: number): Record<string, unknown>;
