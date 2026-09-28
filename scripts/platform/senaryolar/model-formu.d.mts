// scripts/platform/senaryolar/model-formu.mjs için tip bildirimi (birim testleri import eder).
import type { Gorunurlukler, DogrulamaBulgusu } from '../../dogrulama/senaryo-dogrulayici.mjs';

export interface FormSecenegi { deger: string; metin: string; kosul?: string }

interface OrtakFormAlani {
  id: string;
  etiket: string;
  zorunlu: boolean | null;
  adimId: string | null;
  bolumId: string | null;
  gorunurlukVar: boolean;
  /** Akışta zorunlu (model: mutlakaGorunmeli): her senaryoda koşuda görünmeli. */
  akistaZorunlu?: true;
  hassas?: true;
  anahtar: string;
}
export interface SecimAlani extends OrtakFormAlani {
  tip: 'secim';
  gorunum: 'radyo' | 'liste';
  secenekler: FormSecenegi[] | null;
  bagimlilik: { alan: string; harita: Record<string, FormSecenegi[]> } | null;
  seceneklerKismi: boolean;
}
export interface BasitAlan extends OrtakFormAlani {
  tip: 'metin' | 'sayi' | 'tarih' | 'onayKutusu' | 'dosya';
  bicim?: string;
  kabul?: string;
  varsayilan?: unknown;
}
export interface ProfilAlani extends OrtakFormAlani {
  tip: 'profil';
  profilHavuzu: string;
  varsayilanProfil: string | null;
}
export interface KimlikAlani extends OrtakFormAlani {
  tip: 'kimlik';
  profilAnahtari: string | null;
  kimlikAnahtarlari: string[];
  kimlikTuru: string | Record<string, string> | null;
  bagliAlan: string | null;
  profilHavuzu: string | Record<string, string> | null;
  altAlanlar: Array<{ id: string; etiket: string; tip: 'tarih' | 'metin'; bicim: string | null; kimlikAlani: string | Record<string, string>; gorunurlukVar: boolean }>;
}
export interface AltModelAlani extends OrtakFormAlani {
  tip: 'altModel';
  altModel: { dosya: string; bolum: string } | null;
  alanlar: Array<{ id: string; anahtar: string; etiket: string; zorunlu: boolean; tip: 'secim' | 'metin'; secenekler: FormSecenegi[] | null; hassas: boolean }>;
}
export type FormAlani = SecimAlani | BasitAlan | ProfilAlani | KimlikAlani | AltModelAlani;

export interface FormSemasi {
  modelId: string | null;
  modelAdi: string | null;
  baslik: string;
  adimlar: Array<{
    id: string; baslik: string; sira: number; ayar: string | null;
    /** Adımın çözülmüş görünürlük ifadesi (koşullu adım; ör. ortak akış "dahil" ve "ödeme şekli = kart"). */
    kosul?: Record<string, unknown>;
    bolumler: Array<{ id: string; baslik: string; gorunurlukVar: boolean; alanlar: FormAlani[] }>;
  }>;
  senaryoAlanlari: FormAlani[];
  adimKapsami: Array<{ ayar: string; alanId: string; etiket: string; adimlar: string[]; zorunlu: boolean }>;
  beklenenSonuc: {
    anahtar: string; etiket: string; varyantlar: string[]; basariTipi: string; hataTipi: string | null;
    adimAnahtari: string | null; adimEtiketi: string | null; adimlar: FormSecenegi[];
    mesajAnahtari: string | null; mesajEtiketi: string | null;
    /** Akışta kabul edilen uyarılar (senaryo bunlardan seçer) ve son adımın başarı mesajları (bilgi). */
    uyarilar: Array<{ adim: string; adimBasligi: string; metin: string }>;
    basariMesajlari: string[];
  } | null;
  /** Koşullardaki model alan kimliği → senaryo anahtarı (+ varsayılan değer). */
  alanAnahtarlari?: Record<string, { anahtar: string; varsayilan?: unknown }>;
}

export type FormDegerleri = Record<string, unknown>;

export declare function aramaIcinSadelestir(metin: unknown): string;
export declare function aramaEslesiyorMu(arama: string, ...metinler: Array<string | null | undefined>): boolean;
export declare const ANA_AKIS_ID: string;
export interface AkisOzeti { id: string; ad: string; varsayilan: boolean; adimSayisi: number }
export declare function akisListesi(model: unknown): AkisOzeti[];
export declare function varsayilanAkisId(model: unknown): string;
export declare function akisModeli<T>(model: T, akisId?: string | null): T;
/** Ortak akış adımlarını (adim.ortakAkis) ortak akışın adımlarıyla açar; bulunamayan dosyalar eksikler. */
export declare function ortakAkislariAc(model: any, ortakAkislar: Record<string, any>): { model: any; eksikler: string[] };
export declare function akislariEsitle<T>(model: T): T;
export declare function formSemasiOlustur(model: unknown, altModeller?: Record<string, unknown>): FormSemasi;
export declare function tumFormAlanlari(sema: FormSemasi): FormAlani[];
export declare function yonetilenAnahtarlar(sema: FormSemasi): string[];
export declare function kimlikTuruBul(alan: KimlikAlani, degerler: FormDegerleri, sema: FormSemasi): string | null;
export declare function kimlikAnahtariBul(alan: KimlikAlani, tur: string | null): string | null;
export declare function profilHavuzuBul(alan: KimlikAlani, degerler: FormDegerleri, sema: FormSemasi): string | null;
export declare function secenekleriBul(alan: SecimAlani, degerler: FormDegerleri, sema: FormSemasi): FormSecenegi[];
export declare function formDegerleriniKur(sema: FormSemasi, veri?: Record<string, unknown>): FormDegerleri;
export declare function senaryoNesnesiOlustur(
  sema: FormSemasi,
  degerler: FormDegerleri,
  secenekler?: { gorunurlukHesapla?: (taslak: Record<string, unknown>) => Pick<Gorunurlukler, 'adimlar' | 'alanlar' | 'altAlanlar'>; onceki?: Record<string, unknown> }
): Record<string, unknown>;
export declare function hataKontrolu(alanYolu: string, sema: FormSemasi): string | null;
export declare function hatalariDagit(bulgular: readonly DogrulamaBulgusu[], sema: FormSemasi): { alanlar: Record<string, string[]>; genel: string[] };
export declare function akisMesajlari(model: unknown): { uyarilar: Array<{ adim: string; adimBasligi: string; metin: string }>; basariMesajlari: string[] };
export declare function beklenenSonucEtiketi(sema: FormSemasi, veri: unknown): { tur: 'basari' | 'hata'; metin: string; aciklama: string } | null;
export declare function beklenenHataOnerisi(
  sonuc: { hataMesaji?: string | null; basarisizAdim?: string | null } | null,
  sema: FormSemasi
): { mesaj: string; adim: string | null } | null;
