// scripts/platform/giris/tarif.mjs için tip bildirimi.
export type IkinciAdimTuru = 'yok' | 'totp' | 'sms';
export type SmsKipi = 'sabit' | 'elle';

export interface BasariGostergesi { tur: 'metin' | 'url' | 'eleman'; deger: string }
export interface HataGostergesi { tur: 'metin' | 'eleman'; deger: string }

export type IkinciAdim =
  | { tur: 'yok' }
  | {
    tur: 'totp' | 'sms';
    /** Boşsa kod alanı sayfadan otomatik bulunur. */
    kodAlani: string;
    /** Boşsa ana giriş düğmesi kullanılır. */
    gonderDugmesi: string;
    /** Yalnızca sms: null = giriş profilindeki ayar. */
    smsKipi: SmsKipi | null;
    /** Boşsa ana hata göstergeleri kullanılır. */
    hataGostergeleri: HataGostergesi[];
    elleBeklemeSn: number;
  };

export type Hedef = { secici: string; metin?: string; tamMetin?: boolean } | { rol: string; ad: string };

interface AdimOrtak { aciklama?: string; zamanAsimiSn?: number }
export type BaglamAdimi = AdimOrtak & (
  | { islem: 'git'; adres: string }
  | { islem: 'adresBekle'; desen: string }
  | { islem: 'kosulBekle'; ifade: string }
  | { islem: 'tikla'; hedef: Hedef; yanitBekle?: { yol: string }; adresBekle?: string }
  | { islem: 'doldur' | 'sec' | 'degerBekle'; hedef: Hedef; deger: string }
  | { islem: 'gorunurBekle'; hedef: Hedef }
  | { islem: 'sayiBekle'; hedef: Hedef; sayi: number }
  | { islem: 'metinBekle'; hedef: Hedef; metin: string }
);

export interface BaglamDegistirme { baglamTuru: string; adimlar: BaglamAdimi[] }

export interface GirisTarifi {
  surum: 1;
  girisAdresi: string;
  oturumKontrolAdresi: string;
  kullaniciAlani: string;
  parolaAlani: string;
  gonderDugmesi: string;
  basariGostergesi: BasariGostergesi;
  hataGostergeleri: HataGostergesi[];
  ikinciAdim: IkinciAdim;
  zamanAsimiSn: number;
  baglamDegistirme: BaglamDegistirme | null;
}

export type GirisHataKodu =
  | 'SITE_ERISILEMEDI' | 'KIMLIK_HATALI' | 'IKI_ASAMALI_HATALI' | 'KOD_GEREKLI' | 'CAPTCHA' | 'ALAN_BULUNAMADI'
  | 'ZAMAN_ASIMI' | 'BAGLAM_ADIMI' | 'TARIF_GECERSIZ';

export declare const TARIF_SURUMU: 1;
export declare const IKINCI_ADIM_TURLERI: readonly IkinciAdimTuru[];
export declare const SMS_KIPLERI: readonly SmsKipi[];
export declare const BASARI_GOSTERGE_TURLERI: readonly BasariGostergesi['tur'][];
export declare const HATA_GOSTERGE_TURLERI: readonly HataGostergesi['tur'][];
export declare const ADIM_ISLEMLERI: readonly BaglamAdimi['islem'][];
export declare const ADIM_ETIKETLERI: Readonly<Record<BaglamAdimi['islem'], string>>;
export declare const VARSAYILAN_ZAMAN_ASIMI_SN: number;
export declare const VARSAYILAN_ELLE_BEKLEME_SN: number;
export declare const GIRIS_HATA_KODLARI: Readonly<Record<GirisHataKodu, string>>;

export declare class TarifHatasi extends Error {
  constructor(hatalar: string[]);
  hatalar: string[];
}
export declare function yerTutuculari(metin: string): string[];
export declare function regexKacis(metin: string): string;
export declare function yerTutuculariDoldur(metin: string, degerler: Record<string, unknown>, secenekler?: { kacis?: (d: string) => string }): string;
export declare function girisTarifiniDogrula(ham: unknown): { gecerli: boolean; tarif: GirisTarifi | null; hatalar: string[] };
export declare function girisTarifiOlmali(ham: unknown): GirisTarifi;
export declare function adimOzeti(a: BaglamAdimi, sira: number): string;
export declare function baglamAlanlari(tarif: GirisTarifi): string[];
export declare function agHatasiMi(mesaj: string): boolean;
export declare function girisSonucunuSiniflandir(d: {
  asama: 'ilk' | 'ikinci';
  gozlem: 'basari' | 'hata' | 'ikinciAdim' | 'captcha' | null;
  ikinciAdimBekleniyor: boolean;
}): GirisHataKodu | null;
