// scripts/platform/tarama/oge-isaretleri.mjs için tip bildirimi ("Sayfada seç" ve "Düğmeyi ve sonucu işaretle").
import type { HamAlan, Kirilganlik } from './paket-olusturucu.mjs';

export type SecilenOgeTuru = 'dugme' | 'sonuc' | 'alan' | 'basari' | 'hata';
export type SeciciTuru = 'rol' | 'metin' | 'kimlik' | 'etiket' | 'css';

/**
 * Sayfada seçilen öğe (DEĞER yoktur): tür, Nöbetçi'nin ürettiği seçici (rol ve metin → kimlik ve etiket → CSS), görünen yazısı
 * (düğmenin / sonucun metni; form alanında etiketi). alan: bir form alanı seçildiyse yapısı (sayfa envanteri biçimi); form alanı
 * olmayan bir öğe "alan" diye seçildiyse alanTuru (text, number…).
 */
export type SecilenOge = {
  tur: SecilenOgeTuru;
  secici: string;
  kirilganlik: Kirilganlik;
  seciciTuru: SeciciTuru;
  metin: string | null;
  cerceve?: string[];
  adaySeciciler?: string[];
  alan?: HamAlan;
  alanTuru?: string;
};

/** "Sayfada seç" işinin (girdi.kip = 'ogeSecme') sonucu. */
export type OgeSecmeSonucu = { kip: 'ogeSecme'; ogeler: SecilenOge[]; notlar: string[] };

/** Keşfin modele yazdığı bulgu (önizlemede onaya sunulur). */
export type KesifBulgusu = { anahtar: string; tur: 'gorunurluk' | 'bagimlilik'; alanId: string; etiket: string; aciklama: string };

export type IsaretOzeti = { dugme: number; sonuc: number; alan: number; basari: number; hata: number; reddedilen: number };

export declare const OGE_TURLERI: readonly SecilenOgeTuru[];
export declare const OGE_TUR_ADLARI: Readonly<Record<SecilenOgeTuru, string>>;
export declare const OGE_EN_COK: number;
export declare const SECICI_TURLERI: readonly SeciciTuru[];
export declare const ALAN_TURLERI: readonly string[];
export declare function secilenOgeleriAyikla(ham: unknown, izinliTurler?: readonly string[]): { ogeler: SecilenOge[]; hatalar: string[] };
export declare function kesifBulgulari(model: Record<string, unknown>): KesifBulgusu[];
export declare function taramaIsaretleriniUygula(paket: Record<string, unknown>, g: { ogeler: SecilenOge[]; reddedilenler?: string[] }): {
  paket: Record<string, unknown>; ozet: IsaretOzeti;
};
