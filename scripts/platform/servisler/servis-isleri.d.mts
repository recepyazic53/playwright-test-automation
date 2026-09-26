// scripts/platform/servisler/servis-isleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface IsOlayi { adim: string; durum: 'basladi' | 'tamam' | 'hata'; zaman: number; bilgi?: Record<string, unknown> }
export interface IsSatiri {
  senaryoId: string; baslik: string; durum: 'sirada' | 'calisiyor' | 'basarili' | 'basarisiz' | 'hata' | 'durduruldu' | 'atlandi';
  olaylar: IsOlayi[]; istek: string | null; yanit: string | null; baslangic: number | null; bitis: number | null; sonuc: Record<string, any> | null; neden?: string;
}
export interface ServisIsiGorunumu {
  id: string; projeId: string; servisId: string; servisAd: string; ortam: string; ortamTuru: string; baslangic: number; bitis: number | null;
  bitti: boolean; durdur: boolean; satirlar: IsSatiri[]; calisanSenaryo: string | null;
}
export declare function servisIsiBaslat(vt: Veritabani, projeId: string, girdi: { servisId: string; ortamId: string; senaryoIdleri: string[] }): ServisIsiGorunumu;
export declare function servisIsiDurumu(projeId: string, id: string): ServisIsiGorunumu;
export declare function servisIsiDurdur(projeId: string, id: string, senaryoId?: string): { durduruldu: true };
