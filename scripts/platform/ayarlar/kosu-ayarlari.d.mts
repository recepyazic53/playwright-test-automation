// scripts/platform/ayarlar/kosu-ayarlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface KosuAyarTanimi {
  anahtar: string; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin'; varsayilan: string | number;
  secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number;
}
export interface KosuAyarlari {
  video: string; ekranGoruntusu: string; iz: string; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
  zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; tarihBicimi: string;
}
export declare const KOSU_AYAR_ANAHTARI: string;
export declare const KOSU_AYAR_TANIMLARI: ReadonlyArray<KosuAyarTanimi>;
export declare function varsayilanKosuAyarlari(): KosuAyarlari;
export declare function kosuAyarlariniOku(vt: Veritabani): KosuAyarlari;
export declare function kosuAyarlariniKaydet(vt: Veritabani, girdi: unknown): KosuAyarlari;
export declare function kosuOrtamDegiskenleri(a: KosuAyarlari): Record<string, string>;
