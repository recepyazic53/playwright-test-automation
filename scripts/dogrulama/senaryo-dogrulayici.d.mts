// scripts/dogrulama/senaryo-dogrulayici.mjs için tip bildirimi (TS spec'i ve koruma testleri
// import eder). Model tipleri burada YAPISAL ve dar tutulur (yalnızca doğrulayıcının okuduğu
// anahtarlar): tests/support/ekran-modeli.ts > EkranModeli / AltModel bunlara atanabilir.

export type DogrulamaKosulIfadesi = Readonly<Record<string, unknown>>;
export type DogrulamaGorunurlugu = { kosul: string } | { ifade: DogrulamaKosulIfadesi };

export interface DogrulamaSecenegi {
  deger: string;
  metin?: string | null;
  senaryoDegeri?: string;
  kosul?: string;
}

export interface DogrulamaAlani {
  id: string;
  tip: string;
  etiket?: { form?: string | null };
  form?: { id: string; etiket?: string; yardimciKontroller?: ReadonlyArray<{ id: string; amac: string }> } | null;
  secenekler?: readonly DogrulamaSecenegi[] | null;
  bagimlilik?: { alan: string | readonly string[]; secenekHaritasi?: Readonly<Record<string, readonly DogrulamaSecenegi[]>> };
  zorunlu?: boolean | null;
  varsayilan?: { deger: unknown };
  yapilandirma?: string;
  eslesme?: {
    senaryo?: string | readonly string[];
    /** Alt model alanının kayıt içindeki adı. */
    kayitAlani?: string;
    /** Eski adı (hâlâ okunur): kayitAlani. */
    kart?: string;
    kimlikAlani?: string | Readonly<Record<string, string>>;
    profilHavuzu?: string | Readonly<Record<string, string>>;
  };
  gorunurluk?: DogrulamaGorunurlugu | null;
  altAlanlar?: readonly DogrulamaAlani[];
  altModel?: { dosya: string; bolum: string };
  varyantlar?: ReadonlyArray<{
    tip: string;
    alanlar?: Readonly<Record<string, { etiket?: string; secenekler?: readonly DogrulamaSecenegi[]; zorunlu?: boolean }>>;
  }>;
  kimlikTuru?: string | Readonly<Record<string, string>>;
  bicim?: string;
  kabul?: string;
}

export interface DogrulamaModeli {
  kosullar?: Readonly<Record<string, {
    ifade: DogrulamaKosulIfadesi;
    aciklama?: string;
    /** Bağlam profili bazında bilinen görünürlük; profilKodu bağlam profilinin kod'uyla eşleşir. */
    bilinenDurumlar?: ReadonlyArray<{ profil?: string; profilKodu?: string; gorunur: boolean | null }>;
  }>>;
  adimlar: ReadonlyArray<{
    gorunurluk?: DogrulamaGorunurlugu | null;
    bolumler?: ReadonlyArray<{ gorunurluk?: DogrulamaGorunurlugu | null; alanlar: readonly DogrulamaAlani[] }>;
  }>;
  senaryoDuzeyi?: { alanlar: readonly DogrulamaAlani[] };
}

export interface DogrulamaAltModeli {
  bolumler: ReadonlyArray<{ id: string; alanlar: readonly DogrulamaAlani[] }>;
}

/** Select alanı: { deger, metin } ya da doğrudan değer. */
export type DogrulamaSecimi = { deger?: string | number | null; metin?: string | null } | string | number;

export interface DogrulamaKarti {
  isim?: string;
  soyisim?: string;
  kartNo?: string;
  guvenlikKodu?: string;
  sonKullanmaAyi?: DogrulamaSecimi;
  sonKullanmaYili?: DogrulamaSecimi;
  taksit?: DogrulamaSecimi;
}

export interface NormallesmisKart {
  isim: string;
  soyisim: string;
  kartNo: string;
  guvenlikKodu: string;
  sonKullanmaAyi: { deger: string; metin: string };
  sonKullanmaYili: { deger: string; metin: string };
  taksit: { deger: string; metin: string };
}

/** Profil kontrolleri için bağlam (verilmeyen parçanın kontrolü atlanır). */
export interface ProfilDogrulamaBaglami {
  /** Profil havuzu adı (modelde eslesme.profilHavuzu) → profil adı → kayıt. */
  havuzlar?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Bağlam profili adı → { kod } (bilinenDurumlar[].profilKodu ile eşleşir). */
  baglamProfilleri?: Readonly<Record<string, { kod?: string }>>;
  /** Alt model ezme alanında senaryo değer vermezse kullanılan varsayılan kayıt. */
  varsayilanKayit?: DogrulamaKarti | null;
}

export interface DogrulamaBaglami {
  model: DogrulamaModeli;
  /** Alt model dosya adı → alt model (ör. "odeme-kredi-karti.model.json"). */
  altModeller?: Readonly<Record<string, DogrulamaAltModeli>>;
  profiller?: ProfilDogrulamaBaglami;
  /** Bilgi amaçlı (şu an kural seçiminde kullanılmıyor). */
  ortam?: string;
  /** Tarih kontrolleri için "şimdi" (varsayılan new Date()). */
  simdi?: Date;
  /** 'kayit' (varsayılan): kayıtlı senaryo. 'girdi': dashboard formunun gövdesi. */
  kaynak?: 'kayit' | 'girdi';
  /** Değeri ${Tablo.Sütun} olan alanlarda tablo / sütun varlığı buna göre denetlenir (verilmezse yalnız alan tipi). */
  tablolar?: ReadonlyArray<{ ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }>;
}

export interface DogrulamaBulgusu {
  /** Alan yolu (ör. "kapsam", "musteriKimligi.tcKimlikNo", "krediKarti.sonKullanmaYili"); senaryonun kendisi için "". */
  alan: string;
  mesaj: string;
}

export interface DogrulamaSonucu {
  gecerli: boolean;
  hatalar: DogrulamaBulgusu[];
  uyarilar: DogrulamaBulgusu[];
}

export type CozulmusBeklenenSonucGirdisi = {
  odemeAdimiDahil: boolean;
  beklenenSonuc: { tip: 'basarili' } | { tip: 'isKuraliHatasi'; adim: string; mesaj: string };
};

export declare const ESKI_BEKLENEN_SONUC_ALANLARI: readonly string[];
export declare const GIRDI_ALANLARI: Readonly<Record<string, { readonly modelAlani: string; readonly formSirasi: number }>>;

export declare const MESAJLAR: {
  readonly senaryoNesneDegil: () => string;
  readonly zorunlu: (etiket: string) => string;
  readonly metinOlmali: (etiket: string) => string;
  readonly nesneOlmali: (etiket: string) => string;
  readonly booleanOlmali: (etiket: string) => string;
  readonly pozitifTamSayi: (etiket: string) => string;
  readonly dosyaUzantisi: (etiket: string, uzanti: string) => string;
  readonly secenekDisi: (etiket: string, deger: string, izinliler: readonly string[]) => string;
  readonly bagimliSecenekDisi: (etiket: string, deger: string, bagliEtiket: string, bagliDeger: string, izinliler: readonly string[]) => string;
  readonly kosulluAlan: (etiket: string, kosulAciklamasi: string) => string;
  readonly kosulluSecenek: (etiket: string, deger: string, kosulAciklamasi: string) => string;
  readonly gorunmeyenAlan: (etiket: string) => string;
  readonly birlikteZorunlu: (etiket: string, digerEtiket: string) => string;
  readonly profilYok: (etiket: string, anahtar: string) => string;
  readonly profilVeKimlikBirlikte: (etiket: string) => string;
  readonly profilYaDaKimlikZorunlu: (etiket: string) => string;
  readonly tcBicim: () => string;
  readonly tcKontrolHanesi: () => string;
  readonly vknBicim: () => string;
  readonly telefonBicim: () => string;
  readonly tarihBicim: (etiket: string, bicim: string) => string;
  readonly tarihGelecekte: (etiket: string) => string;
  readonly kartNoBicim: () => string;
  readonly cvvBicim: () => string;
  readonly kartAyBicim: () => string;
  readonly kartYilBicim: () => string;
  readonly kartSuresiGecmis: (aaYyyy: string) => string;
  readonly varsayilanKayitSuresiGecmis: (etiket: string, aaYyyy: string) => string;
  readonly eskiBeklenenSonucAlanlari: (alanlar: readonly string[]) => string;
  readonly tabloBasvurusuAlamaz: (etiket: string) => string;
  readonly tabloYok: (etiket: string, tablo: string) => string;
  readonly tabloSutunuYok: (etiket: string, tablo: string, sutun: string) => string;
  readonly gizliSutunSecimde: (etiket: string, sutun: string) => string;
  readonly gizliSutunDosyada: (etiket: string, sutun: string) => string;
};
/** Değerin tamamı "${Tablo.Sütun}" ise başvuru (tablo-secimi.mjs > degerBasvurusu ile aynı biçim), değilse null. */
export declare function tabloBasvurusuCoz(deger: unknown): { tablo: string; etiket: string; sutun: string; bicim: string } | null;

export declare function tcKimlikNoGecerliMi(no: unknown): boolean;
export declare function kartSuresiGectiMi(kart: unknown, simdi: Date): boolean | null;
export declare function taksitMetni(sayi: number): string;
export declare function kartiNormallestir(ham: DogrulamaKarti, varsayilanKart?: DogrulamaKarti | null): NormallesmisKart;
export declare function krediKartlariAyniMi(a: unknown, b: unknown): boolean;
export declare function senaryoyuDogrula(senaryo: unknown, baglam: DogrulamaBaglami): DogrulamaSonucu;
/** Üç değerli görünürlük: true / false / null (bilinmiyor). */
export type UcDegerli = boolean | null;
export interface Gorunurlukler {
  adimlar: Record<string, UcDegerli>;
  bolumler: Record<string, UcDegerli>;
  alanlar: Record<string, UcDegerli>;
  /** "<alanId>.<altAlanId>" → bileşik alan parçasının görünürlüğü. */
  altAlanlar: Record<string, UcDegerli>;
}
export declare function gorunurlukleriHesapla(senaryo: unknown, baglam: DogrulamaBaglami): Gorunurlukler;
export declare function beklenenSonucuCozumle(
  senaryo: unknown,
  baglam: DogrulamaBaglami
): { hatalar: DogrulamaBulgusu[]; cozulmus: CozulmusBeklenenSonucGirdisi | null };
export declare function beklenenSonucuNormallestir(senaryo: {
  odemeAdimiDahil: boolean;
  beklenenSonuc?: { tip: string; adim?: string; mesaj?: string };
}): CozulmusBeklenenSonucGirdisi;
export declare function hatalariMetneCevir(hatalar: readonly DogrulamaBulgusu[]): string;
export declare function alanFormKimlikleri(alanYolu: string, baglam: Pick<DogrulamaBaglami, 'model' | 'altModeller'>): string[];
