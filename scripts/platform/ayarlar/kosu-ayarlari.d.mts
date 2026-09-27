// scripts/platform/ayarlar/kosu-ayarlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface KosuAyarTanimi {
  anahtar: string; bolum?: 'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama'; altBolum?: 'gelismis'; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin'; varsayilan: string | number;
  secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number;
  /** Ayar yalnız başka bir ayar bu değerdeyken kullanılır (arayüzde aksi hâlde pasif + açıklama). */
  etkinKosul?: { anahtar: string; deger: string; pasifAciklama: string };
}
export interface KosuAyarlari {
  video: string; ekranGoruntusu: string; iz: string; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
  zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; tarihBicimi: string; taramaZamanAsimiDk: number; kayitZamanAsimiDk: number; senaryoSayfaBoyu: number; kosuGecmisiSayfaBoyu: number; otomatikYedekSayisi: number; sonucSaklamaGun: number;
  taramaSayfaAcilmaSn: number; kesifSecenekSiniri: number; taramaEkranGenisligi: number; taramaEkranYuksekligi: number; taramaDili: string;
  taramaGirisKipi: 'bastan' | 'saklananOturum'; taramaOturumKontrolSn: number; taramaGirisAlanBeklemeSn: number;
  gorunmeyenAlanBeklemeSn: number; gorunmeyenAlan: 'atla' | 'kaldir'; alanSonrasiKosulSn: number; arkaPlanIstekSn: number; adimGostergeSn: number;
  onayPenceresi: 'iptal' | 'onayla'; oturumKontrolSn: number; girisAlanBeklemeSn: number; tabloSatirSecimi: 'ilk' | 'rastgele'; sqlSatirSiniri: number;
  kosuEkranGenisligi: number; kosuEkranYuksekligi: number; kosuDili: string; saatDilimi: string; eszamanliKosu: 'sirayla';
  zamanliKacan: 'atla' | 'sonraKos'; zamanliCakisma: 'atla' | 'bitinceKos'; raporGoruntuSiniriMb: number;
  /** Ayarlar > Koşu > Tek senaryoda en çok veri koşusu (tablodan çoklu satır). */
  enCokVeriKosusu: number;
}
export declare const KOSU_AYAR_ANAHTARI: string;
export declare const KOSU_AYAR_TANIMLARI: ReadonlyArray<KosuAyarTanimi>;
export declare function varsayilanKosuAyarlari(): KosuAyarlari;
export declare function kosuAyarlariniOku(vt: Veritabani): KosuAyarlari;
export declare function sqlSatirSiniriOku(vt: Veritabani): number;
export declare function kosuAyarlariniKaydet(vt: Veritabani, girdi: unknown): KosuAyarlari;
export declare function kosuOrtamDegiskenleri(a: KosuAyarlari): Record<string, string>;
export declare function kayitliKosuOrtamDegiskenleri(vt: Veritabani): Record<string, string>;
