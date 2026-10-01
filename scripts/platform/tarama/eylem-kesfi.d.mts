// scripts/platform/tarama/eylem-kesfi.mjs için tip bildirimi (eylem ve doğrulama keşfi; basmadan aday çıkarma).
import type { Kirilganlik } from './paket-olusturucu.mjs';
import type { SecilenOge, SeciciTuru } from './oge-isaretleri.mjs';

export type Guven = 'guclu' | 'olasi' | 'tahmin';
export type EylemAdayTuru = 'gonderim' | 'basari' | 'hata' | 'bekleme';
/** Öğenin sayfadaki kutusu (piksel; gizli öğede null). */
export type EylemKonumu = { x: number; y: number; genislik: number; yukseklik: number };

/** Sayfadan toplanan ham iz (eylem-kesfi-motoru.ts; seçici üretilmiş ve tek eşleşmesi denetlenmiş). */
export type HamEylemIzi = {
  tur: 'dugme' | 'basari' | 'hata' | 'bekleme';
  secici: string;
  seciciTuru: SeciciTuru;
  kirilganlik: Kirilganlik;
  metin: string | null;
  gizli: boolean;
  konum: EylemKonumu | null;
  /** Düğme: form içinde mi, gönderim (submit) düğmesi mi, onclick'i var mı, devre dışı mı. */
  formIci?: boolean;
  submit?: boolean;
  onclick?: boolean;
  devreDisi?: boolean;
  /** Başarı / hata / bekleme: eşleşen sınıf parçası, rolü, aria-live / aria-busy, alana bağlı mı, grup adedi. */
  sinif?: string | null;
  rol?: string | null;
  canliBolge?: boolean;
  mesgul?: boolean;
  alanaBagli?: boolean;
  adet?: number;
  /** Sayfada aria-invalid taşıyan alan sayısı (hata izine eklenir). */
  ariaInvalid?: number;
  /** Öğe aynı kökenli bir çerçevenin (iframe) içindeyse çerçeve seçicileri (dıştan içe). */
  cerceve?: string[];
};
export type HamYonlendirme = { adres: string; kaynak: 'form' | 'baglanti' | 'betik'; metin: string | null };
export type HamEylemIzleri = { sayfaYolu: string; izler: HamEylemIzi[]; yonlendirmeler: HamYonlendirme[]; notlar?: string[] };

/** Aday: seçici, güven düzeyi ve gerekçe; oge "Düğmeyi ve sonucu işaretle"de gönderilecek seçilen öğe (bekleme için null). */
export type EylemAdayi = {
  anahtar: string;
  tur: EylemAdayTuru;
  secici: string;
  seciciTuru: SeciciTuru;
  kirilganlik: Kirilganlik;
  metin: string | null;
  guven: Guven;
  puan: number;
  gerekce: string[];
  gizli: boolean;
  konum: EylemKonumu | null;
  /** Yalnız gönderim: metni kayıt oluşturabilecek bir eylem çağrıştırıyor (Kaydet, Onayla, Satın al, Öde…). */
  kayitOlusturabilir?: boolean;
  /** Yalnız hata: grup seçicisinin sayfadaki öğe sayısı. */
  adet?: number;
  /** Türünün en olası adayı (listenin ilki). */
  enOlasi: boolean;
  oge: SecilenOge | null;
  /** Öğe aynı kökenli bir çerçevenin (iframe) içindeyse çerçeve seçicileri (dıştan içe). */
  cerceve?: string[];
};
export type YonlendirmeAdayi = { adres: string; kaynak: 'form' | 'baglanti' | 'betik'; metin: string | null; guven: 'tahmin' };
export type EylemAdaylari = {
  gonderim: EylemAdayi[];
  basari: EylemAdayi[];
  hata: EylemAdayi[];
  bekleme: EylemAdayi[];
  yonlendirme: YonlendirmeAdayi[];
  notlar: string[];
};

export declare const GUVEN_DUZEYLERI: readonly Guven[];
export declare const GUVEN_ADLARI: Readonly<Record<Guven, string>>;
export declare const ADAY_EN_COK: Readonly<Record<EylemAdayTuru | 'yonlendirme', number>>;
export declare const KALIPLAR: Readonly<Record<
  'eylem' | 'kayit' | 'olumsuz' | 'basariMetni' | 'hataMetni' | 'beklemeMetni' | 'basariSinifi' | 'hataSinifi' | 'alanHataSinifi' | 'beklemeSinifi', string
>>;
export declare function katla(m: unknown): string;
export declare function kalipVar(ad: keyof typeof KALIPLAR, m: unknown): boolean;
export declare function adayOgesi(a: { tur: string; secici: string; kirilganlik: string; seciciTuru: string; metin: string | null }): SecilenOge | null;
export declare function eylemAdaylariniDegerlendir(ham: HamEylemIzleri, sinir?: { gonderim?: number }): EylemAdaylari;
export declare function bosEylemAdaylari(): EylemAdaylari;
export declare function eylemAdaylariniAyikla(ham: unknown): EylemAdaylari | null;
