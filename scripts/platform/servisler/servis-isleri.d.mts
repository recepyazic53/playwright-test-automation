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
  /** Aynı anda çalışan senaryolar (eşzamanlı koşu). */ calisanlar: string[];
  /** Ayarlar > Koşu > Servisler: aynı anda en çok kaç senaryo (1 = sırayla). */ eszamanli: number;
  /** Servise giden her istekten sonra beklenen süre (ms). */ istekBeklemeMs: number;
  /** Etkin değerlerin özeti ("TEST ortamı: …, 500 ms istekler arası bekleme (ortam ayarı)"). */ kosuHizi: string;
}
export declare function servisIsiBaslat(vt: Veritabani, projeId: string, girdi: { servisId: string; ortamId: string; senaryoIdleri?: string[]; taslak?: { baslik: string; icerik: unknown };
  tekrar?: { kaynakKosuId: string; veri?: string }; uygulamaSurumu?: string | null }): ServisIsiGorunumu;
export declare function servisSenaryoAtlamaNedeni(vt: Veritabani, servis: any, s: any, ortam: any): string;
export declare function servisIsiDurumu(projeId: string, id: string): ServisIsiGorunumu;
export declare function servisIsiDurdur(projeId: string, id: string, senaryoId?: string): { durduruldu: true };
/** Servis senaryosu şu an bir işte koşuyor ya da sırada mı. */
export declare function servisSenaryosuKosuyorMu(senaryoId: string): boolean;
