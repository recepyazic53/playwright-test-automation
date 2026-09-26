export declare const JETKOBI_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; acente: string }>;
export { TEKLIF_KAYDET_ODEME_AKIS_ANAHTARI, teklifKaydetOdemeAkisPaketi } from './odeme-akis.mjs';

export type JetKobiAkisPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};

export declare function jetKobiAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetKobiAkisPaketi;

