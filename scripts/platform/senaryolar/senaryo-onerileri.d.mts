// scripts/platform/senaryolar/senaryo-onerileri.mjs için tip bildirimi (birim testleri import eder).
import type { FormSemasi } from './model-formu.mjs';
import type { DogrulamaBulgusu, Gorunurlukler } from '../../dogrulama/senaryo-dogrulayici.mjs';

export declare const KOMBINASYON_ALAN_SINIRI: number;
export declare const KOMBINASYON_UST_SINIRI: number;
export declare const KOMBINASYON_HESAP_SINIRI: number;
export declare const KOSUL_DAL_SINIRI: number;
export declare const BILEREK_BOS: 'bilerekBos';
export declare const ONERI_TURLERI: readonly ['zorunlu', 'sinir', 'kosullu', 'kombinasyon'];
export declare const MASKE: string;

export type OneriTuru = (typeof ONERI_TURLERI)[number];

export interface OneriSenaryosu {
  id: string;
  baslik: string;
  veri: Record<string, unknown>;
  tabloSecimleri?: Record<string, Record<string, string>> | null;
  /** Seçili ortamdaki son sonucun durumu (taban seçiminde başarılı olan önce). */
  sonDurum?: string | null;
}

export interface OneriGirdisi {
  /** Akışın modeli (model-formu.mjs > akisModeli). */
  model: unknown;
  /** formSemasiOlustur(model, altModeller). */
  sema: FormSemasi;
  /** Tek doğrulayıcının görünürlüğü: (veri) => gorunurlukleriHesapla(veri, baglam). */
  gorunurlukHesapla: (veri: Record<string, unknown>) => Pick<Gorunurlukler, 'adimlar' | 'alanlar'>;
  /** Tek doğrulayıcı (verilirse taban ve kombinasyonlar ondan geçer). */
  dogrula?: (veri: Record<string, unknown>) => { hatalar: DogrulamaBulgusu[] };
  /** Aynı ekranın (aynı akışın) mevcut senaryoları. */
  senaryolar: OneriSenaryosu[];
  /** Alan kimliği → test verisi tablosu başvurusu (${Tablo.Sütun}); değer üretilmeyen alanlar bununla dolar. */
  tabloBasvurulari?: Record<string, string>;
  /** Kombinasyonu istenen seçim alanlarının kimlikleri (kullanıcı seçer; en çok KOMBINASYON_ALAN_SINIRI). */
  kombinasyonAlanlari?: string[];
  /** Gizli ad denetimi (Ayarlar > Maskeleme ek adlarıyla). */
  gizliAdMi?: (ad: string) => boolean;
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
  /** İçeriği zaten mevcut bir senaryoda varsa o senaryo. */
  mevcut: { id: string; baslik: string } | null;
  /** Değeri olmayan (üretilmeyen) zorunlu alanlar. */
  eksikler: string[];
  /** Mevcut değil, beklenen sonucu belli ve eksiği yok (kayıtta ayrıca doğrulayıcıdan geçer). */
  eklenebilir: boolean;
}

export interface OneriSonucu {
  taban: { kaynak: 'senaryo' | 'varsayilan'; senaryoId: string | null; baslik: string | null; eksikler: string[] };
  oneriler: Oneri[];
  notlar: Array<{ tur: string; mesaj: string }>;
  kombinasyon: {
    secilebilir: Array<{ id: string; etiket: string; secenekSayisi: number }>;
    secili: string[];
    alanSiniri: number;
    ustSinir: number;
    toplam: number;
    mevcut: number;
    eksik: number;
    gecersiz: number;
    listelenen: number;
    kesildi: boolean;
    cokFazla: boolean;
  };
}

export declare function senaryoOnerileri(g: OneriGirdisi): OneriSonucu;
