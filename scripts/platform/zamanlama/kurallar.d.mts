// scripts/platform/zamanlama/kurallar.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Zaman } from './takvim.mjs';

export interface Kural {
  id: string; projeId: string; ad: string; ortamId: string;
  /**
   * senaryolar: 'tum' = tüm "Koşuda" senaryolar (tam koşu), 'ekranlar' = seçili ekranların "Koşuda" senaryoları, 'yok' = yalnız akışlar.
   * uctanUcaAkisIdleri: uçtan uca akışlar (bu alandan önce kaydedilen kurallarda yok = []).
   */
  kapsam: { senaryolar: 'tum' | 'ekranlar' | 'yok'; ekranIdleri: string[]; servisAkisIdleri: string[]; uctanUcaAkisIdleri?: string[] };
  zaman: Zaman; etkin: boolean; bildirimBaglantiId: string | null; canliOnay: boolean;
  /** Bu ana kadarki (dahil) zamanlar tetiklenmez: son tetiklenen zaman ya da kuralın kaydedildiği / etkinleştirildiği an. */
  tuketilen: string;
  olusturulma: string; guncellenme: string;
}
export type TetiklemeDurumu = 'calisiyor' | 'tamamlandi' | 'basarisiz' | 'atlandi' | 'yarida' | 'hata';
export interface TetiklemeOzeti { toplam: number; basarili: number; basarisiz: number; atlanan: number; hata: number }
export interface Tetikleme {
  id: string;
  /** Planlanan çalışma zamanı. */
  zaman: string; baslangic: string; bitis: string | null; durum: TetiklemeDurumu; mesaj: string;
  /** Ekran koşusunun kimliği ("zamanli-…"; Sonuçlar > koşu). Hiç senaryo koşmadıysa null. */
  kosuId: string | null;
  ozet: TetiklemeOzeti | null;
  /** uctanUca: uçtan uca akış koşusu (Sonuçlar > Uçtan uca akışlar); yoksa servis akışı. */
  akisKosulari: Array<{ akisId: string; kosuId: string | null; durum: string; uctanUca?: boolean }>;
}
export interface KuralGorunumu extends Kural {
  zamanMetni: string; ortamAdi: string | null; riskli: boolean; bildirimAdi: string | null;
  sonrakiCalisma: string | null; sonTetikleme: Tetikleme | null; gecmis: Tetikleme[];
}

export declare const KURAL_AYAR_ANAHTARI: 'zamanlanmis-kosular';
export declare const GECMIS_AYAR_ANAHTARI: 'zamanlanmis-kosu-gecmisi';
export declare const GECMIS_SINIRI: number;
export declare const EN_COK_KURAL: number;
export declare function ortamRiskliMi(o: { ad: string; varsayilan: boolean; ayarlar?: Record<string, unknown> }): boolean;
export declare function tumKurallar(vt: Veritabani): Kural[];
export declare function tumGecmis(vt: Veritabani): Record<string, Tetikleme[]>;
export declare function kuralKaydet(vt: Veritabani, projeId: string, girdi: unknown, s?: { simdi?: Date }): Kural;
export declare function kuralEtkinlestir(vt: Veritabani, projeId: string, id: string, etkin: boolean, s?: { simdi?: Date }): Kural;
export declare function kuralSil(vt: Veritabani, projeId: string, id: string): boolean;
export declare function tuketilenYaz(vt: Veritabani, id: string, zaman: string): void;
export declare function tetiklemeYaz(vt: Veritabani, kuralId: string, t: Tetikleme): void;
export declare function kurallariListele(vt: Veritabani, projeId: string, s?: { simdi?: Date }): KuralGorunumu[];
