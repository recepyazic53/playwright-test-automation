// scripts/platform/tablolar/tablo-birlestirme.mjs için tip bildirimi (tablo birleştirme, yeniden eşleme, kuru doğrulama, geri alma, veri sağlığı).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Basvuru } from './tablo-secimi.mjs';

export interface AdEslemi { yeniAd: string; sutunlar: Map<string, string> }
export declare const MASKE: string;
export declare function metindekiBasvurular(metin: string): Basvuru[];
export declare function metniYenidenYaz(metin: string, eslem: Map<string, AdEslemi>): string;
export declare function derinYenidenYaz(v: unknown, eslem: Map<string, AdEslemi>): unknown;
export declare function secimleriYenidenYaz(secimler: Record<string, Record<string, string>>, idEslem: Map<string, { hedefId: string; sutunlar: Map<string, string> }>):
  { secimler: Record<string, Record<string, string>>; degisti: boolean; cakisma: string };
export interface Kullanim { ekranBaglari: number; servisBaglari: number; senaryoBasvurulari: number; satirSecimleri: number; hesapKurallari: number; toplam: number }
export interface KirikBasvuru { tur: string; yer: string; basvuru: string; neden: string; git: string }
export declare function tabloKullanimlari(vt: Veritabani, projeId: string): { kullanim: Record<string, Kullanim>; kirik: KirikBasvuru[] };
export interface VeriSagligi {
  /** Veri > "Birleştirme önerisi eşiği" (varsayılan 50): altındaki öneriler arayüzde varsayılan gizli. */
  benzerlikEsigi: number;
  benzer: Array<{ tablolar: string[]; adlar: string[]; grup: 'birebir' | 'cogu' | 'veriFarkli'; puan: number; tur: 'liste' | 'kayit'; eslemeGerekli: boolean }>;
  kullanilmayan: Array<{ id: string; ad: string; tur: 'liste' | 'kayit' }>;
  bosSutunlar: Array<{ tabloId: string; tablo: string; sutun: string }>;
  kirikBasvurular: KirikBasvuru[];
  kullanim: Record<string, Kullanim>;
  /** Birleştirme geçmişi sayıları (liste: birlestirmeGecmisi). */
  birlestirmeGecmisi: { toplam: number; etkin: number };
}
export declare function veriSagligi(vt: Veritabani, projeId: string): VeriSagligi;
export interface BirlestirmeGirdisi {
  kalanId: string; kaynakIdler: string[]; yeniAd?: string; sutunEslemeleri?: Record<string, Record<string, string>>;
  satirSecimleri?: Record<string, 'kalan' | 'kaynak' | 'ikisi'>; karsilikSecimleri?: Record<string, 'kalan' | 'kaynak'>;
}
export interface Fark { tur: 'ekran' | 'servis'; kaynakId: string; kaynakAdi: string; senaryoId: string; baslik: string; ortam: string; alanlar: string[]; neden: string }
export interface BirlestirmeOnizlemesi {
  kalan: { id: string; ad: string; yeniAd: string };
  tablolar: Array<{ id: string; ad: string; sutunSayisi: number; satirSayisi: number; kullanim: Kullanim | null }>;
  onerilenKalan: string;
  /** not: biri gizli biri açık iki sütun eşleşti — birleşik sütun gizli ("Bu sütun gizli olacak (kaynakta gizliydi)"). */
  sutunlar: Array<{ ad: string; gizli: boolean; yeni: boolean; not?: string }>;
  eslemeler: Array<{ kaynakId: string; kaynakTablo: string; kaynak: string; hedef: string | null; kesin: boolean; onerilen: string | null; gizli: boolean }>;
  onayBekleyenEslemeler: Array<{ kaynakId: string; kaynak: string }>;
  satirlar: { kalan: number; eklenecek: number; ayni: number; cakisan: number; toplam: number; ortamaOzel: number };
  satirCakismalari: Array<{ anahtar: string; kaynakTablo: string; satir: string; ortam: string | null; secim: 'kalan' | 'kaynak' | 'ikisi';
    sutunlar: Array<{ sutun: string; gizli: boolean; ayni: boolean; kalan: string; kaynak: string }> }>;
  karsilikCakismalari: Array<{ anahtar: string; sutun: string; deger: string; kaynakTablo: string; kalan: { sayfa?: string; servis?: string }; kaynak: { sayfa?: string; servis?: string }; secim: 'kalan' | 'kaynak' }>;
  yenidenEsleme: Record<'ekranBaglari' | 'servisBaglari' | 'ekranSenaryolari' | 'servisSenaryolari' | 'satirSecimleri' | 'hesapKurallari' | 'varsayilanlar' | 'akislar' | 'sabitlenen', number>;
  ekranlar: string[]; senaryolar: Array<{ tur: string; ad: string }>; servisler: string[]; kaynaklarSilinmez: string[];
  engeller: string[]; farklar: Fark[]; dogrulandi: boolean; imza?: string;
}
export declare function tablolariBirlestir(vt: Veritabani, projeId: string, girdi: BirlestirmeGirdisi & { kip?: unknown; beklenenImza?: unknown; yapan?: string; yedek?: string | null },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean; simdi?: Date }):
  { onizleme: BirlestirmeOnizlemesi; uygulandi?: true; yapilmadi?: true; onayGerekli?: true; farkli?: true; birlestirmeId?: string };
export interface BirlestirmeGecmisiSatiri {
  id: string; zaman: string; kalan: string; eskiAd: string | null; kaynaklar: string[];
  eklenenSatir: number | null; bag: number | null; senaryo: number | null;
  kaynaklarSilindi: boolean; yedek: string | null; durum: 'etkin' | 'geriAlindi'; geriAlinmaZamani: string | null;
  geriAlinabilir: boolean; neden: string; engelleyen: string | null; degisenler: string[];
  kaynaklariSilinebilir: boolean; kaynakNedeni: string;
}
export declare function birlestirmeGecmisi(vt: Veritabani, projeId: string): { kayitlar: BirlestirmeGecmisiSatiri[] };
export declare function birlestirmeyiGeriAl(vt: Veritabani, projeId: string, girdi: { birlestirmeId?: unknown; onay?: boolean; yapan?: string }): Record<string, unknown>;
export declare function kaynaklariSil(vt: Veritabani, projeId: string, girdi: { birlestirmeId?: unknown; onay?: boolean; yapan?: string }): Record<string, unknown>;
