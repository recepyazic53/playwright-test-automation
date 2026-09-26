export type JetSaglikHavuzlari = { ozel: string; tuzel: string; pasaport: string; yabanciKimlik: string; adres: string; acente: string };

export declare const JETSAGLIK_HAVUZLARI: Readonly<JetSaglikHavuzlari>;

export type JetSaglikAkisPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};

export declare function jetSaglikAkisPaketi(s?: {
  havuzlar?: JetSaglikHavuzlari;
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetSaglikAkisPaketi;
