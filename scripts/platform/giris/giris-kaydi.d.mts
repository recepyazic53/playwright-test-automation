// scripts/platform/giris/giris-kaydi.mjs için tip bildirimi.
import type { AkisEnvanteri } from '../tarama/akis-tasarimi.mjs';
import type { GirisTarifi } from './tarif.mjs';

export type AlanRolu = 'kullaniciAdi' | 'parola' | 'kod' | 'ek' | 'yoksay';
export type DugmeRolu = 'gonder' | 'tikla' | 'kodGonder' | 'yoksay';

/** Kayıttan çıkan adım (değer YOK): dokunulan alan ya da basılan düğme; oneri başlangıç seçimidir. */
export type TaslakAdimi =
  | { tur: 'alan'; anahtar: string; etiket: string; alanTuru: string; secici: string; oneri: AlanRolu }
  | { tur: 'dugme'; sira: number; metin: string; secici: string; oneri: DugmeRolu };

export type GirisTaslagi = { adimlar: TaslakAdimi[]; ilkYol: string | null; sonYol: string | null };

/** isaretler[i]: rol (alan/düğme rolü), ek alanda ad + gizli. */
export type TaslakIsareti = { rol: AlanRolu | DugmeRolu; ad?: string; gizli?: boolean };

export type KayittanTarifSonucu = {
  /** Ham (doğrulanmamış) tarif; kaydedilmez. */
  tarif: Record<string, unknown>;
  /** Giriş profiline eklenmesi gereken ek alanlar (değer yok). */
  ekAlanlar: Array<{ ad: string; gizli: boolean; etiket: string }>;
  hatalar: string[];
  notlar: string[];
};

export declare const ALAN_ROLLERI: readonly AlanRolu[];
export declare const DUGME_ROLLERI: readonly DugmeRolu[];
export declare function ekAlanAdiOner(etiket: string): string;
export declare function girisKaydiTaslagi(env: AkisEnvanteri): GirisTaslagi;
export declare function kayittanTarif(taslak: GirisTaslagi, isaretler: unknown, mevcut: GirisTarifi | null, girisYolu: string | null): KayittanTarifSonucu;
