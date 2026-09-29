// scripts/platform/giris/giris-kaydi.mjs için tip bildirimi.
import type { AkisEnvanteri } from '../tarama/akis-tasarimi.mjs';
import type { GirisTarifi } from './tarif.mjs';

export type AlanRolu = 'kullaniciAdi' | 'parola' | 'kod' | 'ek' | 'yoksay';
export type DugmeRolu = 'gonder' | 'tikla' | 'kodGonder' | 'yoksay';

/** Kayıttan çıkan adım (değer YOK): dokunulan alan ya da basılan düğme; oneri başlangıç seçimidir. */
export type TaslakAdimi =
  | { tur: 'alan'; anahtar: string; etiket: string; alanTuru: string; secici: string; oneri: AlanRolu }
  | { tur: 'dugme'; sira: number; metin: string; secici: string; oneri: DugmeRolu };

export type GirisTaslagi = {
  adimlar: TaslakAdimi[]; ilkYol: string | null; sonYol: string | null;
  /** Bitir anındaki sayfa (yol + görünen çıkış yazısı); eski kayıtlarda yok. */
  sonSayfa?: { yol: string; cikisMetni: string | null } | null;
};

export type KodKaynagi = 'totp' | 'sabit' | 'elle';
/** Onay ekranındaki seçimler. */
export type KayitSecimleri = {
  kodKaynagi?: KodKaynagi; basariMetni?: string;
  /** Girişten sonraki sayfadan gelen önerileri kullanıcı onayladı mı (gönderilmezse yalnız yeni tarifte kullanılır). */
  oturumOnerisi?: boolean; basariOnerisi?: boolean;
};

/** Girişten sonra açılan sayfadan öneriler (yalnız mevcut değerden farklıysa; kabul: tarife yazıldı mı). */
export type SayfaOnerileri = {
  oturumKontrolAdresi: { adres: string; mevcut: string | null; kabul: boolean } | null;
  basariGostergesi: { gosterge: { tur: 'metin'; deger: string }; mevcut: GirisTarifi['basariGostergesi'] | null; kabul: boolean } | null;
};

/** isaretler[i]: rol (alan/düğme rolü), ek alanda ad + gizli. */
export type TaslakIsareti = { rol: AlanRolu | DugmeRolu; ad?: string; gizli?: boolean };

export type KayittanTarifSonucu = {
  /** Ham (doğrulanmamış) tarif; kaydedilmez. */
  tarif: Record<string, unknown>;
  /** Giriş profiline eklenmesi gereken ek alanlar (değer yok). */
  ekAlanlar: Array<{ ad: string; gizli: boolean; etiket: string }>;
  hatalar: string[];
  notlar: string[];
  sayfaOnerileri: SayfaOnerileri;
};

export declare const ALAN_ROLLERI: readonly AlanRolu[];
export declare const DUGME_ROLLERI: readonly DugmeRolu[];
export declare const KOD_KAYNAKLARI: readonly KodKaynagi[];
export declare function ekAlanAdiOner(etiket: string): string;
export declare function girisKaydiTaslagi(env: AkisEnvanteri): GirisTaslagi;
export declare function kayittanTarif(taslak: GirisTaslagi, isaretler: unknown, mevcut: GirisTarifi | null, girisYolu: string | null, secimler?: unknown): KayittanTarifSonucu;
