// scripts/platform/senaryolar/veri-kosusu-plani.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { TekrarKosusu } from '../tablolar/veri-kosulari.mjs';

export interface SenaryoVeriKosusuTahmini { id: string; baslik: string; sayi: number; coklu: boolean; gruplu: boolean; hatalar: string[] }
export declare function veriKosusuSiniri(vt: Veritabani): number;
export declare function senaryoVeriKosusuTahmini(vt: Veritabani, projeId: string, senaryoId: string, ortamId: string, kip: string | null | undefined, onbellek?: { tablolar?: unknown[] }): SenaryoVeriKosusuTahmini;
export declare function veriKosusuTahminleri(vt: Veritabani, projeId: string, g: { ortamId: unknown; senaryoIdleri: unknown; kip?: unknown }): {
  sinir: number; kip: string; toplam: number; gruplu: boolean; coklu: number;
  senaryolar: Array<SenaryoVeriKosusuTahmini & { asiyor: boolean }>;
  asanlar: Array<{ id: string; baslik: string; sayi: number }>;
};
export interface TekrarPlaniSenaryosu {
  id: string; baslik: string; testSayisi: number; testler: Array<{ sonucId: string; baslik: string; veriKosusu: string | null }>;
  modelSurumu: number | null; guncelModelSurumu: number | null; modelDegisti: boolean; eskiModelVar: boolean;
  satirDegisiklikleri: Array<{ tablo: string; satirAdi: string; durum: 'degisti' | 'silindi'; kosudakiVeri: boolean }>;
}
export declare function tekrarPlani(vt: Veritabani, kosuId: string, projeId?: string | null): {
  kosu: { id: string; projeId: string; ortamId: string | null }; sayi: number; senaryolar: TekrarPlaniSenaryosu[];
  atlananlar: Array<{ baslik: string; neden: string }>; bagsiz: number;
};
export declare function tekrarSenaryoPlani(vt: Veritabani, g: { kaynakKosuId: unknown; senaryoId: string; ortamId: string; model?: unknown; veri?: unknown }): {
  modelSurumu: number | null; kosular: TekrarKosusu[]; testSayisi: number;
};
