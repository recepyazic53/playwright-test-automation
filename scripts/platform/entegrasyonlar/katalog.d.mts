// scripts/platform/entegrasyonlar/katalog.mjs için tip bildirimi.
import type { YasakDeseni } from './istek.mjs';
import type { VeritabaniAyari } from './veritabani-suruculeri.mjs';

export interface AlanTanimi {
  ad: string; etiket: string; tur: 'metin' | 'adres' | 'secim' | 'onay' | 'sayi' | 'cok-satir'; gizli?: boolean; zorunlu?: boolean;
  secenekler?: ReadonlyArray<readonly [string, string]>; yardim?: string; varsayilan?: string | number | boolean; enAz?: number; enCok?: number;
  yerTutucu?: string; kapatmaUyarisi?: string;
}
export interface IstekOrtami { yasakDesenleri: ReadonlyArray<YasakDeseni>; zamanAsimiMs: number }
export interface DenemeSonucu { basarili: boolean; mesaj: string }
export interface KosuOzeti {
  proje: string; ortam: string | null; kosuTuru: string; durum: string; toplam: number; basarili: number; kalan: number; atlanan: number;
  basariOrani: number | null; bitis: string | null;
}
export interface Ek { ad: string; tur: string; icerikTuru: string; veri: Buffer }
export interface EntegrasyonTuru {
  tur: string; ad: string; ikon: string; aciklama: string; alanlar: AlanTanimi[]; olaylar: Array<{ ad: string; etiket: string; aciklama: string }>;
  denemeHedefi: (alanlar: Record<string, unknown>) => { adres: string; aciklama: string };
  dene: (alanlar: Record<string, unknown>, ortam: IstekOrtami) => Promise<DenemeSonucu>;
  olayGonder?: (alanlar: Record<string, unknown>, olay: string, veri: unknown, ortam: IstekOrtami) => Promise<DenemeSonucu | null>;
  kayitAc?: (alanlar: Record<string, unknown>, kayit: { baslik: string; aciklama: string; ekler: Ek[] }, ortam: IstekOrtami) => Promise<{ anahtar: string; adres: string | null; ekUyarilari: string[] }>;
}
export declare const ENTEGRASYON_TURLERI: ReadonlyArray<EntegrasyonTuru>;
export declare function turBul(tur: unknown): EntegrasyonTuru | undefined;
export declare function gizliDegerler(t: EntegrasyonTuru, alanlar: Record<string, unknown>): string[];
export declare function kosuBildirimMetni(k: KosuOzeti): string;
export declare function veritabaniAyari(a: Record<string, unknown>): VeritabaniAyari;
export declare function katalogGorunumu(): Array<{
  tur: string; ad: string; ikon: string; aciklama: string; alanlar: AlanTanimi[]; olaylar: Array<{ ad: string; etiket: string; aciklama: string }>; hataKaydi: boolean; sorgu: boolean;
}>;
