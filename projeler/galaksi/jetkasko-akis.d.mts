export declare const JETKASKO_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; acente: string }>;
export declare const JETKASKO_URUNLERI: Readonly<Record<'1' | '2' | '3' | '4' | '5', string>>;

export type JetKaskoAkisPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};

export declare function jetKaskoAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetKaskoAkisPaketi;
