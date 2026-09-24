// projeler/index.mjs için tip bildirimi: proje aktarım adaptörü sözleşmesi.
import type { Veritabani } from '../scripts/platform/veritabani/baglanti.mjs';
import type { AktarimPaketi } from '../scripts/platform/aktarim/motor.mjs';

export interface EskiGirisBilgisi {
  kullaniciAdi: string;
  parola: string | null;
  totpGizli: string | null;
  sabitKod: string | null;
}
/** yenidenKur çıktısı: testlerin bugün dosyalardan okuduğu şekiller (ortam başına). */
export interface YenidenKurulanVeri {
  ortam: string;
  tabanUrl: string;
  giris: EskiGirisBilgisi | null;
  ortak: Record<string, unknown>;
  dosyalar: Record<string, Record<string, unknown>>;
  /** Eski senaryo anahtarı ("<dosya>::<başlık>") → senaryo UUID. */
  senaryoKimlikleri: Record<string, string>;
}

export interface AktarimAdaptoru {
  readonly ad: string;
  readonly projeAdi: string;
  readonly etiket: string;
  algila(projeKoku: string): { var: boolean; ortamlar: string[] };
  paketOlustur(projeKoku: string, secenekler?: {
    ortamDegiskenleri?: NodeJS.ProcessEnv;
    testListesi?: (ortam: string) => Promise<Array<{ dosya: string; ad: string }>>;
  }): Promise<AktarimPaketi>;
  parmakIzleri(projeKoku: string, ortamDegiskenleri: NodeJS.ProcessEnv): { dosyalar: string; ortamDegiskenleri: Record<string, string> };
  kosuListesiOzeti(projeKoku: string): string;
  kosudanHaricAnahtarlar(vt: Veritabani, projeId: string): string[];
  yenidenKur(vt: Veritabani, projeId: string, ortamAnahtari: string): YenidenKurulanVeri | null;
}

export declare const AKTARIM_ADAPTORLERI: ReadonlyArray<AktarimAdaptoru>;
export declare function adaptorBul(ad: string): AktarimAdaptoru | undefined;
