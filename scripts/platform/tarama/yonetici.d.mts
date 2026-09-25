// scripts/platform/tarama/yonetici.mjs için tip bildirimi.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const IS_SAKLAMA_MS: number;
export declare class TaramaHatasi extends Error {
  readonly kod: string;
  readonly durum: number;
  readonly ek: Record<string, unknown>;
  constructor(kod: string, mesaj: string, durum?: number, ek?: Record<string, unknown>);
}

export type IsDurumu = 'suruyor' | 'tamam' | 'hata' | 'iptal';
export type IsGorunumu = {
  id: string;
  durum: IsDurumu;
  mod: 'yeni' | 'analiz';
  projeId: string;
  ekran: { id: string | null; ad: string; anahtar: string };
  ortam: { id: string; ad: string };
  hedefYol: string;
  kesif: boolean;
  adimlar: Array<{ anahtar: string; etiket: string; durum: string; mesaj: string | null }>;
  profiller: Array<{ ad: string; durum: string; adim: string | null; alanSayisi: number | null; mesaj: string | null }>;
  engellenenSayisi: number;
  engellenenler: Array<{ yontem: string | null; adres: string | null; asama: string | null; neden: string | null; zaman: string }>;
  olaylar: Array<{ zaman: string; mesaj: string }>;
  hata: { kod: string; mesaj: string } | null;
  kodIstegi: { mesaj: string; kalanSn: number } | null;
  baslangic: string;
  bitis: string | null;
  paketHazir: boolean;
  ozet: import('./paket-olusturucu.mjs').PaketOzeti | null;
  uyarilar: Array<{ yer: string; mesaj: string }>;
};

export type TaramaYoneticisi = {
  isler: Map<string, Record<string, unknown>>;
  secenekler(vt: Veritabani, projeId: string, ekranId: string | null, adaptorBul: (vt: Veritabani, projeId: string) => unknown): Record<string, unknown>;
  baslat(vt: Veritabani, govde: Record<string, unknown>, s: { adaptor: unknown; sunucuAdresi: string }): { isId: string };
  durum(id: string): IsGorunumu;
  paket(id: string): { paket: Record<string, unknown>; mod: 'yeni' | 'analiz'; ekran: IsGorunumu['ekran']; ozet: IsGorunumu['ozet'] };
  aktif(): { id: string; ekran: IsGorunumu['ekran']; projeId: string } | null;
  iptal(id: string): { iptal: true };
  kodGonder(id: string, kod: unknown): { iletildi: true };
  girdiVer(id: string, token: string): unknown;
  olayAl(id: string, token: string, olay: Record<string, unknown>): Record<string, unknown>;
  sonucAl(id: string, token: string, sonuc: Record<string, unknown>): Record<string, unknown>;
  kapat(): void;
};

export declare function taramaYoneticisiOlustur(secenekler: {
  projeKoku: string; playwrightCli?: string; zamanAsimiMs?: number; saklamaMs?: number; ortamDegiskenleri?: NodeJS.ProcessEnv; hataAyiklama?: boolean;
}): TaramaYoneticisi;

export type TaramaIstekBaglami = {
  /** Oturum token'ı (POST gövdesindeki "token" ile karşılaştırılır). */
  token: string;
  /** Başlık/sorgu token'ı geçerli mi (GET uçları). */
  disTokenGecerli: boolean;
  jsonGonder: (res: ServerResponse, durum: number, govde: unknown) => void;
  jsonGovde: (sinir?: number) => Promise<Record<string, unknown> | null>;
  acikVeritabani: () => Promise<Veritabani>;
  projeAdaptoru: (vt: Veritabani, projeId: string) => unknown;
  projeKoku: string;
  /** Testler için: varsayılan yerine bu yönetici kullanılır. */
  yonetici?: TaramaYoneticisi;
};

export declare function taramaIsteginiIsle(req: IncomingMessage, res: ServerResponse, b: TaramaIstekBaglami): Promise<boolean>;
export declare function taramalariKapat(): void;
export declare function taramaSuruyorMu(): boolean;
