// scripts/platform/zamanlama/zamanlayici.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Kural, TetiklemeOzeti } from './kurallar.mjs';

export interface YurutmeBagimliliklari {
  /** Ortamdaki senaryolar (senaryo-servisi.mjs > senaryoListesi(...).senaryolar ile aynı alanlar). */
  senaryolar(vt: Veritabani, projeId: string, ortamId: string): Array<{ id: string; baslik: string; ekranId: string | null; kosuyaDahil: boolean; ekranEtkin?: boolean }>;
  /** Tek senaryoyu koşar ve bitmesini bekler (sunucuda: senaryoCalistir(vt, govde, kosucu, ...)). */
  senaryoCalistir(vt: Veritabani, govde: Record<string, unknown>): Promise<{ httpDurum?: number; govde: Record<string, unknown> }>;
  /** Servis akışını koşar (sunucuda: servisAkisiCalistir). */
  servisAkisiCalistir?(vt: Veritabani, projeId: string, girdi: { akisId: string; ortamId: string; tur: 'kosu' }): Promise<{ kosuId?: string | null; durum: string }>;
  /** Uçtan uca akışı koşar (sunucuda: akislar/uctan-uca.mjs > uctanUcaCalistir; ön denetim sorunu hata fırlatır). */
  uctanUcaCalistir?(vt: Veritabani, projeId: string, girdi: { akisId: string; ortamId: string }): Promise<{ kosuId?: string | null; durum: string }>;
  /** Koşu bitince seçilen bağlantıya bildirim (sunucuda: kosuBittiBildir(vt, kosuId, { baglantiIdleri })). */
  bildir?(vt: Veritabani, kosuId: string, baglantiIdleri: string[]): Promise<unknown>;
  /** false dönerse kalan senaryolar başlatılmaz (kasa kilitlendi / çalışma alanı değişti). */
  devamMi?(): boolean;
}
export interface YurutmeSonucu {
  durum: 'tamamlandi' | 'basarisiz' | 'yarida' | 'atlandi';
  mesaj: string;
  kosuId: string | null;
  ozet: TetiklemeOzeti | null;
  akisKosulari: Array<{ akisId: string; kosuId: string | null; durum: string; uctanUca?: boolean }>;
}
export interface ZamanlayiciBagimliliklari {
  /** Kasa AÇIKSA etkin veritabanı; değilse null (zamanlayıcı hiçbir şey yapmaz). */
  veritabani(): Veritabani | null;
  /** Başka bir koşu (kuyrukta bekleyen dahil) sürüyor mu? */
  mesgulMu(): boolean;
  /** Kuralın koşusu (sunucuda zamanliKosuyuYurut; testlerde sahte). */
  yurut(vt: Veritabani, kural: Kural, kosuKimligi: string, devamMi: () => boolean): Promise<YurutmeSonucu>;
  simdi?(): Date;
  log?(mesaj: string): void;
  /**
   * Kasa kilitliyken anahtar emanetteyse (kullanıcı tercihi) arka plan işini başlatır: anahtar arayüz kilitli kalarak
   * yerleştirilir; dönen fonksiyon denetim ve başlatılan koşular bitince çağrılır. Anahtar yoksa null.
   */
  arkaPlanIsi?(): (() => void) | null;
  /**
   * Kullanıcının kararları (Ayarlar > Koşu > Zamanlanmış koşu davranışı): kaçan zaman ('atla' | 'sonraKos') ve koşu sürerken gelen
   * zaman ('atla' | 'bitinceKos'). Verilmezse ikisi de 'atla' (önceki davranış).
   */
  davranis?(vt: Veritabani): { kacan: string; cakisma: string };
}

export declare const KONTROL_ARALIGI_MS: number;
export declare const ATLANDI_MESAJI: string;
export declare function zamanliKosuyuYurut(vt: Veritabani, kural: Kural, kosuKimligi: string, bag: YurutmeBagimliliklari): Promise<YurutmeSonucu>;
export declare function zamanlayiciOlustur(bag: ZamanlayiciBagimliliklari): {
  kontrolEt(): Promise<Array<Promise<void>>>;
  suren(): { kuralId: string; ad: string } | null;
  baslat(): void;
  durdur(): void;
};
