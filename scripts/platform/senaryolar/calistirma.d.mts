// scripts/platform/senaryolar/calistirma.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { AktarimAdaptoru } from '../../../projeler/index.d.mts';
import type { CalistirmaHedefi, ModelSecenekleri } from './senaryo-servisi.mjs';

export type CalistirmaSecenekleri = ModelSecenekleri & { yasakDesenleri?: Array<{ kalip: string; desen: RegExp }> };

/** Genel yol koşularında "ortam" alanının değeri (yalnızca log/kuyruk etiketi; ortamın adı değil). */
export declare const GENEL_ORTAM_ETIKETI: 'genel';

export interface KosuIstegi {
  /** Test çalıştırıcısının ortam anahtarı (TEST_ENV; ör. "test"); genel yolda GENEL_ORTAM_ETIKETI. */
  ortam: string;
  /**
   * Genel yol (elle oluşturulan proje/ortam; model senaryosu): koşu playwright.model.config.ts ile, proje ve
   * ortam kimlikleriyle yapılır (TEST_ENV kullanılmaz).
   */
  genel?: { projeId: string; ortamId: string } | null;
  /** Playwright spec dosyası (testDir'e göre, "/" ayraçlı). */
  dosya: string;
  /** Güncel test başlığı (veritabanından çözülmüş); model senaryosunda null (etiketle bulunur). */
  ad: string | null;
  /** Model senaryosu: testin etiketi ("@model-<UUID>") ve koşuyu daraltan grep deseni. */
  etiket?: string | null;
  grepDeseni?: string | null;
  kosuId: string;
  kosuTuru?: 'tam' | 'tekil' | null;
  kosuKimligi?: string | null;
  kosuKapsami?: string | null;
  senaryoId?: string;
}
export interface KosuYaniti {
  /** HTTP durum kodu (varsayılan 200). */
  httpDurum?: number;
  /** /calistir ile aynı yanıt gövdesi: { basarili, durum, sureMs, hataMesaji, ekranGoruntusuUrl, videoUrl, mesaj, ... } */
  govde: Record<string, unknown>;
}
export interface Kosucu {
  calistir(istek: KosuIstegi): Promise<KosuYaniti>;
  dene(istek: { ortam: string; dosya: string; ad: string; kosuId: string; ekVeri: Record<string, unknown> }): Promise<KosuYaniti>;
  /** Senaryo o an koşuyor mu (kuyrukta bekleme dahil)? Koşan senaryo düzenlenemez/silinemez. */
  kosuyorMu?(dosya: string, ad: string): boolean;
  /** Şu an (kuyrukta bekleyen dahil) bir koşu sürüyor mu? Çalışma alanı değiştirme / proje silme bunu denetler. */
  mesgulMu?(): boolean;
  /** Ortamın güncel Playwright test listesi (koşu listesi filtresi uygulanmadan; "kodu kaldırılmış" denetimi). */
  testListesi?(ortam: string): Promise<Array<{ dosya: string; ad: string }>>;
}

export declare function calistirmaIsteginiHazirla(vt: Veritabani, govde: Record<string, unknown>, secenekler?: CalistirmaSecenekleri): {
  projeId: string; kosuId: string; kosuTuru: 'tam' | 'tekil' | null; kosuKimligi: string | null; kosuKapsami: string | null;
  hedef: CalistirmaHedefi;
};
export declare function senaryoCalistir(
  vt: Veritabani, govde: Record<string, unknown>, kosucu: Kosucu | null, secenekler?: CalistirmaSecenekleri
): Promise<{ httpDurum: number; govde: Record<string, unknown> }>;
export declare function senaryoDene(
  vt: Veritabani, govde: Record<string, unknown>, kosucu: Kosucu | null, adaptor: AktarimAdaptoru | null
): Promise<{ httpDurum: number; govde: Record<string, unknown> }>;
