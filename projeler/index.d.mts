// projeler/index.mjs için tip bildirimi: proje aktarım adaptörü sözleşmesi.
import type { Veritabani } from '../scripts/platform/veritabani/baglanti.mjs';
import type { AktarimPaketi } from '../scripts/platform/aktarim/motor.mjs';

export interface EskiGirisBilgisi {
  /** Giriş profilinin kimliği (oturum dosyası ortam + profil başınadır). */
  profilKimligi: string;
  kullaniciAdi: string;
  parola: string | null;
  totpGizli: string | null;
  sabitKod: string | null;
  /** SMS 2FA'da kodun kaynağı (giriş profilindeki ayar); SMS değilse null. */
  smsKipi: 'sabit' | 'elle' | null;
}
/** yenidenKur çıktısı: testlerin veritabanından okuduğu şekiller (ortam başına). */
export interface YenidenKurulanVeri {
  ortam: string;
  tabanUrl: string;
  giris: EskiGirisBilgisi | null;
  ortak: Record<string, unknown>;
  dosyalar: Record<string, Record<string, unknown>>;
  /** Ekran modelleri, eski dosya adıyla ("<ekran anahtarı>.model.json"). */
  ekranModelleri: Record<string, Record<string, unknown>>;
  /** Eski senaryo anahtarı ("<dosya>::<başlık>") → senaryo UUID. */
  senaryoKimlikleri: Record<string, string>;
  /** Etkin giriş tarifi (kaydedilmiş ya da adaptör varsayılanı; veri-oku.mjs ekler). Yoksa null. */
  girisTarifi?: { tarif: unknown; kaynak: string; hatalar: string[] } | null;
}

/** Kodlu senaryodan akış ekranı için senaryo taslağı: başlık + akış ekranının form verisi (kimlikler profil adıyla). */
export interface AkisSenaryoTaslagi {
  baslik: string;
  veri: Record<string, unknown>;
  /** Önizlemede gösterilecek kısa açıklama (ör. hangi kodlu senaryodan). */
  aciklama?: string;
}

export interface AktarimAdaptoru {
  readonly ad: string;
  readonly projeAdi: string;
  readonly etiket: string;
  /** Klasörde (eski dosyaların kaynağı) aktarılacak dosya var mı? */
  algila(kaynakKlasoru: string): { var: boolean; ortamlar: string[] };
  /**
   * Kaynak klasördeki eski dosyalardan paket. projeKoku: spec dosyalarının kökü (varsayılan: kaynak).
   * testListesi verilmezse liste, paketin uygulandığı geçici bir veritabanı üzerinden alınır.
   */
  paketOlustur(kaynakKlasoru: string, secenekler?: {
    projeKoku?: string;
    ortamDegiskenleri?: NodeJS.ProcessEnv;
    testListesi?: (ortam: string) => Promise<Array<{ dosya: string; ad: string }>>;
  }): Promise<AktarimPaketi>;
  kosudanHaricAnahtarlar(vt: Veritabani, projeId: string): string[];
  yenidenKur(vt: Veritabani, projeId: string, ortamAnahtari: string): YenidenKurulanVeri | null;
  /** Eski koşu sonucu klasörleri (Allure ham sonuçları; kaynak klasörde) — tek seferlik içe aktarım için. */
  sonucKaynaklari?(kaynakKlasoru: string): Array<{ ortam: string; klasor: string }>;
  /** Senaryolar ekranı: ekranın veri güdümlü senaryo kaynağı (yeni senaryo bu diziye eklenir). */
  senaryoVeriKaynagi?(ekranAnahtari: string): { spec: string; dosya: string; yol: string } | null;
  /** Senaryolar ekranı: model "profilHavuzu" yolu → platform profil türü. */
  profilHavuzlari?(): Record<string, { tur: 'baglam' | 'testVerisi'; ad: string }>;
  /** Senaryolar ekranı: tek doğrulayıcının "ortak" bağlamı (kasa açık olmalı). */
  dogrulamaBaglami?(vt: Veritabani, projeId: string, ortamAnahtari: string): Record<string, unknown> | undefined;
  /** Giriş motoru: kaydedilmiş giriş tarifi olmayan ortam için projenin varsayılan tarifi (kasa açık olmalı). */
  varsayilanGirisTarifi?(vt: Veritabani, projeId: string, ortamId: string): unknown;
  /**
   * Senaryoların kullandığı düz metin dosyalar (klasör: proje kökü ya da eski dosya yedeği). Aktarımdan sonra ve
   * Ayarlar > Güvenlik > "Açık dosyaları şifreli depoya taşı" ile şifreli depoya alınır (bkz. scripts/platform/dosyalar/).
   */
  dosyaKaynaklari?(kok: string): Array<{ goreliYol: string; yol: string }>;
  /**
   * Kodlu senaryoları akışa taşıma: akış ekranı (anahtarı) için kodlu testin senaryo matrisi, ürün verisinden akış ekranının
   * alanlarıyla (kasa açık olmalı). Bu ekran için taşıma yoksa null. Bkz. scripts/platform/senaryolar/akis-tasima.mjs.
   */
  akisSenaryoTaslaklari?(vt: Veritabani, projeId: string, ortamAnahtari: string, ekranAnahtari: string): { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] } | null;
  /** Taşıması tanımlı akış ekranlarının anahtarları (arayüz "Kodlu senaryoları taşı…" düğmesini bunlarda gösterir). */
  akisTasimaEkranlari?(): string[];
}

export declare const AKTARIM_ADAPTORLERI: ReadonlyArray<AktarimAdaptoru>;
export declare function adaptorBul(ad: string): AktarimAdaptoru | undefined;
