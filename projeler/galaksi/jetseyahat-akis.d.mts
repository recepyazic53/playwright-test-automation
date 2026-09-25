export declare const GALAKSI_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; acente: string }>;

export type JetSeyahatAkisPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};

export declare function jetSeyahatAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetSeyahatAkisPaketi;
