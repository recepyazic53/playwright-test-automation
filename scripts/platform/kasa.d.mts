// scripts/platform/kasa.mjs için tip bildirimi.
import type { Veritabani } from './veritabani/baglanti.mjs';

export type KasaHataKodu = 'PAROLA_KISA' | 'PAROLA_YANLIS' | 'KASA_KILITLI' | 'KASA_YOK' | 'KASA_VAR' | 'ZARF_BOZUK';
export declare class KasaHatasi extends Error {
  constructor(kod: KasaHataKodu, mesaj: string);
  readonly kod: KasaHataKodu;
}
export interface ScryptMaliyeti { N: number; r: number; p: number }
export interface KdfParametreleri extends ScryptMaliyeti { alg: 'scrypt'; tuz: string }
export interface KasaDurumu {
  olusturuldu: boolean;
  acik: boolean;
  minParolaUzunlugu: number;
  kdf: { alg: 'scrypt'; N: number; r: number; p: number } | null;
}

export declare const MIN_PAROLA_UZUNLUGU: number;
export declare const ZARF_ON_EKI: string;
export declare const ZARF_DESENI: RegExp;
export declare const VARSAYILAN_KDF: Readonly<ScryptMaliyeti>;
export declare const HASSAS_SUTUNLAR: Readonly<Record<string, readonly string[]>>;

export declare function parolaKontrolEt(parola: unknown): void;
export declare function anahtarTuret(parola: string, kdf: ScryptMaliyeti, tuz: Buffer): Promise<Buffer>;
export declare function zarfSifrele(anahtar: Buffer, duzMetin: string): string;
export declare function zarfCoz(anahtar: Buffer, zarf: string): string;
export declare function zarfMi(deger: unknown): deger is string;
export declare function metindekiZarflariDonustur(metin: string, donustur: (zarf: string) => string): string;
export declare function kasaKdfOku(vt: Veritabani): KdfParametreleri | undefined;
export declare function kasaDurumu(vt: Veritabani): KasaDurumu;
export declare function kasaAcikMi(vt: Veritabani): boolean;
export declare function kasaOlustur(vt: Veritabani, parola: string, secenekler?: { kdf?: ScryptMaliyeti }): Promise<KasaDurumu>;
export declare function parolayiDogrula(vt: Veritabani, parola: string): Promise<Buffer | null>;
export declare function anahtarDogrulayiciyaUyarMi(anahtar: Buffer, dogrulayici: string): boolean;
export declare function kasaAc(vt: Veritabani, parola: string): Promise<KasaDurumu>;
export declare function kasaKilitle(vt: Veritabani): KasaDurumu;
export declare function acikAnahtar(vt: Veritabani): Buffer;
export declare function kasayiAnahtarlaAc(vt: Veritabani, anahtar: Buffer): void;
export declare function sifrele(vt: Veritabani, duzMetin: string): string;
export declare function coz(vt: Veritabani, zarf: string): string;
export declare function tumZarflariDonustur(vt: Veritabani, donustur: (zarf: string) => string): number;
export declare function parolaDegistir(
  vt: Veritabani, eskiParola: string, yeniParola: string, secenekler?: { kdf?: ScryptMaliyeti }
): Promise<KasaDurumu & { yenidenSifrelenen: number }>;
