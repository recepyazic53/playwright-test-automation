// scripts/platform/entegrasyonlar/servis.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { BaglantiDurumu, BaglantiGorunumu } from './depo.mjs';
import type { IstekOrtami } from './katalog.mjs';
import type { DbeaverBaglantisi } from './dbeaver.mjs';
import type { SorguSonucu } from './veritabani-suruculeri.mjs';

export declare const EK_TOPLAM_SINIRI: number;
export declare function istekOrtami(vt: Veritabani): IstekOrtami;
export declare function denemeHedefi(vt: Veritabani, projeId: string, g: Record<string, unknown>): { adres: string; aciklama: string };
export declare function baglantiDene(vt: Veritabani, projeId: string, g: Record<string, unknown>): Promise<{ sonuc: BaglantiDurumu | null }>;
export declare function kosuBittiBildir(vt: Veritabani, kosuId: string, s?: { baglantiIdleri?: string[] }):Promise<Array<{ baglantiId: string; basarili: boolean; mesaj: string }>>;
export declare function hataKaydiOnizle(vt: Veritabani, projeId: string, sonucId: string, baglantiId: string): {
  baglanti: { id: string; ad: string }; hedef: string; baslik: string; aciklama: string; medya: Array<{ id: string; tur: string; ad: string; boyut: number }>;
};
export declare function hataKaydiAc(vt: Veritabani, projeId: string, g: Record<string, unknown>, secenekler: { medyaKlasoru: string }): Promise<{ anahtar: string; adres: string | null; uyarilar: string[] }>;
/**
 * Kayıtlı "Veritabanı bağlantısı" ile sorgu (ekran / servis akışlarındaki SQL adımı için). Parametreler SQL'de ":ad" ile yazılır.
 * Yalnız okuma açıkken (varsayılan) yalnız SELECT / WITH ile başlayan tek ifade çalışır. Hatalar gizli değer içermez.
 */
export declare function sorguCalistir(vt: Veritabani, baglantiId: string, sql: string, parametreler: Record<string, unknown> | null | undefined,
  secenekler?: { zamanAsimiMs?: number; satirSiniri?: number }): Promise<SorguSonucu>;
export declare function dbeaverOnizle(icerik: unknown): { baglantilar: DbeaverBaglantisi[] };
export declare function dbeaverEkle(vt: Veritabani, projeId: string, icerik: unknown, kaynakIdleri: unknown): { eklenen: BaglantiGorunumu[] };
