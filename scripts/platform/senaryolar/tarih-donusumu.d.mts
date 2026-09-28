import type { Veritabani } from '../veritabani/baglanti.mjs';

export type TarihDonusumSatiri = { senaryoId: string; senaryo: string; ortam: string; alan: string; alanEtiketi: string; eski: string; yeni: string; yeniTarih: string; mesaj: string };
export type TarihDonusumOnizlemesi = {
  satirlar: TarihDonusumSatiri[];
  atlananlar: Array<{ senaryoId: string; senaryo: string; neden: string }>;
  ozet: { senaryo: number; alan: number };
  aciklama: string;
};

export declare function goreliTarihDonusumu(
  vt: Veritabani,
  projeId: string,
  girdi: { senaryoIdleri: unknown; onay?: boolean; yapan?: string; simdi?: Date },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean }
): { onizleme: TarihDonusumOnizlemesi } | { uygulandi: true; guncellenenSenaryo: number; donusturulenAlan: number; onizleme: TarihDonusumOnizlemesi };
