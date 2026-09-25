// scripts/platform/veritabani/depo.mjs için tip bildirimi (sonraki adımlar ve TS testleri import eder).
import type { Veritabani } from './baglanti.mjs';
import type { KasaDurumu } from '../kasa.mjs';

export declare class DepoHatasi extends Error {
  constructor(mesaj: string);
}

export type GecmisIslemi = 'olustur' | 'guncelle' | 'sil' | 'birlestirme_cakismasi' | 'ice_aktarma_uzerine_yazildi';
export type IkiAsamaliTur = 'yok' | 'totp' | 'sms';
export type TestVerisiDegeri = string | number | boolean | null;

export interface Proje { id: string; ad: string; aciklama: string | null; ayarlar: Record<string, unknown>; olusturulma: string; guncellenme: string }
export interface Ortam { id: string; projeId: string; ad: string; tabanUrl: string; varsayilan: boolean; ayarlar: Record<string, unknown>; olusturulma: string; guncellenme: string }
export interface GirisProfili {
  id: string; projeId: string; ortamId: string | null; ad: string; kullaniciAdi: string;
  ikiAsamaliTur: IkiAsamaliTur; smsAyari: Record<string, unknown>;
  parolaVar: boolean; totpGizliVar: boolean;
  /** Yalnızca { coz: true } ile ve kasa açıkken dolu; aksi halde null. */
  parola: string | null;
  totpGizli: string | null;
  olusturulma: string; guncellenme: string;
}
export interface BaglamProfili {
  id: string; projeId: string; tur: string; ad: string;
  /** null = tüm ortamlar. */
  ortamId: string | null;
  /** { yalnizAd: true } ile listelenirse null. */
  alanlar: Record<string, unknown> | null;
  olusturulma: string; guncellenme: string;
}
export interface TestVerisiAlani { ad: string; etiket: string; tip: string; hassas: boolean }
export interface TestVerisiTuru { id: string; projeId: string; ad: string; alanlar: TestVerisiAlani[]; olusturulma: string; guncellenme: string }
export interface TestVerisiProfili {
  id: string; projeId: string; turId: string; ad: string;
  /** null = tüm ortamlar. */
  ortamId: string | null;
  /** Hassas alanlar yalnızca { coz: true } ile düz metin; aksi halde null. */
  degerler: Record<string, unknown>;
  hassasAlanlar: string[];
  /** Değeri kayıtlı (boş olmayan) hassas alanlar. */
  doluHassasAlanlar: string[];
  olusturulma: string; guncellenme: string;
}
export type EkranDurumu = 'etkin' | 'devre_disi' | 'silindi';
export interface Ekran {
  id: string; projeId: string; anahtar: string; ad: string; aciklama: string | null; olusturulma: string; guncellenme: string;
  /** 'devre_disi': senaryoları koşulara girmez · 'silindi': mezar taşı (yalnızca silinenlerDahil ile listelenir). */
  durum: EkranDurumu;
  /** Sol listelerdeki elle sıra (null = ada göre, sona). */
  sira: number | null;
}
export interface EkranModeli { id: string; ekranId: string; surum: number; model: Record<string, unknown>; aciklama: string | null; olusturulma: string }
export interface Senaryo {
  id: string; projeId: string; ekranId: string | null; baslik: string; icerik: Record<string, unknown>;
  kosuyaDahil: boolean; olusturulma: string; guncellenme: string;
}
export interface GecmisKaydi {
  id: string; varlikTuru: string; varlikId: string; islem: GecmisIslemi; yapan: string; makineId: string | null;
  zaman: string; onceki: Record<string, unknown> | null; sonraki: Record<string, unknown> | null; aciklama: string | null;
}
export interface Makine { id: string; ad: string; olusturulma?: string }
export interface Kosu {
  id: string; projeId: string | null; ortamId: string | null; makineId: string; tur: string; durum: string;
  baslangic: string; bitis: string | null; ozet: Record<string, unknown>;
}
export interface KosuSonucu {
  id: string; kosuId: string; senaryoId: string | null; senaryoBaslik: string; durum: string; sureMs: number | null;
  hataMesaji: string | null; ekler: Record<string, unknown>; baslangic: string | null; bitis: string | null;
}

export declare function jsonMetni(deger: unknown, alan: string, beklenen?: 'nesne' | 'dizi' | 'herhangi'): string;
export declare function gecmisYaz(vt: Veritabani, kayit: {
  varlikTuru: string; varlikId: string; islem: GecmisIslemi; yapan?: string; onceki?: unknown; sonraki?: unknown; aciklama?: string;
}): void;

export declare function gecmisYapaniniNormallestir(satir: Record<string, unknown>): Record<string, unknown>;

export declare function veritabaniniHazirla(yol?: string | null): Promise<Veritabani>;
export declare function yerelMakine(vt: Veritabani): { id: string; ad: string };
export declare function makineleriListele(vt: Veritabani): Makine[];
export declare function sayimlar(vt: Veritabani): Record<string, number>;
export interface PlatformDurumOzeti {
  semaSurumu: number;
  desteklenenSemaSurumu: number;
  makineId: string | null;
  kasa: KasaDurumu;
  sifreliAlanGocu: 'bekliyor' | 'tamam';
  sayimlar: Record<string, number>;
}
export declare function platformDurumOzeti(vt: Veritabani): PlatformDurumOzeti;

export declare function ayarGetir(vt: Veritabani, anahtar: string): unknown;
export declare function ayarYaz(vt: Veritabani, anahtar: string, deger: unknown): void;

export declare function projeKaydet(vt: Veritabani, girdi: { id?: string; ad: string; aciklama?: string | null; ayarlar?: Record<string, unknown> }): string;
export declare function projeGetir(vt: Veritabani, id: string): Proje | undefined;
export declare function projeleriListele(vt: Veritabani): Proje[];
export declare function projeSil(vt: Veritabani, id: string): boolean;

export declare function ortamKaydet(vt: Veritabani, girdi: { id?: string; projeId: string; ad: string; tabanUrl: string; varsayilan?: boolean; ayarlar?: Record<string, unknown> }): string;
export declare function ortamlariListele(vt: Veritabani, projeId: string): Ortam[];
export declare function ortamGetir(vt: Veritabani, id: string): Ortam | undefined;
export declare function ortamSil(vt: Veritabani, id: string): boolean;

export declare function girisProfiliKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; ortamId?: string | null; ad: string; kullaniciAdi: string;
  /** undefined = mevcut değeri koru, null/'' = sil */
  parola?: string | null;
  ikiAsamaliTur?: IkiAsamaliTur;
  totpGizli?: string | null;
  smsAyari?: Record<string, unknown>;
  yapan?: string;
}): string;
export declare function girisProfiliGetir(vt: Veritabani, id: string, secenekler?: { coz?: boolean }): GirisProfili | undefined;
export declare function girisProfilleriniListele(vt: Veritabani, projeId: string): GirisProfili[];
export declare function girisProfiliSil(vt: Veritabani, id: string, yapan?: string): boolean;

export declare function baglamProfiliKaydet(vt: Veritabani, girdi: { id?: string; projeId: string; ortamId?: string | null; tur: string; ad: string; alanlar?: Record<string, unknown>; yapan?: string }): string;
export declare function baglamProfiliGetir(vt: Veritabani, id: string): BaglamProfili | undefined;
export declare function baglamProfilleriniListele(vt: Veritabani, projeId: string, tur?: string, secenekler?: { yalnizAd?: boolean }): BaglamProfili[];
export declare function baglamProfiliSil(vt: Veritabani, id: string, yapan?: string): boolean;

export declare function testVerisiTuruKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; ad: string; alanlar: ReadonlyArray<{ ad: string; etiket?: string; tip?: string; hassas?: boolean }>;
}): string;
export declare function testVerisiTurleriniListele(vt: Veritabani, projeId: string): TestVerisiTuru[];
export declare function profilHassasliginiDonustur(vt: Veritabani, turId: string, yeniHassaslik: Map<string, boolean>): number;
export declare function testVerisiTuruSil(vt: Veritabani, id: string): boolean;
export declare function testVerisiProfiliKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; turId: string; ortamId?: string | null; ad: string; degerler: Record<string, TestVerisiDegeri>; yapan?: string;
}): string;
export declare function testVerisiProfiliGetir(vt: Veritabani, id: string, secenekler?: { coz?: boolean }): TestVerisiProfili | undefined;
export declare function testVerisiProfilleriniListele(vt: Veritabani, projeId: string, turId?: string): TestVerisiProfili[];
export declare function testVerisiProfiliSil(vt: Veritabani, id: string, yapan?: string): boolean;

export declare function ekranKaydet(vt: Veritabani, girdi: { id?: string; projeId: string; anahtar: string; ad: string; aciklama?: string | null; ayarlar?: Record<string, unknown> }): string;
export declare function ekranlariListele(vt: Veritabani, projeId: string, secenekler?: { silinenlerDahil?: boolean }): Ekran[];
export declare function ekranAyarlariniGetir(vt: Veritabani, ekranId: string): Record<string, unknown> | undefined;
export declare function ekranModeliEkle(vt: Veritabani, girdi: { ekranId: string; model: Record<string, unknown>; aciklama?: string | null }): { id: string; surum: number };
export declare function ekranModeliGetir(vt: Veritabani, ekranId: string, surum?: number): EkranModeli | undefined;

export declare function senaryoKaydet(vt: Veritabani, girdi: {
  id?: string; projeId: string; ekranId?: string | null; baslik: string; icerik: Record<string, unknown>; kosuyaDahil?: boolean; yapan?: string;
}): string;
export declare function senaryoGetir(vt: Veritabani, id: string): Senaryo | undefined;
export declare function senaryolariListele(vt: Veritabani, filtre: { projeId: string; ekranId?: string; kosuyaDahil?: boolean }): Senaryo[];
export declare function senaryoKosuyaDahilAyarla(vt: Veritabani, id: string, dahil: boolean, yapan?: string): string;
export declare function senaryoSil(vt: Veritabani, id: string, yapan?: string): boolean;
export declare function degisiklikGecmisiListele(vt: Veritabani, varlikTuru: string, varlikId: string): GecmisKaydi[];

export declare function kosuOlustur(vt: Veritabani, girdi: { id?: string; projeId?: string | null; ortamId?: string | null; tur?: string }): string;
export declare function kosuBitir(vt: Veritabani, id: string, girdi: { durum: string; ozet?: Record<string, unknown> }): void;
export declare function kosuSonucuEkle(vt: Veritabani, girdi: {
  kosuId: string; senaryoId?: string | null; senaryoBaslik: string; durum: string; sureMs?: number | null;
  hataMesaji?: string | null; ekler?: Record<string, unknown>; baslangic?: string | null; bitis?: string | null;
}): string;
export declare function kosulariListele(vt: Veritabani, filtre?: { projeId?: string; limit?: number }): Kosu[];
export declare function kosuSonuclariniListele(vt: Veritabani, kosuId: string): KosuSonucu[];

export interface KaynakEslemesi {
  id: string; projeId: string; varlikTuru: string; kaynakAnahtari: string; varlikId: string;
  /** Şifreli özet (zarf); çözmek için kaynakOzetiniCoz. */
  kaynakOzetiZarfi: string | null;
  olusturulma: string; guncellenme: string;
}
export declare function kaynakEslemeleriniListele(vt: Veritabani, projeId: string, varlikTuru?: string): KaynakEslemesi[];
export declare function kaynakEslemesiYaz(vt: Veritabani, girdi: {
  id: string; projeId: string; varlikTuru: string; kaynakAnahtari: string; varlikId: string; kaynakOzeti: string | null;
}): void;
export declare function kaynakEslemesiSil(vt: Veritabani, projeId: string, varlikTuru: string, kaynakAnahtari: string): void;
export declare function kaynakOzetiniCoz(vt: Veritabani, zarf: string | null): string | null;
