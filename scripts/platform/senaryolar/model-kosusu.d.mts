// scripts/platform/senaryolar/model-kosusu.mjs için tip bildirimi.

export declare const MODEL_SPEC_DOSYASI: string;
export declare const MODEL_ETIKET_ON_EKI: string;
export declare const YASAK_ADRES_DEGISKENI: string;
export declare const YUKLEME_KLASORU_DEGISKENI: string;
export declare const DOLDURULABILIR_TIPLER: readonly string[];

export declare function modelSenaryosuMu(icerik: unknown): boolean;
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

/** secici yoksa ve sureSn varsa süreli bekleme (koşucu sureSn saniye bekler). */
/** durum 'dolu': öğenin metni / değeri boş olmayana kadar (ör. kimlik sorgusunun ad-soyadı). */
export type PlanAksiyonu = { tur: 'tikla' | 'bekle'; secici?: string; metin?: string; durum?: 'gorunur' | 'gizli' | 'dolu'; aciklama?: string; zamanAsimiSn?: number; sureSn?: number };

export type PlanBasariGostergesi = { tur: 'metin' | 'eleman' | 'url' | 'desen'; deger: string; secici?: string };

export type PlanKosuTanimi = {
  aksiyonlar?: PlanAksiyonu[];
  /** desen: öğenin (yoksa sayfanın) metni bu düzenli ifadeye uyar (ör. "[1-9]" — sıfırdan farklı toplam). */
  /** veya: seçeneklerden herhangi biri görünürse başarılı. */
  basariGostergesi?: PlanBasariGostergesi | { tur: 'veya'; secenekler: PlanBasariGostergesi[] };
  hataGostergesi?: { secici: string };
  /** Adımda kabul edilen iş kuralı uyarıları: başarı beklenirken biri görünürse test hemen başarısız. */
  uyarilar?: Array<{ metin: string; secici?: string }>;
  zamanAsimiSn?: number;
  /** Ekran modelinde "Ekran görüntüsü al" işareti (adım görüntüleri "Seçili adımlarda" iken yalnız bu adımlarda alınır). */
  ekranGoruntusu?: boolean;
  not?: string;
};

export type PlanAdimi = {
  /** Ortak akıştan açılan adım yalnızca test ortamında koşar (canlıda atlanır). */
  yalnizTest?: boolean;
  /** Ortak akıştan açılan adımın ortak akış adı. */
  ortakAkisAdi?: string;
  /** SQL sorgusu adımı: koşucu veritabanı sorgusunu beklenenle karşılaştırır. */
  sql?: import('../sql/sql-adimi.mjs').SqlTanimi;
  /** İndirilen dosyayı doğrulama adımı: tetikleyici düğmeye basılır, indirilen dosya beklentilerle doğrulanır. */
  dosya?: import('../dosyalar/dosya-icerigi.mjs').DosyaTanimi;
  /** Yeniden giriş adımı: oturum kapatılıp ortamın tarifiyle yeniden girilir (profil: giriş profilinin adı; null = ortamın varsayılanı). */
  yenidenGiris?: { profil: string | null };
  id: string;
  baslik: string;
  sira: number;
  dahil: boolean;
  alanlar: PlanAlani[];
  kosu: PlanKosuTanimi | null;
  sonAdim: boolean;
};

/** mesajlar: beklenen uyarılar (herhangi biri; tek mesajda [mesaj]). */
export type BeklenenModelSonucu = { tur: 'basari' } | { tur: 'hata'; adim: string; mesaj: string; mesajlar: string[] };

export type ModelKosuPlani = {
  ekranUrl: string;
  adimlar: PlanAdimi[];
  beklenen: BeklenenModelSonucu;
  baglamProfili: string | null;
  hatalar: string[];
};

/** "bugun", "bugun+7" → biçimli tarih (Europe/Istanbul); göreli değilse null. */
export declare function goreliTarih(ifade: string, bicim?: string, simdi?: Date): string | null;
export declare function modelKosuPlani(
  model: unknown,
  veri: Record<string, unknown>,
  secenekler?: { altModeller?: Record<string, unknown>; mutlakaGorunmeli?: string[]; kimlikProfilleri?: Record<string, Record<string, Record<string, unknown>>>; simdi?: Date }
): ModelKosuPlani;

export declare function secenekBul(secenekler: PlanSecenegi[], deger: unknown): { deger: string; metin: string; secici: string | null };

export declare function yuklemeDosyasiYolu(
  deger: unknown,
  klasor: string,
  birlestir: (a: string, b: string) => string
): { yol: string } | { hata: string };

/** Metindeki bilinen gizli değerleri maskeler (3 karakterden kısalar atlanır). */
export declare function gizliDegerleriMaskele(metin: string, gizliler: ReadonlyArray<unknown>): string;
/** Çözülemeyen tablo başvuruları → koşuyu durduran hata metni. */
export declare function veriHatalariMetni(baslik: string, hatalar: ReadonlyArray<{ alan: string; mesaj: string }>): string;
