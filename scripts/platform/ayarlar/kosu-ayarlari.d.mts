// scripts/platform/ayarlar/kosu-ayarlari.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface KosuAyarTanimi {
  anahtar: string; bolum?: 'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama' | 'testVerisi'; altBolum?: 'gelismis'; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin' | 'onay'; varsayilan: string | number | boolean;
  secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number;
  /** Ayar yalnız başka bir ayar bu değerdeyken (deger) ya da bu değerlerden birindeyken (degerler) kullanılır (arayüzde aksi hâlde pasif + açıklama). */
  etkinKosul?: { anahtar: string; deger?: string; degerler?: string[]; pasifAciklama: string };
}
export interface KosuAyarlari {
  video: string; videoBoyutu: 'kucuk' | 'ekran'; ekranGoruntusu: string; adimGoruntusu: 'her' | 'yalnizKalan' | 'secili' | 'kapali'; iz: string; indirilenDosya: 'kapali' | 'yalnizHata' | 'her'; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
  zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; tarihBicimi: string; yetkiHatasinda: 'tekrarYok' | 'yenileVeTekrar'; taramaZamanAsimiDk: number; kayitZamanAsimiDk: number; senaryoSayfaBoyu: number; kosuGecmisiSayfaBoyu: number; otomatikYedekSayisi: number; sonucSaklamaGun: number;
  taramaSayfaAcilmaSn: number; kesifSecenekSiniri: number; taramaEkranGenisligi: number; taramaEkranYuksekligi: number; taramaDili: string;
  taramaGirisKipi: 'bastan' | 'saklananOturum'; taramaOturumKontrolSn: number; taramaGirisAlanBeklemeSn: number;
  gorunmeyenAlanBeklemeSn: number; gorunmeyenAlan: 'atla' | 'kaldir'; alanSonrasiKosulSn: number; arkaPlanIstekSn: number; adimGostergeSn: number;
  onayPenceresi: 'iptal' | 'onayla'; oturumKontrolSn: number; girisAlanBeklemeSn: number; tabloSatirSecimi: 'ilk' | 'rastgele'; sqlSatirSiniri: number;
  kosuEkranGenisligi: number; kosuEkranYuksekligi: number; kosuDili: string; saatDilimi: string; eszamanliKosu: 'sirayla';
  zamanliKacan: 'atla' | 'sonraKos'; zamanliCakisma: 'atla' | 'bitinceKos'; raporGoruntuSiniriMb: number; raporSaklamaGun: '30' | '90' | '180' | '0'; benzerlikEsigi: number;
  medyaInceltme: 'kapali' | 'basarili' | 'hatali' | 'ikisi'; medyaInceltmeGun: number; medyaInceltmeKoru: boolean;
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
