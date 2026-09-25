// scripts/platform/senaryolar/model-kosusu.mjs için tip bildirimi.

export declare const MODEL_SPEC_DOSYASI: string;
export declare const MODEL_ETIKET_ON_EKI: string;
export declare const YASAK_ADRES_DEGISKENI: string;
export declare const YUKLEME_KLASORU_DEGISKENI: string;
export declare const DOLDURULABILIR_TIPLER: readonly string[];

export declare function modelSenaryosuMu(
  icerik: unknown,
  s?: { kodEslemesiVar?: boolean; kodDosyasiVar?: (dosya: string) => boolean }
): boolean;
export declare function modelEtiketi(senaryoId: string): string;
export declare function modelGrepDeseni(senaryoId: string): string;
export declare function modelTestBasliklari(senaryolar: Array<{ id: string; baslik: string }>): Map<string, string>;

export type YasakDeseni = { kalip: string; desen: RegExp };
export declare function yasakDesenleri(metin: string | undefined | null): YasakDeseni[];
export declare function adresYasakliMi(adres: string | undefined | null, desenler: YasakDeseni[]): string | null;
export declare function yasakliAdresMesaji(adres: string, kalip: string): string;

export type PlanSecenegi = { deger: string; metin?: string | null; senaryoDegeri?: string; formMetni?: string; secici?: string };

export type PlanAlani = {
  id: string;
  etiket: string;
  anahtar: string;
  /** Doldurma türü (doldurucu "okluSecim" ise "okluSecim"; aksi halde alan tipi). */
  tip: string;
  doldurucu: string | null;
  deger: unknown;
  secici: string | null;
  yardimci: Record<string, string>;
  secenekler: PlanSecenegi[];
  parametreler: Record<string, unknown>;
  mutlakaGorunmeli: boolean;
  /** Doldurulamayacaksa nedeni (koşuda atlanan alan olarak kaydedilir). */
  atla: string | null;
  /** Değeri olmayan "mutlaka görünmeli" alanı: yalnızca görünürlüğü denetlenir. */
  yalnizGorunurluk?: boolean;
};

export type PlanAksiyonu = { tur: 'tikla' | 'bekle'; secici: string; metin?: string; durum?: 'gorunur' | 'gizli'; aciklama?: string; zamanAsimiSn?: number };

export type PlanKosuTanimi = {
  aksiyonlar?: PlanAksiyonu[];
  basariGostergesi?: { tur: 'metin' | 'eleman' | 'url'; deger: string; secici?: string };
  hataGostergesi?: { secici: string };
  zamanAsimiSn?: number;
  not?: string;
};

export type PlanAdimi = {
  id: string;
  baslik: string;
  sira: number;
  dahil: boolean;
  alanlar: PlanAlani[];
  kosu: PlanKosuTanimi | null;
  sonAdim: boolean;
};

export type BeklenenModelSonucu = { tur: 'basari' } | { tur: 'hata'; adim: string; mesaj: string };

export type ModelKosuPlani = {
  ekranUrl: string;
  adimlar: PlanAdimi[];
  beklenen: BeklenenModelSonucu;
  baglamProfili: string | null;
  hatalar: string[];
};

export declare function modelKosuPlani(
  model: unknown,
  veri: Record<string, unknown>,
  secenekler?: { altModeller?: Record<string, unknown>; mutlakaGorunmeli?: string[] }
): ModelKosuPlani;

export declare function secenekBul(secenekler: PlanSecenegi[], deger: unknown): { deger: string; metin: string; secici: string | null };

export declare function yuklemeDosyasiYolu(
  deger: unknown,
  klasor: string,
  birlestir: (a: string, b: string) => string
): { yol: string } | { hata: string };
