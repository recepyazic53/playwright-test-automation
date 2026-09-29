// scripts/platform/ayarlar/baslarken.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export type BaslarkenIsaretleri = { gizli: boolean; girisGerekmez: boolean; denendi: boolean; incelendi: boolean };
export type AdimDurumu = 'tamam' | 'siradaki' | 'bekliyor';
export type BaslarkenAdimi = {
  anahtar: 'ortam' | 'giris' | 'ekran' | 'senaryo' | 'dene' | 'kosu' | 'sonuc';
  baslik: string; aciklama: string; eylem: string; adres: string; durum: AdimDurumu; atlanabilir?: boolean; atlandi?: boolean;
};
export type BaslarkenDurumu = { gizli: boolean; tamam: boolean; tamamlanan: number; toplam: number; adimlar: BaslarkenAdimi[] };

export declare const BASLARKEN_AYAR_ANAHTARI: 'baslarken';
export declare const BASLARKEN_ISARETLERI: readonly ['gizli', 'girisGerekmez', 'denendi', 'incelendi'];
export declare function baslarkenIsaretleri(vt: Veritabani, projeId: string): BaslarkenIsaretleri;
export declare function baslarkenIsaretle(vt: Veritabani, projeId: string, girdi: unknown): BaslarkenIsaretleri;
export declare function baslarkenDurumu(vt: Veritabani, projeId: string): BaslarkenDurumu;
