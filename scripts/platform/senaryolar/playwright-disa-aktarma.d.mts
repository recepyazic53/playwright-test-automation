// scripts/platform/senaryolar/playwright-disa-aktarma.mjs için tip bildirimi.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { ModelKosuPlani } from './model-kosusu.mjs';

export declare const DISA_AKTARMA_ON_EKI: string;

export type DisaAktarmaGirdisi = {
  /** modelKosuPlani çıktısı (koşucunun kullandığı AYNI plan). */
  plan: ModelKosuPlani;
  /** Dosya başındaki kaynak bilgisi (üretim: ISO zaman). */
  kaynak: { ekran: string; senaryo: string; modelSurumu: number | null; akis?: string | null; ortam: string; uretim: string };
  tabanUrl: string;
  /** Giriş yapılır mı (senaryonun giriş seçimi "Girişsiz" değil ve ekran giriş gerektiriyor). */
  girisGerekli: boolean;
  /** Senaryonun seçtiği giriş profili ADI (null = ortamın varsayılanı). */
  girisProfili?: string | null;
  tarif?: GirisTarifi | null;
  /** Bağlam değiştirme: senaryonun bağlam profili ve bu ortamdaki değerleri (gizli olmayanlar düz yazılır). */
  baglam?: { profil: string | null; degerler: Record<string, unknown> | null } | null;
  /** Riskli / canlı ortam: "yalnızca test ortamı" adımları atlanır (koşucuyla aynı). */
  canli?: boolean;
  gizlilik?: {
    /** Kasada şifreli (hassas) senaryo alanlarının anahtarları. */
    hassasAnahtarlar?: string[];
    /** Gizli tablo sütunlarından gelen değerler (bu değeri taşıyan alan ortam değişkenine çevrilir). */
    gizliDegerler?: string[];
    /** Kimlik profili alt alanlarının kimlikleri (kişisel). */
    kisiselAlanIdleri?: string[];
    /** Ayarlar > Güvenlik > Maskeleme ek gizli adları. */
    ekGizliAdlar?: string[];
  };
};

export type DisaAktarmaSonucu = {
  dosyaAdi: string;
  icerik: string;
  /** Dosyanın okuduğu (gerekli) ortam değişkenleri — değer yok. */
  ortamDegiskenleri: Array<{ ad: string; aciklama: string }>;
};

export declare function ortamDegiskeniParcasi(ad: string): string;
export declare function disaAktarmaDosyaAdi(baslik: string): string;
export declare function playwrightKoduUret(g: DisaAktarmaGirdisi): DisaAktarmaSonucu;
