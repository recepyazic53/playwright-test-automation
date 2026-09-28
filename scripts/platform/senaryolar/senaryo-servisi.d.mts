// scripts/platform/senaryolar/senaryo-servisi.mjs için tip bildirimi (birim testleri import eder).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DepoHatasi } from '../veritabani/depo.mjs';

export type Bulgu = { alan: string; mesaj: string };

export declare const DENEME_BASLIK_ON_EKI: string;
export declare const BASLIK_EN_UZUN: number;
export declare class SenaryoDogrulamaHatasi extends DepoHatasi {
  constructor(mesaj: string, hatalar: Bulgu[], uyarilar?: Bulgu[]);
  hatalar: Bulgu[];
  uyarilar: Bulgu[];
}
export declare class SenaryoCakismaHatasi extends DepoHatasi {
  constructor(mesaj: string);
}

export declare function senaryoKaynagi(icerik: unknown): { dosya: string; ad: string } | null;
export declare function senaryoKaynakAnahtari(icerik: unknown): string | null;
export declare function veriGudumluMu(icerik: unknown): boolean;
export type AkisOzeti = { id: string; ad: string; varsayilan: boolean; adimSayisi: number };
export declare function senaryoAkisi(icerik: unknown): string | null;
export declare function senaryoOrtamVerisi(vt: Veritabani, icerik: Record<string, unknown>, ortamId: string): Record<string, unknown> | null;
export declare function modelBaglami(vt: Veritabani, ekranId: string, akisId?: string | null, secenekler?: { listesiz?: boolean; surum?: number }): {
  model: Record<string, unknown>; altModeller: Record<string, Record<string, unknown>>; surum: number;
  /** Akışlarla birlikte ham model. */ tamModel: Record<string, unknown>; akislar: AkisOzeti[]; akisId: string;
  /** Bulunamayan ortak akış dosyaları (açılamayan adımlar modelden düşer). */ eksikOrtakAkislar: string[];
} | null;
export declare function ekranVeriKaynagi(
  vt: Veritabani, projeId: string, ekran: { id: string; anahtar: string }
): { spec: string; dosya: string; yol: string; model: boolean } | null;

export interface SenaryoSatiri {
  id: string; baslik: string; ekranId: string | null; ekranAdi: string | null; kosuyaDahil: boolean; veriGudumlu: boolean;
  modelVar: boolean; kaynak: { dosya: string; ad: string } | null;
  baglamProfili: { deger: string | null; varsayilan: boolean; ad: string | null } | null;
  beklenenSonuc: { tur: 'basari' | 'hata'; metin: string; aciklama: string } | null;
  sonSonuc: { durum: string; zaman: string; sonucId: string; kosuId: string } | null;
  mutlakaGorunmeliSayisi: number;
  /** Ekran paketindeki bir öneriden eklendi mi (icerik.paket). */
  paketten: boolean;
  /** Model koşucusuyla çalışır mı (bkz. model-kosusu.mjs). */
  modelKosusu: boolean;
  /** Tarihi geçmiş (ya da bugün koşulursa sınır dışı) sabit tarih değerleri ("tarih eskidi" rozeti). */
  eskiyenTarihler: Array<{ anahtar: string; etiket: string; deger: string; mesaj: string }>;
  /** Birden çok akışlı ekranda senaryonun akışı (tek akışta null). */
  akis: { id: string; ad: string } | null;
  /** Ekranı devre dışıysa false: senaryo hiçbir koşuya girmez. */
  ekranEtkin: boolean;
  guncellenme: string;
  /** Yalnız birleşik listede (ortamId verilmeden): projedeki her ortam için tanım, Koşuda ve son sonuç. */
  ortamlar?: Array<{ ortamId: string; tanimli: boolean; kosuyaDahil: boolean; sonSonuc: { durum: string; zaman: string; sonucId: string; kosuId: string } | null }>;
}
export declare function senaryoListesi(vt: Veritabani, projeId: string, ortamId: string | null): {
  ekranlar: Array<{ id: string; anahtar: string; ad: string; senaryoSayisi: number; durum: 'etkin' | 'devre_disi' | 'silindi'; modelVar: boolean; olusturulabilir: boolean }>;
  senaryolar: SenaryoSatiri[];
};
export declare function senaryoDetayi(vt: Veritabani, id: string, ortamId: string | null): {
  id: string; projeId: string; ekranId: string | null; baslik: string; kosuyaDahil: boolean; veriGudumlu: boolean;
  kaynak: { dosya: string; ad: string } | null; ortamlar: string[]; veri: Record<string, unknown> | null; mutlakaGorunmeli: string[];
  olusturulma: string; guncellenme: string;
  /** Senaryonun akışı (null: ekranın varsayılan akışı). */
  akis: string | null;
  /** Giriş seçimi (null = ortamın girişiyle, varsayılan). */
  giris: import('./senaryo-girisi.mjs').SenaryoGirisi | null;
  /** Adım ekran görüntüsü seçimi (null = Ayarlar > Koşu > Kayıt'a uyar, varsayılan). */
  adimGoruntusu: import('../ayarlar/kayit-kurallari.mjs').AdimGoruntusuSecimi | null;
  /** Satır seçimleri: "<tabloId>|<etiket>" → { Sütun: değer } (yoksa null). */
  tabloSecimleri: Record<string, Record<string, string>> | null;
  /** Çalıştırma biçimi (tablodan çoklu satır; yoksa null = her grup tek satır). */
  veriKosulari: import('../tablolar/veri-kosulari.mjs').VeriKosulari | null;
};
export declare function ekranGirdileri(vt: Veritabani, projeId: string, ekranId: string, secenekler?: { tumTipler?: boolean }): { girdiler: Array<{ id: string; etiket: string; tip: string; secenekler: Array<{ deger: string; metin: string; ekranDegeri?: string; ekranMetni?: string }> }> };
export declare function formBaglami(vt: Veritabani, projeId: string, ekranId: string, ortamId: string, akisId?: string | null): {
  ekran: { id: string; anahtar: string; ad: string };
  ortamlar: Array<{ id: string; ad: string; varsayilan: boolean }>;
  model: Record<string, unknown> | null;
  altModeller: Record<string, Record<string, unknown>>;
  modelSurumu?: number;
  profiller: Record<string, Array<{ ad: string; tur: 'baglam' | 'testVerisi'; kapsam: 'tum' | 'ortam'; alanlar: Array<{ etiket: string; deger?: string; dolu: boolean }> }>>;
  veriKaynagi: { spec: string; dosya: string; yol: string; model: boolean } | null;
  olusturulabilir: boolean;
  degerListeleri?: import('../servisler/parametre-tanimlari.mjs').ParametreTanimi[];
  /** Gizli sütuna bağlı alanlar (değer yok): alan kimliği → tablo / sütun adı. */
  gizliBaglar?: Record<string, { tablo: string; sutun: string; etiket?: string }>;
  akislar: AkisOzeti[];
  akisId: string | null;
};
export declare function modelHassasAnahtarlari(model: unknown): string[];
export declare function senaryoKaydet(
  vt: Veritabani,
  girdi: {
    id?: string | null; projeId: string; ekranId?: string | null; baslik: unknown; veri?: unknown; ortamIdleri?: unknown;
    kosuyaDahil?: unknown; mutlakaGorunmeli?: unknown; akisId?: unknown; giris?: unknown; tabloSecimleri?: unknown; veriKosulari?: unknown; yapan?: string;
    /** Kayıt grubu "Yeni" + "tabloya da ekle": gruptaki alanların değerleri tabloya yeni satır (senaryoyla TEK işlemde). */
    yeniTabloSatirlari?: unknown;
  },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean }
): { id: string; uyarilar: Bulgu[]; tabloSatirlari?: TabloSatiriEklemesi[] };
/** Senaryoyla birlikte tabloya eklenen (ya da aynı değerlerle zaten var olan) satır; değer içermez. */
export type TabloSatiriEklemesi = { tablo: string; etiket: string; satirId: string; satirAdi: string; yeni: boolean };
/** Mevcut senaryonun ortam başına verisini (+ satır seçimlerini) doğrulayıp yazar; diğer içerik değişmez (değişiklik geçmişine düşer). */
export declare function senaryoOrtamVerileriniYaz(
  vt: Veritabani,
  girdi: { projeId: string; id: string; ortamVerileri: Record<string, Record<string, unknown>>; tabloSecimleri?: unknown; denetlenecekAlanlar?: string[]; yapan?: string },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean }
): { id: string; uyarilar: Bulgu[] };
export declare function kosuyaDahilAyarla(vt: Veritabani, projeId: string, idler: unknown, dahil: boolean, yapan?: string, ortamId?: string | null): { degisen: number };
/** Senaryo o ortamda koşuda mı (ortam başına değer, yoksa genel değer; tanımlı değilse false). */
export declare function ortamdaKosuyaDahil(icerik: unknown, genel: boolean, ortamId: string): boolean;
export declare function senaryolariSil(
  vt: Veritabani, projeId: string, idler: unknown, secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean; yapan?: string }
): { silinen: number };
export declare function senaryoKopyala(vt: Veritabani, projeId: string, id: string, yapan?: string, istenenBaslik?: string): { id: string; baslik: string };
export declare function senaryolariCogalt(vt: Veritabani, projeId: string, g: { idler: unknown; adet: unknown; sablon?: unknown; onay?: boolean }, yapan?: string):
  { onizleme: true; plan: Array<{ kaynakId: string; kaynakBaslik: string; baslik: string; cakisma: boolean }>; cakisanlar: number } | { onizleme: false; olusanlar: Array<{ id: string; baslik: string }> };
export declare function senaryoSonSonucu(vt: Veritabani, id: string, ortamId: string): { sonucId: string; kosuId: string; durum: string; zaman: string } | null;
export declare function senaryoGecmisiniSil(vt: Veritabani, projeId: string, idler: unknown, s?: { onay?: boolean }): { senaryo: number; kayit: number; silindi: boolean };
export declare function senaryoGecmisi(vt: Veritabani, id: string): Array<{
  id: string; zaman: string; islem: string; yapan: string; makineId: string | null; aciklama: string | null; baslik: string; degisenler: string[];
}>;
export type CalistirmaHedefi = {
  senaryoId: string; baslik: string;
  /** Model spec'i (test etiketle bulunur; ad her zaman null). */
  dosya: string; ad: null; ekranId: string | null;
  model: true;
  etiket: string;
  grepDeseni: string;
  /** Koşu proje + ortam kimlikleriyle (playwright.config.ts). */
  genel: { projeId: string; ortamId: string };
};
export declare function calistirmaHedefiCoz(
  vt: Veritabani, projeId: string, senaryoId: unknown, ortamId: unknown,
  secenekler?: { yasakDesenleri?: Array<{ kalip: string; desen: RegExp }> }
): CalistirmaHedefi;
export declare function denemePaketiOlustur(
  vt: Veritabani,
  girdi: { projeId: string; ekranId: string; ortamId: string; veri: unknown; id?: string | null; akisId?: string | null; mutlakaGorunmeli?: unknown; giris?: unknown; adimGoruntusu?: unknown; tabloSecimleri?: unknown },
  secenekler: { geciciEk: string }
): {
  model: true; genel: { projeId: string; ortamId: string }; spec: string; geciciBaslik: string;
  etiket: string; grepDeseni: string; uyarilar: Bulgu[]; denemeSenaryosu: Record<string, unknown>;
};
