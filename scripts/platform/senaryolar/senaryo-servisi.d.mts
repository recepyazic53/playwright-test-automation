// scripts/platform/senaryolar/senaryo-servisi.mjs için tip bildirimi (birim testleri import eder).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DepoHatasi } from '../veritabani/depo.mjs';
import type { AktarimAdaptoru } from '../../../projeler/index.d.mts';

export type Bulgu = { alan: string; mesaj: string };

export declare const DENEME_BASLIK_ON_EKI: string;
export declare const BASLIK_EN_UZUN: number;
export declare class SenaryoDogrulamaHatasi extends DepoHatasi {
  constructor(mesaj: string, hatalar: Bulgu[], uyarilar?: Bulgu[]);
  hatalar: Bulgu[];
  uyarilar: Bulgu[];
}
export declare class SenaryoCakismaHatasi extends DepoHatasi {
  constructor(mesaj: string);
}

export declare function senaryoKaynagi(icerik: unknown): { dosya: string; ad: string } | null;
export declare function senaryoKaynakAnahtari(icerik: unknown): string | null;
export declare function veriGudumluMu(icerik: unknown): boolean;
export declare function ortamAnahtariBul(vt: Veritabani, projeId: string, ortamId: string): string | null;
export declare function modelBaglami(vt: Veritabani, ekranId: string): { model: Record<string, unknown>; altModeller: Record<string, Record<string, unknown>>; surum: number } | null;
export declare function ekranVeriKaynagi(
  vt: Veritabani, projeId: string, ekran: { id: string; anahtar: string }, adaptor: AktarimAdaptoru | null | undefined
): { spec: string; dosya: string; yol: string } | null;

export interface SenaryoSatiri {
  id: string; baslik: string; ekranId: string | null; ekranAdi: string | null; kosuyaDahil: boolean; veriGudumlu: boolean;
  modelVar: boolean; kaynak: { dosya: string; ad: string } | null;
  baglamProfili: { deger: string | null; varsayilan: boolean; ad: string | null } | null;
  beklenenSonuc: { tur: 'basari' | 'hata'; metin: string; aciklama: string } | null;
  sonSonuc: { durum: string; zaman: string; sonucId: string; kosuId: string } | null;
  mutlakaGorunmeliSayisi: number;
  /** Sayfa paketindeki bir öneriden eklendi mi (icerik.paket). */
  paketten: boolean;
  guncellenme: string;
}
export declare function senaryoListesi(vt: Veritabani, projeId: string, ortamId: string, adaptor?: AktarimAdaptoru | null): {
  ekranlar: Array<{ id: string; anahtar: string; ad: string; senaryoSayisi: number; modelVar: boolean; olusturulabilir: boolean }>;
  senaryolar: SenaryoSatiri[];
};
export declare function senaryoDetayi(vt: Veritabani, id: string, ortamId: string | null): {
  id: string; projeId: string; ekranId: string | null; baslik: string; kosuyaDahil: boolean; veriGudumlu: boolean;
  kaynak: { dosya: string; ad: string } | null; ortamlar: string[]; veri: Record<string, unknown> | null; mutlakaGorunmeli: string[];
  olusturulma: string; guncellenme: string;
};
export declare function formBaglami(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, adaptor: AktarimAdaptoru | null | undefined): {
  ekran: { id: string; anahtar: string; ad: string };
  ortamlar: Array<{ id: string; ad: string; varsayilan: boolean }>;
  model: Record<string, unknown> | null;
  altModeller: Record<string, Record<string, unknown>>;
  modelSurumu?: number;
  profiller: Record<string, Array<{ ad: string; tur: 'baglam' | 'testVerisi'; kapsam: 'tum' | 'ortam'; alanlar: Array<{ etiket: string; deger?: string; dolu: boolean }> }>>;
  ortak: Record<string, unknown> | null;
  veriKaynagi: { spec: string; dosya: string; yol: string } | null;
  olusturulabilir: boolean;
};
export declare function senaryoKaydet(
  vt: Veritabani,
  girdi: {
    id?: string | null; projeId: string; ekranId?: string | null; baslik: unknown; veri?: unknown; ortamIdleri?: unknown;
    kosuyaDahil?: unknown; mutlakaGorunmeli?: unknown; yapan?: string;
  },
  secenekler?: { adaptor?: AktarimAdaptoru | null; kosuyorMu?: (dosya: string, ad: string) => boolean }
): { id: string; uyarilar: Bulgu[] };
export declare function kosuyaDahilAyarla(vt: Veritabani, projeId: string, idler: unknown, dahil: boolean, yapan?: string): { degisen: number };
export declare function senaryolariSil(
  vt: Veritabani, projeId: string, idler: unknown, secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean; yapan?: string }
): { silinen: number };
export declare function senaryoKopyala(vt: Veritabani, projeId: string, id: string, yapan?: string): { id: string; baslik: string };
export declare function senaryoGecmisi(vt: Veritabani, id: string): Array<{
  id: string; zaman: string; islem: string; yapan: string; makineId: string | null; aciklama: string | null; baslik: string; degisenler: string[];
}>;
export declare function calistirmaHedefiCoz(vt: Veritabani, projeId: string, senaryoId: unknown, ortamId: unknown): {
  senaryoId: string; baslik: string; dosya: string; ad: string; ortamAnahtari: string; ekranId: string | null;
};
export declare function denemePaketiOlustur(
  vt: Veritabani,
  girdi: { projeId: string; ekranId: string; ortamId: string; veri: unknown; id?: string | null },
  secenekler: { adaptor?: AktarimAdaptoru | null; geciciEk: string }
): {
  ortamAnahtari: string; spec: string; geciciBaslik: string; uyarilar: Bulgu[];
  ekVeri: { ortam: string; ekVeriler: Array<{ dosya: string; yol: string[]; ogeler: unknown[] }> };
};
