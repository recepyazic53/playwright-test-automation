// scripts/platform/aktarim/motor.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { IkiAsamaliTur, Proje, TestVerisiDegeri } from '../veritabani/depo.mjs';

/** Adaptörün motora verdiği nötr plan. "anahtar" = varlık türü içinde tekil kaynak anahtarı. */
export interface AktarimPaketi {
  surum: 1;
  adaptor: string;
  proje: { ad: string; aciklama?: string | null };
  /** proje.ayarlar.aktarim altına AÇIK yazılır — gizli değer içermemeli. */
  projeAyarlari?: Record<string, unknown>;
  /** proje.ayarlar.aktarim.gizliOzetler altına kasa zarfı olarak yazılır. */
  gizliOzetler?: Record<string, string | Record<string, string>>;
  ortamlar: Array<{ anahtar: string; ad: string; tabanUrl: string; varsayilan?: boolean; ayarlar?: Record<string, unknown> }>;
  girisProfilleri: Array<{
    anahtar: string; ortam: string | null; ad: string; kullaniciAdi: string; parola?: string | null;
    ikiAsamaliTur?: IkiAsamaliTur; totpGizli?: string | null; smsAyari?: Record<string, unknown>;
  }>;
  baglamProfilleri: Array<{ anahtar: string; ortam: string | null; tur: string; ad: string; alanlar: Record<string, unknown> }>;
  testVerisiTurleri: Array<{ anahtar: string; ad: string; alanlar: Array<{ ad: string; etiket?: string; tip?: string; hassas?: boolean }> }>;
  /** tur = test verisi türünün kaynak anahtarı. */
  testVerisiProfilleri: Array<{ anahtar: string; tur: string; ortam: string | null; ad: string; degerler: Record<string, TestVerisiDegeri> }>;
  /** ayarlar içindeki üst düzey "ortamlar" haritasının anahtarları ortam anahtarıdır (motor kimliğe çevirir). */
  ekranlar: Array<{ anahtar: string; ekranAnahtari: string; ad: string; aciklama?: string | null; ayarlar?: Record<string, unknown>; model?: Record<string, unknown> }>;
  /** ekran = ekranın kaynak anahtarı; icerik.ortamlar anahtarları ortam anahtarıdır. */
  senaryolar: Array<{ anahtar: string; ekran: string | null; baslik: string; kosuyaDahil: boolean; icerik: Record<string, unknown> }>;
  /** Senaryo içeriğinde ayrıca şifrelenecek alan adları (türlerdeki hassas alanlara ek). */
  ekHassasAlanAdlari?: string[];
  uyarilar: string[];
}

export interface AktarimSayimi {
  etiket: string; toplam: number; yeni: number; guncellenecek: number; ayni: number;
  silinmisAtlanacak: number; kaldirilacak: number; kaynaktaYok: number;
}
export interface AktarimOnizlemesi {
  adaptor: string;
  proje: { ad: string; mevcut: boolean };
  sayimlar: Record<string, AktarimSayimi>;
  kosudanHaricSenaryo: number;
  uyarilar: string[];
}
export interface AktarimSonucu {
  projeId: string;
  sayimlar: Record<string, AktarimSayimi>;
  atlananlar: Record<string, string[]>;
  kaldirilanlar: string[];
  kaynaktaYok: string[];
  uyarilar: string[];
}

export declare const PAKET_SURUMU: 1;
export declare const KULLANICI_ORTAM_AYARLARI: readonly string[];
export declare const VARLIK_TURLERI: ReadonlyArray<{ tur: string; etiket: string; silinebilir: boolean }>;
export declare class AktarimHatasi extends Error {
  constructor(mesaj: string);
}
export declare function kararliKimlik(...parcalar: string[]): string;
export declare function kanonik(d: unknown): unknown;
export declare function ogeOzeti(oge: unknown): string;
export declare function icerikOzeti(icerik: string | Buffer): string;
export declare function adliAlanlariDonustur(deger: unknown, adlar: ReadonlySet<string>, donustur: (metin: string) => string): unknown;
export declare function zarflariCoz(vt: Veritabani, deger: unknown): unknown;
export declare function aktarilmisProjeyiBul(vt: Veritabani, adaptorAdi: string): Proje | undefined;
export declare function ortamKimligiBul(vt: Veritabani, projeId: string, ortamAnahtari: string): string | undefined;
export declare function aktarimiOnizle(vt: Veritabani | null, paket: AktarimPaketi): AktarimOnizlemesi;
export declare function aktarimiUygula(vt: Veritabani, paket: AktarimPaketi, secenekler?: { yapan?: string }): AktarimSonucu;
export declare function hassasAlanlariTamamla(vt: Veritabani, projeId: string, hassasAdlar: ReadonlySet<string>): number;
