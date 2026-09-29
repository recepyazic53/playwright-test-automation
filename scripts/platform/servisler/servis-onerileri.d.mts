// scripts/platform/servisler/servis-onerileri.mjs için tip bildirimi (birim testleri import eder).
import type { AlanDegeri, AlanKisiti, AlanTipi, OperasyonSemasi } from './servis-govdesi.mjs';
import type { KapsamOlcusu, OneriKarari, OneriNedeni } from '../senaryolar/senaryo-onerileri.mjs';

export declare const SERVIS_ONERI_TURLERI: readonly ['basari', 'zorunlu', 'sinir', 'negatif', 'deger', 'kombinasyon', 'uyari'];
export type ServisOneriTuru = (typeof SERVIS_ONERI_TURLERI)[number];
export declare const NEGATIF_SINIFLARI: readonly ['sinirDisi', 'uzunlukDisi', 'listeDisi', 'desenDisi', 'bicimDisi', 'yanlisTip'];

/** Metodun bir yaprak alanı (öneri gözüyle). */
export interface ServisOneriAlani {
  /** SOAP: "Input/Tutar"; REST: "yol/id", "sorgu/sayfa", "govde/a/b". */
  yol: string;
  ad: string;
  grup?: 'yol' | 'sorgu' | 'govde';
  tip: AlanTipi;
  /** Tip şemadan mı (WSDL / OpenAPI); değilse (REST örnek gövdeden çıkarım) yanlış tip önerilmez. */
  tipSemadan: boolean;
  /** Etkin zorunluluk: alan ve üst grupları gönderilmek zorunda. */
  zorunlu: boolean;
  nillable?: boolean;
  secenekler?: string[];
  kisit?: AlanKisiti;
  varsayilan?: string;
  /** Hassas: gizli ad, gizli sütuna bağlı ya da ucun gizli alanı (sınır / negatif / pairwise yok, değer yazılmaz). */
  gizli: boolean;
  /** Test verisi tablosu bağı (Parametreler sekmesi). */
  bag?: { tabloId: string; tablo: string; sutun: string; etiket: string; gizli: boolean } | null;
  /** Hesaplama kuralı bağı. */
  kural?: string;
}

export interface ServisOneriMetodu {
  ad: string;
  alanlar: ServisOneriAlani[];
  /** SOAP: alan formu şeması (ek alanlar birleşik). */
  sema?: OperasyonSemasi | null;
  /** REST ucu (yol, sorgu, gövde örneği, içerik türü, metot). */
  uc?: { ad?: string; metot?: string; yol?: string; sorgu?: Array<{ ad: string; deger: string }>; govdeOrnegi?: string; icerikTuru?: string } | null;
  /** Servis alan varsayılanları (★). */
  varsayilanlar?: Record<string, AlanDegeri>;
}

export interface ServisOneriIcerigi {
  operasyon: string;
  govde?: string;
  kontroller?: Array<Record<string, any>>;
  http?: { metot: string; yol: string; icerikTuru?: string };
  tabloSecimleri?: Record<string, Record<string, string>>;
  tur?: string;
  [anahtar: string]: unknown;
}

export interface ServisOneriSenaryosu {
  id: string;
  baslik: string;
  icerik: ServisOneriIcerigi;
  sonDurum?: string | null;
  /** Veri güdümlü koşunun satırları: alan yolu → çözülmüş (gizli olmayan) tablo değeri. */
  degerSatirlari?: Array<Record<string, unknown>> | null;
}

export interface ServisOneriGecmisi {
  hataGunu?: number;
  uyariGunu?: number;
  /** Son hataGunu günde başarısız sonuçlar (senaryo başına). */
  hatalar?: Array<{ senaryoId: string | null; sayi: number }>;
  /** Son uyariGunu günde görülen hata / Fault / iş kuralı mesajları (maskeli; operasyon ve üreten senaryolar). */
  mesajlar?: Array<{ metin: string; operasyon: string | null; sayi: number; senaryoIdleri: string[]; hataTuru?: 'fault' | 'http' | 'yanit' }>;
}

export interface OneriTablosu {
  id: string;
  ad: string;
  sutunlar: Array<{ ad: string; gizli?: boolean }>;
  satirlar: Array<{ ortamId?: string | null; degerler: Record<string, string> }>;
}

export interface ServisOneriGirdisi {
  servis: { id: string; tur: 'soap' | 'rest'; soapSurumu?: '1.1' | '1.2' };
  metotlar: ServisOneriMetodu[];
  senaryolar: ServisOneriSenaryosu[];
  tablolar?: OneriTablosu[];
  ortamId?: string | null;
  /** Yalnız bu metot (verilmezse tümü). */
  operasyon?: string | null;
  kombinasyonAlanlari?: string[] | null;
  gecmis?: ServisOneriGecmisi;
  kararlar?: OneriKarari[];
  reddedilenleriGoster?: boolean;
  ustSinir?: number;
  simdi?: Date;
}

export type ServisOneriBeklenen = { tur: 'basari' } | { tur: 'hata'; mesaj: string; mesajEksik: boolean };

export interface ServisOnerisi {
  kimlik: string;
  tur: ServisOneriTuru;
  neden: OneriNedeni;
  gerekce: string;
  puan: number;
  baslik: string;
  ozet: string;
  operasyon: string;
  degisiklikler: Array<{ etiket: string; deger: string }>;
  beklenen: ServisOneriBeklenen;
  beklenenMetni: string;
  /** Kaydedilecek senaryo içeriği (kontroller = beklenen sonuç). */
  icerik: ServisOneriIcerigi;
  eksikler: string[];
  engel: string | null;
  alanlar: string[];
  ikililer?: string[];
  degerler?: string[];
  eklenebilir: boolean;
  reddedildi: boolean;
}

export interface ServisOneriSonucu {
  oneriler: ServisOnerisi[];
  toplam: number;
  kalan: number;
  ustSinir: number;
  notlar: Array<{ tur: string; mesaj: string }>;
  tabanlar: Array<{ operasyon: string; kaynak: 'senaryo' | 'sema'; senaryoId: string | null; baslik: string | null; eksikler: string[] }>;
  kombinasyon: {
    operasyon: string | null;
    secilebilir: Array<{ id: string; etiket: string; secenekSayisi: number; varsayilan: boolean }>;
    secili: string[];
    alanSiniri: number;
    evren: number; kapsanan: number; eksik: number; gecersiz: number; satir: number; kalan: number;
  };
  kapsam: { metotlar: KapsamOlcusu; alanlar: KapsamOlcusu; degerler: KapsamOlcusu; ikililer: KapsamOlcusu; mesajlar: KapsamOlcusu };
  elenen: { kapsanan: number; denklik: number; reddedilen: number; ertelenen: number };
}

export interface MetotErisimi {
  oku(icerik: ServisOneriIcerigi): { degerler: Record<string, AlanDegeri>; uyumsuz: string[] };
  yaz(icerik: ServisOneriIcerigi, degisenler: Record<string, AlanDegeri>): ServisOneriIcerigi | null;
}

export declare const maskeliMi: (m: unknown) => boolean;
export declare function basariKontrolleri(tur: 'soap' | 'rest'): Array<Record<string, string>>;
export declare function hataKontrolleri(tur: 'soap' | 'rest', mesaj?: string, hataTuru?: 'fault' | 'http' | 'yanit'): Array<Record<string, string>>;
export declare function metotErisimi(servisTuru: 'soap' | 'rest', m: ServisOneriMetodu, soapSurumu?: '1.1' | '1.2'): MetotErisimi;
export declare function kuralIhlaliMi(a: ServisOneriAlani, d: string): boolean;
export declare function sinirAdaylari(a: ServisOneriAlani, tabanDeger: string | undefined): {
  pozitif: { deger: string; etiket: string } | null; negatifler: Array<{ sinif: string; deger: string; etiket: string }>; notlar: string[];
};
export declare function semadanTaban(servisTuru: 'soap' | 'rest', m: ServisOneriMetodu, soapSurumu?: '1.1' | '1.2'): { icerik: ServisOneriIcerigi };
export declare function servisOnerileri(g: ServisOneriGirdisi): ServisOneriSonucu;
