import type { SayfaPaketi } from './jetkonut-akis.mjs';

export declare const JETILKATESKONUT_HAVUZLARI: Readonly<{ ozel: string; tuzel: string; acente: string }>;

export type JetIlkAtesKonutAkisPaketi = SayfaPaketi;

export declare function jetIlkAtesKonutAkisPaketi(s?: {
  havuzlar?: { ozel: string; tuzel: string; acente: string };
  girissiz?: boolean;
  odeme?: boolean;
  olusturulma?: string;
}): JetIlkAtesKonutAkisPaketi;
