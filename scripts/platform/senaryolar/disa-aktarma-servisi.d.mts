// scripts/platform/senaryolar/disa-aktarma-servisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DisaAktarmaSonucu } from './playwright-disa-aktarma.mjs';

export declare function senaryoyuPlaywrightKodunaAktar(
  db: Veritabani,
  istek: { projeId: string; senaryoId: string; ortamId: string },
  s: { kosuVerisi: (projeId: string, ortamId: string) => Promise<unknown>; simdi?: Date }
): Promise<DisaAktarmaSonucu & { senaryo: string; ortam: string }>;
