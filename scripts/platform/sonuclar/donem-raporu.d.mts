// scripts/platform/sonuclar/donem-raporu.mjs için tip bildirimi (testlerde kullanılan kısım).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DonemSecimi } from './donem.mjs';

export type RaporGirdisi = {
  projeId: string; kapsam: 'ekran' | 'servis'; id: string; donem: DonemSecimi; karsilastir: boolean; ortamId: string | null;
  secenekler: { hatalar: boolean; adres: boolean; goruntuler: boolean }; aksiyonSayisi?: number;
};
export type RaporBaglami = {
  maskele: (m: unknown) => string; simdi?: Date;
  goruntuCoz?: (medya: Array<{ id: string; ad: string; icerikTuru: string; boyut: number }>) => Promise<Array<{ ad: string; icerikTuru: string; base64: string }>>;
};
export type RaporSorunu = {
  imza: string; tur: 'ekran' | 'servis'; baslik: string; nerede: string; kalip: string; kategori: string | null; hataTuru: string | null;
  sinif: string; dayanak: string; durum: string; n: number; nOnceki: number; maruz: number; maruzOnceki: number; oran: number; oranOnceki: number;
  senaryo: number; seri: number[]; oncekiSeri: number[]; ilk: string | null; son: string | null; acikGun: number; tekrarRozeti: boolean;
  puan: number; bant: 'P1' | 'P2' | 'P3'; aksiyon: string; sahip: string; neden: string;
};
export type AksiyonSatiri = { baslik: string; nerede: string; sinif: string; durum: string; puan: number; bant: string; aksiyon: string; sahip: string; neden: string; tur?: string };
export type EgilimKovasi = { etiket: string; adet: number; kalan: number; oran: number | null };
export type DonemRaporuVerisi = {
  tur: 'ekran' | 'servis'; olusturma: string; proje: { id: string; ad: string }; ortam: { id: string; ad: string; adres: string | null } | null;
  karsilastir: boolean; secenekler: { hatalar: boolean; adres: boolean; goruntuler: boolean }; esikler: { yesil: number; sari: number };
  donem: { tur: string; gun: number; etiket: string; oncekiEtiket: string; kirilim: 'gunluk' | 'haftalik'; bas: string; bit: string; kovaEtiketleri: string[]; oncekiKovaEtiketleri: string[] };
  oge: { id: string; ad: string; senaryoSayisi: number; servisTuru?: string; metotSayisi?: number };
  kosuVar: boolean; ozet: Record<string, any>; sorunlar: RaporSorunu[]; aksiyonlar: AksiyonSatiri[];
  bantSayim: { P1: number; P2: number; P3: number }; durumSayim: Record<string, number>; rozet: { durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string };
  maddeler: Array<['iyi' | 'kotu' | 'oneri', string]>; egilim: { kovalar: EgilimKovasi[]; oncekiOrt: number | null };
  ekran?: {
    senaryolar: Array<{ anahtar: string; ad: string; kosu: number; basari: number | null; oncekiBasari: number | null; hepAtlandi: boolean; hicKosmadi: boolean;
      ortSure: number | null; p95: number | null; kararlilik: { durum: string; oran: number; kosu: number } | null }>;
    matris: { etiketler: string[]; satirlar: Array<{ ad: string; dizi: string; not: string }> };
    isiHaritasi: Array<{ ad: string; seri: number[] }>;
    sonHata: { senaryo: string; adim: string; zaman: string | null; ortam: string | null; beklenen: string | null; gorulen: string | null; metin: string;
      goruntuler: Array<{ ad: string; icerikTuru: string; base64: string }> } | null;
    yakalanan: Array<{ kaynak: string; kalip: string; sayi: number; test: number; kalanTest: number }>;
    kapsam: { senaryo: number; kosuyaDahil: number; hicKosmayan: number; hepAtlanan: number; modelSurumu: { surum: number; tarih: string } | null };
  };
  servis?: {
    metotlar: Array<{ ad: string; senaryo: number; cagri: number; basari: number | null; oncekiBasari: number | null; p50: number | null; p95: number | null;
      p99: number | null; n: number; oncekiP95: number | null; yavas: boolean; son: string | null; kalan: number }>;
    hataMatrisi: Array<{ metot: string; sayilar: Record<string, number>; toplam: number; onceki: number }>;
    sureEgilimi: { p50: Array<number | null>; p95: Array<number | null>; oncekiP95: number | null };
    kontrolTurleri: Array<{ tur: string; etiket: string; toplam: number; gecen: number }>;
    kalanKontroller: Array<{ etiket: string; sayi: number }>;
    akislar: Array<{ ad: string; tur: string; adim: number; kosu: number; basari: number | null; oncekiBasari: number | null; ortSure: number | null; son: string | null }>;
  };
};
export declare const KONTROL_ETIKETLERI: Readonly<Record<string, string>>;
export declare function kontrolEtiketi(k: { tur?: unknown; ad?: unknown }): string;
export declare function servisMetodu(icerik: Record<string, unknown> | undefined): string;
export declare function servisHatasi(durum: string, sonuc: Record<string, unknown>, maskele: (m: unknown) => string): { hataTuru: string; kalip: string };
export declare function donemRaporuVerisi(vt: Veritabani, g: RaporGirdisi, b: RaporBaglami): Promise<DonemRaporuVerisi>;
