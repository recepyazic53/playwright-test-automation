// scripts/platform/veritabani/sonuc-deposu.mjs için tip bildirimi.
import type { Veritabani } from './baglanti.mjs';

export type SonucDurumu = 'basarili' | 'basarisiz' | 'atlanan' | 'durduruldu';
export interface Sayilar { basarili: number; basarisiz: number; atlanan: number; durduruldu: number }
export interface SonucGirdisi {
  id?: string; kosuId: string; projeId: string; testKimligi?: string | null; senaryoAnahtari?: string | null;
  senaryoId?: string | null; senaryoBaslik: string; urunAdi?: string | null; durum: string; hamDurum?: string | null;
  sureMs?: number | null; hataMesaji?: string | null; beklenenSonuc?: string | null;
  atlananAlanlar?: Array<{ alan: string; neden?: string | null }>; deneme?: number; baslangic?: string | null; bitis?: string | null;
  adimlar?: Array<{ ad: string; durum: string; sureMs?: number | null; hataMesaji?: string | null }>;
  medya?: Array<{ id?: string; tur: string; ad: string; icerikTuru: string; boyut: number; dosya: string; olusturulma?: string }>;
  yakalananMesajlar?: Array<{ kaynak: string; metin: string; adim?: string | null; sayi?: number; ilk?: string; son?: string; beklenen?: boolean }>;
  /** Raporlayıcının "veriKosusu" annotation'ı (veriKosusuTemizle doğrular). */
  veriKosusu?: unknown;
  /** Raporlayıcının "kurtarma" annotation'ı (kurtarmaNotlariTemizle doğrular). */
  kurtarma?: unknown;
}
/** Ekran sonucunda çalışan kurtarma kuralının notu. */
export interface KurtarmaNotu { kuralId: string; kural: string; adim: string | null; durum: string; deneme: number; not: string }
export declare function kurtarmaNotlariTemizle(v: unknown): KurtarmaNotu[];
/** Sonucun veri koşusu bilgisi: hangi tablo satırlarıyla (açık sütunlar) ve model sürümüyle koştu. */
export interface SonucVeriKosusu {
  anahtar: string | null; ad: string | null; modelSurumu: number | null;
  satirlar: Array<{ grup: string; tablo: string; etiket?: string; satirId: string; satirAdi: string; guncellenme?: string; degerler: Record<string, string | null>; gizliSutunlar: string[] }>;
}
export declare function veriKosusuTemizle(v: unknown): SonucVeriKosusu | null;
export interface YakalananMesajOgesi { kaynak: string; metin: string; kalip: string; adim: string | null; sayi: number; beklenen: boolean; ilk: string; son: string }
export interface YakalananMesajKaliplari {
  toplam: number; beklenmeyen: number; kaynaklar: Record<string, number>;
  kaliplar: Array<{
    kaynak: string; kalip: string; ornekMetin: string; sayi: number; beklenen: boolean; beklenenSayisi: number; beklenmeyenSayisi: number;
    senaryoSayisi: number; gecenTestSayisi: number; kalanTestSayisi: number; urunler: string[]; ilk: string; son: string;
    sonuclar: Array<{ sonucId: string; kosuId: string; senaryoId: string | null; senaryoBaslik: string; ortamId: string | null; adim: string | null;
      zaman: string; durum: string; sayi: number; beklenen: boolean }>;
  }>;
}
export interface MedyaOgesi { id: string; tur: string; ad: string; icerikTuru: string; boyut: number; olusturulma: string; silinme: string | null; yedekDisi: boolean }
export interface SonucDetayi {
  id: string; kosuId: string; projeId: string; senaryoId: string | null; senaryoBaslik: string; senaryoAnahtari: string | null; urun: string; ekranDurumu: string | null;
  durum: SonucDurumu; hamDurum: string | null; sureMs: number | null; hataMesaji: string | null; hataKategorisi: string | null;
  hataKalibi: string | null; beklenenSonuc: string | null; beklenenGorulen: { beklenen: string; gorulen: string } | null;
  atlananAlanlar: Array<{ alan: string; neden?: string }>; deneme: number; baslangic: string | null; bitis: string | null;
  kosuTuru: string; kosuKapsami: string | null;
  adimlar: Array<{ ad: string; durum: string; sureMs: number | null; hataMesaji: string | null }>;
  medya: MedyaOgesi[];
  yakalananMesajlar: YakalananMesajOgesi[];
  veriKosusu: SonucVeriKosusu | null;
  kurtarma: KurtarmaNotu[];
}
export interface KosuGecmisiSatiri extends Sayilar {
  id: string; tur: string; kapsam: string | null; durum: string; baslangic: string; bitis: string | null; kaynak: string; urunSayisi: number;
}
export interface KartOzeti extends Sayilar { kosuId?: string; z?: number; kapsam?: string | null }

export declare const SONUC_DURUMLARI: readonly SonucDurumu[];
export declare const KOSU_DURUMLARI: readonly string[];
export declare const MEDYA_TURLERI: readonly string[];
export declare function kosuKaydet(vt: Veritabani, girdi: { id: string; projeId: string; ortamId?: string | null; tur: 'tam' | 'tekil'; kapsam?: string | null; baslangic?: string; kaynak?: string; tekrarKaynagi?: string | null;
  uygulamaSurumu?: string | null }): string;
/** Koşu özetindeki uygulama sürümü etiketi (ozet_json.uygulamaSurumu; yoksa null). */
export declare function uygulamaSurumuOku(ozetJson: unknown): string | null;
export declare function kosuyuBitir(vt: Veritabani, id: string, girdi: { durum: string; bitis?: string }): void;
export declare function sonucKaydet(vt: Veritabani, g: SonucGirdisi): { id: string; silinecekMedyaDosyalari: string[] };
export declare function kosulariHesapIcinOku(vt: Veritabani, projeId: string): Array<{
  id: string; tur: string; kapsam: string | null; durum: string; baslangic: string; bitis: string | null; kaynak: string; ortamId: string | null;
  z: number; urunler: Record<string, Sayilar>;
}>;
export declare function sonucOzeti(vt: Veritabani, projeId: string, secim?: { urun?: string | null; baslangic?: string | null; bitis?: string | null }): {
  ekranlar: Array<{ anahtar: string; ad: string; senaryoSayisi: number; ekranDurumu: string | null; ortakAkis: boolean; son: { basarili: number; basarisiz: number; atlanan: number; durduruldu: number } | null }>;
  kart: { son: KartOzeti; onceki: KartOzeti | null; enYeniZ?: number; enEskiZ?: number; urunSayisi?: number } | null;
  trend: Array<Sayilar & { kosuId: string; z: number; kapsam: string | null }>;
  /** Genel'de: kapsamı ne olursa olsun tüm tam koşular (ürün sayfasında boş). */
  trendTumKapsamlar: Array<Sayilar & { kosuId: string; z: number; kapsam: string | null }>;
  kosuGecmisi: KosuGecmisiSatiri[];
};
export declare function kosuDetayi(vt: Veritabani, kosuId: string): {
  kosu: Sayilar & { id: string; projeId: string | null; ortamId: string | null; tur: string; kapsam: string | null; durum: string; baslangic: string; bitis: string | null; kaynak: string;
    tekrarKaynagi: { id: string; baslangic: string | null; bitis: string | null; var: boolean } | null; tekrarlar: Array<{ id: string; baslangic: string; bitis: string | null; durum: string }> };
  sonuclar: Array<{
    id: string; senaryoId: string | null; senaryoBaslik: string; senaryoAnahtari: string | null; durum: string; hamDurum: string | null; sureMs: number | null;
    hataKategorisi: string | null; hataKalibi: string | null; urun: string; urunAnahtari: string; ekranDurumu: string | null; baslangic: string | null; bitis: string | null;
    deneme: number; ekranGoruntusuSayisi: number; videoSayisi: number; kurtarma: KurtarmaNotu[]; veriKosusu: SonucVeriKosusu | null;
  }>;
} | null;
export declare function sonucDetayi(vt: Veritabani, sonucId: string): SonucDetayi | null;
export declare function hataKaliplari(vt: Veritabani, projeId: string, filtre?: { urun?: string | null; baslangic?: string | null; bitis?: string | null; limit?: number }): {
  toplam: number; kategoriler: Record<string, number>;
  kaliplar: Array<{ urun: string; kategori: string; kalip: string; sayi: number; senaryoSayisi: number; ilk: string; son: string; ornekSonucId: string;
    sonuclar: Array<{ sonucId: string; kosuId: string; senaryoId: string | null; senaryoBaslik: string; ortamId: string | null; adim: string | null; zaman: string }> }>;
  yakalanan: YakalananMesajKaliplari;
};
export declare function yakalananMesajKaliplari(vt: Veritabani, projeId: string, filtre?: { urun?: string | null; baslangic?: string | null; bitis?: string | null; limit?: number }): YakalananMesajKaliplari;
export declare function medyaGetir(vt: Veritabani, id: string): (MedyaOgesi & { dosya: string; senaryoBaslik: string | null; sonucZamani: string | null }) | null;
export declare function kosudakiSonucuBul(vt: Veritabani, kosuId: string, arama: { senaryoAnahtari?: string; senaryoBaslik?: string }): {
  detay: SonucDetayi; sonEkranGoruntusuId: string | null; videoId: string | null; basarisizAdim: string | null;
} | null;

export declare function eskiSonuclariSil(vt: Veritabani, gun: number, s?: { simdi?: number; tumu?: boolean }): { kosu: number; sonuc: number; servisKosusu: number; akisKosusu: number; medyaDosyalari: string[] };
