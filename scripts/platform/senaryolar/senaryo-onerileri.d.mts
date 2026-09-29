// scripts/platform/senaryolar/senaryo-onerileri.mjs için tip bildirimi (birim testleri import eder).
import type { FormSemasi } from './model-formu.mjs';
import type { DogrulamaBulgusu, Gorunurlukler } from '../../dogrulama/senaryo-dogrulayici.mjs';

export declare const KOMBINASYON_ALAN_SINIRI: number;
export declare const KOMBINASYON_DEGER_SINIRI: number;
export declare const PAIRWISE_SATIR_SINIRI: number;
export declare const TAMAMLAMA_SINIRI: number;
export declare const ONERI_UST_SINIRI: number;
export declare const KOSUL_DAL_SINIRI: number;
export declare const ERTELEME_GUNU: number;
export declare const BILEREK_BOS: 'bilerekBos';
export declare const ONERI_TURLERI: readonly ['zorunlu', 'sinir', 'kosullu', 'kombinasyon', 'uyari'];
export declare const NEDEN_TURLERI: readonly ['risk', 'kapsam', 'pairwise', 'sinir', 'zorunlu'];
export declare const NEDEN_PUANLARI: Readonly<Record<OneriNedeni, number>>;
export declare const RED_NEDENLERI: readonly ['gereksiz', 'yanlis', 'sonra'];
export declare const MASKE: string;

export type OneriTuru = (typeof ONERI_TURLERI)[number];
export type OneriNedeni = (typeof NEDEN_TURLERI)[number];
export type RedNedeni = (typeof RED_NEDENLERI)[number];

export interface OneriSenaryosu {
  id: string;
  baslik: string;
  veri: Record<string, unknown>;
  tabloSecimleri?: Record<string, Record<string, string>> | null;
  /** Seçili ortamdaki son sonucun durumu (taban seçiminde başarılı olan önce). */
  sonDurum?: string | null;
  /** Veri güdümlü koşunun satırları: tablo başvurularının çözülmüş (gizli olmayan) değerleri; her biri ayrı test. */
  degerSatirlari?: Array<Record<string, unknown>> | null;
}

/** Kullanıcının öneri kararı (kabul / red); gizli değer taşımaz. */
export interface OneriKarari {
  zaman: string;
  ekranId?: string | null;
  /** Servis önerisi kararı: servis kimliği ve metot (operasyon) adı (ekranId yerine). */
  servisId?: string | null;
  metot?: string | null;
  kimlik: string;
  tur: string;
  neden?: string | null;
  alanlar?: string[];
  karar: 'kabul' | 'red';
  redNedeni?: RedNedeni | null;
}

export interface OneriGecmisi {
  /** Başarısız sonuçların bakıldığı gün sayısı (gerekçede yazılır). */
  hataGunu?: number;
  /** Görülen uyarıların bakıldığı gün sayısı. */
  uyariGunu?: number;
  /** Son dönemde başarısız sonuçlar: senaryo + hatanın alındığı adım (adım adı) başına sayı. */
  hatalar?: Array<{ senaryoId: string | null; adim: string | null; sayi: number }>;
  /** Koşularda görülen iş kuralı uyarıları (hata göstergesi / diyalog; maskeli metin). */
  uyarilar?: Array<{ metin: string; adim: string | null; sayi: number; beklenen: boolean; senaryoIdleri: string[] }>;
}

export interface OneriGirdisi {
  /** Akışın modeli (model-formu.mjs > akisModeli). */
  model: unknown;
  /** formSemasiOlustur(model, altModeller). */
  sema: FormSemasi;
  /** Tek doğrulayıcının görünürlüğü: (veri) => gorunurlukleriHesapla(veri, baglam). */
  gorunurlukHesapla: (veri: Record<string, unknown>) => Pick<Gorunurlukler, 'adimlar' | 'alanlar'>;
  /** Tek doğrulayıcı (verilirse taban ve pairwise satırları ondan geçer). */
  dogrula?: (veri: Record<string, unknown>) => { hatalar: DogrulamaBulgusu[] };
  /** Aynı ekranın (aynı akışın) mevcut senaryoları: taban + kapsam. */
  senaryolar: OneriSenaryosu[];
  /** Ekranın diğer akışlarındaki senaryolar: yalnız kapsam ("zaten denendi mi"). */
  kapsamSenaryolari?: OneriSenaryosu[];
  /** Alan kimliği → test verisi tablosu başvurusu (${Tablo.Sütun}); değer üretilmeyen alanlar bununla dolar. */
  tabloBasvurulari?: Record<string, string>;
  /** Değeri öneride değiştirilmeyen alanlar (ör. kayıt tablosuna bağlı alanlar). */
  haricAlanlar?: string[];
  /** Pairwise'a girecek alanların kimlikleri (verilmezse varsayılan: koşul yöneten + seçenekli alanlar). */
  kombinasyonAlanlari?: string[] | null;
  /** Gizli ad denetimi (Ayarlar > Maskeleme ek adlarıyla). */
  gizliAdMi?: (ad: string) => boolean;
  /** Koşu geçmişi (risk). */
  gecmis?: OneriGecmisi;
  /** Kullanıcının öneri kararları (öğrenme ve gizleme). */
  kararlar?: OneriKarari[];
  /** Kararların ekranı (gizleme ve alan ağırlığı yalnız bu ekrandan). */
  ekranId?: string | null;
  /** Reddedilen / ertelenen öneriler de listelensin ("reddedildi" işaretiyle). */
  reddedilenleriGoster?: boolean;
  /** Döndürülecek öneri sayısı (varsayılan ONERI_UST_SINIRI). */
  ustSinir?: number;
  simdi?: Date;
}

export type OneriBeklenen =
  | { tur: 'basari' }
  | { tur: 'hata'; adim: string; adimBasligi: string; mesaj: string; mesajEksik: boolean }
  | { tur: 'belirsiz'; neden: string };

export interface Oneri {
  /** İçerikten türeyen kararlı kimlik (ör. "zorunlu:urunAdi"). */
  kimlik: string;
  tur: OneriTuru;
  neden: OneriNedeni;
  /** Kısa Türkçe gerekçe (her öneride var). */
  gerekce: string;
  /** Sıralama puanı: neden tabanı + önem, kararlarla çarpılır. */
  puan: number;
  /** Başlık önerisi. */
  baslik: string;
  /** Tabandan farkı anlatan kısa özet. */
  ozet: string;
  /** Değişen alanlar (gizli alanlar maskeli). */
  degisiklikler: Array<{ etiket: string; deger: string }>;
  beklenen: OneriBeklenen;
  beklenenMetni: string;
  /** Kaydedilecek senaryo verisi (başlık ve beklenen sonuç dahil). */
  veri: Record<string, unknown>;
  tabloSecimleri: Record<string, Record<string, string>> | null;
  /** Değeri olmayan (üretilmeyen) zorunlu alanlar. */
  eksikler: string[];
  /** Doğrudan eklenmesini engelleyen durum (önizlemede düzeltilir). */
  engel: string | null;
  /** Önerinin ilgili olduğu alan kimlikleri (öğrenme). */
  alanlar: string[];
  /** Pairwise: kapattığı ikililer ("Alan: değer + Alan: değer"). */
  ikililer?: string[];
  /** Pairwise satırına katılan denenmemiş koşul dalları. */
  dallar?: string[];
  /** Beklenen sonucu belli, eksiği ve engeli yok (kayıtta ayrıca doğrulayıcıdan geçer). */
  eklenebilir: boolean;
  /** Daha önce reddedildi (yalnız reddedilenleriGoster ile listelenir). */
  reddedildi: boolean;
}

export interface KapsamOlcusu {
  kapsanan: number;
  toplam: number;
  /** Eksiklerin etiketleri (en çok 50). */
  eksikler: string[];
}

export interface OneriSonucu {
  taban: { kaynak: 'senaryo' | 'varsayilan'; senaryoId: string | null; baslik: string | null; eksikler: string[] };
  /** Sıralı öneriler (en çok ustSinir). */
  oneriler: Oneri[];
  /** Tüm önerilerin sayısı ve gösterilmeyenler. */
  toplam: number;
  kalan: number;
  ustSinir: number;
  notlar: Array<{ tur: string; mesaj: string }>;
  kombinasyon: {
    secilebilir: Array<{ id: string; etiket: string; secenekSayisi: number; varsayilan: boolean }>;
    secili: string[];
    alanSiniri: number;
    /** İkili evreni (kurulabilen), mevcutça kapsanan, eksik, kurulamayan, önerilen satır, hesap sınırında kalan. */
    evren: number;
    kapsanan: number;
    eksik: number;
    gecersiz: number;
    satir: number;
    kalan: number;
  };
  kapsam: { alanlar: KapsamOlcusu; dallar: KapsamOlcusu; ikililer: KapsamOlcusu; uyarilar: KapsamOlcusu };
  /** Elenen öneriler: mevcut senaryolarca kapsanan, denklik gereği, reddedilen, ertelenen. */
  elenen: { kapsanan: number; denklik: number; reddedilen: number; ertelenen: number };
}

export interface PairwiseGirdisi {
  /** Alanlar ve tüm olası değerleri (sıralı; değerler metin). */
  alanlar: Array<{ anahtar: string; degerler: string[] }>;
  /** Başlangıç satırı (tabana yakın kalınır). */
  taban?: Record<string, string>;
  /** Satırda alanın geçerli değerleri (bağımlı liste); verilmezse tüm değerler. */
  secenekler?: (satir: Record<string, string>, anahtar: string) => string[];
  /** Değeri yazar ve bağımlıları düzeltir; sabit alanlar bozulacaksa ya da değer geçersizse null. */
  ata?: (satir: Record<string, string>, anahtar: string, deger: string, sabit: Set<string>) => Record<string, string> | null;
  /** Satırda görünen alanlar. */
  gorunurler?: (satir: Record<string, string>) => Set<string>;
  /** Alanın görünürlüğünü / listesini yöneten alanlar (tamamlamada denenir). */
  kontrolculer?: (anahtar: string) => string[];
  /** Satır kurallardan geçiyor mu. */
  gecerliMi?: (satir: Record<string, string>) => boolean;
  /** İkilinin ağırlığı (risk; büyük olan önce). */
  agirlik?: (ikili: string) => number;
  /** Zaten kapsanan ikililer (ikiliAnahtari biçimi). */
  kapsanan?: Iterable<string>;
  satirSiniri?: number;
  tamamlamaSiniri?: number;
}

export interface PairwiseSonucu {
  evren: string[];
  kapsanan: string[];
  gecersiz: string[];
  satirlar: Array<{ satir: Record<string, string>; yeniIkililer: string[] }>;
  kalan: string[];
}

export declare function ikiliAnahtari(a: string, av: string, b: string, bv: string): string;
export declare function ikiliCoz(anahtar: string): Array<[string, string]>;
export declare function pairwiseUret(g: PairwiseGirdisi): PairwiseSonucu;
export declare function kararAgirliklari(kararlar: ReadonlyArray<OneriKarari>, ekranId: string | null, alanKapsami?: (k: OneriKarari) => boolean): { carpan(tur: string, alanlar: string[]): number };
export declare function normalMetin(m: unknown): string;
export declare function kisalt(m: unknown, n?: number): string;
export declare function oneriPuani(neden: string, ic: number, carpan: number): number;
export declare function oneriRedDurumu(kararlar: ReadonlyArray<OneriKarari>, kimlik: string, simdiMs: number): 'reddedilen' | 'ertelenen' | null;
export declare function senaryoOnerileri(g: OneriGirdisi): OneriSonucu;
