// scripts/platform/tablolar/kisi-baglama.mjs için tip bildirimi (kişi alanlarını tabloya bağlama).
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare function kisiKategorisi(a: { id?: string; etiket?: string; anahtar?: string; tip?: string }): { kategori: string; ad: string } | null;
export declare const NEDENLER: Readonly<Record<'farkliSatirlar' | 'kismen' | 'deger' | 'baskaTablo' | 'ayniKategori' | 'kimlikProfili', string>>;
export interface KisiBaglamaOnizlemesi {
  ekran: { id: string; ad: string };
  tablolar: Array<{ id: string; ad: string; puan: number }>; tabloId: string | null; tabloAdi: string | null;
  sutunlar: Array<{ ad: string; gizli: boolean }>;
  alanlar: Array<{ alanId: string; anahtar: string; etiket: string; tip: string; kategori: string; kategoriAdi: string; hassas: boolean; onerilen: string | null; sutun: string; zatenBagli: boolean; neden?: string }>;
  kimlikAlanlari: Array<{ alanId: string; etiket: string; neden: string }>;
  senaryolar: Array<{ anahtar: string; senaryoId: string; senaryo: string; ortamlar: string[]; durum: 'eslesti' | 'yeniSatir' | 'atlandi'; satir?: string; onerilenAd?: string; ortamaOzel?: boolean; neden?: string; alanlar: string[] }>;
  donusum: Array<{ anahtar: string; senaryoId: string; senaryo: string; alan: string; alanEtiketi: string; durum: 'cevrilecek' | 'atlandi' | 'secilmedi'; gizli: boolean; neden?: string; satirSecimiEklenir: boolean }>;
  ozet: { alan: number; eslesti: number; yeniSatir: number; atlandi: number };
}
export declare function kisiAlanlariniBagla(vt: Veritabani, projeId: string, girdi: {
  ekranId: string; tabloId?: string | null; eslemeler?: Record<string, string>; yeniSatirlar?: Record<string, { ad?: string; ortamaOzel?: boolean; ekle?: boolean }>;
  onay?: boolean; secimler?: unknown; yapan?: string;
}, secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean }): {
  onizleme: KisiBaglamaOnizlemesi; uygulandi?: true; baglanan?: number; eklenenSatir?: number; guncellenenSenaryo?: number; cevrilenAlan?: number;
};
