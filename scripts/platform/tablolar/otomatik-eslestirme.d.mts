// scripts/platform/tablolar/otomatik-eslestirme.mjs için tip bildirimi (ekran alanlarını tablo sütunlarıyla otomatik eşleştirme).
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type EkranBaglari = Record<string, { tablo: string; sutun: string; etiket?: string }>;
export interface OtomatikOneri {
  alanId: string; etiket: string; tip: string; tablo: { id: string; ad: string }; sutun: string; gizli: boolean;
  guven: 'yuksek' | 'orta'; neden: string; onerilenSecim: boolean;
}
export interface OtomatikEslestirmeOnizlemesi {
  oneriler: OtomatikOneri[];
  /** Önerilerin düştüğü tablolar arasında başlıkları benzeyenler (birleştirme ayrı, önizlemeli adımdır). */
  birlestirilebilir: Array<{ a: string; b: string }>;
  ozet: { oneri: number; yuksek: number; zatenBagli: number; eslesmeyen: number; tablo: number };
}
export declare function otomatikEslestir(vt: Veritabani, projeId: string, girdi: { ekranId: string; onay?: boolean; secimler?: unknown; yapan?: string }): {
  onizleme: OtomatikEslestirmeOnizlemesi; uygulandi?: true; baglanan?: number; onceki?: EkranBaglari; karsiliklar?: { eklenen: number; tablolar: string[] };
};
export declare function otomatikEslestirmeyiGeriAl(vt: Veritabani, projeId: string, girdi: { ekranId: string; alanlar: unknown; onceki: unknown; yapan?: string }): { geriAlinan: number };
