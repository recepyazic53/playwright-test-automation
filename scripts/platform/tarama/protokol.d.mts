// scripts/platform/tarama/protokol.mjs için tip bildirimi + sunucu ↔ tarama alt süreci mesajları.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { TaramaEnvanteri } from './paket-olusturucu.mjs';

export declare const TARAMA_ADRES_DEGISKENI: string;
export declare const TARAMA_TOKEN_DEGISKENI: string;
export declare const TARAMA_CIKTI_DEGISKENI: string;
export declare const TARAMA_TEST_SURESI_DEGISKENI: string;
export declare const TARAMA_DNS_KAPALI_DEGISKENI: string;
export declare const TARAMA_IZINLI_KOKENLER_DEGISKENI: string;
export declare const TARAMA_ZAMAN_ASIMI_DEGISKENI: string;
export declare const TARAMA_TOKEN_BASLIGI: string;
export declare const VARSAYILAN_ZAMAN_ASIMI_SN: number;
export declare const SONUC_GOVDE_SINIRI: number;
export declare const OLAY_GOVDE_SINIRI: number;

/** Giriş kimliği (şifresi çözülmüş; YALNIZCA bellekte — giris-motoru.ts > GirisKimligi ile aynı biçim). */
export type TaramaKimligi = {
  kullaniciAdi: string;
  parola: string;
  totpGizli: string | null;
  sabitKod: string | null;
  smsKipi: 'sabit' | 'elle' | null;
};

/** Alt sürecin sunucudan BİR KEZ aldığı girdi (gizli değer içerir; diske yazılmaz). */
export type TaramaGirdisi = {
  tabanUrl: string;
  /** Hedefin tam adresi (ortamın kökeninde). */
  hedefAdres: string;
  hedefYol: string;
  tarif: GirisTarifi | null;
  kimlik: TaramaKimligi | null;
  /** Taranacak bağlam profilleri (sırayla); profil seçilmediyse tek öğe { ad: null, degerler: null }. */
  profiller: Array<{ ad: string | null; degerler: Record<string, unknown> | null }>;
  kesif: boolean;
  yasakKaliplari: string[];
  izinliKokenler: string[] | null;
  zamanAsimiMs: number;
};

export type TaramaAdimi = 'hazirlik' | 'giris' | 'profiller' | 'paket';
export type AdimDurumu = 'bekliyor' | 'suruyor' | 'tamam' | 'hata' | 'atlandi';
export type ProfilAdimi = 'baglam' | 'tarama' | 'kesif';

export type TaramaOlayi =
  | { tur: 'adim'; adim: TaramaAdimi; durum: AdimDurumu; mesaj?: string }
  | { tur: 'profil'; sira: number; durum: AdimDurumu; adim?: ProfilAdimi | null; alanSayisi?: number; mesaj?: string }
  | { tur: 'engellendi'; yontem: string; adres: string; asama: string; neden: string }
  | { tur: 'bilgi'; mesaj: string };

export type TaramaHataKodu =
  | 'YASAKLI_ADRES' | 'SITE_ERISILEMEDI' | 'KIMLIK_HATALI' | 'IKI_ASAMALI_HATALI' | 'KOD_GEREKLI' | 'CAPTCHA' | 'ALAN_BULUNAMADI'
  | 'ZAMAN_ASIMI' | 'BAGLAM_ADIMI' | 'TARIF_GECERSIZ' | 'OTURUM_GECERSIZ' | 'ALAN_YOK' | 'SUREC' | 'BEKLENMEYEN';

export type TaramaSonucu =
  | { basarili: true; envanter: TaramaEnvanteri }
  | { basarili: false; hata: { kod: TaramaHataKodu; mesaj: string } };
