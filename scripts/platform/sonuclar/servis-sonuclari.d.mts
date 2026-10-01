// scripts/platform/sonuclar/servis-sonuclari.mjs için tip bildirimi (testlerde kullanılan kısım).
import type { Veritabani } from '../veritabani/baglanti.mjs';

/** Doğrulanan dosyanın özeti (içerik dönmez). saklandi: dosyanın kendisi şifreli koşu kaydında. */
export interface DogrulananDosyaOzeti { sira: number; ad: string; bicim: string; boyut: number; gecti: boolean; saklandi: boolean }
export declare function servisSonucSenaryosu(vt: Veritabani, q: URLSearchParams): {
  sonuc: Record<string, unknown> & { id: string; servisId: string; baslik: string; durum: string; dosyalar: DogrulananDosyaOzeti[] };
};
/** Saklanan doğrulanan dosya (ham; tarayıcı indirir, sunucu diske yazmaz). */
export declare function servisSonucDosyasi(vt: Veritabani, q: URLSearchParams): { dosya: { ad: string; icerikTuru: string; icerikBase64: string } };
export declare const SERVIS_SONUC_UCLARI: Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>;
/** Servis koşu kaydının gösterimi: istekte adı gizli alanların değeri maskeli (kayıt değişmez). */
export declare function servisKosusuGosterimi<K extends { sonuc?: unknown }>(kosu: K, ekler: ReadonlyArray<string>): K;
/** Servis / akış koşusunun özeti (sonuç sayfası; satır kimlikleri dönmez). */
export interface ServisKosuOzeti {
  id: string; tur: 'servis' | 'akis'; kaynakId: string | null; baslik: string; ortamId: string | null; ortam: string; calistirma: 'kosu' | 'dene';
  baslangic: string; bitis: string; sureMs: number; toplam: number; basarili: number; basarisiz: number; hata: number; atlanan: number; durduruldu: number;
}
/** Her kaynağın (servis / akış) son koşusunun toplamı. */
export interface SonDurum {
  basarili: number; basarisiz: number; hata: number; atlanan: number; durduruldu: number; toplam: number; sureMs: number;
  kaynak: number; basarisizKaynak: number; servis: number; akis: number;
}
export declare function sonDurumOzeti(kosular: ReadonlyArray<ServisKosuOzeti>): { simdi: SonDurum | null; onceki: SonDurum | null; seri: SonDurum[] };
export declare function servisSonucOzeti(vt: Veritabani, q: URLSearchParams): {
  sonDurum: { simdi: SonDurum | null; onceki: SonDurum | null; seri: SonDurum[] };
  kosular: ServisKosuOzeti[];
  servisler: Array<{ id: string; ad: string; son: Record<string, unknown> | null }>;
  akislar: Array<{ id: string; baslik: string; son: Record<string, unknown> | null }>;
} & Record<string, unknown>;
