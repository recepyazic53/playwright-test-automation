// scripts/platform/senaryolar/calistirma.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { CalistirmaHedefi } from './senaryo-servisi.mjs';

export type CalistirmaSecenekleri = { yasakDesenleri?: Array<{ kalip: string; desen: RegExp }> };

/** Koşularda "ortam" alanının değeri (yalnızca log/kuyruk etiketi; ortamın adı değil). */
export declare const GENEL_ORTAM_ETIKETI: 'genel';

export interface KosuIstegi {
  /** Log/kuyruk etiketi (GENEL_ORTAM_ETIKETI). */
  ortam: string;
  /** Koşunun proje ve ortam kimlikleri (playwright.config.ts bunlarla veri okur). */
  genel: { projeId: string; ortamId: string };
  /** Model spec dosyası (testDir'e göre, "/" ayraçlı). */
  dosya: string;
  /** Test başlığı yerine etiket kullanılır (her zaman null). */
  ad: string | null;
  /** Testin etiketi ("@model-<UUID>") ve koşuyu daraltan grep deseni. */
  etiket?: string | null;
  grepDeseni?: string | null;
  kosuId: string;
  kosuTuru?: 'tam' | 'tekil' | null;
  kosuKimligi?: string | null;
  kosuKapsami?: string | null;
  senaryoId?: string;
  /** Uçtan uca akışın ekran adımı: koşu sürecine verilen NOBETCI_AKIS_* değişkenleri (akislar/uctan-uca-cikti.mjs). */
  ekOrtam?: Record<string, string> | null;
}
export interface KosuYaniti {
  /** HTTP durum kodu (varsayılan 200). */
  httpDurum?: number;
  /** { basarili, durum, sureMs, hataMesaji, mesaj, ... } */
  govde: Record<string, unknown>;
}
export interface Kosucu {
  calistir(istek: KosuIstegi): Promise<KosuYaniti>;
  /** "Dene": geçici deneme senaryosu (veri okuyucuya dosyayla) etiketle koşar; veritabanına senaryo yazılmaz. */
  modelDene(istek: {
    ortam: string; dosya: string; kosuId: string; etiket: string; grepDeseni: string; genel: { projeId: string; ortamId: string };
    denemeSenaryosu: Record<string, unknown>;
  }): Promise<KosuYaniti>;
  /** Senaryo o an koşuyor mu (kuyrukta bekleme dahil)? Koşan senaryo düzenlenemez/silinemez. */
  kosuyorMu?(dosya: string, ad: string): boolean;
  /** Şu an (kuyrukta bekleyen dahil) bir koşu sürüyor mu? Çalışma alanı değiştirme / proje silme bunu denetler. */
  mesgulMu?(): boolean;
}

export declare function calistirmaIsteginiHazirla(vt: Veritabani, govde: Record<string, unknown>, secenekler?: CalistirmaSecenekleri): {
  projeId: string; kosuId: string; kosuTuru: 'tam' | 'tekil' | null; kosuKimligi: string | null; kosuKapsami: string | null;
  hedef: CalistirmaHedefi;
};
export declare function senaryoCalistir(
  vt: Veritabani, govde: Record<string, unknown>, kosucu: Kosucu | null, secenekler?: CalistirmaSecenekleri
): Promise<{ httpDurum: number; govde: Record<string, unknown> }>;
export declare function senaryoDene(
  vt: Veritabani, govde: Record<string, unknown>, kosucu: Kosucu | null
): Promise<{ httpDurum: number; govde: Record<string, unknown> }>;
