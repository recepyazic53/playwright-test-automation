export declare const JETDASK_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; pasaport: string; acente: string }>;

export type JetDaskAkisPaketi = {
  tur: 'sayfa-paketi';
  surum: 1;
  meta: Record<string, unknown>;
  model: Record<string, unknown> & { girisGerekmez?: boolean };
  senaryoOnerileri: unknown[];
  gerekenAyarlar: Record<string, unknown> & { girisGerekli: boolean };
  bilinmeyenler: string[];
};

export declare function jetDaskAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; pasaport: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetDaskAkisPaketi;
