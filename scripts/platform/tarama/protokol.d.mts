// scripts/platform/tarama/protokol.mjs için tip bildirimi + sunucu ↔ tarama alt süreci mesajları.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { KayitEnvanteri, TaramaEnvanteri } from './paket-olusturucu.mjs';
import type { AkisEnvanteri } from './akis-tasarimi.mjs';
import type { OturumDurumu } from '../giris/oturum-dosyasi.mjs';
import type { OgeSecmeSonucu, SecilenOge, SecilenOgeTuru } from './oge-isaretleri.mjs';

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
export declare const OTURUM_GOVDE_SINIRI: number;
export declare const TARAMA_GIRIS_KIPLERI: readonly ['bastan', 'saklananOturum'];
export declare const KAYIT_ZAMAN_ASIMI_DEGISKENI: string;
export declare const VARSAYILAN_KAYIT_ZAMAN_ASIMI_SN: number;
export declare const TARAMA_GORUNUR_DEGISKENI: string;
export declare const KAYIT_BASSIZ_DEGISKENI: string;
export declare const KAYIT_CDP_PORTU_DEGISKENI: string;
export declare const KAYIT_KOPRUSU: string;
export declare const KAYIT_PANELI_KIMLIGI: string;
export declare const SECIM_KOPRUSU: string;
export declare const SECIM_PANELI_KIMLIGI: string;

/** Giriş kimliği (şifresi çözülmüş; YALNIZCA bellekte — giris-motoru.ts > GirisKimligi ile aynı biçim). */
export type TaramaKimligi = {
  kullaniciAdi: string;
  parola: string;
  totpGizli: string | null;
  sabitKod: string | null;
  smsKipi: 'sabit' | 'elle' | null;
  /** Giriş profilinin ek alanları (giriş adımlarındaki "{ad}" yer tutucuları). */
  ekAlanlar?: Record<string, string>;
  /** Gizli ek alanların adları (hata metinlerinde maskelenir). */
  gizliEkAlanlar?: string[];
};

/** Alt sürecin sunucudan BİR KEZ aldığı girdi (gizli değer içerir; diske yazılmaz). */
export type TaramaGirdisi = {
  /**
   * 'tarama' (salt okuma, otomatik), 'kayit' (kullanıcı akışı görünür tarayıcıda yürütür; en fazla bir profil) ya da 'ogeSecme'
   * ("Sayfada seç": görünür tarayıcıda kullanıcı öğe seçer; seçim modunda tıklama sayfaya iletilmez, yazma istekleri engellenir).
   */
  kip?: 'tarama' | 'kayit' | 'girisDenemesi' | 'ogeSecme';
  /** Öğe seçmede seçilebilecek türler (verilmezse hepsi). */
  ogeTurleri?: SecilenOgeTuru[];
  /** Kayıt, giriş kaydı ("Girişi kaydet"): panel metinleri diyagram yerine giriş onay ekranını anlatır. */
  girisKaydi?: boolean;
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
  /** Tarayıcı kararları (Ayarlar > Koşu); yoksa önceki sabitler (bkz. taramaTarayiciAyarlari). dil null: verilmez. */
  tarayici?: { genislik?: number; yukseklik?: number; dil?: string | null; saatDilimi?: string | null; sayfaAcilmaMs?: number; kesifSecenekSiniri?: number;
    oturumKontrolMs?: number; girisAlanBeklemeMs?: number };
  /**
   * YALNIZ "Koşunun saklanan oturumunu kullan" seçiliyken, giriş tarifi varken ve "Giriş yapmadan aç" seçilmemişken: koşunun bu
   * ortam + giriş profili için saklanan oturumu (ortamın kökenlerine sınırlanmış; yoksa / açılamadıysa null). Alan yoksa: her
   * seferinde baştan giriş, oturum gönderilmez.
   */
  oturum?: { durum: OturumDurumu | null } | null;
};

export declare function taramaTarayiciAyarlari(g: { tarayici?: TaramaGirdisi['tarayici'] }): {
  baglam: { viewport: { width: number; height: number }; locale?: string; timezoneId?: string };
  sayfaAcilmaMs: number;
  kesifSecenekSiniri: number;
  /** Girişte oturum kontrolü (Ayarlar > Koşu > Tarama ve akış kaydı; varsayılan 15 sn). */
  oturumKontrolMs: number;
  /** Girişte giriş alanı beklemesi (Ayarlar > Koşu > Tarama ve akış kaydı; varsayılan 15 sn). */
  girisAlanBeklemeMs: number;
};

export type TaramaAdimi = 'hazirlik' | 'giris' | 'profiller' | 'kayit' | 'paket' | 'secim';
export type AdimDurumu = 'bekliyor' | 'suruyor' | 'tamam' | 'hata' | 'atlandi';
export type ProfilAdimi = 'baglam' | 'tarama' | 'kesif';

export type TaramaOlayi =
  | { tur: 'adim'; adim: TaramaAdimi; durum: AdimDurumu; mesaj?: string }
  | { tur: 'profil'; sira: number; durum: AdimDurumu; adim?: ProfilAdimi | null; alanSayisi?: number; mesaj?: string }
  | { tur: 'engellendi'; yontem: string; adres: string; asama: string; neden: string }
  | { tur: 'bilgi'; mesaj: string }
  /** Girişin nasıl yapıldığı (iş durumunda / raporda görünür). */
  | { tur: 'giris'; yontem: TaramaGirisYontemi }
  /** "Sayfada seç": o ana kadar seçilen öğelerin tamamı (her değişiklikte; iş ekranında canlı görünür). */
  | { tur: 'ogeler'; ogeler: SecilenOge[] };

/** saklananOturum: saklanan oturum geçerliydi, giriş atlandı; bastanGiris: giriş formu dolduruldu. */
export type TaramaGirisYontemi = 'saklananOturum' | 'bastanGiris';

export type TaramaHataKodu =
  | 'YASAKLI_ADRES' | 'SITE_ERISILEMEDI' | 'KIMLIK_HATALI' | 'IKI_ASAMALI_HATALI' | 'KOD_GEREKLI' | 'CAPTCHA' | 'ALAN_BULUNAMADI'
  | 'ZAMAN_ASIMI' | 'BAGLAM_ADIMI' | 'GIRIS_ADIMI' | 'TARIF_GECERSIZ' | 'KOKEN_UYUSMAZ' | 'OTURUM_GECERSIZ' | 'ALAN_YOK' | 'SUREC' | 'IPTAL' | 'BEKLENMEYEN';

/** "Girişi dene" (girdi.kip = 'girisDenemesi'): yalnız giriş; sonuç başarılı ya da hangi adımda neden takıldığı. */
export type GirisDenemesiSonucu = {
  kip: 'girisDenemesi';
  basarili: boolean;
  /** Girişin bittiği (ya da takıldığı) sayfanın yolu. */
  yol: string;
  hata: { kod: TaramaHataKodu; mesaj: string } | null;
  /** O anki sayfanın ekran görüntüsü (JPEG, base64; yalnız bellekte). */
  goruntu: string | null;
  /** Giriş motorunun adım günlüğü (değer yok). */
  gunluk: string[];
};

export type TaramaSonucu =
  | { basarili: true; envanter: TaramaEnvanteri | KayitEnvanteri | AkisEnvanteri | GirisDenemesiSonucu | OgeSecmeSonucu }
  | { basarili: false; hata: { kod: TaramaHataKodu; mesaj: string } };
