import type { Veritabani } from '../veritabani/baglanti.mjs';

export type PlanTablosu = {
  ad: string; tur: 'kayit' | 'liste'; sutunlar: Array<{ ad: string; gizli: boolean; karsiliklar: Record<string, { sayfa: string }> }>;
  satirlar: Array<Record<string, string | null>>; secilen: Record<string, string> | null;
  alanlar: Array<{ oturumAnahtar: string; sutun: string; etiket: string; degerli: boolean }>;
  /** Bağlı liste zinciri tablosu: halkaların etiketleri (üstten alta). */
  zincir?: string[];
};
/** baglam: kullanıcının seçtiği değerler (seçim alanları) ve alanın tüm seçenekleri — mevcut tabloya eklenen satırın adı için. */
export type KayitPlani = { satirAdi: string; tablolar: PlanTablosu[]; baglam?: Array<{ secilen: string; secenekler: string[] }> };
/**
 * Tablo başına karar: yeni / yeniAd / birlestir / bagla / sutunEkle / atla. eslesme (bagla, elle): plan sütunu → mevcut sütun ('' = yeni sütun);
 * sutunAdlari (yeni, yeniAd, sutunEkle): plan sütunu → yazılacak sütun adı (kullanıcı düzenledi).
 */
export type PlanSecimi = {
  tablolar?: Record<string, { islem: string; yeniAd?: string; hedefId?: string; eslesme?: Record<string, string>; sutunAdlari?: Record<string, string> }>; baglantilar?: string[];
};
export type YazilanTablo = {
  planAdi: string; ad: string; id: string; islem: string; eklenenSatir: number; eklenenSutun: number; hedef: (sutun: string) => string;
  pin: Record<string, string> | null; satirId: string | null; tur: 'kayit' | 'liste'; plan: PlanTablosu;
};
/** "Mevcut tabloya bağla" adayı: plan sütunu → mevcut sütun eşlemesi. */
export type SutunAdayi = {
  id: string; ad: string; eslesme: Array<{ plan: string; hedef: string; tur: 'birebir' | 'benzer' }>; yeniSutunlar: string[]; kesin: boolean;
  satirSayisi: number; eklenecekSatir: number; mevcutSatir: { id: string; ad: string } | null;
};
export type PlanOnizlemesi = {
  kaynak: 'hizli';
  /** Projenin tabloları (elle bağlama / yeni sütun için; değer yok). */
  mevcutTablolar: Array<{ id: string; ad: string; tur: 'kayit' | 'liste'; sutunlar: Array<{ ad: string; gizli: boolean }>; satirSayisi: number }>;
  tablolar: Array<{
    ad: string; tur: 'kayit' | 'liste'; aciklama: null; zincir: string[] | null;
    /** Mevcut tablo kimliği → (plan sütunu → ad olarak eşleşen sütun): elle bağlamada önseçim. */
    eslemeOnerileri: Record<string, Record<string, string>>; sutunlar: Array<{ ad: string; gizli: boolean; karsilikSayisi: number }>; satirSayisi: number; tekrarSayisi: number;
    ornek: Array<Array<string | null>>; bagliAlanlar: string[];
    bagla: SutunAdayi[];
    benzer: Array<{ id: string; ad: string; puan: number; eklenecekSatir: number }>;
    mevcut: { id: string; ad: string; sutunSayisi: number; satirSayisi: number; yeniSutunlar: string[]; eklenecekSatir: number } | null;
  }>;
  baglantilar: Array<{ alanId: string; alanEtiketi: string; tablo: string; sutun: string; modeldeVar: boolean; mevcut: { tablo: string; sutun: string } | null }>;
};
export type SenaryoOnerisi = {
  indeks: number; baslik: string; gerekce: string; varsayilanSecili: boolean;
  /** kaldirilanlar: önerinin dalında düzenlenemeyen (sayfanın doldurduğu) alanlar (oturum anahtarı): değerleri senaryoya yazılmaz. */
  alt: { degisiklikler: Array<{ planAdi: string; sutun: string; deger: string; etiket: string; oturumAnahtar: string }>; kaldirilanlar?: string[] } | null;
  /** Dalın açtığı, değeri olmayan alanların adları (değer üretilmez): seçilirse öneri "veri bekliyor" olarak koşu dışı kaydedilir. */
  veriGerekli: string[];
  /** veriGerekli'nin alanları (oturum anahtarı + o dalda sorulduğu ad). */
  eksikAlanlar: Array<{ anahtar: string; etiket: string }>;
};
export declare function veriBekleyenSatirlariYaz(vt: Veritabani, projeId: string, g: {
  satirAdi: string; ekranAdi: string; ekGizliAdlar?: ReadonlyArray<string>; alanlar: ReadonlyArray<{ anahtar: string; etiket: string; alan: Record<string, any> }>;
}): Array<{ anahtar: string; etiket: string; tabloId: string; tabloAdi: string; sutun: string; satirId: string }>;
export declare const VARSAYILAN_ONERI_SAYISI: number;
export declare const ZINCIR_EN_COK_SATIR: number;

export declare function adEslesmesi(alanAdi: unknown, sutunAdi: unknown): 'birebir' | 'benzer' | null;
export declare function sutunEslemesi(t: PlanTablosu, m: { sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }): SutunAdayi['eslesme'];
export declare function mevcutSutunAdaylari(
  t: PlanTablosu,
  mevcutlar: ReadonlyArray<{ id: string; ad: string; baglam?: boolean; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: ReadonlyArray<{ id?: string; ad?: string; degerler: Record<string, unknown> }> }>
): SutunAdayi[];
export declare function planKur(g: {
  baslik: string; alanlar: Array<Record<string, any>>; degerler: Record<string, { deger: unknown; kaynak?: string }>; ekGizliAdlar?: ReadonlyArray<string>;
  iliskiler?: ReadonlyArray<{ ust: string; alt: string }>;
  gozlemler?: ReadonlyArray<{ anahtar: string; secimler?: Record<string, unknown>; secenekler?: ReadonlyArray<{ deger: unknown; metin?: unknown }> }>;
}): KayitPlani;
export declare function planOnizle(vt: Veritabani, projeId: string, plan: KayitPlani, ekranId: string | null, anahtarlar: Record<string, string>): PlanOnizlemesi;
export declare function varsayilanSecim(onizleme: PlanOnizlemesi): { tablolar: Record<string, { islem: string; hedefId?: string }>; baglantilar: string[] };
export declare function planYaz(vt: Veritabani, projeId: string, plan: KayitPlani, secim: PlanSecimi, bilgi: { ekranAdi: string }): YazilanTablo[];
export declare function basvuruYaz(tabloAdi: string, sutun: string, etiket?: string): string;
export declare const KAYIT_ETIKETI: string;
export declare function pinSecimi(y: { satirId?: string | null; pin: Record<string, string> | null; tur: 'kayit' | 'liste'; plan?: { zincir?: string[] } }): Record<string, string> | null;
export declare function pinAnahtari(tabloId: string): string;
export declare function ikiliKapsam(boyutlar: ReadonlyArray<number>, enCok: number): number[][];
export declare function senaryoOnerileri(plan: KayitPlani, baslik: string, s?: {
  enCok?: number; alanlar?: Array<Record<string, any>>; iliskiler?: ReadonlyArray<{ ust: string; alt: string }>;
  gozlemler?: ReadonlyArray<{ anahtar: string; secimler: Record<string, string>; secenekler: ReadonlyArray<{ deger: string; metin?: string | null }> }>;
  degerler?: Record<string, unknown>;
}): SenaryoOnerisi[];
