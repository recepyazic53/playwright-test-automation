// scripts/platform/entegrasyonlar/depo.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface BaglantiDurumu { sonuc: 'bagli' | 'hata'; zaman: string; mesaj: string }
export interface Baglanti {
  id: string; projeId: string; tur: string; ad: string; etkin: boolean; alanlar: Record<string, unknown>; olaylar: string[]; ortamIdleri: string[];
  durum: BaglantiDurumu | null; olusturulma: string; guncellenme: string;
}
export interface BaglantiGorunumu extends Baglanti { turAdi: string }
export declare const ENTEGRASYON_AYAR_ANAHTARI: 'entegrasyonlar';
export declare const EN_COK_BAGLANTI: number;
export declare function tumBaglantilar(vt: Veritabani): Baglanti[];
export declare function baglantiGetir(vt: Veritabani, id: string, projeId?: string): Baglanti;
export declare function baglantiGorunumu(b: Baglanti): BaglantiGorunumu;
export declare function baglantilariListele(vt: Veritabani, projeId: string): BaglantiGorunumu[];
export declare function alanlariHazirla(tur: string, girdi: unknown, mevcut?: Record<string, unknown>): Record<string, unknown>;
export declare function baglantiKaydet(vt: Veritabani, projeId: string, girdi: unknown): BaglantiGorunumu;
export declare function baglantiEtkinlestir(vt: Veritabani, projeId: string, id: string, etkin: boolean): BaglantiGorunumu;
export declare function baglantiSil(vt: Veritabani, projeId: string, id: string): boolean;
export declare function durumYaz(vt: Veritabani, id: string, s: { basarili: boolean; mesaj: string }): BaglantiDurumu | null;
