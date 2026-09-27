// scripts/platform/guvenlik/yedek-uyarisi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type YedekUyarisi = {
  zaman: string | null;
  tur: string | null;
  izinler: Array<{ anahtar: string; etiket: string; acik: boolean }>;
  ortamlar: Array<{ projeId: string; proje: string; id: string; ad: string; riskli: boolean | null }>;
};
export declare const YEDEK_UYARISI_META: string;
export declare function yedekUyarisiniKur(vt: Veritabani, s: { tur: 'tamYukleme' | 'secmeli'; simdi?: Date }): void;
export declare function yedekUyarisi(vt: Veritabani): YedekUyarisi | null;
export declare function yedekUyarisiniKapat(vt: Veritabani): boolean;
