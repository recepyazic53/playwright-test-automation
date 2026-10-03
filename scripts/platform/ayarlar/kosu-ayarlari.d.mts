// scripts/platform/ayarlar/kosu-ayarlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface KosuAyarTanimi {
  anahtar: string; bolum?: 'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama' | 'testVerisi'; altBolum?: 'gelismis';
  /** Ayarlar > Koşu sayfasında profillerin yanında görünür (bölümün diğer ayarları "Gelişmiş" altında). */ ana?: boolean;
  /** Tarama / akış kaydı ayarının koşudaki eşi ("Tarama ve akış kaydında koşu ayarlarını kullan" açıkken eşi kullanılır). */ esi?: string;
  grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin' | 'onay'; varsayilan: string | number | boolean;
  secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number;
  /** Ayar yalnız başka bir ayar bu değerdeyken (deger) ya da bu değerlerden birindeyken (degerler) kullanılır (arayüzde aksi hâlde pasif + açıklama). */
  etkinKosul?: { anahtar: string; deger?: string; degerler?: string[]; pasifAciklama: string };
}
export interface KosuAyarlari {
  video: string; videoBoyutu: 'kucuk' | 'ekran'; ekranGoruntusu: string; adimGoruntusu: 'her' | 'yalnizKalan' | 'secili' | 'kapali'; iz: string; indirilenDosya: 'kapali' | 'yalnizHata' | 'her'; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
  zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; /** Servisler: aynı anda en çok N servis senaryosu (1 = sırayla). */ servisEszamanli: number; /** Servise giden her istekten sonra bekleme (ms). */ servisIstekBeklemeMs: number; tarihBicimi: string; yetkiHatasinda: 'tekrarYok' | 'yenileVeTekrar'; /** Sürekli öğrenme: güçlü "değer ekle" önerileri kendiliğinden (varsayılan kapalı). */ ogrenmeOtomatikEkle: boolean; taramaZamanAsimiDk: number; kayitZamanAsimiDk: number; senaryoSayfaBoyu: number; kosuGecmisiSayfaBoyu: number; /** Arayüz: bundan çok seçenekli açılır listeler yazarak aranır. */ aranabilirSecimEsigi: number; otomatikYedekSayisi: number; sonucSaklamaGun: number;
  taramaSayfaAcilmaSn: number; hizliAlanIslemSn: number; kesifSecenekSiniri: number; /** Bağlı liste keşfi: en çok kat / her katta denenecek değer. */ zincirDerinligi: number; zincirOrnek: number; /** Hızlı test kaydında önerilen alternatif senaryo sayısı. */ hizliOneriSayisi: number; taramaEkranGenisligi: number; taramaEkranYuksekligi: number; taramaDili: string;
  taramaGirisKipi: 'bastan' | 'saklananOturum'; taramaOturumKontrolSn: number; taramaGirisAlanBeklemeSn: number;
  gorunmeyenAlanBeklemeSn: number; gorunmeyenAlan: 'atla' | 'kaldir'; alanSonrasiKosulSn: number; arkaPlanIstekSn: number; adimGostergeSn: number;
  onayPenceresi: 'iptal' | 'onayla'; oturumKontrolSn: number; girisAlanBeklemeSn: number; tabloSatirSecimi: 'ilk' | 'rastgele'; sqlSatirSiniri: number;
  kosuEkranGenisligi: number; kosuEkranYuksekligi: number; kosuDili: string; saatDilimi: string;
  /** Ekran senaryoları: aynı anda en çok N (1 = sırayla; eski "Eşzamanlı senaryo: sırayla" 1 sayılır) ve senaryolar arası bekleme (ms). */
  ekranEszamanli: number; ekranBeklemeMs: number;
  zamanliKacan: 'atla' | 'sonraKos'; zamanliCakisma: 'atla' | 'bitinceKos'; raporGoruntuSiniriMb: number; raporSaklamaGun: '30' | '90' | '180' | '0'; benzerlikEsigi: number;
  medyaInceltme: 'kapali' | 'basarili' | 'hatali' | 'ikisi'; medyaInceltmeGun: number; medyaInceltmeKoru: boolean;
  /** Ayarlar > Koşu > Tek senaryoda en çok veri koşusu (tablodan çoklu satır). */
  enCokVeriKosusu: number;
  /** Tarama ve akış kaydında koşunun ekran boyutu, dili, oturum kontrolü ve giriş alanı beklemesi kullanılsın (kayıtsızsa eşlerden türetilir). */
  taramaKosuAyarlariniKullan: boolean;
  /** Koşu / Deneme onayındaki "Tarayıcı penceresinde izle" seçiminin ön değeri (env yok). */
  tarayiciPenceresindeIzle: boolean;
  /** Ayarlar > Arayüz > Sonuçlar özeti (Sonuçlar > Genel > Özet kartlarının eşikleri; sonuclar/farkindalik.mjs). */
  ozetKirmiziGun: number; ozetYavaslamaYuzde: number; ozetKosmayanGun: number; ozetYedekGun: number;
}
export interface TaramaEtkinAyarlari { kaynak: 'kosu' | 'ayri'; genislik: number; yukseklik: number; dil: string | null; oturumKontrolSn: number; girisAlanBeklemeSn: number }
export declare const TARAMA_ESLERI: ReadonlyArray<[string, string]>;
export declare function taramaEtkinAyarlari(a: KosuAyarlari): TaramaEtkinAyarlari;
export declare const KOSU_AYAR_ANAHTARI: string;
export declare const KOSU_AYAR_TANIMLARI: ReadonlyArray<KosuAyarTanimi>;
export declare function varsayilanKosuAyarlari(): KosuAyarlari;
export declare function kosuAyarlariniOku(vt: Veritabani): KosuAyarlari;
export declare function sqlSatirSiniriOku(vt: Veritabani): number;
export declare function kosuAyarlariniKaydet(vt: Veritabani, girdi: unknown): KosuAyarlari;
export declare function kosuOrtamDegiskenleri(a: KosuAyarlari): Record<string, string>;
export declare function kayitliKosuOrtamDegiskenleri(vt: Veritabani): Record<string, string>;
