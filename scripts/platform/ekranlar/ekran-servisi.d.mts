// scripts/platform/ekranlar/ekran-servisi.mjs için tip bildirimi (arayüz yanıtları gevşek tiplidir).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import { DepoHatasi } from '../veritabani/depo.mjs';
import type { Bulgu, EtkiKaydi } from './model-farki.mjs';

type Nesne = Record<string, unknown>;

export declare class EkranDogrulamaHatasi extends DepoHatasi {
  constructor(mesaj: string, hatalar: Array<{ yer: string; mesaj: string }>);
  hatalar: Array<{ yer: string; mesaj: string }>;
}

export declare function modelAgaci(model: Nesne, altModeller?: Record<string, Nesne>): Nesne & { sayilar: Record<string, number>; profiller: string[] };
export declare function ekranListesi(vt: Veritabani, projeId: string): {
  ekranlar: Array<{ id: string; anahtar: string; ad: string; modelTuru: 'ekran' | 'altModel' | null; modelSurumu: number | null; adimSayisi: number; alanSayisi: number; senaryoSayisi: number; bekleyenAnaliz: { id: string; bulguSayisi: number; zaman: string } | null } & Nesne>;
  baglamProfilleri: Array<{ tur: string; ad: string }>;
};
export declare function ekranDetayi(vt: Veritabani, projeId: string, ekranId: string): Nesne & {
  surum: number | null;
  gecmis: Array<{ surum: number; aciklama: string | null; olusturulma: string; degisiklikSayisi: number | null }>;
  analiz: { bekleyen: Nesne | null; son: Nesne | null; reddedilenSayisi: number; sonBaglamProfilleri: string[]; kanitlar: Array<{ medyaId: string; ad: string } & Nesne> };
};
export declare function surumAyrintisi(vt: Veritabani, projeId: string, ekranId: string, surum: number): Nesne & { bulgular: Array<Bulgu & Nesne>; oncekiSurum: number | null };
export declare function paketOnizle(vt: Veritabani, projeId: string, paket: unknown, secenekler?: { ekranId?: string | null; mod?: 'yeni' | 'analiz' }): {
  gecerli: boolean; hatalar: Array<{ yer: string; mesaj: string }>; uyarilar: Array<{ yer: string; mesaj: string }>;
  hedef: { id: string; ad: string; anahtar: string; modelVar: boolean } | null;
  onizleme: (Nesne & { senaryolar: Array<{ indeks: number; baslik: string; sorunlar: unknown[]; varsayilanSecili: boolean } & Nesne>; gerekenAyarlar: Array<{ anahtar: string; durum: string } & Nesne> }) | null;
};
export declare function sayfaEkle(vt: Veritabani, projeId: string, paket: unknown, secenekler: { senaryoIndeksleri?: unknown; ortamIdleri?: unknown; medyaKlasoru: string; yapan?: string }): Promise<{ ekranId: string; surum: number; senaryoIdleri: string[]; kanitSayisi: number }>;
export declare function analizYukle(vt: Veritabani, projeId: string, ekranId: string, paket: unknown, secenekler: { medyaKlasoru: string }): Promise<{ analizId: string | null; bulguSayisi: number; gizlenenSayisi: number; uyarilar: Array<{ yer: string; mesaj: string }> }>;
export declare function analizGetir(vt: Veritabani, projeId: string, ekranId: string): Nesne & {
  guncelSurum: number | null;
  analiz: (Nesne & { id: string; durum: string; bulgular: Array<Bulgu & { karar: string | null }>; etki: EtkiKaydi[]; gizlenenSayisi: number; sonucSurum: number | null }) | null;
};
export declare function analizUygula(vt: Veritabani, projeId: string, ekranId: string, girdi: { analizId: unknown; kabul: unknown; red: unknown; yapan?: string }): { surum: number; yeniSurum: boolean; kabul: number; red: number; kararsiz: number };
export declare function analizIptal(vt: Veritabani, projeId: string, ekranId: string, analizId: unknown): { iptal: true };
export declare function reddedilenleriUnut(vt: Veritabani, projeId: string, ekranId: string): { unutulan: number };
export declare function topluDegerAta(vt: Veritabani, projeId: string, ekranId: string, girdi: { anahtar: unknown; deger: unknown; senaryoIdler: unknown; yapan?: string }): { guncellenen: number };
export declare function claudeDosyasiYaz(vt: Veritabani, projeId: string, ekranId: string, girdi: { tur: unknown; baglamProfilleri?: unknown; klasor: string; projeKoku: string; bulguId?: unknown }): { yol: string; tamYol: string; cumle: string };
