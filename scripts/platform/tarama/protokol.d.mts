// scripts/platform/tarama/protokol.mjs için tip bildirimi + sunucu ↔ tarama alt süreci mesajları.
import type { GirisTarifi } from '../giris/tarif.mjs';
import type { KayitEnvanteri, TaramaEnvanteri } from './paket-olusturucu.mjs';
import type { AkisEnvanteri } from './akis-tasarimi.mjs';
import type { OturumDurumu } from '../giris/oturum-dosyasi.mjs';
import type { OgeSecmeSonucu, SecilenOge, SecilenOgeTuru } from './oge-isaretleri.mjs';
import type { HamAlan } from './paket-olusturucu.mjs';
import type { EylemAdaylari } from './eylem-kesfi.mjs';

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
export declare const HIZLI_KOMUT_BEKLEME_MS: number;
export declare const HIZLI_OLAY_GOVDE_SINIRI: number;
export declare const HIZLI_BASIS_BEKLEME_EN_COK_MS: number;
export declare const HIZLI_SECIM_KOPRUSU: string;
export declare const HIZLI_SECIM_KIMLIGI: string;

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
  kip?: 'tarama' | 'kayit' | 'girisDenemesi' | 'ogeSecme' | 'hizliTest';
  /** Hızlı test (etkileşimli iş): kullanıcının basma izni (evet / sor / hayir). 'hayir' iken alt süreç hiçbir düğmeye basmaz. */
  hizliTest?: { izin: HizliIzin };
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
    alanIslemMs?: number; oturumKontrolMs?: number; girisAlanBeklemeMs?: number };
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
  /** Hızlı testte alan doldurma / seçme beklemesi (varsayılan 30 sn). */
  alanIslemMs: number;
  /** Girişte oturum kontrolü (Ayarlar > Koşu > Tarama ve akış kaydı; varsayılan 15 sn). */
  oturumKontrolMs: number;
  /** Girişte giriş alanı beklemesi (Ayarlar > Koşu > Tarama ve akış kaydı; varsayılan 15 sn). */
  girisAlanBeklemeMs: number;
};

export type TaramaAdimi = 'hazirlik' | 'giris' | 'profiller' | 'kayit' | 'paket' | 'secim' | 'hizli';
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
  | { basarili: true; envanter: TaramaEnvanteri | KayitEnvanteri | AkisEnvanteri | GirisDenemesiSonucu | OgeSecmeSonucu | HizliTestSonucu }
  | { basarili: false; hata: { kod: TaramaHataKodu; mesaj: string } };

// ---- HIZLI TEST (girdi.kip = 'hizliTest') ----
/** Basma izni: evet (tek aday varsa basar), sor (her basıştan önce onay), hayir (hiç basmaz). */
export type HizliIzin = 'evet' | 'sor' | 'hayir';
/** Sayfada görülen metin (değer değil: görünen yazı). tur: hata / uyarı kutusu, bekleme, başarı kutusu ya da sıradan metin. */
export type HizliMetin = { metin: string; tur: 'hata' | 'bekleme' | 'basari' | 'normal' };
/** Görünen düğme adayı (eylem keşfinin gönderim adayları; basılmadan). */
export type HizliDugme = { secici: string; metin: string | null; kayitOlusturabilir: boolean; guven: string; enOlasi: boolean };
/** Sayfanın o anki okuması (alan DEĞERİ okunmaz). goruntu: JPEG base64 (yalnız bellekte). */
export type HizliAnlik = {
  yol: string; baslik: string; alanlar: HamAlan[]; metinler: HizliMetin[]; dugmeler: HizliDugme[]; eylem: EylemAdaylari; goruntu: string | null;
};
/** Basıştan sonra ne değişti. */
export type HizliFark = {
  basilan: { secici: string; metin: string | null }; sureMs: number; zamanAsimi: boolean; beklemeMetinleri: string[];
  yeniMetinler: HizliMetin[]; yeniAlanlar: HamAlan[]; kaybolanAlanlar: string[]; yeniDugmeler: HizliDugme[];
  adres: { once: string; sonra: string } | null; anlik: HizliAnlik;
};
/** Doldurulacak alan (değer yalnız bellekte; tablodan gelen başvuru sunucuda çözülmüş olarak gelir). */
export type HizliDoldurulan = { anahtar: string; alan: HamAlan; deger: string | boolean };
/** Doğrulama koşusu planı: adımlar baştan sona (doldur → bas), sonra bitiş koşulu. */
export type HizliPlan = {
  adimlar: Array<{ alanlar: HizliDoldurulan[]; bas: { secici: string; metin: string | null } | null }>;
  bitis: { bitti: string[]; devam: string[]; hata: string[]; adres: string | null }; zamanAsimiSn: number;
};
/** Sunucu → alt süreç. */
export type HizliKomut =
  | { no: number; tur: 'doldur'; alanlar: HizliDoldurulan[] }
  | { no: number; tur: 'bas'; secici: string; metin: string | null }
  | { no: number; tur: 'secimAc' }
  | { no: number; tur: 'oku' }
  | { no: number; tur: 'dogrula'; plan: HizliPlan }
  | { no: number; tur: 'bitir' };
/** Alt süreç → sunucu (POST …/hizli). */
export type HizliOlay =
  | { olay: 'kesif'; anlik: HizliAnlik }
  | { olay: 'dolduruldu'; no: number; hatalar: Array<{ anahtar: string; mesaj: string }>; anlik: HizliAnlik; yeniMetinler?: HizliMetin[] }
  | { olay: 'basildi'; no: number; fark: HizliFark }
  | { olay: 'secildi'; no: number; oge: { secici: string; metin: string | null } }
  | { olay: 'secimIptal'; no: number }
  | { olay: 'okundu'; no: number; anlik: HizliAnlik }
  | { olay: 'dogrulandi'; no: number; sonuc: 'basarili' | 'basarisiz'; mesaj: string; gorulen: string[] }
  | { olay: 'hata'; no: number | null; mesaj: string };
export type HizliTestSonucu = { kip: 'hizliTest'; notlar: string[] };
